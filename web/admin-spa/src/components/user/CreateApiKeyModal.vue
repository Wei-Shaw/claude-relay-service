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
          <h3 class="text-lg font-medium text-gray-900">Create New API Key</h3>
          <button class="text-gray-400 hover:text-gray-600" @click="$emit('close')">
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

        <form class="space-y-4" @submit.prevent="handleSubmit">
          <div>
            <label class="block text-sm font-medium text-gray-700" for="name"> Name * </label>
            <input
              id="name"
              v-model="form.name"
              class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              :disabled="loading"
              placeholder="Enter API key name"
              required
              type="text"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700" for="description">
              Description
            </label>
            <textarea
              id="description"
              v-model="form.description"
              class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              :disabled="loading"
              placeholder="Optional description"
              rows="3"
            ></textarea>
          </div>

          <div v-if="error" class="rounded-md border border-red-200 bg-red-50 p-3">
            <div class="flex">
              <div class="flex-shrink-0">
                <svg class="h-5 w-5 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    clip-rule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                    fill-rule="evenodd"
                  />
                </svg>
              </div>
              <div class="ml-3">
                <p class="text-sm text-red-700">{{ error }}</p>
              </div>
            </div>
          </div>

          <div class="flex justify-end space-x-3 pt-4">
            <button
              class="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
              :disabled="loading"
              type="button"
              @click="$emit('close')"
            >
              Cancel
            </button>
            <button
              class="rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="loading || !form.name.trim()"
              type="submit"
            >
              <span v-if="loading" class="flex items-center">
                <svg
                  class="-ml-1 mr-2 h-4 w-4 animate-spin text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <circle
                    class="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    stroke-width="4"
                  ></circle>
                  <path
                    class="opacity-75"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    fill="currentColor"
                  ></path>
                </svg>
                Creating...
              </span>
              <span v-else>Create API Key</span>
            </button>
          </div>
        </form>

        <!-- Success Modal for showing the new API key -->
        <div v-if="newApiKey" class="mt-6 rounded-md border border-green-200 bg-green-50 p-4">
          <div class="flex items-start">
            <div class="flex-shrink-0">
              <svg class="h-5 w-5 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                <path
                  clip-rule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  fill-rule="evenodd"
                />
              </svg>
            </div>
            <div class="ml-3 flex-1">
              <h4 class="text-sm font-medium text-green-800">API Key Created Successfully!</h4>
              <div class="mt-3">
                <p class="mb-2 text-sm text-green-700">
                  <strong>Important:</strong> Copy your API key now. You won't be able to see it
                  again!
                </p>
                <div class="rounded-md border border-green-300 bg-white p-3">
                  <div class="flex items-center justify-between">
                    <code class="break-all font-mono text-sm text-gray-900">{{
                      newApiKey.key
                    }}</code>
                    <button
                      class="ml-3 inline-flex flex-shrink-0 items-center rounded border border-transparent bg-green-100 px-2 py-1 text-xs font-medium text-green-700 hover:bg-green-200 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
                      @click="copyToClipboard(newApiKey.key)"
                    >
                      <svg
                        class="mr-1 h-3 w-3"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
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
              </div>
              <div class="mt-4 flex justify-end">
                <button
                  class="rounded-md border border-transparent bg-green-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
                  @click="handleClose"
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
import { showToast } from '@/utils/tools'

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
  description: ''
})

const resetForm = () => {
  form.name = ''
  form.description = ''
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
      description: form.description.trim() || undefined
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
watch(
  () => props.show,
  (newValue) => {
    if (newValue) {
      resetForm()
    }
  }
)
</script>
