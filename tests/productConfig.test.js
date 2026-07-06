describe('AI Gateway Pool product configuration', () => {
  const loadProductConfig = () => {
    const { execFileSync } = require('child_process')
    const path = require('path')
    const { pathToFileURL } = require('url')
    const modulePath = path.resolve(__dirname, '../web/admin-spa/src/config/productConfig.js')
    const script = `
      import { productConfig, resolveProductName } from ${JSON.stringify(pathToFileURL(modulePath).href)}
      process.stdout.write(JSON.stringify({
        ...productConfig,
        resolvedNames: {
          empty: resolveProductName(''),
          upstream: resolveProductName('Claude Relay Service'),
          openaiOnly: resolveProductName('OpenAI Key Pool'),
          custom: resolveProductName('Acme Gateway')
        }
      }))
    `

    return JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script]))
  }

  test('uses AI Gateway Pool as the default product identity', () => {
    const productConfig = loadProductConfig()

    expect(productConfig.name).toBe('AI Gateway Pool')
    expect(productConfig.adminSubtitle).toBe('企业账号池管理后台')
    expect(productConfig.defaultRoute).toBe('/dashboard')
  })

  test('maps upstream and OpenAI-only names to the enterprise pool product name', () => {
    const productConfig = loadProductConfig()

    expect(productConfig.resolvedNames).toEqual({
      empty: 'AI Gateway Pool',
      upstream: 'AI Gateway Pool',
      openaiOnly: 'AI Gateway Pool',
      custom: 'Acme Gateway'
    })
  })

  test('prioritizes gateway keys and the AI account pool in navigation', () => {
    const productConfig = loadProductConfig()

    expect(productConfig.tabs.map((tab) => tab.key)).toEqual([
      'dashboard',
      'apiKeys',
      'accounts',
      'requestDetails',
      'quotaCards'
    ])
    expect(productConfig.tabs[2].name).toBe('AI 账号池')
    expect(productConfig.primaryAccountGroups).toEqual(['group-openai', 'group-claude'])
  })

  test('limits the account pool product surface to OpenAI and Claude accounts', () => {
    const productConfig = loadProductConfig()

    expect(productConfig.supportedAccountPlatforms).toEqual([
      'openai',
      'openai-responses',
      'claude',
      'claude-console'
    ])
    expect(productConfig.supportedAccountGroups).toEqual({
      'group-openai': ['openai', 'openai-responses'],
      'group-claude': ['claude', 'claude-console']
    })
  })
})
