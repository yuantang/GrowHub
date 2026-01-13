# -*- coding: utf-8 -*-
# Copyright (c) 2025 relakkes@gmail.com
#
# This file is part of MediaCrawler project.
# Repository: https://github.com/NanmiCoder/MediaCrawler/blob/main/proxy/proxy_ip_pool.py
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

# -*- coding: utf-8 -*-
# @Author  : relakkes@gmail.com
# @Time    : 2023/12/2 13:45
# @Desc    : IP proxy pool implementation
import random
from typing import Dict, List

import httpx
from tenacity import retry, stop_after_attempt, wait_fixed

import config
from proxy.providers import (
    new_kuai_daili_proxy,
    new_wandou_http_proxy,
)
from tools import utils

from .base_proxy import ProxyProvider
from .types import IpInfoModel, ProviderNameEnum


class ProxyIpPool:

    def __init__(
        self, ip_pool_count: int, enable_validate_ip: bool, ip_provider: ProxyProvider
    ) -> None:
        """

        Args:
            ip_pool_count:
            enable_validate_ip:
            ip_provider:
        """
        self.valid_ip_url = "https://echo.apifox.cn/"  # URL to validate if IP is valid
        self.ip_pool_count = ip_pool_count
        self.enable_validate_ip = enable_validate_ip
        self.proxy_list: List[IpInfoModel] = []
        self.ip_provider: ProxyProvider = ip_provider
        self.current_proxy: IpInfoModel | None = None  # Currently used proxy

    async def load_proxies(self) -> None:
        """
        Load IP proxies
        Returns:

        """
        self.proxy_list = await self.ip_provider.get_proxy(self.ip_pool_count)
        self.account_proxy_map: Dict[str, IpInfoModel] = {} # Account-IP Affinity map

    async def _is_valid_proxy(self, proxy: IpInfoModel) -> bool:
        """
        Validate if proxy IP is valid
        :param proxy:
        :return:
        """
        utils.logger.info(
            f"[ProxyIpPool._is_valid_proxy] testing {proxy.ip} is it valid "
        )
        try:
            # httpx 0.28.1 requires passing proxy URL string directly, not a dictionary
            if proxy.user and proxy.password:
                proxy_url = f"http://{proxy.user}:{proxy.password}@{proxy.ip}:{proxy.port}"
            else:
                proxy_url = f"http://{proxy.ip}:{proxy.port}"

            async with httpx.AsyncClient(proxy=proxy_url) as client:
                response = await client.get(self.valid_ip_url)
            if response.status_code == 200:
                return True
            else:
                return False
        except Exception as e:
            utils.logger.info(
                f"[ProxyIpPool._is_valid_proxy] testing {proxy.ip} err: {e}"
            )
            raise e

    @retry(stop=stop_after_attempt(3), wait=wait_fixed(1))
    async def get_proxy(self, account_id: str = None) -> IpInfoModel:
        """
        Randomly extract a proxy IP from the proxy pool, supporting Account-IP Affinity and DB Persistence
        :param account_id: Optional account ID to bind proxy to
        :return:
        """
        # 1. Check in-memory affinity map first
        if account_id and account_id in self.account_proxy_map:
            proxy = self.account_proxy_map[account_id]
            if not proxy.is_expired(buffer_seconds=60):
                utils.logger.debug(f"[ProxyIpPool] Using Memory Affinity Proxy for {account_id}: {proxy.ip}")
                self.current_proxy = proxy
                return proxy
            else:
                utils.logger.info(f"[ProxyIpPool] Affinity Proxy for {account_id} expired, getting new one.")
                del self.account_proxy_map[account_id]

        # 2. Try to load from DB if account_id is provided but not in memory
        if account_id:
            try:
                from database.db_session import get_session
                from database.growhub_models import GrowHubAccount
                from sqlalchemy import select
                
                async with get_session() as session:
                    stmt = select(GrowHubAccount).where(GrowHubAccount.id == account_id)
                    result = await session.execute(stmt)
                    db_account = result.scalar_one_or_none()
                    
                    if db_account and db_account.proxy_config:
                        try:
                            # Load from JSON config stored in DB
                            proxy = IpInfoModel.model_validate(db_account.proxy_config)
                            if not proxy.is_expired(buffer_seconds=60):
                                utils.logger.info(f"✅ [ProxyIpPool] Restored IP Affinity from DB for {account_id}: {proxy.ip}")
                                self.account_proxy_map[account_id] = proxy
                                self.current_proxy = proxy
                                return proxy
                            else:
                                utils.logger.info(f"⚠️ [ProxyIpPool] DB Proxy for {account_id} expired.")
                        except Exception as e:
                            utils.logger.error(f"[ProxyIpPool] Error validating DB proxy config: {e}")
            except Exception as e:
                utils.logger.error(f"[ProxyIpPool] Database access error during affinity load: {e}")

        # 3. Extract new proxy from pool
        if len(self.proxy_list) == 0:
            await self._reload_proxies()

        proxy = random.choice(self.proxy_list)
        self.proxy_list.remove(proxy)
        
        if self.enable_validate_ip:
            if not await self._is_valid_proxy(proxy):
                raise Exception(
                    "[ProxyIpPool.get_proxy] current ip invalid and again get it"
                )
        
        # 4. Bind and Persist to DB
        if account_id:
            self.account_proxy_map[account_id] = proxy
            try:
                from database.db_session import get_session
                from database.growhub_models import GrowHubAccount
                from sqlalchemy import update
                
                async with get_session() as session:
                    # Persist the binding to DB
                    await session.execute(
                        update(GrowHubAccount)
                        .where(GrowHubAccount.id == account_id)
                        .values(
                            last_proxy_id=f"{proxy.ip}:{proxy.port}",
                            proxy_config=proxy.model_dump(),
                            updated_at=utils.get_current_datetime()
                        )
                    )
                    await session.commit()
                    utils.logger.info(f"💾 [ProxyIpPool] Bound & Persisted new IP for {account_id}: {proxy.ip}")
            except Exception as e:
                utils.logger.error(f"[ProxyIpPool] Failed to persist IP affinity to DB: {e}")
            
        self.current_proxy = proxy  # Save currently used proxy
        return proxy



    def is_current_proxy_expired(self, buffer_seconds: int = 30) -> bool:
        """
        Check if current proxy has expired
        Args:
            buffer_seconds: Buffer time (seconds), how many seconds ahead to consider expired
        Returns:
            bool: True means expired or no current proxy, False means still valid
        """
        if self.current_proxy is None:
            return True
        return self.current_proxy.is_expired(buffer_seconds)

    async def get_or_refresh_proxy(self, buffer_seconds: int = 30) -> IpInfoModel:
        """
        Get current proxy, automatically refresh if expired
        Call this method before each request to ensure proxy is valid
        Args:
            buffer_seconds: Buffer time (seconds), how many seconds ahead to consider expired
        Returns:
            IpInfoModel: Valid proxy IP information
        """
        if self.is_current_proxy_expired(buffer_seconds):
            utils.logger.info(
                f"[ProxyIpPool.get_or_refresh_proxy] Current proxy expired or not set, getting new proxy..."
            )
            return await self.get_proxy()
        return self.current_proxy

    async def _reload_proxies(self):
        """
        Reload proxy pool
        :return:
        """
        self.proxy_list = []
        await self.load_proxies()


IpProxyProvider: Dict[str, ProxyProvider] = {
    ProviderNameEnum.KUAI_DAILI_PROVIDER.value: new_kuai_daili_proxy(),
    ProviderNameEnum.WANDOU_HTTP_PROVIDER.value: new_wandou_http_proxy(),
}


async def create_ip_pool(ip_pool_count: int, enable_validate_ip: bool) -> ProxyIpPool:
    """
    Create IP proxy pool
    :param ip_pool_count: Number of IPs in the pool
    :param enable_validate_ip: Whether to enable IP proxy validation
    :return:
    """
    pool = ProxyIpPool(
        ip_pool_count=ip_pool_count,
        enable_validate_ip=enable_validate_ip,
        ip_provider=IpProxyProvider.get(config.IP_PROXY_PROVIDER_NAME),
    )
    await pool.load_proxies()
    return pool


if __name__ == "__main__":
    pass
