#!/usr/bin/env node

const path = require('path')
const Module = require('module')

const originalResolveFilename = Module._resolveFilename
Module._resolveFilename = function resolveConfig(request, parent, isMain, options) {
  if (request.endsWith('/config/config')) {
    return path.resolve(__dirname, '../config/config.example.js')
  }
  return originalResolveFilename.call(this, request, parent, isMain, options)
}

const redis = require('../src/models/redis')
const apiKeyService = require('../src/services/apiKeyService')
const { authenticateApiKey } = require('../src/middleware/auth')

Module._resolveFilename = originalResolveFilename

function createMockReq(apiKey) {
  return {
    headers: {
      'x-api-key': apiKey,
      'user-agent': 'total-usage-limit-test'
    },
    query: {},
    body: {},
    ip: '127.0.0.1',
    connection: {},
    originalUrl: '/test-total-usage-limit',
    once: () => {},
    on: () => {},
    get(header) {
      return this.headers[header.toLowerCase()] || ''
    }
  }
}

function createMockRes() {
  const state = {
    status: 200,
    body: null
  }

  return {
    once: () => {},
    on: () => {},
    status(code) {
      state.status = code
      return this
    },
    json(payload) {
      state.body = payload
      return this
    },
    getState() {
      return state
    }
  }
}

async function runAuth(apiKey) {
  const req = createMockReq(apiKey)
  const res = createMockRes()
  let nextCalled = false

  await authenticateApiKey(req, res, () => {
    nextCalled = true
  })

  const result = res.getState()
  if (nextCalled && result.status === 200) {
    return { status: 200, body: null }
  }
  return result
}

async function cleanupKey(keyId) {
  const client = redis.getClient()
  if (!client) {
    return
  }

  try {
    await redis.deleteApiKey(keyId)
    const usageKeys = await client.keys(`usage:*:${keyId}*`)
    if (usageKeys.length > 0) {
      await client.del(...usageKeys)
    }
    const costKeys = await client.keys(`usage:cost:*:${keyId}*`)
    if (costKeys.length > 0) {
      await client.del(...costKeys)
    }
    await client.del(`usage:${keyId}`)
    await client.del(`usage:records:${keyId}`)
    await client.del(`usage:cost:total:${keyId}`)
  } catch (error) {
    console.warn(`Failed to cleanup test key ${keyId}:`, error.message)
  }
}

async function main() {
  await redis.connect()

  const testName = `TotalUsageLimitTest-${Date.now()}`
  const totalLimit = 1.0
  const newKey = await apiKeyService.generateApiKey({
    name: testName,
    permissions: 'all',
    totalUsageLimit: totalLimit
  })

  const keyId = newKey.id
  const { apiKey } = newKey

  console.log(`➕ Created test API key ${keyId} with total usage limit $${totalLimit}`)

  let authResult = await runAuth(apiKey)
  if (authResult.status !== 200) {
    throw new Error(`Expected success before any usage, got status ${authResult.status}`)
  }
  console.log('✅ Authentication succeeds before consuming quota')

  await redis.incrementDailyCost(keyId, 0.6)
  authResult = await runAuth(apiKey)
  if (authResult.status !== 200) {
    throw new Error(`Expected success under quota, got status ${authResult.status}`)
  }
  console.log('✅ Authentication succeeds while still under quota ($0.60)')

  await redis.incrementDailyCost(keyId, 0.5)
  authResult = await runAuth(apiKey)
  if (authResult.status !== 429) {
    throw new Error(`Expected 429 after exceeding quota, got status ${authResult.status}`)
  }
  console.log('✅ Authentication returns 429 after exceeding total usage limit ($1.10)')

  await cleanupKey(keyId)
  await redis.disconnect()

  console.log('🎉 Total usage limit test completed successfully')
}

main().catch(async (error) => {
  console.error('❌ Total usage limit test failed:', error)
  try {
    await redis.disconnect()
  } catch (_) {
    // Ignore disconnect errors during cleanup
  }
  process.exitCode = 1
})
