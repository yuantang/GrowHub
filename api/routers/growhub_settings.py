# -*- coding: utf-8 -*-
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Dict, Any, Optional
from database.db_session import get_session
from database.growhub_models import GrowHubSystemConfig, GrowHubUser
from sqlalchemy import select, update
from datetime import datetime
from api.auth import deps

router = APIRouter(prefix="/growhub/settings", tags=["GrowHub - Settings"])

class SettingUpdate(BaseModel):
    config_key: str
    config_value: Dict[str, Any]

@router.get("/{config_key}")
async def get_setting(
    config_key: str,
    current_user: GrowHubUser = Depends(deps.get_current_active_admin)
):
    """获取指定配置 (Admin Only)"""
    async with get_session() as session:
        result = await session.execute(
            select(GrowHubSystemConfig).where(GrowHubSystemConfig.config_key == config_key)
        )
        config = result.scalar_one_or_none()
        if not config:
            # 返回默认值或空
            return {"config_key": config_key, "config_value": {}}
        return {"config_key": config.config_key, "config_value": config.config_value}

@router.post("")
@router.post("/")
async def update_setting(
    data: SettingUpdate,
    current_user: GrowHubUser = Depends(deps.get_current_active_admin)
):
    """更新配置 (Admin Only)"""
    try:
        async with get_session() as session:
            result = await session.execute(
                select(GrowHubSystemConfig).where(GrowHubSystemConfig.config_key == data.config_key)
            )
            config = result.scalar_one_or_none()
            
            if config:
                config.config_value = data.config_value
                config.updated_at = datetime.now()
            else:
                config = GrowHubSystemConfig(
                    config_key=data.config_key,
                    config_value=data.config_value
                )
                session.add(config)
                
            await session.commit()
            return {"status": "ok", "message": f"Setting {data.config_key} updated"}
    except Exception as e:
        import traceback
        traceback.print_exc()
        # Return structured error so frontend can show it
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": f"Database error: {str(e)}"}
        )

@router.post("/proxy/test")
@router.post("/proxy/test/")
async def test_proxy(
    config_data: Dict[str, Any],
    current_user: GrowHubUser = Depends(deps.get_current_active_admin)
):
    """测试代理连接 (Admin Only)"""
    import httpx
    provider = config_data.get("provider")
    try:
        if provider == "kuaidaili":
            try:
                from proxy.providers.kuaidl_proxy import KuaiDaiLiProxy
                proxy_provider = KuaiDaiLiProxy(
                    kdl_user_name=config_data.get("kdl_user_name", ""),
                    kdl_user_pwd=config_data.get("kdl_user_pwd", ""),
                    kdl_secret_id=config_data.get("kdl_secret_id", ""),
                    kdl_signature=config_data.get("kdl_signature", "")
                )
            except Exception as init_err:
                return {"success": False, "message": f"初始化代理商失败 (请检查 Redis 或网络): {str(init_err)}"}
            
            # 1. 尝试从快代理 API 获取一个 IP (确保 API Key/Signature 正确)
            ips = await proxy_provider.get_proxy(1)
            if not ips:
                return {"success": False, "message": "快代理 API 未返回任何 IP (请检查 SecretID/Signature 或额度)"}
            
            # 2. 验证该 IP 的有效性 (模拟 ProxyIpPool 的验证逻辑)
            proxy = ips[0]
            if proxy.user and proxy.password:
                proxy_url = f"http://{proxy.user}:{proxy.password}@{proxy.ip}:{proxy.port}"
            else:
                proxy_url = f"http://{proxy.ip}:{proxy.port}"

            try:
                # 使用该代理访问外部验证地址
                async with httpx.AsyncClient(proxy=proxy_url, timeout=10.0) as client:
                    resp = await client.get("https://echo.apifox.cn/", follow_redirects=True)
                    if resp.status_code == 200:
                        return {"success": True, "message": f"连接成功！代理 IP: {proxy.ip}"}
                    else:
                        return {"success": False, "message": f"代理验证失败: HTTP {resp.status_code}"}
            except Exception as ve:
                return {"success": False, "message": f"代理连通性测试失败: {str(ve)}"}

        elif provider == "wandouhttp":
            from proxy.providers.wandou_http_proxy import WandouHttpProxy
            proxy_provider = WandouHttpProxy(
                app_key=config_data.get("wandou_app_key", "")
            )
            ips = await proxy_provider.get_proxy(1)
            if not ips:
                 return {"success": False, "message": "豌豆代理 API 获取 IP 失败"}
            
            proxy = ips[0]
            proxy_url = f"http://{proxy.ip}:{proxy.port}"
            try:
                async with httpx.AsyncClient(proxy=proxy_url, timeout=10.0) as client:
                    resp = await client.get("https://echo.apifox.cn/", follow_redirects=True)
                    if resp.status_code == 200:
                        return {"success": True, "message": f"连接成功！代理 IP: {proxy.ip}"}
                    else:
                        return {"success": False, "message": f"代理验证失败: HTTP {resp.status_code}"}
            except Exception as ve:
                 return {"success": False, "message": f"代理连通性测试失败: {str(ve)}"}
        else:
            return {"success": False, "message": f"不支持的供应商: {provider}"}
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"success": False, "message": f"后端运行错误: {str(e)}"}
            
