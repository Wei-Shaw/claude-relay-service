let config = {}
try {
  // config/config.js 可能在某些环境不存在（例如仅拷贝了 config.example.js）
  // 为保证可运行，这里做容错处理
  // eslint-disable-next-line global-require
  config = require('../../config/config')
} catch (error) {
  config = {}
}

const parseBooleanEnv = (value) => {
  if (typeof value === 'boolean') {
    return value
  }
  if (typeof value !== 'string') {
    return false
  }
  const normalized = value.trim().toLowerCase()
  return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on'
}

const normalizeProviderFlagKey = (providerKey = '') => {
  if (!providerKey) {
    return ''
  }

  const normalized = String(providerKey).trim()
  if (!normalized) {
    return ''
  }

  return normalized
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[-\s]+/g, '_')
    .toLowerCase()
}

const getVendorErrorSanitizationConfig = (providerKey = '') => {
  const normalizedProvider = normalizeProviderFlagKey(providerKey)
  const providerConfigKey = normalizedProvider.replace(/_([a-z])/g, (_, char) => char.toUpperCase())

  return {
    globalEnabled: config?.vendorErrorSanitization?.enabled,
    providerEnabled:
      normalizedProvider && config?.vendorErrorSanitization?.providers
        ? config.vendorErrorSanitization.providers[providerConfigKey]
        : undefined
  }
}

/**
 * 是否允许执行"余额脚本"（安全开关）
 * ⚠️ 安全警告：vm模块非安全沙箱，默认禁用。如需启用请显式设置 BALANCE_SCRIPT_ENABLED=true
 * 仅在完全信任管理员且了解RCE风险时才启用此功能
 */
const isBalanceScriptEnabled = () => {
  if (
    process.env.BALANCE_SCRIPT_ENABLED !== undefined &&
    process.env.BALANCE_SCRIPT_ENABLED !== ''
  ) {
    return parseBooleanEnv(process.env.BALANCE_SCRIPT_ENABLED)
  }

  const fromConfig =
    config?.accountBalance?.enableBalanceScript ??
    config?.features?.balanceScriptEnabled ??
    config?.security?.enableBalanceScript

  // 默认禁用，需显式启用
  return typeof fromConfig === 'boolean' ? fromConfig : false
}

/**
 * 是否启用供应商上游错误对外脱敏
 * - 默认启用，避免把供应商账号/网关细节暴露给终端客户
 * - 可通过全局或 provider 级开关关闭
 */
const isVendorErrorSanitizationEnabled = (providerKey = '') => {
  const normalizedProvider = normalizeProviderFlagKey(providerKey)
  const providerEnvKey = normalizedProvider
    ? `${normalizedProvider.toUpperCase()}_ERROR_SANITIZATION_ENABLED`
    : ''

  if (
    providerEnvKey &&
    process.env[providerEnvKey] !== undefined &&
    process.env[providerEnvKey] !== ''
  ) {
    return parseBooleanEnv(process.env[providerEnvKey])
  }

  if (
    process.env.VENDOR_ERROR_SANITIZATION_ENABLED !== undefined &&
    process.env.VENDOR_ERROR_SANITIZATION_ENABLED !== ''
  ) {
    return parseBooleanEnv(process.env.VENDOR_ERROR_SANITIZATION_ENABLED)
  }

  const { globalEnabled, providerEnabled } = getVendorErrorSanitizationConfig(providerKey)
  if (typeof providerEnabled === 'boolean') {
    return providerEnabled
  }
  if (typeof globalEnabled === 'boolean') {
    return globalEnabled
  }

  return true
}

module.exports = {
  isBalanceScriptEnabled,
  isVendorErrorSanitizationEnabled,
  normalizeProviderFlagKey
}
