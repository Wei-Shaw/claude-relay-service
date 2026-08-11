<template>
  <div class="tab-content">
    <div class="glass-strong rounded-2xl p-4 shadow-xl sm:rounded-3xl sm:p-6 md:p-8">
      <div
        class="mb-4 flex gap-2 border-b border-gray-200 pb-4 dark:border-gray-700 md:mb-6 md:pb-6"
      >
        <router-link
          :class="[
            'rounded-lg px-4 py-2 text-sm font-medium transition-all',
            quotaSubTab === 'redeem'
              ? 'bg-blue-500 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
          ]"
          :to="{ name: 'ApiStatsQuota', query: route.query }"
        >
          <i class="fas fa-ticket-alt mr-2" />
          兑换额度卡
        </router-link>
        <router-link
          :class="[
            'rounded-lg px-4 py-2 text-sm font-medium transition-all',
            quotaSubTab === 'history'
              ? 'bg-blue-500 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
          ]"
          :to="{ name: 'ApiStatsQuotaHistory', query: route.query }"
        >
          <i class="fas fa-history mr-2" />
          兑换记录
        </router-link>
      </div>

      <div v-if="quotaSubTab === 'redeem'">
        <div v-if="!apiId" class="py-8 text-center">
          <div class="mb-4 text-gray-500 dark:text-gray-400">
            <i class="fas fa-key mb-4 block text-4xl opacity-50" />
            <p>请先在「统计查询」页面输入您的 API Key</p>
          </div>
          <router-link
            class="inline-block rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500 px-6 py-2.5 font-medium text-white transition-all hover:from-blue-600 hover:to-cyan-600"
            :to="{ name: 'ApiStatsQuery', query: route.query }"
          >
            前往输入 API Key
          </router-link>
        </div>

        <div v-else>
          <div class="mb-6 rounded-xl bg-blue-50 p-4 dark:bg-blue-900/20">
            <p class="text-sm text-blue-700 dark:text-blue-300">
              <i class="fas fa-info-circle mr-2" />
              当前 API Key: <span class="font-medium">{{ statsData?.name || apiId }}</span>
            </p>
          </div>

          <div class="space-y-4">
            <div>
              <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                额度卡卡号
              </label>
              <input
                v-model="redeemCode"
                class="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-900 placeholder-gray-400 transition-all focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-500"
                placeholder="请输入额度卡卡号"
                type="text"
                @keyup.enter="handleRedeem"
              />
            </div>

            <button
              class="w-full rounded-xl bg-gradient-to-r from-green-500 to-emerald-500 px-6 py-3 font-medium text-white transition-all hover:from-green-600 hover:to-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="!redeemCode.trim() || redeemLoading"
              @click="handleRedeem"
            >
              <i v-if="redeemLoading" class="fas fa-spinner fa-spin mr-2" />
              <i v-else class="fas fa-check-circle mr-2" />
              {{ redeemLoading ? '兑换中...' : '立即兑换' }}
            </button>
          </div>

          <div v-if="redeemResult" class="mt-6">
            <div
              :class="[
                'rounded-xl p-4',
                redeemResult.success
                  ? redeemResult.hasWarnings
                    ? 'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-300'
                    : 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300'
                  : 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300'
              ]"
            >
              <div class="flex items-start gap-3">
                <i
                  :class="[
                    'mt-0.5 text-lg',
                    redeemResult.success
                      ? redeemResult.hasWarnings
                        ? 'fas fa-exclamation-triangle'
                        : 'fas fa-check-circle'
                      : 'fas fa-times-circle'
                  ]"
                />
                <div>
                  <p class="font-medium">
                    {{
                      redeemResult.success
                        ? redeemResult.hasWarnings
                          ? '兑换成功（部分截断）'
                          : '兑换成功'
                        : '兑换失败'
                    }}
                  </p>
                  <p class="mt-1 text-sm opacity-90">{{ redeemResult.message }}</p>
                  <div v-if="redeemResult.success && redeemResult.data" class="mt-2 text-sm">
                    <p v-if="redeemResult.data.quotaAdded">
                      额度增加:
                      <span class="font-medium">${{ redeemResult.data.quotaAdded }}</span>
                    </p>
                    <p v-if="redeemResult.data.timeAdded">
                      有效期延长:
                      <span class="font-medium"
                        >{{ redeemResult.data.timeAdded
                        }}{{
                          redeemResult.data.timeUnit === 'days'
                            ? '天'
                            : redeemResult.data.timeUnit === 'hours'
                              ? '小时'
                              : '月'
                        }}</span
                      >
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-else>
        <div v-if="!apiId" class="py-8 text-center">
          <div class="mb-4 text-gray-500 dark:text-gray-400">
            <i class="fas fa-key mb-4 block text-4xl opacity-50" />
            <p>请先在「统计查询」页面输入您的 API Key</p>
          </div>
          <router-link
            class="inline-block rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500 px-6 py-2.5 font-medium text-white transition-all hover:from-blue-600 hover:to-cyan-600"
            :to="{ name: 'ApiStatsQuery', query: route.query }"
          >
            前往输入 API Key
          </router-link>
        </div>

        <div v-else>
          <div v-if="historyLoading" class="py-8 text-center">
            <i class="fas fa-spinner fa-spin text-2xl text-gray-400" />
            <p class="mt-2 text-gray-500 dark:text-gray-400">加载中...</p>
          </div>

          <div v-else-if="redemptionHistory.length === 0" class="py-8 text-center">
            <i class="fas fa-inbox text-4xl text-gray-300 dark:text-gray-600" />
            <p class="mt-2 text-gray-500 dark:text-gray-400">暂无兑换记录</p>
          </div>

          <div v-else class="space-y-3">
            <div
              v-for="record in redemptionHistory"
              :key="record.id"
              class="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
            >
              <div class="flex items-start justify-between gap-4">
                <div class="min-w-0 flex-1">
                  <div class="mb-1 flex items-center gap-2">
                    <span
                      :class="[
                        'inline-flex items-center rounded-full px-2 py-0.5 text-sm font-medium',
                        record.cardType === 'quota'
                          ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                          : record.cardType === 'time'
                            ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'
                            : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                      ]"
                    >
                      {{
                        record.cardType === 'quota'
                          ? '额度卡'
                          : record.cardType === 'time'
                            ? '时间卡'
                            : '组合卡'
                      }}
                    </span>
                    <span
                      v-if="record.status === 'revoked'"
                      class="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-sm font-medium text-red-700 dark:bg-red-900/30 dark:text-red-300"
                    >
                      已撤销
                    </span>
                  </div>
                  <p class="text-sm text-gray-600 dark:text-gray-300">
                    <span v-if="record.quotaAdded">额度 +${{ record.quotaAdded }}</span>
                    <span v-if="record.quotaAdded && record.timeAdded"> · </span>
                    <span v-if="record.timeAdded"
                      >有效期 +{{ record.timeAmount
                      }}{{
                        record.timeUnit === 'days'
                          ? '天'
                          : record.timeUnit === 'hours'
                            ? '小时'
                            : '月'
                      }}</span
                    >
                  </p>
                </div>
                <div class="whitespace-nowrap text-right text-sm text-gray-500 dark:text-gray-400">
                  {{ formatDateTime(record.redeemedAt) }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useApiStatsStore } from '@/stores/apistats'
