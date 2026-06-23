function getErrorCode(error) {
  return error?.code || error?.errno || error?.cause?.code || ''
}

function isClientConnectionError(error) {
  const code = getErrorCode(error)
  if (
    code === 'EPIPE' ||
    code === 'ECONNRESET' ||
    code === 'ECONNABORTED' ||
    code === 'ERR_STREAM_WRITE_AFTER_END' ||
    code === 'ERR_STREAM_DESTROYED' ||
    code === -32 ||
    code === -54
  ) {
    return true
  }

  const message = String(typeof error === 'string' ? error : error?.message || '').toLowerCase()
  return (
    message.includes('write epipe') ||
    message.includes('broken pipe') ||
    message.includes('socket hang up') ||
    message.includes('write after end')
  )
}

function logClientConnectionError(logger, message, error, metadata = {}) {
  logger?.warn?.(message, {
    code: getErrorCode(error) || undefined,
    message: error?.message,
    ...metadata
  })
}

function isResponseWritable(res) {
  return !!res && !res.destroyed && !res.writableEnded
}

function safeWriteToResponse(res, chunk, logger, context = 'response') {
  if (!isResponseWritable(res)) {
    return false
  }

  try {
    res.write(chunk)
    return true
  } catch (error) {
    if (isClientConnectionError(error)) {
      logClientConnectionError(logger, `Client connection closed while writing ${context}`, error)
      return false
    }
    throw error
  }
}

function safeEndResponse(res, logger, context = 'response') {
  if (!isResponseWritable(res)) {
    return false
  }

  try {
    res.end()
    return true
  } catch (error) {
    if (isClientConnectionError(error)) {
      logClientConnectionError(logger, `Client connection closed while ending ${context}`, error)
      return false
    }
    throw error
  }
}

function attachResponseErrorHandler(res, logger, context = 'response') {
  if (!res || typeof res.on !== 'function') {
    return () => {}
  }

  const onError = (error) => {
    if (isClientConnectionError(error)) {
      logClientConnectionError(logger, `Client connection error on ${context}`, error)
      return
    }

    logger?.error?.(`Response stream error on ${context}:`, error)
  }

  res.on('error', onError)
  return () => {
    if (typeof res.removeListener === 'function') {
      res.removeListener('error', onError)
    }
  }
}

module.exports = {
  attachResponseErrorHandler,
  isClientConnectionError,
  isResponseWritable,
  safeEndResponse,
  safeWriteToResponse
}
