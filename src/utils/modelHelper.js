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

module.exports = {
  parseVendorPrefixedModel,
  hasVendorPrefix,
  getEffectiveModel,
  getVendorType
}
