# Project Map

Generated from the current worktree on 2026-05-31. This is a system map only; it does not enumerate bugs.

## Project Purpose

This project is a self-hosted AI API relay service. It exposes Claude/Anthropic-compatible, OpenAI-compatible, Gemini-compatible, Azure OpenAI, Droid/Factory.ai, AWS Bedrock, and related relay endpoints behind local API keys.

Primary goals:

- Manage multiple upstream accounts and rotate/schedule requests across them.
- Provide API key authentication, service permissions, model/client restrictions, concurrency limits, request-window limits, daily/total/weekly cost limits, and quota-card/user flows.
- Track usage, token counts, cost, account health, request details, and dashboard statistics in Redis.
- Serve an admin/user web interface for account, API key, stats, quota, webhook, and settings management.

## Main Entry Points

- `src/app.js`
  - Main Express application class.
  - Connects Redis, runs startup migrations/initializers, initializes pricing/model/cache/admin/session services, mounts routes, serves the admin SPA, starts cleanup/scheduler jobs, and handles graceful shutdown.

- `package.json`
  - `main`: `src/app.js`
  - Runtime: `npm start`, `npm run dev`, `npm run service:*`
  - Tests/lint/build scripts are listed later.

- `web/admin-spa/src/main.js`
  - Vue 3 admin/user SPA entry.
  - Installs Pinia, Vue Router, vue-i18n, Element Plus, theme/user auth setup.

- `web/admin-spa/src/router/index.js`
  - Frontend route table and route guards for admin, user, and public API stats pages.

- `cli/index.js`
  - CLI management entry point.

- `Dockerfile`, `docker-compose.yml`, `docker-entrypoint.sh`
  - Container build/runtime entry points.
  - Docker build includes a frontend build stage and backend runtime stage.

- `scripts/setup.js`
  - Initializes `logs/`, `data/`, `temp/`, creates `.env` if absent, and writes admin credentials to `data/init.json`.

## Folder And Module Structure

- `src/app.js`
  - Application bootstrap, middleware stack, route mounting, health/metrics, background tasks, shutdown.

- `src/routes/`
  - Public relay/API routes:
    - `api.js`: Anthropic `/v1/messages` compatible Claude relay and count-token routes.
    - `unified.js`: model-name based OpenAI-compatible routing to Claude/OpenAI/Gemini.
    - `openaiRoutes.js`: OpenAI Responses/Codex-style endpoints.
    - `openaiClaudeRoutes.js`: OpenAI chat/completions to Claude backend.
    - `openaiGeminiRoutes.js`: OpenAI chat/completions to Gemini backend.
    - `geminiRoutes.js`, `standardGeminiRoutes.js`: Gemini CLI/internal/standard API compatibility.
    - `azureOpenaiRoutes.js`: Azure OpenAI compatible routes.
    - `droidRoutes.js`: Droid/Factory.ai compatible routes.
    - `apiStats.js`: public API key stats/test/redeem helpers.
    - `userRoutes.js`: user login, user API key, quota, and admin user management APIs.
    - `web.js`: admin web auth APIs and redirects.
    - `webhook.js`: admin webhook configuration/testing APIs.

- `src/routes/admin/`
  - Admin route modules mounted by `src/routes/admin/index.js`.
  - Main areas: API keys, accounts by provider, account groups, dashboard, usage stats, request details, quota cards, balance scripts, account balance, system/OEM/model pricing, concurrency, relay config, sync/export, service rates, error history.

- `src/middleware/`
  - `auth.js`: API key auth, admin auth, user auth, combined user/admin auth, role checks, CORS, request logging, security headers, error handling, request-size guard, concurrency/rate/cost limit enforcement.
  - `browserFallback.js`: Chrome/plugin/browser compatibility fallback before auth.

- `src/services/`
  - Account services: create/read/update/delete, encrypt/decrypt sensitive credentials, refresh tokens, mark account status/rate limits.
  - Relay services: make upstream requests and stream/transform responses.
  - Scheduler services: select accounts for each backend and manage sticky sessions.
  - Stats/cost/pricing/request detail services: usage accounting and reporting.
  - User, API key, LDAP, webhook, quota card, account balance, balance script, queue, and cleanup services.

- `src/services/account/`
  - Provider-specific account storage/logic:
    - Claude OAuth, Claude Console, CCR, Bedrock, Gemini OAuth, Gemini API key, OpenAI OAuth, OpenAI Responses API key, Azure OpenAI, Droid.

- `src/services/relay/`
  - Provider-specific relay adapters:
    - Claude, Claude Console, Bedrock, CCR, Gemini, OpenAI Responses, Azure OpenAI, Droid, Antigravity.

