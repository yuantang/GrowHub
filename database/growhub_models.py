# -*- coding: utf-8 -*-
# GrowHub - 关键词与内容分析数据模型
# Phase 1: 内容抓取与舆情监控增强

from sqlalchemy import Column, Integer, String, Text, BigInteger, Boolean, DateTime, Float, JSON, ForeignKey, Enum as SQLEnum, Date, UniqueConstraint
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


class ProjectPurpose(enum.Enum):
    """项目/任务目的"""
    CREATOR = "creator"       # 找达人博主
    HOTSPOT = "hotspot"       # 找热门排行
    SENTIMENT = "sentiment"   # 舆情监控
    GENERAL = "general"       # 通用（全量入数据管理）


class GrowHubUser(Base):
    """用户表"""
    __tablename__ = 'growhub_users'
    
    id = Column(Integer, primary_key=True)
    username = Column(String(50), unique=True, nullable=False, index=True)
    email = Column(String(100), nullable=True)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(20), default='user')  # user/admin
    status = Column(String(20), default='active')  # active/disabled
    
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class GrowHubKeyword(Base):
    """GrowHub 关键词表"""
    __tablename__ = 'growhub_keywords'
    
    id = Column(Integer, primary_key=True)
    keyword = Column(String(255), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey('growhub_users.id'), nullable=True, index=True)
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
    author_unique_id = Column(String(100), nullable=True)  # 抖音号/快手号等平台账号
    
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
    
    # 所有权 (新增)
    user_id = Column(Integer, ForeignKey('growhub_users.id'), nullable=True, index=True)


