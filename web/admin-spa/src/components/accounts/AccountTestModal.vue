<template>
  <Teleport to="body">
    <div
      v-if="show"
      class="fixed inset-0 z-[1050] flex items-center justify-center bg-gray-900/40 backdrop-blur-sm"
    >
      <div class="absolute inset-0" @click="handleClose" />
      <div
        class="relative z-10 mx-3 flex w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-gray-200/70 bg-white/95 shadow-2xl ring-1 ring-black/5 transition-all dark:border-gray-700/60 dark:bg-gray-900/95 dark:ring-white/10 sm:mx-4"
      >
        <!-- 顶部栏 -->
        <div
          class="flex items-center justify-between border-b border-gray-100 bg-white/80 px-5 py-4 backdrop-blur dark:border-gray-800 dark:bg-gray-900/80"
        >
          <div class="flex items-center gap-3">
            <div
              :class="[
                'flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-white shadow-lg',
                testStatus === 'success'
                  ? 'bg-gradient-to-br from-green-500 to-emerald-500'
                  : testStatus === 'error'
                    ? 'bg-gradient-to-br from-red-500 to-pink-500'
                    : 'bg-gradient-to-br from-blue-500 to-indigo-500'
              ]"
            >
              <i
                :class="[
                  'fas',
                  testStatus === 'idle'
                    ? 'fa-vial'
                    : testStatus === 'testing'
                      ? 'fa-spinner fa-spin'
                      : testStatus === 'success'
                        ? 'fa-check'
                        : 'fa-times'
                ]"
              />
            </div>
            <div>
              <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100">账户连通性测试</h3>
              <p class="text-xs text-gray-500 dark:text-gray-400">
                {{ account?.name || '未知账户' }}
              </p>
            </div>
          </div>
          <button
            class="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-gray-500 transition hover:bg-gray-200 hover:text-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
            :disabled="testStatus === 'testing'"
            @click="handleClose"
          >
            <i class="fas fa-times text-sm" />
          </button>
        </div>

        <!-- 内容区域 -->
        <div class="px-5 py-4">
          <!-- 测试信息 -->
          <div class="mb-4 space-y-2">
            <div class="flex items-center justify-between text-sm">
              <span class="text-gray-500 dark:text-gray-400">平台类型</span>
              <span
                :class="[
                  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
                  platformBadgeClass
                ]"
              >
                <i :class="platformIcon" />
                {{ platformLabel }}
              </span>
            </div>
            <!-- Bedrock 账号类型 -->
            <div
              v-if="props.account?.platform === 'bedrock'"
              class="flex items-center justify-between text-sm"
            >
              <span class="text-gray-500 dark:text-gray-400">账号类型</span>
              <span
                :class="[
                  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
                  credentialTypeBadgeClass
                ]"
              >
                <i :class="credentialTypeIcon" />
                {{ credentialTypeLabel }}
              </span>
            </div>
            <div class="flex items-center justify-between text-sm">
              <span class="text-gray-500 dark:text-gray-400">测试模型</span>
              <select
                v-model="selectedModel"
                class="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-700 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300"
                :disabled="testStatus === 'testing'"
              >
                <option v-for="m in availableModels" :key="m" :value="m">{{ m }}</option>
              </select>
            </div>
          </div>

          <!-- 状态指示 -->
          <div :class="['mb-4 rounded-xl border p-4 transition-all duration-300', statusCardClass]">
            <div class="flex items-center gap-3">
              <div
                :class="['flex h-8 w-8 items-center justify-center rounded-lg', statusIconBgClass]"
              >
                <i :class="['fas text-sm', statusIcon, statusIconClass]" />
              </div>
              <div>
                <p :class="['font-medium', statusTextClass]">{{ statusTitle }}</p>
                <p class="text-xs text-gray-500 dark:text-gray-400">{{ statusDescription }}</p>
              </div>
            </div>
          </div>

          <!-- 响应内容区域 -->
          <div
            v-if="testStatus !== 'idle'"
            class="mb-4 overflow-hidden rounded-xl border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/50"
          >
            <div
              class="flex items-center justify-between border-b border-gray-200 bg-gray-100 px-3 py-2 dark:border-gray-700 dark:bg-gray-800"
            >
              <span class="text-xs font-medium text-gray-600 dark:text-gray-400">AI 响应</span>
              <span v-if="responseText" class="text-xs text-gray-500 dark:text-gray-500">
                {{ responseText.length }} 字符
              </span>
            </div>
            <div class="max-h-40 overflow-y-auto p-3">
              <p
                v-if="responseText"
                class="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300"
              >
                {{ responseText }}
                <span
                  v-if="testStatus === 'testing'"
                  class="inline-block h-4 w-1 animate-pulse bg-blue-500"
                />
              </p>
              <p
                v-else-if="testStatus === 'testing'"
                class="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400"
              >
                <i class="fas fa-circle-notch fa-spin" />
                等待响应中...
              </p>
              <p
                v-else-if="testStatus === 'error' && errorMessage"
                class="text-sm text-red-600 dark:text-red-400"
              >
                {{ errorMessage }}
              </p>
            </div>
          </div>

          <!-- 测试时间 -->
          <div
            v-if="testDuration > 0"
            class="mb-4 flex items-center justify-center gap-2 text-xs text-gray-500 dark:text-gray-400"
          >
            <i class="fas fa-clock" />
            <span>耗时 {{ (testDuration / 1000).toFixed(2) }} 秒</span>
          </div>
        </div>

        <!-- 底部操作栏 -->
        <div
          class="flex items-center justify-end gap-3 border-t border-gray-100 bg-gray-50/80 px-5 py-3 dark:border-gray-800 dark:bg-gray-900/50"
        >
          <button
            class="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 hover:shadow dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
            :disabled="testStatus === 'testing'"
            @click="handleClose"
          >
            关闭
          </button>
          <button
            :class="[
              'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium shadow-sm transition',
              testStatus === 'testing'
                ? 'cursor-not-allowed bg-gray-200 text-gray-400 dark:bg-gray-700 dark:text-gray-500'
                : 'bg-gradient-to-r from-blue-500 to-indigo-500 text-white hover:from-blue-600 hover:to-indigo-600 hover:shadow-md'
            ]"
            :disabled="testStatus === 'testing'"
            @click="startTest"
          >
            <i :class="['fas', testStatus === 'testing' ? 'fa-spinner fa-spin' : 'fa-play']" />
            {{
              testStatus === 'testing'
                ? '测试中...'
                : testStatus === 'idle'
                  ? '开始测试'
                  : '重新测试'
            }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch, onUnmounted } from 'vue'
