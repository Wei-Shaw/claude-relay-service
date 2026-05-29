const { Pool } = require('pg')
const config = require('../../config/config')
const logger = require('../utils/logger')

let pool = null

function createPool() {
  const pgConfig = config.postgres || {}
  return new Pool({
    host: pgConfig.host,
    port: pgConfig.port,
    database: pgConfig.database,
    user: pgConfig.user,
    password: pgConfig.password,
    ssl: pgConfig.ssl ? { rejectUnauthorized: false } : false,
    max: pgConfig.max || 10
  })
}

function getPool() {
  if (!pool) {
    pool = createPool()
    pool.on('error', (error) => {
      logger.error('❌ PostgreSQL pool error:', error)
    })
  }

  return pool
}

async function query(text, params = []) {
  return getPool().query(text, params)
}

async function transaction(callback) {
  const client = await getPool().connect()

  try {
    await client.query('BEGIN')
    const result = await callback(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK').catch((rollbackError) => {
      logger.error('❌ PostgreSQL transaction rollback failed:', rollbackError)
    })
    throw error
  } finally {
    client.release()
  }
}

async function close() {
  if (!pool) {
    return
  }

  const activePool = pool
  pool = null
  await activePool.end()
}

module.exports = {
  getPool,
  query,
  transaction,
  close
}
