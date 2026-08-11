// 支付域纯函数：订单状态机、金额、退款额计算。无 IO，可独立单测。

// 订单状态
const ORDER_STATUS = {
  PENDING: 'pending',
  PAID: 'paid',
  COMPLETED: 'completed',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled',
  FAILED: 'failed',
  REFUNDING: 'refunding',
  REFUNDED: 'refunded'
}

// 终态：正常业务不可再流转（支付恢复路径除外：expired/cancelled 可因上游实付复活为 paid）
const TERMINAL_STATUSES = new Set([
  ORDER_STATUS.COMPLETED,
  ORDER_STATUS.REFUNDED
  // expired/cancelled 不进终态集：允许 webhook/查单/手工补单复活入账（防误关单永久丢款）
])

// 合法状态转移表
const ALLOWED_TRANSITIONS = {
  [ORDER_STATUS.PENDING]: [ORDER_STATUS.PAID, ORDER_STATUS.EXPIRED, ORDER_STATUS.CANCELLED],
  [ORDER_STATUS.PAID]: [ORDER_STATUS.COMPLETED, ORDER_STATUS.FAILED],
  [ORDER_STATUS.FAILED]: [ORDER_STATUS.PAID, ORDER_STATUS.COMPLETED],
  // 误关单/用户取消后上游仍付款：可复活为 paid 再履约
  [ORDER_STATUS.EXPIRED]: [ORDER_STATUS.PAID],
  [ORDER_STATUS.CANCELLED]: [ORDER_STATUS.PAID],
  [ORDER_STATUS.COMPLETED]: [ORDER_STATUS.REFUNDING],
  [ORDER_STATUS.REFUNDING]: [ORDER_STATUS.REFUNDED, ORDER_STATUS.COMPLETED]
}

// 某状态转移是否合法
const canTransition = (from, to) => (ALLOWED_TRANSITIONS[from] || []).includes(to)

const isTerminal = (status) => TERMINAL_STATUSES.has(status)

// 金额保留两位（规避浮点误差）
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100

// 实付金额 = 售价 ×(1 + 手续费率)
const computePayAmount = (price, feeRate = 0) => round2(Number(price) * (1 + Number(feeRate)))

// 自定义额度换算售价 = 额度 × 倍率
const computePriceFromQuota = (quota, ratio) => round2(Number(quota) * Number(ratio))

// 可回收额度 = min(订单额度, 当前余额)，余额为负按 0 计
const computeRefundableQuota = (quotaAmount, balance) =>
  Math.max(0, Math.min(Number(quotaAmount) || 0, Math.max(Number(balance) || 0, 0)))

// 可退金额 = 售价 × 可回收额度 / 订单额度（按已消费比例对称退款，规避问题5）
const computeRefundAmount = (price, quotaAmount, refundableQuota) =>
  Number(quotaAmount) > 0
    ? round2((Number(price) * Number(refundableQuota)) / Number(quotaAmount))
    : 0

module.exports = {
  ORDER_STATUS,
  TERMINAL_STATUSES,
  ALLOWED_TRANSITIONS,
  canTransition,
  isTerminal,
  round2,
  computePayAmount,
  computePriceFromQuota,
  computeRefundableQuota,
  computeRefundAmount
}
