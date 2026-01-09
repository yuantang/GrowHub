
import sys
import os
from pathlib import Path

# Add project root to path
project_root = str(Path(__file__).parent.parent)
sys.path.append(project_root)

import asyncio
from sqlalchemy import text
from database.db_session import get_session

async def migrate():
    """Add sentiment_keywords column to growhub_projects table"""
    print("Starting migration: Add sentiment_keywords to growhub_projects...")
    
    async with get_session() as session:
        try:
            # Check if column exists using SQLite specific pragma
            result = await session.execute(text(
                "PRAGMA table_info(growhub_projects)"
            ))
            columns = result.fetchall()
            exists = any(col[1] == 'sentiment_keywords' for col in columns)
            
            if exists:
                print("Column 'sentiment_keywords' already exists. Skipping.")
                return

            # Add column
            print("Adding column 'sentiment_keywords'...")
            # SQLite supports JSON type as TEXT or BLOB mostly, but SQLAlchemy handles JSON type.
            # In raw SQL for SQLite, we just add the column.
            await session.execute(text(
                "ALTER TABLE growhub_projects ADD COLUMN sentiment_keywords JSON"
            ))
            
            await session.commit()
            print("Migration completed successfully!")
            
        except Exception as e:
            await session.rollback()
            print(f"Migration failed: {e}")
            raise

if __name__ == "__main__":
    asyncio.run(migrate())
