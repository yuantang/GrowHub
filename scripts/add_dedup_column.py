
import os
import sys

# Add project root to sys.path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from database.db_session import get_session
import asyncio

async def migrate():
    print("Starting migration: Add deduplicate_authors column to growhub_projects...")
    
    async with get_session() as session:
        try:
            # Check if column exists
            try:
                await session.execute(text("SELECT deduplicate_authors FROM growhub_projects LIMIT 1"))
                print("Column 'deduplicate_authors' already exists.")
            except Exception:
                # Column doesn't exist, add it
                print("Column not found. Adding column...")
                # SQLite ALTER TABLE
                await session.execute(text("ALTER TABLE growhub_projects ADD COLUMN deduplicate_authors BOOLEAN DEFAULT 0"))
                await session.commit()
                print("Migration successful: added deduplicate_authors column.")
                
        except Exception as e:
            print(f"Migration failed: {e}")
            await session.rollback()

if __name__ == "__main__":
    asyncio.run(migrate())
