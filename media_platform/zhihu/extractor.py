# -*- coding: utf-8 -*-
from typing import Any, Dict, List, Optional
from tools import utils

class ZhihuExtractor:
    """Zhihu content extractor"""
    
    def extract_note_info(self, note_item: Dict[str, Any]) -> Dict[str, Any]:
        """Extract core note (answer/article/zvideo) information"""
        if not note_item:
            return {}
            
        target = note_item.get("target") or note_item
        author = target.get("author") or {}
        
        # Zhihu has different types: answer, article, zvideo
        item_type = target.get("type", "answer")
        
        return {
            "note_id": str(target.get("id")),
            "title": target.get("title", "") or target.get("question", {}).get("title", "")[:50],
            "desc": target.get("excerpt") or target.get("content") or "",
            "type": item_type,
            "user": {
                "user_id": str(author.get("id")),
                "nickname": author.get("name"),
                "avatar": author.get("avatar_url")
            },
            "create_time": target.get("created_time") or target.get("updated_time"),
            "raw_data": note_item
        }

    def get_item_statistics(self, note_info: Dict[str, Any]) -> Dict[str, int]:
        """Extract interaction statistics"""
        raw = note_info.get("raw_data") or note_info
        target = raw.get("target") or raw
        
        return {
            "likes": int(target.get("voteup_count") or 0),
            "comments": int(target.get("comment_count") or 0),
            "thanks": int(target.get("thanks_count") or 0)
        }
