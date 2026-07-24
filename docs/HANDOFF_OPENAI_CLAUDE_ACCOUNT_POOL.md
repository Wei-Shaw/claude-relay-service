# OpenAI + Claude 账号池接手文档

本文档面向后续接手开发和运维人员，说明当前系统在 `Wei-Shaw/claude-relay-service` 基础上新增的 OpenAI + Claude 公司级账号池能力、运行方式、关键入口和后续风险。

## 1. 仓库和分支

- 本地目录：`C:\Users\zhangkairui\Documents\Codex\2026-07-06\wei-shaw-claude-relay-service-https\work\claude-relay-service`
- GitHub 远端：`https://github.com/Wei-Shaw/claude-relay-service.git`
- 当前工作分支：`feat/openai-key-pool-mvp`
- 基线项目：`Wei-Shaw/claude-relay-service`
- 当前目标：在成熟 relay/admin 系统上扩展 OpenAI + Claude 账号池，而不是从零重写。

## 2. 系统目标

系统用于管理公司合法拥有或明确授权管理的 OpenAI / Claude 账号和网关 API Key，实现：

- 将多个 OpenAI / Claude 账号聚合为统一账号池。
- 给团队或用户分配网关 API Key，并通过网关统一转发请求。
- 支持 5h 小时级额度、7d 周期额度、成本、Token、请求数等混合阈值。
- 任一阈值到量后从调度中跳过该账号，额度恢复后自动重新参与调度。
- 管理后台展示账号池状态、服务器镜像状态、请求明细、额度策略和系统设置。
- 接入 `carher-admin` 已有能力，读取远端服务器账号池状态，优先做只读展示和预演。

## 3. 当前已经实现的功能

### 3.1 管理后台

主要页面：

- `/admin-next/dashboard`：总览。
- `/admin-next/accounts`：AI 账号池，只保留 OpenAI + Claude 相关语义。
- `/admin-next/account-pool`：账号池策略页面。
- `/admin-next/request-details`：请求明细。
- `/admin-next/limits`：额度策略。
- `/admin-next/settings`：系统设置。

账号池策略页当前包含：

- 服务器账号池状态镜像。
- OpenAI + Claude 账号池策略状态。
- 策略预演入口。
- 本地执行一次策略入口。
- OpenAI 重置卡扫描结果和调度权重展示。
- `carher-admin` 预演和刷新桥接入口。

关键前端文件：

- `web/admin-spa/src/views/AccountPoolView.vue`
- `web/admin-spa/src/components/dashboard/ServerStatePanel.vue`
- `web/admin-spa/src/components/dashboard/AccountPoolShadowPanel.vue`
- `web/admin-spa/src/components/dashboard/AccountPoolSummaryPanel.vue`
- `web/admin-spa/src/router/index.js`
- `web/admin-spa/src/utils/http_apis.js`

### 3.2 后端管理接口

账号池相关接口：

- `GET /admin/account-pool/summary`
- `GET /admin/account-pool/policy`
- `PUT /admin/account-pool/policy`
- `GET /admin/account-pool/shadow`
- `POST /admin/account-pool/sweep`
- `POST /admin/account-pool/admin-skill/action`

服务器状态镜像接口：

- `GET /admin/server-state/summary`
- `GET /admin/server-state/accounts`
- `POST /admin/server-state/accounts/:provider/:accountId/:action`

关键后端文件：

- `src/routes/admin/accountPool.js`
- `src/routes/admin/serverState.js`
- `src/routes/admin/index.js`
- `src/services/accountPoolPolicyService.js`
- `src/services/accountPoolAutomationService.js`
- `src/services/serverStateService.js`
- `src/services/carherAdminSkillService.js`

### 3.3 调度策略

OpenAI 和 Claude 调度器已接入账号池策略：

- 调度前读取账号池策略。
- 按平台区分 OpenAI / Claude。
- 检查 5h、7d、成本、Token、请求数阈值。
- 对策略到量账号跳过调度。
- 策略导致的停用和恢复与远端真实异常、手动停用区分处理。

关键文件：

- `src/services/scheduler/unifiedOpenAIScheduler.js`
- `src/services/scheduler/unifiedClaudeScheduler.js`
- `src/services/account/claudeAccountService.js`
- `src/services/relay/claudeRelayService.js`

### 3.4 上游新能力已同步

当前分支已合并 `origin/main` 的近期更新，重点包括：

- Claude 专属账号不可用时不再静默回退共享池。
- 按模型家族隔离限流，例如 `opus`、`sonnet`、`haiku`、`fable`。
- 上游错误 TTL 上限和模型限流测试。
- Codex CLI / Droid CLI 教程和 payload 相关调整。

合并时主要冲突在 `src/services/scheduler/unifiedClaudeScheduler.js`，处理原则是同时保留：

- 本分支账号池策略 `accountPoolPolicyService`。
- 上游 `getRateLimitModelFamily` 模型家族限流。
- 上游 `config.claude.dedicatedAccountFallback` 专属账号 fallback 配置。

### 3.5 远端服务器状态镜像

本地后台通过 `serverStateService` 读取远端生产账号池状态。当前设计是只读优先，不把完整 key 或密码返回前端。

当前支持的数据来源包括：

- `carher-admin` 的 quota / account 脚本输出。
- canonical `state.json`，如果服务器存在。
- `acct-admin` API 快照。
- Claude guard 状态文件。

为了避免页面慢，已做：

- 后端短缓存。
- 并发请求合并。
- 前端默认读缓存。
- 手动刷新才强制拉远端。

## 4. 关键配置项

