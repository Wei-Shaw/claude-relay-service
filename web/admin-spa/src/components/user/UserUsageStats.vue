<template>
  <div class="space-y-6">
    <div class="sm:flex sm:items-center">
      <div class="sm:flex-auto">
        <h1 class="text-2xl font-semibold text-gray-900">Usage Statistics</h1>
        <p class="mt-2 text-sm text-gray-700">View your API usage statistics and costs</p>
      </div>
      <div class="mt-4 sm:ml-16 sm:mt-0 sm:flex-none">
        <select
          v-model="selectedPeriod"
          class="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
          @change="loadUsageStats"
        >
          <option value="day">Last 24 Hours</option>
          <option value="week">Last 7 Days</option>
          <option value="month">Last 30 Days</option>
          <option value="quarter">Last 90 Days</option>
        </select>
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
      <p class="mt-2 text-sm text-gray-500">Loading usage statistics...</p>
    </div>

    <!-- Stats Cards -->
    <div v-else class="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
      <div class="overflow-hidden rounded-lg bg-white shadow">
        <div class="p-5">
          <div class="flex items-center">
            <div class="flex-shrink-0">
              <svg
                class="h-6 w-6 text-blue-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                />
              </svg>
            </div>
            <div class="ml-5 w-0 flex-1">
              <dl>
                <dt class="truncate text-sm font-medium text-gray-500">Total Requests</dt>
                <dd class="text-lg font-medium text-gray-900">
                  {{ formatNumber(usageStats?.totalRequests || 0) }}
                </dd>
              </dl>
            </div>
          </div>
        </div>
      </div>

      <div class="overflow-hidden rounded-lg bg-white shadow">
        <div class="p-5">
          <div class="flex items-center">
            <div class="flex-shrink-0">
              <svg
                class="h-6 w-6 text-green-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                />
              </svg>
            </div>
            <div class="ml-5 w-0 flex-1">
              <dl>
                <dt class="truncate text-sm font-medium text-gray-500">Input Tokens</dt>
                <dd class="text-lg font-medium text-gray-900">
                  {{ formatNumber(usageStats?.totalInputTokens || 0) }}
                </dd>
              </dl>
            </div>
          </div>
        </div>
      </div>

      <div class="overflow-hidden rounded-lg bg-white shadow">
        <div class="p-5">
          <div class="flex items-center">
            <div class="flex-shrink-0">
              <svg
                class="h-6 w-6 text-purple-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                />
              </svg>
            </div>
            <div class="ml-5 w-0 flex-1">
              <dl>
                <dt class="truncate text-sm font-medium text-gray-500">Output Tokens</dt>
                <dd class="text-lg font-medium text-gray-900">
                  {{ formatNumber(usageStats?.totalOutputTokens || 0) }}
                </dd>
              </dl>
            </div>
          </div>
        </div>
      </div>

      <div class="overflow-hidden rounded-lg bg-white shadow">
        <div class="p-5">
          <div class="flex items-center">
            <div class="flex-shrink-0">
              <svg
                class="h-6 w-6 text-yellow-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                />
              </svg>
            </div>
            <div class="ml-5 w-0 flex-1">
              <dl>
                <dt class="truncate text-sm font-medium text-gray-500">Total Cost</dt>
                <dd class="text-lg font-medium text-gray-900">
                  ${{ (usageStats?.totalCost || 0).toFixed(4) }}
                </dd>
              </dl>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Daily Usage Chart -->
    <div v-if="!loading && usageStats" class="rounded-lg bg-white shadow">
      <div class="px-4 py-5 sm:p-6">
        <h3 class="mb-4 text-lg font-medium leading-6 text-gray-900">Daily Usage Trend</h3>

        <!-- Placeholder for chart - you can integrate Chart.js or similar -->
        <div
          class="flex h-64 items-center justify-center rounded-lg border-2 border-dashed border-gray-300"
        >
          <div class="text-center">
            <svg
              class="mx-auto h-12 w-12 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
              />
            </svg>
            <h3 class="mt-2 text-sm font-medium text-gray-900">Usage Chart</h3>
            <p class="mt-1 text-sm text-gray-500">Daily usage trends would be displayed here</p>
            <p class="mt-2 text-xs text-gray-400">
              (Chart integration can be added with Chart.js, D3.js, or similar library)
            </p>
          </div>
        </div>
      </div>
    </div>

    <!-- Model Usage Breakdown -->
    <div
      v-if="!loading && usageStats && usageStats.modelStats?.length > 0"
      class="rounded-lg bg-white shadow"
    >
      <div class="px-4 py-5 sm:p-6">
        <h3 class="mb-4 text-lg font-medium leading-6 text-gray-900">Usage by Model</h3>
        <div class="space-y-3">
          <div
            v-for="model in usageStats.modelStats"
            :key="model.name"
            class="flex items-center justify-between"
          >
            <div class="flex items-center">
              <div class="flex-shrink-0">
                <div class="h-2 w-2 rounded-full bg-blue-500"></div>
              </div>
              <div class="ml-3">
                <p class="text-sm font-medium text-gray-900">{{ model.name }}</p>
              </div>
            </div>
            <div class="text-right">
              <p class="text-sm text-gray-900">{{ formatNumber(model.requests) }} requests</p>
              <p class="text-xs text-gray-500">${{ model.cost.toFixed(4) }}</p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Detailed Usage Table -->
    <div v-if="!loading && userApiKeys.length > 0" class="rounded-lg bg-white shadow">
      <div class="px-4 py-5 sm:p-6">
        <h3 class="mb-4 text-lg font-medium leading-6 text-gray-900">Usage by API Key</h3>
        <div class="overflow-hidden">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th
                  class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
                  scope="col"
                >
                  API Key
                </th>
                <th
                  class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
                  scope="col"
                >
                  Requests
                </th>
                <th
                  class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
                  scope="col"
                >
                  Input Tokens
                </th>
                <th
                  class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
                  scope="col"
                >
                  Output Tokens
                </th>
                <th
                  class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
                  scope="col"
                >
                  Cost
                </th>
                <th
                  class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
                  scope="col"
                >
                  Status
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200 bg-white">
              <tr v-for="apiKey in userApiKeys" :key="apiKey.id">
                <td class="whitespace-nowrap px-6 py-4">
                  <div class="text-sm font-medium text-gray-900">{{ apiKey.name }}</div>
                  <div class="text-sm text-gray-500">{{ apiKey.keyPreview }}</div>
                </td>
                <td class="whitespace-nowrap px-6 py-4 text-sm text-gray-900">
                  {{ formatNumber(apiKey.usage?.requests || 0) }}
                </td>
                <td class="whitespace-nowrap px-6 py-4 text-sm text-gray-900">
                  {{ formatNumber(apiKey.usage?.inputTokens || 0) }}
                </td>
                <td class="whitespace-nowrap px-6 py-4 text-sm text-gray-900">
                  {{ formatNumber(apiKey.usage?.outputTokens || 0) }}
                </td>
                <td class="whitespace-nowrap px-6 py-4 text-sm text-gray-900">
                  ${{ (apiKey.usage?.totalCost || 0).toFixed(4) }}
                </td>
                <td class="whitespace-nowrap px-6 py-4">
                  <span
                    :class="[
                      'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                      apiKey.isDeleted === 'true' || apiKey.deletedAt
                        ? 'bg-gray-100 text-gray-800'
                        : apiKey.isActive
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                    ]"
                  >
                    {{
                      apiKey.isDeleted === 'true' || apiKey.deletedAt
                        ? 'Deleted'
                        : apiKey.isActive
                          ? 'Active'
                          : 'Disabled'
                    }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- No Data State -->
    <div
      v-if="!loading && (!usageStats || usageStats.totalRequests === 0)"
      class="py-12 text-center"
    >
      <svg
        class="mx-auto h-12 w-12 text-gray-400"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
        />
      </svg>
      <h3 class="mt-2 text-sm font-medium text-gray-900">No usage data</h3>
      <p class="mt-1 text-sm text-gray-500">
        You haven't made any API requests yet. Create an API key and start using the service to see
        usage statistics.
      </p>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useUserStore } from '@/stores/user'
import { showToast, formatNumber } from '@/utils/tools'

const userStore = useUserStore()

const loading = ref(true)
const selectedPeriod = ref('week')
const usageStats = ref(null)
const userApiKeys = ref([])

const loadUsageStats = async () => {
  loading.value = true
  try {
    const [stats, apiKeys] = await Promise.all([
      userStore.getUserUsageStats({ period: selectedPeriod.value }),
      userStore.getUserApiKeys(true) // Include deleted keys
    ])

    usageStats.value = stats
    userApiKeys.value = apiKeys
  } catch (error) {
    console.error('Failed to load usage stats:', error)
    showToast('Failed to load usage statistics', 'error')
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadUsageStats()
})
</script>
