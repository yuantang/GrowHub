# Changelog

所有重要更改都会记录在此文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
本项目遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

---

## [1.2.0] - 2026-01-27

### 🚀 新增

- **爬虫风控优化**
  - 请求间隔随机化（0.5-2.0x 抖动 + 微延迟）
  - 429 响应自适应限流（5s→60s 指数退避）
  - IP 黑名单机制（3 次失败自动拉黑）
  - 请求重试（网络错误自动重试 3 次，指数退避）
  - User-Agent 轮换（每次会话随机选择）

- **账号池增强**
  - 冷却时间从 60s 增加至 300s（5 分钟）
  - 新增每日请求上限配置（`ACCOUNT_MAX_DAILY_REQUESTS`）
  - 指数退避冷却（连续失败时冷却时间翻倍）

- **配置项**
  - `ACCOUNT_COOLDOWN_SECONDS`: 账号冷却时间（默认 300）
  - `ACCOUNT_MAX_DAILY_REQUESTS`: 单账号每日上限（默认 500）

### 🔧 修复

- **P1**: 签名验证空值异常 - 空签名时抛出明确异常
- **P2**: 子评论无限循环 - 添加 `max_sub_comments=50` 限制
- **P3**: Cookie 同步时机 - 每 10 次请求自动刷新 Cookie
- **P4**: 全局并发控制 - 修复 semaphore 重复创建问题
- **P8**: 账号状态覆盖 - 低优先级状态不再覆盖高优先级

### 📁 项目清理

- 删除无用文件：`nohup.out`, `server.log`, `frontend.log` 等
- 删除旧版 WebUI：`api/webui_old/`
- 删除测试数据：`media_platform/tieba/test_data/`
- 清理所有 `__pycache__/` 目录

---

## [1.1.0] - 2026-01-26

### 新增

- 断点续爬功能（Checkpoint Manager）
- 优雅关闭机制（信号处理）
- 账号池持久化存储

### 修复

- 数据库文件合并为 `growhub.db`
- 配置文件路径统一

---

## [1.0.0] - 2026-01-11

### 初始版本

- 基于 MediaCrawler 的爬虫引擎
- 支持小红书、抖音、B站、微博、知乎平台
- React 前端管理界面
- FastAPI 后端 API
- 账号池管理
- 定时任务调度