- `src/services/scheduler/`
  - `unifiedClaudeScheduler.js`: Claude official/console/Bedrock/CCR account selection.
  - `unifiedOpenAIScheduler.js`: OpenAI OAuth/OpenAI Responses account selection.
  - `unifiedGeminiScheduler.js`: Gemini OAuth/Gemini API account selection.
  - `droidScheduler.js`: Droid account selection by endpoint type.

- `src/handlers/`
  - Shared request handlers, especially Gemini compatibility handlers.

- `src/models/redis.js`
  - Central Redis wrapper and schema helper for API keys, sessions, accounts, usage, costs, metrics, concurrency, OAuth sessions, balance cache, and migrations.

- `src/utils/`
  - Cross-cutting helpers: logging, encryption helpers, cost calculation, request detail metadata, proxy agents, model parsing, SSE parsing, dumps, token masking, validators/helpers.

- `src/validators/`
  - Client validators for Claude Code, Codex CLI, Gemini CLI, Droid CLI, and shared client validation.

- `config/`
  - `config.js`: runtime config currently present in this checkout.
  - `config.example.js`: env-driven config template.
  - `models.js`, `pricingSource.js`: model/pricing configuration.

- `resources/model-pricing/`
  - Bundled model price/context window data and README.

- `web/admin-spa/`
  - Vue 3 + Vite SPA.
  - `src/views/`: main screens.
  - `src/components/`: accounts, API keys, dashboard, stats, common layout/components, settings, tutorials, user/admin modals.
  - `src/stores/`: Pinia stores for auth, user, accounts, API keys, stats, settings, dashboard, theme.
  - `src/utils/http_apis.js`: frontend API wrapper catalog.
  - `src/i18n/`: English and Chinese locales.

- `scripts/`
  - Setup, service management, migrations, testing helpers, data export/import, pricing updates, debugging/monitoring scripts.

- `tests/`
  - Jest tests for API key parsing, cost calculation, concurrency queue, request details, account balance, pricing, metadata, request body rules, models config, user queue, Claude Console relay, and selected admin routes.

- `data/`, `logs/`, `temp/`
  - Runtime-generated local directories.

- `audit/`
  - Audit artifacts. This file lives here.

## Important User Flows

### Bootstrap And Startup

1. Operator copies/creates `.env` and `config/config.js`, or runs `npm run setup`.
2. `scripts/setup.js` generates secrets if needed and writes admin credentials to `data/init.json`.
3. `src/app.js` connects to Redis and runs startup tasks:
   - version/data migrations,
   - monthly/usage/model stats index migration,
   - pricing/model service initialization,
   - admin credential sync from `data/init.json` to Redis,
   - invalid admin session cleanup,
   - cost backfill/initialization,
   - Claude session window initialization,
   - API key index rebuild/check,
   - account group reverse-index migration.
4. Express mounts middleware, API routes, `/admin-next` SPA assets, `/health`, and `/metrics`.
5. Background cleanup, rate-limit cleanup, concurrency cleanup, user queue cleanup, optional account test scheduler, and graceful shutdown handlers start.

### Admin Login And Admin SPA

1. Browser loads `/admin-next/...` from `web/admin-spa/dist` when built.
2. Frontend route `/login` calls `POST /web/auth/login`.
3. Backend validates username/password against Redis `session:admin_credentials`, reloading from `data/init.json` if needed.
4. Backend creates a random admin session token stored as `session:<token>` in Redis.
5. Frontend stores token in `localStorage.authToken` and sends `Authorization: Bearer <token>`.
6. Protected frontend routes call `/admin/...`; backend enforces `authenticateAdmin`.

### Account Management

1. Admin uses `/admin/...accounts...` APIs through `AccountsView` and related modals.
2. Provider-specific account routes call provider-specific account services.
3. Account services store account metadata and encrypted secrets in Redis.
4. OAuth flows use temporary `oauth:<sessionId>` Redis entries.
5. Account status, schedulability, priority, proxy settings, supported models, rate-limit state, and test config affect schedulers.

### API Key Creation And Use

1. Admin or a user creates an API key.
2. `apiKeyService` generates a `cr_...` key, stores only a hash under `apikey:<id>`, and maps hash to key id in `apikey:hash_map`.
3. API key data can bind dedicated accounts or groups, define permissions, model/client restrictions, concurrency limits, window limits, cost limits, expiration behavior, tags, service-rate overrides, and payload rules.
4. Relay requests present the key using `x-api-key`, `x-goog-api-key`, `Authorization: Bearer`, `api-key`, or query `key`.
5. `authenticateApiKey` validates the key, restrictions, permissions, rate/cost/concurrency limits, and attaches `req.apiKey`.

### Relay Request Flow

