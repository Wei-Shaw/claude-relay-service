# Component Migration Checklist

This document tracks the migration from ad-hoc Tailwind to Design System components.

## Migration Status

### ✅ Completed
- [ ] Design System infrastructure created
- [ ] Core components implemented (Progress, Button, Badge, Alert, Card, Table, Tabs, Input, Spinner)
- [ ] Design tokens extracted (colors, spacing, typography, radius)
- [ ] Documentation written

### 🚧 In Progress
- [ ] Refactoring existing components

### 📋 Pending Components to Migrate

#### High Priority (Contains raw progress bars)
- [ ] `src/components/apistats/LimitConfig.vue` - 39 progress bar instances
- [ ] `src/views/ApiKeysView.vue` - 2 progress bar instances  
- [ ] `src/views/AccountsView.vue` - 20+ progress bar instances
- [ ] `src/components/apistats/AggregatedStatsCard.vue` - 2 progress bar instances
- [ ] `src/components/accounts/AccountForm.vue` - 1 progress bar instance
- [ ] `src/components/user/UserUsageStats.vue` - 1 status dot

#### Medium Priority (Contains buttons/badges that could use DS)
- [ ] `src/components/apikeys/*.vue` - Button components
- [ ] `src/components/accounts/*.vue` - Button/Badge components
- [ ] `src/views/DashboardView.vue` - Stats cards
- [ ] All modal components

#### Low Priority (Requires new DS components)
- [ ] Components needing Dropdown component
- [ ] Components needing Modal component
- [ ] Components needing Form components (Select, Textarea, etc.)

---

## Migration Workflow

### Step 1: Identify Patterns

Search for these patterns in your component:

```bash
# Progress bars
grep -n "h-2.*rounded.*bg-" your-file.vue

# Buttons with raw Tailwind
grep -n "class=\".*btn.*bg-" your-file.vue

# Status badges/dots
grep -n "rounded-full.*bg-\(blue\|green\|red\)" your-file.vue
```

### Step 2: Map to DS Components

| Old Pattern | New Component |
|------------|---------------|
| `<div class="h-2 rounded-full bg-...">` | `<Progress>` |
| `<button class="bg-black text-white rounded">` | `<Button>` |
| `<span class="rounded px-2 py-1 bg-blue-...">` | `<Badge>` |
| `<div class="border rounded-lg p-4">` | `<Card>` |
| `<div class="bg-red-50 border-red-500 p-3">` | `<Alert>` |

### Step 3: Refactor Template

**BEFORE:**
```vue
<template>
  <div class="h-2 w-full rounded-full bg-gray-200 dark:bg-gray-700">
    <div
      class="h-2 rounded-full transition-all duration-300"
      :class="getProgressColor()"
      :style="{ width: percentage + '%' }"
    />
  </div>
</template>
```

**AFTER:**
```vue
<template>
  <Progress :value="percentage" :variant="progressVariant" />
</template>

<script setup>
import { computed } from 'vue'
import { Progress } from '@/ui'

const progressVariant = computed(() => {
  if (percentage >= 90) return 'error'
  if (percentage >= 70) return 'warning'
  return 'success'
})
</script>
```

### Step 4: Update Script

1. Add import: `import { Progress, Button, Badge } from '@/ui'`
2. Remove old CSS utility helper methods (e.g., `getProgressColor()`)
3. Replace with computed properties using Design System variants

### Step 5: Clean Up

1. Remove unused Tailwind classes
2. Delete CSS helper methods no longer needed
3. Test in both light and dark modes
4. Verify responsive behavior

### Step 6: Update Checklist

Mark component as ✅ completed in this document.

---

## Example: Refactoring LimitConfig.vue

### Analysis

File: `src/components/apistats/LimitConfig.vue`

**Found Issues:**
- Line 125-135: Daily cost progress bar (raw Tailwind)
- Line 157-167: Total cost progress bar (raw Tailwind)
- Line 182-188: Opus weekly cost progress bar (raw Tailwind)
- Methods: `getDailyCostProgressColor()`, `getTotalCostProgressColor()`, etc.

### Refactored Code

