// Toast 通知管理
let toastContainer = null
let toastId = 0

export function showToast(message, type = 'info', title = '', duration = 3000) {
  // 创建容器
  if (!toastContainer) {
    toastContainer = document.createElement('div')
    toastContainer.id = 'toast-container'
    toastContainer.style.cssText = 'position: fixed; top: 20px; right: 20px; z-index: 10000;'
    document.body.appendChild(toastContainer)
  }

  // 创建 toast
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

  // 处理消息中的换行符，转换为 HTML 换行
  const formattedMessage = message.replace(/\n/g, '<br>')

  toast.innerHTML = `
    <div class="flex items-start gap-3">
      <div class="flex-shrink-0 mt-0.5">
        <i class="${iconMap[type]} text-lg"></i>
      </div>
      <div class="flex-1 min-w-0">
        ${title ? `<h4 class="font-semibold text-sm mb-1">${title}</h4>` : ''}
        <p class="text-sm opacity-90 leading-relaxed">${formattedMessage}</p>
      </div>
      <button onclick="this.parentElement.parentElement.remove()" 
              class="flex-shrink-0 text-white/70 hover:text-white transition-colors ml-2">
        <i class="fas fa-times"></i>
      </button>
    </div>
  `

  toastContainer.appendChild(toast)

  // 触发动画
  setTimeout(() => {
    toast.style.transform = 'translateX(0)'
  }, 10)

  // 自动移除
  if (duration > 0) {
    setTimeout(() => {
      toast.style.transform = 'translateX(100%)'
      setTimeout(() => {
        toast.remove()
      }, 300)
    }, duration)
  }

  return id
}
