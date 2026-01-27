
import sys
import os
from unittest.mock import MagicMock

# Mock dependencies not available in test env
sys.modules["cv2"] = MagicMock()
sys.modules["PIL"] = MagicMock()
sys.modules["PIL.Image"] = MagicMock()
sys.modules["PIL.ImageDraw"] = MagicMock()
sys.modules["PIL.ImageShow"] = MagicMock()
sys.modules["playwright"] = MagicMock()
sys.modules["playwright.async_api"] = MagicMock()

import httpx
from fastapi.testclient import TestClient

# Add project root to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from api.main import app
from database.db_session import get_session
from database.growhub_models import GrowHubUser

client = TestClient(app)

def create_user(username, password):
    response = client.post("/auth/register", json={
        "username": username,
        "password": password,
        "email": f"{username}@example.com"
    })
    # If already exists, login
    if response.status_code == 400 and "already exists" in response.text:
        pass
    else:
        assert response.status_code == 200, f"Register failed: {response.text}"
    
    # Login
    response = client.post("/auth/login", data={
        "username": username,
        "password": password
    })
    assert response.status_code == 200, f"Login failed: {response.text}"
    return response.json()["access_token"]

def test_isolation():
    print("=== Starting Isolation Verification ===")
    
    # 1. Setup Users
    token_a = create_user("verify_user_a", "password123")
    token_b = create_user("verify_user_b", "password123")
    
    headers_a = {"Authorization": f"Bearer {token_a}"}
    headers_b = {"Authorization": f"Bearer {token_b}"}
    
    print("✅ Users Created/Logged in")
    
    # 2. User A creates Project
    project_payload = {
        "name": "Project A Private",
        "description": "User A's Secret Project",
        "keywords": ["test"],
        "platforms": ["xhs"]
    }
    resp = client.post("/growhub/projects", json=project_payload, headers=headers_a)
    assert resp.status_code == 200, f"Project creation failed: {resp.text}"
    project_id_a = resp.json()["id"]
    print(f"✅ User A created Project {project_id_a}")
    
    # 3. User B lists projects - Should NOT see Project A
    resp = client.get("/growhub/projects", headers=headers_b)
    projects_b = resp.json()
    assert not any(p["id"] == project_id_a for p in projects_b), "FAIL: User B can see User A's project in list!"
    print("✅ User B cannot see User A's project in list")
    
    # 4. User B tries to get Project A directly
    resp = client.get(f"/growhub/projects/{project_id_a}", headers=headers_b)
    assert resp.status_code == 404, f"FAIL: User B accessed User A's project! Status: {resp.status_code}"
    print("✅ User B cannot access User A's project detail (404)")
    
    # 5. User A adds Account
    account_payload = {
        "platform": "xhs",
        "account_name": "Account A",
        "cookies": "session=test_cookie_for_isolation_a;",
        "group": "default"
    }
    resp = client.post("/growhub/accounts/", json=account_payload, headers=headers_a)
    assert resp.status_code == 200, f"Account add failed: {resp.text}"
    account_id_a = resp.json()["id"]
    print(f"✅ User A added Account {account_id_a}")
    
    # 6. User B lists accounts - Should NOT see Account A
    resp = client.get("/growhub/accounts/", headers=headers_b)
    accounts_b = resp.json()["items"]
    assert not any(a["id"] == account_id_a for a in accounts_b), "FAIL: User B can see User A's account!"
    print("✅ User B cannot see User A's account")
    
    # 7. User B tries to update Account A
    resp = client.put(f"/growhub/accounts/{account_id_a}", json={"notes": "Hacked"}, headers=headers_b)
    assert resp.status_code == 404, f"FAIL: User B could update User A's account!"
    print("✅ User B cannot modify User A's account (404)")
    
    print("\n=== Verification Successful! Multi-tenant Isolation Confirmed. ===")

if __name__ == "__main__":
    try:
        # Ensure tables exist
        # We assume api/main.py startup event handles this usually, but via TestClient startup event runs.
        with TestClient(app) as c:
            test_isolation()
    except AssertionError as e:
        print(f"\n❌ VERIFICATION FAILED: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        sys.exit(1)
