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
    expect(productConfig.publicTitle).toBe('OpenAI / Claude 账号池')
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
      'accountPool',
      'requestDetails',
      'quotaCards'
    ])
    expect(productConfig.tabs[0].name).toBe('总览')
    expect(productConfig.tabs[2].name).toBe('AI 账号池')
    expect(productConfig.tabs[3].name).toBe('池策略')
    expect(productConfig.primaryAccountGroups).toEqual(['group-openai', 'group-claude'])
  })

  test('limits the account pool product surface to OpenAI and Claude accounts', () => {
    const productConfig = loadProductConfig()

    expect(productConfig.visibleAccountPlatforms).toEqual(['openai', 'claude'])
    expect(productConfig.supportedAccountPlatforms).toEqual(['openai', 'claude'])
    expect(productConfig.hiddenAccountPlatformAliases).toEqual({
      openai: ['openai', 'openai-responses'],
      claude: ['claude', 'claude-console']
    })
    expect(productConfig.supportedAccountGroups).toEqual({
      'group-openai': ['openai'],
      'group-claude': ['claude']
    })
    expect(productConfig.supportedAccountPlatforms).not.toEqual(
      expect.arrayContaining(['gemini', 'gemini-api', 'bedrock', 'droid', 'azure_openai'])
    )
  })

  test('exposes only OpenAI and Claude creation choices while keeping internal adapters explicit', () => {
    const productConfig = loadProductConfig()

    expect(productConfig.accountCreationGroups.map((group) => group.key)).toEqual([
      'claude',
      'openai'
    ])
    expect(productConfig.accountCreationGroups.flatMap((group) => group.platforms)).toEqual([
      'claude',
      'claude-console',
      'openai',
      'openai-responses'
    ])
    expect(productConfig.accountCreationGroups.flatMap((group) => group.platforms)).not.toEqual(
      expect.arrayContaining(['gemini', 'gemini-api', 'bedrock', 'droid', 'azure_openai', 'ccr'])
    )
  })

  test('limits API key product controls to OpenAI and Claude', () => {
    const productConfig = loadProductConfig()

    expect(productConfig.apiKeyPermissions).toEqual([
      { key: 'claude', label: 'Claude' },
      { key: 'openai', label: 'OpenAI' }
    ])
    expect(productConfig.apiKeyServiceRates).toEqual([
      { key: 'claude', label: 'Claude' },
      { key: 'openai', label: 'OpenAI' },
      { key: 'codex', label: 'Codex' }
    ])
    expect(productConfig.apiKeyAccountBindings).toEqual(['claude', 'openai'])
  })

  test('keeps product configuration Chinese copy readable', () => {
    const productConfig = loadProductConfig()
    const text = JSON.stringify(productConfig)

    expect(text).toContain('企业账号池管理后台')
    expect(text).toContain('集中管理公司授权的 OpenAI 与 Claude 账号')
    expect(text).not.toMatch(/浼|璐﹀|姹|鎬|绠|瑙|闆|鍙|�/)
  })

  test('shows account-pool policy stop reasons in the account list source', () => {
    const fs = require('fs')
    const path = require('path')
    const source = fs.readFileSync(
      path.resolve(__dirname, '../web/admin-spa/src/views/AccountsView.vue'),
      'utf8'
    )

    expect(source).toContain('accountPoolStoppedReason')
    expect(source).toContain('5h 限额已用尽')
    expect(source).toContain('7d 限额已用尽')
    expect(source).toContain('成本额度已用尽')
    expect(source).toContain('Token 额度已用尽')
    expect(source).toContain('请求数额度已用尽')
  })
})