import { redeemCardByApiIdApi, getRedemptionHistoryByApiIdApi } from '@/utils/http_apis'
import { formatDateTime, showToast } from '@/utils/tools'

const route = useRoute()
const apiStatsStore = useApiStatsStore()
const { apiId, statsData } = storeToRefs(apiStatsStore)
const { loadStatsWithApiId } = apiStatsStore

const redeemCode = ref('')
const redeemLoading = ref(false)
const redeemResult = ref(null)
const redemptionHistory = ref([])
const historyLoading = ref(false)

const quotaSubTab = computed(() => route.meta.quotaSubTab || 'redeem')

const handleRedeem = async () => {
  if (!redeemCode.value.trim() || !apiId.value) return

  redeemLoading.value = true
  redeemResult.value = null

  const res = await redeemCardByApiIdApi({
    apiId: apiId.value,
    code: redeemCode.value.trim()
  })

  redeemLoading.value = false

  if (res.success) {
    const warnings = res.data?.warnings || []
    const hasWarnings = warnings.length > 0
    redeemResult.value = {
      success: true,
      message: hasWarnings ? warnings.join('；') : '额度卡兑换成功！',
      data: res.data,
      hasWarnings
    }
    redeemCode.value = ''
    showToast(
      hasWarnings ? '兑换成功（部分截断）' : '兑换成功',
      hasWarnings ? 'warning' : 'success'
    )
    loadStatsWithApiId()
  } else {
    redeemResult.value = {
      success: false,
      message: res.error || res.message || '兑换失败'
    }
    showToast(res.error || res.message || '兑换失败', 'error')
  }
}

const loadRedemptionHistory = async () => {
  if (!apiId.value) return

  historyLoading.value = true
  const res = await getRedemptionHistoryByApiIdApi(apiId.value)
  historyLoading.value = false

  if (res.success) {
    redemptionHistory.value = res.data?.records || res.data || []
  }
}

watch(
  () => [quotaSubTab.value, apiId.value],
  ([subTab]) => {
    if (subTab === 'history') {
      loadRedemptionHistory()
    }
  },
  { immediate: true }
)
</script>

<style scoped>
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
