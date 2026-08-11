const {
  resolveKeyIdByHash,
  writeApiKeyHashDual,
  deleteApiKeyHashDual
} = require('../../src/compat/apiKeyHash')

describe('compat/apiKeyHash resolveKeyIdByHash', () => {
  test('新表 hash_map 命中:直接返回 keyId,不读旧结构', async () => {
    const client = {
      hget: jest.fn(() => Promise.resolve('key-1')),
      hgetall: jest.fn(),
      hset: jest.fn()
    }
    const keyId = await resolveKeyIdByHash(client, 'h1')
    expect(keyId).toBe('key-1')
    expect(client.hgetall).not.toHaveBeenCalled()
    expect(client.hset).not.toHaveBeenCalled()
  })

  test('新表 miss + 旧结构命中:返回 keyId 并回填 hash_map', async () => {
    const client = {
      hget: jest.fn(() => Promise.resolve(null)),
      hgetall: jest.fn(() => Promise.resolve({ id: 'key-2' })),
      hset: jest.fn(() => Promise.resolve(1))
    }
    const keyId = await resolveKeyIdByHash(client, 'h2')
    expect(keyId).toBe('key-2')
    expect(client.hgetall).toHaveBeenCalledWith('apikey_hash:h2')
    expect(client.hset).toHaveBeenCalledWith('apikey:hash_map', 'h2', 'key-2')
  })

  test('新表 miss + 旧结构也无:返回空,不回填', async () => {
    const client = {
      hget: jest.fn(() => Promise.resolve(null)),
      hgetall: jest.fn(() => Promise.resolve({})),
      hset: jest.fn()
    }
    const keyId = await resolveKeyIdByHash(client, 'h3')
    expect(keyId).toBeFalsy()
    expect(client.hset).not.toHaveBeenCalled()
  })
})

describe('compat/apiKeyHash writeApiKeyHashDual', () => {
  test('双写旧+新结构;有 ttl 则 expire', async () => {
    const client = {
      hset: jest.fn(() => Promise.resolve(1)),
      expire: jest.fn(() => Promise.resolve(1))
    }
    await writeApiKeyHashDual(client, 'h1', { id: 'key-1', name: 'x' }, 60)
    expect(client.hset).toHaveBeenCalledWith('apikey_hash:h1', { id: 'key-1', name: 'x' })
    expect(client.expire).toHaveBeenCalledWith('apikey_hash:h1', 60)
    expect(client.hset).toHaveBeenCalledWith('apikey:hash_map', 'h1', 'key-1')
  })

  test('无 ttl 不 expire;无 id 不写 hash_map', async () => {
    const client = { hset: jest.fn(() => Promise.resolve(1)), expire: jest.fn() }
    await writeApiKeyHashDual(client, 'h1', { name: 'x' })
    expect(client.expire).not.toHaveBeenCalled()
    expect(client.hset).toHaveBeenCalledTimes(1)
    expect(client.hset).toHaveBeenCalledWith('apikey_hash:h1', { name: 'x' })
  })
})

describe('compat/apiKeyHash deleteApiKeyHashDual', () => {
  test('双删旧结构(del)+新结构(hdel)', async () => {
    const client = {
      del: jest.fn(() => Promise.resolve(1)),
      hdel: jest.fn(() => Promise.resolve(1))
    }
    await deleteApiKeyHashDual(client, 'h1')
    expect(client.del).toHaveBeenCalledWith('apikey_hash:h1')
    expect(client.hdel).toHaveBeenCalledWith('apikey:hash_map', 'h1')
  })
})
