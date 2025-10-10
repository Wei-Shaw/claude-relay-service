<template>
  <article
    class="w-full rounded-2xl border border-gray-200 bg-white/80 shadow-sm transition dark:border-gray-700 dark:bg-gray-900/70"
  >
    <header
      class="flex flex-col gap-2 border-b border-gray-200 px-4 py-3 text-sm dark:border-gray-700 md:flex-row md:items-center md:justify-between"
    >
      <div class="flex items-center gap-2 text-indigo-600 dark:text-indigo-300">
        <i class="fas fa-comments"></i>
        <span class="font-semibold">对话轮次 #{{ index }}</span>
      </div>
      <div class="flex flex-wrap items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
        <span v-if="group.firstTimestamp">
          {{ formatDate(group.firstTimestamp) }}
        </span>
        <span v-if="group.lastTimestamp && group.lastTimestamp !== group.firstTimestamp">
          ~ {{ formatDate(group.lastTimestamp) }}
        </span>
        <span v-if="group.requestId" class="break-all">请求 ID：{{ group.requestId }}</span>
      </div>
    </header>

    <section class="space-y-4 p-4 text-sm">
      <template v-if="displayMode === 'user'">
        <div
          v-for="(userMessage, userIdx) in userMessagesToRender"
          :key="userMessage.storedAt || userMessage.createdAt || `${group.id}_user_${userIdx}`"
          class="rounded-xl border border-gray-200 bg-white/80 p-4 text-gray-700 shadow-inner dark:border-gray-700 dark:bg-gray-800/70 dark:text-gray-200"
        >
          <div
            class="mb-1 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400"
          >
            <span class="flex items-center gap-2 font-semibold text-gray-900 dark:text-gray-100">
              <i class="fas fa-user-circle text-indigo-500 dark:text-indigo-300"></i>
              用户
            </span>
            <span>{{ formatDate(userMessage.createdAt || userMessage.storedAt) }}</span>
          </div>
          <div
            class="markdown-view whitespace-pre-wrap break-words text-sm text-gray-800 dark:text-gray-100"
            v-html="renderMarkdown(userMessage.content)"
          />
          <div v-if="userMessage.content" class="mt-2 flex justify-end">
            <button class="copy-btn" title="复制消息" @click="copyMessage(userMessage.content)">
              <i class="fas fa-copy"></i>
              复制
            </button>
          </div>
        </div>

        <div
          v-if="!userMessagesToRender.length"
          class="rounded-xl border border-dashed border-gray-300 bg-white/70 p-6 text-center text-sm text-gray-500 dark:border-gray-600 dark:bg-gray-800/60 dark:text-gray-400"
        >
          暂无用户消息
        </div>
      </template>

      <template v-else>
        <div
          v-if="primaryUserMessage"
          class="rounded-xl border border-gray-200 bg-white/80 p-4 text-gray-700 shadow-inner dark:border-gray-700 dark:bg-gray-800/70 dark:text-gray-200"
        >
          <div
            class="mb-1 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400"
          >
            <span class="flex items-center gap-2 font-semibold text-gray-900 dark:text-gray-100">
              <i class="fas fa-user-circle text-indigo-500 dark:text-indigo-300"></i>
              用户
            </span>
            <span>{{
              formatDate(primaryUserMessage.createdAt || primaryUserMessage.storedAt)
            }}</span>
          </div>
          <div
            class="markdown-view whitespace-pre-wrap break-words text-sm text-gray-800 dark:text-gray-100"
            v-html="renderMarkdown(primaryUserMessage.content)"
          />
        </div>

        <template v-if="displayMode !== 'simple'">
          <div
            v-if="processItems.length"
            class="rounded-xl border border-indigo-200 bg-indigo-50/60 p-4 dark:border-indigo-500/40 dark:bg-indigo-500/10"
          >
            <button
              v-if="canToggleThinking"
              class="mb-3 flex w-full items-center justify-between text-xs font-medium text-indigo-600 transition hover:text-indigo-500 dark:text-indigo-200"
              @click="handleToggleThinking"
            >
              <span class="flex items-center gap-2">
                <i class="fas fa-layer-group"></i>
                中间过程
              </span>
              <span class="text-[11px] uppercase tracking-wide">
                {{ expanded ? '收起 ▲' : '展开 ▼' }}
              </span>
            </button>

            <div v-if="expanded" class="space-y-3 text-xs">
              <div
                v-for="item in processItems"
                :key="item.id"
                :class="[
                  'rounded-lg border p-3',
                  item.kind === 'tool' || item.kind === 'thinking'
                    ? 'border-indigo-200 bg-white/80 dark:border-indigo-500/30 dark:bg-indigo-500/5'
                    : item.kind === 'system'
                      ? 'border-amber-200 bg-amber-50/80 text-amber-700 dark:border-amber-400/40 dark:bg-amber-500/10 dark:text-amber-200'
                      : 'border-gray-200 bg-white/80 text-gray-600 dark:border-gray-700 dark:bg-gray-800/70 dark:text-gray-300'
                ]"
              >
                <div
                  class="mb-2 flex items-center justify-between text-indigo-600 dark:text-indigo-300"
                >
                  <span class="flex items-center gap-2 font-semibold">
                    <i :class="item.icon"></i>
                    {{ item.label }}
                  </span>
                  <span v-if="item.timestamp" class="text-[11px] text-gray-400 dark:text-gray-500">
                    {{ formatDate(item.timestamp) }}
                  </span>
                </div>
                <div
                  v-if="item.bodyType === 'markdown'"
                  class="markdown-view whitespace-pre-wrap break-words text-xs text-slate-700 dark:text-slate-200 sm:text-sm"
                  v-html="renderMarkdown(item.body)"
                />
                <pre
                  v-else
                  class="scrollbar-custom whitespace-pre-wrap break-words text-[12px] text-slate-700 dark:text-slate-200"
                  >{{ item.body }}
                </pre>
                <div v-if="item.copyText" class="mt-2 flex justify-end">
                  <button class="copy-btn" title="复制内容" @click="copyMessage(item.copyText)">
                    <i class="fas fa-copy"></i>
                    复制
                  </button>
                </div>
              </div>
            </div>

            <p v-else class="text-xs text-gray-500 dark:text-gray-400">
              中间过程包含 {{ processItems.length }} 条记录，点击上方按钮可展开查看详情。
            </p>
          </div>

          <div
            v-if="finalAssistantMessage"
            class="rounded-xl border border-indigo-200 bg-indigo-50/60 p-4 dark:border-indigo-500/40 dark:bg-indigo-500/10"
          >
            <div
              class="mb-2 flex items-center justify-between text-xs text-indigo-600 dark:text-indigo-200"
            >
              <span class="flex items-center gap-2 font-semibold">
                <i class="fas fa-robot text-indigo-500 dark:text-indigo-200"></i>
                Claude
              </span>
              <span>{{
                formatDate(finalAssistantMessage.createdAt || finalAssistantMessage.storedAt)
              }}</span>
            </div>
            <div
              class="markdown-view whitespace-pre-wrap break-words text-sm text-gray-800 dark:text-gray-100"
              v-html="renderMarkdown(finalAssistantMessage.content)"
            />
            <div class="mt-2 flex justify-end">
              <button
                class="copy-btn"
                title="复制消息"
                @click="copyMessage(finalAssistantMessage.content)"
              >
                <i class="fas fa-copy"></i>
                复制
              </button>
            </div>
            <footer
              v-if="metaItems.length"
              class="mt-3 flex flex-wrap items-center gap-2 border-t border-dashed border-gray-200 pt-3 text-[11px] text-gray-500 dark:border-gray-700 dark:text-gray-400"
            >
              <div
                v-for="meta in metaItems"
                :key="meta.label"
                class="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-1 dark:bg-gray-800/80"
              >
                <span class="font-semibold text-gray-700 dark:text-gray-200">
                  {{ meta.label }}：
                </span>
                <span class="break-all text-gray-600 dark:text-gray-300">{{ meta.value }}</span>
              </div>
            </footer>
          </div>
        </template>

        <div
          v-for="assistantMessage in assistantMessagesToRender"
          :key="assistantMessage.storedAt || assistantMessage.createdAt"
          class="rounded-xl border border-indigo-200 bg-indigo-50/60 p-4 dark:border-indigo-500/40 dark:bg-indigo-500/10"
        >
          <div
            class="mb-2 flex items-center justify-between text-xs text-indigo-600 dark:text-indigo-200"
          >
            <span class="flex items-center gap-2 font-semibold">
              <i class="fas fa-robot text-indigo-500 dark:text-indigo-200"></i>
              Claude
            </span>
            <span>{{ formatDate(assistantMessage.createdAt || assistantMessage.storedAt) }}</span>
          </div>
          <div
            class="markdown-view whitespace-pre-wrap break-words text-sm text-gray-800 dark:text-gray-100"
            v-html="renderMarkdown(assistantMessage.content)"
          />
          <div class="mt-2 flex justify-end">
            <button
              class="copy-btn"
              title="复制消息"
              @click="copyMessage(assistantMessage.content)"
            >
              <i class="fas fa-copy"></i>
              复制
            </button>
          </div>
        </div>
      </template>
    </section>
  </article>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  group: {
    type: Object,
    required: true
  },
  index: {
    type: Number,
    required: true
  },
  displayMode: {
    type: String,
    default: 'simple'
  },
  expanded: {
    type: Boolean,
    default: false
  },
  showSystemMessages: {
    type: Boolean,
    default: false
  },
  collapseThinking: {
    type: Boolean,
    default: true
  },
  renderMarkdown: {
    type: Function,
    required: true
  },
  copyMessage: {
    type: Function,
    required: true
  },
  formatDate: {
    type: Function,
    required: true
  }
})

