<template>
  <div class="space-y-1">
    <div class="flex items-center justify-between text-xs">
      <span class="text-gray-500">{{ label }}</span>
      <span v-if="windowState === 'active'" class="font-medium text-gray-700">
        <i class="fas fa-clock mr-1 text-blue-500" />
        {{ formatTime(remainingSeconds) }}
      </span>
      <span v-else-if="windowState === 'expired'" class="font-medium text-orange-600">
        <i class="fas fa-sync-alt mr-1" />
        窗口已过期
      </span>
      <span v-else-if="windowState === 'notStarted'" class="font-medium text-gray-500">
        <i class="fas fa-pause-circle mr-1" />
        窗口未激活
      </span>
      <span v-else class="font-medium text-gray-400"> {{ rateLimitWindow }} 分钟 </span>
    </div>

    <!-- 进度条（仅在有限制时显示） -->
    <div v-if="showProgress" class="space-y-0.5">
      <div v-if="hasRequestLimit" class="space-y-0.5">
        <div class="flex items-center justify-between text-xs">
          <span class="text-gray-400">请求</span>
          <span class="text-gray-600"> {{ currentRequests || 0 }}/{{ requestLimit }} </span>
        </div>
        <div class="h-1 w-full rounded-full bg-gray-200">
          <div
            class="h-1 rounded-full transition-all duration-300"
            :class="getRequestProgressColor()"
            :style="{ width: getRequestProgress() + '%' }"
          />
        </div>
      </div>

      <!-- Token限制（向后兼容） -->
      <div v-if="hasTokenLimit" class="space-y-0.5">
        <div class="flex items-center justify-between text-xs">
          <span class="text-gray-400">Token</span>
          <span class="text-gray-600">
            {{ formatTokenCount(currentTokens || 0) }}/{{ formatTokenCount(tokenLimit) }}
          </span>
        </div>
        <div class="h-1 w-full rounded-full bg-gray-200">
          <div
            class="h-1 rounded-full transition-all duration-300"
            :class="getTokenProgressColor()"
            :style="{ width: getTokenProgress() + '%' }"
          />
        </div>
      </div>

      <!-- 费用限制（新功能） -->
      <div v-if="hasCostLimit" class="space-y-0.5">
        <div class="flex items-center justify-between text-xs">
          <span class="text-gray-400">费用</span>
          <span class="text-gray-600">
            ${{ (currentCost || 0).toFixed(2) }}/${{ costLimit.toFixed(2) }}
          </span>
        </div>
        <div class="h-1 w-full rounded-full bg-gray-200">
          <div
            class="h-1 rounded-full transition-all duration-300"
            :class="getCostProgressColor()"
            :style="{ width: getCostProgress() + '%' }"
          />
        </div>
      </div>
    </div>

    <!-- 额外提示信息 -->
    <div v-if="windowState === 'active' && showTooltip" class="text-xs text-gray-500">
      <i class="fas fa-info-circle mr-1" />
      <span v-if="remainingSeconds < 60">即将重置</span>
      <span v-else-if="remainingSeconds < 300"
        >{{ Math.ceil(remainingSeconds / 60) }} 分钟后重置</span
      >
      <span v-else>{{ formatDetailedTime(remainingSeconds) }}后重置</span>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'

const props = defineProps({
  label: {
    type: String,
    default: '窗口限制'
  },
  rateLimitWindow: {
    type: Number,
    required: true
  },
  windowStartTime: {
    type: Number,
    default: null
  },
  windowEndTime: {
    type: Number,
    default: null
  },
  windowRemainingSeconds: {
    type: Number,
    default: null
  },
  currentRequests: {
    type: Number,
    default: 0
  },
  requestLimit: {
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
  },
  currentCost: {
    type: Number,
    default: 0
  },
  costLimit: {
    type: Number,
    default: 0
  },
  showProgress: {
    type: Boolean,
    default: true
  },
  showTooltip: {
    type: Boolean,
    default: false
  }
})