class GrowHubAudioExtraction(Base):
    """GrowHub 视频音频分离及文案提取记录"""
    __tablename__ = 'growhub_audio_extractions'
    
    id = Column(Integer, primary_key=True)
    content_id = Column(Integer, ForeignKey('growhub_contents.id'), nullable=True, index=True)
    hotspot_id = Column(Integer, ForeignKey('growhub_hotspots.id'), nullable=True, index=True)
    video_url = Column(Text, nullable=False)
    
    # pending, downloading, extracting, separating, transcribing, success, failed
    status = Column(String(50), default='pending')
    
    # 结果路径 (相对于 static/ 的路径)
    transcript_text = Column(Text, nullable=True)     # 解析出的文案
    vocals_local_path = Column(Text, nullable=True)   # 纯人声
    bgm_local_path = Column(Text, nullable=True)      # 背景音
    original_audio_path = Column(Text, nullable=True) # 完整音频
    
    error_msg = Column(Text, nullable=True)
    
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


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
    user_id = Column(Integer, ForeignKey('growhub_users.id'), nullable=True, index=True)
    description = Column(Text)
    
    # 关键词配置
    keywords = Column(JSON)  # ["品牌A", "竞品B", ...]
    sentiment_keywords = Column(JSON)  # 自定义舆情词 ["差评", "避雷", ...]
    
    # 平台配置
    platforms = Column(JSON)  # ["xhs", "douyin", ...]
    
    # 任务目的 (驱动数据分流，由 capture_mode 推导)
    purpose = Column(String(20), default='hotspot')  # hotspot / creator
    
    # 抓取模式：hot_content | hot_creator | watch_content | watch_creator(预留)
    capture_mode = Column(String(32), default='hot_content')
    # 定点监控目标 [{type, platform, url, content_id?, label?}]
    watch_targets = Column(JSON)
    
    # 爬虫配置
    crawler_type = Column(String(50), default='search')  # search/detail/creator
    crawl_limit = Column(Integer, default=20)  # 每次抓取数量限制
    crawl_date_range = Column(Integer, default=7)  # 爬取时间范围（最近N天），0表示不限
    enable_comments = Column(Boolean, default=True)  # 是否抓取评论
    deduplicate_authors = Column(Boolean, default=False)  # 是否博主去重（只保留最新一条）
    max_concurrency = Column(Integer, default=3)  # 最大并发数 (Pro 版特性)
    
    # 高级过滤配置 - 内容筛选
    min_likes = Column(Integer, default=0)
    max_likes = Column(Integer, default=0)
    min_comments = Column(Integer, default=0)
    max_comments = Column(Integer, default=0)
    min_shares = Column(Integer, default=0)
    max_shares = Column(Integer, default=0)
    min_favorites = Column(Integer, default=0)
    max_favorites = Column(Integer, default=0)
    
    # 高级过滤配置 - 博主筛选
    min_fans = Column(Integer, default=0)  # 博主最小粉丝数
    max_fans = Column(Integer, default=0)  # 博主最大粉丝数 (0=不限)
    require_contact = Column(Boolean, default=False)  # 是否要求有联系方式
    # 热门达人：入库标记 all | competitor | partner
    creator_account_type = Column(String(32), default='all')
    
    # 高级搜索条件
    publish_time_limit = Column(Integer, default=0)    # 发布时间限制（天数）, 0=不限, 1=一天内, 7=一周内, 180=半年内
    video_duration_limit = Column(String(50), default="0") # 视频时长限制, "0"=不限, "<1"=1分钟以下, "1-5"=1-5分钟, ">5"=5分钟以上
    search_scope = Column(String(50), default="all")   # 搜索范围, "all"=不限
    content_type = Column(String(50), default="0")     # 内容形式, "0"=不限, "video"=视频, "image_text"=图文
    
    # 调度配置
    schedule_type = Column(String(20), default='interval')  # interval / cron
    schedule_value = Column(String(100))  # 间隔秒数 或 cron表达式
    is_active = Column(Boolean, default=False)  # 是否启用自动调度
    
    # 通知配置
    alert_on_negative = Column(Boolean, default=True)  # 负面内容预警
    alert_on_new_content = Column(Boolean, default=False)  # 新内容更新通知
    alert_on_hotspot = Column(Boolean, default=False)  # 热点内容推送
    alert_channels = Column(JSON)  # ["wechat_work", "email"]
    
    # 运行状态
    last_run_at = Column(DateTime, nullable=True)
    next_run_at = Column(DateTime, nullable=True)
    last_run_status = Column(String(255), nullable=True)  # 新增：直接展示运行结果或明确报错
    run_count = Column(Integer, default=0)
    
    # 统计数据
    total_crawled = Column(Integer, default=0)  # 累计抓取
    total_alerts = Column(Integer, default=0)   # 累计预警
    today_crawled = Column(Integer, default=0)  # 今日抓取
    today_alerts = Column(Integer, default=0)   # 今日预警
    
    use_plugin = Column(Boolean, default=False)  # 已废弃：采集统一走 MediaCrawlerPro
    
    # 内部任务ID（关联调度器）
    scheduler_task_id = Column(String(50), nullable=True)
    
    # 时间戳
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class AccountRole(enum.Enum):
    """账号角色"""
    CONTENT = "content"  # 内容账号（用于搜索、拉列表）
    DATA = "data"        # 数据账号（用于拉详情、粉丝画像）


class CreatorCrawlStatus(enum.Enum):
    """作者抓取状态机"""
    NEW = "new"           # 新发现
    WAITING = "waiting"   # 待抓取
    PROFILED = "profiled" # 已抓取详情
    FAILED = "failed"     # 抓取失败


