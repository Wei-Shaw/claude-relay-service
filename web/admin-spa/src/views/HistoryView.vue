<template>
  <div class="tab-content">
    <div class="card space-y-5 p-4 sm:p-6">
      <header class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 class="text-lg font-bold text-gray-900 dark:text-gray-100 sm:text-xl">会话历史</h3>
          <p class="text-sm text-gray-600 dark:text-gray-400 sm:text-base">
            按 API Key 检索会话记录，支持查看消息明细与快速清理。
          </p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <button
            class="group relative flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm transition-all duration-200 hover:border-gray-300 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:border-gray-500"
            :disabled="sessionsLoading || apiKeysLoading || messagesLoading"
            @click="refreshCurrent"
          >
            <div
              class="absolute -inset-0.5 rounded-lg bg-gradient-to-r from-indigo-500 to-cyan-500 opacity-0 blur transition duration-300 group-hover:opacity-20"
            ></div>
            <i
              :class="[
                'fas',
                sessionsLoading
                  ? 'fa-spinner fa-spin text-indigo-500'
                  : 'fa-sync-alt text-indigo-500'
              ]"
            />
            刷新
          </button>
        </div>
      </header>

      <div
        v-if="historyDisabled"
        class="rounded-xl border border-amber-200 bg-amber-50 px-4 py-5 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300"
      >
        <div class="flex items-start gap-3">
          <i class="fas fa-exclamation-triangle mt-1"></i>
          <div class="space-y-1 text-sm sm:text-base">
            <p class="font-semibold">历史会话功能未启用</p>
            <p>
              请在服务器 `.env` 中开启 `CHAT_HISTORY_ENABLED=true`，并按照
              `config/history.example.js` 配置参数后重启服务。
            </p>
          </div>
        </div>
      </div>

      <div v-else class="grid gap-4 lg:grid-cols-[320px_1fr]">
        <div class="space-y-4">
          <section
            class="rounded-xl border border-gray-200 bg-white/60 p-4 shadow-sm backdrop-blur-sm dark:border-gray-700 dark:bg-gray-800/60"
          >
            <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
              >选择 API Key</label
            >
            <select
              v-model="selectedApiKeyId"
              class="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm transition-all duration-200 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200"
            >
              <option disabled value="">请选择 API Key</option>
              <option v-for="key in apiKeyOptions" :key="key.id" :value="key.id">
                {{ key.display }}
              </option>
            </select>
            <p class="mt-2 text-xs text-gray-500 dark:text-gray-400">
              列表按最近活跃时间倒序，可使用下方操作加载更多或清除会话。
            </p>
          </section>

          <section
            class="rounded-xl border border-gray-200 bg-white/60 p-0 shadow-sm backdrop-blur-sm dark:border-gray-700 dark:bg-gray-800/60"
          >
            <header
              class="flex items-center justify-between border-b border-gray-200 px-4 py-3 text-sm font-medium text-gray-600 dark:border-gray-700 dark:text-gray-300"
            >
              <span>会话列表</span>
              <span> 共 {{ totalSessions }} 条 </span>
            </header>

            <div
              class="max-h-[520px] divide-y divide-gray-100 overflow-y-auto dark:divide-gray-700"
            >
              <button
                v-for="session in sessions"
                :key="session.id"
                :class="[
                  'w-full px-4 py-3 text-left transition-colors duration-150',
                  selectedSessionId === session.id
                    ? 'bg-indigo-50/80 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-200'
                    : 'hover:bg-gray-100/70 dark:hover:bg-gray-700/60'
                ]"
                @click="selectSession(session.id)"
              >
                <div class="flex items-center justify-between text-sm">
                  <span class="font-semibold">{{
                    session.title || session.metadata?.apiKeyName || session.id
                  }}</span>
                  <span class="text-xs text-gray-500 dark:text-gray-400">
                    {{ formatRelative(session.lastActivity) }}
                  </span>
                </div>
                <div
                  class="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400"
                >
                  <span>消息 {{ session.messageCount }}</span>
                  <span>|</span>
                  <span>Token {{ session.totalTokens }}</span>
                  <span
                    v-if="session.model"
                    class="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300"
                  >
                    {{ session.model }}
                  </span>
                </div>
              </button>

              <div
                v-if="!sessionsLoading && sessions.length === 0"
                class="p-6 text-center text-sm text-gray-500 dark:text-gray-400"
              >
                暂无会话记录
              </div>

              <div
                v-if="sessionsLoading"
                class="flex items-center justify-center p-4 text-sm text-gray-500 dark:text-gray-400"
              >
                <i class="fas fa-spinner fa-spin mr-2"></i>
                加载中...
              </div>

              <div v-if="sessionsError" class="p-4 text-sm text-red-500 dark:text-red-400">
                {{ sessionsError }}
              </div>
            </div>

            <footer
              class="border-t border-gray-200 px-4 py-3 text-right text-sm dark:border-gray-700"
            >
              <button
                class="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm transition-all hover:border-gray-300 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200"
                :disabled="sessionsLoading || !hasMoreSessions"
                @click="loadMoreSessions"
              >
                <i class="fas" :class="hasMoreSessions ? 'fa-chevron-down' : 'fa-ban'" />
                {{ hasMoreSessions ? '加载更多' : '没有更多了' }}
              </button>
            </footer>
          </section>
        </div>

        <div
          class="flex flex-col rounded-xl border border-gray-200 bg-white/70 p-4 shadow-sm backdrop-blur-sm dark:border-gray-700 dark:bg-gray-900/70"
        >
          <template v-if="selectedSession">
            <div
              class="mb-4 flex flex-col gap-3 rounded-lg border border-gray-100 bg-white/80 p-4 text-sm text-gray-600 shadow-inner dark:border-gray-700 dark:bg-gray-800/80 dark:text-gray-300"
            >
              <div class="flex flex-wrap items-center gap-2 text-sm">
                <span class="font-semibold text-gray-900 dark:text-gray-100">会话 ID：</span>
                <span class="break-all text-xs text-gray-500 dark:text-gray-400">{{
                  selectedSession.id
                }}</span>
              </div>
              <div class="grid gap-2 text-xs sm:grid-cols-2 sm:text-sm">
                <div>
                  <span class="text-gray-500 dark:text-gray-400">创建时间：</span>
                  <span class="text-gray-800 dark:text-gray-200">{{
                    formatDate(selectedSession.createdAt)
                  }}</span>
                </div>
                <div>
                  <span class="text-gray-500 dark:text-gray-400">最近活跃：</span>
                  <span class="text-gray-800 dark:text-gray-200">{{
                    formatDate(selectedSession.lastActivity)
                  }}</span>
                </div>
                <div>
                  <span class="text-gray-500 dark:text-gray-400">消息数量：</span>
                  <span class="text-gray-800 dark:text-gray-200">{{
                    selectedSession.messageCount
                  }}</span>
                </div>
                <div>
                  <span class="text-gray-500 dark:text-gray-400">Token 统计：</span>
                  <span class="text-gray-800 dark:text-gray-200">
                    {{ selectedSession.usage?.inputTokens ?? 0 }} /
                    {{ selectedSession.usage?.outputTokens ?? 0 }}
                  </span>
                </div>
                <div v-if="selectedSession.metadata?.userAgent">
                  <span class="text-gray-500 dark:text-gray-400">User-Agent：</span>
                  <span class="break-all text-gray-800 dark:text-gray-200">{{
                    selectedSession.metadata.userAgent
                  }}</span>
                </div>
                <div v-if="selectedSession.metadata?.requestId">
                  <span class="text-gray-500 dark:text-gray-400">请求 ID：</span>
                  <span class="text-gray-800 dark:text-gray-200">{{
                    selectedSession.metadata.requestId
                  }}</span>
                </div>
              </div>
              <div class="flex justify-end gap-2 pt-2">
                <button
                  class="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-600 transition-all hover:border-red-300 hover:bg-red-100 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300"
                  @click="handleDeleteSession"
                >
                  <i class="fas fa-trash-alt"></i>
                  删除会话
                </button>
              </div>
            </div>

            <div class="flex-1 space-y-4 overflow-y-auto overflow-x-hidden">
              <div
                v-for="message in messages"
                :key="message.storedAt"
                :class="[
                  'w-full min-w-0 rounded-xl border px-4 py-3 shadow-sm transition-all duration-150',
                  message.role === 'assistant'
                    ? 'border-indigo-200 bg-indigo-50/70 dark:border-indigo-500/40 dark:bg-indigo-500/10'
                    : 'border-gray-200 bg-white/80 dark:border-gray-700 dark:bg-gray-800/70'
                ]"
              >
                <div
                  class="mb-2 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400"
                >
                  <span
                    class="font-semibold"
                    :class="
                      message.role === 'assistant'
                        ? 'text-indigo-600 dark:text-indigo-200'
                        : 'text-gray-600 dark:text-gray-300'
                    "
                  >
                    {{ message.role === 'assistant' ? 'Claude' : '用户' }}
                  </span>
                  <span>{{ formatDate(message.createdAt || message.storedAt) }}</span>
                </div>
                <div
                  class="markdown-view whitespace-pre-wrap break-words text-sm text-gray-800 dark:text-gray-100"
                  v-html="renderMarkdown(message.content)"
                />
                <div v-if="message.role === 'assistant'" class="mt-2 flex justify-end">
                  <button class="copy-btn" title="复制消息" @click="copyMessage(message.content)">
                    <i class="fas fa-copy"></i>
                    复制
                  </button>
                </div>
                <div
                  class="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400"
                >
                  <span v-if="message.model">模型：{{ message.model }}</span>
                  <span v-if="typeof message.tokens === 'number'"
                    >Tokens：{{ message.tokens }}</span
                  >
                  <span v-if="message.metadata?.finishReason"
                    >结束原因：{{ message.metadata.finishReason }}</span
                  >
                  <span v-if="message.metadata?.error" class="text-red-500 dark:text-red-400"
                    >错误：{{ message.metadata.error }}</span
                  >
                </div>
              </div>

              <div
                v-if="messagesLoading"
                class="flex items-center justify-center rounded-lg border border-gray-200 bg-white/60 p-4 text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-400"
              >
                <i class="fas fa-spinner fa-spin mr-2" />
                加载消息中...
              </div>

              <div
                v-if="messagesError"
                class="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-500 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300"
              >
                {{ messagesError }}
              </div>
            </div>
          </template>

          <div
            v-else
            class="flex flex-1 items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white/60 p-6 text-sm text-gray-500 dark:border-gray-600 dark:bg-gray-800/60 dark:text-gray-400"
          >
            请选择左侧会话查看消息详情
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useApiKeysStore } from '@/stores/apiKeys'
import { apiClient } from '@/config/api'
import { formatDate, formatRelativeTime } from '@/utils/format'
import { showToast } from '@/utils/toast'

