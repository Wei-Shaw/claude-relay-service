// ============================================================================
// 会话 / OAuth / 会话-账户映射（从 src/models/redis.js 按域抽出）
// 经 attach(redisClient) 挂到同一个 RedisClient 单例上，this 绑定与原文件一致。
// ============================================================================
const logger = require('../../utils/logger')
const { RedisKeys, TTL } = require('../../constants/redisKeys')
const { writeApiKeyHashDual, deleteApiKeyHashDual } = require('../../compat/apiKeyHash')

function attach(redisClient) {
  // 🔐 会话管理（用于管理员登录等）
  redisClient.setSession = async function (sessionId, sessionData, ttl = TTL.adminSession) {
    const key = RedisKeys.session.admin(sessionId)
    await this.client.hset(key, sessionData)
    await this.client.expire(key, ttl)
  }

  redisClient.getSession = async function (sessionId) {
    const key = RedisKeys.session.admin(sessionId)
    return await this.client.hgetall(key)
  }

  redisClient.deleteSession = async function (sessionId) {
    const key = RedisKeys.session.admin(sessionId)
    return await this.client.del(key)
  }

  // 🗝️ API Key哈希索引管理（兼容旧结构 apikey_hash:* 和新结构 apikey:hash_map）
  redisClient.setApiKeyHash = async function (hashedKey, keyData, ttl = 0) {
    await writeApiKeyHashDual(this.client, hashedKey, keyData, ttl)
  }

  redisClient.getApiKeyHash = async function (hashedKey) {
    const key = RedisKeys.apiKey.hashLegacy(hashedKey)
    return await this.client.hgetall(key)
  }

  redisClient.deleteApiKeyHash = async function (hashedKey) {
    await deleteApiKeyHashDual(this.client, hashedKey)
  }

  // 🔗 OAuth会话管理
  redisClient.setOAuthSession = async function (sessionId, sessionData, ttl = TTL.oauthSession) {
    // 10分钟过期
    const key = RedisKeys.session.oauth(sessionId)

    // 序列化复杂对象，特别是 proxy 配置
    const serializedData = {}
    for (const [dataKey, value] of Object.entries(sessionData)) {
      if (typeof value === 'object' && value !== null) {
        serializedData[dataKey] = JSON.stringify(value)
      } else {
        serializedData[dataKey] = value
      }
    }

    await this.client.hset(key, serializedData)
    await this.client.expire(key, ttl)
  }

  redisClient.getOAuthSession = async function (sessionId) {
    const key = RedisKeys.session.oauth(sessionId)
    const data = await this.client.hgetall(key)

    // hgetall 在 key 不存在或已过期时返回空对象 {}，调用方的 if (!session) 检查无法识别
    // 这里显式返回 null，避免过期会话绕过检查后在后续逻辑中崩溃
    if (!data || Object.keys(data).length === 0) {
      return null
    }

    // 反序列化 proxy 字段
    if (data.proxy) {
      try {
        data.proxy = JSON.parse(data.proxy)
      } catch (error) {
        // 如果解析失败，设置为 null
        data.proxy = null
      }
    }

    // 归一化布尔字段，避免 Redis hash 里的字符串 "false" 被当成 truthy
    if (data.proxyBound !== undefined) {
      data.proxyBound = data.proxyBound === true || data.proxyBound === 'true'
    }

    return data
  }

  redisClient.deleteOAuthSession = async function (sessionId) {
    const key = RedisKeys.session.oauth(sessionId)
    return await this.client.del(key)
  }

  // 🔗 会话sticky映射管理
  redisClient.setSessionAccountMapping = async function (sessionHash, accountId, ttl = null) {
    // 从配置读取TTL（小时），转换为秒，默认1小时
    const defaultTTL = ttl !== null ? ttl : TTL.stickySession()
    const key = RedisKeys.session.sticky(sessionHash)
    await this.client.set(key, accountId, 'EX', defaultTTL)
  }

  redisClient.getSessionAccountMapping = async function (sessionHash) {
    const key = RedisKeys.session.sticky(sessionHash)
    return await this.client.get(key)
  }

  // 🚀 智能会话TTL续期：剩余时间少于阈值时自动续期
  redisClient.extendSessionAccountMappingTTL = async function (sessionHash) {
    const appConfig = require('../../../config/config')
    const key = RedisKeys.session.sticky(sessionHash)

    // 📊 从配置获取参数（config.js 单一权威源，必已定义，不做业务层默认回退）
    const ttlHours = appConfig.session.stickyTtlHours // 小时
    const thresholdMinutes = appConfig.session.renewalThresholdMinutes // 分钟（0 表示不续期）

    // 如果阈值为0，不执行续期
    if (thresholdMinutes === 0) {
      return true
    }

    const fullTTL = TTL.stickySession() // 转换为秒
    const renewalThreshold = thresholdMinutes * 60 // 转换为秒

    try {
      // 获取当前剩余TTL（秒）
      const remainingTTL = await this.client.ttl(key)

      // 键不存在或已过期
      if (remainingTTL === -2) {
        return false
      }

      // 键存在但没有TTL（永不过期，不需要处理）
      if (remainingTTL === -1) {
        return true
      }

      // 🎯 智能续期策略：仅在剩余时间少于阈值时才续期
      if (remainingTTL < renewalThreshold) {
        await this.client.expire(key, fullTTL)
        logger.debug(
          `🔄 Renewed sticky session TTL: ${sessionHash} (was ${Math.round(
            remainingTTL / 60
          )}min, renewed to ${ttlHours}h)`
        )
        return true
      }

      // 剩余时间充足，无需续期
      logger.debug(
        `✅ Sticky session TTL sufficient: ${sessionHash} (remaining ${Math.round(
          remainingTTL / 60
        )}min)`
      )
      return true
    } catch (error) {
      logger.error('❌ Failed to extend session TTL:', error)
      return false
    }
  }

  redisClient.deleteSessionAccountMapping = async function (sessionHash) {
    const key = RedisKeys.session.sticky(sessionHash)
    return await this.client.del(key)
  }
}

module.exports = { attach }
