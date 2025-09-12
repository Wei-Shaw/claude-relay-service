<template>
  <div class="space-y-6">
    <div class="sm:flex sm:items-center">
      <div class="sm:flex-auto">
        <h1 class="text-2xl font-semibold text-gray-900">My API Keys</h1>
        <p class="mt-2 text-sm text-gray-700">
          Manage your API keys to access Claude Relay services
        </p>
      </div>
      <div class="mt-4 sm:ml-16 sm:mt-0 sm:flex-none">
        <button
          class="inline-flex items-center justify-center rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          :disabled="activeApiKeysCount >= maxApiKeys"
          @click="showCreateModal = true"
        >
          <svg class="-ml-1 mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              d="M12 6v6m0 0v6m0-6h6m-6 0H6"
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
            />
          </svg>
          Create API Key
        </button>
      </div>
    </div>

    <!-- API Keys 数量限制提示 -->
    <div
      v-if="activeApiKeysCount >= maxApiKeys"
      class="rounded-md border border-yellow-200 bg-yellow-50 p-4"
    >
      <div class="flex">
        <div class="flex-shrink-0">
          <svg class="h-5 w-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
            <path
              clip-rule="evenodd"
              d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
              fill-rule="evenodd"
            />
          </svg>
        </div>
        <div class="ml-3">
          <p class="text-sm text-yellow-700">
            You have reached the maximum number of API keys ({{ maxApiKeys }}). Please delete an
            existing key to create a new one.
          </p>
        </div>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="loading" class="py-12 text-center">
      <svg
        class="mx-auto h-8 w-8 animate-spin text-blue-600"
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
      <p class="mt-2 text-sm text-gray-500">Loading API keys...</p>
    </div>

    <!-- API Keys List -->
    <div v-else-if="sortedApiKeys.length > 0" class="overflow-hidden bg-white shadow sm:rounded-md">
      <ul class="divide-y divide-gray-200" role="list">
        <li v-for="apiKey in sortedApiKeys" :key="apiKey.id" class="px-6 py-4">
          <div class="flex items-center justify-between">
            <div class="flex items-center">
              <div class="flex-shrink-0">
                <div
                  :class="[
                    'h-2 w-2 rounded-full',
                    apiKey.isDeleted === 'true' || apiKey.deletedAt
                      ? 'bg-gray-400'
                      : apiKey.isActive
                        ? 'bg-green-400'
                        : 'bg-red-400'
                  ]"
                ></div>
              </div>
              <div class="ml-4">
                <div class="flex items-center">
                  <p class="text-sm font-medium text-gray-900">{{ apiKey.name }}</p>
                  <span
                    v-if="apiKey.isDeleted === 'true' || apiKey.deletedAt"
                    class="ml-2 inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-800"
                  >
                    Deleted
                  </span>
                  <span
                    v-else-if="!apiKey.isActive"
                    class="ml-2 inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800"
                  >
                    Deleted
                  </span>
                </div>
                <div class="mt-1">
                  <p class="text-sm text-gray-500">{{ apiKey.description || 'No description' }}</p>
                  <div class="mt-1 flex items-center space-x-4 text-xs text-gray-400">
                    <span>Created: {{ formatDate(apiKey.createdAt) }}</span>
                    <span v-if="apiKey.isDeleted === 'true' || apiKey.deletedAt"
                      >Deleted: {{ formatDate(apiKey.deletedAt) }}</span
                    >
                    <span v-else-if="apiKey.lastUsedAt"
                      >Last used: {{ formatDate(apiKey.lastUsedAt) }}</span
                    >
                    <span v-else>Never used</span>
                    <span
                      v-if="apiKey.expiresAt && !(apiKey.isDeleted === 'true' || apiKey.deletedAt)"
                      >Expires: {{ formatDate(apiKey.expiresAt) }}</span
                    >
                  </div>
                </div>
              </div>
            </div>
            <div class="flex items-center space-x-2">
              <!-- Usage Stats -->
              <div class="text-right text-xs text-gray-500">
                <div>{{ formatNumber(apiKey.usage?.requests || 0) }} requests</div>
                <div v-if="apiKey.usage?.totalCost">${{ apiKey.usage.totalCost.toFixed(4) }}</div>
              </div>

              <!-- Actions -->
              <div class="flex items-center space-x-1">
                <button
                  class="inline-flex items-center rounded border border-transparent p-1 text-gray-400 hover:text-gray-600"
                  title="View API Key"
                  @click="showApiKey(apiKey)"
                >
                  <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                </button>

                <button
                  v-if="
                    !(apiKey.isDeleted === 'true' || apiKey.deletedAt) &&
                    apiKey.isActive &&
                    allowUserDeleteApiKeys
                  "
                  class="inline-flex items-center rounded border border-transparent p-1 text-red-400 hover:text-red-600"
                  title="Delete API Key"
                  @click="deleteApiKey(apiKey)"
                >
                  <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                    />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </li>
      </ul>
    </div>

    <!-- Empty State -->
    <div v-else class="py-12 text-center">
      <svg
        class="mx-auto h-12 w-12 text-gray-400"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          d="M15 7a2 2 0 012 2m0 0a2 2 0 012 2m-2-2h-6m6 0v6a2 2 0 01-2 2H9a2 2 0 01-2-2V9a2 2 0 012-2h6z"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
        />
      </svg>
      <h3 class="mt-2 text-sm font-medium text-gray-900">No API keys</h3>
      <p class="mt-1 text-sm text-gray-500">Get started by creating your first API key.</p>
      <div class="mt-6">
        <button
          class="inline-flex items-center rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          @click="showCreateModal = true"
        >
          <svg class="-ml-1 mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              d="M12 6v6m0 0v6m0-6h6m-6 0H6"
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
            />
          </svg>
          Create API Key
        </button>
      </div>
    </div>

    <!-- Create API Key Modal -->
    <CreateApiKeyModal
      :show="showCreateModal"
      @close="showCreateModal = false"
      @created="handleApiKeyCreated"
    />

    <!-- View API Key Modal -->
    <ViewApiKeyModal
      :api-key="selectedApiKey"
      :show="showViewModal"
      @close="showViewModal = false"
    />

    <!-- Confirm Delete Modal -->
    <ConfirmModal
      confirm-class="bg-red-600 hover:bg-red-700"
      confirm-text="Delete"
      :message="`Are you sure you want to delete '${selectedApiKey?.name}'? This action cannot be undone.`"
      :show="showDeleteModal"
      title="Delete API Key"
      @cancel="showDeleteModal = false"
      @confirm="handleDeleteConfirm"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useUserStore } from '@/stores/user'
