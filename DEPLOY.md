# GrowHub 部署指南

## 目录
- [快速开始](#快速开始)
- [Docker 部署](#docker-部署)
- [手动部署](#手动部署)
- [配置说明](#配置说明)
- [常见问题](#常见问题)

---

## 快速开始

### 系统要求
- Docker 20.0+
- Docker Compose 2.0+
- 或 Python 3.11+, Node.js 20+

### 一键启动 (Docker)

```bash
# 克隆仓库
git clone https://github.com/yuantang/GrowHub.git
cd GrowHub

# 配置环境变量 (可选)
cp .env.example .env
# 编辑 .env 配置 API Keys

# 启动所有服务
docker-compose up -d

# 查看日志
docker-compose logs -f
```

启动后访问:
- 前端界面: http://localhost:3000
- API 文档: http://localhost:8080/docs

---

## Docker 部署

### 服务架构

```
┌─────────────────────────────────────────────────────┐
│                     Nginx (3000)                     │
│                 前端静态文件 + API 代理              │
└────────────────────────┬────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────┐
│                  API Server (8080)                   │
│              FastAPI + Uvicorn + SQLite              │
└────────────────────────┬────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────┐
│                   Redis (6379)                       │
│                     缓存服务                          │
└─────────────────────────────────────────────────────┘
```

### 构建镜像

```bash
# 构建后端
docker build -t growhub-api .

# 构建前端
docker build -t growhub-web ./web-client
```

### 单独运行

```bash
# 运行后端
docker run -d \
  --name growhub-api \
  -p 8080:8080 \
  -v $(pwd)/database:/app/database \
  -e OPENROUTER_API_KEY=your_key_here \
  growhub-api

# 运行前端
docker run -d \
  --name growhub-web \
  -p 3000:80 \
  --link growhub-api:api \
  growhub-web
```

---

## 手动部署

### 后端部署

```bash
# 安装 Python 依赖
pip install -r requirements.txt
pip install apscheduler pyyaml

# 初始化数据库
python init_db_tables.py

# 启动服务
uvicorn api.main:app --host 0.0.0.0 --port 8080
```

### 前端部署

```bash
cd web-client

# 安装依赖
npm install

# 开发模式
npm run dev

# 生产构建
npm run build

# 构建产物在 dist/ 目录，可部署到任意静态服务器
```

---

## 配置说明

### 环境变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `SAVE_DATA_OPTION` | 数据存储方式 | `sqlite` |
| `OPENROUTER_API_KEY` | OpenRouter API Key | - |
| `DEEPSEEK_API_KEY` | DeepSeek API Key | - |
| `MYSQL_DB_HOST` | MySQL 主机地址 | `127.0.0.1` |
| `MYSQL_DB_USER` | MySQL 用户名 | `root` |
| `MYSQL_DB_PWD` | MySQL 密码 | - |

### 数据存储配置

修改 `config/base_config.py`:

```python
# SQLite (开发/小规模)
SAVE_DATA_OPTION = "sqlite"

# MySQL (生产推荐)
SAVE_DATA_OPTION = "db"
```

### AI 服务配置

在 `api/services/llm.py` 中配置:

```python
# OpenRouter (推荐)
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")

# DeepSeek
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY")

# 本地 Ollama
OLLAMA_BASE_URL = "http://localhost:11434"
```

---

## 生产环境建议

### 1. 使用 MySQL

```yaml
# docker-compose.yml 中取消 mysql 服务的注释
mysql:
  image: mysql:8.0
  environment:
    - MYSQL_ROOT_PASSWORD=your_password
    - MYSQL_DATABASE=growhub
```

### 2. 配置 HTTPS

使用 Nginx + Let's Encrypt:

```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    location / {
        proxy_pass http://localhost:3000;
    }
}
```

### 3. 监控与日志

```bash
# 查看实时日志
docker-compose logs -f api

# 查看资源使用
docker stats
```

---

## 常见问题

### Q: 数据库初始化失败？

```bash
# 手动初始化
docker-compose exec api python init_db_tables.py
```

### Q: 前端无法连接 API？

检查 CORS 配置和网络连通性:
```bash
curl http://localhost:8080/health
```

### Q: AI 功能不可用？

确保配置了有效的 API Key:
```bash
export OPENROUTER_API_KEY=sk-or-xxxx
docker-compose restart api
```

---

## 更新升级

```bash
# 拉取最新代码
git pull origin main

# 重新构建并重启
docker-compose build
docker-compose up -d
```

---

## 技术支持

- GitHub Issues: https://github.com/yuantang/GrowHub/issues
- 文档: https://github.com/yuantang/GrowHub/wiki
