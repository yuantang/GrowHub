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
            "dy": "https://www.douyin.com/aweme/v1/web/general/search/single/",
            "bili": "https://api.bilibili.com/x/web-interface/search/type",
            "wb": "https://m.weibo.cn/api/container/getIndex",
            "ks": "https://www.kuaishou.com/graphql",
        }
        
        # Platform API endpoints for note detail
        self.platform_detail_urls = {
            "xhs": "https://edith.xiaohongshu.com/api/sns/web/v1/feed",
            "dy": "https://www.douyin.com/aweme/v1/web/aweme/detail/",
            "bili": "https://api.bilibili.com/x/web-interface/view",
            "wb": "https://m.weibo.cn/statuses/show",
            "ks": "https://www.kuaishou.com/graphql",
        }

        # Platform API endpoints for comments
        self.platform_comment_urls = {
            "xhs": "https://edith.xiaohongshu.com/api/sns/web/v2/comment/page",
            "dy": "https://www.douyin.com/aweme/v1/web/comment/list/",
            "bili": "https://api.bilibili.com/x/v2/reply",
            "wb": "https://m.weibo.cn/comments/hotflow",
            "ks": "https://www.kuaishou.com/graphql",
        }
        
        # Platform cooling status (platform:user_id -> cooldown_until)
        self._cooldowns: Dict[str, datetime] = {}
    
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
        timeout: float = 90.0,
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
        
        # Check cooling status
        cooldown_key = f"{platform}:{user_id}"
        if cooldown_key in self._cooldowns:
            if datetime.now() < self._cooldowns[cooldown_key]:
                wait_sec = (self._cooldowns[cooldown_key] - datetime.now()).total_seconds()
                utils.logger.warning(f"[PluginCrawler] Platform {platform} is in COOLDOWN for user {user_id}. Wait {wait_sec:.0f}s")
                return None
            else:
                del self._cooldowns[cooldown_key]

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
        
        utils.logger.info(f"[PluginCrawler] TASK_START | Task={short_task_id} | User={user_id} | Plat={platform}")
        
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
        
        utils.logger.info(f"[PluginCrawler] TASK_DISPATCH_RETURN | Task={short_task_id} | Success={bool(result)}")
        
        if not result:
            utils.logger.warning(f"[PluginCrawler] Task {short_task_id} failed or timed out. ⚠️ Please check if 'GrowHub Plugin Active' banner is visible on the target tab.")
            await self._update_task_status(task_id, "failed", error="Timeout or no result")
            return None
        
        if not result.get("success"):
            error_msg = result.get("error", "Unknown error")
            utils.logger.error(f"[PluginCrawler] Task {short_task_id} error: {error_msg}")
            await self._update_task_status(task_id, "failed", error=error_msg)
            return None
        
        # Success - update task record
        await self._update_task_status(task_id, "completed", result={"success": True})
        
        response_data = result.get("response", {})
        
        # Trigger dynamic cooling if 429 or captcha detected
        status_code = response_data.get("status")
        body = response_data.get("body", "")
        if status_code == 429 or "verify" in body.lower() or "captcha" in body.lower():
            from datetime import timedelta
            cooldown_min = 5
            self._cooldowns[cooldown_key] = datetime.now() + timedelta(minutes=cooldown_min)
            utils.logger.error(f"⚠️ [PluginCrawler] Rate limit detected (Status {status_code}). Cooling {platform} for user {user_id} for {cooldown_min}min.")
            
            # Update account status in DB/Pool if possible
            try:
                from .account_pool import get_account_pool, AccountPlatform, AccountStatus
                pool = get_account_pool()
                # Find matching account... (simplified for now as we don't have account_id here easily)
            except: pass
            
        return response_data
    
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
        elif platform == "bili":
            notes = await self._search_bilibili(user_id, keyword, page, page_size)
        elif platform == "wb":
            notes = await self._search_weibo(user_id, keyword, page, page_size)
        elif platform == "ks":
            notes = await self._search_kuaishou(user_id, keyword, page, page_size)
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
        
        # Build Douyin search URL (Modern /general/search/single/)
        offset = (page - 1) * page_size
        url = (
            f"{self.platform_search_urls['dy']}"
            f"?keyword={quote(keyword)}"
            f"&offset={offset}"
            f"&count={page_size}"
            f"&sort_type=0&publish_time=0&filter_duration=0"
            f"&search_source=normal_search&query_correct_type=1"
            f"&is_filter_search=0&from_group_id=&common_params_str="
        )
        
        response = await self.fetch_url(
            user_id=user_id,
            platform="dy",
            url=url,
            method="GET",
            timeout=90.0
        )
        
        if not response:
            return []
        
        return self._parse_douyin_search_response(response) 
    
    def _parse_douyin_search_response(self, response: Dict) -> List[Dict]:
        """Parse Douyin search API response or SSR data into note list"""
        notes = []
        try:
            body = response.get("body", "{}")
            if isinstance(body, str):
                import json
                body = json.loads(body)
            
            # 1. Standard API Format (/general/search/single/ or /web/search/item/)
            data_list = body.get("data", [])
            if not data_list:
                # Some versions use aweme_list directly
                data_list = body.get("aweme_list", [])
            
            # 2. SSR Format Handling (Recursive search)
            if not data_list:
                utils.logger.info(f"[PluginCrawler] No standard data list found. Body keys: {list(body.keys())}")
                data_list = self._find_list_recursively(body, "aweme_list") or self._find_list_recursively(body, "aweme_info") or []

            for item in data_list:
                # Handle different nesting levels
                aweme = item.get("aweme_info") if isinstance(item, dict) and item.get("aweme_info") else item
                
                if isinstance(aweme, dict) and aweme.get("aweme_id"):
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
                
            utils.logger.info(f"[PluginCrawler] Douyin parser extracted {len(notes)} notes")
                
        except Exception as e:
            utils.logger.error(f"[PluginCrawler] Parse Douyin search response error: {e}")
            import traceback
            utils.logger.error(traceback.format_exc())
        
        return notes

    def _find_list_recursively(self, obj: Any, target_key: str) -> Optional[List]:
        """Deep search for a list by key in nested Dict/List"""
        if isinstance(obj, dict):
            if target_key in obj and isinstance(obj[target_key], list):
                return obj[target_key]
            for v in obj.values():
                res = self._find_list_recursively(v, target_key)
                if res: return res
        elif isinstance(obj, list):
            for item in obj:
                res = self._find_list_recursively(item, target_key)
                if res: return res
        return None
    async def _search_bilibili(self, user_id: str, keyword: str, page: int = 1) -> List[Dict[str, Any]]:
        """Search Bilibili using plugin"""
        import urllib.parse
        encoded_keyword = urllib.parse.quote(keyword)
        url = f"{self.platform_search_urls['bili']}?search_type=video&keyword={encoded_keyword}&page={page}"
        
        response = await self.fetch_url(
            user_id=user_id,
            platform="bili",
            url=url,
            method="GET",
            timeout=30.0
        )
        
        if not response:
            return []
            
        return self._parse_bilibili_search_response(response)

    def _parse_bilibili_search_response(self, response: Dict) -> List[Dict]:
        """Parse Bilibili search API response"""
        notes = []
        try:
            body = response.get("body", "{}")
            if isinstance(body, str):
                import json
                body = json.loads(body)
            
            data = body.get("data", {})
            result_list = data.get("result", [])
            
            # Bilibili returns result as a list of types, find the video one
            if isinstance(result_list, list):
                for item in result_list:
                    if isinstance(item, dict) and item.get("result_type") == "video":
                        # This found the video results
                        for video in item.get("data", []):
                            note = {
                                "note_id": str(video.get("bvid", video.get("aid"))),
                                "title": video.get("title", "").replace("<em class=\"keyword\">", "").replace("</em>", ""),
                                "type": "video",
                                "user": {
                                    "user_id": str(video.get("mid")),
                                    "nickname": video.get("author"),
                                },
                                "interact_info": {
                                    "like_count": video.get("like", 0),
                                    "comment_count": video.get("review", 0),
                                    "view_count": video.get("play", 0),
                                },
                                "source": "plugin_search"
                            }
                            notes.append(note)
                        break
        except Exception as e:
            utils.logger.error(f"[PluginCrawler] Parse Bilibili search response error: {e}")
        return notes

    async def _search_weibo(self, user_id: str, keyword: str, page: int, page_size: int) -> List[Dict]:
        """Search Weibo using plugin"""
        import urllib.parse
        encoded_keyword = urllib.parse.quote(keyword)
        # Using M-site API which is easier to parse
        url = f"https://m.weibo.cn/api/container/getIndex?containerid=100103type%3D1%26q%3D{encoded_keyword}&page_type=searchall&page={page}"
        
        response = await self.fetch_url(
            user_id=user_id,
            platform="wb",
            url=url,
            method="GET",
            timeout=30.0
        )
        
        if not response:
            return []
            
        return self._parse_weibo_search_response(response)

    def _parse_weibo_search_response(self, response: Dict) -> List[Dict]:
        """Parse Weibo search API response"""
        notes = []
        try:
            body = response.get("body", "{}")
            if isinstance(body, str):
                import json
                body = json.loads(body)
            
            cards = body.get("data", {}).get("cards", [])
            for card in cards:
                if card.get("card_type") == 11 and "card_group" in card:
                    for item in card.get("card_group", []):
                        mblog = item.get("mblog")
                        if mblog:
                            note = {
                                "note_id": str(mblog.get("id")),
                                "title": mblog.get("text", ""), # This is the full text
                                "type": "post",
                                "user": {
                                    "user_id": str(mblog.get("user", {}).get("id")),
                                    "nickname": mblog.get("user", {}).get("screen_name"),
                                },
                                "interact_info": {
                                    "like_count": mblog.get("attitudes_count", 0),
                                    "comment_count": mblog.get("comments_count", 0),
                                    "share_count": mblog.get("reposts_count", 0),
                                },
                                "source": "plugin_search"
                            }
                            notes.append(note)
                elif card.get("card_type") == 9: # Direct mblog card
                    mblog = card.get("mblog")
                    if mblog:
                        note = {
                            "note_id": str(mblog.get("id")),
                            "title": mblog.get("text", ""),
                            "type": "post",
                            "user": {
                                "user_id": str(mblog.get("user", {}).get("id")),
                                "nickname": mblog.get("user", {}).get("screen_name"),
                            },
                                "interact_info": {
                                "like_count": mblog.get("attitudes_count", 0),
                                "comment_count": mblog.get("comments_count", 0),
                                "share_count": mblog.get("reposts_count", 0),
                            },
                            "source": "plugin_search"
                        }
                        notes.append(note)
        except Exception as e:
            utils.logger.error(f"[PluginCrawler] Parse Weibo search response error: {e}")
        return notes

    async def _search_kuaishou(self, user_id: str, keyword: str, page: int, page_size: int) -> List[Dict]:
        """Search Kuaishou using plugin (GraphQL)"""
        url = self.platform_search_urls['ks']
        query = """
        query visionSearchPhoto($keyword: String, $pcursor: String, $searchSessionId: String, $page: String, $webPageArea: String) {
          visionSearchPhoto(keyword: $keyword, pcursor: $pcursor, searchSessionId: $searchSessionId, page: $page, webPageArea: $webPageArea) {
            result
            llData {
              searchSessionId
            }
            feeds {
              type
              author {
                id
                name
                headerUrl
              }
              photo {
                id
                caption
                likeCount
                commentCount
                viewCount
                realLikeCount
              }
              tags {
                name
                type
              }
            }
          }
        }
        """
        variables = {
            "keyword": keyword,
            "pcursor": str(page - 1),
            "page": "search",
            "searchSessionId": ""
        }
        
        import json
        payload = {
            "operationName": "visionSearchPhoto",
            "variables": variables,
            "query": query
        }
        
        response = await self.fetch_url(
            user_id=user_id,
            platform="ks",
            url=url,
            method="POST",
            headers={"Content-Type": "application/json"},
            body=json.dumps(payload),
            timeout=30.0
        )
        
        if not response:
            return []
            
        return self._parse_kuaishou_search_response(response)

    def _parse_kuaishou_search_response(self, response: Dict) -> List[Dict]:
        """Parse Kuaishou search API response"""
        notes = []
        try:
            body = response.get("body", "{}")
            if isinstance(body, str):
                import json
                body = json.loads(body)
            
            feeds = body.get("data", {}).get("visionSearchPhoto", {}).get("feeds", [])
            for feed in feeds:
                photo = feed.get("photo", {})
                author = feed.get("author", {})
                if photo:
                    note = {
                        "note_id": str(photo.get("id")),
                        "title": photo.get("caption", ""),
                        "type": "video" if feed.get("type") == 1 else "image",
                        "user": {
                            "user_id": str(author.get("id")),
                            "nickname": author.get("name"),
                        },
                        "interact_info": {
                            "like_count": photo.get("realLikeCount", photo.get("likeCount", 0)),
                            "comment_count": photo.get("commentCount", 0),
                            "view_count": photo.get("viewCount", 0),
                        },
                        "source": "plugin_search"
                    }
                    notes.append(note)
        except Exception as e:
            utils.logger.error(f"[PluginCrawler] Parse Kuaishou search response error: {e}")
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
        elif platform == "bili":
            return await self._get_bilibili_note_detail(user_id, note_id)
        elif platform == "wb":
            return await self._get_weibo_note_detail(user_id, note_id)
        elif platform == "ks":
            return await self._get_kuaishou_note_detail(user_id, note_id)
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
    

    async def _get_bilibili_note_detail(self, user_id: str, note_id: str) -> Optional[Dict]:
        """Get Bilibili video detail"""
        url = f"{self.platform_detail_urls['bili']}?bvid={note_id}" if note_id.startswith("BV") else f"{self.platform_detail_urls['bili']}?aid={note_id}"
        
        response = await self.fetch_url(
            user_id=user_id,
            platform="bili",
            url=url,
            method="GET",
            timeout=30.0
        )
        
        if not response:
            return None
            
        return self._parse_bilibili_detail_response(response)

    def _parse_bilibili_detail_response(self, response: Dict) -> Optional[Dict]:
        """Parse Bilibili video detail response"""
        try:
            body = response.get("body", "{}")
            if isinstance(body, str):
                import json
                body = json.loads(body)
            
            data = body.get("data", {})
            if not data:
                return None
                
            return {
                "note_id": str(data.get("bvid", data.get("aid"))),
                "title": data.get("title", ""),
                "desc": data.get("desc", ""),
                "type": "video",
                "user": {
                    "user_id": str(data.get("owner", {}).get("mid")),
                    "nickname": data.get("owner", {}).get("name"),
                    "avatar": data.get("owner", {}).get("face"),
                },
                "interact_info": {
                    "like_count": data.get("stat", {}).get("like", 0),
                    "comment_count": data.get("stat", {}).get("reply", 0),
                    "view_count": data.get("stat", {}).get("view", 0),
                    "collect_count": data.get("stat", {}).get("favorite", 0),
                    "share_count": data.get("stat", {}).get("share", 0),
                },
                "video_url": f"https://www.bilibili.com/video/{data.get('bvid')}",
                "create_time": data.get("pubdate", 0),
                "source": "plugin_detail"
            }
        except Exception as e:
            utils.logger.error(f"[PluginCrawler] Parse Bilibili detail error: {e}")
            return None

    async def _get_weibo_note_detail(self, user_id: str, note_id: str) -> Optional[Dict]:
        """Get Weibo post detail"""
        url = f"{self.platform_detail_urls['wb']}?id={note_id}"
        
        response = await self.fetch_url(
            user_id=user_id,
            platform="wb",
            url=url,
            method="GET",
            timeout=30.0
        )
        
        if not response:
            return None
            
        return self._parse_weibo_detail_response(response)

    def _parse_weibo_detail_response(self, response: Dict) -> Optional[Dict]:
        """Parse Weibo post detail response"""
        try:
            body = response.get("body", "{}")
            if isinstance(body, str):
                import json
                body = json.loads(body)
            
            data = body.get("data", {})
            if not data:
                return None
                
            return {
                "note_id": str(data.get("id")),
                "title": data.get("text", "")[:100],
                "desc": data.get("text", ""),
                "type": "post",
                "user": {
                    "user_id": str(data.get("user", {}).get("id")),
                    "nickname": data.get("user", {}).get("screen_name"),
                    "avatar": data.get("user", {}).get("profile_image_url"),
                },
                "interact_info": {
                    "like_count": data.get("attitudes_count", 0),
                    "comment_count": data.get("comments_count", 0),
                    "share_count": data.get("reposts_count", 0),
                },
                "create_time": 0, # Weibo uses RFC2822 date string, needs conversion if wanted
                "source": "plugin_detail"
            }
        except Exception as e:
            utils.logger.error(f"[PluginCrawler] Parse Weibo detail error: {e}")
            return None

    async def _get_kuaishou_note_detail(self, user_id: str, note_id: str) -> Optional[Dict]:
        """Get Kuaishou video detail using GraphQL"""
        url = self.platform_detail_urls["ks"]
        query = """
        query visionVideoDetail($photoId: String, $type: String, $page: String, $webPageArea: String) {
          visionVideoDetail(photoId: $photoId, type: $type, page: $page, webPageArea: $webPageArea) {
            result
            photo {
              id
              caption
              likeCount
              commentCount
              viewCount
              realLikeCount
              timestamp
              photoUrl
              coverUrl
              author {
                id
                name
                headerUrl
              }
            }
          }
        }
        """
        payload = {
            "operationName": "visionVideoDetail",
            "variables": {"photoId": note_id, "type": "single", "page": "detail"},
            "query": query
        }
        
        import json
        response = await self.fetch_url(
            user_id=user_id,
            platform="ks",
            url=url,
            method="POST",
            headers={"Content-Type": "application/json"},
            body=json.dumps(payload),
            timeout=30.0
        )
        
        if not response:
            return None
            
        return self._parse_kuaishou_detail_response(response)

    def _parse_kuaishou_detail_response(self, response: Dict) -> Optional[Dict]:
        """Parse Kuaishou video detail response"""
        try:
            body = response.get("body", "{}")
            if isinstance(body, str):
                import json
                body = json.loads(body)
            
            photo = body.get("data", {}).get("visionVideoDetail", {}).get("photo", {})
            if not photo:
                return None
                
            author = photo.get("author", {})
            return {
                "note_id": str(photo.get("id")),
                "title": photo.get("caption", ""),
                "desc": photo.get("caption", ""),
                "type": "video",
                "user": {
                    "user_id": str(author.get("id")),
                    "nickname": author.get("name"),
                    "avatar": author.get("headerUrl"),
                },
                "interact_info": {
                    "like_count": photo.get("realLikeCount", photo.get("likeCount", 0)),
                    "comment_count": photo.get("commentCount", 0),
                    "view_count": photo.get("viewCount", 0),
                },
                "video_url": photo.get("photoUrl"),
                "create_time": photo.get("timestamp"),
                "source": "plugin_detail"
            }
        except Exception as e:
            utils.logger.error(f"[PluginCrawler] Parse Kuaishou detail error: {e}")
            return None

    async def get_note_comments(
        self,
        user_id: str,
        platform: str,
        note_id: str,
        xsec_token: Optional[str] = None,
        cursor: str = ""
    ) -> List[Dict]:
        """Fetch comments for a note using plugin"""
        if platform == "xhs":
            url = f"{self.platform_comment_urls['xhs']}?note_id={note_id}&cursor={cursor}&xsec_token={xsec_token or ''}"
            response = await self.fetch_url(user_id, platform, url)
            if response:
                body = utils.json_loads(response.get("body", "{}"))
                return body.get("data", {}).get("comments", [])
        # Similar logic for other platforms... (Bili/Dy/etc)
        return []

    async def save_comments_to_db(self, platform: str, note_id: str, comments: List[Dict]):
        """Save collected comments to database"""
        try:
            if platform == "xhs":
                from store.xhs import batch_update_xhs_note_comments
                await batch_update_xhs_note_comments(note_id, comments)
            elif platform == "dy":
                from store.douyin import batch_update_dy_video_comments
                await batch_update_dy_video_comments(note_id, comments)
            elif platform == "bili":
                from store.bilibili import batch_update_bili_video_comments
                await batch_update_bili_video_comments(note_id, comments)
            elif platform == "ks":
                from store.kuaishou import batch_update_ks_video_comments
                await batch_update_ks_video_comments(note_id, comments)
            elif platform == "wb":
                from store.weibo import batch_update_wb_note_comments
                await batch_update_wb_note_comments(note_id, comments)
        except Exception as e:
            utils.logger.error(f"[PluginCrawler] Save comments error: {e}")

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
                from store.douyin import update_douyin_note
                for note in notes:
                    kw_token = None
                    if note.get("source_keyword"):
                        kw_token = source_keyword_var.set(note.get("source_keyword"))
                        
                    await update_douyin_note(note)
                    
                    if kw_token:
                        source_keyword_var.reset(kw_token)
                        
                    saved += 1
            
            elif platform == "bili":
                from store.bilibili import update_bilibili_note
                for note in notes:
                    kw_token = None
                    if note.get("source_keyword"):
                        kw_token = source_keyword_var.set(note.get("source_keyword"))
                        
                    await update_bilibili_note(note)
                    
                    if kw_token:
                        source_keyword_var.reset(kw_token)
                        
                    saved += 1
            
            elif platform == "wb":
                from store.weibo import update_weibo_note
                for note in notes:
                    kw_token = None
                    if note.get("source_keyword"):
                        kw_token = source_keyword_var.set(note.get("source_keyword"))
                        
                    await update_weibo_note(note)
                    
                    if kw_token:
                        source_keyword_var.reset(kw_token)
                        
                    saved += 1
            
            elif platform == "ks":
                from store.kuaishou import update_kuaishou_note
                for note in notes:
                    kw_token = None
                    if note.get("source_keyword"):
                        kw_token = source_keyword_var.set(note.get("source_keyword"))
                        
                    await update_kuaishou_note(note)
                    
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
