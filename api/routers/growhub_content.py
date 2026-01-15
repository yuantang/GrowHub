# -*- coding: utf-8 -*-
# GrowHub - 内容分类与分发规则 API
# Phase 1: 内容抓取与舆情监控增强

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any, Union
from datetime import datetime, date, time
import csv
import io

from database.db_session import get_session
from database.growhub_models import GrowHubContent, GrowHubDistributionRule, GrowHubNotification
from sqlalchemy import select, update, delete, func, desc, and_
from sqlalchemy.orm import selectinload

router = APIRouter(prefix="/growhub/content", tags=["GrowHub - Content"])


# ==================== Pydantic Models ====================

class ContentAnalysisRequest(BaseModel):
    """内容分析请求"""
    text: str = Field(..., min_length=1, description="待分析的文本内容")
    title: Optional[str] = None
    platform: Optional[str] = None


class ContentAnalysisResponse(BaseModel):
    """内容分析响应"""
    sentiment: str  # positive/neutral/negative
    sentiment_score: float  # -1 到 1
    category: str  # sentiment/hotspot/competitor/general
    keywords: List[str]
    is_alert: bool
    alert_level: Optional[str]
    alert_reason: Optional[str]


class ContentListResponse(BaseModel):
    total: int
    items: List[dict]


class DistributionRuleBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    priority: int = Field(0, ge=0, le=100)
    conditions: Dict[str, Any] = Field(..., description="规则条件")
    actions: Dict[str, Any] = Field(..., description="规则动作")
    is_active: bool = True


class DistributionRuleCreate(DistributionRuleBase):
    pass


class DistributionRuleUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    priority: Optional[int] = Field(None, ge=0, le=100)
    conditions: Optional[Dict[str, Any]] = None
    actions: Optional[Dict[str, Any]] = None
    is_active: Optional[bool] = None


class DistributionRuleResponse(DistributionRuleBase):
    id: int
    trigger_count: int
    last_trigger_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ==================== Content Analysis API ====================

@router.post("/analyze", response_model=ContentAnalysisResponse)
async def analyze_content(data: ContentAnalysisRequest):
    """分析内容情感和分类"""
    from api.services.llm_service import get_llm_service
    
    llm_service = get_llm_service()
    
    prompt = f"""分析以下社交媒体内容，判断其情感倾向、分类和是否需要预警。

标题: {data.title or '无'}
内容: {data.text}
平台: {data.platform or '未知'}

请分析并返回JSON格式结果：
{{
    "sentiment": "positive/neutral/negative 三选一",
    "sentiment_score": "情感分数，-1到1之间，负数为负面，正数为正面",
    "category": "分类，可选: sentiment(舆情)/hotspot(热点)/competitor(竞品)/general(普通)",
    "keywords": ["提取的关键词列表，最多5个"],
    "is_alert": "是否需要预警，true/false",
    "alert_level": "预警级别，可选: low/medium/high/critical，如不需预警则为null",
    "alert_reason": "预警原因，如不需预警则为null"
}}

判断标准：
- 负面情感: 投诉、差评、质疑、不满等
- 需要预警: 严重负面评价、投诉、质量问题、虚假宣传指控等
- 热点内容: 讨论度高、话题性强的内容

只返回JSON，不要其他内容。"""

    try:
        response = await llm_service.chat_completion(
            messages=[{"role": "user", "content": prompt}],
            response_format="json"
        )
        
        import json
        result = json.loads(response)
        
        return ContentAnalysisResponse(
            sentiment=result.get("sentiment", "neutral"),
            sentiment_score=float(result.get("sentiment_score", 0)),
            category=result.get("category", "general"),
            keywords=result.get("keywords", []),
            is_alert=result.get("is_alert", False),
            alert_level=result.get("alert_level"),
            alert_reason=result.get("alert_reason")
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"内容分析失败: {str(e)}")


