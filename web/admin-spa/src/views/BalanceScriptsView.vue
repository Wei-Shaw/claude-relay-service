<template>
  <div class="space-y-6">
    <div class="flex flex-col gap-4 lg:flex-row">
      <div class="glass-strong flex-1 rounded-2xl p-4 shadow-lg">
        <div class="mb-3 flex items-center justify-between">
          <div>
            <div class="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {{ t('adminUtility.balanceScripts.title') }}
            </div>
            <div class="text-xs text-gray-500 dark:text-gray-400">
              {{ t('adminUtility.balanceScripts.subtitle') }}
            </div>
          </div>
          <div class="flex gap-2">
            <button
              class="rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
              @click="loadConfig"
            >
              {{ t('adminUtility.balanceScripts.reload') }}
            </button>
            <button
              class="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700"
              :disabled="saving"
              @click="saveConfig"
            >
              <span v-if="saving">{{ t('adminUtility.balanceScripts.saving') }}</span>
              <span v-else>{{ t('adminUtility.balanceScripts.save') }}</span>
            </button>
          </div>
        </div>

        <div class="grid gap-4 md:grid-cols-2">
          <div class="space-y-2">
            <label class="text-sm font-medium text-gray-700 dark:text-gray-200">API Key</label>
            <input v-model="form.apiKey" class="input-text" placeholder="sk-xxxx" type="text" />
          </div>
          <div class="space-y-2">
            <label class="text-sm font-medium text-gray-700 dark:text-gray-200">
              {{ t('adminUtility.balanceScripts.requestUrl') }}
            </label>
            <input
              v-model="form.baseUrl"
              class="input-text"
              placeholder="https://api.example.com"
              type="text"
            />
          </div>
          <div class="space-y-2">
            <label class="text-sm font-medium text-gray-700 dark:text-gray-200">{{
              t('adminUtility.balanceScripts.tokenOptional')
            }}</label>
            <input v-model="form.token" class="input-text" placeholder="Bearer token" type="text" />
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div class="space-y-2">
              <label class="text-sm font-medium text-gray-700 dark:text-gray-200">{{
                t('adminUtility.balanceScripts.timeoutSeconds')
              }}</label>
              <input
                v-model.number="form.timeoutSeconds"
                class="input-text"
                min="1"
                type="number"
              />
            </div>
            <div class="space-y-2">
              <label class="text-sm font-medium text-gray-700 dark:text-gray-200">
                {{ t('adminUtility.balanceScripts.autoInterval') }}
              </label>
              <input
                v-model.number="form.autoIntervalMinutes"
                class="input-text"
                min="0"
                type="number"
              />
            </div>
          </div>
          <div class="md:col-span-2">
            <label class="text-sm font-medium text-gray-700 dark:text-gray-200">{{
              t('adminUtility.balanceScripts.templateVariables')
            }}</label>
            <p class="text-xs text-gray-500 dark:text-gray-400">
              {{ t('adminUtility.balanceScripts.availableVariables') }} {{ '{' }}{{ '{' }}baseUrl{{
                '}'
              }}{{ '}' }}, {{ '{' }}{{ '{' }}apiKey{{ '}' }}{{ '}' }}, {{ '{' }}{{ '{' }}token{{
                '}'
              }}{{ '}' }}, {{ '{' }}{{ '{' }}accountId{{ '}' }}{{ '}' }}, {{ '{'
              }}{{ '{' }}platform{{ '}' }}{{ '}' }}, {{ '{' }}{{ '{' }}extra{{ '}' }}{{ '}' }}
            </p>
          </div>
        </div>
      </div>

      <div class="glass-strong w-full max-w-xl rounded-2xl p-4 shadow-lg">
        <div class="mb-3 flex items-center justify-between">
          <div>
            <div class="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {{ t('adminUtility.balanceScripts.testTitle') }}
            </div>
            <div class="text-xs text-gray-500 dark:text-gray-400">
              {{ t('adminUtility.balanceScripts.testSubtitle') }}
            </div>
          </div>
          <button
            class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
            :disabled="testing"
            @click="testScript"
          >
            <span v-if="testing">{{ t('adminUtility.balanceScripts.testing') }}</span>
            <span v-else>{{ t('adminUtility.balanceScripts.testScript') }}</span>
          </button>
        </div>
        <div class="grid gap-3">
          <div class="space-y-1">
            <label class="text-sm font-medium text-gray-700 dark:text-gray-200">{{
              t('adminUtility.balanceScripts.platform')
            }}</label>
            <input
              v-model="testForm.platform"
              class="input-text"
              :placeholder="t('adminUtility.balanceScripts.platformPlaceholder')"
            />
          </div>
          <div class="space-y-1">
            <label class="text-sm font-medium text-gray-700 dark:text-gray-200">{{
              t('adminUtility.balanceScripts.accountId')
            }}</label>
            <input
              v-model="testForm.accountId"
              class="input-text"
              :placeholder="t('adminUtility.balanceScripts.accountIdPlaceholder')"
            />
          </div>
          <div class="space-y-1">
            <label class="text-sm font-medium text-gray-700 dark:text-gray-200">{{
              t('adminUtility.balanceScripts.extra')
            }}</label>
            <input
              v-model="testForm.extra"
              class="input-text"
              :placeholder="t('adminUtility.balanceScripts.optional')"
            />
          </div>
        </div>

        <div v-if="testResult" class="mt-4 space-y-2 rounded-xl bg-gray-50 p-3 dark:bg-gray-800/60">
          <div class="flex items-center justify-between text-sm">
            <span class="font-semibold text-gray-800 dark:text-gray-100">{{
              t('adminUtility.balanceScripts.testResult')
            }}</span>
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
          <div class="text-xs text-gray-600 dark:text-gray-300">
            <div>
              {{
                t('adminUtility.balanceScripts.balance', {
                  value: displayAmount(testResult.mapped?.balance)
                })
              }}
            </div>
            <div>
              {{
                t('adminUtility.balanceScripts.unit', { value: testResult.mapped?.currency || '—' })
              }}
            </div>
            <div v-if="testResult.mapped?.planName">
              {{ t('adminUtility.balanceScripts.plan', { value: testResult.mapped.planName }) }}
            </div>
            <div v-if="testResult.mapped?.errorMessage" class="text-red-500">
              {{
                t('adminUtility.balanceScripts.error', { value: testResult.mapped.errorMessage })
              }}
            </div>
            <div v-if="testResult.mapped?.quota">
              {{
                t('adminUtility.balanceScripts.quota', {
                  value: JSON.stringify(testResult.mapped.quota)
                })
              }}
            </div>
          </div>
          <details class="text-xs text-gray-500 dark:text-gray-400">
            <summary class="cursor-pointer">
              {{ t('adminUtility.balanceScripts.viewExtractor') }}
            </summary>
            <pre class="mt-2 overflow-auto rounded bg-black/70 p-2 text-[11px] text-gray-100"
              >{{ formatJson(testResult.extracted) }}
