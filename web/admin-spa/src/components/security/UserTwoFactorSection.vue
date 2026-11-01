<template>
  <section
    class="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900"
  >
    <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <p class="text-xs font-semibold uppercase tracking-[0.28em] text-sky-500">
          Account Security
        </p>
        <h3 class="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">两步验证</h3>
        <p class="mt-2 max-w-2xl text-sm text-gray-600 dark:text-gray-400">
          为你的普通用户账号增加 TOTP 二次校验。启用后，登录必须先通过 LDAP，再输入动态码或恢复码。
        </p>
      </div>
      <span
        class="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold"
        :class="status.enabled ? enabledBadgeClass : disabledBadgeClass"
      >
        {{ status.enabled ? '已启用' : '未启用' }}
      </span>
    </div>

    <div v-if="loading" class="mt-6 text-sm text-gray-500 dark:text-gray-400">加载中...</div>

    <div v-else class="mt-6 space-y-6">
      <div
        v-if="error"
        class="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300"
      >
        {{ error }}
      </div>

      <div
        v-if="!status.enabled && !setupData"
        class="rounded-3xl border border-dashed border-gray-300 bg-gray-50 p-5 dark:border-gray-700 dark:bg-gray-950/50"
      >
        <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
          当前 LDAP 密码
        </label>
        <input
          v-model="setupPassword"
          autocomplete="current-password"
          class="w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-gray-900 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-500/15 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
          placeholder="输入当前密码以开始设置"
          type="password"
        />
        <button
          class="mt-4 rounded-2xl bg-sky-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
          :disabled="submitting || !setupPassword"
          type="button"
          @click="startSetup"
        >
          <i v-if="!submitting" class="fas fa-qrcode mr-2" />
          <i v-else class="fas fa-spinner mr-2 animate-spin" />
          {{ submitting ? '创建中...' : '开始设置' }}
        </button>
      </div>

      <div
        v-if="setupData"
        class="grid gap-6 rounded-3xl border border-sky-200 bg-sky-50/40 p-5 dark:border-sky-900/40 dark:bg-sky-950/20 lg:grid-cols-[240px,1fr]"
      >
        <div
          class="flex min-h-[240px] items-center justify-center rounded-3xl bg-white p-4 shadow-sm dark:bg-gray-950"
        >
          <img
            alt="2FA QR Code"
            class="block w-full max-w-[200px]"
            :src="setupData.qrCodeDataUrl"
          />
        </div>

        <div class="space-y-4">
          <div>
            <p class="text-sm font-medium text-gray-900 dark:text-white">1. 扫描二维码</p>
            <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
              使用兼容 TOTP 的身份验证器扫描二维码后，输入当前 6 位验证码完成绑定。
            </p>
          </div>

          <div
            class="rounded-2xl bg-white px-4 py-3 font-mono text-sm text-gray-900 shadow-sm dark:bg-gray-900 dark:text-white"
          >
            {{ setupData.secret }}
          </div>

          <div>
            <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
              再次输入 LDAP 密码
            </label>
            <input
              v-model="enablePassword"
              autocomplete="current-password"
              class="w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-gray-900 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-500/15 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
              type="password"
            />
          </div>

          <div>
            <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
              输入当前 6 位验证码
            </label>
            <input
              v-model.trim="enableOtpCode"
              autocomplete="one-time-code"
              class="w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-center text-lg tracking-[0.4em] text-gray-900 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-500/15 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
              maxlength="6"
              placeholder="123456"
              type="text"
            />
          </div>

          <div class="flex flex-wrap gap-3">
            <button
              class="rounded-2xl bg-sky-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
              :disabled="submitting || !enablePassword || !/^[0-9]{6}$/.test(enableOtpCode)"
              type="button"
              @click="enableTwoFactor"
            >
              <i v-if="!submitting" class="fas fa-shield-halved mr-2" />
              <i v-else class="fas fa-spinner mr-2 animate-spin" />
              {{ submitting ? '启用中...' : '确认启用' }}
            </button>
            <button
              class="rounded-2xl border border-gray-300 px-5 py-3 text-sm font-medium text-gray-700 transition hover:border-gray-400 hover:text-gray-900 dark:border-gray-700 dark:text-gray-300 dark:hover:border-gray-500 dark:hover:text-white"
              :disabled="submitting"
              type="button"
              @click="cancelSetup"
            >
              取消
            </button>
          </div>
        </div>
      </div>

      <div
        v-if="status.enabled"
        class="rounded-3xl border border-gray-200 bg-gray-50 p-5 dark:border-gray-800 dark:bg-gray-950/50"
      >
        <div class="grid gap-4 md:grid-cols-2">
          <div>
            <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
              当前 LDAP 密码
            </label>
            <input
              v-model="managePassword"
              autocomplete="current-password"
              class="w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-gray-900 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-500/15 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
              type="password"
            />
          </div>

          <div>
            <div class="grid grid-cols-2 gap-2 rounded-2xl bg-white p-1 dark:bg-gray-900">
              <button
                :class="manageMode === 'otp' ? activeTabClass : inactiveTabClass"
                type="button"
                @click="manageMode = 'otp'"
              >
                动态码
              </button>
              <button
                :class="manageMode === 'recovery' ? activeTabClass : inactiveTabClass"
                type="button"
                @click="manageMode = 'recovery'"
              >
                恢复码
              </button>
            </div>

            <input
              v-if="manageMode === 'otp'"
              v-model.trim="manageOtpCode"
              autocomplete="one-time-code"
              class="mt-3 w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-center text-lg tracking-[0.4em] text-gray-900 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-500/15 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
              maxlength="6"
              placeholder="123456"
              type="text"
            />
            <input
              v-else
              v-model.trim="manageRecoveryCode"
              class="mt-3 w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-gray-900 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-500/15 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
              placeholder="输入恢复码"
              type="text"
            />
          </div>
        </div>

        <p class="mt-4 text-xs text-gray-500 dark:text-gray-400">
          启用时间: {{ formatDateTime(status.enabledAt) || '未知' }}
        </p>

        <div class="mt-5 flex flex-wrap gap-3">
          <button
            class="rounded-2xl bg-red-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
            :disabled="submitting || !canSubmitManageAction"
            type="button"
            @click="disableTwoFactor"
          >
            关闭两步验证
          </button>
          <button
            class="rounded-2xl bg-gray-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200"
            :disabled="submitting || !canSubmitManageAction"
            type="button"
            @click="regenerateRecoveryCodes"
          >
            重生恢复码
          </button>
        </div>
      </div>
    </div>

    <RecoveryCodesModal
      :recovery-codes="recoveryCodes"
      :show="showRecoveryCodes"
      @acknowledge="acknowledgeRecoveryCodes"
      @close="acknowledgeRecoveryCodes"
    />
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { showToast } from '@/utils/tools'
import RecoveryCodesModal from '@/components/security/RecoveryCodesModal.vue'

