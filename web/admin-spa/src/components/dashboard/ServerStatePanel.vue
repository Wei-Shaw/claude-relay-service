<template>
  <section
    class="mb-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900"
  >
    <div class="mb-5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
      <div>
        <p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          Server Mirror
        </p>
        <h2 class="mt-1 text-lg font-bold text-slate-950 dark:text-slate-50">服务器账号池状态</h2>
      </div>
      <button
        class="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-white disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
        :disabled="loading"
        type="button"
        @click="loadState({ force: true })"
      >
        <i :class="['fas', loading ? 'fa-spinner fa-spin' : 'fa-rotate']" />
        刷新服务器状态
      </button>
    </div>

    <div
      v-if="loading"
      class="rounded-xl border border-dashed border-slate-300 py-8 text-center text-sm text-slate-500 dark:border-slate-700"
    >
      正在读取服务器状态...
    </div>

    <div v-else class="space-y-4">
      <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div
          v-for="card in metricCards"
          :key="card.label"
          class="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800"
        >
          <div class="mb-3 flex items-center justify-between">
            <p class="text-xs font-semibold text-slate-500 dark:text-slate-400">
              {{ card.label }}
            </p>
            <span
              class="inline-flex h-8 w-8 items-center justify-center rounded-xl text-white"
              :class="card.iconClass"
            >
              <i :class="card.icon" />
            </span>
          </div>
          <p class="text-2xl font-bold text-slate-950 dark:text-slate-50">{{ card.value }}</p>
          <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">{{ card.detail }}</p>
        </div>
      </div>

      <div
        v-if="stopBreakdown.length"
        class="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800"
      >
        <span
          v-for="item in stopBreakdown"
          :key="item.key"
          class="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold"
          :class="item.className"
        >
          {{ item.label }}
          <span>{{ item.count }}</span>
        </span>
      </div>

      <div
        class="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800"
      >
        <div class="mb-4 flex items-center justify-between gap-3">
          <div>
            <p class="text-sm font-bold text-slate-950 dark:text-slate-50">OpenAI / Claude 账号</p>
            <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {{ sourceKindLabel }} · {{ formatDateTime(mirror.source?.readAt) }}
            </p>
          </div>
          <div class="text-right text-xs text-slate-500">
            OpenAI {{ mirror.totals.openai.total }} / Claude {{ mirror.totals.claude.total }}
          </div>
        </div>

        <div
          v-if="mirror.accounts.length === 0"
          class="rounded-xl border border-dashed border-slate-300 py-8 text-center text-sm text-slate-500 dark:border-slate-700"
        >
          暂无服务器账号数据
        </div>

        <div
          v-else
          class="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700"
        >
          <div
            class="hidden grid-cols-10 gap-3 bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-500 dark:bg-slate-950/60 md:grid"
          >
            <span>平台</span>
            <span class="col-span-2">账号</span>
            <span>5h</span>
            <span>7d</span>
            <span>请求</span>
            <span>状态</span>
            <span class="col-span-2">原因</span>
            <span>操作</span>
          </div>

          <div
            v-for="account in mirror.accounts"
            :key="`${account.provider}-${account.id}`"
            class="grid gap-3 border-t border-slate-200 px-3 py-3 text-sm first:border-t-0 dark:border-slate-700 md:grid-cols-10 md:items-center"
          >
            <div>
              <span
                class="inline-flex rounded-full px-2 py-1 text-xs font-semibold"
                :class="
                  account.provider === 'openai'
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-indigo-100 text-indigo-700'
                "
              >
                {{ providerLabel(account.provider) }}
              </span>
            </div>
            <div class="col-span-2 min-w-0">
              <p class="truncate font-semibold text-slate-900 dark:text-slate-100">
                {{ account.label }}
              </p>
              <p class="truncate text-xs text-slate-500">
                {{ account.email || account.maskedSecret || account.id }}
              </p>
            </div>
            <div class="text-slate-700 dark:text-slate-200">
              {{ percentText(account.usage?.fiveHourPercent) }}
            </div>
            <div class="text-slate-700 dark:text-slate-200">
              {{ percentText(account.usage?.sevenDayPercent) }}
            </div>
            <div class="text-slate-700 dark:text-slate-200">
              {{ account.usage?.requests || 0 }}
            </div>
            <div>
              <span
                class="inline-flex rounded-full px-2 py-1 text-xs font-semibold"
                :class="statusBadgeClass(account)"
              >
                {{ statusLabel(account) }}
              </span>
              <p v-if="recoveryText(account)" class="mt-1 truncate text-xs text-slate-500">
                {{ recoveryText(account) }}
              </p>
            </div>
            <div class="col-span-2 min-w-0">
              <p
                class="truncate text-xs font-semibold text-slate-700 dark:text-slate-200"
                :title="account.stopDiagnosis || statusEvidence(account)"
              >
                {{ statusEvidence(account) }}
              </p>
            </div>
            <div class="flex flex-wrap gap-1">
              <button
                v-if="account.schedulable"
                class="rounded-lg border border-orange-200 bg-orange-50 px-2 py-1 text-[11px] font-semibold text-orange-700 transition hover:border-orange-300 disabled:cursor-not-allowed disabled:opacity-60 dark:border-orange-900/60 dark:bg-orange-950/30 dark:text-orange-200"
                :disabled="isActionRunning(account, 'pause')"
                type="button"
                @click="runAccountAction(account, 'pause')"
              >
                <i
                  :class="[
                    'fas mr-1',
                    isActionRunning(account, 'pause') ? 'fa-spinner fa-spin' : 'fa-pause'
                  ]"
                />
                停用
              </button>
              <button
                v-else
                class="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 transition hover:border-emerald-300 disabled:cursor-not-allowed disabled:opacity-60 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200"
                :disabled="isActionRunning(account, 'resume')"
                type="button"
                @click="runAccountAction(account, 'resume')"
              >
                <i
                  :class="[
                    'fas mr-1',
                    isActionRunning(account, 'resume') ? 'fa-spinner fa-spin' : 'fa-play'
                  ]"
                />
                恢复
              </button>
              <button
                class="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 transition hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                :disabled="isActionRunning(account, 'refresh')"
                type="button"
                @click="runAccountAction(account, 'refresh')"
              >
                <i
                  :class="[
                    'fas mr-1',
                    isActionRunning(account, 'refresh') ? 'fa-spinner fa-spin' : 'fa-rotate'
                  ]"
                />
                刷新
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { showToast } from '@/utils/tools'
import { getServerStateAccountsApi, runServerStateAccountActionApi } from '@/utils/http_apis'

