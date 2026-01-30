import asyncio
import sys
import os
from sqlalchemy import text
# from termcolor import colored

sys.path.append(os.getcwd())

from database.db_session import get_session

async def check_tasks():
    print("🔍 Checking Plugin Tasks...")
    async with get_session() as session:
        # Get last 10 tasks
        stmt = text("""
            SELECT id, task_id, platform, status, task_type, error_message, created_at, completed_at 
            FROM plugin_tasks 
            ORDER BY created_at DESC 
            LIMIT 10
        """)
        try:
            result = await session.execute(stmt)
            rows = result.fetchall()
            
            if not rows:
                print("❌ No plugin tasks found in database.")
                return

            print(f"Found {len(rows)} recent tasks:")
            for row in rows:
                print("-" * 40)
                print(f"ID: {row.id} | Task: {row.task_id[:8]}... | Platform: {row.platform}")
                # Parse timestamps if they are strings
                from datetime import datetime
                created_at = row.created_at
                completed_at = row.completed_at
                
                if isinstance(created_at, str):
                    try:
                        created_at = datetime.fromisoformat(created_at)
                    except:
                        pass
                if isinstance(completed_at, str):
                    try:
                        completed_at = datetime.fromisoformat(completed_at)
                    except:
                        pass

                print(f"Type: {row.task_type} | Time: {created_at}")
                print(f"Status: {row.status}")
                if row.error_message:
                    print(f"Error: {row.error_message}")
                if completed_at and created_at and isinstance(completed_at, datetime) and isinstance(created_at, datetime):
                    duration = (completed_at - created_at).total_seconds()
                    print(f"Duration: {duration:.2f}s")
            
            # Check for specific success
            success_count = sum(1 for r in rows if r.status == "completed" and r.platform == "dy")
            if success_count > 0:
                print(f"\n✅ Found {success_count} SUCCESSFUL Douyin tasks!")
            else:
                 print(f"\n⚠️ No successful Douyin tasks found in last 10 entries.")

        except Exception as e:
            print(f"❌ Error querying database: {e}")
            if "no such table" in str(e):
                print("Suggestion: Table 'plugin_tasks' might not exist or migration is pending.")

if __name__ == "__main__":
    asyncio.run(check_tasks())
