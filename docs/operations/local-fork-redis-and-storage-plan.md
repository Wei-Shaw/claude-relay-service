# 本 fork Redis 与 PostgreSQL 存储方案

## 背景

这个 fork 基于 upstream `Wei-Shaw/claude-relay-service` 维护。相对于原始 fork 前的项目，主要存储变化是增加 PostgreSQL 作为请求明细、用量统计、费用统计和审计查询的长期存储，同时继续保留 Redis 作为运行时控制面和官方镜像可回滚面。

README 面向安装和运维快速入口；本文档是 Redis/PG 职责边界、迁移顺序、回滚策略和 key 迁移矩阵的详细说明。

本地开发和生产服务应独立运行。本地开发使用单独的源码目录、服务端口、Redis 容器和 PostgreSQL。

当前本地开发默认值：

- 服务源码：`/home/dev/code/crs/myfork/claude-relay-service`
- 开发服务端口：`3011`
- 开发 Redis 容器：`crs-myfork-redis`
- 开发 Redis 端口：`127.0.0.1:6381`
- 已导入 Redis 数据目录：`/home/dev/code/crs/myfork/redis-dev-data-imported`

不要让开发代码直接连接生产 Redis。开发环境应使用生产备份恢复出来的 Redis，或者使用单独的空 Redis。

## Redis 恢复说明

可以把生产 Redis 的 RDB 备份恢复到隔离的开发 Redis 中。账户敏感字段在 Redis 中是加密保存的，所以只有 Redis 数据还不够。

恢复生产 Redis 数据时必须注意：

- `ENCRYPTION_KEY` 必须与生产一致，否则账户 API key、OAuth token 等字段仍在 Redis 中，但无法解密。
- `REDIS_DB` 必须与备份 DB 一致，当前为 `0`。
- `JWT_SECRET` 不负责解密账户密钥，但会影响已有 admin/user JWT/session 校验；如果希望恢复后的登录态继续有效，需要同步它。

建议的开发 `.env` 拆分：

- 开发环境独立：`PORT`、`HOST`、`NODE_ENV`、`REDIS_HOST`、`REDIS_PORT`、`LOG_LEVEL`、`DEBUG`、`WEB_TITLE`、`TRUST_PROXY`。
- 为了还原生产数据语义，应与生产一致：`ENCRYPTION_KEY`、`REDIS_DB`，可选 `JWT_SECRET`、`API_KEY_PREFIX`、`TIMEZONE_OFFSET`、上游 API/代理超时配置。

## 上游 Redis 数据形态

原始 upstream 形态把 Redis 当作主数据存储使用，不只是缓存。核心数据访问集中在 `src/models/redis.js`，业务服务读写 Redis hash、set、sorted set、string、list 和 stream。本 fork 在这个基础上增加 PostgreSQL 查询/审计存储，并保留 Redis 兼容写入。

导入生产备份后的开发 Redis 样本：

```text
DBSIZE              267153 keys
used_memory         2.32 GiB
keys with TTL       265194
maxmemory           0
policy              noeviction
```

按数据域粗略估算的内存占用：

```text
request_detail      2.37 GB
usage               21.1 MB
account_usage       1.6 MB
apikey              0.3 MB
accounts            0.05 MB
quota_cards         0.02 MB
other               86.9 MB
```

Redis 的主要内存压力来自请求明细。

## 请求明细体量

当前请求明细总量：

```text
request_detail:item:*        243811 records
request_detail:index:day:*   32 day indexes
item memory                  2.35 GB
day index memory             23.6 MB
average item memory          9628 bytes
max item memory              20560 bytes
```

单条记录大小分布：

```text
< 2 KB       10020
2 - 4 KB     19473
4 - 8 KB     61807
8 - 16 KB    128569
16 - 32 KB   23942
>= 32 KB     0
```

最近完整一周，2026-05-19 到 2026-05-25：

```text
2026-05-19  14639
2026-05-20  13957
2026-05-21  14846
2026-05-22  15207
2026-05-23   1832
2026-05-24   1098
2026-05-25  14183
```

周总量和估算：

```text
week_total        75762 records
week_avg_per_day  10823 records
Redis memory      about 730-740 MB/week at current average item size
```

按当前速率，30 天请求明细会占用 Redis 数 GiB 内存。这是最优先拆到 PostgreSQL 的数据域。

## 统一原则：持续双写，按职责读取

本 fork 不再采用“先 Redis 后 PG、最终停止 Redis 兼容写入”的分段切换。统一采用持续双写：

- 官方镜像可回滚面：Redis 继续写入官方镜像需要读取的数据，回滚官方镜像时仍能直接使用同一份 Redis。
- 本分支增强查询面：应该落 PostgreSQL 的数据同时落 PostgreSQL；本分支里应该从 PostgreSQL 查询的页面和接口直接查 PostgreSQL。
- 热路径控制面：限流、并发、队列、粘性会话、OAuth 临时态、锁和短 TTL 状态继续只用 Redis。
- PG 写入失败：对请求明细和统计类分析数据，默认记录错误并暴露监控，不让正常请求因为分析库短暂异常失败。Redis 仍是官方镜像回滚所需的兼容写入面。
- PG 查询失败：本分支里已经定义为 PG 查询的页面应暴露错误，而不是静默回退 Redis；这样可以尽早发现 PG 查询链路问题。紧急回滚时直接启动官方镜像读取 Redis。

推荐运行配置：

```text
REQUEST_DETAIL_WRITE_MODE=dual
REQUEST_DETAIL_READ_MODE=postgres
USAGE_WRITE_MODE=dual
USAGE_READ_MODE=postgres
```

`redis` 和 `postgres` 单写模式可以保留为开发/排障开关，但日常目标不是关闭 Redis 写入。只要仍需要方便回滚官方镜像，就不应把官方镜像依赖的数据改成仅 PG 写入。

## 数据放置建议

### 保留在 Redis

保留高频、短生命周期、需要 Redis 原子操作或 TTL 语义的数据：

- API key hash 查询：`apikey:hash_map`
- 并发租约：`concurrency:*`
- 排队计数和等待时间样本：`concurrency:queue:*`
- 粘性会话和会话映射：`sticky_session:*`、`session:*`、统一调度器映射
- OAuth 临时会话：`oauth:*`
- 上游/账户临时冷却：`temp_unavailable:*`
- 当前窗口限流计数：`rate_limit:*`
- 实时分钟级指标：`system:metrics:minute:*`
- 运行时锁、租约、队列状态和其他短 TTL 控制面状态

这些不应作为同步热路径迁移到 SQL。

### 写入 PostgreSQL

持久、查询重、报表或审计导向的数据应写入 PostgreSQL：

- 请求明细：`request_detail:item:*`、`request_detail:index:day:*`
- 长期用量事件、用量/费用汇总、模型统计和费用排行
- 从 Redis 汇总导入的历史用量/费用基线
- 错误历史和审计历史
- 后续改造的账户/API key 元数据
- 后续改造的账户组和绑定关系
- 后续改造的额度卡、用户、Webhook 和全局配置

当前体量下，PostgreSQL 是合适的第一选择。除非请求明细日增量和分析复杂度显著上升，否则暂不需要引入 ClickHouse。

### 多级缓存

低变更、高读取的数据可以使用：

```text
应用内存 -> Redis -> PostgreSQL
```

候选对象：

- API key 校验结果，短 TTL
- 账户列表和账户元数据
- 账户组成员关系
- 调度候选池
- 模型价格和配置
- 看板汇总

API key 和账户缓存 TTL 必须短，或者具备显式失效机制，因为禁用、权限、黑名单等变更需要快速生效。

## 目标架构

```text
应用内存:
- API key 校验短缓存
- 账户和账户组短缓存
- 价格/配置缓存

Redis:
- API key hash -> ID 映射
- 官方镜像回滚需要读取的 API key、账户、用量和请求明细兼容数据
- 并发、队列、限流
- 粘性/OAuth/session 映射
- 临时不可用状态
- 实时分钟级指标和短 TTL 运行状态

PostgreSQL:
- request_details
- request_detail_payloads
- request_detail_costs
- request_detail_contexts
- request_detail_timings
- usage_events
- usage_rollups
- usage_backfill_runs
- 后续的 API keys、accounts、groups、users
- 错误历史和审计历史
```

## 用量/费用持续双写方案

用量/费用的目标是：PostgreSQL 成为本分支长期统计和查询的事实来源，Redis 继续作为官方镜像回滚兼容面和请求时控制面。

运行模式：

```text
USAGE_WRITE_MODE=dual
USAGE_READ_MODE=postgres
```

推荐执行顺序：

