const inquirer = require('inquirer')
const ora = require('ora')
const { table } = require('table')

const {
  getConfigPath,
  normalizeServer,
  normalizeProfileName,
  loadAuthStore,
  saveAuthStore,
  getProfile,
  upsertProfile,
  setDefaultProfile,
  removeProfile,
  listProfileNames
} = require('./authConfig')
const {
  loginWithPassword,
  getCurrentAdmin,
  logoutAdmin,
  getWithAdminAuth,
  requestWithAdminAuth
} = require('./adminApiClient')

const REMOTE_LOGIN_HINT = 'claude-relay-cli remote auth login'

function registerRemoteCommands(program, styles) {
  const remoteCommand = program.command('remote').description('远程管理接口命令')

  const remoteAuthCommand = remoteCommand.command('auth').description('远程认证与会话管理')

  withRemoteTargetOption(
    remoteAuthCommand
      .command('login')
      .description('登录后台管理接口并保存本地凭据')
      .option('-u, --username <username>', '管理员用户名')
      .option('--use', '登录后切换为默认 profile')
  ).action((options) => loginCommand(options, styles))

  withRemoteTargetOption(
    remoteAuthCommand.command('whoami').description('查看当前远程登录状态（/web/auth/user）')
  ).action((options) => whoamiCommand(options, styles))

  withRemoteTargetOption(
    remoteAuthCommand.command('refresh').description('刷新当前远程登录会话（/web/auth/refresh）')
  ).action((options) => refreshCommand(options, styles))

  withRemoteTargetOption(
    withBodyJsonOption(
      remoteAuthCommand
        .command('change-password')
        .description('修改管理员密码（/web/auth/change-password）')
    )
  ).action(
    makeRemoteBodyAction(styles, 'post', '/web/auth/change-password', '🔐 修改管理员密码', {
      requireBodyJson: true
    })
  )

  withRemoteTargetOption(
    remoteAuthCommand.command('logout').description('退出后台管理接口并清理本地凭据')
  ).action((options) => logoutCommand(options, styles))

  withRemoteTargetOption(
    remoteCommand
      .command('login')
      .description('兼容别名：等价于 remote auth login')
      .option('-u, --username <username>', '管理员用户名')
      .option('--use', '登录后切换为默认 profile')
  ).action((options) => loginCommand(options, styles))

  withRemoteTargetOption(
    remoteCommand.command('whoami').description('兼容别名：等价于 remote auth whoami')
  ).action((options) => whoamiCommand(options, styles))

  withRemoteTargetOption(
    remoteCommand.command('refresh').description('兼容别名：等价于 remote auth refresh')
  ).action((options) => refreshCommand(options, styles))

  withRemoteTargetOption(
    remoteCommand.command('logout').description('兼容别名：等价于 remote auth logout')
  ).action((options) => logoutCommand(options, styles))

  const remoteProfileCommand = remoteCommand.command('profile').description('本地 profile 管理')

  remoteProfileCommand
    .command('list')
    .description('列出所有 profile')
    .action(() => profileListCommand(styles))
  remoteProfileCommand
    .command('show [name]')
    .description('查看 profile 详情（不传 name 时使用默认 profile）')
    .action((profileName) => profileShowCommand(profileName, styles))
  remoteProfileCommand
    .command('use <name>')
    .description('切换默认 profile')
    .action((profileName) => profileUseCommand(profileName, styles))
  remoteProfileCommand
    .command('remove <name>')
    .description('删除指定 profile')
    .action((profileName) => profileRemoveCommand(profileName, styles))

  const remoteApiKeysCommand = remoteCommand.command('api-keys').description('API Keys 管理与查询')

  withRemoteTargetOption(
    remoteApiKeysCommand
      .command('list')
      .description('获取 API Keys 列表（/admin/api-keys）')
      .option('--time-range <timeRange>', '时间范围: all|today|7days|monthly')
  ).action((options) => remoteApiKeysListCommand(options, styles))

  withRemoteTargetOption(
    remoteApiKeysCommand.command('tags').description('获取 API Keys 标签（/admin/api-keys/tags）')
  ).action((options) => remoteApiKeysTagsCommand(options, styles))

  withRemoteTargetOption(
    remoteApiKeysCommand
      .command('cost-debug')
      .description('获取指定 API Key 的费用调试信息')
      .requiredOption('--key-id <keyId>', 'API Key ID')
  ).action((options) => remoteApiKeysCostDebugCommand(options, styles))

  withRemoteTargetOption(
    remoteApiKeysCommand
      .command('model-stats')
      .description('获取指定 API Key 的模型统计')
      .requiredOption('--key-id <keyId>', 'API Key ID')
      .option('--period <period>', '统计周期: daily|monthly|custom')
      .option('--start-date <startDate>', '起始日期/时间（ISO 格式）')
      .option('--end-date <endDate>', '结束日期/时间（ISO 格式）')
  ).action((options) => remoteApiKeysModelStatsCommand(options, styles))

  withRemoteTargetOption(
    remoteApiKeysCommand
      .command('usage-trend')
      .description('获取 API Keys 使用趋势')
      .option('--granularity <granularity>', '粒度: day|hour')
      .option('--days <days>', '天粒度时的天数')
      .option('--start-date <startDate>', '起始日期/时间（ISO 格式）')
      .option('--end-date <endDate>', '结束日期/时间（ISO 格式）')
  ).action((options) => remoteApiKeysUsageTrendCommand(options, styles))

  withRemoteTargetOption(
    withBodyJsonOption(remoteApiKeysCommand.command('create').description('创建 API Key'))
  ).action(
    makeRemoteBodyAction(styles, 'post', '/admin/api-keys', '🔑 创建 API Key', {
      requireBodyJson: true
    })
  )

  withRemoteTargetOption(
    withBodyJsonOption(remoteApiKeysCommand.command('batch').description('批量创建 API Key'))
  ).action(
    makeRemoteBodyAction(styles, 'post', '/admin/api-keys/batch', '🔑 批量创建 API Key', {
      requireBodyJson: true
    })
  )

  withRemoteTargetOption(
    withBodyJsonOption(remoteApiKeysCommand.command('update <keyId>').description('更新 API Key'))
  ).action(
    makeRemoteBodyAction(
      styles,
      'put',
      (keyId) => `/admin/api-keys/${encodeURIComponent(keyId)}`,
      (keyId) => `🔑 更新 API Key (${keyId})`,
      { requireBodyJson: true }
    )
  )

  withRemoteTargetOption(
    remoteApiKeysCommand.command('delete <keyId>').description('删除 API Key')
  ).action(
    makeRemoteBodyAction(
      styles,
      'delete',
      (keyId) => `/admin/api-keys/${encodeURIComponent(keyId)}`,
      (keyId) => `🗑️ 删除 API Key (${keyId})`
    )
  )

  const remoteStatsCommand = remoteCommand.command('stats').description('系统统计查询')

  withRemoteTargetOption(remoteStatsCommand.command('dashboard').description('系统概览')).action(
    (options) => remoteStatsDashboardCommand(options, styles)
  )
  withRemoteTargetOption(
    remoteStatsCommand
      .command('usage')
      .description('使用统计')
      .option('--period <period>', '统计周期，默认 daily')
  ).action((options) => remoteStatsUsageCommand(options, styles))
  withRemoteTargetOption(
    remoteStatsCommand
      .command('model-stats')
      .description('全局模型统计')
      .option('--period <period>', '统计周期: daily|monthly')
      .option('--start-date <startDate>', '起始日期/时间（ISO 格式）')
      .option('--end-date <endDate>', '结束日期/时间（ISO 格式）')
  ).action((options) => remoteStatsModelStatsCommand(options, styles))
  withRemoteTargetOption(
    remoteStatsCommand
      .command('usage-trend')
      .description('全局使用趋势')
      .option('--granularity <granularity>', '粒度: day|hour')
      .option('--days <days>', '天粒度时的天数')
      .option('--start-date <startDate>', '起始日期/时间（ISO 格式）')
      .option('--end-date <endDate>', '结束日期/时间（ISO 格式）')
  ).action((options) => remoteStatsUsageTrendCommand(options, styles))
  withRemoteTargetOption(
    remoteStatsCommand
      .command('usage-costs')
      .description('使用费用统计')
      .option('--period <period>', '统计周期: all|today|monthly|7days')
  ).action((options) => remoteStatsUsageCostsCommand(options, styles))

  const remoteSystemCommand = remoteCommand.command('system').description('系统配置与状态查询')

  withRemoteTargetOption(
    remoteSystemCommand.command('supported-clients').description('支持的客户端')
  ).action((options) => remoteSystemSupportedClientsCommand(options, styles))
  withRemoteTargetOption(
    remoteSystemCommand.command('webhook-config').description('Webhook 配置')
  ).action((options) => remoteSystemWebhookConfigCommand(options, styles))
  withRemoteTargetOption(
    remoteSystemCommand
      .command('check-updates')
      .description('检查版本更新')
      .option('--force', '强制跳过缓存检查')
  ).action((options) => remoteSystemCheckUpdatesCommand(options, styles))
  withRemoteTargetOption(
    remoteSystemCommand.command('claude-code-headers').description('Claude Code headers 信息')
  ).action((options) => remoteSystemClaudeCodeHeadersCommand(options, styles))
  withRemoteTargetOption(
    remoteSystemCommand.command('oem-settings').description('OEM 设置')
  ).action((options) => remoteSystemOemSettingsCommand(options, styles))
  withRemoteTargetOption(
    withBodyJsonOption(remoteSystemCommand.command('update-oem').description('更新 OEM 设置'))
  ).action(
    makeRemoteBodyAction(styles, 'put', '/admin/oem-settings', '🎨 更新 OEM 设置', {
      requireBodyJson: true
    })
  )

  const remoteGroupsCommand = remoteCommand.command('groups').description('分组管理命令')

  withRemoteTargetOption(
    remoteGroupsCommand
      .command('list')
      .description('查询分组列表')
      .option('--platform <platform>', '按平台筛选分组')
  ).action((options) => remoteGroupsListCommand(options, styles))
  withRemoteTargetOption(
    remoteGroupsCommand.command('get <groupId>').description('查询分组详情')
  ).action((groupId, options) => remoteGroupGetCommand(groupId, options, styles))
  withRemoteTargetOption(
    remoteGroupsCommand.command('members <groupId>').description('查询分组成员')
  ).action((groupId, options) => remoteGroupMembersCommand(groupId, options, styles))
  withRemoteTargetOption(
    withBodyJsonOption(remoteGroupsCommand.command('create').description('创建分组'))
  ).action(
    makeRemoteBodyAction(styles, 'post', '/admin/account-groups', '👥 创建分组', {
      requireBodyJson: true
    })
  )
  withRemoteTargetOption(
    withBodyJsonOption(remoteGroupsCommand.command('update <groupId>').description('更新分组'))
  ).action(
    makeRemoteBodyAction(
      styles,
      'put',
      (groupId) => `/admin/account-groups/${encodeURIComponent(groupId)}`,
      (groupId) => `👥 更新分组 (${groupId})`,
      { requireBodyJson: true }
    )
  )
  withRemoteTargetOption(
    remoteGroupsCommand.command('delete <groupId>').description('删除分组')
  ).action(
    makeRemoteBodyAction(
      styles,
      'delete',
      (groupId) => `/admin/account-groups/${encodeURIComponent(groupId)}`,
      (groupId) => `🗑️ 删除分组 (${groupId})`
    )
  )

  const remoteAccountsCommand = remoteCommand.command('accounts').description('账户查询命令')

  withRemoteTargetOption(
    remoteAccountsCommand
      .command('usage')
      .description('查询账户使用统计（全部或单账户）')
      .option('--account-id <accountId>', '指定单个账户 ID')
  ).action((options) => remoteAccountsUsageCommand(options, styles))

  Object.keys(remoteAccountListEndpoints).forEach((provider) => {
    const providerCommand = remoteAccountsCommand
      .command(provider)
      .description(`${provider} 账户查询命令`)
    withRemoteTargetOption(
      providerCommand
        .command('list')
        .description(`查询 ${provider} 账户列表`)
        .option('--platform <platform>', '平台筛选（可选）')
        .option('--group-id <groupId>', '分组筛选（可选）')
    ).action((options) => remoteAccountsProviderListCommand(provider, options, styles))
  })

  const remoteOauthCommand = remoteCommand.command('oauth').description('OAuth 授权辅助命令')
  const remoteOauthClaudeCommand = remoteOauthCommand
    .command('claude')
    .description('Claude OAuth 辅助命令')
  withRemoteTargetOption(
    remoteOauthClaudeCommand
      .command('generate-auth-url')
      .description('生成 Claude OAuth 授权链接')
      .option('--proxy-json <json>', '可选代理配置 JSON')
  ).action((options) => remoteClaudeGenerateAuthUrlCommand(options, styles))
  withRemoteTargetOption(
    remoteOauthClaudeCommand
      .command('generate-setup-token-url')
      .description('生成 Claude Setup Token 授权链接')
      .option('--proxy-json <json>', '可选代理配置 JSON')
  ).action((options) => remoteClaudeGenerateSetupTokenUrlCommand(options, styles))

  const remoteOauthGeminiCommand = remoteOauthCommand
    .command('gemini')
    .description('Gemini OAuth 辅助命令')
  withRemoteTargetOption(
    remoteOauthGeminiCommand
      .command('generate-auth-url')
      .description('生成 Gemini OAuth 授权链接')
      .option('--state <state>', '可选 state')
  ).action((options) => remoteGeminiGenerateAuthUrlCommand(options, styles))
  withRemoteTargetOption(
    remoteOauthGeminiCommand
      .command('poll-auth-status')
      .description('轮询 Gemini OAuth 授权状态')
      .requiredOption('--session-id <sessionId>', 'OAuth session ID')
  ).action((options) => remoteGeminiPollAuthStatusCommand(options, styles))

  const remoteOauthOpenaiCommand = remoteOauthCommand
    .command('openai')
    .description('OpenAI OAuth 辅助命令')
  withRemoteTargetOption(
    remoteOauthOpenaiCommand
      .command('generate-auth-url')
      .description('生成 OpenAI OAuth 授权链接')
      .option('--proxy-json <json>', '可选代理配置 JSON')
  ).action((options) => remoteOpenaiGenerateAuthUrlCommand(options, styles))

  const remoteClaudeCommand = remoteCommand.command('claude').description('Claude 账户管理命令')
  withRemoteTargetOption(
    remoteClaudeCommand.command('list').description('查询 Claude 账户列表')
  ).action((options) =>
    executeRemoteGet(options, '/admin/claude-accounts', '🏢 Claude 账户列表', null, styles)
  )
  withRemoteTargetOption(
    withBodyJsonOption(remoteClaudeCommand.command('create').description('创建 Claude 账户'))
  ).action(
    makeRemoteBodyAction(styles, 'post', '/admin/claude-accounts', '🏢 创建 Claude 账户', {
      requireBodyJson: true
    })
  )
  withRemoteTargetOption(
    withBodyJsonOption(
      remoteClaudeCommand.command('update <accountId>').description('更新 Claude 账户')
    )
  ).action(
    makeRemoteBodyAction(
      styles,
      'put',
      (accountId) => `/admin/claude-accounts/${encodeURIComponent(accountId)}`,
      (accountId) => `🏢 更新 Claude 账户 (${accountId})`,
      { requireBodyJson: true }
    )
  )
  withRemoteTargetOption(
    remoteClaudeCommand.command('delete <accountId>').description('删除 Claude 账户')
  ).action(
    makeRemoteBodyAction(
      styles,
      'delete',
      (accountId) => `/admin/claude-accounts/${encodeURIComponent(accountId)}`,
      (accountId) => `🗑️ 删除 Claude 账户 (${accountId})`
    )
  )
  withRemoteTargetOption(
    withBodyJsonOption(
      remoteClaudeCommand
        .command('update-profile <accountId>')
        .description('更新 Claude 账户 profile')
    )
  ).action(
    makeRemoteBodyAction(
      styles,
      'post',
      (accountId) => `/admin/claude-accounts/${encodeURIComponent(accountId)}/update-profile`,
      (accountId) => `🔄 更新 Claude 账户 Profile (${accountId})`,
      { requireBodyJson: true }
    )
  )
  withRemoteTargetOption(
    withBodyJsonOption(
      remoteClaudeCommand.command('update-all-profiles').description('批量更新 Claude 账户 profile')
    )
  ).action(
    makeRemoteBodyAction(
      styles,
      'post',
      '/admin/claude-accounts/update-all-profiles',
      '🔄 批量更新 Claude Profile'
    )
  )
  withRemoteTargetOption(
    remoteClaudeCommand.command('refresh <accountId>').description('刷新 Claude 账户 token')
  ).action(
    makeRemoteBodyAction(
      styles,
      'post',
      (accountId) => `/admin/claude-accounts/${encodeURIComponent(accountId)}/refresh`,
      (accountId) => `🔄 刷新 Claude 账户 (${accountId})`
    )
  )
  withRemoteTargetOption(
    remoteClaudeCommand.command('reset-status <accountId>').description('重置 Claude 账户状态')
  ).action(
    makeRemoteBodyAction(
      styles,
      'post',
      (accountId) => `/admin/claude-accounts/${encodeURIComponent(accountId)}/reset-status`,
      (accountId) => `🔄 重置 Claude 账户状态 (${accountId})`
    )
  )
  withRemoteTargetOption(
    remoteClaudeCommand
      .command('toggle-schedulable <accountId>')
      .description('切换 Claude 账户调度状态')
  ).action(
    makeRemoteBodyAction(
      styles,
      'put',
      (accountId) => `/admin/claude-accounts/${encodeURIComponent(accountId)}/toggle-schedulable`,
      (accountId) => `🔄 切换 Claude 调度状态 (${accountId})`
    )
  )
  withRemoteTargetOption(
    remoteClaudeCommand
      .command('exchange-code')
      .description('交换 Claude OAuth 授权码')
      .requiredOption('--session-id <sessionId>', 'OAuth session ID')
      .option('--authorization-code <code>', '授权码')
      .option('--callback-url <url>', '回调 URL')
  ).action(
    makeRemoteBodyAction(
      styles,
      'post',
      '/admin/claude-accounts/exchange-code',
      '🔐 Claude OAuth 交换授权码',
      {
        bodyBuilder: (options) => ({
          sessionId: options.sessionId,
          authorizationCode: options.authorizationCode,
          callbackUrl: options.callbackUrl
        })
      }
    )
  )
  withRemoteTargetOption(
    remoteClaudeCommand
      .command('exchange-setup-token-code')
      .description('交换 Claude Setup Token 授权码')
      .requiredOption('--session-id <sessionId>', 'OAuth session ID')
      .option('--authorization-code <code>', '授权码')
      .option('--callback-url <url>', '回调 URL')
  ).action(
    makeRemoteBodyAction(
      styles,
      'post',
      '/admin/claude-accounts/exchange-setup-token-code',
      '🔐 Claude Setup Token 交换授权码',
      {
        bodyBuilder: (options) => ({
          sessionId: options.sessionId,
          authorizationCode: options.authorizationCode,
          callbackUrl: options.callbackUrl
        })
      }
    )
  )

  const remoteClaudeConsoleCommand = remoteCommand
    .command('claude-console')
    .description('Claude Console 账户管理命令')
  withRemoteTargetOption(
    remoteClaudeConsoleCommand.command('list').description('查询 Claude Console 账户列表')
  ).action((options) =>
    executeRemoteGet(
      options,
      '/admin/claude-console-accounts',
      '🏢 Claude Console 账户列表',
      null,
      styles
    )
  )
  withRemoteTargetOption(
    withBodyJsonOption(
      remoteClaudeConsoleCommand.command('create').description('创建 Claude Console 账户')
    )
  ).action(
    makeRemoteBodyAction(
      styles,
      'post',
      '/admin/claude-console-accounts',
      '🏢 创建 Claude Console 账户',
      { requireBodyJson: true }
    )
  )
  withRemoteTargetOption(
    withBodyJsonOption(
      remoteClaudeConsoleCommand
        .command('update <accountId>')
        .description('更新 Claude Console 账户')
    )
  ).action(
    makeRemoteBodyAction(
      styles,
      'put',
      (accountId) => `/admin/claude-console-accounts/${encodeURIComponent(accountId)}`,
      (accountId) => `🏢 更新 Claude Console 账户 (${accountId})`,
      { requireBodyJson: true }
    )
  )
  withRemoteTargetOption(
    remoteClaudeConsoleCommand.command('delete <accountId>').description('删除 Claude Console 账户')
  ).action(
    makeRemoteBodyAction(
      styles,
      'delete',
      (accountId) => `/admin/claude-console-accounts/${encodeURIComponent(accountId)}`,
      (accountId) => `🗑️ 删除 Claude Console 账户 (${accountId})`
    )
  )
  withRemoteTargetOption(
    remoteClaudeConsoleCommand
      .command('toggle <accountId>')
      .description('切换 Claude Console 账户状态')
  ).action(
    makeRemoteBodyAction(
      styles,
      'put',
      (accountId) => `/admin/claude-console-accounts/${encodeURIComponent(accountId)}/toggle`,
      (accountId) => `🔄 切换 Claude Console 状态 (${accountId})`
    )
  )
  withRemoteTargetOption(
    remoteClaudeConsoleCommand
      .command('toggle-schedulable <accountId>')
      .description('切换 Claude Console 调度状态')
  ).action(
    makeRemoteBodyAction(
      styles,
      'put',
      (accountId) =>
        `/admin/claude-console-accounts/${encodeURIComponent(accountId)}/toggle-schedulable`,
      (accountId) => `🔄 切换 Claude Console 调度状态 (${accountId})`
    )
  )

  const remoteBedrockCommand = remoteCommand.command('bedrock').description('Bedrock 账户管理命令')
  withRemoteTargetOption(
    remoteBedrockCommand.command('list').description('查询 Bedrock 账户列表')
  ).action((options) =>
    executeRemoteGet(options, '/admin/bedrock-accounts', '🏢 Bedrock 账户列表', null, styles)
  )
  withRemoteTargetOption(
    withBodyJsonOption(remoteBedrockCommand.command('create').description('创建 Bedrock 账户'))
  ).action(
    makeRemoteBodyAction(styles, 'post', '/admin/bedrock-accounts', '🏢 创建 Bedrock 账户', {
      requireBodyJson: true
    })
  )
  withRemoteTargetOption(
    withBodyJsonOption(
      remoteBedrockCommand.command('update <accountId>').description('更新 Bedrock 账户')
    )
  ).action(
    makeRemoteBodyAction(
      styles,
      'put',
      (accountId) => `/admin/bedrock-accounts/${encodeURIComponent(accountId)}`,
      (accountId) => `🏢 更新 Bedrock 账户 (${accountId})`,
      { requireBodyJson: true }
    )
  )
  withRemoteTargetOption(
    remoteBedrockCommand.command('delete <accountId>').description('删除 Bedrock 账户')
  ).action(
    makeRemoteBodyAction(
      styles,
      'delete',
      (accountId) => `/admin/bedrock-accounts/${encodeURIComponent(accountId)}`,
      (accountId) => `🗑️ 删除 Bedrock 账户 (${accountId})`
    )
  )
  withRemoteTargetOption(
    remoteBedrockCommand.command('toggle <accountId>').description('切换 Bedrock 账户状态')
  ).action(
    makeRemoteBodyAction(
      styles,
      'put',
      (accountId) => `/admin/bedrock-accounts/${encodeURIComponent(accountId)}/toggle`,
      (accountId) => `🔄 切换 Bedrock 状态 (${accountId})`
    )
  )
  withRemoteTargetOption(
    remoteBedrockCommand
      .command('toggle-schedulable <accountId>')
      .description('切换 Bedrock 调度状态')
  ).action(
    makeRemoteBodyAction(
      styles,
      'put',
      (accountId) => `/admin/bedrock-accounts/${encodeURIComponent(accountId)}/toggle-schedulable`,
      (accountId) => `🔄 切换 Bedrock 调度状态 (${accountId})`
    )
  )
  withRemoteTargetOption(
    remoteBedrockCommand.command('test <accountId>').description('测试 Bedrock 账户连接')
  ).action(
    makeRemoteBodyAction(
      styles,
      'post',
      (accountId) => `/admin/bedrock-accounts/${encodeURIComponent(accountId)}/test`,
      (accountId) => `🧪 测试 Bedrock 账户 (${accountId})`
    )
  )

  const remoteGeminiCommand = remoteCommand.command('gemini').description('Gemini 账户管理命令')
  withRemoteTargetOption(
    remoteGeminiCommand.command('list').description('查询 Gemini 账户列表')
  ).action((options) =>
    executeRemoteGet(options, '/admin/gemini-accounts', '🏢 Gemini 账户列表', null, styles)
  )
  withRemoteTargetOption(
    withBodyJsonOption(remoteGeminiCommand.command('create').description('创建 Gemini 账户'))
  ).action(
    makeRemoteBodyAction(styles, 'post', '/admin/gemini-accounts', '🏢 创建 Gemini 账户', {
      requireBodyJson: true
    })
  )
  withRemoteTargetOption(
    withBodyJsonOption(
      remoteGeminiCommand.command('update <accountId>').description('更新 Gemini 账户')
    )
  ).action(
    makeRemoteBodyAction(
      styles,
      'put',
      (accountId) => `/admin/gemini-accounts/${encodeURIComponent(accountId)}`,
      (accountId) => `🏢 更新 Gemini 账户 (${accountId})`,
      { requireBodyJson: true }
    )
  )
  withRemoteTargetOption(
    remoteGeminiCommand.command('delete <accountId>').description('删除 Gemini 账户')
  ).action(
    makeRemoteBodyAction(
      styles,
      'delete',
      (accountId) => `/admin/gemini-accounts/${encodeURIComponent(accountId)}`,
      (accountId) => `🗑️ 删除 Gemini 账户 (${accountId})`
    )
  )
  withRemoteTargetOption(
    remoteGeminiCommand.command('refresh <accountId>').description('刷新 Gemini 账户 token')
  ).action(
    makeRemoteBodyAction(
      styles,
      'post',
      (accountId) => `/admin/gemini-accounts/${encodeURIComponent(accountId)}/refresh`,
      (accountId) => `🔄 刷新 Gemini 账户 (${accountId})`
    )
  )
  withRemoteTargetOption(
    remoteGeminiCommand
      .command('toggle-schedulable <accountId>')
      .description('切换 Gemini 调度状态')
  ).action(
    makeRemoteBodyAction(
      styles,
      'put',
      (accountId) => `/admin/gemini-accounts/${encodeURIComponent(accountId)}/toggle-schedulable`,
      (accountId) => `🔄 切换 Gemini 调度状态 (${accountId})`
    )
  )
  withRemoteTargetOption(
    remoteGeminiCommand
      .command('exchange-code')
      .description('交换 Gemini OAuth 授权码')
      .requiredOption('--code <code>', '授权码')
      .option('--session-id <sessionId>', 'OAuth session ID')
  ).action(
    makeRemoteBodyAction(
      styles,
      'post',
      '/admin/gemini-accounts/exchange-code',
      '🔐 Gemini OAuth 交换授权码',
      {
        bodyBuilder: (options) => ({
          code: options.code,
          sessionId: options.sessionId
        })
      }
    )
  )

  const remoteOpenaiCommand = remoteCommand.command('openai').description('OpenAI 账户管理命令')
  withRemoteTargetOption(
    remoteOpenaiCommand.command('list').description('查询 OpenAI 账户列表')
  ).action((options) =>
    executeRemoteGet(options, '/admin/openai-accounts', '🏢 OpenAI 账户列表', null, styles)
  )
  withRemoteTargetOption(
    withBodyJsonOption(remoteOpenaiCommand.command('create').description('创建 OpenAI 账户'))
  ).action(
    makeRemoteBodyAction(styles, 'post', '/admin/openai-accounts', '🏢 创建 OpenAI 账户', {
      requireBodyJson: true
    })
  )
  withRemoteTargetOption(
    withBodyJsonOption(
      remoteOpenaiCommand.command('update <accountId>').description('更新 OpenAI 账户')
    )
  ).action(
    makeRemoteBodyAction(
      styles,
      'put',
      (accountId) => `/admin/openai-accounts/${encodeURIComponent(accountId)}`,
      (accountId) => `🏢 更新 OpenAI 账户 (${accountId})`,
      { requireBodyJson: true }
    )
  )
  withRemoteTargetOption(
    remoteOpenaiCommand.command('delete <accountId>').description('删除 OpenAI 账户')
  ).action(
    makeRemoteBodyAction(
      styles,
      'delete',
      (accountId) => `/admin/openai-accounts/${encodeURIComponent(accountId)}`,
      (accountId) => `🗑️ 删除 OpenAI 账户 (${accountId})`
    )
  )
  withRemoteTargetOption(
    remoteOpenaiCommand.command('toggle <accountId>').description('切换 OpenAI 账户状态')
  ).action(
    makeRemoteBodyAction(
      styles,
      'put',
      (accountId) => `/admin/openai-accounts/${encodeURIComponent(accountId)}/toggle`,
      (accountId) => `🔄 切换 OpenAI 状态 (${accountId})`
    )
  )
  withRemoteTargetOption(
    remoteOpenaiCommand
      .command('toggle-schedulable <accountId>')
      .description('切换 OpenAI 调度状态')
  ).action(
    makeRemoteBodyAction(
      styles,
      'put',
      (accountId) => `/admin/openai-accounts/${encodeURIComponent(accountId)}/toggle-schedulable`,
      (accountId) => `🔄 切换 OpenAI 调度状态 (${accountId})`
    )
  )
  withRemoteTargetOption(
    remoteOpenaiCommand
      .command('exchange-code')
      .description('交换 OpenAI OAuth 授权码')
      .requiredOption('--code <code>', '授权码')
      .requiredOption('--session-id <sessionId>', 'OAuth session ID')
  ).action(
    makeRemoteBodyAction(
      styles,
      'post',
      '/admin/openai-accounts/exchange-code',
      '🔐 OpenAI OAuth 交换授权码',
      {
        bodyBuilder: (options) => ({
          code: options.code,
          sessionId: options.sessionId
        })
      }
    )
  )

  const remoteHeadersCommand = remoteCommand.command('headers').description('Header 相关管理命令')
  withRemoteTargetOption(
    remoteHeadersCommand.command('list').description('列出 Claude Code headers')
  ).action((options) =>
    executeRemoteGet(options, '/admin/claude-code-headers', '📋 Claude Code Headers', null, styles)
  )
  withRemoteTargetOption(
    remoteHeadersCommand
      .command('delete <accountId>')
      .description('删除指定账号的 Claude Code headers')
  ).action(
    makeRemoteBodyAction(
      styles,
      'delete',
      (accountId) => `/admin/claude-code-headers/${encodeURIComponent(accountId)}`,
      (accountId) => `🗑️ 删除 Claude Code Headers (${accountId})`
    )
  )

  const remoteMaintenanceCommand = remoteCommand.command('maintenance').description('维护命令')
  withRemoteTargetOption(
    remoteMaintenanceCommand.command('cleanup').description('执行系统清理（/admin/cleanup）')
  ).action(makeRemoteBodyAction(styles, 'post', '/admin/cleanup', '🧹 系统清理'))
}

