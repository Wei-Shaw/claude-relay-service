// 数字格式化函数
export function formatNumber(num) {
  if (num === null || num === undefined) return '0'

  const absNum = Math.abs(num)

  if (absNum >= 1e9) {
    return (num / 1e9).toFixed(2) + 'B'
  } else if (absNum >= 1e6) {
    return (num / 1e6).toFixed(2) + 'M'
  } else if (absNum >= 1e3) {
    return (num / 1e3).toFixed(1) + 'K'
  }

  return num.toLocaleString()
}

// 日期格式化函数
export function formatDate(date, format = 'YYYY-MM-DD HH:mm:ss') {
  if (!date) return ''

  const d = new Date(date)

  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hours = String(d.getHours()).padStart(2, '0')
  const minutes = String(d.getMinutes()).padStart(2, '0')
  const seconds = String(d.getSeconds()).padStart(2, '0')

  return format
    .replace('YYYY', year)
    .replace('MM', month)
    .replace('DD', day)
    .replace('HH', hours)
    .replace('mm', minutes)
    .replace('ss', seconds)
}

// 相对时间格式化
export function formatRelativeTime(date) {
  if (!date) return ''

  const now = new Date()
  const past = new Date(date)
  const diffMs = now - past
  const diffSecs = Math.floor(diffMs / 1000)
  const diffMins = Math.floor(diffSecs / 60)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffDays > 0) {
    return `${diffDays}天前`
  } else if (diffHours > 0) {
    return `${diffHours}小时前`
  } else if (diffMins > 0) {
    return `${diffMins}分钟前`
  } else {
    return '刚刚'
  }
}

// 字节格式化
export function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes'

  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']

  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i]
}
