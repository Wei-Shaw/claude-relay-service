// ============================================================
// Redis Key 统一注册表 — 单一权威源
// ============================================================
// 约定:
//   - 动态 key 用箭头函数 (id) => `prefix:${id}`,参数始终加括号
//   - 静态 key 用常量字符串
//   - SCAN/keys 的 pattern 单列为 xxxPattern,且与对应 builder 前缀逐字一致
//   - 派生后缀用 emptyMarker(indexKey) 这类 helper,调用方传入已生成的完整 key
//   - 红线: 每个生成结果必须与重构前的硬编码逐字节相同(含冒号/下划线/混合/字段顺序/末尾有无冒号)
//
// TTL 集中:
//   - 纯常量 TTL 放 TTL 表为数值
//   - config/参数派生的 TTL 放 TTL 表为函数(延迟读 config、逐字保留 fallback)
//   - 原始配置值仍在 config/config.js(配置单一源),此处只集中"key -> TTL 秒数"的换算逻辑
//
// 有意未集中(查询层动态 scan pattern):
//   usage/account_usage 的按时间 scan pattern(如 `usage:model:daily:*:${date}`)及
//   getUsageDataByIndex 的 `{id}` 占位符模板,因随查询维度组合、数量多、前缀已由上面 builder 体现,
//   保留在 usageStats/dashboard/apiStats 等查询处;改 usage key 前缀时需一并核对这些 pattern。
//   redis.js 的 excludePrefixes(scanApiKeyIds 排除前缀)、各 .replace(剥前缀) 同理保留。
// ============================================================

// 延迟加载 config,避免与 config/config.js 的潜在循环依赖(仿 upstreamErrorHelper)
let _config = null
const getConfig = () => {
  if (!_config) {
    try {
      _config = require('../../config/config')
    } catch {
      _config = {}
    }
  }
  return _config
}

