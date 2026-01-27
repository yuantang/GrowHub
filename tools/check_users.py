
import sys
import os
import asyncio
from sqlalchemy import select, text

# Add project root to path
sys.path.append(os.getcwd())

from database.db_session import get_session
from database.growhub_models import GrowHubUser

async def list_users():
    async with get_session() as session:
        result = await session.execute(select(GrowHubUser))
        users = result.scalars().all()
        print(f"Found {len(users)} users:")
        for u in users:
            print(f"ID: {u.id}, Username: {u.username}, Role: {u.role}, Status: {u.status}, HashPrefix: {u.password_hash[:10]}...")

if __name__ == "__main__":
    asyncio.run(list_users())
