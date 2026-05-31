<template>
  <el-dialog
    :append-to-body="true"
    class="record-detail-modal"
    :close-on-click-modal="false"
    :destroy-on-close="true"
    :model-value="show"
    :show-close="false"
    top="10vh"
    width="720px"
    @close="emitClose"
  >
    <template #header>
      <div class="flex items-center justify-between">
        <div>
          <p class="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
            {{ t('apiKeyRecord.title') }}
          </p>
          <p class="text-lg font-bold text-gray-900 dark:text-gray-100">
            {{ record?.model || t('apiKeyRecord.unknownModel') }}
          </p>
        </div>
        <button
          :aria-label="t('common.close')"
          class="rounded-full p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-gray-100"
          @click="emitClose"
        >
          <i class="fas fa-times" />
        </button>
      </div>
    </template>

    <div class="space-y-4">
      <div class="grid gap-3 md:grid-cols-2">
        <div
          class="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900"
        >
          <h4 class="mb-3 text-sm font-semibold text-gray-800 dark:text-gray-200">
            {{ t('apiKeyRecord.basicInfo') }}
          </h4>
          <ul class="space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <li class="flex items-center justify-between">
              <span class="text-gray-500 dark:text-gray-400">{{ t('apiKeyRecord.time') }}</span>
              <span class="font-medium">{{ formattedTime }}</span>
            </li>
            <li class="flex items-center justify-between">
              <span class="text-gray-500 dark:text-gray-400">{{ t('apiKeyRecord.model') }}</span>
              <span class="font-medium">{{ record?.model || t('apiKeyRecord.unknownModel') }}</span>
            </li>
            <li class="flex items-center justify-between">
              <span class="text-gray-500 dark:text-gray-400">{{ t('apiKeyRecord.account') }}</span>
              <span class="font-medium">{{
                record?.accountName || t('apiKeyRecord.unknownAccount')
              }}</span>
            </li>
            <li class="flex items-center justify-between">
              <span class="text-gray-500 dark:text-gray-400">{{ t('apiKeyRecord.channel') }}</span>
              <span class="font-medium">{{
                record?.accountTypeName || t('apiKeyRecord.unknownChannel')
              }}</span>
            </li>
          </ul>
        </div>

        <div
          class="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900"
        >
          <h4 class="mb-3 text-sm font-semibold text-gray-800 dark:text-gray-200">
            {{ t('apiKeyRecord.tokenUsage') }}
          </h4>
          <ul class="space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <li class="flex items-center justify-between">
              <span class="text-gray-500 dark:text-gray-400">{{
                t('apiKeyRecord.inputToken')
              }}</span>
              <span class="font-semibold text-blue-600 dark:text-blue-400">
                {{ formatNumber(record?.inputTokens) }}
              </span>
            </li>
            <li class="flex items-center justify-between">
              <span class="text-gray-500 dark:text-gray-400">{{
                t('apiKeyRecord.outputToken')
              }}</span>
              <span class="font-semibold text-green-600 dark:text-green-400">
                {{ formatNumber(record?.outputTokens) }}
              </span>
            </li>
            <li class="flex items-center justify-between">
              <span class="text-gray-500 dark:text-gray-400">{{
                t('apiKeyRecord.cacheCreate')
              }}</span>
              <span class="font-semibold text-purple-600 dark:text-purple-400">
                {{ formatNumber(record?.cacheCreateTokens) }}
              </span>
            </li>
            <li class="flex items-center justify-between">
              <span class="text-gray-500 dark:text-gray-400">{{
                t('apiKeyRecord.cacheRead')
              }}</span>
              <span class="font-semibold text-orange-600 dark:text-orange-400">
                {{ formatNumber(record?.cacheReadTokens) }}
              </span>
            </li>
            <li class="flex items-center justify-between">
              <span class="text-gray-500 dark:text-gray-400">{{ t('apiKeyRecord.total') }}</span>
              <span class="font-semibold text-gray-900 dark:text-gray-100">
                {{ formatNumber(record?.totalTokens) }}
              </span>
            </li>
          </ul>
        </div>
      </div>

      <div
        class="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900"
      >
        <h4 class="mb-3 text-sm font-semibold text-gray-800 dark:text-gray-200">
          {{ t('apiKeyRecord.costDetails') }}
        </h4>
        <div class="grid gap-3 sm:grid-cols-2">
          <div
            class="flex items-center justify-between rounded-md bg-gray-50 px-3 py-2 dark:bg-gray-800"
          >
            <span class="text-sm text-gray-500 dark:text-gray-400">{{
              t('apiKeyRecord.inputCost')
            }}</span>
            <span class="text-sm font-semibold text-gray-900 dark:text-gray-100">
              {{ formattedCosts.input }}
            </span>
          </div>
          <div
            class="flex items-center justify-between rounded-md bg-gray-50 px-3 py-2 dark:bg-gray-800"
          >
            <span class="text-sm text-gray-500 dark:text-gray-400">{{
              t('apiKeyRecord.outputCost')
            }}</span>
            <span class="text-sm font-semibold text-gray-900 dark:text-gray-100">
              {{ formattedCosts.output }}
            </span>
          </div>
          <div
            class="flex items-center justify-between rounded-md bg-gray-50 px-3 py-2 dark:bg-gray-800"
          >
            <span class="text-sm text-gray-500 dark:text-gray-400">{{
              t('apiKeyRecord.cacheCreate')
            }}</span>
            <span class="text-sm font-semibold text-gray-900 dark:text-gray-100">
              {{ formattedCosts.cacheCreate }}
            </span>
          </div>
          <div
            class="flex items-center justify-between rounded-md bg-gray-50 px-3 py-2 dark:bg-gray-800"
          >
            <span class="text-sm text-gray-500 dark:text-gray-400">{{
              t('apiKeyRecord.cacheRead')
            }}</span>
            <span class="text-sm font-semibold text-gray-900 dark:text-gray-100">
              {{ formattedCosts.cacheRead }}
            </span>
          </div>
        </div>
        <div
          class="mt-4 flex items-center justify-between rounded-md border border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-800 dark:bg-gray-800"
        >
          <span class="text-sm font-semibold text-gray-700 dark:text-gray-200">{{
            t('apiKeyRecord.totalCost')
          }}</span>
          <div class="text-base font-bold text-yellow-600 dark:text-yellow-400">
            {{ record?.costFormatted || formattedCosts.total }}
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="flex justify-end">
        <el-button type="primary" @click="emitClose">{{ t('common.close') }}</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import dayjs from 'dayjs'
