<template>
  <Teleport to="body">
    <div v-if="show" class="fixed inset-0 modal z-50 flex items-center justify-center p-4">
      <div class="modal-content w-full max-w-md p-6 mx-auto">
        <div class="flex items-start gap-4 mb-6">
          <div class="w-12 h-12 bg-gradient-to-br from-yellow-400 to-yellow-500 rounded-full flex items-center justify-center flex-shrink-0">
            <i class="fas fa-exclamation text-white text-xl"></i>
          </div>
          <div class="flex-1">
            <h3 class="text-lg font-bold text-gray-900 mb-2">{{ title }}</h3>
            <p class="text-gray-600 text-sm leading-relaxed whitespace-pre-line">{{ message }}</p>
          </div>
        </div>
        
        <div class="flex gap-3">
          <button 
            @click="$emit('cancel')"
            class="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-colors"
          >
            {{ cancelText }}
          </button>
          <button 
            @click="$emit('confirm')"
            class="flex-1 px-4 py-2.5 bg-gradient-to-r from-yellow-500 to-orange-500 text-white rounded-xl font-medium hover:from-yellow-600 hover:to-orange-600 transition-colors shadow-sm"
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