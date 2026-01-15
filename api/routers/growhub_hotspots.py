# -*- coding: utf-8 -*-
"""
GrowHub 热点内容 API - 热点排行管理接口
"""

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime, date

from api.services.hotspot_service import get_hotspot_service

router = APIRouter(prefix="/growhub/hotspots", tags=["GrowHub - Hotspots"])


# ==================== Pydantic Models ====================

class HotspotResponse(BaseModel):
    """热点响应"""
    id: int
    rank: int = 0
    content_id: Optional[int]
    platform_content_id: Optional[str]
    platform: Optional[str]
    title: Optional[str]
    author_name: Optional[str]
    cover_url: Optional[str]
    content_url: Optional[str]
    heat_score: int = 0
    like_count: int = 0
    comment_count: int = 0
    share_count: int = 0
    view_count: int = 0
    rank_date: Optional[str]
    source_project_id: Optional[int]
    source_keyword: Optional[str]
    publish_time: Optional[str]
    entered_at: Optional[str]


class HotspotListResponse(BaseModel):
    """热点列表响应"""
    total: int
    items: List[HotspotResponse]


class HotspotStatsResponse(BaseModel):
    """热点统计响应"""
    total: int
    today_count: int
    by_platform: Dict[str, int]
    avg_heat_score: int


# ==================== API Endpoints ====================

@router.get("/list", response_model=HotspotListResponse)
async def list_hotspots(
    platform: Optional[str] = Query(None, description="平台筛选"),
    source_project_id: Optional[int] = Query(None, description="来源项目ID"),
    source_keyword: Optional[str] = Query(None, description="来源关键词"),
    rank_date: Optional[date] = Query(None, description="排行日期"),
    start_date: Optional[date] = Query(None, description="发布开始日期"),
    end_date: Optional[date] = Query(None, description="发布结束日期"),
    min_heat: Optional[int] = Query(None, ge=0, description="最小热度分"),
    sort_by: str = Query("heat_score", description="排序字段: heat_score/like_count/comment_count/entered_at"),
    sort_order: str = Query("desc", description="排序方向: asc/desc"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100)
):
    """获取热点内容列表"""
    hotspot_service = get_hotspot_service()
    
    result = await hotspot_service.list_hotspots(
        platform=platform,
        source_project_id=source_project_id,
        source_keyword=source_keyword,
        rank_date=rank_date,
        start_date=start_date,
        end_date=end_date,
        min_heat=min_heat,
        sort_by=sort_by,
        sort_order=sort_order,
        page=page,
        page_size=page_size
    )
    
    return HotspotListResponse(
        total=result["total"],
        items=[HotspotResponse(**item) for item in result["items"]]
    )


@router.get("/ranking", response_model=List[HotspotResponse])
async def get_daily_ranking(
    rank_date: Optional[date] = Query(None, description="排行日期，默认今日"),
    platform: Optional[str] = Query(None, description="平台筛选"),
    limit: int = Query(50, ge=1, le=100, description="返回数量")
):
    """获取日榜排行"""
    hotspot_service = get_hotspot_service()
    
    ranking = await hotspot_service.get_daily_ranking(
        rank_date=rank_date,
        platform=platform,
        limit=limit
    )
    
    return [HotspotResponse(**item) for item in ranking]


@router.get("/stats", response_model=HotspotStatsResponse)
async def get_hotspot_stats(
    source_project_id: Optional[int] = Query(None, description="来源项目ID")
):
    """获取热点统计数据"""
    hotspot_service = get_hotspot_service()
    stats = await hotspot_service.get_stats(source_project_id=source_project_id)
    return HotspotStatsResponse(**stats)


@router.get("/{hotspot_id}", response_model=HotspotResponse)
async def get_hotspot(hotspot_id: int):
    """获取单个热点详情"""
    from database.db_session import get_session
    from database.growhub_models import GrowHubHotspot
    from sqlalchemy import select
    
    async with get_session() as session:
        result = await session.execute(
            select(GrowHubHotspot).where(GrowHubHotspot.id == hotspot_id)
        )
        hotspot = result.scalar()
        
        if not hotspot:
            raise HTTPException(status_code=404, detail="热点不存在")
        
        hotspot_service = get_hotspot_service()
        return HotspotResponse(**hotspot_service._hotspot_to_dict(hotspot))


@router.delete("/{hotspot_id}")
async def delete_hotspot(hotspot_id: int):
    """删除热点"""
    from database.db_session import get_session
    from database.growhub_models import GrowHubHotspot
    from sqlalchemy import select, delete
    
    async with get_session() as session:
        result = await session.execute(
            select(GrowHubHotspot).where(GrowHubHotspot.id == hotspot_id)
        )
        hotspot = result.scalar()
        
        if not hotspot:
            raise HTTPException(status_code=404, detail="热点不存在")
        
        await session.execute(
            delete(GrowHubHotspot).where(GrowHubHotspot.id == hotspot_id)
        )
        await session.commit()
        
        return {"success": True, "message": "热点已删除"}
