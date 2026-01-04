/**
 * 性能优化工具模块
 * 提供 HTTP keep-alive 连接池、定价数据缓存等优化功能
 */

const https = require('https')
const http = require('http')
const fs = require('fs')
const LRUCache = require('./lruCache')

// 连接池配置（从环境变量读取）
const STREAM_MAX_SOCKETS = parseInt(process.env.HTTPS_MAX_SOCKETS_STREAM) || 65535
const NON_STREAM_MAX_SOCKETS = parseInt(process.env.HTTPS_MAX_SOCKETS_NON_STREAM) || 16384
const MAX_FREE_SOCKETS = parseInt(process.env.HTTPS_MAX_FREE_SOCKETS) || 2048
const FREE_SOCKET_TIMEOUT = parseInt(process.env.HTTPS_FREE_SOCKET_TIMEOUT) || 30000

// 流式请求 agent：高 maxSockets，timeout=0（不限制）
const httpsAgentStream = new https.Agent({
  keepAlive: true,
  maxSockets: STREAM_MAX_SOCKETS,
  maxFreeSockets: MAX_FREE_SOCKETS,
  timeout: 0,
  freeSocketTimeout: FREE_SOCKET_TIMEOUT
})

// 非流式请求 agent：较小 maxSockets
const httpsAgentNonStream = new https.Agent({
  keepAlive: true,
  maxSockets: NON_STREAM_MAX_SOCKETS,
  maxFreeSockets: MAX_FREE_SOCKETS,
  timeout: 0, // 不限制，由请求层 REQUEST_TIMEOUT 控制
  freeSocketTimeout: FREE_SOCKET_TIMEOUT
})

// HTTP agent（非流式）
const httpAgent = new http.Agent({
  keepAlive: true,
  maxSockets: NON_STREAM_MAX_SOCKETS,
  maxFreeSockets: MAX_FREE_SOCKETS,
  timeout: 0, // 不限制，由请求层 REQUEST_TIMEOUT 控制
  freeSocketTimeout: FREE_SOCKET_TIMEOUT
})

// 定价数据缓存（按文件路径区分）
const pricingDataCache = new Map()
const PRICING_CACHE_TTL = 5 * 60 * 1000 // 5分钟

// Redis 配置缓存（短 TTL）
const configCache = new LRUCache(100)
const CONFIG_CACHE_TTL = 30 * 1000 // 30秒

/**
 * 获取流式请求的 HTTPS agent
 */
function getHttpsAgentForStream() {
  return httpsAgentStream
}

/**
 * 获取非流式请求的 HTTPS agent
 */
function getHttpsAgentForNonStream() {
  return httpsAgentNonStream
}

/**
 * 获取定价数据（带缓存，按路径区分）
 * @param {string} pricingFilePath - 定价文件路径
 * @returns {Object|null} 定价数据
 */
function getPricingData(pricingFilePath) {
  const now = Date.now()
  const cached = pricingDataCache.get(pricingFilePath)

  // 检查缓存是否有效
  if (cached && now - cached.loadTime < PRICING_CACHE_TTL) {
    return cached.data
  }

  // 重新加载
  try {
    if (!fs.existsSync(pricingFilePath)) {
      return null
    }
    const data = JSON.parse(fs.readFileSync(pricingFilePath, 'utf8'))
    pricingDataCache.set(pricingFilePath, { data, loadTime: now })
    return data
  } catch (error) {
    return null
  }
}

/**
 * 清除定价数据缓存（用于热更新）
 * @param {string} pricingFilePath - 可选，指定路径则只清除该路径缓存
 */
function clearPricingCache(pricingFilePath = null) {
  if (pricingFilePath) {
    pricingDataCache.delete(pricingFilePath)
  } else {
    pricingDataCache.clear()
  }
}

/**
 * 获取缓存的配置
 * @param {string} key - 缓存键
 * @returns {*} 缓存值
 */
function getCachedConfig(key) {
  return configCache.get(key)
}

/**
 * 设置配置缓存
 * @param {string} key - 缓存键
 * @param {*} value - 值
 * @param {number} ttl - TTL（毫秒）
 */
function setCachedConfig(key, value, ttl = CONFIG_CACHE_TTL) {
  configCache.set(key, value, ttl)
}

/**
 * 删除配置缓存
 * @param {string} key - 缓存键
 */
function deleteCachedConfig(key) {
  configCache.cache.delete(key)
}

/**
 * 获取连接池统计信息
 */
function getAgentStats() {
  return {
    httpsStream: {
      sockets: Object.keys(httpsAgentStream.sockets).length,
      freeSockets: Object.keys(httpsAgentStream.freeSockets).length,
      requests: Object.keys(httpsAgentStream.requests).length,
      maxSockets: STREAM_MAX_SOCKETS
    },
    httpsNonStream: {
      sockets: Object.keys(httpsAgentNonStream.sockets).length,
      freeSockets: Object.keys(httpsAgentNonStream.freeSockets).length,
      requests: Object.keys(httpsAgentNonStream.requests).length,
      maxSockets: NON_STREAM_MAX_SOCKETS
    },
    http: {
      sockets: Object.keys(httpAgent.sockets).length,
      freeSockets: Object.keys(httpAgent.freeSockets).length,
      requests: Object.keys(httpAgent.requests).length
    },
    configCache: configCache.getStats()
  }
}

module.exports = {
  getHttpsAgentForStream,
  getHttpsAgentForNonStream,
  getHttpAgent: () => httpAgent,
  getPricingData,
  clearPricingCache,
  getCachedConfig,
  setCachedConfig,
  deleteCachedConfig,
  getAgentStats
}
