<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="sm:flex sm:items-center">
      <div class="sm:flex-auto">
        <h1 class="text-2xl font-semibold text-gray-900">User Management</h1>
        <p class="mt-2 text-sm text-gray-700">
          Manage users, their API keys, and view usage statistics
        </p>
      </div>
      <div class="mt-4 sm:mt-0 sm:ml-16 sm:flex-none">
        <button
          @click="loadUsers"
          :disabled="loading"
          class="inline-flex items-center justify-center rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 sm:w-auto"
        >
          <svg class="-ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>
    </div>

    <!-- Stats Cards -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      <div class="bg-white overflow-hidden shadow rounded-lg">
        <div class="p-5">
          <div class="flex items-center">
            <div class="flex-shrink-0">
              <svg class="h-6 w-6 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
              </svg>
            </div>
            <div class="ml-5 w-0 flex-1">
              <dl>
                <dt class="text-sm font-medium text-gray-500 truncate">Total Users</dt>
                <dd class="text-lg font-medium text-gray-900">{{ userStats?.totalUsers || 0 }}</dd>
              </dl>
            </div>
          </div>
        </div>
      </div>

      <div class="bg-white overflow-hidden shadow rounded-lg">
        <div class="p-5">
          <div class="flex items-center">
            <div class="flex-shrink-0">
              <svg class="h-6 w-6 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div class="ml-5 w-0 flex-1">
              <dl>
                <dt class="text-sm font-medium text-gray-500 truncate">Active Users</dt>
                <dd class="text-lg font-medium text-gray-900">{{ userStats?.activeUsers || 0 }}</dd>
              </dl>
            </div>
          </div>
        </div>
      </div>

      <div class="bg-white overflow-hidden shadow rounded-lg">
        <div class="p-5">
          <div class="flex items-center">
            <div class="flex-shrink-0">
              <svg class="h-6 w-6 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m0 0a2 2 0 012 2m-2-2h-6m6 0v6a2 2 0 01-2 2H9a2 2 0 01-2-2V9a2 2 0 012-2h6z" />
              </svg>
            </div>
            <div class="ml-5 w-0 flex-1">
              <dl>
                <dt class="text-sm font-medium text-gray-500 truncate">Total API Keys</dt>
                <dd class="text-lg font-medium text-gray-900">{{ userStats?.totalApiKeys || 0 }}</dd>
              </dl>
            </div>
          </div>
        </div>
      </div>

      <div class="bg-white overflow-hidden shadow rounded-lg">
        <div class="p-5">
          <div class="flex items-center">
            <div class="flex-shrink-0">
              <svg class="h-6 w-6 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
              </svg>
            </div>
            <div class="ml-5 w-0 flex-1">
              <dl>
                <dt class="text-sm font-medium text-gray-500 truncate">Total Cost</dt>
                <dd class="text-lg font-medium text-gray-900">${{ (userStats?.totalUsage?.totalCost || 0).toFixed(4) }}</dd>
              </dl>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Search and Filters -->
    <div class="bg-white shadow rounded-lg">
      <div class="px-4 py-5 sm:p-6">
        <div class="sm:flex sm:items-center sm:justify-between">
          <div class="sm:flex sm:items-center space-y-4 sm:space-y-0 sm:space-x-4">
            <!-- Search -->
            <div class="flex-1 min-w-0">
              <div class="relative rounded-md shadow-sm">
                <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg class="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <input
                  v-model="searchQuery"
                  @input="debouncedSearch"
                  type="search"
                  class="focus:ring-blue-500 focus:border-blue-500 block w-full pl-10 sm:text-sm border-gray-300 rounded-md"
                  placeholder="Search users..."
                />
              </div>
            </div>

            <!-- Role Filter -->
            <div>
              <select
                v-model="selectedRole"
                @change="loadUsers"
                class="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              >
                <option value="">All Roles</option>
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
            </div>

            <!-- Status Filter -->
            <div>
              <select
                v-model="selectedStatus"
                @change="loadUsers"
                class="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              >
                <option value="">All Status</option>
                <option value="true">Active</option>
                <option value="false">Disabled</option>
              </select>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Users Table -->
    <div class="bg-white shadow overflow-hidden sm:rounded-md">
      <div class="px-4 py-5 sm:px-6 border-b border-gray-200">
        <h3 class="text-lg leading-6 font-medium text-gray-900">
          Users
          <span v-if="!loading" class="text-sm text-gray-500">({{ filteredUsers.length }} of {{ users.length }})</span>
        </h3>
      </div>

      <!-- Loading State -->
      <div v-if="loading" class="text-center py-12">
        <svg class="animate-spin h-8 w-8 text-blue-600 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <p class="mt-2 text-sm text-gray-500">Loading users...</p>
      </div>

      <!-- Users List -->
      <ul v-else-if="filteredUsers.length > 0" role="list" class="divide-y divide-gray-200">
        <li v-for="user in filteredUsers" :key="user.id" class="px-6 py-4">
          <div class="flex items-center justify-between">
            <div class="flex items-center min-w-0 flex-1">
              <div class="flex-shrink-0">
                <div class="h-10 w-10 rounded-full bg-gray-300 flex items-center justify-center">
                  <svg class="h-6 w-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
              </div>
              <div class="ml-4 flex-1 min-w-0">
                <div class="flex items-center">
                  <p class="text-sm font-medium text-gray-900 truncate">
                    {{ user.displayName || user.username }}
                  </p>
                  <div class="ml-2 flex items-center space-x-2">
                    <span :class="[
                      'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
                      user.isActive 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-red-100 text-red-800'
                    ]">
                      {{ user.isActive ? 'Active' : 'Disabled' }}
                    </span>
                    <span :class="[
                      'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
                      user.role === 'admin' 
                        ? 'bg-purple-100 text-purple-800' 
                        : 'bg-blue-100 text-blue-800'
                    ]">
                      {{ user.role }}
                    </span>
                  </div>
                </div>
                <div class="mt-1 flex items-center space-x-4 text-sm text-gray-500">
                  <span>@{{ user.username }}</span>
                  <span v-if="user.email">{{ user.email }}</span>
                  <span>{{ user.apiKeyCount || 0 }} API keys</span>
                  <span v-if="user.lastLoginAt">Last login: {{ formatDate(user.lastLoginAt) }}</span>
                  <span v-else>Never logged in</span>
                </div>
                <div v-if="user.totalUsage" class="mt-1 flex items-center space-x-4 text-xs text-gray-400">
                  <span>{{ formatNumber(user.totalUsage.requests || 0) }} requests</span>
                  <span>${{ (user.totalUsage.totalCost || 0).toFixed(4) }} total cost</span>
                </div>
              </div>
            </div>
            <div class="flex items-center space-x-2">
              <!-- View Usage Stats -->
              <button
                @click="viewUserStats(user)"
                class="inline-flex items-center p-1 border border-transparent rounded text-gray-400 hover:text-blue-600"
                title="View Usage Stats"
              >
                <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </button>

              <!-- Disable User API Keys -->
              <button
                @click="disableUserApiKeys(user)"
                :disabled="user.apiKeyCount === 0"
                class="inline-flex items-center p-1 border border-transparent rounded text-gray-400 hover:text-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Disable All API Keys"
              >
                <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636m12.728 12.728L18 12M6 6l12 12" />
                </svg>
              </button>

              <!-- Toggle User Status -->
              <button
                @click="toggleUserStatus(user)"
                :class="[
                  'inline-flex items-center p-1 border border-transparent rounded',
                  user.isActive 
                    ? 'text-gray-400 hover:text-red-600' 
                    : 'text-gray-400 hover:text-green-600'
                ]"
                :title="user.isActive ? 'Disable User' : 'Enable User'"
              >
                <svg v-if="user.isActive" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636m12.728 12.728L18 12M6 6l12 12" />
                </svg>
                <svg v-else class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </button>

              <!-- Change Role -->
              <button
                @click="changeUserRole(user)"
                class="inline-flex items-center p-1 border border-transparent rounded text-gray-400 hover:text-purple-600"
                title="Change Role"
              >
                <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4" />
                </svg>
              </button>
            </div>
          </div>
        </li>
      </ul>

      <!-- Empty State -->
      <div v-else class="text-center py-12">
        <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
        </svg>
        <h3 class="mt-2 text-sm font-medium text-gray-900">No users found</h3>
        <p class="mt-1 text-sm text-gray-500">
          {{ searchQuery ? 'No users match your search criteria.' : 'No users have been created yet.' }}
        </p>
      </div>
    </div>

    <!-- User Usage Stats Modal -->
    <UserUsageStatsModal
      :show="showStatsModal"
      :user="selectedUser"
      @close="showStatsModal = false"
    />

    <!-- Confirm Modals -->
    <ConfirmModal
      :show="showConfirmModal"
      :title="confirmAction.title"
      :message="confirmAction.message"
      :confirmText="confirmAction.confirmText"
      :confirmClass="confirmAction.confirmClass"
      @confirm="handleConfirmAction"
      @cancel="showConfirmModal = false"
    />

    <!-- Change Role Modal -->
    <ChangeRoleModal
      :show="showRoleModal"
      :user="selectedUser"
      @close="showRoleModal = false"
      @updated="handleUserUpdated"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import axios from 'axios'
