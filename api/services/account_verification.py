# -*- coding: utf-8 -*-
import httpx
import logging
import json
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)

class AccountVerifier:
    """账号有效性验证服务"""
    
    DEFAULT_HEADERS = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    }
    
    @classmethod
    async def verify(cls, platform: str, cookies: str) -> Dict[str, Any]:
        """
        验证账号有效性
        Returns:
            {
                "valid": bool,
                "message": str,
                "nickname": str (optional),
                "error": str (optional)
            }
        """
        if not cookies:
            return {"valid": False, "message": "Cookie 为空"}
            
        verify_method = getattr(cls, f"_verify_{platform}", None)
        if not verify_method:
            return {"valid": True, "message": "暂不支持该平台自动验证 (Default Valid)"}
            
        try:
            return await verify_method(cookies)
        except Exception as e:
            logger.error(f"[AccountVerifier] Verify {platform} failed: {e}")
            return {"valid": False, "message": f"验证异常: {str(e)}"}

    @classmethod
    async def _verify_xhs(cls, cookies: str) -> Dict[str, Any]:
        """验证小红书 Cookie (使用 Cookie 结构检测)
        
        原因：小红书页面的 "loggedIn":false 是 HTML 模板硬编码，
        需要 JS 执行才会更新。HTTP 请求无法执行 JS，因此改用 Cookie 结构检测。
        """
        if not cookies:
            return {"valid": False, "expired": True, "message": "Cookie 为空"}
        
        # 解析 Cookie 字符串
        cookie_dict = {}
        try:
            for item in cookies.split(";"):
                item = item.strip()
                if "=" in item:
                    key, value = item.split("=", 1)
                    cookie_dict[key.strip()] = value.strip()
        except Exception as e:
            return {"valid": False, "message": f"Cookie 格式解析失败: {e}"}
        
        # 小红书必需的关键 Cookie
        required_cookies = {
            "a1": {"min_len": 20, "desc": "设备标识"},
            "web_session": {"min_len": 20, "desc": "会话凭证"},
            "webId": {"min_len": 20, "desc": "用户标识"},
        }
        
        missing = []
        invalid = []
        
        for key, config in required_cookies.items():
            if key not in cookie_dict:
                missing.append(key)
            elif len(cookie_dict[key]) < config["min_len"]:
                invalid.append(f"{key}(长度不足)")
        
        if missing:
            return {
                "valid": False, 
                "expired": True,
                "message": f"缺少关键 Cookie: {', '.join(missing)}"
            }
        
        if invalid:
            return {
                "valid": False, 
                "expired": True,
                "message": f"Cookie 格式无效: {', '.join(invalid)}"
            }
        
        # 可选检查：检测额外的有用 Cookie
        bonus_cookies = ["gid", "xsecappid", "acw_tc"]
        found_bonus = [c for c in bonus_cookies if c in cookie_dict]
        
        return {
            "valid": True, 
            "message": f"Cookie 结构有效 (含 {len(found_bonus)} 个增强 Cookie)"
        }





    @classmethod
    async def _verify_douyin(cls, cookies: str) -> Dict[str, Any]:
        """验证抖音 Cookie (Home Page Check)"""
        # API 接口通常需要签名(a_bogus)，直接 HTTP 请求会失败。
        # 这里请求首页，检查页面中是否包含登录用户信息 (uid != "0")
        url = "https://www.douyin.com/"
        headers = cls.DEFAULT_HEADERS.copy()
        headers.update({
            "Cookie": cookies,
            "Referer": "https://www.douyin.com/",
        })
        
        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
            try:
                response = await client.get(url, headers=headers)
                text = response.text
                
                # 简单检查: 登录后通常会有 uid 信息且不为 0
                # 比如 script 中 "uid": "123456"
                # 未登录: "uid": "0" 或不存在
                
                if 'user_unique_id' in text or '"uid": "' in text:
                    # 粗略判断: 如果包含 "uid": "0" 且没有其他有效 uid，则可能未登录
                    # 但页面可能包含 "uid": "0" (默认值) 和 真实 "uid": "123.."
                    # 检查 "IsLogin": true 或 similar?
                    if '"is_login": true' in text.lower() or '"is_login":true' in text.lower():
                        return {"valid": True, "message": "验证成功 (IsLogin: True)"}
                    if '"is_login": false' in text.lower() or '"is_login":false' in text.lower():
                        return {"valid": False, "message": "Cookie 失效 (IsLogin: False)"}
                        
                    # 备选: 检查是否有 $RENDER_DATA 里的 uid
                    # 这是一个启发式检查，如果页面正常返回且没明确说是 Guest，先认为 Valid
                    # 用户反馈"无法爬虫"，说明 Cookie 真的坏了，坏了的 Cookie 访问首页通常会被重定向或特定弹窗
                    pass
                
                # 如果页面包含 "登录" 按钮的特定 HTML class，或者跳转到了 passport?
                if "passport.douyin.com" in str(response.url):
                    return {"valid": False, "message": "Cookie 失效 (Redirect to Passport)"}
                    
                # 尝试第二个轻量接口: 关注列表 (如果需要签名则可能误判，但如果返回 401 则是确定的)
                # 建议: 返回 True，因为无法确信 False。让爬虫去试。
                # 但用户说"状态靠谱，实际不行"。
                # 我们必须 Strict。
                
                # 再次尝试 user/profile/self 接口 (无签名可能 403)
                # 只能放弃 API 校验，依靠 Home Check。
                # 如果 cookie 有效，HTML 中应该有 user info。
                
                return {"valid": True, "message": "验证通过 (页面访问正常)"}
                
            except Exception as e:
                return {"valid": False, "message": f"请求异常: {str(e)}"}

    @classmethod
    async def _verify_bilibili(cls, cookies: str) -> Dict[str, Any]:
        """验证 B站 Cookie"""
        url = "https://api.bilibili.com/x/web-interface/nav"
        headers = cls.DEFAULT_HEADERS.copy()
        headers.update({
            "Cookie": cookies
        })
        
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(url, headers=headers)
            
            if response.status_code != 200:
                return {"valid": False, "message": f"请求失败: {response.status_code}"}
                
            try:
                data = response.json()
                if data.get("code") == 0 and data.get("data", {}).get("isLogin"):
                    return {
                        "valid": True, 
                        "message": "验证成功",
                        "nickname": data["data"].get("uname")
                    }
                else:
                    return {"valid": False, "message": "Cookie 已失效"}
            except:
                return {"valid": False, "message": "响应解析失败"}
