const config = require('../../config/config')

function parseDateTimeQuery(value) {
  if (!value) {
    return null
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value
  }

  const raw = String(value).trim()
  if (!raw) {
    return null
  }

  if (/[zZ]|[+-]\d{2}:\d{2}$/.test(raw)) {
    const date = new Date(raw)
    return Number.isNaN(date.getTime()) ? null : date
  }

  const normalized = raw.replace(' ', 'T')
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/)
  if (!match) {
    const date = new Date(raw)
    return Number.isNaN(date.getTime()) ? null : date
  }

  // 无时区标记的本地时间字符串按系统配置时区解析（而非服务器本地时区），再换算成 UTC
  const [, year, month, day, hour, minute, second = '00'] = match
  const offset = config.system.timezoneOffset
  const utcMs = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
    0
  )
  return new Date(utcMs - offset * 3600000)
}

module.exports = {
  parseDateTimeQuery
}
