export async function copyTextToClipboard(text) {
  const content = String(text || '')
  if (!content) {
    return false
  }

  // 优先使用 Clipboard API（需要安全上下文：HTTPS / localhost）
  try {
    if (navigator?.clipboard?.writeText && window.isSecureContext) {
      await navigator.clipboard.writeText(content)
      return true
    }
  } catch (error) {
    // ignore
  }

  // 兼容 HTTP 场景：使用 execCommand 作为降级方案
  try {
    const textarea = document.createElement('textarea')
    textarea.value = content
    textarea.setAttribute('readonly', 'true')
    textarea.style.position = 'fixed'
    textarea.style.top = '-9999px'
    textarea.style.left = '-9999px'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)

    textarea.focus()
    textarea.select()

    const ok = document.execCommand('copy')
    document.body.removeChild(textarea)
    return Boolean(ok)
  } catch (error) {
    return false
  }
}
