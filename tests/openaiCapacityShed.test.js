// Codex/OpenAI 容量降载识别与改写的单元测试。
//
// 上游 error.code = server_is_overloaded / slow_down 是 Codex CLI 的致命闭集
// （codex-rs/codex-api/src/sse/responses.rs 的 is_server_overloaded_error →
// CodexErr::ServerOverloaded，而 CodexErr::is_retryable() 对它返回 false），
// 命中即打印 "Selected model is at capacity. Please try a different model." 并结束回合。
// 这里锁定：什么算降载、什么不算、改写只动这两个码。

const {
  RETRYABLE_CLIENT_CODE,
  computeRetryDelayMs,
  extractErrorCode,
  extractErrorMessage,
  isCapacityShedEvent,
  isCapacityShedMessage,
  isCapacityShedResponse,
  isTransientProcessing400,
  parseSSEBlock,
  resolveSettings,
  rewriteCapacityShedCode,
  rewriteCapacityShedSSEBlock,
  streamDataStartsClientOutput
} = require('../src/utils/openaiCapacityShed')

describe('降载错误码识别', () => {
  it.each(['server_is_overloaded', 'slow_down'])('识别 error.code = %s', (code) => {
    expect(isCapacityShedEvent({ type: 'error', error: { code } })).toBe(true)
    expect(extractErrorCode({ type: 'error', error: { code } })).toBe(code)
  })

  it.each(['server_is_overloaded', 'slow_down'])('识别 response.error.code = %s', (code) => {
    const payload = { type: 'response.failed', response: { error: { code } } }
    expect(isCapacityShedEvent(payload)).toBe(true)
    expect(extractErrorCode(payload)).toBe(code)
  })

  it('错误码大小写不敏感', () => {
    expect(isCapacityShedEvent({ error: { code: 'SERVER_IS_OVERLOADED' } })).toBe(true)
  })

  it.each([
    'server_error',
    'rate_limit_exceeded',
    'usage_limit_reached',
    'context_length_exceeded',
    'content_policy_violation',
    'model_not_found'
  ])('不把 %s 当降载', (code) => {
    expect(isCapacityShedEvent({ error: { code } })).toBe(false)
  })
})

describe('降载消息识别', () => {
  it.each([
    'Our servers are currently overloaded. Please try again later.',
    'The server is overloaded, retry shortly',
    'Our servers are overloaded'
  ])('识别 %s', (message) => {
    expect(isCapacityShedMessage(message)).toBe(true)
    expect(isCapacityShedEvent({ error: { message } })).toBe(true)
  })

  it('无错误码但消息命中时仍算降载', () => {
    const payload = {
      type: 'error',
      error: { type: 'service_unavailable_error', message: 'Our servers are currently overloaded.' }
    }
    expect(isCapacityShedEvent(payload)).toBe(true)
  })

  it('用户内容回显同样短语时不误判（只看结构化错误字段）', () => {
    const payload = {
      type: 'response.failed',
      response: {
        error: { code: 'invalid_request_error', message: 'bad input' },
        output: [{ content: [{ text: 'Our servers are currently overloaded' }] }]
      }
    }
    expect(isCapacityShedEvent(payload)).toBe(false)
    expect(isCapacityShedResponse({ status: 400, payload, rawBody: JSON.stringify(payload) })).toBe(
      false
    )
  })
})

describe('HTTP 400 瞬时处理失败', () => {
  it('识别 "Selected model is at capacity…"', () => {
    const payload = {
      error: {
        type: 'invalid_request_error',
        message: 'Selected model is at capacity. Please try a different model.'
      }
    }
    expect(isTransientProcessing400(400, payload)).toBe(true)
    expect(isCapacityShedResponse({ status: 400, payload })).toBe(true)
  })

  it('识别 request id 三件套', () => {
    const payload = {
      error: {
        message:
          'You can retry your request, or contact us through help.openai.com if the error persists. Please include the request ID req_abc.'
      }
    }
    expect(isTransientProcessing400(400, payload)).toBe(true)
  })

  it('同样的短语在 400 之外的状态码上不生效', () => {
    const payload = { error: { message: 'Selected model is at capacity.' } }
    expect(isTransientProcessing400(422, payload)).toBe(false)
    expect(isCapacityShedResponse({ status: 422, payload })).toBe(false)
  })

  it('非 JSON 纯文本响应体才允许整体扫描', () => {
    const rawBody = 'An error occurred while processing your request'
    expect(isCapacityShedResponse({ status: 400, payload: null, rawBody })).toBe(true)
  })

  it('quota 429 保持原语义，不进降载路径', () => {
    const payload = {
      error: { type: 'usage_limit_reached', message: 'usage limit', resets_in_seconds: 3600 }
    }
    expect(isCapacityShedResponse({ status: 429, payload })).toBe(false)
  })
})

