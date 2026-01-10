const axios = require('axios')
const https = require('https')
const { v4: uuidv4 } = require('uuid')

const ProxyHelper = require('../utils/proxyHelper')
const logger = require('../utils/logger')
const {
  mapAntigravityUpstreamModel,
  normalizeAntigravityModelInput,
  getAntigravityModelMetadata
} = require('../utils/antigravityModel')
const { cleanJsonSchemaForGemini } = require('../utils/geminiSchemaCleaner')
const { dumpAntigravityUpstreamRequest } = require('../utils/antigravityUpstreamDump')

const keepAliveAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 30000,
  timeout: 120000,
  maxSockets: 100,
  maxFreeSockets: 10
})

const ANTIGRAVITY_REQUEST_TYPE = 'agent'

// 对齐 谷歌 近期变更：Antigravity 会校验 systemInstruction 结构。
// 采用最短前置提示词 并且只做前置插入，不覆盖用户原有 system parts。
const ANTIGRAVITY_MIN_SYSTEM_PROMPT =
  'You are Antigravity, a powerful agentic AI coding assistant designed by the Google Deepmind team working on Advanced Agentic Coding.You are pair programming with a USER to solve their coding task. The task may require creating a new codebase, modifying or debugging an existing codebase, or simply answering a question.**Proactiveness**'
const ANTIGRAVITY_MIN_SYSTEM_PROMPT_MARKER =
  'You are Antigravity, a powerful agentic AI coding assistant designed by the Google Deepmind team working on Advanced Agentic Coding.'

/**
 * 从 Google API 429 错误响应中解析 retry-after 延迟。
 * [dadongwo] 解析 retry delay 实现。
 * 策略:
 *   1. error.details[] 中找 RetryInfo.retryDelay (如 "0.847655010s")
 *   2. error.details[] 中找 ErrorInfo.metadata.quotaResetDelay (如 "373.801628ms")
 *   3. 正则匹配 error.message 中的 "after Xs"
 * @param {object|string|Buffer} errorBody 错误响应体
 * @returns {number|null} 延迟毫秒数，解析失败返回 null
 */
function parseRetryDelay(errorBody) {
  let parsed = null
  // 安全解析 JSON
  if (typeof errorBody === 'string') {
    try {
      parsed = JSON.parse(errorBody)
    } catch (_) {
      parsed = null
    }
  } else if (Buffer.isBuffer(errorBody)) {
    try {
      parsed = JSON.parse(errorBody.toString('utf8'))
    } catch (_) {
      parsed = null
    }
  } else if (errorBody && typeof errorBody === 'object') {
    parsed = errorBody
  }
  if (!parsed || typeof parsed !== 'object') {
    return null
  }
  const details = parsed.error?.details
  if (Array.isArray(details)) {
    // 策略1: RetryInfo.retryDelay
    for (const detail of details) {
      if (detail?.['@type'] === 'type.googleapis.com/google.rpc.RetryInfo') {
        const { retryDelay } = detail
        if (typeof retryDelay === 'string' && retryDelay) {
          const ms = parseDurationToMs(retryDelay)
          if (ms !== null) {
            return ms
          }
        }
      }
    }
    // 策略2: ErrorInfo.metadata.quotaResetDelay
    for (const detail of details) {
      if (detail?.['@type'] === 'type.googleapis.com/google.rpc.ErrorInfo') {
        const quotaResetDelay = detail.metadata?.quotaResetDelay
        if (typeof quotaResetDelay === 'string' && quotaResetDelay) {
          const ms = parseDurationToMs(quotaResetDelay)
          if (ms !== null) {
            return ms
          }
        }
      }
    }
  }
  // 策略3: 正则匹配 error.message
  const message = parsed.error?.message
  if (typeof message === 'string' && message) {
    const match = message.match(/after\s+(\d+)s\.?/i)
    if (match && match[1]) {
      const seconds = parseInt(match[1], 10)
      if (!Number.isNaN(seconds)) {
        return seconds * 1000
      }
    }
  }
  return null
}
/**
 * 解析 Go 风格 duration 字符串为毫秒 (如 "0.847655010s", "373.801628ms")
 */
