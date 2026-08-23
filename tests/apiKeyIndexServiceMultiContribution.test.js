// 验证 addToIndex / updateIndex 在收到调用方 multi 时，把索引命令挂到该事务上、不自行 exec，
// 从而让 createApiKey/updateApiKey 能把"hash 写入 + 主列表索引更新"放进同一个原子 MULTI。

jest.mock('../src/utils/logger', () => ({
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  success: jest.fn(),
  debug: jest.fn()
}))

const apiKeyIndexService = require('../src/services/apiKeyIndexService')

// 捕获挂到 multi 上的全部命令为 [method, ...args]
const makeMulti = (calls) =>
  new Proxy(
    {},
    {
      get(_target, prop) {
        if (typeof prop !== 'string') {
          return undefined
        }
        if (prop === 'exec') {
          return () => {
            calls.push(['exec'])
            return Promise.resolve([])
          }
        }
        return (...args) => {
          calls.push([prop, ...args])
          return undefined
        }
      }
    }
  )

describe('apiKeyIndexService 索引命令挂到调用方 MULTI（与 hash 写入同一事务）', () => {
  beforeEach(() => {
    // 自建 pipeline 会抛错——用来断言"传了 multi 时绝不自建 pipeline / 不自行提交"
    apiKeyIndexService.init({
      getClientSafe: () => ({
        pipeline: () => {
          throw new Error('should not build own pipeline when multi is provided')
        }
      })
    })
  })

  test('addToIndex(apiKey, multi)：命令挂到 multi、不自行 exec', async () => {
    const calls = []
    const multi = makeMulti(calls)

    await apiKeyIndexService.addToIndex(
      {
        id: 'k1',
        name: 'My',
        createdAt: '2026-01-01T00:00:00.000Z',
        lastUsedAt: '',
        isActive: true,
        isDeleted: false,
        tags: ['t1']
      },
      multi
    )

    expect(calls).toContainEqual(['sadd', 'apikey:idx:all', 'k1'])
    expect(calls).toContainEqual(['sadd', 'apikey:set:active', 'k1'])
    expect(calls).toContainEqual(['zadd', 'apikey:idx:name', 0, 'my\x00k1'])
    expect(calls).toContainEqual(['sadd', 'apikey:tag:t1', 'k1'])
    // 不自行提交（由调用方与 hash 写入一起 exec）
    expect(calls).not.toContainEqual(['exec'])
  })

  test('updateIndex(keyId, updates, oldData, multi)：命令挂到 multi、返回 removedTags、不自行 exec', async () => {
    const calls = []
    const multi = makeMulti(calls)

    const removed = await apiKeyIndexService.updateIndex(
      'k1',
      { name: 'New', tags: ['a'] },
      { name: 'Old', tags: ['a', 'b'] },
      multi
    )

    // 改名：旧成员移除、新成员加入（名称排序索引）
    expect(calls).toContainEqual(['zrem', 'apikey:idx:name', 'old\x00k1'])
    expect(calls).toContainEqual(['zadd', 'apikey:idx:name', 0, 'new\x00k1'])
    // 标签 b 被移除
    expect(calls).toContainEqual(['srem', 'apikey:tag:b', 'k1'])
    expect(removed).toEqual(['b'])
    // 不自行提交；tags:all 空集合清理交由调用方在 exec 后处理
    expect(calls).not.toContainEqual(['exec'])
  })

  // multi 模式下排队阶段抛错必须向上传播（不能被自身 try/catch 吞掉），
  // 否则调用方会照常 exec 提交 hash、却没挂上索引命令 —— 伪原子。
  const throwingMulti = () =>
    new Proxy(
      {},
      {
        get() {
          return () => {
            throw new Error('boom')
          }
        }
      }
    )

  test('addToIndex(multi)：排队抛错向上传播、不静默吞错', async () => {
    await expect(
      apiKeyIndexService.addToIndex({ id: 'k1', name: 'X', tags: [] }, throwingMulti())
    ).rejects.toThrow('boom')
  })

  test('updateIndex(multi)：排队抛错向上传播、不静默吞错', async () => {
    await expect(
      apiKeyIndexService.updateIndex('k1', { name: 'New' }, { name: 'Old' }, throwingMulti())
    ).rejects.toThrow('boom')
  })
})
