const express = require('express')
const { authenticateApiKey } = require('../middleware/auth')
const logger = require('../utils/logger')
const { handleChatCompletion } = require('./openaiClaudeRoutes')
// 从 handlers/geminiHandlers.js 导入 standard 处理函数（支持 OAuth + API Key 双账户类型）
const {
  handleStandardGenerateContent: geminiHandleGenerateContent,
  handleStandardStreamGenerateContent: geminiHandleStreamGenerateContent
} = require('../handlers/geminiHandlers')
const openaiRoutes = require('./openaiRoutes')
const { CODEX_CLI_INSTRUCTIONS } = require('./openaiRoutes')
const apiKeyService = require('../services/apiKeyService')
const GeminiToOpenAIConverter = require('../services/geminiToOpenAI')
const CodexToOpenAIConverter = require('../services/codexToOpenAI')

const router = express.Router()

// 🔍 根据模型名称检测后端类型
function detectBackendFromModel(modelName) {
  if (!modelName) {
    return 'claude' // 默认 Claude
  }

  const model = modelName.toLowerCase()

  // Claude 模型
  if (model.startsWith('claude-')) {
    return 'claude'
  }

  // Gemini 模型
  if (model.startsWith('gemini-')) {
    return 'gemini'
  }

  // OpenAI 模型
  if (model.startsWith('gpt-')) {
    return 'openai'
  }

  // 默认使用 Claude
  return 'claude'
}

