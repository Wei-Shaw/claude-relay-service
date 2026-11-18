<template>
  <Teleport to="body">
    <div
      v-if="show"
      class="test-modal-shell fixed inset-0 z-[1050] flex items-center justify-center p-3 sm:p-6"
    >
      <div class="absolute inset-0" @click="handleClose" />
      <div
        aria-labelledby="test-modal-title"
        aria-modal="true"
        class="test-modal-panel relative z-10 flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden"
        role="dialog"
      >
        <header class="test-modal-header">
          <div class="test-modal-heading">
            <span class="test-modal-eyebrow">CONNECTIVITY CHECK</span>
            <div>
              <h3 id="test-modal-title">{{ modalTitle }}</h3>
              <p>{{ modalSubtitle }}</p>
            </div>
          </div>
          <button
            aria-label="关闭测试窗口"
            class="test-modal-close"
            :disabled="state.testStatus.value === 'testing'"
            type="button"
            @click="handleClose"
          >
            <i class="fas fa-times" />
          </button>
        </header>

        <div class="test-modal-content custom-scrollbar">
          <section class="test-modal-section">
            <div class="test-section-heading">
              <div>
                <span>01 / CONFIGURATION</span>
                <h4>测试配置</h4>
              </div>
              <p>仅发送一条最小请求验证服务连通性</p>
            </div>

            <div v-if="mode === 'apikey'" class="test-field test-field-wide">
              <label for="test-api-key">API Key</label>
              <div class="test-readonly-field">
                <input
                  id="test-api-key"
                  readonly
                  type="text"
                  :value="managedApiKeyTest ? '管理端一次性测试凭证' : maskedApiKey"
                />
                <i class="fas fa-lock" />
              </div>
            </div>

            <div class="test-config-grid">
              <div v-if="mode === 'account'" class="test-info-item">
                <span>平台类型</span>
                <strong><i :class="platformIcon" />{{ platformLabel }}</strong>
              </div>
              <div
                v-if="mode === 'account' && account?.platform === 'bedrock'"
                class="test-info-item"
              >
                <span>账号类型</span>
                <strong><i :class="credentialTypeIcon" />{{ credentialTypeLabel }}</strong>
              </div>
              <div v-if="mode === 'apikey'" class="test-info-item">
                <span>测试端点</span>
                <code>{{ apikeyServiceConfig.displayEndpoint }}</code>
              </div>
              <div v-if="mode === 'apikey' && managedApiKeyTest" class="test-info-item">
                <span>Key 额度</span>
                <strong class="test-positive"><i class="fas fa-shield-alt" />本次测试不计入</strong>
              </div>

              <div class="test-field">
                <label>测试模型</label>
                <ModelSelector
                  v-model="selectedModel"
                  :disabled="state.testStatus.value === 'testing' || modelsLoading"
                  :models="availableModels"
                />
                <code class="test-model-id">{{ selectedModel }}</code>
              </div>

              <div v-if="mode === 'apikey'" class="test-field">
                <label for="test-max-tokens">最大输出 Token</label>
                <select id="test-max-tokens" v-model="maxTokens">
                  <option v-for="opt in maxTokensOptions" :key="opt.value" :value="opt.value">
                    {{ opt.label }}
                  </option>
                </select>
              </div>

              <div v-if="mode === 'apikey'" class="test-field test-field-wide">
                <label for="test-service">测试服务</label>
                <select
                  v-if="managedApiKeyTest"
                  id="test-service"
                  v-model="selectedService"
                  :disabled="state.testStatus.value === 'testing'"
                >
                  <option
                    v-for="service in managedServiceOptions"
                    :key="service.value"
                    :value="service.value"
                  >
                    {{ service.label }}
                  </option>
                </select>
                <div v-else id="test-service" class="test-static-field">
                  {{ apikeyServiceConfig.name }}
                </div>
              </div>
            </div>
          </section>

          <section v-if="mode === 'apikey'" class="test-modal-section">
            <div class="test-section-heading">
              <div>
                <span>02 / REQUEST</span>
                <h4>测试请求</h4>
              </div>
              <p>使用简短提示词可更快确认响应状态</p>
            </div>
            <div class="test-field test-field-wide">
              <label for="test-prompt">提示词</label>
              <textarea
                id="test-prompt"
                v-model="testPrompt"
                placeholder="输入测试提示词..."
                rows="3"
              />
            </div>
          </section>

          <section class="test-modal-section test-result-section">
            <div class="test-section-heading">
              <div>
                <span>{{ mode === 'apikey' ? '03' : '02' }} / RESULT</span>
                <h4>测试状态</h4>
              </div>
              <p v-if="state.testDuration.value > 0">
                {{ (state.testDuration.value / 1000).toFixed(2) }}s
              </p>
            </div>

            <div :class="['test-status-card', `is-${state.testStatus.value}`]">
              <div class="test-status-icon">
                <i :class="['fas', state.statusIcon.value]" />
              </div>
              <div>
                <strong>{{ state.statusTitle.value }}</strong>
                <p>{{ statusDescription }}</p>
              </div>
            </div>

            <div v-if="state.testStatus.value !== 'idle'" class="test-response-panel">
              <div class="test-response-heading">
                <span>AI 响应</span>
                <span v-if="state.responseText.value"
                  >{{ state.responseText.value.length }} 字符</span
                >
              </div>
              <div class="test-response-body">
                <p v-if="state.responseText.value">
                  {{ state.responseText.value
                  }}<span
                    v-if="state.testStatus.value === 'testing'"
                    class="test-response-cursor"
                  />
                </p>
                <p v-else-if="state.testStatus.value === 'testing'" class="test-response-waiting">
                  <i class="fas fa-circle-notch fa-spin" />
                  等待响应中...
                </p>
                <p
                  v-else-if="state.testStatus.value === 'error' && state.errorMessage.value"
                  class="test-response-error"
                >
                  {{ state.errorMessage.value }}
                </p>
              </div>
            </div>
          </section>
        </div>

        <footer class="test-modal-footer">
          <p><i class="fas fa-shield-halved" />测试凭证仅用于本次连通性检查</p>
          <div class="test-modal-actions">
            <button
              class="test-button test-button-secondary"
              :disabled="state.testStatus.value === 'testing'"
              type="button"
              @click="handleClose"
            >
              关闭
            </button>
            <button
              class="test-button test-button-primary"
              :disabled="state.testStatus.value === 'testing' || disableTest"
              type="button"
              @click="startTest"
            >
              <i
                :class="[
                  'fas',
                  state.testStatus.value === 'testing' || modelsLoading
                    ? 'fa-spinner fa-spin'
                    : 'fa-play'
                ]"
              />
              {{
                modelsLoading
                  ? '加载模型...'
                  : state.testStatus.value === 'testing'
                    ? '测试中...'
                    : state.testStatus.value === 'idle'
                      ? '开始测试'
                      : '重新测试'
              }}
            </button>
          </div>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { APP_CONFIG } from '@/utils/tools'
