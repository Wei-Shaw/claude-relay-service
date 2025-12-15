const postgres = require('./postgres')
const logger = require('../utils/logger')

function isRelationMissingError(error) {
  return error && error.code === '42P01'
}

async function safeQuery(text, params) {
  try {
    await postgres.connect()
    if (!postgres.isConnected) {
      return null
    }
    return await postgres.query(text, params)
  } catch (error) {
    if (isRelationMissingError(error)) {
      logger.warn('⚠️ PostgreSQL schema missing, fallback to Redis')
      return null
    }
    logger.warn(`⚠️ PostgreSQL query failed, fallback to Redis: ${error.message}`)
    return null
  }
}

async function ensureSchema() {
  const ddl = `
  CREATE TABLE IF NOT EXISTS api_keys (
    id uuid PRIMARY KEY,
    hashed_key char(64) NOT NULL UNIQUE,
    data jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS accounts (
    type text NOT NULL,
    id text NOT NULL,
    data jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (type, id)
  );
  CREATE INDEX IF NOT EXISTS accounts_type_idx ON accounts(type);

  CREATE TABLE IF NOT EXISTS account_groups (
    id uuid PRIMARY KEY,
    data jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS account_group_members (
    group_id uuid NOT NULL REFERENCES account_groups(id) ON DELETE CASCADE,
    account_id text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (group_id, account_id)
  );
  CREATE INDEX IF NOT EXISTS account_group_members_account_id_idx ON account_group_members(account_id);

  CREATE TABLE IF NOT EXISTS users (
    id text PRIMARY KEY,
    username text NOT NULL UNIQUE,
    data jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  );
  `

  const result = await safeQuery(ddl, [])
  if (result) {
    logger.info('✅ PostgreSQL schema ensured')
    return true
  }
  return false
}

function toTimestamp(value) {
  if (!value) {
    return new Date().toISOString()
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString()
  }
  return date.toISOString()
}

async function upsertApiKey(keyId, hashedKey, data) {
  if (!keyId || !hashedKey || !data) {
    return false
  }

  const createdAt = toTimestamp(data.createdAt)
  const updatedAt = toTimestamp(data.updatedAt || data.createdAt)

  const sql = `
    INSERT INTO api_keys (id, hashed_key, data, created_at, updated_at)
    VALUES ($1::uuid, $2, $3::jsonb, $4::timestamptz, $5::timestamptz)
    ON CONFLICT (id) DO UPDATE
    SET hashed_key = EXCLUDED.hashed_key,
        data = EXCLUDED.data,
        updated_at = EXCLUDED.updated_at
  `

  const result = await safeQuery(sql, [keyId, hashedKey, data, createdAt, updatedAt])
  return Boolean(result)
}

async function getApiKeyById(keyId) {
  if (!keyId) {
    return null
  }

  const result = await safeQuery('SELECT data FROM api_keys WHERE id = $1::uuid LIMIT 1', [keyId])
  const row = result?.rows?.[0]
  return row?.data || null
}

async function getApiKeyByHashedKey(hashedKey) {
  if (!hashedKey) {
    return null
  }

  const result = await safeQuery('SELECT data FROM api_keys WHERE hashed_key = $1 LIMIT 1', [
    hashedKey
  ])
  const row = result?.rows?.[0]
  return row?.data || null
}

async function listApiKeyIds() {
  const result = await safeQuery('SELECT id FROM api_keys', [])
  if (!result?.rows) {
    return null
  }
  return result.rows.map((row) => row.id).filter(Boolean)
}

async function getApiKeysByIds(keyIds = []) {
  const ids = Array.isArray(keyIds) ? keyIds.filter(Boolean) : []
  if (ids.length === 0) {
    return []
  }

  const result = await safeQuery('SELECT id, data FROM api_keys WHERE id = ANY($1::uuid[])', [ids])
  if (!result?.rows) {
    return null
  }
  return result.rows.map((row) => ({ id: row.id, data: row.data }))
}

async function deleteApiKeyById(keyId) {
  if (!keyId) {
    return false
  }

  const result = await safeQuery('DELETE FROM api_keys WHERE id = $1::uuid', [keyId])
  return Boolean(result)
}

async function upsertAccount(type, accountId, data) {
  if (!type || !accountId || !data) {
    return false
  }

  const createdAt = toTimestamp(data.createdAt)
  const updatedAt = toTimestamp(data.updatedAt || data.createdAt)

  const sql = `
    INSERT INTO accounts (type, id, data, created_at, updated_at)
    VALUES ($1, $2, $3::jsonb, $4::timestamptz, $5::timestamptz)
    ON CONFLICT (type, id) DO UPDATE
    SET data = EXCLUDED.data,
        updated_at = EXCLUDED.updated_at
  `

  const result = await safeQuery(sql, [type, accountId, data, createdAt, updatedAt])
  return Boolean(result)
}

async function getAccount(type, accountId) {
  if (!type || !accountId) {
    return null
  }

  const result = await safeQuery('SELECT data FROM accounts WHERE type = $1 AND id = $2 LIMIT 1', [
    type,
    accountId
  ])
  const row = result?.rows?.[0]
  return row?.data || null
}

