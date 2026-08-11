<260603.9>

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

Claude Relay Service — 多平台 AI API 中转服务，作为客户端与上游 AI API 之间的中间件。
支持 Claude (官方/Console)、Gemini、OpenAI Responses、AWS Bedrock、Azure OpenAI、Droid、CCR 等账户类型。
核心能力：多账户管理、API Key 认证、统一调度、代理配置、限流、成本统计。

## 架构原则

### Clean Architecture 分层映射

| 层级           | 目录                                              | 职责                            |
| -------------- | ------------------------------------------------- | ------------------------------- |
| **框架层**     | `src/routes/`, `src/middleware/`                  | HTTP 路由、请求验证、响应格式化 |
| **接口适配层** | `src/handlers/`, `src/services/openaiToClaude.js` | 请求/响应格式转换               |
| **用例层**     | `src/services/*Scheduler.js`, `*RelayService.js`  | 调度逻辑、转发编排              |
| **实体层**     | `src/services/*AccountService.js`, `src/models/`  | 账户管理、数据模型              |
| **基础设施层** | `src/utils/`, `config/`                           | 日志、缓存、加密、代理          |

### 开发原则

- **依赖方向**: 外层 → 内层，内层不知道外层存在
- **新增路由**: 只做参数提取和响应格式化，业务逻辑放 service
- **新增服务**: 先确定属于哪一层，遵循该层职责边界
- **格式转换**: 不同 API 格式的转换放 handlers 或专用转换服务
- **数据访问**: 通过 `src/models/redis.js` 统一访问
- **Redis key/TTL/集合上限**: 一律在 `src/constants/redisKeys.js` 集中定义（`RedisKeys` builder + `TTL` + `LIMITS`），禁止在业务代码硬编码 key 字符串或 TTL 数值；改 key/TTL 只动此处。写路径与重建/自愈/迁移路径必须共用同一 builder，杜绝第二套事实源。账户 key 的冒号/下划线变体逐字保留、绝不统一；查询层动态 scan pattern 的有意豁免见该文件顶部注释

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
├── constants/redisKeys.js # Redis key/TTL/LIMITS 统一注册表（单一权威源）
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

### 代码风格

- **无分号**、**单引号**、**100字符行宽**、**尾逗号 none**、**箭头函数始终加括号**
- 强制 `const`（`no-var`、`prefer-const`），严格相等（`eqeqeq`）
- 下划线前缀变量 `_var` 可豁免 unused 检查
- **格式化/lint/测试由人工在提交前触发**，AI 编码过程中禁止自行跑 `prettier` / `lint` / `test`
- 前端额外安装了 `prettier-plugin-tailwindcss`

### 开发工作流

1. **理解现有代码** → 读相关文件，了解现有模式
2. **编写代码** → 重用已有服务和工具函数，专注业务逻辑；编码途中不要格式化/lint/测试
3. **收尾格式化/lint/测试由人工在提交前触发**，AI 禁止自行 `prettier` / `lint` / `test`
4. **验证** → `npm run cli status` 确认服务正常（仅当用户明确要求时）

### 测试规范

- 测试文件在 `tests/` 目录，命名 `*.test.js` 或 `*.spec.js`
- 使用 `jest.mock()` 模拟依赖（logger、redis、services）
- `beforeEach` 中 `jest.resetModules()`，`afterEach` 中 `jest.clearAllMocks()`

### 前端要求

- 技术栈：Vue 3 Composition API + Pinia + Element Plus + Tailwind CSS
- 响应式设计：Tailwind CSS 响应式前缀（sm:、md:、lg:、xl:）
- 暗黑模式：所有组件必须兼容，使用 `dark:` 前缀
- 主题切换：`web/admin-spa/src/stores/theme.js` 的 `useThemeStore()`
- 保持现有玻璃态设计风格
- 最小字体 14px：用 `text-sm`(14px) 及以上，禁止 `text-xs`(12px)、`text-[Npx]`(N<14) 及 CSS `font-size` 小于 14px（含 `rem`<0.875）。全站已一次性全量替换到位（`text-xs`/`text-[<14px]`→`text-sm`、`font-size`<14px→14px、`<0.875rem`→0.875rem），新代码强制遵守，禁止再引入

暗黑模式配色对照：

| 元素   | 明亮模式                                            | 暗黑模式               |
| ------ | --------------------------------------------------- | ---------------------- |
| 文本   | `text-gray-700`                                     | `dark:text-gray-200`   |
| 背景   | `bg-white`                                          | `dark:bg-gray-800`     |
| 边框   | `border-gray-200`                                   | `dark:border-gray-700` |
| 状态色 | `text-blue-500` / `text-green-600` / `text-red-500` | 保持一致               |