import { createAdminApiKeyTestCredentialApi, getConnectivityTestModelsApi } from '@/utils/http_apis'
import { useTestState } from '@/utils/useTestState'
import ModelSelector from '@/components/common/ModelSelector.vue'

const props = defineProps({
  show: { type: Boolean, default: false },
  mode: { type: String, default: 'account' }, // 'account' | 'apikey'
  // account 模式
  account: { type: Object, default: null },
  // apikey 模式
  apiKeyValue: { type: String, default: '' },
  apiKeyId: { type: String, default: '' },
  apiKeyName: { type: String, default: '' },
  serviceType: { type: String, default: 'claude' },
  availableServices: { type: Array, default: () => [] },
  managedApiKeyTest: { type: Boolean, default: false }
})

const emit = defineEmits(['close'])
const state = useTestState()

// ========== 模型相关 ==========
const selectedModel = ref('')
const selectedService = ref('claude')
const effectiveServiceType = computed(() =>
  props.managedApiKeyTest ? selectedService.value : props.serviceType
)
const modelsLoading = ref(false)
const modelsFromApi = ref({
  services: { claude: [], gemini: [], openai: [] },
  platforms: {},
  defaults: { services: {}, platforms: {} }
})

const loadModels = async () => {
  modelsLoading.value = true
  try {
    const result = await getConnectivityTestModelsApi()
    if (result.success && result.data) {
      modelsFromApi.value = result.data
    }
  } finally {
    modelsLoading.value = false
  }
}

