#!/usr/bin/env node

/**
 * 费用数据修复脚本
 *
 * 功能：
 * 1. 扫描所有 API Key
 * 2. 对比累计总费用 (usage:cost:total) 与月度费用总和
 * 3. 发现差异时报告并可选择性修复
 * 4. 生成详细的修复报告
 */

const redis = require('../src/models/redis')
const logger = require('../src/utils/logger')

// 配置项
const config = {
  dryRun: process.argv.includes('--dry-run'), // 试运行模式，不实际修复
  autoFix: process.argv.includes('--auto-fix'), // 自动修复模式
  threshold: 0.01, // 差异阈值（美元），低于此值不报告
  verbose: process.argv.includes('--verbose') // 详细输出
}

// 存储结果
const results = {
  total: 0,
  checked: 0,
  mismatched: 0,
  fixed: 0,
  errors: 0,
  details: []
}

/**
 * 获取 API Key 的所有月度费用并计算总和
 */
async function getMonthlyTotalCost(keyId) {
  try {
    const client = redis.getClientSafe()

    // 查找所有月度费用键
    const monthlyKeys = await client.keys(`usage:cost:monthly:${keyId}:*`)

    if (monthlyKeys.length === 0) {
      return { total: 0, months: [] }
    }

    let total = 0
    const months = []

    for (const key of monthlyKeys) {
      const cost = await client.get(key)
      const costValue = parseFloat(cost || 0)

      // 从键名中提取月份：usage:cost:monthly:{keyId}:{YYYY-MM}
      const match = key.match(/:(\d{4}-\d{2})$/)
      const month = match ? match[1] : 'unknown'

      total += costValue
      months.push({ month, cost: costValue })
    }

    return { total, months }
  } catch (error) {
    logger.error(`获取月度费用失败 (keyId: ${keyId}):`, error)
    throw error
  }
}

/**
 * 获取累计总费用
 */
async function getTotalCost(keyId) {
  try {
    const client = redis.getClientSafe()
    const cost = await client.get(`usage:cost:total:${keyId}`)
    return parseFloat(cost || 0)
  } catch (error) {
    logger.error(`获取累计总费用失败 (keyId: ${keyId}):`, error)
    throw error
  }
}

/**
 * 修复累计总费用
 */
async function fixTotalCost(keyId, correctValue) {
  try {
    const client = redis.getClientSafe()
    await client.set(`usage:cost:total:${keyId}`, correctValue.toString())
    return true
  } catch (error) {
    logger.error(`修复累计总费用失败 (keyId: ${keyId}):`, error)
    return false
  }
}

/**
 * 检查并修复单个 API Key
 */
async function checkAndFixApiKey(keyId, keyName) {
  try {
    results.checked++

    // 获取月度费用总和
    const monthlyData = await getMonthlyTotalCost(keyId)
    const monthlyTotal = monthlyData.total

    // 获取累计总费用
    const totalCost = await getTotalCost(keyId)

    // 计算差异
    const diff = Math.abs(monthlyTotal - totalCost)

    // 如果差异小于阈值，跳过
    if (diff < config.threshold) {
      if (config.verbose) {
        console.log(`✅ ${keyName} (${keyId}): 费用一致 $${totalCost.toFixed(4)}`)
      }
      return
    }

    // 发现差异
    results.mismatched++

    const detail = {
      keyId,
      keyName,
      totalCost: totalCost.toFixed(4),
      monthlyTotal: monthlyTotal.toFixed(4),
      diff: diff.toFixed(4),
      months: monthlyData.months,
      fixed: false
    }

    console.log(`\n⚠️  发现费用差异：${keyName}`)
    console.log(`   Key ID: ${keyId}`)
    console.log(`   累计总费用: $${totalCost.toFixed(4)}`)
    console.log(`   月度费用总和: $${monthlyTotal.toFixed(4)}`)
    console.log(`   差异: $${diff.toFixed(4)}`)
    console.log(`   月度明细:`)
    monthlyData.months.forEach((m) => {
      console.log(`     - ${m.month}: $${m.cost.toFixed(4)}`)
    })

    // 执行修复
    if (config.autoFix && !config.dryRun) {
      const success = await fixTotalCost(keyId, monthlyTotal)
      if (success) {
        detail.fixed = true
        results.fixed++
        console.log(`   ✅ 已修复为: $${monthlyTotal.toFixed(4)}`)
      } else {
        console.log(`   ❌ 修复失败`)
      }
    } else if (config.dryRun) {
      console.log(`   🔍 [试运行] 将修复为: $${monthlyTotal.toFixed(4)}`)
    } else {
      console.log(`   💡 建议: 运行 --auto-fix 参数自动修复`)
    }

    results.details.push(detail)
  } catch (error) {
    results.errors++
    console.error(`❌ 检查失败：${keyName} (${keyId})`, error.message)
  }
}

