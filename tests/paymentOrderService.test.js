// 用 mock 依赖测 paymentOrderService 的编排与幂等（不依赖真实 Redis）。

jest.mock('../src/models/redis', () => ({
  getApiKey: jest.fn(),
  getDateStringInTimezone: jest.fn((date = new Date()) => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }),
  setAccountLock: jest.fn().mockResolvedValue(true),
  releaseAccountLock: jest.fn().mockResolvedValue(true),
  client: {
    hset: jest.fn(),
    get: jest.fn(),
    incrbyfloat: jest.fn(),
    expire: jest.fn(),
    zrange: jest.fn(),
    hmget: jest.fn()
  }
}))
jest.mock('../src/services/payment/paymentConfig', () => ({ getConfig: jest.fn() }))
jest.mock('../src/services/payment/orderRepository', () => ({
  save: jest.fn(),
  getById: jest.fn(),
  setFields: jest.fn(),
  casStatus: jest.fn(),
  pendingStats: jest.fn(),
  listByApiKey: jest.fn(),
  listAll: jest.fn(),
  scanExpiredPending: jest.fn(),
  reschedulePending: jest.fn(),
  removeFromPendingIndex: jest.fn(),
  scanStatusIndex: jest.fn().mockResolvedValue([]),
  // dashboard 用分片字段迭代，不再 listAll 全量
  iterateOrderFields: jest.fn(async function* () {})
}))
jest.mock('../src/services/payment/planRepository', () => ({ getById: jest.fn() }))
jest.mock('../src/services/payment/balanceLedger', () => ({
  get: jest.fn(),
  credit: jest.fn(),
  reverse: jest.fn(),
  setBaselineIfAbsent: jest.fn()
}))
jest.mock('../src/services/payment/providers/registry', () => ({
  hasType: jest.fn(),
  getByType: jest.fn(),
  getByKey: jest.fn(),
  findByKey: jest.fn()
}))
jest.mock('../src/services/payment/providerRepository', () => ({
  selectInstance: jest.fn(),
  getById: jest.fn(),
  releaseDailyReservation: jest.fn(),
  getDailyReservations: jest.fn(),
  list: jest.fn()
}))
jest.mock('../src/services/payment/paymentAudit', () => ({
  record: jest.fn(),
  list: jest.fn()
}))
jest.mock('../src/utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  success: jest.fn(),
  debug: jest.fn()
}))

const redis = require('../src/models/redis')
const paymentConfig = require('../src/services/payment/paymentConfig')
const orderRepository = require('../src/services/payment/orderRepository')
const planRepository = require('../src/services/payment/planRepository')
const balanceLedger = require('../src/services/payment/balanceLedger')
const registry = require('../src/services/payment/providers/registry')
const providerRepository = require('../src/services/payment/providerRepository')
const paymentOrderService = require('../src/services/payment/paymentOrderService')

beforeEach(() => {
  jest.clearAllMocks()
})

