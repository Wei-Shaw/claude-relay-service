/**
 * Langfuse 调用追踪封装
 *
 * 这个模块统一负责将一次 LLM 调用的输入、输出、用量、成本等信息上报到
 * Langfuse 平台。所有内部调用都被 try/catch 包裹，任何 Langfuse 故障都
 * 不会向上抛出到中转主流程。
 *
 * 启用方式：
 *   - 在配置中设置 langfuse.enabled = true
 *   - 在环境变量中提供 LANGFUSE_HOST / LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY
 *
 * 调用方式：
 *   const langfuseTracker = require('./utils/langfuseTracker')
 *   langfuseTracker.captureGeneration({...})
 *   await langfuseTracker.flush()
 */

const config = require('../../config/config')
const logger = require('./logger')

const MAX_INPUT_OUTPUT_CHARS = 256 * 1024 // 256KB 上限，避免 Langfuse 单条事件过大

class LangfuseTracker {
  constructor() {
    this.client = null
    this.initAttempted = false
    this.options = this._readOptions()
  }

  _readOptions() {
    const langfuseConfig = (config && config.langfuse) || {}
    return {
      enabled: langfuseConfig.enabled === true,
      host: langfuseConfig.host || 'https://cloud.langfuse.com',
      publicKey: langfuseConfig.publicKey || '',
      secretKey: langfuseConfig.secretKey || '',
      captureBody: langfuseConfig.captureBody !== false,
      flushAt: Number.isFinite(langfuseConfig.flushAt) ? langfuseConfig.flushAt : 15,
      flushInterval: Number.isFinite(langfuseConfig.flushInterval)
        ? langfuseConfig.flushInterval
        : 10000
    }
  }

  isEnabled() {
    return Boolean(
      this.options.enabled && this.options.publicKey && this.options.secretKey && this.options.host
    )
  }

  _ensureClient() {
    if (this.client || this.initAttempted) {
      return this.client
    }

    this.initAttempted = true

    if (!this.isEnabled()) {
      return null
    }

    try {
      // 延迟加载 SDK，未启用时不付出 require 成本
      // eslint-disable-next-line global-require
      const { Langfuse } = require('langfuse')
      this.client = new Langfuse({
        publicKey: this.options.publicKey,
        secretKey: this.options.secretKey,
        baseUrl: this.options.host,
        flushAt: this.options.flushAt,
        flushInterval: this.options.flushInterval
      })
      logger.info(`📡 Langfuse tracker initialized (host=${this.options.host})`)
    } catch (error) {
      logger.warn(`⚠️ Failed to initialize Langfuse client: ${error.message}`)
      this.client = null
    }

    return this.client
  }

  _truncateForLangfuse(value) {
    if (value === null || value === undefined) {
      return value
    }

    try {
      if (typeof value === 'string') {
        if (value.length <= MAX_INPUT_OUTPUT_CHARS) {
          return value
        }
        return `${value.slice(0, MAX_INPUT_OUTPUT_CHARS)}...[truncated ${
          value.length - MAX_INPUT_OUTPUT_CHARS
        } chars]`
      }

      const json = JSON.stringify(value)
      if (typeof json !== 'string' || json.length <= MAX_INPUT_OUTPUT_CHARS) {
        return value
      }

      return {
        __langfuseTruncated: true,
        originalChars: json.length,
        preview: `${json.slice(0, MAX_INPUT_OUTPUT_CHARS)}...[truncated ${
          json.length - MAX_INPUT_OUTPUT_CHARS
        } chars]`
      }
    } catch (error) {
      return String(value)
    }
  }

  _normalizeTimestamp(value, fallback) {
    if (value instanceof Date) {
      return value
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      return new Date(value)
    }

    if (typeof value === 'string' && value) {
      const parsed = Date.parse(value)
      if (Number.isFinite(parsed)) {
        return new Date(parsed)
      }
    }

    return fallback || new Date()
  }

