# -*- coding: utf-8 -*-
"""
XiaoHongShu (XHS) Signer

Generates X-S, X-T, X-S-Common signatures for XiaoHongShu API requests.
"""

import hashlib
import json
import time
from typing import Dict, Any, Optional
from urllib.parse import quote

from playwright.async_api import Page

from .base import BaseSigner


def _b64_encode(data: bytes) -> str:
    """Base64 encode with custom alphabet"""
    import base64
    return base64.b64encode(data).decode("utf-8")


def _encode_utf8(s: str) -> bytes:
    """Encode string to UTF-8 bytes"""
    return s.encode("utf-8")


def _mrc(t: str) -> int:
    """Calculate MRC value (simplified)"""
    # This is a simplified version - the actual implementation may vary
    result = 0
    for char in t:
        result = (result * 31 + ord(char)) & 0xFFFFFFFF
    return result


def _get_trace_id() -> str:
    """Generate trace ID"""
    import random
    import string
    return ''.join(random.choices(string.hexdigits.lower(), k=32))


def _build_sign_string(uri: str, data: Optional[Dict] = None, method: str = "POST") -> str:
    """Build string to be signed"""
    if method.upper() == "POST":
        c = uri
        if data is not None:
            c += json.dumps(data, separators=(",", ":"), ensure_ascii=False)
        return c
    else:
        if not data or (isinstance(data, dict) and len(data) == 0):
            return uri
        if isinstance(data, dict):
            params = []
            for key in data.keys():
                value = data[key]
                if isinstance(value, list):
                    value_str = ",".join(str(v) for v in value)
                elif value is not None:
                    value_str = str(value)
                else:
                    value_str = ""
                value_str = quote(value_str, safe='')
                params.append(f"{key}={value_str}")
            return f"{uri}?{'&'.join(params)}"
        return uri


def _md5_hex(s: str) -> str:
    """Calculate MD5 hash"""
    return hashlib.md5(s.encode("utf-8")).hexdigest()


def _build_xs_payload(x3_value: str, data_type: str = "object") -> str:
    """Build x-s signature"""
    s = {
        "x0": "4.2.1",
        "x1": "xhs-pc-web",
        "x2": "Mac OS",
        "x3": x3_value,
        "x4": data_type,
    }
    return "XYS_" + _b64_encode(_encode_utf8(json.dumps(s, separators=(",", ":"))))


def _build_xs_common(a1: str, b1: str, x_s: str, x_t: str) -> str:
    """Build x-s-common header"""
    payload = {
        "s0": 3,
        "s1": "",
        "x0": "1",
        "x1": "4.2.2",
        "x2": "Mac OS",
        "x3": "xhs-pc-web",
        "x4": "4.74.0",
        "x5": a1,
        "x6": x_t,
        "x7": x_s,
        "x8": b1,
        "x9": _mrc(x_t + x_s + b1),
        "x10": 154,
        "x11": "normal",
    }
    return _b64_encode(_encode_utf8(json.dumps(payload, separators=(",", ":"))))


class XHSSigner(BaseSigner):
    """Signer for XiaoHongShu platform"""

    @property
    def platform(self) -> str:
        return "xhs"

    async def sign(
        self,
        page: Page,
        uri: str,
        data: Dict[str, Any],
        method: str = "POST",
        cookies: Dict[str, str] = None
    ) -> Dict[str, str]:
        """Generate XHS signature headers"""
        
        # Get a1 from cookies
        a1 = cookies.get("a1", "") if cookies else ""
        
        # Get b1 from localStorage
        try:
            local_storage = await page.evaluate("() => window.localStorage")
            b1 = local_storage.get("b1", "") if local_storage else ""
        except Exception:
            b1 = ""

        # Build sign string
        sign_str = _build_sign_string(uri, data, method)
        md5_str = _md5_hex(sign_str)

        # Call mnsv2 function via page
        try:
            sign_str_escaped = sign_str.replace("\\", "\\\\").replace("'", "\\'").replace("\n", "\\n")
            md5_str_escaped = md5_str.replace("\\", "\\\\").replace("'", "\\'")
            x3_value = await page.evaluate(f"window.mnsv2('{sign_str_escaped}', '{md5_str_escaped}')")
            if not x3_value:
                x3_value = ""
        except Exception as e:
            print(f"[XHSSigner] mnsv2 call failed: {e}")
            x3_value = ""

        # Build signatures
        data_type = "object" if isinstance(data, (dict, list)) else "string"
        x_s = _build_xs_payload(x3_value, data_type)
        x_t = str(int(time.time() * 1000))
        x_s_common = _build_xs_common(a1, b1, x_s, x_t)

        return {
            "X-S": x_s,
            "X-T": x_t,
            "X-S-Common": x_s_common,
            "X-B3-Traceid": _get_trace_id(),
        }
