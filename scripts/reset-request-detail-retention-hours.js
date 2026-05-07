#!/usr/bin/env node

let dotenvLoaded = false
try {
  require('dotenv').config()
  dotenvLoaded = true
} catch (_error) {
  dotenvLoaded = false
}

const Redis = require('ioredis')

const CONFIG_KEY = 'claude_relay_config'
const REQUEST_DETAIL_KEY_PATTERN = 'request_detail:*'
const DEFAULT_RETENTION_HOURS = 6
const MAX_RETENTION_HOURS = 720
const SCAN_COUNT = 200

const args = process.argv.slice(2)
const params = {}
args.forEach((arg) => {
  const [key, value] = arg.split('=')
  params[key.replace(/^--/, '')] = value ?? true
})

const isDryRun = params['dry-run'] === true
const requestedHours = Number.parseInt(params.hours, 10)
const targetHours = Number.isFinite(requestedHours) ? requestedHours : DEFAULT_RETENTION_HOURS

if (!Number.isInteger(targetHours) || targetHours < 1 || targetHours > MAX_RETENTION_HOURS) {
  console.error(
    `requestDetailRetentionHours must be an integer between 1 and ${MAX_RETENTION_HOURS}`
  )
  process.exit(1)
}

async function scanRequestDetailKeys(client) {
  let cursor = '0'
  const keys = []

  do {
    const [nextCursor, batch] = await client.scan(
      cursor,
      'MATCH',
      REQUEST_DETAIL_KEY_PATTERN,
      'COUNT',
      SCAN_COUNT
    )
    cursor = nextCursor
    if (Array.isArray(batch) && batch.length > 0) {
      keys.push(...batch)
    }
  } while (cursor !== '0')

  return keys
}

async function resetRequestDetailRetentionHours() {
  let client = null

  try {
    console.log('🔄 Resetting request detail retention configuration...')
    console.log(`🕒 Target request detail retention: ${targetHours} hour(s)`)
    if (isDryRun) {
      console.log('📝 DRY RUN mode enabled; no data will be modified')
    }

    if (dotenvLoaded) {
      console.log('📄 Loaded .env configuration')
    }

    client = new Redis({
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: Number.parseInt(process.env.REDIS_PORT, 10) || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
      db: Number.parseInt(process.env.REDIS_DB, 10) || 0,
      tls: process.env.REDIS_ENABLE_TLS === 'true' || process.env.REDIS_TLS === 'true' ? {} : false,
      lazyConnect: true
    })
    await client.connect()

    const rawConfig = await client.get(CONFIG_KEY)
    const currentConfig = rawConfig ? JSON.parse(rawConfig) : {}
    const requestDetailKeys = await scanRequestDetailKeys(client)

    console.log(`📦 Found ${requestDetailKeys.length} request detail Redis key(s)`)
    console.log(
      `⚙️ Current config: requestDetailRetentionDays=${currentConfig.requestDetailRetentionDays ?? 'unset'}, requestDetailRetentionHours=${currentConfig.requestDetailRetentionHours ?? 'unset'}`
    )

    const nextConfig = {
      ...currentConfig,
      requestDetailRetentionHours: targetHours,
      updatedAt: new Date().toISOString(),
      updatedBy: 'request-detail-retention-hours-reset-script'
    }
    delete nextConfig.requestDetailRetentionDays

    if (!isDryRun) {
      if (requestDetailKeys.length > 0) {
        for (let index = 0; index < requestDetailKeys.length; index += SCAN_COUNT) {
          const batch = requestDetailKeys.slice(index, index + SCAN_COUNT)
          // Use UNLINK to avoid blocking Redis with a large DEL.
          await client.unlink(...batch)
        }
      }

      await client.set(CONFIG_KEY, JSON.stringify(nextConfig))
    }

    console.log(
      `${isDryRun ? '📝 Would delete' : '🧹 Deleted'} ${requestDetailKeys.length} request detail key(s)`
    )
    console.log(
      `${isDryRun ? '📝 Would write' : '✅ Wrote'} requestDetailRetentionHours=${targetHours} and removed requestDetailRetentionDays`
    )
  } catch (error) {
    console.error('❌ Failed to reset request detail retention configuration:', error)
    process.exitCode = 1
  } finally {
    if (client) {
      await client.quit()
    }
  }
}

resetRequestDetailRetentionHours()
