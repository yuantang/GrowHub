# -*- coding: utf-8 -*-
"""
Checkpoint Models

Data models for crawler checkpoint/resume functionality.
"""

from datetime import datetime
from typing import List, Optional, Dict, Any
from enum import Enum
from pydantic import BaseModel, Field
import uuid


class CheckpointStatus(str, Enum):
    """Checkpoint status enumeration"""
    RUNNING = "running"
    PAUSED = "paused"
    COMPLETED = "completed"
    FAILED = "failed"


class CrawlerCheckpoint(BaseModel):
    """
    Checkpoint data model for crawler state persistence
    
    Stores all necessary information to resume a crawler from where it stopped.
    """
    
    # Unique identifier for this checkpoint
    task_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    
    # Basic crawler configuration
    platform: str
    crawler_type: str  # search, detail, creator, homefeed
    
    # Search mode specific
    keywords: Optional[str] = None
    current_keyword_index: int = 0
    current_page: int = 1
    
    # HomeFeed mode specific
    cursor: Optional[str] = None
    
    # Detail/Creator mode specific
    specified_ids: Optional[List[str]] = None
    current_id_index: int = 0
    
    # Processed items tracking (for deduplication)
    processed_note_ids: List[str] = Field(default_factory=list)
    processed_comment_ids: List[str] = Field(default_factory=list)
    processed_creator_ids: List[str] = Field(default_factory=list)
    
    # Statistics
    total_notes_fetched: int = 0
    total_comments_fetched: int = 0
    total_errors: int = 0
    
    # Timestamps
    created_at: datetime = Field(default_factory=datetime.now)
    last_update: datetime = Field(default_factory=datetime.now)
    completed_at: Optional[datetime] = None
    
    # Status
    status: CheckpointStatus = CheckpointStatus.RUNNING
    error_message: Optional[str] = None
    
    # Additional metadata
    metadata: Dict[str, Any] = Field(default_factory=dict)

    def update_progress(
        self,
        page: Optional[int] = None,
        keyword_index: Optional[int] = None,
        cursor: Optional[str] = None,
        id_index: Optional[int] = None
    ):
        """Update progress markers"""
        if page is not None:
            self.current_page = page
        if keyword_index is not None:
            self.current_keyword_index = keyword_index
        if cursor is not None:
            self.cursor = cursor
        if id_index is not None:
            self.current_id_index = id_index
        self.last_update = datetime.now()

    def add_processed_note(self, note_id: str):
        """Mark a note as processed"""
        if note_id not in self.processed_note_ids:
            self.processed_note_ids.append(note_id)
            self.total_notes_fetched += 1
            self.last_update = datetime.now()

    def add_processed_comment(self, comment_id: str):
        """Mark a comment as processed"""
        if comment_id not in self.processed_comment_ids:
            self.processed_comment_ids.append(comment_id)
            self.total_comments_fetched += 1

    def is_note_processed(self, note_id: str) -> bool:
        """Check if a note has already been processed"""
        return note_id in self.processed_note_ids

    def mark_completed(self):
        """Mark checkpoint as completed"""
        self.status = CheckpointStatus.COMPLETED
        self.completed_at = datetime.now()
        self.last_update = datetime.now()

    def mark_failed(self, error: str):
        """Mark checkpoint as failed with error message"""
        self.status = CheckpointStatus.FAILED
        self.error_message = error
        self.total_errors += 1
        self.last_update = datetime.now()

    def mark_paused(self):
        """Mark checkpoint as paused"""
        self.status = CheckpointStatus.PAUSED
        self.last_update = datetime.now()

    def to_summary(self) -> Dict[str, Any]:
        """Get a summary of the checkpoint for display"""
        return {
            "task_id": self.task_id,
            "platform": self.platform,
            "crawler_type": self.crawler_type,
            "keywords": self.keywords,
            "status": self.status.value,
            "progress": {
                "current_page": self.current_page,
                "current_keyword_index": self.current_keyword_index,
                "notes_fetched": self.total_notes_fetched,
                "comments_fetched": self.total_comments_fetched,
            },
            "created_at": self.created_at.isoformat(),
            "last_update": self.last_update.isoformat(),
        }

    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }
