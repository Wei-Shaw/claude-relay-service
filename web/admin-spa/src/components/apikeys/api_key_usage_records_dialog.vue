<template>
  <ModalTransition>
    <div
      v-if="show"
      class="fixed inset-0 z-[1100] flex items-center justify-center bg-gray-900/50 p-3 backdrop-blur-sm sm:p-4"
    >
      <div class="absolute inset-0" @click="emit('close')" />
      <div
        class="modal-panel relative z-10 flex max-h-[94vh] w-full max-w-7xl flex-col overflow-hidden rounded-2xl border border-gray-200/70 bg-white shadow-2xl dark:border-gray-700/60 dark:bg-gray-900"
      >
        <div
          class="flex items-center justify-between gap-4 border-b border-gray-200 px-5 py-4 dark:border-gray-800"
        >
          <div class="min-w-0">
            <p
              class="text-sm font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400"
            >
              {{ title }}
            </p>
            <h3 class="truncate text-lg font-bold text-gray-900 dark:text-gray-100 sm:text-xl">
              {{ apiKeyName || keyId }}
            </h3>
            <p class="text-sm text-gray-500 dark:text-gray-400">ID: {{ keyId }}</p>
          </div>
          <button
            class="rounded-full p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-gray-100"
            @click="emit('close')"
          >
            <i class="fas fa-times text-lg" />
          </button>
        </div>

        <div class="flex-1 overflow-y-auto p-4 sm:p-5">
          <ApiKeyUsageRecordsPanel
            :api-key-name="apiKeyName"
            :fetch-api="fetchApi"
            :key-id="keyId"
            :show-account-column="showAccountColumn"
            :show-account-filter="showAccountFilter"
            :show-header="false"
            table-body-class="max-h-[52vh]"
          />
        </div>
      </div>
    </div>
  </ModalTransition>
</template>

<script setup>
import ModalTransition from '@/components/common/ModalTransition.vue'
import ApiKeyUsageRecordsPanel from '@/components/apikeys/api_key_usage_records_panel.vue'

defineProps({
  show: {
    type: Boolean,
    default: false
  },
  keyId: {
    type: String,
    required: true
  },
  apiKeyName: {
    type: String,
    default: ''
  },
  fetchApi: {
    type: Function,
    required: true
  },
  title: {
    type: String,
    default: 'API Key 请求详情时间线'
  },
  showAccountColumn: {
    type: Boolean,
    default: true
  },
  showAccountFilter: {
    type: Boolean,
    default: true
  }
})

const emit = defineEmits(['close'])
</script>
