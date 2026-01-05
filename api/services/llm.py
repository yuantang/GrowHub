import os
import json
import httpx
from typing import List

# Try to get from env, or a default placeholder
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "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")
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"

async def get_keyword_suggestions(keyword: str, mode: str, model: str = "google/gemini-2.0-flash-exp:free") -> List[str]:
    """
    Call OpenRouter to generate keywords.
    """
    # If no key, maybe we should return a special error/signal, but for now log and return empty
    # so frontend can trigger fallback or show error.
    if not OPENROUTER_API_KEY:
        print("Warning: OPENROUTER_API_KEY environment variable is not set.")
        # For better UX, might return a specific error message if we could, 
        # but type signature says List[str].
        return []

    # Prompt Construction
    if mode == 'risk':
        prompt = f"""
        你是一位危机公关专家。
        请针对品牌或话题 "{keyword}" 生成 15 个**中文**负面或预警关键词。
        关注点包括：差评、避雷、吐槽、假货、副作用、质量差、智商税、坑人、虚假宣传、退款。
        请直接返回一个 JSON 字符串数组，不要包含 ```json 或其他 Markdown 格式，不要包含其他解释文本。
        示例: ["避雷", "假货", "智商税"]
        """
    else: # trend
        prompt = f"""
        你是一位社交媒体内容营销专家。
        请针对品牌或话题 "{keyword}" 生成 15 个**中文**热门关联词、长尾词或流量词。
        关注点包括：热门话题、种草、测评、爆款、推荐、好用、教程、穿搭(如适用)。
        请直接返回一个 JSON 字符串数组，不要包含 ```json 或其他 Markdown 格式，不要包含其他解释文本。
        示例: ["测评", "推荐", "好物"]
        """

    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "HTTP-Referer": "http://localhost:8080", # Local dev origin
        "X-Title": "MediaCrawler",
        "Content-Type": "application/json"
    }
    
    data = {
        "model": model,
        "messages": [
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.7
    }

    async with httpx.AsyncClient() as client:
        try:
            print(f"DEBUG: Sending request to OpenRouter model={model}")
            response = await client.post(
                f"{OPENROUTER_BASE_URL}/chat/completions", 
                json=data, 
                headers=headers, 
                timeout=30.0
            )
            
            if response.status_code != 200:
                print(f"DEBUG: API Error. Status: {response.status_code}, Body: {response.text}")
                return []

            result = response.json()
            
            if 'choices' in result and len(result['choices']) > 0:
                content = result['choices'][0]['message']['content'].strip()
                print(f"DEBUG: LLM Raw Content: {content}")
                
                # Robust JSON extraction using regex
                import re
                match = re.search(r'\[.*?\]', content, re.DOTALL)
                if match:
                    json_str = match.group(0)
                    try:
                        keywords = json.loads(json_str)
                        if isinstance(keywords, list):
                            # Filter strings only
                            return [str(k) for k in keywords if isinstance(k, (str, int))]
                    except json.JSONDecodeError:
                        print(f"DEBUG: JSON Parse Failed for: {json_str}")
            
            print("DEBUG: No valid JSON array found in response")
            return []
            
        except Exception as e:
            print(f"DEBUG: OpenRouter Exception: {str(e)}")
            return []
