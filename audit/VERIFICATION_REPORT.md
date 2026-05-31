# Verification Report

Source files:

- `audit/PROJECT_MAP.md`
- `audit/BUG_MAP.md`

Verification scope: confirmed-bug fixes only, using existing audit artifacts, focused tests, full backend test runs, dependency audits, backend lint, and frontend production builds.

## Fix Progress

| ID | Status | Fix Summary | Verification | Changed Files |
| --- | --- | --- | --- | --- |
| BUG-001 | Fixed | Rebuilt `showToast` DOM creation so caller-controlled title/message text is never assigned through `innerHTML`; newline rendering is preserved with explicit `<br>` nodes. | `rg -n "innerHTML\|onclick=" web/admin-spa/src/utils/tools.js` returned no matches; `cd web/admin-spa && npm run build -- --outDir /tmp/mighty-admin-spa-bug001-dist --emptyOutDir` passed with pre-existing warnings only. | `web/admin-spa/src/utils/tools.js`, `audit/BUG_MAP.md`, `audit/VERIFICATION_REPORT.md` |
| BUG-002 | Fixed | Added a route-specific admin-SPA CSP and applied it through both `securityMiddleware` and the early `/admin-next/` static shortcut. | `npm test -- securityHeaders.test.js --runInBand` passed; `npm run lint:check` passed. | `src/middleware/auth.js`, `src/app.js`, `tests/securityHeaders.test.js`, `audit/BUG_MAP.md`, `audit/VERIFICATION_REPORT.md` |
| BUG-003 | Fixed | Removed request-body logging and response-body capture from `requestLogger`, preserving request IDs, status, timing, IP, user-agent, referer, and existing auth/key metadata. | `npm test -- requestLoggerRedaction.test.js --runInBand` passed; `npm run lint:check` passed. | `src/middleware/auth.js`, `tests/requestLoggerRedaction.test.js`, `audit/BUG_MAP.md`, `audit/VERIFICATION_REPORT.md` |
| BUG-004 | Fixed | Replaced plaintext admin credential storage with hash-only `init.json` storage and migration for existing plaintext files. | `npm test -- adminCredentials.test.js --runInBand` passed; `npm run lint:check` passed. | `src/utils/adminCredentials.js`, `scripts/setup.js`, `src/app.js`, `src/routes/web.js`, `tests/adminCredentials.test.js`, `audit/BUG_MAP.md`, `audit/VERIFICATION_REPORT.md` |
| BUG-005 | Fixed | Added a per-card Redis redemption lock and re-read card state inside the lock before quota/time side effects, so concurrent same-card redemption produces one success and one rejection. | `npx jest tests/quotaCardConcurrency.test.js --runInBand` passed; `npm test -- --runInBand` passed; `npm run lint:check` passed. | `src/services/quotaCardService.js`, `tests/quotaCardConcurrency.test.js`, `audit/BUG_MAP.md`, `audit/VERIFICATION_REPORT.md` |
| BUG-013 | Fixed | Raised the runtime, Docker, CI, installer, and documentation baseline to Node 24, upgraded AWS SDK dependencies to `^3.1057.0`, applied root and frontend audit fixes, upgraded frontend Vite tooling to a clean line, and refreshed npm/pnpm lockfiles. | Root and frontend full/production audits report zero vulnerabilities; final tests/builds below passed; Docker image `mighty-audit-node24` builds successfully. | `Dockerfile`, `package.json`, `package-lock.json`, `pnpm-lock.yaml`, `web/admin-spa/package.json`, `web/admin-spa/package-lock.json`, `README.md`, `README_EN.md`, `scripts/manage.sh`, `.github/workflows/pr-lint-check.yml`, `.github/workflows/auto-release-pipeline.yml`, `audit/BUG_MAP.md`, `audit/VERIFICATION_REPORT.md` |
| BUG-021 | Fixed | Removed query-string API-key authentication and sanitized request-log URLs so raw query strings are not written to log messages or metadata. | `npm test -- apiKeyQueryAuth.test.js requestLoggerRedaction.test.js --runInBand` passed; `npm run lint:check` passed. | `src/middleware/auth.js`, `tests/apiKeyQueryAuth.test.js`, `tests/requestLoggerRedaction.test.js`, `audit/BUG_MAP.md`, `audit/VERIFICATION_REPORT.md` |
| BUG-022 | Fixed | Replaced full API key persistence with `lastApiId`, removed legacy `lastApiKey`, and stripped `apiKey` URL parameters instead of loading them. | Source search confirmed no full-key persistence/loading remains; `cd web/admin-spa && npm run build -- --outDir /tmp/mighty-admin-spa-bug022-dist --emptyOutDir` passed with pre-existing warnings. | `web/admin-spa/src/stores/apistats.js`, `web/admin-spa/src/views/ApiStatsView.vue`, `audit/BUG_MAP.md`, `audit/VERIFICATION_REPORT.md` |
| BUG-026 | Fixed | Added production config validation for `JWT_SECRET` and `ENCRYPTION_KEY`, rejecting missing, short, or known placeholder values before encrypted account storage can use them. | `npm test -- configSecrets.test.js --runInBand` passed; `npm run lint:check` passed. | tracked `config/config.example.js`, local ignored `config/config.js` mirror, `tests/configSecrets.test.js`, `audit/BUG_MAP.md`, `audit/VERIFICATION_REPORT.md` |
| BUG-007 | Fixed | Added a reserved-route skip guard before the admin `/:userId` middleware chain so `/users/redemption-history` and `/users/quota-info` reach their fixed user handlers. | `npm test -- userRoutesOrder.test.js --runInBand` passed; `npm run lint:check` passed. | `src/routes/userRoutes.js`, `tests/userRoutesOrder.test.js`, `audit/BUG_MAP.md`, `audit/VERIFICATION_REPORT.md` |
| BUG-009 | Fixed | Added a frontend `logoutApi` call to `POST /web/auth/logout` and made the header await the auth store logout action before showing logout success. | Source search verified the backend logout call path; `cd web/admin-spa && npm run build -- --outDir /tmp/mighty-admin-spa-bug009-dist --emptyOutDir` passed with pre-existing warnings. | `web/admin-spa/src/utils/http_apis.js`, `web/admin-spa/src/stores/auth.js`, `web/admin-spa/src/components/layout/AppHeader.vue`, `audit/BUG_MAP.md`, `audit/VERIFICATION_REPORT.md` |
| BUG-010 | Fixed | Added existing admin authentication middleware to `/metrics` before Redis system stats are collected. | Source search confirmed `app.get('/metrics', authenticateAdmin, ...)`; `npm run lint:check` passed. | `src/app.js`, `audit/BUG_MAP.md`, `audit/VERIFICATION_REPORT.md` |
| BUG-006 | Fixed | Replaced stale quota read-modify-write with a Redis Lua mutation and serialized expiry extension calculations through a per-key Redis lock. | `npx jest tests/quotaCardConcurrency.test.js --runInBand` passed; `npm test -- --runInBand` passed; `npm run lint:check` passed. | `src/services/apiKeyService.js`, `src/services/quotaCardService.js`, `tests/quotaCardConcurrency.test.js`, `audit/BUG_MAP.md`, `audit/VERIFICATION_REPORT.md` |
| BUG-029 | Fixed | Added outbound URL/host policy enforcement, private/special IP blocking after DNS resolution, pinned HTTP(S) DNS lookup, redirect blocking, SMTP host validation, and Telegram proxy validation. | `npx jest tests/webhookOutboundPolicy.test.js --runInBand` passed; `npm test -- --runInBand` passed; `npm run lint:check` passed. | `src/utils/outboundNetworkPolicy.js`, `src/services/webhookService.js`, `tests/webhookOutboundPolicy.test.js`, `audit/BUG_MAP.md`, `audit/VERIFICATION_REPORT.md` |
| BUG-027 | Fixed | Added Redis-backed admin login throttles keyed by client IP and client-IP plus normalized username hash before credential lookup and password comparison. | `npm test -- adminLoginRateLimit.test.js --runInBand` passed; `npm run lint:check` passed. | `src/routes/web.js`, `tests/adminLoginRateLimit.test.js`, `audit/BUG_MAP.md`, `audit/VERIFICATION_REPORT.md` |
| BUG-028 | Fixed | Changed the balance-script config default to disabled unless `BALANCE_SCRIPT_ENABLED=true`, aligning config with the existing feature-flag helper and route checks. | `npm test -- featureFlags.test.js accountBalanceService.test.js --runInBand` passed; `npm run lint:check` passed. | tracked `config/config.example.js`, local ignored `config/config.js` mirror, `tests/featureFlags.test.js`, `audit/BUG_MAP.md`, `audit/VERIFICATION_REPORT.md` |
| BUG-011 | Fixed | Removed the bare all-origin `cors()` branch so configured `ENABLE_CORS=true` cannot bypass the restricted CORS middleware. | `npm test -- corsPolicy.test.js --runInBand` passed; `npm run lint:check` passed; source search found no `app.use(cors())` or `require('cors')` usage in `src`. | `src/app.js`, `tests/corsPolicy.test.js`, `audit/BUG_MAP.md`, `audit/VERIFICATION_REPORT.md` |
| BUG-023 | Fixed | Replaced the disabled-user root redirect with a login URL derived from `APP_CONFIG.basePath`, preserving the configured SPA mount point. | Source search confirmed the hardcoded root redirect is gone; `cd web/admin-spa && npm run build -- --outDir /tmp/mighty-admin-spa-bug023-dist --emptyOutDir` passed with pre-existing warnings. | `web/admin-spa/src/stores/user.js`, `audit/BUG_MAP.md`, `audit/VERIFICATION_REPORT.md` |
| BUG-025 | Fixed | Changed account-balance response success to follow the internal balance status, so provider/script errors return top-level `success: false` and are counted as failures by the existing UI logic. | `npm test -- accountBalanceService.test.js --runInBand` passed; `npm run lint:check` passed. | `src/services/account/accountBalanceService.js`, `tests/accountBalanceService.test.js`, `audit/BUG_MAP.md`, `audit/VERIFICATION_REPORT.md` |
| BUG-030 | Fixed | Added shared create/batch-create validation for API-key cost limit fields and applied the existing integer limit validation pattern to batch creation before key generation. | `npm test -- adminApiKeysPayloadRulesRoute.test.js --runInBand` passed; `npm run lint:check` passed. | `src/routes/admin/apiKeys.js`, `tests/adminApiKeysPayloadRulesRoute.test.js`, `audit/BUG_MAP.md`, `audit/VERIFICATION_REPORT.md` |
| BUG-012 | Fixed | Added shared pagination validation for redemption-history routes, rejecting invalid or oversized `limit`/`offset` values before history lookup. | `npm test -- userRoutesOrder.test.js apiStatsRedemptionPagination.test.js --runInBand` passed; `npm run lint:check` passed. | `src/utils/pagination.js`, `src/routes/userRoutes.js`, `src/routes/apiStats.js`, `tests/userRoutesOrder.test.js`, `tests/apiStatsRedemptionPagination.test.js`, `audit/BUG_MAP.md`, `audit/VERIFICATION_REPORT.md` |
| BUG-016 | Fixed | Added focused regression coverage for the confirmed-risk fixes, including CSP, logger redaction, query API-key rejection, admin credential storage, route ordering, admin login throttling, secret config enforcement, balance-script default-off behavior, CORS policy, balance error signaling, API-key limit validation, redemption pagination, toast HTML-sink removal, quota-card concurrency, and webhook outbound filtering. | Focused quota/webhook suite passed with 8 tests; full backend suite passed with 32 suites, 281 passing tests, and 8 skipped; `npm run lint:check` passed. | `tests/quotaCardConcurrency.test.js`, `tests/webhookOutboundPolicy.test.js`, plus the focused tests listed in `audit/BUG_MAP.md`, `audit/BUG_MAP.md`, `audit/VERIFICATION_REPORT.md` |
| BUG-031 | Fixed | Added a per-key cost-limit gate for cost-limited API keys, revalidated the cost snapshot under the gate, estimated rated request cost, and rejected projected rate/daily/total/weekly cost overruns before relay. | `npx jest tests/costLimitConcurrencyLock.test.js --runInBand` passed; focused two-test suite passed; full `npm test -- --runInBand` passed; `npm run lint:check` passed. | `src/middleware/auth.js`, `tests/costLimitConcurrencyLock.test.js`, `audit/BUG_MAP.md`, `audit/VERIFICATION_REPORT.md` |
| BUG-020 | Fixed | Wrapped user API-key count check, creation, and count update in a per-user Redis lock so concurrent creates cannot exceed `maxApiKeysPerUser`. | `npx jest tests/userApiKeyCreationLock.test.js --runInBand` passed; focused two-test suite passed; full `npm test -- --runInBand` passed; `npm run lint:check` passed. | `src/routes/userRoutes.js`, `tests/userApiKeyCreationLock.test.js`, `audit/BUG_MAP.md`, `audit/VERIFICATION_REPORT.md` |
| BUG-017 | Fixed | Removed the mutating dev-only lint gate from runtime startup; `npm start` and nodemon now run `node src/app.js` directly. | Disposable production install with `npm ci --omit=dev --ignore-scripts` ran `npm start` successfully against a dummy `src/app.js`; `npm run lint:check` passed. | `package.json`, `nodemon.json`, `audit/BUG_MAP.md`, `audit/VERIFICATION_REPORT.md` |
| BUG-008 | Fixed | Made admin `checkAuth()` await `/web/auth/user` and return a boolean; the protected-route guard now awaits it before redirecting to login. | Admin SPA build passed with pre-existing warnings; Playwright loaded `/admin/dashboard` with stored `authToken` and mocked successful `/webapi/web/auth/user`, and final URL remained `/admin/dashboard`. | `web/admin-spa/src/stores/auth.js`, `web/admin-spa/src/router/index.js`, `audit/BUG_MAP.md`, `audit/VERIFICATION_REPORT.md` |
| BUG-014 | Fixed | Excluded the already explicitly imported user create-key modal from local component auto-registration, removing the duplicate `CreateApiKeyModal` warning without renaming either modal file. | `cd web/admin-spa && npm run build -- --outDir /tmp/mighty-admin-spa-bug01415-dist --emptyOutDir` passed without the duplicate component warning. | `web/admin-spa/vite.config.js`, `audit/BUG_MAP.md`, `audit/VERIFICATION_REPORT.md` |
| BUG-015 | Fixed | Updated Browserslist data, removed the full Element Plus plugin install, split vendor chunks more granularly, and loaded the XLSX export library only on demand as a static asset. | `cd web/admin-spa && npm run build -- --outDir /tmp/mighty-admin-spa-bug01415-dist --emptyOutDir` passed without stale Browserslist or chunks-over-500-kB warnings. | `web/admin-spa/vite.config.js`, `web/admin-spa/src/main.js`, `web/admin-spa/src/views/ApiKeysView.vue`, `web/admin-spa/package-lock.json`, `audit/BUG_MAP.md`, `audit/VERIFICATION_REPORT.md` |

