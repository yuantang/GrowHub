# -*- coding: utf-8 -*-
from fastapi import APIRouter, HTTPException, Query
from database.db_session import get_session
from database.growhub_models import (
    GrowHubContent, 
    GrowHubNotification, 
    GrowHubKeyword,
    GrowHubCreator,
    GrowHubHotspot,
    GrowHubCheckpoint,
    GrowHubCheckpointNote
)
from sqlalchemy import delete, text

router = APIRouter(prefix="/growhub/system", tags=["GrowHub - System"])

@router.delete("/data/clear")
async def clear_data(
    data_type: str = Query(..., description="Data type: content, creator, hotspot, checkpoint, all")
):
    """
    清空数据 (Development/Testing Utility)
    """
    try:
        async with get_session() as session:
            if data_type == "content":
                # Clear Content
                await session.execute(delete(GrowHubContent))
                await session.execute(delete(GrowHubNotification))
                await session.execute(
                    text("UPDATE growhub_keywords SET hit_count = 0, content_count = 0")
                )
                await session.commit()
                return {"message": "Content data cleared successfully"}

            elif data_type == "creator":
                # Clear Creators
                await session.execute(delete(GrowHubCreator))
                await session.commit()
                return {"message": "Creator data cleared successfully"}

            elif data_type == "hotspot":
                # Clear Hotspots
                await session.execute(delete(GrowHubHotspot))
                await session.commit()
                return {"message": "Hotspot data cleared successfully"}

            elif data_type == "checkpoint":
                # Clear Checkpoints (and Notes)
                await session.execute(delete(GrowHubCheckpointNote))
                await session.execute(delete(GrowHubCheckpoint))
                await session.commit()
                return {"message": "Checkpoint data cleared successfully"}
                
            elif data_type == "all":
                # Clear Everything (Content, Stats, Creators, Hotspots, Checkpoints) but keep Config
                await session.execute(delete(GrowHubContent))
                await session.execute(delete(GrowHubNotification))
                await session.execute(delete(GrowHubCreator))
                await session.execute(delete(GrowHubHotspot))
                await session.execute(delete(GrowHubCheckpointNote))
                await session.execute(delete(GrowHubCheckpoint))
                
                await session.execute(
                    text("UPDATE growhub_keywords SET hit_count = 0, content_count = 0")
                )
                await session.commit()
                return {"message": "All data cleared successfully"}
                
            else:
                raise HTTPException(status_code=400, detail="Invalid data type")
                
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
