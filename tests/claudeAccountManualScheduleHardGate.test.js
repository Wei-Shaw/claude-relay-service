// 集成回归：同一次 updateAccount 里显式手动暂停必须压过 disableAutoProtection 的自动恢复补丁。
//
// Bug: updateAccount 先按 updates 写入 schedulable='false'，随后应用
// buildAutoProtectionRecoveryPatch 时 Object.assign 无条件覆盖，把 schedulable 改回 'true'，
// 导致 { disableAutoProtection: true, schedulable: false } 的显式手动硬门失效。
// Fix: 恢复补丁不得覆盖同一请求里显式写入的 schedulable/isActive/status。
//
// 用真实 upstreamErrorHelper（不 mock），只 mock redis/logger 等外设，覆盖真实应用顺序。

const mockStore = new Map()

jest.mock('../src/models/redis', () => ({
  getClaudeAccount: jest.fn(async (id) => mockStore.get(id) || {}),
  setClaudeAccount: jest.fn(async (id, data) => {
    mockStore.set(id, { ...data })
  }),
  getClientSafe: jest.fn(() => ({
    del: jest.fn(async () => 1),
    hdel: jest.fn(async () => 1)
  })),
  client: { hdel: jest.fn(async () => 1) }
}))

jest.mock('../src/utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  success: jest.fn()
}))

jest.mock('../src/services/tokenRefreshService', () => ({}))
jest.mock('../src/utils/tokenRefreshLogger', () => ({}))
jest.mock('../src/utils/webhookNotifier', () => ({ sendAccountAnomalyNotification: jest.fn() }))
jest.mock('../src/utils/proxyHelper', () => ({}))
jest.mock('axios', () => ({}))

// 构造函数会启动 cache-cleanup 的 setInterval，unref 避免 Jest 挂住
const _realSetInterval = global.setInterval
global.setInterval = (fn, ms, ...args) => {
  const timer = _realSetInterval(fn, ms, ...args)
  if (timer && typeof timer.unref === 'function') {
    timer.unref()
  }
  return timer
}
const claudeAccountService = require('../src/services/account/claudeAccountService')
global.setInterval = _realSetInterval

const ACCOUNT_ID = 'acct-hardgate'

// 存在整账号自动停用证据（限流自动停），使恢复补丁会尝试写 schedulable='true'
const seedAutoStopped = () => {
  mockStore.clear()
  mockStore.set(ACCOUNT_ID, {
    id: ACCOUNT_ID,
    name: 'hardgate-acc',
    isActive: 'true',
    status: 'active',
    schedulable: 'false',
    rateLimitStatus: 'limited',
    rateLimitAutoStopped: 'true'
  })
}

describe('updateAccount：显式手动硬门压过自动恢复补丁', () => {
  beforeEach(() => {
    seedAutoStopped()
  })

  it('{ disableAutoProtection: true, schedulable: false } 不得被恢复补丁改回可调度', async () => {
    await claudeAccountService.updateAccount(ACCOUNT_ID, {
      disableAutoProtection: true,
      schedulable: false
    })
    const stored = mockStore.get(ACCOUNT_ID)
    // 显式手动暂停必须保留
    expect(stored.schedulable).toBe('false')
    // 开关本身已写入
    expect(stored.disableAutoProtection).toBe('true')
  })

  it('只开 disableAutoProtection（未显式传 schedulable）时仍应自动恢复调度', async () => {
    await claudeAccountService.updateAccount(ACCOUNT_ID, {
      disableAutoProtection: true
    })
    const stored = mockStore.get(ACCOUNT_ID)
    // 无显式手动硬门 → 恢复补丁生效，恢复可调度
    expect(stored.schedulable).toBe('true')
    expect(stored.status).toBe('active')
  })

  it('{ disableAutoProtection: true, isActive: false } 不得被恢复补丁改回启用', async () => {
    await claudeAccountService.updateAccount(ACCOUNT_ID, {
      disableAutoProtection: true,
      isActive: false
    })
    const stored = mockStore.get(ACCOUNT_ID)
    expect(stored.isActive).toBe('false')
  })
})
