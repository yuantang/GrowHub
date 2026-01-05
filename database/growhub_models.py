# -*- coding: utf-8 -*-
# GrowHub - 关键词与内容分析数据模型
# Phase 1: 内容抓取与舆情监控增强

from sqlalchemy import Column, Integer, String, Text, BigInteger, Boolean, DateTime, Float, JSON, ForeignKey, Enum as SQLEnum
from sqlalchemy.sql import func
from database.models import Base
import enum


class KeywordLevel(enum.Enum):
    """关键词层级"""
    BRAND = 1       # 品牌词/产品词/竞品词
    CATEGORY = 2    # 品类词/场景词/功效词
    EMOTION = 3     # 情绪词/需求词


class ContentCategory(enum.Enum):
    """内容分类"""
    SENTIMENT = "sentiment"     # 舆情内容
    HOTSPOT = "hotspot"         # 热点内容
    COMPETITOR = "competitor"   # 竞品内容
    INFLUENCER = "influencer"   # 达人内容
    GENERAL = "general"         # 普通内容


class SentimentType(enum.Enum):
    """情感类型"""
    POSITIVE = "positive"
    NEUTRAL = "neutral"
    NEGATIVE = "negative"


class GrowHubKeyword(Base):
    """GrowHub 关键词表"""
    __tablename__ = 'growhub_keywords'
    
    id = Column(Integer, primary_key=True)
    keyword = Column(String(255), nullable=False, index=True)
    level = Column(Integer, nullable=False, default=1)  # 1:品牌词 2:品类词 3:情绪词
    parent_id = Column(Integer, ForeignKey('growhub_keywords.id'), nullable=True)
    
    # 关键词属性
    keyword_type = Column(String(50))  # brand/product/competitor/category/scene/emotion
    is_ai_generated = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    priority = Column(Integer, default=0)  # 抓取优先级，数值越大优先级越高
    
    # 统计数据
    hit_count = Column(Integer, default=0)          # 命中次数
    content_count = Column(Integer, default=0)      # 关联内容数
    avg_engagement = Column(Float, default=0.0)     # 平均互动率
    
    # 时间戳
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    last_crawl_at = Column(DateTime, nullable=True)


class GrowHubContent(Base):
    """GrowHub 统一内容表（多平台）"""
    __tablename__ = 'growhub_contents'
    
    id = Column(Integer, primary_key=True)
    
    # 平台信息
    platform = Column(String(50), nullable=False, index=True)  # douyin/xiaohongshu/bilibili/weibo/zhihu
    platform_content_id = Column(String(255), nullable=False, index=True)
    content_type = Column(String(50), nullable=False)  # video/image/text/mixed
    
    # 内容信息
    title = Column(Text)
    description = Column(Text)
    content_url = Column(Text)
    cover_url = Column(Text)
    media_urls = Column(JSON)  # 媒体资源URL列表
    
    # 作者信息
    author_id = Column(String(255), index=True)
    author_name = Column(String(255))
    author_avatar = Column(Text)
    author_fans_count = Column(Integer, default=0)
    
    # 互动数据
    like_count = Column(Integer, default=0)
    comment_count = Column(Integer, default=0)
    share_count = Column(Integer, default=0)
    collect_count = Column(Integer, default=0)
    view_count = Column(Integer, default=0)
    
    # 计算指标
    engagement_rate = Column(Float, default=0.0)    # 互动率
    viral_score = Column(Float, default=0.0)        # 爆款指数
    
    # 分类与标签
    category = Column(String(50), default='general')  # sentiment/hotspot/competitor/influencer/general
    sentiment = Column(String(20), default='neutral')  # positive/neutral/negative
    sentiment_score = Column(Float, default=0.0)       # 情感分数 -1 到 1
    keywords = Column(JSON)                            # 关联的关键词列表
    tags = Column(JSON)                                # 内容标签
    
    # 舆情相关
    is_alert = Column(Boolean, default=False)          # 是否触发预警
    alert_level = Column(String(20), nullable=True)    # 预警级别: low/medium/high/critical
    alert_reason = Column(Text, nullable=True)         # 预警原因
    is_handled = Column(Boolean, default=False)        # 是否已处理
    handled_at = Column(DateTime, nullable=True)
    handled_by = Column(String(100), nullable=True)
    
    # 时间戳
    publish_time = Column(DateTime, nullable=True, index=True)
    crawl_time = Column(DateTime, server_default=func.now())
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    
    # 来源关键词
    source_keyword_id = Column(Integer, ForeignKey('growhub_keywords.id'), nullable=True)
    source_keyword = Column(String(255), nullable=True)


