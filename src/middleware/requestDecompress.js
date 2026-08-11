const zlib = require('zlib')
const { Readable } = require('stream')
const { promisify } = require('util')

const logger = require('../utils/logger')

// body-parser 只认 identity/gzip/deflate，收到 zstd/br 会抛 415 并被 errorHandler 兜成 "Something went wrong"。
// Codex CLI 默认开启请求体 zstd 压缩（features.enable_request_compression），故在 body 解析前把这两种编码解开。
//
// 本中间件只做「解压 + 把明文字节塞回请求流」，绝不自己解析 body：解析一律交回下游 express.json()/
// urlencoded()。自己解析会另立一套协议——strict 模式（拒 "foo"/123）、charset 校验、content-type 类型门禁、
// verify 钩子、qs 的 extended 语义（a=1&a=2、x[y]=1）都会与未压缩请求分叉，且 body-parser 升级即再漂移。
// 故此处不设 req._body，让压缩与未压缩请求走完全同一条解析路径。
//
// 必须挂在 express.json() 之前、/payment/webhook 的 express.raw() 之后（webhook 靠挂载顺序拿到原始字节验签）。

const zstdDecompress =
  typeof zlib.zstdDecompress === 'function' ? promisify(zlib.zstdDecompress) : null
const brotliDecompress = promisify(zlib.brotliDecompress)

const DECOMPRESSORS = { zstd: zstdDecompress, br: brotliDecompress }

const maxBodyBytes = () => parseInt(process.env.REQUEST_MAX_SIZE_MB || '100', 10) * 1024 * 1024

// 读原始压缩字节，超限即弃字节并继续排空流。超限后不能 pause——残留字节会让同一 keep-alive
// 连接上的下一个请求被 RST（对齐 body-parser read.js 的 dump 语义：先读完请求再回错误）
const readCompressedBody = (req, maxBytes) =>
  new Promise((resolve, reject) => {
    const chunks = []
    let total = 0
    let tooLarge = false
    let settled = false
    const settle = (error, buffer) => {
      if (settled) {
        return
      }
      settled = true
      if (error) {
        reject(error)
      } else {
        resolve(buffer)
      }
    }

    req.on('data', (chunk) => {
      if (tooLarge) {
        return
      }
      total += chunk.length
      if (total > maxBytes) {
        tooLarge = true
        chunks.length = 0
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (tooLarge) {
        settle(Object.assign(new Error('compressed request body too large'), { tooLarge: true }))
        return
      }
      settle(null, Buffer.concat(chunks))
    })
    req.on('aborted', () => settle(new Error('request aborted while reading compressed body')))
    req.on('error', settle)
    req.resume()
  })

// 用解压后的明文字节替换 req 的可读流内部状态，使下游 body-parser 像读普通未压缩请求一样读到明文。
// 手法同 llysc server/src/main.ts：造一个已装载数据的 Readable，把其 _readableState 移植到 req 上。
const replaceRequestBodyStream = (req, buffer) => {
  const replacement = new Readable()
  replacement.push(buffer.length ? buffer : null)
  if (buffer.length) {
    replacement.push(null)
  }
  req._readableState = replacement._readableState
  req.read = replacement.read.bind(replacement)
  // body-parser 经 raw-body 读流，raw-body 只用 on/read/pause/resume 与 length 头，不碰 socket
  req.on = replacement.on.bind(replacement)
  req.once = replacement.once.bind(replacement)
  req.removeListener = replacement.removeListener.bind(replacement)
  req.resume = replacement.resume.bind(replacement)
  req.pause = replacement.pause.bind(replacement)
  req.pipe = replacement.pipe.bind(replacement)
}

const requestDecompress = async (req, res, next) => {
  const encoding = (req.headers['content-encoding'] || '').toLowerCase().trim()

  // gzip/deflate/identity 交给 body-parser 原生处理，不接管
  if (!Object.prototype.hasOwnProperty.call(DECOMPRESSORS, encoding)) {
    return next()
  }

  const decompress = DECOMPRESSORS[encoding]
  if (typeof decompress !== 'function') {
    logger.warn(
      `⚠️ Content-Encoding "${encoding}" unsupported by Node.js ${process.version} (zstd needs >= 22.15)`
    )
    return res.status(415).json({
      error: 'Unsupported Media Type',
      message: `Content-Encoding "${encoding}" is not supported by this server runtime`
    })
  }

  const maxBytes = maxBodyBytes()

  try {
    const compressed = await readCompressedBody(req, maxBytes)
    const decompressed = await decompress(compressed, { maxOutputLength: maxBytes })
    // 先改头再换流：content-encoding 留着会让 body-parser 再尝试 inflate 一次明文；
    // content-length 须改成明文长度，raw-body 按它校验读到的字节数（不改则 length 不符报 400）
    delete req.headers['content-encoding']
    req.headers['content-length'] = String(decompressed.length)
    replaceRequestBodyStream(req, decompressed)
    logger.debug(
      `📦 Decompressed ${encoding} request body: ${compressed.length} → ${decompressed.length} bytes (${req.method} ${req.path})`
    )
    return next()
  } catch (error) {
    if (error.tooLarge) {
      logger.security(`🚨 Compressed request body too large from ${req.ip}: ${encoding}`)
      return res.status(413).json({
        error: 'Payload Too Large',
        message: 'Request body size exceeds limit',
        limit: `${Math.round(maxBytes / 1024 / 1024)}MB`
      })
    }
    if (error.code === 'ERR_BUFFER_TOO_LARGE') {
      logger.security(`🚨 Decompressed request body too large from ${req.ip}: ${encoding}`)
      return res.status(413).json({
        error: 'Payload Too Large',
        message: 'Decompressed request body size exceeds limit',
        limit: `${Math.round(maxBytes / 1024 / 1024)}MB`
      })
    }
    console.error(error)
    logger.error(`💥 Failed to decompress ${encoding} request body:`, error)
    return res.status(400).json({
      error: 'Bad Request',
      message: `Failed to decompress ${encoding} request body`
    })
  }
}

module.exports = {
  requestDecompress
}
