<template>
  <div class="flex items-center gap-4">
    <!-- Logo区域 -->
    <div class="w-12 h-12 bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-gray-300/30 rounded-xl flex items-center justify-center backdrop-blur-sm flex-shrink-0 overflow-hidden">
      <template v-if="!loading">
        <img v-if="logoSrc" 
             :src="logoSrc" 
             alt="Logo"
             class="w-8 h-8 object-contain"
             @error="handleLogoError">
        <i v-else class="fas fa-cloud text-xl text-gray-700"></i>
      </template>
      <div v-else class="w-8 h-8 bg-gray-300/50 rounded animate-pulse"></div>
    </div>
    
    <!-- 标题区域 -->
    <div class="flex flex-col justify-center min-h-[48px]">
      <div class="flex items-center gap-3">
        <template v-if="!loading && title">
          <h1 :class="['text-2xl font-bold header-title leading-tight', titleClass]">{{ title }}</h1>
        </template>
        <div v-else-if="loading" class="h-8 w-64 bg-gray-300/50 rounded animate-pulse"></div>
        <!-- 插槽用于版本信息等额外内容 -->
        <slot name="after-title"></slot>
      </div>
      <p v-if="subtitle" class="text-gray-600 text-sm leading-tight mt-0.5">{{ subtitle }}</p>
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
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
}
</style>