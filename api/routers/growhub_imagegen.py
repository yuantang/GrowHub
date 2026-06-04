# -*- coding: utf-8 -*-
"""
GrowHub 图文内容生成模块
- 通过反向代理调用 PicTacticAgent (port 8019) 实现 AI 图片生成
- 通过 GrowHub 内置的 LLM 服务生成图文文案
- 将生成结果推入矩阵分发队列
"""

import base64
import httpx
import json
import logging
import os
import re
import time
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from sqlalchemy import text

from database.db_session import get_session
from api.auth import deps

# PicTacticAgent 服务地址（独立服务，需单独启动）
PICTACTIC_BASE_URL = "http://localhost:8019"
PICTACTIC_TIMEOUT = 120.0

# 复刻前是否调用视觉 LLM 分析参考图配色（默认关：省 10–40s，且已有固定黑底/珊瑚橙规则）
REPLICATE_INFER_POSTER_STYLE = os.getenv(
    "GROWHUB_REPLICATE_INFER_STYLE", "0"
).lower() in ("1", "true", "yes")

logger = logging.getLogger(__name__)

_INTERNAL_POSTER_NICK_PREFIXES = ("Plugin-", "plugin-", "CB-", "CB-DY-", "CB-dy-")

PICTACTIC_ENV_PATH = (
    Path(__file__).resolve().parents[2] / "MediaCrawlerPro" / "PicTacticAgent" / ".env"
)

REPLICATE_EDIT_PROMPT = (
    "Edit the attached reference image in place. Keep the exact same layout, borders, background, "
    "color palette, typography placement, and decorative elements. "
    "Do NOT generate new portraits, people, or unrelated scenes. "
    "Do NOT add social-media post titles, hashtags (#...), captions, or watermarks that are not "
    "already part of the poster layout. "
    "Only change existing headline/body text blocks ON the poster if instructed below. "
    "Emphasis on key phrases must use ACCENT FONT COLOR only (matching poster peach/salmon tone), "
    "NEVER yellow highlighter background blocks or colored rectangles behind text."
)

# 强调方式：仅改字体颜色（醒目珊瑚橙），禁止底色块
DEFAULT_ON_IMAGE_ACCENT_COLOR = "#FF7A45"

HIGHLIGHT_ACCENT_COLOR_RULES = f"""
=== EMPHASIS STYLE (CRITICAL) ===
Listed phrases must use VIVID accent font color {DEFAULT_ON_IMAGE_ACCENT_COLOR} (saturated coral-orange).
Accent text must be clearly more eye-catching (醒目) than the white body text — brighter and warmer.

FORBIDDEN for emphasis:
- Yellow/amber/highlighter BACKGROUND rectangles or bars behind text
- Colored boxes, stickers, or highlight tape behind glyphs
- Pale/beige accent that blends into a light background

Normal body text: pure white #FFFFFF on the BLACK inner card, bold, high contrast.
=== END EMPHASIS STYLE ===
"""

POSTER_TEXT_LAYOUT_RULES = """
=== TEXT LAYOUT (CRITICAL) ===
- Keep reference structure: peach/salmon OUTER border + BLACK inner card (do NOT change inner area to light blue).
- Every line is LEFT-aligned with ZERO leading spaces — the first character of line 1 touches the left text margin.
- Do NOT indent with spaces, do NOT center lines with space padding, do NOT add trailing spaces.
- Copy lines EXACTLY as given (same characters, same order); do not insert extra words like duplicate「的是」.
"""


def _build_poster_chrome_instructions(
    hide: bool = False,
    nickname: Optional[str] = None,
    top_date: Optional[str] = None,
    bottom_time: Optional[str] = None,
    bottom_day: Optional[str] = None,
) -> str:
    """参考图四角装饰：头像、@昵称、日期、底部时间 — 须替换，不可沿用参考图身份。"""
    lines = [
        "=== POSTER CORNER UI (REPLACE — do not keep reference avatar / @name / times) ===",
        "Reference posters often have: top-left circular avatar + @nickname + small date; "
        "bottom-left clock time + weekday label.",
    ]
    if hide:
        lines.append(
            "Erase or remove ALL corner decorations (avatar, nickname, top date, bottom time/weekday). "
            "Keep margins clean; do not leave ghost text from the reference."
        )
        return "\n".join(lines)

    lines.append(
        "Replace reference corner content with EXACT values below (same position, size, font style as reference):"
    )
    nick = (nickname or "").strip()
    if nick:
        lines.append(
            f"  - Top @nickname (replace reference @username with this EXACT Douyin display name): {nick}"
        )
    else:
        lines.append(
            "  - Top @nickname: must be the real publisher Douyin nickname from account pool, "
            "NOT Plugin-DY-xxx or internal client IDs"
        )
    if top_date:
        lines.append(f"  - Small date under nickname: {top_date}")
    if bottom_time:
        lines.append(f"  - Bottom-left time: {bottom_time}")
    if bottom_day:
        lines.append(f"  - Bottom-left weekday under time: {bottom_day}")
    lines.append(
        "  - Avatar circle: replace reference person's photo with a different neutral "
        "wellness/meditation themed avatar (NOT the same face as reference)."
    )
    lines.append("Do NOT leave the reference poster's original @name, date, or clock unchanged.")
    return "\n".join(lines)


def _build_accent_color_instructions(
    highlight_words: List[str],
    accent_color: str = DEFAULT_ON_IMAGE_ACCENT_COLOR,
) -> str:
    """为每个强调词生成「仅改字体颜色、无底色」的明确指令。"""
    if not highlight_words:
        return HIGHLIGHT_ACCENT_COLOR_RULES
    lines = [
        HIGHLIGHT_ACCENT_COLOR_RULES,
        "",
        f"Phrases that MUST use accent font color {accent_color} (字色强调, NO background block):",
    ]
    for w in highlight_words:
        lines.append(
            f'  - Color every character of「{w}」in vivid {accent_color} (even if split across lines); '
            f"font color only, NO background block"
        )
    return "\n".join(lines)


def _strip_hashtags_from_text(text: str) -> str:
    return re.sub(r"#\S+", "", text or "").strip()


def _extract_hashtags(text: str) -> List[str]:
    tags: List[str] = []
    for m in re.finditer(r"#([^\s#]+)", text or ""):
        t = (m.group(1) or "").strip()
        if t and t not in tags:
            tags.append(t)
    return tags


def _norm_copy(s: str) -> str:
    return re.sub(r"\s+", "", s or "").strip()


def _split_sentences(text: str) -> List[str]:
    cleaned = _strip_hashtags_from_text(text).strip()
    if not cleaned:
        return []
    parts = re.split(r"(?<=[。！？!?])", cleaned)
    return [p.strip() for p in parts if p.strip()]


def _merge_post_prose(raw_title: str, raw_description: str) -> str:
    desc = _strip_hashtags_from_text(raw_description or "").strip()
    title = _strip_hashtags_from_text(raw_title or "").strip()
    if not desc:
        return title
    if not title:
        return desc
    if title in desc:
        return desc
    if desc in title:
        return title
    if re.search(r"[。！？!?]$", desc):
        return desc + title
    return f"{desc} {title}"


def _split_publish_copy(raw_title: str, raw_description: str) -> Dict[str, Any]:
    """
    抖音图文帖惯例：第 1 句=标题，第 2 句=正文/画面文案，#=话题。
    title/description 任一字段可能存全文，需先合并再按句拆分。
    """
    combined = "\n".join([x for x in (raw_description, raw_title) if x])
    hashtags = _extract_hashtags(combined)

    prose = _merge_post_prose(raw_title, raw_description)
    sentences = _split_sentences(prose)

    publish_title = sentences[0] if sentences else ""
    publish_body = sentences[1] if len(sentences) > 1 else ""
    if len(sentences) == 1:
        s = sentences[0]
        comma_idx = s.find("，")
        if comma_idx > 0 and comma_idx <= 36 and len(s) - comma_idx > 7:
            publish_title = s[: comma_idx + 1]
            publish_body = s[comma_idx + 1 :].strip()
        else:
            publish_title = s
            publish_body = ""
    elif len(sentences) > 2:
        publish_title = sentences[0]
        publish_body = "".join(sentences[1:])

    poster_text = publish_body or publish_title
    return {
        "publish_title": publish_title,
        "publish_body": publish_body,
        "hashtags": hashtags,
        "poster_text": poster_text,
    }


