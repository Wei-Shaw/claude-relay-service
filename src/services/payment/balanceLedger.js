// 预付费余额账本（出站端口的 Redis 实现）。
//
// 【方案A：余额是派生值，用量账本是真相源】
//   余额 = 净充值额度(credit − refunded) − prepaid 期间已用量(usage:cost:total − baseline)
//   - credit  累计：充值履约入账（幂等 refId=订单id）
//   - refunded 累计：退款回收（幂等 refId=订单id:refund）
//   - baseline：首次转 prepaid 时刻的 usage:cost:total（只算此后的消费）
//   - consumed：usage:cost:total（recordUsage 落账，倍率后口径，与 totalCostLimit 一致）
//
// 为何派生：消费【不再实时扣减余额】，余额按上式从用量真相源算。价值在于【单一账本】：
// 不再有"余额账本与用量账本漂移"。usage 落账失败时该笔确实未计（与 postpaid totalCost 限额
// 失真同源、同一 failure domain）——但只此一处、由 recordUsage catch 的含金额 ERROR 兜底对账
// 补账；不需要"待补扣"摊给不相关请求（大厂 metered-billing 的 usage-as-source 内核）。
// 并发窗口的小额透支（事后计费固有）仍可能，但余额会如实记为负、auth 据此拦截后续，不会丢钱。

const redis = require('../../models/redis')
const { RedisKeys, LIMITS } = require('../../constants/redisKeys')

const CREDIT = (keyId) => RedisKeys.payment.balanceCredit(keyId)
const REFUNDED = (keyId) => RedisKeys.payment.balanceRefunded(keyId)
const BASELINE = (keyId) => RedisKeys.payment.balanceBaseline(keyId)
const APPLIED = (keyId) => RedisKeys.payment.balanceApplied(keyId)
const REVERSED = (keyId) => RedisKeys.payment.balanceReversed(keyId)
const TX = (keyId) => RedisKeys.payment.balanceTx(keyId)
const TX_MAX = LIMITS.balanceTx

// 累加 + refId 幂等：已 applied 则不重复加，返回当前累计值（credit/refunded 共用）
const ADD_IDEMPOTENT_LUA = `
if redis.call('SISMEMBER', KEYS[2], ARGV[2]) == 1 then
  return redis.call('GET', KEYS[1]) or '0'
end
redis.call('SADD', KEYS[2], ARGV[2])
local nv = redis.call('INCRBYFLOAT', KEYS[1], ARGV[1])
redis.call('RPUSH', KEYS[3], ARGV[3])
redis.call('LTRIM', KEYS[3], -tonumber(ARGV[4]), -1)
return nv
`

// 退款回收（执行时裁剪）：在 Lua 内按派生公式算【当前】余额，actual=min(请求额, 余额)，
// 原子累加 refunded + 把 actual 按 refId 记入回收额 hash——防止"快照余额已过时、新消费吃掉余额"
// 导致的超退；实扣记录与扣减同脚本原子，保证「额度已扣必有记录」、卡单可按实扣额续退。
// actual<=0 时不标记 refId（余额若因再充值回升，可重试退款）。
// 已 applied 的 refId 返回 -1（与"余额为0"区分），调用方从回收额 hash 取实扣额度续退。
// KEYS: credit, refunded, baseline, usageCostTotal, applied, tx, reversedAmounts
const REVERSE_LUA = `
if redis.call('SISMEMBER', KEYS[5], ARGV[2]) == 1 then
  return '-1'
end
local credit = tonumber(redis.call('GET', KEYS[1]) or '0')
local refunded = tonumber(redis.call('GET', KEYS[2]) or '0')
local baseline = tonumber(redis.call('GET', KEYS[3]) or '0')
local consumed = tonumber(redis.call('GET', KEYS[4]) or '0')
local used = consumed - baseline
if used < 0 then used = 0 end
local bal = credit - refunded - used
local actual = tonumber(ARGV[1])
if bal < actual then actual = bal end
if actual <= 0 then
  return '0'
end
redis.call('SADD', KEYS[5], ARGV[2])
redis.call('HSET', KEYS[7], ARGV[2], tostring(actual))
redis.call('INCRBYFLOAT', KEYS[2], actual)
redis.call('RPUSH', KEYS[6], ARGV[3])
redis.call('LTRIM', KEYS[6], -tonumber(ARGV[4]), -1)
return tostring(actual)
`

