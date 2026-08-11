<template>
  <div class="tab-content">
    <ApiKeyInput />

    <div v-if="error" class="mb-4 sm:mb-6 md:mb-8">
      <div
        class="rounded-xl border border-red-500/30 bg-red-500/20 p-3 text-sm text-red-800 backdrop-blur-sm dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-200 md:p-4 md:text-base"
      >
        <i class="fas fa-exclamation-triangle mr-2" />
        {{ error }}
      </div>
    </div>

    <div v-if="statsData" class="fade-in">
      <div class="glass-strong rounded-2xl p-3 shadow-xl sm:rounded-3xl sm:p-4 md:p-6">
        <div
          class="mb-3 border-b border-gray-200 pb-3 dark:border-gray-700 sm:mb-4 sm:pb-4 md:mb-6 md:pb-6"
        >
          <div
            class="flex flex-col items-start justify-between gap-2 sm:gap-3 md:flex-row md:items-center md:gap-4"
          >
            <div class="flex items-center gap-2 md:gap-3">
              <i class="fas fa-clock text-base text-blue-500 md:text-lg" />
              <span class="text-base font-medium text-gray-700 dark:text-gray-200 md:text-lg"
                >统计时间范围</span
              >
            </div>
            <div class="flex w-full items-center gap-2 md:w-auto">
              <button
                class="flex flex-1 items-center justify-center gap-1 px-4 py-2 text-sm font-medium md:flex-none md:gap-2 md:px-6 md:text-sm"
                :class="['period-btn', { active: statsPeriod === 'daily' }]"
                :disabled="loading"
                @click="switchPeriod('daily')"
              >
                <i class="fas fa-calendar-day text-sm md:text-sm" />
                今日
              </button>
              <button
                class="flex flex-1 items-center justify-center gap-1 px-4 py-2 text-sm font-medium md:flex-none md:gap-2 md:px-6 md:text-sm"
                :class="['period-btn', { active: statsPeriod === 'monthly' }]"
                :disabled="loading"
                @click="switchPeriod('monthly')"
              >
                <i class="fas fa-calendar-alt text-sm md:text-sm" />
                本月
              </button>
              <button
                class="flex flex-1 items-center justify-center gap-1 px-4 py-2 text-sm font-medium md:flex-none md:gap-2 md:px-6 md:text-sm"
                :class="['period-btn', { active: statsPeriod === 'alltime' }]"
                :disabled="loading"
                @click="switchPeriod('alltime')"
              >
                <i class="fas fa-infinity text-sm md:text-sm" />
                全部
              </button>
              <div v-if="!multiKeyMode" class="relative">
                <button
                  :class="[
                    'test-btn flex items-center justify-center gap-1 px-4 py-2 text-sm font-medium md:gap-2 md:px-6 md:text-sm',
                    !hasAnyTestPermission ? 'cursor-not-allowed opacity-50' : ''
                  ]"
                  :disabled="loading || !hasAnyTestPermission"
                  :title="
                    hasAnyTestPermission
                      ? '测试 API'
                      : `当前 Key 可用服务: ${availableServicesText}`
                  "
                  @click="toggleTestMenu"
                >
                  <i class="fas fa-vial text-sm md:text-sm" />
                  测试
                  <i class="fas fa-chevron-down ml-1 text-sm" />
                </button>
                <div
                  v-if="showTestMenu"
                  class="absolute right-0 top-full z-50 mt-1 min-w-[140px] overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800"
                >
                  <button
                    v-if="canTestClaude"
                    class="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
                    @click="openTestModal('claude')"
                  >
                    <i class="fas fa-robot text-orange-500" />
                    Claude
                  </button>
                  <button
                    v-if="canTestGemini"
                    class="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
                    @click="openTestModal('gemini')"
                  >
                    <i class="fas fa-gem text-blue-500" />
                    Gemini
                  </button>
                  <button
                    v-if="canTestOpenAI"
                    class="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
                    @click="openTestModal('openai')"
                  >
                    <i class="fas fa-code text-green-500" />
                    Codex
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <StatsOverview
          :show-timeline-button="true"
          :timeline-disabled="!apiId || multiKeyMode"
          @open-timeline="openUsageTimeline"
        />

        <div
          class="mb-4 mt-4 grid grid-cols-1 gap-3 sm:mb-6 sm:mt-6 sm:gap-4 md:mb-8 md:mt-8 md:gap-6 xl:grid-cols-2 xl:items-stretch"
        >
          <TokenDistribution class="h-full" />
          <template v-if="multiKeyMode">
            <AggregatedStatsCard class="h-full" />
          </template>
          <template v-else>
            <LimitConfig class="h-full" />
          </template>
        </div>

        <ServiceCostCards class="mb-4 sm:mb-6" />

        <!-- 模型使用统计 - 三个时间段同屏展示 -->
        <div class="space-y-4 sm:space-y-6">
          <ModelUsageStats period="daily" />
          <ModelUsageStats period="monthly" />
          <ModelUsageStats period="alltime" />
        </div>
      </div>
    </div>

    <UnifiedTestModal
      :api-key-name="statsData?.name || ''"
      :api-key-value="apiKey"
      mode="apikey"
      :service-type="testServiceType"
      :show="showTestModal"
      @close="closeTestModal"
    />

    <ApiKeyUsageRecordsDialog
      v-if="apiId"
      :api-key-name="statsData?.name || ''"
      :fetch-api="getPublicApiKeyUsageRecordsApi"
      :key-id="apiId"
      :show="showUsageTimelineDialog"
      :show-account-column="false"
      :show-account-filter="false"
      title="API Key 请求详情时间线"
      @close="showUsageTimelineDialog = false"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useApiStatsStore } from '@/stores/apistats'
