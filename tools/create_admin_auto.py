
import sys
import os
import asyncio
from sqlalchemy import select

# Add project root to path
sys.path.append(os.getcwd())

from database.db_session import get_session
from database.growhub_models import GrowHubUser
from api.auth import security

async def create_admin_auto():
    username = "admin"
    password = "password123" # Default password
    
    async with get_session() as session:
        # Check if exists
        result = await session.execute(select(GrowHubUser).filter(GrowHubUser.username == username))
        if result.scalars().first():
            print(f"User '{username}' already exists.")
            return

        user = GrowHubUser(
            username=username,
            email="admin@example.com",
            password_hash=security.get_password_hash(password),
            role="admin",
            status="active"
        )
        session.add(user)
        await session.commit()
        print(f"✅ User '{username}' created with password '{password}'")

if __name__ == "__main__":
    asyncio.run(create_admin_auto())
