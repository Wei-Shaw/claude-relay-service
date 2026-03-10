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
const { dumpAntigravityUpstreamResponse } = require('../utils/antigravityUpstreamResponseDump')
const {
  parseGoogleErrorReason,
  parseGoogleErrorDetailModel,
  parseGoogleRetryDelayMs
} = require('../utils/googleErrorParser')

const keepAliveAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 30000,
  timeout: 120000,
  maxSockets: 100,
  maxFreeSockets: 10
})

const ANTIGRAVITY_REQUEST_TYPE = 'agent'
const DEFAULT_MODEL_UNAVAILABLE_COOLDOWN_MS = 60 * 1000
const MODEL_UNAVAILABLE_COOLDOWN_ENV = 'ANTIGRAVITY_MODEL_UNAVAILABLE_COOLDOWN_MS'
const DEFAULT_MODEL_CAPACITY_COOLDOWN_MS = 15 * 1000
const MODEL_CAPACITY_COOLDOWN_ENV = 'ANTIGRAVITY_MODEL_CAPACITY_COOLDOWN_MS'
const DEFAULT_MAX_FALLBACKS_PER_REQUEST = 1
const MAX_FALLBACKS_PER_REQUEST_ENV = 'ANTIGRAVITY_MAX_FALLBACKS_PER_REQUEST'
const MAX_UPSTREAM_ERROR_BODY_BYTES = 64 * 1024

// 针对 Antigravity 上游 429 的模型级冷却，避免短时间内打穿账号池/端点。
// 仅用于 Antigravity 上游，不影响 Gemini 直连等其它链路。
const modelUnavailableCooldowns = new Map()

function readEnvPositiveInt(name, fallback) {
  const raw = process.env[name]
  if (raw === undefined || raw === null || raw === '') {
    return fallback
  }
  const parsed = parseInt(String(raw), 10)
  if (!Number.isFinite(parsed) || Number.isNaN(parsed) || parsed <= 0) {
    return fallback
  }
  return parsed
}

function readEnvNonNegativeInt(name, fallback) {
  const raw = process.env[name]
  if (raw === undefined || raw === null || raw === '') {
    return fallback
  }
  const parsed = parseInt(String(raw), 10)
  if (!Number.isFinite(parsed) || Number.isNaN(parsed) || parsed < 0) {
    return fallback
  }
  return parsed
}

function getModelUnavailableCooldownMs() {
  return readEnvPositiveInt(MODEL_UNAVAILABLE_COOLDOWN_ENV, DEFAULT_MODEL_UNAVAILABLE_COOLDOWN_MS)
}

function getModelCapacityCooldownMs() {
  return readEnvPositiveInt(MODEL_CAPACITY_COOLDOWN_ENV, DEFAULT_MODEL_CAPACITY_COOLDOWN_MS)
}

function getMaxFallbacksPerRequest() {
  return readEnvNonNegativeInt(MAX_FALLBACKS_PER_REQUEST_ENV, DEFAULT_MAX_FALLBACKS_PER_REQUEST)
}

function getModelCooldownInfo(model) {
  const key = String(model || '').trim()
  if (!key) {
    return { remainingMs: 0, reason: '' }
  }
  const entry = modelUnavailableCooldowns.get(key)
  if (!entry || !entry.untilMs) {
    return { remainingMs: 0, reason: '' }
  }
  const remaining = entry.untilMs - Date.now()
  if (remaining <= 0) {
    modelUnavailableCooldowns.delete(key)
    return { remainingMs: 0, reason: '' }
  }
  return { remainingMs: remaining, reason: entry.reason ? String(entry.reason) : '' }
}

function setModelCooldown(model, cooldownMs, reason) {
  const key = String(model || '').trim()
  if (!key) {
    return
  }
  const duration = Number.isFinite(cooldownMs) && cooldownMs > 0 ? Math.trunc(cooldownMs) : 0
  if (!duration) {
    return
  }
  modelUnavailableCooldowns.set(key, {
    untilMs: Date.now() + duration,
    reason: reason ? String(reason) : ''
  })
}

