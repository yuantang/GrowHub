import json
import re
from typing import Any, Dict, List, Optional
from tools import utils

class XiaoHongShuExtractor:
    """小红书内容提取器 - 适配 Pro 版标准结构"""
    
    def extract_note_info(self, note_item: Dict[str, Any]) -> Dict[str, Any]:
        """提取笔记核心信息"""
        if not note_item:
            return {}
            
        # 兼容不同 API 返回的层级
        note = note_item.get("note_card") or note_item.get("card") or note_item
        note_id = note.get("note_id") or note.get("id") or ""
        
        # 提取用户
        user = note.get("user") or {}
        
        return {
            "note_id": note_id,
            "title": note.get("title") or note.get("desc", "")[:20],
            "desc": note.get("desc") or "",
            "type": note.get("type") or "normal", # normal, video
            "user": {
                "user_id": user.get("user_id") or user.get("id"),
                "nickname": user.get("nickname") or user.get("name"),
                "avatar": user.get("avatar")
            },
            "create_time": note.get("time") or note.get("create_time"),
            "raw_data": note
        }

    def get_item_statistics(self, note_info: Dict[str, Any]) -> Dict[str, int]:
        """提取互动数据"""
        # 兼容 interatcion 或 stats 字段
        raw = note_info.get("raw_data") or note_info
        stats = raw.get("interact_info") or raw.get("stats") or {}
        
        return {
            "likes": int(stats.get("liked_count") or stats.get("like_count") or 0),
            "comments": int(stats.get("comment_count") or 0),
            "shares": int(stats.get("share_count") or 0),
            "favorites": int(stats.get("collected_count") or stats.get("collect_count") or 0)
        }

    def extract_note_detail_from_html(self, note_id: str, html: str) -> Dict[str, Any]:
        """从 HTML 中提取笔记详情"""
        if not html:
            return {}
            
        # 提取 window.__INITIAL_STATE__
        match = re.search(r'window\.__INITIAL_STATE__\s*=\s*({.*?});', html, re.S)
        if not match:
             # 尝试 init-state
             match = re.search(r'<script id="init-state">({.*?})</script>', html, re.S)
             
        if match:
            try:
                state_str = match.group(1)
                state = json.loads(state_str)
                
                # 寻找笔记详情
                # 模式1: note -> noteDetailMap -> note_id
                note_map = state.get("note", {}).get("noteDetailMap", {})
                if note_id in note_map:
                    return note_map[note_id].get("note", {}) or note_map[note_id]
                
                # 模式2: 直接在最外层的 noteDetail
                if "noteDetail" in state:
                    return state["noteDetail"]
                    
            except Exception as e:
                utils.logger.error(f"[XiaoHongShuExtractor] Error parsing INITIAL_STATE: {e}")
                
        return {}

    def extract_creator_info_from_html(self, html: str) -> Dict[str, Any]:
        """从 HTML 中提取用户信息"""
        if not html:
            return {}
            
        match = re.search(r'window\.__INITIAL_STATE__\s*=\s*({.*?});', html, re.S)
        if not match:
             match = re.search(r'<script id="init-state">({.*?})</script>', html, re.S)
             
        if match:
            try:
                state_str = match.group(1)
                state = json.loads(state_str)
                user_data = state.get("user", {}).get("userPageData", {})
                if not user_data:
                    # Fallback for different HTML structures
                    user_data = state.get("user", {}).get("user", {})
                
                if not user_data:
                    # Deep search for basic info if known keys fail
                    user_data = state.get("user", {})
                    
                if user_data:
                    return user_data
            except Exception as e:
                utils.logger.error(f"[XiaoHongShuExtractor] Error parsing user details: {e}")
        return {}