function parseDurationToMs(durationStr) {
  if (!durationStr || typeof durationStr !== 'string') {
    return null
  }
  const str = durationStr.trim().toLowerCase()
  // 秒: "0.847655010s"
  if (str.endsWith('s') && !str.endsWith('ms')) {
    const num = parseFloat(str.slice(0, -1))
    if (!Number.isNaN(num)) {
      return Math.round(num * 1000)
    }
  }
  // 毫秒: "373.801628ms"
  if (str.endsWith('ms')) {
    const num = parseFloat(str.slice(0, -2))
    if (!Number.isNaN(num)) {
      return Math.round(num)
    }
  }
  return null
}

function getAntigravityApiUrl() {
  return process.env.ANTIGRAVITY_API_URL || 'https://daily-cloudcode-pa.sandbox.googleapis.com'
}

function normalizeBaseUrl(url) {
  const str = String(url || '').trim()
  return str.endsWith('/') ? str.slice(0, -1) : str
}

function getAntigravityApiUrlCandidates() {
  const configured = normalizeBaseUrl(getAntigravityApiUrl())
  const daily = 'https://daily-cloudcode-pa.sandbox.googleapis.com'
  const prod = 'https://cloudcode-pa.googleapis.com'

  // 若显式配置了自定义 base url，则只使用该地址（不做 fallback，避免意外路由到别的环境）。
  if (process.env.ANTIGRAVITY_API_URL) {
    return [configured]
  }

  // [dadongwo] 默认行为：优先 daily，失败时再尝试 prod。
  if (configured === normalizeBaseUrl(daily)) {
    return [configured, prod]
  }
  if (configured === normalizeBaseUrl(prod)) {
    return [configured, daily]
  }

  return [configured, prod, daily].filter(Boolean)
}

function generateAntigravityProjectId() {
  return `ag-${uuidv4().replace(/-/g, '').slice(0, 16)}`
}

function generateAntigravitySessionId() {
  return `sess-${uuidv4()}`
}

function resolveAntigravityProjectId(projectId, requestData) {
  const candidate = projectId || requestData?.project || requestData?.projectId || null
  return candidate || generateAntigravityProjectId()
}

function resolveAntigravitySessionId(sessionId, requestData) {
  const candidate =
    sessionId || requestData?.request?.sessionId || requestData?.request?.session_id || null
  return candidate || generateAntigravitySessionId()
}

function buildAntigravityEnvelope({ requestData, projectId, sessionId, userPromptId }) {
  const model = mapAntigravityUpstreamModel(requestData?.model)
  const resolvedProjectId = resolveAntigravityProjectId(projectId, requestData)
  const resolvedSessionId = resolveAntigravitySessionId(sessionId, requestData)
  const requestPayload = {
    ...(requestData?.request || {})
  }

  if (requestPayload.session_id !== undefined) {
    delete requestPayload.session_id
  }
  requestPayload.sessionId = resolvedSessionId

  const envelope = {
    project: resolvedProjectId,
    requestId: `req-${uuidv4()}`,
    model,
    userAgent: 'antigravity',
    requestType: ANTIGRAVITY_REQUEST_TYPE,
    request: {
      ...requestPayload
    }
  }

  if (userPromptId) {
    envelope.user_prompt_id = userPromptId
    envelope.userPromptId = userPromptId
  }

  normalizeAntigravityEnvelope(envelope)
  return { model, envelope }
}

function ensureAntigravitySystemInstruction(requestPayload) {
  if (!requestPayload || typeof requestPayload !== 'object') {
    return
  }

  const existing = requestPayload.systemInstruction
  const sys = existing && typeof existing === 'object' ? existing : {}

  sys.role = 'user'

  const parts = Array.isArray(sys.parts) ? sys.parts.slice() : []

  const hasPrompt = parts.some((part) => {
    const text = typeof part?.text === 'string' ? part.text : ''
    return text.includes(ANTIGRAVITY_MIN_SYSTEM_PROMPT_MARKER)
  })
  if (!hasPrompt) {
    parts.unshift({ text: ANTIGRAVITY_MIN_SYSTEM_PROMPT })
  }

  sys.parts = parts
  requestPayload.systemInstruction = sys
}