```vue
<template>
  <div class="space-y-4">
    <!-- Daily Cost Limit -->
    <div>
      <div class="mb-2 flex items-center justify-between">
        <span class="text-sm font-medium text-gray-600 dark:text-gray-400">
          每日费用限制
        </span>
        <span class="text-xs text-gray-500 dark:text-gray-400">
          ${{ currentDailyCost.toFixed(4) }} / 
          <span v-if="dailyCostLimit > 0">${{ dailyCostLimit.toFixed(2) }}</span>
          <i v-else class="fas fa-infinity" />
        </span>
      </div>
      <Progress
        :value="dailyCostPercentage"
        :variant="dailyCostVariant"
        size="md"
      />
    </div>

    <!-- Total Cost Limit -->
    <div>
      <div class="mb-2 flex items-center justify-between">
        <span class="text-sm font-medium text-gray-600 dark:text-gray-400">
          总费用限制
        </span>
        <span class="text-xs text-gray-500 dark:text-gray-400">
          ${{ currentTotalCost.toFixed(4) }} / 
          <span v-if="totalCostLimit > 0">${{ totalCostLimit.toFixed(2) }}</span>
          <i v-else class="fas fa-infinity" />
        </span>
      </div>
      <Progress
        :value="totalCostPercentage"
        :variant="totalCostVariant"
        size="md"
      />
    </div>

    <!-- Opus Weekly Cost Limit -->
    <div v-if="weeklyOpusCostLimit > 0">
      <div class="mb-2 flex items-center justify-between">
        <span class="text-sm font-medium text-gray-600 dark:text-gray-400">
          Opus 模型周费用限制
        </span>
        <span class="text-xs text-gray-500 dark:text-gray-400">
          ${{ weeklyOpusCost.toFixed(4) }} / ${{ weeklyOpusCostLimit.toFixed(2) }}
        </span>
      </div>
      <Progress
        :value="opusWeeklyCostPercentage"
        :variant="opusWeeklyCostVariant"
        size="md"
      />
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { Progress } from '@/ui'

const props = defineProps({
  currentDailyCost: Number,
  dailyCostLimit: Number,
  currentTotalCost: Number,
  totalCostLimit: Number,
  weeklyOpusCost: Number,
  weeklyOpusCostLimit: Number
})

// Helper function to determine variant based on percentage
const getVariantFromPercentage = (percentage) => {
  if (percentage >= 90) return 'error'
  if (percentage >= 70) return 'warning'
  return 'success'
}

// Daily cost calculations
const dailyCostPercentage = computed(() => {
  if (props.dailyCostLimit <= 0) return 0
  return Math.min((props.currentDailyCost / props.dailyCostLimit) * 100, 100)
})

const dailyCostVariant = computed(() => 
  getVariantFromPercentage(dailyCostPercentage.value)
)

// Total cost calculations
const totalCostPercentage = computed(() => {
  if (props.totalCostLimit <= 0) return 0
  return Math.min((props.currentTotalCost / props.totalCostLimit) * 100, 100)
})

const totalCostVariant = computed(() => 
  getVariantFromPercentage(totalCostPercentage.value)
)

// Opus weekly cost calculations
const opusWeeklyCostPercentage = computed(() => {
  if (props.weeklyOpusCostLimit <= 0) return 0
  return Math.min((props.weeklyOpusCost / props.weeklyOpusCostLimit) * 100, 100)
})

const opusWeeklyCostVariant = computed(() => 
  getVariantFromPercentage(opusWeeklyCostPercentage.value)
)
</script>
```

### Changes Made

**Removed:**
- ❌ All raw Tailwind progress bar divs
- ❌ CSS helper methods: `getDailyCostProgressColor()`, `getDailyCostProgress()`, etc.
- ❌ Complex conditional rendering for progress bars
- ❌ Dark mode style handling

**Added:**
- ✅ `<Progress>` component from Design System
- ✅ Clean computed properties for percentages
- ✅ Variant mapping based on business rules
- ✅ Simplified template logic

**Benefits:**
- 📦 Reduced component size by ~50 lines
- 🎨 Consistent progress bar styling
- 🌙 Automatic dark mode support
- 🧪 Easier to test business logic
- 🔧 Centralized visual changes

---

## Common Patterns

### Pattern 1: Progress Bars with Dynamic Colors

**Old:**
```vue
<div class="h-2 rounded-full bg-gray-200">
  <div
    class="h-2 rounded-full"
    :class="{
      'bg-green-500': percentage < 70,
      'bg-yellow-500': percentage >= 70 && percentage < 90,
      'bg-red-500': percentage >= 90
    }"
    :style="{ width: percentage + '%' }"
  />
</div>
```

**New:**
```vue
<Progress :value="percentage" :variant="progressVariant" />

<script setup>
const progressVariant = computed(() => {
  if (percentage >= 90) return 'error'
  if (percentage >= 70) return 'warning'
  return 'success'
})
</script>
```

### Pattern 2: Status Dots

**Old:**
```vue
<div class="h-2 w-2 rounded-full bg-blue-500"></div>
```

**New:**
```vue
<Badge variant="info" dot />
```

### Pattern 3: Stat Cards

**Old:**
```vue
<div class="rounded-lg border border-gray-200 p-4">
  <div class="text-sm text-gray-600">Total Requests</div>
  <div class="text-2xl font-bold text-gray-900">1,234</div>
</div>
```

**New:**
```vue
<Card variant="stat">
  <div class="stat-label">Total Requests</div>
  <div class="stat-value">1,234</div>
</Card>
```

---

## Testing Checklist

After migrating a component:

- [ ] Component renders correctly in light mode
- [ ] Component renders correctly in dark mode
- [ ] All interactive elements work (buttons, etc.)
- [ ] Progress bars animate smoothly
- [ ] Responsive design maintained
- [ ] No console errors
- [ ] Props are correctly passed
- [ ] Business logic unchanged

---

## Need Help?

Refer to:
1. **Component docs**: `src/ui/README.md`
2. **Visual reference**: `src/ui/__demo__/DesignDemoView.vue`
3. **Refactoring example**: `src/ui/__demo__/REFACTORING_EXAMPLE.vue`
4. **Token reference**: `src/ui/tokens/`