const apiKeysStore = useApiKeysStore()

const apiKeyOptions = computed(() =>
  (apiKeysStore.apiKeys || [])
    .map((item) => {
      const id = item.id || item.keyId || item.apiKeyId || item.apiKey || item.key
      if (!id) {
        return null
      }
      const name = item.name || item.alias || item.label
      return {
        id,
        display: name ? `${name} (${id})` : id
      }
    })
    .filter(Boolean)
)

const apiKeysLoading = computed(() => apiKeysStore.loading)
const historyDisabled = ref(false)
const sessions = ref([])
const sessionsLoading = ref(false)
const sessionsError = ref('')
const totalSessions = ref(0)
const selectedApiKeyId = ref('')
const selectedSessionId = ref('')
const page = ref(1)
const pageSize = 20
const messages = ref([])
const messagesLoading = ref(false)
const messagesError = ref('')

const hasMoreSessions = computed(
  () => sessions.value.length < totalSessions.value && sessions.value.length >= pageSize
)

const selectedSession = computed(
  () => sessions.value.find((item) => item.id === selectedSessionId.value) || null
)

const formatRelative = (value) => formatRelativeTime(value)

const ensureApiKeys = async () => {
  if (!apiKeysStore.apiKeys.length) {
    try {
      await apiKeysStore.fetchApiKeys()
    } catch (error) {
      showToast(error.message || '加载 API Key 失败', 'error')
    }
  }

  if (!selectedApiKeyId.value && apiKeyOptions.value.length > 0) {
    selectedApiKeyId.value = apiKeyOptions.value[0].id
  }
}

