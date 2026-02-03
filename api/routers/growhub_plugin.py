# -*- coding: utf-8 -*-
"""
GrowHub Browser Plugin API Router
Handles communication between the browser plugin and GrowHub server.
"""
from fastapi import APIRouter, HTTPException, Depends, Header, Request
from pydantic import BaseModel
from typing import Dict, List, Any, Optional
from datetime import datetime
import json

from database.db_session import get_session
from database.growhub_models import GrowHubUser, GrowHubAccount, GrowHubSystemConfig
from sqlalchemy import select, update
from api.auth.deps import get_current_user, reusable_oauth2


router = APIRouter(prefix="/api/plugin", tags=["GrowHub - Plugin"])


async def get_report_auth_user(
    authorization: Optional[str] = Header(None),
    api_key: Optional[str] = None
) -> Optional[GrowHubUser]:
    """
    数据上报专用鉴权：支持 JWT Token 或 简单 API Key。
    """
    # 1. 尝试 JWT 鉴权 (从 Authorization Header)
    if authorization and authorization.startswith("Bearer "):
        try:
            token = authorization.split(" ")[1]
            from api.auth.deps import get_db, get_current_user
            async with get_session() as db:
                user = await get_current_user(db=db, token=token)
                return user
        except:
             pass

    # 2. 尝试 固定 API Key 鉴权 (支持 Header 或 Query)
    # 此处检查数据库中 growhub_settings.plugin_api_key
    target_key = api_key
    async with get_session() as session:
        result = await session.execute(
            select(GrowHubSystemConfig).where(GrowHubSystemConfig.config_key == "plugin_config")
        )
        config = result.scalar_one_or_none()
        if config:
            stored_key = config.config_value.get("report_key")
            if stored_key and (target_key == stored_key):
                # 简单 Key 模式下，返回管理员作为执行主体，或返回 None 表示“系统上报”
                # 这里我们查找第一个管理员作为 fallback 归属
                admin_result = await session.execute(select(GrowHubUser).filter(GrowHubUser.role == 'admin'))
                return admin_result.scalars().first()
    
    return None


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
    fingerprint: Optional[Dict[str, Any]] = None  # userAgent, language, etc.


class SyncCookiesResponse(BaseModel):
    status: str
    message: str
    synced_platforms: List[str]
    account_ids: Dict[str, str]


class MetaItem(BaseModel):
    key: str
    name: str
    alias: Optional[str] = None
    description: Optional[str] = None


class ReportDataRequest(BaseModel):
    """
    Data reporting request from browser plugin.
    Follows protocol: https://smzs.xisence.com/help/guide/data-reporting
    """
    extra: Dict[str, Any] = {}
    meta: List[MetaItem] = []
    list: List[Dict[str, Any]]
    remark: Optional[str] = None
    version: Optional[str] = None


class ReportDataResponse(BaseModel):
    status: str
    message: str
    count: int


def cookies_to_string(cookies: List[CookieItem]) -> str:
    """Convert cookie list to cookie string format"""
    return "; ".join([f"{c.name}={c.value}" for c in cookies])


def flatten_dict(d: Dict[str, Any], parent_key: str = '', sep: str = '.') -> Dict[str, Any]:
    """将嵌套字典扁平化，例如 {'user': {'name': 'A'}} -> {'user.name': 'A'}"""
    items = []
    for k, v in d.items():
        new_key = f"{parent_key}{sep}{k}" if parent_key else k
        if isinstance(v, dict):
            items.extend(flatten_dict(v, new_key, sep=sep).items())
        else:
            items.append((new_key, v))
            # 同时保留原始键名以便兼容已有逻辑
            items.append((k, v))
    return dict(items)


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
    
    # 指纹信息
    fingerprint_raw = data.fingerprint if hasattr(data, 'fingerprint') else None
    
    # Debug Logging
    import json
    import logging
    logger = logging.getLogger("api.plugin")
    logger.info(f"🔌 [Plugin Sync] Received sync request. Fingerprint present: {bool(fingerprint_raw)}")
    if fingerprint_raw:
         logger.info(f"   -> Fingerprint UA: {fingerprint_raw.get('userAgent', 'N/A')}")
    else:
         logger.warning("   -> ⚠️ No fingerprint data in request payload!")

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
        plugin_account_name = f"Plugin-{platform_code.upper()}-{current_user.username}"
        
        for acc in user_accounts:
            if acc.account_name == plugin_account_name:
                existing_account = acc
                break
        
        if existing_account:
            # Update existing
            update_data = {
                "cookies": cookie_str,
                "status": AccountStatus.ACTIVE,
                "health_score": 100,
                "last_check": datetime.now(),
                "updated_at": datetime.now(),
                "notes": f"Auto-synced via Plugin at {datetime.now().strftime('%H:%M:%S')}",
                "cooldown_until": None,  # Reset cooldown on fresh sync
            }
            if fingerprint_raw:
                update_data["fingerprint"] = fingerprint_raw
            
            await pool.update_account(existing_account.id, update_data)
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
                fingerprint=fingerprint_raw,
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


