<template>
  <!-- 无 apiId -->
  <div v-if="!apiKey" class="py-12 text-center">
    <i class="fas fa-wallet mb-3 text-4xl text-gray-300 dark:text-gray-600" />
    <p class="text-sm text-gray-500 dark:text-gray-400">请先在「统计查询」页输入并查询 API Key</p>
  </div>

  <div v-else class="space-y-5">
    <!-- 余额卡 -->
    <div
      class="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800 sm:flex-row sm:items-center sm:justify-between"
    >
      <div>
        <p class="text-sm text-gray-500 dark:text-gray-400">当前 API Key</p>
        <p class="mt-0.5 text-base font-semibold text-gray-700 dark:text-gray-200">
          {{ apiKeyName || apiId }}
        </p>
      </div>
      <div class="text-left sm:text-right">
        <p class="text-sm text-gray-500 dark:text-gray-400">预付费余额</p>
        <p class="mt-0.5 text-2xl font-bold text-green-600 dark:text-green-400">
          <span v-if="balanceLoading" class="text-base font-normal text-gray-400">加载中...</span>
          <span v-else>${{ balance }}</span>
        </p>
      </div>
    </div>

    <!-- 未开放 -->
    <div
      v-if="!configLoading && !config.enabled"
      class="rounded-xl border border-yellow-200 bg-yellow-50 p-6 text-center dark:border-yellow-700/50 dark:bg-yellow-900/20"
    >
      <i class="fas fa-lock mb-2 text-3xl text-yellow-500" />
      <p class="text-sm font-medium text-yellow-700 dark:text-yellow-300">充值暂未开放</p>
    </div>

    <template v-else-if="!configLoading && config.enabled">
      <!-- 成功态 -->
      <div
        v-if="payState === 'success'"
        class="rounded-xl border border-green-200 bg-green-50 p-8 text-center dark:border-green-700/50 dark:bg-green-900/20"
      >
        <i class="fas fa-check-circle mb-3 text-5xl text-green-500" />
        <p class="text-xl font-bold text-green-700 dark:text-green-300">支付成功！</p>
        <p class="mt-2 text-sm text-green-600 dark:text-green-400">余额已更新</p>
        <button
          class="mt-4 rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 px-5 py-2 font-medium text-white shadow-sm transition-colors hover:from-blue-600 hover:to-blue-700"
          @click="resetToSelect"
        >
          继续充值
        </button>
      </div>

      <!-- 支付中 -->
      <div
        v-else-if="payState === 'paying'"
        class="rounded-xl border border-blue-200 bg-blue-50 p-6 dark:border-blue-700/50 dark:bg-blue-900/20"
      >
        <div class="mb-4 flex items-center justify-between">
          <span class="font-semibold text-blue-700 dark:text-blue-300">等待支付</span>
          <span class="font-mono text-sm text-blue-600 dark:text-blue-400">{{ countdown }}</span>
        </div>
        <div class="mb-4 text-sm text-gray-600 dark:text-gray-300">
          应付 <span class="font-semibold">{{ order.payAmount }} {{ order.currency }}</span> ·
          到账额度 <span class="font-semibold text-green-600">${{ order.quotaAmount }}</span>
        </div>
        <div class="flex flex-col items-center gap-4">
          <img
            v-if="qrImg"
            alt="支付二维码"
            class="h-52 w-52 rounded-lg border border-gray-200 bg-white p-2 dark:border-gray-700"
            :src="qrImg"
          />
          <p v-if="qrImg" class="text-sm text-gray-500 dark:text-gray-400">
            请使用对应 App 扫码支付
          </p>
          <button
            v-if="pay.payUrl"
            class="rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 px-5 py-2 font-medium text-white shadow-sm transition-colors hover:from-blue-600 hover:to-blue-700"
            @click="openPayUrl"
          >
            <i class="fas fa-external-link-alt mr-2" />打开支付页面
          </button>
          <button
            class="text-sm text-gray-500 underline hover:text-gray-700 dark:text-gray-400"
            @click="handleCancel(order.id, true)"
          >
            取消支付
          </button>
        </div>
      </div>

      <!-- 选购态 -->
      <div v-else class="space-y-5">
        <!-- 商品 -->
        <div>
          <p class="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">选择充值额度</p>
          <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <button
              v-for="plan in plans"
              :key="plan.id"
              :class="[
                'rounded-xl border p-4 text-left transition-all',
                selectedPlanId === plan.id
                  ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500 dark:bg-blue-900/20'
                  : 'border-gray-200 bg-white hover:border-blue-300 dark:border-gray-700 dark:bg-gray-800'
              ]"
              @click="selectPlan(plan)"
            >
              <p class="text-base font-bold text-gray-800 dark:text-gray-100">
                ${{ plan.quotaAmount }}
              </p>
              <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">{{ plan.name }}</p>
              <p class="mt-1 text-sm font-semibold text-orange-500">
                {{ plan.price }} {{ plan.currency }}
              </p>
            </button>

            <!-- 自定义金额 -->
            <div
              v-if="config.allowCustomAmount"
              :class="[
                'rounded-xl border p-4 transition-all',
                isCustom
                  ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500 dark:bg-blue-900/20'
                  : 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800'
              ]"
              @click="isCustom = true"
            >
              <p class="text-sm text-gray-500 dark:text-gray-400">自定义额度 ($)</p>
              <input
                v-model.number="customQuota"
                class="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                min="1"
                type="number"
                @focus="isCustom = true"
              />
              <p
                v-if="isCustom && customQuota > 0"
                class="mt-1 text-sm font-semibold text-orange-500"
              >
                ≈ {{ customPrice }} CNY
              </p>
            </div>
          </div>
        </div>

        <!-- 支付方式 -->
        <div>
          <p class="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">支付方式</p>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="type in config.enabledPaymentTypes"
              :key="type"
              :class="[
                'rounded-lg border px-4 py-2 text-sm transition-all',
                paymentType === type
                  ? 'border-blue-500 bg-blue-50 text-blue-600 dark:bg-blue-900/20'
                  : 'border-gray-200 bg-white text-gray-600 hover:border-blue-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300'
              ]"
              @click="paymentType = type"
            >
              {{ paymentTypeLabel(type) }}
            </button>
          </div>
        </div>

        <button
          class="w-full rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 px-4 py-2.5 font-medium text-white shadow-sm transition-colors hover:from-blue-600 hover:to-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="!canSubmit || ordering"
          @click="handleCreateOrder"
        >
          <i v-if="ordering" class="fas fa-spinner fa-spin mr-2" />立即充值
        </button>
      </div>
    </template>

    <!-- 充值记录 -->
    <div class="rounded-xl border border-gray-200 dark:border-gray-700">
      <button
        class="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold text-gray-700 dark:text-gray-200"
        @click="toggleOrders"
      >
        <span><i class="fas fa-history mr-2" />我的充值记录</span>
        <i :class="['fas', showOrders ? 'fa-chevron-up' : 'fa-chevron-down', 'text-gray-400']" />
      </button>
      <div v-if="showOrders" class="border-t border-gray-200 px-4 py-3 dark:border-gray-700">
        <div v-if="ordersLoading" class="py-4 text-center text-sm text-gray-400">
          <i class="fas fa-spinner fa-spin mr-2" />加载中...
        </div>
        <div v-else-if="orders.length === 0" class="py-4 text-center text-sm text-gray-400">
          暂无充值记录
        </div>
        <div v-else class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead>
              <tr>
                <th
                  class="px-3 py-2 text-left text-sm font-medium text-gray-500 dark:text-gray-400"
                >
                  订单号
                </th>
                <th
                  class="px-3 py-2 text-left text-sm font-medium text-gray-500 dark:text-gray-400"
                >
                  应付
                </th>
                <th
                  class="px-3 py-2 text-left text-sm font-medium text-gray-500 dark:text-gray-400"
                >
                  额度
                </th>
                <th
                  class="px-3 py-2 text-left text-sm font-medium text-gray-500 dark:text-gray-400"
                >
                  状态
                </th>
                <th
                  class="px-3 py-2 text-left text-sm font-medium text-gray-500 dark:text-gray-400"
                >
                  时间
                </th>
                <th class="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
              <tr v-for="o in orders" :key="o.id">
                <td
                  class="whitespace-nowrap px-3 py-2 font-mono text-sm text-gray-600 dark:text-gray-300"
                >
                  {{ o.outTradeNo }}
                </td>
                <td class="whitespace-nowrap px-3 py-2 text-sm text-gray-600 dark:text-gray-300">
                  {{ o.payAmount }}
                </td>
                <td class="whitespace-nowrap px-3 py-2 text-sm text-green-600 dark:text-green-400">
                  ${{ o.quotaAmount }}
                </td>
                <td class="whitespace-nowrap px-3 py-2">
                  <span
                    :class="['inline-flex rounded-full px-2 py-0.5 text-sm', statusClass(o.status)]"
                  >
                    {{ statusLabel(o.status) }}
                  </span>
                </td>
                <td class="whitespace-nowrap px-3 py-2 text-sm text-gray-400">
                  {{ formatDateTime(o.createdAt) }}
                </td>
                <td class="whitespace-nowrap px-3 py-2 text-right">
                  <button
                    v-if="o.status === 'pending'"
                    class="text-sm text-red-500 hover:text-red-600"
                    @click="handleCancel(o.id, false)"
                  >
                    取消
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'

