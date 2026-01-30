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
from tools import utils


class AccountStatus(str, Enum):
    ACTIVE = "active"           # 正常可用
    COOLDOWN = "cooldown"       # 冷却中
    EXPIRED = "expired"         # Cookie过期
    BANNED = "banned"           # 被封禁
    UNKNOWN = "unknown"         # 未知状态


class AccountPlatform(str, Enum):
    XHS = "xhs"
    DOUYIN = "dy"  # 统一使用短名称
    DY = "dy"
    BILIBILI = "bili"
    BILI = "bili"
    WEIBO = "wb"
    WB = "wb"
    ZHIHU = "zhihu"
    KUAISHOU = "ks"
    KS = "ks"
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
    consecutive_fails: int = 0  # 连续失败次数
    last_used: Optional[datetime] = None
    last_check: Optional[datetime] = None
    
    # 冷却控制
    cooldown_until: Optional[datetime] = None
    
    # 分组
    group: str = "default"
    tags: List[str] = []
    
    # IP 绑定与项目路由 (Pro 版特性)
    last_proxy_id: Optional[str] = None
    proxy_config: Optional[Dict[str, Any]] = None
    last_project_id: Optional[int] = None
    user_id: Optional[int] = None
    
    # 时间戳
    created_at: datetime = datetime.now()
    updated_at: datetime = datetime.now()
    
    # 指纹信息
    fingerprint: Optional[Dict[str, Any]] = None
    
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
        self._last_sync = datetime.min
        self._initialized = True
        
        # Panic Switch Stats: {platform: [timestamp1, timestamp2, ...]}
        self._failure_window: Dict[str, List[datetime]] = {}
        self._panic_threshold = 5 # 10分钟内失败5次即触发熔断
        self._panic_window_seconds = 600
        
        # 配置 - A2/A3 优化: 使用更长的冷却时间和每日上限
        import config
        self.config = {
            "default_cooldown_seconds": getattr(config, 'ACCOUNT_COOLDOWN_SECONDS', 300),  # A2: 5分钟冷却
            "max_consecutive_fails": 3,
            "health_decay_on_fail": 10,
            "health_recovery_on_success": 5,
            "min_health_for_use": 30,
            "max_daily_requests": getattr(config, 'ACCOUNT_MAX_DAILY_REQUESTS', 500),  # A3: 每日上限
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
            consecutive_fails=getattr(model, 'consecutive_fails', 0) or 0,
            last_used=model.last_used,
            last_check=model.last_check,
            cooldown_until=model.cooldown_until,
            group=model.group_name or "default",
            tags=model.tags or [],
            last_proxy_id=model.last_proxy_id,
            proxy_config=model.proxy_config,
            last_project_id=getattr(model, 'last_project_id', None),
            user_id=getattr(model, 'user_id', None),
            fingerprint=getattr(model, 'fingerprint', None),
            created_at=model.created_at or datetime.now(),
            updated_at=model.updated_at or datetime.now(),
            notes=model.notes
        )


    async def sync_from_db(self, force_full: bool = False):
        """Sync memory cache with DB (Incremental/Full)"""
        from database.db_session import get_session
        from database.growhub_models import GrowHubAccount
        from sqlalchemy import select
        
        async with get_session() as session:
            if force_full or self._last_sync == datetime.min:
                query = select(GrowHubAccount)
            else:
                # Incremental sync: only accounts updated since last sync
                # Buffer 1 second to avoid clock sync issues
                since = self._last_sync - timedelta(seconds=1)
                query = select(GrowHubAccount).where(GrowHubAccount.updated_at >= since)
                
            result = await session.execute(query)
            rows = result.scalars().all()
            
            async with self._lock:
                if force_full:
                    self.accounts.clear()
                
                for row in rows:
                    # Update or Add
                    self.accounts[row.id] = self._model_to_info(row)
                
                self._last_sync = datetime.now()
                if rows:
                    print(f"[AccountPool] Sync complete. Processed {len(rows)} accounts.")

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
            consecutive_fails=info.consecutive_fails,
            last_used=info.last_used,
            last_check=info.last_check,
            cooldown_until=info.cooldown_until,
            group_name=info.group,
            tags=info.tags,
            last_proxy_id=info.last_proxy_id,
            proxy_config=info.proxy_config,
            last_project_id=info.last_project_id,
            user_id=info.user_id,
            fingerprint=info.fingerprint,
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
        if account_id not in self.accounts:
            return None
            
        async with self._lock:
            return await self._update_account_internal(account_id, updates)

    async def _update_account_internal(self, account_id: str, updates: Dict[str, Any]) -> Optional[AccountInfo]:
        """更新账号 (无锁版，供内部调用)"""
        from database.db_session import get_session
        from database.growhub_models import GrowHubAccount
        from sqlalchemy import select

        account = self.accounts[account_id]
        
        # Apply updates to memory object
        for key, value in updates.items():
            if hasattr(account, key):
                setattr(account, key, value)
        account.updated_at = datetime.now()
        
        # DB Update
        async with get_session() as session:
            result = await session.execute(select(GrowHubAccount).where(GrowHubAccount.id == account_id))
            model = result.scalar_one_or_none()
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
                await session.commit()
                
        return account
    
    async def delete_account(self, account_id: str) -> bool:
        """删除账号"""
        from database.db_session import get_session
        from database.growhub_models import GrowHubAccount
        from sqlalchemy import select
        
        async with self._lock:
            db_deleted = False
            memory_deleted = False
            
            # DB Delete
            try:
                print(f"[AccountPool] Deleting account {account_id} from DB...")
                async with get_session() as session:
                    result = await session.execute(select(GrowHubAccount).where(GrowHubAccount.id == account_id))
                    model = result.scalar_one_or_none()
                    if model:
                        await session.delete(model)
                        await session.commit()
                        db_deleted = True
                        print(f"[AccountPool] Account {account_id} deleted from DB")
                    else:
                        print(f"[AccountPool] Account {account_id} not found in DB")
            except Exception as e:
                print(f"[AccountPool] DB delete failed: {e}")
            
            # Memory Delete
            if account_id in self.accounts:
                del self.accounts[account_id]
                memory_deleted = True
                print(f"[AccountPool] Account {account_id} deleted from memory")
            else:
                print(f"[AccountPool] Account {account_id} not found in memory keys: {list(self.accounts.keys())}")
                
            return db_deleted or memory_deleted
    
    def get_account(self, account_id: str) -> Optional[AccountInfo]:
        """获取单个账号 (Read from Memory)"""
        return self.accounts.get(account_id)
    
    async def get_all_accounts(self, platform: Optional[AccountPlatform] = None, user_id: int = None) -> List[AccountInfo]:
        """获取所有账号 (Async version to allow sync)"""
        if (datetime.now() - self._last_sync).total_seconds() > 30:
            await self.sync_from_db()
            
        accounts = list(self.accounts.values())
        if platform:
            accounts = [a for a in accounts if a.platform == platform]
        if user_id is not None:
            accounts = [a for a in accounts if a.user_id == user_id]
        return accounts
    
    async def get_available_account(self, platform: AccountPlatform, exclude_ids: List[str] = None, project_id: Optional[int] = None, user_id: int = None) -> Optional[AccountInfo]:
        """获取可用账号"""
        if await self.is_platform_panicked(platform):
            utils.logger.error(f"⚠️ [AccountPool] Platform {platform.value} is in PANIC mode due to high failure rate. No accounts will be assigned.")
            return None
            
        if (datetime.now() - self._last_sync).total_seconds() > 10:
            await self.sync_from_db()
            
        now = datetime.now()
        exclude_ids = exclude_ids or []
        
        candidates = []
        today = now.date()
        max_daily = self.config.get("max_daily_requests", 500)
        
        for a in self.accounts.values():
            if a.platform != platform: 
                continue
            if user_id is not None and a.user_id != user_id:
                continue
            if a.id in exclude_ids: continue
            
            # Check conditions
            is_active = (a.status == AccountStatus.ACTIVE)
            health_ok = (a.health_score >= self.config["min_health_for_use"])
            cd_ok = (a.cooldown_until is None or a.cooldown_until < now)
            
            # R6 Fix: Check daily usage limit
            daily_ok = True
            if a.last_used and a.last_used.date() == today:
                if a.use_count >= max_daily:
                    daily_ok = False
                    utils.logger.debug(f"[AccountPool] Account {a.id} reached daily limit ({a.use_count}/{max_daily})")
            
            if is_active and health_ok and cd_ok and daily_ok:
                candidates.append(a)
        
        if not candidates:
            return None
        
        # Sticky Sessions 排序权重
        # 1. 符合该项目的账号优先 (last_project_id == project_id)
        # 2. 健康分从高到低
        # 3. 最后使用时间从早到晚
        def sort_key(acc):
            sticky_weight = 1 if (project_id and acc.last_project_id == project_id) else 0
            return (sticky_weight, acc.health_score, -(acc.last_used.timestamp() if acc.last_used else 0))
            
        candidates.sort(key=sort_key, reverse=True)
        return candidates[0]
    
    async def record_account_usage(self, account_id: str, success: bool, cooldown_seconds: Optional[int] = None, project_id: Optional[int] = None):
        """记录账号使用"""
        await self.mark_account_used(account_id, success, cooldown_seconds, project_id)

    
    async def mark_account_used(self, account_id: str, success: bool, cooldown_seconds: Optional[int] = None, project_id: Optional[int] = None):
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
                account.consecutive_fails = 0  # 重置连续失败
                account.health_score = min(100, account.health_score + self.config["health_recovery_on_success"])
                
                cd = cooldown_seconds or self.config["default_cooldown_seconds"]
            else:
                account.fail_count += 1
                account.consecutive_fails += 1  # 增加连续失败
                account.health_score = max(0, account.health_score - self.config["health_decay_on_fail"])
                
                # Panic Switch: Record Failure
                await self._record_platform_failure_internal(account.platform)
                
                # 指数退避逻辑: 基础冷却 * (2 ^ 连续失败次数)
                # 示例: 60s -> 120s -> 240s -> 480s ...
                base_cd = cooldown_seconds or self.config["default_cooldown_seconds"]
                multiplier = min(32, 2 ** (account.consecutive_fails - 1)) # 最高限制在 32倍
                cd = base_cd * multiplier
                
                if account.health_score < self.config["min_health_for_use"]:
                    account.status = AccountStatus.COOLDOWN
            
            account.cooldown_until = now + timedelta(seconds=cd)
            account.updated_at = now
            
            # Update DB (使用内部无锁方法)
            await self._update_account_internal(account_id, {
                "use_count": account.use_count,
                "success_count": account.success_count,
                "fail_count": account.fail_count,
                "consecutive_fails": account.consecutive_fails,
                "last_used": account.last_used,
                "health_score": account.health_score,
                "status": account.status,
                "cooldown_until": account.cooldown_until,
                "last_project_id": project_id or account.last_project_id
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

    async def mark_account_invalid(self, account_id: str, reason: str = "Invalid"):
        """标记账号为无效 (Helper)"""
        if account_id not in self.accounts:
            return
            
        async with self._lock:
            # Check if expired or banned based on reason keyword
            status = AccountStatus.EXPIRED
            if "banned" in reason.lower() or "suspicious" in reason.lower():
                status = AccountStatus.BANNED
            
            await self._update_account_internal(account_id, {
                "status": status,
                "health_score": 0,
                "notes": f"{datetime.now().strftime('%Y-%m-%d %H:%M')}: Marked invalid ({reason})",
                "fail_count": self.accounts[account_id].fail_count + 1
            })
            utils.logger.info(f"[AccountPool] Account {account_id} marked as {status.value}: {reason}")
    
    
    async def batch_check_health(self, platform: Optional[AccountPlatform] = None, max_concurrency: int = 5, user_id: int = None) -> Dict[str, Any]:
        """批量检查 (Parallel Implementation)"""
        accounts = await self.get_all_accounts(platform, user_id=user_id)
        
        results = {
            "total": len(accounts), "checked": 0, "active": 0, 
            "expired": 0, "banned": 0, "unknown": 0
        }
        
        if not accounts:
            return results
            
        semaphore = asyncio.Semaphore(max_concurrency)
        
        async def _check_one(account_info: AccountInfo):
            async with semaphore:
                try:
                    check_result = await self.check_account_health(account_info.id)
                    return check_result
                except Exception as e:
                    print(f"[AccountPool] Error checking {account_info.id}: {e}")
                    return {"valid": False, "error": str(e)}

        # Run checks in parallel
        tasks = [_check_one(a) for a in accounts]
        check_results = await asyncio.gather(*tasks)
        
        for res in check_results:
            results["checked"] += 1
            if res.get("valid"): results["active"] += 1
            elif res.get("expired"): results["expired"] += 1
            elif res.get("banned"): results["banned"] += 1
            else: results["unknown"] += 1
        
        return results
    
    async def get_statistics(self, platform: Optional[AccountPlatform] = None, user_id: int = None) -> Dict[str, Any]:
        """统计信息"""
        accounts = await self.get_all_accounts(platform, user_id=user_id)
        
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

    async def _record_platform_failure(self, platform: AccountPlatform):
        """记录平台级失败 (用于熔断)"""
        async with self._lock:
            await self._record_platform_failure_internal(platform)

    async def _record_platform_failure_internal(self, platform: AccountPlatform):
        """记录平台级失败 (无锁版)"""
        plat = platform.value
        now = datetime.now()
        
        if plat not in self._failure_window:
            self._failure_window[plat] = []
        self._failure_window[plat].append(now)
        
        # 清理旧记录
        cutoff = now - timedelta(seconds=self._panic_window_seconds)
        self._failure_window[plat] = [t for t in self._failure_window[plat] if t > cutoff]

    async def is_platform_panicked(self, platform: AccountPlatform) -> bool:
        """检查平台是否处于熔断状态"""
        plat = platform.value
        now = datetime.now()
        async with self._lock:
            if plat not in self._failure_window:
                return False
                
            # 清理并统计
            cutoff = now - timedelta(seconds=self._panic_window_seconds)
            failures = [t for t in self._failure_window[plat] if t > cutoff]
            self._failure_window[plat] = failures
            
            return len(failures) >= self._panic_threshold


# 全局实例
account_pool_service = AccountPoolService()


def get_account_pool() -> AccountPoolService:
    """获取账号池实例"""
    return account_pool_service
