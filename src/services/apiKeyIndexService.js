/**
 * API Key 索引服务
 * 维护 Sorted Set 索引以支持高效分页查询
 */

const { randomUUID } = require('crypto')
const logger = require('../utils/logger')
const { RedisKeys } = require('../constants/redisKeys')

class ApiKeyIndexService {
  constructor() {
    this.redis = null
    this.INDEX_VERSION_KEY = RedisKeys.apiKey.indexVersion
    this.DRIFT_KEY = RedisKeys.apiKey.indexDrift // 漂移自愈指标（启动对账写入，getStatus 读出供 admin 观测）；不在 INDEX_KEYS 内，重建不清它
    this.CURRENT_VERSION = 4 // 版本升级，触发重建（v4: 状态集合改为随 hash 原子维护，强制重建以愈合历史漂移）
    this.isBuilding = false
    this.buildProgress = { current: 0, total: 0 }
    // 周期后台对账：把"启动后写事务部分提交漂移"的收敛窗口从"下次重启/手动重建"缩到 ≤ 此间隔（env 可调）。
    // 单实例停机重启部署：仅本进程一个定时器；大 keyspace 可调长以降低周期全量扫描开销。
    this.DRIFT_SCAN_INTERVAL_MS =
      parseInt(process.env.APIKEY_INDEX_DRIFT_SCAN_INTERVAL_MS, 10) || 30 * 60 * 1000
    this._driftTimer = null
    this._driftStopped = false

    // 索引键名（值统一来自 RedisKeys 注册表，单一权威源）
    this.INDEX_KEYS = {
      CREATED_AT: RedisKeys.apiKey.idx.createdAt,
      LAST_USED_AT: RedisKeys.apiKey.idx.lastUsedAt,
      NAME: RedisKeys.apiKey.idx.name,
      ACTIVE_SET: RedisKeys.apiKey.set.active,
      DELETED_SET: RedisKeys.apiKey.set.deleted,
      DELETED_AT: RedisKeys.apiKey.idx.deletedAt, // 已删除 Key 的有序集合（分数=删除时间），用于回收站分页
      ALL_SET: RedisKeys.apiKey.idx.all,
      TAGS_ALL: RedisKeys.apiKey.tagsAll // 所有标签的集合
    }
  }

  /**
   * 初始化服务
   */
  init(redis) {
    this.redis = redis
    return this
  }

  /**
   * 启动时检查并重建索引
   */
  async checkAndRebuild() {
    if (!this.redis) {
      logger.warn('⚠️ ApiKeyIndexService: Redis not initialized')
      return
    }

    try {
      const client = this.redis.getClientSafe()
      const version = await client.get(this.INDEX_VERSION_KEY)

      // 始终检查并回填 hash_map（幂等操作，确保升级兼容）
      this.rebuildHashMap().catch((err) => {
        logger.error('❌ API Key hash_map 回填失败:', err)
      })

      if (parseInt(version) >= this.CURRENT_VERSION) {
        logger.info('✅ API Key 索引已是最新版本')
        // 列表索引(ALL/ACTIVE/DELETED/排序/名称/标签等)无 TTL、无读侧自愈:启动先做一次漂移检测,
        // 发现任一索引与 hash 真实状态不一致即触发重建自愈(纯 Redis 架构对"无 SQL 列表"的补偿)
        this.detectAndHealMainIndexDrift().catch((err) => {
          logger.error('❌ API Key 列表索引漂移检测失败:', err)
        })
      } else {
        // 后台异步重建，不阻塞启动
        this.rebuildIndexes().catch((err) => {
          logger.error('❌ API Key 索引重建失败:', err)
        })
      }

      // 启动后再起周期后台对账：之后写事务若出现部分提交漂移，≤DRIFT_SCAN_INTERVAL_MS 内自动收敛，不必等重启/手动重建
      this.startPeriodicDriftScan()
    } catch (error) {
      logger.error('❌ 检查 API Key 索引版本失败:', error)
    }
  }

  // 周期后台对账：递归 setTimeout（非 setInterval，确保上一轮跑完再排下一轮、不叠加）；unref 不阻止进程退出；
  // 幂等（重复调用不重复起）。停机由 app.js 调 stopPeriodicDriftScan（unref 已保证即便不调也不阻塞退出）。
  startPeriodicDriftScan() {
    if (this._driftTimer) {
      return
    }
    this._driftStopped = false
    const tick = () => {
      this._driftTimer = setTimeout(async () => {
        try {
          await this.detectAndHealMainIndexDrift()
        } catch (err) {
          logger.error('❌ 周期 API Key 索引漂移检测失败:', err)
        }
        if (!this._driftStopped) {
          tick() // 本轮跑完再排下一轮，避免上一轮未完就叠加
        }
      }, this.DRIFT_SCAN_INTERVAL_MS)
      if (this._driftTimer && this._driftTimer.unref) {
        this._driftTimer.unref()
      }
    }
    tick()
  }

  stopPeriodicDriftScan() {
    this._driftStopped = true
    if (this._driftTimer) {
      clearTimeout(this._driftTimer)
      this._driftTimer = null
    }
  }