## Confirmed Bugs

These were the confirmed bugs at the start of the fixing phase. Current per-bug fix status is tracked in `audit/BUG_MAP.md` and in the Fix Progress table above.

| ID | Severity | Reason |
| --- | --- | --- |
| BUG-001 | Critical | Toasts render unescaped HTML through `innerHTML`, with tokens stored in localStorage. |
| BUG-002 | Critical | `/admin-next` is served without CSP while localStorage tokens are present. |
| BUG-003 | Critical | Request/response logger records credential-bearing bodies and token responses. |
| BUG-004 | Critical | Active admin password is stored in plaintext in `data/init.json`. |
| BUG-007 | High | Express route order makes fixed user routes match `/:userId` first. |
| BUG-009 | High | SPA logout does not call backend session invalidation. |
| BUG-010 | High | Unauthenticated `/metrics` triggers Redis keyspace scans. |
| BUG-011 | Medium | Example CORS config enables bare all-origin `cors()`. |
| BUG-012 | Low | Redemption-history pagination lacks input validation. |
| BUG-013 | Critical | Production dependency audits still report critical/high vulnerabilities. |
| BUG-016 | Medium | Risky security and data-integrity paths lack targeted tests. |
| BUG-021 | Critical | Relay API keys are accepted from query strings and query strings are logged. |
| BUG-022 | Critical | Public API stats can store full API keys in localStorage and URLs. |
| BUG-023 | Medium | Disabled-user redirect ignores the `/admin-next/` SPA base path. |
| BUG-025 | Medium | Balance failures return top-level success and UI counts them as success. |
| BUG-026 | Critical | Runtime can fall back to public placeholder encryption/JWT secrets. |
| BUG-027 | High | Admin login has no route-level brute-force throttling. |
| BUG-028 | High | Balance script execution is effectively enabled by default. |
| BUG-030 | Medium | Admin API-key create/batch-create paths do not validate several numeric limit fields. |

