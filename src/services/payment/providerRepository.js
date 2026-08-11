// 支付渠道实例仓储：渠道配置（密钥）AES 加密存储 + 负载均衡选实例。
// 同一 providerKey 可有多个实例（多商户号），按策略选一个。

const { v4: uuidv4 } = require('uuid')

const { encrypt, decrypt } = require('../../utils/commonHelper')
const redis = require('../../models/redis')
const logger = require('../../utils/logger')
const { RedisKeys, TTL } = require('../../constants/redisKeys')
const registry = require('./providers/registry')

const PROVIDER_KEY = (id) => RedisKeys.payment.provider(id)
const PROVIDERS_ALL = RedisKeys.payment.providersAll
const RR_KEY = (paymentType) => RedisKeys.payment.providerRr(paymentType)
const DAILY_KEY = (id, date) => RedisKeys.payment.providerDaily(id, date)
const NUMERIC = ['sortOrder', 'singleMin', 'singleMax', 'dailyLimit']

const today = () => redis.getDateStringInTimezone(new Date())

// 兼容旧结构：历史上 payment:provider:daily:* 可能是 string(INCRBYFLOAT 计数器)。
// 新实现要求 hash {orderId: 'amount:reservedAtMs'}。若线上已有旧 string，直接 HVALS/HGETALL/HSET/HDEL 会 WRONGTYPE。
// 这里在首次读取到旧 string 时迁成 hash：写入一个 legacy 聚合字段承接旧累计值，后续与按订单预留并存。
const LEGACY_FIELD = '__legacy_total__'

// 候选实例「当日额度(=hash 内各预留金额之和)检查 + 按策略选一 + 以 orderId 记一笔预留」原子脚本：
// 规避并发下两个下单读到旧日额快照、同时选中并超配同一实例（dailyLimit/least_amount 不一致）。
// 预留按 orderId 记进 hash，value=`amount:reservedAtMs`：amount 供求和，reservedAtMs 供对账判断在途/孤儿宽限。
// 「下单失败/取消/过期」按 orderId 幂等 HDEL 释放；定时对账逐条核对订单真相、清崩溃遗留的孤儿预留。
// KEYS[1..n]=各候选当日额度 hash，KEYS[n+1]=round_robin 计数键；
// ARGV[1]=amount、ARGV[2]=strategy、ARGV[3]=n、ARGV[4]=orderId、ARGV[5]=reservedAtMs，其后每候选 3 项：id、dailyLimit、sortOrder。
// 返回选中实例 id，'' 表示无合格候选。
const SELECT_RESERVE_LUA = `
local amount = tonumber(ARGV[1])
local strategy = ARGV[2]
local n = tonumber(ARGV[3])
local orderId = ARGV[4]
local reservedVal = ARGV[1] .. ':' .. ARGV[5]
local eligible = {}
for i = 1, n do
  local base = 5 + (i - 1) * 3
  local dailyLimit = tonumber(ARGV[base + 2])
  local used = 0
  local vals = redis.call('HVALS', KEYS[i])
  for _, v in ipairs(vals) do
    used = used + (tonumber(string.match(v, '^[^:]+')) or 0)
  end
  if dailyLimit <= 0 or used + amount <= dailyLimit then
    eligible[#eligible + 1] = { idx = i, used = used, sort = tonumber(ARGV[base + 3]) }
  end
end
if #eligible == 0 then return '' end
local chosen = eligible[1]
if strategy == 'round_robin' then
  local rr = redis.call('INCR', KEYS[n + 1])
  chosen = eligible[(rr % #eligible) + 1]
else
  for j = 2, #eligible do
    local e = eligible[j]
    if e.used < chosen.used or (e.used == chosen.used and e.sort < chosen.sort) then
      chosen = e
    end
  end
end
redis.call('HSET', KEYS[chosen.idx], orderId, reservedVal)
redis.call('EXPIRE', KEYS[chosen.idx], 259200)
return ARGV[5 + (chosen.idx - 1) * 3 + 1]
`

class ProviderRepository {
  async _ensureDailyReservationHash(key) {
    const type = await redis.client.type(key)
    if (type === 'none' || type === 'hash') {
      return
    }
    if (type !== 'string') {
      throw new Error(`Unsupported provider daily reservation key type: ${type}`)
    }

    const legacyValue = await redis.client.get(key)
    const ttl = await redis.client.ttl(key)
    const pipeline = redis.client.pipeline()
    pipeline.del(key)
    pipeline.hset(key, LEGACY_FIELD, `${legacyValue || '0'}:0`)
    pipeline.expire(key, ttl > 0 ? ttl : TTL.providerDailyReservation)
    await pipeline.exec()
    logger.warn(`[payment] migrated legacy provider daily key to hash: ${key}`)
  }