class GrowHubAccount(Base):
    """GrowHub 账号池表"""
    __tablename__ = 'growhub_accounts'
    
    id = Column(String(50), primary_key=True)  # UUID
    platform = Column(String(50), nullable=False)  # xhs/douyin/...
    user_id = Column(Integer, ForeignKey('growhub_users.id'), nullable=True, index=True)
    account_name = Column(String(255), nullable=False)
    cookies = Column(Text, nullable=False)
    
    # 角色与风控
    role = Column(String(20), default='content')  # content/data
    proxy_url = Column(String(255), nullable=True) # 绑定的代理IP
    
    # 状态
    status = Column(String(50), default='unknown')  # active/cooldown/expired/banned
    health_score = Column(Integer, default=100)
    
    # 使用统计
    use_count = Column(Integer, default=0)
    success_count = Column(Integer, default=0)
    fail_count = Column(Integer, default=0)
    consecutive_fails = Column(Integer, default=0)  # 连续失败次数，用于指数退避
    last_used = Column(DateTime, nullable=True)
    last_check = Column(DateTime, nullable=True)
    
    # 冷却控制
    cooldown_until = Column(DateTime, nullable=True)
    
    # 分组
    group_name = Column(String(50), default='default')
    tags = Column(JSON)
    
    # IP 绑定与项目路由 (Pro 版特性)
    last_proxy_id = Column(String(255), nullable=True)
    proxy_config = Column(JSON, nullable=True)
    last_project_id = Column(Integer, nullable=True)  # 最后一次使用该账号的项目 ID，用于 Sticky Sessions
    
    # 指纹信息
    fingerprint = Column(JSON, nullable=True)  # 浏览器指纹 {userAgent, platform, language...}
    
    # 备注
    notes = Column(Text, nullable=True)
    
    # 时间戳
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class GrowHubCheckpoint(Base):
    """GrowHub 爬虫断点续爬表"""
    __tablename__ = 'growhub_checkpoints'
    
    id = Column(String(50), primary_key=True)  # task_id (UUID)
    project_id = Column(Integer, nullable=True, index=True) # 关联的项目 ID
    platform = Column(String(50), nullable=False)

    crawler_type = Column(String(50), nullable=False)
    
    # 进度标记
    keywords = Column(Text, nullable=True)
    current_keyword_index = Column(Integer, default=0)
    current_page = Column(Integer, default=1)
    cursor = Column(String(255), nullable=True)
    
    # 详情/创作者模式
    specified_ids = Column(Text, nullable=True)
    current_id_index = Column(Integer, default=0)
    
    # 统计
    total_notes_fetched = Column(Integer, default=0)
    total_comments_fetched = Column(Integer, default=0)
    total_errors = Column(Integer, default=0)
    
    # 状态
    status = Column(SQLEnum('running', 'paused', 'completed', 'failed', name='checkpoint_status'), default='running')
    error_message = Column(Text, nullable=True)
    metadata_json = Column(JSON, nullable=True)  # Avoid name conflict with metadata
    
    # 时间戳
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    completed_at = Column(DateTime, nullable=True)


class GrowHubCheckpointNote(Base):
    """GrowHub 检查点处理记录表 - 用于超大规模去重"""
    __tablename__ = 'growhub_checkpoint_notes'
    
    id = Column(Integer, primary_key=True)
    checkpoint_id = Column(String(50), ForeignKey('growhub_checkpoints.id'), index=True)
    note_id = Column(String(255), nullable=False, index=True)
    note_type = Column(String(20), default='aweme') # aweme/comment/creator
    
    created_at = Column(DateTime, server_default=func.now())