def apply_content_filters(
    query,
    platform: Optional[str] = None,
    category: Optional[str] = None,
    sentiment: Optional[str] = None,
    is_alert: Optional[bool] = None,
    is_handled: Optional[bool] = None,
    search: Optional[str] = None,
    source_keyword: Optional[str] = None,
    start_date: Optional[Union[datetime, date]] = None,
    end_date: Optional[Union[datetime, date]] = None,
    min_likes: Optional[int] = None,
    min_comments: Optional[int] = None,
    min_shares: Optional[int] = None,
    min_fans: Optional[int] = None,
    max_fans: Optional[int] = None
):
    """Refactored helper to apply common filters to GrowHubContent query"""
    if platform:
        query = query.where(GrowHubContent.platform == platform)
    
    if category:
        query = query.where(GrowHubContent.category == category)
    
    if sentiment:
        query = query.where(GrowHubContent.sentiment == sentiment)
    
    if is_alert is not None:
        query = query.where(GrowHubContent.is_alert == is_alert)
    
    if is_handled is not None:
        query = query.where(GrowHubContent.is_handled == is_handled)
    
    if search:
        query = query.where(
            GrowHubContent.title.ilike(f"%{search}%") | 
            GrowHubContent.description.ilike(f"%{search}%")
        )
    
    if source_keyword:
        query = query.where(GrowHubContent.source_keyword.ilike(f"%{source_keyword}%"))
    
    if start_date:
        if isinstance(start_date, date) and not isinstance(start_date, datetime):
            start_date = datetime.combine(start_date, time.min)
        query = query.where(GrowHubContent.publish_time >= start_date)
    
    if end_date:
        if isinstance(end_date, date) and not isinstance(end_date, datetime):
            end_date = datetime.combine(end_date, time.max)
        query = query.where(GrowHubContent.publish_time <= end_date)
    
    if min_likes is not None:
        query = query.where(GrowHubContent.like_count >= min_likes)
    
    if min_comments is not None:
        query = query.where(GrowHubContent.comment_count >= min_comments)
    
    if min_shares is not None:
        query = query.where(GrowHubContent.share_count >= min_shares)

    if min_fans is not None:
        query = query.where(GrowHubContent.author_fans_count >= min_fans)
        
    if max_fans is not None and max_fans > 0:
        query = query.where(GrowHubContent.author_fans_count <= max_fans)
        
    return query


@router.get("/export", summary="导出内容列表 (CSV)")
async def export_contents(
    platform: Optional[str] = Query(None, description="平台筛选"),
    category: Optional[str] = Query(None, description="分类筛选"),
    sentiment: Optional[str] = Query(None, description="情感筛选"),
    is_alert: Optional[bool] = Query(None, description="是否预警"),
    is_handled: Optional[bool] = Query(None, description="是否已处理"),
    search: Optional[str] = Query(None, description="标题模糊搜索"),
    source_keyword: Optional[str] = Query(None, description="任务名称/关键词筛选"),
    start_date: Optional[Union[datetime, date]] = Query(None, description="开始日期"),
    end_date: Optional[Union[datetime, date]] = Query(None, description="结束日期"),
    min_likes: Optional[int] = Query(None, ge=0, description="最小点赞数"),
    min_comments: Optional[int] = Query(None, ge=0, description="最小评论数"),
    min_shares: Optional[int] = Query(None, ge=0, description="最小分享数"),
    min_fans: Optional[int] = Query(None, ge=0, description="最小粉丝数"),
    max_fans: Optional[int] = Query(None, ge=0, description="最大粉丝数"),
    sort_by: str = Query("crawl_time", description="排序字段"),
    sort_order: str = Query("desc", description="排序方向")
):
    """导出筛选内容为CSV"""
    async with get_session() as session:
        query = select(GrowHubContent)
        
        # Apply filters
        query = apply_content_filters(
            query, platform, category, sentiment, is_alert, is_handled,
            search, source_keyword, start_date, end_date,
            min_likes, min_comments, min_shares, min_fans, max_fans
        )
        
        # Sorting
        sort_column = getattr(GrowHubContent, sort_by, GrowHubContent.crawl_time)
        if sort_order == "desc":
            query = query.order_by(desc(sort_column))
        else:
            query = query.order_by(sort_column)
            
        # Limit to 5000 to prevent OOM
        query = query.limit(5000)
        
        result = await session.execute(query)
        items = result.scalars().all()
        
        # Create CSV
        output = io.StringIO()
        writer = csv.writer(output)
        
        headers = ["ID", "平台", "标题", "作者", "作者ID", "作者联系方式", "粉丝数", "点赞", "评论", "分享", "收藏", "发布时间", "链接", "关键词"]
        writer.writerow(headers)
        
        for i in items:
            writer.writerow([
                i.id,
                i.platform,
                i.title,
                i.author_name,
                i.author_id,
                i.author_contact,
                i.author_fans_count,
                i.like_count,
                i.comment_count,
                i.share_count,
                i.collect_count,
                i.publish_time,
                i.content_url,
                i.source_keyword
            ])
            
        output.seek(0)
        
        filename = f"growhub_data_{datetime.now().strftime('%Y%m%d%H%M')}.csv"
        return StreamingResponse(
            io.BytesIO(output.getvalue().encode('utf-8-sig')),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )


