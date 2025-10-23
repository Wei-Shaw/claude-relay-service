#!/usr/bin/env node

/**
 * 测试OpenAI故障转移机制
 * 用于验证错误计数、临时禁用和自动恢复功能
 */

const path = require('path')
const dotenv = require('dotenv')

// 加载环境变量
dotenv.config({ path: path.join(__dirname, '..', '.env') })

const logger = require('../src/utils/logger')
const openaiAccountService = require('../src/services/openaiAccountService')
const redisClient = require('../src/models/redis')

async function testFailover() {
  try {
    logger.info('🧪 Starting OpenAI failover mechanism test...')

    // 初始化Redis连接
    logger.info('🔌 Connecting to Redis...')
    await redisClient.connect()
    logger.info('✅ Redis connected')

    // 1. 获取故障转移配置
    const config = openaiAccountService.getFailoverConfig()
    logger.info('📋 Failover configuration:', config)

    // 2. 获取第一个可用的OpenAI账户进行测试
    const accounts = await openaiAccountService.getAllAccounts()
    if (accounts.length === 0) {
      logger.error('❌ No OpenAI accounts found for testing')
      process.exit(1)
    }

    const testAccount = accounts[0]
    logger.info(`🎯 Testing with account: ${testAccount.name} (${testAccount.id})`)

    // 3. 清除任何现有的错误计数
    await openaiAccountService.clearRequestErrors(testAccount.id)
    logger.info('✅ Cleared existing error counter')

    // 4. 模拟多次失败请求
    logger.info(`📈 Simulating ${config.threshold} failed requests...`)
    for (let i = 1; i <= config.threshold; i++) {
      const statusCode = [400, 401, 403, 500, 502, 503][Math.floor(Math.random() * 6)]
      await openaiAccountService.recordRequestError(testAccount.id, statusCode)
      const count = await openaiAccountService.getRequestErrorCount(testAccount.id)
      logger.info(
        `  Failed request ${i}/${config.threshold} (status: ${statusCode}), error count: ${count}`
      )

      // 小延迟避免Redis压力
      await new Promise((resolve) => setTimeout(resolve, 100))
    }

    // 5. 检查是否达到阈值并触发临时禁用
    const errorCount = await openaiAccountService.getRequestErrorCount(testAccount.id)
    logger.info(`📊 Final error count: ${errorCount}`)

    if (errorCount >= config.threshold) {
      logger.info('🔴 Threshold reached, marking account as temp_error...')
      await openaiAccountService.markAccountTempError(testAccount.id)

      // 6. 验证账户状态
      const updatedAccount = await openaiAccountService.getAccount(testAccount.id)
      logger.info(`📋 Account status after marking:`)
      logger.info(`  - Status: ${updatedAccount.status}`)
      logger.info(`  - Schedulable: ${updatedAccount.schedulable}`)
      logger.info(`  - Error message: ${updatedAccount.errorMessage}`)

      // 7. 检查Redis TTL
      const client = redisClient.getClientSafe()
      const tempErrorKey = `openai_account:temp_error:${testAccount.id}`
      const ttl = await client.ttl(tempErrorKey)
      logger.info(
        `⏱️ Redis TTL for temp_error key: ${ttl} seconds (${(ttl / 60).toFixed(1)} minutes)`
      )

      // 8. 测试并发控制（尝试再次标记）
      logger.info('🔒 Testing concurrent marking prevention...')
      const result = await openaiAccountService.markAccountTempError(testAccount.id)
      if (result.success === false) {
        logger.info(`✅ Concurrent marking prevented: ${result.reason}`)
      } else {
        logger.warn('⚠️ Concurrent marking was not prevented')
      }

      // 9. 模拟成功请求（应该不会清除计数，因为账户已经是temp_error状态）
      logger.info('📉 Simulating successful request on temp_error account...')
      await openaiAccountService.clearRequestErrors(testAccount.id)
      const countAfterClear = await openaiAccountService.getRequestErrorCount(testAccount.id)
      logger.info(`  Error count after clearing: ${countAfterClear}`)

      // 10. 手动恢复测试
      logger.info('🔄 Testing manual recovery...')
      const recoveryResult = await openaiAccountService.checkAndRecoverTempErrorAccounts()
      logger.info(`  Recovery check result:`, recoveryResult)

      // 11. 清理测试数据
      logger.info('🧹 Cleaning up test data...')
      await client.del(tempErrorKey)
      await openaiAccountService.clearRequestErrors(testAccount.id)
      await openaiAccountService.updateAccount(testAccount.id, {
        status: 'active',
        schedulable: 'true',
        errorMessage: null,
        tempErrorAt: null
      })

      logger.success('✅ OpenAI failover mechanism test completed successfully!')
    } else {
      logger.error('❌ Failed to reach error threshold')
    }
  } catch (error) {
    logger.error('❌ Test failed:', error)
    process.exit(1)
  } finally {
    // 确保Redis连接关闭
    logger.info('🔌 Disconnecting from Redis...')
    try {
      await redisClient.cleanup()
    } catch (err) {
      // 忽略清理错误
    }
    setTimeout(() => {
      process.exit(0)
    }, 500)
  }
}

// 运行测试
testFailover()