import { APP_CONFIG } from '@/utils/tools'

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

const emit = defineEmits(['close'])

// 状态
const testStatus = ref('idle') // idle, testing, success, error
const responseText = ref('')
const errorMessage = ref('')
const testDuration = ref(0)
const testStartTime = ref(null)
const eventSource = ref(null)
const selectedModel = ref('')

// 可用模型列表 - 根据账户类型
const availableModels = computed(() => {
  if (!props.account) return []
  const platform = props.account.platform
  const modelLists = {
    claude: ['claude-sonnet-4-5-20250929', 'claude-sonnet-4-20250514', 'claude-3-5-haiku-20241022'],
    'claude-console': [
      'claude-sonnet-4-5-20250929',
      'claude-sonnet-4-20250514',
      'claude-3-5-haiku-20241022'
    ],
    bedrock: [
      'claude-sonnet-4-5-20250929',
      'claude-sonnet-4-20250514',
      'claude-3-5-haiku-20241022'
    ],
    gemini: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash'],
    'openai-responses': ['gpt-4o-mini', 'gpt-4o', 'o3-mini'],
    'azure-openai': [props.account.deploymentName || 'gpt-4o-mini'],
    droid: ['claude-sonnet-4-20250514', 'claude-3-5-haiku-20241022'],
    ccr: ['claude-sonnet-4-20250514', 'claude-3-5-haiku-20241022']
  }
  return modelLists[platform] || []
})

