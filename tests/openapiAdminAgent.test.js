const express = require('express')
const request = require('supertest')
const fs = require('fs')
const path = require('path')

jest.mock(
  '../config/config',
  () => {
    return {
      security: {
        adminSessionTimeout: 86400000
      },
      concurrency: {}
    }
  },
  { virtual: true }
)

jest.mock('../src/services/apiKeyService', () => ({}))
jest.mock('../src/services/userService', () => ({}))
jest.mock('../src/validators/clientValidator', () => ({
  getAvailableClients: () => []
}))
jest.mock('../src/validators/clients/claudeCodeValidator', () => ({}))
jest.mock('../src/services/claudeRelayConfigService', () => ({}))
jest.mock('../src/utils/statsHelper', () => ({
  calculateWaitTimeStats: () => null
}))
jest.mock('../src/utils/modelHelper', () => ({
  isClaudeFamilyModel: () => false
}))

jest.mock('../src/utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  success: jest.fn(),
  security: jest.fn(),
  timer: jest.fn(() => ({ end: jest.fn() })),
  getStats: jest.fn(() => ({}))
}))

jest.mock('../src/models/redis', () => {
  const bcrypt = require('bcryptjs')
  const sessions = new Map()
  const adminCredentials = {
    username: 'admin',
    passwordHash: bcrypt.hashSync('secret123', 10),
    createdAt: new Date().toISOString()
  }

  return {
    getSession: jest.fn(async (sessionId) => {
      if (sessionId === 'admin_credentials') {
        return adminCredentials
      }
      return sessions.get(sessionId) || {}
    }),
    setSession: jest.fn(async (sessionId, data) => {
      sessions.set(sessionId, data)
      return true
    }),
    deleteSession: jest.fn(async (sessionId) => {
      sessions.delete(sessionId)
      return true
    }),
    getClient: jest.fn(() => ({
      hset: jest.fn()
    })),
    _getConcurrencyConfig: jest.fn(() => ({
      leaseSeconds: 300,
      renewIntervalSeconds: 30,
      cleanupGraceSeconds: 30
    })),
    __reset: () => {
      sessions.clear()
    }
  }
})

const redis = require('../src/models/redis')
const openapiRoutes = require('../src/routes/openapi')
const webRoutes = require('../src/routes/web')
const { authenticateAdmin } = require('../src/middleware/auth')

describe('OpenAPI admin-agent routes', () => {
  beforeEach(() => {
    if (typeof redis.__reset === 'function') {
      redis.__reset()
    }
  })

  it('returns parseable OpenAPI JSON and excludes risky endpoints', async () => {
    const app = express()
    app.use('/openapi', openapiRoutes)

    const response = await request(app).get('/openapi/admin-agent.json')
    const apiKeyRouteSource = fs.readFileSync(
      path.join(__dirname, '../src/routes/admin/apiKeys.js'),
      'utf8'
    )

    expect(response.status).toBe(200)
    expect(response.body.openapi).toBe('3.1.0')
    expect(response.body.info).toBeDefined()
    expect(response.body.servers).toBeDefined()
    expect(response.body.components.securitySchemes.AdminBearerAuth).toBeDefined()

    expect(response.body.paths['/web/auth/login']).toBeDefined()
    expect(response.body.paths['/admin/api-keys'].post).toBeDefined()
    expect(response.body.paths['/admin/api-keys/{keyId}'].put).toBeDefined()
    expect(response.body.paths['/admin/api-keys/{keyId}'].delete).toBeDefined()
    expect(apiKeyRouteSource).toContain("router.post('/api-keys'")
    expect(apiKeyRouteSource).toContain("router.put('/api-keys/:keyId'")
    expect(apiKeyRouteSource).toContain("router.delete('/api-keys/:keyId'")

    expect(response.body.paths['/admin/api-keys/index-rebuild']).toBeUndefined()
    expect(response.body.paths['/admin/api-keys/cost-sort-refresh']).toBeUndefined()
    expect(response.body.paths['/admin/api-keys/{keyId}/permanent']).toBeUndefined()
    expect(response.body.paths['/admin/api-keys/deleted/clear-all']).toBeUndefined()
    expect(response.body.paths['/admin/api-keys/{keyId}/cost-debug']).toBeUndefined()
  })

  it('returns OpenAPI YAML at fixed endpoint', async () => {
    const app = express()
    app.use('/openapi', openapiRoutes)

    const response = await request(app).get('/openapi/admin-agent.yaml')

    expect(response.status).toBe(200)
    expect(response.headers['content-type']).toContain('application/yaml')
    expect(response.text).toContain('"openapi": "3.1.0"')
    expect(response.text).toContain('"/admin/api-keys":')
  })
})

describe('Admin auth flow for agent usage', () => {
  beforeEach(() => {
    if (typeof redis.__reset === 'function') {
      redis.__reset()
    }
  })

  it('supports login -> bearer token -> protected /admin call', async () => {
    const app = express()
    app.use(express.json())
    app.use('/web', webRoutes)
    app.get('/admin/api-keys', authenticateAdmin, (req, res) => {
      res.json({ success: true, data: [] })
    })

    const unauthorized = await request(app).get('/admin/api-keys')
    expect(unauthorized.status).toBe(401)

    const login = await request(app)
      .post('/web/auth/login')
      .send({ username: 'admin', password: 'secret123' })

    expect(login.status).toBe(200)
    expect(login.body.success).toBe(true)
    expect(typeof login.body.token).toBe('string')
    expect(login.body.token.length).toBeGreaterThan(31)

    const authorized = await request(app)
      .get('/admin/api-keys')
      .set('Authorization', `Bearer ${login.body.token}`)

    expect(authorized.status).toBe(200)
    expect(authorized.body.success).toBe(true)
  })
})
