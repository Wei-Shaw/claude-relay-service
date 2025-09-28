#!/usr/bin/env node

/**
 * 数据导出/导入工具
 *
 * 使用方法：
 * 导出: node scripts/data-transfer.js export --output=backup.json [options]
 * 导入: node scripts/data-transfer.js import --input=backup.json [options]
 *
 * 选项：
 * --types: 要导出/导入的数据类型（apikeys,accounts,admins,all）
 * --sanitize: 导出时脱敏敏感数据
 * --force: 导入时强制覆盖已存在的数据
 * --skip-conflicts: 导入时跳过冲突的数据
 */

const fs = require('fs').promises
const redis = require('../src/models/redis')
const logger = require('../src/utils/logger')
const readline = require('readline')

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

// 数据脱敏函数
function sanitizeData(data, type) {
  const sanitized = { ...data }

  switch (type) {
    case 'apikey':
      // 隐藏 API Key 的大部分内容
      if (sanitized.apiKey) {
        sanitized.apiKey = `${sanitized.apiKey.substring(0, 10)}...[REDACTED]`
      }
      break

    case 'claude_account':
    case 'gemini_account':
      // 隐藏 OAuth tokens
      if (sanitized.accessToken) {
        sanitized.accessToken = '[REDACTED]'
      }
      if (sanitized.refreshToken) {
        sanitized.refreshToken = '[REDACTED]'
      }
      if (sanitized.claudeAiOauth) {
        sanitized.claudeAiOauth = '[REDACTED]'
      }
      // 隐藏代理密码
      if (sanitized.proxyPassword) {
        sanitized.proxyPassword = '[REDACTED]'
      }
      break

    case 'admin':
      // 隐藏管理员密码
      if (sanitized.password) {
        sanitized.password = '[REDACTED]'
      }
      break
  }

  return sanitized
}

// CSV 字段映射配置
const CSV_FIELD_MAPPING = {
  // 基本信息
  id: 'ID',
  name: '名称',
  description: '描述',
  isActive: '状态',
  createdAt: '创建时间',
  lastUsedAt: '最后使用时间',
  createdBy: '创建者',

  // API Key 信息
  apiKey: 'API密钥',
  tokenLimit: '令牌限制',

  // 过期设置
  expirationMode: '过期模式',
  expiresAt: '过期时间',
  activationDays: '激活天数',
  activationUnit: '激活单位',
  isActivated: '已激活',
  activatedAt: '激活时间',

  // 权限设置
  permissions: '服务权限',

  // 限制设置
  rateLimitWindow: '速率窗口(分钟)',
  rateLimitRequests: '请求次数限制',
  rateLimitCost: '费用限制(美元)',
  concurrencyLimit: '并发限制',
  dailyCostLimit: '日费用限制(美元)',
  totalCostLimit: '总费用限制(美元)',
  weeklyOpusCostLimit: '周Opus费用限制(美元)',

  // 账户绑定
  claudeAccountId: 'Claude专属账户',
  claudeConsoleAccountId: 'Claude控制台账户',
  geminiAccountId: 'Gemini专属账户',
  openaiAccountId: 'OpenAI专属账户',
  azureOpenaiAccountId: 'Azure OpenAI专属账户',
  bedrockAccountId: 'Bedrock专属账户',

  // 限制配置
  enableModelRestriction: '启用模型限制',
  restrictedModels: '限制的模型',
  enableClientRestriction: '启用客户端限制',
  allowedClients: '允许的客户端',

  // 标签和用户
  tags: '标签',
  userId: '用户ID',
  userUsername: '用户名',

  // 其他信息
  icon: '图标'
}

