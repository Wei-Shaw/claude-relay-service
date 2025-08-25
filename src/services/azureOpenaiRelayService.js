const axios = require('axios')
const ProxyHelper = require('../utils/proxyHelper')
const logger = require('../utils/logger')

// 转换模型名称（去掉 azure/ 前缀）
function normalizeModelName(model) {
  if (model && model.startsWith('azure/')) {
    return model.replace('azure/', '')
  }
  return model
}

// 处理 Azure OpenAI 请求
async function handleAzureOpenAIRequest({
  account,
  requestBody,
  headers: _headers = {}, // 前缀下划线表示未使用
  isStream = false,
  endpoint = 'chat/completions'
}) {
  // 声明变量在函数顶部，确保在 catch 块中也能访问
  let requestUrl = ''
  let proxyAgent = null
  let deploymentName = ''

  try {
    // 构建 Azure OpenAI 请求 URL
    const baseUrl = account.azureEndpoint
    deploymentName = account.deploymentName || 'default'
    // Azure Responses API requires preview versions; fall back appropriately
    const apiVersion =
      account.apiVersion || (endpoint === 'responses' ? '2024-10-01-preview' : '2024-02-01')
    if (endpoint === 'chat/completions') {
      requestUrl = `${baseUrl}/openai/deployments/${deploymentName}/chat/completions?api-version=${apiVersion}`
    } else if (endpoint === 'responses') {
      requestUrl = `${baseUrl}/openai/responses?api-version=${apiVersion}`
    } else {
      requestUrl = `${baseUrl}/openai/deployments/${deploymentName}/${endpoint}?api-version=${apiVersion}`
    }

    // 准备请求头
    const requestHeaders = {
      'Content-Type': 'application/json',
      'api-key': account.apiKey
    }

    // 移除不需要的头部
    delete requestHeaders['anthropic-version']
    delete requestHeaders['x-api-key']
    delete requestHeaders['host']

    // 处理请求体
    const processedBody = { ...requestBody }

    // 标准化模型名称
    if (processedBody.model) {
      processedBody.model = normalizeModelName(processedBody.model)
    } else {
      processedBody.model = 'gpt-4'
    }

    // 使用统一的代理创建工具
    proxyAgent = ProxyHelper.createProxyAgent(account.proxy)

    // 配置请求选项
    const axiosConfig = {
      method: 'POST',
      url: requestUrl,
      headers: requestHeaders,
      data: processedBody,
      timeout: 600000, // 10 minutes for Azure OpenAI
      validateStatus: () => true,
      // 添加连接保活选项
      keepAlive: true,
      maxRedirects: 5,
      // 防止socket hang up
      socketKeepAlive: true
    }

    // 如果有代理，添加代理配置
    if (proxyAgent) {
      axiosConfig.httpsAgent = proxyAgent
      // 为代理添加额外的keep-alive设置
      if (proxyAgent.options) {
        proxyAgent.options.keepAlive = true
        proxyAgent.options.keepAliveMsecs = 1000
      }
      logger.debug(
        `Using proxy for Azure OpenAI request: ${ProxyHelper.getProxyDescription(account.proxy)}`
      )
    }

    // 流式请求特殊处理
    if (isStream) {
      axiosConfig.responseType = 'stream'
      requestHeaders.accept = 'text/event-stream'
    } else {
      requestHeaders.accept = 'application/json'
    }

    logger.debug(`Making Azure OpenAI request`, {
      requestUrl,
      method: 'POST',
      endpoint,
      deploymentName,
      apiVersion,
      hasProxy: !!proxyAgent,
      proxyInfo: ProxyHelper.maskProxyInfo(account.proxy),
      isStream,
      requestBodySize: JSON.stringify(processedBody).length
    })

    logger.debug('Azure OpenAI request headers', {
      'content-type': requestHeaders['Content-Type'],
      'user-agent': requestHeaders['user-agent'] || 'not-set',
      customHeaders: Object.keys(requestHeaders).filter(
        (key) => !['Content-Type', 'user-agent'].includes(key)
      )
    })

    logger.debug('Azure OpenAI request body', {
      model: processedBody.model,
      messages: processedBody.messages?.length || 0,
      otherParams: Object.keys(processedBody).filter((key) => !['model', 'messages'].includes(key))
    })

    const requestStartTime = Date.now()
    logger.debug(`🔄 Starting Azure OpenAI HTTP request at ${new Date().toISOString()}`)

    // 发送请求
    const response = await axios(axiosConfig)

    const requestDuration = Date.now() - requestStartTime
    logger.debug(`✅ Azure OpenAI HTTP request completed at ${new Date().toISOString()}`)

    logger.debug(`Azure OpenAI response received`, {
      status: response.status,
      statusText: response.statusText,
      duration: `${requestDuration}ms`,
      responseHeaders: Object.keys(response.headers || {}),
      hasData: !!response.data,
      contentType: response.headers?.['content-type'] || 'unknown'
    })

    return response
  } catch (error) {
    const errorDetails = {
      message: error.message,
      code: error.code,
      status: error.response?.status,
      statusText: error.response?.statusText,
      responseData: error.response?.data,
      requestUrl: requestUrl || 'unknown',
      endpoint,
      deploymentName: deploymentName || account?.deploymentName || 'unknown',
      hasProxy: !!proxyAgent,
      proxyType: account?.proxy?.type || 'none',
      isTimeout: error.code === 'ECONNABORTED',
      isNetworkError: !error.response,
      stack: error.stack
    }

    // 特殊错误类型的详细日志
    if (error.code === 'ENOTFOUND') {
      logger.error('DNS Resolution Failed for Azure OpenAI', {
        ...errorDetails,
        hostname: requestUrl && requestUrl !== 'unknown' ? new URL(requestUrl).hostname : 'unknown',
        suggestion: 'Check if Azure endpoint URL is correct and accessible'
      })
    } else if (error.code === 'ECONNREFUSED') {
      logger.error('Connection Refused by Azure OpenAI', {
        ...errorDetails,
        suggestion: 'Check if proxy settings are correct or Azure service is accessible'
      })
    } else if (error.code === 'ECONNRESET' || error.message.includes('socket hang up')) {
      logger.error('🚨 Azure OpenAI Connection Reset / Socket Hang Up', {
        ...errorDetails,
        suggestion:
          'Connection was dropped by Azure OpenAI or proxy. This might be due to long request processing time, proxy timeout, or network instability. Try reducing request complexity or check proxy settings.'
      })
    } else if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      logger.error('🚨 Azure OpenAI Request Timeout', {
        ...errorDetails,
        timeoutMs: 600000,
        suggestion:
          'Request exceeded 10-minute timeout. Consider reducing model complexity or check if Azure service is responding slowly.'
      })
    } else if (
      error.code === 'CERT_AUTHORITY_INVALID' ||
      error.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE'
    ) {
      logger.error('SSL Certificate Error for Azure OpenAI', {
        ...errorDetails,
        suggestion: 'SSL certificate validation failed - check proxy SSL settings'
      })
    } else if (error.response?.status === 401) {
      logger.error('Azure OpenAI Authentication Failed', {
        ...errorDetails,
        suggestion: 'Check if Azure OpenAI API key is valid and not expired'
      })
    } else if (error.response?.status === 404) {
      logger.error('Azure OpenAI Deployment Not Found', {
        ...errorDetails,
        suggestion: 'Check if deployment name and Azure endpoint are correct'
      })
    } else {
      logger.error('Azure OpenAI Request Failed', errorDetails)
    }

    throw error
  }
}

