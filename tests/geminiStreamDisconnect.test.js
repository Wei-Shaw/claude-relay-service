jest.mock('../src/utils/logger', () => ({
  debug: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  warn: jest.fn()
}))
jest.mock('../src/services/account/geminiAccountService', () => ({}))
jest.mock('../src/services/account/geminiApiAccountService', () => ({}))
jest.mock('../src/services/relay/geminiRelayService', () => ({
  sendGeminiRequest: jest.fn(),
  getAvailableModels: jest.fn()
}))
jest.mock('../src/services/relay/antigravityRelayService', () => ({
  sendAntigravityRequest: jest.fn()
}))
jest.mock('../src/utils/sessionHelper', () => ({
  generateSessionHash: jest.fn()
}))
jest.mock('../src/services/scheduler/unifiedGeminiScheduler', () => ({}))
jest.mock('../src/services/apiKeyService', () => ({}))
jest.mock('../src/models/redis', () => ({}))
jest.mock('../src/utils/rateLimitHelper', () => ({
  updateRateLimitCounters: jest.fn()
}))
jest.mock('../src/utils/sseParser', () => ({
  parseSSELine: jest.fn()
}))
jest.mock('axios', () => jest.fn())
jest.mock('../src/utils/errorSanitizer', () => ({
  getSafeMessage: jest.fn((error) => error?.message)
}))
jest.mock('../src/utils/proxyHelper', () => ({}))
jest.mock('../src/utils/upstreamErrorHelper', () => ({}))
jest.mock('../src/utils/requestDetailHelper', () => ({
  createRequestDetailMeta: jest.fn()
}))
jest.mock('../src/utils/geminiApiErrorAdapter', () => ({
  buildGeminiApiClientError: jest.fn(),
  sanitizeGeminiApiStreamEvent: jest.fn()
}))
jest.mock('../src/utils/modelHelper', () => ({
  isModelRestricted: jest.fn(() => false)
}))

const { EventEmitter } = require('events')
const { abortOnClientDisconnect, createSSEHeartbeat } = require('../src/handlers/geminiHandlers')

// 模拟 Express 的 ServerResponse：支持 close 事件、writableEnded 状态与 SSE 写入
function createMockRes() {
  const res = new EventEmitter()
  res.writableEnded = false
  res.destroyed = false
  res.headers = {}
  res.writes = []
  res.setHeader = jest.fn((name, value) => {
    res.headers[name] = value
  })
  res.write = jest.fn((chunk) => {
    res.writes.push(chunk)
    return true
  })
  res.end = jest.fn(() => {
    res.writableEnded = true
  })
  return res
}

describe('abortOnClientDisconnect', () => {
  test('客户端提前断开时中止上游请求并执行清理', () => {
    const res = createMockRes()
    const abortController = new AbortController()
    const cleanup = jest.fn()

    const guard = abortOnClientDisconnect(res, abortController)
    guard.addCleanup(cleanup)

    res.emit('close')

    expect(abortController.signal.aborted).toBe(true)
    expect(cleanup).toHaveBeenCalledTimes(1)
  })

  test('响应正常结束后触发 close 不会中止上游请求', () => {
    const res = createMockRes()
    const abortController = new AbortController()
    const cleanup = jest.fn()

    const guard = abortOnClientDisconnect(res, abortController)
    guard.addCleanup(cleanup)

    // 模拟正常完成：先 res.end() 再触发 close
    res.end()
    res.emit('close')

    expect(abortController.signal.aborted).toBe(false)
    expect(cleanup).not.toHaveBeenCalled()
  })

  test('某个清理回调抛错不影响其他清理执行', () => {
    const res = createMockRes()
    const abortController = new AbortController()
    const cleanupAfterError = jest.fn()

    const guard = abortOnClientDisconnect(res, abortController)
    guard.addCleanup(() => {
      throw new Error('cleanup failed')
    })
    guard.addCleanup(cleanupAfterError)

    res.emit('close')

    expect(abortController.signal.aborted).toBe(true)
    expect(cleanupAfterError).toHaveBeenCalledTimes(1)
  })

  test('上游已中止时断开连接不重复 abort 但仍执行清理', () => {
    const res = createMockRes()
    const abortController = new AbortController()
    const cleanup = jest.fn()

    const guard = abortOnClientDisconnect(res, abortController)
    guard.addCleanup(cleanup)

    abortController.abort()
    res.emit('close')

    expect(abortController.signal.aborted).toBe(true)
    expect(cleanup).toHaveBeenCalledTimes(1)
  })
})

describe('createSSEHeartbeat', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  test('设置 SSE 响应头并在空闲超时后发送 keepalive', () => {
    const res = createMockRes()
    const heartbeat = createSSEHeartbeat(res)

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream')
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache')

    jest.advanceTimersByTime(15000)
    expect(res.write).toHaveBeenCalledWith('\n')

    heartbeat.stop()
  })

  test('touch 之后未超过间隔不发送 keepalive', () => {
    const res = createMockRes()
    const heartbeat = createSSEHeartbeat(res)

    jest.advanceTimersByTime(10000)
    heartbeat.touch()
    jest.advanceTimersByTime(5000)

    expect(res.write).not.toHaveBeenCalled()

    heartbeat.stop()
  })

  test('stop 之后不再发送任何 keepalive', () => {
    const res = createMockRes()
    const heartbeat = createSSEHeartbeat(res)

    heartbeat.stop()
    jest.advanceTimersByTime(60000)

    expect(res.write).not.toHaveBeenCalled()
  })

  test('客户端断开清理链中停止心跳后 timer 不再触发', () => {
    const res = createMockRes()
    const abortController = new AbortController()
    const heartbeat = createSSEHeartbeat(res)

    const guard = abortOnClientDisconnect(res, abortController)
    guard.addCleanup(() => heartbeat.stop())

    // 客户端断开：abort + 停止心跳
    res.emit('close')
    jest.advanceTimersByTime(60000)

    expect(abortController.signal.aborted).toBe(true)
    expect(res.write).not.toHaveBeenCalled()
  })
})
