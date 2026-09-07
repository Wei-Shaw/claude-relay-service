/**
 * Codex / OpenAI SSE 降载缓冲转发器
 *
 * CRS 原先把上游 SSE chunk 立刻 `res.write()` 出去。上游降载的真实序列是
 * HTTP 200 之后立刻推 `event: error`（code=server_is_overloaded / slow_down）
 * 再以 `event: response.failed` 收尾 —— 只要 error 帧被写出去，Codex 就地终止，
 * 重试机会随之消失。
 *
 * 因此在「客户端尚未收到真实输出」之前先把事件块攒在内存里：
 *   - 期间命中降载 → 丢弃缓冲、断开上游，交给调用方在同账号上重试；
 *   - 出现真实输出 → 一次性下发缓冲，之后恢复逐块透传；
 *   - 缓冲超上限 → 放弃重试，下发缓冲并转入透传（避免大 metadata preamble 撑爆内存）。
 *
 * 流中途才降载（已经有真实输出）时无法再重试，只能把错误码改写成
 * server_error 后转发，让 Codex 走内置退避而不是打印
 * "Selected model is at capacity. Please try a different model." 后退出。
 *
 * @module openaiCapacityShedStream
 */

const { StringDecoder } = require('string_decoder')
const {
  DEFAULT_SETTINGS,
  isCapacityShedEvent,
  parseSSEBlock,
  rewriteCapacityShedSSEBlock,
  streamDataStartsClientOutput
} = require('./openaiCapacityShed')

const SSE_BLOCK_SEPARATOR = /\r?\n\r?\n/

/**
 * 缓冲式转发上游 SSE 流。
 *
 * 返回的 promise 在以下三种情形 resolve：
 *   - `{ outcome: 'shed' }`      检测到降载且尚未向客户端写出任何字节，可安全重试。
 *                               上游流已被销毁，`res` 未被写入、响应头未提交。
 *   - `{ outcome: 'completed' }` 流正常结束，缓冲已全部下发。**不会**调用 res.end()，
 *                               由调用方在记录用量后收尾。
 *   - `{ outcome: 'error', error }` 上游流报错。`outputStarted` 指示是否已写出内容。
 *
 * @param {Object} options
 * @param {Object} options.stream 上游可读流（axios responseType: 'stream'）
 * @param {Object} options.res Express 响应对象
 * @param {Function} [options.onEventText] 每收到一段解码后的文本时回调（用于 usage 统计）
 * @param {Function} [options.commitHeaders] 首次写出前调用一次，用于惰性提交响应头
 * @param {boolean} [options.retryEnabled=true] 是否允许因降载中断并重试
 * @param {number} [options.bufferLimitBytes] 缓冲字节上限，超出后放弃重试
 * @param {number} [options.preOutputBufferMs] 缓冲时间上限，超时后放弃重试
 * @param {Function} [options.onShedRewrite] 发生错误码改写时回调
 * @returns {Promise<{outcome: string, outputStarted: boolean, error?: Error, shedPayload?: Object}>}
 */
