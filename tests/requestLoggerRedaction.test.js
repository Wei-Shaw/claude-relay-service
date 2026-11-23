const express = require('express')
const request = require('supertest')

// auth.js pulls the whole service graph; only the logger middleware is under test.
jest.mock('../src/services/apiKeyService', () => ({
  validateApiKey: jest.fn(),
  hasPermission: jest.fn()
}))

const { requestLogger } = require('../src/middleware/auth')

describe('requestLogger redaction', () => {
  test('does not write submitted credentials into the request metadata', async () => {
    const app = express()
    app.use(express.json())
    app.use(requestLogger)
    app.post('/web/auth/login', (req, res) => res.status(401).json({ error: 'Invalid credentials' }))

    const logger = require('../src/utils/logger')
    const debugSpy = jest.spyOn(logger, 'debug').mockImplementation(() => {})
    const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {})

    await request(app)
      .post('/web/auth/login')
      .send({ username: 'admin', password: 'SUPER_SECRET_PROBE_PASSWORD' })

    const serialized = JSON.stringify([...debugSpy.mock.calls, ...warnSpy.mock.calls])
    debugSpy.mockRestore()
    warnSpy.mockRestore()

    expect(serialized).not.toContain('SUPER_SECRET_PROBE_PASSWORD')
  })
})
