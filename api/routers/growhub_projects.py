# -*- coding: utf-8 -*-
# GrowHub Project API - 监控项目管理接口
# 统一管理关键词、调度和通知

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any, Union
from datetime import datetime

router = APIRouter(prefix="/growhub/projects", tags=["GrowHub - 监控项目"])


# ==================== Pydantic Models ====================

class ProjectCreateRequest(BaseModel):
    """创建项目请求"""
    name: str = Field(..., min_length=1, max_length=255, description="项目名称")
    description: Optional[str] = Field(None, description="项目描述")
    
    # 关键词
    keywords: List[str] = Field(default=[], description="监控关键词列表")
    sentiment_keywords: List[str] = Field(default=[], description="自定义舆情词列表")
    
    # 任务目的 (驱动数据分流)
    purpose: str = Field(default="general", description="任务目的: creator/hotspot/sentiment/general")
    
    # 平台
    platforms: List[str] = Field(default=["xhs"], description="监控平台列表")
    
    # 爬虫配置
    crawler_type: str = Field(default="search", description="爬虫类型: search/detail/creator")
    crawl_limit: int = Field(default=20, ge=1, le=100, description="每次抓取数量")
    crawl_date_range: int = Field(default=7, ge=0, description="爬取时间范围（天），0为不限")
    enable_comments: bool = Field(default=True, description="是否抓取评论")
    deduplicate_authors: bool = Field(default=False, description="是否博主去重")
    max_concurrency: int = Field(default=3, ge=1, le=10, description="最大并发数")
    
    # 调度配置
    schedule_type: str = Field(default="interval", description="调度类型: interval/cron")
    schedule_value: str = Field(default="3600", description="调度参数: 间隔秒数或cron表达式")
    auto_start: bool = Field(default=False, description="创建后立即启动")
    
    # 通知配置
    alert_on_negative: bool = Field(default=True, description="负面内容预警")
    alert_on_new_content: bool = Field(default=False, description="新内容更新通知")
    alert_on_hotspot: bool = Field(default=False, description="热点内容推送")
    alert_channels: List[Union[str, int]] = Field(default=[], description="通知渠道")
    
    # 高级过滤
    min_likes: int = Field(default=0, ge=0, description="最小点赞数")
    max_likes: int = Field(default=0, ge=0, description="最大点赞数,0=不限")
    min_comments: int = Field(default=0, ge=0, description="最小评论数")
    max_comments: int = Field(default=0, ge=0, description="最大评论数,0=不限")
    min_shares: int = Field(default=0, ge=0, description="最小分享数")
    max_shares: int = Field(default=0, ge=0, description="最大分享数,0=不限")
    min_favorites: int = Field(default=0, ge=0, description="最小收藏数")
    max_favorites: int = Field(default=0, ge=0, description="最大收藏数,0=不限")
    
    # 博主筛选
    min_fans: int = Field(default=0, ge=0, description="博主最小粉丝数")
    max_fans: int = Field(default=0, ge=0, description="博主最大粉丝数,0=不限")
    require_contact: bool = Field(default=False, description="是否要求有联系方式")


class ProjectUpdateRequest(BaseModel):
    """更新项目请求"""
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    keywords: Optional[List[str]] = None
    sentiment_keywords: Optional[List[str]] = None
    purpose: Optional[str] = Field(None, description="任务目的: creator/hotspot/sentiment/general")
    platforms: Optional[List[str]] = None
    crawler_type: Optional[str] = None
    crawl_limit: Optional[int] = Field(None, ge=1, le=100)
    crawl_date_range: Optional[int] = Field(None, ge=0)
    enable_comments: Optional[bool] = None
    deduplicate_authors: Optional[bool] = None
    max_concurrency: Optional[int] = Field(None, ge=1, le=10)

    schedule_type: Optional[str] = None
    schedule_value: Optional[str] = None
    alert_on_negative: Optional[bool] = None
    alert_on_new_content: Optional[bool] = None
    alert_on_hotspot: Optional[bool] = None
    alert_channels: Optional[List[Union[str, int]]] = None
    is_active: Optional[bool] = None
    # 高级过滤
    min_likes: Optional[int] = Field(None, ge=0)
    max_likes: Optional[int] = Field(None, ge=0)
    min_comments: Optional[int] = Field(None, ge=0)
    max_comments: Optional[int] = Field(None, ge=0)
    min_shares: Optional[int] = Field(None, ge=0)
    max_shares: Optional[int] = Field(None, ge=0)
    min_favorites: Optional[int] = Field(None, ge=0)
    max_favorites: Optional[int] = Field(None, ge=0)
    # 博主筛选
    min_fans: Optional[int] = Field(None, ge=0)
    max_fans: Optional[int] = Field(None, ge=0)
    require_contact: Optional[bool] = None


