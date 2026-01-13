# -*- coding: utf-8 -*-
from typing import Any, Dict, List, Optional
from tools import utils

class TiebaExtractor:
    """Tieba content extractor"""
    
    def extract_post_info(self, post_item: Dict[str, Any]) -> Dict[str, Any]:
        """Extract core post/thread information"""
        if not post_item:
            return {}
            
        author = post_item.get("author") or {}
        
        return {
            "post_id": str(post_item.get("id") or post_item.get("tid")),
            "title": post_item.get("title", "")[:50],
            "desc": post_item.get("abstract") or post_item.get("content") or "",
            "type": "post",
            "user": {
                "user_id": str(author.get("id") or author.get("user_id")),
                "nickname": author.get("name") or author.get("show_name"),
                "avatar": author.get("portrait")
            },
            "create_time": post_item.get("create_time"),
            "raw_data": post_item
        }

    def get_item_statistics(self, post_info: Dict[str, Any]) -> Dict[str, int]:
        """Extract interaction statistics"""
        raw = post_info.get("raw_data") or post_info
        
        return {
            "replies": int(raw.get("reply_num") or 0),
            "views": int(raw.get("view_num") or 0)
        }
