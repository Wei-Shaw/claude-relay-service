<template>
  <Teleport to="body">
    <div class="modal fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <div
        class="modal-content mx-auto flex max-h-[90vh] w-full max-w-3xl flex-col p-4 sm:p-6 md:p-8"
      >
        <div class="mb-4 flex items-center justify-between sm:mb-6">
          <div class="flex items-center gap-3">
            <div
              class="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600"
            >
              <i class="fas fa-layer-group text-base text-white" />
            </div>
            <div>
              <h3 class="text-lg font-bold text-gray-900 dark:text-gray-100 sm:text-xl">
                批量修改账户优先级
              </h3>
              <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                将为选中的 {{ selectedCount }} 个账户统一设置新的调度优先级
              </p>
            </div>
          </div>
          <button
            class="p-1 text-gray-400 transition-colors hover:text-gray-600 dark:hover:text-gray-300"
            :disabled="loading"
            @click="$emit('close')"
          >
            <i class="fas fa-times text-lg sm:text-xl" />
          </button>
        </div>

        <form
          class="modal-scroll-content custom-scrollbar flex-1 space-y-5"
          @submit.prevent="submit"
        >
          <div class="rounded-xl bg-blue-50 p-4 dark:bg-blue-900/20">
            <div class="flex items-start gap-3">
              <i class="fas fa-info-circle mt-0.5 text-blue-500" />
              <div class="space-y-1 text-sm text-blue-700 dark:text-blue-300">
                <p class="font-medium">优先级说明</p>
                <p>优先级范围为 1-100，数字越小优先级越高。</p>
                <p>本次操作仅修改优先级字段，不会影响账户启用状态、分组和其他配置。</p>
              </div>
            </div>
          </div>

          <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div
              class="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800/60"
            >
              <div
                class="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400"
              >
                选中账户
              </div>
              <div class="mt-2 text-2xl font-bold text-gray-900 dark:text-gray-100">
                {{ selectedCount }}
              </div>
            </div>
            <div
              class="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800/60"
            >
              <div
                class="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400"
              >
                当前优先级范围
              </div>
              <div class="mt-2 text-lg font-semibold text-gray-900 dark:text-gray-100">
                {{ priorityStats.min }} - {{ priorityStats.max }}
              </div>
              <div class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                平均 {{ priorityStats.average.toFixed(1) }}
              </div>
            </div>
            <div
              class="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800/60"
            >
              <div
                class="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400"
              >
                覆盖平台
              </div>
              <div class="mt-2 flex flex-wrap gap-2">
                <span
                  v-for="item in platformSummary"
                  :key="item.platform"
                  class="inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300"
                >
                  {{ item.label }} · {{ item.count }}
                </span>
              </div>
            </div>
          </div>

          <div
            class="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800/60"
          >
            <label class="mb-3 block text-sm font-semibold text-gray-700 dark:text-gray-300">
              目标优先级
            </label>
            <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
              <input
                v-model="priorityInput"
                class="form-input w-full border-gray-300 text-base dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 sm:max-w-[220px]"
                max="100"
                min="1"
                placeholder="请输入 1-100"
                type="number"
              />
              <div class="flex flex-wrap gap-2">
                <button
                  v-for="preset in presetPriorities"
                  :key="preset"
                  class="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 dark:border-gray-600 dark:text-gray-300 dark:hover:border-blue-500 dark:hover:bg-blue-500/10 dark:hover:text-blue-300"
                  type="button"
                  @click="priorityInput = String(preset)"
                >
                  {{ preset }}
                </button>
              </div>
            </div>
            <p class="mt-2 text-xs text-gray-500 dark:text-gray-400">
              建议保留一定梯度，例如核心账户使用 10-30，普通账户使用 40-70，低优先级备用账户使用 80+
            </p>
          </div>

          <div
            class="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800/60"
          >
            <div class="mb-3 flex items-center justify-between">
              <h4 class="text-sm font-semibold text-gray-700 dark:text-gray-300">选中账户预览</h4>
              <span class="text-xs text-gray-500 dark:text-gray-400">
                仅展示前 {{ previewAccounts.length }} 个
              </span>
            </div>
            <div class="space-y-2">
              <div
                v-for="account in previewAccounts"
                :key="account.id"
                class="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm dark:bg-gray-700/60"
              >
                <div class="min-w-0">
                  <div class="truncate font-medium text-gray-900 dark:text-gray-100">
                    {{ account.name || account.id }}
                  </div>
                  <div class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    {{ getPlatformLabel(account.platform) }}
                  </div>
                </div>
                <div class="ml-3 text-xs font-medium text-gray-600 dark:text-gray-300">
                  当前 {{ normalizePriority(account.priority) }}
                </div>
              </div>
            </div>
            <div
              v-if="accounts.length > previewAccounts.length"
              class="mt-3 text-xs text-gray-500 dark:text-gray-400"
            >
              还有 {{ accounts.length - previewAccounts.length }} 个账户将在提交时一并更新。
            </div>
          </div>
        </form>

        <div
          class="mt-6 flex flex-col-reverse gap-3 border-t border-gray-100 pt-4 dark:border-gray-700 sm:flex-row sm:justify-end"
        >
          <button
            class="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            :disabled="loading"
            type="button"
            @click="$emit('close')"
          >
            取消
          </button>
          <button
            class="rounded-lg bg-gradient-to-r from-blue-500 to-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:from-blue-600 hover:to-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            :disabled="loading || selectedCount === 0"
            type="button"
            @click="submit"
          >
            <i :class="['fas mr-2', loading ? 'fa-spinner fa-spin' : 'fa-save']" />
            {{ loading ? '保存中...' : '批量保存' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, ref, watch } from 'vue'

import * as httpApis from '@/utils/http_apis'
import { showToast } from '@/utils/tools'

const props = defineProps({
  accounts: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['close', 'success'])

const loading = ref(false)
const priorityInput = ref('')
const presetPriorities = [10, 20, 30, 50, 80]
const platformLabelMap = {
  claude: 'Claude 官方',
  'claude-console': 'Claude Console',
  bedrock: 'Bedrock',
  gemini: 'Gemini OAuth',
  'gemini-api': 'Gemini API',
  openai: 'OpenAI',
  'openai-responses': 'OpenAI Responses',
  azure_openai: 'Azure OpenAI',
  'azure-openai': 'Azure OpenAI',
  ccr: 'CCR Relay',
  droid: 'Droid'
}

const selectedCount = computed(() => props.accounts.length)
const previewAccounts = computed(() => props.accounts.slice(0, 8))

const normalizePriority = (value) => {
  const parsed = Number.parseInt(value, 10)
  if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 100) {
    return parsed
  }
  return 50
}

const getPlatformLabel = (platform) => platformLabelMap[platform] || platform || '未知平台'

const platformSummary = computed(() => {
  const summary = new Map()

  props.accounts.forEach((account) => {
    const platform = account?.platform || 'unknown'
    const existing = summary.get(platform) || {
      platform,
      label: getPlatformLabel(platform),
      count: 0
    }
    existing.count += 1
    summary.set(platform, existing)
  })

  return Array.from(summary.values()).sort((a, b) => a.label.localeCompare(b.label, 'zh-CN'))
})

const priorityStats = computed(() => {
  if (props.accounts.length === 0) {
    return {
      min: 50,
      max: 50,
      average: 50
    }
  }

  const priorities = props.accounts.map((account) => normalizePriority(account.priority))
  const total = priorities.reduce((sum, value) => sum + value, 0)

  return {
    min: Math.min(...priorities),
    max: Math.max(...priorities),
    average: total / priorities.length
  }
})

watch(
  () => props.accounts,
  (accounts) => {
    if (!Array.isArray(accounts) || accounts.length === 0) {
      priorityInput.value = ''
      return
    }

    const uniquePriorities = Array.from(
      new Set(accounts.map((account) => normalizePriority(account.priority)))
    )

    priorityInput.value = uniquePriorities.length === 1 ? String(uniquePriorities[0]) : ''
  },
  {
    immediate: true,
    deep: true
  }
)

const submit = async () => {
  if (loading.value) {
    return
  }

  if (selectedCount.value === 0) {
    showToast('请先选择要修改的账户', 'warning')
    return
  }

  const normalizedPriority = Number.parseInt(priorityInput.value, 10)
  if (!Number.isInteger(normalizedPriority) || normalizedPriority < 1 || normalizedPriority > 100) {
    showToast('优先级必须是 1-100 的整数', 'error')
    return
  }

  loading.value = true
  try {
    const result = await httpApis.batchUpdateAccountsPriorityApi({
      priority: normalizedPriority,
      accounts: props.accounts.map((account) => ({
        accountId: account.id,
        platform: account.platform
      }))
    })

    if (!result.success) {
      showToast(result.message || '批量修改失败', 'error')
      return
    }

    emit('success', result.data || {})
  } finally {
    loading.value = false
  }
}
</script>