// 🚀 智能后端路由处理器
async function routeToBackend(req, res, requestedModel) {
  const backend = detectBackendFromModel(requestedModel)

  logger.info(`🔀 Routing request - Model: ${requestedModel}, Backend: ${backend}`)

  // 检查权限
  const { permissions } = req.apiKey

  if (backend === 'claude') {
    // Claude 后端：通过 OpenAI 兼容层
    if (!apiKeyService.hasPermission(permissions, 'claude')) {
      return res.status(403).json({
        error: {
          message: 'This API key does not have permission to access Claude',
          type: 'permission_denied',
          code: 'permission_denied'
        }
      })
    }
    await handleChatCompletion(req, res, req.apiKey)
  } else if (backend === 'openai') {
    // OpenAI 后端
    if (!apiKeyService.hasPermission(permissions, 'openai')) {
      return res.status(403).json({
        error: {
          message: 'This API key does not have permission to access OpenAI',
          type: 'permission_denied',
          code: 'permission_denied'
        }
      })
    }
    // 响应格式拦截：Codex/Responses → OpenAI Chat Completions
    const codexConverter = new CodexToOpenAIConverter()
    const originalJson = res.json.bind(res)

    // 流式：patch res.write/res.end 拦截 SSE 事件
    // 与 openaiRoutes 保持一致：stream 缺省时视为流式（stream !== false）
    if (req.body.stream !== false) {
      const streamState = codexConverter.createStreamState()
      const sseBuffer = { data: '' }
      const originalWrite = res.write.bind(res)
      const originalEnd = res.end.bind(res)

      res.write = function (chunk, encoding, callback) {
        if (res.statusCode >= 400) {
          return originalWrite(chunk, encoding, callback)
        }

        const str = (typeof chunk === 'string' ? chunk : chunk.toString()).replace(/\r\n/g, '\n')
        sseBuffer.data += str

        let idx
        while ((idx = sseBuffer.data.indexOf('\n\n')) !== -1) {
          const event = sseBuffer.data.slice(0, idx)
          sseBuffer.data = sseBuffer.data.slice(idx + 2)

          if (!event.trim()) {
            continue
          }

          const lines = event.split('\n')
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const jsonStr = line.slice(6)
              if (!jsonStr || jsonStr === '[DONE]') {
                continue
              }

              try {
                const eventData = JSON.parse(jsonStr)
                if (eventData.error) {
                  originalWrite(`data: ${jsonStr}\n\n`)
                  continue
                }
                const converted = codexConverter.convertStreamChunk(
                  eventData,
                  requestedModel,
                  streamState
                )
                for (const c of converted) {
                  originalWrite(c)
                }
              } catch (e) {
                originalWrite(`data: ${jsonStr}\n\n`)
              }
            }
          }
        }

        if (typeof callback === 'function') {
          callback()
        }
        return true
      }

      res.end = function (chunk, encoding, callback) {
        if (res.statusCode < 400) {
          // 处理 res.end(chunk) 传入的最后一块数据
          if (chunk) {
            const str = (typeof chunk === 'string' ? chunk : chunk.toString()).replace(
              /\r\n/g,
              '\n'
            )
            sseBuffer.data += str
            chunk = undefined
          }

          if (sseBuffer.data.trim()) {
            const remaining = `${sseBuffer.data}\n\n`
            sseBuffer.data = ''

            const lines = remaining.split('\n')
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const jsonStr = line.slice(6)
                if (!jsonStr || jsonStr === '[DONE]') {
                  continue
                }
                try {
                  const eventData = JSON.parse(jsonStr)
                  if (eventData.error) {
                    originalWrite(`data: ${jsonStr}\n\n`)
                  } else {
                    const converted = codexConverter.convertStreamChunk(
                      eventData,
                      requestedModel,
                      streamState
                    )
                    for (const c of converted) {
                      originalWrite(c)
                    }
                  }
                } catch (e) {
                  originalWrite(`data: ${jsonStr}\n\n`)
                }
              }
            }
          }

          originalWrite('data: [DONE]\n\n')
        }
        return originalEnd(chunk, encoding, callback)
      }
    }

    // 非流式：patch res.json 拦截 JSON 响应
    // chatgpt.com 后端返回 { type: "response.completed", response: {...} }
    // api.openai.com 后端返回标准 Response 对象 { object: "response", status, output, ... }
    res.json = function (data) {
      if (res.statusCode >= 400) {
        return originalJson(data)
      }
      if (data && (data.type === 'response.completed' || data.object === 'response')) {
        try {
          return originalJson(codexConverter.convertResponse(data, requestedModel))
        } catch (e) {
          logger.debug('Codex response conversion failed, passing through:', e.message)
          return originalJson(data)
        }
      }
      return originalJson(data)
    }

    // 输入转换：Chat Completions → Responses API 格式
    req.body = codexConverter.buildRequestFromOpenAI(req.body)
    // 注入 Codex CLI 系统提示词（与 handleResponses 非 Codex CLI 适配一致）
    req.body.instructions = CODEX_CLI_INSTRUCTIONS
    req._fromUnifiedEndpoint = true
    // 修正请求路径：body 已转为 Responses 格式，路径需与之匹配
    // Express req.path 是只读 getter（派生自 req.url），需改 req.url
    req.url = '/v1/responses'

    return await openaiRoutes.handleResponses(req, res)
  } else if (backend === 'gemini') {
    // Gemini 后端
    if (!apiKeyService.hasPermission(permissions, 'gemini')) {
      return res.status(403).json({
        error: {
          message: 'This API key does not have permission to access Gemini',
          type: 'permission_denied',
          code: 'permission_denied'
        }
      })
    }

    // 将 OpenAI Chat Completions 参数转换为 Gemini 原生格式
    // standard 处理器从 req.body 根层解构 contents/generationConfig 等字段
    const geminiRequest = buildGeminiRequestFromOpenAI(req.body)

    // standard 处理器从 req.params.modelName 获取模型名
    req.params = req.params || {}
    req.params.modelName = requestedModel

    // 平铺到 req.body 根层（保留 messages/stream 等原始字段给 sessionHelper 计算 hash）
    req.body.contents = geminiRequest.contents
    req.body.generationConfig = geminiRequest.generationConfig || {}
    req.body.safetySettings = geminiRequest.safetySettings
    // standard 处理器读取 camelCase: systemInstruction
    if (geminiRequest.system_instruction) {
      req.body.systemInstruction = geminiRequest.system_instruction
    }
    if (geminiRequest.tools) {
      req.body.tools = geminiRequest.tools
    }
    if (geminiRequest.toolConfig) {
      req.body.toolConfig = geminiRequest.toolConfig
    }

    if (req.body.stream) {
      // 响应格式拦截：Gemini SSE → OpenAI Chat Completions chunk
      const geminiConverter = new GeminiToOpenAIConverter()
      const geminiStreamState = geminiConverter.createStreamState()
      const geminiOriginalWrite = res.write.bind(res)
      const geminiOriginalEnd = res.end.bind(res)

      res.write = function (chunk, encoding, callback) {
        if (res.statusCode >= 400) {
          return geminiOriginalWrite(chunk, encoding, callback)
        }

        const converted = geminiConverter.convertStreamChunk(
          chunk,
          requestedModel,
          geminiStreamState
        )
        if (converted) {
          return geminiOriginalWrite(converted, encoding, callback)
        }
        if (typeof callback === 'function') {
          callback()
        }
        return true
      }

      res.end = function (chunk, encoding, callback) {
        if (res.statusCode < 400) {
          // 处理 res.end(chunk) 传入的最后一块数据
          if (chunk) {
            const converted = geminiConverter.convertStreamChunk(
              chunk,
              requestedModel,
              geminiStreamState
            )
            if (converted) {
              geminiOriginalWrite(converted)
            }
            chunk = undefined
          }
          // 刷新 converter 内部 buffer 中的残留数据
          if (geminiStreamState.buffer.trim()) {
            const remaining = geminiConverter.convertStreamChunk(
              '\n\n',
              requestedModel,
              geminiStreamState
            )
            if (remaining) {
              geminiOriginalWrite(remaining)
            }
          }
          geminiOriginalWrite('data: [DONE]\n\n')
        }
        return geminiOriginalEnd(chunk, encoding, callback)
      }

      return await geminiHandleStreamGenerateContent(req, res)
    } else {
      // 响应格式拦截：Gemini JSON → OpenAI chat.completion
      const geminiConverter = new GeminiToOpenAIConverter()
      const geminiOriginalJson = res.json.bind(res)

      res.json = function (data) {
        if (res.statusCode >= 400) {
          return geminiOriginalJson(data)
        }
        if (data && (data.candidates || data.response?.candidates)) {
          return geminiOriginalJson(geminiConverter.convertResponse(data, requestedModel))
        }
        return geminiOriginalJson(data)
      }

      return await geminiHandleGenerateContent(req, res)
    }
  } else {
    return res.status(500).json({
      error: {
        message: `Unsupported backend: ${backend}`,
        type: 'server_error',
        code: 'unsupported_backend'
      }
    })
  }
}