const emit = defineEmits(['toggle-thinking'])

const renderMarkdown = props.renderMarkdown
const copyMessage = props.copyMessage
const formatDate = props.formatDate

const userMessagesToRender = computed(() => {
  const list = Array.isArray(props.group.userMessages) ? props.group.userMessages : []
  return list.filter((message) => message && !message.metadata?.assistantGenerated)
})

const primaryUserMessage = computed(() => userMessagesToRender.value[0] || null)

const assistantMessagesToRender = computed(() => {
  const allAssistant = Array.isArray(props.group.assistantMessages)
    ? props.group.assistantMessages
    : []
  const visibleAssistant = Array.isArray(props.group.visibleAssistantMessages)
    ? props.group.visibleAssistantMessages
    : []

  if (props.displayMode === 'simple') {
    if (visibleAssistant.length) {
      if (visibleAssistant.length === 1) {
        return visibleAssistant
      }
      return [visibleAssistant[visibleAssistant.length - 1]]
    }
    if (allAssistant.length) {
      const fallback = allAssistant.filter((item) => item && item.subtype !== 'policy')
      if (fallback.length) {
        return [fallback[fallback.length - 1]]
      }
      return [allAssistant[allAssistant.length - 1]]
    }
    return []
  }
  if (props.displayMode === 'debug') {
    return allAssistant
  }
  return visibleAssistant.length ? visibleAssistant : allAssistant
})

