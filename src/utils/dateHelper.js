const config = require('../../config/config')

/**
 * 格式化日期时间为指定时区的本地时间字符串
 * @param {Date|number} date - Date对象或时间戳（秒或毫秒）
 * @param {boolean} includeTimezone - 是否在输出中包含时区信息
 * @returns {string} 格式化后的时间字符串
 */
function formatDateWithTimezone(date, includeTimezone = true) {
  // 处理不同类型的输入
  let dateObj
  if (typeof date === 'number') {
    // 判断是秒还是毫秒时间戳
    // Unix时间戳（秒）通常小于 10^10，毫秒时间戳通常大于 10^12
    if (date < 10000000000) {
      dateObj = new Date(date * 1000) // 秒转毫秒
    } else {
      dateObj = new Date(date) // 已经是毫秒
    }
  } else if (date instanceof Date) {
    dateObj = date
  } else {
    dateObj = new Date(date)
  }

  // 获取配置的时区偏移（小时）
  const timezoneOffset = config.system.timezoneOffset || 8 // 默认 UTC+8

  // 计算本地时间
  const offsetMs = timezoneOffset * 3600000 // 转换为毫秒
  const localTime = new Date(dateObj.getTime() + offsetMs)

  // 格式化为 YYYY-MM-DD HH:mm:ss
  const year = localTime.getUTCFullYear()
  const month = String(localTime.getUTCMonth() + 1).padStart(2, '0')
  const day = String(localTime.getUTCDate()).padStart(2, '0')
  const hours = String(localTime.getUTCHours()).padStart(2, '0')
  const minutes = String(localTime.getUTCMinutes()).padStart(2, '0')
  const seconds = String(localTime.getUTCSeconds()).padStart(2, '0')

  let formattedDate = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`

  // 添加时区信息
  if (includeTimezone) {
    const sign = timezoneOffset >= 0 ? '+' : ''
    formattedDate += ` (UTC${sign}${timezoneOffset})`
  }

  return formattedDate
}

/**
 * 获取指定时区的ISO格式时间字符串
 * @param {Date|number} date - Date对象或时间戳
 * @returns {string} ISO格式的时间字符串
 */
function getISOStringWithTimezone(date) {
  // 先获取本地格式的时间（不含时区后缀）
  const localTimeStr = formatDateWithTimezone(date, false)

  // 获取时区偏移
  const timezoneOffset = config.system.timezoneOffset || 8

  // 构建ISO格式，添加时区偏移
  const sign = timezoneOffset >= 0 ? '+' : '-'
  const absOffset = Math.abs(timezoneOffset)
  const offsetHours = String(Math.floor(absOffset)).padStart(2, '0')
  const offsetMinutes = String(Math.round((absOffset % 1) * 60)).padStart(2, '0')

  // 将空格替换为T，并添加时区
  return `${localTimeStr.replace(' ', 'T')}${sign}${offsetHours}:${offsetMinutes}`
}

/**
 * 计算时间差并格式化为人类可读的字符串
 * @param {number} seconds - 秒数
 * @returns {string} 格式化的时间差字符串
 */
function formatDuration(seconds) {
  if (seconds < 60) {
    return `${seconds}秒`
  } else if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60)
    return `${minutes}分钟`
  } else if (seconds < 86400) {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    return minutes > 0 ? `${hours}小时${minutes}分钟` : `${hours}小时`
  } else {
    const days = Math.floor(seconds / 86400)
    const hours = Math.floor((seconds % 86400) / 3600)
    return hours > 0 ? `${days}天${hours}小时` : `${days}天`
  }
}

module.exports = {
  formatDateWithTimezone,
  getISOStringWithTimezone,
  formatDuration
}
