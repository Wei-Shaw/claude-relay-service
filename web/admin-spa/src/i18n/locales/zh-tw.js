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
  }
}
