const crypto = require('crypto')
const { v4: uuidv4 } = require('uuid')
const redis = require('../models/redis')

const CODE_MAP_KEY = 'fuelpack:code_map'
const CODE_KEY_PREFIX = 'fuelpack:code:'

const CODE_INDEX_ALL = 'fuelpack:codes:index:all'
const CODE_INDEX_UNUSED = 'fuelpack:codes:index:unused'
const CODE_INDEX_USED = 'fuelpack:codes:index:used'
const CODE_INDEX_DELETED = 'fuelpack:codes:index:deleted'

const WALLET_ZSET_PREFIX = 'fuelpack:wallet:index:'
const WALLET_ENTRY_PREFIX = 'fuelpack:wallet:entry:'

const FUEL_USED_DAILY_PREFIX = 'fuelpack:used:daily:'
const FUEL_USED_TOTAL_PREFIX = 'fuelpack:used:total:'

const CODE_TTL_SECONDS = 86400 * 365 * 2
const WALLET_ENTRY_TTL_SECONDS = 86400 * 365 * 2
const FUEL_USED_DAILY_TTL_SECONDS = 86400 * 32

const DEFAULT_VALIDITY_SECONDS = 86400

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

const normalizeFuelCode = (value) => {
  if (!value) {
    return ''
  }
  return String(value).trim().replace(/\s+/g, '').toUpperCase()
}

const generateCodeSegment = (length) => {
  const bytes = crypto.randomBytes(length)
  let result = ''
  for (let i = 0; i < length; i++) {
    result += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length]
  }
  return result
}

const generateFuelCode = (prefix = 'FP', segments = 3, segmentLength = 4) => {
  const safePrefix = String(prefix || '')
    .trim()
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase()
    .slice(0, 12)
  const parts = []
  for (let i = 0; i < segments; i++) {
    parts.push(generateCodeSegment(segmentLength))
  }
  return `${safePrefix || 'FP'}-${parts.join('-')}`
}

const toPositiveNumber = (value) => {
  const num = Number(value)
  if (!Number.isFinite(num) || num <= 0) {
    return 0
  }
  return num
}

const toPositiveInt = (value) => {
  const num = Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(num) || num <= 0) {
    return 0
  }
  return num
}

