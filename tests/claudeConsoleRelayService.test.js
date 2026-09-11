jest.mock('../src/utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}))

jest.mock('../src/services/account/claudeConsoleAccountService', () => ({
  getAccount: jest.fn(),
  _createProxyAgent: jest.fn(),
  isAccountRateLimited: jest.fn(),
  isAccountOverloaded: jest.fn(),
  removeAccountRateLimit: jest.fn(),
  removeAccountOverload: jest.fn()
}))

jest.mock('../config/config', () => ({}), {
  virtual: true
})
jest.mock('../src/models/redis', () => ({}))

jest.mock('axios', () => jest.fn())

jest.mock('../src/utils/testPayloadHelper', () => ({
  createClaudeTestPayload: jest.fn(),
  sendStreamTestRequest: jest.fn()
}))

const claudeConsoleRelayService = require('../src/services/relay/claudeConsoleRelayService')
const claudeConsoleAccountService = require('../src/services/account/claudeConsoleAccountService')
const { createClaudeTestPayload, sendStreamTestRequest } = require('../src/utils/testPayloadHelper')
const axios = require('axios')

function createClientRequest() {
  return {
    once: jest.fn(),
    removeListener: jest.fn()
  }
}

function createClientResponse() {
  return {
    once: jest.fn(),
    removeListener: jest.fn()
  }
}

function createStreamResponse() {
  return {
    headersSent: false,
    destroyed: false,
    writableEnded: false,
    writeHead: jest.fn(function writeHead(statusCode) {
      this.headersSent = true
      this.statusCode = statusCode
    }),
    write: jest.fn(),
    end: jest.fn(function end() {
      this.writableEnded = true
    }),
    getHeader: jest.fn(),
    on: jest.fn()
  }
}

describe('claudeConsoleRelayService.testAccountConnection', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('passes selected model stream payload and bearer auth for non sk-ant key', async () => {
    claudeConsoleAccountService.getAccount.mockResolvedValue({
      name: 'Console A1',
      apiUrl: 'https://console.example.com',
      apiKey: 'test-key',
      proxy: null,
      userAgent: null
    })
    claudeConsoleAccountService._createProxyAgent.mockReturnValue(undefined)

    const payload = {
      model: 'claude-sonnet-4-6',
      stream: true
    }
    createClaudeTestPayload.mockReturnValue(payload)
    sendStreamTestRequest.mockResolvedValue(undefined)

    const res = {}
    await claudeConsoleRelayService.testAccountConnection('a1', res, 'claude-sonnet-4-6')

    expect(createClaudeTestPayload).toHaveBeenCalledWith('claude-sonnet-4-6', {
      stream: true,
      maxTokens: 64
    })
    expect(sendStreamTestRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        payload,
        authorization: 'Bearer test-key'
      })
    )
  })

  it('passes selected model stream payload and x-api-key for sk-ant key', async () => {
    claudeConsoleAccountService.getAccount.mockResolvedValue({
      name: 'Console A1',
      apiUrl: 'https://console.example.com',
      apiKey: 'sk-ant-test-key',
      proxy: null,
      userAgent: null
    })
    claudeConsoleAccountService._createProxyAgent.mockReturnValue(undefined)

    const payload = {
      model: 'claude-sonnet-4-6',
      stream: true
    }
    createClaudeTestPayload.mockReturnValue(payload)
    sendStreamTestRequest.mockResolvedValue(undefined)

    const res = {}
    await claudeConsoleRelayService.testAccountConnection('a1', res, 'claude-sonnet-4-6')

    expect(createClaudeTestPayload).toHaveBeenCalledWith('claude-sonnet-4-6', {
      stream: true,
      maxTokens: 64
    })
    const requestOptions = sendStreamTestRequest.mock.calls[0][0]
    expect(requestOptions).toEqual(
      expect.objectContaining({
        payload,
        extraHeaders: expect.objectContaining({
          'x-api-key': 'sk-ant-test-key'
        })
      })
    )
    expect(requestOptions).not.toHaveProperty('authorization')
  })

  it('returns the raw upstream response alongside the sanitized non-stream error', async () => {
    claudeConsoleAccountService.getAccount.mockResolvedValue({
      name: 'Console A1',
      apiUrl: 'https://console.example.com',
      apiKey: 'test-key',
      maxConcurrentTasks: 0,
      supportedModels: null,
      proxy: null,
      userAgent: null
    })
    claudeConsoleAccountService._createProxyAgent.mockReturnValue(undefined)
    claudeConsoleAccountService.isAccountRateLimited.mockResolvedValue(false)
    claudeConsoleAccountService.isAccountOverloaded.mockResolvedValue(false)
    claudeConsoleRelayService._updateLastUsedTime = jest.fn().mockResolvedValue(undefined)
    const upstreamBody = {
      error: {
        type: 'invalid_request_error',
        message: 'failed at https://console.example.com/internal'
      }
    }
    axios.mockResolvedValue({ status: 400, headers: {}, data: upstreamBody })

    const result = await claudeConsoleRelayService.relayRequest(
      { model: 'claude-sonnet-4-6' },
      { id: 'key-1', name: 'Key 1' },
      createClientRequest(),
      createClientResponse(),
      {},
      'a1'
    )

    expect(result.upstreamResponseBody).toBe(upstreamBody)
    expect(result.body).not.toContain('https://console.example.com/internal')
  })

  it('captures the raw upstream body before sanitizing a stream error', async () => {
    const upstreamBody = {
      error: {
        type: 'invalid_request_error',
        message: 'failed at https://console.example.com/internal'
      }
    }
    const upstreamStream = new (require('stream').PassThrough)()
    axios.mockResolvedValue({ status: 400, headers: {}, data: upstreamStream })
    const responseStream = createStreamResponse()

    const request = claudeConsoleRelayService._makeClaudeConsoleStreamRequest(
      { model: 'claude-sonnet-4-6' },
      { name: 'Console A1', apiUrl: 'https://console.example.com', apiKey: 'test-key' },
      undefined,
      {},
      responseStream,
      'a1',
      null
    )
    upstreamStream.end(JSON.stringify(upstreamBody))
    await request

    expect(responseStream._upstreamResponseBody).toEqual(upstreamBody)
    expect(responseStream.write).toHaveBeenCalledWith(
      expect.not.stringContaining('https://console.example.com/internal')
    )
  })
})