1. Client sends a provider-compatible request:
   - Anthropic: `/api/v1/messages`, `/claude/v1/messages`, forced Gemini variants under `/antigravity/api` and `/gemini-cli/api`.
   - OpenAI-compatible: `/api/v1/chat/completions`, `/openai/v1/chat/completions`, `/openai/responses`, etc.
   - Gemini: `/gemini/v1beta/...`, `/gemini/v1internal...`, `/gemini/messages`.
   - Azure/Droid routes under `/azure` and `/droid`.
2. `authenticateApiKey` validates the API key, client restrictions, Claude Code-only settings, concurrency queue/lease, request-window rate limits, and cost limits.
3. Route handler checks service permissions and model restrictions.
4. Scheduler selects a dedicated/group/shared account and honors sticky session mappings, priority, schedulability, rate-limit/temp-unavailable status, subscription/model support, and account type.
5. Relay service forwards request to the upstream provider, handling proxies, token refresh, streaming SSE, response transforms, and provider-specific errors.
6. Usage/cost tracking records tokens, costs, account usage, request detail metadata, and rate-limit counters.
7. Response streams or JSON is returned to the client.

### Public API Stats Flow

1. `/admin-next/api-stats` is public in the SPA route guard.
2. Frontend calls `/apiStats/...` endpoints to resolve API key ids, fetch usage/model stats, test keys, get service rates, redeem quota cards, and show redemption history.
3. These endpoints often validate API keys through stats-specific service functions rather than admin sessions.

### User Management Flow

1. Optional user management is controlled by `USER_MANAGEMENT_ENABLED`.
2. Users login through `/users/login`; LDAP is used when configured.
3. User sessions are stored with `user_session:` keys.
4. User pages use `x-user-token` and `/users/profile`, `/users/api-keys`, `/users/usage-stats`, `/users/redeem-card`, `/users/quota-info`.
5. Admin user management uses `/users` routes with `authenticateUserOrAdmin` plus `requireAdmin`.

### Quota Card Flow

1. Admin creates quota cards under `/admin/quota-cards`.
2. Cards are stored in Redis and indexed by code/status.
3. User or public stats flows redeem card codes against API keys.
4. Redemption can extend expiry and/or adjust limits, with Redis redemption records for audit/history.

### Account Balance Flow

1. Admin calls `/admin/accounts/:accountId/balance` or refresh/script routes.
2. `accountBalanceService` dispatches to registered balance providers.
3. Results are cached in Redis under provider/account balance keys.
4. Optional custom balance scripts are controlled by `BALANCE_SCRIPT_ENABLED`.

## API Routes And Backend Flows

### Express Mounts

- `/admin-next`
  - Serves built Vue SPA assets from `web/admin-spa/dist`.
  - Unknown non-asset SPA paths return `index.html`.

- `/api`
  - `apiRoutes`: Anthropic-compatible Claude endpoints.
  - `unifiedRoutes`: OpenAI-compatible chat/completions routing by model.

- `/claude`
  - Alias for `apiRoutes`.

- `/antigravity/api`
  - Anthropic-compatible path forced to Gemini/Antigravity backend.

- `/gemini-cli/api`
  - Anthropic-compatible path forced to Gemini CLI OAuth backend.

- `/admin`
  - Admin API route tree.

- `/users`
  - User login/profile/API key/quota/user-admin routes.

- `/web`
  - Admin web auth and redirect routes.

- `/apiStats`
  - Public stats, key tests, quota redemption, model list, service rates.

- `/gemini`
  - Standard Gemini-compatible and legacy Gemini-compatible routes.

- `/openai/gemini`
  - OpenAI chat/completions facade routed to Gemini.

- `/openai/claude`
  - OpenAI chat/completions facade routed to Claude.

- `/openai`
  - Unified chat/completions plus OpenAI Responses/Codex routes.

- `/droid`
  - Droid/Factory.ai routes.

- `/azure`
  - Azure OpenAI-compatible routes.

- `/admin/webhook`
  - Webhook config/test routes.

- `/health`
  - Application health including Redis/logger health and memory.

- `/metrics`
  - Redis-backed system metrics and process memory/uptime.

### Main Public Relay Routes

- Anthropic/Claude:
  - `POST /api/v1/messages`
  - `POST /api/claude/v1/messages`
  - `GET /api/v1/models`
  - `GET /api/v1/key-info`
  - `GET /api/v1/usage`
  - `GET /api/v1/me`
  - `GET /api/v1/organizations/:org_id/usage`
  - `POST /api/v1/messages/count_tokens`
  - Same route module is mounted at `/claude`.

- Forced Gemini Anthropic-compatible:
  - `POST /antigravity/api/v1/messages`
  - `POST /gemini-cli/api/v1/messages`
  - handled through `apiRoutes` with `req._anthropicVendor`.

- Unified OpenAI-compatible:
  - `POST /api/v1/chat/completions`
  - `POST /api/v1/completions`
  - Also mounted at `/openai/v1/chat/completions` and `/openai/v1/completions`.

