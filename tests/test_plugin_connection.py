import requests
import json
import sys
import time

API_BASE = "http://localhost:8040/api"
USERNAME = "3"  # ID for tangyuan
PASSWORD = "password"  # Default password if not changed, or I need to create a user

from jose import jwt
from datetime import datetime, timedelta

SECRET_KEY = "CHANGE_ME_IN_PRODUCTION_SECRET_KEY"
ALGORITHM = "HS256"

def create_local_token(username):
    print(f"[*] Forging local token for {username}...")
    expire = datetime.utcnow() + timedelta(minutes=60)
    to_encode = {"sub": username, "exp": expire}
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    print(f"[+] Token generated: {encoded_jwt[:20]}...")
    return encoded_jwt

def check_plugin_status(token):
    headers = {"Authorization": f"Bearer {token}"}
    print("[*] Checking plugin status...")
    try:
        resp = requests.get(f"{API_BASE}/plugin/status", headers=headers)
        data = resp.json()
        print(f"[*] Status Response: {json.dumps(data, indent=2)}")
        return data.get("connected", False)
    except Exception as e:
        print(f"[!] Failed to get status: {e}")
        return False

def test_fetch(token):
    headers = {"Authorization": f"Bearer {token}"}
    print("[*] Testing Plugin Fetch (Baidu)...")
    try:
        resp = requests.post(f"{API_BASE}/plugin/test-fetch", 
                           headers=headers,
                           params={"url": "https://www.baidu.com"})
        
        print(f"[*] Fetch Response Code: {resp.status_code}")
        try:
            data = resp.json()
            print(f"[*] Fetch Result: {json.dumps(data, indent=2)[:500]}...") # Truncate
            if data.get("success"):
                print("[+] TEST PASSED: Plugin successfully fetched remote URL")
                return True
            else:
                print("[-] TEST FAILED: Plugin returned failure")
                return False
        except:
            print(f"[-] Raw Response: {resp.text}")
            return False
            
    except Exception as e:
        print(f"[!] Test fetch error: {e}")
        return False

if __name__ == "__main__":
    token = create_local_token(USERNAME)
    
    # Check status
    connected = check_plugin_status(token)
    
    # Even if status says disconnected, try fetch (status might be slightly delayed or cached)
    # But usually status is real-time from WebSocket manager
    
    if connected:
        print("[+] Plugin is reported ONLINE")
    else:
        print("[-] Plugin is reported OFFLINE (will try fetch anyway)")
        
    result = test_fetch(token)
    
    if result:
        sys.exit(0)
    else:
        sys.exit(1)
