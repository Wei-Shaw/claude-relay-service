const deriveMetrics = require('../metricsAggregator')

describe('deriveMetrics', () => {
  it('produces gauge samples for totals and rate window data', () => {
    const userStats = {
      name: 'Key A',
      usage: {
        total: {
          requests: 123,
          allTokens: 4567,
          cost: 89.01,
          inputTokens: 2300,
          outputTokens: 2267,
          cacheCreateTokens: 100,
          cacheReadTokens: 50
        }
      },
      limits: {
        currentWindowRequests: 3,
        currentWindowTokens: 789,
        currentWindowCost: 1.23,
        currentDailyCost: 4.56,
        windowRemainingSeconds: 600,
        rateLimitRequests: 42,
        rateLimitWindow: 2,
        rateLimitCost: 9.99,
        dailyCostLimit: 12.5,
        totalCostLimit: 1000,
        weeklyOpusCost: 5,
        weeklyOpusCostLimit: 10,
        tokenLimit: 100000,
        concurrencyLimit: 4
      }
    }

    const modelStats = [
      {
        model: 'claude-3-5-sonnet',
        allTokens: 3000,
        costs: { total: 42.42 }
      },
      {
        model: 'claude-3-5-haiku',
        allTokens: 1567,
        costs: { total: 12.34 }
      }
    ]

    const samples = deriveMetrics({ userStats, modelStats })

    expect(samples).toEqual(
      expect.arrayContaining([
        { name: 'relay_requests_total', value: 123, attributes: {} },
        { name: 'relay_tokens_total', value: 4567, attributes: {} },
        { name: 'relay_cost_total_usd', value: 89.01, attributes: {} },
        { name: 'relay_input_tokens_total', value: 2300, attributes: {} },
        { name: 'relay_output_tokens_total', value: 2267, attributes: {} },
        { name: 'relay_cache_create_tokens_total', value: 100, attributes: {} },
        { name: 'relay_cache_read_tokens_total', value: 50, attributes: {} },
        { name: 'relay_current_window_requests', value: 3, attributes: {} },
        { name: 'relay_current_window_tokens', value: 789, attributes: {} },
        { name: 'relay_current_window_cost_usd', value: 1.23, attributes: {} },
        { name: 'relay_current_window_seconds_remaining', value: 600, attributes: {} },
        { name: 'relay_rate_limit_requests_limit', value: 42, attributes: {} },
        { name: 'relay_rate_limit_window_minutes', value: 2, attributes: {} },
        { name: 'relay_rate_limit_cost_limit_usd', value: 9.99, attributes: {} },
        { name: 'relay_daily_cost_usd', value: 4.56, attributes: {} },
        { name: 'relay_daily_cost_limit_usd', value: 12.5, attributes: {} },
        { name: 'relay_total_cost_limit_usd', value: 1000, attributes: {} },
        { name: 'relay_weekly_opus_cost_usd', value: 5, attributes: {} },
        { name: 'relay_weekly_opus_cost_limit_usd', value: 10, attributes: {} },
        { name: 'relay_token_limit', value: 100000, attributes: {} },
        { name: 'relay_concurrency_limit', value: 4, attributes: {} },
        {
          name: 'relay_model_tokens',
          value: 3000,
          attributes: { model: 'claude-3-5-sonnet' }
        },
        {
          name: 'relay_model_cost_usd',
          value: 42.42,
          attributes: { model: 'claude-3-5-sonnet' }
        }
      ])
    )
  })

  it('replaces missing numeric fields with zero', () => {
    const samples = deriveMetrics({ userStats: {}, modelStats: [] })

    const lookup = Object.fromEntries(samples.map((sample) => [sample.name, sample.value]))

    expect(lookup).toMatchObject({
      relay_requests_total: 0,
      relay_tokens_total: 0,
      relay_cost_total_usd: 0,
      relay_input_tokens_total: 0,
      relay_output_tokens_total: 0,
      relay_cache_create_tokens_total: 0,
      relay_cache_read_tokens_total: 0,
      relay_current_window_requests: 0,
      relay_current_window_tokens: 0,
      relay_current_window_cost_usd: 0,
      relay_current_window_seconds_remaining: 0,
      relay_rate_limit_requests_limit: 0,
      relay_rate_limit_window_minutes: 0,
      relay_rate_limit_cost_limit_usd: 0,
      relay_daily_cost_usd: 0,
      relay_daily_cost_limit_usd: 0,
      relay_total_cost_limit_usd: 0,
      relay_weekly_opus_cost_usd: 0,
      relay_weekly_opus_cost_limit_usd: 0,
      relay_token_limit: 0,
      relay_concurrency_limit: 0
    })
  })
})
