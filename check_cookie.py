import asyncio
from database.db_session import get_session
from database.growhub_models import GrowHubAccount
from sqlalchemy import select
import config

# Need to set config to help get_session find DB
config.SAVE_DATA_OPTION = "sqlite"

async def check():
    try:
        async with get_session() as session:
            if not session:
                print("Could not get session")
                return
            result = await session.execute(select(GrowHubAccount))
            acct = result.scalars().first()
            if acct:
                print(f"Account: {acct.account_name}")
                print(f"Cookie Length: {len(acct.cookies)}")
                print(f"Cookie Preview: {acct.cookies[:100]}")
            else:
                print("No accounts found.")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(check())