const remoteAccountListEndpoints = {
  claude: '/admin/claude-accounts',
  'claude-console': '/admin/claude-console-accounts',
  bedrock: '/admin/bedrock-accounts',
  gemini: '/admin/gemini-accounts',
  openai: '/admin/openai-accounts'
}

function resolveRemoteContext(options = {}, settings = {}) {
  const { requireToken = true } = settings
  const store = loadAuthStore()
  let targetProfileName = ''
  let profile = null
  try {
    const resolved = getProfile(store, options.profile)
    targetProfileName = resolved.profileName
    ;({ profile } = resolved)
  } catch (error) {
    const fallbackProfileName = options.profile
      ? normalizeProfileName(options.profile)
      : store.defaultProfile || 'default'
    throw new Error(
      `profile 不存在: ${fallbackProfileName}，请先执行: ${REMOTE_LOGIN_HINT} --profile ${fallbackProfileName}`
    )
  }

  const server = normalizeServer(options.server || profile.server)
  const token = profile.token || ''
  if (requireToken && !token) {
    throw new Error(
      `profile "${targetProfileName}" 未登录，请先执行: ${REMOTE_LOGIN_HINT} --profile ${targetProfileName}`
    )
  }

  return {
    store,
    profileName: targetProfileName,
    profile,
    server,
    token,
    allowPersistToken: !options.server
  }
}

