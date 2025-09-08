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
    settings: 'Settings'
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
  }
}