</pre
            >
          </details>
          <details class="text-xs text-gray-500 dark:text-gray-400">
            <summary class="cursor-pointer">{{ t('adminUtility.balanceScripts.viewRaw') }}</summary>
            <pre class="mt-2 overflow-auto rounded bg-black/70 p-2 text-[11px] text-gray-100"
              >{{ formatJson(testResult.response) }}
</pre
            >
          </details>
        </div>
      </div>
    </div>

    <div class="glass-strong rounded-2xl p-4 shadow-lg">
      <div class="mb-2 flex items-center justify-between">
        <div>
          <div class="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {{ t('adminUtility.balanceScripts.extractorCode') }}
          </div>
          <div class="text-xs text-gray-500 dark:text-gray-400">
            {{ t('adminUtility.balanceScripts.extractorSubtitle') }}
          </div>
        </div>
        <button
          class="rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
          @click="applyPreset"
        >
          {{ t('adminUtility.balanceScripts.useExample') }}
        </button>
      </div>
      <textarea
        v-model="form.scriptBody"
        class="min-h-[320px] w-full rounded-xl bg-gray-900 font-mono text-sm text-gray-100 shadow-inner focus:outline-none focus:ring-2 focus:ring-indigo-500"
        spellcheck="false"
      ></textarea>
      <div class="mt-2 text-xs text-gray-500 dark:text-gray-400">
        {{ t('adminUtility.balanceScripts.returnFields') }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import {
  getDefaultBalanceScriptApi,
  updateDefaultBalanceScriptApi,
  testDefaultBalanceScriptApi
} from '@/utils/http_apis'
import { showToast } from '@/utils/tools'

const { t } = useI18n()

const form = reactive({
  baseUrl: '',
  apiKey: '',
  token: '',
  timeoutSeconds: 10,
  autoIntervalMinutes: 0,
  scriptBody: ''
})

const testForm = reactive({
  platform: '',
  accountId: '',
  extra: ''
})

const saving = ref(false)
const testing = ref(false)
const testResult = ref(null)

const presetScript = `({
  request: {
    url: "{{baseUrl}}/user/balance",
    method: "GET",
    headers: {
      "Authorization": "Bearer {{apiKey}}",
      "User-Agent": "cc-switch/1.0"
    }
  },
  extractor: function(response) {
    return {
      isValid: response.is_active || true,
      remaining: response.balance,
      unit: "USD",
      planName: response.plan || "${t('adminUtility.balanceScripts.defaultPlan')}"
    };
  }
})`

const loadConfig = async () => {
  const res = await getDefaultBalanceScriptApi()
  if (res?.success && res.data) {
    Object.assign(form, res.data)
  }
}

const saveConfig = async () => {
  saving.value = true
  const res = await updateDefaultBalanceScriptApi({ ...form })
  if (res?.success) {
    showToast(t('adminUtility.balanceScripts.saved'), 'success')
  } else {
    showToast(res?.message || t('adminUtility.balanceScripts.saveFailed'), 'error')
  }
  saving.value = false
}

const testScript = async () => {
  testing.value = true
  testResult.value = null
  const payload = { ...form, ...testForm, scriptBody: form.scriptBody }
  const res = await testDefaultBalanceScriptApi(payload)
  if (res?.success) {
    testResult.value = res.data
    showToast(t('adminUtility.balanceScripts.testDone'), 'success')
  } else {
    showToast(res?.error || t('adminUtility.balanceScripts.testFailed'), 'error')
  }
  testing.value = false
}

const applyPreset = () => {
  form.scriptBody = presetScript
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

onMounted(() => {
  applyPreset()
  loadConfig()
})
</script>

<style scoped>
.input-text {
  @apply w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 shadow-sm transition focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:focus:border-indigo-500 dark:focus:ring-indigo-600;
}
</style>
