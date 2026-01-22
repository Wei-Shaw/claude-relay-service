#!/usr/bin/env node

/**
 * 增强版数据导出/导入工具
 * 支持加密数据的处理
 */

const fs = require('fs').promises
const crypto = require('crypto')
const redis = require('../src/models/redis')
const logger = require('../src/utils/logger')
const readline = require('readline')
const config = require('../config/config')

// 解析命令行参数
const args = process.argv.slice(2)
const command = args[0]
const params = {}

args.slice(1).forEach((arg) => {
  const [key, value] = arg.split('=')
  params[key.replace('--', '')] = value || true
})

// 创建 readline 接口
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})

async function askConfirmation(question) {
  return new Promise((resolve) => {
    rl.question(`${question} (yes/no): `, (answer) => {
      resolve(answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y')
    })
  })
}

// Claude 账户解密函数
function decryptClaudeData(encryptedData) {
  if (!encryptedData || !config.security.encryptionKey) {
    return encryptedData
  }

  try {
    if (encryptedData.includes(':')) {
      const parts = encryptedData.split(':')
      const key = crypto.scryptSync(config.security.encryptionKey, 'salt', 32)
      const iv = Buffer.from(parts[0], 'hex')
      const encrypted = parts[1]

      const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv)
      let decrypted = decipher.update(encrypted, 'hex', 'utf8')
      decrypted += decipher.final('utf8')
      return decrypted
    }
    return encryptedData
  } catch (error) {
    logger.warn(`⚠️  Failed to decrypt data: ${error.message}`)
    return encryptedData
  }
}

// Gemini 账户解密函数
function decryptGeminiData(encryptedData) {
  if (!encryptedData || !config.security.encryptionKey) {
    return encryptedData
  }

  try {
    if (encryptedData.includes(':')) {
      const parts = encryptedData.split(':')
      const key = crypto.scryptSync(config.security.encryptionKey, 'gemini-account-salt', 32)
      const iv = Buffer.from(parts[0], 'hex')
      const encrypted = parts[1]

      const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv)
      let decrypted = decipher.update(encrypted, 'hex', 'utf8')
      decrypted += decipher.final('utf8')
      return decrypted
    }
    return encryptedData
  } catch (error) {
    logger.warn(`⚠️  Failed to decrypt data: ${error.message}`)
    return encryptedData
  }
}

// API Key 哈希函数（与apiKeyService保持一致）
function hashApiKey(apiKey) {
  if (!apiKey || !config.security.encryptionKey) {
    return apiKey
  }

  return crypto
    .createHash('sha256')
    .update(apiKey + config.security.encryptionKey)
    .digest('hex')
}

// 检查是否为明文API Key（通过格式判断，不依赖前缀）
function isPlaintextApiKey(apiKey) {
  if (!apiKey || typeof apiKey !== 'string') {
    return false
  }

  // SHA256哈希值固定为64个十六进制字符，如果是哈希值则返回false
  if (apiKey.length === 64 && /^[a-f0-9]+$/i.test(apiKey)) {
    return false // 已经是哈希值
  }

  // 其他情况都认为是明文API Key（包括sk-ant-、cr_、自定义前缀等）
  return true
}

// 数据加密函数（用于导入）
function encryptClaudeData(data) {
  if (!data || !config.security.encryptionKey) {
    return data
  }

  const key = crypto.scryptSync(config.security.encryptionKey, 'salt', 32)
  const iv = crypto.randomBytes(16)

  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv)
  let encrypted = cipher.update(data, 'utf8', 'hex')
  encrypted += cipher.final('hex')

  return `${iv.toString('hex')}:${encrypted}`
}

function encryptGeminiData(data) {
  if (!data || !config.security.encryptionKey) {
    return data
  }

  const key = crypto.scryptSync(config.security.encryptionKey, 'gemini-account-salt', 32)
  const iv = crypto.randomBytes(16)

  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv)
  let encrypted = cipher.update(data, 'utf8', 'hex')
  encrypted += cipher.final('hex')

  return `${iv.toString('hex')}:${encrypted}`
}

