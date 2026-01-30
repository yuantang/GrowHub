# -*- coding: utf-8 -*-
"""
Migration: Add fingerprint to growhub_accounts table
Run this script to add the fingerprint column for storing browser identity data.
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
            result = await session.execute(text("PRAGMA table_info(growhub_accounts)"))
            columns = [row[1] for row in result.fetchall()]
            
            if 'fingerprint' in columns:
                print("✅ Column 'fingerprint' already exists in growhub_accounts")
            else:
                # Add the column
                print("Adding 'fingerprint' column to growhub_accounts...")
                # SQLite doesn't support adding JSON column directly with type, usually TEXT or just add column
                # In SQLAlchemy JSON is often stored as JSON-valid text in SQLite
                await session.execute(text("""
                    ALTER TABLE growhub_accounts 
                    ADD COLUMN fingerprint JSON
                """))
                await session.commit()
                print("✅ Column 'fingerprint' added successfully!")

        except Exception as e:
            print(f"❌ Migration failed: {e}")
            await session.rollback()

if __name__ == "__main__":
    import config
    config.SAVE_DATA_OPTION = 'sqlite'
    asyncio.run(migrate())
