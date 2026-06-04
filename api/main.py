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

from .routers.proxy import proxy_router
from .routers.growhub_content import router as growhub_content_router
from .routers.growhub_ai_creator import router as growhub_ai_creator_router
from .routers.growhub_scheduler import router as growhub_scheduler_router
from .routers.growhub_account_pool import router as growhub_account_pool_router
from .routers.growhub_system import router as growhub_system_router
from .routers.growhub_projects import router as growhub_projects_router
from .routers.growhub_hotspots import router as growhub_hotspots_router
from .routers.growhub_creators import router as growhub_creators_router
from .routers.growhub_scripts import router as growhub_scripts_router
from .routers.growhub_settings import router as growhub_settings_router
from .routers.growhub_notifications import router as growhub_notifications_router
from .routers.growhub_remix import router as growhub_remix_router
from .routers.growhub_data_monitor import router as growhub_data_monitor_router
from .routers.growhub_audio import router as growhub_audio_router
from .routers.growhub_publish import router as growhub_publish_router
from .routers.growhub_imagegen import router as growhub_imagegen_router
from .routers.auth import router as auth_router
from .routers.growhub_users import router as growhub_users_router
from .routers.growhub_video import router as growhub_video_router
from .routers import webhook
from .routers import webhook_import

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
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:5175",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        "http://127.0.0.1:5175",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers (core path only)
app.include_router(proxy_router, prefix="/api")
app.include_router(webhook.router, prefix="/api")
app.include_router(webhook_import.router, prefix="/api")

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

# GrowHub core: 热点抓取 → 内容/热点池 → AI 二创（发布待对接 AutoPublishAgent）
app.include_router(growhub_projects_router, prefix="/api")
app.include_router(growhub_hotspots_router, prefix="/api")
app.include_router(growhub_creators_router, prefix="/api")
app.include_router(growhub_content_router, prefix="/api")
app.include_router(growhub_account_pool_router, prefix="/api")
app.include_router(growhub_ai_creator_router, prefix="/api")
app.include_router(growhub_scripts_router, prefix="/api")
app.include_router(growhub_remix_router, prefix="/api")
app.include_router(growhub_video_router, prefix="/api")
app.include_router(growhub_scheduler_router, prefix="/api")
app.include_router(growhub_system_router, prefix="/api")
app.include_router(growhub_settings_router, prefix="/api")
app.include_router(growhub_notifications_router, prefix="/api")
app.include_router(growhub_data_monitor_router, prefix="/api")
app.include_router(growhub_audio_router, prefix="/api")
app.include_router(growhub_publish_router, prefix="/api")
app.include_router(growhub_imagegen_router, prefix="/api")
app.include_router(auth_router, prefix="/api/auth", tags=["Authentication"])
app.include_router(growhub_users_router, prefix="/api/admin", tags=["Admin"])


# 兼容旧前端路径：关键词联想
from pydantic import BaseModel
from typing import Optional as _Optional


class _SuggestRequest(BaseModel):
    keyword: str
    mode: str
    model: _Optional[str] = "google/gemini-2.0-flash-exp:free"


@app.post("/api/ai/suggest")
async def suggest_keywords_legacy(req: _SuggestRequest):
    from api.services.llm import get_keyword_suggestions

    keywords = await get_keyword_suggestions(req.keyword, req.mode, req.model)
    return {"keywords": keywords}

# Phase 2: 监控项目模块
# (Moved to top imports)



