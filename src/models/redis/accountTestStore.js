// ============================================================================
// 账户测试历史相关操作（从 src/models/redis.js 按域抽出）
// 经 attach(redisClient) 挂到同一个 RedisClient 单例上，this 绑定与原文件一致。
// ============================================================================
const logger = require('../../utils/logger')
const { RedisKeys, TTL, LIMITS } = require('../../constants/redisKeys')

const ACCOUNT_TEST_HISTORY_MAX = LIMITS.accountTestHistory // 保留最近5次测试记录
const ACCOUNT_TEST_HISTORY_TTL = TTL.accountTestHistory // 30天过期
const ACCOUNT_TEST_CONFIG_TTL = TTL.accountTestConfig // 测试配置保留1年（用户通常长期使用）

function attach(redisClient) {
  /**
   * 保存账户测试结果
   * @param {string} accountId - 账户ID
   * @param {string} platform - 平台类型 (claude/gemini/openai等)
   * @param {Object} testResult - 测试结果对象
   * @param {boolean} testResult.success - 是否成功
   * @param {string} testResult.message - 测试消息/响应
   * @param {number} testResult.latencyMs - 延迟毫秒数
   * @param {string} testResult.error - 错误信息（如有）
   * @param {string} testResult.timestamp - 测试时间戳
   */
  redisClient.saveAccountTestResult = async function (accountId, platform, testResult) {
    const key = RedisKeys.account.testHistory(platform, accountId)
    try {
      const record = JSON.stringify({
        ...testResult,
        timestamp: testResult.timestamp || new Date().toISOString()
      })

      // 使用 LPUSH + LTRIM 保持最近5条记录
      const client = this.getClientSafe()
      await client.lpush(key, record)
      await client.ltrim(key, 0, ACCOUNT_TEST_HISTORY_MAX - 1)
      await client.expire(key, ACCOUNT_TEST_HISTORY_TTL)

      logger.debug(`📝 Saved test result for ${platform} account ${accountId}`)
    } catch (error) {
      logger.error(`Failed to save test result for ${accountId}:`, error)
    }
  }

  /**
   * 获取账户测试历史
   * @param {string} accountId - 账户ID
   * @param {string} platform - 平台类型
   * @returns {Promise<Array>} 测试历史记录数组（最新在前）
   */
  redisClient.getAccountTestHistory = async function (accountId, platform) {
    const key = RedisKeys.account.testHistory(platform, accountId)
    try {
      const client = this.getClientSafe()
      const records = await client.lrange(key, 0, -1)
      return records.map((r) => JSON.parse(r))
    } catch (error) {
      logger.error(`Failed to get test history for ${accountId}:`, error)
      return []
    }
  }

  /**
   * 获取账户最新测试结果
   * @param {string} accountId - 账户ID
   * @param {string} platform - 平台类型
   * @returns {Promise<Object|null>} 最新测试结果
   */
  redisClient.getAccountLatestTestResult = async function (accountId, platform) {
    const key = RedisKeys.account.testHistory(platform, accountId)
    try {
      const client = this.getClientSafe()
      const record = await client.lindex(key, 0)
      return record ? JSON.parse(record) : null
    } catch (error) {
      logger.error(`Failed to get latest test result for ${accountId}:`, error)
      return null
    }
  }

  /**
   * 批量获取多个账户的测试历史
   * @param {Array<{accountId: string, platform: string}>} accounts - 账户列表
   * @returns {Promise<Object>} 以 accountId 为 key 的测试历史映射
   */
  redisClient.getAccountsTestHistory = async function (accounts) {
    const result = {}
    try {
      const client = this.getClientSafe()
      const pipeline = client.pipeline()

      for (const { accountId, platform } of accounts) {
        const key = RedisKeys.account.testHistory(platform, accountId)
        pipeline.lrange(key, 0, -1)
      }

      const responses = await pipeline.exec()

      accounts.forEach(({ accountId }, index) => {
        const [err, records] = responses[index]
        if (!err && records) {
          result[accountId] = records.map((r) => JSON.parse(r))
        } else {
          result[accountId] = []
        }
      })
    } catch (error) {
      logger.error('Failed to get batch test history:', error)
    }
    return result
  }

  /**
   * 保存定时测试配置
   * @param {string} accountId - 账户ID
   * @param {string} platform - 平台类型
   * @param {Object} config - 配置对象
   * @param {boolean} config.enabled - 是否启用定时测试
   * @param {string} config.cronExpression - Cron 表达式 (如 "0 8 * * *" 表示每天8点)
   * @param {string} config.model - 测试使用的模型
   */
  redisClient.saveAccountTestConfig = async function (accountId, platform, testConfig) {
    const key = RedisKeys.account.testConfig(platform, accountId)
    try {
      const client = this.getClientSafe()
      await client.hset(key, {
        enabled: testConfig.enabled ? 'true' : 'false',
        cronExpression: testConfig.cronExpression || '0 8 * * *', // 默认每天早上8点
        // 数据层不注入业务默认模型；缺省由消费方经 testModelConfigService 解析（单一事实源）
        model: testConfig.model || '',
        updatedAt: new Date().toISOString()
      })
      // 设置过期时间（1年）
      await client.expire(key, ACCOUNT_TEST_CONFIG_TTL)
    } catch (error) {
      logger.error(`Failed to save test config for ${accountId}:`, error)
    }
  }

  /**
   * 获取定时测试配置
   * @param {string} accountId - 账户ID
   * @param {string} platform - 平台类型
   * @returns {Promise<Object|null>} 配置对象
   */
  redisClient.getAccountTestConfig = async function (accountId, platform) {
    const key = RedisKeys.account.testConfig(platform, accountId)
    try {
      const client = this.getClientSafe()
      const testConfig = await client.hgetall(key)
      if (!testConfig || Object.keys(testConfig).length === 0) {
        return null
      }
      // 向后兼容：如果存在旧的 testHour 字段，转换为 cron 表达式
      let { cronExpression } = testConfig
      if (!cronExpression && testConfig.testHour) {
        const hour = parseInt(testConfig.testHour, 10)
        cronExpression = `0 ${hour} * * *`
      }
      return {
        enabled: testConfig.enabled === 'true',
        cronExpression: cronExpression || '0 8 * * *',
        // 数据层不注入业务默认模型；缺省返回 null，由消费方经 testModelConfigService 解析
        model: testConfig.model || null,
        updatedAt: testConfig.updatedAt
      }
    } catch (error) {
      logger.error(`Failed to get test config for ${accountId}:`, error)
      return null
    }
  }

  /**
   * 获取所有启用定时测试的账户
   * @param {string} platform - 平台类型
   * @returns {Promise<Array>} 账户ID列表及 cron 配置
   */
  redisClient.getEnabledTestAccounts = async function (platform) {
    const accountIds = []
    let cursor = '0'

    try {
      const client = this.getClientSafe()
      do {
        const [newCursor, keys] = await client.scan(
          cursor,
          'MATCH',
          RedisKeys.account.testConfigPattern(platform),
          'COUNT',
          100
        )
        cursor = newCursor

        for (const key of keys) {
          const testConfig = await client.hgetall(key)
          if (testConfig && testConfig.enabled === 'true') {
            const accountId = key.replace(`account:test_config:${platform}:`, '')
            // 向后兼容：如果存在旧的 testHour 字段，转换为 cron 表达式
            let { cronExpression } = testConfig
            if (!cronExpression && testConfig.testHour) {
              const hour = parseInt(testConfig.testHour, 10)
              cronExpression = `0 ${hour} * * *`
            }
            accountIds.push({
              accountId,
              cronExpression: cronExpression || '0 8 * * *',
              // 数据层不注入业务默认模型；缺省返回 null，由调度器经 testModelConfigService 解析
              model: testConfig.model || null
            })
          }
        }
      } while (cursor !== '0')

      return accountIds
    } catch (error) {
      logger.error(`Failed to get enabled test accounts for ${platform}:`, error)
      return []
    }
  }

  /**
   * 保存账户上次测试时间（用于调度器判断是否需要测试）
   * @param {string} accountId - 账户ID
   * @param {string} platform - 平台类型
   */
  redisClient.setAccountLastTestTime = async function (accountId, platform) {
    const key = RedisKeys.account.lastTest(platform, accountId)
    try {
      const client = this.getClientSafe()
      await client.set(key, Date.now().toString(), 'EX', TTL.accountLastTest) // 7天过期
    } catch (error) {
      logger.error(`Failed to set last test time for ${accountId}:`, error)
    }
  }

  /**
   * 获取账户上次测试时间
   * @param {string} accountId - 账户ID
   * @param {string} platform - 平台类型
   * @returns {Promise<number|null>} 上次测试时间戳
   */
  redisClient.getAccountLastTestTime = async function (accountId, platform) {
    const key = RedisKeys.account.lastTest(platform, accountId)
    try {
      const client = this.getClientSafe()
      const timestamp = await client.get(key)
      return timestamp ? parseInt(timestamp, 10) : null
    } catch (error) {
      logger.error(`Failed to get last test time for ${accountId}:`, error)
      return null
    }
  }
}

module.exports = { attach }
