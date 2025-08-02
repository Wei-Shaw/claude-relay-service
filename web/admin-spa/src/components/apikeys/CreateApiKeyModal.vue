<template>
  <Teleport to="body">
    <div class="fixed inset-0 modal z-50 flex items-center justify-center p-3 sm:p-4">
      <div class="modal-content w-full max-w-4xl p-4 sm:p-6 mx-auto max-h-[90vh] flex flex-col">
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-2 sm:gap-3">
            <div class="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg sm:rounded-xl flex items-center justify-center">
              <i class="fas fa-key text-white text-sm sm:text-base" />
            </div>
            <h3 class="text-lg sm:text-xl font-bold text-gray-900">
              创建新的 API Key
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
          class="space-y-4 modal-scroll-content custom-scrollbar flex-1"
          @submit.prevent="createApiKey"
        >
          <!-- 创建类型选择 -->
          <div class="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-3 sm:p-4 border border-blue-200">
            <div :class="['flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3', form.createType === 'batch' ? 'mb-3' : '']">
              <label class="text-xs sm:text-sm font-semibold text-gray-700 flex items-center h-full">创建类型</label>
              <div class="flex gap-3 sm:gap-4 items-center">
                <label class="flex items-center cursor-pointer">
                  <input 
                    v-model="form.createType" 
                    type="radio" 
                    value="single" 
                    class="mr-1.5 sm:mr-2 text-blue-600"
                  >
                  <span class="text-xs sm:text-sm text-gray-700 flex items-center">
                    <i class="fas fa-key mr-1 text-xs" />
                    单个创建
                  </span>
                </label>
                <label class="flex items-center cursor-pointer">
                  <input 
                    v-model="form.createType" 
                    type="radio" 
                    value="batch" 
                    class="mr-1.5 sm:mr-2 text-blue-600"
                  >
                  <span class="text-xs sm:text-sm text-gray-700 flex items-center">
                    <i class="fas fa-layer-group mr-1 text-xs" />
                    批量创建
                  </span>
                </label>
              </div>
            </div>
            
            <!-- 批量创建数量输入 -->
            <div
              v-if="form.createType === 'batch'"
              class="mt-3"
            >
              <div class="flex items-center gap-4">
                <div class="flex-1">
                  <label class="block text-xs font-medium text-gray-600 mb-1">创建数量</label>
                  <div class="flex items-center gap-2">
                    <input 
                      v-model.number="form.batchCount" 
                      type="number" 
                      min="2"
                      max="500"
                      required 
                      class="form-input w-full text-sm"
                      placeholder="输入数量 (2-500)"
                    >
                    <div class="text-xs text-gray-500 whitespace-nowrap">
                      最大支持 500 个
                    </div>
                  </div>
                </div>
              </div>
              <p class="text-xs text-amber-600 mt-2 flex items-start">
                <i class="fas fa-info-circle mr-1 mt-0.5 flex-shrink-0" />
                <span>批量创建时，每个 Key 的名称会自动添加序号后缀，例如：{{ form.name || 'MyKey' }}_1, {{ form.name || 'MyKey' }}_2 ...</span>
              </p>
            </div>
          </div>
          
          <div>
            <label class="block text-xs sm:text-sm font-semibold text-gray-700 mb-1.5 sm:mb-2">名称 <span class="text-red-500">*</span></label>
            <input 
              v-model="form.name" 
              type="text" 
              required 
              class="form-input w-full text-sm"
              :class="{ 'border-red-500': errors.name }"
              :placeholder="form.createType === 'batch' ? '输入基础名称（将自动添加序号）' : '为您的 API Key 取一个名称'"
              @input="errors.name = ''"
            >
            <p
              v-if="errors.name"
              class="text-red-500 text-xs mt-1"
            >
              {{ errors.name }}
            </p>
          </div>
        
          <!-- 标签 -->
          <div>
            <label class="block text-sm font-semibold text-gray-700 mb-2">标签</label>
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
            <label class="block text-sm font-semibold text-gray-700 mb-2">每日费用限制 (美元)</label>
            <div class="space-y-2">
              <div class="flex gap-2">
                <button
                  type="button"
                  class="px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded text-xs font-medium"
                  @click="form.dailyCostLimit = '50'"
                >
                  $50
                </button>
                <button
                  type="button"
                  class="px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded text-xs font-medium"
                  @click="form.dailyCostLimit = '100'"
                >
                  $100
                </button>
                <button
                  type="button"
                  class="px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded text-xs font-medium"
                  @click="form.dailyCostLimit = '200'"
                >
                  $200
                </button>
                <button
                  type="button"
                  class="px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded text-xs font-medium"
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
            <label class="block text-sm font-semibold text-gray-700 mb-2">并发限制 (可选)</label>
            <input 
              v-model="form.concurrencyLimit" 
              type="number" 
              min="0"
              placeholder="0 表示无限制" 
              class="form-input w-full"
            >
            <p class="text-xs text-gray-500 mt-2">
              设置此 API Key 可同时处理的最大请求数，0 或留空表示无限制
            </p>
          </div>
        
          <div>
            <label class="block text-sm font-semibold text-gray-700 mb-2">备注 (可选)</label>
            <textarea 
              v-model="form.description" 
              rows="2" 
              class="form-input w-full resize-none text-sm"
              placeholder="描述此 API Key 的用途..."
            />
          </div>
        
          <div>
            <label class="block text-sm font-semibold text-gray-700 mb-2">有效期限</label>
            <select 
              v-model="form.expireDuration" 
              class="form-input w-full"
              @change="updateExpireAt"
            >
              <option value="">
                永不过期
              </option>
              <option value="1d">
                1 天
              </option>
              <option value="7d">
                7 天
              </option>
              <option value="30d">
                30 天
              </option>
              <option value="90d">
                90 天
              </option>
              <option value="180d">
                180 天
              </option>
              <option value="365d">
                365 天
              </option>
              <option value="custom">
                自定义日期
              </option>
            </select>
            <div
              v-if="form.expireDuration === 'custom'"
              class="mt-3"
            >
              <input 
                v-model="form.customExpireDate" 
                type="datetime-local" 
                class="form-input w-full"
                :min="minDateTime"
                @change="updateCustomExpireAt"
              >
            </div>
            <p
              v-if="form.expiresAt"
              class="text-xs text-gray-500 mt-2"
            >
              将于 {{ formatExpireDate(form.expiresAt) }} 过期
            </p>
          </div>
        
          <div>
            <label class="block text-sm font-semibold text-gray-700 mb-2">服务权限</label>
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
            <div class="flex items-center justify-between mb-2">
              <label class="text-sm font-semibold text-gray-700">专属账号绑定 (可选)</label>
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
                <select 
                  v-model="form.claudeAccountId" 
                  class="form-input w-full"
                  :disabled="form.permissions === 'gemini'"
                >
                  <option value="">
                    使用共享账号池
                  </option>
                  <optgroup
                    v-if="localAccounts.claude.filter(a => a.isDedicated && a.platform === 'claude-oauth').length > 0"
                    label="Claude OAuth 账号"
                  >
                    <option 
                      v-for="account in localAccounts.claude.filter(a => a.isDedicated && a.platform === 'claude-oauth')" 
                      :key="account.id" 
                      :value="account.id"
                    >
                      {{ account.name }} ({{ account.status === 'active' ? '正常' : '异常' }})
                    </option>
                  </optgroup>
                  <optgroup
                    v-if="localAccounts.claude.filter(a => a.isDedicated && a.platform === 'claude-console').length > 0"
                    label="Claude Console 账号"
                  >
                    <option 
                      v-for="account in localAccounts.claude.filter(a => a.isDedicated && a.platform === 'claude-console')" 
                      :key="account.id" 
                      :value="`console:${account.id}`"
                    >
                      {{ account.name }} ({{ account.status === 'active' ? '正常' : '异常' }})
                    </option>
                  </optgroup>
                </select>
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-600 mb-1">Gemini 专属账号</label>
                <select 
                  v-model="form.geminiAccountId" 
                  class="form-input w-full"
                  :disabled="form.permissions === 'claude'"
                >
                  <option value="">
                    使用共享账号池
                  </option>
                  <option 
                    v-for="account in localAccounts.gemini.filter(a => a.isDedicated)" 
                    :key="account.id" 
                    :value="account.id"
                  >
                    {{ account.name }} ({{ account.status === 'active' ? '正常' : '异常' }})
                  </option>
                </select>
              </div>
            </div>
            <p class="text-xs text-gray-500 mt-2">
              选择专属账号后，此API Key将只使用该账号，不选择则使用共享账号池
            </p>
          </div>
        
          <div>
            <div class="flex items-center mb-2">
              <input 
                id="enableModelRestriction" 
                v-model="form.enableModelRestriction" 
                type="checkbox"
                class="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
              >
              <label
                for="enableModelRestriction"
                class="ml-2 text-sm font-semibold text-gray-700 cursor-pointer"
              >
                启用模型限制
              </label>
            </div>
          
            <div
              v-if="form.enableModelRestriction"
              class="space-y-2 bg-red-50 border border-red-200 rounded-lg p-3"
            >
              <div>
                <label class="block text-xs font-medium text-gray-700 mb-1">限制的模型列表</label>
                <div class="flex flex-wrap gap-1 mb-2 min-h-[24px]">
                  <span 
                    v-for="(model, index) in form.restrictedModels" 
                    :key="index"
                    class="inline-flex items-center px-2 py-1 rounded-full text-xs bg-red-100 text-red-800"
                  >
                    {{ model }}
                    <button 
                      type="button"
                      class="ml-1 text-red-600 hover:text-red-800"
                      @click="removeRestrictedModel(index)"
                    >
                      <i class="fas fa-times text-xs" />
                    </button>
                  </span>
                  <span
                    v-if="form.restrictedModels.length === 0"
                    class="text-gray-400 text-xs"
                  >
                    暂无限制的模型
                  </span>
                </div>
                <div class="flex gap-2">
                  <input 
                    v-model="form.modelInput"
                    type="text"
                    placeholder="输入模型名称，按回车添加"
                    class="form-input flex-1 text-sm"
                    @keydown.enter.prevent="addRestrictedModel"
                  >
                  <button 
                    type="button"
                    class="px-3 py-1.5 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors text-sm"
                    @click="addRestrictedModel"
                  >
                    <i class="fas fa-plus" />
                  </button>
                </div>
                <p class="text-xs text-gray-500 mt-1">
                  例如：claude-opus-4-20250514
                </p>
              </div>
            </div>
          </div>
        
          <!-- 客户端限制 -->
          <div>
            <div class="flex items-center mb-2">
              <input 
                id="enableClientRestriction" 
                v-model="form.enableClientRestriction" 
                type="checkbox"
                class="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
              >
              <label
                for="enableClientRestriction"
                class="ml-2 text-sm font-semibold text-gray-700 cursor-pointer"
              >
                启用客户端限制
              </label>
            </div>
          
            <div
              v-if="form.enableClientRestriction"
              class="bg-green-50 border border-green-200 rounded-lg p-3"
            >
              <div>
                <label class="block text-xs font-medium text-gray-700 mb-2">允许的客户端</label>
                <div class="space-y-1">
                  <div
                    v-for="client in supportedClients"
                    :key="client.id"
                    class="flex items-start"
                  >
                    <input 
                      :id="`client_${client.id}`" 
                      v-model="form.allowedClients"
                      type="checkbox"
                      :value="client.id"
                      class="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 mt-0.5"
                    >
                    <label
                      :for="`client_${client.id}`"
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
        
          <div class="flex gap-3 pt-2">
            <button 
              type="button" 
              class="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg font-semibold hover:bg-gray-200 transition-colors text-sm" 
              @click="$emit('close')"
            >
              取消
            </button>
            <button 
              type="submit" 
              :disabled="loading"
              class="btn btn-primary flex-1 py-2.5 px-4 font-semibold text-sm"
            >
              <div
                v-if="loading"
                class="loading-spinner mr-2"
              />
              <i
                v-else
                class="fas fa-plus mr-2"
              />
              {{ loading ? '创建中...' : '创建' }}
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
import { useClientsStore } from '@/stores/clients'
import { useApiKeysStore } from '@/stores/apiKeys'
import { apiClient } from '@/config/api'

