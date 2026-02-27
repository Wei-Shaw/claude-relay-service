/**
 * Gemini 响应格式 → OpenAI Chat Completions 格式转换器
 * 将 Gemini API 的原生响应转为标准 OpenAI chat.completion / chat.completion.chunk 格式
 */

class GeminiToOpenAIConverter {
  createStreamState() {
    return {
      buffer: '',
      id: `chatcmpl-${Date.now()}`,
      created: Math.floor(Date.now() / 1000),
      functionIndex: 0,
      candidatesWithFunctionCalls: new Set(),
      roleSent: false
    }
  }

  /**
   * 流式转换: 拦截 res.write 的 chunk → OpenAI SSE 字符串
   * @param {Buffer|string} rawChunk
   * @param {string} model
   * @param {Object} state - createStreamState() 返回的状态
   * @returns {string|null} 转换后的 SSE 字符串，null 表示跳过
   */
  convertStreamChunk(rawChunk, model, state) {
    const str = (typeof rawChunk === 'string' ? rawChunk : rawChunk.toString()).replace(
      /\r\n/g,
      '\n'
    )

    // 心跳透传：仅当 buffer 为空时才透传空白
    // buffer 有数据时需要继续处理（空白可能是 SSE 事件的 \n\n 分隔符）
    if (!str.trim() && !state.buffer) {
      return str
    }

    state.buffer += str
    let output = ''

    // 按 \n\n 分割完整 SSE 事件
    let idx
    while ((idx = state.buffer.indexOf('\n\n')) !== -1) {
      const event = state.buffer.slice(0, idx)
      state.buffer = state.buffer.slice(idx + 2)

      if (!event.trim()) {
        continue
      }

      const lines = event.split('\n')
      for (const line of lines) {
        if (!line.startsWith('data: ')) {
          continue
        }

        const jsonStr = line.slice(6).trim()
        if (!jsonStr) {
          continue
        }

        // [DONE] 消费（由 res.end patch 统一发送）
        if (jsonStr === '[DONE]') {
          continue
        }

        let geminiData
        try {
          geminiData = JSON.parse(jsonStr)
        } catch (e) {
          // 解析失败透传
          output += `data: ${jsonStr}\n\n`
          continue
        }

        // 错误事件透传
        if (geminiData.error) {
          output += `data: ${jsonStr}\n\n`
          continue
        }

        const chunks = this._convertGeminiChunkToOpenAI(geminiData, model, state)
        for (const c of chunks) {
          output += `data: ${JSON.stringify(c)}\n\n`
        }
      }
    }

    return output || null
  }

  /**
   * 非流式转换: Gemini JSON → OpenAI chat.completion
   * @param {Object} geminiData - { candidates, usageMetadata, modelVersion, responseId }
   * @param {string} model
   * @returns {Object}
   */
  convertResponse(geminiData, model) {
    // 兼容 v1internal 包裹格式 { response: { candidates: [...] } }
    const data = geminiData.response || geminiData
    const candidates = data.candidates || []
    const choices = candidates.map((candidate, i) => {
      const parts = candidate.content?.parts || []
      const textParts = []
      const thoughtParts = []
      const toolCalls = []
      const images = []
      let fnIndex = 0

      for (const part of parts) {
        if (
          part.thoughtSignature &&
          !part.text &&
          !part.functionCall &&
          !part.inlineData &&
          !part.inline_data
        ) {
          continue
        }

        if (part.functionCall) {
          toolCalls.push({
            id: `${part.functionCall.name}-${Date.now()}-${fnIndex}`,
            type: 'function',
            function: {
              name: part.functionCall.name,
              arguments: JSON.stringify(part.functionCall.args || {})
            }
          })
          fnIndex++
        } else if (part.text !== undefined) {
          if (part.thought) {
            thoughtParts.push(part.text)
          } else {
            textParts.push(part.text)
          }
        } else if (part.inlineData || part.inline_data) {
          const inlineData = part.inlineData || part.inline_data
          const imgData = inlineData.data
          if (imgData) {
            const mimeType = inlineData.mimeType || inlineData.mime_type || 'image/png'
            images.push({
              type: 'image_url',
              index: images.length,
              image_url: { url: `data:${mimeType};base64,${imgData}` }
            })
          }
        }
      }

      const message = { role: 'assistant' }
      if (textParts.length > 0) {
        message.content = textParts.join('')
      } else {
        message.content = null
      }
      if (thoughtParts.length > 0) {
        message.reasoning_content = thoughtParts.join('')
      }
      if (toolCalls.length > 0) {
        message.tool_calls = toolCalls
      }
      if (images.length > 0) {
        message.images = images
      }

      let finishReason = 'stop'
      if (toolCalls.length > 0) {
        finishReason = 'tool_calls'
      } else if (candidate.finishReason) {
        finishReason = this._mapFinishReason(candidate.finishReason)
      }

      return {
        index: candidate.index !== undefined ? candidate.index : i,
        message,
        finish_reason: finishReason
      }
    })

    const result = {
      id: data.responseId || `chatcmpl-${Date.now()}`,
      object: 'chat.completion',
      created: this._parseCreateTime(data.createTime),
      model: data.modelVersion || model,
      choices
    }

    const usage = this._mapUsage(data.usageMetadata)
    if (usage) {
      result.usage = usage
    }

    return result
  }

  // --- 内部方法 ---

