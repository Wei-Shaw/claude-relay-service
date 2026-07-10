# OpenAI + Claude 账号池接手文档

本文档面向后续接手开发/运维人员，说明当前系统在 `claude-relay-service` 基础上新增的 OpenAI + Claude 公司级账号池能力、关键入口、运行方式和后续待办。

## 1. 系统目标

当前系统是在成熟的 `Wei-Shaw/claude-relay-service` 上继续改造，目标是把多个公司合法持有或授权管理的 OpenAI / Claude 账号聚合为统一账号池，并通过管理后台和代理网关实现：

- 统一 API Key 管理：给不同用户或团队分配独立网关 Key。
- OpenAI + Claude 账号池调度：共享池、专属账号、账号分组共存。
- 5h / 7d 限额治理：按账号的小时级窗口与 7 天周期窗口判断是否可调度。
- 混合阈值治理：成本、Token、请求数、5h、7d 任一到量即可停止调度。
- 自动停用与恢复：到量账号从调度池移除，恢复窗口到期后重新参与调度。
- 服务器状态镜像：本地管理后台展示远端 `carher-admin` / 生产账号池状态。
- 重置卡探测和调度权重：优先展示和排序有重置卡、重置卡即将到期的 OpenAI 账号。

## 2. 当前已实现

### 2.1 管理后台页面

- 新增账号池页面：`/admin-next/account-pool`
- 页面入口在前端路由与 Tab 中注册，只聚焦 OpenAI + Claude。
- 页面包含：
  - 账号池策略配置。
  - 服务器账号池镜像。
  - 策略预演结果。
  - OpenAI 重置卡扫描/优先级展示。
  - 本地策略执行入口。
  - `carher-admin` 只读/预演桥接入口。

关键文件：

- `web/admin-spa/src/views/AccountPoolView.vue`
- `web/admin-spa/src/components/dashboard/ServerStatePanel.vue`
- `web/admin-spa/src/components/dashboard/AccountPoolShadowPanel.vue`
- `web/admin-spa/src/components/dashboard/AccountPoolSummaryPanel.vue`
- `web/admin-spa/src/router/index.js`
- `web/admin-spa/src/utils/http_apis.js`

### 2.2 后端管理接口

新增后台接口：

- `GET /admin/account-pool/summary`
- `GET /admin/account-pool/policy`
- `PUT /admin/account-pool/policy`
- `GET /admin/account-pool/shadow`
- `POST /admin/account-pool/sweep`
- `POST /admin/account-pool/admin-skill/action`
- `GET /admin/server-state/summary`
- `GET /admin/server-state/accounts`
- `POST /admin/server-state/accounts/:provider/:accountId/:action`

关键文件：

- `src/routes/admin/accountPool.js`
- `src/routes/admin/serverState.js`
- `src/routes/admin/index.js`

### 2.3 账号池策略服务

策略服务负责判断账号是否还能调度。当前支持：

- OpenAI / Claude 分平台阈值。
- 5h 利用率阈值。
- 7d 利用率阈值。
- 日成本阈值。
- 日 Token 阈值。
- 日请求数阈值。
- 策略停用账号只在策略恢复时自动恢复，避免误恢复手动停用/远端异常账号。

关键文件：

- `src/services/accountPoolPolicyService.js`
- `src/services/accountPoolAutomationService.js`
- `tests/accountPoolPolicyService.test.js`
- `tests/accountPoolAutomationService.test.js`

### 2.4 调度器接入

OpenAI 和 Claude 调度器已经接入账号池策略，调度前会跳过已命中策略阈值的账号。

关键文件：

- `src/services/scheduler/unifiedOpenAIScheduler.js`
- `src/services/scheduler/unifiedClaudeScheduler.js`
- `tests/unifiedOpenAIScheduler.test.js`
- `tests/unifiedClaudeSchedulerAccountPoolPolicy.test.js`

### 2.5 服务器状态镜像

本地后台通过 `serverStateService` 读取远端生产账号池状态，用于展示真实服务器账号池概况。当前支持多级数据源：

1. `carher-admin` quota 脚本。
2. canonical `state.json`。
3. `acct-admin` API 快照。
4. Claude `ccmax-pool-guard` 状态。

为了解决页面慢的问题，账号镜像读取已经加入：

- 30 秒短缓存。
- 并发请求合并。
- `force=true` 强制刷新。
- 前端默认只读缓存，手动刷新才强制拉远端。

关键文件：

- `src/services/serverStateService.js`
- `src/routes/admin/serverState.js`
- `tests/serverStateService.test.js`
- `tests/adminServerStateRoute.test.js`

### 2.6 carher-admin 能力桥接

`carherAdminSkillService` 是受控桥接层，用来调用已有 `carher-admin` 能力，而不是在本系统内重复实现所有远端运维逻辑。

当前支持动作：

- `refresh_mirror`：强制刷新服务器账号池镜像。
- `openai_sweep_dry_run`：调用现有账号池策略预演。
- `openai_refresh_account`：刷新单个 OpenAI 账号。
- `openai_reset_bank_probe`：探测指定 OpenAI 账号重置卡。
- `openai_reset_bank_sweep`：按优先级探测重置卡。
- `openai_reset_bank_full_sweep`：全量镜像 + 优先级探测。
- `openai_pause_account` / `openai_resume_account`：默认禁用，只有显式打开 live mutation 才可用。

关键文件：