## Probable Bugs

None remaining in the current audit scope.

## Confirmed After Probable Verification

These were confirmed after the first confirmed-fix commit and fixed in the follow-up pass.

| ID | Severity | Evidence |
| --- | --- | --- |
| BUG-005 | Critical | Controlled in-memory `redeemCard` harness returned two successes, two redemption records, and `totalAdded: 20` for one 10-credit card. |
| BUG-006 | High | Controlled in-memory `addTotalCostLimit` harness ended with `finalTotalCostLimit: 7` for concurrent `+5` and `+7` updates, where atomic behavior should end at `12`. |
| BUG-029 | High | Controlled local `127.0.0.1` listener received a POST from `webhookService.sendHttpRequest`, proving loopback egress through the webhook sender. |

## Confirmed Then Fixed

| ID | Severity | Evidence |
| --- | --- | --- |
| BUG-031 | High | Initially reproduced with two concurrent relay requests both reading `dailyCost=0` and overspending to `1.5`; fixed test now returns one `200`, one `402`, and final cost `0.75`. |
| BUG-020 | High | Initially reproduced with two concurrent user API-key creates both returning `201`; fixed test now creates one key and rejects the second request at the max-key check. |
| BUG-017 | High | Initially reproduced production startup failure from missing `eslint`; fixed production-install check now starts with only production dependencies. |
| BUG-008 | High | Initially reproduced protected-route loss on hard refresh; fixed Playwright check keeps `/admin/dashboard` with a stored valid token. |

