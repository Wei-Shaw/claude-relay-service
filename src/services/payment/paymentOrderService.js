// 支付用例编排（入站端口实现）：下单、确认支付、履约、查单补单、过期、退款。
// 履约直接走 balanceLedger.credit（独立预付费余额账本），不碰 quotaCardService、不碰 totalCostLimit。
// 幂等三重保障：订单状态机 Lua CAS + balanceLedger 的 refId 幂等 + COMPLETED 快速返回。

const crypto = require('crypto')
const { v4: uuidv4 } = require('uuid')

const redis = require('../../models/redis')
const logger = require('../../utils/logger')
const paymentConfig = require('./paymentConfig')
const orderRepository = require('./orderRepository')
const planRepository = require('./planRepository')
const balanceLedger = require('./balanceLedger')
const registry = require('./providers/registry')
const providerRepository = require('./providerRepository')
const paymentAudit = require('./paymentAudit')
const rules = require('./paymentRules')
const { RedisKeys, TTL } = require('../../constants/redisKeys')

const { ORDER_STATUS } = rules
const AMOUNT_TOLERANCE = 0.01 // 金额校验容差（CNY）
const PROVIDER_RESERVATION_TTL_DAYS = Math.ceil(TTL.providerDailyReservation / 86400)
// 孤儿预留宽限：对账对「订单不存在」的预留，仅当其早于此时长才清——远超锁内「预留→落库」的 ~ms 窗口，
// 避免误清「预留已成、落库未完」的在途单（崩溃孤儿会停留更久，下个 cron tick 即被清）。
const RESERVATION_ORPHAN_GRACE_MS = 60000

class PaymentOrderService {
  _genOutTradeNo() {
    return `P${Date.now().toString(36)}${crypto.randomBytes(4).toString('hex')}`.toUpperCase()
  }

  // 被充值的 key 自动转预付费
  // [人工决策-2026-06-02 21:32:07] 充值落到指定 API Key，且被充值即视为 prepaid（余额>0 才放行、
  // 耗尽即停）；prepaid key 只看余额、不看 totalCostLimit。依据：本轮对话用户选"指定 API Key 额度"
  // + "继续"采纳推荐。若改为显式开关或两者取严，改这里及 auth/recordUsage 的接入处。
  async _ensurePrepaid(apiKeyId) {
    // 先记基线、后切 prepaid（顺序关键）：若先切 billingMode，「已是 prepaid、baseline 未写」的
    // 窗口里余额读取会按 baseline=0 把历史 usage:cost:total 全算成 prepaid 消费，刚充值即被 402
    await balanceLedger.setBaselineIfAbsent(apiKeyId)
    await redis.client.hset(RedisKeys.apiKey.byId(apiKeyId), 'billingMode', 'prepaid')
  }

  // 取渠道实例的解密 config（无实例返回空）
  async _instanceConfig(instanceId) {
    if (!instanceId) {
      return {}
    }
    const inst = await providerRepository.getById(instanceId, { withConfig: true })
    return inst ? inst.config : {}
  }

  _dailyRechargeKey(apiKeyId) {
    return RedisKeys.payment.dailyRecharge(apiKeyId, redis.getDateStringInTimezone(new Date()))
  }

  async _getDailyRecharged(apiKeyId) {
    return parseFloat((await redis.client.get(this._dailyRechargeKey(apiKeyId))) || 0)
  }

  async _addDailyRecharged(apiKeyId, amount) {
    const key = this._dailyRechargeKey(apiKeyId)
    await redis.client.incrbyfloat(key, amount)
    await redis.client.expire(key, TTL.dailyRecharge)
  }

