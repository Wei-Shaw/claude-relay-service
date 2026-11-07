const { extractCodexUsageHeaders } = require('../src/utils/codexUsage')

describe('Codex usage response headers', () => {
  test('retains zero usage and zero-duration windows instead of treating them as absent', () => {
    expect(
      extractCodexUsageHeaders({
        'x-codex-primary-used-percent': '0',
        'x-codex-primary-window-minutes': '10080',
        'x-codex-primary-reset-after-seconds': '602505',
        'x-codex-secondary-used-percent': 0,
        'x-codex-secondary-window-minutes': '0',
        'x-codex-secondary-reset-after-seconds': '0'
      })
    ).toEqual({
      primaryUsedPercent: 0,
      primaryWindowMinutes: 10080,
      primaryResetAfterSeconds: 602505,
      secondaryUsedPercent: 0,
      secondaryWindowMinutes: 0,
      secondaryResetAfterSeconds: 0,
      primaryOverSecondaryPercent: null
    })
  })

  test('accepts case-insensitive header names and the first array value', () => {
    expect(
      extractCodexUsageHeaders({ 'X-Codex-Primary-Used-Percent': ['12.5', '20'] })
    ).toMatchObject({ primaryUsedPercent: 12.5 })
  })

  test.each([
    undefined,
    null,
    {},
    { 'content-type': 'text/event-stream' },
    {
      'x-codex-primary-used-percent': 'NaN',
      'x-codex-secondary-used-percent': ''
    }
  ])('does not create a quota snapshot without numeric quota data: %p', (headers) => {
    expect(extractCodexUsageHeaders(headers)).toBeNull()
  })
})
