<template>
  <div class="space-y-6 md:space-y-8">
    <!-- 创建 -->
    <div class="card-section">
      <header class="section-header">
        <i class="header-icon fas fa-gas-pump text-indigo-500" />
        <h3 class="header-title">加油包兑换码</h3>
        <span class="header-tag">创建</span>
      </header>

      <div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div class="info-item">
          <p class="info-label">额度（USD）</p>
          <input
            v-model="createForm.amount"
            class="input"
            min="0"
            placeholder="例如：10"
            step="0.01"
            type="number"
          />
        </div>
        <div class="info-item">
          <p class="info-label">有效期</p>
          <div class="flex gap-2">
            <input
              v-model="createForm.validityValue"
              class="input flex-1"
              min="1"
              placeholder="1"
              step="1"
              type="number"
            />
            <select v-model="createForm.validityUnit" class="input w-28">
              <option value="days">天</option>
              <option value="hours">小时</option>
            </select>
          </div>
        </div>
        <div class="info-item">
          <p class="info-label">数量</p>
          <input
            v-model="createForm.count"
            class="input"
            min="1"
            placeholder="例如：10"
            step="1"
            type="number"
          />
        </div>
        <div class="info-item">
          <p class="info-label">前缀</p>
          <input v-model="createForm.prefix" class="input" placeholder="FP" type="text" />
        </div>
      </div>

      <div class="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div class="info-item">
          <p class="info-label">备注</p>
          <input v-model="createForm.note" class="input" placeholder="可选" type="text" />
        </div>
        <div class="flex items-end justify-end gap-2">
          <button class="btn btn-primary px-5 py-2.5" :disabled="creating" @click="handleCreate">
            <i v-if="creating" class="fas fa-spinner loading-spinner mr-2" />
            <i v-else class="fas fa-plus mr-2" />
            {{ creating ? '创建中...' : '创建兑换码' }}
          </button>
        </div>
      </div>

      <div v-if="createdCodes.length > 0" class="mt-6 rounded-xl bg-white/10 p-4 dark:bg-black/20">
        <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div class="flex items-center gap-2">
            <i class="fas fa-ticket-alt text-green-500" />
            <span class="text-sm font-semibold text-gray-800 dark:text-gray-200"
              >最新生成（{{ createdCodes.length }}）</span
            >
          </div>
          <div class="flex flex-wrap gap-2">
            <button class="btn btn-success px-4 py-2 text-sm" @click="copyCreatedCodes">
              <i class="fas fa-copy mr-2" />复制全部
            </button>
            <button class="btn btn-secondary px-4 py-2 text-sm" @click="downloadText(createdText)">
              <i class="fas fa-file-export mr-2" />导出 TXT
            </button>
          </div>
        </div>
        <div class="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
          <div
            v-for="item in createdCodes"
            :key="item.id"
            class="flex items-center justify-between rounded-lg bg-white/20 px-3 py-2 text-sm dark:bg-black/30"
          >
            <code class="truncate text-gray-900 dark:text-gray-100">{{ item.code }}</code>
            <button class="btn btn-ghost px-3 py-1 text-xs" @click="copyText(item.code)">
              复制
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 列表 -->
    <div class="card-section">
      <header class="section-header">
        <i class="header-icon fas fa-list text-blue-500" />
        <h3 class="header-title">兑换码列表</h3>
        <span class="header-tag">管理</span>
      </header>

      <div class="mb-4 grid grid-cols-1 gap-3 md:grid-cols-4">
        <div class="info-item">
          <p class="info-label">状态</p>
          <select v-model="filters.status" class="input" @change="reloadList(1)">
            <option value="unused">未使用</option>
            <option value="used">已使用</option>
            <option value="deleted">已删除</option>
            <option value="all">全部</option>
          </select>
        </div>
        <div class="info-item">
          <p class="info-label">启用</p>
          <select v-model="filters.isActive" class="input" @change="reloadList(1)">
            <option value="">全部</option>
            <option value="true">启用</option>
            <option value="false">停用</option>
          </select>
        </div>
        <div class="info-item md:col-span-2">
          <p class="info-label">搜索（兑换码）</p>
          <div class="flex gap-2">
            <input v-model="filters.q" class="input flex-1" placeholder="输入兑换码" type="text" />
            <button
              class="btn btn-secondary px-4 py-2.5"
              :disabled="loading"
              @click="reloadList(1)"
            >
              <i class="fas fa-search" />
            </button>
          </div>
        </div>
      </div>

      <div class="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div class="text-sm text-gray-600 dark:text-gray-400">
          共 {{ total }} 条，当前页选中 {{ selectedIds.length }} 条
        </div>
        <div class="flex flex-wrap gap-2">
          <button
            class="btn btn-success px-4 py-2 text-sm"
            :disabled="selectedIds.length === 0"
            @click="batchAction('enable')"
          >
            启用
          </button>
          <button
            class="btn btn-warning px-4 py-2 text-sm"
            :disabled="selectedIds.length === 0"
            @click="batchAction('disable')"
          >
            停用
          </button>
          <button
            class="btn btn-danger px-4 py-2 text-sm"
            :disabled="selectedIds.length === 0"
            @click="batchAction('delete')"
          >
            删除
          </button>
          <button
            class="btn btn-secondary px-4 py-2 text-sm"
            :disabled="selectedIds.length === 0"
            @click="exportSelected"
          >
            导出 TXT
          </button>
        </div>
      </div>

      <div class="overflow-x-auto rounded-xl border border-white/10 bg-white/10 dark:bg-black/20">
        <table class="min-w-full text-left text-sm">
          <thead class="bg-white/20 text-xs text-gray-700 dark:bg-black/30 dark:text-gray-300">
            <tr>
              <th class="px-3 py-3">
                <input
                  :checked="isAllSelected"
                  type="checkbox"
                  @change="toggleSelectAll($event.target.checked)"
                />
              </th>
              <th class="px-3 py-3">兑换码</th>
              <th class="px-3 py-3">额度</th>
              <th class="px-3 py-3">有效期</th>
              <th class="px-3 py-3">状态</th>
              <th class="px-3 py-3">创建时间</th>
              <th class="px-3 py-3">使用信息</th>
              <th class="px-3 py-3">操作</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-white/10">
            <tr v-if="loading">
              <td class="px-3 py-6 text-center text-gray-600 dark:text-gray-300" colspan="8">
                <i class="fas fa-spinner loading-spinner mr-2" />加载中...
              </td>
            </tr>
            <tr v-else-if="items.length === 0">
              <td class="px-3 py-6 text-center text-gray-600 dark:text-gray-300" colspan="8">
                暂无数据
              </td>
            </tr>
            <tr
              v-for="item in items"
              :key="item.id"
              class="hover:bg-white/10 dark:hover:bg-black/20"
            >
              <td class="px-3 py-3">
                <input
                  :checked="selectedIds.includes(item.id)"
                  type="checkbox"
                  @change="toggleSelect(item.id, $event.target.checked)"
                />
              </td>
              <td class="px-3 py-3">
                <div class="flex items-center gap-2">
                  <code class="max-w-[240px] truncate text-gray-900 dark:text-gray-100">
                    {{ item.code }}
                  </code>
                  <button class="btn btn-ghost px-2 py-1 text-xs" @click="copyText(item.code)">
                    复制
                  </button>
                </div>
              </td>
              <td class="px-3 py-3">${{ item.amount.toFixed(2) }}</td>
              <td class="px-3 py-3">{{ formatValidity(item.validitySeconds) }}</td>
              <td class="px-3 py-3">
                <span
                  class="rounded-full px-2 py-1 text-xs font-semibold"
                  :class="statusClass(item)"
                >
                  {{ statusLabel(item) }}
                </span>
              </td>
              <td class="px-3 py-3">{{ formatTime(item.createdAtMs) }}</td>
              <td class="px-3 py-3">
                <div
                  v-if="item.status === 'used'"
                  class="space-y-1 text-xs text-gray-700 dark:text-gray-300"
                >
                  <div>KeyId: {{ item.usedByApiKeyId }}</div>
                  <div class="truncate">名称: {{ item.usedByApiKeyName }}</div>
                  <div>使用时间: {{ formatTime(item.usedAtMs) }}</div>
                </div>
                <div v-else class="text-xs text-gray-500 dark:text-gray-400">-</div>
              </td>
              <td class="px-3 py-3">
                <div class="flex flex-wrap gap-2">
                  <button
                    class="btn btn-secondary px-3 py-1.5 text-xs"
                    :disabled="item.status !== 'unused'"
                    @click="openEdit(item)"
                  >
                    编辑
                  </button>
                  <button class="btn btn-danger px-3 py-1.5 text-xs" @click="deleteOne(item)">
                    删除
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="mt-4 flex items-center justify-between">
        <button
          class="btn btn-secondary px-4 py-2 text-sm"
          :disabled="page <= 1"
          @click="reloadList(page - 1)"
        >
          上一页
        </button>
        <div class="text-sm text-gray-600 dark:text-gray-400">
          第 {{ page }} 页 / 共 {{ totalPages }} 页
        </div>
        <button
          class="btn btn-secondary px-4 py-2 text-sm"
          :disabled="page >= totalPages"
          @click="reloadList(page + 1)"
        >
          下一页
        </button>
      </div>
    </div>

    <!-- 编辑弹窗 -->
    <Teleport to="body">
      <div
        v-if="editModal.show"
        class="modal fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        <div
          class="modal-content w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl dark:bg-gray-800"
        >
          <div class="mb-4 flex items-center justify-between">
            <h3 class="text-lg font-bold text-gray-900 dark:text-gray-100">编辑兑换码</h3>
            <button class="btn btn-ghost px-3 py-1" @click="closeEdit">关闭</button>
          </div>

          <div class="space-y-4">
            <div class="rounded-xl bg-gray-50 p-3 text-sm dark:bg-gray-900/40">
              <div class="text-xs text-gray-500 dark:text-gray-400">兑换码</div>
              <code class="break-all text-gray-900 dark:text-gray-100">{{
                editModal.item?.code
              }}</code>
            </div>

            <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div class="info-item">
                <p class="info-label">额度（USD）</p>
                <input
                  v-model="editModal.form.amount"
                  class="input"
                  min="0"
                  step="0.01"
                  type="number"
                />
              </div>
              <div class="info-item">
                <p class="info-label">有效期</p>
                <div class="flex gap-2">
                  <input
                    v-model="editModal.form.validityValue"
                    class="input flex-1"
                    min="1"
                    step="1"
                    type="number"
                  />
                  <select v-model="editModal.form.validityUnit" class="input w-28">
                    <option value="days">天</option>
                    <option value="hours">小时</option>
                  </select>
                </div>
              </div>
            </div>

            <div class="info-item">
              <p class="info-label">备注</p>
              <input v-model="editModal.form.note" class="input" type="text" />
            </div>

            <div class="info-item">
              <p class="info-label">启用</p>
              <select v-model="editModal.form.isActive" class="input">
                <option :value="true">启用</option>
                <option :value="false">停用</option>
              </select>
            </div>
          </div>

          <div class="mt-6 flex justify-end gap-2">
            <button class="btn btn-secondary px-5 py-2.5" @click="closeEdit">取消</button>
            <button class="btn btn-primary px-5 py-2.5" :disabled="saving" @click="saveEdit">
              <i v-if="saving" class="fas fa-spinner loading-spinner mr-2" />
              保存
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { apiClient, createApiUrl } from '@/config/api'
import { copyTextToClipboard } from '@/utils/clipboard'
import { showToast } from '@/utils/toast'

