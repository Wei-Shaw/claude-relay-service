const {
  AliasTable,
  CircuitBreaker,
  CircuitState,
  SlowStart,
  SlidingWindow,
  ProxyRuntimeState,
  computeHealthFactor,
  computeLatencyFactor,
  computeSuccessRateFactor,
  computeDynamicWeight,
  buildWeightedProxy,
  buildRouteEntry,
  isProxyTransportOk,
  validateProxyUrl,
  parseProxyUrl,
  maskProxyUrl,
  normalizeContextKey,
  validateContextKey,
  ProxyStatus
} = require('../src/services/proxyPool/proxyPoolCore')

describe('proxyPoolCore', () => {
  let now

  beforeEach(() => {
    now = 1_000_000
    jest.spyOn(Date, 'now').mockImplementation(() => now)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('AliasTable (Vose 加权随机)', () => {
    it('按权重比例抽样（90/10 -> 约 90%）', () => {
      const table = new AliasTable([
        { id: 'a', weight: 90 },
        { id: 'b', weight: 10 }
      ])
      let countA = 0
      for (let i = 0; i < 5000; i++) {
        if (table.sample().id === 'a') {
          countA += 1
        }
      }
      const ratioA = countA / 5000
      expect(ratioA).toBeGreaterThan(0.85)
      expect(ratioA).toBeLessThan(0.95)
    })

    it('空表返回 null', () => {
      expect(new AliasTable([]).sample()).toBeNull()
    })

    it('单元素恒返回自身', () => {
      const table = new AliasTable([{ id: 'only', weight: 50 }])
      expect(table.sample().id).toBe('only')
    })

    it('全 0 权重退化为均匀分布（不崩溃，总能抽到）', () => {
      const table = new AliasTable([
        { id: 'a', weight: 0 },
        { id: 'b', weight: 0 }
      ])
      expect(['a', 'b']).toContain(table.sample().id)
    })
  })

  describe('CircuitBreaker (熔断器)', () => {
    it('连续失败达阈值 5 -> open', () => {
      const breaker = new CircuitBreaker()
      for (let i = 0; i < 4; i++) {
        breaker.recordFailure()
      }
      expect(breaker.state).toBe(CircuitState.CLOSED)
      breaker.recordFailure()
      expect(breaker.state).toBe(CircuitState.OPEN)
    })

    it('成功重置失败计数', () => {
      const breaker = new CircuitBreaker()
      breaker.recordFailure()
      breaker.recordFailure()
      breaker.recordSuccess()
      expect(breaker.failureCount).toBe(0)
    })

    it('冷却期满 checkHalfOpen -> half_open', () => {
      const breaker = new CircuitBreaker()
      for (let i = 0; i < 5; i++) {
        breaker.recordFailure()
      }
      expect(breaker.state).toBe(CircuitState.OPEN)
      now += 30_001
      expect(breaker.checkHalfOpen()).toBe(true)
      expect(breaker.state).toBe(CircuitState.HALF_OPEN)
    })

    it('半开期失败 -> 重新 open', () => {
      const breaker = new CircuitBreaker()
      for (let i = 0; i < 5; i++) {
        breaker.recordFailure()
      }
      now += 30_001
      breaker.checkHalfOpen()
      breaker.recordFailure()
      expect(breaker.state).toBe(CircuitState.OPEN)
    })

    it('序列化往返保持状态', () => {
      const breaker = new CircuitBreaker()
      for (let i = 0; i < 5; i++) {
        breaker.recordFailure()
      }
      const restored = CircuitBreaker.fromJSON(breaker.toJSON())
      expect(restored.state).toBe(CircuitState.OPEN)
      expect(restored.failureCount).toBe(breaker.failureCount)
    })
  })

  describe('SlowStart (慢启动)', () => {
    it('未启动系数为 1.0', () => {
      expect(new SlowStart().getFactor()).toBe(1.0)
    })

    it('线性爬坡 10% -> 100%', () => {
      const slowStart = new SlowStart()
      slowStart.start()
      expect(slowStart.getFactor()).toBeCloseTo(0.1, 5)
      now += 30_000
      expect(slowStart.getFactor()).toBeCloseTo(0.55, 2)
      now += 30_000
      expect(slowStart.getFactor()).toBe(1.0)
    })
  })

  describe('SlidingWindow (滑动窗口)', () => {
    it('统计请求数 / 成功率 / 百分位', () => {
      const window = new SlidingWindow(60_000)
      window.record(true, 100, now)
      window.record(true, 200, now)
      window.record(false, 300, now)
      const stats = window.getStats(now)
      expect(stats.requests).toBe(3)
      expect(stats.successes).toBe(2)
      expect(stats.successRate).toBeCloseTo(2 / 3, 5)
      expect(stats.p99).toBeGreaterThanOrEqual(200)
    })

    it('窗口外数据不计入', () => {
      const window = new SlidingWindow(60_000)
      window.record(true, 100, now)
      now += 120_000
      expect(window.getStats(now).requests).toBe(0)
    })
  })

  describe('动态权重因子', () => {
    it('computeHealthFactor 边界', () => {
      expect(computeHealthFactor(0.999)).toBe(1.0)
      expect(computeHealthFactor(0.96)).toBe(0.8)
      expect(computeHealthFactor(0.4)).toBe(0)
    })

    it('computeLatencyFactor 边界', () => {
      expect(computeLatencyFactor(150)).toBe(1.0)
      expect(computeLatencyFactor(800)).toBe(0.6)
      expect(computeLatencyFactor(5000)).toBe(0.1)
    })

    it('computeSuccessRateFactor 边界', () => {
      expect(computeSuccessRateFactor(0.995)).toBe(1.0)
      expect(computeSuccessRateFactor(0.7)).toBe(0.3)
    })
  })

  describe('computeDynamicWeight (综合权重)', () => {
    it('无数据 + 未慢启动 -> baseWeight', () => {
      const state = new ProxyRuntimeState('p1', 'claude')
      expect(computeDynamicWeight(60, state)).toBe(60)
    })

    it('熔断 open -> 0', () => {
      const state = new ProxyRuntimeState('p1', 'claude')
      for (let i = 0; i < 5; i++) {
        state.circuitBreaker.recordFailure()
      }
      expect(computeDynamicWeight(100, state)).toBe(0)
    })

    it('全成功低延迟 -> 接近 baseWeight', () => {
      const state = new ProxyRuntimeState('p1', 'claude')
      for (let i = 0; i < 20; i++) {
        state.record(true, 50, now)
      }
      const weight = computeDynamicWeight(100, state)
      expect(weight).toBeGreaterThan(80)
      expect(weight).toBeLessThanOrEqual(100)
    })
  })

  describe('传输裁决', () => {
    it('收到响应即代理可达，403/429 视为封禁', () => {
      expect(isProxyTransportOk(true, 200)).toBe(true)
      expect(isProxyTransportOk(false, 500)).toBe(true)
      expect(isProxyTransportOk(true, 403)).toBe(false)
      expect(isProxyTransportOk(true, 429)).toBe(false)
      expect(isProxyTransportOk(false, undefined)).toBe(false)
    })
  })

  describe('URL / contextKey 工具', () => {
    it('validateProxyUrl', () => {
      expect(validateProxyUrl('socks5://u:p@host:1080')).toBe(true)
      expect(validateProxyUrl('http://1.2.3.4:8080')).toBe(true)
      expect(validateProxyUrl('ftp://x:1')).toBe(false)
      expect(validateProxyUrl('not a url')).toBe(false)
    })

    it('parseProxyUrl 解析字段', () => {
      const parsed = parseProxyUrl('socks5://user:pass@1.2.3.4:1080')
      expect(parsed).toEqual({
        type: 'socks5',
        host: '1.2.3.4',
        port: 1080,
        username: 'user',
        password: 'pass'
      })
    })

    it('maskProxyUrl 隐藏认证', () => {
      expect(maskProxyUrl('socks5://user:secret@1.2.3.4:1080')).toBe(
        'socks5://us***:***@1.2.3.4:1080'
      )
    })

    it('normalizeContextKey 归一化平台名', () => {
      expect(normalizeContextKey('claude-console')).toBe('claude_console')
      expect(normalizeContextKey('OpenAI-Responses')).toBe('openai_responses')
      expect(normalizeContextKey('')).toBe('default')
    })

    it('validateContextKey', () => {
      expect(validateContextKey('claude')).toBe(true)
      expect(validateContextKey('quality_openai')).toBe(true)
      expect(validateContextKey('Bad:Key')).toBe(false)
    })
  })

  describe('路由条目构建', () => {
    it('buildWeightedProxy 无状态用 baseWeight', () => {
      const config = {
        id: 'p1',
        url: 'http://h:1',
        isHealthy: true,
        baseWeight: 70,
        groupIds: []
      }
      const weighted = buildWeightedProxy(config)
      expect(weighted.weight).toBe(70)
      expect(weighted.circuitState).toBe(CircuitState.CLOSED)
    })

    it('buildRouteEntry 按权重降序', () => {
      const entry = buildRouteEntry([
        { id: 'a', weight: 10 },
        { id: 'b', weight: 90 },
        { id: 'c', weight: 50 }
      ])
      expect(entry.proxies.map((proxy) => proxy.id)).toEqual(['b', 'c', 'a'])
      expect(entry.aliasTable).toBeInstanceOf(AliasTable)
    })
  })

  describe('ProxyStatus 枚举', () => {
    it('值符合 llysc 约定', () => {
      expect(ProxyStatus).toEqual({ ENABLED: 1, DISABLED: 2, FAULT: 3 })
    })
  })
})
