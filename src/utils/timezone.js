function getDateInTimezone(date = new Date(), offset = 8) {
  const offsetMs = offset * 3600000
  return new Date(date.getTime() + offsetMs)
}

function getDateStringInTimezone(date = new Date(), offset = 8) {
  const tzDate = getDateInTimezone(date, offset)
  return `${tzDate.getUTCFullYear()}-${String(tzDate.getUTCMonth() + 1).padStart(2, '0')}-${String(
    tzDate.getUTCDate()
  ).padStart(2, '0')}`
}

function getHourInTimezone(date = new Date(), offset = 8) {
  const tzDate = getDateInTimezone(date, offset)
  return tzDate.getUTCHours()
}

function getWeekStringInTimezone(date = new Date(), offset = 8) {
  const tzDate = getDateInTimezone(date, offset)
  const year = tzDate.getUTCFullYear()
  const dateObj = new Date(tzDate)
  const dayOfWeek = dateObj.getUTCDay() || 7
  const firstThursday = new Date(dateObj)
  firstThursday.setUTCDate(dateObj.getUTCDate() + 4 - dayOfWeek)

  const yearStart = new Date(firstThursday.getUTCFullYear(), 0, 1)
  const weekNumber = Math.ceil(((firstThursday - yearStart) / 86400000 + 1) / 7)

  return `${year}-W${String(weekNumber).padStart(2, '0')}`
}

function getPeriodString(resetDay = 1, resetHour = 0, date = new Date(), offset = 8) {
  const tzDate = getDateInTimezone(date, offset)
  const currentDay = tzDate.getUTCDay() || 7
  const currentHour = tzDate.getUTCHours()

  let daysSinceReset = (currentDay - resetDay + 7) % 7
  if (daysSinceReset === 0 && currentHour < resetHour) {
    daysSinceReset = 7
  }

  const periodStart = new Date(tzDate)
  periodStart.setUTCDate(tzDate.getUTCDate() - daysSinceReset)
  periodStart.setUTCHours(resetHour, 0, 0, 0)

  const y = periodStart.getUTCFullYear()
  const m = String(periodStart.getUTCMonth() + 1).padStart(2, '0')
  const d = String(periodStart.getUTCDate()).padStart(2, '0')
  const h = String(periodStart.getUTCHours()).padStart(2, '0')

  return `${y}-${m}-${d}T${h}`
}

function getNextResetTime(resetDay = 1, resetHour = 0, offset = 8) {
  const tzDate = getDateInTimezone(new Date(), offset)
  const currentDay = tzDate.getUTCDay() || 7
  const currentHour = tzDate.getUTCHours()

  let daysUntilReset = (resetDay - currentDay + 7) % 7
  if (daysUntilReset === 0 && currentHour >= resetHour) {
    daysUntilReset = 7
  }

  const resetTz = new Date(tzDate)
  resetTz.setUTCDate(tzDate.getUTCDate() + daysUntilReset)
  resetTz.setUTCHours(resetHour, 0, 0, 0)

  return new Date(resetTz.getTime() - offset * 3600000)
}

function getPeriodStartDate(resetDay = 1, resetHour = 0, date = new Date(), offset = 8) {
  const tzDate = getDateInTimezone(date, offset)
  const currentDay = tzDate.getUTCDay() || 7
  const currentHour = tzDate.getUTCHours()

  let daysSinceReset = (currentDay - resetDay + 7) % 7
  if (daysSinceReset === 0 && currentHour < resetHour) {
    daysSinceReset = 7
  }

  const periodStart = new Date(tzDate)
  periodStart.setUTCDate(tzDate.getUTCDate() - daysSinceReset)
  periodStart.setUTCHours(resetHour, 0, 0, 0)

  return periodStart
}

module.exports = {
  getDateInTimezone,
  getDateStringInTimezone,
  getHourInTimezone,
  getWeekStringInTimezone,
  getPeriodString,
  getNextResetTime,
  getPeriodStartDate
}
