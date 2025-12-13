<template>
  <div class="space-y-6">
    <div>
      <h2 class="text-2xl font-bold text-gray-800 dark:text-gray-100">
        <i class="fas fa-ticket-alt mr-2 text-indigo-500" />
        兑换码管理
      </h2>
      <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
        创建一次性兑换码，用户在“统计查询”页使用后可延长 API Key 过期时间。
      </p>
    </div>

    <!-- 创建 -->
    <div class="card p-4 md:p-6">
      <div class="grid grid-cols-1 gap-4 md:grid-cols-4">
        <div>
          <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
            续费时长
          </label>
          <input
            v-model.number="extendValue"
            class="form-input w-full"
            :disabled="loading"
            min="1"
            type="number"
          />
        </div>

        <div>
          <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
            单位
          </label>
          <select v-model="extendUnit" class="form-input w-full" :disabled="loading">
            <option value="days">天</option>
            <option value="hours">小时</option>
          </select>
        </div>

        <div>
          <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
            生成数量
          </label>
          <input
            v-model.number="quantity"
            class="form-input w-full"
            :disabled="loading"
            max="100"
            min="1"
            type="number"
          />
        </div>

        <div class="flex items-end">
          <button
            class="btn btn-primary flex w-full items-center justify-center gap-2 px-4 py-2.5"
            :disabled="loading"
            @click="generateCodes"
          >
            <i v-if="loading" class="fas fa-spinner loading-spinner" />
            <i v-else class="fas fa-plus" />
            {{ loading ? '生成中...' : '生成兑换码' }}
          </button>
        </div>
      </div>

      <div
        v-if="formError"
        class="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-200"
      >
        <i class="fas fa-exclamation-triangle mr-2" />
        {{ formError }}
      </div>

      <div class="mt-4 text-xs text-gray-500 dark:text-gray-400">
        <i class="fas fa-info-circle mr-1" />
        兑换码为一次性使用，核销时会自动延长过期时间（已过期则从核销时开始计算）。
      </div>
    </div>

    <!-- 最近生成 -->
    <div v-if="recentCodes.length > 0" class="card p-4 md:p-6">
      <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div class="flex items-center gap-2">
          <i class="fas fa-list-ul text-indigo-500" />
          <h3 class="text-lg font-semibold text-gray-800 dark:text-gray-200">最近生成</h3>
          <span class="text-xs text-gray-500 dark:text-gray-400">
            ({{ recentCodes.length }} 个)
          </span>
        </div>

        <div class="flex flex-wrap gap-2">
          <button class="btn btn-secondary px-4 py-2 text-sm" @click="copyAllRecent">
            <i class="fas fa-copy mr-1" />
            复制全部
          </button>
          <button class="btn btn-secondary px-4 py-2 text-sm" @click="exportRecentTxt">
            <i class="fas fa-file-export mr-1" />
            导出TXT
          </button>
          <button class="btn btn-secondary px-4 py-2 text-sm" @click="clearRecent">
            <i class="fas fa-broom mr-1" />
            清空列表
          </button>
        </div>
      </div>

      <div class="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        <div
          v-for="code in recentCodes"
          :key="code"
          class="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white/60 p-3 shadow-sm dark:border-gray-700 dark:bg-gray-800/40"
        >
          <code class="break-all font-mono text-sm text-gray-800 dark:text-gray-100">
            {{ code }}
          </code>
          <button
            class="text-sm font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-300 dark:hover:text-indigo-200"
            @click="copyOne(code)"
          >
            <i class="fas fa-copy mr-1" />
            复制
          </button>
        </div>
      </div>
    </div>

    <!-- 历史兑换码 -->
    <div class="card p-4 md:p-6">
      <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div class="flex flex-wrap items-center gap-2">
          <i class="fas fa-database text-indigo-500" />
          <h3 class="text-lg font-semibold text-gray-800 dark:text-gray-200">历史兑换码</h3>
          <span class="text-xs text-gray-500 dark:text-gray-400">
            共 {{ summary.total }} 个，未使用 {{ summary.unused }} / 已使用 {{ summary.used }}
          </span>
        </div>

        <div class="flex flex-wrap gap-2">
          <button
            class="btn btn-secondary px-4 py-2 text-sm"
            :disabled="listLoading"
            @click="loadRedeemCodes"
          >
            <i class="fas fa-sync-alt mr-1" />
            刷新
          </button>
          <button
            class="btn btn-secondary px-4 py-2 text-sm"
            :disabled="listLoading || exportCandidates.length === 0"
            @click="copyExportCandidates"
          >
            <i class="fas fa-copy mr-1" />
            复制
          </button>
          <button
            class="btn btn-secondary px-4 py-2 text-sm"
            :disabled="listLoading || exportCandidates.length === 0"
            @click="exportCandidatesTxt"
          >
            <i class="fas fa-file-export mr-1" />
            导出TXT
          </button>
          <button
            class="btn btn-danger px-4 py-2 text-sm"
            :disabled="listLoading || selectedCodes.length === 0"
            @click="deleteSelected"
          >
            <i class="fas fa-trash mr-1" />
            删除选中
          </button>
        </div>
      </div>

      <div class="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
        <input
          v-model="searchQuery"
          class="form-input w-full md:col-span-2"
          placeholder="搜索兑换码/创建者/使用Key（支持部分匹配）"
          type="text"
        />
        <select v-model="statusFilter" class="form-input w-full">
          <option value="all">全部</option>
          <option value="unused">未使用</option>
          <option value="used">已使用</option>
        </select>
        <select v-model.number="pageSize" class="form-input w-full">
          <option :value="20">20 / 页</option>
          <option :value="50">50 / 页</option>
          <option :value="100">100 / 页</option>
          <option :value="200">200 / 页</option>
        </select>
      </div>

      <div
        v-if="listError"
        class="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-200"
      >
        <i class="fas fa-exclamation-triangle mr-2" />
        {{ listError }}
      </div>

      <div
        v-if="listLoading"
        class="mt-6 flex items-center justify-center py-10 text-sm text-gray-500 dark:text-gray-400"
      >
        <i class="fas fa-spinner loading-spinner mr-2" />
        加载中...
      </div>

      <div v-else class="mt-4">
        <div
          v-if="pagedItems.length === 0"
          class="rounded-xl border border-gray-200 bg-white/60 p-6 text-center text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-800/40 dark:text-gray-300"
        >
          暂无兑换码数据
        </div>

        <div v-else class="table-container">
          <table class="w-full table-auto">
            <thead>
              <tr class="text-left text-xs font-semibold text-gray-600 dark:text-gray-300">
                <th class="w-10 py-3">
                  <input
                    :checked="allVisibleSelected"
                    type="checkbox"
                    @change="toggleSelectAllVisible($event.target.checked)"
                  />
                </th>
                <th class="py-3">兑换码</th>
                <th class="py-3">续费</th>
                <th class="py-3">状态</th>
                <th class="py-3">创建</th>
                <th class="py-3">使用</th>
                <th class="w-24 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody class="text-sm text-gray-800 dark:text-gray-100">
              <tr
                v-for="item in pagedItems"
                :key="item.code"
                class="border-t border-gray-200/60 dark:border-gray-700/60"
              >
                <td class="py-3 align-top">
                  <input
                    :checked="Boolean(selectedMap[item.code])"
                    type="checkbox"
                    @change="toggleSelected(item.code, $event.target.checked)"
                  />
                </td>

                <td class="py-3 align-top">
                  <div class="flex flex-wrap items-center gap-2">
                    <code class="break-all font-mono text-xs md:text-sm">{{ item.code }}</code>
                    <button
                      class="text-xs font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-300 dark:hover:text-indigo-200"
                      @click="copyOne(item.code)"
                    >
                      <i class="fas fa-copy mr-1" />
                      复制
                    </button>
                  </div>
                </td>

                <td class="py-3 align-top">
                  <span class="font-semibold">{{ formatExtend(item) }}</span>
                </td>

                <td class="py-3 align-top">
                  <span
                    class="inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold"
                    :class="
                      item.isUsed
                        ? 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200'
                        : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                    "
                  >
                    <i :class="item.isUsed ? 'fas fa-check-circle mr-1' : 'fas fa-circle mr-1'" />
                    {{ item.isUsed ? '已使用' : '未使用' }}
                  </span>
                </td>

                <td class="py-3 align-top">
                  <div class="text-xs md:text-sm">{{ formatDateSafe(item.createdAt) }}</div>
                  <div class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {{ item.createdBy || '-' }}
                  </div>
                </td>

                <td class="py-3 align-top">
                  <template v-if="item.isUsed">
                    <div class="text-xs md:text-sm">{{ formatDateSafe(item.usedAt) }}</div>
                    <div class="mt-1 break-all text-xs text-gray-500 dark:text-gray-400">
                      <template v-if="item.usedByKeyName">
                        {{ item.usedByKeyName }} ({{ item.usedByKeyId }})
                      </template>
                      <template v-else>
                        {{ item.usedByKeyId || '-' }}
                      </template>
                    </div>
                  </template>
                  <template v-else>
                    <span class="text-xs text-gray-400 dark:text-gray-500">-</span>
                  </template>
                </td>

                <td class="py-3 text-right align-top">
                  <button
                    class="text-xs font-semibold"
                    :class="
                      item.isUsed
                        ? 'cursor-not-allowed text-gray-400 dark:text-gray-600'
                        : 'text-red-600 hover:text-red-700 dark:text-red-300 dark:hover:text-red-200'
                    "
                    :disabled="item.isUsed"
                    @click="deleteOne(item.code)"
                  >
                    <i class="fas fa-trash mr-1" />
                    删除
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div
          class="mt-4 flex flex-col gap-2 text-sm text-gray-600 dark:text-gray-300 sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            显示 {{ pageStart }}-{{ pageEnd }} / {{ filteredItems.length }}
            <span
              v-if="selectedCodes.length > 0"
              class="ml-2 text-xs text-indigo-600 dark:text-indigo-300"
            >
              已选中 {{ selectedCodes.length }} 个
            </span>
          </div>
          <div class="flex items-center gap-2">
            <button
              class="btn btn-secondary px-3 py-2 text-xs"
              :disabled="page <= 1"
              @click="page--"
            >
              上一页
            </button>
            <span class="text-xs">{{ page }} / {{ totalPages }}</span>
            <button
              class="btn btn-secondary px-3 py-2 text-xs"
              :disabled="page >= totalPages"
              @click="page++"
            >
              下一页
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { apiClient } from '@/config/api'
import { showToast } from '@/utils/toast'
import { formatDate } from '@/utils/format'
import { copyTextToClipboard } from '@/utils/clipboard'