class GrowHubDistributionRule(Base):
    """GrowHub 分发规则表"""
    __tablename__ = 'growhub_distribution_rules'
    
    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False)
    description = Column(Text)
    priority = Column(Integer, default=0)  # 规则优先级
    
    # 规则条件 (JSON格式)
    # 示例: {"sentiment": "negative", "engagement_rate": {">": 0.05}, "keywords_contain": ["投诉", "差评"]}
    conditions = Column(JSON, nullable=False)
    
    # 规则动作 (JSON格式)
    # 示例: {"notify": ["客服组"], "channel": ["wechat_work"], "urgency": "high", "tag": "舆情"}
    actions = Column(JSON, nullable=False)
    
    is_active = Column(Boolean, default=True)
    
    # 统计
    trigger_count = Column(Integer, default=0)
    last_trigger_at = Column(DateTime, nullable=True)
    
    # 时间戳
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class GrowHubNotification(Base):
    """GrowHub 通知记录表"""
    __tablename__ = 'growhub_notifications'
    
    id = Column(Integer, primary_key=True)
    
    # 通知类型
    notification_type = Column(String(50), nullable=False)  # alert/digest/report
    urgency = Column(String(20), default='normal')          # low/normal/high/critical
    
    # 通知渠道
    channel = Column(String(50), nullable=False)  # wechat_work/email/sms/webhook
    recipients = Column(JSON)                      # 接收人列表
    
    # 通知内容
    title = Column(String(255))
    content = Column(Text)
    
    # 关联信息
    content_id = Column(Integer, ForeignKey('growhub_contents.id'), nullable=True)
    rule_id = Column(Integer, ForeignKey('growhub_distribution_rules.id'), nullable=True)
    
    # 发送状态
    status = Column(String(20), default='pending')  # pending/sent/failed
    sent_at = Column(DateTime, nullable=True)
    error_message = Column(Text, nullable=True)
    
    # 时间戳
    created_at = Column(DateTime, server_default=func.now())


class GrowHubNotificationChannel(Base):
    """GrowHub 通知渠道配置表"""
    __tablename__ = 'growhub_notification_channels'
    
    id = Column(Integer, primary_key=True)
    name = Column(String(100), nullable=False)
    channel_type = Column(String(50), nullable=False)  # wechat_work/email/sms/webhook
    
    # 配置信息 (JSON格式，根据渠道类型不同)
    # wechat_work: {"webhook_url": "..."}
    # email: {"smtp_host": "...", "smtp_port": 587, "username": "...", "password": "..."}
    # webhook: {"url": "...", "headers": {...}}
    config = Column(JSON, nullable=False)
    
    is_active = Column(Boolean, default=True)
    
    # 时间戳
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class GrowHubNotificationGroup(Base):
    """GrowHub 通知组（接收人分组）"""
    __tablename__ = 'growhub_notification_groups'
    
    id = Column(Integer, primary_key=True)
    name = Column(String(100), nullable=False)  # 如: 客服组, 舆情组, 市场组
    description = Column(Text)
    
    # 成员 (JSON格式)
    # [{"name": "张三", "wechat_id": "...", "email": "..."}, ...]
    members = Column(JSON)
    
    # 默认通知渠道
    default_channels = Column(JSON)  # ["wechat_work", "email"]
    
    is_active = Column(Boolean, default=True)
    
    # 时间戳
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
