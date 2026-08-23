const commonHelper = require('../src/utils/commonHelper')
const redis = require('../src/models/redis')
const timezone = require('../src/utils/timezone')

describe('timezone helper consistency', () => {
  test('commonHelper and redis use the same shifted date helpers', () => {
    const source = new Date('2026-04-06T20:15:30.000Z')

    expect(commonHelper.getDateInTimezone(source).toISOString()).toBe(
      timezone.getDateInTimezone(source, 8).toISOString()
    )
    expect(commonHelper.getDateStringInTimezone(source)).toBe(
      timezone.getDateStringInTimezone(source, 8)
    )
    expect(redis.getDateInTimezone(source).toISOString()).toBe(
      timezone.getDateInTimezone(source, 8).toISOString()
    )
    expect(redis.getDateStringInTimezone(source)).toBe(timezone.getDateStringInTimezone(source, 8))
  })
})
