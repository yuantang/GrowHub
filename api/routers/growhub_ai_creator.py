# -*- coding: utf-8 -*-
# GrowHub AI Creator API - 智能创作工作台
# Phase 2: AI 增强与智能化

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any

from ..services.llm import (
    generate_smart_comments,
    rewrite_viral_content,
    analyze_content_deep,
    get_available_styles,
    get_available_providers,
    LLMProvider
)

router = APIRouter(prefix="/growhub/ai", tags=["GrowHub - AI Creator"])


# ==================== Request/Response Models ====================

class GenerateCommentsRequest(BaseModel):
    """智能评论生成请求"""
    content: str = Field(..., min_length=10, description="原始内容")
    content_title: Optional[str] = Field(None, description="内容标题")
    platform: str = Field("xiaohongshu", description="平台: xiaohongshu/douyin/weibo/bilibili/zhihu")
    styles: List[str] = Field(["professional", "humorous", "empathy"], description="评论风格")
    brand_keywords: Optional[List[str]] = Field(None, description="品牌关键词(用于软性引流)")
    provider: str = Field("openrouter", description="LLM供应商: openrouter/deepseek/ollama")
    model: Optional[str] = Field(None, description="具体模型(可选)")


class RewriteContentRequest(BaseModel):
    """文案改写请求"""
    original_content: str = Field(..., min_length=20, description="原始内容")
    original_title: Optional[str] = Field(None, description="原始标题")
    target_style: str = Field("xiaohongshu", description="目标风格: xiaohongshu/douyin/weibo/professional")
    target_topic: Optional[str] = Field(None, description="目标主题/行业")
    brand_keywords: Optional[List[str]] = Field(None, description="需要融入的品牌关键词")
    keep_structure: bool = Field(True, description="是否保留原文结构")
    provider: str = Field("openrouter", description="LLM供应商")
    model: Optional[str] = Field(None, description="具体模型")


class AnalyzeContentRequest(BaseModel):
    """深度分析请求"""
    content: str = Field(..., min_length=10, description="待分析内容")
    title: Optional[str] = Field(None, description="内容标题")
    platform: Optional[str] = Field(None, description="来源平台")
    provider: str = Field("openrouter", description="LLM供应商")
    model: Optional[str] = Field(None, description="具体模型")


# ==================== API Endpoints ====================

@router.get("/styles")
async def get_styles():
    """获取所有可用的评论和改写风格模板"""
    return get_available_styles()


@router.get("/providers")
async def get_providers():
    """获取可用的 LLM 供应商列表"""
    return get_available_providers()


@router.post("/comments/generate")
async def generate_comments(request: GenerateCommentsRequest):
    """
    智能评论生成
    
    根据目标内容生成多种风格的高质量评论，可用于：
    - 蹭热点截流
    - 竞品内容下拦截流量  
    - 培养账号互动权重
    """
    try:
        provider = LLMProvider(request.provider)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid provider: {request.provider}")
    
    result = await generate_smart_comments(
        content=request.content,
        content_title=request.content_title,
        platform=request.platform,
        styles=request.styles,
        brand_keywords=request.brand_keywords,
        provider=provider,
        model=request.model
    )
    
    if not result.get("success"):
        raise HTTPException(status_code=500, detail=result.get("error", "Unknown error"))
    
    return result


@router.post("/content/rewrite")
async def rewrite_content(request: RewriteContentRequest):
    """
    爆款文案改写
    
    将热门内容改写成适合自己使用的版本：
    - 保留爆款逻辑，避免抄袭风险
    - 自动适配目标平台风格
    - 可融入品牌关键词
    """
    try:
        provider = LLMProvider(request.provider)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid provider: {request.provider}")
    
    result = await rewrite_viral_content(
        original_content=request.original_content,
        original_title=request.original_title,
        target_style=request.target_style,
        target_topic=request.target_topic,
        brand_keywords=request.brand_keywords,
        keep_structure=request.keep_structure,
        provider=provider,
        model=request.model
    )
    
    if not result.get("success"):
        raise HTTPException(status_code=500, detail=result.get("error", "Unknown error"))
    
    return result


@router.post("/content/analyze")
async def analyze_content(request: AnalyzeContentRequest):
    """
    深度内容分析
    
    对内容进行多维度分析：
    - 情感判断与强度
    - 传播潜力预估
    - 目标受众识别
    - 改进建议
    """
    try:
        provider = LLMProvider(request.provider)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid provider: {request.provider}")
    
    result = await analyze_content_deep(
        content=request.content,
        title=request.title,
        platform=request.platform,
        provider=provider,
        model=request.model
    )
    
    if not result.get("success"):
        raise HTTPException(status_code=500, detail=result.get("error", "Unknown error"))
    
    return result


@router.post("/batch/comments")
async def batch_generate_comments(
    content_ids: List[int] = Query(..., description="内容ID列表"),
    styles: List[str] = Query(["professional"], description="评论风格"),
    provider: str = Query("openrouter", description="LLM供应商")
):
    """
    批量评论生成（从已监控的内容库中选择）
    
    适用于批量对竞品或热点内容生成评论
    """
    from database.db_session import get_session
    from database.growhub_models import GrowHubContent
    from sqlalchemy import select
    
    results = []
    
    async with get_session() as session:
        if session is None:
            raise HTTPException(status_code=500, detail="Database not available")
        
        stmt = select(GrowHubContent).where(GrowHubContent.id.in_(content_ids))
        db_result = await session.execute(stmt)
        contents = db_result.scalars().all()
        
        for content in contents:
            try:
                comment_result = await generate_smart_comments(
                    content=content.description or content.title or "",
                    content_title=content.title,
                    platform=content.platform,
                    styles=styles,
                    provider=LLMProvider(provider)
                )
                results.append({
                    "content_id": content.id,
                    "content_title": content.title,
                    "result": comment_result
                })
            except Exception as e:
                results.append({
                    "content_id": content.id,
                    "error": str(e)
                })
    
    return {"batch_results": results, "total": len(results)}


@router.get("/templates/comments")
async def get_comment_templates():
    """获取评论模板库（预设的高转化评论模板）"""
    templates = [
        {
            "id": 1,
            "name": "好奇追问型",
            "template": "这个{关键词}真的有用吗？我也想试试，求详细分享！",
            "best_for": ["种草内容", "测评内容"],
            "expected_reply_rate": "高"
        },
        {
            "id": 2,
            "name": "经验分享型",
            "template": "之前我也用过类似的{产品类型}，{正面/负面}体验...",
            "best_for": ["竞品内容", "行业讨论"],
            "expected_reply_rate": "中"
        },
        {
            "id": 3,
            "name": "认同共鸣型",
            "template": "太对了！{痛点描述}真的是...",
            "best_for": ["吐槽内容", "情绪内容"],
            "expected_reply_rate": "高"
        },
        {
            "id": 4,
            "name": "专业补充型",
            "template": "补充一点：从{专业角度}来看，{观点}...",
            "best_for": ["科普内容", "教程内容"],
            "expected_reply_rate": "中"
        },
        {
            "id": 5,
            "name": "软性引流型",
            "template": "我家用的是{品牌}的，感觉{优点}...",
            "best_for": ["产品讨论", "求推荐"],
            "expected_reply_rate": "中"
        }
    ]
    return {"templates": templates}