// 导出使用统计数据
async function exportUsageStats(keyId) {
  try {
    const stats = {
      total: {},
      daily: {},
      monthly: {},
      hourly: {},
      models: {},
      // 费用统计（String 类型）
      costTotal: null,
      costDaily: {},
      costMonthly: {},
      costHourly: {},
      opusTotal: null,
      opusWeekly: {}
    }

    // 导出总统计（Hash）
    const totalData = await redis.client.hgetall(`usage:${keyId}`)
    if (totalData && Object.keys(totalData).length > 0) {
      stats.total = totalData
    }

    // 导出费用总统计（String）
    const costTotal = await redis.client.get(`usage:cost:total:${keyId}`)
    if (costTotal) {
      stats.costTotal = costTotal
    }

    // 导出 Opus 费用总统计（String）
    const opusTotal = await redis.client.get(`usage:opus:total:${keyId}`)
    if (opusTotal) {
      stats.opusTotal = opusTotal
    }

    // 导出每日统计（扫描现有 key，避免时区问题）
    const dailyKeys = await redis.client.keys(`usage:daily:${keyId}:*`)
    for (const key of dailyKeys) {
      const date = key.split(':').pop()
      const data = await redis.client.hgetall(key)
      if (data && Object.keys(data).length > 0) {
        stats.daily[date] = data
      }
    }

    // 导出每日费用（扫描现有 key）
    const costDailyKeys = await redis.client.keys(`usage:cost:daily:${keyId}:*`)
    for (const key of costDailyKeys) {
      const date = key.split(':').pop()
      const value = await redis.client.get(key)
      if (value) {
        stats.costDaily[date] = value
      }
    }

    // 导出每月统计（扫描现有 key）
    const monthlyKeys = await redis.client.keys(`usage:monthly:${keyId}:*`)
    for (const key of monthlyKeys) {
      const month = key.split(':').pop()
      const data = await redis.client.hgetall(key)
      if (data && Object.keys(data).length > 0) {
        stats.monthly[month] = data
      }
    }

    // 导出每月费用（扫描现有 key）
    const costMonthlyKeys = await redis.client.keys(`usage:cost:monthly:${keyId}:*`)
    for (const key of costMonthlyKeys) {
      const month = key.split(':').pop()
      const value = await redis.client.get(key)
      if (value) {
        stats.costMonthly[month] = value
      }
    }

    // 导出 Opus 周费用（扫描现有 key）
    const opusWeeklyKeys = await redis.client.keys(`usage:opus:weekly:${keyId}:*`)
    for (const key of opusWeeklyKeys) {
      const week = key.split(':').pop()
      const value = await redis.client.get(key)
      if (value) {
        stats.opusWeekly[week] = value
      }
    }

    // 导出小时统计（扫描现有 key）
    // key 格式: usage:hourly:{keyId}:{YYYY-MM-DD}:{HH}
    const hourlyKeys = await redis.client.keys(`usage:hourly:${keyId}:*`)
    for (const key of hourlyKeys) {
      const parts = key.split(':')
      const hourKey = `${parts[parts.length - 2]}:${parts[parts.length - 1]}` // YYYY-MM-DD:HH
      const data = await redis.client.hgetall(key)
      if (data && Object.keys(data).length > 0) {
        stats.hourly[hourKey] = data
      }
    }

    // 导出小时费用（扫描现有 key）
    // key 格式: usage:cost:hourly:{keyId}:{YYYY-MM-DD}:{HH}
    const costHourlyKeys = await redis.client.keys(`usage:cost:hourly:${keyId}:*`)
    for (const key of costHourlyKeys) {
      const parts = key.split(':')
      const hourKey = `${parts[parts.length - 2]}:${parts[parts.length - 1]}` // YYYY-MM-DD:HH
      const value = await redis.client.get(key)
      if (value) {
        stats.costHourly[hourKey] = value
      }
    }

    // 导出模型统计（每日）
    const modelDailyKeys = await redis.client.keys(`usage:${keyId}:model:daily:*`)
    for (const key of modelDailyKeys) {
      const match = key.match(/usage:.+:model:daily:(.+):(\d{4}-\d{2}-\d{2})$/)
      if (match) {
        const model = match[1]
        const date = match[2]
        const data = await redis.client.hgetall(key)
        if (data && Object.keys(data).length > 0) {
          if (!stats.models[model]) {
            stats.models[model] = { daily: {}, monthly: {} }
          }
          stats.models[model].daily[date] = data
        }
      }
    }

    // 导出模型统计（每月）
    const modelMonthlyKeys = await redis.client.keys(`usage:${keyId}:model:monthly:*`)
    for (const key of modelMonthlyKeys) {
      const match = key.match(/usage:.+:model:monthly:(.+):(\d{4}-\d{2})$/)
      if (match) {
        const model = match[1]
        const month = match[2]
        const data = await redis.client.hgetall(key)
        if (data && Object.keys(data).length > 0) {
          if (!stats.models[model]) {
            stats.models[model] = { daily: {}, monthly: {} }
          }
          stats.models[model].monthly[month] = data
        }
      }
    }

    return stats
  } catch (error) {
    logger.warn(`⚠️  Failed to export usage stats for ${keyId}: ${error.message}`)
    return null
  }
}

