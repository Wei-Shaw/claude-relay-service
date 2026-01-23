import { defineStore } from 'pinia'
import { ref } from 'vue'

import * as httpApis from '@/utils/http_apis'

export const useApiKeysStore = defineStore('apiKeys', () => {
  const apiKeys = ref([])
  const loading = ref(false)
  const error = ref(null)
  const statsTimeRange = ref('all')
  const sortBy = ref('')
  const sortOrder = ref('asc')

  const fetchApiKeys = async () => {
    loading.value = true
    const res = await httpApis.getApiKeysApi()
    if (res.success) apiKeys.value = res.data || []
    else error.value = res.message
    loading.value = false
  }

  const createApiKey = async (data) => {
    loading.value = true
    const res = await httpApis.createApiKeyApi(data)
    if (res.success) await fetchApiKeys()
    else error.value = res.message
    loading.value = false
    return res
  }

  const updateApiKey = async (id, data) => {
    loading.value = true
    const res = await httpApis.updateApiKeyApi(id, data)
    if (res.success) await fetchApiKeys()
    else error.value = res.message
    loading.value = false
    return res
  }

  const toggleApiKey = async (id) => {
    loading.value = true
    const res = await httpApis.toggleApiKeyApi(id)
    if (res.success) await fetchApiKeys()
    else error.value = res.message
    loading.value = false
    return res
  }

  const renewApiKey = (id, data) => updateApiKey(id, data)

  const deleteApiKey = async (id) => {
    loading.value = true
    const res = await httpApis.deleteApiKeyApi(id)
    if (res.success) await fetchApiKeys()
    else error.value = res.message
    loading.value = false
    return res
  }

  const fetchApiKeyStats = async (id, timeRange = 'all') => {
    const res = await httpApis.getApiKeyStatsApi(id, { timeRange })
    return res.success ? res.stats : null
  }

  const fetchTags = async () => {
    const res = await httpApis.getApiKeyTagsApi()
    return res.success ? res.data || [] : []
  }

  const sortApiKeys = (field) => {
    if (sortBy.value === field) {
      sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc'
    } else {
      sortBy.value = field
      sortOrder.value = 'asc'
    }
  }

  const reset = () => {
    apiKeys.value = []
    loading.value = false
    error.value = null
    statsTimeRange.value = 'all'
    sortBy.value = ''
    sortOrder.value = 'asc'
  }

  return {
    apiKeys,
    loading,
    error,
    statsTimeRange,
    sortBy,
    sortOrder,
    fetchApiKeys,
    createApiKey,
    updateApiKey,
    toggleApiKey,
    renewApiKey,
    deleteApiKey,
    fetchApiKeyStats,
    fetchTags,
    sortApiKeys,
    reset
  }
})