// 数据格式化函数
function formatCSVValue(key, value, shouldSanitize = false) {
  if (!value || value === '' || value === 'null' || value === 'undefined') {
    return ''
  }

  switch (key) {
    case 'apiKey':
      if (shouldSanitize && value.length > 10) {
        return `${value.substring(0, 10)}...[已脱敏]`
      }
      return value

    case 'isActive':
    case 'isActivated':
    case 'enableModelRestriction':
    case 'enableClientRestriction':
      return value === 'true' ? '是' : '否'

    case 'expirationMode':
      return value === 'activation' ? '首次使用后激活' : value === 'fixed' ? '固定时间' : value

    case 'activationUnit':
      return value === 'hours' ? '小时' : value === 'days' ? '天' : value

    case 'permissions':
      switch (value) {
        case 'all':
          return '全部服务'
        case 'claude':
          return '仅Claude'
        case 'gemini':
          return '仅Gemini'
        case 'openai':
          return '仅OpenAI'
        default:
          return value
      }

    case 'restrictedModels':
    case 'allowedClients':
    case 'tags':
      try {
        const parsed = JSON.parse(value)
        return Array.isArray(parsed) ? parsed.join('; ') : value
      } catch {
        return value
      }

    case 'createdAt':
    case 'lastUsedAt':
    case 'activatedAt':
    case 'expiresAt':
      if (value) {
        try {
          return new Date(value).toLocaleString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
          })
        } catch {
          return value
        }
      }
      return ''

    case 'rateLimitWindow':
    case 'rateLimitRequests':
    case 'concurrencyLimit':
    case 'activationDays':
    case 'tokenLimit':
      return value === '0' || value === 0 ? '无限制' : value

    case 'rateLimitCost':
    case 'dailyCostLimit':
    case 'totalCostLimit':
    case 'weeklyOpusCostLimit':
      return value === '0' || value === 0 ? '无限制' : `$${value}`

    default:
      return value
  }
}

// 转义 CSV 字段
function escapeCSVField(field) {
  if (field === null || field === undefined) {
    return ''
  }

  const str = String(field)

  // 如果包含逗号、引号或换行符，需要用引号包围
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    // 先转义引号（双引号变成两个双引号）
    const escaped = str.replace(/"/g, '""')
    return `"${escaped}"`
  }

  return str
}

// 转换数据为 CSV 格式
function convertToCSV(exportDataObj, shouldSanitize = false) {
  if (!exportDataObj.data.apiKeys || exportDataObj.data.apiKeys.length === 0) {
    throw new Error('CSV format only supports API Keys export. Please use --types=apikeys')
  }

  const { apiKeys } = exportDataObj.data
  const fields = Object.keys(CSV_FIELD_MAPPING)
  const headers = Object.values(CSV_FIELD_MAPPING)

  // 生成标题行
  const csvLines = [headers.map(escapeCSVField).join(',')]

  // 生成数据行
  for (const apiKey of apiKeys) {
    const row = fields.map((field) => {
      const value = formatCSVValue(field, apiKey[field], shouldSanitize)
      return escapeCSVField(value)
    })
    csvLines.push(row.join(','))
  }

  return csvLines.join('\n')
}

