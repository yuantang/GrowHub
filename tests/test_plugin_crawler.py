# -*- coding: utf-8 -*-
import asyncio
import sys
import os
import json
from typing import Optional

# Add project root to sys.path
project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(project_root)

from api.services.plugin_crawler_service import get_plugin_crawler_service
from tools import utils

async def test_plugin_functionality(user_id: str):
    service = get_plugin_crawler_service()
    
    # 1. Check Availability
    online = await service.is_available(user_id)
    if not online:
        print(f"❌ Plugin for user {user_id} is OFFLINE. Please ensure plugin is connected.")
        return

    print(f"✅ Plugin for user {user_id} is ONLINE.")

    # 2. Test Basic Fetch (XHS Home)
    print("\n--- Testing Basic Fetch (XHS) ---")
    response = await service.fetch_url(
        user_id=user_id,
        platform="xhs",
        url="https://www.xiaohongshu.com",
        method="GET"
    )
    if response:
        print(f"✅ Fetch success! Status: {response.get('status')}")
        print(f"Body length: {len(response.get('body', ''))} chars")
    else:
        print("❌ Fetch failed.")

    # 3. Test XHS Search
    print("\n--- Testing XHS Search (Keyword: 'ChatGPT') ---")
    notes = await service.search_notes(
        user_id=user_id,
        platform="xhs",
        keyword="ChatGPT",
        page=1,
        page_size=5
    )
    if notes:
        print(f"✅ Search success! Found {len(notes)} notes.")
        for i, note in enumerate(notes):
            print(f"  [{i+1}] {note.get('title')} (ID: {note.get('note_id')})")
        
        # 4. Test Detail Fetch for the first note
        first_note = notes[0]
        note_id = first_note.get('note_id')
        xsec_token = first_note.get('xsec_token')
        
        print(f"\n--- Testing Detail Fetch (ID: {note_id}) ---")
        detail = await service.get_note_detail(
            user_id=user_id,
            platform="xhs",
            note_id=note_id,
            xsec_token=xsec_token
        )
        if detail:
            print(f"✅ Detail success! Title: {detail.get('title')}")
            print(f"Likes: {detail.get('interact_info', {}).get('liked_count') or detail.get('interact_info', {}).get('like_count')}")
        else:
            print("❌ Detail fetch failed.")
    else:
        print("❌ Search failed.")

if __name__ == "__main__":
    # Change this to your actual user_id (stringified numeric ID)
    # The sub field in JWT is numeric. tangyuan is ID 3.
    USER_ID = "3" 
    
    if len(sys.argv) > 1:
        USER_ID = sys.argv[1]
        
    asyncio.run(test_plugin_functionality(USER_ID))
