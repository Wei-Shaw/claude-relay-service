import dayjs from 'dayjs'

export const formatDateTimeLocalValue = (value) => {
  if (!value) return ''
  const date = dayjs(value)
  if (!date.isValid()) return ''
  return date.format('YYYY-MM-DDTHH:mm')
}

export const getDateTimeLocalMinValue = (minutesFromNow = 1) => {
  return dayjs().add(minutesFromNow, 'minute').format('YYYY-MM-DDTHH:mm')
}

export const localDateTimeInputToISOString = (value) => {
  if (!value) return ''
  const date = dayjs(value)
  if (!date.isValid()) return ''
  return date.toDate().toISOString()
}

export const formatLocalDateTime = (value, format = 'YYYY-MM-DD HH:mm:ss') => {
  if (!value) return ''
  const date = dayjs(value)
  if (!date.isValid()) return ''
  return date.format(format)
}

export const formatLocalDate = (value, format = 'YYYY-MM-DD') => {
  if (!value) return ''
  const date = dayjs(value)
  if (!date.isValid()) return ''
  return date.format(format)
}

export const toLocalDateString = (value = new Date()) => {
  const date = dayjs(value)
  if (!date.isValid()) return ''
  return date.format('YYYY-MM-DD')
}
