const { parseDateTimeQuery } = require('../src/utils/dateTime')

describe('parseDateTimeQuery', () => {
  test('parses local datetime string without timezone suffix', () => {
    const result = parseDateTimeQuery('2026-04-07 12:30:45')

    expect(result).toBeInstanceOf(Date)
    expect(result.getFullYear()).toBe(2026)
    expect(result.getMonth()).toBe(3)
    expect(result.getDate()).toBe(7)
    expect(result.getHours()).toBe(12)
    expect(result.getMinutes()).toBe(30)
    expect(result.getSeconds()).toBe(45)
  })

  test('parses ISO-like local datetime string without timezone suffix', () => {
    const result = parseDateTimeQuery('2026-04-07T08:15:00')

    expect(result).toBeInstanceOf(Date)
    expect(result.getFullYear()).toBe(2026)
    expect(result.getMonth()).toBe(3)
    expect(result.getDate()).toBe(7)
    expect(result.getHours()).toBe(8)
    expect(result.getMinutes()).toBe(15)
    expect(result.getSeconds()).toBe(0)
  })

  test('parses timezone-aware datetime string as absolute time', () => {
    const result = parseDateTimeQuery('2026-04-07T12:30:45.000Z')

    expect(result).toBeInstanceOf(Date)
    expect(result.toISOString()).toBe('2026-04-07T12:30:45.000Z')
  })

  test('returns null for invalid datetime string', () => {
    expect(parseDateTimeQuery('not-a-date')).toBeNull()
  })
})