### 代码修改原则

- 先检查现有模式和风格，重用已有服务和工具函数
- 敏感数据必须加密存储（参考 claudeAccountService.js）
- 遵循现有的错误处理和日志记录模式

### 时间规范

- **先区分两类时间**：
  - **绝对时间点**（如 `createdAt`、`expiresAt`、`lastUsedAt`、日志时间、订单时间、resetAt）统一使用 **UTC ISO8601** 存储与传输，默认 `toISOString()`
  - **业务周期时间**（如“今天”“本周”“支付日限额”“周额度重置日”）统一按系统配置时区计算，必须走统一 helper，禁止各处手写
- **前端 `datetime-local` 输入禁止直接配合 `toISOString().slice(...)` 使用**：
  - 初始化输入框时，必须先转成**本地时间字符串**
  - 用户提交时，再通过统一工具把本地输入转成 UTC ISO
  - 禁止在组件里直接写 `new Date(x).toISOString().slice(0, 16)` 或 `new Date(localInput).toISOString()`
- **时间范围筛选契约必须单义**：
  - 要么前后端统一传 UTC ISO
  - 要么明确传本地业务时间字符串并由后端按约定解析
  - 禁止一边传本地字符串、一边用 `toISOString()` 回显，导致 UI 回填时出现时区漂移
- **业务日期/周/月边界禁止使用 `new Date().toISOString().slice(0, 10)` 直接推导**：
  - 这类写法默认按 UTC 切日，和系统配置时区不一致
  - 统一复用 `src/models/redis.js` 或专门时间工具中的时区 helper
- **周语义必须统一**：
  - 前端“本周/上周”和后端统计口径必须使用同一周起始日（当前后端按 ISO week / 周一）
  - 新增周相关逻辑时，不得默认依赖第三方库 locale 的隐式周起始
- **展示层统一走公共 formatter**：
  - 前端禁止在业务组件里散落 `toLocaleString()` / `new Date()` / `dayjs()` 混用
  - 优先复用 `web/admin-spa/src/utils/time.js` / `web/admin-spa/src/utils/tools.js`
- **新增/修改时间逻辑必须补边界验证**：
  - 至少检查 UTC+8 零点前后
  - 周切换
  - 自定义时间回显
  - `datetime-local` 输入后再次打开弹窗是否仍显示同一本地时间

## 常用命令

```bash
npm install && npm run setup    # 初始化
npm run dev                     # 开发模式（nodemon 热重载，自动 lint）
npm start                       # 生产模式（先 lint 再启动）
npm run lint                    # ESLint 检查并自动修复
npm run lint:check              # ESLint 仅检查不修复
npm run format                  # Prettier 格式化所有后端文件
npm run format:check            # Prettier 仅检查格式
npm test                        # Jest 运行所有测试（tests/ 目录）
npm test -- <文件名>             # 运行单个测试，如: npm test -- pricingService
npm test -- --coverage          # 运行测试并生成覆盖率报告
npm run cli status              # 系统状态
npm run data:export             # 导出 Redis 数据
npm run data:debug              # 调试 Redis 键
```

### 前端命令

```bash
npm run install:web             # 安装前端依赖
npm run build:web               # 构建前端（生成 dist）
cd web/admin-spa && npm run dev # 前端开发模式（Vite HMR）
```

## 环境变量（必须）

- `JWT_SECRET` — JWT 密钥（32字符+）
- `ENCRYPTION_KEY` — AES 加密密钥（32字符固定）
- `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD` — Redis 连接

其他可选环境变量见 `.env.example`。

## 故障排除

| 问题             | 排查方向                                                                               |
| ---------------- | -------------------------------------------------------------------------------------- |
| Redis 连接失败   | 检查 REDIS_HOST/PORT/PASSWORD                                                          |
| 管理员登录失败   | 检查 data/init.json，运行 `npm run setup`                                              |
| API Key 格式错误 | 确保使用 `cr_` 前缀格式（可通过 API_KEY_PREFIX 配置）                                  |
| Token 刷新失败   | 检查 refreshToken 有效性和代理配置，查看 `logs/token-refresh-error.log`                |
| 调度器选账户失败 | 检查账户 status:'active'，确认类型与路由匹配，查看粘性会话绑定                         |
| 并发计数泄漏     | 系统每分钟自动清理，重启也会清理                                                       |
| 粘性会话失效     | 检查 Redis 中 session 数据，Nginx 代理需添加 `underscores_in_headers on`               |
| LDAP 认证失败    | 检查 LDAP_URL/BIND_DN/BIND_PASSWORD，自签名证书设 `LDAP_TLS_REJECT_UNAUTHORIZED=false` |
| Webhook 通知失败 | 确认 WEBHOOK_ENABLED=true，检查 WEBHOOK_URLS 格式，查看 `logs/webhook-*.log`           |
| 成本统计不准确   | 运行 `npm run init:costs`，检查 pricingService 模型价格                                |

