# -*- coding: utf-8 -*-
import asyncio
import random
from typing import TYPE_CHECKING
from tools import utils
from api.services.creator_service import get_creator_service

if TYPE_CHECKING:
    from media_platform.douyin.client import DouYinClient

class ProfileHandler:
    """
    [Phase 2 Architecture]
    Dedicated handler for fetching creator profiles asynchronously.
    This works as a 'Data Worker' consuming the 'GrowHubCreator' queue.
    """
    def __init__(self, dy_client: "DouYinClient"):
        self.dy_client = dy_client
        self.creator_service = get_creator_service()
        
    async def handle_batch(self, batch_size: int = 10):
        """
        Fetch a batch of creators and update their profiles.
        This method is designed to be called periodically or by a daemon.
        """
        utils.logger.info(f"🚀 [ProfileHandler] Checking for new creators to profile (Limit: {batch_size})...")
        
        # 1. Fetch NEW/WAITING creators from DB
        creators = await self.creator_service.get_creators_to_crawl(limit=batch_size)
        
        if not creators:
            utils.logger.info("💤 [ProfileHandler] No pending creators found.")
            return

        utils.logger.info(f"📋 [ProfileHandler] Found {len(creators)} creators to process.")

        # 2. Iterate and fetch
        for index, creator in enumerate(creators):
            sec_uid = creator.author_id
            utils.logger.info(f"🔍 [ProfileHandler] ({index+1}/{len(creators)}) Fetching profile for: {creator.author_name} ({sec_uid})")
            
            try:
                # 2.1 Emulate human behavior: Visit User Page HTML (Optional but recommended)
                # self.dy_client.visit_user_page(sec_uid) # If implemented in client
                
                # Sleep before API call (2-4s as requested)
                await asyncio.sleep(random.uniform(2, 4))
                
                # 2.2 Call Profile API
                # Note: get_user_info calls /aweme/v1/web/user/profile/other/
                profile_res = await self.dy_client.get_user_info(sec_uid)
                
                if not profile_res or "user" not in profile_res:
                    utils.logger.warning(f"⚠️ [ProfileHandler] Invalid response for {sec_uid}")
                    await self.creator_service.mark_creator_failed(sec_uid, "Invalid API response")
                    continue
                
                user_obj = profile_res["user"]
                
                # 2.3 Extract Data
                profile_data = {
                    "fans_count": user_obj.get("m_stats", {}).get("follower_count") or user_obj.get("follower_count") or 0,
                    "follows_count": user_obj.get("following_count") or 0,
                    "likes_count": user_obj.get("total_favorited") or 0,
                    "works_count": user_obj.get("aweme_count") or 0,
                    "nickname": user_obj.get("nickname"),
                    "unique_id": user_obj.get("unique_id") or user_obj.get("short_id"),
                    "avatar": user_obj.get("avatar_thumb", {}).get("url_list", [""])[0],
                    "signature": user_obj.get("signature"),
                    "ip_location": user_obj.get("ip_location")
                }
                
                # 2.4 Update DB
                await self.creator_service.update_creator_profile(sec_uid, profile_data)
                
                # 2.5 Sleep between users (8-12s as requested)
                # Only sleep if not the last one
                if index < len(creators) - 1:
                    sleep_time = random.uniform(8, 12)
                    utils.logger.info(f"⏳ [ProfileHandler] Sleeping {sleep_time:.2f}s...")
                    await asyncio.sleep(sleep_time)
                    
            except Exception as e:
                utils.logger.error(f"❌ [ProfileHandler] Error processing {sec_uid}: {e}")
                
                if "blocked" in str(e).lower() or "verify" in str(e).lower():
                     utils.logger.critical("🚨 [ProfileHandler] ACCOUT BLOCKED! STOPPING WORKER.")
                     # In real implementation: Trigger Account Circuit Breaker here
                     break
                
                await self.creator_service.mark_creator_failed(sec_uid, str(e))
                await asyncio.sleep(5) # Short sleep on error

        utils.logger.info("🏁 [ProfileHandler] Batch completed.")