// 默认测试模型
const defaultModel = computed(() => {
  if (!props.account) return ''
  const platform = props.account.platform
  const models = {
    claude: 'claude-sonnet-4-5-20250929',
    'claude-console': 'claude-sonnet-4-5-20250929',
    bedrock: 'claude-sonnet-4-5-20250929',
    gemini: 'gemini-2.5-flash',
    'openai-responses': 'gpt-4o-mini',
    'azure-openai': props.account.deploymentName || 'gpt-4o-mini',
    droid: 'claude-sonnet-4-20250514',
    ccr: 'claude-sonnet-4-20250514'
  }
  return models[platform] || ''
})

// 监听账户变化，重置选中的模型
watch(
  () => props.account,
  () => {
    selectedModel.value = defaultModel.value
  },
  { immediate: true }
)

// 是否使用 SSE 流式响应
const useSSE = computed(() => {
  if (!props.account) return false
  return ['claude', 'claude-console'].includes(props.account.platform)
})

// 计算属性
const platformLabel = computed(() => {
  if (!props.account) return '未知'
  const platform = props.account.platform
  const labels = {
    claude: 'Claude OAuth',
    'claude-console': 'Claude Console',
    bedrock: 'AWS Bedrock',
    gemini: 'Gemini',
    'openai-responses': 'OpenAI Responses',
    'azure-openai': 'Azure OpenAI',
    droid: 'Droid',
    ccr: 'CCR'
  }
  return labels[platform] || platform
})

const platformIcon = computed(() => {
  if (!props.account) return 'fas fa-question'
  const platform = props.account.platform
  const icons = {
    claude: 'fas fa-brain',
    'claude-console': 'fas fa-brain',
    bedrock: 'fab fa-aws',
    gemini: 'fas fa-gem',
    'openai-responses': 'fas fa-code',
    'azure-openai': 'fab fa-microsoft',
    droid: 'fas fa-robot',
    ccr: 'fas fa-key'
  }
  return icons[platform] || 'fas fa-robot'
})

const platformBadgeClass = computed(() => {
  if (!props.account) return 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
  const platform = props.account.platform
  const classes = {
    claude: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300',
    'claude-console': 'bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300',
    bedrock: 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300',
    gemini: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300',
    'openai-responses': 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300',
    'azure-openai': 'bg-cyan-100 text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-300',
    droid: 'bg-pink-100 text-pink-700 dark:bg-pink-500/20 dark:text-pink-300',
    ccr: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300'
  }
  return classes[platform] || 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
})

// Bedrock 账号类型相关
const credentialTypeLabel = computed(() => {
  if (!props.account || props.account.platform !== 'bedrock') return ''
  const credentialType = props.account.credentialType
  if (credentialType === 'access_key') return 'Access Key'
  if (credentialType === 'bearer_token') return 'Bearer Token'
  return 'Unknown'
})

const credentialTypeIcon = computed(() => {
  if (!props.account || props.account.platform !== 'bedrock') return ''
  const credentialType = props.account.credentialType
  if (credentialType === 'access_key') return 'fas fa-key'
  if (credentialType === 'bearer_token') return 'fas fa-ticket'
  return 'fas fa-question'
})

const credentialTypeBadgeClass = computed(() => {
  if (!props.account || props.account.platform !== 'bedrock')
    return 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
  const credentialType = props.account.credentialType
  if (credentialType === 'access_key') {
    return 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300'
  }
  if (credentialType === 'bearer_token') {
    return 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300'
  }
  return 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
})