import { showToast } from '@/utils/toast'
import { debounce } from 'lodash-es'
import UserUsageStatsModal from '@/components/admin/UserUsageStatsModal.vue'
import ChangeRoleModal from '@/components/admin/ChangeRoleModal.vue'
import ConfirmModal from '@/components/common/ConfirmModal.vue'

const loading = ref(true)
const users = ref([])
const userStats = ref(null)
const searchQuery = ref('')
const selectedRole = ref('')
const selectedStatus = ref('')

const showStatsModal = ref(false)
const showConfirmModal = ref(false)
const showRoleModal = ref(false)
const selectedUser = ref(null)

const confirmAction = ref({
  title: '',
  message: '',
  confirmText: '',
  confirmClass: '',
  action: null
})

const filteredUsers = computed(() => {
  let filtered = users.value

  // Apply search filter
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    filtered = filtered.filter(user => 
      user.username.toLowerCase().includes(query) ||
      user.displayName?.toLowerCase().includes(query) ||
      user.email?.toLowerCase().includes(query)
    )
  }

  // Apply role filter
  if (selectedRole.value) {
    filtered = filtered.filter(user => user.role === selectedRole.value)
  }

  // Apply status filter
  if (selectedStatus.value !== '') {
    const isActive = selectedStatus.value === 'true'
    filtered = filtered.filter(user => user.isActive === isActive)
  }

  return filtered
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

const loadUsers = async () => {
  loading.value = true
  try {
    const [usersResponse, statsResponse] = await Promise.all([
      axios.get('/users', {
        params: {
          role: selectedRole.value || undefined,
          isActive: selectedStatus.value !== '' ? selectedStatus.value : undefined
        }
      }),
      axios.get('/users/stats/overview')
    ])

    if (usersResponse.data.success) {
      users.value = usersResponse.data.users
    }

    if (statsResponse.data.success) {
      userStats.value = statsResponse.data.stats
    }
  } catch (error) {
    console.error('Failed to load users:', error)
    showToast('Failed to load users', 'error')
  } finally {
    loading.value = false
  }
}

const debouncedSearch = debounce(() => {
  // Search is handled by computed property
}, 300)

const viewUserStats = (user) => {
  selectedUser.value = user
  showStatsModal.value = true
}

const toggleUserStatus = (user) => {
  selectedUser.value = user
  confirmAction.value = {
    title: user.isActive ? 'Disable User' : 'Enable User',
    message: user.isActive 
      ? `Are you sure you want to disable user "${user.username}"? This will prevent them from logging in.`
      : `Are you sure you want to enable user "${user.username}"?`,
    confirmText: user.isActive ? 'Disable' : 'Enable',
    confirmClass: user.isActive ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700',
    action: 'toggleStatus'
  }
  showConfirmModal.value = true
}

const disableUserApiKeys = (user) => {
  if (user.apiKeyCount === 0) return
  
  selectedUser.value = user
  confirmAction.value = {
    title: 'Disable All API Keys',
    message: `Are you sure you want to disable all ${user.apiKeyCount} API keys for user "${user.username}"? This will prevent them from using the service.`,
    confirmText: 'Disable Keys',
    confirmClass: 'bg-red-600 hover:bg-red-700',
    action: 'disableKeys'
  }
  showConfirmModal.value = true
}

const changeUserRole = (user) => {
  selectedUser.value = user
  showRoleModal.value = true
}

const handleConfirmAction = async () => {
  const user = selectedUser.value
  const action = confirmAction.value.action

  try {
    if (action === 'toggleStatus') {
      const response = await axios.patch(`/users/${user.id}/status`, {
        isActive: !user.isActive
      })

      if (response.data.success) {
        const userIndex = users.value.findIndex(u => u.id === user.id)
        if (userIndex !== -1) {
          users.value[userIndex].isActive = !user.isActive
        }
        showToast(`User ${user.isActive ? 'disabled' : 'enabled'} successfully`, 'success')
      }
    } else if (action === 'disableKeys') {
      const response = await axios.post(`/users/${user.id}/disable-keys`)

      if (response.data.success) {
        showToast(`Disabled ${response.data.disabledCount} API keys`, 'success')
        await loadUsers() // Refresh to get updated counts
      }
    }
  } catch (error) {
    console.error(`Failed to ${action}:`, error)
    showToast(`Failed to ${action}`, 'error')
  } finally {
    showConfirmModal.value = false
    selectedUser.value = null
  }
}

const handleUserUpdated = () => {
  showRoleModal.value = false
  selectedUser.value = null
  loadUsers()
}

onMounted(() => {
  loadUsers()
})
</script>

<style scoped>
/* 组件特定样式 */
</style>