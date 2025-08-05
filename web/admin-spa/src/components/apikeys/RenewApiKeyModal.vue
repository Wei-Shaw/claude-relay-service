<template>
  <Teleport to="body">
    <div class="fixed inset-0 modal z-50 flex items-center justify-center p-4">
      <div class="modal-content w-full max-w-md p-8 mx-auto max-h-[90vh] flex flex-col">
        <div class="flex items-center justify-between mb-6">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 bg-gradient-to-br from-green-500 to-green-600 rounded-xl flex items-center justify-center">
              <i class="fas fa-clock text-white" />
            </div>
            <h3 class="text-xl font-bold text-gray-900">
              续期 API Key
            </h3>
          </div>
          <button 
            class="text-gray-400 hover:text-gray-600 transition-colors"
            @click="$emit('close')"
          >
            <i class="fas fa-times text-xl" />
          </button>
        </div>
      
        <div class="space-y-6 modal-scroll-content custom-scrollbar flex-1">
          <div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div class="flex items-start gap-3">
              <div class="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center flex-shrink-0">
                <i class="fas fa-info text-white text-sm" />
              </div>
              <div>
                <h4 class="font-semibold text-gray-800 mb-1">
                  API Key 信息
                </h4>
                <p class="text-sm text-gray-700">
                  {{ apiKey.name }}
                </p>
                <p class="text-xs text-gray-600 mt-1">
                  当前过期时间：{{ apiKey.expiresAt ? formatExpireDate(apiKey.expiresAt) : '永不过期' }}
                </p>
              </div>
            </div>
          </div>
        
          <div>
            <label class="block text-sm font-semibold text-gray-700 mb-3">续期时长</label>
            <select 
              v-model="form.renewDuration" 
              class="form-input w-full"
              @change="updateRenewExpireAt"
            >
              <option value="7d">
                延长 7 天
              </option>
              <option value="30d">
                延长 30 天
              </option>
              <option value="90d">
                延长 90 天
              </option>
              <option value="180d">
                延长 180 天
              </option>
              <option value="365d">
                延长 365 天
              </option>
              <option value="custom">
                自定义日期
              </option>
              <option value="permanent">
                设为永不过期
              </option>
            </select>
            <div
              v-if="form.renewDuration === 'custom'"
              class="mt-3"
            >
              <input 
                v-model="form.customExpireDate" 
                type="datetime-local" 
                class="form-input w-full"
                :min="minDateTime"
                @change="updateCustomRenewExpireAt"
              >
            </div>
            <p
              v-if="form.newExpiresAt"
              class="text-xs text-gray-500 mt-2"
            >
              新的过期时间：{{ formatExpireDate(form.newExpiresAt) }}
            </p>
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
            type="button" 
            :disabled="loading || !form.renewDuration"
            class="btn btn-primary flex-1 py-3 px-6 font-semibold"
            @click="renewApiKey"
          >
            <div
              v-if="loading"
              class="loading-spinner mr-2"
            />
            <i
              v-else
              class="fas fa-clock mr-2"
            />
            {{ loading ? '续期中...' : '确认续期' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, reactive, computed } from 'vue'
import { showToast } from '@/utils/toast'
import { useAuthStore } from '@/stores/auth'
import { apiClient } from '@/config/api'

const props = defineProps({
  apiKey: {
    type: Object,
    required: true
  }
})

const emit = defineEmits(['close', 'success'])

const authStore = useAuthStore()
const loading = ref(false)

// 表单数据
const form = reactive({
  renewDuration: '30d',
  customExpireDate: '',
  newExpiresAt: null
})

// 计算最小日期时间
const minDateTime = computed(() => {
  const now = new Date()
  // 如果有当前过期时间且未过期，从当前过期时间开始
  if (props.apiKey.expiresAt && new Date(props.apiKey.expiresAt) > now) {
    return new Date(props.apiKey.expiresAt).toISOString().slice(0, 16)
  }
  // 否则从现在开始
  now.setMinutes(now.getMinutes() + 1)
  return now.toISOString().slice(0, 16)
})

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

// 更新续期后的过期时间
const updateRenewExpireAt = () => {
  if (!form.renewDuration) {
    form.newExpiresAt = null
    return
  }
  
  if (form.renewDuration === 'permanent') {
    form.newExpiresAt = null
    return
  }
  
  if (form.renewDuration === 'custom') {
    return
  }
  
  // 计算新的过期时间
  const baseDate = props.apiKey.expiresAt && new Date(props.apiKey.expiresAt) > new Date() 
    ? new Date(props.apiKey.expiresAt) 
    : new Date()
  
  const duration = form.renewDuration
  const match = duration.match(/(\d+)([dhmy])/)
  
  if (match) {
    const [, value, unit] = match
    const num = parseInt(value)
    
    switch (unit) {
      case 'd':
        baseDate.setDate(baseDate.getDate() + num)
        break
      case 'h':
        baseDate.setHours(baseDate.getHours() + num)
        break
      case 'm':
        baseDate.setMonth(baseDate.getMonth() + num)
        break
      case 'y':
        baseDate.setFullYear(baseDate.getFullYear() + num)
        break
    }
    
    form.newExpiresAt = baseDate.toISOString()
  }
}

// 更新自定义续期时间
const updateCustomRenewExpireAt = () => {
  if (form.customExpireDate) {
    form.newExpiresAt = new Date(form.customExpireDate).toISOString()
  }
}

// 续期 API Key
const renewApiKey = async () => {
  loading.value = true
  
  try {
    const data = {
      expiresAt: form.renewDuration === 'permanent' ? null : form.newExpiresAt
    }
    
    const result = await apiClient.put(`/admin/api-keys/${props.apiKey.id}`, data)
    
    if (result.success) {
      showToast('API Key 续期成功', 'success')
      emit('success')
      emit('close')
    } else {
      showToast(result.message || '续期失败', 'error')
    }
  } catch (error) {
    showToast('续期失败', 'error')
  } finally {
    loading.value = false
  }
}

// 初始化
updateRenewExpireAt()
</script>

<style scoped>
/* 表单样式由全局样式提供 */
</style>