const router = useRouter()
const userStore = useUserStore()

const loading = ref(true)
const submitting = ref(false)
const error = ref('')
const status = ref({ enabled: false })
const setupData = ref(null)
const setupPassword = ref('')
const enablePassword = ref('')
const enableOtpCode = ref('')
const managePassword = ref('')
const manageMode = ref('otp')
const manageOtpCode = ref('')
const manageRecoveryCode = ref('')
const recoveryCodes = ref([])
const showRecoveryCodes = ref(false)

const enabledBadgeClass = 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200'
const disabledBadgeClass = 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
const activeTabClass = 'rounded-xl bg-sky-600 px-3 py-2 text-sm font-semibold text-white'
const inactiveTabClass =
  'rounded-xl px-3 py-2 text-sm font-medium text-gray-500 transition hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'

const canSubmitManageAction = computed(() => {
  if (!managePassword.value) {
    return false
  }

  return manageMode.value === 'otp'
    ? /^[0-9]{6}$/.test(manageOtpCode.value)
    : manageRecoveryCode.value.length > 0
})

const formatDateTime = (value) => {
  if (!value) {
    return ''
  }

  return new Date(value).toLocaleString()
}

const resetManageFields = () => {
  managePassword.value = ''
  manageOtpCode.value = ''
  manageRecoveryCode.value = ''
}

const redirectToLogin = async (message) => {
  showToast(message, 'success')
  await userStore.logout()
  await router.push('/user-login')
}

const loadStatus = async () => {
  loading.value = true
  error.value = ''

  try {
    status.value = await userStore.getTwoFactorStatus()
  } catch (requestError) {
    error.value = requestError.response?.data?.message || requestError.message || '加载状态失败'
  } finally {
    loading.value = false
  }
}

const startSetup = async () => {
  submitting.value = true
  error.value = ''

  try {
    setupData.value = await userStore.createTwoFactorSetup(setupPassword.value)
    enablePassword.value = setupPassword.value
    showToast('请扫描二维码并输入当前验证码完成绑定', 'success')
  } catch (requestError) {
    error.value =
      requestError.response?.data?.message || requestError.message || '创建两步验证设置失败'
  } finally {
    submitting.value = false
  }
}

const cancelSetup = () => {
  setupData.value = null
  enablePassword.value = ''
  enableOtpCode.value = ''
}

const enableTwoFactor = async () => {
  submitting.value = true
  error.value = ''

  try {
    const result = await userStore.enableTwoFactor({
      currentPassword: enablePassword.value,
      setupToken: setupData.value?.setupToken,
      otpCode: enableOtpCode.value
    })

    setupData.value = null
    setupPassword.value = ''
    enablePassword.value = ''
    enableOtpCode.value = ''
    recoveryCodes.value = result.recoveryCodes || []
    showRecoveryCodes.value = true
    await loadStatus()
    showToast('两步验证已启用，请先保存恢复码', 'success')
  } catch (requestError) {
    error.value = requestError.response?.data?.message || requestError.message || '启用失败'
  } finally {
    submitting.value = false
  }
}

const disableTwoFactor = async () => {
  submitting.value = true
  error.value = ''

  try {
    await userStore.disableTwoFactor({
      currentPassword: managePassword.value,
      otpCode: manageMode.value === 'otp' ? manageOtpCode.value : undefined,
      recoveryCode: manageMode.value === 'recovery' ? manageRecoveryCode.value : undefined
    })

    await redirectToLogin('两步验证已关闭，请重新登录')
  } catch (requestError) {
    error.value = requestError.response?.data?.message || requestError.message || '关闭失败'
    submitting.value = false
  }
}

const regenerateRecoveryCodes = async () => {
  submitting.value = true
  error.value = ''

  try {
    const result = await userStore.regenerateRecoveryCodes({
      currentPassword: managePassword.value,
      otpCode: manageMode.value === 'otp' ? manageOtpCode.value : undefined,
      recoveryCode: manageMode.value === 'recovery' ? manageRecoveryCode.value : undefined
    })

    recoveryCodes.value = result.recoveryCodes || []
    showRecoveryCodes.value = true
    resetManageFields()
    await loadStatus()
  } catch (requestError) {
    error.value = requestError.response?.data?.message || requestError.message || '恢复码重生失败'
    submitting.value = false
  }
}

const acknowledgeRecoveryCodes = async () => {
  showRecoveryCodes.value = false
  resetManageFields()
}

onMounted(loadStatus)
</script>
