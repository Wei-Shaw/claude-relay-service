const axios = require('axios')
const crypto = require('crypto')
const ProxyHelper = require('../../utils/proxyHelper')
const logger = require('../../utils/logger')
const { filterForOpenAI } = require('../../utils/headerFilter')
const grokAccountService = require('../account/grokAccountService')
const grokScheduler = require('../scheduler/grokScheduler')
const apiKeyService = require('../apiKeyService')
const config = require('../../../config/config')
const LRUCache = require('../../utils/lruCache')
const upstreamErrorHelper = require('../../utils/upstreamErrorHelper')
const grokHelper = require('../../utils/grokHelper')
const {
  createRequestDetailMeta,
  extractOpenAICacheReadTokens
} = require('../../utils/requestDetailHelper')

const lastUsedAtThrottle = new LRUCache(1000)
const LAST_USED_AT_THROTTLE_MS = 60000

class GrokRelayService {
  constructor() {
    this.defaultTimeout = config.requestTimeout || 600000
  }

  async _throttledUpdateLastUsedAt(accountId) {
    const now = Date.now()
    const lastUpdate = lastUsedAtThrottle.get(accountId)
    if (lastUpdate && now - lastUpdate < LAST_USED_AT_THROTTLE_MS) {
      return
    }
    lastUsedAtThrottle.set(accountId, now, LAST_USED_AT_THROTTLE_MS)
    await grokAccountService.touchLastUsedAt(accountId)
  }

  _bearerCredential(account) {
    if (account.authType === grokHelper.AUTH_TYPES.API_KEY) {
      return account.apiKey
    }
    return account.accessToken
  }

