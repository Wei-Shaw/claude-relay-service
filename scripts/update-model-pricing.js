#!/usr/bin/env node

/**
 * 手动更新模型价格数据脚本
 * 从价格镜像分支下载最新的模型价格和上下文窗口信息
 */

const fs = require('fs')
const path = require('path')
const https = require('https')
const crypto = require('crypto')
const pricingSource = require('../config/pricingSource')

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
  magenta: '\x1b[35m'
}

// 日志函数
const log = {
  info: (msg) => console.log(`${colors.blue}[INFO]${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}[SUCCESS]${colors.reset} ${msg}`),
  error: (msg) => console.error(`${colors.red}[ERROR]${colors.reset} ${msg}`),
  warn: (msg) => console.warn(`${colors.yellow}[WARNING]${colors.reset} ${msg}`)
}

// 配置
const config = {
  dataDir: path.join(process.cwd(), 'data'),
  pricingFile: path.join(process.cwd(), 'data', 'model_pricing.json'),
  hashFile: path.join(process.cwd(), 'data', 'model_pricing.sha256'),
  pricingUrl: pricingSource.pricingUrl,
  fallbackFile: path.join(
    process.cwd(),
    'resources',
    'model-pricing',
    'model_prices_and_context_window.json'
  ),
  backupFile: path.join(process.cwd(), 'data', 'model_pricing.backup.json'),
  timeout: 30000 // 30秒超时
}

// 创建数据目录
function ensureDataDir() {
  if (!fs.existsSync(config.dataDir)) {
    fs.mkdirSync(config.dataDir, { recursive: true })
    log.info('Created data directory')
  }
}

// 备份现有文件
function backupExistingFile() {
  if (fs.existsSync(config.pricingFile)) {
    try {
      fs.copyFileSync(config.pricingFile, config.backupFile)
      log.info('Backed up existing pricing file')
      return true
    } catch (error) {
      log.warn(`Failed to backup existing file: ${error.message}`)
      return false
    }
  }
  return false
}

// 恢复备份
function restoreBackup() {
  if (fs.existsSync(config.backupFile)) {
    try {
      fs.copyFileSync(config.backupFile, config.pricingFile)
      log.info('Restored from backup')
      return true
    } catch (error) {
      log.error(`Failed to restore backup: ${error.message}`)
      return false
    }
  }
  return false
}

