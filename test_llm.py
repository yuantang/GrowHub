import asyncio
import os
import httpx
import json

OPENROUTER_API_KEY = "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"
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"

async def test():
    print(f"Using Key: {OPENROUTER_API_KEY[:10]}...")
    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "HTTP-Referer": "http://localhost:8080", 
        "X-Title": "MediaCrawler",
        "Content-Type": "application/json"
    }
    
    models_to_try = [
        "google/gemini-2.0-flash-exp:free",
        "google/gemini-flash-1.5-8b",
        "meta-llama/llama-3.1-70b-instruct:free",
        "deepseek/deepseek-chat"
    ]
    
    for model in models_to_try:
        print(f"\n--- Testing model: {model} ---")
        data = {
            "model": model,
            "messages": [
                {"role": "user", "content": "List 3 fruits in JSON array format."}
            ],
            "temperature": 0.7
        }

        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(
                    f"{OPENROUTER_BASE_URL}/chat/completions", 
                    json=data, 
                    headers=headers, 
                    timeout=15.0
                )
                print(f"Status: {response.status_code}")
                print(f"Body: {response.text[:500]}")
                
            except Exception as e:
                print(f"Exception: {e}")

if __name__ == "__main__":
    asyncio.run(test())
