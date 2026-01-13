# -*- coding: utf-8 -*-
# GrowHub AI Service - 智能内容创作服务
# Phase 2: AI 增强与智能化

import os
import json
import httpx
import re
from typing import List, Dict, Any, Optional
from enum import Enum
from pydantic import BaseModel


# ==================== 配置 ====================

class LLMProvider(str, Enum):
    OPENROUTER = "openrouter"
    DEEPSEEK = "deepseek"
    OLLAMA = "ollama"


# API Keys and URLs
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "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")
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"

DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "")
DEEPSEEK_BASE_URL = "https://api.deepseek.com/v1"

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")

# Default models
DEFAULT_MODELS = {
    LLMProvider.OPENROUTER: "google/gemini-2.0-flash-exp:free",
    LLMProvider.DEEPSEEK: "deepseek-chat",
    LLMProvider.OLLAMA: "qwen2.5:7b",
}


# ==================== Prompt 模板 ====================

COMMENT_STYLES = {
    "professional": {
        "name": "专业评论",
        "description": "以行业专家身份发表专业见解",
        "prompt_hint": "用专业但不晦涩的语言，展现你对这个领域的深度理解"
    },
    "humorous": {
        "name": "幽默风趣",
        "description": "用轻松幽默的方式吸引关注",
        "prompt_hint": "用网络流行语、段子手风格，要接地气、有梗、让人想点赞"
    },
    "empathy": {
        "name": "共情走心",
        "description": "引发情感共鸣，拉近距离",
        "prompt_hint": "真诚分享感受，体现理解和认同，让人觉得'说到心坎里了'"
    },
    "question": {
        "name": "提问互动",
        "description": "通过提问引发讨论",
        "prompt_hint": "提出有价值的问题，引导对话深入，激发回复欲望"
    },
    "subtle_promo": {
        "name": "软性引流",
        "description": "自然融入品牌/产品信息",
        "prompt_hint": "在分享观点中巧妙提及相关产品或服务，不能太硬广"
    }
}

REWRITE_STYLES = {
    "xiaohongshu": {
        "name": "小红书风格",
        "description": "种草笔记风格，使用emoji和分段",
        "prompt_hint": "标题要吸睛，多用emoji，分点列出，有个人体验感"
    },
    "douyin": {
        "name": "抖音脚本",
        "description": "短视频口播脚本风格",
        "prompt_hint": "开头3秒抓眼球，节奏快，口语化，有金句"
    },
    "weibo": {
        "name": "微博热议",
        "description": "话题讨论风格，简短有力",
        "prompt_hint": "观点鲜明，适合转发，带话题标签"
    },
    "professional": {
        "name": "专业文章",
        "description": "深度分析长文风格",
        "prompt_hint": "结构清晰，论据充分，有数据支撑"
    }
}


# ==================== 核心 LLM 调用函数 ====================

async def call_llm(
    prompt: str,
    provider: LLMProvider = LLMProvider.OPENROUTER,
    model: Optional[str] = None,
    temperature: float = 0.7,
    max_tokens: int = 2000
) -> str:
    """
    统一的 LLM 调用接口
    """
    model = model or DEFAULT_MODELS.get(provider)
    
    if provider == LLMProvider.OPENROUTER:
        return await _call_openrouter(prompt, model, temperature, max_tokens)
    elif provider == LLMProvider.DEEPSEEK:
        return await _call_deepseek(prompt, model, temperature, max_tokens)
    elif provider == LLMProvider.OLLAMA:
        return await _call_ollama(prompt, model, temperature, max_tokens)
    else:
        raise ValueError(f"Unsupported provider: {provider}")


async def _call_openrouter(prompt: str, model: str, temperature: float, max_tokens: int) -> str:
    """Call OpenRouter API"""
    if not OPENROUTER_API_KEY:
        raise ValueError("OPENROUTER_API_KEY not set")
    
    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "HTTP-Referer": "http://localhost:8040",
        "X-Title": "GrowHub",
        "Content-Type": "application/json"
    }
    
    data = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": temperature,
        "max_tokens": max_tokens
    }
    
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{OPENROUTER_BASE_URL}/chat/completions",
            json=data,
            headers=headers,
            timeout=60.0
        )
        
        if response.status_code != 200:
            raise Exception(f"OpenRouter API error: {response.status_code} - {response.text}")
        
        result = response.json()
        if 'choices' in result and len(result['choices']) > 0:
            return result['choices'][0]['message']['content'].strip()
        
        raise Exception("No response from OpenRouter")


async def _call_deepseek(prompt: str, model: str, temperature: float, max_tokens: int) -> str:
    """Call DeepSeek API"""
    if not DEEPSEEK_API_KEY:
        raise ValueError("DEEPSEEK_API_KEY not set. Please set it in environment variables.")
    
    headers = {
        "Authorization": f"Bearer {DEEPSEEK_API_KEY}",
        "Content-Type": "application/json"
    }
    
    data = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": temperature,
        "max_tokens": max_tokens
    }
    
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{DEEPSEEK_BASE_URL}/chat/completions",
            json=data,
            headers=headers,
            timeout=60.0
        )
        
        if response.status_code != 200:
            raise Exception(f"DeepSeek API error: {response.status_code} - {response.text}")
        
        result = response.json()
        if 'choices' in result and len(result['choices']) > 0:
            return result['choices'][0]['message']['content'].strip()
        
        raise Exception("No response from DeepSeek")


