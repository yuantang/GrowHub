# -*- coding: utf-8 -*-
# Copyright (c) 2025 relakkes@gmail.com
#
# This file is part of MediaCrawler project.
# Repository: https://github.com/NanmiCoder/MediaCrawler/blob/main/media_platform/xhs/client.py
# GitHub: https://github.com/NanmiCoder
# Licensed under NON-COMMERCIAL LEARNING LICENSE 1.1
#

# 声明：本代码仅供学习和研究目的使用。使用者应遵守以下原则：
# 1. 不得用于任何商业用途。
# 2. 使用时应遵守目标平台的使用条款和robots.txt规则。
# 3. 不得进行大规模爬取或对平台造成运营干扰。
# 4. 应合理控制请求频率，避免给目标平台带来不必要的负担。
# 5. 不得用于任何非法或不当的用途。
#
# 详细许可条款请参阅项目根目录下的LICENSE文件。
# 使用本代码即表示您同意遵守上述原则和LICENSE中的所有条款。

import asyncio
import json
from typing import TYPE_CHECKING, Any, Callable, Dict, List, Optional, Union
from urllib.parse import urlencode

import httpx
from playwright.async_api import BrowserContext, Page
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

import config
from base.base_crawler import AbstractApiClient
from proxy.proxy_mixin import ProxyRefreshMixin
from tools import utils

if TYPE_CHECKING:
    from proxy.proxy_ip_pool import ProxyIpPool

from .exception import DataFetchError, IPBlockError
from .field import SearchNoteType, SearchSortType
from .help import get_search_id
from .extractor import XiaoHongShuExtractor
from .playwright_sign import sign_with_playwright


