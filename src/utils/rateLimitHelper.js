const redis = require('../models/redis')
const pricingService = require('../services/pricingService')
const CostCalculator = require('./costCalculator')

function toNumber(value) {
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}

// keyId 和 accountType 用于计算倍率成本
// preCalculatedCost: 可选的 { realCost, ratedCost }，由调用方提供以避免重复计算
async function updateRateLimitCounters(
  rateLimitInfo,
  usageSummary,
  model,
  keyId = null,
  accountType = null,
  preCalculatedCost = null
) {
  if (!rateLimitInfo) {
    return { totalTokens: 0, totalCost: 0, ratedCost: 0 }
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
  let ratedCost = 0

  if (
    preCalculatedCost &&
    typeof preCalculatedCost.ratedCost === 'number' &&
    preCalculatedCost.ratedCost > 0
  ) {
    // 使用调用方已计算好的费用（避免重复计算，且能正确处理 1h 缓存、Fast Mode 等特殊计费）
    // eslint-disable-next-line prefer-destructuring
    ratedCost = preCalculatedCost.ratedCost
    totalCost = preCalculatedCost.realCost || 0
  } else if (
    preCalculatedCost &&
    typeof preCalculatedCost.realCost === 'number' &&
    preCalculatedCost.realCost > 0
  ) {
    // 有 realCost 但 ratedCost 为 0 或缺失，使用 realCost
    totalCost = preCalculatedCost.realCost
    ratedCost = preCalculatedCost.realCost
  } else {
    // Legacy fallback：调用方未提供费用时自行计算（不支持 1h 缓存等特殊计费）
    const usagePayload = {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cache_creation_input_tokens: cacheCreateTokens,
      cache_read_input_tokens: cacheReadTokens
    }

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

    // 计算倍率成本（用于限流计数）
    ratedCost = totalCost
    if (totalCost > 0 && keyId) {
      try {
        const apiKeyService = require('../services/apiKeyService')
        const serviceRatesService = require('../services/serviceRatesService')
        const service = serviceRatesService.getService(accountType, model)
        ratedCost = await apiKeyService.calculateRatedCost(keyId, service, totalCost)
      } catch (error) {
        ratedCost = totalCost
      }
    }
  }

  if (ratedCost > 0 && rateLimitInfo.costCountKey) {
    await client.incrbyfloat(rateLimitInfo.costCountKey, ratedCost)
  }

  return { totalTokens, totalCost, ratedCost }
}

module.exports = {
  updateRateLimitCounters
}
