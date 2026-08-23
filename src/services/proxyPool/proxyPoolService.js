const os = require('os')

const { v4: uuidv4 } = require('uuid')

const logger = require('../../utils/logger')
const config = require('../../../config/config')
const redis = require('../../models/redis')
const { RedisKeys } = require('../../constants/redisKeys')
const {
  ProxyStatus,
  CircuitState,
  CORE_CONFIG,
  configureCore,
  ProxyRuntimeState,
  computeDynamicWeight,
  aggregateShardStats,
  buildWeightedProxy,
  buildRouteEntry,
  isProxyTransportOk,
  classifyProxyErrorFromStatus,
  validateProxyUrl,
  maskProxyUrl,
  validateContextKey,
  normalizeContextKey
} = require('./proxyPoolCore')

// 本实例分片标识（hostname_pid），用于跨 worker 统计隔离
const SHARD_ID = `${os.hostname()}_${process.pid}`

// __all__ 伪分组：未指定 groupId 时代表"全部启用+健康代理"
const ALL_GROUP = '__all__'

// 新建代理默认基础权重（0-100，可在管理后台调整）
const DEFAULT_BASE_WEIGHT = 50

// 参数校验错误（statusCode=400），与服务端故障（默认 500）区分，供路由层据此设置状态码
const settingsValidationError = (message) => {
  const err = new Error(message)
  err.statusCode = 400
  return err
}

// 校验并归一化全局设置（来自管理后台 API 的外部输入，允许强转，越界抛错）
const normalizeProxyPoolSettings = (input) => {
  if (!input || typeof input !== 'object') {
    throw settingsValidationError('Invalid settings payload')
  }
  const intIn = (val, min, max, label) => {
    const n = Math.floor(Number(val))
    if (!Number.isFinite(n) || n < min || n > max) {
      throw settingsValidationError(`${label} 必须是 ${min}~${max} 之间的整数`)
    }
    return n
  }
  const url = String(input.healthCheckUrl || '').trim()
  if (!/^https?:\/\/.+/.test(url)) {
    throw settingsValidationError('探测目标 URL 必须以 http:// 或 https:// 开头')
  }
  return {
    healthCheckEnabled: input.healthCheckEnabled !== false,
    healthCheckIntervalMs: intIn(input.healthCheckIntervalMs, 5000, 3600000, '检查间隔'),
    healthCheckTimeoutMs: intIn(input.healthCheckTimeoutMs, 1000, 120000, '探测超时'),
    healthCheckUrl: url,
    healthConcurrency: intIn(input.healthConcurrency, 1, 100, '并发数'),
    healthFailureThreshold: intIn(input.healthFailureThreshold, 1, 100, '连续失败隔离阈值'),
    circuitFailureThreshold: intIn(input.circuitFailureThreshold, 1, 1000, '熔断触发失败次数'),
    circuitFailureWindowMs: intIn(input.circuitFailureWindowMs, 1000, 3600000, '失败计数窗口'),
    circuitCooldownMs: intIn(input.circuitCooldownMs, 1000, 3600000, '熔断冷却期'),
    slowStartDurationMs: intIn(input.slowStartDurationMs, 0, 3600000, '慢启动爬坡时长')
  }
}

// 代理池核心服务 — 三级缓存（L1 内存 + L2/L3 Redis）、四接口、CRUD、写回
class ProxyPoolService {
  constructor() {
    // L1 内存缓存
    this.proxyConfigs = new Map() // proxyId -> ProxyStaticConfig
    this.groupConfigs = new Map() // groupId -> ProxyGroup
    this.groupProxyIds = new Map() // groupId -> Set<proxyId>
    this.routeTable = new Map() // "groupId:contextKey" -> RouteEntry
    this.fallbackTable = new Map() // groupId(或 __all__) -> RouteEntry
    this.proxyStates = new Map() // "proxyId:contextKey" -> ProxyRuntimeState
    this.localVersion = 0
    this.statsDirty = new Set() // "proxyId:contextKey"

    this.subRedis = null // Pub/Sub 订阅专用连接
    this.syncTimer = null
    this.driftTimer = null
    this.isSyncing = false
    this.started = false
    this.enabled = config.proxy?.pool?.enabled !== false
  }

