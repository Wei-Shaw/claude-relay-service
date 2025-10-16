# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

这个文件为 Claude Code (claude.ai/code) 提供在此代码库中工作的指导。

## 项目概述

Claude Relay Service 是一个多平台 AI API 中转服务，支持 **Claude (官方/Console)、Gemini、OpenAI Responses (Codex)、AWS Bedrock、Azure OpenAI、Droid (Factory.ai)、CCR** 等多种账户类型。提供完整的多账户管理、API Key 认证、代理配置、用户管理、LDAP认证、Webhook通知和现代化 Web 管理界面。该服务作为客户端（如 Claude Code、Gemini CLI、Codex、Droid CLI、Cherry Studio 等）与 AI API 之间的中间件，提供认证、限流、监控、定价计算、成本统计等功能。

## 核心架构

### 关键架构概念

- **统一调度系统**: 使用 unifiedClaudeScheduler、unifiedGeminiScheduler、unifiedOpenAIScheduler、droidScheduler 实现跨账户类型的智能调度
- **多账户类型支持**: 支持 claude-official、claude-console、bedrock、ccr、droid、gemini、openai-responses、azure-openai 等账户类型
- **代理认证流**: 客户端用自建API Key → 验证 → 统一调度器选择账户 → 获取账户token → 转发到对应API
- **Token管理**: 自动监控OAuth token过期并刷新，支持10秒提前刷新策略
- **代理支持**: 每个账户支持独立代理配置，OAuth token交换也通过代理进行
- **数据加密**: 敏感数据（refreshToken, accessToken, credentials）使用AES加密存储在Redis
- **粘性会话**: 支持会话级别的账户绑定，同一会话使用同一账户，确保上下文连续性
- **权限控制**: API Key支持权限配置（all/claude/gemini/openai等），控制可访问的服务类型
- **客户端限制**: 基于User-Agent的客户端识别和限制，支持ClaudeCode、Gemini-CLI等预定义客户端
- **模型黑名单**: 支持API Key级别的模型访问限制

### 主要服务组件

#### 核心转发服务

- **claudeRelayService.js**: Claude官方API转发，处理OAuth认证和流式响应
- **claudeConsoleRelayService.js**: Claude Console账户转发服务
- **geminiRelayService.js**: Gemini API转发服务
- **bedrockRelayService.js**: AWS Bedrock API转发服务
- **azureOpenaiRelayService.js**: Azure OpenAI API转发服务
- **droidRelayService.js**: Droid (Factory.ai) API转发服务
- **ccrRelayService.js**: CCR账户转发服务
- **openaiResponsesRelayService.js**: OpenAI Responses (Codex) 转发服务

#### 账户管理服务

- **claudeAccountService.js**: Claude官方账户管理，OAuth token刷新和账户选择
- **claudeConsoleAccountService.js**: Claude Console账户管理
- **geminiAccountService.js**: Gemini账户管理，Google OAuth token刷新
- **bedrockAccountService.js**: AWS Bedrock账户管理
- **azureOpenaiAccountService.js**: Azure OpenAI账户管理
- **droidAccountService.js**: Droid账户管理
- **ccrAccountService.js**: CCR账户管理
- **openaiResponsesAccountService.js**: OpenAI Responses账户管理
- **openaiAccountService.js**: OpenAI兼容账户管理
- **accountGroupService.js**: 账户组管理，支持账户分组和优先级

#### 统一调度器

- **unifiedClaudeScheduler.js**: Claude多账户类型统一调度（claude-official/console/bedrock/ccr）
- **unifiedGeminiScheduler.js**: Gemini账户统一调度
- **unifiedOpenAIScheduler.js**: OpenAI兼容服务统一调度
- **droidScheduler.js**: Droid账户调度

#### 核心功能服务

- **apiKeyService.js**: API Key管理，验证、限流、使用统计、成本计算
- **userService.js**: 用户管理系统，支持用户注册、登录、API Key管理
- **pricingService.js**: 定价服务，模型价格管理和成本计算
- **costInitService.js**: 成本数据初始化服务
- **webhookService.js**: Webhook通知服务
- **webhookConfigService.js**: Webhook配置管理
- **ldapService.js**: LDAP认证服务
- **tokenRefreshService.js**: Token自动刷新服务
- **rateLimitCleanupService.js**: 速率限制状态清理服务
- **claudeCodeHeadersService.js**: Claude Code客户端请求头处理

#### 工具服务