/**
 * 主函数
 */
async function main() {
  console.log('🔍 费用数据修复脚本')
  console.log('==================\n')

  if (config.dryRun) {
    console.log('⚠️  试运行模式：只检查不修复\n')
  } else if (config.autoFix) {
    console.log('🔧 自动修复模式：发现问题将自动修复\n')
  } else {
    console.log('📊 检查模式：只报告问题不修复\n')
  }

  try {
    // 连接 Redis
    await redis.connect()
    console.log('✅ 已连接到 Redis\n')

    // 获取所有 API Key
    const client = redis.getClientSafe()
    const apiKeyKeys = await client.keys('apikey:*')

    console.log(`📋 找到 ${apiKeyKeys.length} 个 API Key 相关的键\n`)

    // 过滤掉 hash_map
    const validKeys = apiKeyKeys.filter((key) => key !== 'apikey:hash_map')
    results.total = validKeys.length

    console.log(`开始检查 ${results.total} 个 API Key...\n`)

    // 逐个检查
    for (const key of validKeys) {
      const keyId = key.replace('apikey:', '')
      const keyData = await client.hgetall(key)
      const keyName = keyData.name || 'Unknown'

      await checkAndFixApiKey(keyId, keyName)
    }

    // 输出总结
    console.log('\n\n📊 检查完成！')
    console.log('==================')
    console.log(`总计: ${results.total} 个 API Key`)
    console.log(`已检查: ${results.checked} 个`)
    console.log(`发现差异: ${results.mismatched} 个`)
    console.log(`已修复: ${results.fixed} 个`)
    console.log(`错误: ${results.errors} 个`)

    if (results.mismatched > 0 && !config.autoFix && !config.dryRun) {
      console.log('\n💡 提示：运行 `npm run fix:cost -- --auto-fix` 自动修复所有问题')
    }

    if (config.dryRun) {
      console.log('\n⚠️  这是试运行结果，没有实际修改数据')
    }

    // 断开连接
    await redis.disconnect()

    // 退出码
    process.exit(results.errors > 0 ? 1 : 0)
  } catch (error) {
    console.error('\n❌ 脚本执行失败:', error)
    process.exit(1)
  }
}

// 显示帮助信息
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
费用数据修复脚本

用法:
  node scripts/fix-cost-total.js [选项]

选项:
  --dry-run      试运行模式，只检查不修复
  --auto-fix     自动修复模式，发现问题立即修复
  --verbose      详细输出模式，显示所有检查结果
  --help, -h     显示此帮助信息

示例:
  # 只检查不修复
  node scripts/fix-cost-total.js

  # 试运行，查看将要修复的内容
  node scripts/fix-cost-total.js --dry-run

  # 自动修复所有问题
  node scripts/fix-cost-total.js --auto-fix

  # 详细输出模式
  node scripts/fix-cost-total.js --verbose --auto-fix
`)
  process.exit(0)
}

// 运行主函数
main()
