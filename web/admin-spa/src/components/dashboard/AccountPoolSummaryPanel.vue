<template>
  <section
    class="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:mb-6 sm:p-6 md:mb-8"
  >
    <div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p
          class="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400"
        >
          Account Pool
        </p>
        <h2 class="mt-1 text-lg font-bold text-slate-950 dark:text-slate-50">
          OpenAI + Claude 账号池策略状态
        </h2>
      </div>
      <button
        class="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-white disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-slate-600"
        :disabled="loading"
        type="button"
        @click="loadSummary"
      >
        <i :class="['fas', loading ? 'fa-spinner fa-spin' : 'fa-rotate']" />
        刷新
      </button>
    </div>

    <div
      class="mb-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-800/70"
    >
      <div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 class="text-sm font-bold text-slate-950 dark:text-slate-50">账号池策略</h3>
        </div>
        <div class="flex items-center gap-3">
          <label
            class="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300"
          >
            <input v-model="policyForm.enabled" class="h-4 w-4" type="checkbox" />
            启用策略
          </label>
          <button
            class="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white"
            :disabled="savingPolicy"
            type="button"
            @click="savePolicy"
          >
            <i :class="['fas', savingPolicy ? 'fa-spinner fa-spin' : 'fa-save']" />
            保存策略
          </button>
        </div>
      </div>

      <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div
          v-for="platform in policyPlatforms"
          :key="platform.key"
          class="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900"
        >
          <div class="mb-3 flex items-center justify-between gap-3">
            <div class="flex items-center gap-2">
              <span
                class="inline-flex h-8 w-8 items-center justify-center rounded-lg text-white"
                :class="platform.key === 'openai' ? 'bg-emerald-600' : 'bg-indigo-600'"
              >
                <i :class="platform.key === 'openai' ? 'fas fa-key' : 'fas fa-brain'" />
              </span>
              <span class="text-sm font-bold text-slate-900 dark:text-slate-100">
                {{ platform.label }}
              </span>
            </div>
            <div class="flex flex-wrap items-center justify-end gap-2">
              <button
                class="rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-[11px] font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300"
                :disabled="Boolean(runningDemo)"
                type="button"
                @click="runDemo(platform.key, 'force_stop')"
              >
                模拟到量
              </button>
              <button
                class="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300"
                :disabled="Boolean(runningDemo)"
                type="button"
                @click="runDemo(platform.key, 'restore')"
              >
                恢复默认
              </button>
              <label class="inline-flex items-center gap-2 text-xs text-slate-500">
                <input v-model="policyForm.platforms[platform.key].enabled" type="checkbox" />
                单独启用
              </label>
            </div>
          </div>
          <div class="grid grid-cols-2 gap-3 md:grid-cols-5">
            <label
              v-for="field in policyFields"
              :key="`${platform.key}-${field.key}`"
              class="space-y-1"
            >
              <span class="block text-[11px] font-semibold text-slate-500">
                {{ field.label }}
              </span>
              <input
                v-model.number="policyForm.platforms[platform.key][field.key]"
                class="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-sm text-slate-900 outline-none transition focus:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                :max="field.max"
                min="0"
                :step="field.step"
                type="number"
              />
            </label>
          </div>
        </div>
      </div>
    </div>

    <div v-if="loading" class="py-8 text-center text-sm text-slate-500">
      正在加载账号池策略状态...
    </div>
    <div
      v-else-if="platforms.length === 0"
      class="rounded-xl border border-dashed border-slate-300 py-8 text-center text-sm text-slate-500 dark:border-slate-700"
    >
      暂无 OpenAI / Claude 账号池数据
    </div>
    <div v-else class="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <article
        v-for="platform in platforms"
        :key="platform.key"
        class="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-800/70"
      >
        <div class="mb-4 flex items-start justify-between gap-4">
          <div class="flex items-center gap-2">
            <span
              class="inline-flex h-9 w-9 items-center justify-center rounded-xl text-white"
              :class="platform.key === 'openai' ? 'bg-emerald-600' : 'bg-indigo-600'"
            >
              <i :class="platform.key === 'openai' ? 'fas fa-key' : 'fas fa-brain'" />
            </span>
            <div>
              <h3 class="text-base font-bold text-slate-950 dark:text-slate-50">
                {{ platform.label }}
              </h3>
              <p class="text-xs text-slate-500 dark:text-slate-400">
                可路由 {{ platform.available || 0 }} / 总计 {{ platform.total || 0 }}
              </p>
            </div>
          </div>
          <span
            class="rounded-full px-3 py-1 text-xs font-semibold"
            :class="getPolicyBadgeClass(platform.policy?.status)"
          >
            {{ platform.policy?.label || '未知' }}
          </span>
        </div>

        <div class="mb-4 grid grid-cols-4 gap-2 text-center">
          <div class="rounded-xl bg-white p-2 dark:bg-slate-900">
            <p class="text-lg font-bold text-slate-950 dark:text-slate-50">
              {{ platform.normal || 0 }}
            </p>
            <p class="text-[11px] text-slate-500">正常</p>
          </div>
          <div class="rounded-xl bg-white p-2 dark:bg-slate-900">
            <p class="text-lg font-bold text-amber-600">{{ platform.paused || 0 }}</p>
            <p class="text-[11px] text-slate-500">暂停</p>
          </div>
          <div class="rounded-xl bg-white p-2 dark:bg-slate-900">
            <p class="text-lg font-bold text-orange-600">{{ platform.rateLimited || 0 }}</p>
            <p class="text-[11px] text-slate-500">限流</p>
          </div>
          <div class="rounded-xl bg-white p-2 dark:bg-slate-900">
            <p class="text-lg font-bold text-red-600">{{ platform.abnormal || 0 }}</p>
            <p class="text-[11px] text-slate-500">异常</p>
          </div>
        </div>

        <div class="space-y-3">
          <div v-for="metric in getPoolMetrics(platform)" :key="`${platform.key}-${metric.key}`">
            <div class="mb-1 flex items-center justify-between text-xs">
              <span class="font-medium text-slate-600 dark:text-slate-300">{{ metric.label }}</span>
              <span class="text-right font-semibold text-slate-900 dark:text-slate-100">
                {{ metric.value }}%
                <span
                  v-if="metric.remaining"
                  class="ml-1 font-medium text-slate-500 dark:text-slate-400"
                >
                  {{ metric.remaining }}
                </span>
              </span>
            </div>
            <div class="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
              <div
                class="h-full rounded-full transition-all"
                :class="getUsageBarClass(metric.value)"
                :style="{ width: `${Math.min(100, metric.value)}%` }"
              />
            </div>
          </div>
        </div>

        <div
          v-if="getRecoveryText(platform)"
          class="mt-4 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
        >
          <i class="fas fa-clock mr-1 text-slate-400" />
          {{ getRecoveryText(platform) }}
        </div>

        <div class="mt-4 grid grid-cols-3 gap-2 text-xs text-slate-600 dark:text-slate-300">
          <div>额度停用 {{ platform.policy?.quotaStopped || 0 }}</div>
          <div>自动停用 {{ platform.policy?.autoStopped || 0 }}</div>
          <div>高水位 {{ platform.policy?.highUsage || 0 }}</div>
        </div>
      </article>
    </div>
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { showToast } from '@/utils/tools'
import {
  getAccountPoolPolicyApi,
  getAccountPoolSummaryApi,
  runAccountPoolDemoApi,
  updateAccountPoolPolicyApi
} from '@/utils/http_apis'

