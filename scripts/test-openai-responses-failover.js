#!/usr/bin/env node

/**
 * 测试 OpenAI-Responses 故障转移机制（错误计数 → 阈值触发 → 临时禁用 → 自动恢复）
 *
 * 说明：
 * - 仅使用服务层 API（不发出真实网络请求）
 * - 通过直接调用 recordRequestError() 模拟失败，并在达到阈值时调用 markAccountTempError()
 * - 为了加快测试，临时缩短 Redis TTL（对 temp_error 键手动设置 2 秒后过期）
 */

const path = require('path')
const dotenv = require('dotenv')
dotenv.config({ path: path.join(__dirname, '..', '.env') })

const logger = require('../src/utils/logger')
const redisClient = require('../src/models/redis')
const openaiResponsesAccountService = require('../src/services/openaiResponsesAccountService')

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function ensureTestAccount() {
  const accounts = await openaiResponsesAccountService.getAllAccounts(true)
  if (accounts && accounts.length > 0) {
    logger.info(
      `✅ Using existing OpenAI-Responses account: ${accounts[0].name} (${accounts[0].id})`
    )
    return { id: accounts[0].id, created: false }
  }

  logger.info('⚠️  No OpenAI-Responses account found, creating a temporary test account...')
  const account = await openaiResponsesAccountService.createAccount({
    name: `Test OpenAI-Responses Account (Failover)`,
    description: 'Auto-created for failover testing',
    baseApi: 'https://example.com',
    apiKey: `sk-test-dummy-${Date.now()}`,
    accountType: 'shared',
    isActive: true,
    schedulable: true,
    priority: 50
  })
  logger.info(`✅ Test account created: ${account.name} (${account.id})`)
  return { id: account.id, created: true }
}

async function testErrorCounterWindow(accountId) {
  logger.info('⏱️  Testing error counter TTL window (Responses)...')
  await openaiResponsesAccountService.clearRequestErrors(accountId)
  const { windowMinutes } = openaiResponsesAccountService._getFailoverConfig()
  await openaiResponsesAccountService.recordRequestError(accountId, 500)
  let count = await openaiResponsesAccountService.getRequestErrorCount(accountId)
  logger.info(`  Count after one failure: ${count} (window: ${windowMinutes}m)`)

  // 将计数键 TTL 缩短到 2 秒，验证过期后清零
  const client = redisClient.getClientSafe()
  const key = `openai_responses_account:request_errors:${accountId}`
  await client.expire(key, 2)
  logger.info('  Shortened request_errors TTL -> 2s; waiting 3s...')
  await sleep(3000)
  count = await openaiResponsesAccountService.getRequestErrorCount(accountId)
  if (count === 0) {
    logger.info('✅ Error counter expired correctly after window (simulated)')
  } else {
    logger.error(`❌ Error counter should have expired to 0, got ${count}`)
  }
}

async function testThresholdAndTempDisable(accountId) {
  logger.info('🚦 Testing threshold trigger and temporary disable (Responses)...')
  await openaiResponsesAccountService.clearRequestErrors(accountId)
  const { threshold } = openaiResponsesAccountService._getFailoverConfig()
  logger.info(`  Using threshold = ${threshold}`)

  for (let i = 1; i <= threshold; i++) {
    const c = await openaiResponsesAccountService.recordRequestError(accountId, 500)
    logger.info(`  Failure ${i}/${threshold} recorded, count=${c}`)
  }

  // 达到阈值后，按转发层逻辑会触发临时禁用；测试中直接调用
  await openaiResponsesAccountService.markAccountTempError(accountId)

  const account = await openaiResponsesAccountService.getAccount(accountId)
  const isTemp = account && account.status === 'temp_error'
  logger.info(`  Account status after mark: ${account.status}`)
  if (!isTemp) {
    throw new Error('Expected account to be temp_error after threshold is reached')
  }

  // 将 temp_error 键 TTL 缩短到 2 秒，验证自动恢复
  const client = redisClient.getClientSafe()
  const tempKey = `openai_responses_account:temp_error:${accountId}`
  await client.expire(tempKey, 2)
  logger.info('  Shortened temp_error TTL -> 2s; waiting 3s...')
  await sleep(3000)

  const result = await openaiResponsesAccountService.checkAndRecoverTempErrorAccounts()
  logger.info(`  Recovery check result: checked=${result.checked}, recovered=${result.recovered}`)

  const recovered = await openaiResponsesAccountService.getAccount(accountId)
  if (recovered.status === 'active' && recovered.schedulable === 'true') {
    logger.info('✅ Account auto-recovered after temp disable period')
  } else {
    logger.error(
      `❌ Account not recovered. status=${recovered.status}, schedulable=${recovered.schedulable}`
    )
  }
}

async function main() {
  try {
    logger.info('🧪 Starting OpenAI-Responses failover test...')
    await redisClient.connect()
    const { id: accountId, created } = await ensureTestAccount()

    await testErrorCounterWindow(accountId)
    await testThresholdAndTempDisable(accountId)

    // 清理：确保状态回到 active
    try {
      await openaiResponsesAccountService.updateAccount(accountId, {
        status: 'active',
        schedulable: 'true',
        errorMessage: '',
        tempErrorAt: ''
      })
      await openaiResponsesAccountService.clearRequestErrors(accountId)
    } catch (e) {
      // ignore
    }

    // 如果是本次测试创建的账号，删除它
    if (created) {
      await openaiResponsesAccountService.deleteAccount(accountId)
      logger.info(`🗑️  Removed temporary test account: ${accountId}`)
    }

    logger.success('✅ OpenAI-Responses failover test completed successfully!')
  } catch (err) {
    logger.error('❌ OpenAI-Responses failover test failed:', err)
    process.exitCode = 1
  } finally {
    try {
      await redisClient.disconnect()
    } catch (e) {
      // ignore disconnect error
    }
    // 让日志写入 flush
    setTimeout(() => process.exit(process.exitCode || 0), 300)
  }
}

main()
