<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center">
    <div class="absolute inset-0 bg-black/50 backdrop-blur-sm" @click="$emit('close')" />
    <div
      class="relative z-10 mx-4 w-full max-w-2xl rounded-xl bg-white p-6 shadow-2xl dark:bg-gray-800"
    >
      <!-- Header -->
      <div class="mb-5 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div
            class="flex h-9 w-9 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/40"
          >
            <i class="fas fa-link text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h3 class="text-base font-semibold text-gray-900 dark:text-gray-100">
              {{ account.name || account.email || '账号重新授权' }}
            </h3>
            <p class="text-xs text-gray-500 dark:text-gray-400">Claude OAuth — 手动重新授权</p>
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
          {{ account.errorMessage || '账号授权已失效，请重新授权' }}
        </p>
      </div>

      <!-- Success state -->
      <div
        v-if="successMsg"
        class="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-4 dark:border-green-800/60 dark:bg-green-900/20"
      >
        <p class="text-sm font-medium text-green-700 dark:text-green-400">
          <i class="fas fa-check-circle mr-2" />{{ successMsg }}
        </p>
      </div>

      <!-- OAuth flow -->
      <OAuthFlow
        v-if="!successMsg"
        platform="claude"
        @back="$emit('close')"
        @success="handleOAuthSuccess"
      />

      <!-- Updating overlay -->
      <div
        v-if="updating"
        class="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-white/80 dark:bg-gray-800/80"
      >
        <div class="text-center">
          <i class="fas fa-spinner fa-spin mb-2 text-2xl text-blue-500" />
          <p class="text-sm text-gray-600 dark:text-gray-400">正在更新账号 Token…</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { showToast } from '@/utils/tools'
import OAuthFlow from '@/components/accounts/OAuthFlow.vue'
import * as httpApis from '@/utils/http_apis'

const props = defineProps({
  account: { type: Object, required: true }
})
const emit = defineEmits(['close', 'success'])

const updating = ref(false)
const successMsg = ref('')

async function handleOAuthSuccess(tokenInfo) {
  const claudeAiOauth = tokenInfo?.claudeAiOauth || tokenInfo
  if (!claudeAiOauth) {
    showToast('授权数据无效，请重试', 'error')
    return
  }

  updating.value = true
  try {
    const res = await httpApis.updateClaudeAccountApi(props.account.id, { claudeAiOauth })
    if (res.success) {
      successMsg.value = '重新授权成功！Token 已更新。'
      setTimeout(() => emit('success'), 1200)
    } else {
      showToast(res.message || 'Token 更新失败', 'error')
    }
  } catch (err) {
    showToast(err?.response?.data?.message || err?.message || 'Token 更新失败', 'error')
  } finally {
    updating.value = false
  }
}
</script>
