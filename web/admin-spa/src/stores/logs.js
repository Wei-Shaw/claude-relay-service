import { defineStore } from 'pinia'
import { ref } from 'vue'
import { apiClient } from '@/config/api'
import { showToast } from '@/utils/toast'

export const useLogsStore = defineStore('logs', () => {
  const loading = ref(false)
  const logs = ref([])
  const groups = ref([])
  const groupBy = ref('key') // key | model | account | none

  const filters = ref({
    keyId: '',
    model: '',
    accountId: '',
    accountType: ''
  })

  const pagination = ref({
    page: 1,
    pageSize: 100,
    total: 0
  })

  async function loadLogs() {
    loading.value = true
    try {
      const params = {
        page: pagination.value.page,
        pageSize: pagination.value.pageSize,
        groupBy: groupBy.value !== 'none' ? groupBy.value : undefined,
        keyId: filters.value.keyId || undefined,
        model: filters.value.model || undefined,
        accountId: filters.value.accountId || undefined,
        accountType: filters.value.accountType || undefined
      }

      const resp = await apiClient.get('/admin/request-logs', { params })
      if (resp.success) {
        logs.value = resp.data || []
        pagination.value = {
          page: resp.pagination?.page || params.page || 1,
          pageSize: resp.pagination?.pageSize || params.pageSize || 100,
          total: resp.pagination?.total || (resp.data ? resp.data.length : 0)
        }
        groups.value = resp.groups || []
      } else {
        logs.value = []
        showToast('加载日志失败', 'error')
      }
    } catch (error) {
      console.error('加载日志失败:', error)
      showToast('加载日志失败', 'error')
    } finally {
      loading.value = false
    }
  }

  function setPage(page) {
    pagination.value.page = page
    return loadLogs()
  }

  function setPageSize(size) {
    pagination.value.pageSize = size
    pagination.value.page = 1
    return loadLogs()
  }

  function setGroupBy(value) {
    groupBy.value = value
    return loadLogs()
  }

  function setFilters(newFilters) {
    filters.value = { ...filters.value, ...newFilters }
    pagination.value.page = 1
    return loadLogs()
  }

  return {
    loading,
    logs,
    groups,
    groupBy,
    filters,
    pagination,
    loadLogs,
    setPage,
    setPageSize,
    setGroupBy,
    setFilters
  }
})
