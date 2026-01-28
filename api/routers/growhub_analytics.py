# -*- coding: utf-8 -*-
"""
GrowHub Analytics API - 数据分析仪表盘接口
Phase 16: Analytics Dashboard
"""

from fastapi import APIRouter, Depends, Query
from datetime import datetime, timedelta
from typing import Optional, List
from pydantic import BaseModel
from sqlalchemy import select, func, desc, and_
from sqlalchemy.orm import Session

from database.db_session import get_session
from database.growhub_models import GrowHubContent, GrowHubKeyword, GrowHubProject
from api.services.auth import get_current_user
from database.growhub_models import GrowHubUser

router = APIRouter(prefix="/growhub/analytics", tags=["Analytics"])


# ==================== Response Models ====================

class KeywordTrendPoint(BaseModel):
    date: str
    count: int


class KeywordTrendResponse(BaseModel):
    keyword: str
    trend: List[KeywordTrendPoint]
    total: int


class CreatorLeaderboardItem(BaseModel):
    author_id: str
    author_name: str
    author_avatar: Optional[str]
    platform: str
    content_count: int
    total_likes: int
    total_comments: int
    avg_engagement: float


class CollectionStatsResponse(BaseModel):
    total_contents: int
    today_contents: int
    week_contents: int
    month_contents: int
    by_platform: dict
    by_sentiment: dict


class PlatformDistributionItem(BaseModel):
    platform: str
    count: int
    percentage: float


# ==================== API Endpoints ====================

@router.get("/keyword-trends", response_model=List[KeywordTrendResponse])
async def get_keyword_trends(
    days: int = Query(7, ge=1, le=30, description="查询天数"),
    limit: int = Query(5, ge=1, le=20, description="关键词数量"),
    project_id: Optional[int] = Query(None, description="项目ID过滤"),
    current_user: GrowHubUser = Depends(get_current_user)
):
    """获取热门关键词趋势数据"""
    async with get_session() as session:
        start_date = datetime.now() - timedelta(days=days)
        
        # 1. 获取热门关键词(按内容数排序)
        keyword_query = (
            select(
                GrowHubContent.source_keyword,
                func.count(GrowHubContent.id).label('count')
            )
            .where(
                and_(
                    GrowHubContent.source_keyword.isnot(None),
                    GrowHubContent.crawl_time >= start_date
                )
            )
        )
        
        if project_id:
            keyword_query = keyword_query.where(GrowHubContent.project_id == project_id)
        
        keyword_query = (
            keyword_query
            .group_by(GrowHubContent.source_keyword)
            .order_by(desc('count'))
            .limit(limit)
        )
        
        result = await session.execute(keyword_query)
        top_keywords = result.all()
        
        # 2. 获取每个关键词的每日趋势
        trends = []
        for kw_row in top_keywords:
            keyword = kw_row.source_keyword
            total = kw_row.count
            
            # 每日统计
            daily_query = (
                select(
                    func.date(GrowHubContent.crawl_time).label('date'),
                    func.count(GrowHubContent.id).label('count')
                )
                .where(
                    and_(
                        GrowHubContent.source_keyword == keyword,
                        GrowHubContent.crawl_time >= start_date
                    )
                )
                .group_by(func.date(GrowHubContent.crawl_time))
                .order_by('date')
            )
            
            daily_result = await session.execute(daily_query)
            daily_data = daily_result.all()
            
            trend_points = [
                KeywordTrendPoint(date=str(row.date), count=row.count)
                for row in daily_data
            ]
            
            trends.append(KeywordTrendResponse(
                keyword=keyword,
                trend=trend_points,
                total=total
            ))
        
        return trends


@router.get("/creator-leaderboard", response_model=List[CreatorLeaderboardItem])
async def get_creator_leaderboard(
    days: int = Query(30, ge=1, le=90, description="统计天数"),
    limit: int = Query(10, ge=1, le=50, description="排行数量"),
    platform: Optional[str] = Query(None, description="平台过滤"),
    sort_by: str = Query("content_count", description="排序字段: content_count, total_likes, avg_engagement"),
    current_user: GrowHubUser = Depends(get_current_user)
):
    """获取博主排行榜"""
    async with get_session() as session:
        start_date = datetime.now() - timedelta(days=days)
        
        # 聚合查询
        query = (
            select(
                GrowHubContent.author_id,
                GrowHubContent.author_name,
                GrowHubContent.author_avatar,
                GrowHubContent.platform,
                func.count(GrowHubContent.id).label('content_count'),
                func.sum(GrowHubContent.like_count).label('total_likes'),
                func.sum(GrowHubContent.comment_count).label('total_comments'),
                func.avg(GrowHubContent.engagement_rate).label('avg_engagement')
            )
            .where(
                and_(
                    GrowHubContent.author_id.isnot(None),
                    GrowHubContent.crawl_time >= start_date
                )
            )
        )
        
        if platform:
            query = query.where(GrowHubContent.platform == platform)
        
        query = query.group_by(
            GrowHubContent.author_id,
            GrowHubContent.author_name,
            GrowHubContent.author_avatar,
            GrowHubContent.platform
        )
        
        # 排序
        if sort_by == "total_likes":
            query = query.order_by(desc('total_likes'))
        elif sort_by == "avg_engagement":
            query = query.order_by(desc('avg_engagement'))
        else:
            query = query.order_by(desc('content_count'))
        
        query = query.limit(limit)
        
        result = await session.execute(query)
        rows = result.all()
        
        return [
            CreatorLeaderboardItem(
                author_id=row.author_id,
                author_name=row.author_name or "Unknown",
                author_avatar=row.author_avatar,
                platform=row.platform,
                content_count=row.content_count,
                total_likes=int(row.total_likes or 0),
                total_comments=int(row.total_comments or 0),
                avg_engagement=round(float(row.avg_engagement or 0), 4)
            )
            for row in rows
        ]