@router.get("/list", response_model=ContentListResponse)
async def list_contents(
    platform: Optional[str] = Query(None, description="平台筛选"),
    category: Optional[str] = Query(None, description="分类筛选"),
    sentiment: Optional[str] = Query(None, description="情感筛选"),
    is_alert: Optional[bool] = Query(None, description="是否预警"),
    is_handled: Optional[bool] = Query(None, description="是否已处理"),
    search: Optional[str] = Query(None, description="标题模糊搜索"),
    source_keyword: Optional[str] = Query(None, description="任务名称/关键词筛选"),
    start_date: Optional[Union[datetime, date]] = Query(None, description="开始日期"),
    end_date: Optional[Union[datetime, date]] = Query(None, description="结束日期"),
    min_likes: Optional[int] = Query(None, ge=0, description="最小点赞数"),
    min_comments: Optional[int] = Query(None, ge=0, description="最小评论数"),
    min_shares: Optional[int] = Query(None, ge=0, description="最小分享数"),
    sort_by: str = Query("crawl_time", description="排序字段"),
    sort_order: str = Query("desc", description="排序方向"),
    deduplicate_authors: bool = Query(False, description="是否博主去重"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100)
):
    """获取内容列表（数据池）"""
    async with get_session() as session:
        if deduplicate_authors:
            # Dedup Logic using Window Function
            # 1. Inner query with filters
            inner_stmt = select(GrowHubContent.id, GrowHubContent.author_id, GrowHubContent.publish_time)
            inner_stmt = apply_content_filters(
                inner_stmt, platform, category, sentiment, is_alert, is_handled,
                search, source_keyword, start_date, end_date,
                min_likes, min_comments, min_shares, min_fans, max_fans
            )
            
            subq = inner_stmt.subquery()
            rn = func.row_number().over(
                partition_by=subq.c.author_id, 
                order_by=desc(subq.c.publish_time)
            ).label("rn")
            
            cte = select(subq.c.id, rn).cte()
            
            # 2. Main query joining CTE
            query = select(GrowHubContent).join(cte, GrowHubContent.id == cte.c.id).where(cte.c.rn == 1)
            
            # 3. Count query
            count_query = select(func.count()).select_from(cte).where(cte.c.rn == 1)
            
        else:
            # Standard Logic
            query = select(GrowHubContent)
            count_query = select(func.count(GrowHubContent.id))
            
            # Apply filters
            query = apply_content_filters(
                query, platform, category, sentiment, is_alert, is_handled,
                search, source_keyword, start_date, end_date,
                min_likes, min_comments, min_shares, min_fans, max_fans
            )
            count_query = apply_content_filters(
                count_query, platform, category, sentiment, is_alert, is_handled,
                search, source_keyword, start_date, end_date,
                min_likes, min_comments, min_shares, min_fans, max_fans
            )
        
        # Get total
        total_result = await session.execute(count_query)
        total = total_result.scalar()
        
        # Apply sorting
        sort_column = getattr(GrowHubContent, sort_by, GrowHubContent.crawl_time)
        if sort_order == "desc":
            query = query.order_by(desc(sort_column))
        else:
            query = query.order_by(sort_column)
        
        # Apply pagination
        query = query.offset((page - 1) * page_size).limit(page_size)
        
        result = await session.execute(query)
        contents = result.scalars().all()
        
        return ContentListResponse(
            total=total,
            items=[{
                "id": c.id,
                "platform": c.platform,
                "platform_content_id": c.platform_content_id,
                "content_type": c.content_type,
                "title": c.title,
                "description": c.description[:300] if c.description else None,
                "content_url": c.content_url,
                "cover_url": c.cover_url,
                "author_id": c.author_id,
                "author_name": c.author_name,
                "author_avatar": c.author_avatar,
                "author_fans_count": c.author_fans_count,
                "author_follows_count": c.author_follows_count,
                "author_likes_count": c.author_likes_count,
                "author_contact": c.author_contact,
                "ip_location": c.ip_location,
                "video_url": c.video_url,
                "media_urls": c.media_urls or [],
                "like_count": c.like_count or 0,
                "comment_count": c.comment_count or 0,
                "share_count": c.share_count or 0,
                "collect_count": c.collect_count or 0,
                "view_count": c.view_count or 0,
                "engagement_rate": c.engagement_rate,
                "category": c.category,
                "sentiment": c.sentiment,
                "source_keyword": c.source_keyword,
                "is_alert": c.is_alert,
                "alert_level": c.alert_level,
                "is_handled": c.is_handled,
                "publish_time": c.publish_time.isoformat() if c.publish_time else None,
                "crawl_time": c.crawl_time.isoformat() if c.crawl_time else None
            } for c in contents]
        )


