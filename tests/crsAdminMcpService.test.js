jest.mock('axios', () => ({
  request: jest.fn()
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

const axios = require('axios')
const { adminAgentOpenApiSpec } = require('../src/openapi/adminAgentSpec')
const {
  getDefaultBaseUrl,
  getExposedOperations,
  invokeOperation
} = require('../src/services/crsAdminMcpService')

const getExpectedProtectedOperationIds = () => {
  const globalSecurity = adminAgentOpenApiSpec.security || []
  const expected = []

  for (const pathItem of Object.values(adminAgentOpenApiSpec.paths || {})) {
    for (const operation of Object.values(pathItem)) {
      if (!operation?.operationId || operation.operationId === 'adminLogin') {
        continue
      }

      const effectiveSecurity = operation.security ?? globalSecurity
      const hasAdminBearer = effectiveSecurity.some(
        (item) => item && Object.prototype.hasOwnProperty.call(item, 'AdminBearerAuth')
      )

      if (hasAdminBearer) {
        expected.push(operation.operationId)
      }
    }
  }

  return expected.sort()
}

describe('crsAdminMcpService', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    delete process.env.CRS_ADMIN_TOKEN
    delete process.env.CRS_BASE_URL
    delete process.env.PORT
  })

  it('keeps exposed MCP operations in sync with protected OpenAPI operations', () => {
    const actual = getExposedOperations()
      .map((operation) => operation.operationId)
      .sort()

    expect(actual).toEqual(getExpectedProtectedOperationIds())
    expect(actual).not.toContain('adminLogin')
  })

  it('maps listApiKeys query calls to the existing admin HTTP endpoint', async () => {
    process.env.CRS_ADMIN_TOKEN = 'token-123'
    process.env.CRS_BASE_URL = 'http://relay.local:3000'
    axios.request.mockResolvedValue({ data: { success: true, data: { items: [] } } })

    const result = await invokeOperation('listApiKeys', {
      query: {
        page: 1,
        pageSize: 20,
        sortBy: 'createdAt',
        sortOrder: 'desc'
      }
    })

    expect(result).toEqual({ success: true, data: { items: [] } })
    expect(axios.request).toHaveBeenCalledWith({
      baseURL: 'http://relay.local:3000',
      url: '/admin/api-keys',
      method: 'GET',
      params: {
        page: 1,
        pageSize: 20,
        sortBy: 'createdAt',
        sortOrder: 'desc'
      },
      data: undefined,
      headers: {
        Authorization: 'Bearer token-123'
      }
    })
  })

  it('maps updateApiKey with path and body payloads', async () => {
    process.env.CRS_ADMIN_TOKEN = 'token-123'
    process.env.CRS_BASE_URL = 'http://relay.local:3000'
    axios.request.mockResolvedValue({ data: { success: true } })

    await invokeOperation('updateApiKey', {
      path: { keyId: 'key_123' },
      body: { name: 'updated-name', isActive: true }
    })

    expect(axios.request).toHaveBeenCalledWith({
      baseURL: 'http://relay.local:3000',
      url: '/admin/api-keys/key_123',
      method: 'PUT',
      params: {},
      data: { name: 'updated-name', isActive: true },
      headers: {
        Authorization: 'Bearer token-123'
      }
    })
  })

  it('maps batchDeleteApiKeys and rejects empty keyIds early', async () => {
    process.env.CRS_ADMIN_TOKEN = 'token-123'
    process.env.CRS_BASE_URL = 'http://relay.local:3000'
    axios.request.mockResolvedValue({ data: { success: true, deleted: 2 } })

    await expect(
      invokeOperation('batchDeleteApiKeys', {
        body: { keyIds: [] }
      })
    ).rejects.toMatchObject({
      name: 'CrsAdminMcpError',
      statusCode: 400,
      summary: 'body.keyIds must not be empty'
    })

    expect(axios.request).not.toHaveBeenCalled()

    await invokeOperation('batchDeleteApiKeys', {
      body: { keyIds: ['key_1', 'key_2'] }
    })

    expect(axios.request).toHaveBeenCalledWith({
      baseURL: 'http://relay.local:3000',
      url: '/admin/api-keys/batch',
      method: 'DELETE',
      params: {},
      data: { keyIds: ['key_1', 'key_2'] },
      headers: {
        Authorization: 'Bearer token-123'
      }
    })
  })

  it('maps statistics operations with path and query inputs', async () => {
    process.env.CRS_ADMIN_TOKEN = 'token-123'
    process.env.CRS_BASE_URL = 'http://relay.local:3000'
    axios.request.mockResolvedValueOnce({ data: { success: true, totals: {} } })
    axios.request.mockResolvedValueOnce({ data: { success: true, records: [] } })

    await invokeOperation('getUsageCosts', {
      query: { timeRange: '7days' }
    })

    await invokeOperation('getApiKeyUsageRecords', {
      path: { keyId: 'key_abc' },
      query: { limit: 20 }
    })

    expect(axios.request).toHaveBeenNthCalledWith(1, {
      baseURL: 'http://relay.local:3000',
      url: '/admin/usage-costs',
      method: 'GET',
      params: { timeRange: '7days' },
      data: undefined,
      headers: {
        Authorization: 'Bearer token-123'
      }
    })

    expect(axios.request).toHaveBeenNthCalledWith(2, {
      baseURL: 'http://relay.local:3000',
      url: '/admin/api-keys/key_abc/usage-records',
      method: 'GET',
      params: { limit: 20 },
      data: undefined,
      headers: {
        Authorization: 'Bearer token-123'
      }
    })
  })

  it('uses the default localhost base URL when CRS_BASE_URL is absent', async () => {
    process.env.CRS_ADMIN_TOKEN = 'token-123'
    process.env.PORT = '4567'
    axios.request.mockResolvedValue({ data: { success: true } })

    expect(getDefaultBaseUrl()).toBe('http://127.0.0.1:4567')

    await invokeOperation('listApiKeys', {
      query: { page: 1, pageSize: 20 }
    })

    expect(axios.request).toHaveBeenCalledWith({
      baseURL: 'http://127.0.0.1:4567',
      url: '/admin/api-keys',
      method: 'GET',
      params: { page: 1, pageSize: 20 },
      data: undefined,
      headers: {
        Authorization: 'Bearer token-123'
      }
    })
  })

  it('keeps stdio mode dependent on CRS_ADMIN_TOKEN', async () => {
    await expect(invokeOperation('listApiKeys', {})).rejects.toMatchObject({
      name: 'CrsAdminMcpError',
      statusCode: 401,
      summary: 'Missing CRS_ADMIN_TOKEN environment variable'
    })

    expect(axios.request).not.toHaveBeenCalled()
  })

  it('allows remote mode to inject admin token without CRS_ADMIN_TOKEN env', async () => {
    process.env.CRS_BASE_URL = 'http://relay.local:3000'
    axios.request.mockResolvedValue({ data: { success: true } })

    await invokeOperation(
      'listApiKeys',
      {
        query: { page: 1, pageSize: 20 }
      },
      {
        adminToken: 'remote-session-token'
      }
    )

    expect(axios.request).toHaveBeenCalledWith({
      baseURL: 'http://relay.local:3000',
      url: '/admin/api-keys',
      method: 'GET',
      params: { page: 1, pageSize: 20 },
      data: undefined,
      headers: {
        Authorization: 'Bearer remote-session-token'
      }
    })
  })

  it('sanitizes upstream 401 and 500 failures into MCP-safe errors', async () => {
    process.env.CRS_ADMIN_TOKEN = 'token-123'
    process.env.CRS_BASE_URL = 'http://relay.local:3000'

    axios.request.mockRejectedValueOnce({
      response: {
        status: 401,
        data: {
          message: 'token invalid'
        }
      },
      message: 'Request failed with status code 401'
    })

    await expect(invokeOperation('listApiKeys', {})).rejects.toMatchObject({
      name: 'CrsAdminMcpError',
      statusCode: 401,
      summary: 'Authentication failed'
    })

    axios.request.mockRejectedValueOnce({
      response: {
        status: 500,
        data: {
          message: 'stack trace should not leak'
        }
      },
      message: 'Request failed with status code 500'
    })

    await expect(invokeOperation('listApiKeys', {})).rejects.toMatchObject({
      name: 'CrsAdminMcpError',
      statusCode: 500,
      summary: 'Internal server error'
    })
  })
})