function persistProfileToken(context, token) {
  if (!token || !context.allowPersistToken) {
    return
  }
  upsertProfile(context.store, context.profileName, { token })
  saveAuthStore(context.store)
}

async function loginCommand(options, styles) {
  const store = loadAuthStore()
  const targetProfileName = options.profile
    ? normalizeProfileName(options.profile)
    : getProfile(store).profileName

  if (!store.profiles[targetProfileName]) {
    upsertProfile(store, targetProfileName, {})
  }
  const { profile } = getProfile(store, targetProfileName)
  const server = normalizeServer(options.server || profile.server)

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'username',
      message: '管理员用户名:',
      default: options.username || profile.username || 'admin',
      validate: (input) => (input && input.trim() ? true : '用户名不能为空')
    },
    {
      type: 'password',
      name: 'password',
      message: '管理员密码:',
      mask: '*',
      validate: (input) => (input && input.trim() ? true : '密码不能为空')
    }
  ])

  const spinner = ora(`正在登录 ${server} ...`).start()
  try {
    const result = await loginWithPassword(server, answers.username.trim(), answers.password)
    upsertProfile(store, targetProfileName, {
      server,
      token: result.token,
      username: result.username || answers.username.trim()
    })
    if (options.use) {
      setDefaultProfile(store, targetProfileName)
    }
    saveAuthStore(store)
    spinner.succeed('登录成功')
    console.log(`${styles.success('✅')} 当前服务: ${server}`)
    console.log(`${styles.success('✅')} 用户: ${result.username || answers.username.trim()}`)
    console.log(`${styles.success('✅')} Profile: ${targetProfileName}`)
    console.log(`${styles.info('ℹ️')} 凭据文件: ${getConfigPath()}`)
  } catch (error) {
    spinner.fail('登录失败')
    console.error(styles.error(error.message))
    process.exitCode = 1
  }
}