  // ========== 启动 / 停止 ==========
  async start() {
    if (this.started) {
      return
    }
    if (!this.enabled) {
      logger.info('🌐 Proxy pool disabled (config.proxy.pool.enabled=false)')
      return
    }
    // 先合并 Redis 持久化设置到 config，再注入核心算法配置
    await this._loadSettingsIntoConfig()
    configureCore(config.proxy?.pool?.core || {})
    await this.initialize()
    this._subscribePubSub()

    const syncIntervalMs = config.proxy?.pool?.statsSyncIntervalMs || 5000
    this.syncTimer = setInterval(() => {
      this.syncStatsToRedis().catch((error) =>
        logger.error('❌ [ProxyPool] stats sync failed:', error)
      )
    }, syncIntervalMs)

    const driftIntervalMs = config.proxy?.pool?.versionDriftIntervalMs || 60000
    this.driftTimer = setInterval(() => {
      this.checkVersionDrift().catch((error) =>
        logger.error('❌ [ProxyPool] version drift check failed:', error)
      )
    }, driftIntervalMs)

    this.started = true
    logger.success(
      `🌐 Proxy pool started shard=${SHARD_ID} proxies=${this.proxyConfigs.size} version=${this.localVersion}`
    )
  }

  stop() {
    if (this.syncTimer) {
      clearInterval(this.syncTimer)
      this.syncTimer = null
    }
    if (this.driftTimer) {
      clearInterval(this.driftTimer)
      this.driftTimer = null
    }
    if (this.subRedis) {
      try {
        this.subRedis.quit()
      } catch (error) {
        logger.error('❌ [ProxyPool] failed to quit sub connection:', error)
      }
      this.subRedis = null
    }
    this.started = false
  }

  // ========== 全局设置（健康检查 / 熔断 / 慢启动调优参数） ==========

  // 返回当前生效设置（env 默认已合并 Redis 覆盖），供管理后台展示与编辑
  getSettings() {
    const pool = config.proxy?.pool || {}
    const core = pool.core || {}
    // 用 ?? 而非 ||：slowStartDurationMs 等字段 0 是合法值，不能被 || 当成"缺失"回退到默认
    return {
      healthCheckEnabled: pool.healthCheckEnabled !== false,
      healthCheckIntervalMs: pool.healthCheckIntervalMs ?? 30000,
      healthCheckTimeoutMs: pool.healthCheckTimeoutMs ?? 10000,
      healthCheckUrl: pool.healthCheckUrl || 'https://api.anthropic.com',
      healthConcurrency: pool.healthConcurrency ?? 10,
      healthFailureThreshold: pool.healthFailureThreshold ?? 3,
      circuitFailureThreshold: core.circuitFailureThreshold ?? 5,
      circuitFailureWindowMs: core.circuitFailureWindowMs ?? 10000,
      circuitCooldownMs: core.circuitCooldownMs ?? 30000,
      slowStartDurationMs: core.slowStartDurationMs ?? 60000
    }
  }

  // 把归一化后的设置写进 config（健康字段 + core 字段），不触发 configureCore（由调用方决定时机）
  _applySettingsToConfig(settings) {
    const { pool } = config.proxy
    pool.healthCheckEnabled = settings.healthCheckEnabled
    pool.healthCheckIntervalMs = settings.healthCheckIntervalMs
    pool.healthCheckTimeoutMs = settings.healthCheckTimeoutMs
    pool.healthCheckUrl = settings.healthCheckUrl
    pool.healthConcurrency = settings.healthConcurrency
    pool.healthFailureThreshold = settings.healthFailureThreshold
    pool.core = pool.core || {}
    pool.core.circuitFailureThreshold = settings.circuitFailureThreshold
    pool.core.circuitFailureWindowMs = settings.circuitFailureWindowMs
    pool.core.circuitCooldownMs = settings.circuitCooldownMs
    pool.core.slowStartDurationMs = settings.slowStartDurationMs
  }

  // 保存设置到 Redis 并实时应用到本进程（核心算法立即生效；健康检查定时器由上层 reconfigure）
  // [人工决策-2026-06-02 23:50:38] 本服务为单进程部署、无多 worker，故设置只在当前进程立即生效，
  // 不做 pub/sub 跨 worker 广播；重启后由 _loadSettingsIntoConfig 从 Redis 恢复
  async applySettings(input) {
    const settings = normalizeProxyPoolSettings(input)
    await redis.setProxyPoolSettings(settings)
    this._applySettingsToConfig(settings)
    configureCore(config.proxy.pool.core)
    logger.info('🌐 [ProxyPool] settings applied (core reconfigured)')
    return this.getSettings()
  }

  // 启动时把 Redis 持久化设置合并进 config（configureCore 由 start() 统一调用）
  async _loadSettingsIntoConfig() {
    try {
      const saved = await redis.getProxyPoolSettings()
      if (saved) {
        this._applySettingsToConfig(normalizeProxyPoolSettings(saved))
        logger.info('🌐 [ProxyPool] persisted settings loaded from Redis')
      }
    } catch (error) {
      logger.error('❌ [ProxyPool] load settings failed, fallback to env defaults:', error)
    }
  }

  // ========== 冷加载 + 路由表重建 ==========
  async initialize() {
    await this.reloadFromRedis()
    await this._restoreContextStates()
    this.rebuildFallbackTable()
    this.rebuildAllContextRouteTables()
    this.localVersion = await redis.getProxyRouteVersion()
  }