const loading = ref(false)
const creating = ref(false)
const saving = ref(false)

const page = ref(1)
const pageSize = ref(50)
const total = ref(0)
const items = ref([])

const selectedIds = ref([])

const createdCodes = ref([])

const createForm = reactive({
  amount: '',
  validityValue: 1,
  validityUnit: 'days',
  count: 10,
  prefix: 'FP',
  note: ''
})

const filters = reactive({
  status: 'unused',
  isActive: '',
  q: ''
})

const totalPages = computed(() => {
  const size = pageSize.value || 1
  return Math.max(1, Math.ceil((total.value || 0) / size))
})

const isAllSelected = computed(() => {
  if (!items.value.length) return false
  return items.value.every((item) => selectedIds.value.includes(item.id))
})

const createdText = computed(() => createdCodes.value.map((v) => v.code).join('\n'))

const formatTime = (ms) => {
  const num = Number(ms)
  if (!Number.isFinite(num) || num <= 0) return '-'
  return new Date(num).toLocaleString()
}

const formatValidity = (seconds) => {
  const value = Number(seconds) || 0
  if (value % 86400 === 0) return `${value / 86400} 天`
  if (value % 3600 === 0) return `${value / 3600} 小时`
  return `${value} 秒`
}

const statusLabel = (item) => {
  if (item.isDeleted || item.status === 'deleted') return '已删除'
  if (item.status === 'used') return '已使用'
  if (!item.isActive) return '未使用(停用)'
  return '未使用'
}