async function whoamiCommand(options, styles) {
  let context
  try {
    context = resolveRemoteContext(options, { requireToken: true })
  } catch (error) {
    console.error(styles.error(error.message))
    process.exitCode = 1
    return
  }

  const spinner = ora(`正在查询 ${context.server} 当前登录用户...`).start()
  try {
    const result = await getCurrentAdmin(context.server, context.token, { tryRefresh: true })
    persistProfileToken(context, result.refreshedToken)

    spinner.succeed('查询成功')
    console.log(styles.title('\n👤 当前登录信息\n'))
    console.log(`Profile: ${styles.info(context.profileName)}`)
    console.log(`服务地址: ${styles.info(context.server)}`)
    console.log(
      `用户名: ${styles.success(result.user?.username || context.profile.username || '-')}`
    )
    console.log(`登录时间: ${result.user?.loginTime || '-'}`)
    console.log(`最近活动: ${result.user?.lastActivity || '-'}`)
  } catch (error) {
    spinner.fail('查询失败')
    console.error(styles.error(error.message))
    process.exitCode = 1
  }
}

async function logoutCommand(options, styles) {
  let context
  try {
    context = resolveRemoteContext(options, { requireToken: false })
  } catch (error) {
    console.error(styles.error(error.message))
    process.exitCode = 1
    return
  }

  if (!context.token) {
    console.log(styles.info(`profile "${context.profileName}" 当前没有已登录会话`))
    return
  }

  const spinner = ora(`正在退出 ${context.server} ...`).start()
  try {
    await logoutAdmin(context.server, context.token)
    upsertProfile(context.store, context.profileName, { token: '' })
    saveAuthStore(context.store)
    spinner.succeed('退出成功')
    console.log(styles.info(`已清理本地凭据: ${getConfigPath()}`))
  } catch (error) {
    upsertProfile(context.store, context.profileName, { token: '' })
    saveAuthStore(context.store)
    spinner.warn('服务端登出失败，已清理本地凭据')
    console.error(styles.warning(error.message))
  }
}

