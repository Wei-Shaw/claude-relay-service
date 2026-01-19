/**
 * 额度卡/时间卡服务
 * 管理员生成卡，用户核销，管理员可撤销
 */
const redis = require('../models/redis')
const logger = require('../utils/logger')
const { v4: uuidv4 } = require('uuid')
const crypto = require('crypto')

class QuotaCardService {
  constructor() {
    this.CARD_PREFIX = 'quota_card:'
    this.REDEMPTION_PREFIX = 'redemption:'
    this.CARD_CODE_PREFIX = 'CC' // 卡号前缀
  }

  /**
   * 生成卡号（16位，格式：CC_XXXX_XXXX_XXXX）
   */
  _generateCardCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // 排除容易混淆的字符
    let code = ''
    for (let i = 0; i < 12; i++) {
      code += chars.charAt(crypto.randomInt(chars.length))
    }
    return `${this.CARD_CODE_PREFIX}_${code.slice(0, 4)}_${code.slice(4, 8)}_${code.slice(8, 12)}`
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
        createdBy = 'admin'
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
      const cardCode = this._generateCardCode()

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
      await redis.client.hset(`${this.CARD_PREFIX}${cardId}`, cardData)

      // 建立卡号到 ID 的映射（用于快速查找）
      await redis.client.set(`quota_card_code:${cardCode}`, cardId)

