import asyncio
import sys
import os
from sqlalchemy import delete

sys.path.append(os.getcwd())

from database.db_session import get_session
from database.growhub_models import GrowHubCreator

async def cleanup():
    print("🧹 Cleaning up dummy data...")
    async with get_session() as session:
        stmt = delete(GrowHubCreator).where(GrowHubCreator.author_id.like("%_TEST_USER_%"))
        await session.execute(stmt)
        await session.commit()
    print("✅ Cleanup complete.")

if __name__ == "__main__":
    asyncio.run(cleanup())
