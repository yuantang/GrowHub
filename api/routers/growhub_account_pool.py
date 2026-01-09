# -*- coding: utf-8 -*-
# GrowHub Account Pool API - 账号池管理
# Phase 2 Week 9: 账号资产管理

from fastapi import APIRouter, HTTPException, Query, UploadFile, File
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime

from ..services.account_pool import (
    get_account_pool,
    AccountInfo,
    AccountStatus,
    AccountPlatform
)

router = APIRouter(prefix="/growhub/accounts", tags=["GrowHub - Account Pool"])


# ==================== Request Models ====================

class AddAccountRequest(BaseModel):
    """添加账号请求"""
    platform: AccountPlatform
    account_name: str = Field(..., min_length=1)
    cookies: str = Field(..., min_length=10)
    group: str = "default"
    tags: List[str] = []
    notes: Optional[str] = None


class UpdateAccountRequest(BaseModel):
    """更新账号请求"""
    account_name: Optional[str] = None
    cookies: Optional[str] = None
    group: Optional[str] = None
    tags: Optional[List[str]] = None
    notes: Optional[str] = None
    status: Optional[AccountStatus] = None


class BatchAddRequest(BaseModel):
    """批量添加请求"""
    platform: AccountPlatform
    accounts: List[Dict[str, str]]  # [{"name": "xxx", "cookies": "xxx"}]


# ==================== API Endpoints ====================

@router.get("/statistics")
async def get_statistics(platform: Optional[AccountPlatform] = None):
    """获取账号统计信息"""
    pool = get_account_pool()
    return pool.get_statistics(platform)


@router.get("/")
async def list_accounts(
    platform: Optional[AccountPlatform] = None,
    status: Optional[AccountStatus] = None,
    group: Optional[str] = None
):
    """获取账号列表"""
    pool = get_account_pool()
    accounts = pool.get_all_accounts(platform)
    
    if status:
        accounts = [a for a in accounts if a.status == status]
    
    if group:
        accounts = [a for a in accounts if a.group == group]
    
    # 转换为安全的响应格式（隐藏部分 Cookie）
    items = []
    for acc in accounts:
        item = acc.dict()
        # 只显示 Cookie 的前后部分
        if acc.cookies and len(acc.cookies) > 20:
            item["cookies"] = acc.cookies[:10] + "..." + acc.cookies[-10:]
        items.append(item)
    
    return {
        "total": len(items),
        "items": items
    }


@router.post("/")
async def add_account(request: AddAccountRequest):
    """添加单个账号"""
    pool = get_account_pool()
    
    account = AccountInfo(
        id="",
        platform=request.platform,
        account_name=request.account_name,
        cookies=request.cookies,
        group=request.group,
        tags=request.tags,
        notes=request.notes,
        status=AccountStatus.UNKNOWN
    )
    
    created = await pool.add_account(account)
    return created.dict()


@router.post("/batch")
async def batch_add_accounts(request: BatchAddRequest):
    """批量添加账号"""
    pool = get_account_pool()
    
    added = 0
    for acc_data in request.accounts:
        if 'cookies' not in acc_data:
            continue
        
        account = AccountInfo(
            id="",
            platform=request.platform,
            account_name=acc_data.get('name', f'{request.platform.value}_account'),
            cookies=acc_data['cookies'],
            status=AccountStatus.UNKNOWN
        )
        await pool.add_account(account)
        added += 1
    
    return {"message": f"成功添加 {added} 个账号", "added": added}


@router.get("/{account_id}")
async def get_account(account_id: str):
    """获取账号详情"""
    pool = get_account_pool()
    account = pool.get_account(account_id)
    
    if not account:
        raise HTTPException(status_code=404, detail="账号不存在")
    
    return account.dict()


@router.put("/{account_id}")
async def update_account(account_id: str, request: UpdateAccountRequest):
    """更新账号"""
    pool = get_account_pool()
    
    updates = request.dict(exclude_unset=True)
    updated = await pool.update_account(account_id, updates)
    
    if not updated:
        raise HTTPException(status_code=404, detail="账号不存在")
    
    return updated.dict()


@router.delete("/{account_id}")
async def delete_account(account_id: str):
    """删除账号"""
    pool = get_account_pool()
    success = await pool.delete_account(account_id)
    
    if not success:
        raise HTTPException(status_code=404, detail="账号不存在")
    
    return {"message": "账号已删除", "account_id": account_id}


@router.post("/{account_id}/check")
async def check_account_health(account_id: str):
    """检查单个账号健康状态"""
    pool = get_account_pool()
    result = await pool.check_account_health(account_id)
    
    if not result.get("success", True) and result.get("error") == "账号不存在":
        raise HTTPException(status_code=404, detail="账号不存在")
    
    # 返回更新后的账号信息
    account = pool.get_account(account_id)
    return {
        "check_result": result,
        "account": account.dict() if account else None
    }


