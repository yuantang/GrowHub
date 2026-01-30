# -*- coding: utf-8 -*-
# Copyright (c) 2025 relakkes@gmail.com
#
# This file is part of MediaCrawler project.
# Repository: https://github.com/NanmiCoder/MediaCrawler/blob/main/main.py
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

import sys
import io

# Force UTF-8 encoding for stdout/stderr to prevent encoding errors
# when outputting Chinese characters in non-UTF-8 terminals
if sys.stdout and hasattr(sys.stdout, 'buffer'):
    if sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
if sys.stderr and hasattr(sys.stderr, 'buffer'):
    if sys.stderr.encoding and sys.stderr.encoding.lower() != 'utf-8':
        sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

import asyncio
from typing import Optional, Type

import cmd_arg
import config
from database import db
from base.base_crawler import AbstractCrawler
from media_platform.bilibili import BilibiliCrawler
from media_platform.douyin import DouYinCrawler
from media_platform.kuaishou import KuaishouCrawler
from media_platform.tieba import TieBaCrawler
from media_platform.weibo import WeiboCrawler
from media_platform.xhs import XiaoHongShuCrawler
from media_platform.zhihu import ZhihuCrawler
from tools.async_file_writer import AsyncFileWriter
from var import crawler_type_var


class CrawlerFactory:
    CRAWLERS: dict[str, Type[AbstractCrawler]] = {
        "xhs": XiaoHongShuCrawler,
        "dy": DouYinCrawler,
        "ks": KuaishouCrawler,
        "bili": BilibiliCrawler,
        "wb": WeiboCrawler,
        "tieba": TieBaCrawler,
        "zhihu": ZhihuCrawler,
    }

    @staticmethod
    def create_crawler(platform: str) -> AbstractCrawler:
        crawler_class = CrawlerFactory.CRAWLERS.get(platform)
        if not crawler_class:
            supported = ", ".join(sorted(CrawlerFactory.CRAWLERS))
            raise ValueError(f"Invalid media platform: {platform!r}. Supported: {supported}")
        return crawler_class()


crawler: Optional[AbstractCrawler] = None


def _flush_excel_if_needed() -> None:
    if config.SAVE_DATA_OPTION != "excel":
        return

    try:
        from store.excel_store_base import ExcelStoreBase

        ExcelStoreBase.flush_all()
        print("[Main] Excel files saved successfully")
    except Exception as e:
        print(f"[Main] Error flushing Excel data: {e}")


async def _generate_wordcloud_if_needed() -> None:
    if config.SAVE_DATA_OPTION != "json" or not config.ENABLE_GET_WORDCLOUD:
        return

    try:
        file_writer = AsyncFileWriter(
            platform=config.PLATFORM,
            crawler_type=crawler_type_var.get(),
        )
        await file_writer.generate_wordcloud_from_comments()
    except Exception as e:
        print(f"[Main] Error generating wordcloud: {e}")


