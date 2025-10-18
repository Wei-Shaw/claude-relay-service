const axios = require('axios')
const ccrAccountService = require('./ccrAccountService')
const logger = require('../utils/logger')
const config = require('../../config/config')
const { parseVendorPrefixedModel } = require('../utils/modelHelper')

class CcrRelayService {
  constructor() {
    this.defaultUserAgent = 'claude-relay-service/1.0.0'
  }

  // 🚀 转发请求到CCR API
  async relayRequest(
    requestBody,
    apiKeyData,
    clientRequest,
    clientResponse,
    clientHeaders,
    accountId,
    options = {}
  ) {
    let abortController = null
    let account = null

    try {
      // 获取账户信息
      account = await ccrAccountService.getAccount(accountId)
      if (!account) {
        throw new Error('CCR account not found')
      }

      logger.info(
        `📤 Processing CCR API request for key: ${apiKeyData.name || apiKeyData.id}, account: ${account.name} (${accountId})`
      )
      logger.debug(`🌐 Account API URL: ${account.apiUrl}`)
      logger.debug(`🔍 Account supportedModels: ${JSON.stringify(account.supportedModels)}`)
      logger.debug(`🔑 Account has apiKey: ${!!account.apiKey}`)
      logger.debug(`📝 Request model: ${requestBody.model}`)

      // 处理模型前缀解析和映射
      const { baseModel } = parseVendorPrefixedModel(requestBody.model)
      logger.debug(`🔄 Parsed base model: ${baseModel} from original: ${requestBody.model}`)

      let mappedModel = baseModel
      if (
        account.supportedModels &&
        typeof account.supportedModels === 'object' &&
        !Array.isArray(account.supportedModels)
      ) {
        const newModel = ccrAccountService.getMappedModel(account.supportedModels, baseModel)
        if (newModel !== baseModel) {
          logger.info(`🔄 Mapping model from ${baseModel} to ${newModel}`)
          mappedModel = newModel
        }
      }

      // 创建修改后的请求体，使用去前缀后的模型名
      const modifiedRequestBody = {
        ...requestBody,
        model: mappedModel
      }

      // 创建代理agent
      const proxyAgent = ccrAccountService._createProxyAgent(account.proxy)

      // 创建AbortController用于取消请求
      abortController = new AbortController()

      // 设置客户端断开监听器
      const handleClientDisconnect = () => {
        logger.info('🔌 Client disconnected, aborting CCR request')
        if (abortController && !abortController.signal.aborted) {
          abortController.abort()
        }
      }

      // 监听客户端断开事件
      if (clientRequest) {
        clientRequest.once('close', handleClientDisconnect)
      }
      if (clientResponse) {
        clientResponse.once('close', handleClientDisconnect)
      }

      // 构建完整的API URL
      const cleanUrl = account.apiUrl.replace(/\/$/, '') // 移除末尾斜杠
      let apiEndpoint

      if (options.customPath) {
        // 如果指定了自定义路径（如 count_tokens），使用它
        const baseUrl = cleanUrl.replace(/\/v1\/messages$/, '') // 移除已有的 /v1/messages
        apiEndpoint = `${baseUrl}${options.customPath}`
      } else {
        // 默认使用 messages 端点
        apiEndpoint = cleanUrl.endsWith('/v1/messages') ? cleanUrl : `${cleanUrl}/v1/messages`
      }

      logger.debug(`🎯 Final API endpoint: ${apiEndpoint}`)
      logger.debug(`[DEBUG] Options passed to relayRequest: ${JSON.stringify(options)}`)
      logger.debug(`[DEBUG] Client headers received: ${JSON.stringify(clientHeaders)}`)

      // 过滤客户端请求头
      const filteredHeaders = this._filterClientHeaders(clientHeaders)
      logger.debug(`[DEBUG] Filtered client headers: ${JSON.stringify(filteredHeaders)}`)

      // 决定使用的 User-Agent：优先使用账户自定义的，否则透传客户端的，最后才使用默认值
      const userAgent =
        account.userAgent ||
        clientHeaders?.['user-agent'] ||
        clientHeaders?.['User-Agent'] ||
        this.defaultUserAgent

      // 准备请求配置
      const requestConfig = {
        method: 'POST',
        url: apiEndpoint,
        data: modifiedRequestBody,
        headers: {
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01',
          'User-Agent': userAgent,
          ...filteredHeaders
        },
        timeout: config.requestTimeout || 600000,
        signal: abortController.signal,
        validateStatus: () => true // 接受所有状态码
      }

      if (proxyAgent) {
        requestConfig.httpAgent = proxyAgent
        requestConfig.httpsAgent = proxyAgent
        requestConfig.proxy = false
      }

      // 根据 API Key 格式选择认证方式
      if (account.apiKey && account.apiKey.startsWith('sk-ant-')) {
        // Anthropic 官方 API Key 使用 x-api-key
        requestConfig.headers['x-api-key'] = account.apiKey
        logger.debug('[DEBUG] Using x-api-key authentication for sk-ant-* API key')
      } else {
        // 其他 API Key (包括CCR API Key) 使用 Authorization Bearer
        requestConfig.headers['Authorization'] = `Bearer ${account.apiKey}`
        logger.debug('[DEBUG] Using Authorization Bearer authentication')
      }

      logger.debug(
        `[DEBUG] Initial headers before beta: ${JSON.stringify(requestConfig.headers, null, 2)}`
      )

      // 添加beta header如果需要
      if (options.betaHeader) {
        logger.debug(`[DEBUG] Adding beta header: ${options.betaHeader}`)
        requestConfig.headers['anthropic-beta'] = options.betaHeader
      } else {
        logger.debug('[DEBUG] No beta header to add')
      }

      // 发送请求
      logger.debug(
        '📤 Sending request to CCR API with headers:',
        JSON.stringify(requestConfig.headers, null, 2)
      )
      const response = await axios(requestConfig)

      // 移除监听器（请求成功完成）
      if (clientRequest) {
        clientRequest.removeListener('close', handleClientDisconnect)
      }
      if (clientResponse) {
        clientResponse.removeListener('close', handleClientDisconnect)
      }

      logger.debug(`🔗 CCR API response: ${response.status}`)
      logger.debug(`[DEBUG] Response headers: ${JSON.stringify(response.headers)}`)
      logger.debug(`[DEBUG] Response data type: ${typeof response.data}`)
      logger.debug(
        `[DEBUG] Response data length: ${response.data ? (typeof response.data === 'string' ? response.data.length : JSON.stringify(response.data).length) : 0}`
      )
      logger.debug(
        `[DEBUG] Response data preview: ${typeof response.data === 'string' ? response.data.substring(0, 200) : JSON.stringify(response.data).substring(0, 200)}`
      )

      // 检查错误状态并相应处理
      if (response.status === 401) {
        logger.warn(`🚫 Unauthorized error detected for CCR account ${accountId}`)
        await ccrAccountService.markAccountUnauthorized(accountId)
      } else if (response.status === 429) {
        logger.warn(`🚫 Rate limit detected for CCR account ${accountId}`)
        // 收到429先检查是否因为超过了手动配置的每日额度
        await ccrAccountService.checkQuotaUsage(accountId).catch((err) => {
          logger.error('❌ Failed to check quota after 429 error:', err)
        })

        await ccrAccountService.markAccountRateLimited(accountId)
      } else if (response.status === 529) {
        logger.warn(`🚫 Overload error detected for CCR account ${accountId}`)
        await ccrAccountService.markAccountOverloaded(accountId)
      } else if (response.status === 200 || response.status === 201) {
        // 如果请求成功，检查并移除错误状态
        const isRateLimited = await ccrAccountService.isAccountRateLimited(accountId)
        if (isRateLimited) {
          await ccrAccountService.removeAccountRateLimit(accountId)
        }
        const isOverloaded = await ccrAccountService.isAccountOverloaded(accountId)
        if (isOverloaded) {
          await ccrAccountService.removeAccountOverload(accountId)
        }
      }

      // 更新最后使用时间
      await this._updateLastUsedTime(accountId)

      const responseBody =
        typeof response.data === 'string' ? response.data : JSON.stringify(response.data)
      logger.debug(`[DEBUG] Final response body to return: ${responseBody}`)

      return {
        statusCode: response.status,
        headers: response.headers,
        body: responseBody,
        accountId
      }
    } catch (error) {
      // 处理特定错误
      if (error.name === 'AbortError' || error.code === 'ECONNABORTED') {
        logger.info('Request aborted due to client disconnect')
        throw new Error('Client disconnected')
      }

      logger.error(
        `❌ CCR relay request failed (Account: ${account?.name || accountId}):`,
        error.message
      )

      throw error
    }
  }