## Needs Verification

None remaining in the current audit scope.

## False Positives

None verified in this pass.

## Duplicates

| ID | Duplicate Of | Notes |
| --- | --- | --- |
| BUG-018 | BUG-009 | Flow-trace row for admin logout session invalidation. |
| BUG-019 | BUG-003 | Flow-trace row for request/response logging of account-management secrets. |
| BUG-024 | BUG-005 and BUG-006 | Flow-trace row for quota-card non-atomic redemption and quota mutation. |

## Bugs Needing Manual Testing

None remaining in the current audit scope.

## Bugs Needing Logs, Screenshots, Or User Input

None remaining in the current audit scope.

## Final Fixing Order

1. Critical fixed: BUG-001, BUG-002, BUG-003, BUG-004, BUG-005, BUG-021, BUG-022, BUG-026.
2. Critical dependency fix: BUG-013 by raising the runtime/Docker baseline to Node 24 and clearing root/frontend audits.
3. High fixed: BUG-006, BUG-007, BUG-009, BUG-010, BUG-027, BUG-028, BUG-029, then BUG-031, BUG-020, BUG-017, BUG-008.
4. Medium fixed: BUG-011, BUG-016, BUG-023, BUG-025, BUG-030.
5. Low fixed: BUG-012.

## Recommended Next Fixing Order

