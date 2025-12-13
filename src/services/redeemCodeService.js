const crypto = require('crypto')
const redis = require('../models/redis')
const logger = require('../utils/logger')
const apiKeyService = require('./apiKeyService')

const DEFAULT_CODE_BYTES = 16
const DEFAULT_CODE_GROUP_SIZE = 4
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // 避免 0/O/1/I 混淆

function normalizeRedeemCode(value) {
  const compact = String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')

  if (!compact) {
    return ''
  }

  const groups = compact.match(new RegExp(`.{1,${DEFAULT_CODE_GROUP_SIZE}}`, 'g'))
  return (groups || []).join('-')
}

function generateRedeemCode(bytesLength = DEFAULT_CODE_BYTES) {
  const bytes = crypto.randomBytes(bytesLength)
  let compact = ''
  for (const byte of bytes) {
    compact += CODE_ALPHABET[byte % CODE_ALPHABET.length]
  }
  return normalizeRedeemCode(compact)
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback
  }
  return parsed
}

function computeExtendSeconds(extendValue, extendUnit) {
  const unit = extendUnit === 'hours' ? 'hours' : 'days'
  const value = parsePositiveInt(extendValue, 0)
  if (value <= 0) {
    return { value: 0, unit, seconds: 0 }
  }

  const seconds = unit === 'hours' ? value * 60 * 60 : value * 24 * 60 * 60
  return { value, unit, seconds }
}

function compactRedeemCode(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
}

function normalizeStatusFilter(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
  if (normalized === 'used') {
    return 'used'
  }
  if (normalized === 'unused' || normalized === 'not_used' || normalized === 'not-used') {
    return 'unused'
  }
  return 'all'
}

async function batchHgetall(client, keys, chunkSize = 500) {
  const results = []
  if (!Array.isArray(keys) || keys.length === 0) {
    return results
  }

  for (let offset = 0; offset < keys.length; offset += chunkSize) {
    const chunk = keys.slice(offset, offset + chunkSize)
    const pipeline = client.pipeline()
    chunk.forEach((key) => pipeline.hgetall(key))
    const execResults = await pipeline.exec()
    for (let i = 0; i < execResults.length; i++) {
      const [err, data] = execResults[i]
      if (err) {
        continue
      }
      results.push({ redisKey: chunk[i], data })
    }
  }

  return results
}

class RedeemCodeService {
  constructor() {
    this.keyPrefix = 'redeemcode:'
  }

  async createRedeemCodes(options = {}) {
    const extendValue = parsePositiveInt(options.extendValue ?? options.extendDays, 0)
    const extendUnit = options.extendUnit || 'days'
    const quantity = Math.min(Math.max(parsePositiveInt(options.quantity, 1), 1), 100)
    const createdBy = String(options.createdBy || 'admin')

    const extend = computeExtendSeconds(extendValue, extendUnit)
    if (extend.seconds <= 0) {
      throw new Error('续费时长必须为正整数')
    }

    const client = redis.getClientSafe()
    const nowIso = new Date().toISOString()
    const codes = []

    for (let i = 0; i < quantity; i++) {
      let code = ''
      for (let attempt = 0; attempt < 20; attempt++) {
        const candidate = generateRedeemCode()
        if (codes.includes(candidate)) {
          continue
        }
        const exists = await client.exists(`${this.keyPrefix}${candidate}`)
        if (!exists) {
          code = candidate
          break
        }
      }
      if (!code) {
        throw new Error('生成兑换码失败，请重试')
      }
      codes.push(code)
    }

    const pipeline = client.pipeline()
    for (const code of codes) {
      pipeline.hset(`${this.keyPrefix}${code}`, {
        code,
        extendValue: String(extend.value),
        extendUnit: extend.unit,
        extendSeconds: String(extend.seconds),
        isUsed: 'false',
        usedAt: '',
        usedByKeyId: '',
        createdAt: nowIso,
        createdBy
      })
    }
    await pipeline.exec()

    logger.success(
      `🎟️ Generated ${codes.length} redeem code(s) by ${createdBy}: extend ${extend.value} ${extend.unit}`
    )

    return {
      codes,
      extendValue: extend.value,
      extendUnit: extend.unit
    }
  }

