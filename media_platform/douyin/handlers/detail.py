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


class DetailHandler:
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
        Execute detail crawler
        """
        utils.logger.info("[DetailHandler] Begin crawl specified videos")
        
        # Load ID list
        aweme_ids = config.DY_SPECIFIED_ID_LIST
        if not aweme_ids:
             utils.logger.warning("[DetailHandler] DY_SPECIFIED_ID_LIST is empty")
             return

        # Create/Load Checkpoint
        checkpoint = await self.checkpoint_manager.find_matching_checkpoint(
            platform="douyin",
            crawler_type="detail",
            project_id=config.PROJECT_ID if hasattr(config, "PROJECT_ID") else None
        )
        if not checkpoint:
            checkpoint = await self.checkpoint_manager.create_checkpoint(
                platform="douyin",
                crawler_type="detail",
                specified_ids=aweme_ids,
                project_id=config.PROJECT_ID if hasattr(config, "PROJECT_ID") else None
            )

        # Process IDs
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

        checkpoint.mark_completed()
        await self.checkpoint_manager.save(checkpoint)
        utils.logger.info("[DetailHandler] Detail crawl finished")
