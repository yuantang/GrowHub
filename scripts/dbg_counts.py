import asyncio
from database.db_session import get_session
from database.growhub_models import GrowHubCreator, GrowHubContent
from sqlalchemy import select, func

async def main():
    async with get_session() as s:
        # Check Creators
        res = await s.execute(select(func.count(GrowHubCreator.id)))
        total_creators = res.scalar()
        print(f"Total Creators in DB: {total_creators}")
        
        # Check fans count distribution
        has_fans = await s.execute(select(func.count(GrowHubCreator.id)).where(GrowHubCreator.fans_count > 0))
        has_fans_count = has_fans.scalar()
        print(f"Creators with fans_count > 0: {has_fans_count}")
        
        no_fans = await s.execute(select(GrowHubCreator.id, GrowHubCreator.author_name).where(GrowHubCreator.fans_count == 0).limit(5))
        no_fans_list = no_fans.all()
        print(f"Sample creators with 0 fans: {no_fans_list}")

        status_res = await s.execute(select(GrowHubCreator.status, func.count(GrowHubCreator.id)).group_by(GrowHubCreator.status))
        print(f"Status counts in DB: {status_res.all()}")
        
        # Check Projects
        from database.growhub_models import GrowHubProject
        res = await s.execute(select(GrowHubProject.id, GrowHubProject.name, GrowHubProject.total_crawled, GrowHubProject.purpose))
        print(f"Projects: {res.all()}")
        
        # Check Content
        res = await s.execute(select(GrowHubContent.category, func.count(GrowHubContent.id)).group_by(GrowHubContent.category))
        print(f"Content category counts: {res.all()}")

if __name__ == "__main__":
    asyncio.run(main())