日志：`logs/` 目录。Web 界面 `/admin-next/` 可实时查看。

## 发布与迁移

本服务的发布模型是**单实例停机重启**,不是滚动发布、不存在新旧版本并存:

- **Docker**: `docker-compose down` → `up -d`(或重新 build 再 up),整个容器重启。
- **非 Docker**: `npm run service:restart`(`scripts/manage.js` 先 stop 再 start),进程重启。
- `docker-entrypoint.sh` 仅在首次(无 `data/init.json`)跑一次 `setup.js`。

### 迁移机制三模块(src/migrations、src/bootstrap、src/compat)

启动时由 `src/app.js initialize()` 编排。**该编排是有意的依赖序列**——每个迁移/自愈调用的位置、顺序、await-阻塞 vs `.catch()`-后台语义都不能乱动(如周费用回填依赖 pricingService 已就绪、apiKey 索引重建依赖先 init),不要收口成"一行 run"。

- **`src/migrations/`——一次性迁移**。`runner.js` 两个入口,`registry.js` 注册 marker 型迁移,`ledger.js` 封装 `system:migrations:applied` 台账:
  - `runVersionGated(redis)`:版本门控块(`migrated:version` 水位 + `migrateGlobalStats` 按需自愈 + `cleanupSystemMetrics`),版本升级时检查这组动作。
  - `runMarker(redis, id)`:marker 型一次性迁移(up 幂等可重入,台账去重跳过重复执行),首次启动把存量旧 marker 接管进统一台账(只读旧 marker、绝不删,现网重启不重跑)。
  - **新增一次性迁移** = 往 `registry.js` 加一条 `{ id, legacyMarkerKey?, up }`,在 app.js 合适位置 `await runMarker(redis, id)`。**契约:up 必须幂等可重入(applied 台账只做去重优化,up 与记账非原子、不保证恰好一次)、失败必须抛错**;带内部自愈或吞错重试的迁移(如 alltime、global_stats)保留各自原生幂等、不进 registry。
- **`src/bootstrap/registry.js`——启动自愈编目**(纯数据登记,不收口执行)。幂等自愈(月份索引、usage 索引、费用回填、会话窗口、反向索引等)每次启动跑,调用点保留在 app.js 原位。
- **`src/compat/`——兼容层**。所有"兼容旧数据格式"的代码收拢于此,在册有主、标注下线条件(见 `compat/index.js` 台账)。

### 两套"防重复执行"机制并存(零行为变更下不强行合并)

- **版本门控水位** `system:migrated:version`:管 global stats + cleanupSystemMetrics,语义=版本升级才检查。
- **applied 台账** `system:migrations:applied`:管 marker 型一次性迁移,作用=记录已成功迁移以去重跳过(up 须幂等,不保证恰好一次)。

### 默认规则

- **新代码不引入"过渡态"双读双写**: 单实例停机重启不存在"一半新一半旧",新功能一律干净切换。但**存量历史兼容**(旧数据格式)走 `src/compat/` 在册管理 + 标注下线条件,确认旧数据清退后再删——不是一刀切禁止,而是有序登记、可追溯。
- **优先"从空开始"**: 运行时状态(缓存、限流类)允许重启后从空开始、系统自然重新学习,不为它写迁移。
- **轻量幂等迁移进 runner,重/危迁移走手动脚本**: 索引补全、按需自愈这类放 migrations/bootstrap 启动自动跑;百万级扫描、删数据、需 dry-run/人工确认的,写 `scripts/migrate-*.js` + `npm run migrate:*`(参考 `migrate-apikey-expiry.js`),操作员发布时手动跑。
- **旧字段下线**: 切换后不再读取的旧字段视为死数据,自然过期或一次性 housekeeping 清理。

一句话:**停机重启 + 启动幂等迁移(runner+台账)+ 兼容层在册管理 + 重操作手动脚本。**

## 账户调度与 disableAutoProtection(已固化决策,不要再重新讨论)

`disableAutoProtection` 开关 + 账户可调度判定的约束已定型。改这块前先读本节,**不要再就以下点重新决策、也不要再手抄判定逻辑**。

### 开关语义

