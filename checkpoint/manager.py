# -*- coding: utf-8 -*-
"""
Checkpoint Manager

Manages checkpoint persistence and retrieval for crawler resume functionality.
"""

import os
import json
from pathlib import Path
from datetime import datetime
from typing import List, Optional, Dict, Any

from .models import CrawlerCheckpoint, CheckpointStatus


class CheckpointManager:
    """
    Manages crawler checkpoints for pause/resume functionality
    
    Checkpoints are stored as JSON files in a dedicated directory.
    """

    def __init__(self, storage_path: str = "data/checkpoints"):
        """
        Initialize checkpoint manager
        
        Args:
            storage_path: Directory path for storing checkpoint files
        """
        self.storage_path = Path(storage_path)
        self.storage_path.mkdir(parents=True, exist_ok=True)

    def _get_checkpoint_path(self, task_id: str) -> Path:
        """Get the file path for a checkpoint"""
        return self.storage_path / f"{task_id}.json"

    async def save(self, checkpoint: CrawlerCheckpoint) -> None:
        """
        Save checkpoint to file
        
        Args:
            checkpoint: Checkpoint to save
        """
        checkpoint.last_update = datetime.now()
        file_path = self._get_checkpoint_path(checkpoint.task_id)
        
        # Write atomically by writing to temp file first
        temp_path = file_path.with_suffix('.tmp')
        temp_path.write_text(checkpoint.model_dump_json(indent=2), encoding='utf-8')
        temp_path.replace(file_path)

    async def load(self, task_id: str) -> Optional[CrawlerCheckpoint]:
        """
        Load checkpoint from file
        
        Args:
            task_id: Task ID to load
            
        Returns:
            CrawlerCheckpoint or None if not found
        """
        file_path = self._get_checkpoint_path(task_id)
        
        if not file_path.exists():
            return None
            
        try:
            data = json.loads(file_path.read_text(encoding='utf-8'))
            return CrawlerCheckpoint.model_validate(data)
        except Exception as e:
            print(f"[CheckpointManager] Failed to load checkpoint {task_id}: {e}")
            return None

    async def delete(self, task_id: str) -> bool:
        """
        Delete a checkpoint
        
        Args:
            task_id: Task ID to delete
            
        Returns:
            True if deleted, False if not found
        """
        file_path = self._get_checkpoint_path(task_id)
        
        if file_path.exists():
            file_path.unlink()
            return True
        return False

    async def list_checkpoints(
        self,
        platform: Optional[str] = None,
        status: Optional[CheckpointStatus] = None
    ) -> List[CrawlerCheckpoint]:
        """
        List all checkpoints, optionally filtered
        
        Args:
            platform: Filter by platform
            status: Filter by status
            
        Returns:
            List of checkpoints
        """
        checkpoints = []
        
        for file_path in self.storage_path.glob("*.json"):
            try:
                data = json.loads(file_path.read_text(encoding='utf-8'))
                checkpoint = CrawlerCheckpoint.model_validate(data)
                
                # Apply filters
                if platform and checkpoint.platform != platform:
                    continue
                if status and checkpoint.status != status:
                    continue
                    
                checkpoints.append(checkpoint)
            except Exception as e:
                print(f"[CheckpointManager] Failed to load checkpoint from {file_path}: {e}")
                continue
        
        # Sort by last_update (newest first)
        checkpoints.sort(key=lambda c: c.last_update, reverse=True)
        return checkpoints

    async def get_resumable_checkpoints(self, platform: Optional[str] = None) -> List[CrawlerCheckpoint]:
        """
        Get checkpoints that can be resumed (paused or running)
        
        Args:
            platform: Optional platform filter
            
        Returns:
            List of resumable checkpoints
        """
        all_checkpoints = await self.list_checkpoints(platform=platform)
        return [
            c for c in all_checkpoints 
            if c.status in (CheckpointStatus.PAUSED, CheckpointStatus.RUNNING)
        ]

    async def find_matching_checkpoint(
        self,
        platform: str,
        crawler_type: str,
        keywords: Optional[str] = None
    ) -> Optional[CrawlerCheckpoint]:
        """
        Find an existing checkpoint matching the given parameters
        
        This is useful to check if there's already a paused job that
        matches what the user is trying to start.
        
        Args:
            platform: Platform identifier
            crawler_type: Crawler type
            keywords: Keywords (for search mode)
            
        Returns:
            Matching checkpoint or None
        """
        all_checkpoints = await self.list_checkpoints(platform=platform)
        
        for checkpoint in all_checkpoints:
            if checkpoint.crawler_type != crawler_type:
                continue
            if checkpoint.status not in (CheckpointStatus.PAUSED, CheckpointStatus.RUNNING):
                continue
            if crawler_type == "search" and checkpoint.keywords != keywords:
                continue
            
            return checkpoint
        
        return None

    async def create_checkpoint(
        self,
        platform: str,
        crawler_type: str,
        keywords: Optional[str] = None,
        specified_ids: Optional[List[str]] = None,
        **metadata
    ) -> CrawlerCheckpoint:
        """
        Create a new checkpoint
        
        Args:
            platform: Platform identifier
            crawler_type: Crawler type
            keywords: Keywords for search mode
            specified_ids: IDs for detail/creator mode
            **metadata: Additional metadata
            
        Returns:
            New checkpoint instance
        """
        checkpoint = CrawlerCheckpoint(
            platform=platform,
            crawler_type=crawler_type,
            keywords=keywords,
            specified_ids=specified_ids,
            metadata=metadata
        )
        
        await self.save(checkpoint)
        return checkpoint

    async def cleanup_old_checkpoints(self, days: int = 7) -> int:
        """
        Clean up checkpoints older than specified days
        
        Args:
            days: Number of days to keep
            
        Returns:
            Number of checkpoints deleted
        """
        cutoff = datetime.now().timestamp() - (days * 24 * 60 * 60)
        deleted = 0
        
        for file_path in self.storage_path.glob("*.json"):
            try:
                stat = file_path.stat()
                if stat.st_mtime < cutoff:
                    file_path.unlink()
                    deleted += 1
            except Exception:
                continue
        
        return deleted

    def should_process_note(self, note_id: str, checkpoint: CrawlerCheckpoint) -> bool:
        """
        Check if a note should be processed (not already in checkpoint)
        
        Args:
            note_id: Note ID to check
            checkpoint: Current checkpoint
            
        Returns:
            True if note should be processed
        """
        return not checkpoint.is_note_processed(note_id)


# Global singleton instance
_checkpoint_manager: Optional[CheckpointManager] = None


def get_checkpoint_manager() -> CheckpointManager:
    """Get the global checkpoint manager instance"""
    global _checkpoint_manager
    if _checkpoint_manager is None:
        _checkpoint_manager = CheckpointManager()
    return _checkpoint_manager