  /**
   * 回填 apikey:hash_map（升级兼容）
   * 扫描所有 API Key，确保 hash -> keyId 映射存在
   */
  async rebuildHashMap() {
    if (!this.redis) {
      return
    }

    try {
      const client = this.redis.getClientSafe()
      const keyIds = await this.redis.scanApiKeyIds()

      let rebuilt = 0
      const BATCH_SIZE = 100

      for (let i = 0; i < keyIds.length; i += BATCH_SIZE) {
        const batch = keyIds.slice(i, i + BATCH_SIZE)
        const pipeline = client.pipeline()

        // 批量获取 API Key 数据
        for (const keyId of batch) {
          pipeline.hgetall(RedisKeys.apiKey.byId(keyId))
        }
        const results = await pipeline.exec()

        // 检查并回填缺失的映射
        const fillPipeline = client.pipeline()
        let needFill = false

        for (let j = 0; j < batch.length; j++) {
          const keyData = results[j]?.[1]
          if (keyData && keyData.apiKey) {
            // keyData.apiKey 存储的是哈希值
            const exists = await client.hexists(RedisKeys.apiKey.hashMap, keyData.apiKey)
            if (!exists) {
              fillPipeline.hset(RedisKeys.apiKey.hashMap, keyData.apiKey, batch[j])
              rebuilt++
              needFill = true
            }
          }
        }

        if (needFill) {
          await fillPipeline.exec()
        }
      }

      if (rebuilt > 0) {
        logger.info(`🔧 回填了 ${rebuilt} 个 API Key 到 hash_map`)
      }
    } catch (error) {
      logger.error('❌ 回填 hash_map 失败:', error)
      throw error
    }
  }

  /**
   * 检查索引是否可用
   */
  async isIndexReady() {
    if (!this.redis || this.isBuilding) {
      return false
    }

    try {
      const client = this.redis.getClientSafe()
      const version = await client.get(this.INDEX_VERSION_KEY)
      return parseInt(version) >= this.CURRENT_VERSION
    } catch {
      return false
    }
  }

  // 由 apiKey hash 计算其在各主列表索引中的应有取值（纯函数，无副作用）。
  // rebuildIndexes 据此建索引、detectAndHealMainIndexDrift 据此核对——共用同一规则，避免"建"与"验"分叉。
  _indexEntryForKey(apiKey) {
    const keyId = apiKey.id
    const name = (apiKey.name || '').toLowerCase()
    return {
      keyId,
      createdScore: apiKey.createdAt ? new Date(apiKey.createdAt).getTime() : 0,
      lastUsedScore: apiKey.lastUsedAt ? new Date(apiKey.lastUsedAt).getTime() : 0,
      deletedScore: apiKey.deletedAt ? new Date(apiKey.deletedAt).getTime() : 0,
      nameMember: `${name}\x00${keyId}`,
      isActive: apiKey.isActive === true || apiKey.isActive === 'true',
      isDeleted: apiKey.isDeleted === true || apiKey.isDeleted === 'true'
    }
  }

  /**
   * 重建所有索引
   */
  async rebuildIndexes() {
    if (this.isBuilding) {
      logger.warn('⚠️ API Key 索引正在重建中，跳过')
      return
    }

    this.isBuilding = true
    const startTime = Date.now()

    try {
      const client = this.redis.getClientSafe()
      logger.info('🔨 开始重建 API Key 索引...')

      // 0. 先删除版本号，让 _checkIndexReady 返回 false，查询回退到 SCAN
      await client.del(this.INDEX_VERSION_KEY)

      // 1. 清除旧索引
      const indexKeys = Object.values(this.INDEX_KEYS)
      for (const key of indexKeys) {
        await client.del(key)
      }
      // 清除标签索引（用 SCAN 避免阻塞）
      let cursor = '0'
      do {
        const [newCursor, keys] = await client.scan(
          cursor,
          'MATCH',
          RedisKeys.apiKey.tagPattern,
          'COUNT',
          100
        )
        cursor = newCursor
        if (keys.length > 0) {
          await client.del(...keys)
        }
      } while (cursor !== '0')

      // 2. 扫描所有 API Key
      const keyIds = await this.redis.scanApiKeyIds()
      this.buildProgress = { current: 0, total: keyIds.length }

      logger.info(`📊 发现 ${keyIds.length} 个 API Key，开始建立索引...`)

      // 3. 批量处理（每批 500 个）
      const BATCH_SIZE = 500
      for (let i = 0; i < keyIds.length; i += BATCH_SIZE) {
        const batch = keyIds.slice(i, i + BATCH_SIZE)
        const apiKeys = await this.redis.batchGetApiKeys(batch)

        const pipeline = client.pipeline()

        for (const apiKey of apiKeys) {
          if (!apiKey || !apiKey.id) {
            continue
          }

          // 各索引应有取值统一由 _indexEntryForKey 计算（与漂移检测共用同一规则）
          const {
            keyId,
            createdScore,
            lastUsedScore,
            nameMember,
            deletedScore,
            isActive,
            isDeleted
          } = this._indexEntryForKey(apiKey)

          // 创建时间 / 最后使用时间 / 名称（排序，格式 name\0keyId）/ 全部集合
          pipeline.zadd(this.INDEX_KEYS.CREATED_AT, createdScore, keyId)
          pipeline.zadd(this.INDEX_KEYS.LAST_USED_AT, lastUsedScore, keyId)
          pipeline.zadd(this.INDEX_KEYS.NAME, 0, nameMember)
          pipeline.sadd(this.INDEX_KEYS.ALL_SET, keyId)

          // 状态集合
          if (isDeleted) {
            pipeline.sadd(this.INDEX_KEYS.DELETED_SET, keyId)
            pipeline.zadd(this.INDEX_KEYS.DELETED_AT, deletedScore, keyId)
          } else if (isActive) {
            pipeline.sadd(this.INDEX_KEYS.ACTIVE_SET, keyId)
          }

          // 标签索引（仅未删除 key）：标签语义为"未删除 key 的标签"，与软删/恢复维护、
          // redis.js _extractTagsFromKeyIds 过滤 isDeleted 一致；否则重建会把只挂在已删 key 上的死标签带回 tags:all
          if (!isDeleted) {
            const tags = Array.isArray(apiKey.tags) ? apiKey.tags : []
            for (const tag of tags) {
              if (tag && typeof tag === 'string') {
                pipeline.sadd(RedisKeys.apiKey.tag(tag), keyId)
                pipeline.sadd(this.INDEX_KEYS.TAGS_ALL, tag) // 维护标签集合
              }
            }
          }
        }

        await pipeline.exec()
        this.buildProgress.current = Math.min(i + BATCH_SIZE, keyIds.length)

        // 每批次后短暂让出 CPU
        await new Promise((resolve) => setTimeout(resolve, 10))
      }

      // 4. 更新版本号
      await client.set(this.INDEX_VERSION_KEY, this.CURRENT_VERSION)

      const duration = ((Date.now() - startTime) / 1000).toFixed(2)
      logger.success(`✅ API Key 索引重建完成，共 ${keyIds.length} 条，耗时 ${duration}s`)
    } catch (error) {
      logger.error('❌ API Key 索引重建失败:', error)
      throw error
    } finally {
      this.isBuilding = false
    }
  }

