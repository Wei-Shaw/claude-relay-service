/**
 * 用户消息队列服务测试
 * 测试消息类型检测、队列串行行为、延迟间隔、超时处理和功能开关
 */

const redis = require('../src/models/redis')
const userMessageQueueService = require('../src/services/userMessageQueueService')

describe('UserMessageQueueService', () => {
  describe('isUserMessageRequest', () => {
    it('should return true when last message role is user', () => {
      const requestBody = {
        messages: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi there' },
          { role: 'user', content: 'How are you?' }
        ]
      }
      expect(userMessageQueueService.isUserMessageRequest(requestBody)).toBe(true)
    })

    it('should return false when last message role is assistant', () => {
      const requestBody = {
        messages: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi there' }
        ]
      }
      expect(userMessageQueueService.isUserMessageRequest(requestBody)).toBe(false)
    })

    it('should return false when last message contains tool_result', () => {
      const requestBody = {
        messages: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Let me check that' },
          {
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: 'test-id',
                content: 'Tool result'
              }
            ]
          }
        ]
      }
      // tool_result 消息虽然 role 是 user，但不是真正的用户消息
      // 应该返回 false，不进入用户消息队列
      expect(userMessageQueueService.isUserMessageRequest(requestBody)).toBe(false)
    })

    it('should return false when last message contains multiple tool_results', () => {
      const requestBody = {
        messages: [
          { role: 'user', content: 'Run multiple tools' },
          {
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: 'tool-1',
                content: 'Result 1'
              },
              {
                type: 'tool_result',
                tool_use_id: 'tool-2',
                content: 'Result 2'
              }
            ]
          }
        ]
      }
      expect(userMessageQueueService.isUserMessageRequest(requestBody)).toBe(false)
    })

    it('should return true when user message has array content with text type', () => {
      const requestBody = {
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Hello, this is a user message'
              }
            ]
          }
        ]
      }
      expect(userMessageQueueService.isUserMessageRequest(requestBody)).toBe(true)
    })

    it('should return true when user message has mixed text and image content', () => {
      const requestBody = {
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'What is in this image?'
              },
              {
                type: 'image',
                source: { type: 'base64', media_type: 'image/png', data: '...' }
              }
            ]
          }
        ]
      }
      expect(userMessageQueueService.isUserMessageRequest(requestBody)).toBe(true)
    })

    it('should return false when messages is empty', () => {
      const requestBody = { messages: [] }
      expect(userMessageQueueService.isUserMessageRequest(requestBody)).toBe(false)
    })

    it('should return false when messages is not an array', () => {
      const requestBody = { messages: 'not an array' }
      expect(userMessageQueueService.isUserMessageRequest(requestBody)).toBe(false)
    })

    it('should return false when messages is undefined', () => {
      const requestBody = {}
      expect(userMessageQueueService.isUserMessageRequest(requestBody)).toBe(false)
    })

    it('should return false when requestBody is null', () => {
      expect(userMessageQueueService.isUserMessageRequest(null)).toBe(false)
    })

    it('should return false when requestBody is undefined', () => {
      expect(userMessageQueueService.isUserMessageRequest(undefined)).toBe(false)
    })

    it('should return false when last message has no role', () => {
      const requestBody = {
        messages: [{ content: 'Hello' }]
      }
      expect(userMessageQueueService.isUserMessageRequest(requestBody)).toBe(false)
    })

    it('should handle single user message', () => {
      const requestBody = {
        messages: [{ role: 'user', content: 'Hello' }]
      }
      expect(userMessageQueueService.isUserMessageRequest(requestBody)).toBe(true)
    })

    it('should handle single assistant message', () => {
      const requestBody = {
        messages: [{ role: 'assistant', content: 'Hello' }]
      }
      expect(userMessageQueueService.isUserMessageRequest(requestBody)).toBe(false)
    })
  })

  describe('getConfig', () => {
    it('should return config with expected properties', async () => {
      const config = await userMessageQueueService.getConfig()
      expect(config).toHaveProperty('enabled')
      expect(config).toHaveProperty('delayMs')
      expect(config).toHaveProperty('timeoutMs')
      expect(config).toHaveProperty('lockTtlMs')
      expect(typeof config.enabled).toBe('boolean')
      expect(typeof config.delayMs).toBe('number')
      expect(typeof config.timeoutMs).toBe('number')
      expect(typeof config.lockTtlMs).toBe('number')
    })
  })

  describe('isEnabled', () => {
    it('should return boolean', async () => {
      const enabled = await userMessageQueueService.isEnabled()
      expect(typeof enabled).toBe('boolean')
    })
  })

  describe('acquireQueueLock', () => {
    afterEach(() => {
      jest.restoreAllMocks()
    })

    it('should acquire lock immediately when no lock exists', async () => {
      jest.spyOn(userMessageQueueService, 'getConfig').mockResolvedValue({
        enabled: true,
        delayMs: 200,
        timeoutMs: 30000,
        lockTtlMs: 120000
      })
      jest.spyOn(redis, 'acquireUserMessageLock').mockResolvedValue({
        acquired: true,
        waitMs: 0
      })

      const result = await userMessageQueueService.acquireQueueLock('acct-1', 'req-1')

      expect(result.acquired).toBe(true)
      expect(result.requestId).toBe('req-1')
      expect(result.error).toBeUndefined()
    })

    it('should skip lock acquisition when queue disabled', async () => {
      jest.spyOn(userMessageQueueService, 'getConfig').mockResolvedValue({
        enabled: false,
        delayMs: 200,
        timeoutMs: 30000,
        lockTtlMs: 120000
      })
      const acquireSpy = jest.spyOn(redis, 'acquireUserMessageLock')

      const result = await userMessageQueueService.acquireQueueLock('acct-1')

      expect(result.acquired).toBe(true)
      expect(result.skipped).toBe(true)
      expect(acquireSpy).not.toHaveBeenCalled()
    })

    it('should generate requestId when not provided', async () => {
      jest.spyOn(userMessageQueueService, 'getConfig').mockResolvedValue({
        enabled: true,
        delayMs: 200,
        timeoutMs: 30000,
        lockTtlMs: 120000
      })
      jest.spyOn(redis, 'acquireUserMessageLock').mockResolvedValue({
        acquired: true,
        waitMs: 0
      })

      const result = await userMessageQueueService.acquireQueueLock('acct-1')

      expect(result.acquired).toBe(true)
      expect(result.requestId).toBeDefined()
      expect(result.requestId.length).toBeGreaterThan(0)
    })

    it('should wait and retry when lock is held by another request', async () => {
      jest.spyOn(userMessageQueueService, 'getConfig').mockResolvedValue({
        enabled: true,
        delayMs: 200,
        timeoutMs: 1000,
        lockTtlMs: 120000
      })

      let callCount = 0
      jest.spyOn(redis, 'acquireUserMessageLock').mockImplementation(async () => {
        callCount++
        if (callCount < 3) {
          return { acquired: false, waitMs: -1 } // lock held
        }
        return { acquired: true, waitMs: 0 }
      })

      // Mock sleep to speed up test
      jest.spyOn(userMessageQueueService, '_sleep').mockResolvedValue(undefined)

      const result = await userMessageQueueService.acquireQueueLock('acct-1', 'req-1')

      expect(result.acquired).toBe(true)
      expect(callCount).toBe(3)
    })

    it('should respect delay when previous request just completed', async () => {
      jest.spyOn(userMessageQueueService, 'getConfig').mockResolvedValue({
        enabled: true,
        delayMs: 200,
        timeoutMs: 1000,
        lockTtlMs: 120000
      })

      let callCount = 0
      jest.spyOn(redis, 'acquireUserMessageLock').mockImplementation(async () => {
        callCount++
        if (callCount === 1) {
          return { acquired: false, waitMs: 150 } // need to wait 150ms for delay
        }
        return { acquired: true, waitMs: 0 }
      })

      const sleepSpy = jest.spyOn(userMessageQueueService, '_sleep').mockResolvedValue(undefined)

      const result = await userMessageQueueService.acquireQueueLock('acct-1', 'req-1')

      expect(result.acquired).toBe(true)
      expect(sleepSpy).toHaveBeenCalledWith(150) // Should wait for delay
    })

    it('should timeout and return error when wait exceeds timeout', async () => {
      jest.spyOn(userMessageQueueService, 'getConfig').mockResolvedValue({
        enabled: true,
        delayMs: 200,
        timeoutMs: 100, // very short timeout
        lockTtlMs: 120000
      })

      jest.spyOn(redis, 'acquireUserMessageLock').mockResolvedValue({
        acquired: false,
        waitMs: -1 // always held
      })

      // Use real timers for timeout test but mock sleep to be instant
      jest.spyOn(userMessageQueueService, '_sleep').mockImplementation(async () => {
        // Simulate time passing
        await new Promise((resolve) => setTimeout(resolve, 60))
      })

      const result = await userMessageQueueService.acquireQueueLock('acct-1', 'req-1', 100)

      expect(result.acquired).toBe(false)
      expect(result.error).toBe('queue_timeout')
    })
  })

  describe('releaseQueueLock', () => {
    afterEach(() => {
      jest.restoreAllMocks()
    })

    it('should release lock successfully when holding the lock', async () => {
      jest.spyOn(redis, 'releaseUserMessageLock').mockResolvedValue(true)

      const result = await userMessageQueueService.releaseQueueLock('acct-1', 'req-1')

      expect(result).toBe(true)
      expect(redis.releaseUserMessageLock).toHaveBeenCalledWith('acct-1', 'req-1')
    })

    it('should return false when not holding the lock', async () => {
      jest.spyOn(redis, 'releaseUserMessageLock').mockResolvedValue(false)

      const result = await userMessageQueueService.releaseQueueLock('acct-1', 'req-1')

      expect(result).toBe(false)
    })

    it('should return false when accountId is missing', async () => {
      const releaseSpy = jest.spyOn(redis, 'releaseUserMessageLock')

      const result = await userMessageQueueService.releaseQueueLock(null, 'req-1')

      expect(result).toBe(false)
      expect(releaseSpy).not.toHaveBeenCalled()
    })

    it('should return false when requestId is missing', async () => {
      const releaseSpy = jest.spyOn(redis, 'releaseUserMessageLock')

      const result = await userMessageQueueService.releaseQueueLock('acct-1', null)

      expect(result).toBe(false)
      expect(releaseSpy).not.toHaveBeenCalled()
    })
  })

  describe('queue serialization behavior', () => {
    afterEach(() => {
      jest.restoreAllMocks()
    })

    it('should allow different accounts to acquire locks simultaneously', async () => {
      jest.spyOn(userMessageQueueService, 'getConfig').mockResolvedValue({
        enabled: true,
        delayMs: 200,
        timeoutMs: 30000,
        lockTtlMs: 120000
      })
      jest.spyOn(redis, 'acquireUserMessageLock').mockResolvedValue({
        acquired: true,
        waitMs: 0
      })

      const [result1, result2] = await Promise.all([
        userMessageQueueService.acquireQueueLock('acct-1', 'req-1'),
        userMessageQueueService.acquireQueueLock('acct-2', 'req-2')
      ])

      expect(result1.acquired).toBe(true)
      expect(result2.acquired).toBe(true)
    })

    it('should serialize requests for same account', async () => {
      jest.spyOn(userMessageQueueService, 'getConfig').mockResolvedValue({
        enabled: true,
        delayMs: 50,
        timeoutMs: 5000,
        lockTtlMs: 120000
      })

      const lockState = { held: false, holderId: null }

      jest
        .spyOn(redis, 'acquireUserMessageLock')
        .mockImplementation(async (accountId, requestId) => {
          if (!lockState.held) {
            lockState.held = true
            lockState.holderId = requestId
            return { acquired: true, waitMs: 0 }
          }
          return { acquired: false, waitMs: -1 }
        })

      jest
        .spyOn(redis, 'releaseUserMessageLock')
        .mockImplementation(async (accountId, requestId) => {
          if (lockState.holderId === requestId) {
            lockState.held = false
            lockState.holderId = null
            return true
          }
          return false
        })

      jest.spyOn(userMessageQueueService, '_sleep').mockResolvedValue(undefined)

      // First request acquires lock
      const result1 = await userMessageQueueService.acquireQueueLock('acct-1', 'req-1')
      expect(result1.acquired).toBe(true)

      // Second request should fail to acquire (lock held)
      const acquirePromise = userMessageQueueService.acquireQueueLock('acct-1', 'req-2', 200)

      // Release first lock
      await userMessageQueueService.releaseQueueLock('acct-1', 'req-1')

      // Now second request should acquire
      const result2 = await acquirePromise
      expect(result2.acquired).toBe(true)
    })
  })
})
