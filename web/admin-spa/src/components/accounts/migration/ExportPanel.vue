<template>
  <div class="space-y-5">
    <p class="text-sm text-gray-500 dark:text-gray-400">
      导出账户（含明文凭据，请妥善保管）。可选导出范围与目标格式。
    </p>

    <!-- 范围 -->
    <div>
      <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
        >导出范围</label
      >
      <div class="flex gap-3">
        <button
          v-for="opt in scopeOptions"
          :key="opt.key"
          :class="[
            'flex-1 rounded-lg border px-4 py-3 text-sm transition-all',
            scope === opt.key
              ? 'bg-primary/5 border-primary text-primary'
              : 'border-gray-200 text-gray-600 hover:border-gray-300 dark:border-gray-600 dark:text-gray-300'
          ]"
          :disabled="opt.key === 'selected' && selectedIds.length === 0"
          @click="scope = opt.key"
        >
          <i class="mr-1.5" :class="opt.icon" />{{ opt.label }}
          <span v-if="opt.key === 'selected'" class="ml-1 text-xs opacity-70"
            >({{ selectedIds.length }})</span
          >
        </button>
      </div>
    </div>

    <!-- 格式 -->
    <div>
      <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
        >目标格式</label
      >
      <div class="space-y-2">
        <button
          v-for="opt in formatOptions"
          :key="opt.key"
          :class="[
            'flex w-full items-start gap-3 rounded-lg border px-4 py-3 text-left transition-all',
            format === opt.key
              ? 'bg-primary/5 border-primary'
              : 'border-gray-200 hover:border-gray-300 dark:border-gray-600'
          ]"
          @click="format = opt.key"
        >
          <i
            class="mt-0.5"
            :class="[opt.icon, format === opt.key ? 'text-primary' : 'text-gray-400']"
          />
          <div>
            <div class="text-sm font-medium text-gray-800 dark:text-gray-200">{{ opt.label }}</div>
            <div class="text-xs text-gray-500 dark:text-gray-400">{{ opt.desc }}</div>
          </div>
        </button>
      </div>
    </div>

    <button
      class="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-blue-500 to-indigo-600 px-5 py-2.5 text-sm font-medium text-white shadow-md transition-all hover:shadow-lg disabled:opacity-50"
      :disabled="exporting"
      @click="doExport"
    >
      <i :class="exporting ? 'fas fa-spinner fa-spin' : 'fas fa-download'" />
      {{ exporting ? '导出中...' : '导出' }}
    </button>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { showToast } from '@/utils/tools'
import { exportAccountsApi } from '@/utils/http_apis'

const props = defineProps({
  selectedIds: { type: Array, default: () => [] }
})

const scope = ref('all')
const format = ref('crs')
const exporting = ref(false)

const scopeOptions = [
  { key: 'all', label: '全部账户', icon: 'fas fa-globe' },
  { key: 'selected', label: '仅选中', icon: 'fas fa-check-square' }
]
const formatOptions = [
  {
    key: 'crs',
    label: 'CRS 原生',
    icon: 'fas fa-database',
    desc: '本服务完整格式，含全部平台与字段，可无损回导'
  },
  {
    key: 'sub2api',
    label: 'sub2api',
    icon: 'fas fa-exchange-alt',
    desc: 'OAuth / Gemini API 账户，导出为 sub2api 数据包'
  },
  {
    key: 'cliproxyapi',
    label: 'CLIProxyAPI',
    icon: 'fas fa-file-code',
    desc: 'OAuth 账户导出为 auth 认证文件（多个时打包 zip）'
  }
]

// 从 Content-Disposition 提取文件名
function filenameFrom(res, fallback) {
  const cd = res.headers.get('content-disposition') || ''
  const m = cd.match(/filename="?([^"]+)"?/i)
  return m ? decodeURIComponent(m[1]) : fallback
}

async function doExport() {
  exporting.value = true
  try {
    const ids = scope.value === 'selected' ? props.selectedIds : null
    const res = await exportAccountsApi({ format: format.value, ids })
    if (!res || !res.ok) {
      const text = res ? await res.text().catch(() => '') : ''
      let message = text
      try {
        message = JSON.parse(text).message || text
      } catch {
        // 非 JSON 响应，原样展示
      }
      showToast(message || '导出失败', 'error')
      return
    }
    const blob = await res.blob()
    const filename = filenameFrom(res, `accounts-${format.value}.json`)
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    // 跳过/读取失败项提示（header 只携带计数，完整明细见服务端日志）
    const countHeader = (name) => parseInt(res.headers.get(name) || '0', 10) || 0
    const skippedCount = countHeader('x-export-skipped-count')
    const readErrorCount = countHeader('x-export-read-errors-count')
    if (readErrorCount > 0 || skippedCount > 0) {
      const parts = []
      if (readErrorCount > 0) {
        parts.push(`${readErrorCount} 个账户读取失败未导出`)
      }
      if (skippedCount > 0) {
        parts.push(`${skippedCount} 个账户因格式不支持被跳过`)
      }
      showToast(`已导出，但有 ${parts.join('，')}`, readErrorCount > 0 ? 'error' : 'warning')
      return
    }
    showToast('导出成功', 'success')
  } catch (e) {
    showToast(e.message || '导出失败', 'error')
  } finally {
    exporting.value = false
  }
}
</script>