@router.get("/alerts")
async def get_alerts(
    is_handled: Optional[bool] = Query(None),
    alert_level: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100)
):
    """获取预警内容列表"""
    async with get_session() as session:
        query = select(GrowHubContent).where(GrowHubContent.is_alert == True)
        count_query = select(func.count(GrowHubContent.id)).where(GrowHubContent.is_alert == True)
        
        if is_handled is not None:
            query = query.where(GrowHubContent.is_handled == is_handled)
            count_query = count_query.where(GrowHubContent.is_handled == is_handled)
        
        if alert_level:
            query = query.where(GrowHubContent.alert_level == alert_level)
            count_query = count_query.where(GrowHubContent.alert_level == alert_level)
        
        total_result = await session.execute(count_query)
        total = total_result.scalar()
        
        query = query.order_by(desc(GrowHubContent.crawl_time))
        query = query.offset((page - 1) * page_size).limit(page_size)
        
        result = await session.execute(query)
        alerts = result.scalars().all()
        
        return {
            "total": total,
            "unhandled": total if is_handled is None else (total if not is_handled else 0),
            "items": [{
                "id": c.id,
                "platform": c.platform,
                "title": c.title,
                "description": c.description[:200] if c.description else None,
                "author_name": c.author_name,
                "alert_level": c.alert_level,
                "alert_reason": c.alert_reason,
                "is_handled": c.is_handled,
                "handled_at": c.handled_at.isoformat() if c.handled_at else None,
                "handled_by": c.handled_by,
                "crawl_time": c.crawl_time.isoformat() if c.crawl_time else None
            } for c in alerts]
        }


@router.post("/alerts/{content_id}/handle")
async def handle_alert(content_id: int, handled_by: str = "system"):
    """标记预警已处理"""
    async with get_session() as session:
        result = await session.execute(
            select(GrowHubContent).where(GrowHubContent.id == content_id)
        )
        content = result.scalar()
        
        if not content:
            raise HTTPException(status_code=404, detail="内容不存在")
        
        content.is_handled = True
        content.handled_at = datetime.now()
        content.handled_by = handled_by
        
        return {"message": "预警已标记为已处理"}