@router.post("/check-all")
async def batch_check_health(platform: Optional[AccountPlatform] = None):
    """批量检查账号健康状态"""
    pool = get_account_pool()
    results = await pool.batch_check_health(platform)
    return results


@router.post("/get-available")
async def get_available_account(platform: AccountPlatform):
    """获取一个可用账号（用于任务执行）"""
    pool = get_account_pool()
    account = await pool.get_available_account(platform)
    
    if not account:
        raise HTTPException(
            status_code=404, 
            detail=f"没有可用的 {platform.value} 账号"
        )
    
    # 返回账号信息（包含完整 Cookie）
    return account.dict()


@router.post("/{account_id}/mark-used")
async def mark_account_used(
    account_id: str,
    success: bool = Query(..., description="本次使用是否成功"),
    cooldown_seconds: Optional[int] = Query(None, description="冷却时间(秒)")
):
    """标记账号已使用"""
    pool = get_account_pool()
    await pool.mark_account_used(account_id, success, cooldown_seconds)
    
    account = pool.get_account(account_id)
    if not account:
        raise HTTPException(status_code=404, detail="账号不存在")
    
    return account.dict()


@router.get("/groups/list")
async def list_groups():
    """获取所有分组"""
    pool = get_account_pool()
    accounts = pool.get_all_accounts()
    
    groups = set()
    for acc in accounts:
        groups.add(acc.group)
    
    return {"groups": sorted(list(groups))}


@router.post("/import/yaml")
async def import_from_yaml(yaml_path: str = Query(..., description="YAML 文件路径")):
    """从 YAML 文件导入账号"""
    pool = get_account_pool()
    result = await pool.import_from_yaml(yaml_path)
    
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result.get("error"))
    
    return result


@router.get("/export")
async def export_accounts():
    """导出所有账号"""
    pool = get_account_pool()
    return pool.export_to_dict()


@router.get("/platforms")
async def get_platforms():
    """获取支持的平台列表"""
    return {
        "platforms": [
            {"value": "xhs", "label": "小红书"},
            {"value": "douyin", "label": "抖音"},
            {"value": "bilibili", "label": "B站"},
            {"value": "weibo", "label": "微博"},
            {"value": "zhihu", "label": "知乎"},
            {"value": "kuaishou", "label": "快手"},
            {"value": "tieba", "label": "百度贴吧"}
        ]
    }


# ==================== QR Login Endpoints ====================

class QRLoginStartRequest(BaseModel):
    """扫码登录启动请求"""
    platform: str = Field(..., description="平台标识: xhs, douyin, bilibili, weibo")


@router.post("/qr-login/start")
async def start_qr_login(request: QRLoginStartRequest):
    """
    启动扫码登录
    返回 session_id 和二维码图片(base64)
    """
    from ..services.qr_login import get_qr_login_service
    
    service = get_qr_login_service()
    result = await service.start_login(request.platform)
    
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error"))
    
    return result


@router.get("/qr-login/status/{session_id}")
async def get_qr_login_status(session_id: str):
    """
    查询扫码登录状态
    返回: pending(等待扫码) / scanned(已扫未确认) / success(成功) / expired(过期) / error(失败)
    """
    from ..services.qr_login import get_qr_login_service
    
    service = get_qr_login_service()
    result = await service.get_status(session_id)
    
    # 如果登录成功，自动添加到账号池
    if result.get("status") == "success" and result.get("cookies"):
        pool = get_account_pool()
        
        # 将平台字符串转换为枚举
        platform_str = result.get("platform", "xhs")
        try:
            platform_enum = AccountPlatform(platform_str)
        except:
            platform_enum = AccountPlatform.XHS
        
        account = AccountInfo(
            id="",
            platform=platform_enum,
            account_name=result.get("account_name") or f"{platform_str}_扫码登录",
            cookies=result["cookies"],
            status=AccountStatus.ACTIVE,
            notes="通过扫码登录添加"
        )
        
        created = await pool.add_account(account)
        result["account_id"] = created.id
        result["message"] = "账号已自动添加到账号池"
    
    return result


@router.post("/qr-login/cancel/{session_id}")
async def cancel_qr_login(session_id: str):
    """取消扫码登录"""
    from ..services.qr_login import get_qr_login_service
    
    service = get_qr_login_service()
    return await service.cancel_login(session_id)


@router.get("/qr-login/platforms")
async def get_qr_login_platforms():
    """获取支持扫码登录的平台列表"""
    from ..services.qr_login import get_qr_login_service
    
    service = get_qr_login_service()
    platforms = []
    for key, config in service.platform_configs.items():
        platforms.append({
            "value": key,
            "label": config["name"]
        })
    
    return {"platforms": platforms}
