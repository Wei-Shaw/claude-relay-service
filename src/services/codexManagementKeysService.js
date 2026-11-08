const crypto = require('crypto')

const ACCOUNT_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/
const KEY_PATTERN = /^crsm_[A-Za-z0-9_-]{43}$/
const DIGEST_PATTERN = /^[a-f0-9]{64}$/
const PREFIX = 'codex:management:'
const ERRORS = Object.freeze({
  invalid_management_key_request: 400,
  invalid_management_key: 401,
  management_key_forbidden: 403,
  management_key_not_found: 404,
  management_key_unavailable: 503
})

class CodexManagementKeysError extends Error {
  constructor(code) {
    const safeCode = Object.hasOwn(ERRORS, code) ? code : 'management_key_unavailable'
    super(safeCode)
    this.name = 'CodexManagementKeysError'
    this.code = safeCode
    this.status = ERRORS[safeCode]
  }
}

function sendManagementKeyError(res, error) {
  const code =
    error instanceof CodexManagementKeysError && Object.hasOwn(ERRORS, error.code)
      ? error.code
      : 'management_key_unavailable'
  return res.status(ERRORS[code]).json({ success: false, error: code })
}

// Both records are created/deleted within one Redis operation. Neither script receives plaintext.
const CREATE_SCRIPT = `-- management:create
if redis.call('EXISTS', KEYS[1]) ~= 0 or redis.call('EXISTS', KEYS[2]) ~= 0 then
  return 0
end
redis.call('SET', KEYS[1], ARGV[1])
redis.call('SET', KEYS[2], ARGV[2])
redis.call('PEXPIREAT', KEYS[1], ARGV[3])
redis.call('PEXPIREAT', KEYS[2], ARGV[3])
return 1`

const REVOKE_SCRIPT = `-- management:revoke
if redis.call('GET', KEYS[2]) ~= ARGV[1] then
  return 0
end
redis.call('DEL', KEYS[1], KEYS[2])
return 1`

function validateInput(input) {
  const invalid = () => {
    throw new CodexManagementKeysError('invalid_management_key_request')
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    invalid()
  }
  const { name, account_ids, consume_account_ids = [], expires_in_days = 90 } = input
  if (
    typeof name !== 'string' ||
    !name.trim() ||
    name.length > 128 ||
    Array.from(name).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
  ) {
    invalid()
  }
  if (!Number.isInteger(expires_in_days) || expires_in_days < 1 || expires_in_days > 365) {
    invalid()
  }
  for (const ids of [account_ids, consume_account_ids]) {
    if (
      !Array.isArray(ids) ||
      ids.length > 100 ||
      ids.some((id) => typeof id !== 'string' || !ACCOUNT_ID.test(id))
    ) {
      invalid()
    }
  }
  if (!account_ids.length || consume_account_ids.some((id) => !account_ids.includes(id))) {
    invalid()
  }
  return {
    name,
    account_ids: [...new Set(account_ids)],
    consume_account_ids: [...new Set(consume_account_ids)],
    expires_in_days
  }
}

