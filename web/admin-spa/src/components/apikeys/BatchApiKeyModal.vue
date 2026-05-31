<template>
  <Teleport to="body">
    <div class="modal fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        class="modal-content custom-scrollbar mx-auto max-h-[90vh] w-full max-w-2xl overflow-y-auto p-8"
      >
        <div class="mb-6 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div
              class="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-green-500 to-green-600"
            >
              <i class="fas fa-layer-group text-lg text-white" />
            </div>
            <div>
              <h3 class="text-xl font-bold text-gray-900">
                {{ t('apiKeyResult.batchTitle') }}
              </h3>
              <p class="text-sm text-gray-600">
                {{ t('apiKeyResult.batchSubtitle', { count: apiKeys.length }) }}
              </p>
            </div>
          </div>
          <button
            class="text-gray-400 transition-colors hover:text-gray-600"
            :title="t('apiKeyResult.closeDirectTitle')"
            @click="handleDirectClose"
          >
            <i class="fas fa-times text-xl" />
          </button>
        </div>

        <!-- 警告提示 -->
        <div class="mb-6 border-l-4 border-amber-400 bg-amber-50 p-4">
          <div class="flex items-start">
            <div
              class="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg bg-amber-400"
            >
              <i class="fas fa-exclamation-triangle text-sm text-white" />
            </div>
            <div class="ml-3">
              <h5 class="mb-1 font-semibold text-amber-900">
                {{ t('apiKeyResult.importantReminder') }}
              </h5>
              <p class="text-sm text-amber-800">
                {{ t('apiKeyResult.batchWarning') }}
              </p>
            </div>
          </div>
        </div>

        <!-- 统计信息 -->
        <div class="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
          <div
            class="rounded-lg border border-blue-200 bg-gradient-to-br from-blue-50 to-blue-100 p-4"
          >
            <div class="flex items-center justify-between">
              <div>
                <p class="text-xs font-medium text-blue-600">
                  {{ t('apiKeyResult.createCount') }}
                </p>
                <p class="mt-1 text-2xl font-bold text-blue-900">
                  {{ apiKeys.length }}
                </p>
              </div>
              <div
                class="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500 bg-opacity-20"
              >
                <i class="fas fa-key text-blue-600" />
              </div>
            </div>
          </div>

          <div
            class="rounded-lg border border-green-200 bg-gradient-to-br from-green-50 to-green-100 p-4"
          >
            <div class="flex items-center justify-between">
              <div>
                <p class="text-xs font-medium text-green-600">
                  {{ t('apiKeyResult.baseName') }}
                </p>
                <p class="mt-1 truncate text-lg font-bold text-green-900">
                  {{ baseName }}
                </p>
              </div>
              <div
                class="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500 bg-opacity-20"
              >
                <i class="fas fa-tag text-green-600" />
              </div>
            </div>
          </div>

          <div
            class="rounded-lg border border-purple-200 bg-gradient-to-br from-purple-50 to-purple-100 p-4"
          >
            <div class="flex items-center justify-between">
              <div>
                <p class="text-xs font-medium text-purple-600">
                  {{ t('apiKeyResult.permissionScope') }}
                </p>
                <p class="mt-1 text-lg font-bold text-purple-900">
                  {{ getPermissionText() }}
                </p>
              </div>
              <div
                class="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500 bg-opacity-20"
              >
                <i class="fas fa-shield-alt text-purple-600" />
              </div>
            </div>
          </div>

          <div
            class="rounded-lg border border-orange-200 bg-gradient-to-br from-orange-50 to-orange-100 p-4"
          >
            <div class="flex items-center justify-between">
              <div>
                <p class="text-xs font-medium text-orange-600">
                  {{ t('apiKeyResult.expiryTime') }}
                </p>
                <p class="mt-1 text-lg font-bold text-orange-900">
                  {{ getExpiryText() }}
                </p>
              </div>
              <div
                class="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-500 bg-opacity-20"
              >
                <i class="fas fa-clock text-orange-600" />
              </div>
            </div>
          </div>
        </div>

        <!-- API Keys 预览 -->
        <div class="mb-6">
          <div class="mb-3 flex items-center justify-between">
            <label class="text-sm font-semibold text-gray-700">{{
              t('apiKeyResult.apiKeysPreview')
            }}</label>
            <div class="flex items-center gap-2">
              <button
                class="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
                type="button"
                @click="togglePreview"
              >
                <i :class="['fas', showPreview ? 'fa-eye-slash' : 'fa-eye']" />
                {{ showPreview ? t('apiKeyResult.hidePreview') : t('apiKeyResult.showPreview') }}
              </button>
              <span class="text-xs text-gray-500">{{ t('apiKeyResult.previewLimit') }}</span>
            </div>
          </div>

          <div
            v-if="showPreview"
            class="custom-scrollbar max-h-48 overflow-y-auto rounded-lg bg-gray-900 p-4"
          >
            <pre class="font-mono text-xs text-gray-300">{{ getPreviewText() }}</pre>
          </div>
        </div>

        <!-- 操作按钮 -->
        <div class="flex gap-3">
          <button
            class="btn btn-primary flex flex-1 items-center justify-center gap-2 px-6 py-3 font-semibold"
            @click="downloadApiKeys"
          >
            <i class="fas fa-download" />
            {{ t('apiKeyResult.downloadAll') }}
          </button>
          <button
            class="rounded-xl border border-gray-300 bg-gray-200 px-6 py-3 font-semibold text-gray-800 transition-colors hover:bg-gray-300"
            @click="handleClose"
          >
            {{ t('apiKeyResult.saved') }}
          </button>
        </div>

        <!-- 额外提示 -->
        <div class="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3">
          <p class="flex items-start text-xs text-blue-700">
            <i class="fas fa-info-circle mr-2 mt-0.5 flex-shrink-0" />
            <span>
              {{ t('apiKeyResult.downloadHint') }}
            </span>
          </p>
        </div>
      </div>
    </div>

    <!-- ConfirmModal -->
    <ConfirmModal
      :cancel-text="confirmModalConfig.cancelText"
      :confirm-text="confirmModalConfig.confirmText"
      :message="confirmModalConfig.message"
      :show="showConfirmModal"
      :title="confirmModalConfig.title"
      :type="confirmModalConfig.type"
      @cancel="handleCancelModal"
      @confirm="handleConfirmModal"
    />
  </Teleport>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { showToast } from '@/utils/tools'
