# -*- coding: utf-8 -*-
# GrowHub Scheduler API - 任务调度管理
# Phase 2 Week 8: 定时任务管理

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime

from ..services.scheduler import (
    get_scheduler, 
    ScheduledTask, 
    TaskType, 
    TaskStatus,
    TaskExecutionLog
)

router = APIRouter(prefix="/growhub/scheduler", tags=["GrowHub - Scheduler"])


# ==================== Request Models ====================

class CreateTaskRequest(BaseModel):
    """创建任务请求"""
    name: str = Field(..., min_length=1, max_length=100)
    task_type: TaskType
    description: Optional[str] = None
    cron_expression: Optional[str] = Field(None, description="Cron表达式，如: */5 * * * * (每5分钟)")
    interval_seconds: Optional[int] = Field(None, ge=60, description="间隔秒数，最小60秒")
    params: Dict[str, Any] = Field(default={}, description="任务参数")
    is_active: bool = True


class UpdateTaskRequest(BaseModel):
    """更新任务请求"""
    name: Optional[str] = None
    description: Optional[str] = None
    cron_expression: Optional[str] = None
    interval_seconds: Optional[int] = None
    params: Optional[Dict[str, Any]] = None
    is_active: Optional[bool] = None


# ==================== API Endpoints ====================

@router.on_event("startup")
async def startup_scheduler():
    """启动时初始化调度器"""
    scheduler = get_scheduler()
    scheduler.start()


@router.on_event("shutdown")
async def shutdown_scheduler():
    """关闭时停止调度器"""
    scheduler = get_scheduler()
    scheduler.shutdown()


@router.get("/status")
async def get_scheduler_status():
    """获取调度器状态"""
    scheduler = get_scheduler()
    tasks = scheduler.get_all_tasks()
    
    active_count = sum(1 for t in tasks if t.is_active)
    
    return {
        "running": scheduler._started,
        "total_tasks": len(tasks),
        "active_tasks": active_count,
        "paused_tasks": len(tasks) - active_count
    }


@router.get("/tasks")
async def list_tasks(
    task_type: Optional[TaskType] = None,
    is_active: Optional[bool] = None
):
    """获取任务列表"""
    scheduler = get_scheduler()
    tasks = scheduler.get_all_tasks()
    
    if task_type:
        tasks = [t for t in tasks if t.task_type == task_type]
    
    if is_active is not None:
        tasks = [t for t in tasks if t.is_active == is_active]
    
    return {
        "total": len(tasks),
        "items": [t.dict() for t in tasks]
    }


@router.post("/tasks")
async def create_task(request: CreateTaskRequest):
    """创建定时任务"""
    if not request.cron_expression and not request.interval_seconds:
        raise HTTPException(
            status_code=400, 
            detail="必须指定 cron_expression 或 interval_seconds"
        )
    
    scheduler = get_scheduler()
    
    task = ScheduledTask(
        id="",  # Will be generated
        name=request.name,
        task_type=request.task_type,
        description=request.description,
        cron_expression=request.cron_expression,
        interval_seconds=request.interval_seconds,
        params=request.params,
        is_active=request.is_active
    )
    
    created_task = await scheduler.add_task(task)
    return created_task.dict()


@router.get("/tasks/{task_id}")
async def get_task(task_id: str):
    """获取任务详情"""
    scheduler = get_scheduler()
    task = scheduler.get_task(task_id)
    
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    
    return task.dict()


@router.put("/tasks/{task_id}")
async def update_task(task_id: str, request: UpdateTaskRequest):
    """更新任务"""
    scheduler = get_scheduler()
    
    updates = request.dict(exclude_unset=True)
    updated_task = await scheduler.update_task(task_id, updates)
    
    if not updated_task:
        raise HTTPException(status_code=404, detail="任务不存在")
    
    return updated_task.dict()


