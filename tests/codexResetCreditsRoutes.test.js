const fs = require('fs')
const path = require('path')
const express = require('express')
const request = require('supertest')

function setup(keysService) {
  const file = path.join(__dirname, '../src/routes/admin/codexResetCredits.js')
  expect(fs.existsSync(file)).toBe(true)
  const createRouter = require(file)
  const service = {
    usage: jest.fn(async (accountId) => ({ account_id: accountId, source: 'upstream' })),
    resetCredits: jest.fn(async (accountId) => ({ account_id: accountId, available_count: 0 })),
    consume: jest.fn(async (accountId, body) => ({
      account_id: accountId,
      request_id: body.request_id,
      status: 'uncertain'
    })),
    reconcile: jest.fn(async (accountId, requestId) => ({
      account_id: accountId,
      request_id: requestId,
      status: 'reset_verified'
    })),
    operation: jest.fn(async (accountId, requestId) => ({
      account_id: accountId,
      request_id: requestId,
      status: 'uncertain'
    }))
  }
  const authenticateAdmin = jest.fn((req, res, next) =>
    req.headers.authorization === 'Bearer synthetic-admin'
      ? next()
      : res.status(401).json({ error: 'unauthorized' })
  )
  const app = express()
  app.use(express.json())
  app.use(
    '/admin/openai-accounts/:accountId/codex',
    createRouter({ service, authenticateAdmin, keysService })
  )
  return { app, service, authenticateAdmin }
}
const prefix = '/admin/openai-accounts/synthetic-account/codex'

describe('Codex admin child router', () => {
  test('reconciliation is explicit Admin-only and does not call consume', async () => {
    const keys = { authorize: jest.fn(async () => ({ id: 'key-id' })) }
    const h = setup(keys)
    const url = `${prefix}/reset-credits/operations/req-1/reconcile`
    const body = { execute: true, confirm_request_id: 'req-1' }
    expect(
      (
        await request(h.app)
          .post(url)
          .set('x-api-key', `crsm_${'A'.repeat(43)}`)
          .send(body)
      ).status
    ).toBe(403)
    expect(h.service.reconcile).not.toHaveBeenCalled()
    expect(
      (await request(h.app).post(url).set('Authorization', 'Bearer synthetic-admin').send(body))
        .status
    ).toBe(200)
    expect(h.service.reconcile).toHaveBeenCalledWith('synthetic-account', 'req-1', body)
    expect(h.service.consume).not.toHaveBeenCalled()
  })
  test('native endpoint accepts a scoped management key without Admin fallback', async () => {
    const keys = { authorize: jest.fn(async () => ({ id: 'key-id' })) }
    const h = setup(keys)
    const key = `crsm_${'A'.repeat(43)}`
    const response = await request(h.app).get(`${prefix}/usage`).set('x-api-key', key)
    expect(response.status).toBe(200)
    expect(keys.authorize).toHaveBeenCalledWith(key, 'synthetic-account', 'read')
    expect(h.authenticateAdmin).not.toHaveBeenCalled()
  })

  test('main Admin index mounts key provisioning separately', () => {
    const source = fs.readFileSync(path.join(__dirname, '../src/routes/admin/index.js'), 'utf8')
    expect(source.includes("'/codex-management-keys'")).toBe(true)
    expect(source.includes('createCodexManagementKeysRouter')).toBe(true)
  })

  test.each([
    ['get', '/usage'],
    ['get', '/reset-credits'],
    ['post', '/reset-credits/consume'],
    ['get', '/reset-credits/operations/req-1']
  ])('auth runs before %s %s business logic', async (method, url) => {
    const h = setup()
    expect(
      (
        await request(h.app)
          [method](prefix + url)
          .send({ execute: true, request_id: 'req-1' })
      ).status
    ).toBe(401)
    for (const fn of Object.values(h.service)) {
      expect(fn).not.toHaveBeenCalled()
    }
  })

  test('parent OpenAI router mounts the native child', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../src/routes/admin/openaiAccounts.js'),
      'utf8'
    )
    expect(
      source.includes("router.use('/:accountId/codex', require('./codexResetCredits')())")
    ).toBe(true)
  })

  test.each([
    ['/usage', 'usage'],
    ['/reset-credits', 'resetCredits']
  ])('GET %s merges the fixed CRS accountId', async (url, name) => {
    const h = setup()
    const response = await request(h.app)
      .get(prefix + url)
      .set('Authorization', 'Bearer synthetic-admin')
    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      success: true,
      data: await h.service[name].mock.results[0].value
    })
    expect(h.service[name]).toHaveBeenCalledWith('synthetic-account')
  })

  test('uncertain consume is 202; operation lookup is always 200', async () => {
    const h = setup()
    const response = await request(h.app)
      .post(`${prefix}/reset-credits/consume`)
      .set('Authorization', 'Bearer synthetic-admin')
      .send({ execute: true, request_id: 'req-1' })
    expect(response.status).toBe(202)
    const receipt = await request(h.app)
      .get(`${prefix}/reset-credits/operations/req-1`)
      .set('Authorization', 'Bearer synthetic-admin')
    expect(receipt.status).toBe(200)
    expect(h.service.operation).toHaveBeenCalledWith('synthetic-account', 'req-1')
  })

  test('known completed consume is 200', async () => {
    const h = setup()
    h.service.consume.mockResolvedValue({ status: 'no_credit' })
    expect(
      (
        await request(h.app)
          .post(`${prefix}/reset-credits/consume`)
          .set('Authorization', 'Bearer synthetic-admin')
          .send({ execute: true, request_id: 'req-1' })
      ).status
    ).toBe(200)
  })

  test('raw exceptions and attacker-supplied error codes never reach response', async () => {
    const h = setup()
    h.service.usage.mockRejectedValue(
      Object.assign(new Error('secret@example.invalid'), {
        code: 'secret@example.invalid',
        statusCode: 418
      })
    )
    const response = await request(h.app)
      .get(`${prefix}/usage`)
      .set('Authorization', 'Bearer synthetic-admin')
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ success: false, error: { code: 'internal_error' } })
  })
})