class ProjectResponse(BaseModel):
    """项目响应"""
    id: int
    name: str
    description: Optional[str]
    keywords: List[str]
    sentiment_keywords: Optional[List[str]] = []
    platforms: List[str]
    purpose: str = "general"  # 任务目的
    crawler_type: str
    crawl_limit: int
    crawl_date_range: int = 7
    enable_comments: bool
    deduplicate_authors: bool = False
    max_concurrency: int = 3
    schedule_type: str
    schedule_value: str
    is_active: bool
    alert_on_negative: bool
    alert_on_new_content: bool = False
    alert_on_hotspot: bool
    alert_channels: List[Union[str, int]] = []
    # 高级过滤
    min_likes: int = 0
    max_likes: int = 0
    min_comments: int = 0
    max_comments: int = 0
    min_shares: int = 0
    max_shares: int = 0
    min_favorites: int = 0
    max_favorites: int = 0
    # 博主筛选
    min_fans: int = 0
    max_fans: int = 0
    require_contact: bool = False
    
    # 运行状态
    last_run_at: Optional[str]
    next_run_at: Optional[str]
    run_count: int
    
    # 统计
    total_crawled: int
    total_alerts: int
    today_crawled: int
    today_alerts: int
    
    created_at: Optional[str]
    updated_at: Optional[str]


# ==================== API Endpoints ====================

@router.get("/dashboard/stats")
async def get_dashboard_stats():
    """获取全局看板统计数据"""
    from api.services.project import get_project_service
    from database.db_session import get_session
    from database.growhub_models import GrowHubProject, GrowHubContent, GrowHubNotification
    from sqlalchemy import select, func, and_
    from datetime import datetime, timedelta
    
    service = get_project_service()
    projects = await service.list_projects()
    
    # 计算统计
    running_count = sum(1 for p in projects if p.get("is_active"))
    today_crawled = sum(p.get("today_crawled", 0) for p in projects)
    today_alerts = sum(p.get("today_alerts", 0) for p in projects)
    total_crawled = sum(p.get("total_crawled", 0) for p in projects)
    
    # 获取最近7天趋势（简化版，基于项目统计）
    trend_data = []
    for i in range(6, -1, -1):
        date = (datetime.now() - timedelta(days=i)).strftime("%m-%d")
        # 简化：均匀分布历史数据
        trend_data.append({
            "date": date,
            "crawled": total_crawled // 7 if i > 0 else today_crawled,
            "alerts": today_alerts if i == 0 else 0
        })
    
    # 项目状态列表（前5个）
    project_status = []
    for p in projects[:5]:
        project_status.append({
            "id": p.get("id"),
            "name": p.get("name"),
            "is_active": p.get("is_active"),
            "today_crawled": p.get("today_crawled", 0),
            "today_alerts": p.get("today_alerts", 0),
        })
    
    return {
        "running_projects": running_count,
        "total_projects": len(projects),
        "today_crawled": today_crawled,
        "today_alerts": today_alerts,
        "total_crawled": total_crawled,
        "pending_alerts": today_alerts,  # 简化：待处理 = 今日预警
        "trend": trend_data,
        "project_status": project_status,
    }