function createSyntheticAxiosError({ status, message, data, code, headers } = {}) {
  const err = new Error(message || 'Antigravity upstream error')
  err.name = 'AxiosError'
  err.isAxiosError = true
  err.code = code
  err.response = {
    status: Number.isFinite(status) ? status : 500,
    data: data || null,
    headers: headers || {}
  }
  return err
}

function isReadableStream(value) {
  return (
    value &&
    typeof value === 'object' &&
    typeof value.on === 'function' &&
    typeof value.pipe === 'function'
  )
}

async function readReadableStreamToString(stream, maxBytes = MAX_UPSTREAM_ERROR_BODY_BYTES) {
  if (!isReadableStream(stream)) {
    return null
  }

  return await new Promise((resolve) => {
    let resolved = false
    let totalBytes = 0
    const chunks = []

    const finalize = (text) => {
      if (resolved) {
        return
      }
      resolved = true
      resolve(text)
    }

    const cleanup = () => {
      stream.removeListener('data', onData)
      stream.removeListener('end', onEnd)
      stream.removeListener('error', onError)
    }

    const onData = (chunk) => {
      try {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), 'utf8')
        const remaining = Math.max(0, maxBytes - totalBytes)
        if (remaining <= 0) {
          cleanup()
          try {
            stream.destroy()
          } catch (_) {
            // ignore
          }
          finalize(Buffer.concat(chunks).toString('utf8'))
          return
        }

        if (buf.length > remaining) {
          chunks.push(buf.subarray(0, remaining))
          totalBytes += remaining
          cleanup()
          try {
            stream.destroy()
          } catch (_) {
            // ignore
          }
          finalize(Buffer.concat(chunks).toString('utf8'))
          return
        }

        chunks.push(buf)
        totalBytes += buf.length
      } catch (_) {
        cleanup()
        try {
          stream.destroy()
        } catch (err) {
          // ignore
        }
        finalize(Buffer.concat(chunks).toString('utf8'))
      }
    }

    const onEnd = () => {
      cleanup()
      finalize(Buffer.concat(chunks).toString('utf8'))
    }

    const onError = () => {
      cleanup()
      finalize(Buffer.concat(chunks).toString('utf8'))
    }

    stream.on('data', onData)
    stream.on('end', onEnd)
    stream.on('error', onError)
  })
}

async function normalizeAxiosErrorResponseBody(error) {
  const data = error?.response?.data
  if (!data) {
    return null
  }
  if (typeof data === 'string') {
    return data
  }
  if (Buffer.isBuffer(data)) {
    try {
      const text = data.toString('utf8')
      error.response.data = text
      return text
    } catch (_) {
      return null
    }
  }
  if (isReadableStream(data)) {
    const text = await readReadableStreamToString(data)
    if (typeof text === 'string') {
      error.response.data = text
      return text
    }
    return null
  }
  if (typeof data === 'object') {
    try {
      const json = JSON.stringify(data)
      error.response.data = json
      return json
    } catch (_) {
      return null
    }
  }
  const text = String(data)
  error.response.data = text
  return text
}

function pickUpstreamResponseHeaders(headers) {
  if (!headers || typeof headers !== 'object') {
    return null
  }
  const get = (key) => {
    const direct = headers[key]
    if (direct !== undefined) {
      return direct
    }
    const lower = String(key).toLowerCase()
    return headers[lower]
  }
  const picked = {
    'retry-after': get('retry-after') || null,
    'x-cloudaicompanion-trace-id': get('x-cloudaicompanion-trace-id') || null,
    'content-type': get('content-type') || null,
    'content-length': get('content-length') || null,
    date: get('date') || null,
    server: get('server') || null
  }
  return picked
}

