<260605.2>

# 支付模块 (src/services/payment)

在线充值支付。独立自洽的支付域，按六边形（端口/适配器）组织。
**与额度卡 (`quotaCardService`) 完全独立**：额度卡走线下卡核销，支付走在线订单，互不依赖。

## 定位与核心决策

- 充值落到**指定 API Key 的预付费余额**（独立账本），不寄生在 `totalCostLimit` 上（语义冲突：那是消费上限、0=不限额）。
- 被充值的 key 自动转 `billingMode=prepaid`：**只看余额、余额 ≤0 即 402，不看 totalCostLimit**。余额仍可为负（并发窗口事后透支，量≈在途成本之和），auth 据此拦后续；是事后计费的已知取舍、非 bug。
- **余额是派生值、用量账本是真相源**（方案A，大厂 metered-billing 的 usage-as-source）：`余额 =(充值累计 credit − 退款累计 refunded) − max(0, usage:cost:total − prepaid 基线 baseline)`。消费**不实时扣减余额**，由 recordUsage 落账的 `usage:cost:total` 反映——价值是**单一账本无漂移、无需"待补扣"摊给不相关请求**；usage 落账失败时该笔确实未计（与 postpaid 限额失真同一 failure domain、非幂等不可盲重试），由 recordUsage catch 的**含金额 ERROR** 兜底对账补账。`baseline`=首次转 prepaid 时刻的 usage:cost:total（SET NX，只算此后用量）。退款对称：可退=净充值−已用 的未消费部分。
- 身份：公开页先用**完整 apiKey 换短期会话 token**（`POST /payment/session`，绑定 keyId、30min 滑动 TTL），之后所有涉及具体 key 的读写**只带 token**，避免明文 apiKey 在每个请求体反复上行；不依赖可枚举的裸 `apiId`。订单归属按 **apiKey**（钱包绑 key），不按 userId。

## 六边形结构

```
驱动方(Driving)              领域(Domain,纯逻辑)        被驱动(Driven)
用户/管理员/webhook ─┐      ┌──────────────────┐    ┌─ providers/*（渠道适配器）
消费热路径(auth/      ├入站─▶│ paymentRules      │出站▶├─ balanceLedger（Redis Lua）
  recordUsage)       │用例  │ paymentOrderService│端口 ├─ orderRepository
前端展示 ────────────┘      └──────────────────┘    └─ planRepository
        ※ 依赖全部指向领域；领域不认识 auth/redis/http
```

## 文件清单

| 文件 | 层 | 职责 |
|------|----|----|
| `paymentRules.js` | 领域(纯函数) | 状态机、金额、退款额计算。无 IO，可独立测 |
| `paymentConfig.js` | 基础设施 | 全局配置 `payment:config`（开关/超时/倍率/手续费/启用渠道），内存缓存 |
| `balanceLedger.js` | 出站适配器 | 预付费余额账本，credit/reverse/unreverse 全 Lua 原子 + refId 幂等（余额=派生，无实时 debit） |
| `orderRepository.js` | 出站适配器 | 订单读写 + 索引（created/pending/status）+ 状态机 Lua CAS + 分片遍历 |
| `planRepository.js` | 出站适配器 | 充值商品 CRUD |
| `paymentOrderService.js` | 用例 | 下单/确认/履约/查单/过期(关单前查单)/手工补单/退款/取消 编排 |
| `providers/basePaymentProvider.js` | 端口 | 渠道抽象：createPayment/verifyWebhook/queryOrder/refund |
| `providers/registry.js` | 注册表 | 按 paymentType/providerKey 索引 |
| `providers/index.js` | 装配 | `initPaymentProviders()` 启动时注册渠道 |
| `providers/*Provider.js` | 适配器 | mock/epay/xunhupay/stripe/alipay/wxpay |

路由：`routes/payment.js`（用户）、`routes/admin/payment.js`（管理）、`routes/paymentWebhook.js`（公开回调）。
热路径接入：`middleware/auth.js`（余额闸）、`apiKeyService.recordUsage/recordUsageWithDetails`（用量落账，余额据此派生）。

## 渠道能力矩阵

