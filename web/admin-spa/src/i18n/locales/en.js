export default {
  common: {
    save: 'Save',
    cancel: 'Cancel',
    confirm: 'Confirm',
    loading: 'Loading...',
    edit: 'Edit',
    delete: 'Delete',
    create: 'Create',
    update: 'Update',
    search: 'Search',
    reset: 'Reset',
    locale: 'en'
  },
  language: {
    zh: '简体中文',
    'zh-tw': '繁體中文',
    en: 'English',
    current: 'Current Language',
    switch: 'Switch Language'
  },
  header: {
    adminPanel: 'Admin Panel',
    userMenu: 'User Menu',
    logout: 'Logout',
    settings: 'Settings',
    
    // Version related
    currentVersion: 'Current Version',
    newVersionAvailable: 'New version available',
    newVersion: 'New Version',
    hasUpdate: 'New Version Available',
    viewUpdate: 'View Update',
    checkingUpdate: 'Checking for updates...',
    alreadyLatest: 'Already the latest version',
    checkUpdate: 'Check Update',
    
    // User menu items
    changeAccountInfo: 'Change Account Info',
    
    // Change password modal
    changePasswordModal: {
      title: 'Change Account Information',
      currentUsername: 'Current Username',
      currentUsernameHint: 'Current username, enter new username to modify',
      newUsername: 'New Username',
      newUsernamePlaceholder: 'Enter new username (leave empty to keep unchanged)',
      newUsernameHint: 'Leave empty to keep username unchanged',
      currentPassword: 'Current Password',
      currentPasswordPlaceholder: 'Please enter current password',
      newPassword: 'New Password',
      newPasswordPlaceholder: 'Please enter new password',
      newPasswordHint: 'Password must be at least 8 characters',
      confirmPassword: 'Confirm New Password',
      confirmPasswordPlaceholder: 'Please enter new password again',
      saving: 'Saving...',
      save: 'Save Changes',
      
      // Messages
      passwordMismatch: 'Passwords do not match',
      passwordTooShort: 'New password must be at least 8 characters',
      accountInfoChangeSuccess: 'Account information changed successfully, please log in again',
      passwordChangeSuccess: 'Password changed successfully, please log in again',
      changeFailed: 'Change failed',
      changePasswordFailed: 'Failed to change password'
    },
    
    // Logout
    logoutConfirm: 'Are you sure you want to logout?',
    logoutSuccess: 'Logged out safely'
  },
  apiStats: {
    title: 'API Key Usage Statistics',
    tutorialTitle: 'Tutorial',
    userLogin: 'User Login',
    adminPanel: 'Admin Panel',
    statsQuery: 'Statistics Query',
    tutorial: 'Tutorial',
    timeRange: 'Statistics Time Range',
    today: 'Today',
    thisMonth: 'This Month',
    
    // API Key Input
    usageStatsQuery: 'Usage Statistics Query',
    apiKeyDescription: 'Query your API Key usage and statistical data',
    enterApiKey: 'Enter your API Key',
    enterApiKeys: 'Enter your API Keys (one per line or comma separated)',
    singleMode: 'Single',
    aggregateMode: 'Aggregate',
    singleModeTitle: 'Single Mode',
    aggregateModeTitle: 'Aggregate Mode',
    queryButton: 'Query',
    
    // Stats Overview
    batchQuerySummary: 'Batch Query Summary',
    apiKeyInfo: 'API Key Information',
    queryKeysCount: 'Query Keys Count',
    activeKeysCount: 'Active Keys Count',
    invalidKeysCount: 'Invalid Keys Count',
    totalRequests: 'Total Requests',
    totalTokens: 'Total Tokens',
    totalCost: 'Total Cost',
    individual: '',
    
    // Aggregated Stats Card
    usageRatio: 'Usage Ratio',
    requests: ' requests',
    otherKeys: 'Other',
    keys: 'Keys',
    
    // Model Usage Stats
    modelUsageStats: 'Model Usage Statistics',
    loadingModelStats: 'Loading model statistics...',
    requestCount: ' requests',
    totalCost: 'Total Cost',
    inputTokens: 'Input Tokens',
    outputTokens: 'Output Tokens',
    cacheCreateTokens: 'Cache Create',
    cacheReadTokens: 'Cache Read',
    noModelData: 'No {period} model usage data available',
    
    // Token Distribution
    tokenDistribution: 'Token Usage Distribution',
    inputToken: 'Input Tokens',
    outputToken: 'Output Tokens',
    cacheCreateToken: 'Cache Create Tokens',
    cacheReadToken: 'Cache Read Tokens',
    
    // Limit Config
    limitConfig: 'Limit Configuration',
    limitConfigAggregate: 'Limit Configuration (Aggregate Query Mode)',
    apiKeysOverview: 'API Keys Overview',
    totalKeys: 'Total Keys',
    activeKeys: 'Active Keys',
    aggregatedStats: 'Aggregated Statistics',
    dailyLimit: 'Daily Limit',
    monthlyLimit: 'Monthly Limit',
    usageToday: 'Usage Today',
    usageThisMonth: 'Usage This Month',
    remaining: 'Remaining',
    
    // Stats Overview - Additional keys
    name: 'Name',
    status: 'Status',
    permissions: 'Permissions',
    createdAt: 'Created At',
    expiresAt: 'Expires At',
    active: 'Active',
    inactive: 'Inactive',
    notActivated: 'Not Activated',
    expired: 'Expired',
    neverExpires: 'Never Expires',
    allModels: 'All Models',
    unknown: 'Unknown',
    none: 'None',
    formatError: 'Format Error',
    usageStatsOverview: 'Usage Statistics Overview',
    keyContribution: 'Key Contribution Ratio',
    firstUseDays: 'Expires {days} days after first use',
    todayRequests: 'Today Requests',
    todayTokens: 'Today Tokens',
    todayCost: 'Today Cost',
    todayInputTokens: 'Today Input Tokens',
    monthlyRequests: 'Monthly Requests',
    monthlyTokens: 'Monthly Tokens',
    monthlyCost: 'Monthly Cost',
    monthlyInputTokens: 'Monthly Input Tokens',
    
    // Limit Config - Additional keys
    dailyCostLimit: 'Daily Cost Limit',
    concurrencyLimit: 'Concurrency Limit',
    modelLimit: 'Model Limit',
    clientLimit: 'Client Limit',
    restrictedModelsCount: 'Restricted {count} models',
    allowAllModels: 'Allow All Models',
    restrictedClientsCount: 'Restricted {count} clients',
    allowAllClients: 'Allow All Clients',
    detailedLimitInfo: 'Detailed Limit Information',
    restrictedModelsList: 'Restricted Models List',
    restrictedModelsNote: 'This API Key cannot access the models listed above',
    allowedClientsList: 'Allowed Clients',
    allowedClientsNote: 'This API Key can only be used by the clients listed above',
    timeWindowLimit: 'Time Window Limit',
    aggregateStatsNote: 'Each API Key has independent limit settings, individual limit configurations are not shown in aggregate mode',
    aggregateStatsSummary: 'Aggregate Statistics Summary',
    invalidKeysCount: '{count} invalid API Keys',
    orRelationshipRequests: 'Request count and cost limits have an "OR" relationship, rate limiting is triggered when either limit is reached',
    orRelationshipTokens: 'Request count and token usage have an "OR" relationship, rate limiting is triggered when either limit is reached',
    onlyRequestsLimit: 'Only request count is limited',
    
    // Token Distribution - Additional keys
    totalAmount: 'Total',
    todayTotal: 'Today Total',
    monthlyTotal: 'Monthly Total',
    
    // Additional missing keys
    usageRatioOnlyInMultiMode: 'Usage ratio is only displayed in multi-key query mode',
    noData: 'No Data',
    
    // ApiKeyInput placeholders and texts
    apiKeyPlaceholder: 'Please enter your API Key (cr_...)',
    apiKeysPlaceholder: 'Please enter your API Keys, supporting the following formats:\ncr_xxx\ncr_yyy\nor\ncr_xxx, cr_yyy',
    clearInput: 'Clear Input',
    securityNoticeSingle: 'Your API Key is only used to query your own statistical data and will not be stored or used for other purposes',
    securityNoticeMulti: 'Your API Keys are only used to query statistical data and will not be stored. Some individual information will not be displayed in aggregate mode.',
    multiKeyTip: 'Tip: Supports querying up to 30 API Keys simultaneously. Use Ctrl+Enter for quick query.'
  },
  
  // Login page
  login: {
    title: 'Admin Panel',
    username: 'Username',
    usernamePlaceholder: 'Please enter username',
    password: 'Password',
    passwordPlaceholder: 'Please enter password',
    loginButton: 'Login',
    loggingIn: 'Logging in...'
  },
  
  // Dashboard page
  dashboard: {
    // Main stats cards
    totalApiKeys: 'Total API Keys',
    activeApiKeys: 'Active',
    serviceAccounts: 'Service Accounts',
    normalAccounts: 'Normal',
    abnormalAccounts: 'Abnormal',
    pausedAccounts: 'Paused',
    rateLimitedAccounts: 'Rate Limited',
    todayRequests: 'Today Requests',
    totalRequests: 'Total Requests',
    systemStatus: 'System Status',
    uptime: 'Uptime',
    
    // Platform accounts tooltip
    claudeAccount: 'Claude: {total} accounts (Normal: {normal})',
    consoleAccount: 'Console: {total} accounts (Normal: {normal})',
    geminiAccount: 'Gemini: {total} accounts (Normal: {normal})',
    bedrockAccount: 'Bedrock: {total} accounts (Normal: {normal})',
    openaiAccount: 'OpenAI: {total} accounts (Normal: {normal})',
    azureOpenaiAccount: 'Azure OpenAI: {total} accounts (Normal: {normal})',
    
    // Token stats cards
    todayToken: 'Today Tokens',
    totalTokenConsumption: 'Total Token Consumption',
    inputTokens: 'Input',
    outputTokens: 'Output',
    cacheCreateTokens: 'Cache Create',
    cacheReadTokens: 'Cache Read',
    
    // Real-time metrics
    realtimeRPM: 'Realtime RPM',
    realtimeTPM: 'Realtime TPM',
    requestsPerMinute: 'Requests per Minute',
    tokensPerMinute: 'Tokens per Minute',
    historicalData: 'Historical Data',
    minutes: 'minutes',
    
    // Charts section
    modelDistributionAndTrend: 'Model Usage Distribution & Token Usage Trends',
    
    // Date filter presets
    today: 'Today',
    yesterday: 'Yesterday',
    last7Days: 'Last 7 Days',
    last30Days: 'Last 30 Days',
    thisWeek: 'This Week',
    lastWeek: 'Last Week',
    thisMonth: 'This Month',
    lastMonth: 'Last Month',
    
    // Granularity buttons
    byDay: 'By Day',
    byHour: 'By Hour',
    
    // Date picker
    startDatePlaceholder: 'Start Date',
    endDatePlaceholder: 'End Date',
    dateSeparator: 'to',
    maxHours24: 'Maximum 24 hours',
    
    // Auto refresh controls
    autoRefresh: 'Auto Refresh',
    refresh: 'Refresh',
    refreshing: 'Refreshing',
    refreshDataNow: 'Refresh data now',
    
    // Charts
    tokenUsageDistribution: 'Token Usage Distribution',
    detailedStatistics: 'Detailed Statistics',
    noModelUsageData: 'No model usage data available',
    
    // Table headers
    model: 'Model',
    requestCount: 'Requests',
    totalTokens: 'Total Tokens',
    cost: 'Cost',
    percentage: 'Percentage',
    
    // Trend charts
    tokenUsageTrend: 'Token Usage Trend',
    apiKeysUsageTrend: 'API Keys Usage Trend',
    requestsCount: 'Requests Count',
    tokenCount: 'Token Count',
    totalApiKeysCount: 'Total {count} API Keys',
    showingTop10: 'Total {count} API Keys, showing top 10 by usage',
    
    // Chart labels
    inputTokensLabel: 'Input Tokens',
    outputTokensLabel: 'Output Tokens',
    cacheCreateTokensLabel: 'Cache Create Tokens',
    cacheReadTokensLabel: 'Cache Read Tokens',
    costLabel: 'Cost (USD)',
    requestsLabel: 'Requests',
    time: 'Time',
    date: 'Date',
    tokenQuantity: 'Token Quantity',
    requestsQuantity: 'Requests Count'
  }
}
