/**
 * Gemini 错误处理功能单元测试
 *
 * 测试新增的错误处理和账户熔断功能：
 * - geminiAccountService: 5xx错误计数、401/403/529错误标记
 * - geminiApiAccountService: markAccountBlocked
 * - unifiedGeminiScheduler: 临时不可用标记、可用性检查
 */

const redis = require('../src/models/redis')
const geminiAccountService = require('../src/services/geminiAccountService')
const geminiApiAccountService = require('../src/services/geminiApiAccountService')
const unifiedGeminiScheduler = require('../src/services/unifiedGeminiScheduler')

// Mock logger to avoid console output during tests
jest.mock('../src/utils/logger', () => ({
  api: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
  database: jest.fn(),
  security: jest.fn()
}))

// Mock webhookNotifier to prevent actual notifications
jest.mock('../src/utils/webhookNotifier', () => ({
  sendAccountAnomalyNotification: jest.fn().mockResolvedValue(true)
}))

describe('Gemini Error Handling', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  // ============================================
  // geminiAccountService.recordServerError
  // ============================================
  describe('geminiAccountService.recordServerError', () => {
    it('should increment error count using Redis pipeline', async () => {
      const pipelineMock = {
        incr: jest.fn().mockReturnThis(),
        expire: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([
          [null, 1],
          [null, 1]
        ])
      }

      const mockClient = {
        pipeline: jest.fn().mockReturnValue(pipelineMock)
      }

      jest.spyOn(redis, 'getClientSafe').mockReturnValue(mockClient)

      await geminiAccountService.recordServerError('test-account-id', 500)

      expect(mockClient.pipeline).toHaveBeenCalled()
      expect(pipelineMock.incr).toHaveBeenCalledWith('gemini_account:test-account-id:5xx_errors')
      expect(pipelineMock.expire).toHaveBeenCalledWith(
        'gemini_account:test-account-id:5xx_errors',
        300
      )
      expect(pipelineMock.exec).toHaveBeenCalled()
    })

    it('should handle Redis errors gracefully without throwing', async () => {
      const pipelineMock = {
        incr: jest.fn().mockReturnThis(),
        expire: jest.fn().mockReturnThis(),
        exec: jest.fn().mockRejectedValue(new Error('Redis connection failed'))
      }

      const mockClient = {
        pipeline: jest.fn().mockReturnValue(pipelineMock)
      }

      jest.spyOn(redis, 'getClientSafe').mockReturnValue(mockClient)

      // Should not throw
      await expect(
        geminiAccountService.recordServerError('test-account-id', 503)
      ).resolves.not.toThrow()
    })

    it('should use 5 minute TTL (300 seconds) for error count', async () => {
      const pipelineMock = {
        incr: jest.fn().mockReturnThis(),
        expire: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([
          [null, 1],
          [null, 1]
        ])
      }

      const mockClient = {
        pipeline: jest.fn().mockReturnValue(pipelineMock)
      }

      jest.spyOn(redis, 'getClientSafe').mockReturnValue(mockClient)

      await geminiAccountService.recordServerError('test-account-id', 502)

      expect(pipelineMock.expire).toHaveBeenCalledWith(
        expect.any(String),
        300 // 5 minutes
      )
    })
  })

  // ============================================
  // geminiAccountService.getServerErrorCount
  // ============================================
  describe('geminiAccountService.getServerErrorCount', () => {
    it('should return error count from Redis', async () => {
      const mockClient = {
        get: jest.fn().mockResolvedValue('3')
      }

      jest.spyOn(redis, 'getClientSafe').mockReturnValue(mockClient)

      const count = await geminiAccountService.getServerErrorCount('test-account-id')

      expect(mockClient.get).toHaveBeenCalledWith('gemini_account:test-account-id:5xx_errors')
      expect(count).toBe(3)
    })

    it('should return 0 when no errors recorded (null from Redis)', async () => {
      const mockClient = {
        get: jest.fn().mockResolvedValue(null)
      }

      jest.spyOn(redis, 'getClientSafe').mockReturnValue(mockClient)

      const count = await geminiAccountService.getServerErrorCount('test-account-id')

      expect(count).toBe(0)
    })

    it('should return 0 on Redis error', async () => {
      const mockClient = {
        get: jest.fn().mockRejectedValue(new Error('Redis error'))
      }

      jest.spyOn(redis, 'getClientSafe').mockReturnValue(mockClient)

      const count = await geminiAccountService.getServerErrorCount('test-account-id')

      expect(count).toBe(0)
    })

    it('should parse string count to integer', async () => {
      const mockClient = {
        get: jest.fn().mockResolvedValue('5')
      }

      jest.spyOn(redis, 'getClientSafe').mockReturnValue(mockClient)

      const count = await geminiAccountService.getServerErrorCount('test-account-id')

      expect(typeof count).toBe('number')
      expect(count).toBe(5)
    })
  })

  // ============================================
  // geminiAccountService.isAccountOverloaded
  // ============================================
  describe('geminiAccountService.isAccountOverloaded', () => {
    const originalEnv = process.env.GEMINI_OVERLOAD_HANDLING_MINUTES

    afterEach(() => {
      if (originalEnv !== undefined) {
        process.env.GEMINI_OVERLOAD_HANDLING_MINUTES = originalEnv
      } else {
        delete process.env.GEMINI_OVERLOAD_HANDLING_MINUTES
      }
    })

    it('should return true when overload key exists in Redis', async () => {
      process.env.GEMINI_OVERLOAD_HANDLING_MINUTES = '30'

      const mockClient = {
        exists: jest.fn().mockResolvedValue(1)
      }

      jest.spyOn(redis, 'getClientSafe').mockReturnValue(mockClient)

      const result = await geminiAccountService.isAccountOverloaded('test-account-id')

      expect(mockClient.exists).toHaveBeenCalledWith('account:overload:gemini:test-account-id')
      expect(result).toBe(true)
    })

    it('should return false when overload key does not exist in Redis', async () => {
      process.env.GEMINI_OVERLOAD_HANDLING_MINUTES = '30'

      const mockClient = {
        exists: jest.fn().mockResolvedValue(0)
      }

      jest.spyOn(redis, 'getClientSafe').mockReturnValue(mockClient)

      const result = await geminiAccountService.isAccountOverloaded('test-account-id')

      expect(result).toBe(false)
    })

    it('should return false when overload handling is disabled (config = 0)', async () => {
      process.env.GEMINI_OVERLOAD_HANDLING_MINUTES = '0'

      const mockClient = {
        exists: jest.fn()
      }

      jest.spyOn(redis, 'getClientSafe').mockReturnValue(mockClient)

      const result = await geminiAccountService.isAccountOverloaded('test-account-id')

      expect(result).toBe(false)
      expect(mockClient.exists).not.toHaveBeenCalled()
    })

    it('should return false on Redis error', async () => {
      process.env.GEMINI_OVERLOAD_HANDLING_MINUTES = '30'

      const mockClient = {
        exists: jest.fn().mockRejectedValue(new Error('Redis error'))
      }

      jest.spyOn(redis, 'getClientSafe').mockReturnValue(mockClient)

      const result = await geminiAccountService.isAccountOverloaded('test-account-id')

      expect(result).toBe(false)
    })
  })

  // ============================================
  // geminiAccountService.isAccountInErrorState
  // ============================================
  describe('geminiAccountService.isAccountInErrorState', () => {
    // Note: Internal function calls bypass Jest spyOn, so we mock at Redis level
    it('should return true for account with unauthorized status', async () => {
      const mockClient = {
        hgetall: jest.fn().mockResolvedValue({
          id: 'test-account-id',
          status: 'unauthorized',
          isActive: 'true'
        })
      }
      jest.spyOn(redis, 'getClientSafe').mockReturnValue(mockClient)

      const result = await geminiAccountService.isAccountInErrorState('test-account-id')

      expect(result).toBe(true)
    })

    it('should return true for account with blocked status', async () => {
      const mockClient = {
        hgetall: jest.fn().mockResolvedValue({
          id: 'test-account-id',
          status: 'blocked',
          isActive: 'true'
        })
      }
      jest.spyOn(redis, 'getClientSafe').mockReturnValue(mockClient)

      const result = await geminiAccountService.isAccountInErrorState('test-account-id')

      expect(result).toBe(true)
    })

    it('should return true for account with error status', async () => {
      const mockClient = {
        hgetall: jest.fn().mockResolvedValue({
          id: 'test-account-id',
          status: 'error',
          isActive: 'true'
        })
      }
      jest.spyOn(redis, 'getClientSafe').mockReturnValue(mockClient)

      const result = await geminiAccountService.isAccountInErrorState('test-account-id')

      expect(result).toBe(true)
    })

    it('should return false for account with active status', async () => {
      const mockClient = {
        hgetall: jest.fn().mockResolvedValue({
          id: 'test-account-id',
          status: 'active',
          isActive: 'true'
        })
      }
      jest.spyOn(redis, 'getClientSafe').mockReturnValue(mockClient)

      const result = await geminiAccountService.isAccountInErrorState('test-account-id')

      expect(result).toBe(false)
    })

    it('should return false for account with created status', async () => {
      const mockClient = {
        hgetall: jest.fn().mockResolvedValue({
          id: 'test-account-id',
          status: 'created',
          isActive: 'true'
        })
      }
      jest.spyOn(redis, 'getClientSafe').mockReturnValue(mockClient)

      const result = await geminiAccountService.isAccountInErrorState('test-account-id')

      expect(result).toBe(false)
    })

    it('should return true when account is not found (empty object)', async () => {
      const mockClient = {
        hgetall: jest.fn().mockResolvedValue({}) // Empty object means not found
      }
      jest.spyOn(redis, 'getClientSafe').mockReturnValue(mockClient)

      const result = await geminiAccountService.isAccountInErrorState('non-existent-id')

      expect(result).toBe(true)
    })

    it('should return false when Redis throws an error', async () => {
      const mockClient = {
        hgetall: jest.fn().mockRejectedValue(new Error('Redis error'))
      }
      jest.spyOn(redis, 'getClientSafe').mockReturnValue(mockClient)

      const result = await geminiAccountService.isAccountInErrorState('test-account-id')

      expect(result).toBe(false)
    })
  })

  // ============================================
  // geminiAccountService.markAccountOverloaded
  // ============================================
  describe('geminiAccountService.markAccountOverloaded', () => {
    const originalEnv = process.env.GEMINI_OVERLOAD_HANDLING_MINUTES

    afterEach(() => {
      if (originalEnv !== undefined) {
        process.env.GEMINI_OVERLOAD_HANDLING_MINUTES = originalEnv
      } else {
        delete process.env.GEMINI_OVERLOAD_HANDLING_MINUTES
      }
    })

    it('should return disabled when GEMINI_OVERLOAD_HANDLING_MINUTES is 0', async () => {
      process.env.GEMINI_OVERLOAD_HANDLING_MINUTES = '0'

      const mockClient = {
        hgetall: jest.fn().mockResolvedValue({
          id: 'test-account-id',
          name: 'Test Account',
          isActive: 'true'
        })
      }
      jest.spyOn(redis, 'getClientSafe').mockReturnValue(mockClient)

      const result = await geminiAccountService.markAccountOverloaded('test-account-id')

      expect(result.success).toBe(false)
      expect(result.reason).toBe('disabled')
    })

    it('should return failure when account not found', async () => {
      process.env.GEMINI_OVERLOAD_HANDLING_MINUTES = '30'

      const mockClient = {
        hgetall: jest.fn().mockResolvedValue({}) // Empty = not found
      }
      jest.spyOn(redis, 'getClientSafe').mockReturnValue(mockClient)

      const result = await geminiAccountService.markAccountOverloaded('non-existent-id')

      expect(result.success).toBe(false)
    })

    it('should set overload key with correct TTL when enabled', async () => {
      process.env.GEMINI_OVERLOAD_HANDLING_MINUTES = '30'

      const mockClient = {
        hgetall: jest.fn().mockResolvedValue({
          id: 'test-account-id',
          name: 'Test Account',
          isActive: 'true'
        }),
        hset: jest.fn().mockResolvedValue(1),
        setex: jest.fn().mockResolvedValue('OK'),
        del: jest.fn().mockResolvedValue(1)
      }

      jest.spyOn(redis, 'getClientSafe').mockReturnValue(mockClient)

      const result = await geminiAccountService.markAccountOverloaded('test-account-id')

      expect(result.success).toBe(true)
      expect(mockClient.setex).toHaveBeenCalledWith(
        'account:overload:gemini:test-account-id',
        1800, // 30 minutes in seconds
        expect.any(String)
      )
    })
  })

  // ============================================
  // unifiedGeminiScheduler.markAccountTemporarilyUnavailable
  // ============================================
  describe('unifiedGeminiScheduler.markAccountTemporarilyUnavailable', () => {
    it('should set temporary unavailable key with correct TTL', async () => {
      const mockClient = {
        setex: jest.fn().mockResolvedValue('OK'),
        del: jest.fn().mockResolvedValue(1)
      }

      jest.spyOn(redis, 'getClientSafe').mockReturnValue(mockClient)

      const result = await unifiedGeminiScheduler.markAccountTemporarilyUnavailable(
        'test-account-id',
        'gemini',
        null,
        300
      )

      expect(result.success).toBe(true)
      expect(mockClient.setex).toHaveBeenCalledWith(
        'temp_unavailable:gemini:test-account-id',
        300,
        '1'
      )
    })

    it('should delete session mapping if sessionHash is provided', async () => {
      const mockClient = {
        setex: jest.fn().mockResolvedValue('OK'),
        del: jest.fn().mockResolvedValue(1)
      }

      jest.spyOn(redis, 'getClientSafe').mockReturnValue(mockClient)

      await unifiedGeminiScheduler.markAccountTemporarilyUnavailable(
        'test-account-id',
        'gemini',
        'session-hash-123',
        300
      )

      expect(mockClient.del).toHaveBeenCalledWith('unified_gemini_session_mapping:session-hash-123')
    })

    it('should not delete session mapping if sessionHash is null', async () => {
      const mockClient = {
        setex: jest.fn().mockResolvedValue('OK'),
        del: jest.fn().mockResolvedValue(1)
      }

      jest.spyOn(redis, 'getClientSafe').mockReturnValue(mockClient)

      await unifiedGeminiScheduler.markAccountTemporarilyUnavailable(
        'test-account-id',
        'gemini',
        null,
        300
      )

      expect(mockClient.del).not.toHaveBeenCalled()
    })

    it('should use default TTL of 300 seconds (5 minutes)', async () => {
      const mockClient = {
        setex: jest.fn().mockResolvedValue('OK'),
        del: jest.fn().mockResolvedValue(1)
      }

      jest.spyOn(redis, 'getClientSafe').mockReturnValue(mockClient)

      await unifiedGeminiScheduler.markAccountTemporarilyUnavailable(
        'test-account-id',
        'gemini',
        null
        // ttlSeconds defaults to 300
      )

      expect(mockClient.setex).toHaveBeenCalledWith(
        'temp_unavailable:gemini:test-account-id',
        300,
        '1'
      )
    })
  })

  // ============================================
  // unifiedGeminiScheduler.isAccountTemporarilyUnavailable
  // ============================================
  describe('unifiedGeminiScheduler.isAccountTemporarilyUnavailable', () => {
    it('should return true when temp unavailable key exists', async () => {
      const mockClient = {
        exists: jest.fn().mockResolvedValue(1)
      }

      jest.spyOn(redis, 'getClientSafe').mockReturnValue(mockClient)

      const result = await unifiedGeminiScheduler.isAccountTemporarilyUnavailable(
        'test-account-id',
        'gemini'
      )

      expect(mockClient.exists).toHaveBeenCalledWith('temp_unavailable:gemini:test-account-id')
      expect(result).toBe(true)
    })

    it('should return false when temp unavailable key does not exist', async () => {
      const mockClient = {
        exists: jest.fn().mockResolvedValue(0)
      }

      jest.spyOn(redis, 'getClientSafe').mockReturnValue(mockClient)

      const result = await unifiedGeminiScheduler.isAccountTemporarilyUnavailable(
        'test-account-id',
        'gemini'
      )

      expect(result).toBe(false)
    })

    it('should return false on Redis error', async () => {
      const mockClient = {
        exists: jest.fn().mockRejectedValue(new Error('Redis error'))
      }

      jest.spyOn(redis, 'getClientSafe').mockReturnValue(mockClient)

      const result = await unifiedGeminiScheduler.isAccountTemporarilyUnavailable(
        'test-account-id',
        'gemini'
      )

      expect(result).toBe(false)
    })

    it('should work with gemini-api account type', async () => {
      const mockClient = {
        exists: jest.fn().mockResolvedValue(1)
      }

      jest.spyOn(redis, 'getClientSafe').mockReturnValue(mockClient)

      const result = await unifiedGeminiScheduler.isAccountTemporarilyUnavailable(
        'test-account-id',
        'gemini-api'
      )

      expect(mockClient.exists).toHaveBeenCalledWith('temp_unavailable:gemini-api:test-account-id')
      expect(result).toBe(true)
    })
  })

  // ============================================
  // geminiApiAccountService.markAccountBlocked
  // ============================================
  describe('geminiApiAccountService.markAccountBlocked', () => {
    it('should update account with blocked status and schedulable false', async () => {
      jest.spyOn(geminiApiAccountService, 'getAccount').mockResolvedValue({
        id: 'test-api-account',
        name: 'Test API Account',
        isActive: 'true',
        status: 'active'
      })

      const updateSpy = jest.spyOn(geminiApiAccountService, 'updateAccount').mockResolvedValue({})

      await geminiApiAccountService.markAccountBlocked('test-api-account')

      expect(updateSpy).toHaveBeenCalledWith(
        'test-api-account',
        expect.objectContaining({
          status: 'blocked',
          schedulable: 'false',
          blockedAt: expect.any(String)
        })
      )
    })

    it('should use provided reason in errorMessage', async () => {
      jest.spyOn(geminiApiAccountService, 'getAccount').mockResolvedValue({
        id: 'test-api-account',
        name: 'Test API Account',
        isActive: 'true'
      })

      const updateSpy = jest.spyOn(geminiApiAccountService, 'updateAccount').mockResolvedValue({})

      await geminiApiAccountService.markAccountBlocked('test-api-account', 'Custom block reason')

      expect(updateSpy).toHaveBeenCalledWith(
        'test-api-account',
        expect.objectContaining({
          errorMessage: 'Custom block reason'
        })
      )
    })

    it('should use default reason when not provided', async () => {
      jest.spyOn(geminiApiAccountService, 'getAccount').mockResolvedValue({
        id: 'test-api-account',
        name: 'Test API Account',
        isActive: 'true'
      })

      const updateSpy = jest.spyOn(geminiApiAccountService, 'updateAccount').mockResolvedValue({})

      await geminiApiAccountService.markAccountBlocked('test-api-account')

      expect(updateSpy).toHaveBeenCalledWith(
        'test-api-account',
        expect.objectContaining({
          errorMessage: 'Gemini API账号被封锁（403错误）'
        })
      )
    })

    it('should not update if account not found', async () => {
      jest.spyOn(geminiApiAccountService, 'getAccount').mockResolvedValue(null)

      const updateSpy = jest.spyOn(geminiApiAccountService, 'updateAccount')

      await geminiApiAccountService.markAccountBlocked('non-existent-id')

      expect(updateSpy).not.toHaveBeenCalled()
    })

    it('should send webhook notification on block', async () => {
      const webhookNotifier = require('../src/utils/webhookNotifier')

      jest.spyOn(geminiApiAccountService, 'getAccount').mockResolvedValue({
        id: 'test-api-account',
        name: 'Test API Account',
        isActive: 'true'
      })

      jest.spyOn(geminiApiAccountService, 'updateAccount').mockResolvedValue({})

      await geminiApiAccountService.markAccountBlocked('test-api-account')

      expect(webhookNotifier.sendAccountAnomalyNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          accountId: 'test-api-account',
          platform: 'gemini-api',
          status: 'blocked',
          errorCode: 'GEMINI_API_BLOCKED'
        })
      )
    })
  })

  // ============================================
  // unifiedGeminiScheduler.markAccountBlocked
  // ============================================
  describe('unifiedGeminiScheduler.markAccountBlocked', () => {
    it('should call geminiAccountService.markAccountBlocked for gemini type', async () => {
      const markBlockedSpy = jest
        .spyOn(geminiAccountService, 'markAccountBlocked')
        .mockResolvedValue({ success: true })

      const mockClient = {
        del: jest.fn().mockResolvedValue(1)
      }
      jest.spyOn(redis, 'getClientSafe').mockReturnValue(mockClient)

      const result = await unifiedGeminiScheduler.markAccountBlocked(
        'test-account-id',
        'gemini',
        'session-hash'
      )

      expect(markBlockedSpy).toHaveBeenCalledWith('test-account-id', 'session-hash')
      expect(result.success).toBe(true)
    })

    it('should call geminiApiAccountService.markAccountBlocked for gemini-api type', async () => {
      const markBlockedSpy = jest
        .spyOn(geminiApiAccountService, 'markAccountBlocked')
        .mockResolvedValue({ success: true })

      jest.spyOn(geminiApiAccountService, 'getAccount').mockResolvedValue({
        id: 'test-api-account',
        name: 'Test',
        isActive: 'true'
      })
      jest.spyOn(geminiApiAccountService, 'updateAccount').mockResolvedValue({})

      const mockClient = {
        del: jest.fn().mockResolvedValue(1)
      }
      jest.spyOn(redis, 'getClientSafe').mockReturnValue(mockClient)

      const result = await unifiedGeminiScheduler.markAccountBlocked(
        'test-api-account',
        'gemini-api',
        'session-hash'
      )

      expect(markBlockedSpy).toHaveBeenCalled()
      expect(result.success).toBe(true)
    })

    it('should delete session mapping when sessionHash provided', async () => {
      jest.spyOn(geminiAccountService, 'markAccountBlocked').mockResolvedValue({ success: true })

      const mockClient = {
        del: jest.fn().mockResolvedValue(1)
      }
      jest.spyOn(redis, 'getClientSafe').mockReturnValue(mockClient)

      await unifiedGeminiScheduler.markAccountBlocked(
        'test-account-id',
        'gemini',
        'session-hash-123'
      )

      expect(mockClient.del).toHaveBeenCalledWith('unified_gemini_session_mapping:session-hash-123')
    })
  })

  // ============================================
  // unifiedGeminiScheduler.markAccountUnauthorized
  // ============================================
  describe('unifiedGeminiScheduler.markAccountUnauthorized', () => {
    it('should call geminiAccountService.markAccountUnauthorized for gemini type', async () => {
      const markUnauthorizedSpy = jest
        .spyOn(geminiAccountService, 'markAccountUnauthorized')
        .mockResolvedValue({ success: true })

      const mockClient = {
        del: jest.fn().mockResolvedValue(1)
      }
      jest.spyOn(redis, 'getClientSafe').mockReturnValue(mockClient)

      const result = await unifiedGeminiScheduler.markAccountUnauthorized(
        'test-account-id',
        'gemini',
        'session-hash'
      )

      expect(markUnauthorizedSpy).toHaveBeenCalledWith('test-account-id', 'session-hash')
      expect(result.success).toBe(true)
    })

    it('should delete session mapping when sessionHash provided', async () => {
      jest
        .spyOn(geminiAccountService, 'markAccountUnauthorized')
        .mockResolvedValue({ success: true })

      const mockClient = {
        del: jest.fn().mockResolvedValue(1)
      }
      jest.spyOn(redis, 'getClientSafe').mockReturnValue(mockClient)

      await unifiedGeminiScheduler.markAccountUnauthorized(
        'test-account-id',
        'gemini',
        'session-hash-123'
      )

      expect(mockClient.del).toHaveBeenCalledWith('unified_gemini_session_mapping:session-hash-123')
    })
  })
})