const loading = ref(false)
const runningAction = ref('')
const state = ref({
  accounts: {}
})
const mirror = ref({
  source: {
    kind: 'unknown',
    readAt: null
  },
  accounts: [],
  totals: {
    openai: { total: 0, schedulable: 0, stopped: 0 },
    claude: { total: 0, schedulable: 0, stopped: 0 }
  }
})

const parseDate = (value) => {
  if (!value) return null
  const numeric = Number(value)
  const date = new Date(Number.isFinite(numeric) && numeric < 10000000000 ? numeric * 1000 : value)
  return Number.isNaN(date.getTime()) ? null : date
}

const formatDateTime = (value) => {
  const date = parseDate(value)
  if (!date) return '未同步'
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

const sourceLabels = {
  carher_admin_quota_script: 'carher-admin 实时脚本',
  canonical_state: 'canonical state.json',
  live_acct_admin: 'acct-admin API',
  ccmax_pool_guard: 'Claude guard',
  combined_account_state: '聚合状态',
  unavailable: '不可用'
}

const sourceKindLabel = computed(() => {
  const kind = mirror.value.source?.kind || 'unknown'
  return sourceLabels[kind] || kind
})

const totalSchedulable = computed(
  () => mirror.value.totals.openai.schedulable + mirror.value.totals.claude.schedulable
)
const totalStopped = computed(
  () => mirror.value.totals.openai.stopped + mirror.value.totals.claude.stopped
)

const metricCards = computed(() => [
  {
    label: '服务器账号',
    value: mirror.value.accounts.length || state.value.accounts?.total || 0,
    detail: `可调度 ${totalSchedulable.value} / 不可调度 ${totalStopped.value}`,
    icon: 'fas fa-users',
    iconClass: 'bg-slate-900 dark:bg-slate-100 dark:text-slate-900'
  },
  {
    label: 'OpenAI',
    value: mirror.value.totals.openai.total,
    detail: `可调度 ${mirror.value.totals.openai.schedulable} / 不可调度 ${mirror.value.totals.openai.stopped}`,
    icon: 'fas fa-key',
    iconClass: 'bg-emerald-600'
  },
  {
    label: 'Claude',
    value: mirror.value.totals.claude.total,
    detail: `可调度 ${mirror.value.totals.claude.schedulable} / 不可调度 ${mirror.value.totals.claude.stopped}`,
    icon: 'fas fa-layer-group',
    iconClass: 'bg-indigo-600'
  },
  {
    label: '数据源',
    value: sourceKindLabel.value,
    detail: formatDateTime(mirror.value.source?.readAt),
    icon: 'fas fa-route',
    iconClass: 'bg-cyan-600'
  }
])

const stopCategoryLabels = {
  quota_exhausted: '5h/7d 到量',
  quota_paused: '额度暂停',
  remote_deploy_stopped: '部署停用',
  state_frozen: '状态冻结',
  subscription_issue: '账号异常',
  pod_not_ready: 'Pod 未就绪',
  remote_offline: '远端不可用',
  upstream_error: '上游异常',
  quota_error: '额度错误',
  unknown: '未知'
}

const stopCategoryClass = {
  quota_exhausted:
    'border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200',
  quota_paused:
    'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900/60 dark:bg-orange-950/30 dark:text-orange-200',
  state_frozen:
    'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-200',
  subscription_issue:
    'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900/60 dark:bg-orange-950/30 dark:text-orange-200',
  pod_not_ready:
    'border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200',
  remote_offline:
    'border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200',
  upstream_error:
    'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200',
  quota_error:
    'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200'
}

const stopBreakdown = computed(() => {
  const counts = mirror.value.accounts.reduce((acc, account) => {
    if (account.schedulable) return acc
    const key = account.stopCategory || account.stopSource || 'unknown'
    acc[key] = (acc[key] || 0) + 1
    return acc
  }, {})

  return Object.entries(counts).map(([key, count]) => ({
    key,
    count,
    label: stopCategoryLabels[key] || key,
    className:
      stopCategoryClass[key] ||
      'border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
  }))
})

const providerLabel = (provider) => {
  if (provider === 'openai') return 'OpenAI'
  if (provider === 'claude') return 'Claude'
  return provider
}

const percentText = (value) => {
  const number = Number(value)
  return Number.isFinite(number) ? `${number}%` : '-'
}

const statusLabel = (account) => {
  if (account.schedulable) return '可调度'
  if (account.stopSource === 'quota') {
    if (account.stopTrigger === 'five_hour_limit') return '5h 到量'
    if (account.stopTrigger === 'seven_day_limit') return '7d 到量'
    return '额度暂停'
  }
  if (account.stopCategory === 'pod_not_ready') return 'Pod 未就绪'
  if (account.stopCategory === 'state_frozen') return '状态冻结'
  if (account.stopCategory === 'remote_deploy_stopped') return '部署停用'
  if (account.stopCategory === 'subscription_issue') return '账号异常'
  if (account.stopSource === 'state') return '状态冻结'
  if (account.stopSource === 'upstream') return '上游异常'
  if (account.stopSource === 'remote') return '远端不可用'
  return '不可调度'
}

const statusBadgeClass = (account) => {
  if (account.schedulable) return 'bg-emerald-100 text-emerald-700'
  if (account.stopSource === 'quota') return 'bg-orange-100 text-orange-700'
  if (account.stopSource === 'state') return 'bg-sky-100 text-sky-700'
  if (account.stopSource === 'upstream') return 'bg-amber-100 text-amber-700'
  if (account.stopCategory === 'subscription_issue') return 'bg-orange-100 text-orange-700'
  return 'bg-slate-200 text-slate-700'
}

const recoveryText = (account) => {
  if (account.schedulable || account.stopSource !== 'quota') return ''
  const resetAt =
    account.stopTrigger === 'seven_day_limit'
      ? account.recovery?.sevenDayResetAt
      : account.recovery?.fiveHourResetAt
  const text = formatDateTime(resetAt)
  return text !== '未同步' ? `恢复 ${text}` : ''
}

const statusEvidence = (account) => {
  if (account.schedulable) return '可接收流量'
  if (account.stopSource === 'quota') {
    if (account.stopTrigger === 'five_hour_limit') {
      return `5h=${account.usage?.fiveHourPercent || 0}%`
    }
    if (account.stopTrigger === 'seven_day_limit') {
      return `7d=${account.usage?.sevenDayPercent || 0}%`
    }
    return account.stopReason || 'quota-rebalance 暂停'
  }
  if (account.stopCategory === 'pod_not_ready') return account.stopReason || 'Pod 未就绪'
  if (account.stopCategory === 'remote_deploy_stopped') {
    return account.stopReason || 'deploy.spec.replicas=0'
  }
  if (account.stopCategory === 'state_frozen') {
    return 'reset 已过期，等待远端探测刷新'
  }
  if (account.stopCategory === 'subscription_issue') {
    return account.stopReason || 'token/订阅异常'
  }
  if (account.stopSource === 'upstream') {
    return account.stopReason || account.lastError || '上游异常'
  }
  return account.stopReason || account.lastError || '远端不可调度'
}

const actionKey = (account, action) => `${account.provider}:${account.id}:${action}`
const isActionRunning = (account, action) => runningAction.value === actionKey(account, action)

const loadAccountMirror = async (options = {}) => {
  const accountsResponse = await getServerStateAccountsApi({
    force: options.force === true ? 'true' : undefined
  })
  if (accountsResponse?.success) {
    mirror.value = accountsResponse.data || mirror.value
    return true
  }

  showToast(accountsResponse?.message || '读取服务器账号失败', 'error')
  return false
}

const loadState = async (options = {}) => {
  loading.value = true
  try {
    await loadAccountMirror(options)
  } finally {
    loading.value = false
  }
}

const runAccountAction = async (account, action) => {
  runningAction.value = actionKey(account, action)
  try {
    const response = await runServerStateAccountActionApi({
      provider: account.provider,
      accountId: account.id,
      action
    })

    if (response?.success) {
      const actionLabels = {
        refresh: '已刷新',
        pause: '已停用',
        resume: '已恢复'
      }
      showToast(
        `${providerLabel(account.provider)} ${account.label} ${actionLabels[action] || '已执行'}`,
        'success'
      )
      await loadAccountMirror({ force: true })
    } else {
      showToast(response?.message || '服务器账号操作失败', 'error')
    }
  } catch (error) {
    showToast(error.message || '服务器账号操作失败', 'error')
  } finally {
    runningAction.value = ''
  }
}

onMounted(loadState)
</script>
