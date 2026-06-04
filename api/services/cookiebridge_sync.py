# -*- coding: utf-8 -*-
"""
从 MediaCrawlerPro-CookieBridge 拉取 Cookie，写入 GrowHub 账号池（方案 B 中枢）。
"""

import os
import re
from datetime import datetime
from typing import Any, Dict, List, Optional

import httpx

from api.services.account_pool import (
    AccountInfo,
    AccountPlatform,
    AccountStatus,
    get_account_pool,
)
from tools import utils

DEFAULT_COOKIE_BRIDGE_URL = "http://localhost:8274"

# CookieBridge 平台标识 -> GrowHub AccountPlatform
PLATFORM_MAP = {
    "xhs": AccountPlatform.XHS,
    "dy": AccountPlatform.DOUYIN,
    "ks": AccountPlatform.KUAISHOU,
    "bili": AccountPlatform.BILIBILI,
    "wb": AccountPlatform.WEIBO,
    "tieba": AccountPlatform.TIEBA,
    "zhihu": AccountPlatform.ZHIHU,
}


def get_cookiebridge_base_url() -> str:
    return os.environ.get("COOKIE_BRIDGE_URL", DEFAULT_COOKIE_BRIDGE_URL).rstrip("/")


class CookieBridgeSyncService:
    """CookieBridge → growhub_accounts 同步服务"""

    def __init__(self, base_url: Optional[str] = None):
        self.base_url = (base_url or get_cookiebridge_base_url()).rstrip("/")

    async def _get_json(self, path: str, params: Optional[dict] = None) -> Dict[str, Any]:
        url = f"{self.base_url}{path}"
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(url, params=params)
            resp.raise_for_status()
            body = resp.json()
        if not body.get("isok", False) and body.get("biz_code", 0) != 0:
            raise RuntimeError(body.get("msg") or "CookieBridge API error")
        return body.get("data") or {}

    async def get_status(self) -> Dict[str, Any]:
        """检查 CookieBridge 服务与已连接客户端"""
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                ping = await client.get(f"{self.base_url}/ping")
                ping_ok = ping.status_code == 200
        except Exception as e:
            return {
                "reachable": False,
                "base_url": self.base_url,
                "error": str(e),
                "clients": [],
            }

        clients: List[Dict[str, Any]] = []
        try:
            accounts_data = await self._get_json("/api/accounts")
            clients = accounts_data.get("accounts") or []
        except Exception:
            pass

        if not clients:
            try:
                status_data = await self._get_json("/api/status")
                raw_clients = status_data.get("clients") or {}
                if isinstance(raw_clients, dict):
                    for cid, info in raw_clients.items():
                        clients.append({"client_id": cid, **(info or {})})
                elif isinstance(raw_clients, list):
                    clients = raw_clients
            except Exception:
                pass

        return {
            "reachable": ping_ok,
            "base_url": self.base_url,
            "client_count": len(clients),
            "clients": clients,
        }

    async def _fetch_cookies(self, platform: str, client_id: str) -> Optional[str]:
        try:
            data = await self._get_json(f"/api/cookies/{platform}", params={"client_id": client_id})
            cookies = (data.get("cookies") or "").strip()
            return cookies or None
        except Exception as e:
            utils.logger.warning(f"[CookieBridge] fetch cookies {platform}/{client_id}: {e}")
            return None

    def _stable_account_id(self, user_id: int, platform: str, client_id: str) -> str:
        safe_client = re.sub(r"[^a-zA-Z0-9]", "", client_id)[:12]
        raw = f"cb-{user_id}-{platform}-{safe_client}"
        return raw[:50]

    def _platform_keys_for_client(self, platforms_info: Dict[str, Any]) -> List[str]:
        """根据 CookieBridge 返回的 platforms 字段决定要拉取的平台"""
        if not platforms_info:
            return list(PLATFORM_MAP.keys())
        if any(
            isinstance(v, dict) and "has_cookies" in (v or {})
            for v in platforms_info.values()
        ):
            return [
                p
                for p in PLATFORM_MAP
                if (platforms_info.get(p) or {}).get("has_cookies")
            ]
        keys = [p for p in PLATFORM_MAP if p in platforms_info]
        return keys or list(PLATFORM_MAP.keys())

    def _account_display_name(
        self,
        platform: str,
        client_id: str,
        nicknames: Optional[Dict[str, str]],
    ) -> str:
        nick = (nicknames or {}).get(platform) if nicknames else None
        if nick:
            return f"CB-{platform.upper()}-{nick}"[:255]
        return f"CB-{platform.upper()}-{client_id[:8]}"

    async def sync_to_account_pool(
        self,
        user_id: int,
        client_ids: Optional[List[str]] = None,
        only_connected: bool = True,
    ) -> Dict[str, Any]:
        """
        将 CookieBridge 中的 Cookie 同步到 growhub_accounts。
        - 每个 (user_id, client_id, platform) 对应账号池一条记录
        - client_ids 为空时同步所有在 /api/accounts 中出现的客户端
        """
        pool = get_account_pool()
        await pool.sync_from_db(force_full=True)

        status = await self.get_status()
        if not status.get("reachable"):
            return {
                "success": False,
                "message": f"CookieBridge 不可达 ({self.base_url}): {status.get('error', 'ping failed')}",
                "synced": 0,
                "updated": 0,
                "skipped": 0,
            }

        clients = status.get("clients") or []
        if client_ids:
            allow = set(client_ids)
            clients = [c for c in clients if c.get("client_id") in allow]

        if only_connected:
            clients = [c for c in clients if c.get("connected", True)]

        if not clients:
            return {
                "success": False,
                "message": "CookieBridge 无已连接客户端。请启动 CookieBridge Server 并在 Chrome 安装 extension 后登录各平台。",
                "synced": 0,
                "updated": 0,
                "skipped": 0,
            }

        synced = 0
        updated = 0
        skipped = 0
        errors: List[str] = []

        for client in clients:
            client_id = client.get("client_id")
            if not client_id:
                continue

            nicknames = client.get("nicknames") or {}
            platforms_info = client.get("platforms") or {}
            platform_keys = self._platform_keys_for_client(platforms_info)

            for platform_key in platform_keys:
                plat_enum = PLATFORM_MAP[platform_key]
                cookies = await self._fetch_cookies(platform_key, client_id)
                if not cookies:
                    skipped += 1
                    continue

                account_id = self._stable_account_id(user_id, platform_key, client_id)
                account_name = self._account_display_name(platform_key, client_id, nicknames)
                platform_nick = (nicknames or {}).get(platform_key) or ""
                base_tags = ["cookiebridge", f"client_id:{client_id}"]
                if platform_nick:
                    base_tags.append(f"platform_nickname:{platform_nick}")
                now_note = f"CookieBridge sync {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"

                existing = pool.get_account(account_id)
                if existing:
                    if existing.user_id not in (None, user_id):
                        skipped += 1
                        errors.append(f"{account_id} 属于其他用户")
                        continue
                    await pool.update_account(
                        account_id,
                        {
                            "cookies": cookies,
                            "account_name": account_name,
                            "status": AccountStatus.ACTIVE,
                            "health_score": 100,
                            "notes": now_note,
                            "tags": base_tags,
                            "user_id": user_id,
                        },
                    )
                    updated += 1
                else:
                    account = AccountInfo(
                        id=account_id,
                        platform=plat_enum,
                        account_name=account_name,
                        cookies=cookies,
                        status=AccountStatus.ACTIVE,
                        health_score=100,
                        group="cookiebridge",
                        tags=base_tags,
                        notes=now_note,
                        user_id=user_id,
                    )
                    await pool.add_account(account)
                    synced += 1

        total = synced + updated
        message = f"已从 CookieBridge 同步 {total} 个账号（新增 {synced}，更新 {updated}，跳过 {skipped}）"
        if errors:
            message += f"；{len(errors)} 条冲突/跳过"

        return {
            "success": total > 0,
            "message": message,
            "synced": synced,
            "updated": updated,
            "skipped": skipped,
            "errors": errors[:10],
            "base_url": self.base_url,
        }


_cookiebridge_sync: Optional[CookieBridgeSyncService] = None


def get_cookiebridge_sync_service() -> CookieBridgeSyncService:
    global _cookiebridge_sync
    if _cookiebridge_sync is None:
        _cookiebridge_sync = CookieBridgeSyncService()
    return _cookiebridge_sync