const summary = ref({ platforms: {}, totals: null })
const loading = ref(false)
const savingPolicy = ref(false)
const runningDemo = ref('')
const defaultPlatformPolicy = {
  enabled: true,
  fiveHourUtilizationLimit: 100,
  sevenDayUtilizationLimit: 100,
  dailyCostLimit: 0,
  dailyTokenLimit: 0,
  dailyRequestLimit: 0
}
const createDefaultPolicy = () => ({
  enabled: true,
  platforms: {
    openai: { ...defaultPlatformPolicy },
    claude: { ...defaultPlatformPolicy }
  }
})
const policyForm = ref(createDefaultPolicy())
const policyPlatforms = [
  { key: 'openai', label: 'OpenAI' },
  { key: 'claude', label: 'Claude' }
]
const policyFields = [
  { key: 'fiveHourUtilizationLimit', label: '5h %', max: 100, step: 1 },
  { key: 'sevenDayUtilizationLimit', label: '7d %', max: 100, step: 1 },
  { key: 'dailyCostLimit', label: '成本 $', max: undefined, step: 0.01 },
  { key: 'dailyTokenLimit', label: 'Token', max: undefined, step: 1 },
  { key: 'dailyRequestLimit', label: '请求', max: undefined, step: 1 }
]

const platforms = computed(() =>
  ['openai', 'claude']
    .map((key) => ({
      key,
      ...(summary.value?.platforms?.[key] || {})
    }))
    .filter((platform) => platform.total > 0)
)