describe('错误码改写', () => {
  it('把 error.code 改写为 server_error 并保留消息', () => {
    const payload = {
      type: 'error',
      error: {
        type: 'service_unavailable_error',
        code: 'server_is_overloaded',
        message: 'Our servers are currently overloaded. Please try again later.'
      }
    }
    const { payload: out, changed } = rewriteCapacityShedCode(payload)
    expect(changed).toBe(true)
    expect(out.error.code).toBe(RETRYABLE_CLIENT_CODE)
    expect(out.error.message).toBe('Our servers are currently overloaded. Please try again later.')
    expect(out.error.type).toBe('service_unavailable_error')
    // 原对象不被就地修改
    expect(payload.error.code).toBe('server_is_overloaded')
  })

  it('改写 response.error.code', () => {
    const payload = {
      type: 'response.failed',
      response: { id: 'resp_1', status: 'failed', error: { code: 'slow_down', message: 'slow' } }
    }
    const { payload: out, changed } = rewriteCapacityShedCode(payload)
    expect(changed).toBe(true)
    expect(out.response.error.code).toBe(RETRYABLE_CLIENT_CODE)
    expect(out.response.id).toBe('resp_1')
  })

  it('不动 rate_limit_exceeded —— 客户端依赖原码解析重试延时', () => {
    const payload = { error: { code: 'rate_limit_exceeded', message: 'Please try again in 11.0s' } }
    const { payload: out, changed } = rewriteCapacityShedCode(payload)
    expect(changed).toBe(false)
    expect(out.error.code).toBe('rate_limit_exceeded')
  })

  it('无码但消息命中降载时补上 server_error', () => {
    const payload = {
      error: { type: 'service_unavailable_error', message: 'Our servers are overloaded.' }
    }
    const { payload: out, changed } = rewriteCapacityShedCode(payload)
    expect(changed).toBe(true)
    expect(out.error.code).toBe(RETRYABLE_CLIENT_CODE)
  })

  it('SSE 事件块改写后仍是合法 SSE', () => {
    const block =
      'event: response.failed\ndata: {"type":"response.failed","response":{"error":{"code":"server_is_overloaded","message":"Our servers are currently overloaded."}}}\n\n'
    const { block: out, changed } = rewriteCapacityShedSSEBlock(block)
    expect(changed).toBe(true)
    expect(out).toContain('event: response.failed')
    expect(out).not.toContain('server_is_overloaded')
    expect(out).toContain('"code":"server_error"')
    expect(out).toContain('Our servers are currently overloaded.')
    expect(parseSSEBlock(out).data.response.error.code).toBe('server_error')
  })

  it('非降载事件块原样返回', () => {
    const block = 'event: response.output_text.delta\ndata: {"delta":"hi"}\n\n'
    expect(rewriteCapacityShedSSEBlock(block)).toEqual({ block, changed: false })
  })
})