// 导入使用统计数据
async function importUsageStats(keyId, stats) {
  try {
    if (!stats) {
      return
    }

    const pipeline = redis.client.pipeline()
    let importCount = 0

    // 导入总统计（Hash）
    if (stats.total && Object.keys(stats.total).length > 0) {
      for (const [field, value] of Object.entries(stats.total)) {
        pipeline.hset(`usage:${keyId}`, field, value)
      }
      importCount++
    }

    // 导入费用总统计（String）
    if (stats.costTotal) {
      pipeline.set(`usage:cost:total:${keyId}`, stats.costTotal)
      importCount++
    }

    // 导入 Opus 费用总统计（String）
    if (stats.opusTotal) {
      pipeline.set(`usage:opus:total:${keyId}`, stats.opusTotal)
      importCount++
    }

    // 导入每日统计（Hash）
    if (stats.daily) {
      for (const [date, data] of Object.entries(stats.daily)) {
        for (const [field, value] of Object.entries(data)) {
          pipeline.hset(`usage:daily:${keyId}:${date}`, field, value)
        }
        importCount++
      }
    }

    // 导入每日费用（String）
    if (stats.costDaily) {
      for (const [date, value] of Object.entries(stats.costDaily)) {
        pipeline.set(`usage:cost:daily:${keyId}:${date}`, value)
        importCount++
      }
    }

    // 导入每月统计（Hash）
    if (stats.monthly) {
      for (const [month, data] of Object.entries(stats.monthly)) {
        for (const [field, value] of Object.entries(data)) {
          pipeline.hset(`usage:monthly:${keyId}:${month}`, field, value)
        }
        importCount++
      }
    }

    // 导入每月费用（String）
    if (stats.costMonthly) {
      for (const [month, value] of Object.entries(stats.costMonthly)) {
        pipeline.set(`usage:cost:monthly:${keyId}:${month}`, value)
        importCount++
      }
    }

    // 导入 Opus 周费用（String，不加 TTL 保留历史全量）
    if (stats.opusWeekly) {
      for (const [week, value] of Object.entries(stats.opusWeekly)) {
        pipeline.set(`usage:opus:weekly:${keyId}:${week}`, value)
        importCount++
      }
    }

    // 导入小时统计（Hash）
    if (stats.hourly) {
      for (const [hour, data] of Object.entries(stats.hourly)) {
        for (const [field, value] of Object.entries(data)) {
          pipeline.hset(`usage:hourly:${keyId}:${hour}`, field, value)
        }
        importCount++
      }
    }

    // 导入小时费用（String）
    if (stats.costHourly) {
      for (const [hour, value] of Object.entries(stats.costHourly)) {
        pipeline.set(`usage:cost:hourly:${keyId}:${hour}`, value)
        importCount++
      }
    }

    // 导入模型统计（Hash）
    if (stats.models) {
      for (const [model, modelStats] of Object.entries(stats.models)) {
        if (modelStats.daily) {
          for (const [date, data] of Object.entries(modelStats.daily)) {
            for (const [field, value] of Object.entries(data)) {
              pipeline.hset(`usage:${keyId}:model:daily:${model}:${date}`, field, value)
            }
            importCount++
          }
        }

        if (modelStats.monthly) {
          for (const [month, data] of Object.entries(modelStats.monthly)) {
            for (const [field, value] of Object.entries(data)) {
              pipeline.hset(`usage:${keyId}:model:monthly:${model}:${month}`, field, value)
            }
            importCount++
          }
        }
      }
    }

    await pipeline.exec()
    logger.info(`  📊 Imported ${importCount} usage stat entries for API Key ${keyId}`)
  } catch (error) {
    logger.warn(`⚠️  Failed to import usage stats for ${keyId}: ${error.message}`)
  }
}

// 数据脱敏函数
function sanitizeData(data, type) {
  const sanitized = { ...data }

  switch (type) {
    case 'apikey':
      if (sanitized.apiKey) {
        sanitized.apiKey = `${sanitized.apiKey.substring(0, 10)}...[REDACTED]`
      }
      break

    case 'claude_account':
      if (sanitized.email) {
        sanitized.email = '[REDACTED]'
      }
      if (sanitized.password) {
        sanitized.password = '[REDACTED]'
      }
      if (sanitized.accessToken) {
        sanitized.accessToken = '[REDACTED]'
      }
      if (sanitized.refreshToken) {
        sanitized.refreshToken = '[REDACTED]'
      }
      if (sanitized.claudeAiOauth) {
        sanitized.claudeAiOauth = '[REDACTED]'
      }
      if (sanitized.proxyPassword) {
        sanitized.proxyPassword = '[REDACTED]'
      }
      break

    case 'gemini_account':
      if (sanitized.geminiOauth) {
        sanitized.geminiOauth = '[REDACTED]'
      }
      if (sanitized.accessToken) {
        sanitized.accessToken = '[REDACTED]'
      }
      if (sanitized.refreshToken) {
        sanitized.refreshToken = '[REDACTED]'
      }
      if (sanitized.proxyPassword) {
        sanitized.proxyPassword = '[REDACTED]'
      }
      break

    case 'admin':
      if (sanitized.password) {
        sanitized.password = '[REDACTED]'
      }
      break
  }

  return sanitized
}

