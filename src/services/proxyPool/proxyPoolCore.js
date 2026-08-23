// 代理池核心算法 — 纯模块，零外部依赖（仅用运行时 Date.now / Math.random）
// 忠实移植自 llysc proxy_pool_core，CommonJS 版本
// 内容：滑动窗口统计、熔断器、慢启动、动态权重、Vose Alias Table、per-context 运行时状态

// 代理状态枚举：1 启用 2 禁用 3 故障
const ProxyStatus = { ENABLED: 1, DISABLED: 2, FAULT: 3 }

// 熔断器状态机
const CircuitState = { CLOSED: 'closed', OPEN: 'open', HALF_OPEN: 'half_open' }

// 错误类型（用于异常检测与降权告警）
const ProxyErrorType = {
  TIMEOUT: 'timeout',
  CONN_REFUSED: 'conn_refused',
  DNS: 'dns',
  TLS: 'tls',
  BANNED: 'banned', // 403/429 等明确封禁
  UPSTREAM_5XX: 'upstream_5xx',
  OTHER: 'other'
}

// 可配置阈值（默认还原 llysc，服务层启动时用 configureCore 覆盖）
const CORE_CONFIG = {
  circuitFailureThreshold: 5, // 熔断触发：窗口内失败次数
  circuitFailureWindowMs: 10000, // 熔断失败计数窗口
  circuitCooldownMs: 30000, // 熔断冷却期（open -> half_open）
  slowStartDurationMs: 60000, // 慢启动爬坡时长
  slowStartMinFactor: 0.1, // 慢启动起始系数
  windowLatencyCap: 50, // 每个滑动窗口保留的延迟样本上限（控制序列化体积）
  weightChangeThreshold: 10, // 权重变化超过此值才触发路由表局部重建
  shardActiveMs: 30000 // 分片活跃判定（超过则视为死分片）
}

// 服务层启动时注入配置
const configureCore = (partial) => {
  if (!partial || typeof partial !== 'object') {
    return
  }
  for (const configKey of Object.keys(CORE_CONFIG)) {
    if (typeof partial[configKey] === 'number' && Number.isFinite(partial[configKey])) {
      CORE_CONFIG[configKey] = partial[configKey]
    }
  }
}

// ========== 滑动窗口 ==========
// 环形缓冲区实现：定长 bucketCount 个桶，时间驱动滚动，内存占用固定
class SlidingWindow {
  constructor(windowMs, bucketCount = 60) {
    this.windowMs = windowMs
    this.bucketCount = bucketCount
    this.bucketMs = windowMs / bucketCount
    this.buckets = []
    for (let i = 0; i < bucketCount; i++) {
      this.buckets.push({ ts: 0, requests: 0, successes: 0, totalLatency: 0 })
    }
    // 近期延迟样本（用于百分位），定长滚动
    this.latencies = []
  }

  // 取当前时间对应的桶，过期则原地重置
  _rollBucket(now) {
    const bucketStart = Math.floor(now / this.bucketMs) * this.bucketMs
    const idx = Math.floor(now / this.bucketMs) % this.bucketCount
    const b = this.buckets[idx]
    if (b.ts !== bucketStart) {
      b.ts = bucketStart
      b.requests = 0
      b.successes = 0
      b.totalLatency = 0
    }
    return b
  }

  record(success, latencyMs, now = Date.now()) {
    const b = this._rollBucket(now)
    b.requests += 1
    if (success) {
      b.successes += 1
    }
    b.totalLatency += latencyMs
    this.latencies.push(latencyMs)
    if (this.latencies.length > CORE_CONFIG.windowLatencyCap) {
      this.latencies.shift()
    }
  }

