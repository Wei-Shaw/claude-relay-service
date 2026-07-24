# CarHer Admin Skill Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a controlled backend bridge so the local account-pool console can call existing `carher-admin` quota and account-pool operations.

**Architecture:** Add `src/services/carherAdminSkillService.js` as a narrow wrapper over existing server-state and account-pool automation services. Add admin routes under `/admin/account-pool/admin-skill/*`, then wire the Vue account-pool page to trigger dry-run sweep and account refresh while keeping live pause/resume blocked by default.

**Tech Stack:** Node.js, Express, Jest, Vue 3, existing admin auth middleware, existing `serverStateService`, existing `accountPoolAutomationService`.

## Global Constraints

- Do not expose full OpenAI/Claude keys, OAuth tokens, passwords, auth JSON, or LiteLLM master keys.
- Real pause/resume must be blocked unless `SERVER_STATE_LIVE_MUTATION_ENABLED=true`.
- Reuse existing `quota-rebalance.py`, `chatgpt-acct-quota.sh`, `serverStateService`, and `accountPoolAutomationService` behavior instead of reimplementing 5h/7d policy.
- Default user-facing actions are `只读` or `预演`.

---

## File Structure

- Create `src/services/carherAdminSkillService.js`: normalizes safe operational actions for account-pool admin skills.
- Modify `src/routes/admin/accountPool.js`: add `/account-pool/admin-skill/*` routes.
- Modify `web/admin-spa/src/utils/http_apis.js`: add frontend API wrappers.
- Modify `web/admin-spa/src/views/AccountPoolView.vue`: add action buttons and display result.
- Test `tests/carherAdminSkillService.test.js`: service-level behavior.
- Test `tests/adminAccountPoolRoute.test.js`: route behavior.

### Task 1: Backend Service

**Files:**
- Create: `src/services/carherAdminSkillService.js`
- Test: `tests/carherAdminSkillService.test.js`

**Interfaces:**
- Consumes: `accountPoolAutomationService.runPolicySweep({ dryRun, source })`
- Consumes: `serverStateService.runAccountAction({ provider, accountId, action })`
- Produces: `runAdminSkillAction({ action, provider, accountId, dryRun, reason })`

- [ ] **Step 1: Write the failing service tests**