async function refreshCommand(options, styles) {
  let context
  try {
    context = resolveRemoteContext(options, { requireToken: true })
  } catch (error) {
    console.error(styles.error(error.message))
    process.exitCode = 1
    return
  }

  const spinner = ora(`正在刷新 ${context.server} 登录会话...`).start()
  try {
    const result = await requestWithAdminAuth(
      context.server,
      context.token,
      'post',
      '/web/auth/refresh',
      {
        body: {},
        tryRefresh: false
      }
    )
    const refreshedToken = result.data?.token || context.token
    persistProfileToken(context, refreshedToken)

    spinner.succeed('刷新成功')
    console.log(styles.title('\n🔄 会话刷新结果\n'))
    console.log(`Profile: ${styles.info(context.profileName)}`)
    console.log(`服务地址: ${styles.info(context.server)}`)
    console.log(`Token: ${refreshedToken === context.token ? '复用原 token' : '已更新 token'}`)
    console.log(`过期时间(ms): ${result.data?.expiresIn || '-'}`)
  } catch (error) {
    spinner.fail('刷新失败')
    console.error(styles.error(error.message))
    process.exitCode = 1
  }
}

function profileListCommand(styles) {
  const store = loadAuthStore()
  const names = listProfileNames(store)
  const tableData = [['Profile', '默认', 'Server', 'Username', 'Token']]

  names.forEach((name) => {
    const profile = store.profiles[name]
    tableData.push([
      name,
      name === store.defaultProfile ? '是' : '',
      profile.server || '-',
      profile.username || '-',
      profile.token ? '已登录' : '未登录'
    ])
  })

  console.log(styles.title('\n🗂️ Profiles\n'))
  console.log(table(tableData))
}

