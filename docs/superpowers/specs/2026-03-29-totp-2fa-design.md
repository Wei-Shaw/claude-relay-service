# TOTP 2FA Design For Admin And User Login

## Goal

Add optional TOTP-based 2FA for both administrator and normal user login flows.

When 2FA is enabled for an account:
- Username and password remain the first factor
- A valid TOTP code or one-time recovery code becomes the second factor
- No authenticated session is issued until the second factor succeeds

The design must be secure against common bypass attempts, follow mainstream interaction patterns, and minimize conflict with future upstream merges.

## Scope

In scope:
- Admin login at `/web/auth/login`
- User login at `/users/login`
- Admin 2FA self-service setup and management
- User 2FA self-service setup and management
- Recovery code generation and login
- Admin-triggered reset of a user's 2FA
- Local emergency recovery path for the admin account
- Automated tests covering login, setup, recovery, and anti-bypass constraints

Out of scope:
- SMS, email, passkey, WebAuthn, or push-based MFA
- Mandatory org-wide enforcement policies
- Trusted device or remember-this-browser flows
- Recovery by email

## Current Context

### Admin authentication

- Admin credentials are stored in Redis under `admin_credentials`, with `data/init.json` used as the durable source for bootstrap and password changes.
- Admin login is handled in `src/routes/web.js`.
- Admin sessions are Redis-backed opaque tokens consumed by `authenticateAdmin` in `src/middleware/auth.js`.

### User authentication

- User login is LDAP-backed and handled in `src/routes/userRoutes.js`.
- User records and user sessions are managed by `src/services/userService.js`.
- User sessions are also opaque Redis-backed tokens enforced by `authenticateUser`.

### Frontend

- Admin login uses `web/admin-spa/src/views/LoginView.vue`.
- User login uses `web/admin-spa/src/views/UserLoginView.vue`.
- Admin account settings currently live in `web/admin-spa/src/views/SettingsView.vue`.
- User self-service UI currently centers on `web/admin-spa/src/views/UserDashboardView.vue`.

## Design Principles

1. Do not issue a real session before 2FA succeeds.
2. Keep 2FA data in isolated Redis keys instead of deeply rewriting existing primary account records.
3. Require fresh credential confirmation before sensitive 2FA changes.
4. Keep server-side enforcement authoritative; frontend state must never grant access.
5. Prefer additive, small-surface changes to reduce merge conflicts with upstream.

## Recommended Approach

Use a two-stage login flow for both admin and user authentication.

Stage 1 verifies username and password only.

- If 2FA is disabled for the account, return the normal authenticated session exactly as today.
- If 2FA is enabled, return a short-lived single-use pending login token instead of a real session.

Stage 2 verifies either:
- A 6-digit TOTP code, or
- A one-time recovery code

Only after stage 2 succeeds does the server issue the real authenticated session token.

## Data Model

### Admin 2FA config

Store admin 2FA data separately from `admin_credentials`.

Redis key:
- `admin_2fa_config`

Fields:
- `enabled`: boolean string
- `secretCiphertext`: encrypted TOTP secret
- `secretIv`: encryption IV or nonce if required by helper implementation
- `secretVersion`: optional crypto metadata for future rotation
- `recoveryCodeHashes`: JSON array of hashed recovery codes
- `recoveryCodesGeneratedAt`: ISO timestamp
- `enabledAt`: ISO timestamp
- `updatedAt`: ISO timestamp
- `lastVerifiedAt`: ISO timestamp
- `emergencyRecoveryEnabled`: boolean string
- `emergencyRecoveryUsedAt`: ISO timestamp or empty

### User 2FA config

Store per-user 2FA data in isolated keys to avoid broad mutation of the user record.

Redis key:
- `user_2fa:<userId>`

Fields:
- `enabled`: boolean string
- `secretCiphertext`
- `secretIv`
- `secretVersion`
- `recoveryCodeHashes`: JSON array of hashed recovery codes
- `recoveryCodesGeneratedAt`
- `enabledAt`
- `updatedAt`
- `lastVerifiedAt`

### Pending login challenge

Store short-lived second-factor challenges separately from real sessions.

Redis keys:
- `admin_login_challenge:<token>`
- `user_login_challenge:<token>`

Fields:
- `subjectType`: `admin` or `user`
- `subjectId`: admin username or user id
- `username`
- `passwordValidatedAt`
- `attemptCount`
- `recoveryAttemptCount`
- `ip`
- `userAgent`
- `createdAt`

TTL:
- 5 minutes

