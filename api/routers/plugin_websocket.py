# -*- coding: utf-8 -*-
"""
GrowHub Browser Plugin WebSocket
Handles real-time communication between server and browser plugins.
"""
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from typing import Dict, Any, Optional, Set
import asyncio
import json
from datetime import datetime
from jose import jwt, JWTError

from database.db_session import get_session
from database.growhub_models import GrowHubUser
from sqlalchemy import select
from tools import utils

router = APIRouter(tags=["GrowHub - Plugin WebSocket"])

from api.auth.security import SECRET_KEY, ALGORITHM


class PluginConnectionManager:
    """管理插件的 WebSocket 连接"""
    
    def __init__(self):
        # user_id -> WebSocket connection
        self.connections: Dict[str, WebSocket] = {}
        # user_id -> connection info
        self.connection_info: Dict[str, Dict[str, Any]] = {}
        # task_id -> asyncio.Future (for concurrent task result waiting)
        self.pending_futures: Dict[str, asyncio.Future] = {}
    
    async def connect(self, websocket: WebSocket, user_id: str, username: str):
        """注册插件连接"""
        await websocket.accept()
        
        # Close existing connection if any
        if user_id in self.connections:
            try:
                await self.connections[user_id].close()
            except:
                pass
        
        self.connections[user_id] = websocket
        self.connection_info[user_id] = {
            "username": username,
            "connected_at": datetime.now().isoformat(),
            "last_ping": datetime.now().isoformat(),
            "task_count": 0
        }
        # Note: pending_futures is now keyed by task_id, not user_id
        
        utils.logger.info(f"[Plugin WS] User {username} connected")
    
    def disconnect(self, user_id: str):
        """移除插件连接"""
        if user_id in self.connections:
            del self.connections[user_id]
        if user_id in self.connection_info:
            del self.connection_info[user_id]
        # Note: pending_futures cleanup happens via timeout in dispatch function
        utils.logger.info(f"[Plugin WS] User {user_id} disconnected")
    
    def is_online(self, user_id: str) -> bool:
        """检查用户的插件是否在线"""
        return user_id in self.connections
    
    def get_online_users(self) -> list:
        """获取所有在线用户"""
        return list(self.connection_info.keys())
    
    async def send_task(self, user_id: str, task: Dict[str, Any]) -> bool:
        """发送任务给插件"""
        if user_id not in self.connections:
            return False
        
        try:
            await self.connections[user_id].send_json({
                "type": "FETCH_TASK",
                **task
            })
            
            # Update stats
            if user_id in self.connection_info:
                self.connection_info[user_id]["task_count"] += 1
            
            return True
        except Exception as e:
            utils.logger.error(f"[Plugin WS] Failed to send task to {user_id}: {e}")
            return False
    
    async def send_ping(self, user_id: str):
        """发送心跳"""
        if user_id in self.connections:
            try:
                await self.connections[user_id].send_json({"type": "PING"})
            except:
                pass
    
    def update_ping(self, user_id: str):
        """更新最后心跳时间"""
        if user_id in self.connection_info:
            self.connection_info[user_id]["last_ping"] = datetime.now().isoformat()


# Global plugin connection manager
plugin_manager = PluginConnectionManager()


def get_plugin_manager() -> PluginConnectionManager:
    """获取插件连接管理器实例"""
    return plugin_manager


async def verify_token(token: str) -> Optional[Dict[str, Any]]:
    """验证 JWT token 并返回用户信息"""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        if user_id is None:
            utils.logger.warning("[Plugin WS] Token sub missing")
            return None
        
        async with get_session() as session:
            # sub is usually a string in JWT, convert to int for ID query
            result = await session.execute(
                select(GrowHubUser).where(GrowHubUser.id == int(user_id))
            )
            user = result.scalar_one_or_none()
            if user:
                return {"user_id": str(user.id), "username": user.username}
            else:
                utils.logger.warning(f"[Plugin WS] User not found for ID: {user_id}")
        return None
    except Exception as e:
        utils.logger.error(f"[Plugin WS] Token verification error: {e}")
        return None