// 对齐 谷歌 近期变更：Antigravity 会校验 systemInstruction 结构。
// 采用最短前置提示词 并且只做前置插入，不覆盖用户原有 system parts。
const ANTIGRAVITY_MIN_SYSTEM_PROMPT =
  'You are Antigravity, a powerful agentic AI coding assistant designed by the Google Deepmind team working on Advanced Agentic Coding.You are pair programming with a USER to solve their coding task. The task may require creating a new codebase, modifying or debugging an existing codebase, or simply answering a question.**Proactiveness**'
const ANTIGRAVITY_MIN_SYSTEM_PROMPT_MARKER =
  'You are Antigravity, a powerful agentic AI coding assistant designed by the Google Deepmind team working on Advanced Agentic Coding.'

function getAntigravityApiUrl() {
  return process.env.ANTIGRAVITY_API_URL || 'https://cloudcode-pa.googleapis.com'
}

function normalizeBaseUrl(url) {
  const str = String(url || '').trim()
  return str.endsWith('/') ? str.slice(0, -1) : str
}

function getAntigravityApiUrlCandidates() {
  const configured = normalizeBaseUrl(getAntigravityApiUrl())
  const daily = 'https://daily-cloudcode-pa.googleapis.com'
  const prod = 'https://cloudcode-pa.googleapis.com'
  const dailySandbox = 'https://daily-cloudcode-pa.sandbox.googleapis.com'

  // 若显式配置了自定义 base url，则只使用该地址（除非显式开启 fallback）。
  if (process.env.ANTIGRAVITY_API_URL) {
    const allowFallback =
      process.env.ANTIGRAVITY_API_URL_ALLOW_FALLBACK === 'true' ||
      process.env.ANTIGRAVITY_API_URL_ALLOW_FALLBACK === '1'
    if (!allowFallback) {
      return [configured]
    }
  }

  // [dadongwo] 默认行为：优先 prod，失败时再尝试 daily/dailySandbox。
  const defaults = [prod, daily, dailySandbox]
  if (defaults.map(normalizeBaseUrl).includes(configured)) {
    // 保持 configured 第一
    const others = defaults.filter((u) => normalizeBaseUrl(u) !== configured)
    return [configured, ...others]
  }

  return [configured, ...defaults]
}

