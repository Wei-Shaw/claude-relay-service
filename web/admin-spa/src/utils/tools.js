// App 配置
export const APP_CONFIG = {
  basePath: import.meta.env.VITE_APP_BASE_URL || (import.meta.env.DEV ? '/admin/' : '/web/admin/'),
  apiPrefix: import.meta.env.DEV ? '/webapi' : ''
}

export const getAppUrl = (path = '') => {
  if (path && !path.startsWith('/')) path = '/' + path
  return APP_CONFIG.basePath + (path.startsWith('#') ? path : '#' + path)
}

export const getLoginUrl = () => getAppUrl('/login')

// Toast 通知管理
let toastContainer = null
let toastId = 0

export const showToast = (message, type = 'info', title = '', duration = 3000) => {
  // 创建容器
  if (!toastContainer) {
    toastContainer = document.createElement('div')
    toastContainer.id = 'toast-container'
    toastContainer.style.cssText = 'position: fixed; top: 20px; right: 20px; z-index: 10000;'
    document.body.appendChild(toastContainer)
  }

  const id = ++toastId
  const toast = document.createElement('div')
  toast.className = `toast rounded-2xl p-4 shadow-2xl backdrop-blur-sm toast-${type}`
  toast.style.cssText = `
    position: relative;
    min-width: 320px;
    max-width: 500px;
    margin-bottom: 16px;
    transform: translateX(100%);
    transition: transform 0.3s ease-in-out;
  `

  const iconMap = {
    success: 'fas fa-check-circle',
    error: 'fas fa-times-circle',
    warning: 'fas fa-exclamation-triangle',
    info: 'fas fa-info-circle'
  }

  toast.innerHTML = `
    <div class="flex items-start gap-3">
      <div class="flex-shrink-0 mt-0.5">
        <i class="${iconMap[type]} text-lg"></i>
      </div>
      <div class="flex-1 min-w-0">
        ${title ? `<h4 class="font-semibold text-sm mb-1">${title}</h4>` : ''}
        <p class="text-sm opacity-90 leading-relaxed">${message.replace(/\n/g, '<br>')}</p>
      </div>
      <button onclick="this.parentElement.parentElement.remove()"
              class="flex-shrink-0 text-white/70 hover:text-white transition-colors ml-2">
        <i class="fas fa-times"></i>
      </button>
    </div>
  `

  toastContainer.appendChild(toast)
  setTimeout(() => (toast.style.transform = 'translateX(0)'), 10)

  if (duration > 0) {
    setTimeout(() => {
      toast.style.transform = 'translateX(100%)'
      setTimeout(() => toast.remove(), 300)
    }, duration)
  }

  return id
}

// 复制文本到剪贴板
export const copyText = async (text, successMsg = '已复制') => {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
    } else {
      const textarea = document.createElement('textarea')
      textarea.value = text
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
    }
    showToast(successMsg, 'success')
    return true
  } catch (error) {
    console.error('Failed to copy:', error)
    showToast('复制失败', 'error')
    return false
  }
}

// 数字格式化
export const formatNumber = (num) => {
  if (num === null || num === undefined) return '0'
  const absNum = Math.abs(num)
  if (absNum >= 1e9) return (num / 1e9).toFixed(2) + 'B'
  if (absNum >= 1e6) return (num / 1e6).toFixed(2) + 'M'
  if (absNum >= 1e3) return (num / 1e3).toFixed(1) + 'K'
  return num.toLocaleString()
}

// 日期格式化
export const formatDate = (date, format = 'YYYY-MM-DD HH:mm:ss') => {
  if (!date) return ''
  const d = new Date(date)
  const pad = (n) => String(n).padStart(2, '0')
  return format
    .replace('YYYY', d.getFullYear())
    .replace('MM', pad(d.getMonth() + 1))
    .replace('DD', pad(d.getDate()))
    .replace('HH', pad(d.getHours()))
    .replace('mm', pad(d.getMinutes()))
    .replace('ss', pad(d.getSeconds()))
}

// 相对时间格式化
export const formatRelativeTime = (date) => {
  if (!date) return ''
  const d = new Date(date)
  const diffMs = new Date() - d
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays >= 7) return d.toLocaleDateString('zh-CN')
  if (diffDays > 0) return `${diffDays}天前`
  if (diffHours > 0) return `${diffHours}小时前`
  if (diffMins > 0) return `${diffMins}分钟前`
  return '刚刚'
}

// 字节格式化
export const formatBytes = (bytes, decimals = 2) => {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals < 0 ? 0 : decimals)) + ' ' + sizes[i]
}

// 日期时间格式化 (简化版)
export const formatDateTime = (date) => {
  if (!date) return ''
  return new Date(date).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

// 金额格式化
export const formatCost = (value) => {
  const num = Number(value || 0)
  if (num === 0) return '$0.00'
  if (num < 0.01) return `$${num.toFixed(6)}`
  return `$${num.toFixed(2)}`
}
