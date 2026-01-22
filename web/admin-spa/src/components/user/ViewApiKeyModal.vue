<template>
  <div
    v-if="show"
    class="fixed inset-0 z-50 h-full w-full overflow-y-auto bg-gray-600 bg-opacity-50"
  >
    <div
      class="relative top-20 mx-auto w-[768px] max-w-4xl rounded-md border bg-white p-5 shadow-lg"
    >
      <div class="mt-3">
        <div class="mb-4 flex items-center justify-between">
          <h3 class="text-lg font-medium text-gray-900">API Key Details</h3>
          <button class="text-gray-400 hover:text-gray-600" @click="emit('close')">
            <svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                d="M6 18L18 6M6 6l12 12"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
              />
            </svg>
          </button>
        </div>

        <div v-if="apiKey" class="space-y-4">
          <!-- API Key Name -->
          <div>
            <label class="block text-sm font-medium text-gray-700">Name</label>
            <p class="mt-1 text-sm text-gray-900">{{ apiKey.name }}</p>
          </div>

          <!-- Description -->
          <div v-if="apiKey.description">
            <label class="block text-sm font-medium text-gray-700">Description</label>
            <p class="mt-1 text-sm text-gray-900">{{ apiKey.description }}</p>
          </div>

          <!-- API Key -->
          <div>
            <label class="block text-sm font-medium text-gray-700">API Key</label>
            <div class="mt-1 flex items-center space-x-2">
              <div class="flex-1">
                <div v-if="showFullKey" class="rounded-md border border-gray-300 bg-gray-50 p-3">
                  <code class="break-all font-mono text-sm text-gray-900">{{
                    apiKey.key || 'Not available'
                  }}</code>
                </div>
                <div v-else class="rounded-md border border-gray-300 bg-gray-50 p-3">
                  <code class="font-mono text-sm text-gray-900">{{
                    apiKey.keyPreview || 'cr_****'
                  }}</code>
                </div>
              </div>
              <div class="flex flex-col space-y-1">
                <button
                  v-if="apiKey.key"
                  class="inline-flex items-center rounded border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                  @click="showFullKey = !showFullKey"
                >
                  <svg
                    v-if="showFullKey"
                    class="mr-1 h-3 w-3"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L12 12m-1.122-2.122L12 12m-1.122-2.122l-4.243-4.242m6.879 6.878L15 15"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                    />
                  </svg>
                  <svg
                    v-else
                    class="mr-1 h-3 w-3"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                    />
                    <path
                      d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                    />
                  </svg>
                  {{ showFullKey ? 'Hide' : 'Show' }}
                </button>
                <button
                  v-if="showFullKey && apiKey.key"
                  class="inline-flex items-center rounded border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                  @click="copyToClipboard(apiKey.key)"
                >
                  <svg class="mr-1 h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                    />
                  </svg>
                  Copy
                </button>
              </div>
            </div>
            <p v-if="!apiKey.key" class="mt-1 text-xs text-gray-500">
              Full API key is only shown when first created or regenerated
            </p>
          </div>

          <!-- Status -->
          <div>
            <label class="block text-sm font-medium text-gray-700">Status</label>
            <div class="mt-1">
              <span
                :class="[
                  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                  apiKey.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                ]"
              >
                {{ apiKey.isActive ? 'Active' : 'Disabled' }}
              </span>
            </div>
          </div>

          <!-- Usage Stats -->
          <div v-if="apiKey.usage" class="border-t border-gray-200 pt-4">
            <label class="mb-2 block text-sm font-medium text-gray-700">Usage Statistics</label>
            <div class="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span class="text-gray-500">Requests:</span>
                <span class="ml-2 font-medium">{{ formatNumber(apiKey.usage.requests || 0) }}</span>
              </div>
              <div>
                <span class="text-gray-500">Input Tokens:</span>
                <span class="ml-2 font-medium">{{
                  formatNumber(apiKey.usage.inputTokens || 0)
                }}</span>
              </div>
              <div>
                <span class="text-gray-500">Output Tokens:</span>
                <span class="ml-2 font-medium">{{
                  formatNumber(apiKey.usage.outputTokens || 0)
                }}</span>
              </div>
              <div>
                <span class="text-gray-500">Total Cost:</span>
                <span class="ml-2 font-medium"
                  >${{ (apiKey.usage.totalCost || 0).toFixed(4) }}</span
                >
              </div>
            </div>
          </div>

          <!-- Timestamps -->
          <div class="space-y-2 border-t border-gray-200 pt-4 text-sm">
            <div class="flex justify-between">
              <span class="text-gray-500">Created:</span>
              <span class="text-gray-900">{{ formatDate(apiKey.createdAt) }}</span>
            </div>
            <div v-if="apiKey.lastUsedAt" class="flex justify-between">
              <span class="text-gray-500">Last Used:</span>
              <span class="text-gray-900">{{ formatDate(apiKey.lastUsedAt) }}</span>
            </div>
            <div v-if="apiKey.expiresAt" class="flex justify-between">
              <span class="text-gray-500">Expires:</span>
              <span
                :class="[
                  'font-medium',
                  new Date(apiKey.expiresAt) < new Date() ? 'text-red-600' : 'text-gray-900'
                ]"
              >
                {{ formatDate(apiKey.expiresAt) }}
              </span>
            </div>
          </div>

          <div class="flex justify-end pt-4">
            <button
              class="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              @click="emit('close')"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { showToast, formatNumber, formatDate } from '@/utils/tools'

defineProps({
  show: {
    type: Boolean,
    default: false
  },
  apiKey: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['close'])

const showFullKey = ref(false)

const copyToClipboard = async (text) => {
  try {
    await navigator.clipboard.writeText(text)
    showToast('Copied to clipboard!', 'success')
  } catch (err) {
    console.error('Failed to copy:', err)
    showToast('Failed to copy to clipboard', 'error')
  }
}
</script>