  async createOrder({ apiKeyId, planId = '', customQuota = 0, paymentType }) {
    const config = await paymentConfig.getConfig()
    if (!config.enabled) {
      throw new Error('支付功能未启用')
    }
    // 后端约束：只允许后台启用的支付方式（前端展示不可信）
    if (!config.enabledPaymentTypes.includes(paymentType)) {
      throw new Error(`支付方式未启用: ${paymentType}`)
    }
    if (!registry.hasType(paymentType)) {
      throw new Error(`不支持的支付方式: ${paymentType}`)
    }

    // key 存在（持有由路由层用完整 apiKey 校验，此处仅取数据）
    const keyData = await redis.getApiKey(apiKeyId)
    if (!keyData || Object.keys(keyData).length === 0) {
      throw new Error('API Key 不存在')
    }

    // 解析商品 / 自定义额度
    let quotaAmount
    let price
    let currency
    if (planId) {
      const plan = await planRepository.getById(planId)
      if (!plan || !plan.enabled) {
        throw new Error('充值商品不存在或已下架')
      }
      ;({ quotaAmount, price, currency } = plan)
    } else {
      if (!config.allowCustomAmount || !(config.customRatio > 0)) {
        throw new Error('未开启自定义金额充值')
      }
      quotaAmount = Number(customQuota)
      if (!(quotaAmount > 0)) {
        throw new Error('充值额度非法')
      }
      price = rules.computePriceFromQuota(quotaAmount, config.customRatio)
      currency = 'CNY'
    }

    const payAmount = rules.computePayAmount(price, config.feeRate)

    // 并发安全：key 维度限额校验 → 选实例并预留 → 落单，全程在 per-key 锁内串行。
    // 实例预留放在 key 校验【之后】：key 校验失败就不产生临时预留，避免占着实例当日额度、
    // 让其它 key 的并发选渠道误判「无可用渠道」（跨 key 瞬时假满额窗口）。锁只覆盖 Redis 读写，
    // createPayment(HTTP) 在锁外；预留之后任意失败都释放预留，避免泄漏（mock 无实例则 no-op）。
    let provider
    let providerConfig = {}
    let providerInstanceId = ''
    // refundEnabled 履约能力快照（下单时固化，退款判定只读订单自身、不回查可变实例配置）。
    // mock 等无实例渠道保持 false：其退款放行由 approveRefund 的「instance 为空则放行」分支处理。
    let refundEnabledSnapshot = false
    let order
    // 预留与释放绑定同一日期：选实例前算一次 reservedDate，既用于 selectInstance 预留、又存进订单
    // （providerReservedDate），避免预留用 today()、释放用 order.createdAt 两次时钟读跨午夜错位（旧日期键预留卡死）。
    let reservedDate
    // orderId 先生成（外层可见）：选实例时按订单记预留，失败时按 orderId 幂等 HDEL 释放
    let orderId
    // committed：createPayment 成功后置位——此后订单是「上游已建单」的有效 pending，预留交由订单生命周期管理，
    // 后续 setFields/审计失败不得再释放预留、不得回滚订单（否则留下 pending+预留已释放+上游已建单的不一致）。
    let committed = false
    try {
      const lockKey = RedisKeys.payment.lockCreate(apiKeyId)
      const lockValue = uuidv4()
      if (!(await redis.setAccountLock(lockKey, lockValue, 5000))) {
        throw new Error('下单繁忙，请稍后重试')
      }
      try {
        const now = new Date()
        reservedDate = redis.getDateStringInTimezone(now)
        orderId = uuidv4()
        // ① key 维度限额（含在途 pending）：锁内扫描反映已提交的并发订单。
        // pending 金额只计【今天(reservedDate)创建】的，避免昨天遗留的 pending（近午夜未及过期）占用今天日限额；
        // count 仍计全部 pending（供 maxPendingOrders，不限日期）。
        const { count, pendingPayAmountSum } = await orderRepository.pendingStats(
          apiKeyId,
          reservedDate
        )
        if (count >= config.maxPendingOrders) {
          throw new Error(`待支付订单过多（上限 ${config.maxPendingOrders}）`)
        }
        if (config.dailyLimit > 0) {
          const paidToday = await this._getDailyRecharged(apiKeyId)
          if (paidToday + pendingPayAmountSum + payAmount > config.dailyLimit) {
            throw new Error(`超过每日充值限额（${config.dailyLimit}）`)
          }
        }
        // ② 选渠道实例（真实渠道在此原子按 orderId 选+预留 reservedDate 当日额度；mock 无实例）。key 校验已过才预留。
        if (paymentType === 'mock') {
          provider = registry.getByType('mock')
          // 无实例渠道（mock）：无实例级退款开关，退款能力由 provider.supportsRefund 决定，快照成该值（避免漏赋值固定落 false 致永久不可退）
          refundEnabledSnapshot = provider.supportsRefund === true
        } else {
          const selected = await providerRepository.selectInstance(
            paymentType,
            config.lbStrategy,
            payAmount,
            reservedDate,
            orderId,
            now.getTime()
          )
          if (!selected) {
            throw new Error(`支付方式 ${paymentType} 未配置可用渠道`)
          }
          provider = registry.getByKey(selected.instance.providerKey)
          providerConfig = selected.config
          providerInstanceId = selected.instance.id
          // 履约能力条款快照：退款开关在「下单时」固化到订单，后续后台改实例 refundEnabled 不影响在途订单的退款判定。
          // 这是「订单生命周期自包含」原则——退款能力是创建时谈定的交易条款，不应回查可变的实例当前配置。
          refundEnabledSnapshot = selected.instance.refundEnabled === true
        }
        // ③ 建单 + 落单（createdAt 与 reservedDate 同源 now；providerReservedDate 锁定释放日期）
        order = {
          id: orderId,
          userId: keyData.userId || '',
          apiKeyId,
          apiKeyName: keyData.name || '',
          planId: planId || '',
          quotaAmount,
          price,
          payAmount,
          feeRate: config.feeRate,
          currency,
          paymentType,
          providerKey: provider.providerKey,
          providerInstanceId,
          refundEnabledSnapshot,
          // 渠道配置/密钥快照：退款时读它调渠道，不回查可变实例（实例可自由改密钥/配置/下线，不冻结本单）。
          // mock 等无实例渠道 providerConfig={}，退款 config 也是空对象（mock.refund 不依赖 config）。
          providerConfigSnapshot: providerConfig,
          providerReservedDate: reservedDate,
          subject: `充值 ${quotaAmount}`,
          outTradeNo: this._genOutTradeNo(),
          tradeNo: '',
          payUrl: '',
          qrCode: '',
          status: ORDER_STATUS.PENDING,
          paidAmount: 0,
          refundedAmount: 0,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
          expiresAt: new Date(now.getTime() + config.orderTimeoutMinutes * 60000).toISOString(),
          paidAt: '',
          completedAt: '',
          failedReason: ''
        }
        await orderRepository.save(order)
      } finally {
        await redis.releaseAccountLock(lockKey, lockValue)
      }

      // 调渠道下单（锁外，不阻塞其它 key）；失败则取消订单，不留垃圾 pending
      let payResult
      try {
        payResult = await provider.createPayment(order, providerConfig)
      } catch (error) {
        logger.error(`❌ [payment] createPayment failed order=${order.id}:`, error)
        await orderRepository.casStatus(order.id, ORDER_STATUS.PENDING, ORDER_STATUS.CANCELLED, {
          failedReason: 'create payment failed'
        })
        throw error
      }
      // createPayment 已成功 → 订单是有效 pending（上游已建单），预留归订单生命周期。此后失败不回滚、不释放预留。
      committed = true
      const payFields = {
        payUrl: payResult.payUrl || '',
        qrCode: payResult.qrCode || '',
        tradeNo: payResult.tradeNo || ''
      }
      // setFields 仅缓存支付凭证，失败不致命（pay 凭证已在 payResult 里返给前端，verify 也会重查渠道）
      try {
        await orderRepository.setFields(order.id, payFields)
      } catch (e) {
        logger.error(`❌ [payment] setFields failed (order ${order.id} 仍有效、上游已建单):`, e)
      }
      await paymentAudit.record(
        order.id,
        'ORDER_CREATED',
        { paymentType, payAmount, quotaAmount },
        keyData.userId || 'user'
      )
      logger.info(
        `[payment] order created id=${order.id} type=${paymentType} payAmount=${payAmount}`
      )
      // 返回内存态订单（合并 pay 凭证），避免 commit 后再 getById 抛错触发外层 catch 误释放预留
      return { order: { ...order, ...payFields }, pay: payResult }
    } catch (error) {
      // 未 committed 的失败按 orderId 幂等释放预留（date=reservedDate，与预留同源、不受跨午夜影响）。
      // committed 后（createPayment 已成功）订单有效，预留交由订单生命周期，不在此释放。
      // key 校验失败时尚未预留 → providerInstanceId 为空 → no-op。
      if (!committed && providerInstanceId) {
        await providerRepository.releaseDailyReservation(providerInstanceId, orderId, reservedDate)
      }
      throw error
    }
  }

  _amountMatches(paidAmount, payAmount) {
    return Math.abs(Number(paidAmount) - Number(payAmount)) <= AMOUNT_TOLERANCE
  }

