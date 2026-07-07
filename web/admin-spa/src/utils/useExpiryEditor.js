export const getMinDateTime = () => {
  const now = new Date()
  now.setMinutes(now.getMinutes() + 1)
  return now.toISOString().slice(0, 16)
}

export const getExpiryIsoFromDuration = (duration, baseDate = new Date()) => {
  if (!duration) return null
  if (duration === 'custom') return undefined

  const match = duration.match(/(\d+)([dhmy])/)
  if (!match) return undefined

  const [, value, unit] = match
  const amount = parseInt(value, 10)
  const date = new Date(baseDate)

  switch (unit) {
    case 'd':
      date.setDate(date.getDate() + amount)
      break
    case 'h':
      date.setHours(date.getHours() + amount)
      break
    case 'm':
      date.setMonth(date.getMonth() + amount)
      break
    case 'y':
      date.setFullYear(date.getFullYear() + amount)
      break
  }

  return date.toISOString()
}

export const parseCustomExpiryDateTime = (dateTime) => {
  if (!dateTime) return null

  const [datePart, timePart] = dateTime.split('T')
  if (!datePart || !timePart) return null

  const [year, month, day] = datePart.split('-').map(Number)
  const [hours, minutes] = timePart.split(':').map(Number)
  const localDate = new Date(year, month - 1, day, hours, minutes, 0, 0)

  return Number.isNaN(localDate.getTime()) ? null : localDate.toISOString()
}

export const formatExpireDate = (dateString) => {
  if (!dateString) return ''
  const date = new Date(dateString)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

export const isExpired = (dateString) => {
  if (!dateString) return false
  return new Date(dateString) < new Date()
}

export const getExpiryStatus = (expiresAt) => {
  if (!expiresAt) return null

  const now = new Date()
  const expiryDate = new Date(expiresAt)
  const diffMs = expiryDate - now
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

  if (diffMs < 0) {
    return {
      text: '已过期',
      class: 'text-red-600'
    }
  }

  if (diffDays <= 7) {
    return {
      text: `${diffDays} 天后过期`,
      class: 'text-orange-600'
    }
  }

  if (diffDays <= 30) {
    return {
      text: `${diffDays} 天后过期`,
      class: 'text-yellow-600'
    }
  }

  return {
    text: `${Math.ceil(diffDays / 30)} 个月后过期`,
    class: 'text-green-600'
  }
}
