const redis = require('../models/redis')
const pricingService = require('../services/pricingService')
const CostCalculator = require('./costCalculator')

function toNumber(value) {
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}

async function updateRateLimitCounters(rateLimitInfo, usageSummary, model) {
  if (!rateLimitInfo) {
    return { totalTokens: 0, totalCost: 0 }
  }

  const client = redis.getClient()
  if (!client) {
    throw new Error('Redis 未连接，无法更新限流计数')
  }

  const inputTokens = toNumber(usageSummary.inputTokens)
  const outputTokens = toNumber(usageSummary.outputTokens)
  const cacheCreateTokens = toNumber(usageSummary.cacheCreateTokens)
  const cacheReadTokens = toNumber(usageSummary.cacheReadTokens)

  const totalTokens = inputTokens + outputTokens + cacheCreateTokens + cacheReadTokens

  if (totalTokens > 0 && rateLimitInfo.tokenCountKey) {
    await client.incrby(rateLimitInfo.tokenCountKey, Math.round(totalTokens))
  }

  let totalCost = 0
  const options = arguments.length >= 4 ? arguments[3] : null
  const hasCostOverrideKey =
    options && Object.prototype.hasOwnProperty.call(options, 'costOverride')
  const overrideRaw = hasCostOverrideKey ? options.costOverride : undefined
  const overrideNum = Number(overrideRaw)
  const useCostOverride = hasCostOverrideKey && Number.isFinite(overrideNum)
  if (useCostOverride) {
    totalCost = Math.max(0, overrideNum)
  }
  const usagePayload = {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cache_creation_input_tokens: cacheCreateTokens,
    cache_read_input_tokens: cacheReadTokens
  }

  if (!useCostOverride) {
    try {
      const costInfo = pricingService.calculateCost(usagePayload, model)
      const { totalCost: calculatedCost } = costInfo || {}
      if (typeof calculatedCost === 'number') {
        totalCost = calculatedCost
      }
    } catch (error) {
      // 忽略此处错误，后续使用备用计算
      totalCost = 0
    }

    if (totalCost === 0) {
      try {
        const fallback = CostCalculator.calculateCost(usagePayload, model)
        const { costs } = fallback || {}
        if (costs && typeof costs.total === 'number') {
          totalCost = costs.total
        }
      } catch (error) {
        totalCost = 0
      }
    }
  }

  if (totalCost > 0 && rateLimitInfo.costCountKey) {
    await client.incrbyfloat(rateLimitInfo.costCountKey, totalCost)
  }

  return { totalTokens, totalCost }
}

module.exports = {
  updateRateLimitCounters
}
