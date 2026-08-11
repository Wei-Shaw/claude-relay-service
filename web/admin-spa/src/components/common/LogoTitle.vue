<template>
  <div class="flex items-center gap-4">
    <!-- Logo区域：仅图片加载成功时可点击放大 -->
    <div
      :class="[
        'flex h-12 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl border border-gray-300/30 bg-gradient-to-br from-blue-500/20 to-purple-500/20 backdrop-blur-sm dark:border-gray-600/30 dark:from-blue-600/20 dark:to-purple-600/20',
        canPreview ? 'cursor-pointer transition-opacity hover:opacity-80' : ''
      ]"
      :title="canPreview ? '点击查看大图' : undefined"
      @click="openPreview"
    >
      <template v-if="!loading">
        <img
          v-if="logoSrc && !logoLoadFailed"
          alt="Logo"
          class="h-8 w-8 object-contain"
          :src="logoSrc"
          @error="handleLogoError"
          @load="handleLogoLoad"
        />
        <i v-else class="fas fa-cloud text-xl text-gray-700 dark:text-gray-300" />
      </template>
      <div v-else class="h-8 w-8 animate-pulse rounded bg-gray-300/50 dark:bg-gray-600/50" />
    </div>

    <!-- 标题区域 -->
    <div class="flex min-h-[48px] min-w-0 flex-col justify-center">
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
        <template v-if="!loading && title">
          <h1
            :class="[
              'header-title break-words text-lg font-bold leading-tight sm:text-xl md:text-2xl',
              titleClass
            ]"
          >
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

    <!-- 大图预览：z-index 高于 AppHeader 用户菜单(999999)，避免菜单浮在遮罩上 -->
    <ModalTransition @after-leave="onPreviewAfterLeave">
      <div
        v-if="previewVisible"
        class="fixed inset-0 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
        style="z-index: 1000000"
        @click="closePreview"
      >
        <button
          class="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
          title="关闭"
          type="button"
          @click.stop="closePreview"
        >
          <i class="fas fa-times text-lg" />
        </button>
        <img
          alt="Logo 预览"
          class="modal-panel max-h-[85vh] max-w-[90vw] rounded-xl object-contain shadow-2xl"
          :src="logoSrc"
          @click.stop
        />
      </div>
    </ModalTransition>
  </div>
</template>

<script setup>
import { ref, computed, watch, onBeforeUnmount } from 'vue'

import ModalTransition from '@/components/common/ModalTransition.vue'

const props = defineProps({
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

const previewVisible = ref(false)
// 图片加载失败后禁止预览，避免坏链仍显示手型/弹出空图
const logoLoadFailed = ref(false)
const logoLoaded = ref(false)

const canPreview = computed(
  () => !!props.logoSrc && !props.loading && logoLoaded.value && !logoLoadFailed.value
)

watch(
  () => props.logoSrc,
  () => {
    logoLoadFailed.value = false
    logoLoaded.value = false
    // src 变化时若预览开着则关掉，避免继续展示旧图
    if (previewVisible.value) {
      previewVisible.value = false
    }
  }
)

const onKeydown = (event) => {
  if (event.key === 'Escape') {
    closePreview()
  }
}

const openPreview = () => {
  if (!canPreview.value || previewVisible.value) {
    return
  }
  previewVisible.value = true
  window.addEventListener('keydown', onKeydown)
}

const closePreview = () => {
  if (!previewVisible.value) {
    return
  }
  previewVisible.value = false
}

// 退场动画结束后再卸键盘监听，避免中途按 Esc 打断
const onPreviewAfterLeave = () => {
  window.removeEventListener('keydown', onKeydown)
}

const handleLogoLoad = () => {
  logoLoaded.value = true
  logoLoadFailed.value = false
}

const handleLogoError = () => {
  logoLoadFailed.value = true
  logoLoaded.value = false
  if (previewVisible.value) {
    previewVisible.value = false
  }
}

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
})
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
