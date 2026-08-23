jest.mock('../src/services/account/droidAccountService', () => ({
  isSubscriptionExpired: jest.fn(() => false)
}))
jest.mock('../src/services/accountGroupService', () => ({}))
jest.mock('../src/models/redis', () => ({}))
jest.mock('../src/utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}))
jest.mock('../src/utils/upstreamErrorHelper', () => ({ isTempUnavailable: jest.fn() }))

const droidAccountService = require('../src/services/account/droidAccountService')
const droidScheduler = require('../src/services/scheduler/droidScheduler')

describe('droidScheduler._passesDroidSyncGates 硬门', () => {
  // 真实 commonHelper（isAccountHealthy/isAutoProtectionDisabled/isTruthy）+ 真实 _matchesEndpoint
  const base = {
    id: 'a1',
    isActive: 'true',
    schedulable: 'true',
    status: 'active',
    endpointType: 'anthropic'
  }

  beforeEach(() => {
    jest.clearAllMocks()
    droidAccountService.isSubscriptionExpired.mockReturnValue(false)
  })

  it('正常 active 账户通过', () => {
    expect(droidScheduler._passesDroidSyncGates({ ...base }, 'anthropic')).toBe(true)
  })

  it('手动停用 isActive=false：即使开关 ON 也不通过（修回归——手动停用始终优先于开关）', () => {
    const acc = { ...base, isActive: 'false', disableAutoProtection: 'true' }
    expect(droidScheduler._passesDroidSyncGates(acc, 'anthropic')).toBe(false)
  })

  it('手动 schedulable=false：开关 ON 也不通过', () => {
    const acc = { ...base, schedulable: 'false', disableAutoProtection: 'true' }
    expect(droidScheduler._passesDroidSyncGates(acc, 'anthropic')).toBe(false)
  })

  it('订阅过期：开关 ON 也不通过（本地硬约束）', () => {
    droidAccountService.isSubscriptionExpired.mockReturnValue(true)
    const acc = { ...base, disableAutoProtection: 'true' }
    expect(droidScheduler._passesDroidSyncGates(acc, 'anthropic')).toBe(false)
  })

  it('开关 ON + 坏 status(error)：通过（上游错误类被豁免）', () => {
    const acc = { ...base, status: 'error', disableAutoProtection: 'true' }
    expect(droidScheduler._passesDroidSyncGates(acc, 'anthropic')).toBe(true)
  })

  it('开关 OFF + 坏 status(error)：不通过', () => {
    const acc = { ...base, status: 'error', disableAutoProtection: 'false' }
    expect(droidScheduler._passesDroidSyncGates(acc, 'anthropic')).toBe(false)
  })
})