import { showToast } from '@/utils/toast'
import CreateApiKeyModal from './CreateApiKeyModal.vue'
import ViewApiKeyModal from './ViewApiKeyModal.vue'
import ConfirmModal from '@/components/common/ConfirmModal.vue'

const userStore = useUserStore()

const loading = ref(true)
const apiKeys = ref([])
const maxApiKeys = computed(() => userStore.config?.maxApiKeysPerUser || 5)
const allowUserDeleteApiKeys = computed(() => userStore.config?.allowUserDeleteApiKeys === true)

const showCreateModal = ref(false)
const showViewModal = ref(false)
const showDeleteModal = ref(false)
const selectedApiKey = ref(null)

// Computed property to sort API keys by creation time (descending - newest first)
const sortedApiKeys = computed(() => {
  return [...apiKeys.value].sort((a, b) => {
    const dateA = new Date(a.createdAt)
    const dateB = new Date(b.createdAt)
    return dateB - dateA // Descending order
  })
})

// Computed property to count only active (non-deleted) API keys
const activeApiKeysCount = computed(() => {
  return apiKeys.value.filter((key) => !(key.isDeleted === 'true' || key.deletedAt)).length
})

const formatNumber = (num) => {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M'
  } else if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K'
  }
  return num.toString()
}

const formatDate = (dateString) => {
  if (!dateString) return null
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

const loadApiKeys = async () => {
  loading.value = true
  try {
    apiKeys.value = await userStore.getUserApiKeys(true) // Include deleted keys
  } catch (error) {
    console.error('Failed to load API keys:', error)
    showToast('Failed to load API keys', 'error')
  } finally {
    loading.value = false
  }
}

const showApiKey = (apiKey) => {
  selectedApiKey.value = apiKey
  showViewModal.value = true
}

const deleteApiKey = (apiKey) => {
  selectedApiKey.value = apiKey
  showDeleteModal.value = true
}

const handleDeleteConfirm = async () => {
  try {
    const result = await userStore.deleteApiKey(selectedApiKey.value.id)

    if (result.success) {
      showToast('API key deleted successfully', 'success')
      await loadApiKeys()
    }
  } catch (error) {
    console.error('Failed to delete API key:', error)
    showToast('Failed to delete API key', 'error')
  } finally {
    showDeleteModal.value = false
    selectedApiKey.value = null
  }
}

const handleApiKeyCreated = async () => {
  showCreateModal.value = false
  await loadApiKeys()
}

onMounted(() => {
  loadApiKeys()
})
</script>

<style scoped>
/* 组件特定样式 */
</style>
