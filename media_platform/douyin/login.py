# -*- coding: utf-8 -*-
# Copyright (c) 2025 relakkes@gmail.com
#
# This file is part of MediaCrawler project.
# Repository: https://github.com/NanmiCoder/MediaCrawler/blob/main/media_platform/douyin/login.py
# GitHub: https://github.com/NanmiCoder
# Licensed under NON-COMMERCIAL LEARNING LICENSE 1.1
#

# 声明：本代码仅供学习和研究目的使用。使用者应遵守以下原则：
# 1. 不得用于任何商业用途。
# 2. 使用时应遵守目标平台的使用条款和robots.txt规则。
# 3. 不得进行大规模爬取或对平台造成运营干扰。
# 4. 应合理控制请求频率，避免给目标平台带来不必要的负担。
# 5. 不得用于任何非法或不当的用途。
#
# 详细许可条款请参阅项目根目录下的LICENSE文件。
# 使用本代码即表示您同意遵守上述原则和LICENSE中的所有条款。


import asyncio
import functools
import sys
from typing import Optional

from playwright.async_api import BrowserContext, Page
from playwright.async_api import TimeoutError as PlaywrightTimeoutError
from tenacity import (RetryError, retry, retry_if_result, stop_after_attempt,
                      wait_fixed)

import config
from base.base_crawler import AbstractLogin
from cache.cache_factory import CacheFactory
from tools import utils


