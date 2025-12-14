<!-- BEFORE: LimitConfig.vue with raw Tailwind progress bars -->
<template>
  <div>
    <!-- ❌ OLD: Raw Tailwind utilities, duplicated code -->
    <div
      v-if="statsData.limits.dailyCostLimit > 0"
      class="h-2 w-full rounded-full bg-gray-200 dark:bg-gray-700"
    >
      <div
        class="h-2 rounded-full transition-all duration-300"
        :class="getDailyCostProgressColor()"
        :style="{ width: getDailyCostProgress() + '%' }"
      />
    </div>
    <div v-else class="h-2 w-full rounded-full bg-gray-200">
      <div class="h-2 rounded-full bg-green-500" style="width: 0%" />
    </div>
  </div>
</template>

<!-- AFTER: Using Design System Progress component -->
<template>
  <div>
    <!-- ✅ NEW: Design System component, clean and reusable -->
    <Progress :value="dailyCostPercentage" :variant="dailyCostVariant" size="md" />
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { Progress } from '@/ui'

const props = defineProps({
  currentCost: Number,
  limitCost: Number
})

// Business logic - calculate percentage
const dailyCostPercentage = computed(() => {
  if (props.limitCost <= 0) return 0
  return Math.min((props.currentCost / props.limitCost) * 100, 100)
})

// Business logic - determine variant based on percentage
const dailyCostVariant = computed(() => {
  const percentage = dailyCostPercentage.value
  if (percentage >= 90) return 'error'
  if (percentage >= 70) return 'warning'
  return 'success'
})
</script>

<!-- 
BENEFITS OF REFACTORING:
1. ✅ No raw Tailwind in business component
2. ✅ Design System component handles all visual complexity
3. ✅ Business logic (percentage calculation, variant mapping) separated
4. ✅ Dark mode handled automatically by Progress component
5. ✅ Consistent progress bars across entire app
6. ✅ Easy to maintain and test
-->