| providerKey | queryOrder | refund (supportsRefund) | 备注 |
|-------------|------------|-------------------------|------|
| mock | 有 | 有 | 本地/测试 |
| alipay | 有 | 有 | 官方 |
| wxpay | 有 | 有 | 官方 |
| stripe | 有（Session/client_reference） | 有 | tradeNo 优先 cs_/pi_ |
| xunhupay | 有 | 有 | 虎皮椒 refund.html |
| epay | 有 | **无** | 易支付无标准退款 API；管理端展示「仅线下退」，禁止开 refundEnabled |

## Redis 数据模型

```
payment:config                          全局配置 JSON
payment:plan:{id} / payment:plans:all   充值商品
payment:order:{id}                      订单 Hash（**无 TTL**，支付证据）
payment:order:idx:created               全部订单 ZSet(createdAt)
payment:order:idx:pending               pending 订单 ZSet(expiresAt，过期扫描)
payment:order:idx:status:{status}       按状态列表 ZSet(createdAt)，管理端过滤用
payment:order:apikey:{apiKeyId}         按 key 归集的订单 ZSet
payment:order:outtrade:{outTradeNo}     外部单号→订单id
payment:session:{token}                 会话 token→keyId（30min 滑动 TTL）
payment:balance:credit/refunded/baseline/applied/reversed/tx:{keyId}
payment:daily_recharge:{keyId}:{date}
payment:lock:create:{apiKeyId} / payment:lock:refund:{orderId}
payment:provider:daily:{id}:{date} / payment:provider:rr:{paymentType}
payment:audit:{orderId}                 审计 list（**无 TTL**，条数 LTRIM 有界）
apikey:{keyId}.billingMode              'prepaid' | 'postpaid'
```

## Redis 硬化与备份（[人工决策-2026-08-11 09:33:17] 用户选 Redis 硬化）

- 订单 Hash / 审计 list：**不设 TTL**（与「Redis 可丢从 DB 重建」的一般缓存原则不同——支付证据没有第二真相源）。
- 日常备份：`npm run data:export:payment` → `scripts/export-payment.js`（订单/审计/商品/渠道密文/配置/余额账本）。
- **余额账本导出完整**：`credit` / `refunded` / `baseline` / `applied`（幂等集合）/ `reversed`（退款实扣 hash）/ `tx`（流水），可支撑 credit/reverse/unreverse 恢复。
- 全量仍可用 `npm run data:export`；恢复需同 `ENCRYPTION_KEY`（渠道 config 为 AES 密文）。
- 运维建议：cron 每日导出支付子集到安全存储；Redis AOF/RDB 按生产标准开。

## 管理端运营入口

| 方法 | 路径 | 作用 |
|------|------|------|
| GET | `/admin/payment/orders` | 分页列表（status 走二级索引） |
| POST | `/admin/payment/orders/:id/verify` | 查单补单（渠道 query / paid 重履约） |
| POST | `/admin/payment/orders/:id/manual-complete` | 手工入账 body=`{reason, tradeNo?}` 必填原因+审计 |
| POST | `/admin/payment/orders/:id/refund` | 审批退款 |
| POST | `/admin/payment/orders/:id/refund/resolve` | in-doubt 裁决 |

## 核心规则（改动前必读）

1. **幂等三重 + 卡单兜底**：订单状态机 Lua CAS + balanceLedger refId + fulfill COMPLETED 快返。`verifyOrder` 对 paid 直接重履约；对 pending/expired/cancelled 查渠道（config 优先订单快照）。**CAS 与 status/pending 索引同脚本原子**。
2. **关单前查单**：已付则补单；明确未付则关单。查单失败宽限内推迟；超宽限可强制 expired。**上游已付但 confirm/fulfill 失败绝不 expire**。若已落到 paid：本 tick 立刻再 fulfill；每轮 cron **轮询扫 status=paid**。**expired/cancelled 可复活为 paid**；日预留 **幂等 restore，且 fulfill 前 ensure 失败必须阻断 completed**（留 paid 由 cron 重试），禁止「预留没写上却已完成」导致 dailyLimit 永久漏计。
3. **手工补单**：pending/expired/cancelled/paid；`reason` 必填审计。
4. **余额账本 / 退款对称 / webhook 前置 / 身份边界 / 下单并发 / 渠道实例预留**：语义未改；退款 in-doubt 细节以 `paymentOrderService.js` + 「接渠道」第 5 条为准。
5. **列表规模化**：`listAll` 无 status 时 zrevrange 分页；有 status 时在真实匹配流上 skip offset 再取 limit，total=真实匹配数。**扫描中不 zrem**（防下标左移跳项），漂移扫完后再自愈。

