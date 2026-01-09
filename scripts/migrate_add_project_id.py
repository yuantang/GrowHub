# -*- coding: utf-8 -*-
"""
Migration: Add project_id to growhub_contents table
Run this script to add the project_id column for precise content filtering.
"""

import asyncio
import sys
import os

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

async def migrate():
    from database.db_session import get_session
    from sqlalchemy import text
    
    async with get_session() as session:
        if not session:
            print("❌ Failed to get database session")
            return
        
        try:
            # Check if column already exists
            result = await session.execute(text("PRAGMA table_info(growhub_contents)"))
            columns = [row[1] for row in result.fetchall()]
            
            if 'project_id' in columns:
                print("✅ Column 'project_id' already exists in growhub_contents")
                return
            
            # Add the column
            print("Adding 'project_id' column to growhub_contents...")
            await session.execute(text("""
                ALTER TABLE growhub_contents 
                ADD COLUMN project_id INTEGER REFERENCES growhub_projects(id)
            """))
            await session.commit()
            
            # Create index
            print("Creating index on project_id...")
            await session.execute(text("""
                CREATE INDEX IF NOT EXISTS ix_growhub_contents_project_id 
                ON growhub_contents(project_id)
            """))
            await session.commit()
            
            print("✅ Migration completed successfully!")
            
        except Exception as e:
            print(f"❌ Migration failed: {e}")
            await session.rollback()

if __name__ == "__main__":
    import config
    config.SAVE_DATA_OPTION = 'sqlite'
    asyncio.run(migrate())