class GrowHubCreator(Base):
    """GrowHub 达人博主池 - 按博主去重，聚合更新"""
    __tablename__ = 'growhub_creators'
    
    id = Column(Integer, primary_key=True)
    
    # 博主唯一标识 (platform + author_id 联合唯一)
    platform = Column(String(20), nullable=False, index=True)
    author_id = Column(String(255), nullable=False, index=True)
    
    # 博主基础信息 (可更新)
    unique_id = Column(String(100))          # 平台账号ID (如抖音号)
    author_name = Column(String(255))
    author_avatar = Column(Text)
    author_url = Column(Text)                # 主页链接
    signature = Column(Text)                 # 简介/签名
    
    # 核心指标 (取最新值)
    fans_count = Column(Integer, default=0)
    follows_count = Column(Integer, default=0)
    likes_count = Column(Integer, default=0)
    works_count = Column(Integer, default=0)
    
    # 联系方式
    contact_info = Column(Text)              # 提取的联系方式
    ip_location = Column(String(100))
    
    # 内容分析 (聚合计算)
    avg_likes = Column(Integer, default=0)
    avg_comments = Column(Integer, default=0)
    content_count = Column(Integer, default=0)  # 抓取到的内容数
    content_tags = Column(JSON)              # 内容标签
    
    # 业务状态
    status = Column(String(20), default='new')  # new/contacted/cooperating/rejected
    is_competitor = Column(Boolean, default=False, index=True) # 是否为竞品账号
    
    
    # 爬虫状态机
    crawl_status = Column(String(20), default='new')  # new/waiting/profiled/failed
    last_profile_crawl_at = Column(DateTime, nullable=True)
    
    notes = Column(Text)                     # 备注
    
    # 来源追踪
    source_project_id = Column(Integer, ForeignKey('growhub_projects.id'), nullable=True)
    source_keyword = Column(String(255))
    
    # 所有权 (新增)
    user_id = Column(Integer, ForeignKey('growhub_users.id'), nullable=True, index=True)
    
    # 关联的最新内容ID (用于快速预览)
    latest_content_id = Column(Integer, ForeignKey('growhub_contents.id'), nullable=True)
    
    # 时间戳
    first_seen_at = Column(DateTime)         # 首次发现时间
    last_updated_at = Column(DateTime)       # 最后更新时间
    created_at = Column(DateTime, server_default=func.now())
    
    # 联合唯一约束
    __table_args__ = (
        {'sqlite_autoincrement': True},
    )


class GrowHubHotspot(Base):
    """GrowHub 热点内容池 - 按内容去重，热度排行"""
    __tablename__ = 'growhub_hotspots'
    
    id = Column(Integer, primary_key=True)
    
    # 关联原始内容 (唯一)
    content_id = Column(Integer, ForeignKey('growhub_contents.id'), unique=True, index=True)
    platform_content_id = Column(String(255), unique=True, index=True)  # 冗余, 快速查重
    platform = Column(String(20), index=True)
    
    # 内容快照 (入选时的数据)
    title = Column(String(500))
    author_name = Column(String(255))
    cover_url = Column(Text)
    content_url = Column(Text)
    
    # 热度指标快照
    heat_score = Column(Integer, default=0, index=True)  # 热度分 = likes + comments*2 + shares*3
    like_count = Column(Integer, default=0)
    comment_count = Column(Integer, default=0)
    share_count = Column(Integer, default=0)
    view_count = Column(Integer, default=0)
    
    # 排行信息
    rank_date = Column(DateTime, index=True) # 排行日期
    rank_position = Column(Integer)          # 当日排名
    
    # 来源追踪
    source_project_id = Column(Integer, ForeignKey('growhub_projects.id'), nullable=True)
    source_keyword = Column(String(255))
    
    # 所有权 (新增)
    user_id = Column(Integer, ForeignKey('growhub_users.id'), nullable=True, index=True)
    
    # AI 评估与 3D 打分 (新增字段)
    alignment_score = Column(Float, default=0.0)      # 适配度评分 (0-100)
    recency_score = Column(Float, default=0.0)        # 时效性评分 (0-100)
    duration_label = Column(String(50))               # 时效标签: 即日可发/短期持续/长期深耕
    is_valid = Column(Boolean, default=True)          # 有效性状态
    validity_status = Column(String(200))             # 失效原因/平台限流等状态
    ai_features = Column(JSON)                        # 特征提取: 热门模板、核心关键词、高频词云
    ai_evaluation = Column(Text)                      # 推荐理由/调性评估
    custom_categories = Column(JSON)                  # 垂直品类标签 (冥想/睡眠/解压等)
    is_competitor = Column(Boolean, default=False, index=True) # 是否为竞品热点
    
    
    # 时间戳
    publish_time = Column(DateTime)          # 内容发布时间
    entered_at = Column(DateTime, server_default=func.now())  # 入池时间


class GrowHubHotspotHistory(Base):
    """热点内容历史变化表 - 监控7天点赞变化趋势"""
    __tablename__ = 'growhub_hotspot_history'
    
    id = Column(Integer, primary_key=True)
    hotspot_id = Column(Integer, ForeignKey('growhub_hotspots.id', ondelete='CASCADE'), nullable=False, index=True)
    record_date = Column(Date, nullable=False, index=True)
    like_count = Column(Integer, default=0)
    comment_count = Column(Integer, default=0)
    share_count = Column(Integer, default=0)
    view_count = Column(Integer, default=0)
    
    __table_args__ = (
        UniqueConstraint('hotspot_id', 'record_date', name='uix_hotspot_record_date'),
    )