const extendValue = ref(30)
const extendUnit = ref('days')
const quantity = ref(1)
const loading = ref(false)
const formError = ref('')
const recentCodes = ref([])

const listLoading = ref(false)
const listError = ref('')
const items = ref([])
const summary = ref({ total: 0, used: 0, unused: 0 })

const searchQuery = ref('')
const statusFilter = ref('all')
const pageSize = ref(50)
const page = ref(1)
const selectedMap = ref({})

const validate = () => {
  const value = Number(extendValue.value)
  const count = Number(quantity.value)

  if (!Number.isFinite(value) || value <= 0) {
    return '续费时长必须为正整数'
  }
  if (!Number.isFinite(count) || count <= 0 || count > 100) {
    return '生成数量必须在 1-100 之间'
  }
  return ''
}

const generateCodes = async () => {
  formError.value = validate()
  if (formError.value) {
    showToast(formError.value, 'error', '兑换码')
    return
  }

  loading.value = true
  try {
    const result = await apiClient.post('/admin/redeem-codes', {
      extendValue: extendValue.value,
      extendUnit: extendUnit.value,
      quantity: quantity.value
    })

    if (!result?.success) {
      throw new Error(result?.message || '生成失败')
    }

    recentCodes.value = result.data.codes || []
    showToast(`已生成 ${recentCodes.value.length} 个兑换码`, 'success', '兑换码')
    await loadRedeemCodes()
  } catch (error) {
    formError.value = error.message || '生成失败'
    showToast(formError.value, 'error', '兑换码')
  } finally {
    loading.value = false
  }
}

