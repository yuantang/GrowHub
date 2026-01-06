# -*- coding: utf-8 -*-
# GrowHub Project API - 监控项目管理接口
# 统一管理关键词、调度和通知

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime

router = APIRouter(prefix="/growhub/projects", tags=["GrowHub - 监控项目"])


# ==================== Pydantic Models ====================

class ProjectCreateRequest(BaseModel):
    """创建项目请求"""
    name: str = Field(..., min_length=1, max_length=255, description="项目名称")
    description: Optional[str] = Field(None, description="项目描述")
    
    # 关键词
    keywords: List[str] = Field(default=[], description="监控关键词列表")
    
    # 平台
    platforms: List[str] = Field(default=["xhs"], description="监控平台列表")
    
    # 爬虫配置
    crawler_type: str = Field(default="search", description="爬虫类型: search/detail/creator")
    crawl_limit: int = Field(default=20, ge=1, le=100, description="每次抓取数量")
    enable_comments: bool = Field(default=True, description="是否抓取评论")
    
    # 调度配置
    schedule_type: str = Field(default="interval", description="调度类型: interval/cron")
    schedule_value: str = Field(default="3600", description="调度参数: 间隔秒数或cron表达式")
    auto_start: bool = Field(default=False, description="创建后立即启动")
    
    # 通知配置
    alert_on_negative: bool = Field(default=True, description="负面内容预警")
    alert_on_hotspot: bool = Field(default=False, description="热点内容推送")
    alert_channels: List[str] = Field(default=[], description="通知渠道")


class ProjectUpdateRequest(BaseModel):
    """更新项目请求"""
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    keywords: Optional[List[str]] = None
    platforms: Optional[List[str]] = None
    crawler_type: Optional[str] = None
    crawl_limit: Optional[int] = Field(None, ge=1, le=100)
    enable_comments: Optional[bool] = None
    schedule_type: Optional[str] = None
    schedule_value: Optional[str] = None
    alert_on_negative: Optional[bool] = None
    alert_on_hotspot: Optional[bool] = None
    alert_channels: Optional[List[str]] = None


class ProjectResponse(BaseModel):
    """项目响应"""
    id: int
    name: str
    description: Optional[str]
    keywords: List[str]
    platforms: List[str]
    crawler_type: str
    crawl_limit: int
    enable_comments: bool
    schedule_type: str
    schedule_value: str
    is_active: bool
    alert_on_negative: bool
    alert_on_hotspot: bool
    alert_channels: List[str]
    
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
        platforms=data.platforms,
        crawler_type=data.crawler_type,
        crawl_limit=data.crawl_limit,
        enable_comments=data.enable_comments,
        schedule_type=data.schedule_type,
        schedule_value=data.schedule_value,
        is_active=data.auto_start,
        alert_on_negative=data.alert_on_negative,
        alert_on_hotspot=data.alert_on_hotspot,
        alert_channels=data.alert_channels,
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


@router.post("/{project_id}/run")
async def run_project_now(project_id: int):
    """立即运行项目"""
    from api.services.project import get_project_service
    
    service = get_project_service()
    result = await service.run_project_now(project_id)
    
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error"))
    
    return result


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
            {"value": "douyin", "label": "抖音", "icon": "🎵"},
            {"value": "bilibili", "label": "B站", "icon": "📺"},
            {"value": "weibo", "label": "微博", "icon": "📱"},
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