@router.post("/report-data", response_model=ReportDataResponse)
async def report_data(
    data: ReportDataRequest,
    api_key: Optional[str] = None,
    auth_user: Optional[GrowHubUser] = Depends(get_report_auth_user)
):
    """
    接收来自插件上报的数据并存入系统汇总表 (GrowHubContent)。
    支持分流至博主池、热点池等。
    鉴权模式：
    1. Authorization: Bearer <JWT_TOKEN>
    2. ?api_key=<FIXED_KEY> (或设置在 extra 中)
    """
    from ..services.growhub_store import get_growhub_store_service
    from tools import utils
    
    store_service = get_growhub_store_service()
    
    # 校验权限
    if not auth_user:
        # 尝试从数据包 extra 中再找一次 key
        # (有些插件配置不支持 Query Param)
        provided_key = api_key or data.extra.get("api_key")
        if provided_key:
             # 手动调用一次 key 检查
             auth_user = await get_report_auth_user(api_key=provided_key)
        
        if not auth_user:
            raise HTTPException(status_code=401, detail="Invalid API Key or Token")

    # 1. 提取公共上下文参数
    platform_override = data.extra.get("platform")
    project_id = data.extra.get("project_id")
    purpose = data.extra.get("purpose", "general")
    
    # 过滤器映射
    min_fans = data.extra.get("min_fans")
    max_fans = data.extra.get("max_fans")
    require_contact = data.extra.get("require_contact")
    
    utils.logger.info(f"💾 [Plugin Report] Received report from {auth_user.username}. Items: {len(data.list)}, Platform: {platform_override}")
    
    count = 0
    for item in data.list:
        try:
            # 2. 扁平化数据 (处理嵌套字段如 user.nickname)
            flat_item = flatten_dict(item)
            
            # 补充必要元数据
            if project_id:
                flat_item["project_id"] = project_id
            
            # 如果 item 中没有 platform，尝试使用全局或自动探测
            platform = flat_item.get("platform") or platform_override
            if not platform:
                # 简单启发式探测
                if "note_id" in flat_item: platform = "xhs"
                elif "aweme_id" in flat_item: platform = "dy"
                elif "video_id" in flat_item: platform = "bili"
                elif "photo_id" in flat_item: platform = "ks"
                else: platform = "unknown"
            
            # 3. 调用统一存储逻辑 (此处会处理去重、分流、舆情检测)
            await store_service.sync_to_growhub(
                platform=platform,
                raw_data=flat_item,
                min_fans=min_fans,
                max_fans=max_fans,
                require_contact=require_contact,
                purpose=purpose,
                user_id=auth_user.id
            )
            count += 1
            
        except Exception as e:
            utils.logger.error(f"[Plugin Report] Error processing item {count}: {e}")
            continue
            
    return ReportDataResponse(
        status="ok",
        message=f"Successfully synced {count} items to GrowHub Database",
        count=count
    )


@router.get("/get-setup-info")
async def get_plugin_setup_info(
    request: Request,
    current_user: GrowHubUser = Depends(get_current_user)
):
    """
    提供给前端页面的“一键配置”信息。
    包含：
    1. 当前登录用户的临时 JWT Header
    2. 上报 API 地址
    3. 系统预留的固定 Key (如果启用了)
    """
    # 获取 Base URL
    base_url = str(request.base_url).rstrip('/')
    
    # 获取系统配置的固定 Key
    report_key = "NOT_SET"
    async with get_session() as session:
        result = await session.execute(
            select(GrowHubSystemConfig).where(GrowHubSystemConfig.config_key == "plugin_config")
        )
        config = result.scalar_one_or_none()
        if config:
            report_key = config.config_value.get("report_key", "NOT_SET")
            
    # 获取当前用户的 Token (从请求中提取，或者这里重新生成一个也行)
    # 最简单的做法是让前端传过来，或者这里返还格式化的 Header
    auth_header = request.headers.get("Authorization", "Bearer <YOUR_TOKEN_HERE>")

    return {
        "setup_guide": "请将以下 JSON 内容参考填入社媒助手插件的配置中",
        "url": f"{base_url}/api/plugin/report-data",
        "method": "POST",
        "headers": {
            "Authorization": auth_header,
            "Content-Type": "application/json"
        },
        "fixed_key_url": f"{base_url}/api/plugin/report-data?api_key={report_key}",
        "fixed_key": report_key,
        "advice": "生产环境建议使用 Authorization 模式，本地快速测试可使用 fixed_key。"
    }
