#!/usr/bin/env node

/**
 * 修复 Opus 4.5 存量数据的成本计算
 *
 * 问题：存量数据在写入时使用了 Opus 4.1 的价格（$30/MTok for 1h cache），
 * 但 Opus 4.5 的正确价格是 $10/MTok for 1h cache。
 *
 * 修复内容：
 *   - Phase 1: 修复 usage:records:* 中的成本字段
 *   - Phase 2: 回填聚合数据中缺失的 ephemeral tokens（可选）
 *   - Phase 3: 重新计算 usage:cost:* 成本聚合数据（daily/monthly/hourly/total）
 *
 * 用法：
 *   node scripts/fix-opus45-pricing.js --dry-run    # 干跑模式，只显示会修改的内容
 *   node scripts/fix-opus45-pricing.js              # 实际执行修复（Phase 1 + 3）
 *   node scripts/fix-opus45-pricing.js --backfill   # 包含 Phase 2 回填 ephemeral tokens
 *   node scripts/fix-opus45-pricing.js --fix-cost   # 仅执行 Phase 3（跳过 Phase 1&2）
 */

require('dotenv').config()
const Redis = require('ioredis')

// Opus 4.5 正确价格 (per token)
const OPUS_45_PRICING = {
  input: 0.000005, // $5/MTok
  output: 0.000025, // $25/MTok
  cache5m: 0.00000625, // $6.25/MTok
  cache1h: 0.00001, // $10/MTok
  cacheRead: 0.0000005 // $0.50/MTok
}

// 检查是否是 Opus 4.5 模型
function isOpus45Model(model) {
  if (!model) {
    return false
  }
  const modelLower = model.toLowerCase()
  return modelLower.includes('opus-4-5') || modelLower.includes('opus-4.5')
}

// 重新计算成本
function recalculateCost(record) {
  const inputTokens = record.inputTokens || 0
  const outputTokens = record.outputTokens || 0
  const ephemeral5mTokens = record.ephemeral5mTokens || 0
  const ephemeral1hTokens = record.ephemeral1hTokens || 0
  const cacheReadTokens = record.cacheReadTokens || 0

  const inputCost = inputTokens * OPUS_45_PRICING.input
  const outputCost = outputTokens * OPUS_45_PRICING.output
  const ephemeral5mCost = ephemeral5mTokens * OPUS_45_PRICING.cache5m
  const ephemeral1hCost = ephemeral1hTokens * OPUS_45_PRICING.cache1h
  const cacheReadCost = cacheReadTokens * OPUS_45_PRICING.cacheRead

  // cacheCreate 是 5m + 1h 的总成本
  const cacheCreateCost = ephemeral5mCost + ephemeral1hCost

  const totalCost = inputCost + outputCost + cacheCreateCost + cacheReadCost

  return {
    cost: Number(totalCost.toFixed(6)),
    costBreakdown: {
      input: Number(inputCost.toFixed(6)),
      output: Number(outputCost.toFixed(6)),
      cacheCreate: Number(cacheCreateCost.toFixed(6)),
      cacheRead: Number(cacheReadCost.toFixed(6)),
      ephemeral5m: Number(ephemeral5mCost.toFixed(6)),
      ephemeral1h: Number(ephemeral1hCost.toFixed(6))
    }
  }
}