const ensureLuaCommands = (client) => {
  if (!client || client.consumeFuelPack) {
    return
  }

  client.defineCommand('consumeFuelPack', {
    numberOfKeys: 4,
    lua: `
      local walletKey = KEYS[1]
      local apiKeyHashKey = KEYS[2]
      local usedDailyKey = KEYS[3]
      local usedTotalKey = KEYS[4]

      local cost = tonumber(ARGV[1]) or 0
      local nowMs = tonumber(ARGV[2]) or 0
      local dailyTtlSec = tonumber(ARGV[3]) or 0
      local walletEntryPrefix = ARGV[4]

      local used = 0
      local expiredRemoved = 0

      local function cleanupExpired()
        while true do
          local expired = redis.call('ZRANGEBYSCORE', walletKey, '-inf', nowMs, 'LIMIT', 0, 200)
          if (not expired) or (#expired == 0) then
            break
          end

          for _, entryId in ipairs(expired) do
            local entryKey = walletEntryPrefix .. entryId
            local remaining = tonumber(redis.call('HGET', entryKey, 'amountRemaining')) or 0
            if remaining > 0 then
              expiredRemoved = expiredRemoved + remaining
            end
            redis.call('DEL', entryKey)
            redis.call('ZREM', walletKey, entryId)
          end
        end
      end

      cleanupExpired()

      if cost > 0 then
        while cost > 0 do
          local first = redis.call('ZRANGE', walletKey, 0, 0, 'WITHSCORES')
          if (not first) or (#first < 2) then
            break
          end

          local entryId = first[1]
          local expiresAtMs = tonumber(first[2]) or 0

          if expiresAtMs <= nowMs then
            local entryKey = walletEntryPrefix .. entryId
            local remaining = tonumber(redis.call('HGET', entryKey, 'amountRemaining')) or 0
            if remaining > 0 then
              expiredRemoved = expiredRemoved + remaining
            end
            redis.call('DEL', entryKey)
            redis.call('ZREM', walletKey, entryId)
          else
            local entryKey = walletEntryPrefix .. entryId
            local remaining = tonumber(redis.call('HGET', entryKey, 'amountRemaining')) or 0
            if remaining <= 0 then
              redis.call('DEL', entryKey)
              redis.call('ZREM', walletKey, entryId)
            else
              local consume = remaining
              if cost < consume then
                consume = cost
              end
              local newRemaining = remaining - consume
              used = used + consume
              cost = cost - consume
              if newRemaining <= 0 then
                redis.call('DEL', entryKey)
                redis.call('ZREM', walletKey, entryId)
              else
                redis.call('HSET', entryKey, 'amountRemaining', tostring(newRemaining))
              end
            end
          end
        end
      end

      local oldBalance = tonumber(redis.call('HGET', apiKeyHashKey, 'fuelBalance')) or 0
      local newBalance = oldBalance - expiredRemoved - used
      if newBalance < 0 then
        newBalance = 0
      end

      local entriesCount = tonumber(redis.call('ZCARD', walletKey)) or 0
      local next = redis.call('ZRANGE', walletKey, 0, 0, 'WITHSCORES')
      local nextExpiresAtMs = 0
      if next and #next >= 2 then
        nextExpiresAtMs = tonumber(next[2]) or 0
      end

      redis.call(
        'HSET',
        apiKeyHashKey,
        'fuelBalance',
        tostring(newBalance),
        'fuelEntries',
        tostring(entriesCount),
        'fuelNextExpiresAtMs',
        tostring(nextExpiresAtMs),
        'fuelUpdatedAtMs',
        tostring(nowMs)
      )

      if used > 0 then
        redis.call('INCRBYFLOAT', usedDailyKey, used)
        if dailyTtlSec > 0 then
          redis.call('EXPIRE', usedDailyKey, dailyTtlSec)
        end
        redis.call('INCRBYFLOAT', usedTotalKey, used)
      end

      return { tostring(used), tostring(newBalance), tostring(nextExpiresAtMs), tostring(entriesCount) }
    `
  })

  client.defineCommand('redeemFuelPackCode', {
    numberOfKeys: 5,
    lua: `
      local codeKey = KEYS[1]
      local walletKey = KEYS[2]
      local apiKeyHashKey = KEYS[3]
      local indexUnusedKey = KEYS[4]
      local indexUsedKey = KEYS[5]

      local nowMs = tonumber(ARGV[1]) or 0
      local codeId = ARGV[2]
      local apiKeyId = ARGV[3]
      local apiKeyName = ARGV[4]
      local entryId = ARGV[5]
      local walletEntryPrefix = ARGV[6]

      if redis.call('EXISTS', codeKey) == 0 then
        return { 'NOT_FOUND', '兑换码不存在' }
      end

      local isDeleted = redis.call('HGET', codeKey, 'isDeleted')
      if isDeleted == 'true' then
        return { 'DELETED', '兑换码已删除' }
      end

      local isActive = redis.call('HGET', codeKey, 'isActive')
      if isActive ~= 'true' then
        return { 'DISABLED', '兑换码已停用' }
      end

      local usedAtMs = tonumber(redis.call('HGET', codeKey, 'usedAtMs')) or 0
      if usedAtMs > 0 then
        return { 'USED', '兑换码已被使用' }
      end

      local amount = tonumber(redis.call('HGET', codeKey, 'amount')) or 0
      if amount <= 0 then
        return { 'INVALID', '兑换码配置异常（额度无效）' }
      end

      local validitySeconds = tonumber(redis.call('HGET', codeKey, 'validitySeconds')) or 0
      if validitySeconds <= 0 then
        validitySeconds = ${DEFAULT_VALIDITY_SECONDS}
      end

      local expiresAtMs = nowMs + (validitySeconds * 1000)
      local entryKey = walletEntryPrefix .. entryId

      redis.call(
        'HSET',
        entryKey,
        'id',
        entryId,
        'apiKeyId',
        apiKeyId,
        'codeId',
        codeId,
        'amountTotal',
        tostring(amount),
        'amountRemaining',
        tostring(amount),
        'redeemedAtMs',
        tostring(nowMs),
        'expiresAtMs',
        tostring(expiresAtMs)
      )

      redis.call('EXPIRE', entryKey, ${WALLET_ENTRY_TTL_SECONDS})
      redis.call('ZADD', walletKey, expiresAtMs, entryId)

      local oldBalance = tonumber(redis.call('HGET', apiKeyHashKey, 'fuelBalance')) or 0
      local newBalance = oldBalance + amount

      local entriesCount = tonumber(redis.call('ZCARD', walletKey)) or 0
      local next = redis.call('ZRANGE', walletKey, 0, 0, 'WITHSCORES')
      local nextExpiresAtMs = 0
      if next and #next >= 2 then
        nextExpiresAtMs = tonumber(next[2]) or 0
      end

      redis.call(
        'HSET',
        apiKeyHashKey,
        'fuelBalance',
        tostring(newBalance),
        'fuelEntries',
        tostring(entriesCount),
        'fuelNextExpiresAtMs',
        tostring(nextExpiresAtMs),
        'fuelUpdatedAtMs',
        tostring(nowMs)
      )

      redis.call(
        'HSET',
        codeKey,
        'usedAtMs',
        tostring(nowMs),
        'usedByApiKeyId',
        apiKeyId,
        'usedByApiKeyName',
        apiKeyName,
        'fuelEntryId',
        entryId,
        'updatedAtMs',
        tostring(nowMs)
      )

      local createdAtMs = tonumber(redis.call('HGET', codeKey, 'createdAtMs')) or nowMs
      redis.call('ZREM', indexUnusedKey, codeId)
      redis.call('ZADD', indexUsedKey, createdAtMs, codeId)

      return { 'OK', tostring(amount), tostring(expiresAtMs), tostring(newBalance), tostring(nextExpiresAtMs), tostring(entriesCount) }
    `
  })
}

