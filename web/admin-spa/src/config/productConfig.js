export const productConfig = {
  name: 'AI Gateway Pool',
  adminSubtitle: '企业账号池管理后台',
  publicTitle: 'OpenAI / Claude 账号池',
  defaultRoute: '/dashboard',
  accountDescription: '集中管理公司授权的 OpenAI 与 Claude 账号、组织、代理与调度状态',
  dashboardDescription: '查看账号池容量、限额窗口、请求量、Token 与成本趋势',
  primaryAccountGroups: ['group-openai', 'group-claude'],
  visibleAccountPlatforms: ['openai', 'claude'],
  hiddenAccountPlatformAliases: {
    openai: ['openai', 'openai-responses'],
    claude: ['claude', 'claude-console']
  },
  supportedAccountPlatforms: ['openai', 'claude'],
  supportedAccountGroups: {
    'group-openai': ['openai'],
    'group-claude': ['claude']
  },
  accountCreationGroups: [
    {
      key: 'claude',
      name: 'Claude 账号',
      description: '接入公司授权的 Claude OAuth 或 Console API 账号',
      icon: 'fas fa-brain',
      accent: 'indigo',
      platforms: ['claude', 'claude-console']
    },
    {
      key: 'openai',
      name: 'OpenAI 账号',
      description: '接入公司授权的 OpenAI OAuth 或 API Key 账号',
      icon: 'fa-openai',
      accent: 'emerald',
      platforms: ['openai', 'openai-responses']
    }
  ],
  accountCreationAdapters: {
    claude: {
      name: 'Claude OAuth',
      description: '适合 Claude Code / OAuth 授权账号，支持使用量可视化',
      badge: 'OAuth',
      icon: 'fas fa-brain'
    },
    'claude-console': {
      name: 'Claude Console API',
      description: '适合 Console API Key、兼容代理和标准模型白名单',
      badge: 'API Key',
      icon: 'fas fa-terminal'
    },
    openai: {
      name: 'OpenAI OAuth',
      description: '适合 Codex / ChatGPT 授权账号，后续可纳入 5h / 7d 治理',
      badge: 'OAuth',
      icon: 'fa-openai'
    },
    'openai-responses': {
      name: 'OpenAI API Key',
      description: '适合 Responses / Chat Completions 兼容网关接入',
      badge: 'API Key',
      icon: 'fas fa-key'
    }
  },
  apiKeyPermissions: [
    { key: 'claude', label: 'Claude' },
    { key: 'openai', label: 'OpenAI' }
  ],
  apiKeyServiceRates: [
    { key: 'claude', label: 'Claude' },
    { key: 'openai', label: 'OpenAI' },
    { key: 'codex', label: 'Codex' }
  ],
  apiKeyAccountBindings: ['claude', 'openai'],
  tabs: [
    { key: 'dashboard', name: '总览', shortName: '总览', icon: 'fas fa-gauge-high' },
    { key: 'apiKeys', name: '网关 Keys', shortName: 'Keys', icon: 'fas fa-key' },
    { key: 'accounts', name: 'AI 账号池', shortName: '账号池', icon: 'fas fa-layer-group' },
    { key: 'accountPool', name: '池策略', shortName: '策略', icon: 'fas fa-shield-halved' },
    { key: 'requestDetails', name: '请求明细', shortName: '明细', icon: 'fas fa-table' },
    { key: 'quotaCards', name: '额度策略', shortName: '额度', icon: 'fas fa-sliders' }
  ],
  settingsTab: { key: 'settings', name: '系统设置', shortName: '设置', icon: 'fas fa-cogs' },
  userManagementTab: {
    key: 'userManagement',
    name: '用户管理',
    shortName: '用户',
    icon: 'fas fa-users'
  }
}

export const legacyProductNames = ['Claude Relay Service', 'OpenAI Key Pool']

export const resolveProductName = (siteName) => {
  if (!siteName || legacyProductNames.includes(siteName)) {
    return productConfig.name
  }

  return siteName
}
