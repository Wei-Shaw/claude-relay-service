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
  }
}
