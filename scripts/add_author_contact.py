import sys
import os
import asyncio
from sqlalchemy import text

# Add root to path
sys.path.append(os.getcwd())

from database.db_session import get_async_engine

async def migrate():
    print("Starting migration...")
    engine = get_async_engine("sqlite")
    async with engine.begin() as conn:
        try:
            # Check if column exists first (SQLite doesn't support IF NOT EXISTS for ADD COLUMN in all versions/drivers perfectly, or just try/except)
            # Simplest is try/except
            await conn.execute(text("ALTER TABLE growhub_contents ADD COLUMN author_contact VARCHAR(255)"))
            print("Successfully added author_contact column")
        except Exception as e:
            if "duplicate column" in str(e).lower() or "exists" in str(e).lower():
                print("Column author_contact already exists.")
            else:
                print(f"Migration error: {e}")

if __name__ == "__main__":
    asyncio.run(migrate())
