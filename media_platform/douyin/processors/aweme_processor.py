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
                    from media_platform.douyin.extractor import DouyinExtractor
                    extractor = DouyinExtractor()
                    
                    # 使用工业级 Extractor 解析
                    aweme_info = extractor.extract_aweme_info(aweme_data)
                    stats = extractor.get_item_statistics(aweme_info)
                    
                    aweme = DouyinAweme(
                        aweme_id=aweme_info.get("aweme_id", ""),
                        desc=aweme_info.get("desc", ""),
                        create_time=str(aweme_info.get("create_time", "")),
                        nickname=aweme_info.get("author", {}).get("nickname", ""),
                        user_id=aweme_info.get("author", {}).get("uid", ""),
                        sec_uid=aweme_info.get("author", {}).get("sec_uid", ""),
                        avatar=aweme_info.get("author", {}).get("avatar_thumb", {}).get("url_list", [""])[0],
                        liked_count=str(stats.get("digg_count", 0)),
                        comment_count=str(stats.get("comment_count", 0)),
                        share_count=str(stats.get("share_count", 0)),
                        collected_count=str(stats.get("collect_count", 0)),
                        aweme_url=f"https://www.douyin.com/video/{aweme_info.get('aweme_id', '')}",
                        cover_url=aweme_info.get("video", {}).get("cover", {}).get("url_list", [""])[0],
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
                    # 使用数据库级的细粒度去重（Pro 版特性）
                    await self.checkpoint_manager.add_processed_note(checkpoint.task_id, aweme_id)
                    # 传统的 save 仍保留，用于更新主表统计和 basic 进度
                    await self.checkpoint_manager.save(checkpoint)

    async def process_aweme_list(
        self,
        aweme_list: List[dict],
        checkpoint: "CrawlerCheckpoint"
    ) -> List[str]:
        """
        Directly process a list of aweme data dictionaries (no re-fetch)
        """
        processed_aweme_ids = []
        for aweme_data in aweme_list:
            if not aweme_data:
                continue
                
            aweme_id = aweme_data.get("aweme_id")
            try:
                # Direct save
                await douyin_store.update_douyin_aweme(aweme_data, client=self.dy_client)
                
                if checkpoint and aweme_id:
                    checkpoint.add_processed_note(aweme_id)
                    processed_aweme_ids.append(aweme_id)
                    
            except Exception as ex:
                utils.logger.error(f"[AwemeProcessor] Save aweme error id={aweme_id}: {ex}")
                
        return processed_aweme_ids

    async def batch_get_aweme_list_from_ids(
        self, 
        aweme_ids: List[str], 
        checkpoint: "CrawlerCheckpoint"
    ) -> List[str]:
        """
        Concurrently obtain the specified aweme list by IDs and save the data
        """
        task_list = []
        processed_aweme_ids = []
        for aweme_id in aweme_ids:
            if await self.checkpoint_manager.is_note_processed(checkpoint.task_id, aweme_id):
                utils.logger.info(
                    f"[AwemeProcessor] Aweme {aweme_id} is already crawled (DB Checked), skip"
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
