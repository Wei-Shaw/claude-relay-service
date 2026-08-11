/**
 * Grok / xAI 转发服务
 * OpenAI 兼容 chat/completions + responses；AbortController 清理；usage 捕获
 */

const axios = require('axios')
const crypto = require('crypto')
const logger = require('../../utils/logger')
const config = require('../../../config/config')
const redis = require('../../models/redis')
const { RedisKeys } = require('../../constants/redisKeys')
const grokAccountService = require('../account/grokAccountService')
const grokScheduler = require('../scheduler/grokScheduler')
const apiKeyService = require('../apiKeyService')
const CodexToOpenAIConverter = require('../codexToOpenAI')
const { onClientDisconnect } = require('../../utils/clientDisconnect')
const { buildClientError } = require('../../utils/clientErrorBuilder')
const upstreamErrorHelper = require('../../utils/upstreamErrorHelper')
const proxyResolver = require('../../utils/proxyResolver')
const xaiHelper = require('../../utils/xaiHelper')
const {
  stripSsePingFrames,
  isChatBridgeEligible,
  chatToResponsesBody,
  maybeInjectFreeCacheTools,
  buildGrokCompactRequestBody,
  convertGrokResponseToOpenAICompact,
  shouldFailoverGrokStatus,
  isInvalidEncryptedContentError,
  stripEncryptedReasoningContent,
  videoSessionHash
} = require('../../utils/grokProtocol')

class GrokRelayService {
  constructor() {
    this.defaultTimeout = config.proxy?.timeout || 600000
  }

  async relayChatCompletions(req, res, apiKeyData, sessionHash = null) {
    return this._relay(req, res, apiKeyData, sessionHash, 'chat')
  }

  async relayResponses(req, res, apiKeyData, sessionHash = null) {
    // compact 子路径：OpenAI /responses/compact → Grok 总结轮
    const path = String(req.path || req.url || '')
    if (path.includes('/compact')) {
      return this._relay(req, res, apiKeyData, sessionHash, 'responses_compact')
    }
    return this._relay(req, res, apiKeyData, sessionHash, 'responses')
  }

  async relayMedia(req, res, apiKeyData, endpoint, sessionHash = null) {
    return this._relay(req, res, apiKeyData, sessionHash, endpoint)
  }

