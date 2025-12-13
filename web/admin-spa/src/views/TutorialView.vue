<template>
  <div class="space-y-6 md:space-y-8">
    <div class="card-section">
      <header v-if="!hideHeader" class="section-header">
        <i class="header-icon fas fa-graduation-cap text-blue-500" />
        <h3 class="header-title">使用教程</h3>
        <span v-if="isManaging" class="header-tag">管理</span>
      </header>

      <!-- 模型选择（先选模型） -->
      <div class="mb-4 flex flex-wrap gap-2">
        <button
          v-for="item in modelOptions"
          :key="item.key"
          class="btn px-4 py-2 text-sm"
          :class="activeModel === item.key ? 'btn-primary' : 'btn-secondary'"
          @click="switchModel(item.key)"
        >
          <i :class="item.icon + ' mr-2'" />
          {{ item.name }}
        </button>
      </div>

      <!-- 系统选择（再选系统） -->
      <div class="mb-4 flex flex-wrap gap-2">
        <button
          v-for="item in systemOptions"
          :key="item.key"
          class="btn px-4 py-2 text-sm"
          :class="activeSystem === item.key ? 'btn-primary' : 'btn-secondary'"
          @click="switchSystem(item.key)"
        >
          <i :class="item.icon + ' mr-2'" />
          {{ item.name }}
        </button>
      </div>

      <div class="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div class="text-sm text-gray-600 dark:text-gray-300">
          当前：{{ currentLabel }}
          <span v-if="loadedAtMs > 0" class="ml-2 text-xs text-gray-500 dark:text-gray-400">
            （已加载：{{ formatTime(loadedAtMs) }}）
          </span>
        </div>
        <div class="flex flex-wrap gap-2">
          <button class="btn btn-secondary px-4 py-2 text-sm" :disabled="loading" @click="reload">
            <i class="fas fa-sync mr-2" />重新加载
          </button>
          <button
            v-if="canManage"
            class="btn btn-secondary px-4 py-2 text-sm"
            :disabled="loading"
            @click="toggleManage"
          >
            <i class="fas fa-pen mr-2" />{{ isManaging ? '退出管理' : '进入管理' }}
          </button>
          <button
            v-if="canManage && isManaging"
            class="btn btn-primary px-4 py-2 text-sm"
            :disabled="saving || loading || !isDirty"
            @click="save"
          >
            <i v-if="saving" class="fas fa-spinner loading-spinner mr-2" />
            <i v-else class="fas fa-save mr-2" />
            保存
          </button>
        </div>
      </div>

      <!-- 管理模式：左编辑右预览 -->
      <div v-if="isManaging" class="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section class="rounded-2xl border border-white/10 bg-white/10 p-4 dark:bg-black/20">
          <div class="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div class="text-sm font-semibold text-gray-800 dark:text-gray-200">Markdown 编辑</div>
            <div class="flex flex-wrap items-center gap-2">
              <div class="flex items-center gap-2">
                <span class="text-xs text-gray-600 dark:text-gray-400">宽度</span>
                <input v-model="imageSettings.width" class="input w-24" placeholder="例如 600" />
                <select v-model="imageSettings.widthUnit" class="input w-20">
                  <option value="px">px</option>
                  <option value="%">%</option>
                </select>
              </div>
              <div class="flex items-center gap-2">
                <span class="text-xs text-gray-600 dark:text-gray-400">高度</span>
                <input v-model="imageSettings.height" class="input w-24" placeholder="可选" />
                <select v-model="imageSettings.heightUnit" class="input w-20">
                  <option value="px">px</option>
                  <option value="%">%</option>
                </select>
              </div>
              <input
                ref="fileInputRef"
                accept="image/*"
                class="hidden"
                type="file"
                @change="handleFileChange"
              />
              <button
                class="btn btn-success px-4 py-2 text-sm"
                :disabled="uploading"
                @click="pickImage"
              >
                <i v-if="uploading" class="fas fa-spinner loading-spinner mr-2" />
                <i v-else class="fas fa-image mr-2" />
                上传图片
              </button>
            </div>
          </div>

          <textarea
            ref="editorRef"
            v-model="editorContent"
            class="h-[60vh] w-full rounded-xl border border-gray-200 bg-white/80 p-4 font-mono text-sm text-gray-800 shadow-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200 dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-100 dark:focus:border-indigo-500 dark:focus:ring-indigo-500/20"
            placeholder="在这里用 Markdown 编写教程（支持粘贴图片）"
            @paste="handlePaste"
          />

          <div class="mt-3 text-xs text-gray-500 dark:text-gray-400">
            提示：直接粘贴截图/图片会自动上传并插入引用；图片尺寸使用上方宽高设置控制（留空表示默认大小）。
          </div>
        </section>

        <section class="rounded-2xl border border-white/10 bg-white/10 p-4 dark:bg-black/20">
          <div class="mb-3 text-sm font-semibold text-gray-800 dark:text-gray-200">实时预览</div>
          <div
            class="tutorial-preview prose max-w-none rounded-xl bg-white/70 p-4 text-gray-800 dark:bg-gray-900/40 dark:text-gray-100"
            v-html="renderedHtml"
          />
        </section>
      </div>

      <!-- 查看模式：优先显示 Markdown；Claude 为空时回退到内置教程 -->
      <div v-else>
        <div v-if="useLegacyFallback" ref="legacyContainerRef">
          <LegacyTutorialView
            embedded
            hide-header
            :hide-system-tabs="true"
            :initial-system="activeSystem"
            :target-model="activeModel"
          />
        </div>
        <div v-else class="rounded-2xl border border-white/10 bg-white/10 p-4 dark:bg-black/20">
          <div
            class="tutorial-preview prose max-w-none rounded-xl bg-white/70 p-4 text-gray-800 dark:bg-gray-900/40 dark:text-gray-100"
            v-html="renderedHtml"
          />
        </div>
        <div
          v-if="!useLegacyFallback && !editorContent"
          class="mt-3 text-sm text-gray-600 dark:text-gray-300"
        >
          暂无教程内容，请点击“进入管理”编写并保存。
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, reactive, ref } from 'vue'
import DOMPurify from 'dompurify'
import { marked } from 'marked'
import TurndownService from 'turndown'
import LegacyTutorialView from '@/views/LegacyTutorialView.vue'
import { apiClient, createApiUrl } from '@/config/api'
import { showToast } from '@/utils/toast'
import { useAuthStore } from '@/stores/auth'

