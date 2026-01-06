# -*- coding: utf-8 -*-
# GrowHub Scheduler Service - 任务调度服务
# Phase 2 Week 8: 定时任务管理

import asyncio
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Callable
from enum import Enum
from pydantic import BaseModel
import uuid
import json

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger
from apscheduler.jobstores.memory import MemoryJobStore


class TaskType(str, Enum):
    CRAWLER = "crawler"           # 爬虫任务
    KEYWORD_MONITOR = "keyword_monitor"  # 关键词监控
    CONTENT_ANALYSIS = "content_analysis"  # 内容分析
    REPORT = "report"             # 生成报告
    CLEANUP = "cleanup"           # 数据清理


class TaskStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"
    PAUSED = "paused"


class ScheduledTask(BaseModel):
    """定时任务模型"""
    id: str
    name: str
    task_type: TaskType
    description: Optional[str] = None
    
    # 调度配置
    cron_expression: Optional[str] = None  # Cron 表达式
    interval_seconds: Optional[int] = None  # 间隔秒数
    
    # 任务参数
    params: Dict[str, Any] = {}
    
    # 状态
    is_active: bool = True
    last_run: Optional[datetime] = None
    next_run: Optional[datetime] = None
    run_count: int = 0
    
    # 时间戳
    created_at: datetime = datetime.now()
    updated_at: datetime = datetime.now()


class TaskExecutionLog(BaseModel):
    """任务执行日志"""
    id: str
    task_id: str
    task_name: str
    status: TaskStatus
    started_at: datetime
    finished_at: Optional[datetime] = None
    duration_seconds: Optional[float] = None
    result: Optional[Dict[str, Any]] = None
    error_message: Optional[str] = None