@router.get("", response_model=List[ProjectResponse])
async def list_projects():
    """获取所有监控项目"""
    from api.services.project import get_project_service
    
    service = get_project_service()
    projects = await service.list_projects()
    return projects


@router.post("")
async def create_project(data: ProjectCreateRequest):
    """创建监控项目"""
    from api.services.project import get_project_service, ProjectConfig
    
    service = get_project_service()
    
    config = ProjectConfig(
        name=data.name,
        description=data.description,
        keywords=data.keywords,
        sentiment_keywords=data.sentiment_keywords,
        platforms=data.platforms,
        crawler_type=data.crawler_type,
        crawl_limit=data.crawl_limit,
        crawl_date_range=data.crawl_date_range,
        enable_comments=data.enable_comments,
        deduplicate_authors=data.deduplicate_authors,
        min_likes=data.min_likes,
        max_likes=data.max_likes,
        min_comments=data.min_comments,
        max_comments=data.max_comments,
        min_shares=data.min_shares,
        max_shares=data.max_shares,
        min_favorites=data.min_favorites,
        max_favorites=data.max_favorites,
        min_fans=data.min_fans,
        max_fans=data.max_fans,
        require_contact=data.require_contact,
        schedule_type=data.schedule_type,
        schedule_value=data.schedule_value,
        is_active=data.auto_start,
        alert_on_negative=data.alert_on_negative,
        alert_on_new_content=data.alert_on_new_content,
        alert_on_hotspot=data.alert_on_hotspot,
        alert_channels=data.alert_channels,
        purpose=data.purpose,
        max_concurrency=data.max_concurrency,
    )
    
    result = await service.create_project(config)
    return result


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(project_id: int):
    """获取项目详情"""
    from api.services.project import get_project_service
    
    service = get_project_service()
    project = await service.get_project(project_id)
    
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    
    return project


@router.put("/{project_id}")
async def update_project(project_id: int, data: ProjectUpdateRequest):
    """更新项目配置"""
    from api.services.project import get_project_service
    
    service = get_project_service()
    
    updates = data.model_dump(exclude_unset=True)
    result = await service.update_project(project_id, updates)
    
    if not result:
        raise HTTPException(status_code=404, detail="项目不存在")
    
    return {"message": "更新成功", "project": result}


@router.delete("/{project_id}")
async def delete_project(project_id: int):
    """删除项目"""
    from api.services.project import get_project_service
    
    service = get_project_service()
    success = await service.delete_project(project_id)
    
    if not success:
        raise HTTPException(status_code=404, detail="项目不存在")
    
    return {"message": "项目已删除"}


@router.post("/{project_id}/start")
async def start_project(project_id: int):
    """启动项目（开始自动调度）"""
    from api.services.project import get_project_service
    
    service = get_project_service()
    result = await service.start_project(project_id)
    
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error"))
    
    return result


@router.post("/{project_id}/stop")
async def stop_project(project_id: int):
    """停止项目"""
    from api.services.project import get_project_service
    
    service = get_project_service()
    result = await service.stop_project(project_id)
    
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error"))
    
    return result


