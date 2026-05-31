jest.mock('../src/utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  success: jest.fn(),
  security: jest.fn(),
  api: jest.fn()
}))

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

describe('quota card redemption concurrency', () => {
  let redis
  let apiKeyService
  let cardStore
  let codeIndex
  let apiKeyStore
  let locks
  let redemptionIds

  beforeEach(() => {
    jest.resetModules()

    cardStore = new Map([
      [
        'card-1',
        {
          id: 'card-1',
          code: 'CC_RACE_0001',
          type: 'quota',
          quotaAmount: '10',
          timeAmount: '0',
          timeUnit: 'days',
          status: 'unused',
          createdBy: 'admin',
          createdAt: '2026-01-01T00:00:00.000Z',
          expiresAt: '',
          note: ''
        }
      ]
    ])
    codeIndex = new Map([['quota_card_code:CC_RACE_0001', 'card-1']])
    apiKeyStore = new Map([
      ['key-1', { id: 'key-1', name: 'Race Key', totalCostLimit: '0', expiresAt: '' }]
    ])
    locks = new Map()
    redemptionIds = []

    redis = {
      getApiKey: jest.fn(async (keyId) => apiKeyStore.get(keyId) || {}),
      setAccountLock: jest.fn(async (lockKey, lockValue) => {
        if (locks.has(lockKey)) {
          return false
        }
        locks.set(lockKey, lockValue)
        return true
      }),
      releaseAccountLock: jest.fn(async (lockKey, lockValue) => {
        if (locks.get(lockKey) === lockValue) {
          locks.delete(lockKey)
          return true
        }
        return false
      }),
      client: {
        get: jest.fn(async (key) => {
          if (key === 'system:quota_card_limits') {
            return null
          }
          return codeIndex.get(key) || null
        }),
        hgetall: jest.fn(async (key) => {
          if (key.startsWith('quota_card:')) {
            return { ...(cardStore.get(key.replace('quota_card:', '')) || {}) }
          }
          return {}
        }),
        hset: jest.fn(async (key, fields, ...values) => {
          if (key.startsWith('quota_card:')) {
            const card = cardStore.get(key.replace('quota_card:', ''))
            Object.assign(card, fields)
          } else if (key.startsWith('redemption:')) {
            redemptionIds.push(key.replace('redemption:', ''))
          } else if (key.startsWith('apikey:')) {
            const keyData = apiKeyStore.get(key.replace('apikey:', ''))
            if (typeof fields === 'string') {
              keyData[fields] = values[0]
            } else {
              Object.assign(keyData, fields)
            }
          }
        }),
        srem: jest.fn(),
        sadd: jest.fn()
      }
    }

    apiKeyService = {
      addTotalCostLimit: jest.fn(async (keyId, amount) => {
        await wait(25)
        const keyData = apiKeyStore.get(keyId)
        const previousLimit = parseFloat(keyData.totalCostLimit || 0)
        const newTotalCostLimit = previousLimit + amount
        keyData.totalCostLimit = String(newTotalCostLimit)
        return {
          success: true,
          previousLimit,
          newTotalCostLimit,
          actualAdded: amount,
          capped: false
        }
      }),
      extendExpiry: jest.fn()
    }

    jest.doMock('../src/models/redis', () => redis)
    jest.doMock('../src/services/apiKeyService', () => apiKeyService)
  })

  it('allows only one concurrent redemption for the same card', async () => {
    const quotaCardService = require('../src/services/quotaCardService')

    const results = await Promise.allSettled([
      quotaCardService.redeemCard('CC_RACE_0001', 'key-1', 'user-1', 'alice'),
      quotaCardService.redeemCard('CC_RACE_0001', 'key-1', 'user-1', 'alice')
    ])

    const fulfilled = results.filter((result) => result.status === 'fulfilled')
    const rejected = results.filter((result) => result.status === 'rejected')

    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    expect(rejected[0].reason.message).toContain('已使用')
    expect(apiKeyService.addTotalCostLimit).toHaveBeenCalledTimes(1)
    expect(apiKeyStore.get('key-1').totalCostLimit).toBe('10')
    expect(redemptionIds).toHaveLength(1)
    expect(cardStore.get('card-1').status).toBe('redeemed')
  })
})

describe('API key quota and expiry mutations', () => {
  let redis
  let keyStore
  let locks

  beforeEach(() => {
    jest.resetModules()
    jest.dontMock('../src/services/apiKeyService')

    keyStore = new Map([
      [
        'apikey:key-1',
        {
          id: 'key-1',
          totalCostLimit: '0',
          expiresAt: '2030-01-01T00:00:00.000Z'
        }
      ]
    ])
    locks = new Map()

    redis = {
      getApiKey: jest.fn(async (keyId) => ({ ...(keyStore.get(`apikey:${keyId}`) || {}) })),
      setAccountLock: jest.fn(async (lockKey, lockValue) => {
        if (locks.has(lockKey)) {
          return false
        }
        locks.set(lockKey, lockValue)
        return true
      }),
      releaseAccountLock: jest.fn(async (lockKey, lockValue) => {
        if (locks.get(lockKey) === lockValue) {
          locks.delete(lockKey)
          return true
        }
        return false
      }),
      client: {
        eval: jest.fn(async (_script, _keyCount, key, amount, maxTotalCostLimit) => {
          const keyData = keyStore.get(key)
          if (!keyData) {
            return [0, '0', '0', '0', 0]
          }

          const currentLimit = parseFloat(keyData.totalCostLimit || 0)
          const requestedAdd = parseFloat(amount)
          const maxLimit = parseFloat(maxTotalCostLimit || 0)
          let actualAdded = requestedAdd

          if (maxLimit > 0 && currentLimit + actualAdded > maxLimit) {
            actualAdded = Math.max(0, maxLimit - currentLimit)
          }

          const newTotalCostLimit = currentLimit + actualAdded
          keyData.totalCostLimit = String(newTotalCostLimit)
          return [
            1,
            String(currentLimit),
            String(newTotalCostLimit),
            String(actualAdded),
            actualAdded < requestedAdd ? 1 : 0
          ]
        }),
        hset: jest.fn(async (key, ...args) => {
          const keyData = keyStore.get(key)
          for (let i = 0; i < args.length; i += 2) {
            keyData[args[i]] = args[i + 1]
          }
        })
      }
    }

    jest.doMock('../src/models/redis', () => redis)
    jest.doMock('../src/services/serviceRatesService', () => ({}))
    jest.doMock('../src/services/requestDetailService', () => ({}))
    jest.doMock('../src/services/requestBodyRuleService', () => ({}))
  })

  it('uses an atomic Redis mutation for concurrent quota additions', async () => {
    const apiKeyService = require('../src/services/apiKeyService')

    await Promise.all([
      apiKeyService.addTotalCostLimit('key-1', 5),
      apiKeyService.addTotalCostLimit('key-1', 7)
    ])

    expect(redis.client.eval).toHaveBeenCalledTimes(2)
    expect(parseFloat(keyStore.get('apikey:key-1').totalCostLimit)).toBe(12)
  })

  it('serializes concurrent expiry extensions against the latest stored expiry', async () => {
    const apiKeyService = require('../src/services/apiKeyService')

    await Promise.all([
      apiKeyService.extendExpiry('key-1', 1, 'days'),
      apiKeyService.extendExpiry('key-1', 1, 'days')
    ])

    expect(keyStore.get('apikey:key-1').expiresAt).toBe('2030-01-03T00:00:00.000Z')
    expect(redis.client.hset).toHaveBeenCalledTimes(2)
  })
})