// 安全的流管理器
class StreamManager {
  constructor() {
    this.activeStreams = new Set()
    this.cleanupCallbacks = new Map()
  }

  registerStream(streamId, cleanup) {
    this.activeStreams.add(streamId)
    this.cleanupCallbacks.set(streamId, cleanup)
  }

  cleanup(streamId) {
    if (this.activeStreams.has(streamId)) {
      try {
        const cleanup = this.cleanupCallbacks.get(streamId)
        if (cleanup) {
          cleanup()
        }
      } catch (error) {
        logger.warn(`Stream cleanup error for ${streamId}:`, error.message)
      } finally {
        this.activeStreams.delete(streamId)
        this.cleanupCallbacks.delete(streamId)
      }
    }
  }

  getActiveStreamCount() {
    return this.activeStreams.size
  }
}

const streamManager = new StreamManager()

// SSE 缓冲区大小限制
const MAX_BUFFER_SIZE = 64 * 1024 // 64KB
const MAX_EVENT_SIZE = 16 * 1024 // 16KB 单个事件最大大小

// 处理流式响应
function handleStreamResponse(upstreamResponse, clientResponse, options = {}) {
  const { onData, onEnd, onError } = options
  const streamId = `stream_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

  logger.info(`Starting Azure OpenAI stream handling`, {
    streamId,
    upstreamStatus: upstreamResponse.status,
    upstreamHeaders: Object.keys(upstreamResponse.headers || {}),
    clientRemoteAddress: clientResponse.req?.connection?.remoteAddress,
    hasOnData: !!onData,
    hasOnEnd: !!onEnd,
    hasOnError: !!onError
  })

  return new Promise((resolve, reject) => {
    let buffer = ''
    let usageData = null
    let actualModel = null
    let hasEnded = false
    let eventCount = 0
    const maxEvents = 10000 // 最大事件数量限制

    // 设置响应头
    clientResponse.setHeader('Content-Type', 'text/event-stream')
    clientResponse.setHeader('Cache-Control', 'no-cache')
    clientResponse.setHeader('Connection', 'keep-alive')
    clientResponse.setHeader('X-Accel-Buffering', 'no')

    // 透传某些头部
    const passThroughHeaders = [
      'x-request-id',
      'x-ratelimit-remaining-requests',
      'x-ratelimit-remaining-tokens'
    ]
    passThroughHeaders.forEach((header) => {
      const value = upstreamResponse.headers[header]
      if (value) {
        clientResponse.setHeader(header, value)
      }
    })

    // 立即刷新响应头
    if (typeof clientResponse.flushHeaders === 'function') {
      clientResponse.flushHeaders()
    }

    // 解析 SSE 事件以捕获 usage 数据
    const parseSSEForUsage = (data) => {
      const lines = data.split('\n')

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const jsonStr = line.slice(6) // 移除 'data: ' 前缀
            if (jsonStr.trim() === '[DONE]') {
              continue
            }
            const eventData = JSON.parse(jsonStr)

            // 获取模型信息
            if (eventData.model) {
              actualModel = eventData.model
            }

            // 获取使用统计（Responses API: response.completed -> response.usage）
            if (eventData.type === 'response.completed' && eventData.response) {
              if (eventData.response.model) {
                actualModel = eventData.response.model
              }
              if (eventData.response.usage) {
                usageData = eventData.response.usage
                logger.debug('Captured Azure OpenAI nested usage (response.usage):', usageData)
              }
            }

            // 兼容 Chat Completions 风格（顶层 usage）
            if (!usageData && eventData.usage) {
              usageData = eventData.usage
              logger.debug('Captured Azure OpenAI usage (top-level):', usageData)
            }

            // 检查是否是完成事件
            if (eventData.choices && eventData.choices[0] && eventData.choices[0].finish_reason) {
              // 这是最后一个 chunk
            }
          } catch (e) {
            // 忽略解析错误
          }
        }
      }
    }

    // 注册流清理
    const cleanup = () => {
      if (!hasEnded) {
        hasEnded = true
        try {
          upstreamResponse.data?.removeAllListeners?.()
          upstreamResponse.data?.destroy?.()

          if (!clientResponse.headersSent) {
            clientResponse.status(502).end()
          } else if (!clientResponse.destroyed) {
            clientResponse.end()
          }
        } catch (error) {
          logger.warn('Stream cleanup error:', error.message)
        }
      }
    }

    streamManager.registerStream(streamId, cleanup)

    upstreamResponse.data.on('data', (chunk) => {
      try {
        if (hasEnded || clientResponse.destroyed) {
          return
        }

        eventCount++
        if (eventCount > maxEvents) {
          logger.warn(`Stream ${streamId} exceeded max events limit`)
          cleanup()
          return
        }

        const chunkStr = chunk.toString()

        // 转发数据给客户端
        if (!clientResponse.destroyed) {
          clientResponse.write(chunk)
        }

        // 同时解析数据以捕获 usage 信息，带缓冲区大小限制
        buffer += chunkStr

        // 防止缓冲区过大
        if (buffer.length > MAX_BUFFER_SIZE) {
          logger.warn(`Stream ${streamId} buffer exceeded limit, truncating`)
          buffer = buffer.slice(-MAX_BUFFER_SIZE / 2) // 保留后一半
        }

        // 处理完整的 SSE 事件
        if (buffer.includes('\n\n')) {
          const events = buffer.split('\n\n')
          buffer = events.pop() || '' // 保留最后一个可能不完整的事件

          for (const event of events) {
            if (event.trim() && event.length <= MAX_EVENT_SIZE) {
              parseSSEForUsage(event)
            }
          }
        }

        if (onData) {
          onData(chunk, { usageData, actualModel })
        }
      } catch (error) {
        logger.error('Error processing Azure OpenAI stream chunk:', error)
        if (!hasEnded) {
          cleanup()
          reject(error)
        }
      }
    })

    upstreamResponse.data.on('end', () => {
      if (hasEnded) {
        return
      }

      streamManager.cleanup(streamId)
      hasEnded = true

      try {
        // 处理剩余的 buffer
        if (buffer.trim() && buffer.length <= MAX_EVENT_SIZE) {
          parseSSEForUsage(buffer)
        }

        if (onEnd) {
          onEnd({ usageData, actualModel })
        }

        if (!clientResponse.destroyed) {
          clientResponse.end()
        }

        resolve({ usageData, actualModel })
      } catch (error) {
        logger.error('Stream end handling error:', error)
        reject(error)
      }
    })

    upstreamResponse.data.on('error', (error) => {
      if (hasEnded) {
        return
      }

      streamManager.cleanup(streamId)
      hasEnded = true

      logger.error('Upstream stream error:', error)

      try {
        if (onError) {
          onError(error)
        }

        if (!clientResponse.headersSent) {
          clientResponse.status(502).json({ error: { message: 'Upstream stream error' } })
        } else if (!clientResponse.destroyed) {
          clientResponse.end()
        }
      } catch (cleanupError) {
        logger.warn('Error during stream error cleanup:', cleanupError.message)
      }

      reject(error)
    })

    // 客户端断开时清理
    const clientCleanup = () => {
      streamManager.cleanup(streamId)
    }

    clientResponse.on('close', clientCleanup)
    clientResponse.on('aborted', clientCleanup)
    clientResponse.on('error', clientCleanup)
  })
}

// 处理非流式响应
function handleNonStreamResponse(upstreamResponse, clientResponse) {
  try {
    // 设置状态码
    clientResponse.status(upstreamResponse.status)

    // 设置响应头
    clientResponse.setHeader('Content-Type', 'application/json')

    // 透传某些头部
    const passThroughHeaders = [
      'x-request-id',
      'x-ratelimit-remaining-requests',
      'x-ratelimit-remaining-tokens'
    ]
    passThroughHeaders.forEach((header) => {
      const value = upstreamResponse.headers[header]
      if (value) {
        clientResponse.setHeader(header, value)
      }
    })

    // 返回响应数据
    const responseData = upstreamResponse.data
    clientResponse.json(responseData)

    // 提取 usage 数据
    const usageData = responseData.usage
    const actualModel = responseData.model

    return { usageData, actualModel, responseData }
  } catch (error) {
    logger.error('Error handling Azure OpenAI non-stream response:', error)
    throw error
  }
}

module.exports = {
  handleAzureOpenAIRequest,
  handleStreamResponse,
  handleNonStreamResponse,
  normalizeModelName
}
