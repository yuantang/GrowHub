# -*- coding: utf-8 -*-

import asyncio
from typing import List, TYPE_CHECKING, Dict

import config
from model.m_douyin import DouyinAwemeComment
from tools import utils
from store import douyin as douyin_store
from media_platform.douyin.exception import DataFetchError

if TYPE_CHECKING:
    from media_platform.douyin.client import DouYinClient
    from checkpoint.manager import CheckpointManager
    from checkpoint.models import CrawlerCheckpoint


class CommentProcessor:
    """Handles comment processing operations including batch processing"""

    def __init__(
        self,
        dy_client: "DouYinClient",
        checkpoint_manager: "CheckpointManager",
        crawler_comment_semaphore: asyncio.Semaphore
    ):
        self.dy_client = dy_client
        self.checkpoint_manager = checkpoint_manager
        self.crawler_comment_semaphore = crawler_comment_semaphore

    async def batch_get_aweme_comments(
        self,
        aweme_list: List[str],
        checkpoint: "CrawlerCheckpoint",
    ):
        """
        Batch get aweme comments
        """
        if not config.ENABLE_GET_COMMENTS:
            return

        utils.logger.info(
            f"[CommentProcessor] Begin batch get aweme comments, aweme list: {aweme_list}"
        )
        task_list = []
        for aweme_id in aweme_list:
            if not aweme_id:
                continue

            # Check if comments for this note are already fully crawled
            # leveraging metadata to store completed notes for comments
            # metadata structure: {"comments_completed_notes": [id1, id2]}
            completed_notes = checkpoint.metadata.get("comments_completed_notes", [])
            if aweme_id in completed_notes:
                utils.logger.info(
                    f"[CommentProcessor] Aweme {aweme_id} comments already crawled, skip"
                )
                continue

            task = asyncio.create_task(
                self.get_comments_async_task(
                    aweme_id,
                    checkpoint=checkpoint,
                ),
                name=aweme_id,
            )
            task_list.append(task)

        if len(task_list) > 0:
            await asyncio.wait(task_list)

    async def get_comments_async_task(
        self,
        aweme_id: str,
        checkpoint: "CrawlerCheckpoint",
    ):
        """
        Get aweme comments
        """
        async with self.crawler_comment_semaphore:
            try:
                utils.logger.info(
                    f"[CommentProcessor] Begin get aweme id comments {aweme_id}"
                )
                await self.get_aweme_all_comments(
                    aweme_id=aweme_id,
                    checkpoint=checkpoint
                )
                utils.logger.info(
                    f"[CommentProcessor] aweme_id: {aweme_id} comments have all been obtained ..."
                )
            except DataFetchError as e:
                utils.logger.error(
                    f"[CommentProcessor] aweme_id: {aweme_id} get comments failed, error: {e}"
                )

    async def get_aweme_all_comments(
        self,
        aweme_id: str,
        checkpoint: "CrawlerCheckpoint"
    ):
        """
        Fetch all comments for a video
        """
        result = []
        comments_has_more = 1
        comments_cursor = 0

        # Resume from checkpoint metadata
        # metadata structure: {"note_comment_cursors": {"note_id": cursor}}
        cursors = checkpoint.metadata.get("note_comment_cursors", {})
        if aweme_id in cursors:
            comments_cursor = cursors[aweme_id]
            utils.logger.info(f"[CommentProcessor] Resuming comments for {aweme_id} from cursor {comments_cursor}")

        while comments_has_more:
            # dy_client.get_aweme_comments returns dict, need parsing
            comments_data = await self.dy_client.get_aweme_comments(aweme_id, comments_cursor)
            
            # Manual Parsing or use Extractor (TODO: Refactor into Extractor)
            # Adapting to match DouyinAwemeComment model
            raw_comments = comments_data.get("comments") or []
            comments = raw_comments

            comments_has_more = comments_data.get("has_more", 0)
            comments_cursor = comments_data.get("cursor", 0)

            # Update checkpoint
            if checkpoint:
                cursors = checkpoint.metadata.get("note_comment_cursors", {})
                cursors[aweme_id] = comments_cursor
                checkpoint.metadata["note_comment_cursors"] = cursors
                # Checkpoint save might be too frequent here, can optimize to save every N pages
                # For now save every page for safety
                await self.checkpoint_manager.save(checkpoint)

            if not comments:
                continue
                
            # DB-backed granular deduplication for comments (Pro Feature)
            for comment in comments:
                comment_id = comment.get("cid")
                if comment_id:
                    await self.checkpoint_manager.add_processed_note(checkpoint.task_id, comment_id, note_type="comment")
                    
            result.extend(comments)
            # Save to Store
            await douyin_store.batch_update_dy_aweme_comments(aweme_id, comments) 
            
            if config.PER_NOTE_MAX_COMMENTS_COUNT > 0 and len(result) >= config.PER_NOTE_MAX_COMMENTS_COUNT:
                break
                
            await asyncio.sleep(config.CRAWLER_TIME_SLEEP)
            
            # Sub-comments logic
            if config.ENABLE_GET_SUB_COMMENTS:
                 sub_comments = await self.get_comments_all_sub_comments(aweme_id, comments)
                 result.extend(sub_comments)

        # Mark completed
        if checkpoint:
            completed = checkpoint.metadata.get("comments_completed_notes", [])
            if aweme_id not in completed:
                completed.append(aweme_id)
                checkpoint.metadata["comments_completed_notes"] = completed
                # Clean up cursor to save space
                if aweme_id in checkpoint.metadata.get("note_comment_cursors", {}):
                    del checkpoint.metadata["note_comment_cursors"][aweme_id]
                await self.checkpoint_manager.save(checkpoint)

        return result

    async def get_comments_all_sub_comments(
        self,
        aweme_id: str,
        comments: List[DouyinAwemeComment]
    ) -> List[DouyinAwemeComment]:
        """
        Get sub comments
        """
        # Similar implementation to main comments but for sub-comments
        # Skipping simplified for brevity, following the pattern above
        # In real impl, copy logic from Pro version or client.py
        return []
