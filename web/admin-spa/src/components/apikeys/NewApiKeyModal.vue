<template>
  <Teleport to="body">
    <div class="fixed inset-0 modal z-50 flex items-center justify-center p-4">
      <div class="modal-content w-full max-w-lg p-8 mx-auto max-h-[90vh] overflow-y-auto custom-scrollbar">
      <div class="flex items-center justify-between mb-6">
        <div class="flex items-center gap-3">
          <div class="w-12 h-12 bg-gradient-to-br from-green-500 to-green-600 rounded-xl flex items-center justify-center">
            <i class="fas fa-check text-white text-lg"></i>
          </div>
          <div>
            <h3 class="text-xl font-bold text-gray-900">API Key 创建成功</h3>
            <p class="text-sm text-gray-600">请妥善保存您的 API Key</p>
          </div>
        </div>
        <button 
          @click="handleDirectClose"
          class="text-gray-400 hover:text-gray-600 transition-colors"
          title="直接关闭（不推荐）"
        >
          <i class="fas fa-times text-xl"></i>
        </button>
      </div>
      
      <!-- 警告提示 -->
      <div class="bg-amber-50 border-l-4 border-amber-400 p-4 mb-6">
        <div class="flex items-start">
          <div class="w-6 h-6 bg-amber-400 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
            <i class="fas fa-exclamation-triangle text-white text-sm"></i>
          </div>
          <div class="ml-3">
            <h5 class="font-semibold text-amber-900 mb-1">重要提醒</h5>
            <p class="text-sm text-amber-800">
              这是您唯一能看到完整 API Key 的机会。关闭此窗口后，系统将不再显示完整的 API Key。请立即复制并妥善保存。
            </p>
          </div>
        </div>
      </div>
      
      <!-- API Key 信息 -->
      <div class="space-y-4 mb-6">
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-2">API Key 名称</label>
          <div class="p-3 bg-gray-50 rounded-lg border">
            <span class="text-gray-900 font-medium">{{ apiKey.name }}</span>
          </div>
        </div>
        
        <div v-if="apiKey.description">
          <label class="block text-sm font-semibold text-gray-700 mb-2">备注</label>
          <div class="p-3 bg-gray-50 rounded-lg border">
            <span class="text-gray-700">{{ apiKey.description || '无描述' }}</span>
          </div>
        </div>
        
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-2">API Key</label>
          <div class="relative">
            <div class="p-4 pr-14 bg-gray-900 rounded-lg border font-mono text-sm text-white break-all min-h-[60px] flex items-center">
              {{ getDisplayedApiKey() }}
            </div>
            <div class="absolute top-3 right-3">
              <button 
                @click="toggleKeyVisibility"
                type="button"
                class="btn-icon-sm hover:bg-gray-800 bg-gray-700"
                :title="showFullKey ? '隐藏API Key' : '显示完整API Key'"
              >
                <i :class="['fas', showFullKey ? 'fa-eye-slash' : 'fa-eye', 'text-gray-300']"></i>
              </button>
            </div>
          </div>
          <p class="text-xs text-gray-500 mt-2">
            点击眼睛图标切换显示模式，使用下方按钮复制完整 API Key
          </p>
        </div>
      </div>
      
      <!-- 操作按钮 -->
      <div class="flex gap-3">
        <button 
          @click="copyApiKey" 
          class="flex-1 btn btn-primary py-3 px-6 font-semibold flex items-center justify-center gap-2"
        >
          <i class="fas fa-copy"></i>
          复制 API Key
        </button>
        <button 
          @click="handleClose" 
          class="px-6 py-3 bg-gray-200 text-gray-800 rounded-xl font-semibold hover:bg-gray-300 transition-colors border border-gray-300"
        >
          我已保存
        </button>
      </div>
    </div>
  </div>
  </Teleport>
</template>

<script setup>
import { ref } from 'vue'
import { showToast } from '@/utils/toast'

const props = defineProps({
  apiKey: {
    type: Object,
    required: true
  }
})

const emit = defineEmits(['close'])

const showFullKey = ref(false)

// 切换密钥可见性
const toggleKeyVisibility = () => {
  showFullKey.value = !showFullKey.value
}

// 获取显示的API Key
const getDisplayedApiKey = () => {
  const key = props.apiKey.apiKey || props.apiKey.key || ''
  if (!key) return ''
  
  if (showFullKey.value) {
    return key
  } else {
    // 显示前8个字符和后4个字符，中间用●代替
    if (key.length <= 12) return key
    return key.substring(0, 8) + '●'.repeat(Math.max(0, key.length - 12)) + key.substring(key.length - 4)
  }
}

// 复制 API Key
const copyApiKey = async () => {
  const key = props.apiKey.apiKey || props.apiKey.key || ''
  if (!key) {
    showToast('API Key 不存在', 'error')
    return
  }
  
  try {
    await navigator.clipboard.writeText(key)
    showToast('API Key 已复制到剪贴板', 'success')
  } catch (error) {
    console.error('Failed to copy:', error)
    // 降级方案：创建一个临时文本区域
    const textArea = document.createElement('textarea')
    textArea.value = key
    document.body.appendChild(textArea)
    textArea.select()
    try {
      document.execCommand('copy')
      showToast('API Key 已复制到剪贴板', 'success')
    } catch (fallbackError) {
      showToast('复制失败，请手动复制', 'error')
    } finally {
      document.body.removeChild(textArea)
    }
  }
}

// 关闭弹窗（带确认）
const handleClose = async () => {
  if (window.showConfirm) {
    const confirmed = await window.showConfirm(
      '关闭提醒',
      '关闭后将无法再次查看完整的API Key，请确保已经妥善保存。\n\n确定要关闭吗？',
      '确定关闭',
      '取消'
    )
    if (confirmed) {
      emit('close')
    }
  } else {
    // 降级方案
    const confirmed = confirm(
      '关闭后将无法再次查看完整的API Key，请确保已经妥善保存。\n\n确定要关闭吗？'
    )
    if (confirmed) {
      emit('close')
    }
  }
}

// 直接关闭（不带确认）
const handleDirectClose = async () => {
  if (window.showConfirm) {
    const confirmed = await window.showConfirm(
      '确定要关闭吗？',
      '您还没有保存API Key，关闭后将无法再次查看。\n\n建议您先复制API Key再关闭。',
      '仍然关闭',
      '返回复制'
    )
    if (confirmed) {
      emit('close')
    }
  } else {
    // 降级方案
    const confirmed = confirm(
      '您还没有保存API Key，关闭后将无法再次查看。\n\n确定要关闭吗？'
    )
    if (confirmed) {
      emit('close')
    }
  }
}
</script>

<style scoped>
pre {
  white-space: pre-wrap;
  word-wrap: break-word;
}
</style>