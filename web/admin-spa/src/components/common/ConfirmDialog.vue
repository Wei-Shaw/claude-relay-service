<template>
  <Teleport to="body">
    <div v-if="isVisible" class="confirm-overlay" @click.self="handleCancel">
      <div class="confirm-dialog">
        <!-- Title -->
        <h3 class="dialog-title">
          {{ title }}
        </h3>

        <!-- Message -->
        <p class="dialog-message">
          {{ message }}
        </p>

        <!-- Buttons -->
        <div class="dialog-actions">
          <button
            class="vercel-button cancel-button"
            :disabled="isProcessing"
            @click="handleCancel"
          >
            {{ cancelText }}
          </button>
          <button
            class="vercel-button confirm-button"
            :disabled="isProcessing"
            @click="handleConfirm"
          >
            <span v-if="isProcessing" class="button-spinner" />
            {{ confirmText }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

// 状态
const isVisible = ref(false)
const isProcessing = ref(false)
const title = ref('')
const message = ref('')
const confirmText = ref('确认')
const cancelText = ref('取消')
let resolvePromise = null

// 显示确认对话框
const showConfirm = (
  titleText,
  messageText,
  confirmTextParam = '确认',
  cancelTextParam = '取消'
) => {
  return new Promise((resolve) => {
    title.value = titleText
    message.value = messageText
    confirmText.value = confirmTextParam
    cancelText.value = cancelTextParam
    isVisible.value = true
    isProcessing.value = false
    resolvePromise = resolve
  })
}

// 处理确认
const handleConfirm = () => {
  if (isProcessing.value) return

  isProcessing.value = true

  // 延迟一点时间以显示loading状态
  setTimeout(() => {
    isVisible.value = false
    isProcessing.value = false
    if (resolvePromise) {
      resolvePromise(true)
      resolvePromise = null
    }
  }, 200)
}

// 处理取消
const handleCancel = () => {
  if (isProcessing.value) return

  isVisible.value = false
  if (resolvePromise) {
    resolvePromise(false)
    resolvePromise = null
  }
}

// 键盘事件处理
const handleKeydown = (event) => {
  if (!isVisible.value) return

  if (event.key === 'Escape') {
    handleCancel()
  } else if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.altKey) {
    handleConfirm()
  }
}

// 全局方法注册
onMounted(() => {
  window.showConfirm = showConfirm
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  if (window.showConfirm === showConfirm) {
    delete window.showConfirm
  }
  document.removeEventListener('keydown', handleKeydown)
})

// 暴露方法供组件使用
defineExpose({
  showConfirm
})
</script>

<style scoped>
/* Vercel-inspired Confirm Dialog */

/* Overlay */
.confirm-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
}

:global(.dark) .confirm-overlay {
  background: rgba(0, 0, 0, 0.7);
}

/* Dialog */
.confirm-dialog {
  width: 100%;
  max-width: 440px;
  padding: 2rem;
  background: #fff;
  border: 1px solid #eaeaea;
  border-radius: 8px;
  box-shadow:
    0 8px 30px rgba(0, 0, 0, 0.12),
    0 1px 3px rgba(0, 0, 0, 0.08);
  animation: dialog-appear 0.2s ease-out;
}

:global(.dark) .confirm-dialog {
  background: #000;
  border-color: #333;
  box-shadow:
    0 8px 30px rgba(0, 0, 0, 0.4),
    0 1px 3px rgba(0, 0, 0, 0.3);
}

@keyframes dialog-appear {
  from {
    opacity: 0;
    transform: scale(0.96) translateY(8px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

/* Title */
.dialog-title {
  margin: 0 0 0.75rem;
  font-size: 1.25rem;
  font-weight: 600;
  color: #000;
  line-height: 1.3;
  letter-spacing: -0.01em;
}

:global(.dark) .dialog-title {
  color: #fff;
}

/* Message */
.dialog-message {
  margin: 0 0 2rem;
  font-size: 0.9375rem;
  line-height: 1.6;
  color: #666;
  white-space: pre-line;
}

:global(.dark) .dialog-message {
  color: #999;
}

/* Actions */
.dialog-actions {
  display: flex;
  gap: 0.75rem;
  justify-content: flex-end;
}

/* Vercel-style Button Base */
.vercel-button {
  height: 40px;
  padding: 0 1.25rem;
  font-size: 0.875rem;
  font-weight: 500;
  border-radius: 5px;
  cursor: pointer;
  outline: none;
  transition: all 0.2s ease;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  border: 1px solid transparent;
  user-select: none;
  box-sizing: border-box;
}

.vercel-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Cancel Button - Secondary style */
.cancel-button {
  color: #000;
  background: #fff;
  border-color: #eaeaea;
}

.cancel-button:hover:not(:disabled) {
  background: #fafafa;
  border-color: #000;
}

.cancel-button:active:not(:disabled) {
  background: #eaeaea;
  transform: scale(0.98);
}

:global(.dark) .cancel-button {
  color: #fff;
  background: #000;
  border-color: #333;
}

:global(.dark) .cancel-button:hover:not(:disabled) {
  background: #1a1a1a;
  border-color: #fff;
}

:global(.dark) .cancel-button:active:not(:disabled) {
  background: #0a0a0a;
}

/* Confirm Button - Danger/Red style */
.confirm-button {
  color: #fff;
  background: #e00;
  border-color: #e00;
}

.confirm-button:hover:not(:disabled) {
  background: #c00;
  border-color: #c00;
}

.confirm-button:active:not(:disabled) {
  background: #a00;
  transform: scale(0.98);
}

:global(.dark) .confirm-button {
  color: #fff;
  background: #e00;
  border-color: #e00;
}

:global(.dark) .confirm-button:hover:not(:disabled) {
  background: #ff1a1a;
  border-color: #ff1a1a;
}

:global(.dark) .confirm-button:active:not(:disabled) {
  background: #c00;
}

/* Button Spinner */
.button-spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-radius: 50%;
  border-top-color: #fff;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* Responsive */
@media (max-width: 480px) {
  .confirm-dialog {
    padding: 1.5rem;
  }

  .dialog-title {
    font-size: 1.125rem;
  }

  .dialog-actions {
    flex-direction: column;
  }

  .vercel-button {
    width: 100%;
  }
}
</style>