  // 从 Redis 拉取静态配置到 L1（configs/groups/members）
  async reloadFromRedis() {
    const configs = await redis.getProxyConfigsAll()
    const groups = await redis.getProxyGroupsAll()

    this.proxyConfigs = new Map()
    for (const proxyConfig of configs) {
      this.proxyConfigs.set(proxyConfig.id, proxyConfig)
    }

    this.groupConfigs = new Map()
    this.groupProxyIds = new Map()
    for (const group of groups) {
      this.groupConfigs.set(group.id, group)
      const members = await redis.getProxyGroupMembers(group.id)
      this.groupProxyIds.set(group.id, new Set(members))
    }

    // 用 member sets 校正每个 config.groupIds（避免漂移）
    const reverseIndex = new Map() // proxyId -> Set<groupId>
    for (const [groupId, proxyIds] of this.groupProxyIds) {
      for (const proxyId of proxyIds) {
        if (!reverseIndex.has(proxyId)) {
          reverseIndex.set(proxyId, new Set())
        }
        reverseIndex.get(proxyId).add(groupId)
      }
    }
    for (const proxyConfig of this.proxyConfigs.values()) {
      proxyConfig.groupIds = reverseIndex.has(proxyConfig.id)
        ? Array.from(reverseIndex.get(proxyConfig.id))
        : []
    }
  }

  // 启动时从 Redis stats 恢复各 context 的运行时状态到 L1
  async _restoreContextStates() {
    const client = redis.getClientSafe()
    let cursor = '0'
    const prefix = RedisKeys.proxy.statsPrefix
    this.proxyStates = new Map()
    do {
      const [next, keys] = await client.scan(cursor, 'MATCH', `${prefix}*`, 'COUNT', 200)
      cursor = next
      for (const key of keys) {
        const parsed = this._parseStatsKey(key)
        if (!parsed || !this.proxyConfigs.has(parsed.proxyId)) {
          continue
        }
        const shardMap = await client.hgetall(key)
        const states = this._deserializeActiveShards(parsed.proxyId, parsed.contextKey, shardMap)
        if (states.length === 0) {
          continue
        }
        const merged = this._mergeShards(parsed.proxyId, parsed.contextKey, states)
        this.proxyStates.set(`${parsed.proxyId}:${parsed.contextKey}`, merged)
      }
    } while (cursor !== '0')
  }

  // 解析 stats key -> { proxyId, contextKey }；探针锁键返回 null
  _parseStatsKey(key) {
    const suffix = key.slice(RedisKeys.proxy.statsPrefix.length)
    if (suffix.endsWith(':probe')) {
      return null
    }
    const sepIndex = suffix.lastIndexOf(':')
    if (sepIndex <= 0) {
      return null
    }
    return { proxyId: suffix.slice(0, sepIndex), contextKey: suffix.slice(sepIndex + 1) }
  }

  // ========== 路由表重建 ==========
  _allProxyIds() {
    return Array.from(this.proxyConfigs.keys())
  }

  _isEligible(proxyConfig) {
    return proxyConfig && proxyConfig.status === ProxyStatus.ENABLED && proxyConfig.isHealthy
  }

  // Step 1: 静态配置兜底表（按 baseWeight，不分 context）
  rebuildFallbackTable() {
    this.fallbackTable.clear()
    for (const [groupId, group] of this.groupConfigs) {
      if (group.status !== 1) {
        continue
      }
      this._setFallback(groupId, this.groupProxyIds.get(groupId) || new Set())
    }
    // __all__ 伪分组
    this._setFallback(ALL_GROUP, new Set(this._allProxyIds()))
  }

  _setFallback(groupId, proxyIds) {
    const proxies = []
    for (const proxyId of proxyIds) {
      const proxyConfig = this.proxyConfigs.get(proxyId)
      if (this._isEligible(proxyConfig)) {
        proxies.push(buildWeightedProxy(proxyConfig))
      }
    }
    if (proxies.length > 0) {
      this.fallbackTable.set(groupId, buildRouteEntry(proxies))
    } else {
      this.fallbackTable.delete(groupId)
    }
  }

  // Step 2: per-context 路由表（叠加动态权重）
  rebuildAllContextRouteTables() {
    this.routeTable.clear()
    const contextKeys = new Set()
    for (const state of this.proxyStates.values()) {
      contextKeys.add(state.contextKey)
    }
    const groupIds = [...this.groupConfigs.keys(), ALL_GROUP]
    for (const groupId of groupIds) {
      for (const contextKey of contextKeys) {
        this.rebuildContextRouteEntry(groupId, contextKey)
      }
    }
  }