function normalizeAntigravityThinking(model, requestPayload) {
  if (!requestPayload || typeof requestPayload !== 'object') {
    return
  }

  const { generationConfig } = requestPayload
  if (!generationConfig || typeof generationConfig !== 'object') {
    return
  }
  const { thinkingConfig } = generationConfig
  if (!thinkingConfig || typeof thinkingConfig !== 'object') {
    return
  }

  const normalizedModel = normalizeAntigravityModelInput(model)
  if (thinkingConfig.thinkingLevel && !normalizedModel.startsWith('gemini-3-')) {
    delete thinkingConfig.thinkingLevel
  }

  const metadata = getAntigravityModelMetadata(normalizedModel)
  if (metadata && !metadata.thinking) {
    delete generationConfig.thinkingConfig
    return
  }
  if (!metadata || !metadata.thinking) {
    return
  }

  const budgetRaw = Number(thinkingConfig.thinkingBudget)
  if (!Number.isFinite(budgetRaw)) {
    return
  }
  let budget = Math.trunc(budgetRaw)

  const minBudget = Number.isFinite(metadata.thinking.min) ? metadata.thinking.min : null
  const maxBudget = Number.isFinite(metadata.thinking.max) ? metadata.thinking.max : null

  if (maxBudget !== null && budget > maxBudget) {
    budget = maxBudget
  }

  let effectiveMax = Number.isFinite(generationConfig.maxOutputTokens)
    ? generationConfig.maxOutputTokens
    : null
  let setDefaultMax = false
  if (!effectiveMax && metadata.maxCompletionTokens) {
    effectiveMax = metadata.maxCompletionTokens
    setDefaultMax = true
  }

  if (effectiveMax && budget >= effectiveMax) {
    budget = Math.max(0, effectiveMax - 1)
  }

  if (minBudget !== null && budget >= 0 && budget < minBudget) {
    delete generationConfig.thinkingConfig
    return
  }

  thinkingConfig.thinkingBudget = budget
  if (setDefaultMax) {
    generationConfig.maxOutputTokens = effectiveMax
  }
}

function normalizeAntigravityEnvelope(envelope) {
  if (!envelope || typeof envelope !== 'object') {
    return
  }
  const model = String(envelope.model || '')
  const requestPayload = envelope.request
  if (!requestPayload || typeof requestPayload !== 'object') {
    return
  }

  ensureAntigravitySystemInstruction(requestPayload)

  if (requestPayload.safetySettings !== undefined) {
    delete requestPayload.safetySettings
  }

  // [dadongwo] 有 tools 时默认启用 VALIDATED（除非显式 NONE）
  if (Array.isArray(requestPayload.tools) && requestPayload.tools.length > 0) {
    const existing = requestPayload?.toolConfig?.functionCallingConfig || null
    if (existing?.mode !== 'NONE') {
      const nextCfg = { ...(existing || {}), mode: 'VALIDATED' }
      requestPayload.toolConfig = { functionCallingConfig: nextCfg }
    }
  }

  // [dadongwo] 非 Claude 模型移除 maxOutputTokens（Antigravity 环境不稳定）
  normalizeAntigravityThinking(model, requestPayload)
  if (!model.includes('claude')) {
    if (requestPayload.generationConfig && typeof requestPayload.generationConfig === 'object') {
      delete requestPayload.generationConfig.maxOutputTokens
    }
    return
  }

  // Claude 模型：parametersJsonSchema -> parameters + schema 清洗（避免 $schema / additionalProperties 等触发 400）
  if (!Array.isArray(requestPayload.tools)) {
    return
  }

  for (const tool of requestPayload.tools) {
    if (!tool || typeof tool !== 'object') {
      continue
    }
    const decls = Array.isArray(tool.functionDeclarations)
      ? tool.functionDeclarations
      : Array.isArray(tool.function_declarations)
        ? tool.function_declarations
        : null

    if (!decls) {
      continue
    }

    for (const decl of decls) {
      if (!decl || typeof decl !== 'object') {
        continue
      }
      let schema =
        decl.parametersJsonSchema !== undefined ? decl.parametersJsonSchema : decl.parameters
      if (typeof schema === 'string' && schema) {
        try {
          schema = JSON.parse(schema)
        } catch (_) {
          schema = null
        }
      }

      decl.parameters = cleanJsonSchemaForGemini(schema)
      delete decl.parametersJsonSchema
    }
  }
}