function profileShowCommand(profileName, styles) {
  const store = loadAuthStore()
  let resolved
  try {
    resolved = getProfile(store, profileName)
  } catch (error) {
    console.error(styles.error(error.message))
    process.exitCode = 1
    return
  }

  console.log(styles.title('\n🗂️ Profile 详情\n'))
  console.log(`名称: ${styles.info(resolved.profileName)}`)
  console.log(`是否默认: ${resolved.profileName === store.defaultProfile ? '是' : '否'}`)
  console.log(`服务地址: ${resolved.profile.server || '-'}`)
  console.log(`用户名: ${resolved.profile.username || '-'}`)
  console.log(`Token: ${resolved.profile.token ? '已登录' : '未登录'}`)
}

function profileUseCommand(profileName, styles) {
  const store = loadAuthStore()
  try {
    setDefaultProfile(store, profileName)
    saveAuthStore(store)
  } catch (error) {
    console.error(styles.error(error.message))
    process.exitCode = 1
    return
  }

  console.log(styles.success(`✅ 已切换默认 profile: ${profileName}`))
}

function profileRemoveCommand(profileName, styles) {
  const store = loadAuthStore()
  try {
    removeProfile(store, profileName)
    saveAuthStore(store)
  } catch (error) {
    console.error(styles.error(error.message))
    process.exitCode = 1
    return
  }

  console.log(styles.success(`✅ 已删除 profile: ${profileName}`))
  console.log(styles.info(`当前默认 profile: ${store.defaultProfile}`))
}