const availableModels = computed(() => {
  if (props.mode === 'account') {
    const platform = props.account?.platform
    if (!platform) return []
    // azure-openai 使用 deploymentName
    if (platform === 'azure-openai') {
      return [{ value: props.account.deploymentName, label: props.account.deploymentName }]
    }
    return modelsFromApi.value.platforms?.[platform] || []
  }
  // apikey 模式
  return modelsFromApi.value.services?.[effectiveServiceType.value] || []
})

// 各平台回退默认模型（模型列表未加载时使用）
const platformFallbackModels = {
  claude: 'claude-sonnet-4-5-20250929',
  'claude-console': 'claude-sonnet-4-5-20250929',
  gemini: 'gemini-2.5-pro',
  'gemini-api': 'gemini-2.5-flash',
  'openai-responses': 'gpt-5',
  droid: 'claude-sonnet-4-5-20250929',
  grok: 'grok-4.5',
  ccr: 'claude-sonnet-4-5-20250929'
}

const defaultModel = computed(() => {
  if (props.mode === 'account') {
    const platform = props.account?.platform
    if (platform === 'azure-openai') return props.account?.deploymentName
    const configuredDefault = modelsFromApi.value.defaults?.platforms?.[platform]
    if (configuredDefault) return configuredDefault
    // bedrock 优先用列表，列表为空时按凭证类型回退
    if (platform === 'bedrock') {
      const models = availableModels.value
      if (models.length > 0) return models[0].value
      if (props.account?.credentialType === 'bearer_token')
        return 'us.anthropic.claude-sonnet-4-5-20250929-v1:0'
      return 'us.anthropic.claude-3-5-haiku-20241022-v1:0'
    }
    const models = availableModels.value
    if (models.length > 0) return models[0].value
    return platformFallbackModels[platform] || platformFallbackModels.claude
  }
  // apikey 模式: 优先用列表，回退用 serviceConfig 的 defaultModel
  const configuredDefault = modelsFromApi.value.defaults?.services?.[effectiveServiceType.value]
  if (configuredDefault) return configuredDefault
  const models = availableModels.value
  if (models.length > 0) return models[0].value
  return apikeyServiceConfig.value.defaultModel
})

// ========== apikey 模式专用 ==========
const testPrompt = ref('hi')
const maxTokens = ref(1000)
const maxTokensOptions = [
  { value: 100, label: '100' },
  { value: 500, label: '500' },
  { value: 1000, label: '1000' },
  { value: 2000, label: '2000' },
  { value: 4096, label: '4096' }
]

const apikeyServiceConfigs = {
  claude: {
    name: 'Claude',
    endpoint: '/api-key/test',
    defaultModel: 'claude-sonnet-4-5-20250929',
    displayEndpoint: '/api/v1/messages'
  },
  gemini: {
    name: 'Gemini',
    endpoint: '/api-key/test-gemini',
    defaultModel: 'gemini-2.5-pro',
    displayEndpoint: '/gemini/v1/models/:model:streamGenerateContent'
  },
  openai: {
    name: 'OpenAI (Codex)',
    endpoint: '/api-key/test-openai',
    defaultModel: 'gpt-5',
    displayEndpoint: '/openai/responses'
  }
}

const managedServiceOptions = computed(() => {
  const allowedServices = props.availableServices.length
    ? props.availableServices
    : Object.keys(apikeyServiceConfigs)
  return allowedServices
    .filter((service) => apikeyServiceConfigs[service])
    .map((service) => ({ value: service, label: apikeyServiceConfigs[service].name }))
})

const apikeyServiceConfig = computed(
  () => apikeyServiceConfigs[effectiveServiceType.value] || apikeyServiceConfigs.claude
)

const maskedApiKey = computed(() => {
  const key = props.apiKeyValue
  if (!key) return ''
  if (key.length <= 10) return '****'
  return key.substring(0, 6) + '****' + key.substring(key.length - 4)
})

