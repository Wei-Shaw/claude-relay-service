/**
 * 简化的日志工具
 * 适配 Vercel 无服务器环境
 */

class Logger {
  constructor() {
    this.isProduction = process.env.NODE_ENV === 'production';
    this.logLevel = process.env.LOG_LEVEL || 'info';
  }

  _log(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      ...(data && { data })
    };

    if (this.isProduction) {
      console.log(JSON.stringify(logEntry));
    } else {
      const emoji = this._getEmoji(level);
      console.log(`${emoji} [${timestamp}] ${message}${data ? ` - ${JSON.stringify(data)}` : ''}`);
    }
  }

  _getEmoji(level) {
    const emojis = {
      error: '❌',
      warn: '⚠️',
      info: '📝',
      debug: '🔍',
      success: '✅',
      api: '🚀',
      database: '📊',
      start: '🎯'
    };
    return emojis[level] || '📝';
  }

  error(message, data = null) {
    this._log('error', message, data);
  }

  warn(message, data = null) {
    this._log('warn', message, data);
  }

  info(message, data = null) {
    this._log('info', message, data);
  }

  debug(message, data = null) {
    if (this.logLevel === 'debug') {
      this._log('debug', message, data);
    }
  }

  success(message, data = null) {
    this._log('success', message, data);
  }

  api(message, data = null) {
    this._log('api', message, data);
  }

  database(message, data = null) {
    this._log('database', message, data);
  }

  start(message, data = null) {
    this._log('start', message, data);
  }

  timer(name) {
    const start = Date.now();
    return {
      end: (message = 'completed') => {
        const duration = Date.now() - start;
        this.info(`⏱️ ${name} ${message} in ${duration}ms`);
      }
    };
  }

  healthCheck() {
    return {
      healthy: true,
      timestamp: new Date().toISOString()
    };
  }

  getStats() {
    return {
      logLevel: this.logLevel,
      isProduction: this.isProduction,
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = new Logger();