const compact = (value) =>
  String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')

const copyOne = async (code) => {
  const ok = await copyTextToClipboard(code)
  if (ok) {
    showToast('已复制到剪贴板', 'success', '兑换码')
  } else {
    showToast('复制失败，请手动复制', 'error', '兑换码')
  }
}

const copyAllRecent = async () => {
  const text = recentCodes.value.join('\n')
  const ok = await copyTextToClipboard(text)
  if (ok) {
    showToast('已复制全部兑换码', 'success', '兑换码')
  } else {
    showToast('复制失败，请手动复制', 'error', '兑换码')
  }
}

const clearRecent = () => {
  recentCodes.value = []
}

const formatDateSafe = (value) => {
  if (!value) return '-'
  return formatDate(value)
}

const formatExtend = (item) => {
  const value = Number(item?.extendValue || 0)
  const unit = item?.extendUnit === 'hours' ? '小时' : '天'
  return `${value}${unit}`
}

const loadRedeemCodes = async () => {
  listLoading.value = true
  listError.value = ''
  try {
    const result = await apiClient.get('/admin/redeem-codes', {
      params: { limit: 20000 }
    })

    if (!result?.success) {
      throw new Error(result?.message || '加载失败')
    }

    items.value = result.data?.items || []
    summary.value = result.data?.summary || { total: items.value.length, used: 0, unused: 0 }
  } catch (error) {
    listError.value = error.message || '加载失败'
    showToast(listError.value, 'error', '兑换码')
  } finally {
    listLoading.value = false
  }
}

const filteredItems = computed(() => {
  const query = compact(searchQuery.value)
  const status = statusFilter.value

  return (items.value || []).filter((item) => {
    if (status === 'used' && !item.isUsed) return false
    if (status === 'unused' && item.isUsed) return false

    if (!query) return true
    if (compact(item.code).includes(query)) return true
    if (compact(item.createdBy).includes(query)) return true
    if (compact(item.usedByKeyId).includes(query)) return true
    if (compact(item.usedByKeyName).includes(query)) return true

    return false
  })
})

