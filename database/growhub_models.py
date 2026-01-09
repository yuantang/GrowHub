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
    video_url = Column(Text, nullable=True)  # 可播放的视频URL (抖音/快手等)
    media_urls = Column(JSON)  # 媒体资源URL列表
    
    # 作者信息
    author_id = Column(String(255), index=True)
    author_name = Column(String(255))
    author_avatar = Column(Text)
    author_contact = Column(String(255), nullable=True)  # 手机号/微信号
    author_fans_count = Column(Integer, default=0)
    author_follows_count = Column(Integer, default=0)  # 作者关注数
    author_likes_count = Column(Integer, default=0)    # 作者获赞数
    ip_location = Column(String(100), nullable=True)   # IP归属地
    
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
    source_keyword = Column(String(255), nullable=True, index=True)
    
    # 关联项目（用于精确过滤）
    project_id = Column(Integer, ForeignKey('growhub_projects.id'), nullable=True, index=True)


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


class GrowHubProject(Base):
    """GrowHub 监控项目表 - 统一管理关键词、调度和通知"""
    __tablename__ = 'growhub_projects'
    
    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False)
    description = Column(Text)
    
    # 关键词配置
    keywords = Column(JSON)  # ["品牌A", "竞品B", ...]
    sentiment_keywords = Column(JSON)  # 自定义舆情词 ["差评", "避雷", ...]
    
    # 平台配置
    platforms = Column(JSON)  # ["xhs", "douyin", ...]
    
    # 爬虫配置
    crawler_type = Column(String(50), default='search')  # search/detail/creator
    crawl_limit = Column(Integer, default=20)  # 每次抓取数量限制
    crawl_date_range = Column(Integer, default=7)  # 爬取时间范围（最近N天），0表示不限
    enable_comments = Column(Boolean, default=True)  # 是否抓取评论
    deduplicate_authors = Column(Boolean, default=False)  # 是否博主去重（只保留最新一条）
    
    # 高级过滤配置
    min_likes = Column(Integer, default=0)
    max_likes = Column(Integer, default=0)
    min_comments = Column(Integer, default=0)
    max_comments = Column(Integer, default=0)
    min_shares = Column(Integer, default=0)
    max_shares = Column(Integer, default=0)
    min_favorites = Column(Integer, default=0)
    max_favorites = Column(Integer, default=0)
    
    # 调度配置
    schedule_type = Column(String(20), default='interval')  # interval / cron
    schedule_value = Column(String(100))  # 间隔秒数 或 cron表达式
    is_active = Column(Boolean, default=False)  # 是否启用自动调度
    
    # 通知配置
    alert_on_negative = Column(Boolean, default=True)  # 负面内容预警
    alert_on_hotspot = Column(Boolean, default=False)  # 热点内容推送
    alert_channels = Column(JSON)  # ["wechat_work", "email"]
    
    # 运行状态
    last_run_at = Column(DateTime, nullable=True)
    next_run_at = Column(DateTime, nullable=True)
    run_count = Column(Integer, default=0)
    
    # 统计数据
    total_crawled = Column(Integer, default=0)  # 累计抓取
    total_alerts = Column(Integer, default=0)   # 累计预警
    today_crawled = Column(Integer, default=0)  # 今日抓取
    today_alerts = Column(Integer, default=0)   # 今日预警
    
    # 内部任务ID（关联调度器）
    scheduler_task_id = Column(String(50), nullable=True)
    
    # 时间戳
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class GrowHubAccount(Base):
    """GrowHub 账号池表"""
    __tablename__ = 'growhub_accounts'
    
    id = Column(String(50), primary_key=True)  # UUID
    platform = Column(String(50), nullable=False)  # xhs/douyin/...
    account_name = Column(String(255), nullable=False)
    cookies = Column(Text, nullable=False)
    
    # 状态
    status = Column(String(50), default='unknown')  # active/cooldown/expired/banned
    health_score = Column(Integer, default=100)
    
    # 使用统计
    use_count = Column(Integer, default=0)
    success_count = Column(Integer, default=0)
    fail_count = Column(Integer, default=0)
    last_used = Column(DateTime, nullable=True)
    last_check = Column(DateTime, nullable=True)
    
    # 冷却控制
    cooldown_until = Column(DateTime, nullable=True)
    
    # 分组
    group_name = Column(String(50), default='default')
    tags = Column(JSON)
    
    # 备注
    notes = Column(Text, nullable=True)
    
    # 时间戳
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
