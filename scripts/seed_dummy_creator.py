import asyncio
import sys
import os
from datetime import datetime

sys.path.append(os.getcwd())

from database.db_session import get_session
from database.growhub_models import GrowHubCreator

async def seed_data():
    print("🌱 Seeding dummy creator data...")
    async with get_session() as session:
        # Create a dummy creator with 'new' status
        # Using a potentially valid sec_uid key format but invalid value to test 404/api handling
        # Real sec_uid is usually long string.
        # Example from scraping logs usually looks like: MS4wLjABAAAA...
        dummy_sec_uid = "MS4wLjABAAAA_TEST_USER_SEC_UID_12345" 
        
        creator = GrowHubCreator(
            platform="dy",
            author_id=dummy_sec_uid,
            author_name="[Test] Pending Creator",
            crawl_status="new",
            fans_count=0,
            first_seen_at=datetime.now(),
            last_updated_at=datetime.now()
        )
        session.add(creator)
        await session.commit()
        print(f"✅ Inserted Creator: {creator.author_name} (Status: new)")

if __name__ == "__main__":
    asyncio.run(seed_data())
