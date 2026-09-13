const { isTokenRefreshUnauthorizedError } = require('../src/services/account/openaiTokenErrors')

describe('openai token refresh unauthorized detection', () => {
  test.each([
    [{ status: 401 }, '401 status'],
    [{ code: 'invalid_refresh_token' }, 'invalid_refresh_token code'],
    [{ details: { error: { code: 'refresh_token_reused' } } }, 'refresh_token_reused details'],
    [{ response: { data: { error: { code: 'invalid_grant' } } } }, 'invalid_grant response'],
    [
      { response: { data: { error: { type: 'invalid_request_error' } } } },
      'invalid_request_error type'
    ],
    [{ message: '认证失败：Refresh Token 无效' }, 'localized invalid refresh message']
  ])('returns true for permanent refresh-token auth failures: %s', (error) => {
    expect(isTokenRefreshUnauthorizedError(error)).toBe(true)
  })

  test('returns false for transient refresh failures', () => {
    expect(isTokenRefreshUnauthorizedError({ status: 429 })).toBe(false)
    expect(isTokenRefreshUnauthorizedError({ code: 'ECONNRESET' })).toBe(false)
    expect(isTokenRefreshUnauthorizedError(new Error('network timeout'))).toBe(false)
  })
})
