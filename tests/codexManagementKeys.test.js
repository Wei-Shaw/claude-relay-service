const crypto = require('crypto')
const express = require('express')
const request = require('supertest')
const { createCodexManagementKeysService } = require('../src/services/codexManagementKeysService')
const { createCodexManagementKeysRouter } = require('../src/routes/admin/codexManagementKeys')

// Synthetic Redis adapter: no network, app import, credentials, or Redis process.
function fakeRedis(clock) {
  const records = new Map()
  const get = jest.fn(async (key) => {
    const entry = records.get(key)
    if (!entry || entry.expires <= clock()) {
      records.delete(key)
      return null
    }
    return entry.value
  })
  return {
    records,
    get,
    eval: jest.fn(async (script, count, hashKey, idKey, ...args) => {
      expect(count).toBe(2)
      if (script.includes('management:create')) {
        const [metadata, digest, expiry] = args
        if ((await get(hashKey)) || (await get(idKey))) {
          return 0
        }
        records.set(hashKey, { value: metadata, expires: Number(expiry) })
        records.set(idKey, { value: digest, expires: Number(expiry) })
        return 1
      }
      expect(script).toContain('management:revoke')
      if ((await get(idKey)) !== args[0]) {
        return 0
      }
      records.delete(hashKey)
      records.delete(idKey)
      return 1
    })
  }
}