  // 漂移检测 + 自愈：以 hash 真实状态为准，核对主列表读路径依赖的全部索引——
  //   ALL_SET / ACTIVE_SET / DELETED_SET（状态筛选）、CREATED_AT / LAST_USED_AT（排序分数）、NAME（名称排序成员）、DELETED_AT（回收站成员 + 删除时间分数）。
  //   以及 per-tag 集合 apikey:tag:* 与 tags:all：成员须 ∈ 该 key 真实 tags（既剔死/孤儿成员，也揪出串错集合的 live key），读路径 scard>0 才是有效信号。
  // 为何不能只比基数：禁用未删 key 不入任何状态集合，ACTIVE/DELETED 的成员对错无法由基数反推；排序分数过期(member 在、score 旧)
  //   也不改变基数。故必须读 hash 逐个核对成员资格 + 分数 + 名称成员，任一不符即触发现有重建自愈（rebuild 一次性重建所有索引，含标签）。
  // 成员资格/分数规则与 rebuildIndexes 共用 _indexEntryForKey；MULTI 非回滚 + 列表索引无 TTL，故需此 out-of-band 收敛，取代已下线的读时惰性修复。
  // 触发时机：checkAndRebuild 启动时一次 + startPeriodicDriftScan 周期一次——把启动后写事务部分提交漂移的收敛窗口从"重启/手动重建"缩到 ≤ 间隔。
  async detectAndHealMainIndexDrift() {
    if (!this.redis || this.isBuilding) {
      return
    }
    const client = this.redis.getClientSafe()
    const K = this.INDEX_KEYS

    const [
      allMembers,
      activeMembers,
      deletedMembers,
      createdFlat,
      lastUsedFlat,
      nameMembers,
      deletedAtFlat,
      keyIds
    ] = await Promise.all([
      client.smembers(K.ALL_SET),
      client.smembers(K.ACTIVE_SET),
      client.smembers(K.DELETED_SET),
      client.zrange(K.CREATED_AT, 0, -1, 'WITHSCORES'),
      client.zrange(K.LAST_USED_AT, 0, -1, 'WITHSCORES'),
      client.zrange(K.NAME, 0, -1),
      client.zrange(K.DELETED_AT, 0, -1, 'WITHSCORES'),
      this.redis.scanApiKeyIds()
    ])

    const all = new Set(allMembers)
    const active = new Set(activeMembers)
    const deleted = new Set(deletedMembers)
    const nameSet = new Set(nameMembers)
    const hashSet = new Set(keyIds)
    // zrange WITHSCORES 返回扁平 [member, score, member, score, ...]，转 Map keyId->score
    const toScoreMap = (flat) => {
      const map = new Map()
      for (let i = 0; i < flat.length; i += 2) {
        map.set(flat[i], Number(flat[i + 1]))
      }
      return map
    }
    const createdScores = toScoreMap(createdFlat)
    const lastUsedScores = toScoreMap(lastUsedFlat)
    const deletedAtScores = toScoreMap(deletedAtFlat) // DELETED_AT 分数=删除时间，回收站按此排序，须校验分数本身
    // live key（存在且未删）累积，按 hash 真实 tags 还原应有的 tag 集合成员，供标签核对用真相对照
    const liveKeys = []

    let reason = null

    // 反向：任一索引成员无对应 hash = 僵尸（假阳性，让 total/页数虚高、回收站残留）
    const firstOrphan = (members) => members.find((id) => !hashSet.has(id))
    const orphan =
      firstOrphan(allMembers) ||
      firstOrphan(activeMembers) ||
      firstOrphan(deletedMembers) ||
      firstOrphan([...deletedAtScores.keys()])
    if (orphan) {
      reason = `僵尸索引项 ${orphan}`
    }

    // 正向：逐 key 以 hash 真实状态核对成员资格 + 排序分数 + 名称成员
    if (!reason) {
      const BATCH = 500
      for (let i = 0; i < keyIds.length && !reason; i += BATCH) {
        const apiKeys = await this.redis.batchGetApiKeys(keyIds.slice(i, i + BATCH))
        for (const apiKey of apiKeys) {
          if (!apiKey || !apiKey.id) {
            continue
          }
          const {
            keyId,
            createdScore,
            lastUsedScore,
            deletedScore,
            nameMember,
            isActive,
            isDeleted
          } = this._indexEntryForKey(apiKey)
          if (!isDeleted) {
            liveKeys.push(apiKey)
          }
          // 主索引（每个 key 必在）：ALL / CREATED / LAST_USED / NAME
          if (!all.has(keyId)) {
            reason = `主列表缺 ${keyId}`
          } else if (createdScores.get(keyId) !== createdScore) {
            reason = `创建时间排序漂移 ${keyId}`
          } else if (lastUsedScores.get(keyId) !== lastUsedScore) {
            reason = `最后使用排序漂移 ${keyId}`
          } else if (!nameSet.has(nameMember)) {
            reason = `名称排序漂移 ${keyId}`
          } else if (isDeleted) {
            // 已删：在 DELETED + DELETED_AT（分数=删除时间，回收站排序依赖它）、不在 ACTIVE
            if (
              !deleted.has(keyId) ||
              !deletedAtScores.has(keyId) ||
              deletedAtScores.get(keyId) !== deletedScore ||
              active.has(keyId)
            ) {
              reason = `已删状态/回收站索引漂移 ${keyId}`
            }
          } else if (deleted.has(keyId) || deletedAtScores.has(keyId)) {
            // 未删却残留在删除相关索引（恢复半成功）
            reason = `未删 key 残留删除索引 ${keyId}`
          } else if (isActive && !active.has(keyId)) {
            reason = `活跃缺 ACTIVE ${keyId}`
          } else if (!isActive && active.has(keyId)) {
            reason = `禁用误入 ACTIVE ${keyId}`
          }
          if (reason) {
            break
          }
        }
      }
    }

    // 标签索引核对（仅状态/排序维度无漂移时才查；有漂移已要重建，rebuild 会按 live key 重造 tag 集合 + tags:all）。
    // fast 读路径(scanAllApiKeyTags/_getAvailableTags)用 scard>0 过滤死标签，但 scard 只数成员、不证明成员 live：
    // 若 apikey:tag:X 残留已删/孤儿成员，scard>0 会让死标签赖在下拉。故以 live key 为真相，正反两向核对。
    if (!reason) {
      const tagsAll = new Set(await client.smembers(K.TAGS_ALL))
      const expected = new Map() // tag -> Set<live keyId>
      for (const apiKey of liveKeys) {
        for (const tag of Array.isArray(apiKey.tags) ? apiKey.tags : []) {
          if (tag && typeof tag === 'string') {
            if (!expected.has(tag)) {
              expected.set(tag, new Set())
            }
            expected.get(tag).add(apiKey.id)
          }
        }
      }
      // 扫所有 apikey:tag:* 集合到内存（成员总量 ~ 标签分配数，与全量 hgetall 同量级）
      const actual = new Map() // tag -> Set<member>
      let cursor = '0'
      do {
        const [next, tagKeys] = await client.scan(
          cursor,
          'MATCH',
          RedisKeys.apiKey.tagPattern,
          'COUNT',
          200
        )
        cursor = next
        for (const tagKey of tagKeys) {
          actual.set(
            tagKey.slice(RedisKeys.apiKey.tag('').length),
            new Set(await client.smembers(tagKey))
          )
        }
      } while (cursor !== '0')
      // 反向：tag 集合成员必须 ∈ expected[tag]（= live key 且其 hash 真实 tags 含该标签）。
      // 一次揪出两类漂移：① 非 live 成员（已删/孤儿）；② live key 串进错误 tag 集合（真实 tags 不含此标签 → 不在 expected[tag]）。
      for (const [tag, members] of actual) {
        const exp = expected.get(tag)
        for (const member of members) {
          if (!exp || !exp.has(member)) {
            reason = `标签集合 ${tag} 含错误成员 ${member}（非 live 或该 key 真实 tags 不含此标签）`
            break
          }
        }
        if (reason) {
          break
        }
      }
      // 正向：live key 的每个 tag 必须在对应集合 + tags:all（否则标签筛选漏 key / 下拉漏标签）
      if (!reason) {
        for (const [tag, ids] of expected) {
          if (!tagsAll.has(tag)) {
            reason = `tags:all 缺标签 ${tag}`
            break
          }
          const act = actual.get(tag)
          let missing = null
          for (const id of ids) {
            if (!act || !act.has(id)) {
              missing = id
              break
            }
          }
          if (missing) {
            reason = `标签集合 ${tag} 缺 live key ${missing}`
            break
          }
        }
      }
    }

    // 漂移指标落库（best-effort，失败不影响自愈），经 getStatus 暴露给 admin 状态——
    // 对账=带指标的安全网，便于观测"是否反复漂移"（chronic drift 才是真问题，单次自愈是正常兜底）
    const nowIso = new Date().toISOString()
    if (!reason) {
      client
        .hset(this.DRIFT_KEY, 'lastCheckAt', nowIso, 'lastCheckResult', 'ok')
        .catch((err) => logger.error('记录索引对账状态失败:', err))
      return
    }
    logger.warn(`⚠️ API Key 列表索引漂移（${reason}），触发重建自愈`)
    try {
      await client.hset(this.DRIFT_KEY, {
        lastCheckAt: nowIso,
        lastCheckResult: 'drift',
        lastDriftAt: nowIso,
        lastDriftReason: reason
      })
      await client.hincrby(this.DRIFT_KEY, 'driftCount', 1)
    } catch (err) {
      logger.error('记录索引漂移指标失败:', err)
    }
    await this.rebuildIndexes()
    client
      .hset(this.DRIFT_KEY, 'lastHealedAt', new Date().toISOString())
      .catch((err) => logger.error('记录索引自愈时间失败:', err))
  }