const disableTest = computed(
  () =>
    modelsLoading.value ||
    !selectedModel.value?.trim() ||
    (props.mode === 'apikey' && (props.managedApiKeyTest ? !props.apiKeyId : !props.apiKeyValue))
)

// ========== account 模式 - 平台信息 ==========
const platformConfigs = {
  claude: {
    label: 'Claude OAuth',
    icon: 'fas fa-brain'
  },
  'claude-console': {
    label: 'Claude Console',
    icon: 'fas fa-brain'
  },
  bedrock: {
    label: 'AWS Bedrock',
    icon: 'fab fa-aws'
  },
  gemini: {
    label: 'Gemini',
    icon: 'fas fa-gem'
  },
  'gemini-api': {
    label: 'Gemini API',
    icon: 'fas fa-gem'
  },
  'openai-responses': {
    label: 'OpenAI Responses',
    icon: 'fas fa-code'
  },
  'azure-openai': {
    label: 'Azure OpenAI',
    icon: 'fab fa-microsoft'
  },
  droid: {
    label: 'Droid',
    icon: 'fas fa-robot'
  },
  grok: {
    label: 'Grok',
    icon: 'fas fa-bolt',
    badge: 'bg-zinc-200 text-zinc-800 dark:bg-zinc-600/40 dark:text-zinc-200'
  },
  ccr: {
    label: 'CCR',
    icon: 'fas fa-key'
  }
}

const platformConfig = computed(
  () =>
    platformConfigs[props.account?.platform] || {
      label: '未知',
      icon: 'fas fa-question'
    }
)
const platformLabel = computed(() => platformConfig.value.label)
const platformIcon = computed(() => platformConfig.value.icon)

const credentialTypeLabel = computed(() => {
  const ct = props.account?.credentialType
  if (ct === 'access_key') return 'Access Key'
  if (ct === 'bearer_token') return 'Bearer Token'
  return 'Unknown'
})
const credentialTypeIcon = computed(() => {
  const ct = props.account?.credentialType
  if (ct === 'access_key') return 'fas fa-key'
  if (ct === 'bearer_token') return 'fas fa-ticket'
  return 'fas fa-question'
})

// ========== 通用计算属性 ==========
const modalTitle = computed(() => {
  if (props.mode === 'account') return '账户连通性测试'
  return props.managedApiKeyTest ? 'API Key 端到端测试' : 'API Key 端点测试'
})
const modalSubtitle = computed(() => {
  if (props.mode === 'account') return props.account?.name || '未知账户'
  return props.apiKeyName || '当前 API Key'
})

const statusDescription = computed(() => {
  const s = state.testStatus.value
  const apiName = props.mode === 'account' ? platformLabel.value : apikeyServiceConfig.value.name
  if (s === 'idle')
    return props.mode === 'account'
      ? '点击下方按钮开始测试账户连通性'
      : '点击下方按钮开始测试 API Key 连通性'
  if (s === 'testing') return '正在发送测试请求并等待响应'
  if (s === 'success')
    return props.mode === 'account' ? `账户可以正常访问 ${apiName}` : 'API Key 可以正常访问服务'
  if (s === 'error') return state.errorMessage.value || `无法连接到 ${apiName}`
  return ''
})

// ========== 测试逻辑 ==========
const getAccountEndpoint = () => {
  if (!props.account) return ''
  const platform = props.account.platform
  const endpoints = {
    claude: `${APP_CONFIG.apiPrefix}/admin/claude-accounts/${props.account.id}/test`,
    'claude-console': `${APP_CONFIG.apiPrefix}/admin/claude-console-accounts/${props.account.id}/test`,
    bedrock: `${APP_CONFIG.apiPrefix}/admin/bedrock-accounts/${props.account.id}/test`,
    gemini: `${APP_CONFIG.apiPrefix}/admin/gemini-accounts/${props.account.id}/test`,
    'gemini-api': `${APP_CONFIG.apiPrefix}/admin/gemini-api-accounts/${props.account.id}/test`,
    'openai-responses': `${APP_CONFIG.apiPrefix}/admin/openai-responses-accounts/${props.account.id}/test`,
    'azure-openai': `${APP_CONFIG.apiPrefix}/admin/azure-openai-accounts/${props.account.id}/test`,
    droid: `${APP_CONFIG.apiPrefix}/admin/droid-accounts/${props.account.id}/test`,
    grok: `${APP_CONFIG.apiPrefix}/admin/grok-accounts/${props.account.id}/test`,
    ccr: `${APP_CONFIG.apiPrefix}/admin/ccr-accounts/${props.account.id}/test`
  }
  return endpoints[platform] || ''
}

