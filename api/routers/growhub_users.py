
from typing import Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import select, desc

from api.auth import deps
from database.growhub_models import GrowHubUser
from api.routers.auth import UserOut

router = APIRouter()

@router.get("/users", response_model=List[UserOut])
async def read_users(
    db: Session = Depends(deps.get_db),
    skip: int = 0,
    limit: int = 100,
    status: Optional[str] = Query(None, description="Filter by status (pending/active/disabled)"),
    current_user: GrowHubUser = Depends(deps.get_current_active_admin),
) -> Any:
    """
    Retrieve users. Only for admin.
    """
    query = select(GrowHubUser)
    if status:
        query = query.filter(GrowHubUser.status == status)
    
    # Sort by created_at desc (newest first)
    query = query.order_by(desc(GrowHubUser.created_at))
    query = query.offset(skip).limit(limit)
    
    result = await db.execute(query)
    users = result.scalars().all()
    return users

@router.patch("/users/{user_id}/approve", response_model=UserOut)
async def approve_user(
    user_id: int,
    db: Session = Depends(deps.get_db),
    current_user: GrowHubUser = Depends(deps.get_current_active_admin),
) -> Any:
    """
    Approve a pending user.
    """
    result = await db.execute(select(GrowHubUser).filter(GrowHubUser.id == user_id))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    user.status = "active"
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user

@router.patch("/users/{user_id}/disable", response_model=UserOut)
async def disable_user(
    user_id: int,
    db: Session = Depends(deps.get_db),
    current_user: GrowHubUser = Depends(deps.get_current_active_admin),
) -> Any:
    """
    Disable a user.
    """
    result = await db.execute(select(GrowHubUser).filter(GrowHubUser.id == user_id))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    user.status = "disabled"
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user

@router.delete("/users/{user_id}", response_model=UserOut)
async def delete_user(
    user_id: int,
    db: Session = Depends(deps.get_db),
    current_user: GrowHubUser = Depends(deps.get_current_active_admin),
) -> Any:
    """
    Delete (Reject) a user.
    """
    result = await db.execute(select(GrowHubUser).filter(GrowHubUser.id == user_id))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Prevent deleting yourself
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
        
    await db.delete(user)
    await db.commit()
    return user

@router.patch("/users/{user_id}/role", response_model=UserOut)
async def update_user_role(
    user_id: int,
    role: str = Query(..., regex="^(admin|user)$"),
    db: Session = Depends(deps.get_db),
    current_user: GrowHubUser = Depends(deps.get_current_active_admin),
) -> Any:
    """
    Update a user's role.
    """
    result = await db.execute(select(GrowHubUser).filter(GrowHubUser.id == user_id))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    # Prevent changing your own role
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot change your own role")
        
    user.role = role
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user
