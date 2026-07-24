<template>
  <div class="tab-content">
    <div class="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          OpenAI + Claude
        </p>
        <h2 class="mt-1 text-2xl font-bold text-slate-950 dark:text-slate-50">账号池策略</h2>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <button
          class="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-emerald-300 hover:text-emerald-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          :disabled="sweepLoading || adminSkillLoading"
          @click="runAdminSkillSweep"
        >
          <i class="fas fa-magnifying-glass-chart" />
          调用 admin 预演
        </button>
        <button
          class="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-cyan-300 hover:text-cyan-700 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          :disabled="adminSkillLoading"
          @click="runAdminSkillRefresh"
        >
          <i :class="['fas', adminSkillLoading ? 'fa-spinner fa-spin' : 'fa-rotate']" />
          刷新账号池
        </button>
        <button
          class="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-amber-300 hover:text-amber-700 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          :disabled="resetBankLoading"
          @click="runResetBankSweep(false)"
        >
          <i :class="['fas', resetBankLoading ? 'fa-spinner fa-spin' : 'fa-ticket']" />
          查看重置卡
        </button>
        <button
          class="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-orange-300 hover:text-orange-700 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          :disabled="resetBankLoading"
          @click="runResetBankSweep(true)"
        >
          <i :class="['fas', resetBankLoading ? 'fa-spinner fa-spin' : 'fa-list-check']" />
          全量状态
        </button>
        <button
          class="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-emerald-600 dark:hover:bg-emerald-500"
          :disabled="sweepLoading"
          @click="runSweep(false)"
        >
          <i class="fas fa-play" />
          执行本地一次
        </button>
      </div>
    </div>

    <div
      v-if="sweepResult"
      class="mb-5 rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/80"
    >
      <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p class="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">SWEEP</p>
          <h3 class="mt-1 text-lg font-bold text-slate-950 dark:text-slate-50">
            {{ sweepTitle }}
          </h3>
          <p class="mt-1 text-sm text-slate-500">
            {{ sweepDescription }}
          </p>
        </div>
        <div class="grid grid-cols-3 gap-2 text-center sm:grid-cols-6">
          <div
            v-for="item in sweepStats"
            :key="item.label"
            class="rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-800"
          >
            <p class="text-lg font-bold text-slate-950 dark:text-slate-50">{{ item.value }}</p>
            <p class="text-xs text-slate-500">{{ item.label }}</p>
          </div>
        </div>
      </div>
      <div
        v-if="sweepBreakdown.length"
        class="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4 text-xs dark:border-slate-800"
      >
        <span
          v-for="item in sweepBreakdown"
          :key="`${item.type}-${item.reason}`"
          class="rounded-full border px-3 py-1 font-semibold"
          :class="
            item.type === 'skip'
              ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200'
              : 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200'
          "
        >
          {{ item.type === 'skip' ? '非策略停用' : '策略会停用' }} · {{ reasonLabel(item.reason) }}
          {{ item.count }}
        </span>
      </div>
    </div>

    <div
      v-if="resetBankResult"
      class="mb-5 rounded-2xl border border-amber-200 bg-amber-50/80 p-4 shadow-sm dark:border-amber-900/50 dark:bg-amber-950/20"
    >
      <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p
            class="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700 dark:text-amber-300"
          >
            RESET BANK
          </p>
          <h3 class="mt-1 text-lg font-bold text-slate-950 dark:text-slate-50">
            OpenAI 账号重置卡
          </h3>
          <p class="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">
            {{ resetBankSourceText }}
          </p>
        </div>
        <div class="grid grid-cols-3 gap-2 text-center">
          <div
            v-for="item in resetBankStats"
            :key="item.label"
            class="rounded-xl bg-white/80 px-3 py-2 dark:bg-slate-900/70"
          >
            <p class="text-lg font-bold text-slate-950 dark:text-slate-50">{{ item.value }}</p>
            <p class="text-xs text-slate-500">{{ item.label }}</p>
          </div>
        </div>
      </div>
      <div
        class="mt-4 overflow-x-auto rounded-xl border border-amber-200 bg-white/75 dark:border-amber-900/50 dark:bg-slate-950/40"
      >
        <table class="min-w-full divide-y divide-amber-100 text-sm dark:divide-slate-800">
          <thead>
            <tr class="text-left text-xs uppercase tracking-wide text-slate-500">
              <th class="px-3 py-2">账号</th>
              <th class="px-3 py-2">5h</th>
              <th class="px-3 py-2">7d</th>
              <th class="px-3 py-2">重置卡</th>
              <th class="px-3 py-2">探测</th>
              <th class="px-3 py-2">调度权重</th>
              <th class="px-3 py-2">可用</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-amber-100 dark:divide-slate-800">
            <tr v-for="account in resetBankAccounts" :key="account.id">
              <td class="px-3 py-2 font-semibold text-slate-900 dark:text-slate-100">
                {{ account.id || '-' }}
              </td>
              <td class="px-3 py-2 text-slate-600 dark:text-slate-300">
                {{ formatPercent(account.fiveHourPercent) }}
              </td>
              <td class="px-3 py-2 text-slate-600 dark:text-slate-300">
                {{ formatPercent(account.sevenDayPercent) }}
              </td>
              <td class="px-3 py-2 font-semibold text-amber-700 dark:text-amber-300">
                {{ account.credits ?? '-' }}
              </td>
              <td class="px-3 py-2 text-slate-600 dark:text-slate-300">
                {{ formatResetBankProbeStatus(account) }}
              </td>
              <td class="px-3 py-2 text-slate-600 dark:text-slate-300">
                <span class="font-semibold text-slate-900 dark:text-slate-100">
                  {{ formatDispatchWeight(account) }}
                </span>
                <span
                  v-if="formatResetCardExpiry(account)"
                  class="ml-2 text-xs text-slate-500 dark:text-slate-400"
                >
                  {{ formatResetCardExpiry(account) }}
                </span>
              </td>
              <td class="px-3 py-2">
                <span
                  class="rounded-full px-2 py-1 text-xs font-semibold"
                  :class="
                    account.allowed
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200'
                      : 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-200'
                  "
                >
                  {{ formatResetBankAvailability(account) }}
                </span>
              </td>
            </tr>
            <tr v-if="resetBankAccounts.length === 0">
              <td class="px-3 py-6 text-center text-slate-500" colspan="7">暂无重置卡扫描结果</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <ServerStatePanel />
    <AccountPoolShadowPanel />
    <AccountPoolSummaryPanel />
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import AccountPoolShadowPanel from '@/components/dashboard/AccountPoolShadowPanel.vue'
import AccountPoolSummaryPanel from '@/components/dashboard/AccountPoolSummaryPanel.vue'
import ServerStatePanel from '@/components/dashboard/ServerStatePanel.vue'
import { runAccountPoolAdminSkillActionApi, runAccountPoolSweepApi } from '@/utils/http_apis'

