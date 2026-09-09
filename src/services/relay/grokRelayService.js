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
      await this._recordUsage(account, apiKeyData, usageData, actualModel, req)
    })

    response.data.on('error', (error) => {
      logger.error('Grok stream error:', error.message)
      req.removeListener('close', handleClientDisconnect)
      res.removeListener('close', handleClientDisconnect)
      if (!res.destroyed) {
        res.end()
      }
    })
  }

  async _handleNormalResponse(response, res, account, apiKeyData, requestedModel, req) {
    const body = response.data || {}
    const usageData = body.usage || body.response?.usage || null
    const actualModel = body.model || body.response?.model || requestedModel
    await this._recordUsage(account, apiKeyData, usageData, actualModel, req)

    const skipHeaders = new Set(['transfer-encoding', 'connection', 'keep-alive'])
    Object.entries(response.headers || {}).forEach(([key, value]) => {
      if (!skipHeaders.has(key.toLowerCase())) {
        res.setHeader(key, value)
      }
    })
    return res.status(response.status).json(body)
  }

  async _recordUsage(account, apiKeyData, usageData, model, req) {
    if (!usageData || !apiKeyData?.id) {
      return
    }
    try {
      const totalInputTokens = Number(usageData.input_tokens || usageData.prompt_tokens || 0) || 0
      const outputTokens = Number(usageData.output_tokens || usageData.completion_tokens || 0) || 0
      const cacheReadTokens = extractOpenAICacheReadTokens(usageData)
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
