<template>
  <div class="w-full">
    <div class="relative h-7 w-full overflow-hidden rounded-md" :class="containerClass">
      <!-- 背景层 -->
      <div class="absolute inset-0" :class="backgroundClass"></div>

      <!-- 进度条层 -->
      <div
        class="absolute inset-0 h-full transition-all duration-500 ease-out"
        :class="progressBarClass"
        :style="{ width: progress + '%' }"
      ></div>

      <!-- 文字层 -->
      <div class="relative z-10 flex h-full items-center justify-between px-2">
        <div class="flex items-center gap-1.5">
          <i :class="['text-xs', iconClass]" />
          <span class="text-xs font-medium" :class="textClass">{{ label }}</span>
        </div>
        <div class="flex items-center gap-1">
          <span class="text-xs font-bold" :class="valueTextClass"> ${{ current.toFixed(2) }} </span>
          <span class="text-xs" :class="textClass">/ ${{ limit.toFixed(2) }}</span>
        </div>
      </div>

      <!-- 闪光效果（可选） -->
      <div
        v-if="showShine && progress > 0"
        class="absolute inset-0 opacity-30"
        :style="{
          background:
            'linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.7) 50%, transparent 60%)',
          animation: 'shine 3s infinite'
        }"
      ></div>
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
  },
  showShine: {
    type: Boolean,
    default: false
  }
})

const progress = computed(() => {
  if (!props.limit || props.limit === 0) return 0
  const percentage = (props.current / props.limit) * 100
  return Math.min(percentage, 100)
})

// 容器样式
const containerClass = computed(() => {
  return 'bg-gradient-to-r border border-opacity-20'
})

// 背景样式（浅色背景）
const backgroundClass = computed(() => {
  switch (props.type) {
    case 'daily':
      return 'bg-gradient-to-r from-green-50 to-green-100 dark:from-green-950/30 dark:to-green-900/30'
    case 'opus':
      return 'bg-gradient-to-r from-purple-50 to-indigo-100 dark:from-purple-950/30 dark:to-indigo-900/30'
    case 'window':
      return 'bg-gradient-to-r from-blue-50 to-cyan-100 dark:from-blue-950/30 dark:to-cyan-900/30'
    default:
      return 'bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-700'
  }
})

// 进度条样式（根据进度值动态变化）
const progressBarClass = computed(() => {
  const p = progress.value

  if (props.type === 'daily') {
    if (p >= 90) {
      return 'bg-gradient-to-r from-red-500 to-red-600'
    } else if (p >= 70) {
      return 'bg-gradient-to-r from-yellow-500 to-orange-500'
    } else {
      return 'bg-gradient-to-r from-green-500 to-emerald-500'
    }
  }

  if (props.type === 'opus') {
    if (p >= 90) {
      return 'bg-gradient-to-r from-red-500 to-pink-600'
    } else if (p >= 70) {
      return 'bg-gradient-to-r from-orange-500 to-amber-500'
    } else {
      return 'bg-gradient-to-r from-purple-500 to-indigo-600'
    }
  }

  if (props.type === 'window') {
    if (p >= 90) {
      return 'bg-gradient-to-r from-red-500 to-rose-600'
    } else if (p >= 70) {
      return 'bg-gradient-to-r from-orange-500 to-yellow-500'
    } else {
      return 'bg-gradient-to-r from-blue-500 to-cyan-500'
    }
  }

  return 'bg-gradient-to-r from-gray-400 to-gray-500'
})

// 图标类
const iconClass = computed(() => {
  const p = progress.value
  let colorClass = ''

  if (p >= 90) {
    colorClass = 'text-red-600 dark:text-red-400'
  } else if (p >= 70) {
    colorClass = 'text-orange-600 dark:text-orange-400'
  } else {
    switch (props.type) {
      case 'daily':
        colorClass = 'text-green-600 dark:text-green-400'
        break
      case 'opus':
        colorClass = 'text-purple-600 dark:text-purple-400'
        break
      case 'window':
        colorClass = 'text-blue-600 dark:text-blue-400'
        break
      default:
        colorClass = 'text-gray-500 dark:text-gray-400'
    }
  }

  let iconName = ''
  switch (props.type) {
    case 'daily':
      iconName = 'fas fa-calendar-day'
      break
    case 'opus':
      iconName = 'fas fa-gem'
      break
    case 'window':
      iconName = 'fas fa-clock'
      break
    default:
      iconName = 'fas fa-infinity'
  }

  return `${iconName} ${colorClass}`
})

// 文字颜色（根据进度自动调整）
const textClass = computed(() => {
  const p = progress.value
  if (p > 50) {
    // 进度超过50%时，文字使用白色（在深色进度条上）
    return 'text-white drop-shadow-sm'
  } else {
    // 进度较低时，文字使用深色
    return 'text-gray-600 dark:text-gray-300'
  }
})

// 数值文字颜色（更突出）
const valueTextClass = computed(() => {
  const p = progress.value
  if (p > 50) {
    return 'text-white drop-shadow-md'
  } else {
    return 'text-gray-800 dark:text-gray-200'
  }
})
</script>

<style scoped>
@keyframes shine {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(200%);
  }
}

/* 添加柔和的边框 */
.border-opacity-20 {
  border-color: rgba(0, 0, 0, 0.05);
}

.dark .border-opacity-20 {
  border-color: rgba(255, 255, 255, 0.1);
}
</style>
