class MetricSamplesCollector {
  constructor({ statsClient, deriveMetrics }) {
    this.statsClient = statsClient
    this.deriveMetrics = deriveMetrics
  }

  async collect() {
    const stats = await this.statsClient.fetchCombinedStats()
    const metrics = this.deriveMetrics(stats)

    return {
      stats,
      metrics
    }
  }
}

module.exports = MetricSamplesCollector