const statusClass = (item) => {
  if (item.isDeleted || item.status === 'deleted')
    return 'bg-red-500/20 text-red-700 dark:text-red-200'
  if (item.status === 'used') return 'bg-gray-500/20 text-gray-700 dark:text-gray-200'
  if (!item.isActive) return 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-200'
  return 'bg-green-500/20 text-green-700 dark:text-green-200'
}

const reloadList = async (nextPage = 1) => {
  loading.value = true
  try {
    page.value = nextPage
    selectedIds.value = []

    const result = await apiClient.get('/fuel-packs/codes', {
      params: {
        status: filters.status,
        isActive: filters.isActive,
        q: filters.q,
        page: page.value,
        pageSize: pageSize.value
      }
    })

    total.value = result?.data?.total || 0
    items.value = result?.data?.items || []
  } catch (error) {
    showToast(error.message || '加载失败', 'error')
  } finally {
    loading.value = false
  }
}

const toValiditySeconds = (value, unit) => {
  const num = Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(num) || num <= 0) return 0
  return unit === 'hours' ? num * 3600 : num * 86400
}

const handleCreate = async () => {
  const amount = Number(createForm.amount)
  const validitySeconds = toValiditySeconds(createForm.validityValue, createForm.validityUnit)
  const count = Number.parseInt(String(createForm.count ?? ''), 10)

  if (!Number.isFinite(amount) || amount <= 0) {
    showToast('额度必须大于 0', 'error')
    return
  }
  if (!validitySeconds) {
    showToast('有效期必须大于 0', 'error')
    return
  }
  if (!Number.isFinite(count) || count <= 0) {
    showToast('数量必须大于 0', 'error')
    return
  }

  creating.value = true
  try {
    const result = await apiClient.post('/fuel-packs/codes', {
      amount,
      validitySeconds,
      count,
      prefix: createForm.prefix,
      note: createForm.note
    })
    createdCodes.value = result?.data || []
    showToast(`创建成功：${createdCodes.value.length} 个`, 'success')
    await reloadList(1)
  } catch (error) {
    showToast(error.message || '创建失败', 'error')
  } finally {
    creating.value = false
  }
}

