<template>
  <div class="inline-flex items-center gap-1.5 rounded border px-2 py-1" :class="badgeClass">
    <div class="flex items-center gap-1">
      <i :class="['text-xs', iconClass]" />
      <span class="text-xs font-medium">{{ label }}</span>
    </div>
    <div class="flex items-center gap-1">
      <span class="text-xs font-semibold">${{ current.toFixed(2) }}</span>
      <span class="text-xs text-gray-500 dark:text-gray-400">/</span>
      <span class="text-xs">${{ limit.toFixed(2) }}</span>
    </div>
    <!-- 小型进度条 -->
    <div class="w-12">
      <Progress :value="progress" :variant="progressVariant" size="sm" />
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { Progress } from '@/ui'

const props = defineProps({
  type: {
    type: String,
    required: true,
    validator: (value) => ['daily', 'opus', 'window'].includes(value)
  },
  label: {
    type: String,
    required: true
  },
  current: {
    type: Number,
    default: 0
  },
  limit: {
    type: Number,
    required: true
  }
})

const progress = computed(() => {
  if (!props.limit || props.limit === 0) return 0
  const percentage = (props.current / props.limit) * 100
  return Math.min(percentage, 100)
})

const badgeClass = computed(() => {
  return 'bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-700'
})

const iconClass = computed(() => {
  switch (props.type) {
    case 'daily':
      return 'fas fa-calendar-day text-gray-600 dark:text-gray-400'
    case 'opus':
      return 'fas fa-gem text-gray-600 dark:text-gray-400'
    case 'window':
      return 'fas fa-clock text-gray-600 dark:text-gray-400'
    default:
      return 'fas fa-info-circle text-gray-600 dark:text-gray-400'
  }
})

const progressVariant = computed(() => {
  const p = progress.value
  if (p >= 100) return 'error'
  if (p >= 80) return 'warning'
  return 'default'
})
</script>