```javascript
jest.mock('../src/services/accountPoolAutomationService', () => ({
  runPolicySweep: jest.fn()
}))

jest.mock('../src/services/serverStateService', () => ({
  runAccountAction: jest.fn()
}))

const accountPoolAutomationService = require('../src/services/accountPoolAutomationService')
const serverStateService = require('../src/services/serverStateService')
const carherAdminSkillService = require('../src/services/carherAdminSkillService')

describe('carherAdminSkillService', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    delete process.env.SERVER_STATE_LIVE_MUTATION_ENABLED
  })

  test('runs server dry-run sweep through existing automation service', async () => {
    accountPoolAutomationService.runPolicySweep.mockResolvedValue({
      mode: 'server-mirror',
      dryRun: true,
      totals: { scanned: 2 }
    })

    const result = await carherAdminSkillService.runAdminSkillAction({
      action: 'openai_sweep_dry_run'
    })

    expect(accountPoolAutomationService.runPolicySweep).toHaveBeenCalledWith({
      dryRun: true,
      source: 'server'
    })
    expect(result).toMatchObject({
      provider: 'openai',
      action: 'openai_sweep_dry_run',
      dryRun: true,
      mutationEnabled: false,
      success: true
    })
    expect(result.data.totals.scanned).toBe(2)
  })

  test('refreshes one OpenAI account through serverStateService', async () => {
    serverStateService.runAccountAction.mockResolvedValue({
      ok: true,
      accountId: 'acct-29',
      action: 'refresh'
    })

    const result = await carherAdminSkillService.runAdminSkillAction({
      action: 'openai_refresh_account',
      accountId: 'acct-29'
    })

    expect(serverStateService.runAccountAction).toHaveBeenCalledWith({
      provider: 'openai',
      accountId: 'acct-29',
      action: 'refresh'
    })
    expect(result).toMatchObject({
      success: true,
      provider: 'openai',
      accountId: 'acct-29',
      action: 'openai_refresh_account'
    })
  })

  test('blocks live pause by default', async () => {
    await expect(
      carherAdminSkillService.runAdminSkillAction({
        action: 'openai_pause_account',
        accountId: 'acct-29'
      })
    ).rejects.toMatchObject({
      statusCode: 403,
      message: 'Live server account mutation is disabled'
    })
    expect(serverStateService.runAccountAction).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run service test to verify RED**

Run: `npm test -- tests/carherAdminSkillService.test.js --runInBand`
Expected: FAIL because `../src/services/carherAdminSkillService` does not exist.

- [ ] **Step 3: Implement minimal service**

Create `src/services/carherAdminSkillService.js` with action mapping, blocked live mutations, and normalized responses.

- [ ] **Step 4: Run service test to verify GREEN**

Run: `npm test -- tests/carherAdminSkillService.test.js --runInBand`
Expected: PASS.

### Task 2: Admin Routes

**Files:**
- Modify: `src/routes/admin/accountPool.js`
- Test: `tests/adminAccountPoolRoute.test.js`

**Interfaces:**
- Consumes: `carherAdminSkillService.runAdminSkillAction(input)`
- Produces: `POST /admin/account-pool/admin-skill/action`

- [ ] **Step 1: Add failing route tests**

Add tests that locate the `POST /account-pool/admin-skill/action` handler, call it with `{ action: 'openai_sweep_dry_run' }`, and assert a successful JSON response. Add a second test for blocked pause returning HTTP 403.

- [ ] **Step 2: Run route tests to verify RED**

Run: `npm test -- tests/adminAccountPoolRoute.test.js --runInBand`
Expected: FAIL because route does not exist.

- [ ] **Step 3: Add route**

In `src/routes/admin/accountPool.js`, import `carherAdminSkillService` and add:

```javascript
router.post('/account-pool/admin-skill/action', authenticateAdmin, async (req, res) => {
  try {
    const result = await carherAdminSkillService.runAdminSkillAction(req.body || {})
    return res.json({ success: true, data: result })
  } catch (error) {
    return res.status(error.statusCode || 400).json({
      success: false,
      message: error.message || 'Failed to run admin skill action'
    })
  }
})
```

- [ ] **Step 4: Run route tests to verify GREEN**

Run: `npm test -- tests/adminAccountPoolRoute.test.js --runInBand`
Expected: PASS.

### Task 3: Frontend API And UI

**Files:**
- Modify: `web/admin-spa/src/utils/http_apis.js`
- Modify: `web/admin-spa/src/views/AccountPoolView.vue`

**Interfaces:**
- Consumes: `POST /admin/account-pool/admin-skill/action`
- Produces: `runAccountPoolAdminSkillActionApi(payload)`

- [ ] **Step 1: Add frontend API helper**

In `http_apis.js`, add a helper that posts to `/admin/account-pool/admin-skill/action`.

- [ ] **Step 2: Add UI state**

In `AccountPoolView.vue`, add `adminSkillRunning`, `adminSkillResult`, and handlers for dry-run sweep and refresh mirror.

- [ ] **Step 3: Add buttons**

Add buttons near the policy action area:

```text
调用 admin 预演
刷新账号池
```

Both must show loading state and toast success/failure.

- [ ] **Step 4: Run frontend validation**

Run: `cd web/admin-spa && npm run build`
Expected: build succeeds.

### Task 4: Verification

**Files:**
- No production files unless fixing test/build issues.

- [ ] **Step 1: Run targeted backend tests**

Run:

```bash
npm test -- tests/carherAdminSkillService.test.js tests/adminAccountPoolRoute.test.js --runInBand
```

Expected: PASS.

- [ ] **Step 2: Run frontend build**

Run:

```bash
cd web/admin-spa
npm run build
```

Expected: PASS.

- [ ] **Step 3: Restart local service if needed**

Start or restart the local app on port `3100` so the user can test `http://127.0.0.1:3100/admin-next/account-pool`.