1. 确保 PostgreSQL 中存在 `usage_events`、`usage_rollups`、`usage_backfill_runs`。
2. 把 Redis 历史用量/费用汇总导入 PostgreSQL，作为基线。
   - 如果 PG 中已经有历史 `source_type=event` 聚合行，导入时需要清理这些 event rollup，只保留 `usage_events` 明细，避免 Redis 基线和 event 聚合重复计数。
3. 从 PostgreSQL 请求明细回填最近窗口的事件级数据到 `usage_events`。
4. 新请求持续双写：Redis 保持官方镜像兼容，PostgreSQL 保持本分支查询。
5. 本分支统计、模型统计、费用排行和个人统计直接查询 PostgreSQL。
6. 周期性对账 Redis 与 PostgreSQL 差异；差异只用于告警和修复，不让正常查询回退到 Redis。

Redis 历史汇总不是逐条事件，不能伪造成真实请求事件。应把它作为基线快照。PostgreSQL 查询应组合：

- 从 Redis 基线导入的 `usage_rollups`。
- 从新请求 `usage_events` 累计出来的 `usage_rollups`。
- `usage_events` 本身，用于下钻、按 `request_id` 幂等和请求级审计。

为了避免重复计数，基线导入需要固定截止时间和来源标记。推荐形态：

```text
usage_rollups
- period_type: hour | day | month | all
- period_start
- dimension_type: global | api_key | model | api_key_model
- dimension_id
- api_key_id
- model
- source_type: event | redis_baseline
- request_count
- token totals
- cost
- real_cost

usage_backfill_runs
- source: request_details | redis_baseline
- start_time
- end_time
- cutoff_time
- status
- summary jsonb
```

费用排行在本分支中应从 `usage_rollups` 查询，不依赖 Redis ZSET 重建。Redis 的 `cost_rank:*` 可以继续维护或由官方镜像回滚后重建，但本分支查询不依赖它。

当前写入触发点：

- `apiKeyService.recordUsage` 和 `recordUsageWithDetails` 在拿到上游用量后触发。它们负责用量汇总、模型统计、费用和最近用量记录。
- `auth` 和 `rateLimitHelper` 在请求进入和拿到 token/cost 后更新 `rate_limit:*`。这部分继续只使用 Redis。
- `costRankService` 目前会从 Redis 用量/费用 key 重建排行索引。本分支 PG 读取模式下，排行应直接由 `usage_rollups` 派生。

## Redis Key 迁移矩阵

这张表覆盖主要 Redis key 族。运行时 key 也列出来，是为了明确哪些不迁移。

