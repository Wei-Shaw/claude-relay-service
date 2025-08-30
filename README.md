# Claude Relay Service

<div align="center">

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![Redis](https://img.shields.io/badge/Redis-6+-red.svg)](https://redis.io/)
[![Docker](https://img.shields.io/badge/Docker-Ready-blue.svg)](https://www.docker.com/)
[![Docker Build](https://github.com/Wei-Shaw/claude-relay-service/actions/workflows/auto-release-pipeline.yml/badge.svg)](https://github.com/Wei-Shaw/claude-relay-service/actions/workflows/auto-release-pipeline.yml)
[![Docker Pulls](https://img.shields.io/docker/pulls/weishaw/claude-relay-service)](https://hub.docker.com/r/weishaw/claude-relay-service)

**🔐 自行搭建Claude API中转服务，支持多账户管理**

[English](#english) • [中文文档](#中文文档) • [📸 界面预览](docs/preview.md) • [📢 公告频道](https://t.me/claude_relay_service)

</div>

---

## ⭐ 如果觉得有用，点个Star支持一下吧！

> 开源不易，你的Star是我持续更新的动力 🚀  
> 欢迎加入 [Telegram 公告频道](https://t.me/claude_relay_service) 获取最新动态

---

## ⚠️ 重要提醒

**使用本项目前请仔细阅读：**

🚨 **服务条款风险**: 使用本项目可能违反Anthropic的服务条款。请在使用前仔细阅读Anthropic的用户协议，使用本项目的一切风险由用户自行承担。

📖 **免责声明**: 本项目仅供技术学习和研究使用，作者不对因使用本项目导致的账户封禁、服务中断或其他损失承担任何责任。


## 🤔 这个项目适合你吗？

- 🌍 **地区限制**: 所在地区无法直接访问Claude Code服务？
- 🔒 **隐私担忧**: 担心第三方镜像服务会记录或泄露你的对话内容？
- 👥 **成本分摊**: 想和朋友一起分摊Claude Code Max订阅费用？
- ⚡ **稳定性**: 第三方镜像站经常故障不稳定，影响效率 ？

如果有以上困惑，那这个项目可能适合你。

> 💡 **热心网友福利**  
> 热心网友正在用本项目，正在拼车官方Claude Code Max 20X 200刀版本，是现在最稳定的方案。  
> 有需要自取: [https://ctok.ai/](https://ctok.ai/)

### 适合的场景

✅ **找朋友拼车**: 三五好友一起分摊Claude Code Max订阅，Opus爽用  
✅ **隐私敏感**: 不想让第三方镜像看到你的对话内容  
✅ **技术折腾**: 有基本的技术基础，愿意自己搭建和维护  
✅ **稳定需求**: 需要长期稳定的Claude访问，不想受制于镜像站  
✅ **地区受限**: 无法直接访问Claude官方服务

### 不适合的场景

❌ **纯小白**: 完全不懂技术，连服务器都不会买  
❌ **偶尔使用**: 一个月用不了几次，没必要折腾  
❌ **注册问题**: 无法自行注册Claude账号  
❌ **支付问题**: 没有支付渠道订阅Claude Code

**如果你只是普通用户，对隐私要求不高，随便玩玩、想快速体验 Claude，那选个你熟知的镜像站会更合适。**

---

## 💭 为什么要自己搭？

### 现有镜像站可能的问题

- 🕵️ **隐私风险**: 你的对话内容都被人家看得一清二楚，商业机密什么的就别想了
- 🐌 **性能不稳**: 用的人多了就慢，高峰期经常卡死
- 💰 **价格不透明**: 不知道实际成本

### 自建的好处

- 🔐 **数据安全**: 所有接口请求都只经过你自己的服务器，直连Anthropic API
- ⚡ **性能可控**: 就你们几个人用，Max 200刀套餐基本上可以爽用Opus
- 💰 **成本透明**: 用了多少token一目了然，按官方价格换算了具体费用
- 📊 **监控完整**: 使用情况、成本分析、性能监控全都有

---

## 🚀 核心功能

> 📸 **[点击查看界面预览](docs/preview.md)** - 查看Web管理界面的详细截图

### 基础功能

- ✅ **多账户管理**: 可以添加多个Claude账户自动轮换
- ✅ **自定义API Key**: 给每个人分配独立的Key
- ✅ **使用统计**: 详细记录每个人用了多少token

### 高级功能

- 🔄 **智能切换**: 账户出问题自动换下一个
- 🚀 **性能优化**: 连接池、缓存，减少延迟
- 📊 **监控面板**: Web界面查看所有数据
- 🛡️ **安全控制**: 访问限制、速率控制、客户端限制
- 🌐 **代理支持**: 支持HTTP/SOCKS5代理

---

## 📋 部署要求

### 硬件要求（最低配置）

- **CPU**: 1核心就够了
- **内存**: 512MB（建议1GB）
- **硬盘**: 30GB可用空间
- **网络**: 能访问到Anthropic API（建议使用US地区的机器）
- **建议**: 2核4G的基本够了，网络尽量选回国线路快一点的（为了提高速度，建议不要开代理或者设置服务器的IP直连）
- **经验**: 阿里云、腾讯云的海外主机经测试会被Cloudflare拦截，无法直接访问claude api

### 软件要求

- **Node.js** 18或更高版本
- **Redis** 6或更高版本
- **操作系统**: 建议Linux

### 费用估算

- **服务器**: 轻量云服务器，一个月30-60块
- **Claude订阅**: 看你怎么分摊了
- **其他**: 域名（可选）

---

## 🚀 脚本部署（推荐）

推荐使用管理脚本进行一键部署，简单快捷，自动处理所有依赖和配置。

### 快速安装

```bash
# 下载并运行管理脚本
curl -fsSL https://raw.githubusercontent.com/Wei-Shaw/claude-relay-service/main/scripts/manage.sh -o manage.sh
chmod +x manage.sh
./manage.sh install

# 安装后可以使用 crs 命令管理服务
crs  # 显示交互式菜单
```

### 脚本功能

- ✅ **一键安装**: 自动检测系统环境，安装 Node.js 18+、Redis 等依赖
- ✅ **交互式配置**: 友好的配置向导，设置端口、Redis 连接等
- ✅ **自动启动**: 安装完成后自动启动服务并显示访问地址
- ✅ **便捷管理**: 通过 `crs` 命令随时管理服务状态

### 管理命令

```bash
crs install   # 安装服务
crs start     # 启动服务
crs stop      # 停止服务
crs restart   # 重启服务
crs status    # 查看状态
crs update    # 更新服务
crs uninstall # 卸载服务
```

### 安装示例

```bash
$ crs install

# 会依次询问：
安装目录 (默认: ~/claude-relay-service):
服务端口 (默认: 3000): 8080
Redis 地址 (默认: localhost):
Redis 端口 (默认: 6379):
Redis 密码 (默认: 无密码):

# 安装完成后自动启动并显示：
服务已成功安装并启动！

访问地址：
  本地 Web: http://localhost:8080/web
  公网 Web: http://YOUR_IP:8080/web

管理员账号信息已保存到: data/init.json
```

### 系统要求

- 支持系统: Ubuntu/Debian、CentOS/RedHat、Arch Linux、macOS
- 自动安装 Node.js 18+ 和 Redis
- Redis 使用系统默认位置，数据独立于应用

---

## 📦 手动部署

### 第一步：环境准备

**Ubuntu/Debian用户：**

```bash
# 安装Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 安装Redis
sudo apt update
sudo apt install redis-server
sudo systemctl start redis-server
```

**CentOS/RHEL用户：**

```bash
# 安装Node.js
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo yum install -y nodejs

# 安装Redis
sudo yum install redis
sudo systemctl start redis
```

### 第二步：下载和配置

```bash
# 下载项目
git clone https://github.com/Wei-Shaw//claude-relay-service.git
cd claude-relay-service

# 安装依赖
npm install

# 复制配置文件（重要！）
cp config/config.example.js config/config.js
cp .env.example .env
```

### 第三步：配置文件设置

**编辑 `.env` 文件：**

```bash
# 这两个密钥随便生成，但要记住
JWT_SECRET=你的超级秘密密钥
ENCRYPTION_KEY=32位的加密密钥随便写

# Redis配置
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# Webhook通知配置（可选）
WEBHOOK_ENABLED=true
WEBHOOK_URLS=https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=your-key
WEBHOOK_TIMEOUT=10000
WEBHOOK_RETRIES=3
```

**编辑 `config/config.js` 文件：**

```javascript
module.exports = {
  server: {
    port: 3000, // 服务端口，可以改
    host: '0.0.0.0' // 不用改
  },
  redis: {
    host: '127.0.0.1', // Redis地址
    port: 6379 // Redis端口
  }
  // 其他配置保持默认就行
}
```

### 第四步：安装前端依赖并构建

```bash
# 安装前端依赖
npm run install:web

# 构建前端（生成 dist 目录）
npm run build:web
```

### 第五步：启动服务

```bash
# 初始化
npm run setup # 会随机生成后台账号密码信息，存储在 data/init.json
# 或者通过环境变量预设管理员凭据：
# export ADMIN_USERNAME=cr_admin_custom
# export ADMIN_PASSWORD=your-secure-password

# 启动服务
npm run service:start:daemon   # 后台运行

# 查看状态
npm run service:status
```

---

## 🐳 Docker 部署

### 使用 Docker Hub 镜像（最简单）

> 🚀 使用官方镜像，自动构建，始终保持最新版本

```bash
# 拉取镜像（支持 amd64 和 arm64）
docker pull weishaw/claude-relay-service:latest

# 使用 docker-compose
# 创建 .env 文件用于 docker-compose 的环境变量：
cat > .env << 'EOF'
# 必填：安全密钥（请修改为随机值）
JWT_SECRET=your-random-secret-key-at-least-32-chars
ENCRYPTION_KEY=your-32-character-encryption-key

# 可选：管理员凭据
ADMIN_USERNAME=cr_admin
ADMIN_PASSWORD=your-secure-password
EOF

# 创建 docker-compose.yml 文件：
cat > docker-compose.yml << 'EOF'
version: '3.8'
services:
  claude-relay:
    image: weishaw/claude-relay-service:latest
    container_name: claude-relay-service
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - JWT_SECRET=${JWT_SECRET}
      - ENCRYPTION_KEY=${ENCRYPTION_KEY}
      - REDIS_HOST=redis
      - ADMIN_USERNAME=${ADMIN_USERNAME:-}
      - ADMIN_PASSWORD=${ADMIN_PASSWORD:-}
    volumes:
      - ./logs:/app/logs
      - ./data:/app/data
    depends_on:
      - redis

  redis:
    image: redis:7-alpine
    container_name: claude-relay-redis
    restart: unless-stopped
    volumes:
      - redis_data:/data

volumes:
  redis_data:
EOF

# 启动服务
docker-compose up -d
```

### Docker Compose 配置

docker-compose.yml 已包含：

- ✅ 自动初始化管理员账号
- ✅ 数据持久化（logs和data目录自动挂载）
- ✅ Redis数据库
- ✅ 健康检查
- ✅ 自动重启
- ✅ 所有配置通过环境变量管理

### 环境变量说明

#### 必填项

- `JWT_SECRET`: JWT密钥，至少32个字符
- `ENCRYPTION_KEY`: 加密密钥，必须是32个字符

#### 可选项

- `ADMIN_USERNAME`: 管理员用户名（不设置则自动生成）
- `ADMIN_PASSWORD`: 管理员密码（不设置则自动生成）
- `LOG_LEVEL`: 日志级别（默认：info）
- 更多配置项请参考 `.env.example` 文件

### 管理员凭据获取方式

1. **查看容器日志**

   ```bash
   docker logs claude-relay-service
   ```

2. **查看挂载的文件**

   ```bash
   cat ./data/init.json
   ```

3. **使用环境变量预设**
   ```bash
   # 在 .env 文件中设置
   ADMIN_USERNAME=cr_admin_custom
   ADMIN_PASSWORD=your-secure-password
   ```

---

## 🎮 开始使用

### 1. 打开管理界面

浏览器访问：`http://你的服务器IP:3000/web`

管理员账号：

- 自动生成：查看 data/init.json
- 环境变量预设：通过 ADMIN_USERNAME 和 ADMIN_PASSWORD 设置
- Docker 部署：查看容器日志 `docker logs claude-relay-service`

### 2. 添加Claude账户

这一步比较关键，需要OAuth授权：

1. 点击「Claude账户」标签
2. 如果你担心多个账号共用1个IP怕被封禁，可以选择设置静态代理IP（可选）
3. 点击「添加账户」
4. 点击「生成授权链接」，会打开一个新页面
5. 在新页面完成Claude登录和授权
6. 复制返回的Authorization Code
7. 粘贴到页面完成添加

**注意**: 如果你在国内，这一步可能需要科学上网。

### 3. 创建API Key

给每个使用者分配一个Key：

1. 点击「API Keys」标签
2. 点击「创建新Key」
3. 给Key起个名字，比如「张三的Key」
4. 设置使用限制（可选）：
   - **速率限制**: 限制每个时间窗口的请求次数和Token使用量
   - **并发限制**: 限制同时处理的请求数
   - **模型限制**: 限制可访问的模型列表
   - **客户端限制**: 限制只允许特定客户端使用（如ClaudeCode、Gemini-CLI等）
5. 保存，记下生成的Key

### 4. 开始使用 Claude Code 和 Gemini CLI

现在你可以用自己的服务替换官方API了：

**Claude Code 设置环境变量：**

```bash
export ANTHROPIC_BASE_URL="http://127.0.0.1:3000/api/" # 根据实际填写你服务器的ip地址或者域名
export ANTHROPIC_AUTH_TOKEN="后台创建的API密钥"
```

**Gemini CLI 设置环境变量：**

```bash
export CODE_ASSIST_ENDPOINT="http://127.0.0.1:3000/gemini" # 根据实际填写你服务器的ip地址或者域名
export GOOGLE_CLOUD_ACCESS_TOKEN="后台创建的API密钥"  # 使用相同的API密钥即可
export GOOGLE_GENAI_USE_GCA="true"
```

**使用 Claude Code：**

```bash
claude
```

**使用 Gemini CLI：**

```bash
gemini  # 或其他 Gemini CLI 命令
```

**Codex 设置环境变量：**

```bash
export OPENAI_BASE_URL="http://127.0.0.1:3000/openai" # 根据实际填写你服务器的ip地址或者域名
export OPENAI_API_KEY="后台创建的API密钥"  # 使用后台创建的API密钥
```

### 5. 第三方工具API接入

本服务支持多种API端点格式，方便接入不同的第三方工具（如Cherry Studio等）：

**Claude标准格式：**

```
# 如果工具支持Claude标准格式，请使用该接口
http://你的服务器:3000/claude/
```

**OpenAI兼容格式：**

```
# 适用于需要OpenAI格式的第三方工具
http://你的服务器:3000/openai/claude/v1/
```

**接入示例：**

- **Cherry Studio**: 使用OpenAI格式 `http://你的服务器:3000/openai/claude/v1/` 使用Codex cli API `http://你的服务器:3000/openai/responses`
- **其他支持自定义API的工具**: 根据工具要求选择合适的格式

**重要说明：**

- 所有格式都支持相同的功能，仅是路径不同
- `/api/v1/messages` = `/claude/v1/messages` = `/openai/claude/v1/messages`
- 选择适合你使用工具的格式即可
- 支持所有Claude API端点（messages、models等）

---

## 📢 Webhook 通知功能

### 功能说明

当系统检测到账号异常时，会自动发送 webhook 通知，支持企业微信、钉钉、Slack 等平台。

### 通知触发场景

- **Claude OAuth 账户**: token 过期或未授权时
- **Claude Console 账户**: 系统检测到账户被封锁时
- **Gemini 账户**: token 刷新失败时
- **手动禁用账户**: 管理员手动禁用账户时

### 配置方法

**1. 环境变量配置**

```bash
# 启用 webhook 通知
WEBHOOK_ENABLED=true

# 企业微信 webhook 地址（替换为你的实际地址）
WEBHOOK_URLS=https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=your-key

# 多个地址用逗号分隔
WEBHOOK_URLS=https://webhook1.com,https://webhook2.com

# 请求超时时间（毫秒，默认10秒）
WEBHOOK_TIMEOUT=10000

# 重试次数（默认3次）
WEBHOOK_RETRIES=3
```

**2. 企业微信设置**

1. 在企业微信群中添加「群机器人」
2. 获取 webhook 地址：`https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxx`
3. 将地址配置到 `WEBHOOK_URLS` 环境变量

### 通知内容格式

系统会发送结构化的通知消息：

```
账户名称 账号异常，异常代码 ERROR_CODE
平台：claude-oauth
时间：2025-08-14 17:30:00
原因：Token expired
```

### 测试 Webhook

可以通过管理后台测试 webhook 连通性：

1. 登录管理后台：`http://你的服务器:3000/web`
2. 访问：`/admin/webhook/test`
3. 发送测试通知确认配置正确

---

## 🔧 日常维护

### 服务管理

```bash
# 查看服务状态
npm run service:status

# 查看日志
npm run service:logs

# 重启服务
npm run service:restart:daemon

# 停止服务
npm run service:stop
```

### 监控使用情况

- **Web界面**: `http://你的域名:3000/web` - 查看使用统计
- **健康检查**: `http://你的域名:3000/health` - 确认服务正常
- **日志文件**: `logs/` 目录下的各种日志文件

### 升级指南

当有新版本发布时，按照以下步骤升级服务：

```bash
# 1. 进入项目目录
cd claude-relay-service

# 2. 拉取最新代码
git pull origin main

# 如果遇到 package-lock.json 冲突，使用远程版本
git checkout --theirs package-lock.json
git add package-lock.json

# 3. 安装新的依赖（如果有）
npm install

# 4. 安装并构建前端
npm run install:web
npm run build:web

# 5. 重启服务
npm run service:restart:daemon

# 6. 检查服务状态
npm run service:status
```

**注意事项：**

- 升级前建议备份重要配置文件（.env, config/config.js）
- 查看更新日志了解是否有破坏性变更
- 如果有数据库结构变更，会自动迁移

---

## 🔒 客户端限制功能

### 功能说明

客户端限制功能允许你控制每个API Key可以被哪些客户端使用，通过User-Agent识别客户端，提高API的安全性。

### 使用方法

1. **在创建或编辑API Key时启用客户端限制**：
   - 勾选"启用客户端限制"
   - 选择允许的客户端（支持多选）

2. **预定义客户端**：
   - **ClaudeCode**: 官方Claude CLI（匹配 `claude-cli/x.x.x (external, cli)` 格式）
   - **Gemini-CLI**: Gemini命令行工具（匹配 `GeminiCLI/vx.x.x (platform; arch)` 格式）

3. **调试和诊断**：
   - 系统会在日志中记录所有请求的User-Agent
   - 客户端验证失败时会返回403错误并记录详细信息
   - 通过日志可以查看实际的User-Agent格式，方便配置自定义客户端

### 自定义客户端配置

如需添加自定义客户端，可以修改 `config/config.js` 文件：

```javascript
clientRestrictions: {
  predefinedClients: [
    // ... 现有客户端配置
    {
      id: 'my_custom_client',
      name: 'My Custom Client',
      description: '我的自定义客户端',
      userAgentPattern: /^MyClient\/[\d\.]+/i
    }
  ]
}
```

### 日志示例

认证成功时的日志：

```
🔓 Authenticated request from key: 测试Key (key-id) in 5ms
   User-Agent: "claude-cli/1.0.58 (external, cli)"
```

客户端限制检查日志：

```
🔍 Checking client restriction for key: key-id (测试Key)
   User-Agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
   Allowed clients: claude_code, gemini_cli
🚫 Client restriction failed for key: key-id (测试Key) from 127.0.0.1, User-Agent: Mozilla/5.0...
```

### 常见问题处理

**Redis连不上？**

```bash
# 检查Redis是否启动
redis-cli ping

# 应该返回 PONG
```

**OAuth授权失败？**

- 检查代理设置是否正确
- 确保能正常访问 claude.ai
- 清除浏览器缓存重试

**API请求失败？**

- 检查API Key是否正确
- 查看日志文件找错误信息
- 确认Claude账户状态正常

---

## 🛠️ 进阶

### 生产环境部署建议（重要！）

**强烈建议使用Caddy反向代理（自动HTTPS）**

建议使用Caddy作为反向代理，它会自动申请和更新SSL证书，配置更简单：

**1. 安装Caddy**

```bash
# Ubuntu/Debian
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install caddy

# CentOS/RHEL/Fedora
sudo yum install yum-plugin-copr
sudo yum copr enable @caddy/caddy
sudo yum install caddy
```

**2. Caddy配置（超简单！）**

编辑 `/etc/caddy/Caddyfile`：

```
your-domain.com {
    # 反向代理到本地服务
    reverse_proxy 127.0.0.1:3000 {
        # 支持流式响应（SSE）
        flush_interval -1

        # 传递真实IP
        header_up X-Real-IP {remote_host}
        header_up X-Forwarded-For {remote_host}
        header_up X-Forwarded-Proto {scheme}

        # 超时设置（适合长连接）
        transport http {
            read_timeout 300s
            write_timeout 300s
            dial_timeout 30s
        }
    }

    # 安全头部
    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        X-Frame-Options "DENY"
        X-Content-Type-Options "nosniff"
        -Server
    }
}
```

**3. 启动Caddy**

```bash
# 测试配置
sudo caddy validate --config /etc/caddy/Caddyfile

# 启动服务
sudo systemctl start caddy
sudo systemctl enable caddy

# 查看状态
sudo systemctl status caddy
```

**4. 更新服务配置**

修改你的服务配置，让它只监听本地：

```javascript
// config/config.js
module.exports = {
  server: {
    port: 3000,
    host: '127.0.0.1' // 只监听本地，通过nginx代理
  }
  // ... 其他配置
}
```

**Caddy优势：**

- 🔒 **自动HTTPS**: 自动申请和续期Let's Encrypt证书，零配置
- 🛡️ **安全默认**: 默认启用现代安全协议和加密套件
- 🚀 **流式支持**: 原生支持SSE/WebSocket等流式传输
- 📊 **简单配置**: 配置文件极其简洁，易于维护
- ⚡ **HTTP/2**: 默认启用HTTP/2，提升传输性能

---

## 💡 使用建议

### 账户管理

- **定期检查**: 每周看看账户状态，及时处理异常
- **合理分配**: 可以给不同的人分配不同的apikey，可以根据不同的apikey来分析用量

### 安全建议

- **使用HTTPS**: 强烈建议使用Caddy反向代理（自动HTTPS），确保数据传输安全
- **定期备份**: 重要配置和数据要备份
- **监控日志**: 定期查看异常日志
- **更新密钥**: 定期更换JWT和加密密钥
- **防火墙设置**: 只开放必要的端口（80, 443），隐藏直接服务端口

---

## 🆘 遇到问题怎么办？

### 自助排查

1. **查看日志**: `logs/` 目录下的日志文件
2. **检查配置**: 确认配置文件设置正确
3. **测试连通性**: 用 curl 测试API是否正常
4. **重启服务**: 有时候重启一下就好了

### 寻求帮助

- **GitHub Issues**: 提交详细的错误信息
- **查看文档**: 仔细阅读错误信息和文档
- **社区讨论**: 看看其他人是否遇到类似问题

---

## 📄 许可证

本项目采用 [MIT许可证](LICENSE)。

---

<div align="center">

**⭐ 觉得有用的话给个Star呗，这是对作者最大的鼓励！**

**🤝 有问题欢迎提Issue，有改进建议欢迎PR**

</div>