  async handleRequest(req, res, account, apiKeyData) {
    let abortController = null
    const sessionId = req.headers['session_id'] || req.body?.session_id
    const sessionHash = sessionId
      ? crypto.createHash('sha256').update(String(sessionId)).digest('hex')
      : null

    try {
      let fullAccount = await grokAccountService.getAccount(account.id)
      if (!fullAccount) {
        throw new Error('Account not found')
      }

      if (fullAccount.authType === grokHelper.AUTH_TYPES.OAUTH) {
        fullAccount = await grokAccountService.ensureFreshAccessToken(account.id)
      }

      const credential = this._bearerCredential(fullAccount)
      if (!credential) {
        throw new Error('Grok account has no usable credential')
      }

      abortController = new AbortController()
      const handleClientDisconnect = () => {
        logger.info('🔌 Client disconnected, aborting Grok request')
        if (abortController && !abortController.signal.aborted) {
          abortController.abort()
        }
      }
      req.once('close', handleClientDisconnect)
      res.once('close', handleClientDisconnect)

      const baseUrl = grokHelper.resolveAccountBaseUrl({
        authType: fullAccount.authType,
        baseUrl: fullAccount.baseUrl,
        customUpstream: fullAccount.customUpstream
      })
      const requestPath = req.path
      let requestBody = req.body
      // Every upstream mode (cli-chat-proxy included) serves Chat Completions
      // natively, so the client path and protocol are kept. Only xAI field
      // hygiene is applied, as in Sub2API's raw Chat Completions path.
      if (grokHelper.isChatCompletionsPath(requestPath)) {
        requestBody = grokHelper.normalizeChatCompletionsBody(requestBody)
      }
      const targetUrl = grokHelper.joinBaseAndPath(baseUrl, requestPath)
      logger.info(`🎯 Forwarding Grok request to: ${targetUrl}`)

      let headers = {
        ...filterForOpenAI(req.headers),
        Authorization: `Bearer ${credential}`,
        'Content-Type': 'application/json'
      }
      headers = grokHelper.applyCLIProxyHeaders(headers, targetUrl)

      // Do not overwrite the CLI identity User-Agent required by cli-chat-proxy.
      if (!grokHelper.shouldApplyCLIProxyHeaders(targetUrl)) {
        if (fullAccount.userAgent) {
          headers['User-Agent'] = fullAccount.userAgent
        } else if (!headers['User-Agent'] && req.headers['user-agent']) {
          headers['User-Agent'] = req.headers['user-agent']
        }
      }

      const requestOptions = {
        method: req.method,
        url: targetUrl,
        headers,
        data: requestBody,
        timeout: this.defaultTimeout,
        responseType: requestBody?.stream ? 'stream' : 'json',
        validateStatus: () => true,
        signal: abortController.signal
      }

      if (fullAccount.proxy) {
        const proxyAgent = ProxyHelper.createProxyAgent(fullAccount.proxy)
        if (proxyAgent) {
          requestOptions.httpAgent = proxyAgent
          requestOptions.httpsAgent = proxyAgent
          requestOptions.proxy = false
        }
      }

      const response = await axios(requestOptions)
      grokAccountService
        .recordQuotaObservation(account.id, response.headers, {
          statusCode: response.status,
          model: requestBody?.model || req.body?.model || ''
        })
        .catch((error) => {
          logger.debug(`Failed to record Grok quota headers: ${error.message}`)
        })

      if (response.status >= 400) {
        let errorData = response.data
        if (response.data && typeof response.data.pipe === 'function') {
          const chunks = []
          await new Promise((resolve) => {
            response.data.on('data', (chunk) => chunks.push(chunk))
            response.data.on('end', resolve)
            response.data.on('error', resolve)
            setTimeout(resolve, 5000)
          })
          const fullResponse = Buffer.concat(chunks).toString()
          try {
            errorData = JSON.parse(fullResponse)
          } catch {
            errorData = { error: { message: fullResponse || 'Unknown error' } }
          }
        }

        if (response.status === 429) {
          const autoProtectionDisabled =
            fullAccount.disableAutoProtection === true ||
            fullAccount.disableAutoProtection === 'true'
          if (!autoProtectionDisabled) {
            await grokAccountService.markAccountRateLimited(account.id)
            await upstreamErrorHelper
              .markTempUnavailable(
                account.id,
                'grok',
                429,
                upstreamErrorHelper.parseRetryAfter(response.headers)
              )
              .catch(() => {})
          }
          if (sessionHash) {
            await grokScheduler.deleteSessionMapping(sessionHash, apiKeyData?.id).catch(() => {})
          }
          req.removeListener('close', handleClientDisconnect)
          res.removeListener('close', handleClientDisconnect)
          return res.status(429).json(
            errorData && typeof errorData === 'object' && !errorData.pipe
              ? errorData
              : {
                  error: {
                    message: 'Rate limit exceeded',
                    type: 'rate_limit_error',
                    code: 'rate_limit_exceeded'
                  }
                }
          )
        }

        const autoProtectionDisabled =
          fullAccount.disableAutoProtection === true || fullAccount.disableAutoProtection === 'true'
        if (!autoProtectionDisabled && (response.status === 401 || response.status >= 500)) {
          await upstreamErrorHelper
            .markTempUnavailable(account.id, 'grok', response.status)
            .catch(() => {})
        }
        if (sessionHash) {
          await grokScheduler.deleteSessionMapping(sessionHash, apiKeyData?.id).catch(() => {})
        }

        req.removeListener('close', handleClientDisconnect)
        res.removeListener('close', handleClientDisconnect)
        return res
          .status(response.status)
          .json(upstreamErrorHelper.sanitizeErrorForClient(errorData))
      }

      await this._throttledUpdateLastUsedAt(account.id)

      if (req.body?.stream && response.data && typeof response.data.pipe === 'function') {
        return this._handleStreamResponse(
          response,
          res,
          account,
          apiKeyData,
          req.body?.model,
          handleClientDisconnect,
          req
        )
      }

      // 非流式路径：先摘掉断连监听器再回包。其余四条出口（429 / 其它 4xx-5xx /
      // 流式 end / 流式 error）都摘了，只有这里漏掉，导致每个**成功**的非流式请求
      // 在 res 正常关闭时都打印一条「客户端断开」的 INFO，把真实断连淹没掉。
      req.removeListener('close', handleClientDisconnect)
      res.removeListener('close', handleClientDisconnect)
      return this._handleNormalResponse(response, res, account, apiKeyData, req.body?.model, req)
    } catch (error) {
      if (abortController && !abortController.signal.aborted) {
        abortController.abort()
      }
      logger.error('Grok relay error:', {
        message: error.message,
        code: error.code,
        status: error.response?.status
      })

      if (res.headersSent) {
        return res.end()
      }
      return res.status(error.statusCode || 500).json({
        error: {
          message: error.message || 'Internal server error',
          type: 'internal_error'
        }
      })
    }
  }

