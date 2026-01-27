# 🛡️ GrowHub 风控机制文档

> 本文档详细说明 GrowHub 爬虫的风控机制设计，帮助维护者理解和优化反爬虫策略。

---

## 📋 目录

1. [风控架构概述](#风控架构概述)
2. [账号池策略](#账号池策略)
3. [IP 代理策略](#ip-代理策略)
4. [时间间隔策略](#时间间隔策略)
5. [最佳实践配置](#最佳实践配置)
6. [故障排查](#故障排查)

---

## 风控架构概述

GrowHub 采用**三层防护架构**，从账号、网络、行为三个维度降低被平台检测的风险：

```
┌─────────────────────────────────────────────────────────────┐
│                      风控防护架构                            │
├─────────────────────────────────────────────────────────────┤
│  Layer 1: 账号池 (Account Pool)                             │
│  - 健康度评分、熔断机制、指数退避冷却                         │
├─────────────────────────────────────────────────────────────┤
│  Layer 2: IP 代理池 (Proxy Pool)                            │
│  - 账号-IP 亲和绑定、黑名单机制、自动刷新                     │
├─────────────────────────────────────────────────────────────┤
│  Layer 3: 行为模拟 (Behavior Simulation)                    │
│  - 随机间隔、UA 轮换、自适应限流                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 账号池策略

### 核心概念

| 概念                      | 说明                             |
| ------------------------- | -------------------------------- |
| **健康度 (Health Score)** | 0-100 分，低于 30 分暂停使用     |
| **冷却时间 (Cooldown)**   | 使用后强制等待时间，默认 5 分钟  |
| **连续失败计数**          | 连续失败触发指数退避             |
| **平台熔断**              | 10 分钟内 5 次失败触发全平台暂停 |

### 健康度计算

```python
# 成功请求
health_score = min(100, health_score + 5)
consecutive_fails = 0

# 失败请求
health_score = max(0, health_score - 10)
consecutive_fails += 1
```

### 指数退避冷却

当账号连续失败时，冷却时间按指数增长：

| 连续失败次数 | 冷却时间      |
| ------------ | ------------- |
| 1            | 5 分钟        |
| 2            | 10 分钟       |
| 3            | 20 分钟       |
| 4            | 40 分钟       |
| 5+           | 最高 160 分钟 |

### 账号选择优先级

1. **项目粘滞** - 同一项目优先使用上次的账号
2. **健康度优先** - 从健康分高的账号中选择
3. **最久未使用** - 避免过度使用单一账号

### 相关配置

```python
# config/base_config.py
ACCOUNT_COOLDOWN_SECONDS = 300  # 默认冷却 5 分钟
ACCOUNT_MAX_DAILY_REQUESTS = 500  # 每日上限
```

---

## IP 代理策略

### 核心概念

| 概念                 | 说明                        |
| -------------------- | --------------------------- |
| **账号-IP 亲和绑定** | 同一账号始终使用同一 IP     |
| **IP 黑名单**        | 失败 3 次的 IP 自动拉黑     |
| **过期自动刷新**     | 提前 30 秒刷新即将过期的 IP |

### 亲和绑定流程

```
1. 获取代理 → 检查内存缓存
2. 未命中 → 检查数据库持久化
3. 仍未找到 → 从代理池获取新 IP
4. 建立绑定 → 内存 + 数据库双写
```

### IP 黑名单机制

```python
class ProxyIpPool:
    ip_blacklist: set = set()
    ip_failure_count: Dict[str, int] = {}
    blacklist_threshold: int = 3  # 3 次失败自动拉黑
```

### 相关代码

- `proxy/proxy_ip_pool.py` - IP 池核心逻辑
- `proxy/base_proxy.py` - 代理提供者基类

---

## 时间间隔策略

### 核心概念

| 概念             | 说明                                  |
| ---------------- | ------------------------------------- |
| **随机化间隔**   | 基础时间 × (0.5~2.0) + 0~500ms 微延迟 |
| **自适应限流**   | 遇到 429 自动退避（5s→60s）           |
| **指数退避重试** | 网络错误自动重试 3 次                 |

### 随机化间隔实现

```python
# tools/crawler_util.py
async def random_sleep(base_seconds: float = 2.0, jitter_range: tuple = (0.5, 2.0)):
    jitter = random.uniform(jitter_range[0], jitter_range[1])
    actual_sleep = base_seconds * jitter
    micro_delay = random.uniform(0, 0.5)  # 人类行为模拟
    await asyncio.sleep(actual_sleep + micro_delay)
```

### 429 限流响应

```python
if response.status_code == 429:
    self._rate_limit_backoff = min(60.0, self._rate_limit_backoff * 2)
    await asyncio.sleep(self._rate_limit_backoff)
```

### 相关配置

```python
# config/base_config.py
CRAWLER_MAX_SLEEP_SEC = 3  # 基础间隔（实际 1.5-6s）
GLOBAL_TPS_LIMIT = 1.0  # 全局 TPS 限制
MAX_CONCURRENCY_NUM = 1  # 并发数
```

---

## 最佳实践配置

### 保守模式（推荐新手）

```python
CRAWLER_MAX_SLEEP_SEC = 5
MAX_CONCURRENCY_NUM = 1
ACCOUNT_COOLDOWN_SECONDS = 600  # 10 分钟
ACCOUNT_MAX_DAILY_REQUESTS = 200
```

### 标准模式（日常使用）

```python
CRAWLER_MAX_SLEEP_SEC = 3
MAX_CONCURRENCY_NUM = 2
ACCOUNT_COOLDOWN_SECONDS = 300  # 5 分钟
ACCOUNT_MAX_DAILY_REQUESTS = 500
```

### 激进模式（不推荐）

```python
CRAWLER_MAX_SLEEP_SEC = 1
MAX_CONCURRENCY_NUM = 5
ACCOUNT_COOLDOWN_SECONDS = 60
ACCOUNT_MAX_DAILY_REQUESTS = 2000
```

> ⚠️ **警告**: 激进模式容易触发风控，仅在测试环境使用。

---

## 故障排查

### 症状：频繁出现验证码

**可能原因**：

1. 请求频率过高
2. IP 被标记
3. 账号异常

**解决方案**：

1. 增加 `CRAWLER_MAX_SLEEP_SEC`
2. 更换代理 IP 供应商
3. 重新登录获取新 Cookie

### 症状：账号全部进入冷却

**可能原因**：

1. 触发平台熔断
2. 所有 Cookie 已过期

**解决方案**：

1. 等待 10 分钟后自动恢复
2. 检查账号健康状态，重新获取 Cookie

### 症状：429 错误频繁

**可能原因**：

1. 超过平台 TPS 限制
2. IP 被临时限流

**解决方案**：

1. 系统会自动退避，等待即可
2. 降低 `MAX_CONCURRENCY_NUM`

---

## 技术参考

| 文件                           | 说明                        |
| ------------------------------ | --------------------------- |
| `api/services/account_pool.py` | 账号池服务                  |
| `proxy/proxy_ip_pool.py`       | IP 代理池                   |
| `tools/crawler_util.py`        | 工具函数（含 random_sleep） |
| `media_platform/xhs/client.py` | 小红书客户端（含重试逻辑）  |
| `config/base_config.py`        | 全局配置                    |

---

_最后更新: 2026-01-27_
