const StatsPollingService = require('../statsPollingService')

describe('StatsPollingService', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.clearAllTimers()
    jest.useRealTimers()
  })

  it('polls immediately on start and stores samples', async () => {
    const firstSnapshot = {
      metrics: [{ name: 'relay_requests_total', value: 42, attributes: {} }],
      stats: { usage: { total: { requests: 42 } } }
    }
    const collector = {
      collect: jest.fn().mockResolvedValue(firstSnapshot)
    }

    const service = new StatsPollingService({ collector, pollIntervalMs: 5000 })

    await service.start()

    expect(collector.collect).toHaveBeenCalledTimes(1)
    expect(service.getLatestSamples()).toEqual(firstSnapshot.metrics)
    expect(service.getLatestStats()).toEqual(firstSnapshot.stats)
  })

  it('updates samples on subsequent intervals', async () => {
    const firstSnapshot = {
      metrics: [{ name: 'relay_requests_total', value: 1, attributes: {} }],
      stats: { usage: { total: { requests: 1 } } }
    }
    const secondSnapshot = {
      metrics: [{ name: 'relay_requests_total', value: 2, attributes: {} }],
      stats: { usage: { total: { requests: 2 } } }
    }
    const collector = {
      collect: jest
        .fn()
        .mockResolvedValueOnce(firstSnapshot)
        .mockResolvedValueOnce(secondSnapshot)
        .mockResolvedValue(secondSnapshot)
    }

    const service = new StatsPollingService({ collector, pollIntervalMs: 5000 })

    await service.start()
    expect(service.getLatestSamples()).toEqual(firstSnapshot.metrics)

    jest.advanceTimersByTime(5000)
    await Promise.resolve()

    expect(service.getLatestSamples()).toEqual(secondSnapshot.metrics)
  })

  it('logs errors and keeps previous samples when polling fails', async () => {
    const snapshot = {
      metrics: [{ name: 'relay_requests_total', value: 7, attributes: {} }],
      stats: { usage: { total: { requests: 7 } } }
    }
    const error = new Error('network down')

    const collector = {
      collect: jest
        .fn()
        .mockResolvedValueOnce(snapshot)
        .mockRejectedValueOnce(error)
        .mockResolvedValue(snapshot)
    }

    const logger = { error: jest.fn() }
    const service = new StatsPollingService({ collector, pollIntervalMs: 5000, logger })

    await service.start()
    expect(service.getLatestSamples()).toEqual(snapshot.metrics)

    jest.advanceTimersByTime(5000)
    await Promise.resolve()

    expect(logger.error).toHaveBeenCalledWith('[relay-metrics] stats polling failed:', 'network down')
    expect(service.getLatestSamples()).toEqual(snapshot.metrics)
  })

  it('stops polling when stop is called', async () => {
    const collector = {
      collect: jest.fn().mockResolvedValue({ metrics: [], stats: null })
    }

    const service = new StatsPollingService({ collector, pollIntervalMs: 5000 })

    await service.start()
    service.stop()

    collector.collect.mockClear()
    jest.advanceTimersByTime(15000)
    await Promise.resolve()

    expect(collector.collect).not.toHaveBeenCalled()
  })

  it('supports manual refresh and returns the latest snapshot', async () => {
    const firstSnapshot = {
      metrics: [{ name: 'relay_requests_total', value: 1, attributes: {} }],
      stats: { usage: { total: { requests: 1 } } }
    }
    const secondSnapshot = {
      metrics: [{ name: 'relay_requests_total', value: 2, attributes: {} }],
      stats: { usage: { total: { requests: 2 } } }
    }

    const collector = {
      collect: jest.fn().mockResolvedValueOnce(firstSnapshot).mockResolvedValueOnce(secondSnapshot)
    }

    const service = new StatsPollingService({ collector, pollIntervalMs: 5000 })

    await service.start()
    expect(service.getLatestSamples()).toEqual(firstSnapshot.metrics)

    const refreshed = await service.refreshNow()

    expect(refreshed).toEqual(secondSnapshot)
    expect(service.getLatestSamples()).toEqual(secondSnapshot.metrics)
    expect(service.getLatestStats()).toEqual(secondSnapshot.stats)
  })
})
