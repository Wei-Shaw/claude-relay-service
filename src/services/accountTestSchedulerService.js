/**
 * 账户定时测试调度服务
 * 使用 node-cron 支持 crontab 表达式，为每个账户创建独立的定时任务
 */

const cron = require('node-cron')
const redis = require('../models/redis')
const logger = require('../utils/logger')

class AccountTestSchedulerService {
  constructor() {
    // 存储每个账户的 cron 任务: Map<string, { task: ScheduledTask, cronExpression: string }>
    this.scheduledTasks = new Map()
    // 定期刷新配置的间隔 (毫秒)
    this.refreshIntervalMs = 60 * 1000
    this.refreshInterval = null
    // 当前正在测试的账户
    this.testingAccounts = new Set()
    // 是否已启动
    this.isStarted = false
  }

  /**
   * 验证 cron 表达式是否有效
   * @param {string} cronExpression - cron 表达式
   * @returns {boolean}
   */
  validateCronExpression(cronExpression) {
    // 长度检查（防止 DoS）
    if (!cronExpression || cronExpression.length > 100) {
      return false
    }
    return cron.validate(cronExpression)
  }

  /**
   * 启动调度器
   */
  async start() {
    if (this.isStarted) {
      logger.warn('⚠️ Account test scheduler is already running')
      return
    }

    this.isStarted = true
    logger.info('🚀 Starting account test scheduler service (node-cron mode)')

    // 初始化所有已配置账户的定时任务
    await this._refreshAllTasks()

    // 定期刷新配置，以便动态添加/修改的配置能生效
    this.refreshInterval = setInterval(() => {
      this._refreshAllTasks()
    }, this.refreshIntervalMs)

    logger.info(
      `📅 Account test scheduler started (refreshing configs every ${this.refreshIntervalMs / 1000}s)`
    )
  }

