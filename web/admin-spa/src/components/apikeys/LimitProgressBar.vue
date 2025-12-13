<template>
  <div class="w-full">
    <!-- 检查是否为无限制状态 -->
    <div
      v-if="!limit || limit <= 0"
      class="flex items-center justify-center rounded-lg px-3 py-2 text-xs"
    >
      <div class="flex items-center gap-1.5 text-gray-600 dark:text-gray-300">
        <i class="fas fa-infinity text-sm text-gray-500 dark:text-gray-400" />
        <span class="font-medium">无限制</span>
      </div>
    </div>
    <div v-else-if="isCompact" class="space-y-1.5">
      <!-- 使用额度和限额显示在进度条上方右对齐 -->
      <div class="flex items-center justify-between text-[11px] font-medium">
        <div class="flex items-center gap-1.5" :class="compactLabelClass">
          <i :class="['text-[11px]', iconClass]" />
          <span>{{ label }}</span>
        </div>
        <span class="text-gray-700 dark:text-gray-200"
          >${{ current.toFixed(2) }} / ${{ limit.toFixed(2) }}</span
        >
      </div>
      <div class="relative h-1.5 overflow-hidden rounded-full bg-gray-200/85 dark:bg-gray-700/70">
        <div
          class="absolute inset-y-0 rounded-full transition-all duration-500 ease-out"
          :class="compactBarClass"
          :style="{ width: progress + '%' }"
        ></div>
      </div>
    </div>
    <div
      v-else
      class="group relative h-9 w-full overflow-hidden rounded border transition-all duration-300 ease-out"
      :class="containerClass"
    >
      <!-- 背景层 -->
      <div class="absolute inset-0" :class="backgroundClass"></div>

      <!-- 进度条层 -->
      <div
        class="absolute inset-0 h-full transition-all duration-500 ease-out"
        :class="progressBarClass"
        :style="{ width: progress + '%' }"
      ></div>

      <!-- 内部高光边框 -->
      <div
        class="pointer-events-none absolute inset-0 rounded border border-white/50 opacity-40 mix-blend-overlay dark:border-white/10"
      ></div>

      <!-- 文字层 - 使用双层文字技术确保可读性 -->
      <div class="relative z-10 flex h-full items-center justify-between px-3">
        <div class="flex items-center gap-1.5">
          <i :class="['text-xs', iconClass]" />
          <span class="text-xs font-semibold" :class="labelTextClass">{{ label }}</span>
        </div>
        <div class="flex items-center gap-1.5">
          <span class="text-xs font-bold tabular-nums" :class="currentValueClass">
            ${{ current.toFixed(2) }} / ${{ limit.toFixed(2) }}
          </span>
        </div>
      </div>

      <!-- 闪光效果（可选） -->
      <div
        v-if="showShine && progress > 0"
        class="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-700 group-hover:opacity-30"
        :style="{
          background: 'none',
          animation: 'shine 2.8s infinite'
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
    validator: (value) => ['daily', 'opus', 'window', 'total'].includes(value)
  },
  variant: {
    type: String,
    default: 'full',
    validator: (value) => ['full', 'compact'].includes(value)
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

const isCompact = computed(() => props.variant === 'compact')
const progress = computed(() => {
  // 无限制时不显示进度条
  if (!props.limit || props.limit <= 0) return 0
  const percentage = (props.current / props.limit) * 100
  return Math.min(percentage, 100)
})

// 移除百分比显示
// const compactPercentage = computed(() => `${Math.min(progress.value, 100).toFixed(0)}%`)

// 容器样式 - 使用柔和的渐变边框与阴影
const containerClass = computed(() => {
  switch (props.type) {
    case 'daily':
      return 'border-gray-300 bg-white dark:border-gray-700 dark:bg-gray-900'
    case 'opus':
      return 'border-gray-300 bg-white dark:border-gray-700 dark:bg-gray-900'
    case 'window':
      return 'border-gray-300 bg-white dark:border-gray-700 dark:bg-gray-900'
    case 'total':
      return 'border-gray-300/80 bg-white/80 shadow-[0_10px_24px_rgba(59,130,246,0.18)] group-hover:shadow-[0_14px_30px_rgba(59,130,246,0.22)] dark:border-blue-500/40 dark:bg-blue-950/40 dark:shadow-[0_12px_28px_rgba(0,0,0,0.45)]'
    default:
      return 'border-gray-300 bg-white dark:border-gray-700 dark:bg-gray-900'
  }
})

// 背景样式 - 使用柔和渐变增强层次
const backgroundClass = computed(() => {
  switch (props.type) {
    case 'daily':
      return 'bg-gray-50 dark:bg-gray-800'
    case 'opus':
      return 'bg-gray-50 dark:bg-gray-800'
    case 'window':
      return 'bg-gray-50 dark:bg-gray-800'
    case 'total':
      return 'bg-gray-50 dark:bg-gray-800'
    default:
      return 'bg-gray-50 dark:bg-gray-800'
  }
})

// 进度条样式 - 使用更柔和的颜色配置
const progressBarClass = computed(() => {
  const p = progress.value

  if (props.type === 'daily') {
    if (p >= 90) {
      return 'bg-red-600 dark:bg-red-500'
    } else if (p >= 70) {
      return 'bg-orange-500 dark:bg-orange-400'
    } else {
      return 'bg-black dark:bg-white'
    }
  }

  if (props.type === 'opus') {
    if (p >= 90) {
      return 'bg-red-600 dark:bg-red-500'
    } else if (p >= 70) {
      return 'bg-orange-500 dark:bg-orange-400'
    } else {
      return 'bg-black dark:bg-white'
    }
  }

  if (props.type === 'window') {
    if (p >= 90) {
      return 'bg-red-600 dark:bg-red-500'
    } else if (p >= 70) {
      return 'bg-orange-500 dark:bg-orange-400'
    } else {
      return 'bg-black dark:bg-white'
    }
  }

  if (props.type === 'total') {
    if (p >= 90) {
      return 'bg-red-600 dark:bg-red-500'
    } else if (p >= 70) {
      return 'bg-orange-500 dark:bg-orange-400'
    } else {
      return 'bg-black dark:bg-white'
    }
  }

  return 'bg-gray-300 dark:bg-gray-400'
})

const compactBarClass = computed(() => {
  const p = progress.value

  if (p >= 95) {
    return 'bg-rose-500 dark:bg-rose-400'
  }
  if (p >= 80) {
    return 'bg-amber-400 dark:bg-amber-300'
  }

  switch (props.type) {
    case 'daily':
      return 'bg-black dark:bg-white'
    case 'opus':
      return 'bg-black dark:bg-white'
    case 'window':
      return 'bg-black dark:bg-white'
    case 'total':
      return 'bg-black dark:bg-white'
    default:
      return 'bg-gray-500 dark:bg-gray-400'
  }
})

const compactLabelClass = computed(() => {
  const p = progress.value

  if (p >= 95) {
    return 'text-rose-600 dark:text-rose-300'
  }
  if (p >= 80) {
    return 'text-amber-600 dark:text-amber-300'
  }

  switch (props.type) {
    case 'daily':
      return 'text-emerald-600 dark:text-emerald-300'
    case 'opus':
      return 'text-violet-600 dark:text-violet-300'
    case 'window':
      return 'text-sky-600 dark:text-sky-300'
    case 'total':
      return 'text-gray-900 dark:text-gray-100 dark:text-blue-300'
    default:
      return 'text-gray-600 dark:text-gray-300'
  }
})

// 图标类
const iconClass = computed(() => {
  const p = progress.value

  // 根据进度选择图标颜色
  let colorClass = ''
  if (p >= 90) {
    colorClass = 'text-red-700 dark:text-red-400'
  } else if (p >= 70) {
    colorClass = 'text-orange-700 dark:text-orange-400'
  } else {
    switch (props.type) {
      case 'daily':
        colorClass = 'text-green-700 dark:text-green-400'
        break
      case 'opus':
        colorClass = 'text-purple-700 dark:text-purple-400'
        break
      case 'window':
        colorClass = 'text-gray-900 dark:text-white dark:text-blue-400'
        break
      default:
        colorClass = 'text-gray-600 dark:text-gray-400'
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
    case 'total':
      iconName = 'fas fa-wallet'
      break
    default:
      iconName = 'fas fa-infinity'
  }

  return `${iconName} ${colorClass}`
})

// 标签文字颜色 - 始终保持高对比度
const labelTextClass = computed(() => {
  const p = progress.value

  // 根据进度条背景色智能选择文字颜色
  if (p > 40) {
    // 当进度条覆盖超过40%时，使用白色文字
    return 'text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]'
  } else {
    // 在浅色背景上使用深色文字
    switch (props.type) {
      case 'daily':
        return 'text-gray-900 dark:text-gray-100'
      case 'opus':
        return 'text-purple-900 dark:text-purple-100'
      case 'window':
        return 'text-blue-900 dark:text-blue-100'
      case 'total':
        return 'text-blue-900 dark:text-blue-100'
      default:
        return 'text-gray-900 dark:text-gray-100'
    }
  }
})

// 当前值文字颜色 - 最重要的数字，需要最高对比度
const currentValueClass = computed(() => {
  const p = progress.value

  // 判断数值是否在进度条上
  if (p > 70) {
    // 在彩色进度条上，使用白色+强阴影
    return 'text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]'
  } else {
    // 在浅色背景上，根据进度状态选择颜色
    if (p >= 90) {
      return 'text-red-700 dark:text-red-300'
    } else if (p >= 70) {
      return 'text-orange-700 dark:text-orange-300'
    } else {
      switch (props.type) {
        case 'daily':
          return 'text-green-800 dark:text-green-200'
        case 'opus':
          return 'text-purple-800 dark:text-purple-200'
        case 'window':
          return 'text-gray-900 dark:text-white dark:text-blue-200'
        case 'total':
          return 'text-gray-900 dark:text-white dark:text-blue-200'
        default:
          return 'text-gray-900 dark:text-gray-100'
      }
    }
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

/* 确保文字清晰 */
.tabular-nums {
  font-variant-numeric: tabular-nums;
}
</style>
