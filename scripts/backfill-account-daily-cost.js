#!/usr/bin/env node

const redis = require('../src/models/redis')
const logger = require('../src/utils/logger')
const CostCalculator = require('../src/utils/costCalculator')

const parseDateArg = () => {
  const raw = process.argv[2]
  if (!raw) {
    return redis.getDateStringInTimezone()
  }
  return raw
}

async function backfillAccountDailyCost(dateStr) {
  const client = redis.getClientSafe()
  const pattern = `account_usage:model:daily:*:*:${dateStr}`

  logger.info(`🧮 Backfill account daily cost: date=${dateStr}, pattern=${pattern}`)

  const modelKeys = await redis.scanKeys(pattern)
  logger.info(`🔎 Found ${modelKeys.length} model daily keys for ${dateStr}`)

  if (!modelKeys.length) {
    return { date: dateStr, accounts: 0, keys: 0 }
  }

  const accountCostMap = {}
  const chunkSize = 500

  for (let offset = 0; offset < modelKeys.length; offset += chunkSize) {
    const chunkKeys = modelKeys.slice(offset, offset + chunkSize)
    const pipeline = client.pipeline()
    chunkKeys.forEach((key) => pipeline.hgetall(key))
    const results = await pipeline.exec()

    for (let i = 0; i < chunkKeys.length; i++) {
      const key = chunkKeys[i]
      const modelUsage = results?.[i]?.[1]
      if (!modelUsage || (!modelUsage.inputTokens && !modelUsage.outputTokens)) {
        continue
      }

      const parts = String(key).split(':')
      if (parts.length < 6) {
        continue
      }

      const accountId = parts[3]
      const model = parts.slice(4, -1).join(':')

      const usage = {
        input_tokens: parseInt(modelUsage.inputTokens || 0),
        output_tokens: parseInt(modelUsage.outputTokens || 0),
        cache_creation_input_tokens: parseInt(modelUsage.cacheCreateTokens || 0),
        cache_read_input_tokens: parseInt(modelUsage.cacheReadTokens || 0)
      }

      const costResult = CostCalculator.calculateCost(usage, model)
      const cost = costResult?.costs?.total || 0
      if (!Number.isFinite(cost) || cost <= 0) {
        continue
      }

      accountCostMap[accountId] = (accountCostMap[accountId] || 0) + cost
    }
  }

  const accountIds = Object.keys(accountCostMap)
  logger.info(`🧾 Calculated daily cost for ${accountIds.length} accounts`)

  const writeChunkSize = 500
  for (let offset = 0; offset < accountIds.length; offset += writeChunkSize) {
    const chunkAccountIds = accountIds.slice(offset, offset + writeChunkSize)
    const pipeline = client.pipeline()

    for (const accountId of chunkAccountIds) {
      const accountDailyKey = `account_usage:daily:${accountId}:${dateStr}`
      pipeline.hset(accountDailyKey, 'cost', accountCostMap[accountId])
      pipeline.expire(accountDailyKey, 86400 * 32)
    }

    await pipeline.exec()
  }

  logger.info(`✅ Backfill completed: date=${dateStr}, accounts=${accountIds.length}`)
  return { date: dateStr, accounts: accountIds.length, keys: modelKeys.length }
}

async function main() {
  const dateStr = parseDateArg()
  await redis.connect()
  const result = await backfillAccountDailyCost(dateStr)
  logger.info(`🎉 Done: ${JSON.stringify(result)}`)

  try {
    await redis.disconnect()
  } catch (error) {
    // ignore
  }
}

main().catch((error) => {
  logger.error('❌ Backfill failed:', error)
  process.exitCode = 1
})