def _deduped_publish_fields(
    raw_title: str,
    raw_body: str,
    extra_tags: Optional[List[str]] = None,
    prefer_tags: Optional[List[str]] = None,
) -> tuple:
    split = _split_publish_copy(raw_title or "", raw_body or "")
    tag_pool: List[str] = []
    for group in (prefer_tags or [], split["hashtags"], extra_tags or []):
        for t in group:
            t = str(t).lstrip("#").strip()
            if t and t not in tag_pool:
                tag_pool.append(t)
    return split["publish_title"], split["publish_body"], tag_pool


def _normalize_poster_text(text: str) -> str:
    return re.sub(r"\s+", "", text or "")


def _prune_highlight_words(
    words: List[str],
    full_text: str,
    protect: Optional[List[str]] = None,
) -> List[str]:
    """去掉被更长词组包含的短高亮；protect 中的词只要出现在文中就保留。"""
    norm = _normalize_poster_text(full_text)
    valid = list(
        dict.fromkeys(
            [
                w.strip()
                for w in words
                if w and (w.strip() in full_text or w.strip() in norm)
            ]
        )
    )
    valid.sort(key=len, reverse=True)
    kept: List[str] = []
    for w in valid:
        if any(w != k and w in k for k in kept):
            continue
        kept = [k for k in kept if not (k != w and k in w)]
        kept.append(w)
    for w in protect or DEFAULT_ON_IMAGE_HIGHLIGHTS:
        if w in full_text or w in norm:
            if w not in kept:
                kept.append(w)
    return kept[:8]


DEFAULT_ON_IMAGE_COPY = (
    "自从我发现这个频率的声音能阻止大脑胡思乱想后，"
    "现在几乎24小时都听它！真的是YYDS"
)
DEFAULT_ON_IMAGE_HIGHLIGHTS = ["频率的声音", "胡思乱想后", "YYDS"]


def _resolve_on_image_highlights(full_text: str) -> List[str]:
    hits = [w for w in DEFAULT_ON_IMAGE_HIGHLIGHTS if w in full_text]
    if hits:
        return hits
    return _guess_highlight_words_for_poster(full_text)


def _default_on_image_payload() -> Dict[str, Any]:
    lines = wrap_exact_poster_lines(DEFAULT_ON_IMAGE_COPY)
    return {
        "on_image_lines": lines,
        "on_image_text": DEFAULT_ON_IMAGE_COPY,
        "highlight_words": list(DEFAULT_ON_IMAGE_HIGHLIGHTS),
        "on_image_headline": lines[0] if lines else "",
    }


def wrap_exact_poster_lines(
    text: str,
    chars_per_line: int = 11,
    protect: Optional[List[str]] = None,
) -> List[str]:
    """按字数换行，尽量不拆开高亮词组（如「频率的声音」）。"""
    keep = protect or DEFAULT_ON_IMAGE_HIGHLIGHTS
    t = (text or "").strip()
    if not t:
        return []
    lines: List[str] = []
    start = 0
    n = len(t)
    while start < n:
        end = min(start + chars_per_line, n)
        if end < n:
            for phrase in sorted(keep, key=len, reverse=True):
                ps = t.find(phrase, start)
                if ps < 0:
                    continue
                pe = ps + len(phrase)
                if ps < end < pe:
                    end = ps if ps > start else pe
                    break
        chunk = t[start:end].strip()
        if chunk:
            lines.append(chunk)
        start = end
    return lines


def _sanitize_poster_lines(lines: List[str]) -> List[str]:
    """去掉行首行尾空格，避免生图出现缩进空白。"""
    out: List[str] = []
    for ln in lines:
        s = (ln or "").strip().strip("\u3000")
        if s:
            out.append(s)
    return out


DEFAULT_POSTER_VISUAL_STYLE = (
    "Preserve the reference poster: peach/salmon outer frame + BLACK inner card area. "
    "FORBIDDEN: light blue, sky blue, or pale pastel background inside the card. "
    "Main body: pure white #FFFFFF, bold, maximum legibility on black. "
    f"Accent phrases: vivid coral-orange {DEFAULT_ON_IMAGE_ACCENT_COLOR}, must pop against white and black. "
    "Never use yellow highlight bars."
)


def _guess_highlight_words_for_poster(full_text: str) -> List[str]:
    preferred = [w for w in DEFAULT_ON_IMAGE_HIGHLIGHTS if w in full_text]
    if preferred:
        return preferred
    candidates = [
        "频率的声音",
        "胡思乱想后",
        "YYDS",
        "频率",
        "胡思乱想",
        "24小时",
        "NOW冥想",
    ]
    return _prune_highlight_words(
        [c for c in candidates if c in full_text],
        full_text,
    )


def _post_copy_to_narrative_lines(title: str, body: str, max_lines: int = 4) -> List[str]:
    """按帖子叙述口吻拆行（抖音图文封面多为正文长句按逗号换行，非营销标题）。"""
    title = _strip_hashtags_from_text(title)
    body = _strip_hashtags_from_text(body)
    source = body if len(body) >= 16 else f"{title}，{body}".strip("，")

    if not source:
        return [title[:28]] if title else []

    clauses = [c.strip() for c in re.split(r"[，,]", source) if c.strip()]
    if not clauses:
        clauses = [source]

    lines: List[str] = []
    buf = ""
    for clause in clauses:
        if not buf:
            buf = clause
        elif len(buf) + 1 + len(clause) <= 26:
            buf = f"{buf}，{clause}"
        else:
            lines.append(buf if buf.endswith("，") else f"{buf}，")
            buf = clause
        if len(lines) >= max_lines:
            break
    if buf and len(lines) < max_lines:
        lines.append(buf.rstrip("，"))
    return lines[:max_lines] if lines else [source[:28]]


def _post_copy_to_poster_lines(title: str, body: str, max_lines: int = 4) -> List[str]:
    return _post_copy_to_narrative_lines(title, body, max_lines)


def _guess_highlight_words(
    lines: List[str], hashtags: Optional[List[str]] = None, body: str = ""
) -> List[str]:
    """仅从画面文案行中提取完整词组，不用泛化种子词。"""
    full_text = "\n".join(lines)
    candidates: List[str] = []

    for tag in hashtags or []:
        t = str(tag).lstrip("#").strip()
        if t and len(t) >= 2 and t in full_text:
            candidates.append(t)

    patterns = [
        r"精神内耗",
        r"循环听它",
        r"循环听",
        r"24小时",
        r"NOW\s*冥想",
        r"NOW冥想",
        r"冥想",
        r"频率",
        r"摆脱",
        r"焦虑",
        r"内耗",
    ]
    for pat in patterns:
        for m in re.finditer(pat, full_text, re.IGNORECASE):
            candidates.append(re.sub(r"\s+", "", m.group(0)))

    return _prune_highlight_words(candidates, full_text)


def _poster_nickname_needs_resolve(
    poster_account_id: Optional[str],
    poster_nickname: Optional[str],
    hide_chrome: bool,
) -> bool:
    """前端已带真实 @昵称 时不必再查库/抓抖音首页。"""
    if hide_chrome or not poster_account_id:
        return False
    nick = (poster_nickname or "").strip().lstrip("@")
    if not nick:
        return True
    return any(nick.startswith(p) for p in _INTERNAL_POSTER_NICK_PREFIXES)


async def _cover_url_to_data_uri(cover_url: str) -> str:
    """下载封面供视觉模型识别。"""
    if cover_url.startswith("data:"):
        return cover_url
    fetch_url = cover_url
    if cover_url.startswith("/api/growhub_imagegen/"):
        fetch_url = f"http://127.0.0.1:8040{cover_url}"
    elif cover_url.startswith("/"):
        fetch_url = f"http://127.0.0.1:8040{cover_url}"

    async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
        resp = await client.get(fetch_url)
        resp.raise_for_status()
        ctype = (resp.headers.get("content-type") or "image/jpeg").split(";")[0].strip()
        if not ctype.startswith("image/"):
            ctype = "image/jpeg"
        encoded = base64.b64encode(resp.content).decode("ascii")
        return f"data:{ctype};base64,{encoded}"


