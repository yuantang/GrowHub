# -*- coding: utf-8 -*-
# Copyright (c) 2025 relakkes@gmail.com
#
# This file is part of MediaCrawler project.
# Repository: https://github.com/NanmiCoder/MediaCrawler/blob/main/api/main.py
# GitHub: https://github.com/NanmiCoder
# Licensed under NON-COMMERCIAL LEARNING LICENSE 1.1
#
# 声明：本代码仅供学习和研究目的使用。使用者应遵守以下原则：
# 1. 不得用于任何商业用途。
# 2. 使用时应遵守目标平台的使用条款和robots.txt规则。
# 3. 不得进行大规模爬取或对平台造成运营干扰。
# 4. 应合理控制请求频率，避免给目标平台带来不必要的负担。
# 5. 不得用于任何非法或不当的用途。
#
# 详细许可条款请参阅项目根目录下的LICENSE文件。
# 使用本代码即表示您同意遵守上述原则和LICENSE中的所有条款。

"""
MediaCrawler WebUI API Server
Start command: uvicorn api.main:app --port 8080 --reload
Or: python -m api.main
"""
import asyncio
import os
import subprocess
import uvicorn
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
import traceback
from tools import utils

from .routers import crawler_router, data_router, websocket_router, checkpoint_router, accounts_router, ai_router
from .routers.data import proxy_router
from .routers.growhub_keywords import router as growhub_keywords_router
from .routers.growhub_content import router as growhub_content_router, rules_router as growhub_rules_router
from .routers.growhub_notifications import router as growhub_notifications_router
from .routers.growhub_websocket import router as growhub_websocket_router
from .routers.growhub_ai_creator import router as growhub_ai_creator_router
from .routers.growhub_scheduler import router as growhub_scheduler_router

from .routers.growhub_account_pool import router as growhub_account_pool_router
from .routers.growhub_system import router as growhub_system_router
from .routers.growhub_projects import router as growhub_projects_router

app = FastAPI(
    title="GrowHub API",
    description="智能增长自动化平台 API",
    version="2.0.0"
)

# Get webui static files directory
WEBUI_DIR = os.path.join(os.path.dirname(__file__), "webui")

# CORS configuration - allow frontend dev server access
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",  # Vite dev server
        "http://localhost:3000",  # Production / Docker
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
        "*",  # Allow all for Docker deployment
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(crawler_router, prefix="/api")
app.include_router(data_router, prefix="/api")
app.include_router(proxy_router, prefix="/api")  # Image proxy
app.include_router(websocket_router, prefix="/api")
app.include_router(checkpoint_router, prefix="/api")
app.include_router(accounts_router, prefix="/api")
app.include_router(ai_router, prefix="/api")

# Exception logging middleware
@app.middleware("http")
async def log_exceptions_middleware(request: Request, call_next):
    try:
        return await call_next(request)
    except Exception as e:
        import traceback
        from tools import utils
        utils.logger.error(f"Unhandled exception during {request.method} {request.url.path}")
        utils.logger.error(traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={
                "detail": str(e),
                "traceback": traceback.format_exc().split("\n")
            }
        )

# GrowHub routers
app.include_router(growhub_keywords_router, prefix="/api")
app.include_router(growhub_content_router, prefix="/api")
app.include_router(growhub_rules_router, prefix="/api")
app.include_router(growhub_notifications_router, prefix="/api")
app.include_router(growhub_websocket_router, prefix="/api")
app.include_router(growhub_ai_creator_router, prefix="/api")
app.include_router(growhub_scheduler_router, prefix="/api")
app.include_router(growhub_account_pool_router, prefix="/api")
app.include_router(growhub_system_router, prefix="/api")
app.include_router(growhub_projects_router, prefix="/api")

# Phase 2: 监控项目模块
# (Moved to top imports)