@router.get("/stats")
async def get_content_stats(
    platform: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    sentiment: Optional[str] = Query(None),
    is_alert: Optional[bool] = Query(None),
    is_handled: Optional[bool] = Query(None),
    search: Optional[str] = Query(None),
    source_keyword: Optional[str] = Query(None),
    start_date: Optional[Union[datetime, date]] = Query(None),
    end_date: Optional[Union[datetime, date]] = Query(None),
    min_likes: Optional[int] = Query(None),
    min_comments: Optional[int] = Query(None),
    min_shares: Optional[int] = Query(None),
    min_fans: Optional[int] = Query(None),
    max_fans: Optional[int] = Query(None)
):
    """获取内容统计概览（数据池仪表盘）"""
    filter_args = {
        "platform": platform, "category": category, "sentiment": sentiment,
        "is_alert": is_alert, "is_handled": is_handled, "search": search,
        "source_keyword": source_keyword, "start_date": start_date, "end_date": end_date,
        "min_likes": min_likes, "min_comments": min_comments, "min_shares": min_shares,
        "min_fans": min_fans, "max_fans": max_fans
    }

    async with get_session() as session:
        # Total count
        total_query = select(func.count(GrowHubContent.id))
        total_query = apply_content_filters(total_query, **filter_args)
        total_result = await session.execute(total_query)
        total = total_result.scalar() or 0
        
        # Aggregated interaction stats
        agg_query = select(
            func.sum(GrowHubContent.like_count),
            func.sum(GrowHubContent.comment_count),
            func.sum(GrowHubContent.share_count),
            func.sum(GrowHubContent.collect_count),
            func.sum(GrowHubContent.view_count),
            func.avg(GrowHubContent.like_count)
        )
        agg_query = apply_content_filters(agg_query, **filter_args)
        agg_result = await session.execute(agg_query)
        agg_row = agg_result.one()
        total_likes = int(agg_row[0] or 0)
        total_comments = int(agg_row[1] or 0)
        total_shares = int(agg_row[2] or 0)
        total_collects = int(agg_row[3] or 0)
        total_views = int(agg_row[4] or 0)
        avg_likes = round(float(agg_row[5] or 0), 2)
        
        # By platform
        platform_stats = {}
        for p in ["douyin", "dy", "xiaohongshu", "xhs", "bilibili", "bili", "weibo", "wb", "zhihu", "kuaishou", "ks", "tieba"]:
            # Skip if specific platform filtered and doesn't match
            if platform and platform != p:
                continue
                
            p_query = select(func.count(GrowHubContent.id)).where(GrowHubContent.platform == p)
            # Apply other filters (excluding platform to avoid conflict if logic wasn't 100% cleanly separated, strictly platform arg handles platform)
            # Actually apply_content_filters handles platform check.
            # But if I pass platform='xhs' to helper, helper adds where(platform='xhs').
            # And here I added where(platform=p).
            # If p != 'xhs', count is 0.
            # My 'if platform and platform != p' check above optimizes this.
            # So I just pass filter_args to helper.
            p_query = apply_content_filters(p_query, **filter_args)
            
            result = await session.execute(p_query)
            count = result.scalar()
            if count > 0:
                platform_stats[p] = count
        
        # By sentiment
        sentiment_stats = {}
        for s in ["positive", "neutral", "negative"]:
            if sentiment and sentiment != s:
                continue
            
            s_query = select(func.count(GrowHubContent.id)).where(GrowHubContent.sentiment == s)
            s_query = apply_content_filters(s_query, **filter_args)
            result = await session.execute(s_query)
            sentiment_stats[s] = result.scalar()
        
        # By category
        category_stats = {}
        for c in ["sentiment", "hotspot", "competitor", "general"]:
            if category and category != c:
                continue
                
            c_query = select(func.count(GrowHubContent.id)).where(GrowHubContent.category == c)
            c_query = apply_content_filters(c_query, **filter_args)
            result = await session.execute(c_query)
            count = result.scalar()
            if count > 0:
                category_stats[c] = count
        
        # Alerts
        # For alerts section, we want total alerts matching filters (if any)
        # Note: 'is_alert' filter might be set in filter_args.
        # If user filters is_alert=False, this section might suffice to show 0.
        
        alert_query = select(func.count(GrowHubContent.id)).where(GrowHubContent.is_alert == True)
        alert_query = apply_content_filters(alert_query, **filter_args)
        alert_result = await session.execute(alert_query)
        alert_count = alert_result.scalar()
        
        unhandled_query = select(func.count(GrowHubContent.id)).where(
            GrowHubContent.is_alert == True,
            GrowHubContent.is_handled == False
        )
        unhandled_query = apply_content_filters(unhandled_query, **filter_args)
        unhandled_result = await session.execute(unhandled_query)
        unhandled_count = unhandled_result.scalar()
        
        return {
            "total": total,
            "total_likes": total_likes,
            "total_comments": total_comments,
            "total_shares": total_shares,
            "total_collects": total_collects,
            "total_views": total_views,
            "avg_likes": avg_likes,
            "by_platform": platform_stats,
            "by_sentiment": sentiment_stats,
            "by_category": category_stats,
            "alerts": {
                "total": alert_count,
                "unhandled": unhandled_count
            }
        }