class FuelPackService {
  getWalletKey(apiKeyId) {
    return `${WALLET_ZSET_PREFIX}${apiKeyId}`
  }

  getFuelUsedDailyKey(apiKeyId, dateStr) {
    return `${FUEL_USED_DAILY_PREFIX}${apiKeyId}:${dateStr}`
  }

  getFuelUsedTotalKey(apiKeyId) {
    return `${FUEL_USED_TOTAL_PREFIX}${apiKeyId}`
  }

  async createCodes(options = {}) {
    const amount = toPositiveNumber(options.amount)
    const validitySeconds = toPositiveInt(options.validitySeconds) || DEFAULT_VALIDITY_SECONDS
    const count = Math.min(Math.max(toPositiveInt(options.count) || 1, 1), 5000)
    const prefix = options.prefix || 'FP'
    const note = String(options.note || '').slice(0, 2000)
    const createdBy = String(options.createdBy || 'admin').slice(0, 128)

    if (!amount) {
      throw new Error('加油包额度必须大于 0')
    }

    const client = redis.getClientSafe()
    ensureLuaCommands(client)

    const now = Date.now()
    const nowIso = new Date(now).toISOString()

    const created = []
    let pipeline = client.pipeline()

    for (let i = 0; i < count; i++) {
      const id = uuidv4()
      let code = ''
      for (let attempt = 0; attempt < 20; attempt++) {
        const candidate = generateFuelCode(prefix, 3, 4)
        const exists = await client.hexists(CODE_MAP_KEY, candidate)
        if (!exists) {
          code = candidate
          break
        }
      }
      if (!code) {
        throw new Error('生成兑换码失败，请重试')
      }

      const codeKey = `${CODE_KEY_PREFIX}${id}`
      const codeRecord = {
        id,
        code,
        amount: String(amount),
        currency: 'USD',
        validitySeconds: String(validitySeconds),
        note,
        isActive: 'true',
        isDeleted: 'false',
        createdAt: nowIso,
        createdAtMs: String(now),
        createdBy,
        updatedAtMs: String(now),
        usedAtMs: '',
        usedByApiKeyId: '',
        usedByApiKeyName: '',
        fuelEntryId: '',
        deletedAtMs: '',
        deletedBy: ''
      }

      pipeline.hset(codeKey, codeRecord)
      pipeline.expire(codeKey, CODE_TTL_SECONDS)
      pipeline.hset(CODE_MAP_KEY, code, id)
      pipeline.zadd(CODE_INDEX_ALL, now, id)
      pipeline.zadd(CODE_INDEX_UNUSED, now, id)

      created.push({ id, code, amount, validitySeconds })

      if ((i + 1) % 500 === 0) {
        await pipeline.exec()
        pipeline = client.pipeline()
      }
    }

    await pipeline.exec()

    return {
      success: true,
      data: created
    }
  }