  // 🌊 处理流式响应
  async relayStreamRequestWithUsageCapture(
    requestBody,
    apiKeyData,
    responseStream,
    clientHeaders,
    usageCallback,
    accountId,
    streamTransformer = null,
    options = {}
  ) {
    let account = null
    try {
      // 获取账户信息
      account = await ccrAccountService.getAccount(accountId)
      if (!account) {
        throw new Error('CCR account not found')
      }

      logger.info(
        `📡 Processing streaming CCR API request for key: ${apiKeyData.name || apiKeyData.id}, account: ${account.name} (${accountId})`
      )
      logger.debug(`🌐 Account API URL: ${account.apiUrl}`)

      // 处理模型前缀解析和映射
      const { baseModel } = parseVendorPrefixedModel(requestBody.model)
      logger.debug(`🔄 Parsed base model: ${baseModel} from original: ${requestBody.model}`)

      let mappedModel = baseModel
      if (
        account.supportedModels &&
        typeof account.supportedModels === 'object' &&
        !Array.isArray(account.supportedModels)
      ) {
        const newModel = ccrAccountService.getMappedModel(account.supportedModels, baseModel)
        if (newModel !== baseModel) {
          logger.info(`🔄 [Stream] Mapping model from ${baseModel} to ${newModel}`)
          mappedModel = newModel
        }
      }

      // 创建修改后的请求体，使用去前缀后的模型名
      const modifiedRequestBody = {
        ...requestBody,
        model: mappedModel
      }

      // 创建代理agent
      const proxyAgent = ccrAccountService._createProxyAgent(account.proxy)

      // 发送流式请求
      await this._makeCcrStreamRequest(
        modifiedRequestBody,
        account,
        proxyAgent,
        clientHeaders,
        responseStream,
        accountId,
        usageCallback,
        streamTransformer,
        options
      )

      // 更新最后使用时间
      await this._updateLastUsedTime(accountId)
    } catch (error) {
      logger.error(`❌ CCR stream relay failed (Account: ${account?.name || accountId}):`, error)
      throw error
    }
  }

