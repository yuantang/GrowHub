import json
from typing import Dict, List, Optional
from tools import utils
from var import request_keyword_var

class DouyinExtractor:
    def __init__(self):
        pass

    def extract_aweme_info(self, item: Dict) -> Optional[Dict]:
        """
        从搜索结果项中提取核心视频信息 (从 Pro 版本集成的多级提取逻辑)
        支持：常规视频、图文视频、合集视频 (Mix)
        """
        if not item:
            return None
            
        # DEBUG: Log top level keys
        utils.logger.info(f"[Extractor Debug] Search item top-level keys: {list(item.keys())}")
        if "author" in item: utils.logger.info(f"[Extractor Debug] Item has root author keys: {list(item['author'].keys())}")
        if "author_info" in item: utils.logger.info(f"[Extractor Debug] Item has root author_info keys: {list(item['author_info'].keys())}")
        if "author_stats" in item: utils.logger.info(f"[Extractor Debug] Item has root author_stats keys: {list(item['author_stats'].keys())}")
            
        # 1. 尝试直接获取 aweme_info
        aweme_info = item.get("aweme_info")
        if aweme_info:
            # DEBUG: Recursive find
            def find_follower(obj, path=""):
                if isinstance(obj, dict):
                    for k, v in obj.items():
                        if "follower" in k.lower() or "fans" in k.lower():
                            utils.logger.info(f"[Extractor Debug] FOUND {k} at {path}.{k}: {v}")
                        find_follower(v, f"{path}.{k}")
                elif isinstance(obj, list):
                    for i, v in enumerate(obj):
                        find_follower(v, f"{path}[{i}]")
            
            if not hasattr(self, "_searched"):
                utils.logger.info("[Extractor Debug] Searching for 'follower' in item...")
                find_follower(item)
                self._searched = True

            return aweme_info
            
        # 2. 尝试获取合集信息 (aweme_mix_info) - Pro 版本的优点
        mix_info = item.get("aweme_mix_info")
        if mix_info and mix_info.get("mix_items"):
            return mix_info.get("mix_items")[0]
            
        # 3. 兜底判定：如果 item 本身包含 aweme_id，说明它可能是展开后的详情
        if item.get("aweme_id"):
            return item
            
        return None

    def get_item_statistics(self, aweme_info: Dict) -> Dict:
        """统一提取互动数据"""
        stats = aweme_info.get("statistics", {})
        if not stats:
            stats = aweme_info.get("v_stats", {}) or aweme_info.get("stats", {})
            
        return {
            "likes": stats.get("digg_count") or stats.get("like_count") or 0,
            "comments": stats.get("comment_count") or 0,
            "shares": stats.get("share_count") or 0,
            "favorites": stats.get("collect_count") or stats.get("favorite_count") or 0
        }

    def get_user_info(self, aweme_info: Dict) -> Dict:
        """统一提取作者信息及统计数据 (支持多种嵌套结构)"""
        author = aweme_info.get("author", {})
        if not author:
            # Fallback for some search results where it's author_info
            author = aweme_info.get("author_info", {})
            
        if not author:
            return {}
            
        m_stats = author.get("m_stats") or {}
        # Also try to get from author_stats which exists in some API versions
        a_stats = aweme_info.get("author_stats") or {}
        
        # DEBUG: Log if we find non-zero stats
        nickname = author.get("nickname", "unknown")
        fans = author.get("follower_count") or a_stats.get("follower_count") or m_stats.get("follower_count") or 0
        if fans == 0:
            utils.logger.info(f"[Extractor Debug] Author '{nickname}' fans is 0. Keys in author: {list(author.keys())}. a_stats: {list(a_stats.keys())}. m_stats: {list(m_stats.keys())}")
        
        return {
            "uid": author.get("uid"),
            "sec_uid": author.get("sec_uid"),
            "unique_id": author.get("unique_id") or author.get("short_id") or "",
            "nickname": author.get("nickname"),
            "avatar": author.get("avatar_thumb", {}).get("url_list", [""])[0],
            "fans": author.get("follower_count") or author.get("followers_count") or author.get("fans") or a_stats.get("follower_count") or a_stats.get("followers_count") or a_stats.get("fans") or m_stats.get("follower_count") or m_stats.get("followers_count") or 0,
            "follows": author.get("following_count") or author.get("follows_count") or author.get("follows") or a_stats.get("following_count") or a_stats.get("follows_count") or a_stats.get("follows") or m_stats.get("following_count") or m_stats.get("follows_count") or 0,
            "likes": author.get("total_favorited") or author.get("favorited_count") or author.get("likes") or author.get("interaction") or a_stats.get("total_favorited") or a_stats.get("favorited_count") or a_stats.get("likes") or a_stats.get("interaction") or m_stats.get("total_favorited") or m_stats.get("favorited_count") or 0,
        }
