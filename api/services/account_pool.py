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
    """账号池管理服务"""
    
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
            "default_cooldown_seconds": 60,    # 默认冷却时间
            "max_consecutive_fails": 3,        # 最大连续失败次数
            "health_decay_on_fail": 10,        # 失败时健康度衰减
            "health_recovery_on_success": 5,   # 成功时健康度恢复
            "min_health_for_use": 30,          # 最低可用健康度
        }
    
    async def add_account(self, account: AccountInfo) -> AccountInfo:
        """添加账号"""
        async with self._lock:
            # 生成 ID
            import uuid
            account.id = str(uuid.uuid4())[:8]
            account.created_at = datetime.now()
            account.updated_at = datetime.now()
            
            self.accounts[account.id] = account
            return account
    
    async def update_account(self, account_id: str, updates: Dict[str, Any]) -> Optional[AccountInfo]:
        """更新账号"""
        async with self._lock:
            if account_id not in self.accounts:
                return None
            
            account = self.accounts[account_id]
            for key, value in updates.items():
                if hasattr(account, key):
                    setattr(account, key, value)
            
            account.updated_at = datetime.now()
            return account
    
    async def delete_account(self, account_id: str) -> bool:
        """删除账号"""
        async with self._lock:
            if account_id in self.accounts:
                del self.accounts[account_id]
                return True
            return False
    
    def get_account(self, account_id: str) -> Optional[AccountInfo]:
        """获取单个账号"""
        return self.accounts.get(account_id)
    
    def get_all_accounts(self, platform: Optional[AccountPlatform] = None) -> List[AccountInfo]:
        """获取所有账号"""
        accounts = list(self.accounts.values())
        if platform:
            accounts = [a for a in accounts if a.platform == platform]
        return accounts
    
    async def get_available_account(self, platform: AccountPlatform) -> Optional[AccountInfo]:
        """
        获取一个可用账号（轮询策略）
        优先选择：健康度高 + 最久未使用 + 不在冷却中
        """
        async with self._lock:
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
            
            # 按健康度降序，上次使用时间升序排序
            candidates.sort(
                key=lambda x: (-x.health_score, x.last_used or datetime.min)
            )
            
            selected = candidates[0]
            return selected
    
    async def mark_account_used(
        self, 
        account_id: str, 
        success: bool, 
        cooldown_seconds: Optional[int] = None
    ):
        """
        标记账号已使用
        """
        async with self._lock:
            if account_id not in self.accounts:
                return
            
            account = self.accounts[account_id]
            now = datetime.now()
            
            account.use_count += 1
            account.last_used = now
            
            if success:
                account.success_count += 1
                # 恢复健康度
                account.health_score = min(100, account.health_score + self.config["health_recovery_on_success"])
            else:
                account.fail_count += 1
                # 降低健康度
                account.health_score = max(0, account.health_score - self.config["health_decay_on_fail"])
                
                # 检查是否需要标记为问题账号
                if account.health_score < self.config["min_health_for_use"]:
                    account.status = AccountStatus.COOLDOWN
            
            # 设置冷却
            cd = cooldown_seconds or self.config["default_cooldown_seconds"]
            account.cooldown_until = now + timedelta(seconds=cd)
            account.updated_at = now
    
    async def check_account_health(self, account_id: str) -> Dict[str, Any]:
        """
        检查账号健康状态（验证 Cookie 有效性）
        """
        if account_id not in self.accounts:
            return {"success": False, "error": "账号不存在"}
        
        account = self.accounts[account_id]
        
        # 模拟检查（实际应该发请求验证）
        result = await self._verify_cookie(account)
        
        async with self._lock:
            account.last_check = datetime.now()
            
            if result["valid"]:
                account.status = AccountStatus.ACTIVE
                account.health_score = max(account.health_score, 80)
            else:
                if result.get("expired"):
                    account.status = AccountStatus.EXPIRED
                elif result.get("banned"):
                    account.status = AccountStatus.BANNED
                else:
                    account.status = AccountStatus.UNKNOWN
                account.health_score = 0
            
            account.updated_at = datetime.now()
        
        return result
    
    async def _verify_cookie(self, account: AccountInfo) -> Dict[str, Any]:
        """
        验证 Cookie 有效性
        实际实现需要根据平台发送请求验证
        """
        # 这里是模拟实现
        # 真实场景需要：
        # 1. 解析 Cookie
        # 2. 发送测试请求到目标平台
        # 3. 根据响应判断 Cookie 是否有效
        
        await asyncio.sleep(0.5)  # 模拟网络请求
        
        # 模拟 90% 的成功率
        if random.random() < 0.9:
            return {"valid": True, "message": "Cookie 有效"}
        else:
            return {"valid": False, "expired": True, "message": "Cookie 已过期"}
    
    async def batch_check_health(self, platform: Optional[AccountPlatform] = None) -> Dict[str, Any]:
        """批量检查账号健康状态"""
        accounts = self.get_all_accounts(platform)
        
        results = {
            "total": len(accounts),
            "checked": 0,
            "active": 0,
            "expired": 0,
            "banned": 0,
            "unknown": 0
        }
        
        for account in accounts:
            check_result = await self.check_account_health(account.id)
            results["checked"] += 1
            
            if check_result.get("valid"):
                results["active"] += 1
            elif check_result.get("expired"):
                results["expired"] += 1
            elif check_result.get("banned"):
                results["banned"] += 1
            else:
                results["unknown"] += 1
        
        return results
    
    def get_statistics(self, platform: Optional[AccountPlatform] = None) -> Dict[str, Any]:
        """获取账号统计信息"""
        accounts = self.get_all_accounts(platform)
        
        if not accounts:
            return {
                "total": 0,
                "by_status": {},
                "by_platform": {},
                "avg_health": 0,
                "total_uses": 0,
                "success_rate": 0
            }
        
        by_status = {}
        by_platform = {}
        total_health = 0
        total_uses = 0
        total_success = 0
        
        for account in accounts:
            # 按状态统计
            status = account.status.value
            by_status[status] = by_status.get(status, 0) + 1
            
            # 按平台统计
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
    
    async def import_from_yaml(self, yaml_path: str) -> Dict[str, Any]:
        """从 YAML 文件导入账号"""
        import yaml
        
        if not os.path.exists(yaml_path):
            return {"success": False, "error": "文件不存在"}
        
        try:
            with open(yaml_path, 'r', encoding='utf-8') as f:
                data = yaml.safe_load(f)
            
            imported = 0
            for platform_key, accounts_data in data.items():
                if not isinstance(accounts_data, list):
                    continue
                
                try:
                    platform = AccountPlatform(platform_key)
                except ValueError:
                    continue
                
                for acc in accounts_data:
                    if isinstance(acc, dict) and 'cookies' in acc:
                        account = AccountInfo(
                            id="",
                            platform=platform,
                            account_name=acc.get('name', f'{platform_key}_account'),
                            cookies=acc['cookies'],
                            status=AccountStatus.UNKNOWN
                        )
                        await self.add_account(account)
                        imported += 1
            
            return {"success": True, "imported": imported}
            
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    def export_to_dict(self) -> Dict[str, List[Dict]]:
        """导出账号为字典格式"""
        result = {}
        for account in self.accounts.values():
            platform = account.platform.value
            if platform not in result:
                result[platform] = []
            result[platform].append({
                "id": account.id,
                "name": account.account_name,
                "cookies": account.cookies,
                "status": account.status.value,
                "health_score": account.health_score,
                "use_count": account.use_count
            })
        return result


# 全局实例
account_pool_service = AccountPoolService()


def get_account_pool() -> AccountPoolService:
    """获取账号池实例"""
    return account_pool_service
