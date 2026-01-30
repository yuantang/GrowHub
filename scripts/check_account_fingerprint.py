import asyncio
import sys
import os
import json

# Add root to sys.path
sys.path.append(os.getcwd())

from sqlalchemy import text
from database.db_session import get_session

async def check_fingerprint():
    print("🔍 [Check] Inspecting ALL Douyin Account Fingerprints...")
    async with get_session() as session:
        # Use raw SQL to avoid model definition issues
        stmt = text("SELECT id, account_name, fingerprint FROM growhub_accounts WHERE platform = 'dy'")
        result = await session.execute(stmt)
        rows = result.fetchall()
        
        if not rows:
            print("❌ [Check] No Douyin accounts found.")
            return

        print(f"✅ [Check] Found {len(rows)} Douyin accounts.")
        
        for account in rows:
            print("-" * 20)
            print(f"👤 Account: {account.account_name} (ID: {account.id})")
            
            if account.fingerprint:
                print(f"   ✅ Fingerprint Data Present!")
                try:
                    # Try to parse if it's a string, or print if it's dict
                    fp_data = account.fingerprint
                    if isinstance(fp_data, str):
                        fp_data = json.loads(fp_data)
                    
                    print(f"      -> User-Agent: {fp_data.get('userAgent', 'N/A')}")
                    print(f"      -> Platform: {fp_data.get('platform', 'N/A')}")
                except Exception as e:
                    print(f"      -> ⚠️ RAW Fingerprint: {account.fingerprint}")
            else:
                print("   ❌ Fingerprint column is EMPTY or NULL.")

if __name__ == "__main__":
    asyncio.run(check_fingerprint())
