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
  },

  // AccountForm Component
  accountForm: {
    // Titles and modal
    editAccount: 'Edit Account',
    addAccount: 'Add Account',
    
    // Step indicators
    stepBasicInfo: 'Basic Information',
    stepAuthorization: 'Authorization',
    
    // Platform selection
    platform: 'Platform',
    platformClaude: 'Claude',
    platformClaudeConsole: 'Claude Console',
    platformGemini: 'Gemini',
    platformOpenAI: 'OpenAI',
    platformAzureOpenAI: 'Azure OpenAI',
    platformBedrock: 'Bedrock',
    
    // Add methods
    addMethod: 'Add Method',
    addTypeSetupToken: 'Setup Token (Recommended)',
    addTypeOAuth: 'OAuth Authorization',
    addTypeManual: 'Manual Access Token Input',
    
    // Basic information fields
    accountName: 'Account Name',
    accountNamePlaceholder: 'Set an easily recognizable name for the account',
    description: 'Description',
    descriptionOptional: 'Description (Optional)',
    descriptionPlaceholder: 'Account usage description...',
    
    // Account type
    accountType: 'Account Type',
    accountTypeShared: 'Shared Account',
    accountTypeDedicated: 'Dedicated Account',
    accountTypeGroup: 'Group Scheduling',
    accountTypeDescription: 'Shared: Available to all API Keys; Dedicated: Only for specific API Keys; Group: Join group for group scheduling',
    
    // Group selection
    selectGroup: 'Select Group',
    selectGroupRequired: 'Select Group *',
    noGroupsAvailable: 'No groups available',
    memberCount: 'members',
    newGroup: 'New Group',
    refreshGroups: 'Refresh Groups',
    
    // Gemini Project ID
    projectId: 'Project ID',
    projectIdOptional: 'Project ID (Optional)',
    projectIdPlaceholder: 'e.g.: verdant-wares-464411-k9',
    projectIdDescription: 'Google Cloud/Workspace accounts need to provide Project ID',
    projectIdInstructions: 'How to get Project ID:',
    projectIdStep1: 'Visit Google Cloud Console',
    projectIdStep2: 'Copy Project ID (Project ID), usually in string format',
    projectIdStep3: '⚠️ Note: Copy Project ID, not Project Number!',
    projectIdTip: 'Tip: If your account is a regular personal account (not bound to Google Cloud), leave this field blank.',
    projectIdGoogleCloudRequired: 'Google Cloud/Workspace accounts require Project ID',
    projectIdGoogleCloudDescription: 'Some Google accounts (especially those bound to Google Cloud) will be identified as Workspace accounts and require an additional Project ID.',
    
    // Bedrock fields
    awsAccessKeyId: 'AWS Access Key ID',
    awsAccessKeyIdRequired: 'AWS Access Key ID *',
    awsAccessKeyIdPlaceholder: 'Please enter AWS Access Key ID',
    awsSecretAccessKey: 'AWS Secret Access Key',
    awsSecretAccessKeyRequired: 'AWS Secret Access Key *',
    awsSecretAccessKeyPlaceholder: 'Please enter AWS Secret Access Key',
    awsRegion: 'AWS Region',
    awsRegionRequired: 'AWS Region *',
    awsRegionPlaceholder: 'e.g.: us-east-1',
    awsRegionReference: 'Common AWS regions reference:',
    awsRegionUsEast1: '• us-east-1 (US East)',
    awsRegionUsWest2: '• us-west-2 (US West)',
    awsRegionEuWest1: '• eu-west-1 (Europe Ireland)',
    awsRegionApSoutheast1: '• ap-southeast-1 (Singapore)',
    awsRegionApNortheast1: '• ap-northeast-1 (Tokyo)',
    awsRegionEuCentral1: '• eu-central-1 (Frankfurt)',
    awsRegionTip: '💡 Please enter complete region code, like us-east-1',
    sessionToken: 'Session Token',
    sessionTokenOptional: 'Session Token (Optional)',
    sessionTokenPlaceholder: 'If using temporary credentials, please enter session token',
    sessionTokenDescription: 'Only required when using temporary AWS credentials',
    defaultModel: 'Default Primary Model',
    defaultModelOptional: 'Default Primary Model (Optional)',
    defaultModelPlaceholder: 'e.g.: us.anthropic.claude-sonnet-4-20250514-v1:0',
    defaultModelDescription: 'Leave blank to use system default model. Supports inference profile ID or ARN',
    bedrockModelConfigTitle: 'Bedrock Model Configuration:',
    bedrockModelConfigInferenceProfile: '• Supports Inference Profile ID (recommended)',
    bedrockModelConfigArn: '• Supports Application Inference Profile ARN',
    bedrockModelConfigCommon: '• Common model: us.anthropic.claude-sonnet-4-20250514-v1:0',
    bedrockModelConfigDefault: '• Leave blank to use system configured default model',
    smallFastModel: 'Small Fast Model',
    smallFastModelOptional: 'Small Fast Model (Optional)',
    smallFastModelPlaceholder: 'e.g.: us.anthropic.claude-3-5-haiku-20241022-v1:0',
    smallFastModelDescription: 'Lightweight model for fast responses, leave blank to use system default',
    
    // Azure OpenAI fields
    azureEndpoint: 'Azure Endpoint',
    azureEndpointRequired: 'Azure Endpoint *',
    azureEndpointPlaceholder: 'https://your-resource.openai.azure.com',
    azureEndpointDescription: 'Azure OpenAI resource endpoint URL, format: https://your-resource.openai.azure.com',
    apiVersion: 'API Version',
    apiVersionPlaceholder: '2024-02-01',
    apiVersionDescription: 'Azure OpenAI API version, defaults to latest stable version 2024-02-01',
    deploymentName: 'Deployment Name',
    deploymentNameRequired: 'Deployment Name *',
    deploymentNamePlaceholder: 'gpt-4',
    deploymentNameDescription: 'Deployment name created in Azure OpenAI Studio',
    apiKey: 'API Key',
    apiKeyRequired: 'API Key *',
    apiKeyPlaceholder: 'Please enter API Key',
    apiKeyDescription: 'API key obtained from Azure portal',
    supportedModels: 'Supported Models',
    supportedModelsDescription: 'Select model types supported by this deployment',
    
    // Claude Console fields
    apiUrl: 'API URL',
    apiUrlRequired: 'API URL *',
    apiUrlPlaceholder: 'e.g.: https://api.example.com',
    apiKeyClaudeConsoleRequired: 'API Key *',
    apiKeyClaudeConsolePlaceholder: 'Please enter API Key',
    dailyQuota: 'Daily Quota Limit',
    dailyQuotaLabel: 'Daily Quota Limit ($)',
    dailyQuotaPlaceholder: '0 means no limit',
    dailyQuotaDescription: 'Set daily usage quota, 0 means no limit',
    quotaResetTime: 'Quota Reset Time',
    quotaResetTimePlaceholder: '00:00',
    quotaResetTimeDescription: 'Daily automatic quota reset time',
    todayUsage: "Today's Usage",
    remaining: 'Remaining',
    used: 'Used',
    modelMapping: 'Model Mapping Table',
    modelMappingOptional: 'Model Mapping Table (Optional)',
    modelMappingDescription: 'Leave blank to support all models without modification. With mapping configured, left models will be recognized as supported, right models are actually sent.',
    originalModel: 'Original Model Name',
    mappedModel: 'Mapped Model Name',
    addModelMapping: 'Add Model Mapping',
    userAgent: 'Custom User-Agent',
    userAgentOptional: 'Custom User-Agent (Optional)',
    userAgentPlaceholder: 'Leave blank to pass through client User-Agent',
    userAgentDescription: 'When blank, will automatically use client User-Agent, only fill when need to fix specific UA',
    rateLimitMechanism: 'Rate Limit Mechanism',
    enableRateLimit: 'Enable Rate Limiting',
    rateLimitDescription: 'When enabled, will pause scheduling for a period when account returns 429 errors',
    rateLimitDuration: 'Rate Limit Duration (minutes)',
    rateLimitDurationDescription: 'Time to pause scheduling after account is rate limited (minutes)',
    
    // Claude subscription types
    subscriptionType: 'Subscription Type',
    subscriptionClaudeMax: 'Claude Max',
    subscriptionClaudePro: 'Claude Pro',
    claudeProLimitation: 'Pro accounts do not support Claude Opus 4 model',
    
    // Claude special features
    autoStopOnWarning: 'Auto stop scheduling when 5-hour usage approaches limit',
    autoStopOnWarningDescription: 'When system detects account approaching 5-hour usage limit, automatically pause scheduling this account. Will automatically resume when entering new time window.',
    useUnifiedUserAgent: 'Use Unified Claude Code Version',
    useUnifiedUserAgentDescription: 'When enabled, will use unified User-Agent captured from real Claude Code client to improve compatibility',
    currentUnifiedVersion: '💡 Current unified version: ',
    clearCache: 'Clear Cache',
    clearing: 'Clearing...',
    waitingForCapture: '⏳ Waiting to capture User-Agent from Claude Code client',
    captureHint: '💡 Tip: If unable to capture for a long time, please confirm Claude Code client is using this account, or contact developer to check if User-Agent format has changed',
    useUnifiedClientId: 'Use Unified Client Identifier',
    useUnifiedClientIdDescription: 'When enabled, will use fixed client identifier to make all requests appear from same client, reducing fingerprint',
    clientId: 'Client Identifier ID',
    regenerate: 'Regenerate',
    clientIdDescription: 'This ID will replace user_id client part in requests, keeping session part for sticky sessions',
    
    // Schedule priority
    schedulePriority: 'Schedule Priority',
    schedulePriorityRange: 'Schedule Priority (1-100)',
    schedulePriorityPlaceholder: 'Lower number = higher priority, default 50',
    schedulePriorityDescription: 'Lower number = higher priority, recommended range: 1-100',
    
    // Manual token input
    manualTokenTitle: 'Manual Token Input',
    manualTokenDescription: 'Please enter valid Access Token. If you have Refresh Token, also recommend filling it to support auto refresh.',
    manualTokenClaudeDescription: 'Please enter valid Claude Access Token. If you have Refresh Token, also recommend filling it to support auto refresh.',
    manualTokenGeminiDescription: 'Please enter valid Gemini Access Token. If you have Refresh Token, also recommend filling it to support auto refresh.',
    manualTokenOpenAIDescription: 'Please enter valid OpenAI Access Token. If you have Refresh Token, also recommend filling it to support auto refresh.',
    obtainTokenMethods: 'Methods to obtain Access Token:',
    claudeTokenPath: 'Please get credentials from ~/.claude/.credentials.json file on machine with logged-in Claude Code, do not use keys from Claude official website API Keys page.',
    geminiTokenPath: 'Please get credentials from ~/.config/gemini/credentials.json file on machine with logged-in Gemini CLI.',
    openaiTokenPath: 'Please get authentication credentials from machine with logged-in OpenAI account, or get Access Token through OAuth authorization flow.',
    accessToken: 'Access Token',
    accessTokenOptional: 'Access Token (Optional)',
    accessTokenRequired: 'Access Token *',
    accessTokenPlaceholder: 'Please enter Access Token...',
    accessTokenOptionalPlaceholder: 'Optional: If not filled, system will automatically get via Refresh Token...',
    accessTokenOptionalDescription: 'Access Token is optional. If not provided, system will automatically get via Refresh Token.',
    refreshToken: 'Refresh Token',
    refreshTokenOptional: 'Refresh Token (Optional)',
    refreshTokenRequired: 'Refresh Token *',
    refreshTokenPlaceholder: 'Please enter Refresh Token...',
    refreshTokenRequiredPlaceholder: 'Please enter Refresh Token (required)...',
    refreshTokenDescription: 'System will use Refresh Token to automatically get Access Token and user info',
    refreshTokenTip: '💡 If Refresh Token not filled, token needs manual update after expiry.',
    
    // Setup Token flow
    setupTokenTitle: 'Claude Setup Token Authorization',
    setupTokenDescription: 'Please follow these steps to complete Claude account authorization via Setup Token:',
    setupTokenStep1Title: 'Click button below to generate authorization link',
    setupTokenStep2Title: 'Open link in browser and complete authorization',
    setupTokenStep2Description: 'Please open authorization link in new tab, login to your Claude account and authorize Claude Code.',
    setupTokenStep2Warning: 'Note: If you have proxy configured, please ensure browser also uses same proxy to access authorization page.',
    setupTokenStep3Title: 'Enter Authorization Code',
    setupTokenStep3Description: 'After authorization completes, copy Authorization Code from return page and paste into input below:',
    generateSetupTokenUrl: 'Generate Setup Token Authorization Link',
    generating: 'Generating...',
    copyLink: 'Copy Link',
    regenerateLink: 'Regenerate',
    authorizationCode: 'Authorization Code',
    authorizationCodePlaceholder: 'Paste Authorization Code obtained from Claude Code authorization page...',
    authorizationCodeDescription: 'Please paste Authorization Code copied from Claude Code authorization page',
    verifying: 'Verifying...',
    completeAuthorization: 'Complete Authorization',
    
    // Token update (edit mode)
    updateTokenTitle: 'Update Token',
    updateTokenDescription: 'Can update Access Token and Refresh Token. For security, current Token values are not displayed.',
    updateTokenTip: '💡 Leave blank to not update that field.',
    newAccessToken: 'New Access Token',
    newRefreshToken: 'New Refresh Token',
    leaveBlankNoUpdate: 'Leave blank to not update...',
    
    // Usage information
    currentUsage: 'Current Usage',
    
    // Buttons
    cancel: 'Cancel',
    nextStep: 'Next Step',
    previousStep: 'Previous Step',
    create: 'Create',
    creating: 'Creating...',
    update: 'Update',
    updating: 'Updating...',
    
    // Error messages
    pleaseEnterAccountName: 'Please enter account name',
    pleaseSelectGroup: 'Please select a group',
    pleaseEnterApiUrl: 'Please enter API URL',
    pleaseEnterApiKey: 'Please enter API Key',
    pleaseEnterAccessKeyId: 'Please enter AWS Access Key ID',
    pleaseEnterSecretAccessKey: 'Please enter AWS Secret Access Key',
    pleaseEnterRegion: 'Please select AWS region',
    pleaseEnterAzureEndpoint: 'Please enter Azure Endpoint',
    pleaseEnterDeploymentName: 'Please enter deployment name',
    pleaseEnterAccessToken: 'Please enter Access Token',
    pleaseEnterRefreshToken: 'Please enter Refresh Token',
    
    // Success messages
    linkCopied: 'Link copied',
    extractedAuthCode: 'Successfully extracted authorization code!',
    cacheClearedSuccess: 'Unified User-Agent cache cleared',
    newClientIdGenerated: 'New client identifier generated',
    groupsRefreshed: 'Groups list refreshed',
    modelMappingAdded: 'Mapping added',
    modelMappingExists: 'Model mapping already exists',
    
    // Warnings and hints
    copyFailed: 'Copy failed, please copy manually',
    clearCacheFailed: 'Clear cache failed',
    urlNotFound: 'Authorization code parameter not found in URL, please check if link is correct',
    urlFormatError: 'Link format error, please check if it is a complete URL',
    wrongUrlFormat: 'Please paste link starting with http://localhost:45462',
    loadGroupsFailed: 'Failed to load groups list',
    
    // Confirmation dialogs
    projectIdNotFilledTitle: 'Project ID Not Filled',
    projectIdNotFilledMessage: 'You have not filled Project ID.\n\nIf your Google account is bound to Google Cloud or identified as Workspace account, Project ID is required.\nIf you are using regular personal account, you can continue without filling.',
    continueButton: 'Continue',
    goBackToFill: 'Go Back to Fill',
    continueSave: 'Continue Save',
    
    // Quick model mapping buttons
    presetSonnet4: '+ Sonnet 4',
    presetOpus41: '+ Opus 4.1',
    presetHaiku35: '+ Haiku 3.5',
    presetOpus41ToSonnet4: '+ Opus 4.1 → Sonnet 4',
    
    // Edit mode special hints
    leaveBlankNoUpdateApiKey: 'Leave blank to not update API Key',
    leaveBlankNoUpdateAwsKey: 'Leave blank to not update AWS Access Key ID',
    leaveBlankNoUpdateAwsSecret: 'Leave blank to not update AWS Secret Access Key',
    leaveBlankNoUpdateSession: 'Leave blank to not update',
    
    // General description text
    allModelsIfEmpty: 'Leave blank to support all models. If models specified, requests with models not in list will not be scheduled to this account',
    systemDefaultIfEmpty: 'Leave blank to use system default model. Supports inference profile ID or ARN',
    noUpdateIfEmpty: 'Leave blank to not update this field',
    
    // Manual Token Input Section
    manualTokenInput: 'Manual Token Input',
    manualTokenClaudeDescription: 'Please enter valid Claude Access Token. If you have Refresh Token, it is recommended to fill both for automatic refresh support.',
    manualTokenGeminiDescription: 'Please enter valid Gemini Access Token. If you have Refresh Token, it is recommended to fill both for automatic refresh support.',
    manualTokenOpenAIDescription: 'Please enter valid OpenAI Access Token. If you have Refresh Token, it is recommended to fill both for automatic refresh support.',
    getAccessTokenMethod: 'Methods to get Access Token:',
    claudeCredentialsPath: 'Please get from logged-in Claude Code machine',
    geminiCredentialsPath: 'Please get from logged-in Gemini CLI machine',
    openaiCredentialsPath: 'Please get authentication credentials from logged-in OpenAI account machine, or obtain Access Token through OAuth authorization flow.',
    claudeCredentialsWarning: 'credentials from file, do not use keys from Claude official API Keys page.',
    refreshTokenWarning: '💡 If Refresh Token is not filled, Token needs manual update after expiration.',
    accessTokenOptional: 'Access Token (Optional)',
    accessTokenOptionalPlaceholder: 'Optional: If not filled, system will automatically obtain through Refresh Token...',
    accessTokenOptionalInfo: 'Access Token is optional. If not provided, system will automatically obtain through Refresh Token.',
    accessTokenRequired: 'Access Token *',
    accessTokenRequiredPlaceholder: 'Please enter Access Token...',
    refreshTokenRequired: 'Refresh Token *',
    refreshTokenRequiredPlaceholder: 'Please enter Refresh Token (required)...',
    refreshTokenRequiredInfo: 'System will use Refresh Token to automatically obtain Access Token and user information',
    refreshTokenOptional: 'Refresh Token (Optional)',
    refreshTokenOptionalPlaceholder: 'Please enter Refresh Token...',
    
    // Priority Settings
    priorityPlaceholder: 'Lower number = higher priority, default 50',
    priorityDescription: 'Lower number = higher priority, recommended range: 1-100',
    prioritySchedulingTitle: 'Scheduling Priority (1-100)',
    priorityEditPlaceholder: 'Lower number = higher priority',
    
    // Gemini Project ID
    projectIdOptional: 'Project ID (Optional)',
    projectIdPlaceholder: 'e.g., verdant-wares-464411-k9',
    projectIdDescription: 'Google Cloud/Workspace accounts may require Project ID',
    
    // Claude Subscription Type and Advanced Options
    subscriptionType: 'Subscription Type',
    claudeMaxSubscription: 'Claude Max',
    claudeProSubscription: 'Claude Pro',
    claudeProLimitation: 'Pro accounts do not support Claude Opus 4 model',
    autoStopOnWarning: 'Auto-stop scheduling when approaching 5-hour limit',
    autoStopOnWarningDescription: 'When system detects account approaching 5-hour usage limit, automatically pause scheduling for this account. Will resume automatically when entering new time window.',
    useUnifiedUserAgent: 'Use unified Claude Code version',
    useUnifiedUserAgentDescription: 'When enabled, will use unified User-Agent captured from real Claude Code client, improving compatibility',
    currentUnifiedVersion: 'Current unified version:',
    clearCache: 'Clear Cache',
    clearing: 'Clearing...',
    waitingForCapture: 'Waiting to capture User-Agent from Claude Code client',
    captureHint: '💡 Hint: If unable to capture for long time, please confirm Claude Code client is using this account, or contact developer to check if User-Agent format has changed',
    useUnifiedClientId: 'Use unified client identifier',
    useUnifiedClientIdDescription: 'When enabled, will use fixed client identifier, making all requests appear to come from same client, reducing characteristics',
    clientIdLabel: 'Client Identifier ID',
    regenerateClientId: 'Regenerate',
    clientIdDescription: 'This ID will replace user_id client part in requests, preserving session part for sticky sessions',
    
    // Edit Mode Fields
    accountNameEdit: 'Account Name',
    accountNameEditPlaceholder: 'Set an identifiable name for the account',
    descriptionOptionalEdit: 'Description (Optional)',
    descriptionOptionalEditPlaceholder: 'Account usage description...',
    accountTypeEdit: 'Account Type',
    selectGroupRequired: 'Select Group *',
    noAvailableGroups: 'No available groups',
    membersCount: ' members',
    createNewGroup: 'Create New Group',
    
    // AWS Bedrock Configuration
    bedrockCredentials: 'Credentials Configuration',
    bedrockCredentialsDescription: 'Please fill in AWS access credentials for calling Amazon Bedrock service.',
    awsAccessKeyId: 'AWS Access Key ID *',
    awsAccessKeyIdPlaceholder: 'Please enter AWS Access Key ID...',
    awsSecretAccessKey: 'AWS Secret Access Key *',
    awsSecretAccessKeyPlaceholder: 'Please enter AWS Secret Access Key...',
    sessionTokenOptional: 'Session Token (Optional)',
    sessionTokenOptionalPlaceholder: 'Session token for temporary credentials...',
    sessionTokenDescription: 'Only required when using temporary credentials (like STS generated credentials)',
    awsRegion: 'AWS Region *',
    awsRegionPlaceholder: 'Select AWS region...',
    bedrockModelConfig: 'Model Configuration',
    defaultModelLabel: 'Default Model',
    defaultModelPlaceholder: 'e.g., anthropic.claude-3-5-sonnet-20240620-v1:0',
    defaultModelDescription: 'Leave blank to use system default model. Supports inference profile ID or ARN',
    smallFastModelLabel: 'Small Fast Model',
    smallFastModelPlaceholder: 'e.g., anthropic.claude-3-haiku-20240307-v1:0',
    smallFastModelDescription: 'Fast model for simple tasks, supports inference profile ID or ARN',
    
    // Azure OpenAI Configuration
    azureOpenAIConfig: 'Azure OpenAI Configuration',
    azureOpenAIDescription: 'Please configure connection information and deployment details for Azure OpenAI service.',
    azureEndpoint: 'Azure Endpoint *',
    azureEndpointPlaceholder: 'e.g., https://your-resource.openai.azure.com/',
    azureEndpointDescription: 'Endpoint URL for Azure OpenAI service',
    azureApiKey: 'API Key *',
    azureApiKeyPlaceholder: 'Please enter Azure OpenAI API Key...',
    azureApiVersion: 'API Version',
    azureApiVersionDescription: 'Azure OpenAI API version, usually use latest version',
    azureDeploymentName: 'Deployment Name *',
    azureDeploymentNamePlaceholder: 'e.g., gpt-4',
    azureDeploymentDescription: 'Deployment name created in Azure OpenAI Studio',
    azureSupportedModels: 'Supported Models',
    azureSupportedModelsPlaceholder: 'e.g., gpt-4, gpt-3.5-turbo',
    azureSupportedModelsDescription: 'Model list supported by this account, separated by commas. Leave blank to support all models',
    azureAccountSettings: 'Account Settings',
    azureIsActive: 'Enable this account',
    azureSchedulable: 'Allow scheduling',
    
    // Claude Console Model Mapping
    claudeConsoleModels: 'Model Mapping',
    claudeConsoleModelsDescription: 'Configure model request mapping relationships, mapping client-requested model names to actual models called.',
    modelMappingFrom: 'Request Model',
    modelMappingFromPlaceholder: 'e.g., claude-3-5-sonnet-20241022',
    modelMappingTo: 'Actual Model',
    modelMappingToPlaceholder: 'e.g., claude-3-5-sonnet-latest',
    addModelMapping: 'Add Mapping',
    removeMapping: 'Remove',
    presetMappings: 'Preset Mappings',
    modelMappingExample: 'Example: claude-3-5-sonnet-20241022 → claude-3-5-sonnet-latest',
    noMappingsConfigured: 'No mappings configured, will use original model name directly',
    
    // Setup Token Authorization Flow Detailed Steps
    setupTokenAuth: 'Setup Token Authorization',
    setupTokenAuthDescription: 'Setup Token is a secure authorization method that completes account verification through temporary authorization code.',
    setupTokenStep1: 'Step 1: Generate Authorization Link',
    setupTokenStep1Description: 'System will generate a dedicated authorization link for obtaining temporary authorization code.',
    setupTokenStep2: 'Step 2: Complete Authorization',
    setupTokenStep2Description: 'Open authorization link in new window, log in with your Claude account and complete authorization.',
    setupTokenStep3: 'Step 3: Enter Authorization Code',
    setupTokenStep3Description: 'After successful authorization, system will display authorization code, please copy and paste into input box below.',
    setupTokenUrlGenerated: 'Authorization link generated',
    setupTokenOpenInBrowser: 'Open in browser',
    setupTokenCopyLink: 'Copy link',
    setupTokenUrlExpiry: 'This link expires in 10 minutes, please complete authorization quickly',
    setupTokenAuthCode: 'Authorization Code *',
    setupTokenAuthCodePlaceholder: 'Please paste authorization code obtained from authorization page...',
    setupTokenAuthCodeDescription: 'After completing authorization, will display authorization code in format like "auth_code_xxx"',
    setupTokenSmartDetection: 'Smart Detection',
    setupTokenSmartDetectionDesc: 'Supports directly pasting complete callback URL, system will automatically extract authorization code',
    
    // More Error Messages and Validation Text
    unsupportedPlatform: 'Unsupported platform',
    accountCreationFailed: 'Account creation failed',
    accountUpdateFailed: 'Account update failed',
    detailsInfo: 'Details',
    accountCreationFailedConsole: 'Account creation failed:',
    accountUpdateFailedConsole: 'Account update failed:',
    clearCacheFailedWithError: 'Clear cache failed:',
    unknownError: 'Unknown error',
    modelMappingExistsInfo: 'Model mapping already exists',
    modelAddedMapping: 'Mapping added',
    
    // Rate Limiting and Quota Management
    rateLimitSettings: 'Rate Limit Settings',
    enableRateLimit: 'Enable rate limiting',
    rateLimitDuration: 'Rate limit duration (seconds)',
    rateLimitDurationPlaceholder: 'e.g., 60',
    rateLimitDescription: 'When enabled, will limit request frequency to prevent account being blocked',
    quotaManagement: 'Quota Management',
    dailyQuotaLabel: 'Daily quota limit',
    dailyQuotaPlaceholder: '0 means unlimited',
    quotaResetTimeLabel: 'Quota reset time',
    quotaResetTimePlaceholder: 'e.g., 00:00',
    quotaResetDescription: 'Time point when daily quota resets',
    currentDailyUsage: 'Today used',
    
    // Advanced Settings
    advancedSettings: 'Advanced Settings',
    customUserAgent: 'Custom User-Agent',
    customUserAgentPlaceholder: 'Leave blank to use default User-Agent...',
    userAgentDescription: 'User-Agent identifier for requests',
    
    // General Hints and Status
    notSet: 'Not set',
    unlimited: 'Unlimited',
    enabled: 'Enabled',
    disabled: 'Disabled',
    active: 'Active',
    inactive: 'Inactive',
    optional: 'Optional',
    required: 'Required',
    recommended: 'Recommended',
    
    // Additional Action Buttons
    testConnection: 'Test connection',
    testing: 'Testing...',
    refresh: 'Refresh',
    refreshing: 'Refreshing...',
    validate: 'Validate',
    validating: 'Validating...',
    save: 'Save',
    saving: 'Saving...',
    
    // Usage Statistics
    usageStats: 'Usage Statistics',
    loadingUsage: 'Loading usage...',
    usageLoadFailed: 'Failed to load usage',
    
    // Gemini Project ID Details
    geminiProjectIdRequired: 'Google Cloud/Workspace accounts require Project ID',
    geminiProjectIdDetail: 'Some Google accounts (especially those bound to Google Cloud) will be identified as Workspace accounts and require additional Project ID.',
    geminiHowToGetProjectId: 'How to get Project ID:',
    geminiVisitConsole: 'Visit',
    geminiCopyProjectId: 'Copy Project ID (Project ID), usually in string format',
    geminiProjectIdWarning: '⚠️ Note: Copy Project ID (Project ID), not Project Number (Project Number)!',
    geminiPersonalAccountTip: 'Tip: If your account is a regular personal account (not bound to Google Cloud), please leave this field empty.',
    
    // AWS Region Reference
    awsRegionReference: 'Common AWS regions reference:',
    awsRegionEastUS: 'us-east-1 (US East)',
    awsRegionWestUS: 'us-west-2 (US West)',
    awsRegionEuropeIreland: 'eu-west-1 (Europe Ireland)',
    awsRegionAsiaSingapore: 'ap-southeast-1 (Singapore)',
    awsRegionAsiaTokyo: 'ap-northeast-1 (Tokyo)',
    awsRegionEuropeFrankfurt: 'eu-central-1 (Frankfurt)',
    awsRegionInputTip: '💡 Please enter complete region code, e.g. us-east-1',
    
    // Bedrock Model Description
    bedrockModelConfigDesc: 'Bedrock model configuration description:',
    bedrockSupportsInferenceProfile: 'Supports Inference Profile ID (recommended)',
    bedrockSupportsARN: 'Supports Application Inference Profile ARN',
    bedrockCommonModel: 'Common model: us.anthropic.claude-sonnet-4-20250514-v1:0',
    bedrockEmptyUsesDefault: 'Leave empty to use system configured default model',
    
    // Azure OpenAI Model Selection
    azureModelSelectionDesc: 'Select model types supported by this deployment',
    
    // Rate Limiting
    rateLimitMechanism: 'Rate limiting mechanism',
    enableRateLimitMechanism: 'Enable rate limiting mechanism',
    rateLimitDescription2: 'When enabled, will pause scheduling for some time when account returns 429 error',
    rateLimitDurationMinutes: 'Rate limit duration (minutes)',
    rateLimitDefaultMinutes: 'Default 60 minutes',
    rateLimitPauseDesc: 'Time to pause scheduling after account is rate limited (minutes)',
    
    // Claude Console Specific Fields
    claudeConsoleFields: 'Claude Console specific fields',
    quotaManagement: 'Quota management',
    modelMappingTable: 'Model mapping table',
    modelMappingTableOptional: 'Model mapping table (optional)',
    addModelMapping: 'Add model mapping',
    
    // Claude Subscription Type
    subscriptionType: 'Subscription type',
    
    // Setup Token Auth
    setupTokenAuth: 'Setup Token authorization',
    claudeSetupTokenAuth: 'Claude Setup Token authorization',
    setupTokenAuthSteps: 'Please follow these steps to complete Claude account authorization through Setup Token:',
    generateSetupTokenLink: 'Generate Setup Token auth link',
    generating: 'Generating...',
    
    // Buttons and actions
    verifying: 'Verifying...',
    completeAuth: 'Complete authorization',
    updating: 'Updating...',
    update: 'Update',
    
    // Error messages
    generateSetupTokenFailed: 'Failed to generate Setup Token auth link',
    copyFailed: 'Copy failed, please copy manually',
    setupTokenAuthFailed: 'Setup Token authorization failed, please check if the authorization code is correct',
    accountCreationFailed: 'Account creation failed',
    accountCreationError: 'Account creation failed:',
    
    // Page structure comments
    stepIndicator: 'Step indicator',
    step1BasicInfo: 'Step 1: Basic information and proxy settings',
    groupSelector: 'Group selector',
    multiSelectGroup: 'Multi-select group interface',
    newGroupOption: 'New group option',
    geminiProjectId: 'Gemini project ID field',
    bedrockFields: 'Bedrock specific fields',
    azureOpenAIFields: 'Azure OpenAI specific fields',
    
    // Validation messages
    nameRequired: 'Please enter account name',
    apiUrlRequired: 'Please enter API URL',
    rateLimitDefault60: 'Default 60 minutes',
    rateLimitPauseDescription: 'Time to pause scheduling after account is rate limited (minutes)',
    apiUrlPlaceholder: 'e.g., https://api.example.com',
    apiKeyPlaceholder: 'Please enter API Key',
    dailyQuotaLimit: 'Daily quota limit ($)',
    quotaZeroUnlimited: '0 means unlimited',
    dailyQuotaDescription: 'Set daily usage quota, 0 means unlimited',
    quotaResetTime: 'Quota reset time',
    quotaResetTimeDescription: 'Time to automatically reset quota daily',
    modelMappingDescription: 'Leave empty to support all models without modifying requests. After configuring mapping, left model will be recognized as supported model, right is the actual model sent.',
    
    // Quota Management
    quotaManagementFields: 'Quota management fields',
    dailyQuotaLimitDollar: 'Daily quota limit ($)',
    quotaZeroUnlimited: '0 means unlimited',
    dailyQuotaDesc: 'Set daily usage quota, 0 means unlimited',
    quotaResetTime: 'Quota reset time',
    quotaResetTimeDesc: 'Time to automatically reset quota daily',
    
    // Model Mapping
    modelMappingOptional: 'Model mapping table (optional)',
    modelMappingDesc: 'Leave empty to support all models without modifying requests. After configuring mapping, left model will be recognized as supported model, right is the actual model sent.',
    originalModelName: 'Original model name',
    mappedModelName: 'Mapped model name',
    addModelMappingBtn: 'Add model mapping',
    customUserAgentOptional: 'Custom User-Agent (optional)',
    customUserAgentDesc: 'When empty, will automatically use client User-Agent, only fill when need to fix specific UA',
    userAgentPassthrough: 'Leave empty to pass through client User-Agent',
    
    // Claude Subscription Type
    claudeSubscriptionType: 'Subscription type',
    claudeProLimitation: 'Pro accounts do not support Claude Opus 4 model',
    
    // Claude Advanced Options
    claudeAutoStopScheduling: 'Auto-stop scheduling when approaching 5-hour limit',
    claudeAutoStopDesc: 'When system detects account approaching 5-hour usage limit, automatically pause scheduling for this account. Will resume automatically when entering new time window.',
    claudeUseUnifiedUA: 'Use unified Claude Code version',
    claudeUnifiedUADesc: 'When enabled, will use unified User-Agent captured from real Claude Code client, improving compatibility',
    claudeCurrentUnifiedVersion: '💡 Current unified version:',
    claudeWaitingCapture: '⏳ Waiting to capture User-Agent from Claude Code client',
    claudeCaptureHint: '💡 Hint: If unable to capture for long time, please confirm Claude Code client is using this account, or contact developer to check if User-Agent format has changed',
    claudeUseUnifiedClientId: 'Use unified client identifier',
    claudeUnifiedClientIdDesc: 'When enabled, will use fixed client identifier, making all requests appear to come from same client, reducing characteristics',
    claudeClientIdLabel: 'Client identifier ID',
    claudeClientIdDesc: 'This ID will replace user_id client part in requests, preserving session part for sticky sessions',
    
    // Setup Token Process
    setupTokenAuthProcess: 'Claude Setup Token Authorization',
    setupTokenProcessDesc: 'Please follow these steps to complete Claude account authorization through Setup Token:',
    setupTokenStepOneTitle: 'Step 1: Generate authorization link',
    setupTokenStepOneDesc: 'Click button below to generate authorization link',
    setupTokenGenerating: 'Generating...',
    setupTokenGenerateBtn: 'Generate Setup Token authorization link',
    setupTokenCopyTitle: 'Copy link',
    
    // Step Indicators
    stepIndicator: 'Step indicator',
    step1BasicInfo: 'Step 1: Basic information and proxy settings',
    step2OAuth: 'Step 2: OAuth authorization',
    step2SetupToken: 'Step 2: Setup Token authorization',
    
    // Group Selector
    groupSelector: 'Group selector',
    multiGroupInterface: 'Multi-group interface',
    createNewGroupOption: 'Create new group option',
    
    // Manual Token Input Tips
    credentialsFromFile: 'credentials from file.',
    
    // Placeholder texts
    originalModelNamePlaceholder: 'Original model name',
    mappedModelNamePlaceholder: 'Mapped model name',
    userAgentPlaceholder: 'Leave empty to pass through client User-Agent',
    authCodePlaceholder: 'Paste Authorization Code obtained from Claude Code auth page...',
    leaveEmptyNoUpdate: 'Leave empty for no update',
    leaveEmptyNoUpdateKey: 'Leave empty for no API Key update',
    leaveEmptyNoUpdateToken: 'Leave empty for no update...',
    
    // Labels and descriptions
    customUserAgentOptional: 'Custom User-Agent (optional)',
    clientIdLabel: 'Client ID',
    schedulePriorityLabel: 'Schedule Priority (1-100)',
    attentionLabel: 'Attention:',
    supportedModelsLabel: 'Supported Models',
    newAccessTokenLabel: 'New Access Token',
    newRefreshTokenLabel: 'New Refresh Token',
    updateTokenLabel: 'Update Token',
    
    // Button texts
    regenerateBtn: 'Regenerate',
    previousStepBtn: 'Previous Step',
    
    // Descriptive texts
    claudeProLimitation: 'Pro accounts do not support Claude Opus 4 model',
    claude5HourLimitDesc: 'Auto-stop scheduling when approaching 5-hour usage limit',
    claude5HourLimitExplanation: 'When system detects account approaching 5-hour usage limit, automatically pause scheduling for this account. Will resume automatically when entering new time window.',
    useUnifiedClaudeVersion: 'Use unified Claude Code version',
    unifiedVersionDesc: 'When enabled, will use unified User-Agent captured from real Claude Code client, improving compatibility',
    currentUnifiedVersion: '💡 Current unified version:',
    waitingUserAgent: '⏳ Waiting to capture User-Agent from Claude Code client',
    userAgentTip: '💡 Tip: If unable to capture for a long time, please confirm that Claude Code client is using this account,',
    contactDeveloper: 'or contact developer to check if User-Agent format has changed',
    useUnifiedClientId: 'Use unified client identifier',
    unifiedClientIdDesc: 'When enabled, will use fixed client identifier, making all requests appear from same client, reducing fingerprinting',
    clientIdReplaceDesc: 'This ID will replace the user_id client part in requests, retaining session part for sticky sessions',
    
    // OAuth step texts
    step1GenerateAuthLink: 'Step 1: Generate Authorization Link',
    clickButtonGenerate: 'Click button below to generate authorization link',
    copyLinkTitle: 'Copy Link',
    step2AccessAndAuth: 'Step 2: Access Link and Authorize',
    openInBrowser: 'Open link in browser and complete authorization',
    browserAuthDesc: 'Please open the authorization link in a new tab, login to your Claude account and authorize Claude Code.',
    proxyNotice: 'If you have set up a proxy, please ensure your browser also uses the same proxy to access the authorization page.',
    step3InputAuthCode: 'Step 3: Input Authorization Code',
    inputAuthCodeTitle: 'Input Authorization Code',
    authCompleteDesc: 'After authorization is complete, copy Authorization Code from the return page and paste it into the input box below:',
    pasteAuthCodeDesc: 'Please paste the Authorization Code copied from Claude Code authorization page',
    
    // AWS region reference
    awsRegionRef: 'Common AWS regions reference:',
    
    // Error messages
    apiKeyRequired: 'Please enter API Key',
    refreshTokenRequired: 'Please enter Refresh Token',
    accessTokenRequired: 'Please enter Access Token',
    copyFailedManual: 'Copy failed, please copy manually',
    
    // Form descriptions
    modelSupportDesc: 'Leave empty to support all models. If models are specified, requests with models not in the list will not be scheduled to this account',
    modelTypeSelectionDesc: 'Select model types supported by this deployment',
    userAgentDesc: 'When empty, will automatically use client User-Agent, only fill when need to fix specific UA',
    
    // Basic labels
    apiUrlLabel: 'API URL',
    apiUrlRequired: 'API URL *',
    apiKeyLabel: 'API Key',
    apiKeyRequired: 'API Key *',
    
    // More missing keys
    copyLinkTooltip: 'Copy Link',
    
    // Claude subscription type display
    claudeMaxDisplay: 'Claude Max',
    claudeProDisplay: 'Claude Pro'
  },

  // OAuth Flow Component
  oauthFlow: {
    // Platform titles
    claudeAccountAuth: 'Claude Account Authorization',
    geminiAccountAuth: 'Gemini Account Authorization',
    openaiAccountAuth: 'OpenAI Account Authorization',
    
    // Flow descriptions
    claudeAuthDescription: 'Please follow these steps to complete Claude account authorization:',
    geminiAuthDescription: 'Please follow these steps to complete Gemini account authorization:',
    openaiAuthDescription: 'Please follow these steps to complete OpenAI account authorization:',
    
    // Step titles
    step1Title: 'Click the button below to generate authorization link',
    step2Title: 'Open the link in browser and complete authorization',
    step3Title: 'Input Authorization Code',
    step3TitleOpenAI: 'Input authorization link or Code',
    
    // Step descriptions
    step2Description: 'Please open the authorization link in a new tab, log in to your Claude account and authorize.',
    step2DescriptionGemini: 'Please open the authorization link in a new tab, log in to your Gemini account and authorize.',
    step2DescriptionOpenAI: 'Please open the authorization link in a new tab, log in to your OpenAI account and authorize.',
    
    step3Description: 'After authorization is complete, the page will display a',
    step3DescriptionMiddle: ', please copy and paste it into the input box below:',
    step3DescriptionGemini: 'After authorization is complete, the page will display an Authorization Code, please copy and paste it into the input box below:',
    step3DescriptionOpenAI: 'After authorization is complete, when the page address changes to',
    step3DescriptionOpenAIMiddle: ':',
    
    // Button text
    generating: 'Generating...',
    generateAuthLink: 'Generate Authorization Link',
    regenerate: 'Regenerate',
    previousStep: 'Previous Step',
    completeAuth: 'Complete Authorization',
    verifying: 'Verifying...',
    
    // Placeholders
    authCodePlaceholder: 'Paste the Authorization Code obtained from Claude page...',
    authCodePlaceholderGemini: 'Paste the Authorization Code obtained from Gemini page...',
    authCodePlaceholderOpenAI: 'Method 1: Copy the complete link (http://localhost:1455/auth/callback?code=...)\nMethod 2: Copy only the code parameter value\nThe system will automatically recognize and extract the required information',
    
    // Labels
    authorizationCode: 'Authorization Code',
    authLinkOrCode: 'Authorization Link or Code',
    
    // Hints
    copyLinkTooltip: 'Copy Link',
    authCodeHint: 'Please paste the Authorization Code copied from Claude page',
    authCodeHintGemini: 'Please paste the Authorization Code copied from Gemini page',
    
    // Notices
    proxyNotice: 'Note:',
    proxyNoticeText: 'If you have set up a proxy, please ensure the browser also uses the same proxy to access the authorization page.',
    
    // OpenAI specific hints
    openaiImportantNote: 'Important Notice:',
    openaiLoadingNote: 'The page may take a long time to load after authorization, please wait patiently.',
    openaiAddressNote: 'When the browser address bar changes to',
    openaiAddressNoteMiddle: 'at the beginning, it means authorization is complete.',
    
    openaiTip: 'Tip:',
    openaiTipText: 'You can directly copy the entire link or just copy the code parameter value, the system will automatically recognize.',
    openaiLinkExample: '• Complete link example:',
    openaiCodeExample: '• Code only example:',
    
    // Success and error messages
    successExtractCode: 'Successfully extracted authorization code!',
    errorCodeNotFound: 'Authorization code parameter not found in URL, please check if the link is correct',
    errorLinkFormat: 'Link format error, please check if it is a complete URL',
    errorWrongUrlFormat: 'Please paste links starting with http://localhost:1455 or http://localhost:45462',
    linkCopied: 'Link copied',
    authFailed: 'Authorization failed, please check if the authorization code is correct',
    generateAuthFailed: 'Failed to generate authorization link'
  },

  // Group Management Modal
  groupManagement: {
    title: 'Account Group Management',
    createNewGroup: 'Create New Group',
    createGroup: 'Create New Group',
    groupNameRequired: 'Group Name *',
    groupNamePlaceholder: 'Enter group name',
    platformTypeRequired: 'Platform Type *',
    descriptionOptional: 'Description (Optional)',
    descriptionPlaceholder: 'Group description...',
    creating: 'Creating...',
    create: 'Create',
    cancel: 'Cancel',
    loading: 'Loading...',
    noGroups: 'No groups',
    noDescription: 'No description',
    membersCount: ' members',
    edit: 'Edit',
    delete: 'Delete',
    editGroup: 'Edit Group',
    platformTypeLabel: 'Platform Type',
    cannotModify: '(Cannot modify)',
    updating: 'Updating...',
    update: 'Update',
    // Toast messages
    loadGroupsFailed: 'Failed to load group list',
    fillRequiredFields: 'Please fill in required fields',
    groupCreated: 'Group created successfully',
    createGroupFailed: 'Failed to create group',
    fillGroupName: 'Please fill in group name',
    groupUpdated: 'Group updated successfully',
    updateGroupFailed: 'Failed to update group',
    groupHasMembers: 'Group has members, cannot delete',
    confirmDelete: 'Are you sure you want to delete group "{name}"?',
    groupDeleted: 'Group deleted successfully',
    deleteGroupFailed: 'Failed to delete group'
  },

  // Proxy Configuration
  proxyConfig: {
    title: 'Proxy Settings (Optional)',
    enableProxy: 'Enable Proxy',
    configDescription: 'Configure proxy to access restricted network resources. Supports SOCKS5 and HTTP proxy.',
    stabilityNotice: 'Please ensure the proxy server is stable and available, otherwise it will affect normal account usage.',
    proxyType: 'Proxy Type',
    hostAddress: 'Host Address',
    hostPlaceholder: 'e.g., 192.168.1.100',
    port: 'Port',
    portPlaceholder: 'e.g., 1080',
    needsAuth: 'Requires Authentication',
    username: 'Username',
    usernamePlaceholder: 'Proxy username',
    password: 'Password',
    passwordPlaceholder: 'Proxy password',
    tip: 'Tip:',
    apiRequestNotice: 'Proxy settings will be used for all API requests related to this account. Please ensure the proxy server supports HTTPS traffic forwarding.'
  }
}