1. No audit bugs remain open in the current scope.

## Final Verification

| Command | Result |
| --- | --- |
| `npx jest tests/costLimitConcurrencyLock.test.js tests/userApiKeyCreationLock.test.js --runInBand` | Passed: 2 suites, 2 tests. |
| `npx jest tests/quotaCardConcurrency.test.js tests/webhookOutboundPolicy.test.js --runInBand` | Passed: 2 suites, 8 tests. |
| `npm test -- --runInBand` | Passed: 34 suites, 283 tests passed, 8 skipped. |
| `npm run lint:check` | Passed. |
| Fixed `BUG-031` middleware harness | Passed: statuses `[200, 402]`, final daily cost `0.75`, daily limit `1`. |
| Fixed `BUG-020` route harness | Passed: statuses `[201, 400]`, created 1 key with max `1`. |
| Disposable production install startup check | Passed: `npm start` ran `node src/app.js` with production dependencies only and printed `dummy app started`. |
| Playwright admin refresh check | Passed: hard refresh to `/admin/dashboard` with stored token and successful auth-user mock remained on `/admin/dashboard`. |
| `cd web/admin-spa && npm run build -- --outDir /tmp/mighty-admin-spa-vite8-dist --emptyOutDir` | Passed on Vite 8 with warnings: stale Browserslist data, duplicate `CreateApiKeyModal` auto-registration warning, 90 no-console warnings, large chunks, Rolldown pure-annotation warnings from `@vueuse/core`. |
| `cd web/admin-spa && npm run build -- --outDir /tmp/mighty-admin-spa-bug008-dist --emptyOutDir` | Passed with the same pre-existing warnings. |
| `cd web/admin-spa && npm run build -- --outDir /tmp/mighty-admin-spa-bug01415-dist --emptyOutDir` | Passed with no stale Browserslist warning, no duplicate `CreateApiKeyModal` warning, and no chunks-over-500-kB warning. Remaining warnings were no-console lint warnings, Rolldown pure-annotation notices from `@vueuse/core`, and plugin timing diagnostics. |
| `npm audit --json` | Passed: zero vulnerabilities. |
| `npm audit --omit=dev --json` | Passed: zero vulnerabilities. |
| `cd web/admin-spa && npm audit --json` | Passed: zero vulnerabilities. |
| `cd web/admin-spa && npm audit --omit=dev --json` | Passed: zero vulnerabilities. |
| `DOCKER_BUILDKIT=1 docker build -t mighty-audit-node24 .` | Passed; backend/frontend install stages report zero npm audit vulnerabilities. |

## Remaining Unresolved Bugs

None remaining in the current audit scope.
