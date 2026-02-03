# -*- coding: utf-8 -*-
# Copyright (c) 2025 relakkes@gmail.com
#
# This file is part of MediaCrawler project.
# Repository: https://github.com/NanmiCoder/MediaCrawler/blob/main/media_platform/douyin/client.py
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
import copy
import json
import urllib.parse
from datetime import datetime
from typing import TYPE_CHECKING, Any, Callable, Dict, Union, Optional

import httpx
from playwright.async_api import BrowserContext

from base.base_crawler import AbstractApiClient
from proxy.proxy_mixin import ProxyRefreshMixin
from tools import utils
from var import request_keyword_var

if TYPE_CHECKING:
    from proxy.proxy_ip_pool import ProxyIpPool

from .exception import *
from .field import *
from .help import *
from tenacity import retry, stop_after_attempt, wait_exponential, before_sleep_log, retry_if_exception
import time

class AsyncTokenBucket:
    """异步令牌桶限流器 (Async Token Bucket Rate Limiter)"""
    def __init__(self, rate: float, capacity: float):
        self.rate = rate
        self.capacity = capacity
        self.tokens = capacity
        self.last_update = time.monotonic()
        self._lock = asyncio.Lock()

    async def consume(self, amount: float = 1.0):
        async with self._lock:
            while self.tokens < amount:
                now = time.monotonic()
                delta = (now - self.last_update) * self.rate
                self.tokens = min(self.capacity, self.tokens + delta)
                self.last_update = now
                if self.tokens < amount:
                    sleep_time = (amount - self.tokens) / self.rate
                    await asyncio.sleep(sleep_time)
            self.tokens -= amount

