---
name: crs-admin-openapi
description: 调用 Claude Relay Service 的管理 OpenAPI（API Key 管理与使用统计）。当需要由 Agent 通过环境变量中的管理员 token 自动执行“查询/创建/更新/删除 API Key、读取 usage/cost 统计趋势与明细”时使用。
---

# CRS Admin OpenAPI Skill

按以下流程调用 CRS 管理接口：

1. 从环境变量读取管理员 token，默认使用 `CRS_ADMIN_TOKEN`。
2. 使用 `Authorization: Bearer <token>` 调用 `/admin/*` 接口。
3. 写操作前先做一次只读确认（例如先查 key 再更新/删除）。

## Endpoint 入口

- OpenAPI YAML: `/openapi/admin-agent.yaml`
- OpenAPI JSON: `/openapi/admin-agent.json`
- 管理接口认证方式: `Authorization: Bearer $CRS_ADMIN_TOKEN`

## 环境变量

- `CRS_ADMIN_TOKEN`: 必填，CRS 管理员 token。
- `CRS_BASE_URL`: 可选，CRS 服务地址；未提供时默认使用当前服务地址。

## 标准调用流程

### 1) 读取环境变量

从环境变量读取：

```bash
CRS_ADMIN_TOKEN=...
CRS_BASE_URL=http://127.0.0.1:3000
```

如果缺少 `CRS_ADMIN_TOKEN`，立即停止并返回缺少凭据错误，不要尝试登录。

### 2) 只读查询（推荐先执行）

- 列表 API Keys: `GET /admin/api-keys`
- 用量趋势: `GET /admin/usage-trend`
- 成本汇总: `GET /admin/usage-costs`

列表 API Keys 时应主动使用排序和筛选参数，而不是只发默认请求。
`GET /admin/api-keys` 的响应 `data.items[]` 应视为完整列表行数据，不只包含 `id` 和 `name`，还包括绑定账户、权限、限流、标签、owner、usage、成本排序附加列等字段。

主要字段含义：

- `id`: API Key 记录 ID，不是明文 key。
- `name`: API Key 名称，用于列表展示和搜索。
- `description`: API Key 描述。
- `createdAt`: 创建时间。
- `lastUsedAt`: 最近使用时间；为空通常表示尚未使用。
- `expiresAt`: 过期时间；为空通常表示未设置固定过期时间。
- `createdBy`: 创建者标识，可能是 `admin` 或用户名。
- `userId`: 归属用户 ID；为空通常表示归属于管理员。
- `userUsername`: 归属用户名。
- `ownerDisplayName`: 后端补充的归属人展示名，适合直接展示。
- `isActive`: 当前是否启用。
- `isDeleted`: 是否已软删除。
- `deletedAt` / `deletedBy` / `deletedByType`: 软删除元数据。
- `permissions`: 允许访问的服务列表；空数组通常表示全部服务。
- `claudeAccountId` / `claudeConsoleAccountId` / `geminiAccountId` / `openaiAccountId` / `azureOpenaiAccountId` / `bedrockAccountId` / `droidAccountId`: 绑定的上游账户 ID；为空表示未绑定该类账户。
- `enableModelRestriction`: 是否启用模型限制。
- `restrictedModels`: 允许的模型列表；通常与 `enableModelRestriction` 联动理解。
- `enableClientRestriction`: 是否启用客户端限制。
- `allowedClients`: 允许的客户端列表；通常与 `enableClientRestriction` 联动理解。
- `allow1mContext`: 是否允许 1M 上下文相关能力。
- `tokenLimit`: token 限额配置。
- `concurrencyLimit`: 并发限制。
- `rateLimitWindow`: 限流时间窗口，单位通常为分钟。
- `rateLimitRequests`: 窗口内允许的请求数。
- `rateLimitCost`: 窗口内允许的费用额度。
- `dailyCostLimit`: 每日费用限制。
- `totalCostLimit`: 累计总费用限制。
- `weeklyOpusCostLimit`: 周费用限制字段，当前实现语义更接近 Claude 周费用限制。
- `weeklyResetDay` / `weeklyResetHour`: 周费用统计窗口的重置日与小时。
- `tags`: 标签数组。
- `serviceRates`: 服务倍率配置对象。
- `activationDays` / `activationUnit` / `expirationMode`: 激活后过期策略相关配置。
- `isActivated`: 是否已激活；激活模式下特别重要。
- `activatedAt`: 激活时间。
- `usage`: 列表中的聚合使用信息；当前至少可依赖 `usage.total.requests`、`usage.total.tokens`、`usage.total.cost`、`usage.total.formattedCost`。
- `_cost`: 当按费用排序时，后端附加的当前排序费用值；仅在部分排序场景下出现。

常用查询参数：

- `page` / `pageSize`: 分页。
- `searchMode` + `search`: 搜索。常见 `searchMode` 为 `apiKey`、`name`、`owner`、`bindingAccount`。
- `tag`: 按标签筛选。
- `isActive`: 按启用状态筛选，取值 `true` 或 `false`。
- `models`: 按模型限制筛选，多个模型用逗号分隔。
- `sortBy`: 排序字段，可用 `name`、`createdAt`、`expiresAt`、`lastUsedAt`、`isActive`、`status`、`cost`。
- `sortOrder`: 排序方向，`asc` 或 `desc`。
- `costTimeRange`: 当 `sortBy=cost` 时使用，可选 `today`、`7days`、`30days`、`all`、`custom`。
- `costStartDate` / `costEndDate`: 当 `costTimeRange=custom` 时必填。

常见查询示例：

- 最近创建的 key：`GET /admin/api-keys?page=1&pageSize=20&sortBy=createdAt&sortOrder=desc`
- 最近使用的 key：`GET /admin/api-keys?page=1&pageSize=20&sortBy=lastUsedAt&sortOrder=desc`
- 按 7 天成本倒序：`GET /admin/api-keys?page=1&pageSize=20&sortBy=cost&sortOrder=desc&costTimeRange=7days`
- 查找某个 owner 的 key：`GET /admin/api-keys?page=1&pageSize=20&searchMode=owner&search=alice`
- 查找带某标签且启用的 key：`GET /admin/api-keys?page=1&pageSize=20&tag=prod&isActive=true`

### 3) 写操作（需谨慎）

- 创建 Key: `POST /admin/api-keys`
- 更新 Key: `PUT /admin/api-keys/{keyId}`
- 软删除 Key: `DELETE /admin/api-keys/{keyId}`
- 恢复已删除 Key: `POST /admin/api-keys/{keyId}/restore`

## 安全与防误用

- 不调用高风险端点（索引重建、强制清空、永久删除等）。
- 批量写操作必须显式确认 `keyIds` 非空且数量符合预期。
- 删除前应先读取目标对象并记录待操作 ID。
- 不尝试通过用户名密码换取 token；只使用环境变量中已提供的 token。

## 最小示例

1. 读取 `CRS_ADMIN_TOKEN` 与 `CRS_BASE_URL`。
2. `GET /admin/api-keys?page=1&pageSize=20&sortBy=lastUsedAt&sortOrder=desc` 确认目标 key。
3. `PUT /admin/api-keys/{keyId}` 提交变更。
4. `GET /admin/api-keys/{keyId}/usage-records?limit=20` 验证结果。