// ============================================
// geminiRelayService Integration Tests
// ============================================
describe('geminiRelayService Error Handling Integration', () => {
  // Helper to create axios error with response
  function createAxiosError(status, message = 'API Error') {
    const error = new Error(message)
    error.response = {
      status,
      data: {
        error: {
          message,
          code: `ERROR_${status}`
        }
      }
    }
    return error
  }

  // Helper to create canceled error
  function createCanceledError() {
    const error = new Error('Request canceled')
    error.name = 'CanceledError'
    return error
  }

  // Helper to create network error
  function createNetworkError() {
    const error = new Error('ECONNREFUSED')
    error.code = 'ECONNREFUSED'
    return error
  }

  describe('401 Unauthorized handling', () => {
    it('should call markAccountUnauthorized when API returns 401', async () => {
      // Reset modules to ensure fresh axios mock
      jest.resetModules()

      // Mock axios before requiring geminiRelayService
      jest.doMock('axios', () => {
        const mockAxios = jest.fn().mockRejectedValue(createAxiosError(401, 'Unauthorized'))
        return mockAxios
      })

      const geminiRelayService = require('../src/services/geminiRelayService')
      const scheduler = require('../src/services/unifiedGeminiScheduler')

      const markUnauthorizedSpy = jest
        .spyOn(scheduler, 'markAccountUnauthorized')
        .mockResolvedValue({ success: true })

      try {
        await geminiRelayService.sendGeminiRequest({
          messages: [{ role: 'user', content: 'test' }],
          accessToken: 'test-token',
          accountId: 'test-account-401'
        })
      } catch (e) {
        // Expected to throw
      }

      expect(markUnauthorizedSpy).toHaveBeenCalledWith('test-account-401', 'gemini', null)

      jest.restoreAllMocks()
    })
  })

  describe('403 Forbidden handling', () => {
    it('should call markAccountBlocked when API returns 403', async () => {
      jest.resetModules()

      jest.doMock('axios', () => {
        return jest.fn().mockRejectedValue(createAxiosError(403, 'Forbidden'))
      })

      const geminiRelayService = require('../src/services/geminiRelayService')
      const scheduler = require('../src/services/unifiedGeminiScheduler')

      const markBlockedSpy = jest
        .spyOn(scheduler, 'markAccountBlocked')
        .mockResolvedValue({ success: true })

      try {
        await geminiRelayService.sendGeminiRequest({
          messages: [{ role: 'user', content: 'test' }],
          accessToken: 'test-token',
          accountId: 'test-account-403'
        })
      } catch (e) {
        // Expected to throw
      }

      expect(markBlockedSpy).toHaveBeenCalledWith('test-account-403', 'gemini', null)

      jest.restoreAllMocks()
    })
  })

  describe('429 Rate Limit handling', () => {
    it('should call setAccountRateLimited when API returns 429', async () => {
      jest.resetModules()

      jest.doMock('axios', () => {
        return jest.fn().mockRejectedValue(createAxiosError(429, 'Rate Limited'))
      })

      const geminiRelayService = require('../src/services/geminiRelayService')
      const accountService = require('../src/services/geminiAccountService')

      const setRateLimitedSpy = jest
        .spyOn(accountService, 'setAccountRateLimited')
        .mockResolvedValue({})

      try {
        await geminiRelayService.sendGeminiRequest({
          messages: [{ role: 'user', content: 'test' }],
          accessToken: 'test-token',
          accountId: 'test-account-429'
        })
      } catch (e) {
        // Expected to throw
      }

      expect(setRateLimitedSpy).toHaveBeenCalledWith('test-account-429', true)

      jest.restoreAllMocks()
    })
  })

  describe('529 Overload handling', () => {
    it('should call markAccountOverloaded when API returns 529', async () => {
      jest.resetModules()

      jest.doMock('axios', () => {
        return jest.fn().mockRejectedValue(createAxiosError(529, 'Overloaded'))
      })

      const geminiRelayService = require('../src/services/geminiRelayService')
      const accountService = require('../src/services/geminiAccountService')

      const markOverloadedSpy = jest
        .spyOn(accountService, 'markAccountOverloaded')
        .mockResolvedValue({ success: true })

      try {
        await geminiRelayService.sendGeminiRequest({
          messages: [{ role: 'user', content: 'test' }],
          accessToken: 'test-token',
          accountId: 'test-account-529'
        })
      } catch (e) {
        // Expected to throw
      }

      expect(markOverloadedSpy).toHaveBeenCalledWith('test-account-529')

      jest.restoreAllMocks()
    })
  })

  describe('5xx Server Error handling', () => {
    it('should call recordServerError when API returns 500', async () => {
      jest.resetModules()

      jest.doMock('axios', () => {
        return jest.fn().mockRejectedValue(createAxiosError(500, 'Internal Server Error'))
      })

      const geminiRelayService = require('../src/services/geminiRelayService')
      const accountService = require('../src/services/geminiAccountService')

      const recordErrorSpy = jest.spyOn(accountService, 'recordServerError').mockResolvedValue()
      jest.spyOn(accountService, 'getServerErrorCount').mockResolvedValue(1)

      try {
        await geminiRelayService.sendGeminiRequest({
          messages: [{ role: 'user', content: 'test' }],
          accessToken: 'test-token',
          accountId: 'test-account-500'
        })
      } catch (e) {
        // Expected to throw
      }

      expect(recordErrorSpy).toHaveBeenCalledWith('test-account-500', 500)

      jest.restoreAllMocks()
    })

    it('should mark account temporarily unavailable after 3 consecutive 5xx errors', async () => {
      jest.resetModules()

      jest.doMock('axios', () => {
        return jest.fn().mockRejectedValue(createAxiosError(500, 'Internal Server Error'))
      })

      const geminiRelayService = require('../src/services/geminiRelayService')
      const accountService = require('../src/services/geminiAccountService')
      const scheduler = require('../src/services/unifiedGeminiScheduler')

      jest.spyOn(accountService, 'recordServerError').mockResolvedValue()
      jest.spyOn(accountService, 'getServerErrorCount').mockResolvedValue(3)

      const markTempUnavailableSpy = jest
        .spyOn(scheduler, 'markAccountTemporarilyUnavailable')
        .mockResolvedValue({ success: true })

      try {
        await geminiRelayService.sendGeminiRequest({
          messages: [{ role: 'user', content: 'test' }],
          accessToken: 'test-token',
          accountId: 'test-account-threshold'
        })
      } catch (e) {
        // Expected to throw
      }

      expect(markTempUnavailableSpy).toHaveBeenCalledWith(
        'test-account-threshold',
        'gemini',
        null,
        300 // 5 minutes
      )

      jest.restoreAllMocks()
    })

    it('should NOT mark account temporarily unavailable if error count < 3', async () => {
      jest.resetModules()

      jest.doMock('axios', () => {
        return jest.fn().mockRejectedValue(createAxiosError(500, 'Internal Server Error'))
      })

      const geminiRelayService = require('../src/services/geminiRelayService')
      const accountService = require('../src/services/geminiAccountService')
      const scheduler = require('../src/services/unifiedGeminiScheduler')

      jest.spyOn(accountService, 'recordServerError').mockResolvedValue()
      jest.spyOn(accountService, 'getServerErrorCount').mockResolvedValue(2)

      const markTempUnavailableSpy = jest
        .spyOn(scheduler, 'markAccountTemporarilyUnavailable')
        .mockResolvedValue({ success: true })

      try {
        await geminiRelayService.sendGeminiRequest({
          messages: [{ role: 'user', content: 'test' }],
          accessToken: 'test-token',
          accountId: 'test-account-below-threshold'
        })
      } catch (e) {
        // Expected to throw
      }

      expect(markTempUnavailableSpy).not.toHaveBeenCalled()

      jest.restoreAllMocks()
    })
  })

  describe('Error handling without accountId', () => {
    it('should NOT call any marking function when accountId is null', async () => {
      jest.resetModules()

      jest.doMock('axios', () => {
        return jest.fn().mockRejectedValue(createAxiosError(401, 'Unauthorized'))
      })

      const geminiRelayService = require('../src/services/geminiRelayService')
      const accountService = require('../src/services/geminiAccountService')
      const scheduler = require('../src/services/unifiedGeminiScheduler')

      const markUnauthorizedSpy = jest.spyOn(scheduler, 'markAccountUnauthorized')
      const markBlockedSpy = jest.spyOn(scheduler, 'markAccountBlocked')
      const setRateLimitedSpy = jest.spyOn(accountService, 'setAccountRateLimited')
      const recordErrorSpy = jest.spyOn(accountService, 'recordServerError')

      try {
        await geminiRelayService.sendGeminiRequest({
          messages: [{ role: 'user', content: 'test' }],
          accessToken: 'test-token'
          // accountId not provided
        })
      } catch (e) {
        // Expected to throw
      }

      expect(markUnauthorizedSpy).not.toHaveBeenCalled()
      expect(markBlockedSpy).not.toHaveBeenCalled()
      expect(setRateLimitedSpy).not.toHaveBeenCalled()
      expect(recordErrorSpy).not.toHaveBeenCalled()

      jest.restoreAllMocks()
    })
  })

  describe('Error handling resilience', () => {
    it('should still throw original error even if marking fails', async () => {
      jest.resetModules()

      jest.doMock('axios', () => {
        return jest.fn().mockRejectedValue(createAxiosError(401, 'Unauthorized'))
      })

      const geminiRelayService = require('../src/services/geminiRelayService')
      const scheduler = require('../src/services/unifiedGeminiScheduler')

      jest
        .spyOn(scheduler, 'markAccountUnauthorized')
        .mockRejectedValue(new Error('Redis unavailable'))

      await expect(
        geminiRelayService.sendGeminiRequest({
          messages: [{ role: 'user', content: 'test' }],
          accessToken: 'test-token',
          accountId: 'test-account-resilience'
        })
      ).rejects.toMatchObject({
        status: 401
      })

      jest.restoreAllMocks()
    })

    it('should handle network errors without response object', async () => {
      jest.resetModules()

      jest.doMock('axios', () => {
        return jest.fn().mockRejectedValue(createNetworkError())
      })

      const geminiRelayService = require('../src/services/geminiRelayService')

      await expect(
        geminiRelayService.sendGeminiRequest({
          messages: [{ role: 'user', content: 'test' }],
          accessToken: 'test-token',
          accountId: 'test-account-network'
        })
      ).rejects.toMatchObject({
        status: 500,
        error: expect.objectContaining({
          type: 'network_error'
        })
      })

      jest.restoreAllMocks()
    })
  })

  describe('Request cancellation handling', () => {
    it('should return 499 status for canceled requests', async () => {
      jest.resetModules()

      jest.doMock('axios', () => {
        return jest.fn().mockRejectedValue(createCanceledError())
      })

      const geminiRelayService = require('../src/services/geminiRelayService')

      await expect(
        geminiRelayService.sendGeminiRequest({
          messages: [{ role: 'user', content: 'test' }],
          accessToken: 'test-token',
          accountId: 'test-account-cancel'
        })
      ).rejects.toMatchObject({
        status: 499,
        error: expect.objectContaining({
          type: 'canceled'
        })
      })

      jest.restoreAllMocks()
    })

    it('should NOT mark account when request is canceled', async () => {
      jest.resetModules()

      jest.doMock('axios', () => {
        return jest.fn().mockRejectedValue(createCanceledError())
      })

      const geminiRelayService = require('../src/services/geminiRelayService')
      const accountService = require('../src/services/geminiAccountService')
      const scheduler = require('../src/services/unifiedGeminiScheduler')

      const markUnauthorizedSpy = jest.spyOn(scheduler, 'markAccountUnauthorized')
      const recordErrorSpy = jest.spyOn(accountService, 'recordServerError')

      try {
        await geminiRelayService.sendGeminiRequest({
          messages: [{ role: 'user', content: 'test' }],
          accessToken: 'test-token',
          accountId: 'test-account-cancel-no-mark'
        })
      } catch (e) {
        // Expected
      }

      expect(markUnauthorizedSpy).not.toHaveBeenCalled()
      expect(recordErrorSpy).not.toHaveBeenCalled()

      jest.restoreAllMocks()
    })
  })
})
