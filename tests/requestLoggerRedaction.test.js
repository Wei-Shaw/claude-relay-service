const express = require('express')
const request = require('supertest')

jest.mock('../src/utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  success: jest.fn(),
  security: jest.fn()
}))
jest.mock('../src/models/redis', () => ({}))
jest.mock('../src/services/apiKeyService', () => ({}))
jest.mock('../src/services/userService', () => ({}))
jest.mock('../src/services/claudeRelayConfigService', () => ({}))

const logger = require('../src/utils/logger')
const { requestLogger } = require('../src/middleware/auth')

describe('requestLogger redaction', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('does not log request bodies or JSON response bodies', async () => {
    const app = express()
    app.use(express.json())
    app.use(requestLogger)
    app.post('/web/auth/login', (req, res) => {
      res.json({ success: true, token: 'session-token-secret' })
    })

    const response = await request(app)
      .post('/web/auth/login')
      .send({ username: 'admin', password: 'password-secret' })

    expect(response.status).toBe(200)
    const loggedMetadata = [
      ...logger.debug.mock.calls.map((call) => call[1]),
      ...logger.info.mock.calls.map((call) => call[1]),
      ...logger.warn.mock.calls.map((call) => call[1]),
      ...logger.error.mock.calls.map((call) => call[1])
    ].filter(Boolean)

    expect(JSON.stringify(loggedMetadata)).not.toContain('password-secret')
    expect(JSON.stringify(loggedMetadata)).not.toContain('session-token-secret')
    expect(
      loggedMetadata.some((metadata) => Object.prototype.hasOwnProperty.call(metadata, 'req'))
    ).toBe(false)
    expect(
      loggedMetadata.some((metadata) => Object.prototype.hasOwnProperty.call(metadata, 'res'))
    ).toBe(false)
  })

  it('does not log raw query strings', async () => {
    const app = express()
    app.use(requestLogger)
    app.get('/api/v1/messages', (req, res) => {
      res.json({ success: true })
    })

    const response = await request(app).get('/api/v1/messages?key=query-secret&foo=bar')

    expect(response.status).toBe(200)
    const allLoggedData = JSON.stringify([
      ...logger.debug.mock.calls,
      ...logger.info.mock.calls,
      ...logger.warn.mock.calls,
      ...logger.error.mock.calls
    ])

    expect(allLoggedData).not.toContain('query-secret')
    expect(allLoggedData).not.toContain('foo=bar')
    expect(allLoggedData).toContain('/api/v1/messages?[query]')
  })
})