@router.websocket("/ws/plugin")
async def websocket_plugin(
    websocket: WebSocket,
    token: str = Query(...)
):
    """
    插件 WebSocket 端点
    """
    utils.logger.info(f"[Plugin WS] Connection attempt received")
    
    # Verify token
    user_info = await verify_token(token)
    if not user_info:
        utils.logger.warning(f"[Plugin WS] Connection rejected: Invalid token")
        await websocket.close(code=4001, reason="Invalid token")
        return
    
    user_id = user_info["user_id"]
    username = user_info["username"]
    
    # Connect
    await plugin_manager.connect(websocket, user_id, username)
    
    try:
        # Send welcome message
        await websocket.send_json({
            "type": "CONNECTED",
            "user_id": user_id,
            "username": username,
            "message": "Successfully connected to GrowHub",
            "timestamp": datetime.now().isoformat()
        })
        
        # Send pending task queue
        await _push_task_queue(websocket, int(user_id))
        
        # Main message loop
        while True:
            try:
                # Wait for message with timeout for heartbeat
                data = await asyncio.wait_for(
                    websocket.receive_text(),
                    timeout=60.0
                )
                
                message = json.loads(data)
                msg_type = message.get("type", "")
                
                if msg_type == "PONG":
                    plugin_manager.update_ping(user_id)
                    
                elif msg_type == "TASK_RESULT":
                    # Handle task result from plugin
                    task_id = message.get("task_id")
                    success = message.get("success", False)
                    response = message.get("response", {})
                    error = message.get("error")
                    
                    utils.logger.info(
                        f"[Plugin WS] Task {task_id} completed: "
                        f"success={success}, status={response.get('status', 'N/A')}"
                    )
                    
                    # Resolve the Future if someone is waiting for this task_id
                    if task_id in plugin_manager.pending_futures:
                        future = plugin_manager.pending_futures[task_id]
                        if not future.done():
                            future.set_result({
                                "task_id": task_id,
                                "success": success,
                                "response": response,
                                "error": error
                            })
                
                elif msg_type == "MANUAL_SYNC":
                    # Acknowledge manual sync request
                    await websocket.send_json({
                        "type": "SYNC_ACK",
                        "message": "Manual sync acknowledged"
                    })
                    
            except asyncio.TimeoutError:
                # Send heartbeat
                await plugin_manager.send_ping(user_id)
                
    except WebSocketDisconnect:
        plugin_manager.disconnect(user_id)
    except Exception as e:
        utils.logger.error(f"[Plugin WS] Connection error for {username}: {e}")
        plugin_manager.disconnect(user_id)


# ==================== 任务调度接口 ====================

async def dispatch_fetch_to_plugin(
    user_id: str,
    task_id: str,
    platform: str,
    url: str,
    method: str = "GET",
    headers: Optional[Dict[str, str]] = None,
    body: Optional[str] = None,
    timeout: float = 30.0
) -> Optional[Dict[str, Any]]:
    """
    向用户的插件发送 fetch 任务并等待结果
    
    Args:
        user_id: 用户 ID
        task_id: 任务唯一 ID
        platform: 目标平台 (xhs, dy, etc.)
        url: 请求 URL
        method: HTTP 方法
        headers: 请求头
        body: 请求体
        timeout: 超时时间（秒）
    
    Returns:
        插件返回的响应，如果失败返回 None
    """
    if not plugin_manager.is_online(user_id):
        utils.logger.warning(f"[Plugin] User {user_id} plugin not online")
        return None
    
    task = {
        "task_id": task_id,
        "platform": platform,
        "request": {
            "url": url,
            "method": method,
            "headers": headers or {},
            "body": body
        }
    }
    
    # Send task to plugin
    sent = await plugin_manager.send_task(user_id, task)
    if not sent:
        return None
    
    # Create a Future for this specific task_id
    loop = asyncio.get_event_loop()
    future = loop.create_future()
    plugin_manager.pending_futures[task_id] = future
    
    # Wait for result
    try:
        result = await asyncio.wait_for(future, timeout=timeout)
        return result
    except asyncio.TimeoutError:
        utils.logger.warning(f"[Plugin] Task {task_id} timed out")
        return None
    finally:
        # Cleanup the future
        plugin_manager.pending_futures.pop(task_id, None)


async def _push_task_queue(websocket: WebSocket, user_id: int):
    """Push pending task queue to connected plugin"""
    try:
        from database.db_session import get_session
        from database.growhub_models import PluginTask
        from sqlalchemy import select, or_
        
        async with get_session() as session:
            # Get pending and running tasks for this user
            result = await session.execute(
                select(PluginTask).where(
                    PluginTask.user_id == user_id,
                    or_(
                        PluginTask.status == "pending",
                        PluginTask.status == "running"
                    )
                ).order_by(PluginTask.created_at.desc()).limit(20)
            )
            tasks = result.scalars().all()
            
            # Convert to JSON-serializable format
            task_list = []
            for t in tasks:
                task_list.append({
                    "task_id": t.task_id,
                    "platform": t.platform,
                    "task_type": t.task_type,
                    "url": t.url,
                    "status": t.status,
                    "created_at": t.created_at.isoformat() if t.created_at else None
                })
            
            await websocket.send_json({
                "type": "TASK_QUEUE",
                "tasks": task_list,
                "count": len(task_list)
            })
            
            utils.logger.info(f"[Plugin WS] Pushed {len(task_list)} tasks to user {user_id}")
            
    except Exception as e:
        utils.logger.warning(f"[Plugin WS] Failed to push task queue: {e}")
