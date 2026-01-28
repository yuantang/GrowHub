# -*- coding: utf-8 -*-
"""
GrowHub Plugin Crawler Service
Distributed data collection through browser plugin.

This service provides the same interface as server-side crawlers,
but uses connected browser plugins for actual data fetching.
"""
import asyncio
import uuid
from datetime import datetime
from typing import Dict, List, Optional, Any
from tools import utils


class PluginCrawlerService:
    """
    Crawler service that uses connected browser plugins for data fetching.
    
    Key Features:
    - Same interface as MediaCrawler for seamless integration
    - Uses real browser sessions from connected plugins
    - Leverages user's authentic login state
    - Bypasses anti-bot detection systems
    """
    
    _instance = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance
    
    def __init__(self):
        if self._initialized:
            return
        self._initialized = True
        
        # Platform API endpoints for search
        self.platform_search_urls = {
            "xhs": "https://edith.xiaohongshu.com/api/sns/web/v1/search/notes",
            "dy": "https://www.douyin.com/aweme/v1/web/search/item/",
        }
        
        # Platform API endpoints for note detail
        self.platform_detail_urls = {
            "xhs": "https://edith.xiaohongshu.com/api/sns/web/v1/feed",
            "dy": "https://www.douyin.com/aweme/v1/web/aweme/detail/",
        }
    
    async def is_available(self, user_id: str) -> bool:
        """Check if plugin is online for the given user"""
        from api.routers.plugin_websocket import get_plugin_manager
        return get_plugin_manager().is_online(user_id)
    
    async def fetch_url(
        self,
        user_id: str,
        platform: str,
        url: str,
        method: str = "GET",
        headers: Optional[Dict[str, str]] = None,
        body: Optional[str] = None,
        timeout: float = 30.0,
        project_id: Optional[int] = None  # NEW: For task tracking
    ) -> Optional[Dict[str, Any]]:
        """
        Fetch a URL using the user's browser plugin.
        
        Args:
            user_id: User whose plugin will execute the request
            platform: Target platform (xhs, dy, etc.)
            url: Request URL
            method: HTTP method
            headers: Optional request headers
            body: Optional request body
            timeout: Request timeout in seconds
            project_id: Optional project ID for task tracking
            
        Returns:
            Response dict with status, body, headers
        """
        from api.routers.plugin_websocket import dispatch_fetch_to_plugin
        
        task_id = str(uuid.uuid4())
        short_task_id = task_id[:8]
        
        utils.logger.info(
            f"[PluginCrawler] Dispatching fetch task {short_task_id} to user {user_id}: "
            f"[{method}] {url[:80]}..."
        )
        
        # Create PluginTask record for tracking
        await self._create_task_record(
            task_id=task_id,
            user_id=int(user_id),
            project_id=project_id,
            platform=platform,
            task_type="fetch_url",
            url=url,
            params={"method": method}
        )
        
        result = await dispatch_fetch_to_plugin(
            user_id=user_id,
            task_id=task_id,
            platform=platform,
            url=url,
            method=method,
            headers=headers,
            body=body,
            timeout=timeout
        )
        
        if not result:
            utils.logger.warning(f"[PluginCrawler] Task {short_task_id} failed or timed out")
            await self._update_task_status(task_id, "failed", error="Timeout or no result")
            return None
        
        if not result.get("success"):
            error_msg = result.get("error", "Unknown error")
            utils.logger.error(f"[PluginCrawler] Task {short_task_id} error: {error_msg}")
            await self._update_task_status(task_id, "failed", error=error_msg)
            return None
        
        # Success - update task record
        await self._update_task_status(task_id, "completed", result={"success": True})
        
        return result.get("response")
    
    async def _create_task_record(
        self,
        task_id: str,
        user_id: int,
        project_id: Optional[int],
        platform: str,
        task_type: str,
        url: str,
        params: Optional[Dict] = None
    ):
        """Create a PluginTask record for tracking"""
        try:
            from database.db_session import get_session
            from database.growhub_models import PluginTask
            
            async with get_session() as session:
                task = PluginTask(
                    task_id=task_id,
                    user_id=user_id,
                    project_id=project_id,
                    platform=platform,
                    task_type=task_type,
                    url=url,
                    params=params,
                    status="running",
                    dispatched_at=datetime.now()
                )
                session.add(task)
                await session.commit()
        except Exception as e:
            utils.logger.warning(f"[PluginCrawler] Failed to create task record: {e}")
    
    async def _update_task_status(
        self,
        task_id: str,
        status: str,
        result: Optional[Dict] = None,
        error: Optional[str] = None
    ):
        """Update PluginTask status after execution"""
        try:
            from database.db_session import get_session
            from database.growhub_models import PluginTask
            from sqlalchemy import update
            
            async with get_session() as session:
                stmt = update(PluginTask).where(PluginTask.task_id == task_id).values(
                    status=status,
                    result=result,
                    error_message=error,
                    completed_at=datetime.now()
                )
                await session.execute(stmt)
                await session.commit()
        except Exception as e:
            utils.logger.warning(f"[PluginCrawler] Failed to update task status: {e}")
    
    async def search_notes(
        self,
        user_id: str,
        platform: str,
        keyword: str,
        page: int = 1,
        page_size: int = 20
    ) -> List[Dict]:
        """
        Search notes using plugin.
        
        Args:
            user_id: User whose plugin executes the search
            platform: Target platform (xhs, dy)
            keyword: Search keyword
            page: Page number
            page_size: Results per page
            
        Returns:
            List of note dictionaries
        """
        if platform == "xhs":
            notes = await self._search_xhs(user_id, keyword, page, page_size)
        elif platform == "dy":
            notes = await self._search_douyin(user_id, keyword, page, page_size)
        else:
            utils.logger.warning(f"[PluginCrawler] Unsupported platform for search: {platform}")
            return []
            
        # Attach search keyword to each note for association during storage
        for note in notes:
            note["source_keyword"] = keyword
            
        return notes
    
    async def _search_xhs(
        self,
        user_id: str,
        keyword: str,
        page: int,
        page_size: int
    ) -> List[Dict]:
        """XHS specific search implementation"""
        import json
        from urllib.parse import quote
        
        # Build the XHS search API URL
        # Note: This is a simplified version. Real implementation needs proper
        # headers, signatures, etc. that the plugin handles.
        search_params = {
            "keyword": keyword,
            "page": page,
            "page_size": page_size,
            "sort": "general",
            "note_type": 0
        }
        
        # Construct URL - plugin will add necessary cookies and headers
        base_url = self.platform_search_urls["xhs"]
        query_string = "&".join([f"{k}={quote(str(v))}" for k, v in search_params.items()])
        url = f"{base_url}?{query_string}"
        
        # Request body for XHS search (POST request)
        body = json.dumps({
            "keyword": keyword,
            "page": page,
            "page_size": page_size,
            "search_id": "",
            "sort": "general",
            "note_type": 0,
            "ext_flags": [],
            "image_scenes": ""
        })
        
        response = await self.fetch_url(
            user_id=user_id,
            platform="xhs",
            url=url,
            method="POST",
            headers={"Content-Type": "application/json"},
            body=body,
            timeout=30.0
        )
        
        if not response:
            return []
        
        # Parse response  
        return self._parse_xhs_search_response(response)
    
    def _parse_xhs_search_response(self, response: Dict) -> List[Dict]:
        """Parse XHS search API response into note list"""
        notes = []
        try:
            # Response from plugin contains: status, body, headers
            body = response.get("body", "{}")
            if isinstance(body, str):
                import json
                body = json.loads(body)
            
            # XHS API structure: {success: true, data: {items: [...]}}
            data = body.get("data", {})
            items = data.get("items", [])
            
            for item in items:
                # Skip non-note items (rec_query, hot_query, etc.)
                if item.get("model_type") in ("rec_query", "hot_query", "ad"):
                    continue
                
                note_card = item.get("note_card", item)
                note = {
                    "note_id": item.get("id") or note_card.get("note_id"),
                    "title": note_card.get("title", ""),
                    "desc": note_card.get("desc", ""),
                    "type": note_card.get("type", "normal"),
                    "user": note_card.get("user", {}),
                    "interact_info": note_card.get("interact_info", {}),
                    "xsec_token": item.get("xsec_token"),
                    "xsec_source": item.get("xsec_source"),
                    "source": "plugin_search"
                }
                notes.append(note)
                
        except Exception as e:
            utils.logger.error(f"[PluginCrawler] Parse XHS search response error: {e}")
        
        return notes
    
    async def _search_douyin(
        self,
        user_id: str,
        keyword: str,
        page: int,
        page_size: int
    ) -> List[Dict]:
        """Douyin specific search implementation"""
        from urllib.parse import quote
        
        # Build Douyin search URL
        offset = (page - 1) * page_size
        url = (
            f"{self.platform_search_urls['dy']}"
            f"?keyword={quote(keyword)}"
            f"&offset={offset}"
            f"&count={page_size}"
            f"&search_source=normal_search"
        )
        
        response = await self.fetch_url(
            user_id=user_id,
            platform="dy",
            url=url,
            method="GET",
            timeout=30.0
        )
        
        if not response:
            return []
        
        return self._parse_douyin_search_response(response)
    
    def _parse_douyin_search_response(self, response: Dict) -> List[Dict]:
        """Parse Douyin search API response into note list"""
        notes = []
        try:
            body = response.get("body", "{}")
            if isinstance(body, str):
                import json
                body = json.loads(body)
            
            aweme_list = body.get("data", [])
            
            for aweme in aweme_list:
                note = {
                    "note_id": aweme.get("aweme_id"),
                    "title": aweme.get("desc", ""),
                    "type": "video",
                    "user": {
                        "user_id": aweme.get("author", {}).get("uid"),
                        "nickname": aweme.get("author", {}).get("nickname"),
                    },
                    "interact_info": {
                        "like_count": aweme.get("statistics", {}).get("digg_count", 0),
                        "comment_count": aweme.get("statistics", {}).get("comment_count", 0),
                        "share_count": aweme.get("statistics", {}).get("share_count", 0),
                    },
                    "source": "plugin_search"
                }
                notes.append(note)
                
        except Exception as e:
            utils.logger.error(f"[PluginCrawler] Parse Douyin search response error: {e}")
        
        return notes
    
    async def get_note_detail(
        self,
        user_id: str,
        platform: str,
        note_id: str,
        xsec_token: Optional[str] = None
    ) -> Optional[Dict]:
        """
        Get detailed information of a specific note.
        
        Args:
            user_id: User whose plugin executes the request
            platform: Target platform
            note_id: Note/video ID
            xsec_token: Security token (for XHS)
            
        Returns:
            Note detail dictionary or None
        """
        if platform == "xhs":
            return await self._get_xhs_note_detail(user_id, note_id, xsec_token)
        elif platform == "dy":
            return await self._get_douyin_note_detail(user_id, note_id)
        else:
            utils.logger.warning(f"[PluginCrawler] Unsupported platform for detail: {platform}")
            return None
    
    async def _get_xhs_note_detail(
        self,
        user_id: str,
        note_id: str,
        xsec_token: Optional[str]
    ) -> Optional[Dict]:
        """Get XHS note detail"""
        import json
        
        url = self.platform_detail_urls["xhs"]
        
        body = json.dumps({
            "source_note_id": note_id,
            "image_formats": ["jpg", "webp", "avif"],
            "extra": {"need_body_topic": "1"}
        })
        
        headers = {"Content-Type": "application/json"}
        if xsec_token:
            headers["X-s-Common"] = xsec_token  # Simplified; real logic is complex
        
        response = await self.fetch_url(
            user_id=user_id,
            platform="xhs",
            url=url,
            method="POST",
            headers=headers,
            body=body,
            timeout=30.0
        )
        
        if not response:
            return None
        
        return self._parse_xhs_detail_response(response, note_id)
    
    def _parse_xhs_detail_response(self, response: Dict, note_id: str) -> Optional[Dict]:
        """Parse XHS note detail response"""
        try:
            body = response.get("body", "{}")
            if isinstance(body, str):
                import json
                body = json.loads(body)
            
            # XHS detail API structure varies
            data = body.get("data", {})
            items = data.get("items", [])
            
            if not items:
                return None
            
            note_data = items[0].get("note_card", items[0])
            
            return {
                "note_id": note_id,
                "title": note_data.get("title", ""),
                "desc": note_data.get("desc", ""),
                "type": note_data.get("type", "normal"),
                "user": note_data.get("user", {}),
                "interact_info": note_data.get("interact_info", {}),
                "image_list": note_data.get("image_list", []),
                "video": note_data.get("video", {}),
                "tag_list": note_data.get("tag_list", []),
                "time": note_data.get("time", 0),
                "last_update_time": note_data.get("last_update_time", 0),
                "source": "plugin_detail"
            }
            
        except Exception as e:
            utils.logger.error(f"[PluginCrawler] Parse XHS detail error: {e}")
            return None
    
    async def _get_douyin_note_detail(
        self,
        user_id: str,
        note_id: str
    ) -> Optional[Dict]:
        """Get Douyin video detail"""
        url = f"{self.platform_detail_urls['dy']}?aweme_id={note_id}"
        
        response = await self.fetch_url(
            user_id=user_id,
            platform="dy",
            url=url,
            method="GET",
            timeout=30.0
        )
        
        if not response:
            return None
        
        return self._parse_douyin_detail_response(response)
    
    def _parse_douyin_detail_response(self, response: Dict) -> Optional[Dict]:
        """Parse Douyin video detail response"""
        try:
            body = response.get("body", "{}")
            if isinstance(body, str):
                import json
                body = json.loads(body)
            
            aweme = body.get("aweme_detail", {})
            if not aweme:
                return None
            
            return {
                "note_id": aweme.get("aweme_id"),
                "title": aweme.get("desc", ""),
                "type": "video",
                "user": {
                    "user_id": aweme.get("author", {}).get("uid"),
                    "nickname": aweme.get("author", {}).get("nickname"),
                    "avatar": aweme.get("author", {}).get("avatar_thumb", {}).get("url_list", [None])[0],
                },
                "interact_info": {
                    "like_count": aweme.get("statistics", {}).get("digg_count", 0),
                    "comment_count": aweme.get("statistics", {}).get("comment_count", 0),
                    "share_count": aweme.get("statistics", {}).get("share_count", 0),
                    "collect_count": aweme.get("statistics", {}).get("collect_count", 0),
                },
                "video_url": aweme.get("video", {}).get("play_addr", {}).get("url_list", [None])[0],
                "create_time": aweme.get("create_time", 0),
                "source": "plugin_detail"
            }
            
        except Exception as e:
            utils.logger.error(f"[PluginCrawler] Parse Douyin detail error: {e}")
            return None
    
    async def save_notes_to_db(
        self,
        platform: str,
        notes: List[Dict],
        project_id: Optional[int] = None
    ) -> int:
        """
        Save collected notes to database using existing store logic.
        
        Args:
            platform: Platform code
            notes: List of note dictionaries
            project_id: Associated project ID
            
        Returns:
            Number of notes saved
        """
        from var import project_id_var, source_keyword_var
        saved = 0
        
        # Set project context if provided
        token = None
        if project_id:
            token = project_id_var.set(project_id)
        
        try:
            if platform == "xhs":
                from store import xhs as xhs_store
                for note in notes:
                    # Set source_keyword context for each note if available
                    kw_token = None
                    if note.get("source_keyword"):
                        kw_token = source_keyword_var.set(note.get("source_keyword"))
                    
                    await xhs_store.update_xhs_note(note)
                    
                    if kw_token:
                        source_keyword_var.reset(kw_token)
                        
                    saved += 1
                    
            elif platform == "dy":
                from store import dy as dy_store
                for note in notes:
                    kw_token = None
                    if note.get("source_keyword"):
                        kw_token = source_keyword_var.set(note.get("source_keyword"))
                        
                    await dy_store.update_douyin_note(note)
                    
                    if kw_token:
                        source_keyword_var.reset(kw_token)
                        
                    saved += 1
                    
        except Exception as e:
            utils.logger.error(f"[PluginCrawler] Save notes error: {e}")
        finally:
            if token:
                project_id_var.reset(token)
        
        utils.logger.info(f"[PluginCrawler] Saved {saved}/{len(notes)} notes for platform {platform}")
        return saved


# Singleton instance
_plugin_crawler_service: Optional[PluginCrawlerService] = None


def get_plugin_crawler_service() -> PluginCrawlerService:
    """Get or create the plugin crawler service instance"""
    global _plugin_crawler_service
    if _plugin_crawler_service is None:
        _plugin_crawler_service = PluginCrawlerService()
    return _plugin_crawler_service
