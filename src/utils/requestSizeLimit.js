const DEFAULT_LIMIT_MB = 100

const parseLimit = () => {
  const envValue = process.env.REQUEST_MAX_SIZE_MB
  const parsed = parseInt(envValue, 10)
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed
  }
  return DEFAULT_LIMIT_MB
}

const getRequestSizeLimitMb = () => parseLimit()

const getRequestSizeLimitBytes = () => getRequestSizeLimitMb() * 1024 * 1024

module.exports = {
  getRequestSizeLimitMb,
  getRequestSizeLimitBytes
}