// 下载价格数据
function downloadPricingData() {
  return new Promise((resolve, reject) => {
    log.info('正在从价格镜像分支拉取最新的模型价格数据...')
    log.info(`拉取地址: ${config.pricingUrl}`)

    const request = https.get(config.pricingUrl, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`))
        return
      }

      let data = ''
      let downloadedBytes = 0

      response.on('data', (chunk) => {
        data += chunk
        downloadedBytes += chunk.length
        // 显示下载进度
        process.stdout.write(`\rDownloading... ${Math.round(downloadedBytes / 1024)}KB`)
      })

      response.on('end', () => {
        process.stdout.write('\n') // 换行
        try {
          const jsonData = JSON.parse(data)

          // 验证数据结构
          if (typeof jsonData !== 'object' || Object.keys(jsonData).length === 0) {
            throw new Error('Invalid pricing data structure')
          }

          // 保存到文件
          const formattedJson = JSON.stringify(jsonData, null, 2)
          fs.writeFileSync(config.pricingFile, formattedJson)

          const hash = crypto.createHash('sha256').update(formattedJson).digest('hex')
          fs.writeFileSync(config.hashFile, `${hash}\n`)

          const modelCount = Object.keys(jsonData).length
          const fileSize = Math.round(fs.statSync(config.pricingFile).size / 1024)

          log.success(`Downloaded pricing data for ${modelCount} models (${fileSize}KB)`)

          // 显示一些统计信息
          const claudeModels = Object.keys(jsonData).filter((k) => k.includes('claude')).length
          const gptModels = Object.keys(jsonData).filter((k) => k.includes('gpt')).length
          const geminiModels = Object.keys(jsonData).filter((k) => k.includes('gemini')).length

          log.info('Model breakdown:')
          log.info(`  - Claude models: ${claudeModels}`)
          log.info(`  - GPT models: ${gptModels}`)
          log.info(`  - Gemini models: ${geminiModels}`)
          log.info(`  - Other models: ${modelCount - claudeModels - gptModels - geminiModels}`)

          resolve(jsonData)
        } catch (error) {
          reject(new Error(`Failed to parse pricing data: ${error.message}`))
        }
      })
    })

    request.on('error', (error) => {
      reject(new Error(`Network error: ${error.message}`))
    })

    request.setTimeout(config.timeout, () => {
      request.destroy()
      reject(new Error(`Download timeout after ${config.timeout / 1000} seconds`))
    })
  })
}

// 使用 fallback 文件
function useFallback() {
  log.warn('Attempting to use fallback pricing data...')

  if (!fs.existsSync(config.fallbackFile)) {
    log.error(`Fallback file not found: ${config.fallbackFile}`)
    return false
  }

  try {
    const fallbackData = fs.readFileSync(config.fallbackFile, 'utf8')
    const jsonData = JSON.parse(fallbackData)

    // 保存到data目录
    fs.writeFileSync(config.pricingFile, JSON.stringify(jsonData, null, 2))

    const modelCount = Object.keys(jsonData).length
    log.warn(`Using fallback pricing data for ${modelCount} models`)
    log.info('Note: Fallback data may be outdated. Try updating again later.')

    return true
  } catch (error) {
    log.error(`Failed to use fallback: ${error.message}`)
    return false
  }
}

// 显示当前状态
function showCurrentStatus() {
  if (fs.existsSync(config.pricingFile)) {
    const stats = fs.statSync(config.pricingFile)
    const fileAge = Date.now() - stats.mtime.getTime()
    const ageInHours = Math.round(fileAge / (60 * 60 * 1000))
    const ageInDays = Math.floor(ageInHours / 24)

    let ageString = ''
    if (ageInDays > 0) {
      ageString = `${ageInDays} day${ageInDays > 1 ? 's' : ''} and ${ageInHours % 24} hour${ageInHours % 24 !== 1 ? 's' : ''}`
    } else {
      ageString = `${ageInHours} hour${ageInHours !== 1 ? 's' : ''}`
    }

    log.info(`Current pricing file age: ${ageString}`)

    try {
      const data = JSON.parse(fs.readFileSync(config.pricingFile, 'utf8'))
      log.info(`Current file contains ${Object.keys(data).length} models`)
    } catch (error) {
      log.warn('Current file exists but could not be parsed')
    }
  } else {
    log.info('No existing pricing file found')
  }
}

// 主函数
async function main() {
  console.log(`${colors.bright}${colors.blue}======================================${colors.reset}`)
  console.log(`${colors.bright}  Model Pricing Update Tool${colors.reset}`)
  console.log(
    `${colors.bright}${colors.blue}======================================${colors.reset}\n`
  )

  // 显示当前状态
  showCurrentStatus()
  console.log('')

  // 确保数据目录存在
  ensureDataDir()

  // 备份现有文件
  const hasBackup = backupExistingFile()

  try {
    // 尝试下载最新数据
    await downloadPricingData()

    // 清理备份文件（成功下载后）
    if (hasBackup && fs.existsSync(config.backupFile)) {
      fs.unlinkSync(config.backupFile)
      log.info('Cleaned up backup file')
    }

    console.log(`\n${colors.green}✅ Model pricing updated successfully!${colors.reset}`)
    process.exit(0)
  } catch (error) {
    log.error(`Download failed: ${error.message}`)

    // 尝试恢复备份
    if (hasBackup) {
      if (restoreBackup()) {
        log.info('Original file restored')
      }
    }

    // 尝试使用 fallback
    if (useFallback()) {
      console.log(
        `\n${colors.yellow}⚠️  Using fallback data (update completed with warnings)${colors.reset}`
      )
      process.exit(0)
    } else {
      console.log(`\n${colors.red}❌ Failed to update model pricing${colors.reset}`)
      process.exit(1)
    }
  }
}

// 处理未捕获的错误
process.on('unhandledRejection', (error) => {
  log.error(`Unhandled error: ${error.message}`)
  process.exit(1)
})

// 运行主函数
main().catch((error) => {
  log.error(`Fatal error: ${error.message}`)
  process.exit(1)
})