- **oauthHelper.js**: OAuth工具，PKCE流程实现和代理支持
- **workosOAuthHelper.js**: WorkOS OAuth集成
- **openaiToClaude.js**: OpenAI格式到Claude格式的转换

### 认证和代理流程

1. 客户端使用自建API Key（cr\_前缀格式）发送请求到对应路由（/api、/claude、/gemini、/openai、/droid等）
2. **authenticateApiKey中间件**验证API Key有效性、速率限制、权限、客户端限制、模型黑名单
3. **统一调度器**（如 unifiedClaudeScheduler）根据请求模型、会话hash、API Key权限选择最优账户
4. 检查选中账户的token有效性，过期则自动刷新（使用代理）
5. 根据账户类型调用对应的转发服务（claudeRelayService、geminiRelayService等）
6. 移除客户端API Key，使用账户凭据（OAuth Bearer token、API Key等）转发请求
7. 通过账户配置的代理发送到目标API（Anthropic、Google、AWS等）
8. 流式或非流式返回响应，捕获真实usage数据
9. 记录使用统计（input/output/cache_create/cache_read tokens）和成本计算
10. 更新速率限制计数器和并发控制

### OAuth集成

- **PKCE流程**: 完整的OAuth 2.0 PKCE实现，支持代理
- **自动刷新**: 智能token过期检测和自动刷新机制
- **代理支持**: OAuth授权和token交换全程支持代理配置
- **安全存储**: claudeAiOauth数据加密存储，包含accessToken、refreshToken、scopes

## 新增功能概览（相比旧版本）

### 多平台支持

- ✅ **Claude Console账户**: 支持Claude Console类型账户
- ✅ **AWS Bedrock**: 完整的AWS Bedrock API支持
- ✅ **Azure OpenAI**: Azure OpenAI服务支持
- ✅ **Droid (Factory.ai)**: Factory.ai API支持
- ✅ **CCR账户**: CCR凭据支持
- ✅ **OpenAI兼容**: OpenAI格式转换和Responses格式支持

### 用户和权限系统

- ✅ **用户管理**: 完整的用户注册、登录、API Key管理系统
- ✅ **LDAP认证**: 企业级LDAP/Active Directory集成
- ✅ **权限控制**: API Key级别的服务权限（all/claude/gemini/openai）
- ✅ **客户端限制**: 基于User-Agent的客户端识别和限制
- ✅ **模型黑名单**: API Key级别的模型访问控制

### 统一调度和会话管理

- ✅ **统一调度器**: 跨账户类型的智能调度系统
- ✅ **粘性会话**: 会话级账户绑定，支持自动续期
- ✅ **并发控制**: Redis Sorted Set实现的并发限制
- ✅ **负载均衡**: 自动账户选择和故障转移

### 成本和监控

- ✅ **定价服务**: 模型价格管理和自动成本计算
- ✅ **成本统计**: 详细的token使用和费用统计
- ✅ **缓存监控**: 全局缓存统计和命中率分析
- ✅ **实时指标**: 可配置窗口的实时统计（METRICS_WINDOW）

### Webhook和通知

- ✅ **Webhook系统**: 事件通知和Webhook配置管理
- ✅ **多URL支持**: 支持多个Webhook URL（逗号分隔）

### 高级功能

- ✅ **529错误处理**: 自动识别Claude过载状态并暂时排除账户
- ✅ **HTTP调试**: DEBUG_HTTP_TRAFFIC模式详细记录HTTP请求/响应
- ✅ **数据迁移**: 完整的数据导入导出工具（含加密/脱敏）
- ✅ **自动清理**: 并发计数、速率限制、临时错误状态自动清理

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

#### 必须配置的环境变量
- `JWT_SECRET`: JWT密钥（32字符以上随机字符串）
- `ENCRYPTION_KEY`: 数据加密密钥（32字符固定长度）
- `REDIS_HOST`: Redis主机地址（默认localhost）
- `REDIS_PORT`: Redis端口（默认6379）
- `REDIS_PASSWORD`: Redis密码（可选）