import { getPublicApiKeyUsageRecordsApi } from '@/utils/http_apis'
import ApiKeyUsageRecordsDialog from '@/components/apikeys/api_key_usage_records_dialog.vue'
import ApiKeyInput from '@/components/apistats/ApiKeyInput.vue'
import StatsOverview from '@/components/apistats/StatsOverview.vue'
import TokenDistribution from '@/components/apistats/TokenDistribution.vue'
import LimitConfig from '@/components/apistats/LimitConfig.vue'
import AggregatedStatsCard from '@/components/apistats/AggregatedStatsCard.vue'
import ModelUsageStats from '@/components/apistats/ModelUsageStats.vue'
import ServiceCostCards from '@/components/apistats/ServiceCostCards.vue'
import UnifiedTestModal from '@/components/common/UnifiedTestModal.vue'

const apiStatsStore = useApiStatsStore()
const { apiKey, apiId, loading, error, statsPeriod, statsData, multiKeyMode } =
  storeToRefs(apiStatsStore)
const { switchPeriod } = apiStatsStore

const showTestModal = ref(false)
const showTestMenu = ref(false)
const testServiceType = ref('claude')
const showUsageTimelineDialog = ref(false)

const parsePermissions = (permissions) => {
  if (!permissions) return []
  if (Array.isArray(permissions)) return permissions
  if (typeof permissions === 'string') {
    if (permissions === 'all') return []
    try {
      const parsed = JSON.parse(permissions)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

const canTestClaude = computed(() => {
  const permissions = parsePermissions(statsData.value?.permissions)
  if (permissions.length === 0) return true
  return permissions.includes('claude')
})

const canTestGemini = computed(() => {
  const permissions = parsePermissions(statsData.value?.permissions)
  if (permissions.length === 0) return true
  return permissions.includes('gemini')
})

const canTestOpenAI = computed(() => {
  const permissions = parsePermissions(statsData.value?.permissions)
  if (permissions.length === 0) return true
  return permissions.includes('openai')
})

const hasAnyTestPermission = computed(
  () => canTestClaude.value || canTestGemini.value || canTestOpenAI.value
)

const availableServicesText = computed(() => {
  const permissions = parsePermissions(statsData.value?.permissions)
  if (permissions.length === 0) return '全部服务'
  const serviceNames = {
    claude: 'Claude',
    gemini: 'Gemini',
    openai: 'OpenAI',
    droid: 'Droid'
  }
  return permissions.map((service) => serviceNames[service] || service).join(', ')
})

const toggleTestMenu = () => {
  showTestMenu.value = !showTestMenu.value
}

const openTestModal = (serviceType = 'claude') => {
  testServiceType.value = serviceType
  showTestMenu.value = false
  showTestModal.value = true
}

const closeTestModal = () => {
  showTestModal.value = false
}

const openUsageTimeline = () => {
  if (!apiId.value || multiKeyMode.value) return
  showUsageTimelineDialog.value = true
}

const handleClickOutside = (event) => {
  if (showTestMenu.value && !event.target.closest('.relative')) {
    showTestMenu.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<style scoped>
.period-btn {
  position: relative;
  overflow: hidden;
  border-radius: 12px;
  font-weight: 500;
  letter-spacing: 0.025em;
  transition: all 0.3s ease;
  border: none;
  cursor: pointer;
}

.period-btn.active {
  background: linear-gradient(135deg, var(--primary-color) 0%, var(--secondary-color) 100%);
  color: white;
  box-shadow:
    0 10px 15px -3px rgba(var(--primary-rgb), 0.3),
    0 4px 6px -2px rgba(var(--primary-rgb), 0.05);
  transform: translateY(-1px);
}

.period-btn:not(.active) {
  color: #374151;
  background: rgba(255, 255, 255, 0.6);
  border: 1px solid rgba(229, 231, 235, 0.5);
}

:global(html.dark) .period-btn:not(.active) {
  color: #e5e7eb;
  background: rgba(55, 65, 81, 0.4);
  border: 1px solid rgba(75, 85, 99, 0.5);
}

.period-btn:not(.active):hover {
  background: rgba(255, 255, 255, 0.8);
  color: #1f2937;
  border-color: rgba(209, 213, 219, 0.8);
}

:global(html.dark) .period-btn:not(.active):hover {
  background: rgba(75, 85, 99, 0.6);
  color: #ffffff;
  border-color: rgba(107, 114, 128, 0.8);
}

.test-btn {
  position: relative;
  overflow: hidden;
  border-radius: 12px;
  font-weight: 500;
  letter-spacing: 0.025em;
  transition: all 0.3s ease;
  border: none;
  cursor: pointer;
  background: linear-gradient(135deg, #06b6d4 0%, #0891b2 100%);
  color: white;
  box-shadow:
    0 4px 10px -2px rgba(6, 182, 212, 0.3),
    0 2px 4px -1px rgba(6, 182, 212, 0.1);
}

.test-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow:
    0 8px 15px -3px rgba(6, 182, 212, 0.4),
    0 4px 6px -2px rgba(6, 182, 212, 0.15);
}

.test-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

.tab-content {
  animation: tabFadeIn 0.4s ease-out;
}

@keyframes tabFadeIn {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.fade-in {
  animation: fadeIn 0.6s ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.glass-strong {
  background: var(--glass-strong-color);
  backdrop-filter: blur(25px);
  border: 1px solid var(--border-color);
  box-shadow:
    0 25px 50px -12px rgba(0, 0, 0, 0.25),
    0 0 0 1px rgba(255, 255, 255, 0.05),
    inset 0 1px 0 rgba(255, 255, 255, 0.1);
  position: relative;
  z-index: 1;
}

:global(.dark) .glass-strong {
  box-shadow:
    0 25px 50px -12px rgba(0, 0, 0, 0.7),
    0 0 0 1px rgba(55, 65, 81, 0.3),
    inset 0 1px 0 rgba(75, 85, 99, 0.2);
}
</style>
