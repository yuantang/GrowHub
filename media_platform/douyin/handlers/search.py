# -*- coding: utf-8 -*-

import asyncio
from typing import List, TYPE_CHECKING

import config
from tools import utils
from media_platform.douyin.field import PublishTimeType, SearchSortType, SearchChannelType
from media_platform.douyin.exception import DataFetchError
from var import request_keyword_var

if TYPE_CHECKING:
    from media_platform.douyin.client import DouYinClient
    from media_platform.douyin.processors.aweme_processor import AwemeProcessor
    from media_platform.douyin.processors.comment_processor import CommentProcessor
    from checkpoint.manager import CheckpointManager


class SearchHandler:
    def __init__(
        self,
        dy_client: "DouYinClient",
        checkpoint_manager: "CheckpointManager",
        aweme_processor: "AwemeProcessor",
        comment_processor: "CommentProcessor",
    ):
        self.dy_client = dy_client
        self.checkpoint_manager = checkpoint_manager
        self.aweme_processor = aweme_processor
        self.comment_processor = comment_processor

    async def handle(self):
        """
        Execute search crawler
        """
        utils.logger.info("[SearchHandler] Begin search douyin keywords")

        # Config validation and defaults
        dy_limit_count = 10
        if config.CRAWLER_MAX_NOTES_COUNT < dy_limit_count:
            config.CRAWLER_MAX_NOTES_COUNT = dy_limit_count
        start_page = config.START_PAGE

        # Iterate over keywords
        keywords = config.KEYWORDS.split(",")
        for keyword in keywords:
            keyword = keyword.strip()
            if not keyword:
                continue
                
            utils.logger.info(f"[SearchHandler] Current keyword: {keyword}")
            request_keyword_var.set(keyword)
            # Create or load checkpoint for this keyword task
            # In existing logic, there's no granular per-keyword checkpoint file unless we design it.
            # For compatibility with GrowHub's single checkpoint per task run (usually), 
            # we might be using a global checkpoint or creating one.
            # Let's assume we create a checkpoint for "Douyin Search" task.
            
            # Note: GrowHub's checkpoint system usually manages one active checkpoint. 
            # We'll retrieve or create one.
            checkpoint = await self.checkpoint_manager.find_matching_checkpoint(
                platform="douyin",
                crawler_type="search",
                keywords=keyword # simplifying to per-keyword checkpoint matching if possible
            )
            
            if not checkpoint:
                checkpoint = await self.checkpoint_manager.create_checkpoint(
                    platform="douyin",
                    crawler_type="search",
                    keywords=keyword
                )
            
            # Resume logic: Check if we have progress
            current_page = checkpoint.current_page
            if current_page > start_page:
                page = current_page
                utils.logger.info(f"[SearchHandler] Resuming from page {page}")
            else:
                page = start_page

            dy_search_id = checkpoint.metadata.get("dy_search_id", "")
            
            while (page - start_page + 1) * dy_limit_count <= config.CRAWLER_MAX_NOTES_COUNT:
                utils.logger.info(f"[SearchHandler] search keyword: {keyword}, page: {page}")
                
                try:
                    # Execute Search
                    posts_res = await self.dy_client.search_info_by_keyword(
                        keyword=keyword,
                        offset=(page - 1) * dy_limit_count,
                        search_channel=SearchChannelType.GENERAL,
                        sort_type=SearchSortType(config.SORT_TYPE) if hasattr(config, "SORT_TYPE") else SearchSortType.GENERAL,
                        publish_time=PublishTimeType(config.PUBLISH_TIME_TYPE),
                        search_id=dy_search_id,
                    )
                    
                    # Store search_id for next page
                    dy_search_id = posts_res.get("extra", {}).get("logid", "")
                    checkpoint.metadata["dy_search_id"] = dy_search_id

                    # Extract Aweme IDs
                    data_list = posts_res.get("data", [])
                    utils.logger.debug(f"[SearchHandler] Search Response keys: {posts_res.keys()}")
                    if not data_list:
                        utils.logger.warning(f"[SearchHandler] Page {page} data_list is empty. Raw Response Snippet: {str(posts_res)[:500]}")
                        utils.logger.info(f"[SearchHandler] Page {page} is empty, stopping.")
                        break

                    aweme_id_list = []
                    for item in data_list:
                        if item.get("type") == 1: # General video
                             aweme_info = item.get("aweme_info", {})
                             aweme_id = aweme_info.get("aweme_id")
                             if aweme_id:
                                 aweme_id_list.append(aweme_id)

                    utils.logger.info(f"[SearchHandler] Found {len(aweme_id_list)} videos on page {page}")

                    # Process Awemes (Detail + Storage)
                    await self.aweme_processor.batch_get_aweme_list_from_ids(
                        aweme_ids=aweme_id_list,
                        checkpoint=checkpoint
                    )

                    # Process Comments
                    if config.ENABLE_GET_COMMENTS:
                        await self.comment_processor.batch_get_aweme_comments(
                            aweme_list=aweme_id_list,
                            checkpoint=checkpoint
                        )
                        
                    # Update Progress
                    checkpoint.update_progress(page=page + 1)
                    await self.checkpoint_manager.save(checkpoint)
                    page += 1
                    
                    # Random Sleep
                    await asyncio.sleep(config.CRAWLER_TIME_SLEEP)

                except DataFetchError as e:
                    utils.logger.error(f"[SearchHandler] fetch error: {e}")
                    # Could implement retry or break depending on policy
                    break
                except Exception as e:
                    utils.logger.error(f"[SearchHandler] unexpected error: {e}")
                    break
            
            # Keyword finished
            checkpoint.mark_completed()
            await self.checkpoint_manager.save(checkpoint)