- OpenAI Responses/Codex:
  - `POST /openai/responses`
  - `POST /openai/v1/responses`
  - `POST /openai/responses/compact`
  - `POST /openai/v1/responses/compact`
  - `GET /openai/usage`
  - `GET /openai/key-info`

- OpenAI-to-Claude facade:
  - `GET /openai/claude/v1/models`
  - `GET /openai/claude/v1/models/:model`
  - `POST /openai/claude/v1/chat/completions`
  - `POST /openai/claude/v1/completions`

- OpenAI-to-Gemini facade:
  - `POST /openai/gemini/v1/chat/completions`
  - `GET /openai/gemini/v1/models`
  - `GET /openai/gemini/models`
  - `GET /openai/gemini/v1/models/:model`

- Gemini:
  - `POST /gemini/messages`
  - `GET /gemini/models`
  - `GET /gemini/usage`
  - `GET /gemini/key-info`
  - `POST /gemini/v1internal:listExperiments`
  - `POST /gemini/v1internal:retrieveUserQuota`
  - `POST /gemini/v1beta/models/:modelName:listExperiments`
  - Standard routes include `generateContent`, `streamGenerateContent`, `countTokens`, `loadCodeAssist`, `onboardUser` under `/gemini/v1beta/models/:modelName:*`, `/gemini/v1/models/:modelName:*`, and `/gemini/v1internal:*`.

- Azure OpenAI:
  - `GET /azure/health`
  - `GET /azure/models`
  - `POST /azure/chat/completions`
  - `POST /azure/responses`
  - `POST /azure/embeddings`
  - `GET /azure/usage`

- Droid:
  - `POST /droid/claude/v1/messages`
  - `POST /droid/comm/v1/chat/completions`
  - `POST /droid/openai/v1/responses`
  - `POST /droid/openai/responses`
  - `GET /droid/*/v1/models`

### Admin Routes

Admin routes are mounted at `/admin` and generally require `authenticateAdmin`, except public OEM settings read:

- API keys:
  - `/admin/api-keys`, batch create/update/delete/stats/last-usage, tags, deleted/restore/permanent delete, expiration patch, cost/index status, index rebuild, supported clients, binding counts.

- Accounts:
  - Claude: `/admin/claude-accounts...`
  - Claude Console: `/admin/claude-console-accounts...`
  - CCR: `/admin/ccr-accounts...`
  - Bedrock: `/admin/bedrock-accounts...`
  - Gemini OAuth: `/admin/gemini-accounts...`
  - Gemini API: `/admin/gemini-api-accounts...`
  - OpenAI OAuth: `/admin/openai-accounts...`
  - OpenAI Responses: `/admin/openai-responses-accounts...`
  - Azure OpenAI: `/admin/azure-openai-accounts...`
  - Droid: `/admin/droid-accounts...`
  - Most account modules provide list/create/update/delete, toggle, toggle schedulable, reset status/rate limit, refresh token, and test endpoints.

- Account groups:
  - `/admin/account-groups`, `/admin/account-groups/:groupId`, `/admin/account-groups/:groupId/members`.

- Usage and dashboard:
  - `/admin/dashboard`
  - `/admin/temp-unavailable`
  - `/admin/usage-stats`
  - `/admin/model-stats`
  - `/admin/usage-trend`
  - `/admin/account-usage-trend`
  - `/admin/api-keys-usage-trend`
  - `/admin/usage-costs`
  - `/admin/api-keys/:keyId/model-stats`
  - `/admin/api-keys/:keyId/usage-records`
  - `/admin/accounts/:accountId/usage-stats`
  - `/admin/accounts/:accountId/usage-history`
  - `/admin/accounts/:accountId/usage-records`

- Request details:
  - `/admin/request-details`
  - `/admin/request-details/:requestId`
  - body preview stats/purge endpoints.

- System/settings:
  - `/admin/oem-settings`
  - `/admin/check-updates`
  - `/admin/claude-code-headers`
  - `/admin/claude-code-version`
  - `/admin/models/pricing`
  - `/admin/models/pricing/status`
  - `/admin/models/pricing/refresh`
  - `/admin/claude-relay-config`
  - `/admin/claude-relay-config/session-bindings`

- Quota cards:
  - `/admin/quota-cards`, `/admin/quota-cards/:id`, `/admin/quota-cards/stats`, `/admin/quota-cards/limits`
  - `/admin/redemptions`, `/admin/redemptions/:id/revoke`
  - `/admin/api-keys/:id/extend-expiry`

