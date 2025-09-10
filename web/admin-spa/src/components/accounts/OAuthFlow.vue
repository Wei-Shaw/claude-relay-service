<template>
  <div class="space-y-6">
    <!-- Claude OAuth流程 -->
    <div v-if="platform === 'claude'">
      <div
        class="rounded-lg border border-blue-200 bg-blue-50 p-6 dark:border-blue-700 dark:bg-blue-900/30"
      >
        <div class="flex items-start gap-4">
          <div
            class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-blue-500"
          >
            <i class="fas fa-link text-white" />
          </div>
          <div class="flex-1">
            <h4 class="mb-3 font-semibold text-blue-900 dark:text-blue-200">
              {{ t('oauthFlow.claudeAccountAuth') }}
            </h4>
            <p class="mb-4 text-sm text-blue-800 dark:text-blue-300">
              {{ t('oauthFlow.claudeAuthDescription') }}
            </p>

            <div class="space-y-4">
              <!-- 步骤1: 生成授权链接 -->
              <div
                class="rounded-lg border border-blue-300 bg-white/80 p-4 dark:border-blue-600 dark:bg-gray-800/80"
              >
                <div class="flex items-start gap-3">
                  <div
                    class="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white"
                  >
                    1
                  </div>
                  <div class="flex-1">
                    <p class="mb-2 font-medium text-blue-900 dark:text-blue-200">
                      {{ t('oauthFlow.step1Title') }}
                    </p>
                    <button
                      v-if="!authUrl"
                      class="btn btn-primary px-4 py-2 text-sm"
                      :disabled="loading"
                      @click="generateAuthUrl"
                    >
                      <i v-if="!loading" class="fas fa-link mr-2" />
                      <div v-else class="loading-spinner mr-2" />
                      {{ loading ? t('oauthFlow.generating') : t('oauthFlow.generateAuthLink') }}
                    </button>
                    <div v-else class="space-y-3">
                      <div class="flex items-center gap-2">
                        <input
                          class="form-input flex-1 bg-gray-50 font-mono text-xs dark:bg-gray-700"
                          readonly
                          type="text"
                          :value="authUrl"
                        />
                        <button
                          class="rounded-lg bg-gray-100 px-3 py-2 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600"
                          :title="t('oauthFlow.copyLinkTooltip')"
                          @click="copyAuthUrl"
                        >
                          <i :class="copied ? 'fas fa-check text-green-500' : 'fas fa-copy'" />
                        </button>
                      </div>
                      <button
                        class="text-xs text-blue-600 hover:text-blue-700"
                        @click="regenerateAuthUrl"
                      >
                        <i class="fas fa-sync-alt mr-1" />{{ t('oauthFlow.regenerate') }}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <!-- 步骤2: 访问链接并授权 -->
              <div
                class="rounded-lg border border-blue-300 bg-white/80 p-4 dark:border-blue-600 dark:bg-gray-800/80"
              >
                <div class="flex items-start gap-3">
                  <div
                    class="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white"
                  >
                    2
                  </div>
                  <div class="flex-1">
                    <p class="mb-2 font-medium text-blue-900 dark:text-blue-200">
                      {{ t('oauthFlow.step2Title') }}
                    </p>
                    <p class="mb-2 text-sm text-blue-700 dark:text-blue-300">
                      {{ t('oauthFlow.step2Description') }}
                    </p>
                    <div
                      class="rounded border border-yellow-300 bg-yellow-50 p-3 dark:border-yellow-700 dark:bg-yellow-900/30"
                    >
                      <p class="text-xs text-yellow-800 dark:text-yellow-300">
                        <i class="fas fa-exclamation-triangle mr-1" />
                        <strong>{{ t('oauthFlow.proxyNotice') }}</strong
                        >{{ t('oauthFlow.proxyNoticeText') }}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <!-- 步骤3: 输入授权码 -->
              <div
                class="rounded-lg border border-blue-300 bg-white/80 p-4 dark:border-blue-600 dark:bg-gray-800/80"
              >
                <div class="flex items-start gap-3">
                  <div
                    class="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white"
                  >
                    3
                  </div>
                  <div class="flex-1">
                    <p class="mb-2 font-medium text-blue-900 dark:text-blue-200">
                      {{ t('oauthFlow.step3Title') }}
                    </p>
                    <p class="mb-3 text-sm text-blue-700 dark:text-blue-300">
                      {{ t('oauthFlow.step3Description') }}
                      <strong>{{ t('oauthFlow.authorizationCode') }}</strong
                      >{{ t('oauthFlow.step3DescriptionMiddle') }}
                    </p>
                    <div class="space-y-3">
                      <div>
                        <label
                          class="mb-2 block text-sm font-semibold text-gray-700 dark:text-gray-300"
                        >
                          <i class="fas fa-key mr-2 text-blue-500" />{{
                            t('oauthFlow.authorizationCode')
                          }}
                        </label>
                        <textarea
                          v-model="authCode"
                          class="form-input w-full resize-none font-mono text-sm"
                          :placeholder="t('oauthFlow.authCodePlaceholder')"
                          rows="3"
                        />
                      </div>
                      <p class="mt-2 text-xs text-gray-500 dark:text-gray-400">
                        <i class="fas fa-info-circle mr-1" />
                        {{ t('oauthFlow.authCodeHint') }}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Gemini OAuth流程 -->
    <div v-else-if="platform === 'gemini'">
      <div
        class="rounded-lg border border-green-200 bg-green-50 p-6 dark:border-green-700 dark:bg-green-900/30"
      >
        <div class="flex items-start gap-4">
          <div
            class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-green-500"
          >
            <i class="fas fa-robot text-white" />
          </div>
          <div class="flex-1">
            <h4 class="mb-3 font-semibold text-green-900 dark:text-green-200">
              {{ t('oauthFlow.geminiAccountAuth') }}
            </h4>
            <p class="mb-4 text-sm text-green-800 dark:text-green-300">
              {{ t('oauthFlow.geminiAuthDescription') }}
            </p>

            <div class="space-y-4">
              <!-- 步骤1: 生成授权链接 -->
              <div
                class="rounded-lg border border-green-300 bg-white/80 p-4 dark:border-green-600 dark:bg-gray-800/80"
              >
                <div class="flex items-start gap-3">
                  <div
                    class="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-green-600 text-xs font-bold text-white"
                  >
                    1
                  </div>
                  <div class="flex-1">
                    <p class="mb-2 font-medium text-green-900 dark:text-green-200">
                      {{ t('oauthFlow.step1Title') }}
                    </p>
                    <button
                      v-if="!authUrl"
                      class="btn btn-primary px-4 py-2 text-sm"
                      :disabled="loading"
                      @click="generateAuthUrl"
                    >
                      <i v-if="!loading" class="fas fa-link mr-2" />
                      <div v-else class="loading-spinner mr-2" />
                      {{ loading ? t('oauthFlow.generating') : t('oauthFlow.generateAuthLink') }}
                    </button>
                    <div v-else class="space-y-3">
                      <div class="flex items-center gap-2">
                        <input
                          class="form-input flex-1 bg-gray-50 font-mono text-xs dark:bg-gray-700"
                          readonly
                          type="text"
                          :value="authUrl"
                        />
                        <button
                          class="rounded-lg bg-gray-100 px-3 py-2 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600"
                          :title="t('oauthFlow.copyLinkTooltip')"
                          @click="copyAuthUrl"
                        >
                          <i :class="copied ? 'fas fa-check text-green-500' : 'fas fa-copy'" />
                        </button>
                      </div>
                      <button
                        class="text-xs text-green-600 hover:text-green-700"
                        @click="regenerateAuthUrl"
                      >
                        <i class="fas fa-sync-alt mr-1" />{{ t('oauthFlow.regenerate') }}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <!-- 步骤2: 操作说明 -->
              <div
                class="rounded-lg border border-green-300 bg-white/80 p-4 dark:border-green-600 dark:bg-gray-800/80"
              >
                <div class="flex items-start gap-3">
                  <div
                    class="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-green-600 text-xs font-bold text-white"
                  >
                    2
                  </div>
                  <div class="flex-1">
                    <p class="mb-2 font-medium text-green-900 dark:text-green-200">
                      {{ t('oauthFlow.step2Title') }}
                    </p>
                    <p class="mb-2 text-sm text-green-700 dark:text-green-300">
                      {{ t('oauthFlow.step2DescriptionGemini') }}
                    </p>
                    <div
                      class="rounded border border-yellow-300 bg-yellow-50 p-3 dark:border-yellow-700 dark:bg-yellow-900/30"
                    >
                      <p class="text-xs text-yellow-800 dark:text-yellow-300">
                        <i class="fas fa-exclamation-triangle mr-1" />
                        <strong>{{ t('oauthFlow.proxyNotice') }}</strong
                        >{{ t('oauthFlow.proxyNoticeText') }}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <!-- 步骤3: 输入授权码 -->
              <div
                class="rounded-lg border border-green-300 bg-white/80 p-4 dark:border-green-600 dark:bg-gray-800/80"
              >
                <div class="flex items-start gap-3">
                  <div
                    class="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-green-600 text-xs font-bold text-white"
                  >
                    3
                  </div>
                  <div class="flex-1">
                    <p class="mb-2 font-medium text-green-900 dark:text-green-200">
                      {{ t('oauthFlow.step3Title') }}
                    </p>
                    <p class="mb-3 text-sm text-green-700 dark:text-green-300">
                      {{ t('oauthFlow.step3DescriptionGemini') }}
                    </p>
                    <div class="space-y-3">
                      <div>
                        <label
                          class="mb-2 block text-sm font-semibold text-gray-700 dark:text-gray-300"
                        >
                          <i class="fas fa-key mr-2 text-green-500" />{{
                            t('oauthFlow.authorizationCode')
                          }}
                        </label>
                        <textarea
                          v-model="authCode"
                          class="form-input w-full resize-none font-mono text-sm"
                          :placeholder="t('oauthFlow.authCodePlaceholderGemini')"
                          rows="3"
                        />
                      </div>
                      <div class="mt-2 space-y-1">
                        <p class="text-xs text-gray-600 dark:text-gray-400">
                          <i class="fas fa-check-circle mr-1 text-green-500" />
                          {{ t('oauthFlow.authCodeHintGemini') }}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- OpenAI OAuth流程 -->
    <div v-else-if="platform === 'openai'">
      <div
        class="rounded-lg border border-orange-200 bg-orange-50 p-6 dark:border-orange-700 dark:bg-orange-900/30"
      >
        <div class="flex items-start gap-4">
          <div
            class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-orange-500"
          >
            <i class="fas fa-brain text-white" />
          </div>
          <div class="flex-1">
            <h4 class="mb-3 font-semibold text-orange-900 dark:text-orange-200">
              {{ t('oauthFlow.openaiAccountAuth') }}
            </h4>
            <p class="mb-4 text-sm text-orange-800 dark:text-orange-300">
              {{ t('oauthFlow.openaiAuthDescription') }}
            </p>

            <div class="space-y-4">
              <!-- 步骤1: 生成授权链接 -->
              <div
                class="rounded-lg border border-orange-300 bg-white/80 p-4 dark:border-orange-600 dark:bg-gray-800/80"
              >
                <div class="flex items-start gap-3">
                  <div
                    class="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-orange-600 text-xs font-bold text-white"
                  >
                    1
                  </div>
                  <div class="flex-1">
                    <p class="mb-2 font-medium text-orange-900 dark:text-orange-200">
                      {{ t('oauthFlow.step1Title') }}
                    </p>
                    <button
                      v-if="!authUrl"
                      class="btn btn-primary px-4 py-2 text-sm"
                      :disabled="loading"
                      @click="generateAuthUrl"
                    >
                      <i v-if="!loading" class="fas fa-link mr-2" />
                      <div v-else class="loading-spinner mr-2" />
                      {{ loading ? t('oauthFlow.generating') : t('oauthFlow.generateAuthLink') }}
                    </button>
                    <div v-else class="space-y-3">
                      <div class="flex items-center gap-2">
                        <input
                          class="form-input flex-1 bg-gray-50 font-mono text-xs dark:bg-gray-700"
                          readonly
                          type="text"
                          :value="authUrl"
                        />
                        <button
                          class="rounded-lg bg-gray-100 px-3 py-2 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600"
                          :title="t('oauthFlow.copyLinkTooltip')"
                          @click="copyAuthUrl"
                        >
                          <i :class="copied ? 'fas fa-check text-green-500' : 'fas fa-copy'" />
                        </button>
                      </div>
                      <button
                        class="text-xs text-orange-600 hover:text-orange-700"
                        @click="regenerateAuthUrl"
                      >
                        <i class="fas fa-sync-alt mr-1" />{{ t('oauthFlow.regenerate') }}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <!-- 步骤2: 访问链接并授权 -->
              <div
                class="rounded-lg border border-orange-300 bg-white/80 p-4 dark:border-orange-600 dark:bg-gray-800/80"
              >
                <div class="flex items-start gap-3">
                  <div
                    class="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-orange-600 text-xs font-bold text-white"
                  >
                    2
                  </div>
                  <div class="flex-1">
                    <p class="mb-2 font-medium text-orange-900 dark:text-orange-200">
                      {{ t('oauthFlow.step2Title') }}
                    </p>
                    <p class="mb-2 text-sm text-orange-700 dark:text-orange-300">
                      {{ t('oauthFlow.step2DescriptionOpenAI') }}
                    </p>
                    <div
                      class="mb-3 rounded border border-amber-300 bg-amber-50 p-3 dark:border-amber-700 dark:bg-amber-900/30"
                    >
                      <p class="text-xs text-amber-800 dark:text-amber-300">
                        <i class="fas fa-clock mr-1" />
                        <strong>{{ t('oauthFlow.openaiImportantNote') }}</strong
                        >{{ t('oauthFlow.openaiLoadingNote') }}
                      </p>
                      <p class="mt-2 text-xs text-amber-700 dark:text-amber-400">
                        {{ t('oauthFlow.openaiAddressNote') }}
                        <strong class="font-mono">http://localhost:1455/...</strong>
                        {{ t('oauthFlow.openaiAddressNoteMiddle') }}
                      </p>
                    </div>
                    <div
                      class="rounded border border-yellow-300 bg-yellow-50 p-3 dark:border-yellow-700 dark:bg-yellow-900/30"
                    >
                      <p class="text-xs text-yellow-800 dark:text-yellow-300">
                        <i class="fas fa-exclamation-triangle mr-1" />
                        <strong>{{ t('oauthFlow.proxyNotice') }}</strong
                        >{{ t('oauthFlow.proxyNoticeText') }}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <!-- 步骤3: 输入授权码 -->
              <div
                class="rounded-lg border border-orange-300 bg-white/80 p-4 dark:border-orange-600 dark:bg-gray-800/80"
              >
                <div class="flex items-start gap-3">
                  <div
                    class="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-orange-600 text-xs font-bold text-white"
                  >
                    3
                  </div>
                  <div class="flex-1">
                    <p class="mb-2 font-medium text-orange-900 dark:text-orange-200">
                      {{ t('oauthFlow.step3TitleOpenAI') }}
                    </p>
                    <p class="mb-3 text-sm text-orange-700 dark:text-orange-300">
                      {{ t('oauthFlow.step3DescriptionOpenAI') }}
                      <strong class="font-mono">http://localhost:1455/...</strong>
                      {{ t('oauthFlow.step3DescriptionOpenAIMiddle') }}
                    </p>
                    <div class="space-y-3">
                      <div>
                        <label
                          class="mb-2 block text-sm font-semibold text-gray-700 dark:text-gray-300"
                        >
                          <i class="fas fa-link mr-2 text-orange-500" />{{
                            t('oauthFlow.authLinkOrCode')
                          }}
                        </label>
                        <textarea
                          v-model="authCode"
                          class="form-input w-full resize-none font-mono text-sm"
                          :placeholder="t('oauthFlow.authCodePlaceholderOpenAI')"
                          rows="3"
                        />
                      </div>
                      <div
                        class="rounded border border-blue-300 bg-blue-50 p-2 dark:border-blue-700 dark:bg-blue-900/30"
                      >
                        <p class="text-xs text-blue-700 dark:text-blue-300">
                          <i class="fas fa-lightbulb mr-1" />
                          <strong>{{ t('oauthFlow.openaiTip') }}</strong
                          >{{ t('oauthFlow.openaiTipText') }}
                        </p>
                        <p class="mt-1 text-xs text-blue-600 dark:text-blue-400">
                          {{ t('oauthFlow.openaiLinkExample')
                          }}<span class="font-mono"
                            >http://localhost:1455/auth/callback?code=ac_4hm8...</span
                          >
                        </p>
                        <p class="text-xs text-blue-600">
                          {{ t('oauthFlow.openaiCodeExample')
                          }}<span class="font-mono">ac_4hm8iqmx9A2fzMy_cwye7U3W7...</span>
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="flex gap-3 pt-4">
      <button
        class="flex-1 rounded-xl bg-gray-100 px-6 py-3 font-semibold text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
        type="button"
        @click="$emit('back')"
      >
        {{ t('oauthFlow.previousStep') }}
      </button>
      <button
        class="btn btn-primary flex-1 px-6 py-3 font-semibold"
        :disabled="!canExchange || exchanging"
        type="button"
        @click="exchangeCode"
      >
        <div v-if="exchanging" class="loading-spinner mr-2" />
        {{ exchanging ? t('oauthFlow.verifying') : t('oauthFlow.completeAuth') }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { showToast } from '@/utils/toast'
import { useAccountsStore } from '@/stores/accounts'

const { t } = useI18n()

const props = defineProps({
  platform: {
    type: String,
    required: true
  },
  proxy: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['success', 'back'])

const accountsStore = useAccountsStore()

// 状态
const loading = ref(false)
const exchanging = ref(false)
const authUrl = ref('')
const authCode = ref('')
const copied = ref(false)
const sessionId = ref('') // 保存sessionId用于后续交换

// 计算是否可以交换code
const canExchange = computed(() => {
  return authUrl.value && authCode.value.trim()
})

// 监听授权码输入，自动提取URL中的code参数
watch(authCode, (newValue) => {
  if (!newValue || typeof newValue !== 'string') return

  const trimmedValue = newValue.trim()

  // 如果内容为空，不处理
  if (!trimmedValue) return

  // 检查是否是 URL 格式（包含 http:// 或 https://）
  const isUrl = trimmedValue.startsWith('http://') || trimmedValue.startsWith('https://')

  // 如果是 URL 格式
  if (isUrl) {
    // 检查是否是正确的 localhost 回调 URL
    if (
      trimmedValue.startsWith('http://localhost:45462') ||
      trimmedValue.startsWith('http://localhost:1455')
    ) {
      try {
        const url = new URL(trimmedValue)
        const code = url.searchParams.get('code')

        if (code) {
          // 成功提取授权码
          authCode.value = code
          showToast(t('oauthFlow.successExtractCode'), 'success')
          console.log('Successfully extracted authorization code from URL')
        } else {
          // URL 中没有 code 参数
          showToast(t('oauthFlow.errorCodeNotFound'), 'error')
        }
      } catch (error) {
        // URL 解析失败
        console.error('Failed to parse URL:', error)
        showToast(t('oauthFlow.errorLinkFormat'), 'error')
      }
    } else if (props.platform === 'gemini' || props.platform === 'openai') {
      // Gemini 和 OpenAI 平台可能使用不同的回调URL
      // 尝试从任何URL中提取code参数
      try {
        const url = new URL(trimmedValue)
        const code = url.searchParams.get('code')

        if (code) {
          authCode.value = code
          showToast(t('oauthFlow.successExtractCode'), 'success')
        }
      } catch (error) {
        // 不是有效的URL，保持原值
      }
    } else {
      // 错误的 URL（不是正确的 localhost 回调地址）
      showToast(t('oauthFlow.errorWrongUrlFormat'), 'error')
    }
  }
  // 如果不是 URL，保持原值（兼容直接输入授权码）
})

// 生成授权URL
const generateAuthUrl = async () => {
  loading.value = true
  try {
    const proxyConfig = props.proxy?.enabled
      ? {
          proxy: {
            type: props.proxy.type,
            host: props.proxy.host,
            port: parseInt(props.proxy.port),
            username: props.proxy.username || null,
            password: props.proxy.password || null
          }
        }
      : {}

    if (props.platform === 'claude') {
      const result = await accountsStore.generateClaudeAuthUrl(proxyConfig)
      authUrl.value = result.authUrl
      sessionId.value = result.sessionId
    } else if (props.platform === 'gemini') {
      const result = await accountsStore.generateGeminiAuthUrl(proxyConfig)
      authUrl.value = result.authUrl
      sessionId.value = result.sessionId
    } else if (props.platform === 'openai') {
      const result = await accountsStore.generateOpenAIAuthUrl(proxyConfig)
      authUrl.value = result.authUrl
      sessionId.value = result.sessionId
    }
  } catch (error) {
    showToast(error.message || t('oauthFlow.generateAuthFailed'), 'error')
  } finally {
    loading.value = false
  }
}

// 重新生成授权URL
const regenerateAuthUrl = () => {
  authUrl.value = ''
  authCode.value = ''
  generateAuthUrl()
}

// 复制授权URL
const copyAuthUrl = async () => {
  try {
    await navigator.clipboard.writeText(authUrl.value)
    copied.value = true
    showToast(t('oauthFlow.linkCopied'), 'success')
    setTimeout(() => {
      copied.value = false
    }, 2000)
  } catch (error) {
    // 降级方案
    const input = document.createElement('input')
    input.value = authUrl.value
    document.body.appendChild(input)
    input.select()
    document.execCommand('copy')
    document.body.removeChild(input)
    copied.value = true
    showToast(t('oauthFlow.linkCopied'), 'success')
    setTimeout(() => {
      copied.value = false
    }, 2000)
  }
}

// 交换授权码
const exchangeCode = async () => {
  if (!canExchange.value) return

  exchanging.value = true
  try {
    let data = {}

    if (props.platform === 'claude') {
      // Claude使用sessionId和callbackUrl（即授权码）
      data = {
        sessionId: sessionId.value,
        callbackUrl: authCode.value.trim()
      }
    } else if (props.platform === 'gemini') {
      // Gemini使用code和sessionId
      data = {
        code: authCode.value.trim(),
        sessionId: sessionId.value
      }
    } else if (props.platform === 'openai') {
      // OpenAI使用code和sessionId
      data = {
        code: authCode.value.trim(),
        sessionId: sessionId.value
      }
    }

    // 添加代理配置（如果启用）
    if (props.proxy?.enabled) {
      data.proxy = {
        type: props.proxy.type,
        host: props.proxy.host,
        port: parseInt(props.proxy.port),
        username: props.proxy.username || null,
        password: props.proxy.password || null
      }
    }

    let tokenInfo
    if (props.platform === 'claude') {
      tokenInfo = await accountsStore.exchangeClaudeCode(data)
    } else if (props.platform === 'gemini') {
      tokenInfo = await accountsStore.exchangeGeminiCode(data)
    } else if (props.platform === 'openai') {
      tokenInfo = await accountsStore.exchangeOpenAICode(data)
    }

    emit('success', tokenInfo)
  } catch (error) {
    showToast(error.message || t('oauthFlow.authFailed'), 'error')
  } finally {
    exchanging.value = false
  }
}
</script>
