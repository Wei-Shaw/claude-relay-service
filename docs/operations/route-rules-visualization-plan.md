# 路由规则可视化落地计划

## 背景

当前账户管理页能看到账户状态、今日用量、余额/配额、会话窗口、优先级、代理和调度开关，但管理员很难从“请求会被路由到哪里”这个角度理解系统行为。

目标是新增一个管理后台页面，用图形化方式解释：

- 不同 endpoint 接受哪些 model。
- 每个 model 会进入哪个调度器和账户池，并能点击 model 查看对应账户。
- 候选账户为什么可路由、降权或被排除。
- 当前 live RPM、TPM、活跃请求、排队、p95、429/限流如何分布到账户，窗口与首页卡片一致使用 5 分钟。
- 账户权重如何影响候选账户排序和高亮。
- Account 自身的服务可用性，包括官方状态、探测延迟、端点 PING、7 天成功率和历史状态条。

当前设计稿位置：

- `output/playwright/route-rules-visual-design-v2.html`
- `output/playwright/route-rules-visual-design-v2.png`

本文件只描述落地方案，暂不实现代码。

## 产品形态

页面入口建议放在现有后台横向导航中，名称为“路由规则”，与“账户管理”“请求明细”同级。

首屏结构：

- 顶部筛选区：
  - Endpoint 下拉，默认 `Claude`。
  - API Key 下拉或搜索，默认全部/当前选中。
  - Live 刷新间隔，默认 5 秒。
  - 排序口径，默认 `权重优先`。
- 左侧说明区：
  - 当前 endpoint 名称和实际路径，例如 `Claude` / `/api/v1/messages`。
  - 接受的 model 列表，例如 `claude-sonnet-*`、`claude-opus-*`、`ccr,claude-*`，每个 model 是可点击筛选项。
  - 不常驻展示过滤和权重规则摘要，左侧空间优先留给 model 列表；规则说明放到顶部 hint/popover。
- 中间账户卡片区域：
  - 不使用桑基图作为第一期主交互，避免画面过重。
  - 左侧点击 model 后，右侧账户卡片按“可路由、候选/降权、排除”分组或高亮。
  - 默认选中 endpoint 的主模型，例如 Claude 下默认 `claude-sonnet-4.5`。
  - account 卡片展示 RPM/TPM、今日/限额、活跃/排队、p95、priority/effectiveWeight、状态、可用性和排除原因。
  - account 可用性与路由结果分开表达：上游健康正常但 model 不匹配时，卡片显示“官方状态正常 / 当前 endpoint 不进入”；手动停调度时显示“服务可用但调度关闭”。
  - 未匹配当前 model 的账户可以折叠在“其他账户/不匹配”区域，避免误认为可路由。
- 顶部 live 指标：
  - RPM (5分钟)
  - TPM (5分钟)
  - 活跃/排队
  - p95 / 429

动效只用于表达 live 状态，例如脉冲点、数值刷新、卡片边框轻微高亮。不要使用持续流动线条，以免影响读图。

## Endpoint 定义

第一期只做静态定义加后端 explain，避免从 Express 路由自动反射。

建议内置 endpoint 配置：

```text
claude:
  label: Claude
  paths:
    - /api/v1/messages
  scheduler: unifiedClaudeScheduler
  acceptedModels:
    - claude-*
    - sonnet / opus / haiku aliases
    - ccr,claude-*
    - Bedrock anthropic.* / *.claude*

openai:
  label: OpenAI Chat Completions
  paths:
    - /v1/chat/completions
  scheduler: unifiedOpenAIScheduler or bridge-specific scheduler
  acceptedModels:
    - gpt-*
    - o-series
    - configured OpenAI account supportedModels

openaiResponses:
  label: OpenAI Responses
  paths:
    - /v1/responses
  scheduler: unifiedOpenAIScheduler
  acceptedModels:
    - responses account supported models

gemini:
  label: Gemini
  paths:
    - /v1beta/models/*:generateContent
    - /v1/models/*
  scheduler: unifiedGeminiScheduler
  acceptedModels:
    - gemini-*
    - api: Gemini API accounts when enabled

droid:
  label: Droid
  paths:
    - Droid routes
  scheduler: droidScheduler
```