  /**
   * 停止调度器
   */
  stop() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval)
      this.refreshInterval = null
    }

    // 停止所有 cron 任务
    for (const [accountKey, taskInfo] of this.scheduledTasks.entries()) {
      taskInfo.task.stop()
      logger.debug(`🛑 Stopped cron task for ${accountKey}`)
    }
    this.scheduledTasks.clear()

    this.isStarted = false
    logger.info('🛑 Account test scheduler stopped')
  }

  /**
   * 刷新所有账户的定时任务
   * @private
   */
  async _refreshAllTasks() {
    try {
      const platforms = ['claude', 'gemini', 'openai', 'openai-responses']
      const activeAccountKeys = new Set()

      // 并行加载所有平台的配置
      const allEnabledAccounts = await Promise.all(
        platforms.map((platform) =>
          redis
            .getEnabledTestAccounts(platform)
            .then((accounts) => accounts.map((acc) => ({ ...acc, platform })))
            .catch((error) => {
              logger.warn(`⚠️ Failed to load test accounts for platform ${platform}:`, error)
              return []
            })
        )
      )

      // 展平平台数据
      const flatAccounts = allEnabledAccounts.flat()

      for (const { accountId, cronExpression, model, platform } of flatAccounts) {
        if (!cronExpression) {
          logger.warn(
            `⚠️ Account ${accountId} (${platform}) has no valid cron expression, skipping`
          )
          continue
        }

        const accountKey = `${platform}:${accountId}`
        activeAccountKeys.add(accountKey)

        // 检查是否需要更新任务
        const existingTask = this.scheduledTasks.get(accountKey)
        if (existingTask) {
          // 如果 cron 表达式和模型都没变，不需要更新
          if (existingTask.cronExpression === cronExpression && existingTask.model === model) {
            continue
          }
          // 配置变了，停止旧任务
          existingTask.task.stop()
          logger.info(`🔄 Updating cron task for ${accountKey}: ${cronExpression}, model: ${model}`)
        } else {
          logger.info(`➕ Creating cron task for ${accountKey}: ${cronExpression}, model: ${model}`)
        }

        // 创建新的 cron 任务
        this._createCronTask(accountId, platform, cronExpression, model)
      }

      // 清理已删除或禁用的账户任务
      for (const [accountKey, taskInfo] of this.scheduledTasks.entries()) {
        if (!activeAccountKeys.has(accountKey)) {
          taskInfo.task.stop()
          this.scheduledTasks.delete(accountKey)
          logger.info(`➖ Removed cron task for ${accountKey} (disabled or deleted)`)
        }
      }
    } catch (error) {
      logger.error('❌ Error refreshing account test tasks:', error)
    }
  }

  /**
   * 为单个账户创建 cron 任务
   * @param {string} accountId
   * @param {string} platform
   * @param {string} cronExpression
   * @param {string} model - 测试使用的模型
   * @private
   */
  _createCronTask(accountId, platform, cronExpression, model) {
    const accountKey = `${platform}:${accountId}`

    // 验证 cron 表达式
    if (!this.validateCronExpression(cronExpression)) {
      logger.error(`❌ Invalid cron expression for ${accountKey}: ${cronExpression}`)
      return
    }

    const task = cron.schedule(
      cronExpression,
      async () => {
        await this._runAccountTest(accountId, platform, model)
      },
      {
        scheduled: true,
        timezone: process.env.TZ || 'Asia/Shanghai'
      }
    )

    this.scheduledTasks.set(accountKey, {
      task,
      cronExpression,
      model,
      accountId,
      platform
    })
  }

  /**
   * 执行单个账户测试
   * @param {string} accountId - 账户ID
   * @param {string} platform - 平台类型
   * @param {string} model - 测试使用的模型
   * @private
   */
  async _runAccountTest(accountId, platform, model) {
    const accountKey = `${platform}:${accountId}`

    // 避免重复测试
    if (this.testingAccounts.has(accountKey)) {
      logger.debug(`⏳ Account ${accountKey} is already being tested, skipping`)
      return
    }

    this.testingAccounts.add(accountKey)

    try {
      logger.info(
        `🧪 Running scheduled test for ${platform} account: ${accountId} (model: ${model})`
      )

      let testResult

      // 根据平台调用对应的测试方法
      switch (platform) {
        case 'claude':
          testResult = await this._testClaudeAccount(accountId, model)
          break
        case 'gemini':
          testResult = await this._testGeminiAccount(accountId, model)
          break
        case 'openai':
          testResult = await this._testOpenAIAccount(accountId, model)
          break
        case 'openai-responses':
          testResult = await this._testOpenAIResponsesAccount(accountId, model)
          break
        default:
          testResult = {
            success: false,
            error: `Unsupported platform: ${platform}`,
            timestamp: new Date().toISOString()
          }
      }

      // 保存测试结果
      await redis.saveAccountTestResult(accountId, platform, testResult)

      // 更新最后测试时间
      await redis.setAccountLastTestTime(accountId, platform)

      // 记录日志
      if (testResult.success) {
        logger.info(
          `✅ Scheduled test passed for ${platform} account ${accountId} (${testResult.latencyMs}ms)`
        )
      } else {
        logger.warn(
          `❌ Scheduled test failed for ${platform} account ${accountId}: ${testResult.error}`
        )
      }

      return testResult
    } catch (error) {
      logger.error(`❌ Error testing ${platform} account ${accountId}:`, error)

      const errorResult = {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      }

      await redis.saveAccountTestResult(accountId, platform, errorResult)
      await redis.setAccountLastTestTime(accountId, platform)

      return errorResult
    } finally {
      this.testingAccounts.delete(accountKey)
    }
  }

  /**
   * 测试 Claude 账户
   * @param {string} accountId
   * @param {string} model - 测试使用的模型
   * @private
   */
  async _testClaudeAccount(accountId, model) {
    const claudeRelayService = require('./relay/claudeRelayService')
    return await claudeRelayService.testAccountConnectionSync(accountId, model)
  }

  /**
   * 测试 Gemini 账户
   * @param {string} _accountId
   * @param {string} _model
   * @private
   */
  async _testGeminiAccount(_accountId, _model) {
    // Gemini 测试暂时返回未实现
    return {
      success: false,
      error: 'Gemini scheduled test not implemented yet',
      timestamp: new Date().toISOString()
    }
  }

  /**
   * 测试 OpenAI 账户
   * @param {string} _accountId
   * @param {string} _model
   * @private
   */
  async _testOpenAIAccount(_accountId, _model) {
    // OpenAI 测试暂时返回未实现
    return {
      success: false,
      error: 'OpenAI scheduled test not implemented yet',
      timestamp: new Date().toISOString()
    }
  }

  /**
   * 测试 OpenAI Responses 账户
   * @param {string} accountId
   * @param {string} model
   * @private
   */
  async _testOpenAIResponsesAccount(accountId, model) {
    const openaiResponsesRelayService = require('./relay/openaiResponsesRelayService')
    const result = await openaiResponsesRelayService.testAccountConnection(accountId, model)

    return {
      ...result,
      success: true,
      latencyMs: result.latency,
      timestamp: new Date().toISOString()
    }
  }

  /**
   * 手动触发账户测试
   * @param {string} accountId - 账户ID
   * @param {string} platform - 平台类型
   * @param {string} model - 测试使用的模型
   * @returns {Promise<Object>} 测试结果
   */
  async triggerTest(accountId, platform, model = 'claude-sonnet-4-5-20250929') {
    logger.info(`🎯 Manual test triggered for ${platform} account: ${accountId} (model: ${model})`)
    return await this._runAccountTest(accountId, platform, model)
  }

  /**
   * 获取账户测试历史
   * @param {string} accountId - 账户ID
   * @param {string} platform - 平台类型
   * @returns {Promise<Array>} 测试历史
   */
  async getTestHistory(accountId, platform) {
    return await redis.getAccountTestHistory(accountId, platform)
  }

  /**
   * 获取账户测试配置
   * @param {string} accountId - 账户ID
   * @param {string} platform - 平台类型
   * @returns {Promise<Object|null>}
   */
  async getTestConfig(accountId, platform) {
    return await redis.getAccountTestConfig(accountId, platform)
  }

  /**
   * 设置账户测试配置
   * @param {string} accountId - 账户ID
   * @param {string} platform - 平台类型
   * @param {Object} testConfig - 测试配置 { enabled: boolean, cronExpression: string, model: string }
   * @returns {Promise<void>}
   */
  async setTestConfig(accountId, platform, testConfig) {
    // 验证 cron 表达式
    if (testConfig.cronExpression && !this.validateCronExpression(testConfig.cronExpression)) {
      throw new Error(`Invalid cron expression: ${testConfig.cronExpression}`)
    }

    await redis.saveAccountTestConfig(accountId, platform, testConfig)
    logger.info(
      `📝 Test config updated for ${platform} account ${accountId}: enabled=${testConfig.enabled}, cronExpression=${testConfig.cronExpression}, model=${testConfig.model}`
    )

    // 立即刷新任务，使配置立即生效
    if (this.isStarted) {
      await this._refreshAllTasks()
    }
  }

  /**
   * 更新单个账户的定时任务（配置变更时调用）
   * @param {string} accountId
   * @param {string} platform
   */
  async refreshAccountTask(accountId, platform) {
    if (!this.isStarted) {
      return
    }

    const accountKey = `${platform}:${accountId}`
    const testConfig = await redis.getAccountTestConfig(accountId, platform)

    // 停止现有任务
    const existingTask = this.scheduledTasks.get(accountKey)
    if (existingTask) {
      existingTask.task.stop()
      this.scheduledTasks.delete(accountKey)
    }

    // 如果启用且有有效的 cron 表达式，创建新任务
    if (testConfig?.enabled && testConfig?.cronExpression) {
      this._createCronTask(accountId, platform, testConfig.cronExpression, testConfig.model)
      logger.info(
        `🔄 Refreshed cron task for ${accountKey}: ${testConfig.cronExpression}, model: ${testConfig.model}`
      )
    }
  }

  /**
   * 获取调度器状态
   * @returns {Object}
   */
  getStatus() {
    const tasks = []
    for (const [accountKey, taskInfo] of this.scheduledTasks.entries()) {
      tasks.push({
        accountKey,
        accountId: taskInfo.accountId,
        platform: taskInfo.platform,
        cronExpression: taskInfo.cronExpression,
        model: taskInfo.model
      })
    }

    return {
      running: this.isStarted,
      refreshIntervalMs: this.refreshIntervalMs,
      scheduledTasksCount: this.scheduledTasks.size,
      scheduledTasks: tasks,
      currentlyTesting: Array.from(this.testingAccounts)
    }
  }
}

// 单例模式
const accountTestSchedulerService = new AccountTestSchedulerService()

module.exports = accountTestSchedulerService
