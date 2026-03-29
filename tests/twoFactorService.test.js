jest.mock('../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  security: jest.fn(),
  success: jest.fn(),
  debug: jest.fn()
}))

const crypto = require('crypto')
const { authenticator } = require('otplib')
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

const buildService = (redis, options = {}) =>
  new TwoFactorService({
    redis,
    encryptionKey: crypto.randomBytes(32).toString('hex'),
    challengeTtlMs: 300000,
    maxChallengeAttempts: 3,
    ...options
  })

describe('TwoFactorService', () => {
  it('enables admin 2fa from setup, verifies pending challenges, and consumes recovery codes once', async () => {
    const redis = buildRedis()
    const service = buildService(redis)

    const setup = await service.createAdminSetup({
      accountName: 'admin',
      issuer: 'Claude Relay Service'
    })

    await expect(service.isTwoFactorEnabledForAdmin()).resolves.toBe(false)

    const otpCode = authenticator.generate(setup.secret)
    const enabled = await service.enableAdminTwoFactor({
      setupToken: setup.setupToken,
      otpCode
    })

    expect(enabled.recoveryCodes).toHaveLength(10)
    await expect(service.isTwoFactorEnabledForAdmin()).resolves.toBe(true)

    const challenge = await service.createPendingChallenge({
      subjectType: 'admin',
      subjectId: 'admin',
      username: 'admin',
      ip: '127.0.0.1',
      userAgent: 'jest'
    })

    const verifiedWithOtp = await service.verifyAdminSecondFactor({
      pendingLoginToken: challenge.pendingLoginToken,
      otpCode: authenticator.generate(setup.secret)
    })

    expect(verifiedWithOtp).toMatchObject({
      subjectType: 'admin',
      username: 'admin',
      usedRecoveryCode: false
    })
    await expect(service.getPendingChallenge(challenge.pendingLoginToken)).resolves.toBeNull()

    const recoveryChallenge = await service.createPendingChallenge({
      subjectType: 'admin',
      subjectId: 'admin',
      username: 'admin',
      ip: '127.0.0.1',
      userAgent: 'jest'
    })

    const verifiedWithRecoveryCode = await service.verifyAdminSecondFactor({
      pendingLoginToken: recoveryChallenge.pendingLoginToken,
      recoveryCode: enabled.recoveryCodes[0]
    })

    expect(verifiedWithRecoveryCode.usedRecoveryCode).toBe(true)

    const reusedCodeChallenge = await service.createPendingChallenge({
      subjectType: 'admin',
      subjectId: 'admin',
      username: 'admin',
      ip: '127.0.0.1',
      userAgent: 'jest'
    })

    await expect(
      service.verifyAdminSecondFactor({
        pendingLoginToken: reusedCodeChallenge.pendingLoginToken,
        recoveryCode: enabled.recoveryCodes[0]
      })
    ).rejects.toThrow('Invalid two-factor code')
  })

  it('destroys pending challenges after too many failed attempts', async () => {
    const redis = buildRedis()
    const service = buildService(redis, { maxChallengeAttempts: 2 })

    const setup = await service.createAdminSetup({
      accountName: 'admin',
      issuer: 'Claude Relay Service'
    })

    await service.enableAdminTwoFactor({
      setupToken: setup.setupToken,
      otpCode: authenticator.generate(setup.secret)
    })

    const challenge = await service.createPendingChallenge({
      subjectType: 'admin',
      subjectId: 'admin',
      username: 'admin',
      ip: '127.0.0.1',
      userAgent: 'jest'
    })

    await expect(
      service.verifyAdminSecondFactor({
        pendingLoginToken: challenge.pendingLoginToken,
        otpCode: '000000'
      })
    ).rejects.toThrow('Invalid two-factor code')

    await expect(
      service.verifyAdminSecondFactor({
        pendingLoginToken: challenge.pendingLoginToken,
        otpCode: '000000'
      })
    ).rejects.toThrow('Two-factor challenge expired')

    await expect(service.getPendingChallenge(challenge.pendingLoginToken)).resolves.toBeNull()
  })

  it('regenerates user recovery codes and resets user 2fa', async () => {
    const redis = buildRedis()
    const service = buildService(redis)

    const setup = await service.createUserSetup({
      userId: 'user-1',
      accountName: 'alice',
      issuer: 'Claude Relay Service'
    })

    const enabled = await service.enableUserTwoFactor({
      userId: 'user-1',
      setupToken: setup.setupToken,
      otpCode: authenticator.generate(setup.secret)
    })

    const regenerated = await service.regenerateUserRecoveryCodes({
      userId: 'user-1',
      otpCode: authenticator.generate(setup.secret)
    })

    expect(regenerated.recoveryCodes).toHaveLength(10)
    expect(regenerated.recoveryCodes).not.toEqual(enabled.recoveryCodes)

    const challengeUsingOldCode = await service.createPendingChallenge({
      subjectType: 'user',
      subjectId: 'user-1',
      username: 'alice',
      ip: '127.0.0.1',
      userAgent: 'jest'
    })

    await expect(
      service.verifyUserSecondFactor({
        pendingLoginToken: challengeUsingOldCode.pendingLoginToken,
        recoveryCode: enabled.recoveryCodes[0]
      })
    ).rejects.toThrow('Invalid two-factor code')

    await service.resetUserTwoFactor({ userId: 'user-1' })
    await expect(service.isTwoFactorEnabledForUser('user-1')).resolves.toBe(false)
  })
})