const startTest = async () => {
  if (props.mode === 'account') {
    const endpoint = getAccountEndpoint()
    if (!endpoint) return
    const authToken = localStorage.getItem('authToken')
    const useSSE = ['claude', 'claude-console', 'bedrock', 'gemini-api'].includes(
      props.account.platform
    )
    state.sendTestRequest(
      endpoint,
      { model: selectedModel.value },
      {
        useSSE,
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {}
      }
    )
  } else {
    const endpoint = `${APP_CONFIG.apiPrefix}/apiStats${apikeyServiceConfig.value.endpoint}`
    let apiKey = props.apiKeyValue
    if (props.managedApiKeyTest) {
      state.setTesting()
      const credentialResult = await createAdminApiKeyTestCredentialApi(
        props.apiKeyId,
        effectiveServiceType.value
      )
      if (!credentialResult.success || !credentialResult.data?.apiKey) {
        state.setError?.(credentialResult.message || '无法创建管理端测试凭证')
        return
      }
      apiKey = credentialResult.data.apiKey
    }
    state.sendTestRequest(
      endpoint,
      {
        apiKey,
        model: selectedModel.value,
        prompt: testPrompt.value,
        maxTokens: maxTokens.value
      },
      { useSSE: true }
    )
  }
}

const handleClose = () => {
  if (state.testStatus.value === 'testing') return
  state.cleanup()
  state.resetState()
  emit('close')
}

// ========== 监听 ==========
watch(
  () => props.show,
  async (newVal) => {
    if (newVal) {
      state.resetState()
      await loadModels()
      selectedModel.value = defaultModel.value
      if (props.mode === 'apikey') {
        const preferredService = props.availableServices.includes(props.serviceType)
          ? props.serviceType
          : props.availableServices[0]
        selectedService.value = preferredService || props.serviceType || 'claude'
        selectedModel.value = defaultModel.value
        testPrompt.value = 'hi'
        maxTokens.value = 1000
      }
    }
  }
)

watch(
  () => [props.account, props.serviceType, selectedService.value],
  () => {
    selectedModel.value = defaultModel.value
  },
  { deep: true }
)
</script>

<style scoped>
.test-modal-shell {
  background: rgba(18, 25, 22, 0.58);
  backdrop-filter: blur(10px);
  font-family: 'Avenir Next', 'PingFang SC', 'Microsoft YaHei', sans-serif;
}

.test-modal-panel {
  --test-bg: #f1f0eb;
  --test-card: #fafaf7;
  --test-ink: #18201d;
  --test-muted: #727a74;
  --test-line: #d8dad3;
  --test-forest: #1d3b33;
  --test-green: #55a782;
  --test-red: #b8655f;
  color: var(--test-ink);
  border: 1px solid var(--test-line);
  border-radius: 0.85rem;
  background: var(--test-card);
  box-shadow: 0 2rem 5rem rgba(18, 29, 24, 0.24);
}

.test-modal-header,
.test-modal-footer {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.5rem;
}

.test-modal-header {
  position: relative;
  padding: 1.25rem 1.35rem;
  border-bottom: 1px solid var(--test-line);
  background:
    radial-gradient(
      circle at 92% 0%,
      color-mix(in srgb, var(--test-green) 12%, transparent),
      transparent 10rem
    ),
    color-mix(in srgb, var(--test-card) 94%, transparent);
}

.test-modal-heading {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 1rem;
}

.test-modal-eyebrow {
  flex: 0 0 auto;
  color: var(--test-green);
  font:
    700 0.56rem ui-monospace,
    'SFMono-Regular',
    Consolas,
    monospace;
  letter-spacing: 0.12em;
  writing-mode: vertical-rl;
  transform: rotate(180deg);
}

