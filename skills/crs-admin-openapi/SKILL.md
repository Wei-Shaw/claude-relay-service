---
name: crs-admin-openapi
description: 通过 mcporter 调用 Claude Relay Service 的管理 MCP 服务 `crs-admin`，执行 API Key 管理与 usage/cost 统计查询。当用户要查询、创建、更新、删除 API Key，或读取 usage/cost 趋势与明细时，必须使用这个 skill。
---

# CRS Admin MCP Skill

使用 `mcporter` 调用 Claude Relay Service 的远程管理 MCP 服务 `crs-admin`，不要再直接手写 HTTP 请求访问 `/admin/*`。主流程优先使用远程 `/admin/mcp`；仓库内的本地 stdio 配置仅用于开发/调试。

## 前置条件

需要两个输入：

```bash
CRS_BASE_URL=https://your-host
CRS_ADMIN_TOKEN=...
```

- `CRS_BASE_URL`: CRS 服务地址。
- `CRS_ADMIN_TOKEN`: 管理员 Bearer Token。缺失时立即停止，不擅自尝试登录。

推荐先做一次远程 server 配置：

```bash
mcporter config add crs-admin \
  --url "${CRS_BASE_URL}/admin/mcp" \
  --header "Authorization=Bearer ${CRS_ADMIN_TOKEN}"
```

## 标准调用流程

### 1) 查看可用 tools

先确认远程 MCP 服务和 schema：

```bash
mcporter list crs-admin --schema
```

所有管理能力通过 `crs-admin.<operationId>` 调用。

### 2) 统一输入结构

所有 tool 统一使用：

```json
{
  "path": {},
  "query": {},
  "body": {}
}
```

- `path`: 路径参数，对应 OpenAPI 中的 path variable。
- `query`: 查询参数，对应 URL query。
- `body`: 请求体，对应原管理接口 JSON body。

字段名必须直接对齐当前管理接口定义，不要自创字段名。

### 3) 先读后写

写操作前先做只读确认。例如更新或删除 API Key 时，先查列表或查 usage 记录确认目标对象。

常用只读 tools：

- `crs-admin.listApiKeys`
- `crs-admin.listDeletedApiKeys`
- `crs-admin.listApiKeyTags`
- `crs-admin.getUsageTrend`
- `crs-admin.getUsageCosts`
- `crs-admin.getApiKeyUsageRecords`

### 4) 执行写操作

常用写操作 tools：

- `crs-admin.createApiKey`
- `crs-admin.updateApiKey`
- `crs-admin.deleteApiKey`
- `crs-admin.restoreApiKey`
- `crs-admin.batchCreateApiKeys`
- `crs-admin.batchUpdateApiKeys`
- `crs-admin.batchDeleteApiKeys`
- `crs-admin.createApiKeyTag`
- `crs-admin.renameApiKeyTag`
- `crs-admin.deleteApiKeyTag`

批量写操作必须显式确认 `body.keyIds` 非空且数量符合预期。

## 示例

### 查询最近创建的 API Keys

```bash
mcporter call crs-admin.listApiKeys \
  --args '{"query":{"page":1,"pageSize":20,"sortBy":"createdAt","sortOrder":"desc"}}'
```

### 查询最近使用的 API Keys

```bash
mcporter call crs-admin.listApiKeys \
  --args '{"query":{"page":1,"pageSize":20,"sortBy":"lastUsedAt","sortOrder":"desc"}}'
```

### 按 7 天成本倒序查询

```bash
mcporter call crs-admin.listApiKeys \
  --args '{"query":{"page":1,"pageSize":20,"sortBy":"cost","sortOrder":"desc","costTimeRange":"7days"}}'
```

### 查询今日API-KEY用量排行

```bash
mcporter call crs-admin.listApiKeys \
  --args '{"query":{"page":1,"pageSize":100,"searchMode":"apiKey","sortBy":"cost","sortOrder":"desc","costTimeRange":"today","timeRange":"today"}}'
```

### 更新指定 API Key

```bash
mcporter call crs-admin.updateApiKey \
  --args '{"path":{"keyId":"key_123"},"body":{"name":"new-name"}}'
```

### 查询指定 API Key 的 usage records

```bash
mcporter call crs-admin.getApiKeyUsageRecords \
  --args '{"path":{"keyId":"key_123"},"query":{"limit":20}}'
```

## 仓库开发/自测

如果你正在本仓库内调试，可以继续使用 [config/mcporter.json](/Users/t3ls/workspace/claude-relay-service/config/mcporter.json) 里的本地 stdio `crs-admin`。

- 这条路径仅用于开发和自测，不是客户端主接入方式。
- 本地 stdio 模式仍依赖仓库代码、`npm install` 和 `CRS_ADMIN_TOKEN`。
- 兼容文档仍保留：`/openapi/admin-agent.json`、`/openapi/admin-agent.yaml`。

## 安全约束

- 不调用未暴露到 MCP 的高风险端点。
- 优先使用用户已提供的管理员 Bearer Token；未提供时先说明缺失，不擅自尝试登录。
- 删除、恢复、批量更新前必须先读取目标对象并确认 ID。
- OpenAPI 仅作为兼容文档入口保留：`/openapi/admin-agent.json`、`/openapi/admin-agent.yaml`。主调用路径一律使用 `mcporter`。