// 修复单条记录
async function fixUsageRecords(redis, isDryRun) {
  console.log('\n📋 Phase 1: 修复使用记录中的成本')
  console.log('─'.repeat(50))

  const keys = await redis.keys('usage:records:*')
  console.log(`找到 ${keys.length} 个 API Key 的使用记录`)

  let totalRecords = 0
  let opus45Records = 0
  let modifiedRecords = 0
  let totalCostDiff = 0

  for (const key of keys) {
    const keyId = key.replace('usage:records:', '')
    const records = await redis.lrange(key, 0, -1)

    const updatedRecords = []
    let keyModified = false

    for (let i = 0; i < records.length; i++) {
      totalRecords++
      const record = JSON.parse(records[i])

      if (isOpus45Model(record.model)) {
        opus45Records++

        const oldCost = record.cost || 0
        const newCostData = recalculateCost(record)

        // 检查是否有差异（容差 0.0001）
        if (Math.abs(oldCost - newCostData.cost) > 0.0001) {
          modifiedRecords++
          const costDiff = oldCost - newCostData.cost
          totalCostDiff += costDiff

          console.log(`  [${keyId}][${i}] ${record.model}`)
          console.log(`       时间: ${record.timestamp}`)
          console.log(
            `       旧成本: $${oldCost.toFixed(6)} -> 新成本: $${newCostData.cost.toFixed(6)}`
          )
          console.log(`       差异: $${costDiff.toFixed(6)}`)

          // 更新记录
          record.cost = newCostData.cost
          record.costBreakdown = newCostData.costBreakdown
          keyModified = true
        }
      }

      updatedRecords.push(JSON.stringify(record))
    }

    // 如果有修改且不是干跑模式，更新 Redis
    if (keyModified && !isDryRun) {
      const multi = redis.multi()
      multi.del(key)
      if (updatedRecords.length > 0) {
        multi.rpush(key, ...updatedRecords)
      }
      await multi.exec()
    }
  }

  console.log(`\n  总记录数: ${totalRecords}`)
  console.log(`  Opus 4.5 记录数: ${opus45Records}`)
  console.log(`  需要修复的记录数: ${modifiedRecords}`)
  console.log(`  总成本差异: $${totalCostDiff.toFixed(6)} (正数表示之前多算了)`)

  return { totalRecords, opus45Records, modifiedRecords, totalCostDiff }
}

// 回填聚合数据中缺失的 ephemeral tokens
async function backfillAggregatedData(redis, isDryRun) {
  console.log('\n📋 Phase 2: 回填聚合数据中的 ephemeral tokens')
  console.log('─'.repeat(50))

  // 检查的聚合键模式
  const patterns = [
    'usage:*:model:daily:*',
    'usage:*:model:monthly:*',
    'usage:model:daily:*',
    'usage:model:monthly:*',
    'account_usage:model:daily:*',
    'account_usage:model:monthly:*'
  ]

  let totalKeys = 0
  let keysWithMissingEphemeral = 0
  let keysFixed = 0

  for (const pattern of patterns) {
    const keys = await redis.keys(pattern)

    for (const key of keys) {
      totalKeys++
      const data = await redis.hgetall(key)

      if (!data || Object.keys(data).length === 0) {
        continue
      }

      // 检查是否有 cacheCreateTokens 但没有 ephemeral tokens
      const cacheCreateTokens = parseInt(data.cacheCreateTokens) || 0
      const ephemeral5mTokens = parseInt(data.ephemeral5mTokens) || 0
      const ephemeral1hTokens = parseInt(data.ephemeral1hTokens) || 0

      if (cacheCreateTokens > 0 && ephemeral5mTokens === 0 && ephemeral1hTokens === 0) {
        keysWithMissingEphemeral++

        // 假设全部是 1h cache（因为 Claude Code 默认使用 1h cache）
        // 这是一个合理的假设，因为 5m cache 很少使用
        console.log(`  缺失 ephemeral: ${key}`)
        console.log(`       cacheCreateTokens: ${cacheCreateTokens}, 将设置为 ephemeral1hTokens`)

        if (!isDryRun) {
          await redis.hset(key, 'ephemeral1hTokens', cacheCreateTokens)
          await redis.hset(key, 'ephemeral5mTokens', 0)
          keysFixed++
        }
      }
    }
  }

  console.log(`\n  扫描的聚合键数: ${totalKeys}`)
  console.log(`  缺失 ephemeral tokens 的键数: ${keysWithMissingEphemeral}`)
  if (!isDryRun) {
    console.log(`  已修复的键数: ${keysFixed}`)
  }

  return { totalKeys, keysWithMissingEphemeral, keysFixed }
}

