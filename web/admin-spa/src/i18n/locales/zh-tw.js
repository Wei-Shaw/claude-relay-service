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
  }
}
