/**
 * Tests for safeStringify fixes:
 *
 * Fix 1: Truncation now applies to `_` prefixed fields (only skips _truncated/_totalChars)
 * Fix 2: Replacer filters ClientRequest and Writable types
 */

const fs = require('fs')
const path = require('path')
const http = require('http')

// Extract safeStringify from logger.js source (it's not exported)
function extractSafeStringify() {
  const source = fs.readFileSync(path.join(__dirname, '../src/utils/logger.js'), 'utf-8')
  const startMarker = '// 安全的 JSON 序列化函数，处理循环引用和特殊字符'
  const endMarker = '\n// 控制台不显示的 metadata 字段'
  const startIdx = source.indexOf(startMarker)
  const endIdx = source.indexOf(endMarker)
  if (startIdx === -1 || endIdx === -1) {
    throw new Error('Cannot extract safeStringify from logger.js')
  }
  const fnSource = source.substring(startIdx, endIdx)
  const wrapped = `${fnSource}\nreturn safeStringify;`
  return new Function(wrapped)()
}

let safeStringify

beforeAll(() => {
  safeStringify = extractSafeStringify()
})

describe('Fix 1: truncation applies to _ prefixed fields', () => {
  test('_ prefixed fields are now truncated when result > 50KB', () => {
    const bigData = 'A'.repeat(200000)
    const obj = {
      _writableState: bigData,
      _header: bigData,
      _contentLength: bigData
    }
    const result = safeStringify(obj)
    const parsed = JSON.parse(result)

    // _ prefixed fields are now truncated (no longer bypassed)
    expect(parsed._truncated).toBe(true)
    expect(result.length).toBeLessThan(100000)
  })

  test('_ prefixed and non-_ prefixed fields are truncated equally', () => {
    const bigData = 'C'.repeat(200000)

    const underscoreObj = {
      _field1: bigData,
      _field2: bigData,
      _field3: bigData
    }
    const underscoreResult = safeStringify(underscoreObj)

    const normalObj = {
      field1: bigData,
      field2: bigData,
      field3: bigData
    }
    const normalResult = safeStringify(normalObj)

    // Both should now be similar size (ratio close to 1)
    const ratio = underscoreResult.length / normalResult.length
    expect(ratio).toBeLessThan(2)
    expect(ratio).toBeGreaterThan(0.5)
  })

  test('_truncated and _totalChars metadata fields are preserved', () => {
    const bigData = 'D'.repeat(200000)
    const obj = { _bigField: bigData }
    const result = safeStringify(obj)
    const parsed = JSON.parse(result)

    // safeStringify's own metadata fields are not truncated
    expect(parsed._truncated).toBe(true)
    expect(typeof parsed._totalChars).toBe('number')
    expect(parsed._totalChars).toBeGreaterThan(50000)
  })

  test('non-_ prefixed fields still truncated correctly', () => {
    const bigData = 'B'.repeat(200000)
    const obj = {
      writableState: bigData,
      header: bigData,
      contentLength: bigData
    }
    const result = safeStringify(obj)
    const parsed = JSON.parse(result)

    expect(parsed._truncated).toBe(true)
    expect(parsed.writableState.length).toBeLessThanOrEqual(10100)
    expect(result.length).toBeLessThan(100000)
  })
})

describe('Fix 2: replacer filters ClientRequest and Writable', () => {
  test('ClientRequest is now filtered', () => {
    const req = http.request({ hostname: '127.0.0.1', port: 1, method: 'GET' })
    req.on('error', () => {})
    req.destroy()

    const result = safeStringify({ req })
    expect(result).toContain('[ClientRequest Object]')
  })

  test('Socket is still filtered', () => {
    const net = require('net')
    const socket = new net.Socket()
    const result = safeStringify({ sock: socket })
    expect(result).toContain('[Socket Object]')
    socket.destroy()
  })

  test('filter list includes ClientRequest and Writable', () => {
    const source = fs.readFileSync(path.join(__dirname, '../src/utils/logger.js'), 'utf-8')
    for (const type of ['ClientRequest', 'Writable']) {
      expect(source).toContain(`'${type}'`)
    }
  })
})

describe('combined: simulated axios ETIMEDOUT error is now safe', () => {
  test('mock axios error request field is truncated to safe size', () => {
    const largeRequestBody = JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8096,
      messages: Array(50).fill({
        role: 'user',
        content: 'x'.repeat(10000)
      })
    })

    // Simulate ClientRequest-like structure (plain object, not real ClientRequest)
    const mockRequest = {
      _writableState: { objectMode: false, highWaterMark: 16384 },
      _events: { error: '[Function]', close: '[Function]' },
      _header: `POST /v1/messages HTTP/1.1\r\nHost: api.anthropic.com\r\n`,
      _requestBodyBuffers: [
        { data: Array.from(Buffer.from(largeRequestBody)), encoding: 'buffer' }
      ],
      _options: { protocol: 'https:', hostname: 'api.anthropic.com', path: '/v1/messages' },
      _ended: false,
      _contentLength: largeRequestBody.length
    }

    const result = safeStringify(mockRequest)

    // With fix: truncation now applies to _ prefixed fields
    expect(result.length).toBeLessThan(100000)
    const parsed = JSON.parse(result)
    expect(parsed._truncated).toBe(true)
  })

  test('real http.ClientRequest is filtered by replacer', () => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: 1,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    })
    req.on('error', () => {})
    req.write(JSON.stringify({ test: 'data'.repeat(1000) }))
    req.destroy()

    const result = safeStringify(req)

    // Fix 2: ClientRequest is now filtered at replacer level
    expect(result).toContain('[ClientRequest Object]')
    // Output is tiny placeholder, not MB-level serialization
    expect(result.length).toBeLessThan(200)
  })

  test('Buffer byte array in _ prefixed field is now truncated', () => {
    const bodySize = 100000
    const body = Buffer.alloc(bodySize, 0x41)
    const bufferArray = Array.from(body)

    const obj = {
      _requestBodyBuffers: [{ data: bufferArray, encoding: 'buffer' }]
    }

    const result = safeStringify(obj)

    // With fix: result is truncated even though field starts with _
    expect(result.length).toBeLessThan(100000)
    const parsed = JSON.parse(result)
    expect(parsed._truncated).toBe(true)
  })
})
