"""
GrowHub Keywords Management API
关键词管理 API - 支持分层管理和AI衍生
"""
from fastapi import APIRouter, HTTPException, Query, Depends
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
from sqlalchemy import select, func, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession

from database.db_session import get_async_session
from database.growhub_models import GrowHubKeyword

router = APIRouter(prefix="/growhub/keywords", tags=["GrowHub Keywords"])


# ============ Pydantic Models ============

class KeywordCreate(BaseModel):
    keyword: str
    level: int = 1  # 1=品牌词, 2=品类词, 3=情绪词
    keyword_type: Optional[str] = None
    parent_id: Optional[int] = None
    priority: int = 50
    is_active: bool = True


class KeywordUpdate(BaseModel):
    keyword: Optional[str] = None
    level: Optional[int] = None
    keyword_type: Optional[str] = None
    priority: Optional[int] = None
    is_active: Optional[bool] = None


class KeywordResponse(BaseModel):
    id: int
    keyword: str
    level: int
    keyword_type: Optional[str]
    parent_id: Optional[int]
    priority: int
    is_active: bool
    is_ai_generated: bool
    hit_count: int
    content_count: int
    avg_engagement: float
    created_at: datetime
    updated_at: datetime
    last_crawl_at: Optional[datetime]

    class Config:
        from_attributes = True


class KeywordListResponse(BaseModel):
    items: List[KeywordResponse]
    total: int
    page: int
    page_size: int


class BatchKeywordsCreate(BaseModel):
    keywords: List[str]
    level: int = 1
    keyword_type: Optional[str] = None
    priority: int = 50


class KeywordGenerateRequest(BaseModel):
    seed_keywords: List[str]
    generate_types: List[str] = ["scene", "pain_point", "emotion"]
    count_per_type: int = 5


class KeywordStatsResponse(BaseModel):
    total: int
    by_level: dict
    active: int
    inactive: int
    ai_generated: int
    manual: int


# ============ API Endpoints ============

@router.get("", response_model=KeywordListResponse)
async def list_keywords(
    level: Optional[int] = None,
    keyword_type: Optional[str] = None,
    is_active: Optional[bool] = None,
    search: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    session: AsyncSession = Depends(get_async_session)
):
    """获取关键词列表"""
    query = select(GrowHubKeyword)
    count_query = select(func.count(GrowHubKeyword.id))
    
    # Filters
    conditions = []
    if level is not None:
        conditions.append(GrowHubKeyword.level == level)
    if keyword_type:
        conditions.append(GrowHubKeyword.keyword_type == keyword_type)
    if is_active is not None:
        conditions.append(GrowHubKeyword.is_active == is_active)
    if search:
        conditions.append(GrowHubKeyword.keyword.ilike(f"%{search}%"))
    
    if conditions:
        query = query.where(and_(*conditions))
        count_query = count_query.where(and_(*conditions))
    
    # Count
    total_result = await session.execute(count_query)
    total = total_result.scalar() or 0
    
    # Pagination
    query = query.order_by(GrowHubKeyword.priority.desc(), GrowHubKeyword.id.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)
    
    result = await session.execute(query)
    keywords = result.scalars().all()
    
    return KeywordListResponse(
        items=[KeywordResponse.model_validate(k) for k in keywords],
        total=total,
        page=page,
        page_size=page_size
    )


@router.post("", response_model=KeywordResponse)
async def create_keyword(
    data: KeywordCreate,
    session: AsyncSession = Depends(get_async_session)
):
    """创建单个关键词"""
    # Check duplicate
    existing = await session.execute(
        select(GrowHubKeyword).where(GrowHubKeyword.keyword == data.keyword)
    )
    if existing.scalar():
        raise HTTPException(status_code=400, detail="关键词已存在")
    
    keyword = GrowHubKeyword(
        keyword=data.keyword,
        level=data.level,
        keyword_type=data.keyword_type,
        parent_id=data.parent_id,
        priority=data.priority,
        is_active=data.is_active,
        is_ai_generated=False
    )
    session.add(keyword)
    await session.commit()
    await session.refresh(keyword)
    
    return KeywordResponse.model_validate(keyword)