const RedisKeys = {
  // ========== API Key ==========
  apiKey: {
    byId: (id) => `apikey:${id}`, // Hash: API Key 主数据
    hashMap: 'apikey:hash_map', // Hash: hashedKey -> keyId(认证热路径)
    hashLegacy: (hashedKey) => `apikey_hash:${hashedKey}`, // Hash: 旧结构,兼容回退/双写/双删
    allPattern: 'apikey:*', // scan: 全部 API Key(需排除 idx/set/tags/index/hash_map)
    tag: (tag) => `apikey:tag:${tag}`, // Set: 某标签下的 keyId
    tagPattern: 'apikey:tag:*', // scan: 全部标签集合
    tagsAll: 'apikey:tags:all', // Set: 所有标签（由 key 派生维护 + 重建重造）
    tagsManual: 'apikey:tags:manual', // Set: 手工创建的标签（createTag 登记，不随 key 派生、重建不重造，故 0 引用也持久）
    indexVersion: 'apikey:index:version', // String: 索引版本水位
    indexDrift: 'apikey:index:drift', // String: 漂移自愈指标(观测用,重建不清)
    legacyData: (id) => `api_key:${id}`, // 旧 API Key 数据 hash(下划线,选号读绑定用)
    legacyAll: 'api_keys', // 旧 API Key 集合
    tmp: (type, suffix) => `apikey:tmp:${type}:${suffix}`, // 分页/筛选临时 key(随机后缀)
    idx: {
      createdAt: 'apikey:idx:createdAt', // ZSet
      lastUsedAt: 'apikey:idx:lastUsedAt', // ZSet
      name: 'apikey:idx:name', // ZSet(name\x00id)
      deletedAt: 'apikey:idx:deletedAt', // ZSet(回收站)
      all: 'apikey:idx:all' // Set: 所有 keyId
    },
    set: {
      active: 'apikey:set:active', // Set
      deleted: 'apikey:set:deleted' // Set
    },
    // List: 快捷调整/禁用激活 变更流水（有界 + TTL）
    changeHistory: (id) => `apikey:change_history:${id}`
  },

  // ========== Usage 统计(API Key 维度) ==========
  usage: {
    total: (keyId) => `usage:${keyId}`, // Hash: 总计
    daily: (keyId, date) => `usage:daily:${keyId}:${date}`,
    monthly: (keyId, month) => `usage:monthly:${keyId}:${month}`,
    hourly: (keyId, hour) => `usage:hourly:${keyId}:${hour}`,
    // 全局模型维度(无 keyId)
    modelDaily: (model, date) => `usage:model:daily:${model}:${date}`,
    modelMonthly: (model, month) => `usage:model:monthly:${model}:${month}`,
    modelHourly: (model, hour) => `usage:model:hourly:${model}:${hour}`,
    // API Key + 模型维度
    keyModelDaily: (keyId, model, date) => `usage:${keyId}:model:daily:${model}:${date}`,
    keyModelMonthly: (keyId, model, month) => `usage:${keyId}:model:monthly:${model}:${month}`,
    keyModelHourly: (keyId, model, hour) => `usage:${keyId}:model:hourly:${model}:${hour}`,
    keyModelAlltime: (keyId, model) => `usage:${keyId}:model:alltime:${model}`,
    // 索引集合
    dailyIndex: (date) => `usage:daily:index:${date}`,
    hourlyIndex: (hour) => `usage:hourly:index:${hour}`,
    modelDailyIndex: (date) => `usage:model:daily:index:${date}`,
    modelHourlyIndex: (hour) => `usage:model:hourly:index:${hour}`,
    modelMonthlyIndex: (month) => `usage:model:monthly:index:${month}`,
    modelMonthlyMonths: 'usage:model:monthly:months', // Set: 全局月份索引
    keymodelDailyIndex: (date) => `usage:keymodel:daily:index:${date}`,
    keymodelHourlyIndex: (hour) => `usage:keymodel:hourly:index:${hour}`,
    // 全局预聚合
    globalTotal: 'usage:global:total',
    globalDaily: (date) => `usage:global:daily:${date}`,
    globalMonthly: (month) => `usage:global:monthly:${month}`,
    // 使用记录列表
    records: (keyId) => `usage:records:${keyId}`,
    // 费用(微美元整数)
    costDaily: (keyId, date) => `usage:cost:daily:${keyId}:${date}`,
    costMonthly: (keyId, month) => `usage:cost:monthly:${keyId}:${month}`,
    costHourly: (keyId, hour) => `usage:cost:hourly:${keyId}:${hour}`,
    costTotal: (keyId) => `usage:cost:total:${keyId}`,
    costRealTotal: (keyId) => `usage:cost:real:total:${keyId}`,
    costDedup: (dedupId) => `usage:cost:dedup:${dedupId}`, // 计费关键写幂等去重标记（重试窗口内）
    costRealDaily: (keyId, date) => `usage:cost:real:daily:${keyId}:${date}`,
    costPattern: 'usage:cost:*', // scan
    // Opus 周费用
    opusWeekly: (keyId, period) => `usage:opus:weekly:${keyId}:${period}`,
    opusTotal: (keyId) => `usage:opus:total:${keyId}`,
    opusRealWeekly: (keyId, period) => `usage:opus:real:weekly:${keyId}:${period}`,
    opusRealTotal: (keyId) => `usage:opus:real:total:${keyId}`,
    // scan patterns(与上面 builder 前缀逐字一致)
    allPattern: 'usage:*',
    dailyPattern: 'usage:daily:*',
    monthlyPattern: 'usage:monthly:*',
    modelDailyPattern: 'usage:model:daily:*',
    modelHourlyPattern: 'usage:model:hourly:*',
    modelMonthlyPattern: 'usage:model:monthly:*',
    hourlyPattern: 'usage:hourly:*',
    crossModelDailyPattern: 'usage:*:model:daily:*',
    crossModelHourlyPattern: 'usage:*:model:hourly:*',
    crossModelMonthlyPattern: 'usage:*:model:monthly:*:*',
    dailyDateScan: (date) => `usage:daily:*:${date}`,
    keyAlltimePattern: (keyId) => `usage:${keyId}:model:alltime:*`,
    keyModelAnyPattern: (keyId, model) => `usage:${keyId}:model:*:${model}:*`
  },

  // ========== Usage 统计(账户维度) ==========
  accountUsage: {
    total: (accountId) => `account_usage:${accountId}`,
    daily: (accountId, date) => `account_usage:daily:${accountId}:${date}`,
    monthly: (accountId, month) => `account_usage:monthly:${accountId}:${month}`,
    hourly: (accountId, hour) => `account_usage:hourly:${accountId}:${hour}`,
    modelDaily: (accountId, model, date) =>
      `account_usage:model:daily:${accountId}:${model}:${date}`,
    modelMonthly: (accountId, model, month) =>
      `account_usage:model:monthly:${accountId}:${model}:${month}`,
    modelHourly: (accountId, model, hour) =>
      `account_usage:model:hourly:${accountId}:${model}:${hour}`,
    dailyIndex: (date) => `account_usage:daily:index:${date}`,
    hourlyIndex: (hour) => `account_usage:hourly:index:${hour}`,
    modelDailyIndex: (date) => `account_usage:model:daily:index:${date}`,
    modelHourlyIndex: (hour) => `account_usage:model:hourly:index:${hour}`,
    modelDailyAnyPattern: (accountId, date) => `account_usage:model:daily:${accountId}:*:${date}` // scan(末尾日期,中间通配 model)
  },

  // ========== 账户余额 / 测试 / 过载 ==========
  account: {
    balance: (platform, accountId) => `account_balance:${platform}:${accountId}`, // String JSON
    balanceLocal: (platform, accountId) => `account_balance_local:${platform}:${accountId}`,
    balanceScript: (platform, accountId) => `account_balance_script:${platform}:${accountId}`,
    overload: (accountId) => `account:overload:${accountId}`, // String: 过载冷却
    testHistory: (platform, accountId) => `account:test_history:${platform}:${accountId}`, // List
    testConfig: (platform, accountId) => `account:test_config:${platform}:${accountId}`, // String JSON
    testConfigPattern: (platform) => `account:test_config:${platform}:*`,
    lastTest: (platform, accountId) => `account:last_test:${platform}:${accountId}`
  },

  // ========== 各平台账户主数据(冒号/下划线/JSON 多种变体,逐字保留,绝不统一) ==========
  accounts: {
    // Claude: 冒号(写+优先读+扫描) / 下划线(回退读 + 错误计数)
    claude: (id) => `claude:account:${id}`,
    claudeIndex: 'claude:account:index',
    claudePattern: 'claude:account:*',
    claudeUnderscore: (id) => `claude_account:${id}`,
    claude401Errors: (id) => `claude_account:${id}:401_errors`,
    claude5xxErrors: (id) => `claude_account:${id}:5xx_errors`,
    // Claude Console
    claudeConsole: (id) => `claude_console_account:${id}`,
    claudeConsoleIndex: 'claude_console_account:index',
    claudeConsolePattern: 'claude_console_account:*',
    sharedClaudeConsole: 'shared_claude_console_accounts',
    // CCR
    ccr: (id) => `ccr_account:${id}`,
    ccrIndex: 'ccr_account:index',
    ccrPattern: 'ccr_account:*',
    sharedCcr: 'shared_ccr_accounts',
    // OpenAI: 冒号(主) / 下划线(回退)
    openai: (id) => `openai:account:${id}`,
    openaiIndex: 'openai:account:index',
    openaiPattern: 'openai:account:*',
    openaiUnderscore: (id) => `openai_account:${id}`,
    sharedOpenai: 'shared_openai_accounts',
    // OpenAI Responses
    openaiResponses: (id) => `openai_responses_account:${id}`,
    openaiResponsesIndex: 'openai_responses_account:index',
    openaiResponsesPattern: 'openai_responses_account:*',
    sharedOpenaiResponses: 'shared_openai_responses_accounts',
    // Gemini(OAuth)
    gemini: (id) => `gemini_account:${id}`,
    geminiIndex: 'gemini_account:index',
    geminiPattern: 'gemini_account:*',
    sharedGemini: 'shared_gemini_accounts',
    // Gemini API
    geminiApi: (id) => `gemini_api_account:${id}`,
    geminiApiIndex: 'gemini_api_account:index',
    geminiApiPattern: 'gemini_api_account:*',
    sharedGeminiApi: 'shared_gemini_api_accounts',
    // Azure OpenAI: 冒号特异
    azureOpenai: (id) => `azure_openai:account:${id}`,
    azureOpenaiIndex: 'azure_openai:account:index',
    azureOpenaiPattern: 'azure_openai:account:*',
    sharedAzureOpenai: 'shared_azure_openai_accounts',
    // Bedrock: String JSON 存储(非 hash)
    bedrock: (id) => `bedrock_account:${id}`,
    bedrockIndex: 'bedrock_account:index',
    bedrockPattern: 'bedrock_account:*',
    // Droid: 冒号
    droid: (id) => `droid:account:${id}`,
    droidIndex: 'droid:account:index',
    droidPattern: 'droid:account:*',
    // Droid 粘性 API Key 映射(三层复合)
    droidApiKey: (accountId, endpoint, sessionHash) =>
      `droid_api_key:${accountId}:${endpoint}:${sessionHash}`,
    // Grok / xAI: 冒号
    grok: (id) => `grok:account:${id}`,
    grokIndex: 'grok:account:index',
    grokPattern: 'grok:account:*',
    sharedGrok: 'shared_grok_accounts'
  },

  // ========== 会话 ==========
  session: {
    admin: (sessionId) => `session:${sessionId}`, // Hash: 管理员会话
    adminPattern: 'session:*',
    adminCredentials: 'session:admin_credentials', // Hash: 固定管理员凭据
    oauth: (sessionId) => `oauth:${sessionId}`, // Hash: OAuth 临时会话
    oauthPattern: 'oauth:*',
    sticky: (sessionHash) => `sticky_session:${sessionHash}`, // String: 粘性会话
    stickyPattern: 'sticky_session:*',
    // 账户会话映射(粘性,各平台命名不同,逐字保留)
    openaiMapping: (sessionHash) => `openai_session_account_mapping:${sessionHash}`,
    geminiMapping: (sessionHash) => `gemini_session_account_mapping:${sessionHash}`,
    azureOpenaiMapping: (sessionId) => `azure_openai_session_account_mapping:${sessionId}`,
    openaiAccountSessions: (accountId) => `openai_account_sessions:${accountId}`, // Set
    geminiAccountSessions: (accountId) => `gemini_account_sessions:${accountId}`, // Set
    // 统一调度层会话映射
    unifiedClaudeMapping: (sessionHash) => `unified_claude_session_mapping:${sessionHash}`,
    unifiedGeminiMapping: (sessionHash) => `unified_gemini_session_mapping:${sessionHash}`,
    // Gemini 调度按 oauthProvider 区分的会话映射(provider 中插)
    unifiedGeminiMappingByProvider: (provider, sessionHash) =>
      `unified_gemini_session_mapping:${provider}:${sessionHash}`,
    unifiedOpenaiMapping: (sessionHash) => `unified_openai_session_mapping:${sessionHash}`,
    // Droid 调度会话粘性(endpoint + apiKeyPart + sessionHash)
    droidSticky: (endpoint, apiKeyPart, sessionHash) =>
      `droid:${endpoint}:${apiKeyPart}:${sessionHash}`,
    // Grok 调度会话映射
    unifiedGrokMapping: (sessionHash) => `unified_grok_session_mapping:${sessionHash}`,
    grokAccountSessions: (accountId) => `grok_account_sessions:${accountId}`, // Set
    originalBinding: (sessionId) => `original_session_binding:${sessionId}` // Claude relay 原始会话绑定
  },

  // ========== 限流(API Key 维度) ==========
  rateLimit: {
    account: (accountId) => `ratelimit:${accountId}`, // 账户级限流(无下划线,与 keyId 维度 rate_limit: 不同)
    windowStart: (keyId) => `rate_limit:window_start:${keyId}`,
    requests: (keyId) => `rate_limit:requests:${keyId}`,
    tokens: (keyId) => `rate_limit:tokens:${keyId}`,
    cost: (keyId) => `rate_limit:cost:${keyId}`,
    pattern: 'ratelimit:*' // 注意: cleanup 用的是 ratelimit:*(无下划线,见 redis.js 清理列表)
  },

  // ========== 并发 ==========
  concurrency: {
    byKey: (apiKeyId) => `concurrency:${apiKeyId}`, // ZSet: 并发租约
    pattern: 'concurrency:*',
    consoleAccount: (accountId) => `console_account:${accountId}`, // Console 账户并发
    queue: (apiKeyId) => `concurrency:queue:${apiKeyId}`,
    queuePattern: 'concurrency:queue:*',
    queueStats: (apiKeyId) => `concurrency:queue:stats:${apiKeyId}`,
    queueStatsPattern: 'concurrency:queue:stats:*',
    queueWaitTimes: (apiKeyId) => `concurrency:queue:wait_times:${apiKeyId}`,
    queueWaitTimesGlobal: 'concurrency:queue:wait_times:global'
  },

  // ========== 用户消息队列(账户级串行) ==========
  userMsgQueue: {
    lock: (accountId) => `user_msg_queue_lock:${accountId}`,
    last: (accountId) => `user_msg_queue_last:${accountId}`,
    lockPattern: 'user_msg_queue_lock:*'
  },

  // ========== 锁 ==========
  lock: {
    tokenRefresh: (platform, accountId) => `token_refresh_lock:${platform}:${accountId}`,
    weeklyOpusInit: (date) => `lock:init:weekly_opus_cost:${date}`
  },

  // ========== 系统 / 迁移 ==========
  system: {
    metricsMinute: (minute) => `system:metrics:minute:${minute}`,
    serviceRates: 'system:service_rates', // String(JSON): 服务费率配置
    weeklyOpusDone: (date) => `init:weekly_opus_cost:${date}:done`, // 周费用回填日级 marker

    metricsMinutePattern: 'system:metrics:minute:*',
    migratedVersion: 'system:migrated:version', // 版本门控水位
    migrationsApplied: 'system:migrations:applied', // Hash: marker 型迁移台账(ledger)
    migrationUsageIndexV2: 'system:migration:usage_index_v2',
    migrationAlltimeModelStatsV1: 'system:migration:alltime_model_stats_v1'
  },

  // ========== 账户组 ==========
  accountGroup: {
    groups: 'account_groups', // Hash: 组定义
    group: (id) => `account_group:${id}`,
    members: (id) => `account_group_members:${id}`, // Set
    reverse: (platform, accountId) => `account_groups_reverse:${platform}:${accountId}`, // Set
    reverseMigrated: 'account_groups_reverse:migrated' // marker
  },

  // ========== 成本排名 ==========
  costRank: {
    rank: (timeRange) => `cost_rank:${timeRange}`, // ZSet
    temp: (timeRange) => `cost_rank:${timeRange}:temp:${Date.now()}`, // ZSet: 重建临时
    meta: (timeRange) => `cost_rank_meta:${timeRange}`,
    lock: (timeRange) => `cost_rank_lock:${timeRange}`
  },

  // ========== 请求详情 ==========
  requestDetail: {
    item: (requestId) => `request_detail:item:${requestId}`,
    itemPattern: 'request_detail:item:*',
    dayIndex: (day) => `request_detail:index:day:${day}`,
    querySnapshot: (snapshotId) => `request_detail:query_snapshot:${snapshotId}`
  },

  // ========== Claude Code 头/UA ==========
  claudeCode: {
    headers: (accountId) => `claude_code_headers:${accountId}`,
    headersPattern: 'claude_code_headers:*',
    userAgentDaily: 'claude_code_user_agent:daily'
  },

  // ========== 上游错误自动保护 ==========
  upstream: {
    tempUnavailable: (accountType, accountId) => `temp_unavailable:${accountType}:${accountId}`,
    tempUnavailablePrefix: 'temp_unavailable', // 前缀(导出/拼接/扫描派生用)
    tempUnavailablePattern: 'temp_unavailable:*',
    errorHistory: (accountType, accountId) => `error_history:${accountType}:${accountId}`,
    errorHistoryPrefix: 'error_history'
  },

  // ========== 支付 ==========
  payment: {
    config: 'payment:config',
    session: (token) => `payment:session:${token}`,
    audit: (orderId) => `payment:audit:${orderId}`,
    lockCreate: (apiKeyId) => `payment:lock:create:${apiKeyId}`,
    lockRefund: (orderId) => `payment:lock:refund:${orderId}`, // REFUNDING 重入续退串行锁
    dailyRecharge: (apiKeyId, date) => `payment:daily_recharge:${apiKeyId}:${date}`,
    providerRr: (paymentType) => `payment:provider:rr:${paymentType}`,
    balance: (keyId) => `payment:balance:${keyId}`, // 旧实时计数器（已弃用，余额改派生）
    balanceApplied: (keyId) => `payment:balance:applied:${keyId}`,
    balanceReversed: (keyId) => `payment:balance:reversed:${keyId}`, // refId→实扣回收额（reverse Lua 原子记录）
    balanceTx: (keyId) => `payment:balance:tx:${keyId}`,
    balanceCredit: (keyId) => `payment:balance:credit:${keyId}`, // 充值累计入账额度
    balanceRefunded: (keyId) => `payment:balance:refunded:${keyId}`, // 退款回收累计额度
    balanceBaseline: (keyId) => `payment:balance:baseline:${keyId}`, // 转 prepaid 时的 usage:cost:total 基线
    order: (id) => `payment:order:${id}`,
    orderApikey: (apiKeyId) => `payment:order:apikey:${apiKeyId}`,
    orderOuttrade: (outTradeNo) => `payment:order:outtrade:${outTradeNo}`,
    orderIdxCreated: 'payment:order:idx:created',
    orderIdxPending: 'payment:order:idx:pending',
    // 按状态倒序列表（score=createdAt），与 casStatus/save 同步维护；管理端 status 过滤走此索引
    orderIdxStatus: (status) => `payment:order:idx:status:${status}`,
    // 状态索引轮询游标（paid 卡单履约等公平扫描，防只扫最新 N 条饿死旧单）
    scanCursor: (name) => `payment:scan:cursor:${name}`,
    plan: (id) => `payment:plan:${id}`,
    plansAll: 'payment:plans:all',
    provider: (id) => `payment:provider:${id}`,
    providerDaily: (id, date) => `payment:provider:daily:${id}:${date}`,
    providersAll: 'payment:providers:all'
  },

  // ========== 计费事件流 ==========
  billingEvents: 'billing:events', // Stream
  relayConfig: 'claude_relay_config', // String(JSON): Claude relay 全局配置
  testModelConfig: 'test_model_config', // String(JSON): 连通性测试默认模型配置
  // String(JSON): 模型定价数据源(管理端可改,空/缺失回落 config/pricingSource.js)
  pricingSource: 'system:pricing_source',
  // Hash: 管理端从定价源导入的模型目录(modelId -> JSON{provider,importedAt})
  // 叠加在 modelService 内置列表之上,不覆盖内置项;删除仅删本 Hash 内的条目
  importedModels: 'system:imported_models',

  // ========== 配额卡 / 兑换 ==========
  quotaCard: {
    byId: (id) => `quota_card:${id}`,
    byCode: (code) => `quota_card_code:${code}`,
    all: 'quota_cards:all',
    status: (status) => `quota_cards:status:${status}`
  },
  redemption: {
    byId: (id) => `redemption:${id}`,
    all: 'redemptions:all',
    byApikey: (apiKeyId) => `redemptions:apikey:${apiKeyId}`,
    byUser: (userId) => `redemptions:user:${userId}`
  },

  // ========== 兑换码防爆破限流 ==========
  redeemCard: {
    fail: (ip) => `redeem_card:fail:${ip}`,
    ip: (ip, hour) => `redeem_card:ip:${ip}:${hour}`
  },

  // ========== 用户(用户管理) ==========
  user: {
    byId: (id) => `user:${id}`,
    index: 'user:index',
    session: (token) => `user_session:${token}`,
    byName: (name) => `username:${name}`
  },

  // ========== 代理池(原 proxyRedisKeys.js,逐字搬迁含注释) ==========
  proxy: {
    configs: 'proxy:configs', // Hash: proxyId -> JSON(权威源)
    groups: 'proxy:groups', // Hash: groupId -> JSON(权威源)
    settings: 'proxy:settings', // String(JSON): 全局调优
    groupMembers: (gid) => `proxy:group:members:${gid}`, // Set
    routeVersion: 'proxy:route:version', // String: 路由表版本号
    stats: (proxyId, contextKey) => `proxy:stats:${proxyId}:${contextKey}`, // Hash: 运行时统计
    statsPrefix: 'proxy:stats:', // stats key 扫描前缀
    probeLock: (proxyId, contextKey) => `proxy:stats:${proxyId}:${contextKey}:probe`,
    healthHistory: (proxyId) => `proxy:health_history:${proxyId}`, // List
    qualityResult: (proxyId) => `proxy:quality:${proxyId}`, // String(JSON)
    exitInfo: (proxyId) => `proxy:exit_info:${proxyId}`, // String(JSON)
    configChangedChannel: 'proxy:config-changed', // Pub/Sub
    healthCheckLock: 'proxy:health_check_lock' // String: 选主锁
  },

  // ========== 派生后缀 helper ==========
  emptyMarker: (indexKey) => `${indexKey}:empty`
}

