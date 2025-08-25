<template>
  <Teleport to="body">
    <div class="modal fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        class="modal-content custom-scrollbar mx-auto max-h-[90vh] w-full max-w-lg overflow-y-auto p-8"
      >
        <div class="mb-6 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div
              class="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-green-500 to-green-600"
            >
              <i class="fas fa-check text-lg text-white" />
            </div>
            <div>
              <h3 class="text-xl font-bold text-gray-900 dark:text-gray-100">API Key 创建成功</h3>
              <p class="text-sm text-gray-600 dark:text-gray-400">请妥善保存您的 API Key</p>
            </div>
          </div>
          <button
            class="text-gray-400 transition-colors hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
            title="直接关闭（不推荐）"
            @click="handleDirectClose"
          >
            <i class="fas fa-times text-xl" />
          </button>
        </div>

        <!-- 警告提示 -->
        <div
          class="mb-6 border-l-4 border-amber-400 bg-amber-50 p-4 dark:border-amber-500 dark:bg-amber-900/20"
        >
          <div class="flex items-start">
            <div
              class="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg bg-amber-400 dark:bg-amber-500"
            >
              <i class="fas fa-exclamation-triangle text-sm text-white" />
            </div>
            <div class="ml-3">
              <h5 class="mb-1 font-semibold text-amber-900 dark:text-amber-400">重要提醒</h5>
              <p class="text-sm text-amber-800 dark:text-amber-300">
                这是您唯一能看到完整 API Key 的机会。关闭此窗口后，系统将不再显示完整的 API
                Key。请立即复制并妥善保存。
              </p>
            </div>
          </div>
        </div>

        <!-- API Key 信息 -->
        <div class="mb-6 space-y-4">
          <div>
            <label class="mb-2 block text-sm font-semibold text-gray-700 dark:text-gray-300"
              >API Key 名称</label
            >
            <div
              class="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-600 dark:bg-gray-800"
            >
              <span class="font-medium text-gray-900 dark:text-gray-100">{{ apiKey.name }}</span>
            </div>
          </div>

          <div v-if="apiKey.description">
            <label class="mb-2 block text-sm font-semibold text-gray-700 dark:text-gray-300"
              >备注</label
            >
            <div
              class="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-600 dark:bg-gray-800"
            >
              <span class="text-gray-700 dark:text-gray-300">{{
                apiKey.description || '无描述'
              }}</span>
            </div>
          </div>

          <div>
            <label class="mb-2 block text-sm font-semibold text-gray-700 dark:text-gray-300"
              >API Key</label
            >
            <div class="relative">
              <div
                class="flex min-h-[60px] items-center break-all rounded-lg border border-gray-700 bg-gray-900 p-4 pr-14 font-mono text-sm text-white dark:border-gray-600 dark:bg-gray-900"
              >
                {{ getDisplayedApiKey() }}
              </div>
              <div class="absolute right-3 top-3">
                <button
                  class="btn-icon-sm bg-gray-700 hover:bg-gray-800 dark:bg-gray-700 dark:hover:bg-gray-600"
                  :title="showFullKey ? '隐藏API Key' : '显示完整API Key'"
                  type="button"
                  @click="toggleKeyVisibility"
                >
                  <i :class="['fas', showFullKey ? 'fa-eye-slash' : 'fa-eye', 'text-gray-300']" />
                </button>
              </div>
            </div>
            <p class="mt-2 text-xs text-gray-500 dark:text-gray-400">
              点击眼睛图标切换显示模式，使用下方按钮复制完整 API Key
            </p>
          </div>
        </div>

        <!-- 操作按钮 -->
        <div class="flex gap-3">
          <button
            class="btn btn-primary flex flex-1 items-center justify-center gap-2 px-6 py-3 font-semibold"
            @click="copyApiKey"
          >
            <i class="fas fa-copy" />
            复制 API Key
          </button>
          <button
            class="rounded-xl border border-gray-300 bg-gray-200 px-6 py-3 font-semibold text-gray-800 transition-colors hover:bg-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
            @click="handleClose"
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
    return (
      key.substring(0, 8) + '●'.repeat(Math.max(0, key.length - 12)) + key.substring(key.length - 4)
    )
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
    const confirmed = confirm('您还没有保存API Key，关闭后将无法再次查看。\n\n确定要关闭吗？')
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