async def main() -> None:
    global crawler

    args = await cmd_arg.parse_cmd()
    
    # Force update config from args to ensure main.py uses the correct values
    config.PLATFORM = args.platform
    config.LOGIN_TYPE = args.lt
    config.CRAWLER_TYPE = args.type
    config.KEYWORDS = args.keywords
    config.START_PAGE = args.start
    config.ENABLE_GET_COMMENTS = args.get_comment
    config.ENABLE_GET_SUB_COMMENTS = args.get_sub_comment
    config.HEADLESS = args.headless
    config.SAVE_DATA_OPTION = args.save_data_option
    config.COOKIES = args.cookies
    config.START_TIME = getattr(args, 'start_time', "")
    config.END_TIME = getattr(args, 'end_time', "")
    config.PROJECT_ID = getattr(args, 'project_id', 0)
    config.DEDUPLICATE_AUTHORS = getattr(args, 'deduplicate_authors', "false").lower() == "true"
    config.MAX_LIKES_COUNT = getattr(args, 'max_likes', 0)
    config.MAX_SHARES_COUNT = getattr(args, 'max_shares', 0)
    config.MAX_COMMENTS_COUNT = getattr(args, 'max_comments', 0)
    config.MAX_FAVORITES_COUNT = getattr(args, 'max_favorites', 0)
    config.MAX_CONCURRENCY_NUM = getattr(args, 'concurrency_num', 3)
    config.MIN_FANS = getattr(args, 'min_fans', 0)
    config.MAX_FANS = getattr(args, 'max_fans', 0)
    config.REQUIRE_CONTACT = getattr(args, 'require_contact', False)
    config.PURPOSE = getattr(args, 'purpose', 'general')
    
    # Handle sentiment_keywords (already parsed in main.py logic below, but let's set it in config too)
    s_kws = getattr(args, 'sentiment_keywords', "")
    if isinstance(s_kws, str):
        config.SENTIMENT_KEYWORDS = [k.strip() for k in s_kws.split(",") if k.strip()]
    else:
        config.SENTIMENT_KEYWORDS = s_kws or []
    
    print(f"[Debug] Config loaded - Start Time: {config.START_TIME}, End Time: {config.END_TIME}, Keywords: {config.KEYWORDS}, Project ID: {config.PROJECT_ID}, Purpose: {config.PURPOSE}")

    # Set context variables
    from var import project_id_var, min_fans_var, max_fans_var, require_contact_var, sentiment_keywords_var, purpose_var
    if config.PROJECT_ID:
        project_id_var.set(int(config.PROJECT_ID))
    
    # 设置博主筛选和舆情配置
    if hasattr(args, 'min_fans') and args.min_fans:
        min_fans_var.set(args.min_fans)
    if hasattr(args, 'max_fans') and args.max_fans:
        max_fans_var.set(args.max_fans)
    if hasattr(args, 'require_contact') and args.require_contact:
        require_contact_var.set(args.require_contact)
    if hasattr(args, 'sentiment_keywords') and args.sentiment_keywords:
        # sentiment_keywords might be passed as a string from command line or already a list
        if isinstance(args.sentiment_keywords, str):
            s_keywords = [k.strip() for k in args.sentiment_keywords.split(",") if k.strip()]
        else:
            s_keywords = args.sentiment_keywords
        sentiment_keywords_var.set(s_keywords)
    
    # 设置任务目的 (驱动数据分流)
    if hasattr(args, 'purpose') and args.purpose:
        purpose_var.set(args.purpose)

    if args.init_db:
        await db.init_db(args.init_db)
        print(f"Database {args.init_db} initialized successfully.")
        return

    if config.SAVE_DATA_OPTION in ["sqlite", "db", "mysql"]:
        await db.init_db(config.SAVE_DATA_OPTION)

    # GrowHub Patch: Fetch cookies from Account Pool if account_id is provided
    if config.ACCOUNT_ID and not config.COOKIES:
        print(f"[Main] Account ID {config.ACCOUNT_ID} provided. Fetching cookies from DB...")
        try:
            from database.db_session import get_session
            from database.growhub_models import GrowHubAccount
            from sqlalchemy import select
            
            async with get_session() as session:
                result = await session.execute(
                    select(GrowHubAccount).where(GrowHubAccount.id == config.ACCOUNT_ID)
                )
                account = result.scalar_one_or_none()
                if account and account.cookies:
                    config.COOKIES = account.cookies
                    config.LOGIN_TYPE = "cookie"
                    
                    # Inject Fingerprint (User-Agent) if available
                    if account.fingerprint and isinstance(account.fingerprint, dict):
                        ua = account.fingerprint.get("userAgent")
                        if ua:
                            config.DEFAULT_USER_AGENT = ua
                            print(f"[Main] Using Synced User-Agent: {ua[:50]}...")
                            
                    print(f"[Main] Successfully loaded cookies for account: {account.account_name}")
                else:
                    print(f"[Main] Warning: Account {config.ACCOUNT_ID} not found or has no cookies.")
        except Exception as e:
            print(f"[Main] Error fetching account cookies: {e}")

    crawler = CrawlerFactory.create_crawler(platform=config.PLATFORM)
    await crawler.start()

    _flush_excel_if_needed()

    # Generate wordcloud after crawling is complete
    # Only for JSON save mode
    await _generate_wordcloud_if_needed()


async def async_cleanup() -> None:
    global crawler
    if crawler:
        if getattr(crawler, "cdp_manager", None):
            try:
                await crawler.cdp_manager.cleanup(force=True)
            except Exception as e:
                error_msg = str(e).lower()
                if "closed" not in error_msg and "disconnected" not in error_msg:
                    print(f"[Main] Error cleaning up CDP browser: {e}")

        elif getattr(crawler, "browser_context", None):
            try:
                await crawler.browser_context.close()
            except Exception as e:
                error_msg = str(e).lower()
                if "closed" not in error_msg and "disconnected" not in error_msg:
                    print(f"[Main] Error closing browser context: {e}")

    if config.SAVE_DATA_OPTION in ("db", "sqlite"):
        await db.close()

if __name__ == "__main__":
    from tools.app_runner import run

    def _force_stop() -> None:
        c = crawler
        if not c:
            return
        cdp_manager = getattr(c, "cdp_manager", None)
        launcher = getattr(cdp_manager, "launcher", None)
        if not launcher:
            return
        try:
            launcher.cleanup()
        except Exception:
            pass

    run(main, async_cleanup, cleanup_timeout_seconds=15.0, on_first_interrupt=_force_stop)
