# -*- coding: utf-8 -*-
# GrowHub - 实时数据 WebSocket API
# Phase 1: 内容抓取与舆情监控增强

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import List, Dict, Any, Set
import asyncio
import json
from datetime import datetime

router = APIRouter(prefix="/growhub/ws", tags=["GrowHub - WebSocket"])


class ConnectionManager:
    """WebSocket 连接管理器"""
    
    def __init__(self):
        self.active_connections: Dict[str, Set[WebSocket]] = {
            "alerts": set(),      # 预警订阅
            "content": set(),     # 内容更新订阅
            "stats": set(),       # 统计数据订阅
        }
    
    async def connect(self, websocket: WebSocket, channel: str):
        await websocket.accept()
        if channel not in self.active_connections:
            self.active_connections[channel] = set()
        self.active_connections[channel].add(websocket)
    
    def disconnect(self, websocket: WebSocket, channel: str):
        if channel in self.active_connections:
            self.active_connections[channel].discard(websocket)
    
    async def broadcast(self, channel: str, message: Dict[str, Any]):
        """广播消息到指定频道的所有连接"""
        if channel not in self.active_connections:
            return
        
        disconnected = set()
        for connection in self.active_connections[channel]:
            try:
                await connection.send_json(message)
            except Exception:
                disconnected.add(connection)
        
        # 清理断开的连接
        for conn in disconnected:
            self.active_connections[channel].discard(conn)
    
    async def send_personal(self, websocket: WebSocket, message: Dict[str, Any]):
        """发送个人消息"""
        try:
            await websocket.send_json(message)
        except Exception:
            pass


manager = ConnectionManager()


@router.websocket("/alerts")
async def websocket_alerts(websocket: WebSocket):
    """预警实时推送 WebSocket 端点"""
    await manager.connect(websocket, "alerts")
    
    try:
        # 发送连接成功消息
        await manager.send_personal(websocket, {
            "type": "connected",
            "channel": "alerts",
            "message": "已连接到预警推送频道",
            "timestamp": datetime.now().isoformat()
        })
        
        # 保持连接并处理消息
        while True:
            try:
                data = await asyncio.wait_for(websocket.receive_text(), timeout=30.0)
                
                # 处理心跳
                if data == "ping":
                    await websocket.send_text("pong")
                else:
                    # 可以处理其他命令
                    pass
                    
            except asyncio.TimeoutError:
                # 发送心跳保持连接
                await websocket.send_text("ping")
                
    except WebSocketDisconnect:
        manager.disconnect(websocket, "alerts")
    except Exception as e:
        print(f"[GrowHub WS] Alerts connection error: {e}")
        manager.disconnect(websocket, "alerts")


@router.websocket("/content")
async def websocket_content(websocket: WebSocket):
    """内容更新实时推送 WebSocket 端点"""
    await manager.connect(websocket, "content")
    
    try:
        await manager.send_personal(websocket, {
            "type": "connected",
            "channel": "content",
            "message": "已连接到内容更新频道",
            "timestamp": datetime.now().isoformat()
        })
        
        while True:
            try:
                data = await asyncio.wait_for(websocket.receive_text(), timeout=30.0)
                
                if data == "ping":
                    await websocket.send_text("pong")
                    
            except asyncio.TimeoutError:
                await websocket.send_text("ping")
                
    except WebSocketDisconnect:
        manager.disconnect(websocket, "content")
    except Exception as e:
        print(f"[GrowHub WS] Content connection error: {e}")
        manager.disconnect(websocket, "content")


@router.websocket("/stats")
async def websocket_stats(websocket: WebSocket):
    """统计数据实时推送 WebSocket 端点"""
    await manager.connect(websocket, "stats")
    
    try:
        await manager.send_personal(websocket, {
            "type": "connected",
            "channel": "stats",
            "message": "已连接到统计数据频道",
            "timestamp": datetime.now().isoformat()
        })
        
        while True:
            try:
                data = await asyncio.wait_for(websocket.receive_text(), timeout=30.0)
                
                if data == "ping":
                    await websocket.send_text("pong")
                    
            except asyncio.TimeoutError:
                await websocket.send_text("ping")
                
    except WebSocketDisconnect:
        manager.disconnect(websocket, "stats")
    except Exception as e:
        print(f"[GrowHub WS] Stats connection error: {e}")
        manager.disconnect(websocket, "stats")


# ==================== 推送辅助函数 ====================

async def push_alert(alert_data: Dict[str, Any]):
    """推送新预警"""
    await manager.broadcast("alerts", {
        "type": "new_alert",
        "data": alert_data,
        "timestamp": datetime.now().isoformat()
    })


async def push_content_update(content_data: Dict[str, Any]):
    """推送内容更新"""
    await manager.broadcast("content", {
        "type": "content_update",
        "data": content_data,
        "timestamp": datetime.now().isoformat()
    })


async def push_stats_update(stats_data: Dict[str, Any]):
    """推送统计更新"""
    await manager.broadcast("stats", {
        "type": "stats_update",
        "data": stats_data,
        "timestamp": datetime.now().isoformat()
    })


def get_connection_manager():
    """获取连接管理器实例"""
    return manager
