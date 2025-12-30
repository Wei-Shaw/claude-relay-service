import { computed } from 'vue'

export function useTutorialUrls() {
  const getBaseUrlPrefix = () => {
    const customPrefix = import.meta.env.VITE_API_BASE_PREFIX
    if (customPrefix) {
      return customPrefix.replace(/\/$/, '')
    }

    let origin = ''
    if (window.location.origin) {
      origin = window.location.origin
    } else {
      const protocol = window.location.protocol
      const hostname = window.location.hostname
      const port = window.location.port
      origin = protocol + '//' + hostname
      if (
        port &&
        ((protocol === 'http:' && port !== '80') || (protocol === 'https:' && port !== '443'))
      ) {
        origin += ':' + port
      }
    }

    if (!origin) {
      const currentUrl = window.location.href
      const pathStart = currentUrl.indexOf('/', 8)
      if (pathStart !== -1) {
        origin = currentUrl.substring(0, pathStart)
      } else {
        return ''
      }
    }

    return origin
  }

  const currentBaseUrl = computed(() => getBaseUrlPrefix() + '/api')
  const geminiBaseUrl = computed(() => getBaseUrlPrefix() + '/gemini')
  const openaiBaseUrl = computed(() => getBaseUrlPrefix() + '/openai')
  const droidClaudeBaseUrl = computed(() => getBaseUrlPrefix() + '/droid/claude')
  const droidOpenaiBaseUrl = computed(() => getBaseUrlPrefix() + '/droid/openai')

  return {
    currentBaseUrl,
    geminiBaseUrl,
    openaiBaseUrl,
    droidClaudeBaseUrl,
    droidOpenaiBaseUrl
  }
}
