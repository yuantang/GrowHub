from fastapi import APIRouter
from pydantic import BaseModel
from typing import List, Optional
from ..services.llm import get_keyword_suggestions

router = APIRouter()

class SuggestRequest(BaseModel):
    keyword: str
    mode: str
    model: Optional[str] = "google/gemini-2.0-flash-exp:free"

@router.post("/ai/suggest")
async def suggest_keywords_endpoint(req: SuggestRequest):
    """
    Get keyword suggestions using LLM (OpenRouter).
    """
    keywords = await get_keyword_suggestions(req.keyword, req.mode, req.model)
    return {"keywords": keywords}
