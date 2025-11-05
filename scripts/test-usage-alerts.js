#!/usr/bin/env node

/**
 * 测试使用额度告警系统
 *
 * 此脚本用于测试 Claude 账号使用额度告警功能
 * 可以模拟设置账号使用量，并触发告警通知
 *
 * 使用方法:
 *   node scripts/test-usage-alerts.js [options]
 *
 * 选项:
 *   --account-id <id>     指定要测试的账号ID
 *   --usage-percent <n>   设置使用百分比 (0-100)
 *   --trigger             手动触发一次检查
 *   --clear-history <id>  清除指定账号的告警历史
 *   --list-accounts       列出所有活跃账号
 */

require('dotenv').config()
const redis = require('../src/models/redis')
const logger = require('../src/utils/logger')
const usageAlertService = require('../src/services/usageAlertService')
const claudeAccountService = require('../src/services/claudeAccountService')
const claudeConsoleAccountService = require('../src/services/claudeConsoleAccountService')

// 解析命令行参数
function parseArgs() {
  const args = process.argv.slice(2)
  const options = {
    accountId: null,
    usagePercent: null,
    trigger: false,
    clearHistory: null,
    listAccounts: false
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    switch (arg) {
      case '--account-id':
        options.accountId = args[++i]
        break
      case '--usage-percent':
        options.usagePercent = parseFloat(args[++i])
        break
      case '--trigger':
        options.trigger = true
        break
      case '--clear-history':
        options.clearHistory = args[++i]
        break
      case '--list-accounts':
        options.listAccounts = true
        break
      case '--help':
      case '-h':
        showHelp()
        process.exit(0)
        break
      default:
        console.error(`❌ Unknown option: ${arg}`)
        showHelp()
        process.exit(1)
    }
  }

  return options
}

function showHelp() {
  console.log(`
使用额度告警测试脚本

使用方法:
  node scripts/test-usage-alerts.js [options]

选项:
  --account-id <id>        指定要测试的账号ID
  --usage-percent <n>      设置使用百分比 (0-100)，需要配合 --account-id 使用
  --trigger                手动触发一次告警检查
  --clear-history <id>     清除指定账号的告警历史，允许重新发送告警
  --list-accounts          列出所有活跃的 Claude 账号
  --help, -h               显示此帮助信息

示例:
  # 列出所有账号
  node scripts/test-usage-alerts.js --list-accounts

  # 模拟账号使用量达到 85%
  node scripts/test-usage-alerts.js --account-id <account-id> --usage-percent 85

  # 手动触发一次告警检查
  node scripts/test-usage-alerts.js --trigger

  # 清除账号告警历史（允许重新发送告警）
  node scripts/test-usage-alerts.js --clear-history <account-id>
`)
}

/**
 * 列出所有活跃账号
 */
async function listAccounts() {
  console.log('📋 正在获取所有 Claude 账号...\n')

  const officialAccounts = await claudeAccountService.getAllAccounts()
  const consoleAccounts = await claudeConsoleAccountService.getAllAccounts()

  const allAccounts = [
    ...officialAccounts.map((acc) => ({ ...acc, accountType: 'claude-official' })),
    ...consoleAccounts.map((acc) => ({ ...acc, accountType: 'claude-console' }))
  ]

  if (allAccounts.length === 0) {
    console.log('⚠️  没有找到任何账号')
    return
  }

  console.log(`找到 ${allAccounts.length} 个账号:\n`)

  for (const account of allAccounts) {
    const statusIcon = account.status === 'active' && account.isActive === 'true' ? '✅' : '⏸️ '
    const subscriptionInfo = account.subscriptionInfo ? JSON.parse(account.subscriptionInfo) : null
    const monthlyLimit = subscriptionInfo?.monthlyLimit || 'N/A'

    console.log(`${statusIcon} ${account.name}`)
    console.log(`   ID: ${account.id}`)
    console.log(`   类型: ${account.accountType || account.platform}`)
    console.log(`   状态: ${account.status} (${account.isActive === 'true' ? '激活' : '未激活'})`)
    console.log(`   月度限额: ${monthlyLimit} USD`)
    console.log()
  }
}

