from datetime import datetime, timedelta
from typing import Optional, Union, Any
from jose import jwt
from passlib.context import CryptContext

# Secret key (should be in env, but fallback for dev)
# TODO: Move to config and use env var
SECRET_KEY = "CHANGE_ME_IN_PRODUCTION_SECRET_KEY"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    # bcrypt has a 72 byte limit. Truncate to 71 bytes to be safe (null terminator).
    # Passlib handles bytes input correctly for bcrypt
    password_bytes = plain_password.encode('utf-8')
    if len(password_bytes) > 71:
        password_bytes = password_bytes[:71]
    
    # Check for passlib/bcrypt compatibility issue (bcrypt >= 4.0.0 breaks passlib 1.7.4)
    # We catch the specific error and try to handle it or just rely on bytes
    try:
        return pwd_context.verify(password_bytes, hashed_password)
    except Exception:
        # Fallback for some library versions: pass as string (may be risky if encoding expands)
        # But properly, we should just rely on bytes.
        # If verify failed due to version mismatch, we might need to patch passlib, but let's try just bytes first.
        # Reraise if it's not the specific known error.
        raise

def get_password_hash(password: str) -> str:
    # bcrypt has a 72 byte limit. Truncate to 71 bytes.
    password_bytes = password.encode('utf-8')
    if len(password_bytes) > 71:
        password_bytes = password_bytes[:71]
    return pwd_context.hash(password_bytes)

def create_access_token(subject: Union[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode = {"sub": str(subject), "exp": expire}
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt
