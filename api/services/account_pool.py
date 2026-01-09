# -*- coding: utf-8 -*-
# GrowHub Account Pool Service - 账号池管理服务
# Phase 2 Week 9: 账号资产管理

import os
import json
import asyncio
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
from enum import Enum
from pydantic import BaseModel
import random
import httpx
from .account_verification import AccountVerifier


class AccountStatus(str, Enum):
    ACTIVE = "active"           # 正常可用
    COOLDOWN = "cooldown"       # 冷却中
    EXPIRED = "expired"         # Cookie过期
    BANNED = "banned"           # 被封禁
    UNKNOWN = "unknown"         # 未知状态


class AccountPlatform(str, Enum):
    XHS = "xhs"
    DOUYIN = "douyin"
    BILIBILI = "bilibili"
    WEIBO = "weibo"
    ZHIHU = "zhihu"
    KUAISHOU = "kuaishou"
    TIEBA = "tieba"


class AccountInfo(BaseModel):
    """账号信息模型"""
    id: str
    platform: AccountPlatform
    account_name: str
    cookies: str
    
    # 状态
    status: AccountStatus = AccountStatus.UNKNOWN
    health_score: int = 100  # 健康度 0-100
    
    # 使用统计
    use_count: int = 0
    success_count: int = 0
    fail_count: int = 0
    last_used: Optional[datetime] = None
    last_check: Optional[datetime] = None
    
    # 冷却控制
    cooldown_until: Optional[datetime] = None
    
    # 分组
    group: str = "default"
    tags: List[str] = []
    
    # 时间戳
    created_at: datetime = datetime.now()
    updated_at: datetime = datetime.now()
    
    # 备注
    notes: Optional[str] = None


