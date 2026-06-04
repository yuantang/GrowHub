from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.future import select
from typing import Optional, Dict, Any

from database.db_session import get_session
from database.growhub_models import GrowHubUser, GrowHubHotspot, GrowHubContent, GrowHubAudioExtraction
from api.auth import deps
from api.services.audio_extraction_service import process_audio_extraction

router = APIRouter(prefix="/growhub/audio", tags=["GrowHub - Audio Extraction"])


def _bgm_path_to_url(bgm_path: Optional[str]) -> Optional[str]:
    if not bgm_path:
        return None
    if str(bgm_path).startswith("/"):
        return str(bgm_path)
    if "static/" in str(bgm_path):
        idx = str(bgm_path).find("static/")
        return "/" + str(bgm_path)[idx:]
    return str(bgm_path)


async def _latest_extraction_for_item(
    session,
    item_type: str,
    item_id: int,
) -> Optional[GrowHubAudioExtraction]:
    """同一 content/hotspot 可能有多条历史记录，始终取最新一条。"""
    query = select(GrowHubAudioExtraction).order_by(GrowHubAudioExtraction.id.desc()).limit(1)
    if item_type == "hotspot":
        query = query.where(GrowHubAudioExtraction.hotspot_id == item_id)
    else:
        query = query.where(GrowHubAudioExtraction.content_id == item_id)
    result = await session.execute(query)
    return result.scalars().first()


@router.post("/extract")
async def extract_audio_and_transcript(
    request: Dict[str, Any],
    background_tasks: BackgroundTasks,
    current_user: GrowHubUser = Depends(deps.get_current_user)
):
    """Start an async audio extraction task from a hotspot or content item"""
    item_type = request.get("item_type")  # "hotspot" or "content"
    item_id = request.get("item_id")
    bgm_only = bool(request.get("bgm_only"))

    if not item_type or not item_id:
        raise HTTPException(status_code=400, detail="Missing item_type or item_id")

    try:
        item_id = int(item_id)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Invalid item_id")

    async with get_session() as session:
        existing = await _latest_extraction_for_item(session, item_type, item_id)

        force = bool(request.get("force"))
        incomplete = (
            existing
            and existing.status == "success"
            and not existing.bgm_local_path
        )
        if (
            existing
            and existing.status not in ("failed",)
            and not force
            and not incomplete
        ):
            return {
                "extraction_id": existing.id,
                "status": existing.status,
                "bgm_url": _bgm_path_to_url(existing.bgm_local_path),
                "warning": existing.error_msg,
            }

        video_url = None
        if item_type == "hotspot":
            item = (
                await session.execute(
                    select(GrowHubHotspot).where(GrowHubHotspot.id == item_id)
                )
            ).scalar_one_or_none()
            if item and item.content_id:
                content = (
                    await session.execute(
                        select(GrowHubContent).where(GrowHubContent.id == item.content_id)
                    )
                ).scalar_one_or_none()
                if content:
                    video_url = content.video_url
        else:
            item = (
                await session.execute(
                    select(GrowHubContent).where(GrowHubContent.id == item_id)
                )
            ).scalar_one_or_none()
            if item:
                video_url = item.video_url

        if not video_url:
            raise HTTPException(status_code=404, detail="Item not found or has no video URL")

        if existing and (existing.status == "failed" or incomplete or force):
            existing.video_url = video_url
            existing.status = "pending"
            existing.error_msg = None
            existing.bgm_local_path = None
            existing.vocals_local_path = None
            existing.original_audio_path = None
            existing.transcript_text = None
            await session.commit()
            await session.refresh(existing)
            extraction_id = existing.id
        else:
            extraction = GrowHubAudioExtraction(
                content_id=item_id if item_type == "content" else None,
                hotspot_id=item_id if item_type == "hotspot" else None,
                video_url=video_url,
                status="pending",
            )
            session.add(extraction)
            await session.commit()
            await session.refresh(extraction)
            extraction_id = extraction.id

    background_tasks.add_task(process_audio_extraction, extraction_id, bgm_only)

    return {"extraction_id": extraction_id, "status": "pending", "bgm_only": bgm_only}


@router.get("/status/{extraction_id}")
async def get_extraction_status(
    extraction_id: int,
    current_user: GrowHubUser = Depends(deps.get_current_user)
):
    """Poll extraction status and get results"""
    async with get_session() as session:
        extraction = (
            await session.execute(
                select(GrowHubAudioExtraction).where(GrowHubAudioExtraction.id == extraction_id)
            )
        ).scalar_one_or_none()

        if not extraction:
            raise HTTPException(status_code=404, detail="Extraction not found")

        return {
            "id": extraction.id,
            "status": extraction.status,
            "transcript_text": extraction.transcript_text,
            "vocals_url": _bgm_path_to_url(extraction.vocals_local_path),
            "bgm_url": _bgm_path_to_url(extraction.bgm_local_path),
            "original_audio_url": _bgm_path_to_url(extraction.original_audio_path),
            "error_msg": extraction.error_msg,
        }
