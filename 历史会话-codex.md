# 历史会话集成方案（Claude Relay Service）

## 目标与约束
- 为 API Key 提供会话历史记录，支持存储与查询用户/助手消息，定位问题与审计。
- 尽量少侵入现有请求链路，并保证在同步上游更新后能够快速复原功能。
- 数据结构需预留扩展空间（例如模型多版本、引用附件、执行耗时等字段）。
- 提供最基本的管理界面视图，便于在 Web 后台查看历史。
- 配置改动通过示例文件和集中常量管理，避免直接改写 `config/config.js`、`.env`。

## 数据模型
- 核心实体：会话（session）、消息（message）。
- Redis 结构：
  - `chat:sessions:<apiKey>`：Sorted Set，value 为 `sessionId`，score 为 `lastActivity`（时间戳）。
  - `chat:session:<sessionId>`：Hash，字段包含：
    - `apiKey`、`createdAt`、`lastActivity`、`messageCount`、`totalTokens`
    - `metadata`：JSON 字符串，记录模型、耗时、客户端标识等可扩展信息。
  - `chat:messages:<sessionId>`：List，元素为消息对象 JSON；字段预留：
    - `role` (`user` | `assistant` | `system`)
    - `content`
    - `model`
    - `tokens`
    - `latency`
    - `requestId`
    - `createdAt`
    - `attachments`（可空）
- 会话 ID：`session_${apiKeyHash}_${unix}_${rand}`；对外仅透出 `sessionId`。
- TTL 与容量：
  - 统一通过配置项控制（默认 30 天），会话与消息同步设置 TTL。
  - 当 `chat:messages:*` 长度超过上限时删除最早消息，并更新 `messageCount`。

## 服务架构调整
1. **服务封装**：新增 `src/services/history/` 目录，包含：
   - `sessionStore.js`: 负责 Redis 读写、TTL、分页。
   - `historyService.js`: 对外暴露创建/更新会话、追加消息、查询接口。
   - `historyConfig.js`: 导出配置常量（读取 `.env` 或默认值）。
2. **请求集成**：在 `src/routes/messages.js`（或实际入口）中：
   - 从 `req.apiKey`（由 `authenticateApiKey` 设定）读取 API Key 信息。
   - 请求进入时调用 `historyService.recordUserMessage(...)`，返回 `sessionId`。
   - 响应完成后记录助手消息；流式响应通过累积缓冲在 `finish` 事件写入。
   - 将 `sessionId` 透出到响应头或响应体（可选）。
   - 所有新增调用集中在 11 个文件，便于后续升级时重点 diff。
3. **查询接口**：新增 `src/routes/history.js` 路由：
   - `GET /api/history/sessions`：支持分页、按 `apiKey` 或时间范围过滤。
   - `GET /api/history/sessions/:sessionId/messages`
   - `DELETE /api/history/sessions/:sessionId`
   - 路由在 `src/routes/index.js` 中统一挂载，权限复用现有管理端鉴权逻辑。
4. **CLI**：在 `cli/commands/history.js` 中实现 `list`、`show <sessionId>`、`delete` 子命令。

## 前端界面入口
- 在 `web/admin-spa` 中新增 `HistoryView.vue` 并挂载到 `/history`。
  - 通过主导航 TabBar 暴露“会话历史”入口（仅管理员，沿用主布局）。
  - 页面内含 API Key 下拉、会话列表、消息详情与删除操作，调用新增 REST 接口获取数据。
  - 统一使用现有玻璃态样式与响应式断点，避免额外依赖。
- 若短期内无法完成前端，可先通过 CLI/API 提供功能，保留 TODO。

## 配置与管理
- 新建示例文件：
  - `config/history.example.js`：包含默认阈值、Redis key 前缀、TTL、容量限制、是否启用等。
  - `.env.history.example`：列出可配置的环境变量，如 `CHAT_HISTORY_ENABLED`、`CHAT_HISTORY_TTL_DAYS`、`CHAT_HISTORY_MAX_MESSAGES`。
- 在真实环境中：
  - 使用 `config/history.example.js` 复制生成 `config/history.js`；在 `config/config.js` 中仅引用一次 `require('./history')`，避免直接改写主配置文件。
  - `.env` 通过 `env-cmd` 或 `dotenv` 读取时合并 `.env.history`，也可以在 `README` 指导部署者手工添加变量。
- 所有默认值放在 `historyConfig.js`，读取 `.env` 时设有 fallback，保持向后兼容。

## 升级兼容策略
- 记录改动触达的文件列表（如 `src/routes/messages.js`、`src/services/history/*`、`config/history.js`、前端入口），强化代码审查时的关注点。
- 编写自动化测试（见下节），在拉取 upstream 后先运行测试，确保会话写入逻辑仍生效。
- 保持历史服务层与请求路由之间的接口简单稳定（主要依赖 `recordUserMessage` / `recordAssistantMessage`），减少与内部实现的耦合。

## 测试与验证
- **单元测试**：
  - `historyService.test.js`: 覆盖会话新建、消息追加、容量限制、TTL 设置。
  - 使用 Redis mock 或轻量本地 Redis 实例；重点验证 JSON 序列化和异常场景。
- **集成测试**：
  - 使用 Supertest 调用消息 API，断言 Redis 中会话/消息写入正确。
  - 覆盖流式响应（模拟 SSE chunk）确保最终助手消息完整。
- **端到端测试**：
  - 在 CLI 或 REST 层调用查询接口，确认列表/详情返回符合预期。
  - 前端页面（如有）可使用 Cypress 或 Vitest + Playwright 做烟雾测试。

## 风险与缓解
| 风险 | 描述 | 缓解措施 |
|----|----|----|
| 升级被覆盖 | 上游重新组织消息路由或响应逻辑可能导致调用点丢失 | 通过测试保护、改动清单、版本升级前仔细 diff 重点文件；将历史钩子封装为独立函数，减少散布改动 |
| 数据膨胀 | Redis 中会话/消息无限增长 | TTL + 最大会话/消息上限；定期运行清理脚本（可放在 `scripts/purge-history.js`） |
| 敏感信息泄露 | 消息正文可能包含敏感数据 | 提供脱敏配置选项（例如存储前调用回调），或允许禁用助手消息存储；历史接口默认限制为管理员访问 |
| 流式处理中断 | 流式响应防止写入残缺内容 | 在 `claudeRelayService` 中利用现有事件，确保 `finish`/`error` 时都执行回写；错误场景下标记消息状态 |
| 配置错乱 | `.env`、`config/config.js` 被直接改写风险 | 使用独立配置文件和示例，引导开发者通过 `require('./history')` 方式加载，并在文档中强调不要直接覆盖主配置 |

## 实施步骤
1. 创建 `src/services/history/` 目录与基础模块，定义 Redis 结构和配置读取。
2. 在消息路由/服务层接入历史写入调用，验证普通请求与流式请求都能生成记录。
3. 增加 REST/CLI 查询接口，完善权限检查，并约定 `X-CRS-Session-Id`、`X-CRS-New-Session` 等控制信号。
4. 引入 sticky 会话聚合：基于调度器生成的会话哈希复用历史记录，结合 `CHAT_HISTORY_STICKY_TTL_SECONDS` 和显式“新会话”信号控制映射刷新。
5. 编写清理脚本、单元与集成测试，更新 `README`、`AGENTS.md`、`CLAUDE.md`。
6. 若时间允许，补充 Web 管理界面入口，否则记录后续任务。

以上方案聚焦后端落地，兼顾扩展与升级安全，后续如需拓展更多维度（例如多租户、多模型分析），可以在 `metadata` 字段中持续演进。
