import asyncio
import sys
import os

# Put project root in path
sys.path.append(os.getcwd())

import config
from cmd_arg import arg
from media_platform.douyin.client import DouYinClient
from media_platform.douyin.handlers.profile import ProfileHandler
from tools import utils
from playwright.async_api import async_playwright

async def run_worker():
    # Parse args to initialize config (e.g. ACCOUNT_ID, HEADLESS)
    await arg.parse_cmd()
    
    utils.logger.info("👷 [Data Worker] Starting Profile Enrichment Service...")

    # 1. Initialize Playwright & Client (Simulating 'Data Account')
    async with async_playwright() as playwright:
        # Launch browser (Headless=True for server, False for debug)
        browser = await playwright.chromium.launch(headless=config.HEADLESS)
        context = await browser.new_context(viewport={'width': 1920, 'height': 1080})
        page = await context.new_page()

        # Load cookies if available (Assuming current config has valid cookies for DATA usage)
        # Ideally, we should load from GrowHubAccount where role='data'
        # For this script, we use the default config/cookies as the "Data Account"
        
        dy_client = DouYinClient(
            timeout=60,
            headers={"User-Agent": utils.get_user_agent()},
            playwright_page=page,
            cookie_dict={}, # Loaded inside client or via update_cookies
        )
        
        # Initial page load to set cookies
        await page.goto("https://www.douyin.com", wait_until="domcontentloaded")
        await dy_client.update_cookies(context)

        # 2. Initialize Handler
        handler = ProfileHandler(dy_client)

        # 3. Work Loop
        while True:
            try:
                # Fetch batch of 5
                await handler.handle_batch(batch_size=5)
                
                # Sleep between batches
                await asyncio.sleep(5)
                
            except KeyboardInterrupt:
                utils.logger.info("🛑 Worker stopped by user.")
                break
            except Exception as e:
                utils.logger.error(f"❌ Worker crashed: {e}")
                await asyncio.sleep(10)

if __name__ == "__main__":
    try:
        asyncio.run(run_worker())
    except KeyboardInterrupt:
        pass
