# -*- coding: utf-8 -*-
from fastapi import APIRouter, Depends, Query, BackgroundTasks, HTTPException
from typing import Optional, List, Dict, Any
from pydantic import BaseModel
from sqlalchemy import text

from database.db_session import get_session
from api.auth import deps

router = APIRouter(
    prefix="/growhub_publish",
    tags=["Auto Publishing"]
)

class PublishTaskCreate(BaseModel):
    task_title: str
    account_id: Optional[str] = None
    content_body: Optional[str] = None
    assets_dir: Optional[str] = None
    publish_time: Optional[str] = None

@router.get("/tasks")
async def get_publish_tasks(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: Optional[str] = None,
    current_user: dict = Depends(deps.get_current_user)
):
    """分页获取发布队列"""
    offset = (page - 1) * page_size
    query_str = "SELECT * FROM growhub_publish_tasks"
    count_query_str = "SELECT COUNT(*) FROM growhub_publish_tasks"
    params = {}
    
    if status and status != 'all':
        query_str += " WHERE status = :status"
        count_query_str += " WHERE status = :status"
        params["status"] = status
        
    query_str += " ORDER BY id DESC LIMIT :limit OFFSET :offset"
    params["limit"] = page_size
    params["offset"] = offset

    async with get_session() as session:
        count_result = await session.execute(text(count_query_str), params)
        total = count_result.fetchone()[0]
        
        result = await session.execute(text(query_str), params)
        items = [dict(row._mapping) for row in result.all()]

    return {
        "success": True,
        "data": {
            "total": total,
            "page": page,
            "page_size": page_size,
            "items": items
        }
    }

@router.post("/tasks")
async def create_publish_task(
    task: PublishTaskCreate,
    current_user: dict = Depends(deps.get_current_user)
):
    """人工或系统创建一个新的发布任务"""
    async with get_session() as session:
        query = """
            INSERT INTO growhub_publish_tasks 
            (task_title, account_id, content_body, assets_dir, publish_time)
            VALUES (:title, :acc, :body, :assets, :pub_time)
        """
        await session.execute(text(query), {
            "title": task.task_title,
            "acc": task.account_id,
            "body": task.content_body,
            "assets": task.assets_dir,
            "pub_time": task.publish_time
        })
        await session.commit()
    return {"success": True, "message": "Publish task created."}

@router.post("/trigger/{task_id}")
async def trigger_publish(
    task_id: int,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(deps.get_current_user)
):
    """触发底层真实浏览器投递"""
    from api.services.publish_service import publish_service
    background_tasks.add_task(publish_service.publish_task, task_id)
    return {"success": True, "message": f"Task {task_id} publishing process triggered in background."}

@router.delete("/tasks/{task_id}")
async def delete_publish_task(
    task_id: int,
    current_user: dict = Depends(deps.get_current_user)
):
    """删除指定的发布任务"""
    async with get_session() as session:
        await session.execute(
            text("DELETE FROM growhub_publish_tasks WHERE id = :id"),
            {"id": task_id}
        )
        await session.commit()
    return {"success": True, "message": f"Task {task_id} deleted."}


@router.get("/bgms")
async def get_available_bgms(current_user: dict = Depends(deps.get_current_user)):
    """获取所有已成功提取的背景音以及预置背景音"""
    import os
    from pathlib import Path
    from sqlalchemy.future import select
    from database.growhub_models import GrowHubAudioExtraction
    
    bgms = []
    
    # 1. 预置的音乐选项
    preset_dir = Path("static/presets/bgm")
    if preset_dir.exists():
        for item in preset_dir.glob("*.mp3"):
            bgms.append({
                "name": f"预置音乐 - {item.stem}",
                "url": f"/static/presets/bgm/{item.name}"
            })
            
    # 2. 从数据库中读取提取成功的背景音
    async with get_session() as session:
        try:
            result = await session.execute(
                select(GrowHubAudioExtraction).where(
                    GrowHubAudioExtraction.status == "success",
                    GrowHubAudioExtraction.bgm_local_path.isnot(None)
                )
            )
            extractions = result.scalars().all()
            for ext in extractions:
                bgm_path = ext.bgm_local_path
                if not bgm_path:
                    continue
                name = "提取音频"
                if ext.transcript_text:
                    name = ext.transcript_text[:15] + "..." if len(ext.transcript_text) > 15 else ext.transcript_text
                
                # 转为 URL 相对路径
                web_url = bgm_path
                if "static/" in bgm_path:
                    idx = bgm_path.find("static/")
                    web_url = "/" + bgm_path[idx:]
                    
                bgms.append({
                    "name": f"用户提取 - {name}",
                    "url": web_url
                })
        except Exception as e:
            # 防止表不存在或列缺失报错
            pass
            
    # 3. 兜底扫描 static/audio_extractions
    audio_dir = Path("static/audio_extractions")
    if audio_dir.exists():
        for item in audio_dir.glob("**/bgm*.mp3"):
            web_url = f"/static/audio_extractions/{item.name}"
            if not any(b["url"] == web_url for b in bgms):
                bgms.append({
                    "name": f"提取音频 - {item.stem}",
                    "url": web_url
                })
                
    return {"success": True, "data": bgms}


class ComposeVideoRequest(BaseModel):
    image_urls: List[str]
    bgm_url: str

@router.post("/compose_video")
async def compose_video_api(
    req: ComposeVideoRequest,
    current_user: dict = Depends(deps.get_current_user)
):
    """多张图片 + BGM 合成为短视频"""
    import uuid
    from pathlib import Path
    from api.services.video_compose_service import compose_images_with_bgm
    
    # 决定输出路径
    output_filename = f"composed_{uuid.uuid4().hex}.mp4"
    output_relative = f"static/composed_videos/{output_filename}"
    output_abs = Path(__file__).resolve().parents[2] / output_relative
    
    success = await compose_images_with_bgm(
        image_urls=req.image_urls,
        bgm_url=req.bgm_url,
        output_path=str(output_abs),
        duration_per_image=3.0
    )
    
    if not success:
        raise HTTPException(status_code=500, detail="视频合成失败，请检查音视频资源和 FFmpeg 配置")
        
    return {
        "success": True,
        "message": "视频合成成功",
        "video_url": f"/static/composed_videos/{output_filename}"
    }
