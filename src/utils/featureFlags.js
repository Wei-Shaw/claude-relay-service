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
 * 是否允许执行“余额脚本”（安全开关）
 * 默认开启，便于保持现有行为；如需禁用请显式设置 BALANCE_SCRIPT_ENABLED=false（环境变量优先）
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

  return typeof fromConfig === 'boolean' ? fromConfig : true
}

module.exports = {
  isBalanceScriptEnabled
}