const loadSessions = async (reset = true, options = {}) => {
  const { preserveSelection = false } = options
  const currentSelectedId = preserveSelection ? selectedSessionId.value : ''

  if (!selectedApiKeyId.value) {
    sessions.value = []
    totalSessions.value = 0
    selectedSessionId.value = ''
    messages.value = []
    return
  }

  historyDisabled.value = false
  sessionsError.value = ''

  if (reset) {
    page.value = 1
    sessions.value = []
    if (!preserveSelection) {
      selectedSessionId.value = ''
    }
  }

  sessionsLoading.value = true
  try {
    const response = await apiClient.get('/api/history/sessions', {
      params: {
        apiKeyId: selectedApiKeyId.value,
        page: page.value,
        pageSize
      }
    })

    const { sessions: fetchedSessions = [], total = 0 } = response

    sessions.value = reset ? fetchedSessions : [...sessions.value, ...fetchedSessions]
    totalSessions.value = total

    if (preserveSelection && currentSelectedId) {
      const stillExists = sessions.value.some((item) => item.id === currentSelectedId)
      if (stillExists) {
        selectedSessionId.value = currentSelectedId
        await loadMessages()
        return
      }
    }

    if (!selectedSessionId.value && sessions.value.length > 0) {
      selectedSessionId.value = sessions.value[0].id
    } else if (selectedSessionId.value && !preserveSelection) {
      const stillExists = sessions.value.some((item) => item.id === selectedSessionId.value)
      if (stillExists) {
        await loadMessages()
      } else {
        selectedSessionId.value = sessions.value[0]?.id || ''
        if (!selectedSessionId.value) {
          messages.value = []
        }
      }
    }

    if (sessions.value.length === 0) {
      messages.value = []
    }
  } catch (error) {
    if (error.response?.status === 503) {
      historyDisabled.value = true
    } else {
      sessionsError.value = error.message || '加载会话失败'
      showToast(sessionsError.value, 'error')
    }
  } finally {
    sessionsLoading.value = false
  }
}