async function request({
  accessToken,
  proxyConfig = null,
  requestData,
  projectId = null,
  sessionId = null,
  userPromptId = null,
  stream = false,
  signal = null,
  params = null,
  timeoutMs = null
}) {
  const { model, envelope } = buildAntigravityEnvelope({
    requestData,
    projectId,
    sessionId,
    userPromptId
  })

  const proxyAgent = ProxyHelper.createProxyAgent(proxyConfig)
  let endpoints = getAntigravityApiUrlCandidates()

  // Claude 模型在 sandbox(daily) 环境下对 tool_use/tool_result 的兼容性不稳定，优先走 prod。
  // 保持可配置优先：若用户显式设置了 ANTIGRAVITY_API_URL，则不改变顺序。
  if (!process.env.ANTIGRAVITY_API_URL && String(model).includes('claude')) {
    const prodHost = 'cloudcode-pa.googleapis.com'
    const dailyHost = 'daily-cloudcode-pa.sandbox.googleapis.com'
    const ordered = []
    for (const u of endpoints) {
      if (String(u).includes(prodHost)) {
        ordered.push(u)
      }
    }
    for (const u of endpoints) {
      if (!String(u).includes(prodHost)) {
        ordered.push(u)
      }
    }
    // 去重并保持 prod -> daily 的稳定顺序
    endpoints = Array.from(new Set(ordered)).sort((a, b) => {
      const av = String(a)
      const bv = String(b)
      const aScore = av.includes(prodHost) ? 0 : av.includes(dailyHost) ? 1 : 2
      const bScore = bv.includes(prodHost) ? 0 : bv.includes(dailyHost) ? 1 : 2
      return aScore - bScore
    })
  }

  const isRetryable = (error) => {
    // 处理网络层面的连接重置或超时（常见于长请求被中间节点切断）
    if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
      return true
    }

    const status = error?.response?.status
    if (status === 429) {
      return true
    }

    // 400/404 的 “model unavailable / not found” 在不同环境间可能表现不同，允许 fallback。
    if (status === 400 || status === 404) {
      const data = error?.response?.data
      const safeToString = (value) => {
        if (typeof value === 'string') {
          return value
        }
        if (value === null || value === undefined) {
          return ''
        }
        // axios responseType=stream 时，data 可能是 stream（存在循环引用），不能 JSON.stringify
        if (typeof value === 'object' && typeof value.pipe === 'function') {
          return ''
        }
        if (Buffer.isBuffer(value)) {
          try {
            return value.toString('utf8')
          } catch (_) {
            return ''
          }
        }
        if (typeof value === 'object') {
          try {
            return JSON.stringify(value)
          } catch (_) {
            return ''
          }
        }
        return String(value)
      }

      const text = safeToString(data)
      const msg = (text || '').toLowerCase()
      return (
        msg.includes('requested model is currently unavailable') ||
        msg.includes('tool_use') ||
        msg.includes('tool_result') ||
        msg.includes('requested entity was not found') ||
        msg.includes('not found')
      )
    }

    return false
  }

  let lastError = null
  let retriedAfterDelay = false

  const attemptRequest = async () => {
    for (let index = 0; index < endpoints.length; index += 1) {
      const baseUrl = endpoints[index]
      const url = `${baseUrl}/v1internal:${stream ? 'streamGenerateContent' : 'generateContent'}`

      const axiosConfig = {
        url,
        method: 'POST',
        ...(params ? { params } : {}),
        headers: getAntigravityHeaders(accessToken, baseUrl),
        data: envelope,
        timeout: stream ? 0 : timeoutMs || 600000,
        ...(stream ? { responseType: 'stream' } : {})
      }

      if (proxyAgent) {
        axiosConfig.httpsAgent = proxyAgent
        axiosConfig.proxy = false
        if (index === 0) {
          logger.info(
            `🌐 Using proxy for Antigravity ${stream ? 'streamGenerateContent' : 'generateContent'}: ${ProxyHelper.getProxyDescription(proxyConfig)}`
          )
        }
      } else {
        axiosConfig.httpsAgent = keepAliveAgent
      }

      if (signal) {
        axiosConfig.signal = signal
      }

      try {
        // 🔍 [诊断日志] 详细记录请求信息，用于排查 429 问题
        const envelopeStr = JSON.stringify(envelope)
        const toolsCount = envelope.request?.tools?.[0]?.functionDeclarations?.length || 0
        const thinkingConfig = envelope.request?.generationConfig?.thinkingConfig
        const hasThinking = !!thinkingConfig
        const contentsCount = envelope.request?.contents?.length || 0

        logger.info(`🔬 [Antigravity诊断] ${stream ? '流式' : '非流式'}请求`, {
          endpoint: stream ? 'streamGenerateContent' : 'generateContent',
          model,
          baseUrl,
          envelopeSize: envelopeStr.length,
          toolsCount,
          hasThinking,
          thinkingBudget: thinkingConfig?.thinkingBudget || 'N/A',
          contentsCount,
          hasParams: !!params,
          paramsAlt: params?.alt || 'N/A'
        })

        // 非流式请求额外警告
        if (!stream && toolsCount > 0) {
          logger.warn(`⚠️ [Antigravity诊断] 非流式请求包含工具定义`, {
            toolsCount,
            model,
            envelopeSize: envelopeStr.length,
            tip: '非流式+工具可能触发 429，考虑改用流式'
          })
        }

        dumpAntigravityUpstreamRequest({
          requestId: envelope.requestId,
          model,
          stream,
          url,
          baseUrl,
          params: axiosConfig.params || null,
          headers: axiosConfig.headers,
          envelope
        }).catch(() => {})
        const response = await axios(axiosConfig)
        return { model, response }
      } catch (error) {
        lastError = error
        const status = error?.response?.status || null

        const hasNext = index + 1 < endpoints.length
        if (hasNext && isRetryable(error)) {
          logger.warn('⚠️ Antigravity upstream error, retrying with fallback baseUrl', {
            status,
            from: baseUrl,
            to: endpoints[index + 1],
            model
          })
          continue
        }
        throw error
      }
    }

    throw lastError || new Error('Antigravity request failed')
  }

  try {
    return await attemptRequest()
  } catch (error) {
    // 如果是 429 RESOURCE_EXHAUSTED 且尚未重试过，等待 2 秒后重试一次
    const status = error?.response?.status
    if (status === 429 && !retriedAfterDelay && !signal?.aborted) {
      const data = error?.response?.data

      // 安全地将 data 转为字符串，避免 stream 对象导致循环引用崩溃
      const safeDataToString = (value) => {
        if (typeof value === 'string') {
          return value
        }
        if (value === null || value === undefined) {
          return ''
        }
        // stream 对象存在循环引用，不能 JSON.stringify
        if (typeof value === 'object' && typeof value.pipe === 'function') {
          return ''
        }
        if (Buffer.isBuffer(value)) {
          try {
            return value.toString('utf8')
          } catch (_) {
            return ''
          }
        }
        if (typeof value === 'object') {
          try {
            return JSON.stringify(value)
          } catch (_) {
            return ''
          }
        }
        return String(value)
      }

      const msg = safeDataToString(data)

      // 🔍 [诊断日志] 详细记录 429 错误信息
      logger.error(`❌ [Antigravity诊断] 429 错误详情`, {
        model,
        stream,
        errorMessage: msg.substring(0, 500),
        responseHeaders: error?.response?.headers,
        isResourceExhausted: msg.toLowerCase().includes('resource_exhausted'),
        isNoCapacity: msg.toLowerCase().includes('no capacity'),
        url: error?.config?.url,
        tip: '如果此错误频繁发生在非流式 + 工具请求上，可能是 API 限制'
      })

      if (
        msg.toLowerCase().includes('resource_exhausted') ||
        msg.toLowerCase().includes('no capacity')
      ) {
        retriedAfterDelay = true
        logger.warn('⏳ Antigravity 429 RESOURCE_EXHAUSTED, waiting 2s before retry', {
          model,
          stream
        })

        //  从响应体解析精确延迟，失败时回退 2000ms
        let parsedData = data
        if (typeof data === 'string') {
          try {
            parsedData = JSON.parse(data)
          } catch (_) {
            parsedData = null
          }
        }
        const delayMs = parseRetryDelay(parsedData) || 2000
        logger.warn(`⏳ Antigravity 429 RESOURCE_EXHAUSTED, waiting ${delayMs}ms before retry`, {
          model,
          parsedDelayMs: delayMs
        })
        await new Promise((resolve) => setTimeout(resolve, delayMs))
        return await attemptRequest()
      }
    }
    throw error
  }
}