  _convertGeminiChunkToOpenAI(geminiData, model, state) {
    // 兼容 v1internal 包裹格式 { response: { candidates: [...] } }
    const data = geminiData.response || geminiData

    // 更新元数据
    if (data.responseId) {
      state.id = data.responseId
    }
    if (data.modelVersion) {
      state.model = data.modelVersion
    }
    if (data.createTime) {
      const ts = this._parseCreateTime(data.createTime)
      if (ts !== Math.floor(Date.now() / 1000)) {
        state.created = ts
      }
    }

    const candidates = data.candidates || []
    if (candidates.length === 0 && data.usageMetadata) {
      // 仅 usage 的最终 chunk
      const chunk = this._makeChunk(state, model)
      chunk.choices[0].finish_reason = 'stop'
      chunk.usage = this._mapUsage(data.usageMetadata)
      return [chunk]
    }

    const results = []
    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i]
      const candidateIndex = candidate.index !== undefined ? candidate.index : i
      const parts = candidate.content?.parts || []

      for (const part of parts) {
        if (
          part.thoughtSignature &&
          !part.text &&
          !part.functionCall &&
          !part.inlineData &&
          !part.inline_data
        ) {
          continue
        }

        const chunk = this._makeChunk(state, model)
        chunk.choices[0].index = candidateIndex

        if (part.functionCall) {
          state.candidatesWithFunctionCalls.add(candidateIndex)
          chunk.choices[0].delta = {
            tool_calls: [
              {
                index: state.functionIndex,
                id: `${part.functionCall.name}-${Date.now()}-${state.functionIndex}`,
                type: 'function',
                function: {
                  name: part.functionCall.name,
                  arguments: JSON.stringify(part.functionCall.args || {})
                }
              }
            ]
          }
          this._injectRole(state, chunk.choices[0].delta)
          state.functionIndex++
          results.push(chunk)
        } else if (part.text !== undefined) {
          if (part.thought) {
            chunk.choices[0].delta = { reasoning_content: part.text }
          } else {
            chunk.choices[0].delta = { content: part.text }
          }
          this._injectRole(state, chunk.choices[0].delta)
          results.push(chunk)
        } else if (part.inlineData || part.inline_data) {
          const inlineData = part.inlineData || part.inline_data
          const imgData = inlineData.data
          if (imgData) {
            const mimeType = inlineData.mimeType || inlineData.mime_type || 'image/png'
            chunk.choices[0].delta = {
              images: [
                {
                  type: 'image_url',
                  index: 0,
                  image_url: { url: `data:${mimeType};base64,${imgData}` }
                }
              ]
            }
            this._injectRole(state, chunk.choices[0].delta)
            results.push(chunk)
          }
        }
      }

      // finish_reason
      if (candidate.finishReason) {
        const chunk = this._makeChunk(state, model)
        chunk.choices[0].index = candidateIndex

        if (state.candidatesWithFunctionCalls.has(candidateIndex)) {
          chunk.choices[0].finish_reason = 'tool_calls'
        } else {
          chunk.choices[0].finish_reason = this._mapFinishReason(candidate.finishReason)
        }

        if (data.usageMetadata) {
          chunk.usage = this._mapUsage(data.usageMetadata)
        }

        results.push(chunk)
      }
    }

    return results
  }

  _mapFinishReason(geminiReason) {
    // 按 Gemini FinishReason 官方枚举完整映射
    const fr = geminiReason.toLowerCase()
    if (fr === 'stop') {
      return 'stop'
    }
    if (fr === 'max_tokens') {
      return 'length'
    }
    // 工具调用异常 → stop（调用失败不等于内容过滤）
    if (
      fr === 'malformed_function_call' ||
      fr === 'too_many_tool_calls' ||
      fr === 'unexpected_tool_call'
    ) {
      return 'stop'
    }
    // 内容策略/安全拦截 → content_filter
    if (
      fr === 'safety' ||
      fr === 'recitation' ||
      fr === 'blocklist' ||
      fr === 'prohibited_content' ||
      fr === 'spii' ||
      fr === 'image_safety' ||
      fr === 'language'
    ) {
      return 'content_filter'
    }
    // FINISH_REASON_UNSPECIFIED, OTHER, 未知值 → stop
    return 'stop'
  }

  _makeChunk(state, model) {
    return {
      id: state.id,
      object: 'chat.completion.chunk',
      created: state.created,
      model: state.model || model,
      choices: [{ index: 0, delta: {}, finish_reason: null }]
    }
  }

  _injectRole(state, delta) {
    if (!state.roleSent) {
      delta.role = 'assistant'
      state.roleSent = true
    }
  }

  _parseCreateTime(createTime) {
    if (!createTime) {
      return Math.floor(Date.now() / 1000)
    }
    // Gemini 官方文档：createTime 为 RFC3339 格式字符串
    const ts = Math.floor(new Date(createTime).getTime() / 1000)
    return isNaN(ts) ? Math.floor(Date.now() / 1000) : ts
  }

  _mapUsage(meta) {
    if (!meta) {
      return undefined
    }
    const completionTokens = (meta.candidatesTokenCount || 0) + (meta.thoughtsTokenCount || 0)
    const result = {
      prompt_tokens: meta.promptTokenCount || 0,
      completion_tokens: completionTokens,
      total_tokens: meta.totalTokenCount || 0
    }
    if (meta.thoughtsTokenCount > 0) {
      result.completion_tokens_details = { reasoning_tokens: meta.thoughtsTokenCount }
    }
    if (meta.cachedContentTokenCount > 0) {
      result.prompt_tokens_details = { cached_tokens: meta.cachedContentTokenCount }
    }
    return result
  }
}

module.exports = GeminiToOpenAIConverter