describe('dedicated Codex management key service', () => {
  let time, redis, service
  const input = { name: 'Glance', account_ids: ['account-1', 'account-2'] }
  beforeEach(() => {
    time = Date.parse('2026-09-20T00:00:00.123Z')
    redis = fakeRedis(() => time)
    service = createCodexManagementKeysService({ redis, now: () => time })
  })

  test('creates a 256-bit secret once; persists only digest and public metadata with exact expiry', async () => {
    const { key, metadata } = await service.create(input)
    expect(key).toMatch(/^crsm_[A-Za-z0-9_-]{43}$/)
    expect(Buffer.from(key.slice(5), 'base64url')).toHaveLength(32)
    expect(Object.keys(metadata).sort()).toEqual(
      ['id', 'name', 'account_ids', 'consume_account_ids', 'created_at', 'expires_at'].sort()
    )
    expect(metadata.consume_account_ids).toEqual([])
    expect(Date.parse(metadata.expires_at) - Date.parse(metadata.created_at)).toBe(90 * 86400000)
    const digest = crypto.createHash('sha256').update(key).digest('hex')
    expect(redis.records.size).toBe(2)
    expect(redis.records.get(`codex:management:hash:${digest}`).value).toBe(
      JSON.stringify(metadata)
    )
    expect(redis.records.get(`codex:management:id:${metadata.id}`).value).toBe(digest)
    for (const [storedKey, entry] of redis.records) {
      expect(storedKey).toMatch(/^codex:management:/)
      expect(entry.expires).toBe(Date.parse(metadata.expires_at))
      expect(storedKey + entry.value).not.toContain(key)
    }
    expect(redis.eval.mock.calls[0][0]).toContain('PEXPIREAT')
    expect(redis.get).toHaveBeenCalledWith(`codex:management:hash:${digest}`)
    expect(redis.get).toHaveBeenCalledWith(`codex:management:id:${metadata.id}`)
    expect(await service.get(metadata.id)).toEqual(metadata)
    expect(await service.authorize(key, 'account-1')).toEqual(metadata)
  })

  test('deduplicates ACLs and enforces the consume subset and exact accounts', async () => {
    const { key, metadata } = await service.create({
      ...input,
      account_ids: ['account-1', 'account-1', 'account-2'],
      consume_account_ids: ['account-2', 'account-2']
    })
    expect(metadata.account_ids).toEqual(['account-1', 'account-2'])
    expect(metadata.consume_account_ids).toEqual(['account-2'])
    await expect(service.authorize(key, 'account-2', 'consume')).resolves.toEqual(metadata)
    for (const [id, action] of [
      ['account-1', 'consume'],
      ['account-3', 'read'],
      ['*', 'read'],
      ['account-1', 'all']
    ]) {
      await expect(service.authorize(key, id, action)).rejects.toMatchObject({
        status: 403,
        code: 'management_key_forbidden'
      })
    }
  })

  test.each([0, -1, 366, 1.5, '90', null, Infinity])(
    'rejects invalid TTL %p before storage',
    async (expires_in_days) => {
      await expect(service.create({ ...input, expires_in_days })).rejects.toMatchObject({
        status: 400,
        code: 'invalid_management_key_request'
      })
      expect(redis.eval).not.toHaveBeenCalled()
    }
  )
  test.each([
    [],
    ['*'],
    ['a/b'],
    [' space'],
    ['account\n'],
    ['用户'],
    ['_bad'],
    ['a'.repeat(129)],
    [null],
    'all',
    Array.from({ length: 101 }, (_, i) => `a${i}`)
  ])('rejects unsafe/bounded ACL %p', async (account_ids) => {
    await expect(service.create({ ...input, account_ids })).rejects.toMatchObject({ status: 400 })
    expect(redis.eval).not.toHaveBeenCalled()
  })
  test.each(['', '  ', 'a'.repeat(129), null, 7, 'bad\nname'])(
    'rejects invalid name %p',
    async (name) => {
      await expect(service.create({ ...input, name })).rejects.toMatchObject({ status: 400 })
    }
  )
  test.each([['account-3'], ['*'], null, 'account-1'])(
    'rejects invalid consume subset %p',
    async (consume_account_ids) => {
      await expect(service.create({ ...input, consume_account_ids })).rejects.toMatchObject({
        status: 400
      })
    }
  )
  test.each([1, 365])('accepts boundary TTL %p', async (expires_in_days) => {
    const { metadata } = await service.create({ ...input, expires_in_days })
    expect(Date.parse(metadata.expires_at) - time).toBe(expires_in_days * 86400000)
  })
  test('expires at the exact deadline even if Redis still retains the record', async () => {
    const { key, metadata } = await service.create({ ...input, expires_in_days: 1 })
    for (const entry of redis.records.values()) {
      entry.expires = Infinity
    }
    time = Date.parse(metadata.expires_at)
    await expect(service.authorize(key, 'account-1')).rejects.toMatchObject({
      status: 401,
      code: 'invalid_management_key'
    })
    await expect(service.get(metadata.id)).rejects.toMatchObject({ status: 404 })
  })
  test('revokes both indexes atomically and readbacks absence; repeated revoke is idempotent', async () => {
    const { key, metadata } = await service.create(input)
    await expect(service.revoke(metadata.id)).resolves.toEqual({ id: metadata.id, revoked: true })
    expect(redis.records.size).toBe(0)
    expect(redis.eval.mock.calls[1][0]).toContain('DEL')
    await expect(service.authorize(key, 'account-1')).rejects.toMatchObject({ status: 401 })
    await expect(service.get(metadata.id)).rejects.toMatchObject({ status: 404 })
    await expect(service.revoke(metadata.id)).resolves.toEqual({ id: metadata.id, revoked: true })
  })
  test.each(['cr_all-models', 'crsm_fake', '', null, `crsm_${'A'.repeat(43)}`])(
    'rejects invalid or non-management key %p',
    async (key) => {
      await expect(service.authorize(key, 'account-1')).rejects.toMatchObject({
        status: 401,
        code: 'invalid_management_key'
      })
    }
  )
  test('missing id index fails closed even with valid hash metadata', async () => {
    const { key, metadata } = await service.create(input)
    redis.records.delete(`codex:management:id:${metadata.id}`)
    await expect(service.authorize(key, 'account-1')).rejects.toMatchObject({ status: 401 })
  })
  test('corrupted ACL metadata yields a storage error, not client input validation or access', async () => {
    const { key, metadata } = await service.create(input)
    const digest = crypto.createHash('sha256').update(key).digest('hex')
    redis.records.get(`codex:management:hash:${digest}`).value = JSON.stringify({
      ...metadata,
      account_ids: ['*']
    })
    await expect(service.get(metadata.id)).rejects.toMatchObject({
      status: 503,
      code: 'management_key_unavailable'
    })
    await expect(service.authorize(key, 'account-1')).rejects.toMatchObject({ status: 503 })
  })
  test('creation refuses a receipt if persisted data cannot be read back', async () => {
    redis.eval.mockResolvedValueOnce(1)
    await expect(service.create(input)).rejects.toMatchObject({
      status: 503,
      code: 'management_key_unavailable'
    })
  })
  test('revoke refuses success if an acknowledged delete did not remove indexes', async () => {
    const { metadata } = await service.create(input)
    redis.eval.mockResolvedValueOnce(1)
    await expect(service.revoke(metadata.id)).rejects.toMatchObject({ status: 503 })
  })
  test('Redis exceptions are fixed safe errors for every entrypoint', async () => {
    const { key, metadata } = await service.create(input)
    redis.get.mockRejectedValue(new Error('redis://SECRET:password@internal'))
    redis.eval.mockRejectedValue(new Error('redis://SECRET:password@internal'))
    for (const invoke of [
      () => service.create(input),
      () => service.get(metadata.id),
      () => service.revoke(metadata.id),
      () => service.authorize(key, 'account-1')
    ]) {
      await expect(invoke()).rejects.toMatchObject({
        status: 503,
        code: 'management_key_unavailable',
        message: 'management_key_unavailable'
      })
    }
  })
})

