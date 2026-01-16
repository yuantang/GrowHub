# -*- coding: utf-8 -*-
"""
GrowHub 热点内容服务 - 内容去重、热度计算与排行
"""

from datetime import datetime, date, timedelta
from typing import Dict, Any, List, Optional
from sqlalchemy import select, update, and_, func, desc

from database.db_session import get_session
from database.growhub_models import GrowHubHotspot, GrowHubContent
from tools import utils


class HotspotService:
    """热点内容池管理服务"""

    # 热度分计算权重
    HEAT_WEIGHTS = {
        'likes': 1,
        'comments': 2,
        'shares': 3,
        'views': 0.01  # 播放量权重较低
    }

    def calculate_heat_score(
        self,
        likes: int = 0,
        comments: int = 0,
        shares: int = 0,
        views: int = 0
    ) -> int:
        """计算热度分"""
        score = (
            (likes or 0) * self.HEAT_WEIGHTS['likes'] +
            (comments or 0) * self.HEAT_WEIGHTS['comments'] +
            (shares or 0) * self.HEAT_WEIGHTS['shares'] +
            (views or 0) * self.HEAT_WEIGHTS['views']
        )
        return int(score)

    async def upsert_hotspot(
        self,
        content: GrowHubContent,
        source_project_id: Optional[int] = None,
        source_keyword: Optional[str] = None
    ) -> Optional[GrowHubHotspot]:
        """
        插入或更新热点内容
        - 按 content_id / platform_content_id 去重
        - 热度分更高时才更新
        """
        if not content or not content.id:
            return None
        
        async with get_session() as session:
            # 查找是否已存在
            result = await session.execute(
                select(GrowHubHotspot).where(GrowHubHotspot.content_id == content.id)
            )
            existing = result.scalar()
            
            # 计算当前热度分
            heat_score = self.calculate_heat_score(
                likes=content.like_count or 0,
                comments=content.comment_count or 0,
                shares=content.share_count or 0,
                views=content.view_count or 0
            )
            
            now = datetime.now()
            today = now.date()
            
            if existing:
                # 只有热度分更高时才更新
                if heat_score > (existing.heat_score or 0):
                    existing.heat_score = heat_score
                    existing.like_count = content.like_count or 0
                    existing.comment_count = content.comment_count or 0
                    existing.share_count = content.share_count or 0
                    existing.view_count = content.view_count or 0
                    existing.rank_date = today
                    await session.commit()
                    utils.logger.info(f"[HotspotService] 更新热点: {content.platform_content_id}, 热度: {heat_score}")
                return existing
            else:
                # 新建记录
                hotspot = GrowHubHotspot(
                    content_id=content.id,
                    platform_content_id=content.platform_content_id,
                    platform=content.platform,
                    title=content.title,
                    author_name=content.author_name,
                    cover_url=content.cover_url,
                    content_url=content.content_url,
                    heat_score=heat_score,
                    like_count=content.like_count or 0,
                    comment_count=content.comment_count or 0,
                    share_count=content.share_count or 0,
                    view_count=content.view_count or 0,
                    rank_date=today,
                    source_project_id=source_project_id or content.project_id,
                    source_keyword=source_keyword or content.source_keyword,
                    publish_time=content.publish_time,
                    entered_at=now
                )
                session.add(hotspot)
                await session.commit()
                await session.refresh(hotspot)
                utils.logger.info(f"[HotspotService] 新增热点: {content.platform_content_id}, 热度: {heat_score}")
                return hotspot

    async def list_hotspots(
        self,
        platform: Optional[str] = None,
        source_project_id: Optional[int] = None,
        source_keyword: Optional[str] = None,
        rank_date: Optional[date] = None,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        min_heat: Optional[int] = None,
        sort_by: str = 'heat_score',
        sort_order: str = 'desc',
        page: int = 1,
        page_size: int = 20
    ) -> Dict[str, Any]:
        """获取热点列表"""
        async with get_session() as session:
            # Join with Content
            query = select(GrowHubHotspot, GrowHubContent).join(
                GrowHubContent, GrowHubHotspot.content_id == GrowHubContent.id
            )
            count_query = select(func.count(GrowHubHotspot.id))
            
            # 应用过滤条件
            if platform:
                query = query.where(GrowHubHotspot.platform == platform)
                count_query = count_query.where(GrowHubHotspot.platform == platform)
            
            if source_project_id:
                query = query.where(GrowHubHotspot.source_project_id == source_project_id)
                count_query = count_query.where(GrowHubHotspot.source_project_id == source_project_id)
            
            if source_keyword:
                query = query.where(GrowHubHotspot.source_keyword.ilike(f"%{source_keyword}%"))
                count_query = count_query.where(GrowHubHotspot.source_keyword.ilike(f"%{source_keyword}%"))
            
            if rank_date:
                query = query.where(func.date(GrowHubHotspot.rank_date) == rank_date)
                count_query = count_query.where(func.date(GrowHubHotspot.rank_date) == rank_date)
            
            if start_date:
                query = query.where(GrowHubHotspot.publish_time >= datetime.combine(start_date, datetime.min.time()))
                count_query = count_query.where(GrowHubHotspot.publish_time >= datetime.combine(start_date, datetime.min.time()))
            
            if end_date:
                query = query.where(GrowHubHotspot.publish_time <= datetime.combine(end_date, datetime.max.time()))
                count_query = count_query.where(GrowHubHotspot.publish_time <= datetime.combine(end_date, datetime.max.time()))
            
            if min_heat is not None:
                query = query.where(GrowHubHotspot.heat_score >= min_heat)
                count_query = count_query.where(GrowHubHotspot.heat_score >= min_heat)
            
            # 获取总数
            total_result = await session.execute(count_query)
            total = total_result.scalar()
            
            # 排序
            # Use getattr on model directly.
            # Support sorting by additional fields
            if sort_by in ['publish_time', 'entered_at']:
                 sort_column = getattr(GrowHubHotspot, sort_by)
            elif sort_by in ['view_count', 'share_count', 'like_count', 'comment_count']:
                 sort_column = getattr(GrowHubHotspot, sort_by)
            else:
                 sort_column = getattr(GrowHubHotspot, sort_by, GrowHubHotspot.heat_score)
            
            if sort_order == 'desc':
                query = query.order_by(sort_column.desc())
            else:
                query = query.order_by(sort_column)
            
            # 分页
            query = query.offset((page - 1) * page_size).limit(page_size)
            
            result = await session.execute(query)
            rows = result.all()
            
            items = []
            for idx, (hotspot, content) in enumerate(rows):
                item = self._hotspot_to_dict(hotspot, idx + 1 + (page - 1) * page_size)
                # Inject content fields
                if content:
                    item['video_url'] = content.video_url
                    item['author_id'] = content.author_id
                    item['author_avatar'] = content.author_avatar
                    if (hotspot.platform == 'douyin' or hotspot.platform == 'dy') and content.author_id:
                        item['author_url'] = f"https://www.douyin.com/user/{content.author_id}"
                items.append(item)
            
            return {
                "total": total,
                "items": items
            }

    async def get_daily_ranking(
        self,
        rank_date: Optional[date] = None,
        platform: Optional[str] = None,
        limit: int = 50
    ) -> List[Dict[str, Any]]:
        """获取日榜排行"""
        if rank_date is None:
            rank_date = date.today()
        
        async with get_session() as session:
            # Join with Content to get extra fields
            query = select(GrowHubHotspot, GrowHubContent).join(
                GrowHubContent, GrowHubHotspot.content_id == GrowHubContent.id
            ).where(
                func.date(GrowHubHotspot.rank_date) == rank_date
            )
            
            if platform:
                query = query.where(GrowHubHotspot.platform == platform)
            
            query = query.order_by(desc(GrowHubHotspot.heat_score)).limit(limit)
            
            result = await session.execute(query)
            rows = result.all()
            
            items = []
            for idx, (hotspot, content) in enumerate(rows):
                item = self._hotspot_to_dict(hotspot, idx + 1)
                # Inject content fields
                if content:
                    item['video_url'] = content.video_url
                    item['author_id'] = content.author_id
                    item['author_avatar'] = content.author_avatar
                    if (hotspot.platform == 'douyin' or hotspot.platform == 'dy') and content.author_id:
                        item['author_url'] = f"https://www.douyin.com/user/{content.author_id}"
                items.append(item)
                
            return items

    async def get_stats(self, source_project_id: Optional[int] = None) -> Dict[str, Any]:
        """获取热点统计数据"""
        async with get_session() as session:
            base_filter = []
            if source_project_id:
                base_filter.append(GrowHubHotspot.source_project_id == source_project_id)
            
            # 总数
            total_query = select(func.count(GrowHubHotspot.id))
            if base_filter:
                total_query = total_query.where(and_(*base_filter))
            total_result = await session.execute(total_query)
            total = total_result.scalar() or 0
            
            # 今日新增
            today = date.today()
            today_query = select(func.count(GrowHubHotspot.id)).where(
                func.date(GrowHubHotspot.entered_at) == today
            )
            if base_filter:
                today_query = today_query.where(and_(*base_filter))
            today_result = await session.execute(today_query)
            today_count = today_result.scalar() or 0
            
            # 按平台分组
            platform_query = select(
                GrowHubHotspot.platform,
                func.count(GrowHubHotspot.id)
            ).group_by(GrowHubHotspot.platform)
            if base_filter:
                platform_query = platform_query.where(and_(*base_filter))
            platform_result = await session.execute(platform_query)
            platform_counts = {row[0]: row[1] for row in platform_result}
            
            # 平均热度
            avg_query = select(func.avg(GrowHubHotspot.heat_score))
            if base_filter:
                avg_query = avg_query.where(and_(*base_filter))
            avg_result = await session.execute(avg_query)
            avg_heat = avg_result.scalar() or 0
            
            return {
                "total": total,
                "today_count": today_count,
                "by_platform": platform_counts,
                "avg_heat_score": int(avg_heat)
            }

    def _hotspot_to_dict(self, hotspot: GrowHubHotspot, rank: int = 0) -> Dict[str, Any]:
        """将热点模型转换为字典"""
        return {
            "id": hotspot.id,
            "rank": rank,
            "content_id": hotspot.content_id,
            "platform_content_id": hotspot.platform_content_id,
            "platform": hotspot.platform,
            "title": hotspot.title,
            "author_name": hotspot.author_name,
            "cover_url": hotspot.cover_url,
            "content_url": hotspot.content_url,
            "heat_score": hotspot.heat_score or 0,
            "like_count": hotspot.like_count or 0,
            "comment_count": hotspot.comment_count or 0,
            "share_count": hotspot.share_count or 0,
            "view_count": hotspot.view_count or 0,
            "rank_date": hotspot.rank_date.isoformat() if hotspot.rank_date else None,
            "source_project_id": hotspot.source_project_id,
            "source_keyword": hotspot.source_keyword,
            "publish_time": hotspot.publish_time.isoformat() if hotspot.publish_time else None,
            "entered_at": hotspot.entered_at.isoformat() if hotspot.entered_at else None
        }


# 全局单例
_hotspot_service: Optional[HotspotService] = None


def get_hotspot_service() -> HotspotService:
    global _hotspot_service
    if _hotspot_service is None:
        _hotspot_service = HotspotService()
    return _hotspot_service