const finalAssistantMessage = computed(() => {
  if (assistantMessagesToRender.value.length) {
    return assistantMessagesToRender.value[assistantMessagesToRender.value.length - 1]
  }
  return props.group.finalMessage || null
})

const formatStructuredContent = (value) => {
  if (!value) {
    return ''
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return JSON.stringify(parsed, null, 2)
    } catch (error) {
      return value
    }
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value, null, 2)
    } catch (error) {
      return String(value)
    }
  }
  return String(value)
}

const canToggleThinking = computed(() => props.collapseThinking !== false)

const getMessageTimestamp = (message) => message?.createdAt || message?.storedAt || null

const isSameMessage = (a, b) => {
  if (!a || !b) {
    return false
  }
  return (
    a.role === b.role &&
    a.subtype === b.subtype &&
    a.requestId === b.requestId &&
    getMessageTimestamp(a) === getMessageTimestamp(b)
  )
}

const buildToolBody = (message) => {
  const toolMeta = message?.metadata?.tool
  if (toolMeta) {
    try {
      return JSON.stringify(toolMeta, null, 2)
    } catch (error) {
      return formatStructuredContent(toolMeta)
    }
  }
  return formatStructuredContent(message?.content)
}

const processItems = computed(() => {
  if (!Array.isArray(props.group.rawMessages)) {
    return []
  }

  const primary = primaryUserMessage.value
  const finalMessage = finalAssistantMessage.value
  const allowSystem = props.showSystemMessages !== false

  return props.group.rawMessages
    .map((message, index) => {
      if (!message) {
        return null
      }

      if (primary && isSameMessage(message, primary)) {
        return null
      }

      if (finalMessage && isSameMessage(message, finalMessage)) {
        return null
      }

      if (message.role === 'user' && !message.metadata?.assistantGenerated) {
        return null
      }

      if (message.role === 'system' && !allowSystem) {
        return null
      }

      const timestamp = getMessageTimestamp(message)
      let label = '过程记录'
      let icon = 'fas fa-info-circle'
      let bodyType = 'markdown'
      let body = message.content || ''
      let copyText = message.content || ''
      let kind = 'assistant'

      if (message.role === 'assistant') {
        switch (message.subtype) {
          case 'tool_use': {
            const toolName = message.metadata?.tool?.name || message.metadata?.tool?.type
            label = toolName ? `工具：${toolName}` : '工具调用'
            icon = 'fas fa-wrench'
            bodyType = 'pre'
            body = buildToolBody(message)
            copyText = body
            kind = 'tool'
            break
          }
          case 'thinking': {
            label = 'AI 思考'
            icon = 'fas fa-brain'
            bodyType = 'pre'
            body = formatStructuredContent(message.content)
            copyText = body
            kind = 'thinking'
            break
          }
          case 'policy': {
            label = '策略校验'
            icon = 'fas fa-shield-alt'
            kind = 'system'
            break
          }
          case 'error': {
            label = '错误信息'
            icon = 'fas fa-exclamation-triangle'
            bodyType = 'pre'
            body = formatStructuredContent(message.content)
            copyText = body
            kind = 'system'
            break
          }
          default: {
            label = '助手说明'
            icon = 'fas fa-comment-dots'
            kind = 'assistant'
            break
          }
        }
      } else if (message.role === 'system') {
        if (message.metadata?.assistantGenerated) {
          label = '系统指令'
          icon = 'fas fa-terminal'
          bodyType = 'pre'
          kind = 'system'
        } else if (message.subtype === 'reminder') {
          label = '系统提醒'
          icon = 'fas fa-bell'
          kind = 'system'
        } else {
          label = '系统消息'
          icon = 'fas fa-cog'
          kind = 'system'
        }
        bodyType = bodyType === 'pre' ? 'pre' : 'markdown'
      }

      if (bodyType === 'pre') {
        body = formatStructuredContent(body)
        copyText = body
      }

      if (!body) {
        body = ''
        copyText = ''
      }

      return {
        id: `${message.messageGroupId || 'raw'}_${index}`,
        label,
        icon,
        bodyType,
        body,
        copyText: copyText || '',
        timestamp,
        kind
      }
    })
    .filter((item) => item && (item.body || item.copyText || item.label))
})

const metaItems = computed(() => {
  const items = []
  const target = finalAssistantMessage.value || primaryUserMessage.value

  if (target?.model) {
    items.push({ label: '模型', value: target.model })
  }

  if (typeof target?.tokens === 'number') {
    items.push({ label: 'Tokens', value: target.tokens })
  }

  const finishReason = target?.metadata?.finishReason
  if (finishReason) {
    items.push({ label: '结束原因', value: finishReason })
  }

  if (props.group.requestId) {
    items.push({ label: '请求 ID', value: props.group.requestId })
  }

  return items
})

const handleToggleThinking = () => {
  emit('toggle-thinking', props.group.id)
}
</script>

<style scoped>
.scrollbar-custom {
  max-height: 220px;
  overflow: auto;
  border-radius: 0.75rem;
}

.scrollbar-custom::-webkit-scrollbar {
  width: 6px;
}

.scrollbar-custom::-webkit-scrollbar-thumb {
  background: rgba(99, 102, 241, 0.4);
  border-radius: 9999px;
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