const sweepLoading = ref(false)
const adminSkillLoading = ref(false)
const resetBankLoading = ref(false)
const sweepResult = ref(null)
const resetBankResult = ref(null)

const sweepTitle = computed(() => {
  if (!sweepResult.value) return ''
  if (sweepResult.value.adminSkillAction) {
    if (sweepResult.value.adminSkillAction === 'refresh_mirror') return '服务器镜像刷新'
    return sweepResult.value.dryRun ? 'admin 仓库策略预演' : 'admin 仓库执行结果'
  }
  return sweepResult.value.dryRun ? '策略影响预演' : '本地执行结果'
})

const sweepDescription = computed(() => {
  if (!sweepResult.value) return ''
  if (sweepResult.value.adminSkillAction) {
    if (sweepResult.value.adminSkillAction === 'refresh_mirror') {
      return sweepResult.value.message || '已读取服务器 OpenAI / Claude 账号镜像'
    }
    return sweepResult.value.message || '已通过 carher-admin 既有能力完成'
  }
  if (sweepResult.value.mode === 'server-mirror') {
    const source = sweepResult.value.source?.kind || '服务器镜像'
    const count = sweepResult.value.source?.count ?? sweepResult.value.totals?.scanned ?? 0
    return `${sweepResult.value.target || '服务器'} · ${source} · ${count} 个账号`
  }
  return sweepResult.value.dryRun ? '本地预演' : '本地执行'
})

