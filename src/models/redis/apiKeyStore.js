// ============================================================================
// API Key CRUD / 标签 / 分页查询 / hash 反查（从 src/models/redis.js 按域抽出）
// 经 attach(redisClient) 挂到同一个 RedisClient 单例上，this 绑定与原文件一致。
// 跨域 this 调用(scanKeys/batchHgetallChunked/getKeyIdsWithModels 等)经同一单例解析。
// 注：方法内 require('../../services/...') 路径已按新目录层级调整（+1 级 ../）。
// ============================================================================
const logger = require('../../utils/logger')
const { RedisKeys, TTL } = require('../../constants/redisKeys')
const { resolveKeyIdByHash } = require('../../compat/apiKeyHash')

function attach(redisClient) {
  // 🔑 API Key 相关操作
  redisClient.setApiKey = async function (keyId, keyData, hashedKey = null) {
    const key = RedisKeys.apiKey.byId(keyId)
    const client = this.getClientSafe()

    // 维护哈希映射表（用于快速查找）
    // hashedKey参数是实际的哈希值，用于建立映射
    if (hashedKey) {
      await client.hset(RedisKeys.apiKey.hashMap, hashedKey, keyId)
    }

    await client.hset(key, keyData)
    await client.expire(key, TTL.apiKeyData) // 1年过期
  }

  // hash + LAST_USED_AT 排序索引并入同一 MULTI 写（分数取自 keyData.lastUsedAt）。
  // 用于"更新 lastUsedAt"的写路径：避免"先 setApiKey 再 best-effort 更新排序索引"在后者失败时，
  // hash 与排序索引长期不一致（queryWithIndex 信任排序索引、不再按 hash 重排，会导致顺序长期错乱）。
  // 注意 MULTI 非回滚:运行期错误(WRONGTYPE/OOM)仍可能部分提交,逐条校验结果发现错误即抛出(surface,不当成功)。
  redisClient.setApiKeyWithLastUsedIndex = async function (keyId, keyData) {
    const key = RedisKeys.apiKey.byId(keyId)
    const client = this.getClientSafe()
    const ts = keyData.lastUsedAt ? new Date(keyData.lastUsedAt).getTime() : 0
    const multi = client.multi()
    multi.hset(key, keyData)
    multi.expire(key, TTL.apiKeyData)
    multi.zadd(RedisKeys.apiKey.idx.lastUsedAt, ts, keyId)
    const results = await multi.exec()
    if (!results) {
      throw new Error('Redis MULTI 事务未执行（EXEC 返回空）')
    }
    for (const [err] of results) {
      if (err) {
        throw err
      }
    }
  }

  redisClient.getApiKey = async function (keyId) {
    const key = RedisKeys.apiKey.byId(keyId)
    return await this.client.hgetall(key)
  }

  redisClient.deleteApiKey = async function (keyId) {
    const key = RedisKeys.apiKey.byId(keyId)

    // 获取要删除的API Key哈希值，以便从映射表中移除
    const keyData = await this.client.hgetall(key)
    if (keyData && keyData.apiKey) {
      // keyData.apiKey现在存储的是哈希值，直接从映射表删除
      await this.client.hdel(RedisKeys.apiKey.hashMap, keyData.apiKey)
    }

    return await this.client.del(key)
  }

  redisClient.getAllApiKeys = async function () {
    const keys = await this.scanKeys(RedisKeys.apiKey.allPattern)
    const apiKeys = []
    const dataList = await this.batchHgetallChunked(keys)

    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]
      // 过滤掉hash_map，它不是真正的API Key
      if (key === RedisKeys.apiKey.hashMap) {
        continue
      }

      const keyData = dataList[i]
      if (keyData && Object.keys(keyData).length > 0) {
        apiKeys.push({ id: key.replace('apikey:', ''), ...keyData })
      }
    }
    return apiKeys
  }

  redisClient.scanApiKeyIds = async function () {
    const keyIds = new Set()
    let cursor = '0'
    // 排除索引 key 的前缀
    const excludePrefixes = [
      RedisKeys.apiKey.hashMap,
      'apikey:idx:',
      'apikey:set:',
      'apikey:tags:',
      'apikey:index:'
    ]

    do {
      const [newCursor, keys] = await this.client.scan(
        cursor,
        'MATCH',
        RedisKeys.apiKey.allPattern,
        'COUNT',
        100
      )
      cursor = newCursor

      for (const key of keys) {
        // 只接受 apikey:<uuid> 形态，排除索引 key
        if (excludePrefixes.some((prefix) => key.startsWith(prefix))) {
          continue
        }
        // 确保是 apikey:<id> 格式（只有一个冒号）
        if (key.split(':').length !== 2) {
          continue
        }
        keyIds.add(key.replace('apikey:', ''))
      }
    } while (cursor !== '0')

    return [...keyIds]
  }

  // 从全局标签集合（tags:all，由 key 派生维护 + rebuild 重造）删除标签——用于删除/重命名时清理旧标签的派生残留。
  // 注：tags:all 由 addToIndex/updateIndex 随 key 写入，没有独立 addTag 入口；手工创建标签走 addManualTag。
  redisClient.removeTag = async function (tagName) {
    await this.client.srem(RedisKeys.apiKey.tagsAll, tagName)
  }

  // 手工创建的标签集合（apikey:tags:manual）：createTag 登记，不随 key 派生、rebuild 不重建，
  // 故 0 引用也持久存在——以此与"死标签"区分（死标签是 key 派生、引用归零即应消失）。
  redisClient.addManualTag = async function (tagName) {
    await this.client.sadd(RedisKeys.apiKey.tagsManual, tagName)
  }

  redisClient.removeManualTag = async function (tagName) {
    await this.client.srem(RedisKeys.apiKey.tagsManual, tagName)
  }

  redisClient.getManualTags = async function () {
    return await this.client.smembers(RedisKeys.apiKey.tagsManual)
  }

  redisClient.scanAllApiKeyTags = async function () {
    const isIndexReady = await this._checkIndexReady()

    if (isIndexReady) {
      const indexedKeyIds = await this.client.smembers(RedisKeys.apiKey.idx.all)
      if (indexedKeyIds && indexedKeyIds.length > 0) {
        return this._extractTagsFromKeyIds(indexedKeyIds)
      }
    }

    // 方案3：回退到 SCAN（索引未就绪或重建中）
    return this._scanTagsFallback()
  }

  redisClient._checkIndexReady = async function () {
    try {
      const version = await this.client.get(RedisKeys.apiKey.indexVersion)
      // 必须与 apiKeyIndexService.CURRENT_VERSION 保持一致（升级版本时两处都要改）。
      // 否则旧版本(v2/v3)会被当成"已就绪"而直接信任可能含死标签的缓存 apikey:tags:all，
      // 绕过"回退按 hash 真相过滤已删 key"的路径——历史漂移就读不干净了。
      return parseInt(version) >= 4
    } catch {
      return false
    }
  }

  redisClient._extractTagsFromKeyIds = async function (keyIds) {
    const tagSet = new Set()
    const pipeline = this.client.pipeline()
    for (const keyId of keyIds) {
      pipeline.hmget(RedisKeys.apiKey.byId(keyId), 'tags', 'isDeleted')
    }

    const results = await pipeline.exec()
    if (!results) {
      return []
    }

    for (const result of results) {
      if (!result) {
        continue
      }
      const [err, values] = result
      if (err || !values) {
        continue
      }
      const [tags, isDeleted] = values
      if (isDeleted === 'true' || !tags) {
        continue
      }

      try {
        const parsed = JSON.parse(tags)
        if (Array.isArray(parsed)) {
          for (const tag of parsed) {
            if (tag && typeof tag === 'string' && tag.trim()) {
              tagSet.add(tag.trim())
            }
          }
        }
      } catch {
        // 忽略解析错误
      }
    }
    return Array.from(tagSet).sort()
  }

  redisClient._scanTagsFallback = async function () {
    const tagSet = new Set()
    let cursor = '0'

    do {
      const [newCursor, keys] = await this.client.scan(
        cursor,
        'MATCH',
        RedisKeys.apiKey.allPattern,
        'COUNT',
        100
      )
      cursor = newCursor

      const validKeys = keys.filter(
        (k) => k !== RedisKeys.apiKey.hashMap && k.split(':').length === 2
      )
      if (validKeys.length === 0) {
        continue
      }

      const pipeline = this.client.pipeline()
      for (const key of validKeys) {
        pipeline.hmget(key, 'tags', 'isDeleted')
      }

      const results = await pipeline.exec()
      if (!results) {
        continue
      }

      for (const result of results) {
        if (!result) {
          continue
        }
        const [err, values] = result
        if (err || !values) {
          continue
        }
        const [tags, isDeleted] = values
        if (isDeleted === 'true' || !tags) {
          continue
        }

        try {
          const parsed = JSON.parse(tags)
          if (Array.isArray(parsed)) {
            for (const tag of parsed) {
              if (tag && typeof tag === 'string' && tag.trim()) {
                tagSet.add(tag.trim())
              }
            }
          }
        } catch {
          // 忽略解析错误
        }
      }
    } while (cursor !== '0')

    return Array.from(tagSet).sort()
  }

  redisClient.batchGetApiKeys = async function (keyIds) {
    if (!keyIds || keyIds.length === 0) {
      return []
    }

    const pipeline = this.client.pipeline()
    for (const keyId of keyIds) {
      pipeline.hgetall(RedisKeys.apiKey.byId(keyId))
    }

    const results = await pipeline.exec()
    const apiKeys = []

    for (let i = 0; i < results.length; i++) {
      const [err, data] = results[i]
      if (!err && data && Object.keys(data).length > 0) {
        apiKeys.push({ id: keyIds[i], ...this._parseApiKeyData(data) })
      }
    }

    return apiKeys
  }

  redisClient._parseApiKeyData = function (data) {
    if (!data) {
      return data
    }

    const parsed = { ...data }

    // 布尔字段
    const boolFields = [
      'isActive',
      'enableModelRestriction',
      'enableClientRestriction',
      'enableOpenAIResponsesCodexAdaptation',
      'enableOpenAIResponsesPayloadRules',
      'isDeleted'
    ]
    for (const field of boolFields) {
      if (parsed[field] !== undefined) {
        parsed[field] = parsed[field] === 'true'
      }
    }

    if (parsed.enableOpenAIResponsesCodexAdaptation === undefined) {
      parsed.enableOpenAIResponsesCodexAdaptation = true
    }
    if (parsed.enableOpenAIResponsesPayloadRules === undefined) {
      parsed.enableOpenAIResponsesPayloadRules = false
    }

    // 数字字段
    const numFields = [
      'tokenLimit',
      'dailyCostLimit',
      'totalCostLimit',
      'rateLimitRequests',
      'rateLimitTokens',
      'rateLimitWindow',
      'rateLimitCost',
      'maxConcurrency',
      'activationDuration'
    ]
    for (const field of numFields) {
      if (parsed[field] !== undefined && parsed[field] !== '') {
        parsed[field] = parseFloat(parsed[field]) || 0
      }
    }

    // 数组字段（JSON 解析）
    const arrayFields = [
      'tags',
      'restrictedModels',
      'allowedClients',
      'openaiResponsesPayloadRules'
    ]
    for (const field of arrayFields) {
      if (parsed[field]) {
        try {
          parsed[field] = JSON.parse(parsed[field])
        } catch (e) {
          parsed[field] = []
        }
      }
    }

    if (!Array.isArray(parsed.openaiResponsesPayloadRules)) {
      parsed.openaiResponsesPayloadRules = []
    }

    // 对象字段（JSON 解析）
    const objectFields = ['serviceRates']
    for (const field of objectFields) {
      if (parsed[field]) {
        try {
          parsed[field] = JSON.parse(parsed[field])
        } catch (e) {
          parsed[field] = {}
        }
      }
    }

    return parsed
  }

  redisClient.getApiKeysPaginated = async function (options = {}) {
    const {
      page = 1,
      pageSize = 20,
      searchMode = 'apiKey',
      search = '',
      tag = '',
      isActive = '',
      sortBy = 'createdAt',
      sortOrder = 'desc',
      excludeDeleted = true, // 默认排除已删除的 API Keys
      modelFilter = []
    } = options

    // 尝试使用索引查询（性能优化）
    const apiKeyIndexService = require('../../services/apiKeyIndexService')
    const indexReady = await apiKeyIndexService.isIndexReady()

    // 索引路径支持的条件：
    // - 无模型筛选（需要查询使用记录）
    // - 非 bindingAccount 搜索模式（索引不支持）
    // - 非 status/expiresAt 排序（索引不支持）
    // - 无搜索关键词（索引只搜 name，旧逻辑搜 name+owner，不一致）
    const canUseIndex =
      indexReady &&
      modelFilter.length === 0 &&
      searchMode !== 'bindingAccount' &&
      !['status', 'expiresAt'].includes(sortBy) &&
      !search

    if (canUseIndex) {
      // 使用索引查询
      try {
        return await apiKeyIndexService.queryWithIndex({
          page,
          pageSize,
          sortBy,
          sortOrder,
          isActive: isActive === '' ? undefined : isActive === 'true' || isActive === true,
          tag,
          excludeDeleted
        })
      } catch (error) {
        logger.warn('⚠️ 索引查询失败，降级到全量扫描:', error.message)
      }
    }

    // 降级：使用 SCAN 获取所有 apikey:* 的 ID 列表（避免阻塞）
    const keyIds = await this.scanApiKeyIds()

    // 2. 使用 Pipeline 批量获取基础数据
    const apiKeys = await this.batchGetApiKeys(keyIds)

    // 3. 应用筛选条件
    let filteredKeys = apiKeys

    // 排除已删除的 API Keys（默认行为）
    if (excludeDeleted) {
      filteredKeys = filteredKeys.filter((k) => !k.isDeleted)
    }

    // 状态筛选
    if (isActive !== '' && isActive !== undefined && isActive !== null) {
      const activeValue = isActive === 'true' || isActive === true
      filteredKeys = filteredKeys.filter((k) => k.isActive === activeValue)
    }

    // 标签筛选
    if (tag) {
      filteredKeys = filteredKeys.filter((k) => {
        const tags = Array.isArray(k.tags) ? k.tags : []
        return tags.includes(tag)
      })
    }

    // 搜索
    if (search) {
      const lowerSearch = search.toLowerCase().trim()
      if (searchMode === 'apiKey') {
        // apiKey 模式：搜索名称和拥有者
        filteredKeys = filteredKeys.filter(
          (k) =>
            (k.name && k.name.toLowerCase().includes(lowerSearch)) ||
            (k.ownerDisplayName && k.ownerDisplayName.toLowerCase().includes(lowerSearch))
        )
      } else if (searchMode === 'bindingAccount') {
        // bindingAccount 模式：直接在Redis层处理，避免路由层加载10000条
        const accountNameCacheService = require('../../services/accountNameCacheService')
        filteredKeys = accountNameCacheService.searchByBindingAccount(filteredKeys, lowerSearch)
      }
    }

    // 模型筛选
    if (modelFilter.length > 0) {
      const keyIdsWithModels = await this.getKeyIdsWithModels(
        filteredKeys.map((k) => k.id),
        modelFilter
      )
      filteredKeys = filteredKeys.filter((k) => keyIdsWithModels.has(k.id))
    }

    // 4. 排序
    filteredKeys.sort((a, b) => {
      // status 排序实际上使用 isActive 字段（API Key 没有 status 字段）
      const effectiveSortBy = sortBy === 'status' ? 'isActive' : sortBy
      let aVal = a[effectiveSortBy]
      let bVal = b[effectiveSortBy]

      // 日期字段转时间戳
      if (['createdAt', 'expiresAt', 'lastUsedAt'].includes(effectiveSortBy)) {
        aVal = aVal ? new Date(aVal).getTime() : 0
        bVal = bVal ? new Date(bVal).getTime() : 0
      }

      // 布尔字段转数字
      if (effectiveSortBy === 'isActive') {
        aVal = aVal ? 1 : 0
        bVal = bVal ? 1 : 0
      }

      // 字符串字段
      if (sortBy === 'name') {
        aVal = (aVal || '').toLowerCase()
        bVal = (bVal || '').toLowerCase()
      }

      if (aVal < bVal) {
        return sortOrder === 'asc' ? -1 : 1
      }
      if (aVal > bVal) {
        return sortOrder === 'asc' ? 1 : -1
      }
      return 0
    })

    // 5. 收集所有可用标签（在分页之前）
    const allTags = new Set()
    for (const key of apiKeys) {
      const tags = Array.isArray(key.tags) ? key.tags : []
      tags.forEach((t) => allTags.add(t))
    }
    const availableTags = [...allTags].sort()

    // 6. 分页
    const total = filteredKeys.length
    const totalPages = Math.ceil(total / pageSize) || 1
    const validPage = Math.min(Math.max(1, page), totalPages)
    const start = (validPage - 1) * pageSize
    const items = filteredKeys.slice(start, start + pageSize)

    return {
      items,
      pagination: {
        page: validPage,
        pageSize,
        total,
        totalPages
      },
      availableTags
    }
  }

  // 🔍 通过哈希值查找API Key（性能优化）
  redisClient.findApiKeyByHash = async function (hashedKey) {
    const keyId = await resolveKeyIdByHash(this.client, hashedKey)

    if (!keyId) {
      return null
    }

    const keyData = await this.client.hgetall(RedisKeys.apiKey.byId(keyId))
    if (keyData && Object.keys(keyData).length > 0) {
      return { id: keyId, ...keyData }
    }

    // 如果数据不存在，清理映射表
    await this.client.hdel(RedisKeys.apiKey.hashMap, hashedKey)
    return null
  }
}

module.exports = { attach }
