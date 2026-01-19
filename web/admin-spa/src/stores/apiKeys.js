import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  getApiKeys,
  createApiKey as apiCreateApiKey,
  updateApiKey as apiUpdateApiKey,
  toggleApiKey as apiToggleApiKey,
  deleteApiKey as apiDeleteApiKey,
  getApiKeyStats,
  getApiKeyTags
} from '@/utils/http_apis'

export const useApiKeysStore = defineStore('apiKeys', () => {
  const apiKeys = ref([])
  const loading = ref(false)
  const error = ref(null)
  const statsTimeRange = ref('all')
  const sortBy = ref('')
  const sortOrder = ref('asc')

  const fetchApiKeys = async () => {
    loading.value = true
    error.value = null
    try {
      const response = await getApiKeys()
      if (response.success) {
        apiKeys.value = response.data || []
      } else {
        throw new Error(response.message || '获取API Keys失败')
      }
    } catch (err) {
      error.value = err.message
      throw err
    } finally {
      loading.value = false
    }
  }

  const createApiKey = async (data) => {
    loading.value = true
    error.value = null
    try {
      const response = await apiCreateApiKey(data)
      if (response.success) {
        await fetchApiKeys()
        return response.data
      } else {
        throw new Error(response.message || '创建API Key失败')
      }
    } catch (err) {
      error.value = err.message
      throw err
    } finally {
      loading.value = false
    }
  }

  const updateApiKey = async (id, data) => {
    loading.value = true
    error.value = null
    try {
      const response = await apiUpdateApiKey(id, data)
      if (response.success) {
        await fetchApiKeys()
        return response
      } else {
        throw new Error(response.message || '更新API Key失败')
      }
    } catch (err) {
      error.value = err.message
      throw err
    } finally {
      loading.value = false
    }
  }

  const toggleApiKey = async (id) => {
    loading.value = true
    error.value = null
    try {
      const response = await apiToggleApiKey(id)
      if (response.success) {
        await fetchApiKeys()
        return response
      } else {
        throw new Error(response.message || '切换状态失败')
      }
    } catch (err) {
      error.value = err.message
      throw err
    } finally {
      loading.value = false
    }
  }

  const renewApiKey = async (id, data) => {
    loading.value = true
    error.value = null
    try {
      const response = await apiUpdateApiKey(id, data)
      if (response.success) {
        await fetchApiKeys()
        return response
      } else {
        throw new Error(response.message || '续期失败')
      }
    } catch (err) {
      error.value = err.message
      throw err
    } finally {
      loading.value = false
    }
  }

  const deleteApiKey = async (id) => {
    loading.value = true
    error.value = null
    try {
      const response = await apiDeleteApiKey(id)
      if (response.success) {
        await fetchApiKeys()
        return response
      } else {
        throw new Error(response.message || '删除失败')
      }
    } catch (err) {
      error.value = err.message
      throw err
    } finally {
      loading.value = false
    }
  }

  const fetchApiKeyStats = async (id, timeRange = 'all') => {
    try {
      const response = await getApiKeyStats(id, { timeRange })
      if (response.success) {
        return response.stats
      } else {
        throw new Error(response.message || '获取统计失败')
      }
    } catch (err) {
      console.error('获取API Key统计失败:', err)
      return null
    }
  }

  const sortApiKeys = (field) => {
    if (sortBy.value === field) {
      sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc'
    } else {
      sortBy.value = field
      sortOrder.value = 'asc'
    }
  }

  const fetchTags = async () => {
    try {
      const response = await getApiKeyTags()
      if (response.success) {
        return response.data || []
      } else {
        throw new Error(response.message || '获取标签失败')
      }
    } catch (err) {
      console.error('获取标签失败:', err)
      return []
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