Properties:
- Single-use
- Deleted on success
- Deleted when expired
- Deleted after too many failed second-factor attempts

### Recovery codes

Recovery codes are generated once at enable time and on explicit regeneration.

Rules:
- Generate 8 to 10 high-entropy one-time codes
- Display only once in plaintext
- Store only hashes
- Mark consumed codes as removed immediately after successful use

## Cryptography And Storage

### TOTP secret protection

- Generate a standard RFC 6238-compatible shared secret.
- Encrypt the secret at rest using a dedicated helper backed by `config.security.encryptionKey`.
- Do not log the plaintext secret, otpauth URI, recovery codes, or submitted TOTP values.

### Recovery code protection

- Store hashes only.
- Compare with constant-time safe comparison.
- Use per-code hashing with a server-side pepper derived from configuration or the same encryption key helper, rather than storing plaintext or reversible ciphertext.

## Backend Components

### New service

Add a dedicated service, expected path:
- `src/services/twoFactorService.js`

Responsibilities:
- Load and persist 2FA configs
- Generate TOTP secret and otpauth URI
- Generate QR payload for frontend
- Verify TOTP codes
- Generate and hash recovery codes
- Verify and consume recovery codes
- Create and validate pending login challenges
- Clear challenges after success or lockout
- Reset 2FA config for admins or users

This service should be the only place aware of the detailed 2FA storage format.

### Admin route changes

Modify `src/routes/web.js` to add:
- `POST /auth/login`
  - Return normal session if 2FA disabled
  - Return `requiresTwoFactor` challenge if enabled
- `POST /auth/2fa/verify`
- `GET /auth/2fa/status`
- `POST /auth/2fa/setup`
- `POST /auth/2fa/enable`
- `POST /auth/2fa/disable`
- `POST /auth/2fa/recovery-codes/regenerate`
- `POST /auth/2fa/reset-emergency`

### User route changes

Modify `src/routes/userRoutes.js` to add:
- `POST /login`
  - Return normal session if 2FA disabled
  - Return `requiresTwoFactor` challenge if enabled
- `POST /2fa/verify`
- `GET /2fa/status`
- `POST /2fa/setup`
- `POST /2fa/enable`
- `POST /2fa/disable`
- `POST /2fa/recovery-codes/regenerate`

### User service changes

Add focused helpers in `src/services/userService.js` only where needed:
- Invalidate all sessions for a given user
- Expose user identity details required for 2FA reset paths

Keep 2FA logic itself inside `twoFactorService` instead of expanding `userService` unnecessarily.

### Admin reset of user 2FA

Add an admin-only endpoint under existing user-management/admin routes to:
- Reset a specific user's 2FA config
- Invalidate that user's active sessions
- Emit a security log

This should live close to existing user management routes, not inside generic auth middleware.

## Authentication Flows

### Admin login

1. Client submits username and password to `POST /web/auth/login`.
2. Server validates credentials.
3. If invalid, return existing failure semantics.
4. If valid and 2FA disabled:
   - Create real admin session.
   - Return `{ success: true, token, username, expiresIn }`.
5. If valid and 2FA enabled:
   - Create pending challenge.
   - Return:
     - `success: true`
     - `requiresTwoFactor: true`
     - `pendingLoginToken`
     - `pendingLoginExpiresIn`
     - `canUseRecoveryCode: true`
6. Client submits challenge token and code to `POST /web/auth/2fa/verify`.
7. Server verifies TOTP or recovery code.
8. On success:
   - Delete challenge
   - Create real admin session
   - Return the real session token

### User login

1. Client submits username and password to `POST /users/login`.
2. Server performs existing LDAP authentication.
3. If LDAP auth fails, return current failure response.
4. If auth succeeds and 2FA disabled:
   - Keep current success behavior
   - Return real user session
5. If auth succeeds and 2FA enabled:
   - Create pending challenge
   - Return `requiresTwoFactor` response
6. Client submits second factor to `POST /users/2fa/verify`.
7. Server verifies code and then issues the real user session.

### Setup flow

Setup must not enable 2FA immediately.

1. Authenticated user/admin requests `POST .../2fa/setup`.
2. Server requires fresh credential confirmation:
   - Admin: current password
   - User: current LDAP password
3. Server creates a temporary setup secret and returns:
   - `secret`
   - `otpauthUrl`
   - QR code data or SVG payload
4. Client asks the user to scan and enter one current TOTP code.
5. Client submits to `POST .../2fa/enable` with:
   - current password or LDAP password
   - TOTP code
   - setup token or temporary setup id