  /**
   * 添加单个 API Key 到索引
   */
  // multi 不为空时把命令挂到调用方事务（随其原子提交，不自行 exec、不吞错）；否则自建 pipeline 尽力维护
  async addToIndex(apiKey, multi = null) {
    if (!this.redis || !apiKey || !apiKey.id) {
      return
    }

    // 把索引命令排队到给定 pipeline/multi 的核心逻辑（不负责提交）
    const queue = (pipeline) => {
      const keyId = apiKey.id
      const createdAt = apiKey.createdAt ? new Date(apiKey.createdAt).getTime() : Date.now()
      const lastUsedAt = apiKey.lastUsedAt ? new Date(apiKey.lastUsedAt).getTime() : 0
      const name = (apiKey.name || '').toLowerCase()
      const isActive = apiKey.isActive === true || apiKey.isActive === 'true'
      const isDeleted = apiKey.isDeleted === true || apiKey.isDeleted === 'true'

      pipeline.zadd(this.INDEX_KEYS.CREATED_AT, createdAt, keyId)
      pipeline.zadd(this.INDEX_KEYS.LAST_USED_AT, lastUsedAt, keyId)
      pipeline.zadd(this.INDEX_KEYS.NAME, 0, `${name}\x00${keyId}`)
      pipeline.sadd(this.INDEX_KEYS.ALL_SET, keyId)

      // 注意：deletedAt 有序索引不在此维护，统一由软删/恢复/彻底删的原子操作 + 索引重建负责
      if (isDeleted) {
        pipeline.sadd(this.INDEX_KEYS.DELETED_SET, keyId)
        pipeline.srem(this.INDEX_KEYS.ACTIVE_SET, keyId)
      } else if (isActive) {
        pipeline.sadd(this.INDEX_KEYS.ACTIVE_SET, keyId)
        pipeline.srem(this.INDEX_KEYS.DELETED_SET, keyId)
      } else {
        pipeline.srem(this.INDEX_KEYS.ACTIVE_SET, keyId)
        pipeline.srem(this.INDEX_KEYS.DELETED_SET, keyId)
      }

      // 标签索引
      const tags = Array.isArray(apiKey.tags) ? apiKey.tags : []
      for (const tag of tags) {
        if (tag && typeof tag === 'string') {
          pipeline.sadd(RedisKeys.apiKey.tag(tag), keyId)
          pipeline.sadd(this.INDEX_KEYS.TAGS_ALL, tag)
        }
      }
    }

    // 挂到调用方事务：不吞错，让异常向上传播，使调用方能中止整个事务（hash 也不会 exec/提交）。
    // 否则排队阶段一旦抛错被吞，调用方仍会 exec 提交 hash、返回成功，索引却没挂上 —— 伪原子。
    if (multi) {
      queue(multi)
      return
    }

    // 独立调用：自建 pipeline 提交，失败仅告警（best-effort）
    try {
      const pipeline = this.redis.getClientSafe().pipeline()
      queue(pipeline)
      await pipeline.exec()
    } catch (error) {
      logger.error(`❌ 添加 API Key ${apiKey.id} 到索引失败:`, error)
    }
  }

