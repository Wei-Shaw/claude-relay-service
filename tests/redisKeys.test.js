// Redis key 集中注册表的回归防线:锁定每个 builder 的逐字输出、TTL/LIMITS 数值、派生 TTL 的 fallback 分支。
// 红线: builder 生成的字符串必须与重构前硬编码逐字节一致。任一断言变红 = 行为变更被捕获。

const { RedisKeys, TTL, LIMITS } = require('../src/constants/redisKeys')

describe('RedisKeys.apiKey', () => {
  test('动态/静态 key 逐字', () => {
    expect(RedisKeys.apiKey.byId('k1')).toBe('apikey:k1')
    expect(RedisKeys.apiKey.hashMap).toBe('apikey:hash_map')
    expect(RedisKeys.apiKey.hashLegacy('H')).toBe('apikey_hash:H')
    expect(RedisKeys.apiKey.tag('t1')).toBe('apikey:tag:t1')
    expect(RedisKeys.apiKey.tagsAll).toBe('apikey:tags:all')
    expect(RedisKeys.apiKey.indexVersion).toBe('apikey:index:version')
  })
  test('idx / set 全量(原 INDEX_KEYS)', () => {
    expect(RedisKeys.apiKey.idx.createdAt).toBe('apikey:idx:createdAt')
    expect(RedisKeys.apiKey.idx.lastUsedAt).toBe('apikey:idx:lastUsedAt')
    expect(RedisKeys.apiKey.idx.name).toBe('apikey:idx:name')
    expect(RedisKeys.apiKey.idx.deletedAt).toBe('apikey:idx:deletedAt')
    expect(RedisKeys.apiKey.idx.all).toBe('apikey:idx:all')
    expect(RedisKeys.apiKey.set.active).toBe('apikey:set:active')
    expect(RedisKeys.apiKey.set.deleted).toBe('apikey:set:deleted')
  })
})

describe('RedisKeys.usage', () => {
  test('统计全家', () => {
    expect(RedisKeys.usage.total('k')).toBe('usage:k')
    expect(RedisKeys.usage.daily('k', '2026-06-03')).toBe('usage:daily:k:2026-06-03')
    expect(RedisKeys.usage.monthly('k', '2026-06')).toBe('usage:monthly:k:2026-06')
    expect(RedisKeys.usage.hourly('k', '2026-06-03:14')).toBe('usage:hourly:k:2026-06-03:14')
    expect(RedisKeys.usage.modelDaily('m', '2026-06-03')).toBe('usage:model:daily:m:2026-06-03')
    expect(RedisKeys.usage.keyModelDaily('k', 'm', '2026-06-03')).toBe(
      'usage:k:model:daily:m:2026-06-03'
    )
    expect(RedisKeys.usage.keyModelAlltime('k', 'm')).toBe('usage:k:model:alltime:m')
  })
  test('索引集合 + 全局月份', () => {
    expect(RedisKeys.usage.dailyIndex('2026-06-03')).toBe('usage:daily:index:2026-06-03')
    expect(RedisKeys.usage.keymodelDailyIndex('2026-06-03')).toBe(
      'usage:keymodel:daily:index:2026-06-03'
    )
    expect(RedisKeys.usage.modelMonthlyMonths).toBe('usage:model:monthly:months')
    expect(RedisKeys.usage.globalTotal).toBe('usage:global:total')
    expect(RedisKeys.usage.globalDaily('2026-06-03')).toBe('usage:global:daily:2026-06-03')
  })
  test('费用 / opus', () => {
    expect(RedisKeys.usage.costDaily('k', '2026-06-03')).toBe('usage:cost:daily:k:2026-06-03')
    expect(RedisKeys.usage.costRealDaily('k', '2026-06-03')).toBe(
      'usage:cost:real:daily:k:2026-06-03'
    )
    expect(RedisKeys.usage.costTotal('k')).toBe('usage:cost:total:k')
    expect(RedisKeys.usage.opusWeekly('k', 'p')).toBe('usage:opus:weekly:k:p')
    expect(RedisKeys.usage.opusRealTotal('k')).toBe('usage:opus:real:total:k')
  })
  test('records', () => {
    expect(RedisKeys.usage.records('k')).toBe('usage:records:k')
  })
})

