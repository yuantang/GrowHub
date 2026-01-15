# -*- coding: utf-8 -*-
"""
GrowHub 达人博主服务 - 博主去重、信息聚合与更新
"""

from datetime import datetime
from typing import Dict, Any, List, Optional
from sqlalchemy import select, update, and_, func
from sqlalchemy.dialects.sqlite import insert as sqlite_insert

from database.db_session import get_session
from database.growhub_models import GrowHubCreator, GrowHubContent
from tools import utils


class CreatorService:
    """达人博主池管理服务"""

    async def upsert_creator(
        self,
        platform: str,
        author_id: str,
        data: Dict[str, Any],
        source_project_id: Optional[int] = None,
        source_keyword: Optional[str] = None,
        content_id: Optional[int] = None
    ) -> GrowHubCreator:
        """
        插入或更新博主信息
        - 如存在 (platform, author_id) 记录，则更新粉丝数等指标
        - 如不存在，则新建记录
        """
        async with get_session() as session:
            # 查找是否已存在
            result = await session.execute(
                select(GrowHubCreator).where(
                    and_(
                        GrowHubCreator.platform == platform,
                        GrowHubCreator.author_id == author_id
                    )
                )
            )
            existing = result.scalar()
            
            now = datetime.now()
            
            if existing:
                # 更新逻辑：只更新更大的粉丝数（防止数据回退）
                new_fans = data.get('fans_count', 0) or 0
                if new_fans > (existing.fans_count or 0):
                    existing.fans_count = new_fans
                
                new_likes = data.get('likes_count', 0) or 0
                if new_likes > (existing.likes_count or 0):
                    existing.likes_count = new_likes
                
                # 其他字段直接更新
                if data.get('author_name'):
                    existing.author_name = data['author_name']
                if data.get('author_avatar'):
                    existing.author_avatar = data['author_avatar']
                if data.get('author_url'):
                    existing.author_url = data['author_url']
                if data.get('signature'):
                    existing.signature = data['signature']
                if data.get('contact_info'):
                    existing.contact_info = data['contact_info']
                if data.get('ip_location'):
                    existing.ip_location = data['ip_location']
                if data.get('follows_count'):
                    existing.follows_count = data['follows_count']
                if data.get('works_count'):
                    existing.works_count = data['works_count']
                
                # 更新内容计数和平均值
                existing.content_count = (existing.content_count or 0) + 1
                if content_id:
                    existing.latest_content_id = content_id
                
                existing.last_updated_at = now
                
                await session.commit()
                utils.logger.info(f"[CreatorService] 更新博主: {platform}/{author_id}, 粉丝: {existing.fans_count}")
                return existing
            else:
                # 新建记录
                creator = GrowHubCreator(
                    platform=platform,
                    author_id=author_id,
                    author_name=data.get('author_name'),
                    author_avatar=data.get('author_avatar'),
                    author_url=data.get('author_url'),
                    signature=data.get('signature'),
                    fans_count=data.get('fans_count', 0) or 0,
                    follows_count=data.get('follows_count', 0) or 0,
                    likes_count=data.get('likes_count', 0) or 0,
                    works_count=data.get('works_count', 0) or 0,
                    contact_info=data.get('contact_info'),
                    ip_location=data.get('ip_location'),
                    content_count=1,
                    status='new',
                    source_project_id=source_project_id,
                    source_keyword=source_keyword,
                    latest_content_id=content_id,
                    first_seen_at=now,
                    last_updated_at=now
                )
                session.add(creator)
                await session.commit()
                await session.refresh(creator)
                utils.logger.info(f"[CreatorService] 新增博主: {platform}/{author_id}, 粉丝: {creator.fans_count}")
                return creator

    async def get_creator(self, platform: str, author_id: str) -> Optional[GrowHubCreator]:
        """根据平台和作者ID获取博主"""
        async with get_session() as session:
            result = await session.execute(
                select(GrowHubCreator).where(
                    and_(
                        GrowHubCreator.platform == platform,
                        GrowHubCreator.author_id == author_id
                    )
                )
            )
            return result.scalar()

    async def list_creators(
        self,
        platform: Optional[str] = None,
        source_project_id: Optional[int] = None,
        status: Optional[str] = None,
        min_fans: Optional[int] = None,
        max_fans: Optional[int] = None,
        source_keyword: Optional[str] = None,
        sort_by: str = 'fans_count',
        sort_order: str = 'desc',
        page: int = 1,
        page_size: int = 20
    ) -> Dict[str, Any]:
        """获取博主列表"""
        async with get_session() as session:
            query = select(GrowHubCreator)
            count_query = select(func.count(GrowHubCreator.id))
            
            # 应用过滤条件
            if platform:
                query = query.where(GrowHubCreator.platform == platform)
                count_query = count_query.where(GrowHubCreator.platform == platform)
            
            if source_project_id:
                query = query.where(GrowHubCreator.source_project_id == source_project_id)
                count_query = count_query.where(GrowHubCreator.source_project_id == source_project_id)
            
            if status:
                query = query.where(GrowHubCreator.status == status)
                count_query = count_query.where(GrowHubCreator.status == status)
            
            if min_fans is not None:
                query = query.where(GrowHubCreator.fans_count >= min_fans)
                count_query = count_query.where(GrowHubCreator.fans_count >= min_fans)
            
            if max_fans is not None and max_fans > 0:
                query = query.where(GrowHubCreator.fans_count <= max_fans)
                count_query = count_query.where(GrowHubCreator.fans_count <= max_fans)
            
            if source_keyword:
                query = query.where(GrowHubCreator.source_keyword.ilike(f"%{source_keyword}%"))
                count_query = count_query.where(GrowHubCreator.source_keyword.ilike(f"%{source_keyword}%"))
            
            # 获取总数
            total_result = await session.execute(count_query)
            total = total_result.scalar()
            
            # 排序
            sort_column = getattr(GrowHubCreator, sort_by, GrowHubCreator.fans_count)
            if sort_order == 'desc':
                query = query.order_by(sort_column.desc())
            else:
                query = query.order_by(sort_column)
            
            # 分页
            query = query.offset((page - 1) * page_size).limit(page_size)
            
            result = await session.execute(query)
            creators = result.scalars().all()
            
            return {
                "total": total,
                "items": [self._creator_to_dict(c) for c in creators]
            }

    async def update_creator_status(
        self,
        creator_id: int,
        status: str,
        notes: Optional[str] = None
    ) -> bool:
        """更新博主业务状态"""
        async with get_session() as session:
            result = await session.execute(
                select(GrowHubCreator).where(GrowHubCreator.id == creator_id)
            )
            creator = result.scalar()
            if not creator:
                return False
            
            creator.status = status
            if notes:
                creator.notes = notes
            creator.last_updated_at = datetime.now()
            
            await session.commit()
            return True

    async def get_stats(self, source_project_id: Optional[int] = None) -> Dict[str, Any]:
        """获取博主统计数据"""
        async with get_session() as session:
            base_query = select(GrowHubCreator)
            if source_project_id:
                base_query = base_query.where(GrowHubCreator.source_project_id == source_project_id)
            
            # 总数
            total_result = await session.execute(
                select(func.count(GrowHubCreator.id)).select_from(
                    base_query.subquery()
                )
            )
            total = total_result.scalar() or 0
            
            # 按状态分组
            status_query = select(
                GrowHubCreator.status,
                func.count(GrowHubCreator.id)
            ).group_by(GrowHubCreator.status)
            if source_project_id:
                status_query = status_query.where(GrowHubCreator.source_project_id == source_project_id)
            
            status_result = await session.execute(status_query)
            status_counts = {row[0]: row[1] for row in status_result}
            
            # 按平台分组
            platform_query = select(
                GrowHubCreator.platform,
                func.count(GrowHubCreator.id)
            ).group_by(GrowHubCreator.platform)
            if source_project_id:
                platform_query = platform_query.where(GrowHubCreator.source_project_id == source_project_id)
            
            platform_result = await session.execute(platform_query)
            platform_counts = {row[0]: row[1] for row in platform_result}
            
            return {
                "total": total,
                "by_status": status_counts,
                "by_platform": platform_counts
            }

    def _creator_to_dict(self, creator: GrowHubCreator) -> Dict[str, Any]:
        """将博主模型转换为字典"""
        return {
            "id": creator.id,
            "platform": creator.platform,
            "author_id": creator.author_id,
            "author_name": creator.author_name,
            "author_avatar": creator.author_avatar,
            "author_url": creator.author_url,
            "signature": creator.signature,
            "fans_count": creator.fans_count or 0,
            "follows_count": creator.follows_count or 0,
            "likes_count": creator.likes_count or 0,
            "works_count": creator.works_count or 0,
            "contact_info": creator.contact_info,
            "ip_location": creator.ip_location,
            "avg_likes": creator.avg_likes or 0,
            "avg_comments": creator.avg_comments or 0,
            "content_count": creator.content_count or 0,
            "status": creator.status,
            "notes": creator.notes,
            "source_project_id": creator.source_project_id,
            "source_keyword": creator.source_keyword,
            "first_seen_at": creator.first_seen_at.isoformat() if creator.first_seen_at else None,
            "last_updated_at": creator.last_updated_at.isoformat() if creator.last_updated_at else None,
            "created_at": creator.created_at.isoformat() if creator.created_at else None
        }


# 全局单例
_creator_service: Optional[CreatorService] = None


def get_creator_service() -> CreatorService:
    global _creator_service
    if _creator_service is None:
        _creator_service = CreatorService()
    return _creator_service
