# Claude Relay Service 自动部署指南

本指南介绍如何配置自动部署，实现代码推送后服务器自动更新。

## 📋 目录

- [方案概述](#方案概述)
- [前置要求](#前置要求)
- [配置步骤](#配置步骤)
- [使用方式](#使用方式)
- [故障排除](#故障排除)
- [高级配置](#高级配置)

---

## 🎯 方案概述

**部署流程**：
```
开发者推送代码到 GitHub
    ↓
GitHub Actions 自动触发
    ↓
通过 SSH 连接到服务器
    ↓
执行服务器端部署脚本
    ↓
自动备份 → 拉取代码 → 安装依赖 → 重启服务
    ↓
健康检查 → 部署完成
```

**优势**：
- ✅ 零停机时间（优雅重启）
- ✅ 自动备份（失败可回滚）
- ✅ 健康检查（确保服务正常）
- ✅ 智能依赖安装（检测变化）
- ✅ 前端自动构建
- ✅ 日志记录详细

---

## 🔧 前置要求

### 1. 服务器要求

- **操作系统**：Ubuntu 18.04+ / Debian 10+ / CentOS 7+
- **Node.js**：v18.0.0+
- **Git**：已安装并配置
- **Redis**：已运行
- **服务**：已通过 `npm run setup` 初始化

### 2. GitHub 仓库

- 拥有仓库的推送权限
- 可以配置 Secrets

---

## 🚀 配置步骤

### 步骤 1: 服务器端配置

#### 1.1 创建部署用户（推荐）

```bash
# 创建专用部署用户
sudo useradd -m -s /bin/bash deploy
sudo usermod -aG sudo deploy

# 切换到部署用户
sudo su - deploy
```

#### 1.2 克隆代码到服务器

```bash
# 克隆仓库（如果还没有）
cd /home/deploy  # 或你的项目目录
git clone https://github.com/your-username/claude-relay-service.git
cd claude-relay-service

# 安装依赖并初始化
npm install
npm run install:web
npm run setup

# 首次启动服务
npm run service:start:daemon
```

#### 1.3 生成 SSH 密钥对

```bash
# 在你的本地电脑生成 SSH 密钥对（如果还没有）
ssh-keygen -t ed25519 -C "deploy@claude-relay" -f ~/.ssh/claude-deploy

# 这会生成两个文件：
#   ~/.ssh/claude-deploy      (私钥 - 用于 GitHub Secrets)
#   ~/.ssh/claude-deploy.pub  (公钥 - 添加到服务器)
```

#### 1.4 添加公钥到服务器

```bash
# 在服务器上（以 deploy 用户）
mkdir -p ~/.ssh
chmod 700 ~/.ssh

# 将公钥内容添加到 authorized_keys
# 方法1：从本地复制
# 在本地执行：
cat ~/.ssh/claude-deploy.pub | ssh deploy@your-server "cat >> ~/.ssh/authorized_keys"

# 方法2：手动添加
# 在服务器上执行：
nano ~/.ssh/authorized_keys
# 粘贴公钥内容（claude-deploy.pub 的内容）

# 设置权限
chmod 600 ~/.ssh/authorized_keys
```

#### 1.5 测试 SSH 连接

```bash
# 在本地测试连接
ssh -i ~/.ssh/claude-deploy deploy@your-server-ip

# 成功连接后退出
exit
```

---

### 步骤 2: GitHub 配置

#### 2.1 添加 GitHub Secrets

进入你的 GitHub 仓库：`Settings` → `Secrets and variables` → `Actions` → `New repository secret`

添加以下 Secrets：

| Secret 名称 | 说明 | 示例 |
|------------|------|------|
| `SSH_HOST` | 服务器 IP 地址或域名 | `123.456.789.0` 或 `example.com` |
| `SSH_USER` | SSH 用户名 | `deploy` |
| `SSH_PRIVATE_KEY` | SSH 私钥（完整内容） | `cat ~/.ssh/claude-deploy` 的输出 |
| `SSH_PORT` | SSH 端口（可选，默认 22） | `22` |
| `DEPLOY_PATH` | 项目在服务器上的路径 | `/home/deploy/claude-relay-service` |

**获取私钥内容**：
```bash
# 在本地执行
cat ~/.ssh/claude-deploy
```

复制完整输出（包括 `-----BEGIN OPENSSH PRIVATE KEY-----` 和 `-----END OPENSSH PRIVATE KEY-----`）

#### 2.2 可选：Telegram 通知

如需部署完成后接收 Telegram 通知，添加以下 Secrets：

| Secret 名称 | 说明 | 获取方式 |
|------------|------|---------|
| `TELEGRAM_BOT_TOKEN` | Telegram Bot Token | 通过 [@BotFather](https://t.me/botfather) 创建 |
| `TELEGRAM_CHAT_ID` | Telegram Chat ID | 通过 [@userinfobot](https://t.me/userinfobot) 获取 |

---

### 步骤 3: 验证配置

#### 3.1 检查 workflow 文件

确认以下文件存在：
- `.github/workflows/auto-deploy.yml` - GitHub Actions 配置
- `scripts/deploy.sh` - 服务器端部署脚本

#### 3.2 测试部署脚本

在服务器上手动测试：

```bash
cd /home/deploy/claude-relay-service
bash scripts/deploy.sh
```

如果成功，应该看到：
```
✅ 部署完成！
🎉 部署成功完成！
```

---

## 📦 使用方式

### 自动部署（推荐）

只需正常推送代码到 `main` 分支：

```bash
git add .
git commit -m "feat: add new feature"
git push origin main
```

GitHub Actions 会自动：
1. 检测到推送
2. 连接服务器
3. 执行部署
4. 重启服务
5. 发送通知（如配置）

### 跳过自动部署

如果某次提交不想触发部署，在 commit message 中加入 `[skip deploy]`：

```bash
git commit -m "docs: update README [skip deploy]"
git push origin main
```

### 手动触发部署

1. 进入 GitHub 仓库
2. 点击 `Actions` 标签
3. 选择 `Auto Deploy to Server`
4. 点击 `Run workflow` → `Run workflow`

---

## 🔍 监控和日志

### 查看 GitHub Actions 日志

1. 进入仓库 `Actions` 标签
2. 点击对应的 workflow run
3. 查看详细部署日志

### 查看服务器日志

```bash
# 查看服务状态
npm run service:status

# 查看服务日志
npm run service:logs

# 实时跟踪日志
npm run service:logs:follow

# 查看应用日志文件
tail -f logs/claude-relay-*.log
```

### 检查服务健康

```bash
# 本地检查
curl http://localhost:3000/health

# 远程检查（替换为你的服务器地址）
curl http://your-server-ip:3000/health
```

---

## 🛠️ 故障排除

### 问题 1: SSH 连接失败

**错误信息**：
```
Permission denied (publickey)
```

**解决方案**：
```bash
# 1. 检查公钥是否添加到服务器
cat ~/.ssh/authorized_keys  # 在服务器上

# 2. 检查权限
chmod 700 ~/.ssh
chmod 600 ~/.ssh/authorized_keys

# 3. 检查 GitHub Secret 中的私钥格式
#    确保包含完整的 BEGIN 和 END 行

# 4. 测试 SSH 连接
ssh -i ~/.ssh/claude-deploy deploy@your-server-ip -v
```

### 问题 2: 部署脚本失败

**查看详细错误**：
```bash
# 在服务器上手动运行
cd /home/deploy/claude-relay-service
bash -x scripts/deploy.sh  # -x 参数显示详细执行过程
```

**常见错误**：

1. **Git pull 失败**
   ```bash
   # 重置 git 状态
   git reset --hard origin/main
   ```

2. **npm install 失败**
   ```bash
   # 清理并重新安装
   rm -rf node_modules package-lock.json
   npm install
   ```

3. **服务启动失败**
   ```bash
   # 查看错误日志
   npm run service:logs

   # 检查端口占用
   lsof -i :3000
   ```

### 问题 3: 健康检查失败

**原因**：
- 服务启动慢
- 端口被占用
- Redis 未运行

**解决方案**：
```bash
# 1. 检查服务状态
npm run service:status

# 2. 检查 Redis
redis-cli ping  # 应返回 PONG

# 3. 检查端口
netstat -tlnp | grep 3000

# 4. 查看详细日志
tail -f logs/claude-relay-*.log
```

### 问题 4: 权限错误

```bash
# 确保部署脚本可执行
chmod +x scripts/deploy.sh

# 确保项目目录所有者正确
sudo chown -R deploy:deploy /home/deploy/claude-relay-service
```

---

## 🎨 高级配置

### 1. 部署到多个分支

编辑 `.github/workflows/auto-deploy.yml`：

```yaml
on:
  push:
    branches:
      - main      # 生产环境
      - staging   # 预发布环境
      - dev       # 开发环境
```

然后使用不同的 Secrets 配置不同的服务器。

### 2. 部署前运行测试

在 `.github/workflows/auto-deploy.yml` 中添加：

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '18'
      - run: npm ci
      - run: npm test
      - run: npm run lint

  deploy:
    needs: test  # 测试通过后才部署
    runs-on: ubuntu-latest
    # ... 部署步骤
```

### 3. 蓝绿部署

修改 `scripts/deploy.sh`，支持蓝绿部署：

```bash
# 在不同端口启动新版本
# 测试通过后切换 Nginx 代理
# 停止旧版本
```

### 4. 回滚到上一个版本

```bash
# 在服务器上
cd /home/deploy/claude-relay-service

# 查看备份
ls -lh backups/

# 回滚到指定备份
tar -xzf backups/backup_20240115_143022.tar.gz -C .
npm run service:restart:daemon
```

### 5. 定时健康检查

添加 cron 任务：

```bash
# 编辑 crontab
crontab -e

# 添加每 5 分钟检查一次
*/5 * * * * curl -sf http://localhost:3000/health || /home/deploy/claude-relay-service/scripts/deploy.sh
```

### 6. Webhook 部署通知

修改 `scripts/deploy.sh` 末尾：

```bash
# 发送部署通知到你的 webhook
curl -X POST "https://your-webhook-url.com/deploy" \
  -H "Content-Type: application/json" \
  -d '{
    "service": "claude-relay",
    "status": "success",
    "version": "'$(git rev-parse --short HEAD)'",
    "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"
  }'
```

---

## 📚 相关文档

- [GitHub Actions 文档](https://docs.github.com/en/actions)
- [SSH Action 文档](https://github.com/appleboy/ssh-action)
- [项目主文档](../README.md)
- [CLAUDE.md 开发指南](../CLAUDE.md)

---

## ❓ 常见问题

**Q: 部署会导致服务中断吗？**
A: 不会。`npm run service:restart:daemon` 会优雅重启，新请求会等待新进程启动。

**Q: 如果部署失败会怎样？**
A: 脚本会自动从备份恢复，并返回错误状态。

**Q: 可以部署到多台服务器吗？**
A: 可以。复制 deploy job 并使用不同的 Secrets。

**Q: 支持 Docker 部署吗？**
A: 本方案针对非 Docker 部署。Docker 部署请参考 `auto-release-pipeline.yml`。

**Q: 如何查看部署历史？**
A: GitHub Actions 标签页可以查看所有部署记录。

---

## 🎉 完成

现在你已经配置好自动部署！每次推送代码，服务器都会自动更新。

**测试一下**：
```bash
# 做一个小改动
echo "# Test Auto Deploy" >> test.txt
git add test.txt
git commit -m "test: auto deploy"
git push origin main

# 观察 GitHub Actions 和服务器日志
```

祝部署顺利！🚀