  async listCodes(query = {}) {
    const status = String(query.status || 'unused')
    const page = Math.max(toPositiveInt(query.page) || 1, 1)
    const pageSize = Math.min(Math.max(toPositiveInt(query.pageSize) || 50, 1), 200)
    const isActiveFilter =
      query.isActive === undefined || query.isActive === null || query.isActive === ''
        ? null
        : query.isActive === 'true' || query.isActive === true
    const q = normalizeFuelCode(query.q)

    const client = redis.getClientSafe()

    if (q) {
      const codeId = await client.hget(CODE_MAP_KEY, q)
      if (codeId) {
        const codeData = await client.hgetall(`${CODE_KEY_PREFIX}${codeId}`)
        if (!codeData || Object.keys(codeData).length === 0) {
          return { success: true, data: { total: 0, items: [] } }
        }
        const item = this._formatCode(codeData)
        if (status !== 'all' && item.status !== status) {
          return { success: true, data: { total: 0, items: [] } }
        }
        if (isActiveFilter !== null && item.isActive !== isActiveFilter) {
          return { success: true, data: { total: 0, items: [] } }
        }
        return { success: true, data: { total: 1, items: [item] } }
      }
    }

    const indexKey =
      status === 'all'
        ? CODE_INDEX_ALL
        : status === 'used'
          ? CODE_INDEX_USED
          : status === 'deleted'
            ? CODE_INDEX_DELETED
            : CODE_INDEX_UNUSED

    const total = await client.zcard(indexKey)
    const start = (page - 1) * pageSize
    const stop = start + pageSize - 1
    const ids = await client.zrevrange(indexKey, start, stop)

    if (!ids || ids.length === 0) {
      return { success: true, data: { total, items: [] } }
    }

    const pipeline = client.pipeline()
    for (const id of ids) {
      pipeline.hgetall(`${CODE_KEY_PREFIX}${id}`)
    }
    const results = await pipeline.exec()

    const items = []
    for (const row of results) {
      const data = row?.[1]
      if (!data || Object.keys(data).length === 0) {
        continue
      }
      const item = this._formatCode(data)
      if (status !== 'all' && item.status !== status) {
        continue
      }
      if (isActiveFilter !== null && item.isActive !== isActiveFilter) {
        continue
      }
      items.push(item)
    }

    return { success: true, data: { total, items } }
  }

  async updateCode(codeId, updates = {}, adminUsername = 'admin') {
    const id = String(codeId || '').trim()
    if (!id) {
      throw new Error('兑换码ID不能为空')
    }

    const client = redis.getClientSafe()
    const key = `${CODE_KEY_PREFIX}${id}`
    const existing = await client.hgetall(key)
    if (!existing || Object.keys(existing).length === 0) {
      throw new Error('兑换码不存在')
    }

    if (existing.isDeleted === 'true') {
      throw new Error('兑换码已删除')
    }

    if (existing.usedAtMs && String(existing.usedAtMs) !== '' && Number(existing.usedAtMs) > 0) {
      throw new Error('兑换码已使用，无法修改')
    }

    const next = {}
    if (updates.amount !== undefined) {
      const amount = toPositiveNumber(updates.amount)
      if (!amount) {
        throw new Error('额度必须大于 0')
      }
      next.amount = String(amount)
    }
    if (updates.validitySeconds !== undefined) {
      const validitySeconds = toPositiveInt(updates.validitySeconds)
      if (!validitySeconds) {
        throw new Error('有效期必须大于 0')
      }
      next.validitySeconds = String(validitySeconds)
    }
    if (updates.note !== undefined) {
      next.note = String(updates.note || '').slice(0, 2000)
    }
    if (updates.isActive !== undefined) {
      next.isActive = updates.isActive === true || updates.isActive === 'true' ? 'true' : 'false'
    }

    const now = Date.now()
    next.updatedAtMs = String(now)
    next.updatedBy = String(adminUsername || 'admin').slice(0, 128)

    await client.hset(key, next)
    await client.expire(key, CODE_TTL_SECONDS)

    return { success: true }
  }

