const mockConfig = {
  ldap: { enabled: true },
  userManagement: { enabled: true }
}

const mockValidateUserSession = jest.fn()

jest.mock('../config/config', () => mockConfig, { virtual: true })
jest.mock('../src/services/userService', () => ({
  validateUserSession: mockValidateUserSession
}))
jest.mock('../src/services/apiKeyService', () => ({}))
jest.mock('../src/services/requestDetailService', () => ({}))
jest.mock('../src/services/claudeRelayConfigService', () => ({}))
jest.mock('../src/models/redis', () => ({}))
jest.mock('../src/utils/logger', () => ({
  api: jest.fn(),
  debug: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  security: jest.fn(),
  warn: jest.fn()
}))

const { authenticateUser } = require('../src/middleware/auth')

function createResponse() {
  const res = {
    json: jest.fn(() => res),
    status: jest.fn(() => res)
  }
  return res
}

describe('user system authentication gate', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockConfig.ldap.enabled = true
    mockConfig.userManagement.enabled = true
  })

  test.each([
    [false, true],
    [true, false],
    [false, false]
  ])(
    'rejects existing sessions when LDAP=%s and user management=%s',
    async (ldapEnabled, userManagementEnabled) => {
      mockConfig.ldap.enabled = ldapEnabled
      mockConfig.userManagement.enabled = userManagementEnabled
      const res = createResponse()
      const next = jest.fn()

      await authenticateUser({ headers: {} }, res, next)

      expect(res.status).toHaveBeenCalledWith(503)
      expect(res.json).toHaveBeenCalledWith({
        error: 'Service unavailable',
        message: 'User system is not enabled'
      })
      expect(mockValidateUserSession).not.toHaveBeenCalled()
      expect(next).not.toHaveBeenCalled()
    }
  )

  test('allows a valid active session when the user system is enabled', async () => {
    const sessionToken = 'a'.repeat(32)
    mockValidateUserSession.mockResolvedValue({
      session: { createdAt: '2026-07-12T00:00:00.000Z' },
      user: {
        id: 'user-1',
        username: 'user',
        isActive: true
      }
    })
    const req = { headers: { authorization: `Bearer ${sessionToken}` } }
    const res = createResponse()
    const next = jest.fn()

    await authenticateUser(req, res, next)

    expect(mockValidateUserSession).toHaveBeenCalledWith(sessionToken)
    expect(next).toHaveBeenCalledTimes(1)
    expect(req.user).toEqual(
      expect.objectContaining({ id: 'user-1', username: 'user', sessionToken })
    )
  })
})