  /**
   * 更新索引（状态、名称、标签变化时调用）
   */
  // multi 不为空时把命令挂到调用方事务（不自行 exec、不吞错）；返回被移除的标签，调用方在 exec 后做 tags:all 空集合清理
  async updateIndex(keyId, updates, oldData = {}, multi = null) {
    if (!this.redis || !keyId) {
      return []
    }

    const removedTags = []

    // 把索引命令排队到给定 pipeline/multi 的核心逻辑（不负责提交）
    const queue = (pipeline) => {
      // 名称索引
      if (updates.name !== undefined) {
        const oldName = (oldData.name || '').toLowerCase()
        const newName = (updates.name || '').toLowerCase()
        if (oldName !== newName) {
          pipeline.zrem(this.INDEX_KEYS.NAME, `${oldName}\x00${keyId}`)
          pipeline.zadd(this.INDEX_KEYS.NAME, 0, `${newName}\x00${keyId}`)
        }
      }

      // 最后使用时间索引
      if (updates.lastUsedAt !== undefined) {
        const lastUsedAt = updates.lastUsedAt ? new Date(updates.lastUsedAt).getTime() : 0
        pipeline.zadd(this.INDEX_KEYS.LAST_USED_AT, lastUsedAt, keyId)
      }

      // 状态集合（deletedAt 有序索引不在此维护，由原子操作 + 重建负责）
      if (updates.isActive !== undefined || updates.isDeleted !== undefined) {
        const isActive = updates.isActive ?? oldData.isActive
        const isDeleted = updates.isDeleted ?? oldData.isDeleted
        if (isDeleted === true || isDeleted === 'true') {
          pipeline.sadd(this.INDEX_KEYS.DELETED_SET, keyId)
          pipeline.srem(this.INDEX_KEYS.ACTIVE_SET, keyId)
        } else if (isActive === true || isActive === 'true') {
          pipeline.sadd(this.INDEX_KEYS.ACTIVE_SET, keyId)
          pipeline.srem(this.INDEX_KEYS.DELETED_SET, keyId)
        } else {
          pipeline.srem(this.INDEX_KEYS.ACTIVE_SET, keyId)
          pipeline.srem(this.INDEX_KEYS.DELETED_SET, keyId)
        }
      }

      // 标签索引
      if (updates.tags !== undefined) {
        const oldTags = Array.isArray(oldData.tags) ? oldData.tags : []
        const newTags = Array.isArray(updates.tags) ? updates.tags : []
        for (const tag of oldTags) {
          if (tag && !newTags.includes(tag)) {
            pipeline.srem(RedisKeys.apiKey.tag(tag), keyId)
            removedTags.push(tag)
          }
        }
        for (const tag of newTags) {
          if (tag && typeof tag === 'string') {
            pipeline.sadd(RedisKeys.apiKey.tag(tag), keyId)
            pipeline.sadd(this.INDEX_KEYS.TAGS_ALL, tag)
          }
        }
      }
    }

    // 挂到调用方事务：不吞错，让异常向上传播（调用方因此不会 exec、hash 也不提交）。
    // tags:all 空集合清理交由调用方在 exec 后处理（见返回值）
    if (multi) {
      queue(multi)
      return removedTags
    }

    // 独立调用：自建 pipeline 提交 + tags:all 清理，失败仅告警（best-effort）
    try {
      const client = this.redis.getClientSafe()
      const pipeline = client.pipeline()
      queue(pipeline)
      await pipeline.exec()

      // 检查被移除的标签集合是否为空，为空则从 tags:all 移除
      for (const tag of removedTags) {
        const count = await client.scard(RedisKeys.apiKey.tag(tag))
        if (count === 0) {
          await client.srem(this.INDEX_KEYS.TAGS_ALL, tag)
        }
      }
      return removedTags
    } catch (error) {
      logger.error(`❌ 更新 API Key ${keyId} 索引失败:`, error)
      return []
    }
  }

