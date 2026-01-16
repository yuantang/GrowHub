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
from var import min_fans_var, max_fans_var, require_contact_var, sentiment_keywords_var, purpose_var

class GrowHubStoreService:
    """GrowHub 统一存储服务"""

    def __init__(self):
        self.negative_keywords = [
            "差评", "太烂", "垃圾", "投诉", "避雷", "失望", "骗子", "不要买", "后悔", "坑", 
            "退款", "维权", "曝光", "上当", "受骗", "虚假", "恶心", "差劲", "别买", "避坑"
        ]
        self.positive_keywords = ["好评", "推荐", "安利", "不错", "喜欢", "赞", "优秀", "完美", "神器"]

    async def sync_to_growhub(
        self, 
        platform: str, 
        raw_data: Dict[str, Any],
        min_fans: int = None,
        max_fans: int = None,
        require_contact: bool = None,
        sentiment_keywords: List[str] = None,
        purpose: str = None  # creator/hotspot/sentiment/general
    ):
        """
        将各平台原始数据同步到 GrowHubContent
        :param platform: 平台标识 (xhs/dy/wb/bili/ks/tieba/zhihu)
        :param raw_data: 对应平台的 local_db_item
        :param min_fans: 博主最小粉丝数筛选 (None=从 ContextVar 读取)
        :param max_fans: 博主最大粉丝数筛选 (None=从 ContextVar 读取, 0=不限)
        :param require_contact: 是否要求有联系方式 (None=从 ContextVar 读取)
        :param sentiment_keywords: 舆情敏感词列表 (None=从 ContextVar 读取)
        :param purpose: 任务目的 (None=从 ContextVar 读取)
        """
        # 从 ContextVar 读取默认值 (如果参数未传)
        if min_fans is None:
            min_fans = min_fans_var.get()
        if max_fans is None:
            max_fans = max_fans_var.get()
        if require_contact is None:
            require_contact = require_contact_var.get()
        if sentiment_keywords is None:
            sentiment_keywords = sentiment_keywords_var.get()
        if purpose is None:
            purpose = purpose_var.get() or 'general'
        
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
            
            # 3. 提取文本内容 (用于后续检测)
            source_keyword = raw_data.get('source_keyword', '')
            text_content = f"{raw_data.get('title', '')} {raw_data.get('desc', '')} {raw_data.get('content', '')} {source_keyword}"
            
            # =============== 智能分流策略开始 ===============
            
            # A. 舆情分析 (优先执行，不仅为了入库字段，也为了判断是否"豁免"过滤)
            # 简单情感分析
            sentiment, sentiment_score = self._simple_sentiment_analysis(text_content, sentiment_keywords)
            
            # 敏感词检测
            is_alert = False
            alert_level = None
            matched_keywords = []
            
            # 合并系统默认敏感词和项目配置的敏感词
            all_sentiment_keywords = list(self.negative_keywords)
            if sentiment_keywords:
                all_sentiment_keywords.extend(sentiment_keywords)
            
            for keyword in all_sentiment_keywords:
                if keyword and keyword.strip().lower() in text_content.lower():
                    is_alert = True
                    matched_keywords.append(keyword.strip())
            
            # 根据匹配数量和情感分析确定预警等级
            if is_alert:
                if len(matched_keywords) >= 3 or sentiment == SentimentType.NEGATIVE.value:
                    alert_level = "high"
                elif len(matched_keywords) >= 2:
                    alert_level = "medium"
                else:
                    alert_level = "low"
                # Log moved to after decision to save or not, or just ensure we log if saved.
            
            # B. 过滤器检查 (Filters)
            should_save = True
            filter_reason = ""

            # 提取关键指标
            author_fans = self._safe_int(raw_data.get("user_fans") or raw_data.get("fans_count"))
            contact_info = self._extract_contact_info(text_content)
            
            # 策略：如果触发预警 (is_alert)，则【无视】粉丝数和联系方式限制 (强制保留)
            # 否则，必须满足项目设定的门槛
            if not is_alert:
                # 粉丝数过滤
                if min_fans is not None and min_fans > 0 and author_fans < min_fans:
                    should_save = False
                    filter_reason = f"粉丝数不足 ({author_fans} < {min_fans})"
                
                elif max_fans is not None and max_fans > 0 and author_fans > max_fans:
                    should_save = False
                    filter_reason = f"粉丝数超标 ({author_fans} > {max_fans})"
                
                # 联系方式过滤
                elif require_contact and not contact_info:
                    should_save = False
                    filter_reason = "无联系方式"
            else:
                if (min_fans and author_fans < min_fans) or (require_contact and not contact_info):
                    utils.logger.info(f"[GrowHubStore] 触发预警豁免机制: 内容 {content_id} 粉丝/联系方式不达标但包含敏感词/负面，强制保留。")
            
            if not should_save:
                utils.logger.debug(f"[GrowHubStore] 跳过内容 {content_id}: {filter_reason}")
                return

            # =============== 智能分流策略结束 (开始入库准备) ===============
                
            # =============== 入库操作 ===============

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
                
                # 提取图片列表
                media_urls = self._parse_media_urls(platform, raw_data)

                # 提取统计数据
                likes = self._safe_int(raw_data.get("liked_count"))
                comments = self._safe_int(raw_data.get("comment_count"))
                shares = self._safe_int(raw_data.get("share_count"))
                collects = self._safe_int(raw_data.get("collected_count"))
                views = self._safe_int(raw_data.get("view_count")) # specific for Bili
                
                # 提取作者统计数据 (Re-extract or reuse var, reusing for clarity in new block structure)
                # author_fans has been extracted above
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
                
                # 提取作者账号（抖音号/快手号等）
                author_unique_id = raw_data.get("user_unique_id") or raw_data.get("unique_id") or ""

                # 提取作者 ID
                author_id = str(raw_data.get("sec_uid") or raw_data.get("user_id") or "")

                # 记录日志
                if is_alert:
                     utils.logger.info(f"[GrowHubStore] 舆情预警: {content_id}, 匹配词: {matched_keywords}, 等级: {alert_level}")

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
                    "author_contact": contact_info,  # 使用前面提取的 contact_info
                    "author_fans_count": author_fans,
                    "author_follows_count": author_follows,
                    "author_likes_count": author_likes,
                    "ip_location": ip_location,
                    "author_unique_id": author_unique_id,
                    "view_count": views,
                    "like_count": likes,
                    "comment_count": comments,
                    "share_count": shares,
                    "collect_count": collects,
                    "sentiment": sentiment,
                    "sentiment_score": sentiment_score,
                    "is_alert": is_alert,
                    "alert_level": alert_level,
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
                
                # 获取入库后的内容对象 (用于分流)
                saved_content = existing_content if existing_content else new_content
                await session.refresh(saved_content)
                
                # =============== 根据任务目的进行数据分流 ===============
                await self._route_by_purpose(
                    purpose=purpose,
                    content=saved_content,
                    raw_data=raw_data,
                    platform=platform,
                    source_project_id=raw_data.get("project_id"),
                    source_keyword=raw_data.get("source_keyword")
                )
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

    def _simple_sentiment_analysis(self, text: str, custom_keywords: List[str] = None) -> (str, float):
        """极其简单的关键词情感分析"""
        if not text:
            return "neutral", 0.0
        
        score = 0.0
        neg_count = 0
        pos_count = 0
        
        # 合并系统和自定义负面词
        all_neg = list(self.negative_keywords)
        if custom_keywords:
            all_neg.extend([k.strip() for k in custom_keywords if k.strip()])
        
        for word in all_neg:
            if word and word.lower() in text.lower():
                neg_count += 1
                score -= 0.2
        
        for word in self.positive_keywords:
            if word and word.lower() in text.lower():
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

    async def _route_by_purpose(
        self,
        purpose: str,
        content: GrowHubContent,
        raw_data: Dict[str, Any],
        platform: str,
        source_project_id: Optional[int] = None,
        source_keyword: Optional[str] = None
    ):
        """
        根据任务目的进行数据分流
        - creator: 写入达人博主池 (按博主去重)
        - hotspot: 写入热点内容池 (按内容去重)
        - sentiment: 确保舆情标记 (已在主流程处理)
        - general: 仅写入全量数据池 (不额外分流)
        """
        try:
            if purpose == 'creator':
                # 达人博主分流：提取博主信息并 UPSERT
                from api.services.creator_service import get_creator_service
                creator_service = get_creator_service()
                
                author_id = str(raw_data.get("sec_uid") or raw_data.get("user_id") or content.author_id or "")
                if author_id:
                    author_data = {
                        'author_name': content.author_name,
                        'author_avatar': content.author_avatar,
                        'author_url': raw_data.get("user_url") or raw_data.get("author_url"),
                        'unique_id': content.author_unique_id or raw_data.get("unique_id") or raw_data.get("short_id"),
                        'signature': raw_data.get("signature") or raw_data.get("user_signature"),
                        'fans_count': content.author_fans_count or 0,
                        'follows_count': content.author_follows_count or 0,
                        'likes_count': content.author_likes_count or 0,
                        'works_count': raw_data.get("works_count") or raw_data.get("aweme_count") or 0,
                        'contact_info': content.author_contact,
                        'ip_location': content.ip_location
                    }
                    await creator_service.upsert_creator(
                        platform=platform,
                        author_id=author_id,
                        data=author_data,
                        source_project_id=source_project_id,
                        source_keyword=source_keyword,
                        content_id=content.id
                    )
                    
            elif purpose == 'hotspot':
                # 热点内容分流：计算热度并入池
                from api.services.hotspot_service import get_hotspot_service
                hotspot_service = get_hotspot_service()
                
                await hotspot_service.upsert_hotspot(
                    content=content,
                    source_project_id=source_project_id,
                    source_keyword=source_keyword
                )
                
            elif purpose == 'sentiment':
                # 舆情监控：主流程已处理 is_alert 标记，此处可做额外处理
                # 例如：触发通知、更新统计等（暂不实现）
                pass
                
            # general: 不做额外分流，仅保留在 growhub_contents 全量池
            
        except Exception as e:
            utils.logger.warning(f"[GrowHubStore] 数据分流失败 ({purpose}): {e}")


# 全局实例
growhub_store_service = GrowHubStoreService()

def get_growhub_store_service():
    return growhub_store_service
