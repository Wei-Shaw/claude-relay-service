const winston = require('winston')
const DailyRotateFile = require('winston-daily-rotate-file')
const config = require('../../config/config')
const { formatDateWithTimezone } = require('../utils/dateHelper')
const path = require('path')
const fs = require('fs')
const os = require('os')
const crypto = require('crypto')

// 安全的 JSON 序列化函数，处理循环引用和特殊字符
const safeStringify = (obj, maxDepth = Infinity) => {
  const seen = new WeakSet()

  const replacer = (key, value, depth = 0) => {
    if (depth > maxDepth) {
      return '[Max Depth Reached]'
    }

    // 处理字符串值，清理可能导致JSON解析错误的特殊字符
    if (typeof value === 'string') {
      try {
        // 移除或转义可能导致JSON解析错误的字符
        const cleanValue = value
          // eslint-disable-next-line no-control-regex
          .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '') // 移除控制字符
          .replace(/[\uD800-\uDFFF]/g, '') // 移除孤立的代理对字符
          // eslint-disable-next-line no-control-regex
          .replace(/\u0000/g, '') // 移除NUL字节

        return cleanValue
      } catch (error) {
        return '[Invalid String Data]'
      }
    }

    if (value !== null && typeof value === 'object') {
      if (seen.has(value)) {
        return '[Circular Reference]'
      }
      seen.add(value)

      // 过滤掉常见的循环引用对象
      if (value.constructor) {
        const constructorName = value.constructor.name
        if (
          ['Socket', 'TLSSocket', 'HTTPParser', 'IncomingMessage', 'ServerResponse'].includes(
            constructorName
          )
        ) {
          return `[${constructorName} Object]`
        }
      }

      // 递归处理对象属性
      if (Array.isArray(value)) {
        return value.map((item, index) => replacer(index, item, depth + 1))
      } else {
        const result = {}
        for (const [k, v] of Object.entries(value)) {
          // 确保键名也是安全的
          // eslint-disable-next-line no-control-regex
          const safeKey = typeof k === 'string' ? k.replace(/[\u0000-\u001F\u007F]/g, '') : k
          result[safeKey] = replacer(safeKey, v, depth + 1)
        }
        return result
      }
    }

    return value
  }

  try {
    const processed = replacer('', obj)
    const result = JSON.stringify(processed)
    // 体积保护: 超过 50KB 时对大字段做截断，保留顶层结构
    if (result.length > 50000 && processed && typeof processed === 'object') {
      const truncated = { ...processed, _truncated: true, _totalChars: result.length }
      // 第一轮: 截断单个大字段
      for (const [k, v] of Object.entries(truncated)) {
        if (k.startsWith('_')) {
          continue
        }
        const fieldStr = typeof v === 'string' ? v : JSON.stringify(v)
        if (fieldStr && fieldStr.length > 10000) {
          truncated[k] = `${fieldStr.substring(0, 10000)}...[truncated]`
        }
      }
      // 第二轮: 如果总长度仍超 50KB，逐字段缩减到 2KB
      let secondResult = JSON.stringify(truncated)
      if (secondResult.length > 50000) {
        for (const [k, v] of Object.entries(truncated)) {
          if (k.startsWith('_')) {
            continue
          }
          const fieldStr = typeof v === 'string' ? v : JSON.stringify(v)
          if (fieldStr && fieldStr.length > 2000) {
            truncated[k] = `${fieldStr.substring(0, 2000)}...[truncated]`
          }
        }
        secondResult = JSON.stringify(truncated)
      }
      return secondResult
    }
    return result
  } catch (error) {
    // 如果JSON.stringify仍然失败，使用更保守的方法
    try {
      return JSON.stringify({
        error: 'Failed to serialize object',
        message: error.message,
        type: typeof obj,
        keys: obj && typeof obj === 'object' ? Object.keys(obj) : undefined
      })
    } catch (finalError) {
      return '{"error":"Critical serialization failure","message":"Unable to serialize any data"}'
    }
  }
}