  /**
   * 从索引中移除 API Key
   */
  async removeFromIndex(keyId, oldData = {}) {
    if (!this.redis || !keyId) {
      return
    }

    try {
      const client = this.redis.getClientSafe()
      const pipeline = client.pipeline()

      const name = (oldData.name || '').toLowerCase()

      pipeline.zrem(this.INDEX_KEYS.CREATED_AT, keyId)
      pipeline.zrem(this.INDEX_KEYS.LAST_USED_AT, keyId)
      pipeline.zrem(this.INDEX_KEYS.NAME, `${name}\x00${keyId}`)
      pipeline.srem(this.INDEX_KEYS.ALL_SET, keyId)
      pipeline.srem(this.INDEX_KEYS.ACTIVE_SET, keyId)
      pipeline.srem(this.INDEX_KEYS.DELETED_SET, keyId)
      // deletedAt 有序索引由彻底删除的原子操作负责移除，这里不重复处理

      // 移除标签索引
      const tags = Array.isArray(oldData.tags) ? oldData.tags : []
      for (const tag of tags) {
        if (tag) {
          pipeline.srem(RedisKeys.apiKey.tag(tag), keyId)
        }
      }

      await pipeline.exec()

      // 检查标签集合是否为空，为空则从 tags:all 移除
      for (const tag of tags) {
        if (tag) {
          const count = await client.scard(RedisKeys.apiKey.tag(tag))
          if (count === 0) {
            await client.srem(this.INDEX_KEYS.TAGS_ALL, tag)
          }
        }
      }
    } catch (error) {
      logger.error(`❌ 从索引移除 API Key ${keyId} 失败:`, error)
    }
  }

