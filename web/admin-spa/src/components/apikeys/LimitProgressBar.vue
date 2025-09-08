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
          <i :class="['text-xs', iconClass]" :style="textShadowStyle" />
          <span class="text-xs font-medium" :class="textClass" :style="textShadowStyle">{{
            label
          }}</span>
        </div>
        <div class="flex items-center gap-1">
          <span class="text-xs font-bold" :class="valueTextClass" :style="valueShadowStyle">
            ${{ current.toFixed(2) }}
          </span>
          <span class="text-xs" :class="textClass" :style="textShadowStyle"
            >/ ${{ limit.toFixed(2) }}</span
          >
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
      // 使用更亮的紫色渐变，确保与白色文字有良好对比度
      return 'bg-gradient-to-r from-purple-600 to-indigo-600'
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

// 文字颜色（根据进度条类型和进度值智能调整）
const textClass = computed(() => {
  const p = progress.value

  // 对于有颜色的进度条，判断是否需要白色文字
  const needsWhiteText = () => {
    // Opus类型（紫色系）
    if (props.type === 'opus') {
      // 紫色进度条在任何进度下都使用白色文字，确保对比度
      if (p > 0) return true
    }
    // 窗口类型（蓝色系）
    if (props.type === 'window') {
      // 蓝色进度条在任何进度下都使用白色文字
      if (p > 0) return true
    }
    // 每日类型（绿色/黄色/红色）
    if (props.type === 'daily') {
      // 绿色、黄色、红色进度条都使用白色文字
      if (p > 0) return true
    }
    return false
  }

  if (needsWhiteText()) {
    // 增强阴影效果，确保在各种颜色背景上都清晰可见
    return 'text-white font-medium'
  } else {
    // 在浅色背景上使用深色文字
    return 'text-gray-700 dark:text-gray-300 font-medium'
  }
})

// 数值文字颜色（更突出，增强可读性）
const valueTextClass = computed(() => {
  const p = progress.value

  // 与文字颜色保持一致的逻辑
  const needsWhiteText = () => {
    if (props.type === 'opus' && p > 0) return true
    if (props.type === 'window' && p > 0) return true
    if (props.type === 'daily' && p > 0) return true
    return false
  }

  if (needsWhiteText()) {
    // 数值文字使用更粗的字重和更强的阴影
    return 'text-white font-bold'
  } else {
    // 在浅色背景上使用更深的颜色
    return 'text-gray-900 dark:text-gray-100 font-bold'
  }
})

// 文字阴影样式（增强对比度）
const textShadowStyle = computed(() => {
  const p = progress.value

  // 判断是否需要强阴影
  const needsStrongShadow = () => {
    if (props.type === 'opus' && p > 0) return true
    if (props.type === 'window' && p > 0) return true
    if (props.type === 'daily' && p > 0) return true
    return false
  }

  if (needsStrongShadow()) {
    // 在彩色背景上使用强阴影效果
    return {
      textShadow: '0 1px 3px rgba(0, 0, 0, 0.5), 0 0 8px rgba(0, 0, 0, 0.3)'
    }
  }
  return {}
})

// 数值文字阴影样式（更强的阴影效果）
const valueShadowStyle = computed(() => {
  const p = progress.value

  // 判断是否需要强阴影
  const needsStrongShadow = () => {
    if (props.type === 'opus' && p > 0) return true
    if (props.type === 'window' && p > 0) return true
    if (props.type === 'daily' && p > 0) return true
    return false
  }

  if (needsStrongShadow()) {
    // 数值文字使用更强的阴影，确保清晰可见
    return {
      textShadow: '0 1px 4px rgba(0, 0, 0, 0.6), 0 0 10px rgba(0, 0, 0, 0.4)'
    }
  }
  return {}
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