import { showToast, formatDateTime } from '@/utils/tools'
import {
  getPaymentPlansApi,
  createPaymentSessionApi,
  getPaymentBalanceApi,
  createPaymentOrderApi,
  getPaymentOrderApi,
  verifyPaymentOrderApi,
  cancelPaymentOrderApi,
  getMyPaymentOrdersApi
} from '@/utils/http_apis'

const props = defineProps({
  apiId: { type: String, default: '' },
  apiKey: { type: String, default: '' },
  apiKeyName: { type: String, default: '' }
})

const config = ref({
  enabled: false,
  allowCustomAmount: false,
  customRatio: 0,
  enabledPaymentTypes: []
})
const configLoading = ref(true)
const balance = ref('0.00')
const balanceLoading = ref(false)
const token = ref('') // 会话 token（仅内存态，不落 localStorage），由完整 apiKey 换取
const plans = ref([])

const selectedPlanId = ref('')
const isCustom = ref(false)
const customQuota = ref(0)
const paymentType = ref('')

const ordering = ref(false)
const payState = ref('select') // select | paying | success
const order = ref({})
const pay = ref({})

const orders = ref([])
const ordersLoading = ref(false)
const showOrders = ref(false)

let pollTimer = null
let countdownTimer = null
let pollCount = 0
const countdown = ref('')

