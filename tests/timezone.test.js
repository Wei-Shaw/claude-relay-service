const {
  getDateInTimezone,
  getDateStringInTimezone,
  getHourInTimezone,
  getWeekStringInTimezone,
  getPeriodString,
  getNextResetTime,
  getPeriodStartDate
} = require('../src/utils/timezone')

describe('timezone utils', () => {
  test('getDateInTimezone shifts utc date by offset hours', () => {
    const result = getDateInTimezone(new Date('2026-04-07T00:00:00.000Z'), 8)
    expect(result.toISOString()).toBe('2026-04-07T08:00:00.000Z')
  })

  test('getDateStringInTimezone returns shifted calendar date', () => {
    expect(getDateStringInTimezone(new Date('2026-04-06T20:00:00.000Z'), 8)).toBe('2026-04-07')
  })

  test('getHourInTimezone returns shifted hour', () => {
    expect(getHourInTimezone(new Date('2026-04-06T20:00:00.000Z'), 8)).toBe(4)
  })

  test('getWeekStringInTimezone uses iso week semantics', () => {
    expect(getWeekStringInTimezone(new Date('2026-01-01T00:00:00.000Z'), 8)).toMatch(
      /^2026-W\d{2}$/
    )
  })

  test('getPeriodString respects reset day/hour', () => {
    const result = getPeriodString(1, 8, new Date('2026-04-08T01:00:00.000Z'), 8)
    expect(result).toBe('2026-04-06T08')
  })

  test('getNextResetTime returns utc instant for next configured reset', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-04-07T00:00:00.000Z'))
    const result = getNextResetTime(1, 8, 8)
    expect(result).toBeInstanceOf(Date)
    jest.useRealTimers()
  })

  test('getPeriodStartDate returns shifted local period start date', () => {
    const result = getPeriodStartDate(1, 8, new Date('2026-04-08T01:00:00.000Z'), 8)
    expect(result).toBeInstanceOf(Date)
    expect(result.getUTCHours()).toBe(8)
  })
})
