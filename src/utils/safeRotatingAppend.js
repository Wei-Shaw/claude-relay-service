/**
 * ============================================================================
 * 安全 JSONL 追加工具（带文件大小限制与自动轮转）
 * ============================================================================
 *
 * 用于所有调试 Dump 模块，避免日志文件无限增长导致 I/O 拥塞。
 *
 * 策略：
 * - 每次写入前检查目标文件大小
 * - 超过阈值时，将现有文件重命名为 .bak（覆盖旧 .bak）
 * - 然后写入新文件
 */

const fs = require('fs/promises')
const logger = require('./logger')

// 默认文件大小上限：10MB
const DEFAULT_MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024
const MAX_FILE_SIZE_ENV = 'DUMP_MAX_FILE_SIZE_BYTES'

/**
 * 获取文件大小上限（可通过环境变量覆盖）
 */
function getMaxFileSize() {
  const raw = process.env[MAX_FILE_SIZE_ENV]
  if (raw) {
    const parsed = Number.parseInt(raw, 10)
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed
    }
  }
  return DEFAULT_MAX_FILE_SIZE_BYTES
}

/**
 * 获取文件大小，文件不存在时返回 0
 */
async function getFileSize(filepath) {
  try {
    const stat = await fs.stat(filepath)
    return stat.size
  } catch (e) {
    // 文件不存在或无法读取
    return 0
  }
}

/**
 * 安全追加写入 JSONL 文件，支持自动轮转
 *
 * @param {string} filepath - 目标文件绝对路径
 * @param {string} line - 要写入的单行（应以 \n 结尾）
 * @param {Object} options - 可选配置
 * @param {number} options.maxFileSize - 文件大小上限（字节），默认从环境变量或 10MB
 */
async function safeRotatingAppend(filepath, line, options = {}) {
  const maxFileSize = options.maxFileSize || getMaxFileSize()

  const currentSize = await getFileSize(filepath)

  // 如果当前文件已达到或超过阈值，轮转
  if (currentSize >= maxFileSize) {
    const backupPath = `${filepath}.bak`
    try {
      // 先删除旧备份（如果存在）
      await fs.unlink(backupPath).catch(() => {})
      // 重命名当前文件为备份
      await fs.rename(filepath, backupPath)
    } catch (renameErr) {
      // 轮转失败时记录警告日志，继续写入原文件
      logger.warn('⚠️ Log rotation failed, continuing to write to original file', {
        filepath,
        backupPath,
        error: renameErr?.message || String(renameErr)
      })
    }
  }

  // 追加写入
  await fs.appendFile(filepath, line, { encoding: 'utf8' })
}

module.exports = {
  safeRotatingAppend,
  getMaxFileSize,
  MAX_FILE_SIZE_ENV,
  DEFAULT_MAX_FILE_SIZE_BYTES
}
