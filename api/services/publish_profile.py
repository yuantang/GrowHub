# -*- coding: utf-8 -*-
"""发布者资料：解析账号池中的真实平台昵称（用于海报 @昵称）。"""

import re
from typing import Any, Dict, List, Optional

import httpx

from api.services.account_pool import get_account_pool
from api.services.cookiebridge_sync import get_cookiebridge_sync_service

PLATFORM_CB_KEYS: Dict[str, str] = {
    "dy": "dy",
    "douyin": "dy",
    "xhs": "xhs",
    "ks": "ks",
    "bili": "bili",
    "wb": "wb",
}

# 内部账号名前缀，后缀不是抖音昵称
_INTERNAL_NAME_PREFIXES = ("Plugin-", "plugin-", "CB-")


def _tag_value(tags: Optional[List[str]], prefix: str) -> Optional[str]:
    for t in tags or []:
        if isinstance(t, str) and t.startswith(prefix):
            return t.split(":", 1)[1].strip()
    return None


def _parse_cb_style_name(account_name: str, cb_key: str) -> Optional[str]:
    """CB-DY-真实昵称 → 真实昵称"""
    name = (account_name or "").strip()
    if not name:
        return None
    upper = cb_key.upper()
    for prefix in (f"CB-{upper}-", f"CB-{cb_key}-"):
        if name.startswith(prefix):
            rest = name[len(prefix) :].strip()
            if rest and not rest.startswith("client"):
                return rest
    return None


def _is_internal_label(name: str) -> bool:
    return any(name.startswith(p) for p in _INTERNAL_NAME_PREFIXES)


async def _nickname_from_cookiebridge(client_id: str, cb_key: str) -> Optional[str]:
    try:
        status = await get_cookiebridge_sync_service().get_status()
    except Exception:
        return None
    if not status.get("reachable"):
        return None
    for client in status.get("clients") or []:
        if client.get("client_id") == client_id:
            nick = (client.get("nicknames") or {}).get(cb_key)
            if nick and str(nick).strip():
                return str(nick).strip()
    return None


async def _douyin_nickname_from_cookies(cookies: str) -> Optional[str]:
    """从抖音首页 HTML 解析当前登录用户昵称（无需 a_bogus）。"""
    if not cookies or len(cookies) < 20:
        return None
    headers = {
        "Cookie": cookies,
        "User-Agent": (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        ),
        "Referer": "https://www.douyin.com/",
    }
    try:
        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
            resp = await client.get("https://www.douyin.com/", headers=headers)
            if "passport.douyin.com" in str(resp.url):
                return None
            text = resp.text or ""
    except Exception:
        return None

    patterns = [
        r'"nickname"\s*:\s*"([^"\\]+)"',
        r'"nickName"\s*:\s*"([^"\\]+)"',
        r'"unique_id"\s*:\s*"([^"\\]+)"',
        r'"display_name"\s*:\s*"([^"\\]+)"',
    ]
    skip = {"", "0", "null", "undefined", "抖音用户"}
    for pat in patterns:
        for m in re.finditer(pat, text):
            val = (m.group(1) or "").strip()
            if val and val not in skip and len(val) <= 32:
                return val
    return None


def format_poster_at_nickname(nickname: str) -> str:
    n = (nickname or "").strip()
    if not n:
        return ""
    return n if n.startswith("@") else f"@{n}"


async def resolve_publish_nickname(
    account_id: str,
    platform: str = "dy",
    user_id: Optional[int] = None,
) -> Dict[str, Any]:
    """
    解析发帖账号在目标平台的真实昵称，供海报 @昵称 使用。
    禁止使用 Plugin-DY-xxx / client_id 等内部标识。
    """
    pool = get_account_pool()
    await pool.sync_from_db()
    acc = pool.get_account(account_id)
    if not acc:
        return {
            "nickname": "",
            "nickname_display": "",
            "source": "none",
            "warning": "账号不存在",
        }
    if user_id is not None and acc.user_id not in (None, user_id):
        return {
            "nickname": "",
            "nickname_display": "",
            "source": "forbidden",
            "warning": "无权访问该账号",
        }

    cb_key = PLATFORM_CB_KEYS.get(platform, platform)
    nick: Optional[str] = None
    source = "none"

    nick = _tag_value(acc.tags, "platform_nickname:")
    if nick:
        source = "tag"

    if not nick:
        client_id = _tag_value(acc.tags, "client_id:")
        if client_id:
            nick = await _nickname_from_cookiebridge(client_id, cb_key)
            if nick:
                source = "cookiebridge"

    if not nick:
        parsed = _parse_cb_style_name(acc.account_name, cb_key)
        if parsed:
            nick = parsed
            source = "account_name_cb"

    if not nick and cb_key == "dy" and acc.cookies:
        nick = await _douyin_nickname_from_cookies(acc.cookies)
        if nick:
            source = "douyin_html"

    if not nick and acc.account_name and not _is_internal_label(acc.account_name):
        nick = acc.account_name.strip()
        source = "account_name_plain"

    if not nick:
        return {
            "nickname": "",
            "nickname_display": "",
            "source": "unresolved",
            "warning": (
                "未能获取抖音昵称。请在 Chrome CookieBridge 扩展中登录抖音后，"
                "到「账号池」执行 CookieBridge 同步；或检查该账号 Cookie 是否有效。"
            ),
        }

    return {
        "nickname": nick,
        "nickname_display": format_poster_at_nickname(nick),
        "source": source,
    }
