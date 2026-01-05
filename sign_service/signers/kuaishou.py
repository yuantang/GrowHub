# -*- coding: utf-8 -*-
"""
Kuaishou Signer

Generates signatures for Kuaishou GraphQL API requests.
"""

from typing import Dict, Any
from playwright.async_api import Page

from .base import BaseSigner


class KuaishouSigner(BaseSigner):
    """
    Signer for Kuaishou platform
    
    Kuaishou uses GraphQL for most API requests.
    The signing mainly involves proper cookie handling.
    """

    platform = "ks"

    def _get_domain(self) -> str:
        return "https://www.kuaishou.com"

    async def sign(
        self,
        page: Page,
        uri: str,
        data: Dict[str, Any] = None,
        method: str = "POST",  # Kuaishou uses POST for GraphQL
        cookies: Dict[str, str] = None,
    ) -> Dict[str, str]:
        """
        Generate headers for Kuaishou requests
        
        Kuaishou primarily uses GraphQL API which requires:
        1. Valid cookies (did, kuaishou.server.web_ph, etc.)
        2. Proper Content-Type header
        
        Args:
            page: Playwright page instance
            uri: API endpoint path
            data: Request parameters (GraphQL query)
            method: HTTP method
            cookies: Cookie dictionary
            
        Returns:
            Dictionary with required headers
        """
        await self.prepare_page(page, cookies)

        # Try to get did (device ID) from cookies
        did = ""
        try:
            cookies_list = await page.context.cookies()
            for cookie in cookies_list:
                if cookie.get("name") == "did":
                    did = cookie.get("value", "")
                    break
        except Exception:
            pass

        headers = {
            "Content-Type": "application/json",
            "Accept": "*/*",
            "Origin": "https://www.kuaishou.com",
            "Referer": "https://www.kuaishou.com/",
        }

        if did:
            headers["did"] = did

        return headers