async function fetchAvailableModels({ accessToken, proxyConfig = null, timeoutMs = 30000 }) {
  const proxyAgent = ProxyHelper.createProxyAgent(proxyConfig)
  const endpoints = getAntigravityApiUrlCandidates()

  let lastError = null
  for (let index = 0; index < endpoints.length; index += 1) {
    const baseUrl = endpoints[index]
    const url = `${baseUrl}/v1internal:fetchAvailableModels`

    const axiosConfig = {
      url,
      method: 'POST',
      headers: getAntigravityHeaders(accessToken, baseUrl),
      data: {},
      timeout: timeoutMs
    }

    if (proxyAgent) {
      axiosConfig.httpsAgent = proxyAgent
      axiosConfig.proxy = false
      if (index === 0) {
        logger.info(
          `🌐 Using proxy for Antigravity fetchAvailableModels: ${ProxyHelper.getProxyDescription(proxyConfig)}`
        )
      }
    } else {
      axiosConfig.httpsAgent = keepAliveAgent
    }

    try {
      const response = await axios(axiosConfig)
      return response.data
    } catch (error) {
      lastError = error
      const status = error?.response?.status
      const hasNext = index + 1 < endpoints.length
      if (hasNext && (status === 429 || status === 404)) {
        continue
      }
      throw error
    }
  }

  throw lastError || new Error('Antigravity fetchAvailableModels failed')
}

