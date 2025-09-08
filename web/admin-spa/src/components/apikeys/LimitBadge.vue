<template>
  <div class="inline-flex items-center gap-1.5 rounded-md px-2 py-1" :class="badgeClass">
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
    <div class="h-1 w-12 rounded-full bg-gray-200 dark:bg-gray-600">
      <div
        class="h-1 rounded-full transition-all duration-300"
        :class="progressClass"
        :style="{ width: progress + '%' }"
      />
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

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
  switch (props.type) {
    case 'daily':
      return 'bg-gray-50 dark:bg-gray-700/50'
    case 'opus':
      return 'bg-indigo-50 dark:bg-indigo-900/20'
    case 'window':
      return 'bg-blue-50 dark:bg-blue-900/20'
    default:
      return 'bg-gray-50 dark:bg-gray-700/50'
  }
})

const iconClass = computed(() => {
  switch (props.type) {
    case 'daily':
      return 'fas fa-calendar-day text-gray-500'
    case 'opus':
      return 'fas fa-gem text-indigo-500'
    case 'window':
      return 'fas fa-clock text-blue-500'
    default:
      return 'fas fa-info-circle text-gray-500'
  }
})

const progressClass = computed(() => {
  const p = progress.value
  if (p >= 100) return 'bg-red-500'
  if (p >= 80) return 'bg-yellow-500'

  switch (props.type) {
    case 'daily':
      return 'bg-green-500'
    case 'opus':
      return 'bg-indigo-500'
    case 'window':
      return 'bg-blue-500'
    default:
      return 'bg-gray-500'
  }
})
</script>