describe('Admin-only management key HTTP factory', () => {
  let app, service, admin
  beforeEach(() => {
    service = {
      create: jest.fn().mockResolvedValue({ key: 'synthetic', metadata: { id: 'id-1' } }),
      get: jest.fn().mockResolvedValue({ id: 'id-1' }),
      revoke: jest.fn().mockResolvedValue({ id: 'id-1', revoked: true })
    }
    admin = jest.fn((req, res, next) => {
      if (req.headers.authorization !== 'Bearer admin-session') {
        return res.status(401).json({ error: 'unauthorized' })
      }
      req.admin = { id: 'admin' }
      return next()
    })
    app = express()
    app.use(express.json())
    app.use(
      '/admin/codex-management-keys',
      createCodexManagementKeysRouter({ service, authenticateAdmin: admin })
    )
  })
  test.each([
    ['post', '/', 'create'],
    ['get', '/id-1', 'get'],
    ['delete', '/id-1', 'revoke']
  ])('%s requires Admin before any service call', async (method, path) => {
    const response = await request(app)[method](`/admin/codex-management-keys${path}`)
    expect(response.status).toBe(401)
    expect(response.headers['cache-control']).toBe('no-store')
    for (const fn of Object.values(service)) {
      expect(fn).not.toHaveBeenCalled()
    }
  })
  test.each([`crsm_${'A'.repeat(43)}`, 'cr_all-models'])(
    'keys cannot mint keys even beside an admin session: %p',
    async (key) => {
      const response = await request(app)
        .post('/admin/codex-management-keys')
        .set('x-api-key', key)
        .set('Authorization', 'Bearer admin-session')
        .send({ name: 'bad' })
      expect(response.status).toBe(401)
      expect(admin).not.toHaveBeenCalled()
      expect(service.create).not.toHaveBeenCalled()
    }
  )
  test.each([
    ['post', '/', 'create', 201],
    ['get', '/id-1', 'get', 200],
    ['delete', '/id-1', 'revoke', 200]
  ])('Admin %s returns success/data and no-store', async (method, path, operation, status) => {
    const response = await request(app)
      [method](`/admin/codex-management-keys${path}`)
      .set('Authorization', 'Bearer admin-session')
      .send({ name: 'Glance', account_ids: ['a'] })
    expect(response.status).toBe(status)
    expect(response.body.success).toBe(true)
    expect(response.body.data).toBeDefined()
    expect(response.headers['cache-control']).toBe('no-store')
    expect(service[operation]).toHaveBeenCalledTimes(1)
  })
  test('normalizes Admin rejection to a fixed safe code with no raw body', async () => {
    admin.mockImplementation((req, res) =>
      res.status(500).json({ error: 'SECRET Redis server name', headers: { password: 'secret' } })
    )
    const response = await request(app).get('/admin/codex-management-keys/id-1')
    expect(response.status).toBe(503)
    expect(response.body).toEqual({ success: false, error: 'management_key_unavailable' })
    expect(service.get).not.toHaveBeenCalled()
  })
  test.each(['post', 'get', 'delete'])(
    'management Bearer never grants %s on key lifecycle routes',
    async (method) => {
      const response = await request(app)
        [method]('/admin/codex-management-keys/id-1')
        .set('Authorization', `Bearer crsm_${'A'.repeat(43)}`)
      expect(response.status).toBe(401)
      expect(admin).not.toHaveBeenCalled()
      for (const fn of Object.values(service)) {
        expect(fn).not.toHaveBeenCalled()
      }
    }
  )
  test('does not expose exceptions, upstream headers, or forged status/code', async () => {
    service.get.mockRejectedValue({
      status: 418,
      code: 'SECRET',
      message: 'password',
      headers: { 'x-secret': 'secret' }
    })
    const response = await request(app)
      .get('/admin/codex-management-keys/id-1')
      .set('Authorization', 'Bearer admin-session')
    expect(response.status).toBe(503)
    expect(response.body).toEqual({ success: false, error: 'management_key_unavailable' })
    expect(response.headers['x-secret']).toBeUndefined()
  })
})
