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

const { securityMiddleware, setAdminSpaSecurityHeaders } = require('../src/middleware/auth')

describe('admin SPA security headers', () => {
  it('adds a CSP to /admin-next responses through securityMiddleware', async () => {
    const app = express()
    app.use(securityMiddleware)
    app.get('/admin-next/', (req, res) => res.send('ok'))

    const response = await request(app).get('/admin-next/')

    expect(response.headers['content-security-policy']).toContain("default-src 'self'")
    expect(response.headers['content-security-policy']).toContain("script-src 'self'")
    expect(response.headers['content-security-policy']).toContain("frame-ancestors 'none'")
    expect(response.headers['content-security-policy']).not.toContain("'unsafe-eval'")
  })

  it('can set the same CSP on early /admin-next responses before middleware runs', async () => {
    const app = express()
    app.get('/admin-next/', (req, res) => {
      setAdminSpaSecurityHeaders(res)
      res.send('ok')
    })

    const response = await request(app).get('/admin-next/')

    expect(response.headers['content-security-policy']).toContain("default-src 'self'")
    expect(response.headers['content-security-policy']).toContain("script-src 'self'")
    expect(response.headers['content-security-policy']).not.toContain("'unsafe-eval'")
  })
})
