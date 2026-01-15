const apiKeyService = require('./apiKeyService')
const { convertMessagesToGemini, convertGeminiResponse } = require('./geminiRelayService')
const { normalizeAntigravityModelInput } = require('../utils/antigravityModel')
const antigravityClient = require('./antigravityClient')

function buildRequestData({ messages, model, temperature, maxTokens, sessionId }) {
  const requestedModel = normalizeAntigravityModelInput(model)
  const { contents, systemInstruction } = convertMessagesToGemini(messages)

  const requestData = {
    model: requestedModel,
    request: {
      contents,
      generationConfig: {
        temperature,
        maxOutputTokens: maxTokens,
        candidateCount: 1,
        topP: 0.95,
        topK: 40
      },
      ...(sessionId ? { sessionId } : {})
    }
  }

  if (systemInstruction) {
    requestData.request.systemInstruction = { parts: [{ text: systemInstruction }] }
  }

  return requestData
}

async function* handleStreamResponse(response, model, apiKeyId, accountId) {
  let buffer = ''
  let totalUsage = {
    promptTokenCount: 0,
    candidatesTokenCount: 0,
    totalTokenCount: 0
  }
  let usageRecorded = false

  try {
    for await (const chunk of response.data) {
      buffer += chunk.toString()

      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.trim()) {
          continue
        }

        let jsonData = line
        if (line.startsWith('data: ')) {
          jsonData = line.substring(6).trim()
        }

        if (!jsonData || jsonData === '[DONE]') {
          continue
        }

        try {
          const data = JSON.parse(jsonData)
          const payload = data?.response || data

          if (payload?.usageMetadata) {
            totalUsage = payload.usageMetadata
          }

          const openaiChunk = convertGeminiResponse(payload, model, true)
          if (openaiChunk) {
            yield `data: ${JSON.stringify(openaiChunk)}\n\n`
            const finishReason = openaiChunk.choices?.[0]?.finish_reason
            if (finishReason === 'stop') {
              yield 'data: [DONE]\n\n'

              if (apiKeyId && totalUsage.totalTokenCount > 0) {
                await apiKeyService.recordUsage(
                  apiKeyId,
                  totalUsage.promptTokenCount || 0,
                  totalUsage.candidatesTokenCount || 0,
                  0,
                  0,
                  model,
                  accountId
                )
                usageRecorded = true
              }
              return
            }
          }
        } catch (e) {
          // ignore chunk parse errors
        }
      }
    }
  } finally {
    if (!usageRecorded && apiKeyId && totalUsage.totalTokenCount > 0) {
      await apiKeyService.recordUsage(
        apiKeyId,
        totalUsage.promptTokenCount || 0,
        totalUsage.candidatesTokenCount || 0,
        0,
        0,
        model,
        accountId
      )
    }
  }
}

async function sendAntigravityRequest({
  messages,
  model,
  temperature = 0.7,
  maxTokens = 4096,
  stream = false,
  accessToken,
  proxy,
  apiKeyId,
  signal,
  projectId,
  accountId = null
}) {
  const requestedModel = normalizeAntigravityModelInput(model)

  const requestData = buildRequestData({
    messages,
    model: requestedModel,
    temperature,
    maxTokens,
    sessionId: apiKeyId
  })

  const { response } = await antigravityClient.request({
    accessToken,
    proxyConfig: proxy,
    requestData,
    projectId,
    sessionId: apiKeyId,
    stream,
    signal,
    params: { alt: 'sse' }
  })

  if (stream) {
    return handleStreamResponse(response, requestedModel, apiKeyId, accountId)
  }

  const payload = response.data?.response || response.data
  const openaiResponse = convertGeminiResponse(payload, requestedModel, false)

  if (apiKeyId && openaiResponse?.usage) {
    await apiKeyService.recordUsage(
      apiKeyId,
      openaiResponse.usage.prompt_tokens || 0,
      openaiResponse.usage.completion_tokens || 0,
      0,
      0,
      requestedModel,
      accountId
    )
  }

  return openaiResponse
}

module.exports = {
  sendAntigravityRequest
}
