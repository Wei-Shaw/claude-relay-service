# CarHer Admin Skill Bridge Design

## Goal

Let the local OpenAI + Claude account-pool console call the existing `carher-admin` operational capabilities through controlled backend APIs, instead of duplicating quota and recovery logic locally.

## Scope

The first implementation focuses on OpenAI account-pool operations:

- Read the canonical 5h/7d account state through `scripts/chatgpt-acct-quota.sh --json`.
- Run a server-side quota sweep through the existing quota-rebalance workflow.
- Refresh one account or the full account mirror from the existing server state pipeline.
- Keep real pause/resume disabled unless an explicit environment flag enables live mutation.

Claude remains read-first in this slice. The backend can continue reading ccmax guard state, but live Claude mutation is not opened until the guarded proxy path is confirmed as production traffic.

## Architecture

Add a focused service layer named `carherAdminSkillService`. It wraps the operational entry points from the `carher-admin` repository and exposes normalized results to local admin routes. The service never returns full API keys, OAuth tokens, `auth.json`, or raw secrets.

The admin route exposes a narrow API under `/admin/account-pool/admin-skill/*`. The route accepts only known actions, delegates to the service, and returns structured status objects suitable for the Vue account-pool page.

The existing `serverStateService` remains the source for account mirror normalization. The new service calls existing scripts and safe route actions rather than reimplementing 5h/7d policy logic.

## Safety

- Default mode is safe: dry-run and refresh are allowed, live pause/resume are blocked.
- Real OpenAI pause/resume requires `SERVER_STATE_LIVE_MUTATION_ENABLED=true`.
- Real operations must include an account id, provider, action, reason, and timestamp in the response.
- Frontend copy must make the mode clear: `只读`, `预演`, or `已执行`.
- The system must not expose complete keys, tokens, passwords, auth JSON, or master keys.

## Data Flow

1. Frontend calls an admin-skill action from the account-pool page.
2. The account-pool route authenticates the admin session.
3. `carherAdminSkillService` executes the mapped operational command or delegates to `serverStateService`.
4. The route returns a normalized result:
   - `target`
   - `provider`
   - `action`
   - `dryRun`
   - `mutationEnabled`
   - `message`
   - `data`
   - `ranAt`
5. Frontend displays the result and reloads the server mirror.

## First Milestone

Implement these backend actions and show them in the existing account-pool UI:

- `openai_quota_json`: read quota script JSON.
- `openai_sweep_dry_run`: run server mirror sweep without mutation.
- `openai_refresh_account`: refresh a single account via the existing server-state action.
- `openai_pause_account` / `openai_resume_account`: return 403 unless live mutation is enabled.

## Acceptance Criteria

- Tests prove live pause/resume are blocked by default.
- Tests prove dry-run sweep delegates to the existing account-pool automation path.
- Tests prove refresh delegates to `serverStateService.runAccountAction`.
- Frontend can trigger refresh and dry-run sweep from the account-pool page.
- No response includes full secrets.
