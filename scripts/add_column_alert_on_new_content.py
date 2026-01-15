
import asyncio
import sys
import os

# Add project root to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database.db_session import get_session
from sqlalchemy import text

async def migrate():
    print("Running migration: Adding alert_on_new_content column...")
    try:
        async with get_session() as session:
            # Check if column exists first (naive check or just try adding)
            # SQLite doesn't support IF NOT EXISTS in ADD COLUMN easily in all versions, 
            # but we can try.
            
            # Using generic SQL that works for most
            try:
                await session.execute(text("ALTER TABLE growhub_projects ADD COLUMN alert_on_new_content BOOLEAN DEFAULT FALSE"))
                await session.commit()
                print("Success: Column added.")
            except Exception as e:
                print(f"Migration step failed (might already exist): {e}")
                
    except Exception as e:
        print(f"Error during migration: {e}")

if __name__ == "__main__":
    asyncio.run(migrate())