  rebuildContextRouteEntry(groupId, contextKey) {
    if (groupId !== ALL_GROUP) {
      const group = this.groupConfigs.get(groupId)
      if (!group || group.status !== 1) {
        this.routeTable.delete(`${groupId}:${contextKey}`)
        return
      }
    }
    const proxyIds = groupId === ALL_GROUP ? this._allProxyIds() : this.groupProxyIds.get(groupId)
    if (!proxyIds) {
      return
    }
    const proxies = []
    for (const proxyId of proxyIds) {
      const proxyConfig = this.proxyConfigs.get(proxyId)
      if (!this._isEligible(proxyConfig)) {
        continue
      }
      const state = this.proxyStates.get(`${proxyId}:${contextKey}`)
      if (state) {
        state.weight = computeDynamicWeight(proxyConfig.baseWeight, state)
      }
      const weightedProxy = buildWeightedProxy(proxyConfig, state)
      if (weightedProxy.weight > 0) {
        proxies.push(weightedProxy)
      }
    }
    const routeKey = `${groupId}:${contextKey}`
    if (proxies.length > 0) {
      this.routeTable.set(routeKey, buildRouteEntry(proxies))
    } else {
      this.routeTable.delete(routeKey)
    }
  }

  // 重建包含某代理的路由条目（指定 context 或全部 context）
  rebuildProxyRouteEntries(proxyId, contextKey) {
    const proxyConfig = this.proxyConfigs.get(proxyId)
    const affectedGroups =
      proxyConfig && proxyConfig.groupIds ? [...proxyConfig.groupIds, ALL_GROUP] : [ALL_GROUP]
    if (contextKey) {
      for (const groupId of affectedGroups) {
        this.rebuildContextRouteEntry(groupId, contextKey)
      }
      return
    }
    const contextKeys = new Set()
    for (const state of this.proxyStates.values()) {
      contextKeys.add(state.contextKey)
    }
    for (const groupId of affectedGroups) {
      for (const contextKey2 of contextKeys) {
        this.rebuildContextRouteEntry(groupId, contextKey2)
      }
      this._setFallback(
        groupId,
        groupId === ALL_GROUP
          ? new Set(this._allProxyIds())
          : this.groupProxyIds.get(groupId) || new Set()
      )
    }
  }

  // ========== 对外接口（读，热路径） ==========
  // 拿某分组 + context 下所有可用代理（已预计算、已排序、weight > 0）
  getAvailableProxies(groupId, contextKey) {
    const resolvedGroupId = groupId || ALL_GROUP
    const resolvedContextKey = validateContextKey(contextKey)
      ? contextKey
      : normalizeContextKey(contextKey)
    const entry = this.routeTable.get(`${resolvedGroupId}:${resolvedContextKey}`)
    if (entry) {
      return entry.proxies
    }
    const fallback = this.fallbackTable.get(resolvedGroupId)
    return fallback ? fallback.proxies : []
  }

  // O(1) 加权随机抽样
  sampleProxy(groupId, contextKey) {
    const resolvedGroupId = groupId || ALL_GROUP
    const resolvedContextKey = validateContextKey(contextKey)
      ? contextKey
      : normalizeContextKey(contextKey)
    const entry =
      this.routeTable.get(`${resolvedGroupId}:${resolvedContextKey}`) ||
      this.fallbackTable.get(resolvedGroupId)
    if (!entry) {
      return null
    }
    return entry.aliasTable.sample()
  }

  // 拿单个代理在指定 context 下的完整状态
  getProxy(proxyId, contextKey) {
    const proxyConfig = this.proxyConfigs.get(proxyId)
    if (!proxyConfig) {
      return null
    }
    const resolvedContextKey = validateContextKey(contextKey)
      ? contextKey
      : normalizeContextKey(contextKey)
    const state = this.proxyStates.get(`${proxyId}:${resolvedContextKey}`)
    if (!state) {
      // 未知 context：返回静态信息 + baseWeight
      return buildWeightedProxy(proxyConfig)
    }
    if (state.circuitBreaker.state === CircuitState.OPEN) {
      state.circuitBreaker.checkHalfOpen()
    }
    state.weight = computeDynamicWeight(proxyConfig.baseWeight, state)
    return buildWeightedProxy(proxyConfig, state)
  }

