const ledger = require('../../src/migrations/ledger')

describe('migrations/ledger', () => {
  test('markApplied 写入 applied 台账字段(值转字符串)', async () => {
    const hset = jest.fn(() => Promise.resolve(1))
    await ledger.markApplied({ hset }, 'foo_v1', 1700000000000)
    expect(hset).toHaveBeenCalledWith('system:migrations:applied', 'foo_v1', '1700000000000')
  })

  test('isApplied: hexists 命中返回 true', async () => {
    const hexists = jest.fn(() => Promise.resolve(1))
    expect(await ledger.isApplied({ hexists }, 'foo_v1')).toBe(true)
    expect(hexists).toHaveBeenCalledWith('system:migrations:applied', 'foo_v1')
  })

  test('isApplied: hexists 未命中返回 false', async () => {
    const hexists = jest.fn(() => Promise.resolve(0))
    expect(await ledger.isApplied({ hexists }, 'foo_v1')).toBe(false)
  })

  test('getAll 返回台账全部条目', async () => {
    const hgetall = jest.fn(() => Promise.resolve({ foo_v1: '1700000000000' }))
    expect(await ledger.getAll({ hgetall })).toEqual({ foo_v1: '1700000000000' })
  })
})
