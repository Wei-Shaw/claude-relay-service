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
  },
  
  // Accounts page
  accounts: {
    title: 'Account Management',
    description: 'Manage your Claude, Gemini, OpenAI and Azure OpenAI accounts and proxy configurations',
    
    // Filters and sorting
    sortBy: 'Select Sort',
    selectPlatform: 'Select Platform',
    selectGroup: 'Select Group',
    refresh: 'Refresh',
    refreshTooltip: 'Refresh data (Ctrl/⌘+click to force refresh all caches)',
    addAccount: 'Add Account',
    
    // Sort options
    sortByName: 'Sort by Name',
    sortByDailyTokens: 'Sort by Daily Tokens',
    sortByDailyRequests: 'Sort by Daily Requests',
    sortByTotalTokens: 'Sort by Total Tokens',
    sortByLastUsed: 'Sort by Last Used',
    
    // Platform options
    allPlatforms: 'All Platforms',
    claudePlatform: 'Claude',
    claudeConsolePlatform: 'Claude Console',
    geminiPlatform: 'Gemini',
    openaiPlatform: 'OpenAI',
    azureOpenaiPlatform: 'Azure OpenAI',
    bedrockPlatform: 'Bedrock',
    
    // Group options
    allAccounts: 'All Accounts',
    ungroupedAccounts: 'Ungrouped Accounts',
    
    // Loading states
    loadingAccounts: 'Loading accounts...',
    noAccounts: 'No Accounts',
    noAccountsHint: 'Click the button above to add your first account',
    
    // Table headers
    name: 'Name',
    platformType: 'Platform/Type',
    status: 'Status',
    priority: 'Priority',
    proxy: 'Proxy',
    dailyUsage: 'Daily Usage',
    sessionWindow: 'Session Window',
    lastUsed: 'Last Used',
    actions: 'Actions',
    
    // Account types
    dedicated: 'Dedicated',
    groupScheduling: 'Group Scheduling',
    shared: 'Shared',
    belongsToGroup: 'Belongs to group: {name}',
    
    // Platform labels
    unknown: 'Unknown',
    apiKey: 'API Key',
    oauth: 'OAuth',
    setup: 'Setup',
    aws: 'AWS',
    
    // Account status
    normal: 'Normal',
    abnormal: 'Abnormal',
    blocked: 'Blocked',
    tempError: 'Temporary Error',
    rateLimited: 'Rate Limited',
    notSchedulable: 'Not Schedulable',
    bound: 'Bound: {count} API Keys',
    
    // Proxy status
    noProxy: 'No Proxy',
    
    // Usage statistics
    requests: ' requests',
    noData: 'No Data',
    averageRpm: 'Average {rpm} RPM',
    
    // Session window tooltip
    sessionWindowTooltip: {
      title: 'Session window progress indicates the time progress of the 5-hour window',
      normal: 'Normal: Requests processed normally',
      warning: 'Warning: Approaching limit',
      rejected: 'Rejected: Rate limit reached'
    },
    
    // Session window status
    remaining: 'Remaining {time}',
    ended: 'Ended',
    
    // Console quota
    quotaProgress: 'Quota Progress',
    remainingQuota: 'Remaining $${amount}',
    reset: 'Reset {time}',
    
    // Mobile view labels
    dailyUsageLabel: 'Daily Usage',
    sessionWindowLabel: 'Session Window',
    lastUsedLabel: 'Last Used',
    proxyLabel: 'Proxy',
    priorityLabel: 'Priority',
    neverUsed: 'Never Used',
    sessionWindowTooltipMobile: 'Session window progress does not represent usage, it only shows the remaining time until the next 5-hour window',
    
    // Action buttons
    resetStatus: 'Reset Status',
    resetting: 'Resetting...',
    resetStatusTooltip: 'Reset all abnormal statuses',
    scheduling: 'Scheduling',
    disabled: 'Disabled',
    enableTooltip: 'Click to enable scheduling',
    disableTooltip: 'Click to disable scheduling',
    edit: 'Edit',
    editTooltip: 'Edit account',
    delete: 'Delete',
    deleteTooltip: 'Delete account',
    pause: 'Pause',
    enable: 'Enable',
    
    // Time formatting
    justNow: 'Just now',
    minutesAgo: '{minutes} minutes ago',
    hoursAgo: '{hours} hours ago',
    daysAgo: '{days} days ago',
    hoursAndMinutes: '{hours} hours {minutes} minutes',
    hoursOnly: '{hours} hours',
    minutesOnly: '{minutes} minutes',
    daysAndHours: '{days} days {hours} hours',
    daysOnly: '{days} days',
    
    // Rate limit time
    rateLimitTime: '({time})',
    
    // Messages and confirmations
    resetStatusConfirmTitle: 'Reset Account Status',
    resetStatusConfirmMessage: 'Are you sure you want to reset all abnormal statuses for this account? This will clear rate limit status, 401 error counts, and all other abnormal flags.',
    resetStatusConfirmButton: 'Confirm Reset',
    resetStatusCancelButton: 'Cancel',
    statusResetSuccess: 'Account status has been reset',
    statusResetFailed: 'Status reset failed',
    
    deleteAccountTitle: 'Delete Account',
    deleteAccountMessage: 'Are you sure you want to delete account "{name}"?\n\nThis action cannot be undone.',
    deleteAccountButton: 'Delete',
    deleteAccountCancel: 'Cancel',
    cannotDeleteBoundAccount: 'Cannot delete this account, {count} API Keys are bound to this account, please unbind all API Keys first',
    accountDeleted: 'Account deleted',
    deleteFailed: 'Delete failed',
    
    enabledScheduling: 'Scheduling enabled',
    disabledScheduling: 'Scheduling disabled',
    schedulingToggleFailed: 'Failed to toggle scheduling status',
    unsupportedAccountType: 'This account type does not support scheduling control',
    operationFailed: 'Operation failed',
    
    accountCreateSuccess: 'Account created successfully',
    accountUpdateSuccess: 'Account updated successfully',
    loadAccountsFailed: 'Failed to load accounts',
    unsupportedAccountTypeReset: 'Unsupported account type',
    
    // Schedulable reasons
    invalidApiKey: 'API Key invalid or expired (401 error)',
    serviceOverload: 'Service overloaded (529 error)',
    rateLimitTriggered: 'Rate limit triggered (429 error)',
    authFailed: 'Authentication failed (401 error)',
    manualStop: 'Manually stopped scheduling',
    
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
    title: 'API Keys Management',
    description: 'Manage and monitor your API keys',
    
    // Tab navigation
    activeTab: 'Active API Keys',
    deletedTab: 'Deleted API Keys',
    
    // Toolbar and actions
    refresh: 'Refresh',
    refreshTooltip: 'Refresh API Keys list (Ctrl+click for force refresh)',
    createNew: 'Create New Key',
    bulkEdit: 'Edit Selected',
    bulkDelete: 'Delete Selected',
    
    // Table headers
    name: 'Name',
    tags: 'Tags',
    status: 'Status',
    usageStats: 'Usage Statistics',
    createdAt: 'Created At',
    expiresAt: 'Expires At',
    actions: 'Actions',
    
    // Filter options
    timeRange: {
      today: 'Today',
      week: 'Last 7 Days',
      month: 'This Month',
      all: 'All Time'
    },
    
    // Status
    active: 'Active',
    disabled: 'Disabled',
    expired: 'Expired',
    expiringSoon: 'Expiring Soon',
    neverExpire: 'Never Expire',
    notActivated: 'Not Activated',
    
    // Usage statistics
    dailyCost: 'Daily Cost',
    totalCost: 'Total Cost',
    dailyRequests: 'Daily Requests',
    lastUsed: 'Last Used',
    neverUsed: 'Never Used',
    minutesAgo: '{minutes} minutes ago',
    hoursAgo: '{hours} hours ago',
    daysAgo: '{days} days ago',
    justNow: 'Just now',
    requests: 'requests',
    
    // Search and filter
    searchPlaceholder: 'Search name...',
    searchPlaceholderWithOwner: 'Search name or owner...',
    allTags: 'All Tags',
    noTags: 'No Tags',
    
    // Binding information
    shared: 'Using Shared Pool',
    dedicated: 'Dedicated',
    consoleAccount: 'Console Account',
    bindingWarning: '⚠️ Account not found',
    
    // Limits and quotas
    dailyLimit: 'Daily Cost',
    weeklyOpusLimit: 'Opus Weekly Cost',
    remainingQuota: 'Remaining: ${amount}',
    reset: 'Reset at {time}',
    quotaProgress: 'Quota Progress',
    
    // Model statistics
    modelStats: 'Model Usage Distribution',
    modelStatsCount: '{count} models',
    totalTokens: 'Total Tokens',
    inputTokens: 'Input',
    outputTokens: 'Output',
    cacheCreate: 'Cache Create',
    cacheRead: 'Cache Read',
    totalRequests: 'Total Requests',
    noModelData: 'No model usage data',
    resetFilter: 'Refresh',
    adjustTimeRange: 'Try adjusting the time range or click refresh to reload data',
    
    // Date filter
    dateFilter: {
      today: 'Today',
      days7: '7 Days',
      days30: '30 Days'
    },
    
    // Actions
    viewDetails: 'View Detailed Statistics',
    edit: 'Edit',
    renew: 'Renew',
    activate: 'Activate',
    disable: 'Disable',
    copy: 'Copy',
    copyStatsLink: 'Copy Stats Page Link',
    
    // Pagination
    totalRecords: 'Total {count} records',
    pageSize: 'Show',
    records: 'per page',
    
    // Empty states
    noApiKeys: 'No API Keys',
    noApiKeysHint: 'Click the button above to create your first API Key',
    noDeletedKeys: 'No deleted API Keys',
    noDeletedKeysHint: 'Deleted API Keys will appear here',
    loading: 'Loading API Keys...',
    loadingDeleted: 'Loading deleted API Keys...',
    loadingModelStats: 'Loading model statistics...',
    
    // Deleted keys table
    creator: 'Creator',
    deletedBy: 'Deleted By',
    deletedAt: 'Deleted At',
    canRestore: 'Restore',
    permanentDelete: 'Permanent Delete',
    clearAllDeleted: 'Clear All Deleted',
    
    // User types
    admin: 'Admin',
    user: 'User',
    unknown: 'Unknown',
    system: 'System',
    
    // Confirmation dialogs
    confirmDisable: 'Are you sure to disable API Key "{name}"? All requests using this key will return 401 errors after disabled.',
    confirmDelete: 'Are you sure to delete this API Key? This action cannot be undone.',
    confirmBatchDelete: 'Are you sure to delete selected {count} API Keys? This action cannot be undone.',
    confirmRestore: 'Are you sure to restore this API Key? It can be used again after restoration.',
    confirmPermanentDelete: 'Are you sure to permanently delete this API Key? This action cannot be undone and all related data will be permanently deleted.',
    confirmClearAll: 'Are you sure to permanently delete all {count} deleted API Keys? This action cannot be undone and all related data will be permanently deleted.',
    
    // Success messages
    keyActivated: 'API Key activated',
    keyDisabled: 'API Key disabled',
    keyDeleted: 'API Key deleted',
    keyRestored: 'API Key successfully restored',
    keyPermanentDeleted: 'API Key permanently deleted',
    allDeletedCleared: 'All deleted API Keys cleared',
    linkCopied: 'Stats page link copied',
    expiryUpdated: 'Expiry time updated',
    
    // Error messages
    selectKeysFirst: 'Please select API Keys to edit first',
    loadFailed: 'Failed to load API Keys',
    operationFailed: 'Operation failed',
    copyFailed: 'Copy failed, please copy manually',
    updateFailed: 'Update failed',
    deleteFailed: 'Delete failed',
    restoreFailed: 'Restore failed',
    clearFailed: 'Clear failed',
    
    // Tooltips and helpers
    editExpiry: 'Edit expiry time',
    activationDays: 'Not activated ({days} days)',
    boundTo: 'Bound to',
    belongsToGroup: 'Belongs to group: {name}',
    
    // Batch operations
    batchSuccess: 'Successfully processed {count} items',
    batchPartialFail: '{failed} items failed to process',
    batchAllFailed: 'All items failed to process'
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

  // Settings
  settings: {
    title: 'System Settings',
    description: 'Website customization and notification configuration',
    loading: 'Loading settings...',
    
    // Navigation tabs
    branding: 'Branding Settings',
    webhook: 'Notification Settings',
    
    // Branding settings
    siteName: 'Site Name',
    siteNameDescription: 'Brand identity',
    siteNamePlaceholder: 'Claude Relay Service',
    siteNameHint: 'Will be displayed in browser title and page header',
    
    siteIcon: 'Site Icon',
    siteIconDescription: 'Favicon',
    currentIcon: 'Current icon',
    uploadIcon: 'Upload Icon',
    removeIcon: 'Remove',
    iconFormats: 'Supports .ico, .png, .jpg, .svg formats, max 350KB',
    iconPreview: 'Icon preview',
    
    adminEntry: 'Admin Entry',
    adminEntryDescription: 'Login button display',
    hideLoginButton: 'Hide login button',
    showLoginButton: 'Show login button',
    adminEntryHint: 'When hidden, users need to visit /admin/login directly',
    
    // Mobile card titles
    siteNameCard: 'Site Name',
    siteNameCardDesc: 'Customize your site brand name',
    siteIconCard: 'Site Icon',
    siteIconCardDesc: 'Upload custom icon or enter icon URL',
    adminEntryCard: 'Admin Entry',
    adminEntryCardDesc: 'Control login button visibility on homepage',
    
    // Action buttons
    save: 'Save Settings',
    saving: 'Saving...',
    reset: 'Reset to Default',
    lastUpdated: 'Last updated: {time}',
    lastUpdatedMobile: 'Last updated: {time}',
    
    // Webhook settings
    enableWebhook: 'Enable Webhook Notifications',
    webhookDescription: 'When enabled, system will send notifications to configured platforms',
    
    // Notification types
    notificationTypes: 'Notification Types',
    accountAnomaly: 'Account Anomaly',
    quotaWarning: 'Quota Warning',
    systemError: 'System Error',
    securityAlert: 'Security Alert',
    accountAnomalyDesc: 'Account status anomalies, authentication failures, etc.',
    quotaWarningDesc: 'API call quota insufficient warnings',
    systemErrorDesc: 'System runtime errors and failures',
    securityAlertDesc: 'Security-related alert notifications',
    
    // Notification platforms
    notificationPlatforms: 'Notification Platforms',
    addPlatform: 'Add Platform',
    noPlatforms: 'No notification platforms configured, click "Add Platform" to add one',
    enableSignature: 'Signature verification enabled',
    testConnection: 'Test Connection',
    edit: 'Edit',
    delete: 'Delete',
    
    // Advanced settings
    advancedSettings: 'Advanced Settings',
    maxRetries: 'Max Retries',
    retryDelay: 'Retry Delay (ms)',
    timeout: 'Timeout (ms)',
    
    // Test notification
    sendTestNotification: 'Send Test Notification',
    
    // Platform modal
    addPlatformModal: 'Add Notification Platform',
    editPlatformModal: 'Edit Notification Platform',
    configurePlatform: 'Configure new Webhook notification channel',
    updatePlatform: 'Configure and update Webhook notification channel',
    
    platformType: 'Platform Type',
    platformName: 'Name',
    platformNameOptional: '(Optional)',
    platformNamePlaceholder: 'e.g.: Operations team, Dev test group',
    
    webhookUrl: 'Webhook URL',
    webhookUrlRequired: '*',
    webhookUrlPlaceholder: 'https://...',
    editModeWarning: 'Platform type cannot be changed in edit mode',
    
    // Bark specific settings
    deviceKey: 'Device Key',
    deviceKeyPlaceholder: 'e.g.: aBcDeFgHiJkLmNoPqRsTuVwX',
    deviceKeyHint: 'Check your push key in Bark App',
    serverAddress: 'Server Address',
    serverAddressOptional: '(Optional)',
    serverAddressPlaceholder: 'Default: https://api.day.app/push',
    notificationLevel: 'Notification Level',
    notificationSound: 'Notification Sound',
    notificationGroup: 'Notification Group',
    notificationGroupOptional: '(Optional)',
    notificationGroupPlaceholder: 'Default: claude-relay',
    
    // Notification level options
    levelAuto: 'Auto (based on notification type)',
    levelPassive: 'Passive',
    levelActive: 'Default',
    levelTimeSensitive: 'Time Sensitive',
    levelCritical: 'Critical',
    
    // Sound options
    soundAuto: 'Auto (based on notification type)',
    soundDefault: 'Default',
    soundAlarm: 'Alarm',
    soundBell: 'Bell',
    soundBirdsong: 'Birdsong',
    soundElectronic: 'Electronic',
    soundGlass: 'Glass',
    soundHorn: 'Horn',
    soundSilence: 'Silence',
    
    // Bark instructions
    barkInstructions: [
      '1. Install Bark App on iPhone',
      '2. Open the app to get your device key',
      '3. Paste the key into the input box above'
    ],
    
    // Signature settings
    enableSignatureVerify: 'Enable Signature Verification',
    signatureEnabled: 'Enabled',
    signatureSecret: 'Signature Secret',
    signatureSecretPlaceholder: 'SEC...',
    
    // Platform hints
    wechatWorkHint: 'Get Webhook URL from WeChat Work group bot settings',
    dingtalkHint: 'Get Webhook URL from DingTalk group bot settings',
    feishuHint: 'Get Webhook URL from Feishu group bot settings',
    slackHint: 'Get URL from Slack app Incoming Webhooks',
    discordHint: 'Create Webhook in Discord server integration settings',
    barkHint: 'Check your device key in Bark App',
    customHint: 'Enter complete Webhook receiving URL',
    
    // Modal buttons
    required: 'Required fields',
    cancel: 'Cancel',
    testing: 'Testing...',
    saveChanges: 'Save Changes',
    addPlatformBtn: 'Add Platform',
    
    // Success/error messages
    loadSettingsFailed: 'Failed to load settings',
    settingsSaved: 'Settings saved',
    saveSettingsFailed: 'Failed to save settings',
    oemSettingsSaved: 'OEM settings saved successfully',
    oemSettingsSaveFailed: 'Failed to save OEM settings',
    resetToDefault: 'Reset to default settings',
    resetFailed: 'Reset failed',
    confirmReset: 'Are you sure you want to reset to default settings?\n\nThis will clear all custom site name and icon settings.',
    
    webhookConfigSaved: 'Configuration saved',
    webhookConfigSaveFailed: 'Failed to save configuration',
    getWebhookConfigFailed: 'Failed to get webhook configuration',
    
    platformAdded: 'Platform added',
    platformUpdated: 'Platform updated',
    platformDeleted: 'Platform deleted',
    platformDeleteFailed: 'Delete failed',
    confirmDeletePlatform: 'Are you sure you want to delete this platform?',
    operationFailed: 'Operation failed',
    
    testSuccess: 'Test successful, webhook connection normal',
    testFailed: 'Test failed',
    testNotificationSent: 'Test notification sent',
    testNotificationFailed: 'Send failed',
    
    // Form validation messages
    enterBarkDeviceKey: 'Please enter Bark device key',
    enterWebhookUrl: 'Please enter Webhook URL',
    enterValidWebhookUrl: 'Please enter valid Webhook URL',
    enterWebhookUrlFirst: 'Please enter Webhook URL first',
    enterBarkDeviceKeyFirst: 'Please enter Bark device key first',
    
    // File upload
    fileReadFailed: 'File read failed',
    iconLoadFailed: 'Icon failed to load',
    
    // Platform names
    platforms: {
      wechatWork: 'WeChat Work',
      dingtalk: 'DingTalk',
      feishu: 'Feishu',
      slack: 'Slack',
      discord: 'Discord',
      bark: 'Bark',
      custom: 'Custom'
    }
  }
}
