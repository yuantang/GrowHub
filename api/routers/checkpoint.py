# -*- coding: utf-8 -*-
"""
Checkpoint API Router

Provides API endpoints for managing crawler checkpoints (pause/resume).
"""

from typing import Optional, List
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from checkpoint import get_checkpoint_manager, CrawlerCheckpoint, CheckpointStatus

router = APIRouter(prefix="/checkpoints", tags=["checkpoints"])


class CheckpointSummary(BaseModel):
    """Summary of a checkpoint for API response"""
    task_id: str
    platform: str
    crawler_type: str
    keywords: Optional[str]
    status: str
    notes_fetched: int
    current_page: int
    created_at: str
    last_update: str


class CheckpointListResponse(BaseModel):
    """Response for checkpoint list"""
    checkpoints: List[CheckpointSummary]
    total: int


@router.get("", response_model=CheckpointListResponse)
async def list_checkpoints(
    platform: Optional[str] = None,
    status: Optional[str] = None
):
    """
    List all checkpoints
    
    Args:
        platform: Optional filter by platform
        status: Optional filter by status (running, paused, completed, failed)
    """
    manager = get_checkpoint_manager()
    
    status_enum = None
    if status:
        try:
            status_enum = CheckpointStatus(status)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid status. Valid values: {[s.value for s in CheckpointStatus]}"
            )
    
    checkpoints = await manager.list_checkpoints(platform=platform, status=status_enum)
    
    summaries = [
        CheckpointSummary(
            task_id=c.task_id,
            platform=c.platform,
            crawler_type=c.crawler_type,
            keywords=c.keywords,
            status=c.status.value,
            notes_fetched=c.total_notes_fetched,
            current_page=c.current_page,
            created_at=c.created_at.isoformat(),
            last_update=c.updated_at.isoformat(),
        )
        for c in checkpoints
    ]
    
    return CheckpointListResponse(checkpoints=summaries, total=len(summaries))


@router.get("/resumable")
async def get_resumable_checkpoints(platform: Optional[str] = None):
    """
    Get checkpoints that can be resumed
    """
    manager = get_checkpoint_manager()
    checkpoints = await manager.get_resumable_checkpoints(platform=platform)
    
    return {
        "checkpoints": [c.to_summary() for c in checkpoints],
        "total": len(checkpoints)
    }


@router.get("/{task_id}")
async def get_checkpoint(task_id: str):
    """
    Get details of a specific checkpoint
    """
    manager = get_checkpoint_manager()
    checkpoint = await manager.load(task_id)
    
    if not checkpoint:
        raise HTTPException(status_code=404, detail="Checkpoint not found")
    
    return checkpoint.to_summary()


@router.delete("/{task_id}")
async def delete_checkpoint(task_id: str):
    """
    Delete a checkpoint
    """
    manager = get_checkpoint_manager()
    deleted = await manager.delete(task_id)
    
    if not deleted:
        raise HTTPException(status_code=404, detail="Checkpoint not found")
    
    return {"message": "Checkpoint deleted successfully"}


@router.post("/{task_id}/pause")
async def pause_checkpoint(task_id: str):
    """
    Mark a checkpoint as paused
    """
    manager = get_checkpoint_manager()
    checkpoint = await manager.load(task_id)
    
    if not checkpoint:
        raise HTTPException(status_code=404, detail="Checkpoint not found")
    
    checkpoint.mark_paused()
    await manager.save(checkpoint)
    
    return {"message": "Checkpoint paused", "task_id": task_id}


@router.post("/cleanup")
async def cleanup_old_checkpoints(days: int = 7):
    """
    Clean up checkpoints older than specified days
    
    Args:
        days: Number of days to keep (default: 7)
    """
    manager = get_checkpoint_manager()
    deleted = await manager.cleanup_old_checkpoints(days=days)
    
    return {"message": f"Deleted {deleted} old checkpoints"}