@router.get("/hotspots")
async def get_hotspot_content(
    platform: Optional[str] = Query(None, description="平台筛选"),
    hours: int = Query(24, ge=1, le=168, description="时间范围（小时）"),
    limit: int = Query(10, ge=1, le=50, description="返回数量")
):
    """获取热点内容排行"""
    from datetime import timedelta
    
    async with get_session() as session:
        # 计算时间范围
        time_threshold = datetime.now() - timedelta(hours=hours)
        
        query = select(GrowHubContent).where(
            GrowHubContent.crawl_time >= time_threshold
        )
        
        if platform:
            query = query.where(GrowHubContent.platform == platform)
        
        # 按互动率和互动总量综合排序
        query = query.order_by(
            desc(GrowHubContent.engagement_rate),
            desc(GrowHubContent.like_count + GrowHubContent.comment_count + GrowHubContent.share_count)
        ).limit(limit)
        
        result = await session.execute(query)
        contents = result.scalars().all()
        
        return {
            "period_hours": hours,
            "platform": platform,
            "items": [{
                "id": c.id,
                "rank": idx + 1,
                "platform": c.platform,
                "title": c.title,
                "description": c.description[:100] if c.description else None,
                "author_name": c.author_name,
                "author_avatar": c.author_avatar,
                "like_count": c.like_count,
                "comment_count": c.comment_count,
                "share_count": c.share_count,
                "view_count": c.view_count,
                "engagement_rate": c.engagement_rate,
                "sentiment": c.sentiment,
                "category": c.category,
                "publish_time": c.publish_time.isoformat() if c.publish_time else None,
                "content_url": c.content_url,
                "cover_url": c.cover_url,
                "heat_score": (c.like_count or 0) + (c.comment_count or 0) * 2 + (c.share_count or 0) * 3
            } for idx, c in enumerate(contents)]
        }


