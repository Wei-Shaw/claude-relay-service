<template>
  <Teleport to="body">
    <Transition name="modal" appear>
      <div 
        v-if="isVisible"
        class="fixed inset-0 modal z-[100] flex items-center justify-center p-4"
        @click.self="handleCancel"
      >
        <div class="modal-content w-full max-w-md p-6 mx-auto">
          <div class="flex items-start gap-4 mb-6">
            <div class="flex-shrink-0 w-12 h-12 bg-gradient-to-br from-amber-500 to-amber-600 rounded-xl flex items-center justify-center">
              <i class="fas fa-exclamation-triangle text-white text-lg"></i>
            </div>
            <div class="flex-1">
              <h3 class="text-lg font-semibold text-gray-900 mb-2">{{ title }}</h3>
              <div class="text-gray-600 leading-relaxed whitespace-pre-line">{{ message }}</div>
            </div>
          </div>
          
          <div class="flex items-center justify-end gap-3">
            <button 
              @click="handleCancel"
              class="btn bg-gray-100 text-gray-700 hover:bg-gray-200 px-6 py-3"
              :disabled="isProcessing"
            >
              {{ cancelText }}
            </button>
            <button 
              @click="handleConfirm"
              class="btn btn-warning px-6 py-3"
              :class="{ 'opacity-50 cursor-not-allowed': isProcessing }"
              :disabled="isProcessing"
            >
              <div v-if="isProcessing" class="loading-spinner mr-2"></div>
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
const showConfirm = (titleText, messageText, confirmTextParam = '确认', cancelTextParam = '取消') => {
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
.modal {
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(8px);
}

.modal-content {
  background: white;
  border-radius: 16px;
  box-shadow: 0 20px 64px rgba(0, 0, 0, 0.15);
  border: 1px solid #e5e7eb;
  max-height: 90vh;
  overflow-y: auto;
}

.btn {
  @apply inline-flex items-center justify-center px-4 py-2 text-sm font-semibold rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2;
}

.btn-danger {
  @apply bg-red-600 text-white hover:bg-red-700 focus:ring-red-500;
}

.btn-warning {
  @apply bg-amber-600 text-white hover:bg-amber-700 focus:ring-amber-500;
}

.loading-spinner {
  @apply w-4 h-4 border-2 border-gray-300 border-t-white rounded-full animate-spin;
}

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

/* Scrollbar styling */
.modal-content::-webkit-scrollbar {
  width: 6px;
}

.modal-content::-webkit-scrollbar-track {
  background: #f1f5f9;
  border-radius: 3px;
}

.modal-content::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 3px;
}

.modal-content::-webkit-scrollbar-thumb:hover {
  background: #94a3b8;
}
</style>