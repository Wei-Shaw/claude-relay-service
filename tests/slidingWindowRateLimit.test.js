jest.mock('../src/models/redis', () => ({
  getClientSafe: jest.fn()
}))
jest.mock('../src/utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}))

const slidingWindowRateLimit = require('../src/utils/slidingWindowRateLimit')

function createFakeRedisClient() {
  const strings = new Map()
  const hashes = new Map()

  const ensureHash = (key) => {
    if (!hashes.has(key)) {
      hashes.set(key, {})
    }
    return hashes.get(key)
  }

  return {
    strings,
    hashes,
    async get(key) {
      return strings.has(key) ? strings.get(key) : null
    },
    async hgetall(key) {
      return { ...(hashes.get(key) || {}) }
    },
    async hget(key, field) {
      const hash = hashes.get(key) || {}
      return Object.prototype.hasOwnProperty.call(hash, field) ? hash[field] : null
    },
    async hset(key, field, value) {
      const hash = ensureHash(key)
      hash[field] = value
      return 1
    },
    async hdel(key, ...fields) {
      const hash = hashes.get(key)
      if (!hash) {
        return 0
      }

      let deleted = 0
      for (const field of fields) {
        if (Object.prototype.hasOwnProperty.call(hash, field)) {
          delete hash[field]
          deleted += 1
        }
      }
      return deleted
    },
    async expire() {
      return 1
    },
    pipeline() {
      const commands = []
      const pipelineApi = {
        hgetall(key) {
          commands.push(['hgetall', key])
          return pipelineApi
        },
        hset(key, field, value) {
          commands.push(['hset', key, field, value])
          return pipelineApi
        },
        expire(key, ttl) {
          commands.push(['expire', key, ttl])
          return pipelineApi
        },
        hdel(key, ...fields) {
          commands.push(['hdel', key, ...fields])
          return pipelineApi
        },
        async exec() {
          const results = []
          for (const [command, ...args] of commands) {
            // eslint-disable-next-line no-await-in-loop
            const value = await this._apply(command, args)
            results.push([null, value])
          }
          return results
        },
        async _apply(command, args) {
          switch (command) {
            case 'hgetall':
              return { ...(hashes.get(args[0]) || {}) }
            case 'hset': {
              const [key, field, value] = args
              const hash = ensureHash(key)
              hash[field] = value
              return 1
            }
            case 'expire':
              return 1
            case 'hdel': {
              const [key, ...fields] = args
              const hash = hashes.get(key)
              if (!hash) {
                return 0
              }
              let deleted = 0
              for (const field of fields) {
                if (Object.prototype.hasOwnProperty.call(hash, field)) {
                  delete hash[field]
                  deleted += 1
                }
              }
              return deleted
            }
            default:
              throw new Error(`Unsupported pipeline command: ${command}`)
          }
        }
      }
      return pipelineApi
    }
  }
}

describe('slidingWindowRateLimit', () => {
  test('buildSnapshotFromBuckets only sums buckets inside the rolling window', () => {
    const now = Date.UTC(2026, 0, 1, 10, 30, 0)
    const currentBucket = Math.floor(now / 60000)
    const rawBuckets = {
      [currentBucket - 70]: slidingWindowRateLimit.serializeBucketValue({
        requests: 9,
        tokens: 900,
        cost: 9.5
      }),
      [currentBucket - 59]: slidingWindowRateLimit.serializeBucketValue({
        requests: 2,
        tokens: 200,
        cost: 2.25
      }),
      [currentBucket - 5]: slidingWindowRateLimit.serializeBucketValue({
        requests: 3,
        tokens: 300,
        cost: 3.75
      })
    }

    const snapshot = slidingWindowRateLimit.buildSnapshotFromBuckets(rawBuckets, 60, now)

    expect(snapshot.hasActiveWindow).toBe(true)
    expect(snapshot.requests).toBe(5)
    expect(snapshot.tokens).toBe(500)
    expect(snapshot.cost).toBe(6)
    expect(snapshot.windowStartTime).toBe((currentBucket - 59) * 60000)
    expect(snapshot.windowEndTime).toBe((currentBucket - 58) * 60000 + 60 * 60000)
    expect(snapshot.staleFields).toContain(String(currentBucket - 70))
  })

  test('getWindowSnapshot migrates legacy fixed-window counters into sliding buckets', async () => {
    const client = createFakeRedisClient()
    const keyId = 'key-123'
    const now = Date.UTC(2026, 0, 2, 12, 0, 0)
    const legacyWindowStart = now - 20 * 60 * 1000

    client.strings.set(`rate_limit:requests:${keyId}`, '4')
    client.strings.set(`rate_limit:tokens:${keyId}`, '1200')
    client.strings.set(`rate_limit:cost:${keyId}`, '18.5')
    client.strings.set(`rate_limit:window_start:${keyId}`, String(legacyWindowStart))

    const snapshot = await slidingWindowRateLimit.getWindowSnapshot(keyId, 60, {
      client,
      now
    })

    expect(snapshot.hasActiveWindow).toBe(true)
    expect(snapshot.requests).toBe(4)
    expect(snapshot.tokens).toBe(1200)
    expect(snapshot.cost).toBe(18.5)

    const bucketKey = slidingWindowRateLimit._private.getBucketKey(keyId)
    const migratedBuckets = await client.hgetall(bucketKey)
    expect(Object.keys(migratedBuckets)).toHaveLength(1)

    const migratedValue = Object.values(migratedBuckets)[0]
    expect(migratedValue).toBe(
      slidingWindowRateLimit.serializeBucketValue({ requests: 4, tokens: 1200, cost: 18.5 })
    )
  })
})