marked.setOptions({
  gfm: true,
  breaks: true
})

const props = defineProps({
  readOnly: {
    type: Boolean,
    default: false
  },
  hideHeader: {
    type: Boolean,
    default: false
  }
})

const modelOptions = [
  { key: 'claude', name: 'Claude', icon: 'fas fa-robot' },
  { key: 'codex', name: 'Codex', icon: 'fas fa-code' },
  { key: 'gemini', name: 'Gemini', icon: 'fas fa-gem' },
  { key: 'droid', name: 'Droid', icon: 'fas fa-terminal' }
]

const systemOptions = [
  { key: 'windows', name: 'Windows', icon: 'fab fa-windows' },
  { key: 'macos', name: 'macOS', icon: 'fab fa-apple' },
  { key: 'linux', name: 'Linux', icon: 'fab fa-linux' }
]

const activeModel = ref('claude')
const activeSystem = ref('windows')

const isManaging = ref(false)

const authStore = useAuthStore()
const canManage = computed(() => !props.readOnly && authStore.isAuthenticated)

const loading = ref(false)
const saving = ref(false)
const uploading = ref(false)

const editorRef = ref(null)
const fileInputRef = ref(null)
const legacyContainerRef = ref(null)

const loadedContent = ref('')
const loadedAtMs = ref(0)
const editorContent = ref('')

const imageSettings = reactive({
  width: '600',
  widthUnit: 'px',
  height: '',
  heightUnit: 'px'
})

const currentLabel = computed(() => {
  const modelName = modelOptions.find((v) => v.key === activeModel.value)?.name || activeModel.value
  const systemName =
    systemOptions.find((v) => v.key === activeSystem.value)?.name || activeSystem.value
  return `${modelName} / ${systemName}`
})

const isDirty = computed(() => editorContent.value !== loadedContent.value)

const useLegacyFallback = computed(
  () => !isManaging.value && !String(editorContent.value || '').trim()
)

