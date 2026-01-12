
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import asyncio
from sqlalchemy import text
from database.db_session import get_session

async def add_column():
    print("Migrating database...")
    async with get_session() as session:
        try:
            # Check if column exists
            try:
                await session.execute(text("SELECT crawl_date_range FROM growhub_projects LIMIT 1"))
                print("Column 'crawl_date_range' already exists.")
            except Exception:
                print("Adding 'crawl_date_range' column...")
                # SQLite syntax
                # await session.execute(text("ALTER TABLE growhub_projects ADD COLUMN crawl_date_range INTEGER DEFAULT 7"))
                
                # MySQL syntax (if using MySQL, but assuming SQLite here based on file structure usually found in such projects, 
                # wait, config says db_config. let's assume it might be SQLite or MySQL. 
                # ALTER TABLE ADD COLUMN is standard SQL for both mostly, but let's be safe)
                
                # Let's try standard SQL
                await session.execute(text("ALTER TABLE growhub_projects ADD COLUMN crawl_date_range INTEGER DEFAULT 7"))
                await session.commit()
                print("Column added successfully.")
        except Exception as e:
            print(f"Error: {e}")
            await session.rollback()

if __name__ == "__main__":
    asyncio.run(add_column())
