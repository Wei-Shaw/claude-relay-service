const RelayMetricsCollector = require('../relayMetricsCollector')

jest.mock('../metricSamplesCollector', () => {
  return jest.fn().mockImplementation(({ statsClient, deriveMetrics }) => {
    return {
      async collect() {
        const stats = await statsClient.fetchCombinedStats()
        return {
          stats,
          metrics: deriveMetrics(stats)
        }
      }
    }
  })
})

const MetricSamplesCollector = require('../metricSamplesCollector')

describe('RelayMetricsCollector', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.clearAllTimers()
    jest.useRealTimers()
    jest.clearAllMocks()
  })

  it('starts polling and exposes snapshots', async () => {
    const responses = [
      {
        userStats: { usage: { total: { requests: 1 } } },
        modelStats: []
      },
      {
        userStats: { usage: { total: { requests: 2 } } },
        modelStats: []
      }
    ]

    const statsClient = {
      fetchCombinedStats: jest.fn()
        .mockResolvedValueOnce(responses[0])
        .mockResolvedValueOnce(responses[1])
    }

    const deriveMetrics = jest
      .fn()
      .mockImplementation((data) => [{ name: 'relay_requests_total', value: data.userStats.usage.total.requests, attributes: {} }])

    const collector = new RelayMetricsCollector({
      statsClient,
      deriveMetrics,
      pollIntervalMs: 5000,
      logger: { error: jest.fn() }
    })

    await collector.start()

    expect(MetricSamplesCollector).toHaveBeenCalled()
    expect(collector.getMetrics()).toEqual([
      { name: 'relay_requests_total', value: 1, attributes: {} }
    ])
    expect(collector.getStats()).toEqual(responses[0])

    await collector.refreshNow()

    expect(collector.getMetrics()).toEqual([
      { name: 'relay_requests_total', value: 2, attributes: {} }
    ])
    expect(collector.getStats()).toEqual(responses[1])

    collector.stop()
  })
})
