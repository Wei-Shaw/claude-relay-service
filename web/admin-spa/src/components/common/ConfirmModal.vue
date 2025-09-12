<template>
  <Teleport to="body">
    <div v-if="show" class="modal fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        class="modal-content mx-auto w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-gray-800"
      >
        <div class="mb-6 flex items-start gap-4">
          <div
            class="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-yellow-400 to-yellow-500"
          >
            <i class="fas fa-exclamation text-xl text-white" />
          </div>
          <div class="flex-1">
            <h3 class="mb-2 text-lg font-bold text-gray-900 dark:text-white">
              {{ title }}
            </h3>
            <p class="whitespace-pre-line text-sm leading-relaxed text-gray-700 dark:text-gray-300">
              {{ message }}
            </p>
          </div>
        </div>

        <div class="flex gap-3">
          <button
            class="flex-1 rounded-xl bg-gray-100 px-4 py-2.5 font-medium text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
            @click="$emit('cancel')"
          >
            {{ cancelText }}
          </button>
          <button
            class="flex-1 rounded-xl bg-gradient-to-r from-yellow-500 to-orange-500 px-4 py-2.5 font-medium text-white shadow-sm transition-colors hover:from-yellow-600 hover:to-orange-600"
            @click="$emit('confirm')"
          >
            {{ confirmText }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
defineProps({
  show: {
    type: Boolean,
    required: true
  },
  title: {
    type: String,
    default: ''
  },
  message: {
    type: String,
    default: ''
  },
  confirmText: {
    type: String,
    default: '继续'
  },
  cancelText: {
    type: String,
    default: '取消'
  }
})

defineEmits(['confirm', 'cancel'])
</script>

<style scoped>
.modal {
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(8px);
}

:global(.dark) .modal {
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(8px);
}
</style>