  /**
   * 使用索引进行分页查询
   * 使用 ZINTERSTORE 优化，避免全量拉回内存
   */
  async queryWithIndex(options = {}) {
    const {
      page = 1,
      pageSize = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      isActive,
      tag,
      excludeDeleted = true
    } = options

    const client = this.redis.getClientSafe()
    const tempSets = []

    try {
      // 1. 构建筛选集合
      let filterSet = this.INDEX_KEYS.ALL_SET

      // 状态筛选
      if (isActive === true || isActive === 'true') {
        // 筛选活跃的
        filterSet = this.INDEX_KEYS.ACTIVE_SET
      } else if (isActive === false || isActive === 'false') {
        // 筛选未激活的 = ALL - ACTIVE (- DELETED if excludeDeleted)
        const tempKey = RedisKeys.apiKey.tmp('inactive', randomUUID())
        if (excludeDeleted) {
          await client.sdiffstore(
            tempKey,
            this.INDEX_KEYS.ALL_SET,
            this.INDEX_KEYS.ACTIVE_SET,
            this.INDEX_KEYS.DELETED_SET
          )
        } else {
          await client.sdiffstore(tempKey, this.INDEX_KEYS.ALL_SET, this.INDEX_KEYS.ACTIVE_SET)
        }
        await client.expire(tempKey, 60)
        filterSet = tempKey
        tempSets.push(tempKey)
      } else if (excludeDeleted) {
        // 排除已删除：ALL - DELETED
        const tempKey = RedisKeys.apiKey.tmp('notdeleted', randomUUID())
        await client.sdiffstore(tempKey, this.INDEX_KEYS.ALL_SET, this.INDEX_KEYS.DELETED_SET)
        await client.expire(tempKey, 60)
        filterSet = tempKey
        tempSets.push(tempKey)
      }

      // 标签筛选
      if (tag) {
        const tagSet = RedisKeys.apiKey.tag(tag)
        const tempKey = RedisKeys.apiKey.tmp('tag', randomUUID())
        await client.sinterstore(tempKey, filterSet, tagSet)
        await client.expire(tempKey, 60)
        filterSet = tempKey
        tempSets.push(tempKey)
      }

      // 2. 获取筛选后的 keyId 集合
      const filterMembers = await client.smembers(filterSet)
      if (filterMembers.length === 0) {
        // 没有匹配的数据
        return {
          items: [],
          pagination: { page: 1, pageSize, total: 0, totalPages: 1 },
          availableTags: await this._getAvailableTags(client)
        }
      }

      // 3. 排序
      let sortedKeyIds

      if (sortBy === 'name') {
        // 优化：只拉筛选后 keyId 的 name 字段，避免全量扫描 name 索引
        const pipeline = client.pipeline()
        for (const keyId of filterMembers) {
          pipeline.hget(RedisKeys.apiKey.byId(keyId), 'name')
        }
        const results = await pipeline.exec()

        // 组装并排序
        const items = filterMembers.map((keyId, i) => ({
          keyId,
          name: (results[i]?.[1] || '').toLowerCase()
        }))
        items.sort((a, b) =>
          sortOrder === 'desc' ? b.name.localeCompare(a.name) : a.name.localeCompare(b.name)
        )
        sortedKeyIds = items.map((item) => item.keyId)
      } else {
        // createdAt / lastUsedAt 索引成员是 keyId，可以用 ZINTERSTORE
        const sortIndex = this._getSortIndex(sortBy)
        const tempSortedKey = RedisKeys.apiKey.tmp('sorted', randomUUID())
        tempSets.push(tempSortedKey)

        // 将 filterSet 转换为 Sorted Set（所有分数为 0）
        const filterZsetKey = RedisKeys.apiKey.tmp('filter', randomUUID())
        tempSets.push(filterZsetKey)

        const zaddArgs = []
        for (const member of filterMembers) {
          zaddArgs.push(0, member)
        }
        await client.zadd(filterZsetKey, ...zaddArgs)
        await client.expire(filterZsetKey, 60)

        // ZINTERSTORE：取交集，使用排序索引的分数（WEIGHTS 0 1）
        await client.zinterstore(tempSortedKey, 2, filterZsetKey, sortIndex, 'WEIGHTS', 0, 1)
        await client.expire(tempSortedKey, 60)

        // 获取排序后的 keyId
        sortedKeyIds =
          sortOrder === 'desc'
            ? await client.zrevrange(tempSortedKey, 0, -1)
            : await client.zrange(tempSortedKey, 0, -1)
      }

      // 4. 分页：只读当前页（O(pageSize)）。total 取候选集大小（索引筛选结果）——
      //    写入并入同一 MULTI、索引稳态干净，故信任 ZINTERSTORE/筛选集给出的候选与排序，不再全量 HGETALL 回内存重排。
      const total = sortedKeyIds.length
      const totalPages = Math.max(Math.ceil(total / pageSize), 1)
      const validPage = Math.min(Math.max(1, page), totalPages)
      const start = (validPage - 1) * pageSize
      const pageKeyIds = sortedKeyIds.slice(start, start + pageSize)

      // 只 batchGet 当前页（O(pageSize)）
      const fetched = await this.redis.batchGetApiKeys(pageKeyIds)
      const fetchedById = new Map(fetched.filter(Boolean).map((k) => [k.id, k]))

      // 读时对账（纵深防御）：以 hash 真实状态为准,把当前页里与筛选不符的项（已删 / 已禁用 / 已不存在 / 标签不符）从展示剔除。
      // 纯读、不在读路径改索引（见下方 offset 稳定性说明）；残留漂移由启动漂移检测 + 重建愈合,不做读时修复、不全量遍历。
      // tradeoff：有残留漂移时当前页可能短几条、total 可能短暂偏高。
      const wantActive = isActive === true || isActive === 'true'
      const wantInactive = isActive === false || isActive === 'false'
      const matchesFilter = (k) => {
        if (!k) {
          return false // hash 已不存在（彻底删除残留的索引项）
        }
        // 标签筛选以 hash 真实 tags 为准：tag 集合可能残留脏成员
        if (tag && !(Array.isArray(k.tags) ? k.tags : []).includes(tag)) {
          return false
        }
        const deleted = k.isDeleted === true || k.isDeleted === 'true'
        const active = k.isActive === true || k.isActive === 'true'
        if (wantActive) {
          return active && !deleted
        }
        if (wantInactive) {
          return !active && (!excludeDeleted || !deleted)
        }
        return !excludeDeleted || !deleted
      }

      // 纯读：只把当前页里与筛选不符的项（已删 / 孤儿 / 标签不符）从展示结果剔除，绝不在读路径改动索引。
      // 关键：分页 offset 基于"未清理候选集"算出，若读时 ZREM 脏项会把后续页的真实项整体左移，
      //       造成翻页时跨页漏项 / 重复（分页序列错乱，比"当前页短几条"严重得多）。
      // 脏项由同一 MULTI 写入收窄、由启动漂移检测 + 重建愈合；读路径保持纯读、offset 稳定。
      const items = []
      for (const keyId of pageKeyIds) {
        const k = fetchedById.get(keyId)
        if (matchesFilter(k)) {
          items.push(k)
        }
      }

      // 获取所有标签（在对账之后取，反映最新的 tags:all）
      const availableTags = await this._getAvailableTags(client)

      // total 取候选集大小（含本次尚未剔除的漂移项，随启动检测 / 重建愈合）——O(pageSize) 取舍，不全量遍历核对
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
    } finally {
      // 7. 清理临时集合
      for (const tempKey of tempSets) {
        client.del(tempKey).catch(() => {})
      }
    }
  }