  // ========== 对外接口（写，fire-and-forget） ==========
  recordResult(
    proxyId,
    contextKey,
    success,
    latencyMs,
    statusCode,
    errorType,
    successIsTransport = false
  ) {
    const proxyConfig = this.proxyConfigs.get(proxyId)
    if (!proxyConfig) {
      return
    }
    const resolvedContextKey = validateContextKey(contextKey)
      ? contextKey
      : normalizeContextKey(contextKey)
    const stateKey = `${proxyId}:${resolvedContextKey}`
    let state = this.proxyStates.get(stateKey)
    const isNew = !state
    if (!state) {
      state = new ProxyRuntimeState(proxyId, resolvedContextKey)
      this.proxyStates.set(stateKey, state)
    }

    const oldWeight = state.weight
    const oldCircuitState = state.circuitBreaker.state

    const transportOk = successIsTransport ? success : isProxyTransportOk(success, statusCode)
    const resolvedErrorType = transportOk
      ? undefined
      : errorType || classifyProxyErrorFromStatus(statusCode)
    state.record(transportOk, latencyMs, resolvedErrorType)

    // 半开探针完成 -> 成功则慢启动恢复
    if (
      oldCircuitState === CircuitState.HALF_OPEN &&
      state.circuitBreaker.state === CircuitState.CLOSED
    ) {
      state.slowStart.start()
    }

    state.weight = computeDynamicWeight(proxyConfig.baseWeight, state)
    this.statsDirty.add(stateKey)

    if (isNew) {
      // 首次出现该 context -> 立即物化路由条目
      this.rebuildProxyRouteEntries(proxyId, resolvedContextKey)
      return
    }

    const circuitChanged = state.circuitBreaker.state !== oldCircuitState
    const weightChanged =
      Math.abs(state.weight - oldWeight) >= CORE_CONFIG.weightChangeThreshold ||
      (oldWeight > 0 && state.weight === 0) ||
      (oldWeight === 0 && state.weight > 0)
    if (circuitChanged || weightChanged) {
      this.rebuildProxyRouteEntries(proxyId, resolvedContextKey)
    }
    // 熔断变化 write-through，其他 worker 5s 内感知
    if (circuitChanged) {
      this._writeThroughState(stateKey, state)
    }
  }

  _writeThroughState(stateKey, state) {
    const sepIndex = stateKey.lastIndexOf(':')
    const proxyId = stateKey.slice(0, sepIndex)
    const contextKey = stateKey.slice(sepIndex + 1)
    const statsKey = RedisKeys.proxy.stats(proxyId, contextKey)
    const client = redis.getClient()
    if (!client) {
      return
    }
    state.lastActive = Date.now()
    client
      .multi()
      .hset(statsKey, SHARD_ID, state.serialize())
      .expire(statsKey, 120)
      .exec()
      .catch((error) => logger.error('❌ [ProxyPool] state write-through failed:', error))
  }

  // ========== 健康状态变化（健康检查服务回调） ==========
  // 仅在 isHealthy 翻转时写 Redis + publish，避免每轮健康检查都写库
  // failures/lastHealthCheck 维护在 leader 内存，重启重新探测即可
  async onHealthChanged(proxyId, healthy) {
    const proxyConfig = this.proxyConfigs.get(proxyId)
    if (!proxyConfig) {
      return
    }
    proxyConfig.lastHealthCheck = new Date().toISOString()

    if (healthy) {
      proxyConfig.healthCheckFailures = 0
      if (proxyConfig.isHealthy) {
        return
      }
      // 恢复健康 -> 各 context 慢启动 + 重建 + 持久化 + 广播
      proxyConfig.isHealthy = true
      await redis.setProxyConfig(proxyConfig)
      for (const [stateKey, state] of this.proxyStates) {
        if (stateKey.startsWith(`${proxyId}:`)) {
          state.slowStart.start()
          state.weight = computeDynamicWeight(proxyConfig.baseWeight, state)
          this._writeThroughState(stateKey, state)
        }
      }
      this.rebuildProxyRouteEntries(proxyId)
      await this._bumpAndPublish()
      logger.info(`🌐 [ProxyPool] proxy=${proxyId} recovered isHealthy=true`)
      return
    }

    // 不健康路径：累加连续失败，达阈值才隔离
    proxyConfig.healthCheckFailures = (proxyConfig.healthCheckFailures || 0) + 1
    const threshold = config.proxy?.pool?.healthFailureThreshold || 3
    if (proxyConfig.healthCheckFailures >= threshold && proxyConfig.isHealthy) {
      proxyConfig.isHealthy = false
      await redis.setProxyConfig(proxyConfig)
      this.rebuildProxyRouteEntries(proxyId)
      await this._bumpAndPublish()
      logger.warn(
        `🌐 [ProxyPool] proxy=${proxyId} isolated isHealthy=false failures=${proxyConfig.healthCheckFailures}`
      )
    }
  }