import ConfirmModal from '@/components/common/ConfirmModal.vue'

const props = defineProps({
  apiKeys: {
    type: Array,
    required: true
  }
})

const emit = defineEmits(['close'])

const { t } = useI18n()
const showPreview = ref(false)

// ConfirmModal 状态
const showConfirmModal = ref(false)
const confirmModalConfig = ref({
  title: '',
  message: '',
  type: 'primary',
  confirmText: t('common.confirm'),
  cancelText: t('common.cancel')
})
const confirmResolve = ref(null)

const showConfirm = (
  title,
  message,
  confirmText = t('common.confirm'),
  cancelText = t('common.cancel'),
  type = 'primary'
) => {
  return new Promise((resolve) => {
    confirmModalConfig.value = { title, message, confirmText, cancelText, type }
    confirmResolve.value = resolve
    showConfirmModal.value = true
  })
}
const handleConfirmModal = () => {
  showConfirmModal.value = false
  confirmResolve.value?.(true)
}
const handleCancelModal = () => {
  showConfirmModal.value = false
  confirmResolve.value?.(false)
}

// 获取基础名称
const baseName = computed(() => {
  if (props.apiKeys.length > 0) {
    const firstKey = props.apiKeys[0]
    // 提取基础名称（去掉 _1, _2 等后缀）
    const match = firstKey.name.match(/^(.+)_\d+$/)
    return match ? match[1] : firstKey.name
  }
  return ''
})

// 获取权限文本
const getPermissionText = () => {
  if (props.apiKeys.length === 0) return t('apiKeys.unknown')
  const permissions = props.apiKeys[0].permissions
  const permissionMap = {
    all: t('apiKeys.allServices'),
    claude: t('apiKeyResult.onlyClaude'),
    gemini: t('apiKeyResult.onlyGemini')
  }
  return permissionMap[permissions] || permissions
}

// 获取过期时间文本
const getExpiryText = () => {
  if (props.apiKeys.length === 0) return t('apiKeys.unknown')
  const expiresAt = props.apiKeys[0].expiresAt
  if (!expiresAt) return t('apiKeys.neverExpires')

  const expiryDate = new Date(expiresAt)
  const now = new Date()
  const diffDays = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24))

  if (diffDays <= 7) return t('apiKeyResult.daysShort', { count: diffDays })
  if (diffDays <= 30) return t('apiKeyResult.weeksShort', { count: Math.ceil(diffDays / 7) })
  if (diffDays <= 365) return t('apiKeyResult.monthsShort', { count: Math.ceil(diffDays / 30) })
  return t('apiKeyResult.yearsShort', { count: Math.ceil(diffDays / 365) })
}

// 切换预览显示
const togglePreview = () => {
  showPreview.value = !showPreview.value
}

// 获取预览文本
const getPreviewText = () => {
  const previewKeys = props.apiKeys.slice(0, 10)
  const lines = previewKeys.map((key) => {
    return `${key.name}: ${key.apiKey || key.key || ''}`
  })

  if (props.apiKeys.length > 10) {
    lines.push(t('apiKeyResult.moreKeys', { count: props.apiKeys.length - 10 }))
  }

  return lines.join('\n')
}

// 下载 API Keys
const downloadApiKeys = () => {
  // 生成文件内容
  const content = props.apiKeys
    .map((key) => {
      return `${key.name}: ${key.apiKey || key.key || ''}`
    })
    .join('\n')

  // 创建 Blob 对象
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })

  // 创建下载链接
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url

  // 生成文件名（包含时间戳）
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)
  link.download = `api-keys-${baseName.value}-${timestamp}.txt`

  // 触发下载
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)

  // 释放 URL 对象
  URL.revokeObjectURL(url)

  showToast(t('apiKeyResult.fileDownloaded'), 'success')
}

// 关闭弹窗（带确认）
const handleClose = async () => {
  const confirmed = await showConfirm(
    t('apiKeyResult.closeReminderTitle'),
    t('apiKeyResult.batchCloseReminder'),
    t('apiKeyResult.confirmClose'),
    t('apiKeyResult.backToDownload'),
    'warning'
  )
  if (confirmed) {
    emit('close')
  }
}

// 直接关闭（不带确认）
const handleDirectClose = async () => {
  const confirmed = await showConfirm(
    t('apiKeyResult.directCloseTitle'),
    t('apiKeyResult.batchDirectCloseWarning'),
    t('apiKeyResult.closeAnyway'),
    t('apiKeyResult.backToDownload'),
    'warning'
  )
  if (confirmed) {
    emit('close')
  }
}
</script>

<style scoped>
pre {
  white-space: pre-wrap;
  word-wrap: break-word;
}
</style>
