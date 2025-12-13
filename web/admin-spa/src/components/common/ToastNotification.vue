<template>
  <Teleport to="body">
    <div class="toast-container">
      <div
        v-for="toast in toasts"
        :key="toast.id"
        :class="['toast', `toast-${toast.type}`, toast.isVisible ? 'toast-show' : 'toast-hide']"
        @click="removeToast(toast.id)"
      >
        <div class="toast-content">
          <div class="toast-icon">
            <i :class="getIconClass(toast.type)" />
          </div>
          <div class="toast-body">
            <div v-if="toast.title" class="toast-title">
              {{ toast.title }}
            </div>
            <div class="toast-message">
              {{ toast.message }}
            </div>
          </div>
          <button class="toast-close" @click.stop="removeToast(toast.id)">
            <i class="fas fa-times" />
          </button>
        </div>
        <div
          v-if="toast.duration > 0"
          class="toast-progress"
          :style="{ animationDuration: `${toast.duration}ms` }"
        />
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

// 状态
const toasts = ref([])
let toastIdCounter = 0

// 获取图标类名
const getIconClass = (type) => {
  const iconMap = {
    success: 'fas fa-check-circle',
    error: 'fas fa-exclamation-circle',
    warning: 'fas fa-exclamation-triangle',
    info: 'fas fa-info-circle'
  }
  return iconMap[type] || iconMap.info
}

// 添加Toast
const addToast = (message, type = 'info', title = null, duration = 5000) => {
  const id = ++toastIdCounter
  const toast = {
    id,
    message,
    type,
    title,
    duration,
    isVisible: false
  }

  toasts.value.push(toast)

  // 下一帧显示动画
  setTimeout(() => {
    toast.isVisible = true
  }, 10)

  // 自动移除
  if (duration > 0) {
    setTimeout(() => {
      removeToast(id)
    }, duration)
  }

  return id
}

// 移除Toast
const removeToast = (id) => {
  const index = toasts.value.findIndex((toast) => toast.id === id)
  if (index > -1) {
    const toast = toasts.value[index]
    toast.isVisible = false

    // 等待动画完成后移除
    setTimeout(() => {
      const currentIndex = toasts.value.findIndex((t) => t.id === id)
      if (currentIndex > -1) {
        toasts.value.splice(currentIndex, 1)
      }
    }, 300)
  }
}

// 清除所有Toast
const clearAllToasts = () => {
  toasts.value.forEach((toast) => {
    toast.isVisible = false
  })

  setTimeout(() => {
    toasts.value.length = 0
  }, 300)
}

// 暴露方法给全局使用
const showToast = (message, type = 'info', title = null, duration = 5000) => {
  return addToast(message, type, title, duration)
}

// 全局方法注册
onMounted(() => {
  // 将方法挂载到全局
  window.showToast = showToast
})

onUnmounted(() => {
  // 清理全局方法
  if (window.showToast === showToast) {
    delete window.showToast
  }
})

// 暴露方法供组件使用
defineExpose({
  showToast,
  removeToast,
  clearAllToasts
})
</script>

<style scoped>
.toast-container {
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: 12px;
  pointer-events: none;
}

.toast {
  min-width: 320px;
  max-width: 500px;
  background: white;
  border-radius: 5px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  border: 1px solid #eaeaea;
  overflow: hidden;
  position: relative;
  pointer-events: auto;
  cursor: pointer;
  transform: translateX(100%);
  opacity: 0;
  transition: all 0.2s ease;
}

:global(.dark) .toast {
  background: #1f1f1f;
  border: 1px solid #333;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.toast-show {
  transform: translateX(0);
  opacity: 1;
}

.toast-hide {
  transform: translateX(100%);
  opacity: 0;
}

.toast-content {
  display: flex;
  align-items: flex-start;
  padding: 16px;
  gap: 12px;
}

.toast-icon {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  font-size: 14px;
}

.toast-body {
  flex: 1;
}

.toast-title {
  font-weight: 600;
  font-size: 14px;
  line-height: 1.4;
  margin-bottom: 4px;
}

.toast-message {
  font-size: 14px;
  line-height: 1.5;
  word-wrap: break-word;
}

.toast-close {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  border: none;
  background: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  color: #9ca3af;
  transition: all 0.2s ease;
}

.toast-close:hover {
  background: #fafafa;
  color: #666;
}

:global(.dark) .toast-close:hover {
  background: #2a2a2a;
  color: #999;
}

.toast-progress {
  position: absolute;
  bottom: 0;
  left: 0;
  height: 3px;
  background: currentColor;
  opacity: 0.3;
  animation: toast-progress linear forwards;
}

@keyframes toast-progress {
  from {
    width: 100%;
  }
  to {
    width: 0%;
  }
}

/* Success Toast */
.toast-success {
  border-left: 4px solid #0070f3;
}

.toast-success .toast-icon {
  color: #0070f3;
  background: transparent;
}

:global(.dark) .toast-success .toast-icon {
  background: transparent;
}

.toast-success .toast-title {
  color: #000;
}

:global(.dark) .toast-success .toast-title {
  color: #fff;
}

.toast-success .toast-message {
  color: #666;
}

:global(.dark) .toast-success .toast-message {
  color: #999;
}

.toast-success .toast-progress {
  background: #0070f3;
}

/* Error Toast */
.toast-error {
  border-left: 4px solid #e00;
}

.toast-error .toast-icon {
  color: #e00;
  background: transparent;
}

:global(.dark) .toast-error .toast-icon {
  background: transparent;
}

.toast-error .toast-title {
  color: #000;
}

:global(.dark) .toast-error .toast-title {
  color: #fff;
}

.toast-error .toast-message {
  color: #666;
}

:global(.dark) .toast-error .toast-message {
  color: #999;
}

.toast-error .toast-progress {
  background: #e00;
}

/* Warning Toast */
.toast-warning {
  border-left: 4px solid #f5a623;
}

.toast-warning .toast-icon {
  color: #f5a623;
  background: transparent;
}

:global(.dark) .toast-warning .toast-icon {
  background: transparent;
}

.toast-warning .toast-title {
  color: #000;
}

:global(.dark) .toast-warning .toast-title {
  color: #fff;
}

.toast-warning .toast-message {
  color: #666;
}

:global(.dark) .toast-warning .toast-message {
  color: #999;
}

.toast-warning .toast-progress {
  background: #f5a623;
}

/* Info Toast */
.toast-info {
  border-left: 4px solid #0070f3;
}

.toast-info .toast-icon {
  color: #0070f3;
  background: transparent;
}

:global(.dark) .toast-info .toast-icon {
  background: transparent;
}

.toast-info .toast-title {
  color: #000;
}

:global(.dark) .toast-info .toast-title {
  color: #fff;
}

.toast-info .toast-message {
  color: #666;
}

:global(.dark) .toast-info .toast-message {
  color: #999;
}

.toast-info .toast-progress {
  background: #0070f3;
}

/* Responsive */
@media (max-width: 640px) {
  .toast-container {
    top: 10px;
    right: 10px;
    left: 10px;
  }

  .toast {
    min-width: auto;
    max-width: none;
  }
}

/* Toast List Transitions */
.toast-list-enter-active,
.toast-list-leave-active {
  transition: all 0.3s ease;
}

.toast-list-enter-from {
  opacity: 0;
  transform: translateX(100%);
}

.toast-list-leave-to {
  opacity: 0;
  transform: translateX(100%);
}

.toast-list-move {
  transition: transform 0.3s ease;
}
</style>
