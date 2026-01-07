# Claude Relay Service (Antigravity Edition)

> **二开维护：dadongwo**
>
> 目标：让 `claude`（Claude Code CLI）与 Antigravity / Gemini 账户体系无缝对接，并提供可观测、可运维的稳定转发服务。

> [!CAUTION]
> **安全更新通知**：v1.1.248 及以下版本存在严重的管理员认证绕过漏洞，攻击者可未授权访问管理面板。
>
> **请立即更新到 v1.1.249+ 版本**，或迁移到新一代项目 **[CRS 2.0 (sub2api)](https://github.com/Wei-Shaw/sub2api)**

<div align="center">

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![Docker](https://img.shields.io/badge/Docker-Ready-blue.svg)](https://www.docker.com/)

**🔐 Claude Code 原生适配 · Antigravity 生态 · 多账户管理**

</div>

---

## 🌟 核心亮点

这是一个二开项目：在原版 CRS 基础上补齐 Claude Code 协议层兼容、完善 Antigravity OAuth 与路径分流，并增强稳定性与可观测性。

### 1. 🚀 Claude Code 原生级兼容 (Killer Feature)
无需任何魔法，让你的 `claude` 命令行工具像连接官方一样连接到本服务。

- **Thinking Signature 伪造/缓存/恢复**：解决 Claude Code 3.7+ 对 `thoughtSignature` 的强校验，支持兜底签名策略与签名缓存。
- **Tool Result 透传**：兼容 Base64 图片等复杂结构，避免转发丢失/格式错误。
- **消息并发治理**：拆分 Claude Code 混合发送的 `tool_result + user_text`，按协议顺序转发。
- **僵尸流看门狗**：SSE 连接 45 秒无有效数据自动断开，避免“假活着”导致会话/额度被占用。

### 2. 🛡️ Antigravity & Gemini 深度集成
- **Antigravity OAuth 支持**：新增 `gemini-antigravity` 账户类型，支持 OAuth 授权与权限校验。
- **路径即路由 (Path-Based Routing)**:
  - `/antigravity/api` -> 自动路由到 Antigravity 账户池
  - `/gemini-cli/api` -> 自动路由到 Gemini 账户池
  - 告别在模型名前加前缀（如 `gemini/claude-3-5`）的混乱做法，Client 端只需改 Base URL 即可。
- **额度与模型动态列表适配**：针对 Antigravity 的 `fetchAvailableModels` 做标准化展示（管理后台）与透传（接口）。

### 3. ⚙️ 企业级稳定性
- **智能重试与切换账号**：针对 Antigravity `429 Resource Exhausted`，自动清理会话并切换账号重试（流式/非流式均覆盖）。
- **日志安全与轮转**：避免循环引用导致的进程崩溃，并对 Dump 文件进行大小控制与轮转。
- **调试利器**：支持请求/响应/工具定义/上游请求与上游 SSE 响应的 JSONL 转储，便于复现与定位问题。

## 📊 额度与模型查询 (Antigravity 专属)

### 查看账户额度 / Quota
本服务深度适配了 Antigravity 的实时配额查询接口 (v1internal:fetchAvailableModels)。

1. 进入管理后台 -> **账号管理 (Claude 账户)**。
2. 找到您的 `gemini-antigravity` 类型账户。
3. 点击卡片右上角的 **"测试/刷新"** 按钮。
4. 系统会自动拉取上游最新的配额信息（支持 Gemini Pro / Flash / Image 等不同分类），并将其标准化展示为百分比与重置时间。

### 获取动态模型列表
由于 Antigravity 的模型 ID 是动态更新的（如 `gemini-2.0-flash-exp`），本服务提供了透传查询接口。

- **接口地址（Anthropic/Claude Code 路由）**: `GET /antigravity/api/v1/models`
- **接口地址（OpenAI 兼容路由）**: `GET /openai/gemini/models`（或 `GET /openai/gemini/v1/models`）
- **说明**: `/antigravity/api/v1/models` 会实时透传 Antigravity 上游 `fetchAvailableModels` 结果，确保看到当前账户可用的最新模型列表。

---

## 🎮 快速开始指南

### 0. 环境要求
- Node.js 18+（或使用 Docker）
- Redis 6+/7+

### 1. Claude Code (CLI) 配置

无需修改代码，只需设置环境变量即可无缝切换后端。

#### 方案 A: 使用 Antigravity 账户池 (推荐)
适用于通过 Antigravity 渠道使用 Claude 模型 (如 `claude-opus-4-5` 等)。

```bash
# 1. 设置 Base URL 为 Antigravity 专用路径
export ANTHROPIC_BASE_URL="http://你的服务器IP:3000/antigravity/api/"

# 2. 设置 API Key (在后台创建，权限需包含 'all' 或 'gemini')
export ANTHROPIC_AUTH_TOKEN="cr_xxxxxxxxxxxx"

# 3. 指定模型名称 (直接使用短名，无需前缀！)
export ANTHROPIC_MODEL="claude-opus-4-5"

# 4. 启动
claude
```

#### 方案 B: 使用 Gemini 账户池 (Gemini Models)
适用于直接调用 Google Gemini 模型 (如 `gemini-2.5-pro`)。

```bash
export ANTHROPIC_BASE_URL="http://你的服务器IP:3000/gemini-cli/api/"
export ANTHROPIC_AUTH_TOKEN="cr_xxxxxxxxxxxx"
export ANTHROPIC_MODEL="gemini-2.5-pro"
claude
```

#### 方案 C: 标准 Claude 账户池
适用于原版 Claude / Console / Bedrock 渠道。

```bash
export ANTHROPIC_BASE_URL="http://你的服务器IP:3000/api/"
export ANTHROPIC_AUTH_TOKEN="cr_xxxxxxxxxxxx"
claude
```

---

### 2. Gemini CLI 配置

支持通过 Gemini 协议直接访问。

**方式一：通过 Gemini Assist API (推荐)**

```bash
export CODE_ASSIST_ENDPOINT="http://你的服务器IP:3000/gemini"
export GOOGLE_CLOUD_ACCESS_TOKEN="cr_xxxxxxxxxxxx" # 使用 CRS 的 API Key
export GOOGLE_GENAI_USE_GCA="true"
export GEMINI_MODEL="gemini-2.5-pro"
gemini
```

---

## 📦 部署说明

### Docker Compose (推荐)

```bash
# 1. 初始化配置
cp .env.example .env
cp config/config.example.js config/config.js

# 2. 编辑 .env（至少设置这两个）
# JWT_SECRET=...（随机字符串）
# ENCRYPTION_KEY=...（32位随机字符串）

# 3. 启动
docker-compose up -d
```

### Node 方式（不使用 Docker）

```bash
npm install
cp .env.example .env
cp config/config.example.js config/config.js
npm run setup
npm run service:start:daemon
```

### 管理面板

- 地址: `http://IP:3000/web`
- 初始账号/密码：`npm run setup` 生成并写入 `data/init.json`（Docker 部署可通过容器日志定位）。

---

## 🔧 调试与排障（可选）

Dump 开关在 `.env.example` 中有完整说明。常用项：

- `ANTHROPIC_DEBUG_REQUEST_DUMP=true`
- `ANTHROPIC_DEBUG_RESPONSE_DUMP=true`
- `ANTIGRAVITY_DEBUG_UPSTREAM_REQUEST_DUMP=true`
- `ANTIGRAVITY_DEBUG_UPSTREAM_RESPONSE_DUMP=true`
- `DUMP_MAX_FILE_SIZE_BYTES=10485760`

---

## 🤝 维护与致谢

- **维护者**：dadongwo
- **Upstream**：Claude Relay Service（原版项目，已在本分支移除与功能无关的广告信息并专注于功能增强）
