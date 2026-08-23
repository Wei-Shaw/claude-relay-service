<template>
  <div class="space-y-5">
    <p class="text-sm text-gray-500 dark:text-gray-400">
      支持 CRS 原生导出、sub2api 数据包、CLIProxyAPI auth 文件（.json 或 .zip）。
    </p>

    <!-- 文件选择 -->
    <div
      class="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-gray-300 px-6 py-8 dark:border-gray-600"
    >
      <i class="fas fa-file-import text-3xl text-gray-400" />
      <input
        ref="fileInput"
        accept=".json,.zip"
        class="hidden"
        type="file"
        @change="onFileChange"
      />
      <button
        class="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300"
        @click="$refs.fileInput.click()"
      >
        选择文件
      </button>
      <span v-if="file" class="text-sm text-gray-600 dark:text-gray-400">{{ file.name }}</span>
    </div>

    <!-- 预检结果 -->
    <div v-if="inspectResult" class="rounded-xl border border-gray-200 p-4 dark:border-gray-700">
      <div class="mb-3 flex flex-wrap gap-3 text-sm">
        <span class="font-medium text-gray-700 dark:text-gray-300">
          格式：{{ formatLabel(inspectResult.format) }}
        </span>
        <span class="text-green-600 dark:text-green-400"
          >可导入 {{ inspectResult.summary.importable }}</span
        >
        <span v-if="inspectResult.summary.conflicts" class="text-yellow-600 dark:text-yellow-400">
          冲突 {{ inspectResult.summary.conflicts }}
        </span>
        <span v-if="inspectResult.summary.unsupported" class="text-gray-500">
          不支持 {{ inspectResult.summary.unsupported }}
        </span>
      </div>
      <div class="max-h-52 overflow-y-auto rounded-lg bg-gray-50 dark:bg-gray-900/40">
        <div
          v-for="(item, i) in inspectResult.items"
          :key="i"
          class="border-b border-gray-100 px-3 py-2 text-xs last:border-0 dark:border-gray-700/50"
        >
          <div class="flex items-center justify-between gap-3">
            <span class="truncate text-gray-700 dark:text-gray-300">
              <span
                class="mr-2 inline-block rounded bg-gray-200 px-1.5 py-0.5 text-[10px] dark:bg-gray-700"
              >
                {{ item.platform }}
              </span>
              {{ item.name }}
            </span>
            <span :class="actionClass(item.action)">{{ actionLabel(item.action) }}</span>
          </div>
          <div
            v-if="Array.isArray(item.warnings) && item.warnings.length > 0"
            class="mt-1 space-y-1 text-gray-500 dark:text-gray-400"
          >
            <div v-for="(warning, warningIndex) in item.warnings" :key="warningIndex">
              {{ warning }}
            </div>
          </div>
        </div>
      </div>
      <div
        v-if="Array.isArray(inspectResult.errors) && inspectResult.errors.length > 0"
        class="mt-3 space-y-1 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-900/20 dark:text-red-300"
      >
        <div v-for="(error, index) in inspectResult.errors" :key="index">
          {{ error.message || error }}
        </div>
      </div>
    </div>

    <!-- 选项 -->
    <div v-if="inspectResult" class="flex gap-4 text-sm">
      <label class="flex items-center gap-2 text-gray-700 dark:text-gray-300">
        <input v-model="allowCreate" class="rounded" type="checkbox" />新建账户
      </label>
      <label class="flex items-center gap-2 text-gray-700 dark:text-gray-300">
        <input v-model="allowUpdate" class="rounded" type="checkbox" />更新已有账户
      </label>
    </div>

    <div class="flex gap-3">
      <button
        class="flex-1 rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-300"
        :disabled="!file || busy"
        @click="doInspect"
      >
        <i
          class="mr-1.5"
          :class="busy && phase === 'inspect' ? 'fas fa-spinner fa-spin' : 'fas fa-search'"
        />
        预检
      </button>
      <button
        class="flex-1 rounded-lg bg-gradient-to-r from-green-500 to-green-600 px-4 py-2.5 text-sm font-medium text-white shadow-md hover:shadow-lg disabled:opacity-50"
        :disabled="!inspectResult || busy || inspectResult.summary.importable === 0"
        @click="doImport"
      >
        <i
          class="mr-1.5"
          :class="busy && phase === 'import' ? 'fas fa-spinner fa-spin' : 'fas fa-upload'"
        />
        执行导入
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { showToast } from '@/utils/tools'
import { inspectAccountImportApi, importAccountsApi } from '@/utils/http_apis'

