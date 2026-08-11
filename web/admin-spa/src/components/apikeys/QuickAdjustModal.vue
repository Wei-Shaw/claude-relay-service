<template>
  <ModalTransition @after-leave="onClosed">
    <div v-if="visible" class="modal fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        class="modal-content mx-auto flex max-h-[90vh] w-full max-w-md flex-col p-8 dark:bg-gray-800"
      >
        <div class="mb-6 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div
              class="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-600"
            >
              <i class="fas fa-bolt text-white" />
            </div>
            <h3 class="text-xl font-bold text-gray-900 dark:text-gray-100">快捷调整</h3>
          </div>
          <button
            class="text-gray-400 transition-colors hover:text-gray-600 dark:hover:text-gray-200"
            @click="requestClose"
          >
            <i class="fas fa-times text-xl" />
          </button>
        </div>

        <div class="modal-scroll-content custom-scrollbar flex-1 space-y-6">
          <!-- API Key 信息 -->
          <div
            class="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-900/40 dark:bg-blue-900/20"
          >
            <h4 class="mb-2 font-semibold text-gray-800 dark:text-gray-200">{{ apiKey.name }}</h4>
            <p class="text-sm text-gray-600 dark:text-gray-400">
              当前总额度：{{ currentTotalCostLimitText }}
            </p>
            <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
              当前过期时间：{{ currentExpiresAtText }}
            </p>
          </div>

          <!-- 增加总额度 -->
          <div>
            <label class="mb-3 block text-sm font-semibold text-gray-700 dark:text-gray-300">
              增加总额度 (美元)
            </label>
            <div
              v-if="isPrepaid"
              class="rounded-lg bg-gray-50 p-3 text-sm text-gray-500 dark:bg-gray-700/50 dark:text-gray-400"
            >
              此 API Key 为预付费模式，请通过充值调整余额，无法在此修改额度上限
            </div>
            <div v-else class="space-y-3">
              <div class="flex flex-wrap gap-2">
                <button
                  v-for="amount in costPresets"
                  :key="amount"
                  class="rounded-lg bg-gray-100 px-3 py-1 text-sm font-medium hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                  type="button"
                  @click="form.addCostLimit = String(amount)"
                >
                  +${{ amount }}
                </button>
                <button
                  class="rounded-lg bg-gray-100 px-3 py-1 text-sm font-medium hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                  type="button"
                  @click="form.addCostLimit = ''"
                >
                  清空
                </button>
              </div>
              <input
                v-model="form.addCostLimit"
                class="form-input w-full border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
                min="0"
                placeholder="留空表示不调整额度"
                step="0.01"
                type="number"
              />
              <p v-if="newTotalCostLimitText" class="text-sm text-green-600 dark:text-green-400">
                调整后总额度：{{ newTotalCostLimitText }}
              </p>
              <button
                class="btn btn-primary w-full px-6 py-2 text-sm font-semibold"
                :disabled="costLoading || !canSaveCost"
                type="button"
                @click="saveCost"
              >
                <div v-if="costLoading" class="loading-spinner mr-2" />
                <i v-else class="fas fa-dollar-sign mr-2" />
                {{ costLoading ? '保存中...' : '保存额度' }}
              </button>
            </div>
          </div>

          <!-- 延长有效期 -->
          <div>
            <label class="mb-3 block text-sm font-semibold text-gray-700 dark:text-gray-300">
              延长有效期
            </label>
            <div class="space-y-3">
              <div class="flex flex-wrap gap-2">
                <button
                  v-for="preset in extendPresets"
                  :key="preset"
                  class="rounded-lg bg-gray-100 px-3 py-1 text-sm font-medium hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                  type="button"
                  @click="applyExtendPreset(preset)"
                >
                  {{ preset }} 天
                </button>
                <button
                  class="rounded-lg bg-gray-100 px-3 py-1 text-sm font-medium hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                  type="button"
                  @click="form.extendAmount = ''"
                >
                  清空
                </button>
              </div>
              <div class="flex gap-2">
                <input
                  v-model="form.extendAmount"
                  class="form-input flex-1 border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
                  min="0"
                  placeholder="数量"
                  step="1"
                  type="number"
                />
                <div class="w-28">
                  <CustomDropdown
                    v-model="form.extendUnit"
                    accent="blue"
                    :options="extendUnitOptions"
                    placeholder="单位"
                  />
                </div>
              </div>
              <p v-if="newExpiresAtText" class="text-sm text-green-600 dark:text-green-400">
                延长后过期时间：{{ newExpiresAtText }}
              </p>
              <button
                class="btn btn-primary w-full px-6 py-2 text-sm font-semibold"
                :disabled="expiryLoading || !canSaveExpiry"
                type="button"
                @click="saveExpiry"
              >
                <div v-if="expiryLoading" class="loading-spinner mr-2" />
                <i v-else class="fas fa-clock mr-2" />
                {{ expiryLoading ? '保存中...' : '保存有效期' }}
              </button>
            </div>
          </div>
        </div>

        <div class="flex pt-4">
          <button
            class="flex-1 rounded-xl bg-gray-100 px-6 py-3 font-semibold text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
            type="button"
            @click="requestClose"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  </ModalTransition>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'

