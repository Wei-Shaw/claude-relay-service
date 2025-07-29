<template>
  <Teleport to="body">
    <div class="fixed inset-0 modal z-50 flex items-center justify-center p-4">
      <div class="modal-content w-full max-w-md p-8 mx-auto max-h-[90vh] flex flex-col">
      <div class="flex items-center justify-between mb-6">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center">
            <i class="fas fa-edit text-white"></i>
          </div>
          <h3 class="text-xl font-bold text-gray-900">编辑 API Key</h3>
        </div>
        <button 
          @click="$emit('close')"
          class="text-gray-400 hover:text-gray-600 transition-colors"
        >
          <i class="fas fa-times text-xl"></i>
        </button>
      </div>
      
      <form @submit.prevent="updateApiKey" class="space-y-6 modal-scroll-content custom-scrollbar flex-1">
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-3">名称</label>
          <input 
            :value="form.name" 
            type="text" 
            disabled
            class="form-input w-full bg-gray-100 cursor-not-allowed"
          >
          <p class="text-xs text-gray-500 mt-2">名称不可修改</p>
        </div>
        
        <!-- 标签 -->
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-3">标签</label>
          <div class="space-y-3">
            <!-- 已添加的标签 -->
            <div v-if="form.tags.length > 0" class="flex flex-wrap gap-2">
              <span v-for="(tag, index) in form.tags" :key="index" 
                    class="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-800 text-sm rounded-full">
                {{ tag }}
                <button type="button" @click="removeTag(index)" 
                        class="ml-1 hover:text-blue-900">
                  <i class="fas fa-times text-xs"></i>
                </button>
              </span>
            </div>
            
            <!-- 标签输入 -->
            <div class="flex gap-2">
              <input 
                v-model="newTag" 
                type="text" 
                class="form-input flex-1"
                placeholder="输入新标签名称"
                @keypress.enter.prevent="addTag"
              >
              <button type="button" @click="addTag" 
                      class="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors">
                <i class="fas fa-plus"></i>
              </button>
            </div>
            <p class="text-xs text-gray-500">用于标记不同团队或用途，方便筛选管理</p>
          </div>
        </div>
        
        <!-- 速率限制设置 -->
        <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-4">
          <div class="flex items-start gap-3 mb-3">
            <div class="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center flex-shrink-0">
              <i class="fas fa-tachometer-alt text-white text-sm"></i>
            </div>
            <div class="flex-1">
              <h4 class="font-semibold text-gray-800 mb-1">速率限制设置</h4>
              <p class="text-sm text-gray-600">控制 API Key 的使用频率和资源消耗</p>
            </div>
          </div>
          
          <div>
            <label class="block text-sm font-semibold text-gray-700 mb-3">时间窗口 (分钟)</label>
            <input 
              v-model="form.rateLimitWindow" 
              type="number" 
              min="1"
              placeholder="留空表示无限制" 
              class="form-input w-full"
            >
            <p class="text-xs text-gray-500 mt-2">设置一个时间段（以分钟为单位），用于计算速率限制</p>
          </div>
          
          <div>
            <label class="block text-sm font-semibold text-gray-700 mb-3">时间窗口内的请求次数限制</label>
            <input 
              v-model="form.rateLimitRequests" 
              type="number" 
              min="1"
              placeholder="留空表示无限制" 
              class="form-input w-full"
            >
            <p class="text-xs text-gray-500 mt-2">在时间窗口内允许的最大请求次数（需要先设置时间窗口）</p>
          </div>
          
          <div>
            <label class="block text-sm font-semibold text-gray-700 mb-3">时间窗口内的 Token 使用量限制</label>
            <input 
              v-model="form.tokenLimit" 
              type="number" 
              min="0"
              placeholder="0 表示无限制" 
              class="form-input w-full"
            >
            <p class="text-xs text-gray-500 mt-2">在时间窗口内允许消耗的最大 Token 数量（需要先设置时间窗口），0 或留空表示无限制</p>
          </div>
          
          <!-- 示例说明 -->
          <div class="bg-blue-100 rounded-lg p-3 mt-3">
            <h5 class="text-sm font-semibold text-blue-800 mb-2">💡 使用示例</h5>
            <div class="text-xs text-blue-700 space-y-1">
              <p><strong>示例1:</strong> 时间窗口=60，请求次数限制=100</p>
              <p class="ml-4">→ 每60分钟内最多允许100次请求</p>
              <p class="mt-2"><strong>示例2:</strong> 时间窗口=10，Token限制=50000</p>
              <p class="ml-4">→ 每10分钟内最多消耗50,000个Token</p>
              <p class="mt-2"><strong>示例3:</strong> 时间窗口=30，请求次数限制=50，Token限制=100000</p>
              <p class="ml-4">→ 每30分钟内最多50次请求且总Token不超过100,000</p>
            </div>
          </div>
        </div>
        
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-3">每日费用限制 (美元)</label>
          <div class="space-y-3">
            <div class="flex gap-2">
              <button type="button" @click="form.dailyCostLimit = '50'" class="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium">$50</button>
              <button type="button" @click="form.dailyCostLimit = '100'" class="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium">$100</button>
              <button type="button" @click="form.dailyCostLimit = '200'" class="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium">$200</button>
              <button type="button" @click="form.dailyCostLimit = ''" class="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium">自定义</button>
            </div>
            <input 
              v-model="form.dailyCostLimit" 
              type="number" 
              min="0"
              step="0.01"
              placeholder="0 表示无限制" 
              class="form-input w-full"
            >
            <p class="text-xs text-gray-500">设置此 API Key 每日的费用限制，超过限制将拒绝请求，0 或留空表示无限制</p>
          </div>
        </div>
        
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-3">并发限制</label>
          <input 
            v-model="form.concurrencyLimit" 
            type="number" 
            min="0"
            placeholder="0 表示无限制" 
            class="form-input w-full"
          >
          <p class="text-xs text-gray-500 mt-2">设置此 API Key 可同时处理的最大请求数</p>
        </div>
        
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-3">服务权限</label>
          <div class="flex gap-4">
            <label class="flex items-center cursor-pointer">
              <input 
                type="radio" 
                v-model="form.permissions" 
                value="all" 
                class="mr-2"
              >
              <span class="text-sm text-gray-700">全部服务</span>
            </label>
            <label class="flex items-center cursor-pointer">
              <input 
                type="radio" 
                v-model="form.permissions" 
                value="claude" 
                class="mr-2"
              >
              <span class="text-sm text-gray-700">仅 Claude</span>
            </label>
            <label class="flex items-center cursor-pointer">
              <input 
                type="radio" 
                v-model="form.permissions" 
                value="gemini" 
                class="mr-2"
              >
              <span class="text-sm text-gray-700">仅 Gemini</span>
            </label>
          </div>
          <p class="text-xs text-gray-500 mt-2">控制此 API Key 可以访问哪些服务</p>
        </div>
        
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-3">专属账号绑定</label>
          <div class="grid grid-cols-1 gap-3">
            <div>
              <label class="block text-sm font-medium text-gray-600 mb-1">Claude 专属账号</label>
              <select 
                v-model="form.claudeAccountId" 
                class="form-input w-full"
                :disabled="form.permissions === 'gemini'"
              >
                <option value="">使用共享账号池</option>
                <option 
                  v-for="account in accounts.claude" 
                  :key="account.id" 
                  :value="account.id"
                >
                  {{ account.name }} ({{ account.status === 'active' ? '正常' : '异常' }})
                </option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-600 mb-1">Gemini 专属账号</label>
              <select 
                v-model="form.geminiAccountId" 
                class="form-input w-full"
                :disabled="form.permissions === 'claude'"
              >
                <option value="">使用共享账号池</option>
                <option 
                  v-for="account in accounts.gemini" 
                  :key="account.id" 
                  :value="account.id"
                >
                  {{ account.name }} ({{ account.status === 'active' ? '正常' : '异常' }})
                </option>
              </select>
            </div>
          </div>
          <p class="text-xs text-gray-500 mt-2">修改绑定账号将影响此API Key的请求路由</p>
        </div>
        
        <div>
          <div class="flex items-center mb-3">
            <input 
              type="checkbox" 
              v-model="form.enableModelRestriction" 
              id="editEnableModelRestriction"
              class="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
            >
            <label for="editEnableModelRestriction" class="ml-2 text-sm font-semibold text-gray-700 cursor-pointer">
              启用模型限制
            </label>
          </div>
          
          <div v-if="form.enableModelRestriction" class="space-y-3">
            <div>
              <label class="block text-sm font-medium text-gray-600 mb-2">限制的模型列表</label>
              <div class="flex flex-wrap gap-2 mb-3 min-h-[32px] p-2 bg-gray-50 rounded-lg border border-gray-200">
                <span 
                  v-for="(model, index) in form.restrictedModels" 
                  :key="index"
                  class="inline-flex items-center px-3 py-1 rounded-full text-sm bg-red-100 text-red-800"
                >
                  {{ model }}
                  <button 
                    type="button"
                    @click="removeRestrictedModel(index)"
                    class="ml-2 text-red-600 hover:text-red-800"
                  >
                    <i class="fas fa-times text-xs"></i>
                  </button>
                </span>
                <span v-if="form.restrictedModels.length === 0" class="text-gray-400 text-sm">
                  暂无限制的模型
                </span>
              </div>
              <div class="flex gap-2">
                <input 
                  v-model="form.modelInput"
                  @keydown.enter.prevent="addRestrictedModel"
                  type="text"
                  placeholder="输入模型名称，按回车添加"
                  class="form-input flex-1"
                >
                <button 
                  type="button"
                  @click="addRestrictedModel"
                  class="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                >
                  <i class="fas fa-plus"></i>
                </button>
              </div>
              <p class="text-xs text-gray-500 mt-2">设置此API Key无法访问的模型，例如：claude-opus-4-20250514</p>
            </div>
          </div>
        </div>
        
        <!-- 客户端限制 -->
        <div>
          <div class="flex items-center mb-3">
            <input 
              type="checkbox" 
              v-model="form.enableClientRestriction" 
              id="editEnableClientRestriction"
              class="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
            >
            <label for="editEnableClientRestriction" class="ml-2 text-sm font-semibold text-gray-700 cursor-pointer">
              启用客户端限制
            </label>
          </div>
          
          <div v-if="form.enableClientRestriction" class="space-y-3">
            <div>
              <label class="block text-sm font-medium text-gray-600 mb-2">允许的客户端</label>
              <p class="text-xs text-gray-500 mb-3">勾选允许使用此API Key的客户端</p>
              <div class="space-y-2">
                <div v-for="client in supportedClients" :key="client.id" class="flex items-start">
                  <input 
                    type="checkbox" 
                    :id="`edit_client_${client.id}`"
                    :value="client.id"
                    v-model="form.allowedClients"
                    class="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 mt-0.5"
                  >
                  <label :for="`edit_client_${client.id}`" class="ml-2 flex-1 cursor-pointer">
                    <span class="text-sm font-medium text-gray-700">{{ client.name }}</span>
                    <span class="text-xs text-gray-500 block">{{ client.description }}</span>
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <div class="flex gap-3 pt-4">
          <button 
            type="button" 
            @click="$emit('close')" 
            class="flex-1 px-6 py-3 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200 transition-colors"
          >
            取消
          </button>
          <button 
            type="submit" 
            :disabled="loading"
            class="btn btn-primary flex-1 py-3 px-6 font-semibold"
          >
            <div v-if="loading" class="loading-spinner mr-2"></div>
            <i v-else class="fas fa-save mr-2"></i>
            {{ loading ? '保存中...' : '保存修改' }}
          </button>
        </div>
      </form>
    </div>
  </div>
  </Teleport>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { showToast } from '@/utils/toast'