6. Server verifies all inputs and only then:
   - persists the encrypted secret
   - generates recovery codes
   - marks 2FA enabled
   - invalidates all existing sessions for that account, including the current session
7. Client shows recovery codes once and asks the user to save them.
8. After the success response is displayed, the client redirects to the appropriate login page and requires a fresh login using 2FA.

### Disable flow

1. Authenticated user/admin submits:
   - current password or LDAP password
   - either a valid TOTP code or a recovery code
2. Server verifies both factors.
3. Server removes stored 2FA config.
4. Server invalidates all existing sessions for that account, including the current session.
5. Client redirects to login after showing the success message.

### Recovery code regeneration

1. Authenticated user/admin submits:
   - current password or LDAP password
   - valid TOTP code or a remaining recovery code
2. Server verifies both.
3. Server replaces all stored recovery code hashes with a newly generated set.
4. Server returns plaintext recovery codes once.
5. Server invalidates all existing sessions for that account, including the current session, and the client redirects to login after the codes are acknowledged.

### Admin reset of user 2FA

1. Admin chooses a user from the management UI.
2. Admin confirms reset action.
3. Server deletes `user_2fa:<userId>`.
4. Server invalidates all sessions for that user.
5. User can log in again with only LDAP username/password until 2FA is re-enabled.

### Admin emergency recovery

Emergency recovery is allowed only through explicit local server-side state, not a permanently exposed public bypass.

Rules:
- Recovery requires a local operator to modify `data/init.json` or set a clearly named one-time recovery flag consumed by the server.
- The flag enables a narrow path allowing the admin to log in and reset admin 2FA.
- The flag must be one-time-use and cleared immediately after successful recovery.
- This path must be audited in logs.

Exact storage can be decided during implementation, but it must remain local-only in spirit and must not become a standing remote backdoor.

## Security Controls

### Core anti-bypass rules

- Real sessions are never created before second-factor verification succeeds.
- Pending login challenges cannot be used as authenticated bearer tokens.
- `authenticateAdmin` and `authenticateUser` accept only real sessions, never challenge tokens.
- Challenge tokens are high entropy, single-use, and short-lived.
- Challenge tokens are bound to the authenticated identity from stage 1 and should also record IP and user agent for audit and possible enforcement.
- Challenge verification attempts are limited. After the limit, the challenge is destroyed and login must restart.
- Recovery codes are one-time only.
- Sensitive 2FA state changes require fresh credential confirmation, not just an existing session.

### Error handling

- Keep login failure messages generic enough to avoid account enumeration.
- It is acceptable after successful password validation to tell the client that 2FA is required, because at that point the password has already been proven.
- Do not expose whether a specific recovery code index was valid or invalid.

### Logging

Emit security logs for:
- Failed admin and user login attempts
- Successful second-factor verification
- Recovery-code login
- 2FA enable
- 2FA disable
- Recovery-code regeneration
- Admin reset of user 2FA
- Admin emergency recovery

Logs must not include secrets, plaintext recovery codes, or TOTP values.

### Session invalidation policy

The following actions invalidate all other sessions for the affected account:
- Enabling 2FA
- Disabling 2FA
- Regenerating recovery codes
- Admin reset of a user's 2FA

This reduces the risk of a stolen existing session silently surviving a security posture change.

For enable, disable, and recovery-code regeneration, the current session is also invalidated after the server returns the success payload.

## Frontend Design

### Admin login view

Update `web/admin-spa/src/views/LoginView.vue` to support two states:
- Password step
- Second-factor step

Behavior:
- On normal success without 2FA, keep current redirect behavior.
- On `requiresTwoFactor`, switch to the verification panel without leaving the page.
- Allow toggling between TOTP entry and recovery-code entry.
- Allow canceling back to the password step, which clears the pending login token client-side.

### User login view

Update `web/admin-spa/src/views/UserLoginView.vue` with the same two-step interaction model adapted to the user flow.

### Admin settings

Add a dedicated security section in `web/admin-spa/src/views/SettingsView.vue` for:
- 2FA enabled/disabled status
- Start setup
- Confirm setup
- Disable 2FA
- Regenerate recovery codes
- Emergency recovery state display if useful for local operator visibility

### User self-service area

Add a 2FA management block in `web/admin-spa/src/views/UserDashboardView.vue` for:
- 2FA status
- Setup flow
- Disable flow
- Recovery-code regeneration

### User management

Add an admin action in the existing user management UI:
- Reset user 2FA

### Frontend state handling

