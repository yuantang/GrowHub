from datetime import datetime
from typing import Dict, List, Any
import httpx

class NotificationSender:
    """通知发送服务"""
    
    @staticmethod
    async def send_wechat_work(webhook_url: str, title: str, content: str, urgency: str = "normal") -> bool:
        """发送企业微信通知"""
        urgency_colors = {
            "low": "info",
            "normal": "comment",
            "high": "warning",
            "critical": "warning"
        }
        
        urgency_labels = {
            "low": "📢",
            "normal": "📣",
            "high": "⚠️",
            "critical": "🚨"
        }
        
        message = {
            "msgtype": "markdown",
            "markdown": {
                "content": f"""{urgency_labels.get(urgency, '📣')} **{title}**

{content}

> 发送时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"""
            }
        }
        
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(webhook_url, json=message, timeout=10)
                result = response.json()
                return result.get("errcode") == 0
        except Exception as e:
            print(f"[GrowHub] WeChat Work notification failed: {e}")
            return False
    
    @staticmethod
    async def send_email(smtp_config: Dict, recipients: List[str], title: str, content: str) -> bool:
        """发送邮件通知"""
        # TODO: 实现邮件发送
        # 需要配置 SMTP: host, port, username, password
        print(f"[GrowHub] Email notification: {title} to {recipients}")
        return True
    
    @staticmethod
    async def send_webhook(url: str, headers: Dict, payload: Dict) -> bool:
        """发送 Webhook 通知"""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(url, json=payload, headers=headers, timeout=10)
                return response.status_code == 200
        except Exception as e:
            print(f"[GrowHub] Webhook notification failed: {e}")
            return False