// 回滚一次 reverse（渠道退款失败时补偿）：按回收额 hash 的实扣额撤销 refunded、清幂等标记与记录，
// 订单可重试退款。金额只信账本记录：applied 在而 hash 缺失（数据异常）返回 -1 拒绝回滚，
// 绝不按调用方传参盲撤销（多回=凭空送额度、少回=用户损失）。
// KEYS: refunded, applied, tx, reversedAmounts；ARGV: refId, tx, txMax
const UNREVERSE_LUA = `
if redis.call('SISMEMBER', KEYS[2], ARGV[1]) == 0 then
  return '0'
end
local amt = tonumber(redis.call('HGET', KEYS[4], ARGV[1]))
if not amt then
  return '-1'
end
redis.call('SREM', KEYS[2], ARGV[1])
redis.call('HDEL', KEYS[4], ARGV[1])
redis.call('INCRBYFLOAT', KEYS[1], -amt)
redis.call('RPUSH', KEYS[3], ARGV[2])
redis.call('LTRIM', KEYS[3], -tonumber(ARGV[3]), -1)
return tostring(amt)
`

const round6 = (n) => Math.round(n * 1e6) / 1e6

class BalanceLedger {
  // 已消费额度（真相源：usage:cost:total，由 recordUsage 落账）
  async _consumed(keyId) {
    return parseFloat((await redis.client.get(RedisKeys.usage.costTotal(keyId))) || 0)
  }

  // 派生余额 =(充值累计 − 退款累计) − max(0, 已消费 − prepaid 基线)
  async get(keyId) {
    const [credit, refunded, baseline, consumed] = await Promise.all([
      redis.client.get(CREDIT(keyId)),
      redis.client.get(REFUNDED(keyId)),
      redis.client.get(BASELINE(keyId)),
      this._consumed(keyId)
    ])
    const net = parseFloat(credit || 0) - parseFloat(refunded || 0)
    const used = Math.max(0, consumed - parseFloat(baseline || 0))
    return round6(net - used)
  }

  // 转 prepaid 时记消费基线（首次，SET NX 幂等）：之后只算基线后的消费
  async setBaselineIfAbsent(keyId) {
    const consumed = await this._consumed(keyId)
    await redis.client.set(BASELINE(keyId), String(consumed), 'NX')
  }

  // 充值入账：累加 credit（幂等 refId=订单id）。返回入账后派生余额。
  async credit(keyId, amount, refId, meta = {}) {
    const tx = JSON.stringify({
      type: 'credit',
      amount,
      refId,
      at: new Date().toISOString(),
      ...meta
    })
    await redis.client.eval(
      ADD_IDEMPOTENT_LUA,
      3,
      CREDIT(keyId),
      APPLIED(keyId),
      TX(keyId),
      String(amount),
      refId,
      tx,
      String(TX_MAX)
    )
    return this.get(keyId)
  }

  // 退款回收：执行时在 Lua 内按【当前】派生余额原子裁剪（防快照过时超退），幂等 refId=订单id:refund，
  // 实扣额原子记入回收 hash（getReversedQuota 可取）。
  // 返回实际回收额度（可能 < 请求额；0=执行时已无可退；-1=refId 已 applied，从回收 hash 取实扣额续退）。
  async reverse(keyId, amount, refId, meta = {}) {
    if (!(amount > 0)) {
      return 0
    }
    const tx = JSON.stringify({
      type: 'reverse',
      amount,
      refId,
      at: new Date().toISOString(),
      ...meta
    })
    const actual = await redis.client.eval(
      REVERSE_LUA,
      7,
      CREDIT(keyId),
      REFUNDED(keyId),
      BASELINE(keyId),
      RedisKeys.usage.costTotal(keyId),
      APPLIED(keyId),
      TX(keyId),
      REVERSED(keyId),
      String(amount),
      refId,
      tx,
      String(TX_MAX)
    )
    return parseFloat(actual)
  }

  // 某 refId 的实扣回收额（reverse Lua 原子记录；0=未扣或已回滚）
  async getReversedQuota(keyId, refId) {
    return parseFloat((await redis.client.hget(REVERSED(keyId), refId)) || 0)
  }

  // 回滚 reverse（渠道退款失败补偿）：按账本回收 hash 实扣额撤销 refunded、清幂等标记与记录。
  // 返回实际撤销额（0=未 applied 无需回滚；-1=applied 在而账本记录缺失，拒绝盲回滚需人工）。
  // amount 仅入流水供对账，不参与撤销金额计算（金额只信账本）。
  async unreverse(keyId, amount, refId, meta = {}) {
    const tx = JSON.stringify({
      type: 'unreverse',
      amount,
      refId,
      at: new Date().toISOString(),
      ...meta
    })
    const rolled = await redis.client.eval(
      UNREVERSE_LUA,
      4,
      REFUNDED(keyId),
      APPLIED(keyId),
      TX(keyId),
      REVERSED(keyId),
      refId,
      tx,
      String(TX_MAX)
    )
    return parseFloat(rolled)
  }

  async getTransactions(keyId, limit = 50) {
    const items = await redis.client.lrange(TX(keyId), -limit, -1)
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

module.exports = new BalanceLedger()
