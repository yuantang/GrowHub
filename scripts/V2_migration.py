import asyncio
import sys
import os

# Ensure project root is in path
sys.path.append(os.getcwd())

from sqlalchemy import text
from database.db_session import get_async_engine
import config

async def run_migration():
    print(f"🚀 Starting Migration v2 (DB Type: {config.SAVE_DATA_OPTION})...")
    engine = get_async_engine()
    
    if not engine:
        print("❌ No database engine found.")
        return

    queries = [
        # GrowHubAccount
        "ALTER TABLE growhub_accounts ADD COLUMN role VARCHAR(20) DEFAULT 'content'",
        "ALTER TABLE growhub_accounts ADD COLUMN proxy_url VARCHAR(255)",
        
        # GrowHubCreator
        "ALTER TABLE growhub_creators ADD COLUMN crawl_status VARCHAR(20) DEFAULT 'new'",
        "ALTER TABLE growhub_creators ADD COLUMN last_profile_crawl_at DATETIME"
    ]

    async with engine.begin() as conn:
        for q in queries:
            try:
                print(f"Executing: {q}")
                await conn.execute(text(q))
                print("✅ Success")
            except Exception as e:
                # SQLite: duplicate column error
                if "duplicate column" in str(e).lower() or "no such table" in str(e).lower():
                    print(f"⚠️ Column already exists or table missing (Skipping): {e}")
                else:
                    print(f"❌ Error: {e}")

    print("🎉 Migration Completed!")

if __name__ == "__main__":
    asyncio.run(run_migration())
