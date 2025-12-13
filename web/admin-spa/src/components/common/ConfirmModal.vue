<template>
  <Teleport to="body">
    <div v-if="show" class="modal fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        class="modal-content mx-auto w-full max-w-md rounded-md border border-gray-200 bg-white p-6 shadow-md dark:border-gray-700 dark:bg-gray-900"
      >
        <div class="mb-6 flex items-start gap-4">
          <div
            class="flex h-12 w-12 flex-shrink-0 items-center justify-center"
          >
            <i class="fas fa-exclamation-triangle text-2xl text-orange-500" />
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
            class="flex-1 rounded-md border border-gray-200 bg-white px-4 py-2.5 font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
            @click="$emit('cancel')"
          >
            {{ cancelText }}
          </button>
          <button
            class="flex-1 rounded-md bg-orange-500 px-4 py-2.5 font-medium text-white transition-colors hover:bg-orange-600 dark:bg-orange-500 dark:hover:bg-orange-600"
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
  background: rgba(0, 0, 0, 0.4);
}

:global(.dark) .modal {
  background: rgba(0, 0, 0, 0.6);
}
</style>
