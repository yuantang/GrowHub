# -*- coding: utf-8 -*-
"""
GrowHub Browser Plugin API Router
Handles communication between the browser plugin and GrowHub server.
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Dict, List, Any, Optional
from datetime import datetime
import json

from database.db_session import get_session
from database.growhub_models import GrowHubUser, GrowHubAccount
from sqlalchemy import select, update
from api.auth.deps import get_current_user

router = APIRouter(prefix="/api/plugin", tags=["GrowHub - Plugin"])


class CookieItem(BaseModel):
    name: str
    value: str
    domain: str
    path: Optional[str] = "/"
    expirationDate: Optional[float] = None
    httpOnly: Optional[bool] = False
    secure: Optional[bool] = False
    sameSite: Optional[str] = None


class SyncCookiesRequest(BaseModel):
    """Request body for cookie sync from browser plugin"""
    cookies: Dict[str, List[CookieItem]]  # platform -> cookies


class SyncCookiesResponse(BaseModel):
    status: str
    message: str
    synced_platforms: List[str]
    account_ids: Dict[str, str]


def cookies_to_string(cookies: List[CookieItem]) -> str:
    """Convert cookie list to cookie string format"""
    return "; ".join([f"{c.name}={c.value}" for c in cookies])


def get_platform_name(platform_code: str) -> str:
    """Convert platform code to enum value if needed"""
    mapping = {
        "xhs": "xhs",
        "dy": "dy",
        "douyin": "dy",
        "ks": "ks",
        "kuaishou": "ks",
        "bili": "bili",
        "bilibili": "bili",
        "wb": "wb",
        "weibo": "wb"
    }
    return mapping.get(platform_code, platform_code)


@router.post("/sync-cookies", response_model=SyncCookiesResponse)
async def sync_cookies(
    data: SyncCookiesRequest,
    current_user: GrowHubUser = Depends(get_current_user)
):
    """
    Receive cookies from browser plugin and update account pool.
    """
    synced_platforms = []
    account_ids = {}
    
    # Import service here to avoid circular imports if any
    from .plugin_websocket import get_plugin_manager
    from ..services.account_pool import get_account_pool, AccountInfo, AccountPlatform, AccountStatus
    
    pool = get_account_pool()
    
    for platform_code_raw, cookies in data.cookies.items():
        if not cookies:
            continue
            
        # 1. Normalize Platform Code
        platform_code = get_platform_name(platform_code_raw)
        try:
            platform_enum = AccountPlatform(platform_code)
        except ValueError:
            utils.logger.warning(f"Unsupported platform from plugin: {platform_code}")
            continue
            
        cookie_str = cookies_to_string(cookies)
        
        # 2. Try to extract user identifier from cookies
        # This is a heuristic. For better results, we should query /api/me
        user_id_cookie = None
        for c in cookies:
            if c.name.lower() in ["userid", "user_id", "uid", "web_session", "sec_user_id"]:
                user_id_cookie = c.value[:50]
                break
        
        # 3. Check existing accounts in Pool (Memory Cache is faster)
        existing_account = None
        # Filter accounts for this user and platform
        user_accounts = await pool.get_all_accounts(platform=platform_enum, user_id=current_user.id)
        
        # Try to match by "Plugin" name pattern or create new
        # Since we don't have a stable ID from cookie yet, we use a single "Plugin" account per platform per user
        # Future improvement: Distinguish multiple accounts on same platform
        plugin_account_name = f"Plugin-{platform_code.upper()}-{current_user.username}"
        
        for acc in user_accounts:
            if acc.account_name == plugin_account_name:
                existing_account = acc
                break
        
        if existing_account:
            # Update existing
            await pool.update_account(existing_account.id, {
                "cookies": cookie_str,
                "status": AccountStatus.ACTIVE,
                "health_score": 100,
                "last_check": datetime.now(),
                "updated_at": datetime.now(),
                "notes": f"Auto-synced via Plugin at {datetime.now().strftime('%H:%M:%S')}"
            })
            account_ids[platform_code_raw] = existing_account.id
        else:
            # Create new
            import uuid
            new_account = AccountInfo(
                id=str(uuid.uuid4())[:8],
                platform=platform_enum,
                account_name=plugin_account_name,
                cookies=cookie_str,
                status=AccountStatus.ACTIVE,
                health_score=100,
                user_id=current_user.id,
                group="plugin_synced",
                notes=f"Created via Plugin at {datetime.now().strftime('%Y-%m-%d %H:%M')}"
            )
            created = await pool.add_account(new_account)
            account_ids[platform_code_raw] = created.id
        
        synced_platforms.append(platform_code_raw)
    
    return SyncCookiesResponse(
        status="ok",
        message=f"Synced {len(synced_platforms)} platform(s)",
        synced_platforms=synced_platforms,
        account_ids=account_ids
    )


@router.get("/status")
async def get_plugin_status(
    current_user: GrowHubUser = Depends(get_current_user)
):
    """Get plugin connection status for current user"""
    from .plugin_websocket import get_plugin_manager
    
    manager = get_plugin_manager()
    user_id = str(current_user.id)
    is_connected = manager.is_online(user_id)
    
    info = manager.connection_info.get(user_id, {})
    
    return {
        "user_id": user_id,
        "username": current_user.username,
        "connected": is_connected,
        "connected_at": info.get("connected_at") if is_connected else None,
        "last_ping": info.get("last_ping") if is_connected else None,
        "task_count": info.get("task_count", 0)
    }


@router.get("/online-users")
async def get_online_users(
    current_user: GrowHubUser = Depends(get_current_user)
):
    """Get list of users with online plugins (admin only for now)"""
    from .plugin_websocket import get_plugin_manager
    
    manager = get_plugin_manager()
    online_users = manager.get_online_users()
    
    return {
        "online_count": len(online_users),
        "users": [
            {
                "user_id": uid,
                **manager.connection_info.get(uid, {})
            }
            for uid in online_users
        ]
    }


@router.post("/test-fetch")
async def test_plugin_fetch(
    url: str,
    platform: str = "xhs",
    current_user: GrowHubUser = Depends(get_current_user)
):
    """
    Test endpoint: Fetch a URL using the user's connected plugin.
    This is for verifying the plugin data collection pipeline.
    """
    from ..services.plugin_crawler_service import get_plugin_crawler_service
    
    service = get_plugin_crawler_service()
    user_id = str(current_user.id)
    
    # Check if plugin is online
    if not await service.is_available(user_id):
        return {
            "success": False,
            "error": "Plugin not connected. Please ensure browser extension is running.",
            "user_id": user_id
        }
    
    # Execute fetch via plugin
    response = await service.fetch_url(
        user_id=user_id,
        platform=platform,
        url=url,
        method="GET",
        timeout=30.0
    )
    
    if not response:
        return {
            "success": False,
            "error": "Fetch failed or timed out"
        }
    
    return {
        "success": True,
        "status": response.get("status"),
        "body_preview": str(response.get("body", ""))[:500],
        "headers": response.get("headers", {})
    }


@router.post("/test-search")
async def test_plugin_search(
    keyword: str,
    platform: str = "xhs",
    page: int = 1,
    current_user: GrowHubUser = Depends(get_current_user)
):
    """
    Test endpoint: Search notes using the user's connected plugin.
    Returns parsed note list from the platform.
    """
    from ..services.plugin_crawler_service import get_plugin_crawler_service
    
    service = get_plugin_crawler_service()
    user_id = str(current_user.id)
    
    if not await service.is_available(user_id):
        return {
            "success": False,
            "error": "Plugin not connected",
            "user_id": user_id
        }
    
    notes = await service.search_notes(
        user_id=user_id,
        platform=platform,
        keyword=keyword,
        page=page
    )
    
    return {
        "success": True,
        "keyword": keyword,
        "platform": platform,
        "page": page,
        "count": len(notes),
        "notes": notes[:10]  # Return first 10 for preview
    }
