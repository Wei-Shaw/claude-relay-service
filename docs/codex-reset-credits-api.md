# Codex 实时额度与重置卡 API

此接口由 CRS 自己管理账号 OAuth，供外部仪表板或受控自动化使用。它不是模型调度 API，也不是把上游 Token 导出给客户端。

## 接口与账号范围

基础路径：`/admin/openai-accounts/{accountId}/codex`。`accountId` 是 CRS 账号记录 ID，不能是分组 ID、自动池或任意上游 URL。

| 方法 | 路径 | 行为 |
|---|---|---|
| GET | `/usage` | 实时获取上游额度窗口，更新 CRS codexUsage 缓存；不发模型请求 |
| GET | `/reset-credits` | 实时获取可用重置卡数和必要详情，不消费 |
| POST | `/reset-credits/consume` | 显式消费、持久幂等、前后状态验证 |
| GET | `/reset-credits/operations/{requestId}` | 查询已有回执，不重新请求上游或续期 OAuth |
| POST | `/reset-credits/operations/{requestId}/reconcile` | 仅Admin显式确认延迟结果；只读上游，不再次消费 |

成功读取返回 `success: true` 和 `data`。其中 `account_id` 为请求的 CRS ID，`checked_at` 为本次读取时间，`source` 为 `upstream`。额度的 `rate_limit` 保留真实 `primary_window`、`secondary_window`；窗口可为空，使用 `limit_window_seconds` 区分类型，不固定 primary=5小时。卡片只输出 `available_count` 及必要的 `id/status/expires_at`。

历史 `GET /admin/openai-accounts` 仍是缓存视图。不要把它的更新时间不明的数据当成消费许可；CRS Key 的请求/费用统计也不是 Codex 订阅窗口。

## 凭据与权限

支持已有 Admin 会话；仪表板应优先使用[专用管理 Key](codex-management-keys.md)，只授予指定账号的读取/消费权限。普通模型 Key 的 `all` 权限不包含这些操作。管理 Key 不用于其他 Admin API 或模型调用；客户端无需持有上游 Access/Refresh Token。

账号 Token 有效时直接复用，过期时调用已有账号服务续期并持久化。每次上游调用保持固定账号身份和网络配置；GET401最多触发一次续期/重试，消费 POST 从不重放。使用账号已有代理配置，但忽略环境代理、验证TLS、禁止重定向。

## 消费请求与回执

请求正文示例（所有值为占位示例）：

```json
{
  "execute": true,
  "request_id": "a-persisted-operation-id",
  "credit_id": "an-available-credit-id"
}
```

`credit_id` 可省略；`execute` 必须为真正的布尔值 true。调用者必须在请求前持久化 request ID，不能在超时后换一个 ID 自动重试。

服务先落持久记录、按实际上游账号串行，读取新鲜额度与卡片，然后最多发送一次消费请求。即使同一上游账号在 CRS 中存在两个记录，也共享未决操作屏障。

回执 `data` 包括 `account_id/request_id/status/code/windows_reset`、脱敏 `before/after` 快照、`cache_updated` 与 `scheduling_updated`。完成状态包括：

- `reset_verified`：上游明确返回 reset，重置窗口数为正整数，读回可用卡数恰好减少一张且匹配时长的额度窗口用量下降。
- `nothing_to_reset` / `no_credit`：已知未重置结果，不伪报用卡成功。
- `uncertain`：超时、未知响应、读回/持久化失败或仍在执行，不能自动重试。上游声明与后验数据不一致时使用 `code=unknown`，不把未经验证的 `reset/nothing_to_reset/no_credit` 当作已知结果。

已知完成返回HTTP200；消费结果不明返回HTTP202。查询回执本身返回HTTP200，即使回执状态仍是uncertain。重复的同一请求返回既有记录，不再调用上游；同一ID对应不同重置卡选择返回409。

只有确认重置且新鲜额度可用，才按原值比较清除相关限流字段。若暂停由自动限流明确拥有（`rateLimitOwnsSchedulable`），账号仍处于启用/有效状态，才恢复调度；人工状态修改会取消该归属。不会恢复手工停用的 `isActive/schedulable`，不会清除无关认证异常，也不会调用宽泛的 `reset-status` 冒充上游重置。没有归属信息的旧暂停记录保持原调度设置，需管理员核对，而非猜测暂停原因。

## 上游延迟与人工确认

消费确认可能早于额度窗口更新。收到已知reset结果后，服务最多进行6轮GET后验检查，间隔2秒；不会重放消费POST。仍不能证实时保留uncertain屏障。

管理员核对后可POST同一request ID的`reconcile`，正文必须为`{"execute":true,"confirm_request_id":"<same-request-id>"}`。管理Key和模型Key不能调用此操作。它只进行新鲜GET并以比较交换更新回执/解除对应操作屏障，不再次用卡、不恢复调度暂停。

确认要求原回执已有正的窗口重置数及前后快照，操作不超过1小时，当前卡片ID集合恰少一张且该卡未自然过期，匹配额度窗口在原自然重置时间前确实下降。新记录还核对锁owner与上游身份摘要；旧记录缺少这些信息时，只有有界核对到整个原生操作空间恰有本条未决回执及对应锁才允许继续，否则409。并发修改锁或回执会使CAS失败，不能借此清除别人的操作。

完成回执的重复确认只返回既有结果，不访问上游。不能确认的证据仍保持uncertain；调用者的本地未决台账只能在读回该固定回执确认为reset_verified后按原request ID同步，不能删除或换ID绕过。

## 失败与恢复边界

- 参数错误400，权限不足401/403，资源不存在404，账号锁定/幂等冲突409，上游或存储失败502/504。
- 响应使用固定安全错误码，不透传Token、Cookie、上游原始正文或内部异常。
- 数据与回执响应设置 `Cache-Control: no-store`。
- pending/uncertain屏障不会靠TTL自动消失。发生不明确结果后先查询回执并人工核对，不能以新request ID、另一账号别名或清空台账绕过。
- 未决操作不会自动解除；只有上述有证据的Admin确认可完成延迟结果。Redis需按CRS既有持久化/备份策略运行；测试fixture不能代替持久化部署。
- 该API不是重置策略调度器。Glance等客户端保留显式账号开关、阈值和预测保护；读操作不会隐式用卡。

## 验证

纯合成账号和上游的单测：

```bash
npm test -- --runInBand tests/codexResetCreditsService.test.js tests/codexResetCreditsRoutes.test.js
```

真实账号验收需另外授权。先只读确认账号身份、实时额度和卡片，再进行至多一次消费并核对回执、卡数和额度。候选单测成功不意味着已部署或已经对真实账号完成重置。