// Phase 3: 修正成本聚合数据（只减去 Opus 4.5 的差异，不重算整个 total）
async function recalculateCostAggregates(redis, isDryRun) {
  console.log('\n📋 Phase 3: 修正成本聚合数据 (usage:cost:*)')
  console.log('─'.repeat(50))
  console.log('注意: 只修正 Opus 4.5 造成的差异，不会重算整个历史累计')

  // 从 usage:records:* 获取所有有记录的 API Key
  const recordKeys = await redis.keys('usage:records:*')
  const apiKeyIds = recordKeys.map((k) => k.replace('usage:records:', ''))

  console.log(`找到 ${apiKeyIds.length} 个 API Key (从 usage:records:* 获取)`)

  let totalKeysProcessed = 0
  let keysWithChanges = 0
  let totalCostReduction = 0

  for (const keyId of apiKeyIds) {
    // 从 usage:records:* 获取该 Key 的所有记录
    const recordsKey = `usage:records:${keyId}`
    const records = await redis.lrange(recordsKey, 0, -1)

    if (records.length === 0) {
      continue
    }

    totalKeysProcessed++

    // 只计算 Opus 4.5 记录的成本差异（按时间维度）
    const dailyCostDiff = new Map() // date -> costDiff
    const monthlyCostDiff = new Map() // month -> costDiff
    const hourlyCostDiff = new Map() // hour -> costDiff
    let totalCostDiff = 0

    for (const recordStr of records) {
      const record = JSON.parse(recordStr)

      // 只处理 Opus 4.5 记录
      if (!isOpus45Model(record.model)) {
        continue
      }

      const oldCost = record.cost || 0
      const newCostData = recalculateCost(record)
      const costDiff = oldCost - newCostData.cost // 正数表示之前多算了

      // 跳过没有差异的记录
      if (Math.abs(costDiff) <= 0.0001) {
        continue
      }

      // 获取时间戳
      const timestamp = new Date(record.timestamp)
      const date = timestamp.toISOString().split('T')[0] // YYYY-MM-DD
      const month = date.substring(0, 7) // YYYY-MM
      const hour = `${date}:${String(timestamp.getUTCHours()).padStart(2, '0')}` // YYYY-MM-DD:HH

      // 累加差异到各个维度
      dailyCostDiff.set(date, (dailyCostDiff.get(date) || 0) + costDiff)
      monthlyCostDiff.set(month, (monthlyCostDiff.get(month) || 0) + costDiff)
      hourlyCostDiff.set(hour, (hourlyCostDiff.get(hour) || 0) + costDiff)
      totalCostDiff += costDiff
    }

    // 如果这个 Key 有 Opus 4.5 的成本差异
    if (Math.abs(totalCostDiff) > 0.0001) {
      keysWithChanges++
      totalCostReduction += totalCostDiff

      // 获取当前 Redis 中的总成本
      const currentTotalKey = `usage:cost:total:${keyId}`
      const currentTotal = parseFloat((await redis.get(currentTotalKey)) || '0')
      const newTotal = currentTotal - totalCostDiff

      console.log(`\n  [${keyId}]`)
      console.log(`       Opus 4.5 成本差异: $${totalCostDiff.toFixed(6)}`)
      console.log(
        `       当前总成本: $${currentTotal.toFixed(6)} -> 修正后: $${newTotal.toFixed(6)}`
      )

      if (!isDryRun) {
        const multi = redis.multi()

        // 修正 daily 成本（减去差异）
        for (const [date, diff] of dailyCostDiff) {
          const dailyKey = `usage:cost:daily:${keyId}:${date}`
          const currentDaily = parseFloat((await redis.get(dailyKey)) || '0')
          const newDaily = Math.max(0, currentDaily - diff) // 确保不会变成负数
          multi.set(dailyKey, newDaily.toFixed(6))
          multi.expire(dailyKey, 86400 * 30) // 30天
        }

        // 修正 monthly 成本（减去差异）
        for (const [month, diff] of monthlyCostDiff) {
          const monthlyKey = `usage:cost:monthly:${keyId}:${month}`
          const currentMonthly = parseFloat((await redis.get(monthlyKey)) || '0')
          const newMonthly = Math.max(0, currentMonthly - diff)
          multi.set(monthlyKey, newMonthly.toFixed(6))
          multi.expire(monthlyKey, 86400 * 90) // 90天
        }

        // 修正 hourly 成本（减去差异）
        for (const [hour, diff] of hourlyCostDiff) {
          const hourlyKey = `usage:cost:hourly:${keyId}:${hour}`
          const currentHourly = parseFloat((await redis.get(hourlyKey)) || '0')
          const newHourly = Math.max(0, currentHourly - diff)
          multi.set(hourlyKey, newHourly.toFixed(6))
          multi.expire(hourlyKey, 86400 * 7) // 7天
        }

        // 修正 total 成本（减去差异）
        multi.set(currentTotalKey, Math.max(0, newTotal).toFixed(6))

        await multi.exec()
        console.log(`       ✅ 已修正`)
      }
    }
  }

  console.log(`\n  处理的 API Key 数: ${totalKeysProcessed}`)
  console.log(`  有 Opus 4.5 差异的 API Key 数: ${keysWithChanges}`)
  console.log(`  总成本修正: $${totalCostReduction.toFixed(6)} (减少)`)

  return { totalKeysProcessed, keysWithChanges, totalCostReduction }
}

