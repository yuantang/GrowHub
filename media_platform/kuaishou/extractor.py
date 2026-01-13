# -*- coding: utf-8 -*-
from typing import Any, Dict, List, Optional
from tools import utils

class KuaiShouExtractor:
    """KuaiShou content extractor"""
    
    def extract_video_info(self, video_item: Dict[str, Any]) -> Dict[str, Any]:
        """Extract core video information"""
        if not video_item:
            return {}
            
        photo_info = video_item.get("photo") or video_item
        author_info = video_item.get("author") or photo_info.get("author") or {}
        
        return {
            "video_id": str(photo_info.get("id") or photo_info.get("photoId")),
            "title": photo_info.get("caption", "")[:50],
            "desc": photo_info.get("caption") or "",
            "type": "video",
            "user": {
                "user_id": str(author_info.get("id")),
                "nickname": author_info.get("name"),
                "avatar": author_info.get("headerUrl")
            },
            "create_time": photo_info.get("timestamp"),
            "raw_data": video_item
        }

    def get_item_statistics(self, video_info: Dict[str, Any]) -> Dict[str, int]:
        """Extract interaction statistics"""
        raw = video_info.get("raw_data") or video_info
        photo = raw.get("photo") or raw
        
        # Structure varies between search and detail
        # Interaction counts are often in the photo object
        return {
            "likes": int(photo.get("likeCount") or 0),
            "comments": int(photo.get("commentCount") or 0),
            "views": int(photo.get("viewCount") or 0)
        }
