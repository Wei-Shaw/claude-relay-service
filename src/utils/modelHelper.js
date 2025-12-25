/**
 * Model Helper Utility
 *
 * Provides utilities for parsing vendor-prefixed model names.
 * Supports parsing model strings like "ccr,model_name" to extract vendor type and base model.
 */

// 仅保留原仓库既有的模型前缀：CCR 路由
// Gemini/Antigravity 采用“路径分流”，避免在 model 字段里混入 vendor 前缀造成混乱
const SUPPORTED_VENDOR_PREFIXES = ['ccr']

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

  for (const vendorPrefix of SUPPORTED_VENDOR_PREFIXES) {
    if (!lowerTrimmed.startsWith(`${vendorPrefix},`)) {
      continue
    }

    const parts = trimmed.split(',')
    if (parts.length < 2) {
      break
    }

    // Extract base model (everything after the first comma, rejoined in case model name contains commas)
    const baseModel = parts.slice(1).join(',').trim()
    return {
      vendor: vendorPrefix,
      baseModel
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
 * Check if the model is Opus 4.5 or newer.
 *
 * VERSION LOGIC (as of 2025-12-05):
 * - Opus 4.5+ (including 5.0, 6.0, etc.) → returns true (Pro account eligible)
 * - Opus 4.4 and below (including 3.x, 4.0, 4.1) → returns false (Max account only)
 *
 * Supported naming formats:
 *   - New format: claude-opus-{major}[-{minor}][-date], e.g., claude-opus-4-5-20251101
 *   - New format: claude-opus-{major}.{minor}, e.g., claude-opus-4.5
 *   - Old format: claude-{version}-opus[-date], e.g., claude-3-opus-20240229
 *   - Special: opus-latest, claude-opus-latest → always returns true
 *
 * @param {string} modelName - Model name
 * @returns {boolean} - Whether the model is Opus 4.5 or newer
 */
function isOpus45OrNewer(modelName) {
  if (!modelName) {
    return false
  }

  const lowerModel = modelName.toLowerCase()
  if (!lowerModel.includes('opus')) {
    return false
  }

  // Handle 'latest' special case
  if (lowerModel.includes('opus-latest') || lowerModel.includes('opus_latest')) {
    return true
  }

  // Old format: claude-{version}-opus (version before opus)
  // e.g., claude-3-opus-20240229, claude-3.5-opus
  const oldFormatMatch = lowerModel.match(/claude[- ](\d+)(?:[.-](\d+))?[- ]opus/)
  if (oldFormatMatch) {
    const majorVersion = parseInt(oldFormatMatch[1], 10)
    const minorVersion = oldFormatMatch[2] ? parseInt(oldFormatMatch[2], 10) : 0

    // Old format version refers to Claude major version
    // majorVersion > 4: 5.x, 6.x, ... → true
    // majorVersion === 4 && minorVersion >= 5: 4.5, 4.6, ... → true
    // Others (3.x, 4.0-4.4): → false
    if (majorVersion > 4) {
      return true
    }
    if (majorVersion === 4 && minorVersion >= 5) {
      return true
    }
    return false
  }

  // New format 1: opus-{major}.{minor} (dot-separated)
  // e.g., claude-opus-4.5, opus-4.5
  const dotFormatMatch = lowerModel.match(/opus[- ]?(\d+)\.(\d+)/)
  if (dotFormatMatch) {
    const majorVersion = parseInt(dotFormatMatch[1], 10)
    const minorVersion = parseInt(dotFormatMatch[2], 10)

    // Same version logic as old format
    // opus-5.0, opus-6.0 → true
    // opus-4.5, opus-4.6 → true
    // opus-4.0, opus-4.4 → false
    if (majorVersion > 4) {
      return true
    }
    if (majorVersion === 4 && minorVersion >= 5) {
      return true
    }
    return false
  }

  // New format 2: opus-{major}[-{minor}][-date] (hyphen-separated)
  // e.g., claude-opus-4-5-20251101, claude-opus-4-20250514, claude-opus-4-1-20250805
  // If opus-{major} is followed by 8-digit date, there's no minor version

  // Extract content after 'opus'
  const opusIndex = lowerModel.indexOf('opus')
  const afterOpus = lowerModel.substring(opusIndex + 4)

  // Match: -{major}-{minor}-{date} or -{major}-{date} or -{major}
  // IMPORTANT: Minor version regex is (\d{1,2}) not (\d+)
  // This prevents matching 8-digit dates as minor version
  // Example: opus-4-20250514 → major=4, minor=undefined (not 20250514)
  // Example: opus-4-5-20251101 → major=4, minor=5
  // Future-proof: Supports up to 2-digit minor versions (0-99)
  const versionMatch = afterOpus.match(/^[- ](\d+)(?:[- ](\d{1,2})(?=[- ]\d{8}|$))?/)

  if (versionMatch) {
    const majorVersion = parseInt(versionMatch[1], 10)
    const minorVersion = versionMatch[2] ? parseInt(versionMatch[2], 10) : 0

    // Same version logic: >= 4.5 returns true
    // opus-5-0-date, opus-6-date → true
    // opus-4-5-date, opus-4-10-date → true (supports 2-digit minor)
    // opus-4-date (no minor, treated as 4.0) → false
    // opus-4-1-date, opus-4-4-date → false
    if (majorVersion > 4) {
      return true
    }
    if (majorVersion === 4 && minorVersion >= 5) {
      return true
    }
    return false
  }

  // Other cases containing 'opus' but cannot parse version, assume legacy
  return false
}

module.exports = {
  parseVendorPrefixedModel,
  hasVendorPrefix,
  getEffectiveModel,
  getVendorType,
  isOpus45OrNewer
}