  async deleteCode(codeId, adminUsername = 'admin') {
    const id = String(codeId || '').trim()
    if (!id) {
      throw new Error('兑换码ID不能为空')
    }

    const client = redis.getClientSafe()
    const key = `${CODE_KEY_PREFIX}${id}`
    const existing = await client.hgetall(key)
    if (!existing || Object.keys(existing).length === 0) {
      throw new Error('兑换码不存在')
    }
    if (existing.isDeleted === 'true') {
      return { success: true }
    }

    const now = Date.now()
    const updates = {
      isDeleted: 'true',
      isActive: 'false',
      deletedAtMs: String(now),
      deletedBy: String(adminUsername || 'admin').slice(0, 128),
      updatedAtMs: String(now)
    }

    const pipeline = client.pipeline()
    pipeline.hset(key, updates)
    pipeline.zrem(CODE_INDEX_UNUSED, id)
    pipeline.zrem(CODE_INDEX_USED, id)
    pipeline.zadd(CODE_INDEX_DELETED, now, id)
    await pipeline.exec()

    return { success: true }
  }

  async batchUpdateCodes(ids = [], action, adminUsername = 'admin') {
    const normalizedIds = Array.isArray(ids) ? ids.map((v) => String(v).trim()).filter(Boolean) : []
    if (normalizedIds.length === 0) {
      throw new Error('请选择要操作的兑换码')
    }

    const safeAction = String(action || '').trim()
    if (!['enable', 'disable', 'delete'].includes(safeAction)) {
      throw new Error('无效的批量操作')
    }

    const client = redis.getClientSafe()
    const now = Date.now()
    const updatedBy = String(adminUsername || 'admin').slice(0, 128)

    const pipeline = client.pipeline()
    for (const id of normalizedIds) {
      const key = `${CODE_KEY_PREFIX}${id}`
      if (safeAction === 'enable') {
        pipeline.hset(key, { isActive: 'true', updatedAtMs: String(now), updatedBy })
      } else if (safeAction === 'disable') {
        pipeline.hset(key, { isActive: 'false', updatedAtMs: String(now), updatedBy })
      } else if (safeAction === 'delete') {
        pipeline.hset(key, {
          isDeleted: 'true',
          isActive: 'false',
          deletedAtMs: String(now),
          deletedBy: updatedBy,
          updatedAtMs: String(now),
          updatedBy
        })
        pipeline.zrem(CODE_INDEX_UNUSED, id)
        pipeline.zrem(CODE_INDEX_USED, id)
        pipeline.zadd(CODE_INDEX_DELETED, now, id)
      }
      pipeline.expire(key, CODE_TTL_SECONDS)
    }

    await pipeline.exec()
    return { success: true }
  }

  async exportCodes(ids = []) {
    const normalizedIds = Array.isArray(ids) ? ids.map((v) => String(v).trim()).filter(Boolean) : []
    if (normalizedIds.length === 0) {
      return { success: true, data: { text: '' } }
    }

    const client = redis.getClientSafe()
    const pipeline = client.pipeline()
    for (const id of normalizedIds) {
      pipeline.hget(`${CODE_KEY_PREFIX}${id}`, 'code')
    }
    const results = await pipeline.exec()

    const lines = []
    for (const row of results) {
      const code = row?.[1]
      if (code) {
        lines.push(String(code))
      }
    }

    return { success: true, data: { text: lines.join('\n') } }
  }

  async refreshWallet(apiKeyId) {
    const client = redis.getClientSafe()
    ensureLuaCommands(client)

    const nowMs = Date.now()
    const today = redis.getDateStringInTimezone(new Date(nowMs))
    const usedDailyKey = this.getFuelUsedDailyKey(apiKeyId, today)
    const usedTotalKey = this.getFuelUsedTotalKey(apiKeyId)

    const walletKey = this.getWalletKey(apiKeyId)
    const apiKeyHashKey = `apikey:${apiKeyId}`

    const [used, balance, nextExpiresAtMs, entries] = await client.consumeFuelPack(
      walletKey,
      apiKeyHashKey,
      usedDailyKey,
      usedTotalKey,
      0,
      nowMs,
      FUEL_USED_DAILY_TTL_SECONDS,
      WALLET_ENTRY_PREFIX
    )

    return {
      fuelUsed: Number(used) || 0,
      fuelBalance: Number(balance) || 0,
      fuelNextExpiresAtMs: Number(nextExpiresAtMs) || 0,
      fuelEntries: Number(entries) || 0
    }
  }

