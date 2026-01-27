
import sys
import os
import asyncio
from sqlalchemy import select, delete

# Add project root to path
sys.path.append(os.getcwd())

from database.db_session import get_session
from database.growhub_models import GrowHubUser

async def delete_user(username):
    async with get_session() as session:
        # Check if user exists first
        result = await session.execute(select(GrowHubUser).filter(GrowHubUser.username == username))
        user = result.scalars().first()
        
        if user:
            print(f"Deleting user: {username} (ID: {user.id})")
            await session.delete(user)
            await session.commit()
            print("User deleted successfully.")
        else:
            print(f"User {username} not found.")

if __name__ == "__main__":
    if len(sys.argv) > 1:
        username = sys.argv[1]
        asyncio.run(delete_user(username))
    else:
        print("Please provide a username to delete.")
