<template>
  <div v-if="!multiKeyMode && statsData" class="mt-6 md:mt-8">
    <div class="card p-4 md:p-6">
      <div class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div class="flex items-center gap-2">
          <i class="fas fa-link text-indigo-500" />
          <h3 class="text-lg font-semibold text-gray-800 dark:text-gray-200">自助续费</h3>
        </div>
        <span class="text-xs text-gray-500 dark:text-gray-400">同权限未激活 Key</span>
      </div>

      <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
        输入一个“同权限未激活续费 Key”，系统会把它的时长合并到当前 Key，并销毁该续费
        Key（不可恢复）。 当前 Key 已过期则从现在开始续上；若当前 Key
        也尚未激活，则会延长“首次使用后有效期”。
      </p>

      <div class="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
        <input
          v-model="renewKeyInput"
          class="w-full rounded-xl border border-gray-200 bg-white/80 px-4 py-3 text-sm text-gray-800 shadow-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200 dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-100 dark:focus:border-indigo-500 dark:focus:ring-indigo-500/20 md:col-span-3"
          :disabled="renewing"
          placeholder="请输入未激活续费 Key（必须与当前 Key 权限一致）"
          type="text"
          @keyup.enter="handleMergeRenewal"
        />

        <button
          class="btn btn-primary flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold"
          :disabled="renewing || !canRenew"
          @click="handleMergeRenewal"
        >
          <i v-if="renewing" class="fas fa-spinner loading-spinner" />
          <i v-else class="fas fa-bolt" />
          {{ renewing ? '合并中...' : '合并续费' }}
        </button>
      </div>

      <div
        v-if="renewError"
        class="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-200"
      >
        <i class="fas fa-exclamation-triangle mr-2" />
        {{ renewError }}
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

const renewKeyInput = ref('')
const renewing = ref(false)
const renewError = ref('')

const canRenew = computed(() => {
  return Boolean(apiKey.value && apiKey.value.trim() && renewKeyInput.value.trim())
})

const handleMergeRenewal = async () => {
  renewError.value = ''

  const trimmedApiKey = String(apiKey.value || '').trim()
  const trimmedRenewKey = String(renewKeyInput.value || '').trim()

  if (!trimmedApiKey) {
    renewError.value = '请先输入 API Key'
    return
  }
  if (!trimmedRenewKey) {
    renewError.value = '请输入未激活续费 Key'
    return
  }
  if (trimmedApiKey === trimmedRenewKey) {
    renewError.value = '续费 Key 不能与当前 Key 相同'
    return
  }

  const confirmed = window.confirm(
    '确认使用该“未激活 Key”续费吗？\n\n注意：续费 Key 会被销毁且不可恢复。'
  )
  if (!confirmed) {
    return
  }

  renewing.value = true
  try {
    const result = await apiStatsClient.mergeRenewal(trimmedApiKey, trimmedRenewKey)
    if (!result?.success) {
      throw new Error(result?.message || '续费失败')
    }

    if (statsData.value && result.data?.expiresAt) {
      statsData.value.expiresAt = result.data.expiresAt
      if (statsData.value.expirationMode === 'activation') {
        statsData.value.isActivated = true
      }
    }
    if (statsData.value && result.data?.activationValue && result.data?.activationUnit) {
      statsData.value.activationDays = result.data.activationValue
      statsData.value.activationUnit = result.data.activationUnit
    }

    const unitLabel = result.data?.extendUnit === 'hours' ? '小时' : '天'
    const extendText =
      result.data?.extendValue && result.data?.extendUnit
        ? `${result.data.extendValue}${unitLabel}`
        : '已续费'

    if (result.data?.expiresAt) {
      showToast(
        `续费成功：${extendText}\n新的过期时间：${result.data.expiresAt}`,
        'success',
        '自助续费'
      )
    } else if (result.data?.activationValue && result.data?.activationUnit) {
      const activationUnitLabel = result.data.activationUnit === 'hours' ? '小时' : '天'
      showToast(
        `续费成功：${extendText}\n激活后有效期：${result.data.activationValue}${activationUnitLabel}`,
        'success',
        '自助续费'
      )
    } else {
      showToast(`续费成功：${extendText}`, 'success', '自助续费')
    }
    renewKeyInput.value = ''
  } catch (error) {
    const mismatchFields = error?.data?.mismatchFields
    if (Array.isArray(mismatchFields) && mismatchFields.length > 0) {
      renewError.value = `续费 Key 权限不一致：${mismatchFields.join('，')}`
    } else {
      renewError.value = error.message || '续费失败，请稍后重试'
    }
    showToast(renewError.value, 'error', '自助续费')
  } finally {
    renewing.value = false
  }
}
</script>
