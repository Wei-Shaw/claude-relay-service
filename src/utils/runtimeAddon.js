const fs = require('fs')
const path = require('path')
const logger = require('./logger')

const ADDON_DIRECTORIES = [
  path.join(process.cwd(), '.local', 'ext'),
  path.join(process.cwd(), '.local', 'extensions')
]

class RuntimeAddonBus {
  constructor() {
    this._handlers = new Map()
    this._initialized = false
  }

  register(eventId, handler) {
    if (!eventId || typeof handler !== 'function') {
      return
    }

    if (!this._handlers.has(eventId)) {
      this._handlers.set(eventId, [])
    }

    this._handlers.get(eventId).push(handler)
  }

  emitSync(eventId, payload) {
    this._ensureInitialized()

    if (!eventId) {
      return payload
    }

    const handlers = this._handlers.get(eventId)
    if (!handlers || handlers.length === 0) {
      return payload
    }

    let current = payload

    for (const handler of handlers) {
      try {
        const result = handler(current)
        if (typeof result !== 'undefined') {
          current = result
        }
      } catch (error) {
        this._log('warn', `本地扩展处理 ${eventId} 失败: ${error.message}`, error)
      }
    }

    return current
  }

  _ensureInitialized() {
    if (this._initialized) {
      return
    }

    this._initialized = true
    const loadedPaths = new Set()

    for (const dir of ADDON_DIRECTORIES) {
      if (!dir || !fs.existsSync(dir)) {
        continue
      }

      let entries = []
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true })
      } catch (error) {
        this._log('warn', `读取本地扩展目录 ${dir} 失败: ${error.message}`, error)
        continue
      }

      for (const entry of entries) {
        if (!entry.isFile()) {
          continue
        }

        if (!entry.name.endsWith('.js')) {
          continue
        }

        const targetPath = path.join(dir, entry.name)

        if (loadedPaths.has(targetPath)) {
          continue
        }

        loadedPaths.add(targetPath)

        try {
          const registrar = require(targetPath)
          if (typeof registrar === 'function') {
            registrar(this)
          }
        } catch (error) {
          this._log('warn', `加载本地扩展 ${entry.name} 失败: ${error.message}`, error)
        }
      }
    }
  }

  _log(level, message, error) {
    const targetLevel = typeof level === 'string' ? level : 'info'
    const loggerMethod =
      logger && typeof logger[targetLevel] === 'function' ? logger[targetLevel].bind(logger) : null

    if (loggerMethod) {
      loggerMethod(message, error)
    } else if (targetLevel === 'error') {
      console.error(message, error)
    } else {
      console.log(message, error)
    }
  }
}

module.exports = new RuntimeAddonBus()