  async redeemCode(options = {}) {
    const rawApiKey = String(options.apiKey || '').trim()
    const normalizedCode = normalizeRedeemCode(options.redeemCode || options.code)

    if (!rawApiKey) {
      throw new Error('API Key 不能为空')
    }
    if (!normalizedCode) {
      throw new Error('兑换码不能为空')
    }

    const keyRecord = await apiKeyService.getApiKeyByRawKey(rawApiKey)
    if (!keyRecord) {
      throw new Error('API Key 无效或不存在')
    }

    if (keyRecord.isActive !== 'true') {
      const keyName = keyRecord.name || 'Unknown'
      throw new Error(`API Key "${keyName}" 已被禁用`)
    }

    const client = redis.getClientSafe()
    const redeemKey = `${this.keyPrefix}${normalizedCode}`
    const apiKeyHash = `apikey:${keyRecord.id}`

    const maxRetries = 8
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      await client.watch(redeemKey, apiKeyHash)

      const [redeemData, currentKeyData] = await Promise.all([
        client.hgetall(redeemKey),
        client.hgetall(apiKeyHash)
      ])

      if (!redeemData || Object.keys(redeemData).length === 0) {
        await client.unwatch()
        throw new Error('兑换码无效或不存在')
      }

      if (redeemData.isUsed === 'true') {
        await client.unwatch()
        throw new Error('兑换码已被使用')
      }

      if (!currentKeyData || Object.keys(currentKeyData).length === 0) {
        await client.unwatch()
        throw new Error('API Key 不存在或已被删除')
      }

      const extendSeconds = parsePositiveInt(redeemData.extendSeconds, 0)
      if (extendSeconds <= 0) {
        await client.unwatch()
        throw new Error('兑换码配置异常，请联系管理员')
      }

      const now = Date.now()
      const nowIso = new Date(now).toISOString()
      const currentExpiresAt = currentKeyData.expiresAt ? Date.parse(currentKeyData.expiresAt) : NaN
      const baseMs =
        Number.isFinite(currentExpiresAt) && currentExpiresAt > now ? currentExpiresAt : now
      const nextExpiresAt = new Date(baseMs + extendSeconds * 1000).toISOString()

      const updates = {
        expiresAt: nextExpiresAt,
        updatedAt: nowIso
      }

      if (currentKeyData.expirationMode === 'activation' && currentKeyData.isActivated !== 'true') {
        updates.isActivated = 'true'
        updates.activatedAt = nowIso
      }

      const tx = client.multi()
      tx.hset(apiKeyHash, updates)
      tx.hset(redeemKey, {
        isUsed: 'true',
        usedAt: nowIso,
        usedByKeyId: keyRecord.id
      })

      const result = await tx.exec()
      if (result) {
        await client.unwatch()

        logger.success(
          `🎫 Redeem code used: ${normalizedCode} -> ${keyRecord.id} (${keyRecord.name || 'Unnamed'})`
        )

        return {
          apiKeyId: keyRecord.id,
          apiKeyName: keyRecord.name || '',
          previousExpiresAt: currentKeyData.expiresAt || '',
          expiresAt: nextExpiresAt,
          isActivated:
            updates.isActivated === 'true' ? true : currentKeyData.isActivated === 'true',
          activatedAt: updates.activatedAt || currentKeyData.activatedAt || '',
          redeemCode: normalizedCode,
          extendValue: parsePositiveInt(redeemData.extendValue, 0),
          extendUnit: redeemData.extendUnit || 'days'
        }
      }

      // 事务冲突，重试
    }