const totalPages = computed(() =>
  Math.max(1, Math.ceil(filteredItems.value.length / pageSize.value))
)

watch([searchQuery, statusFilter, pageSize], () => {
  page.value = 1
  selectedMap.value = {}
})

watch(totalPages, (value) => {
  if (page.value > value) {
    page.value = value
  }
})

const pagedItems = computed(() => {
  const start = (page.value - 1) * pageSize.value
  return filteredItems.value.slice(start, start + pageSize.value)
})

const pageStart = computed(() => {
  if (filteredItems.value.length === 0) return 0
  return (page.value - 1) * pageSize.value + 1
})

const pageEnd = computed(() => {
  const end = page.value * pageSize.value
  return Math.min(end, filteredItems.value.length)
})

const selectedCodes = computed(() =>
  Object.keys(selectedMap.value).filter((code) => selectedMap.value[code])
)

const allVisibleSelected = computed(() => {
  if (pagedItems.value.length === 0) return false
  return pagedItems.value.every((item) => Boolean(selectedMap.value[item.code]))
})

const toggleSelected = (code, checked) => {
  const next = { ...selectedMap.value }
  if (checked) {
    next[code] = true
  } else {
    delete next[code]
  }
  selectedMap.value = next
}

const toggleSelectAllVisible = (checked) => {
  const next = { ...selectedMap.value }
  pagedItems.value.forEach((item) => {
    if (checked) {
      next[item.code] = true
    } else {
      delete next[item.code]
    }
  })
  selectedMap.value = next
}

const exportCandidates = computed(() => {
  if (selectedCodes.value.length > 0) {
    return selectedCodes.value
  }
  return filteredItems.value.map((item) => item.code)
})

const downloadTxt = (text, filename) => {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

const getExportFilename = () => {
  const now = new Date()
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0')
  ].join('')
  return `redeem-codes-${stamp}.txt`
}

const exportCandidatesTxt = () => {
  const codes = exportCandidates.value
  if (!codes || codes.length === 0) {
    showToast('没有可导出的兑换码', 'warning', '兑换码')
    return
  }
  downloadTxt(codes.join('\n'), getExportFilename())
  showToast(`已导出 ${codes.length} 个兑换码`, 'success', '兑换码')
}

const exportRecentTxt = () => {
  if (!recentCodes.value.length) {
    showToast('没有可导出的兑换码', 'warning', '兑换码')
    return
  }
  downloadTxt(recentCodes.value.join('\n'), getExportFilename())
  showToast(`已导出 ${recentCodes.value.length} 个兑换码`, 'success', '兑换码')
}

const copyExportCandidates = async () => {
  const codes = exportCandidates.value
  if (!codes || codes.length === 0) {
    showToast('没有可复制的兑换码', 'warning', '兑换码')
    return
  }

  const ok = await copyTextToClipboard(codes.join('\n'))
  if (ok) {
    showToast(`已复制 ${codes.length} 个兑换码`, 'success', '兑换码')
  } else {
    showToast('复制失败，请手动复制', 'error', '兑换码')
  }
}

const deleteOne = async (code) => {
  if (!code) return
  const confirmed = window.confirm(`确认删除兑换码：${code} ？\n（仅支持删除未使用兑换码）`)
  if (!confirmed) return
  await deleteCodes([code])
}

const deleteSelected = async () => {
  if (selectedCodes.value.length === 0) return
  const confirmed = window.confirm(
    `确认删除选中的 ${selectedCodes.value.length} 个兑换码？\n（仅支持删除未使用兑换码）`
  )
  if (!confirmed) return
  await deleteCodes(selectedCodes.value)
}

const deleteCodes = async (codes) => {
  listLoading.value = true
  try {
    const result = await apiClient.delete('/admin/redeem-codes', { data: { codes } })
    if (!result?.success) {
      throw new Error(result?.message || '删除失败')
    }

    const { deleted = [], skippedUsed = [], notFound = [] } = result.data || {}
    const parts = []
    if (deleted.length > 0) parts.push(`已删除 ${deleted.length}`)
    if (skippedUsed.length > 0) parts.push(`已跳过(已使用) ${skippedUsed.length}`)
    if (notFound.length > 0) parts.push(`未找到 ${notFound.length}`)

    showToast(parts.join('，') || '删除完成', 'success', '兑换码')

    selectedMap.value = {}
    await loadRedeemCodes()
  } catch (error) {
    showToast(error.message || '删除失败', 'error', '兑换码')
  } finally {
    listLoading.value = false
  }
}

onMounted(() => {
  loadRedeemCodes()
})
</script>
