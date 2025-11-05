<template>
  <div
    class="animated-stat-card group relative overflow-hidden rounded-2xl border border-gray-200/50 p-6 backdrop-blur-xl transition-all duration-500 hover:scale-[1.02] hover:shadow-2xl dark:border-gray-700/50"
    :class="cardClasses"
  >
    <!-- 背景渐变动画 -->
    <div class="absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100">
      <div class="absolute inset-0 bg-gradient-to-br" :class="gradientClasses"></div>
    </div>

    <!-- 光效 -->
    <div
      class="absolute -right-10 -top-10 h-32 w-32 rounded-full opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-30"
      :class="glowClasses"
    ></div>

    <!-- 内容 -->
    <div class="relative z-10 flex items-center justify-between">
      <div class="flex-1">
        <p class="mb-2 text-sm font-semibold text-gray-600 dark:text-gray-400">
          <slot name="title">{{ title }}</slot>
        </p>
        <p
          class="mb-1 text-3xl font-bold transition-colors duration-300 group-hover:text-white"
          :class="valueClasses"
        >
          <slot name="value">{{ value }}</slot>
        </p>
        <p v-if="subtitle" class="text-xs text-gray-500 dark:text-gray-400">
          <slot name="subtitle">{{ subtitle }}</slot>
        </p>
      </div>

      <!-- 图标 -->
      <div
        class="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl text-2xl text-white shadow-lg transition-all duration-500 group-hover:scale-110 group-hover:rotate-3"
        :class="iconBgClasses"
      >
        <slot name="icon">
          <i :class="icon" />
        </slot>
      </div>
    </div>

    <!-- 底部指示器 -->
    <div v-if="trend" class="relative z-10 mt-4 flex items-center text-xs font-medium">
      <span
        :class="[
          'flex items-center gap-1',
          trendDirection === 'up' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
        ]"
      >
        <i :class="trendDirection === 'up' ? 'fas fa-arrow-up' : 'fas fa-arrow-down'"></i>
        {{ trend }}
      </span>
      <span v-if="trendText" class="ml-2 text-gray-500 dark:text-gray-400">{{ trendText }}</span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  title: {
    type: String,
    default: ''
  },
  value: {
    type: [String, Number],
    default: ''
  },
  subtitle: {
    type: String,
    default: ''
  },
  icon: {
    type: String,
    default: 'fas fa-chart-line'
  },
  variant: {
    type: String,
    default: 'primary',
    validator: (value) => ['primary', 'secondary', 'success', 'warning', 'danger', 'info'].includes(value)
  },
  trend: {
    type: String,
    default: ''
  },
  trendDirection: {
    type: String,
    default: 'up',
    validator: (value) => ['up', 'down'].includes(value)
  },
  trendText: {
    type: String,
    default: ''
  }
})

const cardClasses = computed(() => {
  const variants = {
    primary: 'bg-white/80 dark:bg-gray-800/80',
    secondary: 'bg-white/80 dark:bg-gray-800/80',
    success: 'bg-white/80 dark:bg-gray-800/80',
    warning: 'bg-white/80 dark:bg-gray-800/80',
    danger: 'bg-white/80 dark:bg-gray-800/80',
    info: 'bg-white/80 dark:bg-gray-800/80'
  }
  return variants[props.variant]
})

const gradientClasses = computed(() => {
  const gradients = {
    primary: 'from-primary-500/20 to-primary-600/20',
    secondary: 'from-secondary-500/20 to-secondary-600/20',
    success: 'from-green-500/20 to-emerald-600/20',
    warning: 'from-amber-500/20 to-orange-600/20',
    danger: 'from-red-500/20 to-red-600/20',
    info: 'from-blue-500/20 to-cyan-600/20'
  }
  return gradients[props.variant]
})

const glowClasses = computed(() => {
  const glows = {
    primary: 'bg-primary-500',
    secondary: 'bg-secondary-500',
    success: 'bg-green-500',
    warning: 'bg-amber-500',
    danger: 'bg-red-500',
    info: 'bg-blue-500'
  }
  return glows[props.variant]
})

const iconBgClasses = computed(() => {
  const backgrounds = {
    primary: 'bg-gradient-to-br from-primary-500 to-primary-600',
    secondary: 'bg-gradient-to-br from-secondary-500 to-secondary-600',
    success: 'bg-gradient-to-br from-green-500 to-emerald-600',
    warning: 'bg-gradient-to-br from-amber-500 to-orange-600',
    danger: 'bg-gradient-to-br from-red-500 to-red-600',
    info: 'bg-gradient-to-br from-blue-500 to-cyan-600'
  }
  return backgrounds[props.variant]
})

const valueClasses = computed(() => {
  const colors = {
    primary: 'text-gray-900 dark:text-gray-100',
    secondary: 'text-gray-900 dark:text-gray-100',
    success: 'text-green-600 dark:text-green-400',
    warning: 'text-amber-600 dark:text-amber-400',
    danger: 'text-red-600 dark:text-red-400',
    info: 'text-blue-600 dark:text-blue-400'
  }
  return colors[props.variant]
})
</script>

<style scoped>
.animated-stat-card {
  animation: fadeInUp 0.6s ease-out;
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