import ModalTransition from '@/components/common/ModalTransition.vue'
import { showToast, formatDateTime } from '@/utils/tools'
import * as httpApis from '@/utils/http_apis'

const props = defineProps({
  apiKey: {
    type: Object,
    required: true
  }
})

const emit = defineEmits(['close', 'success'])

// 弹窗动画：挂载后置 visible 触发进入，关闭时先播退出动画再通知父级卸载
const visible = ref(false)
onMounted(() => {
  visible.value = true
})
const requestClose = () => {
  visible.value = false
}
const onClosed = () => emit('close')

const costLoading = ref(false)
const expiryLoading = ref(false)
const costPresets = [10, 50, 100, 500]
const extendPresets = [7, 30, 90, 180, 365]
const extendUnitOptions = [
  { value: 'hours', label: '小时' },
  { value: 'days', label: '天' },
  { value: 'months', label: '月' }
]

const form = reactive({
  addCostLimit: '',
  extendAmount: '',
  extendUnit: 'days'
})

// 当前值用本地 ref 跟踪，保存成功后就地更新（dialog 不关闭）
const currentTotalCostLimit = ref(parseFloat(props.apiKey.totalCostLimit || 0))
const currentExpiresAt = ref(props.apiKey.expiresAt || '')

// 预付费 key 不能改额度上限
const isPrepaid = computed(() => props.apiKey.billingMode === 'prepaid')

// 当前总额度文案
const currentTotalCostLimitText = computed(() =>
  currentTotalCostLimit.value > 0 ? `$${currentTotalCostLimit.value}` : '无限制'
)

// 当前过期时间文案
const currentExpiresAtText = computed(() =>
  currentExpiresAt.value ? formatExpireDate(currentExpiresAt.value) : '永不过期'
)

// 调整后总额度文案
const newTotalCostLimitText = computed(() => {
  const add = parseFloat(form.addCostLimit)
  if (isPrepaid.value || isNaN(add) || add <= 0) return ''
  return `$${currentTotalCostLimit.value + add}`
})

// 实际延长数量/单位
const extendResolved = computed(() => {
  const amount = parseFloat(form.extendAmount)
  if (isNaN(amount) || amount <= 0) return null
  return { amount, unit: form.extendUnit }
})

// 延长后过期时间预览
const newExpiresAtText = computed(() => {
  const resolved = extendResolved.value
  if (!resolved) return ''
  const now = new Date()
  const base =
    currentExpiresAt.value && new Date(currentExpiresAt.value) > now
      ? new Date(currentExpiresAt.value)
      : now
  // 与后端 extendExpiry 保持一致：月固定按 30 天换算（非自然月），否则预览与实际写入会不一致
  let ms
  if (resolved.unit === 'hours') ms = resolved.amount * 60 * 60 * 1000
  else if (resolved.unit === 'months') ms = resolved.amount * 30 * 24 * 60 * 60 * 1000
  else ms = resolved.amount * 24 * 60 * 60 * 1000
  return formatExpireDate(new Date(base.getTime() + ms).toISOString())
})

// 额度/有效期各自的可保存条件
const canSaveCost = computed(() => !isPrepaid.value && parseFloat(form.addCostLimit) > 0)
const canSaveExpiry = computed(() => extendResolved.value !== null)

const applyExtendPreset = (days) => {
  form.extendAmount = String(days)
  form.extendUnit = 'days'
}

const formatExpireDate = (dateString) => formatDateTime(dateString) || ''

// 保存额度：成功后就地更新当前值、清空输入，不关闭 dialog；只回传本条变更给父级就地 patch
const saveCost = async () => {
  if (!canSaveCost.value) return
  costLoading.value = true
  try {
    const result = await httpApis.quickAdjustApiKeyApi(props.apiKey.id, {
      addCostLimit: parseFloat(form.addCostLimit)
    })
    if (result.success) {
      currentTotalCostLimit.value = result.newTotalCostLimit
      form.addCostLimit = ''
      showToast('额度已增加', 'success')
      emit('success', {
        keyId: props.apiKey.id,
        totalCostLimit: result.newTotalCostLimit
      })
    } else {
      showToast(result.message || '保存失败', 'error')
    }
  } catch (error) {
    showToast('保存失败', 'error')
  } finally {
    costLoading.value = false
  }
}

// 保存有效期：成功后就地更新当前值、重置选择，不关闭 dialog；只回传本条变更给父级就地 patch
const saveExpiry = async () => {
  if (!canSaveExpiry.value) return
  expiryLoading.value = true
  try {
    const result = await httpApis.quickAdjustApiKeyApi(props.apiKey.id, {
      extendAmount: extendResolved.value.amount,
      extendUnit: extendResolved.value.unit
    })
    if (result.success) {
      currentExpiresAt.value = result.newExpiresAt
      form.extendAmount = ''
      showToast('有效期已延长', 'success')
      emit('success', {
        keyId: props.apiKey.id,
        expiresAt: result.newExpiresAt,
        isActive: result.isActive,
        isActivated: result.isActivated,
        activatedAt: result.activatedAt
      })
    } else {
      showToast(result.message || '保存失败', 'error')
    }
  } catch (error) {
    showToast('保存失败', 'error')
  } finally {
    expiryLoading.value = false
  }
}
</script>