  /**
   * 捕获一次 LLM 调用记录
   *
   * @param {Object} payload
   * @param {string} payload.apiKeyId
   * @param {string} [payload.apiKeyName]
   * @param {string} [payload.accountId]
   * @param {string} [payload.accountType]
   * @param {string} [payload.model]
   * @param {*}      [payload.input] 完整请求体（messages / contents 等）
   * @param {*}      [payload.output] 完整响应文本或对象
   * @param {Object} [payload.usage] { inputTokens, outputTokens, totalTokens, cacheCreateTokens, cacheReadTokens }
   * @param {Object} [payload.costs] { realCost, ratedCost }
   * @param {Date|number|string} [payload.startTime]
   * @param {Date|number|string} [payload.endTime]
   * @param {string} [payload.sessionId]
   * @param {string} [payload.traceId]
   * @param {string} [payload.requestId]
   * @param {string} [payload.endpoint]
   * @param {boolean} [payload.stream]
   * @param {number} [payload.statusCode]
   * @param {*}      [payload.error]
   * @param {Object} [payload.metadata] 额外的自定义元数据
   */
  captureGeneration(payload = {}) {
    try {
      if (!this.isEnabled()) {
        return
      }

      const client = this._ensureClient()
      if (!client) {
        return
      }

      const now = new Date()
      const startTime = this._normalizeTimestamp(payload.startTime, now)
      const endTime = this._normalizeTimestamp(payload.endTime, now)

      const usage = payload.usage || {}
      const costs = payload.costs || {}

      const sessionId = payload.sessionId || undefined
      const userId = payload.apiKeyId || payload.apiKeyName || undefined

      const baseMetadata = {
        apiKeyId: payload.apiKeyId || null,
        apiKeyName: payload.apiKeyName || null,
        accountId: payload.accountId || null,
        accountType: payload.accountType || null,
        endpoint: payload.endpoint || null,
        method: payload.method || null,
        statusCode: payload.statusCode ?? null,
        stream: payload.stream === true,
        requestId: payload.requestId || null,
        realCost: typeof costs.realCost === 'number' ? costs.realCost : null,
        ratedCost: typeof costs.ratedCost === 'number' ? costs.ratedCost : null,
        cacheCreateTokens: usage.cacheCreateTokens || 0,
        cacheReadTokens: usage.cacheReadTokens || 0,
        ...(payload.metadata && typeof payload.metadata === 'object' ? payload.metadata : {})
      }

      const traceName = payload.traceName || `${payload.accountType || 'llm'}-relay`
      const traceId = payload.traceId || payload.requestId || undefined

      const trace = client.trace({
        id: traceId,
        name: traceName,
        sessionId,
        userId,
        metadata: baseMetadata,
        tags: [payload.accountType, payload.stream === true ? 'stream' : 'non-stream'].filter(
          Boolean
        )
      })

      const generationParams = {
        name: payload.model || payload.accountType || 'generation',
        model: payload.model || null,
        startTime,
        endTime,
        usage: {
          input: usage.inputTokens || 0,
          output: usage.outputTokens || 0,
          total:
            usage.totalTokens ||
            (usage.inputTokens || 0) +
              (usage.outputTokens || 0) +
              (usage.cacheCreateTokens || 0) +
              (usage.cacheReadTokens || 0),
          unit: 'TOKENS'
        },
        metadata: baseMetadata
      }

      if (typeof costs.ratedCost === 'number' || typeof costs.realCost === 'number') {
        generationParams.usage.totalCost =
          typeof costs.ratedCost === 'number' ? costs.ratedCost : costs.realCost
      }

      if (this.options.captureBody) {
        if (payload.input !== undefined && payload.input !== null) {
          generationParams.input = this._truncateForLangfuse(payload.input)
        }
        if (payload.output !== undefined && payload.output !== null) {
          generationParams.output = this._truncateForLangfuse(payload.output)
        }
      } else {
        baseMetadata.bodyCaptured = false
      }

      if (payload.error) {
        generationParams.level = 'ERROR'
        const errorMessage =
          typeof payload.error === 'string'
            ? payload.error
            : payload.error.message || String(payload.error)
        generationParams.statusMessage = errorMessage.slice(0, 500)
        baseMetadata.error = errorMessage
      }

      trace.generation(generationParams)
    } catch (error) {
      try {
        logger.warn(`⚠️ Langfuse captureGeneration failed: ${error.message}`)
      } catch (_logError) {
        // 日志失败也不能影响主流程
      }
    }
  }

  async flush() {
    try {
      if (!this.client) {
        return
      }
      if (typeof this.client.flushAsync === 'function') {
        await this.client.flushAsync()
      } else if (typeof this.client.flush === 'function') {
        await this.client.flush()
      } else if (typeof this.client.shutdownAsync === 'function') {
        await this.client.shutdownAsync()
      }
    } catch (error) {
      try {
        logger.warn(`⚠️ Langfuse flush failed: ${error.message}`)
      } catch (_logError) {
        // ignore
      }
    }
  }

  // 测试辅助方法：重置内部状态，方便单元测试
  _resetForTests() {
    this.client = null
    this.initAttempted = false
    this.options = this._readOptions()
  }
}

module.exports = new LangfuseTracker()