  // 确认支付并履约（webhook / verify / 误关单复活 共用）。幂等。
  // 可从 pending / expired / cancelled → paid（后两者=上游已付、本地曾误关或取消后到账）。
  async confirmPayment(order, { paidAmount = null, tradeNo = '' } = {}) {
    if (
      paidAmount !== null &&
      paidAmount > 0 &&
      !this._amountMatches(paidAmount, order.payAmount)
    ) {
      logger.error(
        `❌ [payment] amount mismatch order=${order.id} paid=${paidAmount} expect=${order.payAmount}`
      )
      throw new Error('支付金额不匹配')
    }
    // 已 paid/completed：只履约
    if (order.status === ORDER_STATUS.COMPLETED || order.status === ORDER_STATUS.PAID) {
      return this.fulfillOrder(order.id)
    }
    const paidFields = {
      paidAt: new Date().toISOString(),
      paidAmount: paidAmount === null ? order.payAmount : paidAmount,
      tradeNo: tradeNo || order.tradeNo || '',
      failedReason: ''
    }
    // pending 主路径；expired/cancelled 复活（防误关单永久丢款）
    const fromStatuses = [ORDER_STATUS.PENDING, ORDER_STATUS.EXPIRED, ORDER_STATUS.CANCELLED]
    let transitioned = 0
    let recoveredFrom = ''
    for (const from of fromStatuses) {
      // eslint-disable-next-line no-await-in-loop
      const cas = await orderRepository.casStatus(order.id, from, ORDER_STATUS.PAID, paidFields)
      if (cas === 1) {
        transitioned = 1
        recoveredFrom = from
        break
      }
    }
    if (transitioned === 1) {
      const action =
        recoveredFrom === ORDER_STATUS.PENDING
          ? 'ORDER_PAID'
          : `ORDER_RECOVERED_FROM_${recoveredFrom.toUpperCase()}`
      await paymentAudit.record(order.id, action, {
        paidAmount: paidFields.paidAmount,
        from: recoveredFrom
      })
      await this._addDailyRecharged(order.apiKeyId, order.payAmount)
      // expired/cancelled 复活：过期/取消时已 release，best-effort 补回日预留（失败不阻断履约，见 fulfill 再 ensure）
      if (recoveredFrom === ORDER_STATUS.EXPIRED || recoveredFrom === ORDER_STATUS.CANCELLED) {
        await this._ensureInstanceDailyReservation(order)
      }
    } else {
      const latest = await orderRepository.getById(order.id)
      if (
        !latest ||
        (latest.status !== ORDER_STATUS.PAID && latest.status !== ORDER_STATUS.COMPLETED)
      ) {
        throw new Error(`订单状态不可确认支付: ${latest ? latest.status : 'missing'}`)
      }
    }
    return this.fulfillOrder(order.id)
  }

  // 履约：入账到预付费余额。三重幂等。
  async fulfillOrder(orderId) {
    const order = await orderRepository.getById(orderId)
    if (!order) {
      throw new Error('订单不存在')
    }
    if (order.status === ORDER_STATUS.COMPLETED) {
      return { fulfilled: true, alreadyDone: true }
    }
    if (order.status !== ORDER_STATUS.PAID) {
      return { fulfilled: false, reason: `order not paid: ${order.status}` }
    }
    // paid 履约前 ensure 日预留（幂等 HSET）：失败则抛错，不 credit、不进 completed，
    // 订单保持 paid，cron 扫 paid 索引会再试，直到预留写上再履约
    await this._ensureInstanceDailyReservation(order)
    // 入账（幂等：refId=orderId，重复调用不重复加）
    const balance = await balanceLedger.credit(order.apiKeyId, order.quotaAmount, order.id, {
      orderId: order.id
    })
    // 被充值的 key 转预付费
    await this._ensurePrepaid(order.apiKeyId)
    // PAID -> COMPLETED
    const cas = await orderRepository.casStatus(
      order.id,
      ORDER_STATUS.PAID,
      ORDER_STATUS.COMPLETED,
      {
        completedAt: new Date().toISOString()
      }
    )
    if (cas === 1) {
      await paymentAudit.record(order.id, 'ORDER_FULFILLED', {
        quotaAmount: order.quotaAmount,
        balance
      })
    }
    logger.info(`[payment] order fulfilled id=${orderId} key=${order.apiKeyId} balance=${balance}`)
    return { fulfilled: true, balance }
  }

  // 取订单调渠道用的 config：优先下单快照（密钥轮换后查单/补单仍可用），否则回退实例当前 config
  async _providerConfigForOrder(order) {
    if (order.providerConfigSnapshot && typeof order.providerConfigSnapshot === 'object') {
      return order.providerConfigSnapshot
    }
    return this._instanceConfig(order.providerInstanceId)
  }

  // 确保实例日预留存在（幂等 HSET）。
  // 失败必须抛出：阻断 fulfill 进入 completed，订单留 paid，由 cron 扫 paid 重试 ensure+履约。
  // 禁止吞异常后继续 completed——否则 dailyLimit 永久漏计。
  async _ensureInstanceDailyReservation(order) {
    if (!order || !order.providerInstanceId || !(Number(order.payAmount) > 0)) {
      return
    }
    await providerRepository.restoreDailyReservation(
      order.providerInstanceId,
      order.id,
      order.providerReservedDate ||
        (order.createdAt ? String(order.createdAt).slice(0, 10) : undefined),
      order.payAmount,
      Date.now()
    )
  }

  // 查单补单（webhook 丢失 / 误关单复活）。用户端与管理端共用。
  async verifyOrder(orderId) {
    const order = await orderRepository.getById(orderId, { withConfigSnapshot: true })
    if (!order) {
      throw new Error('订单不存在')
    }
    if (order.status === ORDER_STATUS.COMPLETED) {
      return order
    }
    // paid 卡单：直接重试履约
    if (order.status === ORDER_STATUS.PAID) {
      await this.fulfillOrder(orderId)
      return orderRepository.getById(orderId)
    }
    // pending / expired / cancelled 均可查上游并复活入账
    const recoverable = new Set([
      ORDER_STATUS.PENDING,
      ORDER_STATUS.EXPIRED,
      ORDER_STATUS.CANCELLED
    ])
    if (!recoverable.has(order.status)) {
      return order
    }
    const provider = registry.getByKey(order.providerKey)
    const providerConfig = await this._providerConfigForOrder(order)
    const result = await provider.queryOrder(order.outTradeNo, providerConfig, order)
    if (result && result.success) {
      await this.confirmPayment(order, { paidAmount: result.paidAmount, tradeNo: result.tradeNo })
      return orderRepository.getById(orderId)
    }
    return orderRepository.getById(orderId)
  }

  // 管理端手工补单：pending / expired / cancelled → 入账；paid → 重试履约。
  async manualComplete(orderId, { operator = 'admin', reason = '', tradeNo = '' } = {}) {
    const trimmedReason = String(reason || '').trim()
    if (!trimmedReason) {
      throw new Error('必须填写补单原因（渠道流水号/核对说明）')
    }
    const order = await orderRepository.getById(orderId)
    if (!order) {
      throw new Error('订单不存在')
    }
    if (order.status === ORDER_STATUS.COMPLETED) {
      return { fulfilled: true, alreadyDone: true, order }
    }
    if (order.status === ORDER_STATUS.PAID) {
      await paymentAudit.record(
        orderId,
        'ORDER_MANUAL_FULFILL',
        { reason: trimmedReason },
        operator
      )
      await this.fulfillOrder(orderId)
      const updated = await orderRepository.getById(orderId)
      return { fulfilled: updated.status === ORDER_STATUS.COMPLETED, order: updated }
    }
    const recoverable = new Set([
      ORDER_STATUS.PENDING,
      ORDER_STATUS.EXPIRED,
      ORDER_STATUS.CANCELLED
    ])
    if (!recoverable.has(order.status)) {
      throw new Error(`订单状态不可补单: ${order.status}`)
    }
    await paymentAudit.record(
      orderId,
      'ORDER_MANUAL_COMPLETE',
      { reason: trimmedReason, tradeNo: tradeNo || '', from: order.status },
      operator
    )
    await this.confirmPayment(order, {
      paidAmount: order.payAmount,
      tradeNo: tradeNo || order.tradeNo || `MANUAL:${operator}`
    })
    await orderRepository.setFields(orderId, {
      manualCompletedBy: operator,
      manualCompletedReason: trimmedReason,
      manualCompletedAt: new Date().toISOString()
    })
    const updated = await orderRepository.getById(orderId)
    return { fulfilled: updated.status === ORDER_STATUS.COMPLETED, order: updated }
  }