// 导出数据
async function exportData() {
  try {
    const outputFile = params.output || `backup-${new Date().toISOString().split('T')[0]}.json`
    const types = params.types ? params.types.split(',') : ['all']
    const shouldSanitize = params.sanitize === true
    const shouldDecrypt = params.decrypt !== false // 默认解密

    logger.info('🔄 Starting data export...')
    logger.info(`📁 Output file: ${outputFile}`)
    logger.info(`📋 Data types: ${types.join(', ')}`)
    logger.info(`🔒 Sanitize sensitive data: ${shouldSanitize ? 'YES' : 'NO'}`)
    logger.info(`🔓 Decrypt data: ${shouldDecrypt ? 'YES' : 'NO'}`)

    await redis.connect()
    logger.success('✅ Connected to Redis')

    const exportDataObj = {
      metadata: {
        version: '2.0',
        exportDate: new Date().toISOString(),
        sanitized: shouldSanitize,
        decrypted: shouldDecrypt,
        types
      },
      data: {}
    }

    // 导出 API Keys
    if (types.includes('all') || types.includes('apikeys')) {
      logger.info('📤 Exporting API Keys...')
      const keys = await redis.client.keys('apikey:*')
      const apiKeys = []

      for (const key of keys) {
        if (key === 'apikey:hash_map') {
          continue
        }

        const data = await redis.client.hgetall(key)
        if (data && Object.keys(data).length > 0) {
          // 获取该 API Key 的 ID
          const keyId = data.id

          // 导出使用统计数据
          if (keyId && (types.includes('all') || types.includes('stats'))) {
            data.usageStats = await exportUsageStats(keyId)
          }

          apiKeys.push(shouldSanitize ? sanitizeData(data, 'apikey') : data)
        }
      }

      exportDataObj.data.apiKeys = apiKeys
      logger.success(`✅ Exported ${apiKeys.length} API Keys`)
    }

    // 导出 Claude 账户
    if (types.includes('all') || types.includes('accounts')) {
      logger.info('📤 Exporting Claude accounts...')
      const keys = await redis.client.keys('claude:account:*')
      logger.info(`Found ${keys.length} Claude account keys in Redis`)
      const accounts = []

      for (const key of keys) {
        const data = await redis.client.hgetall(key)

        if (data && Object.keys(data).length > 0) {
          // 解密敏感字段
          if (shouldDecrypt && !shouldSanitize) {
            if (data.email) {
              data.email = decryptClaudeData(data.email)
            }
            if (data.password) {
              data.password = decryptClaudeData(data.password)
            }
            if (data.accessToken) {
              data.accessToken = decryptClaudeData(data.accessToken)
            }
            if (data.refreshToken) {
              data.refreshToken = decryptClaudeData(data.refreshToken)
            }
            if (data.claudeAiOauth) {
              const decrypted = decryptClaudeData(data.claudeAiOauth)
              try {
                data.claudeAiOauth = JSON.parse(decrypted)
              } catch (e) {
                data.claudeAiOauth = decrypted
              }
            }
          }

          accounts.push(shouldSanitize ? sanitizeData(data, 'claude_account') : data)
        }
      }

      exportDataObj.data.claudeAccounts = accounts
      logger.success(`✅ Exported ${accounts.length} Claude accounts`)

      // 导出 Gemini 账户
      logger.info('📤 Exporting Gemini accounts...')
      const geminiKeys = await redis.client.keys('gemini_account:*')
      logger.info(`Found ${geminiKeys.length} Gemini account keys in Redis`)
      const geminiAccounts = []

      for (const key of geminiKeys) {
        const data = await redis.client.hgetall(key)

        if (data && Object.keys(data).length > 0) {
          // 解密敏感字段
          if (shouldDecrypt && !shouldSanitize) {
            if (data.geminiOauth) {
              const decrypted = decryptGeminiData(data.geminiOauth)
              try {
                data.geminiOauth = JSON.parse(decrypted)
              } catch (e) {
                data.geminiOauth = decrypted
              }
            }
            if (data.accessToken) {
              data.accessToken = decryptGeminiData(data.accessToken)
            }
            if (data.refreshToken) {
              data.refreshToken = decryptGeminiData(data.refreshToken)
            }
          }

          geminiAccounts.push(shouldSanitize ? sanitizeData(data, 'gemini_account') : data)
        }
      }

      exportDataObj.data.geminiAccounts = geminiAccounts
      logger.success(`✅ Exported ${geminiAccounts.length} Gemini accounts`)
    }

    // 导出管理员
    if (types.includes('all') || types.includes('admins')) {
      logger.info('📤 Exporting admins...')
      const keys = await redis.client.keys('admin:*')
      const admins = []

      for (const key of keys) {
        if (key.includes('admin_username:')) {
          continue
        }

        const data = await redis.client.hgetall(key)
        if (data && Object.keys(data).length > 0) {
          admins.push(shouldSanitize ? sanitizeData(data, 'admin') : data)
        }
      }

      exportDataObj.data.admins = admins
      logger.success(`✅ Exported ${admins.length} admins`)
    }

    // 导出全局模型统计（如果需要）
    if (types.includes('all') || types.includes('stats')) {
      logger.info('📤 Exporting global model statistics...')
      const globalStats = {
        daily: {},
        monthly: {},
        hourly: {},
        // 新增：索引和全局统计
        monthlyMonths: [], // usage:model:monthly:months Set
        globalTotal: null, // usage:global:total Hash
        globalDaily: {}, // usage:global:daily:* Hash
        globalMonthly: {} // usage:global:monthly:* Hash
      }

      // 导出月份索引
      const monthlyMonths = await redis.client.smembers('usage:model:monthly:months')
      if (monthlyMonths && monthlyMonths.length > 0) {
        globalStats.monthlyMonths = monthlyMonths
        logger.info(`📤 Found ${monthlyMonths.length} months in index`)
      }

      // 导出全局统计
      const globalTotal = await redis.client.hgetall('usage:global:total')
      if (globalTotal && Object.keys(globalTotal).length > 0) {
        globalStats.globalTotal = globalTotal
        logger.info('📤 Found global total stats')
      }

      // 导出全局每日统计
      const globalDailyKeys = await redis.client.keys('usage:global:daily:*')
      for (const key of globalDailyKeys) {
        const date = key.replace('usage:global:daily:', '')
        const data = await redis.client.hgetall(key)
        if (data && Object.keys(data).length > 0) {
          globalStats.globalDaily[date] = data
        }
      }
      logger.info(`📤 Found ${Object.keys(globalStats.globalDaily).length} global daily stats`)

      // 导出全局每月统计
      const globalMonthlyKeys = await redis.client.keys('usage:global:monthly:*')
      for (const key of globalMonthlyKeys) {
        const month = key.replace('usage:global:monthly:', '')
        const data = await redis.client.hgetall(key)
        if (data && Object.keys(data).length > 0) {
          globalStats.globalMonthly[month] = data
        }
      }
      logger.info(`📤 Found ${Object.keys(globalStats.globalMonthly).length} global monthly stats`)

      // 导出全局每日模型统计
      const modelDailyPattern = 'usage:model:daily:*'
      const modelDailyKeys = await redis.client.keys(modelDailyPattern)
      for (const key of modelDailyKeys) {
        const match = key.match(/usage:model:daily:(.+):(\d{4}-\d{2}-\d{2})$/)
        if (match) {
          const model = match[1]
          const date = match[2]
          const data = await redis.client.hgetall(key)
          if (data && Object.keys(data).length > 0) {
            if (!globalStats.daily[date]) {
              globalStats.daily[date] = {}
            }
            globalStats.daily[date][model] = data
          }
        }
      }

      // 导出全局每月模型统计
      const modelMonthlyPattern = 'usage:model:monthly:*'
      const modelMonthlyKeys = await redis.client.keys(modelMonthlyPattern)
      for (const key of modelMonthlyKeys) {
        const match = key.match(/usage:model:monthly:(.+):(\d{4}-\d{2})$/)
        if (match) {
          const model = match[1]
          const month = match[2]
          const data = await redis.client.hgetall(key)
          if (data && Object.keys(data).length > 0) {
            if (!globalStats.monthly[month]) {
              globalStats.monthly[month] = {}
            }
            globalStats.monthly[month][model] = data
          }
        }
      }

      // 导出全局每小时模型统计
      const globalHourlyPattern = 'usage:model:hourly:*'
      const globalHourlyKeys = await redis.client.keys(globalHourlyPattern)
      for (const key of globalHourlyKeys) {
        const match = key.match(/usage:model:hourly:(.+):(\d{4}-\d{2}-\d{2}:\d{2})$/)
        if (match) {
          const model = match[1]
          const hour = match[2]
          const data = await redis.client.hgetall(key)
          if (data && Object.keys(data).length > 0) {
            if (!globalStats.hourly[hour]) {
              globalStats.hourly[hour] = {}
            }
            globalStats.hourly[hour][model] = data
          }
        }
      }

      exportDataObj.data.globalModelStats = globalStats
      logger.success('✅ Exported global model statistics')
    }

    // 写入文件
    await fs.writeFile(outputFile, JSON.stringify(exportDataObj, null, 2))

    // 显示导出摘要
    console.log(`\n${'='.repeat(60)}`)
    console.log('✅ Export Complete!')
    console.log('='.repeat(60))
    console.log(`Output file: ${outputFile}`)
    console.log(`File size: ${(await fs.stat(outputFile)).size} bytes`)

    if (exportDataObj.data.apiKeys) {
      console.log(`API Keys: ${exportDataObj.data.apiKeys.length}`)
    }
    if (exportDataObj.data.claudeAccounts) {
      console.log(`Claude Accounts: ${exportDataObj.data.claudeAccounts.length}`)
    }
    if (exportDataObj.data.geminiAccounts) {
      console.log(`Gemini Accounts: ${exportDataObj.data.geminiAccounts.length}`)
    }
    if (exportDataObj.data.admins) {
      console.log(`Admins: ${exportDataObj.data.admins.length}`)
    }
    console.log('='.repeat(60))

    if (shouldSanitize) {
      logger.warn('⚠️  Sensitive data has been sanitized in this export.')
    }
    if (shouldDecrypt) {
      logger.info('🔓 Encrypted data has been decrypted for portability.')
    }
  } catch (error) {
    logger.error('💥 Export failed:', error)
    process.exit(1)
  } finally {
    await redis.disconnect()
    rl.close()
  }
}

