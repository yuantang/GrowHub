# -*- coding: utf-8 -*-
"""
Signers Package

Registry and factory for platform-specific signers.
"""

from typing import Optional, Dict, Type

from .base import BaseSigner
from .xhs import XHSSigner
from .douyin import DouyinSigner
from .bilibili import BilibiliSigner
from .weibo import WeiboSigner
from .kuaishou import KuaishouSigner


# Registry of available signers
_SIGNERS: Dict[str, BaseSigner] = {}


def _register_signers():
    """Register all available signers"""
    global _SIGNERS
    
    signers = [
        XHSSigner(),
        DouyinSigner(),
        BilibiliSigner(),
        WeiboSigner(),
        KuaishouSigner(),
    ]
    
    for signer in signers:
        _SIGNERS[signer.platform] = signer


def get_signer(platform: str) -> Optional[BaseSigner]:
    """
    Get signer for the specified platform
    
    Args:
        platform: Platform identifier (xhs, dy, bili, wb, ks)
    
    Returns:
        BaseSigner instance or None if not found
    """
    if not _SIGNERS:
        _register_signers()
    
    return _SIGNERS.get(platform)


def get_supported_platforms() -> list:
    """Get list of supported platforms"""
    if not _SIGNERS:
        _register_signers()
    
    return list(_SIGNERS.keys())


__all__ = [
    "BaseSigner", 
    "XHSSigner",
    "DouyinSigner", 
    "BilibiliSigner",
    "WeiboSigner",
    "KuaishouSigner",
    "get_signer", 
    "get_supported_platforms"
]
