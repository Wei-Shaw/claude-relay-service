const crypto = require('crypto')
const config = require('../../config/config')
const postgres = require('../models/postgres')
const logger = require('../utils/logger')
const { createEncryptor } = require('../utils/commonHelper')

const encryptor = createEncryptor('api-key-secret-salt')
const ENCRYPTION_VERSION = 'v1'

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS api_key_secrets (
  api_key_id TEXT PRIMARY KEY,
  key_hash TEXT NOT NULL,
  encrypted_key TEXT NOT NULL,
  key_preview TEXT NOT NULL DEFAULT '',
  capture_source TEXT NOT NULL DEFAULT 'unknown',
  encryption_version TEXT NOT NULL DEFAULT 'v1',
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_key_secrets_key_hash
  ON api_key_secrets (key_hash);

CREATE TABLE IF NOT EXISTS api_key_secret_audit_logs (
  id BIGSERIAL PRIMARY KEY,
  api_key_id TEXT NOT NULL,
  action TEXT NOT NULL,
  admin_username TEXT,
  ip TEXT,
  user_agent TEXT,
  success BOOLEAN NOT NULL DEFAULT true,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_key_secret_audit_logs_api_key_id_created_at
  ON api_key_secret_audit_logs (api_key_id, created_at DESC);
`

class ApiKeySecretService {
  constructor() {
    this.schemaReady = false
    this.schemaPromise = null
    this.captureCache = new Map()
    this.captureCacheTtlMs = 60 * 60 * 1000
  }

  isEnabled() {
    if (config.apiKeySecrets?.enabled === false) {
      return false
    }
    return process.env.API_KEY_SECRET_CAPTURE_ENABLED !== 'false'
  }

  async ensureSchema() {
    if (!this.isEnabled()) {
      return false
    }

    if (this.schemaReady) {
      return true
    }

    if (!this.schemaPromise) {
      this.schemaPromise = postgres
        .query(SCHEMA_SQL)
        .then(() => {
          this.schemaReady = true
          return true
        })
        .catch((error) => {
          this.schemaPromise = null
          throw error
        })
    }

    return this.schemaPromise
  }

  hashApiKey(apiKey) {
    return crypto
      .createHash('sha256')
      .update(apiKey + config.security.encryptionKey)
      .digest('hex')
  }

  buildPreview(apiKey) {
    if (!apiKey || typeof apiKey !== 'string') {
      return ''
    }

    if (apiKey.length <= 16) {
      return `${apiKey.slice(0, 4)}****${apiKey.slice(-4)}`
    }

    return `${apiKey.slice(0, 8)}...${apiKey.slice(-6)}`
  }

  async captureSecret({ apiKeyId, apiKey, keyHash, source = 'validation' }) {
    if (!this.isEnabled() || !apiKeyId || !apiKey || !keyHash) {
      return { captured: false, reason: 'disabled_or_incomplete' }
    }

    const cacheKey = `${apiKeyId}:${keyHash}`
    const cachedUntil = this.captureCache.get(cacheKey)
    if (source === 'validation' && cachedUntil && cachedUntil > Date.now()) {
      return { captured: false, reason: 'recently_verified' }
    }

    const calculatedHash = this.hashApiKey(apiKey)
    if (calculatedHash !== keyHash) {
      return { captured: false, reason: 'hash_mismatch' }
    }

    await this.ensureSchema()

    const encryptedKey = encryptor.encrypt(apiKey)
    const keyPreview = this.buildPreview(apiKey)

    await postgres.query(
      `
        INSERT INTO api_key_secrets (
          api_key_id,
          key_hash,
          encrypted_key,
          key_preview,
          capture_source,
          encryption_version,
          captured_at,
          last_verified_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW(), NOW())
        ON CONFLICT (api_key_id)
        DO UPDATE SET
          key_hash = EXCLUDED.key_hash,
          encrypted_key = CASE
            WHEN api_key_secrets.key_hash = EXCLUDED.key_hash
              THEN api_key_secrets.encrypted_key
            ELSE EXCLUDED.encrypted_key
          END,
          key_preview = CASE
            WHEN api_key_secrets.key_hash = EXCLUDED.key_hash
              THEN api_key_secrets.key_preview
            ELSE EXCLUDED.key_preview
          END,
          capture_source = CASE
            WHEN api_key_secrets.key_hash = EXCLUDED.key_hash
              THEN api_key_secrets.capture_source
            ELSE EXCLUDED.capture_source
          END,
          encryption_version = EXCLUDED.encryption_version,
          captured_at = CASE
            WHEN api_key_secrets.key_hash = EXCLUDED.key_hash
              THEN api_key_secrets.captured_at
            ELSE NOW()
          END,
          last_verified_at = NOW(),
          updated_at = NOW()
      `,
      [apiKeyId, keyHash, encryptedKey, keyPreview, source, ENCRYPTION_VERSION]
    )

    this.captureCache.set(cacheKey, Date.now() + this.captureCacheTtlMs)
    if (this.captureCache.size > 2000) {
      const now = Date.now()
      for (const [key, expiresAt] of this.captureCache.entries()) {
        if (expiresAt <= now || this.captureCache.size > 1500) {
          this.captureCache.delete(key)
        }
      }
    }

    return { captured: true, keyPreview }
  }

  async getSecretInfoMap(apiKeyIds = []) {
    const ids = [...new Set(apiKeyIds.filter(Boolean))]
    if (!this.isEnabled() || ids.length === 0) {
      return new Map()
    }

    await this.ensureSchema()

    const result = await postgres.query(
      `
        SELECT
          api_key_id,
          key_hash,
          key_preview,
          capture_source,
          encryption_version,
          captured_at,
          last_verified_at
        FROM api_key_secrets
        WHERE api_key_id = ANY($1)
      `,
      [ids]
    )

    return new Map(
      result.rows.map((row) => [
        row.api_key_id,
        {
          apiKeyId: row.api_key_id,
          keyHash: row.key_hash,
          keyPreview: row.key_preview,
          captureSource: row.capture_source,
          encryptionVersion: row.encryption_version,
          capturedAt: row.captured_at,
          lastVerifiedAt: row.last_verified_at
        }
      ])
    )
  }

  async revealSecret({ apiKeyId, currentKeyHash, adminUsername, ip, userAgent }) {
    if (!this.isEnabled()) {
      throw new Error('API Key secret capture is disabled')
    }

    await this.ensureSchema()

    const result = await postgres.query(
      `
        SELECT api_key_id, key_hash, encrypted_key, key_preview, captured_at, last_verified_at
        FROM api_key_secrets
        WHERE api_key_id = $1
      `,
      [apiKeyId]
    )

    const row = result.rows[0]
    if (!row) {
      await this.recordAudit({
        apiKeyId,
        action: 'reveal',
        adminUsername,
        ip,
        userAgent,
        success: false,
        error: 'secret_not_captured'
      })
      throw new Error('API Key secret has not been captured yet')
    }

    if (row.key_hash !== currentKeyHash) {
      await this.recordAudit({
        apiKeyId,
        action: 'reveal',
        adminUsername,
        ip,
        userAgent,
        success: false,
        error: 'hash_mismatch'
      })
      throw new Error('Captured secret is stale')
    }

    const apiKey = encryptor.decrypt(row.encrypted_key, false)
    if (this.hashApiKey(apiKey) !== currentKeyHash) {
      await this.recordAudit({
        apiKeyId,
        action: 'reveal',
        adminUsername,
        ip,
        userAgent,
        success: false,
        error: 'decrypt_hash_mismatch'
      })
      throw new Error('Captured secret failed verification')
    }

    await this.recordAudit({
      apiKeyId,
      action: 'reveal',
      adminUsername,
      ip,
      userAgent,
      success: true
    })

    logger.security(`🔐 Admin ${adminUsername || 'unknown'} revealed API key secret: ${apiKeyId}`)

    return {
      apiKey,
      keyPreview: row.key_preview,
      capturedAt: row.captured_at,
      lastVerifiedAt: row.last_verified_at
    }
  }

  async recordAudit({ apiKeyId, action, adminUsername, ip, userAgent, success, error = null }) {
    try {
      await this.ensureSchema()
      await postgres.query(
        `
          INSERT INTO api_key_secret_audit_logs (
            api_key_id,
            action,
            admin_username,
            ip,
            user_agent,
            success,
            error
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `,
        [apiKeyId, action, adminUsername || '', ip || '', userAgent || '', success, error]
      )
    } catch (auditError) {
      logger.warn(`Failed to record API key secret audit for ${apiKeyId}:`, auditError.message)
    }
  }

  async deleteSecret(apiKeyId) {
    if (!this.isEnabled() || !apiKeyId) {
      return
    }

    await this.ensureSchema()
    await postgres.query('DELETE FROM api_key_secrets WHERE api_key_id = $1', [apiKeyId])
  }
}

module.exports = new ApiKeySecretService()
