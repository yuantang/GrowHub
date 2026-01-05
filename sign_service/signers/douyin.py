# -*- coding: utf-8 -*-
"""
Douyin Signer

Generates request signatures for Douyin (TikTok China) API.
Uses Playwright to execute browser-side JavaScript for a-bogus generation.
"""

import urllib.parse
import json
from typing import Dict, Any, Optional

from playwright.async_api import Page

from .base import BaseSigner


class DouyinSigner(BaseSigner):
    """Signer for Douyin platform"""

    platform = "dy"

    def _get_domain(self) -> str:
        return "https://www.douyin.com"

    async def sign(
        self,
        page: Page,
        uri: str,
        data: Dict[str, Any] = None,
        method: str = "GET",
        cookies: Dict[str, str] = None,
    ) -> Dict[str, str]:
        """
        Generate signature headers for Douyin requests
        
        The Douyin sign process includes:
        1. Add common parameters (device info, webid, msToken)
        2. Generate a-bogus parameter using browser JS
        
        Args:
            page: Playwright page instance
            uri: API endpoint path
            data: Request parameters
            method: HTTP method
            cookies: Cookie dictionary
            
        Returns:
            Dictionary with signed parameters (a_bogus)
        """
        await self.prepare_page(page, cookies)

        data = data or {}
        
        # Get localStorage values
        try:
            local_storage = await page.evaluate("() => window.localStorage")
        except Exception:
            local_storage = {}

        # Common parameters
        common_params = {
            "device_platform": "webapp",
            "aid": "6383",
            "channel": "channel_pc_web",
            "version_code": "190600",
            "version_name": "19.6.0",
            "update_version_code": "170400",
            "pc_client_type": "1",
            "cookie_enabled": "true",
            "browser_language": "zh-CN",
            "browser_platform": "MacIntel",
            "browser_name": "Chrome",
            "browser_version": "125.0.0.0",
            "browser_online": "true",
            "engine_name": "Blink",
            "os_name": "Mac OS",
            "os_version": "10.15.7",
            "cpu_core_num": "8",
            "device_memory": "8",
            "engine_version": "109.0",
            "platform": "PC",
            "screen_width": "2560",
            "screen_height": "1440",
            "effective_type": "4g",
            "round_trip_time": "50",
            "webid": await self._get_web_id(page),
            "msToken": local_storage.get("xmst", ""),
        }

        # Merge parameters
        params = {**data, **common_params}
        query_string = urllib.parse.urlencode(params)

        # Generate a-bogus
        a_bogus = await self._get_a_bogus(page, uri, query_string, data if method == "POST" else {})

        return {
            "a_bogus": a_bogus,
            "params": params,
        }

    async def _get_web_id(self, page: Page) -> str:
        """Get or generate web_id"""
        try:
            # Try to get from cookie or localStorage
            cookies = await page.context.cookies()
            for cookie in cookies:
                if cookie.get("name") == "s_v_web_id":
                    return cookie.get("value", "")
            
            # Generate a random web_id
            import random
            import string
            chars = string.ascii_lowercase + string.digits
            return "verify_" + "".join(random.choice(chars) for _ in range(16))
        except Exception:
            return ""

    async def _get_a_bogus(
        self,
        page: Page,
        uri: str,
        query_string: str,
        post_data: Dict = None
    ) -> str:
        """
        Generate a-bogus signature using browser JS
        
        Args:
            page: Playwright page
            uri: Request URI
            query_string: URL encoded query string
            post_data: POST data (if any)
            
        Returns:
            a-bogus signature string
        """
        try:
            # The a-bogus algorithm is implemented in browser JS
            # We need to call the browser's sign function
            user_agent = await page.evaluate("() => navigator.userAgent")
            
            # Try to execute the signing function
            # Note: This requires the page to have loaded the signing script
            js_code = f"""
            (() => {{
                try {{
                    // Check if signing function exists
                    if (typeof window._$jsg !== 'undefined') {{
                        return window._$jsg('{uri}', '{query_string}', {json.dumps(post_data or {})}, '{user_agent}');
                    }}
                    // Fallback: try alternative signing method
                    if (typeof window.byted_alog !== 'undefined' && window.byted_alog.sign) {{
                        return window.byted_alog.sign('{query_string}');
                    }}
                    return '';
                }} catch(e) {{
                    console.error('Douyin sign error:', e);
                    return '';
                }}
            }})()
            """
            a_bogus = await page.evaluate(js_code)
            return a_bogus or ""
        except Exception as e:
            print(f"[DouyinSigner] Failed to generate a-bogus: {e}")
            return ""