describe('createOrder', () => {
  const baseConfig = {
    enabled: true,
    maxPendingOrders: 3,
    feeRate: 0,
    orderTimeoutMinutes: 30,
    allowCustomAmount: false,
    customRatio: 0,
    dailyLimit: 0,
    enabledPaymentTypes: ['mock']
  }

  test('商品下单成功：建单 + 调渠道 + 回填支付凭证', async () => {
    paymentConfig.getConfig.mockResolvedValue(baseConfig)
    registry.hasType.mockReturnValue(true)
    const provider = {
      providerKey: 'mock',
      supportsRefund: true,
      createPayment: jest.fn().mockResolvedValue({ payUrl: 'u', qrCode: 'q', tradeNo: 't' })
    }
    registry.getByType.mockReturnValue(provider)
    redis.getApiKey.mockResolvedValue({ id: 'k1', userId: 'u1', name: 'My Key' })
    orderRepository.pendingStats.mockResolvedValue({ count: 0, pendingPayAmountSum: 0 })
    planRepository.getById.mockResolvedValue({
      id: 'p1',
      enabled: true,
      quotaAmount: 100,
      price: 35,
      currency: 'CNY'
    })
    orderRepository.getById.mockResolvedValue({ id: 'o1', status: 'pending' })

    const result = await paymentOrderService.createOrder({
      apiKeyId: 'k1',
      planId: 'p1',
      paymentType: 'mock'
    })

    expect(orderRepository.save).toHaveBeenCalledTimes(1)
    // 回归守卫：mock 渠道无实例，退款能力快照应取 provider.supportsRefund（true），否则 mock 订单完成后永久不可退
    expect(orderRepository.save.mock.calls[0][0]).toMatchObject({ refundEnabledSnapshot: true })
    expect(provider.createPayment).toHaveBeenCalledTimes(1)
    // pendingStats 带当天日期，金额只计今天创建的 pending（问题1）
    expect(orderRepository.pendingStats).toHaveBeenCalledWith('k1', expect.any(String))
    expect(orderRepository.setFields).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ payUrl: 'u', qrCode: 'q', tradeNo: 't' })
    )
    expect(result.pay.payUrl).toBe('u')
  })

  test('支付方式未启用则拒绝（问题3：后端约束 enabledPaymentTypes）', async () => {
    paymentConfig.getConfig.mockResolvedValue({ ...baseConfig, enabledPaymentTypes: ['alipay'] })
    registry.hasType.mockReturnValue(true)

    await expect(
      paymentOrderService.createOrder({ apiKeyId: 'k1', planId: 'p1', paymentType: 'mock' })
    ).rejects.toThrow('支付方式未启用')
    expect(orderRepository.save).not.toHaveBeenCalled()
  })

  test('支付未启用则拒绝', async () => {
    paymentConfig.getConfig.mockResolvedValue({ ...baseConfig, enabled: false })
    await expect(
      paymentOrderService.createOrder({ apiKeyId: 'k1', planId: 'p1', paymentType: 'mock' })
    ).rejects.toThrow('支付功能未启用')
  })

  test('每日限额：计入在途 pending 金额后超限则拒绝、不落单（问题2 并发口径）', async () => {
    paymentConfig.getConfig.mockResolvedValue({ ...baseConfig, dailyLimit: 100 })
    registry.hasType.mockReturnValue(true)
    registry.getByType.mockReturnValue({ providerKey: 'mock', createPayment: jest.fn() })
    redis.getApiKey.mockResolvedValue({ id: 'k1', name: 'My Key' })
    planRepository.getById.mockResolvedValue({
      id: 'p1',
      enabled: true,
      quotaAmount: 100,
      price: 60,
      currency: 'CNY'
    })
    // 锁内：已有在途 pending 合计 60；本单 payAmount=60；paidToday=0 → 0+60+60=120 > 100 拒绝
    orderRepository.pendingStats.mockResolvedValue({ count: 1, pendingPayAmountSum: 60 })
    redis.client.get.mockResolvedValue('0')

    await expect(
      paymentOrderService.createOrder({ apiKeyId: 'k1', planId: 'p1', paymentType: 'mock' })
    ).rejects.toThrow('超过每日充值限额')
    expect(orderRepository.save).not.toHaveBeenCalled()
  })
})

describe('fulfillOrder - 履约幂等', () => {
  test('PAID：入账一次并置 COMPLETED', async () => {
    orderRepository.getById.mockResolvedValue({
      id: 'o1',
      apiKeyId: 'k1',
      quotaAmount: 100,
      status: 'paid'
    })
    balanceLedger.credit.mockResolvedValue(100)
    orderRepository.casStatus.mockResolvedValue(1)

    const result = await paymentOrderService.fulfillOrder('o1')

    expect(balanceLedger.credit).toHaveBeenCalledTimes(1)
    expect(balanceLedger.credit).toHaveBeenCalledWith('k1', 100, 'o1', { orderId: 'o1' })
    expect(redis.client.hset).toHaveBeenCalledWith('apikey:k1', 'billingMode', 'prepaid')
    expect(orderRepository.casStatus).toHaveBeenCalledWith(
      'o1',
      'paid',
      'completed',
      expect.any(Object)
    )
    expect(result.fulfilled).toBe(true)
  })

  test('已 COMPLETED：不重复入账（幂等）', async () => {
    orderRepository.getById.mockResolvedValue({ id: 'o1', status: 'completed' })
    const result = await paymentOrderService.fulfillOrder('o1')
    expect(balanceLedger.credit).not.toHaveBeenCalled()
    expect(result.alreadyDone).toBe(true)
  })

  test('非 PAID（pending）：不入账', async () => {
    orderRepository.getById.mockResolvedValue({ id: 'o1', status: 'pending' })
    const result = await paymentOrderService.fulfillOrder('o1')
    expect(balanceLedger.credit).not.toHaveBeenCalled()
    expect(result.fulfilled).toBe(false)
  })
})

