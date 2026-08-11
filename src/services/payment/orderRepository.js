// 订单仓储：订单读写 + 索引 + 状态机原子转移（Lua CAS）。
// 列表：按 created 索引分页；status 过滤走 orderIdxStatus（save/casStatus 同步维护，启动可 rebuild）。

const redis = require('../../models/redis')
const { RedisKeys } = require('../../constants/redisKeys')

const ORDER_KEY = (id) => RedisKeys.payment.order(id)
const IDX_CREATED = RedisKeys.payment.orderIdxCreated // 全部订单（按创建时间）
const IDX_PENDING = RedisKeys.payment.orderIdxPending // 仅 pending（score=expiresAt，供过期扫描）
const IDX_STATUS = (status) => RedisKeys.payment.orderIdxStatus(status)
const APIKEY_IDX = (apiKeyId) => RedisKeys.payment.orderApikey(apiKeyId)
const OUTTRADE_KEY = (outTradeNo) => RedisKeys.payment.orderOuttrade(outTradeNo)

// 状态索引全集合（list/rebuild 用）
const ALL_STATUSES = [
  'pending',
  'paid',
  'completed',
  'expired',
  'cancelled',
  'failed',
  'refunding',
  'refunded'
]

const NUMERIC_FIELDS = [
  'quotaAmount',
  'price',
  'payAmount',
  'feeRate',
  'paidAmount',
  'refundedAmount'
]

// 管道单批条数上限（防单次 pipeline 过大）
const PIPELINE_CHUNK = 200

// 原子状态转移 + 状态二级索引 + pending 索引（同脚本，杜绝「status 已改、索引滞后」并发双入索引）
// KEYS[1]=order hash KEYS[2]=statusIdx(expected) KEYS[3]=statusIdx(next) KEYS[4]=pendingIdx
// ARGV[1]=expected ARGV[2]=next ARGV[3]=updatedAt ARGV[4]=createdScore ARGV[5]=orderId ARGV[6...]=extra pairs
const CAS_LUA = `
if redis.call('EXISTS', KEYS[1]) == 0 then return -1 end
if redis.call('HGET', KEYS[1], 'status') ~= ARGV[1] then return 0 end
redis.call('HSET', KEYS[1], 'status', ARGV[2], 'updatedAt', ARGV[3])
for i = 6, #ARGV, 2 do
  redis.call('HSET', KEYS[1], ARGV[i], ARGV[i + 1])
end
redis.call('ZREM', KEYS[2], ARGV[5])
redis.call('ZADD', KEYS[3], tonumber(ARGV[4]), ARGV[5])
if ARGV[1] == 'pending' then
  redis.call('ZREM', KEYS[4], ARGV[5])
end
return 1
`

class OrderRepository {
  // withConfigSnapshot=false（默认）：剥离 providerConfigSnapshot（含渠道密钥），公开读接口绝不返回。
  // 仅退款/查单链路显式传 true 取原始快照调渠道。
  _deserialize(data, { withConfigSnapshot = false } = {}) {
    if (!data || Object.keys(data).length === 0) {
      return null
    }
    const order = { ...data }
    for (const field of NUMERIC_FIELDS) {
      if (order[field] !== undefined && order[field] !== '') {
        order[field] = parseFloat(order[field])
      }
    }
    // 下单时固化的退款能力快照（Redis hash 存为字符串）。缺省 undefined（旧订单无此字段）由 approveRefund 兜底。
    if (order.refundEnabledSnapshot !== undefined && order.refundEnabledSnapshot !== '') {
      order.refundEnabledSnapshot = order.refundEnabledSnapshot === 'true'
    }
    // 下单时固化的渠道配置快照（含密钥，JSON 字符串）。默认剥离避免经公开接口泄露；退款/查单链路显式取用。
    if (withConfigSnapshot) {
      if (order.providerConfigSnapshot !== undefined && order.providerConfigSnapshot !== '') {
        try {
          order.providerConfigSnapshot = JSON.parse(order.providerConfigSnapshot)
        } catch (e) {
          order.providerConfigSnapshot = null
        }
      } else {
        order.providerConfigSnapshot = null
      }
    } else {
      delete order.providerConfigSnapshot
    }
    return order
  }