// 导出数据
async function exportData() {
  try {
    const format = params.format || 'json'
    const fileExtension = format === 'csv' ? '.csv' : '.json'
    const defaultFileName = `backup-${new Date().toISOString().split('T')[0]}${fileExtension}`
    const outputFile = params.output || defaultFileName
    const types = params.types ? params.types.split(',') : ['all']
    const shouldSanitize = params.sanitize === true

    // CSV 格式验证
    if (format === 'csv' && !types.includes('apikeys') && !types.includes('all')) {
      logger.error('❌ CSV format only supports API Keys export. Please use --types=apikeys')
      process.exit(1)
    }

    logger.info('🔄 Starting data export...')
    logger.info(`📁 Output file: ${outputFile}`)
    logger.info(`📋 Data types: ${types.join(', ')}`)
    logger.info(`📄 Output format: ${format.toUpperCase()}`)
    logger.info(`🔒 Sanitize sensitive data: ${shouldSanitize ? 'YES' : 'NO'}`)

    // 连接 Redis
    await redis.connect()
    logger.success('✅ Connected to Redis')

    const exportDataObj = {
      metadata: {
        version: '1.0',
        exportDate: new Date().toISOString(),
        sanitized: shouldSanitize,
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

        // 使用 hgetall 而不是 get，因为数据存储在哈希表中
        const data = await redis.client.hgetall(key)

        if (data && Object.keys(data).length > 0) {
          apiKeys.push(shouldSanitize ? sanitizeData(data, 'apikey') : data)
        }
      }

      exportDataObj.data.apiKeys = apiKeys
      logger.success(`✅ Exported ${apiKeys.length} API Keys`)
    }

    // 导出 Claude 账户
    if (types.includes('all') || types.includes('accounts')) {
      logger.info('📤 Exporting Claude accounts...')
      // 注意：Claude 账户使用 claude:account: 前缀，不是 claude_account:
      const keys = await redis.client.keys('claude:account:*')
      logger.info(`Found ${keys.length} Claude account keys in Redis`)
      const accounts = []

      for (const key of keys) {
        // 使用 hgetall 而不是 get，因为数据存储在哈希表中
        const data = await redis.client.hgetall(key)

        if (data && Object.keys(data).length > 0) {
          // 解析 JSON 字段（如果存在）
          if (data.claudeAiOauth) {
            try {
              data.claudeAiOauth = JSON.parse(data.claudeAiOauth)
            } catch (e) {
              // 保持原样
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
        // 使用 hgetall 而不是 get，因为数据存储在哈希表中
        const data = await redis.client.hgetall(key)

        if (data && Object.keys(data).length > 0) {
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

        // 使用 hgetall 而不是 get，因为数据存储在哈希表中
        const data = await redis.client.hgetall(key)

        if (data && Object.keys(data).length > 0) {
          admins.push(shouldSanitize ? sanitizeData(data, 'admin') : data)
        }
      }

      exportDataObj.data.admins = admins
      logger.success(`✅ Exported ${admins.length} admins`)
    }

    // 根据格式写入文件
    let fileContent
    if (format === 'csv') {
      fileContent = convertToCSV(exportDataObj, shouldSanitize)
      // 添加 UTF-8 BOM 以便 Excel 正确识别中文
      fileContent = `\ufeff${fileContent}`
      await fs.writeFile(outputFile, fileContent, 'utf8')
    } else {
      await fs.writeFile(outputFile, JSON.stringify(exportDataObj, null, 2))
    }

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
  } catch (error) {
    logger.error('💥 Export failed:', error)
    process.exit(1)
  } finally {
    await redis.disconnect()
    rl.close()
  }
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

          // 使用 hset 存储到哈希表
          const pipeline = redis.client.pipeline()
          for (const [field, value] of Object.entries(apiKey)) {
            pipeline.hset(`apikey:${apiKey.id}`, field, value)
          }
          await pipeline.exec()

          // 更新哈希映射
          if (apiKey.apiKey && !importDataObj.metadata.sanitized) {
            await redis.client.hset('apikey:hash_map', apiKey.apiKey, apiKey.id)
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
          const exists = await redis.client.exists(`claude_account:${account.id}`)

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

          // 使用 hset 存储到哈希表
          const pipeline = redis.client.pipeline()
          for (const [field, value] of Object.entries(account)) {
            // 如果是对象，需要序列化
            if (field === 'claudeAiOauth' && typeof value === 'object') {
              pipeline.hset(`claude_account:${account.id}`, field, JSON.stringify(value))
            } else {
              pipeline.hset(`claude_account:${account.id}`, field, value)
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

          // 使用 hset 存储到哈希表
          const pipeline = redis.client.pipeline()
          for (const [field, value] of Object.entries(account)) {
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

// 显示帮助信息
function showHelp() {
  console.log(`
Data Transfer Tool for Claude Relay Service

This tool allows you to export and import data between environments.

Usage:
  node scripts/data-transfer.js <command> [options]

Commands:
  export    Export data from Redis to a JSON file
  import    Import data from a JSON file to Redis

Export Options:
  --output=FILE        Output filename (default: backup-YYYY-MM-DD.json/.csv)
  --types=TYPE,...     Data types to export: apikeys,accounts,admins,all (default: all)
  --format=FORMAT      Output format: json,csv (default: json)
  --sanitize           Remove sensitive data from export

Import Options:
  --input=FILE         Input filename (required)
  --force              Overwrite existing data without asking
  --skip-conflicts     Skip conflicting data without asking

Examples:
  # Export all data
  node scripts/data-transfer.js export

  # Export only API keys with sanitized data
  node scripts/data-transfer.js export --types=apikeys --sanitize

  # Import data, skip conflicts
  node scripts/data-transfer.js import --input=backup.json --skip-conflicts

  # Export specific data types
  node scripts/data-transfer.js export --types=apikeys,accounts --output=prod-data.json
  
  # Export API keys to CSV format
  node scripts/data-transfer.js export --types=apikeys --format=csv --sanitize
  
  # Export to CSV with custom filename
  node scripts/data-transfer.js export --types=apikeys --format=csv --output=api-keys.csv
`)
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
