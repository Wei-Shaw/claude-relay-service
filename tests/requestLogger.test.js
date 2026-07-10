const { EventEmitter } = require('events')

jest.mock('../src/utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  security: jest.fn(),
  database: jest.fn(),
  success: jest.fn()
}))

jest.mock('../src/services/requestDetailService', () => ({
  captureLifecycleRequest: jest.fn()
}))

const requestDetailService = require('../src/services/requestDetailService')
const { requestLogger } = require('../src/middleware/auth')

function createRequestResponse() {
  const req = {
    originalUrl: '/openai/responses',
    method: 'POST',
    body: { model: 'gpt-4.1-mini', stream: true },
    headers: {},
    ip: '127.0.0.1',
    get: jest.fn(() => null)
  }
  const res = new EventEmitter()
  res.statusCode = 200
  res.writableEnded = false
  res.setHeader = jest.fn()
  res.get = jest.fn(() => null)
  res.json = jest.fn()
  return { req, res }
}

describe('requestLogger close 分类', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    requestDetailService.captureLifecycleRequest.mockResolvedValue({ captured: true })
  })

  it('成功终止事件已转发时不记录 client_aborted', () => {
    const { req, res } = createRequestResponse()
    requestLogger(req, res, jest.fn())
    req._relayResponseTerminalForwarded = true

    res.emit('close')

    expect(requestDetailService.captureLifecycleRequest).toHaveBeenCalledWith(
      req,
      res,
      expect.objectContaining({
        completed: true,
        clientAborted: false,
        statusCode: 200
      })
    )
  })

  it('成功终止事件未转发时按 499 记录 client_aborted', () => {
    const { req, res } = createRequestResponse()
    requestLogger(req, res, jest.fn())

    res.emit('close')

    expect(requestDetailService.captureLifecycleRequest).toHaveBeenCalledWith(
      req,
      res,
      expect.objectContaining({
        completed: false,
        clientAborted: true,
        statusCode: 499,
        errorType: 'client_aborted'
      })
    )
  })
})