const sweepStats = computed(() => {
  const totals = sweepResult.value?.totals || {}
  const dryRun = sweepResult.value?.dryRun
  return [
    { label: '账号', value: totals.scanned || 0 },
    { label: '策略停用', value: totals.wouldStop || 0 },
    { label: '策略恢复', value: totals.wouldResume || 0 },
    { label: '已停用', value: dryRun ? '-' : totals.stopped || 0 },
    { label: '已恢复', value: dryRun ? '-' : totals.resumed || 0 },
    { label: '非策略停用', value: totals.skipped || 0 }
  ]
})

const reasonLabels = {
  five_hour_limit: '5h 到量',
  seven_day_limit: '7d 到量',
  cost_limit: '成本到量',
  token_limit: 'Token 到量',
  request_limit: '请求数到量',
  remote: '远端停用',
  quota_exhausted: '额度触发停用',
  remote_deploy_stopped: '部署停用',
  state_frozen: '状态冻结待探测',
  subscription_issue: '订阅/账号异常',
  remote_offline: '远端不可用',
  upstream_error: '上游异常',
  quota_error: '额度错误',
  quota: '额度停用',
  upstream: '上游异常',
  state: '状态冻结',
  not_schedulable: '不可调度',
  provider_error: '服务读取失败',
  unknown: '未知原因'
}

const reasonLabel = (reason) => reasonLabels[reason] || reason || '未知原因'

const sweepBreakdown = computed(() => {
  const totals = sweepResult.value?.totals || {}
  const stop = Object.entries(totals.reasonBreakdown || {}).map(([reason, count]) => ({
    type: 'stop',
    reason,
    count
  }))
  const skip = Object.entries(totals.skipBreakdown || {}).map(([reason, count]) => ({
    type: 'skip',
    reason,
    count
  }))
  return [...stop, ...skip]
})

const resetBankAccounts = computed(() => resetBankResult.value?.accounts || [])

const resetBankStats = computed(() => {
  const totals = resetBankResult.value?.totals || {}
  return [
    { label: '扫描', value: totals.scanned || 0 },
    { label: '有卡', value: totals.withCredits || 0 },
    { label: '撞限', value: totals.exhausted || 0 }
  ]
})

const resetBankSourceText = computed(() => {
  if (!resetBankResult.value) return ''
  const cache = resetBankResult.value.cache || {}
  const parts = []
  const scanned = resetBankResult.value.totals?.scanned || 0
  const requested = resetBankResult.value.requestedAccounts || scanned
  const limit = resetBankResult.value.scanLimit
  const scanMode = resetBankResult.value.scanMode

  parts.push(cache.cached ? '缓存结果' : '实时探测')
  if (scanMode === 'full-sweep') {
    parts.push('全量扫描')
  } else if (scanMode === 'full-mirror-priority-probe') {
    parts.push('全量状态')
    if (resetBankResult.value.totals?.probed !== undefined) {
      parts.push(`探测 ${resetBankResult.value.totals.probed} 个`)
    }
  } else if (scanMode === 'priority-probe') {
    parts.push('优先扫描')
  }
  if (requested) {
    parts.push(`候选 ${requested} 个`)
  }
  if (limit) {
    parts.push(`上限 ${limit} 个`)
  }
  if (cache.cached && Number.isFinite(Number(cache.ageMs))) {
    parts.push(`${Math.round(Number(cache.ageMs) / 1000)} 秒前`)
  }

  return parts.join(' · ')
})

const formatPercent = (value) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '-'
  return `${Math.round(Number(value))}%`
}

const formatDispatchWeight = (account) => {
  const weight = account.dispatchWeight || {}
  if (weight.hasResetCard) {
    return `优先 · ${weight.resetCardCredits || account.credits || 0} 张`
  }
  return `普通 · P${weight.priority || account.priority || 50}`
}

const formatResetCardExpiry = (account) => {
  const value = account.dispatchWeight?.resetCardExpiresAt || account.resetCardExpiresAt
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return `到期 ${date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}`
}