#### 新增重要环境变量（可选）
- `USER_MANAGEMENT_ENABLED`: 启用用户管理系统（默认false）
- `LDAP_ENABLED`: 启用LDAP认证（默认false）
- `LDAP_URL`: LDAP服务器地址（如 ldaps://ldap.example.com:636）
- `LDAP_TLS_REJECT_UNAUTHORIZED`: LDAP证书验证（默认true）
- `WEBHOOK_ENABLED`: 启用Webhook通知（默认true）
- `WEBHOOK_URLS`: Webhook通知URL列表（逗号分隔）
- `CLAUDE_OVERLOAD_HANDLING_MINUTES`: Claude 529错误处理持续时间（分钟，0表示禁用）
- `STICKY_SESSION_TTL_HOURS`: 粘性会话TTL（小时，默认1）
- `STICKY_SESSION_RENEWAL_THRESHOLD_MINUTES`: 粘性会话续期阈值（分钟，默认0）
- `METRICS_WINDOW`: 实时指标统计窗口（分钟，1-60，默认5）
- `MAX_API_KEYS_PER_USER`: 每用户最大API Key数量（默认1）
- `ALLOW_USER_DELETE_API_KEYS`: 允许用户删除自己的API Keys（默认false）
- `DEBUG_HTTP_TRAFFIC`: 启用HTTP请求/响应调试日志（默认false，仅开发环境）
- `PROXY_USE_IPV4`: 代理使用IPv4（默认true）
- `REQUEST_TIMEOUT`: 请求超时时间（毫秒，默认600000即10分钟）

#### AWS Bedrock配置（可选）
- `CLAUDE_CODE_USE_BEDROCK`: 启用Bedrock（设置为1启用）
- `AWS_REGION`: AWS默认区域（默认us-east-1）
- `ANTHROPIC_MODEL`: Bedrock默认模型
- `ANTHROPIC_SMALL_FAST_MODEL`: Bedrock小型快速模型
- `ANTHROPIC_SMALL_FAST_MODEL_AWS_REGION`: 小型模型区域
- `CLAUDE_CODE_MAX_OUTPUT_TOKENS`: 最大输出tokens（默认4096）
- `MAX_THINKING_TOKENS`: 最大思考tokens（默认1024）
- `DISABLE_PROMPT_CACHING`: 禁用提示缓存（设置为1禁用）

#### 初始化命令
```bash
cp config/config.example.js config/config.js
cp .env.example .env
npm run setup  # 自动生成密钥并创建管理员账户
```

## Web界面功能

### OAuth账户添加流程

1. **基本信息和代理设置**: 配置账户名称、描述和代理参数
2. **OAuth授权**:
   - 生成授权URL → 用户打开链接并登录Claude Code账号
   - 授权后会显示Authorization Code → 复制并粘贴到输入框
   - 系统自动交换token并创建账户

### 核心管理功能

- **实时仪表板**: 系统统计、账户状态、使用量监控、实时指标（METRICS_WINDOW配置窗口）
- **API Key管理**: 创建、配额设置、使用统计查看、权限配置、客户端限制、模型黑名单
- **多平台账户管理**:
  - Claude账户（官方/Console）: OAuth账户添加、代理配置、状态监控
  - Gemini账户: Google OAuth授权、代理配置
  - OpenAI Responses (Codex)账户: API Key配置
  - AWS Bedrock账户: AWS凭据配置
  - Azure OpenAI账户: Azure凭据和端点配置
  - Droid账户: Factory.ai API Key配置
  - CCR账户: CCR凭据配置
- **用户管理**: 用户注册、登录、API Key分配（USER_MANAGEMENT_ENABLED启用时）
- **系统日志**: 实时日志查看，多级别过滤，HTTP调试日志（DEBUG_HTTP_TRAFFIC启用时）
- **Webhook配置**: Webhook URL管理、事件配置
- **主题系统**: 支持明亮/暗黑模式切换，自动保存用户偏好设置
- **成本分析**: 详细的token使用和成本统计（基于pricingService）
- **缓存监控**: 解密缓存统计和性能监控

## 重要端点

### API转发端点（多路由支持）

#### Claude服务路由
- `POST /api/v1/messages` - Claude消息处理（支持流式）
- `POST /claude/v1/messages` - Claude消息处理（别名路由）
- `POST /v1/messages/count_tokens` - Token计数Beta API
- `GET /api/v1/models` - 模型列表
- `GET /api/v1/usage` - 使用统计查询
- `GET /api/v1/key-info` - API Key信息
- `GET /v1/me` - 用户信息（Claude Code客户端需要）
- `GET /v1/organizations/:org_id/usage` - 组织使用统计

#### Gemini服务路由
- `POST /gemini/v1/models/:model:generateContent` - 标准Gemini API格式
- `POST /gemini/v1/models/:model:streamGenerateContent` - Gemini流式
- `GET /gemini/v1/models` - Gemini模型列表
- 其他Gemini兼容路由（保持向后兼容）