- Admin auth store and user auth store must understand `requiresTwoFactor` responses.
- They must not set authenticated state until the second factor succeeds.
- Pending challenge state should be stored in memory, not long-term local storage, unless there is a strong implementation reason otherwise.

## API Contracts

### Login success without 2FA

Admin:
```json
{
  "success": true,
  "token": "<real-session-token>",
  "expiresIn": 86400000,
  "username": "admin"
}
```

User:
```json
{
  "success": true,
  "message": "Login successful",
  "user": {},
  "sessionToken": "<real-session-token>"
}
```

### Login success requiring 2FA

```json
{
  "success": true,
  "requiresTwoFactor": true,
  "pendingLoginToken": "<pending-token>",
  "pendingLoginExpiresIn": 300000,
  "canUseRecoveryCode": true
}
```

### 2FA verify success

Admin:
```json
{
  "success": true,
  "token": "<real-session-token>",
  "expiresIn": 86400000,
  "username": "admin"
}
```

User:
```json
{
  "success": true,
  "message": "Login successful",
  "user": {},
  "sessionToken": "<real-session-token>"
}
```

### Status response

```json
{
  "success": true,
  "twoFactor": {
    "enabled": true,
    "recoveryCodesGeneratedAt": "2026-03-29T12:00:00.000Z"
  }
}
```

## Testing Strategy

Follow TDD for each behavior.

### Backend tests

Add focused tests for:
- Admin login without 2FA remains unchanged
- Admin login with 2FA returns pending token instead of real session
- Admin second-factor success issues real session
- Admin challenge reuse fails
- Admin expired challenge fails
- Admin recovery code succeeds once and then fails on reuse
- User login without 2FA remains unchanged
- User login with 2FA returns pending token after LDAP success
- User second-factor success issues real session
- Setup flow does not enable 2FA before verification
- Enable flow requires fresh password or LDAP password confirmation
- Disable flow requires fresh credential confirmation plus second factor
- Regenerated recovery codes invalidate previous codes
- Pending tokens cannot access authenticated routes
- Admin reset of user 2FA deletes config and invalidates user sessions
- Emergency recovery path is disabled by default and one-time when enabled

Where possible, keep tests near existing auth-related test patterns and avoid building broad integration harnesses unless necessary.

### Frontend tests

At minimum cover:
- Login view transitions into second-factor state
- Auth stores do not mark the user/admin authenticated on `requiresTwoFactor`
- Verification success stores the real token and redirects
- Canceling second-factor entry clears pending challenge state
- 2FA management UI renders status and handles enabled/disabled transitions

### Manual verification

Before completion, manually test:
- Admin enable, logout, relogin with TOTP
- User enable, logout, relogin with TOTP
- Recovery code login for both
- Disable flow for both
- User 2FA reset by admin
- Attempted access to protected routes using a pending token

## Merge-Conflict Minimization

To reduce future upstream merge pain:

- Add a dedicated `twoFactorService` rather than scattering logic across many files.
- Store 2FA data in isolated Redis keys.
- Keep route changes localized to the existing login and settings endpoints.
- Avoid large refactors in auth middleware.
- Avoid rewriting existing session formats for non-2FA users.
- Prefer new frontend subcomponents for reusable 2FA UI instead of bloating existing views more than necessary.

Likely touched files:
- `src/routes/web.js`
- `src/routes/userRoutes.js`
- `src/services/userService.js`
- `src/routes/admin/*` for user reset endpoint
- `web/admin-spa/src/views/LoginView.vue`
- `web/admin-spa/src/views/UserLoginView.vue`
- `web/admin-spa/src/views/SettingsView.vue`
- `web/admin-spa/src/views/UserDashboardView.vue`
- new small shared frontend 2FA components and API helpers

## Open Implementation Choices

The implementation phase must resolve these bounded choices without changing the approved behavior:

- Exact TOTP library choice
- Exact QR-code generation method
- Exact crypto helper shape for secret encryption

These choices do not alter the feature contract so long as the security constraints above remain intact.

## Success Criteria

The feature is complete when:
- Admins can optionally enable TOTP 2FA and are required to complete it on next login.
- LDAP users can optionally enable TOTP 2FA and are required to complete it on next login.
- Recovery codes work once each.
- Admins can reset a user's 2FA.
- Admin emergency recovery exists, is local-only in spirit, and is not enabled by default.
- No protected route accepts a pre-2FA challenge token.
- Existing non-2FA users continue to log in without regression.
- Automated and manual verification cover the anti-bypass paths.