| Redis key 模式                                                                                                                                                                            | 当前用途                                             | 决策                                | 写入/读取策略                                    | PostgreSQL 目标表                                                                                                         | 说明                                                                                |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ----------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `request_detail:item:*`                                                                                                                                                                   | 请求明细记录和报文快照                               | 双写                                | Redis + PG 同时写；本分支读 PG；官方回滚读 Redis | `request_details`、`request_detail_payloads`、`request_detail_costs`、`request_detail_contexts`、`request_detail_timings` | Redis 最大内存压力来源。Redis 保留时间按官方镜像回滚窗口设置。                      |
| `request_detail:index:day:*`                                                                                                                                                              | 请求明细按天索引                                     | 继续维护兼容                        | Redis 写入继续维护；本分支查询不用它             | PostgreSQL 上的 `timestamp`、`api_key_id`、`model`、`session_id` 索引                                                     | 官方镜像回滚时仍可使用；本分支由数据库索引和分页查询替代。                          |
| `request_detail:query_snapshot:*`                                                                                                                                                         | 临时查询快照/缓存                                    | 保留 Redis                          | 不迁移                                           | 无                                                                                                                        | 短 TTL 缓存，不作为事实来源。                                                       |
| `usage:{keyId}`                                                                                                                                                                           | API key 全量 token/request 汇总                      | 基线 + 双写                         | Redis + PG 同时写；本分支读 PG；官方回滚读 Redis | `usage_rollups`，`period_type=all`，`dimension_type=api_key`                                                              | Redis 导入值标记为 `source_type=redis_baseline`；新请求标记为 `source_type=event`。 |
| `usage:daily:{keyId}:{date}`                                                                                                                                                              | API key 日维度用量汇总                               | 基线 + 双写                         | Redis + PG 同时写；本分支读 PG                   | `usage_rollups`，`period_type=day`，`dimension_type=api_key`                                                              | 个人和管理统计从 PG 查询。                                                          |
| `usage:monthly:{keyId}:{month}`                                                                                                                                                           | API key 月维度用量汇总                               | 基线 + 双写                         | Redis + PG 同时写；本分支读 PG                   | `usage_rollups`，`period_type=month`，`dimension_type=api_key`                                                            | 月度统计从 PG 查询。                                                                |
| `usage:hourly:{keyId}:{hour}`                                                                                                                                                             | API key 小时维度用量汇总                             | 基线 + 双写                         | Redis + PG 同时写；本分支读 PG                   | `usage_rollups`，`period_type=hour`，`dimension_type=api_key`                                                             | 看板可用；限流不依赖它。                                                            |
| `usage:global:total`、`usage:global:daily:*`、`usage:global:monthly:*`                                                                                                                    | 全局用量汇总                                         | 基线 + 双写                         | Redis + PG 同时写；本分支读 PG                   | `usage_rollups`，`dimension_type=global`                                                                                  | 管理端全局统计从 PG 查询。                                                          |
| `usage:model:daily:*`、`usage:model:monthly:*`、`usage:model:hourly:*`                                                                                                                    | 全局模型用量汇总                                     | 基线 + 双写                         | Redis + PG 同时写；本分支读 PG                   | `usage_rollups`，`dimension_type=model`                                                                                   | 替代 Redis 模型统计扫描。                                                           |
| `usage:{keyId}:model:daily:*`、`usage:{keyId}:model:monthly:*`、`usage:{keyId}:model:hourly:*`、`usage:{keyId}:model:alltime:*`                                                           | API key + model 用量汇总                             | 基线 + 双写                         | Redis + PG 同时写；本分支读 PG                   | `usage_rollups`，`dimension_type=api_key_model`                                                                           | 支撑按 key 的模型统计和模型过滤。                                                   |
| `usage:daily:index:*`、`usage:hourly:index:*`、`usage:model:*:index:*`、`usage:keymodel:*:index:*`、`usage:model:monthly:months`、`*:empty`                                               | Redis 查询索引和空标记                               | 继续维护兼容                        | Redis 写入继续维护；本分支查询不用它             | 无                                                                                                                        | 官方镜像回滚仍可能依赖；本分支由 PG 索引替代。                                      |
| `usage:records:{keyId}`                                                                                                                                                                   | 最近用量事件列表                                     | 双写/兼容保留                       | Redis + PG 同时写；本分支读 `usage_events`       | `usage_events`                                                                                                            | `request_id` 用于幂等和下钻。                                                       |
| `usage:cost:hourly:{keyId}:*`、`usage:cost:daily:{keyId}:*`、`usage:cost:monthly:{keyId}:*`、`usage:cost:total:{keyId}`                                                                   | 计费口径费用汇总                                     | 基线 + 双写                         | Redis + PG 同时写；本分支读 PG                   | `usage_rollups.cost`                                                                                                      | 费用看板和排行的主要来源。                                                          |
| `usage:cost:real:daily:{keyId}:*`、`usage:cost:real:total:{keyId}`                                                                                                                        | 真实上游费用汇总                                     | 基线 + 双写                         | Redis + PG 同时写；本分支读 PG                   | `usage_rollups.real_cost`                                                                                                 | 与计费口径费用同时保留，方便分析。                                                  |
| `usage:opus:weekly:*`、`usage:opus:total:*`、`usage:opus:real:weekly:*`、`usage:opus:real:total:*`                                                                                        | Claude/Opus 策略用量和费用窗口                       | 后续策略数据迁移                    | 当前继续 Redis；必要时补 PG 双写                 | `usage_policy_rollups` 或扩展 `usage_rollups` 策略维度                                                                    | 在策略/限额查询完成 PG 化前不要移除。                                               |
| `cost_rank:*`、`cost_rank_meta:*`、`cost_rank_lock:*`                                                                                                                                     | Redis 费用排行物化结果和重建锁                       | 本分支 PG 派生，Redis 兼容保留      | 本分支读 PG；Redis 可继续维护或回滚后重建        | 从 `usage_rollups` 派生                                                                                                   | 本分支不应依赖 Redis ZSET 排行。                                                    |
| `rate_limit:window_start:*`、`rate_limit:requests:*`、`rate_limit:tokens:*`、`rate_limit:cost:*`                                                                                          | 当前限流窗口执行                                     | 保留 Redis                          | 只写 Redis                                       | 无                                                                                                                        | Redis 原子计数和 TTL 最合适。即使 usage 双写 PG，这部分仍只在 Redis。               |
| `concurrency:*`、`concurrency:queue:*`                                                                                                                                                    | 并发租约、队列和等待时间样本                         | 保留 Redis                          | 不迁移                                           | 无                                                                                                                        | 请求时控制面。                                                                      |
| `sticky_session:*`、`session:*`、scheduler mapping keys                                                                                                                                   | 粘性路由和 session/account 映射                      | 保留 Redis                          | 不迁移                                           | 无                                                                                                                        | 运行时路由状态，不是持久分析数据。                                                  |
| `oauth:*`、`temp_unavailable:*`                                                                                                                                                           | OAuth 临时态和上游冷却                               | 保留 Redis                          | 不迁移                                           | 无                                                                                                                        | 短生命周期 TTL 状态。                                                               |
| `system:metrics:minute:*`                                                                                                                                                                 | 分钟级实时指标                                       | 保留 Redis                          | 不迁移                                           | 可选未来 metrics 表                                                                                                       | 运维实时指标，不作为长期计费事实。                                                  |
| `account_usage:*`、`account_usage:daily:*`、`account_usage:monthly:*`、`account_usage:hourly:*`、`account_usage:model:*`                                                                  | 账户维度 usage 汇总                                  | 后续迁移                            | 当前继续 Redis；后续再双写 PG                    | `account_usage_rollups` 或扩展 `usage_rollups` account 维度                                                               | 当前 usage/cost 迁移优先 API key/global/model/rank。                                |
| `account_usage:*:index:*`                                                                                                                                                                 | 账户 usage Redis 索引                                | 后续替代                            | 当前继续 Redis                                   | 无                                                                                                                        | 账户 usage 迁移后由 DB 索引替代。                                                   |
| `claude:account:*`、`claude_console_account:*`、`openai:account:*`、`openai_responses_account:*`、`azure_openai:account:*`、`gemini_account:*`、`gemini_api_account:*`、`droid:account:*` | 账户元数据和加密凭据                                 | 后续迁移                            | 当前继续 Redis                                   | `accounts`、`account_credentials`、账户类型扩展表                                                                         | 敏感字段必须继续加密；等请求明细和用量统计稳定后再迁移。                            |
| `account_groups`、`account_group:*`、`account_group_members:*`、`account_groups_reverse:*`                                                                                                | 账户组、成员关系和反向索引                           | 后续迁移                            | 当前继续 Redis                                   | `account_groups`、`account_group_members`                                                                                 | 反向索引用关系型索引替代。                                                          |
| `user:*`、`username:*`、`user:index`                                                                                                                                                      | 用户元数据和 username 查询                           | 后续迁移                            | 当前继续 Redis                                   | `users`                                                                                                                   | 用户 session 与持久用户记录分开处理。                                               |
| `user_session:*`、`admin:*`、`admin_username:*`                                                                                                                                           | 用户/admin 登录 session 和历史 admin 查询            | session 保留 Redis；历史 key 可退役 | session 不迁移                                   | 持久身份数据后续进入 `users`                                                                                              | session 是 TTL 状态。当前 admin 凭据以 `data/init.json` 为准。                      |
| `quota_card:*`、`quota_card_code:*`、`quota_cards:*`、`system:quota_card_limits`                                                                                                          | 额度卡库存、code 查询、状态索引和限额配置            | 后续迁移                            | 当前继续 Redis                                   | `quota_cards`、`quota_card_redemptions`、`system_configs`                                                                 | 很适合关系型存储，但不属于本轮 usage/cost。                                         |
| `webhook_config`                                                                                                                                                                          | Webhook 通知配置                                     | 后续迁移                            | 当前继续 Redis                                   | `webhook_configs` 或 `system_configs`                                                                                     | 低频配置数据。                                                                      |
| `claude_code_headers:*`                                                                                                                                                                   | 每账户 Claude Code header 配置/缓存                  | 后续迁移                            | 当前继续 Redis                                   | `account_client_headers` 或账户配置 JSONB                                                                                 | 归入账户元数据，不归入 usage。                                                      |
| `original_session_binding:*`、`token_refresh_lock:*`、`init:weekly_opus_cost:*`、`lock:*`                                                                                                 | 运行时绑定、刷新锁、初始化保护标记和短生命周期进程锁 | 保留 Redis                          | 不迁移                                           | 无                                                                                                                        | 依赖 TTL 和原子锁语义。                                                             |
| `apikey:*`、`apikey:hash_map`                                                                                                                                                             | API key 元数据和 hash 查询                           | 当前保留 Redis                      | 不属于本轮迁移                                   | 后续 `api_keys`                                                                                                           | hash 查询延迟敏感；元数据迁移单独设计。                                             |
| `system:migration:usage_index_v2`、`system:migration:alltime_model_stats_v1`                                                                                                              | Redis 内部迁移标记                                   | 后续退役                            | 不双写                                           | `usage_backfill_runs` 记录未来 PG 迁移历史                                                                                | 现有 marker 只描述 Redis 侧迁移。                                                   |

