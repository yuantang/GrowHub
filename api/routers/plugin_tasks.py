# -*- coding: utf-8 -*-
"""
GrowHub Plugin Tasks API
Manages task queue for browser plugin execution.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime
import uuid

from database.db_session import get_session
from database.growhub_models import PluginTask, PluginTaskStatus, GrowHubUser
from sqlalchemy import select, update, desc
from api.deps import get_current_user

router = APIRouter(prefix="/growhub/plugin-tasks", tags=["GrowHub - Plugin Tasks"])


# ==================== Pydantic Models ====================

class TaskCreateRequest(BaseModel):
    """创建任务请求"""
    platform: str = Field(..., description="目标平台: xhs, dy, bilibili, kuaishou")
    task_type: str = Field(..., description="任务类型: fetch_url, search_notes, get_detail")
    url: Optional[str] = Field(None, description="目标URL（fetch_url/get_detail时必填）")
    params: Optional[Dict[str, Any]] = Field(None, description="额外参数（关键词、数量等）")
    project_id: Optional[int] = Field(None, description="关联项目ID")
    priority: int = Field(0, description="优先级，越高越先执行")


class TaskResponse(BaseModel):
    """任务响应"""
    id: int
    task_id: str
    user_id: int
    project_id: Optional[int]
    platform: str
    task_type: str
    url: Optional[str]
    params: Optional[Dict[str, Any]]
    status: str
    priority: int
    result: Optional[Dict[str, Any]]
    error_message: Optional[str]
    created_at: datetime
    dispatched_at: Optional[datetime]
    completed_at: Optional[datetime]


class TaskListResponse(BaseModel):
    """任务列表响应"""
    tasks: List[TaskResponse]
    total: int
    page: int
    page_size: int


# ==================== API Endpoints ====================

@router.get("", response_model=TaskListResponse)
async def list_tasks(
    status: Optional[str] = Query(None, description="按状态过滤: pending, running, completed, failed, cancelled"),
    platform: Optional[str] = Query(None, description="按平台过滤"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: GrowHubUser = Depends(get_current_user)
):
    """获取当前用户的任务列表"""
    async with get_session() as session:
        # Build query
        query = select(PluginTask).where(PluginTask.user_id == current_user.id)
        
        if status:
            query = query.where(PluginTask.status == status)
        if platform:
            query = query.where(PluginTask.platform == platform)
        
        # Count total
        count_query = select(PluginTask.id).where(PluginTask.user_id == current_user.id)
        if status:
            count_query = count_query.where(PluginTask.status == status)
        if platform:
            count_query = count_query.where(PluginTask.platform == platform)
        
        count_result = await session.execute(count_query)
        total = len(count_result.all())
        
        # Get paginated results
        query = query.order_by(desc(PluginTask.created_at))
        query = query.offset((page - 1) * page_size).limit(page_size)
        
        result = await session.execute(query)
        tasks = result.scalars().all()
        
        return TaskListResponse(
            tasks=[_task_to_response(t) for t in tasks],
            total=total,
            page=page,
            page_size=page_size
        )


@router.post("", response_model=TaskResponse)
async def create_task(
    data: TaskCreateRequest,
    current_user: GrowHubUser = Depends(get_current_user)
):
    """创建新任务"""
    async with get_session() as session:
        task = PluginTask(
            task_id=str(uuid.uuid4()),
            user_id=current_user.id,
            project_id=data.project_id,
            platform=data.platform,
            task_type=data.task_type,
            url=data.url,
            params=data.params,
            priority=data.priority,
            status=PluginTaskStatus.PENDING.value
        )
        session.add(task)
        await session.commit()
        await session.refresh(task)
        
        return _task_to_response(task)


@router.get("/{task_id}", response_model=TaskResponse)
async def get_task(
    task_id: str,
    current_user: GrowHubUser = Depends(get_current_user)
):
    """获取任务详情"""
    async with get_session() as session:
        result = await session.execute(
            select(PluginTask).where(
                PluginTask.task_id == task_id,
                PluginTask.user_id == current_user.id
            )
        )
        task = result.scalar()
        
        if not task:
            raise HTTPException(status_code=404, detail="任务不存在")
        
        return _task_to_response(task)


@router.delete("/{task_id}")
async def cancel_task(
    task_id: str,
    current_user: GrowHubUser = Depends(get_current_user)
):
    """取消待执行的任务"""
    async with get_session() as session:
        result = await session.execute(
            select(PluginTask).where(
                PluginTask.task_id == task_id,
                PluginTask.user_id == current_user.id
            )
        )
        task = result.scalar()
        
        if not task:
            raise HTTPException(status_code=404, detail="任务不存在")
        
        if task.status != PluginTaskStatus.PENDING.value:
            raise HTTPException(status_code=400, detail="只能取消待执行的任务")
        
        task.status = PluginTaskStatus.CANCELLED.value
        await session.commit()
        
        return {"success": True, "message": "任务已取消"}


@router.post("/{task_id}/retry")
async def retry_task(
    task_id: str,
    current_user: GrowHubUser = Depends(get_current_user)
):
    """重试失败的任务"""
    async with get_session() as session:
        result = await session.execute(
            select(PluginTask).where(
                PluginTask.task_id == task_id,
                PluginTask.user_id == current_user.id
            )
        )
        task = result.scalar()
        
        if not task:
            raise HTTPException(status_code=404, detail="任务不存在")
        
        if task.status != PluginTaskStatus.FAILED.value:
            raise HTTPException(status_code=400, detail="只能重试失败的任务")
        
        task.status = PluginTaskStatus.PENDING.value
        task.error_message = None
        task.dispatched_at = None
        task.completed_at = None
        await session.commit()
        
        return {"success": True, "message": "任务已重置为待执行状态"}


@router.post("/{task_id}/dispatch")
async def dispatch_task(
    task_id: str,
    current_user: GrowHubUser = Depends(get_current_user)
):
    """手动下发任务到插件执行"""
    from api.routers.plugin_websocket import get_plugin_manager, dispatch_fetch_to_plugin
    
    async with get_session() as session:
        result = await session.execute(
            select(PluginTask).where(
                PluginTask.task_id == task_id,
                PluginTask.user_id == current_user.id
            )
        )
        task = result.scalar()
        
        if not task:
            raise HTTPException(status_code=404, detail="任务不存在")
        
        if task.status not in [PluginTaskStatus.PENDING.value, PluginTaskStatus.FAILED.value]:
            raise HTTPException(status_code=400, detail="只能下发待执行或失败的任务")
        
        # Check if plugin is online
        plugin_manager = get_plugin_manager()
        user_id_str = str(current_user.id)
        
        if not plugin_manager.is_online(user_id_str):
            raise HTTPException(status_code=400, detail="插件未连接，无法下发任务")
        
        # Update status to running
        task.status = PluginTaskStatus.RUNNING.value
        task.dispatched_at = datetime.now()
        await session.commit()
        
        # Dispatch to plugin
        try:
            dispatch_result = await dispatch_fetch_to_plugin(
                user_id=user_id_str,
                task_id=task.task_id,
                platform=task.platform,
                url=task.url or "",
                method="GET",
                timeout=60.0
            )
            
            # Update result
            task.status = PluginTaskStatus.COMPLETED.value
            task.completed_at = datetime.now()
            task.result = {
                "status_code": dispatch_result.get("status"),
                "data_length": len(dispatch_result.get("body", ""))
            }
            await session.commit()
            
            return {"success": True, "message": "任务执行成功", "result": dispatch_result}
            
        except Exception as e:
            task.status = PluginTaskStatus.FAILED.value
            task.completed_at = datetime.now()
            task.error_message = str(e)
            await session.commit()
            
            raise HTTPException(status_code=500, detail=f"任务执行失败: {e}")


# ==================== Helper Functions ====================

def _task_to_response(task: PluginTask) -> TaskResponse:
    """Convert PluginTask model to response"""
    return TaskResponse(
        id=task.id,
        task_id=task.task_id,
        user_id=task.user_id,
        project_id=task.project_id,
        platform=task.platform,
        task_type=task.task_type,
        url=task.url,
        params=task.params,
        status=task.status,
        priority=task.priority,
        result=task.result,
        error_message=task.error_message,
        created_at=task.created_at,
        dispatched_at=task.dispatched_at,
        completed_at=task.completed_at
    )