  getStats(now = Date.now()) {
    const cutoff = now - this.windowMs
    let requests = 0
    let successes = 0
    let totalLatency = 0
    for (const bucket of this.buckets) {
      if (bucket.ts > 0 && bucket.ts >= cutoff) {
        requests += bucket.requests
        successes += bucket.successes
        totalLatency += bucket.totalLatency
      }
    }
    const successRate = requests > 0 ? successes / requests : 1
    const avgLatency = requests > 0 ? totalLatency / requests : 0
    const sorted = this.latencies.slice().sort((a, b) => a - b)
    return {
      requests,
      successes,
      successRate,
      avgLatency,
      p50: percentile(sorted, 0.5),
      p95: percentile(sorted, 0.95),
      p99: percentile(sorted, 0.99)
    }
  }

  toJSON() {
    return { buckets: this.buckets, latencies: this.latencies }
  }

  static fromJSON(windowMs, bucketCount, data) {
    const slidingWindow = new SlidingWindow(windowMs, bucketCount)
    if (data && Array.isArray(data.buckets) && data.buckets.length === bucketCount) {
      slidingWindow.buckets = data.buckets.map((bucket) => ({
        ts: Number(bucket.ts) || 0,
        requests: Number(bucket.requests) || 0,
        successes: Number(bucket.successes) || 0,
        totalLatency: Number(bucket.totalLatency) || 0
      }))
    }
    if (data && Array.isArray(data.latencies)) {
      slidingWindow.latencies = data.latencies.slice(-CORE_CONFIG.windowLatencyCap).map(Number)
    }
    return slidingWindow
  }
}

// 从已排序数组取百分位
const percentile = (sorted, p) => {
  if (!sorted || sorted.length === 0) {
    return 0
  }
  const idx = Math.min(sorted.length - 1, Math.floor(p * sorted.length))
  return sorted[idx]
}

// ========== 熔断器 ==========
// 实时心电监护：滑动窗口内失败达阈值 -> open；冷却后 half_open 放一个探针；探针成功 -> closed
class CircuitBreaker {
  constructor() {
    this.state = CircuitState.CLOSED
    this.failureCount = 0
    this.lastFailureTime = 0
    this.openedAt = 0
    this.probeInFlight = false
  }

  recordSuccess() {
    if (this.state === CircuitState.HALF_OPEN) {
      this.state = CircuitState.CLOSED
      this.probeInFlight = false
    }
    this.failureCount = 0
  }

  recordFailure() {
    const now = Date.now()
    if (now - this.lastFailureTime > CORE_CONFIG.circuitFailureWindowMs) {
      this.failureCount = 0
    }
    this.failureCount += 1
    this.lastFailureTime = now

    if (this.state === CircuitState.HALF_OPEN) {
      // 半开探针失败 -> 重新断开，重置冷却期
      this.state = CircuitState.OPEN
      this.openedAt = now
      this.probeInFlight = false
      return
    }
    if (
      this.state === CircuitState.CLOSED &&
      this.failureCount >= CORE_CONFIG.circuitFailureThreshold
    ) {
      this.state = CircuitState.OPEN
      this.openedAt = now
    }
  }

  // 冷却期满则进入半开，返回是否发生状态切换
  checkHalfOpen() {
    if (
      this.state === CircuitState.OPEN &&
      Date.now() - this.openedAt >= CORE_CONFIG.circuitCooldownMs
    ) {
      this.state = CircuitState.HALF_OPEN
      this.probeInFlight = false
      return true
    }
    return false
  }

  // 半开期只放一个探针
  // [人工决策-2026-06-05 11:42:11] 已知问题：本方法是死代码，全仓零调用。半开期本应靠它把
  //   probeInFlight 置 true 以「只放一个探针」，但无人调用，而 computeDynamicWeight 在 HALF_OPEN
  //   时只读 probeInFlight（恒为 false）→ 权重恒为 1 → 半开期会放多个并发探针而非一个，单探针闸门
  //   实际未生效。根因同 proxyResolver.report() 死链（见该处 [人工决策] 注释）：业务流量从不回写代理池，
  //   熔断/半开状态机对真实流量整体未驱动。接 report() 接线时应一并修复（在半开期入选前调 tryAcquireProbe
  //   做准入）。详见本次审计 #2。
  tryAcquireProbe() {
    if (this.state !== CircuitState.HALF_OPEN) {
      return false
    }
    if (this.probeInFlight) {
      return false
    }
    this.probeInFlight = true
    return true
  }

