<template>
  <Teleport to="body">
    <div v-if="show" class="modal fixed inset-0 z-50 flex items-center justify-center p-4">
      <!-- 背景遮罩 -->
      <div
        class="fixed inset-0 bg-gray-900 bg-opacity-50 backdrop-blur-sm"
        @click="!updating && $emit('close')"
      />

      <!-- 模态框内容 -->
      <div class="modal-content relative mx-auto max-h-[90vh] w-full max-w-2xl overflow-y-auto p-8">
        <!-- 头部 -->
        <div class="mb-6 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div
              class="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600"
            >
              <i class="fas fa-key text-white" />
            </div>
            <div>
              <h3 class="text-xl font-bold text-gray-900 dark:text-gray-100">重新授权</h3>
              <p class="text-sm text-gray-600 dark:text-gray-400">
                为 "{{ account?.name || 'Account' }}" 获取新的 OAuth 令牌（保留账户与绑定）
              </p>
            </div>
          </div>
          <button
            class="text-gray-400 transition-colors hover:text-gray-600 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-500 dark:hover:text-gray-300"
            :disabled="updating"
            @click="$emit('close')"
          >
            <i class="fas fa-times text-xl" />
          </button>
        </div>

        <div class="space-y-5">
          <!-- 说明 -->
          <div
            class="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800 dark:border-blue-700 dark:bg-blue-900/30 dark:text-blue-200"
          >
            <i class="fas fa-info-circle mr-1" />
            重新授权会用新令牌替换当前账户的 Access/Refresh Token，账户
            ID、绑定、统计与调度状态保持不变。请使用与该账户对应的 Anthropic
            账号完成授权，授权后该账户将持有独立的刷新令牌。
          </div>

          <!-- 授权方式 -->
          <div>
            <label class="mb-2 block text-sm font-semibold text-gray-700 dark:text-gray-300"
              >授权方式</label
            >
            <div class="flex gap-4">
              <label class="flex cursor-pointer items-center gap-2">
                <input
                  v-model="method"
                  class="text-blue-600 focus:ring-blue-500"
                  :disabled="updating"
                  name="reauth-method"
                  type="radio"
                  value="oauth"
                />
                <span class="text-sm text-gray-800 dark:text-gray-200">标准 OAuth</span>
              </label>
              <label class="flex cursor-pointer items-center gap-2">
                <input
                  v-model="method"
                  class="text-blue-600 focus:ring-blue-500"
                  :disabled="updating"
                  name="reauth-method"
                  type="radio"
                  value="setup-token"
                />
                <span class="text-sm text-gray-800 dark:text-gray-200">Setup Token</span>
              </label>
            </div>
          </div>

          <!-- 标准 OAuth：复用 OAuthFlow -->
          <OAuthFlow
            v-if="method === 'oauth'"
            platform="claude"
            :proxy="proxyForFlow"
            @back="$emit('close')"
            @success="onTokenInfo"
          />

          <!-- Setup Token：紧凑授权流程 -->
          <div v-else class="space-y-4">
            <div
              class="rounded-lg border border-blue-200 bg-blue-50 p-6 dark:border-blue-700 dark:bg-blue-900/30"
            >
              <div class="flex items-start gap-4">
                <div
                  class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-blue-500"
                >
                  <i class="fas fa-key text-white" />
                </div>
                <div class="min-w-0 flex-1">
                  <h4 class="mb-3 font-semibold text-blue-900 dark:text-blue-200">
                    Claude Setup Token 授权
                  </h4>

                  <!-- 第一步：生成链接 -->
                  <button
                    v-if="!setupAuthUrl"
                    class="btn btn-primary px-4 py-2 text-sm"
                    :disabled="setupGenerating"
                    @click="generateSetupUrl"
                  >
                    <div v-if="setupGenerating" class="loading-spinner mr-2" />
                    <i v-else class="fas fa-link mr-2" />
                    {{ setupGenerating ? '生成中...' : '生成授权链接' }}
                  </button>

                  <!-- 第二步：打开链接 + 粘贴授权码 -->
                  <div v-else class="space-y-3">
                    <div>
                      <label class="mb-1 block text-xs font-medium text-blue-800 dark:text-blue-300"
                        >1. 打开授权链接并登录授权</label
                      >
                      <div class="flex items-center gap-2">
                        <a
                          class="btn btn-primary px-3 py-1.5 text-xs"
                          :href="setupAuthUrl"
                          rel="noopener noreferrer"
                          target="_blank"
                        >
                          <i class="fas fa-external-link-alt mr-1" />打开授权页面
                        </a>
                        <button
                          class="rounded bg-blue-100 px-3 py-1.5 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-200 dark:bg-blue-800/50 dark:text-blue-200 dark:hover:bg-blue-700"
                          @click="copyAuthUrl"
                        >
                          <i class="fas fa-copy mr-1" />复制链接
                        </button>
                        <button
                          class="rounded px-3 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                          @click="resetSetup"
                        >
                          重新生成
                        </button>
                      </div>
                    </div>
                    <div>
                      <label class="mb-1 block text-xs font-medium text-blue-800 dark:text-blue-300"
                        >2. 粘贴授权完成后得到的 Authorization Code</label
                      >
                      <textarea
                        v-model="setupCode"
                        class="form-input w-full border-gray-300 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
                        :disabled="setupExchanging"
                        placeholder="粘贴 Authorization Code 或完整回调 URL"
                        rows="2"
                      />
                    </div>
                    <button
                      class="btn btn-primary px-4 py-2 text-sm"
                      :disabled="setupExchanging || !setupCode.trim()"
                      @click="submitSetupCode"
                    >
                      <div v-if="setupExchanging" class="loading-spinner mr-2" />
                      <i v-else class="fas fa-check mr-2" />
                      {{ setupExchanging ? '提交中...' : '提交并重新授权' }}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 更新中遮罩 -->
        <div
          v-if="updating"
          class="absolute inset-0 flex items-center justify-center rounded-2xl bg-white/70 dark:bg-gray-900/70"
        >
          <div class="flex items-center gap-3 text-gray-700 dark:text-gray-200">
            <div class="loading-spinner-dark" />
            <span class="text-sm font-medium">正在写入账户...</span>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { showToast } from '@/utils/tools'
