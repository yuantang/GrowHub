# -*- coding: utf-8 -*-

import asyncio
from typing import List, TYPE_CHECKING
import config
from tools import utils

if TYPE_CHECKING:
    from media_platform.douyin.client import DouYinClient
    from media_platform.douyin.processors.aweme_processor import AwemeProcessor
    from media_platform.douyin.processors.comment_processor import CommentProcessor
    from checkpoint.manager import CheckpointManager


class HomefeedHandler:
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
        Execute homefeed crawler
        """
        utils.logger.info("[HomefeedHandler] Begin crawl homefeed")
        
        # Checkpoint (Single running instance usually)
        checkpoint = await self.checkpoint_manager.find_matching_checkpoint(
            platform="douyin",
            crawler_type="homefeed"
        )
        if not checkpoint:
            checkpoint = await self.checkpoint_manager.create_checkpoint(
                platform="douyin",
                crawler_type="homefeed"
            )

        page = 0
        max_pages = 20 # Guard rail
        
        while page < max_pages: 
             try:
                 res = await self.dy_client.get_homefeed(refresh_type=1)
                 # Note: Homefeed endpoint behavior is complex, usually stream.
                 # Simplified here based on core.py logic
                 
                 data_list = res.get("data", []) # Or aweme_list depending on API? core.py uses get_homefeed impl
                 # Client get_homefeed returns res.json()
                 
                 aweme_list = res.get("aweme_list", [])
                 if not aweme_list:
                     # Try data field if structure differs?
                     aweme_list = res.get("data", [])

                 if not aweme_list:
                     utils.logger.info("[HomefeedHandler] No more data")
                     break

                 aweme_ids = [item.get("aweme_id") for item in aweme_list if item.get("aweme_id")]
                 
                 await self.aweme_processor.batch_get_aweme_list_from_ids(
                     aweme_ids=aweme_ids,
                     checkpoint=checkpoint
                 )
                 
                 if config.ENABLE_GET_COMMENTS:
                     await self.comment_processor.batch_get_aweme_comments(
                         aweme_list=aweme_ids,
                         checkpoint=checkpoint
                     )
                 
                 await asyncio.sleep(config.CRAWLER_TIME_SLEEP)
                 page += 1
                 
             except Exception as e:
                 utils.logger.error(f"[HomefeedHandler] Error: {e}")
                 break
        
        utils.logger.info("[HomefeedHandler] Homefeed crawl finished")