@router.get("/collection-stats", response_model=CollectionStatsResponse)
async def get_collection_stats(
    project_id: Optional[int] = Query(None, description="项目ID过滤"),
    current_user: GrowHubUser = Depends(get_current_user)
):
    """获取采集量概览统计"""
    async with get_session() as session:
        now = datetime.now()
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        week_start = today_start - timedelta(days=7)
        month_start = today_start - timedelta(days=30)
        
        # 基础过滤条件
        base_filter = []
        if project_id:
            base_filter.append(GrowHubContent.project_id == project_id)
        
        # 总量
        total_query = select(func.count(GrowHubContent.id))
        if base_filter:
            total_query = total_query.where(*base_filter)
        total_result = await session.execute(total_query)
        total_contents = total_result.scalar() or 0
        
        # 今日
        today_query = select(func.count(GrowHubContent.id)).where(
            GrowHubContent.crawl_time >= today_start, *base_filter
        )
        today_result = await session.execute(today_query)
        today_contents = today_result.scalar() or 0
        
        # 本周
        week_query = select(func.count(GrowHubContent.id)).where(
            GrowHubContent.crawl_time >= week_start, *base_filter
        )
        week_result = await session.execute(week_query)
        week_contents = week_result.scalar() or 0
        
        # 本月
        month_query = select(func.count(GrowHubContent.id)).where(
            GrowHubContent.crawl_time >= month_start, *base_filter
        )
        month_result = await session.execute(month_query)
        month_contents = month_result.scalar() or 0
        
        # 平台分布
        platform_query = (
            select(
                GrowHubContent.platform,
                func.count(GrowHubContent.id).label('count')
            )
            .group_by(GrowHubContent.platform)
        )
        if base_filter:
            platform_query = platform_query.where(*base_filter)
        platform_result = await session.execute(platform_query)
        by_platform = {row.platform: row.count for row in platform_result.all()}
        
        # 情感分布
        sentiment_query = (
            select(
                GrowHubContent.sentiment,
                func.count(GrowHubContent.id).label('count')
            )
            .group_by(GrowHubContent.sentiment)
        )
        if base_filter:
            sentiment_query = sentiment_query.where(*base_filter)
        sentiment_result = await session.execute(sentiment_query)
        by_sentiment = {row.sentiment: row.count for row in sentiment_result.all()}
        
        return CollectionStatsResponse(
            total_contents=total_contents,
            today_contents=today_contents,
            week_contents=week_contents,
            month_contents=month_contents,
            by_platform=by_platform,
            by_sentiment=by_sentiment
        )


@router.get("/platform-distribution", response_model=List[PlatformDistributionItem])
async def get_platform_distribution(
    days: int = Query(30, ge=1, le=90, description="统计天数"),
    project_id: Optional[int] = Query(None, description="项目ID过滤"),
    current_user: GrowHubUser = Depends(get_current_user)
):
    """获取平台分布统计"""
    async with get_session() as session:
        start_date = datetime.now() - timedelta(days=days)
        
        # 平台分布查询
        query = (
            select(
                GrowHubContent.platform,
                func.count(GrowHubContent.id).label('count')
            )
            .where(GrowHubContent.crawl_time >= start_date)
            .group_by(GrowHubContent.platform)
            .order_by(desc('count'))
        )
        
        if project_id:
            query = query.where(GrowHubContent.project_id == project_id)
        
        result = await session.execute(query)
        rows = result.all()
        
        # 计算百分比
        total = sum(row.count for row in rows)
        
        return [
            PlatformDistributionItem(
                platform=row.platform,
                count=row.count,
                percentage=round(row.count / total * 100, 2) if total > 0 else 0
            )
            for row in rows
        ]