class XiaoHongShuClient(AbstractApiClient, ProxyRefreshMixin):

    def __init__(
        self,
        timeout=60,  # If media crawling is enabled, Xiaohongshu long videos need longer timeout
        proxy=None,
        *,
        headers: Dict[str, str],
        playwright_page: Page,
        cookie_dict: Dict[str, str],
        proxy_ip_pool: Optional["ProxyIpPool"] = None,
    ):
        self.proxy = proxy
        self.timeout = timeout
        self.headers = headers
        self._host = "https://edith.xiaohongshu.com"
        self._domain = "https://www.xiaohongshu.com"
        self.IP_ERROR_STR = "Network connection error, please check network settings or restart"
        self.IP_ERROR_CODE = 300012
        self.NOTE_ABNORMAL_STR = "Note status abnormal, please check later"
        self.NOTE_ABNORMAL_CODE = -510001
        self.playwright_page = playwright_page
        self.cookie_dict = cookie_dict
        self._extractor = XiaoHongShuExtractor()
        # Initialize proxy pool (from ProxyRefreshMixin)
        # Pro Feature: Pass ACCOUNT_ID for IP-Account affinity
        import config
        self.init_proxy_pool(proxy_ip_pool, account_id=config.ACCOUNT_ID)

    async def _pre_headers(self, url: str, params: Optional[Dict] = None, payload: Optional[Dict] = None) -> Dict:
        """Request header parameter signing (using playwright injection method)

        Args:
            url: Request URL
            params: GET request parameters
            payload: POST request parameters

        Returns:
            Dict: Signed request header parameters
        """
        # P3 Fix: Periodically refresh cookies from browser to stay in sync
        if not hasattr(self, '_request_count'):
            self._request_count = 0
        self._request_count += 1
        
        if self._request_count % 10 == 0:  # Refresh every 10 requests
            try:
                if hasattr(self, 'playwright_page') and self.playwright_page:
                    ctx = self.playwright_page.context
                    await self.update_cookies(ctx)
                    utils.logger.info(f"[XiaoHongShuClient._pre_headers] Refreshed cookies (request #{self._request_count})")
            except Exception as e:
                utils.logger.warning(f"[XiaoHongShuClient._pre_headers] Cookie refresh failed: {e}")
        
        a1_value = self.cookie_dict.get("a1", "")
        
        # Debug logging for signature parameters
        utils.logger.info(f"[XiaoHongShuClient._pre_headers] Signing with a1: {a1_value[:10]}..." if a1_value else "[XiaoHongShuClient._pre_headers] Signing with EMPTY a1!")
        cookie_header = self.headers.get("Cookie", "")
        utils.logger.info(f"[XiaoHongShuClient._pre_headers] Current Cookie Header: {cookie_header[:50]}...")

        # Determine request data, method and URI
        if params is not None:
            data = params
            method = "GET"
        elif payload is not None:
            data = payload
            method = "POST"
        else:
            raise ValueError("params or payload is required")

        # Generate signature using playwright injection method
        signs = await sign_with_playwright(
            page=self.playwright_page,
            uri=url,
            data=data,
            a1=a1_value,
            method=method,
        )

        headers = {
            "X-S": signs["x-s"],
            "X-T": signs["x-t"],
            "x-S-Common": signs["x-s-common"],
            "X-B3-Traceid": signs["x-b3-traceid"],
        }
        self.headers.update(headers)
        return self.headers

    async def update_account_status(self, status: str):
        """Update account status in DB so API process can see it (Shared Pro Logic)
        P8 Fix: Uses optimistic locking to prevent race conditions
        """
        import config
        account_id = getattr(config, "ACCOUNT_ID", None)
        if not account_id:
            return
            
        try:
            from database.db_session import get_session
            from database.growhub_models import GrowHubAccount
            from sqlalchemy import update, select
            
            # P8 Fix: Status priority - don't downgrade from more severe status
            STATUS_PRIORITY = {
                "active": 1,
                "cooldown": 2,
                "banned": 3,
                "error": 4
            }
            
            async with get_session() as session:
                # Check current status first
                result = await session.execute(
                    select(GrowHubAccount.status).where(GrowHubAccount.id == account_id)
                )
                current_status = result.scalar()
                
                # Only update if new status is more severe or same
                current_priority = STATUS_PRIORITY.get(current_status, 0)
                new_priority = STATUS_PRIORITY.get(status, 0)
                
                if new_priority >= current_priority:
                    await session.execute(
                        update(GrowHubAccount)
                        .where(GrowHubAccount.id == account_id)
                        .values(
                            status=status,
                            updated_at=utils.get_current_datetime()
                        )
                    )
                    await session.commit()
                    utils.logger.warning(f"🚨 [XiaoHongShuClient] Account {account_id} status updated to: {status}")
                else:
                    utils.logger.info(f"[XiaoHongShuClient] Skipped status update: {status} (current: {current_status} has higher priority)")
        except Exception as e:
            utils.logger.error(f"[XiaoHongShuClient] Failed to update account status in DB: {e}")

    # R1 Fix: Exponential backoff retry for network errors (2s -> 4s -> 8s, max 3 attempts)
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=2, min=2, max=10),
        retry=retry_if_exception_type((httpx.ConnectError, httpx.TimeoutException, httpx.ReadTimeout)),
        reraise=True
    )
    async def request(self, method, url, **kwargs) -> Union[str, Any]:
        """
        Wrapper for httpx common request method, processes request response
        Args:
            method: Request method
            url: Request URL
            **kwargs: Other request parameters, such as headers, body, etc.

        Returns:

        """
        # Check if proxy is expired before each request
        await self._refresh_proxy_if_expired()

        # return response.text
        return_response = kwargs.pop("return_response", False)
        async with httpx.AsyncClient(proxy=self.proxy) as client:
            response = await client.request(method, url, timeout=self.timeout, **kwargs)

        # T2 Fix: Adaptive rate limiting for 429 responses
        if response.status_code == 429:
            # Initialize or increase backoff
            if not hasattr(self, '_rate_limit_backoff'):
                self._rate_limit_backoff = 5.0  # Start with 5 seconds
            else:
                self._rate_limit_backoff = min(60.0, self._rate_limit_backoff * 2)  # Max 60s
            
            utils.logger.warning(f"🚦 [XiaoHongShuClient] Rate limited! Backing off for {self._rate_limit_backoff:.1f}s")
            await asyncio.sleep(self._rate_limit_backoff)
            await self.update_account_status("cooldown")
            raise DataFetchError(f"Rate limited (429), backing off {self._rate_limit_backoff:.1f}s")
        else:
            # Reset backoff on successful response
            if hasattr(self, '_rate_limit_backoff'):
                self._rate_limit_backoff = 5.0

        if response.status_code == 471 or response.status_code == 461:
            # someday someone maybe will bypass captcha
            verify_type = response.headers["Verifytype"]
            verify_uuid = response.headers["Verifyuuid"]
            msg = f"CAPTCHA appeared, request failed, Verifytype: {verify_type}, Verifyuuid: {verify_uuid}, Response: {response}"
            utils.logger.error(msg)
            # Notify account pool that this account triggered captcha
            await self.update_account_status("cooldown")
            raise Exception(msg)

        if return_response:
            return response.text
            
        try:
            data: Dict = response.json()
        except json.JSONDecodeError:
            # 可能是 HTML 页面（被风控拦截或需要验证码但状态码是 200）
            short_res = response.text[:500].replace('\n', ' ')
            msg = f"API Response is not JSON. Likely blocked/captcha. Status: {response.status_code}, Body: {short_res}..."
            utils.logger.error(f"[XiaoHongShuClient.request] {msg}")
            
            # 记录异常状态，可能需要触发重登录或冷却
            # 如果是滑块页面，通常包含 "verify" 或 "captcha"
            if "verify" in response.text or "captcha" in response.text:
                await self.update_account_status("cooldown")
            
            # 抛出更具体的错误，而不是让上层报 JSONDecodeError
            raise DataFetchError(f"Anti-scraping block detected: {msg}")

        if data["success"]:
            return data.get("data", data.get("success", {}))
        elif data["code"] == self.IP_ERROR_CODE:
            # IP Bloacked usually means the account is also flagged or needs a break
            await self.update_account_status("cooldown")
            raise IPBlockError(self.IP_ERROR_STR)
        else:
            # Enhanced error logging for debugging
            err_code = data.get("code", "unknown")
            err_msg = data.get("msg", None) or f"{response.text}"
            utils.logger.error(f"[XiaoHongShuClient.request] API Error - Code: {err_code}, Msg: {err_msg}")
            utils.logger.error(f"[XiaoHongShuClient.request] Full response: {response.text[:500]}")
            raise DataFetchError(err_msg)

    async def get(self, uri: str, params: Optional[Dict] = None) -> Dict:
        """
        GET request, signs request headers
        Args:
            uri: Request route
            params: Request parameters

        Returns:

        """
        headers = await self._pre_headers(uri, params)
        full_url = f"{self._host}{uri}"

        return await self.request(
            method="GET", url=full_url, headers=headers, params=params
        )

    async def post(self, uri: str, data: dict, **kwargs) -> Dict:
        """
        POST request, signs request headers
        Args:
            uri: Request route
            data: Request body parameters

        Returns:

        """
        headers = await self._pre_headers(uri, payload=data)
        json_str = json.dumps(data, separators=(",", ":"), ensure_ascii=False)
        return await self.request(
            method="POST",
            url=f"{self._host}{uri}",
            data=json_str,
            headers=headers,
            **kwargs,
        )

    async def get_note_media(self, url: str) -> Union[bytes, None]:
        # Check if proxy is expired before request
        await self._refresh_proxy_if_expired()

        async with httpx.AsyncClient(proxy=self.proxy) as client:
            try:
                response = await client.request("GET", url, timeout=self.timeout)
                response.raise_for_status()
                if not response.reason_phrase == "OK":
                    utils.logger.error(
                        f"[XiaoHongShuClient.get_note_media] request {url} err, res:{response.text}"
                    )
                    return None
                else:
                    return response.content
            except (
                httpx.HTTPError
            ) as exc:  # some wrong when call httpx.request method, such as connection error, client error, server error or response status code is not 2xx
                utils.logger.error(
                    f"[XiaoHongShuClient.get_aweme_media] {exc.__class__.__name__} for {exc.request.url} - {exc}"
                )  # Keep original exception type name for developer debugging
                return None

    async def pong(self) -> bool:
        """
        Check if login state is still valid
        Returns:

        """
        """get a note to check if login state is ok"""
        utils.logger.info("[XiaoHongShuClient.pong] Begin to pong xhs...")
        ping_flag = False
        try:
            # Use homefeed instead of search to check login status
            # Searching is more likely to trigger captcha/risk control
            note_card: Dict = await self.get_homefeed(num=1)
            if note_card.get("items"):
                ping_flag = True
        except Exception as e:
            utils.logger.error(
                f"[XiaoHongShuClient.pong] Ping xhs failed: {e}, and try to login again..."
            )
            ping_flag = False
        return ping_flag

    async def update_cookies(self, browser_context: BrowserContext):
        """
        Update cookies method provided by API client, usually called after successful login
        Args:
            browser_context: Browser context object

        Returns:

        """
        # Get raw cookies from browser
        browser_cookies = await browser_context.cookies()
        
        # Deduplicate cookies by name (keep the last/latest one)
        unique_cookies = {}
        for cookie in browser_cookies:
            # Filter out potentially large or tracking cookies if needed
            # For now, just ensuring each key appears only once is usually enough
            unique_cookies[cookie['name']] = cookie['value']
            
        # Reconstruct clean cookie dict and string
        self.cookie_dict = unique_cookies
        self.headers["Cookie"] = "; ".join([f"{k}={v}" for k, v in unique_cookies.items()])
        
        # Log the optimization result
        utils.logger.info(f"[XiaoHongShuClient.update_cookies] Optimized cookies count: {len(browser_cookies)} -> {len(unique_cookies)}")

    async def get_note_by_keyword(
        self,
        keyword: str,
        search_id: str = get_search_id(),
        page: int = 1,
        page_size: int = 20,
        sort: SearchSortType = SearchSortType.GENERAL,
        note_type: SearchNoteType = SearchNoteType.ALL,
    ) -> Dict:
        """
        Search notes by keyword
        Args:
            keyword: Keyword parameter
            page: Page number
            page_size: Page data length
            sort: Search result sorting specification
            note_type: Type of note to search

        Returns:

        """
        uri = "/api/sns/web/v1/search/notes"
        data = {
            "keyword": keyword,
            "page": page,
            "page_size": page_size,
            "search_id": search_id,
            "sort": sort.value,
            "note_type": note_type.value,
        }
        return await self.post(uri, data)

    async def get_homefeed(
        self,
        cursor: str = "",
        num: int = 20,
        category: str = "homefeed_recommend",
        refresh_type: int = None,
    ) -> Dict:
        """
        Get homepage feed recommendations
        Args:
            cursor: Pagination cursor from previous response
            num: Number of notes to fetch per page
            category: Feed category (homefeed_recommend, homefeed.fashion_v3, etc.)
            refresh_type: 1 for refresh, 3 for load more (auto-determined if None)

        Returns:
            Dict containing items and cursor for next page
        """
        uri = "/api/sns/web/v1/homefeed"
        
        # Auto-determine refresh type based on cursor
        if refresh_type is None:
            refresh_type = 3 if cursor else 1
        
        data = {
            "cursor_score": cursor,
            "num": num,
            "refresh_type": refresh_type,
            "note_index": 0,
            "unread_begin_note_id": "",
            "unread_end_note_id": "",
            "unread_note_count": 0,
            "category": category,
            "image_scenes": ["FD_PRV_WEBP", "FD_WM_WEBP"]
        }
        return await self.post(uri, data)

    async def get_note_by_id(
        self,
        note_id: str,
        xsec_source: str,
        xsec_token: str,
    ) -> Dict:
        """
        Get note detail API
        Args:
            note_id: Note ID
            xsec_source: Channel source
            xsec_token: Token returned from search keyword result list

        Returns:

        """
        if xsec_source == "":
            xsec_source = "pc_search"

        data = {
            "source_note_id": note_id,
            "image_formats": ["jpg", "webp", "avif"],
            "extra": {"need_body_topic": 1},
            "xsec_source": xsec_source,
            "xsec_token": xsec_token,
        }
        uri = "/api/sns/web/v1/feed"
        res = await self.post(uri, data)
        if res and res.get("items"):
            res_dict: Dict = res["items"][0]["note_card"]
            return res_dict
        # When crawling frequently, some notes may have results while others don't
        utils.logger.error(
            f"[XiaoHongShuClient.get_note_by_id] get note id:{note_id} empty and res:{res}"
        )
        return dict()

    async def get_note_comments(
        self,
        note_id: str,
        xsec_token: str,
        cursor: str = "",
    ) -> Dict:
        """
        Get first-level comments API
        Args:
            note_id: Note ID
            xsec_token: Verification token
            cursor: Pagination cursor

        Returns:

        """
        uri = "/api/sns/web/v2/comment/page"
        params = {
            "note_id": note_id,
            "cursor": cursor,
            "top_comment_id": "",
            "image_formats": "jpg,webp,avif",
            "xsec_token": xsec_token,
        }
        return await self.get(uri, params)

    async def get_note_sub_comments(
        self,
        note_id: str,
        root_comment_id: str,
        xsec_token: str,
        num: int = 10,
        cursor: str = "",
    ):
        """
        Get sub-comments under specified parent comment API
        Args:
            note_id: Post ID of sub-comments
            root_comment_id: Root comment ID
            xsec_token: Verification token
            num: Pagination quantity
            cursor: Pagination cursor

        Returns:

        """
        uri = "/api/sns/web/v2/comment/sub/page"
        params = {
            "note_id": note_id,
            "root_comment_id": root_comment_id,
            "num": str(num),
            "cursor": cursor,
            "image_formats": "jpg,webp,avif",
            "top_comment_id": "",
            "xsec_token": xsec_token,
        }
        return await self.get(uri, params)

    async def get_note_all_comments(
        self,
        note_id: str,
        xsec_token: str,
        crawl_interval: float = 1.0,
        callback: Optional[Callable] = None,
        max_count: int = 10,
    ) -> List[Dict]:
        """
        Get all first-level comments under specified note, this method will continuously find all comment information under a post
        Args:
            note_id: Note ID
            xsec_token: Verification token
            crawl_interval: Crawl delay per note (seconds)
            callback: Callback after one note crawl ends
            max_count: Maximum number of comments to crawl per note
        Returns:

        """
        result = []
        comments_has_more = True
        comments_cursor = ""
        while comments_has_more and len(result) < max_count:
            comments_res = await self.get_note_comments(
                note_id=note_id, xsec_token=xsec_token, cursor=comments_cursor
            )
            comments_has_more = comments_res.get("has_more", False)
            comments_cursor = comments_res.get("cursor", "")
            if "comments" not in comments_res:
                utils.logger.info(
                    f"[XiaoHongShuClient.get_note_all_comments] No 'comments' key found in response: {comments_res}"
                )
                break
            comments = comments_res["comments"]
            if len(result) + len(comments) > max_count:
                comments = comments[: max_count - len(result)]
            if callback:
                await callback(note_id, comments)
            await asyncio.sleep(crawl_interval)
            result.extend(comments)
            sub_comments = await self.get_comments_all_sub_comments(
                comments=comments,
                xsec_token=xsec_token,
                crawl_interval=crawl_interval,
                callback=callback,
            )
            result.extend(sub_comments)
        return result

    async def get_comments_all_sub_comments(
        self,
        comments: List[Dict],
        xsec_token: str,
        crawl_interval: float = 1.0,
        callback: Optional[Callable] = None,
        max_sub_comments: int = 50,  # P2 Fix: Add limit for sub-comments
    ) -> List[Dict]:
        """
        Get all second-level comments under specified first-level comments, this method will continuously find all second-level comment information under first-level comments
        Args:
            comments: Comment list
            xsec_token: Verification token
            crawl_interval: Crawl delay per comment (seconds)
            callback: Callback after one comment crawl ends
            max_sub_comments: Maximum number of sub-comments to crawl (default 50)

        Returns:

        """
        if not config.ENABLE_GET_SUB_COMMENTS:
            utils.logger.info(
                f"[XiaoHongShuCrawler.get_comments_all_sub_comments] Crawling sub_comment mode is not enabled"
            )
            return []

        result = []
        for comment in comments:
            # P2 Fix: Check limit before processing each comment
            if len(result) >= max_sub_comments:
                utils.logger.info(
                    f"[XiaoHongShuClient.get_comments_all_sub_comments] Reached max sub-comments limit: {max_sub_comments}"
                )
                break
                
            note_id = comment.get("note_id")
            sub_comments = comment.get("sub_comments")
            if sub_comments and callback:
                await callback(note_id, sub_comments)

            sub_comment_has_more = comment.get("sub_comment_has_more")
            if not sub_comment_has_more:
                continue

            root_comment_id = comment.get("id")
            sub_comment_cursor = comment.get("sub_comment_cursor")

            while sub_comment_has_more and len(result) < max_sub_comments:  # P2 Fix: Add limit check
                comments_res = await self.get_note_sub_comments(
                    note_id=note_id,
                    root_comment_id=root_comment_id,
                    xsec_token=xsec_token,
                    num=10,
                    cursor=sub_comment_cursor,
                )

                if comments_res is None:
                    utils.logger.info(
                        f"[XiaoHongShuClient.get_comments_all_sub_comments] No response found for note_id: {note_id}"
                    )
                    continue
                sub_comment_has_more = comments_res.get("has_more", False)
                sub_comment_cursor = comments_res.get("cursor", "")
                if "comments" not in comments_res:
                    utils.logger.info(
                        f"[XiaoHongShuClient.get_comments_all_sub_comments] No 'comments' key found in response: {comments_res}"
                    )
                    break
                fetched_comments = comments_res["comments"]
                
                # P2 Fix: Only take what we need to reach the limit
                remaining = max_sub_comments - len(result)
                fetched_comments = fetched_comments[:remaining]
                
                if callback:
                    await callback(note_id, fetched_comments)
                await asyncio.sleep(crawl_interval)
                result.extend(fetched_comments)
        return result

    async def get_creator_info(
        self, user_id: str, xsec_token: str = "", xsec_source: str = ""
    ) -> Dict:
        """
        Get user profile brief information by parsing user homepage HTML
        The PC user homepage has window.__INITIAL_STATE__ variable, just parse it

        Args:
            user_id: User ID
            xsec_token: Verification token (optional, pass if included in URL)
            xsec_source: Channel source (optional, pass if included in URL)

        Returns:
            Dict: Creator information
        """
        # Build URI, add xsec parameters to URL if available
        uri = f"/user/profile/{user_id}"
        if xsec_token and xsec_source:
            uri = f"{uri}?xsec_token={xsec_token}&xsec_source={xsec_source}"

        html_content = await self.request(
            "GET", self._domain + uri, return_response=True, headers=self.headers
        )
        return self._extractor.extract_creator_info_from_html(html_content)

    async def get_notes_by_creator(
        self,
        creator: str,
        cursor: str,
        page_size: int = 30,
        xsec_token: str = "",
        xsec_source: str = "pc_feed",
    ) -> Dict:
        """
        Get creator's notes
        Args:
            creator: Creator ID
            cursor: Last note ID from previous page
            page_size: Page data length
            xsec_token: Verification token
            xsec_source: Channel source

        Returns:

        """
        uri = f"/api/sns/web/v1/user_posted"
        params = {
            "num": page_size,
            "cursor": cursor,
            "user_id": creator,
            "xsec_token": xsec_token,
            "xsec_source": xsec_source,
        }
        return await self.get(uri, params)

    async def get_all_notes_by_creator(
        self,
        user_id: str,
        crawl_interval: float = 1.0,
        callback: Optional[Callable] = None,
        xsec_token: str = "",
        xsec_source: str = "pc_feed",
    ) -> List[Dict]:
        """
        Get all posts published by specified user, this method will continuously find all post information under a user
        Args:
            user_id: User ID
            crawl_interval: Crawl delay (seconds)
            callback: Update callback function after one pagination crawl ends
            xsec_token: Verification token
            xsec_source: Channel source

        Returns:

        """
        result = []
        notes_has_more = True
        notes_cursor = ""
        while notes_has_more and len(result) < config.CRAWLER_MAX_NOTES_COUNT:
            notes_res = await self.get_notes_by_creator(
                user_id, notes_cursor, xsec_token=xsec_token, xsec_source=xsec_source
            )
            if not notes_res:
                utils.logger.error(
                    f"[XiaoHongShuClient.get_notes_by_creator] The current creator may have been banned by xhs, so they cannot access the data."
                )
                break

            notes_has_more = notes_res.get("has_more", False)
            notes_cursor = notes_res.get("cursor", "")
            if "notes" not in notes_res:
                utils.logger.info(
                    f"[XiaoHongShuClient.get_all_notes_by_creator] No 'notes' key found in response: {notes_res}"
                )
                break

            notes = notes_res["notes"]
            utils.logger.info(
                f"[XiaoHongShuClient.get_all_notes_by_creator] got user_id:{user_id} notes len : {len(notes)}"
            )

            remaining = config.CRAWLER_MAX_NOTES_COUNT - len(result)
            if remaining <= 0:
                break

            notes_to_add = notes[:remaining]
            if callback:
                await callback(notes_to_add)

            result.extend(notes_to_add)
            await asyncio.sleep(crawl_interval)

        utils.logger.info(
            f"[XiaoHongShuClient.get_all_notes_by_creator] Finished getting notes for user {user_id}, total: {len(result)}"
        )
        return result

    async def get_note_short_url(self, note_id: str) -> Dict:
        """
        Get note short URL
        Args:
            note_id: Note ID

        Returns:

        """
        uri = f"/api/sns/web/short_url"
        data = {"original_url": f"{self._domain}/discovery/item/{note_id}"}
        return await self.post(uri, data=data, return_response=True)

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=1, max=5))
    async def get_note_by_id_from_html(
        self,
        note_id: str,
        xsec_source: str,
        xsec_token: str,
        enable_cookie: bool = False,
    ) -> Optional[Dict]:
        """
        Get note details by parsing note detail page HTML, this interface may fail, retry 3 times here
        copy from https://github.com/ReaJason/xhs/blob/eb1c5a0213f6fbb592f0a2897ee552847c69ea2d/xhs/core.py#L217-L259
        thanks for ReaJason
        Args:
            note_id:
            xsec_source:
            xsec_token:
            enable_cookie:

        Returns:

        """
        url = (
            "https://www.xiaohongshu.com/explore/"
            + note_id
            + f"?xsec_token={xsec_token}&xsec_source={xsec_source}"
        )
        copy_headers = self.headers.copy()
        if not enable_cookie:
            del copy_headers["Cookie"]

        html = await self.request(
            method="GET", url=url, return_response=True, headers=copy_headers
        )

        return self._extractor.extract_note_detail_from_html(note_id, html)