const toggleSelect = (id, checked) => {
  if (checked) {
    if (!selectedIds.value.includes(id)) selectedIds.value.push(id)
  } else {
    selectedIds.value = selectedIds.value.filter((v) => v !== id)
  }
}

const toggleSelectAll = (checked) => {
  if (checked) {
    selectedIds.value = items.value.map((v) => v.id)
  } else {
    selectedIds.value = []
  }
}

const batchAction = async (action) => {
  if (!selectedIds.value.length) return

  const confirmed = window.confirm(
    `确认对选中的 ${selectedIds.value.length} 条执行“${action}”操作吗？`
  )
  if (!confirmed) return

  try {
    await apiClient.post('/fuel-packs/codes/batch', {
      ids: selectedIds.value,
      action
    })
    showToast('操作成功', 'success')
    await reloadList(page.value)
  } catch (error) {
    showToast(error.message || '操作失败', 'error')
  }
}

const exportSelected = async () => {
  if (!selectedIds.value.length) return

  try {
    const token = localStorage.getItem('authToken') || ''
    const response = await fetch(createApiUrl('/fuel-packs/codes/export'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({ ids: selectedIds.value })
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(errorText || `HTTP ${response.status}`)
    }

    const text = await response.text()
    downloadText(text)
    showToast('已导出 TXT', 'success')
  } catch (error) {
    showToast(error.message || '导出失败', 'error')
  }
}

const downloadText = (text) => {
  const blob = new Blob([text || ''], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'fuel-pack-codes.txt'
  a.click()
  URL.revokeObjectURL(url)
}

const copyText = async (text) => {
  const ok = await copyTextToClipboard(text)
  showToast(ok ? '已复制' : '复制失败，请手动复制', ok ? 'success' : 'error')
}

const copyCreatedCodes = async () => {
  if (!createdText.value) return
  await copyText(createdText.value)
}

const deleteOne = async (item) => {
  const confirmed = window.confirm('确认删除该兑换码吗？（软删除，可用于审计）')
  if (!confirmed) return

  try {
    await apiClient.delete(`/fuel-packs/codes/${item.id}`)
    showToast('已删除', 'success')
    await reloadList(page.value)
  } catch (error) {
    showToast(error.message || '删除失败', 'error')
  }
}

const editModal = reactive({
  show: false,
  item: null,
  form: {
    amount: '',
    validityValue: 1,
    validityUnit: 'days',
    note: '',
    isActive: true
  }
})

const openEdit = (item) => {
  editModal.item = item
  editModal.form.amount = String(item.amount || '')
  const seconds = Number(item.validitySeconds) || 86400
  if (seconds % 86400 === 0) {
    editModal.form.validityValue = seconds / 86400
    editModal.form.validityUnit = 'days'
  } else if (seconds % 3600 === 0) {
    editModal.form.validityValue = seconds / 3600
    editModal.form.validityUnit = 'hours'
  } else {
    editModal.form.validityValue = 1
    editModal.form.validityUnit = 'days'
  }
  editModal.form.note = item.note || ''
  editModal.form.isActive = Boolean(item.isActive)
  editModal.show = true
}

const closeEdit = () => {
  editModal.show = false
  editModal.item = null
}

const saveEdit = async () => {
  if (!editModal.item) return
  const amount = Number(editModal.form.amount)
  const validitySeconds = toValiditySeconds(
    editModal.form.validityValue,
    editModal.form.validityUnit
  )

  if (!Number.isFinite(amount) || amount <= 0) {
    showToast('额度必须大于 0', 'error')
    return
  }
  if (!validitySeconds) {
    showToast('有效期必须大于 0', 'error')
    return
  }

  saving.value = true
  try {
    await apiClient.patch(`/fuel-packs/codes/${editModal.item.id}`, {
      amount,
      validitySeconds,
      note: editModal.form.note,
      isActive: editModal.form.isActive
    })
    showToast('保存成功', 'success')
    closeEdit()
    await reloadList(page.value)
  } catch (error) {
    showToast(error.message || '保存失败', 'error')
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  await reloadList(1)
})
</script>

<style scoped>
.input {
  @apply w-full rounded-xl border border-gray-200 bg-white/80 px-4 py-3 text-sm text-gray-800 shadow-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200 dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-100 dark:focus:border-indigo-500 dark:focus:ring-indigo-500/20;
}
</style>
