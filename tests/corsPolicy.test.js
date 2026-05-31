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

const { corsMiddleware } = require('../src/middleware/auth')

describe('CORS policy', () => {
  it('does not reflect arbitrary origins', async () => {
    const app = express()
    app.use(corsMiddleware)
    app.get('/resource', (req, res) => res.json({ ok: true }))

    const response = await request(app)
      .get('/resource')
      .set('Origin', 'https://example.invalid')

    expect(response.status).toBe(200)
    expect(response.headers['access-control-allow-origin']).toBeUndefined()
  })

  it('allows configured local development origins', async () => {
    const app = express()
    app.use(corsMiddleware)
    app.get('/resource', (req, res) => res.json({ ok: true }))

    const response = await request(app).get('/resource').set('Origin', 'http://localhost:3000')

    expect(response.status).toBe(200)
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000')
  })
})