.test-modal-heading h3,
.test-modal-heading p {
  margin: 0;
}

.test-modal-heading h3 {
  font-size: 1.18rem;
  font-weight: 700;
  letter-spacing: -0.035em;
}

.test-modal-heading p {
  margin-top: 0.22rem;
  overflow: hidden;
  color: var(--test-muted);
  font-size: 0.7rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.test-modal-close {
  width: 2.1rem;
  height: 2.1rem;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border: 1px solid var(--test-line);
  border-radius: 0.42rem;
  color: var(--test-muted);
  background: color-mix(in srgb, var(--test-bg) 66%, transparent);
  font-size: 0.72rem;
  cursor: pointer;
  transition:
    border-color 0.18s ease,
    color 0.18s ease,
    background 0.18s ease;
}

.test-modal-close:hover:not(:disabled) {
  color: var(--test-ink);
  border-color: color-mix(in srgb, var(--test-green) 48%, var(--test-line));
  background: var(--test-card);
}

.test-modal-close:disabled {
  opacity: 0.42;
  cursor: not-allowed;
}

.test-modal-content {
  min-height: 0;
  flex: 1 1 auto;
  overflow-y: auto;
  background: color-mix(in srgb, var(--test-bg) 34%, var(--test-card));
}

.test-modal-section {
  padding: 1.2rem 1.35rem 1.35rem;
  border-bottom: 1px solid var(--test-line);
}

.test-modal-section:last-child {
  border-bottom: 0;
}

.test-section-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1.5rem;
  margin-bottom: 1rem;
}

.test-section-heading span,
.test-section-heading h4,
.test-section-heading p {
  margin: 0;
}

.test-section-heading span {
  display: block;
  margin-bottom: 0.22rem;
  color: var(--test-green);
  font:
    700 0.54rem ui-monospace,
    'SFMono-Regular',
    Consolas,
    monospace;
  letter-spacing: 0.1em;
}

.test-section-heading h4 {
  font-size: 0.88rem;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.test-section-heading p {
  color: var(--test-muted);
  font-size: 0.63rem;
  line-height: 1.5;
  text-align: right;
}

.test-config-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.8rem;
  margin-top: 0.8rem;
}

.test-field-wide {
  grid-column: 1 / -1;
}

.test-field label,
.test-info-item > span {
  display: block;
  margin-bottom: 0.45rem;
  color: var(--test-muted);
  font:
    600 0.61rem ui-monospace,
    'SFMono-Regular',
    Consolas,
    monospace;
  letter-spacing: 0.025em;
}

.test-field input,
.test-field select,
.test-field textarea,
.test-static-field,
.test-readonly-field input {
  width: 100%;
  border: 1px solid var(--test-line);
  border-radius: 0.46rem;
  color: var(--test-ink);
  background: var(--test-card);
  font-size: 0.73rem;
  transition:
    border-color 0.18s ease,
    box-shadow 0.18s ease,
    background 0.18s ease;
}

.test-field input,
.test-field select,
.test-static-field,
.test-readonly-field input {
  min-height: 2.55rem;
  padding: 0.67rem 0.75rem;
}

.test-field textarea {
  min-height: 5.4rem;
  resize: vertical;
  padding: 0.72rem 0.78rem;
  line-height: 1.6;
}

.test-field input:focus,
.test-field select:focus,
.test-field textarea:focus {
  outline: none;
  border-color: var(--test-green);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--test-green) 14%, transparent);
}

.test-field input:disabled,
.test-field select:disabled,
.test-field textarea:disabled {
  opacity: 0.58;
  cursor: not-allowed;
}

.test-readonly-field {
  position: relative;
}

.test-readonly-field input {
  padding-right: 2.6rem;
  background: color-mix(in srgb, var(--test-bg) 60%, var(--test-card));
  font-family: ui-monospace, 'SFMono-Regular', Consolas, monospace;
}

.test-readonly-field > i {
  position: absolute;
  top: 50%;
  right: 0.85rem;
  color: var(--test-muted);
  font-size: 0.66rem;
  transform: translateY(-50%);
}

