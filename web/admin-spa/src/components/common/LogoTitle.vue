<template>
  <div class="flex items-center gap-4">
    <!-- Logo区域 -->
    <div
      class="flex h-12 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded-md border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800"
    >
      <template v-if="!loading">
        <img
          v-if="logoSrc"
          alt="Logo"
          class="h-8 w-8 object-contain"
          :src="logoSrc"
          @error="handleLogoError"
        />
        <i v-else class="fas fa-cloud text-xl text-gray-700 dark:text-gray-300" />
      </template>
      <div v-else class="h-8 w-8 animate-pulse rounded bg-gray-300/50 dark:bg-gray-600/50" />
    </div>

    <!-- 标题区域 -->
    <div class="flex min-h-[48px] flex-col justify-center">
      <div class="flex items-center gap-3">
        <template v-if="!loading && title">
          <h1 :class="['header-title text-2xl font-bold leading-tight', titleClass]">
            {{ title }}
          </h1>
        </template>
        <div
          v-else-if="loading"
          class="h-8 w-64 animate-pulse rounded bg-gray-300/50 dark:bg-gray-600/50"
        />
        <!-- 插槽用于版本信息等额外内容 -->
        <slot name="after-title" />
      </div>
      <p v-if="subtitle" class="mt-0.5 text-sm leading-tight text-gray-600 dark:text-gray-400">
        {{ subtitle }}
      </p>
    </div>
  </div>
</template>

<script setup>
defineProps({
  loading: {
    type: Boolean,
    default: false
  },
  title: {
    type: String,
    default: ''
  },
  subtitle: {
    type: String,
    default: ''
  },
  logoSrc: {
    type: String,
    default: ''
  },
  titleClass: {
    type: String,
    default: 'text-gray-900'
  }
})

// 处理图片加载错误
const handleLogoError = (e) => {
  e.target.style.display = 'none'
}
</script>

<style scoped>
/* 骨架屏动画 */
@keyframes pulse {
  0% {
    opacity: 0.7;
  }
  50% {
    opacity: 0.4;
  }
  100% {
    opacity: 0.7;
  }
}

.animate-pulse {
  animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

/* 标题样式 */
.header-title {
  /* Clean, flat design - no shadows */
}
</style>
