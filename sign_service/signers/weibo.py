# -*- coding: utf-8 -*-
"""
Weibo Signer

Weibo uses relatively simple request signing.
Most requests just need valid cookies without complex signatures.
"""

from typing import Dict, Any
from playwright.async_api import Page

from .base import BaseSigner


class WeiboSigner(BaseSigner):
    """
    Signer for Weibo platform
    
    Weibo's mobile web API (m.weibo.cn) doesn't require complex signatures.
    The main requirement is valid cookies (particularly SUB cookie).
    """

    platform = "wb"

    def _get_domain(self) -> str:
        return "https://m.weibo.cn"

    async def sign(
        self,
        page: Page,
        uri: str,
        data: Dict[str, Any] = None,
        method: str = "GET",
        cookies: Dict[str, str] = None,
    ) -> Dict[str, str]:
        """
        Generate headers for Weibo requests
        
        Weibo mobile web API doesn't require complex signatures.
        We just need to ensure proper headers and cookies are set.
        
        Args:
            page: Playwright page instance
            uri: API endpoint path
            data: Request parameters
            method: HTTP method
            cookies: Cookie dictionary
            
        Returns:
            Dictionary with required headers
        """
        await self.prepare_page(page, cookies)

        import time
        
        # Get XSRF token from cookies if available
        xsrf_token = ""
        try:
            cookies_list = await page.context.cookies()
            for cookie in cookies_list:
                if cookie.get("name") == "XSRF-TOKEN":
                    xsrf_token = cookie.get("value", "")
                    break
        except Exception:
            pass

        headers = {
            "X-Requested-With": "XMLHttpRequest",
            "X-XSRF-TOKEN": xsrf_token,
            "Referer": "https://m.weibo.cn/",
            "_t": str(int(time.time() * 1000)),  # Timestamp in milliseconds
        }

        return headers
