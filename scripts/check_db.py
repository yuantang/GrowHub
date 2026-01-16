
import asyncio
from database.db_session import get_session
from database.growhub_models import GrowHubCreator, GrowHubHotspot, GrowHubContent
from sqlalchemy import func, select

async def check():
    async with get_session() as s:
        creators = (await s.execute(select(func.count(GrowHubCreator.id)))).scalar()
        hotspots = (await s.execute(select(func.count(GrowHubHotspot.id)))).scalar()
        contents = (await s.execute(select(func.count(GrowHubContent.id)))).scalar()
        
        # Also check sentiment
        sentiments = (await s.execute(select(func.count(GrowHubContent.id)).where(GrowHubContent.is_alert == True))).scalar()
        
        print(f"Creators: {creators}")
        print(f"Hotspots: {hotspots}")
        print(f"Contents: {contents}")
        print(f"Alerts (Sentiment): {sentiments}")
        
        # Check first creator info
        stmt = select(GrowHubCreator).limit(1)
        creator = (await s.execute(stmt)).scalar()
        if creator:
            print(f"First Creator: {creator.author_name}, fans: {creator.fans_count}")

if __name__ == "__main__":
    asyncio.run(check())
