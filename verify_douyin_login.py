
import asyncio
import os
import sys

# Add project root to path
sys.path.append(os.getcwd())

import config
from media_platform.douyin.core import DouYinCrawler

async def verify_login():
    print("Initializing DouYinCrawler...")
    crawler = DouYinCrawler()
    
    # Override config to ensure visible browser
    config.HEADLESS = False
    config.LOGIN_TYPE = "qrcode"
    
    try:
        print("Starting crawler...")
        # We need to manually invoke what 'start' does but interrupt it for verification
        # Or just verify launch_browser actually uses the right UA
        
        from playwright.async_api import async_playwright
        from tools import utils
        
        async with async_playwright() as playwright:
            print("Launching browser...")
            browser_context = await crawler.launch_browser(
                playwright.chromium,
                None,
                user_agent=config.DEFAULT_USER_AGENT,
                headless=False
            )
            
            page = await browser_context.new_page()
            
            # Verify UA
            ua = await page.evaluate("navigator.userAgent")
            print(f"Actual User-Agent: {ua}")
            if config.DEFAULT_USER_AGENT in ua:
                print("✅ User-Agent matches config!")
            else:
                print(f"❌ User-Agent mismatch! Expected: {config.DEFAULT_USER_AGENT}")

            print("Navigating to douyin.com...")
            await page.goto("https://www.douyin.com")
            await asyncio.sleep(5)
            
            print("Taking screenshot of homepage...")
            await page.screenshot(path="verify_homepage.png")
            
            # Simulate login trigger
            from media_platform.douyin.login import DouYinLogin
            login = DouYinLogin(
                login_type="qrcode",
                login_phone="",
                browser_context=browser_context,
                context_page=page,
                cookie_str=""
            )
            
            print("Triggering popup_login_dialog...")
            await login.popup_login_dialog()
            await asyncio.sleep(2)
            
            print("Taking screenshot of login dialog...")
            await page.screenshot(path="verify_login_dialog.png")
            
            # Check for QR code image
            try:
                # We can't easily invoke login_by_qrcode because it has internal logic that might block or fail if not perfect
                # But we can check if the element exists
                qr_img = await page.query_selector("//div[@id='animate_qrcode_container']//img")
                if qr_img:
                    print("✅ QR Code container found!")
                else:
                    print("❌ QR Code container NOT found!")
            except Exception as e:
                print(f"Error checking QR code: {e}")

            print("Verification complete. Screenshots saved.")
            
    except Exception as e:
        print(f"Verification failed: {e}")

if __name__ == "__main__":
    asyncio.run(verify_login())
