# Audit Log

## 2026-05-31 - Adversarial Bug Map Review

Scope:

- Reviewed `audit/BUG_MAP.md` adversarially against `audit/PROJECT_MAP.md` and current source code.
- Read-only for application code. Updated audit documents only.
- Focused on missed categories, weak evidence, duplicate findings, false-positive candidates, unaudited risky flows, reproduction gaps, and vague findings.

Checks performed:

- Re-read the existing bug map and project map.
- Re-enumerated admin, user, public stats, webhook, request-detail, account balance, API-key, and relay route surfaces with `rg`.
- Inspected representative source paths for missing evidence:
  - `src/routes/web.js`
  - `src/routes/userRoutes.js`
  - `src/routes/apiStats.js`
  - `src/routes/admin/apiKeys.js`
  - `src/routes/admin/accountBalance.js`
  - `src/routes/webhook.js`
  - `src/services/webhookService.js`
  - `src/services/balanceScriptService.js`
  - `src/utils/featureFlags.js`
  - `src/utils/commonHelper.js`
  - `src/middleware/auth.js`
  - `config/config.js`
  - `config/config.example.js`
  - `.env.example`

Updates made:

- Added `BUG-026`: static fallback encryption secrets can make encrypted account credentials decryptable when `ENCRYPTION_KEY` is missing or copied from examples.
- Added `BUG-027`: admin login lacks per-IP or per-username brute-force throttling while global rate limiting is a no-op.
- Added `BUG-028`: balance scripts are effectively enabled by default despite the feature flag helper documenting a safe default of disabled.
- Added `BUG-029`: webhook test/config flows allow server-side outbound requests without SSRF-grade URL and DNS policy checks.
- Added `BUG-030`: admin API-key create and batch-create paths miss validation for several cost/rate limit fields.
- Added `BUG-031`: relay cost limits are checked before requests and recorded after responses, allowing concurrent overspend.
- Expanded `BUG-016` to include missing tests for the new high-risk paths.
- Added an `Adversarial Review Notes` section to `audit/BUG_MAP.md`.

Audit-quality findings:

- Duplicate rows:
  - `BUG-018` duplicates `BUG-009` as a flow-trace row.
  - `BUG-019` duplicates `BUG-003` as a flow-trace row.
  - `BUG-024` duplicates `BUG-005` and `BUG-006` as a flow-trace row.
  - These should remain for flow traceability but not be counted as unique defects.

- Weak evidence needing reproduction:
  - `BUG-001`: direct code evidence for `innerHTML`, but needs browser proof against a realistic error path.
  - `BUG-008`: route-guard race needs browser refresh reproduction.
  - `BUG-017`: production-only failure needs a production-install test.
  - `BUG-020`: user API-key creation race needs concurrent request reproduction.
  - `BUG-025`: account balance false success needs provider/script failure reproduction.
  - `BUG-031`: cost-limit overspend needs concurrent relay reproduction.

- False-positive candidates:
  - `BUG-014`: may be only a build warning if every current `CreateApiKeyModal` usage is explicitly imported.
  - `BUG-017`: severity depends on whether operators use `npm start`/`nodemon` or direct `node src/app.js`.
  - `BUG-028`: the unsafe default is proven; full VM-escape severity should be validated separately.

- Too broad:
  - `BUG-013` aggregates dependency advisories and should be split into package-specific remediation tickets before fixing.

Risky flows still not deeply audited:

- Data export/import and admin sync.
- OAuth polling/callback failure and replay behavior.
- Request-detail body-preview privacy and retention behavior.
- Pricing refresh and update-check outbound calls.
- Admin concurrency cleanup endpoints.
- Scheduled account test behavior and notification side effects.

Verification:

- No application tests were run in this adversarial pass.
- Markdown table pipe counts were checked after edits.

## 2026-05-31 - Post-Fix Probable Verification

Scope:

- Rechecked the highest-risk `Probable` findings after the confirmed-bug fix commit.
- Kept application source read-only; updated audit documents only.
- Used controlled in-memory or loopback harnesses where possible instead of live Redis/provider traffic.

Verification performed:

- `BUG-005`: ran an in-memory `quotaCardService.redeemCard` concurrency harness. Two concurrent calls against the same unused card both succeeded, wrote two redemption records, and applied `totalAdded: 20` for one 10-credit card.
- `BUG-006`: ran an in-memory `apiKeyService.addTotalCostLimit` concurrency harness. Concurrent `+5` and `+7` updates ended with `finalTotalCostLimit: 7` instead of the atomic expected `12`.
- `BUG-029`: started a local `127.0.0.1` listener and called `webhookService.sendHttpRequest` to it. The listener received the POST, proving loopback egress through the webhook sender.
- `BUG-017`, `BUG-020`, and `BUG-031`: re-read the relevant code paths and kept them as `Probable` because disposable production install, user-key concurrency integration, and concurrent relay-cost proof were not executed.

Updates made:

- Marked `BUG-005`, `BUG-006`, and `BUG-029` as confirmed/proven but still open.
- Added a confirmed-after-probable-verification section and next fixing order to `audit/VERIFICATION_REPORT.md`.
- Updated `audit/BUG_MAP.md` verification rows with exact harness outcomes.

## 2026-05-31 - Confirmed Probable Fix Follow-Up

Scope:

- Fixed only the newly confirmed `BUG-005`, `BUG-006`, and `BUG-029` rows.
- Preserved remaining `Probable`, `Needs Verification`, `False Positive`, and `Duplicate` rows for later verification.

