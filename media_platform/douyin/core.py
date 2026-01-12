# -*- coding: utf-8 -*-
import asyncio
import os
import random
from asyncio import Task
from typing import Any, Dict, List, Optional, Tuple

from playwright.async_api import (
    BrowserContext,
    BrowserType,
    Page,
    Playwright,
    async_playwright,
)

import config
from base.base_crawler import AbstractCrawler
from proxy.proxy_ip_pool import IpInfoModel, create_ip_pool
from store import douyin as douyin_store
from tools import utils
from tools.cdp_browser import CDPBrowserManager
from var import crawler_type_var

from media_platform.douyin.client import DouYinClient
from media_platform.douyin.login import DouYinLogin
from media_platform.douyin.handlers.search import SearchHandler
from media_platform.douyin.handlers.detail import DetailHandler
from media_platform.douyin.handlers.creator import CreatorHandler
from media_platform.douyin.handlers.homefeed import HomefeedHandler
from media_platform.douyin.processors.aweme_processor import AwemeProcessor
from media_platform.douyin.processors.comment_processor import CommentProcessor
from checkpoint.manager import get_checkpoint_manager


class DouYinCrawler(AbstractCrawler):
    context_page: Page
    dy_client: DouYinClient
    browser_context: BrowserContext

    def __init__(self) -> None:
        self.index_url = "https://www.douyin.com"
        self.user_agent = utils.get_user_agent()

    async def search(self) -> None:
        """
        Satisfy AbstractCrawler interface.
        Actual search logic is handled by SearchHandler via start() dispatch.
        """
        pass


    async def start(self) -> None:
        playwright_proxy_format, playwright_proxy_ip_pool = None, None
        if config.ENABLE_IP_PROXY:
            ip_proxy_pool = await create_ip_pool(
                config.IP_PROXY_POOL_COUNT, enable_validate_ip=True
            )
            playwright_proxy_ip_pool = ip_proxy_pool
            # if config.IP_PROXY_PROVIDER_NAME == "kuaidaili":
            #     # 暂时只支持快代理的隧道代理
            #     pass 

        async with async_playwright() as playwright:
            # 浏览器启动逻辑 (保留原逻辑以维持签名能力)
            if config.ENABLE_CDP_MODE:
                utils.logger.info("[DouYinCrawler] 使用CDP模式启动浏览器")
                self.browser_context = await self.launch_browser_with_cdp(
                    playwright,
                    playwright_proxy_format,
                    user_agent=config.DEFAULT_USER_AGENT,
                    headless=config.CDP_HEADLESS,
                )
            else:
                utils.logger.info("[DouYinCrawler] 使用标准模式启动浏览器")
                chromium = playwright.chromium
                self.browser_context = await self.launch_browser(
                    chromium,
                    playwright_proxy_format,
                    user_agent=config.DEFAULT_USER_AGENT,
                    headless=config.HEADLESS,
                )
            
            self.context_page = await self.browser_context.new_page()
            await self.context_page.goto(self.index_url)

            # 初始化 Client
            self.dy_client = DouYinClient(
                timeout=config.CRAWLER_MAX_SLEEP_SEC, # Adjust timeout
                headers={
                    "User-Agent": self.user_agent, 
                    "Referer": "https://www.douyin.com/",
                }, # Headers will be enriched by update_cookies
                playwright_page=self.context_page,
                cookie_dict={},
                proxy_ip_pool=playwright_proxy_ip_pool,
            )

            # 登录逻辑
            if config.LOGIN_TYPE == "qrcode" or config.LOGIN_TYPE == "phone" or config.LOGIN_TYPE == "cookie":
                login_obj = DouYinLogin(
                    login_type=config.LOGIN_TYPE,
                    login_phone="",
                    browser_context=self.browser_context,
                    context_page=self.context_page,
                    cookie_str=config.COOKIES,
                )
                await login_obj.begin()
                await self.dy_client.update_cookies(browser_context=self.browser_context)

            # Login Only Mode
            if config.CRAWLER_TYPE == "login":
                utils.logger.info("[DouYinCrawler] Login Mode: Saving cookies to AccountManager...")
                cookies = await self.browser_context.cookies()
                cookie_str, _ = utils.convert_cookies(cookies)
                try:
                    from accounts.manager import get_account_manager
                    from datetime import datetime
                    manager = get_account_manager()
                    name = f"DY_Scan_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
                    manager.add_account("dy", name, cookie_str, notes="Created via Scan Login")
                    utils.logger.info(f"[DouYinCrawler] Account {name} saved successfully. Exiting...")
                except Exception as e:
                     utils.logger.error(f"[DouYinCrawler] Failed to save account: {e}")
                return

            # Initialize Architecture Components
            checkpoint_manager = get_checkpoint_manager()
            crawler_aweme_task_semaphore = asyncio.Semaphore(config.MAX_CONCURRENCY_NUM)
            crawler_comment_semaphore = asyncio.Semaphore(config.MAX_CONCURRENCY_NUM)

            aweme_processor = AwemeProcessor(
                dy_client=self.dy_client,
                checkpoint_manager=checkpoint_manager,
                crawler_aweme_task_semaphore=crawler_aweme_task_semaphore
            )
            
            comment_processor = CommentProcessor(
                dy_client=self.dy_client,
                checkpoint_manager=checkpoint_manager,
                crawler_comment_semaphore=crawler_comment_semaphore
            )

            crawler_type_var.set(config.CRAWLER_TYPE)
            
            # Dispatch to Handler
            if config.CRAWLER_TYPE == "search":
                handler = SearchHandler(self.dy_client, checkpoint_manager, aweme_processor, comment_processor)
                await handler.handle()
            elif config.CRAWLER_TYPE == "detail":
                handler = DetailHandler(self.dy_client, checkpoint_manager, aweme_processor, comment_processor)
                await handler.handle()
            elif config.CRAWLER_TYPE == "creator":
                handler = CreatorHandler(self.dy_client, checkpoint_manager, aweme_processor, comment_processor)
                await handler.handle()
            elif config.CRAWLER_TYPE == "homefeed":
                handler = HomefeedHandler(self.dy_client, checkpoint_manager, aweme_processor, comment_processor)
                await handler.handle()
            else:
                 utils.logger.error(f"[DouYinCrawler] Unknown crawler type: {config.CRAWLER_TYPE}")

            utils.logger.info("[DouYinCrawler.start] Douyin Crawler finished ...")


    async def launch_browser(
        self,
        chromium: BrowserType,
        playwright_proxy: Optional[Dict],
        user_agent: Optional[str],
        headless: bool = True,
    ) -> BrowserContext:
        """
        Launch browser (Standard)
        """
        browser = await chromium.launch(
            headless=headless,
            proxy=playwright_proxy,
            args=[
                "--disable-blink-features=AutomationControlled",
                "--no-sandbox",
                "--disable-gpu",
            ]
        )
        browser_context = await browser.new_context(
            viewport={"width": 1920, "height": 1080},
            user_agent=user_agent
        )
        await browser_context.add_init_script(path="libs/stealth.min.js")
        return browser_context

    async def launch_browser_with_cdp(
        self,
        playwright: Playwright,
        playwright_proxy: Optional[Dict],
        user_agent: Optional[str],
        headless: bool = True,
    ) -> BrowserContext:
        """
        Launch browser via CDP
        """
        try:
            self.cdp_manager = CDPBrowserManager()
            browser_context = await self.cdp_manager.launch_and_connect(
                playwright=playwright,
                playwright_proxy=playwright_proxy,
                user_agent=user_agent,
                headless=headless,
            )
            await self.cdp_manager.add_stealth_script()
            browser_info = await self.cdp_manager.get_browser_info()
            utils.logger.info(f"[DouYinCrawler] CDP浏览器信息: {browser_info}")
            return browser_context

        except Exception as e:
            utils.logger.error(f"[DouYinCrawler] CDP模式启动失败，回退到标准模式: {e}")
            chromium = playwright.chromium
            return await self.launch_browser(chromium, playwright_proxy, user_agent, headless)

