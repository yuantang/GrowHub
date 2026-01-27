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


# ==================== 配置与动态加载 ====================

async def get_llm_config() -> Dict[str, Any]:
    """从数据库获取最新的 LLM 配置"""
    from database.db_session import get_session
    from database.growhub_models import GrowHubSystemConfig
    from sqlalchemy import select
    import json
    
    default_config = {
        "provider": "openrouter",
        "openrouter_key": os.getenv("OPENROUTER_API_KEY", ""),
        "deepseek_key": os.getenv("DEEPSEEK_API_KEY", ""),
        "ollama_url": os.getenv("OLLAMA_BASE_URL", "http://localhost:11434"),
        "model": "google/gemini-2.0-flash-exp:free"
    }
    
    try:
        async with get_session() as session:
            result = await session.execute(
                select(GrowHubSystemConfig).where(GrowHubSystemConfig.config_key == "llm_config")
            )
            config_obj = result.scalar_one_or_none()
            if config_obj and config_obj.config_value:
                # 合并配置
                stored_config = config_obj.config_value
                if isinstance(stored_config, str):
                    stored_config = json.loads(stored_config)
                return {**default_config, **stored_config}
    except Exception as e:
        print(f"Error loading LLM config from DB: {e}")
    
    return default_config

class LLMProvider(str, Enum):
    OPENROUTER = "openrouter"
    DEEPSEEK = "deepseek"
    OLLAMA = "ollama"

# API Base URLs
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
DEEPSEEK_BASE_URL = "https://api.deepseek.com/v1"


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
    provider: Optional[LLMProvider] = None,
    model: Optional[str] = None,
    temperature: float = 0.7,
    max_tokens: int = 2000
) -> str:
    """
    统一的 LLM 调用接口，动态读取配置
    """
    config = await get_llm_config()
    
    # 确定供应商和模型
    final_provider = provider or config.get("provider", "openrouter")
    final_model = model or config.get("model")
    
    # 如果没传模型名，给个兜底
    if not final_model:
        if final_provider == "openrouter":
            final_model = "google/gemini-2.0-flash-exp:free"
        elif final_provider == "deepseek":
            final_model = "deepseek-chat"
        elif final_provider == "ollama":
            final_model = "qwen2.5:7b"

    if final_provider == "openrouter":
        return await _call_openrouter(prompt, final_model, config.get("openrouter_key"), temperature, max_tokens)
    elif final_provider == "deepseek":
        return await _call_deepseek(prompt, final_model, config.get("deepseek_key"), temperature, max_tokens)
    elif final_provider == "ollama":
        return await _call_ollama(prompt, final_model, config.get("ollama_url"), temperature, max_tokens)
    else:
        raise ValueError(f"Unsupported provider: {final_provider}")


async def _call_openrouter(prompt: str, model: str, api_key: str, temperature: float, max_tokens: int) -> str:
    """Call OpenRouter API"""
    if not api_key:
        raise ValueError("OpenRouter API Key 未配置，请在设置中通过环境变量设置")
    
    headers = {
        "Authorization": f"Bearer {api_key}",
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


async def _call_deepseek(prompt: str, model: str, api_key: str, temperature: float, max_tokens: int) -> str:
    """Call DeepSeek API"""
    if not api_key:
        raise ValueError("DeepSeek API Key 未配置")
    
    headers = {
        "Authorization": f"Bearer {api_key}",
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


async def _call_ollama(prompt: str, model: str, base_url: str, temperature: float, max_tokens: int) -> str:
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
                f"{base_url}/api/generate",
                json=data,
                timeout=120.0
            )
            
            if response.status_code != 200:
                raise Exception(f"Ollama API error: {response.status_code}")
            
            result = response.json()
            return result.get('response', '').strip()
        except httpx.ConnectError:
            raise Exception(f"无法连接到 Ollama 服务: {base_url}")


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
        你是一位资深公共关系与舆情风控专家。请针对关键词 "{keyword}" 预测可能出现的**负面舆情**和**风险预警词**。
        我们的目的是为了及时发现用户的不满或潜在危机，请从以下 4 个核心维度进行反向挖掘（每个维度 4-5 个词）：

        1. **产品缺陷/质量问题**：(如：烂脸、假货、质量差、有毒、异响、甚至爆炸)。
        2. **服务槽点/体验差**：(如：客服态度差、不退款、发货慢、霸王条款、智商税)。
        3. **负面情绪/宣泄词**：(如：避雷、恶心、无语、垃圾、后悔、被坑)。
        4. **合规与安全风险**：(如：侵权、违规、封号、副作用、致癌、不安全)。

        ### 输出强制要求：
        - 必须输出为一个**纯 JSON 字符串数组**。
        - 词汇必须简短有力（2-4字为主），直击痛点。
        - **请将上述 4 个维度的所有词汇合并到一个数组中**。
        - 结果必须是扁平的字符串列表。
        - 示例格式：["避雷", "假货", "退款", "智商税", "副作用", ...]
        """
    else:
        prompt = f"""
        你是一位关键词联想专家。请针对中文关键词 "{keyword}" 生成一份高质量的联想词库。
        请严格遵循以下 5 个维度进行深度挖掘，每个维度寻找 6-8 个最具代表性的词汇：

        1. **动作/行为类**：与 "{keyword}" 相关的具体动作或行为（如：深蹲、冥想、打坐）。
        2. **场景/环境类**："{keyword}" 可能出现的高频场景（如：健身房、卧室、凌晨）。
        3. **感受/心理状态类**："{keyword}" 带来的核心感受或情绪（如：多巴胺、焦虑、平静、内耗）。
        4. **工具/辅助类**：执行 "{keyword}" 过程中的必备道具（如：瑜伽垫、香薰、白噪音）。
        5. **延伸概念/哲学类**：相关的深层理念或文化符号（如：自律、潜意识、极简主义）。

        ### 输出强制要求：
        - 必须输出为一个**纯 JSON 字符串数组**。
        - **请将上述 5 个维度的所有词汇合并到一个数组中**，不要包含分类标题，也不要包含任何解释文字。
        - 结果必须是扁平的字符串列表。
        - 示例格式：["词汇1", "词汇2", "词汇3", "词汇4", ...]
        """
    
    try:
        # 使用 call_llm 自动读取配置，不再硬编码 provider
        # 增加 temperature 以提高发散度
        content = await call_llm(prompt, temperature=0.8)
        
        # 预处理：尝试清理 Markdown 代码块标记
        cleaned_content = content.replace("```json", "").replace("```", "").strip()
        
        try:
            # 尝试直接解析
            return json.loads(cleaned_content)
        except json.JSONDecodeError:
            # 如果解析失败，尝试用正则提取数组部分
            import re
            match = re.search(r'\[.*\]', cleaned_content, re.DOTALL)
            if match:
                try:
                    return json.loads(match.group())
                except:
                    pass
            
            # 如果还是失败（例如 AI 输出的是带编号的列表），尝试行级清理
            lines = content.split('\n')
            words = []
            import re
            for line in lines:
                # 提取 "- 词汇" 或 "1. 词汇" 格式
                # 移除行首的数字、点、破折号和空格
                clean_line = re.sub(r'^[\d\-\.\s\*]+', '', line).strip()
                # 简单的过滤：去除非中文行、过长的句子
                if clean_line and len(clean_line) < 15 and not clean_line.startswith(('维度', '类别', '###')):
                    words.append(clean_line)
            
            return words if words else []
            
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
