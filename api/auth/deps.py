from typing import Generator, Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from pydantic import ValidationError
from sqlalchemy.orm import Session
from api.auth import security
from database.growhub_models import GrowHubUser
from database.db_session import get_session

# Token URL used by Swagger UI
reusable_oauth2 = OAuth2PasswordBearer(
    tokenUrl="/api/auth/login"
)

async def get_db() -> Generator:
    """Dependency for getting async DB session"""
    async with get_session() as session:
        yield session

async def get_current_user(
    db: Session = Depends(get_db),
    token: str = Depends(reusable_oauth2)
) -> GrowHubUser:
    """
    Get current user from JWT token.
    Used for protected routes.
    """
    try:
        payload = jwt.decode(
            token, security.SECRET_KEY, algorithms=[security.ALGORITHM]
        )
        user_id = payload.get("sub")
        if user_id is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Could not validate credentials",
            )
    except (JWTError, ValidationError):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Could not validate credentials",
        )
    
    # In async sqlalchemy, we execute a query
    from sqlalchemy import select
    result = await db.execute(select(GrowHubUser).filter(GrowHubUser.id == int(user_id)))
    user = result.scalars().first()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if user.status != "active":
        raise HTTPException(status_code=400, detail="Inactive user")
        
    return user

async def get_current_active_admin(
    current_user: GrowHubUser = Depends(get_current_user),
) -> GrowHubUser:
    """Verify user is admin"""
    if current_user.role != "admin":
        raise HTTPException(
            status_code=400, detail="The user doesn't have enough privileges"
        )
    return current_user