## 请求明细持续双写方案

请求明细占 Redis 内存最大，因此仍是最优先 PG 化查询的数据。但为了方便回滚官方镜像，不能把 Redis 请求明细写入完全关闭。

推荐策略：

1. PostgreSQL 使用拆分后的请求明细表。
2. 新请求持续双写 Redis 和 PostgreSQL。
3. 本分支管理端和个人页请求明细查询直接读 PostgreSQL。
4. 从 Redis 备份或现有 Redis 请求明细回填 PostgreSQL，补齐历史窗口。
5. Redis 请求明细保留时间根据“官方镜像可回滚窗口”设置，而不是根据 PG 查询是否稳定就直接停止 Redis 兼容写入。
6. PG 写入失败应记录错误和指标；请求本身不应因为分析存储失败而失败。

当前目标表结构：

```text
request_details
- request_id
- timestamp
- api_key_id
- api_key_name
- account_id
- account_type
- model
- endpoint
- method
- status_code
- stream
- input_tokens
- output_tokens
- cache_create_tokens
- cache_read_tokens
- total_tokens
- cost
- real_cost
- duration_ms
- ttft_ms
- generation_ms
- tokens_per_second
- error_type
- metadata jsonb

request_detail_payloads
- request_id
- request_body jsonb
- response_body jsonb
- request_body_preview text
- response_body_preview text

request_detail_costs
- request_id
- token and cost breakdowns

request_detail_contexts
- request_id
- session_id
- session_hash
- conversation_id
- prompt_cache_key
- metadata_user_id
- client_ip
- user_agent

request_detail_timings
- request_id
- first_token_ms
- duration_ms
- generation_ms
- tokens_per_second
```