const statusTitle = computed(() => {
  switch (testStatus.value) {
    case 'idle':
      return '准备就绪'
    case 'testing':
      return '正在测试...'
    case 'success':
      return '测试成功'
    case 'error':
      return '测试失败'
    default:
      return '未知状态'
  }
})

const statusDescription = computed(() => {
  const apiName = platformLabel.value || 'API'
  switch (testStatus.value) {
    case 'idle':
      return '点击下方按钮开始测试账户连通性'
    case 'testing':
      return '正在发送测试请求并等待响应'
    case 'success':
      return `账户可以正常访问 ${apiName}`
    case 'error':
      return errorMessage.value || `无法连接到 ${apiName}`
    default:
      return ''
  }
})

const statusCardClass = computed(() => {
  switch (testStatus.value) {
    case 'idle':
      return 'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/50'
    case 'testing':
      return 'border-blue-200 bg-blue-50 dark:border-blue-500/30 dark:bg-blue-900/20'
    case 'success':
      return 'border-green-200 bg-green-50 dark:border-green-500/30 dark:bg-green-900/20'
    case 'error':
      return 'border-red-200 bg-red-50 dark:border-red-500/30 dark:bg-red-900/20'
    default:
      return 'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/50'
  }
})

const statusIconBgClass = computed(() => {
  switch (testStatus.value) {
    case 'idle':
      return 'bg-gray-200 dark:bg-gray-700'
    case 'testing':
      return 'bg-blue-100 dark:bg-blue-500/30'
    case 'success':
      return 'bg-green-100 dark:bg-green-500/30'
    case 'error':
      return 'bg-red-100 dark:bg-red-500/30'
    default:
      return 'bg-gray-200 dark:bg-gray-700'
  }
})

const statusIcon = computed(() => {
  switch (testStatus.value) {
    case 'idle':
      return 'fa-hourglass-start'
    case 'testing':
      return 'fa-spinner fa-spin'
    case 'success':
      return 'fa-check-circle'
    case 'error':
      return 'fa-exclamation-circle'
    default:
      return 'fa-question-circle'
  }
})

const statusIconClass = computed(() => {
  switch (testStatus.value) {
    case 'idle':
      return 'text-gray-500 dark:text-gray-400'
    case 'testing':
      return 'text-blue-500 dark:text-blue-400'
    case 'success':
      return 'text-green-500 dark:text-green-400'
    case 'error':
      return 'text-red-500 dark:text-red-400'
    default:
      return 'text-gray-500 dark:text-gray-400'
  }
})

const statusTextClass = computed(() => {
  switch (testStatus.value) {
    case 'idle':
      return 'text-gray-700 dark:text-gray-300'
    case 'testing':
      return 'text-blue-700 dark:text-blue-300'
    case 'success':
      return 'text-green-700 dark:text-green-300'
    case 'error':
      return 'text-red-700 dark:text-red-300'
    default:
      return 'text-gray-700 dark:text-gray-300'
  }
})

// 方法
function getTestEndpoint() {
  if (!props.account) return ''
  const platform = props.account.platform
  const endpoints = {
    claude: `${APP_CONFIG.apiPrefix}/admin/claude-accounts/${props.account.id}/test`,
    'claude-console': `${APP_CONFIG.apiPrefix}/admin/claude-console-accounts/${props.account.id}/test`,
    bedrock: `${APP_CONFIG.apiPrefix}/admin/bedrock-accounts/${props.account.id}/test`,
    gemini: `${APP_CONFIG.apiPrefix}/admin/gemini-accounts/${props.account.id}/test`,
    'openai-responses': `${APP_CONFIG.apiPrefix}/admin/openai-responses-accounts/${props.account.id}/test`,
    'azure-openai': `${APP_CONFIG.apiPrefix}/admin/azure-openai-accounts/${props.account.id}/test`,
    droid: `${APP_CONFIG.apiPrefix}/admin/droid-accounts/${props.account.id}/test`,
    ccr: `${APP_CONFIG.apiPrefix}/admin/ccr-accounts/${props.account.id}/test`
  }
  return endpoints[platform] || ''
}

