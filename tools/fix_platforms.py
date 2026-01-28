import asyncio
from sqlalchemy import select, update
from database.db_session import get_session
from database.growhub_models import GrowHubAccount

async def fix_platforms():
    async with get_session() as session:
        # Check existing
        result = await session.execute(select(GrowHubAccount))
        accounts = result.scalars().all()
        print(f"Checking {len(accounts)} accounts...")
        
        updates = 0
        for acc in accounts:
            new_plat = None
            if acc.platform == "xiaohongshu":
                new_plat = "xhs"
            elif acc.platform == "douyin":
                new_plat = "dy"
            elif acc.platform == "kuaishou":
                new_plat = "ks"
            elif acc.platform == "bilibili":
                new_plat = "bili"
            elif acc.platform == "weibo":
                new_plat = "wb"
                
            if new_plat:
                print(f"Fixing account {acc.id}: {acc.platform} -> {new_plat}")
                acc.platform = new_plat
                updates += 1
        
        if updates > 0:
            await session.commit()
            print(f"Fixed {updates} accounts.")
        else:
            print("No accounts needed fixing.")

if __name__ == "__main__":
    asyncio.run(fix_platforms())
