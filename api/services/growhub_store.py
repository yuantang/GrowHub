# -*- coding: utf-8 -*-
# GrowHub 数据同步服务
# 将各平台抓取的原始数据映射并同步到 GrowHubContent 统一表中

import json
from datetime import datetime, timezone
import re
from typing import Dict, Any, List, Optional
from sqlalchemy import select, update, and_
from database.db_session import get_session
from database.growhub_models import GrowHubContent, SentimentType
from tools import utils

class GrowHubStoreService:
    """GrowHub 统一存储服务"""

    def __init__(self):
        # 简单的负面关键词列表（可以后续扩展为配置或AI接口）
        self.negative_keywords = ["差评", "太烂", "垃圾", "投诉", "避雷", "失望", "骗子", "不要买", "后悔", "坑"]
        self.positive_keywords = ["好评", "推荐", "安利", "不错", "喜欢", "赞", "优秀", "完美", "神器"]

    async def sync_to_growhub(self, platform: str, raw_data: Dict[str, Any]):
        """
        将各平台原始数据同步到 GrowHubContent
        :param platform: 平台标识 (xhs/dy/wb/bili/ks/tieba/zhihu)
        :param raw_data: 对应平台的 local_db_item
        """
        # 0. 规范化平台标识 (统一使用短名称)
        platform_map = {
            "douyin": "dy",
            "bilibili": "bili",
            "weibo": "wb",
            "xiaohongshu": "xhs",
            "kuaishou": "ks"
        }
        platform = platform_map.get(platform, platform)

        try:
            # 1. 字段映射
            content_id = self._get_platform_content_id(platform, raw_data)
            if not content_id:
                return

            async with get_session() as session:
                # 检查是否已存在
                stmt = select(GrowHubContent).where(
                    and_(
                        GrowHubContent.platform == platform,
                        GrowHubContent.platform_content_id == content_id
                    )
                )
                result = await session.execute(stmt)
                existing_content = result.scalar_one_or_none()

                # 处理时间属性
                publish_time = self._parse_publish_time(platform, raw_data)
                
                # 情感分析 (简单实现)
                text_content = f"{raw_data.get('title', '')} {raw_data.get('desc', '')} {raw_data.get('content', '')}"
                sentiment, sentiment_score = self._simple_sentiment_analysis(text_content)

                # 提取图片列表
                media_urls = self._parse_media_urls(platform, raw_data)

                # 提取统计数据
                likes = self._safe_int(raw_data.get("liked_count"))
                comments = self._safe_int(raw_data.get("comment_count"))
                shares = self._safe_int(raw_data.get("share_count"))
                collects = self._safe_int(raw_data.get("collected_count"))
                views = self._safe_int(raw_data.get("view_count")) # specific for Bili
                
                # 提取作者统计数据
                author_fans = self._safe_int(raw_data.get("user_fans") or raw_data.get("fans_count"))
                author_follows = self._safe_int(raw_data.get("user_follows") or raw_data.get("follows_count"))
                author_likes = self._safe_int(raw_data.get("user_likes") or raw_data.get("total_favorited"))
                
                # 提取视频URL (可播放)
                video_url = (
                    raw_data.get("video_url") or 
                    raw_data.get("video_download_url") or 
                    raw_data.get("video_play_url")
                )
                # 排除页面链接和非视频文件链接
                if video_url:
                    video_url_lower = video_url.lower()
                    if (("bilibili.com" in video_url_lower or "weibo.cn" in video_url_lower) and not video_url_lower.endswith(".mp4")) or \
                       (video_url_lower.endswith(".mp3") or video_url_lower.endswith(".m4a")):
                        video_url = None
                
                # 提取IP归属地
                ip_location = raw_data.get("ip_location")

                # 提取作者 ID (抖音优先使用 sec_uid 用于主页跳转)
                author_id = str(raw_data.get("sec_uid") or raw_data.get("user_id") or "")
                
                # 构造/更新数据
                content_data = {
                    "platform": platform,
                    "platform_content_id": content_id,
                    "content_type": raw_data.get("type", "text"),
                    "title": raw_data.get("title"),
                    "description": raw_data.get("desc") or raw_data.get("content"),
                    "content_url": raw_data.get("note_url") or raw_data.get("url") or raw_data.get("aweme_url"),
                    "cover_url": media_urls[0] if media_urls else raw_data.get("cover_url") or raw_data.get("video_cover"),
                    "video_url": video_url,  # 可播放的视频URL
                    "media_urls": media_urls,
                    "author_id": author_id,
                    "author_name": raw_data.get("nickname") or raw_data.get("author_name"),
                    "author_avatar": raw_data.get("avatar") or raw_data.get("user_avatar"),
                    "author_contact": self._extract_contact_info(text_content),
                    "author_fans_count": author_fans,
                    "author_follows_count": author_follows,
                    "author_likes_count": author_likes,
                    "ip_location": ip_location,
                    "view_count": views,
                    "like_count": likes,
                    "comment_count": comments,
                    "share_count": shares,
                    "collect_count": collects,
                    "sentiment": sentiment,
                    "sentiment_score": sentiment_score,
                    "source_keyword": raw_data.get("source_keyword"),
                    "project_id": raw_data.get("project_id"),  # 关联的项目 ID
                    "publish_time": publish_time,
                    "crawl_time": datetime.now(timezone.utc).replace(tzinfo=None),
                    "updated_at": datetime.now(timezone.utc).replace(tzinfo=None)
                }

                if existing_content:
                    # 更新
                    for key, value in content_data.items():
                        setattr(existing_content, key, value)
                else:
                    # 新增
                    content_data["created_at"] = datetime.now(timezone.utc).replace(tzinfo=None)
                    new_content = GrowHubContent(**content_data)
                    session.add(new_content)

                await session.commit()
                # print(f"[GrowHubStore] Synced {platform} content {content_id}")

        except Exception as e:
            print(f"[GrowHubStore] Sync failed for {platform}: {e}")

    def _safe_int(self, value: Any) -> int:
        if not value:
            return 0
        if isinstance(value, int):
            return value
        if isinstance(value, float):
            return int(value)
        if isinstance(value, str):
            value = value.strip()
            if value.isdigit():
                return int(value)
            # Handle "1.2w" or "1000+"
            if "w" in value.lower() or "万" in value:
                try:
                    return int(float(value.replace("w", "").replace("万", "")) * 10000)
                except:
                    pass
            if "+" in value:
                 try:
                    return int(value.replace("+", ""))
                 except:
                    pass
        return 0

    def _get_platform_content_id(self, platform: str, data: Dict) -> Optional[str]:
        if platform in ["xhs", "xiaohongshu"]:
            return data.get("note_id")
        elif platform in ["dy", "douyin"]:
            return data.get("aweme_id")
        elif platform in ["wb", "weibo"]:
            return data.get("note_id")
        elif platform in ["bili", "bilibili"]:
            return data.get("video_id")
        elif platform == "zhihu":
            return data.get("content_id")
        elif platform == "tieba":
            return data.get("note_id")
        elif platform in ["ks", "kuaishou"]:
            return data.get("photo_id")
        return data.get("id")

    def _parse_publish_time(self, platform: str, data: Dict) -> Optional[datetime]:
        ts = data.get("time") or data.get("create_time") or data.get("publish_time")
        if not ts:
            return None
        
        try:
            if isinstance(ts, (int, float)):
                # 如果是毫秒级时间戳
                if ts > 10**11:
                    ts = ts / 1000
                return datetime.fromtimestamp(ts, tz=timezone.utc).replace(tzinfo=None) # Store as naive UTC
            elif isinstance(ts, str):
                # 尝试解析 ISO 格式或其他
                return datetime.fromisoformat(ts.replace('Z', '+00:00'))
        except:
            pass
        return None

    def _parse_media_urls(self, platform: str, data: Dict) -> List[str]:
        urls_str = data.get("image_list") or data.get("media_urls") or ""
        if not urls_str:
            return []
        
        if isinstance(urls_str, list):
            return urls_str
        
        if isinstance(urls_str, str):
            if urls_str.startswith("["):
                try:
                    return json.loads(urls_str)
                except:
                    pass
            return [url.strip() for url in urls_str.split(",") if url.strip()]
        
        return []

    def _simple_sentiment_analysis(self, text: str) -> (str, float):
        """极其简单的关键词情感分析"""
        if not text:
            return "neutral", 0.0
        
        score = 0.0
        neg_count = 0
        pos_count = 0
        
        for word in self.negative_keywords:
            if word in text:
                neg_count += 1
                score -= 0.2
        
        for word in self.positive_keywords:
            if word in text:
                pos_count += 1
                score += 0.1
        
        score = max(-1.0, min(1.0, score))
        
        if score < 0:
            return "negative", score
        elif score > 0.2:
            return "positive", score
        else:
            return "neutral", score

    def _extract_contact_info(self, text: str) -> Optional[str]:
        """从文本中提取联系方式 (手机/微信)"""
        if not text:
            return None
        
        # 1. 尝试提取手机号
        # patterns: 11 digit number preceded by keywords
        phone_pattern = r"(?:Tel|Call|电话|手机|联系方式|合作)\s*[:：.\-]?\s*(1[3-9]\d{9})"
        phone_match = re.search(phone_pattern, text, re.IGNORECASE)
        if phone_match:
            return f"手机: {phone_match.group(1)}"
            
        # 2. 尝试提取微信号 (WeChat)
        # patterns: vx, wx, wechat, 微信 followed by id
        wx_pattern = r"(?:vx|v|wx|wechat|微信|薇|合作)\s*[:：.\-]?\s*([a-zA-Z0-9_\-]{6,20})"
        wx_match = re.search(wx_pattern, text, re.IGNORECASE)
        if wx_match:
            val = wx_match.group(1)
            # 过滤纯数字且长度小于11的可能是误判? 微信号可以是纯数字吗? 可以, QQ号转的. 
            # 但 usually 6+ chars.
            if not (val.isdigit() and len(val) < 6):
                return f"VX: {val}"
                
        return None

# 全局实例
growhub_store_service = GrowHubStoreService()

def get_growhub_store_service():
    return growhub_store_service
