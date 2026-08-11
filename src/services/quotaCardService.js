/**
 * 额度卡/时间卡服务
 * 管理员生成卡，用户核销，管理员可撤销
 */
const redis = require('../models/redis')
const logger = require('../utils/logger')
const { v4: uuidv4 } = require('uuid')
const crypto = require('crypto')

const { RedisKeys } = require('../constants/redisKeys')

class QuotaCardService {
  constructor() {
    this.CARD_CODE_PREFIX = 'CC' // 卡号前缀
    this.LIMITS_CONFIG_KEY = 'system:quota_card_limits'
    this.MAX_BATCH_COUNT = 1000 // 单次批量创建上限（DoS 防护，路由层与本层共用同一来源）
  }

  /**
   * 获取额度卡上限配置
   */
  async getLimitsConfig() {
    try {
      const configStr = await redis.client.get(this.LIMITS_CONFIG_KEY)
      if (configStr) {
        return JSON.parse(configStr)
      }
      // 没有 Redis 配置时，使用 config.js 默认值
      const config = require('../../config/config')
      return (
        config.quotaCardLimits || {
          enabled: true,
          maxExpiryDays: 90,
          maxTotalCostLimit: 1000
        }
      )
    } catch (error) {
      logger.error('❌ Failed to get limits config:', error)
      return { enabled: true, maxExpiryDays: 90, maxTotalCostLimit: 1000 }
    }
  }

  /**
   * 保存额度卡上限配置
   */
  async saveLimitsConfig(config) {
    try {
      const parsedDays = parseInt(config.maxExpiryDays)
      const parsedCost = parseFloat(config.maxTotalCostLimit)
      const newConfig = {
        enabled: config.enabled !== false,
        maxExpiryDays: Number.isNaN(parsedDays) ? 90 : parsedDays,
        maxTotalCostLimit: Number.isNaN(parsedCost) ? 1000 : parsedCost,
        updatedAt: new Date().toISOString()
      }
      await redis.client.set(this.LIMITS_CONFIG_KEY, JSON.stringify(newConfig))
      logger.info('✅ Quota card limits config saved')
      return newConfig
    } catch (error) {
      logger.error('❌ Failed to save limits config:', error)
      throw error
    }
  }