describe('confirmPayment', () => {
  test('金额不匹配则抛错', async () => {
    await expect(
      paymentOrderService.confirmPayment({ id: 'o1', payAmount: 106 }, { paidAmount: 50 })
    ).rejects.toThrow('支付金额不匹配')
  })

  test('CAS PENDING→PAID 后履约', async () => {
    orderRepository.casStatus.mockResolvedValue(1)
    orderRepository.getById.mockResolvedValue({
      id: 'o1',
      apiKeyId: 'k1',
      quotaAmount: 100,
      status: 'paid'
    })
    balanceLedger.credit.mockResolvedValue(100)

    await paymentOrderService.confirmPayment({ id: 'o1', payAmount: 106 }, { paidAmount: 106 })

    expect(orderRepository.casStatus).toHaveBeenCalledWith(
      'o1',
      'pending',
      'paid',
      expect.any(Object)
    )
    expect(balanceLedger.credit).toHaveBeenCalledTimes(1)
  })
})

describe('approveRefund - 对称退款', () => {
  test('已消费 60 时退款按未消费比例并回收余额（问题5）', async () => {
    orderRepository.getById.mockResolvedValue({
      id: 'o1',
      apiKeyId: 'k1',
      quotaAmount: 100,
      price: 35,
      status: 'completed'
    })
    balanceLedger.get.mockResolvedValue(40) // 余额 40 = 已消费 60
    orderRepository.casStatus.mockResolvedValue(1)
    const provider = {
      supportsRefund: true,
      refund: jest.fn().mockResolvedValue({ success: true })
    }
    registry.getByKey.mockReturnValue(provider)
    registry.findByKey.mockReturnValue(provider)
    balanceLedger.reverse.mockResolvedValue(40)

    const result = await paymentOrderService.approveRefund('o1', {})

    expect(result.refundAmount).toBe(14) // 35 * 40 / 100
    expect(balanceLedger.reverse).toHaveBeenCalledWith('k1', 40, 'o1:refund', expect.any(Object))
    expect(result.success).toBe(true)
  })

  test('余额已耗尽（可退额=0）：直接拒绝，不锁单、不调渠道（问题5）', async () => {
    orderRepository.getById.mockResolvedValue({
      id: 'o1',
      apiKeyId: 'k1',
      quotaAmount: 100,
      price: 35,
      status: 'completed'
    })
    balanceLedger.get.mockResolvedValue(0) // 余额 0 = 已全部消费

    await expect(paymentOrderService.approveRefund('o1', {})).rejects.toThrow('无可退余额')
    expect(orderRepository.casStatus).not.toHaveBeenCalled() // 未锁单
    expect(balanceLedger.reverse).not.toHaveBeenCalled() // 未回收余额
  })

  test('退款开关快照=false：直接拒绝，不回查实例当前配置（履约条款已固化）', async () => {
    orderRepository.getById.mockResolvedValue({
      id: 'o1',
      apiKeyId: 'k1',
      quotaAmount: 100,
      price: 35,
      status: 'completed',
      providerInstanceId: 'inst1',
      refundEnabledSnapshot: false
    })
    balanceLedger.get.mockResolvedValue(40)
    const provider = { supportsRefund: true, refund: jest.fn() }
    registry.getByKey.mockReturnValue(provider)
    registry.findByKey.mockReturnValue(provider)

    await expect(paymentOrderService.approveRefund('o1', {})).rejects.toThrow(
      '该支付渠道未开启退款'
    )
    expect(providerRepository.getById).not.toHaveBeenCalled() // 用快照，不回查实例
  })

  test('退款开关快照=true：放行且不回查实例（后台改坏实例配置不影响在途订单）', async () => {
    orderRepository.getById.mockResolvedValue({
      id: 'o1',
      apiKeyId: 'k1',
      quotaAmount: 100,
      price: 35,
      status: 'completed',
      providerInstanceId: 'inst1',
      refundEnabledSnapshot: true,
      // 配置快照化后订单自带渠道配置，退款读它、不回查实例
      providerConfigSnapshot: { appId: 'snap' }
    })
    balanceLedger.get.mockResolvedValue(40)
    orderRepository.casStatus.mockResolvedValue(1)
    const provider = {
      supportsRefund: true,
      refund: jest.fn().mockResolvedValue({ success: true })
    }
    registry.getByKey.mockReturnValue(provider)
    registry.findByKey.mockReturnValue(provider)
    balanceLedger.reverse.mockResolvedValue(40)

    const result = await paymentOrderService.approveRefund('o1', {})

    expect(result.success).toBe(true)
    expect(providerRepository.getById).not.toHaveBeenCalled() // 用快照，不回查实例
  })
})

