# -*- coding: utf-8 -*-
# GrowHub Project Service - 监控项目管理服务
# 统一管理关键词、调度和通知

import asyncio
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional, Any
from pydantic import BaseModel
from ..services.account_pool import AccountStatus


class ProjectConfig(BaseModel):
    """项目配置模型"""
    name: str
    description: Optional[str] = None
    
    # 关键词
    keywords: List[str] = []
    # 舆情词
    sentiment_keywords: List[str] = []
    
    # 平台
    platforms: List[str] = ["xhs"]
    
    # 爬虫配置
    crawler_type: str = "search"
    crawl_limit: int = 20
    crawl_date_range: int = 7
    enable_comments: bool = True
    deduplicate_authors: bool = False
    max_concurrency: int = 3  # 最大并发数 (Pro 版特性)
    
    # 高级过滤器 - 内容
    min_likes: int = 0
    max_likes: int = 0
    min_comments: int = 0
    max_comments: int = 0
    min_shares: int = 0
    max_shares: int = 0
    min_favorites: int = 0
    max_favorites: int = 0
    
    # 高级过滤器 - 博主
    min_fans: int = 0
    max_fans: int = 0
    require_contact: bool = False
    
    # 调度配置
    schedule_type: str = "interval"  # interval / cron
    schedule_value: str = "3600"     # 默认1小时
    is_active: bool = False
    
    # 通知配置
    alert_on_negative: bool = True
    alert_on_new_content: bool = False
    alert_on_hotspot: bool = False
    alert_channels: List[str] = []
    
    # 任务目的
    purpose: str = "general"
    
    # 插件配置
    use_plugin: bool = False  # 优先使用浏览器插件采集