  /**
   * 清洗卡号前缀（大写字母数字，最长 16 位，空串表示无前缀）
   */
  _sanitizePrefix(prefix) {
    // 非字符串一律按无前缀处理，避免 null/对象被 String() 转成脏前缀
    if (typeof prefix !== 'string') {
      return ''
    }
    return prefix
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 16)
  }

  /**
   * 生成卡号（格式：PREFIX_XXXX_XXXX_XXXX，无前缀时为 XXXX_XXXX_XXXX）
   */
  _generateCardCode(prefix = this.CARD_CODE_PREFIX) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // 排除容易混淆的字符
    let code = ''
    for (let i = 0; i < 12; i++) {
      code += chars.charAt(crypto.randomInt(chars.length))
    }
    const body = `${code.slice(0, 4)}_${code.slice(4, 8)}_${code.slice(8, 12)}`
    const cleanPrefix = this._sanitizePrefix(prefix)
    return cleanPrefix ? `${cleanPrefix}_${body}` : body
  }

  /**
   * 创建额度卡/时间卡
   * @param {Object} options - 卡配置
   * @param {string} options.type - 卡类型：'quota' | 'time' | 'combo'
   * @param {number} options.quotaAmount - CC 额度数量（quota/combo 类型必填）
   * @param {number} options.timeAmount - 时间数量（time/combo 类型必填）
   * @param {string} options.timeUnit - 时间单位：'hours' | 'days' | 'months'
   * @param {string} options.expiresAt - 卡本身的有效期（可选）
   * @param {string} options.note - 备注
   * @param {string} options.createdBy - 创建者 ID
   * @returns {Object} 创建的卡信息
   */
  async createCard(options = {}) {
    try {
      const {
        type = 'quota',
        quotaAmount = 0,
        timeAmount = 0,
        timeUnit = 'days',
        expiresAt = null,
        note = '',
        createdBy = 'admin',
        codePrefix
      } = options

      // 验证
      if (!['quota', 'time', 'combo'].includes(type)) {
        throw new Error('Invalid card type')
      }

      if ((type === 'quota' || type === 'combo') && (!quotaAmount || quotaAmount <= 0)) {
        throw new Error('quotaAmount is required for quota/combo cards')
      }

      if ((type === 'time' || type === 'combo') && (!timeAmount || timeAmount <= 0)) {
        throw new Error('timeAmount is required for time/combo cards')
      }

      const cardId = uuidv4()
      const cardCode = this._generateCardCode(codePrefix)

      const cardData = {
        id: cardId,
        code: cardCode,
        type,
        quotaAmount: String(quotaAmount || 0),
        timeAmount: String(timeAmount || 0),
        timeUnit: timeUnit || 'days',
        status: 'unused', // unused | redeemed | revoked | expired
        createdBy,
        createdAt: new Date().toISOString(),
        expiresAt: expiresAt || '',
        note: note || '',
        // 核销信息
        redeemedBy: '',
        redeemedByUsername: '',
        redeemedApiKeyId: '',
        redeemedApiKeyName: '',
        redeemedAt: '',
        // 撤销信息
        revokedAt: '',
        revokedBy: '',
        revokeReason: ''
      }

      // 保存卡数据
      await redis.client.hset(RedisKeys.quotaCard.byId(cardId), cardData)

      // 建立卡号到 ID 的映射（用于快速查找）
      await redis.client.set(RedisKeys.quotaCard.byCode(cardCode), cardId)

      // 添加到卡列表索引
      await redis.client.sadd(RedisKeys.quotaCard.all, cardId)
      await redis.client.sadd(RedisKeys.quotaCard.status(cardData.status), cardId)

      logger.success(`🎫 Created ${type} card: ${cardCode} (${cardId})`)

      return {
        id: cardId,
        code: cardCode,
        type,
        quotaAmount: parseFloat(quotaAmount || 0),
        timeAmount: parseInt(timeAmount || 0),
        timeUnit,
        status: 'unused',
        createdBy,
        createdAt: cardData.createdAt,
        expiresAt: cardData.expiresAt,
        note
      }
    } catch (error) {
      logger.error('❌ Failed to create card:', error)
      throw error
    }
  }

  /**
   * 批量创建卡
   * @param {Object} options - 卡配置
   * @param {number} count - 创建数量
   * @returns {Array} 创建的卡列表
   */
  async createCardsBatch(options = {}, count = 1) {
    // 兜底：即使绕过路由直接调用，也拒绝非法数量，避免死循环与海量写入 DoS
    const total = Number(count)
    if (!Number.isInteger(total) || total < 1 || total > this.MAX_BATCH_COUNT) {
      throw new Error(`count must be an integer between 1 and ${this.MAX_BATCH_COUNT}`)
    }
    const cards = []
    for (let i = 0; i < total; i++) {
      const card = await this.createCard(options)
      cards.push(card)
    }
    logger.success(`🎫 Batch created ${total} cards`)
    return cards
  }

  /**
   * 通过卡号获取卡信息
   */
  async getCardByCode(code) {
    try {
      const cardId = await redis.client.get(RedisKeys.quotaCard.byCode(code))
      if (!cardId) {
        return null
      }
      return await this.getCardById(cardId)
    } catch (error) {
      logger.error('❌ Failed to get card by code:', error)
      return null
    }
  }

  /**
   * 通过 ID 获取卡信息
   */
  async getCardById(cardId) {
    try {
      const cardData = await redis.client.hgetall(RedisKeys.quotaCard.byId(cardId))
      if (!cardData || Object.keys(cardData).length === 0) {
        return null
      }

      return {
        id: cardData.id,
        code: cardData.code,
        type: cardData.type,
        quotaAmount: parseFloat(cardData.quotaAmount || 0),
        timeAmount: parseInt(cardData.timeAmount || 0),
        timeUnit: cardData.timeUnit,
        status: cardData.status,
        createdBy: cardData.createdBy,
        createdAt: cardData.createdAt,
        expiresAt: cardData.expiresAt,
        note: cardData.note,
        redeemedBy: cardData.redeemedBy,
        redeemedByUsername: cardData.redeemedByUsername,
        redeemedApiKeyId: cardData.redeemedApiKeyId,
        redeemedApiKeyName: cardData.redeemedApiKeyName,
        redeemedAt: cardData.redeemedAt,
        revokedAt: cardData.revokedAt,
        revokedBy: cardData.revokedBy,
        revokeReason: cardData.revokeReason
      }
    } catch (error) {
      logger.error('❌ Failed to get card:', error)
      return null
    }
  }

  /**
   * 获取所有卡列表
   * @param {Object} options - 查询选项
   * @param {string} options.status - 按状态筛选
   * @param {number} options.limit - 限制数量
   * @param {number} options.offset - 偏移量
   */
  async getAllCards(options = {}) {
    try {
      const { status, type, search, limit = 100, offset = 0 } = options

      let cardIds
      if (status) {
        cardIds = await redis.client.smembers(RedisKeys.quotaCard.status(status))
      } else {
        cardIds = await redis.client.smembers(RedisKeys.quotaCard.all)
      }

      let cards = []
      for (const cardId of cardIds) {
        const card = await this.getCardById(cardId)
        if (card) {
          cards.push(card)
        }
      }

      // 类型筛选
      if (type) {
        cards = cards.filter((card) => card.type === type)
      }

      // 关键字搜索（卡号 / 备注 / 核销用户）
      const keyword = (search || '').trim().toLowerCase()
      if (keyword) {
        cards = cards.filter((card) =>
          [card.code, card.note, card.redeemedByUsername].some((field) =>
            (field || '').toLowerCase().includes(keyword)
          )
        )
      }

      // 排序（按创建时间倒序）
      cards.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

      // 分页
      const total = cards.length
      const paginatedCards = cards.slice(offset, offset + limit)

      return {
        cards: paginatedCards,
        total,
        limit,
        offset
      }
    } catch (error) {
      logger.error('❌ Failed to get all cards:', error)
      return { cards: [], total: 0, limit: 100, offset: 0 }
    }
  }

  /**
   * 核销卡
   * @param {string} code - 卡号
   * @param {string} apiKeyId - 目标 API Key ID
   * @param {string} userId - 核销用户 ID
   * @param {string} username - 核销用户名
   * @returns {Object} 核销结果
   */
  async redeemCard(code, apiKeyId, userId, username = '') {
    try {
      // 获取卡信息
      const card = await this.getCardByCode(code)
      if (!card) {
        throw new Error('卡号不存在')
      }

      // 检查卡状态
      if (card.status !== 'unused') {
        const statusMap = {
          redeemed: '已核销',
          expired: '已过期',
          revoked: '已撤销',
          disabled: '已禁用'
        }
        throw new Error(`卡片${statusMap[card.status] || card.status}，无法兑换`)
      }

      // 检查卡是否过期
      if (card.expiresAt && new Date(card.expiresAt) < new Date()) {
        // 更新卡状态为过期
        await this._updateCardStatus(card.id, 'expired')
        throw new Error('卡片已过期')
      }

      // 获取 API Key 信息
      const apiKeyService = require('./apiKeyService')
      const keyData = await redis.getApiKey(apiKeyId)
      if (!keyData || Object.keys(keyData).length === 0) {
        throw new Error('API Key 不存在')
      }

      // 获取上限配置
      const limits = await this.getLimitsConfig()

      // 执行核销
      const redemptionId = uuidv4()
      const now = new Date().toISOString()

      // 记录核销前状态
      const beforeLimit = parseFloat(keyData.totalCostLimit || 0)
      const beforeExpiry = keyData.expiresAt || ''

      // 应用卡效果
      let afterLimit = beforeLimit
      let afterExpiry = beforeExpiry
      let quotaAdded = 0
      let timeAdded = 0
      let actualTimeUnit = card.timeUnit // 实际使用的时间单位（截断时会改为 days）
      const warnings = [] // 截断警告信息

      if (card.type === 'quota' || card.type === 'combo') {
        let amountToAdd = card.quotaAmount

        // 上限保护：检查是否超过最大额度限制
        if (limits.enabled && limits.maxTotalCostLimit > 0) {
          const maxAllowed = limits.maxTotalCostLimit - beforeLimit
          if (amountToAdd > maxAllowed) {
            amountToAdd = Math.max(0, maxAllowed)
            warnings.push(
              `额度已达上限，本次仅增加 ${amountToAdd} CC（原卡面 ${card.quotaAmount} CC）`
            )
            logger.warn(`额度卡兑换超出上限，已截断：原 ${card.quotaAmount} -> 实际 ${amountToAdd}`)
          }
        }

        if (amountToAdd > 0) {
          const result = await apiKeyService.addTotalCostLimit(apiKeyId, amountToAdd)
          afterLimit = result.newTotalCostLimit
          quotaAdded = amountToAdd
        }
      }

      if (card.type === 'time' || card.type === 'combo') {
        // 计算新的过期时间
        let baseDate = beforeExpiry ? new Date(beforeExpiry) : new Date()
        if (baseDate < new Date()) {
          baseDate = new Date()
        }

        let newExpiry = new Date(baseDate)
        switch (card.timeUnit) {
          case 'hours':
            newExpiry.setTime(newExpiry.getTime() + card.timeAmount * 60 * 60 * 1000)
            break
          case 'days':
            newExpiry.setDate(newExpiry.getDate() + card.timeAmount)
            break
          case 'months':
            newExpiry.setMonth(newExpiry.getMonth() + card.timeAmount)
            break
        }

        // 上限保护：检查是否超过最大有效期
        if (limits.enabled && limits.maxExpiryDays > 0) {
          const maxExpiry = new Date()
          maxExpiry.setDate(maxExpiry.getDate() + limits.maxExpiryDays)
          if (newExpiry > maxExpiry) {
            newExpiry = maxExpiry
            warnings.push(`有效期已达上限（${limits.maxExpiryDays}天），时间已截断`)
            logger.warn(`时间卡兑换超出上限，已截断至 ${maxExpiry.toISOString()}`)
          }
        }

        const result = await apiKeyService.extendExpiry(apiKeyId, card.timeAmount, card.timeUnit)
        // 如果有上限保护，使用截断后的时间
        if (limits.enabled && limits.maxExpiryDays > 0) {
          const maxExpiry = new Date()
          maxExpiry.setDate(maxExpiry.getDate() + limits.maxExpiryDays)
          if (new Date(result.newExpiresAt) > maxExpiry) {
            await redis.client.hset(
              RedisKeys.apiKey.byId(apiKeyId),
              'expiresAt',
              maxExpiry.toISOString()
            )
            afterExpiry = maxExpiry.toISOString()
            // 计算实际增加的天数，截断时统一用天
            const actualDays = Math.max(
              0,
              Math.ceil((maxExpiry - baseDate) / (1000 * 60 * 60 * 24))
            )
            timeAdded = actualDays
            actualTimeUnit = 'days'
          } else {
            afterExpiry = result.newExpiresAt
            timeAdded = card.timeAmount
          }
        } else {
          afterExpiry = result.newExpiresAt
          timeAdded = card.timeAmount
        }
      }

      // 更新卡状态
      await redis.client.hset(RedisKeys.quotaCard.byId(card.id), {
        status: 'redeemed',
        redeemedBy: userId,
        redeemedByUsername: username,
        redeemedApiKeyId: apiKeyId,
        redeemedApiKeyName: keyData.name || '',
        redeemedAt: now
      })

      // 更新状态索引
      await redis.client.srem(RedisKeys.quotaCard.status('unused'), card.id)
      await redis.client.sadd(RedisKeys.quotaCard.status('redeemed'), card.id)

      // 创建核销记录
      const redemptionData = {
        id: redemptionId,
        cardId: card.id,
        cardCode: card.code,
        cardType: card.type,
        userId,
        username,
        apiKeyId,
        apiKeyName: keyData.name || '',
        quotaAdded: String(quotaAdded),
        timeAdded: String(timeAdded),
        timeUnit: actualTimeUnit,
        beforeLimit: String(beforeLimit),
        afterLimit: String(afterLimit),
        beforeExpiry,
        afterExpiry,
        timestamp: now,
        status: 'active' // active | revoked
      }

      await redis.client.hset(RedisKeys.redemption.byId(redemptionId), redemptionData)

      // 添加到核销记录索引
      await redis.client.sadd(RedisKeys.redemption.all, redemptionId)
      await redis.client.sadd(RedisKeys.redemption.byUser(userId), redemptionId)
      await redis.client.sadd(RedisKeys.redemption.byApikey(apiKeyId), redemptionId)

      logger.success(`✅ Card ${card.code} redeemed by ${username || userId} to key ${apiKeyId}`)

      return {
        success: true,
        warnings,
        redemptionId,
        cardCode: card.code,
        cardType: card.type,
        quotaAdded,
        timeAdded,
        timeUnit: actualTimeUnit,
        beforeLimit,
        afterLimit,
        beforeExpiry,
        afterExpiry
      }
    } catch (error) {
      logger.error('❌ Failed to redeem card:', error)
      throw error
    }
  }

  /**
   * 撤销核销
   * @param {string} redemptionId - 核销记录 ID
   * @param {string} revokedBy - 撤销者 ID
   * @param {string} reason - 撤销原因
   * @returns {Object} 撤销结果
   */
  async revokeRedemption(redemptionId, revokedBy, reason = '') {
    try {
      // 获取核销记录
      const redemptionData = await redis.client.hgetall(RedisKeys.redemption.byId(redemptionId))
      if (!redemptionData || Object.keys(redemptionData).length === 0) {
        throw new Error('Redemption record not found')
      }

      if (redemptionData.status !== 'active') {
        throw new Error('Redemption is already revoked')
      }

      const apiKeyService = require('./apiKeyService')
      const now = new Date().toISOString()

      // 撤销效果
      let actualDeducted = 0
      if (parseFloat(redemptionData.quotaAdded) > 0) {
        const result = await apiKeyService.deductTotalCostLimit(
          redemptionData.apiKeyId,
          parseFloat(redemptionData.quotaAdded)
        )
        ;({ actualDeducted } = result)
      }

      // 注意：时间卡撤销比较复杂，这里简化处理，不回退时间
      // 如果需要回退时间，可以在这里添加逻辑

      // 更新核销记录状态
      await redis.client.hset(RedisKeys.redemption.byId(redemptionId), {
        status: 'revoked',
        revokedAt: now,
        revokedBy,
        revokeReason: reason,
        actualDeducted: String(actualDeducted)
      })

      // 更新卡状态
      const { cardId } = redemptionData
      await redis.client.hset(RedisKeys.quotaCard.byId(cardId), {
        status: 'revoked',
        revokedAt: now,
        revokedBy,
        revokeReason: reason
      })

      // 更新状态索引
      await redis.client.srem(RedisKeys.quotaCard.status('redeemed'), cardId)
      await redis.client.sadd(RedisKeys.quotaCard.status('revoked'), cardId)

      logger.success(`🔄 Revoked redemption ${redemptionId} by ${revokedBy}`)

      return {
        success: true,
        redemptionId,
        cardCode: redemptionData.cardCode,
        actualDeducted,
        reason
      }
    } catch (error) {
      logger.error('❌ Failed to revoke redemption:', error)
      throw error
    }
  }

  /**
   * 获取核销记录
   * @param {Object} options - 查询选项
   * @param {string} options.userId - 按用户筛选
   * @param {string} options.apiKeyId - 按 API Key 筛选
   * @param {number} options.limit - 限制数量
   * @param {number} options.offset - 偏移量
   */
  async getRedemptions(options = {}) {
    try {
      const { userId, apiKeyId, search, limit = 100, offset = 0 } = options

      let redemptionIds
      if (userId) {
        redemptionIds = await redis.client.smembers(RedisKeys.redemption.byUser(userId))
      } else if (apiKeyId) {
        redemptionIds = await redis.client.smembers(RedisKeys.redemption.byApikey(apiKeyId))
      } else {
        redemptionIds = await redis.client.smembers(RedisKeys.redemption.all)
      }

      let redemptions = []
      for (const id of redemptionIds) {
        const data = await redis.client.hgetall(RedisKeys.redemption.byId(id))
        if (data && Object.keys(data).length > 0) {
          redemptions.push({
            id: data.id,
            cardId: data.cardId,
            cardCode: data.cardCode,
            cardType: data.cardType,
            userId: data.userId,
            username: data.username,
            apiKeyId: data.apiKeyId,
            apiKeyName: data.apiKeyName,
            quotaAdded: parseFloat(data.quotaAdded || 0),
            timeAdded: parseInt(data.timeAdded || 0),
            timeUnit: data.timeUnit,
            beforeLimit: parseFloat(data.beforeLimit || 0),
            afterLimit: parseFloat(data.afterLimit || 0),
            beforeExpiry: data.beforeExpiry,
            afterExpiry: data.afterExpiry,
            timestamp: data.timestamp,
            status: data.status,
            revokedAt: data.revokedAt,
            revokedBy: data.revokedBy,
            revokeReason: data.revokeReason,
            actualDeducted: parseFloat(data.actualDeducted || 0)
          })
        }
      }

      // 关键字搜索（卡号 / 用户 / API Key）
      const keyword = (search || '').trim().toLowerCase()
      if (keyword) {
        redemptions = redemptions.filter((item) =>
          [item.cardCode, item.username, item.userId, item.apiKeyName, item.apiKeyId].some(
            (field) => (field || '').toLowerCase().includes(keyword)
          )
        )
      }

      // 排序（按时间倒序）
      redemptions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))

      // 分页
      const total = redemptions.length
      const paginatedRedemptions = redemptions.slice(offset, offset + limit)

      return {
        redemptions: paginatedRedemptions,
        total,
        limit,
        offset
      }
    } catch (error) {
      logger.error('❌ Failed to get redemptions:', error)
      return { redemptions: [], total: 0, limit: 100, offset: 0 }
    }
  }

  /**
   * 删除未使用的卡
   */
  async deleteCard(cardId) {
    try {
      const card = await this.getCardById(cardId)
      if (!card) {
        const err = new Error('Card not found')
        err.statusCode = 404
        throw err
      }

      // 未使用 / 已禁用 的卡都可删除（已禁用本质是暂停的未使用卡，无核销记录、不涉及金额）
      if (card.status !== 'unused' && card.status !== 'disabled') {
        const err = new Error('Only unused or disabled cards can be deleted')
        err.statusCode = 409
        throw err
      }

      // 删除卡数据
      await redis.client.del(RedisKeys.quotaCard.byId(cardId))
      await redis.client.del(RedisKeys.quotaCard.byCode(card.code))

      // 从索引中移除（按卡当前状态精确移除，避免残留索引）
      await redis.client.srem(RedisKeys.quotaCard.all, cardId)
      await redis.client.srem(RedisKeys.quotaCard.status(card.status), cardId)

      logger.success(`🗑️ Deleted card ${card.code}`)

      return { success: true, cardCode: card.code }
    } catch (error) {
      // 业务拒绝（带 statusCode 的 404/409）不记错误日志，避免污染日志/被监控误判为故障
      if (!error.statusCode || error.statusCode >= 500) {
        logger.error('❌ Failed to delete card:', error)
      }
      throw error
    }
  }

  /**
   * 启用/禁用未使用的卡（unused ⇄ disabled）
   */
  async setCardEnabled(cardId, enabled) {
    try {
      const card = await this.getCardById(cardId)
      if (!card) {
        const err = new Error('Card not found')
        err.statusCode = 404
        throw err
      }

      // 只允许在 未使用 / 已禁用 之间切换，已核销/已撤销/已过期的卡状态由系统流转，不可手动改
      if (enabled) {
        if (card.status !== 'disabled') {
          const err = new Error('Only disabled cards can be enabled')
          err.statusCode = 409
          throw err
        }
        await this._updateCardStatus(cardId, 'unused')
        logger.success(`✅ Enabled card ${card.code}`)
        return { success: true, cardCode: card.code, status: 'unused' }
      }

      if (card.status !== 'unused') {
        const err = new Error('Only unused cards can be disabled')
        err.statusCode = 409
        throw err
      }
      await this._updateCardStatus(cardId, 'disabled')
      logger.success(`🚫 Disabled card ${card.code}`)
      return { success: true, cardCode: card.code, status: 'disabled' }
    } catch (error) {
      // 业务拒绝（带 statusCode 的 404/409）不记错误日志，避免污染日志/被监控误判为故障
      if (!error.statusCode || error.statusCode >= 500) {
        logger.error('❌ Failed to toggle card status:', error)
      }
      throw error
    }
  }

  /**
   * 更新卡状态（内部方法）
   */
  async _updateCardStatus(cardId, newStatus) {
    const card = await this.getCardById(cardId)
    if (!card) {
      return
    }

    const oldStatus = card.status
    await redis.client.hset(RedisKeys.quotaCard.byId(cardId), 'status', newStatus)

    // 更新状态索引
    await redis.client.srem(RedisKeys.quotaCard.status(oldStatus), cardId)
    await redis.client.sadd(RedisKeys.quotaCard.status(newStatus), cardId)
  }

  /**
   * 获取卡统计信息
   */
  async getCardStats() {
    try {
      const [unused, redeemed, revoked, expired, disabled] = await Promise.all([
        redis.client.scard(RedisKeys.quotaCard.status('unused')),
        redis.client.scard(RedisKeys.quotaCard.status('redeemed')),
        redis.client.scard(RedisKeys.quotaCard.status('revoked')),
        redis.client.scard(RedisKeys.quotaCard.status('expired')),
        redis.client.scard(RedisKeys.quotaCard.status('disabled'))
      ])

      return {
        total: unused + redeemed + revoked + expired + disabled,
        unused,
        redeemed,
        revoked,
        expired,
        disabled
      }
    } catch (error) {
      logger.error('❌ Failed to get card stats:', error)
      return { total: 0, unused: 0, redeemed: 0, revoked: 0, expired: 0, disabled: 0 }
    }
  }
}

module.exports = new QuotaCardService()
