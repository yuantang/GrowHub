# -*- coding: utf-8 -*-
"""
Bilibili Signer

Generates WBI signatures for Bilibili API requests.
Pure Python implementation without browser dependency.
"""

import urllib.parse
from hashlib import md5
from typing import Dict, Any
from playwright.async_api import Page

from .base import BaseSigner


class BilibiliSigner(BaseSigner):
    """
    Signer for Bilibili platform
    
    Implements WBI signature algorithm as described in:
    https://socialsisteryi.github.io/bilibili-API-collect/docs/misc/sign/wbi.html
    """

    platform = "bili"
    
    # WBI mixing table
    MAP_TABLE = [
        46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
        33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40,
        61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11,
        36, 20, 34, 44, 52
    ]

    def _get_domain(self) -> str:
        return "https://www.bilibili.com"

    def _get_salt(self, img_key: str, sub_key: str) -> str:
        """
        Generate salt from img_key and sub_key using map table
        
        Args:
            img_key: Image key from wbi_img_url
            sub_key: Sub key from wbi_sub_url
            
        Returns:
            32 character salt string
        """
        mixin_key = img_key + sub_key
        salt = ""
        for i in self.MAP_TABLE:
            if i < len(mixin_key):
                salt += mixin_key[i]
        return salt[:32]

    def _extract_key_from_url(self, url: str) -> str:
        """Extract key from wbi URL (filename without extension)"""
        if not url:
            return ""
        # URL format: https://i0.hdslb.com/bfs/wbi/{key}.png
        import re
        match = re.search(r'/([a-zA-Z0-9]+)\.png$', url)
        return match.group(1) if match else ""

    async def sign(
        self,
        page: Page,
        uri: str,
        data: Dict[str, Any] = None,
        method: str = "GET",
        cookies: Dict[str, str] = None,
    ) -> Dict[str, str]:
        """
        Generate WBI signature for Bilibili requests
        
        The Bilibili WBI sign process:
        1. Get img_key and sub_key from localStorage or API
        2. Generate salt from keys using map table
        3. Add wts timestamp to params
        4. Sort params and filter special characters
        5. Generate w_rid by MD5(query + salt)
        
        Args:
            page: Playwright page instance
            uri: API endpoint path
            data: Request parameters
            method: HTTP method
            cookies: Cookie dictionary
            
        Returns:
            Dictionary with w_rid and wts parameters
        """
        await self.prepare_page(page, cookies)

        data = data or {}
        
        # Get WBI keys from localStorage
        img_key, sub_key = await self._get_wbi_keys(page)
        
        if not img_key or not sub_key:
            print("[BilibiliSigner] Failed to get WBI keys")
            return {}

        # Generate salt
        salt = self._get_salt(img_key, sub_key)
        
        # Add timestamp
        import time
        wts = int(time.time())
        params = {**data, "wts": wts}
        
        # Sort parameters
        params = dict(sorted(params.items()))
        
        # Filter special characters from values
        params = {
            k: ''.join(filter(lambda ch: ch not in "!'()*", str(v)))
            for k, v in params.items()
        }
        
        # URL encode and generate signature
        query = urllib.parse.urlencode(params)
        w_rid = md5((query + salt).encode()).hexdigest()
        
        return {
            "w_rid": w_rid,
            "wts": str(wts),
            "params": {**params, "w_rid": w_rid},
        }

    async def _get_wbi_keys(self, page: Page) -> tuple:
        """
        Get WBI keys from browser localStorage
        
        Returns:
            Tuple of (img_key, sub_key)
        """
        try:
            # Try to get from localStorage
            wbi_img_urls = await page.evaluate("""
                () => {
                    const data = localStorage.getItem('wbi_img_urls');
                    return data || '';
                }
            """)
            
            if wbi_img_urls:
                # Format: img_url-sub_url
                parts = wbi_img_urls.split('-')
                if len(parts) == 2:
                    img_key = self._extract_key_from_url(parts[0])
                    sub_key = self._extract_key_from_url(parts[1])
                    return img_key, sub_key

            # Fallback: try to get from page content or API
            # This is a known fallback - keys can be fetched from nav API
            nav_data = await page.evaluate("""
                async () => {
                    try {
                        const res = await fetch('https://api.bilibili.com/x/web-interface/nav');
                        const data = await res.json();
                        return data.data?.wbi_img || null;
                    } catch(e) {
                        return null;
                    }
                }
            """)
            
            if nav_data:
                img_url = nav_data.get('img_url', '')
                sub_url = nav_data.get('sub_url', '')
                img_key = self._extract_key_from_url(img_url)
                sub_key = self._extract_key_from_url(sub_url)
                return img_key, sub_key

            return "", ""
        except Exception as e:
            print(f"[BilibiliSigner] Error getting WBI keys: {e}")
            return "", ""
