# CLAUDE.md <260209.0>

This file provides guidance to Claude Code when working with this repository.

## 项目概述

Claude Relay Service — 多平台 AI API 中转服务，作为客户端与上游 AI API 之间的中间件。
支持 Claude (官方/Console)、Gemini、OpenAI Responses、AWS Bedrock、Azure OpenAI、Droid、CCR 等账户类型。
核心能力：多账户管理、API Key 认证、统一调度、代理配置、限流、成本统计。

## 架构原则

### Clean Architecture 分层映射

| 层级 | 目录 | 职责 |
|------|------|------|
| **框架层** | `src/routes/`, `src/middleware/` | HTTP 路由、请求验证、响应格式化 |
| **接口适配层** | `src/handlers/`, `src/services/openaiToClaude.js` | 请求/响应格式转换 |
| **用例层** | `src/services/*Scheduler.js`, `*RelayService.js` | 调度逻辑、转发编排 |
| **实体层** | `src/services/*AccountService.js`, `src/models/` | 账户管理、数据模型 |
| **基础设施层** | `src/utils/`, `config/` | 日志、缓存、加密、代理 |

### 开发原则

- **依赖方向**: 外层 → 内层，内层不知道外层存在
- **新增路由**: 只做参数提取和响应格式化，业务逻辑放 service
- **新增服务**: 先确定属于哪一层，遵循该层职责边界
- **格式转换**: 不同 API 格式的转换放 handlers 或专用转换服务
- **数据访问**: 通过 `src/models/redis.js` 统一访问

### 安全约束

- 敏感数据（OAuth token、refreshToken、credentials）必须 AES 加密存储（参考 `claudeAccountService.js`）
- API Key 使用 SHA-256 哈希存储，禁止明文
- 每个请求必须经过完整认证链（API Key → 权限 → 客户端限制 → 模型黑名单）
- 客户端断开时必须通过 AbortController 清理资源和并发计数
- 日志中禁止输出完整 token，使用 `tokenMask.js` 脱敏

## 项目结构

```
src/
├── routes/              # HTTP 路由
│   ├── api.js           # Claude API 主路由
│   ├── admin/           # 管理后台路由（24个子文件）
│   ├── geminiRoutes.js, standardGeminiRoutes.js
│   ├── openaiRoutes.js, openaiClaudeRoutes.js, openaiGeminiRoutes.js
│   ├── azureOpenaiRoutes.js, droidRoutes.js
│   ├── userRoutes.js, webhook.js, unified.js, apiStats.js, web.js
├── middleware/           # auth.js(认证/权限/限流), browserFallback.js
├── handlers/             # geminiHandlers.js
├── services/             # 业务服务
│   ├── relay/                 # 各平台转发服务（9个）
│   ├── account/               # 各平台账户管理（11个）
│   ├── scheduler/             # 统一调度器（4个）
│   ├── apiKeyService.js       # API Key 管理
│   ├── pricingService.js      # 定价和成本
│   └── ...                    # 其余 ~30 个业务服务
├── models/redis.js       # Redis 数据模型
├── utils/                # 35+ 工具文件（logger, proxy, oauth, cache, stream...）
config/config.js          # 主配置
scripts/                  # 运维脚本
cli/                      # CLI 工具
web/admin-spa/            # Vue SPA 管理界面
data/init.json            # 管理员凭据
```

## 核心请求流程

```
客户端(cr_前缀Key) → 路由 → auth中间件(验证/权限/限流/模型黑名单)
  → 统一调度器(选账户/粘性会话) → Token检查/刷新
  → 转发服务(通过代理发送) → 上游API
  → 流式/非流式响应 → Usage捕获 → 成本计算 → 返回客户端
```

关键机制：
- **粘性会话**: 基于请求内容 hash 绑定账户，同一会话用同一账户
- **并发控制**: Redis Sorted Set 实现，支持排队等待（非直接 429）
- **529 处理**: 自动标记过载账户，配置时长内排除
- **加密存储**: 敏感数据（OAuth token、credentials）AES 加密存于 Redis
- **流式响应**: SSE 传输，实时捕获 usage，客户端断开时 AbortController 清理资源

