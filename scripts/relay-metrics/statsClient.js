class StatsClient {
  constructor({ baseUrl, credential, requestTimeoutMs, metricsPeriod }) {
    this.baseUrl = baseUrl
    this.credential = credential
    this.requestTimeoutMs = requestTimeoutMs
    this.metricsPeriod = metricsPeriod
  }

  async fetchCombinedStats() {
    const payload = this.buildCredentialPayload()

    const userStatsResponse = await this.postJson('/apiStats/api/user-stats', payload)
    const modelPayload = { ...payload, period: this.metricsPeriod }
    const modelStatsResponse = await this.postJson('/apiStats/api/user-model-stats', modelPayload)

    return {
      userStats: userStatsResponse.data,
      modelStats: modelStatsResponse.data
    }
  }

  buildCredentialPayload() {
    if (this.credential.type === 'apiId') {
      return { apiId: this.credential.value }
    }

    return { apiKey: this.credential.value }
  }

  async postJson(path, body) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs)

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal
      })

      if (!response.ok) {
        const text = await response.text()
        throw new Error(`Request failed ${response.status}: ${text}`)
      }

      const json = await response.json()
      if (!json || json.success !== true) {
        throw new Error(`Unexpected response for ${path}`)
      }

      return json
    } finally {
      clearTimeout(timeout)
    }
  }
}

module.exports = StatsClient
