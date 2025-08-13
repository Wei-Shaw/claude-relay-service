<template>
  <div v-if="show" class="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
    <div class="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
      <div class="mt-3">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-medium text-gray-900">Change User Role</h3>
          <button
            @click="$emit('close')"
            class="text-gray-400 hover:text-gray-600"
          >
            <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div v-if="user" class="space-y-4">
          <!-- User Info -->
          <div class="bg-gray-50 p-4 rounded-md">
            <div class="flex items-center">
              <div class="flex-shrink-0">
                <div class="h-10 w-10 rounded-full bg-gray-300 flex items-center justify-center">
                  <svg class="h-6 w-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
              </div>
              <div class="ml-4">
                <p class="text-sm font-medium text-gray-900">{{ user.displayName || user.username }}</p>
                <p class="text-sm text-gray-500">@{{ user.username }}</p>
                <div class="mt-1">
                  <span :class="[
                    'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
                    user.role === 'admin' 
                      ? 'bg-purple-100 text-purple-800' 
                      : 'bg-blue-100 text-blue-800'
                  ]">
                    Current: {{ user.role }}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <!-- Role Selection -->
          <form @submit.prevent="handleSubmit" class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">
                New Role
              </label>
              <div class="space-y-2">
                <label class="flex items-center">
                  <input
                    v-model="selectedRole"
                    type="radio"
                    value="user"
                    :disabled="loading"
                    class="focus:ring-blue-500 h-4 w-4 text-blue-600 border-gray-300"
                  />
                  <div class="ml-3">
                    <div class="text-sm font-medium text-gray-900">User</div>
                    <div class="text-xs text-gray-500">Regular user with basic permissions</div>
                  </div>
                </label>
                <label class="flex items-center">
                  <input
                    v-model="selectedRole"
                    type="radio"
                    value="admin"
                    :disabled="loading"
                    class="focus:ring-blue-500 h-4 w-4 text-blue-600 border-gray-300"
                  />
                  <div class="ml-3">
                    <div class="text-sm font-medium text-gray-900">Administrator</div>
                    <div class="text-xs text-gray-500">Full access to manage users and system</div>
                  </div>
                </label>
              </div>
            </div>

            <!-- Warning for role changes -->
            <div v-if="selectedRole !== user.role" class="bg-yellow-50 border border-yellow-200 rounded-md p-4">
              <div class="flex">
                <div class="flex-shrink-0">
                  <svg class="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
                  </svg>
                </div>
                <div class="ml-3">
                  <h3 class="text-sm font-medium text-yellow-800">Role Change Warning</h3>
                  <div class="mt-2 text-sm text-yellow-700">
                    <p v-if="selectedRole === 'admin'">
                      Granting admin privileges will give this user full access to the system, including the ability to manage other users and their API keys.
                    </p>
                    <p v-else>
                      Removing admin privileges will restrict this user to only managing their own API keys and viewing their own usage statistics.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div v-if="error" class="bg-red-50 border border-red-200 rounded-md p-4">
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
                :disabled="loading || selectedRole === user.role"
                class="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span v-if="loading" class="flex items-center">
                  <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Updating...
                </span>
                <span v-else>Update Role</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import axios from 'axios'
import { showToast } from '@/utils/toast'

const props = defineProps({
  show: {
    type: Boolean,
    default: false
  },
  user: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['close', 'updated'])

const loading = ref(false)
const error = ref('')
const selectedRole = ref('')

const handleSubmit = async () => {
  if (!props.user || selectedRole.value === props.user.role) {
    return
  }

  loading.value = true
  error.value = ''

  try {
    const response = await axios.patch(`/users/${props.user.id}/role`, {
      role: selectedRole.value
    })

    if (response.data.success) {
      showToast(`User role updated to ${selectedRole.value}`, 'success')
      emit('updated')
    } else {
      error.value = response.data.message || 'Failed to update user role'
    }
  } catch (err) {
    console.error('Update user role error:', err)
    error.value = err.response?.data?.message || err.message || 'Failed to update user role'
  } finally {
    loading.value = false
  }
}

// Reset form when modal is shown
watch([() => props.show, () => props.user], ([show, user]) => {
  if (show && user) {
    selectedRole.value = user.role
    error.value = ''
    loading.value = false
  }
})
</script>

<style scoped>
/* 组件特定样式 */
</style>