function toRemoteQuery(filters) {
  const query = {}
  Object.keys(filters).forEach((key) => {
    const value = filters[key]
    if (value !== undefined && value !== null && value !== '') {
      query[key] = value
    }
  })
  return query
}

function withRemoteTargetOption(command) {
  return command
    .option('-s, --server <url>', '后台服务地址（默认使用当前 profile）')
    .option('-p, --profile <name>', 'profile 名称（默认使用当前默认 profile）')
}

function withBodyJsonOption(command, description = '请求体 JSON') {
  return command.option('--body-json <json>', description)
}

function toPositiveIntOption(value, optionName) {
  if (value === undefined || value === null || value === '') {
    return undefined
  }

  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${optionName} 必须是正整数`)
  }

  return parsed
}

function parseOptionalJson(input, optionName) {
  if (!input) {
    return undefined
  }

  try {
    return JSON.parse(input)
  } catch (error) {
    throw new Error(`${optionName} 必须是合法 JSON: ${error.message}`)
  }
}

function parseRequiredJson(input, optionName) {
  if (!input) {
    throw new Error(`${optionName} 不能为空`)
  }

  return parseOptionalJson(input, optionName)
}

async function executeRemoteGet(options, apiPath, title, query, styles) {
  let context
  try {
    context = resolveRemoteContext(options, { requireToken: true })
  } catch (error) {
    console.error(styles.error(error.message))
    process.exitCode = 1
    return
  }

  const spinner = ora(`正在请求 ${apiPath} ...`).start()
  try {
    const result = await getWithAdminAuth(context.server, context.token, apiPath, query, {
      tryRefresh: true
    })
    persistProfileToken(context, result.refreshedToken)

    spinner.succeed('查询成功')
    console.log(styles.title(`\n${title}\n`))
    console.log(`Profile: ${styles.info(context.profileName)}`)
    console.log(`服务地址: ${styles.info(context.server)}`)
    console.log(JSON.stringify(result.data, null, 2))
  } catch (error) {
    spinner.fail('查询失败')
    console.error(styles.error(error.message))
    process.exitCode = 1
  }
}

async function executeRemoteRequest(method, options, apiPath, title, requestOptions, styles) {
  let context
  try {
    context = resolveRemoteContext(options, { requireToken: true })
  } catch (error) {
    console.error(styles.error(error.message))
    process.exitCode = 1
    return
  }

  const spinner = ora(`正在请求 ${apiPath} ...`).start()
  try {
    const result = await requestWithAdminAuth(context.server, context.token, method, apiPath, {
      query: requestOptions.query || null,
      body: requestOptions.body || null,
      tryRefresh: true
    })
    persistProfileToken(context, result.refreshedToken)

    spinner.succeed('请求成功')
    console.log(styles.title(`\n${title}\n`))
    console.log(`Profile: ${styles.info(context.profileName)}`)
    console.log(`服务地址: ${styles.info(context.server)}`)
    console.log(JSON.stringify(result.data, null, 2))
  } catch (error) {
    spinner.fail('请求失败')
    console.error(styles.error(error.message))
    process.exitCode = 1
  }
}

async function executeRemotePost(options, apiPath, title, body, styles) {
  await executeRemoteRequest('post', options, apiPath, title, { body }, styles)
}

function makeRemoteBodyAction(styles, method, pathFactory, titleFactory, settings = {}) {
  return async (...args) => {
    const command = args[args.length - 1]
    const options = typeof command?.opts === 'function' ? command.opts() : command || {}
    const params = args.slice(0, -1)
    let body

    try {
      if (settings.bodyBuilder) {
        body = settings.bodyBuilder(options, params)
      } else if (settings.requireBodyJson) {
        body = parseRequiredJson(options.bodyJson, '--body-json')
      } else {
        body = parseOptionalJson(options.bodyJson, '--body-json')
      }
    } catch (error) {
      console.error(styles.error(error.message))
      process.exitCode = 1
      return
    }

    const apiPath =
      typeof pathFactory === 'function' ? pathFactory(...params, options) : pathFactory
    const title =
      typeof titleFactory === 'function' ? titleFactory(...params, options) : titleFactory
    await executeRemoteRequest(method, options, apiPath, title, { body }, styles)
  }
}

async function remoteGroupsListCommand(options, styles) {
  await executeRemoteGet(
    options,
    '/admin/account-groups',
    '👥 分组列表',
    toRemoteQuery({ platform: options.platform }),
    styles
  )
}

async function remoteGroupGetCommand(groupId, options, styles) {
  await executeRemoteGet(
    options,
    `/admin/account-groups/${encodeURIComponent(groupId)}`,
    `👥 分组详情 (${groupId})`,
    null,
    styles
  )
}

async function remoteGroupMembersCommand(groupId, options, styles) {
  await executeRemoteGet(
    options,
    `/admin/account-groups/${encodeURIComponent(groupId)}/members`,
    `👥 分组成员 (${groupId})`,
    null,
    styles
  )
}

async function remoteAccountsProviderListCommand(provider, options, styles) {
  const endpoint = remoteAccountListEndpoints[provider]
  if (!endpoint) {
    console.error(styles.error(`不支持的 provider: ${provider}`))
    process.exitCode = 1
    return
  }

  await executeRemoteGet(
    options,
    endpoint,
    `🏢 ${provider} 账户列表`,
    toRemoteQuery({
      platform: options.platform,
      groupId: options.groupId
    }),
    styles
  )
}

async function remoteAccountsUsageCommand(options, styles) {
  const apiPath = options.accountId
    ? `/admin/accounts/${encodeURIComponent(options.accountId)}/usage-stats`
    : '/admin/accounts/usage-stats'
  const title = options.accountId ? `📊 账户使用统计 (${options.accountId})` : '📊 全部账户使用统计'
  await executeRemoteGet(options, apiPath, title, null, styles)
}

async function remoteApiKeysListCommand(options, styles) {
  await executeRemoteGet(
    options,
    '/admin/api-keys',
    '🔑 API Keys 列表',
    toRemoteQuery({ timeRange: options.timeRange }),
    styles
  )
}

async function remoteApiKeysTagsCommand(options, styles) {
  await executeRemoteGet(options, '/admin/api-keys/tags', '🏷️ API Keys 标签', null, styles)
}

async function remoteApiKeysCostDebugCommand(options, styles) {
  await executeRemoteGet(
    options,
    `/admin/api-keys/${encodeURIComponent(options.keyId)}/cost-debug`,
    `💰 API Key 费用调试 (${options.keyId})`,
    null,
    styles
  )
}

async function remoteApiKeysModelStatsCommand(options, styles) {
  await executeRemoteGet(
    options,
    `/admin/api-keys/${encodeURIComponent(options.keyId)}/model-stats`,
    `📊 API Key 模型统计 (${options.keyId})`,
    toRemoteQuery({
      period: options.period,
      startDate: options.startDate,
      endDate: options.endDate
    }),
    styles
  )
}

async function remoteApiKeysUsageTrendCommand(options, styles) {
  let days
  try {
    days = toPositiveIntOption(options.days, '--days')
  } catch (error) {
    console.error(styles.error(error.message))
    process.exitCode = 1
    return
  }

  await executeRemoteGet(
    options,
    '/admin/api-keys-usage-trend',
    '📈 API Keys 使用趋势',
    toRemoteQuery({
      granularity: options.granularity,
      days,
      startDate: options.startDate,
      endDate: options.endDate
    }),
    styles
  )
}

async function remoteStatsDashboardCommand(options, styles) {
  await executeRemoteGet(options, '/admin/dashboard', '📊 系统概览', null, styles)
}

async function remoteStatsUsageCommand(options, styles) {
  await executeRemoteGet(
    options,
    '/admin/usage-stats',
    '📊 使用统计',
    toRemoteQuery({ period: options.period }),
    styles
  )
}

async function remoteStatsModelStatsCommand(options, styles) {
  await executeRemoteGet(
    options,
    '/admin/model-stats',
    '📊 全局模型统计',
    toRemoteQuery({
      period: options.period,
      startDate: options.startDate,
      endDate: options.endDate
    }),
    styles
  )
}

async function remoteStatsUsageTrendCommand(options, styles) {
  let days
  try {
    days = toPositiveIntOption(options.days, '--days')
  } catch (error) {
    console.error(styles.error(error.message))
    process.exitCode = 1
    return
  }

  await executeRemoteGet(
    options,
    '/admin/usage-trend',
    '📈 全局使用趋势',
    toRemoteQuery({
      days,
      granularity: options.granularity,
      startDate: options.startDate,
      endDate: options.endDate
    }),
    styles
  )
}

async function remoteStatsUsageCostsCommand(options, styles) {
  await executeRemoteGet(
    options,
    '/admin/usage-costs',
    '💰 使用成本统计',
    toRemoteQuery({ period: options.period }),
    styles
  )
}

async function remoteSystemSupportedClientsCommand(options, styles) {
  await executeRemoteGet(options, '/admin/supported-clients', '🧩 支持的客户端', null, styles)
}

async function remoteSystemWebhookConfigCommand(options, styles) {
  await executeRemoteGet(options, '/admin/webhook/config', '🔔 Webhook 配置', null, styles)
}

async function remoteSystemCheckUpdatesCommand(options, styles) {
  await executeRemoteGet(
    options,
    '/admin/check-updates',
    '🔄 版本更新检查',
    toRemoteQuery({ force: options.force ? '1' : undefined }),
    styles
  )
}

async function remoteSystemClaudeCodeHeadersCommand(options, styles) {
  await executeRemoteGet(
    options,
    '/admin/claude-code-headers',
    '📋 Claude Code Headers',
    null,
    styles
  )
}

async function remoteSystemOemSettingsCommand(options, styles) {
  await executeRemoteGet(options, '/admin/oem-settings', '🎨 OEM 设置', null, styles)
}

async function remoteClaudeGenerateAuthUrlCommand(options, styles) {
  let proxy
  try {
    proxy = parseOptionalJson(options.proxyJson, '--proxy-json')
  } catch (error) {
    console.error(styles.error(error.message))
    process.exitCode = 1
    return
  }

  await executeRemotePost(
    options,
    '/admin/claude-accounts/generate-auth-url',
    '🔐 Claude OAuth 授权链接',
    proxy ? { proxy } : {},
    styles
  )
}

async function remoteClaudeGenerateSetupTokenUrlCommand(options, styles) {
  let proxy
  try {
    proxy = parseOptionalJson(options.proxyJson, '--proxy-json')
  } catch (error) {
    console.error(styles.error(error.message))
    process.exitCode = 1
    return
  }

  await executeRemotePost(
    options,
    '/admin/claude-accounts/generate-setup-token-url',
    '🔐 Claude Setup Token 授权链接',
    proxy ? { proxy } : {},
    styles
  )
}

async function remoteGeminiGenerateAuthUrlCommand(options, styles) {
  await executeRemotePost(
    options,
    '/admin/gemini-accounts/generate-auth-url',
    '🔐 Gemini OAuth 授权链接',
    options.state ? { state: options.state } : {},
    styles
  )
}

async function remoteGeminiPollAuthStatusCommand(options, styles) {
  await executeRemotePost(
    options,
    '/admin/gemini-accounts/poll-auth-status',
    `🔐 Gemini OAuth 状态 (${options.sessionId})`,
    { sessionId: options.sessionId },
    styles
  )
}

async function remoteOpenaiGenerateAuthUrlCommand(options, styles) {
  let proxy
  try {
    proxy = parseOptionalJson(options.proxyJson, '--proxy-json')
  } catch (error) {
    console.error(styles.error(error.message))
    process.exitCode = 1
    return
  }

  await executeRemotePost(
    options,
    '/admin/openai-accounts/generate-auth-url',
    '🔐 OpenAI OAuth 授权链接',
    proxy ? { proxy } : {},
    styles
  )
}

module.exports = {
  registerRemoteCommands
}