function pipeWithCapacityShedBuffer({
  stream,
  res,
  onEventText = null,
  commitHeaders = null,
  retryEnabled = true,
  bufferLimitBytes = DEFAULT_SETTINGS.bufferLimitBytes,
  preOutputBufferMs = DEFAULT_SETTINGS.preOutputBufferMs,
  onShedRewrite = null
}) {
  return new Promise((resolve) => {
    const decoder = new StringDecoder('utf8')
    let pending = ''
    let outputStarted = false
    let retryAllowed = retryEnabled
    let headersCommitted = false
    let settled = false
    const buffered = []
    let bufferedBytes = 0
    let bufferTimer = null

    const clearBufferTimer = () => {
      if (bufferTimer) {
        clearTimeout(bufferTimer)
        bufferTimer = null
      }
    }

    const settle = (result) => {
      if (settled) {
        return
      }
      settled = true
      clearBufferTimer()
      resolve({ outputStarted, ...result })
    }

    const writeOut = (text) => {
      if (!text) {
        return
      }
      if (!headersCommitted) {
        headersCommitted = true
        if (typeof commitHeaders === 'function') {
          commitHeaders()
        }
      }
      if (!res.destroyed && res.writable) {
        res.write(text)
      }
    }

    const flushBuffer = () => {
      clearBufferTimer()
      if (buffered.length === 0) {
        return
      }
      const text = buffered.join('')
      buffered.length = 0
      bufferedBytes = 0
      writeOut(text)
    }

    // 缓冲期间对客户端一言不发有上限：到点就放弃重试、把 preamble 发出去
    const armBufferTimer = () => {
      if (bufferTimer || !(preOutputBufferMs > 0)) {
        return
      }
      bufferTimer = setTimeout(() => {
        bufferTimer = null
        if (settled || outputStarted) {
          return
        }
        retryAllowed = false
        outputStarted = true
        flushBuffer()
      }, preOutputBufferMs)
      if (typeof bufferTimer.unref === 'function') {
        bufferTimer.unref()
      }
    }

    const bufferBlock = (block) => {
      buffered.push(block)
      bufferedBytes += Buffer.byteLength(block, 'utf8')
      armBufferTimer()
    }

    // 返回 true 表示已判定为可重试的降载，调用方应停止继续处理
    const handleBlock = (block) => {
      const parsed = parseSSEBlock(block)

      if (parsed.data && isCapacityShedEvent(parsed.data)) {
        if (!outputStarted && retryAllowed) {
          buffered.length = 0
          bufferedBytes = 0
          settle({ outcome: 'shed', shedPayload: parsed.data })
          return true
        }
        // 已经有真实输出或已放弃重试：改写错误码后转发，保留原始消息
        const rewritten = rewriteCapacityShedSSEBlock(block)
        if (rewritten.changed && typeof onShedRewrite === 'function') {
          onShedRewrite({ outputStarted, payload: parsed.data })
        }
        if (!outputStarted) {
          outputStarted = true
          flushBuffer()
        }
        writeOut(rewritten.block)
        return false
      }

      if (outputStarted) {
        writeOut(block)
        return false
      }

      // 注释行 / keepalive（`: ping`）没有 data 字段，不构成客户端输出
      const startsOutput =
        parsed.dataLines.length > 0 &&
        streamDataStartsClientOutput(parsed.isDone ? null : parsed.data, parsed.eventType)

      if (startsOutput) {
        outputStarted = true
        flushBuffer()
        writeOut(block)
        return false
      }

      bufferBlock(block)
      if (bufferedBytes > bufferLimitBytes) {
        // preamble 已经很大却仍未出现真实输出：放弃重试，转入透传
        retryAllowed = false
        outputStarted = true
        flushBuffer()
      }
      return false
    }

    const consume = (text, { final = false } = {}) => {
      if (text) {
        pending += text
        if (typeof onEventText === 'function') {
          onEventText(text)
        }
      }

      for (;;) {
        const match = SSE_BLOCK_SEPARATOR.exec(pending)
        if (!match) {
          break
        }
        const end = match.index + match[0].length
        const block = pending.slice(0, end)
        pending = pending.slice(end)
        if (handleBlock(block)) {
          return true
        }
      }

      if (final && pending) {
        const tail = pending
        pending = ''
        if (tail.trim()) {
          if (handleBlock(tail)) {
            return true
          }
        } else {
          // 纯空白尾巴：直接透传，保持字节等价
          if (outputStarted) {
            writeOut(tail)
          } else {
            bufferBlock(tail)
          }
        }
      }

      return false
    }

    const destroyUpstream = () => {
      try {
        stream.destroy()
      } catch (_) {
        // ignore
      }
    }

    stream.on('data', (chunk) => {
      if (settled) {
        return
      }
      try {
        if (consume(decoder.write(chunk))) {
          destroyUpstream()
        }
      } catch (error) {
        flushBuffer()
        settle({ outcome: 'error', error })
        destroyUpstream()
      }
    })

    stream.on('end', () => {
      if (settled) {
        return
      }
      try {
        if (consume(decoder.end(), { final: true })) {
          destroyUpstream()
          return
        }
      } catch (error) {
        flushBuffer()
        settle({ outcome: 'error', error })
        return
      }
      // 流结束时仍无真实输出（例如只有 preamble）：把缓冲原样下发
      if (!outputStarted) {
        outputStarted = true
        flushBuffer()
      }
      if (!headersCommitted) {
        headersCommitted = true
        if (typeof commitHeaders === 'function') {
          commitHeaders()
        }
      }
      settle({ outcome: 'completed' })
    })

    stream.on('error', (error) => {
      if (settled) {
        return
      }
      if (outputStarted) {
        flushBuffer()
      }
      settle({ outcome: 'error', error })
    })
  })
}

/**
 * 读取上游响应体用于降载判定。
 *
 * 流式请求（responseType: 'stream'）下错误响应也是一个流，必须先读空才能判定；
 * 读空后 `drained` 为 true，调用方需要用 `rawBody` 而不是再去 pipe。
 *
 * @param {Object} upstream axios 响应
 * @param {boolean} isStream 请求是否以流方式发起
 * @param {number} [timeoutMs=5000] 读空超时保护
 * @returns {Promise<{payload: Object|null, rawBody: string, drained: boolean}>}
 */
async function readUpstreamBody(upstream, isStream, timeoutMs = 5000) {
  const data = upstream?.data

  if (isStream && data && typeof data.on === 'function') {
    const chunks = []
    await new Promise((resolve) => {
      let done = false
      const finish = () => {
        if (!done) {
          done = true
          resolve()
        }
      }
      data.on('data', (chunk) => chunks.push(chunk))
      data.on('end', finish)
      data.on('error', finish)
      const timer = setTimeout(finish, timeoutMs)
      if (typeof timer.unref === 'function') {
        timer.unref()
      }
    })
    const rawBody = Buffer.concat(chunks).toString('utf8')
    return { payload: parseErrorBody(rawBody), rawBody, drained: true }
  }

  if (isPlainObject(data)) {
    return { payload: data, rawBody: '', drained: false }
  }
  const rawBody = typeof data === 'string' ? data : ''
  return { payload: parseErrorBody(rawBody), rawBody, drained: false }
}

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    typeof value.pipe !== 'function'
  )
}

/**
 * 错误响应体可能是 JSON，也可能是一段 SSE（上游先 200 再降载的场景）
 */
function parseErrorBody(rawBody) {
  const text = (rawBody || '').trim()
  if (!text) {
    return null
  }
  try {
    const parsed = JSON.parse(text)
    if (isPlainObject(parsed)) {
      return parsed
    }
  } catch (_) {
    // 继续按 SSE 解析
  }
  if (!text.includes('data:')) {
    return null
  }
  for (const block of text.split(SSE_BLOCK_SEPARATOR)) {
    const parsed = parseSSEBlock(block)
    if (parsed.data) {
      return parsed.data
    }
  }
  return null
}

/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
function delay(ms) {
  if (!(ms > 0)) {
    return Promise.resolve()
  }
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms)
    if (typeof timer.unref === 'function') {
      timer.unref()
    }
  })
}

module.exports = {
  delay,
  pipeWithCapacityShedBuffer,
  readUpstreamBody
}
