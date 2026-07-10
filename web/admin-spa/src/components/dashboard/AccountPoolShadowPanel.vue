<template>
  <section
    class="mb-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900"
  >
    <div class="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Policy Sweep</p>
        <h2 class="mt-1 text-lg font-bold text-slate-950 dark:text-slate-50">策略影响</h2>
      </div>
      <button
        class="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-white disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
        :disabled="loading"
        type="button"
        @click="loadShadow"
      >
        <i :class="['fas', loading ? 'fa-spinner fa-spin' : 'fa-rotate']" />
        刷新
      </button>
    </div>

    <div
      v-if="loading"
      class="rounded-xl border border-dashed border-slate-300 py-8 text-center text-sm text-slate-500 dark:border-slate-700"
    >
      正在计算策略结果...
    </div>

    <div v-else class="space-y-4">
      <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div
          v-for="card in cards"
          :key="card.label"
          class="rounded-2xl border bg-slate-50 p-4 dark:bg-slate-800"
          :class="card.className"
        >
          <p class="text-xs font-semibold text-slate-500 dark:text-slate-400">{{ card.label }}</p>
          <p class="mt-2 text-2xl font-bold text-slate-950 dark:text-slate-50">{{ card.value }}</p>
          <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">{{ card.detail }}</p>
        </div>
      </div>

      <div
        v-if="reviewBreakdown.length"
        class="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100"
      >
        <div class="mb-2 font-bold">当前非本地策略停用</div>
        <div class="flex flex-wrap gap-2">
          <span
            v-for="item in reviewBreakdown"
            :key="item.reason"
            class="rounded-full border border-amber-200 bg-white/70 px-3 py-1 text-xs font-semibold dark:border-amber-800 dark:bg-amber-950"
          >
            {{ reasonLabel(item.reason) }} {{ item.count }}
          </span>
        </div>
      </div>

      <div class="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div
          v-for="column in columns"
          :key="column.title"
          class="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800"
        >
          <div class="mb-3 flex items-center justify-between">
            <h3 class="text-sm font-bold text-slate-950 dark:text-slate-50">
              {{ column.title }}
            </h3>
            <span class="rounded-full px-2 py-1 text-xs font-semibold" :class="column.badgeClass">
              {{ column.items.length }}
            </span>
          </div>

          <div
            v-if="column.items.length === 0"
            class="rounded-xl border border-dashed border-slate-300 py-6 text-center text-sm text-slate-500 dark:border-slate-700"
          >
            {{ column.emptyText }}
          </div>

          <div v-else class="space-y-2">
            <div
              v-for="item in column.items.slice(0, 12)"
              :key="`${column.title}-${item.provider}-${item.id}`"
              class="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <p class="truncate text-sm font-bold text-slate-950 dark:text-slate-50">
                    {{ item.label || item.id }}
                  </p>
                  <p class="mt-1 text-xs text-slate-500">
                    {{ platformLabel(item.provider) }} / {{ reasonLabel(item.reason) }}
                  </p>
                </div>
                <span
                  class="shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold"
                  :class="governanceClass(item.governance?.source)"
                >
                  {{ item.governance?.label || reasonLabel(item.reason) }}
                </span>
              </div>

              <div class="mt-3 grid grid-cols-3 gap-2 text-[11px] text-slate-500">
                <div>5h {{ item.usage?.fiveHourPercent || 0 }}%</div>
                <div>7d {{ item.usage?.sevenDayPercent || 0 }}%</div>
                <div>请求 {{ item.usage?.requests || 0 }}</div>
              </div>

              <div v-if="healthSignalBadges(item).length" class="mt-2 flex flex-wrap gap-1">
                <span
                  v-for="badge in healthSignalBadges(item)"
                  :key="`${item.id}-${badge}`"
                  class="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                >
                  {{ badge }}
                </span>
              </div>

              <p class="mt-2 text-xs text-slate-500">
                {{ compactItemSummary(item) }}
              </p>
              <p
                v-if="item.stopReason || item.lastError"
                class="mt-2 truncate text-xs text-red-500"
              >
                {{ item.stopReason || item.lastError }}
              </p>
            </div>

            <p v-if="column.items.length > 12" class="text-center text-xs text-slate-500">
              还有 {{ column.items.length - 12 }} 条未显示
            </p>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { getAccountPoolShadowApi } from '@/utils/http_apis'
import { showToast } from '@/utils/tools'

const loading = ref(false)
const shadow = ref({
  target: 'JSZX-AI-03',
  mutationEnabled: false,
  totals: {
    accounts: 0,
    recommendStop: 0,
    recommendResume: 0,
    manualReview: 0,
    reasonBreakdown: {},
    skipBreakdown: {}
  },
  platforms: {
    openai: { recommendStop: [], recommendResume: [], manualReview: [] },
    claude: { recommendStop: [], recommendResume: [], manualReview: [] }
  }
})

const flatten = (field) =>
  ['openai', 'claude'].flatMap((platform) => shadow.value.platforms?.[platform]?.[field] || [])

const stopItems = computed(() => flatten('recommendStop'))
const resumeItems = computed(() => flatten('recommendResume'))
const reviewItems = computed(() => flatten('manualReview'))

