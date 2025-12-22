'use strict'

const { v4: uuidv4 } = require('uuid')

/**
 * 预热请求拦截器
 * 检测并拦截低价值请求（标题生成、Warmup等），直接返回模拟响应
 */

/**
 * 检测是否为预热请求
 * @param {Object} body - 请求体
 * @returns {boolean}
 */
function isWarmupRequest(body) {
  if (!body) {
    return false
  }

  // 检查 messages
  if (body.messages && Array.isArray(body.messages)) {
    for (const msg of body.messages) {
      // 处理 content 为数组的情况
      if (Array.isArray(msg.content)) {
        for (const content of msg.content) {
          if (content.type === 'text' && typeof content.text === 'string') {
            if (isTitleOrWarmupText(content.text)) {
              return true
            }
          }
        }
      }
      // 处理 content 为字符串的情况
      if (typeof msg.content === 'string') {
        if (isTitleOrWarmupText(msg.content)) {
          return true
        }
      }
    }
  }

  // 检查 system prompt
  if (body.system) {
    const systemText = extractSystemText(body.system)
    if (isTitleExtractionSystemPrompt(systemText)) {
      return true
    }
  }

  return false
}

/**
 * 检查文本是否为标题生成或Warmup请求
 */
function isTitleOrWarmupText(text) {
  if (!text) {
    return false
  }
  return (
    text.includes('Please write a 5-10 word title for the following conversation:') ||
    text === 'Warmup'
  )
}

/**
 * 检查system prompt是否为标题提取类型
 */
function isTitleExtractionSystemPrompt(systemText) {
  if (!systemText) {
    return false
  }
  return systemText.includes(
    'nalyze if this message indicates a new conversation topic. If it does, extract a 2-3 word title'
  )
}

/**
 * 从system字段提取文本
 */
function extractSystemText(system) {
  if (typeof system === 'string') {
    return system
  }
  if (Array.isArray(system)) {
    return system.map((s) => (typeof s === 'object' ? s.text || '' : String(s))).join('')
  }
  return ''
}

/**
 * 生成模拟的非流式响应
 * @param {string} model - 模型名称
 * @returns {Object}
 */
function buildMockWarmupResponse(model) {
  return {
    id: `msg_warmup_${uuidv4().replace(/-/g, '').slice(0, 20)}`,
    type: 'message',
    role: 'assistant',
    content: [{ type: 'text', text: 'New Conversation' }],
    model: model || 'claude-3-5-sonnet-20241022',
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: {
      input_tokens: 10,
      output_tokens: 2
    }
  }
}

/**
 * 发送模拟的流式响应
 * @param {Object} res - Express response对象
 * @param {string} model - 模型名称
 */
function sendMockWarmupStream(res, model) {
  const effectiveModel = model || 'claude-3-5-sonnet-20241022'
  const messageId = `msg_warmup_${uuidv4().replace(/-/g, '').slice(0, 20)}`

  const events = [
    {
      event: 'message_start',
      data: {
        message: {
          content: [],
          id: messageId,
          model: effectiveModel,
          role: 'assistant',
          stop_reason: null,
          stop_sequence: null,
          type: 'message',
          usage: { input_tokens: 10, output_tokens: 0 }
        },
        type: 'message_start'
      }
    },
    {
      event: 'content_block_start',
      data: {
        content_block: { text: '', type: 'text' },
        index: 0,
        type: 'content_block_start'
      }
    },
    {
      event: 'content_block_delta',
      data: {
        delta: { text: 'New', type: 'text_delta' },
        index: 0,
        type: 'content_block_delta'
      }
    },
    {
      event: 'content_block_delta',
      data: {
        delta: { text: ' Conversation', type: 'text_delta' },
        index: 0,
        type: 'content_block_delta'
      }
    },
    {
      event: 'content_block_stop',
      data: { index: 0, type: 'content_block_stop' }
    },
    {
      event: 'message_delta',
      data: {
        delta: { stop_reason: 'end_turn', stop_sequence: null },
        type: 'message_delta',
        usage: { input_tokens: 10, output_tokens: 2 }
      }
    },
    {
      event: 'message_stop',
      data: { type: 'message_stop' }
    }
  ]

  let index = 0
  const sendNext = () => {
    if (index >= events.length) {
      res.end()
      return
    }

    const { event, data } = events[index]
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    index++

    // 模拟网络延迟
    setTimeout(sendNext, 20)
  }

  sendNext()
}

module.exports = {
  isWarmupRequest,
  buildMockWarmupResponse,
  sendMockWarmupStream
}