import { formatNumber } from '@/utils/tools'

const props = defineProps({
  show: {
    type: Boolean,
    default: false
  },
  record: {
    type: Object,
    default: () => ({})
  }
})

const emit = defineEmits(['close'])
const emitClose = () => emit('close')
const { t } = useI18n()

const formattedTime = computed(() => {
  if (!props.record?.timestamp) return t('apiKeyRecord.unknownTime')
  return dayjs(props.record.timestamp).format('YYYY-MM-DD HH:mm:ss')
})

const formattedCosts = computed(() => {
  const breakdown = props.record?.realCostBreakdown || props.record?.costBreakdown || {}
  const formatValue = (value) => {
    const num = typeof value === 'number' ? value : 0
    if (num >= 1) return `$${num.toFixed(2)}`
    if (num >= 0.001) return `$${num.toFixed(4)}`
    return `$${num.toFixed(6)}`
  }

  return {
    input: formatValue(breakdown.input),
    output: formatValue(breakdown.output),
    cacheCreate: formatValue(breakdown.cacheCreate),
    cacheRead: formatValue(breakdown.cacheRead),
    total: formatValue(breakdown.total)
  }
})
</script>

<style scoped>
.record-detail-modal :deep(.el-dialog__header) {
  margin: 0;
  padding: 16px 16px 0;
}

.record-detail-modal :deep(.el-dialog__body) {
  padding: 12px 16px 4px;
}

.record-detail-modal :deep(.el-dialog__footer) {
  padding: 8px 16px 16px;
}
</style>
