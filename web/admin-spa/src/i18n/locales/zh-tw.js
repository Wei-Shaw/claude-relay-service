export default {
  common: {
    save: '保存',
    cancel: '取消',
    confirm: '確認',
    loading: '載入中...',
    edit: '編輯',
    delete: '刪除',
    create: '建立',
    update: '更新',
    search: '搜尋',
    reset: '重置',
    locale: 'zh-TW'
  },
  language: {
    zh: '簡體中文',
    'zh-tw': '繁體中文',
    en: 'English',
    current: '當前語言',
    switch: '切換語言'
  },
  header: {
    adminPanel: '管理後台',
    userMenu: '用戶選單',
    logout: '退出登錄',
    settings: '系統設置',
    
    // Version related
    currentVersion: '當前版本',
    newVersionAvailable: '有新版本可用',
    newVersion: '新版本',
    hasUpdate: '有新版本',
    viewUpdate: '查看更新',
    checkingUpdate: '檢查更新中...',
    alreadyLatest: '當前已是最新版本',
    checkUpdate: '檢查更新',
    
    // User menu items
    changeAccountInfo: '修改帳戶資訊',
    
    // Change password modal
    changePasswordModal: {
      title: '修改帳戶資訊',
      currentUsername: '當前用戶名',
      currentUsernameHint: '當前用戶名，輸入新用戶名以修改',
      newUsername: '新用戶名',
      newUsernamePlaceholder: '輸入新用戶名（留空保持不變）',
      newUsernameHint: '留空表示不修改用戶名',
      currentPassword: '當前密碼',
      currentPasswordPlaceholder: '請輸入當前密碼',
      newPassword: '新密碼',
      newPasswordPlaceholder: '請輸入新密碼',
      newPasswordHint: '密碼長度至少8位',
      confirmPassword: '確認新密碼',
      confirmPasswordPlaceholder: '請再次輸入新密碼',
      saving: '保存中...',
      save: '保存修改',
      
      // Messages
      passwordMismatch: '兩次輸入的密碼不一致',
      passwordTooShort: '新密碼長度至少8位',
      accountInfoChangeSuccess: '帳戶資訊修改成功，請重新登錄',
      passwordChangeSuccess: '密碼修改成功，請重新登錄',
      changeFailed: '修改失敗',
      changePasswordFailed: '修改密碼失敗'
    },
    
    // Logout
    logoutConfirm: '確定要退出登錄嗎？',
    logoutSuccess: '已安全退出'
  },
  apiStats: {
    title: 'API Key 使用統計',
    tutorialTitle: '使用教學',
    userLogin: '用戶登錄',
    adminPanel: '管理後台',
    statsQuery: '統計查詢',
    tutorial: '使用教學',
    timeRange: '統計時間範圍',
    today: '今日',
    thisMonth: '本月',
    
    // API Key Input
    usageStatsQuery: '使用統計查詢',
    apiKeyDescription: '查詢您的 API Key 使用情況和統計資料',
    enterApiKey: '輸入您的 API Key',
    enterApiKeys: '輸入您的 API Keys（每行一個或用逗號分隔）',
    singleMode: '單一',
    aggregateMode: '彙整',
    singleModeTitle: '單一模式',
    aggregateModeTitle: '彙整模式',
    queryButton: '查詢',
    
    // Stats Overview
    batchQuerySummary: '批次查詢概要',
    apiKeyInfo: 'API Key 資訊',
    queryKeysCount: '查詢 Keys 數',
    activeKeysCount: '有效 Keys 數',
    invalidKeysCount: '無效 Keys 數',
    totalRequests: '總請求數',
    totalTokens: '總 Token 數',
    totalCost: '總費用',
    individual: '個',
    
    // Aggregated Stats Card
    usageRatio: '使用占比',
    requests: '次',
    otherKeys: '其他',
    keys: 'Keys',
    
    // Model Usage Stats
    modelUsageStats: '模型使用統計',
    loadingModelStats: '載入模型統計資料中...',
    requestCount: '次請求',
    totalCost: '總費用',
    inputTokens: '輸入 Token',
    outputTokens: '輸出 Token',
    cacheCreateTokens: '快取建立',
    cacheReadTokens: '快取讀取',
    noModelData: '暫無{period}模型使用資料',
    
    // Token Distribution
    tokenDistribution: 'Token 使用分佈',
    inputToken: '輸入 Token',
    outputToken: '輸出 Token',
    cacheCreateToken: '快取建立 Token',
    cacheReadToken: '快取讀取 Token',
    
    // Limit Config
    limitConfig: '限制設定',
    limitConfigAggregate: '限制設定（彙整查詢模式）',
    apiKeysOverview: 'API Keys 概況',
    totalKeys: '總計 Keys',
    activeKeys: '啟用 Keys',
    aggregatedStats: '彙整統計',
    dailyLimit: '日限制',
    monthlyLimit: '月限制',
    usageToday: '今日使用',
    usageThisMonth: '本月使用',
    remaining: '剩餘',
    
    // Stats Overview - Additional keys
    name: '名稱',
    status: '狀態',
    permissions: '權限',
    createdAt: '建立時間',
    expiresAt: '過期時間',
    active: '活躍',
    inactive: '已停用',
    notActivated: '未啓動',
    expired: '已過期',
    neverExpires: '永不過期',
    allModels: '全部模型',
    unknown: '未知',
    none: '無',
    formatError: '格式錯誤',
    usageStatsOverview: '使用統計概覽',
    keyContribution: '各 Key 貢獻占比',
    firstUseDays: '首次使用後{days}天過期',
    todayRequests: '今日請求數',
    todayTokens: '今日Token數',
    todayCost: '今日費用',
    todayInputTokens: '今日輸入Token',
    monthlyRequests: '本月請求數',
    monthlyTokens: '本月Token數',
    monthlyCost: '本月費用',
    monthlyInputTokens: '本月輸入Token',
    
    // Limit Config - Additional keys
    dailyCostLimit: '每日費用限制',
    concurrencyLimit: '並發限制',
    modelLimit: '模型限制',
    clientLimit: '用戶端限制',
    restrictedModelsCount: '限制 {count} 個模型',
    allowAllModels: '允許所有模型',
    restrictedClientsCount: '限制 {count} 個用戶端',
    allowAllClients: '允許所有用戶端',
    detailedLimitInfo: '詳細限制資訊',
    restrictedModelsList: '受限模型清單',
    restrictedModelsNote: '此 API Key 不能存取以上列出的模型',
    allowedClientsList: '允許的用戶端',
    allowedClientsNote: '此 API Key 只能被以上列出的用戶端使用',
    timeWindowLimit: '時間視窗限制',
    aggregateStatsNote: '每個 API Key 有獨立的限制設定，彙整模式下不顯示單個限制配置',
    aggregateStatsSummary: '彙整統計摘要',
    invalidKeysCount: '{count} 個無效的 API Key',
    orRelationshipRequests: '請求次數和費用限制為「或」的關係，任一達到限制即觸發限流',
    orRelationshipTokens: '請求次數和Token使用量為「或」的關係，任一達到限制即觸發限流',
    onlyRequestsLimit: '僅限制請求次數',
    
    // Token Distribution - Additional keys
    totalAmount: '總計',
    todayTotal: '今日總計',
    monthlyTotal: '本月總計',
    
    // Additional missing keys
    usageRatioOnlyInMultiMode: '使用占比僅在多Key查詢時顯示',
    noData: '暫無資料',
    
    // ApiKeyInput placeholders and texts
    apiKeyPlaceholder: '請輸入您的 API Key (cr_...)',
    apiKeysPlaceholder: '請輸入您的 API Keys，支援以下格式：\ncr_xxx\ncr_yyy\n或\ncr_xxx, cr_yyy',
    clearInput: '清空輸入',
    securityNoticeSingle: '您的 API Key 僅用於查詢自己的統計資料，不會被儲存或用於其他用途',
    securityNoticeMulti: '您的 API Keys 僅用於查詢統計資料，不會被儲存。彙整模式下部分個體化資訊將不顯示。',
    multiKeyTip: '提示：最多支援同時查詢 30 個 API Keys。使用 Ctrl+Enter 快速查詢。'
  },
  
  // Login page
  login: {
    title: '管理後台',
    username: '用戶名',
    usernamePlaceholder: '請輸入用戶名',
    password: '密碼',
    passwordPlaceholder: '請輸入密碼',
    loginButton: '登錄',
    loggingIn: '登錄中...'
  },
  
  // Dashboard page
  dashboard: {
    // Main stats cards
    totalApiKeys: '總 API Keys',
    activeApiKeys: '活躍',
    serviceAccounts: '服務帳戶',
    normalAccounts: '正常',
    abnormalAccounts: '異常',
    pausedAccounts: '停止調度',
    rateLimitedAccounts: '限流',
    todayRequests: '今日請求',
    totalRequests: '總請求',
    systemStatus: '系統狀態',
    uptime: '運行時間',
    
    // Platform accounts tooltip
    claudeAccount: 'Claude: {total} 個 (正常: {normal})',
    consoleAccount: 'Console: {total} 個 (正常: {normal})',
    geminiAccount: 'Gemini: {total} 個 (正常: {normal})',
    bedrockAccount: 'Bedrock: {total} 個 (正常: {normal})',
    openaiAccount: 'OpenAI: {total} 個 (正常: {normal})',
    azureOpenaiAccount: 'Azure OpenAI: {total} 個 (正常: {normal})',
    
    // Token stats cards
    todayToken: '今日Token',
    totalTokenConsumption: '總Token消耗',
    inputTokens: '輸入',
    outputTokens: '輸出',
    cacheCreateTokens: '快取建立',
    cacheReadTokens: '快取讀取',
    
    // Real-time metrics
    realtimeRPM: '即時RPM',
    realtimeTPM: '即時TPM',
    requestsPerMinute: '每分钟請求數',
    tokensPerMinute: '每分钟Token數',
    historicalData: '歷史資料',
    minutes: '分钟',
    
    // Charts section
    modelDistributionAndTrend: '模型使用分佈與Token使用趋勢',
    
    // Date filter presets
    today: '今日',
    yesterday: '昨日',
    last7Days: '近 7 天',
    last30Days: '近 30 天',
    thisWeek: '本週',
    lastWeek: '上週',
    thisMonth: '本月',
    lastMonth: '上月',
    
    // Granularity buttons
    byDay: '按日',
    byHour: '按小時',
    
    // Date picker
    startDatePlaceholder: '開始日期',
    endDatePlaceholder: '結束日期',
    dateSeparator: '至',
    maxHours24: '最多24小時',
    
    // Auto refresh controls
    autoRefresh: '自動刷新',
    refresh: '刷新',
    refreshing: '刷新中',
    refreshDataNow: '立即刷新資料',
    
    // Charts
    tokenUsageDistribution: 'Token使用分佈',
    detailedStatistics: '詳細統計資料',
    noModelUsageData: '暫無模型使用資料',
    
    // Table headers
    model: '模型',
    requestCount: '請求數',
    totalTokens: '總Token',
    cost: '費用',
    percentage: '占比',
    
    // Trend charts
    tokenUsageTrend: 'Token使用趋勢',
    apiKeysUsageTrend: 'API Keys 使用趋勢',
    requestsCount: '請求次數',
    tokenCount: 'Token 數量',
    totalApiKeysCount: '共 {count} 個 API Key',
    showingTop10: '共 {count} 個 API Key，顯示使用量前 10 個',
    
    // Chart labels
    inputTokensLabel: '輸入Token',
    outputTokensLabel: '輸出Token',
    cacheCreateTokensLabel: '快取建立Token',
    cacheReadTokensLabel: '快取讀取Token',
    costLabel: '費用 (USD)',
    requestsLabel: '請求數',
    time: '時間',
    date: '日期',
    tokenQuantity: 'Token數量',
    requestsQuantity: '請求次數'
  },
  
  // Accounts page
  accounts: {
    title: '帳戶管理',
    description: '管理您的 Claude、Gemini、OpenAI 和 Azure OpenAI 帳戶及代理配置',
    
    // Filters and sorting
    sortBy: '選擇排序',
    selectPlatform: '選擇平台',
    selectGroup: '選擇分組',
    refresh: '刷新',
    refreshTooltip: '刷新資料 (Ctrl/⌘+點擊強制刷新所有快取)',
    addAccount: '添加帳戶',
    
    // Sort options
    sortByName: '按名稱排序',
    sortByDailyTokens: '按今日Token排序',
    sortByDailyRequests: '按今日請求數排序',
    sortByTotalTokens: '按總Token排序',
    sortByLastUsed: '按最後使用排序',
    
    // Platform options
    allPlatforms: '所有平台',
    claudePlatform: 'Claude',
    claudeConsolePlatform: 'Claude Console',
    geminiPlatform: 'Gemini',
    openaiPlatform: 'OpenAi',
    azureOpenaiPlatform: 'Azure OpenAI',
    bedrockPlatform: 'Bedrock',
    
    // Group options
    allAccounts: '所有帳戶',
    ungroupedAccounts: '未分組帳戶',
    
    // Loading states
    loadingAccounts: '正在載入帳戶...',
    noAccounts: '暫無帳戶',
    noAccountsHint: '點擊上方按鈕添加您的第一個帳戶',
    
    // Table headers
    name: '名稱',
    platformType: '平台/類型',
    status: '狀態',
    priority: '優先級',
    proxy: '代理',
    dailyUsage: '今日使用',
    sessionWindow: '會話窗口',
    lastUsed: '最後使用',
    actions: '操作',
    
    // Account types
    dedicated: '專屬',
    groupScheduling: '分組調度',
    shared: '共享',
    belongsToGroup: '所屬分組: {name}',
    
    // Platform labels
    unknown: '未知',
    apiKey: 'API Key',
    oauth: 'OAuth',
    setup: 'Setup',
    aws: 'AWS',
    
    // Account status
    normal: '正常',
    abnormal: '異常',
    blocked: '已封鎖',
    tempError: '臨時異常',
    rateLimited: '限流中',
    notSchedulable: '不可調度',
    bound: '綁定: {count} 個API Key',
    
    // Proxy status
    noProxy: '無代理',
    
    // Usage statistics
    requests: '次',
    noData: '暫無資料',
    averageRpm: '平均 {rpm} RPM',
    
    // Session window tooltip
    sessionWindowTooltip: {
      title: '會話窗口進度表示5小時窗口的時間進度',
      normal: '正常：請求正常處理',
      warning: '警告：接近限制',
      rejected: '拒絕：達到速率限制'
    },
    
    // Session window status
    remaining: '剩餘 {time}',
    ended: '已結束',
    
    // Console quota
    quotaProgress: '額度進度',
    remainingQuota: '剩餘 $${amount}',
    reset: '重置 {time}',
    
    // Mobile view labels
    dailyUsageLabel: '今日使用',
    sessionWindowLabel: '會話窗口',
    lastUsedLabel: '最後使用',
    proxyLabel: '代理',
    priorityLabel: '優先級',
    neverUsed: '從未使用',
    sessionWindowTooltipMobile: '會話窗口進度不代表使用量，僅表示距離下一個5小時窗口的剩餘時間',
    
    // Action buttons
    resetStatus: '重置狀態',
    resetting: '重置中...',
    resetStatusTooltip: '重置所有異常狀態',
    scheduling: '調度',
    disabled: '停用',
    enableTooltip: '點擊啟用調度',
    disableTooltip: '點擊禁用調度',
    edit: '編輯',
    editTooltip: '編輯帳戶',
    delete: '刪除',
    deleteTooltip: '刪除帳戶',
    pause: '暫停',
    enable: '啟用',
    
    // Time formatting
    justNow: '剛剛',
    minutesAgo: '{minutes} 分鐘前',
    hoursAgo: '{hours} 小時前',
    daysAgo: '{days} 天前',
    hoursAndMinutes: '{hours}小時{minutes}分鐘',
    hoursOnly: '{hours}小時',
    minutesOnly: '{minutes}分鐘',
    daysAndHours: '{days}天{hours}小時',
    daysOnly: '{days}天',
    
    // Rate limit time
    rateLimitTime: '({time})',
    
    // Messages and confirmations
    resetStatusConfirmTitle: '重置帳戶狀態',
    resetStatusConfirmMessage: '確定要重置此帳戶的所有異常狀態嗎？這將清除限流狀態、401錯誤計數等所有異常標記。',
    resetStatusConfirmButton: '確定重置',
    resetStatusCancelButton: '取消',
    statusResetSuccess: '帳戶狀態已重置',
    statusResetFailed: '狀態重置失敗',
    
    deleteAccountTitle: '刪除帳戶',
    deleteAccountMessage: '確定要刪除帳戶 "{name}" 嗎？\n\n此操作不可恢復。',
    deleteAccountButton: '刪除',
    deleteAccountCancel: '取消',
    cannotDeleteBoundAccount: '無法刪除此帳號，有 {count} 個API Key綁定到此帳號，請先解綁所有API Key',
    accountDeleted: '帳戶已刪除',
    deleteFailed: '刪除失敗',
    
    enabledScheduling: '已啟用調度',
    disabledScheduling: '已禁用調度',
    schedulingToggleFailed: '切換調度狀態失敗',
    unsupportedAccountType: '該帳戶類型暫不支持調度控制',
    operationFailed: '操作失敗',
    
    accountCreateSuccess: '帳戶創建成功',
    accountUpdateSuccess: '帳戶更新成功',
    loadAccountsFailed: '載入帳戶失敗',
    unsupportedAccountTypeReset: '不支持的帳戶類型',
    
    // Schedulable reasons
    invalidApiKey: 'API Key無效或已過期（401錯誤）',
    serviceOverload: '服務過載（529錯誤）',
    rateLimitTriggered: '觸發限流（429錯誤）',
    authFailed: '認證失敗（401錯誤）',
    manualStop: '手動停止調度',
    
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
    description: '管理和監控您的 API 密鑰',
    
    // Tab navigation
    activeTab: '活躍 API Keys',
    deletedTab: '已刪除 API Keys',
    
    // Toolbar and actions
    refresh: '重新整理',
    refreshTooltip: '重新整理 API Keys 清單（Ctrl+點擊強制重新整理）',
    createNew: '建立新 Key',
    bulkEdit: '編輯已選取',
    bulkDelete: '刪除已選取',
    
    // Table headers
    name: '名稱',
    tags: '標籤',
    status: '狀態',
    usageStats: '使用統計',
    createdAt: '建立時間',
    expiresAt: '過期時間',
    actions: '操作',
    
    // Filter options
    timeRange: {
      today: '今日',
      week: '最近7天',
      month: '本月',
      all: '全部時間'
    },
    
    // Status
    active: '活躍',
    disabled: '停用',
    expired: '已過期',
    expiringSoon: '即將過期',
    neverExpire: '永不過期',
    notActivated: '未啟用',
    
    // Usage statistics
    dailyCost: '今日費用',
    totalCost: '總費用',
    dailyRequests: '今日請求',
    lastUsed: '最後使用',
    neverUsed: '從未使用',
    minutesAgo: '{minutes} 分鐘前',
    hoursAgo: '{hours} 小時前',
    daysAgo: '{days} 天前',
    justNow: '剛剛',
    requests: '次',
    
    // Search and filter
    searchPlaceholder: '搜尋名稱...',
    searchPlaceholderWithOwner: '搜尋名稱或擁有者...',
    allTags: '所有標籤',
    noTags: '無標籤',
    
    // Binding information
    shared: '使用共享池',
    dedicated: '專屬',
    consoleAccount: 'Console賬戶',
    bindingWarning: '⚠️ 賬戶不存在',
    
    // Limits and quotas
    dailyLimit: '每日費用',
    weeklyOpusLimit: 'Opus週費用',
    remainingQuota: '剩餘: ${amount}',
    reset: '重設於 {time}',
    quotaProgress: '配額進度',
    
    // Model statistics
    modelStats: '模型使用分佈',
    modelStatsCount: '{count} 個模型',
    totalTokens: '總Token',
    inputTokens: '輸入',
    outputTokens: '輸出',
    cacheCreate: '快取建立',
    cacheRead: '快取讀取',
    totalRequests: '總請求',
    noModelData: '暫無模型使用資料',
    resetFilter: '重新整理',
    adjustTimeRange: '嘗試調整時間範圍或點擊重新整理重新載入資料',
    
    // Date filter
    dateFilter: {
      today: '今日',
      days7: '7天',
      days30: '30天'
    },
    
    // Actions
    viewDetails: '查看詳細統計',
    edit: '編輯',
    renew: '續期',
    activate: '啟用',
    disable: '停用',
    copy: '複製',
    copyStatsLink: '複製統計頁面連結',
    
    // Pagination
    totalRecords: '共 {count} 條記錄',
    pageSize: '每頁顯示',
    records: '條',
    
    // Empty states
    noApiKeys: '暫無 API Keys',
    noApiKeysHint: '點擊上方按鈕建立您的第一個 API Key',
    noDeletedKeys: '暫無已刪除的 API Keys',
    noDeletedKeysHint: '已刪除的 API Keys 會出現在這裡',
    loading: '正在載入 API Keys...',
    loadingDeleted: '正在載入已刪除的 API Keys...',
    loadingModelStats: '載入模型統計...',
    
    // Deleted keys table
    creator: '建立者',
    deletedBy: '刪除者',
    deletedAt: '刪除時間',
    canRestore: '恢復',
    permanentDelete: '徹底刪除',
    clearAllDeleted: '清空所有已刪除',
    
    // User types
    admin: '管理員',
    user: '用戶',
    unknown: '未知',
    system: '系統',
    
    // Confirmation dialogs
    confirmDisable: '確定要停用 API Key "{name}" 嗎？停用後所有使用此 Key 的請求將返回 401 錯誤。',
    confirmDelete: '確定要刪除這個 API Key 嗎？此操作不可恢復。',
    confirmBatchDelete: '確定要刪除已選取的 {count} 個 API Key 嗎？此操作不可恢復。',
    confirmRestore: '確定要恢復這個 API Key 嗎？恢復後可以重新使用。',
    confirmPermanentDelete: '確定要徹底刪除這個 API Key 嗎？此操作不可恢復，所有相關資料將被永久刪除。',
    confirmClearAll: '確定要徹底刪除全部 {count} 個已刪除的 API Keys 嗎？此操作不可恢復，所有相關資料將被永久刪除。',
    
    // Success messages
    keyActivated: 'API Key 已啟用',
    keyDisabled: 'API Key 已停用',
    keyDeleted: 'API Key 已刪除',
    keyRestored: 'API Key 已成功恢復',
    keyPermanentDeleted: 'API Key 已徹底刪除',
    allDeletedCleared: '已清空所有已刪除的 API Keys',
    linkCopied: '已複製統計頁面連結',
    expiryUpdated: '過期時間已更新',
    
    // Error messages
    selectKeysFirst: '請先選擇要編輯的 API Keys',
    loadFailed: '載入 API Keys 失敗',
    operationFailed: '操作失敗',
    copyFailed: '複製失敗，請手動複製',
    updateFailed: '更新失敗',
    deleteFailed: '刪除失敗',
    restoreFailed: '恢復失敗',
    clearFailed: '清空失敗',
    
    // Tooltips and helpers
    editExpiry: '編輯過期時間',
    activationDays: '未啟用 ({days}天)',
    boundTo: '綁定到',
    belongsToGroup: '所屬分組: {name}',
    
    // Batch operations
    batchSuccess: '成功處理 {count} 個項目',
    batchPartialFail: '{failed} 個處理失敗',
    batchAllFailed: '所有項目處理失敗'
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

  // Settings 設置頁面
  settings: {
    title: '系統設置',
    description: '網站定制和通知配置',
    loading: '正在載入設置...',
    
    // 導航標籤
    branding: '品牌設置',
    webhook: '通知設置',
    
    // 品牌設置
    siteName: '網站名稱',
    siteNameDescription: '品牌標識',
    siteNamePlaceholder: 'Claude Relay Service',
    siteNameHint: '將顯示在瀏覽器標題和頁面頭部',
    
    siteIcon: '網站圖標',
    siteIconDescription: 'Favicon',
    currentIcon: '當前圖標',
    uploadIcon: '上傳圖標',
    removeIcon: '刪除',
    iconFormats: '支援 .ico, .png, .jpg, .svg 格式，最大 350KB',
    iconPreview: '圖標預覽',
    
    adminEntry: '管理入口',
    adminEntryDescription: '登入按鈕顯示',
    hideLoginButton: '隱藏登入按鈕',
    showLoginButton: '顯示登入按鈕',
    adminEntryHint: '隱藏後，用戶需要直接訪問 /admin/login 頁面登入',
    
    // 移動端卡片標題
    siteNameCard: '站點名稱',
    siteNameCardDesc: '自定義您的站點品牌名稱',
    siteIconCard: '站點圖標',
    siteIconCardDesc: '上傳自定義圖標或輸入圖標URL',
    adminEntryCard: '管理入口',
    adminEntryCardDesc: '控制登入按鈕在首頁的顯示',
    
    // 操作按鈕
    save: '保存設置',
    saving: '保存中...',
    reset: '重置為預設',
    lastUpdated: '最後更新：{time}',
    lastUpdatedMobile: '上次更新: {time}',
    
    // Webhook 設置
    enableWebhook: '啟用 Webhook 通知',
    webhookDescription: '開啟後，系統將按配置發送通知到指定平台',
    
    // 通知類型
    notificationTypes: '通知類型',
    accountAnomaly: '帳號異常',
    quotaWarning: '配額警告',
    systemError: '系統錯誤',
    securityAlert: '安全警報',
    accountAnomalyDesc: '帳號狀態異常、認證失敗等',
    quotaWarningDesc: 'API調用配額不足警告',
    systemErrorDesc: '系統運行錯誤和故障',
    securityAlertDesc: '安全相關的警報通知',
    
    // 通知平台
    notificationPlatforms: '通知平台',
    addPlatform: '新增平台',
    noPlatforms: '暫無配置的通知平台，請點擊「新增平台」按鈕新增',
    enableSignature: '已啟用簽名驗證',
    testConnection: '測試連線',
    edit: '編輯',
    delete: '刪除',
    
    // 高級設置
    advancedSettings: '進階設置',
    maxRetries: '最大重試次數',
    retryDelay: '重試延遲 (毫秒)',
    timeout: '逾時時間 (毫秒)',
    
    // 測試通知
    sendTestNotification: '發送測試通知',
    
    // 平台模態框
    addPlatformModal: '新增通知平台',
    editPlatformModal: '編輯通知平台',
    configurePlatform: '配置新的Webhook通知渠道',
    updatePlatform: '配置並更新Webhook通知渠道',
    
    platformType: '平台類型',
    platformName: '名稱',
    platformNameOptional: '(可選)',
    platformNamePlaceholder: '例如：運維群通知、開發測試群',
    
    webhookUrl: 'Webhook URL',
    webhookUrlRequired: '*',
    webhookUrlPlaceholder: 'https://...',
    editModeWarning: '編輯模式下不能更改平台類型',
    
    // Bark 特有設置
    deviceKey: '設備密鑰 (Device Key)',
    deviceKeyPlaceholder: '例如：aBcDeFgHiJkLmNoPqRsTuVwX',
    deviceKeyHint: '在Bark App中查看您的推送密鑰',
    serverAddress: '伺服器地址',
    serverAddressOptional: '(可選)',
    serverAddressPlaceholder: '預設: https://api.day.app/push',
    notificationLevel: '通知級別',
    notificationSound: '通知聲音',
    notificationGroup: '通知分組',
    notificationGroupOptional: '(可選)',
    notificationGroupPlaceholder: '預設: claude-relay',
    
    // 通知級別選項
    levelAuto: '自動（根據通知類型）',
    levelPassive: '被動',
    levelActive: '預設',
    levelTimeSensitive: '時效性',
    levelCritical: '緊急',
    
    // 聲音選項
    soundAuto: '自動（根據通知類型）',
    soundDefault: '預設',
    soundAlarm: '警報',
    soundBell: '鈴聲',
    soundBirdsong: '鳥鳴',
    soundElectronic: '電子音',
    soundGlass: '玻璃',
    soundHorn: '喇叭',
    soundSilence: '靜音',
    
    // Bark 提示信息
    barkInstructions: [
      '1. 在iPhone上安裝Bark App',
      '2. 打開App獲取您的設備密鑰',
      '3. 將密鑰貼上到上方輸入框'
    ],
    
    // 簽名設置
    enableSignatureVerify: '啟用簽名驗證',
    signatureEnabled: '已啟用',
    signatureSecret: '簽名密鑰',
    signatureSecretPlaceholder: 'SEC...',
    
    // 平台提示信息
    wechatWorkHint: '請在企業微信群機器人設置中獲取Webhook地址',
    dingtalkHint: '請在釘釘群機器人設置中獲取Webhook地址',
    feishuHint: '請在飛書群機器人設置中獲取Webhook地址',
    slackHint: '請在Slack應用的Incoming Webhooks中獲取地址',
    discordHint: '請在Discord伺服器的整合設置中建立Webhook',
    barkHint: '請在Bark App中查看您的設備密鑰',
    customHint: '請輸入完整的Webhook接收地址',
    
    // 模態框按鈕
    required: '必填項',
    cancel: '取消',
    testing: '測試中...',
    saveChanges: '保存修改',
    addPlatformBtn: '新增平台',
    
    // 成功/錯誤消息
    loadSettingsFailed: '載入設置失敗',
    settingsSaved: '設置已保存',
    saveSettingsFailed: '保存設置失敗',
    oemSettingsSaved: 'OEM設置保存成功',
    oemSettingsSaveFailed: '保存OEM設置失敗',
    resetToDefault: '已重置為預設設置',
    resetFailed: '重置失敗',
    confirmReset: '確定要重置為預設設置嗎？\n\n這將清除所有自定義的網站名稱和圖標設置。',
    
    webhookConfigSaved: '配置已保存',
    webhookConfigSaveFailed: '保存配置失敗',
    getWebhookConfigFailed: '獲取webhook配置失敗',
    
    platformAdded: '平台已新增',
    platformUpdated: '平台已更新',
    platformDeleted: '平台已刪除',
    platformDeleteFailed: '刪除失敗',
    confirmDeletePlatform: '確定要刪除這個平台嗎？',
    operationFailed: '操作失敗',
    
    testSuccess: '測試成功，webhook連線正常',
    testFailed: '測試失敗',
    testNotificationSent: '測試通知已發送',
    testNotificationFailed: '發送失敗',
    
    // 表單驗證消息
    enterBarkDeviceKey: '請輸入Bark設備密鑰',
    enterWebhookUrl: '請輸入Webhook URL',
    enterValidWebhookUrl: '請輸入有效的Webhook URL',
    enterWebhookUrlFirst: '請先輸入Webhook URL',
    enterBarkDeviceKeyFirst: '請先輸入Bark設備密鑰',
    
    // 檔案上傳
    fileReadFailed: '檔案讀取失敗',
    iconLoadFailed: 'Icon failed to load',
    
    // 平台名稱
    platforms: {
      wechatWork: '企業微信',
      dingtalk: '釘釘',
      feishu: '飛書',
      slack: 'Slack',
      discord: 'Discord',
      bark: 'Bark',
      custom: '自定義'
    }
  },

  // AccountForm 組件
  accountForm: {
    // 標題和模態框
    editAccount: '編輯帳戶',
    addAccount: '新增帳戶',
    
    // 步驟指示器
    stepBasicInfo: '基本資訊',
    stepAuthorization: '授權認證',
    
    // 平台選擇
    platform: '平台',
    platformClaude: 'Claude',
    platformClaudeConsole: 'Claude Console',
    platformGemini: 'Gemini',
    platformOpenAI: 'OpenAI',
    platformAzureOpenAI: 'Azure OpenAI',
    platformBedrock: 'Bedrock',
    
    // 新增方式
    addMethod: '新增方式',
    addTypeSetupToken: 'Setup Token（推薦）',
    addTypeOAuth: 'OAuth 授權',
    addTypeManual: '手動輸入 Access Token',
    
    // 基本資訊欄位
    accountName: '帳戶名稱',
    accountNamePlaceholder: '為帳戶設置一個易識別的名稱',
    description: '描述',
    descriptionOptional: '描述（可選）',
    descriptionPlaceholder: '帳戶用途說明...',
    
    // 帳戶類型
    accountType: '帳戶類型',
    accountTypeShared: '共用帳戶',
    accountTypeDedicated: '專屬帳戶',
    accountTypeGroup: '群組排程',
    accountTypeDescription: '共用帳戶：供所有API Key使用；專屬帳戶：僅供特定API Key使用；群組排程：加入群組供群組內排程',
    
    // 群組選擇
    selectGroup: '選擇群組',
    selectGroupRequired: '選擇群組 *',
    noGroupsAvailable: '暫無可用群組',
    memberCount: '個成員',
    newGroup: '新建群組',
    refreshGroups: '刷新群組',
    
    // Gemini 專案 ID
    projectId: '專案 ID',
    projectIdOptional: '專案 ID（可選）',
    projectIdPlaceholder: '例如：verdant-wares-464411-k9',
    projectIdDescription: 'Google Cloud/Workspace 帳號需要提供專案 ID',
    projectIdInstructions: '如何獲取專案 ID：',
    projectIdStep1: '訪問 Google Cloud Console',
    projectIdStep2: '複製專案 ID（Project ID），通常是字串格式',
    projectIdStep3: '⚠️ 注意：要複製專案 ID（Project ID），不要複製專案編號（Project Number）！',
    projectIdTip: '提示：如果您的帳號是普通個人帳號（未綁定 Google Cloud），請留空此欄位。',
    projectIdGoogleCloudRequired: 'Google Cloud/Workspace 帳號需要提供專案 ID',
    projectIdGoogleCloudDescription: '某些 Google 帳號（特別是綁定了 Google Cloud 的帳號）會被識別為 Workspace 帳號，需要提供額外的專案 ID。',
    
    // Bedrock 欄位
    awsAccessKeyId: 'AWS 存取金鑰 ID',
    awsAccessKeyIdRequired: 'AWS 存取金鑰 ID *',
    awsAccessKeyIdPlaceholder: '請輸入 AWS Access Key ID',
    awsSecretAccessKey: 'AWS 秘密存取金鑰',
    awsSecretAccessKeyRequired: 'AWS 秘密存取金鑰 *',
    awsSecretAccessKeyPlaceholder: '請輸入 AWS Secret Access Key',
    awsRegion: 'AWS 區域',
    awsRegionRequired: 'AWS 區域 *',
    awsRegionPlaceholder: '例如：us-east-1',
    awsRegionReference: '常用 AWS 區域參考：',
    awsRegionUsEast1: '• us-east-1（美國東部）',
    awsRegionUsWest2: '• us-west-2（美國西部）',
    awsRegionEuWest1: '• eu-west-1（歐洲愛爾蘭）',
    awsRegionApSoutheast1: '• ap-southeast-1（新加坡）',
    awsRegionApNortheast1: '• ap-northeast-1（東京）',
    awsRegionEuCentral1: '• eu-central-1（法蘭克福）',
    awsRegionTip: '💡 請輸入完整的區域代碼，如 us-east-1',
    sessionToken: '會話權杖',
    sessionTokenOptional: '會話權杖（可選）',
    sessionTokenPlaceholder: '如果使用臨時憑證，請輸入會話權杖',
    sessionTokenDescription: '僅在使用臨時 AWS 憑證時需要填寫',
    defaultModel: '預設主模型',
    defaultModelOptional: '預設主模型（可選）',
    defaultModelPlaceholder: '例如：us.anthropic.claude-sonnet-4-20250514-v1:0',
    defaultModelDescription: '留空將使用系統預設模型。支援 inference profile ID 或 ARN',
    bedrockModelConfigTitle: 'Bedrock 模型配置說明：',
    bedrockModelConfigInferenceProfile: '• 支援 Inference Profile ID（推薦）',
    bedrockModelConfigArn: '• 支援 Application Inference Profile ARN',
    bedrockModelConfigCommon: '• 常用模型：us.anthropic.claude-sonnet-4-20250514-v1:0',
    bedrockModelConfigDefault: '• 留空將使用系統配置的預設模型',
    smallFastModel: '小快速模型',
    smallFastModelOptional: '小快速模型（可選）',
    smallFastModelPlaceholder: '例如：us.anthropic.claude-3-5-haiku-20241022-v1:0',
    smallFastModelDescription: '用於快速回應的輕量級模型，留空將使用系統預設',
    
    // Azure OpenAI 欄位
    azureEndpoint: 'Azure Endpoint',
    azureEndpointRequired: 'Azure Endpoint *',
    azureEndpointPlaceholder: 'https://your-resource.openai.azure.com',
    azureEndpointDescription: 'Azure OpenAI 資源的終結點 URL，格式：https://your-resource.openai.azure.com',
    apiVersion: 'API 版本',
    apiVersionPlaceholder: '2024-02-01',
    apiVersionDescription: 'Azure OpenAI API 版本，預設使用最新穩定版本 2024-02-01',
    deploymentName: '部署名稱',
    deploymentNameRequired: '部署名稱 *',
    deploymentNamePlaceholder: 'gpt-4',
    deploymentNameDescription: '在 Azure OpenAI Studio 中建立的部署名稱',
    apiKey: 'API Key',
    apiKeyRequired: 'API Key *',
    apiKeyPlaceholder: '請輸入 API Key',
    apiKeyDescription: '從 Azure 入口網站取得的 API 金鑰',
    supportedModels: '支援的模型',
    supportedModelsDescription: '選擇此部署支援的模型類型',
    
    // Claude Console 欄位
    apiUrl: 'API URL',
    apiUrlRequired: 'API URL *',
    apiUrlPlaceholder: '例如：https://api.example.com',
    apiKeyClaudeConsoleRequired: 'API Key *',
    apiKeyClaudeConsolePlaceholder: '請輸入API Key',
    dailyQuota: '每日額度限制',
    dailyQuotaLabel: '每日額度限制（$）',
    dailyQuotaPlaceholder: '0 表示不限制',
    dailyQuotaDescription: '設置每日使用額度，0 表示不限制',
    quotaResetTime: '額度重置時間',
    quotaResetTimePlaceholder: '00:00',
    quotaResetTimeDescription: '每日自動重置額度的時間',
    todayUsage: '今日使用情況',
    remaining: '剩餘',
    used: '已使用',
    modelMapping: '模型映射表',
    modelMappingOptional: '模型映射表（可選）',
    modelMappingDescription: '留空表示支援所有模型且不修改請求。配置映射後，左側模型會被識別為支援的模型，右側是實際發送的模型。',
    originalModel: '原始模型名稱',
    mappedModel: '映射後的模型名稱',
    addModelMapping: '新增模型映射',
    userAgent: '自定義 User-Agent',
    userAgentOptional: '自定義 User-Agent（可選）',
    userAgentPlaceholder: '留空則透傳用戶端 User-Agent',
    userAgentDescription: '留空時將自動使用用戶端的 User-Agent，僅在需要固定特定 UA 時填寫',
    rateLimitMechanism: '限流機制',
    enableRateLimit: '啟用限流機制',
    rateLimitDescription: '啟用後，當帳號返回429錯誤時將暫停排程一段時間',
    rateLimitDuration: '限流時間（分鐘）',
    rateLimitDurationDescription: '帳號被限流後暫停排程的時間（分鐘）',
    
    // Claude 訂閱類型
    subscriptionType: '訂閱類型',
    subscriptionClaudeMax: 'Claude Max',
    subscriptionClaudePro: 'Claude Pro',
    claudeProLimitation: 'Pro 帳號不支援 Claude Opus 4 模型',
    
    // Claude 特殊功能
    autoStopOnWarning: '5小時使用量接近限制時自動停止排程',
    autoStopOnWarningDescription: '當系統偵測到帳戶接近5小時使用限制時，自動暫停排程該帳戶。進入新的時間視窗後會自動恢復排程。',
    useUnifiedUserAgent: '使用統一 Claude Code 版本',
    useUnifiedUserAgentDescription: '開啟後將使用從真實 Claude Code 用戶端擷取的統一 User-Agent，提高相容性',
    currentUnifiedVersion: '💡 目前統一版本：',
    clearCache: '清除快取',
    clearing: '清除中...',
    waitingForCapture: '⏳ 等待從 Claude Code 用戶端擷取 User-Agent',
    captureHint: '💡 提示：如果長時間未能擷取，請確認有 Claude Code 用戶端正在使用此帳戶，或聯繫開發者檢查 User-Agent 格式是否發生變化',
    useUnifiedClientId: '使用統一的用戶端識別',
    useUnifiedClientIdDescription: '開啟後將使用固定的用戶端識別，使所有請求看起來來自同一個用戶端，減少特徵',
    clientId: '用戶端識別 ID',
    regenerate: '重新產生',
    clientIdDescription: '此ID將替換請求中的user_id用戶端部分，保留session部分用於黏性會話',
    
    // 排程優先順序
    schedulePriority: '排程優先順序',
    schedulePriorityRange: '排程優先順序（1-100）',
    schedulePriorityPlaceholder: '數字越小優先順序越高，預設50',
    schedulePriorityDescription: '數字越小優先順序越高，建議範圍：1-100',
    
    // 手動輸入 Token
    manualTokenTitle: '手動輸入 Token',
    manualTokenDescription: '請輸入有效的 Access Token。如果您有 Refresh Token，建議也一併填寫以支援自動重新整理。',
    manualTokenClaudeDescription: '請輸入有效的 Claude Access Token。如果您有 Refresh Token，建議也一併填寫以支援自動重新整理。',
    manualTokenGeminiDescription: '請輸入有效的 Gemini Access Token。如果您有 Refresh Token，建議也一併填寫以支援自動重新整理。',
    manualTokenOpenAIDescription: '請輸入有效的 OpenAI Access Token。如果您有 Refresh Token，建議也一併填寫以支援自動重新整理。',
    obtainTokenMethods: '取得 Access Token 的方法：',
    claudeTokenPath: '請從已登入 Claude Code 的機器上取得 ~/.claude/.credentials.json 檔案中的憑證，請勿使用 Claude 官網 API Keys 頁面的金鑰。',
    geminiTokenPath: '請從已登入 Gemini CLI 的機器上取得 ~/.config/gemini/credentials.json 檔案中的憑證。',
    openaiTokenPath: '請從已登入 OpenAI 帳戶的機器上取得認證憑證，或透過 OAuth 授權流程取得 Access Token。',
    accessToken: 'Access Token',
    accessTokenOptional: 'Access Token（可選）',
    accessTokenRequired: 'Access Token *',
    accessTokenPlaceholder: '請輸入 Access Token...',
    accessTokenOptionalPlaceholder: '可選：如果不填寫，系統會自動透過 Refresh Token 取得...',
    accessTokenOptionalDescription: 'Access Token 可選填。如果不提供，系統會透過 Refresh Token 自動取得。',
    refreshToken: 'Refresh Token',
    refreshTokenOptional: 'Refresh Token（可選）',
    refreshTokenRequired: 'Refresh Token *',
    refreshTokenPlaceholder: '請輸入 Refresh Token...',
    refreshTokenRequiredPlaceholder: '請輸入 Refresh Token（必填）...',
    refreshTokenDescription: '系統將使用 Refresh Token 自動取得 Access Token 和使用者資訊',
    refreshTokenTip: '💡 如果未填寫 Refresh Token，Token 過期後需要手動更新。',
    
    // Setup Token 流程
    setupTokenTitle: 'Claude Setup Token 授權',
    setupTokenDescription: '請按照以下步驟透過 Setup Token 完成 Claude 帳戶的授權：',
    setupTokenStep1Title: '點擊下方按鈕產生授權連結',
    setupTokenStep2Title: '在瀏覽器中開啟連結並完成授權',
    setupTokenStep2Description: '請在新分頁中開啟授權連結，登入您的 Claude 帳戶並授權 Claude Code。',
    setupTokenStep2Warning: '注意：如果您設置了代理，請確保瀏覽器也使用相同的代理訪問授權頁面。',
    setupTokenStep3Title: '輸入 Authorization Code',
    setupTokenStep3Description: '授權完成後，從返回頁面複製 Authorization Code，並貼上到下方輸入框：',
    generateSetupTokenUrl: '產生 Setup Token 授權連結',
    generating: '產生中...',
    copyLink: '複製連結',
    regenerateLink: '重新產生',
    authorizationCode: 'Authorization Code',
    authorizationCodePlaceholder: '貼上從Claude Code授權頁面取得的Authorization Code...',
    authorizationCodeDescription: '請貼上從Claude Code授權頁面複製的Authorization Code',
    verifying: '驗證中...',
    completeAuthorization: '完成授權',
    
    // Token 更新（編輯模式）
    updateTokenTitle: '更新 Token',
    updateTokenDescription: '可以更新 Access Token 和 Refresh Token。為了安全起見，不會顯示目前的 Token 值。',
    updateTokenTip: '💡 留空表示不更新該欄位。',
    newAccessToken: '新的 Access Token',
    newRefreshToken: '新的 Refresh Token',
    leaveBlankNoUpdate: '留空表示不更新...',
    
    // 使用情況
    currentUsage: '目前使用情況',
    
    // 按鈕
    cancel: '取消',
    nextStep: '下一步',
    previousStep: '上一步',
    create: '建立',
    creating: '建立中...',
    update: '更新',
    updating: '更新中...',
    
    // 錯誤訊息
    pleaseEnterAccountName: '請填寫帳戶名稱',
    pleaseSelectGroup: '請選擇一個群組',
    pleaseEnterApiUrl: '請填寫 API URL',
    pleaseEnterApiKey: '請填寫 API Key',
    pleaseEnterAccessKeyId: '請填寫 AWS 存取金鑰 ID',
    pleaseEnterSecretAccessKey: '請填寫 AWS 秘密存取金鑰',
    pleaseEnterRegion: '請選擇 AWS 區域',
    pleaseEnterAzureEndpoint: '請填寫 Azure Endpoint',
    pleaseEnterDeploymentName: '請填寫部署名稱',
    pleaseEnterAccessToken: '請填寫 Access Token',
    pleaseEnterRefreshToken: '請填寫 Refresh Token',
    
    // 成功訊息
    linkCopied: '連結已複製',
    extractedAuthCode: '成功提取授權碼！',
    cacheClearedSuccess: '統一User-Agent快取已清除',
    newClientIdGenerated: '已產生新的用戶端識別',
    groupsRefreshed: '群組列表已重新整理',
    modelMappingAdded: '已新增映射',
    modelMappingExists: '模型映射已存在',
    
    // 警告和提示
    copyFailed: '複製失敗，請手動複製',
    clearCacheFailed: '清除快取失敗',
    urlNotFound: 'URL 中未找到授權碼參數，請檢查連結是否正確',
    urlFormatError: '連結格式錯誤，請檢查是否為完整的 URL',
    wrongUrlFormat: '請貼上以 http://localhost:45462 開頭的連結',
    loadGroupsFailed: '載入群組列表失敗',
    
    // 確認對話框
    projectIdNotFilledTitle: '專案 ID 未填寫',
    projectIdNotFilledMessage: '您尚未填寫專案 ID。\n\n如果您的Google帳號綁定了Google Cloud或被識別為Workspace帳號，需要提供專案 ID。\n如果您使用的是普通個人帳號，可以繼續不填寫。',
    continueButton: '繼續',
    goBackToFill: '返回填寫',
    continueSave: '繼續保存',
    
    // 快捷模型映射按鈕
    presetSonnet4: '+ Sonnet 4',
    presetOpus41: '+ Opus 4.1',
    presetHaiku35: '+ Haiku 3.5',
    presetOpus41ToSonnet4: '+ Opus 4.1 → Sonnet 4',
    
    // 編輯模式特殊提示
    leaveBlankNoUpdateApiKey: '留空表示不更新 API Key',
    leaveBlankNoUpdateAwsKey: '留空表示不更新 AWS Access Key ID',
    leaveBlankNoUpdateAwsSecret: '留空表示不更新 AWS Secret Access Key',
    leaveBlankNoUpdateSession: '留空表示不更新',
    
    // 通用描述文字
    allModelsIfEmpty: '留空表示支援所有模型。如果指定模型，請求中的模型不在列表內將不會排程到此帳號',
    systemDefaultIfEmpty: '留空將使用系統預設模型。支援 inference profile ID 或 ARN',
    noUpdateIfEmpty: '留空表示不更新該欄位',
    
    // 手動 Token 輸入部分
    manualTokenInput: '手動輸入 Token',
    manualTokenClaudeDescription: '請輸入有效的 Claude Access Token。如果您有 Refresh Token，建議也一併填寫以支援自動刷新。',
    manualTokenGeminiDescription: '請輸入有效的 Gemini Access Token。如果您有 Refresh Token，建議也一併填寫以支援自動刷新。',
    manualTokenOpenAIDescription: '請輸入有效的 OpenAI Access Token。如果您有 Refresh Token，建議也一併填寫以支援自動刷新。',
    getAccessTokenMethod: '取得 Access Token 的方法：',
    claudeCredentialsPath: '請從已登入 Claude Code 的機器上取得',
    geminiCredentialsPath: '請從已登入 Gemini CLI 的機器上取得',
    openaiCredentialsPath: '請從已登入 OpenAI 帳戶的機器上取得認證憑證，或透過 OAuth 授權流程取得 Access Token。',
    claudeCredentialsWarning: '檔案中的憑證，請勿使用 Claude 官網 API Keys 頁面的金鑰。',
    refreshTokenWarning: '💡 如果未填寫 Refresh Token，Token 過期後需要手動更新。',
    accessTokenOptional: 'Access Token (可選)',
    accessTokenOptionalPlaceholder: '可選：如果不填寫，系統會自動透過 Refresh Token 取得...',
    accessTokenOptionalInfo: 'Access Token 可選填。如果不提供，系統會透過 Refresh Token 自動取得。',
    accessTokenRequired: 'Access Token *',
    accessTokenRequiredPlaceholder: '請輸入 Access Token...',
    refreshTokenRequired: 'Refresh Token *',
    refreshTokenRequiredPlaceholder: '請輸入 Refresh Token（必填）...',
    refreshTokenRequiredInfo: '系統將使用 Refresh Token 自動取得 Access Token 和使用者資訊',
    refreshTokenOptional: 'Refresh Token (可選)',
    refreshTokenOptionalPlaceholder: '請輸入 Refresh Token...',
    
    // 優先級設定
    priorityPlaceholder: '數字越小優先級越高，預設50',
    priorityDescription: '數字越小優先級越高，建議範圍：1-100',
    prioritySchedulingTitle: '排程優先級 (1-100)',
    priorityEditPlaceholder: '數字越小優先級越高',
    
    // Gemini 專案ID
    projectIdOptional: '專案 ID (可選)',
    projectIdPlaceholder: '例如：verdant-wares-464411-k9',
    projectIdDescription: 'Google Cloud/Workspace 帳號可能需要提供專案 ID',
    
    // Claude 訂閱類型和進階選項
    subscriptionType: '訂閱類型',
    claudeMaxSubscription: 'Claude Max',
    claudeProSubscription: 'Claude Pro',
    claudeProLimitation: 'Pro 帳號不支援 Claude Opus 4 模型',
    autoStopOnWarning: '5小時使用量接近限制時自動停止排程',
    autoStopOnWarningDescription: '當系統檢測到帳戶接近5小時使用限制時，自動暫停排程該帳戶。進入新的時間視窗後會自動恢復排程。',
    useUnifiedUserAgent: '使用統一 Claude Code 版本',
    useUnifiedUserAgentDescription: '開啟後將使用從真實 Claude Code 用戶端捕獲的統一 User-Agent，提高相容性',
    currentUnifiedVersion: '目前統一版本：',
    clearCache: '清除快取',
    clearing: '清除中...',
    waitingForCapture: '等待從 Claude Code 用戶端捕獲 User-Agent',
    captureHint: '💡 提示：如果長時間未能捕獲，請確認有 Claude Code 用戶端正在使用此帳戶，或聯絡開發者檢查 User-Agent 格式是否發生變化',
    useUnifiedClientId: '使用統一的用戶端識別',
    useUnifiedClientIdDescription: '開啟後將使用固定的用戶端識別，使所有請求看起來來自同一個用戶端，減少特徵',
    clientIdLabel: '用戶端識別 ID',
    regenerateClientId: '重新產生',
    clientIdDescription: '此ID將替換請求中的user_id用戶端部分，保留session部分用於黏性工作階段',
    
    // 編輯模式欄位
    accountNameEdit: '帳戶名稱',
    accountNameEditPlaceholder: '為帳戶設定一個易識別的名稱',
    descriptionOptionalEdit: '描述 (可選)',
    descriptionOptionalEditPlaceholder: '帳戶用途說明...',
    accountTypeEdit: '帳戶類型',
    selectGroupRequired: '選擇群組 *',
    noAvailableGroups: '暫無可用群組',
    membersCount: ' 個成員',
    createNewGroup: '新建群組'
  }
}