## 接一个新支付渠道

1. `providers/{name}Provider.js` 继承 `BasePaymentProvider`，实现 createPayment/verifyWebhook（+ 可选 queryOrder/refund）。
2. `providers/index.js` 里 `registry.register(new XxxProvider())`。
3. 渠道实例 config（密钥）用 `commonHelper.encrypt` 加密存储；webhook handler 取解密 config 传入 verifyWebhook。
4. webhook 验签务必用原始 body（`routes/paymentWebhook.js` 已提供 rawBody）。
5. **refund 实现契约（金流安全）**：渠道确认「未执行/已拒绝」必须 `return {success:false, message}`（上层自动回滚、可重试）；网络超时/结果未知必须 `throw`（上层按 in-doubt 转人工，绝不自动重试）。禁止把未知结果包装成 success:false——那会触发自动回滚+重试=双退。各适配器现状：基类未实现=确定未执行 → success:false（不 throw，否则被当 in-doubt 冻结订单）；wxpay 按「4xx+业务错误码=确定失败，网络/5xx=throw」分类；alipay 按业务码分类（10000=成功；**20000「系统繁忙请重试」与应答缺失=结果未知 throw**；其余=确定拒绝）——网关恒 200 只解决传输层，业务码仍须三分；stripe 故意不分类全部 throw（4xx 含 charge_already_refunded 等不能自动回滚的场景）。**渠道实例的 `providerKey` 不可修改**（config 字段表与类型绑定，换类型=垃圾配置；update 接口强制拒绝，也堵死「先开 refundEnabled 再换类型」绕过能力硬门的旁路），换类型请新建实例。**新接渠道的 refund 必须按此契约写异常处理，禁止裸 try/catch 吞成 success:false**。实现了 refund 的渠道**必须同时覆写 `get supportsRefund() { return true }`**——配置保存（`providerRepository._assertRefundCapability`）与退款入口（approveRefund 能力硬门）按此拦截「后台可配置、运行时必失败」的假能力，前端 `PaymentManageView` 的 `REFUND_SUPPORTED` 列表需同步（仅预禁用提示，后端是权威）。

## 人工决策

- `[人工决策-2026-06-02 21:32:07]` 充值落指定 API Key 额度 + 被充值即转 prepaid + prepaid 只看余额。改动须同步 `paymentOrderService._ensurePrepaid`、`auth.js` 余额闸、`apiKeyService.recordUsage` 用量落账（余额派生，方案A 后无 `_debitPrepaidIfNeeded`）。
- `[人工决策-2026-06-04 10:38:30]` ① 计费关键写（usage:cost:total/costRealTotal）幂等化（去重 Lua）+ 有限重试、统计写解耦（`redis.incrementDailyCost`，recordUsage 调用序=计费先于统计）；② REFUNDING 卡单重入续退（推翻同日早间"暂不处理"）：实扣额 reverse Lua 原子记账 + 退款全程 per-order 锁 + 在途/已退双标记（`channelRefundAttemptAt`/`channelRefundedAt`，in-doubt 转人工裁决） + `_resumeRefund`。
- `[人工决策-2026-08-11 09:33:17]` 支付证据 Redis 硬化（订单/审计无 TTL + `data:export:payment`），不引入 MySQL；本轮不做订阅/短期套餐、履约目标保持仅 API Key。

## 阶段进度

- [x] 阶段0 领域地基（配置/余额账本/订单/商品/规则）+ mock 单测
- [x] 阶段0.5 消费热路径接入（auth 余额闸 + recordUsage 用量落账，余额派生）
- [x] 后端路由 + webhook 前置 + provider 注册 + 过期 cron
- [x] 阶段1 真实聚合渠道（易支付/虎皮椒）+ providerRepository（渠道实例加密配置）
- [x] 阶段2 Stripe（raw body 验签 + queryOrder 查单）
- [x] 阶段3 直连支付宝/微信
- [x] 阶段4 前端（ApiStats 充值 tab + PaymentManageView 管理端）
- [x] 阶段5 审计 + 看板 + 退款 in-doubt + 单测
- [x] 运营闭环补齐：管理端查单/手工入账、关单前查单、xunhu 退款、订单状态索引分页、支付子集导出、审计无 TTL
