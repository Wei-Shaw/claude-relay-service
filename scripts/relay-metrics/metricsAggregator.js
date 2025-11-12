const NUMBER_ZERO = 0

const TOTAL_USAGE_METRICS = [
  { name: 'relay_requests_total', path: ['usage', 'total', 'requests'] },
  { name: 'relay_tokens_total', path: ['usage', 'total', 'allTokens'] },
  { name: 'relay_cost_total_usd', path: ['usage', 'total', 'cost'] },
  { name: 'relay_input_tokens_total', path: ['usage', 'total', 'inputTokens'] },
  { name: 'relay_output_tokens_total', path: ['usage', 'total', 'outputTokens'] },
  { name: 'relay_cache_create_tokens_total', path: ['usage', 'total', 'cacheCreateTokens'] },
  { name: 'relay_cache_read_tokens_total', path: ['usage', 'total', 'cacheReadTokens'] }
]

const RATE_WINDOW_METRICS = [
  { name: 'relay_current_window_requests', path: ['limits', 'currentWindowRequests'] },
  { name: 'relay_current_window_tokens', path: ['limits', 'currentWindowTokens'] },
  { name: 'relay_current_window_cost_usd', path: ['limits', 'currentWindowCost'] },
  { name: 'relay_current_window_seconds_remaining', path: ['limits', 'windowRemainingSeconds'] },
  { name: 'relay_rate_limit_requests_limit', path: ['limits', 'rateLimitRequests'] },
  { name: 'relay_rate_limit_window_minutes', path: ['limits', 'rateLimitWindow'] },
  { name: 'relay_rate_limit_cost_limit_usd', path: ['limits', 'rateLimitCost'] }
]

const COST_LIMIT_METRICS = [
  { name: 'relay_daily_cost_usd', path: ['limits', 'currentDailyCost'] },
  { name: 'relay_daily_cost_limit_usd', path: ['limits', 'dailyCostLimit'] },
  { name: 'relay_total_cost_limit_usd', path: ['limits', 'totalCostLimit'] },
  { name: 'relay_weekly_opus_cost_usd', path: ['limits', 'weeklyOpusCost'] },
  { name: 'relay_weekly_opus_cost_limit_usd', path: ['limits', 'weeklyOpusCostLimit'] }
]

const CAPACITY_LIMIT_METRICS = [
  { name: 'relay_token_limit', path: ['limits', 'tokenLimit'] },
  { name: 'relay_concurrency_limit', path: ['limits', 'concurrencyLimit'] }
]

const METRIC_CONFIGS = [
  ...TOTAL_USAGE_METRICS,
  ...RATE_WINDOW_METRICS,
  ...COST_LIMIT_METRICS,
  ...CAPACITY_LIMIT_METRICS
]

const MODEL_TOKEN_METRIC = 'relay_model_tokens'
const MODEL_COST_METRIC = 'relay_model_cost_usd'

function readNumber(source, path) {
  return path.reduce((cursor, key) => {
    if (cursor && typeof cursor === 'object') {
      return cursor[key]
    }
    return undefined
  }, source)
}

function coerceNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }
  return NUMBER_ZERO
}

function deriveMetrics({ userStats = {}, modelStats = [] }) {
  const samples = []

  for (const metric of METRIC_CONFIGS) {
    const rawValue = readNumber(userStats, metric.path)
    samples.push({
      name: metric.name,
      value: coerceNumber(rawValue),
      attributes: {}
    })
  }

  for (const modelStat of modelStats) {
    if (!modelStat || typeof modelStat !== 'object') {
      continue
    }

    const modelName = typeof modelStat.model === 'string' ? modelStat.model : 'unknown'

    samples.push({
      name: MODEL_TOKEN_METRIC,
      value: coerceNumber(modelStat.allTokens),
      attributes: { model: modelName }
    })

    const totalCost = modelStat.costs && modelStat.costs.total
    samples.push({
      name: MODEL_COST_METRIC,
      value: coerceNumber(totalCost),
      attributes: { model: modelName }
    })
  }

  return samples
}

module.exports = deriveMetrics