@router.post("/batch", response_model=dict)
async def batch_create_keywords(
    data: BatchKeywordsCreate,
    session: AsyncSession = Depends(get_async_session)
):
    """批量创建关键词"""
    created = 0
    skipped = 0
    
    for kw in data.keywords:
        kw = kw.strip()
        if not kw:
            continue
        
        # Check duplicate
        existing = await session.execute(
            select(GrowHubKeyword).where(GrowHubKeyword.keyword == kw)
        )
        if existing.scalar():
            skipped += 1
            continue
        
        keyword = GrowHubKeyword(
            keyword=kw,
            level=data.level,
            keyword_type=data.keyword_type,
            priority=data.priority,
            is_active=True,
            is_ai_generated=False
        )
        session.add(keyword)
        created += 1
    
    await session.commit()
    
    return {
        "message": f"成功创建 {created} 个关键词，跳过 {skipped} 个重复",
        "created": created,
        "skipped": skipped
    }


@router.get("/{keyword_id}", response_model=KeywordResponse)
async def get_keyword(
    keyword_id: int,
    session: AsyncSession = Depends(get_async_session)
):
    """获取单个关键词详情"""
    result = await session.execute(
        select(GrowHubKeyword).where(GrowHubKeyword.id == keyword_id)
    )
    keyword = result.scalar()
    
    if not keyword:
        raise HTTPException(status_code=404, detail="关键词不存在")
    
    return KeywordResponse.model_validate(keyword)


@router.put("/{keyword_id}", response_model=KeywordResponse)
async def update_keyword(
    keyword_id: int,
    data: KeywordUpdate,
    session: AsyncSession = Depends(get_async_session)
):
    """更新关键词"""
    result = await session.execute(
        select(GrowHubKeyword).where(GrowHubKeyword.id == keyword_id)
    )
    keyword = result.scalar()
    
    if not keyword:
        raise HTTPException(status_code=404, detail="关键词不存在")
    
    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(keyword, key, value)
    
    keyword.updated_at = datetime.now()
    await session.commit()
    await session.refresh(keyword)
    
    return KeywordResponse.model_validate(keyword)


@router.delete("/{keyword_id}")
async def delete_keyword(
    keyword_id: int,
    session: AsyncSession = Depends(get_async_session)
):
    """删除关键词"""
    result = await session.execute(
        select(GrowHubKeyword).where(GrowHubKeyword.id == keyword_id)
    )
    keyword = result.scalar()
    
    if not keyword:
        raise HTTPException(status_code=404, detail="关键词不存在")
    
    await session.delete(keyword)
    await session.commit()
    
    return {"message": "关键词已删除"}


@router.post("/batch-delete")
async def batch_delete_keywords(
    ids: List[int],
    session: AsyncSession = Depends(get_async_session)
):
    """批量删除关键词"""
    result = await session.execute(
        select(GrowHubKeyword).where(GrowHubKeyword.id.in_(ids))
    )
    keywords = result.scalars().all()
    
    for keyword in keywords:
        await session.delete(keyword)
    
    await session.commit()
    
    return {"message": f"已删除 {len(keywords)} 个关键词"}


@router.get("/stats/summary", response_model=KeywordStatsResponse)
async def get_keyword_stats(
    session: AsyncSession = Depends(get_async_session)
):
    """获取关键词统计"""
    # Total
    total_result = await session.execute(select(func.count(GrowHubKeyword.id)))
    total = total_result.scalar() or 0
    
    # By level
    level_1 = await session.execute(
        select(func.count(GrowHubKeyword.id)).where(GrowHubKeyword.level == 1)
    )
    level_2 = await session.execute(
        select(func.count(GrowHubKeyword.id)).where(GrowHubKeyword.level == 2)
    )
    level_3 = await session.execute(
        select(func.count(GrowHubKeyword.id)).where(GrowHubKeyword.level == 3)
    )
    
    # Active/Inactive
    active_result = await session.execute(
        select(func.count(GrowHubKeyword.id)).where(GrowHubKeyword.is_active == True)
    )
    
    # AI generated
    ai_result = await session.execute(
        select(func.count(GrowHubKeyword.id)).where(GrowHubKeyword.is_ai_generated == True)
    )
    
    active = active_result.scalar() or 0
    ai_generated = ai_result.scalar() or 0
    
    return KeywordStatsResponse(
        total=total,
        by_level={
            "level_1": level_1.scalar() or 0,
            "level_2": level_2.scalar() or 0,
            "level_3": level_3.scalar() or 0
        },
        active=active,
        inactive=total - active,
        ai_generated=ai_generated,
        manual=total - ai_generated
    )