@router.get("/trend")
async def get_content_trend(
    platform: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    sentiment: Optional[str] = Query(None),
    is_alert: Optional[bool] = Query(None),
    is_handled: Optional[bool] = Query(None),
    search: Optional[str] = Query(None),
    source_keyword: Optional[str] = Query(None),
    start_date: Optional[Union[datetime, date]] = Query(None),
    end_date: Optional[Union[datetime, date]] = Query(None),
    min_likes: Optional[int] = Query(None),
    min_comments: Optional[int] = Query(None),
    min_shares: Optional[int] = Query(None),
    min_fans: Optional[int] = Query(None),
    max_fans: Optional[int] = Query(None),
    days: int = Query(7, ge=1)
):
    """获取内容趋势数据（按天统计，基于发布时间）"""
    from datetime import timedelta
    
    # Ensure start/end are datetimes if provided
    if start_date and isinstance(start_date, date) and not isinstance(start_date, datetime):
        start_date = datetime.combine(start_date, time.min)
    if end_date and isinstance(end_date, date) and not isinstance(end_date, datetime):
        end_date = datetime.combine(end_date, time.max)
    
    # Prepare filter args (excluding start_date/end_date from args passed to helper if they define the range loop?)
    # Actually, apply_content_filters logic is: AND(conditions).
    # If we loop day-by-day, we add `day_start <= publish_time < day_end`.
    # If filter_args has start_date/end_date, they act as global boundaries.
    # So if day is outside global boundary, count is 0. This is CORRECT.
    
    filter_args = {
        "platform": platform, "category": category, "sentiment": sentiment,
        "is_alert": is_alert, "is_handled": is_handled, "search": search,
        "source_keyword": source_keyword, "start_date": start_date, "end_date": end_date,
        "min_likes": min_likes, "min_comments": min_comments, "min_shares": min_shares
    }

    async with get_session() as session:
        # Determine date range
        if start_date and end_date:
            range_days = (end_date - start_date).days + 1
            if range_days > 90: # Limit to 90 days to prevent abuse
                range_days = 90
                # Adjust start_date to be 90 days before end_date
                calc_start = end_date - timedelta(days=90)
            else:
                calc_start = start_date
            
            loop_days = range_days
            base_time = calc_start
            is_forward = True
        else:
            base_time = datetime.now() - timedelta(days=days)
            loop_days = days
            is_forward = True

        # Group data by day
        daily_stats = []
        
        for i in range(loop_days):
            if is_forward:
                day_start = base_time + timedelta(days=i)
            
            # Normalize to 00:00:00
            day_start = day_start.replace(hour=0, minute=0, second=0, microsecond=0)
            day_end = day_start + timedelta(days=1)
            
            # Use publish_time for consistency with list filters
            date_criteria = and_(
                GrowHubContent.publish_time >= day_start,
                GrowHubContent.publish_time < day_end
            )
            
            # Total
            total_query = select(func.count(GrowHubContent.id)).where(date_criteria)
            total_query = apply_content_filters(total_query, **filter_args)
            
            # Optimisation: Remove start_date/end_date from apply_content_filters for this specific query 
            # to avoid redundancy? SQLAlchemy handles it fine.
            
            total_result = await session.execute(total_query)
            total = total_result.scalar() or 0
            
            # 情感分布 (Aggregated for efficiency? Or separate queries?)
            # Doing separate queries inside loop is slower but cleaner code reusing helper
            # Sentiment stats
            sentiment_data = {}
            for s in ["positive", "neutral", "negative"]:
                s_query = select(func.count(GrowHubContent.id)).where(
                    date_criteria,
                    GrowHubContent.sentiment == s
                )
                s_query = apply_content_filters(s_query, **filter_args)
                s_res = await session.execute(s_query)
                sentiment_data[s] = s_res.scalar() or 0
                
            # Alert stats
            alert_query = select(func.count(GrowHubContent.id)).where(
                date_criteria,
                GrowHubContent.is_alert == True
            )
            alert_query = apply_content_filters(alert_query, **filter_args)
            alert_res = await session.execute(alert_query)
            alerts = alert_res.scalar() or 0
            
            daily_stats.append({
                "date": day_start.strftime("%Y-%m-%d"),
                "total": total,
                "sentiment": sentiment_data,
                "alerts": alerts
            })
            
        return {
            "platform": platform,
            "days": loop_days,
            "data": daily_stats
        }


@router.get("/top_analysis")
async def get_top_analysis(
    limit: int = Query(10, ge=1, le=50),
    platform: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    sentiment: Optional[str] = Query(None),
    is_alert: Optional[bool] = Query(None),
    is_handled: Optional[bool] = Query(None),
    search: Optional[str] = Query(None),
    source_keyword: Optional[str] = Query(None),
    start_date: Optional[Union[datetime, date]] = Query(None),
    end_date: Optional[Union[datetime, date]] = Query(None),
    min_likes: Optional[int] = Query(None),
    min_comments: Optional[int] = Query(None),
    min_shares: Optional[int] = Query(None),
    min_fans: Optional[int] = Query(None),
    max_fans: Optional[int] = Query(None)
):
    """获取 Top 10 内容分析（按点赞降序）"""
    
    filter_args = {
        "platform": platform, "category": category, "sentiment": sentiment,
        "is_alert": is_alert, "is_handled": is_handled, "search": search,
        "source_keyword": source_keyword, "start_date": start_date, "end_date": end_date,
        "min_likes": min_likes, "min_comments": min_comments, "min_shares": min_shares,
        "min_fans": min_fans, "max_fans": max_fans
    }
    
    async with get_session() as session:
        query = select(GrowHubContent)
        query = apply_content_filters(query, **filter_args)
        query = query.order_by(desc(GrowHubContent.like_count)).limit(limit)
        
        result = await session.execute(query)
        contents = result.scalars().all()
        
        return [{
            "id": c.id,
            "title": c.title[:20] + "..." if c.title and len(c.title) > 20 else (c.title or "无标题"),
            "like_count": c.like_count or 0,
            "comment_count": c.comment_count or 0
        } for c in contents]



# ==================== Distribution Rules API ====================