  _toHash(obj) {
    const hash = {}
    for (const [k, v] of Object.entries(obj)) {
      if (v === null || v === undefined) {
        hash[k] = ''
      } else if (k === 'providerConfigSnapshot' && typeof v === 'object') {
        // 渠道配置快照是对象，Redis hash 仅存字符串，序列化存储（取用时 JSON.parse）
        hash[k] = JSON.stringify(v)
      } else {
        hash[k] = String(v)
      }
    }
    return hash
  }

  // 批量 hgetall 反序列化（pipeline，按 PIPELINE_CHUNK 分片）
  async _loadOrdersByIds(ids, { withConfigSnapshot = false } = {}) {
    const orders = []
    for (let i = 0; i < ids.length; i += PIPELINE_CHUNK) {
      const chunk = ids.slice(i, i + PIPELINE_CHUNK)
      const pipeline = redis.client.pipeline()
      for (const id of chunk) {
        pipeline.hgetall(ORDER_KEY(id))
      }
      const results = await pipeline.exec()
      for (const row of results || []) {
        // ioredis: [err, value]
        const data = row && row[1]
        const order = this._deserialize(data, { withConfigSnapshot })
        if (order) {
          orders.push(order)
        }
      }
    }
    return orders
  }

  async save(order) {
    const createdScore = new Date(order.createdAt).getTime()
    const pipeline = redis.client.pipeline()
    pipeline.hset(ORDER_KEY(order.id), this._toHash(order))
    pipeline.zadd(IDX_CREATED, createdScore, order.id)
    pipeline.zadd(APIKEY_IDX(order.apiKeyId), createdScore, order.id)
    if (order.status) {
      pipeline.zadd(IDX_STATUS(order.status), createdScore, order.id)
    }
    if (order.outTradeNo) {
      pipeline.set(OUTTRADE_KEY(order.outTradeNo), order.id)
    }
    if (order.status === 'pending' && order.expiresAt) {
      pipeline.zadd(IDX_PENDING, new Date(order.expiresAt).getTime(), order.id)
    }
    await pipeline.exec()
    return order
  }

  async getById(orderId, { withConfigSnapshot = false } = {}) {
    return this._deserialize(await redis.client.hgetall(ORDER_KEY(orderId)), { withConfigSnapshot })
  }

  async getByOutTradeNo(outTradeNo) {
    const orderId = await redis.client.get(OUTTRADE_KEY(outTradeNo))
    if (!orderId) {
      return null
    }
    return this.getById(orderId)
  }

  // 原子状态转移（含 status/pending 索引）。extraFields 在转移成功时一并落库。
  // 返回 1=成功 / 0=当前状态不匹配 / -1=订单不存在
  async casStatus(orderId, expected, next, extraFields = {}) {
    // createdAt 不变，转移前读 score 即可（与 status 无关）
    const createdAt = await redis.client.hget(ORDER_KEY(orderId), 'createdAt')
    const createdScore = createdAt ? new Date(createdAt).getTime() : Date.now()
    const flat = []
    for (const [k, v] of Object.entries(extraFields)) {
      flat.push(k, v === null || v === undefined ? '' : String(v))
    }
    return redis.client.eval(
      CAS_LUA,
      4,
      ORDER_KEY(orderId),
      IDX_STATUS(expected),
      IDX_STATUS(next),
      IDX_PENDING,
      expected,
      next,
      new Date().toISOString(),
      String(createdScore),
      orderId,
      ...flat
    )
  }

