# -*- coding: utf-8 -*-
from typing import Any, Dict, List, Optional
from tools import utils

class WeiboExtractor:
    """Weibo content extractor"""
    
    def extract_weibo_info(self, weibo_item: Dict[str, Any]) -> Dict[str, Any]:
        """Extract core weibo information"""
        if not weibo_item:
            return {}
            
        mblog = weibo_item.get("mblog") or weibo_item
        user = mblog.get("user") or {}
        
        return {
            "weibo_id": str(mblog.get("id")),
            "title": mblog.get("text_raw", "")[:50],
            "desc": mblog.get("text_raw") or mblog.get("text") or "",
            "type": "post",
            "user": {
                "user_id": str(user.get("id")),
                "nickname": user.get("screen_name"),
                "avatar": user.get("avatar_hd") or user.get("profile_image_url")
            },
            "create_time": mblog.get("created_at"),
            "raw_data": mblog
        }

    def get_item_statistics(self, weibo_info: Dict[str, Any]) -> Dict[str, int]:
        """Extract interaction statistics"""
        raw = weibo_info.get("raw_data") or weibo_info
        
        return {
            "likes": int(raw.get("attitudes_count") or 0),
            "comments": int(raw.get("comments_count") or 0),
            "shares": int(raw.get("reposts_count") or 0)
        }
