<template>
  <div class="space-y-5">
    <div class="text-center">
      <div
        class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
      >
        <i class="fas fa-shield-halved text-xl" />
      </div>
      <h2 class="text-xl font-semibold text-gray-900 dark:text-white">{{ title }}</h2>
      <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
        {{ description }}
      </p>
      <p v-if="username" class="mt-1 text-xs uppercase tracking-[0.24em] text-gray-400">
        {{ username }}
      </p>
    </div>

    <div class="grid grid-cols-2 gap-2 rounded-2xl bg-gray-100 p-1 dark:bg-gray-800">
      <button
        :class="mode === 'otp' ? activeTabClass : inactiveTabClass"
        type="button"
        @click="mode = 'otp'"
      >
        验证码
      </button>
      <button
        :class="mode === 'recovery' ? activeTabClass : inactiveTabClass"
        :disabled="!canUseRecoveryCode"
        type="button"
        @click="mode = 'recovery'"
      >
        恢复码
      </button>
    </div>

    <form class="space-y-4" @submit.prevent="submit">
      <div v-if="mode === 'otp'">
        <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
          6 位动态验证码
        </label>
        <input
          v-model.trim="otpCode"
          autocomplete="one-time-code"
          class="w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-center text-lg tracking-[0.45em] text-gray-900 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/15 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
          inputmode="numeric"
          maxlength="6"
          placeholder="123456"
          type="text"
        />
      </div>

      <div v-else>
        <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
          一次性恢复码
        </label>
        <input
          v-model.trim="recoveryCode"
          class="w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-gray-900 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/15 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
          placeholder="输入恢复码"
          type="text"
        />
        <p class="mt-2 text-xs text-gray-500 dark:text-gray-400">
          恢复码仅可使用一次，使用后会立即失效。
        </p>
      </div>

      <div
        v-if="error"
        class="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
      >
        {{ error }}
      </div>

      <div class="flex items-center gap-3">
        <button
          class="flex-1 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          :disabled="loading || !isSubmittable"
          type="submit"
        >
          <i v-if="!loading" class="fas fa-lock-open mr-2" />
          <i v-else class="fas fa-spinner mr-2 animate-spin" />
          {{ loading ? '验证中...' : '完成登录' }}
        </button>
        <button
          class="rounded-2xl border border-gray-300 px-4 py-3 text-sm font-medium text-gray-600 transition hover:border-gray-400 hover:text-gray-900 dark:border-gray-700 dark:text-gray-300 dark:hover:border-gray-500 dark:hover:text-white"
          :disabled="loading"
          type="button"
          @click="$emit('cancel')"
        >
          返回
        </button>
      </div>
    </form>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'

defineProps({
  title: {
    type: String,
    default: '两步验证'
  },
  description: {
    type: String,
    default: '请输入身份验证器中的动态验证码，或改用恢复码完成登录。'
  },
  username: {
    type: String,
    default: ''
  },
  loading: {
    type: Boolean,
    default: false
  },
  error: {
    type: String,
    default: ''
  },
  canUseRecoveryCode: {
    type: Boolean,
    default: true
  }
})

const emit = defineEmits(['submit', 'cancel'])

const mode = ref('otp')
const otpCode = ref('')
const recoveryCode = ref('')

const activeTabClass =
  'rounded-xl bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm dark:bg-gray-900 dark:text-white'
const inactiveTabClass =
  'rounded-xl px-3 py-2 text-sm font-medium text-gray-500 transition hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-40 dark:text-gray-400 dark:hover:text-white'

const isSubmittable = computed(() =>
  mode.value === 'otp' ? /^\d{6}$/.test(otpCode.value) : recoveryCode.value.length > 0
)

const submit = () => {
  emit('submit', {
    otpCode: mode.value === 'otp' ? otpCode.value : undefined,
    recoveryCode: mode.value === 'recovery' ? recoveryCode.value : undefined
  })
}
</script>
