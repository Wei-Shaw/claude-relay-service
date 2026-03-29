jest.mock('../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  security: jest.fn(),
  success: jest.fn(),
  debug: jest.fn()
}))

const crypto = require('crypto')
const TwoFactorService = require('../src/services/twoFactorService')

const buildRedis = () => {
  const kv = new Map()
  return {
    get: jest.fn(async (key) => kv.get(key) ?? null),
    set: jest.fn(async (key, value) => kv.set(key, value)),
    setex: jest.fn(async (key, ttl, value) => kv.set(key, value)),
    del: jest.fn(async (key) => kv.delete(key)),
    scanKeys: jest.fn(async (pattern) => {
      const prefix = pattern.replace('*', '')
      return [...kv.keys()].filter((key) => key.startsWith(prefix))
    }),
    batchGetChunked: jest.fn(async (keys) => keys.map((key) => kv.get(key) ?? null))
  }
}

describe('TwoFactorService', () => {
  it('creates encrypted setup material, single-use challenges, and one-time recovery codes', async () => {
    const redis = buildRedis()
    const service = new TwoFactorService({
      redis,
      encryptionKey: crypto.randomBytes(32).toString('hex'),
      challengeTtlMs: 300000,
      maxChallengeAttempts: 5
    })

    const setup = await service.createSetup({
      subjectType: 'admin',
      subjectId: 'admin',
      accountName: 'admin',
      issuer: 'Claude Relay Service'
    })

    expect(setup.otpauthUrl).toContain('otpauth://totp/')
    expect(setup.secret).toMatch(/^[A-Z2-7]+=*$/)
    expect(setup.recoveryCodes).toHaveLength(10)
    expect(setup.secretCiphertext).not.toContain(setup.secret)

    const challenge = await service.createPendingChallenge({
      subjectType: 'admin',
      subjectId: 'admin',
      username: 'admin',
      ip: '127.0.0.1',
      userAgent: 'jest'
    })

    const storedChallenge = await service.getPendingChallenge(challenge.pendingLoginToken)
    expect(storedChallenge).toMatchObject({
      subjectType: 'admin',
      subjectId: 'admin',
      username: 'admin'
    })

    await service.consumePendingChallenge(challenge.pendingLoginToken)
    await expect(service.getPendingChallenge(challenge.pendingLoginToken)).resolves.toBeNull()

    const hashedCodes = await service.hashRecoveryCodes(setup.recoveryCodes)
    const firstCode = setup.recoveryCodes[0]

    await expect(service.verifyRecoveryCode(firstCode, hashedCodes)).resolves.toBe(true)
    const remaining = await service.consumeRecoveryCode(firstCode, hashedCodes)
    await expect(service.verifyRecoveryCode(firstCode, remaining)).resolves.toBe(false)
  })
})
