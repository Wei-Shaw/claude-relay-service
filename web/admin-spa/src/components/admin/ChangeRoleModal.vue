<template>
  <div
    v-if="show"
    class="fixed inset-0 z-50 h-full w-full overflow-y-auto bg-gray-600 bg-opacity-50"
  >
    <div class="relative top-20 mx-auto w-96 rounded-md border bg-white p-5 shadow-lg">
      <div class="mt-3">
        <div class="mb-4 flex items-center justify-between">
          <h3 class="text-lg font-medium text-gray-900">Change User Role</h3>
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

        <div v-if="user" class="space-y-4">
          <!-- User Info -->
          <div class="rounded-md bg-gray-50 p-4">
            <div class="flex items-center">
              <div class="flex-shrink-0">
                <div class="flex h-10 w-10 items-center justify-center rounded-full bg-gray-300">
                  <svg
                    class="h-6 w-6 text-gray-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                    />
                  </svg>
                </div>
              </div>
              <div class="ml-4">
                <p class="text-sm font-medium text-gray-900">
                  {{ user.displayName || user.username }}
                </p>
                <p class="text-sm text-gray-500">@{{ user.username }}</p>
                <div class="mt-1">
                  <span
                    :class="[
                      'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                      user.role === 'admin'
                        ? 'bg-purple-100 text-purple-800'
                        : 'bg-blue-100 text-blue-800'
                    ]"
                  >
                    Current: {{ user.role }}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <!-- Role Selection -->
          <form class="space-y-4" @submit.prevent="handleSubmit">
            <div>
              <label class="mb-2 block text-sm font-medium text-gray-700"> New Role </label>
              <div class="space-y-2">
                <label class="flex items-center">
                  <input
                    v-model="selectedRole"
                    class="h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500"
                    :disabled="loading"
                    type="radio"
                    value="user"
                  />
                  <div class="ml-3">
                    <div class="text-sm font-medium text-gray-900">User</div>
                    <div class="text-xs text-gray-500">Regular user with basic permissions</div>
                  </div>
                </label>
                <label class="flex items-center">
                  <input
                    v-model="selectedRole"
                    class="h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500"
                    :disabled="loading"
                    type="radio"
                    value="admin"
                  />
                  <div class="ml-3">
                    <div class="text-sm font-medium text-gray-900">Administrator</div>
                    <div class="text-xs text-gray-500">Full access to manage users and system</div>
                  </div>
                </label>
              </div>
            </div>

            <!-- Warning for role changes -->
            <div
              v-if="selectedRole !== user.role"
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
                  <h3 class="text-sm font-medium text-yellow-800">Role Change Warning</h3>
                  <div class="mt-2 text-sm text-yellow-700">
                    <p v-if="selectedRole === 'admin'">
                      Granting admin privileges will give this user full access to the system,
                      including the ability to manage other users and their API keys.
                    </p>
                    <p v-else>
                      Removing admin privileges will restrict this user to only managing their own
                      API keys and viewing their own usage statistics.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div v-if="error" class="rounded-md border border-red-200 bg-red-50 p-4">
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
                :disabled="loading || selectedRole === user.role"
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
import { updateFrontUserRoleApi } from '@/utils/http_apis'
import { showToast } from '@/utils/tools'

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
    const response = await updateFrontUserRoleApi(props.user.id, {
      role: selectedRole.value
    })

    if (response.success) {
      showToast(`User role updated to ${selectedRole.value}`, 'success')
      emit('updated')
    } else {
      error.value = response.message || 'Failed to update user role'
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