const loadMessages = async () => {
  if (!selectedSessionId.value) {
    messages.value = []
    return
  }

  messagesLoading.value = true
  messagesError.value = ''

  try {
    const response = await apiClient.get(
      `/api/history/sessions/${selectedSessionId.value}/messages`
    )
    messages.value = response.messages || []
  } catch (error) {
    messagesError.value = error.message || '加载消息失败'
    showToast(messagesError.value, 'error')
  } finally {
    messagesLoading.value = false
  }
}

const copyMessage = async (text) => {
  if (!text) {
    return
  }
  try {
    await navigator.clipboard.writeText(text)
    showToast('消息已复制', 'success')
  } catch (error) {
    console.error('复制失败:', error)
    showToast('复制失败，请手动复制', 'error')
  }
}

const escapeHtml = (value = '') =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const renderMarkdown = (content) => {
  if (!content) {
    return '<em>（无内容）</em>'
  }

  let html = escapeHtml(content)

  html = html.replace(/```([\s\S]*?)```/g, (_, code) => `<pre><code>${code.trim()}</code></pre>`)

  html = html.replace(/^###\s+(.*)$/gm, '<h3>$1</h3>')
  html = html.replace(/^##\s+(.*)$/gm, '<h2>$1</h2>')
  html = html.replace(/^#\s+(.*)$/gm, '<h1>$1</h1>')

  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>')
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>')

  html = html.replace(/(^|\n)([-*] .+(?:\n[-*] .+)*)/g, (match, prefix, body) => {
    const items = body
      .trim()
      .split('\n')
      .map((line) => line.replace(/^[-*]\s+/, ''))
      .map((item) => `<li>${item}</li>`)
      .join('')
    return `${prefix}<ul>${items}</ul>`
  })

  html = html.replace(/(^|\n)(\d+\. .+(?:\n\d+\. .+)*)/g, (match, prefix, body) => {
    const items = body
      .trim()
      .split('\n')
      .map((line) => line.replace(/^\d+\.\s+/, ''))
      .map((item) => `<li>${item}</li>`)
      .join('')
    return `${prefix}<ol>${items}</ol>`
  })

  html = html.replace(/\n{2,}/g, '<br /><br />').replace(/\n/g, '<br />')
  html = html
    .replace(/<ul><br \/>/g, '<ul>')
    .replace(/<br \/><\/ul>/g, '</ul>')
    .replace(/<ol><br \/>/g, '<ol>')
    .replace(/<br \/><\/ol>/g, '</ol>')

  return html
}

const selectSession = (sessionId) => {
  if (sessionId === selectedSessionId.value) {
    return
  }
  selectedSessionId.value = sessionId
}

const loadMoreSessions = async () => {
  if (sessionsLoading.value || !hasMoreSessions.value) {
    return
  }
  page.value += 1
  await loadSessions(false)
}

const refreshCurrent = async () => {
  await ensureApiKeys()
  if (selectedSessionId.value) {
    await loadSessions(true, { preserveSelection: true })
  } else {
    await loadSessions(true)
  }
}

const handleDeleteSession = async () => {
  if (!selectedSessionId.value) {
    return
  }

  const confirmed = window.confirm('确认删除该会话及其全部消息？此操作无法恢复。')
  if (!confirmed) {
    return
  }

  try {
    await apiClient.delete(`/api/history/sessions/${selectedSessionId.value}`)
    showToast('会话已删除', 'success')
    await loadSessions(true)
  } catch (error) {
    showToast(error.message || '删除会话失败', 'error')
  }
}

watch(selectedApiKeyId, () => {
  loadSessions(true)
})

watch(selectedSessionId, (newId, oldId) => {
  if (newId && newId !== oldId) {
    loadMessages()
  } else if (!newId) {
    messages.value = []
  }
})

onMounted(async () => {
  await ensureApiKeys()
  await loadSessions(true)
})
</script>

<style scoped>
.markdown-view h1,
.markdown-view h2,
.markdown-view h3 {
  margin: 0.5rem 0;
  font-weight: 600;
}

.markdown-view {
  word-break: break-word;
  overflow-wrap: anywhere;
  display: block;
  width: 100%;
}

.copy-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.75rem;
  font-size: 0.75rem;
  border-radius: 0.375rem;
  border: 1px solid rgba(148, 163, 184, 0.6);
  color: rgba(71, 85, 105, 0.9);
  background-color: rgba(255, 255, 255, 0.7);
  transition: background-color 0.2s ease;
}

.copy-btn:hover {
  background-color: rgba(241, 245, 249, 0.9);
}

.copy-btn i {
  font-size: 0.75rem;
}

.markdown-view ul,
.markdown-view ol {
  padding-left: 1.25rem;
  margin: 0.5rem 0;
}

.markdown-view pre {
  background-color: rgba(15, 23, 42, 0.05);
  border-radius: 0.5rem;
  padding: 0.75rem;
  overflow-x: auto;
  white-space: pre-wrap;
}

.markdown-view code {
  background-color: rgba(15, 23, 42, 0.08);
  padding: 0.1rem 0.3rem;
  border-radius: 0.25rem;
}
</style>
