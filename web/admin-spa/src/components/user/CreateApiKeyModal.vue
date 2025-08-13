<template>
  <div v-if="show" class="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
    <div class="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
      <div class="mt-3">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-medium text-gray-900">Create New API Key</h3>
          <button
            @click="$emit('close')"
            class="text-gray-400 hover:text-gray-600"
          >
            <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form @submit.prevent="handleSubmit" class="space-y-4">
          <div>
            <label for="name" class="block text-sm font-medium text-gray-700">
              Name *
            </label>
            <input
              id="name"
              v-model="form.name"
              type="text"
              required
              :disabled="loading"
              class="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              placeholder="Enter API key name"
            />
          </div>

          <div>
            <label for="description" class="block text-sm font-medium text-gray-700">
              Description
            </label>
            <textarea
              id="description"
              v-model="form.description"
              rows="3"
              :disabled="loading"
              class="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              placeholder="Optional description"
            ></textarea>
          </div>

          <div>
            <label for="tokenLimit" class="block text-sm font-medium text-gray-700">
              Token Limit (optional)
            </label>
            <input
              id="tokenLimit"
              v-model.number="form.tokenLimit"
              type="number"
              min="0"
              :disabled="loading"
              class="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              placeholder="0 = unlimited"
            />
            <p class="mt-1 text-xs text-gray-500">Set to 0 for unlimited tokens</p>
          </div>

          <div>
            <label for="dailyCostLimit" class="block text-sm font-medium text-gray-700">
              Daily Cost Limit (optional)
            </label>
            <div class="mt-1 relative rounded-md shadow-sm">
              <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <span class="text-gray-500 sm:text-sm">$</span>
              </div>
              <input
                id="dailyCostLimit"
                v-model.number="form.dailyCostLimit"
                type="number"
                min="0"
                step="0.01"
                :disabled="loading"
                class="pl-7 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                placeholder="0.00"
              />
            </div>
            <p class="mt-1 text-xs text-gray-500">Set to 0 for unlimited daily cost</p>
          </div>

          <div>
            <label for="expiresAt" class="block text-sm font-medium text-gray-700">
              Expiration Date (optional)
            </label>
            <input
              id="expiresAt"
              v-model="form.expiresAt"
              type="datetime-local"
              :disabled="loading"
              class="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            />
            <p class="mt-1 text-xs text-gray-500">Leave empty for no expiration</p>
          </div>

          <div v-if="error" class="bg-red-50 border border-red-200 rounded-md p-3">
            <div class="flex">
              <div class="flex-shrink-0">
                <svg class="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
                </svg>
              </div>
              <div class="ml-3">
                <p class="text-sm text-red-700">{{ error }}</p>
              </div>
            </div>
          </div>

          <div class="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              @click="$emit('close')"
              :disabled="loading"
              class="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              :disabled="loading || !form.name.trim()"
              class="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span v-if="loading" class="flex items-center">
                <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Creating...
              </span>
              <span v-else>Create API Key</span>
            </button>
          </div>
        </form>

        <!-- Success Modal for showing the new API key -->
        <div v-if="newApiKey" class="mt-6 p-4 bg-green-50 border border-green-200 rounded-md">
          <div class="flex items-start">
            <div class="flex-shrink-0">
              <svg class="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
              </svg>
            </div>
            <div class="ml-3 flex-1">
              <h4 class="text-sm font-medium text-green-800">API Key Created Successfully!</h4>
              <div class="mt-3">
                <p class="text-sm text-green-700 mb-2">
                  <strong>Important:</strong> Copy your API key now. You won't be able to see it again!
                </p>
                <div class="bg-white p-3 border border-green-300 rounded-md">
                  <div class="flex items-center justify-between">
                    <code class="text-sm font-mono text-gray-900 break-all">{{ newApiKey.key }}</code>
                    <button
                      @click="copyToClipboard(newApiKey.key)"
                      class="ml-3 flex-shrink-0 inline-flex items-center px-2 py-1 border border-transparent text-xs font-medium rounded text-green-700 bg-green-100 hover:bg-green-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                    >
                      <svg class="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      Copy
                    </button>
                  </div>
                </div>
              </div>
              <div class="mt-4 flex justify-end">
                <button
                  @click="handleClose"
                  class="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, watch } from 'vue'
import { useUserStore } from '@/stores/user'
import { showToast } from '@/utils/toast'

const props = defineProps({
  show: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['close', 'created'])

const userStore = useUserStore()

const loading = ref(false)
const error = ref('')
const newApiKey = ref(null)

const form = reactive({
  name: '',
  description: '',
  tokenLimit: null,
  dailyCostLimit: null,
  expiresAt: ''
})

const resetForm = () => {
  form.name = ''
  form.description = ''
  form.tokenLimit = null
  form.dailyCostLimit = null
  form.expiresAt = ''
  error.value = ''
  newApiKey.value = null
}

const handleSubmit = async () => {
  if (!form.name.trim()) {
    error.value = 'API key name is required'
    return
  }

  loading.value = true
  error.value = ''

  try {
    const apiKeyData = {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      tokenLimit: form.tokenLimit || undefined,
      dailyCostLimit: form.dailyCostLimit || undefined,
      expiresAt: form.expiresAt || undefined
    }

    const result = await userStore.createApiKey(apiKeyData)

    if (result.success) {
      newApiKey.value = result.apiKey
      showToast('API key created successfully!', 'success')
    } else {
      error.value = result.message || 'Failed to create API key'
    }
  } catch (err) {
    console.error('Create API key error:', err)
    error.value = err.response?.data?.message || err.message || 'Failed to create API key'
  } finally {
    loading.value = false
  }
}

const copyToClipboard = async (text) => {
  try {
    await navigator.clipboard.writeText(text)
    showToast('API key copied to clipboard!', 'success')
  } catch (err) {
    console.error('Failed to copy:', err)
    showToast('Failed to copy to clipboard', 'error')
  }
}

const handleClose = () => {
  resetForm()
  emit('created')
  emit('close')
}

// Reset form when modal is shown
watch(() => props.show, (newValue) => {
  if (newValue) {
    resetForm()
  }
})
</script>

<style scoped>
/* 组件特定样式 */
</style>