  _decryptConfig(encrypted) {
    if (!encrypted) {
      return {}
    }
    try {
      const json = decrypt(encrypted)
      return json ? JSON.parse(json) : {}
    } catch (e) {
      logger.error('❌ [payment] decrypt provider config failed:', e)
      return {}
    }
  }

  _deserialize(data, { withConfig = false } = {}) {
    if (!data || Object.keys(data).length === 0) {
      return null
    }
    const inst = { ...data }
    for (const field of NUMERIC) {
      if (inst[field] !== undefined && inst[field] !== '') {
        inst[field] = parseFloat(inst[field])
      }
    }
    inst.enabled = data.enabled === 'true'
    inst.refundEnabled = data.refundEnabled === 'true'
    inst.supportedTypes = data.supportedTypes ? data.supportedTypes.split(',').filter(Boolean) : []
    if (withConfig) {
      inst.config = this._decryptConfig(data.config)
    } else {
      delete inst.config // 列表/前端不返回密钥
    }
    return inst
  }

  _toHash(data) {
    return {
      id: data.id,
      providerKey: data.providerKey,
      name: data.name || data.providerKey,
      config: encrypt(JSON.stringify(data.config || {})),
      supportedTypes: (data.supportedTypes || []).join(','),
      enabled: data.enabled !== false ? 'true' : 'false',
      refundEnabled: data.refundEnabled ? 'true' : 'false',
      sortOrder: String(data.sortOrder || 0),
      singleMin: String(data.singleMin || 0),
      singleMax: String(data.singleMax || 0),
      dailyLimit: String(data.dailyLimit || 0),
      createdAt: data.createdAt || new Date().toISOString()
    }
  }

  // refundEnabled 能力硬门（配置期拦截）：未实现 refund 的渠道禁止开「支持退款」，
  // 否则形成「后台可配置、运行时必失败」的假能力。见 payment/CLAUDE.md 接渠道5
  _assertRefundCapability(providerKey, refundEnabled) {
    if (!refundEnabled) {
      return
    }
    const provider = registry.findByKey(providerKey)
    if (!provider || !provider.supportsRefund) {
      throw new Error(`渠道 ${providerKey} 未实现退款，不能开启「支持退款」`)
    }
  }

  async create(data) {
    this._assertRefundCapability(data.providerKey, data.refundEnabled)
    const id = uuidv4()
    const hash = this._toHash({ ...data, id })
    await redis.client.hset(PROVIDER_KEY(id), hash)
    await redis.client.sadd(PROVIDERS_ALL, id)
    return this._deserialize(hash)
  }

  async update(id, patch) {
    const exist = await redis.client.hgetall(PROVIDER_KEY(id))
    if (!exist || Object.keys(exist).length === 0) {
      throw new Error('Provider instance not found')
    }
    // providerKey 只读：config 字段表与渠道类型绑定，换类型=留下垃圾配置；同时堵死
    // 「先开 refundEnabled、再单独改 providerKey 绕过能力硬门」的旁路（前端编辑态本就禁改）
    if (patch.providerKey && patch.providerKey !== exist.providerKey) {
      throw new Error('渠道实例类型（providerKey）不可修改，请新建实例')
    }
    if (patch.refundEnabled) {
      this._assertRefundCapability(exist.providerKey, true)
    }
    const hash = {}
    for (const [k, v] of Object.entries(patch)) {
      if (k === 'config') {
        hash.config = encrypt(JSON.stringify(v || {}))
      } else if (k === 'supportedTypes') {
        hash.supportedTypes = (v || []).join(',')
      } else if (k === 'enabled' || k === 'refundEnabled') {
        hash[k] = v ? 'true' : 'false'
      } else {
        hash[k] = v === null || v === undefined ? '' : String(v)
      }
    }
    await redis.client.hset(PROVIDER_KEY(id), hash)
    return this.getById(id)
  }

  async delete(id) {
    await redis.client.del(PROVIDER_KEY(id))
    await redis.client.srem(PROVIDERS_ALL, id)
    return { success: true }
  }

  async getById(id, opts) {
    return this._deserialize(await redis.client.hgetall(PROVIDER_KEY(id)), opts)
  }

  async list({ providerKey = '', enabledOnly = false } = {}) {
    const ids = await redis.client.smembers(PROVIDERS_ALL)
    let items = []
    for (const id of ids) {
      const inst = await this.getById(id)
      if (inst) {
        items.push(inst)
      }
    }
    if (providerKey) {
      items = items.filter((i) => i.providerKey === providerKey)
    }
    if (enabledOnly) {
      items = items.filter((i) => i.enabled)
    }
    items.sort((a, b) => a.sortOrder - b.sortOrder)
    return items
  }

