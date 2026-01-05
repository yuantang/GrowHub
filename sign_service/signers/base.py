# -*- coding: utf-8 -*-
"""
Base Signer Interface

Defines the abstract interface for platform-specific signers.
"""

from abc import ABC, abstractmethod
from typing import Dict, Any, Optional

from playwright.async_api import Page


class BaseSigner(ABC):
    """Abstract base class for platform signers"""

    @property
    @abstractmethod
    def platform(self) -> str:
        """Return the platform identifier"""
        pass

    @abstractmethod
    async def sign(
        self,
        page: Page,
        uri: str,
        data: Dict[str, Any],
        method: str = "POST",
        cookies: Dict[str, str] = None
    ) -> Dict[str, str]:
        """
        Generate signature headers for the request
        
        Args:
            page: Playwright page instance
            uri: API endpoint path
            data: Request data (params for GET, payload for POST)
            method: HTTP method (GET or POST)
            cookies: Cookie dictionary
        
        Returns:
            Dictionary of signed headers
        """
        pass

    async def prepare_page(self, page: Page, cookies: Dict[str, str] = None):
        """
        Prepare page with cookies if needed
        
        Args:
            page: Playwright page instance
            cookies: Cookie dictionary to set
        """
        if cookies:
            cookie_list = [
                {"name": k, "value": v, "domain": self._get_domain(), "path": "/"}
                for k, v in cookies.items()
            ]
            await page.context.add_cookies(cookie_list)

    def _get_domain(self) -> str:
        """Get the domain for the platform"""
        domains = {
            "xhs": ".xiaohongshu.com",
            "dy": ".douyin.com",
            "bili": ".bilibili.com",
            "wb": ".weibo.com",
            "ks": ".kuaishou.com",
        }
        return domains.get(self.platform, "")
