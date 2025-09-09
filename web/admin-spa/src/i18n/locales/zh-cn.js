export default {
  common: {
    save: '保存',
    cancel: '取消',
    confirm: '确认',
    loading: '加载中...',
    edit: '编辑',
    delete: '删除',
    create: '创建',
    update: '更新',
    search: '搜索',
    reset: '重置',
    locale: 'zh-CN'
  },
  language: {
    zh: '简体中文',
    'zh-tw': '繁體中文',
    en: 'English',
    current: '当前语言',
    switch: '切换语言'
  },
  header: {
    adminPanel: '管理后台',
    userMenu: '用户菜单',
    logout: '退出登录',
    settings: '系统设置',
    
    // Version related
    currentVersion: '当前版本',
    newVersionAvailable: '有新版本可用',
    newVersion: '新版本',
    hasUpdate: '有新版本',
    viewUpdate: '查看更新',
    checkingUpdate: '检查更新中...',
    alreadyLatest: '当前已是最新版本',
    checkUpdate: '检查更新',
    
    // User menu items
    changeAccountInfo: '修改账户信息',
    
    // Change password modal
    changePasswordModal: {
      title: '修改账户信息',
      currentUsername: '当前用户名',
      currentUsernameHint: '当前用户名，输入新用户名以修改',
      newUsername: '新用户名',
      newUsernamePlaceholder: '输入新用户名（留空保持不变）',
      newUsernameHint: '留空表示不修改用户名',
      currentPassword: '当前密码',
      currentPasswordPlaceholder: '请输入当前密码',
      newPassword: '新密码',
      newPasswordPlaceholder: '请输入新密码',
      newPasswordHint: '密码长度至少8位',
      confirmPassword: '确认新密码',
      confirmPasswordPlaceholder: '请再次输入新密码',
      saving: '保存中...',
      save: '保存修改',
      
      // Messages
      passwordMismatch: '两次输入的密码不一致',
      passwordTooShort: '新密码长度至少8位',
      accountInfoChangeSuccess: '账户信息修改成功，请重新登录',
      passwordChangeSuccess: '密码修改成功，请重新登录',
      changeFailed: '修改失败',
      changePasswordFailed: '修改密码失败'
    },
    
    // Logout
    logoutConfirm: '确定要退出登录吗？',
    logoutSuccess: '已安全退出'
  },
  apiStats: {
    title: 'API Key 使用统计',
    tutorialTitle: '使用教程',
    userLogin: '用户登录',
    adminPanel: '管理后台',
    statsQuery: '统计查询',
    tutorial: '使用教程',
    timeRange: '统计时间范围',
    today: '今日',
    thisMonth: '本月',
    
    // API Key Input
    usageStatsQuery: '使用统计查询',
    apiKeyDescription: '查询您的 API Key 使用情况和统计数据',
    enterApiKey: '输入您的 API Key',
    enterApiKeys: '输入您的 API Keys（每行一个或用逗号分隔）',
    singleMode: '单一',
    aggregateMode: '聚合',
    singleModeTitle: '单一模式',
    aggregateModeTitle: '聚合模式',
    queryButton: '查询',
    
    // Stats Overview
    batchQuerySummary: '批量查询概要',
    apiKeyInfo: 'API Key 信息',
    queryKeysCount: '查询 Keys 数',
    activeKeysCount: '有效 Keys 数',
    invalidKeysCount: '无效 Keys 数',
    totalRequests: '总请求数',
    totalTokens: '总 Token 数',
    totalCost: '总费用',
    individual: '个',
    
    // Aggregated Stats Card
    usageRatio: '使用占比',
    requests: '次',
    otherKeys: '其他',
    keys: 'Keys',
    
    // Model Usage Stats
    modelUsageStats: '模型使用统计',
    loadingModelStats: '加载模型统计数据中...',
    requestCount: '次请求',
    totalCost: '总费用',
    inputTokens: '输入 Token',
    outputTokens: '输出 Token',
    cacheCreateTokens: '缓存创建',
    cacheReadTokens: '缓存读取',
    noModelData: '暂无{period}模型使用数据',
    
    // Token Distribution
    tokenDistribution: 'Token 使用分布',
    inputToken: '输入 Token',
    outputToken: '输出 Token',
    cacheCreateToken: '缓存创建 Token',
    cacheReadToken: '缓存读取 Token',
    
    // Limit Config
    limitConfig: '限制配置',
    limitConfigAggregate: '限制配置（聚合查询模式）',
    apiKeysOverview: 'API Keys 概况',
    totalKeys: '总计 Keys',
    activeKeys: '激活 Keys',
    aggregatedStats: '聚合统计',
    dailyLimit: '日限制',
    monthlyLimit: '月限制',
    usageToday: '今日使用',
    usageThisMonth: '本月使用',
    remaining: '剩余',
    
    // Stats Overview - Additional keys
    name: '名称',
    status: '状态',
    permissions: '权限',
    createdAt: '创建时间',
    expiresAt: '过期时间',
    active: '活跃',
    inactive: '已停用',
    notActivated: '未激活',
    expired: '已过期',
    neverExpires: '永不过期',
    allModels: '全部模型',
    unknown: '未知',
    none: '无',
    formatError: '格式错误',
    usageStatsOverview: '使用统计概览',
    keyContribution: '各 Key 贡献占比',
    firstUseDays: '首次使用后{days}天过期',
    todayRequests: '今日请求数',
    todayTokens: '今日Token数',
    todayCost: '今日费用',
    todayInputTokens: '今日输入Token',
    monthlyRequests: '本月请求数',
    monthlyTokens: '本月Token数',
    monthlyCost: '本月费用',
    monthlyInputTokens: '本月输入Token',
    
    // Limit Config - Additional keys
    dailyCostLimit: '每日费用限制',
    concurrencyLimit: '并发限制',
    modelLimit: '模型限制',
    clientLimit: '客户端限制',
    restrictedModelsCount: '限制 {count} 个模型',
    allowAllModels: '允许所有模型',
    restrictedClientsCount: '限制 {count} 个客户端',
    allowAllClients: '允许所有客户端',
    detailedLimitInfo: '详细限制信息',
    restrictedModelsList: '受限模型列表',
    restrictedModelsNote: '此 API Key 不能访问以上列出的模型',
    allowedClientsList: '允许的客户端',
    allowedClientsNote: '此 API Key 只能被以上列出的客户端使用',
    timeWindowLimit: '时间窗口限制',
    aggregateStatsNote: '每个 API Key 有独立的限制设置，聚合模式下不显示单个限制配置',
    aggregateStatsSummary: '聚合统计摘要',
    invalidKeysCount: '{count} 个无效的 API Key',
    orRelationshipRequests: '请求次数和费用限制为“或”的关系，任一达到限制即触发限流',
    orRelationshipTokens: '请求次数和Token使用量为“或”的关系，任一达到限制即触发限流',
    onlyRequestsLimit: '仅限制请求次数',
    
    // Token Distribution - Additional keys
    totalAmount: '总计',
    todayTotal: '今日总计',
    monthlyTotal: '本月总计',
    
    // Additional missing keys
    usageRatioOnlyInMultiMode: '使用占比仅在多Key查询时显示',
    noData: '暂无数据',
    
    // ApiKeyInput placeholders and texts
    apiKeyPlaceholder: '请输入您的 API Key (cr_...)',
    apiKeysPlaceholder: '请输入您的 API Keys，支持以下格式：\ncr_xxx\ncr_yyy\n或\ncr_xxx, cr_yyy',
    clearInput: '清空输入',
    securityNoticeSingle: '您的 API Key 仅用于查询自己的统计数据，不会被存储或用于其他用途',
    securityNoticeMulti: '您的 API Keys 仅用于查询统计数据，不会被存储。聚合模式下部分个体化信息将不显示。',
    multiKeyTip: '提示：最多支持同时查询 30 个 API Keys。使用 Ctrl+Enter 快速查询。'
  },
  
  // Login page
  login: {
    title: '管理后台',
    username: '用户名',
    usernamePlaceholder: '请输入用户名',
    password: '密码',
    passwordPlaceholder: '请输入密码',
    loginButton: '登录',
    loggingIn: '登录中...'
  },
  
  // Dashboard page
  dashboard: {
    // Main stats cards
    totalApiKeys: '总 API Keys',
    activeApiKeys: '活跃',
    serviceAccounts: '服务账户',
    normalAccounts: '正常',
    abnormalAccounts: '异常',
    pausedAccounts: '停止调度',
    rateLimitedAccounts: '限流',
    todayRequests: '今日请求',
    totalRequests: '总请求',
    systemStatus: '系统状态',
    uptime: '运行时间',
    
    // Platform accounts tooltip
    claudeAccount: 'Claude: {total} 个 (正常: {normal})',
    consoleAccount: 'Console: {total} 个 (正常: {normal})',
    geminiAccount: 'Gemini: {total} 个 (正常: {normal})',
    bedrockAccount: 'Bedrock: {total} 个 (正常: {normal})',
    openaiAccount: 'OpenAI: {total} 个 (正常: {normal})',
    azureOpenaiAccount: 'Azure OpenAI: {total} 个 (正常: {normal})',
    
    // Token stats cards
    todayToken: '今日Token',
    totalTokenConsumption: '总Token消耗',
    inputTokens: '输入',
    outputTokens: '输出',
    cacheCreateTokens: '缓存创建',
    cacheReadTokens: '缓存读取',
    
    // Real-time metrics
    realtimeRPM: '实时RPM',
    realtimeTPM: '实时TPM',
    requestsPerMinute: '每分钟请求数',
    tokensPerMinute: '每分钟Token数',
    historicalData: '历史数据',
    minutes: '分钟',
    
    // Charts section
    modelDistributionAndTrend: '模型使用分布与Token使用趋势',
    
    // Date filter presets (would be populated from dateFilter.presetOptions)
    today: '今日',
    yesterday: '昨日',
    last7Days: '迗 7 天',
    last30Days: '迗 30 天',
    thisWeek: '本周',
    lastWeek: '上周',
    thisMonth: '本月',
    lastMonth: '上月',
    
    // Granularity buttons
    byDay: '按天',
    byHour: '按小时',
    
    // Date picker
    startDatePlaceholder: '开始日期',
    endDatePlaceholder: '结束日期',
    dateSeparator: '至',
    maxHours24: '最多24小时',
    
    // Auto refresh controls
    autoRefresh: '自动刷新',
    refresh: '刷新',
    refreshing: '刷新中',
    refreshDataNow: '立即刷新数据',
    
    // Charts
    tokenUsageDistribution: 'Token使用分布',
    detailedStatistics: '详细统计数据',
    noModelUsageData: '暂无模型使用数据',
    
    // Table headers
    model: '模型',
    requestCount: '请求数',
    totalTokens: '总Token',
    cost: '费用',
    percentage: '占比',
    
    // Trend charts
    tokenUsageTrend: 'Token使用趋势',
    apiKeysUsageTrend: 'API Keys 使用趋势',
    requestsCount: '请求次数',
    tokenCount: 'Token 数量',
    totalApiKeysCount: '共 {count} 个 API Key',
    showingTop10: '共 {count} 个 API Key，显示使用量前 10 个',
    
    // Chart labels
    inputTokensLabel: '输入Token',
    outputTokensLabel: '输出Token', 
    cacheCreateTokensLabel: '缓存创建Token',
    cacheReadTokensLabel: '缓存读取Token',
    costLabel: '费用 (USD)',
    requestsLabel: '请求数',
    time: '时间',
    date: '日期',
    tokenQuantity: 'Token数量',
    requestsQuantity: '请求次数'
  },
  
  // Accounts page
  accounts: {
    title: '账户管理',
    description: '管理您的 Claude、Gemini、OpenAI 和 Azure OpenAI 账户及代理配置',
    
    // Filters and sorting
    sortBy: '选择排序',
    selectPlatform: '选择平台',
    selectGroup: '选择分组',
    refresh: '刷新',
    refreshTooltip: '刷新数据 (Ctrl/⌘+点击强制刷新所有缓存)',
    addAccount: '添加账户',
    
    // Sort options
    sortByName: '按名称排序',
    sortByDailyTokens: '按今日Token排序',
    sortByDailyRequests: '按今日请求数排序',
    sortByTotalTokens: '按总Token排序',
    sortByLastUsed: '按最后使用排序',
    
    // Platform options
    allPlatforms: '所有平台',
    claudePlatform: 'Claude',
    claudeConsolePlatform: 'Claude Console',
    geminiPlatform: 'Gemini',
    openaiPlatform: 'OpenAi',
    azureOpenaiPlatform: 'Azure OpenAI',
    bedrockPlatform: 'Bedrock',
    
    // Group options
    allAccounts: '所有账户',
    ungroupedAccounts: '未分组账户',
    
    // Loading states
    loadingAccounts: '正在加载账户...',
    noAccounts: '暂无账户',
    noAccountsHint: '点击上方按钮添加您的第一个账户',
    
    // Table headers
    name: '名称',
    platformType: '平台/类型',
    status: '状态',
    priority: '优先级',
    proxy: '代理',
    dailyUsage: '今日使用',
    sessionWindow: '会话窗口',
    lastUsed: '最后使用',
    actions: '操作',
    
    // Account types
    dedicated: '专属',
    groupScheduling: '分组调度',
    shared: '共享',
    belongsToGroup: '所属分组: {name}',
    
    // Platform labels
    unknown: '未知',
    apiKey: 'API Key',
    oauth: 'OAuth',
    setup: 'Setup',
    aws: 'AWS',
    
    // Account status
    normal: '正常',
    abnormal: '异常',
    blocked: '已封锁',
    tempError: '临时异常',
    rateLimited: '限流中',
    notSchedulable: '不可调度',
    bound: '绑定: {count} 个API Key',
    
    // Proxy status
    noProxy: '无代理',
    
    // Usage statistics
    requests: '次',
    noData: '暂无数据',
    averageRpm: '平均 {rpm} RPM',
    
    // Session window tooltip
    sessionWindowTooltip: {
      title: '会话窗口进度表示5小时窗口的时间进度',
      normal: '正常：请求正常处理',
      warning: '警告：接近限制',
      rejected: '拒绝：达到速率限制'
    },
    
    // Session window status
    remaining: '剩余 {time}',
    ended: '已结束',
    
    // Console quota
    quotaProgress: '额度进度',
    remainingQuota: '剩余 $${amount}',
    reset: '重置 {time}',
    
    // Mobile view labels
    dailyUsageLabel: '今日使用',
    sessionWindowLabel: '会话窗口',
    lastUsedLabel: '最后使用',
    proxyLabel: '代理',
    priorityLabel: '优先级',
    neverUsed: '从未使用',
    sessionWindowTooltipMobile: '会话窗口进度不代表使用量，仅表示距离下一个5小时窗口的剩余时间',
    
    // Action buttons
    resetStatus: '重置状态',
    resetting: '重置中...',
    resetStatusTooltip: '重置所有异常状态',
    scheduling: '调度',
    disabled: '停用',
    enableTooltip: '点击启用调度',
    disableTooltip: '点击禁用调度',
    edit: '编辑',
    editTooltip: '编辑账户',
    delete: '删除',
    deleteTooltip: '删除账户',
    pause: '暂停',
    enable: '启用',
    
    // Time formatting
    justNow: '刚刚',
    minutesAgo: '{minutes} 分钟前',
    hoursAgo: '{hours} 小时前',
    daysAgo: '{days} 天前',
    hoursAndMinutes: '{hours}小时{minutes}分钟',
    hoursOnly: '{hours}小时',
    minutesOnly: '{minutes}分钟',
    daysAndHours: '{days}天{hours}小时',
    daysOnly: '{days}天',
    
    // Rate limit time
    rateLimitTime: '({time})',
    
    // Messages and confirmations
    resetStatusConfirmTitle: '重置账户状态',
    resetStatusConfirmMessage: '确定要重置此账户的所有异常状态吗？这将清除限流状态、401错误计数等所有异常标记。',
    resetStatusConfirmButton: '确定重置',
    resetStatusCancelButton: '取消',
    statusResetSuccess: '账户状态已重置',
    statusResetFailed: '状态重置失败',
    
    deleteAccountTitle: '删除账户',
    deleteAccountMessage: '确定要删除账户 "{name}" 吗？\n\n此操作不可恢复。',
    deleteAccountButton: '删除',
    deleteAccountCancel: '取消',
    cannotDeleteBoundAccount: '无法删除此账号，有 {count} 个API Key绑定到此账号，请先解绑所有API Key',
    accountDeleted: '账户已删除',
    deleteFailed: '删除失败',
    
    enabledScheduling: '已启用调度',
    disabledScheduling: '已禁用调度',
    schedulingToggleFailed: '切换调度状态失败',
    unsupportedAccountType: '该账户类型暂不支持调度控制',
    operationFailed: '操作失败',
    
    accountCreateSuccess: '账户创建成功',
    accountUpdateSuccess: '账户更新成功',
    loadAccountsFailed: '加载账户失败',
    unsupportedAccountTypeReset: '不支持的账户类型',
    
    // Schedulable reasons
    invalidApiKey: 'API Key无效或已过期（401错误）',
    serviceOverload: '服务过载（529错误）',
    rateLimitTriggered: '触发限流（429错误）',
    authFailed: '认证失败（401错误）',
    manualStop: '手动停止调度',
    
    // Account type display
    claudeMax: 'Claude Max',
    claudePro: 'Claude Pro',
    claudeFree: 'Claude Free',
    
    // Platform display
    openaiResponsesPlatform: 'OpenAI-Responses',
    ccrPlatform: 'CCR'
  },
  apiKeys: {
    // Page title and description
    title: 'API Keys 管理',
    description: '管理和监控您的 API 密钥',
    
    // Tab navigation
    activeTab: '活跃 API Keys',
    deletedTab: '已删除 API Keys',
    
    // Toolbar and actions
    refresh: '刷新',
    refreshTooltip: '刷新 API Keys 列表（Ctrl+点击强制刷新）',
    createNew: '创建新 Key',
    bulkEdit: '编辑选中',
    bulkDelete: '删除选中',
    
    // Table headers
    name: '名称',
    tags: '标签',
    status: '状态',
    usageStats: '使用统计',
    createdAt: '创建时间',
    expiresAt: '过期时间',
    actions: '操作',
    
    // Filter options
    timeRange: {
      today: '今日',
      week: '最近7天',
      month: '本月',
      all: '全部时间'
    },
    
    // Status
    active: '活跃',
    disabled: '禁用',
    expired: '已过期',
    expiringSoon: '即将过期',
    neverExpire: '永不过期',
    notActivated: '未激活',
    
    // Usage statistics
    dailyCost: '今日费用',
    totalCost: '总费用',
    dailyRequests: '今日请求',
    lastUsed: '最后使用',
    neverUsed: '从未使用',
    minutesAgo: '{minutes} 分钟前',
    hoursAgo: '{hours} 小时前',
    daysAgo: '{days} 天前',
    justNow: '刚刚',
    requests: '次',
    
    // Search and filter
    searchPlaceholder: '搜索名称...',
    searchPlaceholderWithOwner: '搜索名称或所有者...',
    allTags: '所有标签',
    noTags: '无标签',
    
    // Binding information
    shared: '使用共享池',
    dedicated: '专属',
    consoleAccount: 'Console账户',
    bindingWarning: '⚠️ 账户不存在',
    
    // Limits and quotas
    dailyLimit: '每日费用',
    weeklyOpusLimit: 'Opus周费用',
    remainingQuota: '剩余: ${amount}',
    reset: '重置于 {time}',
    quotaProgress: '额度进度',
    
    // Model statistics
    modelStats: '模型使用分布',
    modelStatsCount: '{count} 个模型',
    totalTokens: '总Token',
    inputTokens: '输入',
    outputTokens: '输出',
    cacheCreate: '缓存创建',
    cacheRead: '缓存读取',
    totalRequests: '总请求',
    noModelData: '暂无模型使用数据',
    resetFilter: '刷新',
    adjustTimeRange: '尝试调整时间范围或点击刷新重新加载数据',
    
    // Date filter
    dateFilter: {
      today: '今日',
      days7: '7天',
      days30: '30天'
    },
    
    // Actions
    viewDetails: '查看详细统计',
    edit: '编辑',
    renew: '续期',
    activate: '激活',
    disable: '禁用',
    copy: '复制',
    copyStatsLink: '复制统计页面链接',
    
    // Pagination
    totalRecords: '共 {count} 条记录',
    pageSize: '每页显示',
    records: '条',
    
    // Empty states
    noApiKeys: '暂无 API Keys',
    noApiKeysHint: '点击上方按钮创建您的第一个 API Key',
    noDeletedKeys: '暂无已删除的 API Keys',
    noDeletedKeysHint: '已删除的 API Keys 会出现在这里',
    loading: '正在加载 API Keys...',
    loadingDeleted: '正在加载已删除的 API Keys...',
    loadingModelStats: '加载模型统计...',
    
    // Deleted keys table
    creator: '创建者',
    deletedBy: '删除者',
    deletedAt: '删除时��',
    canRestore: '恢复',
    permanentDelete: '彻底删除',
    clearAllDeleted: '清空所有已删除',
    
    // User types
    admin: '管理员',
    user: '用户',
    unknown: '未知',
    system: '系统',
    
    // Confirmation dialogs
    confirmDisable: '确定要禁用 API Key "{name}" 吗？禁用后所有使用此 Key 的请求将返回 401 错误。',
    confirmDelete: '确定要删除这个 API Key 吗？此操作不可恢复。',
    confirmBatchDelete: '确定要删除选中的 {count} 个 API Key 吗？此操作不可恢复。',
    confirmRestore: '确定要恢复这个 API Key 吗？恢复后可以重新使用。',
    confirmPermanentDelete: '确定要彻底删除这个 API Key 吗？此操作不可恢复，所有相关数据将被永久删除。',
    confirmClearAll: '确定要彻底删除全部 {count} 个已删除的 API Keys 吗？此操作不可恢复，所有相关数据将被永久删除。',
    
    // Success messages
    keyActivated: 'API Key 已激活',
    keyDisabled: 'API Key 已禁用',
    keyDeleted: 'API Key 已删除',
    keyRestored: 'API Key 已成功恢复',
    keyPermanentDeleted: 'API Key 已彻底删除',
    allDeletedCleared: '已清空所有已删除的 API Keys',
    linkCopied: '已复制统计页面链接',
    expiryUpdated: '过期时间已更新',
    
    // Error messages
    selectKeysFirst: '请先选择要编辑的 API Keys',
    loadFailed: '加载 API Keys 失败',
    operationFailed: '操作失败',
    copyFailed: '复制失败，请手动复制',
    updateFailed: '更新失败',
    deleteFailed: '删除失败',
    restoreFailed: '恢复失败',
    clearFailed: '清空失败',
    
    // Tooltips and helpers
    editExpiry: '编辑过期时间',
    activationDays: '未激活 ({days}天)',
    boundTo: '绑定到',
    belongsToGroup: '所属分组: {name}',
    
    // Batch operations
    batchSuccess: '成功处理 {count} 个项目',
    batchPartialFail: '{failed} 个处理失败',
    batchAllFailed: '所有项目处理失败'
  },

  // User-related translations
  user: {
    // User Dashboard
    dashboard: {
      title: 'Dashboard Overview',
      welcomeMessage: 'Welcome to your Claude Relay dashboard',
      
      // Navigation tabs
      overview: 'Overview',
      apiKeys: 'API Keys',
      usageStats: 'Usage Stats',
      
      // Welcome section
      welcome: 'Welcome',
      
      // Stats cards
      activeApiKeys: 'Active API Keys',
      deletedApiKeys: 'Deleted API Keys',
      totalRequests: 'Total Requests',
      inputTokens: 'Input Tokens',
      totalCost: 'Total Cost',
      
      // Account information section
      accountInformation: 'Account Information',
      username: 'Username',
      displayName: 'Display Name',
      email: 'Email',
      role: 'Role',
      memberSince: 'Member Since',
      lastLogin: 'Last Login',
      notAvailable: 'N/A',
      
      // Messages
      logout: 'Logout',
      logoutSuccess: 'Logged out successfully',
      logoutFailed: 'Logout failed',
      loadProfileFailed: 'Failed to load user profile',
      loadStatsFailed: 'Failed to load API keys stats'
    },
    
    // User Login
    login: {
      title: 'User Sign In',
      subtitle: 'Sign in to your account to manage your API keys',
      username: 'Username',
      password: 'Password',
      usernamePlaceholder: 'Enter your username',
      passwordPlaceholder: 'Enter your password',
      signIn: 'Sign In',
      signingIn: 'Signing In...',
      adminLogin: 'Admin Login',
      
      // Validation and error messages
      requiredFields: 'Please enter both username and password',
      loginSuccess: 'Login successful!',
      loginFailed: 'Login failed'
    },
    
    // User Management
    management: {
      title: 'User Management',
      description: 'Manage users, their API keys, and view usage statistics',
      refresh: 'Refresh',
      
      // Stats cards
      totalUsers: 'Total Users',
      activeUsers: 'Active Users',
      totalApiKeys: 'Total API Keys',
      totalCost: 'Total Cost',
      
      // Search and filters
      searchPlaceholder: 'Search users...',
      allRoles: 'All Roles',
      user: 'User',
      admin: 'Admin',
      allStatus: 'All Status',
      active: 'Active',
      disabled: 'Disabled',
      
      // User list
      users: 'Users',
      loadingUsers: 'Loading users...',
      noUsersFound: 'No users found',
      noUsersMatch: 'No users match your search criteria.',
      noUsersCreated: 'No users have been created yet.',
      
      // User info and actions
      displayName: 'Display Name',
      email: 'Email',
      role: 'Role',
      username: 'Username',
      apiKeysCount: 'API keys',
      lastLogin: 'Last login',
      neverLoggedIn: 'Never logged in',
      requests: 'requests',
      totalCostLabel: 'total cost',
      
      // Action buttons and tooltips
      viewUsageStats: 'View Usage Stats',
      disableAllApiKeys: 'Disable All API Keys',
      disableUser: 'Disable User',
      enableUser: 'Enable User',
      changeRole: 'Change Role',
      
      // Confirmation dialogs
      disableUserTitle: 'Disable User',
      enableUserTitle: 'Enable User',
      disableUserMessage: 'Are you sure you want to disable user "{username}"? This will prevent them from logging in.',
      enableUserMessage: 'Are you sure you want to enable user "{username}"?',
      disable: 'Disable',
      enable: 'Enable',
      
      disableAllKeysTitle: 'Disable All API Keys',
      disableAllKeysMessage: 'Are you sure you want to disable all {count} API keys for user "{username}"? This will prevent them from using the service.',
      disableKeys: 'Disable Keys',
      
      // Success messages
      userDisabledSuccess: 'User disabled successfully',
      userEnabledSuccess: 'User enabled successfully',
      keysDisabledSuccess: 'Disabled {count} API keys',
      
      // Error messages
      loadUsersError: 'Failed to load users',
      toggleStatusError: 'Failed to toggleStatus',
      disableKeysError: 'Failed to disableKeys'
    }
  },

  // Settings 设置页面
  settings: {
    title: '系统设置',
    description: '网站定制和通知配置',
    loading: '正在加载设置...',
    
    // 导航标签
    branding: '品牌设置',
    webhook: '通知设置',
    
    // 品牌设置
    siteName: '网站名称',
    siteNameDescription: '品牌标识',
    siteNamePlaceholder: 'Claude Relay Service',
    siteNameHint: '将显示在浏览器标题和页面头部',
    
    siteIcon: '网站图标',
    siteIconDescription: 'Favicon',
    currentIcon: '当前图标',
    uploadIcon: '上传图标',
    removeIcon: '删除',
    iconFormats: '支持 .ico, .png, .jpg, .svg 格式，最大 350KB',
    iconPreview: '图标预览',
    
    adminEntry: '管理入口',
    adminEntryDescription: '登录按钮显示',
    hideLoginButton: '隐藏登录按钮',
    showLoginButton: '显示登录按钮',
    adminEntryHint: '隐藏后，用户需要直接访问 /admin/login 页面登录',
    
    // 移动端卡片标题
    siteNameCard: '站点名称',
    siteNameCardDesc: '自定义您的站点品牌名称',
    siteIconCard: '站点图标',
    siteIconCardDesc: '上传自定义图标或输入图标URL',
    adminEntryCard: '管理入口',
    adminEntryCardDesc: '控制登录按钮在首页的显示',
    
    // 操作按钮
    save: '保存设置',
    saving: '保存中...',
    reset: '重置为默认',
    lastUpdated: '最后更新：{time}',
    lastUpdatedMobile: '上次更新: {time}',
    
    // Webhook 设置
    enableWebhook: '启用 Webhook 通知',
    webhookDescription: '开启后，系统将按配置发送通知到指定平台',
    
    // 通知类型
    notificationTypes: '通知类型',
    accountAnomaly: '账号异常',
    quotaWarning: '配额警告',
    systemError: '系统错误',
    securityAlert: '安全警报',
    accountAnomalyDesc: '账号状态异常、认证失败等',
    quotaWarningDesc: 'API调用配额不足警告',
    systemErrorDesc: '系统运行错误和故障',
    securityAlertDesc: '安全相关的警报通知',
    
    // 通知平台
    notificationPlatforms: '通知平台',
    addPlatform: '添加平台',
    noPlatforms: '暂无配置的通知平台，请点击"添加平台"按钮添加',
    enableSignature: '已启用签名验证',
    testConnection: '测试连接',
    edit: '编辑',
    delete: '删除',
    
    // 高级设置
    advancedSettings: '高级设置',
    maxRetries: '最大重试次数',
    retryDelay: '重试延迟 (毫秒)',
    timeout: '超时时间 (毫秒)',
    
    // 测试通知
    sendTestNotification: '发送测试通知',
    
    // 平台模态框
    addPlatformModal: '添加通知平台',
    editPlatformModal: '编辑通知平台',
    configurePlatform: '配置新的Webhook通知渠道',
    updatePlatform: '配置并更新Webhook通知渠道',
    
    platformType: '平台类型',
    platformName: '名称',
    platformNameOptional: '(可选)',
    platformNamePlaceholder: '例如：运维群通知、开发测试群',
    
    webhookUrl: 'Webhook URL',
    webhookUrlRequired: '*',
    webhookUrlPlaceholder: 'https://...',
    editModeWarning: '编辑模式下不能更改平台类型',
    
    // Bark 特有设置
    deviceKey: '设备密钥 (Device Key)',
    deviceKeyPlaceholder: '例如：aBcDeFgHiJkLmNoPqRsTuVwX',
    deviceKeyHint: '在Bark App中查看您的推送密钥',
    serverAddress: '服务器地址',
    serverAddressOptional: '(可选)',
    serverAddressPlaceholder: '默认: https://api.day.app/push',
    notificationLevel: '通知级别',
    notificationSound: '通知声音',
    notificationGroup: '通知分组',
    notificationGroupOptional: '(可选)',
    notificationGroupPlaceholder: '默认: claude-relay',
    
    // 通知级别选项
    levelAuto: '自动（根据通知类型）',
    levelPassive: '被动',
    levelActive: '默认',
    levelTimeSensitive: '时效性',
    levelCritical: '紧急',
    
    // 声音选项
    soundAuto: '自动（根据通知类型）',
    soundDefault: '默认',
    soundAlarm: '警报',
    soundBell: '铃声',
    soundBirdsong: '鸟鸣',
    soundElectronic: '电子音',
    soundGlass: '玻璃',
    soundHorn: '喇叭',
    soundSilence: '静音',
    
    // Bark 提示信息
    barkInstructions: [
      '1. 在iPhone上安装Bark App',
      '2. 打开App获取您的设备密钥',
      '3. 将密钥粘贴到上方输入框'
    ],
    
    // 签名设置
    enableSignatureVerify: '启用签名验证',
    signatureEnabled: '已启用',
    signatureSecret: '签名密钥',
    signatureSecretPlaceholder: 'SEC...',
    
    // 平台提示信息
    wechatWorkHint: '请在企业微信群机器人设置中获取Webhook地址',
    dingtalkHint: '请在钉钉群机器人设置中获取Webhook地址',
    feishuHint: '请在飞书群机器人设置中获取Webhook地址',
    slackHint: '请在Slack应用的Incoming Webhooks中获取地址',
    discordHint: '请在Discord服务器的集成设置中创建Webhook',
    barkHint: '请在Bark App中查看您的设备密钥',
    customHint: '请输入完整的Webhook接收地址',
    
    // 模态框按钮
    required: '必填项',
    cancel: '取消',
    testing: '测试中...',
    saveChanges: '保存修改',
    addPlatformBtn: '添加平台',
    
    // 成功/错误消息
    loadSettingsFailed: '加载设置失败',
    settingsSaved: '设置已保存',
    saveSettingsFailed: '保存设置失败',
    oemSettingsSaved: 'OEM设置保存成功',
    oemSettingsSaveFailed: '保存OEM设置失败',
    resetToDefault: '已重置为默认设置',
    resetFailed: '重置失败',
    confirmReset: '确定要重置为默认设置吗？\n\n这将清除所有自定义的网站名称和图标设置。',
    
    webhookConfigSaved: '配置已保存',
    webhookConfigSaveFailed: '保存配置失败',
    getWebhookConfigFailed: '获取webhook配置失败',
    
    platformAdded: '平台已添加',
    platformUpdated: '平台已更新',
    platformDeleted: '平台已删除',
    platformDeleteFailed: '删除失败',
    confirmDeletePlatform: '确定要删除这个平台吗？',
    operationFailed: '操作失败',
    
    testSuccess: '测试成功，webhook连接正常',
    testFailed: '测试失败',
    testNotificationSent: '测试通知已发送',
    testNotificationFailed: '发送失败',
    
    // 表单验证消息
    enterBarkDeviceKey: '请输入Bark设备密钥',
    enterWebhookUrl: '请输入Webhook URL',
    enterValidWebhookUrl: '请输入有效的Webhook URL',
    enterWebhookUrlFirst: '请先输入Webhook URL',
    enterBarkDeviceKeyFirst: '请先输入Bark设备密钥',
    
    // 文件上传
    fileReadFailed: '文件读取失败',
    iconLoadFailed: 'Icon failed to load',
    
    // 平台名称
    platforms: {
      wechatWork: '企业微信',
      dingtalk: '钉钉',
      feishu: '飞书',
      slack: 'Slack',
      discord: 'Discord',
      bark: 'Bark',
      custom: '自定义'
    }
  },

  // AccountForm 组件
  accountForm: {
    // 标题和模态框
    editAccount: '编辑账户',
    addAccount: '添加账户',
    
    // 步骤指示器
    stepBasicInfo: '基本信息',
    stepAuthorization: '授权认证',
    
    // 平台选择
    platform: '平台',
    platformClaude: 'Claude',
    platformClaudeConsole: 'Claude Console',
    platformGemini: 'Gemini',
    platformOpenAI: 'OpenAI',
    platformAzureOpenAI: 'Azure OpenAI',
    platformBedrock: 'Bedrock',
    
    // 添加方式
    addMethod: '添加方式',
    addTypeSetupToken: 'Setup Token (推荐)',
    addTypeOAuth: 'OAuth 授权',
    addTypeManual: '手动输入 Access Token',
    
    // 基本信息字段
    accountName: '账户名称',
    accountNamePlaceholder: '为账户设置一个易识别的名称',
    description: '描述',
    descriptionOptional: '描述 (可选)',
    descriptionPlaceholder: '账户用途说明...',
    
    // 账户类型
    accountType: '账户类型',
    accountTypeShared: '共享账户',
    accountTypeDedicated: '专属账户',
    accountTypeGroup: '分组调度',
    accountTypeDescription: '共享账户：供所有API Key使用；专属账户：仅供特定API Key使用；分组调度：加入分组供分组内调度',
    
    // 分组选择
    selectGroup: '选择分组',
    selectGroupRequired: '选择分组 *',
    noGroupsAvailable: '暂无可用分组',
    memberCount: '个成员',
    newGroup: '新建分组',
    refreshGroups: '刷新分组',
    
    // Gemini 项目 ID
    projectId: '项目 ID',
    projectIdOptional: '项目 ID (可选)',
    projectIdPlaceholder: '例如：verdant-wares-464411-k9',
    projectIdDescription: 'Google Cloud/Workspace 账号需要提供项目 ID',
    projectIdInstructions: '如何获取项目 ID：',
    projectIdStep1: '访问 Google Cloud Console',
    projectIdStep2: '复制项目 ID（Project ID），通常是字符串格式',
    projectIdStep3: '⚠️ 注意：要复制项目 ID（Project ID），不要复制项目编号（Project Number）！',
    projectIdTip: '提示：如果您的账号是普通个人账号（未绑定 Google Cloud），请留空此字段。',
    projectIdGoogleCloudRequired: 'Google Cloud/Workspace 账号需要提供项目 ID',
    projectIdGoogleCloudDescription: '某些 Google 账号（特别是绑定了 Google Cloud 的账号）会被识别为 Workspace 账号，需要提供额外的项目 ID。',
    
    // Bedrock 字段
    awsAccessKeyId: 'AWS 访问密钥 ID',
    awsAccessKeyIdRequired: 'AWS 访问密钥 ID *',
    awsAccessKeyIdPlaceholder: '请输入 AWS Access Key ID',
    awsSecretAccessKey: 'AWS 秘密访问密钥',
    awsSecretAccessKeyRequired: 'AWS 秘密访问密钥 *',
    awsSecretAccessKeyPlaceholder: '请输入 AWS Secret Access Key',
    awsRegion: 'AWS 区域',
    awsRegionRequired: 'AWS 区域 *',
    awsRegionPlaceholder: '例如：us-east-1',
    awsRegionReference: '常用 AWS 区域参考：',
    awsRegionUsEast1: '• us-east-1 (美国东部)',
    awsRegionUsWest2: '• us-west-2 (美国西部)',
    awsRegionEuWest1: '• eu-west-1 (欧洲爱尔兰)',
    awsRegionApSoutheast1: '• ap-southeast-1 (新加坡)',
    awsRegionApNortheast1: '• ap-northeast-1 (东京)',
    awsRegionEuCentral1: '• eu-central-1 (法兰克福)',
    awsRegionTip: '💡 请输入完整的区域代码，如 us-east-1',
    sessionToken: '会话令牌',
    sessionTokenOptional: '会话令牌 (可选)',
    sessionTokenPlaceholder: '如果使用临时凭证，请输入会话令牌',
    sessionTokenDescription: '仅在使用临时 AWS 凭证时需要填写',
    defaultModel: '默认主模型',
    defaultModelOptional: '默认主模型 (可选)',
    defaultModelPlaceholder: '例如：us.anthropic.claude-sonnet-4-20250514-v1:0',
    defaultModelDescription: '留空将使用系统默认模型。支持 inference profile ID 或 ARN',
    bedrockModelConfigTitle: 'Bedrock 模型配置说明：',
    bedrockModelConfigInferenceProfile: '• 支持 Inference Profile ID（推荐）',
    bedrockModelConfigArn: '• 支持 Application Inference Profile ARN',
    bedrockModelConfigCommon: '• 常用模型：us.anthropic.claude-sonnet-4-20250514-v1:0',
    bedrockModelConfigDefault: '• 留空将使用系统配置的默认模型',
    smallFastModel: '小快速模型',
    smallFastModelOptional: '小快速模型 (可选)',
    smallFastModelPlaceholder: '例如：us.anthropic.claude-3-5-haiku-20241022-v1:0',
    smallFastModelDescription: '用于快速响应的轻量级模型，留空将使用系统默认',
    
    // Azure OpenAI 字段
    azureEndpoint: 'Azure Endpoint',
    azureEndpointRequired: 'Azure Endpoint *',
    azureEndpointPlaceholder: 'https://your-resource.openai.azure.com',
    azureEndpointDescription: 'Azure OpenAI 资源的终结点 URL，格式：https://your-resource.openai.azure.com',
    apiVersion: 'API 版本',
    apiVersionPlaceholder: '2024-02-01',
    apiVersionDescription: 'Azure OpenAI API 版本，默认使用最新稳定版本 2024-02-01',
    deploymentName: '部署名称',
    deploymentNameRequired: '部署名称 *',
    deploymentNamePlaceholder: 'gpt-4',
    deploymentNameDescription: '在 Azure OpenAI Studio 中创建的部署名称',
    apiKey: 'API Key',
    apiKeyRequired: 'API Key *',
    apiKeyPlaceholder: '请输入 API Key',
    apiKeyDescription: '从 Azure 门户获取的 API 密钥',
    supportedModels: '支持的模型',
    supportedModelsDescription: '选择此部署支持的模型类型',
    
    // Claude Console 字段
    apiUrl: 'API URL',
    apiUrlRequired: 'API URL *',
    apiUrlPlaceholder: '例如：https://api.example.com',
    apiKeyClaudeConsoleRequired: 'API Key *',
    apiKeyClaudeConsolePlaceholder: '请输入API Key',
    dailyQuota: '每日额度限制',
    dailyQuotaLabel: '每日额度限制 ($)',
    dailyQuotaPlaceholder: '0 表示不限制',
    dailyQuotaDescription: '设置每日使用额度，0 表示不限制',
    quotaResetTime: '额度重置时间',
    quotaResetTimePlaceholder: '00:00',
    quotaResetTimeDescription: '每日自动重置额度的时间',
    todayUsage: '今日使用情况',
    remaining: '剩余',
    used: '已使用',
    modelMapping: '模型映射表',
    modelMappingOptional: '模型映射表 (可选)',
    modelMappingDescription: '留空表示支持所有模型且不修改请求。配置映射后，左侧模型会被识别为支持的模型，右侧是实际发送的模型。',
    originalModel: '原始模型名称',
    mappedModel: '映射后的模型名称',
    addModelMapping: '添加模型映射',
    userAgent: '自定义 User-Agent',
    userAgentOptional: '自定义 User-Agent (可选)',
    userAgentPlaceholder: '留空则透传客户端 User-Agent',
    userAgentDescription: '留空时将自动使用客户端的 User-Agent，仅在需要固定特定 UA 时填写',
    rateLimitMechanism: '限流机制',
    enableRateLimit: '启用限流机制',
    rateLimitDescription: '启用后，当账号返回429错误时将暂停调度一段时间',
    rateLimitDuration: '限流时间 (分钟)',
    rateLimitDurationDescription: '账号被限流后暂停调度的时间（分钟）',
    
    // Claude 订阅类型
    subscriptionType: '订阅类型',
    subscriptionClaudeMax: 'Claude Max',
    subscriptionClaudePro: 'Claude Pro',
    claudeProLimitation: 'Pro 账号不支持 Claude Opus 4 模型',
    
    // Claude 特殊功能
    autoStopOnWarning: '5小时使用量接近限制时自动停止调度',
    autoStopOnWarningDescription: '当系统检测到账户接近5小时使用限制时，自动暂停调度该账户。进入新的时间窗口后会自动恢复调度。',
    useUnifiedUserAgent: '使用统一 Claude Code 版本',
    useUnifiedUserAgentDescription: '开启后将使用从真实 Claude Code 客户端捕获的统一 User-Agent，提高兼容性',
    currentUnifiedVersion: '💡 当前统一版本：',
    clearCache: '清除缓存',
    clearing: '清除中...',
    waitingForCapture: '⏳ 等待从 Claude Code 客户端捕获 User-Agent',
    captureHint: '💡 提示：如果长时间未能捕获，请确认有 Claude Code 客户端正在使用此账户，或联系开发者检查 User-Agent 格式是否发生变化',
    useUnifiedClientId: '使用统一的客户端标识',
    useUnifiedClientIdDescription: '开启后将使用固定的客户端标识，使所有请求看起来来自同一个客户端，减少特征',
    clientId: '客户端标识 ID',
    regenerate: '重新生成',
    clientIdDescription: '此ID将替换请求中的user_id客户端部分，保留session部分用于粘性会话',
    
    // 调度优先级
    schedulePriority: '调度优先级',
    schedulePriorityRange: '调度优先级 (1-100)',
    schedulePriorityPlaceholder: '数字越小优先级越高，默认50',
    schedulePriorityDescription: '数字越小优先级越高，建议范围：1-100',
    
    // 手动输入 Token
    manualTokenTitle: '手动输入 Token',
    manualTokenDescription: '请输入有效的 Access Token。如果您有 Refresh Token，建议也一并填写以支持自动刷新。',
    manualTokenClaudeDescription: '请输入有效的 Claude Access Token。如果您有 Refresh Token，建议也一并填写以支持自动刷新。',
    manualTokenGeminiDescription: '请输入有效的 Gemini Access Token。如果您有 Refresh Token，建议也一并填写以支持自动刷新。',
    manualTokenOpenAIDescription: '请输入有效的 OpenAI Access Token。如果您有 Refresh Token，建议也一并填写以支持自动刷新。',
    obtainTokenMethods: '获取 Access Token 的方法：',
    claudeTokenPath: '请从已登录 Claude Code 的机器上获取 ~/.claude/.credentials.json 文件中的凭证， 请勿使用 Claude 官网 API Keys 页面的密钥。',
    geminiTokenPath: '请从已登录 Gemini CLI 的机器上获取 ~/.config/gemini/credentials.json 文件中的凭证。',
    openaiTokenPath: '请从已登录 OpenAI 账户的机器上获取认证凭证， 或通过 OAuth 授权流程获取 Access Token。',
    accessToken: 'Access Token',
    accessTokenOptional: 'Access Token (可选)',
    accessTokenRequired: 'Access Token *',
    accessTokenPlaceholder: '请输入 Access Token...',
    accessTokenOptionalPlaceholder: '可选：如果不填写，系统会自动通过 Refresh Token 获取...',
    accessTokenOptionalDescription: 'Access Token 可选填。如果不提供，系统会通过 Refresh Token 自动获取。',
    refreshToken: 'Refresh Token',
    refreshTokenOptional: 'Refresh Token (可选)',
    refreshTokenRequired: 'Refresh Token *',
    refreshTokenPlaceholder: '请输入 Refresh Token...',
    refreshTokenRequiredPlaceholder: '请输入 Refresh Token（必填）...',
    refreshTokenDescription: '系统将使用 Refresh Token 自动获取 Access Token 和用户信息',
    refreshTokenTip: '💡 如果未填写 Refresh Token，Token 过期后需要手动更新。',
    
    // Setup Token 流程
    setupTokenTitle: 'Claude Setup Token 授权',
    setupTokenDescription: '请按照以下步骤通过 Setup Token 完成 Claude 账户的授权：',
    setupTokenStep1Title: '点击下方按钮生成授权链接',
    setupTokenStep2Title: '在浏览器中打开链接并完成授权',
    setupTokenStep2Description: '请在新标签页中打开授权链接，登录您的 Claude 账户并授权 Claude Code。',
    setupTokenStep2Warning: '注意：如果您设置了代理，请确保浏览器也使用相同的代理访问授权页面。',
    setupTokenStep3Title: '输入 Authorization Code',
    setupTokenStep3Description: '授权完成后，从返回页面复制 Authorization Code，并粘贴到下方输入框：',
    generateSetupTokenUrl: '生成 Setup Token 授权链接',
    generating: '生成中...',
    copyLink: '复制链接',
    regenerateLink: '重新生成',
    authorizationCode: 'Authorization Code',
    authorizationCodePlaceholder: '粘贴从Claude Code授权页面获取的Authorization Code...',
    authorizationCodeDescription: '请粘贴从Claude Code授权页面复制的Authorization Code',
    verifying: '验证中...',
    completeAuthorization: '完成授权',
    
    // Token 更新（编辑模式）
    updateTokenTitle: '更新 Token',
    updateTokenDescription: '可以更新 Access Token 和 Refresh Token。为了安全起见，不会显示当前的 Token 值。',
    updateTokenTip: '💡 留空表示不更新该字段。',
    newAccessToken: '新的 Access Token',
    newRefreshToken: '新的 Refresh Token',
    leaveBlankNoUpdate: '留空表示不更新...',
    
    // 使用情况
    currentUsage: '当前使用情况',
    
    // 按钮
    cancel: '取消',
    nextStep: '下一步',
    previousStep: '上一步',
    create: '创建',
    creating: '创建中...',
    update: '更新',
    updating: '更新中...',
    
    // 错误消息
    pleaseEnterAccountName: '请填写账户名称',
    pleaseSelectGroup: '请选择一个分组',
    pleaseEnterApiUrl: '请填写 API URL',
    pleaseEnterApiKey: '请填写 API Key',
    pleaseEnterAccessKeyId: '请填写 AWS 访问密钥 ID',
    pleaseEnterSecretAccessKey: '请填写 AWS 秘密访问密钥',
    pleaseEnterRegion: '请选择 AWS 区域',
    pleaseEnterAzureEndpoint: '请填写 Azure Endpoint',
    pleaseEnterDeploymentName: '请填写部署名称',
    pleaseEnterAccessToken: '请填写 Access Token',
    pleaseEnterRefreshToken: '请填写 Refresh Token',
    
    // 成功消息
    linkCopied: '链接已复制',
    extractedAuthCode: '成功提取授权码！',
    cacheClearedSuccess: '统一User-Agent缓存已清除',
    newClientIdGenerated: '已生成新的客户端标识',
    groupsRefreshed: '分组列表已刷新',
    modelMappingAdded: '已添加映射',
    modelMappingExists: '模型映射已存在',
    
    // 警告和提示
    copyFailed: '复制失败，请手动复制',
    clearCacheFailed: '清除缓存失败',
    urlNotFound: 'URL 中未找到授权码参数，请检查链接是否正确',
    urlFormatError: '链接格式错误，请检查是否为完整的 URL',
    wrongUrlFormat: '请粘贴以 http://localhost:45462 开头的链接',
    loadGroupsFailed: '加载分组列表失败',
    
    // 确认对话框
    projectIdNotFilledTitle: '项目 ID 未填写',
    projectIdNotFilledMessage: '您尚未填写项目 ID。\n\n如果您的Google账号绑定了Google Cloud或被识别为Workspace账号，需要提供项目 ID。\n如果您使用的是普通个人账号，可以继续不填写。',
    continueButton: '继续',
    goBackToFill: '返回填写',
    continueSave: '继续保存',
    
    // 快捷模型映射按钮
    presetSonnet4: '+ Sonnet 4',
    presetOpus41: '+ Opus 4.1',
    presetHaiku35: '+ Haiku 3.5',
    presetOpus41ToSonnet4: '+ Opus 4.1 → Sonnet 4',
    
    // 编辑模式特殊提示
    leaveBlankNoUpdateApiKey: '留空表示不更新 API Key',
    leaveBlankNoUpdateAwsKey: '留空表示不更新 AWS Access Key ID',
    leaveBlankNoUpdateAwsSecret: '留空表示不更新 AWS Secret Access Key',
    leaveBlankNoUpdateSession: '留空表示不更新',
    
    // 通用描述文本
    allModelsIfEmpty: '留空表示支持所有模型。如果指定模型，请求中的模型不在列表内将不会调度到此账号',
    systemDefaultIfEmpty: '留空将使用系统默认模型。支持 inference profile ID 或 ARN',
    noUpdateIfEmpty: '留空表示不更新该字段',
    
    // 手动 Token 输入部分
    manualTokenInput: '手动输入 Token',
    manualTokenClaudeDescription: '请输入有效的 Claude Access Token。如果您有 Refresh Token，建议也一并填写以支持自动刷新。',
    manualTokenGeminiDescription: '请输入有效的 Gemini Access Token。如果您有 Refresh Token，建议也一并填写以支持自动刷新。',
    manualTokenOpenAIDescription: '请输入有效的 OpenAI Access Token。如果您有 Refresh Token，建议也一并填写以支持自动刷新。',
    getAccessTokenMethod: '获取 Access Token 的方法：',
    claudeCredentialsPath: '请从已登录 Claude Code 的机器上获取',
    geminiCredentialsPath: '请从已登录 Gemini CLI 的机器上获取',
    openaiCredentialsPath: '请从已登录 OpenAI 账户的机器上获取认证凭证，或通过 OAuth 授权流程获取 Access Token。',
    claudeCredentialsWarning: '文件中的凭证，请勿使用 Claude 官网 API Keys 页面的密钥。',
    refreshTokenWarning: '💡 如果未填写 Refresh Token，Token 过期后需要手动更新。',
    accessTokenOptional: 'Access Token (可选)',
    accessTokenOptionalPlaceholder: '可选：如果不填写，系统会自动通过 Refresh Token 获取...',
    accessTokenOptionalInfo: 'Access Token 可选填。如果不提供，系统会通过 Refresh Token 自动获取。',
    accessTokenRequired: 'Access Token *',
    accessTokenRequiredPlaceholder: '请输入 Access Token...',
    refreshTokenRequired: 'Refresh Token *',
    refreshTokenRequiredPlaceholder: '请输入 Refresh Token（必填）...',
    refreshTokenRequiredInfo: '系统将使用 Refresh Token 自动获取 Access Token 和用户信息',
    refreshTokenOptional: 'Refresh Token (可选)',
    refreshTokenOptionalPlaceholder: '请输入 Refresh Token...',
    
    // 优先级设置
    priorityPlaceholder: '数字越小优先级越高，默认50',
    priorityDescription: '数字越小优先级越高，建议范围：1-100',
    prioritySchedulingTitle: '调度优先级 (1-100)',
    priorityEditPlaceholder: '数字越小优先级越高',
    
    // Gemini 项目ID
    projectIdOptional: '项目 ID (可选)',
    projectIdPlaceholder: '例如：verdant-wares-464411-k9',
    projectIdDescription: 'Google Cloud/Workspace 账号可能需要提供项目 ID',
    
    // Claude 订阅类型和高级选项
    subscriptionType: '订阅类型',
    claudeMaxSubscription: 'Claude Max',
    claudeProSubscription: 'Claude Pro',
    claudeProLimitation: 'Pro 账号不支持 Claude Opus 4 模型',
    autoStopOnWarning: '5小时使用量接近限制时自动停止调度',
    autoStopOnWarningDescription: '当系统检测到账户接近5小时使用限制时，自动暂停调度该账户。进入新的时间窗口后会自动恢复调度。',
    useUnifiedUserAgent: '使用统一 Claude Code 版本',
    useUnifiedUserAgentDescription: '开启后将使用从真实 Claude Code 客户端捕获的统一 User-Agent，提高兼容性',
    currentUnifiedVersion: '当前统一版本：',
    clearCache: '清除缓存',
    clearing: '清除中...',
    waitingForCapture: '等待从 Claude Code 客户端捕获 User-Agent',
    captureHint: '💡 提示：如果长时间未能捕获，请确认有 Claude Code 客户端正在使用此账户，或联系开发者检查 User-Agent 格式是否发生变化',
    useUnifiedClientId: '使用统一的客户端标识',
    useUnifiedClientIdDescription: '开启后将使用固定的客户端标识，使所有请求看起来来自同一个客户端，减少特征',
    clientIdLabel: '客户端标识 ID',
    regenerateClientId: '重新生成',
    clientIdDescription: '此ID将替换请求中的user_id客户端部分，保留session部分用于粘性会话',
    
    // 编辑模式字段
    accountNameEdit: '账户名称',
    accountNameEditPlaceholder: '为账户设置一个易识别的名称',
    descriptionOptionalEdit: '描述 (可选)',
    descriptionOptionalEditPlaceholder: '账户用途说明...',
    accountTypeEdit: '账户类型',
    selectGroupRequired: '选择分组 *',
    noAvailableGroups: '暂无可用分组',
    membersCount: ' 个成员',
    createNewGroup: '新建分组',
    
    // AWS Bedrock 配置
    bedrockCredentials: '凭证配置',
    bedrockCredentialsDescription: '请填写 AWS 访问凭证，用于调用 Amazon Bedrock 服务。',
    awsAccessKeyId: 'AWS Access Key ID *',
    awsAccessKeyIdPlaceholder: '请输入 AWS 访问密钥 ID...',
    awsSecretAccessKey: 'AWS Secret Access Key *',
    awsSecretAccessKeyPlaceholder: '请输入 AWS 秘密访问密钥...',
    sessionTokenOptional: 'Session Token (可选)',
    sessionTokenOptionalPlaceholder: '临时凭证的会话令牌...',
    sessionTokenDescription: '仅在使用临时凭证（如 STS 生成的凭证）时需要填写',
    awsRegion: 'AWS 区域 *',
    awsRegionPlaceholder: '选择 AWS 区域...',
    bedrockModelConfig: '模型配置',
    defaultModelLabel: '默认模型',
    defaultModelPlaceholder: '例如：anthropic.claude-3-5-sonnet-20240620-v1:0',
    defaultModelDescription: '留空将使用系统默认模型。支持 inference profile ID 或 ARN',
    smallFastModelLabel: '小型快速模型',
    smallFastModelPlaceholder: '例如：anthropic.claude-3-haiku-20240307-v1:0',
    smallFastModelDescription: '用于简单任务的快速模型，支持 inference profile ID 或 ARN',
    
    // Azure OpenAI 配置
    azureOpenAIConfig: 'Azure OpenAI 配置',
    azureOpenAIDescription: '请配置 Azure OpenAI 服务的连接信息和部署详情。',
    azureEndpoint: 'Azure Endpoint *',
    azureEndpointPlaceholder: '例如：https://your-resource.openai.azure.com/',
    azureEndpointDescription: 'Azure OpenAI 服务的端点 URL',
    azureApiKey: 'API Key *',
    azureApiKeyPlaceholder: '请输入 Azure OpenAI API Key...',
    azureApiVersion: 'API 版本',
    azureApiVersionDescription: 'Azure OpenAI API 版本，通常使用最新版本',
    azureDeploymentName: '部署名称 *',
    azureDeploymentNamePlaceholder: '例如：gpt-4',
    azureDeploymentDescription: '在 Azure OpenAI Studio 中创建的部署名称',
    azureSupportedModels: '支持的模型',
    azureSupportedModelsPlaceholder: '例如：gpt-4, gpt-3.5-turbo',
    azureSupportedModelsDescription: '此账户支持的模型列表，用逗号分隔。留空表示支持所有模型',
    azureAccountSettings: '账户设置',
    azureIsActive: '启用此账户',
    azureSchedulable: '允许调度',
    
    // Claude Console 模型映射
    claudeConsoleModels: '模型映射',
    claudeConsoleModelsDescription: '配置模型请求的映射关系，将客户端请求的模型名映射为实际调用的模型。',
    modelMappingFrom: '请求模型',
    modelMappingFromPlaceholder: '例如：claude-3-5-sonnet-20241022',
    modelMappingTo: '实际模型',
    modelMappingToPlaceholder: '例如：claude-3-5-sonnet-latest',
    addModelMapping: '添加映射',
    removeMapping: '移除',
    presetMappings: '预设映射',
    modelMappingExample: '示例：claude-3-5-sonnet-20241022 → claude-3-5-sonnet-latest',
    noMappingsConfigured: '暂未配置映射，将直接使用原模型名',
    
    // Setup Token 授权流程详细步骤
    setupTokenAuth: 'Setup Token 授权',
    setupTokenAuthDescription: 'Setup Token 是安全的授权方式，通过临时授权码完成账户验证。',
    setupTokenStep1: '步骤 1：生成授权链接',
    setupTokenStep1Description: '系统将生成一个专用的授权链接，用于获取临时授权码。',
    setupTokenStep2: '步骤 2：完成授权',
    setupTokenStep2Description: '在新窗口中打开授权链接，使用您的 Claude 账户登录并完成授权。',
    setupTokenStep3: '步骤 3：输入授权码',
    setupTokenStep3Description: '授权成功后，系统会显示授权码，请复制并粘贴到下方输入框。',
    setupTokenUrlGenerated: '授权链接已生成',
    setupTokenOpenInBrowser: '在浏览器中打开',
    setupTokenCopyLink: '复制链接',
    setupTokenUrlExpiry: '此链接10分钟后过期，请尽快完成授权',
    setupTokenAuthCode: 'Authorization Code *',
    setupTokenAuthCodePlaceholder: '请粘贴从授权页面获取的授权码...',
    setupTokenAuthCodeDescription: '完成授权后，将显示类似 "auth_code_xxx" 格式的授权码',
    setupTokenSmartDetection: '智能检测',
    setupTokenSmartDetectionDesc: '支持直接粘贴完整的回调URL，系统会自动提取授权码',
    
    // 更多错误消息和验证文本
    unsupportedPlatform: '不支持的平台',
    accountCreationFailed: '账户创建失败',
    accountUpdateFailed: '账户更新失败',
    detailsInfo: '详细信息',
    accountCreationFailedConsole: '账户创建失败:',
    accountUpdateFailedConsole: '账户更新失败:',
    clearCacheFailedWithError: '清除缓存失败：',
    unknownError: '未知错误',
    modelMappingExistsInfo: '模型映射已存在',
    modelAddedMapping: '已添加映射',
    
    // 限流和配额管理
    rateLimitSettings: '限流设置',
    enableRateLimit: '启用速率限制',
    rateLimitDuration: '限流时长 (秒)',
    rateLimitDurationPlaceholder: '例如：60',
    rateLimitDescription: '启用后将限制请求频率，防止账户被封锁',
    quotaManagement: '配额管理',
    dailyQuotaLabel: '每日配额限制',
    dailyQuotaPlaceholder: '0 表示不限制',
    quotaResetTimeLabel: '配额重置时间',
    quotaResetTimePlaceholder: '例如：00:00',
    quotaResetDescription: '每天配额重置的时间点',
    currentDailyUsage: '今日已用',
    
    // 高级设置
    advancedSettings: '高级设置',
    customUserAgent: '自定义 User-Agent',
    customUserAgentPlaceholder: '留空使用默认 User-Agent...',
    userAgentDescription: '用于请求时的 User-Agent 标识',
    
    // 通用提示和状态
    notSet: '未设置',
    unlimited: '无限制',
    enabled: '已启用',
    disabled: '已禁用',
    active: '活跃',
    inactive: '非活跃',
    optional: '可选',
    required: '必填',
    recommended: '推荐',
    
    // 额外的操作按钮
    testConnection: '测试连接',
    testing: '测试中...',
    refresh: '刷新',
    refreshing: '刷新中...',
    validate: '验证',
    validating: '验证中...',
    save: '保存',
    saving: '保存中...',
    
    // 使用情况和统计
    usageStats: '使用统计',
    loadingUsage: '加载使用情况...',
    usageLoadFailed: '使用情况加载失败',
    
    // Gemini 项目 ID 详细说明
    geminiProjectIdRequired: 'Google Cloud/Workspace 账号需要提供项目 ID',
    geminiProjectIdDetail: '某些 Google 账号（特别是绑定了 Google Cloud 的账号）会被识别为 Workspace 账号，需要提供额外的项目 ID。',
    geminiHowToGetProjectId: '如何获取项目 ID：',
    geminiVisitConsole: '访问',
    geminiCopyProjectId: '复制\u9879目 ID（Project ID）\uff0c通常是字符串格式',
    geminiProjectIdWarning: '⚠️ 注意：要复制项目 ID（Project ID），不要复制项目编号（Project Number）！',
    geminiPersonalAccountTip: '\u63d0示\uff1a如果您的账号是普通个人账号（未绑定 Google Cloud），请留空此字段。',
    
    // AWS 区域参考
    awsRegionReference: '常用 AWS 区域参考：',
    awsRegionEastUS: 'us-east-1 (美国东部)',
    awsRegionWestUS: 'us-west-2 (美国西部)',
    awsRegionEuropeIreland: 'eu-west-1 (欧洲爱尔兰)',
    awsRegionAsiaSingapore: 'ap-southeast-1 (新加坡)',
    awsRegionAsiaTokyo: 'ap-northeast-1 (东京)',
    awsRegionEuropeFrankfurt: 'eu-central-1 (法兰克福)',
    awsRegionInputTip: '💡 请输入完整的区域代码，如 us-east-1',
    
    // Bedrock 模型说明
    bedrockModelConfigDesc: 'Bedrock 模型配置说明：',
    bedrockSupportsInferenceProfile: '支持 Inference Profile ID（推荐）',
    bedrockSupportsARN: '支持 Application Inference Profile ARN',
    bedrockCommonModel: '常用模型：us.anthropic.claude-sonnet-4-20250514-v1:0',
    bedrockEmptyUsesDefault: '留空将使用系统配置的默认模型',
    
    // Azure OpenAI 模型选择
    azureModelSelectionDesc: '选择此部署支持的模型类型',
    
    // 限流机制
    rateLimitMechanism: '限流机制',
    enableRateLimitMechanism: '启用限流机制',
    rateLimitDescription2: '启用后，当账号返回429错误时将暂停调度一段时间',
    
    // Claude Console 特定字段
    claudeConsoleFields: 'Claude Console 特定字段',
    quotaManagement: '额度管理',
    modelMappingTable: '模型映射表',
    modelMappingTableOptional: '模型映射表 (可选)',
    addModelMapping: '添加模型映射',
    
    // Claude 订阅类型
    subscriptionType: '订阅类型',
    
    // Setup Token 授权
    setupTokenAuth: 'Setup Token 授权',
    claudeSetupTokenAuth: 'Claude Setup Token 授权',
    setupTokenAuthSteps: '请按照以下步骤通过 Setup Token 完成 Claude 账户的授权：',
    generateSetupTokenLink: '生成 Setup Token 授权链接',
    generating: '生成中...',
    
    // 按钮和操作
    verifying: '验证中...',
    completeAuth: '完成授权',
    updating: '更新中...',
    update: '更新',
    
    // 错误消息
    generateSetupTokenFailed: '生成Setup Token授权链接失败',
    copyFailed: '复制失败，请手动复制',
    setupTokenAuthFailed: 'Setup Token授权失败，请检查授权码是否正确',
    accountCreationFailed: '账户创建失败',
    accountCreationError: '账户创建失败:',
    
    // 页面结构注释
    stepIndicator: '步骤指示器',
    step1BasicInfo: '步骤1: 基本信息和代理设置',
    groupSelector: '分组选择器',
    multiSelectGroup: '多选分组界面',
    newGroupOption: '新建分组选项',
    geminiProjectId: 'Gemini 项目 ID 字段',
    bedrockFields: 'Bedrock 特定字段',
    azureOpenAIFields: 'Azure OpenAI 特定字段',
    
    // 验证消息
    nameRequired: '请填写账户名称',
    apiUrlRequired: '请填写 API URL',
    rateLimitDefault60: '默认60分钟',
    rateLimitPauseDescription: '账号被限流后暂停调度的时间（分钟）',
    apiUrlPlaceholder: '例如：https://api.example.com',
    apiKeyPlaceholder: '请输入API Key',
    dailyQuotaLimit: '每日额度限制 ($)',
    quotaZeroUnlimited: '0 表示不限制',
    dailyQuotaDescription: '设置每日使用额度，0 表示不限制',
    quotaResetTime: '额度重置时间',
    quotaResetTimeDescription: '每日自动重置额度的时间',
    modelMappingDescription: '留空表示支持所有模型且不修改请求。配置映射后，左侧模型会被识别为支持的模型，右侧是实际发送的模型。',
    rateLimitDurationMinutes: '限流时间 (分钟)',
    rateLimitDefaultMinutes: '默认60分钟',
    rateLimitPauseDesc: '账号被限流后暂停调度的时间（分钟）',
    
    // 额度管理
    quotaManagementFields: '额度管理字段',
    dailyQuotaLimitDollar: '每日额度限制 ($)',
    quotaZeroUnlimited: '0 表示不限制',
    dailyQuotaDesc: '设置每日使用额度，0 表示不限制',
    quotaResetTime: '额度重置时间',
    quotaResetTimeDesc: '每日自动重置额度的时间',
    
    // 模型映射
    modelMappingOptional: '模型映射表 (可选)',
    modelMappingDesc: '留空表示支持所有模型且不修改请求。配置映射后，左侧模型会被识别为支持的模型，右侧是实际发送的模型。',
    originalModelName: '原始模型名称',
    mappedModelName: '映射后的模型名称',
    addModelMappingBtn: '添加模型映射',
    customUserAgentOptional: '自定义 User-Agent (可选)',
    customUserAgentDesc: '留空时将自动使用客户端的 User-Agent，仅在需要固定特定 UA 时填写',
    userAgentPassthrough: '留空则透传客户端 User-Agent',
    
    // Claude 订阅类型
    claudeSubscriptionType: '订阅类型',
    claudeProLimitation: 'Pro 账号不支持 Claude Opus 4 模型',
    
    // Claude 高级选项
    claudeAutoStopScheduling: '5小时使用量接近限制时自动停止调度',
    claudeAutoStopDesc: '当系统检测到账户接近5小时使用限制时，自动暂停调度该账户。进入新的时间窗口后会自动恢复调度。',
    claudeUseUnifiedUA: '使用统一 Claude Code 版本',
    claudeUnifiedUADesc: '开启后将使用从真实 Claude Code 客户端捕获的统一 User-Agent，提高兼容性',
    claudeCurrentUnifiedVersion: '💡 当前统一版本：',
    claudeWaitingCapture: '⏳ 等待从 Claude Code 客户端捕获 User-Agent',
    claudeCaptureHint: '💡 提示：如果长时间未能捕获，请确认有 Claude Code 客户端正在使用此账户， 或联系开发者检查 User-Agent 格式是否发生变化',
    claudeUseUnifiedClientId: '使用统一的客户端标识',
    claudeUnifiedClientIdDesc: '开启后将使用固定的客户端标识，使所有请求看起来来自同一个客户端，减少特征',
    claudeClientIdLabel: '客户端标识 ID',
    claudeClientIdDesc: '此ID将替换请求中的user_id客户端部分，保留session部分用于粘性会话',
    
    // Setup Token 流程
    setupTokenAuthProcess: 'Claude Setup Token 授权',
    setupTokenProcessDesc: '请按照以下步骤通过 Setup Token 完成 Claude 账户的授权：',
    setupTokenStepOneTitle: '步骤 1：生成授权链接',
    setupTokenStepOneDesc: '点击下方按钮生成授权链接',
    setupTokenGenerating: '生成中...',
    setupTokenGenerateBtn: '生成 Setup Token 授权链接',
    setupTokenCopyTitle: '复制链接',
    
    // 步骤指示器
    stepIndicator: '步骤指示器',
    step1BasicInfo: '步骤1: 基本信息和代理设置',
    step2OAuth: '步骤2: OAuth授权',
    step2SetupToken: '步骤2: Setup Token授权',
    
    // 分组选择器
    groupSelector: '分组选择器',
    multiGroupInterface: '多选分组界面',
    createNewGroupOption: '新建分组选项',
    
    // 手动输入Token提示
    credentialsFromFile: '文件中的凭证。',
    
    // Placeholder 文本
    originalModelNamePlaceholder: '原始模型名称',
    mappedModelNamePlaceholder: '映射后的模型名称',
    userAgentPlaceholder: '留空则透传客户端 User-Agent',
    authCodePlaceholder: '粘贴从Claude Code授权页面获取的Authorization Code...',
    leaveEmptyNoUpdate: '留空表示不更新',
    leaveEmptyNoUpdateKey: '留空表示不更新 API Key',
    leaveEmptyNoUpdateToken: '留空表示不更新...',
    
    // 标签和描述
    customUserAgentOptional: '自定义 User-Agent (可选)',
    clientIdLabel: '客户端标识 ID',
    schedulePriorityLabel: '调度优先级 (1-100)',
    attentionLabel: '注意：',
    supportedModelsLabel: '支持的模型',
    newAccessTokenLabel: '新的 Access Token',
    newRefreshTokenLabel: '新的 Refresh Token',
    updateTokenLabel: '更新 Token',
    
    // 按钮文本
    regenerateBtn: '重新生成',
    previousStepBtn: '上一步',
    
    // 描述性文本
    claudeProLimitation: 'Pro 账号不支持 Claude Opus 4 模型',
    claude5HourLimitDesc: '5小时使用量接近限制时自动停止调度',
    claude5HourLimitExplanation: '当系统检测到账户接近5小时使用限制时，自动暂停调度该账户。进入新的时间窗口后会自动恢复调度。',
    useUnifiedClaudeVersion: '使用统一 Claude Code 版本',
    unifiedVersionDesc: '开启后将使用从真实 Claude Code 客户端捕获的统一 User-Agent，提高兼容性',
    currentUnifiedVersion: '💡 当前统一版本：',
    waitingUserAgent: '⏳ 等待从 Claude Code 客户端捕获 User-Agent',
    userAgentTip: '💡 提示：如果长时间未能捕获，请确认有 Claude Code 客户端正在使用此账户，',
    contactDeveloper: '或联系开发者检查 User-Agent 格式是否发生变化',
    useUnifiedClientId: '使用统一的客户端标识',
    unifiedClientIdDesc: '开启后将使用固定的客户端标识，使所有请求看起来来自同一个客户端，减少特征',
    clientIdReplaceDesc: '此ID将替换请求中的user_id客户端部分，保留session部分用于粘性会话',
    
    // OAuth 步骤文本
    step1GenerateAuthLink: '步骤1: 生成授权链接',
    clickButtonGenerate: '点击下方按钮生成授权链接',
    copyLinkTitle: '复制链接',
    step2AccessAndAuth: '步骤2: 访问链接并授权',
    openInBrowser: '在浏览器中打开链接并完成授权',
    browserAuthDesc: '请在新标签页中打开授权链接，登录您的 Claude 账户并授权 Claude Code。',
    proxyNotice: '如果您设置了代理，请确保浏览器也使用相同的代理访问授权页面。',
    step3InputAuthCode: '步骤3: 输入授权码',
    inputAuthCodeTitle: '输入 Authorization Code',
    authCompleteDesc: '授权完成后，从返回页面复制 Authorization Code，并粘贴到下方输入框：',
    pasteAuthCodeDesc: '请粘贴从 Claude Code 授权页面复制的 Authorization Code',
    
    // AWS 区域参考
    awsRegionRef: '常用 AWS 区域参考：',
    
    // 错误信息
    apiKeyRequired: '请填写 API Key',
    refreshTokenRequired: '请填写 Refresh Token',
    accessTokenRequired: '请填写 Access Token',
    copyFailedManual: '复制失败，请手动复制',
    
    // 表单描述
    modelSupportDesc: '留空表示支持所有模型。如果指定模型，请求中的模型不在列表内将不会调度到此账号',
    modelTypeSelectionDesc: '选择此部署支持的模型类型',
    userAgentDesc: '留空时将自动使用客户端的 User-Agent，仅在需要固定特定 UA 时填写',
    
    // 基础标签
    apiUrlLabel: 'API URL',
    apiUrlRequired: 'API URL *',
    apiKeyLabel: 'API Key',
    apiKeyRequired: 'API Key *',
    
    // 更多缺失的翻译键
    copyLinkTooltip: '复制链接',
    
    // Claude 订阅类型显示
    claudeMaxDisplay: 'Claude Max',
    claudeProDisplay: 'Claude Pro'
  }
}