class DouYinClient(AbstractApiClient, ProxyRefreshMixin):

    def __init__(
        self,
        timeout=60,  # 若开启爬取媒体选项，抖音的短视频需要更久的超时时间
        proxy=None,
        *,
        headers: Dict,
        playwright_page: Optional[Page],
        cookie_dict: Dict,
        proxy_ip_pool: Optional["ProxyIpPool"] = None,
    ):
        self.proxy = proxy
        self.timeout = timeout
        self.headers = headers
        self._host = "https://www.douyin.com"
        self.playwright_page = playwright_page
        self.cookie_dict = cookie_dict
        # 初始化限流器 (TPS 限制)
        import config
        global_tps = getattr(config, "GLOBAL_TPS_LIMIT", 1.5)
        self.rate_limiter = AsyncTokenBucket(rate=global_tps, capacity=global_tps * 2)
        
        # 记录上一次请求的 Referer 用于链路模拟
        self.last_referer = "https://www.douyin.com/"
        
        # 初始化代理池（来自 ProxyRefreshMixin）
        # Pro Feature: Pass ACCOUNT_ID for IP-Account affinity
        self.init_proxy_pool(proxy_ip_pool, account_id=config.ACCOUNT_ID)


    async def __process_req_params(
        self,
        uri: str,
        params: Optional[Dict] = None,
        headers: Optional[Dict] = None,
        request_method="GET",
    ):

        if not params:
            return
        headers = headers or self.headers
        local_storage: Dict = await self.playwright_page.evaluate("() => window.localStorage")  # type: ignore
        import config
        common_params = {
            "device_platform": "webapp",
            "aid": "6383",
            "channel": "channel_pc_web",
            "publish_video_strategy_type": 2,
            "update_version_code": 170400,
            "downlink": 4.45,
            "effective_type": "4g",
            "round_trip_time": 100,
            "webid": get_web_id(),
            "msToken": local_storage.get("xmst"),
        }
        
        # 🕵️‍♂️ Dynamic Fingerprint Injection based on User-Agent
        ua = headers.get("User-Agent", "")
        if ua:
            import re
            # Extract OS
            if "Mac OS X" in ua:
                common_params["os_name"] = "Mac OS"
                # Extract version like 10_15_7
                os_ver_match = re.search(r'Mac OS X ([\d_]+)', ua)
                if os_ver_match:
                    common_params["os_version"] = os_ver_match.group(1).replace("_", ".")
                else:
                    common_params["os_version"] = "10.15.7" # fallback
                
                common_params["browser_platform"] = "MacIntel"
                common_params["platform"] = "PC"
                
            elif "Windows" in ua:
                common_params["os_name"] = "Windows"
                common_params["os_version"] = "10" 
                common_params["browser_platform"] = "Win32"
                common_params["platform"] = "PC"
            
            # Extract Chrome Version
            chrome_ver_match = re.search(r'Chrome/([\d.]+)', ua)
            if chrome_ver_match:
                ver = chrome_ver_match.group(1)
                common_params["browser_version"] = ver
                common_params["engine_version"] = ver
            else:
                 # Fallback if parsing fails but we have a UA string
                common_params["browser_version"] = "135.0.0.0"
                common_params["engine_version"] = "135.0.0.0"
        
        # Override with defaults if parsing completely failed or no UA
        if "os_name" not in common_params:
             common_params.update({
                "browser_version": "135.0.0.0",
                "browser_name": "Chrome", 
                "engine_version": "135.0.0.0",
                "os_name": "Mac OS",
                "os_version": "10.15.7",
                "device_memory": 8,
                "platform": "PC",
             })

        params.update(common_params)
        query_string = urllib.parse.urlencode(params)

        # 20240927 a-bogus更新（JS版本）
        post_data = {}
        if request_method == "POST":
            post_data = params

        # 202410: Enable signatures for ALL endpoints including search to avoid verify_check
        a_bogus = await get_a_bogus(
            url=uri,
            params=query_string,
            post_data=post_data,
            user_agent=headers.get("User-Agent"),
            page=self.playwright_page
        )
        if a_bogus:
            params["a_bogus"] = a_bogus
        else:
            # Fallback to playwright evaluation if JS signature fails
            utils.logger.debug(f"[DouYinClient] JS signature failed for {uri}, trying playwright...")
            a_bogus = await get_a_bogus_from_playright(query_string, post_data, headers.get("User-Agent"), self.playwright_page)
            if a_bogus:
                params["a_bogus"] = a_bogus

    async def update_account_status(self, status: str):
        """Update account status in DB so API process can see it"""
        import config
        account_id = getattr(config, "ACCOUNT_ID", None)
        if not account_id:
            return
            
        try:
            from database.db_session import get_session
            from database.growhub_models import GrowHubAccount
            from sqlalchemy import update
            
            async with get_session() as session:
                await session.execute(
                    update(GrowHubAccount)
                    .where(GrowHubAccount.id == account_id)
                    .values(
                        status=status,
                        updated_at=datetime.now()
                    )
                )
                await session.commit()
                utils.logger.warning(f"🚨 [DouYinClient] Account {account_id} status updated to: {status}")
        except Exception as e:
            utils.logger.error(f"[DouYinClient] Failed to update account status in DB: {e}")

    def _retry_predicate(self, exception: Exception) -> bool:
        """判定是否需要重试：如果是风控拦截，则不重试"""
        exc_str = str(exception).lower()
        if "blocked" in exc_str or "anti-bot" in exc_str or "forbidden" in exc_str:
            return False
        return True

    @retry(
        stop=stop_after_attempt(3), 
        wait=wait_exponential(multiplier=1, min=2, max=10),
        before_sleep=before_sleep_log(utils.logger, "DEBUG"),
        retry=retry_if_exception(lambda e: "blocked" not in str(e).lower() and "anti-bot" not in str(e).lower())
    )
    async def request(self, method, url, **kwargs):
        # 1. 触发频率限制 (Token Bucket)
        await self.rate_limiter.consume()
        
        # 2. 刷新过期代理
        await self._refresh_proxy_if_expired()

        # 3. 动态 Referer 注入 (链路模拟)
        headers = kwargs.get("headers", {})
        if "Referer" not in headers:
            headers["Referer"] = self.last_referer
            kwargs["headers"] = headers

        async with httpx.AsyncClient(proxy=self.proxy) as client:
            response = await client.request(method, url, timeout=self.timeout, **kwargs)
        
        # 记录最新的 Referer (如果是 GET HTML 页面或主接口)
        if method == "GET" and "/web/" not in url:
            self.last_referer = url

        try:
            # 抖音常见的拦截关键词
            blocked_keywords = ["blocked", "verify_check", "verify_check_s", "forbidden"]
            res_text = response.text.lower()
            
            if response.text == "" or any(k in res_text for k in blocked_keywords):
                utils.logger.warning(f"🚨 [DouYinClient] 检测到风控拦截或空回复! URL: {url}, Response: {response.text[:100]}")
                # 记录账号进入冷却状态
                await self.update_account_status("cooldown")
                raise Exception(f"account blocked or anti-bot triggered: {response.text[:50]}")
                
            return response.json()
        except Exception as e:
            if "anti-bot" in str(e) or "blocked" in str(e):
                raise e
            raise DataFetchError(f"{e}, {response.text[:200]}")


    async def get(self, uri: str, params: Optional[Dict] = None, headers: Optional[Dict] = None):
        """
        GET请求
        """
        # 如果是主 API 请求，通过 Referer 链路模拟真实的跳转来源
        # 比如搜索完后，Referer 应该是搜索结果页
        await self.__process_req_params(uri, params, headers)
        headers = headers or self.headers
        full_url = f"{self._host}{uri}"
        return await self.request(method="GET", url=full_url, params=params, headers=headers)

    async def post(self, uri: str, data: dict, headers: Optional[Dict] = None):
        await self.__process_req_params(uri, data, headers)
        headers = headers or self.headers
        return await self.request(method="POST", url=f"{self._host}{uri}", data=data, headers=headers)

    async def pong(self, browser_context: BrowserContext) -> bool:
        local_storage = await self.playwright_page.evaluate("() => window.localStorage")
        if local_storage.get("HasUserLogin", "") == "1":
            return True

        _, cookie_dict = utils.convert_cookies(await browser_context.cookies())
        return cookie_dict.get("LOGIN_STATUS") == "1"

    async def update_cookies(self, browser_context: BrowserContext):
        raw_cookies = await browser_context.cookies()
        
        # STRICT MODE: Only allow whitelisted keys to avoid Anti-Bot triggers and 400 Errors
        essential_keys = [
            "sessionid", "passport_csrf_token", "monitor_web_id", "odin_tt", 
            "__ac_nonce", "account_id", "msToken", "a_bogus", "tt_scid", 
            "ttwid", "s_v_web_id", "bd_ticket_guard_client_data", "passport_auth_mix_state",
            "LOGIN_STATUS", "uid_tt", "uid_tt_ss", "sid_tt", "sid_guard"
        ]
        
        filtered_cookies = {}
        for cookie in raw_cookies:
            if cookie['name'] in essential_keys:
                filtered_cookies[cookie['name']] = cookie['value']
        
        # If sessionid is missing but present in raw, ensure it's added (redundant check but safe)
        if "sessionid" not in filtered_cookies:
             for c in raw_cookies:
                 if c['name'] == "sessionid":
                     filtered_cookies["sessionid"] = c['value']
                     break

        cookie_str = "; ".join([f"{k}={v}" for k, v in filtered_cookies.items()])
        self.headers["Cookie"] = cookie_str
        self.cookie_dict = filtered_cookies
        utils.logger.info(f"[DouYinClient.update_cookies] Optimized cookies: {len(raw_cookies)} -> {len(filtered_cookies)}")

    async def search_info_by_keyword(
        self,
        keyword: str,
        offset: int = 0,
        search_channel: SearchChannelType = SearchChannelType.GENERAL,
        sort_type: SearchSortType = SearchSortType.GENERAL,
        publish_time: PublishTimeType = PublishTimeType.UNLIMITED,
        search_id: str = "",
    ):
        """
        DouYin Web Search API
        :param keyword:
        :param offset:
        :param search_channel:
        :param sort_type:
        :param publish_time: ·
        :param search_id: ·
        :return:
        """
        query_params = {
            'search_channel': search_channel.value,
            'enable_history': '1',
            'keyword': keyword,
            'search_source': 'tab_search',
            'query_correct_type': '1',
            'is_filter_search': '0',
            'from_group_id': '7378810571505847586',
            'offset': offset,
            'count': '20',
            'need_filter_settings': '1',
            'list_type': 'multi',
            'search_id': search_id,
        }
        if sort_type.value != SearchSortType.GENERAL.value or publish_time.value != PublishTimeType.UNLIMITED.value:
            query_params["filter_selected"] = json.dumps({"sort_type": str(sort_type.value), "publish_time": str(publish_time.value)})
            query_params["is_filter_search"] = 1
            query_params["search_source"] = "tab_search"
        referer_url = f"https://www.douyin.com/search/{keyword}?aid=f594bbd9-a0e2-4651-9319-ebe3cb6298c1&type=general"
        headers = copy.copy(self.headers)
        headers["Referer"] = urllib.parse.quote(referer_url, safe=':/')
        return await self.get("/aweme/v1/web/general/search/single/", query_params, headers=headers)

    async def get_homefeed(self, cursor: int = 0, count: int = 10, refresh_type: int = 1) -> Dict:
        """
        Get Douyin home feed (recommended videos)
        
        :param cursor: Pagination cursor (offset)
        :param count: Number of items per page
        :param refresh_type: 1 for initial load, 4 for load more
        :return: Home feed response with aweme_list
        """
        uri = "/aweme/v1/web/tab/feed/"
        params = {
            "count": count,
            "cursor": cursor,
            "refresh_type": refresh_type,
            "type_id": "",
            "max_cursor": cursor,
            "min_cursor": 0,
            "aweme_pc_rec_raw_data": "{}",
            "pull_type": 1 if cursor == 0 else 2,
            "is_from_gallery": "false",
        }
        headers = copy.copy(self.headers)
        headers["Referer"] = "https://www.douyin.com/"
        return await self.get(uri, params, headers)

    async def get_video_by_id(self, aweme_id: str) -> Any:
        """
        DouYin Video Detail API
        :param aweme_id:
        :return:
        """
        params = {"aweme_id": aweme_id}
        headers = copy.copy(self.headers)
        del headers["Origin"]
        res = await self.get("/aweme/v1/web/aweme/detail/", params, headers)
        return res.get("aweme_detail", {})

    async def get_aweme_comments(self, aweme_id: str, cursor: int = 0):
        """get note comments

        """
        uri = "/aweme/v1/web/comment/list/"
        params = {"aweme_id": aweme_id, "cursor": cursor, "count": 20, "item_type": 0}
        keywords = request_keyword_var.get()
        referer_url = "https://www.douyin.com/search/" + keywords + '?aid=3a3cec5a-9e27-4040-b6aa-ef548c2c1138&publish_time=0&sort_type=0&source=search_history&type=general'
        headers = copy.copy(self.headers)
        headers["Referer"] = urllib.parse.quote(referer_url, safe=':/')
        return await self.get(uri, params)

    async def get_sub_comments(self, aweme_id: str, comment_id: str, cursor: int = 0):
        """
            获取子评论
        """
        uri = "/aweme/v1/web/comment/list/reply/"
        params = {
            'comment_id': comment_id,
            "cursor": cursor,
            "count": 20,
            "item_type": 0,
            "item_id": aweme_id,
        }
        keywords = request_keyword_var.get()
        referer_url = "https://www.douyin.com/search/" + keywords + '?aid=3a3cec5a-9e27-4040-b6aa-ef548c2c1138&publish_time=0&sort_type=0&source=search_history&type=general'
        headers = copy.copy(self.headers)
        headers["Referer"] = urllib.parse.quote(referer_url, safe=':/')
        return await self.get(uri, params)

    async def get_aweme_all_comments(
        self,
        aweme_id: str,
        crawl_interval: float = 1.0,
        is_fetch_sub_comments=False,
        callback: Optional[Callable] = None,
        max_count: int = 10,
    ):
        """
        获取帖子的所有评论，包括子评论
        :param aweme_id: 帖子ID
        :param crawl_interval: 抓取间隔
        :param is_fetch_sub_comments: 是否抓取子评论
        :param callback: 回调函数，用于处理抓取到的评论
        :param max_count: 一次帖子爬取的最大评论数量
        :return: 评论列表
        """
        result = []
        comments_has_more = 1
        comments_cursor = 0
        while comments_has_more and len(result) < max_count:
            comments_res = await self.get_aweme_comments(aweme_id, comments_cursor)
            comments_has_more = comments_res.get("has_more", 0)
            comments_cursor = comments_res.get("cursor", 0)
            comments = comments_res.get("comments", [])
            if not comments:
                continue
            if len(result) + len(comments) > max_count:
                comments = comments[:max_count - len(result)]
            result.extend(comments)
            if callback:  # 如果有回调函数，就执行回调函数
                await callback(aweme_id, comments)

            await asyncio.sleep(crawl_interval)
            if not is_fetch_sub_comments:
                continue
            # 获取二级评论
            for comment in comments:
                reply_comment_total = comment.get("reply_comment_total")

                if reply_comment_total > 0:
                    comment_id = comment.get("cid")
                    sub_comments_has_more = 1
                    sub_comments_cursor = 0

                    while sub_comments_has_more:
                        sub_comments_res = await self.get_sub_comments(aweme_id, comment_id, sub_comments_cursor)
                        sub_comments_has_more = sub_comments_res.get("has_more", 0)
                        sub_comments_cursor = sub_comments_res.get("cursor", 0)
                        sub_comments = sub_comments_res.get("comments", [])

                        if not sub_comments:
                            continue
                        result.extend(sub_comments)
                        if callback:  # 如果有回调函数，就执行回调函数
                            await callback(aweme_id, sub_comments)
                        await asyncio.sleep(crawl_interval)
        return result

    async def get_user_info(self, sec_user_id: str):
        uri = "/aweme/v1/web/user/profile/other/"
        params = {
            "sec_user_id": sec_user_id,
            "publish_video_strategy_type": 2,
            "personal_center_strategy": 1,
        }
        headers = copy.copy(self.headers)
        headers["Referer"] = f"https://www.douyin.com/user/{sec_user_id}"
        return await self.get(uri, params, headers)

    async def get_user_aweme_posts(self, sec_user_id: str, max_cursor: str = "") -> Dict:
        uri = "/aweme/v1/web/aweme/post/"
        params = {
            "sec_user_id": sec_user_id,
            "count": 18,
            "max_cursor": max_cursor,
            "locate_query": "false",
            "publish_video_strategy_type": 2,
            'verifyFp': 'verify_ma3hrt8n_q2q2HyYA_uLyO_4N6D_BLvX_E2LgoGmkA1BU',
            'fp': 'verify_ma3hrt8n_q2q2HyYA_uLyO_4N6D_BLvX_E2LgoGmkA1BU'
        }
        return await self.get(uri, params)

    async def get_all_user_aweme_posts(self, sec_user_id: str, callback: Optional[Callable] = None):
        posts_has_more = 1
        max_cursor = ""
        result = []
        while posts_has_more == 1:
            aweme_post_res = await self.get_user_aweme_posts(sec_user_id, max_cursor)
            posts_has_more = aweme_post_res.get("has_more", 0)
            max_cursor = aweme_post_res.get("max_cursor")
            aweme_list = aweme_post_res.get("aweme_list") if aweme_post_res.get("aweme_list") else []
            utils.logger.info(f"[DouYinClient.get_all_user_aweme_posts] get sec_user_id:{sec_user_id} video len : {len(aweme_list)}")
            if callback:
                await callback(aweme_list)
            result.extend(aweme_list)
        return result

    async def get_aweme_media(self, url: str) -> Union[bytes, None]:
        async with httpx.AsyncClient(proxy=self.proxy) as client:
            try:
                response = await client.request("GET", url, timeout=self.timeout, follow_redirects=True)
                response.raise_for_status()
                if not response.reason_phrase == "OK":
                    utils.logger.error(f"[DouYinClient.get_aweme_media] request {url} err, res:{response.text}")
                    return None
                else:
                    return response.content
            except httpx.HTTPError as exc:  # some wrong when call httpx.request method, such as connection error, client error, server error or response status code is not 2xx
                utils.logger.error(f"[DouYinClient.get_aweme_media] {exc.__class__.__name__} for {exc.request.url} - {exc}")  # 保留原始异常类型名称，以便开发者调试
                return None

    async def resolve_short_url(self, short_url: str) -> str:
        """
        解析抖音短链接,获取重定向后的真实URL
        Args:
            short_url: 短链接,如 https://v.douyin.com/iF12345ABC/
        Returns:
            重定向后的完整URL
        """
        async with httpx.AsyncClient(proxy=self.proxy, follow_redirects=False) as client:
            try:
                utils.logger.info(f"[DouYinClient.resolve_short_url] Resolving short URL: {short_url}")
                response = await client.get(short_url, timeout=10)

                # 短链接通常返回302重定向
                if response.status_code in [301, 302, 303, 307, 308]:
                    redirect_url = response.headers.get("Location", "")
                    utils.logger.info(f"[DouYinClient.resolve_short_url] Resolved to: {redirect_url}")
                    return redirect_url
                else:
                    utils.logger.warning(f"[DouYinClient.resolve_short_url] Unexpected status code: {response.status_code}")
                    return ""
            except Exception as e:
                utils.logger.error(f"[DouYinClient.resolve_short_url] Failed to resolve short URL: {e}")
                return ""