#### OpenAI兼容路由
- `POST /openai/v1/chat/completions` - OpenAI格式转发（支持responses格式）
- `POST /openai/claude/v1/chat/completions` - OpenAI格式转Claude
- `POST /openai/gemini/v1/chat/completions` - OpenAI格式转Gemini
- `GET /openai/v1/models` - OpenAI格式模型列表

#### Droid (Factory.ai) 路由
- `POST /droid/claude/v1/messages` - Droid Claude转发
- `POST /droid/openai/v1/chat/completions` - Droid OpenAI转发

#### Azure OpenAI 路由
- `POST /azure/...` - Azure OpenAI API转发

### 管理端点

#### OAuth和账户管理
- `POST /admin/claude-accounts/generate-auth-url` - 生成OAuth授权URL（含代理）
- `POST /admin/claude-accounts/exchange-code` - 交换authorization code
- `POST /admin/claude-accounts` - 创建Claude OAuth账户
- 各平台账户CRUD端点（gemini、openai、bedrock、azure、droid、ccr）

#### 用户管理（USER_MANAGEMENT_ENABLED启用时）
- `POST /users/register` - 用户注册
- `POST /users/login` - 用户登录
- `GET /users/profile` - 用户资料
- `POST /users/api-keys` - 创建用户API Key

#### Webhook管理
- `GET /admin/webhook/configs` - 获取Webhook配置
- `POST /admin/webhook/configs` - 创建Webhook配置
- `PUT /admin/webhook/configs/:id` - 更新Webhook配置
- `DELETE /admin/webhook/configs/:id` - 删除Webhook配置

### 系统端点

- `GET /health` - 健康检查（包含组件状态、版本、内存等）
- `GET /metrics` - 系统指标（使用统计、uptime、内存）
- `GET /web` - 传统Web管理界面
- `GET /admin-next/` - 新版SPA管理界面（主界面）
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

1. **Redis连接失败**: 确认Redis服务运行，检查REDIS_HOST、REDIS_PORT、REDIS_PASSWORD配置
2. **管理员登录失败**: 检查data/init.json存在，运行npm run setup重新初始化
3. **API Key格式错误**: 确保使用cr\_前缀格式（可通过API_KEY_PREFIX配置修改）
4. **代理连接问题**: 验证SOCKS5/HTTP代理配置和认证信息，检查PROXY_USE_IPV4设置
5. **粘性会话失效**: 检查Redis中session数据，确认STICKY_SESSION_TTL_HOURS配置，通过Nginx代理时需添加 `underscores_in_headers on;`
6. **LDAP认证失败**:
   - 检查LDAP_URL、LDAP_BIND_DN、LDAP_BIND_PASSWORD配置
   - 自签名证书问题：设置 LDAP_TLS_REJECT_UNAUTHORIZED=false
   - 查看日志中的LDAP连接错误详情
7. **用户管理功能不可用**: 确认USER_MANAGEMENT_ENABLED=true，检查userService初始化
8. **Webhook通知失败**:
   - 确认WEBHOOK_ENABLED=true
   - 检查WEBHOOK_URLS格式（逗号分隔）
   - 查看logs/webhook-*.log日志
9. **统一调度器选择账户失败**:
   - 检查账户状态（status: 'active'）
   - 确认账户类型与请求路由匹配
   - 查看粘性会话绑定情况
10. **并发计数泄漏**: 系统每分钟自动清理过期并发计数（concurrency cleanup task），重启时也会自动清理
11. **速率限制未清理**: rateLimitCleanupService每5分钟自动清理过期限流状态
12. **成本统计不准确**: 运行 `npm run init:costs` 初始化成本数据，检查pricingService是否正确加载模型价格
13. **缓存命中率低**: 查看缓存监控统计，调整LRU缓存大小配置

### 调试工具

- **日志系统**: Winston结构化日志，支持不同级别，logs/目录下分类存储
  - `logs/claude-relay-*.log` - 应用主日志
  - `logs/token-refresh-error.log` - Token刷新错误
  - `logs/webhook-*.log` - Webhook通知日志
  - `logs/http-debug-*.log` - HTTP调试日志（DEBUG_HTTP_TRAFFIC=true时）
