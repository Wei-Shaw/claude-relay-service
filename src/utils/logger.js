const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const config = require('../../config/config');
const path = require('path');
const fs = require('fs');
const os = require('os');

// 📝 增强的日志格式
const createLogFormat = (colorize = false) => {
  const formats = [
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.metadata({ fillExcept: ['message', 'level', 'timestamp', 'stack'] })
  ];
  
  if (colorize) {
    formats.push(winston.format.colorize());
  }
  
  formats.push(
    winston.format.printf(({ level, message, timestamp, stack, metadata, ...rest }) => {
      const emoji = {
        error: '❌',
        warn: '⚠️ ',
        info: 'ℹ️ ',
        debug: '🐛',
        verbose: '📝'
      };
      
      let logMessage = `${emoji[level] || '📝'} [${timestamp}] ${level.toUpperCase()}: ${message}`;
      
      // 添加元数据
      if (metadata && Object.keys(metadata).length > 0) {
        logMessage += ` | ${JSON.stringify(metadata)}`;
      }
      
      // 添加其他属性
      const additionalData = { ...rest };
      delete additionalData.level;
      delete additionalData.message;
      delete additionalData.timestamp;
      delete additionalData.stack;
      
      if (Object.keys(additionalData).length > 0) {
        logMessage += ` | ${JSON.stringify(additionalData)}`;
      }
      
      return stack ? `${logMessage}\n${stack}` : logMessage;
    })
  );
  
  return winston.format.combine(...formats);
};

const logFormat = createLogFormat(false);
const consoleFormat = createLogFormat(true);

// 📁 确保日志目录存在并设置权限
if (!fs.existsSync(config.logging.dirname)) {
  fs.mkdirSync(config.logging.dirname, { recursive: true, mode: 0o755 });
}

// 🔄 增强的日志轮转配置
const createRotateTransport = (filename, level = null) => {
  const transport = new DailyRotateFile({
    filename: path.join(config.logging.dirname, filename),
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize: config.logging.maxSize,
    maxFiles: config.logging.maxFiles,
    auditFile: path.join(config.logging.dirname, `.${filename.replace('%DATE%', 'audit')}.json`),
    format: logFormat
  });
  
  if (level) {
    transport.level = level;
  }
  
  // 监听轮转事件
  transport.on('rotate', (oldFilename, newFilename) => {
    console.log(`📦 Log rotated: ${oldFilename} -> ${newFilename}`);
  });
  
  transport.on('new', (newFilename) => {
    console.log(`📄 New log file created: ${newFilename}`);
  });
  
  transport.on('archive', (zipFilename) => {
    console.log(`🗜️ Log archived: ${zipFilename}`);
  });
  
  return transport;
};

const dailyRotateFileTransport = createRotateTransport('claude-relay-%DATE%.log');
const errorFileTransport = createRotateTransport('claude-relay-error-%DATE%.log', 'error');

// 🔒 创建专门的安全日志记录器
const securityLogger = winston.createLogger({
  level: 'warn',
  format: logFormat,
  transports: [
    createRotateTransport('claude-relay-security-%DATE%.log', 'warn')
  ],
  silent: false
});

// 🌟 增强的 Winston logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || config.logging.level,
  format: logFormat,
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
      format: logFormat,
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
      format: logFormat,
      maxsize: 10485760, // 10MB
      maxFiles: 5
    }),
    new winston.transports.Console({
      format: consoleFormat
    })
  ],
  
  // 防止进程退出
  exitOnError: false
});

// 🎯 增强的自定义方法
logger.success = (message, metadata = {}) => {
  logger.info(`✅ ${message}`, { type: 'success', ...metadata });
};

logger.start = (message, metadata = {}) => {
  logger.info(`🚀 ${message}`, { type: 'startup', ...metadata });
};

logger.request = (method, url, status, duration, metadata = {}) => {
  const emoji = status >= 400 ? '🔴' : status >= 300 ? '🟡' : '🟢';
  const level = status >= 400 ? 'error' : status >= 300 ? 'warn' : 'info';
  
  logger[level](`${emoji} ${method} ${url} - ${status} (${duration}ms)`, {
    type: 'request',
    method,
    url,
    status,
    duration,
    ...metadata
  });
};

logger.api = (message, metadata = {}) => {
  logger.info(`🔗 ${message}`, { type: 'api', ...metadata });
};

logger.security = (message, metadata = {}) => {
  const securityData = {
    type: 'security',
    timestamp: new Date().toISOString(),
    pid: process.pid,
    hostname: os.hostname(),
    ...metadata
  };
  
  // 记录到主日志
  logger.warn(`🔒 ${message}`, securityData);
  
  // 记录到专门的安全日志文件
  try {
    securityLogger.warn(`🔒 ${message}`, securityData);
  } catch (error) {
    // 如果安全日志文件不可用，只记录到主日志
    console.warn('Security logger not available:', error.message);
  }
};

logger.database = (message, metadata = {}) => {
  logger.debug(`💾 ${message}`, { type: 'database', ...metadata });
};

logger.performance = (message, metadata = {}) => {
  logger.info(`⚡ ${message}`, { type: 'performance', ...metadata });
};

logger.audit = (message, metadata = {}) => {
  logger.info(`📋 ${message}`, { 
    type: 'audit',
    timestamp: new Date().toISOString(),
    pid: process.pid,
    ...metadata 
  });
};

// 🔧 性能监控方法
logger.timer = (label) => {
  const start = Date.now();
  return {
    end: (message = '', metadata = {}) => {
      const duration = Date.now() - start;
      logger.performance(`${label} ${message}`, { duration, ...metadata });
      return duration;
    }
  };
};

// 📊 日志统计
logger.stats = {
  requests: 0,
  errors: 0,
  warnings: 0
};

// 重写原始方法以统计
const originalError = logger.error;
const originalWarn = logger.warn;
const originalInfo = logger.info;

logger.error = function(message, ...args) {
  logger.stats.errors++;
  return originalError.call(this, message, ...args);
};

logger.warn = function(message, ...args) {
  logger.stats.warnings++;
  return originalWarn.call(this, message, ...args);
};

logger.info = function(message, ...args) {
  // 检查是否是请求类型的日志
  if (args.length > 0 && typeof args[0] === 'object' && args[0].type === 'request') {
    logger.stats.requests++;
  }
  return originalInfo.call(this, message, ...args);
};

// 📈 获取日志统计
logger.getStats = () => ({ ...logger.stats });

// 🧹 清理统计
logger.resetStats = () => {
  logger.stats.requests = 0;
  logger.stats.errors = 0;
  logger.stats.warnings = 0;
};

// 📡 健康检查
logger.healthCheck = () => {
  try {
    const testMessage = 'Logger health check';
    logger.debug(testMessage);
    return { healthy: true, timestamp: new Date().toISOString() };
  } catch (error) {
    return { healthy: false, error: error.message, timestamp: new Date().toISOString() };
  }
};

// 🎬 启动日志记录系统
logger.start('Logger initialized', {
  level: process.env.LOG_LEVEL || config.logging.level,
  directory: config.logging.dirname,
  maxSize: config.logging.maxSize,
  maxFiles: config.logging.maxFiles,
  envOverride: process.env.LOG_LEVEL ? true : false
});

module.exports = logger;