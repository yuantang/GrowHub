import requests
import json
import sys

BASE_URL = "http://127.0.0.1:8040"

def inspect_plugin():
    try:
        url = f"{BASE_URL}/api/plugin/inspect"
        print(f"🔍 Inspecting plugin status at {url}...")
        resp = requests.get(url)
        if resp.status_code == 200:
            data = resp.json()
            print("✅ Plugin Status:")
            print(json.dumps(data, indent=2, ensure_ascii=False))
            return data
        else:
            print(f"❌ Failed to inspect plugin: {resp.status_code} - {resp.text}")
            return None
    except Exception as e:
        print(f"❌ Connection error: {e}")
        return None

def trigger_crawl(user_id):
    try:
        url = f"{BASE_URL}/api/plugin/test-crawl"
        params = {
            "user_id": user_id,
            "platform": "dy",
            "keyword": "测试",  # Test keyword
        }
        print(f"🚀 Triggering crawl for User {user_id} with params: {params}...")
        resp = requests.get(url, params=params, timeout=120) # Long timeout for crawl
        if resp.status_code == 200:
            data = resp.json()
            print("✅ Crawl Result:")
            print(f"   Count: {data.get('search_results_count')}")
            notes = data.get("notes", [])
            if notes:
                print(f"   First Note: {notes[0].get('title', 'No Title')}")
            else:
                print("   ⚠️ No notes found.")
        else:
            print(f"❌ Crawl Failed: {resp.status_code} - {resp.text}")
    except Exception as e:
        print(f"❌ Crawl Error: {e}")

def main():
    data = inspect_plugin()
    if not data:
        print("⚠️ Cannot proceed without plugin status.")
        return

    online_users = data.get("online_users", [])
    if not online_users:
        print("⚠️ No online users found. Ensure the browser plugin is connected.")
        return

    # Pick the first user
    target_user = str(online_users[0])
    print(f"🎯 Targeting User ID: {target_user}")
    
    trigger_crawl(target_user)

if __name__ == "__main__":
    main()
