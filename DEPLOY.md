# 🚀 Claude Relay Service 部署指南

本文档提供详细的部署说明和最佳实践。

---

---

> [!CAUTION]
> **严禁在项目根目录启动服务！**
> 
> ❌ **错误的做法**: `cd /www/wwwroot/claude-relay-service && docker-compose up`
> **后果**: 会启动一套新的容器(如 `claude-relay-service-redis-1`)，与生产环境容器冲突！导致端口占用、数据错乱。
> 
> ✅ **正确的做法**: `cd deploy && docker-compose -f docker-compose.prod.yml up`

---

## 📋 目录

- [快速开始](#快速开始)
- [部署方式对比](#部署方式对比)
- [自动化部署(推荐)](#自动化部署推荐)
- [手动部署](#手动部署)
- [部署优化说明](#部署优化说明)
- [常见问题](#常见问题)

---

## 🎯 快速开始

### 最简单的部署方式

```powershell
# Windows 用户
.\deploy\deploy.ps1

# Linux/Mac 用户
./deploy/deploy.sh
```

**就这么简单!** 脚本会自动完成所有步骤。

---

## 📊 部署方式对比

| 方式 | 构建时间 | 成功率 | 难度 | 推荐度 |
|------|---------|--------|------|--------|
| **自动化脚本** | 1-2 分钟 | ⭐⭐⭐⭐⭐ | ⭐ | ✅ 强烈推荐 |
| 手动部署(本地构建) | 2-3 分钟 | ⭐⭐⭐⭐ | ⭐⭐⭐ | 可选 |
| 服务器直接构建 | 5-10 分钟 | ⭐⭐ | ⭐⭐ | ❌ 不推荐 |

---

---

## ⚙️ 部署前配置 (重要)

脚本默认使用 `cloud-server` 作为服务器别名，路径默认为 `/www/wwwroot/claude-relay-service`。在运行脚本前，请选择以下一种方式配置：

### 方式一：配置 SSH 别名 (推荐)

在本地电脑配置 SSH config，将 `cloud-server` 指向你的真实服务器。

**Linux/Mac** (`~/.ssh/config`) 或 **Windows** (`C:\Users\你的用户名\.ssh\config`):

```ssh
Host cloud-server
    HostName 1.2.3.4        # 你的服务器 IP
    User root               # 登录用户名
    Port 22                 # SSH 端口
    IdentityFile ~/.ssh/id_rsa  # 私钥路径(可选)
```

### 方式二：修改脚本配置

直接编辑部署脚本，修改开头的配置变量：

**Linux/Mac** (`deploy/deploy.sh`):
```bash
# 配置
SERVER="你的服务器IP或别名"
REMOTE_PATH="/your/project/path"
```

**Windows** (`deploy/deploy.ps1`):
```powershell
# 配置
$SERVER = "你的服务器IP或别名"
$REMOTE_PATH = "/your/project/path"
```

### 服务器目录准备

如果使用默认路径，请确保服务器上目录存在并有权限：
```bash
ssh cloud-server "mkdir -p /www/wwwroot/claude-relay-service"
```

---

## 🚀 自动化部署(推荐)

### 前置要求

1. **SSH 配置完成**
   ```bash
   # 确保可以免密登录
   ssh cloud-server
   ```

2. **本地环境**
   - Node.js 18+
   - npm 或 yarn
   - Git Bash (Windows 用户)

### 部署步骤

#### Windows 系统

```powershell
# 1. 进入项目目录
cd d:\cursorProject\CRS\claude-relay-service

# 2. 执行部署脚本
.\deploy\deploy.ps1
```

#### Linux/Mac 系统

```bash
# 1. 进入项目目录
cd /path/to/claude-relay-service

# 2. 添加执行权限(首次)
chmod +x deploy/deploy.sh

# 3. 执行部署脚本
./deploy/deploy.sh
```

### 脚本执行流程

```
┌─────────────────────────────────────┐
│ 1️⃣  检查前端构建状态                │
│    ├─ 已构建 → 跳过                 │
│    └─ 未构建 → 自动构建             │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│ 2️⃣  打包项目文件                    │
│    排除: node_modules, .git, logs  │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│ 3️⃣  上传到服务器                    │
│    通过 SCP 传输压缩包              │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│ 4️⃣  备份现有代码                    │
│    自动创建时间戳备份               │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│ 5️⃣  解压并部署                      │
│    覆盖到项目目录                   │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│ 6️⃣  重启 Docker 服务                │
│    ├─ 停止现有服务                  │
│    ├─ 重新构建镜像(1-2分钟)         │
│    ├─ 启动新服务                    │
│    ├─ 健康检查                      │
│    └─ 🧹 自动清理旧镜像和构建缓存   │
└─────────────────────────────────────┘
```

### 预期输出

```
============================================================================
🚀 Claude Relay Service 自动化部署
============================================================================

📦 步骤 1/6: 检查前端构建状态...
✅ 前端已构建，跳过构建步骤

📦 步骤 2/6: 打包项目文件...
✅ 打包完成: claude-relay-deploy-20260209-120000.tar.gz (15.2 MB)

📤 步骤 3/6: 上传到服务器...
✅ 上传成功

💾 步骤 4/6: 备份服务器现有代码...
✅ 备份完成: backup-20260209-120001.tar.gz

📦 步骤 5/6: 解压并部署到服务器...
✅ 文件部署完成

🔄 步骤 6/6: 重启 Docker 服务...
🛑 停止现有服务...
🔨 重新构建镜像...
✅ 检测到预构建产物，跳过前端构建
🚀 启动服务...
📊 服务状态: Up (healthy)
🏥 健康检查: {"status":"healthy"}
🔄 更新 Clash 订阅...
🎉 更新成功！已过滤高倍率节点并启用自动测速。

============================================================================
✅ 部署完成！
============================================================================
```

---

## 📝 手动部署

如果自动化脚本无法使用,可以手动执行以下步骤:

### 步骤 1: 本地构建前端

```bash
cd web/admin-spa
npm install
npm run build
cd ../..
```

### 步骤 2: 打包项目

```bash
tar -czf deploy.tar.gz \
  --exclude='node_modules' \
  --exclude='.git' \
  --exclude='redis_data' \
  --exclude='logs' \
  --exclude='data' \
  --exclude='*.log' \
  --exclude='*.tar.gz' \
  src web config deploy scripts cli resources \
  Dockerfile docker-compose.yml docker-entrypoint.sh \
  package.json package-lock.json \
  README.md AGENTS.md
```

### 步骤 3: 上传到服务器

```bash
scp deploy.tar.gz cloud-server:/tmp/
```

### 步骤 4: 服务器部署

```bash
ssh cloud-server << 'EOF'
  # 备份
  cd /www/wwwroot/claude-relay-service
  tar -czf ../backup-$(date +%Y%m%d-%H%M%S).tar.gz src web config deploy
  
  # 解压
  tar -xzf /tmp/deploy.tar.gz
  rm /tmp/deploy.tar.gz
  
  # 重启服务
  cd deploy
  docker-compose -f docker-compose.prod.yml down
  docker-compose -f docker-compose.prod.yml up -d --build
  
  # 清理旧镜像和构建缓存（防止磁盘堆积）
  docker image prune -f
  docker builder prune -f --keep-storage=1GB
  
  # 查看状态
  docker-compose -f docker-compose.prod.yml ps
EOF
```

---

## 🎯 部署优化说明

### 为什么要本地构建前端?

#### 问题
在服务器上构建前端会遇到以下问题:
1. **资源不足** - 前端构建需要大量 CPU 和内存
2. **网络问题** - npm 下载依赖可能超时或失败
3. **构建缓慢** - 服务器性能有限,构建需要 5-10 分钟
4. **容易卡死** - 可能导致 Docker 构建超时或失败

#### 解决方案
本地构建前端,只上传构建产物:
- ✅ 构建时间从 5-10 分钟降到 1-2 分钟
- ✅ 不占用服务器资源
- ✅ 避免网络问题
- ✅ 部署成功率接近 100%

### Dockerfile 智能检测

Dockerfile 采用多阶段构建,支持预构建优化:

**前端智能构建** - 如果本地已构建 `dist` 目录则跳过:
```dockerfile
RUN if [ ! -d "dist" ]; then \
        echo "📦 未检测到预构建产物，开始构建前端..."; \
        npm ci && npm run build; \
    else \
        echo "✅ 检测到预构建产物，跳过前端构建"; \
    fi
```

**应用代码精确复制** - 避免 `COPY . .` 覆盖前端产物:
```dockerfile
# 逐目录复制应用代码
COPY src/ ./src/
COPY config/ ./config/
COPY web/ ./web/
# ... 其他目录

# 最后复制前端产物,确保不被覆盖
COPY --from=frontend-builder /app/web/admin-spa/dist /app/web/admin-spa/dist
```

**好处**:
- 本地构建后上传 → 跳过构建,快速部署
- 未构建直接部署 → 自动构建,兼容旧流程
- 精确复制避免前端产物被覆盖

---

## 🔄 快速更新

### 仅更新后端代码

如果只修改了后端代码,不需要重新构建 Docker:

```bash
# 上传单个文件
scp src/services/xxx.js cloud-server:/www/wwwroot/claude-relay-service/src/services/

# 重启容器
ssh cloud-server "cd /www/wwwroot/claude-relay-service/deploy && docker-compose -f docker-compose.prod.yml restart claude-relay"
```

### 更新配置文件

```bash
# 上传配置
scp deploy/.env cloud-server:/www/wwwroot/claude-relay-service/deploy/

# 重启服务
ssh cloud-server "cd /www/wwwroot/claude-relay-service/deploy && docker-compose -f docker-compose.prod.yml restart"
```

---

## ❓ 常见问题

### Q1: 部署脚本执行失败?

**检查清单**:
1. SSH 配置是否正确
   ```bash
   ssh cloud-server
   ```
2. 本地是否安装 Node.js
   ```bash
   node --version
   ```
3. Git Bash 是否安装(Windows)

### Q2: 前端构建失败?

**解决方案**:
```bash
# 清理缓存重新构建
cd web/admin-spa
rm -rf node_modules dist
npm install
npm run build
```

### Q3: Docker 构建超时?

**原因**: 服务器网络问题或资源不足

**解决方案**: 使用本地构建前端,避免服务器构建

### Q4: 服务启动失败?

**检查步骤**:
```bash
# 1. 查看日志
ssh cloud-server "cd /www/wwwroot/claude-relay-service/deploy && docker-compose -f docker-compose.prod.yml logs -f"

# 2. 检查环境变量
ssh cloud-server "cat /www/wwwroot/claude-relay-service/deploy/.env"

# 3. 检查容器状态
ssh cloud-server "docker ps -a | grep claude-relay"
```

### Q5: 如何回滚到之前的版本?

```bash
ssh cloud-server << 'EOF'
  cd /www/wwwroot
  # 查看备份
  ls -lh backup-*.tar.gz
  
  # 恢复备份(替换时间戳)
  cd claude-relay-service
  tar -xzf ../backup-20260209-120000.tar.gz
  
  # 重启服务
  cd deploy
  docker-compose -f docker-compose.prod.yml restart
EOF
```

---

## 📊 部署后验证

### 1. 检查服务状态

```bash
ssh cloud-server "cd /www/wwwroot/claude-relay-service/deploy && docker-compose -f docker-compose.prod.yml ps"
```

预期输出:
```
NAME                          STATUS              PORTS
claude-relay-service          Up (healthy)        0.0.0.0:7250->3000/tcp
claude-relay-redis            Up (healthy)        6379/tcp
clash-proxy                   Up                  7890-7891/tcp
```

### 2. 健康检查

```bash
ssh cloud-server "curl -s http://localhost:7250/health | python3 -m json.tool"
```

预期输出:
```json
{
  "status": "healthy",
  "service": "claude-relay-service",
  "version": "1.1.261",
  "components": {
    "redis": {
      "status": "healthy",
      "connected": true
    }
  }
}
```

### 3. 查看日志

```bash
ssh cloud-server "cd /www/wwwroot/claude-relay-service/deploy && docker-compose -f docker-compose.prod.yml logs -f claude-relay"
```

---

---

## 🔄 Clash 订阅自动更新

本项目包含 Clash 订阅自动更新功能,可以自动下载订阅、过滤高倍率节点并选择最快节点。

### 手动更新

```bash
ssh cloud-server "cd /www/wwwroot/claude-relay-service/deploy && ./update_subscription.sh"
```

### 自动更新

服务器已配置定时任务,每天凌晨 4 点自动更新:
```bash
0 4 * * * /bin/bash /www/wwwroot/claude-relay-service/deploy/update_subscription.sh >> /tmp/clash_update.log 2>&1
```

### 查看日志

```bash
ssh cloud-server "tail -f /tmp/clash_update.log"
```

### 详细配置

请参考 [deploy/README.md](./deploy/README.md) 查看详细的配置说明和自定义过滤规则。

---

## 🧹 服务器维护

### Docker 清理

> [!IMPORTANT]
> 部署脚本已自动包含清理步骤。如果磁盘空间紧张，可手动执行以下命令：

```bash
# 清理悬空镜像（每次 build 后残留的旧镜像层）
ssh cloud-server "docker image prune -f"

# 清理构建缓存（保留 1GB 加速后续构建）
ssh cloud-server "docker builder prune -f --keep-storage=1GB"

# 清理系统日志（保留最近 3 天）
ssh cloud-server "journalctl --vacuum-time=3d"

# 查看磁盘使用情况
ssh cloud-server "df -h / && docker system df"
```

### Docker 日志限制

确保 `/etc/docker/daemon.json` 包含日志限制配置，防止容器日志无限增长：

```json
{
  "registry-mirrors": ["https://mirror.ccs.tencentyun.com"],
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
```

---

## 🛠️ 高级配置

### 自定义部署脚本

### 自定义部署脚本

可以修改 `deploy/deploy.sh` 或 `deploy/deploy.ps1` 来:
- 修改服务器地址
- 修改部署路径
- 添加自定义步骤
- 修改打包排除规则

### CI/CD 集成

可以将部署脚本集成到 CI/CD 流程:

```yaml
# .github/workflows/deploy.yml
name: Deploy to Server

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Setup Node.js
        uses: actions/setup-node@v2
        with:
          node-version: '18'
      - name: Deploy
        run: ./deploy/deploy.sh
```

---

## 📚 相关文档

- [AGENTS.md](./AGENTS.md) - AI Agents 开发指南
- [README.md](./README.md) - 项目说明
- [deploy/README.md](./deploy/README.md) - 生产部署配置说明

---

**最后更新**: 2026-02-11  
**维护者**: Development Team