describe('RedisKeys.accountUsage', () => {
  test('账户统计全家(注意参数顺序 accountId/model/date)', () => {
    expect(RedisKeys.accountUsage.total('a')).toBe('account_usage:a')
    expect(RedisKeys.accountUsage.daily('a', '2026-06-03')).toBe('account_usage:daily:a:2026-06-03')
    expect(RedisKeys.accountUsage.modelDaily('a', 'm', '2026-06-03')).toBe(
      'account_usage:model:daily:a:m:2026-06-03'
    )
    expect(RedisKeys.accountUsage.modelHourly('a', 'm', '2026-06-03:14')).toBe(
      'account_usage:model:hourly:a:m:2026-06-03:14'
    )
    expect(RedisKeys.accountUsage.dailyIndex('2026-06-03')).toBe(
      'account_usage:daily:index:2026-06-03'
    )
  })
})

describe('RedisKeys.account 余额/测试/过载', () => {
  test('逐字', () => {
    expect(RedisKeys.account.balance('claude', 'a')).toBe('account_balance:claude:a')
    expect(RedisKeys.account.balanceLocal('claude', 'a')).toBe('account_balance_local:claude:a')
    expect(RedisKeys.account.balanceScript('claude', 'a')).toBe('account_balance_script:claude:a')
    expect(RedisKeys.account.overload('a')).toBe('account:overload:a')
    expect(RedisKeys.account.testHistory('claude', 'a')).toBe('account:test_history:claude:a')
    expect(RedisKeys.account.testConfig('claude', 'a')).toBe('account:test_config:claude:a')
    expect(RedisKeys.account.lastTest('claude', 'a')).toBe('account:last_test:claude:a')
  })
})

// 账户矩阵: 冒号/下划线/混合/JSON 变体逐字保留,绝不统一(最高危)
describe('RedisKeys.accounts 平台前缀矩阵(防误统一)', () => {
  test('Claude 双前缀 + 错误计数', () => {
    expect(RedisKeys.accounts.claude('a')).toBe('claude:account:a')
    expect(RedisKeys.accounts.claudeIndex).toBe('claude:account:index')
    expect(RedisKeys.accounts.claudeUnderscore('a')).toBe('claude_account:a')
    expect(RedisKeys.accounts.claude401Errors('a')).toBe('claude_account:a:401_errors')
    expect(RedisKeys.accounts.claude5xxErrors('a')).toBe('claude_account:a:5xx_errors')
  })
  test('OpenAI 双前缀', () => {
    expect(RedisKeys.accounts.openai('a')).toBe('openai:account:a')
    expect(RedisKeys.accounts.openaiIndex).toBe('openai:account:index')
    expect(RedisKeys.accounts.openaiUnderscore('a')).toBe('openai_account:a')
  })
  test('Azure 冒号特异', () => {
    expect(RedisKeys.accounts.azureOpenai('a')).toBe('azure_openai:account:a')
    expect(RedisKeys.accounts.azureOpenaiIndex).toBe('azure_openai:account:index')
  })
  test('下划线平台', () => {
    expect(RedisKeys.accounts.claudeConsole('a')).toBe('claude_console_account:a')
    expect(RedisKeys.accounts.ccr('a')).toBe('ccr_account:a')
    expect(RedisKeys.accounts.openaiResponses('a')).toBe('openai_responses_account:a')
    expect(RedisKeys.accounts.gemini('a')).toBe('gemini_account:a')
    expect(RedisKeys.accounts.geminiApi('a')).toBe('gemini_api_account:a')
    expect(RedisKeys.accounts.bedrock('a')).toBe('bedrock_account:a')
  })
  test('Droid 冒号 + 三层粘性', () => {
    expect(RedisKeys.accounts.droid('a')).toBe('droid:account:a')
    expect(RedisKeys.accounts.droidIndex).toBe('droid:account:index')
    expect(RedisKeys.accounts.droidApiKey('a', 'ep', 'h')).toBe('droid_api_key:a:ep:h')
  })
  test('shared 集合', () => {
    expect(RedisKeys.accounts.sharedClaudeConsole).toBe('shared_claude_console_accounts')
    expect(RedisKeys.accounts.sharedCcr).toBe('shared_ccr_accounts')
    expect(RedisKeys.accounts.sharedOpenai).toBe('shared_openai_accounts')
    expect(RedisKeys.accounts.sharedOpenaiResponses).toBe('shared_openai_responses_accounts')
    expect(RedisKeys.accounts.sharedGemini).toBe('shared_gemini_accounts')
    expect(RedisKeys.accounts.sharedGeminiApi).toBe('shared_gemini_api_accounts')
    expect(RedisKeys.accounts.sharedAzureOpenai).toBe('shared_azure_openai_accounts')
  })
})

