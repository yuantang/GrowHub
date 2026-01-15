# -*- coding: utf-8 -*-
"""
GrowHub 达人博主 API - 博主池管理接口
"""

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime

from api.services.creator_service import get_creator_service

router = APIRouter(prefix="/growhub/creators", tags=["GrowHub - Creators"])


# ==================== Pydantic Models ====================

class CreatorResponse(BaseModel):
    """博主响应"""
    id: int
    platform: str
    author_id: str
    author_name: Optional[str]
    author_avatar: Optional[str]
    author_url: Optional[str]
    signature: Optional[str]
    fans_count: int = 0
    follows_count: int = 0
    likes_count: int = 0
    works_count: int = 0
    contact_info: Optional[str]
    ip_location: Optional[str]
    avg_likes: int = 0
    avg_comments: int = 0
    content_count: int = 0
    status: str = "new"
    notes: Optional[str]
    source_project_id: Optional[int]
    source_keyword: Optional[str]
    first_seen_at: Optional[str]
    last_updated_at: Optional[str]
    created_at: Optional[str]


class CreatorListResponse(BaseModel):
    """博主列表响应"""
    total: int
    items: List[CreatorResponse]


class CreatorStatusUpdate(BaseModel):
    """博主状态更新请求"""
    status: str = Field(..., description="状态: new/contacted/cooperating/rejected")
    notes: Optional[str] = Field(None, description="备注")


class CreatorStatsResponse(BaseModel):
    """博主统计响应"""
    total: int
    by_status: Dict[str, int]
    by_platform: Dict[str, int]


# ==================== API Endpoints ====================

@router.get("/list", response_model=CreatorListResponse)
async def list_creators(
    platform: Optional[str] = Query(None, description="平台筛选"),
    source_project_id: Optional[int] = Query(None, description="来源项目ID"),
    status: Optional[str] = Query(None, description="状态筛选: new/contacted/cooperating/rejected"),
    min_fans: Optional[int] = Query(None, ge=0, description="最小粉丝数"),
    max_fans: Optional[int] = Query(None, ge=0, description="最大粉丝数"),
    source_keyword: Optional[str] = Query(None, description="来源关键词"),
    sort_by: str = Query("fans_count", description="排序字段: fans_count/likes_count/content_count/created_at"),
    sort_order: str = Query("desc", description="排序方向: asc/desc"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100)
):
    """获取达人博主列表"""
    creator_service = get_creator_service()
    
    result = await creator_service.list_creators(
        platform=platform,
        source_project_id=source_project_id,
        status=status,
        min_fans=min_fans,
        max_fans=max_fans,
        source_keyword=source_keyword,
        sort_by=sort_by,
        sort_order=sort_order,
        page=page,
        page_size=page_size
    )
    
    return CreatorListResponse(
        total=result["total"],
        items=[CreatorResponse(**item) for item in result["items"]]
    )


@router.get("/stats", response_model=CreatorStatsResponse)
async def get_creator_stats(
    source_project_id: Optional[int] = Query(None, description="来源项目ID")
):
    """获取博主统计数据"""
    creator_service = get_creator_service()
    stats = await creator_service.get_stats(source_project_id=source_project_id)
    return CreatorStatsResponse(**stats)


@router.get("/{creator_id}", response_model=CreatorResponse)
async def get_creator(creator_id: int):
    """获取单个博主详情"""
    from database.db_session import get_session
    from database.growhub_models import GrowHubCreator
    from sqlalchemy import select
    
    async with get_session() as session:
        result = await session.execute(
            select(GrowHubCreator).where(GrowHubCreator.id == creator_id)
        )
        creator = result.scalar()
        
        if not creator:
            raise HTTPException(status_code=404, detail="博主不存在")
        
        creator_service = get_creator_service()
        return CreatorResponse(**creator_service._creator_to_dict(creator))


@router.patch("/{creator_id}/status")
async def update_creator_status(creator_id: int, data: CreatorStatusUpdate):
    """更新博主状态"""
    creator_service = get_creator_service()
    success = await creator_service.update_creator_status(
        creator_id=creator_id,
        status=data.status,
        notes=data.notes
    )
    
    if not success:
        raise HTTPException(status_code=404, detail="博主不存在")
    
    return {"success": True, "message": "状态更新成功"}


@router.delete("/{creator_id}")
async def delete_creator(creator_id: int):
    """删除博主"""
    from database.db_session import get_session
    from database.growhub_models import GrowHubCreator
    from sqlalchemy import select, delete
    
    async with get_session() as session:
        result = await session.execute(
            select(GrowHubCreator).where(GrowHubCreator.id == creator_id)
        )
        creator = result.scalar()
        
        if not creator:
            raise HTTPException(status_code=404, detail="博主不存在")
        
        await session.execute(
            delete(GrowHubCreator).where(GrowHubCreator.id == creator_id)
        )
        await session.commit()
        
        return {"success": True, "message": "博主已删除"}
