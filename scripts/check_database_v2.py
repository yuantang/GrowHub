import asyncio
import sys
import os
from sqlalchemy import select, func

sys.path.append(os.getcwd())

from database.db_session import get_async_engine, get_session
from database.growhub_models import GrowHubCreator

async def check_stats():
    print("📊 Checking Database Stats for Phase 2 Migration...")
    
    async with get_session() as session:
        # Check GrowHubCreator crawl_status distribution
        status_query = select(
            GrowHubCreator.crawl_status,
            func.count(GrowHubCreator.id)
        ).group_by(GrowHubCreator.crawl_status)
        
        result = await session.execute(status_query)
        stats = {row[0]: row[1] for row in result}
        
        print(f"📈 Creator Crawl Status (Total):")
        total = 0
        for status, count in stats.items():
            print(f"  - {status}: {count}")
            total += count
            
        print(f"  ----------------")
        print(f"  Total Creators: {total}")
        
        # Check specific sample
        if 'new' in stats or 'waiting' in stats:
            stmt = select(GrowHubCreator).where(
                GrowHubCreator.crawl_status.in_(['new', 'waiting'])
            ).limit(1)
            res = await session.execute(stmt)
            sample = res.scalar()
            if sample:
                print(f"\n🔍 Sample 'New/Waiting' Creator:")
                print(f"  - Name: {sample.author_name}")
                print(f"  - ID: {sample.author_id}")
                print(f"  - Status: {sample.crawl_status}")
                print(f"  - Fans: {sample.fans_count}")

if __name__ == "__main__":
    asyncio.run(check_stats())