describe('客户端输出起点判定', () => {
  const cases = [
    // 降载帧不算输出：写出去 Codex 就地终止，重试机会随之消失
    [{ type: 'error', error: { code: 'server_is_overloaded' } }, 'error', false],
    [{ type: 'error', error: { code: 'slow_down' } }, 'error', false],
    [
      { type: 'response.failed', response: { error: { code: 'server_is_overloaded' } } },
      'response.failed',
      false
    ],
    // 非降载错误立即转发，不做重试
    [
      { type: 'error', error: { type: 'invalid_request_error', code: 'content_policy_violation' } },
      'error',
      true
    ],
    [{ type: 'error', error: { code: 'rate_limit_exceeded' } }, 'error', true],
    // preamble
    [{ type: 'response.created', response: { id: 'resp_1' } }, 'response.created', false],
    [{ type: 'response.in_progress', response: { id: 'resp_1' } }, 'response.in_progress', false],
    [
      { type: 'response.output_item.added', item: { type: 'reasoning', summary: [] } },
      'response.output_item.added',
      false
    ],
    [
      {
        type: 'response.output_item.added',
        item: { type: 'reasoning', encrypted_content: 'ciphertext' }
      },
      'response.output_item.added',
      true
    ],
    [
      {
        type: 'response.reasoning_summary_part.added',
        part: { type: 'summary_text', text: '' }
      },
      'response.reasoning_summary_part.added',
      false
    ],
    [
      {
        type: 'response.reasoning_summary_part.added',
        part: { type: 'summary_text', text: 'thinking' }
      },
      'response.reasoning_summary_part.added',
      true
    ],
    [
      { type: 'response.content_part.added', part: { type: 'output_text', text: '' } },
      'response.content_part.added',
      false
    ],
    [{ type: 'response.output_text.delta', delta: 'hi' }, 'response.output_text.delta', true],
    // data: [DONE]
    [null, '', true]
  ]

  it.each(cases)('%j / %s → %s', (data, eventType, expected) => {
    expect(streamDataStartsClientOutput(data, eventType)).toBe(expected)
  })

  it('缺少 event: 行时回退到 data.type', () => {
    expect(
      streamDataStartsClientOutput({ type: 'response.created', response: { id: 'r' } }, '')
    ).toBe(false)
    expect(
      streamDataStartsClientOutput({ type: 'response.output_text.delta', delta: 'x' }, '')
    ).toBe(true)
  })
})

describe('SSE 事件块解析', () => {
  it('解析 event/data', () => {
    const parsed = parseSSEBlock('event: error\ndata: {"type":"error"}\n\n')
    expect(parsed.eventType).toBe('error')
    expect(parsed.data).toEqual({ type: 'error' })
    expect(parsed.isDone).toBe(false)
  })

  it('识别 [DONE]', () => {
    const parsed = parseSSEBlock('data: [DONE]\n\n')
    expect(parsed.isDone).toBe(true)
    expect(parsed.data).toBeNull()
  })

  it('非法 JSON 不抛异常', () => {
    expect(parseSSEBlock('data: {oops\n\n').data).toBeNull()
  })
})

describe('退避与配置', () => {
  it('按尝试次数递增，封顶 8s', () => {
    expect(computeRetryDelayMs(1)).toBe(500)
    expect(computeRetryDelayMs(2)).toBe(1000)
    expect(computeRetryDelayMs(3)).toBe(2000)
    expect(computeRetryDelayMs(99)).toBe(2000)
  })

  it('预算内采纳 Retry-After', () => {
    expect(computeRetryDelayMs(1, '3')).toBe(3000)
  })

  it('超出预算的 Retry-After 不采纳，避免把请求挂死', () => {
    expect(computeRetryDelayMs(1, '600')).toBe(500)
  })

  it('resolveSettings 合并覆盖项并忽略非法值', () => {
    expect(resolveSettings({ maxAttempts: 5, maxDelayMs: 0, bufferLimitBytes: 'x' })).toEqual({
      maxAttempts: 5,
      retryDelaysMs: [500, 1000, 2000],
      maxDelayMs: 8000,
      bufferLimitBytes: 256 * 1024,
      preOutputBufferMs: 15000
    })
    expect(resolveSettings({ preOutputBufferMs: 3000 }).preOutputBufferMs).toBe(3000)
    expect(resolveSettings(null).maxAttempts).toBe(3)
  })
})

describe('消息提取', () => {
  it('按 error.message → response.error.message → message 顺序', () => {
    expect(extractErrorMessage({ error: { message: 'a' } })).toBe('a')
    expect(extractErrorMessage({ response: { error: { message: 'b' } } })).toBe('b')
    expect(extractErrorMessage({ message: 'c' })).toBe('c')
    expect(extractErrorMessage({})).toBe('')
  })
})
