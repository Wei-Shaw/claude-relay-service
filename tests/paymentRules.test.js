const rules = require('../src/services/payment/paymentRules')

describe('paymentRules - 纯函数', () => {
  test('canTransition：合法/非法转移', () => {
    expect(rules.canTransition('pending', 'paid')).toBe(true)
    expect(rules.canTransition('pending', 'expired')).toBe(true)
    expect(rules.canTransition('paid', 'completed')).toBe(true)
    expect(rules.canTransition('completed', 'refunding')).toBe(true)
    // 误关单复活
    expect(rules.canTransition('expired', 'paid')).toBe(true)
    expect(rules.canTransition('cancelled', 'paid')).toBe(true)
    // 非法
    expect(rules.canTransition('completed', 'paid')).toBe(false)
    expect(rules.canTransition('refunded', 'paid')).toBe(false)
    expect(rules.canTransition('pending', 'completed')).toBe(false)
  })

  test('isTerminal：仅 completed/refunded；expired/cancelled 可复活故非终态', () => {
    expect(rules.isTerminal('completed')).toBe(true)
    expect(rules.isTerminal('refunded')).toBe(true)
    expect(rules.isTerminal('pending')).toBe(false)
    expect(rules.isTerminal('paid')).toBe(false)
    expect(rules.isTerminal('expired')).toBe(false)
    expect(rules.isTerminal('cancelled')).toBe(false)
  })

  test('computePayAmount：含手续费', () => {
    expect(rules.computePayAmount(100, 0)).toBe(100)
    expect(rules.computePayAmount(100, 0.06)).toBe(106)
    expect(rules.computePayAmount(35, 0)).toBe(35)
  })

  test('computePriceFromQuota：按倍率换算售价', () => {
    expect(rules.computePriceFromQuota(100, 0.35)).toBe(35)
    expect(rules.computePriceFromQuota(50, 0.28)).toBe(14)
  })

  test('computeRefundableQuota：min(额度, 余额)，余额为负按 0', () => {
    expect(rules.computeRefundableQuota(100, 100)).toBe(100) // 全未消费
    expect(rules.computeRefundableQuota(100, 40)).toBe(40) // 已消费 60
    expect(rules.computeRefundableQuota(100, 0)).toBe(0) // 全消费完
    expect(rules.computeRefundableQuota(100, -5)).toBe(0) // 超扣成负
  })

  test('computeRefundAmount：按未消费比例对称退款（问题5）', () => {
    // 充 100 额度付 35 元：未消费 100→退 35；剩 40→退 14；剩 0→退 0
    expect(rules.computeRefundAmount(35, 100, 100)).toBe(35)
    expect(rules.computeRefundAmount(35, 100, 40)).toBe(14)
    expect(rules.computeRefundAmount(35, 100, 0)).toBe(0)
  })
})