Fixes made:

- `BUG-005`: added a per-card Redis redemption lock and re-read card state inside the lock before applying quota/time side effects.
- `BUG-006`: replaced quota increments with a Redis Lua mutation and serialized expiry extension calculations through a per-key Redis lock.
- `BUG-029`: added outbound URL/host policy checks, private/special IP blocking after DNS resolution, HTTP(S) DNS pinning, redirect blocking, SMTP host validation, and Telegram proxy validation.

Verification performed:

- `npx jest tests/quotaCardConcurrency.test.js tests/webhookOutboundPolicy.test.js --runInBand` passed with 2 suites and 8 tests.
- `npm test -- --runInBand` passed with 32 suites, 281 passing tests, and 8 skipped.
- `npm run lint:check` passed.

Updates made:

- Marked `BUG-005`, `BUG-006`, and `BUG-029` as fixed in `audit/BUG_MAP.md`.
- Updated `audit/VERIFICATION_REPORT.md` with the final fixing order, verification commands, and remaining unresolved bugs.

## 2026-05-31 - Remaining Probable Verification

Scope:

- Verified the remaining high-priority probable bugs after the confirmed quota/webhook fixes.
- Kept source code read-only. Only audit documents were updated.

Verification performed:

- `BUG-031`: ran a controlled Express harness using the real `authenticateApiKey` middleware. Two concurrent requests both read `dailyCost=0` against `dailyCostLimit=1`, both returned `200`, and post-auth usage recording raised final daily cost to `1.5`.
- `BUG-020`: ran a controlled route harness using the real `/users/api-keys` handler with `maxApiKeysPerUser=1`. Two concurrent requests both returned `201` and created keys `one` and `two`.
- `BUG-017`: ran a disposable production install with `npm ci --omit=dev --ignore-scripts` and then `npm start`. Startup exited `127` before app boot because `eslint` was not installed.
- `BUG-008`: started the admin SPA dev server and used Playwright with `localStorage.authToken` set and `/web/auth/user` mocked as successful. Loading `/admin/dashboard` did not preserve the protected route; final URL was `http://127.0.0.1:5177/admin/api-stats#/login` with the token still present.

Updates made:

- Marked `BUG-008`, `BUG-017`, `BUG-020`, and `BUG-031` as confirmed/proven and open in `audit/BUG_MAP.md`.
- Updated `audit/VERIFICATION_REPORT.md` recommended fixing order and remaining unresolved bug status.

## 2026-05-31 - Remaining Confirmed Fixes

Scope:

- Fixed only the four confirmed open bugs from the remaining verification pass.
- Preserved unrelated frontend localization/i18n work already present in the worktree.

Fixes made:

- `BUG-031`: added a per-key cost-limit gate for cost-limited API keys, re-read quota under the gate, estimated rated request cost, and rejected projected rate/daily/total/weekly cost overruns before relay.
- `BUG-020`: wrapped user API-key count check, creation, and count update in a per-user Redis lock.
- `BUG-017`: changed runtime and nodemon startup to run `node src/app.js` directly instead of mutating dev-only lint.
- `BUG-008`: made admin `checkAuth()` await backend token verification and made the protected-route guard await that result before redirecting.

Verification performed:

- `npx jest tests/costLimitConcurrencyLock.test.js tests/userApiKeyCreationLock.test.js --runInBand` passed with 2 suites and 2 tests.
- `npm test -- --runInBand` passed with 34 suites, 283 passing tests, and 8 skipped.
- `npm run lint:check` passed.
- Disposable production install with `npm ci --omit=dev --ignore-scripts` ran `npm start` successfully against a dummy `src/app.js`.
- Admin SPA build passed with the pre-existing warnings, and Playwright kept `/admin/dashboard` on hard refresh with a stored valid token and mocked successful auth-user response.

Updates made:

- Marked `BUG-008`, `BUG-017`, `BUG-020`, and `BUG-031` as fixed in `audit/BUG_MAP.md`.
- Updated `audit/VERIFICATION_REPORT.md` with the fixing order, verification commands, and remaining unresolved bug list.

## 2026-05-31 - Build Hygiene Follow-Up

Scope:

- Expanded scope to fix the remaining `BUG-014` and `BUG-015` build hygiene findings.
- Kept the existing unrelated admin SPA localization/i18n work intact.

Fixes made:

- `BUG-014`: excluded the user `CreateApiKeyModal.vue` from local component auto-registration because it is already explicitly imported where used, removing the duplicate auto-registration warning without renaming components.
- `BUG-015`: updated Browserslist data, removed the full Element Plus plugin install in favor of existing auto-imported Element Plus components, split vendor chunks more granularly, and lazy-loaded the XLSX export library as an on-demand static asset.

Verification performed:

- `cd web/admin-spa && npm run build -- --outDir /tmp/mighty-admin-spa-bug01415-dist --emptyOutDir` passed.
- The build no longer emits the stale Browserslist/caniuse-lite warning.
- The build no longer emits the duplicate `CreateApiKeyModal` component warning.
- The build no longer emits the chunks-over-500-kB warning; the XLSX library is emitted as a 425 kB static asset loaded only when export is invoked.

Updates made:

- Marked `BUG-014` and `BUG-015` as fixed in `audit/BUG_MAP.md`.
- Updated `audit/VERIFICATION_REPORT.md` so no audit bugs remain unresolved in the current scope.