// 控制台不显示的 metadata 字段（已在 message 中或低价值）
const CONSOLE_SKIP_KEYS = new Set(['type', 'level', 'message', 'timestamp', 'stack'])

// 控制台格式: 树形展示 metadata
const createConsoleFormat = () =>
  winston.format.combine(
    winston.format.timestamp({ format: () => formatDateWithTimezone(new Date(), false) }),
    winston.format.errors({ stack: true }),
    winston.format.colorize(),
    winston.format.printf(({ level: _level, message, timestamp, stack, ...rest }) => {
      // 时间戳只取时分秒
      const shortTime = timestamp ? timestamp.split(' ').pop() : ''

      let logMessage = `${shortTime} ${message}`

      // 收集要显示的 metadata
      const entries = Object.entries(rest).filter(([k]) => !CONSOLE_SKIP_KEYS.has(k))

      if (entries.length > 0) {
        const indent = ' '.repeat(shortTime.length + 1)
        entries.forEach(([key, value], i) => {
          const isLast = i === entries.length - 1
          const branch = isLast ? '└─' : '├─'
          const displayValue =
            value !== null && typeof value === 'object' ? safeStringify(value) : String(value)
          logMessage += `\n${indent}${branch} ${key}: ${displayValue}`
        })
      }

      if (stack) {
        logMessage += `\n${stack}`
      }
      return logMessage
    })
  )

// 文件格式: NDJSON（完整结构化数据）
const createFileFormat = () =>
  winston.format.combine(
    winston.format.timestamp({ format: () => formatDateWithTimezone(new Date(), false) }),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ level, message, timestamp, stack, ...rest }) => {
      const entry = { ts: timestamp, lvl: level, msg: message }
      // 合并所有 metadata
      for (const [k, v] of Object.entries(rest)) {
        if (k !== 'level' && k !== 'message' && k !== 'timestamp' && k !== 'stack') {
          entry[k] = v
        }
      }
      if (stack) {
        entry.stack = stack
      }
      return safeStringify(entry)
    })
  )

const fileFormat = createFileFormat()
const consoleFormat = createConsoleFormat()
const isTestEnv = process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID

// 📁 确保日志目录存在并设置权限
if (!fs.existsSync(config.logging.dirname)) {
  fs.mkdirSync(config.logging.dirname, { recursive: true, mode: 0o755 })
}

// === 跨平台日志审计自愈(登记: src/bootstrap/registry.js logger_audit_selfheal) ===
// 根因: file-stream-rotator 读旧审计文件后沿用其中 auditLog 绝对路径写回(setAuditLog/writeAuditLog),
// 旧日志裁剪只认 audit.files 记账(addLogToAudit), 且 removeFile 要求条目 hash 与 name+date 重算一致才删。
// 同一 logs 目录被不同绝对路径视角访问(Windows D:\、WSL /mnt/d、Docker /app/logs 交替)时:
// 1) 旧视角 auditLog 路径在 POSIX 下整串成为 cwd 里的字面文件名, 产生畸形审计文件
// 2) 记账路径对不上导致旧日志脱离 maxFiles 裁剪, 孤儿 .log/.gz 无限堆积
// 处理: 记账迁移到当前视角 + 孤儿日志收编回记账 + 超额最老孤儿按库裁剪同等语义清除 + 清理 cwd 畸形残留。
// 运行期日志删除仍走库自身裁剪链路(removeFile 删 .log + logRemoved 事件删 .gz); heal 仅对启动时的超额
// 孤儿执行同等裁剪——库在 transport 构造期同步执行的裁剪, 其 logRemoved 事件发射早于 winston 挂载监听
// (daily-rotate-file.js 先 getStream 后 on('logRemoved')), .gz 删除丢失后下次启动又被收编, 永不收敛