- **`disableAutoProtection=true` = 暴力打上游**: 调度判定**忽略一切"上游错误类"自动暂停**(`status=error/temp_error/blocked/unauthorized`、限流 429、过载 529、`temp_unavailable`、Opus 周限、5 小时窗)。账户照常入选,失败原样发生在上游、错误经包装后返回客户端。
- **开关永不豁免的两类硬约束**:
  - **手动停用**: `isActive=false`(账户关) 与 `schedulable=false`(手动暂停调度)。**手动停用一律优先于开关**——开关开着也不会激活手动停掉的账户/号。
  - **本地硬约束**: 每日预算(方案甲)、模型支持、订阅过期、并发上限。

### 硬门 vs 开关可豁免(判定唯一标准)

| 类别                   | 字段/检查                                                                                 | 开关 ON 时 |
| ---------------------- | ----------------------------------------------------------------------------------------- | ---------- |
| **手动停用(硬门)**     | `isActive`、`schedulable`                                                                 | 始终生效   |
| **本地硬约束**         | `dailyQuota`(方案甲)、模型、订阅、并发                                                    | 始终生效   |
| **上游错误类(可豁免)** | `status=error/temp_error/blocked/unauthorized`、限流、过载、`temp_unavailable`、Opus 周限 | 跳过       |

- **方案甲(预算独立轴)**: `dailyQuota` 与开关**彻底解耦**,撞预算照样停。`disableAutoProtection` 不得出现在任何 quota 判定里。
- **schedulable 是硬门不是开关可豁免项**: 限流写 `schedulable=false` 是自愈语义(开关 ON 时 write-skip 不写;历史残留由 toggle-on 恢复补丁清,纯手动 `schedulable=false` 无自动证据、不被恢复)。

### 单一判定点(硬门权威清单,禁止漂移)

- 每个调度器的 **`_isAccountAvailable(accountId, accountType, requestedModel)` 是"硬门权威清单"**——可调度判定的唯一真相来源。改硬门**以它为准**。
- **专属绑定(dedicated)、分组成员(group)、会话复检** 三类路径**必须委托 `_isAccountAvailable`**(group 成员循环 = `_isAccountAvailable` + 模型 helper),禁止重抄判定。openai/gemini/claude 三调度器的 dedicated 与 group 均已委托。
- **只有共享池(shared pool)保留内联**——它是带副作用的选号循环(刷新 token、限流自愈、状态矫正后 push),结构上无法做成对 `_isAccountAvailable` 的纯委托。共享池的硬门集合**必须与 `_isAccountAvailable` 逐项一致**——`isActive/schedulable/订阅/预算(方案甲)/token有效性/模型/并发` 这组硬门,改任一项时**共享池与 `_isAccountAvailable` 同步改**。
- **token 失效在选号层统一处理,不要依赖"请求层兜底"**:`_isAccountAvailable`(dedicated/group/复检)与共享池**都**做同一套——"过期且无 refreshToken → 死号拒绝;过期但可刷新 → 选号阶段主动 `refreshAccountToken`(刷新失败则不可用)"。handler 选号后重新取号,拿到刷新后的 token。**关键:gemini 标准 `sendGeminiRequest` 不会自动刷新**(只有 openai 路由有"双重保护"、gemini v1internal 走 OAuth client 才自刷),所以**刷新必须在选号层做掉**,否则 dedicated/group 的过期号会在标准路径吃旧 token。这是把 token 刷新收口到选号层、四类路径行为一致的根本原因。
- **反复返工的根因 = 某条路径少一项硬门。改硬门前先核对共享池是否与 `_isAccountAvailable` 齐。**
- dedicated 路径**仅允许在委托判定之外附加"专属错误上报语义"**(如 claude-official 的 `CLAUDE_DEDICATED_RATE_LIMITED` 契约、openai-responses 的 402/403 错误码),且须基于同一判定结果,不得另起一套可用性判断。
- 鼓励把"同一组硬门"抽成纯函数供多路径共用(如 droid 的 `_passesDroidSyncGates`、openai-responses 的 `_openaiResponsesBudgetBlocked`)。
- 新增账户类型/新增选号路径时:接入 `_isAccountAvailable` 或对齐它的硬门清单,不要新写一套判定。

### 状态字段只由系统写入(防外部伪造)

