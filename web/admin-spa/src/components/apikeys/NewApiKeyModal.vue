<template>
  <Teleport to="body">
    <div class="api-key-modal-overlay" @click.self="handleDirectClose">
      <div class="api-key-modal-content">
        <!-- Header -->
        <div class="modal-header">
          <div class="header-icon-wrapper">
            <div class="header-icon">
              <i class="fas fa-check" />
            </div>
          </div>
          <h2 class="modal-title">API Key 创建成功</h2>
          <p class="modal-subtitle">请妥善保存您的 API Key</p>
        </div>

        <!-- API Key Information -->
        <div class="modal-section">
          <div class="info-group">
            <label class="info-label">API Key 名称</label>
            <div class="info-value">{{ apiKey.name }}</div>
          </div>

          <div v-if="apiKey.description" class="info-group">
            <label class="info-label">备注</label>
            <div class="info-value">{{ apiKey.description }}</div>
          </div>

          <div class="info-group">
            <label class="info-label">API Key</label>
            <div class="key-display-wrapper">
              <div class="key-display">
                <code class="key-text">{{ getDisplayedApiKey() }}</code>
              </div>
              <button
                class="key-toggle-btn"
                :title="showFullKey ? '隐藏 API Key' : '显示完整 API Key'"
                type="button"
                @click="toggleKeyVisibility"
              >
                <i :class="['fas', showFullKey ? 'fa-eye-slash' : 'fa-eye']" />
              </button>
            </div>
            <p class="info-hint">点击眼睛图标切换显示模式</p>
          </div>
        </div>

        <!-- Action Buttons -->
        <div class="modal-actions">
          <DsButton block variant="outline" @click="copyKeyOnly">
            <i class="fas fa-key" />
            仅复制密钥
          </DsButton>
          <DsButton block variant="secondary" @click="copyFullConfig">
            <i class="fas fa-copy" />
            复制 Claude 配置
          </DsButton>
          <DsButton block variant="primary" @click="handleClose">
            <i class="fas fa-check-circle" />
            我已保存
          </DsButton>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { showToast } from '@/utils/toast'
import DsButton from '@/ui/components/Button.vue'
import DsAlert from '@/ui/components/Alert.vue'

const props = defineProps({
  apiKey: {
    type: Object,
    required: true
  }
})

const emit = defineEmits(['close'])

// Lock body scroll when modal is mounted
onMounted(() => {
  document.body.style.overflow = 'hidden'
})

// Restore body scroll when modal is unmounted
onUnmounted(() => {
  document.body.style.overflow = ''
})

const showFullKey = ref(false)

// 获取 API Base URL 前缀
const getBaseUrlPrefix = () => {
  // 优先使用环境变量配置的自定义前缀
  const customPrefix = import.meta.env.VITE_API_BASE_PREFIX
  if (customPrefix) {
    // 去除末尾的斜杠
    return customPrefix.replace(/\/$/, '')
  }

  // 否则使用当前浏览器访问地址
  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol // http: 或 https:
    const host = window.location.host // 域名和端口
    // 提取协议和主机部分，去除路径
    let origin = protocol + '//' + host

    // 如果当前URL包含路径，只取协议+主机部分
    const currentUrl = window.location.href
    const pathStart = currentUrl.indexOf('/', 8) // 跳过 http:// 或 https://
    if (pathStart !== -1) {
      origin = currentUrl.substring(0, pathStart)
    }

    return origin
  }

  // 服务端渲染或其他情况的回退
  return ''
}

// 计算完整的 API Base URL
const currentBaseUrl = computed(() => {
  return getBaseUrlPrefix() + '/api'
})

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

// 通用复制工具，包含降级处理
const copyTextWithFallback = async (text, successMessage) => {
  try {
    await navigator.clipboard.writeText(text)
    showToast(successMessage, 'success')
  } catch (error) {
    const textArea = document.createElement('textarea')
    textArea.value = text
    document.body.appendChild(textArea)
    textArea.select()
    try {
      document.execCommand('copy')
      showToast(successMessage, 'success')
    } catch (fallbackError) {
      showToast('复制失败，请手动复制', 'error')
    } finally {
      document.body.removeChild(textArea)
    }
  }
}

// 复制完整配置（包含提示信息）
const copyFullConfig = async () => {
  const key = props.apiKey.apiKey || props.apiKey.key || ''
  if (!key) {
    showToast('API Key 不存在', 'error')
    return
  }

  // 构建环境变量配置格式
  const configText = `export ANTHROPIC_BASE_URL="${currentBaseUrl.value}"
export ANTHROPIC_AUTH_TOKEN="${key}"`

  await copyTextWithFallback(configText, '配置信息已复制到剪贴板')
}

