# Claude Relay Service

> [!CAUTION]
> **安全更新通知**：v1.1.248 及以下版本存在严重的管理员认证绕过漏洞，攻击者可未授权访问管理面板。
>
> **请立即更新到 v1.1.249+ 版本**，或迁移到新一代项目 **[CRS 2.0 (sub2api)](https://github.com/Wei-Shaw/sub2api)**

<div align="center">

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![Redis](https://img.shields.io/badge/Redis-6+-red.svg)](https://redis.io/)
[![Docker](https://img.shields.io/badge/Docker-Ready-blue.svg)](https://www.docker.com/)
[![Docker Build](https://github.com/Wei-Shaw/claude-relay-service/actions/workflows/auto-release-pipeline.yml/badge.svg)](https://github.com/Wei-Shaw/claude-relay-service/actions/workflows/auto-release-pipeline.yml)
[![Docker Pulls](https://img.shields.io/docker/pulls/weishaw/claude-relay-service)](https://hub.docker.com/r/weishaw/claude-relay-service)

**🔐 自行搭建Claude API中转服务，支持多账户管理**

[English](README_EN.md) • [快速开始](https://pincc.ai/) • [演示站点](https://demo.pincc.ai/admin-next/login) • [公告频道](https://t.me/claude_relay_service)

</div>

---

## 💎 Claude/Codex 拼车服务推荐

<div align="center">

| 平台 | 服务 | 介绍 |
|:---|:---|:---|
| **[pincc.ai](https://pincc.ai/)** | <small>✅ Claude Code<br>✅ Codex CLI</small> | 提供稳定的 Codex CLI 拼车服务<br><br> **全新上线 2API 渠道**：接入CC的效果媲美官方 Anthropic Console 账号，暂不支持 PDF 识别功能 <br>💰 单价：0.8元=1美金额度 |


</div>

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

### 适合的场景

✅ **找朋友拼车**: 三五好友一起分摊Claude Code Max订阅  
✅ **隐私敏感**: 不想让第三方镜像看到你的对话内容  
✅ **技术折腾**: 有基本的技术基础，愿意自己搭建和维护  
✅ **稳定需求**: 需要长期稳定的Claude访问，不想受制于镜像站  
✅ **地区受限**: 无法直接访问Claude官方服务

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
curl -fsSL https://pincc.ai/manage.sh -o manage.sh && chmod +x manage.sh && ./manage.sh install
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

### Docker compose

#### 第一步：下载构建docker-compose.yml文件的脚本并执行
```bash
curl -fsSL https://pincc.ai/crs-compose.sh -o crs-compose.sh && chmod +x crs-compose.sh && ./crs-compose.sh
```

#### 第二步：启动
```bash
docker-compose up -d
```

### Docker Compose 配置

docker-compose.yml 已包含：

- ✅ 自动初始化管理员账号
- ✅ 数据持久化（logs和data目录自动挂载）
- ✅ Redis数据库
- ✅ 健康检查
- ✅ 自动重启

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

### 2.1 临时暂停（503/5xx）与账号级 TTL 覆盖

系统会在上游异常时临时暂停账号路由，默认由全局配置控制（见 `.env.example`）：

- `UPSTREAM_ERROR_503_TTL_SECONDS`
- `UPSTREAM_ERROR_5XX_TTL_SECONDS`
- `UPSTREAM_ERROR_OVERLOAD_TTL_SECONDS`
- `UPSTREAM_ERROR_AUTH_TTL_SECONDS`
- `UPSTREAM_ERROR_TIMEOUT_TTL_SECONDS`

在管理后台编辑 **Claude 官方 OAuth 账号** 时，可做账号级覆盖：

- `禁用该账号临时冷却`：该账号不再因 503/5xx 进入临时暂停
- `503 冷却秒数`：留空=跟随全局，`0`=关闭该账号 503 冷却
- `5xx 冷却秒数`：留空=跟随全局，`0`=关闭该账号 5xx 冷却

优先级从高到低：

1. 账号级“禁用临时冷却”
2. 账号级 503/5xx 冷却秒数
3. 代码调用时传入的自定义 TTL（若有）
4. 全局环境变量默认值

账户列表会显示“不可路由原因”，包含错误类型、HTTP 状态码、内部冷却总时长、剩余时间和预计恢复时间；点击 `重置状态` 可清除异常状态并恢复参与路由。

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


**使用标准 Claude 账号池**

默认使用标准 Claude 账号池：

```bash
export ANTHROPIC_BASE_URL="http://127.0.0.1:3000/api/" # 根据实际填写你服务器的ip地址或者域名
export ANTHROPIC_AUTH_TOKEN="后台创建的API密钥"
```

**使用 Antigravity 账户池**

适用于通过 Antigravity 渠道使用 Claude 模型（如 `claude-opus-4-5` 等）。

```bash
# 1. 设置 Base URL 为 Antigravity 专用路径
export ANTHROPIC_BASE_URL="http://127.0.0.1:3000/antigravity/api/"

# 2. 设置 API Key（在后台创建，权限需包含 'all' 或 'gemini'）
export ANTHROPIC_AUTH_TOKEN="后台创建的API密钥"

# 3. 指定模型名称（直接使用短名，无需前缀！）
export ANTHROPIC_MODEL="claude-opus-4-5"

# 4. 启动
claude
```

**VSCode Claude 插件配置：**

如果使用 VSCode 的 Claude 插件，需要在 `~/.claude/config.json` 文件中配置：

```json
{
    "primaryApiKey": "crs"
}
```

如果该文件不存在，请手动创建。Windows 用户路径为 `C:\Users\你的用户名\.claude\config.json`。

> 💡 **IntelliJ IDEA 用户推荐**：[Claude Code Plus](https://github.com/touwaeriol/claude-code-plus) - 将 Claude Code 直接集成到 IDE，支持代码理解、文件读写、命令执行。插件市场搜索 `Claude Code Plus` 即可安装。

**Gemini CLI 设置环境变量：**

**方式一（推荐）：通过 Gemini Assist API 方式访问**

```bash
CODE_ASSIST_ENDPOINT="http://127.0.0.1:3000/gemini"  # 根据实际填写你服务器的ip地址或者域名
GOOGLE_CLOUD_ACCESS_TOKEN="后台创建的API密钥"
GOOGLE_GENAI_USE_GCA="true"
GEMINI_MODEL="gemini-2.5-pro" # 如果你有gemini3权限可以填： gemini-3-pro-preview
```

> **认证**：只能选 ```Login with Google``` 进行认证，如果跳 Google请删除 ```~/.gemini/settings.json``` 后再尝试启动```gemini```。  
> **注意**：gemini-cli 控制台会提示 `Failed to fetch user info: 401 Unauthorized`，但使用不受任何影响。  

**方式二：通过 Gemini API 方式访问**


```bash
GOOGLE_GEMINI_BASE_URL="http://127.0.0.1:3000/gemini"  # 根据实际填写你服务器的ip地址或者域名
GEMINI_API_KEY="后台创建的API密钥"
GEMINI_MODEL="gemini-2.5-pro" # 如果你有gemini3权限可以填： gemini-3-pro-preview
```

> **认证**：只能选 ```Use Gemini API Key``` 进行认证，如果提示 ```Enter Gemini API Key``` 请直接留空按回车。如果一打开就跳 Google请删除 ```~/.gemini/settings.json``` 后再尝试启动```gemini```。

> 💡 **进阶用法**：想在 Claude Code 中直接使用 Gemini 3 模型？请参考 [Claude Code 调用 Gemini 3 模型指南](docs/claude-code-gemini3-guide/README.md)

**使用 Claude Code：**

```bash
claude
```

**使用 Gemini CLI：**

```bash
gemini  # 或其他 Gemini CLI 命令
```

**Codex 配置：**

在 `~/.codex/config.toml` 文件**开头**添加以下配置：

```toml
model_provider = "crs"
model = "gpt-5.1-codex-max"
model_reasoning_effort = "high"
disable_response_storage = true
preferred_auth_method = "apikey"

[model_providers.crs]
name = "crs"
base_url = "http://127.0.0.1:3000/openai"  # 根据实际填写你服务器的ip地址或者域名
wire_api = "responses"
requires_openai_auth = true
```

在 `~/.codex/auth.json` 文件中配置API密钥为 null：

```json
{
    "OPENAI_API_KEY": "后台创建的API密钥"  
}
```

> ⚠️ 在通过 Nginx 反向代理 CRS 服务并使用 Codex CLI 时，需要在 http 块中添加 underscores_in_headers on;。因为 Nginx 默认会移除带下划线的请求头（如 session_id），一旦该头被丢弃，多账号环境下的粘性会话功能将失效。

**Droid CLI 配置：**

Droid CLI 读取 `~/.factory/config.json`。可以在该文件中添加自定义模型以指向本服务的新端点：

```json
{
  "custom_models": [
    {
      "model_display_name": "Opus 4.5 [crs]",
      "model": "claude-opus-4-5-20251101",
      "base_url": "http://127.0.0.1:3000/droid/claude",
      "api_key": "后台创建的API密钥",
      "provider": "anthropic",
      "max_tokens": 64000
    },
    {
      "model_display_name": "GPT5-Codex [crs]",
      "model": "gpt-5-codex",
      "base_url": "http://127.0.0.1:3000/droid/openai",
      "api_key": "后台创建的API密钥",
      "provider": "openai",
      "max_tokens": 16384
    },
    {
      "model_display_name": "Gemini-3-Pro [crs]",
      "model": "gemini-3-pro-preview",
      "base_url": "http://127.0.0.1:3000/droid/comm/v1/",
      "api_key": "后台创建的API密钥",
      "provider": "generic-chat-completion-api",
      "max_tokens": 65535
    },
    {
      "model_display_name": "GLM-4.6 [crs]",
      "model": "glm-4.6",
      "base_url": "http://127.0.0.1:3000/droid/comm/v1/",
      "api_key": "后台创建的API密钥",
      "provider": "generic-chat-completion-api",
      "max_tokens": 202800
    }
  ]
}
```

> 💡 将示例中的 `http://127.0.0.1:3000` 替换为你的服务域名或公网地址，并写入后台生成的 API 密钥（cr_ 开头）。

### 5. 第三方工具API接入

本服务支持多种API端点格式，方便接入不同的第三方工具（如Cherry Studio等）。

#### Cherry Studio 接入示例

Cherry Studio支持多种AI服务的接入，下面是不同账号类型的详细配置：

**1. Claude账号接入：**

```
# API地址
http://你的服务器:3000/claude

# 模型ID示例
claude-sonnet-4-5-20250929 # Claude Sonnet 4.5
claude-opus-4-20250514     # Claude Opus 4
```

配置步骤：
- 供应商类型选择"Anthropic"
- API地址填入：`http://你的服务器:3000/claude`
- API Key填入：后台创建的API密钥（cr_开头）

**2. Gemini账号接入：**

```
# API地址
http://你的服务器:3000/gemini

# 模型ID示例
gemini-2.5-pro             # Gemini 2.5 Pro
```

配置步骤：
- 供应商类型选择"Gemini"
- API地址填入：`http://你的服务器:3000/gemini`
- API Key填入：后台创建的API密钥（cr_开头）

**3. Codex接入：**

```
# API地址
http://你的服务器:3000/openai

# 模型ID（固定）
gpt-5                      # Codex使用固定模型ID
```

配置步骤：
- 供应商类型选择"Openai-Response"
- API地址填入：`http://你的服务器:3000/openai`
- API Key填入：后台创建的API密钥（cr_开头）
- **重要**：Codex只支持Openai-Response标准


**Cherry Studio 地址格式重要说明：**

- ✅ **推荐格式**：`http://你的服务器:3000/claude`（不加结尾 `/`，让 Cherry Studio 自动加上 v1）
- ✅ **等效格式**：`http://你的服务器:3000/claude/v1/`（手动指定 v1 并加结尾 `/`）
- 💡 **说明**：这两种格式在 Cherry Studio 中是完全等效的
- ❌ **错误格式**：`http://你的服务器:3000/claude/`（单独的 `/` 结尾会被 Cherry Studio 忽略 v1 版本）

#### 其他第三方工具接入

**接入要点：**

- 所有账号类型都使用相同的API密钥（在后台统一创建）
- 根据不同的路由前缀自动识别账号类型
- `/claude/` - 使用Claude账号池
- `/antigravity/api/` - 使用Antigravity账号池（推荐用于Claude Code）
- `/droid/claude/` - 使用Droid类型Claude账号池（只建议api调用或Droid Cli中使用）
- `/gemini/` - 使用Gemini账号池
- `/openai/` - 使用Codex账号（只支持Openai-Response格式）
- `/droid/openai/` - 使用Droid类型OpenAI兼容账号池（只建议api调用或Droid Cli中使用）
- 支持所有标准API端点（messages、models等）

**重要说明：**

- 确保在后台已添加对应类型的账号（Claude/Gemini/Codex）
- API密钥可以通用，系统会根据路由自动选择账号类型
- 建议为不同用户创建不同的API密钥便于使用统计

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

### 反向代理部署指南

在生产环境中，建议通过反向代理进行连接，以便使用自动 HTTPS、安全头部和性能优化。下面提供两种常用方案： **Caddy** 和 **Nginx Proxy Manager (NPM)**。

---

## Caddy 方案

Caddy 是一款自动管理 HTTPS 证书的 Web 服务器，配置简单、性能优秀，很适合不需要 Docker 环境的部署方案。

**1. 安装 Caddy**

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

**2. Caddy 配置**

编辑 `/etc/caddy/Caddyfile` ：

```caddy
your-domain.com {
    # 反向代理到本地服务
    reverse_proxy 127.0.0.1:3000 {
        # 支持流式响应或 SSE
        flush_interval -1

        # 传递真实 IP
        header_up X-Real-IP {remote_host}
        header_up X-Forwarded-For {remote_host}
        header_up X-Forwarded-Proto {scheme}

        # 长读/写超时配置
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

**3. 启动 Caddy**

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl start caddy
sudo systemctl enable caddy
sudo systemctl status caddy
```

**4. 服务配置**

Caddy 会自动管理 HTTPS，因此可以将服务限制在本地进行监听：

```javascript
// config/config.js
module.exports = {
  server: {
    port: 3000,
    host: '127.0.0.1' // 只监听本地
  }
}
```

**Caddy 特点**

* 🔒 自动 HTTPS，零配置证书管理
* 🛡️ 安全默认配置，启用现代 TLS 套件
* ⚡ HTTP/2 和流式传输支持
* 🔧 配置文件简洁，易于维护

---

## Nginx Proxy Manager (NPM) 方案

Nginx Proxy Manager 通过图形化界面管理反向代理和 HTTPS 证书，並以 Docker 容器部署。

**1. 在 NPM 创建新的 Proxy Host**

Details 配置如下：

| 项目                    | 设置                      |
| --------------------- | ----------------------- |
| Domain Names          | relay.example.com       |
| Scheme                | http                    |
| Forward Hostname / IP | 192.168.0.1 (docker 机器 IP) |
| Forward Port          | 3000                    |
| Block Common Exploits | ☑️                      |
| Websockets Support    | ❌ **关闭**                |
| Cache Assets          | ❌ **关闭**                |
| Access List           | Publicly Accessible     |

> 注意：
> - 请确保 Claude Relay Service **监听 host 为 `0.0.0.0` 、容器 IP 或本机 IP**，以便 NPM 实现内网连接。
> - **Websockets Support 和 Cache Assets 必须关闭**，否则会导致 SSE / 流式响应失败。

**2. Custom locations**

無需添加任何内容，保持为空。

**3. SSL 设置**

* **SSL Certificate**: Request a new SSL Certificate (Let's Encrypt) 或已有证书
* ☑️ **Force SSL**
* ☑️ **HTTP/2 Support**
* ☑️ **HSTS Enabled**
* ☑️ **HSTS Subdomains**

**4. Advanced 配置**

Custom Nginx Configuration 中添加以下内容：

```nginx
# 传递真实用户 IP
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;

# 支持 WebSocket / SSE 等流式通信
proxy_http_version 1.1;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
proxy_buffering off;

# 长连接 / 超时设置（适合 AI 聊天流式传输）
proxy_read_timeout 300s;
proxy_send_timeout 300s;
proxy_connect_timeout 30s;

# ---- 安全性设置 ----
# 严格 HTTPS 策略 (HSTS)
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

# 阻挡点击劫持与内容嗅探
add_header X-Frame-Options "DENY" always;
add_header X-Content-Type-Options "nosniff" always;

# Referrer / Permissions 限制策略
add_header Referrer-Policy "no-referrer-when-downgrade" always;
add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;

# 隐藏服务器信息（等效于 Caddy 的 `-Server`）
proxy_hide_header Server;

# ---- 性能微调 ----
# 关闭代理端缓存，确保即时响应（SSE / Streaming）
proxy_cache_bypass $http_upgrade;
proxy_no_cache $http_upgrade;
proxy_request_buffering off;
```

**4. 启动和验证**

* 保存后等待 NPM 自动申请 Let's Encrypt 证书（如果有）。
* Dashboard 中查看 Proxy Host 状态，确保显示为 "Online"。
* 访问 `https://relay.example.com`，如果显示绿色锁图标即表示 HTTPS 正常。

**NPM 特点**

* 🔒 自动申请和续期证书
* 🔧 图形化界面，方便管理多服务
* ⚡ 原生支持 HTTP/2 / HTTPS
* 🚀 适合 Docker 容器部署

---

上述两种方案均可用于生产部署。

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
