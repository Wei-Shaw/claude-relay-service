# Component Migration Checklist

Quick reference for migrating each component from the old design to the new Vercel-inspired design.

## ✅ = Ready to migrate | 🚧 = In progress | ✔️ = Completed

---

## Phase 1: Design System Foundation ✔️ COMPLETED

### Global Styles
- [x] `web/admin-spa/src/assets/styles/global.css` - Update CSS variables
- [x] `web/admin-spa/src/assets/styles/main.css` - Remove gradients and glass effects
- [x] `web/admin-spa/src/assets/styles/components.css` - Rewrite component base styles
- [x] `web/admin-spa/src/assets/styles/variables.css` - Update color tokens

---

## Phase 2: Common Components (Priority: HIGH) ✔️ COMPLETED

### Buttons & Actions
- [x] All `btn-primary` classes → Solid black background (via components.css)
- [x] All `btn-secondary` classes → White background with border (via components.css)
- [x] All `btn-danger` classes → Solid red background (via components.css)
- [x] Remove all `btn-ghost` gradient effects → Transparent with hover (via components.css)

### Badges
- [x] Update all badge components to bordered style (via components.css)
- [ ] `components/apikeys/LimitBadge.vue` (pending - Phase 5)

### Cards
- [x] `components/common/StatCard.vue` → Remove gradient icon backgrounds
- [x] All card components → Remove glass effects, use solid backgrounds (via components.css)

### Forms
- [x] All input fields → Remove glass backgrounds (via components.css)
- [x] All select dropdowns → Flat style (via components.css)
- [x] All textareas → Flat style (via components.css)
- [x] Toggle switches → Black/white style (via components.css)
- [x] Checkboxes/radios → Accent color black (via components.css)

### Notifications
- [x] `components/common/ToastNotification.vue` → Flat colored backgrounds
- [x] `components/common/ConfirmDialog.vue` → Clean modal style
- [x] `components/common/ConfirmModal.vue` → Clean modal style

### Navigation
- [x] `components/layout/TabBar.vue` → Bottom border active indicator (via components.css)
- [x] Remove all tab gradient backgrounds (via components.css)

### Utilities
- [x] `components/common/ThemeToggle.vue` → Simple toggle design
- [x] `components/common/LogoTitle.vue` → Remove gradient text
- [ ] `components/common/ActionDropdown.vue` → Flat dropdown (uses global styles)
- [ ] `components/common/CustomDropdown.vue` → Flat dropdown (uses global styles)
- [ ] `components/common/AccountSelector.vue` → Flat style (uses global styles)

---

## Phase 3: Layout Components (Priority: HIGH)

- [ ] `components/layout/MainLayout.vue`
  - Remove `.glass-strong` class
  - Remove rounded corners
  - Solid white background
  - 1px border

- [ ] `components/layout/AppHeader.vue`
  - Remove gradient backgrounds
  - Clean black/white design
  - Simple divider line

- [ ] `components/layout/TabBar.vue`
  - Horizontal tabs with bottom border indicator
  - Remove gradient active state

---

## Phase 4: View Pages (Priority: MEDIUM)

### Dashboard
- [ ] `views/DashboardView.vue`
  - Update stat cards grid (1px borders between)
  - Remove gradient stat icons
  - Clean typography
  - Flat charts

### API Keys
- [ ] `views/ApiKeysView.vue`
  - Flat table design
  - Ghost action buttons
  - New badge system
  - Clean search input

### Accounts
- [ ] `views/AccountsView.vue`
  - Same changes as ApiKeysView
  - Flat status indicators

### Stats
- [ ] `views/ApiStatsView.vue`
  - Clean charts
  - Flat card design

### Usage Records
- [ ] `views/ApiKeyUsageRecordsView.vue`
  - Flat table
  - Clean filters

- [ ] `views/AccountUsageRecordsView.vue`
  - Flat table
  - Clean filters

### Settings
- [ ] `views/SettingsView.vue`
  - Clean form layouts
  - Flat inputs
  - Simple sections

### Tutorial
- [ ] `views/TutorialView.vue`
  - Clean content cards
  - Simple code blocks

### User Views
- [ ] `views/UserDashboardView.vue`
- [ ] `views/UserLoginView.vue`
- [ ] `views/UserManagementView.vue`

### Login
- [ ] `views/LoginView.vue`
  - Clean centered form
  - Flat inputs
  - Black button

---

## Phase 5: API Keys Components (Priority: MEDIUM)

### Modals
- [ ] `components/apikeys/CreateApiKeyModal.vue`
- [ ] `components/apikeys/EditApiKeyModal.vue`
- [ ] `components/apikeys/NewApiKeyModal.vue`
- [ ] `components/apikeys/RenewApiKeyModal.vue`
- [ ] `components/apikeys/BatchApiKeyModal.vue`
- [ ] `components/apikeys/BatchEditApiKeyModal.vue`
- [ ] `components/apikeys/ExpiryEditModal.vue`
- [ ] `components/apikeys/ApiKeyTestModal.vue`
- [ ] `components/apikeys/UsageDetailModal.vue`
- [ ] `components/apikeys/RecordDetailModal.vue`

**Changes for all modals:**
- Remove glass effect backgrounds
- White background with 1px border
- Border-radius: 5px
- Clean header with optional divider
- Flat buttons in footer

### Display Components
- [ ] `components/apikeys/LimitProgressBar.vue`
  - Flat progress bar
  - #eaeaea background, #000 fill

