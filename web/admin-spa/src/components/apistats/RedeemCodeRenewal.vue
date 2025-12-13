<template>
  <div v-if="!multiKeyMode && statsData" class="mt-6 md:mt-8">
    <div class="card p-4 md:p-6">
      <div class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div class="flex items-center gap-2">
          <i class="fas fa-ticket-alt text-indigo-500" />
          <h3 class="text-lg font-semibold text-gray-800 dark:text-gray-200">自助续费</h3>
        </div>
        <span class="text-xs text-gray-500 dark:text-gray-400">一次性兑换码</span>
      </div>

      <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
        输入管理员提供的兑换码即可延长过期时间，已过期则从使用时开始计算。
      </p>

      <div class="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
        <input
          v-model="redeemCodeInput"
          class="w-full rounded-xl border border-gray-200 bg-white/80 px-4 py-3 text-sm text-gray-800 shadow-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200 dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-100 dark:focus:border-indigo-500 dark:focus:ring-indigo-500/20 md:col-span-3"
          :disabled="redeeming"
          placeholder="请输入兑换码（例如 ABCD-EFGH-IJKL-MNPQ）"
          type="text"
          @keyup.enter="handleRedeem"
        />

        <button
          class="btn btn-primary flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold"
          :disabled="redeeming || !canRedeem"
          @click="handleRedeem"
        >
          <i v-if="redeeming" class="fas fa-spinner loading-spinner" />
          <i v-else class="fas fa-bolt" />
          {{ redeeming ? '续费中...' : '立即续费' }}
        </button>
      </div>

      <div
        v-if="redeemError"
        class="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-200"
      >
        <i class="fas fa-exclamation-triangle mr-2" />
        {{ redeemError }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useApiStatsStore } from '@/stores/apistats'
import { apiStatsClient } from '@/config/apiStats'
import { showToast } from '@/utils/toast'

const apiStatsStore = useApiStatsStore()
const { apiKey, statsData, multiKeyMode } = storeToRefs(apiStatsStore)

const redeemCodeInput = ref('')
const redeeming = ref(false)
const redeemError = ref('')

const canRedeem = computed(() => {
  return Boolean(apiKey.value && apiKey.value.trim() && redeemCodeInput.value.trim())
})

const normalizeRedeemCode = (value) => {
  const compact = String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
  if (!compact) return ''
  const groups = compact.match(/.{1,4}/g)
  return (groups || []).join('-')
}

const handleRedeem = async () => {
  redeemError.value = ''

  const trimmedApiKey = String(apiKey.value || '').trim()
  const normalizedCode = normalizeRedeemCode(redeemCodeInput.value)

  if (!trimmedApiKey) {
    redeemError.value = '请先输入 API Key'
    return
  }
  if (!normalizedCode) {
    redeemError.value = '请输入有效的兑换码'
    return
  }

  redeeming.value = true
  try {
    const result = await apiStatsClient.redeemCode(trimmedApiKey, normalizedCode)
    if (!result?.success) {
      throw new Error(result?.message || '续费失败')
    }

    if (statsData.value) {
      statsData.value.expiresAt = result.data.expiresAt
      if (typeof result.data.isActivated === 'boolean') {
        statsData.value.isActivated = result.data.isActivated
      }
      if (result.data.activatedAt) {
        statsData.value.activatedAt = result.data.activatedAt
      }
    }

    const extendText =
      result.data.extendValue && result.data.extendUnit
        ? `${result.data.extendValue}${result.data.extendUnit === 'hours' ? '小时' : '天'}`
        : '已续费'

    showToast(
      `续费成功：${extendText}\n新的过期时间：${result.data.expiresAt}`,
      'success',
      '自助续费'
    )
    redeemCodeInput.value = ''
  } catch (error) {
    redeemError.value = error.message || '续费失败，请稍后重试'
    showToast(redeemError.value, 'error', '自助续费')
  } finally {
    redeeming.value = false
  }
}
</script>
