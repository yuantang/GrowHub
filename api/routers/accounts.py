# -*- coding: utf-8 -*-
"""
Accounts API Router

Provides API endpoints for managing crawler accounts.
"""

from typing import Optional, List
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from accounts import get_account_manager, AccountStatus

router = APIRouter(prefix="/accounts", tags=["accounts"])


class AccountCreate(BaseModel):
    """Request body for creating an account"""
    platform: str
    name: str
    cookies: str
    notes: str = ""


class AccountUpdate(BaseModel):
    """Request body for updating an account"""
    name: Optional[str] = None
    cookies: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None


@router.get("")
async def list_accounts(platform: Optional[str] = None):
    """
    List all accounts
    
    Args:
        platform: Optional filter by platform
    """
    manager = get_account_manager()
    accounts = manager.get_all_accounts(platform=platform)
    
    return {
        "accounts": accounts,
        "stats": manager.get_stats()
    }


@router.get("/{platform}")
async def list_platform_accounts(platform: str):
    """
    List accounts for a specific platform
    """
    manager = get_account_manager()
    accounts = manager.get_all_accounts(platform=platform)
    
    if platform not in accounts:
        return {"accounts": [], "total": 0}
    
    return {
        "accounts": accounts.get(platform, []),
        "total": len(accounts.get(platform, []))
    }


@router.get("/{platform}/{account_id}")
async def get_account(platform: str, account_id: str):
    """
    Get details of a specific account
    """
    manager = get_account_manager()
    account = manager.get_account_by_id(platform, account_id)
    
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    
    return account.to_summary()


@router.post("/{platform}")
async def create_account(platform: str, data: AccountCreate):
    """
    Create a new account
    """
    if data.platform != platform:
        raise HTTPException(
            status_code=400,
            detail="Platform in URL must match platform in body"
        )
    
    manager = get_account_manager()
    account = manager.add_account(
        platform=platform,
        name=data.name,
        cookies=data.cookies,
        notes=data.notes
    )
    
    return {
        "message": "Account created successfully",
        "account": account.to_summary()
    }


@router.put("/{platform}/{account_id}")
async def update_account(platform: str, account_id: str, data: AccountUpdate):
    """
    Update an account
    """
    manager = get_account_manager()
    
    updates = {}
    if data.name is not None:
        updates["name"] = data.name
    if data.cookies is not None:
        updates["cookies"] = data.cookies
    if data.notes is not None:
        updates["notes"] = data.notes
    if data.status is not None:
        try:
            updates["status"] = AccountStatus(data.status)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid status. Valid values: {[s.value for s in AccountStatus]}"
            )
    
    account = manager.update_account(platform, account_id, **updates)
    
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    
    return {
        "message": "Account updated successfully",
        "account": account.to_summary()
    }


@router.delete("/{platform}/{account_id}")
async def delete_account(platform: str, account_id: str):
    """
    Delete an account
    """
    manager = get_account_manager()
    deleted = manager.remove_account(platform, account_id)
    
    if not deleted:
        raise HTTPException(status_code=404, detail="Account not found")
    
    return {"message": "Account deleted successfully"}


@router.post("/{platform}/{account_id}/activate")
async def activate_account(platform: str, account_id: str):
    """
    Activate an account (remove ban/cooldown status)
    """
    manager = get_account_manager()
    account = manager.get_account_by_id(platform, account_id)
    
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    
    account.mark_active()
    manager.save_accounts()
    
    return {"message": "Account activated", "account": account.to_summary()}


@router.post("/{platform}/{account_id}/disable")
async def disable_account(platform: str, account_id: str):
    """
    Disable an account
    """
    manager = get_account_manager()
    account = manager.get_account_by_id(platform, account_id)
    
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    
    account.mark_disabled()
    manager.save_accounts()
    
    return {"message": "Account disabled", "account": account.to_summary()}


@router.get("/stats/overview")
async def get_account_stats():
    """
    Get overall account statistics
    """
    manager = get_account_manager()
    return manager.get_stats()
