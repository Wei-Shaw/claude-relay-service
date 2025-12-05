/**
 * Model Helper Utility
 *
 * Provides utilities for parsing vendor-prefixed model names.
 * Supports parsing model strings like "ccr,model_name" to extract vendor type and base model.
 */

/**
 * Parse vendor-prefixed model string
 * @param {string} modelStr - Model string, potentially with vendor prefix (e.g., "ccr,gemini-2.5-pro")
 * @returns {{vendor: string|null, baseModel: string}} - Parsed vendor and base model
 */
function parseVendorPrefixedModel(modelStr) {
  if (!modelStr || typeof modelStr !== 'string') {
    return { vendor: null, baseModel: modelStr || '' }
  }

  // Trim whitespace and convert to lowercase for comparison
  const trimmed = modelStr.trim()
  const lowerTrimmed = trimmed.toLowerCase()

  // Check for ccr prefix (case insensitive)
  if (lowerTrimmed.startsWith('ccr,')) {
    const parts = trimmed.split(',')
    if (parts.length >= 2) {
      // Extract base model (everything after the first comma, rejoined in case model name contains commas)
      const baseModel = parts.slice(1).join(',').trim()
      return {
        vendor: 'ccr',
        baseModel
      }
    }
  }

  // No recognized vendor prefix found
  return {
    vendor: null,
    baseModel: trimmed
  }
}

/**
 * Check if a model string has a vendor prefix
 * @param {string} modelStr - Model string to check
 * @returns {boolean} - True if the model has a vendor prefix
 */
function hasVendorPrefix(modelStr) {
  const { vendor } = parseVendorPrefixedModel(modelStr)
  return vendor !== null
}

/**
 * Get the effective model name for scheduling and processing
 * This removes vendor prefixes to get the actual model name used for API calls
 * @param {string} modelStr - Original model string
 * @returns {string} - Effective model name without vendor prefix
 */
function getEffectiveModel(modelStr) {
  const { baseModel } = parseVendorPrefixedModel(modelStr)
  return baseModel
}

/**
 * Get the vendor type from a model string
 * @param {string} modelStr - Model string to parse
 * @returns {string|null} - Vendor type ('ccr') or null if no prefix
 */
function getVendorType(modelStr) {
  const { vendor } = parseVendorPrefixedModel(modelStr)
  return vendor
}

/**
 * 检查模型是否为 Opus 4.5 或更新版本
 * 支持格式:
 *   - 新格式: claude-opus-{major}[-{minor}][-date] 如 claude-opus-4-5-20251101
 *   - 新格式: claude-opus-{major}.{minor} 如 claude-opus-4.5
 *   - 旧格式: claude-{version}-opus[-date] 如 claude-3-opus-20240229
 *
 * @param {string} modelName - 模型名称
 * @returns {boolean} - 是否为 Opus 4.5+
 */
function isOpus45OrNewer(modelName) {
  if (!modelName) {
    return false
  }

  const lowerModel = modelName.toLowerCase()
  if (!lowerModel.includes('opus')) {
    return false
  }

  // 处理 latest 特殊情况
  if (lowerModel.includes('opus-latest') || lowerModel.includes('opus_latest')) {
    return true
  }

  // 旧格式: claude-{version}-opus (版本在 opus 前面)
  // 例如: claude-3-opus-20240229, claude-3.5-opus
  const oldFormatMatch = lowerModel.match(/claude[- ](\d+)(?:[.-](\d+))?[- ]opus/)
  if (oldFormatMatch) {
    const majorVersion = parseInt(oldFormatMatch[1], 10)
    const minorVersion = oldFormatMatch[2] ? parseInt(oldFormatMatch[2], 10) : 0

    // 旧格式的版本号指的是 Claude 大版本
    if (majorVersion > 4) {
      return true
    }
    if (majorVersion === 4 && minorVersion >= 5) {
      return true
    }
    return false
  }

  // 新格式 1: opus-{major}.{minor} (点分隔)
  // 例如: claude-opus-4.5, opus-4.5
  const dotFormatMatch = lowerModel.match(/opus[- ]?(\d+)\.(\d+)/)
  if (dotFormatMatch) {
    const majorVersion = parseInt(dotFormatMatch[1], 10)
    const minorVersion = parseInt(dotFormatMatch[2], 10)

    if (majorVersion > 4) {
      return true
    }
    if (majorVersion === 4 && minorVersion >= 5) {
      return true
    }
    return false
  }

  // 新格式 2: opus-{major}[-{minor}][-date] (横线分隔)
  // 例如: claude-opus-4-5-20251101, claude-opus-4-20250514, claude-opus-4-1-20250805
  // 关键：小版本号必须是 1 位数字，且后面紧跟 8 位日期或结束
  // 如果 opus-{major} 后面直接是 8 位日期，则没有小版本号

  // 提取 opus 后面的部分
  const opusIndex = lowerModel.indexOf('opus')
  const afterOpus = lowerModel.substring(opusIndex + 4) // 'opus' 后面的内容

  // 尝试匹配: -{major}-{minor}-{date} 或 -{major}-{date} 或 -{major}
  // 小版本号只能是 1 位数字 (如 1, 5)，不会是 2 位以上
  const versionMatch = afterOpus.match(/^[- ](\d+)(?:[- ](\d)(?=[- ]\d{8}|$))?/)

  if (versionMatch) {
    const majorVersion = parseInt(versionMatch[1], 10)
    const minorVersion = versionMatch[2] ? parseInt(versionMatch[2], 10) : 0

    if (majorVersion > 4) {
      return true
    }
    if (majorVersion === 4 && minorVersion >= 5) {
      return true
    }
    return false
  }

  // 其他包含 opus 但无法解析版本的情况，默认认为是旧版本
  return false
}

module.exports = {
  parseVendorPrefixedModel,
  hasVendorPrefix,
  getEffectiveModel,
  getVendorType,
  isOpus45OrNewer
}
