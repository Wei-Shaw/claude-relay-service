const { getAccountDispatchWeight, sortAccountsByPriority } = require('../src/utils/commonHelper')

describe('commonHelper account dispatch priority', () => {
  test('prioritizes OpenAI accounts with reset cards before normal accounts at the same priority', () => {
    const accounts = [
      {
        accountId: 'normal',
        priority: 50,
        lastUsedAt: '2026-07-09T09:00:00.000Z'
      },
      {
        accountId: 'has-card',
        priority: 50,
        lastUsedAt: '2026-07-09T10:00:00.000Z',
        credits: 1
      }
    ]

    expect(sortAccountsByPriority(accounts).map((account) => account.accountId)).toEqual([
      'has-card',
      'normal'
    ])
  })

  test('uses reset-card expiry as the tie breaker so expiring credits are consumed first', () => {
    const accounts = [
      {
        accountId: 'later-card',
        priority: 50,
        credits: 1,
        resetCardExpiresAt: '2026-07-20T00:00:00.000Z'
      },
      {
        accountId: 'soon-card',
        priority: 50,
        credits: 1,
        resetCardExpiresAt: '2026-07-10T00:00:00.000Z'
      }
    ]

    expect(sortAccountsByPriority(accounts).map((account) => account.accountId)).toEqual([
      'soon-card',
      'later-card'
    ])
  })

  test('exposes dispatch weight details for account-pool pages and diagnostics', () => {
    expect(
      getAccountDispatchWeight({
        accountId: 'acct-29',
        priority: 50,
        credits: 2,
        resetCardExpiresAt: '2026-07-10T00:00:00.000Z'
      })
    ).toEqual({
      priority: 50,
      resetCardCredits: 2,
      hasResetCard: true,
      resetCardExpiresAt: '2026-07-10T00:00:00.000Z',
      resetCardExpiresAtMs: Date.parse('2026-07-10T00:00:00.000Z')
    })
  })
})