const createLegacyTurndownService = () => {
  const service = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-'
  })

  service.addRule('legacyCodeBlockDiv', {
    filter: (node) => {
      if (!node || node.nodeName !== 'DIV') return false
      const classList = node.classList
      if (!classList) return false
      if (!classList.contains('font-mono')) return false

      return (
        classList.contains('bg-gray-900') ||
        classList.contains('bg-slate-900') ||
        classList.contains('bg-black')
      )
    },
    replacement: (content, node) => {
      const text = String(node?.innerText || '')
        .replace(/\r\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
      if (!text) return ''
      return `\n\n\`\`\`text\n${text}\n\`\`\`\n\n`
    }
  })

  return service
}

const legacyTurndownService = createLegacyTurndownService()

const renderedHtml = computed(() => {
  const raw = marked.parse(editorContent.value || '')
  return DOMPurify.sanitize(raw, {
    ADD_ATTR: ['target', 'rel', 'style', 'width', 'height']
  })
})

const formatTime = (ms) => {
  const num = Number(ms)
  if (!Number.isFinite(num) || num <= 0) return '-'
  return new Date(num).toLocaleString()
}

const confirmIfDirty = async () => {
  if (!isDirty.value) return true
  const ok = window.confirm('当前内容未保存，确认继续切换吗？')
  return ok
}

const load = async () => {
  loading.value = true
  try {
    const result = await apiClient.get('/tutorials/content', {
      params: {
        model: activeModel.value,
        system: activeSystem.value
      }
    })

    const content = result?.data?.content || ''
    loadedContent.value = content
    loadedAtMs.value = result?.data?.updatedAtMs || 0
    editorContent.value = content
  } catch (error) {
    showToast(error.message || '加载教程失败', 'error')
  } finally {
    loading.value = false
  }
}

const reload = async () => {
  const ok = await confirmIfDirty()
  if (!ok) return
  await load()
}

const save = async () => {
  if (!canManage.value) {
    showToast('当前页面为只读，无法保存', 'error')
    return
  }
  saving.value = true
  try {
    const result = await apiClient.put('/admin/tutorials/content', {
      model: activeModel.value,
      system: activeSystem.value,
      content: editorContent.value
    })
    loadedContent.value = editorContent.value
    loadedAtMs.value = result?.data?.updatedAtMs || Date.now()
    showToast('保存成功', 'success')
  } catch (error) {
    showToast(error.message || '保存失败', 'error')
  } finally {
    saving.value = false
  }
}

const importLegacyIfEmpty = () => {
  if (String(editorContent.value || '').trim()) return false

  const legacyContainer = legacyContainerRef.value
  const html = legacyContainer?.innerHTML || ''
  if (!String(html || '').trim()) return false

  const markdown = legacyTurndownService.turndown(html)
  const normalized = String(markdown || '').trim()
  if (!normalized) return false

  editorContent.value = `${normalized}\n`
  showToast('已导入内置教程内容，请保存后再编辑', 'success')
  return true
}

const toggleManage = async () => {
  if (!canManage.value) {
    showToast('请先登录管理后台后再编辑教程', 'error')
    return
  }

  if (isManaging.value) {
    const ok = await confirmIfDirty()
    if (!ok) return
    isManaging.value = false
    return
  }

  if (useLegacyFallback.value) {
    await nextTick()
    try {
      importLegacyIfEmpty()
    } catch (error) {
      showToast(error.message || '导入内置教程失败', 'error')
    }
  }
  isManaging.value = true
  await nextTick()
  editorRef.value?.focus?.()
}

const switchModel = async (key) => {
  if (key === activeModel.value) return
  const ok = await confirmIfDirty()
  if (!ok) return

  activeModel.value = key
  if (!systemOptions.find((v) => v.key === activeSystem.value)) {
    activeSystem.value = 'windows'
  }
  await load()
}

const switchSystem = async (key) => {
  if (key === activeSystem.value) return
  const ok = await confirmIfDirty()
  if (!ok) return

  activeSystem.value = key
  await load()
}

