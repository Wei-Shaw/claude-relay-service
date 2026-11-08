const express = require('express')
const request = require('supertest')
const { createCodexManagementAuth } = require('../src/middleware/codexManagementAuth')
const { CodexManagementKeysError } = require('../src/services/codexManagementKeysService')

const key = `crsm_${'A'.repeat(43)}`
describe('account-scoped Codex management authentication', () => {
  let app, keysService, admin
  beforeEach(() => {
    keysService = {
      authorize: jest.fn().mockResolvedValue({ id: 'key-1', account_ids: ['account-1'] })
    }
    admin = jest.fn((req, res, next) => {
      if (
        req.headers.authorization !== 'Bearer admin-session' &&
        req.headers.cookie !== 'adminToken=session'
      ) {
        return res.status(401).json({ success: false, error: 'admin_required' })
      }
      req.admin = { id: 'admin-1' }
      return next()
    })
    app = express()
    const child = express.Router({ mergeParams: true })
    child.use(createCodexManagementAuth({ keysService, authenticateAdmin: admin }))
    child.all('/usage', (req, res) =>
      res.json({
        accountId: req.params.accountId,
        management: req.codexManagementKey?.id,
        admin: req.admin?.id
      })
    )
    app.use('/accounts/:accountId/codex', child)
  })
  test.each(['x-api-key', 'Authorization'])(
    'accepts dedicated key from %s and checks parent account',
    async (header) => {
      const response = await request(app)
        .get('/accounts/account-1/codex/usage')
        .set(header, header === 'Authorization' ? `Bearer ${key}` : key)
      expect(response.status).toBe(200)
      expect(keysService.authorize).toHaveBeenCalledWith(key, 'account-1', 'read')
      expect(response.body.management).toBe('key-1')
      expect(admin).not.toHaveBeenCalled()
    }
  )
  test('accepts identical dual headers', async () => {
    const response = await request(app)
      .get('/accounts/account-1/codex/usage')
      .set('x-api-key', key)
      .set('Authorization', `Bearer ${key}`)
    expect(response.status).toBe(200)
  })
  test('POST requests require consume; read-only denial never falls back to Admin', async () => {
    keysService.authorize.mockRejectedValue(
      new CodexManagementKeysError('management_key_forbidden')
    )
    const response = await request(app)
      .post('/accounts/account-1/codex/usage')
      .set('x-api-key', key)
      .set('Cookie', 'adminToken=session')
    expect(response.status).toBe(403)
    expect(keysService.authorize).toHaveBeenCalledWith(key, 'account-1', 'consume')
    expect(admin).not.toHaveBeenCalled()
  })
  test('additional accounts are checked without substituting a default account', async () => {
    keysService.authorize.mockRejectedValue(
      new CodexManagementKeysError('management_key_forbidden')
    )
    const response = await request(app).get('/accounts/account-2/codex/usage').set('x-api-key', key)
    expect(response.status).toBe(403)
    expect(keysService.authorize).toHaveBeenCalledWith(key, 'account-2', 'read')
  })
  test.each([
    { 'x-api-key': 'cr_all-models' },
    { 'x-api-key': 'arbitrary-key' },
    { Authorization: 'Bearer cr_all-models' },
    { 'x-api-key': key, Authorization: 'Bearer other-key' },
    { 'x-api-key': key, Authorization: 'Basic x' },
    { 'x-api-key': 'crsm_bad' }
  ])(
    'rejects non-management/conflicting credentials without legacy fallback: %p',
    async (headers) => {
      const response = await request(app)
        .get('/accounts/account-1/codex/usage')
        .set({ ...headers, Cookie: 'adminToken=session' })
      expect(response.status).toBe(401)
      expect(admin).not.toHaveBeenCalled()
      expect(keysService.authorize).not.toHaveBeenCalled()
    }
  )
  test('unknown valid-shaped management key fails without fallback', async () => {
    keysService.authorize.mockRejectedValue(new CodexManagementKeysError('invalid_management_key'))
    const response = await request(app)
      .get('/accounts/account-1/codex/usage')
      .set('x-api-key', key)
      .set('Cookie', 'adminToken=session')
    expect(response.status).toBe(401)
    expect(admin).not.toHaveBeenCalled()
  })
  test.each([{ Authorization: 'Bearer admin-session' }, { Cookie: 'adminToken=session' }])(
    'ordinary Admin continues existing auth: %p',
    async (headers) => {
      const response = await request(app).post('/accounts/account-1/codex/usage').set(headers)
      expect(response.status).toBe(200)
      expect(response.body.admin).toBe('admin-1')
      expect(admin).toHaveBeenCalledTimes(1)
      expect(keysService.authorize).not.toHaveBeenCalled()
    }
  )
  test.each([{}, { Authorization: 'Bearer fake-session' }])(
    'no/forged session cannot invoke account handler: %p',
    async (headers) => {
      const response = await request(app).get('/accounts/account-1/codex/usage').set(headers)
      expect(response.status).toBe(401)
      expect(keysService.authorize).not.toHaveBeenCalled()
    }
  )
  test.each([{ 'x-admin-token': key }, { Cookie: `adminToken=${key}` }])(
    'does not pass management keys through legacy session transports: %p',
    async (headers) => {
      // Model cookie-parser without importing the production application.
      const req = {
        headers: Object.fromEntries(
          Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value])
        ),
        params: { accountId: 'account-1' },
        method: 'GET',
        cookies: headers.Cookie ? { adminToken: key } : {}
      }
      const res = { set: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn() }
      await createCodexManagementAuth({ keysService, authenticateAdmin: admin })(
        req,
        res,
        jest.fn()
      )
      expect(res.status).toHaveBeenCalledWith(401)
      expect(admin).not.toHaveBeenCalled()
    }
  )
  test('duplicate Authorization headers fail closed before either auth branch', async () => {
    const req = {
      headers: { authorization: `Bearer ${key}` },
      rawHeaders: ['Authorization', `Bearer ${key}`, 'Authorization', 'Bearer fake'],
      params: { accountId: 'account-1' },
      method: 'GET'
    }
    const res = { set: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn() }
    await createCodexManagementAuth({ keysService, authenticateAdmin: admin })(req, res, jest.fn())
    expect(res.status).toHaveBeenCalledWith(401)
    expect(keysService.authorize).not.toHaveBeenCalled()
    expect(admin).not.toHaveBeenCalled()
  })
  test('legacy Admin callback errors cannot escape to Express raw-error handling', async () => {
    admin.mockImplementation((req, res, next) => next(new Error('SECRET internal token')))
    const response = await request(app).get('/accounts/account-1/codex/usage')
    expect(response.status).toBe(503)
    expect(response.body).toEqual({ success: false, error: 'management_key_unavailable' })
  })
  test('storage failure is redacted and never bypassed by admin cookie', async () => {
    keysService.authorize.mockRejectedValue(new Error('password/upstream-token'))
    const response = await request(app)
      .get('/accounts/account-1/codex/usage')
      .set('x-api-key', key)
      .set('Cookie', 'adminToken=session')
    expect(response.status).toBe(503)
    expect(response.body).toEqual({ success: false, error: 'management_key_unavailable' })
    expect(admin).not.toHaveBeenCalled()
  })
  test.each(['put', 'delete', 'patch'])(
    'dedicated key cannot silently treat %s as read',
    async (method) => {
      const response = await request(app)
        [method]('/accounts/account-1/codex/usage')
        .set('x-api-key', key)
      expect(response.status).toBe(403)
      expect(keysService.authorize).not.toHaveBeenCalled()
      expect(admin).not.toHaveBeenCalled()
    }
  )
})