describe('dashboard - 看板口径（问题6/7）', () => {
  test('已退款订单按净额计入、聚合维度为 API Key', async () => {
    const today = new Date().toISOString().slice(0, 10)
    const rows = [
      {
        status: 'completed',
        payAmount: 100,
        refundedAmount: 0,
        providerKey: 'mock',
        apiKeyId: 'ka',
        apiKeyName: 'KeyA',
        paidAt: `${today}T01:00:00.000Z`
      },
      {
        status: 'refunded',
        payAmount: 50,
        refundedAmount: 50,
        providerKey: 'mock',
        apiKeyId: 'kb',
        apiKeyName: 'KeyB',
        paidAt: `${today}T02:00:00.000Z`
      },
      {
        status: 'pending',
        payAmount: 999,
        refundedAmount: 0,
        providerKey: 'mock',
        apiKeyId: 'kc',
        apiKeyName: 'KeyC'
      }
    ]
    orderRepository.iterateOrderFields.mockImplementation(async function* () {
      for (const row of rows) {
        yield row
      }
    })

    const d = await paymentOrderService.dashboard()

    expect(d.totalAmount).toBe(100) // completed 100 + refunded 净额 0；pending 不计
    expect(d.totalCount).toBe(2)
    expect(d.byChannel.mock).toBe(100)
    expect(d.topKeys).toEqual([
      { apiKeyId: 'ka', apiKeyName: 'KeyA', amount: 100 },
      { apiKeyId: 'kb', apiKeyName: 'KeyB', amount: 0 }
    ])
  })

  test('聚合按 apiKeyId 而非名称：同名不同 key 不合并、同 key 改名不拆分（问题3）', async () => {
    const today = new Date().toISOString().slice(0, 10)
    // 倒序：先新后旧（与 iterateOrderFields zrevrange 一致）
    const rows = [
      {
        status: 'completed',
        payAmount: 10,
        refundedAmount: 0,
        providerKey: 'mock',
        apiKeyId: 'k1',
        apiKeyName: '新名',
        paidAt: `${today}T03:00:00.000Z`
      },
      {
        status: 'completed',
        payAmount: 20,
        refundedAmount: 0,
        providerKey: 'mock',
        apiKeyId: 'k1',
        apiKeyName: '旧名',
        paidAt: `${today}T01:00:00.000Z`
      },
      {
        status: 'completed',
        payAmount: 5,
        refundedAmount: 0,
        providerKey: 'mock',
        apiKeyId: 'k2',
        apiKeyName: '新名',
        paidAt: `${today}T02:00:00.000Z`
      }
    ]
    orderRepository.iterateOrderFields.mockImplementation(async function* () {
      for (const row of rows) {
        yield row
      }
    })

    const d = await paymentOrderService.dashboard()

    // k1 改名只合并为一桶（取最近一单「新名」）=30；k2 虽同名但 id 不同，独立=5
    expect(d.topKeys).toEqual([
      { apiKeyId: 'k1', apiKeyName: '新名', amount: 30 },
      { apiKeyId: 'k2', apiKeyName: '新名', amount: 5 }
    ])
  })
})

