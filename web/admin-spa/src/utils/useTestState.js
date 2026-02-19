import { ref, computed, onUnmounted } from 'vue'

export const useTestState = () => {
  // ========== 状态 ==========
  const testStatus = ref('idle') // idle, testing, success, error
  const responseText = ref('')
  const errorMessage = ref('')
  const testDuration = ref(0)
  const testStartTime = ref(null)
  const abortController = ref(null)

  // ========== 状态样式计算属性 ==========
  const statusStyleMap = {
    idle: {
      title: '准备就绪',
      card: 'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/50',
      iconBg: 'bg-gray-200 dark:bg-gray-700',
      icon: 'fa-hourglass-start',
      iconColor: 'text-gray-500 dark:text-gray-400',
      text: 'text-gray-700 dark:text-gray-300'
    },
    testing: {
      title: '正在测试...',
      card: 'border-blue-200 bg-blue-50 dark:border-blue-500/30 dark:bg-blue-900/20',
      iconBg: 'bg-blue-100 dark:bg-blue-500/30',
      icon: 'fa-spinner fa-spin',
      iconColor: 'text-blue-500 dark:text-blue-400',
      text: 'text-blue-700 dark:text-blue-300'
    },
    success: {
      title: '测试成功',
      card: 'border-green-200 bg-green-50 dark:border-green-500/30 dark:bg-green-900/20',
      iconBg: 'bg-green-100 dark:bg-green-500/30',
      icon: 'fa-check-circle',
      iconColor: 'text-green-500 dark:text-green-400',
      text: 'text-green-700 dark:text-green-300'
    },
    error: {
      title: '测试失败',
      card: 'border-red-200 bg-red-50 dark:border-red-500/30 dark:bg-red-900/20',
      iconBg: 'bg-red-100 dark:bg-red-500/30',
      icon: 'fa-exclamation-circle',
      iconColor: 'text-red-500 dark:text-red-400',
      text: 'text-red-700 dark:text-red-300'
    }
  }

  const currentStyle = computed(() => statusStyleMap[testStatus.value] || statusStyleMap.idle)
  const statusTitle = computed(() => currentStyle.value.title)
  const statusCardClass = computed(() => currentStyle.value.card)
  const statusIconBgClass = computed(() => currentStyle.value.iconBg)
  const statusIcon = computed(() => currentStyle.value.icon)
  const statusIconClass = computed(() => currentStyle.value.iconColor)
  const statusTextClass = computed(() => currentStyle.value.text)

  // ========== SSE 事件处理 ==========
  const handleSSEEvent = (data) => {
    switch (data.type) {
      case 'test_start':
        break
      case 'content':
        responseText.value += data.text
        break
      case 'message_stop':
        break
      case 'test_complete':
        testDuration.value = Date.now() - testStartTime.value
        if (data.success) {
          testStatus.value = 'success'
        } else {
          testStatus.value = 'error'
          errorMessage.value = data.error || '测试失败'
        }
        break
      case 'error':
        testStatus.value = 'error'
        errorMessage.value = data.error || '未知错误'
        testDuration.value = Date.now() - testStartTime.value
        break
    }
  }

  // ========== SSE 流读取 ==========
  const readSSEStream = async (response) => {
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let streamDone = false
    let buffer = ''

    while (!streamDone) {
      const { done, value } = await reader.read()
      if (done) {
        streamDone = true
        // 处理缓冲区中剩余的数据
        if (buffer.trim()) {
          processSSELine(buffer)
        }
        continue
      }

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      // 最后一行可能不完整，保留在缓冲区
      buffer = lines.pop() || ''

      for (const line of lines) {
        processSSELine(line)
      }
    }
  }

  const processSSELine = (line) => {
    if (line.startsWith('data: ')) {
      try {
        const data = JSON.parse(line.substring(6))
        handleSSEEvent(data)
      } catch {
        // 忽略解析错误
      }
    }
  }

  // ========== 通用测试请求 ==========
  const sendTestRequest = async (endpoint, payload, options = {}) => {
    const { useSSE = true, headers = {} } = options

    // 重置状态
    testStatus.value = 'testing'
    responseText.value = ''
    errorMessage.value = ''
    testDuration.value = 0
    testStartTime.value = Date.now()

    // 取消之前的请求
    if (abortController.value) {
      abortController.value.abort()
    }
    abortController.value = new AbortController()

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(payload),
        signal: abortController.value.signal
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || errorData.error || `HTTP ${response.status}`)
      }

      if (useSSE) {
        await readSSEStream(response)
      } else {
        // JSON 响应
        const data = await response.json()
        testDuration.value = Date.now() - testStartTime.value
        if (data.success) {
          testStatus.value = 'success'
          responseText.value = data.data?.responseText || 'Test passed'
        } else {
          testStatus.value = 'error'
          errorMessage.value = data.message || 'Test failed'
        }
      }
    } catch (err) {
      if (err.name === 'AbortError') return
      testStatus.value = 'error'
      errorMessage.value = err.message || '连接失败'
      testDuration.value = Date.now() - testStartTime.value
    }
  }

  // ========== 重置 + 清理 ==========
  const resetState = () => {
    testStatus.value = 'idle'
    responseText.value = ''
    errorMessage.value = ''
    testDuration.value = 0
    testStartTime.value = null
  }

  const cleanup = () => {
    if (abortController.value) {
      abortController.value.abort()
      abortController.value = null
    }
  }

  onUnmounted(cleanup)

  return {
    testStatus,
    responseText,
    errorMessage,
    testDuration,
    statusTitle,
    statusCardClass,
    statusIconBgClass,
    statusIcon,
    statusIconClass,
    statusTextClass,
    sendTestRequest,
    resetState,
    cleanup
  }
}
