# Local Fork Redis And Storage Plan

## Context

This fork is used as a local development and maintenance branch for Claude Relay Service. The current deployment keeps production running separately, while development uses a separate source checkout, a separate service port, and an isolated Redis container.

Current local development defaults:

- Service source: `/home/dev/code/crs/myfork/claude-relay-service`
- Development service port: `3011`
- Development Redis container: `crs-myfork-redis`
- Development Redis port: `127.0.0.1:6381`
- Imported Redis data directory: `/home/dev/code/crs/myfork/redis-dev-data-imported`

Do not share the production Redis instance with development code. Use a copied Redis backup or a separate empty Redis instance.

## Redis Restore Notes

Production Redis data can be restored into the isolated development Redis with an RDB backup. Sensitive account fields are encrypted in Redis, so Redis data alone is not enough.

Required when restoring production Redis data:

- `ENCRYPTION_KEY` must match production, otherwise account API keys and OAuth tokens remain present in Redis but cannot be decrypted.
- `REDIS_DB` must match the backed-up DB, currently `0`.
- `JWT_SECRET` does not decrypt account secrets, but it affects existing admin/user JWT/session validation. Synchronize it if restored login state should keep working.

Recommended development `.env` split:

- Keep development-isolated: `PORT`, `HOST`, `NODE_ENV`, `REDIS_HOST`, `REDIS_PORT`, `LOG_LEVEL`, `DEBUG`, `WEB_TITLE`, `TRUST_PROXY`.
- Match production for restored-data fidelity: `ENCRYPTION_KEY`, `REDIS_DB`, optionally `JWT_SECRET`, `API_KEY_PREFIX`, `TIMEZONE_OFFSET`, upstream API/proxy timeout settings.

## Current Redis Data Shape

The application currently uses Redis as the primary data store, not just as a cache. The repository has no SQL database or ORM layer in the main runtime path. Core data access is through `src/models/redis.js` and service modules that read/write Redis hashes, sets, sorted sets, strings, lists, and streams.

Current sampled development Redis after importing a production backup:

```text
DBSIZE              267153 keys
used_memory         2.32 GiB
keys with TTL       265194
maxmemory           0
policy              noeviction
```

Approximate memory by area:

```text
request_detail      2.37 GB
usage               21.1 MB
account_usage       1.6 MB
apikey              0.3 MB
accounts            0.05 MB
quota_cards         0.02 MB
other               86.9 MB
```

The main Redis memory pressure is request detail data.

## Request Detail Volume

Current request detail totals:

```text
request_detail:item:*        243811 records
request_detail:index:day:*   32 day indexes
item memory                  2.35 GB
day index memory             23.6 MB
average item memory          9628 bytes
max item memory              20560 bytes
```

Item size distribution:

```text
< 2 KB       10020
2 - 4 KB     19473
4 - 8 KB     61807
8 - 16 KB    128569
16 - 32 KB   23942
>= 32 KB     0
```

Recent complete week, 2026-05-19 through 2026-05-25:

```text
2026-05-19  14639
2026-05-20  13957
2026-05-21  14846
2026-05-22  15207
2026-05-23   1832
2026-05-24   1098
2026-05-25  14183
```

Weekly total and estimate:

```text
week_total        75762 records
week_avg_per_day  10823 records
Redis memory      about 730-740 MB/week at current average item size
```

At the current rate, 30 days of request detail data costs roughly several GiB of Redis memory. This is the first storage area to migrate.

## Data Placement Recommendation

### Keep In Redis

Keep data that is high-frequency, short-lived, or needs Redis atomic operations and TTL semantics:

- API key hash lookup: `apikey:hash_map`
- Concurrency leases: `concurrency:*`
- Queue counters and wait-time samples: `concurrency:queue:*`
- Sticky sessions and session mappings: `sticky_session:*`, `session:*`, unified scheduler mappings
- OAuth temporary sessions: `oauth:*`
- Temporary upstream/account cooldowns: `temp_unavailable:*`
- Rate limit counters: `ratelimit:*`
- Realtime minute metrics: `system:metrics:minute:*`
- Hot current-period usage counters used for limit checks and dashboards

These should not move to SQL as a synchronous hot path.

### Move To Database

Move data that is durable, query-heavy, or report/audit oriented:

- Request details: `request_detail:item:*`, `request_detail:index:day:*`
- Long-term usage events and rollups
- Error history and audit history
- Account/API key metadata in a later phase
- Account groups and bindings in a later phase
- Quota cards/users in a later phase
- Webhook/global config in a later phase

For the current volume, PostgreSQL is a good first choice. ClickHouse is not necessary unless request detail volume grows to very high daily volume or analytics becomes much more complex.

### Use Multi-Level Cache

Use application memory with short TTL, backed by Redis, backed by database for read-heavy low-change data:

```text
application memory -> Redis -> PostgreSQL
```

Good candidates:

- API key validation result, short TTL only
- Account list and account metadata
- Account group membership
- Scheduler candidate pools
- Model pricing/config
- Dashboard summary aggregates

Keep API key/account cache TTL short or use explicit invalidation, because disable/permission changes must take effect quickly.

## Suggested Target Architecture

```text
Application memory:
- API key validation short cache
- Account and group short cache
- Pricing/config cache

Redis:
- API key hash to ID mapping
- Active API key/account cache
- Concurrency, queue, rate limit
- Sticky/OAuth/session mappings
- Temp unavailable state
- Current hour/day/month usage counters
- Recent request detail cache, 6-24 hours

PostgreSQL:
- request_details
- usage_events
- usage_rollups
- API keys, accounts, groups, users later
- error history and audit history
```

## Request Detail Migration Plan

Start with request details because they account for most Redis memory.

Recommended path:

1. Add PostgreSQL schema for `request_details`.
2. Keep existing Redis write path initially.
3. Add asynchronous dual-write to PostgreSQL through a worker or queue; avoid blocking upstream responses on database writes.
4. Change admin request detail pages to read PostgreSQL first and fall back to Redis during transition.
5. Reduce Redis request detail retention to 6-24 hours after PostgreSQL reads are stable.
6. Add export/backfill tooling from existing Redis request details to PostgreSQL if historical continuity is needed.

Suggested table shape:

```text
request_details
- id
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
- error_type
- request_body_snapshot jsonb
- metadata jsonb
```

Suggested indexes:

```text
(timestamp)
(api_key_id, timestamp)
(account_id, timestamp)
(model, timestamp)
(status_code, timestamp)
(endpoint, timestamp)
```

Monthly partitioning should be enough for the current volume. Daily partitioning can wait until volume or retention grows significantly.

## Selection Guidance

Based on the measured volume:

- Current request details: about 75k records/week.
- Estimated yearly request details: about 4 million records/year at current rate.
- PostgreSQL can handle this comfortably with sensible indexes and partitioning.
- Redis should not remain the long-term store for request details because it costs about 700+ MB/week at the current serialized record size.
- ClickHouse is premature unless daily volume becomes much larger or analytics workloads become OLAP-heavy.

## Operational Notes

Backup and rollback should treat Redis as a database while the current architecture remains Redis-first.

Minimum backup set for a restorable instance:

```text
Redis RDB/AOF
.env
config/config.js
data/init.json
data/model_pricing.json, optional but useful
logs/, optional
```

Never rotate `ENCRYPTION_KEY` without a planned re-encryption migration.
