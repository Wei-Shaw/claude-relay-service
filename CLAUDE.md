# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

这个文件为 Claude Code (claude.ai/code) 提供在此代码库中工作的指导。

## 项目概述

Claude Relay Service 是一个功能完整的 AI API 中转服务，支持 Claude 和 Gemini 双平台。提供多账户管理、API Key 认证、代理配置和现代化 Web 管理界面。该服务作为客户端（如 SillyTavern、Claude Code、Gemini CLI）与 AI API 之间的中间件，提供认证、限流、监控等功能。

## 核心架构

### 关键架构概念

- **代理认证流**: 客户端用自建API Key → 验证 → 获取Claude账户OAuth token → 转发到Anthropic
- **Token管理**: 自动监控OAuth token过期并刷新，支持10秒提前刷新策略
- **代理支持**: 每个Claude账户支持独立代理配置，OAuth token交换也通过代理进行
- **数据加密**: 敏感数据（refreshToken, accessToken）使用AES加密存储在Redis

### 主要服务组件

- **claudeRelayService.js**: 核心代理服务，处理请求转发和流式响应
- **claudeAccountService.js**: Claude账户管理，OAuth token刷新和账户选择
- **geminiAccountService.js**: Gemini账户管理，Google OAuth token刷新和账户选择
- **apiKeyService.js**: API Key管理，验证、限流和使用统计
- **oauthHelper.js**: OAuth工具，PKCE流程实现和代理支持

### 认证和代理流程

1. 客户端使用自建API Key（cr\_前缀格式）发送请求
2. authenticateApiKey中间件验证API Key有效性和速率限制
3. claudeAccountService自动选择可用Claude账户
4. 检查OAuth access token有效性，过期则自动刷新（使用代理）
5. 移除客户端API Key，使用OAuth Bearer token转发请求
6. 通过账户配置的代理发送到Anthropic API
7. 流式或非流式返回响应，记录使用统计

### OAuth集成

- **PKCE流程**: 完整的OAuth 2.0 PKCE实现，支持代理
- **自动刷新**: 智能token过期检测和自动刷新机制
- **代理支持**: OAuth授权和token交换全程支持代理配置
- **安全存储**: claudeAiOauth数据加密存储，包含accessToken、refreshToken、scopes

## 常用命令

### 基本开发命令

````bash
# 安装依赖和初始化
npm install
npm run setup                  # 生成配置和管理员凭据
npm run install:web           # 安装Web界面依赖

# 开发和运行
npm run dev                   # 开发模式（热重载）
npm start                     # 生产模式
npm test                      # 运行测试
npm run lint                  # 代码检查

# Docker部署
docker-compose up -d          # 推荐方式
docker-compose --profile monitoring up -d  # 包含监控

# 服务管理
npm run service:start:daemon  # 后台启动（推荐）
npm run service:status        # 查看服务状态
npm run service:logs          # 查看日志
npm run service:stop          # 停止服务

### 开发环境配置
必须配置的环境变量：
- `JWT_SECRET`: JWT密钥（32字符以上随机字符串）
- `ENCRYPTION_KEY`: 数据加密密钥（32字符固定长度）
- `REDIS_HOST`: Redis主机地址（默认localhost）
- `REDIS_PORT`: Redis端口（默认6379）
- `REDIS_PASSWORD`: Redis密码（可选）

