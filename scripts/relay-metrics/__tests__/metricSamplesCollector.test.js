const MetricSamplesCollector = require('../metricSamplesCollector')

class RecordingClient {
  constructor(response) {
    this.response = response
    this.callCount = 0
  }

  async fetchCombinedStats() {
    this.callCount += 1
    return this.response
  }
}

describe('MetricSamplesCollector', () => {
  it('fetches stats and converts them into metric samples', async () => {
    const stats = {
      userStats: { usage: { total: { requests: 2, allTokens: 3, cost: 4 } } },
      modelStats: [{ model: 'm', allTokens: 3, costs: { total: 4 } }]
    }

    const client = new RecordingClient(stats)
    const calls = []
    const deriveMetrics = (input) => {
      calls.push(input)
      return [{ name: 'metric', value: 1, attributes: {} }]
    }

    const collector = new MetricSamplesCollector({ statsClient: client, deriveMetrics })

    const snapshot = await collector.collect()

    expect(snapshot).toEqual({
      stats,
      metrics: [{ name: 'metric', value: 1, attributes: {} }]
    })
    expect(client.callCount).toBe(1)
    expect(calls).toEqual([stats])
  })
})
