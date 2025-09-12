import { apiClient } from '@/config/api'
import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useApiKeysStore = defineStore('apiKeys', () => {
  // 状态
  const apiKeys = ref([])
  const loading = ref(false)
  const error = ref(null)
  const statsTimeRange = ref('all')
  const sortBy = ref('')
  const sortOrder = ref('asc')

  // Actions

  // 获取API Keys列表
  const fetchApiKeys = async () => {
    loading.value = true
    error.value = null
    try {
      const response = await apiClient.get('/admin/api-keys')
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

  // 创建API Key
  const createApiKey = async (data) => {
    loading.value = true
    error.value = null
    try {
      const response = await apiClient.post('/admin/api-keys', data)
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

  // 更新API Key
  const updateApiKey = async (id, data) => {
    loading.value = true
    error.value = null
    try {
      const response = await apiClient.put(`/admin/api-keys/${id}`, data)
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

  // 切换API Key状态
  const toggleApiKey = async (id) => {
    loading.value = true
    error.value = null
    try {
      const response = await apiClient.put(`/admin/api-keys/${id}/toggle`)
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

  // 续期API Key
  const renewApiKey = async (id, data) => {
    loading.value = true
    error.value = null
    try {
      const response = await apiClient.put(`/admin/api-keys/${id}`, data)
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

  // 删除API Key
  const deleteApiKey = async (id) => {
    loading.value = true
    error.value = null
    try {
      const response = await apiClient.delete(`/admin/api-keys/${id}`)
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

  // 获取API Key统计
  const fetchApiKeyStats = async (id, timeRange = 'all') => {
    try {
      const response = await apiClient.get(`/admin/api-keys/${id}/stats`, {
        params: { timeRange }
      })
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

  // 排序API Keys
  const sortApiKeys = (field) => {
    if (sortBy.value === field) {
      sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc'
    } else {
      sortBy.value = field
      sortOrder.value = 'asc'
    }
  }

  // 获取已存在的标签
  const fetchTags = async () => {
    try {
      const response = await apiClient.get('/admin/api-keys/tags')
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

  // 重置store
  const reset = () => {
    apiKeys.value = []
    loading.value = false
    error.value = null
    statsTimeRange.value = 'all'
    sortBy.value = ''
    sortOrder.value = 'asc'
  }

  return {
    // State
    apiKeys,
    loading,
    error,
    statsTimeRange,
    sortBy,
    sortOrder,

    // Actions
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
