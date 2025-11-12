const MetricSamplesCollector = require('./metricSamplesCollector')
const StatsPollingService = require('./statsPollingService')

class RelayMetricsCollector {
  constructor({ statsClient, deriveMetrics, pollIntervalMs, logger = console }) {
    this.metricCollector = new MetricSamplesCollector({ statsClient, deriveMetrics })
    this.pollingService = new StatsPollingService({
      collector: this.metricCollector,
      pollIntervalMs,
      logger
    })
  }

  async start() {
    await this.pollingService.start()
  }

  stop() {
    this.pollingService.stop()
  }

  async refreshNow() {
    return this.pollingService.refreshNow()
  }

  getMetrics() {
    return this.pollingService.getLatestSamples()
  }

  getStats() {
    return this.pollingService.getLatestStats()
  }

  getLastUpdated() {
    return this.pollingService.getLastUpdated()
  }

  getSnapshot() {
    return {
      metrics: this.getMetrics(),
      stats: this.getStats(),
      lastUpdated: this.getLastUpdated()
    }
  }
}

module.exports = RelayMetricsCollector
