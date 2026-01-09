# -*- coding: utf-8 -*-
# QR Login Service - 扫码登录服务
# 支持通过扫码方式获取平台 Cookie

import asyncio
import base64
import uuid
from datetime import datetime, timedelta
from typing import Dict, Optional, Any
from enum import Enum
import os

try:
    from playwright.async_api import async_playwright, Browser, BrowserContext, Page
    PLAYWRIGHT_AVAILABLE = True
except ImportError:
    PLAYWRIGHT_AVAILABLE = False


class QRLoginStatus(str, Enum):
    """二维码登录状态"""
    PENDING = "pending"       # 等待扫码
    SCANNED = "scanned"       # 已扫码，等待确认
    SUCCESS = "success"       # 登录成功
    EXPIRED = "expired"       # 二维码过期
    CANCELLED = "cancelled"   # 用户取消
    ERROR = "error"           # 登录失败


class QRLoginSession:
    """二维码登录会话"""
    def __init__(self, session_id: str, platform: str):
        self.session_id = session_id
        self.platform = platform
        self.status = QRLoginStatus.PENDING
        self.qr_image_base64: Optional[str] = None
        self.cookies: Optional[str] = None
        self.account_name: Optional[str] = None
        self.error_message: Optional[str] = None
        self.created_at = datetime.now()
        self.expires_at = datetime.now() + timedelta(minutes=3)
        self.browser_context: Optional[BrowserContext] = None
        self.page: Optional[Page] = None
    
    def is_expired(self) -> bool:
        return datetime.now() > self.expires_at


