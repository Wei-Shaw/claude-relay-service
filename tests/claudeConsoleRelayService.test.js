jest.mock('../src/utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}))

jest.mock('axios', () => jest.fn())

jest.mock('../src/services/account/claudeConsoleAccountService', () => ({
  getAccount: jest.fn(),
  _createProxyAgent: jest.fn(),
  isAccountRateLimited: jest.fn(),
  removeAccountRateLimit: jest.fn(),
  isAccountOverloaded: jest.fn(),
  removeAccountOverload: jest.fn()
}))

jest.mock('../config/config', () => ({}), {
  virtual: true
})
jest.mock('../src/models/redis', () => ({}))

jest.mock('../src/utils/testPayloadHelper', () => ({
  createClaudeTestPayload: jest.fn(),
  sendStreamTestRequest: jest.fn()
}))

const claudeConsoleRelayService = require('../src/services/relay/claudeConsoleRelayService')
const claudeConsoleAccountService = require('../src/services/account/claudeConsoleAccountService')
const { createClaudeTestPayload, sendStreamTestRequest } = require('../src/utils/testPayloadHelper')
const axios = require('axios')
const { EventEmitter, PassThrough } = require('stream')

function createResponseStream() {
  const responseStream = new EventEmitter()
  responseStream.headersSent = false
  responseStream.destroyed = false
  responseStream.writableEnded = false
  responseStream.socket = {
    destroyed: false,
    bytesWritten: 0,
    setNoDelay: jest.fn()
  }
  responseStream.getHeader = jest.fn()
  responseStream.writeHead = jest.fn(() => {
    responseStream.headersSent = true
  })
  responseStream.write = jest.fn(() => true)
  responseStream.end = jest.fn((callback) => {
    responseStream.writableEnded = true
    responseStream.emit('finish')
    if (typeof callback === 'function') {
      callback()
    }
    responseStream.emit('close')
  })
  return responseStream
}

describe('claudeConsoleRelayService.testAccountConnection', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    claudeConsoleAccountService.isAccountRateLimited.mockResolvedValue(false)
    claudeConsoleAccountService.isAccountOverloaded.mockResolvedValue(false)
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

    expect(createClaudeTestPayload).toHaveBeenCalledWith('claude-sonnet-4-6', { stream: true })
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

    expect(createClaudeTestPayload).toHaveBeenCalledWith('claude-sonnet-4-6', { stream: true })
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
})

describe('claudeConsoleRelayService._makeClaudeConsoleStreamRequest', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('destroys upstream stream when client disconnects', async () => {
    const upstreamStream = new PassThrough()
    axios.mockResolvedValue({
      status: 200,
      data: upstreamStream,
      headers: {}
    })

    const responseStream = createResponseStream()
    const promise = claudeConsoleRelayService._makeClaudeConsoleStreamRequest(
      { model: 'claude-sonnet-4-6' },
      {
        name: 'Console A1',
        apiUrl: 'https://console.example.com',
        apiKey: 'test-key'
      },
      null,
      {},
      responseStream,
      'a1',
      jest.fn()
    )

    await new Promise((resolve) => setImmediate(resolve))
    responseStream.emit('close')

    await expect(promise).rejects.toThrow('Client disconnected')
    expect(upstreamStream.destroyed).toBe(true)
  })
})