const emit = defineEmits(['imported'])

const fileInput = ref(null)
const file = ref(null)
const contentBase64 = ref('')
const inspectResult = ref(null)
const allowCreate = ref(true)
const allowUpdate = ref(true)
const busy = ref(false)
const phase = ref('')

const FORMAT_LABELS = {
  crs: 'CRS 原生',
  sub2api: 'sub2api',
  'cliproxyapi-json': 'CLIProxyAPI (单文件)',
  'cliproxyapi-zip': 'CLIProxyAPI (zip)',
  unknown: '未识别'
}
function formatLabel(f) {
  return FORMAT_LABELS[f] || f
}

const ACTION_LABELS = {
  create: '新建',
  update: '更新',
  conflict: '冲突·跳过',
  unsupported: '不支持'
}
function actionLabel(a) {
  return ACTION_LABELS[a] || a
}
function actionClass(a) {
  if (a === 'create') {
    return 'text-green-600 dark:text-green-400'
  }
  if (a === 'update') {
    return 'text-blue-600 dark:text-blue-400'
  }
  if (a === 'conflict') {
    return 'text-yellow-600 dark:text-yellow-400'
  }
  return 'text-gray-400'
}

// File -> base64（去掉 dataURL 前缀）
function readAsBase64(f) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result || '')
      resolve(result.includes(',') ? result.split(',')[1] : result)
    }
    reader.onerror = () => reject(reader.error || new Error('读取文件失败'))
    reader.readAsDataURL(f)
  })
}

async function onFileChange(e) {
  const f = e.target.files && e.target.files[0]
  inspectResult.value = null
  if (!f) {
    file.value = null
    contentBase64.value = ''
    return
  }
  file.value = f
  try {
    contentBase64.value = await readAsBase64(f)
  } catch (err) {
    showToast(err.message || '读取文件失败', 'error')
    file.value = null
    contentBase64.value = ''
  }
}

async function doInspect() {
  if (!contentBase64.value) {
    return
  }
  busy.value = true
  phase.value = 'inspect'
  try {
    const res = await inspectAccountImportApi({
      filename: file.value?.name,
      contentBase64: contentBase64.value
    })
    if (!res || res.success === false) {
      showToast(res?.message || res?.error || '预检失败', 'error')
      return
    }
    inspectResult.value = res
    if (res.format === 'unknown') {
      showToast('无法识别文件格式', 'warning')
    }
  } catch (err) {
    showToast(err.message || '预检失败', 'error')
  } finally {
    busy.value = false
    phase.value = ''
  }
}

async function doImport() {
  if (!contentBase64.value) {
    return
  }
  busy.value = true
  phase.value = 'import'
  try {
    const res = await importAccountsApi({
      filename: file.value?.name,
      contentBase64: contentBase64.value,
      options: { allowCreate: allowCreate.value, allowUpdate: allowUpdate.value }
    })
    if (!res || res.success === false) {
      showToast(res?.message || res?.error || '导入失败', 'error')
      return
    }
    showToast(
      `导入完成：新建 ${res.created}，更新 ${res.updated}，跳过 ${res.skipped}，失败 ${res.failed}`,
      res.failed > 0 ? 'warning' : 'success'
    )
    emit('imported')
  } catch (err) {
    showToast(err.message || '导入失败', 'error')
  } finally {
    busy.value = false
    phase.value = ''
  }
}
</script>