  async setFields(orderId, fields) {
    const hash = this._toHash(fields)
    hash.updatedAt = new Date().toISOString()
    await redis.client.hset(ORDER_KEY(orderId), hash)
  }

  // 管理端列表：索引分页；status 过滤按「真实 status 流」做 offset/limit，禁止在原始索引位置上 offset
  async listAll({ offset = 0, limit = 20, status = '' } = {}) {
    const safeOffset = Math.max(0, Number(offset) || 0)
    const safeLimit = Math.min(Math.max(1, Number(limit) || 20), 200)
    if (status) {
      // 空索引但有订单 → 重建
      let indexCard = await redis.client.zcard(IDX_STATUS(status))
      if (indexCard === 0) {
        const allCount = await redis.client.zcard(IDX_CREATED)
        if (allCount > 0) {
          await this.rebuildStatusIndexes()
          indexCard = await redis.client.zcard(IDX_STATUS(status))
        }
      }
      // 单次遍历索引：统计真实匹配数(total)、跳过 safeOffset 个真实匹配后取 safeLimit 条
      // 扫描中禁止 zrem（会左移后续下标导致跳项）；漂移收集后扫完再 heal
      const page = []
      let matchedTotal = 0
      let scanFrom = 0
      const drifts = []
      const BATCH = PIPELINE_CHUNK
      while (scanFrom < indexCard) {
        const ids = await redis.client.zrevrange(IDX_STATUS(status), scanFrom, scanFrom + BATCH - 1)
        if (!ids.length) {
          break
        }
        scanFrom += ids.length
        const loaded = await this._loadOrdersByIds(ids)
        const byId = new Map(loaded.map((order) => [order.id, order]))
        for (const id of ids) {
          const order = byId.get(id)
          if (order && order.status === status) {
            if (matchedTotal >= safeOffset && page.length < safeLimit) {
              page.push(order)
            }
            matchedTotal += 1
          } else {
            drifts.push({ id, order: order || null })
          }
        }
      }
      for (const drift of drifts) {
        await redis.client.zrem(IDX_STATUS(status), drift.id)
        if (drift.order && drift.order.status && ALL_STATUSES.includes(drift.order.status)) {
          const score = drift.order.createdAt
            ? new Date(drift.order.createdAt).getTime()
            : Date.now()
          await redis.client.zadd(IDX_STATUS(drift.order.status), score, drift.id)
        }
      }
      return { orders: page, total: matchedTotal, offset: safeOffset, limit: safeLimit }
    }
    const total = await redis.client.zcard(IDX_CREATED)
    const ids = await redis.client.zrevrange(IDX_CREATED, safeOffset, safeOffset + safeLimit - 1)
    const orders = await this._loadOrdersByIds(ids)
    return { orders, total, offset: safeOffset, limit: safeLimit }
  }

  // 看板/导出：按创建倒序分片遍历，只取指定 hash 字段（pipeline hmget），不一次装全量对象
  async *iterateOrderFields(fields, { batchSize = PIPELINE_CHUNK } = {}) {
    const total = await redis.client.zcard(IDX_CREATED)
    for (let start = 0; start < total; start += batchSize) {
      const ids = await redis.client.zrevrange(IDX_CREATED, start, start + batchSize - 1)
      if (!ids.length) {
        break
      }
      const pipeline = redis.client.pipeline()
      for (const id of ids) {
        pipeline.hmget(ORDER_KEY(id), ...fields)
      }
      const results = await pipeline.exec()
      for (let i = 0; i < ids.length; i++) {
        const row = results[i]
        const values = row && row[1]
        if (!values) {
          continue
        }
        const obj = { id: ids[i] }
        for (let f = 0; f < fields.length; f++) {
          obj[fields[f]] = values[f]
        }
        yield obj
      }
    }
  }

