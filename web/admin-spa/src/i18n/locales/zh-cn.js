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
  }
}
