const {
  buildRollingUsage,
  usageFromHash,
  costFromUsageHash,
  getHourSlotKeys,
  getDaySlotKeys
} = require('../src/utils/accountRollingUsage')

jest.mock('../src/utils/costCalculator', () => ({
  calculateCost: jest.fn((usage) => {
    const input = usage.input_tokens || 0
    const output = usage.output_tokens || 0
    const cacheRead = usage.cache_read_input_tokens || 0
    const total = input * 0.002 + output * 0.006 + cacheRead * 0.0005
    return { costs: { total } }
  }),
  formatCost: (cost) => `$${(Number(cost) || 0).toFixed(6)}`
}))

describe('accountRollingUsage', () => {
  const getDateStringInTimezone = (date) => {
    const y = date.getUTCFullYear()
    const m = String(date.getUTCMonth() + 1).padStart(2, '0')
    const d = String(date.getUTCDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  const getHourInTimezone = (date) => date.getUTCHours()
  const now = new Date(Date.UTC(2026, 8, 2, 12, 30, 0))

  it('builds hour and day slot keys in reverse chronological order', () => {
    expect(getHourSlotKeys(now, 3, getDateStringInTimezone, getHourInTimezone)).toEqual([
      '2026-09-02:12',
      '2026-09-02:11',
      '2026-09-02:10'
    ])
    expect(getDaySlotKeys(now, 3, getDateStringInTimezone)).toEqual([
      '2026-09-02',
      '2026-09-01',
      '2026-08-31'
    ])
  })

  it('sums 5h/1d from hourly hashes and 7d/30d from daily hashes', () => {
    const hourlyHashes = new Map()
    hourlyHashes.set('2026-09-02:12', {
      requests: '2',
      inputTokens: '100',
      outputTokens: '10',
      cacheCreateTokens: '0',
      cacheReadTokens: '0',
      allTokens: '110',
      'model:grok-4.6:inputTokens': '100',
      'model:grok-4.6:outputTokens': '10'
    })
    hourlyHashes.set('2026-09-02:08', {
      requests: '1',
      inputTokens: '50',
      outputTokens: '5',
      allTokens: '55',
      'model:grok-4.6:inputTokens': '50',
      'model:grok-4.6:outputTokens': '5'
    })
    hourlyHashes.set('2026-09-01:20', {
      requests: '3',
      inputTokens: '200',
      outputTokens: '20',
      allTokens: '220',
      'model:grok-4.6:inputTokens': '200',
      'model:grok-4.6:outputTokens': '20'
    })

    const dailyHashes = new Map()
    dailyHashes.set('2026-09-02', {
      requests: '4',
      inputTokens: '400',
      outputTokens: '40',
      allTokens: '440'
    })
    dailyHashes.set('2026-08-28', {
      requests: '1',
      inputTokens: '10',
      outputTokens: '1',
      allTokens: '11'
    })
    dailyHashes.set('2026-08-10', {
      requests: '9',
      inputTokens: '900',
      outputTokens: '90',
      allTokens: '990'
    })

    const dailyCosts = new Map([
      ['2026-09-02', 1.5],
      ['2026-08-28', 0.25],
      ['2026-08-10', 9]
    ])

    const rolling = buildRollingUsage({
      now,
      getDateStringInTimezone,
      getHourInTimezone,
      hourlyHashes,
      dailyHashes,
      dailyCosts,
      fallbackModel: 'grok-4.6'
    })

    expect(rolling.fiveHour.requests).toBe(3)
    expect(rolling.fiveHour.tokens).toBe(165)
    expect(rolling.oneDay.requests).toBe(6)
    expect(rolling.oneDay.tokens).toBe(385)
    expect(rolling.sevenDay.requests).toBe(5)
    expect(rolling.sevenDay.cost).toBe(1.75)
    expect(rolling.thirtyDay.requests).toBe(14)
    expect(rolling.thirtyDay.cost).toBe(10.75)
  })

  it('falls back to token pricing when daily model cost is missing', () => {
    const dailyHashes = new Map()
    dailyHashes.set('2026-09-02', {
      requests: '1',
      inputTokens: '10',
      outputTokens: '4',
      cacheReadTokens: '0',
      allTokens: '14'
    })
    const dailyCosts = new Map([['2026-09-02', 0]])
    const rolling = buildRollingUsage({
      now,
      getDateStringInTimezone,
      getHourInTimezone,
      hourlyHashes: new Map(),
      dailyHashes,
      dailyCosts,
      fallbackModel: 'grok-4.6'
    })
    expect(rolling.sevenDay.tokens).toBe(14)
    expect(rolling.sevenDay.cost).toBeCloseTo(10 * 0.002 + 4 * 0.006)
  })

  it('parses usage hashes and prices hourly model fields', () => {
    const usage = usageFromHash({
      requests: '2',
      inputTokens: '10',
      outputTokens: '4',
      cacheReadTokens: '2',
      allTokens: '16'
    })
    expect(usage).toMatchObject({
      requests: 2,
      inputTokens: 10,
      outputTokens: 4,
      cacheReadTokens: 2,
      tokens: 16
    })

    const cost = costFromUsageHash(
      {
        'model:grok-4.6:inputTokens': '10',
        'model:grok-4.6:outputTokens': '4',
        'model:grok-4.6:cacheReadTokens': '2'
      },
      'grok-4.6'
    )
    expect(cost).toBeCloseTo(10 * 0.002 + 4 * 0.006 + 2 * 0.0005)
  })
})
