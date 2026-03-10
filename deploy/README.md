# 🚀 生产环境部署配置

本目录包含生产环境部署所需的配置文件。

> **💡 提示**: 完整的部署指南请查看项目根目录的 [DEPLOY.md](../DEPLOY.md)

---

## 📁 文件说明

```
deploy/
├── docker-compose.prod.yml       # 生产环境 Docker Compose 配置
├── .env.example                  # 环境变量配置示例
├── deploy.sh                     # 自动化部署脚本(Linux/Mac)
├── deploy.ps1                    # 自动化部署脚本(Windows)
├── update_subscription.sh.example # 自动更新脚本示例
├── clash/
│   └── config.yaml.example       # Clash 代理配置示例
└── update.py                     # 订阅处理脚本(Python)
```

---

## 🌐 Clash 代理配置

### 为什么需要代理?

Claude API 和 Google API 在国内无法直接访问,需要通过代理访问。本项目使用 Clash 作为代理服务。

### 配置步骤

1. **复制配置文件**
   ```bash
   cp deploy/clash/config.yaml.example deploy/clash/config.yaml
   nano deploy/clash/config.yaml
   ```

2. **填入机场订阅地址**
   ```yaml
   proxy-providers:
     my-provider:
       type: http
       url: "你的机场订阅地址"  # <-- 在这里填入
       interval: 3600
       path: ./proxies/provider.yaml
       health-check:
         enable: true
         interval: 600
         url: http://www.gstatic.com/generate_204
   ```

3. **重启 Clash 服务**
   ```bash
   docker-compose -f docker-compose.prod.yml restart clash
   ```

### 测试代理

```bash
# 测试代理连接
docker exec -it clash-proxy curl -x http://127.0.0.1:7890 https://www.google.com

# 测试 Claude API
docker exec -it claude-relay-service curl -x http://clash:7890 https://api.anthropic.com
```

### 🔄 自动更新订阅(推荐)

#### 功能说明

本项目提供了自动更新 Clash 订阅的脚本,可以:
- ✅ 自动下载最新订阅
- ✅ 过滤高倍率节点(节省流量)
- ✅ 启用自动测速选择最快节点
- ✅ 定时自动更新(每天凌晨 4 点)

#### 脚本文件

1. **update_subscription.sh** - 主脚本
   - 下载订阅
   - 调用 Python 脚本处理
   - 重启 Clash 服务

2. **update.py** - 处理脚本
   - 过滤节点
   - 生成配置文件
   - 启用自动测速

#### 配置订阅地址

首先复制脚本模板:
```bash
cp deploy/update_subscription.sh.example deploy/update_subscription.sh
chmod +x deploy/update_subscription.sh
nano deploy/update_subscription.sh
```

修改订阅地址:
```bash
# ================= 配置区域 =================
SUB_URL="你的机场订阅地址"  # <-- 修改这里
FILTER_KEYWORDS=("20倍" "按量" "剩余流量" "到期" "官网")  # 过滤关键词
# ===========================================
```

#### 手动更新订阅

```bash
cd deploy
./update_subscription.sh
```

#### 设置定时任务

```bash
# 编辑 crontab
crontab -e

# 添加以下行(每天凌晨 4 点更新)
0 4 * * * /bin/bash /www/wwwroot/claude-relay-service/deploy/update_subscription.sh >> /tmp/clash_update.log 2>&1
```

#### 查看更新日志

```bash
tail -f /tmp/clash_update.log
```

#### 自定义过滤规则

在 `update_subscription.sh` 中修改 `FILTER_KEYWORDS`:
```bash
# 过滤包含这些关键词的节点
FILTER_KEYWORDS=("20倍" "按量" "剩余流量" "到期" "官网" "测试")
```

**常见过滤关键词**:
- `20倍`、`10倍` - 高倍率节点
- `按量` - 按量计费节点
- `剩余流量`、`到期` - 提示信息节点
- `官网` - 官网链接节点

---

## ⚙️ 环境变量配置

### 创建配置文件

```bash
cd deploy
cp .env.example .env
nano .env
```

### 必填配置

```env
# 安全密钥(必填)
JWT_SECRET=<运行 openssl rand -hex 32 生成>
ENCRYPTION_KEY=<运行 openssl rand -hex 16 生成>

# 管理员账号(可选,不填则自动生成)
ADMIN_USERNAME=your_username
ADMIN_PASSWORD=your_password

# 服务端口
PORT=7250
BIND_HOST=0.0.0.0
```

### 生成密钥

```bash
# 生成 JWT 密钥
openssl rand -hex 32

# 生成加密密钥
openssl rand -hex 16
```

---

## 🚀 使用 docker-compose.prod.yml

### 启动服务

```bash
cd deploy

# 首次启动(构建镜像)
docker-compose -f docker-compose.prod.yml up -d --build

# 后续启动
docker-compose -f docker-compose.prod.yml up -d
```

### 常用命令

```bash
# 查看状态
docker-compose -f docker-compose.prod.yml ps

# 查看日志
docker-compose -f docker-compose.prod.yml logs -f

# 查看特定服务日志
docker-compose -f docker-compose.prod.yml logs -f claude-relay
docker-compose -f docker-compose.prod.yml logs -f clash

# 重启服务
docker-compose -f docker-compose.prod.yml restart

# 停止服务
docker-compose -f docker-compose.prod.yml down

# 重新构建
docker-compose -f docker-compose.prod.yml build --no-cache
```

---

## 🏗️ 部署架构

```
┌─────────────────────────────────────────────────────────────┐
│                       服务器                                 │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Docker Network                          │   │
│  │                                                     │   │
│  │   ┌──────────┐    ┌──────────────────┐   ┌───────┐ │   │
│  │   │  Clash   │◄───│ Claude Relay     │──►│ Redis │ │   │
│  │   │  :7890   │    │ Service :3000    │   │ :6379 │ │   │
│  │   └────┬─────┘    └──────────────────┘   └───────┘ │   │
│  │        │                                           │   │
│  └────────┼───────────────────────────────────────────┘   │
│           │                                               │
│           ▼                                               │
│     🌐 国外 API                                           │
│     (anthropic.com, googleapis.com)                       │
└─────────────────────────────────────────────────────────────┘
```

**说明**:
- Clash 仅在 Docker 网络内暴露,不影响服务器其他服务
- Claude Relay Service 通过 Clash 代理访问国外 API
- Redis 用于缓存和会话管理

---

## ❓ 常见问题

### Q: Clash 无法启动?

**检查配置**:
```bash
docker-compose -f docker-compose.prod.yml logs clash
```

**常见原因**:
- 订阅地址无效
- 配置文件格式错误
- 网络连接问题

### Q: 如何更换机场订阅?

```bash
# 1. 编辑配置
nano clash/config.yaml

# 2. 修改订阅地址

# 3. 重启 Clash
docker-compose -f docker-compose.prod.yml restart clash
```

### Q: 如何让其他容器使用同一个代理?

在其他项目的 docker-compose.yml 中:
```yaml
services:
  your-service:
    environment:
      - HTTP_PROXY=http://clash:7890
      - HTTPS_PROXY=http://clash:7890
    networks:
      - claude-relay-service_claude-relay-network
    external_links:
      - clash-proxy:clash

networks:
  claude-relay-service_claude-relay-network:
    external: true
```

---

## 📚 相关文档

- [DEPLOY.md](../DEPLOY.md) - 完整部署指南
- [AGENTS.md](../AGENTS.md) - AI Agents 开发指南
- [docker-compose.prod.yml](./docker-compose.prod.yml) - Docker Compose 配置文件

---

**最后更新**: 2026-02-09
