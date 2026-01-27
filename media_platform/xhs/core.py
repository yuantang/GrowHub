# -*- coding: utf-8 -*-
# Copyright (c) 2025 relakkes@gmail.com
#
# This file is part of MediaCrawler project.
# Repository: https://github.com/NanmiCoder/MediaCrawler/blob/main/media_platform/xhs/core.py
# GitHub: https://github.com/NanmiCoder
# Licensed under NON-COMMERCIAL LEARNING LICENSE 1.1
#

# 声明：本代码仅供学习和研究目的使用。使用者应遵守以下原则：
# 1. 不得用于任何商业用途。
# 2. 使用时应遵守目标平台的使用条款和robots.txt规则。
# 3. 不得进行大规模爬取或对平台造成运营干扰。
# 4. 应合理控制请求频率，避免给目标平台带来不必要的负担。
# 5. 不得用于任何非法或不当的用途。
#
# 详细许可条款请参阅项目根目录下的LICENSE文件。
# 使用本代码即表示您同意遵守上述原则和LICENSE中的所有条款。

import asyncio
import os
import random
from asyncio import Task
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Callable

from playwright.async_api import (
    BrowserContext,
    BrowserType,
    Page,
    Playwright,
    async_playwright,
)
from tenacity import RetryError

import config
from base.base_crawler import AbstractCrawler
from config import CRAWLER_MAX_COMMENTS_COUNT_SINGLENOTES
from model.m_xiaohongshu import NoteUrlInfo, CreatorUrlInfo
from proxy.proxy_ip_pool import IpInfoModel, create_ip_pool
from store import xhs as xhs_store
from tools import utils
from tools.cdp_browser import CDPBrowserManager
from var import crawler_type_var, source_keyword_var, project_id_var

from .client import XiaoHongShuClient
from .exception import DataFetchError
from .field import SearchSortType
from .help import parse_note_info_from_note_url, parse_creator_info_from_url, get_search_id
from .login import XiaoHongShuLogin
from .extractor import XiaoHongShuExtractor
from checkpoint.models import CheckpointStatus, CrawlerCheckpoint
from checkpoint.manager import CheckpointManager


