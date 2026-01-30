import asyncio
import sys
import os
import random

# Add root to sys.path
sys.path.append(os.getcwd())

from media_platform.douyin.client import DouYinClient
from database.db_session import get_session
from database.growhub_models import GrowHubAccount
from sqlalchemy import select
from playwright.async_api import async_playwright

async def main():
    print("🔍 [Debug] Starting Douyin API self-test...")
    
    # 1. Get Account
    async with get_session() as session:
        # Prioritize account with fingerprint (e.g. Plugin-DY-tangyuan)
        stmt = select(GrowHubAccount).where(
            GrowHubAccount.platform == 'dy'
        ).where(
            GrowHubAccount.fingerprint.isnot(None)
        ).limit(1)
        result = await session.execute(stmt)
        account = result.scalar_one_or_none()
        
        # Fallback to any account if no fingerprint found (but this is what we want to test)
        if not account:
             stmt = select(GrowHubAccount).where(GrowHubAccount.platform == 'dy').limit(1)
             result = await session.execute(stmt)
             account = result.scalar_one_or_none()
        
    if not account:
        print("❌ [Debug] No Douyin account found in DB.")
        return

    print(f"✅ [Debug] Found account: {account.account_name}")
    
    # 2. Parse Cookies & UA
    cookies_str = account.cookies
    cookie_dict = {}
    for item in cookies_str.split(";"):
        if "=" in item:
            k, v = item.strip().split("=", 1)
            cookie_dict[k] = v

    # Default UA
    ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    
    # Try using fingerprint UA
    if account.fingerprint and isinstance(account.fingerprint, dict):
        fp_ua = account.fingerprint.get("userAgent") or account.fingerprint.get("navigator", {}).get("userAgent")
        if fp_ua:
            ua = fp_ua
            print(f"✅ [Debug] Using Synced User-Agent: {ua}")
        else:
            print("⚠️ [Debug] Fingerprint found but no UserAgent inside.")
    else:
        print("⚠️ [Debug] No fingerprint found for account.")

    # 3. Launch Browser & Client
    async with async_playwright() as p:
        print("🚀 [Debug] Launching HEADFUL browser...")
        browser = await p.chromium.launch(headless=False, args=["--disable-blink-features=AutomationControlled"])
        context = await browser.new_context(
            user_agent=ua,
            viewport={"width": 1280, "height": 720}
        )
        page = await context.new_page()
        
        # Add stealth
        await page.add_init_script(path="libs/stealth.min.js")
        
        # Navigate domain
        try:
            await page.goto("https://www.douyin.com", wait_until="domcontentloaded", timeout=15000)
            await asyncio.sleep(2) # Wait for environment
        except Exception as e:
            print(f"⚠️ [Debug] Navigation warning: {e}")

        # Inject Config
        import config
        config.ACCOUNT_ID = account.id
        config.DEFAULT_USER_AGENT = ua
        
        # Init Client with UA
        client = DouYinClient(
            headers={
                "User-Agent": ua,
                "Cookie": cookies_str,
                "Referer": "https://www.douyin.com/"
            },
            playwright_page=page,
            cookie_dict=cookie_dict,
        )

        # 4. Execute Search
        keyword = "测试"
        print(f"🔎 [Debug] Searching for keyword: '{keyword}'...")
        try:
            res = await client.search_info_by_keyword(keyword=keyword)
            
            status_code = res.get("status_code", -1)
            data_list = res.get("data", []) or res.get("aweme_list", []) # Search usually returns 'data' or 'aweme_list' depending on endpoint
            
            print(f"📊 [Debug] Response Status Code: {status_code}")
            print(f"📦 [Debug] Data Items Count: {len(data_list)}")
            
            if status_code == 0 and len(data_list) > 0:
                 print("✅ [Debug] API Call SUCCESS! Data retrieved.")
                 item=data_list[0]
                 title = item.get('aweme_info', {}).get('desc') or item.get('desc') or 'No Title'
                 print(f"   - First item title: {title}")
                 
                 # Print final params used (we can't easily see internal method scope, but if it worked, it's good)
            else:
                 print("⚠️ [Debug] API Call Returned Empty Data or Error.")
                 print(f"   - Full Response: {str(res)[:500]}")

        except Exception as e:
            print(f"❌ [Debug] API Call Failed with Exception: {type(e).__name__}: {e}")
        
        await browser.close()
        print("🏁 [Debug] Test Finished.")

if __name__ == "__main__":
    asyncio.run(main())
