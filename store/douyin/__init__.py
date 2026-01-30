# -*- coding: utf-8 -*-
# Copyright (c) 2025 relakkes@gmail.com
#
# This file is part of MediaCrawler project.
# Repository: https://github.com/NanmiCoder/MediaCrawler/blob/main/store/douyin/__init__.py
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

# -*- coding: utf-8 -*-
# @Author  : relakkes@gmail.com
# @Time    : 2024/1/14 18:46
# @Desc    :
from typing import List

import config
from var import source_keyword_var, project_id_var

from ._store_impl import *
from .douyin_store_media import *

# 运行时缓存，避免在同一次抓取任务中重复请求同一个博主的主页
_AUTHOR_CACHE = {}
_PENDING_PROFILE_REQUESTS = {}



class DouyinStoreFactory:
    STORES = {
        "csv": DouyinCsvStoreImplement,
        "db": DouyinDbStoreImplement,
        "json": DouyinJsonStoreImplement,
        "sqlite": DouyinSqliteStoreImplement,
        "mongodb": DouyinMongoStoreImplement,
        "excel": DouyinExcelStoreImplement,
    }

    @staticmethod
    def create_store() -> AbstractStore:
        store_class = DouyinStoreFactory.STORES.get(config.SAVE_DATA_OPTION)
        if not store_class:
            raise ValueError("[DouyinStoreFactory.create_store] Invalid save option only supported csv or db or json or sqlite or mongodb or excel ...")
        return store_class()


def _extract_note_image_list(aweme_detail: Dict) -> List[str]:
    """
    Extract note image list

    Args:
        aweme_detail (Dict): Douyin content details

    Returns:
        List[str]: Note image list
    """
    images_res: List[str] = []
    images: List[Dict] = aweme_detail.get("images", [])

    if not images:
        return []

    for image in images:
        image_url_list = image.get("url_list", [])  # download_url_list has watermarked images, url_list has non-watermarked images
        if image_url_list:
            images_res.append(image_url_list[-1])

    return images_res


def _extract_comment_image_list(comment_item: Dict) -> List[str]:
    """
    Extract comment image list

    Args:
        comment_item (Dict): Douyin comment

    Returns:
        List[str]: Comment image list
    """
    images_res: List[str] = []
    image_list: List[Dict] = comment_item.get("image_list", [])

    if not image_list:
        return []

    for image in image_list:
        image_url_list = image.get("origin_url", {}).get("url_list", [])
        if image_url_list and len(image_url_list) > 1:
            images_res.append(image_url_list[1])

    return images_res


def _extract_content_cover_url(aweme_detail: Dict) -> str:
    """
    Extract video cover URL

    Args:
        aweme_detail (Dict): Douyin content details

    Returns:
        str: Video cover URL
    """
    res_cover_url = ""

    video_item = aweme_detail.get("video", {})
    raw_cover_url_list = (video_item.get("raw_cover", {}) or video_item.get("origin_cover", {})).get("url_list", [])
    if raw_cover_url_list and len(raw_cover_url_list) > 1:
        res_cover_url = raw_cover_url_list[1]

    return res_cover_url


def _extract_video_download_url(aweme_detail: Dict) -> str:
    """
    Extract video download URL

    Args:
        aweme_detail (Dict): Douyin video

    Returns:
        str: Video download URL
    """
    video_item = aweme_detail.get("video", {})
    url_h264_list = video_item.get("play_addr_h264", {}).get("url_list", [])
    url_256_list = video_item.get("play_addr_256", {}).get("url_list", [])
    url_list = video_item.get("play_addr", {}).get("url_list", [])
    actual_url_list = url_h264_list or url_256_list or url_list
    if not actual_url_list:
        return ""
    return actual_url_list[-1]


def _extract_music_download_url(aweme_detail: Dict) -> str:
    """
    Extract music download URL

    Args:
        aweme_detail (Dict): Douyin video

    Returns:
        str: Music download URL
    """
    music_item = aweme_detail.get("music", {})
    play_url = music_item.get("play_url", {})
    music_url = play_url.get("uri", "")
    return music_url