@router.get("/{project_id}/preflight")
async def check_project_preflight(project_id: int):
    """
    执行前置检查 - 检查项目是否具备运行条件
    返回所有必要条件的状态，帮助用户了解缺少什么配置
    """
    from api.services.project import get_project_service
    from api.services.account_pool import get_account_pool, AccountPlatform, AccountStatus
    import os
    
    service = get_project_service()
    project = await service.get_project(project_id)
    
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    
    checks = []
    blocking_issues = 0
    
    # 1. 检查关键词配置
    keywords = project.get("keywords", [])
    if keywords and len(keywords) > 0:
        checks.append({
            "name": "keywords",
            "label": "关键词配置",
            "status": "pass",
            "message": f"已配置 {len(keywords)} 个关键词",
            "blocking": False
        })
    else:
        checks.append({
            "name": "keywords",
            "label": "关键词配置",
            "status": "fail",
            "message": "未配置关键词，请先添加监控关键词",
            "blocking": True
        })
        blocking_issues += 1
    
    # 2. 检查平台账号配置
    platforms = project.get("platforms", [])
    platform_names = {
        "xhs": "小红书",
        "douyin": "抖音", 
        "bilibili": "B站",
        "weibo": "微博",
        "zhihu": "知乎"
    }
    
    try:
        account_pool = get_account_pool()
        for platform in platforms:
            # 获取该平台的所有账号
            try:
                platform_enum = AccountPlatform(platform)
                all_accounts = await account_pool.get_all_accounts(platform_enum)
                active_accounts = [a for a in all_accounts if a.status == AccountStatus.ACTIVE]
            except:
                all_accounts = []
                active_accounts = []
            
            platform_label = platform_names.get(platform, platform)
            
            if active_accounts:
                checks.append({
                    "name": f"account_{platform}",
                    "label": f"{platform_label}账号",
                    "status": "pass",
                    "message": f"找到 {len(active_accounts)} 个可用账号",
                    "blocking": False
                })
            else:
                checks.append({
                    "name": f"account_{platform}",
                    "label": f"{platform_label}账号",
                    "status": "fail",
                    "message": f"未配置{platform_label}账号，请前往账号池添加",
                    "blocking": True,
                    "action": {
                        "label": "前往配置",
                        "url": "/account-pool"
                    }
                })
                blocking_issues += 1

    except Exception as e:
        # 账号服务不可用时的兜底
        checks.append({
            "name": "account_service",
            "label": "账号服务",
            "status": "warn",
            "message": f"账号服务暂时不可用: {str(e)}",
            "blocking": False
        })
    
    # 3. 检查爬虫模块
    crawler_path = os.path.join(os.path.dirname(__file__), "../../MediaCrawler")
    has_crawler = os.path.exists(crawler_path) or os.path.exists("MediaCrawler")
    
    if has_crawler:
        checks.append({
            "name": "crawler",
            "label": "爬虫模块",
            "status": "pass",
            "message": "MediaCrawler 模块正常",
            "blocking": False
        })
    else:
        checks.append({
            "name": "crawler",
            "label": "爬虫模块",
            "status": "warn",
            "message": "未检测到 MediaCrawler，将使用模拟数据",
            "blocking": False
        })
    
    # 4. 检查调度配置
    schedule_type = project.get("schedule_type", "interval")
    schedule_value = project.get("schedule_value", "3600")
    
    if schedule_type and schedule_value:
        if schedule_type == "interval":
            interval_sec = int(schedule_value)
            interval_desc = f"每 {interval_sec // 3600} 小时" if interval_sec >= 3600 else f"每 {interval_sec // 60} 分钟"
            checks.append({
                "name": "schedule",
                "label": "调度配置",
                "status": "pass",
                "message": f"已配置 {interval_desc} 执行一次",
                "blocking": False
            })
        else:
            checks.append({
                "name": "schedule",
                "label": "调度配置",
                "status": "pass",
                "message": f"Cron: {schedule_value}",
                "blocking": False
            })
    else:
        checks.append({
            "name": "schedule",
            "label": "调度配置",
            "status": "warn",
            "message": "未配置调度，仅支持手动执行",
            "blocking": False
        })
    
    # 计算整体状态
    can_run = blocking_issues == 0
    overall_status = "ready" if can_run else "blocked"
    
    return {
        "project_id": project_id,
        "project_name": project.get("name"),
        "can_run": can_run,
        "overall_status": overall_status,
        "blocking_issues": blocking_issues,
        "checks": checks,
        "message": "所有条件满足，可以执行" if can_run else f"有 {blocking_issues} 项必要条件未满足"
    }


@router.post("/{project_id}/run")
async def run_project_now(project_id: int):
    """立即运行项目"""
    from api.services.project import get_project_service
    
    service = get_project_service()
    result = await service.run_project_now(project_id)
    
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error"))
    
    return result


