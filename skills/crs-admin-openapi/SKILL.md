---
name: crs-admin-openapi
description: 调用 Claude Relay Service 的管理 OpenAPI（API Key 管理与使用统计）。当需要由 Agent 自动执行“管理员登录、查询/创建/更新/删除 API Key、读取 usage/cost 统计趋势与明细”时使用。
---

# CRS Admin OpenAPI Skill

按以下流程调用 CRS 管理接口：

1. 先登录获取管理员 token。
2. 使用 `Authorization: Bearer <token>` 调用 `/admin/*` 接口。
3. 写操作前先做一次只读确认（例如先查 key 再更新/删除）。

## Endpoint 入口

- OpenAPI YAML: `/openapi/admin-agent.yaml`
- OpenAPI JSON: `/openapi/admin-agent.json`
- 登录接口: `POST /web/auth/login`

## 标准调用流程

### 1) 登录

请求体：

```json
{
  "username": "admin",
  "password": "<admin_password>"
}
```

从响应中提取 `token`。

### 2) 只读查询（推荐先执行）

- 列表 API Keys: `GET /admin/api-keys`
- 用量趋势: `GET /admin/usage-trend`
- 成本汇总: `GET /admin/usage-costs`

### 3) 写操作（需谨慎）

- 创建 Key: `POST /admin/api-keys`
- 更新 Key: `PUT /admin/api-keys/{keyId}`
- 软删除 Key: `DELETE /admin/api-keys/{keyId}`
- 恢复已删除 Key: `POST /admin/api-keys/{keyId}/restore`

## 安全与防误用

- 不调用高风险端点（索引重建、强制清空、永久删除等）。
- 批量写操作必须显式确认 `keyIds` 非空且数量符合预期。
- 删除前应先读取目标对象并记录待操作 ID。

## 最小示例

1. `POST /web/auth/login` 获取 token。
2. `GET /admin/api-keys?page=1&pageSize=20` 确认目标 key。
3. `PUT /admin/api-keys/{keyId}` 提交变更。
4. `GET /admin/api-keys/{keyId}/usage-records?limit=20` 验证结果。