const insertAtCursor = (text) => {
  const textarea = editorRef.value
  if (!textarea) {
    editorContent.value += text
    return
  }
  const start = textarea.selectionStart || 0
  const end = textarea.selectionEnd || 0
  const before = editorContent.value.slice(0, start)
  const after = editorContent.value.slice(end)
  editorContent.value = before + text + after

  nextTick(() => {
    textarea.focus()
    const pos = start + text.length
    textarea.setSelectionRange(pos, pos)
  })
}

const toSizeValue = (raw) => {
  const value = String(raw || '').trim()
  if (!value) return ''
  const num = Number(value)
  if (!Number.isFinite(num) || num <= 0) return ''
  return String(Math.round(num))
}

const buildImageMarkup = (url, alt = '') => {
  const width = toSizeValue(imageSettings.width)
  const height = toSizeValue(imageSettings.height)
  const widthUnit = imageSettings.widthUnit === '%' ? '%' : 'px'
  const heightUnit = imageSettings.heightUnit === '%' ? '%' : 'px'

  if (!width && !height) {
    return `![](${url})\n`
  }

  const styles = []
  if (width) styles.push(`width: ${width}${widthUnit};`)
  if (height) styles.push(`height: ${height}${heightUnit};`)
  styles.push('max-width: 100%;')

  const safeAlt = String(alt || '')
    .replace(/"/g, "'")
    .slice(0, 200)
  return `<img src="${url}" alt="${safeAlt}" style="${styles.join(' ')}" />\n`
}

const uploadImageFile = async (file) => {
  if (!file) return null

  const token = localStorage.getItem('authToken') || ''
  const url = createApiUrl(
    `/admin/tutorials/assets/upload?model=${encodeURIComponent(
      activeModel.value
    )}&system=${encodeURIComponent(activeSystem.value)}`
  )

  uploading.value = true
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        'Content-Type': file.type || 'application/octet-stream',
        'X-File-Name': file.name || 'image'
      },
      body: file
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(errorText || `HTTP ${response.status}`)
    }

    const result = await response.json()
    const imageUrl = result?.data?.url || ''
    if (!imageUrl) {
      throw new Error(result?.message || '上传失败')
    }
    return { url: imageUrl, name: file.name || '' }
  } finally {
    uploading.value = false
  }
}

const pickImage = () => {
  fileInputRef.value?.click?.()
}

const handleFileChange = async (event) => {
  const file = event?.target?.files?.[0] || null
  if (!file) return

  try {
    const uploaded = await uploadImageFile(file)
    if (uploaded?.url) {
      insertAtCursor(buildImageMarkup(uploaded.url, uploaded.name))
      showToast('图片已上传并插入', 'success')
    }
  } catch (error) {
    showToast(error.message || '图片上传失败', 'error')
  } finally {
    if (event?.target) {
      event.target.value = ''
    }
  }
}

const handlePaste = async (event) => {
  try {
    const clipboard = event?.clipboardData
    if (!clipboard?.items || clipboard.items.length === 0) return

    const imageItem = Array.from(clipboard.items).find((item) => item.type?.startsWith('image/'))
    if (!imageItem) return

    const file = imageItem.getAsFile()
    if (!file) return

    event.preventDefault()

    const uploaded = await uploadImageFile(file)
    if (uploaded?.url) {
      insertAtCursor(buildImageMarkup(uploaded.url, uploaded.name))
      showToast('已粘贴图片并插入', 'success')
    }
  } catch (error) {
    showToast(error.message || '粘贴图片失败', 'error')
  }
}

onMounted(async () => {
  await load()
})
</script>

<style scoped>
.input {
  @apply w-full rounded-xl border border-gray-200 bg-white/80 px-3 py-2 text-sm text-gray-800 shadow-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200 dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-100 dark:focus:border-indigo-500 dark:focus:ring-indigo-500/20;
}

.tutorial-preview :deep(img) {
  border-radius: 12px;
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.08);
  margin: 12px 0;
}

.tutorial-preview :deep(pre) {
  border-radius: 12px;
  padding: 12px;
  background: rgba(15, 23, 42, 0.95);
  color: #e2e8f0;
  overflow-x: auto;
}

.tutorial-preview :deep(code) {
  font-family:
    ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New',
    monospace;
}

.tutorial-preview :deep(a) {
  color: #4f46e5;
  text-decoration: underline;
}
</style>