@router.post("/generate")
async def generate_keywords(
    data: KeywordGenerateRequest,
    session: AsyncSession = Depends(get_async_session)
):
    """AI生成衍生关键词"""
    try:
        from api.services.llm_service import chat_completion
        
        prompt = f"""你是一个关键词衍生专家。根据以下种子关键词，生成相关的衍生关键词。

种子关键词: {', '.join(data.seed_keywords)}

请生成以下类型的关键词，每种类型 {data.count_per_type} 个：
{chr(10).join([f'- {t}' for t in data.generate_types])}

类型说明：
- scene: 场景词 (使用场景、应用场景)
- pain_point: 痛点词 (用户痛点、问题)
- emotion: 情绪词 (用户情绪、感受)

请以JSON格式返回，格式如下：
{{
  "scene": ["关键词1", "关键词2", ...],
  "pain_point": ["关键词1", "关键词2", ...],
  "emotion": ["关键词1", "关键词2", ...]
}}

只返回JSON，不要其他说明文字。"""

        response = await chat_completion(prompt)
        
        import json
        # Try to extract JSON from response
        try:
            if "```json" in response:
                response = response.split("```json")[1].split("```")[0]
            elif "```" in response:
                response = response.split("```")[1].split("```")[0]
            generated = json.loads(response.strip())
        except:
            # Fallback: return mock data for demo
            generated = {
                "scene": [f"{data.seed_keywords[0]}使用场景{i}" for i in range(data.count_per_type)],
                "pain_point": [f"{data.seed_keywords[0]}痛点{i}" for i in range(data.count_per_type)],
                "emotion": [f"{data.seed_keywords[0]}情绪{i}" for i in range(data.count_per_type)]
            }
        
        return {"generated_keywords": generated, "seed_keywords": data.seed_keywords}
    
    except ImportError:
        # LLM service not available, return mock data
        return {
            "generated_keywords": {
                "scene": [f"{data.seed_keywords[0]}场景{i+1}" for i in range(data.count_per_type)],
                "pain_point": [f"{data.seed_keywords[0]}痛点{i+1}" for i in range(data.count_per_type)],
                "emotion": [f"{data.seed_keywords[0]}情绪{i+1}" for i in range(data.count_per_type)]
            },
            "seed_keywords": data.seed_keywords,
            "note": "LLM服务未配置，返回模拟数据"
        }


@router.post("/save-generated")
async def save_generated_keywords(
    data: dict,
    session: AsyncSession = Depends(get_async_session)
):
    """保存AI生成的关键词"""
    keywords_dict = data.get("keywords", {})
    created = 0
    skipped = 0
    
    type_to_level = {
        "scene": 2,
        "pain_point": 3,
        "emotion": 3
    }
    
    for keyword_type, keywords in keywords_dict.items():
        level = type_to_level.get(keyword_type, 2)
        
        for kw in keywords:
            kw = kw.strip()
            if not kw:
                continue
            
            # Check duplicate
            existing = await session.execute(
                select(GrowHubKeyword).where(GrowHubKeyword.keyword == kw)
            )
            if existing.scalar():
                skipped += 1
                continue
            
            keyword = GrowHubKeyword(
                keyword=kw,
                level=level,
                keyword_type=keyword_type,
                priority=50,
                is_active=True,
                is_ai_generated=True
            )
            session.add(keyword)
            created += 1
    
    await session.commit()
    
    return {
        "message": f"成功保存 {created} 个AI生成的关键词，跳过 {skipped} 个重复",
        "created": created,
        "skipped": skipped
    }
