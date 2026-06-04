/** 海报强调词字体颜色（黑底上醒目的珊瑚橙） */
export const DEFAULT_ON_IMAGE_ACCENT_COLOR = "#FF7A45";

/** 从正文中提取 #话题 标签（不含 # 前缀） */
export function extractHashtags(text: string): string[] {
  const tags: string[] = [];
  const re = /#([^\s#]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const t = m[1]?.trim();
    if (t && !tags.includes(t)) tags.push(t);
  }
  return tags;
}

/** 去掉正文中的 #话题 标签 */
export function stripHashtags(text: string): string {
  return text.replace(/#([^\s#]+)/g, "").replace(/\s+/g, " ").trim();
}

/** 按句号/叹号/问号拆成句子（保留句末标点） */
export function splitSentences(text: string): string[] {
  const cleaned = stripHashtags(text).replace(/\s+/g, " ").trim();
  if (!cleaned) return [];
  const parts = cleaned
    .split(/(?<=[。！？!?])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return parts;
}

/** 合并库里的 title / description（两字段可能只填其一或互相包含） */
export function mergePostProse(rawTitle: string, rawDescription: string): string {
  const desc = stripHashtags(rawDescription || "").trim();
  const title = stripHashtags(rawTitle || "").trim();
  if (!desc) return title;
  if (!title) return desc;
  if (desc.includes(title)) return desc;
  if (title.includes(desc)) return title;
  if (/[。！？!?]$/.test(desc)) return desc + title;
  return `${desc} ${title}`;
}

/**
 * 按抖音图文帖惯例拆分：
 * - 第 1 句 → 发布标题
 * - 第 2 句 → 发布正文 & 画面文案
 * - #xxx → 话题标签
 */
export function splitPublishCopy(
  rawTitle: string,
  rawDescription: string
): {
  publishTitle: string;
  publishBody: string;
  hashtags: string[];
  posterText: string;
} {
  const combinedRaw = [rawDescription, rawTitle].filter(Boolean).join("\n");
  const hashtags = extractHashtags(combinedRaw);
  const prose = mergePostProse(rawTitle, rawDescription);
  const sentences = splitSentences(prose);

  let publishTitle = sentences[0] || "";
  let publishBody = sentences[1] || "";

  if (sentences.length === 1) {
    const s = sentences[0];
    const commaIdx = s.indexOf("，");
    if (commaIdx > 0 && commaIdx <= 36 && s.length - commaIdx > 7) {
      publishTitle = s.slice(0, commaIdx + 1);
      publishBody = s.slice(commaIdx + 1).trim();
    } else {
      publishTitle = s;
      publishBody = "";
    }
  } else if (sentences.length > 2) {
    publishTitle = sentences[0];
    publishBody = sentences.slice(1).join("");
  }

  const posterText = publishBody || publishTitle;

  return {
    publishTitle,
    publishBody,
    hashtags,
    posterText,
  };
}

/** 发布用正文：正文 + 标签分行展示 */
export function formatPublishBody(body: string, hashtags: string[]): string {
  const clean = body.trim();
  if (!hashtags.length) return clean;
  const tagLine = hashtags.map((t) => `#${t}`).join(" ");
  return clean ? `${clean}\n\n${tagLine}` : tagLine;
}

/** 用于匹配高亮词（忽略换行导致的假断行） */
export function normalizePosterText(text: string): string {
  return text.replace(/\s+/g, "");
}

/** 去掉被更长词组包含的短高亮 */
export function pruneHighlightWords(
  words: string[],
  fullText: string,
  protect: string[] = []
): string[] {
  const norm = normalizePosterText(fullText);
  const valid = [
    ...new Set(
      words.filter((w) => w && (fullText.includes(w) || norm.includes(w)))
    ),
  ];
  valid.sort((a, b) => b.length - a.length);
  const kept: string[] = [];
  for (const w of valid) {
    if (kept.some((k) => w !== k && k.includes(w))) continue;
    const next = kept.filter((k) => !(w.includes(k) && k !== w));
    if (!next.includes(w)) next.push(w);
    kept.splice(0, kept.length, ...next);
  }
  for (const w of protect) {
    if (w && norm.includes(w) && !kept.includes(w)) kept.push(w);
  }
  return kept.slice(0, 8);
}

/** 标准画面主文案（复刻海报用，与发布标题/正文分离） */
export const DEFAULT_ON_IMAGE_COPY =
  "自从我发现这个频率的声音能阻止大脑胡思乱想后，现在几乎24小时都听它！真的是YYDS";

/** 画面 accent 字色强调词（仅改字体颜色，无底色块） */
export const DEFAULT_ON_IMAGE_HIGHLIGHTS = [
  "频率的声音",
  "胡思乱想后",
  "YYDS",
] as const;

export function resolveOnImageHighlights(fullText: string): string[] {
  const hits = DEFAULT_ON_IMAGE_HIGHLIGHTS.filter((w) => fullText.includes(w));
  if (hits.length) return [...hits];
  return guessHighlightWordsForPoster(fullText);
}

/** 默认画面文案 + 换行 + 强调词 */
export function getDefaultOnImagePayload(): {
  fullText: string;
  lines: string[];
  highlightWords: string[];
} {
  const fullText = DEFAULT_ON_IMAGE_COPY;
  return {
    fullText,
    lines: wrapPosterLines(fullText, 11, [...DEFAULT_ON_IMAGE_HIGHLIGHTS]),
    highlightWords: [...DEFAULT_ON_IMAGE_HIGHLIGHTS],
  };
}

/**
 * 海报换行：尽量不拆开强调词组（如「频率的声音」）
 */
export function wrapPosterLines(
  text: string,
  maxChars = 11,
  keepPhrases: string[] = [...DEFAULT_ON_IMAGE_HIGHLIGHTS]
): string[] {
  const t = text.trim();
  if (!t) return [];
  const lines: string[] = [];
  let start = 0;
  while (start < t.length) {
    let end = Math.min(start + maxChars, t.length);
    if (end < t.length) {
      for (const phrase of [...keepPhrases].sort((a, b) => b.length - a.length)) {
        const ps = t.indexOf(phrase, start);
        if (ps < 0) continue;
        const pe = ps + phrase.length;
        if (ps < end && end < pe) {
          end = ps > start ? ps : pe;
          break;
        }
      }
    }
    const chunk = t.slice(start, end).trim();
    if (chunk) lines.push(chunk);
    start = end;
  }
  return lines.map((l) => l.trim()).filter(Boolean);
}

/** @deprecated 使用 wrapPosterLines */
export function wrapExactPosterLines(
  text: string,
  charsPerLine = 9,
  keepPhrases?: string[]
): string[] {
  return wrapPosterLines(text, charsPerLine, keepPhrases ?? [...DEFAULT_ON_IMAGE_HIGHLIGHTS]);
}

/** 标准画面文案（固定句式 + accent 字色） */
export function exactOnImageFromPostBody(_posterText?: string): {
  fullText: string;
  lines: string[];
  highlightWords: string[];
} {
  return getDefaultOnImagePayload();
}

/** 根据正文内容推断海报 accent 强调词 */
export function guessHighlightWordsForPoster(fullText: string): string[] {
  const preferred = DEFAULT_ON_IMAGE_HIGHLIGHTS.filter((c) => fullText.includes(c));
  if (preferred.length) return [...preferred];
  const candidates = [
    "频率的声音",
    "胡思乱想后",
    "YYDS",
    "频率",
    "胡思乱想",
    "24小时",
    "NOW冥想",
  ];
  return pruneHighlightWords(
    candidates.filter((c) => fullText.includes(c)),
    fullText,
    [...DEFAULT_ON_IMAGE_HIGHLIGHTS]
  );
}

/** @deprecated 叙述拆行；新逻辑请用 splitPublishCopy */
export function postCopyToPosterLines(title: string, body: string, maxLines = 4): string[] {
  const { posterText } = splitPublishCopy(title, body);
  return wrapPosterLines(posterText, 11);
}

export function guessOnImageHeadline(title: string, body: string): string {
  return splitPublishCopy(title, body).posterText;
}

export function guessHighlightWords(
  lines: string[],
  hashtags: string[] = [],
  _body = ""
): string[] {
  return guessHighlightWordsForPoster(lines.join("\n"));
}
