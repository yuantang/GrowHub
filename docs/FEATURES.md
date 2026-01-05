# MediaCrawler 功能增强文档

本文档记录了新增的功能模块和使用方法。

## 📦 新增功能清单

### 1. ✅ 首页推荐信息流 (HomeFeed)

支持爬取各平台首页推荐内容，无需关键词即可获取热门内容。

**使用方法:**
- 在 Dashboard 选择爬取类型为「首页推荐」
- 或命令行: `uv run python main.py --platform xhs --type homefeed`

**配置项 (`config/base_config.py`):**
```python
HOMEFEED_MAX_PAGES = 10          # 最大爬取页数
HOMEFEED_CATEGORY = "homefeed_recommend"  # 推荐分类
```

---

### 2. ✅ 签名服务 (Sign Service)

独立的签名微服务，将 Playwright 签名逻辑解耦，支持远程调用。

**目录结构:**
```
sign_service/
├── main.py           # 服务入口
├── browser_pool.py   # 浏览器池管理
├── routers/
│   └── sign.py       # 签名 API
└── signers/
    ├── base.py       # 基类
    └── xhs.py        # 小红书签名
```

**启动签名服务:**
```bash
uv run uvicorn sign_service.main:app --port 8081 --reload
```

**配置爬虫使用签名服务 (`config/base_config.py`):**
```python
ENABLE_SIGN_SERVICE = True
SIGN_SERVICE_URL = "http://localhost:8081"
```

**API 端点:**
- `POST /sign/{platform}` - 生成签名
- `GET /health` - 健康检查
- `GET /sign/status` - 服务状态

---

### 3. ✅ 断点续爬 (Checkpoint)

支持保存爬虫进度，中断后可恢复继续爬取。

**目录结构:**
```
checkpoint/
├── __init__.py
├── models.py         # 检查点数据模型
└── manager.py        # 检查点管理器
```

**API 端点:**
- `GET /api/checkpoints` - 列出所有检查点
- `GET /api/checkpoints/resumable` - 获取可恢复的检查点
- `GET /api/checkpoints/{task_id}` - 获取检查点详情
- `DELETE /api/checkpoints/{task_id}` - 删除检查点
- `POST /api/checkpoints/{task_id}/pause` - 暂停任务
- `POST /api/checkpoints/cleanup` - 清理旧检查点

**检查点存储位置:** `data/checkpoints/`

---

### 4. ✅ 多账号管理 (Multi-Account)

支持为每个平台配置多个账号，自动轮换使用。

**目录结构:**
```
accounts/
├── __init__.py
├── models.py         # 账号数据模型
└── manager.py        # 账号管理器
```

**配置文件:** `config/accounts.yaml`

```yaml
accounts:
  xhs:
    - name: "主账号"
      cookies: "a1=xxx; web_session=yyy; ..."
      status: active
    - name: "备用账号"
      cookies: "..."
      status: active
  dy:
    - name: "主账号"
      cookies: "..."
```

**API 端点:**
- `GET /api/accounts` - 列出所有账号
- `GET /api/accounts/{platform}` - 获取平台账号
- `POST /api/accounts/{platform}` - 添加账号
- `PUT /api/accounts/{platform}/{id}` - 更新账号
- `DELETE /api/accounts/{platform}/{id}` - 删除账号
- `POST /api/accounts/{platform}/{id}/activate` - 激活账号
- `POST /api/accounts/{platform}/{id}/disable` - 禁用账号

**账号状态:**
- `active` - 正常可用
- `disabled` - 已禁用
- `banned` - 被平台封禁
- `cooling` - 冷却中
- `expired` - Cookie已过期

---

## 🔧 配置总览

### 新增配置项 (`config/base_config.py`)

```python
# ==================== 签名服务配置 ====================
ENABLE_SIGN_SERVICE = False
SIGN_SERVICE_URL = "http://localhost:8081"

# ==================== HomeFeed 配置 ====================
HOMEFEED_MAX_PAGES = 10
HOMEFEED_CATEGORY = "homefeed_recommend"
```

### 新增配置文件

- `config/accounts.yaml` - 多账号配置

---

## 🚀 部署架构

### 单机部署

```bash
# 启动主服务
uv run uvicorn api.main:app --port 8080

# (可选) 启动签名服务
uv run uvicorn sign_service.main:app --port 8081
```

### 分布式部署

```
┌─────────────────┐     HTTP     ┌─────────────────┐
│  WebUI + API    │ ──────────► │  签名服务        │
│  (Port 8080)    │ ◄────────── │  (Port 8081)    │
└─────────────────┘             └─────────────────┘
        │
        │ subprocess
        ▼
┌─────────────────┐
│  爬虫进程        │
│  (main.py)      │
└─────────────────┘
```

---

## 📝 待实现功能

- [ ] 抖音签名器 (DouyinSigner)
- [ ] B站签名器 (BilibiliSigner)
- [ ] 微博签名器 (WeiboSigner)
- [ ] 快手签名器 (KuaishouSigner)
- [ ] 视频下载器桌面端 UI
- [ ] 其他平台 HomeFeed 支持