  // ========== CRUD（写 Redis + bump version + publish + 本地重建） ==========
  async createProxy(input) {
    if (!validateProxyUrl(input.url)) {
      throw new Error('Invalid proxy url')
    }
    const now = new Date().toISOString()
    const proxyId = uuidv4()
    const groupIds = Array.isArray(input.groupIds)
      ? input.groupIds.filter((groupId) => this.groupConfigs.has(groupId))
      : []
    const proxyConfig = {
      id: proxyId,
      name: input.name || maskProxyUrl(input.url),
      url: input.url.trim(),
      status: ProxyStatus.ENABLED,
      isHealthy: true,
      healthCheckFailures: 0,
      lastHealthCheck: null,
      totalRequests: 0,
      successRequests: 0,
      avgLatencyMs: 0,
      baseWeight: typeof input.baseWeight === 'number' ? input.baseWeight : DEFAULT_BASE_WEIGHT,
      softConcurrencyLimit: 0,
      hardConcurrencyLimit: 0,
      lastCapacityProbe: null,
      groupIds,
      createdAt: now,
      updatedAt: now
    }
    await redis.setProxyConfig(proxyConfig)
    for (const groupId of groupIds) {
      await redis.addProxyGroupMember(groupId, proxyId)
    }
    this._applyLocalProxyUpsert(proxyConfig)
    await this._bumpAndPublish()
    logger.info(`🌐 [ProxyPool] proxy created id=${proxyId} groups=${groupIds.length}`)
    return proxyConfig
  }

  async updateProxy(proxyId, updates) {
    const proxyConfig = this.proxyConfigs.get(proxyId)
    if (!proxyConfig) {
      throw new Error('Proxy not found')
    }
    // 列表接口返回脱敏 url，前端编辑时原样回填提交。提交值等于当前 url 的脱敏形态时，
    // 说明用户没改地址（只改了名称/分组），保留真实凭据；脱敏占位本身可能不合法（含 *** 或省略默认端口），
    // 故必须先判等短路、再校验，绝不能用脱敏占位覆盖真实凭据
    if (updates.url !== undefined && updates.url.trim() !== maskProxyUrl(proxyConfig.url)) {
      if (!validateProxyUrl(updates.url)) {
        throw new Error('Invalid proxy url')
      }
      proxyConfig.url = updates.url.trim()
    }
    if (updates.name !== undefined) {
      proxyConfig.name = updates.name
    }
    if (updates.status !== undefined && [1, 2, 3].includes(updates.status)) {
      proxyConfig.status = updates.status
    }
    if (typeof updates.baseWeight === 'number') {
      proxyConfig.baseWeight = Math.max(0, Math.min(100, updates.baseWeight))
    }
    // 分组成员调整
    if (Array.isArray(updates.groupIds)) {
      const nextGroups = updates.groupIds.filter((groupId) => this.groupConfigs.has(groupId))
      const oldSet = new Set(proxyConfig.groupIds || [])
      const nextSet = new Set(nextGroups)
      for (const groupId of oldSet) {
        if (!nextSet.has(groupId)) {
          await redis.removeProxyGroupMember(groupId, proxyId)
        }
      }
      for (const groupId of nextSet) {
        if (!oldSet.has(groupId)) {
          await redis.addProxyGroupMember(groupId, proxyId)
        }
      }
      proxyConfig.groupIds = nextGroups
    }
    proxyConfig.updatedAt = new Date().toISOString()
    await redis.setProxyConfig(proxyConfig)
    this._applyLocalProxyUpsert(proxyConfig)
    await this._bumpAndPublish()
    return proxyConfig
  }

  async deleteProxy(proxyId) {
    const proxyConfig = this.proxyConfigs.get(proxyId)
    if (!proxyConfig) {
      return
    }
    await redis.removeProxyFromAllGroups(proxyId, proxyConfig.groupIds || [])
    await redis.deleteProxyConfig(proxyId)
    this.proxyConfigs.delete(proxyId)
    for (const proxyIds of this.groupProxyIds.values()) {
      proxyIds.delete(proxyId)
    }
    for (const stateKey of [...this.proxyStates.keys()]) {
      if (stateKey.startsWith(`${proxyId}:`)) {
        this.proxyStates.delete(stateKey)
        this.statsDirty.delete(stateKey)
      }
    }
    this.rebuildFallbackTable()
    this.rebuildAllContextRouteTables()
    await this._bumpAndPublish()
    logger.info(`🌐 [ProxyPool] proxy deleted id=${proxyId}`)
  }

  async createGroup(input) {
    const now = new Date().toISOString()
    const groupId = uuidv4()
    const group = {
      id: groupId,
      name: input.name || 'group',
      description: input.description || '',
      status: input.status === 0 ? 0 : 1,
      sort: typeof input.sort === 'number' ? input.sort : 0,
      createdAt: now,
      updatedAt: now
    }
    await redis.setProxyGroup(group)
    this.groupConfigs.set(groupId, group)
    this.groupProxyIds.set(groupId, new Set())
    await this._bumpAndPublish()
    logger.info(`🌐 [ProxyPool] group created id=${groupId}`)
    return group
  }

