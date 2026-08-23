// ============================================================================
// 账户 CRUD（Claude / Droid / OpenAI 三平台；从 src/models/redis.js 按域抽出）
// 经 attach(redisClient) 挂到同一个 RedisClient 单例上，this 绑定与原文件一致。
// 其余平台账户存取在各自 *AccountService.js 中直接用通用 redis 方法，不在此处。
// ============================================================================
const { RedisKeys } = require('../../constants/redisKeys')

function attach(redisClient) {
  // 🏢 Claude 账户管理
  redisClient.setClaudeAccount = async function (accountId, accountData) {
    const key = RedisKeys.accounts.claude(accountId)
    await this.client.hset(key, accountData)
    await this.client.sadd(RedisKeys.accounts.claudeIndex, accountId)
    await this.client.del(RedisKeys.emptyMarker(RedisKeys.accounts.claudeIndex))
  }

  redisClient.getClaudeAccount = async function (accountId) {
    const key = RedisKeys.accounts.claude(accountId)
    return await this.client.hgetall(key)
  }

  redisClient.getAllClaudeAccounts = async function () {
    const accountIds = await this.getAllIdsByIndex(
      RedisKeys.accounts.claudeIndex,
      RedisKeys.accounts.claudePattern,
      /^claude:account:(.+)$/
    )
    if (accountIds.length === 0) {
      return []
    }

    const keys = accountIds.map((id) => RedisKeys.accounts.claude(id))
    const pipeline = this.client.pipeline()
    keys.forEach((key) => pipeline.hgetall(key))
    const results = await pipeline.exec()

    const accounts = []
    results.forEach(([err, accountData], index) => {
      if (!err && accountData && Object.keys(accountData).length > 0) {
        accounts.push({ id: accountIds[index], ...accountData })
      }
    })
    return accounts
  }

  redisClient.deleteClaudeAccount = async function (accountId) {
    const key = RedisKeys.accounts.claude(accountId)
    await this.client.srem(RedisKeys.accounts.claudeIndex, accountId)
    return await this.client.del(key)
  }

  // 🤖 Droid 账户相关操作
  redisClient.setDroidAccount = async function (accountId, accountData) {
    const key = RedisKeys.accounts.droid(accountId)
    await this.client.hset(key, accountData)
    await this.client.sadd(RedisKeys.accounts.droidIndex, accountId)
    await this.client.del(RedisKeys.emptyMarker(RedisKeys.accounts.droidIndex))
  }

  redisClient.getDroidAccount = async function (accountId) {
    const key = RedisKeys.accounts.droid(accountId)
    return await this.client.hgetall(key)
  }

  redisClient.getAllDroidAccounts = async function () {
    const accountIds = await this.getAllIdsByIndex(
      RedisKeys.accounts.droidIndex,
      RedisKeys.accounts.droidPattern,
      /^droid:account:(.+)$/
    )
    if (accountIds.length === 0) {
      return []
    }

    const keys = accountIds.map((id) => RedisKeys.accounts.droid(id))
    const pipeline = this.client.pipeline()
    keys.forEach((key) => pipeline.hgetall(key))
    const results = await pipeline.exec()

    const accounts = []
    results.forEach(([err, accountData], index) => {
      if (!err && accountData && Object.keys(accountData).length > 0) {
        accounts.push({ id: accountIds[index], ...accountData })
      }
    })
    return accounts
  }

  redisClient.deleteDroidAccount = async function (accountId) {
    const key = RedisKeys.accounts.droid(accountId)
    // 从索引中移除
    await this.client.srem(RedisKeys.accounts.droidIndex, accountId)
    return await this.client.del(key)
  }

  redisClient.setOpenAiAccount = async function (accountId, accountData) {
    const key = RedisKeys.accounts.openai(accountId)
    await this.client.hset(key, accountData)
    await this.client.sadd(RedisKeys.accounts.openaiIndex, accountId)
    await this.client.del(RedisKeys.emptyMarker(RedisKeys.accounts.openaiIndex))
  }
  redisClient.getOpenAiAccount = async function (accountId) {
    const key = RedisKeys.accounts.openai(accountId)
    return await this.client.hgetall(key)
  }
  redisClient.deleteOpenAiAccount = async function (accountId) {
    const key = RedisKeys.accounts.openai(accountId)
    await this.client.srem(RedisKeys.accounts.openaiIndex, accountId)
    return await this.client.del(key)
  }

  redisClient.getAllOpenAIAccounts = async function () {
    const accountIds = await this.getAllIdsByIndex(
      RedisKeys.accounts.openaiIndex,
      RedisKeys.accounts.openaiPattern,
      /^openai:account:(.+)$/
    )
    if (accountIds.length === 0) {
      return []
    }

    const keys = accountIds.map((id) => RedisKeys.accounts.openai(id))
    const pipeline = this.client.pipeline()
    keys.forEach((key) => pipeline.hgetall(key))
    const results = await pipeline.exec()

    const accounts = []
    results.forEach(([err, accountData], index) => {
      if (!err && accountData && Object.keys(accountData).length > 0) {
        accounts.push({ id: accountIds[index], ...accountData })
      }
    })
    return accounts
  }
}

module.exports = { attach }