const props = defineProps({
  accounts: {
    type: Object,
    default: () => ({ claude: [], gemini: [] })
  }
})

const emit = defineEmits(['close', 'success', 'batch-success'])

const clientsStore = useClientsStore()
const apiKeysStore = useApiKeysStore()
const loading = ref(false)
const accountsLoading = ref(false)
const localAccounts = ref({ claude: [], gemini: [] })

// 表单验证状态
const errors = ref({
  name: ''
})

// 标签相关
const newTag = ref('')
const availableTags = ref([])

// 计算未选择的标签
const unselectedTags = computed(() => {
  return availableTags.value.filter(tag => !form.tags.includes(tag))
})

// 支持的客户端列表
const supportedClients = ref([])

// 表单数据
const form = reactive({
  createType: 'single',
  batchCount: 10,
  name: '',
  description: '',
  tokenLimit: '',
  rateLimitWindow: '',
  rateLimitRequests: '',
  concurrencyLimit: '',
  dailyCostLimit: '',
  expireDuration: '',
  customExpireDate: '',
  expiresAt: null,
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

// 加载支持的客户端和已存在的标签
onMounted(async () => {
  supportedClients.value = await clientsStore.loadSupportedClients()
  availableTags.value = await apiKeysStore.fetchTags()
  // 初始化账号数据
  localAccounts.value = props.accounts
})

// 刷新账号列表
const refreshAccounts = async () => {
  accountsLoading.value = true
  try {
    const [claudeData, claudeConsoleData, geminiData] = await Promise.all([
      apiClient.get('/admin/claude-accounts'),
      apiClient.get('/admin/claude-console-accounts'),
      apiClient.get('/admin/gemini-accounts')
    ])
    
    // 合并Claude OAuth账户和Claude Console账户
    const claudeAccounts = []
    
    if (claudeData.success) {
      claudeData.data?.forEach(account => {
        claudeAccounts.push({
          ...account,
          platform: 'claude-oauth',
          isDedicated: account.accountType === 'dedicated'
        })
      })
    }
    
    if (claudeConsoleData.success) {
      claudeConsoleData.data?.forEach(account => {
        claudeAccounts.push({
          ...account,
          platform: 'claude-console',
          isDedicated: account.accountType === 'dedicated'
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
    
    showToast('账号列表已刷新', 'success')
  } catch (error) {
    showToast('刷新账号列表失败', 'error')
  } finally {
    accountsLoading.value = false
  }
}

// 计算最小日期时间
const minDateTime = computed(() => {
  const now = new Date()
  now.setMinutes(now.getMinutes() + 1)
  return now.toISOString().slice(0, 16)
})

// 更新过期时间
const updateExpireAt = () => {
  if (!form.expireDuration) {
    form.expiresAt = null
    return
  }
  
  if (form.expireDuration === 'custom') {
    return
  }
  
  const now = new Date()
  const duration = form.expireDuration
  const match = duration.match(/(\d+)([dhmy])/)
  
  if (match) {
    const [, value, unit] = match
    const num = parseInt(value)
    
    switch (unit) {
      case 'd':
        now.setDate(now.getDate() + num)
        break
      case 'h':
        now.setHours(now.getHours() + num)
        break
      case 'm':
        now.setMonth(now.getMonth() + num)
        break
      case 'y':
        now.setFullYear(now.getFullYear() + num)
        break
    }
    
    form.expiresAt = now.toISOString()
  }
}

// 更新自定义过期时间
const updateCustomExpireAt = () => {
  if (form.customExpireDate) {
    form.expiresAt = new Date(form.customExpireDate).toISOString()
  }
}

// 格式化过期日期
const formatExpireDate = (dateString) => {
  const date = new Date(dateString)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

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

// 创建 API Key
const createApiKey = async () => {
  // 验证表单
  errors.value.name = ''
  
  if (!form.name || !form.name.trim()) {
    errors.value.name = '请输入API Key名称'
    return
  }
  
  // 批量创建时验证数量
  if (form.createType === 'batch') {
    if (!form.batchCount || form.batchCount < 2 || form.batchCount > 500) {
      showToast('批量创建数量必须在 2-500 之间', 'error')
      return
    }
  }
  
  loading.value = true
  
  try {
    // 准备提交的数据
    const baseData = {
      description: form.description || undefined,
      tokenLimit: form.tokenLimit !== '' && form.tokenLimit !== null ? parseInt(form.tokenLimit) : null,
      rateLimitWindow: form.rateLimitWindow !== '' && form.rateLimitWindow !== null ? parseInt(form.rateLimitWindow) : null,
      rateLimitRequests: form.rateLimitRequests !== '' && form.rateLimitRequests !== null ? parseInt(form.rateLimitRequests) : null,
      concurrencyLimit: form.concurrencyLimit !== '' && form.concurrencyLimit !== null ? parseInt(form.concurrencyLimit) : 0,
      dailyCostLimit: form.dailyCostLimit !== '' && form.dailyCostLimit !== null ? parseFloat(form.dailyCostLimit) : 0,
      expiresAt: form.expiresAt || undefined,
      permissions: form.permissions,
      tags: form.tags.length > 0 ? form.tags : undefined,
      enableModelRestriction: form.enableModelRestriction,
      restrictedModels: form.restrictedModels,
      enableClientRestriction: form.enableClientRestriction,
      allowedClients: form.allowedClients
    }
    
    // 处理Claude账户绑定（区分OAuth和Console）
    if (form.claudeAccountId) {
      if (form.claudeAccountId.startsWith('console:')) {
        // Claude Console账户
        baseData.claudeConsoleAccountId = form.claudeAccountId.substring(8);
      } else {
        // Claude OAuth账户
        baseData.claudeAccountId = form.claudeAccountId;
      }
    }
    
    // Gemini账户绑定
    if (form.geminiAccountId) {
      baseData.geminiAccountId = form.geminiAccountId;
    }
    
    if (form.createType === 'single') {
      // 单个创建
      const data = {
        ...baseData,
        name: form.name
      }
      
      const result = await apiClient.post('/admin/api-keys', data)
      
      if (result.success) {
        showToast('API Key 创建成功', 'success')
        emit('success', result.data)
        emit('close')
      } else {
        showToast(result.message || '创建失败', 'error')
      }
    } else {
      // 批量创建
      const data = {
        ...baseData,
        createType: 'batch',
        baseName: form.name,
        count: form.batchCount
      }
      
      const result = await apiClient.post('/admin/api-keys/batch', data)
      
      if (result.success) {
        showToast(`成功创建 ${result.data.length} 个 API Key`, 'success')
        emit('batch-success', result.data)
        emit('close')
      } else {
        showToast(result.message || '批量创建失败', 'error')
      }
    }
  } catch (error) {
    showToast('创建失败', 'error')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
/* 表单样式由全局样式提供 */
</style>