  // 扫描并过期超时 pending + 重试 paid 卡单履约（cron 调用）。
  // 关单前查上游：已付则补单；明确未付则关单。
  // 查单失败：宽限内推迟；超宽限可 expire（仍可 verify/webhook/manual 复活）。
  // 上游已付但 confirm 中途失败：若已到 paid 则本 tick 立刻 fulfill，并依赖 status=paid 索引每轮扫补；绝不 expire。
  async expireTimedOutOrders() {
    const nowMs = Date.now()
    const QUERY_FAIL_GRACE_MS = 15 * 60 * 1000
    const QUERY_FAIL_DEFER_MS = 2 * 60 * 1000
    const BATCH = 200
    const MAX_PER_TICK = 1000
    let expired = 0
    let recovered = 0
    let deferred = 0
    let fulfilledStuck = 0
    let processed = 0

    // ① 先扫 paid 卡单：轮询覆盖全集（scanStatusIndex 公平游标），不依赖 pending 索引
    // 每 tick 最多 200 条；卡单多时靠游标多轮 cron 扫完，不会只盯最新 100
    const paidIds = await orderRepository.scanStatusIndex(ORDER_STATUS.PAID, 200)
    for (const id of paidIds) {
      try {
        const result = await this.fulfillOrder(id)
        if (result.fulfilled && !result.alreadyDone) {
          fulfilledStuck += 1
          recovered += 1
          await paymentAudit.record(id, 'ORDER_FULFILL_STUCK_RETRY', {})
        }
      } catch (error) {
        logger.error(`❌ [payment] fulfill stuck paid order=${id}:`, error)
      }
    }

    // ② 再处理超时 pending
    while (processed < MAX_PER_TICK) {
      const ids = await orderRepository.scanExpiredPending(nowMs, BATCH)
      if (!ids.length) {
        break
      }
      for (const id of ids) {
        if (processed >= MAX_PER_TICK) {
          break
        }
        processed += 1
        const order = await orderRepository.getById(id, { withConfigSnapshot: true })
        if (!order) {
          await orderRepository.removeFromPendingIndex(id)
          continue
        }
        // pending 索引上的 paid：立即履约并摘索引（confirm 已成功、fulfill 失败的路径）
        if (order.status === ORDER_STATUS.PAID) {
          try {
            const result = await this.fulfillOrder(id)
            if (result.fulfilled) {
              recovered += 1
            }
          } catch (error) {
            logger.error(`❌ [payment] fulfill paid-on-pending-idx order=${id}:`, error)
          }
          await orderRepository.removeFromPendingIndex(id)
          continue
        }
        if (order.status === ORDER_STATUS.COMPLETED) {
          await orderRepository.removeFromPendingIndex(id)
          continue
        }
        if (order.status !== ORDER_STATUS.PENDING) {
          await orderRepository.removeFromPendingIndex(id)
          continue
        }
        const expiresAtMs = order.expiresAt ? new Date(order.expiresAt).getTime() : 0
        let queryFailed = false
        try {
          const provider = registry.getByKey(order.providerKey)
          const providerConfig = await this._providerConfigForOrder(order)
          const queryResult = await provider.queryOrder(order.outTradeNo, providerConfig, order)
          if (queryResult && queryResult.success) {
            try {
              await this.confirmPayment(order, {
                paidAmount: queryResult.paidAmount,
                tradeNo: queryResult.tradeNo
              })
              recovered += 1
              await paymentAudit.record(order.id, 'ORDER_RECOVERED_ON_EXPIRE', {
                tradeNo: queryResult.tradeNo || ''
              })
            } catch (confirmError) {
              // 可能已 pending→paid 成功、fulfill 失败：读最新状态分流
              logger.error(`❌ [payment] expire paid-but-fulfill-failed order=${id}:`, confirmError)
              const latest = await orderRepository.getById(id)
              if (latest && latest.status === ORDER_STATUS.PAID) {
                // 已 paid：立刻再 fulfill；失败则留下 status=paid，靠①每轮扫补，禁止 reschedulePending
                try {
                  await this.fulfillOrder(id)
                  recovered += 1
                } catch (fulfillError) {
                  logger.error(
                    `❌ [payment] fulfill after confirm partial order=${id}:`,
                    fulfillError
                  )
                  await paymentAudit.record(order.id, 'ORDER_FULFILL_RETRY', {
                    error: fulfillError.message || String(fulfillError),
                    stage: 'paid'
                  })
                }
                await orderRepository.removeFromPendingIndex(id)
              } else if (latest && latest.status === ORDER_STATUS.COMPLETED) {
                await orderRepository.removeFromPendingIndex(id)
                recovered += 1
              } else if (latest && latest.status === ORDER_STATUS.PENDING) {
                // 仍 pending：confirm 完全失败，推迟再查
                await orderRepository.reschedulePending(id, nowMs + QUERY_FAIL_DEFER_MS)
                deferred += 1
                await paymentAudit.record(order.id, 'ORDER_FULFILL_RETRY', {
                  error: confirmError.message || String(confirmError),
                  stage: 'pending'
                })
              } else {
                await orderRepository.removeFromPendingIndex(id)
              }
            }
            continue
          }
          if (queryResult === null) {
            queryFailed = true
          }
        } catch (error) {
          logger.error(`❌ [payment] expire pre-query failed order=${id}:`, error)
          queryFailed = true
        }
        if (queryFailed) {
          if (expiresAtMs > 0 && nowMs < expiresAtMs + QUERY_FAIL_GRACE_MS) {
            await orderRepository.reschedulePending(id, nowMs + QUERY_FAIL_DEFER_MS)
            deferred += 1
            logger.warn(
              `[payment] expire defer (query unknown) order=${id} until=${new Date(nowMs + QUERY_FAIL_DEFER_MS).toISOString()}`
            )
            continue
          }
        }
        const cas = await orderRepository.casStatus(
          id,
          ORDER_STATUS.PENDING,
          ORDER_STATUS.EXPIRED,
          queryFailed ? { failedReason: 'expire_query_failed' } : {}
        )
        if (cas === 1) {
          expired += 1
          if (order.providerInstanceId) {
            await providerRepository.releaseDailyReservation(
              order.providerInstanceId,
              order.id,
              order.providerReservedDate || order.createdAt.slice(0, 10)
            )
          }
          await paymentAudit.record(
            order.id,
            queryFailed ? 'ORDER_EXPIRED_QUERY_FAILED' : 'ORDER_EXPIRED',
            {}
          )
        }
      }
      if (ids.length < BATCH) {
        break
      }
    }
    if (expired > 0 || recovered > 0 || deferred > 0 || fulfilledStuck > 0) {
      logger.info(
        `[payment] expire done expired=${expired} recovered=${recovered} deferred=${deferred} fulfilledStuck=${fulfilledStuck} processed=${processed}`
      )
    }
    return { expired, recovered, deferred, fulfilledStuck, processed }
  }