- [ ] `components/apikeys/WindowLimitBar.vue`
  - Same as LimitProgressBar

- [ ] `components/apikeys/WindowCountdown.vue`
  - Clean typography
  - Simple countdown display

---

## Phase 5: Account Components (Priority: MEDIUM)

- [ ] `components/accounts/AccountForm.vue`
  - Flat inputs
  - Clean sections
  - Simple validation

- [ ] `components/accounts/CcrAccountForm.vue`
  - Same as AccountForm

- [ ] `components/accounts/OAuthFlow.vue`
  - Clean step indicators
  - Flat buttons
  - Simple instructions

- [ ] `components/accounts/ProxyConfig.vue`
  - Flat inputs
  - Clean layout

- [ ] `components/accounts/AccountTestModal.vue`
- [ ] `components/accounts/AccountUsageDetailModal.vue`
- [ ] `components/accounts/AccountExpiryEditModal.vue`
- [ ] `components/accounts/ApiKeyManagementModal.vue`
- [ ] `components/accounts/GroupManagementModal.vue`

---

## Phase 5: API Stats Components (Priority: LOW)

- [ ] `components/apistats/StatsOverview.vue`
  - Flat stat cards
  - Clean grid

- [ ] `components/apistats/ModelUsageStats.vue`
  - Simple charts
  - Flat cards

- [ ] `components/apistats/TokenDistribution.vue`
  - Clean chart
  - Black/white color scheme

- [ ] `components/apistats/AggregatedStatsCard.vue`
  - Flat card design

- [ ] `components/apistats/ApiKeyInput.vue`
  - Flat input

- [ ] `components/apistats/LimitConfig.vue`
  - Flat form

---

## Phase 5: Dashboard Components (Priority: LOW)

- [ ] `components/dashboard/UsageTrend.vue`
  - Simple line chart
  - Black/white color scheme

- [ ] `components/dashboard/ModelDistribution.vue`
  - Clean pie/bar chart
  - Minimal colors

---

## Phase 5: User Components (Priority: LOW)

- [ ] `components/user/CreateApiKeyModal.vue`
- [ ] `components/user/ViewApiKeyModal.vue`
- [ ] `components/user/UserApiKeysManager.vue`
- [ ] `components/user/UserUsageStats.vue`

---

## Phase 5: Admin Components (Priority: LOW)

- [ ] `components/admin/ChangeRoleModal.vue`
- [ ] `components/admin/UserUsageStatsModal.vue`

---

## Phase 6: Dark Mode Refinement

- [ ] Test all components in dark mode
- [ ] Verify color contrast ratios
- [ ] Ensure borders are visible
- [ ] Check all hover states
- [ ] Validate all text is readable

---

## Phase 7: Responsive Testing

### Mobile Breakpoints (max-width: 768px)
- [ ] Test all views on mobile
- [ ] Verify stat cards stack vertically
- [ ] Check table responsiveness
- [ ] Test modal sizes
- [ ] Verify navigation works
- [ ] Check form layouts

### Tablet Breakpoints (768px - 1024px)
- [ ] Test all views on tablet
- [ ] Verify grid layouts
- [ ] Check navigation

### Desktop (>1024px)
- [ ] Verify all layouts look good
- [ ] Check max-widths

---

## Phase 8: Quality Assurance

### Visual QA
- [ ] No gradients anywhere
- [ ] No glass/blur effects
- [ ] All borders 0-5px radius
- [ ] Consistent spacing
- [ ] Clean typography
- [ ] Proper color usage

### Functional QA
- [ ] All buttons work
- [ ] All forms submit correctly
- [ ] All modals open/close
- [ ] All dropdowns work
- [ ] Theme toggle works
- [ ] Navigation works

### Browser Testing
- [ ] Chrome
- [ ] Firefox
- [ ] Safari
- [ ] Edge
- [ ] Mobile Safari
- [ ] Chrome Mobile

### Accessibility
- [ ] Keyboard navigation
- [ ] Screen reader friendly
- [ ] Proper ARIA labels
- [ ] Color contrast (WCAG AA)
- [ ] Focus indicators visible

---

## Quick Reference: Common Changes

### Remove These Patterns
```vue
<!-- OLD -->
<div class="glass-strong rounded-xl shadow-xl">
<button class="btn-primary bg-gradient-to-br from-blue-500 to-purple-500">
<div class="stat-icon bg-gradient-to-br from-green-500 to-emerald-500">

<!-- NEW -->
<div class="card">
<button class="btn btn-primary">
<div class="stat-icon">
```

### Update These Styles
```css
/* OLD */
.btn-primary {
  background: linear-gradient(135deg, var(--primary-color) 0%, var(--secondary-color) 100%);
  box-shadow: 0 10px 15px -3px rgba(102, 126, 234, 0.3);
  border-radius: 12px;
}

/* NEW */
.btn-primary {
  background: #000;
  border: 1px solid #000;
  border-radius: 5px;
  color: white;
}
```

---

## Progress Tracking

**Total Components**: ~55
**Completed**: 6 (StatCard, ToastNotification, ConfirmDialog, ConfirmModal, LogoTitle, ThemeToggle)
**In Progress**: 0
**Remaining**: ~49

**Phases Complete**: 2/8 (Phase 1: Foundation ✔️, Phase 2: Common Components ✔️)

---

**Start Date**: TBD
**Target Completion**: TBD
**Last Updated**: 2025-12-13
