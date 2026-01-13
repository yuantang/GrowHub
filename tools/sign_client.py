# -*- coding: utf-8 -*-
"""
Sign Service Client

HTTP client for calling the remote sign service.
Used by crawlers when ENABLE_SIGN_SERVICE is True.
"""

import httpx
from typing import Dict, Optional, Any

import config


class SignServiceClient:
    """Client for calling the sign service"""

    def __init__(self, base_url: str = None, timeout: float = 30.0):
        """
        Initialize sign service client
        
        Args:
            base_url: Base URL of the sign service (default: from config)
            timeout: Request timeout in seconds
        """
        self.base_url = base_url or getattr(config, 'SIGN_SERVICE_URL', 'http://localhost:8081')
        self.timeout = timeout
        self._client: Optional[httpx.AsyncClient] = None

    async def _get_client(self) -> httpx.AsyncClient:
        """Get or create HTTP client"""
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=self.timeout)
        return self._client

    async def sign(
        self,
        platform: str,
        uri: str,
        data: Dict[str, Any] = None,
        method: str = "POST",
        cookies: Dict[str, str] = None
    ) -> Dict[str, str]:
        """
        Call sign service to generate signature headers
        
        Args:
            platform: Target platform (xhs, dy, bili, etc.)
            uri: API endpoint path
            data: Request data
            method: HTTP method
            cookies: Cookie dictionary
        
        Returns:
            Dictionary of signed headers
        
        Raises:
            Exception: If signing fails
        """
        client = await self._get_client()
        
        try:
            response = await client.post(
                f"{self.base_url}/sign/{platform}",
                json={
                    "uri": uri,
                    "data": data or {},
                    "method": method,
                    "cookies": cookies or {}
                }
            )
            response.raise_for_status()
            
            result = response.json()
            if result.get("success"):
                return result.get("headers", {})
            else:
                raise Exception(f"Signing failed: {result.get('error')}")
                
        except httpx.HTTPStatusError as e:
            raise Exception(f"Sign service HTTP error: {e}")
        except httpx.RequestError as e:
            raise Exception(f"Sign service connection error: {e}")

    async def douyin_sign(
        self,
        uri: str,
        params: str,
        user_agent: str,
        post_data: Dict = None
    ) -> str:
        """
        RPC 签名借鉴：向签名服务器请求 Douyin a_bogus
        """
        client = await self._get_client()
        try:
            response = await client.post(
                f"{self.base_url}/sign/douyin",
                json={
                    "uri": uri,
                    "params": params,
                    "user_agent": user_agent,
                    "post_data": post_data or {}
                }
            )
            response.raise_for_status()
            result = response.json()
            if result.get("success"):
                return result.get("a_bogus", "")
            return ""
        except Exception as e:
            # RPC 失败时不抛出异常，允许降级到本地 JS
            print(f"⚠️ [RPC] Douyin sign failed: {e}")
            return ""

    async def health_check(self) -> bool:
        """
        Check if sign service is healthy
        
        Returns:
            True if service is healthy, False otherwise
        """
        client = await self._get_client()
        
        try:
            response = await client.get(f"{self.base_url}/health")
            return response.status_code == 200
        except Exception:
            return False

    async def get_status(self) -> Dict[str, Any]:
        """
        Get sign service status
        
        Returns:
            Status dictionary
        """
        client = await self._get_client()
        
        try:
            response = await client.get(f"{self.base_url}/sign/status")
            response.raise_for_status()
            return response.json()
        except Exception as e:
            return {"error": str(e)}

    async def close(self):
        """Close the HTTP client"""
        if self._client:
            await self._client.aclose()
            self._client = None


# Global singleton instance
_sign_client: Optional[SignServiceClient] = None


def get_sign_client() -> SignServiceClient:
    """Get the global sign service client instance"""
    global _sign_client
    if _sign_client is None:
        _sign_client = SignServiceClient()
    return _sign_client


async def close_sign_client():
    """Close the global sign service client"""
    global _sign_client
    if _sign_client:
        await _sign_client.close()
        _sign_client = None
