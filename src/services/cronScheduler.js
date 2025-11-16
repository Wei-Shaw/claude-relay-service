const cron = require('node-cron')
const logger = require('../utils/logger')
const scheduledRequestExecutor = require('./scheduledRequestExecutor')
const { getAllAccountServices } = require('../utils/scheduledRequestHelper')

/**
 * 定时任务调度器
 * 负责在指定时间触发账户的定时请求
 */
class CronScheduler {
  constructor() {
    this.isInitialized = false
    this.cronTask = null
  }

  /**
   * 启动定时调度器
   */
  async initialize() {
    if (this.isInitialized) {
      logger.warn('[CronScheduler] Already initialized, skipping')
      return
    }

    try {
      // 每小时的05分执行一次检查
      this.cronTask = cron.schedule('5 * * * *', async () => {
        await this.executeScheduledTasks()
      })

      this.isInitialized = true
      logger.success('✅ Cron scheduler initialized (running at :05 of every hour)')
    } catch (error) {
      logger.error('❌ Failed to initialize cron scheduler:', error)
    }
  }

  /**
   * 执行当前小时的所有定时任务
   */
  async executeScheduledTasks() {
    const currentHour = new Date().getHours()
    const currentTime = new Date().toISOString()
    logger.info(`[CronScheduler] ⏰ Checking scheduled tasks for hour ${currentHour}`)

    try {
      // 获取所有账户服务
      const accountServices = getAllAccountServices()
      const tasksToExecute = []

      // 遍历所有账户服务，收集需要执行的任务
      for (const { type, service } of accountServices) {
        try {
          const accounts = await service.listAccounts()

          for (const account of accounts) {
            const sr = account.scheduledRequest

            // 检查是否需要执行
            if (this._shouldExecuteTask(account, sr, currentHour)) {
              tasksToExecute.push({
                accountId: account.id,
                accountType: type,
                accountName: account.name,
                scheduleHour: sr.scheduleHour
              })
            }
          }
        } catch (error) {
          logger.error(`[CronScheduler] Error loading ${type} accounts:`, error.message)
        }
      }

      if (tasksToExecute.length === 0) {
        logger.info('[CronScheduler] No tasks to execute at this hour')
        return
      }

      logger.info(`[CronScheduler] Found ${tasksToExecute.length} tasks to execute`)

      // 按顺序执行任务（避免并发冲击）
      for (const task of tasksToExecute) {
        await this._executeTaskWithDelay(task)
      }

      logger.success(`[CronScheduler] ✅ Completed ${tasksToExecute.length} scheduled tasks`)
    } catch (error) {
      logger.error('[CronScheduler] Error in executeScheduledTasks:', error)
    }
  }

  /**
   * 检查是否应该执行任务
   * @param {Object} account - 账户信息
   * @param {Object} sr - scheduledRequest配置
   * @param {number} currentHour - 当前小时
   * @returns {boolean} 是否应该执行
   */
  _shouldExecuteTask(account, sr, currentHour) {
    // 1. 检查是否启用了定时任务
    if (!sr || !sr.enabled) {
      return false
    }

    // 2. 检查执行时间是否匹配
    if (parseInt(sr.scheduleHour) !== currentHour) {
      return false
    }

    // 3. 检查账户状态
    if (account.status !== 'active' && account.isActive !== 'true') {
      logger.debug(`[CronScheduler] Skipping inactive account: ${account.name}`)
      return false
    }

    // 4. 检查今天是否已经执行过（防止重复执行）
    if (this._isExecutedToday(sr.lastExecutedAt, currentHour)) {
      logger.debug(`[CronScheduler] Task already executed today: ${account.name}`)
      return false
    }

    return true
  }

  /**
   * 检查今天是否已经执行过
   * @param {string} lastExecutedAt - 上次执行时间
   * @param {number} scheduleHour - 计划执行小时
   * @returns {boolean} 是否已执行
   */
  _isExecutedToday(lastExecutedAt, scheduleHour) {
    if (!lastExecutedAt) {
      return false
    }

    const lastExec = new Date(lastExecutedAt)
    const now = new Date()

    // 检查是否是今天同一小时执行的
    return (
      lastExec.getDate() === now.getDate() &&
      lastExec.getMonth() === now.getMonth() &&
      lastExec.getFullYear() === now.getFullYear() &&
      lastExec.getHours() === scheduleHour
    )
  }

  /**
   * 执行单个任务（带延迟，避免突发流量）
   * @param {Object} task - 任务信息
   */
  async _executeTaskWithDelay(task) {
    try {
      logger.info(
        `[CronScheduler] 🚀 Executing task for ${task.accountType}:${task.accountName} (${task.accountId})`
      )

      await scheduledRequestExecutor.executeForAccount(task.accountId, task.accountType)

      // 任务之间延迟1秒，避免突发流量
      await this._sleep(1000)
    } catch (error) {
      logger.error(`[CronScheduler] Error executing task ${task.accountId}:`, error.message)
    }
  }

  /**
   * 延迟函数
   * @param {number} ms - 毫秒数
   */
  _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  /**
   * 停止定时调度器
   */
  async stop() {
    if (this.cronTask) {
      this.cronTask.stop()
      this.cronTask = null
      this.isInitialized = false
      logger.info('[CronScheduler] Stopped')
    }
  }

  /**
   * 获取调度器状态
   */
  getStatus() {
    return {
      initialized: this.isInitialized,
      running: this.cronTask !== null
    }
  }
}

module.exports = new CronScheduler()