describe('RedisKeys.session 映射(命名各异,逐字)', () => {
  test('逐字', () => {
    expect(RedisKeys.session.admin('s')).toBe('session:s')
    expect(RedisKeys.session.oauth('s')).toBe('oauth:s')
    expect(RedisKeys.session.sticky('h')).toBe('sticky_session:h')
    expect(RedisKeys.session.openaiMapping('h')).toBe('openai_session_account_mapping:h')
    expect(RedisKeys.session.geminiMapping('h')).toBe('gemini_session_account_mapping:h')
    expect(RedisKeys.session.azureOpenaiMapping('s')).toBe('azure_openai_session_account_mapping:s')
    expect(RedisKeys.session.openaiAccountSessions('a')).toBe('openai_account_sessions:a')
    expect(RedisKeys.session.geminiAccountSessions('a')).toBe('gemini_account_sessions:a')
    expect(RedisKeys.session.unifiedClaudeMapping('h')).toBe('unified_claude_session_mapping:h')
    expect(RedisKeys.session.unifiedGeminiMapping('h')).toBe('unified_gemini_session_mapping:h')
    expect(RedisKeys.session.unifiedOpenaiMapping('h')).toBe('unified_openai_session_mapping:h')
  })
})

describe('RedisKeys.rateLimit / concurrency / userMsgQueue / lock', () => {
  test('rateLimit 四件套', () => {
    expect(RedisKeys.rateLimit.windowStart('k')).toBe('rate_limit:window_start:k')
    expect(RedisKeys.rateLimit.requests('k')).toBe('rate_limit:requests:k')
    expect(RedisKeys.rateLimit.tokens('k')).toBe('rate_limit:tokens:k')
    expect(RedisKeys.rateLimit.cost('k')).toBe('rate_limit:cost:k')
  })
  test('concurrency 全家', () => {
    expect(RedisKeys.concurrency.byKey('k')).toBe('concurrency:k')
    expect(RedisKeys.concurrency.consoleAccount('a')).toBe('console_account:a')
    expect(RedisKeys.concurrency.queue('k')).toBe('concurrency:queue:k')
    expect(RedisKeys.concurrency.queueStats('k')).toBe('concurrency:queue:stats:k')
    expect(RedisKeys.concurrency.queueWaitTimes('k')).toBe('concurrency:queue:wait_times:k')
    expect(RedisKeys.concurrency.queueWaitTimesGlobal).toBe('concurrency:queue:wait_times:global')
  })
  test('userMsgQueue / lock', () => {
    expect(RedisKeys.userMsgQueue.lock('a')).toBe('user_msg_queue_lock:a')
    expect(RedisKeys.userMsgQueue.last('a')).toBe('user_msg_queue_last:a')
    expect(RedisKeys.lock.tokenRefresh('claude', 'a')).toBe('token_refresh_lock:claude:a')
  })
})