@router.delete("/tasks/{task_id}")
async def delete_task(task_id: str):
    """删除任务"""
    scheduler = get_scheduler()
    success = await scheduler.delete_task(task_id)
    
    if not success:
        raise HTTPException(status_code=404, detail="任务不存在")
    
    return {"message": "任务已删除", "task_id": task_id}


@router.post("/tasks/{task_id}/pause")
async def pause_task(task_id: str):
    """暂停任务"""
    scheduler = get_scheduler()
    success = await scheduler.pause_task(task_id)
    
    if not success:
        raise HTTPException(status_code=404, detail="任务不存在")
    
    return {"message": "任务已暂停", "task_id": task_id}


@router.post("/tasks/{task_id}/resume")
async def resume_task(task_id: str):
    """恢复任务"""
    scheduler = get_scheduler()
    success = await scheduler.resume_task(task_id)
    
    if not success:
        raise HTTPException(status_code=404, detail="任务不存在")
    
    return {"message": "任务已恢复", "task_id": task_id}


@router.post("/tasks/{task_id}/run")
async def run_task_now(task_id: str):
    """立即执行任务"""
    scheduler = get_scheduler()
    log = await scheduler.run_task_now(task_id)
    
    if not log:
        raise HTTPException(status_code=404, detail="任务不存在")
    
    return log.dict()


@router.get("/logs")
async def get_execution_logs(
    task_id: Optional[str] = None,
    limit: int = Query(50, ge=1, le=200)
):
    """获取执行日志"""
    scheduler = get_scheduler()
    logs = scheduler.get_execution_logs(task_id=task_id, limit=limit)
    
    return {
        "total": len(logs),
        "items": [log.dict() for log in logs]
    }


@router.get("/task-types")
async def get_task_types():
    """获取可用的任务类型"""
    return {
        "types": [
            {
                "value": TaskType.CRAWLER.value,
                "label": "爬虫任务",
                "description": "定时爬取指定平台的内容",
                "params_schema": {
                    "platform": {"type": "string", "required": True, "options": ["xhs", "douyin", "bilibili", "weibo", "zhihu"]},
                    "keywords": {"type": "array", "required": False}
                }
            },
            {
                "value": TaskType.KEYWORD_MONITOR.value,
                "label": "关键词监控",
                "description": "监控关键词的新内容",
                "params_schema": {
                    "keyword_ids": {"type": "array", "required": True}
                }
            },
            {
                "value": TaskType.CONTENT_ANALYSIS.value,
                "label": "内容分析",
                "description": "分析未处理的内容",
                "params_schema": {}
            },
            {
                "value": TaskType.REPORT.value,
                "label": "生成报告",
                "description": "生成定期报告",
                "params_schema": {
                    "report_type": {"type": "string", "required": True, "options": ["daily", "weekly", "monthly"]}
                }
            },
            {
                "value": TaskType.CLEANUP.value,
                "label": "数据清理",
                "description": "清理过期数据",
                "params_schema": {
                    "retention_days": {"type": "number", "required": True, "default": 30}
                }
            }
        ]
    }


@router.get("/cron-presets")
async def get_cron_presets():
    """获取常用 Cron 表达式预设"""
    return {
        "presets": [
            {"label": "每5分钟", "value": "*/5 * * * *"},
            {"label": "每15分钟", "value": "*/15 * * * *"},
            {"label": "每30分钟", "value": "*/30 * * * *"},
            {"label": "每小时", "value": "0 * * * *"},
            {"label": "每2小时", "value": "0 */2 * * *"},
            {"label": "每天早上8点", "value": "0 8 * * *"},
            {"label": "每天中午12点", "value": "0 12 * * *"},
            {"label": "每天晚上8点", "value": "0 20 * * *"},
            {"label": "每天凌晨2点", "value": "0 2 * * *"},
            {"label": "每周一早上9点", "value": "0 9 * * 1"},
            {"label": "每月1号凌晨", "value": "0 0 1 * *"},
        ]
    }
