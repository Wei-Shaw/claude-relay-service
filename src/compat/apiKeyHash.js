// 兼容层:API Key 哈希索引的新旧双结构兼容
//
// 来源:src/models/redis.js(findApiKeyByHash/setApiKeyHash/deleteApiKeyHash 内部逻辑,逐字搬迁)
// 收拢日期:2026-06-03
// 原始语义:认证用新结构 apikey:hash_map(hash -> keyId);历史遗留旧结构 apikey_hash:{hash}(Hash)。
//   - resolveKeyIdByHash:读 hash_map,miss 时回退旧结构并回填(认证热路径)
//   - writeApiKeyHashDual:创建/更新时双写新旧结构
//   - deleteApiKeyHashDual:删除/轮换时双删,避免旧 Key 失效后回退命中
//   旧结构的全量回填另由 apiKeyIndexService.rebuildHashMap() 每次启动兜底(自愈)。
// 下线条件:确认 Redis 中旧结构 apikey_hash:* 已全部清退、hash_map 完整后,
//   可移除旧结构回退/双写/双删,仅保留 hash_map。

const { RedisKeys } = require('../constants/redisKeys')

// 读 hash -> keyId:新表 miss 时回退旧结构 apikey_hash:* 并回填(返回 keyId 或 null/空)
const resolveKeyIdByHash = async (client, hashedKey) => {
  // 使用反向映射表：hash -> keyId
  let keyId = await client.hget(RedisKeys.apiKey.hashMap, hashedKey)

  // 回退：查旧结构 apikey_hash:*（启动回填未完成时兼容）
  if (!keyId) {
    const oldData = await client.hgetall(RedisKeys.apiKey.hashLegacy(hashedKey))
    if (oldData && oldData.id) {
      keyId = oldData.id
      // 回填到 hash_map
      await client.hset(RedisKeys.apiKey.hashMap, hashedKey, keyId)
    }
  }

  return keyId
}

// 双写:旧结构 apikey_hash:{hash}(可选 ttl)+ 新结构 hash_map
const writeApiKeyHashDual = async (client, hashedKey, keyData, ttl = 0) => {
  // 写入旧结构（兼容）
  const key = RedisKeys.apiKey.hashLegacy(hashedKey)
  await client.hset(key, keyData)
  if (ttl > 0) {
    await client.expire(key, ttl)
  }
  // 同时写入新结构 hash_map（认证使用此结构）
  if (keyData.id) {
    await client.hset(RedisKeys.apiKey.hashMap, hashedKey, keyData.id)
  }
}

// 双删:旧结构 + 新结构 hash_map
const deleteApiKeyHashDual = async (client, hashedKey) => {
  // 同时清理旧结构和新结构，确保 Key 轮换/删除后旧 Key 失效
  const oldKey = RedisKeys.apiKey.hashLegacy(hashedKey)
  await client.del(oldKey)
  // 从新的 hash_map 中移除（认证使用此结构）
  await client.hdel(RedisKeys.apiKey.hashMap, hashedKey)
}

module.exports = { resolveKeyIdByHash, writeApiKeyHashDual, deleteApiKeyHashDual }
