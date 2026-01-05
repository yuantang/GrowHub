# MediaCrawler 签名服务

独立的签名微服务，用于生成各平台 API 请求的签名。

## 功能特点

- **独立部署**：作为独立进程运行，与主爬虫解耦
- **浏览器池**：预启动多个浏览器实例，高并发签名
- **多平台支持**：支持小红书、抖音、B站、微博、快手
- **RESTful API**：通过 HTTP 接口调用

## 支持的平台

| 平台 | 标识符 | 签名算法 | 状态 |
|------|--------|----------|------|
| 小红书 | `xhs` | X-s, X-t, X-s-common | ✅ 可用 |
| 抖音 | `dy` | a-bogus | ✅ 可用 |
| B站 | `bili` | WBI (w_rid, wts) | ✅ 可用 |
| 微博 | `wb` | Cookie-based | ✅ 可用 |
| 快手 | `ks` | GraphQL headers | ✅ 可用 |

## 快速开始

### 1. 启动签名服务

```bash
# 在项目根目录运行
uv run uvicorn sign_service.main:app --port 8081 --reload
```

### 2. 配置主爬虫使用签名服务

编辑 `config/base_config.py`：

```python
# 启用签名服务
ENABLE_SIGN_SERVICE = True

# 签名服务地址
SIGN_SERVICE_URL = "http://localhost:8081"
```

### 3. 测试签名服务

```bash
# 健康检查
curl http://localhost:8081/health

# 获取状态
curl http://localhost:8081/sign/status

# 测试小红书签名
curl -X POST http://localhost:8081/sign/xhs \
  -H "Content-Type: application/json" \
  -d '{
    "uri": "/api/sns/web/v1/search/notes",
    "data": {"keyword": "test", "page": 1},
    "method": "POST",
    "cookies": {"a1": "your_a1_value"}
  }'

# 测试抖音签名
curl -X POST http://localhost:8081/sign/dy \
  -H "Content-Type: application/json" \
  -d '{
    "uri": "/aweme/v1/web/search/item/",
    "data": {"keyword": "test"},
    "method": "GET"
  }'

# 测试B站签名
curl -X POST http://localhost:8081/sign/bili \
  -H "Content-Type: application/json" \
  -d '{
    "uri": "/x/web-interface/search/type",
    "data": {"keyword": "test", "search_type": "video"},
    "method": "GET"
  }'
```

## API 文档

启动服务后访问：http://localhost:8081/docs

### 签名接口

**POST** `/sign/{platform}`

请求体：
```json
{
  "uri": "/api/endpoint",
  "data": {},
  "method": "GET",
  "cookies": {}
}
```

响应：
```json
{
  "success": true,
  "headers": {
    "X-S": "...",
    "X-T": "..."
  }
}
```

## 架构说明

```
sign_service/
├── main.py           # 服务入口
├── browser_pool.py   # 浏览器池管理
├── routers/
│   └── sign.py       # 签名 API 路由
└── signers/
    ├── base.py       # 签名器基类
    ├── xhs.py        # 小红书签名
    ├── douyin.py     # 抖音签名
    ├── bilibili.py   # B站签名
    ├── weibo.py      # 微博签名
    └── kuaishou.py   # 快手签名
```

## Docker 部署（可选）

```dockerfile
FROM python:3.11-slim

# 安装 Playwright 依赖
RUN apt-get update && apt-get install -y \
    libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 \
    libcups2 libdrm2 libdbus-1-3 libxkbcommon0 \
    libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
    libgbm1 libasound2 libpango-1.0-0 libcairo2

WORKDIR /app
COPY . .

RUN pip install -r requirements.txt
RUN playwright install chromium

EXPOSE 8081
CMD ["uvicorn", "sign_service.main:app", "--host", "0.0.0.0", "--port", "8081"]
```
