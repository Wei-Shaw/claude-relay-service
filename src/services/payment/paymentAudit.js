// 支付审计日志：仅追加，记录订单关键动作（创建/支付/退款/补单）。审计失败不影响主流程。
// [人工决策-2026-08-11 09:33:17] Redis 硬化：审计与订单同属支付证据，key 不设 TTL
// （与 payment:order 一致；丢了只能从 data:export:payment / RDB-AOF 恢复）。条数仍 LTRIM 有界。

const redis = require('../../models/redis')
const logger = require('../../utils/logger')

const { RedisKeys, LIMITS } = require('../../constants/redisKeys')

const AUDIT_KEY = (orderId) => RedisKeys.payment.audit(orderId)
const AUDIT_MAX = LIMITS.paymentAudit

class PaymentAudit {
  async record(orderId, action, detail = {}, operator = 'system') {
    try {
      const entry = JSON.stringify({ action, detail, operator, at: new Date().toISOString() })
      await redis.client.rpush(AUDIT_KEY(orderId), entry)
      await redis.client.ltrim(AUDIT_KEY(orderId), -AUDIT_MAX, -1)
      // 不 expire：支付证据永不过期（运维靠 data:export:payment 备份）
    } catch (error) {
      logger.error(`❌ [payment] audit record failed order=${orderId} action=${action}:`, error)
    }
  }

  async list(orderId) {
    const items = await redis.client.lrange(AUDIT_KEY(orderId), 0, -1)
    return items
      .map((item) => {
        try {
          return JSON.parse(item)
        } catch (e) {
          return null
        }
      })
      .filter(Boolean)
  }
}

module.exports = new PaymentAudit()