class DouYinLogin(AbstractLogin):

    def __init__(self,
                 login_type: str,
                 browser_context: BrowserContext, # type: ignore
                 context_page: Page, # type: ignore
                 login_phone: Optional[str] = "",
                 cookie_str: Optional[str] = ""
                 ):
        config.LOGIN_TYPE = login_type
        self.browser_context = browser_context
        self.context_page = context_page
        self.login_phone = login_phone
        self.scan_qrcode_time = 120
        self.cookie_str = cookie_str

    async def begin(self):
        """
            Start login douyin website
            The verification accuracy of the slider verification is not very good... If there are no special requirements, it is recommended not to use Douyin login, or use cookie login
        """

        # For cookie login, inject cookies first then handle verification
        if config.LOGIN_TYPE == "cookie":
            utils.logger.info("[DouYinLogin.begin] Using cookie login mode...")
            await self.login_by_cookies()
            await self.context_page.goto("https://www.douyin.com")
            await asyncio.sleep(3)
        else:
            # For qrcode/phone login, use the original flow with popup
            await self.popup_login_dialog()

            if config.LOGIN_TYPE == "qrcode":
                await self.login_by_qrcode()
            elif config.LOGIN_TYPE == "phone":
                await self.login_by_mobile()
            else:
                raise ValueError("[DouYinLogin.begin] Invalid Login Type Currently only supported qrcode or phone or cookie ...")

        # CRITICAL: Handle verification page for ALL login types (including cookie!)
        utils.logger.info("[DouYinLogin.begin] Checking for verification page...")
        await asyncio.sleep(3)
        current_page_title = await self.context_page.title()
        utils.logger.info(f"[DouYinLogin.begin] Current page title: {current_page_title}")
        
        # Handle verification page
        if "验证码中间页" in current_page_title:
            utils.logger.warning("[DouYinLogin.begin] Verification page detected!")
            
            # Take screenshot for debugging
            try:
                await self.context_page.screenshot(path="douyin_verification_page.png")
                utils.logger.info("[DouYinLogin.begin] Screenshot saved as douyin_verification_page.png")
            except:
                pass
            
            # CRITICAL: Detect captcha type FIRST
            captcha_type = await self._detect_captcha_type()
            utils.logger.info(f"[DouYinLogin.begin] Detected captcha type: {captcha_type}")
            
            if captcha_type == "slider":
                # Try slider verification (max 3 attempts, not 5)
                for attempt in range(3):
                    utils.logger.info(f"[DouYinLogin.begin] Slider verification attempt {attempt + 1}/3")
                    await self.check_page_display_slider(move_step=3, slider_level="hard")
                    await asyncio.sleep(3)
                    
                    current_page_title = await self.context_page.title()
                    if "验证码中间页" not in current_page_title:
                        utils.logger.info("[DouYinLogin.begin] Slider verification passed!")
                        break
                else:
                    # Slider failed, fall through to QR login
                    utils.logger.warning("[DouYinLogin.begin] Slider verification failed, switching to QR login...")
                    await self._trigger_qr_login()
            else:
                # Click captcha or unknown - directly use QR login
                utils.logger.warning(f"[DouYinLogin.begin] {captcha_type} captcha detected, cannot auto-solve. Using QR login...")
                await self._trigger_qr_login()

        # Check login state
        if config.LOGIN_TYPE == "cookie":
            is_logged_in = await self._check_cookie_login_success()
            if is_logged_in:
                utils.logger.info("[DouYinLogin.begin] Cookie login successful!")
            else:
                utils.logger.warning("[DouYinLogin.begin] Cookie login state unclear, proceeding anyway...")
        else:
            utils.logger.info("[DouYinLogin.begin] Checking login state...")
            try:
                await self.check_login_state()
            except RetryError:
                utils.logger.info("[DouYinLogin.begin] login failed please confirm ...")
                sys.exit()

        # wait for redirect
        wait_redirect_seconds = 5
        utils.logger.info(f"[DouYinLogin.begin] Login finished, waiting {wait_redirect_seconds} seconds...")
        await asyncio.sleep(wait_redirect_seconds)

    @retry(stop=stop_after_attempt(600), wait=wait_fixed(1), retry=retry_if_result(lambda value: value is False))
    async def check_login_state(self):
        """Check if the current login status is successful and return True otherwise return False"""
        current_cookie = await self.browser_context.cookies()
        _, cookie_dict = utils.convert_cookies(current_cookie)

        for page in self.browser_context.pages:
            try:
                local_storage = await page.evaluate("() => window.localStorage")
                if local_storage.get("HasUserLogin", "") == "1":
                    return True
            except Exception as e:
                # utils.logger.warn(f"[DouYinLogin] check_login_state waring: {e}")
                await asyncio.sleep(0.1)

        if cookie_dict.get("LOGIN_STATUS") == "1":
            return True

        return False

    async def _check_cookie_login_success(self) -> bool:
        """
        Check if cookie login was successful. Uses more lenient criteria than check_login_state.
        Only tries a few times instead of 600.
        """
        for attempt in range(5):
            try:
                # Check localStorage
                local_storage = await self.context_page.evaluate("() => window.localStorage")
                if local_storage.get("HasUserLogin", "") == "1":
                    utils.logger.info(f"[DouYinLogin._check_cookie_login_success] Found HasUserLogin=1 in localStorage")
                    return True
                
                # Check cookies
                current_cookies = await self.browser_context.cookies()
                _, cookie_dict = utils.convert_cookies(current_cookies)
                
                if cookie_dict.get("LOGIN_STATUS") == "1":
                    utils.logger.info(f"[DouYinLogin._check_cookie_login_success] Found LOGIN_STATUS=1 in cookies")
                    return True
                
                # Also check for core auth cookies as a fallback
                core_auth_cookies = ["passport_csrf_token", "passport_auth_mix_state", "__ac_signature"]
                has_auth = any(cookie_dict.get(c) for c in core_auth_cookies)
                if has_auth:
                    utils.logger.info(f"[DouYinLogin._check_cookie_login_success] Found core auth cookies, assuming logged in")
                    return True
                    
            except Exception as e:
                utils.logger.warning(f"[DouYinLogin._check_cookie_login_success] Check failed (attempt {attempt+1}): {e}")
            
            await asyncio.sleep(1)
        
        return False
    
    async def _detect_captcha_type(self) -> str:
        """
        Detect the type of captcha on the verification page.
        Returns: 'slider', 'click', or 'unknown'
        """
        try:
            page_content = await self.context_page.content()
            
            # Slider verification indicators
            slider_indicators = [
                "captcha-verify-image",
                "secsdk_captcha_drag",
                "拖动滑块"
            ]
            for indicator in slider_indicators:
                if indicator in page_content:
                    return "slider"
            
            # Click verification indicators
            click_indicators = [
                "请完成下列验证后继续",
                "按顺序点击",
                "请点击图中",
                "请依次点击"
            ]
            for indicator in click_indicators:
                if indicator in page_content:
                    return "click"
            
            return "unknown"
        except Exception as e:
            utils.logger.error(f"[DouYinLogin._detect_captcha_type] Error: {e}")
            return "unknown"
    
    async def _trigger_qr_login(self):
        """
        Trigger QR code login flow. Navigates to main page and shows QR code.
        """
        utils.logger.info("[DouYinLogin._trigger_qr_login] Triggering QR code login...")
        
        try:
            # Clear cookies to force logout and ensure login dialog can appear
            await self.browser_context.clear_cookies()
            utils.logger.info("[DouYinLogin._trigger_qr_login] Cleared cookies to force fresh login")
            
            # Navigate to main page
            await self.context_page.goto("https://www.douyin.com")
            await asyncio.sleep(3)
            
            # Check if we are stuck on verification page
            title = await self.context_page.title()
            if "验证" in title:
                utils.logger.error("[DouYinLogin._trigger_qr_login] Stuck on verification page even after clearing cookies. IP might be blocked.")
                # Try to force reload or wait
                await asyncio.sleep(2)
            
            # Try to popup login dialog
            await self.popup_login_dialog()
            
            # Show QR code
            await self.login_by_qrcode()
            
            # Wait for user to scan QR code (up to self.scan_qrcode_time seconds)
            utils.logger.info(f"[DouYinLogin._trigger_qr_login] ⚠️ Please scan QR code to login ({self.scan_qrcode_time} seconds timeout)...")
            utils.logger.info("[DouYinLogin._trigger_qr_login] QR码已显示，请使用抖音APP扫描二维码登录！")
            
            for i in range(self.scan_qrcode_time):
                await asyncio.sleep(1)
                try:
                    current_title = await self.context_page.title()
                    if "验证" not in current_title and "登录" not in current_title and "抖音" in current_title:
                        utils.logger.info(f"[DouYinLogin._trigger_qr_login] QR login successful! Page: {current_title}")
                        return True
                    
                    # Check login state via cookies
                    is_logged = await self._check_cookie_login_success()
                    if is_logged:
                        utils.logger.info("[DouYinLogin._trigger_qr_login] QR login successful!")
                        return True
                except:
                    pass
                
                if i % 10 == 0 and i > 0:
                    utils.logger.info(f"[DouYinLogin._trigger_qr_login] Waiting for QR scan... {self.scan_qrcode_time-i}s remaining")
            
            utils.logger.error("[DouYinLogin._trigger_qr_login] QR login timed out")
            return False
            
        except Exception as e:
            utils.logger.error(f"[DouYinLogin._trigger_qr_login] QR login failed: {e}")
            return False

    async def popup_login_dialog(self):
        """If the login dialog box does not pop up automatically, we will manually click the login button"""
        dialog_selector = "xpath=//div[@id='login-panel-new']"
        
        # Function to check if dialog is open
        async def is_dialog_open():
            try:
                dialog = self.context_page.locator(dialog_selector)
                return await dialog.count() > 0 and await dialog.is_visible()
            except:
                return False

        # If already open, return
        if await is_dialog_open():
            return

        utils.logger.info("[DouYinLogin.popup_login_dialog] Dialog not open, trying to open it...")
        
        # Try to click login button - Attempt 1
        await self._click_login_button()
        await asyncio.sleep(2)
        if await is_dialog_open():
            return

        # Attempt 2: Reload page and try again
        utils.logger.info("[DouYinLogin.popup_login_dialog] Click failed, reloading page...")
        await self.context_page.reload()
        await asyncio.sleep(5)
        
        # Check title again
        current_title = await self.context_page.title()
        if "验证" in current_title:
             utils.logger.error(f"[DouYinLogin.popup_login_dialog] Reloaded but still on verification page: {current_title}")
             return

        # Clear cookies again just in case
        await self.browser_context.clear_cookies()
        
        await self._click_login_button()
        await asyncio.sleep(2)
        if await is_dialog_open():
            return
            
        utils.logger.error(f"[DouYinLogin.popup_login_dialog] Failed to open login dialog after retries. Current Title: {current_title}")
        
    async def _click_login_button(self):
        login_selectors = [
                 "xpath=//p[text() = '登录']",
                 "header a[href*='login']",
                 "button:has-text('登录')",
                 ".login-button",
                 "#header-login-button",
                 "div:has-text('登录')",
                 "li:has-text('登录')",
                 "span:has-text('登录')"
        ]
            
        for selector in login_selectors:
            try:
                # Use stricter matching for generic tags to avoid false positives (like '登录成功' text)
                if "text(" in selector and ("div" in selector or "span" in selector):
                     btn = self.context_page.locator(selector).first
                     # Ensure it's clickable or looks like a button
                else:
                     btn = self.context_page.locator(selector).first
                
                if await btn.count() > 0 and await btn.is_visible():
                    utils.logger.info(f"[DouYinLogin] Clicking login button: {selector}")
                    await btn.click(force=True)
                    return True
            except:
                continue
        return False

    async def login_by_qrcode(self):
        utils.logger.info("[DouYinLogin.login_by_qrcode] Begin login douyin by qrcode...")
        qrcode_img_selector = "xpath=//div[@id='animate_qrcode_container']//img"
        base64_qrcode_img = await utils.find_login_qrcode(
            self.context_page,
            selector=qrcode_img_selector,
            timeout=self.scan_qrcode_time * 1000
        )
        if not base64_qrcode_img:
            utils.logger.info("[DouYinLogin.login_by_qrcode] login qrcode not found please confirm ...")
            sys.exit()

        partial_show_qrcode = functools.partial(utils.show_qrcode, base64_qrcode_img)
        asyncio.get_running_loop().run_in_executor(executor=None, func=partial_show_qrcode)
        await asyncio.sleep(2)

    async def login_by_mobile(self):
        utils.logger.info("[DouYinLogin.login_by_mobile] Begin login douyin by mobile ...")
        mobile_tap_ele = self.context_page.locator("xpath=//li[text() = '验证码登录']")
        await mobile_tap_ele.click()
        await self.context_page.wait_for_selector("xpath=//article[@class='web-login-mobile-code']")
        mobile_input_ele = self.context_page.locator("xpath=//input[@placeholder='手机号']")
        await mobile_input_ele.fill(self.login_phone)
        await asyncio.sleep(0.5)
        send_sms_code_btn = self.context_page.locator("xpath=//span[text() = '获取验证码']")
        await send_sms_code_btn.click()

        # Check if there is slider verification
        await self.check_page_display_slider(move_step=10, slider_level="easy")
        cache_client = CacheFactory.create_cache(config.CACHE_TYPE_MEMORY)
        max_get_sms_code_time = self.scan_qrcode_time * 2  # Give more time for SMS
        while max_get_sms_code_time > 0:
            utils.logger.info(f"[DouYinLogin.login_by_mobile] get douyin sms code from redis remaining time {max_get_sms_code_time}s ...")
            await asyncio.sleep(1)
            sms_code_key = f"dy_{self.login_phone}"
            sms_code_value = cache_client.get(sms_code_key)
            if not sms_code_value:
                max_get_sms_code_time -= 1
                continue

            sms_code_input_ele = self.context_page.locator("xpath=//input[@placeholder='请输入验证码']")
            await sms_code_input_ele.fill(value=sms_code_value.decode())
            await asyncio.sleep(0.5)
            submit_btn_ele = self.context_page.locator("xpath=//button[@class='web-login-button']")
            await submit_btn_ele.click()  # Click login
            # todo ... should also check the correctness of the verification code, it may be incorrect
            break

    async def check_page_display_slider(self, move_step: int = 10, slider_level: str = "easy"):
        """
        Check if slider verification appears on the page
        :return:
        """
        # Wait for slider verification to appear
        back_selector = "#captcha-verify-image"
        try:
            await self.context_page.wait_for_selector(selector=back_selector, state="visible", timeout=30 * 1000)
        except PlaywrightTimeoutError:  # No slider verification, return directly
            return

        gap_selector = 'xpath=//*[@id="captcha_container"]/div/div[2]/img[2]'
        max_slider_try_times = 20
        slider_verify_success = False
        while not slider_verify_success:
            if max_slider_try_times <= 0:
                utils.logger.error("[DouYinLogin.check_page_display_slider] slider verify failed ...")
                sys.exit()
            try:
                await self.move_slider(back_selector, gap_selector, move_step, slider_level)
                await asyncio.sleep(1)

                # If the slider is too slow or verification failed, it will prompt "操作过慢", click the refresh button here
                page_content = await self.context_page.content()
                if "操作过慢" in page_content or "提示重新操作" in page_content:
                    utils.logger.info("[DouYinLogin.check_page_display_slider] slider verify failed, retry ...")
                    await self.context_page.click(selector="//a[contains(@class, 'secsdk_captcha_refresh')]")
                    continue

                # After successful sliding, wait for the slider to disappear
                await self.context_page.wait_for_selector(selector=back_selector, state="hidden", timeout=1000)
                # If the slider disappears, it means the verification is successful, break the loop. If not, it means the verification failed, the above line will throw an exception and be caught to continue the loop
                utils.logger.info("[DouYinLogin.check_page_display_slider] slider verify success ...")
                slider_verify_success = True
            except Exception as e:
                utils.logger.error(f"[DouYinLogin.check_page_display_slider] slider verify failed, error: {e}")
                await asyncio.sleep(1)
                max_slider_try_times -= 1
                utils.logger.info(f"[DouYinLogin.check_page_display_slider] remaining slider try times: {max_slider_try_times}")
                continue

    async def move_slider(self, back_selector: str, gap_selector: str, move_step: int = 10, slider_level="easy"):
        """
        Move the slider to the right to complete the verification
        :param back_selector: Selector for the slider verification background image
        :param gap_selector:  Selector for the slider verification slider
        :param move_step: Controls the ratio of single movement speed, default is 1, meaning the distance moves in 0.1 seconds no matter how far, larger value means slower
        :param slider_level: Slider difficulty easy hard, corresponding to the slider for mobile verification code and the slider in the middle of verification code
        :return:
        """

        # get slider background image
        slider_back_elements = await self.context_page.wait_for_selector(
            selector=back_selector,
            timeout=1000 * 10,  # wait 10 seconds
        )
        slide_back = str(await slider_back_elements.get_property("src")) # type: ignore

        # get slider gap image
        gap_elements = await self.context_page.wait_for_selector(
            selector=gap_selector,
            timeout=1000 * 10,  # wait 10 seconds
        )
        gap_src = str(await gap_elements.get_property("src")) # type: ignore

        # Identify slider position
        slide_app = utils.Slide(gap=gap_src, bg=slide_back)
        distance = slide_app.discern()

        # Get movement trajectory
        tracks = utils.get_tracks(distance, slider_level)
        new_1 = tracks[-1] - (sum(tracks) - distance)
        tracks.pop()
        tracks.append(new_1)

        # Drag slider to specified position according to trajectory
        element = await self.context_page.query_selector(gap_selector)
        bounding_box = await element.bounding_box() # type: ignore

        await self.context_page.mouse.move(bounding_box["x"] + bounding_box["width"] / 2, # type: ignore
                                           bounding_box["y"] + bounding_box["height"] / 2) # type: ignore
        # Get x coordinate center position
        x = bounding_box["x"] + bounding_box["width"] / 2 # type: ignore
        # Simulate sliding operation
        await element.hover() # type: ignore
        await self.context_page.mouse.down()

        for track in tracks:
            # Loop mouse movement according to trajectory
            # steps controls the ratio of single movement speed, default is 1, meaning the distance moves in 0.1 seconds no matter how far, larger value means slower
            await self.context_page.mouse.move(x + track, 0, steps=move_step)
            x += track
        await self.context_page.mouse.up()

    async def login_by_cookies(self):
        utils.logger.info("[DouYinLogin.login_by_cookies] Begin login douyin by cookie ...")
        for key, value in utils.convert_str_cookie_to_dict(self.cookie_str).items():
            await self.browser_context.add_cookies([{
                'name': key,
                'value': value,
                'domain': ".douyin.com",
                'path': "/"
            }])