import { useAuthStore } from '@/stores/auth'
import { useClientsStore } from '@/stores/clients'
import { apiClient } from '@/config/api'

const props = defineProps({
  apiKey: {
    type: Object,
    required: true
  },
  accounts: {
    type: Object,
    default: () => ({ claude: [], gemini: [] })
  }
})

const emit = defineEmits(['close', 'success'])

const authStore = useAuthStore()
const clientsStore = useClientsStore()
const loading = ref(false)

// 支持的客户端列表
const supportedClients = ref([])

// 标签相关
const newTag = ref('')

// 表单数据
const form = reactive({
  name: '',
  tokenLimit: '',
  rateLimitWindow: '',
  rateLimitRequests: '',
  concurrencyLimit: '',
  dailyCostLimit: '',
  permissions: 'all',
  claudeAccountId: '',
  geminiAccountId: '',
  enableModelRestriction: false,
  restrictedModels: [],
  modelInput: '',
  enableClientRestriction: false,
  allowedClients: [],
  tags: []
})


// 添加限制的模型
const addRestrictedModel = () => {
  if (form.modelInput && !form.restrictedModels.includes(form.modelInput)) {
    form.restrictedModels.push(form.modelInput)
    form.modelInput = ''
  }
}

// 移除限制的模型
const removeRestrictedModel = (index) => {
  form.restrictedModels.splice(index, 1)
}