class QRLoginService:
    """扫码登录服务"""
    
    _instance = None
    _initialized = False
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    def __init__(self):
        if self._initialized:
            return
        
        self.sessions: Dict[str, QRLoginSession] = {}
        self.browser: Optional[Browser] = None
        self.playwright = None
        self._lock = asyncio.Lock()
        self._initialized = True
        
        # 平台登录配置
        self.platform_configs = {
            "xhs": {
                "name": "小红书",
                "login_url": "https://www.xiaohongshu.com/explore",
                "qr_selector": ".qrcode-img img, .login-qr-code img, canvas.qrcode",
                "login_check_selector": ".user-avatar, .user-icon, [class*='user'], [data-v-user]",
                "key_cookies": ["a1", "web_session", "webId"],
            },
            "douyin": {
                "name": "抖音",
                "login_url": "https://www.douyin.com/",
                "qr_selector": ".web-login-scan-code__content img, .qrcode-image img",
                "login_check_selector": ".avatar-wrapper, [data-e2e='user-avatar']",
                "key_cookies": ["sessionid", "ttwid", "msToken"],
            },
            "bilibili": {
                "name": "B站",
                "login_url": "https://passport.bilibili.com/login",
                "qr_selector": ".login-scan-wp img, #qrcode-img img",
                "login_check_selector": ".header-vip-avatar, .nav-user-center",
                "key_cookies": ["SESSDATA", "bili_jct", "DedeUserID"],
            },
            "weibo": {
                "name": "微博",
                "login_url": "https://weibo.com/login.php",
                "qr_selector": ".code-img img, .qrcode img",
                "login_check_selector": ".gn_name, .woo-avatar-img",
                "key_cookies": ["SUB", "SUBP", "WBPSESS"],
            },
        }
    
    async def ensure_browser(self):
        """确保浏览器已启动"""
        if not PLAYWRIGHT_AVAILABLE:
            raise Exception("Playwright 未安装，请运行: pip install playwright && playwright install chromium")
        
        if self.browser is None:
            self.playwright = await async_playwright().start()
            self.browser = await self.playwright.chromium.launch(
                headless=True,
                args=[
                    '--disable-blink-features=AutomationControlled',
                    '--disable-features=IsolateOrigins,site-per-process',
                ]
            )
    
    async def start_login(self, platform: str) -> Dict[str, Any]:
        """
        开始扫码登录流程
        返回 session_id 和二维码图片
        """
        if platform not in self.platform_configs:
            return {
                "success": False,
                "error": f"不支持的平台: {platform}"
            }
        
        async with self._lock:
            try:
                await self.ensure_browser()
            except Exception as e:
                return {
                    "success": False,
                    "error": str(e)
                }
        
        session_id = str(uuid.uuid4())[:8]
        session = QRLoginSession(session_id, platform)
        
        config = self.platform_configs[platform]
        
        try:
            # 创建新的浏览器上下文
            context = await self.browser.new_context(
                viewport={"width": 1280, "height": 800},
                user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            )
            page = await context.new_page()
            
            session.browser_context = context
            session.page = page
            
            # 打开登录页面
            await page.goto(config["login_url"], wait_until="networkidle", timeout=30000)
            
            # 等待并触发登录弹窗（某些平台需要点击登录按钮）
            await self._trigger_login_dialog(page, platform)
            
            # 等待二维码加载
            await asyncio.sleep(2)
            
            # 截取二维码图片
            qr_image = await self._capture_qr_code(page, config["qr_selector"])
            if not qr_image:
                # 如果无法获取二维码，截取整个页面
                screenshot = await page.screenshot(full_page=False)
                qr_image = base64.b64encode(screenshot).decode()
            
            session.qr_image_base64 = qr_image
            self.sessions[session_id] = session
            
            # 启动后台轮询检测登录状态
            asyncio.create_task(self._poll_login_status(session_id))
            
            return {
                "success": True,
                "session_id": session_id,
                "platform": platform,
                "platform_name": config["name"],
                "qr_image": qr_image,
                "expires_in": 180  # 3分钟
            }
            
        except Exception as e:
            session.status = QRLoginStatus.ERROR
            session.error_message = str(e)
            return {
                "success": False,
                "error": f"启动登录失败: {str(e)}"
            }
    
    async def _trigger_login_dialog(self, page: Page, platform: str):
        """触发登录弹窗"""
        try:
            if platform == "xhs":
                # 小红书：点击右上角登录按钮
                login_btn = await page.query_selector("text=登录")
                if login_btn:
                    await login_btn.click()
                    await asyncio.sleep(1)
            elif platform == "douyin":
                # 抖音：点击登录
                login_btn = await page.query_selector(".login-btn, text=登录")
                if login_btn:
                    await login_btn.click()
                    await asyncio.sleep(1)
        except Exception:
            pass  # 忽略错误，可能已经显示登录框
    
    async def _capture_qr_code(self, page: Page, selector: str) -> Optional[str]:
        """截取二维码图片"""
        try:
            selectors = selector.split(", ")
            for sel in selectors:
                element = await page.query_selector(sel.strip())
                if element:
                    screenshot = await element.screenshot()
                    return base64.b64encode(screenshot).decode()
            return None
        except Exception:
            return None
    
    async def _poll_login_status(self, session_id: str):
        """后台轮询检测登录状态"""
        session = self.sessions.get(session_id)
        if not session:
            return
        
        config = self.platform_configs.get(session.platform)
        if not config:
            return
        
        poll_interval = 2  # 每2秒检查一次
        max_polls = 90  # 最多检查90次（3分钟）
        
        for _ in range(max_polls):
            if session.status in [QRLoginStatus.CANCELLED, QRLoginStatus.SUCCESS, QRLoginStatus.ERROR]:
                break
            
            if session.is_expired():
                session.status = QRLoginStatus.EXPIRED
                break
            
            try:
                if session.page:
                    # 检查是否已登录
                    logged_in = await session.page.query_selector(config["login_check_selector"])
                    if logged_in:
                        # 获取 Cookie
                        cookies = await session.browser_context.cookies()
                        cookie_str = "; ".join([f"{c['name']}={c['value']}" for c in cookies])
                        
                        session.cookies = cookie_str
                        session.status = QRLoginStatus.SUCCESS
                        
                        # 尝试获取用户名
                        try:
                            username_el = await session.page.query_selector(
                                ".user-name, .nickname, [class*='username'], [class*='nick']"
                            )
                            if username_el:
                                session.account_name = await username_el.text_content()
                        except:
                            pass
                        
                        break
            except Exception:
                pass
            
            await asyncio.sleep(poll_interval)
        
        # 清理资源
        await self._cleanup_session(session_id)
    
    async def get_status(self, session_id: str) -> Dict[str, Any]:
        """获取登录状态"""
        session = self.sessions.get(session_id)
        if not session:
            return {
                "success": False,
                "error": "会话不存在或已过期"
            }
        
        result = {
            "success": True,
            "session_id": session_id,
            "status": session.status.value,
            "platform": session.platform,
        }
        
        if session.status == QRLoginStatus.SUCCESS:
            result["cookies"] = session.cookies
            result["account_name"] = session.account_name or f"{session.platform}_account"
        elif session.status == QRLoginStatus.ERROR:
            result["error"] = session.error_message
        
        return result
    
    async def cancel_login(self, session_id: str) -> Dict[str, Any]:
        """取消登录"""
        session = self.sessions.get(session_id)
        if session:
            session.status = QRLoginStatus.CANCELLED
            await self._cleanup_session(session_id)
        
        return {"success": True}
    
    async def _cleanup_session(self, session_id: str):
        """清理会话资源"""
        session = self.sessions.get(session_id)
        if session:
            try:
                if session.page:
                    await session.page.close()
                if session.browser_context:
                    await session.browser_context.close()
            except:
                pass
            
            # 保留会话信息一段时间，供状态查询
            # 实际应用中应该在一段时间后删除
    
    async def shutdown(self):
        """关闭服务"""
        # 清理所有会话
        for session_id in list(self.sessions.keys()):
            await self._cleanup_session(session_id)
        
        # 关闭浏览器
        if self.browser:
            await self.browser.close()
        if self.playwright:
            await self.playwright.stop()


# 全局实例
qr_login_service = QRLoginService()


def get_qr_login_service() -> QRLoginService:
    return qr_login_service
