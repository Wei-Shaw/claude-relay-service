const redis = require('../models/redis')
const logger = require('../utils/logger')

/**
 * 生成 asctime 格式的时间戳
 * @returns {string} 格式: YYYY-MM-DD HH:mm:ss,mmm
 */
function getAsctime() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const hours = String(now.getHours()).padStart(2, '0')
  const minutes = String(now.getMinutes()).padStart(2, '0')
  const seconds = String(now.getSeconds()).padStart(2, '0')
  const milliseconds = String(now.getMilliseconds()).padStart(3, '0')

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds},${milliseconds}`
}

/**
 * 计费事件发布器 - 使用 Redis Stream 解耦计费系统
 *
 * 设计原则:
 * 1. 异步非阻塞: 发布失败不影响主流程
 * 2. 结构化数据: 使用标准化的事件格式
 * 3. 可追溯性: 每个事件包含完整上下文
 */
class BillingEventPublisher {
  constructor() {
    this.streamKey = process.env.BILLING_STREAM_KEY || 'billing:events'
    this.maxLength = parseInt(process.env.BILLING_STREAM_MAX_LENGTH) || 100000 // 保留最近 10 万条事件
    this.enabled = process.env.BILLING_EVENTS_ENABLED === 'true' // 默认禁用，需显式启用
  }

  /**
   * 发布计费事件
   * @param {Object} eventData - 事件数据
   * @returns {Promise<string|null>} - 事件ID 或 null
   */
  async publishBillingEvent(eventData) {
    if (!this.enabled) {
      logger.debug('📭 Billing events disabled, skipping publish')
      return null
    }

    try {
      const client = redis.getClientSafe()

      // 构建标准化事件
      const event = {
        // 事件元数据
        eventId: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        eventType: 'usage.recorded',
        timestamp: getAsctime(),
        version: '1.0',

        // 核心计费数据
        apiKeyInfo: {
          id: eventData.keyId,
          name: eventData.keyName || null,
          apiKey: eventData.apiKey || null
        },

        // 使用量详情
        usage: {
          model: eventData.model,
          inputTokens: eventData.inputTokens || 0,
          outputTokens: eventData.outputTokens || 0,
          cacheCreateTokens: eventData.cacheCreateTokens || 0,
          cacheReadTokens: eventData.cacheReadTokens || 0,
          ephemeral5mTokens: eventData.ephemeral5mTokens || 0,
          ephemeral1hTokens: eventData.ephemeral1hTokens || 0,
          totalTokens: eventData.totalTokens || 0
        },

        // 费用详情
        cost: {
          total: eventData.cost || 0,
          currency: 'USD',
          breakdown: {
            input: eventData.costBreakdown?.input || 0,
            output: eventData.costBreakdown?.output || 0,
            cacheCreate: eventData.costBreakdown?.cacheCreate || 0,
            cacheRead: eventData.costBreakdown?.cacheRead || 0,
            ephemeral5m: eventData.costBreakdown?.ephemeral5m || 0,
            ephemeral1h: eventData.costBreakdown?.ephemeral1h || 0
          }
        },

        // 账户信息
        account: {
          id: eventData.accountId || null,
          type: eventData.accountType || null
        },

        // 请求上下文
        context: {
          isLongContext: eventData.isLongContext || false,
          requestTimestamp: eventData.requestTimestamp || getAsctime()
        }
      }

      // 使用 XADD 发布事件到 Stream
      // MAXLEN ~ 10000: 近似截断，保持性能
      const messageId = await client.xadd(
        this.streamKey,
        'MAXLEN',
        '~',
        this.maxLength,
        '*', // 自动生成消息ID
        'data',
        JSON.stringify(event)
      )

      logger.debug(
        `📤 Published billing event: ${messageId} | Key: ${eventData.keyId} | Cost: $${event.cost.total.toFixed(6)}`
      )

      return messageId
    } catch (error) {
      // ⚠️ 发布失败不影响主流程，只记录错误
      logger.error('❌ Failed to publish billing event:', error)
      return null
    }
  }

  /**
   * 批量发布计费事件（优化性能）
   * @param {Array<Object>} events - 事件数组
   * @returns {Promise<number>} - 成功发布的事件数
   */
  async publishBatchBillingEvents(events) {
    if (!this.enabled || !events || events.length === 0) {
      return 0
    }

    try {
      const client = redis.getClientSafe()
      const pipeline = client.pipeline()

      events.forEach((eventData) => {
        const event = {
          eventId: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          eventType: 'usage.recorded',
          timestamp: getAsctime(),
          version: '1.0',
          apiKeyInfo: {
            id: eventData.keyId,
            name: eventData.keyName || null,
            apiKey: eventData.apiKey || null
          },
          usage: {
            model: eventData.model,
            inputTokens: eventData.inputTokens || 0,
            outputTokens: eventData.outputTokens || 0,
            totalTokens: eventData.totalTokens || 0
          },
          cost: {
            total: eventData.cost || 0,
            currency: 'USD'
          }
        }

        pipeline.xadd(
          this.streamKey,
          'MAXLEN',
          '~',
          this.maxLength,
          '*',
          'data',
          JSON.stringify(event)
        )
      })

      const results = await pipeline.exec()
      const successCount = results.filter((r) => r[0] === null).length

      logger.info(`📤 Batch published ${successCount}/${events.length} billing events`)
      return successCount
    } catch (error) {
      logger.error('❌ Failed to batch publish billing events:', error)
      return 0
    }
  }

  /**
   * 获取 Stream 信息（用于监控）
   * @returns {Promise<Object>}
   */
  async getStreamInfo() {
    try {
      const client = redis.getClientSafe()
      const info = await client.xinfo('STREAM', this.streamKey)

      // 解析 Redis XINFO 返回的数组格式
      const result = {}
      for (let i = 0; i < info.length; i += 2) {
        result[info[i]] = info[i + 1]
      }

      return {
        length: result.length || 0,
        firstEntry: result['first-entry'] || null,
        lastEntry: result['last-entry'] || null,
        groups: result.groups || 0
      }
    } catch (error) {
      if (error.message.includes('no such key')) {
        return { length: 0, groups: 0 }
      }
      logger.error('❌ Failed to get stream info:', error)
      return null
    }
  }

  /**
   * 创建消费者组（供外部计费系统使用）
   * @param {string} groupName - 消费者组名称
   * @returns {Promise<boolean>}
   */
  async createConsumerGroup(groupName = 'billing-system') {
    try {
      const client = redis.getClientSafe()

      // MKSTREAM: 如果 stream 不存在则创建
      await client.xgroup('CREATE', this.streamKey, groupName, '0', 'MKSTREAM')

      logger.success(`✅ Created consumer group: ${groupName}`)
      return true
    } catch (error) {
      if (error.message.includes('BUSYGROUP')) {
        logger.debug(`Consumer group ${groupName} already exists`)
        return true
      }
      logger.error(`❌ Failed to create consumer group ${groupName}:`, error)
      return false
    }
  }
}

module.exports = new BillingEventPublisher()