@router.post("/llm/test")
@router.post("/llm/test/")
async def test_llm_connection(
    config_data: Dict[str, Any],
    current_user: GrowHubUser = Depends(deps.get_current_active_admin)
):
    """测试 AI 模型连接"""
    from api.services.llm import call_llm, LLMProvider
    
    provider_str = config_data.get("provider", "openrouter")
    try:
        provider = LLMProvider(provider_str)
    except ValueError:
        return {"success": False, "message": f"无效的供应商: {provider_str}"}

    # 为了强制使用当前传入的配置而不是数据库中的旧配置，
    # 我们需要在调用测试时临时覆盖环境或注入参数。
    # 这里我们采用一个简单的办法：直接用传入的参数调用测试
    
    test_prompt = "你好，这是一条连接测试消息。请回复'OK'。"
    try:
        # 我们暂时通过修改 call_llm 来支持传入临时 key 比较复杂，
        # 所以这里的测试逻辑直接在内部实现
        import httpx
        model = config_data.get("model", "google/gemini-2.0-flash-exp:free")
        
        if provider == LLMProvider.OPENROUTER:
            api_key = config_data.get("openrouter_key", "")
            if not api_key: return {"success": False, "message": "API Key 不能为空"}
            headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
            data = {"model": model, "messages": [{"role": "user", "content": test_prompt}], "max_tokens": 10}
            async with httpx.AsyncClient() as client:
                resp = await client.post("https://openrouter.ai/api/v1/chat/completions", json=data, headers=headers, timeout=15.0)
                if resp.status_code == 200:
                    return {"success": True, "message": "连接成功！AI 响应正常。"}
                return {"success": False, "message": f"API 返回错误: {resp.status_code} - {resp.text}"}
                
        elif provider == LLMProvider.DEEPSEEK:
            api_key = config_data.get("deepseek_key", "")
            if not api_key: return {"success": False, "message": "API Key 不能为空"}
            headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
            data = {"model": model, "messages": [{"role": "user", "content": test_prompt}], "max_tokens": 10}
            async with httpx.AsyncClient() as client:
                resp = await client.post("https://api.deepseek.com/v1/chat/completions", json=data, headers=headers, timeout=15.0)
                if resp.status_code == 200:
                    return {"success": True, "message": "连接成功！DeepSeek 响应正常。"}
                return {"success": False, "message": f"API 返回错误: {resp.status_code} - {resp.text}"}
        
        elif provider == LLMProvider.OLLAMA:
            base_url = config_data.get("ollama_url", "http://localhost:11434")
            data = {"model": model, "prompt": test_prompt, "stream": False, "options": {"num_predict": 10}}
            async with httpx.AsyncClient() as client:
                resp = await client.post(f"{base_url}/api/generate", json=data, timeout=10.0)
                if resp.status_code == 200:
                    return {"success": True, "message": f"连接成功！本地 Ollama ({model}) 响应正常。"}
                return {"success": False, "message": f"Ollama 返回错误: {resp.status_code}"}
        
        return {"success": False, "message": "尚未支持该供应商的即时测试"}
    except Exception as e:
        return {"success": False, "message": f"测试过程中发生异常: {str(e)}"}
