
import asyncio
from database.db_session import get_async_engine
from database.models import Base
from database.growhub_models import *  # 导入所有 GrowHub 模型
from config.base_config import SAVE_DATA_OPTION
import config

async def init_tables():
    print(f"Initializing database tables (Mode: {SAVE_DATA_OPTION})...")
    engine = get_async_engine(SAVE_DATA_OPTION)
    
    if not engine:
        print("Error: Could not get database engine. Check your config.")
        return

    async with engine.begin() as conn:
        # Create all tables defined in Base.metadata
        # This includes both original MediaCrawler tables and new GrowHub tables
        await conn.run_sync(Base.metadata.create_all)
        print("Tables created successfully.")

    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(init_tables())