  // 对账（cron 调用）：清掉实例当日额度 hash 里的失效预留——
  //   ① 进程崩溃遗留的孤儿预留（HSET 成功但订单未落库 → 订单不存在）；
  //   ② 订单已终态但释放失败遗留（cancelled/expired/failed 仍在 hash）。
  // 逐 orderId 核对订单真相，确认应清才 HDEL，与并发下单/释放无竞态（它们 HSET/HDEL 的是各自 orderId）。
  // 「订单不存在」分崩溃孤儿 vs「预留刚成、落库未完」的在途单：后者 reservedAtMs 很新，靠宽限期区分，
  // 只清够老的孤儿、绝不误清在途；终态订单订单在、确认失败，立即清。扫描覆盖完整 providerDaily TTL 天数，
  // 否则第 3 天内的孤儿预留会漏扫、一直卡到自然过期。
  async reconcileInstanceDailyReservations() {
    const instances = await providerRepository.list()
    if (!instances.length) {
      return 0
    }
    const nowMs = Date.now()
    const dates = []
    for (let dayOffset = 0; dayOffset < PROVIDER_RESERVATION_TTL_DAYS; dayOffset++) {
      dates.push(redis.getDateStringInTimezone(new Date(nowMs - dayOffset * 86400000)))
    }
    const stale = new Set([ORDER_STATUS.CANCELLED, ORDER_STATUS.EXPIRED, ORDER_STATUS.FAILED])
    let cleaned = 0
    for (const inst of instances) {
      for (const date of dates) {
        const reservations = await providerRepository.getDailyReservations(inst.id, date)
        for (const [oid, value] of Object.entries(reservations || {})) {
          const order = await orderRepository.getById(oid)
          let shouldClear
          if (order) {
            shouldClear = stale.has(order.status) // 订单在且已终态 → 立即清
          } else {
            // 订单不存在：仅当预留早于宽限期才清，避免误清「预留已成、落库未完」的在途单
            const reservedAtMs = parseInt(String(value).split(':')[1] || '0', 10)
            shouldClear = reservedAtMs > 0 && nowMs - reservedAtMs > RESERVATION_ORPHAN_GRACE_MS
          }
          if (shouldClear) {
            await providerRepository.releaseDailyReservation(inst.id, oid, date)
            cleaned += 1
          }
        }
      }
    }
    if (cleaned > 0) {
      logger.warn(`[payment] reconciled ${cleaned} stale instance daily reservations`)
    }
    return cleaned
  }

  // 退款（管理员审批）：对称退款——退 min(订单额度, 当前余额) 对应金额，并回收余额。
  // [人工决策-2026-06-04 10:38:30] REFUNDING 卡单支持重入续退（推翻先前"暂不处理"）：
  // 实扣额由 reverse Lua 原子记账（「额度已扣必有记录」），卡单重新审批自动续退，不再只能人工对账。
  // per-order 锁覆盖【整个退款执行】（含渠道 HTTP）：主路径与重入共用同一互斥，杜绝并发双退
  // （COMPLETED→REFUNDING CAS 只是一次性状态转移，挡不住「一方已在 REFUNDING 执行、另一方走重入」）。
  async approveRefund(orderId, { operator = 'admin' } = {}) {
    const lockKey = RedisKeys.payment.lockRefund(orderId)
    const lockValue = uuidv4()
    // TTL 60s 需覆盖渠道 HTTP（渠道客户端超时应短于此；锁过期早于慢渠道返回是已知接受的残余）
    if (!(await redis.setAccountLock(lockKey, lockValue, 60000))) {
      throw new Error('该订单退款执行中，请稍后重试')
    }
    try {
      return await this._approveRefundLocked(orderId, operator)
    } finally {
      await redis.releaseAccountLock(lockKey, lockValue)
    }
  }

  // 锁内退款主流程
  async _approveRefundLocked(orderId, operator) {
    // withConfigSnapshot:true 取下单时固化的渠道配置快照（含密钥）——_executeChannelRefund 据此调渠道，
    // 使实例可自由改密钥/配置/下线而不冻结本单；默认 getById 会剥离该字段（公开读防泄露）
    const order = await orderRepository.getById(orderId, { withConfigSnapshot: true })
    if (!order) {
      throw new Error('订单不存在')
    }
    // REFUNDING 重入（解卡）：前次执行在 CAS 锁单之后中断（崩溃/渠道失败且回滚失败/终态落库失败）
    if (order.status === ORDER_STATUS.REFUNDING) {
      return this._resumeRefund(order.id, operator)
    }
    const balance = await balanceLedger.get(order.apiKeyId)
    const refundableQuota = rules.computeRefundableQuota(order.quotaAmount, balance)
    const refundAmount = rules.computeRefundAmount(order.price, order.quotaAmount, refundableQuota)

    // 可退额为 0（余额已消费完毕）直接拒绝：避免锁单 COMPLETED→REFUNDING + 调渠道退 0 元
    // （多数渠道对 0 元退款报错/拒绝，mock 则会把订单误置 REFUNDED 且 refundedAmount=0，状态被污染）
    if (!(refundableQuota > 0) || !(refundAmount > 0)) {
      throw new Error('无可退余额：该订单额度已消费完毕')
    }

    // 渠道能力硬门（防存量配置绕过保存期校验）：未实现退款的渠道直接拒绝，不走 reverse/回滚整圈
    const capProvider = registry.findByKey(order.providerKey)
    if (!capProvider || !capProvider.supportsRefund) {
      throw new Error('该支付渠道未实现退款')
    }
    // 退款开关判定：优先读「下单时固化的快照」(refundEnabledSnapshot)，使后台后续改实例配置不影响在途订单。
    // 旧订单无快照字段(undefined) → 回退查实例当前值（兼容存量数据）；mock 等无实例渠道放行。
    if (order.refundEnabledSnapshot === true) {
      // 快照明确允许退款，直接放行（不再回查可能已被改坏的实例配置）
    } else if (order.refundEnabledSnapshot === false) {
      throw new Error('该支付渠道未开启退款')
    } else {
      // 存量订单无快照：沿用原逻辑，查实例当前 refundEnabled
      const instance = order.providerInstanceId
        ? await providerRepository.getById(order.providerInstanceId, { withConfig: true })
        : null
      if (instance && !instance.refundEnabled) {
        throw new Error('该支付渠道未开启退款')
      }
    }

    // COMPLETED -> REFUNDING（原子锁定，防并发重复退款）
    const locked = await orderRepository.casStatus(
      order.id,
      ORDER_STATUS.COMPLETED,
      ORDER_STATUS.REFUNDING,
      {}
    )
    if (locked !== 1) {
      throw new Error('订单当前状态不允许退款')
    }

    // ① 先原子回收额度：Lua 内按【执行时】派生余额裁剪（防快照过时超退）；0=已被新消费吃光
    const reversed = await balanceLedger.reverse(
      order.apiKeyId,
      refundableQuota,
      `${order.id}:refund`,
      { orderId: order.id, operator }
    )
    // -1=refId 已 applied：前次 unreverse 回滚失败残留（额度已扣、渠道未退钱）。
    // 实扣额在账本回收 hash 里（与 reverse 同 Lua 原子记录），委托重入续退（同一把锁内）
    if (reversed === -1) {
      return this._resumeRefund(order.id, operator)
    }
    if (!(reversed > 0)) {
      await orderRepository.casStatus(order.id, ORDER_STATUS.REFUNDING, ORDER_STATUS.COMPLETED, {
        failedReason: 'no refundable balance at execution'
      })
      throw new Error('无可退余额：执行时余额已被消费')
    }
    // ② 按实际回收额度换算应退金额（金流与额度流严格对称）
    const actualRefundAmount = rules.computeRefundAmount(order.price, order.quotaAmount, reversed)

    // 裁剪后金额经 round2 归 0（执行时余额仅剩零头）→ 回滚并拒绝：禁止 0 元调渠道
    // （真实渠道报错、mock 会把订单污染成 REFUNDED+0；入口处 early-reject 用的是快照余额，挡不住这里）
    if (!(actualRefundAmount > 0)) {
      await this._rollbackRefund(order, reversed, operator, 'refund amount rounded to zero')
      throw new Error('无可退余额：可退金额不足最小单位')
    }

    // ③ 渠道退款 + 终态（与重入续退共用；「额度已扣必有记录」由 reverse Lua 内原子 HSET 保证）
    return this._executeChannelRefund(order, reversed, actualRefundAmount, operator)
  }

