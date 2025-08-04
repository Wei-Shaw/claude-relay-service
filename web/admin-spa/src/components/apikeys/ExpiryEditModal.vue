<template>
  <Teleport to="body">
    <div 
      v-if="show"
      class="fixed inset-0 modal z-50 flex items-center justify-center p-4"
    >
      <!-- 模态框内容 -->
      <div class="modal-content w-full max-w-lg p-8 mx-auto">
        <!-- 头部 -->
        <div class="flex items-center justify-between mb-6">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl flex items-center justify-center">
              <i class="fas fa-clock text-white" />
            </div>
            <div>
              <h3 class="text-xl font-bold text-gray-900">
                修改过期时间
              </h3>
              <p class="text-sm text-gray-600">
                为 "{{ apiKey.name || 'API Key' }}" 设置新的过期时间
              </p>
            </div>
          </div>
          <button
            class="text-gray-400 hover:text-gray-600 transition-colors"
            @click="$emit('close')"
          >
            <i class="fas fa-times text-xl" />
          </button>
        </div>
        
        <div class="space-y-6">
          <!-- 当前状态显示 -->
          <div class="bg-gradient-to-r from-gray-50 to-gray-100 rounded-lg p-4 border border-gray-200">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-xs text-gray-600 font-medium mb-1">
                  当前过期时间
                </p>
                <p class="text-sm font-semibold text-gray-800">
                  <template v-if="apiKey.expiresAt">
                    {{ formatExpireDate(apiKey.expiresAt) }}
                    <span
                      v-if="getExpiryStatus(apiKey.expiresAt)"
                      class="ml-2 text-xs font-normal"
                      :class="getExpiryStatus(apiKey.expiresAt).class"
                    >
                      ({{ getExpiryStatus(apiKey.expiresAt).text }})
                    </span>
                  </template>
                  <template v-else>
                    <i class="fas fa-infinity mr-1 text-gray-500" />
                    永不过期
                  </template>
                </p>
              </div>
              <div class="w-12 h-12 bg-white rounded-lg flex items-center justify-center shadow-sm">
                <i
                  :class="[
                    'fas fa-hourglass-half text-lg',
                    apiKey.expiresAt && isExpired(apiKey.expiresAt) ? 'text-red-500' : 'text-gray-400'
                  ]"
                />
              </div>
            </div>
          </div>
          
          <!-- 快捷选项 -->
          <div>
            <label class="block text-sm font-semibold text-gray-700 mb-3">选择新的期限</label>
            <div class="grid grid-cols-3 gap-2 mb-3">
              <button
                v-for="option in quickOptions"
                :key="option.value"
                :class="[
                  'px-3 py-2 rounded-lg text-sm font-medium transition-all',
                  localForm.expireDuration === option.value
                    ? 'bg-blue-500 text-white shadow-md'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                ]"
                @click="selectQuickOption(option.value)"
              >
                {{ option.label }}
              </button>
              <button
                :class="[
                  'px-3 py-2 rounded-lg text-sm font-medium transition-all',
                  localForm.expireDuration === 'custom'
                    ? 'bg-blue-500 text-white shadow-md'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                ]"
                @click="selectQuickOption('custom')"
              >
                <i class="fas fa-calendar-alt mr-1" />
                自定义
              </button>
            </div>
          </div>
          
          <!-- 自定义日期选择 -->
          <div
            v-if="localForm.expireDuration === 'custom'"
            class="animate-fadeIn"
          >
            <label class="block text-sm font-semibold text-gray-700 mb-2">选择日期和时间</label>
            <input 
              v-model="localForm.customExpireDate" 
              type="datetime-local" 
              class="form-input w-full"
              :min="minDateTime"
              @change="updateCustomExpiryPreview"
            >
            <p class="text-xs text-gray-500 mt-2">
              选择一个未来的日期和时间作为过期时间
            </p>
          </div>
          
          <!-- 预览新的过期时间 -->
          <div 
            v-if="localForm.expiresAt !== apiKey.expiresAt"
            class="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-4 border border-blue-200"
          >
            <div class="flex items-center justify-between">
              <div>
                <p class="text-xs text-blue-700 font-medium mb-1">
                  <i class="fas fa-arrow-right mr-1" />
                  新的过期时间
                </p>
                <p class="text-sm font-semibold text-blue-900">
                  <template v-if="localForm.expiresAt">
                    {{ formatExpireDate(localForm.expiresAt) }}
                    <span
                      v-if="getExpiryStatus(localForm.expiresAt)"
                      class="ml-2 text-xs font-normal"
                      :class="getExpiryStatus(localForm.expiresAt).class"
                    >
                      ({{ getExpiryStatus(localForm.expiresAt).text }})
                    </span>
                  </template>
                  <template v-else>
                    <i class="fas fa-infinity mr-1" />
                    永不过期
                  </template>
                </p>
              </div>
              <div class="w-12 h-12 bg-white rounded-lg flex items-center justify-center shadow-sm">
                <i class="fas fa-check text-lg text-green-500" />
              </div>
            </div>
          </div>
          
          <!-- 操作按钮 -->
          <div class="flex gap-3 pt-2">
            <button
              class="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg font-semibold hover:bg-gray-200 transition-colors"
              @click="$emit('close')"
            >
              取消
            </button>
            <button
              class="flex-1 btn btn-primary py-2.5 px-4 font-semibold"
              :disabled="saving || localForm.expiresAt === apiKey.expiresAt"
              @click="handleSave"
            >
              <div
                v-if="saving"
                class="loading-spinner mr-2"
              />
              <i
                v-else
                class="fas fa-save mr-2"
              />
              {{ saving ? '保存中...' : '保存更改' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, reactive, computed, watch } from 'vue'

const props = defineProps({
  show: {
    type: Boolean,
    required: true
  },
  apiKey: {
    type: Object,
    required: true
  }
})

const emit = defineEmits(['close', 'save'])

const saving = ref(false)

// 表单数据
const localForm = reactive({
  expireDuration: '',
  customExpireDate: '',
  expiresAt: null
})

// 快捷选项
const quickOptions = [
  { value: '', label: '永不过期' },
  { value: '1d', label: '1 天' },
  { value: '7d', label: '7 天' },
  { value: '30d', label: '30 天' },
  { value: '90d', label: '90 天' },
  { value: '180d', label: '180 天' },
  { value: '365d', label: '1 年' },
  { value: '730d', label: '2 年' }
]

// 计算最小日期时间
const minDateTime = computed(() => {
  const now = new Date()
  now.setMinutes(now.getMinutes() + 1)
  return now.toISOString().slice(0, 16)
})

// 监听显示状态，初始化表单
watch(() => props.show, (newVal) => {
  if (newVal) {
    initializeForm()
  }
})

// 监听 apiKey 变化，重新初始化
watch(() => props.apiKey?.id, (newId) => {
  if (newId && props.show) {
    initializeForm()
  }
})

// 初始化表单
const initializeForm = () => {
  saving.value = false
  
  if (props.apiKey.expiresAt) {
    localForm.expireDuration = 'custom'
    localForm.customExpireDate = new Date(props.apiKey.expiresAt).toISOString().slice(0, 16)
    localForm.expiresAt = props.apiKey.expiresAt
  } else {
    localForm.expireDuration = ''
    localForm.customExpireDate = ''
    localForm.expiresAt = null
  }
}

// 选择快捷选项
const selectQuickOption = (value) => {
  localForm.expireDuration = value
  
  if (!value) {
    localForm.expiresAt = null
    return
  }
  
  if (value === 'custom') {
    return
  }
  
  const now = new Date()
  const match = value.match(/(\d+)([dhmy])/)
  
  if (match) {
    const [, num, unit] = match
    const amount = parseInt(num)
    
    switch (unit) {
      case 'd':
        now.setDate(now.getDate() + amount)
        break
      case 'h':
        now.setHours(now.getHours() + amount)
        break
      case 'm':
        now.setMonth(now.getMonth() + amount)
        break
      case 'y':
        now.setFullYear(now.getFullYear() + amount)
        break
    }
    
    localForm.expiresAt = now.toISOString()
  }
}

// 更新自定义过期时间
const updateCustomExpiryPreview = () => {
  if (localForm.customExpireDate) {
    localForm.expiresAt = new Date(localForm.customExpireDate).toISOString()
  }
}

// 格式化过期日期
const formatExpireDate = (dateString) => {
  if (!dateString) return ''
  const date = new Date(dateString)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

// 检查是否已过期
const isExpired = (dateString) => {
  if (!dateString) return false
  return new Date(dateString) < new Date()
}

// 获取过期状态
const getExpiryStatus = (expiresAt) => {
  if (!expiresAt) return null
  
  const now = new Date()
  const expiryDate = new Date(expiresAt)
  const diffMs = expiryDate - now
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
  
  if (diffMs < 0) {
    return {
      text: '已过期',
      class: 'text-red-600'
    }
  } else if (diffDays <= 7) {
    return {
      text: `${diffDays} 天后过期`,
      class: 'text-orange-600'
    }
  } else if (diffDays <= 30) {
    return {
      text: `${diffDays} 天后过期`,
      class: 'text-yellow-600'
    }
  } else {
    return {
      text: `${Math.ceil(diffDays / 30)} 个月后过期`,
      class: 'text-green-600'
    }
  }
}

// 保存
const handleSave = () => {
  saving.value = true
  emit('save', {
    keyId: props.apiKey.id,
    expiresAt: localForm.expiresAt
  })
}

// 重置保存状态
const resetSaving = () => {
  saving.value = false
}

// 暴露方法给父组件
defineExpose({
  resetSaving
})
</script>

<style scoped>
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-fadeIn {
  animation: fadeIn 0.2s ease-out;
}

.loading-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top: 2px solid white;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  display: inline-block;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
</style>