const formatResetBankAvailability = (account) => {
  if (account.allowed) return '可用'
  const reasonLabels = {
    no_pod: '无 Pod',
    http_401: 'Token 失效',
    skipped: '跳过',
    unparsed: '不可解析'
  }
  return reasonLabels[account.unavailableReason] || '不可用'
}

const formatResetBankProbeStatus = (account) => {
  if (account.resetCardProbeStatus === 'probed') return '已探测'
  return '未探测'
}

const runSweep = async (dryRun) => {
  sweepLoading.value = true
  try {
    const response = await runAccountPoolSweepApi({
      dryRun,
      source: dryRun ? 'server' : 'local'
    })
    sweepResult.value = response.data || response
    ElMessage.success(dryRun ? '服务器策略预演完成' : '本地策略执行完成')
  } catch (error) {
    ElMessage.error(error.message || '账号池策略执行失败')
  } finally {
    sweepLoading.value = false
  }
}

const applyAdminSkillResult = (payload) => {
  const data = payload?.data || payload
  if (data?.action === 'refresh_mirror') {
    const totals = data?.data?.totals || {}
    sweepResult.value = {
      mode: 'server-mirror-refresh',
      dryRun: true,
      mutationEnabled: false,
      adminSkillAction: data.action,
      message: `${data?.data?.target || '服务器'} · ${data?.data?.source?.kind || '账号镜像'} · 可调度 ${totals.schedulable || 0} / 停用 ${totals.stopped || 0}`,
      totals: {
        scanned: totals.scanned || 0,
        wouldStop: 0,
        wouldResume: 0,
        stopped: totals.stopped || 0,
        resumed: 0,
        skipped: 0
      }
    }
    return
  }

  if (data?.data?.totals) {
    sweepResult.value = {
      ...data.data,
      adminSkillAction: data.action,
      message: data.message
    }
    return
  }

  sweepResult.value = {
    mode: 'admin-skill',
    dryRun: data?.dryRun ?? true,
    mutationEnabled: data?.mutationEnabled ?? false,
    adminSkillAction: data?.action,
    message: data?.message || 'admin 仓库动作完成',
    totals: {
      scanned: data?.data?.account ? 1 : 0,
      wouldStop: 0,
      wouldResume: 0,
      stopped: 0,
      resumed: 0,
      skipped: 0
    }
  }
}

const runAdminSkillSweep = async () => {
  adminSkillLoading.value = true
  try {
    const response = await runAccountPoolAdminSkillActionApi({
      action: 'openai_sweep_dry_run'
    })
    applyAdminSkillResult(response.data || response)
    ElMessage.success('已调用 admin 仓库策略预演')
  } catch (error) {
    ElMessage.error(error.message || 'admin 仓库策略预演失败')
  } finally {
    adminSkillLoading.value = false
  }
}

const runAdminSkillRefresh = async () => {
  adminSkillLoading.value = true
  try {
    const response = await runAccountPoolAdminSkillActionApi({
      action: 'refresh_mirror'
    })
    applyAdminSkillResult(response.data || response)
    ElMessage.success('账号池状态已刷新')
  } catch (error) {
    ElMessage.error(error.message || '账号池刷新失败')
  } finally {
    adminSkillLoading.value = false
  }
}

const runResetBankSweep = async (full = false) => {
  resetBankLoading.value = true
  try {
    const response = await runAccountPoolAdminSkillActionApi(
      {
        action: full ? 'openai_reset_bank_full_sweep' : 'openai_reset_bank_sweep'
      },
      { timeout: full ? 240000 : 90000 }
    )
    if (response?.success === false) {
      throw new Error(response.message || '重置卡读取失败')
    }
    const data = response.data || response
    resetBankResult.value = data.data || data
    ElMessage.success(full ? '全量账号状态已读取' : '重置卡状态已读取')
  } catch (error) {
    ElMessage.error(error.message || (full ? '全量账号状态读取失败' : '重置卡读取失败'))
  } finally {
    resetBankLoading.value = false
  }
}
</script>