async def update_douyin_aweme(aweme_item: Dict, client=None):
    from media_platform.douyin.extractor import DouyinExtractor
    extractor = DouyinExtractor()
    
    aweme_id = aweme_item.get("aweme_id")
    # Use robust extraction for author and statistics
    user_info = extractor.get_user_info(aweme_item)
    
    # 修复：如果粉丝数为0且有sec_uid，且提供了client，尝试获取用户详情补充数据
    fans_count = user_info.get("fans", 0)
    # [Phase 2 Architecture Change]
    # Disable synchronous fallback fetch. Profile enrichment is now handled by async ProfileWorker.
    # The creator will be saved as 'crawl_status=new' by the CreatorService, and picked up later.
    utils.logger.debug(f"[store.douyin] ⏭ Deferred profile fetch for '{user_info.get('nickname')}' to ProfileWorker")

    interact_info = extractor.get_item_statistics(aweme_item)
    
    # Determine content type
    # For Douyin, both regular videos and graphic notes (Slides) are conceptually videos
    content_type = "video"

    save_content_item = {
        "aweme_id": aweme_id,
        "aweme_type": str(aweme_item.get("aweme_type")),
        "type": content_type,
        "title": aweme_item.get("desc", ""),
        "desc": aweme_item.get("desc", ""),
        "create_time": aweme_item.get("create_time"),
        "user_id": user_info.get("uid"),
        "sec_uid": user_info.get("sec_uid"),
        "nickname": user_info.get("nickname"),
        "avatar": user_info.get("avatar"),
        "liked_count": str(interact_info.get("likes", 0)),
        "collected_count": str(interact_info.get("favorites", 0)),
        "comment_count": str(interact_info.get("comments", 0)),
        "share_count": str(interact_info.get("shares", 0)),
        "ip_location": aweme_item.get("ip_label", ""),
        "last_modify_ts": utils.get_current_timestamp(),
        "aweme_url": f"https://www.douyin.com/video/{aweme_id}",
        "cover_url": _extract_content_cover_url(aweme_item),
        "video_download_url": _extract_video_download_url(aweme_item),
        "music_download_url": _extract_music_download_url(aweme_item),
        "note_download_url": ",".join(_extract_note_image_list(aweme_item)),
        "source_keyword": source_keyword_var.get(),
        "project_id": project_id_var.get(),
        "user_fans": str(user_info.get("fans", 0)),
        "user_follows": str(user_info.get("follows", 0)),
        "user_likes": str(user_info.get("likes", 0)),
        "works_count": str(user_info.get("aweme_count", 0)),
        "user_unique_id": user_info.get("unique_id", ""),
    }
    utils.logger.info(f"[store.douyin.update_douyin_aweme] douyin aweme id:{aweme_id}, title:{save_content_item.get('title')}")
    await DouyinStoreFactory.create_store().store_content(content_item=save_content_item)
    
    # 同步到 GrowHub 统一表
    try:
        from api.services.growhub_store import get_growhub_store_service
        sync_service = get_growhub_store_service()
        await sync_service.sync_to_growhub("dy", save_content_item)
    except Exception as e:
        utils.logger.error(f"[store.douyin.update_douyin_aweme] Sync to GrowHub failed: {e}")

async def update_douyin_note(note_item: Dict):
    """
    Standardized update for Douyin note (handles both raw and plugin-parsed notes)
    """
    from var import project_id_var
    from tools import utils
    
    # If it's a plugin-parsed note, it won't have typical raw fields like "aweme_type"
    if "aweme_type" not in note_item:
        interact_info = note_item.get("interact_info", {})
        user_info = note_item.get("user", {})
        note_id = note_item.get("note_id")
        
        save_content_item = {
            "aweme_id": note_id,
            "aweme_type": "0", # Default
            "type": note_item.get("type", "video"),
            "title": note_item.get("title", ""),
            "desc": note_item.get("desc") or note_item.get("title", ""),
            "create_time": note_item.get("time"),
            "user_id": user_info.get("user_id"),
            "nickname": user_info.get("nickname"),
            "avatar": user_info.get("avatar", ""),
            "liked_count": str(interact_info.get("like_count", "0")),
            "collected_count": str(interact_info.get("collect_count", "0")),
            "comment_count": str(interact_info.get("comment_count", "0")),
            "share_count": str(interact_info.get("share_count", "0")),
            "last_modify_ts": utils.get_current_timestamp(),
            "aweme_url": f"https://www.douyin.com/video/{note_id}",
            "source_keyword": source_keyword_var.get(),
            "project_id": project_id_var.get() or None,
            "user_fans": str(user_info.get("fans_count", "0")),
        }
        utils.logger.info(f"[store.douyin.update_douyin_note] Douyin ID: {note_id}, title: {save_content_item.get('title')}")
        await DouyinStoreFactory.create_store().store_content(content_item=save_content_item)
        
        # 同步到 GrowHub 统一表
        try:
            from api.services.growhub_store import get_growhub_store_service
            sync_service = get_growhub_store_service()
            await sync_service.sync_to_growhub("dy", save_content_item)
        except Exception as e:
            utils.logger.error(f"[store.douyin.update_douyin_note] Sync to GrowHub failed: {e}")
    else:
        # Fallback to older raw format
        await update_douyin_aweme(note_item)


