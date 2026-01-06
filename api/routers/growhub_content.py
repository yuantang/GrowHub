# -*- coding: utf-8 -*-
# GrowHub - 内容分类与分发规则 API
# Phase 1: 内容抓取与舆情监控增强

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime

from database.db_session import get_session
from database.growhub_models import GrowHubContent, GrowHubDistributionRule, GrowHubNotification
from sqlalchemy import select, update, delete, func, desc
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


@router.get("/list", response_model=ContentListResponse)
async def list_contents(
    platform: Optional[str] = Query(None, description="平台筛选"),
    category: Optional[str] = Query(None, description="分类筛选"),
    sentiment: Optional[str] = Query(None, description="情感筛选"),
    is_alert: Optional[bool] = Query(None, description="是否预警"),
    is_handled: Optional[bool] = Query(None, description="是否已处理"),
    search: Optional[str] = Query(None, description="搜索关键词"),
    start_date: Optional[datetime] = Query(None, description="开始日期"),
    end_date: Optional[datetime] = Query(None, description="结束日期"),
    sort_by: str = Query("crawl_time", description="排序字段"),
    sort_order: str = Query("desc", description="排序方向"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100)
):
    """获取内容列表"""
    async with get_session() as session:
        query = select(GrowHubContent)
        count_query = select(func.count(GrowHubContent.id))
        
        # Apply filters
        if platform:
            query = query.where(GrowHubContent.platform == platform)
            count_query = count_query.where(GrowHubContent.platform == platform)
        
        if category:
            query = query.where(GrowHubContent.category == category)
            count_query = count_query.where(GrowHubContent.category == category)
        
        if sentiment:
            query = query.where(GrowHubContent.sentiment == sentiment)
            count_query = count_query.where(GrowHubContent.sentiment == sentiment)
        
        if is_alert is not None:
            query = query.where(GrowHubContent.is_alert == is_alert)
            count_query = count_query.where(GrowHubContent.is_alert == is_alert)
        
        if is_handled is not None:
            query = query.where(GrowHubContent.is_handled == is_handled)
            count_query = count_query.where(GrowHubContent.is_handled == is_handled)
        
        if search:
            query = query.where(
                GrowHubContent.title.ilike(f"%{search}%") | 
                GrowHubContent.description.ilike(f"%{search}%")
            )
            count_query = count_query.where(
                GrowHubContent.title.ilike(f"%{search}%") | 
                GrowHubContent.description.ilike(f"%{search}%")
            )
        
        if start_date:
            query = query.where(GrowHubContent.crawl_time >= start_date)
            count_query = count_query.where(GrowHubContent.crawl_time >= start_date)
        
        if end_date:
            query = query.where(GrowHubContent.crawl_time <= end_date)
            count_query = count_query.where(GrowHubContent.crawl_time <= end_date)
        
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
                "content_type": c.content_type,
                "title": c.title,
                "description": c.description[:200] if c.description else None,
                "author_name": c.author_name,
                "like_count": c.like_count,
                "comment_count": c.comment_count,
                "share_count": c.share_count,
                "view_count": c.view_count,
                "engagement_rate": c.engagement_rate,
                "category": c.category,
                "sentiment": c.sentiment,
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
async def get_content_stats():
    """获取内容统计概览"""
    async with get_session() as session:
        # Total count
        total_result = await session.execute(select(func.count(GrowHubContent.id)))
        total = total_result.scalar()
        
        # By platform
        platform_stats = {}
        for platform in ["douyin", "xiaohongshu", "bilibili", "weibo", "zhihu"]:
            result = await session.execute(
                select(func.count(GrowHubContent.id)).where(GrowHubContent.platform == platform)
            )
            count = result.scalar()
            if count > 0:
                platform_stats[platform] = count
        
        # By sentiment
        sentiment_stats = {}
        for sentiment in ["positive", "neutral", "negative"]:
            result = await session.execute(
                select(func.count(GrowHubContent.id)).where(GrowHubContent.sentiment == sentiment)
            )
            sentiment_stats[sentiment] = result.scalar()
        
        # By category
        category_stats = {}
        for category in ["sentiment", "hotspot", "competitor", "general"]:
            result = await session.execute(
                select(func.count(GrowHubContent.id)).where(GrowHubContent.category == category)
            )
            count = result.scalar()
            if count > 0:
                category_stats[category] = count
        
        # Alerts
        alert_result = await session.execute(
            select(func.count(GrowHubContent.id)).where(GrowHubContent.is_alert == True)
        )
        alert_count = alert_result.scalar()
        
        unhandled_result = await session.execute(
            select(func.count(GrowHubContent.id)).where(
                GrowHubContent.is_alert == True,
                GrowHubContent.is_handled == False
            )
        )
        unhandled_count = unhandled_result.scalar()
        
        return {
            "total": total,
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
    days: int = Query(7, ge=1, le=30)
):
    """获取内容趋势数据（按天统计）"""
    from datetime import timedelta
    
    async with get_session() as session:
        time_threshold = datetime.now() - timedelta(days=days)
        
        # 获取每天的内容数量和情感分布
        daily_stats = []
        for day_offset in range(days):
            day_start = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=day_offset)
            day_end = day_start + timedelta(days=1)
            
            # 总数
            total_query = select(func.count(GrowHubContent.id)).where(
                GrowHubContent.crawl_time >= day_start,
                GrowHubContent.crawl_time < day_end
            )
            if platform:
                total_query = total_query.where(GrowHubContent.platform == platform)
            
            total_result = await session.execute(total_query)
            total = total_result.scalar() or 0
            
            # 情感分布
            sentiment_data = {}
            for sentiment in ["positive", "neutral", "negative"]:
                s_query = select(func.count(GrowHubContent.id)).where(
                    GrowHubContent.crawl_time >= day_start,
                    GrowHubContent.crawl_time < day_end,
                    GrowHubContent.sentiment == sentiment
                )
                if platform:
                    s_query = s_query.where(GrowHubContent.platform == platform)
                s_result = await session.execute(s_query)
                sentiment_data[sentiment] = s_result.scalar() or 0
            
            # 预警数
            alert_query = select(func.count(GrowHubContent.id)).where(
                GrowHubContent.crawl_time >= day_start,
                GrowHubContent.crawl_time < day_end,
                GrowHubContent.is_alert == True
            )
            if platform:
                alert_query = alert_query.where(GrowHubContent.platform == platform)
            alert_result = await session.execute(alert_query)
            alerts = alert_result.scalar() or 0
            
            daily_stats.append({
                "date": day_start.strftime("%Y-%m-%d"),
                "total": total,
                "sentiment": sentiment_data,
                "alerts": alerts
            })
        
        # 逆序（从早到晚）
        daily_stats.reverse()
        
        return {
            "platform": platform,
            "days": days,
            "data": daily_stats
        }


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


