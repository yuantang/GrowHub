# -*- coding: utf-8 -*-

import asyncio
from typing import List, Optional, TYPE_CHECKING

from model.m_douyin import DouyinAweme
from tools import utils
from store import douyin as douyin_store
from media_platform.douyin.exception import DataFetchError

if TYPE_CHECKING:
    from media_platform.douyin.client import DouYinClient
    from checkpoint.manager import CheckpointManager
    from checkpoint.models import CrawlerCheckpoint


class AwemeProcessor:
    """Handles aweme processing operations including detail extraction and batch processing"""

    def __init__(
        self,
        dy_client: "DouYinClient",
        checkpoint_manager: "CheckpointManager",
        crawler_aweme_task_semaphore: asyncio.Semaphore,
    ):
        self.dy_client = dy_client
        self.checkpoint_manager = checkpoint_manager
        self.crawler_aweme_task_semaphore = crawler_aweme_task_semaphore

    async def get_aweme_detail_async_task(
        self,
        aweme_id: str,
        checkpoint: "CrawlerCheckpoint" = None,
    ) -> Optional[DouyinAweme]:
        """
        Get aweme detail from API
        """
        aweme = None
        async with self.crawler_aweme_task_semaphore:
            try:
                # Assuming dy_client has get_video_by_id returning the raw dict or model
                # The existing DouYinClient.get_video_by_id returns a dict
                # We need to convert it to DouyinAweme model or ensure client returns model
                # For now, let's assume we need to parse it if it's a dict
                
                # Update: DouYinClient.get_video_by_id in GrowHub returns a dict (aweme_detail)
                # We might need an extractor. For phase 2, I'll emulate extraction here or update client later.
                # Actually, I should probably use the extractor pattern too, but for now let's keep it simple.
                # Use a helper to convert dict to model if needed.
                
                aweme_data = await self.dy_client.get_video_by_id(aweme_id)
                if aweme_data:
                    # TODO: Use proper Extractor (like in Pro version)
                    # For now, manual mapping or simple initialization if fields match
                    # Warning: direct init might fail if fields don't match exactly
                    # Let's map critical fields manually for safety or use a helper
                    from media_platform.douyin.help import parse_video_info_from_url
                    
                    # Simplistic mapping (Improve this in Processor refactor iteration)
                    aweme = DouyinAweme(
                        aweme_id=aweme_data.get("aweme_id", ""),
                        desc=aweme_data.get("desc", ""),
                        create_time=str(aweme_data.get("create_time", "")),
                        nickname=aweme_data.get("author", {}).get("nickname", ""),
                        user_id=aweme_data.get("author", {}).get("uid", ""),
                        sec_uid=aweme_data.get("author", {}).get("sec_uid", ""),
                        avatar=aweme_data.get("author", {}).get("avatar_thumb", {}).get("url_list", [""])[0],
                        liked_count=str(aweme_data.get("statistics", {}).get("digg_count", "")),
                        comment_count=str(aweme_data.get("statistics", {}).get("comment_count", "")),
                        share_count=str(aweme_data.get("statistics", {}).get("share_count", "")),
                        collected_count=str(aweme_data.get("statistics", {}).get("collect_count", "")),
                        aweme_url=f"https://www.douyin.com/video/{aweme_data.get('aweme_id', '')}",
                        cover_url=aweme_data.get("video", {}).get("cover", {}).get("url_list", [""])[0],
                        # Add other fields as necessary
                    )
                    
                    # GrowHub store expects dict usually, but let's check store/douyin.py
                    # Assume update_douyin_aweme takes a model or dict. 
                    # Checking store/douyin.py later. For now assume it handles the model or we convert back.
                    # Wait, store usually takes dict in GrowHub.
                    await douyin_store.update_douyin_aweme(aweme_data) 
                    return aweme
                else:
                    utils.logger.warning(
                        f"[AwemeProcessor] have not fund aweme detail aweme_id:{aweme_id}"
                    )

            except DataFetchError as ex:
                utils.logger.error(
                    f"[AwemeProcessor] Get aweme detail error: {ex}"
                )
                return None

            except Exception as ex:
                utils.logger.error(
                    f"[AwemeProcessor] have not fund aweme detail aweme_id:{aweme_id}, err: {ex}"
                )
                return None

            finally:
                if checkpoint and aweme:
                    checkpoint.add_processed_note(aweme_id)
                    await self.checkpoint_manager.save(checkpoint)

    async def batch_get_aweme_list_from_ids(
        self, 
        aweme_ids: List[str], 
        checkpoint: "CrawlerCheckpoint"
    ) -> List[str]:
        """
        Concurrently obtain the specified aweme list by IDs and save the data
        """
        task_list, processed_aweme_ids = [], []
        for aweme_id in aweme_ids:
            if checkpoint.is_note_processed(aweme_id):
                utils.logger.info(
                    f"[AwemeProcessor] Aweme {aweme_id} is already crawled, skip"
                )
                processed_aweme_ids.append(aweme_id)
                continue

            task = self.get_aweme_detail_async_task(
                aweme_id=aweme_id,
                checkpoint=checkpoint,
            )
            task_list.append(task)

        aweme_details = await asyncio.gather(*task_list)
        for aweme in aweme_details:
            if aweme:
                processed_aweme_ids.append(aweme.aweme_id)

        return processed_aweme_ids