function createCodexManagementKeysService({ redis, now = Date.now } = {}) {
  // Resolve the existing CRS client lazily: importing the factory never connects to Redis.
  const client = () => {
    const provider = redis || require('../models/redis')
    return typeof provider.getClientSafe === 'function' ? provider.getClientSafe() : provider
  }
  const hashKey = (digest) => `${PREFIX}hash:${digest}`
  const idKey = (id) => `${PREFIX}id:${id}`
  const checkId = (id) => {
    if (typeof id !== 'string' || !ACCOUNT_ID.test(id)) {
      throw new CodexManagementKeysError('invalid_management_key_request')
    }
  }
  const safe =
    (fn) =>
    async (...args) => {
      try {
        return await fn(...args)
      } catch (error) {
        if (error instanceof CodexManagementKeysError) {
          throw error
        }
        throw new CodexManagementKeysError('management_key_unavailable')
      }
    }
  const parseMetadata = (raw) => {
    try {
      const data = JSON.parse(raw)
      checkId(data.id)
      const validated = validateInput(data)
      const created = Date.parse(data.created_at)
      const expires = Date.parse(data.expires_at)
      if (!Number.isFinite(created) || !Number.isFinite(expires) || expires <= created) {
        throw new Error('Invalid stored metadata')
      }
      return {
        id: data.id,
        name: validated.name,
        account_ids: validated.account_ids,
        consume_account_ids: validated.consume_account_ids,
        created_at: data.created_at,
        expires_at: data.expires_at
      }
    } catch {
      throw new CodexManagementKeysError('management_key_unavailable')
    }
  }
  const readById = async (db, id) => {
    const digest = await db.get(idKey(id))
    if (!digest) {
      return null
    }
    if (!DIGEST_PATTERN.test(digest)) {
      throw new Error('Invalid index')
    }
    const raw = await db.get(hashKey(digest))
    if (!raw) {
      return null
    }
    const metadata = parseMetadata(raw)
    if (metadata.id !== id) {
      throw new Error('Inconsistent index')
    }
    return metadata
  }

  return {
    create: safe(async (input) => {
      const validated = validateInput(input)
      const timestamp = Number(now())
      const expiry = timestamp + validated.expires_in_days * 86400000
      const metadata = {
        id: crypto.randomUUID(),
        name: validated.name,
        account_ids: validated.account_ids,
        consume_account_ids: validated.consume_account_ids,
        created_at: new Date(timestamp).toISOString(),
        expires_at: new Date(expiry).toISOString()
      }
      const key = `crsm_${crypto.randomBytes(32).toString('base64url')}`
      const digest = crypto.createHash('sha256').update(key).digest('hex')
      const raw = JSON.stringify(metadata)
      const db = client()
      if (
        (await db.eval(
          CREATE_SCRIPT,
          2,
          hashKey(digest),
          idKey(metadata.id),
          raw,
          digest,
          expiry
        )) !== 1
      ) {
        throw new Error('Creation not confirmed')
      }
      const [stored, indexed] = await Promise.all([
        db.get(hashKey(digest)),
        db.get(idKey(metadata.id))
      ])
      if (stored !== raw || indexed !== digest || Number(now()) >= expiry) {
        throw new Error('Creation readback failed')
      }
      return { key, metadata }
    }),
    get: safe(async (id) => {
      checkId(id)
      const metadata = await readById(client(), id)
      if (!metadata || Date.parse(metadata.expires_at) <= Number(now())) {
        throw new CodexManagementKeysError('management_key_not_found')
      }
      return metadata
    }),
    revoke: safe(async (id) => {
      checkId(id)
      const db = client()
      const digest = await db.get(idKey(id))
      if (!digest) {
        return { id, revoked: true }
      }
      if (!DIGEST_PATTERN.test(digest)) {
        throw new Error('Invalid index')
      }
      await db.eval(REVOKE_SCRIPT, 2, hashKey(digest), idKey(id), digest)
      const [stored, indexed] = await Promise.all([db.get(hashKey(digest)), db.get(idKey(id))])
      if (stored !== null || indexed !== null) {
        throw new Error('Revocation readback failed')
      }
      return { id, revoked: true }
    }),
    authorize: safe(async (key, accountId, action = 'read') => {
      if (typeof key !== 'string' || !KEY_PATTERN.test(key)) {
        throw new CodexManagementKeysError('invalid_management_key')
      }
      const digest = crypto.createHash('sha256').update(key).digest('hex')
      const db = client()
      const raw = await db.get(hashKey(digest))
      if (!raw) {
        throw new CodexManagementKeysError('invalid_management_key')
      }
      const metadata = parseMetadata(raw)
      if (
        Date.parse(metadata.expires_at) <= Number(now()) ||
        (await db.get(idKey(metadata.id))) !== digest
      ) {
        throw new CodexManagementKeysError('invalid_management_key')
      }
      if (
        typeof accountId !== 'string' ||
        !ACCOUNT_ID.test(accountId) ||
        !['read', 'consume'].includes(action) ||
        !metadata.account_ids.includes(accountId) ||
        (action === 'consume' && !metadata.consume_account_ids.includes(accountId))
      ) {
        throw new CodexManagementKeysError('management_key_forbidden')
      }
      return metadata
    })
  }
}

module.exports = {
  createCodexManagementKeysService,
  CodexManagementKeysError,
  sendManagementKeyError,
  KEY_PATTERN
}