async def _extract_poster_from_cover(cover_url: str) -> Optional[Dict[str, Any]]:
    """从参考封面 OCR：画面上的行文案 + 黄/橙高亮词。"""
    from api.services.llm import call_llm_vision

    try:
        data_uri = await _cover_url_to_data_uri(cover_url)
    except Exception as exc:
        logger.warning("封面下载失败，跳过 OCR: %s", exc)
        return None

    prompt = """分析这张图文海报封面，只提取「便签/纸张」区域内的手写风格正文（忽略四角用户名、日期、Note 等装饰字）。

返回 JSON：
{
  "on_image_lines": ["按从上到下阅读顺序的每一行文字，保留标点"],
  "highlight_words": ["用蜜桃/珊瑚 accent 字色强调的完整词或短语（仅改字色、无底色块），必须是某行的子串"]
}
不要编造看不见的文字。只返回 JSON。"""

    try:
        raw = await call_llm_vision(prompt, data_uri, temperature=0.1, max_tokens=1500)
        cleaned = raw.replace("```json", "").replace("```", "").strip()
        try:
            data = json.loads(cleaned)
        except json.JSONDecodeError:
            match = re.search(r"\{.*\}", cleaned, re.DOTALL)
            if not match:
                return None
            data = json.loads(match.group(0))
        lines = [
            _strip_hashtags_from_text(str(x))
            for x in (data.get("on_image_lines") or [])
            if str(x).strip()
        ]
        if not lines:
            return None
        full = "\n".join(lines)
        hl = data.get("highlight_words") or []
        if isinstance(hl, str):
            hl = [h.strip() for h in re.split(r"[,，、]", hl) if h.strip()]
        highlights = _prune_highlight_words([str(h).strip() for h in hl], full)
        return {
            "on_image_lines": lines,
            "on_image_text": full,
            "highlight_words": highlights,
            "source": "cover_ocr",
        }
    except Exception as exc:
        logger.warning("封面 OCR 失败: %s", exc)
        return None