  // REFUNDING 重入续退（调用方已持 per-order 退款锁）。卡单形态与对策：
  // ① channelRefundedAt 标记在 = 渠道已退、仅终态未落 → 只补终态，绝不再调渠道；
  // ② channelRefundAttemptAt 在而①不在 = 渠道调用结果未知（in-doubt）→ 拒绝自动重调渠道，转人工裁决；
  // ③ 账本回收 hash 有记录 = 额度已扣、渠道确定未调 → 按实扣额续退；
  // ④ 无记录 = 额度未扣（CAS 后 reverse 前中断，或前次回滚已收回）→ 按当前余额重新原子回收后续退，
  //    无可回收则解锁回 COMPLETED。
  async _resumeRefund(orderId, operator) {
    // withConfigSnapshot:true 取渠道配置快照供 _executeChannelRefund 调渠道（同 _approveRefundLocked）
    const order = await orderRepository.getById(orderId, { withConfigSnapshot: true })
    if (!order || order.status !== ORDER_STATUS.REFUNDING) {
      throw new Error(`订单当前状态不允许续退: ${order ? order.status : '不存在'}`)
    }
    const refId = `${order.id}:refund`
    if (order.channelRefundedAt) {
      // 量/额优先取订单字段（finalize 与标记同一 HSET 原子写）；「人工只补了 channelRefundedAt」
      // 的场景从账本实扣记录推导（账本是原子真相源），杜绝按 0/0 写成终态
      let quota = parseFloat(order.reversedQuota || 0)
      let amount = parseFloat(order.pendingRefundAmount || 0)
      if (!(quota > 0) || !(amount > 0)) {
        quota = await balanceLedger.getReversedQuota(order.apiKeyId, refId)
        amount = rules.computeRefundAmount(order.price, order.quotaAmount, quota)
      }
      if (!(quota > 0) || !(amount > 0)) {
        throw new Error('已退标记在而账本回收记录缺失，无法补终态，请人工核对处理')
      }
      return this._finalizeRefund(order, quota, amount, operator)
    }
    // in-doubt：前次渠道调用已发起、结果未知（throw 中断 / 成功未落标记 / 调用中崩溃）——
    // 自动重调=双退风险，一律转人工裁决：管理端「退款裁决」（resolveRefundInDoubt）核渠道流水后
    // 判已退（补终态）或判未退（回滚解锁）
    if (order.channelRefundAttemptAt) {
      throw new Error('渠道退款结果未知（in-doubt）：请核对渠道流水后在订单管理执行「退款裁决」')
    }
    let quota = await balanceLedger.getReversedQuota(order.apiKeyId, refId)
    if (!(quota > 0)) {
      const balance = await balanceLedger.get(order.apiKeyId)
      const refundableQuota = rules.computeRefundableQuota(order.quotaAmount, balance)
      const reversed =
        refundableQuota > 0
          ? await balanceLedger.reverse(order.apiKeyId, refundableQuota, refId, {
              orderId: order.id,
              operator,
              resume: true
            })
          : 0
      if (reversed === -1) {
        // applied 在而回收 hash 无记录：仅原子记录机制之前的旧数据可能，人工对账
        throw new Error('额度已回收但无账本记录（旧数据卡单），请人工对账处理')
      }
      if (!(reversed > 0)) {
        await orderRepository.casStatus(order.id, ORDER_STATUS.REFUNDING, ORDER_STATUS.COMPLETED, {
          failedReason: 'no refundable balance at resume'
        })
        throw new Error('无可退余额：执行时余额已被消费，订单已解锁')
      }
      quota = reversed
    }
    const amount = rules.computeRefundAmount(order.price, order.quotaAmount, quota)
    if (!(amount > 0)) {
      await this._rollbackRefund(order, quota, operator, 'refund amount rounded to zero')
      throw new Error('无可退余额：可退金额不足最小单位')
    }
    return this._executeChannelRefund(order, quota, amount, operator)
  }