async def _call_ollama(prompt: str, model: str, temperature: float, max_tokens: int) -> str:
    """Call local Ollama API"""
    data = {
        "model": model,
        "prompt": prompt,
        "stream": False,
        "options": {
            "temperature": temperature,
            "num_predict": max_tokens
        }
    }
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                f"{OLLAMA_BASE_URL}/api/generate",
                json=data,
                timeout=120.0
            )
            
            if response.status_code != 200:
                raise Exception(f"Ollama API error: {response.status_code}")
            
            result = response.json()
            return result.get('response', '').strip()
        except httpx.ConnectError:
            raise Exception("Ollama service not running. Please start Ollama first.")


# ==================== 智能评论生成 ====================

async def generate_smart_comments(
    content: str,
    content_title: Optional[str] = None,
    platform: str = "xiaohongshu",
    styles: List[str] = ["professional", "humorous", "empathy"],
    brand_keywords: Optional[List[str]] = None,
    provider: LLMProvider = LLMProvider.OPENROUTER,
    model: Optional[str] = None
) -> Dict[str, Any]:
    """
    智能评论生成
    根据原始内容生成多种风格的神评论
    """
    
    style_descriptions = ""
    for i, style in enumerate(styles, 1):
        style_info = COMMENT_STYLES.get(style, COMMENT_STYLES["professional"])
        style_descriptions += f"\n{i}. 【{style_info['name']}】: {style_info['prompt_hint']}"
    
    brand_context = ""
    if brand_keywords:
        brand_context = f"\n\n注意：如果自然合适，可以巧妙提及这些关键词：{', '.join(brand_keywords)}"
    
    prompt = f"""你是一位资深的社交媒体运营专家，擅长在各大平台写出高互动的评论。

现在有一条{platform}平台的内容需要你去评论：

【标题】{content_title or '无标题'}
【内容】{content[:1000]}

请按照以下风格各生成1条高质量评论：
{style_descriptions}
{brand_context}

要求：
1. 每条评论控制在50-150字
2. 符合{platform}平台的语言风格
3. 要有互动性，能引发回复
4. 不要使用"亲"、"宝子"等过于俗套的称呼
5. 观点要有个人特色，不能太泛泛

请以JSON格式返回，格式如下：
{{
  "comments": [
    {{"style": "风格名称", "content": "评论内容", "expected_effect": "预期效果说明"}}
  ]
}}

只返回JSON，不要其他解释。"""

    try:
        response = await call_llm(prompt, provider, model, temperature=0.8)
        
        # Parse JSON from response
        json_match = re.search(r'\{.*\}', response, re.DOTALL)
        if json_match:
            result = json.loads(json_match.group(0))
            return {
                "success": True,
                "comments": result.get("comments", []),
                "source_content": content_title or content[:50] + "..."
            }
        
        return {"success": False, "error": "Failed to parse AI response", "raw": response}
        
    except Exception as e:
        return {"success": False, "error": str(e)}


# ==================== 爆款文案改写 ====================

async def rewrite_viral_content(
    original_content: str,
    original_title: Optional[str] = None,
    target_style: str = "xiaohongshu",
    target_topic: Optional[str] = None,
    brand_keywords: Optional[List[str]] = None,
    keep_structure: bool = True,
    provider: LLMProvider = LLMProvider.OPENROUTER,
    model: Optional[str] = None
) -> Dict[str, Any]:
    """
    爆款文案改写
    将热门内容改写成适合自己使用的版本
    """
    
    style_info = REWRITE_STYLES.get(target_style, REWRITE_STYLES["xiaohongshu"])
    
    topic_context = ""
    if target_topic:
        topic_context = f"\n目标主题/行业：{target_topic}"
    
    brand_context = ""
    if brand_keywords:
        brand_context = f"\n需要自然融入的关键词：{', '.join(brand_keywords)}"
    
    structure_instruction = ""
    if keep_structure:
        structure_instruction = "\n保留原文的叙事结构和爆点逻辑，但用全新的表达方式重写。"
    
    prompt = f"""你是一位顶级的内容创作者，擅长将爆款内容进行二次创作。

【原始爆款内容】
标题：{original_title or '无'}
正文：{original_content}

【改写要求】
目标风格：{style_info['name']} - {style_info['prompt_hint']}
{topic_context}
{brand_context}
{structure_instruction}

请进行改写，要求：
1. 保留原文的核心卖点和情绪价值
2. 完全重写文字表达，避免抄袭嫌疑
3. 适配目标平台的内容调性
4. 生成一个吸睛的新标题
5. 如果是小红书风格，适当使用emoji

请以JSON格式返回：
{{
  "new_title": "新标题",
  "new_content": "新正文",
  "highlights": ["亮点1", "亮点2"],
  "suggested_tags": ["标签1", "标签2"],
  "similarity_warning": "是否与原文相似度过高的提醒"
}}

只返回JSON，不要其他解释。"""

    try:
        response = await call_llm(prompt, provider, model, temperature=0.85, max_tokens=3000)
        
        json_match = re.search(r'\{.*\}', response, re.DOTALL)
        if json_match:
            result = json.loads(json_match.group(0))
            return {
                "success": True,
                "original_title": original_title,
                "rewritten": result
            }
        
        return {"success": False, "error": "Failed to parse AI response", "raw": response}
        
    except Exception as e:
        return {"success": False, "error": str(e)}