- `src/services/carherAdminSkillService.js`
- `tests/carherAdminSkillService.test.js`
- `docs/superpowers/specs/2026-07-09-carher-admin-skill-bridge-design.md`
- `docs/superpowers/plans/2026-07-09-carher-admin-skill-bridge.md`

## 3. 关键环境变量

### 3.1 服务器状态读取

- `SERVER_STATE_JMS_TARGET`：默认 `JSZX-AI-03`，远端目标机器。
- `SERVER_STATE_JMS_CWD`：默认 `~/codes/carher-admin`，远端/WSL 中 `carher-admin` 工作目录。
- `SERVER_STATE_WSL_BIN`：默认 `wsl.exe`，Windows 本地通过 WSL 调用远端脚本。
- `SERVER_STATE_TIMEOUT_MS`：远端读取默认超时。
- `SERVER_STATE_QUOTA_TIMEOUT_MS`：quota 脚本读取超时。
- `SERVER_STATE_REMOTE_BASE`：默认 `http://127.0.0.1:8910`，远端 acct-admin API 基地址。
- `SERVER_STATE_CANONICAL_PATH`：OpenAI canonical state 路径。
- `SERVER_STATE_QUOTA_COMMAND`：覆盖默认 quota 读取命令。
- `SERVER_STATE_ACCOUNT_MIRROR_CACHE_TTL_MS`：账号镜像缓存 TTL，默认 30000 ms。

### 3.2 Claude guard

- `SERVER_STATE_CLAUDE_GUARD_TARGET`：默认 `cc-proxy`。
- `SERVER_STATE_CLAUDE_GUARD_STATE_PATH`：默认 `/Data/ccmax-pool-guard/state.json`。
- `SERVER_STATE_CLAUDE_GUARD_ACTIVE_PATH`：默认 `/Data/ccmax-pool-guard/active-upstreams.json`。

### 3.3 carher-admin 重置卡

- `CARHER_ADMIN_REPO`：本地/WSL 可访问的 `carher-admin` 仓库路径。
- `CARHER_ADMIN_RESET_BANK_SCRIPT`：重置卡脚本路径，默认指向 `scripts/chatgpt-acct-reset-bank.sh`。
- `CARHER_ADMIN_RESET_BANK_TIMEOUT_MS`：重置卡外层超时。
- `CARHER_ADMIN_RESET_BANK_INNER_TIMEOUT_SECONDS`：普通扫描内层超时，默认 20 秒。
- `CARHER_ADMIN_RESET_BANK_FULL_INNER_TIMEOUT_SECONDS`：全量扫描内层超时，默认 240 秒。
- `CARHER_ADMIN_RESET_BANK_SWEEP_LIMIT`：优先扫描账号上限，默认 24。
- `CARHER_ADMIN_RESET_BANK_CACHE_TTL_MS`：重置卡扫描缓存 TTL，默认 120000 ms。

### 3.4 高风险写操作开关

- `SERVER_STATE_LIVE_MUTATION_ENABLED=true`

默认不允许真实停用/恢复远端账号。只有确认生产操作流程、权限、回滚方案后才能打开该开关。

## 4. 本地运行

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
- 账号池页面：`http://127.0.0.1:3100/admin-next/account-pool`
- 健康检查：`http://127.0.0.1:3100/health`

管理员账号密码不应写入仓库。请使用环境变量、初始化脚本或 Redis 中已配置凭据。

## 5. 验证命令

本次开发常用验证：

```bash
npx jest tests/serverStateService.test.js tests/adminServerStateRoute.test.js tests/adminAccountPoolRoute.test.js --runInBand
```

```bash
cd web/admin-spa
npm run build
```

可按需增加：

```bash
npx jest tests/accountPoolPolicyService.test.js tests/accountPoolAutomationService.test.js tests/carherAdminSkillService.test.js tests/unifiedClaudeSchedulerAccountPoolPolicy.test.js tests/unifiedOpenAIScheduler.test.js --runInBand
```

## 6. 当前限制

- 本地后台目前主要做展示、预演和本地策略写入；真实远端停用/恢复默认禁止。
- 远端账号状态准确性依赖 `carher-admin` 脚本、canonical state、acct-admin API、Claude guard 文件是否可读。
- OpenAI 重置卡扫描可能慢，已加缓存，但全量扫描仍依赖远端脚本速度。
- `README.md` 上游存在乱码显示问题，不是本次账号池改造引入。
- 前端构建存在历史 `console` warning 和 chunk 体积 warning，不影响当前功能。

## 7. 后续建议

1. 将生产环境的数据读取方式收敛为一个权威接口，减少对多份 state 文件和脚本输出格式的依赖。
2. 为 `SERVER_STATE_LIVE_MUTATION_ENABLED=true` 增加更严格的二次确认、审计日志和操作回滚说明。
3. 将重置卡扫描改成后台任务 + 前端轮询，避免用户等待长请求。
4. 增加账号池策略执行日志页面，展示每次停用/恢复的原因、操作者、前后状态。
5. 增加 API Key 到账号池的租户/团队维度配额分配策略。
6. 梳理前端乱码文件并统一编码/行尾，减少后续格式化噪音。

## 8. 接手优先级

如果接手者只做三件事，建议顺序如下：

1. 先确认 `/admin-next/account-pool` 能稳定读取服务器镜像，且数据源标识准确。
2. 再确认调度器跳过策略停用账号的行为符合 5h/7d 预期。
3. 最后再评估是否打开真实远端停用/恢复能力。
