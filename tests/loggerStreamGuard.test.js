describe('logger stream guard', () => {
  let logger

  beforeEach(() => {
    jest.resetModules()
    process.env.NODE_ENV = 'test'
    process.env.LOG_LEVEL = 'error'
    logger = require('../src/utils/logger')
  })

  afterEach(() => {
    logger?.close?.()
    delete process.env.LOG_LEVEL
  })

  test('classifies stream write-after-end errors as ignorable logger errors', () => {
    const messageError = new Error('write after end')
    const codeError = new Error('stream already ended')
    codeError.code = 'ERR_STREAM_WRITE_AFTER_END'
    const brokenPipeError = new Error('broken pipe')
    brokenPipeError.code = 'EPIPE'
    brokenPipeError.syscall = 'write'

    expect(logger.isIgnorableLoggerStreamError(messageError)).toBe(true)
    expect(logger.isIgnorableLoggerStreamError(codeError)).toBe(true)
    expect(logger.isIgnorableLoggerStreamError(brokenPipeError)).toBe(true)
  })

  test('does not classify generic write-after-end as a global broken pipe error', () => {
    const writeAfterEndError = new Error('write after end')
    writeAfterEndError.code = 'ERR_STREAM_WRITE_AFTER_END'

    expect(logger.isBrokenPipeError(writeAfterEndError)).toBe(false)
    expect(logger.isIgnorableLoggerStreamError(writeAfterEndError)).toBe(true)
  })

  test('does not throw when exception file transport writes after its stream ended', () => {
    const handlers = Array.from(logger.exceptions.handlers || [])
    const fileTransport = handlers
      .map((handler) => (Array.isArray(handler) ? handler[0] : handler))
      .find((transport) => transport?._basename === 'exceptions.log')

    expect(fileTransport).toBeTruthy()

    fileTransport._stream.end()

    expect(() => {
      fileTransport.log({ level: 'error', message: 'simulated exception write' }, jest.fn())
    }).not.toThrow()
  })

  test('does not throw when console transport stdout write fails after stream end', () => {
    const consoleTransport = logger.transports.find((transport) => transport?.name === 'console')
    const originalWrite = console._stdout?.write

    expect(consoleTransport).toBeTruthy()
    expect(originalWrite).toBeTruthy()

    console._stdout.write = () => {
      const error = new Error('write after end')
      error.code = 'ERR_STREAM_WRITE_AFTER_END'
      throw error
    }

    try {
      expect(() => {
        consoleTransport.log({ level: 'info', message: 'simulated console write' }, jest.fn())
      }).not.toThrow()
    } finally {
      console._stdout.write = originalWrite
    }
  })
})