  toJSON() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime,
      openedAt: this.openedAt,
      probeInFlight: this.probeInFlight
    }
  }

  static fromJSON(data) {
    const cb = new CircuitBreaker()
    if (data) {
      cb.state = data.state || CircuitState.CLOSED
      cb.failureCount = Number(data.failureCount) || 0
      cb.lastFailureTime = Number(data.lastFailureTime) || 0
      cb.openedAt = Number(data.openedAt) || 0
      cb.probeInFlight = !!data.probeInFlight
    }
    return cb
  }
}

// ========== 慢启动 ==========
// 代理刚恢复/加入时流量线性爬坡，避免瞬间打满再次挂掉
class SlowStart {
  constructor() {
    this.startTime = 0
    this.active = false
  }

  start() {
    this.startTime = Date.now()
    this.active = true
  }

  getFactor() {
    if (!this.active) {
      return 1.0
    }
    const elapsed = Date.now() - this.startTime
    if (elapsed >= CORE_CONFIG.slowStartDurationMs) {
      this.active = false
      return 1.0
    }
    const min = CORE_CONFIG.slowStartMinFactor
    return min + (1.0 - min) * (elapsed / CORE_CONFIG.slowStartDurationMs)
  }

  toJSON() {
    return { startTime: this.startTime, active: this.active }
  }

  static fromJSON(data) {
    const ss = new SlowStart()
    if (data) {
      ss.startTime = Number(data.startTime) || 0
      ss.active = !!data.active
    }
    return ss
  }
}

// ========== per-context 运行时状态 ==========
// key = "proxyId:contextKey"，每请求原地更新，定时序列化回写 Redis
class ProxyRuntimeState {
  constructor(proxyId, contextKey) {
    this.proxyId = proxyId
    this.contextKey = contextKey
    this.window1m = new SlidingWindow(60000)
    this.window5m = new SlidingWindow(300000)
    this.window15m = new SlidingWindow(900000)
    this.circuitBreaker = new CircuitBreaker()
    this.slowStart = new SlowStart()
    this.weight = 0
    this.lastActive = 0
  }

  // transportOk: 代理传输层是否送达（业务流量收到响应即 true；探测按结果）
  record(transportOk, latencyMs, _errorType) {
    const now = Date.now()
    this.window1m.record(transportOk, latencyMs, now)
    this.window5m.record(transportOk, latencyMs, now)
    this.window15m.record(transportOk, latencyMs, now)
    if (transportOk) {
      this.circuitBreaker.recordSuccess()
    } else {
      this.circuitBreaker.recordFailure()
    }
    this.lastActive = now
  }

  serialize() {
    return JSON.stringify({
      w1: this.window1m.toJSON(),
      w5: this.window5m.toJSON(),
      w15: this.window15m.toJSON(),
      cb: this.circuitBreaker.toJSON(),
      ss: this.slowStart.toJSON(),
      weight: this.weight,
      lastActive: this.lastActive
    })
  }

  static deserialize(proxyId, contextKey, json) {
    const state = new ProxyRuntimeState(proxyId, contextKey)
    try {
      const data = typeof json === 'string' ? JSON.parse(json) : json
      if (data) {
        state.window1m = SlidingWindow.fromJSON(60000, 60, data.w1)
        state.window5m = SlidingWindow.fromJSON(300000, 60, data.w5)
        state.window15m = SlidingWindow.fromJSON(900000, 60, data.w15)
        state.circuitBreaker = CircuitBreaker.fromJSON(data.cb)
        state.slowStart = SlowStart.fromJSON(data.ss)
        state.weight = Number(data.weight) || 0
        state.lastActive = Number(data.lastActive) || 0
      }
    } catch (e) {
      // 反序列化失败返回空状态
    }
    return state
  }
}