describe('RedisKeys 其余分区', () => {
  test('system / accountGroup / costRank', () => {
    expect(RedisKeys.system.metricsMinute(123)).toBe('system:metrics:minute:123')
    expect(RedisKeys.system.migratedVersion).toBe('system:migrated:version')
    expect(RedisKeys.system.migrationsApplied).toBe('system:migrations:applied')
    expect(RedisKeys.accountGroup.groups).toBe('account_groups')
    expect(RedisKeys.accountGroup.group('g')).toBe('account_group:g')
    expect(RedisKeys.accountGroup.members('g')).toBe('account_group_members:g')
    expect(RedisKeys.accountGroup.reverse('claude', 'a')).toBe('account_groups_reverse:claude:a')
    expect(RedisKeys.accountGroup.reverseMigrated).toBe('account_groups_reverse:migrated')
    expect(RedisKeys.costRank.rank('daily')).toBe('cost_rank:daily')
    expect(RedisKeys.costRank.meta('daily')).toBe('cost_rank_meta:daily')
    expect(RedisKeys.costRank.lock('daily')).toBe('cost_rank_lock:daily')
  })
  test('requestDetail / claudeCode / upstream', () => {
    expect(RedisKeys.requestDetail.item('r')).toBe('request_detail:item:r')
    expect(RedisKeys.requestDetail.dayIndex('2026-06-03')).toBe(
      'request_detail:index:day:2026-06-03'
    )
    expect(RedisKeys.requestDetail.querySnapshot('s')).toBe('request_detail:query_snapshot:s')
    expect(RedisKeys.claudeCode.headers('a')).toBe('claude_code_headers:a')
    expect(RedisKeys.claudeCode.userAgentDaily).toBe('claude_code_user_agent:daily')
    expect(RedisKeys.upstream.tempUnavailable('claude', 'a')).toBe('temp_unavailable:claude:a')
    expect(RedisKeys.upstream.errorHistory('claude', 'a')).toBe('error_history:claude:a')
  })
  test('payment / quotaCard / redemption / user / billingEvents', () => {
    expect(RedisKeys.payment.session('t')).toBe('payment:session:t')
    expect(RedisKeys.payment.audit('o')).toBe('payment:audit:o')
    expect(RedisKeys.payment.balanceTx('k')).toBe('payment:balance:tx:k')
    expect(RedisKeys.payment.order('o')).toBe('payment:order:o')
    expect(RedisKeys.payment.providerDaily('p', '2026-06-03')).toBe(
      'payment:provider:daily:p:2026-06-03'
    )
    expect(RedisKeys.quotaCard.byId('c')).toBe('quota_card:c')
    expect(RedisKeys.quotaCard.byCode('CODE')).toBe('quota_card_code:CODE')
    expect(RedisKeys.quotaCard.status('unused')).toBe('quota_cards:status:unused')
    expect(RedisKeys.redemption.byApikey('k')).toBe('redemptions:apikey:k')
    expect(RedisKeys.user.byId('u')).toBe('user:u')
    expect(RedisKeys.user.session('t')).toBe('user_session:t')
    expect(RedisKeys.user.byName('n')).toBe('username:n')
    expect(RedisKeys.billingEvents).toBe('billing:events')
  })
  test('proxy(原 ProxyPoolKeys)', () => {
    expect(RedisKeys.proxy.configs).toBe('proxy:configs')
    expect(RedisKeys.proxy.groupMembers('g')).toBe('proxy:group:members:g')
    expect(RedisKeys.proxy.stats('p', 'ctx')).toBe('proxy:stats:p:ctx')
    expect(RedisKeys.proxy.statsPrefix).toBe('proxy:stats:')
    expect(RedisKeys.proxy.qualityResult('p')).toBe('proxy:quality:p')
    expect(RedisKeys.proxy.exitInfo('p')).toBe('proxy:exit_info:p')
    expect(RedisKeys.proxy.healthCheckLock).toBe('proxy:health_check_lock')
  })
  test('emptyMarker 派生后缀', () => {
    expect(RedisKeys.emptyMarker(RedisKeys.usage.dailyIndex('2026-06-03'))).toBe(
      'usage:daily:index:2026-06-03:empty'
    )
    expect(RedisKeys.emptyMarker(RedisKeys.accounts.claudeIndex)).toBe('claude:account:index:empty')
  })
})