  // 自愈：按 created 索引重建全部 status 二级索引（升级后首次 list 或运维手动触发）
  async rebuildStatusIndexes() {
    // 先清空
    const delPipe = redis.client.pipeline()
    for (const status of ALL_STATUSES) {
      delPipe.del(IDX_STATUS(status))
    }
    await delPipe.exec()
    const total = await redis.client.zcard(IDX_CREATED)
    for (let start = 0; start < total; start += PIPELINE_CHUNK) {
      const ids = await redis.client.zrevrange(IDX_CREATED, start, start + PIPELINE_CHUNK - 1)
      if (!ids.length) {
        break
      }
      const pipeline = redis.client.pipeline()
      for (const id of ids) {
        pipeline.hmget(ORDER_KEY(id), 'status', 'createdAt')
      }
      const results = await pipeline.exec()
      const write = redis.client.pipeline()
      for (let i = 0; i < ids.length; i++) {
        const values = results[i] && results[i][1]
        if (!values) {
          continue
        }
        const [status, createdAt] = values
        if (!status || !ALL_STATUSES.includes(status)) {
          continue
        }
        const score = createdAt ? new Date(createdAt).getTime() : Date.now()
        write.zadd(IDX_STATUS(status), score, ids[i])
      }
      await write.exec()
    }
    return total
  }

  // 已超时的 pending 订单 id（score=expiresAt <= nowMs）
  async scanExpiredPending(nowMs, limit = 200) {
    return redis.client.zrangebyscore(IDX_PENDING, '-inf', nowMs, 'LIMIT', 0, limit)
  }

  // 扫某状态索引：轮询游标 + 升序(zrange=最老优先)，防「只扫最新 N 条饿死旧卡单」
  // 回绕时只取 [0, cursor) 且 cap 到 card，保证本批 ID 唯一（safeLimit>card 时直接返回全集一次）
  async scanStatusIndex(status, limit = 100) {
    if (!ALL_STATUSES.includes(status)) {
      return []
    }
    const idx = IDX_STATUS(status)
    const card = await redis.client.zcard(idx)
    if (card === 0) {
      return []
    }
    // 单批最多 card 个唯一成员，避免 wrap 越过 cursor 重复取
    const safeLimit = Math.max(1, Math.min(Number(limit) || 100, 500, card))
    const cursorKey = RedisKeys.payment.scanCursor(status)
    let cursor = parseInt((await redis.client.get(cursorKey)) || '0', 10)
    if (!Number.isFinite(cursor) || cursor < 0) {
      cursor = 0
    }
    cursor = cursor % card

    // 全集一 tick 扫完：直接全量返回（fulfill 幂等）；游标 +1 避免长期钉死同一起点
    if (safeLimit >= card) {
      const all = await redis.client.zrange(idx, 0, -1)
      await redis.client.set(cursorKey, String((cursor + 1) % card), 'EX', 86400)
      return all
    }

    // 从 cursor 取一段；不足则只回绕 [0, cursor)，绝不越过 cursor 造成重复
    let ids = await redis.client.zrange(idx, cursor, cursor + safeLimit - 1)
    if (ids.length < safeLimit && cursor > 0) {
      const need = safeLimit - ids.length
      // 最多取 cursor 个（下标 0..cursor-1）
      const wrapCount = Math.min(need, cursor)
      if (wrapCount > 0) {
        const wrap = await redis.client.zrange(idx, 0, wrapCount - 1)
        ids = ids.concat(wrap)
      }
    }
    const next = (cursor + Math.max(ids.length, 1)) % card
    await redis.client.set(cursorKey, String(next), 'EX', 86400)
    return ids
  }

  // 查单失败时推迟再扫：把 pending score 推到 futureMs，避免队头阻塞后续过期单
  async reschedulePending(orderId, futureMs) {
    await redis.client.zadd(IDX_PENDING, futureMs, orderId)
  }

  // 从 pending 过期索引摘掉（非 pending 残留 / 幽灵成员）
  async removeFromPendingIndex(orderId) {
    await redis.client.zrem(IDX_PENDING, orderId)
  }

