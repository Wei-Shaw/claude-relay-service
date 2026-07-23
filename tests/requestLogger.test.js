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
  res.send = jest.fn()
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

  it('捕获通过 res.send 返回的错误响应体', () => {
    const { req, res } = createRequestResponse()
    res.statusCode = 502
    requestLogger(req, res, jest.fn())

    res.send('{"error":"upstream failed"}')

    expect(res._responseBody).toBe('{"error":"upstream failed"}')
  })

  it('res.json 内部调用 res.send 时保留结构化错误响应体', () => {
    const { req, res } = createRequestResponse()
    res.statusCode = 400
    res.json = jest.fn((body) => res.send(JSON.stringify(body)))
    requestLogger(req, res, jest.fn())

    res.json({ error: { message: 'invalid request' } })

    expect(res._responseBody).toEqual({ error: { message: 'invalid request' } })
  })
})