  // 🌊 发送流式请求到CCR API
  async _makeCcrStreamRequest(
    body,
    account,
    proxyAgent,
    clientHeaders,
    responseStream,
    accountId,
    usageCallback,
    streamTransformer = null,
    requestOptions = {}
  ) {
    return new Promise((resolve, reject) => {
      let aborted = false

      // 构建完整的API URL
      const cleanUrl = account.apiUrl.replace(/\/$/, '') // 移除末尾斜杠
      const apiEndpoint = cleanUrl.endsWith('/v1/messages') ? cleanUrl : `${cleanUrl}/v1/messages`

      logger.debug(`🎯 Final API endpoint for stream: ${apiEndpoint}`)

      // 过滤客户端请求头
      const filteredHeaders = this._filterClientHeaders(clientHeaders)
      logger.debug(`[DEBUG] Filtered client headers: ${JSON.stringify(filteredHeaders)}`)

      // 决定使用的 User-Agent：优先使用账户自定义的，否则透传客户端的，最后才使用默认值
      const userAgent =
        account.userAgent ||
        clientHeaders?.['user-agent'] ||
        clientHeaders?.['User-Agent'] ||
        this.defaultUserAgent

      // 准备请求配置
      const requestConfig = {
        method: 'POST',
        url: apiEndpoint,
        data: body,
        headers: {
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01',
          'User-Agent': userAgent,
          ...filteredHeaders
        },
        timeout: config.requestTimeout || 600000,
        responseType: 'stream',
        validateStatus: () => true // 接受所有状态码
      }

      if (proxyAgent) {
        requestConfig.httpAgent = proxyAgent
        requestConfig.httpsAgent = proxyAgent
        requestConfig.proxy = false
      }

      // 根据 API Key 格式选择认证方式
      if (account.apiKey && account.apiKey.startsWith('sk-ant-')) {
        // Anthropic 官方 API Key 使用 x-api-key
        requestConfig.headers['x-api-key'] = account.apiKey
        logger.debug('[DEBUG] Using x-api-key authentication for sk-ant-* API key')
      } else {
        // 其他 API Key (包括CCR API Key) 使用 Authorization Bearer
        requestConfig.headers['Authorization'] = `Bearer ${account.apiKey}`
        logger.debug('[DEBUG] Using Authorization Bearer authentication')
      }

      // 添加beta header如果需要
      if (requestOptions.betaHeader) {
        requestConfig.headers['anthropic-beta'] = requestOptions.betaHeader
      }

      // 发送请求
      const request = axios(requestConfig)

      request
        .then((response) => {
          logger.debug(`🌊 CCR stream response status: ${response.status}`)

          // 错误响应处理
          if (response.status !== 200) {
            logger.error(
              `❌ CCR API returned error status: ${response.status} | Account: ${account?.name || accountId}`
            )

            if (response.status === 401) {
              ccrAccountService.markAccountUnauthorized(accountId)
            } else if (response.status === 429) {
              ccrAccountService.markAccountRateLimited(accountId)
              // 检查是否因为超过每日额度
              ccrAccountService.checkQuotaUsage(accountId).catch((err) => {
                logger.error('❌ Failed to check quota after 429 error:', err)
              })
            } else if (response.status === 529) {
              ccrAccountService.markAccountOverloaded(accountId)
            }

            // 设置错误响应的状态码和响应头
            if (!responseStream.headersSent) {
              const errorHeaders = {
                'Content-Type': response.headers['content-type'] || 'application/json',
                'Cache-Control': 'no-cache',
                Connection: 'keep-alive'
              }
              // 避免 Transfer-Encoding 冲突，让 Express 自动处理
              delete errorHeaders['Transfer-Encoding']
              delete errorHeaders['Content-Length']
              responseStream.writeHead(response.status, errorHeaders)
            }

            // 直接透传错误数据，不进行包装
            response.data.on('data', (chunk) => {
              if (!responseStream.destroyed) {
                responseStream.write(chunk)
              }
            })

            response.data.on('end', () => {
              if (!responseStream.destroyed) {
                responseStream.end()
              }
              resolve() // 不抛出异常，正常完成流处理
            })
            return
          }

          // 成功响应，检查并移除错误状态
          ccrAccountService.isAccountRateLimited(accountId).then((isRateLimited) => {
            if (isRateLimited) {
              ccrAccountService.removeAccountRateLimit(accountId)
            }
          })
          ccrAccountService.isAccountOverloaded(accountId).then((isOverloaded) => {
            if (isOverloaded) {
              ccrAccountService.removeAccountOverload(accountId)
            }
          })

          // 设置响应头
          if (!responseStream.headersSent) {
            const headers = {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              Connection: 'keep-alive',
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Headers': 'Cache-Control'
            }
            responseStream.writeHead(200, headers)
          }

          // 处理流数据和使用统计收集
          let rawBuffer = ''
          const collectedUsage = {}

          response.data.on('data', (chunk) => {
            if (aborted || responseStream.destroyed) {
              return
            }

            try {
              const chunkStr = chunk.toString('utf8')
              rawBuffer += chunkStr

              // 按行分割处理 SSE 数据
              const lines = rawBuffer.split('\n')
              rawBuffer = lines.pop() // 保留最后一个可能不完整的行

              for (const line of lines) {
                if (line.trim()) {
                  // 解析 SSE 数据并收集使用统计
                  const usageData = this._parseSSELineForUsage(line)
                  if (usageData) {
                    Object.assign(collectedUsage, usageData)
                  }

                  // 应用流转换器（如果提供）
                  let outputLine = line
                  if (streamTransformer && typeof streamTransformer === 'function') {
                    outputLine = streamTransformer(line)
                  }

                  // 写入到响应流
                  if (outputLine && !responseStream.destroyed) {
                    responseStream.write(`${outputLine}\n`)
                  }
                } else {
                  // 空行也需要传递
                  if (!responseStream.destroyed) {
                    responseStream.write('\n')
                  }
                }
              }
            } catch (err) {
              logger.error('❌ Error processing SSE chunk:', err)
            }
          })

          response.data.on('end', () => {
            if (!responseStream.destroyed) {
              responseStream.end()
            }

            // 如果收集到使用统计数据，调用回调
            if (usageCallback && Object.keys(collectedUsage).length > 0) {
              try {
                logger.debug(`📊 Collected usage data: ${JSON.stringify(collectedUsage)}`)
                // 在 usage 回调中包含模型信息
                usageCallback({ ...collectedUsage, accountId, model: body.model })
              } catch (err) {
                logger.error('❌ Error in usage callback:', err)
              }
            }

            resolve()
          })

          response.data.on('error', (err) => {
            logger.error('❌ Stream data error:', err)
            if (!responseStream.destroyed) {
              responseStream.end()
            }
            reject(err)
          })

          // 客户端断开处理
          responseStream.on('close', () => {
            logger.info('🔌 Client disconnected from CCR stream')
            aborted = true
            if (response.data && typeof response.data.destroy === 'function') {
              response.data.destroy()
            }
          })

          responseStream.on('error', (err) => {
            logger.error('❌ Response stream error:', err)
            aborted = true
          })
        })
        .catch((error) => {
          if (!responseStream.headersSent) {
            responseStream.writeHead(500, { 'Content-Type': 'application/json' })
          }

          const errorResponse = {
            error: {
              type: 'internal_error',
              message: 'CCR API request failed'
            }
          }

          if (!responseStream.destroyed) {
            responseStream.write(`data: ${JSON.stringify(errorResponse)}\n\n`)
            responseStream.end()
          }

          reject(error)
        })
    })
  }

