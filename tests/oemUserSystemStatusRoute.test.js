const mockRouter = {
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
  delete: jest.fn()
}

jest.mock(
  'express',
  () => ({
    Router: () => mockRouter
  }),
  { virtual: true }
)

jest.mock('../src/middleware/auth', () => ({
  authenticateAdmin: jest.fn((_req, _res, next) => next())
}))

jest.mock('../src/services/claudeCodeHeadersService', () => ({}))
jest.mock('../src/services/account/claudeAccountService', () => ({}))
jest.mock('../src/utils/logger', () => ({
  error: jest.fn(),
  warn: jest.fn()
}))

const mockRedisClient = {
  get: jest.fn()
}

jest.mock('../src/models/redis', () => ({
  getClient: jest.fn(() => mockRedisClient)
}))

const mockConfig = {
  ldap: { enabled: false },
  userManagement: { enabled: false }
}

jest.mock('../config/config', () => mockConfig, { virtual: true })

require('../src/routes/admin/system')

function createResponse() {
  const res = {
    body: null,
    json: jest.fn((payload) => {
      res.body = payload
      return res
    }),
    status: jest.fn(() => res)
  }

  return res
}

function findGetHandler(path) {
  const route = mockRouter.get.mock.calls.find((call) => call[0] === path)
  return route?.[1]
}

describe('OEM user system status', () => {
  const handler = findGetHandler('/oem-settings')

  beforeEach(() => {
    mockRedisClient.get.mockReset()
    mockRedisClient.get.mockResolvedValue(null)
  })

  test.each([
    [false, false, false],
    [true, false, false],
    [false, true, false],
    [true, true, true]
  ])(
    'reports the combined status when LDAP=%s and user management=%s (expected %s)',
    async (ldapEnabled, userManagementEnabled, expected) => {
      mockConfig.ldap.enabled = ldapEnabled
      mockConfig.userManagement.enabled = userManagementEnabled
      const res = createResponse()

      await handler({}, res)

      expect(res.body.success).toBe(true)
      expect(res.body.data.ldapEnabled).toBe(ldapEnabled)
      expect(res.body.data.userSystemEnabled).toBe(expected)
    }
  )
})