// 🔄 OpenAI 兼容的 chat/completions 端点（智能后端路由）
router.post('/v1/chat/completions', authenticateApiKey, async (req, res) => {
  try {
    // 验证必需参数
    if (!req.body.messages || !Array.isArray(req.body.messages) || req.body.messages.length === 0) {
      return res.status(400).json({
        error: {
          message: 'Messages array is required and cannot be empty',
          type: 'invalid_request_error',
          code: 'invalid_request'
        }
      })
    }

    const requestedModel = req.body.model || 'claude-3-5-sonnet-20241022'
    req.body.model = requestedModel // 确保模型已设置

    // 使用统一的后端路由处理器
    await routeToBackend(req, res, requestedModel)
  } catch (error) {
    logger.error('❌ OpenAI chat/completions error:', error)
    if (!res.headersSent) {
      res.status(500).json({
        error: {
          message: 'Internal server error',
          type: 'server_error',
          code: 'internal_error'
        }
      })
    }
  }
})

// 🔄 OpenAI 兼容的 completions 端点（传统格式，智能后端路由）
router.post('/v1/completions', authenticateApiKey, async (req, res) => {
  try {
    // 验证必需参数
    if (!req.body.prompt) {
      return res.status(400).json({
        error: {
          message: 'Prompt is required',
          type: 'invalid_request_error',
          code: 'invalid_request'
        }
      })
    }

    // 将传统 completions 格式转换为 chat 格式
    const originalBody = req.body
    const requestedModel = originalBody.model || 'claude-3-5-sonnet-20241022'

    req.body = {
      model: requestedModel,
      messages: [
        {
          role: 'user',
          content: originalBody.prompt
        }
      ],
      max_tokens: originalBody.max_tokens,
      temperature: originalBody.temperature,
      top_p: originalBody.top_p,
      stream: originalBody.stream,
      stop: originalBody.stop,
      n: originalBody.n || 1,
      presence_penalty: originalBody.presence_penalty,
      frequency_penalty: originalBody.frequency_penalty,
      logit_bias: originalBody.logit_bias,
      user: originalBody.user
    }

    // 使用统一的后端路由处理器
    await routeToBackend(req, res, requestedModel)
  } catch (error) {
    logger.error('❌ OpenAI completions error:', error)
    if (!res.headersSent) {
      res.status(500).json({
        error: {
          message: 'Failed to process completion request',
          type: 'server_error',
          code: 'internal_error'
        }
      })
    }
  }
})

// --- OpenAI Chat Completions → Gemini 原生请求转换（OpenAI → Gemini 格式映射） ---

