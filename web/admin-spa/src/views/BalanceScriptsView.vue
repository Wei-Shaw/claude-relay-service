<template>
  <div class="space-y-6">
    <div class="flex flex-col gap-4 lg:flex-row">
      <div class="glass-strong flex-1 rounded-2xl p-4 shadow-lg">
        <div class="mb-3 flex items-center justify-between">
          <div>
            <div class="text-lg font-semibold text-gray-900 dark:text-gray-100">脚本余额配置</div>
            <div class="text-xs text-gray-500 dark:text-gray-400">
              使用自定义脚本 + 模板变量适配任意余额接口
            </div>
          </div>
          <div class="flex gap-2">
            <button
              class="rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
              @click="loadConfig"
            >
              重新加载
            </button>
            <button
              class="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700"
              :disabled="saving"
              @click="saveConfig"
            >
              <span v-if="saving">保存中...</span>
              <span v-else>保存配置</span>
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
              请求地址（baseUrl）
            </label>
            <input
              v-model="form.baseUrl"
              class="input-text"
              placeholder="https://api.example.com"
              type="text"
            />
          </div>
          <div class="space-y-2">
            <label class="text-sm font-medium text-gray-700 dark:text-gray-200"
              >Token（可选）</label
            >
            <input v-model="form.token" class="input-text" placeholder="Bearer token" type="text" />
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div class="space-y-2">
              <label class="text-sm font-medium text-gray-700 dark:text-gray-200"
                >超时时间(秒)</label
              >
              <input
                v-model.number="form.timeoutSeconds"
                class="input-text"
                min="1"
                type="number"
              />
            </div>
            <div class="space-y-2">
              <label class="text-sm font-medium text-gray-700 dark:text-gray-200">
                自动查询间隔(分钟)
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
            <label class="text-sm font-medium text-gray-700 dark:text-gray-200">模板变量</label>
            <p class="text-xs text-gray-500 dark:text-gray-400">
              可用变量：{{ '{' }}{{ '{' }}baseUrl{{ '}' }}{{ '}' }}、{{ '{' }}{{ '{' }}apiKey{{ '}'
              }}{{ '}' }}、{{ '{' }}{{ '{' }}token{{ '}' }}{{ '}' }}、{{ '{' }}{{ '{' }}accountId{{
                '}'
              }}{{ '}' }}、{{ '{' }}{{ '{' }}platform{{ '}' }}{{ '}' }}、{{ '{' }}{{ '{' }}extra{{
                '}'
              }}{{ '}' }}
            </p>
          </div>
        </div>
      </div>

      <div class="glass-strong w-full max-w-xl rounded-2xl p-4 shadow-lg">
        <div class="mb-3 flex items-center justify-between">
          <div>
            <div class="text-lg font-semibold text-gray-900 dark:text-gray-100">测试脚本</div>
            <div class="text-xs text-gray-500 dark:text-gray-400">
              填入账号上下文（可选），调试 extractor 输出
            </div>
          </div>
          <button
            class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
            :disabled="testing"
            @click="testScript"
          >
            <span v-if="testing">测试中...</span>
            <span v-else>测试脚本</span>
          </button>
        </div>
        <div class="grid gap-3">
          <div class="space-y-1">
            <label class="text-sm font-medium text-gray-700 dark:text-gray-200">平台</label>
            <input v-model="testForm.platform" class="input-text" placeholder="例如 claude" />
          </div>
          <div class="space-y-1">
            <label class="text-sm font-medium text-gray-700 dark:text-gray-200">账号ID</label>
            <input v-model="testForm.accountId" class="input-text" placeholder="账号标识，可选" />
          </div>
          <div class="space-y-1">
            <label class="text-sm font-medium text-gray-700 dark:text-gray-200"
              >额外参数 (extra)</label
            >
            <input v-model="testForm.extra" class="input-text" placeholder="可选" />
          </div>
        </div>

        <div v-if="testResult" class="mt-4 space-y-2 rounded-xl bg-gray-50 p-3 dark:bg-gray-800/60">
          <div class="flex items-center justify-between text-sm">
            <span class="font-semibold text-gray-800 dark:text-gray-100">测试结果</span>
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
            <div>余额: {{ displayAmount(testResult.mapped?.balance) }}</div>
            <div>单位: {{ testResult.mapped?.currency || '—' }}</div>
            <div v-if="testResult.mapped?.planName">套餐: {{ testResult.mapped.planName }}</div>
            <div v-if="testResult.mapped?.errorMessage" class="text-red-500">
              错误: {{ testResult.mapped.errorMessage }}
            </div>
            <div v-if="testResult.mapped?.quota">
              配额: {{ JSON.stringify(testResult.mapped.quota) }}
            </div>
          </div>
          <details class="text-xs text-gray-500 dark:text-gray-400">
            <summary class="cursor-pointer">查看 extractor 输出</summary>
            <pre class="mt-2 overflow-auto rounded bg-black/70 p-2 text-[11px] text-gray-100"
              >{{ formatJson(testResult.extracted) }}
</pre
            >
          </details>
          <details class="text-xs text-gray-500 dark:text-gray-400">
            <summary class="cursor-pointer">查看原始响应</summary>
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
          <div class="text-lg font-semibold text-gray-900 dark:text-gray-100">提取器代码</div>
          <div class="text-xs text-gray-500 dark:text-gray-400">
            返回对象需包含 request、extractor；支持模板变量替换
          </div>
        </div>
        <button
          class="rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
          @click="applyPreset"
        >
          使用示例模板
        </button>
      </div>
      <textarea
        v-model="form.scriptBody"
        class="min-h-[320px] w-full rounded-xl bg-gray-900 font-mono text-sm text-gray-100 shadow-inner focus:outline-none focus:ring-2 focus:ring-indigo-500"
        spellcheck="false"
      ></textarea>
      <div class="mt-2 text-xs text-gray-500 dark:text-gray-400">
        extractor
        返回字段（可选）：isValid、invalidMessage、remaining、unit、planName、total、used、extra
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'

import {
  getDefaultBalanceScriptApi,
  updateDefaultBalanceScriptApi,
  testDefaultBalanceScriptApi
} from '@/utils/http_apis'
import { showToast } from '@/utils/tools'

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
      planName: response.plan || "默认套餐"
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
    showToast('配置已保存', 'success')
  } else {
    showToast(res?.message || '保存失败', 'error')
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
    showToast('测试完成', 'success')
  } else {
    showToast(res?.error || '测试失败', 'error')
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