  // 统计某 provider 实例仍被「在途」订单引用的数量。
  // [配置快照化后] 退款不再回查实例 config：下单时已把渠道 config/密钥快照进订单（providerConfigSnapshot），
  //   _executeChannelRefund 读订单快照调渠道。故「completed 订单退款依赖实例」的耦合已解除。
  // includeCompleted=true（删除守卫用）：含 completed —— 物理删除不可逆，且【存量无快照旧订单】退款仍回退读实例，
  //   删实例会让这类旧订单永久无法退款，保守保留。
  // includeCompleted=false（更新守卫用）：仅 pending/paid/refunding（短期在途，验签/查单仍依赖实例当前 config）。
  //   不含 completed —— 快照化后 completed 订单退款自包含，改密钥/配置/下线旧商户号不再被 completed 单冻结。
  // 终态：expired/cancelled/failed/refunded 一律不计。分片 pipeline 扫 created 索引。
  async countActiveByProviderInstance(instanceId, { includeCompleted = true } = {}) {
    if (!instanceId) {
      return 0
    }
    const activeStatuses = new Set(['pending', 'paid', 'refunding'])
    if (includeCompleted) {
      activeStatuses.add('completed')
    }
    let count = 0
    for await (const row of this.iterateOrderFields(['status', 'providerInstanceId'])) {
      if (row.providerInstanceId === instanceId && activeStatuses.has(row.status)) {
        count += 1
      }
    }
    return count
  }

  // 按 API Key 列订单（充值订单归集到 key，对应「持有 apiKey 即可查/操作」）
  async listByApiKey(apiKeyId, { offset = 0, limit = 20 } = {}) {
    const safeOffset = Math.max(0, Number(offset) || 0)
    const safeLimit = Math.min(Math.max(1, Number(limit) || 20), 100)
    const ids = await redis.client.zrevrange(
      APIKEY_IDX(apiKeyId),
      safeOffset,
      safeOffset + safeLimit - 1
    )
    const orders = await this._loadOrdersByIds(ids)
    const total = await redis.client.zcard(APIKEY_IDX(apiKeyId))
    return { orders, total, offset: safeOffset, limit: safeLimit }
  }

  // 待支付订单统计：count=全部 pending（供 maxPendingOrders，不限日期）；
  // pendingPayAmountSum=仅 sumDate 当天创建的 pending 金额合计（供 dailyLimit，避免昨天遗留的 pending 占用今天日限额）。
  // sumDate 省略则金额不按日期过滤（全部 pending 计入）。
  async pendingStats(apiKeyId, sumDate) {
    const ids = await redis.client.zrevrange(APIKEY_IDX(apiKeyId), 0, -1)
    let count = 0
    let pendingPayAmountSum = 0
    // 分片 pipeline 读 status/payAmount/createdAt
    for (let i = 0; i < ids.length; i += PIPELINE_CHUNK) {
      const chunk = ids.slice(i, i + PIPELINE_CHUNK)
      const pipeline = redis.client.pipeline()
      for (const id of chunk) {
        pipeline.hmget(ORDER_KEY(id), 'status', 'payAmount', 'createdAt')
      }
      const results = await pipeline.exec()
      for (const row of results || []) {
        const values = row && row[1]
        if (!values) {
          continue
        }
        const [status, payAmount, createdAt] = values
        if (status === 'pending') {
          count += 1
          if (
            !sumDate ||
            (createdAt && redis.getDateStringInTimezone(new Date(createdAt)) === sumDate)
          ) {
            pendingPayAmountSum += parseFloat(payAmount || 0)
          }
        }
      }
    }
    return { count, pendingPayAmountSum }
  }

  // 导出用：全量订单 id（倒序）
  async listAllIds() {
    return redis.client.zrevrange(IDX_CREATED, 0, -1)
  }
}

module.exports = new OrderRepository()