  // in-doubt 人工裁决（管理员先在渠道后台核对流水，再二选一）。与 approveRefund 共用 per-order 锁互斥：
  //   refunded     渠道已退款 → 补 channelRefundedAt 并经重入只补终态（量/额自账本推导，绝不再调渠道）
  //   not_refunded 渠道未退款 → 回滚已扣额度并解锁回 COMPLETED（要继续退款重新审批，走全新校验）
  async resolveRefundInDoubt(orderId, outcome, { operator = 'admin' } = {}) {
    if (!['refunded', 'not_refunded'].includes(outcome)) {
      throw new Error(`无效裁决结论: ${outcome}`)
    }
    const lockKey = RedisKeys.payment.lockRefund(orderId)
    const lockValue = uuidv4()
    if (!(await redis.setAccountLock(lockKey, lockValue, 60000))) {
      throw new Error('该订单退款执行中，请稍后重试')
    }
    try {
      const order = await orderRepository.getById(orderId)
      if (!order || order.status !== ORDER_STATUS.REFUNDING) {
        throw new Error(`订单当前状态不允许裁决: ${order ? order.status : '不存在'}`)
      }
      if (!order.channelRefundAttemptAt && !order.channelRefundedAt) {
        throw new Error('该订单不在 in-doubt 状态：直接重新审批退款即可自动续退')
      }
      // 已标记渠道已退款的单只能补终态：判未退=回滚额度+解锁，与渠道金流相反（用户钱与额度双拿）
      if (outcome === 'not_refunded' && order.channelRefundedAt) {
        throw new Error(
          '该订单已标记渠道已退款，仅可「判已退」补终态；若标记有误属数据异常，请人工核实'
        )
      }
      // 裁决证据（REFUND_RESOLVED）在动作成功后落——过早记会在动作失败时留下与真实状态相反的记录；
      // 动作已成后审计仅 best-effort，失败不回滚动作
      if (outcome === 'refunded') {
        await orderRepository.setFields(order.id, {
          channelRefundedAt: order.channelRefundedAt || new Date().toISOString()
        })
        const result = await this._resumeRefund(order.id, operator)
        try {
          await paymentAudit.record(orderId, 'REFUND_RESOLVED', { outcome }, operator)
        } catch (auditError) {
          logger.error('❌ [payment] audit record failed:', auditError)
        }
        return result
      }
      // not_refunded：按账本实扣额回滚 + 解锁（_rollbackRefund 会清在途标记、记异常审计）。
      // 回滚是本裁决的核心动作：未生效不得记 RESOLVED、不得报成功（已留 REFUND_ROLLBACK_FAILED 审计）
      const quota = await balanceLedger.getReversedQuota(order.apiKeyId, `${order.id}:refund`)
      const rolledBack = await this._rollbackRefund(
        order,
        quota,
        operator,
        'in-doubt resolved: channel not refunded'
      )
      if (!rolledBack) {
        throw new Error('裁决未完成：额度回滚未生效（已记审计），请人工对账后重试')
      }
      try {
        await paymentAudit.record(
          orderId,
          'REFUND_RESOLVED',
          { outcome, reversedQuota: quota },
          operator
        )
      } catch (auditError) {
        logger.error('❌ [payment] audit record failed:', auditError)
      }
      return { success: true, resolved: 'not_refunded', reversedQuota: quota }
    } finally {
      await redis.releaseAccountLock(lockKey, lockValue)
    }
  }

  // 回滚已回收额度并解锁订单（unreverse 按账本实扣额撤销、清幂等标记，可重试）。
  // 回滚未生效（异常 / -1=账本记录缺失拒绝盲回滚）= 额度已收、钱未退（偏安全侧，不会超退），
  // 记审计；订单回 COMPLETED 后重新审批会经 reverse=-1 + 账本记录续退或转人工。
  async _rollbackRefund(order, reversed, operator, reason) {
    let rolled = null
    let rollbackError = null
    try {
      rolled = await balanceLedger.unreverse(order.apiKeyId, reversed, `${order.id}:refund`, {
        orderId: order.id
      })
    } catch (e) {
      rollbackError = e
    }
    // rolled<=0 一律按回滚未生效记审计：-1=账本记录缺失拒绝盲回滚；0=applied 无此 refId——
    // 在「先 reverse 后 rollback」的锁内调用纪律下不可达，出现即异常态（额度可能未退回），不可静默成功
    if (rollbackError || !(rolled > 0)) {
      logger.error(
        `❌ [payment] unreverse failed/refused order=${order.id} quota=${reversed} rolled=${rolled}:`,
        rollbackError
      )
      try {
        await paymentAudit.record(
          order.id,
          'REFUND_ROLLBACK_FAILED',
          { reversedQuota: reversed, rolled, reason },
          operator
        )
      } catch (auditError) {
        logger.error('❌ [payment] audit record failed:', auditError)
      }
    }
    // 清渠道在途标记（走到回滚=渠道结果已知为失败/未调），避免下轮重入被误判 in-doubt
    try {
      await orderRepository.setFields(order.id, { channelRefundAttemptAt: '' })
    } catch (e) {
      logger.error(`❌ [payment] clear attempt marker failed order=${order.id}:`, e)
    }
    await orderRepository.casStatus(order.id, ORDER_STATUS.REFUNDING, ORDER_STATUS.COMPLETED, {
      failedReason: reason
    })
    // 返回回滚是否生效：渠道确定失败路径忽略（解锁优先，失败已审计、重入自愈）；
    // 裁决「判未退」路径必须检查——回滚就是裁决的核心动作，未生效不得报成功
    return !rollbackError && rolled > 0
  }

  // 渠道退款 + 终态落库（主路径与重入续退共用）。前提：额度已回收、订单处于 REFUNDING。
  async _executeChannelRefund(order, reversed, actualRefundAmount, operator) {
    // 在途标记（write-ahead）：渠道调用前先落 channelRefundAttemptAt——重入见「有在途、无已退」
    // 即 in-doubt 拒绝自动重调渠道（双退风险收敛为人工核对，fail-safe）。
    // 标记写失败 = 渠道必然未调，回滚拒绝，干净可重试
    try {
      await orderRepository.setFields(order.id, {
        channelRefundAttemptAt: new Date().toISOString()
      })
    } catch (error) {
      logger.error(`❌ [payment] persist attempt marker failed order=${order.id}:`, error)
      await this._rollbackRefund(order, reversed, operator, 'persist attempt marker failed')
      throw error
    }
    // 退款渠道配置优先读「下单时固化的快照」(providerConfigSnapshot)，使实例可自由改密钥/配置/下线而不冻结本单。
    // 存量订单无快照(null) → 回退查实例当前 config（兼容快照化之前创建的订单；这类实例受删除守卫保护不可删）。
    let providerConfig = order.providerConfigSnapshot
    if (providerConfig === null || providerConfig === undefined) {
      const instance = order.providerInstanceId
        ? await providerRepository.getById(order.providerInstanceId, { withConfig: true })
        : null
      providerConfig = instance ? instance.config : {}
    }
    const provider = registry.getByKey(order.providerKey)
    let refundResult
    try {
      refundResult = await provider.refund(order, actualRefundAmount, providerConfig)
    } catch (error) {
      // 渠道调用抛异常 ≠ 确定失败：超时/连接中断/响应丢失时渠道可能已退款。不回滚、不清在途标记、
      // 订单留 REFUNDING——重入命中 in-doubt 转人工裁决。适配器契约：确认「未执行/已拒绝」须
      // return {success:false}（走自动回滚、可重试），throw 一律按结果未知处理
      logger.error(`❌ [payment] refund call threw (in-doubt) order=${order.id}:`, error)
      try {
        await paymentAudit.record(
          order.id,
          'REFUND_IN_DOUBT',
          { refundAmount: actualRefundAmount, reversedQuota: reversed },
          operator
        )
      } catch (auditError) {
        logger.error('❌ [payment] audit record failed:', auditError)
      }
      throw new Error(
        '渠道退款调用异常、结果未知（in-doubt）：订单保持退款中，请核对渠道流水后在订单管理执行「退款裁决」'
      )
    }
    if (!refundResult.success) {
      await this._rollbackRefund(
        order,
        reversed,
        operator,
        refundResult.message || 'refund rejected'
      )
      throw new Error(refundResult.message || '渠道退款失败')
    }
    // 渠道已退钱：进入终态落库（先落「渠道已退」标记），失败重试、卡单重入只补终态绝不重调渠道
    return this._finalizeRefund(order, reversed, actualRefundAmount, operator)
  }

