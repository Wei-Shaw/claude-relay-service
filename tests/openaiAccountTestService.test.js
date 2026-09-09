const { Readable } = require('stream')

jest.mock('axios', () => ({ post: jest.fn() }))
jest.mock('../src/services/account/openaiAccountService', () => ({
  getAccount: jest.fn(),
  isTokenExpired: jest.fn(),
  refreshAccountToken: jest.fn(),
  decrypt: jest.fn(),
  updateCodexUsageSnapshot: jest.fn()
}))
jest.mock('../src/utils/proxyHelper', () => ({ createProxyAgent: jest.fn() }))
jest.mock('../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}))

const axios = require('axios')
const accounts = require('../src/services/account/openaiAccountService')
const proxyHelper = require('../src/utils/proxyHelper')
const { testAccount } = require('../src/services/openaiAccountTestService')

const completed = (text = 'OK') => ({
  type: 'response.completed',
  response: {
    status: 'completed',
    output: [{ type: 'message', content: [{ type: 'output_text', text }] }]
  }
})
const encode = (event) => `data: ${JSON.stringify(event)}\n\n`
const quotaHeaders = {
  'x-codex-primary-used-percent': '0',
  'x-codex-primary-window-minutes': '10080',
  'x-codex-primary-reset-after-seconds': '602505',
  'x-codex-secondary-used-percent': '0',
  'x-codex-secondary-window-minutes': '0',
  'x-codex-secondary-reset-after-seconds': '0'
}
const quotaSnapshot = {
  primaryUsedPercent: 0,
  primaryWindowMinutes: 10080,
  primaryResetAfterSeconds: 602505,
  secondaryUsedPercent: 0,
  secondaryWindowMinutes: 0,
  secondaryResetAfterSeconds: 0,
  primaryOverSecondaryPercent: null
}
const respond = (...events) => {
  const wire = events.map(encode).join('')
  axios.post.mockResolvedValue({
    status: 200,
    data: Readable.from([wire.slice(0, 9), wire.slice(9)])
  })
}
const expectSafeFailure = (result, code) => {
  expect(result).toMatchObject({ success: false, code, model: 'gpt-5.5' })
  expect(typeof result.error).toBe('string')
  expect(JSON.stringify(result)).not.toContain('secret-token')
  expect(JSON.stringify(result)).not.toContain('private-upstream-payload')
}

describe('OpenAI OAuth account tests', () => {
  beforeEach(() => {
    jest.resetAllMocks()
    accounts.getAccount.mockResolvedValue({
      id: 'selected-account',
      accountId: 'chatgpt-account',
      accessToken: 'encrypted-token'
    })
    accounts.isTokenExpired.mockReturnValue(false)
    accounts.decrypt.mockReturnValue('secret-token')
    accounts.updateCodexUsageSnapshot.mockResolvedValue(undefined)
    proxyHelper.createProxyAgent.mockReturnValue(null)
  })

  test('saves zero usage and weekly quota from a successful OAuth probe', async () => {
    axios.post.mockResolvedValue({
      status: 200,
      headers: quotaHeaders,
      data: Readable.from([encode(completed())])
    })
    const result = await testAccount('selected-account')
    expect(result).toMatchObject({ success: true, quotaUpdated: true })
    expect(accounts.updateCodexUsageSnapshot).toHaveBeenCalledWith(
      'selected-account',
      quotaSnapshot
    )
  })

  test('does not overwrite quota when the response has no quota headers', async () => {
    respond(completed())
    expect(await testAccount('selected-account')).toMatchObject({
      success: true,
      quotaUpdated: false
    })
    expect(accounts.updateCodexUsageSnapshot).not.toHaveBeenCalled()
  })

  test('saves quota on a rejected rate-limited request without reporting generation success', async () => {
    axios.post.mockRejectedValue({ response: { status: 429, headers: quotaHeaders } })
    const result = await testAccount('selected-account')
    expectSafeFailure(result, 'RATE_LIMITED')
    expect(result.quotaUpdated).toBe(true)
    expect(accounts.updateCodexUsageSnapshot).toHaveBeenCalledWith(
      'selected-account',
      quotaSnapshot
    )
  })

  test.each([200, 429])(
    'quota persistence failure preserves the HTTP %s generation result',
    async (status) => {
      accounts.updateCodexUsageSnapshot.mockRejectedValue(
        new Error('private-upstream-payload secret-token')
      )
      axios.post.mockResolvedValue({
        status,
        headers: quotaHeaders,
        data: Readable.from([encode(completed())])
      })
      const result = await testAccount('selected-account')
      expect(result).toMatchObject({
        success: status === 200,
        quotaUpdated: false,
        quotaError: 'QUOTA_SAVE_FAILED'
      })
      if (status === 429) expectSafeFailure(result, 'RATE_LIMITED')
      expect(JSON.stringify(result)).not.toContain('secret-token')
      expect(JSON.stringify(result)).not.toContain('private-upstream-payload')
    }
  )

  test('tests the selected OAuth account and accepts completed text across SSE chunks', async () => {
    respond(completed())
    const result = await testAccount('selected-account')
    expect(result).toMatchObject({ success: true, model: 'gpt-5.5' })
    expect(result.latencyMs).toBeGreaterThanOrEqual(0)
    expect(Number.isNaN(Date.parse(result.timestamp))).toBe(false)
    expect(accounts.getAccount).toHaveBeenCalledWith('selected-account')
    expect(axios.post).toHaveBeenCalledWith(
      'https://chatgpt.com/backend-api/codex/responses',
      expect.objectContaining({ model: 'gpt-5.5', stream: true, store: false }),
      expect.objectContaining({
        responseType: 'stream',
        headers: expect.objectContaining({
          Authorization: 'Bearer secret-token',
          'chatgpt-account-id': 'chatgpt-account'
        })
      })
    )
    expect(JSON.stringify(result)).not.toContain('secret-token')
  })

  test.each(['response.failed', 'error'])('rejects HTTP 200 SSE %s safely', async (type) => {
    respond({
      type,
      error: { message: 'private-upstream-payload secret-token' },
      response: { error: { message: 'private-upstream-payload' } }
    })
    expectSafeFailure(await testAccount('selected-account'), 'UPSTREAM_ERROR')
  })

  test('does not treat partial text as a completed response', async () => {
    respond({ type: 'response.output_text.delta', delta: 'partial' })
    expectSafeFailure(await testAccount('selected-account'), 'INCOMPLETE_RESPONSE')
  })

  test.each([
    { type: 'response.output_text.delta', delta: 'OK' },
    { type: 'response.output_text.done', text: 'OK' }
  ])(
    'accepts streamed text followed by completion with an empty output array: $type',
    async (event) => {
      respond(event, { type: 'response.completed', response: { status: 'completed', output: [] } })
      expect((await testAccount('selected-account')).success).toBe(true)
    }
  )

  test('a failure after streamed text does not become a successful test', async () => {
    respond(
      { type: 'response.output_text.delta', delta: 'OK' },
      {
        type: 'response.failed',
        response: { status: 'failed', error: { message: 'private-upstream-payload' } }
      }
    )
    expectSafeFailure(await testAccount('selected-account'), 'UPSTREAM_ERROR')
  })

  test('decodes UTF-8 and CRLF boundaries split across network chunks', async () => {
    const wire = Buffer.from(encode(completed('有效回复')).replace(/\n/g, '\r\n'))
    axios.post.mockResolvedValue({
      status: 200,
      data: Readable.from(Array.from(wire, (byte) => Buffer.from([byte])))
    })
    expect((await testAccount('selected-account')).success).toBe(true)
  })

  test('aborts a stream that never completes within the request deadline', async () => {
    jest.useFakeTimers()
    const stream = new Readable({ read() {} })
    axios.post.mockResolvedValue({ status: 200, data: stream })
    try {
      const pending = testAccount('selected-account')
      await jest.advanceTimersByTimeAsync(61000)
      expectSafeFailure(await pending, 'TIMEOUT')
      expect(stream.destroyed).toBe(true)
      expect(axios.post.mock.calls[0][2].signal.aborted).toBe(true)
    } finally {
      stream.destroy()
      jest.useRealTimers()
    }
  })

  test('rejects completion without usable output text', async () => {
    respond(completed('  '))
    expectSafeFailure(await testAccount('selected-account'), 'INVALID_RESPONSE')
  })

  test('does not send requests for an unknown account', async () => {
    accounts.getAccount.mockResolvedValue(null)
    expectSafeFailure(await testAccount('missing'), 'ACCOUNT_NOT_FOUND')
    expect(axios.post).not.toHaveBeenCalled()
  })

  test('refreshes expired credentials and uses the newly persisted token', async () => {
    accounts.isTokenExpired.mockReturnValueOnce(true).mockReturnValue(false)
    accounts.getAccount
      .mockResolvedValueOnce({ id: 'selected-account', accessToken: 'old-cipher' })
      .mockResolvedValue({
        id: 'selected-account',
        accountId: 'chatgpt-account',
        accessToken: 'new-cipher'
      })
    accounts.decrypt.mockImplementation((cipher) =>
      cipher === 'new-cipher' ? 'fresh-token' : 'stale-token'
    )
    respond(completed())
    expect((await testAccount('selected-account')).success).toBe(true)
    expect(accounts.refreshAccountToken.mock.calls[0][0]).toBe('selected-account')
    expect(accounts.getAccount).toHaveBeenCalledTimes(2)
    expect(axios.post.mock.calls[0][2].headers.Authorization).toBe('Bearer fresh-token')
  })

  test('reports refresh failures without leaking exception content', async () => {
    accounts.isTokenExpired.mockReturnValue(true)
    accounts.refreshAccountToken.mockRejectedValue(
      new Error('private-upstream-payload secret-token')
    )
    expectSafeFailure(await testAccount('selected-account'), 'TOKEN_REFRESH_FAILED')
    expect(axios.post).not.toHaveBeenCalled()
  })

  test('applies the same deadline to an expired-token refresh that hangs', async () => {
    jest.useFakeTimers()
    accounts.isTokenExpired.mockReturnValue(true)
    accounts.refreshAccountToken.mockReturnValue(new Promise(() => {}))
    try {
      const pending = testAccount('selected-account')
      await jest.advanceTimersByTimeAsync(61000)
      expectSafeFailure(await pending, 'TIMEOUT')
      expect(axios.post).not.toHaveBeenCalled()
      expect(accounts.refreshAccountToken.mock.calls[0][1].signal.aborted).toBe(true)
    } finally {
      jest.useRealTimers()
    }
  })

  test('routes the OAuth probe through the configured account proxy', async () => {
    const proxy = { type: 'socks5', host: 'localhost', port: 1080 }
    const agent = { marker: 'proxy-agent' }
    accounts.getAccount.mockResolvedValue({
      id: 'selected-account',
      accountId: 'chatgpt-account',
      accessToken: 'encrypted-token',
      proxy
    })
    proxyHelper.createProxyAgent.mockReturnValue(agent)
    respond(completed())
    expect((await testAccount('selected-account')).success).toBe(true)
    expect(proxyHelper.createProxyAgent.mock.calls[0][0]).toEqual(proxy)
    expect(axios.post.mock.calls[0][2]).toMatchObject({ httpsAgent: agent, proxy: false })
  })

  test.each([
    [401, 'AUTH_ERROR'],
    [403, 'AUTH_ERROR'],
    [429, 'RATE_LIMITED'],
    [503, 'UPSTREAM_ERROR']
  ])('classifies HTTP %s without returning raw errors', async (status, code) => {
    axios.post.mockRejectedValue(
      Object.assign(new Error('secret-token'), {
        response: { status, data: { error: 'private-upstream-payload' } }
      })
    )
    expectSafeFailure(await testAccount('selected-account'), code)
  })

  test.each([
    ['ECONNABORTED', 'TIMEOUT'],
    ['ETIMEDOUT', 'TIMEOUT'],
    ['ECONNRESET', 'NETWORK_ERROR']
  ])('classifies transport failure %s safely', async (transportCode, code) => {
    axios.post.mockRejectedValue(
      Object.assign(new Error('private-upstream-payload secret-token'), { code: transportCode })
    )
    expectSafeFailure(await testAccount('selected-account'), code)
  })
})
