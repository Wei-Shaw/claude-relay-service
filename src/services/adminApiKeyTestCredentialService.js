const crypto = require('crypto')
const config = require('../../config/config')

const DEFAULT_TTL_MS = 60 * 1000
const credentials = new Map()

function normalizeService(service) {
  return ['claude', 'gemini', 'openai'].includes(service) ? service : null
}

function removeExpiredCredential(apiKey) {
  const credential = credentials.get(apiKey)
  if (credential && credential.expiresAt <= Date.now()) {
    credentials.delete(apiKey)
    return true
  }
  return false
}

function removeExpiredCredentials() {
  for (const [apiKey, credential] of credentials) {
    if (credential.expiresAt <= Date.now()) {
      credentials.delete(apiKey)
    }
  }
}

function issueCredential(keyId, service, ttlMs = DEFAULT_TTL_MS) {
  const normalizedService = normalizeService(service)
  if (!keyId || !normalizedService) {
    throw new Error('Invalid API key test credential request')
  }

  removeExpiredCredentials()

  const apiKey = `${config.security.apiKeyPrefix}${crypto.randomBytes(32).toString('hex')}`
  credentials.set(apiKey, {
    keyId,
    service: normalizedService,
    expiresAt: Date.now() + ttlMs
  })

  return {
    apiKey,
    expiresInSeconds: Math.ceil(ttlMs / 1000)
  }
}

function peekCredential(apiKey, service = null) {
  if (!apiKey || removeExpiredCredential(apiKey)) {
    return null
  }

  const credential = credentials.get(apiKey)
  if (!credential || (service && credential.service !== service)) {
    return null
  }

  return { ...credential }
}

function consumeCredential(apiKey, service = null) {
  const credential = peekCredential(apiKey, service)
  if (!credential) {
    return null
  }

  credentials.delete(apiKey)
  return credential
}

function revokeCredential(apiKey) {
  return credentials.delete(apiKey)
}

module.exports = {
  issueCredential,
  peekCredential,
  consumeCredential,
  revokeCredential
}