  /**
   * 使用 deletedAt 索引分页查询已删除的 API Key（按删除时间倒序）——只读当前页（O(pageSize)）、纯读。
   * 软删/恢复/彻底删都在同一 MULTI 内维护 deletedAt 索引（取代两段式 best-effort），稳态下索引干净、ZCARD/分页即准确。
   * 关键：只把当前页里的僵尸项（hash 已彻底删除 / 已恢复残留）从展示剔除，绝不在读路径 ZREM 改动索引——
   *       否则会改变后续页的 offset（基于未清理索引算出），翻页时跨页漏项 / 重复。僵尸由同一 MULTI 写入收窄、由重建愈合。
   * tradeoff：有残留僵尸时当前页可能短几条、total 可能短暂偏高，随重建自愈。
   */
  async queryDeletedWithIndex({ page = 1, pageSize = 20 } = {}) {
    const client = this.redis.getClientSafe()
    const requestedPage = Math.max(1, page)

    const total = await client.zcard(this.INDEX_KEYS.DELETED_AT)
    const totalPages = Math.ceil(total / pageSize)
    const validPage = totalPages > 0 ? Math.min(requestedPage, totalPages) : 1
    const start = (validPage - 1) * pageSize
    const end = start + pageSize - 1

    // 只取当前页的 keyId（O(log N + pageSize)），再只 batchGet 这一页
    const pageKeyIds =
      total > 0 ? await client.zrevrange(this.INDEX_KEYS.DELETED_AT, start, end) : []
    const fetched = pageKeyIds.length > 0 ? await this.redis.batchGetApiKeys(pageKeyIds) : []
    const fetchedById = new Map(fetched.map((k) => [k.id, k]))

    // 纯读：僵尸项（hash 不存在 / isDeleted 非真）仅从展示剔除，不在读路径改动 DELETED_AT（保证翻页 offset 稳定）
    const items = []
    for (const keyId of pageKeyIds) {
      const k = fetchedById.get(keyId)
      if (k && k.isDeleted === true) {
        items.push(k)
      }
    }

    return {
      items,
      pagination: {
        page: validPage,
        pageSize,
        total,
        totalPages
      }
    }
  }

  /**
   * 获取排序索引键名
   */
  _getSortIndex(sortBy) {
    switch (sortBy) {
      case 'createdAt':
        return this.INDEX_KEYS.CREATED_AT
      case 'lastUsedAt':
        return this.INDEX_KEYS.LAST_USED_AT
      case 'name':
        return this.INDEX_KEYS.NAME
      default:
        return this.INDEX_KEYS.CREATED_AT
    }
  }

  /**
   * 获取所有可用标签（从 tags:all 集合）
   */
  async _getAvailableTags(client) {
    try {
      const tags = await client.smembers(this.INDEX_KEYS.TAGS_ALL)
      if (tags.length === 0) {
        return []
      }
      // 这是 queryWithIndex 每次列表查询都调的热路径，故信任 tags:all 缓存（O(numTags) scard，避免每次全量 hgetall）。
      // scard 仅滤掉"多余的死标签"（scard=0），滤不出"tags:all 缺真标签"——该完整性 + 成员 live 性由写路径维护 +
      // 漂移检测（启动 + 周期 detectAndHealMainIndexDrift）持续校正，故缓存的不完整是 ≤ 间隔的瞬态。
      // 对比：getAllTags 走的 scanAllApiKeyTags 是冷路径，已改为按 live key 现算、不信 tags:all 完整性。
      const pipeline = client.pipeline()
      for (const tag of tags) {
        pipeline.scard(RedisKeys.apiKey.tag(tag))
      }
      const results = await pipeline.exec()
      return tags.filter((_tag, i) => results[i] && !results[i][0] && results[i][1] > 0).sort()
    } catch {
      return []
    }
  }

  /**
   * 更新 lastUsedAt 索引（供 recordUsage 调用）
   */
  async updateLastUsedAt(keyId, lastUsedAt) {
    if (!this.redis || !keyId) {
      return
    }

    try {
      const client = this.redis.getClientSafe()
      const timestamp = lastUsedAt ? new Date(lastUsedAt).getTime() : Date.now()
      await client.zadd(this.INDEX_KEYS.LAST_USED_AT, timestamp, keyId)
    } catch (error) {
      logger.error(`❌ 更新 API Key ${keyId} lastUsedAt 索引失败:`, error)
    }
  }

  /**
   * 获取索引状态
   */
  async getStatus() {
    if (!this.redis) {
      return { ready: false, building: false }
    }

    try {
      const client = this.redis.getClientSafe()
      const version = await client.get(this.INDEX_VERSION_KEY)
      const totalCount = await client.scard(this.INDEX_KEYS.ALL_SET)
      const driftRaw = await client.hgetall(this.DRIFT_KEY)

      return {
        ready: parseInt(version) >= this.CURRENT_VERSION,
        building: this.isBuilding,
        progress: this.buildProgress,
        version: parseInt(version) || 0,
        currentVersion: this.CURRENT_VERSION,
        totalIndexed: totalCount,
        // 漂移自愈指标（启动对账写入）：driftCount 累计漂移次数 + 最近一次原因/时间/自愈时间
        drift: { ...driftRaw, driftCount: parseInt(driftRaw && driftRaw.driftCount, 10) || 0 }
      }
    } catch {
      return { ready: false, building: this.isBuilding }
    }
  }
}

// 单例
const apiKeyIndexService = new ApiKeyIndexService()

module.exports = apiKeyIndexService
