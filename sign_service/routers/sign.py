# -*- coding: utf-8 -*-
"""
Sign API Router

Provides HTTP endpoints for generating platform-specific signatures.
"""

from typing import Dict, Optional, Any
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..browser_pool import browser_pool
from ..signers import get_signer


router = APIRouter()


class SignRequest(BaseModel):
    """Request body for signing"""
    uri: str
    data: Dict[str, Any] = {}
    method: str = "POST"
    cookies: Dict[str, str] = {}


class SignResponse(BaseModel):
    """Response containing signed headers"""
    success: bool
    headers: Dict[str, str] = {}
    error: Optional[str] = None


@router.post("/{platform}", response_model=SignResponse)
async def sign(platform: str, request: SignRequest):
    """
    Generate signature for the specified platform
    
    Args:
        platform: Target platform (xhs, dy, bili, wb, ks)
        request: Sign request containing uri, data, method, and cookies
    
    Returns:
        SignResponse with signed headers
    """
    # Get signer for the platform
    signer = get_signer(platform)
    if not signer:
        raise HTTPException(
            status_code=404,
            detail=f"Platform '{platform}' is not supported. Supported: xhs, dy, bili, wb, ks"
        )

    # Get a page from the pool
    page_instance = await browser_pool.get_page(platform)
    if not page_instance:
        raise HTTPException(
            status_code=503,
            detail=f"No available browser page for platform '{platform}'"
        )

    try:
        # Generate signature
        headers = await signer.sign(
            page=page_instance.page,
            uri=request.uri,
            data=request.data,
            method=request.method,
            cookies=request.cookies
        )
        
        return SignResponse(success=True, headers=headers)
        
    except Exception as e:
        return SignResponse(success=False, error=str(e))
        
    finally:
        # Always release the page back to the pool
        await browser_pool.release_page(page_instance)


@router.get("/status")
async def get_sign_status():
    """Get signing service status"""
    pool_status = await browser_pool.get_status()
    return {
        "service": "sign",
        "pool": pool_status
    }