def _resolve_on_image_payload(
    result: Dict[str, Any],
    source_title: str,
    source_body: str,
    source_hashtags: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """统一解析仿写结果中的画面文案行 + 高亮词。"""
    lines_raw = result.get("on_image_lines")
    highlights_raw = (
        result.get("highlight_words")
        or result.get("on_image_highlight_words")
        or []
    )

    if isinstance(lines_raw, list) and lines_raw:
        lines = [_strip_hashtags_from_text(str(x)) for x in lines_raw if str(x).strip()]
    else:
        headline = _strip_hashtags_from_text(result.get("on_image_headline", "") or "")
        if headline and "\n" in headline:
            lines = [ln.strip() for ln in headline.split("\n") if ln.strip()]
        elif headline:
            lines = [headline]
        else:
            lines = _post_copy_to_poster_lines(source_title or "", source_body or "")

    full_text = "\n".join(lines)
    if isinstance(highlights_raw, str):
        highlights_raw = [h.strip() for h in re.split(r"[,，、\s]+", highlights_raw) if h.strip()]
    highlights = [str(h).strip() for h in (highlights_raw or []) if str(h).strip()]
    highlights = _prune_highlight_words(highlights, full_text)
    if not highlights:
        highlights = _guess_highlight_words(lines, source_hashtags, source_body or "")

    return {
        "on_image_lines": lines,
        "on_image_text": full_text,
        "highlight_words": highlights,
        "on_image_headline": lines[0] if lines else "",
    }


async def _infer_poster_visual_style(cover_url: str) -> Optional[str]:
    """根据参考封面推断文字/高亮配色，用于复刻生图 Prompt。"""
    from api.services.llm import call_llm_vision

    try:
        data_uri = await _cover_url_to_data_uri(cover_url)
    except Exception as exc:
        logger.warning("封面配色分析跳过: %s", exc)
        return None

    prompt = """分析这张图文海报上「便签/正文区域」的视觉样式，返回 JSON：
{
  "background_tone": "dark|light|mixed",
  "main_text_color": "white|black|custom",
  "highlight_shape": "background_block|text_color_only",
  "highlight_fill": "yellow/amber description or hex",
  "highlight_text_color": "color inside highlight bar",
  "style_instruction": "一句英文指令：主文字白色无底色；强调语仅用 peach accent FONT COLOR, no yellow background blocks"
}
只返回 JSON。"""
    try:
        raw = await call_llm_vision(prompt, data_uri, temperature=0.1, max_tokens=600)
        cleaned = raw.replace("```json", "").replace("```", "").strip()
        try:
            data = json.loads(cleaned)
        except json.JSONDecodeError:
            match = re.search(r"\{.*\}", cleaned, re.DOTALL)
            data = json.loads(match.group(0)) if match else {}
        instr = (data.get("style_instruction") or "").strip()
        if instr:
            return instr
        tone = data.get("background_tone", "")
        main_c = data.get("main_text_color", "")
        hl_fill = data.get("highlight_fill", "")
        hl_text = data.get("highlight_text_color", "")
        parts = []
        if tone:
            parts.append(f"Background is {tone}.")
        if main_c:
            parts.append(f"Main on-image text color: {main_c}, high contrast.")
        hl_shape = data.get("highlight_shape", "")
        parts.append(
            "Use accent FONT COLOR for emphasis phrases; do NOT add yellow highlighter background blocks."
        )
        if hl_text:
            parts.append(f"Accent phrase color hint: {hl_text}.")
        return " ".join(parts) if parts else None
    except Exception as exc:
        logger.warning("封面配色分析失败: %s", exc)
        return None


def _build_replicate_image_prompt(
    on_image_text: str,
    highlight_words: Optional[List[str]] = None,
    visual_style_hint: Optional[str] = None,
    poster_hide_chrome: bool = False,
    poster_nickname: Optional[str] = None,
    poster_top_date: Optional[str] = None,
    poster_bottom_time: Optional[str] = None,
    poster_bottom_day: Optional[str] = None,
    accent_color: str = DEFAULT_ON_IMAGE_ACCENT_COLOR,
) -> str:
    """仅把「画在图上的多行文案」交给图生图，强调词用 accent 字色（无底色块）。"""
    cleaned = _strip_hashtags_from_text(on_image_text)
    if not cleaned:
        return REPLICATE_EDIT_PROMPT + "\n\n" + DEFAULT_POSTER_VISUAL_STYLE

    flat = _normalize_poster_text(cleaned)
    lines = _sanitize_poster_lines(
        [ln for ln in cleaned.split("\n") if ln.strip()]
    )
    if not lines:
        lines = _sanitize_poster_lines(wrap_exact_poster_lines(cleaned))

    parts = [
        REPLICATE_EDIT_PROMPT,
        "",
        DEFAULT_POSTER_VISUAL_STYLE,
        POSTER_TEXT_LAYOUT_RULES,
    ]
    if visual_style_hint:
        parts.append(f"Reference-specific style: {visual_style_hint}")
    parts.append(
        _build_poster_chrome_instructions(
            hide=poster_hide_chrome,
            nickname=poster_nickname,
            top_date=poster_top_date,
            bottom_time=poster_bottom_time,
            bottom_day=poster_bottom_day,
        )
    )
    parts.append(
        "Replace the poster's MAIN body text (left-aligned, NO leading spaces per line):"
    )
    parts.append(f"  Full text (continuous): {flat}")
    for i, line in enumerate(lines, 1):
        parts.append(f"  Line {i} (exact, no spaces before/after):「{line}」")

    hl = _prune_highlight_words(
        list(highlight_words or []) or list(DEFAULT_ON_IMAGE_HIGHLIGHTS),
        cleaned,
        DEFAULT_ON_IMAGE_HIGHLIGHTS,
    )
    if not hl:
        hl = _guess_highlight_words_for_poster(flat)
    if hl:
        parts.append(_build_accent_color_instructions(hl, accent_color))
    parts.append(
        "Do not add hashtags, post captions, or extra text lines not listed above."
    )
    return "\n".join(parts)

REPLICATE_PROVIDER_HINT = (
    "模版版式 1:1 复刻需要 Gemini / JiekouAI / Gemini Web 的「图生图编辑」能力。"
    "MiniMax 的 subject_reference 仅用于人物长相一致，无法复刻图文海报版式，因此不会用于复刻模式。"
)

router = APIRouter(
    prefix="/growhub_imagegen",
    tags=["GrowHub - 图文生成"]
)


def rewrite_static_urls(data: Any) -> Any:
    """递归将 PicTactic 静态资源路径重写为 GrowHub 可访问的代理路径"""
    if isinstance(data, str):
        if data.startswith("/static/"):
            return data.replace("/static/", "/api/growhub_imagegen/static/")
        for prefix in ("http://localhost:8019", "http://127.0.0.1:8019"):
            if data.startswith(prefix + "/static/"):
                return data.replace(prefix, "").replace("/static/", "/api/growhub_imagegen/static/")
        return data
    elif isinstance(data, dict):
        return {k: rewrite_static_urls(v) for k, v in data.items()}
    elif isinstance(data, list):
        return [rewrite_static_urls(item) for item in data]
    return data


async def _prepare_template_images(urls: List[str]) -> List[str]:
    """将参考图转为 PicTactic 可消费的格式；外链下载为 base64 以便落盘到 /static/images/。"""
    prepared: List[str] = []
    async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
        for raw in urls:
            url = (raw or "").strip()
            if not url:
                continue
            if url.startswith("data:"):
                prepared.append(url)
                continue
            if url.startswith("/api/growhub_imagegen/static/"):
                prepared.append(url.replace("/api/growhub_imagegen/static/", "/static/"))
                continue
            if url.startswith("/static/"):
                prepared.append(url)
                continue

            fetch_url = url
            if url.startswith("/"):
                fetch_url = f"http://127.0.0.1:8040{url}" if url.startswith("/api/") else url

            if not fetch_url.startswith(("http://", "https://")):
                prepared.append(url)
                continue

            try:
                resp = await client.get(fetch_url)
                resp.raise_for_status()
                content_type = (resp.headers.get("content-type") or "image/jpeg").split(";")[0].strip()
                if not content_type.startswith("image/"):
                    content_type = "image/jpeg"
                encoded = base64.b64encode(resp.content).decode("ascii")
                prepared.append(f"data:{content_type};base64,{encoded}")
            except Exception as exc:
                logger.warning("无法拉取参考图 %s: %s", url, exc)
                raise HTTPException(
                    status_code=400,
                    detail=f"参考图下载失败，请换一张本地模版或重新上传封面: {exc}",
                )
    return prepared


def _load_pictactic_env() -> Dict[str, str]:
    """读取 PicTacticAgent .env（用于判断哪家图生图可用）。"""
    if not PICTACTIC_ENV_PATH.exists():
        return {}
    values: Dict[str, str] = {}
    for line in PICTACTIC_ENV_PATH.read_text(encoding="utf-8", errors="ignore").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        values[key.strip()] = val.strip().strip('"').strip("'")
    return values


def _is_placeholder_credential(value: str) -> bool:
    v = (value or "").strip().lower()
    return (
        not v
        or v.startswith("your-")
        or "api-key" in v
        or v.startswith("sk-your")
    )


def _resolve_replicate_provider(explicit: Optional[str]) -> str:
    """复刻模式必须走真正的图生图编辑，不能用 MiniMax 人物参考冒充版式复刻。"""
    if explicit:
        if explicit == "minimax":
            raise HTTPException(status_code=400, detail=REPLICATE_PROVIDER_HINT)
        return explicit

    env = _load_pictactic_env()
    if not _is_placeholder_credential(env.get("GEMINI_API_KEY", "")):
        return "gemini"
    if not _is_placeholder_credential(env.get("JIEKOUAI_API_KEY", "")):
        return "jiekouai"
    psid = env.get("GEMINI_WEB_SECURE_1PSID", "")
    psidts = env.get("GEMINI_WEB_SECURE_1PSIDTS", "")
    if psid and psidts and not _is_placeholder_credential(psid):
        return "gemini_web"
    raise HTTPException(status_code=400, detail=REPLICATE_PROVIDER_HINT)


# ─────────────────── Schemas ───────────────────

class ImageGenRequest(BaseModel):
    """图片生成请求"""
    prompt: str = Field(default="", description="图片描述 Prompt 或复刻时的内容替换说明")
    max_rounds: int = Field(default=2, ge=1, le=5)
    images_per_round: int = Field(default=3, ge=1, le=5)
    aspect_ratio: str = Field(default="9:16", description="图片比例: 1:1 / 3:4 / 16:9 / 9:16")
    size: str = Field(default="1K", description="图片质量: 1K / 2K")
    enhance_prompt: bool = Field(default=True, description="是否 AI 增强 Prompt")
    template_images: List[str] = Field(default_factory=list, description="参考图片 URL 列表")
    replicate_mode: bool = Field(
        default=False,
        description="模版一比一复刻：以 template_images 为参考图，尽量保持版式与风格一致",
    )
    on_image_text: Optional[str] = Field(
        default=None,
        description="仅替换海报画面上已有主文案（不含发布标题与 #话题）",
    )
    on_image_highlights: Optional[List[str]] = Field(
        default=None,
        description="海报画面上需 accent 字色强调的词/短语（仅改字体颜色，无底色块）",
    )
    on_image_accent_color: Optional[str] = Field(
        default=None,
        description="强调词字体颜色，默认 #FF7A45 珊瑚橙",
    )
    poster_account_id: Optional[str] = Field(
        default=None,
        description="发帖账号 ID，服务端解析真实抖音昵称用于海报 @昵称",
    )
    provider: Optional[str] = Field(
        default=None,
        description="生图引擎: gemini / jiekouai / minimax 等，复刻模式默认 gemini",
    )
    poster_hide_chrome: bool = Field(
        default=False,
        description="为 true 时去掉海报四角头像/昵称/时间装饰",
    )
    poster_nickname: Optional[str] = Field(
        default=None, description="替换左上角 @昵称，如 @Now冥想"
    )
    poster_top_date: Optional[str] = Field(
        default=None, description="替换昵称下方日期，如 06-04"
    )
    poster_bottom_time: Optional[str] = Field(
        default=None, description="替换左下角时间，如 22:39"
    )
    poster_bottom_day: Optional[str] = Field(
        default=None, description="替换左下角星期，如 Friday"
    )


class PostCopyRequest(BaseModel):
    """图文文案生成请求"""
    topic: str = Field(..., description="帖子主题/热点话题")
    platform: str = Field(default="dy", description="目标平台: xhs / dy / wb")
    style: str = Field(default="种草", description="文案风格: 种草/测评/干货/情感")
    hotspot_title: Optional[str] = Field(None, description="参考热点标题")
    hotspot_content: Optional[str] = Field(None, description="参考热点正文")
    brand_keywords: Optional[List[str]] = Field(None, description="品牌/产品关键词")
    extra_instructions: Optional[str] = Field(None, description="额外创作指令")


class ParaphraseCopyRequest(BaseModel):
    """爆款文案仿写：发布用标题/正文/标签与画面主文案分离"""
    source_title: Optional[str] = None
    source_body: Optional[str] = None
    source_hashtags: Optional[List[str]] = Field(default_factory=list)
    platform: str = Field(default="dy", description="xhs / dy / wb")
    brand_keywords: Optional[List[str]] = Field(None, description="需保留的品牌词")
    reference_cover_url: Optional[str] = Field(
        None, description="参考封面 URL，用于 OCR 对齐画面行数与高亮词"
    )
    preserve_original_on_image: bool = Field(
        default=False,
        description="为 true 时画面文案完全使用 source_body 原文，不仿写",
    )


class PublishFromImageGenRequest(BaseModel):
    """将图文内容推入分发队列"""
    task_title: str
    copy_title: str
    copy_body: str
    copy_hashtags: List[str] = Field(default_factory=list, description="发布话题标签，不入图")
    image_urls: List[str]
    account_id: Optional[str] = None
    platform: str = "dy"
    publish_time: Optional[str] = None
    video_url: Optional[str] = None


# ─────────────────── PicTacticAgent 代理 ───────────────────

async def _get_pictactic_api_key() -> Optional[str]:
    """从数据库获取 PicTacticAgent 的内部 API Key（若已配置）"""
    try:
        async with get_session() as session:
            result = await session.execute(
                text("SELECT config_value FROM growhub_system_configs WHERE config_key = 'pictactic_api_key'")
            )
            row = result.fetchone()
            if row and row[0]:
                val = row[0]
                if isinstance(val, str):
                    try:
                        return json.loads(val)
                    except Exception:
                        return val
                return val
    except Exception:
        pass
    return None


async def _call_pictactic(method: str, path: str, body: Optional[dict] = None) -> dict:
    """调用 PicTacticAgent API 并返回 JSON 结果"""
    api_key = await _get_pictactic_api_key()
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["X-API-Key"] = api_key

    async with httpx.AsyncClient(timeout=PICTACTIC_TIMEOUT) as client:
        try:
            if method == "GET":
                resp = await client.get(f"{PICTACTIC_BASE_URL}{path}", headers=headers)
            else:
                resp = await client.post(f"{PICTACTIC_BASE_URL}{path}", json=body, headers=headers)
            resp.raise_for_status()
            return resp.json()
        except httpx.ConnectError:
            raise HTTPException(
                status_code=503,
                detail="PicTacticAgent 服务未启动。请在 MediaCrawlerPro/PicTacticAgent 目录执行: ./start.sh"
            )
        except httpx.HTTPStatusError as e:
            raise HTTPException(status_code=e.response.status_code, detail=e.response.text)


# ─────────────────── 接口 ───────────────────

@router.get("/health")
async def health_check():
    """检测 PicTacticAgent 是否在线"""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{PICTACTIC_BASE_URL}/health")
            online = resp.status_code == 200
    except Exception:
        online = False

    replicate_provider: Optional[str] = None
    replicate_ready = False
    try:
        replicate_provider = _resolve_replicate_provider(None)
        replicate_ready = True
    except HTTPException:
        pass

    return {
        "pictactic_online": online,
        "pictactic_url": PICTACTIC_BASE_URL,
        "replicate_ready": replicate_ready,
        "replicate_provider": replicate_provider,
        "message": "PicTacticAgent 在线" if online else "PicTacticAgent 未启动，请先运行 ./start.sh",
    }


@router.get("/templates")
async def list_templates(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    category: Optional[str] = None,
    current_user: dict = Depends(deps.get_current_user)
):
    """获取 PicTacticAgent 精选提示词模板库（199 条）"""
    params = f"?page={page}&page_size={page_size}"
    if category:
        params += f"&category={category}"
    data = await _call_pictactic("GET", f"/api/v1/templates/{params}")
    
    # 字段转换，以适配前端 ImageGenTemplate 定义的 name 和 prompt
    if isinstance(data, dict) and "items" in data:
        for item in data["items"]:
            if "title" in item and "name" not in item:
                item["name"] = item["title"]
            if "prompt_text" in item and "prompt" not in item:
                item["prompt"] = item["prompt_text"]
            if "preview_image_url" in item and "cover_url" not in item:
                item["cover_url"] = item["preview_image_url"]
                
    return {"success": True, "data": rewrite_static_urls(data)}


@router.get("/published_posts")
async def list_published_posts(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: Optional[str] = None,
    current_user: dict = Depends(deps.get_current_user)
):
    """获取项目 'Now冥想抖音发帖' 下已发布的帖子列表，作为模版库提供给前端选择"""
    async with get_session() as session:
        # 1. 动态获取项目 ID
        proj_result = await session.execute(
            text("SELECT id FROM growhub_projects WHERE name = 'Now冥想抖音发帖' LIMIT 1")
        )
        row = proj_result.fetchone()
        project_id = row[0] if row else 15
        
        # 2. 构建查询（含视频链接与最近一次音频提取结果）
        query_str = """
            SELECT c.id, c.title, c.description, c.cover_url, c.video_url,
                   e.id AS extraction_id, e.status AS audio_status, e.bgm_local_path
            FROM growhub_contents c
            LEFT JOIN growhub_audio_extractions e ON e.id = (
                SELECT MAX(id) FROM growhub_audio_extractions
                WHERE content_id = c.id
            )
            WHERE c.project_id = :project_id
        """
        count_str = "SELECT count(*) FROM growhub_contents WHERE project_id = :project_id"
        params = {"project_id": project_id}
        
        if search:
            query_str += " AND (c.title LIKE :search OR c.description LIKE :search)"
            count_str += " AND (title LIKE :search OR description LIKE :search)"
            params["search"] = f"%{search}%"
            
        # 先查总数
        count_result = await session.execute(text(count_str), params)
        total = count_result.scalar() or 0
        
        # 排序与翻页
        query_str += " ORDER BY c.id DESC LIMIT :limit OFFSET :offset"
        params["limit"] = page_size
        params["offset"] = (page - 1) * page_size
        
        data_result = await session.execute(text(query_str), params)
        rows = data_result.fetchall()
        
        items = []
        for r in rows:
            split = _split_publish_copy(r[1] or "", r[2] or "")
            bgm_path = r[7] if len(r) > 7 else None
            bgm_url = None
            if bgm_path:
                if str(bgm_path).startswith("/"):
                    bgm_url = str(bgm_path)
                elif "static/" in str(bgm_path):
                    idx = str(bgm_path).find("static/")
                    bgm_url = "/" + str(bgm_path)[idx:]
            items.append({
                "id": r[0],
                "title": r[1] or "",
                "description": r[2] or "",
                "cover_url": r[3] or "",
                "video_url": r[4] or "",
                "audio_extraction_id": r[5] if len(r) > 5 else None,
                "audio_status": r[6] if len(r) > 6 else None,
                "bgm_url": bgm_url,
                "publish_title": split["publish_title"],
                "publish_body": split["publish_body"],
                "hashtags": split["hashtags"],
            })
            
        return rewrite_static_urls({
            "success": True,
            "data": {
                "items": items,
                "total": total,
                "page": page,
                "page_size": page_size
            }
        })


@router.post("/generate")
async def create_image_gen_task(
    req: ImageGenRequest,
    current_user: dict = Depends(deps.get_current_user)
):
    """
    创建图片生成任务（代理到 PicTacticAgent）
    
    返回 task_id，通过 GET /generate/{task_id} 轮询进度
    """
    raw_templates = [img for img in req.template_images if img and img.strip()]
    rep_t0 = time.perf_counter() if req.replicate_mode else None
    cleaned_templates = await _prepare_template_images(raw_templates)

    if req.replicate_mode:
        t0 = rep_t0 or time.perf_counter()
        t_prepare = time.perf_counter()
        if not cleaned_templates:
            raise HTTPException(
                status_code=400,
                detail="模版复刻模式需要至少一张参考图（模版封面或历史发帖封面）",
            )
        provider = _resolve_replicate_provider(req.provider)
        on_image = (req.on_image_text or req.prompt or "").strip()
        if not on_image:
            on_image = DEFAULT_ON_IMAGE_COPY
        style_hint = None
        t_infer = t_prepare
        if REPLICATE_INFER_POSTER_STYLE and cleaned_templates:
            style_hint = await _infer_poster_visual_style(cleaned_templates[0])
            t_infer = time.perf_counter()
        hl = req.on_image_highlights or list(DEFAULT_ON_IMAGE_HIGHLIGHTS)
        poster_nick = req.poster_nickname
        t_nick = t_infer
        if _poster_nickname_needs_resolve(
            req.poster_account_id, poster_nick, req.poster_hide_chrome
        ):
            from api.services.publish_profile import resolve_publish_nickname

            prof = await resolve_publish_nickname(
                req.poster_account_id,
                platform="dy",
                user_id=current_user.id,
            )
            if prof.get("nickname_display"):
                poster_nick = prof["nickname_display"]
        t_nick = time.perf_counter()
        accent = (req.on_image_accent_color or DEFAULT_ON_IMAGE_ACCENT_COLOR).strip()
        prompt = _build_replicate_image_prompt(
            on_image,
            hl,
            style_hint,
            poster_hide_chrome=req.poster_hide_chrome,
            poster_nickname=poster_nick,
            poster_top_date=req.poster_top_date,
            poster_bottom_time=req.poster_bottom_time,
            poster_bottom_day=req.poster_bottom_day,
            accent_color=accent,
        )

        # 走 PicTactic「图生图编辑」任务，而非带多轮评分的文生图工作流
        edit_payload = {
            "prompt": prompt,
            "source_images": cleaned_templates,
            "count": min(req.images_per_round, 3),
            "aspect_ratio": req.aspect_ratio,
            "size": req.size,
            "enhance_prompt": False,
            "provider": provider,
        }
        data = await _call_pictactic("POST", "/api/v1/generation/edit", edit_payload)
        t_done = time.perf_counter()
        logger.info(
            "replicate task created provider=%s prepare=%.2fs infer=%.2fs nick=%.2fs "
            "pictactic_post=%.2fs total=%.2fs prompt_chars=%d",
            provider,
            t_prepare - t0,
            t_infer - t_prepare,
            t_nick - t_infer,
            t_done - t_nick,
            t_done - t0,
            len(prompt),
        )
        return {"success": True, "data": rewrite_static_urls(data)}

    else:
        if not (req.prompt or "").strip():
            raise HTTPException(status_code=400, detail="请输入生图 Prompt 描述")
        payload = {
            "prompt": req.prompt.strip(),
            "max_rounds": req.max_rounds,
            "images_per_round": req.images_per_round,
            "aspect_ratio": req.aspect_ratio,
            "size": req.size,
            "enhance_prompt": req.enhance_prompt,
            "template_images": cleaned_templates,
            "enable_ai_scoring": req.max_rounds > 1,
        }
        if req.provider:
            payload["provider"] = req.provider

    data = await _call_pictactic("POST", "/api/v1/generation/", payload)
    return {"success": True, "data": rewrite_static_urls(data)}


@router.get("/generate/{task_id}")
async def get_image_task_status(
    task_id: str,
    current_user: dict = Depends(deps.get_current_user)
):
    """轮询图片生成任务进度"""
    data = await _call_pictactic("GET", f"/api/v1/generation/{task_id}")
    
    # 转换映射：使 PicTacticAgent (recent_images, completed) 结构适配前端 (results, success) 结构定义
    if isinstance(data, dict):
        status = data.get("status")
        if status == "completed":
            data["status"] = "success"
            
        recent_images = data.get("recent_images", [])
        results = []
        for img in recent_images:
            img_url = img.get("url", "")
            
            # 评分详情映射，前端使用 score.overall 或 score.aesthetic
            score_details = img.get("score_details") or {}
            if not score_details and "score" in img:
                score_details = {
                    "overall": img.get("score", 0.0),
                    "aesthetic": img.get("score", 0.0)
                }
            
            results.append({
                "image_url": img_url,
                "score": score_details
            })
        data["results"] = results

        err = data.get("error") or data.get("error_message")
        if not err and status in ("failed", "cancelled"):
            msg = data.get("message") or ""
            if msg and msg not in ("Generation failed", "生成失败"):
                err = msg
            elif status == "failed":
                err = msg or "生图任务失败，请查看 PicTacticAgent 日志"
        if err:
            data["error_message"] = err
        
    return {"success": True, "data": rewrite_static_urls(data)}


@router.get("/generate/{task_id}/result")
async def get_image_task_result(
    task_id: str,
    current_user: dict = Depends(deps.get_current_user)
):
    """获取图片生成完整结果（含所有图片 URL）"""
    data = await _call_pictactic("GET", f"/api/v1/generation/{task_id}/result")
    return {"success": True, "data": rewrite_static_urls(data)}


@router.post("/generate/{task_id}/cancel")
async def cancel_image_task(
    task_id: str,
    current_user: dict = Depends(deps.get_current_user)
):
    """取消正在运行的图片生成任务"""
    data = await _call_pictactic("POST", f"/api/v1/generation/{task_id}/cancel")
    return {"success": True, "data": rewrite_static_urls(data)}


@router.get("/publish_history")
async def get_publish_history(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(deps.get_current_user)
):
    """分页获取图文工作台推送到矩阵分发的历史记录列表"""
    offset = (page - 1) * page_size
    query_str = """
        SELECT t.*, a.account_name 
        FROM growhub_publish_tasks t
        LEFT JOIN growhub_accounts a ON t.account_id = a.id
        ORDER BY t.id DESC 
        LIMIT :limit OFFSET :offset
    """
    count_query_str = "SELECT COUNT(*) FROM growhub_publish_tasks"
    
    async with get_session() as session:
        count_result = await session.execute(text(count_query_str))
        total = count_result.scalar() or 0
        
        result = await session.execute(text(query_str), {
            "limit": page_size,
            "offset": offset
        })
        
        items = []
        for row in result.all():
            row_dict = dict(row._mapping)
            
            # 解析 assets_dir 中的 JSON
            assets_info = {}
            assets_dir_str = row_dict.get("assets_dir")
            if assets_dir_str:
                try:
                    assets_info = json.loads(assets_dir_str)
                except Exception:
                    pass
            
            # 从 assets_info 提取 image_urls 和 platform
            image_urls = assets_info.get("image_urls", [])
            platform_val = assets_info.get("platform", "")
            copy_title = assets_info.get("copy_title", "")
            copy_body = assets_info.get("copy_body", "")
            copy_hashtags = assets_info.get("copy_hashtags", [])
            
            # 后备提取逻辑
            content_body_str = row_dict.get("content_body") or ""
            if not copy_title:
                if content_body_str.startswith("【标题】"):
                    parts = content_body_str.split("\n\n")
                    if len(parts) > 1:
                        copy_title = parts[0].replace("【标题】", "").strip()
            
            if not copy_body:
                body_parts = content_body_str
                if body_parts.startswith("【标题】"):
                    parts = body_parts.split("\n\n")
                    if len(parts) > 1:
                        body_parts = "\n\n".join(parts[1:])
                cleaned_body = re.sub(r"#\w+", "", body_parts).strip()
                copy_body = cleaned_body if cleaned_body else body_parts.strip()
            
            if not copy_hashtags:
                found_tags = re.findall(r"#(\w+)", content_body_str)
                copy_hashtags = found_tags if found_tags else []
            
            # 格式化列表元素，适配前端展示
            items.append({
                "id": row_dict.get("id"),
                "task_title": row_dict.get("task_title") or "",
                "account_id": row_dict.get("account_id") or "",
                "account_name": row_dict.get("account_name") or "未设置账号",
                "content_body": row_dict.get("content_body") or "",
                "copy_title": copy_title,
                "copy_body": copy_body,
                "copy_hashtags": copy_hashtags,
                "status": row_dict.get("status") or "pending_generation",
                "post_url": row_dict.get("post_url") or "",
                "image_urls": image_urls,
                "platform": platform_val or "dy",
                "created_at": str(row_dict.get("created_at") or ""),
                "updated_at": str(row_dict.get("updated_at") or "")
            })
            
    return rewrite_static_urls({
        "success": True,
        "data": {
            "total": total,
            "page": page,
            "page_size": page_size,
            "items": items
        }
    })


@router.get("/publish_history/{task_id}")
async def get_publish_history_item(
    task_id: int,
    current_user: dict = Depends(deps.get_current_user)
):
    """根据任务 ID 获取单条图文发布历史详情"""
    query_str = """
        SELECT t.*, a.account_name 
        FROM growhub_publish_tasks t
        LEFT JOIN growhub_accounts a ON t.account_id = a.id
        WHERE t.id = :task_id
    """
    async with get_session() as session:
        result = await session.execute(text(query_str), {"task_id": task_id})
        row = result.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="未找到对应的发布历史记录")
        
        row_dict = dict(row._mapping)
        assets_info = {}
        assets_dir_str = row_dict.get("assets_dir")
        if assets_dir_str:
            try:
                assets_info = json.loads(assets_dir_str)
            except Exception:
                pass
        
        image_urls = assets_info.get("image_urls", [])
        platform_val = assets_info.get("platform", "")
        copy_title = assets_info.get("copy_title", "")
        copy_body = assets_info.get("copy_body", "")
        copy_hashtags = assets_info.get("copy_hashtags", [])
        
        # 后备提取逻辑
        content_body_str = row_dict.get("content_body") or ""
        if not copy_title:
            if content_body_str.startswith("【标题】"):
                parts = content_body_str.split("\n\n")
                if len(parts) > 1:
                    copy_title = parts[0].replace("【标题】", "").strip()
        
        if not copy_body:
            body_parts = content_body_str
            if body_parts.startswith("【标题】"):
                parts = body_parts.split("\n\n")
                if len(parts) > 1:
                    body_parts = "\n\n".join(parts[1:])
            cleaned_body = re.sub(r"#\w+", "", body_parts).strip()
            copy_body = cleaned_body if cleaned_body else body_parts.strip()
        
        if not copy_hashtags:
            found_tags = re.findall(r"#(\w+)", content_body_str)
            copy_hashtags = found_tags if found_tags else []

        item = {
            "id": row_dict.get("id"),
            "task_title": row_dict.get("task_title") or "",
            "account_id": row_dict.get("account_id") or "",
            "account_name": row_dict.get("account_name") or "未设置账号",
            "content_body": row_dict.get("content_body") or "",
            "copy_title": copy_title,
            "copy_body": copy_body,
            "copy_hashtags": copy_hashtags,
            "status": row_dict.get("status") or "pending_generation",
            "post_url": row_dict.get("post_url") or "",
            "image_urls": image_urls,
            "platform": platform_val or "xhs",
            "created_at": str(row_dict.get("created_at") or ""),
            "updated_at": str(row_dict.get("updated_at") or "")
        }
        
    return rewrite_static_urls({
        "success": True,
        "data": item
    })


