<template>
  <el-dialog
    :append-to-body="true"
    class="balance-script-dialog"
    :close-on-click-modal="false"
    :destroy-on-close="true"
    :model-value="show"
    :title="t('accountModals.balanceScript.title', { name: account?.name || '' })"
    top="5vh"
    width="720px"
    @close="emitClose"
  >
    <div class="space-y-4">
      <div class="grid gap-3 md:grid-cols-2">
        <div class="space-y-2">
          <label class="text-sm font-medium text-gray-700 dark:text-gray-200">API Key</label>
          <input v-model="form.apiKey" class="input-text" placeholder="access token / key" />
        </div>
        <div class="space-y-2">
          <label class="text-sm font-medium text-gray-700 dark:text-gray-200">{{
            t('accountModals.balanceScript.baseUrl')
          }}</label>
          <input v-model="form.baseUrl" class="input-text" placeholder="https://api.example.com" />
        </div>
        <div class="space-y-2">
          <label class="text-sm font-medium text-gray-700 dark:text-gray-200">{{
            t('accountModals.balanceScript.tokenOptional')
          }}</label>
          <input v-model="form.token" class="input-text" placeholder="Bearer token" />
        </div>
        <div class="space-y-2">
          <label class="text-sm font-medium text-gray-700 dark:text-gray-200">{{
            t('accountModals.balanceScript.extra')
          }}</label>
          <input
            v-model="form.extra"
            class="input-text"
            :placeholder="t('accountModals.balanceScript.extraPlaceholder')"
          />
        </div>
        <div class="space-y-2">
          <label class="text-sm font-medium text-gray-700 dark:text-gray-200">{{
            t('accountModals.balanceScript.timeoutSeconds')
          }}</label>
          <input v-model.number="form.timeoutSeconds" class="input-text" min="1" type="number" />
        </div>
        <div class="space-y-2">
          <label class="text-sm font-medium text-gray-700 dark:text-gray-200">{{
            t('accountModals.balanceScript.autoIntervalMinutes')
          }}</label>
          <input
            v-model.number="form.autoIntervalMinutes"
            class="input-text"
            min="0"
            type="number"
          />
          <p class="text-xs text-gray-500 dark:text-gray-400">
            {{ t('accountModals.balanceScript.manualOnlyHint') }}
          </p>
        </div>
        <div class="text-xs text-gray-500 dark:text-gray-400 md:col-span-2">
          {{ t('accountModals.balanceScript.availableVariables') }}
          {{ balanceScriptVariables.join(t('accountModals.balanceScript.variableSeparator')) }}
        </div>
      </div>

      <div>
        <div class="mb-2 flex items-center justify-between">
          <div class="text-sm font-semibold text-gray-800 dark:text-gray-100">
            {{ t('accountModals.balanceScript.extractorCode') }}
          </div>
          <button
            class="rounded bg-gray-200 px-2 py-1 text-xs dark:bg-gray-700"
            @click="applyPreset"
          >
            {{ t('accountModals.balanceScript.useExample') }}
          </button>
        </div>
        <textarea
          v-model="form.scriptBody"
          class="min-h-[260px] w-full rounded-xl bg-gray-900 font-mono text-sm text-gray-100 shadow-inner focus:outline-none focus:ring-2 focus:ring-indigo-500"
          spellcheck="false"
        ></textarea>
        <div class="mt-1 text-xs text-gray-500 dark:text-gray-400">
          {{ t('accountModals.balanceScript.extractorReturnHint') }}
        </div>
      </div>

      <div v-if="testResult" class="rounded-lg bg-gray-50 p-3 text-sm dark:bg-gray-800/60">
        <div class="flex items-center justify-between">
          <span class="font-semibold">{{ t('accountModals.balanceScript.testResult') }}</span>
          <span
            :class="[
              'rounded px-2 py-0.5 text-xs',
              testResult.mapped?.status === 'success'
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200'
                : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200'
            ]"
          >
            {{ testResult.mapped?.status || 'unknown' }}
          </span>
        </div>
        <div class="mt-2 text-xs text-gray-600 dark:text-gray-300">
          <div>
            {{ t('accountModals.balanceScript.balance') }}:
            {{ displayAmount(testResult.mapped?.balance) }}
          </div>
          <div>
            {{ t('accountModals.balanceScript.unit') }}:
            {{ testResult.mapped?.currency || '—' }}
          </div>
          <div v-if="testResult.mapped?.planName">
            {{ t('accountModals.balanceScript.plan') }}: {{ testResult.mapped.planName }}
          </div>
          <div v-if="testResult.mapped?.errorMessage" class="text-red-500">
            {{ t('accountModals.balanceScript.error') }}: {{ testResult.mapped.errorMessage }}
          </div>
        </div>
        <details class="text-xs text-gray-500 dark:text-gray-400">
          <summary class="cursor-pointer">
            {{ t('accountModals.balanceScript.viewExtractorOutput') }}
          </summary>
          <pre class="mt-1 whitespace-pre-wrap break-all">{{
            formatJson(testResult.extracted)
          }}</pre>
        </details>
        <details class="text-xs text-gray-500 dark:text-gray-400">
          <summary class="cursor-pointer">
            {{ t('accountModals.balanceScript.viewRawResponse') }}
          </summary>
          <pre class="mt-1 whitespace-pre-wrap break-all">{{
            formatJson(testResult.response)
          }}</pre>
        </details>
      </div>
    </div>

    <template #footer>
      <div class="flex items-center gap-2">
        <el-button :loading="testing" @click="testScript">{{
          t('accountModals.balanceScript.testScript')
        }}</el-button>
        <el-button :loading="saving" type="primary" @click="saveConfig">{{
          t('accountModals.scheduledTest.saveConfig')
        }}</el-button>
        <el-button @click="emitClose">{{ t('common.cancel') }}</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import {
  getAccountBalanceScriptApi,
  updateAccountBalanceScriptApi,
  testAccountBalanceScriptApi
} from '@/utils/http_apis'
import { showToast } from '@/utils/tools'