// 库同款条目 hash 公式(FileStreamRotator removeFile 按此校验, 不一致则拒删)
const auditEntryHash = (hashType, name, date) =>
  crypto.createHash(hashType).update(`${name}LOG_FILE${date}`).digest('hex')

const healAuditFile = (auditFile, filename) => {
  const logDirname = config.logging.dirname
  let audit = null
  if (fs.existsSync(auditFile)) {
    try {
      audit = JSON.parse(fs.readFileSync(auditFile, 'utf-8'))
    } catch (error) {
      console.error(`[logger] 审计文件损坏, 删除后按磁盘现状重建: ${auditFile}`, error)
      try {
        fs.unlinkSync(auditFile)
      } catch (unlinkError) {
        console.error('[logger] 删除损坏审计文件失败:', unlinkError)
      }
    }
  }

  const hashType = audit?.hashType || 'sha256'
  let files = Array.isArray(audit?.files) ? audit.files : []
  let changed = false

  // 审计指针错位(另一视角进程写的): 修正为当前路径并触发写回
  if (audit && audit.auditLog !== auditFile) {
    changed = true
    console.log(`[logger] 审计记账路径错位, 已迁移到当前视角: ${audit.auditLog} -> ${auditFile}`)
  }

  // 条目规范化: 旧 bug 会让混合视角条目并存于同一清单(实例: 同一文件以 D:\ 与 /mnt/d 各记一条;
  // 且 auditLog 与当前一致时也可能混入他视角条目, 故不以指针比对为开关, 而是无条件逐条规范化)。
  // 统一重写到当前视角并按逻辑文件名折叠去重, date 取最近一次记账——防止重复计数虚增 files.length
  // 导致超额裁剪误删真实日志; hash 用新 name 重算(removeFile 按其校验), 丢弃磁盘上已不存在的条目
  const byName = new Map()
  for (const entry of files) {
    const base = String(entry.name).split(/[\\/]/).pop()
    if (!base) {
      continue
    }
    const name = path.join(logDirname, base)
    const prev = byName.get(name)
    if (prev && entry.date <= prev.date) {
      continue
    }
    byName.set(name, { ...entry, name, hash: auditEntryHash(hashType, name, entry.date) })
  }
  const normalized = [...byName.values()].filter(
    (entry) => fs.existsSync(entry.name) || fs.existsSync(`${entry.name}.gz`)
  )
  if (
    normalized.length !== files.length ||
    normalized.some((entry, index) => entry.name !== files[index].name)
  ) {
    changed = true
  }
  files = normalized

  // 孤儿收编: 磁盘上匹配本轮转器命名模式但不在记账里的日志(含 .gz), 补录进记账参与 maxFiles 留存管理
  const escaped = filename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const namePattern = new RegExp(
    `^${escaped.replace('%DATE%', '\\d{4}-\\d{2}-\\d{2}')}(\\.\\d+)?(\\.gz)?$`
  )
  const knownNames = new Set(files.map((entry) => entry.name))
  let adopted = 0
  for (const item of fs.readdirSync(logDirname)) {
    if (!namePattern.test(item)) {
      continue
    }
    // .log 与其归档 .log.gz 共用同一逻辑名(库记账记 .log, 裁剪时经 logRemoved 事件连带删 .gz)
    const logicalName = path.join(logDirname, item.replace(/\.gz$/, ''))
    if (knownNames.has(logicalName)) {
      continue
    }
    knownNames.add(logicalName)
    const mtime = Math.floor(fs.statSync(path.join(logDirname, item)).mtimeMs)
    files.push({
      date: mtime,
      name: logicalName,
      hash: auditEntryHash(hashType, logicalName, mtime)
    })
    adopted++
  }
  if (adopted > 0) {
    changed = true
    console.log(`[logger] 已收编 ${adopted} 个脱离记账的日志文件: ${path.basename(auditFile)}`)
  }

  if (changed) {
    // files 顺序即裁剪顺序(splice 保留末尾 N 个), 按时间升序使最旧的先被裁
    files.sort((a, b) => a.date - b.date)

    // 超额孤儿同步裁剪(仅数量模式, 本项目 LOG_MAX_FILES 恒为数量): 见顶部说明, 启动期库裁剪丢 logRemoved
    // 事件导致 .gz 删不掉, 超额部分在此按库 removeFile+logRemoved 同等语义(.log 与 .gz 一并)删除。
    // 当天文件即将由库在启动时 push 进记账, 尚不在册时给它留一个名额(maxFiles=1 时名额为 0、历史全清,
    // 当天文件占唯一名额, 这正是 maxFiles=1 的语义; 强行保底 1 会让启动 push 再触发一次丢事件的裁剪,
    // 稳态恒滞留一个 .gz 孤儿永不收敛); 当天文件名与库行为一致按本地时区生成(file-stream-rotator 用 moment)
    if (!audit?.keep?.days) {
      const now = new Date()
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
        now.getDate()
      ).padStart(2, '0')}`
      const todayName = path.join(logDirname, filename.replace('%DATE%', today))
      const limit = knownNames.has(todayName)
        ? config.logging.maxFiles
        : config.logging.maxFiles - 1
      let evictedCount = 0
      while (files.length > limit) {
        const evicted = files.shift()
        for (const target of [evicted.name, `${evicted.name}.gz`]) {
          try {
            if (fs.existsSync(target)) {
              fs.unlinkSync(target)
            }
          } catch (error) {
            console.error(`[logger] 裁剪超额日志失败: ${target}`, error)
          }
        }
        evictedCount++
      }
      if (evictedCount > 0) {
        console.log(
          `[logger] 已按 maxFiles=${config.logging.maxFiles} 裁剪 ${evictedCount} 个超额历史日志: ${path.basename(auditFile)}`
        )
      }
    }

    fs.writeFileSync(
      auditFile,
      JSON.stringify(
        {
          keep: audit?.keep || { days: false, amount: config.logging.maxFiles },
          auditLog: auditFile,
          files,
          hashType
        },
        null,
        4
      )
    )
  }
}

// 历史畸形残留清理: 旧视角反斜杠审计路径在 POSIX 下整串落为 cwd 里的字面文件名
// (如 "D:\...\logs\.claude-relay-audit.log.json"), 其文件名必然以 "\" + 本服务审计文件确切 basename 结尾。
// logger 是公共模块、可能从任意 cwd 被 require, 删除条件必须字节级精确: 只认 "\" + 自家审计文件名结尾
// 且内容含 auditLog 字段的文件, 不波及其它任何 JSON; Windows 文件名不允许反斜杠, 在 Windows 上天然空转。
// 边界(有意止损, 非遗漏): 仅自动回收落入 cwd 的反斜杠塌缩类污染(在仓库根, git 可见、可能被误提交);
// 他视角 POSIX 绝对路径上的历史残留(容器内 /mnt/...、宿主 /app/logs/... 等)是死文件——修复后任何视角
// 只读写自己算出的审计路径, 残留不再被读——且落点不可枚举、无法与并存活部署的活文件区分, 自动扫除
// 风险大于收益: 容器内的随容器重建消失, 宿主侧如确认存在可人工删除
const cleanMangledAuditResidue = (auditBasename) => {
  try {
    for (const entry of fs.readdirSync(process.cwd())) {
      if (!entry.endsWith(`\\${auditBasename}`)) {
        continue
      }
      try {
        const content = JSON.parse(fs.readFileSync(path.join(process.cwd(), entry), 'utf-8'))
        if (content && typeof content.auditLog === 'string') {
          fs.unlinkSync(path.join(process.cwd(), entry))
          console.log(`[logger] 已清理跨平台错乱遗留的畸形审计文件: ${entry}`)
        }
      } catch (error) {
        console.error(`[logger] 检查疑似畸形审计文件失败: ${entry}`, error)
      }
    }
  } catch (error) {
    console.error('[logger] 扫描畸形审计残留失败:', error)
  }
}

// 🔄 增强的日志轮转配置
const createRotateTransport = (filename, level = null) => {
  const auditBasename = `.${filename.replace('%DATE%', 'audit')}.json`
  const auditFile = path.join(config.logging.dirname, auditBasename)

  cleanMangledAuditResidue(auditBasename)
  try {
    healAuditFile(auditFile, filename)
  } catch (error) {
    console.error(`[logger] 审计文件自愈失败(不阻塞日志初始化): ${auditFile}`, error)
  }

  const transport = new DailyRotateFile({
    filename: path.join(config.logging.dirname, filename),
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize: config.logging.maxSize,
    maxFiles: config.logging.maxFiles,
    auditFile,
    format: fileFormat
  })

  if (level) {
    transport.level = level
  }

  // 监听轮转事件（测试环境关闭以避免 Jest 退出后输出）
  if (!isTestEnv) {
    transport.on('rotate', (oldFilename, newFilename) => {
      console.log(`📦 Log rotated: ${oldFilename} -> ${newFilename}`)
    })

    transport.on('new', (newFilename) => {
      console.log(`📄 New log file created: ${newFilename}`)
    })

    transport.on('archive', (zipFilename) => {
      console.log(`🗜️ Log archived: ${zipFilename}`)
    })
  }

  return transport
}

const dailyRotateFileTransport = createRotateTransport('claude-relay-%DATE%.log')
const errorFileTransport = createRotateTransport('claude-relay-error-%DATE%.log', 'error')

// 🔒 创建专门的安全日志记录器
const securityLogger = winston.createLogger({
  level: 'warn',
  format: fileFormat,
  transports: [createRotateTransport('claude-relay-security-%DATE%.log', 'warn')],
  silent: false
})

// 🔐 创建专门的认证详细日志记录器（记录完整的认证响应）
const authDetailLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: () => formatDateWithTimezone(new Date(), false) }),
    winston.format.printf(({ level, message, timestamp, data }) => {
      // 使用更深的深度和格式化的JSON输出
      const jsonData = data ? JSON.stringify(data, null, 2) : '{}'
      return `[${timestamp}] ${level.toUpperCase()}: ${message}\n${jsonData}\n${'='.repeat(80)}`
    })
  ),
  transports: [createRotateTransport('claude-relay-auth-detail-%DATE%.log', 'info')],
  silent: false
})

// 🌟 增强的 Winston logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || config.logging.level,
  format: fileFormat,
  transports: [
    // 📄 文件输出
    dailyRotateFileTransport,
    errorFileTransport,

    // 🖥️ 控制台输出
    new winston.transports.Console({
      format: consoleFormat,
      handleExceptions: false,
      handleRejections: false
    })
  ],

  // 🚨 异常处理
  exceptionHandlers: [
    new winston.transports.File({
      filename: path.join(config.logging.dirname, 'exceptions.log'),
      format: fileFormat,
      maxsize: 10485760, // 10MB
      maxFiles: 5
    }),
    new winston.transports.Console({
      format: consoleFormat
    })
  ],

  // 🔄 未捕获异常处理
  rejectionHandlers: [
    new winston.transports.File({
      filename: path.join(config.logging.dirname, 'rejections.log'),
      format: fileFormat,
      maxsize: 10485760, // 10MB
      maxFiles: 5
    }),
    new winston.transports.Console({
      format: consoleFormat
    })
  ],

  // 防止进程退出
  exitOnError: false
})

// 🎯 增强的自定义方法
logger.success = (message, metadata = {}) => {
  logger.info(`✅ ${message}`, { type: 'success', ...metadata })
}

logger.start = (message, metadata = {}) => {
  logger.info(`🚀 ${message}`, { type: 'startup', ...metadata })
}

logger.request = (method, url, status, duration, metadata = {}) => {
  const emoji = status >= 400 ? '🔴' : status >= 300 ? '🟡' : '🟢'
  const level = status >= 400 ? 'error' : status >= 300 ? 'warn' : 'info'

  logger[level](`${emoji} ${method} ${url} - ${status} (${duration}ms)`, {
    type: 'request',
    method,
    url,
    status,
    duration,
    ...metadata
  })
}

logger.api = (message, metadata = {}) => {
  logger.info(`🔗 ${message}`, { type: 'api', ...metadata })
}

logger.security = (message, metadata = {}) => {
  const securityData = {
    type: 'security',
    timestamp: new Date().toISOString(),
    pid: process.pid,
    hostname: os.hostname(),
    ...metadata
  }

  // 记录到主日志
  logger.warn(`🔒 ${message}`, securityData)

  // 记录到专门的安全日志文件
  try {
    securityLogger.warn(`🔒 ${message}`, securityData)
  } catch (error) {
    // 如果安全日志文件不可用，只记录到主日志
    console.warn('Security logger not available:', error.message)
  }
}

logger.database = (message, metadata = {}) => {
  logger.debug(`💾 ${message}`, { type: 'database', ...metadata })
}

logger.performance = (message, metadata = {}) => {
  logger.info(`⚡ ${message}`, { type: 'performance', ...metadata })
}

logger.audit = (message, metadata = {}) => {
  logger.info(`📋 ${message}`, {
    type: 'audit',
    timestamp: new Date().toISOString(),
    pid: process.pid,
    ...metadata
  })
}

// 🔧 性能监控方法
logger.timer = (label) => {
  const start = Date.now()
  return {
    end: (message = '', metadata = {}) => {
      const duration = Date.now() - start
      logger.performance(`${label} ${message}`, { duration, ...metadata })
      return duration
    }
  }
}

// 📊 日志统计
logger.stats = {
  requests: 0,
  errors: 0,
  warnings: 0
}

// 重写原始方法以统计
const originalError = logger.error
const originalWarn = logger.warn
const originalInfo = logger.info

logger.error = function (message, ...args) {
  logger.stats.errors++
  return originalError.call(this, message, ...args)
}

logger.warn = function (message, ...args) {
  logger.stats.warnings++
  return originalWarn.call(this, message, ...args)
}

logger.info = function (message, ...args) {
  // 检查是否是请求类型的日志
  if (args.length > 0 && typeof args[0] === 'object' && args[0].type === 'request') {
    logger.stats.requests++
  }
  return originalInfo.call(this, message, ...args)
}

// 📈 获取日志统计
logger.getStats = () => ({ ...logger.stats })

// 🧹 清理统计
logger.resetStats = () => {
  logger.stats.requests = 0
  logger.stats.errors = 0
  logger.stats.warnings = 0
}

// 📡 健康检查
logger.healthCheck = () => {
  try {
    const testMessage = 'Logger health check'
    logger.debug(testMessage)
    return { healthy: true, timestamp: new Date().toISOString() }
  } catch (error) {
    return { healthy: false, error: error.message, timestamp: new Date().toISOString() }
  }
}

// 🔐 记录认证详细信息的方法
logger.authDetail = (message, data = {}) => {
  try {
    // 记录到主日志（简化版）
    logger.info(`🔐 ${message}`, {
      type: 'auth-detail',
      summary: {
        hasAccessToken: !!data.access_token,
        hasRefreshToken: !!data.refresh_token,
        scopes: data.scope || data.scopes,
        organization: data.organization?.name,
        account: data.account?.email_address
      }
    })

    // 记录到专门的认证详细日志文件（完整数据）
    authDetailLogger.info(message, { data })
  } catch (error) {
    logger.error('Failed to log auth detail:', error)
  }
}

// 🎬 启动日志记录系统
logger.start('Logger initialized', {
  level: process.env.LOG_LEVEL || config.logging.level,
  directory: config.logging.dirname,
  maxSize: config.logging.maxSize,
  maxFiles: config.logging.maxFiles,
  envOverride: process.env.LOG_LEVEL ? true : false
})

module.exports = logger