## 后端接口

新增 admin 路由文件：

```text
src/routes/admin/routeRules.js
```

并在：

```text
src/routes/admin/index.js
```

注册 admin 认证后的接口。

建议接口：

```text
GET /admin/route-rules/endpoints
GET /admin/route-rules/explain
GET /admin/route-rules/live
```

### GET /admin/route-rules/endpoints

返回可选 endpoint、路径、默认 model、说明和支持的 model pattern。

用途：

- Endpoint 下拉。
- 左侧“接受的 model”区域。
- 初始页面渲染。

### GET /admin/route-rules/explain

查询参数：

```text
endpoint=claude
model=claude-sonnet-4.5
apiKeyId=optional
includeExcluded=true
```

返回当前规则解释，不执行真实请求。

核心返回结构建议：

```json
{
  "endpoint": {
    "id": "claude",
    "label": "Claude",
    "paths": ["/api/v1/messages"],
    "scheduler": "unifiedClaudeScheduler"
  },
  "models": [
    {
      "id": "claude-sonnet-4.5",
      "accepted": true,
      "modelFamily": "claude",
      "candidateCount": 5,
      "excludedCount": 3,
      "selected": true
    }
  ],
  "accounts": [
    {
      "id": "account-id",
      "name": "ai-pincc-cc",
      "platform": "claude-console",
      "accountType": "shared",
      "groupNames": ["default"],
      "priority": 49,
      "effectiveWeight": 49,
      "matchedModels": ["claude-sonnet-4.5"],
      "permissionAllowed": true,
      "highlightForSelectedModel": true,
      "routeStatus": "routable",
      "routeReason": "active, schedulable, model supported",
      "excludedReasons": [],
      "supportedModels": ["claude-sonnet-4.5"],
      "health": {
        "officialStatus": "normal",
        "conversationLatencyMs": 1361,
        "endpointPingMs": 133,
        "availability7d": 97.41,
        "successCount7d": 9819,
        "totalCount7d": 10080,
        "history60": ["ok", "ok", "warn", "ok"]
      },
      "daily": {
        "requests": 3743,
        "tokens": 290930000,
        "cost": 215.45,
        "quota": 599.98
      },
      "concurrency": {
        "active": 3,
        "limit": null,
        "queued": 0
      }
    }
  ],
  "modelAccountMap": {
    "claude-sonnet-4.5": {
      "routable": ["account-id"],
      "degraded": [],
      "excluded": []
    }
  }
}
```

### GET /admin/route-rules/live

查询参数：

```text
endpoint=claude
windowSeconds=300
apiKeyId=optional
```

返回 live 指标，不重复返回全部账户详情。

建议返回：

```json
{
  "windowSeconds": 300,
  "summary": {
    "rpm": 19.6,
    "tpm": 1220000,
    "activeRequests": 9,
    "queuedRequests": 3,
    "p95Ms": 1800,
    "rateLimitedCount": 2
  },
  "models": {
    "claude-sonnet-4.5": {
      "rpm": 11.4,
      "tpm": 263000,
      "trafficPercent": 61
    }
  },
  "accounts": {
    "account-id": {
      "rpm": 7.8,
      "tpm": 180000,
      "activeRequests": 3,
      "queuedRequests": 0,
      "p95Ms": 1200,
      "rateLimited": false,
      "health": {
        "officialStatus": "normal",
        "conversationLatencyMs": 1361,
        "endpointPingMs": 133,
        "availability7d": 97.41,
        "history60": ["ok", "ok", "warn", "ok"]
      }
    }
  },
  "highlights": {
    "selectedModel": "claude-sonnet-4.5",
    "accountIds": ["account-id"]
  }
}
```

## 服务层设计

新增 service：

```text
src/services/routeRuleVisualizationService.js
```

职责：

- 聚合 endpoint 静态定义。
- 调用现有账户服务获取各平台账户。
- 复用调度器过滤规则的关键判断，生成 explain 结果。
- 聚合 live 指标。
- 统一生成 graph nodes/links。