  // 📊 解析SSE行以提取使用统计信息
  _parseSSELineForUsage(line) {
    try {
      if (line.startsWith('data: ')) {
        const data = line.substring(6).trim()
        if (data === '[DONE]') {
          return null
        }

        const jsonData = JSON.parse(data)

        // 检查是否包含使用统计信息
        if (jsonData.usage) {
          return {
            input_tokens: jsonData.usage.input_tokens || 0,
            output_tokens: jsonData.usage.output_tokens || 0,
            cache_creation_input_tokens: jsonData.usage.cache_creation_input_tokens || 0,
            cache_read_input_tokens: jsonData.usage.cache_read_input_tokens || 0,
            // 支持 ephemeral cache 字段
            cache_creation_input_tokens_ephemeral_5m:
              jsonData.usage.cache_creation_input_tokens_ephemeral_5m || 0,
            cache_creation_input_tokens_ephemeral_1h:
              jsonData.usage.cache_creation_input_tokens_ephemeral_1h || 0
          }
        }

        // 检查 message_delta 事件中的使用统计
        if (jsonData.type === 'message_delta' && jsonData.delta && jsonData.delta.usage) {
          return {
            input_tokens: jsonData.delta.usage.input_tokens || 0,
            output_tokens: jsonData.delta.usage.output_tokens || 0,
            cache_creation_input_tokens: jsonData.delta.usage.cache_creation_input_tokens || 0,
            cache_read_input_tokens: jsonData.delta.usage.cache_read_input_tokens || 0,
            cache_creation_input_tokens_ephemeral_5m:
              jsonData.delta.usage.cache_creation_input_tokens_ephemeral_5m || 0,
            cache_creation_input_tokens_ephemeral_1h:
              jsonData.delta.usage.cache_creation_input_tokens_ephemeral_1h || 0
          }
        }
      }
    } catch (err) {
      // 忽略解析错误，不是所有行都包含 JSON
    }

    return null
  }

  // 🔍 过滤客户端请求头
  _filterClientHeaders(clientHeaders) {
    if (!clientHeaders) {
      return {}
    }

    const filteredHeaders = {}
    const allowedHeaders = [
      'accept-language',
      'anthropic-beta',
      'anthropic-dangerous-direct-browser-access'
    ]

    // 只保留允许的头部信息
    for (const [key, value] of Object.entries(clientHeaders)) {
      const lowerKey = key.toLowerCase()
      if (allowedHeaders.includes(lowerKey)) {
        filteredHeaders[key] = value
      }
    }

    return filteredHeaders
  }

  // ⏰ 更新账户最后使用时间
  async _updateLastUsedTime(accountId) {
    try {
      const redis = require('../models/redis')
      const client = redis.getClientSafe()
      await client.hset(`ccr_account:${accountId}`, 'lastUsedAt', new Date().toISOString())
    } catch (error) {
      logger.error(`❌ Failed to update last used time for CCR account ${accountId}:`, error)
    }
  }
}

module.exports = new CcrRelayService()