import { useAccountsStore } from '@/stores/accounts'
import OAuthFlow from './OAuthFlow.vue'

const props = defineProps({
  show: {
    type: Boolean,
    default: false
  },
  account: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['close', 'success'])

const accountsStore = useAccountsStore()

const method = ref('oauth')
const updating = ref(false)

// Setup Token 子流程状态
const setupGenerating = ref(false)
const setupExchanging = ref(false)
const setupAuthUrl = ref('')
const setupSessionId = ref('')
const setupCode = ref('')

// 把账户已有代理透传给授权流程（OAuthFlow / 生成链接均通过该代理出网）
const proxyForFlow = computed(() =>
  props.account?.proxy ? { enabled: true, ...props.account.proxy } : null
)

const resetSetup = () => {
  setupGenerating.value = false
  setupExchanging.value = false
  setupAuthUrl.value = ''
  setupSessionId.value = ''
  setupCode.value = ''
}

watch(
  () => props.show,
  (val) => {
    if (val) {
      method.value = props.account?.authType === 'setup-token' ? 'setup-token' : 'oauth'
      updating.value = false
      resetSetup()
    }
  }
)

watch(method, () => resetSetup())

const generateSetupUrl = async () => {
  setupGenerating.value = true
  try {
    const res = await accountsStore.generateClaudeSetupTokenUrl(proxyForFlow.value)
    if (res?.authUrl) {
      setupAuthUrl.value = res.authUrl
      setupSessionId.value = res.sessionId
    } else {
      showToast(accountsStore.error || '生成授权链接失败', 'error')
    }
  } catch (error) {
    showToast(error.message || '生成授权链接失败', 'error')
  } finally {
    setupGenerating.value = false
  }
}

const submitSetupCode = async () => {
  if (!setupCode.value.trim()) {
    showToast('请填写授权码', 'error')
    return
  }
  setupExchanging.value = true
  try {
    const tokenInfo = await accountsStore.exchangeClaudeSetupTokenCode({
      sessionId: setupSessionId.value,
      callbackUrl: setupCode.value.trim()
    })
    if (tokenInfo) {
      await onTokenInfo(tokenInfo)
    } else {
      showToast(accountsStore.error || '兑换失败，请检查授权码是否正确', 'error')
    }
  } catch (error) {
    showToast(error.message || '兑换失败，请检查授权码是否正确', 'error')
  } finally {
    setupExchanging.value = false
  }
}

const onTokenInfo = async (tokenInfo) => {
  const claudeAiOauth = tokenInfo?.claudeAiOauth || tokenInfo
  if (!claudeAiOauth || !claudeAiOauth.accessToken) {
    showToast('未获取到有效的授权信息', 'error')
    return
  }
  updating.value = true
  try {
    const res = await accountsStore.updateClaudeAccount(props.account.id, { claudeAiOauth })
    if (res && res.success !== false) {
      showToast('重新授权成功', 'success')
      emit('success')
      emit('close')
    } else {
      showToast((res && res.message) || '更新账户失败', 'error')
    }
  } catch (error) {
    showToast(error.message || '更新账户失败', 'error')
  } finally {
    updating.value = false
  }
}

const copyAuthUrl = async () => {
  try {
    await navigator.clipboard.writeText(setupAuthUrl.value)
    showToast('已复制授权链接', 'success')
  } catch {
    showToast('复制失败，请手动复制', 'error')
  }
}
</script>

<style scoped>
.loading-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top: 2px solid white;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  display: inline-block;
}

.loading-spinner-dark {
  width: 20px;
  height: 20px;
  border: 2px solid rgba(59, 130, 246, 0.25);
  border-top: 2px solid rgb(59, 130, 246);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  display: inline-block;
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}
</style>
