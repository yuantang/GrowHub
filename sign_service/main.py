# -*- coding: utf-8 -*-
"""
MediaCrawler Sign Service - Independent signing microservice

This service provides HTTP API for generating platform-specific request signatures.
It runs as a separate process and maintains browser instances for signature generation.

Start command: uvicorn sign_service.main:app --port 8081 --reload
"""

import asyncio
import os
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routers import sign_router
from .browser_pool import browser_pool


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler"""
    # Startup
    print("[SignService] Starting browser pool...")
    await browser_pool.initialize(pool_size=2)
    print("[SignService] Browser pool initialized")
    
    yield
    
    # Shutdown
    print("[SignService] Shutting down browser pool...")
    await browser_pool.cleanup()
    print("[SignService] Browser pool cleaned up")


app = FastAPI(
    title="MediaCrawler Sign Service",
    description="Independent signing microservice for MediaCrawler",
    version="1.0.0",
    lifespan=lifespan
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(sign_router, prefix="/sign", tags=["sign"])


@app.get("/")
async def root():
    return {
        "service": "MediaCrawler Sign Service",
        "version": "1.0.0",
        "status": "running"
    }


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    pool_status = await browser_pool.get_status()
    return {
        "status": "ok",
        "browser_pool": pool_status
    }


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8081)