  async _relay(req, res, apiKeyData, sessionHash, endpointKind) {
    let abortController = null
    let detachClientDisconnect = () => {}
    let proxyResolution = null
    let account = null

    try {
      const requestedModel = req.body?.model || ''
      const mediaGeneration =
        endpointKind === 'images_generations' ||
        endpointKind === 'images_edits' ||
        endpointKind === 'videos_generations' ||
        endpointKind === 'videos_edits' ||
        endpointKind === 'videos_extensions'

      // 视频 status/content：优先绑定创建时的账户
      let forcedAccountId = null
      if (endpointKind === 'video_status' || endpointKind === 'video_content') {
        const requestId = req.params.requestId || req.params.request_id
        if (requestId && apiKeyData?.id) {
          const stickyKey = RedisKeys.session.unifiedGrokMapping(
            videoSessionHash(requestId, apiKeyData.id)
          )
          try {
            forcedAccountId = await redis.getSessionAccountMapping?.(stickyKey)
          } catch (error) {
            console.error(error)
          }
        }
      }

      if (forcedAccountId) {
        account = await grokAccountService.getAccount(forcedAccountId, { decryptSecrets: true })
        if (!account) {
          forcedAccountId = null
        }
      }
      if (!account) {
        account = await grokScheduler.selectAccount(apiKeyData, requestedModel, sessionHash, {
          mediaGeneration
        })
      }
      if (!account) {
        // selectAccount 正常应直接 throw；此处兜底并带可区分语义
        const error = new Error('No available Grok account')
        error.statusCode = apiKeyData?.grokAccountId ? 403 : 402
        error.code = apiKeyData?.grokAccountId ? 'grok_binding_unavailable' : 'grok_pool_exhausted'
        error.type = apiKeyData?.grokAccountId ? 'binding_error' : 'resource_exhausted'
        throw error
      }

      // 再取一次保证 token 新鲜
      account = (await grokAccountService.ensureFreshToken(account.id)) || account

      let token = account.authType === 'apikey' ? account.apiKey : account.accessToken
      if (!token) {
        throw new Error('Grok account has no usable credential')
      }

      abortController = new AbortController()
      detachClientDisconnect = onClientDisconnect(
        res,
        () => {
          if (abortController && !abortController.signal.aborted) {
            abortController.abort()
          }
        },
        'Grok request'
      )

      let isStream =
        Boolean(req.body?.stream) &&
        !String(endpointKind).startsWith('images') &&
        !String(endpointKind).startsWith('videos') &&
        endpointKind !== 'responses_compact'

      // 媒体生成：OAuth Free fail-closed
      if (mediaGeneration) {
        const eligibility = await grokAccountService.ensureMediaEligible(account.id)
        if (!eligibility.eligible) {
          const clientError = buildClientError({
            statusCode: 503,
            protocol: 'openai',
            upstreamBody: {
              error: {
                message: `No eligible Grok media account (${eligibility.reason})`,
                type: 'grok_media_no_eligible_account',
                code: eligibility.reason
              }
            }
          })
          return res.status(clientError.statusCode).json(clientError.body)
        }
        account = (await grokAccountService.ensureFreshToken(account.id)) || account
        token = account.authType === 'apikey' ? account.apiKey : account.accessToken
      }

      let targetUrl = this._buildTargetUrl(
        account,
        endpointKind === 'responses_compact' ? 'responses' : endpointKind,
        req
      )
      let body = this._prepareBody(req.body, endpointKind)
      let effectiveEndpointKind = endpointKind
      let reverseBridgeToChat = false
      const originalChatModel = requestedModel

      // compact 改写
      if (endpointKind === 'responses_compact') {
        body = buildGrokCompactRequestBody(body)
        isStream = false
        effectiveEndpointKind = 'responses'
        targetUrl = this._buildTargetUrl(account, 'responses', req)
        logger.info(`[GrokRelay] compact rewrite account=${account.id}`)
      }

      // chat → responses 桥（仅当资格满足；否则 raw chat）
      if (endpointKind === 'chat') {
        const bridge = isChatBridgeEligible(body)
        const preferBridge =
          account.authType === 'oauth' ||
          account.preferResponsesBridge === true ||
          account.preferResponsesBridge === 'true'
        if (preferBridge && bridge.ok) {
          effectiveEndpointKind = 'responses'
          reverseBridgeToChat = true
          targetUrl = this._buildTargetUrl(account, 'responses', req)
          body = maybeInjectFreeCacheTools(chatToResponsesBody(body), account)
          logger.info(
            `[GrokRelay] chat→responses bridge account=${account.id} reason=${bridge.reason}`
          )
        } else if (!bridge.ok) {
          logger.debug(
            `[GrokRelay] chat raw forward account=${account.id} reason=${bridge.reason}`
          )
        }
      }

      const headers = {
        Authorization: `Bearer ${token}`,
        'Content-Type': req.headers['content-type'] || 'application/json'
      }
      if (account.authType === 'oauth') {
        Object.assign(headers, xaiHelper.buildCliIdentityHeaders())
      }
      if (account.userAgent) {
        headers['User-Agent'] = account.userAgent
      } else if (req.headers['user-agent']) {
        headers['User-Agent'] = req.headers['user-agent']
      }

      const buildRequestOptions = (dataBody) => {
        const options = {
          method: 'POST',
          url: targetUrl,
          headers,
          data: dataBody,
          timeout: this.defaultTimeout,
          responseType: isStream ? 'stream' : 'json',
          validateStatus: () => true,
          signal: abortController.signal,
          maxBodyLength: Infinity,
          maxContentLength: Infinity
        }
        if (endpointKind === 'video_status' || endpointKind === 'video_content') {
          options.method = 'GET'
          delete options.data
          if (endpointKind === 'video_content') {
            options.responseType = 'stream'
          }
        }
        return options
      }

      proxyResolution = proxyResolver.resolveAgent(account, 'grok')
      const applyProxy = (options) => {
        if (proxyResolution?.agent) {
          options.httpAgent = proxyResolution.agent
          options.httpsAgent = proxyResolution.agent
          options.proxy = false
        }
        return options
      }

      logger.info(
        `[GrokRelay] forward account=${account.id} url=${targetUrl} stream=${isStream} model=${body?.model || requestedModel || '-'} endpoint=${effectiveEndpointKind} reverseChat=${reverseBridgeToChat}`
      )

      let response = await axios(applyProxy(buildRequestOptions(body)))
      proxyResolver.report?.(proxyResolution?.proxyId, proxyResolution?.contextKey, null)

      // encrypted_content 400：剥离后同号重试一次
      if (
        effectiveEndpointKind === 'responses' &&
        isInvalidEncryptedContentError(response.status, response.data)
      ) {
        const stripped = stripEncryptedReasoningContent(body)
        if (stripped.changed) {
          logger.warn(
            `[GrokRelay] invalid encrypted_content retry account=${account.id}`
          )
          body = stripped.body
          response = await axios(applyProxy(buildRequestOptions(body)))
        }
      }

      // failover：405/401/429/5xx 等换号重试一次
      if (
        response.status >= 400 &&
        shouldFailoverGrokStatus(response.status) &&
        !forcedAccountId
      ) {
        if (response.status === 429) {
          const retryAfter = upstreamErrorHelper.parseRetryAfter?.(response.headers) || 3600
          await grokAccountService.markAccountRateLimited(
            account.id,
            Math.ceil(retryAfter / 60) || 60
          )
          if (!(account.disableAutoProtection === true || account.disableAutoProtection === 'true')) {
            await upstreamErrorHelper
              .markTempUnavailable(account.id, 'grok', 429, retryAfter)
              .catch((e) => console.error(e))
          }
        } else if (response.status === 401 || response.status === 403) {
          await grokAccountService.markAccountUnauthorized(
            account.id,
            `Grok upstream ${response.status}`
          )
        } else if (response.status >= 500 || response.status === 405) {
          await upstreamErrorHelper
            .markTempUnavailable(account.id, 'grok', response.status)
            .catch((e) => console.error(e))
        }

        // 换号重试（排除当前号）
        try {
          const next = await grokScheduler.selectAccount(
            apiKeyData,
            requestedModel,
            sessionHash,
            { mediaGeneration }
          )
          if (next && next.id !== account.id) {
            logger.warn(
              `[GrokRelay] failover ${response.status} ${account.id} -> ${next.id}`
            )
            account = (await grokAccountService.ensureFreshToken(next.id)) || next
            token = account.authType === 'apikey' ? account.apiKey : account.accessToken
            headers.Authorization = `Bearer ${token}`
            if (account.authType === 'oauth') {
              Object.assign(headers, xaiHelper.buildCliIdentityHeaders())
            }
            targetUrl = this._buildTargetUrl(
              account,
              endpointKind === 'responses_compact' ? 'responses' : effectiveEndpointKind === 'responses' ? 'responses' : endpointKind,
              req
            )
            proxyResolution = proxyResolver.resolveAgent(account, 'grok')
            response = await axios(applyProxy(buildRequestOptions(body)))
          }
        } catch (failoverError) {
          console.error(failoverError)
        }
      }

      if (response.status === 429) {
        const retryAfter = upstreamErrorHelper.parseRetryAfter?.(response.headers) || 3600
        await grokAccountService.markAccountRateLimited(
          account.id,
          Math.ceil(retryAfter / 60) || 60
        )
        if (!(account.disableAutoProtection === true || account.disableAutoProtection === 'true')) {
          await upstreamErrorHelper
            .markTempUnavailable(account.id, 'grok', 429, retryAfter)
            .catch((e) => console.error(e))
        }
        const clientError = buildClientError({
          statusCode: 429,
          protocol: 'openai',
          upstreamBody: response.data,
          retryAfterSeconds: retryAfter
        })
        return res.status(clientError.statusCode).json(clientError.body)
      }

      if (response.status === 401 || response.status === 403) {
        await grokAccountService.markAccountUnauthorized(
          account.id,
          `Grok upstream ${response.status}`
        )
        const clientError = buildClientError({
          statusCode: response.status,
          protocol: 'openai',
          upstreamBody: response.data
        })
        return res.status(clientError.statusCode).json(clientError.body)
      }

      if (response.status >= 400) {
        let errorData = response.data
        if (errorData && typeof errorData.pipe === 'function') {
          errorData = await this._readStreamText(errorData)
          try {
            errorData = JSON.parse(errorData)
          } catch {
            errorData = { error: { message: String(errorData).slice(0, 500) } }
          }
        }
        if (response.status >= 500 || response.status === 405) {
          await upstreamErrorHelper
            .markTempUnavailable(account.id, 'grok', response.status)
            .catch((e) => console.error(e))
        }
        const clientError = buildClientError({
          statusCode: response.status,
          protocol: 'openai',
          upstreamBody: errorData
        })
        return res.status(clientError.statusCode).json(clientError.body)
      }

      grokAccountService.updateAccountUsage(account.id).catch((e) => console.error(e))

      // 视频生成成功：绑定 request_id → 账户，供 status/content 同号
      if (
        mediaGeneration &&
        (endpointKind === 'videos_generations' ||
          endpointKind === 'videos_edits' ||
          endpointKind === 'videos_extensions')
      ) {
        try {
          const requestId =
            response.data?.request_id ||
            response.data?.id ||
            response.data?.data?.request_id ||
            response.data?.data?.id ||
            response.data?.video?.request_id ||
            response.data?.video?.id
          if (requestId && apiKeyData?.id) {
            const stickyKey = RedisKeys.session.unifiedGrokMapping(
              videoSessionHash(requestId, apiKeyData.id)
            )
            await redis.setSessionAccountMapping?.(stickyKey, account.id)
          }
        } catch (error) {
          console.error(error)
        }
      }

      if (isStream || (response.data && typeof response.data.pipe === 'function')) {
        return this._handleStreamResponse(
          response,
          res,
          account,
          apiKeyData,
          body?.model || originalChatModel || requestedModel,
          req,
          { reverseBridgeToChat, originalChatModel }
        )
      }

      return this._handleNormalResponse(
        response,
        res,
        account,
        apiKeyData,
        body?.model || originalChatModel || requestedModel,
        req,
        {
          reverseBridgeToChat,
          originalChatModel,
          isCompact: endpointKind === 'responses_compact'
        }
      )
    } catch (error) {
      console.error(error)
      // 传输层异常必须反馈代理池（熔断/权重）
      if (proxyResolution) {
        proxyResolver.report?.(proxyResolution.proxyId, proxyResolution.contextKey, error)
      }
      if (error.name === 'AbortError' || error.code === 'ERR_CANCELED') {
        logger.info('[GrokRelay] client aborted')
        return
      }
      logger.error(`[GrokRelay] error: ${error.message}`)
      if (!res.headersSent) {
        // 本地调度/绑定错误：直接透传 statusCode/code/type
        // 禁止走 buildClientError——它会把 401/403 归一化成 502，抹掉 binding_error 语义
        if (error.statusCode && !error.response) {
          res.status(error.statusCode).json({
            error: {
              message: error.message,
              type: error.type || (error.statusCode >= 500 ? 'server_error' : 'api_error'),
              code: error.code || undefined
            }
          })
        } else {
          // 上游/传输错误：走 buildClientError 归一化脱敏
          const clientError = buildClientError({
            statusCode: error.response?.status || 502,
            protocol: 'openai',
            upstreamBody: error.response?.data || { error: { message: error.message } }
          })
          res.status(clientError.statusCode).json(clientError.body)
        }
      }
    } finally {
      detachClientDisconnect()
    }
  }

