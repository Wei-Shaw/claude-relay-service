<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center">
    <div class="absolute inset-0 bg-black/50 backdrop-blur-sm" @click="$emit('close')" />
    <div
      class="relative z-10 mx-4 w-full max-w-md rounded-xl bg-white p-6 shadow-2xl dark:bg-gray-800"
    >
      <!-- Header -->
      <div class="mb-5 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div
            class="flex h-9 w-9 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-900/40"
          >
            <i class="fas fa-key text-orange-600 dark:text-orange-400" />
          </div>
          <div>
            <h3 class="text-base font-semibold text-gray-900 dark:text-gray-100">
              {{ account.name || account.email || '账号重新授权' }}
            </h3>
            <p class="text-xs text-gray-500 dark:text-gray-400">Claude OAuth — Cookie 重新授权</p>
          </div>
        </div>
        <button
          class="flex h-7 w-7 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700"
          @click="$emit('close')"
        >
          <i class="fas fa-times text-sm" />
        </button>
      </div>

      <!-- Error banner -->
      <div
        v-if="account.errorMessage || account.status === 'error'"
        class="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 dark:border-red-800/60 dark:bg-red-900/20"
      >
        <p class="text-xs font-medium text-red-700 dark:text-red-400">
          <i class="fas fa-exclamation-circle mr-1" />
          {{ account.errorMessage || '账号授权已失效 (400/401)' }}
        </p>
      </div>

      <!-- Instructions -->
      <div class="mb-4 rounded-lg bg-blue-50 px-4 py-3 dark:bg-blue-900/20">
        <p class="text-xs leading-relaxed text-blue-700 dark:text-blue-300">
          <i class="fas fa-info-circle mr-1" />
          登录 <strong>claude.ai</strong>，按 F12 → Application → Cookies → claude.ai， 找到
          <code class="rounded bg-blue-100 px-1 py-0.5 font-mono dark:bg-blue-900/60"
            >sessionKey</code
          >
          并复制完整值。
        </p>
      </div>

      <!-- Input -->
      <div class="mb-4">
        <label class="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
          sessionKey
        </label>
        <textarea
          v-model="sessionKey"
          class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 font-mono text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
          :disabled="loading"
          placeholder="sk-ant-sid01-xxxxxxxxxxxxxxxx..."
          rows="3"
        />
      </div>

      <!-- Proxy field -->
      <div class="mb-5">
        <button
          class="mb-2 flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          type="button"
          @click="showProxy = !showProxy"
        >
          <i
            class="text-[10px]"
            :class="showProxy ? 'fas fa-chevron-down' : 'fas fa-chevron-right'"
          />
          代理设置（无外网时必填）
        </button>
        <div v-if="showProxy">
          <input
            v-model="proxy"
            class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 font-mono text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
            :disabled="loading"
            placeholder="http://127.0.0.1:7890 或 socks5://host:port"
            type="text"
          />
          <p class="mt-1 text-xs text-gray-400">用于访问 claude.ai 的代理，留空则直连</p>
        </div>
      </div>

      <!-- Step indicator -->
      <p v-if="loading && step" class="mb-3 text-center text-xs text-gray-400 dark:text-gray-500">
        <i class="fas fa-spinner mr-1 animate-spin" />{{ step }}
      </p>

      <!-- Error msg -->
      <div
        v-if="errorMsg"
        class="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 dark:border-red-800/60 dark:bg-red-900/20"
      >
        <p class="text-xs text-red-600 dark:text-red-400">
          <i class="fas fa-times-circle mr-1" />{{ errorMsg }}
        </p>
      </div>

      <!-- Success msg -->
      <div
        v-if="successMsg"
        class="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 dark:border-green-800/60 dark:bg-green-900/20"
      >
        <p class="text-xs text-green-700 dark:text-green-400">
          <i class="fas fa-check-circle mr-1" />{{ successMsg }}
        </p>
      </div>

      <!-- Actions -->
      <div class="flex justify-end gap-3">
        <button
          class="rounded-lg px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
          :disabled="loading"
          @click="$emit('close')"
        >
          取消
        </button>
        <button
          class="flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
          :disabled="loading || !sessionKey.trim()"
          @click="handleReAuth"
        >
          <i v-if="loading" class="fas fa-spinner animate-spin" />
          <i v-else class="fas fa-key" />
          重新授权
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import * as httpApis from '@/utils/http_apis'

const props = defineProps({
  account: { type: Object, required: true }
})
const emit = defineEmits(['close', 'success'])

const sessionKey = ref('')
const proxy = ref(props.account.proxy || '')
const showProxy = ref(!!props.account.proxy)
const loading = ref(false)
const step = ref('')
const errorMsg = ref('')
const successMsg = ref('')

async function handleReAuth() {
  const key = sessionKey.value.trim()
  if (!key) return

  loading.value = true
  errorMsg.value = ''
  successMsg.value = ''

  try {
    step.value = '步骤 1/2：通过 sessionKey 换取 OAuth token…'
    const proxyVal = proxy.value.trim() || null
    const oauthRes = await httpApis.claudeOAuthWithCookieApi({
      sessionKey: key,
      ...(proxyVal ? { proxy: proxyVal } : {})
    })
    if (!oauthRes.success) {
      errorMsg.value = oauthRes.message || 'sessionKey 无效或已过期'
      return
    }

    step.value = '步骤 2/2：更新账号 token…'
    const updateRes = await httpApis.updateClaudeAccountApi(props.account.id, {
      claudeAiOauth: oauthRes.data.claudeAiOauth
    })
    if (!updateRes.success) {
      errorMsg.value = updateRes.message || 'Token 更新失败'
      return
    }

    successMsg.value = '✓ 重新授权成功！Token 已更新。'
    setTimeout(() => emit('success'), 1200)
  } catch (err) {
    const serverMsg = err?.response?.data?.message
    errorMsg.value = serverMsg || err?.message || '请求出错，请重试'
  } finally {
    loading.value = false
    step.value = ''
  }
}
</script>