.test-info-item {
  min-width: 0;
  min-height: 4.3rem;
  padding: 0.72rem 0.78rem;
  border: 1px solid var(--test-line);
  border-radius: 0.48rem;
  background: color-mix(in srgb, var(--test-card) 82%, transparent);
}

.test-info-item > span {
  margin-bottom: 0.36rem;
}

.test-info-item strong,
.test-info-item code {
  display: flex;
  align-items: center;
  gap: 0.42rem;
  overflow: hidden;
  color: var(--test-ink);
  font-size: 0.72rem;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.test-info-item code {
  color: var(--test-green);
  font-family: ui-monospace, 'SFMono-Regular', Consolas, monospace;
}

.test-positive {
  color: var(--test-green) !important;
}

.test-model-id {
  display: block;
  min-height: 1rem;
  margin-top: 0.36rem;
  overflow: hidden;
  color: var(--test-muted);
  font:
    0.58rem ui-monospace,
    'SFMono-Regular',
    Consolas,
    monospace;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.test-static-field {
  display: flex;
  align-items: center;
  font-weight: 650;
}

.test-field :deep(> div) {
  width: 100%;
}

.test-field :deep(select),
.test-field :deep(input) {
  width: 100%;
  min-height: 2.55rem;
  border: 1px solid var(--test-line);
  border-radius: 0.46rem;
  padding: 0.67rem 0.75rem;
  color: var(--test-ink);
  background: var(--test-card);
  font-size: 0.7rem;
  box-shadow: none;
}

.test-modal-panel :deep(.dark\:border-gray-600),
.test-modal-panel :deep(.dark\:bg-gray-700),
.test-modal-panel :deep(.dark\:text-gray-300) {
  color: var(--test-ink) !important;
  border-color: var(--test-line) !important;
  background: var(--test-card) !important;
}

.test-field :deep(select:focus),
.test-field :deep(input:focus) {
  outline: none;
  border-color: var(--test-green);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--test-green) 14%, transparent);
}

.test-field :deep(button) {
  min-height: 2.55rem;
  border-color: var(--test-line);
  border-radius: 0.46rem;
  color: var(--test-muted);
  background: var(--test-bg);
}

.test-modal-panel :deep(button.dark\:bg-gray-700) {
  color: var(--test-muted) !important;
  border-color: var(--test-line) !important;
  background: var(--test-bg) !important;
}

.test-result-section {
  background: color-mix(in srgb, var(--test-green) 3%, var(--test-card));
}

.test-status-card {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 0.8rem;
  border: 1px solid var(--test-line);
  border-radius: 0.52rem;
  padding: 0.85rem;
  background: var(--test-card);
}

.test-status-icon {
  width: 2.15rem;
  height: 2.15rem;
  display: grid;
  place-items: center;
  border: 1px solid var(--test-line);
  border-radius: 50%;
  color: var(--test-muted);
  background: var(--test-bg);
  font-size: 0.72rem;
}

.test-status-card strong,
.test-status-card p {
  margin: 0;
}

.test-status-card strong {
  display: block;
  font-size: 0.77rem;
}

.test-status-card p {
  margin-top: 0.2rem;
  color: var(--test-muted);
  font-size: 0.64rem;
  line-height: 1.5;
}

.test-status-card.is-testing,
.test-status-card.is-success {
  border-color: color-mix(in srgb, var(--test-green) 48%, var(--test-line));
  background: color-mix(in srgb, var(--test-green) 8%, var(--test-card));
}

.test-status-card.is-testing .test-status-icon,
.test-status-card.is-success .test-status-icon {
  color: var(--test-green);
  border-color: color-mix(in srgb, var(--test-green) 48%, var(--test-line));
  background: color-mix(in srgb, var(--test-green) 12%, var(--test-card));
}

.test-status-card.is-error {
  border-color: color-mix(in srgb, var(--test-red) 55%, var(--test-line));
  background: color-mix(in srgb, var(--test-red) 8%, var(--test-card));
}

.test-status-card.is-error .test-status-icon {
  color: var(--test-red);
  border-color: color-mix(in srgb, var(--test-red) 55%, var(--test-line));
  background: color-mix(in srgb, var(--test-red) 12%, var(--test-card));
}

