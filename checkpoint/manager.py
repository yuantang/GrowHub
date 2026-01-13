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


import os
import json
from pathlib import Path
from datetime import datetime
from typing import List, Optional, Dict, Any, Union
import uuid

from sqlalchemy import select, delete, update
from database.db_session import get_session
from database.growhub_models import GrowHubCheckpoint, GrowHubCheckpointNote
from .models import CrawlerCheckpoint, CheckpointStatus


class CheckpointManager:
    """
    Manages crawler checkpoints (DB-backed with JSON fallback)
    """

    def __init__(self, storage_path: str = "data/checkpoints"):
        self.storage_path = Path(storage_path)
        self.storage_path.mkdir(parents=True, exist_ok=True)

    async def save(self, checkpoint: CrawlerCheckpoint) -> None:
        """Save checkpoint to DB and File"""
        checkpoint.last_update = datetime.now()
        
        # 1. DB Persistence
        try:
            async with get_session() as session:
                db_checkpoint = await session.get(GrowHubCheckpoint, checkpoint.task_id)
                
                # Prepare data
                checkpoint_data = {
                    "platform": checkpoint.platform,
                    "crawler_type": checkpoint.crawler_type,
                    "keywords": checkpoint.keywords,
                    "current_keyword_index": checkpoint.current_keyword_index,
                    "current_page": checkpoint.current_page,
                    "cursor": checkpoint.cursor,
                    "specified_ids": json.dumps(checkpoint.specified_ids) if checkpoint.specified_ids else None,
                    "current_id_index": checkpoint.current_id_index,
                    "total_notes_fetched": checkpoint.total_notes_fetched,
                    "total_comments_fetched": checkpoint.total_comments_fetched,
                    "total_errors": checkpoint.total_errors,
                    "status": checkpoint.status.value,
                    "error_message": checkpoint.error_message,
                    "metadata_json": checkpoint.metadata,
                    "updated_at": checkpoint.last_update,
                    "completed_at": checkpoint.completed_at,
                    "project_id": checkpoint.project_id
                }

                if not db_checkpoint:
                    db_checkpoint = GrowHubCheckpoint(id=checkpoint.task_id, created_at=checkpoint.created_at, **checkpoint_data)
                    session.add(db_checkpoint)
                else:
                    for key, value in checkpoint_data.items():
                        setattr(db_checkpoint, key, value)
                
                await session.commit()
        except Exception as e:
            print(f"[CheckpointManager] DB save error: {e}")

        # 2. File Fallback (Keep for compatibility)
        file_path = self.storage_path / f"{checkpoint.task_id}.json"
        temp_path = file_path.with_suffix('.tmp')
        temp_path.write_text(checkpoint.model_dump_json(indent=2), encoding='utf-8')
        temp_path.replace(file_path)

    async def save_checkpoint(self, checkpoint: CrawlerCheckpoint) -> None:
        """Alias for save() for backward compatibility"""
        await self.save(checkpoint)

    async def load(self, task_id: str) -> Optional[CrawlerCheckpoint]:
        """Load from DB with File fallback"""
        # 1. Try DB
        try:
            async with get_session() as session:
                db_cp = await session.get(GrowHubCheckpoint, task_id)
                if db_cp:
                    # Convert back to Pydantic
                    return CrawlerCheckpoint(
                        task_id=db_cp.id,
                        platform=db_cp.platform,
                        crawler_type=db_cp.crawler_type,
                        keywords=db_cp.keywords,
                        current_keyword_index=db_cp.current_keyword_index,
                        current_page=db_cp.current_page,
                        cursor=db_cp.cursor,
                        specified_ids=json.loads(db_cp.specified_ids) if db_cp.specified_ids else [],
                        current_id_index=db_cp.current_id_index,
                        total_notes_fetched=db_cp.total_notes_fetched,
                        total_comments_fetched=db_cp.total_comments_fetched,
                        total_errors=db_cp.total_errors,
                        status=CheckpointStatus(db_cp.status),
                        error_message=db_cp.error_message,
                        metadata=db_cp.metadata_json or {},
                        created_at=db_cp.created_at,
                        last_update=db_cp.updated_at,
                        completed_at=db_cp.completed_at,
                        project_id=db_cp.project_id
                    )
        except Exception as e:
            print(f"[CheckpointManager] DB load error: {e}")

        # 2. Try File
        file_path = self.storage_path / f"{task_id}.json"
        if file_path.exists():
            try:
                data = json.loads(file_path.read_text(encoding='utf-8'))
                return CrawlerCheckpoint.model_validate(data)
            except Exception:
                pass
        return None

    # Granular Deduplication (Pro Feature)
    async def is_note_processed(self, checkpoint_id: str, note_id: str, note_type: str = "aweme") -> bool:
        """Check if note is processed in DB"""
        async with get_session() as session:
            stmt = select(GrowHubCheckpointNote).where(
                GrowHubCheckpointNote.checkpoint_id == checkpoint_id,
                GrowHubCheckpointNote.note_id == note_id,
                GrowHubCheckpointNote.note_type == note_type
            )
            result = await session.execute(stmt)
            return result.scalar_one_or_none() is not None

    async def add_processed_note(self, checkpoint_id: str, note_id: str, note_type: str = "aweme") -> None:
        """Add processed note to DB for large scale de-duplication"""
        async with get_session() as session:
            note = GrowHubCheckpointNote(
                checkpoint_id=checkpoint_id,
                note_id=note_id,
                note_type=note_type
            )
            session.add(note)
            
            # Record in main checkpoint stats too
            await session.execute(
                update(GrowHubCheckpoint)
                .where(GrowHubCheckpoint.id == checkpoint_id)
                .values(
                    total_notes_fetched=GrowHubCheckpoint.total_notes_fetched + 1 if note_type == "aweme" else GrowHubCheckpoint.total_notes_fetched,
                    total_comments_fetched=GrowHubCheckpoint.total_comments_fetched + 1 if note_type == "comment" else GrowHubCheckpoint.total_comments_fetched,
                    updated_at=datetime.now()
                )
            )
            await session.commit()

    async def find_matching_checkpoint(
        self,
        platform: str,
        crawler_type: str,
        keywords: Optional[str] = None,
        project_id: Optional[int] = None
    ) -> Optional[CrawlerCheckpoint]:
        """Find resumable checkpoint in DB"""
        async with get_session() as session:
            stmt = select(GrowHubCheckpoint).where(
                GrowHubCheckpoint.platform == platform,
                GrowHubCheckpoint.crawler_type == crawler_type,
                GrowHubCheckpoint.status.in_(['running', 'paused'])
            )
            if keywords:
                stmt = stmt.where(GrowHubCheckpoint.keywords == keywords)
            if project_id:
                stmt = stmt.where(GrowHubCheckpoint.project_id == project_id)

            
            result = await session.execute(stmt)
            db_cp = result.scalars().first()
            if db_cp:
                return await self.load(db_cp.id)
        return None

    async def create_checkpoint(
        self,
        platform: str,
        crawler_type: str,
        keywords: Optional[str] = None,
        specified_ids: Optional[List[str]] = None,
        project_id: Optional[int] = None,
        **metadata
    ) -> CrawlerCheckpoint:

        checkpoint = CrawlerCheckpoint(
            platform=platform,
            crawler_type=crawler_type,
            keywords=keywords,
            specified_ids=specified_ids,
            project_id=project_id,
            metadata=metadata
        )
        await self.save(checkpoint)
        return checkpoint

    async def delete(self, task_id: str) -> bool:
        """Delete from DB and File"""
        async with get_session() as session:
            await session.execute(delete(GrowHubCheckpointNote).where(GrowHubCheckpointNote.checkpoint_id == task_id))
            await session.execute(delete(GrowHubCheckpoint).where(GrowHubCheckpoint.id == task_id))
            await session.commit()
            
        file_path = self.storage_path / f"{task_id}.json"
        if file_path.exists():
            file_path.unlink()
            return True
        return True

    async def list_checkpoints(
        self,
        platform: Optional[str] = None,
        status: Optional[CheckpointStatus] = None
    ) -> List[CrawlerCheckpoint]:
        """List all checkpoints from DB with Pydantic conversion"""
        async with get_session() as session:
            stmt = select(GrowHubCheckpoint)
            if platform:
                stmt = stmt.where(GrowHubCheckpoint.platform == platform)
            if status:
                stmt = stmt.where(GrowHubCheckpoint.status == status.value)
            
            stmt = stmt.order_by(GrowHubCheckpoint.updated_at.desc())
            result = await session.execute(stmt)
            db_cps = result.scalars().all()
            
            checkpoints = []
            for db_cp in db_cps:
                # Use a combined approach: try to load from object properties
                cp = CrawlerCheckpoint(
                    task_id=db_cp.id,
                    platform=db_cp.platform,
                    crawler_type=db_cp.crawler_type,
                    keywords=db_cp.keywords,
                    current_keyword_index=db_cp.current_keyword_index,
                    current_page=db_cp.current_page,
                    cursor=db_cp.cursor,
                    specified_ids=json.loads(db_cp.specified_ids) if db_cp.specified_ids else [],
                    current_id_index=db_cp.current_id_index,
                    total_notes_fetched=db_cp.total_notes_fetched,
                    total_comments_fetched=db_cp.total_comments_fetched,
                    total_errors=db_cp.total_errors,
                    status=CheckpointStatus(db_cp.status),
                    error_message=db_cp.error_message,
                    metadata=db_cp.metadata_json or {},
                    created_at=db_cp.created_at,
                    last_update=db_cp.updated_at,
                    completed_at=db_cp.completed_at,
                    project_id=db_cp.project_id
                )
                checkpoints.append(cp)
            return checkpoints

    async def get_resumable_checkpoints(self, platform: Optional[str] = None) -> List[CrawlerCheckpoint]:
        """Get checkpoints that can be resumed (paused or running)"""
        async with get_session() as session:
            stmt = select(GrowHubCheckpoint).where(
                GrowHubCheckpoint.status.in_(['running', 'paused'])
            )
            if platform:
                stmt = stmt.where(GrowHubCheckpoint.platform == platform)
            
            result = await session.execute(stmt)
            db_cps = result.scalars().all()
            
            return [await self.load(cp.id) for cp in db_cps]

    async def cleanup_old_checkpoints(self, days: int = 7) -> int:
        """Clean up checkpoints and notes older than specified days"""
        cutoff = datetime.now().timestamp() - (days * 24 * 60 * 60)
        cutoff_dt = datetime.fromtimestamp(cutoff)
        
        async with get_session() as session:
            # 1. Get task_ids to delete
            stmt = select(GrowHubCheckpoint.id).where(GrowHubCheckpoint.updated_at < cutoff_dt)
            result = await session.execute(stmt)
            task_ids = result.scalars().all()
            
            if not task_ids:
                return 0
                
            # 2. Delete notes first due to foreign key
            await session.execute(
                delete(GrowHubCheckpointNote).where(GrowHubCheckpointNote.checkpoint_id.in_(task_ids))
            )
            
            # 3. Delete checkpoints
            await session.execute(
                delete(GrowHubCheckpoint).where(GrowHubCheckpoint.id.in_(task_ids))
            )
            
            await session.commit()
            
            # 4. Cleanup local files too
            for tid in task_ids:
                file_path = self.storage_path / f"{tid}.json"
                if file_path.exists():
                    file_path.unlink()
                    
            return len(task_ids)

    async def should_process_note(self, note_id: str, checkpoint: CrawlerCheckpoint) -> bool:
        """Check if note should be processed by checking DB directly"""
        return not await self.is_note_processed(checkpoint.task_id, note_id)


# Global singleton instance
_checkpoint_manager: Optional[CheckpointManager] = None


def get_checkpoint_manager() -> CheckpointManager:
    """Get the global checkpoint manager instance"""
    global _checkpoint_manager
    if _checkpoint_manager is None:
        _checkpoint_manager = CheckpointManager()
    return _checkpoint_manager