  _buildTargetUrl(account, endpointKind, req) {
    const baseUrl = grokAccountService.getUpstreamBaseUrl(account, {
      media: String(endpointKind).startsWith('images') || String(endpointKind).startsWith('video')
    })
    switch (endpointKind) {
      case 'chat':
        return xaiHelper.buildChatCompletionsUrl(baseUrl)
      case 'responses':
        return xaiHelper.buildResponsesUrl(baseUrl)
      case 'images_generations':
        return xaiHelper.buildImagesGenerationsUrl(baseUrl)
      case 'images_edits':
        return xaiHelper.buildImagesEditsUrl(baseUrl)
      case 'videos_generations':
        return xaiHelper.buildVideosGenerationsUrl(baseUrl)
      case 'videos_edits':
        return xaiHelper.buildVideosEditsUrl(baseUrl)
      case 'videos_extensions':
        return xaiHelper.buildVideosExtensionsUrl(baseUrl)
      case 'video_status': {
        const requestId = req.params.requestId || req.params.request_id
        return xaiHelper.buildVideoUrl(baseUrl, requestId)
      }
      case 'video_content': {
        const requestId = req.params.requestId || req.params.request_id
        return xaiHelper.buildVideoContentUrl(baseUrl, requestId)
      }
      default:
        return xaiHelper.buildChatCompletionsUrl(baseUrl)
    }
  }