- 账户"状态类"字段(`status/quotaStoppedAt/blockedStatus/autoStoppedAt/rateLimitStatus/...`)**只能由调度/限流/自动保护流程写入**。所有账户更新入口(admin 路由)必须经 `commonHelper.stripReadonlyAccountFields` 剥离状态类字段,只允许写配置类字段。
- **droid key 级状态**: key 的 `status/errorMessage` 只由自动流程(`markApiKeyAsError`)写;`updateAccount` 的 update 模式忽略外部传入的 key 级 `status/errorMessage`;外部更新入口额外剥离 `apiKeys[].status/errorMessage`。

### 上游错误不裸透传

- 上游错误返回客户端前必须经 `utils/clientErrorBuilder.js` 的 `buildClientError` 归一化(401/403→502、529→503、5xx→502,429 保留+Retry-After)+ 按客户端协议(openai/anthropic/gemini)产出干净 error + 脱敏(账户标记/URL/凭证形态)。

## 通用工程原则

### 数据 + 纯函数

- 新业务逻辑先写纯函数（输入数据 → 输出结果，不碰 Redis/HTTP/IO），再在 service 中组合调用
- service 是胶水层：组合纯函数 + 调用 Redis/HTTP，自身不含核心算法

### 架构决策偏好

- **解耦必须彻底**——不接受"搬走大部分但保留几个引用"。一个概念不属于某层，该层对它的感知必须是零
- **上层做路由分发，下层做领域闭环**——上层只知道"交给谁"和"成功/失败"，不知道下层内部的重试/轮询/池管理
- **跨域行为归上层**——多子系统协调的行为属于上层调度
- **下层需要上层能力用回调/接口注入，不直接依赖**——依赖方向单向
- **先质疑职责划分，再讨论实现**——循环依赖是职责划分问题，重新划分而非技术绕过

### 新增/修改功能时的思考维度

不是每个功能都要分布式锁/熔断，但必须**想过再决定不需要**：

- 状态放进程内存还是 Redis？多实例同时改会怎样？
- 操作重复执行有副作用吗？需要幂等吗？
- 上游/依赖挂了怎么降级？直接报错还是兜底？
- 新旧版本共存数据格式兼容吗？Redis key 结构变了还能读吗？
- 超时怎么设？一个慢请求会不会拖垮整个连接池？

"不需要"是合理决策，"没想到"不是。

### 并发

- **Redis 读-改-写必须原子**——先 GET 再 SET 在并发下必出 bug，用 Lua 脚本或 MULTI+EXEC

### 日志

- 所有 catch 到的错误必须打印完整堆栈，禁止只打 `error.message` 或静默吞掉
- `.catch(() => {})` 静默吞错改为 `.catch(e => console.error(e))`
- `console.error(e)` 是追加而非替换——保留原有带业务上下文的 logger 日志
- 多步骤流程在关键节点（入口/进展/出口/状态变化）留 debug 日志，`[模块名] key=value` 格式

## 通用代码规范

### 变量命名

- **完整拼写**：`groupId`/`channelId`/`apiKeyId`，禁止 `gid`/`cid` 缩写
- 迭代变量用集合名单数：`for (const row of rows)`，禁止单字母
- 作用域越大名字越完整；单行 lambda 参数可用短名。修旧代码时顺手改缩写

### 前端 UI

- **禁止因数据为空/未配置就隐藏 UI 控件**。控件可显示为空状态/默认值，但不能让用户找不到配置入口。`v-if` 只用于协议/类型不适用的场景，不用于"当前没值所以不显示"
- Dialog 内有 tab 切换时，PC 端内容区加 min-height 防高度跳动，移动端不加

## Git 规范

- 只读查询可用：`git status`/`git log`/`git diff` 等
- **写操作（`add`/`commit`/`push`/`checkout`/`restore`/`reset`/`clean`/`stash`/`rebase`/`merge`）由用户自行执行**
- 修复文件用 Edit/Write 工具，不用 git 写命令

## 人工决策记录

代码注释中带 `[人工决策-yyyy-MM-dd HH:mm:ss]` 标记的是用户的人工决策。

- 用户确认决策时，必须在相关代码处添加带时间戳的 `[人工决策-...]` 注释，时间戳用 `TZ=Asia/Shanghai date` 取当前北京时间精确到秒
- 修改涉及相关代码时，必须先提醒用户确认决策是否仍然有效，不得自行变更

> "Implement the simplest solution that works. Follow KISS and YAGNI strictly. No over-engineering, no speculative features, no unnecessary defensive code, error handling, validation, or boilerplate unless explicitly required."

# important-instruction-reminders

Do what has been asked; nothing more, nothing less.
NEVER create files unless they're absolutely necessary for achieving your goal.
ALWAYS prefer editing an existing file to creating a new one.
NEVER proactively create documentation files (\*.md) or README files. Only create documentation files if explicitly requested by the User.
