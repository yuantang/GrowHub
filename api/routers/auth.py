from datetime import timedelta
from typing import Any
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from sqlalchemy import select

from api.auth import security, deps
from database.growhub_models import GrowHubUser
from pydantic import BaseModel, EmailStr

router = APIRouter()

# --- Schemas ---
class UserCreate(BaseModel):
    username: str
    password: str
    email: EmailStr = None

class UserOut(BaseModel):
    id: int
    username: str
    email: str | None = None
    role: str
    status: str
    
    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str

# --- Routes ---

@router.post("/login", response_model=Token)
async def login_access_token(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(deps.get_db)
) -> Any:
    """
    OAuth2 compatible token login, get an access token for future requests
    """
    # 1. Fetch user by username
    result = await db.execute(select(GrowHubUser).filter(GrowHubUser.username == form_data.username))
    user = result.scalars().first()
    
    # 2. Verify password
    if not user or not security.verify_password(form_data.password, user.password_hash):
        raise HTTPException(status_code=400, detail="Incorrect username or password")
    
    if user.status == "pending":
        raise HTTPException(
            status_code=403, 
            detail="Account is pending approval. Please contact administrator."
        )
    
    if user.status != "active":
        raise HTTPException(status_code=400, detail="Inactive user")
    
    # 3. Create token
    access_token_expires = timedelta(minutes=security.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = security.create_access_token(
        subject=user.id, expires_delta=access_token_expires
    )
    return {
        "access_token": access_token,
        "token_type": "bearer",
    }

@router.post("/register", response_model=UserOut)
async def register_new_user(
    item: UserCreate,
    db: Session = Depends(deps.get_db)
) -> Any:
    """
    Register a new user
    """
    # Check if username exists
    result = await db.execute(select(GrowHubUser).filter(GrowHubUser.username == item.username))
    if result.scalars().first():
        raise HTTPException(
            status_code=400,
            detail="The user with this username already exists in the system",
        )
    
    user = GrowHubUser(
        username=item.username,
        email=item.email,
        password_hash=security.get_password_hash(item.password),
        role="user",
        status="pending" 
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user

@router.get("/me", response_model=UserOut)
async def read_users_me(
    current_user: GrowHubUser = Depends(deps.get_current_user),
) -> Any:
    """
    Get current user
    """
    return current_user
