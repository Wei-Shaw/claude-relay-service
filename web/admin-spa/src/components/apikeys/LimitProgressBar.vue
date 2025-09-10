<template>
  <div class="w-full">
    <div class="relative h-8 w-full overflow-hidden rounded-md shadow-sm" :class="containerClass">
      <!-- 背景层 -->
      <div class="absolute inset-0" :class="backgroundClass"></div>

      <!-- 进度条层 -->
      <div
        class="absolute inset-0 h-full transition-all duration-500 ease-out"
        :class="progressBarClass"
        :style="{ width: progress + '%' }"
      ></div>

      <!-- 文字层 - 使用双层文字技术确保可读性 -->
      <div class="relative z-10 flex h-full items-center justify-between px-2.5">
        <div class="flex items-center gap-1.5">
          <i :class="['text-[10px]', iconClass]" />
          <span class="text-[10px] font-semibold" :class="labelTextClass">{{ label }}</span>
        </div>
        <div class="mr-1 flex items-center gap-0.5">
          <span class="text-[10px] font-bold tabular-nums" :class="currentValueClass">
            ${{ current.toFixed(2) }}
          </span>
          <span class="text-[9px] font-medium" :class="limitTextClass">
            /${{ limit.toFixed(2) }}
          </span>
        </div>
      </div>

      <!-- 闪光效果（可选） -->
      <div
        v-if="showShine && progress > 0"
        class="absolute inset-0 opacity-20"
        :style="{
          background:
            'linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.5) 50%, transparent 60%)',
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
    validator: (value) => ['daily', 'opus', 'window', 'gpt5-high'].includes(value)
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

// 容器样式 - 使用更柔和的边框和阴影
const containerClass = computed(() => {
  return 'border border-gray-200/80 dark:border-gray-600/50 shadow-sm'
})

// 背景样式 - 使用更浅的背景色提升对比度
const backgroundClass = computed(() => {
  switch (props.type) {
    case 'daily':
      return 'bg-gray-100/50 dark:bg-gray-800/30'
    case 'opus':
      return 'bg-violet-50/50 dark:bg-violet-950/20'
    case 'window':
      return 'bg-sky-50/50 dark:bg-sky-950/20'
    case 'gpt5-high':
      return 'bg-orange-50/50 dark:bg-orange-950/20'
    default:
      return 'bg-gray-100/50 dark:bg-gray-800/30'
  }
})

// 进度条样式 - 使用更柔和的颜色配置
const progressBarClass = computed(() => {
  const p = progress.value

  if (props.type === 'daily') {
    if (p >= 90) {
      return 'bg-red-400 dark:bg-red-500'
    } else if (p >= 70) {
      return 'bg-amber-400 dark:bg-amber-500'
    } else {
      return 'bg-emerald-400 dark:bg-emerald-500'
    }
  }

  if (props.type === 'opus') {
    if (p >= 90) {
      return 'bg-red-400 dark:bg-red-500'
    } else if (p >= 70) {
      return 'bg-amber-400 dark:bg-amber-500'
    } else {
      return 'bg-violet-400 dark:bg-violet-500'
    }
  }

  if (props.type === 'window') {
    if (p >= 90) {
      return 'bg-red-400 dark:bg-red-500'
    } else if (p >= 70) {
      return 'bg-amber-400 dark:bg-amber-500'
    } else {
      return 'bg-sky-400 dark:bg-sky-500'
    }
  }

  if (props.type === 'gpt5-high') {
    if (p >= 90) {
      return 'bg-red-400 dark:bg-red-500'
    } else if (p >= 70) {
      return 'bg-amber-400 dark:bg-amber-500'
    } else {
      return 'bg-orange-400 dark:bg-orange-500'
    }
  }

  return 'bg-gray-300 dark:bg-gray-400'
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
        colorClass = 'text-blue-700 dark:text-blue-400'
        break
      case 'gpt5-high':
        colorClass = 'text-orange-700 dark:text-orange-400'
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
    case 'gpt5-high':
      iconName = 'fas fa-brain'
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
      case 'gpt5-high':
        return 'text-orange-900 dark:text-orange-100'
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
          return 'text-blue-800 dark:text-blue-200'
        case 'gpt5-high':
          return 'text-orange-800 dark:text-orange-200'
        default:
          return 'text-gray-900 dark:text-gray-100'
      }
    }
  }
})

// 限制值文字颜色
const limitTextClass = computed(() => {
  const p = progress.value

  // 判断限制值是否在进度条上
  if (p > 85) {
    // 在进度条上
    return 'text-white/90 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]'
  } else {
    // 在背景上
    return 'text-gray-600 dark:text-gray-400'
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
