# Design System - Quick Start Guide

**⏱️ 5-minute read** | **🎯 Get productive immediately**

---

## What Changed?

We've refactored the frontend from ad-hoc Tailwind to a strict Design System.

**Before:**
```vue
<!-- ❌ OLD: Raw Tailwind everywhere -->
<div class="h-2 w-full rounded-full bg-gray-200 dark:bg-gray-700">
  <div class="h-2 rounded-full bg-blue-500" :style="{ width: '75%' }" />
</div>
```

**After:**
```vue
<!-- ✅ NEW: Reusable component -->
<Progress :value="75" variant="success" />
```

---

## 🚀 Getting Started

### 1. Import from `@/ui`

```vue
<script setup>
// ✅ Always import from here
import { Button, Progress, Badge, Alert, Card } from '@/ui'
</script>
```

### 2. Use Components

```vue
<template>
  <!-- Progress bars -->
  <Progress :value="percentage" variant="success" size="md" />
  
  <!-- Buttons -->
  <Button variant="primary" @click="save">Save</Button>
  <Button variant="danger" :loading="isSaving">Delete</Button>
  
  <!-- Badges -->
  <Badge variant="success">Active</Badge>
  <Badge variant="error">Error</Badge>
  
  <!-- Alerts -->
  <Alert variant="info">Information message</Alert>
  
  <!-- Cards -->
  <Card hoverable>
    <template #header><h3>Title</h3></template>
    Content here
  </Card>
</template>
```

### 3. Remove Raw Tailwind

**Don't do this anymore:**
```vue
<!-- ❌ WRONG - No more raw Tailwind in your components -->
<div class="h-2 rounded-full bg-blue-500">...</div>
<button class="bg-black text-white rounded px-4 py-2">Click</button>
```

**Do this instead:**
```vue
<!-- ✅ CORRECT - Use Design System -->
<Progress :value="50" variant="default" />
<Button variant="primary">Click</Button>
```

---

## 📦 Available Components

### Progress
```vue
<Progress :value="75" variant="success" size="md" />
```
**Props:** `value` (0-100), `variant` (default/success/warning/error), `size` (sm/md/lg)

### Button
```vue
<Button variant="primary" size="md" :loading="false">Label</Button>
```
**Variants:** primary, secondary, outline, danger, danger-outline, ghost  
**Sizes:** sm, md, lg

### Badge
```vue
<Badge variant="success">Active</Badge>
<Badge variant="info" dot>Online</Badge>
```
**Variants:** success, inactive, warning, error, info, neutral

### Alert
```vue
<Alert variant="success">Success message</Alert>
<Alert variant="error" dismissible @dismiss="close">Error</Alert>
```
**Variants:** success, error, warning, info

### Card
```vue
<Card variant="content" hoverable>
  <template #header>Header</template>
  Body
  <template #footer>Footer</template>
</Card>
```
**Variants:** default, stat, content, interactive

### Input
```vue
<Input v-model="text" :error="hasError" size="md" />
```

### Table
```vue
<Table compact bordered>
  <thead>...</thead>
  <tbody>...</tbody>
</Table>
```

### Tabs
```vue
<Tabs v-model="activeTab" :tabs="tabsArray" />
```

### Spinner
```vue
<Spinner size="md" variant="primary" />
```

---

## 🎯 Common Patterns

### Pattern 1: Progress Bar with Dynamic Color

**Old:**
```vue
<template>
  <div class="h-2 rounded-full bg-gray-200">
    <div
      :class="{
        'bg-green-500': usage < 70,
        'bg-yellow-500': usage >= 70 && usage < 90,
        'bg-red-500': usage >= 90
      }"
      class="h-2 rounded-full"
      :style="{ width: usage + '%' }"
    />
  </div>
</template>
```

**New:**
```vue
<template>
  <Progress :value="usage" :variant="usageVariant" />
</template>

<script setup>
import { computed } from 'vue'
import { Progress } from '@/ui'

const usageVariant = computed(() => {
  if (usage >= 90) return 'error'
  if (usage >= 70) return 'warning'
  return 'success'
})
</script>
```

### Pattern 2: Status Badge

**Old:**
```vue
<span
  :class="{
    'bg-green-100 text-green-800': status === 'active',
    'bg-red-100 text-red-800': status === 'error'
  }"
  class="rounded-full px-2 py-1 text-xs"
>
  {{ status }}
</span>
```

**New:**
```vue
<Badge :variant="statusVariant">{{ status }}</Badge>

<script setup>
import { computed } from 'vue'
import { Badge } from '@/ui'

const statusVariant = computed(() => {
  return status === 'active' ? 'success' : 'error'
})
</script>
```

### Pattern 3: Action Button

**Old:**
```vue
<button
  class="bg-black text-white rounded px-4 py-2 hover:bg-gray-800"
  :disabled="isLoading"
  @click="handleSubmit"
>
  <span v-if="isLoading">Loading...</span>
  <span v-else>Submit</span>
</button>
```

**New:**
```vue
<Button
  variant="primary"
  :loading="isLoading"
  @click="handleSubmit"
>
  Submit
</Button>
```

---

## ⚠️ Rules to Follow

### ✅ DO

- Import from `@/ui`: `import { Button } from '@/ui'`
- Use semantic variants: `variant="success"` not `class="bg-green-500"`
- Compose business components from Design System components
- Check `src/ui/README.md` for full API docs

### ❌ DON'T

- Use Tailwind utilities in `src/components/` or `src/views/`
- Import directly: `import Button from '@/ui/components/Button.vue'`
- Create custom progress bars, buttons, badges
- Hardcode colors, spacing, or typography

---

## 🔍 Finding Examples

### 1. Check the Demo
Location: `src/ui/__demo__/DesignDemoView.vue`

Shows all components with all variants.

### 2. Read the Docs
Location: `src/ui/README.md`

Complete API reference + usage patterns.

### 3. See Refactoring Example
Location: `src/ui/__demo__/REFACTORING_EXAMPLE.vue`

Before/after comparison with real code.

### 4. Follow Migration Guide
Location: `web/admin-spa/MIGRATION_GUIDE.md`

Step-by-step instructions for refactoring existing components.

---

## 🆘 Getting Help

### "I need a progress bar"

```vue
import { Progress } from '@/ui'

<Progress :value="percentage" variant="success" />
```

### "I need a button with loading state"

```vue
import { Button } from '@/ui'

<Button variant="primary" :loading="isLoading">Save</Button>
```

### "I need a status badge"

```vue
import { Badge } from '@/ui'

<Badge variant="success">Active</Badge>
```

### "I need to show an alert"

```vue
import { Alert } from '@/ui'

<Alert variant="error">Something went wrong</Alert>
```

### "I don't see the component I need"

1. Check `src/ui/README.md` - it might exist
2. If not, create it in `src/ui/components/` following existing patterns
3. Never create ad-hoc UI in business code

---

## 📊 Migration Priority

If you're refactoring existing code:

**High Priority** (most impact):
1. `src/components/apistats/LimitConfig.vue` - 39 progress bars
2. `src/views/AccountsView.vue` - 20+ progress bars
3. `src/views/ApiKeysView.vue` - 2 progress bars

**Reference**: See `web/admin-spa/MIGRATION_GUIDE.md` for complete list

---

## 🧪 Testing

After using Design System components:

- [ ] Check light mode appearance
- [ ] Check dark mode appearance (toggle in app)
- [ ] Verify interactive states (hover, focus, disabled)
- [ ] Test responsive behavior
- [ ] Ensure no console errors

---

## 🎓 Understanding the Architecture

```
src/ui/          → Design System (presentation only, NO business logic)
  ↑ imported by
src/components/  → Business components (compose ui/ with domain logic)
  ↑ used by
src/views/       → Pages (orchestrate components)
```

**Key insight**: UI flows one direction. Business code never contains raw Tailwind.

---

## 📚 Full Documentation

- **Quick Start** (this file) - 5 minutes
- **`src/ui/README.md`** - Complete reference (30 minutes)
- **`web/admin-spa/MIGRATION_GUIDE.md`** - Refactoring guide (15 minutes)
- **`DESIGN_SYSTEM_GUARDRAILS.md`** - ESLint + CI/CD setup (10 minutes)
- **`DESIGN_SYSTEM_SUMMARY.md`** - Executive overview (10 minutes)

---

## 🎯 TL;DR

**Old way:**
```vue
<div class="h-2 rounded-full bg-gray-200">
  <div class="h-2 rounded-full bg-blue-500" :style="{ width: '50%' }" />
</div>
```

**New way:**
```vue
<Progress :value="50" variant="success" />
```

**Import:**
```js
import { Progress, Button, Badge, Alert, Card } from '@/ui'
```

**Rule:**
No more Tailwind utilities in `components/` or `views/`. Use Design System components.

---

**Questions?** Check `src/ui/README.md` or ask a senior developer.

**Ready to migrate?** See `web/admin-spa/MIGRATION_GUIDE.md`