.test-response-panel {
  overflow: hidden;
  margin-top: 0.75rem;
  border: 1px solid var(--test-line);
  border-radius: 0.5rem;
  background: var(--test-card);
}

.test-response-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.55rem 0.72rem;
  border-bottom: 1px solid var(--test-line);
  color: var(--test-muted);
  background: color-mix(in srgb, var(--test-bg) 68%, transparent);
  font:
    600 0.58rem ui-monospace,
    'SFMono-Regular',
    Consolas,
    monospace;
  letter-spacing: 0.035em;
}

.test-response-body {
  max-height: 10rem;
  overflow-y: auto;
  padding: 0.75rem;
}

.test-response-body p {
  margin: 0;
  color: var(--test-ink);
  font-size: 0.7rem;
  line-height: 1.65;
  white-space: pre-wrap;
}

.test-response-body .test-response-waiting {
  display: flex;
  align-items: center;
  gap: 0.48rem;
  color: var(--test-muted);
}

.test-response-body .test-response-error {
  color: var(--test-red);
}

.test-response-cursor {
  display: inline-block;
  width: 0.18rem;
  height: 0.85rem;
  margin-left: 0.15rem;
  background: var(--test-green);
  animation: test-cursor-pulse 1s steps(2, start) infinite;
}

.test-modal-footer {
  padding: 0.85rem 1.35rem;
  border-top: 1px solid var(--test-line);
  background: color-mix(in srgb, var(--test-card) 94%, transparent);
}

.test-modal-footer > p {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin: 0;
  color: var(--test-muted);
  font-size: 0.61rem;
}

.test-modal-footer > p i {
  color: var(--test-green);
}

.test-modal-actions {
  display: flex;
  align-items: center;
  gap: 0.55rem;
}

.test-button {
  min-height: 2.35rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.42rem;
  border: 1px solid transparent;
  border-radius: 0.44rem;
  padding: 0.62rem 0.9rem;
  font-size: 0.68rem;
  font-weight: 700;
  cursor: pointer;
  transition:
    transform 0.18s ease,
    border-color 0.18s ease,
    background 0.18s ease;
}

.test-button:hover:not(:disabled) {
  transform: translateY(-1px);
}

.test-button:disabled {
  opacity: 0.42;
  cursor: not-allowed;
}

.test-button-secondary {
  color: var(--test-ink);
  border-color: var(--test-line);
  background: var(--test-card);
}

.test-button-secondary:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--test-green) 42%, var(--test-line));
}

.test-button-primary {
  min-width: 6.9rem;
  color: #f2f5f1;
  border-color: var(--test-forest);
  background: var(--test-forest);
}

.test-button-primary:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--test-green) 36%, var(--test-forest));
  background: color-mix(in srgb, var(--test-green) 16%, var(--test-forest));
}

@keyframes test-cursor-pulse {
  50% {
    opacity: 0;
  }
}

@media (max-width: 640px) {
  .test-modal-panel {
    max-height: 94vh;
  }

  .test-modal-header,
  .test-modal-section,
  .test-modal-footer {
    padding-left: 1rem;
    padding-right: 1rem;
  }

  .test-modal-header {
    padding-top: 1rem;
    padding-bottom: 1rem;
  }

  .test-modal-heading {
    gap: 0.7rem;
  }

  .test-modal-eyebrow {
    display: none;
  }

  .test-config-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .test-field-wide {
    grid-column: auto;
  }

  .test-section-heading {
    align-items: flex-start;
    gap: 0.75rem;
  }

  .test-section-heading p {
    max-width: 9.5rem;
  }

  .test-modal-footer {
    align-items: stretch;
    flex-direction: column;
    gap: 0.7rem;
  }

  .test-modal-actions,
  .test-button {
    flex: 1;
  }
}
</style>

<style>
.dark .test-modal-panel {
  --test-bg: #171b19;
  --test-card: #202623;
  --test-ink: #eef2ed;
  --test-muted: #9ca69f;
  --test-line: #343c37;
  --test-forest: #20463b;
  --test-green: #6fc29d;
  --test-red: #d47c75;
  box-shadow: 0 2rem 5rem rgba(0, 0, 0, 0.52);
}
</style>
