# Codex 专用订阅管理 Key

此 Key 只用于 [Codex 实时额度与重置卡 API](codex-reset-credits-api.md)，不是模型调用 Key 或通用 Admin Token。服务端只保存其 SHA-256 摘要及权限元数据；明文仅在创建响应中返回一次。

## 管理员创建、读取和撤销

以下操作仅接受已有的 CRS Admin 会话，不接受普通模型 Key 或订阅管理 Key。

| 方法 | 路径 | 返回 |
|---|---|---|
| POST | `/admin/codex-management-keys` | HTTP201，`data.key` 与 `data.metadata` |
| GET | `/admin/codex-management-keys/{id}` | HTTP200，安全权限元数据，不返回 Key |
| DELETE | `/admin/codex-management-keys/{id}` | HTTP200，`data.id` 与 `data.revoked` |

创建正文（示例账号 ID 必须替换为实际 CRS 记录 ID）：

```json
{
  "name": "subscription-dashboard",
  "account_ids": ["account-a", "account-b"],
  "consume_account_ids": ["account-b"],
  "expires_in_days": 90
}
```

- `account_ids` 非空，最多100个，是可读账号白名单。
- `consume_account_ids` 必须是其子集；省略或空数组表示只读。
- `expires_in_days` 为1至365的整数，省略时90天；自动化应显式填写。
- `name` 为非空显示名称，最多128字符，不能含控制字符。
- 返回的元数据包含 `id/name/account_ids/consume_account_ids/created_at/expires_at`；安全保存 Key 和管理 ID，随后通过 GET 按 ID 读回权限。
- 新 Key 的创建/撤销使用原子 Redis 操作。过期或撤销后，后续请求不再授权；撤销不能撤回已经通过授权并开始的上游操作。
- 创建结果不明时先核对服务状态，不要循环签发；无法找回明文时应撤销该记录再创建替代 Key。

## 仪表板调用

把 Key 放入受保护的服务端 profile，通过 `x-api-key` 或 `Authorization: Bearer` 发送，不能同时提供相互矛盾的凭据。不要放进浏览器脚本、URL、日志或公开静态 JSON。

- GET 额度、卡片、历史回执要求目标在 `account_ids` 中。
- POST 消费还要求目标在 `consume_account_ids` 中。
- 普通模型 Key 的 `all` 权限不授予此能力。
- 管理 Key 不能创建其他 Key，不能调用其他 Admin API，也不能代替模型调用 Key。
- 无效 Key 返回401，账号/消费越权返回403，存储不可用时失败关闭；不会切换到 Admin 登录或另一个账号。
- 客户端只需 CRS Base URL、此管理 Key 与固定账号映射；上游 OAuth 的读取、续期和持久化由 CRS 账号服务负责。

Key 响应禁止缓存。过期前由管理员创建替代 Key、验证最小权限、更新消费端的私密 profile，再撤销旧 Key。此实现不改变已有模型 Key 权限，也不提供自动用卡策略或全局执行开关。

## 合成测试

```bash
npm test -- --runInBand tests/codexManagementKeys.test.js tests/codexManagementAuth.test.js tests/codexResetCreditsRoutes.test.js
```

测试不使用真实 OAuth 或生产 Redis。上线需另行验证部署、Key 权限、固定账号和新鲜读回；单测通过不代表已经完成真实用卡。