@router.get("/{project_id}/logs")
async def get_project_logs(project_id: int):
    """获取项目最近的运行日志"""
    from api.services.project import get_project_service
    service = get_project_service()
    logs = await service.get_project_logs(project_id)
    return {"logs": logs}


@router.get("/templates/list")
async def get_project_templates():
    """获取项目模板"""
    return {
        "templates": [
            {
                "id": "brand_monitor",
                "name": "品牌舆情监控",
                "description": "监控品牌相关内容，发现负面预警",
                "config": {
                    "platforms": ["xhs", "douyin"],
                    "schedule_type": "interval",
                    "schedule_value": "3600",
                    "alert_on_negative": True,
                    "alert_on_hotspot": False
                }
            },
            {
                "id": "competitor_track",
                "name": "竞品动态追踪",
                "description": "追踪竞品相关内容和热点",
                "config": {
                    "platforms": ["xhs", "douyin", "weibo"],
                    "schedule_type": "interval",
                    "schedule_value": "7200",
                    "alert_on_negative": False,
                    "alert_on_hotspot": True
                }
            },
            {
                "id": "hotspot_discovery",
                "name": "热点发现",
                "description": "发现行业热点内容",
                "config": {
                    "platforms": ["xhs", "douyin", "bilibili"],
                    "schedule_type": "interval",
                    "schedule_value": "1800",
                    "alert_on_negative": False,
                    "alert_on_hotspot": True
                }
            }
        ]
    }


@router.get("/platforms/options")
async def get_platform_options():
    """获取可用平台选项"""
    return {
        "platforms": [
            {"value": "xhs", "label": "小红书", "icon": "📕"},
            {"value": "dy", "label": "抖音", "icon": "🎵"},
            {"value": "bili", "label": "B站", "icon": "📺"},
            {"value": "wb", "label": "微博", "icon": "📱"},
            {"value": "ks", "label": "快手", "icon": "📹"},
            {"value": "zhihu", "label": "知乎", "icon": "❓"},
        ]
    }


@router.get("/schedule/presets")
async def get_schedule_presets():
    """获取调度预设"""
    return {
        "interval_presets": [
            {"value": "1800", "label": "每30分钟"},
            {"value": "3600", "label": "每1小时"},
            {"value": "7200", "label": "每2小时"},
            {"value": "21600", "label": "每6小时"},
            {"value": "43200", "label": "每12小时"},
            {"value": "86400", "label": "每天"},
        ],
        "cron_presets": [
            {"value": "0 9 * * *", "label": "每天早上9点"},
            {"value": "0 9,18 * * *", "label": "每天早9点晚6点"},
            {"value": "0 * * * *", "label": "每小时整点"},
            {"value": "0 9 * * 1", "label": "每周一早上9点"},
        ]
    }


@router.get("/{project_id}/contents")
async def get_project_contents(
    project_id: int, 
    page: int = Query(1, ge=1), 
    page_size: int = Query(20, ge=1, le=100),
    platform: Optional[str] = None,
    sentiment: Optional[str] = None,
    deduplicate_authors: Optional[bool] = None
):
    """获取项目内容列表"""
    from api.services.project import get_project_service
    
    service = get_project_service()
    
    filters = {}
    if platform:
        filters["platform"] = platform
    if sentiment:
        filters["sentiment"] = sentiment
    if deduplicate_authors is not None:
        filters["deduplicate_authors"] = deduplicate_authors
        
    result = await service.get_project_contents(project_id, page, page_size, filters)
    
    if "error" in result:
         raise HTTPException(status_code=404, detail=result["error"])
         
    return result


@router.get("/{project_id}/stats-chart")
async def get_project_stats_chart(project_id: int, days: int = Query(7, ge=1, le=30)):
    """获取项目统计图表数据"""
    from api.services.project import get_project_service
    
    service = get_project_service()
    result = await service.get_project_stats_chart(project_id, days)
    
    return result
