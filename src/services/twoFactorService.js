const crypto = require('crypto')
const { authenticator } = require('otplib')
const QRCode = require('qrcode')

class TwoFactorService {
  constructor({
    redis,
    encryptionKey,
    challengeTtlMs = 300000,
    setupTtlMs = 600000,
    maxChallengeAttempts = 5,
    recoveryCodesCount = 10
  }) {
    this.redis = redis
    this.challengeTtlMs = challengeTtlMs
    this.setupTtlMs = setupTtlMs
    this.maxChallengeAttempts = maxChallengeAttempts
    this.recoveryCodesCount = recoveryCodesCount
    this.encryptionKey = this.normalizeKey(encryptionKey)

    authenticator.options = {
      ...authenticator.options,
      step: 30,
      window: 1
    }
  }

  normalizeKey(value) {
    return crypto
      .createHash('sha256')
      .update(String(value || ''))
      .digest()
  }

  now() {
    return new Date().toISOString()
  }

  adminConfigKey() {
    return 'admin_2fa_config'
  }

  userConfigKey(userId) {
    return `user_2fa:${userId}`
  }

  setupKey(subjectType, setupToken) {
    return `twofactor_setup:${subjectType}:${setupToken}`
  }

  challengeKey(subjectType, token) {
    return `${subjectType}_login_challenge:${token}`
  }

  async readJson(key) {
    const value = await this.redis.get(key)
    return value ? JSON.parse(value) : null
  }

  async writeJson(key, value, ttlMs = null) {
    const payload = JSON.stringify(value)
    if (ttlMs) {
      await this.redis.setex(key, Math.max(1, Math.floor(ttlMs / 1000)), payload)
      return
    }

    await this.redis.set(key, payload)
  }

  async deleteKey(key) {
    await this.redis.del(key)
  }

