<template>
  <Teleport to="body">
    <div class="fixed inset-0 modal z-50 flex items-center justify-center p-4">
      <div class="modal-content w-full max-w-lg p-8 mx-auto">
      <div class="flex items-center justify-between mb-6">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 bg-gradient-to-br from-green-500 to-green-600 rounded-xl flex items-center justify-center">
            <i class="fas fa-check text-white"></i>
          </div>
          <h3 class="text-xl font-bold text-gray-900">API Key 创建成功</h3>
        </div>
        <button 
          @click="$emit('close')"
          class="text-gray-400 hover:text-gray-600 transition-colors"
        >
          <i class="fas fa-times text-xl"></i>
        </button>
      </div>
      
      <!-- 成功提示 -->
      <div class="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
        <div class="flex items-start gap-3">
          <div class="w-8 h-8 bg-green-500 rounded-lg flex items-center justify-center flex-shrink-0">
            <i class="fas fa-shield-alt text-white text-sm"></i>
          </div>
          <div>
            <h4 class="font-semibold text-gray-800 mb-1">请妥善保管您的 API Key</h4>
            <p class="text-sm text-gray-600">API Key 只会显示一次，关闭此窗口后将无法再次查看完整密钥。请立即复制并保存到安全的地方。</p>
          </div>
        </div>
      </div>
      
      <!-- API Key 信息 -->
      <div class="space-y-4 mb-6">
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-2">名称</label>
          <p class="text-gray-900">{{ apiKey.name }}</p>
        </div>
        
        <div v-if="apiKey.description">
          <label class="block text-sm font-semibold text-gray-700 mb-2">描述</label>
          <p class="text-gray-600 text-sm">{{ apiKey.description }}</p>
        </div>
        
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-2">API Key</label>
          <div class="relative">
            <input 
              :type="showFullKey ? 'text' : 'password'"
              :value="apiKey.key" 
              readonly
              class="form-input w-full pr-24 font-mono text-sm bg-gray-50"
            >
            <div class="absolute right-1 top-1 flex gap-1">
              <button 
                @click="toggleKeyVisibility"
                type="button"
                class="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm transition-colors"
                :title="showFullKey ? '隐藏' : '显示'"
              >
                <i :class="showFullKey ? 'fas fa-eye-slash' : 'fas fa-eye'"></i>
              </button>
              <button 
                @click="copyApiKey"
                type="button"
                class="px-3 py-1.5 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg text-sm transition-colors"
                title="复制"
              >
                <i class="fas fa-copy"></i>
                {{ copied ? '已复制' : '复制' }}
              </button>
            </div>
          </div>
        </div>
      </div>
      
      <!-- 使用说明 -->
      <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <h4 class="font-semibold text-gray-800 mb-2">
          <i class="fas fa-info-circle mr-2 text-blue-500"></i>使用说明
        </h4>
        <div class="text-sm text-gray-700 space-y-2">
          <p>1. 在 HTTP 请求头中添加：</p>
          <code class="block bg-white rounded px-3 py-2 text-xs">Authorization: Bearer {{ apiKey.key }}</code>
          
          <p class="pt-2">2. 请求示例：</p>
          <pre class="bg-white rounded px-3 py-2 text-xs overflow-x-auto">curl -X POST {{ currentBaseUrl }}v1/messages \
  -H "Authorization: Bearer {{ apiKey.key }}" \
  -H "Content-Type: application/json" \
  -d '{"model": "claude-3-opus-20240229", "messages": [...]}'</pre>
        </div>
      </div>
      
      <div class="flex justify-end">
        <button 
          @click="$emit('close')"
          class="btn btn-primary px-6 py-2.5"
        >
          我已保存
        </button>
      </div>
    </div>
  </div>
  </Teleport>
</template>

<script setup>
import { ref, computed } from 'vue'
import { showToast } from '@/utils/toast'

const props = defineProps({
  apiKey: {
    type: Object,
    required: true
  }
})

const emit = defineEmits(['close'])

const showFullKey = ref(false)
const copied = ref(false)

// 计算基础 URL
const currentBaseUrl = computed(() => {
  return `${window.location.protocol}//${window.location.host}/api/`
})

// 切换密钥可见性
const toggleKeyVisibility = () => {
  showFullKey.value = !showFullKey.value
}

// 复制 API Key
const copyApiKey = async () => {
  try {
    await navigator.clipboard.writeText(props.apiKey.key)
    copied.value = true
    showToast('API Key 已复制到剪贴板', 'success')
    
    // 3秒后重置复制状态
    setTimeout(() => {
      copied.value = false
    }, 3000)
  } catch (error) {
    showToast('复制失败，请手动复制', 'error')
  }
}
</script>

<style scoped>
pre {
  white-space: pre-wrap;
  word-wrap: break-word;
}
</style>