### 4.1 服务器状态读取

- `SERVER_STATE_JMS_TARGET`：远端目标机器，默认类似 `JSZX-AI-03`。
- `SERVER_STATE_JMS_CWD`：远端 `carher-admin` 工作目录，默认类似 `~/codes/carher-admin`。
- `SERVER_STATE_WSL_BIN`：Windows 本地调用 WSL 的路径，默认 `wsl.exe`。
- `SERVER_STATE_TIMEOUT_MS`：远端状态读取超时。
- `SERVER_STATE_QUOTA_TIMEOUT_MS`：quota 脚本读取超时。
- `SERVER_STATE_REMOTE_BASE`：远端 acct-admin API 地址。
- `SERVER_STATE_CANONICAL_PATH`：OpenAI canonical state 路径。
- `SERVER_STATE_QUOTA_COMMAND`：覆盖默认 quota 读取命令。
- `SERVER_STATE_ACCOUNT_MIRROR_CACHE_TTL_MS`：账号镜像缓存 TTL，默认 30000ms。

### 4.2 Claude guard

- `SERVER_STATE_CLAUDE_GUARD_TARGET`
- `SERVER_STATE_CLAUDE_GUARD_STATE_PATH`
- `SERVER_STATE_CLAUDE_GUARD_ACTIVE_PATH`

### 4.3 carher-admin 重置卡

- `CARHER_ADMIN_REPO`：本地或 WSL 可访问的 `carher-admin` 仓库路径。
- `CARHER_ADMIN_RESET_BANK_SCRIPT`：重置卡脚本路径，默认指向 `scripts/chatgpt-acct-reset-bank.sh`。
- `CARHER_ADMIN_RESET_BANK_TIMEOUT_MS`
- `CARHER_ADMIN_RESET_BANK_INNER_TIMEOUT_SECONDS`
- `CARHER_ADMIN_RESET_BANK_FULL_INNER_TIMEOUT_SECONDS`
- `CARHER_ADMIN_RESET_BANK_SWEEP_LIMIT`
- `CARHER_ADMIN_RESET_BANK_CACHE_TTL_MS`

### 4.4 高风险写操作开关

- `SERVER_STATE_LIVE_MUTATION_ENABLED=true`

默认不允许真实停用或恢复远端生产账号。只有确认权限、审计、回滚和操作流程后，才建议打开该开关。

## 5. 本地运行方式

后端：

```bash
npm install
node src/app.js
```

前端开发：

```bash
cd web/admin-spa
npm install
npm run dev -- --host 127.0.0.1 --port 5173
```

常用入口：

- 管理后台：`http://127.0.0.1:3100/admin-next/`
- 账号池策略页：`http://127.0.0.1:3100/admin-next/account-pool`
- 健康检查：`http://127.0.0.1:3100/health`

管理员账号密码不要写入仓库，使用环境变量、初始化脚本或 Redis 中已有配置。

## 6. 验证命令

后端重点测试：

```bash
npx jest tests/claudeAccountModelRateLimit.test.js tests/modelRateLimitFamily.test.js tests/unifiedClaudeSchedulerDedicated.test.js tests/upstreamErrorTtlCap.test.js --runInBand
```

账号池相关测试：

```bash
npx jest tests/accountPoolPolicyService.test.js tests/accountPoolAutomationService.test.js tests/carherAdminSkillService.test.js tests/unifiedClaudeSchedulerAccountPoolPolicy.test.js tests/unifiedOpenAIScheduler.test.js --runInBand
```

前端构建：

```bash
cd web/admin-spa
npm run build
```

完整检查可按仓库情况运行：

```bash
npm run lint:check
npm test
```

## 7. 当前限制和风险

- 远端账号真实停用/恢复默认关闭，当前主要是镜像读取、预演和本地策略执行。
- 前端显示的准确性依赖远端 `carher-admin` 脚本、canonical state、acct-admin API 是否可读。
- 如果 canonical `state.json` 不存在，系统会 fallback 到其他来源，但需要明确展示数据来源和更新时间。
- OpenAI 重置卡扫描依赖远端脚本，可能慢；建议后续改成后台任务 + 前端轮询。
- 目前仍需进一步统一“远端停用”“额度停用”“手动停用”“异常停用”的状态字段和 UI 展示。
- 仓库里部分上游文件历史上存在编码显示问题，后续不要在无关改动里批量格式化，避免扩大 diff。

## 8. 后续优先级

1. 先把服务器账号池状态做成权威数据源：明确数据来源、更新时间、失败原因、缓存命中状态。
2. 再完善策略执行审计：每次停用/恢复记录账号、原因、阈值、执行人、执行时间和前后状态。
3. 再接真实远端写操作：必须有二次确认、权限控制、回滚方式和操作日志。
4. 把重置卡扫描改成后台任务，前端只读任务结果，避免长请求拖慢页面。
5. 建立 API Key 到团队/用户/预算的分配模型，让账号池真正支持公司级成本治理。

## 9. 接手时建议先看

1. `src/services/serverStateService.js`：远端状态如何读取和缓存。
2. `src/services/accountPoolPolicyService.js`：5h/7d/成本/Token/请求数策略如何判断。
3. `src/services/scheduler/unifiedOpenAIScheduler.js`：OpenAI 调度如何跳过策略到量账号。
4. `src/services/scheduler/unifiedClaudeScheduler.js`：Claude 调度如何结合上游模型家族限流和本分支账号池策略。
5. `web/admin-spa/src/views/AccountPoolView.vue`：账号池页面如何组织展示和操作。