// 显示帮助信息
function showHelp() {
  console.log(`
Enhanced Data Transfer Tool for Claude Relay Service

This tool handles encrypted data export/import between environments.

Usage:
  node scripts/data-transfer-enhanced.js <command> [options]

Commands:
  export    Export data from Redis to a JSON file
  import    Import data from a JSON file to Redis

Export Options:
  --output=FILE        Output filename (default: backup-YYYY-MM-DD.json)
  --types=TYPE,...     Data types: apikeys,accounts,admins,stats,all (default: all)
                       stats: Include usage statistics with API keys
  --sanitize           Remove sensitive data from export
  --decrypt=false      Keep data encrypted (default: true - decrypt for portability)

Import Options:
  --input=FILE         Input filename (required)
  --force              Overwrite existing data without asking
  --skip-conflicts     Skip conflicting data without asking

Important Notes:
  - The tool automatically handles encryption/decryption during import
  - If importing decrypted data, it will be re-encrypted automatically
  - If importing encrypted data, it will be stored as-is
  - Sanitized exports cannot be properly imported (missing sensitive data)
  - Automatic handling of plaintext API Keys
    * Uses your configured API_KEY_PREFIX from config (sk-, cr_, etc.)
    * Automatically detects plaintext vs hashed API Keys by format
    * Plaintext API Keys are automatically hashed during import
    * Hash mappings are created correctly for plaintext keys
    * Supports custom prefixes and legacy format detection
    * No manual conversion needed - just import your backup file

Examples:
  # Export all data with decryption (for migration)
  node scripts/data-transfer-enhanced.js export

  # Export without decrypting (for backup)
  node scripts/data-transfer-enhanced.js export --decrypt=false

  # Import data (auto-handles encryption and plaintext API keys)
  node scripts/data-transfer-enhanced.js import --input=backup.json

  # Import with force overwrite
  node scripts/data-transfer-enhanced.js import --input=backup.json --force
`)
}