@app.on_event("startup")
async def startup_event():
    """Application startup event"""
    # Database Migration
    from sqlalchemy import text
    from database.db_session import get_session, create_tables
    
    # Initialize Database Tables
    await create_tables()

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
            await session.execute(text("SELECT last_run_status FROM growhub_projects LIMIT 1"))
        except Exception:
            print("Migrating: Adding last_run_status to growhub_projects")
            try:
                await session.execute(text("ALTER TABLE growhub_projects ADD COLUMN last_run_status VARCHAR(255)"))
                await session.commit()
            except Exception as e:
                print(f"Migration Failed (last_run_status): {e}")

        # Migration: Add user_id to tables
        tables_to_migrate = ['growhub_keywords', 'growhub_projects', 'growhub_accounts']
        for table in tables_to_migrate:
            try:
                # Check if column exists
                await session.execute(text(f"SELECT user_id FROM {table} LIMIT 1"))
            except Exception:
                print(f"Migrating: Adding user_id to {table}")
                try:
                    await session.execute(text(f"ALTER TABLE {table} ADD COLUMN user_id INTEGER"))
                    await session.commit()
                except Exception as e:
                    print(f"Migration Failed (user_id for {table}): {e}")

        try:
            await session.execute(text("SELECT max_concurrency FROM growhub_projects LIMIT 1"))
        except Exception:
            print("Migrating: Adding max_concurrency to growhub_projects")
            try:
                await session.execute(text("ALTER TABLE growhub_projects ADD COLUMN max_concurrency INTEGER DEFAULT 3"))
                await session.commit()
            except Exception as e:
                print(f"Migration failed (max_concurrency): {e}")

        try:
            await session.execute(text("SELECT capture_mode FROM growhub_projects LIMIT 1"))
        except Exception:
            print("Migrating: Adding capture_mode to growhub_projects")
            try:
                await session.execute(
                    text(
                        "ALTER TABLE growhub_projects ADD COLUMN capture_mode VARCHAR(32) DEFAULT 'hot_content'"
                    )
                )
                await session.commit()
            except Exception as e:
                print(f"Migration failed (capture_mode): {e}")

        try:
            await session.execute(text("SELECT watch_targets FROM growhub_projects LIMIT 1"))
        except Exception:
            print("Migrating: Adding watch_targets to growhub_projects")
            try:
                await session.execute(text("ALTER TABLE growhub_projects ADD COLUMN watch_targets JSON"))
                await session.commit()
            except Exception as e:
                print(f"Migration failed (watch_targets): {e}")

        try:
            await session.execute(text("SELECT creator_account_type FROM growhub_projects LIMIT 1"))
        except Exception:
            print("Migrating: Adding creator_account_type to growhub_projects")
            try:
                await session.execute(
                    text("ALTER TABLE growhub_projects ADD COLUMN creator_account_type VARCHAR(32) DEFAULT 'all'")
                )
                await session.commit()
            except Exception as e:
                print(f"Migration failed (creator_account_type): {e}")

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

        # Migration: Add user_id to growhub_contents
        try:
            await session.execute(text("SELECT user_id FROM growhub_contents LIMIT 1"))
        except Exception:
            print("Migrating: Adding user_id to growhub_contents")
            try:
                await session.execute(text("ALTER TABLE growhub_contents ADD COLUMN user_id INTEGER"))
                await session.execute(text("CREATE INDEX ix_growhub_contents_user_id ON growhub_contents (user_id)"))
                await session.commit()
            except Exception as e:
                print(f"Migration failed (growhub_contents.user_id): {e}")

        # Migration: Add user_id to growhub_creators
        try:
            await session.execute(text("SELECT user_id FROM growhub_creators LIMIT 1"))
        except Exception:
            print("Migrating: Adding user_id to growhub_creators")
            try:
                await session.execute(text("ALTER TABLE growhub_creators ADD COLUMN user_id INTEGER"))
                await session.execute(text("CREATE INDEX ix_growhub_creators_user_id ON growhub_creators (user_id)"))
                await session.commit()
            except Exception as e:
                print(f"Migration failed (growhub_creators.user_id): {e}")

        # Migration: Add user_id to growhub_hotspots
        try:
            await session.execute(text("SELECT user_id FROM growhub_hotspots LIMIT 1"))
        except Exception:
            print("Migrating: Adding user_id to growhub_hotspots")
            try:
                await session.execute(text("ALTER TABLE growhub_hotspots ADD COLUMN user_id INTEGER"))
                await session.execute(text("CREATE INDEX ix_growhub_hotspots_user_id ON growhub_hotspots (user_id)"))
                await session.commit()
            except Exception as e:
                print(f"Migration failed (growhub_hotspots.user_id): {e}")
                
        # Migration: Add AI evaluation columns to growhub_hotspots
        hotspot_cols = [
            ("alignment_score", "FLOAT DEFAULT 0.0"),
            ("recency_score", "FLOAT DEFAULT 0.0"),
            ("duration_label", "VARCHAR(50)"),
            ("is_valid", "BOOLEAN DEFAULT 1"),
            ("validity_status", "VARCHAR(200)"),
            ("ai_features", "TEXT"),  # SQLite JSON is stored as TEXT
            ("ai_evaluation", "TEXT"),
            ("custom_categories", "TEXT")
        ]
        try:
            await session.execute(text("SELECT id FROM growhub_hotspot_history LIMIT 1"))
        except Exception:
            print("Migrating: creating growhub_hotspot_history table")
            try:
                await session.execute(
                    text(
                        """
                        CREATE TABLE IF NOT EXISTS growhub_hotspot_history (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            hotspot_id INTEGER NOT NULL,
                            record_date DATE NOT NULL,
                            like_count INTEGER DEFAULT 0,
                            comment_count INTEGER DEFAULT 0,
                            share_count INTEGER DEFAULT 0,
                            view_count INTEGER DEFAULT 0,
                            UNIQUE (hotspot_id, record_date)
                        )
                        """
                    )
                )
                await session.execute(
                    text(
                        "CREATE INDEX IF NOT EXISTS ix_hotspot_history_hotspot_id "
                        "ON growhub_hotspot_history (hotspot_id)"
                    )
                )
                await session.execute(
                    text(
                        "CREATE INDEX IF NOT EXISTS ix_hotspot_history_record_date "
                        "ON growhub_hotspot_history (record_date)"
                    )
                )
                await session.commit()
            except Exception as e:
                print(f"Migration failed (growhub_hotspot_history): {e}")

        for col_name, col_type in hotspot_cols:
            try:
                await session.execute(text(f"SELECT {col_name} FROM growhub_hotspots LIMIT 1"))
            except Exception:
                print(f"Migrating: Adding {col_name} to growhub_hotspots")
                try:
                    await session.execute(text(f"ALTER TABLE growhub_hotspots ADD COLUMN {col_name} {col_type}"))
                    await session.commit()
                except Exception as e:
                    print(f"Migration failed (growhub_hotspots.{col_name}): {e}")

        # Migration: Create growhub_publish_tasks table for automatic matrix publishing
        try:
            await session.execute(text("SELECT id FROM growhub_publish_tasks LIMIT 1"))
            # 确保已有表结构迁移
            try:
                await session.execute(text("SELECT publish_time FROM growhub_publish_tasks LIMIT 1"))
            except Exception:
                print("Migrating: Adding publish_time to growhub_publish_tasks")
                try:
                    await session.execute(text("ALTER TABLE growhub_publish_tasks ADD COLUMN publish_time TIMESTAMP"))
                    await session.commit()
                except Exception as ex:
                    print(f"Migration failed (growhub_publish_tasks.publish_time): {ex}")
        except Exception:
            print("Migrating: creating growhub_publish_tasks table")
            try:
                await session.execute(
                    text(
                        """
                        CREATE TABLE IF NOT EXISTS growhub_publish_tasks (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            task_title VARCHAR(255) NOT NULL,
                            account_id VARCHAR(255),
                            content_body TEXT,
                            assets_dir VARCHAR(255),
                            status VARCHAR(32) DEFAULT 'pending_generation',
                            post_url VARCHAR(255),
                            publish_time TIMESTAMP,
                            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                        )
                        """
                    )
                )
                await session.commit()
            except Exception as e:
                print(f"Migration failed (growhub_publish_tasks): {e}")
                
    # 重型初始化放到后台，避免阻塞 Web/API（否则前端 /auth/me 会一直转圈）
    asyncio.create_task(_deferred_service_startup())