- Operational:
  - `/admin/concurrency`, `/admin/concurrency/:apiKeyId`
  - `/admin/concurrency-queue`, `/admin/concurrency-queue/:apiKeyId`, `/admin/concurrency-queue/stats`
  - `/admin/concurrency/cleanup`
  - `/admin/service-rates`
  - `/admin/service-rates/services`
  - `/admin/balance-scripts`
  - `/admin/accounts/:accountId/balance...`
  - `/admin/accounts/:accountType/:accountId/error-history`
  - `/admin/sync/export-accounts`

### Web Auth Routes

- `GET /web/`
  - Redirects to `/admin-next/api-stats`.
- `POST /web/auth/login`
- `POST /web/auth/logout`
- `POST /web/auth/change-password`
- `GET /web/auth/user`
- `POST /web/auth/refresh`

### User Routes

- User session/API key/quota:
  - `POST /users/login`
  - `POST /users/logout`
  - `GET /users/profile`
  - `GET /users/api-keys`
  - `POST /users/api-keys`
  - `DELETE /users/api-keys/:keyId`
  - `GET /users/usage-stats`
  - `POST /users/redeem-card`
  - `GET /users/redemption-history`
  - `GET /users/quota-info`

- Admin user management:
  - `GET /users`
  - `GET /users/:userId`
  - `PATCH /users/:userId/status`
  - `PATCH /users/:userId/role`
  - `POST /users/:userId/disable-keys`
  - `GET /users/:userId/usage-stats`
  - `GET /users/stats/overview`
  - `GET /users/admin/ldap-test`

### API Stats Routes

- `GET /apiStats/models`
- `GET /apiStats/`
- `POST /apiStats/api/get-key-id`
- `POST /apiStats/api/user-stats`
- `POST /apiStats/api/batch-stats`
- `POST /apiStats/api/batch-model-stats`
- `POST /apiStats/api-key/test`
- `POST /apiStats/api-key/test-gemini`
- `POST /apiStats/api-key/test-openai`
- `POST /apiStats/api/user-model-stats`
- `GET /apiStats/service-rates`
- `POST /apiStats/api/redeem-card`
- `GET /apiStats/api/redemption-history`

## Database And Storage Flow

The primary database is Redis via `ioredis`. There is no relational database in the current codebase.

Important Redis data areas:

- API keys:
  - `apikey:<id>` stores API key metadata and hashed secret.
  - `apikey:hash_map` maps hashed key to key id for fast auth lookup.
  - `apikey_hash:<hash>` is kept for backward compatibility.
  - `apikey:idx:*`, `apikey:set:*`, `apikey:tags:*` support search/filter/tag indexes.

- Admin sessions:
  - `session:admin_credentials` stores hashed admin credentials loaded from `data/init.json`.
  - `session:<token>` stores admin login sessions.

- User sessions/users:
  - `user:<id>`, `username:<username>`, `user:index`.
  - `user_session:<token>` for user sessions.

- OAuth sessions:
  - `oauth:<sessionId>` stores short-lived OAuth state/proxy data.

- Accounts:
  - Claude: `claude:account:<id>`, `claude:account:index`
  - Claude Console: `claude_console_account:<id>`
  - CCR: `ccr_account:<id>`
  - Bedrock: `bedrock_account:<id>`
  - Gemini OAuth: `gemini_account:<id>`
  - Gemini API: `gemini_api_account:<id>`
  - OpenAI OAuth: `openai:account:<id>`, `openai:account:index`
  - OpenAI Responses: `openai_responses_account:<id>`
  - Azure OpenAI: `azure_openai:account:<id>`
  - Droid: `droid:account:<id>`, `droid:account:index`

- Shared pools and account groups:
  - Shared account sets are provider-specific.
  - `account_group:<id>`, `account_group_members:<id>`, `account_groups_reverse:<platform>:<accountId>`.

- Sticky sessions:
  - Scheduler-specific mappings such as `unified_claude_session_mapping:*`, `unified_openai_session_mapping:*`, `unified_gemini_session_mapping:*`.
  - Legacy/provider mappings such as `gemini_session_account_mapping:*`, `openai_session_account_mapping:*`, `azure_openai_session_account_mapping:*`.
  - Generic helper stores under `session_account_mapping:*` through Redis helper methods.

- Usage and cost:
  - `usage:<keyId>` aggregate totals.
  - `usage:daily:<keyId>:<date>`, `usage:hourly:<keyId>:<date>:<hour>`, `usage:monthly:<keyId>:<month>`.
  - `usage:model:*` and `usage:<keyId>:model:*` for model-level aggregation.
  - `usage:records:<keyId>` recent request records.
  - `usage:cost:*` rated cost, real cost, daily/monthly/hourly/total.
  - `usage:opus:*` weekly Claude/Opus cost counters.
  - Account usage/cost helper keys for per-account reporting.