// ========== 计算 ==========
const customPrice = computed(
  () => Math.round(Number(customQuota.value) * Number(config.value.customRatio) * 100) / 100
)
const canSubmit = computed(() => {
  if (!paymentType.value) return false
  if (isCustom.value) return customQuota.value > 0
  return Boolean(selectedPlanId.value)
})
const qrImg = computed(() =>
  pay.value.qrCode
    ? `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(pay.value.qrCode)}`
    : ''
)

const TYPE_LABELS = {
  alipay: '支付宝',
  wxpay: '微信支付',
  stripe: 'Stripe/银行卡',
  mock: '测试通道'
}
const paymentTypeLabel = (type) => TYPE_LABELS[type] || type

const STATUS = {
  pending: ['待支付', 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300'],
  paid: ['已支付', 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'],
  completed: ['已完成', 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'],
  refunded: ['已退款', 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300']
}
const statusLabel = (s) => (STATUS[s] ? STATUS[s][0] : s)
const statusClass = (s) =>
  STATUS[s] ? STATUS[s][1] : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'

// ========== 会话 ==========
// 首次用完整 apiKey 换取短期 token；之后所有请求只带 token（规避明文 apiKey 反复上行）
const ensureSession = async () => {
  if (token.value) return true
  if (!props.apiKey) return false
  const res = await createPaymentSessionApi(props.apiKey)
  if (res.success && res.data) {
    token.value = res.data.token
    return true
  }
  showToast(res.error || res.message || '验证 API Key 失败', 'error')
  return false
}

// 只读请求包装：会话失效（code=payment_session_invalid）时自动重签一次并重试
const withSession = async (call) => {
  if (!(await ensureSession())) return { success: false }
  let res = await call(token.value)
  if (!res.success && res.code === 'payment_session_invalid') {
    token.value = ''
    if (!(await ensureSession())) return res
    res = await call(token.value)
  }
  return res
}

// ========== 数据加载 ==========
const loadConfig = async () => {
  configLoading.value = true
  const res = await getPaymentPlansApi()
  if (res.success && res.data) {
    config.value = {
      enabled: res.data.enabled,
      allowCustomAmount: res.data.allowCustomAmount,
      customRatio: res.data.customRatio,
      enabledPaymentTypes: res.data.enabledPaymentTypes || []
    }
    plans.value = res.data.plans || []
    if (config.value.enabledPaymentTypes.length) {
      ;[paymentType.value] = config.value.enabledPaymentTypes
    }
  }
  configLoading.value = false
}

const loadBalance = async () => {
  balanceLoading.value = true
  const res = await withSession((t) => getPaymentBalanceApi(t))
  if (res.success && res.data) balance.value = Number(res.data.balance || 0).toFixed(2)
  balanceLoading.value = false
}

const loadOrders = async () => {
  ordersLoading.value = true
  const res = await withSession((t) => getMyPaymentOrdersApi({ token: t, offset: 0, limit: 20 }))
  if (res.success && res.data) orders.value = res.data.orders || []
  ordersLoading.value = false
}

const toggleOrders = () => {
  showOrders.value = !showOrders.value
  if (showOrders.value) loadOrders()
}

// ========== 选择 ==========
const selectPlan = (plan) => {
  selectedPlanId.value = plan.id
  isCustom.value = false
}

// ========== 下单 + 轮询 ==========
const clearTimers = () => {
  if (pollTimer) clearInterval(pollTimer)
  if (countdownTimer) clearInterval(countdownTimer)
  pollTimer = null
  countdownTimer = null
}

const startCountdown = (expiresAt) => {
  const end = new Date(expiresAt).getTime()
  const tick = () => {
    const left = Math.max(0, Math.floor((end - Date.now()) / 1000))
    const mm = String(Math.floor(left / 60)).padStart(2, '0')
    const ss = String(left % 60).padStart(2, '0')
    countdown.value = `${mm}:${ss}`
    if (left <= 0) clearInterval(countdownTimer)
  }
  tick()
  countdownTimer = setInterval(tick, 1000)
}

const startPolling = () => {
  pollCount = 0
  pollTimer = setInterval(async () => {
    pollCount += 1
    const res =
      pollCount >= 4
        ? await withSession((t) => verifyPaymentOrderApi(order.value.id, t))
        : await withSession((t) => getPaymentOrderApi(order.value.id, t))
    const o = res.success ? res.data : null
    if (!o) return
    if (o.status === 'completed') {
      clearTimers()
      payState.value = 'success'
      showToast('支付成功', 'success')
      loadBalance()
    } else if (['expired', 'cancelled', 'failed'].includes(o.status)) {
      clearTimers()
      payState.value = 'select'
      showToast('支付未完成，请重试', 'error')
    }
  }, 3000)
}

const handleCreateOrder = async () => {
  ordering.value = true
  const res = await withSession((t) => {
    const payload = { token: t, paymentType: paymentType.value }
    if (isCustom.value) payload.customQuota = customQuota.value
    else payload.planId = selectedPlanId.value
    return createPaymentOrderApi(payload)
  })
  ordering.value = false
  if (!res.success) return showToast(res.error || res.message || '下单失败', 'error')
  order.value = res.data.order
  pay.value = res.data.pay || {}
  payState.value = 'paying'
  startCountdown(order.value.expiresAt)
  startPolling()
}

const openPayUrl = () => {
  if (pay.value.payUrl) window.open(pay.value.payUrl, '_blank')
}

const handleCancel = async (id, backToSelect) => {
  const res = await withSession((t) => cancelPaymentOrderApi(id, t))
  if (!res.success) return showToast(res.error || res.message || '取消失败', 'error')
  showToast('已取消', 'success')
  if (backToSelect) {
    clearTimers()
    payState.value = 'select'
  } else {
    loadOrders()
  }
}

const resetToSelect = () => {
  payState.value = 'select'
  selectedPlanId.value = ''
  isCustom.value = false
  customQuota.value = 0
}

onMounted(() => {
  if (!props.apiKey) return
  loadConfig()
  loadBalance()
})

onUnmounted(clearTimers)
</script>