async function main() {
  const isDryRun = process.argv.includes('--dry-run')
  const doBackfill = process.argv.includes('--backfill')
  const fixCostOnly = process.argv.includes('--fix-cost')

  console.log('========================================')
  console.log('Opus 4.5 价格修复脚本')
  console.log('========================================')
  console.log(`模式: ${isDryRun ? '🔍 干跑模式 (不会修改数据)' : '⚡ 执行模式'}`)
  console.log(`回填聚合数据: ${doBackfill ? '✅ 是' : '❌ 否 (使用 --backfill 启用)'}`)
  console.log(`仅修复成本聚合: ${fixCostOnly ? '✅ 是' : '❌ 否 (使用 --fix-cost 跳过 Phase 1&2)'}`)

  // 连接 Redis
  const redis = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB) || 0
  })

  try {
    let recordStats = null
    let aggregateStats = null
    let costStats = null

    if (!fixCostOnly) {
      // Phase 1: 修复使用记录
      recordStats = await fixUsageRecords(redis, isDryRun)

      // Phase 2: 回填聚合数据（可选）
      if (doBackfill) {
        aggregateStats = await backfillAggregatedData(redis, isDryRun)
      }
    }

    // Phase 3: 重新计算成本聚合数据
    costStats = await recalculateCostAggregates(redis, isDryRun)

    // 总结
    console.log('\n========================================')
    console.log('修复总结')
    console.log('========================================')

    if (recordStats) {
      console.log('\n📊 Phase 1 - 使用记录:')
      console.log(`   总记录数: ${recordStats.totalRecords}`)
      console.log(`   Opus 4.5 记录数: ${recordStats.opus45Records}`)
      console.log(`   需要修复的记录数: ${recordStats.modifiedRecords}`)
      console.log(`   总成本差异: $${recordStats.totalCostDiff.toFixed(6)}`)
    }

    if (aggregateStats) {
      console.log('\n📊 Phase 2 - 聚合数据回填:')
      console.log(`   扫描的键数: ${aggregateStats.totalKeys}`)
      console.log(`   缺失 ephemeral 的键数: ${aggregateStats.keysWithMissingEphemeral}`)
      if (!isDryRun) {
        console.log(`   已修复的键数: ${aggregateStats.keysFixed}`)
      }
    }

    if (costStats) {
      console.log('\n📊 Phase 3 - 成本聚合数据:')
      console.log(`   处理的 API Key 数: ${costStats.totalKeysProcessed}`)
      console.log(`   有变化的 API Key 数: ${costStats.keysWithChanges}`)
      console.log(`   总成本减少: $${costStats.totalCostReduction.toFixed(6)}`)
    }

    console.log('')
    if (isDryRun) {
      console.log('💡 这是干跑模式，没有实际修改数据。')
      console.log('   要执行修复，请运行: node scripts/fix-opus45-pricing.js')
      if (!doBackfill) {
        console.log('   要同时回填聚合数据，请添加 --backfill 参数')
      }
      console.log('   要仅修复成本聚合，请添加 --fix-cost 参数')
    } else {
      console.log('✅ 修复完成！')
    }
  } catch (error) {
    console.error('❌ 错误:', error)
    process.exit(1)
  } finally {
    await redis.quit()
  }
}

main()
