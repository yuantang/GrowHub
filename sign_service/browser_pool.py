# -*- coding: utf-8 -*-
"""
Browser Pool Manager for Sign Service

Manages a pool of Playwright browser instances for efficient signature generation.
Each platform can have its own set of pre-initialized pages.
"""

import asyncio
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, field
from datetime import datetime

from playwright.async_api import async_playwright, Browser, Page, Playwright


# Platform URLs for page initialization
PLATFORM_URLS = {
    "xhs": "https://www.xiaohongshu.com",
    "dy": "https://www.douyin.com",
    "bili": "https://www.bilibili.com",
    "wb": "https://weibo.com",
    "ks": "https://www.kuaishou.com",
}


@dataclass
class PageInstance:
    """Represents a single page instance"""
    page: Page
    platform: str
    created_at: datetime = field(default_factory=datetime.now)
    last_used: Optional[datetime] = None
    request_count: int = 0
    is_busy: bool = False


class BrowserPool:
    """Manages a pool of browser pages for signing"""

    def __init__(self):
        self.playwright: Optional[Playwright] = None
        self.browser: Optional[Browser] = None
        self.pages: Dict[str, List[PageInstance]] = {}
        self.locks: Dict[str, asyncio.Lock] = {}
        self._initialized = False

    async def initialize(self, pool_size: int = 2):
        """Initialize the browser pool with specified number of pages per platform"""
        if self._initialized:
            return

        self.playwright = await async_playwright().start()
        self.browser = await self.playwright.chromium.launch(
            headless=True,
            args=[
                "--disable-blink-features=AutomationControlled",
                "--no-sandbox",
                "--disable-dev-shm-usage",
            ]
        )

        # Initialize pages for each platform
        for platform, url in PLATFORM_URLS.items():
            self.pages[platform] = []
            self.locks[platform] = asyncio.Lock()

            for i in range(pool_size):
                try:
                    page = await self.browser.new_page()
                    await page.goto(url, wait_until="domcontentloaded", timeout=30000)
                    
                    # Add stealth script
                    await page.add_init_script("""
                        Object.defineProperty(navigator, 'webdriver', {
                            get: () => undefined
                        });
                    """)
                    
                    page_instance = PageInstance(page=page, platform=platform)
                    self.pages[platform].append(page_instance)
                    print(f"[BrowserPool] Initialized page {i+1} for {platform}")
                except Exception as e:
                    print(f"[BrowserPool] Failed to initialize page for {platform}: {e}")

        self._initialized = True
        print(f"[BrowserPool] Initialization complete. Total pages: {sum(len(p) for p in self.pages.values())}")

    async def get_page(self, platform: str) -> Optional[PageInstance]:
        """Get an available page for the specified platform"""
        if platform not in self.pages:
            return None

        async with self.locks[platform]:
            for page_instance in self.pages[platform]:
                if not page_instance.is_busy:
                    page_instance.is_busy = True
                    page_instance.last_used = datetime.now()
                    page_instance.request_count += 1
                    return page_instance

        # If no available page, wait and retry
        await asyncio.sleep(0.5)
        return await self.get_page(platform)

    async def release_page(self, page_instance: PageInstance):
        """Release a page back to the pool"""
        page_instance.is_busy = False

    async def refresh_page(self, page_instance: PageInstance):
        """Refresh a page (useful if the page becomes stale)"""
        platform = page_instance.platform
        url = PLATFORM_URLS.get(platform)
        if url:
            try:
                await page_instance.page.goto(url, wait_until="domcontentloaded", timeout=30000)
            except Exception as e:
                print(f"[BrowserPool] Failed to refresh page: {e}")

    async def cleanup(self):
        """Cleanup all browser resources"""
        if self.browser:
            await self.browser.close()
        if self.playwright:
            await self.playwright.stop()
        self._initialized = False
        print("[BrowserPool] Cleanup complete")

    async def get_status(self) -> Dict[str, Any]:
        """Get current pool status"""
        status = {
            "initialized": self._initialized,
            "platforms": {}
        }
        
        for platform, page_list in self.pages.items():
            available = sum(1 for p in page_list if not p.is_busy)
            total = len(page_list)
            total_requests = sum(p.request_count for p in page_list)
            status["platforms"][platform] = {
                "total": total,
                "available": available,
                "busy": total - available,
                "total_requests": total_requests
            }
        
        return status


# Global singleton instance
browser_pool = BrowserPool()