## 开发规范

### 代码格式化

- **必须使用 Prettier**: `npx prettier --write <file>`
- 前端额外安装了 `prettier-plugin-tailwindcss`
- 提交前检查：`npx prettier --check <file>`

### 开发工作流

1. **理解现有代码** → 读相关文件，了解现有模式
2. **编写代码** → 重用已有服务和工具函数
3. **格式化** → `npx prettier --write <修改的文件>`
4. **检查** → `npm run lint`
5. **测试** → `npm test`
6. **验证** → `npm run cli status` 确认服务正常

### 前端要求

- 响应式设计：Tailwind CSS 响应式前缀（sm:、md:、lg:、xl:）
- 暗黑模式：所有组件必须兼容，使用 `dark:` 前缀
- 主题切换：`web/admin-spa/src/stores/theme.js` 的 `useThemeStore()`
- 保持现有玻璃态设计风格

暗黑模式配色对照：

| 元素 | 明亮模式 | 暗黑模式 |
|------|----------|----------|
| 文本 | `text-gray-700` | `dark:text-gray-200` |
| 背景 | `bg-white` | `dark:bg-gray-800` |
| 边框 | `border-gray-200` | `dark:border-gray-700` |
| 状态色 | `text-blue-500` / `text-green-600` / `text-red-500` | 保持一致 |

### 代码修改原则

- 先检查现有模式和风格，重用已有服务和工具函数
- 敏感数据必须加密存储（参考 claudeAccountService.js）
- 遵循现有的错误处理和日志记录模式

## 常用命令

```bash
npm install && npm run setup    # 初始化
npm run dev                     # 开发模式（热重载）
npm start                       # 生产模式
npm run lint                    # ESLint 检查
npm test                        # Jest + SuperTest
docker-compose up -d            # Docker 部署
npm run cli status              # 系统状态
npm run data:export             # 导出 Redis 数据
npm run data:debug              # 调试 Redis 键
```

## 环境变量（必须）

- `JWT_SECRET` — JWT 密钥（32字符+）
- `ENCRYPTION_KEY` — AES 加密密钥（32字符固定）
- `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD` — Redis 连接

其他可选环境变量见 `.env.example`。

## 故障排除

| 问题 | 排查方向 |
|------|----------|
| Redis 连接失败 | 检查 REDIS_HOST/PORT/PASSWORD |
| 管理员登录失败 | 检查 data/init.json，运行 `npm run setup` |
| API Key 格式错误 | 确保使用 `cr_` 前缀格式（可通过 API_KEY_PREFIX 配置） |
| Token 刷新失败 | 检查 refreshToken 有效性和代理配置，查看 `logs/token-refresh-error.log` |
| 调度器选账户失败 | 检查账户 status:'active'，确认类型与路由匹配，查看粘性会话绑定 |
| 并发计数泄漏 | 系统每分钟自动清理，重启也会清理 |
| 粘性会话失效 | 检查 Redis 中 session 数据，Nginx 代理需添加 `underscores_in_headers on` |
| LDAP 认证失败 | 检查 LDAP_URL/BIND_DN/BIND_PASSWORD，自签名证书设 `LDAP_TLS_REJECT_UNAUTHORIZED=false` |
| Webhook 通知失败 | 确认 WEBHOOK_ENABLED=true，检查 WEBHOOK_URLS 格式，查看 `logs/webhook-*.log` |
| 成本统计不准确 | 运行 `npm run init:costs`，检查 pricingService 模型价格 |

日志：`logs/` 目录。Web 界面 `/admin-next/` 可实时查看。

# important-instruction-reminders

Do what has been asked; nothing more, nothing less.
NEVER create files unless they're absolutely necessary for achieving your goal.
ALWAYS prefer editing an existing file to creating a new one.
NEVER proactively create documentation files (\*.md) or README files. Only create documentation files if explicitly requested by the User.