不要让 route 直接拼装业务逻辑。route 只负责参数解析、认证和响应。

### 规则复用优先级

优先复用现有代码：

- `src/services/scheduler/unifiedClaudeScheduler.js`
- `src/services/scheduler/unifiedGeminiScheduler.js`
- `src/services/scheduler/unifiedOpenAIScheduler.js`
- `src/services/scheduler/droidScheduler.js`
- `src/utils/commonHelper.js`
- 各账户 service 的 rate limit / quota / active 判断。

如果现有 scheduler 只有私有方法，第一期不要大规模重构 scheduler。可以在 visualization service 中实现只读 mirror 判断，但必须用测试锁住与调度器关键规则的一致性。

第二期再考虑从 scheduler 提取公共只读 explain helper。

## Live 指标来源

第一期优先使用已有数据，不引入新存储。

可用来源：

- 请求明细：按最近 5 分钟聚合 endpoint、model、account 的请求数、tokens、latency、status。
- 用量统计：补充 tokens/cost。
- 并发控制 Redis：读取当前账户 active 和 queued 状态。
- 账户状态字段：rateLimitStatus、tempUnavailable、schedulable、dailyQuota、usage.daily。
- 可用性探测：复用账户测试/健康检查结果；如果没有现成持久化，第一期只展示最近请求成功率、p95 和当前状态，第二期再补独立探测历史。

如果请求明细采集关闭，live 区域要显示“请求明细采集未开启，live RPM/TPM 不可用”，但 explain 图仍应可用。

live 刷新建议：

- 前端默认 5 秒轮询。
- 切换 endpoint/model/API Key 时立即刷新 explain 和 live。
- 页面不可见时暂停轮询。
- 后端接口限制 `windowSeconds` 最大值，例如 300 秒。

## 前端落点

新增页面：

```text
web/admin-spa/src/views/RouteRulesView.vue
```

新增 API 工具方法：

```text
web/admin-spa/src/utils/http_apis.js
```

建议方法名：

```text
getRouteRuleEndpointsApi
getRouteRuleExplainApi
getRouteRuleLiveApi
```

路由接入：

```text
web/admin-spa/src/router/index.js
```

新增导航入口需要检查：

```text
web/admin-spa/src/components/layout/MainLayout.vue
web/admin-spa/src/components/layout/AppHeader.vue
web/admin-spa/src/components/layout/TabBar.vue
```

实际导航结构以当前代码为准，避免新增第二套路由外壳。

### 账户卡片组件

第一期建议使用模型筛选 + 账户卡片，不引入图表库：

- 这页的核心动作是“点击某个 model，查看哪些 account 会参与路由”。
- 账户卡片比桑基图更贴近现有账户管理页，也更适合承载今日用量、限额、并发、p95、排除原因等字段。
- 左侧 model 列表可能很长，不能被解释性说明卡片挤占；说明文字只作为 hint 入口，需要时展开。
- 账户卡片按当前选中 model 的相关性排序：可路由优先，其次候选/降权，最后排除或不匹配。
- 被当前 model 命中的账户使用边框、背景和角标高亮；未命中的账户默认折叠或弱化。
- 避免额外依赖和包体积。

组件拆分建议：

```text
RouteRulesView.vue
RouteEndpointPanel.vue
RouteModelSelector.vue
RouteAccountGrid.vue
RouteAccountNode.vue
RouteLiveSummary.vue
```

如果后续需要展示跨 endpoint 的总体流量拓扑，再单独评估 `d3-sankey` 作为高级视图，不作为第一期默认视图。

## 权重口径

页面需要明确区分两种 value：

- `effectiveWeight`：账户调度倾向，主要来自 priority、绑定、分组、可用性。
- `traffic`：最近 5 分钟窗口内真实 RPM/TPM。

默认显示：

```text
按选中 model 展示权重优先排序
```

含义：