- **CLI工具**: 命令行状态查看和管理（npm run cli）
- **Web界面**: 实时日志查看和系统监控（/admin-next/）
- **健康检查**: /health端点提供系统状态（redis、logger、内存、版本等）
- **系统指标**: /metrics端点提供详细的使用统计和性能指标
- **缓存监控**: cacheMonitor提供全局缓存统计和命中率分析
- **数据导出工具**: npm run data:export 导出Redis数据进行调试
- **Redis Key调试**: npm run data:debug 查看所有Redis键

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

- 核心服务逻辑：`src/services/` 目录（30+服务文件）
- 路由处理：`src/routes/` 目录（api.js、admin.js、geminiRoutes.js、openaiRoutes.js等13个路由文件）
- 中间件：`src/middleware/` 目录（auth.js、browserFallback.js、debugInterceptor.js等）
- 配置管理：`config/config.js`（完整的多平台配置）
- Redis 模型：`src/models/redis.js`
- 工具函数：`src/utils/` 目录
  - `logger.js` - 日志系统
  - `oauthHelper.js` - OAuth工具
  - `proxyHelper.js` - 代理工具
  - `sessionHelper.js` - 会话管理
  - `cacheMonitor.js` - 缓存监控
  - `costCalculator.js` - 成本计算
  - `rateLimitHelper.js` - 速率限制
  - `webhookNotifier.js` - Webhook通知
  - `tokenMask.js` - Token脱敏
  - `workosOAuthHelper.js` - WorkOS OAuth
  - `modelHelper.js` - 模型工具
  - `inputValidator.js` - 输入验证
- CLI工具：`cli/index.js` 和 `src/cli/` 目录
- 脚本目录：`scripts/` 目录
  - `setup.js` - 初始化脚本
  - `manage.js` - 服务管理
  - `migrate-apikey-expiry.js` - API Key过期迁移
  - `fix-usage-stats.js` - 使用统计修复
  - `data-transfer.js` / `data-transfer-enhanced.js` - 数据导入导出
  - `update-model-pricing.js` - 模型价格更新
  - `test-pricing-fallback.js` - 价格回退测试
  - `debug-redis-keys.js` - Redis调试
- 前端主题管理：`web/admin-spa/src/stores/theme.js`
- 前端组件：`web/admin-spa/src/components/` 目录
- 前端页面：`web/admin-spa/src/views/` 目录
- 初始化数据：`data/init.json`（管理员凭据存储）
- 日志目录：`logs/`（各类日志文件）

### 重要架构决策

- **统一调度系统**: 使用统一调度器（unifiedClaudeScheduler等）实现跨账户类型的智能调度，支持粘性会话、负载均衡、故障转移
- **多账户类型支持**: 支持8种账户类型（claude-official、claude-console、bedrock、ccr、droid、gemini、openai-responses、azure-openai）
- **加密存储**: 所有敏感数据（OAuth token、refreshToken、credentials）都使用 AES 加密存储在 Redis
- **独立代理**: 每个账户支持独立的代理配置（SOCKS5/HTTP），包括OAuth授权流程
- **API Key哈希**: 使用SHA-256哈希存储，支持自定义前缀（默认 `cr_`）
- **权限系统**: API Key支持细粒度权限控制（all/claude/gemini/openai等）
- **请求流程**: API Key验证（含权限、客户端、模型黑名单） → 统一调度器选择账户 → Token刷新（如需）→ 请求转发 → Usage捕获 → 成本计算
- **流式响应**: 支持SSE流式响应，实时捕获真实usage数据，客户端断开时自动清理资源（AbortController）
- **粘性会话**: 基于请求内容hash的会话绑定，同一会话始终使用同一账户，支持自动续期
- **自动清理**: 定时清理任务（过期Key、错误账户、临时错误、并发计数、速率限制状态）
- **缓存优化**: 多层LRU缓存（解密缓存、账户缓存），全局缓存监控和统计
- **成本追踪**: 实时token使用统计（input/output/cache_create/cache_read）和成本计算（基于pricingService）
- **并发控制**: Redis Sorted Set实现的并发计数，支持自动过期清理
- **客户端识别**: 基于User-Agent的客户端限制，支持预定义客户端（ClaudeCode、Gemini-CLI等）
- **错误处理**: 529错误自动标记账户过载状态，配置时长内自动排除该账户

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

- **API Keys**:
  - `api_key:{id}` - API Key详细信息（含权限、客户端限制、模型黑名单等）
  - `api_key_hash:{hash}` - 哈希到ID的快速映射
  - `api_key_usage:{keyId}` - 使用统计数据
  - `api_key_cost:{keyId}` - 成本统计数据
- **账户数据**（多类型）:
  - `claude_account:{id}` - Claude官方账户（加密的OAuth数据）
  - `claude_console_account:{id}` - Claude Console账户
  - `gemini_account:{id}` - Gemini账户
  - `openai_responses_account:{id}` - OpenAI Responses账户
  - `bedrock_account:{id}` - AWS Bedrock账户
  - `azure_openai_account:{id}` - Azure OpenAI账户
  - `droid_account:{id}` - Droid账户
  - `ccr_account:{id}` - CCR账户
- **用户管理**:
  - `user:{id}` - 用户信息
  - `user_email:{email}` - 邮箱到用户ID映射
  - `user_session:{token}` - 用户会话
- **管理员**:
  - `admin:{id}` - 管理员信息
  - `admin_username:{username}` - 用户名映射
  - `admin_credentials` - 管理员凭据（从data/init.json同步）
- **会话管理**:
  - `session:{token}` - JWT会话管理
  - `sticky_session:{sessionHash}` - 粘性会话账户绑定
  - `session_window:{accountId}` - 账户会话窗口
- **使用统计**:
  - `usage:daily:{date}:{key}:{model}` - 按日期、Key、模型的使用统计
  - `usage:account:{accountId}:{date}` - 按账户的使用统计
  - `usage:global:{date}` - 全局使用统计
- **速率限制**:
  - `rate_limit:{keyId}:{window}` - 速率限制计数器
  - `rate_limit_state:{accountId}` - 账户限流状态
  - `overload:{accountId}` - 账户过载状态（529错误）
- **并发控制**:
  - `concurrency:{accountId}` - Redis Sorted Set实现的并发计数
- **Webhook配置**:
  - `webhook_config:{id}` - Webhook配置
- **系统信息**:
  - `system_info` - 系统状态缓存
  - `model_pricing` - 模型价格数据（pricingService）

### 流式响应处理

- 支持 SSE (Server-Sent Events) 流式传输，实时推送响应数据
- 自动从SSE流中解析真实usage数据（input/output/cache_create/cache_read tokens）
- 客户端断开时通过 AbortController 清理资源和并发计数
- 错误时发送适当的 SSE 错误事件（带时间戳和错误类型）
- 支持大文件流式传输（REQUEST_TIMEOUT配置超时时间）
- 禁用Nagle算法确保数据立即发送（socket.setNoDelay）
- 设置 `X-Accel-Buffering: no` 禁用Nginx缓冲

### CLI 工具使用示例

```bash
# API Key管理
npm run cli keys create -- --name "MyApp" --limit 1000
npm run cli keys list
npm run cli keys delete -- --id <keyId>
npm run cli keys update -- --id <keyId> --limit 2000

# 系统状态查看
npm run cli status  # 查看系统概况
npm run status  # 统一状态脚本
npm run status:detail  # 详细状态

# Claude账户管理
npm run cli accounts list
npm run cli accounts refresh <accountId>
npm run cli accounts add -- --name "Account1"

# Gemini账户管理
npm run cli gemini list
npm run cli gemini add -- --name "Gemini1"

# 管理员操作
npm run cli admin create -- --username admin2
npm run cli admin reset-password -- --username admin
npm run cli admin list

# 数据管理
npm run data:export  # 导出Redis数据
npm run data:export:sanitized  # 导出脱敏数据
npm run data:export:enhanced  # 增强导出（含解密）
npm run data:export:encrypted  # 导出加密数据
npm run data:import  # 导入数据
npm run data:import:enhanced  # 增强导入
npm run data:debug  # 调试Redis键

# 数据迁移和修复
npm run migrate:apikey-expiry  # API Key过期时间迁移
npm run migrate:apikey-expiry:dry  # 干跑模式
npm run migrate:fix-usage-stats  # 修复使用统计

# 成本和定价
npm run init:costs  # 初始化成本数据
npm run update:pricing  # 更新模型价格
npm run test:pricing-fallback  # 测试价格回退

# 监控
npm run monitor  # 增强监控脚本
```

# important-instruction-reminders

Do what has been asked; nothing more, nothing less.
NEVER create files unless they're absolutely necessary for achieving your goal.
ALWAYS prefer editing an existing file to creating a new one.
NEVER proactively create documentation files (\*.md) or README files. Only create documentation files if explicitly requested by the User.
````
