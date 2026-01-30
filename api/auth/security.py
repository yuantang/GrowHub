from datetime import datetime, timedelta
from typing import Optional, Union, Any
from jose import jwt
from passlib.context import CryptContext

# Secret key (should be in env, but fallback for dev)
# TODO: Move to config and use env var
SECRET_KEY = "CHANGE_ME_IN_PRODUCTION_SECRET_KEY"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days

import bcrypt

# SECRET_KEY and other JWT config...
# ALGORITHM = "HS256"
# ...

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verify a password against its hash using direct bcrypt library to avoid
    passlib's 72-byte bug with bcrypt 4.0+
    """
    try:
        # bcrypt.checkpw expects bytes
        password_bytes = plain_password.encode('utf-8')
        hash_bytes = hashed_password.encode('utf-8')
        return bcrypt.checkpw(password_bytes, hash_bytes)
    except Exception as e:
        print(f"Password verification error: {e}")
        return False

def get_password_hash(password: str) -> str:
    """
    Hash a password using direct bcrypt library
    """
    password_bytes = password.encode('utf-8')
    # salt = bcrypt.gensalt()
    # bcrypt.hashpw returns bytes
    hashed = bcrypt.hashpw(password_bytes, bcrypt.gensalt())
    return hashed.decode('utf-8')

def create_access_token(subject: Union[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode = {"sub": str(subject), "exp": expire}
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt
