# Design System Architecture Guide

## Overview

This is the **single source of truth** for all UI components in the Vue 3 Admin SPA. The Design System enforces consistency, scalability, and maintainability across the entire application.

---

## Directory Structure

```
src/
├── ui/                          # 🎨 Design System (NO business logic)
│   ├── components/              # Reusable UI components
│   │   ├── Alert.vue
│   │   ├── Badge.vue
│   │   ├── Button.vue
│   │   ├── Card.vue
│   │   ├── Input.vue
│   │   ├── Progress.vue
│   │   ├── Spinner.vue
│   │   ├── Table.vue
│   │   └── Tabs.vue
│   ├── tokens/                  # Design tokens (colors, spacing, etc.)
│   │   ├── colors.js
│   │   ├── spacing.js
│   │   ├── typography.js
│   │   ├── radius.js
│   │   └── index.js
│   ├── styles/                  # Global styles
│   │   ├── base.css             # CSS resets
│   │   ├── dark-mode.css        # Dark mode variables
│   │   └── index.css            # Main entry
│   ├── __demo__/                # Visual regression reference
│   │   └── DesignDemoView.vue
│   └── index.js                 # Unified exports
│
├── components/                  # 🏗️ Business components (composition only)
│   ├── accounts/
│   ├── apikeys/
│   └── ...
│
└── views/                       # 📄 Pages (NO raw Tailwind)
    ├── DashboardView.vue
    └── ...
```

---

## Core Principles

### 1. **Separation of Concerns**

- **`ui/`**: Pure presentation components. NO business logic, NO API calls, NO state management.
- **`components/`**: Business components that compose `ui/` components with domain logic.
- **`views/`**: Pages that orchestrate business components and handle routing.

### 2. **Token-Based Design**

All visual properties are defined in design tokens:

```js
// ✅ CORRECT - Use tokens
import { colors, spacing } from '@/ui/tokens'

// ❌ WRONG - Never hardcode values
const style = { color: '#000', padding: '12px' }
```

### 3. **No Raw Tailwind in Business Code**

**Tailwind utilities are ONLY allowed inside `src/ui/`.**

```vue
<!-- ❌ WRONG - Raw Tailwind in view -->
<div class="h-2 rounded-full bg-black dark:bg-white" style="width: 50%" />

<!-- ✅ CORRECT - Use Design System component -->
<Progress :value="50" variant="default" />
```

---

## Component Usage

### Importing Components

**Always import from the unified index:**

```vue
<script setup>
// ✅ CORRECT
import { Button, Progress, Badge, Card } from '@/ui'

// ❌ WRONG - Never import directly
import Button from '@/ui/components/Button.vue'
</script>
```

### Progress Component

**Problem Example (OLD):**

```vue
<!-- ❌ OLD: Raw Tailwind, no reusability -->
<div class="h-2 w-full rounded-full bg-gray-200 dark:bg-gray-700">
  <div 
    class="h-2 rounded-full bg-indigo-600 transition-all duration-300"
    :style="{ width: `${percentage}%` }"
  />
</div>
```

**Solution (NEW):**

```vue
<template>
  <Progress :value="percentage" variant="success" size="md" />
</template>

<script setup>
import { Progress } from '@/ui'
</script>
```

**Props API:**

- `value` (Number, required): 0-100
- `variant` (String): `default`, `success`, `warning`, `error`
- `size` (String): `sm`, `md`, `lg`
- `animated` (Boolean): Enable smooth transitions

### Button Component

```vue
<template>
  <!-- Primary button -->
  <Button variant="primary" size="md" @click="handleClick">
    Save Changes
  </Button>

  <!-- Loading state -->
  <Button variant="primary" :loading="isSubmitting">
    Submit
  </Button>

  <!-- Icon-only button -->
  <Button variant="ghost" icon-only>
    <i class="fas fa-cog" />
  </Button>
</template>

<script setup>
import { Button } from '@/ui'
</script>
```

**Props:**

- `variant`: `primary`, `secondary`, `outline`, `danger`, `danger-outline`, `ghost`
- `size`: `sm`, `md`, `lg`
- `loading`: Boolean
- `disabled`: Boolean
- `iconOnly`: Boolean (square shape)
- `block`: Boolean (full width)

### Badge Component

```vue
<template>
  <!-- Status badge -->
  <Badge variant="success">Active</Badge>
  <Badge variant="error">Error</Badge>
  <Badge variant="warning">Pending</Badge>

  <!-- Badge with dot -->
  <Badge variant="success" dot>Online</Badge>

  <!-- Count badge -->
  <Button variant="secondary">
    Messages <Badge variant="error" count>99+</Badge>
  </Button>
</template>

<script setup>
import { Badge, Button } from '@/ui'
</script>
```

### Alert Component

```vue
<template>
  <Alert variant="success">
    <strong>Success!</strong> Your changes have been saved.
  </Alert>

  <Alert variant="error" dismissible @dismiss="handleDismiss">
    <strong>Error!</strong> Something went wrong.
  </Alert>
</template>

<script setup>
import { Alert } from '@/ui'
</script>
```

### Card Component

```vue
<template>
  <Card variant="content" hoverable>
    <template #header>
      <h3>Card Title</h3>
      <Button variant="ghost" size="sm">Action</Button>
    </template>

    <p>Card body content goes here.</p>

    <template #footer>
      <span class="text-sm text-gray-500">Updated 2 hours ago</span>
    </template>
  </Card>

  <!-- Stat card -->
  <Card variant="stat">
    <div class="stat-label">Total Requests</div>
    <div class="stat-value">1,234,567</div>
    <div class="stat-trend positive">↑ 12.5%</div>
  </Card>
</template>

<script setup>
import { Card, Button } from '@/ui'
</script>
```

### Table Component

```vue
<template>
  <Table compact>
    <thead>
      <tr>
        <th>Name</th>
        <th>Status</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="item in items" :key="item.id">
        <td>{{ item.name }}</td>
        <td><Badge :variant="item.status">{{ item.status }}</Badge></td>
        <td><Button variant="ghost" size="sm">Edit</Button></td>
      </tr>
    </tbody>
  </Table>
</template>

<script setup>
import { Table, Badge, Button } from '@/ui'
</script>
```

### Tabs Component

```vue
<template>
  <Tabs v-model="activeTab" :tabs="tabs" />

  <div v-if="activeTab === 'overview'">Overview content</div>
  <div v-if="activeTab === 'settings'">Settings content</div>
</template>

<script setup>
import { ref } from 'vue'
import { Tabs } from '@/ui'

const activeTab = ref('overview')
const tabs = [
  { label: 'Overview', value: 'overview' },
  { label: 'Settings', value: 'settings' },
  { label: 'Disabled', value: 'disabled', disabled: true }
]
</script>
```

---

## Composition Patterns

### Business Component Example

**BAD - Mixing concerns:**

```vue
<!-- ❌ DON'T DO THIS -->
<template>
  <div class="rounded-lg border border-gray-200 p-4">
    <div class="h-2 w-full rounded bg-gray-200">
      <div class="h-2 rounded bg-blue-500" :style="{ width: `${usage}%` }" />
    </div>
  </div>
</template>
```

**GOOD - Composition:**

```vue
<!-- ✅ DO THIS -->
<template>
  <Card>
    <h3>API Usage</h3>
    <Progress :value="usagePercentage" variant="success" />
    <p>{{ formatNumber(usage) }} / {{ formatNumber(limit) }} requests</p>
  </Card>
</template>

<script setup>
import { computed } from 'vue'
import { Card, Progress } from '@/ui'
import { formatNumber } from '@/utils/format'

const props = defineProps({
  usage: Number,
  limit: Number
})

const usagePercentage = computed(() => (props.usage / props.limit) * 100)
</script>
```

### Complex Composition Example

```vue
<!-- UsageStatsCard.vue - Business component -->
<template>
  <Card variant="content" hoverable>
    <template #header>
      <h3>Usage Statistics</h3>
      <Badge :variant="statusVariant">{{ status }}</Badge>
    </template>

    <div class="space-y-4">
      <div>
        <div class="flex justify-between text-sm mb-1">
          <span>API Calls</span>
          <span>{{ formatNumber(apiCalls) }} / {{ formatNumber(limit) }}</span>
        </div>
        <Progress :value="apiCallsPercentage" variant="default" />
      </div>

      <div>
        <div class="flex justify-between text-sm mb-1">
          <span>Tokens Used</span>
          <span>{{ formatNumber(tokens) }}</span>
        </div>
        <Progress :value="tokensPercentage" variant="success" />
      </div>
    </div>

    <template #footer>
      <Button variant="ghost" size="sm" @click="viewDetails">
        View Details
      </Button>
    </template>
  </Card>
</template>

<script setup>
import { computed } from 'vue'
import { Card, Progress, Badge, Button } from '@/ui'
import { formatNumber } from '@/utils/format'

const props = defineProps({
  apiCalls: Number,
  limit: Number,
  tokens: Number,
  status: String
})

const emit = defineEmits(['view-details'])

const apiCallsPercentage = computed(() => (props.apiCalls / props.limit) * 100)
const tokensPercentage = computed(() => Math.min((props.tokens / 1000000) * 100, 100))

const statusVariant = computed(() => {
  return props.status === 'active' ? 'success' : 'inactive'
})

const viewDetails = () => emit('view-details')
</script>
```

---

## Design Tokens Usage

### Colors

```js
import { colors } from '@/ui/tokens'

// Use semantic colors
const textColor = colors.text.primary // '#000000'
const linkColor = colors.text.link // '#0070f3'

// Use status colors
const successColor = colors.status.success // '#0070f3'
const errorColor = colors.status.error // '#ee0000'
```

### Spacing

```js
import { spacing, componentSpacing } from '@/ui/tokens'

// Use spacing scale
const padding = spacing[4] // '1rem'

// Use component presets
const buttonPadding = componentSpacing.button.md.padding // '0.625rem 1.25rem'
```

### Typography

```js
import { typography } from '@/ui/tokens'

// Use typography styles
const headingStyle = typography.styles.h2
// {
//   fontSize: '2.5rem',
//   fontWeight: 700,
//   lineHeight: 1.2,
//   letterSpacing: '-0.04em',
//   color: '#000000'
// }
```

---

## Architectural Guardrails

### ESLint Rules (Recommended)

Add to `.eslintrc.js`:

```js
module.exports = {
  rules: {
    // Prevent Tailwind usage outside ui/ directory
    'vue/no-restricted-syntax': [
      'error',
      {
        selector: 'VAttribute[key.name="class"][value.value=/\\b(h-\\d+|w-\\d+|bg-|text-|rounded)/]',
        message: 'Use Design System components from @/ui instead of raw Tailwind classes'
      }
    ]
  }
}
```

### Code Review Checklist

Before merging any PR, verify:

- [ ] No raw Tailwind utilities in `components/` or `views/`
- [ ] All UI components imported from `@/ui` (not direct paths)
- [ ] No hardcoded colors, spacing, or typography values
- [ ] Design System components used correctly with proper props
- [ ] Business components focus on composition, not presentation

### Migration Checklist

When refactoring existing code:

1. **Identify raw UI elements**
   - Search for Tailwind patterns: `h-`, `w-`, `bg-`, `rounded-`, etc.
   - Find hardcoded inline styles

2. **Map to Design System components**
   - Progress bars → `<Progress>`
   - Buttons → `<Button>`
   - Status indicators → `<Badge>`
   - Messages → `<Alert>`

3. **Refactor incrementally**
   - One component type at a time
   - Test dark mode compatibility
   - Verify responsive behavior

4. **Clean up**
   - Remove unused Tailwind classes
   - Delete duplicate component implementations
   - Update imports to use `@/ui`

---

## Testing

### Visual Regression

The `ui/__demo__/DesignDemoView.vue` serves as:

1. **Documentation**: Shows all component variants
2. **Visual Reference**: Baseline for design consistency
3. **Testing**: Manual regression testing before releases

Access the demo at: `/design-demo` (in development)

### Component Testing

```js
import { mount } from '@vue/test-utils'
import { Progress } from '@/ui'

describe('Progress Component', () => {
  it('renders with correct width', () => {
    const wrapper = mount(Progress, {
      props: { value: 50 }
    })
    
    const fill = wrapper.find('.ds-progress__fill')
    expect(fill.attributes('style')).toContain('width: 50%')
  })

  it('clamps value between 0 and 100', () => {
    const wrapper = mount(Progress, {
      props: { value: 150 }
    })
    
    expect(wrapper.vm.clampedValue).toBe(100)
  })
})
```

---

## Dark Mode Support

All Design System components support dark mode automatically through CSS media queries:

```css
/* Light mode (default) */
.ds-button--primary {
  background: #000;
  color: #fff;
}

/* Dark mode */
@media (prefers-color-scheme: dark) {
  .ds-button--primary {
    background: #fff;
    color: #000;
  }
}
```

No JavaScript dark mode toggle needed at the component level.

---

## FAQ

### Q: Can I use Tailwind in `components/`?

**A: NO.** Only in `src/ui/`. Use Design System components instead.

### Q: What if the Design System doesn't have what I need?

**A: Create a new component in `ui/components/`** following the existing patterns. Never create ad-hoc UI in business code.

### Q: Can I customize component styles?

**A: NO.** All visual changes must go through design approval and be implemented in the Design System itself. This ensures consistency.

### Q: How do I handle one-off styling?

**A: You don't.** One-off styles indicate either:
1. The Design System is incomplete (add the component)
2. The design is inconsistent (discuss with design team)

---

## Summary

This Design System enforces:

- **Consistency**: One source of truth for all UI
- **Scalability**: Reusable components, no duplication
- **Maintainability**: Changes in one place affect everywhere
- **Performance**: Optimized, production-ready components
- **Dark Mode**: Built-in support across all components

**Remember**: If it's visual, it belongs in `ui/`. If it's business logic, it belongs in `components/`.