// pattern 必须与对应 builder 前缀逐字一致
describe('pattern 与 builder 前缀一致性', () => {
  test('startsWith 交叉断言', () => {
    expect(RedisKeys.apiKey.byId('x').startsWith('apikey:')).toBe(true)
    expect(RedisKeys.apiKey.allPattern).toBe('apikey:*')
    expect(RedisKeys.usage.total('x').startsWith('usage:')).toBe(true)
    expect(RedisKeys.usage.daily('x', 'd').startsWith('usage:daily:')).toBe(true)
    expect(RedisKeys.usage.dailyPattern).toBe('usage:daily:*')
    expect(RedisKeys.usage.costDaily('x', 'd').startsWith('usage:cost:')).toBe(true)
    expect(RedisKeys.usage.costPattern).toBe('usage:cost:*')
    // 末尾无冒号的子串 pattern,逐字
    expect(RedisKeys.usage.keyAlltimePattern('k')).toBe('usage:k:model:alltime:*')
    expect(RedisKeys.usage.keyModelAnyPattern('k', 'm')).toBe('usage:k:model:*:m:*')
    expect(RedisKeys.accounts.claude('x').startsWith('claude:account:')).toBe(true)
    expect(RedisKeys.accounts.claudePattern).toBe('claude:account:*')
    expect(RedisKeys.concurrency.queue('x').startsWith('concurrency:queue:')).toBe(true)
    expect(RedisKeys.concurrency.queuePattern).toBe('concurrency:queue:*')
    expect(RedisKeys.proxy.stats('p', 'c').startsWith(RedisKeys.proxy.statsPrefix)).toBe(true)
  })
})

describe('TTL 纯常量 + 业务不变量', () => {
  test('用量/费用数值', () => {
    expect(TTL.usageDaily).toBe(86400 * 32)
    expect(TTL.usageHourly).toBe(86400 * 7)
    expect(TTL.usageMonthly).toBe(86400 * 365)
    expect(TTL.costDaily).toBe(86400 * 33)
    expect(TTL.costMonthly).toBe(86400 * 366)
    expect(TTL.costHourly).toBe(86400 * 7)
  })
  test('费用 TTL 必须 >= 对应用量(业务不变量)', () => {
    expect(TTL.costDaily).toBeGreaterThan(TTL.usageDaily)
    expect(TTL.costMonthly).toBeGreaterThan(TTL.usageMonthly)
  })
  test('其余常量', () => {
    expect(TTL.adminSession).toBe(86400)
    expect(TTL.oauthSession).toBe(600)
    expect(TTL.accountBalance).toBe(3600)
    expect(TTL.accountBalanceLocal).toBe(300)
    expect(TTL.accountTestHistory).toBe(86400 * 30)
    expect(TTL.accountTestConfig).toBe(86400 * 365)
    expect(TTL.proxyHealthHistory).toBe(7 * 24 * 3600)
    expect(TTL.proxyQuality).toBe(30 * 24 * 3600)
    expect(TTL.claudeCodeHeaders).toBe(7 * 24 * 3600)
    expect(TTL.claudeCodeUserAgent).toBe(90000)
    expect(TTL.queueStats).toBe(86400 * 7)
    expect(TTL.waitTime).toBe(86400)
    expect(TTL.paymentSession).toBe(1800)
    expect(TTL.paymentAudit).toBe(86400 * 180)
    expect(TTL.emptyMarker).toBe(3600)
    expect(TTL.upstreamRateLimit).toBe(300)
    expect(TTL.requestDetailQuerySnapshot).toBe(30)
  })
})