建议索引：

```text
(timestamp)
(api_key_id, timestamp)
(account_id, timestamp)
(model, timestamp)
(status_code, timestamp)
(endpoint, timestamp)
(session_id, timestamp)
```

当前体量下，月分区足够。只有当日增量或保留周期显著增加时，再考虑日分区。

## 选择依据

基于已测量体量：

- 当前请求明细约 75k 条/周。
- 按当前速率估算，每年约 400 万条请求明细。
- PostgreSQL 搭配合理索引和分区可以轻松承载。
- Redis 不适合作为请求明细的长期查询存储，因为当前序列化记录大小下，每周大约消耗 700+ MB。
- 除非日增量大幅上涨或分析负载明显 OLAP 化，否则 ClickHouse 仍然偏早。

## 回滚策略

持续双写的主要目的之一是可以直接回滚官方镜像：

1. 停止本 fork 服务。
2. 启动官方镜像，并指向同一份 Redis 和必要的 `.env`/`config/config.js`。
3. 官方镜像不依赖 PostgreSQL，继续从 Redis 读取 API key、账户、用量、费用、请求明细等它支持的数据。
4. 回到本 fork 时，再恢复 PostgreSQL 查询链路，并通过 Redis/PG 对账确认双写差异。

需要注意：如果某类新字段只存在 PostgreSQL，而官方镜像没有对应 Redis 字段，回滚后官方镜像不会显示这些增强字段。这是可接受的；回滚目标是恢复官方能力，不是保留本 fork 的增强查询能力。

## 运维说明

只要架构中仍保留 Redis 作为官方镜像回滚兼容面，备份和回滚就必须继续把 Redis 当作数据库，而不是临时缓存。

最小可恢复备份集：

```text
Redis RDB/AOF
.env
config/config.js
data/init.json
data/model_pricing.json，可选但建议保留
logs/，可选
PostgreSQL dump，用于恢复本 fork 增强查询能力
```

不要在没有重加密迁移方案的情况下轮换 `ENCRYPTION_KEY`。
