const zlib = require('zlib')
const logger = require('../utils/logger')
const { getRequestSizeLimitBytes, getRequestSizeLimitMb } = require('../utils/requestSizeLimit')

/**
 * zstd JSON body parser
 * - Only activates when Content-Encoding includes "zstd"
 * - Parses application/json into req.body
 */
function zstdJsonBodyParser(req, res, next) {
  const encoding = (req.headers['content-encoding'] || '').toLowerCase()
  if (!encoding.includes('zstd')) {
    return next()
  }

  const contentType = (req.headers['content-type'] || '').toLowerCase()
  if (!contentType.includes('application/json')) {
    return res.status(415).json({
      error: 'Unsupported Media Type',
      message: 'Only application/json is supported with zstd encoding'
    })
  }

  if (typeof zlib.createZstdDecompress !== 'function') {
    logger.error('zstd decoding is not available in the current Node runtime')
    return res.status(415).json({
      error: 'Unsupported Content-Encoding',
      message: 'zstd is not supported by the current runtime'
    })
  }

  const maxBytes = getRequestSizeLimitBytes()
  const maxMb = getRequestSizeLimitMb()
  const decompressor = zlib.createZstdDecompress()
  const decompressedChunks = []
  let compressedLength = 0
  let decompressedLength = 0
  let handled = false

  const cleanup = () => {
    req.removeListener('data', handleData)
    req.removeListener('end', handleEnd)
    req.removeListener('error', handleReqError)
    req.removeListener('aborted', handleAbort)
    decompressor.removeListener('data', handleDecompressedData)
    decompressor.removeListener('end', handleDecompressedEnd)
    decompressor.removeListener('error', handleDecompressError)
  }

  const finishWithResponse = (status, payload, logLevel = 'warn') => {
    if (handled) {
      return
    }
    handled = true
    cleanup()
    if (typeof req.pause === 'function') {
      req.pause()
    }
    decompressor.destroy()
    if (logLevel && typeof logger[logLevel] === 'function') {
      logger[logLevel](payload.message || payload.error, {
        status,
        limitMb: maxMb,
        ip: req.ip
      })
    }
    if (!res.headersSent) {
      res.status(status).json(payload)
    }
  }

  const abortForSize = (phase, currentLength) => {
    if (handled) {
      return
    }
    logger.security(
      `zstd ${phase} body exceeded limit: ${currentLength} bytes > ${maxBytes} bytes from ${req.ip}`
    )
    cleanup()
    handled = true
    decompressor.destroy()
    if (typeof req.pause === 'function') {
      req.pause()
    }
    if (!res.headersSent) {
      res.status(413).json({
        error: 'Payload Too Large',
        message: `Request body exceeds ${maxMb}MB limit`,
        limit: `${maxMb}MB`
      })
    }
  }

  const handleData = (chunk) => {
    if (handled) {
      return
    }
    compressedLength += chunk.length
    if (compressedLength > maxBytes) {
      abortForSize('compressed', compressedLength)
      return
    }
    try {
      decompressor.write(chunk)
    } catch (error) {
      finishWithResponse(
        400,
        {
          error: 'Invalid Request Body',
          message: 'Failed to decode zstd payload'
        },
        'warn'
      )
    }
  }

  const handleEnd = () => {
    if (handled) {
      return
    }
    try {
      decompressor.end()
    } catch (error) {
      finishWithResponse(
        400,
        {
          error: 'Invalid Request Body',
          message: 'Failed to decode zstd payload'
        },
        'warn'
      )
    }
  }

  const handleReqError = (error) => {
    if (handled) {
      return
    }
    cleanup()
    handled = true
    decompressor.destroy()
    logger.error('Error while receiving zstd request body:', error)
    next(error)
  }

  const handleAbort = () => {
    if (handled) {
      return
    }
    cleanup()
    handled = true
    decompressor.destroy()
    logger.warn('Client aborted zstd request before completion')
  }

  const handleDecompressError = (error) => {
    logger.warn('Failed to decode zstd request body:', error)
    finishWithResponse(
      400,
      {
        error: 'Invalid Request Body',
        message: 'Failed to decode zstd payload'
      },
      'warn'
    )
  }

  const handleDecompressedData = (chunk) => {
    if (handled) {
      return
    }
    decompressedLength += chunk.length
    if (decompressedLength > maxBytes) {
      abortForSize('decompressed', decompressedLength)
      return
    }
    decompressedChunks.push(chunk)
  }

  const handleDecompressedEnd = () => {
    if (handled) {
      return
    }
    cleanup()
    handled = true
    const text = Buffer.concat(decompressedChunks, decompressedLength).toString('utf8')
    if (!text.trim()) {
      req.body = {}
      req._body = true
      delete req.headers['content-encoding']
      return next()
    }

    try {
      req.body = JSON.parse(text)
      req._body = true
      delete req.headers['content-encoding']
      return next()
    } catch (parseError) {
      logger.warn('Failed to parse zstd JSON body:', parseError.message)
      return res.status(400).json({
        error: 'Invalid JSON',
        message: 'Request body is not valid JSON after zstd decoding'
      })
    }
  }

  req.on('data', handleData)
  req.on('end', handleEnd)
  req.on('error', handleReqError)
  req.on('aborted', handleAbort)
  decompressor.on('data', handleDecompressedData)
  decompressor.on('end', handleDecompressedEnd)
  decompressor.on('error', handleDecompressError)
}

module.exports = {
  zstdJsonBodyParser
}