function getAntigravityHeaders(accessToken, baseUrl) {
  const resolvedBaseUrl = baseUrl || getAntigravityApiUrl()
  let host = 'daily-cloudcode-pa.googleapis.com'
  try {
    host = new URL(resolvedBaseUrl).host || host
  } catch (e) {
    // ignore
  }

  // 🔧 [dadongwo] 对齐上游 Antigravity Headers
  // 补充缺失的 X-Goog-Api-Client 和 Client-Metadata
  return {
    Host: host,
    'User-Agent': process.env.ANTIGRAVITY_USER_AGENT || 'antigravity/1.16.5 windows/amd64',
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'Accept-Encoding': 'gzip',
    // [dadongwo] 补充 X-Goog-Api-Client 和 Client-Metadata
    'X-Goog-Api-Client': 'google-cloud-sdk vscode_cloudshelleditor/0.1',
    'Client-Metadata': JSON.stringify({
      ideType: 'IDE_UNSPECIFIED',
      ideVersion: 'vscode/1.107.0',
      extensionVersion: '1.16.5',
      surface: 'vscode'
    })
  }
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
  // Antigravity Gemini 路径保持 AUTO（避免过度校验导致 tool_call 异常）
  if (
    Array.isArray(requestPayload.tools) &&
    requestPayload.tools.length > 0 &&
    !String(model).toLowerCase().startsWith('gemini-')
  ) {
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

  const cooldownInfo = getModelCooldownInfo(model)
  if (cooldownInfo.remainingMs > 0) {
    const retryAfterSeconds = Math.max(1, Math.ceil(cooldownInfo.remainingMs / 1000))
    const cooldownReason = String(cooldownInfo.reason || '').trim()
    const cooldownMessage =
      cooldownReason === 'MODEL_CAPACITY_EXHAUSTED'
        ? `Model capacity exhausted (cooldown ${retryAfterSeconds}s)`
        : `The requested model is currently unavailable (cooldown ${retryAfterSeconds}s)`
    throw createSyntheticAxiosError({
      status: 429,
      code: 'ANTIGRAVITY_MODEL_COOLDOWN',
      message: cooldownMessage,
      data: { error: { message: cooldownMessage, reason: cooldownReason || null } },
      headers: { 'retry-after': String(retryAfterSeconds) }
    })
  }

  const proxyAgent = ProxyHelper.createProxyAgent(proxyConfig)
  let endpoints = getAntigravityApiUrlCandidates()
  const maxFallbacksPerRequest = getMaxFallbacksPerRequest()
  let fallbackCount = 0

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

    // ✅ 仅在显式允许 fallback 时，才放宽 endpoint 级 404
    const allowFallback =
      process.env.ANTIGRAVITY_API_URL_ALLOW_FALLBACK === 'true' ||
      process.env.ANTIGRAVITY_API_URL_ALLOW_FALLBACK === '1'

    // 400/404 的 “model unavailable / not found” 在不同环境间可能表现不同，允许 fallback。
    if (status === 400 || status === 404) {
      // ✅ 关键：v1internal endpoint 404（比如 API 版本/路径失效）时，直接允许 fallback
      // 不改 400 的严格逻辑，避免影响正常参数错误等其它功能
      if (allowFallback && status === 404) {
        const reqUrl = String(error?.config?.url || '')
        if (reqUrl.includes('/v1internal:')) {
          return true
        }
      }

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
        const toolsCount = Array.isArray(envelope.request?.tools)
          ? envelope.request.tools.reduce((sum, tool) => {
              const decls = Array.isArray(tool?.functionDeclarations)
                ? tool.functionDeclarations
                : Array.isArray(tool?.function_declarations)
                  ? tool.function_declarations
                  : []
              return sum + decls.length
            }, 0)
          : 0
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
        const upstreamHeaders = error?.response?.headers || null
        const upstreamBodyText = await normalizeAxiosErrorResponseBody(error)
        const upstreamReason = parseGoogleErrorReason(upstreamBodyText)
        const upstreamModel = parseGoogleErrorDetailModel(upstreamBodyText)
        const retryDelayMs = parseGoogleRetryDelayMs(upstreamBodyText)

        dumpAntigravityUpstreamResponse({
          requestId: envelope.requestId,
          model,
          statusCode: status,
          statusText: error?.response?.statusText || null,
          responseType: 'error',
          headers: pickUpstreamResponseHeaders(upstreamHeaders),
          summary: {
            baseUrl,
            url,
            stream: Boolean(stream),
            reason: upstreamReason,
            model: upstreamModel,
            retryDelayMs: retryDelayMs || null
          },
          error: {
            name: error?.name || null,
            code: error?.code || null,
            message: error?.message || null
          },
          rawData: typeof upstreamBodyText === 'string' ? upstreamBodyText.slice(0, 4096) : null
        }).catch(() => {})

        const hasNext = index + 1 < endpoints.length
        const isQuotaOrRateLimited =
          status === 429 &&
          (upstreamReason === 'QUOTA_EXHAUSTED' || upstreamReason === 'RATE_LIMIT_EXCEEDED')
        const canFallback =
          hasNext &&
          !isQuotaOrRateLimited &&
          fallbackCount < maxFallbacksPerRequest &&
          isRetryable(error)

        if (canFallback) {
          logger.warn('⚠️ Antigravity upstream error, retrying with fallback baseUrl', {
            status,
            from: baseUrl,
            to: endpoints[index + 1],
            model,
            reason: upstreamReason || undefined,
            fallbackCount: fallbackCount + 1,
            maxFallbacksPerRequest
          })
          fallbackCount += 1
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
    const status = error?.response?.status
    if (status === 429 && !signal?.aborted) {
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
      const msgLower = msg.toLowerCase()
      const upstreamReason = parseGoogleErrorReason(data) || null
      const retryDelayMs = parseGoogleRetryDelayMs(data)
      const traceId =
        error?.response?.headers?.['x-cloudaicompanion-trace-id'] ||
        error?.response?.headers?.['X-Cloudaicompanion-Trace-Id'] ||
        null

      error.antigravity = {
        ...(error.antigravity && typeof error.antigravity === 'object' ? error.antigravity : {}),
        reason: upstreamReason,
        retryDelayMs: retryDelayMs || null,
        traceId
      }

      // 🔍 [诊断日志] 详细记录 429 错误信息
      logger.error(`❌ [Antigravity诊断] 429 错误详情`, {
        model,
        stream,
        errorMessage: msg.substring(0, 500),
        reason: upstreamReason,
        retryDelayMs: retryDelayMs || null,
        traceId,
        responseHeaders: error?.response?.headers,
        isResourceExhausted: msgLower.includes('resource_exhausted'),
        isNoCapacity: msgLower.includes('no capacity'),
        isModelUnavailable: msgLower.includes('requested model is currently unavailable'),
        url: error?.config?.url,
        tip: '如果此错误频繁发生在非流式 + 工具请求上，可能是 API 限制'
      })

      // 429：按 reason 分流
      if (upstreamReason === 'RATE_LIMIT_EXCEEDED' || upstreamReason === 'QUOTA_EXHAUSTED') {
        // 交由上层（账号池/调度器）处理：这里不做延迟重试，避免同账号反复撞限流。
        if (retryDelayMs && retryDelayMs > 0 && error?.response?.headers) {
          error.response.headers['retry-after'] = String(
            Math.max(1, Math.ceil(retryDelayMs / 1000))
          )
        }
      } else {
        const looksLikeCapacityExhausted =
          upstreamReason === 'MODEL_CAPACITY_EXHAUSTED' ||
          (!upstreamReason && msgLower.includes('no capacity'))

        if (looksLikeCapacityExhausted) {
          if (!retriedAfterDelay) {
            retriedAfterDelay = true
            const delayMs = retryDelayMs && retryDelayMs > 0 ? retryDelayMs : 2000
            const boundedDelayMs = Math.min(delayMs, 10000)
            logger.warn(
              `⏳ Antigravity 429 capacity exhausted, waiting ${boundedDelayMs}ms before retry`,
              {
                model,
                stream,
                reason: upstreamReason || undefined,
                parsedDelayMs: retryDelayMs || null
              }
            )
            await new Promise((resolve) => setTimeout(resolve, boundedDelayMs))
            return await attemptRequest()
          }

          // 二次失败：进入模型级冷却，避免短时间内反复打穿（不做模型降级）。
          const cooldownMs = Math.max(getModelCapacityCooldownMs(), retryDelayMs || 0)
          setModelCooldown(model, cooldownMs, 'MODEL_CAPACITY_EXHAUSTED')
          if (error?.response?.headers) {
            error.response.headers['retry-after'] = String(
              Math.max(1, Math.ceil(cooldownMs / 1000))
            )
          }
          logger.warn('⏳ Antigravity model capacity exhausted, entering model cooldown', {
            model,
            cooldownMs
          })
        }
      }

      // 模型不可用：按模型级冷却处理，避免短时间内反复请求。
      if (msgLower.includes('requested model is currently unavailable')) {
        const cooldownMs =
          (retryDelayMs && retryDelayMs > 0 ? retryDelayMs : null) ||
          getModelUnavailableCooldownMs()
        setModelCooldown(model, cooldownMs, 'model_unavailable')
        logger.warn('⏳ Antigravity model unavailable, entering cooldown', {
          model,
          cooldownMs
        })
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