- Rate/concurrency:
  - `rate_limit:window_start:<keyId>`, `rate_limit:requests:<keyId>`, `rate_limit:tokens:<keyId>`, `rate_limit:cost:<keyId>`.
  - `concurrency:<apiKeyId>` sorted sets with request lease expiries.
  - `concurrency:queue:*`, `concurrency:queue:stats:*`, `concurrency:queue:wait_times:*`.

- Request details:
  - `request_detail:item:<requestId>`
  - `request_detail:index:day:<yyyy-mm-dd>`
  - `request_detail:query_snapshot:<snapshotId>`

- Quota cards:
  - `quota_card:<id>`
  - `quota_card_code:<code>`
  - `quota_cards:all`
  - `quota_cards:status:<status>`
  - `redemption:<id>`
  - `redemptions:all`, `redemptions:user:<userId>`, `redemptions:apikey:<apiKeyId>`

- Balance and scripts:
  - Provider/account balance cache keys managed by `redis.setAccountBalance`.
  - Local balance cache and balance script config keys managed by Redis helper methods.

- Webhook config:
  - `webhook_config:default`.

- System metrics/migrations:
  - `system:metrics:*`, `system:migration:*`, migrated version keys, model/pricing state.

Local filesystem storage:

- `.env`: env configuration.
- `config/config.js`: runtime config loaded by the app.
- `data/init.json`: source of truth for admin username/password.
- `logs/`: rotating application/security/API logs.
- `web/admin-spa/dist/`: built admin SPA served from `/admin-next`.
- `resources/model-pricing/model_prices_and_context_window.json`: bundled pricing/context data.
- Optional debug dump files may be written at project root when dump env flags are enabled.

Sensitive storage:

- API key plaintext is only returned at creation/renewal; Redis stores hashes.
- Account tokens/API keys/AWS credentials are encrypted by provider services using config-derived encryption helpers.
- `data/init.json` stores admin password in plaintext by design and is then hashed into Redis at startup.

## Auth And Permission Flow

### Admin Auth

- Login endpoint: `POST /web/auth/login`.
- Credentials source: `data/init.json`, mirrored as hashed `session:admin_credentials` in Redis.
- Session token: random 32-byte hex string stored at `session:<token>`.
- Frontend storage: `localStorage.authToken`.
- Request header: `Authorization: Bearer <token>`.
- Middleware: `authenticateAdmin`.
- Session validation requires both `username` and `loginTime`.
- Startup removes malformed admin sessions.

### API Key Auth

- Middleware: `authenticateApiKey`.
- Accepted key locations:
  - `x-api-key`
  - `x-goog-api-key`
  - `Authorization: Bearer <key>`
  - `api-key`
  - query `key`
- Lookup flow:
  - normalize/extract key,
  - validate key length,
  - hash key using service logic,
  - lookup `apikey:hash_map`,
  - load `apikey:<id>`,
  - enforce active/deleted/expiry/activation state.

API key authorization layers:

- Service permissions: empty permissions means all services; otherwise service list such as `claude`, `openai`, `gemini`, `droid`.
- Client restrictions: allowed CLI/client validators.
- Global/API-key Claude Code-only mode for Claude messages endpoints.
- Model restriction blacklist.
- Dedicated account or account group bindings.
- Concurrency limits and optional queue.
- Request-window count/token/cost limits.
- Daily total cost limit.
- Total cost limit.
- Weekly Claude/Opus cost limit.
- OpenAI Responses adaptation/payload rules.

### User Auth

- Login endpoint: `POST /users/login`.
- LDAP can be enabled by env/config.
- Session token stored under user session keys and sent via `x-user-token`; some combined flows also inspect `Authorization`.
- Middleware:
  - `authenticateUser`
  - `authenticateUserOrAdmin`
  - `requireRole`
  - `requireAdmin`
- User roles include admin-capable checks for `/users` admin management routes.
- User-created API keys are tied to `createdBy`/owner semantics in `apiKeyService` and user routes.

## External Services

- Redis 6+ / Redis 7 in Docker Compose.
- Anthropic Claude API / Claude Code OAuth upstream.
- Claude Console upstream.
- CCR upstream configured by account.
- OpenAI/ChatGPT OAuth/Codex/Responses upstream.
- OpenAI API-key style Responses upstream.
- Azure OpenAI deployments.
- Google Gemini Code Assist and Gemini API.
- Google Antigravity upstream.
- Droid/Factory.ai upstream.
- AWS Bedrock Runtime and AWS credentials/bearer token support.
- LDAP server through `ldapjs` when enabled.
- Webhook/notification destinations:
  - enterprise WeChat, DingTalk, Feishu, Slack, Discord, custom HTTP webhook, Telegram, Bark, SMTP/email.
- HTTP/SOCKS proxies through proxy helper utilities and agent packages.
- Optional monitoring containers in Docker Compose:
  - Redis Commander, Prometheus, Grafana.