// 仅复制密钥
const copyKeyOnly = async () => {
  const key = props.apiKey.apiKey || props.apiKey.key || ''
  if (!key) {
    showToast('API Key 不存在', 'error')
    return
  }

  await copyTextWithFallback(key, 'API Key 已复制')
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
/* Vercel-inspired API Key Modal */

.api-key-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  animation: fadeIn 0.2s ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.api-key-modal-content {
  width: 100%;
  max-width: 520px;
  background: #fafafa;
  border-radius: 8px;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.12);
  animation: slideUp 0.3s ease-out;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

:global(.dark) .api-key-modal-content {
  background: #000;
  box-shadow: 0 8px 30px rgba(255, 255, 255, 0.1);
}

/* Header */
.modal-header {
  padding: 2.5rem 2rem 1.5rem;
  text-align: center;
  flex-shrink: 0;
}

.header-icon-wrapper {
  display: flex;
  justify-content: center;
  margin-bottom: 1.25rem;
}

.header-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  background: #000;
  border-radius: 50%;
  color: #fff;
  font-size: 1.5rem;
}

:global(.dark) .header-icon {
  background: #fff;
  color: #000;
}

.modal-title {
  font-size: 1.75rem;
  font-weight: 600;
  color: #000;
  letter-spacing: -0.02em;
  margin: 0 0 0.5rem 0;
  line-height: 1.2;
}

:global(.dark) .modal-title {
  color: #fff;
}

.modal-subtitle {
  font-size: 0.9375rem;
  color: #666;
  margin: 0;
  line-height: 1.5;
}

:global(.dark) .modal-subtitle {
  color: #999;
}

/* Sections */
.modal-section {
  padding: 0 2rem 1.5rem;
  flex-shrink: 0;
}

/* Alert Content */
.alert-content {
  line-height: 1.6;
  word-wrap: break-word;
  overflow-wrap: break-word;
  white-space: normal;
}

.alert-content strong {
  font-weight: 600;
}

/* Info Groups */
.info-group {
  margin-bottom: 1.5rem;
}

.info-group:last-child {
  margin-bottom: 0;
}

.info-label {
  display: block;
  font-size: 0.8125rem;
  font-weight: 600;
  color: #000;
  margin-bottom: 0.5rem;
  letter-spacing: -0.01em;
}

:global(.dark) .info-label {
  color: #fff;
}

.info-value {
  padding: 0.875rem 1rem;
  background: #fff;
  border: 1px solid #eaeaea;
  border-radius: 5px;
  font-size: 0.875rem;
  color: #000;
  line-height: 1.5;
}

:global(.dark) .info-value {
  background: #1a1a1a;
  border-color: #333;
  color: #fff;
}

/* Key Display */
.key-display-wrapper {
  position: relative;
}

.key-display {
  padding: 1rem 3.5rem 1rem 1rem;
  background: #000;
  border: 1px solid #000;
  border-radius: 5px;
  min-height: 60px;
  display: flex;
  align-items: center;
}

:global(.dark) .key-display {
  background: #1a1a1a;
  border-color: #333;
}

.key-text {
  font-family:
    'SF Mono', 'Monaco', 'Inconsolata', 'Fira Code', 'Fira Mono', 'Roboto Mono', monospace;
  font-size: 0.8125rem;
  color: #fff;
  word-break: break-all;
  line-height: 1.6;
}

:global(.dark) .key-text {
  color: #e0e0e0;
}

.key-toggle-btn {
  position: absolute;
  right: 0.75rem;
  top: 50%;
  transform: translateY(-50%);
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 5px;
  color: #999;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 0.9375rem;
}

.key-toggle-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.3);
  color: #fff;
}

:global(.dark) .key-toggle-btn {
  border-color: rgba(255, 255, 255, 0.1);
}

:global(.dark) .key-toggle-btn:hover {
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.2);
}

.info-hint {
  margin-top: 0.5rem;
  font-size: 0.75rem;
  color: #666;
  line-height: 1.4;
}

:global(.dark) .info-hint {
  color: #999;
}

/* Actions */
.modal-actions {
  padding: 1.5rem 2rem 2rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  flex-shrink: 0;
}

/* Responsive */
@media (max-width: 640px) {
  .api-key-modal-content {
    max-width: 100%;
    margin: 1rem;
  }

  .modal-header {
    padding: 2rem 1.5rem 1.25rem;
  }

  .modal-section {
    padding: 0 1.5rem 1.25rem;
  }

  .modal-actions {
    padding: 1.25rem 1.5rem 1.75rem;
  }

  .modal-title {
    font-size: 1.5rem;
  }

  .header-icon {
    width: 48px;
    height: 48px;
    font-size: 1.25rem;
  }
}
</style>