async def batch_update_dy_aweme_comments(aweme_id: str, comments: List[Dict]):
    if not comments:
        return
    for comment_item in comments:
        await update_dy_aweme_comment(aweme_id, comment_item)


async def update_dy_aweme_comment(aweme_id: str, comment_item: Dict):
    comment_aweme_id = comment_item.get("aweme_id")
    if aweme_id != comment_aweme_id:
        utils.logger.error(f"[store.douyin.update_dy_aweme_comment] comment_aweme_id: {comment_aweme_id} != aweme_id: {aweme_id}")
        return
    user_info = comment_item.get("user", {})
    comment_id = comment_item.get("cid")
    parent_comment_id = comment_item.get("reply_id", "0")
    avatar_info = (user_info.get("avatar_medium", {}) or user_info.get("avatar_300x300", {}) or user_info.get("avatar_168x168", {}) or user_info.get("avatar_thumb", {}) or {})
    save_comment_item = {
        "comment_id": comment_id,
        "create_time": comment_item.get("create_time"),
        "ip_location": comment_item.get("ip_label", ""),
        "aweme_id": aweme_id,
        "content": comment_item.get("text"),
        "user_id": user_info.get("uid"),
        "sec_uid": user_info.get("sec_uid"),
        "short_user_id": user_info.get("short_id"),
        "user_unique_id": user_info.get("unique_id"),
        "user_signature": user_info.get("signature"),
        "nickname": user_info.get("nickname"),
        "avatar": avatar_info.get("url_list", [""])[0],
        "sub_comment_count": str(comment_item.get("reply_comment_total", 0)),
        "like_count": (comment_item.get("digg_count") if comment_item.get("digg_count") else 0),
        "last_modify_ts": utils.get_current_timestamp(),
        "parent_comment_id": parent_comment_id,
        "pictures": ",".join(_extract_comment_image_list(comment_item)),
    }
    utils.logger.info(f"[store.douyin.update_dy_aweme_comment] douyin aweme comment: {comment_id}, content: {save_comment_item.get('content')}")

    await DouyinStoreFactory.create_store().store_comment(comment_item=save_comment_item)


async def save_creator(user_id: str, creator: Dict):
    user_info = creator.get("user", {})
    gender_map = {0: "Unknown", 1: "Male", 2: "Female"}
    avatar_uri = user_info.get("avatar_300x300", {}).get("uri")
    local_db_item = {
        "user_id": user_id,
        "nickname": user_info.get("nickname"),
        "gender": gender_map.get(user_info.get("gender"), "Unknown"),
        "avatar": f"https://p3-pc.douyinpic.com/img/{avatar_uri}" + r"~c5_300x300.jpeg?from=2956013662",
        "desc": user_info.get("signature"),
        "ip_location": user_info.get("ip_location"),
        "follows": user_info.get("following_count", 0),
        "fans": user_info.get("max_follower_count", 0),
        "interaction": user_info.get("total_favorited", 0),
        "videos_count": user_info.get("aweme_count", 0),
        "last_modify_ts": utils.get_current_timestamp(),
    }
    utils.logger.info(f"[store.douyin.save_creator] creator:{local_db_item}")
    await DouyinStoreFactory.create_store().store_creator(local_db_item)


async def update_dy_aweme_image(aweme_id, pic_content, extension_file_name):
    """
    Update Douyin note image
    Args:
        aweme_id:
        pic_content:
        extension_file_name:

    Returns:

    """

    await DouYinImage().store_image({"aweme_id": aweme_id, "pic_content": pic_content, "extension_file_name": extension_file_name})


async def update_dy_aweme_video(aweme_id, video_content, extension_file_name):
    """
    Update Douyin short video
    Args:
        aweme_id:
        video_content:
        extension_file_name:

    Returns:

    """

    await DouYinVideo().store_video({"aweme_id": aweme_id, "video_content": video_content, "extension_file_name": extension_file_name})