// ========== 动态权重 ==========
// 连续体替代二元状态：weight = baseWeight * health * latency * successRate * slowStart
const computeHealthFactor = (successRate1m) => {
  if (successRate1m >= 0.99) {
    return 1.0
  }
  if (successRate1m >= 0.95) {
    return 0.8
  }
  if (successRate1m >= 0.9) {
    return 0.7
  }
  if (successRate1m >= 0.8) {
    return 0.5
  }
  if (successRate1m >= 0.5) {
    return 0.3
  }
  return 0
}

const computeLatencyFactor = (p99Ms) => {
  if (p99Ms <= 0) {
    return 1.0
  }
  if (p99Ms <= 200) {
    return 1.0
  }
  if (p99Ms <= 500) {
    return 0.8
  }
  if (p99Ms <= 1000) {
    return 0.6
  }
  if (p99Ms <= 3000) {
    return 0.3
  }
  return 0.1
}

const computeSuccessRateFactor = (rate5m) => {
  if (rate5m >= 0.99) {
    return 1.0
  }
  if (rate5m >= 0.95) {
    return 0.8
  }
  if (rate5m >= 0.9) {
    return 0.6
  }
  if (rate5m >= 0.8) {
    return 0.5
  }
  return 0.3
}

// aggregated 为跨 worker 分片聚合后的全局视图（可选）
const computeDynamicWeight = (baseWeight, state, aggregated) => {
  // 熔断断开 -> 权重 0（先尝试进入半开）
  if (state.circuitBreaker.state === CircuitState.OPEN) {
    state.circuitBreaker.checkHalfOpen()
    if (state.circuitBreaker.state === CircuitState.OPEN) {
      return 0
    }
  }
  // 半开：只允许一个探针，给极低权重让 Alias Table 仍能抽中
  if (state.circuitBreaker.state === CircuitState.HALF_OPEN) {
    if (state.circuitBreaker.probeInFlight) {
      return 0
    }
    return 1
  }

  const stats1m = aggregated
    ? {
        requests: aggregated.requests1m,
        successRate: aggregated.successRate1m,
        p99: aggregated.p99Latency1m
      }
    : state.window1m.getStats()
  const stats5m = aggregated
    ? { requests: aggregated.requests5m, successRate: aggregated.successRate5m }
    : state.window5m.getStats()

  const slowStartFactor = state.slowStart.getFactor()

  // 无数据 -> baseWeight * 慢启动系数
  if (stats5m.requests === 0 && stats1m.requests === 0) {
    return Math.round(baseWeight * slowStartFactor)
  }

  const healthFactor = stats1m.requests > 0 ? computeHealthFactor(stats1m.successRate) : 1.0
  const latencyFactor = stats1m.requests > 0 ? computeLatencyFactor(stats1m.p99) : 1.0
  const successRateFactor =
    stats5m.requests > 0 ? computeSuccessRateFactor(stats5m.successRate) : 1.0

  const weight = Math.round(
    baseWeight * healthFactor * latencyFactor * successRateFactor * slowStartFactor
  )
  return Math.max(0, Math.min(100, weight))
}

// 跨分片聚合：把多个 worker 的同一 proxyId:contextKey 状态合并为全局视图
const aggregateShardStats = (states, now = Date.now()) => {
  const aggregateWindow = (windowKey) => {
    let requests = 0
    let successes = 0
    let latencies = []
    for (const state of states) {
      const stat = state[windowKey].getStats(now)
      requests += stat.requests
      successes += stat.successes
      latencies = latencies.concat(state[windowKey].latencies)
    }
    latencies.sort((a, b) => a - b)
    return {
      requests,
      successRate: requests > 0 ? successes / requests : 1,
      p99: percentile(latencies, 0.99)
    }
  }
  const agg1m = aggregateWindow('window1m')
  const agg5m = aggregateWindow('window5m')
  return {
    requests1m: agg1m.requests,
    successRate1m: agg1m.successRate,
    p99Latency1m: agg1m.p99,
    requests5m: agg5m.requests,
    successRate5m: agg5m.successRate
  }
}