@app.on_event("startup")
async def startup_event():
    """Application startup event"""
    # Database Migration
    from sqlalchemy import text
    from database.db_session import get_session
    
    async with get_session() as session:
        try:
            await session.execute(text("SELECT crawl_date_range FROM growhub_projects LIMIT 1"))
        except Exception:
            print("Migrating: Adding crawl_date_range to growhub_projects")
            try:
                await session.execute(text("ALTER TABLE growhub_projects ADD COLUMN crawl_date_range INTEGER DEFAULT 7"))
                await session.commit()
            except Exception as e:
                print(f"Migration Failed (crawl_date_range): {e}")

        try:
            await session.execute(text("SELECT max_concurrency FROM growhub_projects LIMIT 1"))
        except Exception:
            print("Migrating: Adding max_concurrency to growhub_projects")
            try:
                await session.execute(text("ALTER TABLE growhub_projects ADD COLUMN max_concurrency INTEGER DEFAULT 3"))
                await session.commit()
            except Exception as e:
                print(f"Migration failed (max_concurrency): {e}")

        # Migration: consecutive_fails for growhub_accounts
        try:
            await session.execute(text("SELECT consecutive_fails FROM growhub_accounts LIMIT 1"))
        except Exception:
            print("Migrating: Adding consecutive_fails to growhub_accounts")
            try:
                await session.execute(text("ALTER TABLE growhub_accounts ADD COLUMN consecutive_fails INTEGER DEFAULT 0"))
                await session.execute(text("ALTER TABLE growhub_accounts ADD COLUMN last_project_id INTEGER"))
                await session.commit()
            except Exception as e:
                print(f"Migration failed: {e}")
        
        try:
            await session.execute(text("SELECT last_proxy_id FROM growhub_accounts LIMIT 1"))
        except Exception:
            print("Migrating: Adding proxy columns to growhub_accounts")
            try:
                await session.execute(text("ALTER TABLE growhub_accounts ADD COLUMN last_proxy_id VARCHAR(50)"))
                await session.execute(text("ALTER TABLE growhub_accounts ADD COLUMN proxy_config JSON"))
                await session.commit()
            except Exception as e:
                print(f"Migration failed: {e}")

        # growhub_checkpoints migrations
        try:
            await session.execute(text("SELECT project_id FROM growhub_checkpoints LIMIT 1"))
        except Exception:
            print("Migrating: Adding project_id to growhub_checkpoints")
            try:
                await session.execute(text("ALTER TABLE growhub_checkpoints ADD COLUMN project_id INTEGER"))
                await session.commit()
            except Exception as e:
                print(f"Migration failed (checkpoints.project_id): {e}")
                
    # Initialize Services
    from api.services.account_pool import get_account_pool
    await get_account_pool().initialize()

    # Startup sync: Register active projects with scheduler
    from api.services.project import get_project_service
    try:
        project_service = get_project_service()
        await project_service.sync_active_projects_to_scheduler()
        print("[Startup] Active projects synced to scheduler")
    except Exception as e:
        print(f"[Startup] Failed to sync projects to scheduler: {e}")


@app.get("/")
async def serve_frontend():
    """Return frontend page"""
    index_path = os.path.join(WEBUI_DIR, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return {
        "message": "MediaCrawler WebUI API",
        "version": "1.0.0",
        "docs": "/docs",
        "note": "WebUI not found, please build it first: cd webui && npm run build"
    }


@app.get("/api/health")
async def health_check():
    return {"status": "ok"}


@app.get("/api/env/check")
async def check_environment():
    """Check if MediaCrawler environment is configured correctly"""
    try:
        # Run uv run main.py --help command to check environment
        process = await asyncio.create_subprocess_exec(
            "uv", "run", "main.py", "--help",
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            cwd="."  # Project root directory
        )
        stdout, stderr = await asyncio.wait_for(
            process.communicate(),
            timeout=30.0  # 30 seconds timeout
        )

        if process.returncode == 0:
            return {
                "success": True,
                "message": "MediaCrawler environment configured correctly",
                "output": stdout.decode("utf-8", errors="ignore")[:500]  # Truncate to first 500 characters
            }
        else:
            error_msg = stderr.decode("utf-8", errors="ignore") or stdout.decode("utf-8", errors="ignore")
            return {
                "success": False,
                "message": "Environment check failed",
                "error": error_msg[:500]
            }
    except asyncio.TimeoutError:
        return {
            "success": False,
            "message": "Environment check timeout",
            "error": "Command execution exceeded 30 seconds"
        }
    except FileNotFoundError:
        return {
            "success": False,
            "message": "uv command not found",
            "error": "Please ensure uv is installed and configured in system PATH"
        }
    except Exception as e:
        return {
            "success": False,
            "message": "Environment check error",
            "error": str(e)
        }


@app.get("/api/config/platforms")
async def get_platforms():
    """Get list of supported platforms"""
    return {
        "platforms": [
            {"value": "xhs", "label": "小红书", "icon": "book-open"},
            {"value": "dy", "label": "抖音", "icon": "music"},
            {"value": "ks", "label": "快手", "icon": "video"},
            {"value": "bili", "label": "B站", "icon": "tv"},
            {"value": "wb", "label": "微博", "icon": "message-circle"},
            {"value": "tieba", "label": "贴吧", "icon": "messages-square"},
            {"value": "zhihu", "label": "知乎", "icon": "help-circle"},
        ]
    }


@app.get("/api/config/options")
async def get_config_options():
    """Get all configuration options"""
    return {
        "login_types": [
            {"value": "qrcode", "label": "QR Code Login"},
            {"value": "cookie", "label": "Cookie Login"},
        ],
        "crawler_types": [
            {"value": "search", "label": "关键词搜索"},
            {"value": "detail", "label": "指定帖子"},
            {"value": "creator", "label": "创作者主页"},
            {"value": "homefeed", "label": "首页推荐"},
        ],
        "save_options": [
            {"value": "json", "label": "JSON File"},
            {"value": "csv", "label": "CSV File"},
            {"value": "excel", "label": "Excel File"},
            {"value": "sqlite", "label": "SQLite Database"},
            {"value": "db", "label": "MySQL Database"},
            {"value": "mongodb", "label": "MongoDB Database"},
        ],
    }


# Mount static resources - must be placed after all routes
if os.path.exists(WEBUI_DIR):
    assets_dir = os.path.join(WEBUI_DIR, "assets")
    if os.path.exists(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")
    # Mount logos directory
    logos_dir = os.path.join(WEBUI_DIR, "logos")
    if os.path.exists(logos_dir):
        app.mount("/logos", StaticFiles(directory=logos_dir), name="logos")
    # Mount other static files (e.g., vite.svg)
    app.mount("/static", StaticFiles(directory=WEBUI_DIR), name="webui-static")


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8040)