  // 渠道退款成功后的终态落库（可重入）：先落 channelRefundedAt 标记 + 回收/金额记录，再置 REFUNDED。
  // 任一步失败整体重试 3 次（钱已出、必须尽力落库）；全部失败时订单仍 REFUNDING——
  // channelRefundedAt 已落则重入只补终态、绝不再调渠道；连标记都没落则重入命中 in-doubt
  // （channelRefundAttemptAt 在）转人工裁决，任何路径都不会自动双退。
  async _finalizeRefund(order, reversed, actualRefundAmount, operator) {
    let transitioned = null
    let lastError = null
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await orderRepository.setFields(order.id, {
          channelRefundedAt: new Date().toISOString(),
          reversedQuota: reversed,
          pendingRefundAmount: actualRefundAmount
        })
        transitioned = await orderRepository.casStatus(
          order.id,
          ORDER_STATUS.REFUNDING,
          ORDER_STATUS.REFUNDED,
          {
            refundedAmount: actualRefundAmount,
            refundedAt: new Date().toISOString()
          }
        )
        lastError = null
        break
      } catch (error) {
        lastError = error
        logger.error(
          `❌ [payment] finalize refund attempt ${attempt}/3 failed order=${order.id}:`,
          error
        )
        if (attempt < 3) {
          await new Promise((resolve) => setTimeout(resolve, attempt * 200))
        }
      }
    }
    if (lastError) {
      logger.error(
        `❌ [payment] CRITICAL: channel refunded but finalize failed order=${order.id} amount=${actualRefundAmount} quota=${reversed}`,
        lastError
      )
      throw new Error(
        '渠道退款已成功但终态落库失败：存储恢复后重新审批将自动补终态或转入 in-doubt 人工核对'
      )
    }
    // CAS 未生效（非异常）：复核真实状态——已是 REFUNDED（前次写实际已落 / 幂等重入）按成功续走；
    // 其它状态 = 订单被外部变更而渠道已退款，终态冲突：不记 REFUNDED 审计、不返回成功，转人工
    if (transitioned !== 1) {
      const current = await orderRepository.getById(order.id)
      if (!current || current.status !== ORDER_STATUS.REFUNDED) {
        logger.error(
          `❌ [payment] CRITICAL: finalize status conflict order=${order.id} status=${current ? current.status : 'missing'} amount=${actualRefundAmount}（渠道已退款）`
        )
        throw new Error(
          `渠道已退款但订单状态异常（${current ? current.status : '不存在'}），终态冲突，请人工核对处理`
        )
      }
    }
    // 审计 best-effort：钱与状态均已落，审计失败不应让调用方误判退款失败
    try {
      await paymentAudit.record(
        order.id,
        'REFUNDED',
        { refundAmount: actualRefundAmount, reversedQuota: reversed },
        operator
      )
    } catch (auditError) {
      logger.error('❌ [payment] audit record failed:', auditError)
    }
    logger.info(
      `[payment] refunded order=${order.id} amount=${actualRefundAmount} reversedQuota=${reversed}`
    )
    return { success: true, refundAmount: actualRefundAmount, reversedQuota: reversed }
  }

  // 用户取消未支付订单（校验归属）
  async cancelOrder(orderId, apiKeyId) {
    const order = await orderRepository.getById(orderId)
    if (!order) {
      throw new Error('订单不存在')
    }
    if (order.apiKeyId !== apiKeyId) {
      throw new Error('无权操作该订单')
    }
    const ok = await orderRepository.casStatus(
      orderId,
      ORDER_STATUS.PENDING,
      ORDER_STATUS.CANCELLED,
      {}
    )
    if (ok !== 1) {
      throw new Error('订单当前状态不可取消')
    }
    // 释放下单时预留的实例当日额度
    if (order.providerInstanceId) {
      await providerRepository.releaseDailyReservation(
        order.providerInstanceId,
        order.id,
        order.providerReservedDate || order.createdAt.slice(0, 10)
      )
    }
    return { success: true }
  }

  async getOrder(orderId) {
    return orderRepository.getById(orderId)
  }

  async listOrdersByApiKey(apiKeyId, options) {
    return orderRepository.listByApiKey(apiKeyId, options)
  }

  async getBalance(apiKeyId) {
    return balanceLedger.get(apiKeyId)
  }

  async getAuditLog(orderId) {
    return paymentAudit.list(orderId)
  }

  // 管理看板统计：分片扫字段，不一次装全量订单对象
  // 口径=已实现净收入：completed/refunding/refunded 都已付款，按净额(payAmount-refundedAmount)计
  async dashboard() {
    const settledStatuses = new Set([
      ORDER_STATUS.COMPLETED,
      ORDER_STATUS.REFUNDING,
      ORDER_STATUS.REFUNDED
    ])
    const today = redis.getDateStringInTimezone(new Date())
    let totalAmount = 0
    let todayAmount = 0
    let todayCount = 0
    let totalCount = 0
    const byChannel = {}
    const byKey = {}
    for await (const row of orderRepository.iterateOrderFields([
      'status',
      'payAmount',
      'refundedAmount',
      'paidAt',
      'providerKey',
      'apiKeyId',
      'apiKeyName'
    ])) {
      if (!settledStatuses.has(row.status)) {
        continue
      }
      totalCount += 1
      const payAmount = parseFloat(row.payAmount || 0)
      const refundedAmount = parseFloat(row.refundedAmount || 0)
      const net = payAmount - refundedAmount
      totalAmount += net
      if (row.paidAt && redis.getDateStringInTimezone(new Date(row.paidAt)) === today) {
        todayAmount += net
        todayCount += 1
      }
      const channel = row.providerKey || 'unknown'
      byChannel[channel] = rules.round2((byChannel[channel] || 0) + net)
      const id = row.apiKeyId || 'unknown'
      if (!byKey[id]) {
        byKey[id] = { apiKeyId: id, apiKeyName: row.apiKeyName || id, amount: 0 }
      }
      byKey[id].amount += net
      // 展示名取最近一单（iterate 倒序，首次见到的即最新）
      if (!byKey[id]._named && row.apiKeyName) {
        byKey[id].apiKeyName = row.apiKeyName
        byKey[id]._named = true
      }
    }
    const topKeys = Object.values(byKey)
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 10)
      .map((k) => ({
        apiKeyId: k.apiKeyId,
        apiKeyName: k.apiKeyName,
        amount: rules.round2(k.amount)
      }))
    return {
      totalAmount: rules.round2(totalAmount),
      todayAmount: rules.round2(todayAmount),
      totalCount,
      todayCount,
      byChannel,
      topKeys
    }
  }
}

module.exports = new PaymentOrderService()