@router.get("/proxy-remote")
async def proxy_remote_image(url: str = Query(..., description="外链图片 URL")):
    """代理外链图片（封面防盗链），供前端预览与缩略图使用"""
    if not url.startswith(("http://", "https://")):
        raise HTTPException(status_code=400, detail="仅支持 http/https 图片地址")
    async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
        try:
            resp = await client.get(url)
            if resp.status_code != 200:
                raise HTTPException(status_code=resp.status_code, detail="远程图片获取失败")
            content_type = resp.headers.get("Content-Type", "image/jpeg").split(";")[0].strip()
            if not content_type.startswith("image/"):
                content_type = "image/jpeg"
            return Response(
                content=resp.content,
                status_code=200,
                media_type=content_type,
                headers={"Cache-Control": "public, max-age=3600"},
            )
        except httpx.RequestError as e:
            raise HTTPException(status_code=503, detail=f"远程图片下载失败: {str(e)}")


@router.get("/static/{path:path}")
async def get_static_file(path: str):
    """Proxy static file requests (images, videos, templates) to PicTacticAgent"""
    url = f"{PICTACTIC_BASE_URL}/static/{path}"
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            resp = await client.get(url)
            if resp.status_code != 200:
                raise HTTPException(status_code=resp.status_code, detail="Resource not found")

            headers = {}
            if cache_control := resp.headers.get("Cache-Control"):
                headers["Cache-Control"] = cache_control

            return Response(
                content=resp.content,
                status_code=200,
                media_type=resp.headers.get("Content-Type", "application/octet-stream"),
                headers=headers,
            )
        except httpx.RequestError as e:
            raise HTTPException(status_code=503, detail=f"Failed to fetch resource: {str(e)}")