初始化命令：
```bash
cp config/config.example.js config/config.js
cp .env.example .env
npm run setup  # 自动生成密钥并创建管理员账户
````

## Web界面功能

### OAuth账户添加流程

1. **基本信息和代理设置**: 配置账户名称、描述和代理参数
2. **OAuth授权**:
   - 生成授权URL → 用户打开链接并登录Claude Code账号
   - 授权后会显示Authorization Code → 复制并粘贴到输入框
   - 系统自动交换token并创建账户

### 核心管理功能

- **实时仪表板**: 系统统计、账户状态、使用量监控
- **API Key管理**: 创建、配额设置、使用统计查看
- **Claude账户管理**: OAuth账户添加、代理配置、状态监控
- **系统日志**: 实时日志查看，多级别过滤
- **主题系统**: 支持明亮/暗黑模式切换，自动保存用户偏好设置

## 重要端点

### API转发端点

- `POST /api/v1/messages` - 主要消息处理端点（支持流式）
- `GET /api/v1/models` - 模型列表（兼容性）
- `GET /api/v1/usage` - 使用统计查询
- `GET /api/v1/key-info` - API Key信息

### OAuth管理端点

- `POST /admin/claude-accounts/generate-auth-url` - 生成OAuth授权URL（含代理）
- `POST /admin/claude-accounts/exchange-code` - 交换authorization code
- `POST /admin/claude-accounts` - 创建OAuth账户

### 系统端点

- `GET /health` - 健康检查
- `GET /web` - Web管理界面
- `GET /admin/dashboard` - 系统概览数据

## 故障排除

### OAuth相关问题

1. **代理配置错误**: 检查代理设置是否正确，OAuth token交换也需要代理
2. **授权码无效**: 确保复制了完整的Authorization Code，没有遗漏字符
3. **Token刷新失败**: 检查refreshToken有效性和代理配置

### Gemini Token刷新问题

1. **刷新失败**: 确保 refresh_token 有效且未过期
2. **错误日志**: 查看 `logs/token-refresh-error.log` 获取详细错误信息
3. **测试脚本**: 运行 `node scripts/test-gemini-refresh.js` 测试 token 刷新

### 常见开发问题

1. **Redis连接失败**: 确认Redis服务运行，检查连接配置
2. **管理员登录失败**: 检查init.json同步到Redis，运行npm run setup
3. **API Key格式错误**: 确保使用cr\_前缀格式
4. **代理连接问题**: 验证SOCKS5/HTTP代理配置和认证信息

### 调试工具

- **日志系统**: Winston结构化日志，支持不同级别
- **CLI工具**: 命令行状态查看和管理
- **Web界面**: 实时日志查看和系统监控
- **健康检查**: /health端点提供系统状态

## 开发最佳实践

### 代码格式化要求

- **必须使用 Prettier 格式化所有代码**
- 后端代码（src/）：运行 `npx prettier --write <file>` 格式化
- 前端代码（web/admin-spa/）：已安装 `prettier-plugin-tailwindcss`，运行 `npx prettier --write <file>` 格式化
- 提交前检查格式：`npx prettier --check <file>`
- 格式化所有文件：`npm run format`（如果配置了此脚本）

### 前端开发特殊要求

- **响应式设计**: 必须兼容不同设备尺寸（手机、平板、桌面），使用 Tailwind CSS 响应式前缀（sm:、md:、lg:、xl:）
- **暗黑模式兼容**: 项目已集成完整的暗黑模式支持，所有新增/修改的UI组件都必须同时兼容明亮模式和暗黑模式
  - 使用 Tailwind CSS 的 `dark:` 前缀为暗黑模式提供样式
  - 文本颜色：`text-gray-700 dark:text-gray-200`
  - 背景颜色：`bg-white dark:bg-gray-800`
  - 边框颜色：`border-gray-200 dark:border-gray-700`
  - 状态颜色保持一致：`text-blue-500`、`text-green-600`、`text-red-500` 等
- **主题切换**: 使用 `stores/theme.js` 中的 `useThemeStore()` 来实现主题切换功能
- **玻璃态效果**: 保持现有的玻璃态设计风格，在暗黑模式下调整透明度和背景色
- **图标和交互**: 确保所有图标、按钮、交互元素在两种模式下都清晰可见且易于操作

### 代码修改原则

- 对现有文件进行修改时，首先检查代码库的现有模式和风格
- 尽可能重用现有的服务和工具函数，避免重复代码
- 遵循项目现有的错误处理和日志记录模式
- 敏感数据必须使用加密存储（参考 claudeAccountService.js 中的加密实现）

### 测试和质量保证

- 运行 `npm run lint` 进行代码风格检查（使用 ESLint）
- 运行 `npm test` 执行测试套件（Jest + SuperTest 配置）
- 在修改核心服务后，使用 CLI 工具验证功能：`npm run cli status`
- 检查日志文件 `logs/claude-relay-*.log` 确认服务正常运行
- 注意：当前项目缺少实际测试文件，建议补充单元测试和集成测试

### 开发工作流

- **功能开发**: 始终从理解现有代码开始，重用已有的服务和模式
- **调试流程**: 使用 Winston 日志 + Web 界面实时日志查看 + CLI 状态工具
- **代码审查**: 关注安全性（加密存储）、性能（异步处理）、错误处理
- **部署前检查**: 运行 lint → 测试 CLI 功能 → 检查日志 → Docker 构建

### 常见文件位置

- 核心服务逻辑：`src/services/` 目录
- 路由处理：`src/routes/` 目录
- 中间件：`src/middleware/` 目录
- 配置管理：`config/config.js`
- Redis 模型：`src/models/redis.js`
- 工具函数：`src/utils/` 目录
- 前端主题管理：`web/admin-spa/src/stores/theme.js`
- 前端组件：`web/admin-spa/src/components/` 目录
- 前端页面：`web/admin-spa/src/views/` 目录

### 重要架构决策

- 所有敏感数据（OAuth token、refreshToken）都使用 AES 加密存储在 Redis
- 每个 Claude 账户支持独立的代理配置，包括 SOCKS5 和 HTTP 代理
- API Key 使用哈希存储，支持 `cr_` 前缀格式
- 请求流程：API Key 验证 → 账户选择 → Token 刷新（如需）→ 请求转发
- 支持流式和非流式响应，客户端断开时自动清理资源

### 核心数据流和性能优化

- **哈希映射优化**: API Key 验证从 O(n) 优化到 O(1) 查找
- **智能 Usage 捕获**: 从 SSE 流中解析真实的 token 使用数据
- **多维度统计**: 支持按时间、模型、用户的实时使用统计
- **异步处理**: 非阻塞的统计记录和日志写入
- **原子操作**: Redis 管道操作确保数据一致性

### 安全和容错机制

- **多层加密**: API Key 哈希 + OAuth Token AES 加密
- **零信任验证**: 每个请求都需要完整的认证链
- **优雅降级**: Redis 连接失败时的回退机制
- **自动重试**: 指数退避重试策略和错误隔离
- **资源清理**: 客户端断开时的自动清理机制

## 项目特定注意事项

### Redis 数据结构

- **API Keys**: `api_key:{id}` (详细信息) + `api_key_hash:{hash}` (快速查找)
- **Claude 账户**: `claude_account:{id}` (加密的 OAuth 数据)
- **管理员**: `admin:{id}` + `admin_username:{username}` (用户名映射)
- **会话**: `session:{token}` (JWT 会话管理)
- **使用统计**: `usage:daily:{date}:{key}:{model}` (多维度统计)
- **系统信息**: `system_info` (系统状态缓存)

### 流式响应处理

- 支持 SSE (Server-Sent Events) 流式传输
- 自动从流中解析 usage 数据并记录
- 客户端断开时通过 AbortController 清理资源
- 错误时发送适当的 SSE 错误事件

### CLI 工具使用示例

```bash
# 创建新的 API Key
npm run cli keys create -- --name "MyApp" --limit 1000

# 查看系统状态
npm run cli status

# 管理 Claude 账户
npm run cli accounts list
npm run cli accounts refresh <accountId>

# 管理员操作
npm run cli admin create -- --username admin2
npm run cli admin reset-password -- --username admin
```

# important-instruction-reminders

Do what has been asked; nothing more, nothing less.
NEVER create files unless they're absolutely necessary for achieving your goal.
ALWAYS prefer editing an existing file to creating a new one.
NEVER proactively create documentation files (\*.md) or README files. Only create documentation files if explicitly requested by the User.