function buildGeminiRequestFromOpenAI(body) {
  const request = {}
  const generationConfig = {}
  const messages = body.messages || []

  // 第一遍：收集 assistant tool_calls 的 id→name 映射（用于 tool response 关联）
  const toolCallNames = Object.create(null)
  for (const msg of messages) {
    if (msg.role === 'assistant' && msg.tool_calls) {
      for (const tc of msg.tool_calls) {
        if (tc.id && tc.function?.name) {
          toolCallNames[tc.id] = tc.function.name
        }
      }
    }
  }

  // 第二遍：构建 contents + system_instruction
  const systemParts = []
  const contents = []

  for (const msg of messages) {
    if (msg.role === 'system' || msg.role === 'developer') {
      const text = extractTextContent(msg.content)
      if (text) {
        systemParts.push({ text })
      }
    } else if (msg.role === 'user') {
      const parts = buildContentParts(msg.content)
      if (parts.length > 0) {
        contents.push({ role: 'user', parts })
      }
    } else if (msg.role === 'assistant') {
      // 格式映射: assistant 内容保留 text + image（多模态）
      const parts = buildContentParts(msg.content)
      // tool_calls → functionCall parts
      if (msg.tool_calls) {
        for (const tc of msg.tool_calls) {
          if (tc.function) {
            let args
            try {
              args = JSON.parse(tc.function.arguments || '{}')
            } catch {
              // parse 失败时尝试保留原始内容
              args = tc.function.arguments ? { _raw: tc.function.arguments } : {}
            }
            parts.push({
              functionCall: { name: tc.function.name, args }
            })
          }
        }
      }
      if (parts.length > 0) {
        contents.push({ role: 'model', parts })
      }
    } else if (msg.role === 'tool') {
      // tool response → functionResponse（Gemini 用 user role）
      const name = toolCallNames[msg.tool_call_id] || msg.name || 'unknown'
      let responseContent
      try {
        responseContent =
          typeof msg.content === 'string' ? JSON.parse(msg.content) : msg.content || {}
      } catch {
        responseContent = { result: msg.content }
      }
      contents.push({
        role: 'user',
        parts: [{ functionResponse: { name, response: responseContent } }]
      })
    }
  }

  if (systemParts.length > 0) {
    if (contents.length === 0) {
      // Gemini 格式：只有 system 消息时，将其作为 user content（避免 Gemini 拒绝空 contents）
      contents.push({ role: 'user', parts: systemParts })
    } else {
      request.system_instruction = { parts: systemParts }
    }
  }
  request.contents = contents

  // Generation config
  if (body.temperature !== undefined) {
    generationConfig.temperature = body.temperature
  }
  const maxTokens = body.max_completion_tokens || body.max_tokens
  if (maxTokens !== undefined) {
    generationConfig.maxOutputTokens = maxTokens
  }
  if (body.top_p !== undefined) {
    generationConfig.topP = body.top_p
  }
  if (body.top_k !== undefined) {
    generationConfig.topK = body.top_k
  }
  if (body.n !== undefined && body.n > 1) {
    generationConfig.candidateCount = body.n
  }
  if (body.stop) {
    generationConfig.stopSequences = Array.isArray(body.stop) ? body.stop : [body.stop]
  }

  // modalities → responseModalities（text→TEXT, image→IMAGE, audio→AUDIO）
  if (body.modalities && Array.isArray(body.modalities)) {
    const modalityMap = { text: 'TEXT', image: 'IMAGE', audio: 'AUDIO' }
    const mapped = body.modalities.map((m) => modalityMap[m.toLowerCase()]).filter(Boolean)
    if (mapped.length > 0) {
      generationConfig.responseModalities = mapped
    }
  }

  // image_config → imageConfig（Gemini 格式：aspect_ratio→aspectRatio, image_size→imageSize）
  if (body.image_config) {
    const imageConfig = {}
    if (body.image_config.aspect_ratio) {
      imageConfig.aspectRatio = body.image_config.aspect_ratio
    }
    if (body.image_config.image_size) {
      imageConfig.imageSize = body.image_config.image_size
    }
    if (Object.keys(imageConfig).length > 0) {
      generationConfig.imageConfig = imageConfig
    }
  }

  // reasoning_effort → thinkingConfig（Gemini 格式）
  if (body.reasoning_effort) {
    const effort = body.reasoning_effort.toLowerCase()
    if (effort === 'none') {
      generationConfig.thinkingConfig = { thinkingLevel: 'none', includeThoughts: false }
    } else if (effort === 'auto') {
      // 格式映射: auto → thinkingBudget:-1 (让模型自行决定)
      generationConfig.thinkingConfig = { thinkingBudget: -1, includeThoughts: true }
    } else {
      generationConfig.thinkingConfig = { thinkingLevel: effort, includeThoughts: true }
    }
  }

  // response_format → responseMimeType / responseSchema
  if (body.response_format) {
    if (body.response_format.type === 'json_object') {
      generationConfig.responseMimeType = 'application/json'
    } else if (
      body.response_format.type === 'json_schema' &&
      body.response_format.json_schema?.schema
    ) {
      generationConfig.responseMimeType = 'application/json'
      generationConfig.responseSchema = body.response_format.json_schema.schema
    }
  }

  if (Object.keys(generationConfig).length > 0) {
    request.generationConfig = generationConfig
  }

  // Tools: OpenAI function → Gemini functionDeclarations（OpenAI → Gemini 格式映射）
  if (body.tools && body.tools.length > 0) {
    const functionDeclarations = []
    const extraTools = []
    for (const tool of body.tools) {
      if (tool.type === 'function' && tool.function) {
        const decl = {
          name: tool.function.name,
          description: tool.function.description || ''
        }
        if (tool.function.parameters) {
          // 格式映射: parameters → parametersJsonSchema, 删除 strict
          const schema = { ...tool.function.parameters }
          delete schema.strict
          decl.parametersJsonSchema = schema
        } else {
          decl.parametersJsonSchema = { type: 'object', properties: {} }
        }
        functionDeclarations.push(decl)
      } else if (
        tool.type === 'google_search' ||
        tool.type === 'code_execution' ||
        tool.type === 'url_context'
      ) {
        // 非 function 工具透传，snake_case → camelCase（Gemini 原生格式）
        const typeMap = {
          google_search: 'googleSearch',
          code_execution: 'codeExecution',
          url_context: 'urlContext'
        }
        const geminiType = typeMap[tool.type]
        extraTools.push({ [geminiType]: tool[tool.type] || {} })
      }
    }
    const toolsArray = []
    if (functionDeclarations.length > 0) {
      toolsArray.push({ functionDeclarations })
    }
    toolsArray.push(...extraTools)
    if (toolsArray.length > 0) {
      request.tools = toolsArray
    }
  }

  // tool_choice → toolConfig.functionCallingConfig
  if (body.tool_choice) {
    if (body.tool_choice === 'none') {
      request.toolConfig = { functionCallingConfig: { mode: 'NONE' } }
    } else if (body.tool_choice === 'auto') {
      request.toolConfig = { functionCallingConfig: { mode: 'AUTO' } }
    } else if (body.tool_choice === 'required') {
      request.toolConfig = { functionCallingConfig: { mode: 'ANY' } }
    } else if (typeof body.tool_choice === 'object' && body.tool_choice.function?.name) {
      request.toolConfig = {
        functionCallingConfig: {
          mode: 'ANY',
          allowedFunctionNames: [body.tool_choice.function.name]
        }
      }
    }
  }

  // 默认安全设置（Gemini 格式：最大化允许，避免不必要的内容拦截）
  if (!request.safetySettings) {
    request.safetySettings = [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'OFF' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'OFF' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'OFF' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'OFF' },
      { category: 'HARM_CATEGORY_CIVIC_INTEGRITY', threshold: 'BLOCK_NONE' }
    ]
  }

  return request
}

function extractTextContent(content) {
  if (typeof content === 'string') {
    return content
  }
  if (Array.isArray(content)) {
    return content
      .filter((c) => c.type === 'text')
      .map((c) => c.text)
      .join('')
  }
  return ''
}

function buildContentParts(content) {
  if (typeof content === 'string') {
    return [{ text: content }]
  }
  if (Array.isArray(content)) {
    const parts = []
    for (const item of content) {
      if (item.type === 'text') {
        parts.push({ text: item.text })
      } else if (item.type === 'image_url' && item.image_url?.url) {
        const { url } = item.image_url
        if (url.startsWith('data:')) {
          const match = url.match(/^data:([^;]+);base64,(.+)$/)
          if (match) {
            parts.push({ inlineData: { mimeType: match[1], data: match[2] } })
          }
        }
      }
    }
    return parts
  }
  if (!content) {
    return []
  }
  return [{ text: String(content) }]
}

module.exports = router
module.exports.detectBackendFromModel = detectBackendFromModel
module.exports.routeToBackend = routeToBackend