  _prepareBody(body, endpointKind) {
    if (!body || typeof body !== 'object') {
      return body
    }
    const next = { ...body }
    if (next.model) {
      next.model = xaiHelper.mapModel(next.model)
    }
    // 媒体默认模型
    if (!next.model) {
      if (endpointKind === 'images_generations') {
        next.model = 'grok-imagine-image'
      } else if (endpointKind === 'images_edits') {
        next.model = 'grok-imagine-edit'
      } else if (String(endpointKind).startsWith('videos')) {
        next.model = 'grok-imagine-video-1.5'
      }
    }
    return next
  }

  async _handleNormalResponse(
    response,
    res,
    account,
    apiKeyData,
    requestedModel,
    req,
    options = {}
  ) {
    let data = response.data
    // compact 响应改写
    if (options.isCompact) {
      data = convertGrokResponseToOpenAICompact(data)
    }
    // Responses → Chat 回桥
    if (options.reverseBridgeToChat) {
      try {
        const converter = new CodexToOpenAIConverter()
        data = converter.convertResponse(data, options.originalChatModel || requestedModel)
      } catch (error) {
        console.error(error)
        logger.warn(`[GrokRelay] reverse bridge failed: ${error.message}`)
      }
    }

    const usage = data?.usage || response.data?.usage || null
    if (usage && apiKeyData?.id) {
      await apiKeyService
        .recordUsage(
          apiKeyData.id,
          {
            input_tokens: usage.prompt_tokens || usage.input_tokens || 0,
            output_tokens: usage.completion_tokens || usage.output_tokens || 0,
            cache_creation_input_tokens: usage.cache_creation_input_tokens || 0,
            cache_read_input_tokens: usage.cache_read_input_tokens || 0
          },
          data?.model || requestedModel,
          account.id,
          'grok'
        )
        .catch((e) => console.error(e))
    }

    if (response.headers['content-type']) {
      res.setHeader('Content-Type', 'application/json')
    }
    return res.status(response.status).json(data)
  }