async def _deferred_service_startup():
    from api.services.account_pool import get_account_pool
    from api.services.project import get_project_service
    from api.services.scheduler import get_scheduler
    from api.services.hotspot_service import get_hotspot_service
    from api.services.service_manager import start_dependency_services

    try:
        # 尝试拉起底层依赖服务
        await start_dependency_services()
    except Exception as e:
        print(f"[Startup] Failed to start dependency services: {e}")

    try:
        await get_account_pool().initialize()
    except Exception as e:
        print(f"[Startup] Account pool init failed: {e}")

    try:
        scheduler = get_scheduler()
        if not scheduler._started:
            scheduler.start()
        project_service = get_project_service()
        await project_service.sync_active_projects_to_scheduler()
        print("[Startup] Active projects synced to scheduler")
    except Exception as e:
        print(f"[Startup] Failed to sync projects to scheduler: {e}")

    try:
        scheduler = get_scheduler()
        scheduler.scheduler.add_job(
            get_hotspot_service().decay_hotspots_heat,
            trigger="interval",
            hours=4,
            id="hotspots_decay_task",
            name="热点数据衰减与归档定时任务",
            replace_existing=True,
        )
        print("[Startup] Hotspots decay periodic task registered")
        asyncio.create_task(get_hotspot_service().decay_hotspots_heat())
        asyncio.create_task(get_hotspot_service().backfill_missing_entry_snapshots())
    except Exception as e:
        print(f"[Startup] Failed to register hotspots decay task: {e}")



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
            cwd="MediaCrawlerPro/MediaCrawlerPro-Python"  # Point to unified pro engine
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


# Mount audio extractions explicitly before the general /static mount
audio_dir = os.path.join(os.path.dirname(__file__), "..", "static", "audio_extractions")
os.makedirs(audio_dir, exist_ok=True)
app.mount("/static/audio_extractions", StaticFiles(directory=audio_dir), name="audio_extractions")

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


# Wildcard catch-all route for SPA routing
@app.get("/{catchall:path}")
async def catch_all(request: Request):
    path = request.url.path
    if not (path.startswith("/api") or path.startswith("/growhub") or path.startswith("/assets") or path.startswith("/logos") or path.startswith("/docs") or path.startswith("/openapi.json") or path.startswith("/static")):
        index_path = os.path.join(WEBUI_DIR, "index.html")
        if os.path.exists(index_path):
            return FileResponse(index_path)
    return JSONResponse(status_code=404, content={"detail": "Not Found"})


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8040)