# ─────────────────── 图文文案生成 ───────────────────

PLATFORM_STYLE_GUIDE = {
    "xhs": {
        "name": "小红书",
        "style_hint": "笔记风格，多用 emoji，分点列出，结尾带话题标签 #xxx",
        "title_style": "吸睛标题（10-20字，有冲突/悬念/数字/情绪词）",
        "body_style": "200-500字，首段有钩子，分点清晰，口语化，个人体验感强",
        "hashtag_count": "5-10个",
    },
    "dy": {
        "name": "抖音",
        "style_hint": "口播脚本风格，节奏快，金句多，前3秒有强钩子",
        "title_style": "视频标题（10-15字，带争议/冲击/好奇心缺口）",
        "body_style": "100-300字口播文案，分段，每段15字以内，语气轻松",
        "hashtag_count": "3-5个",
    },
    "wb": {
        "name": "微博",
        "style_hint": "热议话题风格，简短有力，观点鲜明，引发转发",
        "title_style": "无需单独标题，开头即正文",
        "body_style": "140-500字，话题感强，带互动提问",
        "hashtag_count": "2-4个",
    },
}

STYLE_PROMPTS = {
    "种草": "像闺蜜/好友推荐一样，真诚分享使用体验，引发共鸣",
    "测评": "客观公正地对比优缺点，有数据/细节，建立专业信任",
    "干货": "提炼实用知识，结构清晰，读完有收获",
    "情感": "引发情感共鸣，有故事感，触动人心",
    "探店": "场景化描述，图文并茂，带地点标签",
}


