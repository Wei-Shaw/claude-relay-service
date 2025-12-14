# Popup Effects - Design System Recommendations

**Date**: December 15, 2025  
**Status**: ✅ Implemented  
**Project**: Vue 3 Admin SPA - Claude Relay Service

---

## 🎯 Overview

This document outlines the standardized approach to popup effects (toasts, modals, tooltips) in alignment with the Vercel-inspired design system.

---

## ✅ 1. Toast Notifications - ONLY Sonner

### Current Implementation

**✅ Using Sonner Toast Library**
- Location: `web/admin-spa/src/components/ui/Toaster.vue`
- Utility: `web/admin-spa/src/utils/toast.js`
- Integration: App.vue (global component)

### Configuration

```vue
<!-- App.vue -->
<Toaster position="top-right" />
```

```javascript
// Usage in any component
import { showToast } from '@/utils/toast'

showToast('Operation successful', 'success')
showToast('Error occurred', 'error')
showToast('Warning message', 'warning')
showToast('Info message', 'info')
```

### Features

✅ **Automatic dark mode support** via theme store
✅ **Consistent styling** with Vercel design system
✅ **Position**: top-right (z-index: 9999)
✅ **Duration**: 5000ms default (configurable)
✅ **Animation**: Smooth slide-in from right
✅ **Close button**: Included by default
✅ **Icons**: FontAwesome icons for each type

### What Was Removed

❌ **Removed**: Custom `ToastNotification.vue` component
- Reason: Duplicate functionality, inconsistent with Sonner
- Replacement: Sonner toast via `showToast()` utility

---

## ✅ 2. Modal Backdrops - No Blur Effects

### Design Principle

**From MIGRATION_PROGRESS.md:**
> "✅ Removed blur effects - Simple rgba background overlay (no blur)"

### Standard Modal Backdrop

```css
/* ✅ CORRECT - Simple overlay */
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  z-index: var(--z-modal-backdrop); /* 40 */
}

.dark .modal-backdrop {
  background: rgba(0, 0, 0, 0.6);
}
```

```css
/* ❌ WRONG - No blur effects */
.modal-backdrop {
  backdrop-filter: blur(4px); /* REMOVED */
}
```

### Fixed Components

✅ **ConfirmDialog.vue** - Removed `backdrop-filter: blur(4px)`
✅ **NewApiKeyModal.vue** - Removed `backdrop-filter: blur(4px)`
✅ **components.css** - Removed `backdrop-filter: blur(4px)` from `.modal`

### Modal Animation

```css
/* Simple, clean animation (0.2s) */
@keyframes dialog-appear {
  from {
    opacity: 0;
    transform: scale(0.96) translateY(8px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.modal-content {
  animation: dialog-appear 0.2s ease-out;
}
```

---

## ✅ 3. Tooltips - Standardized Approach

### Current Implementation Status

The project uses **3 types** of tooltips:

#### A. Element Plus Tooltips (Recommended Primary)

**Usage:**
```vue
<el-tooltip content="Tooltip text" placement="top">
  <button>Hover me</button>
</el-tooltip>
```

**Pros:**
- ✅ Built-in accessibility (ARIA attributes)
- ✅ Configurable placement (top, bottom, left, right)
- ✅ Dark mode support
- ✅ Consistent with Element Plus components
- ✅ Already integrated across the codebase

**Current Usage:**
- `AccountsView.vue` - Account statistics tooltips
- `ApiKeysView.vue` - Cost sorting tooltips
- `WindowCountdown.vue` - Window state tooltips

#### B. CSS-Only Tooltips (Design Demo)

**From DesignDemoView.vue:**
```css
.tooltip {
  position: relative;
}

.tooltip::after {
  content: attr(data-tooltip);
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%) translateY(-0.5rem);
  background: #000;
  color: white;
  padding: 0.5rem 0.75rem;
  border-radius: 4px;
  font-size: 0.8125rem;
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s;
}

.tooltip:hover::after {
  opacity: 1;
}
```

**Usage:**
```html
<button class="btn tooltip" data-tooltip="This is a tooltip">
  Hover me
</button>
```

**Pros:**
- ✅ Zero JavaScript overhead
- ✅ Simple implementation
- ✅ Clean design matching Vercel style

**Cons:**
- ❌ No accessibility (no ARIA)
- ❌ Limited positioning options
- ❌ No advanced features (delays, triggers)

#### C. Chart.js Tooltips

**Configuration in `useChartConfig.js`:**
```javascript
Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(0, 0, 0, 0.8)'
Chart.defaults.plugins.tooltip.padding = 12
Chart.defaults.plugins.tooltip.cornerRadius = 8
Chart.defaults.plugins.tooltip.titleFont.size = 14
Chart.defaults.plugins.tooltip.bodyFont.size = 12
```

**Pros:**
- ✅ Optimized for chart interactions
- ✅ Already configured globally
- ✅ Matches design system colors

### Recommendations

#### **Primary: Use Element Plus Tooltips**

For most UI elements (buttons, icons, form inputs):
```vue
<el-tooltip content="Helpful hint" effect="dark" placement="bottom">
  <button class="btn">Action</button>
</el-tooltip>
```

**Rationale:**
- Accessibility built-in
- Consistent behavior
- Already integrated
- Professional quality

#### **Secondary: CSS Tooltips for Simple Cases**

For inline text or when you need minimal overhead:
```html
<span class="tooltip" data-tooltip="Quick hint">
  hover text
</span>
```

**Use when:**
- No accessibility requirements (decorative only)
- Simple inline hints
- Performance-critical areas

#### **Keep: Chart.js Tooltips**

Already optimized for charts - no changes needed.

---

## ✅ 4. Animation Patterns - Standardized

### Design Principles

**From Design System:**
- **Duration**: 0.2s for most transitions (matches Vercel)
- **Easing**: `ease` or `ease-out`
- **Scale transforms**: Subtle (0.96 → 1.0, not 0.8 → 1.0)
- **No fancy effects**: No spring animations, no bounces

### Standard Animations

#### Modal Entry

```css
@keyframes dialog-appear {
  from {
    opacity: 0;
    transform: scale(0.96) translateY(8px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

/* Apply with */
animation: dialog-appear 0.2s ease-out;
```

#### Toast Entry

```css
@keyframes slide-in-right {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

/* Apply with */
animation: slide-in-right 0.2s ease;
```

#### Loading Spinner

```css
@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

/* Apply with */
animation: spin 1s linear infinite;
```

#### Hover Transitions

```css
/* Simple color transitions */
.button {
  transition: all 0.2s ease;
}

/* Transform on hover - subtle scale only */
.card:hover {
  transform: scale(1.02); /* Max 1.05 */
  transition: transform 0.2s ease;
}
```

### Animation Don'ts

❌ **No backdrop-filter blur** - Performance issue, not in design system
❌ **No long durations** - Keep under 0.3s (except loaders)
❌ **No spring/bounce easings** - Too playful, not Vercel style
❌ **No excessive transforms** - Scale changes should be < 10%
❌ **No gradient animations** - Removed from design system

---

## 📊 Z-Index System

### Defined in tokens.css

```css
--z-base: 1;
--z-dropdown: 10;
--z-sticky: 20;
--z-fixed: 30;
--z-modal-backdrop: 40;
--z-modal: 50;
--z-tooltip: 60;
--z-toast: 100;
```

### Usage Guidelines

**✅ CORRECT:**
```css
.modal-backdrop {
  z-index: var(--z-modal-backdrop); /* 40 */
}

.modal-content {
  z-index: var(--z-modal); /* 50 */
}

.toast-container {
  z-index: var(--z-toast); /* 100 */
}
```

**❌ WRONG:**
```css
/* Arbitrary values - DO NOT USE */
z-index: 999999;
z-index: 9999;
z-index: 1050;
```

### Current Violations

Found in codebase:
- `AppHeader.vue` line 64: `z-index: 999999` - Should use `var(--z-toast)` or lower
- Multiple modals using `z-[1050]` - Should use `var(--z-modal)`

**Action Required:**
Replace all hardcoded z-index values with token variables.

---

## 🛠️ Implementation Checklist

### Completed ✅

- [x] Remove custom ToastNotification.vue
- [x] Verify Sonner toast is working globally
- [x] Remove all `backdrop-filter: blur()` from modals
  - [x] ConfirmDialog.vue
  - [x] NewApiKeyModal.vue
  - [x] components.css
- [x] Document tooltip strategy
- [x] Document animation standards
- [x] Document z-index system

### Recommended Next Steps

- [ ] Replace hardcoded z-index values with tokens
  - [ ] AppHeader.vue (line 64: 999999 → var(--z-toast))
  - [ ] All modals using z-[1050] → var(--z-modal)
  - [ ] All modals using z-50 → var(--z-modal)
- [ ] Create a Tooltip component wrapper (optional)
  - Standardize Element Plus tooltip usage
  - Provide consistent props/API
- [ ] Add ESLint rule to prevent backdrop-filter usage
  - Flag any new backdrop-filter in components
  - Enforce z-index token usage

---

## 📚 References

- **Design System Summary**: `/DESIGN_SYSTEM_SUMMARY.md`
- **Migration Progress**: `/MIGRATION_PROGRESS.md`
- **Design Tokens**: `/web/admin-spa/src/assets/styles/tokens.css`
- **Design Demo**: `/web/admin-spa/src/ui/__demo__/DesignDemoView.vue`
- **Sonner Toast**: `/web/admin-spa/src/components/ui/Toaster.vue`
- **Toast Utility**: `/web/admin-spa/src/utils/toast.js`

---

## 🎓 Key Takeaways

### What Changed

1. **Toast System**: Consolidated to Sonner only (removed custom component)
2. **Modal Backdrops**: Removed all blur effects (performance + design)
3. **Tooltips**: Clarified strategy (Element Plus primary, CSS secondary)
4. **Animations**: Standardized to 0.2s ease transitions
5. **Z-Index**: Documented token system for consistency

### Why It Matters

**Before:**
- 2 toast systems (confusion)
- Blur effects (performance issues)
- Inconsistent tooltips
- Random z-index values

**After:**
- 1 toast system (clear, consistent)
- Clean backdrops (better performance)
- Clear tooltip strategy
- Token-based z-index (maintainable)

### Design Principles

This cleanup aligns with Vercel-inspired design:
- **Clarity over flash**: Simple, clean effects
- **Performance**: No expensive blur operations
- **Consistency**: One way to do things
- **Maintainability**: Token-based values

---

**Status**: ✅ Core implementation complete. Optional improvements documented above.
