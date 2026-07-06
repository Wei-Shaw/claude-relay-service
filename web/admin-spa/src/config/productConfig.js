export const productConfig = {
  name: 'AI Gateway Pool',
  adminSubtitle: '企业账号池管理后台',
  publicTitle: 'OpenAI / Claude 账号池',
  defaultRoute: '/dashboard',
  accountDescription: '集中管理公司授权的 OpenAI 与 Claude 账号、组织、代理与调度状态',
  dashboardDescription: '查看账号池容量、限额窗口、请求量、Token 与成本趋势',
  primaryAccountGroups: ['group-openai', 'group-claude'],
  supportedAccountPlatforms: ['openai', 'openai-responses', 'claude', 'claude-console'],
  supportedAccountGroups: {
    'group-openai': ['openai', 'openai-responses'],
    'group-claude': ['claude', 'claude-console']
  },
  tabs: [
    { key: 'dashboard', name: '总览', shortName: '总览', icon: 'fas fa-gauge-high' },
    { key: 'apiKeys', name: '网关 Keys', shortName: 'Keys', icon: 'fas fa-key' },
    { key: 'accounts', name: 'AI 账号池', shortName: '账号池', icon: 'fas fa-layer-group' },
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
