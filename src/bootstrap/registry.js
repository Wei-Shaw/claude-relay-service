// 启动自愈动作编目(纯数据登记,不在此收口执行)
//
// 这些动作每次启动幂等跑;调用点保留在 src/app.js 原位、原顺序、原 await/后台语义不变。
// 不收口成统一 run():自愈间有交错依赖——例如周费用回填依赖 pricingService 已就绪、
// apiKey 索引重建依赖 apiKeyIndexService.init 先执行——收口会打破依赖顺序、改变行为。
// 本表仅供追溯:谁在自愈、在哪调用、幂等机制是什么、依赖什么。

const selfHealingActions = [
  {
    id: 'ensure_monthly_months_index',
    call: 'redis.ensureMonthlyMonthsIndex()',
    mode: 'background',
    idempotency: '完整性检查:扫描 usage:model:monthly:* 补缺失月份到 months 集合',
    dependsOn: 'redis 已连接'
  },
  {
    id: 'usage_index_v2',
    call: 'redis.migrateUsageIndex()',
    mode: 'background',
    idempotency: 'marker system:migration:usage_index_v2;索引重建 SADD 幂等',
    dependsOn: 'redis 已连接'
  },
  {
    id: 'cost_data_init',
    call: 'costInitService.initializeAllCosts()',
    mode: 'blocking',
    idempotency: '存在性检查 needsInitialization();仅补缺失费用,不覆盖',
    dependsOn: 'pricingService 已初始化'
  },
  {
    id: 'weekly_claude_cost_backfill',
    call: 'weeklyClaudeCostInitService.backfillCurrentWeekClaudeCosts()',
    mode: 'blocking',
    idempotency: '日级 marker init:weekly_opus_cost:{date}:done + 分布式锁',
    dependsOn: 'pricingService.pricingData 已就绪(未就绪则跳过)'
  },
  {
    id: 'session_windows_init',
    call: 'claudeAccountService.initializeSessionWindows()',
    mode: 'blocking',
    idempotency: '存在性检查:清理过期会话窗口',
    dependsOn: 'redis 已连接'
  },
  {
    id: 'cost_rank_init',
    call: 'costRankService.initialize()',
    mode: 'blocking',
    idempotency: '分布式锁 rank:lock:{timeRange};重建排序索引',
    dependsOn: 'redis 已连接'
  },
  {
    id: 'apikey_index_check_rebuild',
    call: 'apiKeyIndexService.checkAndRebuild()',
    mode: 'background',
    idempotency: '版本门控 apikey:index:version + hash_map 全量自愈',
    dependsOn: 'apiKeyIndexService.init(redis) 先执行'
  },
  {
    id: 'account_group_reverse_index',
    call: 'accountGroupService.ensureReverseIndexes()',
    mode: 'background',
    idempotency: 'marker account_groups_reverse:migrated;反向索引重建幂等',
    dependsOn: 'redis 已连接'
  },
  {
    id: 'logger_audit_selfheal',
    call: 'src/utils/logger.js healAuditFile + cwd 畸形残留清理(模块加载时同步执行)',
    mode: 'blocking',
    idempotency: '审计路径一致且无孤儿则无操作;收编按 name 去重;畸形文件删除天然幂等',
    dependsOn: '仅 config 已加载(早于 redis, 不依赖任何服务)'
  }
]

module.exports = { selfHealingActions }