// ============================================================
// TTL(秒) — 纯常量直接值,config/参数派生用函数
// ============================================================
const DAY = 86400

const TTL = {
  // —— 用量(API Key + 账户共用同套日/时/月) ——
  usageDaily: DAY * 32,
  usageHourly: DAY * 7,
  usageMonthly: DAY * 365,
  usageRecords: DAY * 90, // usage:records 列表过期
  opusWeekly: 14 * 24 * 3600, // opus 周费用(2周)
  apiKeyData: DAY * 365, // apikey 主数据 hash 过期(1年)
  // —— 费用(刻意 >= 对应用量,否则用量还在、费用先过期,启动对账会误判缺费用反复全量重算) ——
  costDaily: DAY * 33, // > 用量日 32
  costMonthly: DAY * 366, // >= 用量月 365
  costHourly: DAY * 7,
  costDedup: 600, // 计费关键写幂等去重标记（只需覆盖 incrementDailyCost 重试窗口）
  // —— 会话 ——
  adminSession: DAY, // session:${id} 参数默认 86400
  oauthSession: 600, // oauth:${id} 参数默认 600(10 分钟)
  oauthCleanupOther: DAY, // cleanup 给无 TTL 的非 oauth key 兜底 1 天
  // —— 账户余额 ——
  accountBalance: 3600, // 1 小时(参数默认)
  accountBalanceLocal: 300, // 5 分钟(参数默认)
  // —— 账户测试 ——
  accountTestHistory: DAY * 30,
  accountTestConfig: DAY * 365,
  accountLastTest: DAY * 7, // account:last_test 时间(7天)
  // —— 代理池 ——
  proxyHealthHistory: 7 * 24 * 3600,
  proxyQuality: 30 * 24 * 3600,
  proxyExitInfo: 30 * 24 * 3600,
  // —— Claude Code ——
  claudeCodeHeaders: 7 * 24 * 3600,
  claudeCodeUserAgent: 90000, // 25 小时
  // —— 队列 ——
  queueStats: DAY * 7,
  waitTime: DAY,
  // —— 支付 ——
  paymentSession: 1800, // 30 分钟(滑动续期)
  // paymentAudit 历史曾 180 天 TTL；现审计与订单同属支付证据、不再 expire（见 paymentAudit.js）
  // 常量保留供兼容读，新写入不调用 expire
  paymentAudit: DAY * 180,
  // API Key 变更流水（快捷调整/禁用激活），有界 List + TTL
  apiKeyChangeHistory: DAY * 180,
  dailyRecharge: DAY * 2, // 当日累计充值金额(dailyLimit 用),原硬编码 86400*2
  providerDailyReservation: DAY * 3, // 渠道实例当日预留(兼容对账窗口)
  redeemCardWindow: 3600, // 兑换码防爆破窗口 1 小时
  // —— 杂项 ——
  emptyMarker: 3600, // 索引空标记 1 小时
  upstreamRateLimit: 300, // 429: 5 分钟(不可配,硬编码)
  requestDetailQuerySnapshot: 30,

  // —— 派生(延迟读 config / 参数,逐字保留 fallback) ——
  // 粘性会话: config.session.stickyTtlHours,默认 1 小时
  stickySession: () => (getConfig().session?.stickyTtlHours || 1) * 60 * 60,
  // 系统分钟指标: config.system.metricsWindow * 2,默认窗口 5 分钟
  systemMetrics: () => (getConfig().system?.metricsWindow || 5) * 60 * 2,
  // 上游错误各类型(config > [503 额外 env] > 默认)
  upstream503: () => {
    const config = getConfig()
    const envValue = parseInt(process.env.UPSTREAM_ERROR_503_TTL_SECONDS, 10)
    return (
      config.upstreamError?.serviceUnavailableTtlSeconds ??
      (Number.isFinite(envValue) && envValue > 0 ? envValue : null) ??
      60
    )
  },
  upstreamServerError: () => getConfig().upstreamError?.serverErrorTtlSeconds ?? 300,
  upstreamOverload: () => getConfig().upstreamError?.overloadTtlSeconds ?? 600,
  upstreamAuthError: () => getConfig().upstreamError?.authErrorTtlSeconds ?? 1800,
  upstreamTimeout: () => getConfig().upstreamError?.timeoutTtlSeconds ?? 300,
  // 上游 retry-after 派生 TTL 的上限(config > env > 默认 30 分钟),防周级限额把账号长时间下线
  upstreamMaxCustom: () => {
    const config = getConfig()
    const envValue = parseInt(process.env.UPSTREAM_ERROR_MAX_CUSTOM_TTL_SECONDS, 10)
    return (
      config.upstreamError?.maxCustomTtlSeconds ??
      (Number.isFinite(envValue) && envValue > 0 ? envValue : null) ??
      1800
    )
  },
  errorHistory: () => {
    // 与 upstreamErrorHelper 的 positiveInt(eh.errorHistoryTtlDays, 3) 逐字等价(要求 >0 否则 fallback 3)
    const days = getConfig().upstreamError?.errorHistoryTtlDays
    return (Number.isFinite(days) && days > 0 ? Math.floor(days) : 3) * 24 * 60 * 60
  },
  // 请求详情(参数派生): retentionHours
  requestDetailItem: (retentionHours) => Math.max(3600, retentionHours * 3600),
  requestDetailIndex: (itemTtlSeconds) => itemTtlSeconds + DAY,
  // 限流窗口(per-key 参数,毫秒)
  rateLimitWindowMs: (rateLimitWindow) => rateLimitWindow * 60 * 1000,
  // 并发租约(参数派生,毫秒)
  concurrencyLeaseMs: (leaseSeconds, graceSeconds) =>
    Math.max((leaseSeconds + graceSeconds) * 1000, 60000)
}

// ============================================================
// LIMITS — 集合容量上限(仅"真有裁剪动作"的)
// ============================================================
const LIMITS = {
  usageRecords: 200,
  accountTestHistory: 5,
  proxyHealthHistory: 50,
  paymentAudit: 100,
  balanceTx: 1000,
  waitTimesPerKey: 500,
  waitTimesGlobal: 2000,
  billingEventsStream: 100000,
  apiKeyChangeHistory: 200,
  // 导入模型目录条目上限(单 Hash 不得无界增长)。上游全量定价约 226 个模型,1000 留足余量
  importedModels: 1000
}

module.exports = { RedisKeys, TTL, LIMITS }
