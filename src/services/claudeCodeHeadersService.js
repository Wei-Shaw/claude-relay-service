/**
 * Claude Code Headers 管理服务
 * 负责存储和管理不同账号使用的 Claude Code headers
 */

const redis = require('../models/redis')
const logger = require('../utils/logger')
const {
  getCachedConfig,
  setCachedConfig,
  deleteCachedConfig
} = require('../utils/performanceOptimizer')

class ClaudeCodeHeadersService {
  constructor() {
    this.defaultHeaders = {
      'x-stainless-retry-count': '0',
      'x-stainless-timeout': '60',
      'x-stainless-lang': 'js',
      'x-stainless-package-version': '0.55.1',
      'x-stainless-os': 'Windows',
      'x-stainless-arch': 'x64',
      'x-stainless-runtime': 'node',
      'x-stainless-runtime-version': 'v20.19.2',
      'anthropic-dangerous-direct-browser-access': 'true',
      'x-app': 'cli',
      'user-agent': 'claude-cli/1.0.57 (external, cli)',
      'accept-language': '*',
      'sec-fetch-mode': 'cors'
    }

    // 需要捕获的 Claude Code 特定 headers
    this.claudeCodeHeaderKeys = [
      'x-stainless-retry-count',
      'x-stainless-timeout',
      'x-stainless-lang',
      'x-stainless-package-version',
      'x-stainless-os',
      'x-stainless-arch',
      'x-stainless-runtime',
      'x-stainless-runtime-version',
      'anthropic-dangerous-direct-browser-access',
      'x-app',
      'user-agent',
      'accept-language',
      'sec-fetch-mode',
      'accept-encoding'
    ]

    // Headers 缓存 TTL（60秒）
    this.headersCacheTtl = 60000
  }

  /**
   * 从 user-agent 中提取版本号
   */
  extractVersionFromUserAgent(userAgent) {
    if (!userAgent) {
      return null
    }
    const match = userAgent.match(/claude-cli\/([\d.]+(?:[a-zA-Z0-9-]*)?)/i)
    return match ? match[1] : null
  }

  /**
   * 比较版本号
   * @returns {number} 1 if v1 > v2, -1 if v1 < v2, 0 if equal
   */
  compareVersions(v1, v2) {
    if (!v1 || !v2) {
      return 0
    }

    const parts1 = v1.split('.').map(Number)
    const parts2 = v2.split('.').map(Number)

    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const p1 = parts1[i] || 0
      const p2 = parts2[i] || 0

      if (p1 > p2) {
        return 1
      }
      if (p1 < p2) {
        return -1
      }
    }

    return 0
  }

  /**
   * 从客户端 headers 中提取 Claude Code 相关的 headers
   */
  extractClaudeCodeHeaders(clientHeaders) {
    const headers = {}

    // 转换所有 header keys 为小写进行比较
    const lowerCaseHeaders = {}
    Object.keys(clientHeaders || {}).forEach((key) => {
      lowerCaseHeaders[key.toLowerCase()] = clientHeaders[key]
    })

    // 提取需要的 headers
    this.claudeCodeHeaderKeys.forEach((key) => {
      const lowerKey = key.toLowerCase()
      if (lowerCaseHeaders[lowerKey]) {
        headers[key] = lowerCaseHeaders[lowerKey]
      }
    })

    return headers
  }

  /**
   * 存储账号的 Claude Code headers
   */
  async storeAccountHeaders(accountId, clientHeaders) {
    try {
      const extractedHeaders = this.extractClaudeCodeHeaders(clientHeaders)

      // 检查是否有 user-agent
      const userAgent = extractedHeaders['user-agent']
      if (!userAgent || !/^claude-cli\/[\d.]+\s+\(/i.test(userAgent)) {
        // 不是 Claude Code 的请求，不存储
        return
      }

      const version = this.extractVersionFromUserAgent(userAgent)
      if (!version) {
        logger.warn(`⚠️ Failed to extract version from user-agent: ${userAgent}`)
        return
      }

      // 获取当前存储的 headers
      const key = `claude_code_headers:${accountId}`
      const currentData = await redis.getClient().get(key)

      if (currentData) {
        const current = JSON.parse(currentData)
        const currentVersion = this.extractVersionFromUserAgent(current.headers['user-agent'])

        // 只有新版本更高时才更新
        if (this.compareVersions(version, currentVersion) <= 0) {
          return
        }
      }

      // 存储新的 headers
      const data = {
        headers: extractedHeaders,
        version,
        updatedAt: new Date().toISOString()
      }

      await redis.getClient().setex(key, 86400 * 7, JSON.stringify(data)) // 7天过期

      // 更新内存缓存，避免延迟
      setCachedConfig(key, extractedHeaders, this.headersCacheTtl)

      logger.info(`✅ Stored Claude Code headers for account ${accountId}, version: ${version}`)
    } catch (error) {
      logger.error(`❌ Failed to store Claude Code headers for account ${accountId}:`, error)
    }
  }

  /**
   * 获取账号的 Claude Code headers（带内存缓存）
   */
  async getAccountHeaders(accountId) {
    const cacheKey = `claude_code_headers:${accountId}`

    // 检查内存缓存
    const cached = getCachedConfig(cacheKey)
    if (cached) {
      return cached
    }

    try {
      const data = await redis.getClient().get(cacheKey)

      if (data) {
        const parsed = JSON.parse(data)
        logger.debug(
          `📋 Retrieved Claude Code headers for account ${accountId}, version: ${parsed.version}`
        )
        // 缓存到内存
        setCachedConfig(cacheKey, parsed.headers, this.headersCacheTtl)
        return parsed.headers
      }

      // 返回默认 headers
      logger.debug(`📋 Using default Claude Code headers for account ${accountId}`)
      return this.defaultHeaders
    } catch (error) {
      logger.error(`❌ Failed to get Claude Code headers for account ${accountId}:`, error)
      return this.defaultHeaders
    }
  }

  /**
   * 清除账号的 Claude Code headers
   */
  async clearAccountHeaders(accountId) {
    try {
      const cacheKey = `claude_code_headers:${accountId}`
      await redis.getClient().del(cacheKey)
      // 删除内存缓存
      deleteCachedConfig(cacheKey)
      logger.info(`🗑️ Cleared Claude Code headers for account ${accountId}`)
    } catch (error) {
      logger.error(`❌ Failed to clear Claude Code headers for account ${accountId}:`, error)
    }
  }

  /**
   * 获取所有账号的 headers 信息（使用 scanKeys 替代 keys）
   */
  async getAllAccountHeaders() {
    try {
      const pattern = 'claude_code_headers:*'
      const keys = await redis.scanKeys(pattern)

      const results = {}
      for (const key of keys) {
        const accountId = key.replace('claude_code_headers:', '')
        const data = await redis.getClient().get(key)
        if (data) {
          results[accountId] = JSON.parse(data)
        }
      }

      return results
    } catch (error) {
      logger.error('❌ Failed to get all account headers:', error)
      return {}
    }
  }
}

module.exports = new ClaudeCodeHeadersService()
