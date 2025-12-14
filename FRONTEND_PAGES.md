# Frontend Pages Documentation

## Overview

The frontend has **12 pages** (Vue files) organized into three main categories.

---

## 📄 Pages List

### Public Pages (No Authentication Required)

| # | Page | Route | Vue File |
|---|------|-------|----------|
| 1 | API Stats | `/api-stats` | `ApiStatsView.vue` |

### Authentication Pages

| # | Page | Route | Vue File |
|---|------|-------|----------|
| 2 | Admin Login | `/login` | `LoginView.vue` |
| 3 | User Login | `/user-login` | `UserLoginView.vue` |

### Admin Pages (Requires Admin Auth)

| # | Page | Route | Vue File |
|---|------|-------|----------|
| 4 | Dashboard | `/dashboard` | `DashboardView.vue` |
| 5 | API Keys Management | `/api-keys` | `ApiKeysView.vue` |
| 6 | API Key Usage Records | `/api-keys/:keyId/usage-records` | `ApiKeyUsageRecordsView.vue` |
| 7 | Accounts Management | `/accounts` | `AccountsView.vue` |
| 8 | Account Usage Records | `/accounts/:accountId/usage-records` | `AccountUsageRecordsView.vue` |
| 9 | Tutorial | `/tutorial` | `TutorialView.vue` |
| 10 | Settings | `/settings` | `SettingsView.vue` |
| 11 | User Management | `/user-management` | `UserManagementView.vue` |

### User Pages (Requires User Auth)

| # | Page | Route | Vue File |
|---|------|-------|----------|
| 12 | User Dashboard | `/user-dashboard` | `UserDashboardView.vue` |

---

## 🧩 Components

The frontend also has **50 reusable components** organized by feature:

### Layout Components (3)
- `MainLayout.vue` - Main application layout wrapper
- `AppHeader.vue` - Application header/navigation
- `TabBar.vue` - Tab navigation component

### Common Components (9)
- `AccountSelector.vue` - Account selection dropdown
- `ActionDropdown.vue` - Action menu dropdown
- `ConfirmDialog.vue` - Confirmation dialog
- `ConfirmModal.vue` - Confirmation modal
- `CustomDropdown.vue` - Custom dropdown component
- `LogoTitle.vue` - Logo and title display
- `StatCard.vue` - Statistics card
- `ThemeToggle.vue` - Theme switcher (dark/light mode)
- `ToastNotification.vue` - Toast notification component

### API Keys Components (14)
- `ApiKeyTestModal.vue` - Test API key functionality
- `BatchApiKeyModal.vue` - Batch create API keys
- `BatchEditApiKeyModal.vue` - Batch edit API keys
- `CreateApiKeyModal.vue` - Create single API key
- `EditApiKeyModal.vue` - Edit API key
- `ExpiryEditModal.vue` - Edit API key expiry
- `LimitBadge.vue` - Display limit badge
- `LimitProgressBar.vue` - Progress bar for limits
- `NewApiKeyModal.vue` - New API key modal
- `RecordDetailModal.vue` - Usage record details
- `RenewApiKeyModal.vue` - Renew API key
- `UsageDetailModal.vue` - Usage details
- `WindowCountdown.vue` - Time window countdown
- `WindowLimitBar.vue` - Window limit progress bar

### Accounts Components (8)
- `AccountExpiryEditModal.vue` - Edit account expiry
- `AccountForm.vue` - Account form
- `AccountTestModal.vue` - Test account
- `AccountUsageDetailModal.vue` - Account usage details
- `ApiKeyManagementModal.vue` - Manage account API keys
- `CcrAccountForm.vue` - CCR account form
- `GroupManagementModal.vue` - Manage account groups
- `OAuthFlow.vue` - OAuth authentication flow
- `ProxyConfig.vue` - Proxy configuration

### API Stats Components (6)
- `AggregatedStatsCard.vue` - Aggregated statistics card
- `ApiKeyInput.vue` - API key input field
- `LimitConfig.vue` - Limit configuration
- `LimitConfig.REFACTORED.vue` - Refactored limit config
- `ModelUsageStats.vue` - Model usage statistics
- `StatsOverview.vue` - Statistics overview
- `TokenDistribution.vue` - Token distribution chart

### Dashboard Components (2)
- `ModelDistribution.vue` - Model distribution chart
- `UsageTrend.vue` - Usage trend chart

### Admin Components (2)
- `ChangeRoleModal.vue` - Change user role
- `UserUsageStatsModal.vue` - User usage statistics

### User Components (4)
- `CreateApiKeyModal.vue` - User create API key
- `UserApiKeysManager.vue` - User API keys management
- `UserUsageStats.vue` - User usage statistics
- `ViewApiKeyModal.vue` - View API key details

### Other
- `.gitkeep` - Git placeholder file

---

## Summary

- **Total Pages (Views):** 12 Vue files
- **Total Components:** 50 Vue files
- **Total Vue Files:** 62 files
- **Views Location:** `web/admin-spa/src/views/`
- **Components Location:** `web/admin-spa/src/components/`
- **Router Configuration:** `web/admin-spa/src/router/index.js`

### Views By Category
- Public: 1 page
- Authentication: 2 pages  
- Admin: 8 pages
- User: 1 page

### Components By Category
- Layout: 3 components
- Common: 9 components
- API Keys: 14 components
- Accounts: 8 components
- API Stats: 6 components
- Dashboard: 2 components
- Admin: 2 components
- User: 4 components