class GrowHubScriptTask(Base):
    """脚本创作任务 - 热点分析 → 初稿 → 编辑 → 定稿 → 二创变体"""
    __tablename__ = 'growhub_script_tasks'

    id = Column(Integer, primary_key=True)
    hotspot_id = Column(Integer, ForeignKey('growhub_hotspots.id'), nullable=True, index=True)
    user_id = Column(Integer, ForeignKey('growhub_users.id'), nullable=True, index=True)

    title = Column(String(500))
    source_content = Column(Text)
    platform = Column(String(50), default='douyin')
    content_type = Column(String(50), default='video')  # video / image_text / mixed
    style = Column(String(50), default='douyin')

    status = Column(String(30), default='created', index=True)
    # created | analyzing | analyzed | drafting | editing | finalized | variants
    current_step = Column(Integer, default=1)

    analysis_result = Column(JSON)
    final_script = Column(Text)
    variants = Column(JSON)  # [{title, script, angle}]

    brand_keywords = Column(JSON)
    target_topic = Column(String(255))

    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # ── 视频渲染字段 ──────────────────────────────────────────
    video_status = Column(String(20), default='none', index=True)
    # none | preparing | tts | composing | rendering | done | error
    video_path = Column(Text, nullable=True)          # 最终 MP4 文件路径
    video_error = Column(Text, nullable=True)         # 错误信息
    video_project_dir = Column(Text, nullable=True)   # HyperFrames 项目目录
    video_render_started_at = Column(DateTime, nullable=True)
    video_render_done_at = Column(DateTime, nullable=True)

    # ── B-Roll 智能混剪渲染字段 ──────────────────────────────
    broll_video_status = Column(String(20), default='none', index=True)
    broll_video_path = Column(Text, nullable=True)
    broll_video_error = Column(Text, nullable=True)


class GrowHubScriptSegment(Base):
    """脚本分段 - 可逐段编辑与 AI 局部改写"""
    __tablename__ = 'growhub_script_segments'

    id = Column(Integer, primary_key=True)
    task_id = Column(Integer, ForeignKey('growhub_script_tasks.id', ondelete='CASCADE'), nullable=False, index=True)
    order_index = Column(Integer, default=0)

    time_range = Column(String(50))
    narration = Column(Text)
    shot_desc = Column(Text)
    visual_hint = Column(String(255))
    mood = Column(String(100))

    status = Column(String(20), default='pending')  # ok | pending | removed
    version_history = Column(JSON, default=list)

    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class GrowHubRemixSessionMeta(Base):
    """对话式二创会话富元数据（封面/标题/链接/二创摘要）"""
    __tablename__ = 'growhub_remix_session_metas'

    id          = Column(Integer, primary_key=True, autoincrement=True)
    session_id  = Column(String(64), unique=True, nullable=False, index=True)
    # 来源内容信息
    cover_url   = Column(String(500), nullable=True)
    title       = Column(String(400), nullable=True)
    content_url = Column(String(500), nullable=True)
    platform    = Column(String(30),  nullable=True)
    author_name = Column(String(120), nullable=True)
    # 二创生成摘要（前 400 字）
    remix_summary = Column(Text, nullable=True)
    # 完整工作流快照（step、各步文本、done_steps、script_task_id、hotspot）
    workflow_state = Column(JSON, nullable=True)
    created_at  = Column(DateTime, server_default=func.now())
    updated_at  = Column(DateTime, server_default=func.now(), onupdate=func.now())


class GrowHubSystemConfig(Base):
    """GrowHub 全局系统配置表"""
    __tablename__ = 'growhub_system_configs'
    
    config_key = Column(String(100), primary_key=True)
    config_value = Column(JSON, nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

