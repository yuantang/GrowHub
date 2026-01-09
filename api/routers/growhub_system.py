# -*- coding: utf-8 -*-
from fastapi import APIRouter, HTTPException, Query
from database.db_session import get_session
from database.growhub_models import GrowHubContent, GrowHubNotification, GrowHubKeyword
from sqlalchemy import delete, text

router = APIRouter(prefix="/growhub/system", tags=["GrowHub - System"])

@router.delete("/data/clear")
async def clear_data(
    data_type: str = Query(..., description="Data type: content, all")
):
    """
    清空数据 (Development/Testing Utility)
    """
    try:
        async with get_session() as session:
            if data_type == "content":
                # Clear Content
                await session.execute(delete(GrowHubContent))
                # Related Notifications?
                # Usually notifications link to content. Safe to keep or delete?
                # Let's delete notifications too as they are "content related"
                await session.execute(delete(GrowHubNotification))
                
                # Reset Keyword stats?
                # Keyword stats (hit_count) depends on content.
                # If content is gone, hit_count is invalid.
                # Reset hit_count = 0, content_count = 0
                await session.execute(
                    text("UPDATE growhub_keywords SET hit_count = 0, content_count = 0")
                )
                
                await session.commit()
                return {"message": "Content data cleared successfully"}
                
            elif data_type == "all":
                # Clear Everything (Content, Stats) but keep Config (Projects, Rules, Accounts)
                await session.execute(delete(GrowHubContent))
                await session.execute(delete(GrowHubNotification))
                await session.execute(
                    text("UPDATE growhub_keywords SET hit_count = 0, content_count = 0")
                )
                await session.commit()
                return {"message": "All data cleared successfully"}
                
            else:
                raise HTTPException(status_code=400, detail="Invalid data type")
                
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