rules_router = APIRouter(prefix="/growhub/rules", tags=["GrowHub - Distribution Rules"])


@rules_router.get("", response_model=List[DistributionRuleResponse])
async def list_rules(is_active: Optional[bool] = Query(None)):
    """获取分发规则列表"""
    async with get_session() as session:
        query = select(GrowHubDistributionRule)
        
        if is_active is not None:
            query = query.where(GrowHubDistributionRule.is_active == is_active)
        
        query = query.order_by(desc(GrowHubDistributionRule.priority))
        
        result = await session.execute(query)
        rules = result.scalars().all()
        
        return [DistributionRuleResponse.model_validate(r) for r in rules]


@rules_router.post("", response_model=DistributionRuleResponse)
async def create_rule(data: DistributionRuleCreate):
    """创建分发规则"""
    async with get_session() as session:
        rule = GrowHubDistributionRule(
            name=data.name,
            description=data.description,
            priority=data.priority,
            conditions=data.conditions,
            actions=data.actions,
            is_active=data.is_active
        )
        session.add(rule)
        await session.flush()
        await session.refresh(rule)
        
        return DistributionRuleResponse.model_validate(rule)


@rules_router.get("/{rule_id}", response_model=DistributionRuleResponse)
async def get_rule(rule_id: int):
    """获取单个规则详情"""
    async with get_session() as session:
        result = await session.execute(
            select(GrowHubDistributionRule).where(GrowHubDistributionRule.id == rule_id)
        )
        rule = result.scalar()
        
        if not rule:
            raise HTTPException(status_code=404, detail="规则不存在")
        
        return DistributionRuleResponse.model_validate(rule)


@rules_router.put("/{rule_id}", response_model=DistributionRuleResponse)
async def update_rule(rule_id: int, data: DistributionRuleUpdate):
    """更新分发规则"""
    async with get_session() as session:
        result = await session.execute(
            select(GrowHubDistributionRule).where(GrowHubDistributionRule.id == rule_id)
        )
        rule = result.scalar()
        
        if not rule:
            raise HTTPException(status_code=404, detail="规则不存在")
        
        update_data = data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(rule, field, value)
        
        await session.flush()
        await session.refresh(rule)
        
        return DistributionRuleResponse.model_validate(rule)


@rules_router.delete("/{rule_id}")
async def delete_rule(rule_id: int):
    """删除分发规则"""
    async with get_session() as session:
        result = await session.execute(
            select(GrowHubDistributionRule).where(GrowHubDistributionRule.id == rule_id)
        )
        rule = result.scalar()
        
        if not rule:
            raise HTTPException(status_code=404, detail="规则不存在")
        
        await session.delete(rule)
        
        return {"message": "规则已删除"}


@rules_router.get("/templates/list")
async def get_rule_templates():
    """获取预设规则模板"""
    return {
        "templates": [
            {
                "name": "负面舆情预警",
                "description": "自动识别负面内容并发送预警通知",
                "conditions": {
                    "sentiment": "negative",
                    "or": [
                        {"keywords_contain": ["投诉", "差评", "难用", "假货", "骗人", "垃圾"]},
                        {"sentiment_score": {"<": -0.5}}
                    ]
                },
                "actions": {
                    "notify": ["舆情组", "客服组"],
                    "channel": ["wechat_work"],
                    "urgency": "high",
                    "tag": "舆情"
                }
            },
            {
                "name": "热点内容推送",
                "description": "识别高互动内容并推送给运营团队",
                "conditions": {
                    "engagement_rate": {">": 0.05},
                    "like_count": {">": 1000},
                    "publish_time": {"within_hours": 24}
                },
                "actions": {
                    "notify": ["内容运营组"],
                    "channel": ["wechat_work"],
                    "urgency": "normal",
                    "tag": "热点"
                }
            },
            {
                "name": "竞品内容监控",
                "description": "监控竞品相关内容",
                "conditions": {
                    "keywords_contain": ["竞品A", "竞品B"],
                    "category": "competitor"
                },
                "actions": {
                    "notify": ["市场组"],
                    "channel": ["email"],
                    "urgency": "normal",
                    "tag": "竞品"
                }
            }
        ]
    }


