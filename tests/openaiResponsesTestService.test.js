const { EventEmitter } = require('events')
const { PassThrough } = require('stream')

jest.mock('axios', () => ({
  post: jest.fn()
}))

jest.mock('../src/utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}))

jest.mock('../config/config', () => ({ server: { port: 3000 } }), {
  virtual: true
})

const axios = require('axios')
const openaiResponsesTestService = require('../src/services/openaiResponsesTestService')

function createResponseStream() {
  const responseStream = new EventEmitter()
  responseStream.headersSent = false
  responseStream.destroyed = false
  responseStream.writableEnded = false
  responseStream.chunks = []
  responseStream.writeHead = jest.fn((statusCode, headers) => {
    responseStream.statusCode = statusCode
    responseStream.headers = headers
    responseStream.headersSent = true
  })
  responseStream.write = jest.fn((chunk) => {
    responseStream.chunks.push(String(chunk))
    return true
  })
  responseStream.end = jest.fn(() => {
    responseStream.writableEnded = true
  })
  return responseStream
}

function parseWrittenEvents(responseStream) {
  return responseStream.chunks
    .join('')
    .split('\n\n')
    .filter(Boolean)
    .map((event) => JSON.parse(event.slice('data:'.length).trim()))
}

function flushAsyncWork() {
  return new Promise((resolve) => setImmediate(resolve))
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('openaiResponsesTestService.buildTestRequestParts', () => {
  it('只在请求头中携带 session_id', () => {
    const { sessionId, payload, headers } = openaiResponsesTestService.buildTestRequestParts(
      'gpt-5.4',
      {
        sessionId: 'codex_test_fixed'
      }
    )

    expect(payload).not.toHaveProperty('session_id')
    expect(headers.session_id).toBe(sessionId)
    expect(sessionId).toBe('codex_test_fixed')
  })
})

describe('openaiResponsesTestService.parseOpenAITestResponse', () => {
  it('成功 JSON 响应不把完整响应体当作 errorMessage', async () => {
    const parsed = await openaiResponsesTestService.parseOpenAITestResponse({
      status: 200,
      data: {
        object: 'response',
        output_text: 'ok'
      }
    })

    expect(parsed.responseText).toBe('ok')
    expect(parsed.errorMessage).toBe('')
  })

  it('错误 JSON 响应提取可读错误信息', async () => {
    const parsed = await openaiResponsesTestService.parseOpenAITestResponse({
      status: 400,
      data: {
        error: {
          message: 'bad request'
        }
      }
    })

    expect(parsed.responseText).toBe('')
    expect(parsed.errorMessage).toBe('bad request')
  })
})

describe('openaiResponsesTestService.parseOpenAITestStreamBody', () => {
  it('流式错误响应提取 response.failed 错误信息', () => {
    const parsed = openaiResponsesTestService.parseOpenAITestStreamBody(
      `data: ${JSON.stringify({
        type: 'response.failed',
        response: { error: { message: 'upstream failed' } }
      })}\n\n`
    )

    expect(parsed.responseText).toBe('')
    expect(parsed.errorMessage).toBe('upstream failed')
    expect(parsed.events).toContain('response.failed')
  })
})

describe('openaiResponsesTestService.sendApiKeyTestStream', () => {
  it('转发流式文本并成功结束测试', async () => {
    const upstream = new PassThrough()
    const responseStream = createResponseStream()
    axios.post.mockResolvedValue({
      status: 200,
      data: upstream,
      headers: {}
    })

    const promise = openaiResponsesTestService.sendApiKeyTestStream({
      apiKey: 'test-api-key-123',
      model: 'gpt-5',
      responseStream,
      baseUrl: 'http://internal.test'
    })

    await flushAsyncWork()
    upstream.write(
      `data: ${JSON.stringify({ type: 'response.output_text.delta', delta: 'he' })}\n\n`
    )
    upstream.end(
      `data: ${JSON.stringify({ type: 'response.output_text.delta', delta: 'llo' })}\n\n`
    )
    await promise

    expect(axios.post).toHaveBeenCalledWith(
      'http://internal.test/openai/v1/responses',
      expect.objectContaining({ model: 'gpt-5', stream: true }),
      expect.objectContaining({
        responseType: 'stream',
        validateStatus: expect.any(Function)
      })
    )
    expect(parseWrittenEvents(responseStream)).toEqual([
      { type: 'test_start', message: 'Test started' },
      { type: 'content', text: 'he' },
      { type: 'content', text: 'llo' },
      { type: 'test_complete', success: true }
    ])
    expect(responseStream.end).toHaveBeenCalledTimes(1)
  })

  it('上游响应后、监听器注册前客户端断开时静默结束', async () => {
    const upstream = new PassThrough()
    const destroySpy = jest.spyOn(upstream, 'destroy')
    const responseStream = createResponseStream()
    let closeEmitted = false

    axios.post.mockResolvedValue({
      status: 200,
      headers: {},
      get data() {
        if (!closeEmitted) {
          closeEmitted = true
          responseStream.emit('close')
        }
        return upstream
      }
    })

    const result = await Promise.race([
      openaiResponsesTestService
        .sendApiKeyTestStream({
          apiKey: 'test-api-key-123',
          responseStream,
          baseUrl: 'http://internal.test'
        })
        .then(() => 'resolved'),
      new Promise((resolve) => setTimeout(() => resolve('timeout'), 100))
    ])

    expect(result).toBe('resolved')
    expect(destroySpy).toHaveBeenCalled()
    expect(responseStream.end).not.toHaveBeenCalled()
    expect(responseStream.chunks.join('')).toContain('"type":"test_start"')
    expect(responseStream.chunks.join('')).not.toContain('"type":"test_complete"')
  })
})