describe('实例当日额度预留/释放（问题1）', () => {
  const baseConfig = {
    enabled: true,
    maxPendingOrders: 3,
    feeRate: 0,
    orderTimeoutMinutes: 30,
    allowCustomAmount: false,
    customRatio: 0,
    dailyLimit: 0,
    lbStrategy: 'least_amount',
    enabledPaymentTypes: ['alipay']
  }

  test('createOrder 渠道下单失败时释放已预留的实例当日额度', async () => {
    paymentConfig.getConfig.mockResolvedValue(baseConfig)
    registry.hasType.mockReturnValue(true)
    redis.getApiKey.mockResolvedValue({ id: 'k1', name: 'My Key' })
    planRepository.getById.mockResolvedValue({
      id: 'p1',
      enabled: true,
      quotaAmount: 100,
      price: 35,
      currency: 'CNY'
    })
    // selectInstance 已原子预留了实例当日额度
    providerRepository.selectInstance.mockResolvedValue({
      instance: { id: 'inst1', providerKey: 'alipay' },
      config: {}
    })
    registry.getByKey.mockReturnValue({
      providerKey: 'alipay',
      createPayment: jest.fn().mockRejectedValue(new Error('网关错误'))
    })
    orderRepository.pendingStats.mockResolvedValue({ count: 0, pendingPayAmountSum: 0 })

    await expect(
      paymentOrderService.createOrder({ apiKeyId: 'k1', planId: 'p1', paymentType: 'alipay' })
    ).rejects.toThrow('网关错误')
    // 任意失败都按 orderId 幂等释放预留（orderId 内部生成、date=预留日）
    expect(providerRepository.releaseDailyReservation).toHaveBeenCalledWith(
      'inst1',
      expect.any(String),
      expect.any(String)
    )
  })

  test('createPayment 成功后 setFields 失败：订单不回滚、预留不释放、仍返回成功（问题2）', async () => {
    paymentConfig.getConfig.mockResolvedValue(baseConfig)
    registry.hasType.mockReturnValue(true)
    redis.getApiKey.mockResolvedValue({ id: 'k1', name: 'My Key' })
    planRepository.getById.mockResolvedValue({
      id: 'p1',
      enabled: true,
      quotaAmount: 100,
      price: 35,
      currency: 'CNY'
    })
    providerRepository.selectInstance.mockResolvedValue({
      instance: { id: 'inst1', providerKey: 'alipay' },
      config: {}
    })
    registry.getByKey.mockReturnValue({
      providerKey: 'alipay',
      createPayment: jest.fn().mockResolvedValue({ payUrl: 'u', qrCode: 'q', tradeNo: 't' })
    })
    orderRepository.pendingStats.mockResolvedValue({ count: 0, pendingPayAmountSum: 0 })
    orderRepository.setFields.mockRejectedValue(new Error('redis 抖动')) // commit 后 setFields 失败

    const result = await paymentOrderService.createOrder({
      apiKeyId: 'k1',
      planId: 'p1',
      paymentType: 'alipay'
    })

    // 不抛错、返回有效订单（pay 凭证来自 payResult）
    expect(result.pay.payUrl).toBe('u')
    expect(result.order.payUrl).toBe('u')
    // 预留不释放（订单有效、上游已建单），订单不回滚 cancelled
    expect(providerRepository.releaseDailyReservation).not.toHaveBeenCalled()
    expect(orderRepository.casStatus).not.toHaveBeenCalled()
  })

  test('key 维度校验失败时不选实例、不预留（问题2：预留在校验之后）', async () => {
    paymentConfig.getConfig.mockResolvedValue({ ...baseConfig, maxPendingOrders: 1 })
    registry.hasType.mockReturnValue(true)
    redis.getApiKey.mockResolvedValue({ id: 'k1', name: 'My Key' })
    planRepository.getById.mockResolvedValue({
      id: 'p1',
      enabled: true,
      quotaAmount: 100,
      price: 35,
      currency: 'CNY'
    })
    // 已达待支付上限 → key 校验先失败，根本不应走到选实例
    orderRepository.pendingStats.mockResolvedValue({ count: 1, pendingPayAmountSum: 0 })

    await expect(
      paymentOrderService.createOrder({ apiKeyId: 'k1', planId: 'p1', paymentType: 'alipay' })
    ).rejects.toThrow('待支付订单过多')
    expect(providerRepository.selectInstance).not.toHaveBeenCalled()
    expect(providerRepository.releaseDailyReservation).not.toHaveBeenCalled()
    expect(orderRepository.save).not.toHaveBeenCalled()
  })

  test('cancelOrder 释放下单时预留的实例当日额度（按创建日）', async () => {
    orderRepository.getById.mockResolvedValue({
      id: 'o1',
      apiKeyId: 'k1',
      providerInstanceId: 'inst1',
      payAmount: 35,
      createdAt: '2026-06-03T10:00:00.000Z',
      status: 'pending'
    })
    orderRepository.casStatus.mockResolvedValue(1)

    await paymentOrderService.cancelOrder('o1', 'k1')

    expect(providerRepository.releaseDailyReservation).toHaveBeenCalledWith(
      'inst1',
      'o1',
      '2026-06-03'
    )
  })

  test('释放按 providerReservedDate（跨午夜不串日期：createdAt 落次日也用预留日）', async () => {
    orderRepository.getById.mockResolvedValue({
      id: 'o1',
      apiKeyId: 'k1',
      providerInstanceId: 'inst1',
      payAmount: 35,
      providerReservedDate: '2026-06-03', // 预留记在 6-3
      createdAt: '2026-06-04T00:01:00.000Z', // 但 createdAt 落在 6-4（跨午夜）
      status: 'pending'
    })
    orderRepository.casStatus.mockResolvedValue(1)

    await paymentOrderService.cancelOrder('o1', 'k1')

    // 必须释放到预留日 6-3，而不是 createdAt 日 6-4，否则 6-3 键预留永久卡死
    expect(providerRepository.releaseDailyReservation).toHaveBeenCalledWith(
      'inst1',
      'o1',
      '2026-06-03'
    )
  })

  test('expireTimedOutOrders 对每个过期单释放实例当日额度', async () => {
    orderRepository.scanExpiredPending.mockResolvedValueOnce(['o1']).mockResolvedValueOnce([]) // 第二轮空，结束 while
    orderRepository.casStatus.mockResolvedValue(1)
    orderRepository.getById.mockResolvedValue({
      id: 'o1',
      status: 'pending',
      providerKey: 'mock',
      providerInstanceId: 'inst1',
      outTradeNo: 'P1',
      payAmount: 50,
      expiresAt: '2026-06-03T09:00:00.000Z',
      createdAt: '2026-06-03T10:00:00.000Z'
    })
    // 关单前查单：未支付 → 继续 expire
    registry.getByKey.mockReturnValue({
      queryOrder: jest.fn().mockResolvedValue({ success: false })
    })

    const n = await paymentOrderService.expireTimedOutOrders()

    expect(n.expired).toBe(1)
    expect(n.recovered).toBe(0)
    expect(providerRepository.releaseDailyReservation).toHaveBeenCalledWith(
      'inst1',
      'o1',
      '2026-06-03'
    )
  })

  test('expireTimedOutOrders 关单前查到已付则补单不关单', async () => {
    orderRepository.scanExpiredPending.mockResolvedValueOnce(['o1']).mockResolvedValueOnce([])
    orderRepository.getById.mockResolvedValue({
      id: 'o1',
      status: 'pending',
      providerKey: 'mock',
      providerInstanceId: 'inst1',
      outTradeNo: 'P1',
      payAmount: 50,
      quotaAmount: 10,
      apiKeyId: 'k1',
      expiresAt: '2026-06-03T09:00:00.000Z',
      createdAt: '2026-06-03T10:00:00.000Z'
    })
    registry.getByKey.mockReturnValue({
      queryOrder: jest.fn().mockResolvedValue({ success: true, paidAmount: 50, tradeNo: 'T1' })
    })
    orderRepository.casStatus.mockResolvedValue(1)
    balanceLedger.credit.mockResolvedValue(10)
    balanceLedger.setBaselineIfAbsent.mockResolvedValue(true)

    const n = await paymentOrderService.expireTimedOutOrders()

    expect(n.recovered).toBe(1)
    expect(n.expired).toBe(0)
    expect(providerRepository.releaseDailyReservation).not.toHaveBeenCalled()
  })

  test('expire 查单失败宽限内推迟、不阻塞后续；超宽限强制关单', async () => {
    const recentExpire = new Date(Date.now() - 60 * 1000).toISOString() // 1 分钟前过期，仍在 15min 宽限
    orderRepository.scanExpiredPending.mockResolvedValueOnce(['o1']).mockResolvedValueOnce([])
    orderRepository.getById.mockResolvedValue({
      id: 'o1',
      status: 'pending',
      providerKey: 'mock',
      providerInstanceId: 'inst1',
      outTradeNo: 'P1',
      payAmount: 50,
      expiresAt: recentExpire,
      createdAt: '2026-06-03T10:00:00.000Z'
    })
    registry.getByKey.mockReturnValue({
      queryOrder: jest.fn().mockResolvedValue(null)
    })

    const n = await paymentOrderService.expireTimedOutOrders()

    expect(n.deferred).toBe(1)
    expect(n.expired).toBe(0)
    expect(orderRepository.reschedulePending).toHaveBeenCalled()
    expect(orderRepository.casStatus).not.toHaveBeenCalled()
  })

  test('reconcile 清孤儿/终态、保留在途与新孤儿，并覆盖完整 TTL 天数（问题1）', async () => {
    providerRepository.list.mockResolvedValue([{ id: 'inst1' }])
    const oldMs = 1000 // 远早于宽限期 → 旧孤儿，可清
    const recentMs = Date.now() // 刚预留、落库未完的在途窗口 → 不可清
    // 今天 4 笔预留、昨天空、前天 1 笔旧孤儿（value=`amount:reservedAtMs`）
    providerRepository.getDailyReservations
      .mockResolvedValueOnce({
        orphanOld: `10:${oldMs}`,
        orphanRecent: `15:${recentMs}`,
        cancelledOrder: `20:${oldMs}`,
        livePending: `30:${oldMs}`
      })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ orphanThirdDay: `11:${oldMs}` })
    // orphanOld / orphanRecent 不在表里 → null（订单未落库）
    const orders = {
      cancelledOrder: { id: 'cancelledOrder', status: 'cancelled' },
      livePending: { id: 'livePending', status: 'pending' }
    }
    orderRepository.getById.mockImplementation((oid) => Promise.resolve(orders[oid] || null))

    const cleaned = await paymentOrderService.reconcileInstanceDailyReservations()

    expect(cleaned).toBe(3) // 今天旧孤儿 + 终态单 + 第三天旧孤儿
    expect(providerRepository.releaseDailyReservation).toHaveBeenCalledWith(
      'inst1',
      'orphanOld',
      expect.any(String)
    )
    expect(providerRepository.releaseDailyReservation).toHaveBeenCalledWith(
      'inst1',
      'cancelledOrder',
      expect.any(String)
    )
    expect(providerRepository.releaseDailyReservation).toHaveBeenCalledWith(
      'inst1',
      'orphanThirdDay',
      expect.any(String)
    )
    // 新孤儿（在途落库未完）受宽限保护、有效在途单保留：都不清
    expect(providerRepository.releaseDailyReservation).not.toHaveBeenCalledWith(
      'inst1',
      'orphanRecent',
      expect.any(String)
    )
    expect(providerRepository.releaseDailyReservation).not.toHaveBeenCalledWith(
      'inst1',
      'livePending',
      expect.any(String)
    )
  })
})

describe('verifyOrder - 卡单兜底（问题1）', () => {
  test('paid 卡单：重试履约（幂等）而非直接返回', async () => {
    orderRepository.getById.mockResolvedValue({
      id: 'o1',
      apiKeyId: 'k1',
      quotaAmount: 100,
      status: 'paid'
    })
    balanceLedger.credit.mockResolvedValue(100)
    orderRepository.casStatus.mockResolvedValue(1)

    await paymentOrderService.verifyOrder('o1')

    // 对 paid 卡单触发履约：credit 被调用（而非早返回、不处理）
    expect(balanceLedger.credit).toHaveBeenCalledWith('k1', 100, 'o1', { orderId: 'o1' })
  })

  test('终态（completed）：原样返回，不重复履约', async () => {
    orderRepository.getById.mockResolvedValue({ id: 'o1', status: 'completed' })

    const r = await paymentOrderService.verifyOrder('o1')

    expect(balanceLedger.credit).not.toHaveBeenCalled()
    expect(r.status).toBe('completed')
  })
})
