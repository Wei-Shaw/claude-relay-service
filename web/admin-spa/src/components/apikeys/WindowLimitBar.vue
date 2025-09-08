<template>
  <div class="w-full space-y-1">
    <!-- 时间窗口进度条 -->
    <div
      class="relative h-7 w-full overflow-hidden rounded-md border border-opacity-20 bg-gradient-to-r from-blue-50 to-cyan-100 dark:from-blue-950/30 dark:to-cyan-900/30"
    >
      <!-- 时间进度条背景 -->
      <div
        class="absolute inset-0 h-full bg-gradient-to-r from-blue-500 to-cyan-500 opacity-20 transition-all duration-1000"
        :style="{ width: timeProgress + '%' }"
      ></div>

      <!-- 文字层 -->
      <div class="relative z-10 flex h-full items-center justify-between px-2">
        <div class="flex items-center gap-1.5">
          <i class="fas fa-clock text-xs text-blue-600 dark:text-blue-400" />
          <span class="text-xs font-medium text-gray-700 dark:text-gray-200">
            {{ rateLimitWindow }}分钟窗口
          </span>
        </div>
        <span
          class="text-xs font-bold"
          :class="
            remainingSeconds > 0
              ? 'text-blue-700 dark:text-blue-300'
              : 'text-gray-400 dark:text-gray-500'
          "
        >
          {{ remainingSeconds > 0 ? formatTime(remainingSeconds) : '未激活' }}
        </span>
      </div>
    </div>

    <!-- 费用和请求限制（如果有的话） -->
    <div v-if="costLimit > 0 || requestLimit > 0" class="flex gap-1">
      <!-- 费用限制进度条 -->
      <div
        v-if="costLimit > 0"
        class="relative h-6 overflow-hidden rounded-md border border-opacity-20 bg-gradient-to-r from-green-50 to-emerald-100 dark:from-green-950/30 dark:to-emerald-900/30"
        :class="requestLimit > 0 ? 'w-1/2' : 'w-full'"
      >
        <!-- 进度条 -->
        <div
          class="absolute inset-0 h-full transition-all duration-500 ease-out"
          :class="getCostProgressBarClass()"
          :style="{ width: costProgress + '%' }"
        ></div>

        <!-- 文字 -->
        <div class="relative z-10 flex h-full items-center justify-between px-2">
          <span class="text-[10px] font-medium" :class="getCostTextClass()">费用</span>
          <span class="text-[10px] font-bold" :class="getCostValueTextClass()">
            ${{ currentCost.toFixed(1) }}/${{ costLimit.toFixed(0) }}
          </span>
        </div>
      </div>

      <!-- 请求限制进度条 -->
      <div
        v-if="requestLimit > 0"
        class="relative h-6 overflow-hidden rounded-md border border-opacity-20 bg-gradient-to-r from-purple-50 to-indigo-100 dark:from-purple-950/30 dark:to-indigo-900/30"
        :class="costLimit > 0 ? 'w-1/2' : 'w-full'"
      >
        <!-- 进度条 -->
        <div
          class="absolute inset-0 h-full transition-all duration-500 ease-out"
          :class="getRequestProgressBarClass()"
          :style="{ width: requestProgress + '%' }"
        ></div>

        <!-- 文字 -->
        <div class="relative z-10 flex h-full items-center justify-between px-2">
          <span class="text-[10px] font-medium" :class="getRequestTextClass()">请求</span>
          <span class="text-[10px] font-bold" :class="getRequestValueTextClass()">
            {{ currentRequests }}/{{ requestLimit }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  rateLimitWindow: {
    type: Number,
    required: true
  },
  remainingSeconds: {
    type: Number,
    default: 0
  },
  currentRequests: {
    type: Number,
    default: 0
  },
  requestLimit: {
    type: Number,
    default: 0
  },
  currentCost: {
    type: Number,
    default: 0
  },
  costLimit: {
    type: Number,
    default: 0
  },
  currentTokens: {
    type: Number,
    default: 0
  },
  tokenLimit: {
    type: Number,
    default: 0
  }
})

// 费用进度
const costProgress = computed(() => {
  if (!props.costLimit || props.costLimit === 0) return 0
  const percentage = (props.currentCost / props.costLimit) * 100
  return Math.min(percentage, 100)
})

// 请求进度
const requestProgress = computed(() => {
  if (!props.requestLimit || props.requestLimit === 0) return 0
  const percentage = (props.currentRequests / props.requestLimit) * 100
  return Math.min(percentage, 100)
})

// 时间进度（倒计时）
const timeProgress = computed(() => {
  if (!props.rateLimitWindow || props.rateLimitWindow === 0) return 0
  const totalSeconds = props.rateLimitWindow * 60
  const elapsed = totalSeconds - props.remainingSeconds
  return Math.max(0, (elapsed / totalSeconds) * 100)
})

// 费用进度条颜色
const getCostProgressBarClass = () => {
  const p = costProgress.value
  if (p >= 90) {
    return 'bg-gradient-to-r from-red-500 to-rose-600'
  } else if (p >= 70) {
    return 'bg-gradient-to-r from-orange-500 to-amber-500'
  } else {
    return 'bg-gradient-to-r from-green-500 to-emerald-500'
  }
}

// 请求进度条颜色
const getRequestProgressBarClass = () => {
  const p = requestProgress.value
  if (p >= 90) {
    return 'bg-gradient-to-r from-red-500 to-pink-600'
  } else if (p >= 70) {
    return 'bg-gradient-to-r from-orange-500 to-yellow-500'
  } else {
    return 'bg-gradient-to-r from-purple-500 to-indigo-600'
  }
}

// 费用文字颜色
const getCostTextClass = () => {
  const p = costProgress.value
  if (p > 50) {
    return 'text-white drop-shadow-sm'
  } else {
    return 'text-gray-600 dark:text-gray-300'
  }
}

const getCostValueTextClass = () => {
  const p = costProgress.value
  if (p > 50) {
    return 'text-white drop-shadow-md'
  } else {
    return 'text-gray-800 dark:text-gray-200'
  }
}

// 请求文字颜色
const getRequestTextClass = () => {
  const p = requestProgress.value
  if (p > 50) {
    return 'text-white drop-shadow-sm'
  } else {
    return 'text-gray-600 dark:text-gray-300'
  }
}

const getRequestValueTextClass = () => {
  const p = requestProgress.value
  if (p > 50) {
    return 'text-white drop-shadow-md'
  } else {
    return 'text-gray-800 dark:text-gray-200'
  }
}

// 格式化时间
const formatTime = (seconds) => {
  if (seconds === null || seconds === undefined) return '--:--'

  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60

  if (hours > 0) {
    return `${hours}h${minutes}m`
  } else if (minutes > 0) {
    return `${minutes}m${secs}s`
  } else {
    return `${secs}s`
  }
}

// 格式化Token数 - 暂时未使用
// const formatTokens = (count) => {
//   if (count >= 1000000) {
//     return (count / 1000000).toFixed(1) + 'M'
//   } else if (count >= 1000) {
//     return (count / 1000).toFixed(1) + 'K'
//   }
//   return count.toString()
// }
</script>

<style scoped>
.border-opacity-20 {
  border-color: rgba(0, 0, 0, 0.05);
}

.dark .border-opacity-20 {
  border-color: rgba(255, 255, 255, 0.1);
}
</style>