describe('TTL 参数派生(纯函数)', () => {
  test('requestDetail / rateLimit / concurrency', () => {
    expect(TTL.requestDetailItem(6)).toBe(6 * 3600)
    expect(TTL.requestDetailItem(0.5)).toBe(3600) // Math.max 下限 1 小时
    expect(TTL.requestDetailIndex(3600)).toBe(3600 + 86400)
    expect(TTL.rateLimitWindowMs(5)).toBe(5 * 60 * 1000)
    expect(TTL.concurrencyLeaseMs(10, 5)).toBe(60000) // (10+5)*1000 < 60000 取下限
    expect(TTL.concurrencyLeaseMs(120, 30)).toBe(150000)
  })
})

// 派生 TTL 读 config: 用 isolateModules + doMock 注入不同 config,验证 fallback 分支。
// 关键: getConfig 延迟求值 + _config 缓存,必须在 isolateModules 回调【内】求值,mock 才生效、缓存才隔离。
describe('TTL config 派生 fallback', () => {
  const withTTL = (configObj, fn, env = {}) => {
    const saved = {}
    for (const k of Object.keys(env)) {
      saved[k] = process.env[k]
      process.env[k] = env[k]
    }
    let result
    jest.isolateModules(() => {
      jest.doMock('../config/config', () => configObj)
      const { TTL: isolatedTTL } = require('../src/constants/redisKeys')
      result = fn(isolatedTTL)
    })
    for (const k of Object.keys(env)) {
      if (saved[k] === undefined) delete process.env[k]
      else process.env[k] = saved[k]
    }
    return result
  }

  afterEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
  })

  test('stickySession: 默认 1h vs 配置 2h', () => {
    expect(withTTL({}, (t) => t.stickySession())).toBe(3600)
    expect(withTTL({ session: { stickyTtlHours: 2 } }, (t) => t.stickySession())).toBe(7200)
  })
  test('systemMetrics: 默认窗口 5 vs 配置 10', () => {
    expect(withTTL({}, (t) => t.systemMetrics())).toBe(600)
    expect(withTTL({ system: { metricsWindow: 10 } }, (t) => t.systemMetrics())).toBe(1200)
  })
  test('upstream 各错误类型默认值', () => {
    expect(withTTL({}, (t) => t.upstream503())).toBe(60)
    expect(withTTL({}, (t) => t.upstreamServerError())).toBe(300)
    expect(withTTL({}, (t) => t.upstreamOverload())).toBe(600)
    expect(withTTL({}, (t) => t.upstreamAuthError())).toBe(1800)
    expect(withTTL({}, (t) => t.upstreamTimeout())).toBe(300)
    expect(withTTL({}, (t) => t.errorHistory())).toBe(3 * 24 * 60 * 60)
  })
  test('upstream503: config 优先 > env > 默认', () => {
    expect(
      withTTL({ upstreamError: { serviceUnavailableTtlSeconds: 99 } }, (t) => t.upstream503())
    ).toBe(99)
    expect(withTTL({}, (t) => t.upstream503(), { UPSTREAM_ERROR_503_TTL_SECONDS: '120' })).toBe(120)
  })
  test('errorHistory: 配置天数 + positiveInt 边界(0 视为非法回退 3)', () => {
    expect(withTTL({ upstreamError: { errorHistoryTtlDays: 7 } }, (t) => t.errorHistory())).toBe(
      7 * 24 * 60 * 60
    )
    expect(withTTL({ upstreamError: { errorHistoryTtlDays: 0 } }, (t) => t.errorHistory())).toBe(
      3 * 24 * 60 * 60
    )
  })
})

