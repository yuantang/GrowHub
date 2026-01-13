# -*- coding: utf-8 -*-
from typing import Any, Dict, List, Optional
from tools import utils

class BiliExtractor:
    """Bilibili content extractor"""
    
    def extract_video_info(self, video_item: Dict[str, Any]) -> Dict[str, Any]:
        """Extract core video information"""
        if not video_item:
            return {}
            
        return {
            "video_id": video_item.get("bvid") or video_item.get("aid"),
            "title": video_item.get("title") or "",
            "desc": video_item.get("description") or video_item.get("desc") or "",
            "type": "video",
            "user": {
                "user_id": video_item.get("mid") or video_item.get("owner", {}).get("mid"),
                "nickname": video_item.get("author") or video_item.get("owner", {}).get("name"),
                "avatar": video_item.get("pic") # Owner usually has separate avatar
            },
            "create_time": video_item.get("pubdate") or video_item.get("created"),
            "raw_data": video_item
        }

    def get_item_statistics(self, video_info: Dict[str, Any]) -> Dict[str, int]:
        """Extract interaction statistics"""
        raw = video_info.get("raw_data") or video_info
        stat = raw.get("stat") or {}
        
        return {
            "likes": int(stat.get("like") or stat.get("view_like") or 0),
            "comments": int(stat.get("reply") or 0),
            "shares": int(stat.get("share") or 0),
            "favorites": int(stat.get("favorite") or 0),
            "views": int(stat.get("view") or 0)
        }