async function startTest() {
  if (!props.account) return

  // 重置状态
  testStatus.value = 'testing'
  responseText.value = ''
  errorMessage.value = ''
  testDuration.value = 0
  testStartTime.value = Date.now()

  // 关闭之前的连接
  if (eventSource.value) {
    eventSource.value.close()
  }

  const endpoint = getTestEndpoint()
  if (!endpoint) {
    testStatus.value = 'error'
    errorMessage.value = '不支持的账户类型'
    return
  }

  try {
    // 获取认证token
    const authToken = localStorage.getItem('authToken')

    // 使用fetch发送POST请求
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authToken ? `Bearer ${authToken}` : ''
      },
      body: JSON.stringify({ model: selectedModel.value })
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.message || `HTTP ${response.status}`)
    }

    // 根据账户类型处理响应
    if (useSSE.value) {
      // SSE 流式响应 (Claude/Console)
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let streamDone = false

      while (!streamDone) {
        const { done, value } = await reader.read()
        if (done) {
          streamDone = true
          continue
        }

        const chunk = decoder.decode(value)
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.substring(6))
              handleSSEEvent(data)
            } catch {
              // 忽略解析错误
            }
          }
        }
      }
    } else {
      // JSON 响应 (其他平台)
      const data = await response.json()
      testDuration.value = Date.now() - testStartTime.value

      if (data.success) {
        testStatus.value = 'success'
        responseText.value = data.data?.responseText || 'Test passed'
      } else {
        testStatus.value = 'error'
        errorMessage.value = data.message || 'Test failed'
      }
    }
  } catch (err) {
    testStatus.value = 'error'
    errorMessage.value = err.message || '连接失败'
    testDuration.value = Date.now() - testStartTime.value
  }
}

function handleSSEEvent(data) {
  switch (data.type) {
    case 'test_start':
      // 测试开始
      break
    case 'content':
      responseText.value += data.text
      break
    case 'message_stop':
      // 消息结束
      break
    case 'test_complete':
      testDuration.value = Date.now() - testStartTime.value
      if (data.success) {
        testStatus.value = 'success'
      } else {
        testStatus.value = 'error'
        errorMessage.value = data.error || '测试失败'
      }
      break
    case 'error':
      testStatus.value = 'error'
      errorMessage.value = data.error || '未知错误'
      testDuration.value = Date.now() - testStartTime.value
      break
  }
}

function handleClose() {
  if (testStatus.value === 'testing') return

  // 关闭SSE连接
  if (eventSource.value) {
    eventSource.value.close()
    eventSource.value = null
  }

  // 重置状态
  testStatus.value = 'idle'
  responseText.value = ''
  errorMessage.value = ''
  testDuration.value = 0

  emit('close')
}

// 监听show变化，重置状态并设置测试模型
watch(
  () => props.show,
  (newVal) => {
    if (newVal) {
      testStatus.value = 'idle'
      responseText.value = ''
      errorMessage.value = ''
      testDuration.value = 0

      // 根据平台和账号类型设置测试模型
      if (props.account?.platform === 'bedrock') {
        const credentialType = props.account.credentialType
        if (credentialType === 'bearer_token') {
          // Bearer Token 模式使用 Sonnet 4.5
          selectedModel.value = 'us.anthropic.claude-sonnet-4-5-20250929-v1:0'
        } else {
          // Access Key 模式使用 Haiku（更快更便宜）
          selectedModel.value = 'us.anthropic.claude-3-5-haiku-20241022-v1:0'
        }
      } else {
        // 其他平台使用默认模型
        selectedModel.value = 'claude-sonnet-4-5-20250929'
      }
    }
  }
)

// 组件卸载时清理
onUnmounted(() => {
  if (eventSource.value) {
    eventSource.value.close()
  }
})
</script>
