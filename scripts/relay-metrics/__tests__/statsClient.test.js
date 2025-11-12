const http = require('http')
const StatsClient = require('../statsClient')

describe('StatsClient', () => {
  let server
  let port
  let lastBody

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      let data = ''
      req.on('data', (chunk) => {
        data += chunk
      })
      req.on('end', () => {
        if (req.url === '/apiStats/api/user-stats') {
          lastBody = JSON.parse(data)
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(
            JSON.stringify({
              success: true,
              data: {
                usage: { total: { requests: 10, allTokens: 20, cost: 3.5 } },
                limits: { currentWindowRequests: 1 }
              }
            })
          )
        } else if (req.url === '/apiStats/api/user-model-stats') {
          lastBody = JSON.parse(data)
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(
            JSON.stringify({
              success: true,
              data: [
                { model: 'claude', allTokens: 20, costs: { total: 3.5 } }
              ]
            })
          )
        } else {
          res.writeHead(404)
          res.end()
        }
      })
    })

    await new Promise((resolve) => {
      server.listen(0, () => {
        port = server.address().port
        resolve()
      })
    })
  })

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve))
  })

  it('fetches combined stats payloads using the credential type', async () => {
    const client = new StatsClient({
      baseUrl: `http://127.0.0.1:${port}`,
      credential: { type: 'apiId', value: 'uuid-1' },
      requestTimeoutMs: 2000,
      metricsPeriod: 'monthly'
    })

    const result = await client.fetchCombinedStats()

    expect(result).toEqual({
      userStats: {
        usage: { total: { requests: 10, allTokens: 20, cost: 3.5 } },
        limits: { currentWindowRequests: 1 }
      },
      modelStats: [{ model: 'claude', allTokens: 20, costs: { total: 3.5 } }]
    })

    expect(lastBody).toMatchObject({ apiId: 'uuid-1' })
  })

  it('sends apiKey when configured', async () => {
    const client = new StatsClient({
      baseUrl: `http://127.0.0.1:${port}`,
      credential: { type: 'apiKey', value: 'cr_secret' },
      requestTimeoutMs: 2000,
      metricsPeriod: 'daily'
    })

    await client.fetchCombinedStats()

    expect(lastBody).toMatchObject({ apiKey: 'cr_secret', period: 'daily' })
  })
})
