const { EventEmitter } = require('events')
const { Readable } = require('stream')
const zlib = require('zlib')

jest.mock('../src/utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  api: jest.fn(),
  performance: jest.fn()
}))
jest.mock(
  '../config/config',
  () => ({
    requestTimeout: 600000,
    claude: {
      apiUrl: 'https://api.anthropic.com/v1/messages',
      apiVersion: '2023-06-01'
    }
  }),
  { virtual: true }
)
jest.mock('../src/models/redis', () => ({}))
jest.mock('../src/services/account/claudeAccountService', () => ({
  getAccount: jest.fn().mockResolvedValue({ id: 'acct-1', name: 'Account 1' }),
  clearInternalErrors: jest.fn().mockResolvedValue(undefined),
  isAccountOverloaded: jest.fn().mockResolvedValue(false)
}))
jest.mock('../src/services/account/claudeConsoleAccountService', () => ({
  isAccountRateLimited: jest.fn().mockResolvedValue(false),
  isAccountOverloaded: jest.fn().mockResolvedValue(false)
}))
jest.mock('../src/services/scheduler/unifiedClaudeScheduler', () => ({
  isAccountRateLimited: jest.fn().mockResolvedValue(false)
}))
jest.mock('../src/services/claudeCodeHeadersService', () => ({}))
jest.mock('../src/utils/performanceOptimizer', () => ({
  getHttpsAgentForStream: jest.fn(() => undefined),
  getHttpsAgentForNonStream: jest.fn(() => undefined),
  getPricingData: jest.fn(() => ({}))
}))
jest.mock('https', () => ({ request: jest.fn() }))
jest.mock('axios', () => jest.fn())

const https = require('https')
const axios = require('axios')
const official = require('../src/services/relay/claudeRelayService')
const consoleRelay = require('../src/services/relay/claudeConsoleRelayService')
const logger = require('../src/utils/logger')

const text = '同步时间和升级时间是对上的，两边的包大小不完全一样。中文🙂🚀'
const events = [
  {
    type: 'message_start',
    message: { model: 'claude-sonnet-4-6', usage: { input_tokens: 10, output_tokens: 0 } }
  },
  { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
  {
    type: 'content_block_delta',
    index: 1,
    delta: { type: 'input_json_delta', partial_json: '{"说明":"中文工具参数🙂"}' }
  },
  { type: 'message_delta', usage: { output_tokens: 20 } },
  { type: 'message_stop' }
]
const wire = events
  .map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
  .join('')

function response() {
  const stream = new EventEmitter()
  stream.writes = []
  stream.writable = true
  stream.headersSent = false
  stream.writableEnded = false
  stream.destroyed = false
  stream.setHeader = jest.fn()
  stream.getHeader = jest.fn()
  stream.writeHead = jest.fn(() => {
    stream.headersSent = true
  })
  stream.write = jest.fn((chunk) => {
    stream.headersSent = true
    stream.writes.push(chunk)
    return true
  })
  stream.end = jest.fn((callback) => {
    stream.writableEnded = true
    if (callback) {
      callback()
    }
  })
  return stream
}

async function forward(branch, chunks, encoding, transformer = null) {
  const output = response()
  const usage = jest.fn()
  const body = { model: 'claude-sonnet-4-6', messages: [] }
  const headers = { 'content-type': 'text/event-stream' }
  if (encoding) {
    headers['content-encoding'] = encoding
  }
  if (branch === 'official') {
    https.request.mockImplementation((_options, handler) => {
      const req = new EventEmitter()
      req.write = jest.fn()
      req.setTimeout = jest.fn()
      req.destroy = jest.fn()
      req.end = () =>
        setImmediate(async () => {
          const upstream = new Readable({ read() {} })
          upstream.statusCode = 200
          upstream.headers = headers
          await handler(upstream)
          for (const chunk of chunks) {
            upstream.push(chunk)
          }
          upstream.push(null)
        })
      return req
    })
    await official._makeClaudeStreamRequestWithUsageCapture(
      body,
      'token',
      null,
      {},
      output,
      usage,
      'acct-1',
      'claude-official',
      'session-hash',
      transformer,
      { isRealClaudeCodeRequest: true }
    )
  } else {
    // Axios already decompresses upstream responses before exposing response.data.
    axios.mockImplementation(() =>
      Promise.resolve({
        status: 200,
        headers,
        data: Readable.from(chunks)
      })
    )
    await consoleRelay._makeClaudeConsoleStreamRequest(
      body,
      { apiUrl: 'https://console.example.com', apiKey: 'test-key' },
      null,
      {},
      output,
      'acct-1',
      usage,
      transformer
    )
  }
  return { output: output.writes.join(''), usage }
}

beforeEach(() => {
  jest.clearAllMocks()
  jest
    .spyOn(official, '_prepareRequestHeadersAndPayload')
    .mockResolvedValue({ bodyString: '{}', headers: {}, toolNameMap: null })
  jest.spyOn(official, 'clearUnauthorizedErrors').mockResolvedValue(undefined)
})
afterEach(() => jest.restoreAllMocks())

describe.each(['official', 'console'])('%s UTF-8 stream forwarding', (branch) => {
  test('preserves every possible single split inside SSE text and tool arguments', async () => {
    const bytes = Buffer.from(wire)
    for (let i = 1; i < bytes.length; i++) {
      const result = await forward(branch, [bytes.subarray(0, i), bytes.subarray(i)])
      expect(result.output).toBe(wire)
      expect(result.usage).toHaveBeenCalledTimes(1)
      expect(result.usage).toHaveBeenCalledWith(
        expect.objectContaining({ input_tokens: 10, output_tokens: 20 })
      )
    }
    expect(logger.error).not.toHaveBeenCalled()
  })

  test('preserves one-byte chunks and a final SSE line without newline', async () => {
    const tail = `data: ${JSON.stringify({
      type: 'content_block_delta',
      delta: { type: 'text_delta', text }
    })}`
    const input = wire + tail
    const chunks = Array.from(Buffer.from(input), (byte) => Buffer.from([byte]))
    expect((await forward(branch, chunks)).output).toBe(input)
    expect(logger.error).not.toHaveBeenCalled()
  })

  test('passes decoded text to the stream transformer', async () => {
    const transform = jest.fn((value) => value.replaceAll('中文', '汉字'))
    const chunks = Array.from(Buffer.from(wire), (byte) => Buffer.from([byte]))
    const result = await forward(branch, chunks, undefined, transform)
    expect(result.output).toBe(wire.replaceAll('中文', '汉字'))
    expect(transform).toHaveBeenCalled()
  })

  test('flushes an incomplete final UTF-8 sequence exactly once', async () => {
    const result = await forward(branch, [Buffer.from(wire), Buffer.from([0xe6, 0x98])])
    expect(result.output).toBe(`${wire}\ufffd`)
  })
})

test.each(['gzip', 'deflate'])('official handles fragmented %s responses', async (encoding) => {
  const bytes = encoding === 'gzip' ? zlib.gzipSync(wire) : zlib.deflateSync(wire)
  const chunks = Array.from(bytes, (byte) => Buffer.from([byte]))
  const result = await forward('official', chunks, encoding)
  expect(result.output).toBe(wire)
  expect(result.usage).toHaveBeenCalledWith(
    expect.objectContaining({ input_tokens: 10, output_tokens: 20 })
  )
  expect(logger.error).not.toHaveBeenCalled()
})
