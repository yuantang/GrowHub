# -*- coding: utf-8 -*-
# GrowHub Project Service - 监控项目管理服务
# 统一管理关键词、调度和通知

import asyncio
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
from pydantic import BaseModel


class ProjectConfig(BaseModel):
    """项目配置模型"""
    name: str
    description: Optional[str] = None
    
    # 关键词
    keywords: List[str] = []
    
    # 平台
    platforms: List[str] = ["xhs"]
    
    # 爬虫配置
    crawler_type: str = "search"
    crawl_limit: int = 20
    enable_comments: bool = True
    
    # 调度配置
    schedule_type: str = "interval"  # interval / cron
    schedule_value: str = "3600"     # 默认1小时
    is_active: bool = False
    
    # 通知配置
    alert_on_negative: bool = True
    alert_on_hotspot: bool = False
    alert_channels: List[str] = []


class ProjectInfo(BaseModel):
    """项目信息（包含运行状态）"""
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
    last_run_at: Optional[datetime]
    next_run_at: Optional[datetime]
    run_count: int
    
    # 统计
    total_crawled: int
    total_alerts: int
    today_crawled: int
    today_alerts: int
    
    created_at: datetime
    updated_at: datetime


class ProjectService:
    """监控项目服务"""
    
    _instance = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance
    
    def __init__(self):
        if self._initialized:
            return
        self._initialized = True
    
    async def create_project(self, config: ProjectConfig) -> Dict[str, Any]:
        """创建监控项目"""
        from database.db_session import get_session
        from database.growhub_models import GrowHubProject
        
        async with get_session() as session:
            project = GrowHubProject(
                name=config.name,
                description=config.description,
                keywords=config.keywords,
                platforms=config.platforms,
                crawler_type=config.crawler_type,
                crawl_limit=config.crawl_limit,
                enable_comments=config.enable_comments,
                schedule_type=config.schedule_type,
                schedule_value=config.schedule_value,
                is_active=False,  # 创建时默认不启动
                alert_on_negative=config.alert_on_negative,
                alert_on_hotspot=config.alert_on_hotspot,
                alert_channels=config.alert_channels,
            )
            session.add(project)
            await session.flush()
            await session.refresh(project)
            
            project_id = project.id
            
            # 如果需要立即启动
            if config.is_active:
                await self._register_scheduler_task(project)
                project.is_active = True
            
            return {
                "id": project_id,
                "name": config.name,
                "message": "项目创建成功"
            }
    
    async def get_project(self, project_id: int) -> Optional[Dict[str, Any]]:
        """获取项目详情"""
        from database.db_session import get_session
        from database.growhub_models import GrowHubProject
        from sqlalchemy import select
        
        async with get_session() as session:
            result = await session.execute(
                select(GrowHubProject).where(GrowHubProject.id == project_id)
            )
            project = result.scalar()
            
            if not project:
                return None
            
            return self._to_dict(project)
    
    async def list_projects(self) -> List[Dict[str, Any]]:
        """获取所有项目列表"""
        from database.db_session import get_session
        from database.growhub_models import GrowHubProject
        from sqlalchemy import select, desc
        
        async with get_session() as session:
            result = await session.execute(
                select(GrowHubProject).order_by(desc(GrowHubProject.updated_at))
            )
            projects = result.scalars().all()
            
            return [self._to_dict(p) for p in projects]
    
    async def update_project(self, project_id: int, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """更新项目配置"""
        from database.db_session import get_session
        from database.growhub_models import GrowHubProject
        from sqlalchemy import select
        
        async with get_session() as session:
            result = await session.execute(
                select(GrowHubProject).where(GrowHubProject.id == project_id)
            )
            project = result.scalar()
            
            if not project:
                return None
            
            # 更新字段
            for key, value in updates.items():
                if hasattr(project, key) and key not in ['id', 'created_at']:
                    setattr(project, key, value)
            
            project.updated_at = datetime.now()
            
            # 如果调度配置变更，需要更新调度器
            schedule_changed = 'schedule_type' in updates or 'schedule_value' in updates
            active_changed = 'is_active' in updates
            
            if schedule_changed or active_changed:
                if project.is_active:
                    await self._unregister_scheduler_task(project)
                    await self._register_scheduler_task(project)
                else:
                    await self._unregister_scheduler_task(project)
            
            return self._to_dict(project)
    
    async def delete_project(self, project_id: int) -> bool:
        """删除项目"""
        from database.db_session import get_session
        from database.growhub_models import GrowHubProject
        from sqlalchemy import select
        
        async with get_session() as session:
            result = await session.execute(
                select(GrowHubProject).where(GrowHubProject.id == project_id)
            )
            project = result.scalar()
            
            if not project:
                return False
            
            # 先取消调度任务
            await self._unregister_scheduler_task(project)
            
            await session.delete(project)
            return True
    
    async def start_project(self, project_id: int) -> Dict[str, Any]:
        """启动项目（开始自动调度）"""
        from database.db_session import get_session
        from database.growhub_models import GrowHubProject
        from sqlalchemy import select
        
        async with get_session() as session:
            result = await session.execute(
                select(GrowHubProject).where(GrowHubProject.id == project_id)
            )
            project = result.scalar()
            
            if not project:
                return {"success": False, "error": "项目不存在"}
            
            if not project.keywords:
                return {"success": False, "error": "请先配置关键词"}
            
            if not project.platforms:
                return {"success": False, "error": "请先选择平台"}
            
            # 注册调度任务
            await self._register_scheduler_task(project)
            project.is_active = True
            project.updated_at = datetime.now()
            
            return {"success": True, "message": "项目已启动"}
    
    async def stop_project(self, project_id: int) -> Dict[str, Any]:
        """停止项目"""
        from database.db_session import get_session
        from database.growhub_models import GrowHubProject
        from sqlalchemy import select
        
        async with get_session() as session:
            result = await session.execute(
                select(GrowHubProject).where(GrowHubProject.id == project_id)
            )
            project = result.scalar()
            
            if not project:
                return {"success": False, "error": "项目不存在"}
            
            await self._unregister_scheduler_task(project)
            project.is_active = False
            project.updated_at = datetime.now()
            
            return {"success": True, "message": "项目已停止"}
    
    async def run_project_now(self, project_id: int) -> Dict[str, Any]:
        """立即运行项目（手动触发一次）"""
        from database.db_session import get_session
        from database.growhub_models import GrowHubProject
        from sqlalchemy import select
        
        async with get_session() as session:
            result = await session.execute(
                select(GrowHubProject).where(GrowHubProject.id == project_id)
            )
            project = result.scalar()
            
            if not project:
                return {"success": False, "error": "项目不存在"}
            
            # 异步执行爬虫任务
            asyncio.create_task(self._execute_project(project_id))
            
            return {"success": True, "message": "任务已开始执行"}
    
    async def _execute_project(self, project_id: int):
        """执行项目爬虫任务"""
        from database.db_session import get_session
        from database.growhub_models import GrowHubProject
        from sqlalchemy import select
        from api.services.crawler_manager import crawler_manager
        from api.schemas import CrawlerStartRequest
        from api.services.account_pool import get_account_pool, AccountPlatform
        
        async with get_session() as session:
            result = await session.execute(
                select(GrowHubProject).where(GrowHubProject.id == project_id)
            )
            project = result.scalar()
            
            if not project:
                print(f"[Project] 项目 {project_id} 不存在")
                return
            
            project.last_run_at = datetime.now()
            project.run_count = (project.run_count or 0) + 1
            
            keywords_str = " ".join(project.keywords or [])
            platforms = project.platforms or ["xhs"]
            
            total_crawled = 0
            
            for platform in platforms:
                # 获取账号
                pool = get_account_pool()
                try:
                    plat_enum = AccountPlatform(platform)
                    account = await pool.get_available_account(plat_enum)
                    if not account:
                        print(f"[Project] 平台 {platform} 没有可用账号")
                        continue
                    
                    cookies = account.cookies
                except Exception as e:
                    print(f"[Project] 获取账号失败: {e}")
                    continue
                
                # 检查爬虫状态
                if crawler_manager.status == "running":
                    print(f"[Project] 爬虫正忙，跳过平台 {platform}")
                    continue
                
                try:
                    config = CrawlerStartRequest(
                        platform=platform,
                        login_type="cookie",
                        crawler_type=project.crawler_type or "search",
                        save_option="sqlite",
                        keywords=keywords_str,
                        cookies=cookies,
                        headless=True,
                        crawl_limit_count=project.crawl_limit or 20,
                        enable_comments=project.enable_comments or True
                    )
                    
                    success = await crawler_manager.start(config)
                    if success:
                        # 等待完成
                        while crawler_manager.status == "running":
                            await asyncio.sleep(2)
                        total_crawled += 1
                        
                except Exception as e:
                    print(f"[Project] 爬虫执行失败: {e}")
            
            # 更新统计
            project.total_crawled = (project.total_crawled or 0) + total_crawled
            project.today_crawled = (project.today_crawled or 0) + total_crawled
            
            # 计算下次运行时间
            if project.is_active and project.schedule_type == "interval":
                try:
                    interval = int(project.schedule_value)
                    project.next_run_at = datetime.now() + timedelta(seconds=interval)
                except:
                    pass
    
    async def _register_scheduler_task(self, project):
        """注册调度任务"""
        from api.services.scheduler import get_scheduler, ScheduledTask, TaskType
        
        scheduler = get_scheduler()
        
        task = ScheduledTask(
            id="",
            name=f"[项目] {project.name}",
            task_type=TaskType.CRAWLER,
            description=f"监控项目自动任务: {project.name}",
            params={
                "project_id": project.id,
                "platforms": project.platforms,
                "keywords": project.keywords,
                "crawler_type": project.crawler_type,
                "limit_count": project.crawl_limit,
            }
        )
        
        if project.schedule_type == "interval":
            try:
                task.interval_seconds = int(project.schedule_value)
            except:
                task.interval_seconds = 3600
        elif project.schedule_type == "cron":
            task.cron_expression = project.schedule_value
        
        created_task = await scheduler.add_task(task)
        project.scheduler_task_id = created_task.id
        project.next_run_at = created_task.next_run
        
        print(f"[Project] 已注册调度任务: {project.name} (ID: {created_task.id})")
    
    async def _unregister_scheduler_task(self, project):
        """取消调度任务"""
        if not project.scheduler_task_id:
            return
        
        from api.services.scheduler import get_scheduler
        
        scheduler = get_scheduler()
        await scheduler.delete_task(project.scheduler_task_id)
        project.scheduler_task_id = None
        project.next_run_at = None
        
        print(f"[Project] 已取消调度任务: {project.name}")
    
    def _to_dict(self, project) -> Dict[str, Any]:
        """转换为字典"""
        return {
            "id": project.id,
            "name": project.name,
            "description": project.description,
            "keywords": project.keywords or [],
            "platforms": project.platforms or [],
            "crawler_type": project.crawler_type,
            "crawl_limit": project.crawl_limit,
            "enable_comments": project.enable_comments,
            "schedule_type": project.schedule_type,
            "schedule_value": project.schedule_value,
            "is_active": project.is_active,
            "alert_on_negative": project.alert_on_negative,
            "alert_on_hotspot": project.alert_on_hotspot,
            "alert_channels": project.alert_channels or [],
            "last_run_at": project.last_run_at.isoformat() if project.last_run_at else None,
            "next_run_at": project.next_run_at.isoformat() if project.next_run_at else None,
            "run_count": project.run_count or 0,
            "total_crawled": project.total_crawled or 0,
            "total_alerts": project.total_alerts or 0,
            "today_crawled": project.today_crawled or 0,
            "today_alerts": project.today_alerts or 0,
            "created_at": project.created_at.isoformat() if project.created_at else None,
            "updated_at": project.updated_at.isoformat() if project.updated_at else None,
        }


# 全局实例
project_service = ProjectService()


def get_project_service() -> ProjectService:
    """获取项目服务实例"""
    return project_service