  async _handleStreamResponse(
    response,
    res,
    account,
    apiKeyData,
    requestedModel,
    req,
    options = {}
  ) {
    res.status(response.status)
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')

    let usageData = null
    let actualModel = requestedModel
    let buffer = ''
    const reverseBridge = Boolean(options.reverseBridgeToChat)
    const converter = reverseBridge ? new CodexToOpenAIConverter() : null
    const streamState = reverseBridge ? converter.createStreamState() : null

    response.data.on('data', (chunk) => {
      const text = chunk.toString()
      const filtered = stripSsePingFrames(text)
      if (!filtered) {
        return
      }

      if (!reverseBridge) {
        res.write(Buffer.from(filtered))
      }

      buffer += filtered
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      for (const line of lines) {
        if (!line.startsWith('data: ')) {
          continue
        }
        const payload = line.slice(6).trim()
        if (!payload || payload === '[DONE]') {
          if (reverseBridge && payload === '[DONE]') {
            res.write('data: [DONE]\n\n')
          }
          continue
        }
        try {
          const parsed = JSON.parse(payload)
          if (parsed.model) {
            actualModel = parsed.model
          }
          if (parsed.usage) {
            usageData = parsed.usage
          }
          if (parsed.response?.usage) {
            usageData = parsed.response.usage
          }
          if (parsed.type === 'response.completed' && parsed.response?.usage) {
            usageData = parsed.response.usage
          }
          if (reverseBridge) {
            const chunks = converter.convertStreamChunk(
              parsed,
              options.originalChatModel || requestedModel,
              streamState
            )
            for (const out of chunks) {
              res.write(out)
            }
          }
        } catch {
          // ignore partial JSON
        }
      }
    })

    await new Promise((resolve) => {
      response.data.on('end', resolve)
      response.data.on('error', (error) => {
        console.error(error)
        resolve()
      })
      res.on('close', resolve)
    })

    if (!res.writableEnded) {
      if (reverseBridge) {
        res.write('data: [DONE]\n\n')
      }
      res.end()
    }

    if (usageData && apiKeyData?.id) {
      await apiKeyService
        .recordUsage(
          apiKeyData.id,
          {
            input_tokens: usageData.prompt_tokens || usageData.input_tokens || 0,
            output_tokens: usageData.completion_tokens || usageData.output_tokens || 0,
            cache_creation_input_tokens: usageData.cache_creation_input_tokens || 0,
            cache_read_input_tokens: usageData.cache_read_input_tokens || 0
          },
          actualModel,
          account.id,
          'grok'
        )
        .catch((e) => console.error(e))
    }
  }

  async _readStreamText(stream) {
    const chunks = []
    await new Promise((resolve) => {
      stream.on('data', (chunk) => chunks.push(chunk))
      stream.on('end', resolve)
      stream.on('error', resolve)
      setTimeout(resolve, 5000)
    })
    return Buffer.concat(chunks).toString()
  }
}

module.exports = new GrokRelayService()
