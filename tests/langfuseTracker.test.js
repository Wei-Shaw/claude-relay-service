const path = require('path')

const TRACKER_PATH = path.resolve(__dirname, '../src/utils/langfuseTracker')
const CONFIG_PATH = path.resolve(__dirname, '../config/config')
const LOGGER_PATH = path.resolve(__dirname, '../src/utils/logger')

const generationMock = jest.fn()
const traceMock = jest.fn(() => ({ generation: generationMock }))
const flushAsyncMock = jest.fn().mockResolvedValue(undefined)

class FakeLangfuse {
  constructor(opts) {
    FakeLangfuse.lastOptions = opts
  }

  trace(...args) {
    return traceMock(...args)
  }

  async flushAsync() {
    return flushAsyncMock()
  }
}

function loadTracker(overrides = {}) {
  jest.resetModules()
  generationMock.mockReset()
  traceMock.mockClear()
  flushAsyncMock.mockClear()

  jest.doMock(LOGGER_PATH, () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    success: jest.fn(),
    api: jest.fn(),
    database: jest.fn(),
    performance: jest.fn()
  }))

  jest.doMock(CONFIG_PATH, () => ({
    langfuse: {
      enabled: true,
      host: 'https://example.langfuse.test',
      publicKey: 'pk_test',
      secretKey: 'sk_test',
      captureBody: true,
      flushAt: 1,
      flushInterval: 1000,
      ...overrides
    },
    proxy: {}
  }))

  jest.doMock('langfuse', () => ({ Langfuse: FakeLangfuse }), { virtual: true })

  // eslint-disable-next-line global-require
  return require(TRACKER_PATH)
}

describe('langfuseTracker', () => {
  afterEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
  })

  test('does nothing when disabled', () => {
    const tracker = loadTracker({ enabled: false })
    tracker.captureGeneration({
      apiKeyId: 'k1',
      model: 'gpt-4',
      input: { messages: [] },
      output: 'hi'
    })
    expect(traceMock).not.toHaveBeenCalled()
    expect(generationMock).not.toHaveBeenCalled()
  })

  test('does nothing when keys missing', () => {
    const tracker = loadTracker({ publicKey: '', secretKey: '' })
    tracker.captureGeneration({
      apiKeyId: 'k1',
      model: 'gpt-4',
      input: { messages: [] },
      output: 'hi'
    })
    expect(traceMock).not.toHaveBeenCalled()
  })

  test('creates trace + generation with full input/output when enabled', () => {
    const tracker = loadTracker()
    tracker.captureGeneration({
      apiKeyId: 'apikey-1',
      apiKeyName: 'my-key',
      accountId: 'acc-1',
      accountType: 'claude-official',
      model: 'claude-sonnet-4',
      input: { messages: [{ role: 'user', content: 'hello' }] },
      output: 'hi back',
      usage: {
        inputTokens: 10,
        outputTokens: 5,
        totalTokens: 15,
        cacheCreateTokens: 0,
        cacheReadTokens: 0
      },
      costs: { realCost: 0.01, ratedCost: 0.012 },
      sessionId: 'sess-1',
      requestId: 'req-1',
      stream: true
    })

    expect(traceMock).toHaveBeenCalledTimes(1)
    const traceArgs = traceMock.mock.calls[0][0]
    expect(traceArgs.sessionId).toBe('sess-1')
    expect(traceArgs.userId).toBe('apikey-1')
    expect(traceArgs.metadata.accountType).toBe('claude-official')
    expect(traceArgs.metadata.realCost).toBe(0.01)
    expect(traceArgs.tags).toEqual(expect.arrayContaining(['claude-official', 'stream']))

    expect(generationMock).toHaveBeenCalledTimes(1)
    const genArgs = generationMock.mock.calls[0][0]
    expect(genArgs.model).toBe('claude-sonnet-4')
    expect(genArgs.input).toEqual({ messages: [{ role: 'user', content: 'hello' }] })
    expect(genArgs.output).toBe('hi back')
    expect(genArgs.usage.input).toBe(10)
    expect(genArgs.usage.output).toBe(5)
    expect(genArgs.usage.totalCost).toBe(0.012)
  })

  test('captureBody=false strips input/output', () => {
    const tracker = loadTracker({ captureBody: false })
    tracker.captureGeneration({
      apiKeyId: 'k1',
      model: 'gpt-4',
      input: { messages: [{ role: 'user', content: 'secret' }] },
      output: 'reply',
      usage: { inputTokens: 1, outputTokens: 1 }
    })
    expect(generationMock).toHaveBeenCalledTimes(1)
    const genArgs = generationMock.mock.calls[0][0]
    expect(genArgs.input).toBeUndefined()
    expect(genArgs.output).toBeUndefined()
    expect(genArgs.metadata.bodyCaptured).toBe(false)
  })

  test('marks generation as ERROR when error supplied', () => {
    const tracker = loadTracker()
    tracker.captureGeneration({
      apiKeyId: 'k1',
      model: 'gpt-4',
      error: new Error('upstream blew up')
    })
    expect(generationMock).toHaveBeenCalledTimes(1)
    const genArgs = generationMock.mock.calls[0][0]
    expect(genArgs.level).toBe('ERROR')
    expect(genArgs.statusMessage).toContain('upstream blew up')
  })

  test('does not throw when underlying client throws', () => {
    const tracker = loadTracker()
    traceMock.mockImplementationOnce(() => {
      throw new Error('boom')
    })
    expect(() =>
      tracker.captureGeneration({
        apiKeyId: 'k1',
        model: 'gpt-4'
      })
    ).not.toThrow()
  })

  test('flush invokes underlying client flush without throwing on missing client', async () => {
    const tracker = loadTracker()
    tracker.captureGeneration({ apiKeyId: 'k1', model: 'gpt-4' })
    await tracker.flush()
    expect(flushAsyncMock).toHaveBeenCalled()
  })

  test('flush is no-op when client never initialized', async () => {
    const tracker = loadTracker({ enabled: false })
    await expect(tracker.flush()).resolves.toBeUndefined()
    expect(flushAsyncMock).not.toHaveBeenCalled()
  })
})