    throw new Error('兑换码正在被使用，请稍后重试')
  }

  async listRedeemCodes(options = {}) {
    const status = normalizeStatusFilter(options.status)
    const compactQuery = compactRedeemCode(options.q || options.search)
    const limit = Math.min(Math.max(parsePositiveInt(options.limit, 5000), 1), 20000)

    const client = redis.getClientSafe()

    const redisKeys = await redis.scanKeys(`${this.keyPrefix}*-*`)
    if (!Array.isArray(redisKeys) || redisKeys.length === 0) {
      return { items: [], summary: { total: 0, used: 0, unused: 0 } }
    }

    const raw = await batchHgetall(client, redisKeys)
    const items = raw
      .map(({ redisKey, data }) => {
        const code = data?.code || redisKey.replace(this.keyPrefix, '')
        const compact = compactRedeemCode(code)
        const isUsed = data?.isUsed === 'true'
        return {
          code,
          compact,
          extendValue: parseInt(data?.extendValue || '0', 10) || 0,
          extendUnit: data?.extendUnit || 'days',
          extendSeconds: parseInt(data?.extendSeconds || '0', 10) || 0,
          isUsed,
          createdAt: data?.createdAt || '',
          createdBy: data?.createdBy || '',
          usedAt: data?.usedAt || '',
          usedByKeyId: data?.usedByKeyId || ''
        }
      })
      .filter((item) => item.code)

    const summary = {
      total: items.length,
      used: items.filter((item) => item.isUsed).length,
      unused: items.filter((item) => !item.isUsed).length
    }

    const filtered = items.filter((item) => {
      if (status === 'used' && !item.isUsed) {
        return false
      }
      if (status === 'unused' && item.isUsed) {
        return false
      }
      if (compactQuery && !item.compact.includes(compactQuery)) {
        return false
      }
      return true
    })

    filtered.sort((a, b) => {
      const aTime = a.createdAt ? Date.parse(a.createdAt) : 0
      const bTime = b.createdAt ? Date.parse(b.createdAt) : 0
      if (bTime !== aTime) {
        return bTime - aTime
      }
      return String(b.code || '').localeCompare(String(a.code || ''))
    })

    const usedKeyIds = filtered
      .map((item) => item.usedByKeyId)
      .filter((id) => id && typeof id === 'string')
    const uniqueKeyIds = [...new Set(usedKeyIds)]
    const usedKeyNameMap = new Map()

    if (uniqueKeyIds.length > 0) {
      const metas = await redis.batchGetApiKeys(uniqueKeyIds, { fields: ['name'] })
      metas.forEach((meta) => {
        if (meta?.id) {
          usedKeyNameMap.set(meta.id, meta.name || '')
        }
      })
    }

    const enriched = filtered.slice(0, limit).map((item) => ({
      code: item.code,
      extendValue: item.extendValue,
      extendUnit: item.extendUnit,
      isUsed: item.isUsed,
      createdAt: item.createdAt,
      createdBy: item.createdBy,
      usedAt: item.usedAt,
      usedByKeyId: item.usedByKeyId,
      usedByKeyName: item.usedByKeyId ? usedKeyNameMap.get(item.usedByKeyId) || '' : ''
    }))

    return { items: enriched, summary }
  }

  async deleteRedeemCodes(options = {}) {
    const codes = Array.isArray(options.codes) ? options.codes : []
    const normalizedCodes = [
      ...new Set(
        codes
          .map((code) => normalizeRedeemCode(code))
          .filter((code) => typeof code === 'string' && code)
      )
    ]

    if (normalizedCodes.length === 0) {
      return { deleted: [], skippedUsed: [], notFound: [] }
    }

    const client = redis.getClientSafe()
    const checkPipeline = client.pipeline()
    normalizedCodes.forEach((code) => checkPipeline.hget(`${this.keyPrefix}${code}`, 'isUsed'))
    const checkResults = await checkPipeline.exec()

    const deleteKeys = []
    const deleted = []
    const skippedUsed = []
    const notFound = []

    for (let i = 0; i < normalizedCodes.length; i++) {
      const code = normalizedCodes[i]
      const [err, isUsedValue] = checkResults[i] || []
      if (err) {
        continue
      }

      if (isUsedValue === null || isUsedValue === undefined) {
        notFound.push(code)
        continue
      }

      if (String(isUsedValue) === 'true') {
        skippedUsed.push(code)
        continue
      }

      deleteKeys.push(`${this.keyPrefix}${code}`)
      deleted.push(code)
    }

    if (deleteKeys.length > 0) {
      await client.del(...deleteKeys)
      logger.success(`🗑️ Deleted redeem code(s): ${deleteKeys.length}`)
    }

    return { deleted, skippedUsed, notFound }
  }
}

module.exports = new RedeemCodeService()
