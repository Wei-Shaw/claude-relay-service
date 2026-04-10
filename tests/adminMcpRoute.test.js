const express = require('express')
const request = require('supertest')

jest.mock('axios', () => ({
  request: jest.fn()
}))

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
  const sessions = new Map()

  return {
    getSession: jest.fn(async (sessionId) => sessions.get(sessionId) || {}),
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

const axios = require('axios')
const { LATEST_PROTOCOL_VERSION } = require('@modelcontextprotocol/sdk/types.js')
const redis = require('../src/models/redis')
const mcpRoutes = require('../src/routes/admin/mcp')
const { getExposedOperations } = require('../src/services/crsAdminMcpService')

const ADMIN_TOKEN = 'admin-session-token-123456789012345678901234'
const MCP_ACCEPT_HEADER = 'application/json, text/event-stream'

const buildInitializeRequest = () => ({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: LATEST_PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: {
      name: 'jest-client',
      version: '1.0.0'
    }
  }
})

const buildJsonRpcRequest = (id, method, params = {}) => ({
  jsonrpc: '2.0',
  id,
  method,
  params
})

const createApp = () => {
  const app = express()
  app.use(express.json())
  app.use('/admin', mcpRoutes)
  return app
}

const seedAdminSession = async () => {
  await redis.setSession(ADMIN_TOKEN, {
    username: 'admin',
    loginTime: new Date('2026-03-16T00:00:00.000Z').toISOString()
  })
}

describe('admin MCP route', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    if (typeof redis.__reset === 'function') {
      redis.__reset()
    }

    delete process.env.CRS_ADMIN_TOKEN
    process.env.CRS_BASE_URL = 'http://relay.local:3000'
  })

  afterEach(() => {
    delete process.env.CRS_BASE_URL
    delete process.env.CRS_ADMIN_TOKEN
  })

  it('returns 401 when POST /admin/mcp is missing an admin token', async () => {
    const app = createApp()

    const response = await request(app).post('/admin/mcp').send(buildInitializeRequest())

    expect(response.status).toBe(401)
    expect(response.body).toMatchObject({
      error: 'Missing admin token'
    })
  })

  it('returns 405 for GET and DELETE /admin/mcp', async () => {
    const app = createApp()

    const getResponse = await request(app).get('/admin/mcp')
    const deleteResponse = await request(app).delete('/admin/mcp')

    expect(getResponse.status).toBe(405)
    expect(getResponse.headers.allow).toBe('POST')
    expect(deleteResponse.status).toBe(405)
    expect(deleteResponse.headers.allow).toBe('POST')
  })

  it('accepts initialize over remote streamable HTTP without exposing a session id', async () => {
    const app = createApp()
    await seedAdminSession()

    const response = await request(app)
      .post('/admin/mcp')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .set('Accept', MCP_ACCEPT_HEADER)
      .send(buildInitializeRequest())

    expect(response.status).toBe(200)
    expect(response.headers['mcp-session-id']).toBeUndefined()
    expect(response.body).toMatchObject({
      jsonrpc: '2.0',
      id: 1,
      result: {
        protocolVersion: LATEST_PROTOCOL_VERSION,
        serverInfo: {
          name: 'crs-admin'
        },
        capabilities: {
          tools: {
            listChanged: true
          }
        }
      }
    })
  })

  it('lists the same tools as the protected OpenAPI operation set', async () => {
    const app = createApp()
    await seedAdminSession()

    const response = await request(app)
      .post('/admin/mcp')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .set('Accept', MCP_ACCEPT_HEADER)
      .set('mcp-protocol-version', LATEST_PROTOCOL_VERSION)
      .send(buildJsonRpcRequest(2, 'tools/list', {}))

    expect(response.status).toBe(200)

    const actualNames = response.body.result.tools.map((tool) => tool.name).sort()
    const expectedNames = getExposedOperations()
      .map((operation) => operation.operationId)
      .sort()

    expect(actualNames).toEqual(expectedNames)
  })

  it('calls listApiKeys with the authenticated request token instead of CRS_ADMIN_TOKEN env', async () => {
    const app = createApp()
    await seedAdminSession()
    process.env.CRS_ADMIN_TOKEN = 'env-token-should-not-be-used-12345678901234567890'
    axios.request.mockResolvedValue({
      data: {
        success: true,
        data: {
          items: []
        }
      }
    })

    const response = await request(app)
      .post('/admin/mcp')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .set('Accept', MCP_ACCEPT_HEADER)
      .set('mcp-protocol-version', LATEST_PROTOCOL_VERSION)
      .send(
        buildJsonRpcRequest(3, 'tools/call', {
          name: 'listApiKeys',
          arguments: {
            query: {
              page: 1,
              pageSize: 20
            }
          }
        })
      )

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      jsonrpc: '2.0',
      id: 3,
      result: {
        structuredContent: {
          success: true,
          data: {
            items: []
          }
        }
      }
    })
    expect(axios.request).toHaveBeenCalledWith({
      baseURL: 'http://relay.local:3000',
      url: '/admin/api-keys',
      method: 'GET',
      params: {
        page: 1,
        pageSize: 20
      },
      data: undefined,
      headers: {
        Authorization: `Bearer ${ADMIN_TOKEN}`
      }
    })
  })

  it('returns a tool error for rejected write operations', async () => {
    const app = createApp()
    await seedAdminSession()

    const response = await request(app)
      .post('/admin/mcp')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .set('Accept', MCP_ACCEPT_HEADER)
      .set('mcp-protocol-version', LATEST_PROTOCOL_VERSION)
      .send(
        buildJsonRpcRequest(4, 'tools/call', {
          name: 'batchDeleteApiKeys',
          arguments: {
            body: {
              keyIds: []
            }
          }
        })
      )

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      jsonrpc: '2.0',
      id: 4,
      result: {
        isError: true,
        structuredContent: {
          operationId: 'batchDeleteApiKeys',
          statusCode: 400,
          error: 'body.keyIds must not be empty'
        }
      }
    })
    expect(axios.request).not.toHaveBeenCalled()
  })
})
