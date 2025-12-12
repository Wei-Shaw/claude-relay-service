/**
 * 并发请求排队功能测试
 * 测试排队逻辑中的核心算法：百分位数计算、等待时间统计、指数退避等
 *
 * 注意：Redis 方法的测试需要集成测试环境，这里主要测试纯算法逻辑
 */

// Mock logger to avoid console output during tests
jest.mock('../src/utils/logger', () => ({
  api: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  database: jest.fn(),
  security: jest.fn()
}))

// 使用共享的统计工具函数（与生产代码一致）
const { getPercentile, calculateWaitTimeStats } = require('../src/utils/statsHelper')

describe('ConcurrencyQueue', () => {
  describe('Percentile Calculation (nearest-rank method)', () => {
    // 直接测试共享工具函数，确保与生产代码行为一致
    it('should return 0 for empty array', () => {
      expect(getPercentile([], 50)).toBe(0)
    })

    it('should return single element for single-element array', () => {
      expect(getPercentile([100], 50)).toBe(100)
      expect(getPercentile([100], 99)).toBe(100)
    })

    it('should return min for percentile 0', () => {
      expect(getPercentile([10, 20, 30, 40, 50], 0)).toBe(10)
    })

    it('should return max for percentile 100', () => {
      expect(getPercentile([10, 20, 30, 40, 50], 100)).toBe(50)
    })

    it('should calculate P50 correctly for len=10', () => {
      // For [10, 20, 30, 40, 50, 60, 70, 80, 90, 100] (len=10)
      // P50: ceil(50/100 * 10) - 1 = ceil(5) - 1 = 4 → value at index 4 = 50
      const arr = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
      expect(getPercentile(arr, 50)).toBe(50)
    })

    it('should calculate P90 correctly for len=10', () => {
      // For len=10, P90: ceil(90/100 * 10) - 1 = ceil(9) - 1 = 8 → value at index 8 = 90
      const arr = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
      expect(getPercentile(arr, 90)).toBe(90)
    })

    it('should calculate P99 correctly for len=100', () => {
      // For len=100, P99: ceil(99/100 * 100) - 1 = ceil(99) - 1 = 98
      const arr = Array.from({ length: 100 }, (_, i) => i + 1)
      expect(getPercentile(arr, 99)).toBe(99)
    })

    it('should handle two-element array correctly', () => {
      // For [10, 20] (len=2)
      // P50: ceil(50/100 * 2) - 1 = ceil(1) - 1 = 0 → value = 10
      expect(getPercentile([10, 20], 50)).toBe(10)
    })

    it('should handle negative percentile as 0', () => {
      expect(getPercentile([10, 20, 30], -10)).toBe(10)
    })

    it('should handle percentile > 100 as 100', () => {
      expect(getPercentile([10, 20, 30], 150)).toBe(30)
    })
  })

  describe('Wait Time Stats Calculation', () => {
    // 直接测试共享工具函数
    it('should return null for empty array', () => {
      expect(calculateWaitTimeStats([])).toBeNull()
    })

    it('should return null for null input', () => {
      expect(calculateWaitTimeStats(null)).toBeNull()
    })

    it('should return null for undefined input', () => {
      expect(calculateWaitTimeStats(undefined)).toBeNull()
    })

    it('should calculate stats correctly for typical data', () => {
      const waitTimes = [100, 200, 150, 300, 250, 180, 220, 280, 190, 210]
      const stats = calculateWaitTimeStats(waitTimes)

      expect(stats.count).toBe(10)
      expect(stats.min).toBe(100)
      expect(stats.max).toBe(300)
      // Sum: 100+150+180+190+200+210+220+250+280+300 = 2080
      expect(stats.avg).toBe(208)
      expect(stats.sampleSizeWarning).toBeUndefined()
    })

    it('should add warning for small sample size (< 10)', () => {
      const waitTimes = [100, 200, 300]
      const stats = calculateWaitTimeStats(waitTimes)

      expect(stats.count).toBe(3)
      expect(stats.sampleSizeWarning).toBe('Results may be inaccurate due to small sample size')
    })

    it('should handle single value', () => {
      const stats = calculateWaitTimeStats([500])

      expect(stats.count).toBe(1)
      expect(stats.min).toBe(500)
      expect(stats.max).toBe(500)
      expect(stats.avg).toBe(500)
      expect(stats.p50).toBe(500)
      expect(stats.p90).toBe(500)
      expect(stats.p99).toBe(500)
    })

    it('should sort input array before calculating', () => {
      const waitTimes = [500, 100, 300, 200, 400]
      const stats = calculateWaitTimeStats(waitTimes)

      expect(stats.min).toBe(100)
      expect(stats.max).toBe(500)
    })

    it('should not modify original array', () => {
      const waitTimes = [500, 100, 300]
      calculateWaitTimeStats(waitTimes)

      expect(waitTimes).toEqual([500, 100, 300])
    })
  })

  describe('Exponential Backoff with Jitter', () => {
    /**
     * 指数退避计算函数（与 auth.js 中的实现一致）
     * @param {number} currentInterval - 当前轮询间隔
     * @param {number} backoffFactor - 退避系数
     * @param {number} jitterRatio - 抖动比例
     * @param {number} maxInterval - 最大间隔
     * @param {number} randomValue - 随机值 [0, 1)，用于确定性测试
     */
    function calculateNextInterval(
      currentInterval,
      backoffFactor,
      jitterRatio,
      maxInterval,
      randomValue
    ) {
      let nextInterval = currentInterval * backoffFactor
      // 抖动范围：[-jitterRatio, +jitterRatio]
      const jitter = nextInterval * jitterRatio * (randomValue * 2 - 1)
      nextInterval = nextInterval + jitter
      return Math.max(1, Math.min(nextInterval, maxInterval))
    }

    it('should apply exponential backoff without jitter (randomValue=0.5)', () => {
      // randomValue = 0.5 gives jitter = 0
      const next = calculateNextInterval(100, 1.5, 0.2, 1000, 0.5)
      expect(next).toBe(150) // 100 * 1.5 = 150
    })

    it('should apply maximum positive jitter (randomValue=1.0)', () => {
      // randomValue = 1.0 gives maximum positive jitter (+20%)
      const next = calculateNextInterval(100, 1.5, 0.2, 1000, 1.0)
      // 100 * 1.5 = 150, jitter = 150 * 0.2 * 1 = 30
      expect(next).toBe(180) // 150 + 30
    })

    it('should apply maximum negative jitter (randomValue=0.0)', () => {
      // randomValue = 0.0 gives maximum negative jitter (-20%)
      const next = calculateNextInterval(100, 1.5, 0.2, 1000, 0.0)
      // 100 * 1.5 = 150, jitter = 150 * 0.2 * -1 = -30
      expect(next).toBe(120) // 150 - 30
    })

    it('should respect maximum interval', () => {
      const next = calculateNextInterval(800, 1.5, 0.2, 1000, 1.0)
      // 800 * 1.5 = 1200, with +20% jitter = 1440, capped at 1000
      expect(next).toBe(1000)
    })

    it('should never go below 1ms even with extreme negative jitter', () => {
      const next = calculateNextInterval(1, 1.0, 0.9, 1000, 0.0)
      // 1 * 1.0 = 1, jitter = 1 * 0.9 * -1 = -0.9
      // 1 - 0.9 = 0.1, but Math.max(1, ...) ensures minimum is 1
      expect(next).toBe(1)
    })

    it('should handle zero jitter ratio', () => {
      const next = calculateNextInterval(100, 2.0, 0, 1000, 0.0)
      expect(next).toBe(200) // Pure exponential, no jitter
    })

    it('should handle large backoff factor', () => {
      const next = calculateNextInterval(100, 3.0, 0.1, 1000, 0.5)
      expect(next).toBe(300) // 100 * 3.0 = 300
    })

    describe('jitter distribution', () => {
      it('should produce values in expected range', () => {
        const results = []
        // Test with various random values
        for (let r = 0; r <= 1; r += 0.1) {
          results.push(calculateNextInterval(100, 1.5, 0.2, 1000, r))
        }
        // All values should be between 120 (150 - 30) and 180 (150 + 30)
        expect(Math.min(...results)).toBeGreaterThanOrEqual(120)
        expect(Math.max(...results)).toBeLessThanOrEqual(180)
      })
    })
  })

  describe('Queue Size Calculation', () => {
    /**
     * 最大排队数计算（与 auth.js 中的实现一致）
     */
    function calculateMaxQueueSize(concurrencyLimit, multiplier, fixedMin) {
      return Math.max(concurrencyLimit * multiplier, fixedMin)
    }

    it('should use multiplier when result is larger', () => {
      // concurrencyLimit=10, multiplier=2, fixedMin=5
      // max(10*2, 5) = max(20, 5) = 20
      expect(calculateMaxQueueSize(10, 2, 5)).toBe(20)
    })

    it('should use fixed minimum when multiplier result is smaller', () => {
      // concurrencyLimit=2, multiplier=1, fixedMin=5
      // max(2*1, 5) = max(2, 5) = 5
      expect(calculateMaxQueueSize(2, 1, 5)).toBe(5)
    })

    it('should handle zero multiplier', () => {
      // concurrencyLimit=10, multiplier=0, fixedMin=3
      // max(10*0, 3) = max(0, 3) = 3
      expect(calculateMaxQueueSize(10, 0, 3)).toBe(3)
    })

    it('should handle fractional multiplier', () => {
      // concurrencyLimit=10, multiplier=1.5, fixedMin=5
      // max(10*1.5, 5) = max(15, 5) = 15
      expect(calculateMaxQueueSize(10, 1.5, 5)).toBe(15)
    })
  })

  describe('TTL Calculation', () => {
    /**
     * 排队计数器 TTL 计算（与 redis.js 中的实现一致）
     */
    function calculateQueueTtl(timeoutMs, bufferSeconds = 30) {
      return Math.ceil(timeoutMs / 1000) + bufferSeconds
    }

    it('should calculate TTL with default buffer', () => {
      // 60000ms = 60s + 30s buffer = 90s
      expect(calculateQueueTtl(60000)).toBe(90)
    })

    it('should round up milliseconds to seconds', () => {
      // 61500ms = ceil(61.5) = 62s + 30s = 92s
      expect(calculateQueueTtl(61500)).toBe(92)
    })

    it('should handle custom buffer', () => {
      // 30000ms = 30s + 60s buffer = 90s
      expect(calculateQueueTtl(30000, 60)).toBe(90)
    })

    it('should handle very short timeout', () => {
      // 1000ms = 1s + 30s = 31s
      expect(calculateQueueTtl(1000)).toBe(31)
    })
  })
})