class AccountPoolService:
    """账号池管理服务 (Persistent with SQLite)"""
    
    _instance = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance
    
    def __init__(self):
        if self._initialized:
            return
        
        self.accounts: Dict[str, AccountInfo] = {}
        self._lock = asyncio.Lock()
        self._initialized = True
        
        # 配置
        self.config = {
            "default_cooldown_seconds": 60,
            "max_consecutive_fails": 3,
            "health_decay_on_fail": 10,
            "health_recovery_on_success": 5,
            "min_health_for_use": 30,
        }

    async def initialize(self):
        """初始化：建表并加载数据"""
        from database.db_session import create_tables, get_session
        from database.growhub_models import GrowHubAccount
        from sqlalchemy import select
        
        # 1. 确保表存在
        try:
            await create_tables("sqlite")
        except Exception as e:
            print(f"[AccountPool] Init tables failed: {e}")
            
        # 2. 加载数据到内存缓存
        try:
            async with get_session() as session:
                result = await session.execute(select(GrowHubAccount))
                rows = result.scalars().all()
                async with self._lock:
                    self.accounts.clear()
                    for row in rows:
                        self.accounts[row.id] = self._model_to_info(row)
                print(f"[AccountPool] Loaded {len(self.accounts)} accounts from DB")
        except Exception as e:
            print(f"[AccountPool] Load accounts failed: {e}")

    def _model_to_info(self, model) -> AccountInfo:
        return AccountInfo(
            id=model.id,
            platform=AccountPlatform(model.platform),
            account_name=model.account_name,
            cookies=model.cookies,
            status=AccountStatus(model.status) if model.status else AccountStatus.UNKNOWN,
            health_score=model.health_score or 100,
            use_count=model.use_count or 0,
            success_count=model.success_count or 0,
            fail_count=model.fail_count or 0,
            last_used=model.last_used,
            last_check=model.last_check,
            cooldown_until=model.cooldown_until,
            group=model.group_name or "default",
            tags=model.tags or [],
            created_at=model.created_at or datetime.now(),
            updated_at=model.updated_at or datetime.now(),
            notes=model.notes
        )

    def _info_to_model(self, info: AccountInfo):
        from database.growhub_models import GrowHubAccount
        return GrowHubAccount(
            id=info.id,
            platform=info.platform.value,
            account_name=info.account_name,
            cookies=info.cookies,
            status=info.status.value,
            health_score=info.health_score,
            use_count=info.use_count,
            success_count=info.success_count,
            fail_count=info.fail_count,
            last_used=info.last_used,
            last_check=info.last_check,
            cooldown_until=info.cooldown_until,
            group_name=info.group,
            tags=info.tags,
            notes=info.notes,
            created_at=info.created_at,
            updated_at=datetime.now()
        )
    
    async def add_account(self, account: AccountInfo) -> AccountInfo:
        """添加账号"""
        from database.db_session import get_session
        
        async with self._lock:
            # 生成 ID
            import uuid
            if not account.id:
                account.id = str(uuid.uuid4())[:8]
            account.created_at = datetime.now()
            account.updated_at = datetime.now()
            
            # DB Write
            async with get_session() as session:
                model = self._info_to_model(account)
                session.add(model)
                await session.commit() # Commit the changes
            
            # Memory Update
            self.accounts[account.id] = account
            return account
    
    async def update_account(self, account_id: str, updates: Dict[str, Any]) -> Optional[AccountInfo]:
        """更新账号"""
        from database.db_session import get_session
        from database.growhub_models import GrowHubAccount
        from sqlalchemy import select
        
        if account_id not in self.accounts:
            return None
            
        async with self._lock:
            account = self.accounts[account_id]
            
            # Apply updates to memory object
            for key, value in updates.items():
                if hasattr(account, key):
                    setattr(account, key, value)
            account.updated_at = datetime.now()
            
            # DB Update
            async with get_session() as session:
                result = await session.execute(select(GrowHubAccount).where(GrowHubAccount.id == account_id))
                model = result.scalar_one_or_none() # Use scalar_one_or_none for single result
                if model:
                    # Update model fields
                    for key, value in updates.items():
                        # Map AccountInfo keys to Model keys
                        if key == 'group': db_key = 'group_name'
                        elif key == 'platform': db_key = 'platform'; value = value.value if hasattr(value, 'value') else value
                        elif key == 'status': db_key = 'status'; value = value.value if hasattr(value, 'value') else value
                        else: db_key = key
                        
                        if hasattr(model, db_key):
                            setattr(model, db_key, value)
                    model.updated_at = datetime.now()
                    await session.commit() # Commit the changes
                    
            return account
    
    async def delete_account(self, account_id: str) -> bool:
        """删除账号"""
        from database.db_session import get_session
        from database.growhub_models import GrowHubAccount
        from sqlalchemy import select
        
        async with self._lock:
            # DB Delete
            async with get_session() as session:
                result = await session.execute(select(GrowHubAccount).where(GrowHubAccount.id == account_id))
                model = result.scalar_one_or_none() # Use scalar_one_or_none for single result
                if model:
                    await session.delete(model)
                    await session.commit() # Commit the changes
            
            # Memory Delete
            if account_id in self.accounts:
                del self.accounts[account_id]
                return True
            return False
    
    def get_account(self, account_id: str) -> Optional[AccountInfo]:
        """获取单个账号 (Read from Memory)"""
        return self.accounts.get(account_id)
    
    def get_all_accounts(self, platform: Optional[AccountPlatform] = None) -> List[AccountInfo]:
        """获取所有账号 (Read from Memory)"""
        accounts = list(self.accounts.values())
        if platform:
            accounts = [a for a in accounts if a.platform == platform]
        return accounts
    
    async def get_available_account(self, platform: AccountPlatform) -> Optional[AccountInfo]:
        """获取可用账号"""
        # Read from memory is fine, as memory is the truth for status
        now = datetime.now()
        
        candidates = [
            a for a in self.accounts.values()
            if a.platform == platform
            and a.status == AccountStatus.ACTIVE
            and a.health_score >= self.config["min_health_for_use"]
            and (a.cooldown_until is None or a.cooldown_until < now)
        ]
        
        if not candidates:
            return None
        
        candidates.sort(key=lambda x: (-x.health_score, x.last_used or datetime.min))
        return candidates[0]
    
    async def mark_account_used(self, account_id: str, success: bool, cooldown_seconds: Optional[int] = None):
        """标记使用"""
        if account_id not in self.accounts:
            return

        async with self._lock:
            account = self.accounts[account_id]
            now = datetime.now()
            
            account.use_count += 1
            account.last_used = now
            
            if success:
                account.success_count += 1
                account.health_score = min(100, account.health_score + self.config["health_recovery_on_success"])
            else:
                account.fail_count += 1
                account.health_score = max(0, account.health_score - self.config["health_decay_on_fail"])
                if account.health_score < self.config["min_health_for_use"]:
                    account.status = AccountStatus.COOLDOWN
            
            cd = cooldown_seconds or self.config["default_cooldown_seconds"]
            account.cooldown_until = now + timedelta(seconds=cd)
            account.updated_at = now
            
            # Update DB (Async background or direct)
            # For simplicity, we fire and forget the update to DB or await it?
            # Awaiting is safer.
            await self.update_account(account_id, {
                "use_count": account.use_count,
                "success_count": account.success_count,
                "fail_count": account.fail_count,
                "last_used": account.last_used,
                "health_score": account.health_score,
                "status": account.status,
                "cooldown_until": account.cooldown_until
            })
    
    async def check_account_health(self, account_id: str) -> Dict[str, Any]:
        """检查健康"""
        if account_id not in self.accounts:
            return {"success": False, "error": "账号不存在"}
        
        account = self.accounts[account_id]
        result = await self._verify_cookie(account)
        
        updates = {"last_check": datetime.now()}
        if result["valid"]:
            updates["status"] = AccountStatus.ACTIVE
            updates["health_score"] = max(account.health_score, 80)
        else:
            if result.get("expired"):
                updates["status"] = AccountStatus.EXPIRED
            elif result.get("banned"):
                updates["status"] = AccountStatus.BANNED
            else:
                updates["status"] = AccountStatus.UNKNOWN
            updates["health_score"] = 0
            
        await self.update_account(account_id, updates)
        return result
    
    async def _verify_cookie(self, account: AccountInfo) -> Dict[str, Any]:
        """验证 Cookie 有效性 (Real HTTP Check)"""
        # Call the Verifier Service
        result = await AccountVerifier.verify(account.platform.value, account.cookies)
        
        # If valid and nickname returned, update account name?
        # Maybe optional feature. For now just verify.
        return result
    
    async def batch_check_health(self, platform: Optional[AccountPlatform] = None) -> Dict[str, Any]:
        """批量检查"""
        # 注意：get_all_accounts 现在是 Sync 的，这里还可以直接调用
        accounts = self.get_all_accounts(platform)
        
        results = {
            "total": len(accounts), "checked": 0, "active": 0, 
            "expired": 0, "banned": 0, "unknown": 0
        }
        
        for account in accounts:
            check_result = await self.check_account_health(account.id)
            results["checked"] += 1
            if check_result.get("valid"): results["active"] += 1
            elif check_result.get("expired"): results["expired"] += 1
            elif check_result.get("banned"): results["banned"] += 1
            else: results["unknown"] += 1
        
        return results
    
    def get_statistics(self, platform: Optional[AccountPlatform] = None) -> Dict[str, Any]:
        """统计信息"""
        accounts = self.get_all_accounts(platform)
        
        if not accounts:
            return {
                "total": 0, "by_status": {}, "by_platform": {},
                "avg_health": 0, "total_uses": 0, "success_rate": 0
            }
        
        by_status = {}
        by_platform = {}
        total_health = 0
        total_uses = 0
        total_success = 0
        
        for account in accounts:
            status = account.status.value
            by_status[status] = by_status.get(status, 0) + 1
            plat = account.platform.value
            by_platform[plat] = by_platform.get(plat, 0) + 1
            total_health += account.health_score
            total_uses += account.use_count
            total_success += account.success_count
        
        return {
            "total": len(accounts),
            "by_status": by_status,
            "by_platform": by_platform,
            "avg_health": round(total_health / len(accounts), 1),
            "total_uses": total_uses,
            "success_rate": round(total_success / total_uses * 100, 1) if total_uses > 0 else 0
        }

    # import/export removed since DB is persistent, or can keep helpers if needed.
    # keeping export_to_dict for potential logic needing dumps
    def export_to_dict(self) -> Dict[str, List[Dict]]:
        result = {}
        for account in self.accounts.values():
            platform = account.platform.value
            if platform not in result:
                result[platform] = []
            result[platform].append({
                "id": account.id,
                "name": account.account_name,
                "status": account.status.value,
                # omit privacy
            })
        return result


# 全局实例
account_pool_service = AccountPoolService()


def get_account_pool() -> AccountPoolService:
    """获取账号池实例"""
    return account_pool_service