@router.post("/copy/generate")
async def generate_post_copy(
    req: PostCopyRequest,
    current_user: dict = Depends(deps.get_current_user)
):
    """
    AI 生成图文帖子文案（标题 + 正文 + Hashtag + 配图 Prompt 建议）
    
    基于 GrowHub 内置 LLM 服务，无需 PicTacticAgent
    """
    from api.services.llm import call_llm

    platform_guide = PLATFORM_STYLE_GUIDE.get(req.platform, PLATFORM_STYLE_GUIDE["xhs"])
    style_hint = STYLE_PROMPTS.get(req.style, STYLE_PROMPTS["种草"])

    hotspot_ctx = ""
    if req.hotspot_title or req.hotspot_content:
        hotspot_ctx = f"""
【参考热点】
标题：{req.hotspot_title or '无'}
正文摘要：{(req.hotspot_content or '')[:500]}
（请借鉴热点的爆款逻辑，但重新创作，避免雷同）
"""

    brand_ctx = ""
    if req.brand_keywords:
        brand_ctx = f"\n需自然融入的关键词/产品：{', '.join(req.brand_keywords)}"

    extra_ctx = f"\n额外创作要求：{req.extra_instructions}" if req.extra_instructions else ""

    prompt = f"""你是一位资深的{platform_guide['name']}博主和内容运营专家。

请根据以下信息，为{platform_guide['name']}平台创作一篇完整的图文帖子。

【帖子主题】{req.topic}
【内容风格】{req.style} - {style_hint}
{hotspot_ctx}{brand_ctx}{extra_ctx}

【创作规范】
- 标题风格：{platform_guide['title_style']}
- 正文要求：{platform_guide['body_style']}
- 平台特点：{platform_guide['style_hint']}
- Hashtag数量：{platform_guide['hashtag_count']}

请同时提供：
- 「on_image_lines」：海报画面上 2~5 行短文案（从主题/正文拆行，每行≤28字，不含 # 话题）
- 「highlight_words」：需用 accent 字色强调的词（仅改字体颜色，无底色块），必须出现在 on_image_lines 中
- 「image_prompt_suggestion」：创意生图英文 Prompt（不要把发布标题和 hashtag 写进去）

请严格按照以下 JSON 格式返回：
{{
  "title": "帖子标题（发布用，不入图）",
  "body": "帖子正文（含emoji和分段，不含 # 话题）",
  "hashtags": ["话题标签1", "话题标签2"],
  "on_image_lines": ["海报行1", "海报行2"],
  "highlight_words": ["高亮词1"],
  "image_prompt_suggestion": "A photographic style image of ... (English, suitable for AI generation)",
  "image_prompt_zh": "配图建议（中文说明，给用户参考）",
  "writing_notes": "创作思路说明（简短）"
}}

只返回 JSON，不要其他内容。"""

    try:
        response = await call_llm(prompt, temperature=0.85, max_tokens=3000)

        # 解析 JSON
        cleaned = response.replace("```json", "").replace("```", "").strip()
        try:
            result = json.loads(cleaned)
        except json.JSONDecodeError:
            match = re.search(r'\{.*\}', cleaned, re.DOTALL)
            if match:
                result = json.loads(match.group(0))
            else:
                raise ValueError("AI 返回格式错误，无法解析 JSON")

        pub_title, pub_body, pub_tags = _deduped_publish_fields(
            result.get("title", ""),
            result.get("body", ""),
            result.get("hashtags", []),
        )
        return {
            "success": True,
            "data": {
                "title": pub_title,
                "body": pub_body,
                "hashtags": pub_tags,
                **_resolve_on_image_payload(
                    result,
                    req.topic,
                    (req.hotspot_content or req.topic or "")[:800],
                    result.get("hashtags") if isinstance(result.get("hashtags"), list) else [],
                ),
                "image_prompt_suggestion": result.get("image_prompt_suggestion", ""),
                "image_prompt_zh": result.get("image_prompt_zh", ""),
                "writing_notes": result.get("writing_notes", ""),
                "platform": req.platform,
                "style": req.style,
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"文案生成失败: {str(e)}")


async def _paraphrase_poster_aligned_to_cover(
    ref_poster: Dict[str, Any],
    source_title: str,
    source_body: str,
    brand_ctx: str,
) -> Dict[str, Any]:
    """按参考封面 OCR 的行数与高亮结构，用帖子正文做同义仿写。"""
    from api.services.llm import call_llm

    ref_lines = ref_poster.get("on_image_lines") or []
    ref_hl = ref_poster.get("highlight_words") or []
    n = len(ref_lines)

    prompt = f"""你是图文海报文案编辑。参考封面图上已有 {n} 行文案（行数不可增删）：
{json.dumps(ref_lines, ensure_ascii=False)}

参考图上用 accent 字色强调的完整词/短语（仅改字色、无底色块，仿写后须仍是完整词组）：
{json.dumps(ref_hl, ensure_ascii=False)}

请根据下列帖子内容，仿写为**恰好 {n} 行**画面文案（叙述口吻，按逗号断句，禁止改成「xxx克星」「特殊频率」等营销标题体）：
【帖子标题】{source_title or '无'}
【帖子正文】{(source_body or '')[:1200]}
{brand_ctx}

规则：
1. on_image_lines 长度必须 = {n}
2. 每行语义对应帖子正文，不是另写口号
3. highlight_words 对应参考图 accent 字色位置的完整词组，不要只输出「摆脱」「NOW」等碎片
4. 不要包含 # 话题

只返回 JSON：
{{"on_image_lines": [...], "highlight_words": [...]}}"""

    response = await call_llm(prompt, temperature=0.55, max_tokens=1200)
    cleaned = response.replace("```json", "").replace("```", "").strip()
    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", cleaned, re.DOTALL)
        if not match:
            raise ValueError("海报仿写 JSON 解析失败")
        data = json.loads(match.group(0))

    lines = [
        _strip_hashtags_from_text(str(x))
        for x in (data.get("on_image_lines") or [])
        if str(x).strip()
    ]
    if len(lines) != n:
        lines = _post_copy_to_narrative_lines(source_title, source_body, max_lines=n)
        while len(lines) < n and lines:
            lines.append(lines[-1])
        lines = lines[:n]

    full = "\n".join(lines)
    hl_raw = data.get("highlight_words") or ref_hl
    if isinstance(hl_raw, str):
        hl_raw = [h.strip() for h in re.split(r"[,，、]", hl_raw) if h.strip()]
    highlights = _prune_highlight_words([str(h).strip() for h in hl_raw], full)
    if not highlights:
        highlights = _guess_highlight_words(lines, None, source_body)

    return {
        "on_image_lines": lines,
        "on_image_text": full,
        "highlight_words": highlights,
        "on_image_headline": lines[0] if lines else "",
        "align_source": "cover_ocr_paraphrase",
    }


@router.post("/copy/paraphrase")
async def paraphrase_post_copy(
    req: ParaphraseCopyRequest,
    current_user: dict = Depends(deps.get_current_user),
):
    """
    对参考爆款文案做仿写：发布标题/正文/标签与海报画面主文案分离。
    有参考封面时先 OCR 对齐行数与高亮，再按帖子正文仿写。
    """
    from api.services.llm import call_llm

    platform_guide = PLATFORM_STYLE_GUIDE.get(req.platform, PLATFORM_STYLE_GUIDE["xhs"])
    brand_ctx = ""
    if req.brand_keywords:
        brand_ctx = f"\n必须自然保留的品牌/产品词：{', '.join(req.brand_keywords)}"

    src_tags = req.source_hashtags or []
    source_body = _strip_hashtags_from_text(req.source_body or "")
    exact_on_image = None
    split_src = _split_publish_copy(req.source_title or "", req.source_body or "")
    if req.preserve_original_on_image:
        exact_on_image = {
            **_default_on_image_payload(),
            "align_source": "brand_standard",
        }

    ref_poster = None
    if req.reference_cover_url:
        ref_poster = await _extract_poster_from_cover(req.reference_cover_url)

    publish_prompt = f"""你是{platform_guide['name']}爆款图文运营专家。请对下列帖子做仿写（仅发布用文案，不含画面海报字）：
{brand_ctx}

【参考标题】{req.source_title or '无'}
【参考正文】{(req.source_body or '')[:1200]}
【参考话题】{', '.join(src_tags) if src_tags else '无'}

要求：正文不要重复标题开头；hashtags 优先保留参考话题列表中的词。

返回 JSON：
{{
  "title": "发布标题",
  "body": "发布正文（不含 #，且不以标题全文开头）",
  "hashtags": ["话题1"],
  "paraphrase_notes": "简要说明"
}}
只返回 JSON。"""

    try:
        response = await call_llm(publish_prompt, temperature=0.75, max_tokens=1500)
        cleaned = response.replace("```json", "").replace("```", "").strip()
        try:
            result = json.loads(cleaned)
        except json.JSONDecodeError:
            match = re.search(r"\{.*\}", cleaned, re.DOTALL)
            if match:
                result = json.loads(match.group(0))
            else:
                raise ValueError("AI 返回格式错误")

        hashtags = result.get("hashtags") or src_tags
        if isinstance(hashtags, str):
            hashtags = [h.strip().lstrip("#") for h in hashtags.split() if h.strip()]

        notes = result.get("paraphrase_notes", "")
        if exact_on_image:
            on_image = exact_on_image
            notes = f"画面文案使用帖子原文；{notes}"
        elif ref_poster:
            try:
                on_image = await _paraphrase_poster_aligned_to_cover(
                    ref_poster,
                    req.source_title or "",
                    req.source_body or "",
                    brand_ctx,
                )
                notes = f"已按参考封面 OCR 对齐 {len(ref_poster.get('on_image_lines', []))} 行；{notes}"
            except Exception as exc:
                logger.warning("封面对齐仿写失败，使用 OCR 原文: %s", exc)
                on_image = {
                    **{k: ref_poster[k] for k in ("on_image_lines", "on_image_text", "highlight_words") if k in ref_poster},
                    "on_image_headline": (ref_poster.get("on_image_lines") or [""])[0],
                    "align_source": "cover_ocr_raw",
                }
                notes = f"仿写失败，暂用参考图原文: {exc}"
        else:
            poster_prompt = f"""你是{platform_guide['name']}爆款图文运营专家。根据帖子正文生成海报画面文案（叙述长句按逗号拆 2~4 行，禁止营销短标题体）。
{brand_ctx}
【参考标题】{req.source_title or '无'}
【参考正文】{(req.source_body or '')[:1200]}

返回 JSON：{{"on_image_lines": [...], "highlight_words": ["必须是完整词组且出现在某行"]}}
只返回 JSON。"""
            poster_resp = await call_llm(poster_prompt, temperature=0.65, max_tokens=1200)
            poster_clean = poster_resp.replace("```json", "").replace("```", "").strip()
            try:
                poster_json = json.loads(poster_clean)
            except json.JSONDecodeError:
                m = re.search(r"\{.*\}", poster_clean, re.DOTALL)
                poster_json = json.loads(m.group(0)) if m else {}
            on_image = _resolve_on_image_payload(
                poster_json,
                req.source_title or "",
                req.source_body or "",
                src_tags,
            )
            on_image["align_source"] = "post_narrative"

        pub_title, pub_body, pub_tags = _deduped_publish_fields(
            result.get("title", req.source_title or ""),
            result.get("body", req.source_body or ""),
            hashtags,
            prefer_tags=src_tags,
        )
        return {
            "success": True,
            "data": {
                "title": pub_title,
                "body": pub_body,
                "hashtags": pub_tags,
                **on_image,
                "paraphrase_notes": notes,
            },
        }
    except Exception as e:
        logger.exception("paraphrase failed, using rule-based fallback")
        lines = _post_copy_to_narrative_lines(req.source_title or "", req.source_body or "")
        if ref_poster and ref_poster.get("on_image_lines"):
            try:
                on_image = await _paraphrase_poster_aligned_to_cover(
                    ref_poster,
                    req.source_title or "",
                    req.source_body or "",
                    brand_ctx,
                )
            except Exception:
                on_image = {
                    "on_image_lines": ref_poster["on_image_lines"],
                    "on_image_text": ref_poster.get("on_image_text", ""),
                    "highlight_words": ref_poster.get("highlight_words", []),
                    "on_image_headline": ref_poster["on_image_lines"][0],
                    "align_source": "cover_ocr_raw",
                }
        else:
            full = "\n".join(lines)
            highlights = _guess_highlight_words(lines, src_tags, req.source_body or "")
            on_image = {
                "on_image_lines": lines,
                "on_image_text": full,
                "highlight_words": highlights,
                "on_image_headline": lines[0] if lines else "",
                "align_source": "fallback_narrative",
            }
        fb_title, fb_body, fb_tags = _deduped_publish_fields(
            req.source_title or "",
            req.source_body or "",
            src_tags,
            prefer_tags=src_tags,
        )
        return {
            "success": True,
            "data": {
                "title": fb_title,
                "body": fb_body,
                "hashtags": fb_tags,
                **on_image,
                "paraphrase_notes": f"LLM 不可用，已按帖子正文拆行: {str(e)[:80]}",
            },
        }


@router.get("/copy/extract_from_cover")
async def extract_poster_from_cover(
    cover_url: str = Query(..., description="参考封面 URL"),
    current_user: dict = Depends(deps.get_current_user),
):
    """仅从参考封面 OCR 画面文案与高亮词（不仿写）。"""
    data = await _extract_poster_from_cover(cover_url)
    if not data:
        raise HTTPException(status_code=400, detail="无法识别参考图上的文案，请换一张封面或检查网络")
    return {"success": True, "data": data}


# ─────────────────── 推入分发队列 ───────────────────

@router.post("/to_publish")
async def push_to_publish_queue(
    req: PublishFromImageGenRequest,
    current_user: dict = Depends(deps.get_current_user)
):
    """
    将图文生成结果推入矩阵分发队列（growhub_publish_tasks）
    """
    import json as json_lib
    
    # 恢复图片 URL 路径，以防写入任务队列时包含 API 代理前缀
    cleaned_urls = [
        url.replace("/api/growhub_imagegen/static/", "/static/")
        for url in req.image_urls
    ]
    
    async with get_session() as session:
        query = """
            INSERT INTO growhub_publish_tasks
            (task_title, account_id, content_body, assets_dir, status, publish_time)
            VALUES (:title, :acc, :body, :assets, 'pending_generation', :pub_time)
        """
        tag_line = " ".join(f"#{t.lstrip('#')}" for t in (req.copy_hashtags or []) if t)
        content_body = f"【标题】{req.copy_title}\n\n{req.copy_body}"
        if tag_line:
            content_body += f"\n\n{tag_line}"
        assets_info = json_lib.dumps({
            "image_urls": cleaned_urls,
            "platform": req.platform,
            "copy_title": req.copy_title,
            "copy_body": req.copy_body,
            "copy_hashtags": req.copy_hashtags or [],
            "publish_time": req.publish_time,
            "video_url": req.video_url,
        }, ensure_ascii=False)

        await session.execute(text(query), {
            "title": req.task_title,
            "acc": req.account_id,
            "body": content_body,
            "assets": assets_info,
            "pub_time": req.publish_time,
        })
        await session.commit()

    return {"success": True, "message": "已成功推入矩阵分发队列，请前往【矩阵分发】查看"}
