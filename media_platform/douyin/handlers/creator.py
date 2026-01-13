# -*- coding: utf-8 -*-

import asyncio
from typing import List, TYPE_CHECKING
import config
from tools import utils
from media_platform.douyin.exception import DataFetchError

if TYPE_CHECKING:
    from media_platform.douyin.client import DouYinClient
    from media_platform.douyin.processors.aweme_processor import AwemeProcessor
    from media_platform.douyin.processors.comment_processor import CommentProcessor
    from checkpoint.manager import CheckpointManager


class CreatorHandler:
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
        Execute creator crawler
        """
        utils.logger.info("[CreatorHandler] Begin crawl creators")
        
        creators = config.DY_CREATOR_ID_LIST
        if not creators:
            utils.logger.warning("[CreatorHandler] DY_CREATOR_ID_LIST is empty")
            return

        for sec_user_id in creators:
            utils.logger.info(f"[CreatorHandler] Processing creator: {sec_user_id}")
            
            # Checkpoint per creator or global? Strategy: One checkpoint for "creator" type with metadata
            checkpoint = await self.checkpoint_manager.find_matching_checkpoint(
                platform="douyin",
                crawler_type="creator",
                keywords=sec_user_id, # reusing keywords field as identifier
                project_id=config.PROJECT_ID if hasattr(config, "PROJECT_ID") else None
            )
            if not checkpoint:
                checkpoint = await self.checkpoint_manager.create_checkpoint(
                    platform="douyin",
                    crawler_type="creator",
                    keywords=sec_user_id,
                    project_id=config.PROJECT_ID if hasattr(config, "PROJECT_ID") else None
                )

            # Get User Info
            # TODO: Add UserProcessor? For now handled by client/handler
            try:
                user_info = await self.dy_client.get_user_info(sec_user_id)
                # Save user info (TODO: implement store logic for creator)
            except Exception as e:
                utils.logger.error(f"[CreatorHandler] Failed to get user info: {e}")

            # Get Videos
            max_cursor = checkpoint.cursor or "0"
            has_more = True
            
            while has_more:
                try:
                    res = await self.dy_client.get_user_aweme_posts(sec_user_id, max_cursor)
                    has_more = res.get("has_more", 0) == 1
                    max_cursor = str(res.get("max_cursor", 0))
                    
                    aweme_list = res.get("aweme_list", [])
                    aweme_ids = [item.get("aweme_id") for item in aweme_list if item.get("aweme_id")]
                    
                    if not aweme_ids:
                        break

                    # Process Videos
                    await self.aweme_processor.batch_get_aweme_list_from_ids(
                         aweme_ids=aweme_ids,
                         checkpoint=checkpoint
                    )
                    
                    # Process Comments
                    if config.ENABLE_GET_COMMENTS:
                        await self.comment_processor.batch_get_aweme_comments(
                            aweme_list=aweme_ids,
                            checkpoint=checkpoint
                        )

                    checkpoint.cursor = max_cursor
                    await self.checkpoint_manager.save(checkpoint)
                    await asyncio.sleep(config.CRAWLER_TIME_SLEEP)
                    
                except Exception as e:
                    utils.logger.error(f"[CreatorHandler] Error processing page: {e}")
                    break

            checkpoint.mark_completed()
            await self.checkpoint_manager.save(checkpoint)
            
        utils.logger.info("[CreatorHandler] All creators processed")