const reviewBreakdown = computed(() =>
  Object.entries(shadow.value.totals?.skipBreakdown || {}).map(([reason, count]) => ({
    reason,
    count
  }))
)

const cards = computed(() => [
  {
    label: '服务器账号',
    value: shadow.value.totals?.accounts || 0,
    detail: '参与判断',
    className: 'border-slate-200 dark:border-slate-700'
  },
  {
    label: '策略会停用',
    value: shadow.value.totals?.recommendStop || 0,
    detail: '任一阈值到量',
    className: 'border-red-200 dark:border-red-900/60'
  },
  {
    label: '策略会恢复',
    value: shadow.value.totals?.recommendResume || 0,
    detail: '仅自动停用账号',
    className: 'border-emerald-200 dark:border-emerald-900/60'
  },
  {
    label: '非策略停用',
    value: shadow.value.totals?.manualReview || 0,
    detail: '远端或账号原因',
    className: 'border-amber-200 dark:border-amber-900/60'
  }
])

const columns = computed(() => [
  {
    title: '策略会停用',
    items: stopItems.value,
    emptyText: '当前策略不会新增停用账号',
    badgeClass:
      'border border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200'
  },
  {
    title: '策略会恢复',
    items: resumeItems.value,
    emptyText: '当前策略不会新增恢复账号',
    badgeClass:
      'border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200'
  },
  {
    title: '非本地策略停用',
    items: reviewItems.value,
    emptyText: '当前没有非本地策略停用账号',
    badgeClass:
      'border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200'
  }
])

const reasonLabels = {
  five_hour_limit: '5h 到量',
  seven_day_limit: '7d 到量',
  cost_limit: '成本到量',
  token_limit: 'Token 到量',
  request_limit: '请求数到量',
  policy_limit_recovered: '额度已恢复',
  quota_rebalance_paused: 'quota-rebalance 暂停',
  not_schedulable: '不可调度',
  remote: '远端停用',
  quota_exhausted: '额度到量',
  quota_paused: '额度暂停',
  remote_deploy_stopped: '部署停用',
  state_frozen: '状态冻结待探测',
  subscription_issue: '订阅或账号异常',
  remote_offline: '远端不可用',
  upstream_error: '上游异常',
  quota_error: '额度错误',
  quota: '额度暂停',
  upstream: '上游异常',
  provider_error: '服务读取失败',
  unknown: '未知原因'
}

const platformLabel = (provider) => (provider === 'claude' ? 'Claude' : 'OpenAI')
const reasonLabel = (reason) => reasonLabels[reason] || reason || '未知原因'

const healthSignalBadges = (item) => {
  const signals = item.healthSignals || {}
  const badges = []
  if (signals.tier) badges.push(signals.tier)
  if (signals.primaryResetStatus) badges.push(`5h ${signals.primaryResetStatus}`)
  if (signals.weeklyResetStatus) badges.push(`7d ${signals.weeklyResetStatus}`)
  if (signals.restoreStatus) badges.push(`restore ${signals.restoreStatus}`)
  if (signals.probeStale) badges.push('probe-stale')
  if (signals.tokenInvalid) badges.push('TOKEN_INVALID')
  if (signals.subscriptionExpired) badges.push('SUB_EXPIRED')
  if (signals.zombie) badges.push('ZOMBIE')
  for (const note of signals.quotaNotes || []) {
    badges.push(note)
  }
  return [...new Set(badges)]
}

const governanceClass = (source) => {
  if (source === 'policy') return 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-200'
  if (source === 'quota')
    return 'bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-200'
  if (source === 'upstream')
    return 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200'
  if (source === 'state') return 'bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-200'
  if (source === 'remote')
    return 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200'
  return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
}

const statusHelp = (item) => {
  if (item.action === 'would_stop') return '执行本地策略时会停用调度'
  if (item.action === 'would_resume') return '执行本地策略时会恢复调度'
  return '需要确认远端状态'
}

const compactItemSummary = (item) => {
  if (item.action === 'would_stop') {
    return `命中 ${reasonLabel(item.reason)}，执行后才会停用调度`
  }
  if (item.action === 'would_resume') {
    return '额度已恢复，执行后才会恢复调度'
  }
  if (item.stopCategory === 'quota_paused') {
    return '服务器 quota-rebalance 已暂停调度，等待窗口恢复或探测刷新'
  }
  if (item.stopCategory === 'remote_deploy_stopped') {
    return 'deploy.spec.replicas=0'
  }
  if (item.stopCategory === 'state_frozen') {
    return 'reset 已过期，等待远端探测刷新'
  }
  if (item.stopCategory === 'subscription_issue') {
    return '账号或订阅异常，需要人工处理'
  }
  if (item.stopSource === 'quota') {
    return `${reasonLabel(item.stopTrigger || item.reason)}，等待远端额度恢复`
  }
  return statusHelp(item)
}

const loadShadow = async () => {
  loading.value = true
  try {
    const response = await getAccountPoolShadowApi()
    if (response?.success) {
      shadow.value = response.data || shadow.value
    } else {
      showToast(response?.message || '读取策略影响失败', 'error')
    }
  } finally {
    loading.value = false
  }
}

onMounted(loadShadow)
</script>
