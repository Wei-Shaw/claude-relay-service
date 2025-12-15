const { Pool } = require('pg')

const config = require('../../config/config')
const logger = require('../utils/logger')

class PostgresClient {
  constructor() {
    this.pool = null
    this.isConnected = false
  }

  isEnabled() {
    return Boolean(config.postgres?.enabled)
  }

  async connect() {
    if (!this.isEnabled()) {
      return null
    }

    if (this.pool) {
      return this.pool
    }

    const pgConfig = config.postgres || {}

    const poolOptions = pgConfig.url
      ? { connectionString: pgConfig.url }
      : {
          host: pgConfig.host,
          port: pgConfig.port,
          user: pgConfig.user,
          password: pgConfig.password,
          database: pgConfig.database
        }

    poolOptions.max = pgConfig.max || 10
    poolOptions.idleTimeoutMillis = pgConfig.idleTimeoutMillis || 30000
    poolOptions.connectionTimeoutMillis = pgConfig.connectionTimeoutMillis || 10000

    if (pgConfig.ssl) {
      poolOptions.ssl = {
        rejectUnauthorized: false
      }
    }

    this.pool = new Pool(poolOptions)
    this.pool.on('error', (err) => {
      this.isConnected = false
      logger.warn('⚠️ PostgreSQL pool error:', err?.message || err)
    })

    try {
      await this.pool.query('SELECT 1')
      this.isConnected = true
      logger.info('🐘 PostgreSQL connected successfully')
      return this.pool
    } catch (error) {
      this.isConnected = false
      logger.warn(`⚠️ PostgreSQL connection failed, will fallback to Redis: ${error.message}`)

      try {
        await this.pool.end()
      } catch (endError) {
        // ignore
      }
      this.pool = null
      return null
    }
  }

  async disconnect() {
    if (!this.pool) {
      return
    }
    try {
      await this.pool.end()
    } finally {
      this.pool = null
      this.isConnected = false
    }
  }

  async query(text, params) {
    if (!this.pool) {
      await this.connect()
    }
    if (!this.pool || !this.isConnected) {
      throw new Error('PostgreSQL is not connected')
    }
    return await this.pool.query(text, params)
  }
}

module.exports = new PostgresClient()