// 标签管理方法
const addTag = () => {
  if (newTag.value && newTag.value.trim()) {
    const tag = newTag.value.trim()
    if (!form.tags.includes(tag)) {
      form.tags.push(tag)
    }
    newTag.value = ''
  }
}

const removeTag = (index) => {
  form.tags.splice(index, 1)
}

// 更新 API Key
const updateApiKey = async () => {
  loading.value = true
  
  try {
    // 准备提交的数据
    const data = {
      tokenLimit: form.tokenLimit !== '' && form.tokenLimit !== null ? parseInt(form.tokenLimit) : 0,
      rateLimitWindow: form.rateLimitWindow !== '' && form.rateLimitWindow !== null ? parseInt(form.rateLimitWindow) : 0,
      rateLimitRequests: form.rateLimitRequests !== '' && form.rateLimitRequests !== null ? parseInt(form.rateLimitRequests) : 0,
      concurrencyLimit: form.concurrencyLimit !== '' && form.concurrencyLimit !== null ? parseInt(form.concurrencyLimit) : 0,
      dailyCostLimit: form.dailyCostLimit !== '' && form.dailyCostLimit !== null ? parseFloat(form.dailyCostLimit) : 0,
      permissions: form.permissions,
      claudeAccountId: form.claudeAccountId || null,
      geminiAccountId: form.geminiAccountId || null,
      tags: form.tags
    }
    
    // 模型限制 - 始终提交这些字段
    data.enableModelRestriction = form.enableModelRestriction
    data.restrictedModels = form.restrictedModels
    
    // 客户端限制 - 始终提交这些字段
    data.enableClientRestriction = form.enableClientRestriction
    data.allowedClients = form.allowedClients
    
    const result = await apiClient.put(`/admin/api-keys/${props.apiKey.id}`, data)
    
    if (result.success) {
      emit('success')
      emit('close')
    } else {
      showToast(result.message || '更新失败', 'error')
    }
  } catch (error) {
    showToast('更新失败', 'error')
  } finally {
    loading.value = false
  }
}

// 初始化表单数据
onMounted(async () => {
  // 加载支持的客户端
  supportedClients.value = await clientsStore.loadSupportedClients()
  
  form.name = props.apiKey.name
  form.tokenLimit = props.apiKey.tokenLimit || ''
  form.rateLimitWindow = props.apiKey.rateLimitWindow || ''
  form.rateLimitRequests = props.apiKey.rateLimitRequests || ''
  form.concurrencyLimit = props.apiKey.concurrencyLimit || ''
  form.dailyCostLimit = props.apiKey.dailyCostLimit || ''
  form.permissions = props.apiKey.permissions || 'all'
  form.claudeAccountId = props.apiKey.claudeAccountId || ''
  form.geminiAccountId = props.apiKey.geminiAccountId || ''
  form.restrictedModels = props.apiKey.restrictedModels || []
  form.allowedClients = props.apiKey.allowedClients || []
  form.tags = props.apiKey.tags || []
  form.enableModelRestriction = form.restrictedModels.length > 0
  form.enableClientRestriction = form.allowedClients.length > 0
})
</script>

<style scoped>
/* 表单样式由全局样式提供 */
</style>