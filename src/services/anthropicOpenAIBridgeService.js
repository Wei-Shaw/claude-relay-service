const logger = require('../utils/logger')
const { handleResponses } = require('../routes/openaiRoutes')
const { buildResponsesRequestFromAnthropic } = require('./anthropicToOpenaiResponses')

function toAnthropicErrorPayload(message, type = 'api_error') {
  return {
    type: 'error',
    error: {
      type,
      message: message || 'Upstream error'
    }
  }
}

function buildBridgeRequest(anthropicBody, { forceStream }) {
  const requestBody = buildResponsesRequestFromAnthropic(anthropicBody, {
    forceStream
  })

  if (forceStream) {
    requestBody.stream = true
  }

  return requestBody
}

function normalizeErrorForAnthropic(errorBody) {
  if (!errorBody) {
    return toAnthropicErrorPayload('Upstream error')
  }

  if (errorBody.type === 'error' && errorBody.error?.message) {
    return errorBody
  }

  if (typeof errorBody.error?.message === 'string') {
    return toAnthropicErrorPayload(errorBody.error.message, errorBody.error.type || 'api_error')
  }

  if (typeof errorBody.message === 'string') {
    return toAnthropicErrorPayload(errorBody.message)
  }

  return toAnthropicErrorPayload('Upstream error')
}

async function handleAnthropicMessagesToOpenAI(req, res) {
  const requestedModel = req.body?.model || ''
  const anthropicStream = req.body?.stream === true

  logger.info('🔀 Anthropic->OpenAI bridge request received', {
    model: requestedModel,
    stream: anthropicStream
  })

  const originalBody = req.body
  const originalUrl = req.url
  const originalFromUnified = req._fromUnifiedEndpoint
  const originalBridgeFlag = req._anthropicBridge
  const originalBridgeModel = req._anthropicBridgeRequestedModel
  const originalBridgeClientStream = req._anthropicBridgeClientStream

  const restoreState = () => {
    req.body = originalBody
    req.url = originalUrl
    req._fromUnifiedEndpoint = originalFromUnified
    req._anthropicBridge = originalBridgeFlag
    req._anthropicBridgeRequestedModel = originalBridgeModel
    req._anthropicBridgeClientStream = originalBridgeClientStream
  }

  try {
    // Always use upstream stream mode for better compatibility, then map back to
    // Anthropic stream/non-stream response format based on client request.
    req.body = buildBridgeRequest(originalBody, { forceStream: true })
    req.body.stream = true
    req.url = '/v1/responses'
    req._fromUnifiedEndpoint = true
    req._anthropicBridge = true
    req._anthropicBridgeRequestedModel = requestedModel
    req._anthropicBridgeClientStream = anthropicStream
    return await handleResponses(req, res)
  } catch (error) {
    logger.error('❌ Anthropic->OpenAI bridge failed:', error)
    if (!res.headersSent) {
      const status = error.statusCode || error.response?.status || 500
      return res.status(status).json(normalizeErrorForAnthropic(error.response?.data))
    }
    return undefined
  } finally {
    restoreState()
  }
}

async function handleAnthropicCountTokensToOpenAI(req, res) {
  logger.debug('🔢 Anthropic->OpenAI count_tokens fallback response', {
    model: req.body?.model || null
  })

  return res.status(200).json({
    input_tokens: 0
  })
}

module.exports = {
  handleAnthropicMessagesToOpenAI,
  handleAnthropicCountTokensToOpenAI
}
