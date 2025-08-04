<template>
  <Teleport to="body">
    <div class="fixed inset-0 modal z-50 flex items-center justify-center p-3 sm:p-4">
      <div class="modal-content w-full max-w-4xl p-4 sm:p-6 md:p-8 mx-auto max-h-[90vh] flex flex-col">
        <div class="flex items-center justify-between mb-4 sm:mb-6">
          <div class="flex items-center gap-2 sm:gap-3">
            <div class="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg sm:rounded-xl flex items-center justify-center">
              <i class="fas fa-edit text-white text-sm sm:text-base" />
            </div>
            <h3 class="text-lg sm:text-xl font-bold text-gray-900">
              编辑 API Key
            </h3>
          </div>
          <button 
            class="text-gray-400 hover:text-gray-600 transition-colors p-1"
            @click="$emit('close')"
          >
            <i class="fas fa-times text-lg sm:text-xl" />
          </button>
        </div>
      
        <form
          class="space-y-4 sm:space-y-6 modal-scroll-content custom-scrollbar flex-1"
          @submit.prevent="updateApiKey"
        >
          <div>
            <label class="block text-xs sm:text-sm font-semibold text-gray-700 mb-1.5 sm:mb-3">名称</label>
            <input 
              :value="form.name" 
              type="text" 
              disabled
              class="form-input w-full bg-gray-100 cursor-not-allowed text-sm"
            >
            <p class="text-xs text-gray-500 mt-1 sm:mt-2">
              名称不可修改
            </p>
          </div>
        
          <!-- 标签 -->
          <div>
            <label class="block text-xs sm:text-sm font-semibold text-gray-700 mb-1.5 sm:mb-3">标签</label>
            <div class="space-y-4">
              <!-- 已选择的标签 -->
              <div v-if="form.tags.length > 0">
                <div class="text-xs font-medium text-gray-600 mb-2">
                  已选择的标签:
                </div>
                <div class="flex flex-wrap gap-2">
                  <span
                    v-for="(tag, index) in form.tags"
                    :key="'selected-' + index" 
                    class="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-800 text-sm rounded-full"
                  >
                    {{ tag }}
                    <button
                      type="button"
                      class="ml-1 hover:text-blue-900" 
                      @click="removeTag(index)"
                    >
                      <i class="fas fa-times text-xs" />
                    </button>
                  </span>
                </div>
              </div>
            
              <!-- 可选择的已有标签 -->
              <div v-if="unselectedTags.length > 0">
                <div class="text-xs font-medium text-gray-600 mb-2">
                  点击选择已有标签:
                </div>
                <div class="flex flex-wrap gap-2">
                  <button
                    v-for="tag in unselectedTags"
                    :key="'available-' + tag"
                    type="button"
                    class="inline-flex items-center gap-1 px-3 py-1 bg-gray-100 text-gray-700 text-sm rounded-full hover:bg-blue-100 hover:text-blue-700 transition-colors"
                    @click="selectTag(tag)"
                  >
                    <i class="fas fa-tag text-gray-500 text-xs" />
                    {{ tag }}
                  </button>
                </div>
              </div>
            
              <!-- 创建新标签 -->
              <div>
                <div class="text-xs font-medium text-gray-600 mb-2">
                  创建新标签:
                </div>
                <div class="flex gap-2">
                  <input 
                    v-model="newTag" 
                    type="text" 
                    class="form-input flex-1"
                    placeholder="输入新标签名称"
                    @keypress.enter.prevent="addTag"
                  >
                  <button
                    type="button"
                    class="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors" 
                    @click="addTag"
                  >
                    <i class="fas fa-plus" />
                  </button>
                </div>
              </div>
            
              <p class="text-xs text-gray-500">
                用于标记不同团队或用途，方便筛选管理
              </p>
            </div>
          </div>
        
          <!-- 速率限制设置 -->
          <div class="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <div class="flex items-center gap-2 mb-2">
              <div class="w-6 h-6 bg-blue-500 rounded flex items-center justify-center flex-shrink-0">
                <i class="fas fa-tachometer-alt text-white text-xs" />
              </div>
              <h4 class="font-semibold text-gray-800 text-sm">
                速率限制设置 (可选)
              </h4>
            </div>
          
            <div class="space-y-2">
              <div class="grid grid-cols-1 lg:grid-cols-3 gap-2">
                <div>
                  <label class="block text-xs font-medium text-gray-700 mb-1">时间窗口 (分钟)</label>
                  <input 
                    v-model="form.rateLimitWindow" 
                    type="number" 
                    min="1"
                    placeholder="无限制" 
                    class="form-input w-full text-sm"
                  >
                  <p class="text-xs text-gray-500 mt-0.5 ml-2">
                    时间段单位
                  </p>
                </div>
              
                <div>
                  <label class="block text-xs font-medium text-gray-700 mb-1">请求次数限制</label>
                  <input 
                    v-model="form.rateLimitRequests" 
                    type="number" 
                    min="1"
                    placeholder="无限制" 
                    class="form-input w-full text-sm"
                  >
                  <p class="text-xs text-gray-500 mt-0.5 ml-2">
                    窗口内最大请求
                  </p>
                </div>
              
                <div>
                  <label class="block text-xs font-medium text-gray-700 mb-1">Token 限制</label>
                  <input 
                    v-model="form.tokenLimit" 
                    type="number" 
                    placeholder="无限制" 
                    class="form-input w-full text-sm"
                  >
                  <p class="text-xs text-gray-500 mt-0.5 ml-2">
                    窗口内最大Token
                  </p>
                </div>
              </div>
            
              <!-- 示例说明 -->
              <div class="bg-blue-100 rounded-lg p-2">
                <h5 class="text-xs font-semibold text-blue-800 mb-1">
                  💡 使用示例
                </h5>
                <div class="text-xs text-blue-700 space-y-0.5">
                  <div><strong>示例1:</strong> 时间窗口=60，请求次数=1000 → 每60分钟最多1000次请求</div>
                  <div><strong>示例2:</strong> 时间窗口=1，Token=10000 → 每分钟最多10,000个Token</div>
                  <div><strong>示例3:</strong> 窗口=30，请求=50，Token=100000 → 每30分钟50次请求且不超10万Token</div>
                </div>
              </div>
            </div>
          </div>
        
          <div>
            <label class="block text-sm font-semibold text-gray-700 mb-3">每日费用限制 (美元)</label>
            <div class="space-y-3">
              <div class="flex gap-2">
                <button
                  type="button"
                  class="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium"
                  @click="form.dailyCostLimit = '50'"
                >
                  $50
                </button>
                <button
                  type="button"
                  class="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium"
                  @click="form.dailyCostLimit = '100'"
                >
                  $100
                </button>
                <button
                  type="button"
                  class="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium"
                  @click="form.dailyCostLimit = '200'"
                >
                  $200
                </button>
                <button
                  type="button"
                  class="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium"
                  @click="form.dailyCostLimit = ''"
                >
                  自定义
                </button>
              </div>
              <input 
                v-model="form.dailyCostLimit" 
                type="number" 
                min="0"
                step="0.01"
                placeholder="0 表示无限制" 
                class="form-input w-full"
              >
              <p class="text-xs text-gray-500">
                设置此 API Key 每日的费用限制，超过限制将拒绝请求，0 或留空表示无限制
              </p>
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
            <p class="text-xs text-gray-500 mt-2">
              设置此 API Key 可同时处理的最大请求数
            </p>
          </div>
        
          <div>
            <label class="block text-sm font-semibold text-gray-700 mb-3">服务权限</label>
            <div class="flex gap-4">
              <label class="flex items-center cursor-pointer">
                <input 
                  v-model="form.permissions" 
                  type="radio" 
                  value="all" 
                  class="mr-2"
                >
                <span class="text-sm text-gray-700">全部服务</span>
              </label>
              <label class="flex items-center cursor-pointer">
                <input 
                  v-model="form.permissions" 
                  type="radio" 
                  value="claude" 
                  class="mr-2"
                >
                <span class="text-sm text-gray-700">仅 Claude</span>
              </label>
              <label class="flex items-center cursor-pointer">
                <input 
                  v-model="form.permissions" 
                  type="radio" 
                  value="gemini" 
                  class="mr-2"
                >
                <span class="text-sm text-gray-700">仅 Gemini</span>
              </label>
            </div>
            <p class="text-xs text-gray-500 mt-2">
              控制此 API Key 可以访问哪些服务
            </p>
          </div>
        
          <div>
            <div class="flex items-center justify-between mb-3">
              <label class="text-sm font-semibold text-gray-700">专属账号绑定</label>
              <button
                type="button"
                class="text-blue-600 hover:text-blue-800 text-sm flex items-center gap-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="刷新账号列表"
                :disabled="accountsLoading"
                @click="refreshAccounts"
              >
                <i :class="['fas', accountsLoading ? 'fa-spinner fa-spin' : 'fa-sync-alt', 'text-xs']" />
                <span>{{ accountsLoading ? '刷新中...' : '刷新账号' }}</span>
              </button>
            </div>
            <div class="grid grid-cols-1 gap-3">
              <div>
                <label class="block text-sm font-medium text-gray-600 mb-1">Claude 专属账号</label>
                <AccountSelector
                  v-model="form.claudeAccountId"
                  platform="claude"
                  :accounts="localAccounts.claude"
                  :groups="localAccounts.claudeGroups"
                  :disabled="form.permissions === 'gemini'"
                  placeholder="请选择Claude账号"
                  default-option-text="使用共享账号池"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-600 mb-1">Gemini 专属账号</label>
                <AccountSelector
                  v-model="form.geminiAccountId"
                  platform="gemini"
                  :accounts="localAccounts.gemini"
                  :groups="localAccounts.geminiGroups"
                  :disabled="form.permissions === 'claude'"
                  placeholder="请选择Gemini账号"
                  default-option-text="使用共享账号池"
                />
              </div>
            </div>
            <p class="text-xs text-gray-500 mt-2">
              修改绑定账号将影响此API Key的请求路由
            </p>
          </div>
        
          <div>
            <div class="flex items-center mb-3">
              <input 
                id="editEnableModelRestriction" 
                v-model="form.enableModelRestriction" 
                type="checkbox"
                class="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
              >
              <label
                for="editEnableModelRestriction"
                class="ml-2 text-sm font-semibold text-gray-700 cursor-pointer"
              >
                启用模型限制
              </label>
            </div>
          
            <div
              v-if="form.enableModelRestriction"
              class="space-y-3"
            >
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
                      class="ml-2 text-red-600 hover:text-red-800"
                      @click="removeRestrictedModel(index)"
                    >
                      <i class="fas fa-times text-xs" />
                    </button>
                  </span>
                  <span
                    v-if="form.restrictedModels.length === 0"
                    class="text-gray-400 text-sm"
                  >
                    暂无限制的模型
                  </span>
                </div>
                <div class="flex gap-2">
                  <input 
                    v-model="form.modelInput"
                    type="text"
                    placeholder="输入模型名称，按回车添加"
                    class="form-input flex-1"
                    @keydown.enter.prevent="addRestrictedModel"
                  >
                  <button 
                    type="button"
                    class="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                    @click="addRestrictedModel"
                  >
                    <i class="fas fa-plus" />
                  </button>
                </div>
                <p class="text-xs text-gray-500 mt-2">
                  设置此API Key无法访问的模型，例如：claude-opus-4-20250514
                </p>
              </div>
            </div>
          </div>
        
          <!-- 客户端限制 -->
          <div>
            <div class="flex items-center mb-3">
              <input 
                id="editEnableClientRestriction" 
                v-model="form.enableClientRestriction" 
                type="checkbox"
                class="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
              >
              <label
                for="editEnableClientRestriction"
                class="ml-2 text-sm font-semibold text-gray-700 cursor-pointer"
              >
                启用客户端限制
              </label>
            </div>
          
            <div
              v-if="form.enableClientRestriction"
              class="space-y-3"
            >
              <div>
                <label class="block text-sm font-medium text-gray-600 mb-2">允许的客户端</label>
                <p class="text-xs text-gray-500 mb-3">
                  勾选允许使用此API Key的客户端
                </p>
                <div class="space-y-2">
                  <div
                    v-for="client in supportedClients"
                    :key="client.id"
                    class="flex items-start"
                  >
                    <input 
                      :id="`edit_client_${client.id}`" 
                      v-model="form.allowedClients"
                      type="checkbox"
                      :value="client.id"
                      class="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 mt-0.5"
                    >
                    <label
                      :for="`edit_client_${client.id}`"
                      class="ml-2 flex-1 cursor-pointer"
                    >
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
              class="flex-1 px-6 py-3 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200 transition-colors" 
              @click="$emit('close')"
            >
              取消
            </button>
            <button 
              type="submit" 
              :disabled="loading"
              class="btn btn-primary flex-1 py-3 px-6 font-semibold"
            >
              <div
                v-if="loading"
                class="loading-spinner mr-2"
              />
              <i
                v-else
                class="fas fa-save mr-2"
              />
              {{ loading ? '保存中...' : '保存修改' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { showToast } from '@/utils/toast'
import { useAuthStore } from '@/stores/auth'
import { useClientsStore } from '@/stores/clients'
import { useApiKeysStore } from '@/stores/apiKeys'
import { apiClient } from '@/config/api'
import AccountSelector from '@/components/common/AccountSelector.vue'

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
const apiKeysStore = useApiKeysStore()
const loading = ref(false)
const accountsLoading = ref(false)
const localAccounts = ref({ claude: [], gemini: [], claudeGroups: [], geminiGroups: [] })

// 支持的客户端列表
const supportedClients = ref([])

// 标签相关
const newTag = ref('')
const availableTags = ref([])

// 计算未选择的标签
const unselectedTags = computed(() => {
  return availableTags.value.filter(tag => !form.tags.includes(tag))
})

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

const selectTag = (tag) => {
  if (!form.tags.includes(tag)) {
    form.tags.push(tag)
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
      tags: form.tags
    }
    
    // 处理Claude账户绑定（区分OAuth和Console）
    if (form.claudeAccountId) {
      if (form.claudeAccountId.startsWith('console:')) {
        // Claude Console账户
        data.claudeConsoleAccountId = form.claudeAccountId.substring(8);
      } else if (!form.claudeAccountId.startsWith('group:')) {
        // Claude OAuth账户（非分组）
        data.claudeAccountId = form.claudeAccountId;
      } else {
        // 分组
        data.claudeAccountId = form.claudeAccountId;
      }
    } else {
      data.claudeAccountId = null;
    }
    
    // Gemini账户绑定
    if (form.geminiAccountId) {
      data.geminiAccountId = form.geminiAccountId;
    } else {
      data.geminiAccountId = null;
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

// 刷新账号列表
const refreshAccounts = async () => {
  accountsLoading.value = true
  try {
    const [claudeData, claudeConsoleData, geminiData, groupsData] = await Promise.all([
      apiClient.get('/admin/claude-accounts'),
      apiClient.get('/admin/claude-console-accounts'),
      apiClient.get('/admin/gemini-accounts'),
      apiClient.get('/admin/account-groups')
    ])
    
    // 合并Claude OAuth账户和Claude Console账户
    const claudeAccounts = []
    
    if (claudeData.success) {
      claudeData.data?.forEach(account => {
        claudeAccounts.push({
          ...account,
          platform: 'claude-oauth',
          isDedicated: account.accountType === 'dedicated' // 保留以便向后兼容
        })
      })
    }
    
    if (claudeConsoleData.success) {
      claudeConsoleData.data?.forEach(account => {
        claudeAccounts.push({
          ...account,
          platform: 'claude-console',
          isDedicated: account.accountType === 'dedicated' // 保留以便向后兼容
        })
      })
    }
    
    localAccounts.value.claude = claudeAccounts
    
    if (geminiData.success) {
      localAccounts.value.gemini = (geminiData.data || []).map(account => ({
        ...account,
        isDedicated: account.accountType === 'dedicated'
      }))
    }
    
    // 处理分组数据
    if (groupsData.success) {
      const allGroups = groupsData.data || []
      localAccounts.value.claudeGroups = allGroups.filter(g => g.platform === 'claude')
      localAccounts.value.geminiGroups = allGroups.filter(g => g.platform === 'gemini')
    }
    
    showToast('账号列表已刷新', 'success')
  } catch (error) {
    showToast('刷新账号列表失败', 'error')
  } finally {
    accountsLoading.value = false
  }
}

// 初始化表单数据
onMounted(async () => {
  // 加载支持的客户端和已存在的标签
  supportedClients.value = await clientsStore.loadSupportedClients()
  availableTags.value = await apiKeysStore.fetchTags()
  
  // 初始化账号数据
  if (props.accounts) {
    localAccounts.value = {
      claude: props.accounts.claude || [],
      gemini: props.accounts.gemini || [],
      claudeGroups: props.accounts.claudeGroups || [],
      geminiGroups: props.accounts.geminiGroups || []
    }
  }
  
  form.name = props.apiKey.name
  form.tokenLimit = props.apiKey.tokenLimit || ''
  form.rateLimitWindow = props.apiKey.rateLimitWindow || ''
  form.rateLimitRequests = props.apiKey.rateLimitRequests || ''
  form.concurrencyLimit = props.apiKey.concurrencyLimit || ''
  form.dailyCostLimit = props.apiKey.dailyCostLimit || ''
  form.permissions = props.apiKey.permissions || 'all'
  // 处理 Claude 账号（区分 OAuth 和 Console）
  if (props.apiKey.claudeConsoleAccountId) {
    form.claudeAccountId = `console:${props.apiKey.claudeConsoleAccountId}`
  } else {
    form.claudeAccountId = props.apiKey.claudeAccountId || ''
  }
  form.geminiAccountId = props.apiKey.geminiAccountId || ''
  form.restrictedModels = props.apiKey.restrictedModels || []
  form.allowedClients = props.apiKey.allowedClients || []
  form.tags = props.apiKey.tags || []
  // 从后端数据中获取实际的启用状态，而不是根据数组长度推断
  form.enableModelRestriction = props.apiKey.enableModelRestriction || false
  form.enableClientRestriction = props.apiKey.enableClientRestriction || false
})
</script>

<style scoped>
/* 表单样式由全局样式提供 */
</style>