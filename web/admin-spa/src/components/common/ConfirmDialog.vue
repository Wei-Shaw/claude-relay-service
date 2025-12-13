<template>
  <Teleport to="body">
    <Transition appear name="modal">
      <div
        v-if="isVisible"
        class="modal fixed inset-0 z-[100] flex items-center justify-center p-4"
        @click.self="handleCancel"
      >
        <div class="modal-content mx-auto w-full max-w-md p-6">
          <div class="mb-6 flex items-start gap-4">
            <div
              class="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-amber-600"
            >
              <i class="fas fa-exclamation-triangle text-lg text-white" />
            </div>
            <div class="flex-1">
              <h3 class="mb-2 text-lg font-semibold text-gray-900 dark:text-white">
                {{ title }}
              </h3>
              <div class="whitespace-pre-line leading-relaxed text-gray-700 dark:text-gray-400">
                {{ message }}
              </div>
            </div>
          </div>

          <div class="flex items-center justify-end gap-3">
            <button
              class="btn btn-secondary px-6 py-3"
              :disabled="isProcessing"
              @click="handleCancel"
            >
              {{ cancelText }}
            </button>
            <button
              class="btn btn-warning px-6 py-3"
              :class="{ 'cursor-not-allowed opacity-50': isProcessing }"
              :disabled="isProcessing"
              @click="handleConfirm"
            >
              <div v-if="isProcessing" class="loading-spinner mr-2" />
              {{ confirmText }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
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
/* Modal transitions */
.modal-enter-active,
.modal-leave-active {
  transition: all 0.3s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-active .modal-content,
.modal-leave-active .modal-content {
  transition: transform 0.3s ease;
}

.modal-enter-from .modal-content,
.modal-leave-to .modal-content {
  transform: scale(0.9) translateY(-20px);
}
</style>