class ProjectInfo(BaseModel):
    """项目信息（包含运行状态）"""
    id: int
    name: str
    description: Optional[str]
    keywords: List[str]
    sentiment_keywords: List[str] = []
    platforms: List[str]
    crawler_type: str
    crawl_limit: int
    enable_comments: bool
    deduplicate_authors: bool
    max_concurrency: int
    schedule_type: str
    schedule_value: str
    is_active: bool
    alert_on_negative: bool
    alert_on_hotspot: bool
    alert_channels: List[str]
    use_plugin: bool = False
    
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
    
    async def get_project_logs(self, project_id: int, limit: int = 100) -> List[str]:
        """获取项目运行日志"""
        return self._project_logs.get(project_id, [])[-limit:]

    def append_log(self, project_id: int, message: str):
        """添加日志"""
        if project_id not in self._project_logs:
            self._project_logs[project_id] = []
        
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        log_entry = f"[{timestamp}] {message}"
        self._project_logs[project_id].append(log_entry)
        # 保持最新的 1000 条
        if len(self._project_logs[project_id]) > 1000:
            self._project_logs[project_id] = self._project_logs[project_id][-1000:]
        print(f"[Project-{project_id}] {message}")  # 保留控制台输出

    def __init__(self):
        if self._initialized:
            return
        self._initialized = True
        self._project_logs: Dict[int, List[str]] = {}
    
    async def sync_active_projects_to_scheduler(self):
        """Startup sync: Register all active projects with scheduler (after server restart)"""
        from database.db_session import get_session
        from database.growhub_models import GrowHubProject
        from sqlalchemy import select
        
        async with get_session() as session:
            result = await session.execute(
                select(GrowHubProject).where(GrowHubProject.is_active == True)
            )
            active_projects = result.scalars().all()
            
            registered_count = 0
            for project in active_projects:
                try:
                    await self._register_scheduler_task(project)
                    registered_count += 1
                except Exception as e:
                    print(f"[Scheduler Sync] Failed to register project {project.id}: {e}")
            
            print(f"[Scheduler Sync] Registered {registered_count}/{len(active_projects)} active projects")
    
    async def create_project(self, config: ProjectConfig, user_id: int = None) -> Dict[str, Any]:
        """创建监控项目"""
        from database.db_session import get_session
        from database.growhub_models import GrowHubProject
        
        async with get_session() as session:
            project = GrowHubProject(
                user_id=user_id,
                name=config.name,
                description=config.description,
                keywords=config.keywords,
                sentiment_keywords=config.sentiment_keywords,
                platforms=config.platforms,
                crawler_type=config.crawler_type,
                crawl_limit=config.crawl_limit,
                crawl_date_range=config.crawl_date_range,
                enable_comments=config.enable_comments,
                deduplicate_authors=config.deduplicate_authors,
                min_likes=config.min_likes,
                max_likes=config.max_likes,
                min_comments=config.min_comments,
                max_comments=config.max_comments,
                min_shares=config.min_shares,
                max_shares=config.max_shares,
                min_favorites=config.min_favorites,
                max_favorites=config.max_favorites,
                min_fans=config.min_fans,
                max_fans=config.max_fans,
                require_contact=config.require_contact,
                schedule_type=config.schedule_type,
                schedule_value=config.schedule_value,
                is_active=False,  # 创建时默认不启动
                alert_on_negative=config.alert_on_negative,
                alert_on_new_content=config.alert_on_new_content,
                alert_on_hotspot=config.alert_on_hotspot,
                alert_channels=config.alert_channels,
                purpose=config.purpose,
                max_concurrency=config.max_concurrency,
                use_plugin=config.use_plugin,
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
    
    async def get_project(self, project_id: int, user_id: int = None) -> Optional[Dict[str, Any]]:
        """获取项目详情"""
        from database.db_session import get_session
        from database.growhub_models import GrowHubProject
        from sqlalchemy import select
        
        async with get_session() as session:
            query = select(GrowHubProject).where(GrowHubProject.id == project_id)
            if user_id is not None:
                query = query.where(GrowHubProject.user_id == user_id)
            
            result = await session.execute(query)
            project = result.scalar()
            if not project:
                return None
            
            # Fetch latest checkpoint info
            from checkpoint.manager import get_checkpoint_manager
            from database.growhub_models import GrowHubCheckpoint
            from sqlalchemy import desc
            
            cp_result = await session.execute(
                select(GrowHubCheckpoint)
                .where(GrowHubCheckpoint.project_id == project_id)
                .order_by(desc(GrowHubCheckpoint.updated_at))
                .limit(1)
            )
            latest_cp = cp_result.scalar()
            
            project_dict = self._to_dict(project)
            if latest_cp:
                project_dict["latest_checkpoint"] = {
                    "task_id": latest_cp.id,
                    "status": latest_cp.status.value if hasattr(latest_cp.status, 'value') else latest_cp.status,
                    "total_notes": latest_cp.total_notes_fetched,
                    "total_comments": latest_cp.total_comments_fetched,
                    "total_errors": latest_cp.total_errors,
                    "current_page": latest_cp.current_page,
                    "last_update": latest_cp.updated_at.isoformat() if latest_cp.updated_at else None
                }
            else:
                project_dict["latest_checkpoint"] = None
                
            return project_dict

    
    async def list_projects(self, user_id: int = None) -> List[Dict[str, Any]]:
        """获取所有项目列表"""
        from database.db_session import get_session
        from database.growhub_models import GrowHubProject
        from sqlalchemy import select, desc
        
        async with get_session() as session:
            query = select(GrowHubProject)
            if user_id is not None:
                query = query.where(GrowHubProject.user_id == user_id)
            query = query.order_by(desc(GrowHubProject.updated_at))
            
            result = await session.execute(query)
            projects = result.scalars().all()
            
            return [self._to_dict(p) for p in projects]
    
    async def update_project(self, project_id: int, updates: Dict[str, Any], user_id: int = None) -> Optional[Dict[str, Any]]:
        """更新项目配置"""
        from database.db_session import get_session
        from database.growhub_models import GrowHubProject
        from sqlalchemy import select
        
        async with get_session() as session:
            query = select(GrowHubProject).where(GrowHubProject.id == project_id)
            if user_id is not None:
                query = query.where(GrowHubProject.user_id == user_id)
            result = await session.execute(query)
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
            
            # Commit changes to database
            await session.commit()
            
            return self._to_dict(project)
    
    async def delete_project(self, project_id: int, user_id: int = None) -> bool:
        """删除项目"""
        from database.db_session import get_session
        from database.growhub_models import GrowHubProject
        from sqlalchemy import select
        
        async with get_session() as session:
            query = select(GrowHubProject).where(GrowHubProject.id == project_id)
            if user_id is not None:
                query = query.where(GrowHubProject.user_id == user_id)
            result = await session.execute(query)
            project = result.scalar()
            
            if not project:
                return False
            
            # 先取消调度任务
            await self._unregister_scheduler_task(project)
            
            await session.delete(project)
            return True
    
    async def start_project(self, project_id: int, user_id: int = None) -> Dict[str, Any]:
        """启动项目（开始自动调度）"""
        from database.db_session import get_session
        from database.growhub_models import GrowHubProject
        from sqlalchemy import select
        
        async with get_session() as session:
            query = select(GrowHubProject).where(GrowHubProject.id == project_id)
            if user_id is not None:
                query = query.where(GrowHubProject.user_id == user_id)
            result = await session.execute(query)
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
    
    async def stop_project(self, project_id: int, user_id: int = None) -> Dict[str, Any]:
        """停止项目"""
        from database.db_session import get_session
        from database.growhub_models import GrowHubProject
        from sqlalchemy import select
        
        async with get_session() as session:
            query = select(GrowHubProject).where(GrowHubProject.id == project_id)
            if user_id is not None:
                query = query.where(GrowHubProject.user_id == user_id)
            result = await session.execute(query)
            project = result.scalar()
            
            if not project:
                return {"success": False, "error": "项目不存在"}
            
            await self._unregister_scheduler_task(project)
            project.is_active = False
            project.updated_at = datetime.now()
            
            return {"success": True, "message": "项目已停止"}
    
    async def run_project_now(self, project_id: int, user_id: int = None) -> Dict[str, Any]:
        """立即运行项目（手动触发一次）"""
        from database.db_session import get_session
        from database.growhub_models import GrowHubProject
        from sqlalchemy import select
        
        async with get_session() as session:
            query = select(GrowHubProject).where(GrowHubProject.id == project_id)
            if user_id is not None:
                query = query.where(GrowHubProject.user_id == user_id)
            result = await session.execute(query)
            project = result.scalar()
            
            if not project:
                return {"success": False, "error": "项目不存在"}
            
            # 异步执行爬虫任务
            asyncio.create_task(self.execute_project(project_id))
            
            return {"success": True, "message": "任务已开始执行"}
    
    async def execute_project(self, project_id: int):
        """执行项目爬虫任务"""
        from database.db_session import get_session
        from database.growhub_models import GrowHubProject
        from sqlalchemy import select
        from api.services.crawler_manager import crawler_manager
        from api.schemas import CrawlerStartRequest
        from api.services.account_pool import get_account_pool, AccountPlatform
        from tools import utils  # Add missing import
        
        # 调试日志：确认进入执行函数
        utils.logger.info(f"[Project-{project_id}] 进入 execute_project 任务执行器")
        
        try:
            async with get_session() as session:
                result = await session.execute(
                    select(GrowHubProject).where(GrowHubProject.id == project_id)
                )
                project = result.scalar()
                
                if not project:
                    utils.logger.error(f"[Project-{project_id}] 项目不存在")
                    return
                
                utils.logger.info(f"[Project-{project_id}] 正在更新最后运行时间...")
                project.last_run_at = datetime.now()
                project.run_count = (project.run_count or 0) + 1
                await session.commit()
                
                # 初始化日志
                self._project_logs[project_id] = []
                self.append_log(project_id, f"开始执行任务: {project.name}")
                self.append_log(project_id, f"关键词: {project.keywords}")
            # Explicitly log sentiment keywords
            self.append_log(project_id, f"舆情词: {project.sentiment_keywords or '无'}")
            
            keywords_str = ",".join(project.keywords or [])
            platforms = project.platforms or ["xhs"]
            
            total_crawled_items = 0
            # start_time_utc for DB queries, start_time_local for duration logging
            start_time_utc = datetime.now(timezone.utc).replace(tzinfo=None)
            start_time_local = datetime.now()
            
            # ===== Plugin-based Execution Path =====
            # Check if project prefers plugin and if a plugin is online
            if getattr(project, 'use_plugin', False):
                self.append_log(project_id, "项目配置为优先使用浏览器插件采集")
                
                try:
                    from api.services.plugin_crawler_service import get_plugin_crawler_service
                    from api.routers.plugin_websocket import get_plugin_manager
                    
                    plugin_service = get_plugin_crawler_service()
                    plugin_manager = get_plugin_manager()
                    
                    # Find an online user's plugin (prefer the project owner)
                    user_id = str(project.user_id) if project.user_id else None
                    online_users = plugin_manager.get_online_users()
                    
                    if user_id and user_id in online_users:
                        plugin_user_id = user_id
                        self.append_log(project_id, f"使用项目所有者的插件 (user_id: {user_id})")
                    elif online_users:
                        plugin_user_id = online_users[0]
                        self.append_log(project_id, f"项目主人插件离线，使用其他在线插件 (user_id: {plugin_user_id})")
                    else:
                        plugin_user_id = None
                        self.append_log(project_id, "⚠️ 没有在线的浏览器插件，回退到服务端采集")
                    
                    if plugin_user_id:
                        utils.logger.info(f"[Project-{project_id}] EXECUTE_VIA_PLUGIN | User={plugin_user_id}")
                        # Execute via plugin
                        for platform in platforms:
                            normalized_plat = {
                                "douyin": "dy", "bilibili": "bili", 
                                "weibo": "wb", "kuaishou": "ks"
                            }.get(platform, platform)
                            
                            for keyword in (project.keywords or []):
                                self.append_log(project_id, f"[插件] 搜索 {platform}: {keyword}")
                                
                                notes = await plugin_service.search_notes(
                                    user_id=plugin_user_id,
                                    platform=normalized_plat,
                                    keyword=keyword,
                                    page=1
                                )
                                
                                if notes:
                                    utils.logger.info(f"[Project-{project_id}] PLUGIN_RESULT_RECEIVED | Plat={platform} | Count={len(notes)}")
                                    self.append_log(project_id, f"[插件] 获取到 {len(notes)} 条笔记")
                                    saved = await plugin_service.save_notes_to_db(
                                        platform=normalized_plat,
                                        notes=notes,
                                        project_id=project_id
                                    )
                                    total_crawled_items += saved
                                    self.append_log(project_id, f"[插件] 已入库 {saved} 条")
                                else:
                                    if notes is None:
                                        self.append_log(project_id, f"[插件] 搜索任务超时 (120s)")
                                    else:
                                        self.append_log(project_id, f"[插件] 搜索无结果")
                        
                        # Update project stats in a new session (fix session scope bug)
                        async with get_session() as update_session:
                            duration = (datetime.now() - start_time_local).total_seconds()
                            proj = await update_session.get(GrowHubProject, project_id)
                            if proj:
                                proj.total_crawled = (proj.total_crawled or 0) + total_crawled_items
                                await update_session.commit()
                        
                        self.append_log(project_id, f"✅ 插件采集完成: {total_crawled_items} 条, 耗时 {duration:.1f}s")
                        return {
                            "status": "success",
                            "method": "plugin",
                            "crawled": total_crawled_items
                        }
                        
                except Exception as e:
                    self.append_log(project_id, f"⚠️ 插件采集失败: {e}, 回退到服务端采集")
            
            # ===== Server-side Execution Path =====
            
            
            MAX_ACCOUNT_RETRIES = 3  # 最大账号切换次数
            
            # Deduplicate platforms using normalized keys
            platform_normalize_map = {
                "douyin": "dy", "dy": "dy",
                "bilibili": "bili", "bili": "bili",
                "weibo": "wb", "wb": "wb",
                "kuaishou": "ks", "ks": "ks",
                "xhs": "xhs", "zhihu": "zhihu"
            }
            unique_platforms = []
            seen_platforms = set()
            for p in (project.platforms or []):
                norm = platform_normalize_map.get(p, p)
                if norm not in seen_platforms:
                    seen_platforms.add(norm)
                    unique_platforms.append(p)
            
            for platform in unique_platforms:
                # 平台名称映射
                platform_names = {
                    "xhs": "小红书",
                    "douyin": "抖音", "dy": "抖音",
                    "bilibili": "B站", "bili": "B站",
                    "weibo": "微博", "wb": "微博",
                    "zhihu": "知乎",
                    "kuaishou": "快手", "ks": "快手",
                    "tieba": "贴吧"
                }
                display_platform = platform_names.get(platform, platform)
                
                # Normalize platform for AccountPlatform enum
                platform_normalize = {
                    "douyin": "dy",
                    "bilibili": "bili",
                    "weibo": "wb",
                    "kuaishou": "ks"
                }
                normalized_plat_str = platform_normalize.get(platform, platform)
                
                # 账号重试循环
                success_this_platform = False
                tried_accounts = []
                
                for retry_num in range(MAX_ACCOUNT_RETRIES):
                    # 获取账号（排除已尝试的）
                    pool = get_account_pool()
                    try:
                        plat_enum = AccountPlatform(normalized_plat_str)
                        self.append_log(project_id, f"正在获取 {display_platform} 平台账号 (尝试 {retry_num + 1}/{MAX_ACCOUNT_RETRIES})...")
                        
                        # 获取所有可用账号中未尝试过的 (Sticky Sessions: 传入 project_id)
                        account = await pool.get_available_account(plat_enum, exclude_ids=tried_accounts, project_id=project_id, user_id=project.user_id)
                        
                        if not account and retry_num == 0:
                            # 如果是第一次尝试且没有可用账号，检查是否有账号即将结束冷却 (Wait up to 15s if an account is almost ready)
                            all_accounts = await pool.get_all_accounts(plat_enum, user_id=project.user_id)
                            now = datetime.now()
                            soon_available = [a for a in all_accounts if a.id not in tried_accounts and a.status == AccountStatus.ACTIVE and a.cooldown_until and now < a.cooldown_until < now + timedelta(seconds=20)]
                            
                            if soon_available:
                                next_ready = min(soon_available, key=lambda a: a.cooldown_until)
                                wait_sec = (next_ready.cooldown_until - now).total_seconds() + 1
                                self.append_log(project_id, f"⏳ 账号 {next_ready.account_name} 冷却中，等待 {wait_sec:.1f} 秒...")
                                await asyncio.sleep(wait_sec)
                                account = next_ready

                        if not account:
                            if retry_num == 0:
                                # 检查是否是因为所有账号都在冷却
                                all_accounts = await pool.get_all_accounts(plat_enum, user_id=project.user_id)
                                if not all_accounts:
                                    self.append_log(project_id, f"❌ 平台 {display_platform} 尚未配置任何账号，请前往账号中心添加")
                                else:
                                    self.append_log(project_id, f"❌ 平台 {display_platform} 所有账号均在冷却中或不可用 (可用数: 0/{len(all_accounts)})")
                            else:
                                self.append_log(project_id, f"❌ 平台 {display_platform} 没有更多可用账号")
                            break
                        
                        tried_accounts.append(account.id)
                        
                        # A4 优化: 执行前预校验 (减少扫码弹窗概率)
                        from api.services.account_verification import AccountVerifier
                        self.append_log(project_id, f"🔍 正在验证账号 {account.account_name} 有效性...")
                        verify_res = await AccountVerifier.verify(account.platform.value, account.cookies)
                        
                        if not verify_res.get("valid"):
                            reason = verify_res.get("message", "Unknown")
                            self.append_log(project_id, f"❌ 账号 {account.account_name} 验证失败: {reason}")
                            await pool.mark_account_invalid(account.id, reason)
                            continue # Try next account
                            
                        self.append_log(project_id, f"✅ 账号验证通过: {account.account_name}")
                        cookies = account.cookies
                    except Exception as e:
                        self.append_log(project_id, f"❌ 获取账号失败: {e}")
                        break
                    
                    # 检查爬虫状态
                    if crawler_manager.status == "running":
                        self.append_log(project_id, f"⚠️ 爬虫引擎忙碌中，跳过平台 {display_platform}")
                        break
                    
                    try:
                        # 映射平台名称到 MediaCrawler 支持的格式
                        platform_mapping = {
                            "douyin": "dy",
                            "bilibili": "bili",
                            "weibo": "wb",
                            "xhs": "xhs",
                            "kuaishou": "ks",
                            "zhihu": "zhihu",
                            "tieba": "tieba"
                        }
                        mc_platform = platform_mapping.get(platform, platform)
                        
                        self.append_log(project_id, f"🚀 启动爬虫任务: {display_platform} - {project.crawler_type}")
                        
                        # 计算动态时间范围 (Dynamically calculate time range)
                        start_time_str = ""
                        start_time_str = ""
                        end_time_str = ""
                        if getattr(project, 'crawl_date_range', 0) > 0:
                            range_days = project.crawl_date_range
                            now = datetime.now()
                            start_date = now - timedelta(days=range_days)
                            start_time_str = start_date.strftime("%Y-%m-%d %H:%M:%S")
                            end_time_str = now.strftime("%Y-%m-%d %H:%M:%S")
                            self.append_log(project_id, f"📅 爬取时间窗口: {start_time_str} 至 {end_time_str} (最近 {range_days} 天)")
                        
                        config = CrawlerStartRequest(
                            platform=mc_platform,
                            login_type="cookie",
                            crawler_type=project.crawler_type or "search",
                            save_option="sqlite",
                            keywords=keywords_str,
                            cookies=cookies,
                            headless=False,
                            crawl_limit_count=project.crawl_limit or 20,
                            start_time=start_time_str,
                            end_time=end_time_str,
                            enable_comments=project.enable_comments if project.enable_comments is not None else True,
                            project_id=project.id,  # 关联项目 ID
                            # Pass interaction filters from project settings
                            min_likes=getattr(project, 'min_likes', 0) or 0,
                            min_comments=getattr(project, 'min_comments', 0) or 0,
                            min_shares=getattr(project, 'min_shares', 0) or 0,
                            min_favorites=getattr(project, 'min_favorites', 0) or 0,
                            max_likes=getattr(project, 'max_likes', 0) or 0,
                            max_comments=getattr(project, 'max_comments', 0) or 0,
                            max_shares=getattr(project, 'max_shares', 0) or 0,
                            max_favorites=getattr(project, 'max_favorites', 0) or 0,
                            deduplicate_authors=getattr(project, 'deduplicate_authors', False) or False,
                            concurrency_num=getattr(project, 'max_concurrency', 3) or 3,
                            account_id=str(account.id),
                            # 博主筛选
                            min_fans=getattr(project, 'min_fans', 0) or 0,
                            max_fans=getattr(project, 'max_fans', 0) or 0,
                            require_contact=getattr(project, 'require_contact', False) or False,
                            # 舆情敏感词
                            sentiment_keywords=project.sentiment_keywords or [],
                            # 任务目的 (驱动数据分流)
                            purpose=getattr(project, 'purpose', 'general') or 'general',
                        )

                        
                        # Log all config values before execution
                        self.append_log(project_id, f"📋 爬虫配置参数:")
                        self.append_log(project_id, f"   - 平台: {mc_platform}, 类型: {config.crawler_type}")
                        self.append_log(project_id, f"   - 抓取数量: {config.crawl_limit_count}")
                        self.append_log(project_id, f"   - 开始时间: {config.start_time or '不限'}")
                        self.append_log(project_id, f"   - 点赞范围: {config.min_likes} ~ {config.max_likes if config.max_likes > 0 else '不限'}")
                        self.append_log(project_id, f"   - 评论范围: {config.min_comments} ~ {config.max_comments if config.max_comments > 0 else '不限'}")
                        self.append_log(project_id, f"   - 分享范围: {config.min_shares} ~ {config.max_shares if config.max_shares > 0 else '不限'}")
                        self.append_log(project_id, f"   - 收藏范围: {config.min_favorites} ~ {config.max_favorites if config.max_favorites > 0 else '不限'}")
                        self.append_log(project_id, f"   - 博主粉丝: {config.min_fans} ~ {config.max_fans if config.max_fans > 0 else '不限'}")
                        self.append_log(project_id, f"   - 博主去重: {'是' if config.deduplicate_authors else '否'}")
                        
                        sk_list = config.sentiment_keywords or []
                        sk_str = ', '.join(sk_list[:5])
                        if len(sk_list) > 5:
                            sk_str += '...'
                        self.append_log(project_id, f"   - 舆情敏感词: {sk_str if sk_list else '无'}")
                        
                        success = await crawler_manager.start(config)
                        if success:
                            self.append_log(project_id, "爬虫已提交，等待执行...")
                            
                            # 同步爬虫日志的游标
                            last_log_count = 0
                            
                            # 等待完成，并同步日志
                            while crawler_manager.status == "running":
                                # 获取新产生的爬虫日志
                                current_logs = crawler_manager.logs
                                if len(current_logs) > last_log_count:
                                    new_logs = current_logs[last_log_count:]
                                    for log_entry in new_logs:
                                        # 过滤一些无用日志
                                        if "Starting crawler" in log_entry.message: continue
                                        
                                        # 格式化并添加到项目日志
                                        self.append_log(project_id, f"🕷️ {log_entry.message}")
                                    
                                    last_log_count = len(current_logs)
                                
                                await asyncio.sleep(1)
                                
                            # 再次检查是否有遗漏的日志（任务刚结束时）
                            current_logs = crawler_manager.logs
                            if len(current_logs) > last_log_count:
                                new_logs = current_logs[last_log_count:]
                                for log_entry in new_logs:
                                    self.append_log(project_id, f"🕷️ {log_entry.message}")
                            
                            # 检查最终状态
                            final_status = crawler_manager.status
                            if final_status == "completed":
                                 # 获取本次任务抓取到的内容数量
                                 platform_new_items = 0
                                 try:
                                     from database.growhub_models import GrowHubContent
                                     from sqlalchemy import func
                                     async with get_session() as session:
                                         # 统计该项目该平台自任务启动以来的新内容 (Count new contents for this project & platform since task start)
                                         count_result = await session.execute(
                                             select(func.count(GrowHubContent.id))
                                             .where(GrowHubContent.project_id == project_id)
                                             .where(GrowHubContent.platform == platform)
                                             .where(GrowHubContent.crawl_time >= start_time_utc)
                                         )
                                         platform_new_items = count_result.scalar() or 0
                                         total_crawled_items += platform_new_items
                                 except Exception as e:
                                     self.append_log(project_id, f"⚠️ 统计数据失败: {e}")

                                 self.append_log(project_id, f"✅ 平台 {display_platform} 爬取任务成功完成，抓取 {platform_new_items} 条新内容")
                                 success_this_platform = True
                                 
                                 # 更新账号成功次数 (Sticky Sessions)
                                 await pool.record_account_usage(account.id, success=True, project_id=project_id)
                                 break  # 成功，跳出重试循环
                            else:
                                # 爬虫失败
                                self.append_log(project_id, f"⚠️ 爬虫状态异常: {final_status}，尝试切换账号...")
                                
                                # 扫描日志查找特定错误 (Auto-invalidate account on permission error)
                                has_permission_error = False
                                self.append_log(project_id, f"🔍 正在检查 {len(crawler_manager.logs)} 条日志以查找权限错误...")
                                for entry in crawler_manager.logs:
                                    if "-104" in entry.message or "没有权限" in entry.message:
                                        self.append_log(project_id, f"🔍 发现错误日志: {entry.message[:50]}...")
                                        has_permission_error = True
                                        break
                                
                                if has_permission_error:
                                    self.append_log(project_id, f"🚫 检测到账号 {account.account_name} 权限受限，标记为无效")
                                    await pool.update_account(account.id, {"status": AccountStatus.BANNED})
                                else:
                                    self.append_log(project_id, "🔍 未发现权限相关错误")
                                await pool.record_account_usage(account.id, success=False, project_id=project_id)
                                # 继续下一次重试
                                
                    except Exception as e:
                        error_msg = str(e)
                        self.append_log(project_id, f"❌ 平台 {display_platform} 爬虫执行异常: {error_msg}")
                        
                        # 标记账号失败
                        try:
                            await pool.record_account_usage(account.id, success=False, project_id=project_id)
                        except:
                            pass
                        
                        # 判断是否是账号相关的错误，决定是否重试
                        account_errors = ["没有权限", "Cookie", "403", "401", "406", "登录"]
                        is_account_error = any(err in error_msg for err in account_errors)
                        
                        if is_account_error and retry_num < MAX_ACCOUNT_RETRIES - 1:
                            self.append_log(project_id, "🔄 检测到账号问题，尝试切换账号...")
                            continue
                        else:
                            break
                
                if not success_this_platform:
                    self.append_log(project_id, f"❌ 平台 {display_platform} 所有账号均失败")

            
            # 更新统计 (Final Statistics Update)
            try:
                async with get_session() as session:
                    # 我们需要重新获取 project 对象，因为它可能已经过期
                    refresh_proj = await session.get(GrowHubProject, project_id)
                    if refresh_proj:
                        refresh_proj.total_crawled = (refresh_proj.total_crawled or 0) + total_crawled_items
                        refresh_proj.today_crawled = (refresh_proj.today_crawled or 0) + total_crawled_items
                        await session.commit()
            except Exception as e:
                print(f"Update stats error: {e}")

            self.append_log(project_id, "========================================")
            self.append_log(project_id, f"📊 任务汇总报告:")
            self.append_log(project_id, f"   - 项目名称: {project.name}")
            self.append_log(project_id, f"   - 总计抓取: {total_crawled_items} 条新内容")
            self.append_log(project_id, f"   - 运行耗时: {(datetime.now() - start_time_local).total_seconds():.1f} 秒")
            
            # --- Alert Processing ---
            if total_crawled_items > 0:
                try:
                    from api.services.alert import get_alert_service
                    from database.growhub_models import GrowHubContent
                    from sqlalchemy import select, and_
                    
                    alert_service = get_alert_service()
                    
                    if project.keywords:
                        # Use a new session or the context session if available?
                        # _execute_project is called within background task, session management is tricky.
                        # We use get_session() context manager.
                        from database.db_session import get_session
                        
                        async with get_session() as session:
                            result = await session.execute(
                                select(GrowHubContent).where(
                                    and_(
                                        GrowHubContent.created_at >= start_time_utc,
                                        GrowHubContent.source_keyword.in_(project.keywords)
                                    )
                                )
                            )
                            new_contents = result.scalars().all()
                            
                            if new_contents:
                                self.append_log(project_id, f"🔔 发现 {len(new_contents)} 条新内容，正在分析舆情...")
                                alerts_count = await alert_service.process_project_alerts(project, new_contents)
                                
                                # Fetch project in this session to update counts
                                refresh_proj = await session.get(GrowHubProject, project_id)
                                if refresh_proj:
                                    refresh_proj.total_alerts = (refresh_proj.total_alerts or 0) + alerts_count
                                    refresh_proj.today_alerts = (refresh_proj.today_alerts or 0) + alerts_count
                                    await session.commit()
                                
                                self.append_log(project_id, f"📩 触发 {alerts_count} 条预警通知")
                            else:
                                self.append_log(project_id, "没有符合条件的新内容，跳过预警")
                except Exception as e:
                    self.append_log(project_id, f"❌ 预警处理失败: {e}")
            
            self.append_log(project_id, "🏁 本次自动化监控任务全部执行结束")
            self.append_log(project_id, "========================================")
            
            # 计算下次运行时间
            if project.is_active and project.schedule_type == "interval":
                try:
                    interval = int(project.schedule_value)
                    project.next_run_at = datetime.now() + timedelta(seconds=interval)
                except:
                    pass
            
            # 记录结束
            self.append_log(project_id, "🏁 任务正常结束")
            
        except Exception as e:
            utils.logger.error(f"[Project-{project_id}] 任务执行出现异常: {e}")
            import traceback
            utils.logger.error(traceback.format_exc())
            try:
                self.append_log(project_id, f"❌ 任务因异常中断: {e}")
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
                "sentiment_keywords": project.sentiment_keywords,
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
    
    async def get_project_contents(self, project_id: int, page: int = 1, page_size: int = 20, 
                                 filters: Dict[str, Any] = None, user_id: int = None) -> Dict[str, Any]:
        """获取项目关联的内容列表"""
        filters = filters or {}
        from database.db_session import get_session
        from database.growhub_models import GrowHubProject, GrowHubContent
        from sqlalchemy import select, desc, func, and_, or_
        
        async with get_session() as session:
            # 1. 获取项目
            query = select(GrowHubProject).where(GrowHubProject.id == project_id)
            if user_id is not None:
                query = query.where(GrowHubProject.user_id == user_id)
            result = await session.execute(query)
            project = result.scalar()
            if not project:
                return {"items": [], "total": 0, "error": "Project not found"}
            
            # 2. 构建查询 - 强制使用 project_id 隔离
            # 用户要求: 每个任务下的内容列表是隔离的，自己是各自任务下数据
            # 因此不再回退到关键词匹配，严格筛选 project_id
            
            query = select(GrowHubContent).where(GrowHubContent.project_id == project_id)
            count_query = select(func.count(GrowHubContent.id)).where(GrowHubContent.project_id == project_id)
            
            # (已移除: 关键词回退逻辑)
            
            # 3. 应用过滤
            if filters:
                if filters.get("platform"):
                    query = query.where(GrowHubContent.platform == filters["platform"])
                    count_query = count_query.where(GrowHubContent.platform == filters["platform"])
                if filters.get("sentiment"):
                    query = query.where(GrowHubContent.sentiment == filters["sentiment"])
                    count_query = count_query.where(GrowHubContent.sentiment == filters["sentiment"])
            
            # 3.5 Apply Deduplication (Author)
            should_dedup = filters.get("deduplicate_authors")
            if should_dedup is None:
                should_dedup = project.deduplicate_authors
                
            if should_dedup:
                # Use Window Function to keep latest post per author
                subq = query.subquery()
                rn = func.row_number().over(
                    partition_by=subq.c.author_id,
                    order_by=desc(subq.c.publish_time)
                ).label("rn")
                
                cte = select(subq.c.id, rn).cte()
                
                # Rebuild Query and Count Query
                query = select(GrowHubContent).join(cte, GrowHubContent.id == cte.c.id).where(cte.c.rn == 1)
                count_query = select(func.count()).select_from(cte).where(cte.c.rn == 1)
            
            # 4. 分页和排序
            query = query.order_by(desc(GrowHubContent.publish_time))
            query = query.offset((page - 1) * page_size).limit(page_size)
            
            # 5. 执行查询
            content_result = await session.execute(query)
            contents = content_result.scalars().all()
            
            total_result = await session.execute(count_query)
            total = total_result.scalar() or 0
            
            return {
                "items": self._contents_to_list(contents),
                "total": total,
                "page": page,
                "page_size": page_size
            }
            
    async def get_project_stats_chart(self, project_id: int, days: int = 7, user_id: int = None) -> Dict[str, Any]:
        """获取项目图表统计数据"""
        from database.db_session import get_session
        from database.growhub_models import GrowHubProject, GrowHubContent
        from sqlalchemy import select, func, and_
        
        async with get_session() as session:
            # 1. 获取项目
            query = select(GrowHubProject).where(GrowHubProject.id == project_id)
            if user_id is not None:
                query = query.where(GrowHubProject.user_id == user_id)
            result = await session.execute(query)
            project = result.scalar()
            if not project or not project.keywords:
                return {"dates": [], "sentiment_trend": [], "platform_dist": []}
            
            keywords = project.keywords
            start_date = datetime.now() - timedelta(days=days)
            
            # 2. 情感趋势 (按日期分组)
            # SQLite 的日期处理比较特殊，这里简化处理，只查数据然后在内存聚合
            # 生产环境建议使用数据库特定的日期函数
            date_query = select(
                GrowHubContent.publish_time, 
                GrowHubContent.sentiment
            ).where(
                and_(
                    GrowHubContent.source_keyword.in_(keywords),
                    GrowHubContent.publish_time >= start_date
                )
            )
            
            date_result = await session.execute(date_query)
            rows = date_result.all()
            
            # 内存聚合
            daily_stats = {}
            for row in rows:
                if not row.publish_time:
                    continue
                date_str = row.publish_time.strftime("%Y-%m-%d")
                if date_str not in daily_stats:
                    daily_stats[date_str] = {"positive": 0, "neutral": 0, "negative": 0}
                
                sentiment = row.sentiment or "neutral"
                if sentiment in daily_stats[date_str]:
                    daily_stats[date_str][sentiment] += 1
            
            # 补全日期
            dates = []
            sentiment_trend = {"positive": [], "neutral": [], "negative": []}
            
            for i in range(days):
                d = (start_date + timedelta(days=i+1)).strftime("%Y-%m-%d")
                dates.append(d)
                stats = daily_stats.get(d, {"positive": 0, "neutral": 0, "negative": 0})
                sentiment_trend["positive"].append(stats["positive"])
                sentiment_trend["neutral"].append(stats["neutral"])
                sentiment_trend["negative"].append(stats["negative"])
                
            # 3. 平台分布
            platform_query = select(
                GrowHubContent.platform,
                func.count(GrowHubContent.id)
            ).where(
                GrowHubContent.source_keyword.in_(keywords)
            ).group_by(GrowHubContent.platform)
            
            plat_result = await session.execute(platform_query)
            platform_dist = [{"name": row[0], "value": row[1]} for row in plat_result.all()]
            
            return {
                "dates": dates,
                "sentiment_trend": sentiment_trend,
                "platform_dist": platform_dist
            }

    def _contents_to_list(self, contents) -> List[Dict[str, Any]]:
        return [
            {
                "id": c.id,
                "platform": c.platform,
                "title": c.title,
                "description": (c.description[:200] + "...") if c.description and len(c.description) > 200 else c.description,
                "url": c.content_url,
                "author": c.author_name,
                "author_id": c.author_id,
                "author_avatar": c.author_avatar,
                "author_fans": c.author_fans_count,
                "author_likes": c.author_likes_count,
                "cover_url": c.cover_url,
                "publish_time": (c.publish_time.replace(tzinfo=timezone.utc).isoformat() if c.publish_time else None),
                "crawl_time": (c.crawl_time.replace(tzinfo=timezone.utc).isoformat() if c.crawl_time else None),  # Fix: add missing crawl_time
                "sentiment": c.sentiment,
                "view_count": c.view_count,
                "like_count": c.like_count,
                "comment_count": c.comment_count,
                "share_count": c.share_count,
                "collect_count": c.collect_count,
                "is_alert": c.is_alert,
                "source_keyword": c.source_keyword,
                # 新增字段：支持视频播放和媒体类型显示
                "content_type": c.content_type,
                "video_url": c.video_url,
                "media_urls": c.media_urls,
            }
            for c in contents
        ]

    def _to_dict(self, project) -> Dict[str, Any]:
        """转换为字典"""
        return {
            "id": project.id,
            "name": project.name,
            "description": project.description,
            "keywords": project.keywords or [],
            "sentiment_keywords": project.sentiment_keywords or [],
            "platforms": project.platforms or [],
            "crawler_type": project.crawler_type,
            "crawl_limit": project.crawl_limit,
            "crawl_date_range": project.crawl_date_range,
            "enable_comments": project.enable_comments,
            "deduplicate_authors": project.deduplicate_authors,
            "schedule_type": project.schedule_type,
            "schedule_value": project.schedule_value,
            "is_active": project.is_active,
            "alert_on_negative": project.alert_on_negative,
            "alert_on_new_content": project.alert_on_new_content,
            "alert_on_hotspot": project.alert_on_hotspot,
            "alert_channels": project.alert_channels or [],
            "purpose": project.purpose or "general",
            "max_concurrency": project.max_concurrency or 3,
            "require_contact": project.require_contact or False,
            "min_fans": project.min_fans or 0,
            "max_fans": project.max_fans or 0,
            "use_plugin": project.use_plugin or False,
            
            # Advanced Filters
            "min_likes": project.min_likes or 0,
            "max_likes": project.max_likes or 0,
            "min_comments": project.min_comments or 0,
            "max_comments": project.max_comments or 0,
            "min_shares": project.min_shares or 0,
            "max_shares": project.max_shares or 0,
            "min_favorites": project.min_favorites or 0,
            "max_favorites": project.max_favorites or 0,
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
