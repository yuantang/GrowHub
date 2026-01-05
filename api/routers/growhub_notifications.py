# -*- coding: utf-8 -*-
# GrowHub - 通知系统 API
# Phase 1: 内容抓取与舆情监控增强

from fastapi import APIRouter, HTTPException, Query, BackgroundTasks
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime
import httpx
import json

from database.db_session import get_session
from database.growhub_models import (
    GrowHubNotification, 
    GrowHubNotificationChannel, 
    GrowHubNotificationGroup
)
from sqlalchemy import select, update, delete, func, desc

router = APIRouter(prefix="/growhub/notifications", tags=["GrowHub - Notifications"])


# ==================== Pydantic Models ====================

class NotificationChannelBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    channel_type: str = Field(..., description="渠道类型: wechat_work/email/sms/webhook")
    config: Dict[str, Any] = Field(..., description="渠道配置")
    is_active: bool = True


class NotificationChannelCreate(NotificationChannelBase):
    pass


class NotificationChannelResponse(NotificationChannelBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class NotificationGroupBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = None
    members: List[Dict[str, Any]] = Field(default=[], description="成员列表")
    default_channels: List[str] = Field(default=[], description="默认通知渠道")
    is_active: bool = True


class NotificationGroupCreate(NotificationGroupBase):
    pass


class NotificationGroupResponse(NotificationGroupBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class SendNotificationRequest(BaseModel):
    notification_type: str = Field("alert", description="通知类型: alert/digest/report")
    urgency: str = Field("normal", description="紧急程度: low/normal/high/critical")
    channel: Optional[str] = Field(None, description="渠道类型: wechat_work/email/webhook")
    channel_id: Optional[int] = Field(None, description="渠道ID，优先使用")
    recipients: List[str] = Field(default=[], description="接收人/组")
    title: str = Field(..., min_length=1)
    content: str = Field(..., min_length=1)
    content_id: Optional[int] = None
    rule_id: Optional[int] = None



class NotificationResponse(BaseModel):
    id: int
    notification_type: str
    urgency: str
    channel: str
    recipients: List[str]
    title: str
    content: str
    status: str
    sent_at: Optional[datetime]
    error_message: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


# ==================== Notification Sender Service ====================

class NotificationSender:
    """通知发送服务"""
    
    @staticmethod
    async def send_wechat_work(webhook_url: str, title: str, content: str, urgency: str = "normal") -> bool:
        """发送企业微信通知"""
        urgency_colors = {
            "low": "info",
            "normal": "comment",
            "high": "warning",
            "critical": "warning"
        }
        
        urgency_labels = {
            "low": "📢",
            "normal": "📣",
            "high": "⚠️",
            "critical": "🚨"
        }
        
        message = {
            "msgtype": "markdown",
            "markdown": {
                "content": f"""{urgency_labels.get(urgency, '📣')} **{title}**

{content}

> 发送时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"""
            }
        }
        
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(webhook_url, json=message, timeout=10)
                result = response.json()
                return result.get("errcode") == 0
        except Exception as e:
            print(f"[GrowHub] WeChat Work notification failed: {e}")
            return False
    
    @staticmethod
    async def send_email(smtp_config: Dict, recipients: List[str], title: str, content: str) -> bool:
        """发送邮件通知"""
        # TODO: 实现邮件发送
        # 需要配置 SMTP: host, port, username, password
        print(f"[GrowHub] Email notification: {title} to {recipients}")
        return True
    
    @staticmethod
    async def send_webhook(url: str, headers: Dict, payload: Dict) -> bool:
        """发送 Webhook 通知"""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(url, json=payload, headers=headers, timeout=10)
                return response.status_code == 200
        except Exception as e:
            print(f"[GrowHub] Webhook notification failed: {e}")
            return False


# ==================== Notification Channels API ====================

@router.get("/channels", response_model=List[NotificationChannelResponse])
async def list_channels(is_active: Optional[bool] = Query(None)):
    """获取通知渠道列表"""
    async with get_session() as session:
        query = select(GrowHubNotificationChannel)
        
        if is_active is not None:
            query = query.where(GrowHubNotificationChannel.is_active == is_active)
        
        result = await session.execute(query)
        channels = result.scalars().all()
        
        # 隐藏敏感配置信息
        return [NotificationChannelResponse(
            id=c.id,
            name=c.name,
            channel_type=c.channel_type,
            config={k: "***" if k in ["password", "secret", "token"] else v for k, v in (c.config or {}).items()},
            is_active=c.is_active,
            created_at=c.created_at,
            updated_at=c.updated_at
        ) for c in channels]


@router.post("/channels", response_model=NotificationChannelResponse)
async def create_channel(data: NotificationChannelCreate):
    """创建通知渠道"""
    async with get_session() as session:
        channel = GrowHubNotificationChannel(
            name=data.name,
            channel_type=data.channel_type,
            config=data.config,
            is_active=data.is_active
        )
        session.add(channel)
        await session.flush()
        await session.refresh(channel)
        
        return NotificationChannelResponse.model_validate(channel)


@router.put("/channels/{channel_id}", response_model=NotificationChannelResponse)
async def update_channel(channel_id: int, data: NotificationChannelCreate):
    """更新通知渠道"""
    async with get_session() as session:
        result = await session.execute(
            select(GrowHubNotificationChannel).where(GrowHubNotificationChannel.id == channel_id)
        )
        channel = result.scalar()
        
        if not channel:
            raise HTTPException(status_code=404, detail="渠道不存在")
        
        channel.name = data.name
        channel.channel_type = data.channel_type
        channel.config = data.config
        channel.is_active = data.is_active
        
        await session.flush()
        await session.refresh(channel)
        
        return NotificationChannelResponse.model_validate(channel)


@router.delete("/channels/{channel_id}")
async def delete_channel(channel_id: int):
    """删除通知渠道"""
    async with get_session() as session:
        result = await session.execute(
            select(GrowHubNotificationChannel).where(GrowHubNotificationChannel.id == channel_id)
        )
        channel = result.scalar()
        
        if not channel:
            raise HTTPException(status_code=404, detail="渠道不存在")
        
        await session.delete(channel)
        
        return {"message": "渠道已删除"}


@router.post("/channels/{channel_id}/test")
async def test_channel(channel_id: int):
    """测试通知渠道"""
    async with get_session() as session:
        result = await session.execute(
            select(GrowHubNotificationChannel).where(GrowHubNotificationChannel.id == channel_id)
        )
        channel = result.scalar()
        
        if not channel:
            raise HTTPException(status_code=404, detail="渠道不存在")
        
        success = False
        
        if channel.channel_type == "wechat_work":
            webhook_url = channel.config.get("webhook_url")
            if webhook_url:
                success = await NotificationSender.send_wechat_work(
                    webhook_url, 
                    "GrowHub 测试通知", 
                    "这是一条测试消息，如果您收到此消息，说明企业微信通知配置成功。"
                )
        elif channel.channel_type == "webhook":
            url = channel.config.get("url")
            headers = channel.config.get("headers", {})
            if url:
                success = await NotificationSender.send_webhook(
                    url,
                    headers,
                    {"type": "test", "message": "GrowHub test notification"}
                )
        
        if success:
            return {"message": "测试通知发送成功"}
        else:
            raise HTTPException(status_code=500, detail="测试通知发送失败")


# ==================== Notification Groups API ====================

@router.get("/groups", response_model=List[NotificationGroupResponse])
async def list_groups(is_active: Optional[bool] = Query(None)):
    """获取通知组列表"""
    async with get_session() as session:
        query = select(GrowHubNotificationGroup)
        
        if is_active is not None:
            query = query.where(GrowHubNotificationGroup.is_active == is_active)
        
        result = await session.execute(query)
        groups = result.scalars().all()
        
        return [NotificationGroupResponse.model_validate(g) for g in groups]


@router.post("/groups", response_model=NotificationGroupResponse)
async def create_group(data: NotificationGroupCreate):
    """创建通知组"""
    async with get_session() as session:
        group = GrowHubNotificationGroup(
            name=data.name,
            description=data.description,
            members=data.members,
            default_channels=data.default_channels,
            is_active=data.is_active
        )
        session.add(group)
        await session.flush()
        await session.refresh(group)
        
        return NotificationGroupResponse.model_validate(group)


@router.put("/groups/{group_id}", response_model=NotificationGroupResponse)
async def update_group(group_id: int, data: NotificationGroupCreate):
    """更新通知组"""
    async with get_session() as session:
        result = await session.execute(
            select(GrowHubNotificationGroup).where(GrowHubNotificationGroup.id == group_id)
        )
        group = result.scalar()
        
        if not group:
            raise HTTPException(status_code=404, detail="通知组不存在")
        
        group.name = data.name
        group.description = data.description
        group.members = data.members
        group.default_channels = data.default_channels
        group.is_active = data.is_active
        
        await session.flush()
        await session.refresh(group)
        
        return NotificationGroupResponse.model_validate(group)


@router.delete("/groups/{group_id}")
async def delete_group(group_id: int):
    """删除通知组"""
    async with get_session() as session:
        result = await session.execute(
            select(GrowHubNotificationGroup).where(GrowHubNotificationGroup.id == group_id)
        )
        group = result.scalar()
        
        if not group:
            raise HTTPException(status_code=404, detail="通知组不存在")
        
        await session.delete(group)
        
        return {"message": "通知组已删除"}


# ==================== Send Notifications API ====================

@router.post("/send", response_model=NotificationResponse)
async def send_notification(data: SendNotificationRequest, background_tasks: BackgroundTasks):
    """发送通知"""
    # 优先通过 channel_id 获取 channel 类型
    channel_type = data.channel or "wechat_work"
    
    if data.channel_id:
        async with get_session() as session:
            result = await session.execute(
                select(GrowHubNotificationChannel).where(GrowHubNotificationChannel.id == data.channel_id)
            )
            channel_record = result.scalar()
            if channel_record:
                channel_type = channel_record.channel_type
    
    async with get_session() as session:
        # 创建通知记录
        notification = GrowHubNotification(
            notification_type=data.notification_type,
            urgency=data.urgency,
            channel=channel_type,
            recipients=data.recipients,
            title=data.title,
            content=data.content,
            content_id=data.content_id,
            rule_id=data.rule_id,
            status="pending"
        )
        session.add(notification)
        await session.flush()
        await session.refresh(notification)
        
        notification_id = notification.id
    
    # 后台发送通知
    background_tasks.add_task(_send_notification_task, notification_id, data)
    
    return NotificationResponse(
        id=notification_id,
        notification_type=data.notification_type,
        urgency=data.urgency,
        channel=channel_type,
        recipients=data.recipients,
        title=data.title,
        content=data.content,
        status="pending",
        sent_at=None,
        error_message=None,
        created_at=datetime.now()
    )


async def _send_notification_task(notification_id: int, data: SendNotificationRequest):
    """后台发送通知任务"""
    success = False
    error_message = None
    
    try:
        async with get_session() as session:
            channel = None
            
            # 优先通过 channel_id 获取渠道配置
            if data.channel_id:
                result = await session.execute(
                    select(GrowHubNotificationChannel).where(
                        GrowHubNotificationChannel.id == data.channel_id,
                        GrowHubNotificationChannel.is_active == True
                    )
                )
                channel = result.scalar()
            
            # 如果没有 channel_id，则通过 channel 类型获取
            if not channel and data.channel:
                result = await session.execute(
                    select(GrowHubNotificationChannel).where(
                        GrowHubNotificationChannel.channel_type == data.channel,
                        GrowHubNotificationChannel.is_active == True
                    )
                )
                channel = result.scalar()
            
            if not channel:
                error_message = "未找到可用的通知渠道配置"
            else:
                channel_type = channel.channel_type
                
                if channel_type == "wechat_work":
                    webhook_url = channel.config.get("webhook_url")
                    if webhook_url:
                        success = await NotificationSender.send_wechat_work(
                            webhook_url, data.title, data.content, data.urgency
                        )
                    else:
                        error_message = "企业微信渠道未配置 Webhook URL"
                        
                elif channel_type == "webhook":
                    url = channel.config.get("url") or channel.config.get("webhook_url")
                    headers = channel.config.get("headers", {})
                    if url:
                        success = await NotificationSender.send_webhook(
                            url, headers, {
                                "type": data.notification_type,
                                "urgency": data.urgency,
                                "title": data.title,
                                "content": data.content,
                                "recipients": data.recipients
                            }
                        )
                    else:
                        error_message = "Webhook 渠道未配置 URL"
                
                if not success and not error_message:
                    error_message = "发送失败"
            
            # 更新通知状态
            result = await session.execute(
                select(GrowHubNotification).where(GrowHubNotification.id == notification_id)
            )
            notification = result.scalar()
            if notification:
                notification.status = "sent" if success else "failed"
                notification.sent_at = datetime.now() if success else None
                notification.error_message = error_message
                
    except Exception as e:
        print(f"[GrowHub] Send notification error: {e}")



@router.get("/history", response_model=List[NotificationResponse])
async def get_notification_history(
    notification_type: Optional[str] = Query(None),
    channel: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200)
):
    """获取通知历史"""
    async with get_session() as session:
        query = select(GrowHubNotification)
        
        if notification_type:
            query = query.where(GrowHubNotification.notification_type == notification_type)
        if channel:
            query = query.where(GrowHubNotification.channel == channel)
        if status:
            query = query.where(GrowHubNotification.status == status)
        
        query = query.order_by(desc(GrowHubNotification.created_at))
        query = query.offset((page - 1) * page_size).limit(page_size)
        
        result = await session.execute(query)
        notifications = result.scalars().all()
        
        return [NotificationResponse.model_validate(n) for n in notifications]


@router.get("/stats")
async def get_notification_stats():
    """获取通知统计"""
    async with get_session() as session:
        total_result = await session.execute(select(func.count(GrowHubNotification.id)))
        total = total_result.scalar()
        
        # By status
        status_stats = {}
        for status in ["pending", "sent", "failed"]:
            result = await session.execute(
                select(func.count(GrowHubNotification.id)).where(GrowHubNotification.status == status)
            )
            status_stats[status] = result.scalar()
        
        # By channel
        channel_stats = {}
        for channel in ["wechat_work", "email", "sms", "webhook"]:
            result = await session.execute(
                select(func.count(GrowHubNotification.id)).where(GrowHubNotification.channel == channel)
            )
            count = result.scalar()
            if count > 0:
                channel_stats[channel] = count
        
        return {
            "total": total,
            "by_status": status_stats,
            "by_channel": channel_stats
        }