# ==================== 内容分析增强 ====================

async def analyze_content_deep(
    content: str,
    title: Optional[str] = None,
    platform: Optional[str] = None,
    provider: LLMProvider = LLMProvider.OPENROUTER,
    model: Optional[str] = None
) -> Dict[str, Any]:
    """
    深度内容分析
    比 Phase 1 的简单分析更加详细
    """
    
    prompt = f"""你是一位资深的社交媒体分析师。请对以下内容进行深度分析：

【平台】{platform or '未知'}
【标题】{title or '无标题'}
【正文】{content[:2000]}

请从以下维度进行分析：

1. **情感判断**: positive/neutral/negative，以及情感强度(1-10)
2. **内容质量**: 原创性、信息量、表达能力评分(1-10)
3. **传播潜力**: 预估的传播能力(low/medium/high/viral)，说明理由
4. **目标受众**: 这条内容最可能吸引什么样的人群
5. **核心卖点**: 提炼内容的核心价值主张
6. **情绪钩子**: 内容使用了哪些情绪触发点
7. **改进建议**: 如何让这条内容更加出圈
8. **风险提示**: 是否包含敏感/违规/负面信息

请以JSON格式返回：
{{
  "sentiment": {{"label": "positive/neutral/negative", "score": 0.8, "intensity": 7}},
  "quality": {{"originality": 8, "informativeness": 7, "expression": 9}},
  "virality": {{"level": "high", "reasons": ["原因1", "原因2"]}},
  "target_audience": ["人群1", "人群2"],
  "core_value": "核心卖点描述",
  "emotion_hooks": ["钩子1", "钩子2"],
  "improvements": ["建议1", "建议2"],
  "risks": {{"has_risk": false, "details": []}}
}}

只返回JSON。"""

    try:
        response = await call_llm(prompt, provider, model, temperature=0.3)
        
        json_match = re.search(r'\{.*\}', response, re.DOTALL)
        if json_match:
            result = json.loads(json_match.group(0))
            return {"success": True, "analysis": result}
        
        return {"success": False, "error": "Failed to parse AI response", "raw": response}
        
    except Exception as e:
        return {"success": False, "error": str(e)}


# ==================== 关键词生成 (保留原有功能) ====================

async def get_keyword_suggestions(
    keyword: str, 
    mode: str, 
    model: str = "google/gemini-2.0-flash-exp:free"
) -> List[str]:
    """
    关键词生成（兼容原有接口）
    """
    if mode == 'risk':
        prompt = f"""
        你是一位危机公关专家。
        请针对品牌或话题 "{keyword}" 生成 15 个**中文**负面或预警关键词。
        关注点包括：差评、避雷、吐槽、假货、副作用、质量差、智商税、坑人、虚假宣传、退款。
        请直接返回一个 JSON 字符串数组，不要包含 ```json 或其他 Markdown 格式。
        示例: ["避雷", "假货", "智商税"]
        """
    else:
        prompt = f"""
        你是一位社交媒体内容营销专家。
        请针对品牌或话题 "{keyword}" 生成 15 个**中文**热门关联词、长尾词或流量词。
        关注点包括：热门话题、种草、测评、爆款、推荐、好用、教程。
        请直接返回一个 JSON 字符串数组，不要包含 ```json 或其他 Markdown 格式。
        示例: ["测评", "推荐", "好物"]
        """
    
    try:
        response = await call_llm(prompt, LLMProvider.OPENROUTER, model, temperature=0.7)
        
        match = re.search(r'\[.*?\]', response, re.DOTALL)
        if match:
            keywords = json.loads(match.group(0))
            if isinstance(keywords, list):
                return [str(k) for k in keywords if isinstance(k, (str, int))]
        
        return []
        
    except Exception as e:
        print(f"Keyword generation error: {e}")
        return []


# ==================== 工具函数 ====================

def get_available_styles() -> Dict[str, Any]:
    """获取所有可用的风格模板"""
    return {
        "comment_styles": COMMENT_STYLES,
        "rewrite_styles": REWRITE_STYLES
    }

def get_available_providers() -> List[Dict[str, str]]:
    """获取可用的 LLM 供应商"""
    providers = [
        {"id": "openrouter", "name": "OpenRouter (云端)", "status": "active" if OPENROUTER_API_KEY else "inactive"},
        {"id": "deepseek", "name": "DeepSeek", "status": "active" if DEEPSEEK_API_KEY else "inactive"},
        {"id": "ollama", "name": "Ollama (本地)", "status": "unknown"},
    ]
    return providers
