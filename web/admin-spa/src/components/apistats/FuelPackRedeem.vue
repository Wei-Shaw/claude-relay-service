<template>
  <div v-if="!multiKeyMode && statsData" class="mt-6 md:mt-8">
    <div class="card p-4 md:p-6">
      <div class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div class="flex items-center gap-2">
          <i class="fas fa-gas-pump text-green-500" />
          <h3 class="text-lg font-semibold text-gray-800 dark:text-gray-200">加油包兑换</h3>
        </div>
        <span class="text-xs text-gray-500 dark:text-gray-400">临时额度优先消耗</span>
      </div>

      <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
        输入加油包兑换码，兑换后会获得一段时间内的临时额度，并在计费时优先使用加油包余额。
      </p>

      <div
        class="mt-3 flex flex-col gap-2 text-xs text-gray-600 dark:text-gray-400 md:flex-row md:items-center md:justify-between"
      >
        <div>
          <span class="font-medium text-gray-700 dark:text-gray-300">当前加油包余额：</span>
          <span class="text-green-700 dark:text-green-300">${{ fuelBalance.toFixed(4) }}</span>
        </div>
        <div v-if="fuelNextExpiresAtMs > 0">
          <span class="font-medium text-gray-700 dark:text-gray-300">最早到期：</span>
          <span>{{ formatTime(fuelNextExpiresAtMs) }}</span>
        </div>
      </div>

      <div class="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
        <input
          v-model="codeInput"
          class="w-full rounded-xl border border-gray-200 bg-white/80 px-4 py-3 text-sm text-gray-800 shadow-sm outline-none transition focus:border-green-400 focus:ring-2 focus:ring-green-200 dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-100 dark:focus:border-green-500 dark:focus:ring-green-500/20 md:col-span-3"
          :disabled="redeeming"
          placeholder="请输入加油包兑换码"
          type="text"
          @keyup.enter="handleRedeem"
        />

        <button
          class="btn btn-success flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold"
          :disabled="redeeming || !canRedeem"
          @click="handleRedeem"
        >
          <i v-if="redeeming" class="fas fa-spinner loading-spinner" />
          <i v-else class="fas fa-check" />
          {{ redeeming ? '兑换中...' : '兑换' }}
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
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useApiStatsStore } from '@/stores/apistats'
import { apiStatsClient } from '@/config/apiStats'
import { showToast } from '@/utils/toast'

const apiStatsStore = useApiStatsStore()
const { apiKey, statsData, multiKeyMode } = storeToRefs(apiStatsStore)

const codeInput = ref('')
const redeeming = ref(false)
const redeemError = ref('')

const fuelBalance = computed(() => {
  const balance = statsData.value?.fuel?.balance
  return typeof balance === 'number' ? balance : Number(balance || 0) || 0
})

const fuelNextExpiresAtMs = computed(() => {
  const value = statsData.value?.fuel?.nextExpiresAtMs
  return Number(value || 0) || 0
})

const canRedeem = computed(() => {
  return Boolean(apiKey.value && apiKey.value.trim() && codeInput.value.trim())
})

const formatTime = (ms) => {
  const num = Number(ms)
  if (!Number.isFinite(num) || num <= 0) return '-'
  return new Date(num).toLocaleString()
}

const handleRedeem = async () => {
  redeemError.value = ''

  const trimmedApiKey = String(apiKey.value || '').trim()
  const trimmedCode = String(codeInput.value || '').trim()

  if (!trimmedApiKey) {
    redeemError.value = '请先输入 API Key'
    return
  }
  if (!trimmedCode) {
    redeemError.value = '请输入加油包兑换码'
    return
  }

  redeeming.value = true
  try {
    const result = await apiStatsClient.redeemFuelPack(trimmedApiKey, trimmedCode)
    if (!result?.success) {
      throw new Error(result?.message || '兑换失败')
    }

    if (statsData.value) {
      statsData.value.fuel = {
        ...(statsData.value.fuel || {}),
        balance: result.data?.fuelBalance ?? statsData.value.fuel?.balance ?? 0,
        entries: result.data?.fuelEntries ?? statsData.value.fuel?.entries ?? 0,
        nextExpiresAtMs:
          result.data?.fuelNextExpiresAtMs ?? statsData.value.fuel?.nextExpiresAtMs ?? 0,
        nextExpiresAt: result.data?.fuelNextExpiresAt ?? statsData.value.fuel?.nextExpiresAt ?? ''
      }
    }

    showToast(
      `兑换成功：+$${Number(result.data?.amount || 0).toFixed(2)}\n当前余额：$${Number(
        result.data?.fuelBalance || 0
      ).toFixed(4)}\n有效期至：${result.data?.expiresAt || '-'}`,
      'success',
      '加油包'
    )

    codeInput.value = ''
  } catch (error) {
    redeemError.value = error.message || '兑换失败，请稍后重试'
    showToast(redeemError.value, 'error', '加油包')
  } finally {
    redeeming.value = false
  }
}
</script>