  async updateGroup(groupId, updates) {
    const group = this.groupConfigs.get(groupId)
    if (!group) {
      throw new Error('Group not found')
    }
    if (updates.name !== undefined) {
      group.name = updates.name
    }
    if (updates.description !== undefined) {
      group.description = updates.description
    }
    if (updates.status !== undefined) {
      group.status = updates.status === 0 ? 0 : 1
    }
    if (typeof updates.sort === 'number') {
      group.sort = updates.sort
    }
    group.updatedAt = new Date().toISOString()
    await redis.setProxyGroup(group)
    this.groupConfigs.set(groupId, group)
    this.rebuildFallbackTable()
    this.rebuildAllContextRouteTables()
    await this._bumpAndPublish()
    return group
  }

  async deleteGroup(groupId) {
    const group = this.groupConfigs.get(groupId)
    if (!group) {
      return
    }
    const members = this.groupProxyIds.get(groupId) || new Set()
    await redis.deleteProxyGroup(groupId)
    // 从受影响代理的 groupIds 移除
    for (const proxyId of members) {
      const proxyConfig = this.proxyConfigs.get(proxyId)
      if (proxyConfig && Array.isArray(proxyConfig.groupIds)) {
        proxyConfig.groupIds = proxyConfig.groupIds.filter((id) => id !== groupId)
        await redis.setProxyConfig(proxyConfig)
      }
    }
    this.groupConfigs.delete(groupId)
    this.groupProxyIds.delete(groupId)
    this.rebuildFallbackTable()
    this.rebuildAllContextRouteTables()
    await this._bumpAndPublish()
    logger.info(`🌐 [ProxyPool] group deleted id=${groupId}`)
  }

  // 本地 upsert 一个代理配置并维护分组索引
  _applyLocalProxyUpsert(proxyConfig) {
    this.proxyConfigs.set(proxyConfig.id, proxyConfig)
    for (const proxyIds of this.groupProxyIds.values()) {
      proxyIds.delete(proxyConfig.id)
    }
    for (const groupId of proxyConfig.groupIds || []) {
      if (!this.groupProxyIds.has(groupId)) {
        this.groupProxyIds.set(groupId, new Set())
      }
      this.groupProxyIds.get(groupId).add(proxyConfig.id)
    }
    this.rebuildFallbackTable()
    this.rebuildAllContextRouteTables()
  }

  async _bumpAndPublish() {
    try {
      const version = await redis.incrProxyRouteVersion()
      this.localVersion = version
      await redis.publishProxyConfigChanged(version)
    } catch (error) {
      logger.error('❌ [ProxyPool] bump/publish failed:', error)
    }
  }

  // ========== Pub/Sub 一致性 ==========
  _subscribePubSub() {
    try {
      const client = redis.getClient()
      if (!client) {
        return
      }
      this.subRedis = client.duplicate()
      this.subRedis.on('error', (error) => logger.error('❌ [ProxyPool] pub/sub error:', error))
      this.subRedis.subscribe(RedisKeys.proxy.configChangedChannel, (error) => {
        if (error) {
          logger.error('❌ [ProxyPool] pub/sub subscribe failed:', error)
        }
      })
      this.subRedis.on('message', (channel) => {
        if (channel === RedisKeys.proxy.configChangedChannel) {
          this.handleConfigChanged().catch((error) =>
            logger.error('❌ [ProxyPool] handleConfigChanged failed:', error)
          )
        }
      })
    } catch (error) {
      logger.error('❌ [ProxyPool] pub/sub setup failed:', error)
    }
  }

  async handleConfigChanged() {
    const remoteVersion = await redis.getProxyRouteVersion()
    if (remoteVersion <= this.localVersion) {
      return
    }
    await this.reloadFromRedis()
    this.rebuildFallbackTable()
    this.rebuildAllContextRouteTables()
    this.localVersion = remoteVersion
    logger.debug(`🌐 [ProxyPool] config reloaded version=${remoteVersion}`)
  }

  async checkVersionDrift() {
    const remoteVersion = await redis.getProxyRouteVersion()
    if (remoteVersion > this.localVersion) {
      logger.info(
        `🌐 [ProxyPool] version drift local=${this.localVersion} remote=${remoteVersion}, rebuilding`
      )
      await this.handleConfigChanged()
    }
  }