// 响应式数据
const remainingSeconds = ref(props.windowRemainingSeconds)
let intervalId = null

// 计算属性
const windowState = computed(() => {
  if (props.windowStartTime === null) {
    return 'notStarted' // 窗口未开始
  }
  if (remainingSeconds.value === 0) {
    return 'expired' // 窗口已过期
  }
  if (remainingSeconds.value > 0) {
    return 'active' // 窗口活跃中
  }
  return 'unknown'
})

const hasRequestLimit = computed(() => props.requestLimit > 0)
const hasTokenLimit = computed(() => props.tokenLimit > 0)
const hasCostLimit = computed(() => props.costLimit > 0)

// 方法
const formatTime = (seconds) => {
  if (seconds === null || seconds === undefined) return '--:--'

  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60

  if (hours > 0) {
    return `${hours}h ${minutes}m`
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`
  } else {
    return `${secs}s`
  }
}

const formatDetailedTime = (seconds) => {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)

  if (hours > 0) {
    return `${hours}小时${minutes}分钟`
  } else {
    return `${minutes}分钟`
  }
}

const formatTokenCount = (count) => {
  if (count >= 1000000) {
    return (count / 1000000).toFixed(1) + 'M'
  } else if (count >= 1000) {
    return (count / 1000).toFixed(1) + 'K'
  }
  return count.toString()
}

const getRequestProgress = () => {
  if (!props.requestLimit || props.requestLimit === 0) return 0
  const percentage = ((props.currentRequests || 0) / props.requestLimit) * 100
  return Math.min(percentage, 100)
}

const getRequestProgressColor = () => {
  const progress = getRequestProgress()
  if (progress >= 100) return 'bg-red-500'
  if (progress >= 80) return 'bg-yellow-500'
  return 'bg-blue-500'
}

const getTokenProgress = () => {
  if (!props.tokenLimit || props.tokenLimit === 0) return 0
  const percentage = ((props.currentTokens || 0) / props.tokenLimit) * 100
  return Math.min(percentage, 100)
}

const getTokenProgressColor = () => {
  const progress = getTokenProgress()
  if (progress >= 100) return 'bg-red-500'
  if (progress >= 80) return 'bg-yellow-500'
  return 'bg-purple-500'
}

const getCostProgress = () => {
  if (!props.costLimit || props.costLimit === 0) return 0
  const percentage = ((props.currentCost || 0) / props.costLimit) * 100
  return Math.min(percentage, 100)
}

const getCostProgressColor = () => {
  const progress = getCostProgress()
  if (progress >= 100) return 'bg-red-500'
  if (progress >= 80) return 'bg-yellow-500'
  return 'bg-green-500'
}

// 更新倒计时
const updateCountdown = () => {
  if (props.windowEndTime && remainingSeconds.value > 0) {
    const now = Date.now()
    const remaining = Math.max(0, Math.floor((props.windowEndTime - now) / 1000))
    remainingSeconds.value = remaining

    if (remaining === 0) {
      // 窗口已过期，停止倒计时
      if (intervalId) {
        clearInterval(intervalId)
        intervalId = null
      }
    }
  }
}

// 监听props变化
watch(
  () => props.windowRemainingSeconds,
  (newVal) => {
    remainingSeconds.value = newVal
  }
)

watch(
  () => props.windowEndTime,
  (newVal) => {
    if (newVal) {
      // 重新计算剩余时间
      updateCountdown()

      // 如果窗口活跃且没有定时器，启动定时器
      if (!intervalId && remainingSeconds.value > 0) {
        intervalId = setInterval(updateCountdown, 1000)
      }
    }
  }
)

// 生命周期钩子
onMounted(() => {
  if (props.windowEndTime && remainingSeconds.value > 0) {
    // 立即更新一次
    updateCountdown()
    // 启动定时器
    intervalId = setInterval(updateCountdown, 1000)
  }
})

onUnmounted(() => {
  if (intervalId) {
    clearInterval(intervalId)
  }
})
</script>
