/**
 * 流式响应文本累积器
 *
 * 各转发服务在流式转发过程中，会把每一段原始 buffer 投喂给本工具，
 * 本工具会按 SSE/JSON 协议解析并提取出助手的文本输出，最终用于
 * Langfuse 的 generation.output 字段。
 *
 * 支持三种格式：
 *  - 'anthropic' : Anthropic Messages API SSE
 *  - 'openai'    : OpenAI Chat Completions SSE
 *  - 'gemini'    : Gemini streamGenerateContent SSE/JSON 流
 *
 * 容错原则：
 *  - 任何解析异常都被吞掉（流式数据可能被截断）
 *  - 累积长度封顶 1MB，超过后丢弃后续内容
 */

const DEFAULT_MAX_CHARS = 1024 * 1024 // 1MB

class StreamTextCollector {
  /**
   * @param {Object} [options]
   * @param {'anthropic'|'openai'|'gemini'} [options.format='anthropic']
   * @param {number} [options.maxChars=1048576]
   */
  constructor(options = {}) {
    this.format = options.format || 'anthropic'
    this.maxChars = options.maxChars || DEFAULT_MAX_CHARS
    this.buffer = ''
    this.text = ''
    this.truncated = false
  }

  /**
   * 追加一段流式 chunk（可以是 Buffer / string）
   * @param {*} chunk
   */
  onChunk(chunk) {
    if (chunk === null || chunk === undefined) {
      return
    }

    let str
    try {
      if (typeof chunk === 'string') {
        str = chunk
      } else if (Buffer.isBuffer(chunk)) {
        str = chunk.toString('utf8')
      } else if (typeof chunk.toString === 'function') {
        str = chunk.toString()
      } else {
        return
      }
    } catch (_error) {
      return
    }

    if (!str) {
      return
    }

    if (this.truncated) {
      return
    }

    this.buffer += str

    try {
      this._drain()
    } catch (_error) {
      // 任何解析错误都不能影响主流程
    }
  }

  _drain() {
    if (this.format === 'gemini') {
      this._drainGemini()
      return
    }

    // SSE 格式按 \n\n 切分事件
    let separatorIndex
    while ((separatorIndex = this.buffer.indexOf('\n\n')) !== -1) {
      const eventBlock = this.buffer.slice(0, separatorIndex)
      this.buffer = this.buffer.slice(separatorIndex + 2)
      this._handleEventBlock(eventBlock)
    }
  }

  _handleEventBlock(eventBlock) {
    if (!eventBlock) {
      return
    }

    const lines = eventBlock.split('\n')
    for (const rawLine of lines) {
      const line = rawLine.replace(/\r$/, '')
      if (!line.startsWith('data:')) {
        continue
      }

      const payload = line.slice(5).trimStart()
      if (!payload || payload === '[DONE]') {
        continue
      }

      let data
      try {
        data = JSON.parse(payload)
      } catch (_error) {
        continue
      }

      if (this.format === 'anthropic') {
        this._handleAnthropicEvent(data)
      } else if (this.format === 'openai') {
        this._handleOpenAIEvent(data)
      }
    }
  }

  _handleAnthropicEvent(data) {
    if (!data || typeof data !== 'object') {
      return
    }

    // content_block_delta -> { delta: { type: 'text_delta', text: '...' } }
    if (data.type === 'content_block_delta' && data.delta) {
      const { delta } = data
      if (delta.type === 'text_delta' && typeof delta.text === 'string') {
        this._append(delta.text)
        return
      }

      // 思考模式输出（thinking_delta）
      if (delta.type === 'thinking_delta' && typeof delta.thinking === 'string') {
        this._append(delta.thinking)
        return
      }
    }

    // content_block_start 中可能直接带有 text
    if (data.type === 'content_block_start' && data.content_block) {
      const block = data.content_block
      if (block.type === 'text' && typeof block.text === 'string') {
        this._append(block.text)
      }
    }
  }

  _handleOpenAIEvent(data) {
    if (!data || typeof data !== 'object') {
      return
    }

    const choices = Array.isArray(data.choices) ? data.choices : null
    if (!choices) {
      return
    }

    for (const choice of choices) {
      if (!choice) {
        continue
      }
      const delta = choice.delta || choice.message
      if (!delta) {
        continue
      }
      if (typeof delta.content === 'string') {
        this._append(delta.content)
      } else if (Array.isArray(delta.content)) {
        for (const part of delta.content) {
          if (part && typeof part.text === 'string') {
            this._append(part.text)
          }
        }
      }
      if (typeof delta.reasoning_content === 'string') {
        this._append(delta.reasoning_content)
      }
    }
  }

  _drainGemini() {
    // Gemini 流既可能是 SSE（"data: {json}\n\n"）也可能是裸 JSON 数组流。
    // 我们尝试两种解析。先按 \n\n 切，如果切到事件块再判断。
    let separatorIndex
    while ((separatorIndex = this.buffer.indexOf('\n\n')) !== -1) {
      const eventBlock = this.buffer.slice(0, separatorIndex)
      this.buffer = this.buffer.slice(separatorIndex + 2)
      this._handleGeminiBlock(eventBlock)
    }

    // 同时尝试按行解析（部分实现仅以 \n 分隔）
    let nlIndex
    // 复制一份 buffer 用于行级试探，避免吃掉未完成行
    while ((nlIndex = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.slice(0, nlIndex)
      // 只在该行明显是完整 SSE data 行时才 consume
      if (line.startsWith('data:')) {
        this.buffer = this.buffer.slice(nlIndex + 1)
        this._handleGeminiLine(line)
      } else {
        // 不是 SSE 行，停止行级解析（可能是 JSON 数组流）
        break
      }
    }
  }

  _handleGeminiBlock(block) {
    if (!block) {
      return
    }
    const lines = block.split('\n')
    for (const rawLine of lines) {
      const line = rawLine.replace(/\r$/, '')
      this._handleGeminiLine(line)
    }
  }

  _handleGeminiLine(line) {
    if (!line) {
      return
    }
    let payload = line
    if (line.startsWith('data:')) {
      payload = line.slice(5).trimStart()
    }
    if (!payload || payload === '[DONE]') {
      return
    }

    let data
    try {
      data = JSON.parse(payload)
    } catch (_error) {
      return
    }

    this._extractGeminiText(data)
  }

  _extractGeminiText(data) {
    if (!data || typeof data !== 'object') {
      return
    }

    // Gemini 响应可能再嵌一层 response
    const target = data.response || data
    const candidates = Array.isArray(target.candidates) ? target.candidates : null
    if (!candidates) {
      return
    }

    for (const candidate of candidates) {
      const parts = candidate?.content?.parts
      if (!Array.isArray(parts)) {
        continue
      }
      for (const part of parts) {
        if (part && typeof part.text === 'string') {
          this._append(part.text)
        }
      }
    }
  }

  _append(text) {
    if (!text || this.truncated) {
      return
    }

    const remaining = this.maxChars - this.text.length
    if (remaining <= 0) {
      this.truncated = true
      return
    }

    if (text.length <= remaining) {
      this.text += text
    } else {
      this.text += text.slice(0, remaining)
      this.truncated = true
    }
  }

  /**
   * 获取累积的文本输出
   * @returns {string}
   */
  getText() {
    return this.text
  }

  isTruncated() {
    return this.truncated
  }
}

module.exports = StreamTextCollector
