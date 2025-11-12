const DEFAULT_LOGGER = console

function createDeferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

class StatsPollingService {
  constructor({ collector, pollIntervalMs, logger = DEFAULT_LOGGER }) {
    if (!collector || typeof collector.collect !== 'function') {
      throw new Error('collector with collect() is required')
    }

    if (!Number.isFinite(pollIntervalMs) || pollIntervalMs <= 0) {
      throw new Error('pollIntervalMs must be a positive number')
    }

    this.collector = collector
    this.pollIntervalMs = pollIntervalMs
    this.logger = logger || DEFAULT_LOGGER

    this.timer = null
    this.inFlight = false
    this.latestSnapshot = { metrics: [], stats: null }
    this.lastUpdated = 0

    this._readyDeferred = createDeferred()
    this._readyResolved = false
  }

  async start() {
    if (this.timer) {
      return this._readyDeferred.promise
    }

    await this._executePoll()

    this.timer = setInterval(() => {
      this._executePoll().catch(() => {})
    }, this.pollIntervalMs)

    if (typeof this.timer.unref === 'function') {
      this.timer.unref()
    }

    return this._readyDeferred.promise
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  getLatestSamples() {
    return this.latestSnapshot.metrics
  }

  getLatestStats() {
    return this.latestSnapshot.stats
  }

  getLastUpdated() {
    return this.lastUpdated
  }

  async refreshNow() {
    await this._executePoll()
    return this.latestSnapshot
  }

  async _executePoll() {
    if (this.inFlight) {
      return
    }

    this.inFlight = true

    try {
      const snapshot = await this.collector.collect()
      const metrics = snapshot?.metrics
      if (Array.isArray(metrics)) {
        this.latestSnapshot = {
          metrics,
          stats: snapshot?.stats || null
        }
        this.lastUpdated = Date.now()
      }
    } catch (error) {
      this.logger?.error?.('[relay-metrics] stats polling failed:', error.message || error)
    } finally {
      this.inFlight = false
      this._resolveReadyOnce()
    }
  }

  _resolveReadyOnce() {
    if (this._readyResolved) {
      return
    }
    this._readyResolved = true
    this._readyDeferred.resolve()
  }
}

module.exports = StatsPollingService
