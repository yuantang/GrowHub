
import asyncio
from database.db_session import get_session
from database.growhub_models import GrowHubProject
from sqlalchemy import select

async def check():
    async with get_session() as session:
        result = await session.execute(select(GrowHubProject))
        projects = result.scalars().all()
        for p in projects:
            print(f"ID: {p.id}, Name: {p.name}, Purpose: {p.purpose}")

if __name__ == "__main__":
    asyncio.run(check())