class XiaoHongShuCrawler(AbstractCrawler):
    context_page: Page
    xhs_client: XiaoHongShuClient
    browser_context: BrowserContext
    cdp_manager: Optional[CDPBrowserManager]

    def __init__(self) -> None:
        self.index_url = "https://www.xiaohongshu.com"
        # R2 Fix: Randomize User-Agent on each crawler session
        self.user_agent = utils.get_user_agent()
        self.cdp_manager = None
        self.ip_proxy_pool = None  # Proxy IP pool for automatic proxy refresh
        self.checkpoint_manager = CheckpointManager()
        self.xhs_extractor = XiaoHongShuExtractor()
        
        # P9 Fix: Track current checkpoint for graceful shutdown
        self._current_checkpoint: Optional[CrawlerCheckpoint] = None
        self._shutdown_requested = False
        self._setup_signal_handlers()

    def _setup_signal_handlers(self):
        """P9 Fix: Setup signal handlers for graceful shutdown"""
        import signal
        
        def signal_handler(signum, frame):
            utils.logger.warning(f"🛑 [XiaoHongShuCrawler] Received signal {signum}, requesting graceful shutdown...")
            self._shutdown_requested = True
        
        # Register signal handlers for SIGINT (Ctrl+C) and SIGTERM
        try:
            signal.signal(signal.SIGINT, signal_handler)
            signal.signal(signal.SIGTERM, signal_handler)
        except Exception as e:
            utils.logger.warning(f"[XiaoHongShuCrawler] Could not set signal handlers: {e}")
    
    async def _save_checkpoint_on_shutdown(self, checkpoint: CrawlerCheckpoint, page: int, total_count: int):
        """P9 Fix: Save checkpoint when shutdown is requested"""
        if checkpoint:
            checkpoint.current_page = page
            checkpoint.total_notes_fetched = total_count
            checkpoint.status = CheckpointStatus.PAUSED
            checkpoint.last_update = datetime.now()
            await self.checkpoint_manager.save_checkpoint(checkpoint)
            utils.logger.info(f"💾 [XiaoHongShuCrawler] Checkpoint saved on shutdown: Page {page}, Notes {total_count}")

    def is_note_qualified(self, note_detail: Dict) -> bool:
        """Check if note meets the filtering criteria"""
        if not note_detail:
            return False

        # Time filter
        if config.START_TIME or config.END_TIME:
            try:
                # API usually returns millisecond timestamp
                note_ts = int(note_detail.get("create_time", 0) or note_detail.get("timestamp", 0) or note_detail.get("last_update_time", 0))
                
                if note_ts > 0:
                    # Normalize to milliseconds
                    if note_ts < 10000000000: # If seconds (10 digits)
                        note_ts *= 1000

                    if config.START_TIME:
                        fmt = "%Y-%m-%d" if len(config.START_TIME) == 10 else "%Y-%m-%d %H:%M:%S"
                        # P5 Fix: Parse as local time for consistent timezone handling
                        start_dt = datetime.strptime(config.START_TIME, fmt)
                        # Use local timestamp (datetime.timestamp() uses local timezone)
                        start_ts = start_dt.timestamp() * 1000
                        if note_ts < start_ts:
                            utils.logger.info(f"⏭️ [Filter] Note {note_detail.get('note_id')} ignored. Time {datetime.fromtimestamp(note_ts/1000)} < {config.START_TIME}")
                            return False

                    if config.END_TIME:
                        fmt = "%Y-%m-%d" if len(config.END_TIME) == 10 else "%Y-%m-%d %H:%M:%S"
                        end_dt = datetime.strptime(config.END_TIME, fmt)
                        if len(config.END_TIME) == 10:
                            # P5 Fix: Add 1 day to include the entire end date
                            end_dt = end_dt + timedelta(days=1, seconds=-1)  # End of the day
                        end_ts = end_dt.timestamp() * 1000
                        if note_ts > end_ts:
                            utils.logger.info(f"⏭️ [Filter] Note {note_detail.get('note_id')} ignored. Time {datetime.fromtimestamp(note_ts/1000)} > {config.END_TIME}")
                            return False
            except Exception as e:
                utils.logger.error(f"[Filter] Time check error for note {note_detail.get('note_id')}: {e}")

        interact_info = note_detail.get("interact_info", {})
        
        # Check interaction filters
        # Note: API field names might differ, checking common possible structures
        # Structure usually: interact_info: { liked_count: "", collected_count: "", ... }
        
        likes = utils.convert_str_number_to_int(interact_info.get("liked_count", "0"))
        shares = utils.convert_str_number_to_int(interact_info.get("share_count", "0"))
        comments = utils.convert_str_number_to_int(interact_info.get("comment_count", "0"))
        favorites = utils.convert_str_number_to_int(interact_info.get("collected_count", "0"))
        
        if config.MIN_LIKES_COUNT > 0 and likes < config.MIN_LIKES_COUNT:
            utils.logger.info(f"⏭️ [Filter] Skip note {note_detail.get('note_id')} due to low likes: {likes} < {config.MIN_LIKES_COUNT}")
            return False
            
        if config.MIN_SHARES_COUNT > 0 and shares < config.MIN_SHARES_COUNT:
            utils.logger.info(f"⏭️ [Filter] Skip note {note_detail.get('note_id')} due to low shares: {shares} < {config.MIN_SHARES_COUNT}")
            return False
            
        if config.MIN_COMMENTS_COUNT > 0 and comments < config.MIN_COMMENTS_COUNT:
            utils.logger.info(f"⏭️ [Filter] Skip note {note_detail.get('note_id')} due to low comments: {comments} < {config.MIN_COMMENTS_COUNT}")
            return False
            
        if config.MIN_FAVORITES_COUNT > 0 and favorites < config.MIN_FAVORITES_COUNT:
            utils.logger.info(f"⏭️ [Filter] Skip note {note_detail.get('note_id')} due to low favorites: {favorites} < {config.MIN_FAVORITES_COUNT}")
            return False
            
        return True

    async def start(self) -> None:
        playwright_proxy_format, httpx_proxy_format = None, None
        if config.ENABLE_IP_PROXY:
            self.ip_proxy_pool = await create_ip_pool(config.IP_PROXY_POOL_COUNT, enable_validate_ip=True)
            ip_proxy_info: IpInfoModel = await self.ip_proxy_pool.get_proxy()
            playwright_proxy_format, httpx_proxy_format = utils.format_proxy_info(ip_proxy_info)

        async with async_playwright() as playwright:
            # Choose launch mode based on configuration
            if config.ENABLE_CDP_MODE:
                utils.logger.info("[XiaoHongShuCrawler] Launching browser using CDP mode")
                self.browser_context = await self.launch_browser_with_cdp(
                    playwright,
                    playwright_proxy_format,
                    self.user_agent,
                    headless=config.CDP_HEADLESS,
                )
            else:
                utils.logger.info("[XiaoHongShuCrawler] Launching browser using standard mode")
                # Launch a browser context.
                chromium = playwright.chromium
                self.browser_context = await self.launch_browser(
                    chromium,
                    playwright_proxy_format,
                    self.user_agent,
                    headless=config.HEADLESS,
                )
                # stealth.min.js is a js script to prevent the website from detecting the crawler.
                await self.browser_context.add_init_script(path="libs/stealth.min.js")

            self.context_page = await self.browser_context.new_page()
            await self.context_page.goto(self.index_url)

            # Create a client to interact with the Xiaohongshu website.
            utils.logger.info(f"[XiaoHongShuCrawler] Config Cookies length: {len(config.COOKIES)}")
            self.xhs_client = await self.create_xhs_client(httpx_proxy_format)
            if not await self.xhs_client.pong():
                utils.logger.info("[XiaoHongShuCrawler] Initial pong failed, attempting cookie login...")
                login_obj = XiaoHongShuLogin(
                    login_type=config.LOGIN_TYPE,
                    login_phone="",  # input your phone number
                    browser_context=self.browser_context,
                    context_page=self.context_page,
                    cookie_str=config.COOKIES,
                )
                await login_obj.begin()
                
                # Update client cookies after login (original working pattern)
                await self.xhs_client.update_cookies(browser_context=self.browser_context)
                utils.logger.info("[XiaoHongShuCrawler] Cookies updated after login")

            # Login Only Mode: Save cookies and exit
            if config.CRAWLER_TYPE == "login":
                utils.logger.info("[XiaoHongShuCrawler] Login Mode: Saving cookies to AccountManager...")
                cookies = await self.browser_context.cookies()
                cookie_str, _ = utils.convert_cookies(cookies)
                
                try:
                    from accounts.manager import get_account_manager
                    manager = get_account_manager()
                    from datetime import datetime
                    name = f"XHS_Scan_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
                    manager.add_account("xhs", name, cookie_str, notes="Created via Scan Login")
                    utils.logger.info(f"[XiaoHongShuCrawler] Account {name} saved successfully. Exiting...")
                except Exception as e:
                     utils.logger.error(f"[XiaoHongShuCrawler] Failed to save account: {e}")
                return

            crawler_type_var.set(config.CRAWLER_TYPE)
            if config.CRAWLER_TYPE == "search":
                # Search for notes and retrieve their comment information.
                await self.search()
            elif config.CRAWLER_TYPE == "detail":
                # Get the information and comments of the specified post
                await self.get_specified_notes()
            elif config.CRAWLER_TYPE == "creator":
                # Get creator's information and their notes and comments
                await self.get_creators_and_notes()
            elif config.CRAWLER_TYPE == "homefeed":
                # Get homepage feed recommendations
                await self.get_homefeed()
            else:
                pass

            utils.logger.info("[XiaoHongShuCrawler.start] Xhs Crawler finished ...")

    async def search(self) -> None:
        """Search for notes and retrieve their comment information."""
        utils.logger.info("[XiaoHongShuCrawler.search] Begin search Xiaohongshu keywords")
        xhs_limit_count = 20  # Xiaohongshu limit page fixed value
        if config.CRAWLER_MAX_NOTES_COUNT < xhs_limit_count:
            config.CRAWLER_MAX_NOTES_COUNT = xhs_limit_count
        start_page = config.START_PAGE
        for keyword in config.KEYWORDS.split(","):
            source_keyword_var.set(keyword)
            project_id_var.set(config.PROJECT_ID)  # 设置关联项目 ID
            utils.logger.info(f"[XiaoHongShuCrawler.search] Current search keyword: {keyword}")
            page = 1
            search_id = get_search_id()
            total_crawled_count = 0
            
            # P4 Fix: Create shared semaphore at keyword level for consistent concurrency control
            shared_semaphore = asyncio.Semaphore(config.MAX_CONCURRENCY_NUM)
            
            # Pro Feature: Load or create checkpoint
            checkpoint = await self.checkpoint_manager.find_matching_checkpoint(
                platform="xhs",
                crawler_type="search",
                project_id=config.PROJECT_ID,
                keywords=keyword
            )
            
            if checkpoint:
                page = checkpoint.current_page
                total_crawled_count = checkpoint.total_notes_fetched
                utils.logger.info(f"🚩 [XiaoHongShuCrawler.search] Resuming from checkpoint: Page {page}, Notes {total_crawled_count}")
            else:
                checkpoint = await self.checkpoint_manager.create_checkpoint(
                    platform="xhs",
                    crawler_type="search",
                    project_id=config.PROJECT_ID,
                    keywords=keyword
                )
            
            checkpoint.status = CheckpointStatus.RUNNING
            checkpoint.last_update = datetime.now()
            
            # P9 Fix: Track current checkpoint for graceful shutdown
            self._current_checkpoint = checkpoint

            while True:
                # P9 Fix: Check for graceful shutdown request
                if self._shutdown_requested:
                    utils.logger.warning(f"🛑 [XiaoHongShuCrawler.search] Shutdown requested, saving checkpoint and exiting...")
                    await self._save_checkpoint_on_shutdown(checkpoint, page, total_crawled_count)
                    return  # Exit the entire search method
                
                # Check limit
                if config.CRAWLER_MAX_NOTES_COUNT > 0 and total_crawled_count >= config.CRAWLER_MAX_NOTES_COUNT:
                    utils.logger.info(f"[XiaoHongShuCrawler.search] Reached max notes count: {config.CRAWLER_MAX_NOTES_COUNT}")
                    break

                try:
                    utils.logger.info(f"[XiaoHongShuCrawler.search] search Xiaohongshu keyword: {keyword}, page: {page}")
                    # Handle sort type safely
                    sort_type = SearchSortType.GENERAL
                    try:
                        if config.SORT_TYPE and str(config.SORT_TYPE) not in ["0", "", "None"]:
                            sort_type = SearchSortType(config.SORT_TYPE)
                    except ValueError:
                        utils.logger.warning(f"[XiaoHongShuCrawler] Invalid sort type '{config.SORT_TYPE}', using default.")

                    notes_res = await self.xhs_client.get_note_by_keyword(
                        keyword=keyword,
                        search_id=search_id,
                        page=page,
                        sort=sort_type,
                    )
                    
                    if not notes_res:
                        utils.logger.info("[XiaoHongShuCrawler.search] No response from API!")
                        break

                    has_more = notes_res.get("has_more", False)
                    items = notes_res.get("items", [])
                    
                    if not items:
                        utils.logger.info("[XiaoHongShuCrawler.search] No more items!")
                        break

                    # Pro Feature: Filter processed notes
                    new_items = []
                    for item in items:
                        if item.get("model_type") in ("rec_query", "hot_query"):
                            continue
                        note_id = item.get("id")
                        if await self.checkpoint_manager.is_note_processed(checkpoint.task_id, note_id):
                            utils.logger.info(f"[XiaoHongShuCrawler.search] Note {note_id} already processed, skipping.")
                            continue
                        new_items.append(item)

                    if not new_items:
                        utils.logger.info(f"⏭️ [XiaoHongShuCrawler] All {len(items)} items on page {page} already processed.")
                        if not has_more: break
                        page += 1
                        continue

                    # P4 Fix: Use shared semaphore instead of creating new one per page
                    task_list = [
                        self.get_note_detail_async_task(
                            note_id=post_item.get("id"),
                            xsec_source=post_item.get("xsec_source"),
                            xsec_token=post_item.get("xsec_token"),
                            semaphore=shared_semaphore,
                        ) for post_item in new_items
                    ]
                    note_details = await asyncio.gather(*task_list)
                    
                    # Filter first
                    qualified_notes = []
                    for note_detail in note_details:
                        if note_detail and self.is_note_qualified(note_detail):
                            qualified_notes.append(note_detail)
                    
                    # Fetch comments for qualified notes
                    q_note_ids = [n.get("note_id") for n in qualified_notes]
                    q_tokens = [n.get("xsec_token") for n in qualified_notes]
                    
                    comments_map = {}
                    if q_note_ids:
                        comments_map = await self.batch_get_note_comments_data(q_note_ids, q_tokens)

                    # Save notes with comments
                    saved_count_in_this_batch = 0
                    total_comments_in_batch = 0
                    for note_detail in qualified_notes:
                        note_id = note_detail.get("note_id")
                        note_comments = comments_map.get(note_id, [])
                        note_detail["comments"] = note_comments
                        
                        await xhs_store.update_xhs_note(note_detail, client=self.xhs_client)
                        await self.get_notice_media(note_detail)
                        
                        # Pro Feature: Mark as processed
                        await self.checkpoint_manager.add_processed_note(checkpoint.task_id, note_id)
                        
                        saved_count_in_this_batch += 1
                        total_crawled_count += 1
                        total_comments_in_batch += len(note_comments)
                        
                        if config.CRAWLER_MAX_NOTES_COUNT > 0 and total_crawled_count >= config.CRAWLER_MAX_NOTES_COUNT:
                            break

                    # Pro Feature: Update Checkpoint
                    checkpoint.current_page = page
                    checkpoint.total_notes_fetched = total_crawled_count
                    checkpoint.total_comments_fetched += total_comments_in_batch
                    checkpoint.last_update = datetime.now()
                    await self.checkpoint_manager.save(checkpoint)

                    if not has_more:
                        utils.logger.info("[XiaoHongShuCrawler.search] No more content!")
                        break

                    page += 1
                    utils.logger.info(f"[XiaoHongShuCrawler.search] Saved {saved_count_in_this_batch} notes. Total: {total_crawled_count}")
                    
                    # Sleep after each page navigation with randomization
                    actual_sleep = await utils.random_sleep(config.CRAWLER_MAX_SLEEP_SEC)
                    utils.logger.info(f"[XiaoHongShuCrawler.search] Random sleep {actual_sleep:.2f}s after page {page-1}")
                except Exception as e:
                    utils.logger.error(f"[XiaoHongShuCrawler.search] Error in search loop: {e}")
                    checkpoint.status = CheckpointStatus.FAILED
                    checkpoint.error_message = str(e)
                    await self.checkpoint_manager.save(checkpoint)
                    break
            
            # Task finished for this keyword
            checkpoint.status = CheckpointStatus.COMPLETED
            checkpoint.last_update = datetime.now()
            await self.checkpoint_manager.save(checkpoint)

    async def get_homefeed(self) -> None:
        """Get homepage feed recommendations and retrieve their comment information."""
        utils.logger.info("[XiaoHongShuCrawler.get_homefeed] Begin crawling Xiaohongshu homepage feed")
        
        cursor = ""
        page = 1
        max_pages = config.HOMEFEED_MAX_PAGES
        category = config.HOMEFEED_CATEGORY
        
        while page <= max_pages:
            try:
                utils.logger.info(f"[XiaoHongShuCrawler.get_homefeed] Fetching page {page}, category: {category}")
                
                # Get homefeed data
                homefeed_res = await self.xhs_client.get_homefeed(
                    cursor=cursor,
                    num=20,
                    category=category
                )
                
                utils.logger.info(f"[XiaoHongShuCrawler.get_homefeed] Homefeed response: {homefeed_res}")
                
                items = homefeed_res.get("items", [])
                if not items:
                    utils.logger.info("[XiaoHongShuCrawler.get_homefeed] No more content!")
                    break
                
                # Filter out non-note items (ads, queries, etc.)
                note_items = [
                    item for item in items 
                    if item.get("model_type") not in ("rec_query", "hot_query", "ad")
                ]
                
                if not note_items:
                    utils.logger.info("[XiaoHongShuCrawler.get_homefeed] No valid notes in this page, trying next...")
                    cursor = homefeed_res.get("cursor", "")
                    page += 1
                    continue
                
                # Concurrently fetch note details
                semaphore = asyncio.Semaphore(config.MAX_CONCURRENCY_NUM)
                task_list = [
                    self.get_note_detail_async_task(
                        note_id=item.get("id"),
                        xsec_source="homefeed",
                        xsec_token=item.get("xsec_token", ""),
                        semaphore=semaphore,
                    ) for item in note_items
                ]
                
                note_details = await asyncio.gather(*task_list)
                note_ids = []
                xsec_tokens = []
                
                for note_detail in note_details:
                    if note_detail:
                        await xhs_store.update_xhs_note(note_detail, client=self.xhs_client)
                        await self.get_notice_media(note_detail)
                        note_ids.append(note_detail.get("note_id"))
                        xsec_tokens.append(note_detail.get("xsec_token"))
                
                utils.logger.info(f"[XiaoHongShuCrawler.get_homefeed] Processed {len(note_ids)} notes from page {page}")
                
                # Batch get comments
                await self.batch_get_note_comments(note_ids, xsec_tokens)
                
                # Update cursor for next page
                cursor = homefeed_res.get("cursor", "")
                page += 1
                
                # Sleep between pages
                actual_sleep = await utils.random_sleep(config.CRAWLER_MAX_SLEEP_SEC)
                utils.logger.info(f"[XiaoHongShuCrawler.get_homefeed] Random sleep {actual_sleep:.2f}s")
                
            except DataFetchError as e:
                utils.logger.error(f"[XiaoHongShuCrawler.get_homefeed] Data fetch error: {e}")
                break
            except Exception as e:
                utils.logger.error(f"[XiaoHongShuCrawler.get_homefeed] Unexpected error: {e}")
                break
        
        utils.logger.info(f"[XiaoHongShuCrawler.get_homefeed] Finished crawling {page - 1} pages")

    async def get_creators_and_notes(self) -> None:
        """Get creator's notes and retrieve their comment information."""
        utils.logger.info("[XiaoHongShuCrawler.get_creators_and_notes] Begin get Xiaohongshu creators")
        for creator_url in config.XHS_CREATOR_ID_LIST:
            try:
                # Parse creator URL to get user_id and security tokens
                creator_info: CreatorUrlInfo = parse_creator_info_from_url(creator_url)
                utils.logger.info(f"[XiaoHongShuCrawler.get_creators_and_notes] Parse creator URL info: {creator_info}")
                user_id = creator_info.user_id

                # get creator detail info from web html content
                createor_info: Dict = await self.xhs_client.get_creator_info(
                    user_id=user_id,
                    xsec_token=creator_info.xsec_token,
                    xsec_source=creator_info.xsec_source
                )
                if createor_info:
                    await xhs_store.save_creator(user_id, creator=createor_info)
            except ValueError as e:
                utils.logger.error(f"[XiaoHongShuCrawler.get_creators_and_notes] Failed to parse creator URL: {e}")
                continue

            # Use fixed crawling interval
            crawl_interval = config.CRAWLER_MAX_SLEEP_SEC
            # Get all note information of the creator
            all_notes_list = await self.xhs_client.get_all_notes_by_creator(
                user_id=user_id,
                crawl_interval=crawl_interval,
                callback=self.fetch_creator_notes_detail,
                xsec_token=creator_info.xsec_token,
                xsec_source=creator_info.xsec_source,
            )

            note_ids = []
            xsec_tokens = []
            for note_item in all_notes_list:
                note_ids.append(note_item.get("note_id"))
                xsec_tokens.append(note_item.get("xsec_token"))
            await self.batch_get_note_comments(note_ids, xsec_tokens)

    async def fetch_creator_notes_detail(self, note_list: List[Dict]):
        """Concurrently obtain the specified post list and save the data"""
        semaphore = asyncio.Semaphore(config.MAX_CONCURRENCY_NUM)
        task_list = [
            self.get_note_detail_async_task(
                note_id=post_item.get("note_id"),
                xsec_source=post_item.get("xsec_source"),
                xsec_token=post_item.get("xsec_token"),
                semaphore=semaphore,
            ) for post_item in note_list
        ]

        note_details = await asyncio.gather(*task_list)
        for note_detail in note_details:
            if note_detail:
                await xhs_store.update_xhs_note(note_detail, client=self.xhs_client)
                await self.get_notice_media(note_detail)

    async def get_specified_notes(self):
        """Get the information and comments of the specified post

        Note: Must specify note_id, xsec_source, xsec_token
        """
        get_note_detail_task_list = []
        for full_note_url in config.XHS_SPECIFIED_NOTE_URL_LIST:
            note_url_info: NoteUrlInfo = parse_note_info_from_note_url(full_note_url)
            utils.logger.info(f"[XiaoHongShuCrawler.get_specified_notes] Parse note url info: {note_url_info}")
            crawler_task = self.get_note_detail_async_task(
                note_id=note_url_info.note_id,
                xsec_source=note_url_info.xsec_source,
                xsec_token=note_url_info.xsec_token,
                semaphore=asyncio.Semaphore(config.MAX_CONCURRENCY_NUM),
            )
            get_note_detail_task_list.append(crawler_task)

        need_get_comment_note_ids = []
        xsec_tokens = []
        note_details = await asyncio.gather(*get_note_detail_task_list)
        for note_detail in note_details:
            if note_detail:
                need_get_comment_note_ids.append(note_detail.get("note_id", ""))
                xsec_tokens.append(note_detail.get("xsec_token", ""))
                await xhs_store.update_xhs_note(note_detail, client=self.xhs_client)
                await self.get_notice_media(note_detail)
        await self.batch_get_note_comments(need_get_comment_note_ids, xsec_tokens)

    async def get_note_detail_async_task(
        self,
        note_id: str,
        xsec_source: str,
        xsec_token: str,
        semaphore: asyncio.Semaphore,
    ) -> Optional[Dict]:
        """Get note detail

        Args:
            note_id:
            xsec_source:
            xsec_token:
            semaphore:

        Returns:
            Dict: note detail
        """
        note_detail = None
        utils.logger.info(f"[get_note_detail_async_task] Begin get note detail, note_id: {note_id}")
        async with semaphore:
            try:
                try:
                    note_detail = await self.xhs_client.get_note_by_id(note_id, xsec_source, xsec_token)
                except RetryError:
                    pass

                if not note_detail:
                    note_detail = await self.xhs_client.get_note_by_id_from_html(note_id, xsec_source, xsec_token,
                                                                                 enable_cookie=True)
                    if not note_detail:
                        raise Exception(f"[get_note_detail_async_task] Failed to get note detail, Id: {note_id}")

                note_detail.update({"xsec_token": xsec_token, "xsec_source": xsec_source})

                # Sleep after fetching note detail
                actual_sleep = await utils.random_sleep(config.CRAWLER_MAX_SLEEP_SEC)
                utils.logger.info(f"[get_note_detail_async_task] Random sleep {actual_sleep:.2f}s after note {note_id}")

                return note_detail

            except DataFetchError as ex:
                utils.logger.error(f"[XiaoHongShuCrawler.get_note_detail_async_task] Get note detail error: {ex}")
                return None
            except KeyError as ex:
                utils.logger.error(f"[XiaoHongShuCrawler.get_note_detail_async_task] have not fund note detail note_id:{note_id}, err: {ex}")
                return None


    async def batch_get_note_comments_data(self, note_list: List[str], xsec_tokens: List[str]) -> Dict[str, List[Dict]]:
        """Batch get note comments and return them instead of saving immediately"""
        if not config.ENABLE_GET_COMMENTS:
            return {}

        utils.logger.info(f"[XiaoHongShuCrawler.batch_get_note_comments_data] Begin batch get note comments data")
        semaphore = asyncio.Semaphore(config.MAX_CONCURRENCY_NUM)
        task_list: List[Task] = []
        for index, note_id in enumerate(note_list):
            task = asyncio.create_task(
                self.get_comments(note_id=note_id, xsec_token=xsec_tokens[index], semaphore=semaphore, callback=None),
                name=note_id,
            )
            task_list.append(task)
        
        results = await asyncio.gather(*task_list)
        
        comments_map = {}
        for note_id, comments in zip(note_list, results):
            comments_map[note_id] = comments if comments else []
        return comments_map

    async def batch_get_note_comments(self, note_list: List[str], xsec_tokens: List[str]):
        """Batch get note comments (Legacy: saves directly)"""
        if not config.ENABLE_GET_COMMENTS:
            utils.logger.info(f"[XiaoHongShuCrawler.batch_get_note_comments] Crawling comment mode is not enabled")
            return

        utils.logger.info(f"[XiaoHongShuCrawler.batch_get_note_comments] Begin batch get note comments, note list: {note_list}")
        semaphore = asyncio.Semaphore(config.MAX_CONCURRENCY_NUM)
        task_list: List[Task] = []
        for index, note_id in enumerate(note_list):
            task = asyncio.create_task(
                self.get_comments(note_id=note_id, xsec_token=xsec_tokens[index], semaphore=semaphore, callback=xhs_store.batch_update_xhs_note_comments),
                name=note_id,
            )
            task_list.append(task)
        await asyncio.gather(*task_list)

    async def get_comments(self, note_id: str, xsec_token: str, semaphore: asyncio.Semaphore, callback: Optional[Callable] = None):
        """Get note comments with keyword filtering and quantity limitation"""
        async with semaphore:
            utils.logger.info(f"[XiaoHongShuCrawler.get_comments] Begin get note id comments {note_id}")
            # Use fixed crawling interval
            crawl_interval = config.CRAWLER_MAX_SLEEP_SEC
            res = await self.xhs_client.get_note_all_comments(
                note_id=note_id,
                xsec_token=xsec_token,
                crawl_interval=crawl_interval,
                callback=callback,
                max_count=CRAWLER_MAX_COMMENTS_COUNT_SINGLENOTES,
            )

            # Sleep after fetching comments
            await asyncio.sleep(crawl_interval)
            utils.logger.info(f"[XiaoHongShuCrawler.get_comments] Sleeping for {crawl_interval} seconds after fetching comments for note {note_id}")
            return res

    async def create_xhs_client(self, httpx_proxy: Optional[str]) -> XiaoHongShuClient:
        """Create Xiaohongshu client"""
        utils.logger.info("[XiaoHongShuCrawler.create_xhs_client] Begin create Xiaohongshu API client ...")
        cookie_str, cookie_dict = utils.convert_cookies(await self.browser_context.cookies())
        xhs_client_obj = XiaoHongShuClient(
            proxy=httpx_proxy,
            headers={
                "accept": "application/json, text/plain, */*",
                "accept-language": "zh-CN,zh;q=0.9",
                "cache-control": "no-cache",
                "content-type": "application/json;charset=UTF-8",
                "origin": "https://www.xiaohongshu.com",
                "pragma": "no-cache",
                "priority": "u=1, i",
                "referer": "https://www.xiaohongshu.com/",
                "sec-ch-ua": '"Chromium";v="136", "Google Chrome";v="136", "Not.A/Brand";v="99"',
                "sec-ch-ua-mobile": "?0",
                "sec-ch-ua-platform": '"Windows"',
                "sec-fetch-dest": "empty",
                "sec-fetch-mode": "cors",
                "sec-fetch-site": "same-site",
                "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
                "Cookie": cookie_str,
            },
            playwright_page=self.context_page,
            cookie_dict=cookie_dict,
            proxy_ip_pool=self.ip_proxy_pool,  # Pass proxy pool for automatic refresh
        )
        return xhs_client_obj

    async def launch_browser(
        self,
        chromium: BrowserType,
        playwright_proxy: Optional[Dict],
        user_agent: Optional[str],
        headless: bool = True,
    ) -> BrowserContext:
        """Launch browser and create browser context"""
        utils.logger.info("[XiaoHongShuCrawler.launch_browser] Begin create browser context ...")
        if config.SAVE_LOGIN_STATE:
            # feat issue #14
            # we will save login state to avoid login every time
            user_data_dir = os.path.join(os.getcwd(), "browser_data", config.USER_DATA_DIR % config.PLATFORM)  # type: ignore
            browser_context = await chromium.launch_persistent_context(
                user_data_dir=user_data_dir,
                accept_downloads=True,
                headless=headless,
                proxy=playwright_proxy,  # type: ignore
                viewport={
                    "width": 1920,
                    "height": 1080
                },
                user_agent=user_agent,
            )
            return browser_context
        else:
            browser = await chromium.launch(headless=headless, proxy=playwright_proxy)  # type: ignore
            browser_context = await browser.new_context(viewport={"width": 1920, "height": 1080}, user_agent=user_agent)
            return browser_context

    async def launch_browser_with_cdp(
        self,
        playwright: Playwright,
        playwright_proxy: Optional[Dict],
        user_agent: Optional[str],
        headless: bool = True,
    ) -> BrowserContext:
        """Launch browser using CDP mode"""
        try:
            self.cdp_manager = CDPBrowserManager()
            browser_context = await self.cdp_manager.launch_and_connect(
                playwright=playwright,
                playwright_proxy=playwright_proxy,
                user_agent=user_agent,
                headless=headless,
            )

            # Display browser information
            browser_info = await self.cdp_manager.get_browser_info()
            utils.logger.info(f"[XiaoHongShuCrawler] CDP browser info: {browser_info}")

            return browser_context

        except Exception as e:
            utils.logger.error(f"[XiaoHongShuCrawler] CDP mode launch failed, falling back to standard mode: {e}")
            # Fall back to standard mode
            chromium = playwright.chromium
            return await self.launch_browser(chromium, playwright_proxy, user_agent, headless)

    async def close(self):
        """Close browser context"""
        # Special handling if using CDP mode
        if self.cdp_manager:
            await self.cdp_manager.cleanup()
            self.cdp_manager = None
        else:
            await self.browser_context.close()
        utils.logger.info("[XiaoHongShuCrawler.close] Browser context closed ...")

    async def get_notice_media(self, note_detail: Dict):
        if not config.ENABLE_GET_MEIDAS:
            utils.logger.info(f"[XiaoHongShuCrawler.get_notice_media] Crawling image mode is not enabled")
            return
        await self.get_note_images(note_detail)
        await self.get_notice_video(note_detail)

    async def get_note_images(self, note_item: Dict):
        """Get note images. Please use get_notice_media

        Args:
            note_item: Note item dictionary
        """
        if not config.ENABLE_GET_MEIDAS:
            return
        note_id = note_item.get("note_id")
        image_list: List[Dict] = note_item.get("image_list", [])

        for img in image_list:
            if img.get("url_default") != "":
                img.update({"url": img.get("url_default")})

        if not image_list:
            return
        picNum = 0
        for pic in image_list:
            url = pic.get("url")
            if not url:
                continue
            content = await self.xhs_client.get_note_media(url)
            await asyncio.sleep(random.random())
            if content is None:
                continue
            extension_file_name = f"{picNum}.jpg"
            picNum += 1
            await xhs_store.update_xhs_note_image(note_id, content, extension_file_name)

    async def get_notice_video(self, note_item: Dict):
        """Get note videos. Please use get_notice_media

        Args:
            note_item: Note item dictionary
        """
        if not config.ENABLE_GET_MEIDAS:
            return
        note_id = note_item.get("note_id")

        videos = xhs_store.get_video_url_arr(note_item)

        if not videos:
            return
        videoNum = 0
        for url in videos:
            content = await self.xhs_client.get_note_media(url)
            await asyncio.sleep(random.random())
            if content is None:
                continue
            extension_file_name = f"{videoNum}.mp4"
            videoNum += 1
            await xhs_store.update_xhs_note_video(note_id, content, extension_file_name)