  encryptSecret(secret) {
    const iv = crypto.randomBytes(12)
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv)
    const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()])
    const authTag = cipher.getAuthTag()

    return {
      secretCiphertext: Buffer.concat([ciphertext, authTag]).toString('base64'),
      secretIv: iv.toString('base64')
    }
  }

  decryptSecret(secretCiphertext, secretIv) {
    const raw = Buffer.from(secretCiphertext, 'base64')
    const iv = Buffer.from(secretIv, 'base64')
    const authTag = raw.subarray(raw.length - 16)
    const ciphertext = raw.subarray(0, raw.length - 16)
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey, iv)
    decipher.setAuthTag(authTag)

    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
  }

  normalizeRecoveryCode(code) {
    return String(code || '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
  }

  generateRecoveryCodes() {
    return Array.from({ length: this.recoveryCodesCount }, () =>
      crypto.randomBytes(5).toString('hex').toUpperCase()
    )
  }

  hashRecoveryCode(code) {
    const normalized = this.normalizeRecoveryCode(code)
    return crypto.createHash('sha256').update(`twofactor:${normalized}`).digest('hex')
  }

  async hashRecoveryCodes(codes) {
    return codes.map((code) => this.hashRecoveryCode(code))
  }

  async verifyRecoveryCode(code, storedHashes) {
    const candidate = this.hashRecoveryCode(code)
    return storedHashes.some((hash) => {
      if (typeof hash !== 'string' || hash.length !== candidate.length) {
        return false
      }

      return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(candidate))
    })
  }

  async consumeRecoveryCode(code, storedHashes) {
    const candidate = this.hashRecoveryCode(code)
    return storedHashes.filter((hash) => hash !== candidate)
  }

  normalizeOtpCode(code) {
    return String(code || '').replace(/\s+/g, '')
  }

  verifyOtpCode(code, secret) {
    const normalizedCode = this.normalizeOtpCode(code)
    if (!/^\d{6}$/.test(normalizedCode)) {
      return false
    }

    return authenticator.check(normalizedCode, secret)
  }

  async createSetup({ subjectType, subjectId, accountName, issuer }) {
    const secret = authenticator.generateSecret()
    const setupToken = crypto.randomBytes(32).toString('hex')
    const otpauthUrl = authenticator.keyuri(accountName, issuer, secret)
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl)
    const encryptedSecret = this.encryptSecret(secret)
    const record = {
      subjectType,
      subjectId,
      setupToken,
      accountName,
      createdAt: this.now(),
      ...encryptedSecret
    }

    await this.writeJson(this.setupKey(subjectType, setupToken), record, this.setupTtlMs)

    return {
      subjectType,
      subjectId,
      setupToken,
      secret,
      otpauthUrl,
      qrCodeDataUrl
    }
  }

  async createAdminSetup({ accountName, issuer }) {
    return this.createSetup({
      subjectType: 'admin',
      subjectId: 'admin',
      accountName,
      issuer
    })
  }

  async createUserSetup({ userId, accountName, issuer }) {
    return this.createSetup({
      subjectType: 'user',
      subjectId: userId,
      accountName,
      issuer
    })
  }

  async getSetup(setupToken, subjectType) {
    return this.readJson(this.setupKey(subjectType, setupToken))
  }

  async deleteSetup(setupToken, subjectType) {
    await this.deleteKey(this.setupKey(subjectType, setupToken))
  }

  async getAdminConfig() {
    return this.readJson(this.adminConfigKey())
  }

  async getUserConfig(userId) {
    return this.readJson(this.userConfigKey(userId))
  }

  async saveAdminConfig(config) {
    await this.writeJson(this.adminConfigKey(), config)
  }

  async saveUserConfig(userId, config) {
    await this.writeJson(this.userConfigKey(userId), config)
  }

  async deleteAdminConfig() {
    await this.deleteKey(this.adminConfigKey())
  }

  async deleteUserConfig(userId) {
    await this.deleteKey(this.userConfigKey(userId))
  }

  async isTwoFactorEnabledForAdmin() {
    const config = await this.getAdminConfig()
    return Boolean(config?.enabled)
  }

  async isTwoFactorEnabledForUser(userId) {
    const config = await this.getUserConfig(userId)
    return Boolean(config?.enabled)
  }

  async getAdminStatus() {
    const config = await this.getAdminConfig()
    return this.buildStatus(config)
  }

  async getUserStatus(userId) {
    const config = await this.getUserConfig(userId)
    return this.buildStatus(config)
  }

  buildStatus(config) {
    return {
      enabled: Boolean(config?.enabled),
      recoveryCodesGeneratedAt: config?.recoveryCodesGeneratedAt || null,
      enabledAt: config?.enabledAt || null,
      updatedAt: config?.updatedAt || null,
      lastVerifiedAt: config?.lastVerifiedAt || null
    }
  }

  async enableTwoFactorFromSetup({ subjectType, subjectId, setupToken, otpCode }) {
    const setup = await this.getSetup(setupToken, subjectType)
    if (!setup) {
      throw new Error('Two-factor setup session expired')
    }

    if (setup.subjectId !== subjectId) {
      throw new Error('Two-factor setup does not match account')
    }

    const secret = this.decryptSecret(setup.secretCiphertext, setup.secretIv)
    if (!this.verifyOtpCode(otpCode, secret)) {
      throw new Error('Invalid two-factor code')
    }

    const now = this.now()
    const recoveryCodes = this.generateRecoveryCodes()
    const config = {
      enabled: true,
      secretCiphertext: setup.secretCiphertext,
      secretIv: setup.secretIv,
      recoveryCodeHashes: await this.hashRecoveryCodes(recoveryCodes),
      recoveryCodesGeneratedAt: now,
      enabledAt: now,
      updatedAt: now,
      lastVerifiedAt: now
    }

    if (subjectType === 'admin') {
      await this.saveAdminConfig(config)
    } else {
      await this.saveUserConfig(subjectId, config)
    }

    await this.deleteSetup(setupToken, subjectType)

    return {
      recoveryCodes,
      recoveryCodesGeneratedAt: now,
      enabledAt: now
    }
  }

  async enableAdminTwoFactor({ setupToken, otpCode }) {
    return this.enableTwoFactorFromSetup({
      subjectType: 'admin',
      subjectId: 'admin',
      setupToken,
      otpCode
    })
  }

  async enableUserTwoFactor({ userId, setupToken, otpCode }) {
    return this.enableTwoFactorFromSetup({
      subjectType: 'user',
      subjectId: userId,
      setupToken,
      otpCode
    })
  }

  async createPendingChallenge(payload) {
    const pendingLoginToken = crypto.randomBytes(32).toString('hex')
    const createdAt = this.now()
    const record = {
      ...payload,
      attemptCount: 0,
      recoveryAttemptCount: 0,
      createdAt,
      passwordValidatedAt: payload.passwordValidatedAt || createdAt
    }

    await this.writeJson(
      this.challengeKey(payload.subjectType, pendingLoginToken),
      record,
      this.challengeTtlMs
    )

    return {
      pendingLoginToken,
      pendingLoginExpiresIn: this.challengeTtlMs
    }
  }

  async getPendingChallenge(token, subjectType = null) {
    const prefixes = subjectType ? [subjectType] : ['admin', 'user']

    for (const prefix of prefixes) {
      const data = await this.readJson(this.challengeKey(prefix, token))
      if (data) {
        return data
      }
    }

    return null
  }

  async updatePendingChallenge(token, subjectType, record) {
    await this.writeJson(this.challengeKey(subjectType, token), record, this.challengeTtlMs)
  }

  async deletePendingChallenge(token, subjectType = null) {
    const prefixes = subjectType ? [subjectType] : ['admin', 'user']

    for (const prefix of prefixes) {
      await this.deleteKey(this.challengeKey(prefix, token))
    }
  }

  async consumePendingChallenge(token) {
    for (const prefix of ['admin', 'user']) {
      const key = this.challengeKey(prefix, token)
      const data = await this.readJson(key)
      if (data) {
        await this.deleteKey(key)
        return data
      }
    }

    throw new Error('Challenge not found')
  }

  isChallengeExpired(challenge) {
    return Date.now() - new Date(challenge.createdAt).getTime() > this.challengeTtlMs
  }

  async loadConfigForChallenge(subjectType, subjectId) {
    if (subjectType === 'admin') {
      return this.getAdminConfig()
    }

    return this.getUserConfig(subjectId)
  }

  async saveConfigForChallenge(subjectType, subjectId, config) {
    if (subjectType === 'admin') {
      await this.saveAdminConfig(config)
      return
    }

    await this.saveUserConfig(subjectId, config)
  }

  async verifyConfiguredSecondFactor({ config, otpCode, recoveryCode }) {
    const secret = this.decryptSecret(config.secretCiphertext, config.secretIv)

    if (otpCode && this.verifyOtpCode(otpCode, secret)) {
      return {
        usedRecoveryCode: false,
        updatedRecoveryCodeHashes: config.recoveryCodeHashes
      }
    }

    if (recoveryCode && (await this.verifyRecoveryCode(recoveryCode, config.recoveryCodeHashes))) {
      return {
        usedRecoveryCode: true,
        updatedRecoveryCodeHashes: await this.consumeRecoveryCode(
          recoveryCode,
          config.recoveryCodeHashes
        )
      }
    }

    throw new Error('Invalid two-factor code')
  }

  async verifySecondFactor({ subjectType, pendingLoginToken, otpCode, recoveryCode }) {
    const challenge = await this.getPendingChallenge(pendingLoginToken, subjectType)
    if (!challenge) {
      throw new Error('Two-factor challenge expired')
    }

    if (this.isChallengeExpired(challenge)) {
      await this.deletePendingChallenge(pendingLoginToken, subjectType)
      throw new Error('Two-factor challenge expired')
    }

    const config = await this.loadConfigForChallenge(subjectType, challenge.subjectId)
    if (!config?.enabled) {
      await this.deletePendingChallenge(pendingLoginToken, subjectType)
      throw new Error('Two-factor is not enabled')
    }

    try {
      const verification = await this.verifyConfiguredSecondFactor({
        config,
        otpCode,
        recoveryCode
      })

      const now = this.now()
      await this.saveConfigForChallenge(subjectType, challenge.subjectId, {
        ...config,
        recoveryCodeHashes: verification.updatedRecoveryCodeHashes,
        updatedAt: now,
        lastVerifiedAt: now
      })

      await this.deletePendingChallenge(pendingLoginToken, subjectType)

      return {
        subjectType,
        subjectId: challenge.subjectId,
        username: challenge.username,
        usedRecoveryCode: verification.usedRecoveryCode
      }
    } catch (error) {
      const attemptCount = (challenge.attemptCount || 0) + 1
      const nextChallenge = {
        ...challenge,
        attemptCount,
        recoveryAttemptCount: (challenge.recoveryAttemptCount || 0) + (recoveryCode ? 1 : 0)
      }

      if (attemptCount >= this.maxChallengeAttempts) {
        await this.deletePendingChallenge(pendingLoginToken, subjectType)
        throw new Error('Two-factor challenge expired')
      }

      await this.updatePendingChallenge(pendingLoginToken, subjectType, nextChallenge)
      throw error
    }
  }

  async verifyAdminSecondFactor({ pendingLoginToken, otpCode, recoveryCode }) {
    return this.verifySecondFactor({
      subjectType: 'admin',
      pendingLoginToken,
      otpCode,
      recoveryCode
    })
  }

  async verifyUserSecondFactor({ pendingLoginToken, otpCode, recoveryCode }) {
    return this.verifySecondFactor({
      subjectType: 'user',
      pendingLoginToken,
      otpCode,
      recoveryCode
    })
  }

  async disableConfiguredTwoFactor({ subjectType, subjectId, otpCode, recoveryCode }) {
    const config = await this.loadConfigForChallenge(subjectType, subjectId)
    if (!config?.enabled) {
      throw new Error('Two-factor is not enabled')
    }

    await this.verifyConfiguredSecondFactor({
      config,
      otpCode,
      recoveryCode
    })

    if (subjectType === 'admin') {
      await this.deleteAdminConfig()
    } else {
      await this.deleteUserConfig(subjectId)
    }

    return { disabled: true }
  }

  async disableAdminTwoFactor({ otpCode, recoveryCode }) {
    return this.disableConfiguredTwoFactor({
      subjectType: 'admin',
      subjectId: 'admin',
      otpCode,
      recoveryCode
    })
  }

  async disableUserTwoFactor({ userId, otpCode, recoveryCode }) {
    return this.disableConfiguredTwoFactor({
      subjectType: 'user',
      subjectId: userId,
      otpCode,
      recoveryCode
    })
  }

  async regenerateConfiguredRecoveryCodes({ subjectType, subjectId, otpCode, recoveryCode }) {
    const config = await this.loadConfigForChallenge(subjectType, subjectId)
    if (!config?.enabled) {
      throw new Error('Two-factor is not enabled')
    }

    await this.verifyConfiguredSecondFactor({
      config,
      otpCode,
      recoveryCode
    })

    const nextRecoveryCodes = this.generateRecoveryCodes()
    const now = this.now()

    await this.saveConfigForChallenge(subjectType, subjectId, {
      ...config,
      recoveryCodeHashes: await this.hashRecoveryCodes(nextRecoveryCodes),
      recoveryCodesGeneratedAt: now,
      updatedAt: now,
      lastVerifiedAt: now
    })

    return {
      recoveryCodes: nextRecoveryCodes,
      recoveryCodesGeneratedAt: now
    }
  }

  async regenerateAdminRecoveryCodes({ otpCode, recoveryCode }) {
    return this.regenerateConfiguredRecoveryCodes({
      subjectType: 'admin',
      subjectId: 'admin',
      otpCode,
      recoveryCode
    })
  }

  async regenerateUserRecoveryCodes({ userId, otpCode, recoveryCode }) {
    return this.regenerateConfiguredRecoveryCodes({
      subjectType: 'user',
      subjectId: userId,
      otpCode,
      recoveryCode
    })
  }

  async resetAdminTwoFactor() {
    await this.deleteAdminConfig()
    return { reset: true }
  }

  async resetUserTwoFactor({ userId }) {
    await this.deleteUserConfig(userId)
    return { reset: true, userId }
  }
}

module.exports = TwoFactorService
