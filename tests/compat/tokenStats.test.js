// 白盒测试:四期抽出 compat 纯函数后,复用二期 golden(tokenStatsGolden.test.js)同批 case。
// 两套全绿 = handleLegacyData/handleAccountData 抽取行为逐字节一致。

const {
  normalizeKeyTokenStats,
  normalizeAccountTokenStats
} = require('../../src/compat/tokenStats')

describe('compat/tokenStats normalizeKeyTokenStats (API Key 维度,30/70 拆分)', () => {
  test('旧单字段:30/70 拆分,tokens 保留原值', () => {
    expect(normalizeKeyTokenStats({ totalTokens: '1000', totalRequests: '10' })).toEqual({
      tokens: 1000,
      inputTokens: 300,
      outputTokens: 700,
      cacheCreateTokens: 0,
      cacheReadTokens: 0,
      allTokens: 1000,
      requests: 10
    })
  })

  test('新分离字段:tokens = allTokens 合计', () => {
    expect(
      normalizeKeyTokenStats({
        totalInputTokens: '100',
        totalOutputTokens: '200',
        totalCacheReadTokens: '50',
        totalRequests: '5'
      })
    ).toEqual({
      tokens: 350,
      inputTokens: 100,
      outputTokens: 200,
      cacheCreateTokens: 0,
      cacheReadTokens: 50,
      allTokens: 350,
      requests: 5
    })
  })

  test('显式 totalAllTokens:直接采用', () => {
    const r = normalizeKeyTokenStats({
      totalInputTokens: '100',
      totalOutputTokens: '200',
      totalAllTokens: '999'
    })
    expect(r.allTokens).toBe(999)
    expect(r.tokens).toBe(999)
  })

  test('仅 totalTokens:30/70 取整', () => {
    const r = normalizeKeyTokenStats({ totalTokens: '500' })
    expect(r.inputTokens).toBe(150)
    expect(r.outputTokens).toBe(350)
    expect(r.allTokens).toBe(500)
  })

  test('空数据:全 0', () => {
    expect(normalizeKeyTokenStats({})).toEqual({
      tokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheCreateTokens: 0,
      cacheReadTokens: 0,
      allTokens: 0,
      requests: 0
    })
  })
})

describe('compat/tokenStats normalizeAccountTokenStats (账户维度,无拆分)', () => {
  test('旧单字段:不拆分,input/output=0,tokens 原值,allTokens 合计(此处 0)', () => {
    expect(normalizeAccountTokenStats({ totalTokens: '1000', totalRequests: '10' })).toEqual({
      tokens: 1000,
      inputTokens: 0,
      outputTokens: 0,
      cacheCreateTokens: 0,
      cacheReadTokens: 0,
      allTokens: 0,
      requests: 10
    })
  })

  test('新分离字段:allTokens 合计,tokens 取原始(此处 0)', () => {
    expect(
      normalizeAccountTokenStats({
        totalInputTokens: '100',
        totalOutputTokens: '200',
        totalCacheReadTokens: '50',
        totalRequests: '5'
      })
    ).toEqual({
      tokens: 0,
      inputTokens: 100,
      outputTokens: 200,
      cacheCreateTokens: 0,
      cacheReadTokens: 50,
      allTokens: 350,
      requests: 5
    })
  })

  test('显式 totalAllTokens:直接采用', () => {
    expect(
      normalizeAccountTokenStats({
        totalInputTokens: '100',
        totalOutputTokens: '200',
        totalAllTokens: '999'
      }).allTokens
    ).toBe(999)
  })

  test('空数据:全 0', () => {
    expect(normalizeAccountTokenStats({})).toEqual({
      tokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheCreateTokens: 0,
      cacheReadTokens: 0,
      allTokens: 0,
      requests: 0
    })
  })
})

describe('两函数在旧单字段下行为不同(防误合并)', () => {
  test('{totalTokens:1000}:Key 版拆分,Account 版不拆', () => {
    const input = { totalTokens: '1000', totalRequests: '10' }
    const k = normalizeKeyTokenStats(input)
    const a = normalizeAccountTokenStats(input)
    expect(k.inputTokens).toBe(300)
    expect(a.inputTokens).toBe(0)
    expect(k.allTokens).toBe(1000)
    expect(a.allTokens).toBe(0)
    expect(k).not.toEqual(a)
  })
})
