const crypto = require('crypto')
const { authenticator } = require('otplib')
const QRCode = require('qrcode')

class TwoFactorService {
  constructor({
    redis,
    encryptionKey,
    challengeTtlMs = 300000,
    maxChallengeAttempts = 5,
    recoveryCodesCount = 10
  }) {
    this.redis = redis
    this.challengeTtlMs = challengeTtlMs
    this.maxChallengeAttempts = maxChallengeAttempts
    this.recoveryCodesCount = recoveryCodesCount
    this.encryptionKey = this.normalizeKey(encryptionKey)
  }

  normalizeKey(value) {
    return crypto.createHash('sha256').update(String(value)).digest()
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

  generateRecoveryCodes() {
    return Array.from({ length: this.recoveryCodesCount }, () =>
      crypto.randomBytes(5).toString('hex').toUpperCase()
    )
  }

  hashRecoveryCode(code) {
    return crypto.createHash('sha256').update(`twofactor:${code}`).digest('hex')
  }

  async hashRecoveryCodes(codes) {
    return codes.map((code) => this.hashRecoveryCode(code))
  }

  async verifyRecoveryCode(code, storedHashes) {
    const candidate = this.hashRecoveryCode(code)
    return storedHashes.some((hash) =>
      crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(candidate))
    )
  }

  async consumeRecoveryCode(code, storedHashes) {
    const candidate = this.hashRecoveryCode(code)
    return storedHashes.filter((hash) => hash !== candidate)
  }

  async createSetup({ subjectType, subjectId, accountName, issuer }) {
    const secret = authenticator.generateSecret()
    const otpauthUrl = authenticator.keyuri(accountName, issuer, secret)
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl)

    return {
      subjectType,
      subjectId,
      secret,
      otpauthUrl,
      qrCodeDataUrl,
      recoveryCodes: this.generateRecoveryCodes(),
      ...this.encryptSecret(secret)
    }
  }

  challengeKey(subjectType, token) {
    return `${subjectType}_login_challenge:${token}`
  }

  async createPendingChallenge(payload) {
    const pendingLoginToken = crypto.randomBytes(32).toString('hex')
    const record = {
      ...payload,
      attemptCount: 0,
      recoveryAttemptCount: 0,
      createdAt: new Date().toISOString()
    }

    await this.redis.setex(
      this.challengeKey(payload.subjectType, pendingLoginToken),
      Math.floor(this.challengeTtlMs / 1000),
      JSON.stringify(record)
    )

    return {
      pendingLoginToken,
      pendingLoginExpiresIn: this.challengeTtlMs
    }
  }

  async getPendingChallenge(token, subjectType = null) {
    const prefixes = subjectType ? [subjectType] : ['admin', 'user']

    for (const prefix of prefixes) {
      const data = await this.redis.get(this.challengeKey(prefix, token))
      if (data) {
        return JSON.parse(data)
      }
    }

    return null
  }

  async consumePendingChallenge(token) {
    for (const prefix of ['admin', 'user']) {
      const key = this.challengeKey(prefix, token)
      const data = await this.redis.get(key)
      if (data) {
        await this.redis.del(key)
        return JSON.parse(data)
      }
    }

    throw new Error('Challenge not found')
  }
}

module.exports = TwoFactorService
