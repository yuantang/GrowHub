from typing import List, Optional, Dict, Any
from database.growhub_models import GrowHubProject, GrowHubContent, GrowHubNotificationChannel, GrowHubNotification
from database.db_session import get_session
from sqlalchemy import select
from api.services.notification import NotificationSender
from datetime import datetime
import asyncio

class ProjectAlertService:
    async def process_project_alerts(self, project: GrowHubProject, new_contents: List[GrowHubContent]) -> int:
        """
        处理项目预警
        返回发送的预警数量
        """
        
        # 1. 检查是否开启预警
        if not project.alert_channels:
            return 0
            
        # 2. 获取有效的通知渠道配置
        # alert_channels stores types e.g. ["wechat_work"]
        target_types = project.alert_channels
        if isinstance(target_types, str):
            # Safe parsing just in case
            import json
            try:
                target_types = json.loads(target_types)
            except:
                target_types = []
                
        if not target_types:
            return 0

        active_channels = await self._get_active_channels(target_types)
        if not active_channels:
            print(f"[Alert] Project {project.name} has alerts enabled but no active channels found for types: {target_types}")
            return 0
            
        alerts_triggered_count = 0
        
        # 3. 遍历内容检查规则
        async with get_session() as session:
            purpose = project.purpose or 'general'
            
            for content in new_contents:
                triggered = False
                reasons = []
                
                # 场景 1: 舆情监控模式 -> 自动负面预警
                if purpose == 'sentiment':
                    if content.sentiment == 'negative' or content.is_alert:
                        triggered = True
                        reasons.append("发现负面/敏感内容")
                
                # 场景 2: 热点发现模式 -> 自动爆款预警
                elif purpose == 'hotspot':
                    likes = content.like_count or 0
                    if likes > 1000: # 爆款阈值
                        triggered = True
                        reasons.append(f"发现热门内容(🔥{likes})")
                
                # 场景 3: 达人/通用模式 -> 只要配置了渠道就通知新内容
                else:
                    triggered = True
                    reasons.append("新内容更新")
                
                if triggered:
                    # 更新内容预警标记
                    content.is_alert = True
                    
                    # Send process
                    success = await self._send_alert_to_channels(project, content, reasons, active_channels)
                    
                    if success:
                        alerts_triggered_count += 1
                        
                        # Create notification record (async, best effort)
                        # We do this inside _send_alert_to_channels or here?
                        # Let's do it here.
                        pass # Record handling inside send helper
        
            # If we modified objects, we should flush if session is shared. 
            # But caller (project.py) manages the main session or expects us to handle it?
            # project.py loop usually doesn't hold open session across awaits easily.
            # So safer to run specific STATUS updates.
            
            # Update is_alert in bulk? 
            # new_contents objects might be transient.
            # Let's run a bulk update for alerted ones.
            alert_ids = [c.id for c in new_contents if c.is_alert]
            if alert_ids:
                from sqlalchemy import update
                await session.execute(
                    update(GrowHubContent).where(GrowHubContent.id.in_(alert_ids)).values(is_alert=True)
                )
                await session.commit()
                
        return alerts_triggered_count

    async def _get_active_channels(self, identifiers: List[Any]) -> List[GrowHubNotificationChannel]:
        """获取指定标识(ID或类型)的活跃渠道"""
        async with get_session() as session:
            # Separate ints (IDs) and strings (Types)
            ids = []
            types = []
            
            for x in identifiers:
                if isinstance(x, int):
                    ids.append(x)
                elif isinstance(x, str):
                    if x.isdigit():
                        ids.append(int(x))
                    else:
                        types.append(x)
                        
            from sqlalchemy import or_
            conditions = []
            
            if ids:
                conditions.append(GrowHubNotificationChannel.id.in_(ids))
            if types:
                conditions.append(GrowHubNotificationChannel.channel_type.in_(types))
                
            if not conditions:
                return []
                
            result = await session.execute(
                select(GrowHubNotificationChannel).where(
                    GrowHubNotificationChannel.is_active == True,
                    or_(*conditions)
                )
            )
            return result.scalars().all()

    async def _send_alert_to_channels(self, project: GrowHubProject, content: GrowHubContent, reasons: List[str], channels: List[GrowHubNotificationChannel]) -> bool:
        """发送报警到所有渠道"""
        success_any = False
        
        title = f"⚠️ [监控预警] {project.name}"
        reason_str = " | ".join(reasons)
        msg_content = f"""
**触发规则**: {reason_str}
**内容标题**: {content.title or '无标题'}
**平台作者**: {content.platform} @{content.author_name or 'Unknown'}
**发布时间**: {content.publish_time}
**数据表现**: 👍{content.like_count} 💬{content.comment_count}

[查看详情]({content.content_url})
        """
        
        for channel in channels:
            sent = False
            try:
                if channel.channel_type == "wechat_work":
                    url = channel.config.get("webhook_url")
                    if url:
                        sent = await NotificationSender.send_wechat_work(url, title, msg_content, urgency="high")
                elif channel.channel_type == "webhook":
                    url = channel.config.get("url")
                    if url:
                        sent = await NotificationSender.send_webhook(
                            url, 
                            channel.config.get("headers", {}),
                            {
                                "title": title,
                                "content": msg_content,
                                "project_id": project.id,
                                "content_id": content.id
                            }
                        )
                
                if sent:
                    success_any = True
                    # Log notification
                    async with get_session() as session:
                        note = GrowHubNotification(
                            notification_type="alert",
                            urgency="high",
                            channel=channel.channel_type,
                            recipients=[channel.name],
                            title=title,
                            content=msg_content,
                            content_id=content.id,
                            status="sent"
                        )
                        session.add(note)
                        await session.commit()
                        
            except Exception as e:
                print(f"[Alert] Failed to send to channel {channel.name}: {e}")
                
        return success_any

# Global Instance
alert_service = ProjectAlertService()
def get_alert_service():
    return alert_service