  async _handleStreamResponse(
    response,
    res,
    account,
    apiKeyData,
    requestedModel,
    handleClientDisconnect,
    req
  ) {
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')

    let usageData = null
    let actualModel = requestedModel
    let buffer = ''
    // 'end' 与 'error' 都可能触发，用量只能记一次
    let usageRecorded = false
    const recordUsageOnce = async () => {
      if (usageRecorded) {
        return
      }
      usageRecorded = true
      await this._recordUsage(account, apiKeyData, usageData, actualModel, req)
    }

    const parseSSEForUsage = (data) => {
      const lines = data.split('\n')
      for (const line of lines) {
        if (!line.startsWith('data:')) {
          continue
        }
        try {
          const jsonStr = line.slice(5).trim()
          if (!jsonStr || jsonStr === '[DONE]') {
            continue
          }
          const eventData = JSON.parse(jsonStr)
          if (eventData.type === 'response.completed' && eventData.response) {
            if (eventData.response.model) {
              actualModel = eventData.response.model
            }
            if (eventData.response.usage) {
              usageData = eventData.response.usage
            }
          }
          if (eventData.usage) {
            usageData = eventData.usage
          }
          if (eventData.model) {
            actualModel = eventData.model
          }
        } catch {
          // ignore parse errors
        }
      }
    }

    response.data.on('data', (chunk) => {
      const text = chunk.toString()
      buffer += text
      parseSSEForUsage(buffer)
      if (!res.destroyed) {
        res.write(chunk)
      }
    })

    response.data.on('end', async () => {
      req.removeListener('close', handleClientDisconnect)
      res.removeListener('close', handleClientDisconnect)
      if (!res.destroyed) {
        res.end()
      }
      await recordUsageOnce()
    })

    response.data.on('error', async (error) => {
      logger.error('Grok stream error:', error.message)
      req.removeListener('close', handleClientDisconnect)
      res.removeListener('close', handleClientDisconnect)
      if (!res.destroyed) {
        res.end()
      }
      // 流中断时也要把已经捕获到的 usage 记下来 —— 客户端在收尾前断开或上游报错，
      // 之前已经生成并计费的 token 会一条都不记，等于免费。
      await recordUsageOnce()
    })
  }

  async _handleNormalResponse(response, res, account, apiKeyData, requestedModel, req) {
    const body = response.data || {}
    const usageData = body.usage || body.response?.usage || null
    const actualModel = body.model || body.response?.model || requestedModel
    await this._recordUsage(account, apiKeyData, usageData, actualModel, req)

    // 与仓库既有惯例对齐（api.js 的 /v1/messages 用的是 content-encoding /
    // transfer-encoding / content-length），另外必须剥掉 set-cookie：上游账号是多个
    // API Key 共享的，把它的会话 cookie 原样转给调用方等于把凭据发给了任意 Key 持有者。
    const skipHeaders = new Set([
      'content-encoding',
      'content-length',
      'transfer-encoding',
      'connection',
      'keep-alive',
      'set-cookie'
    ])
    Object.entries(response.headers || {}).forEach(([key, value]) => {
      if (!skipHeaders.has(key.toLowerCase())) {
        res.setHeader(key, value)
      }
    })
    return res.status(response.status).json(body)
  }

  async _recordUsage(account, apiKeyData, usageData, model, req) {
    if (!apiKeyData?.id) {
      return
    }
    // 上游没回 usage 时不能直接 return —— 那样这次请求在费用统计、每日/总额度、
    // 账号用量、请求详情里会完全不存在。images / videos 这类端点按张计费，响应里
    // 结构性地就没有 usage 字段，直接 return 等于让它们永远记 0 且不可见。
    // 记一条 0 token 的请求，至少请求数与调用记录是真实的。
    if (!usageData) {
      logger.warn(
        `⚠️ Grok upstream returned no usage for ${req?.path || 'unknown path'} (model: ${model || 'unknown'}); recording a zero-token request — 该请求不会计入按 token 的费用额度`
      )
    }
    try {
      const usage = usageData || {}
      const totalInputTokens = Number(usage.input_tokens || usage.prompt_tokens || 0) || 0
      const outputTokens = Number(usage.output_tokens || usage.completion_tokens || 0) || 0
      const cacheReadTokens = extractOpenAICacheReadTokens(usage)
      const actualInputTokens = Math.max(0, totalInputTokens - cacheReadTokens)
      await apiKeyService.recordUsage(
        apiKeyData.id,
        actualInputTokens,
        outputTokens,
        0,
        cacheReadTokens,
        model || req.body?.model || 'grok',
        account.id,
        'grok',
        null,
        createRequestDetailMeta(req, {
          requestBody: req?.body,
          stream: Boolean(req?.body?.stream),
          statusCode: 200
        })
      )
    } catch (error) {
      logger.warn('Failed to record Grok usage:', error.message)
    }
  }
}

module.exports = new GrokRelayService()
