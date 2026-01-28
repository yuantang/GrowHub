# -*- coding: utf-8 -*-
from fastapi import APIRouter, Query
from api.routers.plugin_websocket import get_plugin_manager
from api.services.plugin_crawler_service import get_plugin_crawler_service

router = APIRouter()

@router.get("/api/plugin/inspect")
async def inspect_plugin():
    manager = get_plugin_manager()
    return {
        "online_users": manager.get_online_users(),
        "connections_count": len(manager.connections),
        "info": manager.connection_info
    }

@router.get("/api/plugin/test-crawl")
async def test_crawl(
    user_id: str = Query(...),
    platform: str = "xhs",
    keyword: str = "ChatGPT"
):
    service = get_plugin_crawler_service()
    
    # 1. Search
    notes = await service.search_notes(
        user_id=user_id,
        platform=platform,
        keyword=keyword,
        page=1,
        page_size=5
    )
    
    # 2. Get Detail for first note if exists
    detail = None
    if notes:
        first_note = notes[0]
        detail = await service.get_note_detail(
            user_id=user_id,
            platform=platform,
            note_id=first_note.get("note_id"),
            xsec_token=first_note.get("xsec_token")
        )
    
    return {
        "user_id": user_id,
        "platform": platform,
        "keyword": keyword,
        "search_results_count": len(notes),
        "notes": notes[:5],
        "detail": detail
    }

@router.get("/api/plugin/debug-search")
async def debug_search(
    user_id: str = "3",
    platform: str = "xhs",
    keyword: str = "ChatGPT"
):
    service = get_plugin_crawler_service()
    notes = await service.search_notes(user_id, platform, keyword)
    return {"count": len(notes), "notes": notes[:5]}

@router.get("/api/plugin/debug-detail")
async def debug_detail(
    user_id: str = "3",
    platform: str = "xhs",
    note_id: str = Query(...),
    xsec_token: str = Query(None)
):
    service = get_plugin_crawler_service()
    detail = await service.get_note_detail(user_id, platform, note_id, xsec_token)
    return {"detail": detail}