const formatDuration = (seconds) => {
  const totalSeconds = Number(seconds)
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return ''

  const minutes = Math.ceil(totalSeconds / 60)
  if (minutes < 60) return `${minutes} 分钟`

  const hours = Math.floor(minutes / 60)
  const restMinutes = minutes % 60
  if (hours < 24) return restMinutes > 0 ? `${hours} 小时 ${restMinutes} 分钟` : `${hours} 小时`

  const days = Math.floor(hours / 24)
  const restHours = hours % 24
  return restHours > 0 ? `${days} 天 ${restHours} 小时` : `${days} 天`
}

const getPoolMetrics = (platform) => [
  {
    key: 'fiveHour',
    label: '5h 窗口',
    value: Number(platform.utilization?.fiveHour || 0),
    remaining: formatDuration(platform.recovery?.fiveHour?.remainingSeconds)
  },
  {
    key: 'sevenDay',
    label: '7d 周期',
    value: Number(platform.utilization?.sevenDay || 0),
    remaining: formatDuration(platform.recovery?.sevenDay?.remainingSeconds)
  },
  { key: 'quota', label: '成本额度', value: Number(platform.utilization?.quota || 0) }
]

const getRecoveryText = (platform) => {
  const candidates = [
    {
      label: '5h 窗口',
      utilization: Number(platform.recovery?.fiveHour?.utilization || 0),
      remaining: formatDuration(platform.recovery?.fiveHour?.remainingSeconds)
    },
    {
      label: '7d 周期',
      utilization: Number(platform.recovery?.sevenDay?.utilization || 0),
      remaining: formatDuration(platform.recovery?.sevenDay?.remainingSeconds)
    }
  ].filter((item) => item.remaining)

  if (candidates.length === 0) return ''

  const selected = candidates.sort((a, b) => b.utilization - a.utilization)[0]
  return `${selected.label}预计 ${selected.remaining} 后恢复`
}

const getUsageBarClass = (value) => {
  if (value >= 100) return 'bg-red-600'
  if (value >= 90) return 'bg-orange-500'
  if (value >= 75) return 'bg-amber-500'
  return 'bg-emerald-500'
}

const getPolicyBadgeClass = (status) => {
  const map = {
    healthy: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    warning: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    critical: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
  }
  return map[status] || 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
}

const loadSummary = async () => {
  loading.value = true
  try {
    const response = await getAccountPoolSummaryApi()
    if (response?.success) {
      summary.value = response.data || { platforms: {}, totals: null }
    } else {
      showToast(response?.message || '加载账号池策略状态失败', 'error')
    }
  } finally {
    loading.value = false
  }
}

const loadPolicy = async () => {
  const response = await getAccountPoolPolicyApi()
  if (response?.success) {
    policyForm.value = response.data || createDefaultPolicy()
  }
}

const savePolicy = async () => {
  savingPolicy.value = true
  try {
    const response = await updateAccountPoolPolicyApi(policyForm.value)
    if (response?.success) {
      policyForm.value = response.data || policyForm.value
      showToast('账号池策略已保存', 'success')
      await loadSummary()
    } else {
      showToast(response?.message || '保存账号池策略失败', 'error')
    }
  } finally {
    savingPolicy.value = false
  }
}

const runDemo = async (platform, mode) => {
  runningDemo.value = platform + ':' + mode
  try {
    const response = await runAccountPoolDemoApi({ platform, mode })
    if (response?.success) {
      policyForm.value = response.data?.policy || policyForm.value
      const actionText = mode === 'force_stop' ? '模拟到量策略已启用' : '默认策略已恢复'
      const platformLabel = policyPlatforms.find((item) => item.key === platform)?.label || platform
      showToast(platformLabel + ' ' + actionText, 'success')
      await loadSummary()
    } else {
      showToast(response?.message || '执行账号池演示动作失败', 'error')
    }
  } finally {
    runningDemo.value = ''
  }
}

onMounted(() => {
  loadSummary()
  loadPolicy()
})
</script>