// 导入数据
async function importData() {
  try {
    const inputFile = params.input
    if (!inputFile) {
      logger.error('❌ Please specify input file with --input=filename.json')
      process.exit(1)
    }

    const forceOverwrite = params.force === true
    const skipConflicts = params['skip-conflicts'] === true

    logger.info('🔄 Starting data import...')
    logger.info(`📁 Input file: ${inputFile}`)
    logger.info(
      `⚡ Mode: ${forceOverwrite ? 'FORCE OVERWRITE' : skipConflicts ? 'SKIP CONFLICTS' : 'ASK ON CONFLICT'}`
    )

    // 读取文件
    const fileContent = await fs.readFile(inputFile, 'utf8')
    const importDataObj = JSON.parse(fileContent)

    // 验证文件格式
    if (!importDataObj.metadata || !importDataObj.data) {
      logger.error('❌ Invalid backup file format')
      process.exit(1)
    }

    logger.info(`📅 Backup date: ${importDataObj.metadata.exportDate}`)
    logger.info(`🔒 Sanitized: ${importDataObj.metadata.sanitized ? 'YES' : 'NO'}`)
    logger.info(`🔓 Decrypted: ${importDataObj.metadata.decrypted ? 'YES' : 'NO'}`)

    if (importDataObj.metadata.sanitized) {
      logger.warn('⚠️  This backup contains sanitized data. Sensitive fields will be missing!')
      const proceed = await askConfirmation('Continue with sanitized data?')
      if (!proceed) {
        logger.info('❌ Import cancelled')
        return
      }
    }

    // 显示导入摘要
    console.log(`\n${'='.repeat(60)}`)
    console.log('📋 Import Summary:')
    console.log('='.repeat(60))
    if (importDataObj.data.apiKeys) {
      console.log(`API Keys to import: ${importDataObj.data.apiKeys.length}`)
    }
    if (importDataObj.data.claudeAccounts) {
      console.log(`Claude Accounts to import: ${importDataObj.data.claudeAccounts.length}`)
    }
    if (importDataObj.data.geminiAccounts) {
      console.log(`Gemini Accounts to import: ${importDataObj.data.geminiAccounts.length}`)
    }
    if (importDataObj.data.admins) {
      console.log(`Admins to import: ${importDataObj.data.admins.length}`)
    }
    console.log(`${'='.repeat(60)}\n`)

    // 确认导入
    const confirmed = await askConfirmation('⚠️  Proceed with import?')
    if (!confirmed) {
      logger.info('❌ Import cancelled')
      return
    }

    // 连接 Redis
    await redis.connect()
    logger.success('✅ Connected to Redis')

    const stats = {
      imported: 0,
      skipped: 0,
      errors: 0
    }

    // 导入 API Keys
    if (importDataObj.data.apiKeys) {
      logger.info('\n📥 Importing API Keys...')
      for (const apiKey of importDataObj.data.apiKeys) {
        try {
          const exists = await redis.client.exists(`apikey:${apiKey.id}`)

          if (exists && !forceOverwrite) {
            if (skipConflicts) {
              logger.warn(`⏭️  Skipped existing API Key: ${apiKey.name} (${apiKey.id})`)
              stats.skipped++
              continue
            } else {
              const overwrite = await askConfirmation(
                `API Key "${apiKey.name}" (${apiKey.id}) exists. Overwrite?`
              )
              if (!overwrite) {
                stats.skipped++
                continue
              }
            }
          }

          // 保存使用统计数据以便单独导入
          const { usageStats } = apiKey

          // 从apiKey对象中删除usageStats字段，避免存储到主键中
          const apiKeyData = { ...apiKey }
          delete apiKeyData.usageStats

          // 检查并处理API Key哈希
          let plainTextApiKey = null
          let hashedApiKey = null

          if (apiKeyData.apiKey && isPlaintextApiKey(apiKeyData.apiKey)) {
            // 如果是明文API Key，保存明文并计算哈希
            plainTextApiKey = apiKeyData.apiKey
            hashedApiKey = hashApiKey(plainTextApiKey)
            logger.info(`🔐 Detected plaintext API Key for: ${apiKey.name} (${apiKey.id})`)
          } else if (apiKeyData.apiKey) {
            // 如果已经是哈希值，直接使用
            hashedApiKey = apiKeyData.apiKey
            logger.info(`🔍 Using existing hashed API Key for: ${apiKey.name} (${apiKey.id})`)
          }

          // API Key字段始终存储哈希值
          if (hashedApiKey) {
            apiKeyData.apiKey = hashedApiKey
          }

          // 使用 hset 存储到哈希表
          const pipeline = redis.client.pipeline()
          for (const [field, value] of Object.entries(apiKeyData)) {
            pipeline.hset(`apikey:${apiKey.id}`, field, value)
          }
          await pipeline.exec()

          // 更新哈希映射：hash_map的key必须是哈希值
          if (!importDataObj.metadata.sanitized && hashedApiKey) {
            await redis.client.hset('apikey:hash_map', hashedApiKey, apiKey.id)
            logger.info(
              `📝 Updated hash mapping: ${hashedApiKey.substring(0, 8)}... -> ${apiKey.id}`
            )
          }

          // 导入使用统计数据
          if (usageStats) {
            await importUsageStats(apiKey.id, usageStats)
          }

          logger.success(`✅ Imported API Key: ${apiKey.name} (${apiKey.id})`)
          stats.imported++
        } catch (error) {
          logger.error(`❌ Failed to import API Key ${apiKey.id}:`, error.message)
          stats.errors++
        }
      }
    }

    // 导入 Claude 账户
    if (importDataObj.data.claudeAccounts) {
      logger.info('\n📥 Importing Claude accounts...')
      for (const account of importDataObj.data.claudeAccounts) {
        try {
          const exists = await redis.client.exists(`claude:account:${account.id}`)

          if (exists && !forceOverwrite) {
            if (skipConflicts) {
              logger.warn(`⏭️  Skipped existing Claude account: ${account.name} (${account.id})`)
              stats.skipped++
              continue
            } else {
              const overwrite = await askConfirmation(
                `Claude account "${account.name}" (${account.id}) exists. Overwrite?`
              )
              if (!overwrite) {
                stats.skipped++
                continue
              }
            }
          }

          // 复制账户数据以避免修改原始数据
          const accountData = { ...account }

          // 如果数据已解密且不是脱敏数据，需要重新加密
          if (importDataObj.metadata.decrypted && !importDataObj.metadata.sanitized) {
            logger.info(`🔐 Re-encrypting sensitive data for Claude account: ${account.name}`)

            if (accountData.email) {
              accountData.email = encryptClaudeData(accountData.email)
            }
            if (accountData.password) {
              accountData.password = encryptClaudeData(accountData.password)
            }
            if (accountData.accessToken) {
              accountData.accessToken = encryptClaudeData(accountData.accessToken)
            }
            if (accountData.refreshToken) {
              accountData.refreshToken = encryptClaudeData(accountData.refreshToken)
            }
            if (accountData.claudeAiOauth) {
              // 如果是对象，先序列化再加密
              const oauthStr =
                typeof accountData.claudeAiOauth === 'object'
                  ? JSON.stringify(accountData.claudeAiOauth)
                  : accountData.claudeAiOauth
              accountData.claudeAiOauth = encryptClaudeData(oauthStr)
            }
          }

          // 使用 hset 存储到哈希表
          const pipeline = redis.client.pipeline()
          for (const [field, value] of Object.entries(accountData)) {
            if (field === 'claudeAiOauth' && typeof value === 'object') {
              // 确保对象被序列化
              pipeline.hset(`claude:account:${account.id}`, field, JSON.stringify(value))
            } else {
              pipeline.hset(`claude:account:${account.id}`, field, value)
            }
          }
          await pipeline.exec()

          logger.success(`✅ Imported Claude account: ${account.name} (${account.id})`)
          stats.imported++
        } catch (error) {
          logger.error(`❌ Failed to import Claude account ${account.id}:`, error.message)
          stats.errors++
        }
      }
    }

    // 导入 Gemini 账户
    if (importDataObj.data.geminiAccounts) {
      logger.info('\n📥 Importing Gemini accounts...')
      for (const account of importDataObj.data.geminiAccounts) {
        try {
          const exists = await redis.client.exists(`gemini_account:${account.id}`)

          if (exists && !forceOverwrite) {
            if (skipConflicts) {
              logger.warn(`⏭️  Skipped existing Gemini account: ${account.name} (${account.id})`)
              stats.skipped++
              continue
            } else {
              const overwrite = await askConfirmation(
                `Gemini account "${account.name}" (${account.id}) exists. Overwrite?`
              )
              if (!overwrite) {
                stats.skipped++
                continue
              }
            }
          }

          // 复制账户数据以避免修改原始数据
          const accountData = { ...account }

          // 如果数据已解密且不是脱敏数据，需要重新加密
          if (importDataObj.metadata.decrypted && !importDataObj.metadata.sanitized) {
            logger.info(`🔐 Re-encrypting sensitive data for Gemini account: ${account.name}`)

            if (accountData.geminiOauth) {
              const oauthStr =
                typeof accountData.geminiOauth === 'object'
                  ? JSON.stringify(accountData.geminiOauth)
                  : accountData.geminiOauth
              accountData.geminiOauth = encryptGeminiData(oauthStr)
            }
            if (accountData.accessToken) {
              accountData.accessToken = encryptGeminiData(accountData.accessToken)
            }
            if (accountData.refreshToken) {
              accountData.refreshToken = encryptGeminiData(accountData.refreshToken)
            }
          }

          // 使用 hset 存储到哈希表
          const pipeline = redis.client.pipeline()
          for (const [field, value] of Object.entries(accountData)) {
            pipeline.hset(`gemini_account:${account.id}`, field, value)
          }
          await pipeline.exec()

          logger.success(`✅ Imported Gemini account: ${account.name} (${account.id})`)
          stats.imported++
        } catch (error) {
          logger.error(`❌ Failed to import Gemini account ${account.id}:`, error.message)
          stats.errors++
        }
      }
    }

    // 导入管理员账户
    if (importDataObj.data.admins) {
      logger.info('\n📥 Importing admins...')
      for (const admin of importDataObj.data.admins) {
        try {
          const exists = await redis.client.exists(`admin:${admin.id}`)

          if (exists && !forceOverwrite) {
            if (skipConflicts) {
              logger.warn(`⏭️  Skipped existing admin: ${admin.username} (${admin.id})`)
              stats.skipped++
              continue
            } else {
              const overwrite = await askConfirmation(
                `Admin "${admin.username}" (${admin.id}) exists. Overwrite?`
              )
              if (!overwrite) {
                stats.skipped++
                continue
              }
            }
          }

          // 使用 hset 存储到哈希表
          const pipeline = redis.client.pipeline()
          for (const [field, value] of Object.entries(admin)) {
            pipeline.hset(`admin:${admin.id}`, field, value)
          }
          await pipeline.exec()

          // 更新用户名映射
          await redis.client.set(`admin_username:${admin.username}`, admin.id)

          logger.success(`✅ Imported admin: ${admin.username} (${admin.id})`)
          stats.imported++
        } catch (error) {
          logger.error(`❌ Failed to import admin ${admin.id}:`, error.message)
          stats.errors++
        }
      }
    }

    // 导入全局模型统计
    if (importDataObj.data.globalModelStats) {
      logger.info('\n📥 Importing global model statistics...')
      try {
        const globalStats = importDataObj.data.globalModelStats
        const pipeline = redis.client.pipeline()
        let globalStatCount = 0

        // 导入月份索引
        if (globalStats.monthlyMonths && globalStats.monthlyMonths.length > 0) {
          for (const month of globalStats.monthlyMonths) {
            pipeline.sadd('usage:model:monthly:months', month)
          }
          logger.info(`📥 Importing ${globalStats.monthlyMonths.length} months to index`)
        }

        // 导入全局统计
        if (globalStats.globalTotal) {
          for (const [field, value] of Object.entries(globalStats.globalTotal)) {
            pipeline.hset('usage:global:total', field, value)
          }
          logger.info('📥 Importing global total stats')
        }

        // 导入全局每日统计
        if (globalStats.globalDaily) {
          for (const [date, data] of Object.entries(globalStats.globalDaily)) {
            for (const [field, value] of Object.entries(data)) {
              pipeline.hset(`usage:global:daily:${date}`, field, value)
            }
          }
          logger.info(
            `📥 Importing ${Object.keys(globalStats.globalDaily).length} global daily stats`
          )
        }

        // 导入全局每月统计
        if (globalStats.globalMonthly) {
          for (const [month, data] of Object.entries(globalStats.globalMonthly)) {
            for (const [field, value] of Object.entries(data)) {
              pipeline.hset(`usage:global:monthly:${month}`, field, value)
            }
          }
          logger.info(
            `📥 Importing ${Object.keys(globalStats.globalMonthly).length} global monthly stats`
          )
        }

        // 导入每日统计
        if (globalStats.daily) {
          for (const [date, models] of Object.entries(globalStats.daily)) {
            for (const [model, data] of Object.entries(models)) {
              for (const [field, value] of Object.entries(data)) {
                pipeline.hset(`usage:model:daily:${model}:${date}`, field, value)
              }
              globalStatCount++
            }
          }
        }

        // 导入每月统计
        if (globalStats.monthly) {
          for (const [month, models] of Object.entries(globalStats.monthly)) {
            for (const [model, data] of Object.entries(models)) {
              for (const [field, value] of Object.entries(data)) {
                pipeline.hset(`usage:model:monthly:${model}:${month}`, field, value)
              }
              globalStatCount++
            }
            // 同时更新月份索引（兼容旧格式导出文件）
            pipeline.sadd('usage:model:monthly:months', month)
          }
        }

        // 导入每小时统计
        if (globalStats.hourly) {
          for (const [hour, models] of Object.entries(globalStats.hourly)) {
            for (const [model, data] of Object.entries(models)) {
              for (const [field, value] of Object.entries(data)) {
                pipeline.hset(`usage:model:hourly:${model}:${hour}`, field, value)
              }
              globalStatCount++
            }
          }
        }

        await pipeline.exec()
        logger.success(`✅ Imported ${globalStatCount} global model stat entries`)
        stats.imported += globalStatCount
      } catch (error) {
        logger.error('❌ Failed to import global model stats:', error.message)
        stats.errors++
      }
    }

    // 显示导入结果
    console.log(`\n${'='.repeat(60)}`)
    console.log('✅ Import Complete!')
    console.log('='.repeat(60))
    console.log(`Successfully imported: ${stats.imported}`)
    console.log(`Skipped: ${stats.skipped}`)
    console.log(`Errors: ${stats.errors}`)
    console.log('='.repeat(60))
  } catch (error) {
    logger.error('💥 Import failed:', error)
    process.exit(1)
  } finally {
    await redis.disconnect()
    rl.close()
  }
}

// 主函数
async function main() {
  if (!command || command === '--help' || command === 'help') {
    showHelp()
    process.exit(0)
  }

  switch (command) {
    case 'export':
      await exportData()
      break

    case 'import':
      await importData()
      break

    default:
      logger.error(`❌ Unknown command: ${command}`)
      showHelp()
      process.exit(1)
  }
}

// 运行
main().catch((error) => {
  logger.error('💥 Unexpected error:', error)
  process.exit(1)
})