/**
 * 设置账号使用量（模拟）
 * @param {string} accountId - 账号ID
 * @param {number} usagePercent - 使用百分比 (0-100)
 */
async function setAccountUsage(accountId, usagePercent) {
  console.log(`📊 正在为账号 ${accountId} 设置使用量为 ${usagePercent}%...\n`)

  // 获取账号信息
  let account = await claudeAccountService.getAccountById(accountId)
  if (!account) {
    account = await claudeConsoleAccountService.getAccountById(accountId)
  }

  if (!account) {
    console.error(`❌ 账号 ${accountId} 不存在`)
    return
  }

  // 解析订阅信息
  const subscriptionInfo = account.subscriptionInfo ? JSON.parse(account.subscriptionInfo) : null
  if (!subscriptionInfo || !subscriptionInfo.monthlyLimit) {
    console.error(`❌ 账号 ${account.name} 没有配置月度限额`)
    console.log(
      '   提示: 请在 Web 界面中为该账号设置 subscriptionInfo，格式如: {"monthlyLimit": 100}'
    )
    return
  }

  const monthlyLimit = subscriptionInfo.monthlyLimit
  const targetCost = (monthlyLimit * usagePercent) / 100

  console.log(`账号信息:`)
  console.log(`  名称: ${account.name}`)
  console.log(`  月度限额: ${monthlyLimit} USD`)
  console.log(`  目标使用量: ${targetCost.toFixed(2)} USD (${usagePercent}%)`)
  console.log()

  // 获取当前月份
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const currentMonth = `${year}-${month}`

  // 设置月度使用统计
  const usageKey = `account_usage:monthly:${accountId}:${currentMonth}`
  await redis.hset(usageKey, {
    totalCost: targetCost.toString(),
    inputTokens: '1000000',
    outputTokens: '500000',
    requestCount: '100'
  })

  // 同时设置总使用统计
  const totalUsageKey = `account_usage:${accountId}`
  await redis.hset(totalUsageKey, {
    totalCost: targetCost.toString(),
    inputTokens: '1000000',
    outputTokens: '500000',
    requestCount: '100'
  })

  console.log(`✅ 已设置账号使用量: ${targetCost.toFixed(2)} USD`)
  console.log(`   Redis键: ${usageKey}`)
  console.log()
  console.log('💡 提示: 运行 --trigger 触发告警检查')
}

/**
 * 手动触发告警检查
 */
async function triggerCheck() {
  console.log('🔍 正在手动触发使用额度检查...\n')
  await usageAlertService.triggerCheck()
  console.log('\n✅ 检查完成')
}

/**
 * 清除账号告警历史
 * @param {string} accountId - 账号ID
 */
async function clearHistory(accountId) {
  console.log(`🧹 正在清除账号 ${accountId} 的告警历史...\n`)
  await usageAlertService.clearAlertHistory(accountId)
  console.log('✅ 告警历史已清除，可以重新发送告警')
}

/**
 * 主函数
 */
async function main() {
  try {
    const options = parseArgs()

    // 连接 Redis
    console.log('🔗 正在连接 Redis...')
    await redis.connect()
    console.log('✅ Redis 连接成功\n')

    // 执行操作
    if (options.listAccounts) {
      await listAccounts()
    } else if (options.accountId && options.usagePercent !== null) {
      await setAccountUsage(options.accountId, options.usagePercent)
    } else if (options.trigger) {
      await triggerCheck()
    } else if (options.clearHistory) {
      await clearHistory(options.clearHistory)
    } else {
      console.error('❌ 请指定操作选项')
      showHelp()
      process.exit(1)
    }

    // 断开 Redis
    await redis.disconnect()
    console.log('\n👋 测试完成')
    process.exit(0)
  } catch (error) {
    console.error('❌ 测试失败:', error)
    logger.error('Test failed:', error)
    process.exit(1)
  }
}

// 运行主函数
main()