- 左侧 model 列表展示最近 5 分钟窗口流量占比和候选账户数。
- 右侧账户卡先过滤当前 API Key 或分组权限、模型权限和 endpoint 匹配结果。
- 有权限且可路由的账户按 `effectiveWeight` 降序排序，同权再看 live RPM、lastUsedAt。
- 候选/降权、排除或不匹配账户放在可路由账户之后，并保留原因。
- 没有 live 数据时，账户排序回退到 `effectiveWeight` 和 `priority`。
- 权重用排序、数值、进度条或小型热度条表达，不用流向线表达。

账户卡必须同时显示：

- priority
- routeStatus
- effectiveWeight
- live RPM/TPM (5分钟)
- 今日/限额
- active/queued
- p95
- account availability：官方状态、对话延迟、端点 PING、7 天成功率、60 点历史条
- 排除原因

## 安全和性能约束

- 不返回 OAuth token、refreshToken、API key、credentials、代理密码。
- 账户 ID 可返回完整值，但前端默认只展示名称和短 ID。
- explain 接口不能触发真实上游请求。
- live 聚合必须有时间窗口和上限，避免全量扫描。
- 如果 PostgreSQL request_details 已启用，应优先走 PG 查询；Redis 请求明细只作为兼容路径。
- live 接口失败不应影响账户调度。

## 分阶段实施

### Phase 1：只读 explain 账户卡片

目标：

- 新增 `/admin/route-rules/endpoints`。
- 新增 `/admin/route-rules/explain`。
- 前端新增页面和导航。
- 支持 endpoint 下拉，默认 Claude。
- 左侧展示 endpoint 接受的 model，点击 model 后右侧账户卡联动高亮。
- 展示账户状态、priority、排除原因、今日用量、限额、并发、可用性摘要。

验收：

- Claude endpoint 能看到 Console/OAuth/Bedrock/CCR 的候选和排除关系。
- OpenAI/Gemini 账户不会误显示成 Claude 可路由账户。
- 手动停调度、限流、额度超限、模型不支持都能显示原因。

### Phase 2：Live 指标

目标：

- 新增 `/admin/route-rules/live`。
- 聚合最近 5 分钟 RPM/TPM/p95/active/queued/429。
- 聚合或读取账户可用性：官方状态、对话延迟、端点 PING、7 天成功率和 60 点历史。
- 前端 5 秒轮询刷新。
- 页面不可见暂停轮询。
- model chip 和账户卡支持 RPM/TPM (5分钟) 口径、活跃/排队和 p95 刷新。

验收：

- 真实请求发生后，对应 endpoint/model/account 的 RPM 和 TPM 会更新。
- 上游异常、429 尖峰或探测失败后，对应 account 的历史条和可用性会更新。
- 请求明细采集关闭时显示明确空态。
- live 接口失败时保留 explain 图并显示错误提示。

### Phase 3：可解释调度细节

目标：

- 对单个 model 或 account 展开规则详情。
- 展示命中的 API Key 绑定、group、sticky session、vendor prefix、model mapping。
- 支持“模拟请求”输入 model/API Key/sessionHash，返回 explain，不发上游。

验收：

- 管理员能回答“为什么这个 model 没走某个账户”。
- 管理员能回答“为什么这个请求固定到某个账户”。

## 测试计划

后端单测：

- `tests/routeRuleVisualizationService.test.js`
- `tests/routeRulesRoute.test.js`

重点覆盖：

- endpoint 定义返回。
- Claude model 支持判断。
- CCR vendor prefix 只进入 CCR 池。
- API Key 专属账户优先。
- group 账户池过滤。
- inactive / schedulable=false / rate limited / quota exceeded 排除原因。
- live 数据缺失时降级。
- 敏感字段不会出现在响应中。

前端验证：

- `npm run build:web`
- Playwright 截图检查桌面宽度。
- 检查浅色/暗色模式。
- 检查长账户名、长 model、中文排除原因不溢出。

## 暂不做

- 暂不改真实调度逻辑。
- 暂不引入新的上游请求或真实探测。
- 暂不把 scheduler 大规模重构成 explainable scheduler。
- 暂不做移动端复杂图谱交互；移动端可以先降级为列表/矩阵。
- 暂不新增持久化表，除非 live 查询现有请求明细性能不足。
