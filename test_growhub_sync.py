# -*- coding: utf-8 -*-
import asyncio
import sys
from pathlib import Path

# Add project root to sys.path
project_root = Path(__file__).resolve().parents[0]
if str(project_root) not in sys.path:
    sys.path.append(str(project_root))

from api.services.growhub_store import get_growhub_store_service
from database.growhub_models import GrowHubContent
from sqlalchemy import select
from database.db_session import get_session

async def test_sync():
    service = get_growhub_store_service()
    
    # Mock XHS data
    xhs_data = {
        "note_id": "test_xhs_123",
        "type": "video",
        "title": "这个产品真的太烂了，千万不要买，避雷！",
        "desc": "垃圾质量，垃圾服务，后悔死了。",
        "liked_count": "1500",
        "comment_count": "200",
        "user_id": "user_1",
        "nickname": "测试用户",
        "source_keyword": "竞品A",
        "note_url": "https://xiaohongshu.com/test/123",
        "time": 1700000000
    }
    
    print("Testing XHS sync (Negative sentiment)...")
    await service.sync_to_growhub("xhs", xhs_data)
    
    # Mock DY data
    dy_data = {
        "aweme_id": "test_dy_456",
        "type": "video",
        "title": "强烈推荐这款神仙产品！真的太好用了！赞！",
        "liked_count": "50000",
        "comment_count": "1000",
        "user_id": "user_2",
        "nickname": "优质博主",
        "source_keyword": "品牌X",
        "aweme_url": "https://douyin.com/test/456",
        "create_time": 1700001000
    }
    
    print("Testing Douyin sync (Positive sentiment)...")
    await service.sync_to_growhub("dy", dy_data)
    
    # Verify in database
    async with get_session() as session:
        result = await session.execute(select(GrowHubContent))
        contents = result.scalars().all()
        print(f"\nTotal synced items: {len(contents)}")
        for i in contents:
            print(f"ID: {i.platform_content_id}, Platform: {i.platform}, Sentiment: {i.sentiment}, Score: {i.sentiment_score}, Keyword: {i.source_keyword}")

if __name__ == "__main__":
    asyncio.run(test_sync())