class SchedulerService:
    """任务调度服务"""
    
    _instance = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance
    
    def __init__(self):
        if self._initialized:
            return
        
        self.scheduler = AsyncIOScheduler(
            jobstores={'default': MemoryJobStore()},
            job_defaults={
                'coalesce': True,
                'max_instances': 1,
                'misfire_grace_time': 60
            }
        )
        
        self.tasks: Dict[str, ScheduledTask] = {}
        self.execution_logs: List[TaskExecutionLog] = []
        self._started = False
        self._initialized = True
    
    def start(self):
        """启动调度器"""
        if not self._started:
            self.scheduler.start()
            self._started = True
            print("[Scheduler] 任务调度器已启动")
    
    def shutdown(self):
        """关闭调度器"""
        if self._started:
            self.scheduler.shutdown()
            self._started = False
            print("[Scheduler] 任务调度器已关闭")
    
    async def add_task(self, task: ScheduledTask) -> ScheduledTask:
        """添加定时任务"""
        task.id = str(uuid.uuid4())[:8]
        task.created_at = datetime.now()
        task.updated_at = datetime.now()
        
        # 创建 APScheduler Job
        trigger = self._create_trigger(task)
        if trigger:
            job = self.scheduler.add_job(
                self._execute_task,
                trigger=trigger,
                id=task.id,
                args=[task.id],
                name=task.name
            )
            task.next_run = job.next_run_time
        
        self.tasks[task.id] = task
        print(f"[Scheduler] 任务已添加: {task.name} (ID: {task.id})")
        return task
    
    async def update_task(self, task_id: str, updates: Dict[str, Any]) -> Optional[ScheduledTask]:
        """更新任务"""
        if task_id not in self.tasks:
            return None
        
        task = self.tasks[task_id]
        
        for key, value in updates.items():
            if hasattr(task, key):
                setattr(task, key, value)
        
        task.updated_at = datetime.now()
        
        # 重新调度
        if 'cron_expression' in updates or 'interval_seconds' in updates:
            self.scheduler.remove_job(task_id)
            trigger = self._create_trigger(task)
            if trigger and task.is_active:
                job = self.scheduler.add_job(
                    self._execute_task,
                    trigger=trigger,
                    id=task.id,
                    args=[task.id],
                    name=task.name
                )
                task.next_run = job.next_run_time
        
        return task
    
    async def delete_task(self, task_id: str) -> bool:
        """删除任务"""
        if task_id not in self.tasks:
            return False
        
        try:
            self.scheduler.remove_job(task_id)
        except:
            pass
        
        del self.tasks[task_id]
        return True
    
    async def pause_task(self, task_id: str) -> bool:
        """暂停任务"""
        if task_id not in self.tasks:
            return False
        
        self.tasks[task_id].is_active = False
        try:
            self.scheduler.pause_job(task_id)
        except:
            pass
        return True
    
    async def resume_task(self, task_id: str) -> bool:
        """恢复任务"""
        if task_id not in self.tasks:
            return False
        
        self.tasks[task_id].is_active = True
        try:
            self.scheduler.resume_job(task_id)
            job = self.scheduler.get_job(task_id)
            if job:
                self.tasks[task_id].next_run = job.next_run_time
        except:
            pass
        return True
    
    async def run_task_now(self, task_id: str) -> Optional[TaskExecutionLog]:
        """立即执行任务"""
        if task_id not in self.tasks:
            return None
        
        return await self._execute_task(task_id)
    
    def get_task(self, task_id: str) -> Optional[ScheduledTask]:
        """获取任务详情"""
        return self.tasks.get(task_id)
    
    def get_all_tasks(self) -> List[ScheduledTask]:
        """获取所有任务"""
        return list(self.tasks.values())
    
    def get_execution_logs(self, task_id: Optional[str] = None, limit: int = 50) -> List[TaskExecutionLog]:
        """获取执行日志"""
        logs = self.execution_logs
        if task_id:
            logs = [log for log in logs if log.task_id == task_id]
        return sorted(logs, key=lambda x: x.started_at, reverse=True)[:limit]
    
    def _create_trigger(self, task: ScheduledTask):
        """创建触发器"""
        if task.cron_expression:
            try:
                return CronTrigger.from_crontab(task.cron_expression)
            except Exception as e:
                print(f"[Scheduler] Cron 表达式无效: {task.cron_expression}, {e}")
                return None
        elif task.interval_seconds:
            return IntervalTrigger(seconds=task.interval_seconds)
        return None
    
    async def _execute_task(self, task_id: str) -> Optional[TaskExecutionLog]:
        """执行任务"""
        if task_id not in self.tasks:
            return None
        
        task = self.tasks[task_id]
        log = TaskExecutionLog(
            id=str(uuid.uuid4())[:8],
            task_id=task_id,
            task_name=task.name,
            status=TaskStatus.RUNNING,
            started_at=datetime.now()
        )
        
        try:
            # 根据任务类型执行不同逻辑
            result = await self._run_task_logic(task)
            
            log.status = TaskStatus.SUCCESS
            log.result = result
            
        except Exception as e:
            log.status = TaskStatus.FAILED
            log.error_message = str(e)
            print(f"[Scheduler] 任务执行失败: {task.name}, 错误: {e}")
        
        finally:
            log.finished_at = datetime.now()
            log.duration_seconds = (log.finished_at - log.started_at).total_seconds()
            
            # 更新任务状态
            task.last_run = log.started_at
            task.run_count += 1
            
            # 更新 next_run
            try:
                job = self.scheduler.get_job(task_id)
                if job:
                    task.next_run = job.next_run_time
            except:
                pass
            
            # 保存日志
            self.execution_logs.append(log)
            # 只保留最近 500 条日志
            if len(self.execution_logs) > 500:
                self.execution_logs = self.execution_logs[-500:]
        
        return log
    
    async def _run_task_logic(self, task: ScheduledTask) -> Dict[str, Any]:
        """执行具体任务逻辑"""
        
        if task.task_type == TaskType.CRAWLER:
            # 爬虫任务
            return await self._run_crawler_task(task)
        
        elif task.task_type == TaskType.KEYWORD_MONITOR:
            # 关键词监控
            return await self._run_keyword_monitor_task(task)
        
        elif task.task_type == TaskType.CONTENT_ANALYSIS:
            # 内容分析
            return await self._run_content_analysis_task(task)
        
        elif task.task_type == TaskType.REPORT:
            # 生成报告
            return await self._run_report_task(task)
        
        elif task.task_type == TaskType.CLEANUP:
            # 数据清理
            return await self._run_cleanup_task(task)
        
        return {"status": "unknown_task_type"}
    
    async def _run_crawler_task(self, task: ScheduledTask) -> Dict[str, Any]:
        """执行爬虫任务"""
        params = task.params
        platform = params.get("platform", "xhs")
        keywords = params.get("keywords", [])
        
        # 调用爬虫服务
        from api.services.crawler_manager import CrawlerManager
        manager = CrawlerManager()
        
        # 模拟：这里应该调用实际的爬虫
        print(f"[Scheduler] 执行爬虫任务: 平台={platform}, 关键词={keywords}")
        await asyncio.sleep(2)  # 模拟耗时
        
        return {
            "platform": platform,
            "keywords": keywords,
            "crawled_count": 0,
            "message": "爬虫任务模拟执行完成"
        }
    
    async def _run_keyword_monitor_task(self, task: ScheduledTask) -> Dict[str, Any]:
        """执行关键词监控任务"""
        params = task.params
        keyword_ids = params.get("keyword_ids", [])
        
        print(f"[Scheduler] 执行关键词监控: keyword_ids={keyword_ids}")
        await asyncio.sleep(1)
        
        return {
            "monitored_keywords": len(keyword_ids),
            "new_contents": 0,
            "alerts": 0
        }
    
    async def _run_content_analysis_task(self, task: ScheduledTask) -> Dict[str, Any]:
        """执行内容分析任务"""
        print(f"[Scheduler] 执行内容分析任务")
        await asyncio.sleep(1)
        
        return {
            "analyzed_count": 0,
            "new_alerts": 0
        }
    
    async def _run_report_task(self, task: ScheduledTask) -> Dict[str, Any]:
        """生成报告任务"""
        print(f"[Scheduler] 生成报告任务")
        await asyncio.sleep(1)
        
        return {
            "report_type": task.params.get("report_type", "daily"),
            "generated": True
        }
    
    async def _run_cleanup_task(self, task: ScheduledTask) -> Dict[str, Any]:
        """数据清理任务"""
        days = task.params.get("retention_days", 30)
        print(f"[Scheduler] 执行数据清理: 保留 {days} 天")
        await asyncio.sleep(1)
        
        return {
            "retention_days": days,
            "deleted_count": 0
        }


# 全局调度器实例
scheduler_service = SchedulerService()


def get_scheduler() -> SchedulerService:
    """获取调度器实例"""
    return scheduler_service