async function countTokens({
  accessToken,
  proxyConfig = null,
  contents,
  model,
  timeoutMs = 30000
}) {
  const upstreamModel = mapAntigravityUpstreamModel(model)

  const proxyAgent = ProxyHelper.createProxyAgent(proxyConfig)
  const endpoints = getAntigravityApiUrlCandidates()

  let lastError = null
  for (let index = 0; index < endpoints.length; index += 1) {
    const baseUrl = endpoints[index]
    const url = `${baseUrl}/v1internal:countTokens`
    const axiosConfig = {
      url,
      method: 'POST',
      headers: getAntigravityHeaders(accessToken, baseUrl),
      data: {
        request: {
          model: `models/${upstreamModel}`,
          contents
        }
      },
      timeout: timeoutMs
    }

    if (proxyAgent) {
      axiosConfig.httpsAgent = proxyAgent
      axiosConfig.proxy = false
      if (index === 0) {
        logger.info(
          `🌐 Using proxy for Antigravity countTokens: ${ProxyHelper.getProxyDescription(proxyConfig)}`
        )
      }
    } else {
      axiosConfig.httpsAgent = keepAliveAgent
    }

    try {
      const response = await axios(axiosConfig)
      return response.data
    } catch (error) {
      lastError = error
      const status = error?.response?.status
      const hasNext = index + 1 < endpoints.length
      if (hasNext && (status === 429 || status === 404)) {
        continue
      }
      throw error
    }
  }

  throw lastError || new Error('Antigravity countTokens failed')
}

module.exports = {
  getAntigravityApiUrl,
  getAntigravityApiUrlCandidates,
  getAntigravityHeaders,
  buildAntigravityEnvelope,
  request,
  fetchAvailableModels,
  countTokens
}
function getAntigravityHeaders(accessToken, baseUrl) {
  const resolvedBaseUrl = baseUrl || getAntigravityApiUrl()
  let host = 'daily-cloudcode-pa.sandbox.googleapis.com'
  try {
    host = new URL(resolvedBaseUrl).host || host
  } catch (e) {
    // ignore
  }

  // 🔧 [dadongwo] 对齐上游 Antigravity Headers
  // 补充缺失的 X-Goog-Api-Client 和 Client-Metadata
  return {
    Host: host,
    'User-Agent': process.env.ANTIGRAVITY_USER_AGENT || 'antigravity/1.11.5 windows/amd64',
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'Accept-Encoding': 'gzip',
    // [dadongwo] 补充 X-Goog-Api-Client 和 Client-Metadata
    'X-Goog-Api-Client': 'google-cloud-sdk vscode_cloudshelleditor/0.1',
    'Client-Metadata': JSON.stringify({
      ideType: 'IDE_UNSPECIFIED',
      ideVersion: 'vscode/1.100.0',
      extensionVersion: '0.1.0',
      surface: 'vscode'
    })
  }
}