  // ========== 统计写回（5s cron） ==========
  async syncStatsToRedis() {
    if (this.isSyncing || !this.started) {
      return
    }
    this.isSyncing = true
    const client = redis.getClient()
    if (!client) {
      this.isSyncing = false
      return
    }

    try {
      // Phase 1: 写本 worker 的脏状态
      const dirtyKeys = this.statsDirty
      this.statsDirty = new Set()
      if (dirtyKeys.size > 0) {
        const pipeline = client.pipeline()
        for (const stateKey of dirtyKeys) {
          const state = this.proxyStates.get(stateKey)
          if (!state) {
            continue
          }
          const sepIndex = stateKey.lastIndexOf(':')
          const proxyId = stateKey.slice(0, sepIndex)
          const contextKey = stateKey.slice(sepIndex + 1)
          const statsKey = RedisKeys.proxy.stats(proxyId, contextKey)
          state.lastActive = Date.now()
          pipeline.hset(statsKey, SHARD_ID, state.serialize())
          pipeline.expire(statsKey, 120)
        }
        await pipeline.exec()
      }

      // Phase 2: 扫描所有分片，聚合更新 L1
      let cursor = '0'
      const prefix = RedisKeys.proxy.statsPrefix
      do {
        const [next, keys] = await client.scan(cursor, 'MATCH', `${prefix}*`, 'COUNT', 200)
        cursor = next
        for (const key of keys) {
          const parsed = this._parseStatsKey(key)
          if (!parsed || !this.proxyConfigs.has(parsed.proxyId)) {
            continue
          }
          const shardMap = await client.hgetall(key)
          this._reconcileShards(parsed.proxyId, parsed.contextKey, key, shardMap)
        }
      } while (cursor !== '0')
    } finally {
      this.isSyncing = false
    }
  }

  // 反序列化活跃分片，过滤死分片
  _deserializeActiveShards(proxyId, contextKey, shardMap) {
    const states = []
    const now = Date.now()
    for (const json of Object.values(shardMap || {})) {
      const state = ProxyRuntimeState.deserialize(proxyId, contextKey, json)
      if (now - state.lastActive <= CORE_CONFIG.shardActiveMs) {
        states.push(state)
      }
    }
    return states
  }

  // 聚合多个分片为一个全局视图状态（熔断取最严重）
  _mergeShards(proxyId, _contextKey, states) {
    const severity = { closed: 0, half_open: 1, open: 2 }
    const base = states.reduce((a, b) => (a.lastActive > b.lastActive ? a : b))
    for (const state of states) {
      if (severity[state.circuitBreaker.state] > severity[base.circuitBreaker.state]) {
        base.circuitBreaker = state.circuitBreaker
      }
    }
    const proxyConfig = this.proxyConfigs.get(proxyId)
    if (proxyConfig) {
      const aggregated = aggregateShardStats(states)
      base.weight = computeDynamicWeight(proxyConfig.baseWeight, base, aggregated)
    }
    return base
  }

  _reconcileShards(proxyId, contextKey, statsKey, shardMap) {
    const client = redis.getClient()
    const now = Date.now()
    const activeStates = []
    const staleFields = []
    for (const [field, json] of Object.entries(shardMap || {})) {
      const state = ProxyRuntimeState.deserialize(proxyId, contextKey, json)
      if (now - state.lastActive <= CORE_CONFIG.shardActiveMs) {
        activeStates.push(state)
      } else {
        staleFields.push(field)
      }
    }
    if (staleFields.length > 0 && client) {
      client
        .hdel(statsKey, ...staleFields)
        .catch((error) => logger.error('❌ [ProxyPool] hdel stale shard failed:', error))
    }

    const stateKey = `${proxyId}:${contextKey}`
    if (activeStates.length === 0) {
      // 全部死分片 -> GC 本地状态
      if (this.proxyStates.has(stateKey)) {
        this.proxyStates.delete(stateKey)
        this.statsDirty.delete(stateKey)
        this.rebuildProxyRouteEntries(proxyId, contextKey)
      }
      return
    }

    const merged = this._mergeShards(proxyId, contextKey, activeStates)
    this.proxyStates.set(stateKey, merged)
    this.rebuildProxyRouteEntries(proxyId, contextKey)
  }

  // ========== 只读访问器（健康检查 / 管理后台用） ==========
  getEnabledProxyConfigs() {
    return Array.from(this.proxyConfigs.values()).filter(
      (proxyConfig) => proxyConfig.status === ProxyStatus.ENABLED
    )
  }

  getAllProxyConfigs() {
    return Array.from(this.proxyConfigs.values())
  }

  getProxyConfig(proxyId) {
    return this.proxyConfigs.get(proxyId) || null
  }

  getGroupsList() {
    return Array.from(this.groupConfigs.values()).sort((a, b) => (a.sort || 0) - (b.sort || 0))
  }

  getGroupMembers(groupId) {
    return Array.from(this.groupProxyIds.get(groupId) || [])
  }

  // 某代理所有 context 的运行时指标快照（管理后台展示）
  getProxyStatesSnapshot(proxyId) {
    const result = []
    for (const [stateKey, state] of this.proxyStates) {
      if (!stateKey.startsWith(`${proxyId}:`)) {
        continue
      }
      const stat5m = state.window5m.getStats()
      result.push({
        contextKey: state.contextKey,
        weight: state.weight,
        circuitState: state.circuitBreaker.state,
        requests5m: stat5m.requests,
        successRate5m: stat5m.successRate,
        avgLatencyMs: Math.round(stat5m.avgLatency),
        p99LatencyMs: stat5m.p99
      })
    }
    return result
  }
}

module.exports = new ProxyPoolService()
