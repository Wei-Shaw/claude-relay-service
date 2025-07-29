<template>
  <div class="space-y-6">
    <!-- Claude OAuth流程 -->
    <div v-if="platform === 'claude'">
      <div class="bg-blue-50 p-6 rounded-lg border border-blue-200">
        <div class="flex items-start gap-4">
          <div class="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center flex-shrink-0">
            <i class="fas fa-link text-white"></i>
          </div>
          <div class="flex-1">
            <h4 class="font-semibold text-blue-900 mb-3">Claude 账户授权</h4>
            <p class="text-sm text-blue-800 mb-4">
              请按照以下步骤完成 Claude 账户的授权：
            </p>
            
            <div class="space-y-4">
              <!-- 步骤1: 生成授权链接 -->
              <div class="bg-white/80 rounded-lg p-4 border border-blue-300">
                <div class="flex items-start gap-3">
                  <div class="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">1</div>
                  <div class="flex-1">
                    <p class="font-medium text-blue-900 mb-2">点击下方按钮生成授权链接</p>
                    <button 
                      v-if="!authUrl"
                      @click="generateAuthUrl"
                      :disabled="loading"
                      class="btn btn-primary px-4 py-2 text-sm"
                    >
                      <i v-if="!loading" class="fas fa-link mr-2"></i>
                      <div v-else class="loading-spinner mr-2"></div>
                      {{ loading ? '生成中...' : '生成授权链接' }}
                    </button>
                    <div v-else class="space-y-3">
                      <div class="flex items-center gap-2">
                        <input 
                          type="text" 
                          :value="authUrl" 
                          readonly
                          class="form-input flex-1 text-xs font-mono bg-gray-50"
                        >
                        <button 
                          @click="copyAuthUrl"
                          class="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                          title="复制链接"
                        >
                          <i :class="copied ? 'fas fa-check text-green-500' : 'fas fa-copy'"></i>
                        </button>
                      </div>
                      <button 
                        @click="regenerateAuthUrl"
                        class="text-xs text-blue-600 hover:text-blue-700"
                      >
                        <i class="fas fa-sync-alt mr-1"></i>重新生成
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              
              <!-- 步骤2: 访问链接并授权 -->
              <div class="bg-white/80 rounded-lg p-4 border border-blue-300">
                <div class="flex items-start gap-3">
                  <div class="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">2</div>
                  <div class="flex-1">
                    <p class="font-medium text-blue-900 mb-2">在浏览器中打开链接并完成授权</p>
                    <p class="text-sm text-blue-700 mb-2">
                      请在新标签页中打开授权链接，登录您的 Claude 账户并授权。
                    </p>
                    <div class="bg-yellow-50 p-3 rounded border border-yellow-300">
                      <p class="text-xs text-yellow-800">
                        <i class="fas fa-exclamation-triangle mr-1"></i>
                        <strong>注意：</strong>如果您设置了代理，请确保浏览器也使用相同的代理访问授权页面。
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              
              <!-- 步骤3: 输入授权码 -->
              <div class="bg-white/80 rounded-lg p-4 border border-blue-300">
                <div class="flex items-start gap-3">
                  <div class="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">3</div>
                  <div class="flex-1">
                    <p class="font-medium text-blue-900 mb-2">输入 Authorization Code</p>
                    <p class="text-sm text-blue-700 mb-3">
                      授权完成后，页面会显示一个 <strong>Authorization Code</strong>，请将其复制并粘贴到下方输入框：
                    </p>
                    <div class="space-y-3">
                      <div>
                        <label class="block text-sm font-semibold text-gray-700 mb-2">
                          <i class="fas fa-key text-blue-500 mr-2"></i>Authorization Code
                        </label>
                        <textarea 
                          v-model="authCode" 
                          rows="3" 
                          class="form-input w-full resize-none font-mono text-sm"
                          placeholder="粘贴从Claude页面获取的Authorization Code..."
                        ></textarea>
                      </div>
                      <p class="text-xs text-gray-500 mt-2">
                        <i class="fas fa-info-circle mr-1"></i>
                        请粘贴从Claude页面复制的Authorization Code
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
      <div class="bg-green-50 p-6 rounded-lg border border-green-200">
        <div class="flex items-start gap-4">
          <div class="w-10 h-10 bg-green-500 rounded-lg flex items-center justify-center flex-shrink-0">
            <i class="fas fa-robot text-white"></i>
          </div>
          <div class="flex-1">
            <h4 class="font-semibold text-green-900 mb-3">Gemini 账户授权</h4>
            <p class="text-sm text-green-800 mb-4">
              请按照以下步骤完成 Gemini 账户的授权：
            </p>
            
            <div class="space-y-4">
              <!-- 步骤1: 生成授权链接 -->
              <div class="bg-white/80 rounded-lg p-4 border border-green-300">
                <div class="flex items-start gap-3">
                  <div class="w-6 h-6 bg-green-600 text-white rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">1</div>
                  <div class="flex-1">
                    <p class="font-medium text-green-900 mb-2">点击下方按钮生成授权链接</p>
                    <button 
                      v-if="!authUrl"
                      @click="generateAuthUrl"
                      :disabled="loading"
                      class="btn btn-primary px-4 py-2 text-sm"
                    >
                      <i v-if="!loading" class="fas fa-link mr-2"></i>
                      <div v-else class="loading-spinner mr-2"></div>
                      {{ loading ? '生成中...' : '生成授权链接' }}
                    </button>
                    <div v-else class="space-y-3">
                      <div class="flex items-center gap-2">
                        <input 
                          type="text" 
                          :value="authUrl" 
                          readonly
                          class="form-input flex-1 text-xs font-mono bg-gray-50"
                        >
                        <button 
                          @click="copyAuthUrl"
                          class="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                          title="复制链接"
                        >
                          <i :class="copied ? 'fas fa-check text-green-500' : 'fas fa-copy'"></i>
                        </button>
                      </div>
                      <button 
                        @click="regenerateAuthUrl"
                        class="text-xs text-green-600 hover:text-green-700"
                      >
                        <i class="fas fa-sync-alt mr-1"></i>重新生成
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              
              <!-- 步骤2: 操作说明 -->
              <div class="bg-white/80 rounded-lg p-4 border border-green-300">
                <div class="flex items-start gap-3">
                  <div class="w-6 h-6 bg-green-600 text-white rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">2</div>
                  <div class="flex-1">
                    <p class="font-medium text-green-900 mb-2">在浏览器中打开链接并完成授权</p>
                    <ol class="text-sm text-green-800 space-y-1 list-decimal list-inside mb-3">
                      <li>点击上方的授权链接，在新页面中完成Google账号登录</li>
                      <li>点击“登录”按钮后可能会加载很慢（这是正常的）</li>
                      <li>如果超过1分钟还在加载，请按 F5 刷新页面</li>
                      <li>授权完成后会跳转到 http://localhost:45462 (可能显示无法访问)</li>
                    </ol>
                    <div class="bg-green-100 p-3 rounded border border-green-300">
                      <p class="text-xs text-green-700">
                        <i class="fas fa-lightbulb mr-1"></i>
                        <strong>提示：</strong>如果页面一直无法跳转，可以打开浏览器开发者工具（F12），F5刷新一下授权页再点击页面的登录按钮，在“网络”标签中找到以 localhost:45462 开头的请求，复制其完整URL。
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              
              <!-- 步骤3: 输入授权码 -->
              <div class="bg-white/80 rounded-lg p-4 border border-green-300">
                <div class="flex items-start gap-3">
                  <div class="w-6 h-6 bg-green-600 text-white rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">3</div>
                  <div class="flex-1">
                    <p class="font-medium text-green-900 mb-2">复制oauth后的链接</p>
                    <p class="text-sm text-green-700 mb-3">
                      复制浏览器地址栏的完整链接并粘贴到下方输入框：
                    </p>
                    <div class="space-y-3">
                      <div>
                        <label class="block text-sm font-semibold text-gray-700 mb-2">
                          <i class="fas fa-key text-green-500 mr-2"></i>复制oauth后的链接
                        </label>
                        <textarea 
                          v-model="authCode" 
                          rows="3" 
                          class="form-input w-full resize-none font-mono text-sm"
                          placeholder="粘贴以 http://localhost:45462 开头的完整链接..."
                        ></textarea>
                      </div>
                      <div class="mt-2 space-y-1">
                        <p class="text-xs text-gray-600">
                          <i class="fas fa-check-circle text-green-500 mr-1"></i>
                          支持粘贴完整链接，系统会自动提取授权码
                        </p>
                        <p class="text-xs text-gray-600">
                          <i class="fas fa-check-circle text-green-500 mr-1"></i>
                          也可以直接粘贴授权码（code参数的值）
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
        type="button" 
        @click="$emit('back')" 
        class="flex-1 px-6 py-3 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200 transition-colors"
      >
        上一步
      </button>
      <button 
        type="button" 
        @click="exchangeCode"
        :disabled="!canExchange || exchanging"
        class="btn btn-primary flex-1 py-3 px-6 font-semibold"
      >
        <div v-if="exchanging" class="loading-spinner mr-2"></div>
        {{ exchanging ? '验证中...' : '完成授权' }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { showToast } from '@/utils/toast'
import { useAccountsStore } from '@/stores/accounts'

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
    // 检查是否是正确的 localhost:45462 开头的 URL
    if (trimmedValue.startsWith('http://localhost:45462')) {
      try {
        const url = new URL(trimmedValue)
        const code = url.searchParams.get('code')
        
        if (code) {
          // 成功提取授权码
          authCode.value = code
          showToast('成功提取授权码！', 'success')
          console.log('Successfully extracted authorization code from URL')
        } else {
          // URL 中没有 code 参数
          showToast('URL 中未找到授权码参数，请检查链接是否正确', 'error')
        }
      } catch (error) {
        // URL 解析失败
        console.error('Failed to parse URL:', error)
        showToast('链接格式错误，请检查是否为完整的 URL', 'error')
      }
    } else if (props.platform === 'gemini') {
      // Gemini 平台可能使用不同的回调URL
      // 尝试从任何URL中提取code参数
      try {
        const url = new URL(trimmedValue)
        const code = url.searchParams.get('code')
        
        if (code) {
          authCode.value = code
          showToast('成功提取授权码！', 'success')
        }
      } catch (error) {
        // 不是有效的URL，保持原值
      }
    } else {
      // 错误的 URL（不是 localhost:45462 开头）
      showToast('请粘贴以 http://localhost:45462 开头的链接', 'error')
    }
  }
  // 如果不是 URL，保持原值（兼容直接输入授权码）
})

// 生成授权URL
const generateAuthUrl = async () => {
  loading.value = true
  try {
    const proxyConfig = props.proxy?.enabled ? {
      proxy: {
        type: props.proxy.type,
        host: props.proxy.host,
        port: parseInt(props.proxy.port),
        username: props.proxy.username || null,
        password: props.proxy.password || null
      }
    } : {}
    
    if (props.platform === 'claude') {
      const result = await accountsStore.generateClaudeAuthUrl(proxyConfig)
      authUrl.value = result.authUrl
      sessionId.value = result.sessionId
    } else if (props.platform === 'gemini') {
      const result = await accountsStore.generateGeminiAuthUrl(proxyConfig)
      authUrl.value = result.authUrl
      sessionId.value = result.sessionId
    }
  } catch (error) {
    showToast(error.message || '生成授权链接失败', 'error')
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
    showToast('链接已复制', 'success')
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
    showToast('链接已复制', 'success')
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
    }
    
    emit('success', tokenInfo)
  } catch (error) {
    showToast(error.message || '授权失败，请检查授权码是否正确', 'error')
  } finally {
    exchanging.value = false
  }
}
</script>