async function listAccounts(type) {
  if (!type) {
    return null
  }

  const result = await safeQuery('SELECT data FROM accounts WHERE type = $1', [type])
  if (!result?.rows) {
    return null
  }
  return result.rows.map((row) => row.data).filter(Boolean)
}

async function deleteAccount(type, accountId) {
  if (!type || !accountId) {
    return false
  }

  const result = await safeQuery('DELETE FROM accounts WHERE type = $1 AND id = $2', [
    type,
    accountId
  ])
  return Boolean(result)
}

async function upsertAccountGroup(groupId, data) {
  if (!groupId || !data) {
    return false
  }

  const createdAt = toTimestamp(data.createdAt)
  const updatedAt = toTimestamp(data.updatedAt || data.createdAt)

  const sql = `
    INSERT INTO account_groups (id, data, created_at, updated_at)
    VALUES ($1::uuid, $2::jsonb, $3::timestamptz, $4::timestamptz)
    ON CONFLICT (id) DO UPDATE
    SET data = EXCLUDED.data,
        updated_at = EXCLUDED.updated_at
  `
  const result = await safeQuery(sql, [groupId, data, createdAt, updatedAt])
  return Boolean(result)
}

async function getAccountGroup(groupId) {
  if (!groupId) {
    return null
  }
  const result = await safeQuery('SELECT data FROM account_groups WHERE id = $1::uuid LIMIT 1', [
    groupId
  ])
  const row = result?.rows?.[0]
  return row?.data || null
}

async function listAccountGroups() {
  const result = await safeQuery('SELECT data FROM account_groups', [])
  if (!result?.rows) {
    return null
  }
  return result.rows.map((row) => row.data).filter(Boolean)
}

async function deleteAccountGroup(groupId) {
  if (!groupId) {
    return false
  }
  const result = await safeQuery('DELETE FROM account_groups WHERE id = $1::uuid', [groupId])
  return Boolean(result)
}

async function addAccountGroupMember(groupId, accountId) {
  if (!groupId || !accountId) {
    return false
  }
  const result = await safeQuery(
    'INSERT INTO account_group_members (group_id, account_id) VALUES ($1::uuid, $2) ON CONFLICT DO NOTHING',
    [groupId, accountId]
  )
  return Boolean(result)
}

async function removeAccountGroupMember(groupId, accountId) {
  if (!groupId || !accountId) {
    return false
  }
  const result = await safeQuery(
    'DELETE FROM account_group_members WHERE group_id = $1::uuid AND account_id = $2',
    [groupId, accountId]
  )
  return Boolean(result)
}

async function removeAccountFromAllGroups(accountId) {
  if (!accountId) {
    return false
  }
  const result = await safeQuery('DELETE FROM account_group_members WHERE account_id = $1', [
    accountId
  ])
  return Boolean(result)
}

async function listAccountGroupMembers(groupId) {
  if (!groupId) {
    return null
  }
  const result = await safeQuery(
    'SELECT account_id FROM account_group_members WHERE group_id = $1::uuid',
    [groupId]
  )
  if (!result?.rows) {
    return null
  }
  return result.rows.map((row) => row.account_id).filter(Boolean)
}

async function upsertUser(user) {
  if (!user?.id || !user?.username) {
    return false
  }
  const createdAt = toTimestamp(user.createdAt)
  const updatedAt = toTimestamp(user.updatedAt || user.createdAt)

  const sql = `
    INSERT INTO users (id, username, data, created_at, updated_at)
    VALUES ($1, $2, $3::jsonb, $4::timestamptz, $5::timestamptz)
    ON CONFLICT (id) DO UPDATE
    SET username = EXCLUDED.username,
        data = EXCLUDED.data,
        updated_at = EXCLUDED.updated_at
  `

  const result = await safeQuery(sql, [user.id, user.username, user, createdAt, updatedAt])
  return Boolean(result)
}

async function getUserById(userId) {
  if (!userId) {
    return null
  }
  const result = await safeQuery('SELECT data FROM users WHERE id = $1 LIMIT 1', [userId])
  const row = result?.rows?.[0]
  return row?.data || null
}

async function getUserByUsername(username) {
  if (!username) {
    return null
  }
  const result = await safeQuery('SELECT data FROM users WHERE username = $1 LIMIT 1', [username])
  const row = result?.rows?.[0]
  return row?.data || null
}

async function listUsers() {
  const result = await safeQuery('SELECT data FROM users', [])
  if (!result?.rows) {
    return null
  }
  return result.rows.map((row) => row.data).filter(Boolean)
}

async function deleteUser(userId) {
  if (!userId) {
    return false
  }
  const result = await safeQuery('DELETE FROM users WHERE id = $1', [userId])
  return Boolean(result)
}

module.exports = {
  ensureSchema,
  upsertApiKey,
  getApiKeyById,
  getApiKeyByHashedKey,
  listApiKeyIds,
  getApiKeysByIds,
  deleteApiKeyById,
  upsertAccount,
  getAccount,
  listAccounts,
  deleteAccount,
  upsertAccountGroup,
  getAccountGroup,
  listAccountGroups,
  deleteAccountGroup,
  addAccountGroupMember,
  removeAccountGroupMember,
  removeAccountFromAllGroups,
  listAccountGroupMembers,
  upsertUser,
  getUserById,
  getUserByUsername,
  listUsers,
  deleteUser
}