      // 添加到卡列表索引
      await redis.client.sadd('quota_cards:all', cardId)
      await redis.client.sadd(`quota_cards:status:${cardData.status}`, cardId)

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
    const cards = []
    for (let i = 0; i < count; i++) {
      const card = await this.createCard(options)
      cards.push(card)
    }
    logger.success(`🎫 Batch created ${count} cards`)
    return cards
  }

  /**
   * 通过卡号获取卡信息
   */
  async getCardByCode(code) {
    try {
      const cardId = await redis.client.get(`quota_card_code:${code}`)
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
      const cardData = await redis.client.hgetall(`${this.CARD_PREFIX}${cardId}`)
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
      const { status, limit = 100, offset = 0 } = options

      let cardIds
      if (status) {
        cardIds = await redis.client.smembers(`quota_cards:status:${status}`)
      } else {
        cardIds = await redis.client.smembers('quota_cards:all')
      }

      // 排序（按创建时间倒序）
      const cards = []
      for (const cardId of cardIds) {
        const card = await this.getCardById(cardId)
        if (card) {
          cards.push(card)
        }
      }

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
        throw new Error('Card not found')
      }

      // 检查卡状态
      if (card.status !== 'unused') {
        throw new Error(`Card is ${card.status}, cannot redeem`)
      }

      // 检查卡是否过期
      if (card.expiresAt && new Date(card.expiresAt) < new Date()) {
        // 更新卡状态为过期
        await this._updateCardStatus(card.id, 'expired')
        throw new Error('Card has expired')
      }

      // 获取 API Key 信息
      const apiKeyService = require('./apiKeyService')
      const keyData = await redis.getApiKey(apiKeyId)
      if (!keyData || Object.keys(keyData).length === 0) {
        throw new Error('API key not found')
      }

      // 检查 API Key 是否为聚合类型（只有聚合 Key 才能核销额度卡）
      if (card.type !== 'time' && keyData.isAggregated !== 'true') {
        throw new Error('Only aggregated keys can redeem quota cards')
      }

      // 执行核销
      const redemptionId = uuidv4()
      const now = new Date().toISOString()

      // 记录核销前状态
      const beforeQuota = parseFloat(keyData.quotaLimit || 0)
      const beforeExpiry = keyData.expiresAt || ''

      // 应用卡效果
      let afterQuota = beforeQuota
      let afterExpiry = beforeExpiry

      if (card.type === 'quota' || card.type === 'combo') {
        const result = await apiKeyService.addQuota(apiKeyId, card.quotaAmount)
        afterQuota = result.newQuotaLimit
      }

      if (card.type === 'time' || card.type === 'combo') {
        const result = await apiKeyService.extendExpiry(apiKeyId, card.timeAmount, card.timeUnit)
        afterExpiry = result.newExpiresAt
      }

      // 更新卡状态
      await redis.client.hset(`${this.CARD_PREFIX}${card.id}`, {
        status: 'redeemed',
        redeemedBy: userId,
        redeemedByUsername: username,
        redeemedApiKeyId: apiKeyId,
        redeemedApiKeyName: keyData.name || '',
        redeemedAt: now
      })

      // 更新状态索引
      await redis.client.srem(`quota_cards:status:unused`, card.id)
      await redis.client.sadd(`quota_cards:status:redeemed`, card.id)

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
        quotaAdded: String(card.type === 'time' ? 0 : card.quotaAmount),
        timeAdded: String(card.type === 'quota' ? 0 : card.timeAmount),
        timeUnit: card.timeUnit,
        beforeQuota: String(beforeQuota),
        afterQuota: String(afterQuota),
        beforeExpiry,
        afterExpiry,
        timestamp: now,
        status: 'active' // active | revoked
      }

      await redis.client.hset(`${this.REDEMPTION_PREFIX}${redemptionId}`, redemptionData)

      // 添加到核销记录索引
      await redis.client.sadd('redemptions:all', redemptionId)
      await redis.client.sadd(`redemptions:user:${userId}`, redemptionId)
      await redis.client.sadd(`redemptions:apikey:${apiKeyId}`, redemptionId)

      logger.success(`✅ Card ${card.code} redeemed by ${username || userId} to key ${apiKeyId}`)

      return {
        success: true,
        redemptionId,
        cardCode: card.code,
        cardType: card.type,
        quotaAdded: card.type === 'time' ? 0 : card.quotaAmount,
        timeAdded: card.type === 'quota' ? 0 : card.timeAmount,
        timeUnit: card.timeUnit,
        beforeQuota,
        afterQuota,
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
      const redemptionData = await redis.client.hgetall(`${this.REDEMPTION_PREFIX}${redemptionId}`)
      if (!redemptionData || Object.keys(redemptionData).length === 0) {
        throw new Error('Redemption record not found')
      }

      if (redemptionData.status !== 'active') {
        throw new Error('Redemption is already revoked')
      }

      const apiKeyService = require('./apiKeyService')
      const now = new Date().toISOString()

      // 撤销效果
      let actualQuotaDeducted = 0
      if (parseFloat(redemptionData.quotaAdded) > 0) {
        const result = await apiKeyService.deductQuotaLimit(
          redemptionData.apiKeyId,
          parseFloat(redemptionData.quotaAdded)
        )
        actualQuotaDeducted = result.actualDeducted
      }

      // 注意：时间卡撤销比较复杂，这里简化处理，不回退时间
      // 如果需要回退时间，可以在这里添加逻辑

      // 更新核销记录状态
      await redis.client.hset(`${this.REDEMPTION_PREFIX}${redemptionId}`, {
        status: 'revoked',
        revokedAt: now,
        revokedBy,
        revokeReason: reason,
        actualQuotaDeducted: String(actualQuotaDeducted)
      })

      // 更新卡状态
      const { cardId } = redemptionData
      await redis.client.hset(`${this.CARD_PREFIX}${cardId}`, {
        status: 'revoked',
        revokedAt: now,
        revokedBy,
        revokeReason: reason
      })

      // 更新状态索引
      await redis.client.srem(`quota_cards:status:redeemed`, cardId)
      await redis.client.sadd(`quota_cards:status:revoked`, cardId)

      logger.success(`🔄 Revoked redemption ${redemptionId} by ${revokedBy}`)

      return {
        success: true,
        redemptionId,
        cardCode: redemptionData.cardCode,
        actualQuotaDeducted,
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
      const { userId, apiKeyId, limit = 100, offset = 0 } = options

      let redemptionIds
      if (userId) {
        redemptionIds = await redis.client.smembers(`redemptions:user:${userId}`)
      } else if (apiKeyId) {
        redemptionIds = await redis.client.smembers(`redemptions:apikey:${apiKeyId}`)
      } else {
        redemptionIds = await redis.client.smembers('redemptions:all')
      }

      const redemptions = []
      for (const id of redemptionIds) {
        const data = await redis.client.hgetall(`${this.REDEMPTION_PREFIX}${id}`)
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
            beforeQuota: parseFloat(data.beforeQuota || 0),
            afterQuota: parseFloat(data.afterQuota || 0),
            beforeExpiry: data.beforeExpiry,
            afterExpiry: data.afterExpiry,
            timestamp: data.timestamp,
            status: data.status,
            revokedAt: data.revokedAt,
            revokedBy: data.revokedBy,
            revokeReason: data.revokeReason,
            actualQuotaDeducted: parseFloat(data.actualQuotaDeducted || 0)
          })
        }
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
        throw new Error('Card not found')
      }

      if (card.status !== 'unused') {
        throw new Error('Only unused cards can be deleted')
      }

      // 删除卡数据
      await redis.client.del(`${this.CARD_PREFIX}${cardId}`)
      await redis.client.del(`quota_card_code:${card.code}`)

      // 从索引中移除
      await redis.client.srem('quota_cards:all', cardId)
      await redis.client.srem(`quota_cards:status:unused`, cardId)

      logger.success(`🗑️ Deleted card ${card.code}`)

      return { success: true, cardCode: card.code }
    } catch (error) {
      logger.error('❌ Failed to delete card:', error)
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
    await redis.client.hset(`${this.CARD_PREFIX}${cardId}`, 'status', newStatus)

    // 更新状态索引
    await redis.client.srem(`quota_cards:status:${oldStatus}`, cardId)
    await redis.client.sadd(`quota_cards:status:${newStatus}`, cardId)
  }

  /**
   * 获取卡统计信息
   */
  async getCardStats() {
    try {
      const [unused, redeemed, revoked, expired] = await Promise.all([
        redis.client.scard('quota_cards:status:unused'),
        redis.client.scard('quota_cards:status:redeemed'),
        redis.client.scard('quota_cards:status:revoked'),
        redis.client.scard('quota_cards:status:expired')
      ])

      return {
        total: unused + redeemed + revoked + expired,
        unused,
        redeemed,
        revoked,
        expired
      }
    } catch (error) {
      logger.error('❌ Failed to get card stats:', error)
      return { total: 0, unused: 0, redeemed: 0, revoked: 0, expired: 0 }
    }
  }
}

module.exports = new QuotaCardService()
