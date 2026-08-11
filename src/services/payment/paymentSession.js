// 公开支付页的短期会话令牌：首次用完整 apiKey 验证后签发，绑定 keyId，后续请求只带 token，
// 避免明文 apiKey 在每个 /payment 请求体反复上行（规避问题1：强凭证扩散）。命中即滑动续期。

const crypto = require('crypto')

const redis = require('../../models/redis')
const { RedisKeys, TTL } = require('../../constants/redisKeys')

const SESSION_KEY = (token) => RedisKeys.payment.session(token)
const TTL_SECONDS = TTL.paymentSession // 30 分钟，滑动续期（每次校验命中刷新）

class PaymentSession {
  // 签发：绑定 keyId，返回不可枚举的随机 token
  async issue(keyId) {
    const token = crypto.randomBytes(32).toString('hex')
    await redis.client.set(SESSION_KEY(token), keyId, 'EX', TTL_SECONDS)
    return { token, expiresIn: TTL_SECONDS }
  }

  // 校验：命中返回 keyId 并滑动续期；未命中/过期返回 null
  async resolve(token) {
    if (!token) {
      return null
    }
    const keyId = await redis.client.get(SESSION_KEY(token))
    if (!keyId) {
      return null
    }
    await redis.client.expire(SESSION_KEY(token), TTL_SECONDS)
    return keyId
  }

  async revoke(token) {
    if (token) {
      await redis.client.del(SESSION_KEY(token))
    }
  }
}

module.exports = new PaymentSession()
