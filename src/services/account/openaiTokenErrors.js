function isTokenRefreshUnauthorizedError(error) {
  const status = error?.status || error?.response?.status
  const errorCode = error?.details?.error?.code || error?.response?.data?.error?.code || error?.code
  const errorType = error?.details?.error?.type || error?.response?.data?.error?.type
  const message = [
    error?.message,
    error?.details?.error?.message,
    error?.details?.error_description,
    error?.response?.data?.error?.message,
    error?.response?.data?.error_description,
    error?.response?.data?.message
  ]
    .filter(Boolean)
    .join(' ')

  if (status === 401) {
    return true
  }

  return (
    /refresh_token_reused|invalid_grant|token_invalidated|invalid_refresh_token/i.test(
      String(errorCode || '')
    ) ||
    /invalid_request_error/i.test(String(errorType || '')) ||
    /refresh token.*(invalid|expired|reused)|token.*invalidated|Refresh Token 无效|认证失败/.test(
      message
    )
  )
}

module.exports = {
  isTokenRefreshUnauthorizedError
}
