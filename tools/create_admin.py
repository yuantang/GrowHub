
import sys
import os
import asyncio
from sqlalchemy import select

# Add project root to path
sys.path.append(os.getcwd())

from database.db_session import get_session
from database.growhub_models import GrowHubUser
from api.auth import security
import getpass

async def create_admin():
    print("=== Create Administrator Account ===")
    username = input("Username (default: admin): ").strip() or "admin"
    
    # Check if exists
    async with get_session() as session:
        result = await session.execute(select(GrowHubUser).filter(GrowHubUser.username == username))
        if result.scalars().first():
            print(f"Error: User '{username}' already exists.")
            return

    email = input("Email (optional): ").strip() or None
    password = getpass.getpass("Password: ")
    confirm_password = getpass.getpass("Confirm Password: ")
    
    if password != confirm_password:
        print("Error: Passwords do not match.")
        return
        
    async with get_session() as session:
        user = GrowHubUser(
            username=username,
            email=email,
            password_hash=security.get_password_hash(password),
            role="admin",
            status="active"
        )
        session.add(user)
        await session.commit()
        print(f"✅ Admin user '{username}' created successfully.")

if __name__ == "__main__":
    asyncio.run(create_admin())
