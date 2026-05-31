describe('feature flags', () => {
  const originalBalanceScriptEnabled = process.env.BALANCE_SCRIPT_ENABLED

  afterEach(() => {
    if (originalBalanceScriptEnabled === undefined) {
      delete process.env.BALANCE_SCRIPT_ENABLED
    } else {
      process.env.BALANCE_SCRIPT_ENABLED = originalBalanceScriptEnabled
    }
    jest.resetModules()
  })

  it('disables balance script execution by default', () => {
    delete process.env.BALANCE_SCRIPT_ENABLED

    jest.isolateModules(() => {
      const { isBalanceScriptEnabled } = require('../src/utils/featureFlags')
      expect(isBalanceScriptEnabled()).toBe(false)
    })
  })

  it('enables balance script execution only when explicitly configured', () => {
    process.env.BALANCE_SCRIPT_ENABLED = 'true'

    jest.isolateModules(() => {
      const { isBalanceScriptEnabled } = require('../src/utils/featureFlags')
      expect(isBalanceScriptEnabled()).toBe(true)
    })
  })
})