## Config And Environment Requirements

Runtime requirements:

- Node.js >= 18.
- Redis >= 6.
- npm dependencies from root `package.json`.
- For frontend development/build, dependencies under `web/admin-spa/package.json`.

Core required/important backend config:

- `.env` and `config/config.js` are both used.
- `PORT`, `HOST`, `NODE_ENV`, `TRUST_PROXY`.
- `JWT_SECRET`.
- `ENCRYPTION_KEY`.
- `ADMIN_SESSION_TIMEOUT`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`.
- Redis: `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_DB`, `REDIS_ENABLE_TLS`.
- Claude: `CLAUDE_API_URL`, `CLAUDE_API_VERSION`, `CLAUDE_BETA_HEADER`.
- Gemini/Antigravity OAuth overrides: `GEMINI_OAUTH_CLIENT_ID`, `GEMINI_OAUTH_CLIENT_SECRET`, redirect URI vars, Antigravity vars.
- Bedrock: `CLAUDE_CODE_USE_BEDROCK`, `AWS_REGION`, `ANTHROPIC_MODEL`, `ANTHROPIC_SMALL_FAST_MODEL`, token/thinking/cache vars.
- Proxy: `DEFAULT_PROXY_TIMEOUT`, `MAX_PROXY_RETRIES`, `PROXY_USE_IPV4`, `PROXY_KEEP_ALIVE`, `PROXY_MAX_SOCKETS`, `PROXY_MAX_FREE_SOCKETS`.
- Request limits: `REQUEST_TIMEOUT`, `REQUEST_MAX_SIZE_MB`, `DEFAULT_TOKEN_LIMIT`.
- Logging: `LOG_LEVEL`, `LOG_MAX_SIZE`, `LOG_MAX_FILES`.
- System: `CLEANUP_INTERVAL`, `TOKEN_USAGE_RETENTION`, `HEALTH_CHECK_INTERVAL`, `TIMEZONE_OFFSET`, `METRICS_WINDOW`, `CLEAR_CONCURRENCY_QUEUES_ON_STARTUP`.
- Web: `WEB_TITLE`, `WEB_DESCRIPTION`, `WEB_LOGO_URL`, `ENABLE_CORS`, `WEB_SESSION_SECRET`.
- LDAP: `LDAP_ENABLED`, `LDAP_URL`, bind/search/TLS/mapping vars.
- User management: `USER_MANAGEMENT_ENABLED`, `DEFAULT_USER_ROLE`, `USER_SESSION_TIMEOUT`, `MAX_API_KEYS_PER_USER`, `ALLOW_USER_DELETE_API_KEYS`.
- Webhook: `WEBHOOK_ENABLED`, `WEBHOOK_URLS`, timeout/retry settings, plus platform config stored in Redis.
- Account balance scripts: `BALANCE_SCRIPT_ENABLED`.
- User queue: `USER_MESSAGE_QUEUE_ENABLED`, delay/timeout/lock TTL vars.
- Quota cards: `QUOTA_CARD_LIMITS_ENABLED`, max expiry/cost vars.
- Upstream error cooldown vars: `UPSTREAM_ERROR_503_TTL_SECONDS`, `UPSTREAM_ERROR_5XX_TTL_SECONDS`, `UPSTREAM_ERROR_OVERLOAD_TTL_SECONDS`, `UPSTREAM_ERROR_AUTH_TTL_SECONDS`, `UPSTREAM_ERROR_TIMEOUT_TTL_SECONDS`.
- Debug dumps: `ANTHROPIC_DEBUG_*`, `ANTIGRAVITY_DEBUG_*`, `DUMP_MAX_FILE_SIZE_BYTES`.

Frontend config:

- `web/admin-spa/.env.example`.
- `VITE_APP_BASE_URL` defaults to `/admin/` in development and `/admin-next/` in production build.
- `VITE_API_TARGET` controls Vite dev proxy target, default `http://localhost:3000`.
- `VITE_HTTP_PROXY` can set HTTP proxy for dev.
- `VITE_API_BASE_PREFIX` affects tutorial URL display.
- Production file currently sets `VITE_APP_BASE_URL=/admin-next/`.

Docker config:

- `docker-compose.yml` expects `JWT_SECRET` and `ENCRYPTION_KEY`.
- Service exposes app on host `${BIND_HOST:-0.0.0.0}:${PORT:-3000}` to container `3000`.
- Redis is an internal service named `redis`.
- App persists `./logs` and `./data`.

## Test And Build Scripts

Root `package.json`:

- `npm start`
  - Runs `npm run lint && node src/app.js`.
  - Note: lint script uses `--fix`.
- `npm run dev`
  - Runs `nodemon`; `nodemon.json` also runs lint then `node src/app.js`.