  async consumeFuel(apiKeyId, cost) {
    const consumeCost = toPositiveNumber(cost)
    if (!consumeCost) {
      return await this.refreshWallet(apiKeyId)
    }

    const client = redis.getClientSafe()
    ensureLuaCommands(client)

    const nowMs = Date.now()
    const today = redis.getDateStringInTimezone(new Date(nowMs))
    const usedDailyKey = this.getFuelUsedDailyKey(apiKeyId, today)
    const usedTotalKey = this.getFuelUsedTotalKey(apiKeyId)

    const walletKey = this.getWalletKey(apiKeyId)
    const apiKeyHashKey = `apikey:${apiKeyId}`

    const [used, balance, nextExpiresAtMs, entries] = await client.consumeFuelPack(
      walletKey,
      apiKeyHashKey,
      usedDailyKey,
      usedTotalKey,
      consumeCost,
      nowMs,
      FUEL_USED_DAILY_TTL_SECONDS,
      WALLET_ENTRY_PREFIX
    )

    return {
      fuelUsed: Number(used) || 0,
      fuelBalance: Number(balance) || 0,
      fuelNextExpiresAtMs: Number(nextExpiresAtMs) || 0,
      fuelEntries: Number(entries) || 0
    }
  }

  async redeemCodeToApiKey(code, apiKeyId, apiKeyName = '') {
    const normalized = normalizeFuelCode(code)
    if (!normalized) {
      throw new Error('请输入加油包兑换码')
    }

    const client = redis.getClientSafe()
    ensureLuaCommands(client)

    const codeId = await client.hget(CODE_MAP_KEY, normalized)
    if (!codeId) {
      throw new Error('兑换码不存在')
    }

    await this.refreshWallet(apiKeyId)

    const nowMs = Date.now()
    const entryId = uuidv4()
    const walletKey = this.getWalletKey(apiKeyId)
    const apiKeyHashKey = `apikey:${apiKeyId}`
    const codeKey = `${CODE_KEY_PREFIX}${codeId}`

    const [status, amount, expiresAtMs, balance, nextExpiresAtMs, entries] =
      await client.redeemFuelPackCode(
        codeKey,
        walletKey,
        apiKeyHashKey,
        CODE_INDEX_UNUSED,
        CODE_INDEX_USED,
        nowMs,
        codeId,
        apiKeyId,
        String(apiKeyName || '').slice(0, 128),
        entryId,
        WALLET_ENTRY_PREFIX
      )

    if (status !== 'OK') {
      throw new Error(String(amount || expiresAtMs || '兑换失败'))
    }

    return {
      codeId,
      code: normalized,
      amount: Number(amount) || 0,
      expiresAtMs: Number(expiresAtMs) || 0,
      fuelBalance: Number(balance) || 0,
      fuelNextExpiresAtMs: Number(nextExpiresAtMs) || 0,
      fuelEntries: Number(entries) || 0,
      fuelEntryId: entryId
    }
  }

  _formatCode(data) {
    const usedAtMs = Number(data.usedAtMs) || 0
    const deletedAtMs = Number(data.deletedAtMs) || 0
    const isDeleted = data.isDeleted === 'true'

    let status = 'unused'
    if (isDeleted || deletedAtMs > 0) {
      status = 'deleted'
    } else if (usedAtMs > 0) {
      status = 'used'
    }

    return {
      id: data.id,
      code: data.code,
      amount: Number(data.amount) || 0,
      currency: data.currency || 'USD',
      validitySeconds: Number(data.validitySeconds) || DEFAULT_VALIDITY_SECONDS,
      note: data.note || '',
      isActive: data.isActive === 'true',
      isDeleted,
      status,
      createdAt: data.createdAt || '',
      createdAtMs: Number(data.createdAtMs) || 0,
      createdBy: data.createdBy || '',
      usedAtMs,
      usedByApiKeyId: data.usedByApiKeyId || '',
      usedByApiKeyName: data.usedByApiKeyName || '',
      deletedAtMs,
      deletedBy: data.deletedBy || ''
    }
  }
}

module.exports = new FuelPackService()
