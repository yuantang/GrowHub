# -*- coding: utf-8 -*-
"""
Account Models

Data models for multi-account management.
"""

from datetime import datetime
from typing import Optional, Dict, Any
from enum import Enum
from pydantic import BaseModel, Field
import uuid


class AccountStatus(str, Enum):
    """Account status enumeration"""
    ACTIVE = "active"          # Account is available for use
    BANNED = "banned"          # Account is banned by platform
    COOLING = "cooling"        # Account is in cooldown period
    DISABLED = "disabled"      # Account is manually disabled
    EXPIRED = "expired"        # Account cookies have expired


class Account(BaseModel):
    """
    Account data model for multi-account management
    """
    
    # Unique identifier
    id: str = Field(default_factory=lambda: str(uuid.uuid4())[:8])
    
    # Basic info
    platform: str  # xhs, dy, bili, etc.
    name: str      # Display name
    
    # Authentication
    cookies: str   # Cookie string
    
    # Status
    status: AccountStatus = AccountStatus.ACTIVE
    
    # Timing
    last_used: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.now)
    banned_until: Optional[datetime] = None
    cooling_until: Optional[datetime] = None
    
    # Statistics
    request_count: int = 0
    success_count: int = 0
    error_count: int = 0
    
    # Metadata
    notes: str = ""
    metadata: Dict[str, Any] = Field(default_factory=dict)

    def is_available(self) -> bool:
        """Check if account is currently available for use"""
        now = datetime.now()
        
        if self.status == AccountStatus.DISABLED:
            return False
        
        if self.status == AccountStatus.BANNED:
            if self.banned_until and self.banned_until > now:
                return False
            # Ban period expired, mark as active
            self.status = AccountStatus.ACTIVE
        
        if self.status == AccountStatus.COOLING:
            if self.cooling_until and self.cooling_until > now:
                return False
            # Cooldown period expired, mark as active
            self.status = AccountStatus.ACTIVE
        
        return self.status == AccountStatus.ACTIVE

    def use(self):
        """Mark account as used"""
        self.last_used = datetime.now()
        self.request_count += 1

    def record_success(self):
        """Record a successful request"""
        self.success_count += 1

    def record_error(self):
        """Record an error"""
        self.error_count += 1

    def mark_banned(self, hours: int = 24):
        """Mark account as banned"""
        self.status = AccountStatus.BANNED
        self.banned_until = datetime.now().replace(hour=datetime.now().hour + hours)

    def mark_cooling(self, seconds: int = 300):
        """Put account in cooldown"""
        from datetime import timedelta
        self.status = AccountStatus.COOLING
        self.cooling_until = datetime.now() + timedelta(seconds=seconds)

    def mark_disabled(self):
        """Disable account"""
        self.status = AccountStatus.DISABLED

    def mark_active(self):
        """Mark account as active"""
        self.status = AccountStatus.ACTIVE
        self.banned_until = None
        self.cooling_until = None

    def get_cookie_dict(self) -> Dict[str, str]:
        """Parse cookies string to dictionary"""
        result = {}
        if self.cookies:
            for item in self.cookies.split(';'):
                item = item.strip()
                if '=' in item:
                    key, value = item.split('=', 1)
                    result[key.strip()] = value.strip()
        return result

    def to_summary(self) -> Dict[str, Any]:
        """Get account summary for display"""
        return {
            "id": self.id,
            "platform": self.platform,
            "name": self.name,
            "status": self.status.value,
            "last_used": self.last_used.isoformat() if self.last_used else None,
            "request_count": self.request_count,
            "success_rate": self.success_count / max(self.request_count, 1) * 100,
        }

    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat() if v else None
        }