- `npm test`
  - Runs Jest.
- `npm run lint`
  - Runs ESLint with `--fix` over `src`, `cli`, `scripts`.
- `npm run lint:check`
  - Runs ESLint without fixing.
- `npm run format`
  - Runs Prettier over backend/CLI/scripts.
- `npm run format:check`
  - Checks formatting.
- `npm run build:web`
  - Builds the Vue admin SPA.
- `npm run install:web`
  - Installs frontend dependencies.
- `npm run update:pricing`
  - Updates pricing resources.
- `npm run setup`
  - Initializes directories/env/admin credentials.
- `npm run cli`
  - Runs CLI entry.
- `npm run init:costs`
  - Initializes cost data.
- `npm run service:*`
  - Runs service manager commands.
- Migration/data/debug scripts:
  - `migrate:apikey-expiry`, `migrate:request-detail-retention-hours`, `migrate:fix-usage-stats`, `data:export`, `data:import`, enhanced/sanitized/encrypted variants, `data:debug`.
- Docker:
  - `docker:build`, `docker:up`, `docker:down`.

Frontend `web/admin-spa/package.json`:

- `npm run dev`
  - Vite dev server on port 3001 with proxy rules.
- `npm run build`
  - Vite production build to `dist`.
- `npm run preview`
  - Vite preview.
- `npm run lint`
  - ESLint with `--fix`.
- `npm run format`
  - Prettier over frontend `src/`.

Makefile:

- Provides wrappers for install/setup/dev/start/test/lint/build-web/build-all/docker/service/logs/CLI/deploy/checks.
- `deploy` runs clean/install/build/setup/test/lint/docker-up.

Test files currently present:

- `tests/adminApiKeysPayloadRulesRoute.test.js`
- `tests/redisApiKeyParse.test.js`
- `tests/costCalculator.test.js`
- `tests/concurrencyQueue.integration.test.js`
- `tests/requestDetailService.test.js`
- `tests/claudeConsoleAccounts.test.js`
- `tests/requestBodyRuleService.test.js`
- `tests/requestDetailsRoute.test.js`
- `tests/requestDetailHelper.test.js`
- `tests/accountBalanceService.test.js`
- `tests/openaiResponsesPayloadToggles.test.js`
- `tests/pricingService.test.js`
- `tests/metadataUserIdHelper.test.js`
- `tests/concurrencyQueue.test.js`
- `tests/modelsConfig.test.js`
- `tests/userMessageQueue.test.js`
- `tests/apiKeyServiceOpenAIResponsesConfig.test.js`
- `tests/metadataUserIdHelper.integration.test.js`

## Areas Most Likely To Contain Bugs

These are risk areas for future audit passes, not confirmed bug findings.

- Auth/session boundaries:
  - Admin sessions, user sessions, API key auth, combined user/admin auth, token extraction from multiple headers, and public stats endpoints.

- Route mount overlap and path aliases:
  - `/api` mounts both Anthropic and unified OpenAI-compatible routes.
  - `/openai` mounts both unified and Responses routes.
  - `/gemini` mounts standard and legacy route modules.
  - `/admin-next`, `/web`, and frontend base paths have separate assumptions.

- Streaming/SSE relays:
  - Claude, Bedrock, OpenAI Responses/Codex, Gemini, Azure, Droid, and CCR streaming paths patch headers/write/end behavior and capture usage asynchronously.

- Usage/cost accounting:
  - Token/cost fields span real vs rated costs, cache read/create tokens, long context, Opus weekly limits, model normalization, account-level and API-key-level stats.

- Redis schema compatibility:
  - Many flows rely on string/boolean coercion, old/new key formats, migration flags, indexes, SCAN fallbacks, TTLs, and data stored as hashes vs JSON strings.

- Concurrency and queue limits:
  - Lease renewal, cleanup, client disconnects, queue health checks, Retry-After behavior, and multi-instance startup cleanup can have edge cases.

- Scheduler/account selection:
  - Dedicated bindings, groups, sticky sessions, priority sorting, temp-unavailable state, rate-limit recovery, subscription expiry, model support, and provider-specific fallbacks.

- Credential encryption and token refresh:
  - Provider-specific account services encrypt/decrypt differently and refresh OAuth/API credentials on different schedules.

- Frontend API/base path assumptions:
  - Vite dev uses `/webapi`, production uses direct backend paths, SPA base defaults differ between dev and production, and route guards mix public/admin/user modes.

- Optional feature switches:
  - LDAP, user management, webhooks, custom balance scripts, request detail retention/body preview, debug dumps, account test scheduler, queueing, and upstream cooldown settings.

- Operational scripts:
  - Setup, migrations, data export/import, pricing updates, and service manager scripts touch runtime data and may drift from current Redis schema.