// ========== Vose's Alias Table ==========
// O(1) 加权随机抽样，路由表重建时一次性构建
class AliasTable {
  constructor(items) {
    this.items = items || []
    this.n = this.items.length
    this.prob = new Float64Array(this.n)
    this.alias = new Int32Array(this.n)
    if (this.n === 0) {
      return
    }
    const totalWeight = this.items.reduce((sum, p) => sum + (p.weight > 0 ? p.weight : 0), 0)
    if (totalWeight <= 0) {
      // 全 0 权重退化为均匀分布
      this.prob.fill(1.0)
      this.alias.fill(0)
      return
    }
    const scaled = this.items.map((p) => ((p.weight > 0 ? p.weight : 0) / totalWeight) * this.n)
    const small = []
    const large = []
    for (let i = 0; i < this.n; i++) {
      if (scaled[i] < 1.0) {
        small.push(i)
      } else {
        large.push(i)
      }
    }
    while (small.length > 0 && large.length > 0) {
      const smallIndex = small.pop()
      const largeIndex = large.pop()
      this.prob[smallIndex] = scaled[smallIndex]
      this.alias[smallIndex] = largeIndex
      scaled[largeIndex] = scaled[largeIndex] + scaled[smallIndex] - 1.0
      if (scaled[largeIndex] < 1.0) {
        small.push(largeIndex)
      } else {
        large.push(largeIndex)
      }
    }
    while (large.length > 0) {
      this.prob[large.pop()] = 1.0
    }
    while (small.length > 0) {
      this.prob[small.pop()] = 1.0
    }
  }

  sample() {
    if (this.n === 0) {
      return null
    }
    const i = Math.floor(Math.random() * this.n)
    return Math.random() < this.prob[i] ? this.items[i] : this.items[this.alias[i]]
  }
}

// ========== 构建路由条目 ==========
// 由静态配置 + 可选 per-context 运行时状态生成一个加权代理视图
const buildWeightedProxy = (config, state) => {
  if (!state) {
    return {
      id: config.id,
      url: config.url,
      isHealthy: !!config.isHealthy,
      weight: config.baseWeight,
      avgLatencyMs: 0,
      successRate: 1,
      groupIds: config.groupIds || [],
      softConcurrencyLimit: config.softConcurrencyLimit || 0,
      hardConcurrencyLimit: config.hardConcurrencyLimit || 0,
      circuitState: CircuitState.CLOSED
    }
  }
  const stat5m = state.window5m.getStats()
  return {
    id: config.id,
    url: config.url,
    isHealthy: !!config.isHealthy,
    weight: state.weight,
    avgLatencyMs: Math.round(stat5m.avgLatency),
    successRate: stat5m.successRate,
    groupIds: config.groupIds || [],
    softConcurrencyLimit: config.softConcurrencyLimit || 0,
    hardConcurrencyLimit: config.hardConcurrencyLimit || 0,
    circuitState: state.circuitBreaker.state
  }
}

// 路由条目 = 按权重降序的列表 + Alias Table
const buildRouteEntry = (proxies) => {
  const sorted = proxies.slice().sort((a, b) => b.weight - a.weight)
  return { proxies: sorted, aliasTable: new AliasTable(sorted) }
}

// ========== 传输裁决与错误分类 ==========
// 业务流量：收到任何 HTTP 响应都视为代理传输成功（上游 4xx/5xx 不归咎于代理）
// 仅明确封禁状态码（403/429）和连接级错误才判失败
const isProxyTransportOk = (success, statusCode) => {
  if (typeof statusCode === 'number' && statusCode > 0) {
    // 收到响应即代理可达；403/429 视为代理被封禁 -> 失败
    if (statusCode === 403 || statusCode === 429) {
      return false
    }
    return true
  }
  return !!success
}