describe('补漏 builder(各 agent 报告后补充)', () => {
  test('session 补充', () => {
    expect(RedisKeys.session.adminCredentials).toBe('session:admin_credentials')
    expect(RedisKeys.session.unifiedGeminiMappingByProvider('gemini-cli', 'h')).toBe(
      'unified_gemini_session_mapping:gemini-cli:h'
    )
    expect(RedisKeys.session.droidSticky('anthropic', 'k1', 'h')).toBe('droid:anthropic:k1:h')
  })
  test('redeemCard', () => {
    expect(RedisKeys.redeemCard.fail('1.2.3.4')).toBe('redeem_card:fail:1.2.3.4')
    expect(RedisKeys.redeemCard.ip('1.2.3.4', '2026-06-03:14')).toBe(
      'redeem_card:ip:1.2.3.4:2026-06-03:14'
    )
  })
  test('upstream prefix/pattern', () => {
    expect(RedisKeys.upstream.tempUnavailablePrefix).toBe('temp_unavailable')
    expect(RedisKeys.upstream.tempUnavailablePattern).toBe('temp_unavailable:*')
    expect(RedisKeys.upstream.errorHistoryPrefix).toBe('error_history')
  })
  test('apiKey.indexDrift', () => {
    expect(RedisKeys.apiKey.indexDrift).toBe('apikey:index:drift')
  })
  test('收尾补漏 builder', () => {
    expect(RedisKeys.rateLimit.account('a')).toBe('ratelimit:a')
    expect(RedisKeys.claudeCode.headersPattern).toBe('claude_code_headers:*')
    expect(RedisKeys.system.serviceRates).toBe('system:service_rates')
    expect(RedisKeys.system.weeklyOpusDone('2026-06-03')).toBe(
      'init:weekly_opus_cost:2026-06-03:done'
    )
    expect(RedisKeys.lock.weeklyOpusInit('2026-06-03')).toBe(
      'lock:init:weekly_opus_cost:2026-06-03'
    )
    expect(RedisKeys.relayConfig).toBe('claude_relay_config')
    expect(RedisKeys.session.originalBinding('s')).toBe('original_session_binding:s')
    expect(RedisKeys.payment.providerRr('alipay')).toBe('payment:provider:rr:alipay')
    expect(RedisKeys.payment.dailyRecharge('k', '2026-06-03')).toBe(
      'payment:daily_recharge:k:2026-06-03'
    )
    expect(RedisKeys.apiKey.legacyData('k')).toBe('api_key:k')
    expect(RedisKeys.apiKey.legacyAll).toBe('api_keys')
    expect(RedisKeys.apiKey.tagsManual).toBe('apikey:tags:manual')
    expect(RedisKeys.apiKey.tmp('tag', 'uuid')).toBe('apikey:tmp:tag:uuid')
  })
  test('builder("") 派生前缀(PROXY_BINDABLE_STORES / ACCOUNT_TYPE_CONFIG 用)', () => {
    expect(RedisKeys.accounts.claude('')).toBe('claude:account:')
    expect(RedisKeys.accounts.openai('')).toBe('openai:account:')
    expect(RedisKeys.accounts.azureOpenai('')).toBe('azure_openai:account:')
    expect(RedisKeys.accounts.geminiApi('')).toBe('gemini_api_account:')
    expect(RedisKeys.accounts.bedrock('')).toBe('bedrock_account:')
  })
  test('收尾补漏 TTL/pattern', () => {
    expect(TTL.dailyRecharge).toBe(2 * 24 * 3600)
    expect(RedisKeys.usage.hourlyPattern).toBe('usage:hourly:*')
    expect(RedisKeys.usage.crossModelMonthlyPattern).toBe('usage:*:model:monthly:*:*')
    expect(RedisKeys.usage.dailyDateScan('2026-06-03')).toBe('usage:daily:*:2026-06-03')
  })
})

describe('LIMITS', () => {
  test('数值', () => {
    expect(LIMITS.usageRecords).toBe(200)
    expect(LIMITS.accountTestHistory).toBe(5)
    expect(LIMITS.proxyHealthHistory).toBe(50)
    expect(LIMITS.paymentAudit).toBe(100)
    expect(LIMITS.balanceTx).toBe(1000)
    expect(LIMITS.waitTimesPerKey).toBe(500)
    expect(LIMITS.waitTimesGlobal).toBe(2000)
    expect(LIMITS.billingEventsStream).toBe(100000)
  })
})
