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

module.exports = {
  isBalanceScriptEnabled
}