const classifyProxyErrorFromStatus = (statusCode) => {
  if (statusCode === 403 || statusCode === 429) {
    return ProxyErrorType.BANNED
  }
  if (typeof statusCode === 'number' && statusCode >= 500) {
    return ProxyErrorType.UPSTREAM_5XX
  }
  return ProxyErrorType.OTHER
}

const classifyProxyError = (statusCode, error) => {
  if (statusCode) {
    return classifyProxyErrorFromStatus(statusCode)
  }
  const msg = (error && (error.code || error.message || '')).toString().toLowerCase()
  if (msg.includes('timeout') || msg.includes('etimedout') || msg.includes('aborted')) {
    return ProxyErrorType.TIMEOUT
  }
  if (msg.includes('econnrefused') || msg.includes('econnreset')) {
    return ProxyErrorType.CONN_REFUSED
  }
  if (msg.includes('enotfound') || msg.includes('eai_again') || msg.includes('dns')) {
    return ProxyErrorType.DNS
  }
  if (msg.includes('tls') || msg.includes('certificate') || msg.includes('ssl')) {
    return ProxyErrorType.TLS
  }
  return ProxyErrorType.OTHER
}

// ========== URL 与 contextKey 校验 ==========
const PROXY_URL_REGEX = /^(https?|socks[45]):\/\/([^:@]+:[^:@]+@)?[^:/?#]+:\d+$/
const CONTEXT_KEY_REGEX = /^[a-z0-9_]{1,30}$/

const validateProxyUrl = (url) => typeof url === 'string' && PROXY_URL_REGEX.test(url.trim())

// 解析 url -> { type, host, port, username, password }，无效返回 null
const parseProxyUrl = (url) => {
  if (!validateProxyUrl(url)) {
    return null
  }
  try {
    const u = new URL(url.trim())
    const type = u.protocol.replace(':', '')
    return {
      type,
      host: u.hostname,
      port: parseInt(u.port, 10),
      username: u.username ? decodeURIComponent(u.username) : undefined,
      password: u.password ? decodeURIComponent(u.password) : undefined
    }
  } catch (e) {
    return null
  }
}

// 脱敏代理 url 的认证信息用于日志/展示
const maskProxyUrl = (url) => {
  if (!url || typeof url !== 'string') {
    return ''
  }
  try {
    const u = new URL(url.trim())
    const auth = u.username ? `${u.username.slice(0, 2)}***:***@` : ''
    return `${u.protocol}//${auth}${u.host}`
  } catch (e) {
    return url
  }
}

const validateContextKey = (contextKey) =>
  typeof contextKey === 'string' && CONTEXT_KEY_REGEX.test(contextKey)

// 平台名归一化为合法 contextKey（连字符转下划线，截断 30 字符）
const normalizeContextKey = (platform) => {
  if (!platform || typeof platform !== 'string') {
    return 'default'
  }
  const normalized = platform
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 30)
  return normalized || 'default'
}

module.exports = {
  ProxyStatus,
  CircuitState,
  ProxyErrorType,
  CORE_CONFIG,
  configureCore,
  SlidingWindow,
  CircuitBreaker,
  SlowStart,
  ProxyRuntimeState,
  AliasTable,
  percentile,
  computeHealthFactor,
  computeLatencyFactor,
  computeSuccessRateFactor,
  computeDynamicWeight,
  aggregateShardStats,
  buildWeightedProxy,
  buildRouteEntry,
  isProxyTransportOk,
  classifyProxyError,
  classifyProxyErrorFromStatus,
  validateProxyUrl,
  parseProxyUrl,
  maskProxyUrl,
  validateContextKey,
  normalizeContextKey
}