  // 释放某订单在实例当日额度 hash 里的预留（订单未支付即终止：取消/过期/下单失败时调；HDEL 幂等）。
  // date 用订单创建日（providerReservedDate），避免跨午夜误删别日 hash。
  async releaseDailyReservation(instanceId, orderId, date) {
    if (!instanceId || !orderId) {
      return
    }
    const key = DAILY_KEY(instanceId, date || today())
    await this._ensureDailyReservationHash(key)
    await redis.client.hdel(key, orderId)
  }

  // 复活已释放的预留（expired/cancelled → paid 时调）：按 orderId 幂等 HSET 回 hash。
  // 与 release 对称；value 格式 amount:reservedAtMs 与 selectInstance 一致，供 dailyLimit 求和与对账。
  async restoreDailyReservation(instanceId, orderId, date, amount, reservedAtMs = Date.now()) {
    if (!instanceId || !orderId) {
      return
    }
    const pay = Number(amount)
    if (!(pay > 0)) {
      return
    }
    const key = DAILY_KEY(instanceId, date || today())
    await this._ensureDailyReservationHash(key)
    await redis.client.hset(key, orderId, `${pay}:${reservedAtMs}`)
    await redis.client.expire(key, TTL.providerDailyReservation)
  }

  // 取实例某日全部预留（{orderId: 'amount:reservedAtMs'}），供定时对账逐条核对订单真相、清孤儿预留。
  async getDailyReservations(instanceId, date) {
    const key = DAILY_KEY(instanceId, date || today())
    await this._ensureDailyReservationHash(key)
    return redis.client.hgetall(key)
  }

  // 负载均衡选实例（解密 config）。返回 { instance, config } 或 null（无可用渠道）。
  // date 由调用方传入（与订单 providerReservedDate / 释放日期同源），不在此另取 today()，避免预留与释放跨午夜错位。
  // orderId 用于在实例当日额度 hash 里按订单记一笔预留（供幂等释放 + 对账清孤儿）。
  // reservedAtMs 随预留写入 hash value（`amount:reservedAtMs`），供对账对「订单不存在」项做在途宽限、不误清。
  async selectInstance(
    paymentType,
    strategy = 'least_amount',
    amount = 0,
    date = today(),
    orderId = '',
    reservedAtMs = 0
  ) {
    const ids = await redis.client.smembers(PROVIDERS_ALL)
    const candidates = []
    for (const id of ids) {
      const inst = await this.getById(id, { withConfig: true })
      if (!inst || !inst.enabled) {
        continue
      }
      if (!inst.supportedTypes.includes(paymentType)) {
        continue
      }
      if (inst.singleMin > 0 && amount < inst.singleMin) {
        continue
      }
      if (inst.singleMax > 0 && amount > inst.singleMax) {
        continue
      }
      candidates.push(inst)
    }
    if (candidates.length === 0) {
      return null
    }
    // 原子：在合格候选中按策略选一并按 orderId 记一笔预留（规避并发超配 + 负载选择不一致）。date 由调用方绑定。
    const keys = candidates.map((c) => DAILY_KEY(c.id, date))
    for (const key of keys) {
      // 兼容旧 string 计数器，避免 HVALS/HSET WRONGTYPE
      // eslint-disable-next-line no-await-in-loop
      await this._ensureDailyReservationHash(key)
    }
    keys.push(RR_KEY(paymentType))
    const argv = [
      String(amount),
      strategy,
      String(candidates.length),
      orderId,
      String(reservedAtMs)
    ]
    for (const c of candidates) {
      argv.push(c.id, String(c.dailyLimit || 0), String(c.sortOrder || 0))
    }
    const chosenId = await redis.client.eval(SELECT_RESERVE_LUA, keys.length, ...keys, ...argv)
    if (!chosenId) {
      return null
    }
    const chosen = candidates.find((c) => c.id === chosenId)
    return { instance: chosen, config: chosen.config }
  }

  // 某 providerKey 下全部启用实例（含解密 config），webhook 需逐个试解密时用（如微信）
  async enabledConfigs(providerKey) {
    const ids = await redis.client.smembers(PROVIDERS_ALL)
    const out = []
    for (const id of ids) {
      const inst = await this.getById(id, { withConfig: true })
      if (inst && inst.enabled && inst.providerKey === providerKey) {
        out.push(inst)
      }
    }
    return out
  }
}

module.exports = new ProviderRepository()