const props = defineProps({
  show: { type: Boolean, default: false },
  account: { type: Object, default: () => ({}) }
})

const emit = defineEmits(['close', 'saved'])
const { t } = useI18n()

const saving = ref(false)
const testing = ref(false)
const testResult = ref(null)
const balanceScriptVariables = [
  '{{baseUrl}}',
  '{{apiKey}}',
  '{{token}}',
  '{{accountId}}',
  '{{platform}}',
  '{{extra}}'
]

const presetScript = computed(
  () => `({
  request: {
    url: "{{baseUrl}}/api/user/self",
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer {{apiKey}}",
      "New-Api-User": "{{extra}}"
    }
  },
  extractor: function (response) {
    if (response && response.success && response.data) {
      const quota = response.data.quota || 0;
      const used = response.data.used_quota || 0;
      return {
        planName: response.data.group || "${t('accountModals.balanceScript.defaultPlan')}",
        remaining: quota / 500000,
        used: used / 500000,
        total: (quota + used) / 500000,
        unit: "USD"
      };
    }
    return {
      isValid: false,
      invalidMessage: (response && response.message) || "${t('accountModals.balanceScript.queryFailed')}"
    };
  }
})`
)

const form = reactive({
  baseUrl: '',
  apiKey: '',
  token: '',
  extra: '',
  timeoutSeconds: 10,
  autoIntervalMinutes: 0,
  scriptBody: ''
})

const buildDefaultForm = () => ({
  baseUrl: '',
  apiKey: '',
  token: '',
  extra: '',
  timeoutSeconds: 10,
  autoIntervalMinutes: 0,
  // 默认给出示例脚本，字段保持清空，避免“上一个账户的配置污染当前账户”
  scriptBody: presetScript.value
})

const emitClose = () => emit('close')

const resetForm = () => {
  Object.assign(form, buildDefaultForm())
  testResult.value = null
  saving.value = false
  testing.value = false
}

const loadConfig = async () => {
  if (!props.account?.id || !props.account?.platform) return
  const res = await getAccountBalanceScriptApi(props.account.id, props.account.platform)
  if (res?.success && res.data) {
    Object.assign(form, res.data)
  }
}

const saveConfig = async () => {
  if (!props.account?.id || !props.account?.platform) return
  saving.value = true
  const res = await updateAccountBalanceScriptApi(props.account.id, props.account.platform, {
    ...form
  })
  if (res?.success) {
    showToast(t('accountModals.balanceScript.saved'), 'success')
    emit('saved')
  } else {
    showToast(res?.message || t('accountModals.common.saveFailed'), 'error')
  }
  saving.value = false
}

const testScript = async () => {
  if (!props.account?.id || !props.account?.platform) return
  testing.value = true
  testResult.value = null
  const res = await testAccountBalanceScriptApi(props.account.id, props.account.platform, {
    ...form
  })
  if (res?.success) {
    testResult.value = res.data
    showToast(t('accountModals.balanceScript.testComplete'), 'success')
  } else {
    showToast(res?.error || t('accountModals.balanceScript.testFailed'), 'error')
  }
  testing.value = false
}

const applyPreset = () => {
  form.scriptBody = presetScript.value
}

const displayAmount = (val) => {
  if (val === null || val === undefined || Number.isNaN(Number(val))) return '—'
  return Number(val).toFixed(2)
}

const formatJson = (data) => {
  try {
    return JSON.stringify(data, null, 2)
  } catch (error) {
    return String(data)
  }
}

watch(
  () => props.show,
  (val) => {
    if (val) {
      resetForm()
      loadConfig()
    }
  }
)
</script>

<style scoped>
:deep(.balance-script-dialog) {
  max-height: 90vh;
  display: flex;
  flex-direction: column;
}

:deep(.balance-script-dialog .el-dialog__body) {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
}

:deep(.balance-script-dialog .el-dialog__footer) {
  border-top: 1px solid rgba(229, 231, 235, 0.7);
}

.input-text {
  @apply w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 shadow-sm transition focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:focus:border-indigo-500 dark:focus:ring-indigo-600;
}
</style>
