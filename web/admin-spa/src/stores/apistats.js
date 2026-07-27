import { defineStore } from 'pinia'
import { ref } from 'vue'

import * as httpApis from '@/utils/http_apis'

export const useApiStatsStore = defineStore('apistats', () => {
  // 状态
  const apiKey = ref('')
  const apiId = ref(null)
  const loading = ref(false)
  const oemLoading = ref(true)
  const error = ref('')
  const statsData = ref(null)
  const oemSettings = ref({
    siteName: '',
    siteIcon: '',
    siteIconData: ''
  })

  // Actions

  // 查询统计数据
  async function queryStats() {
    const trimmedKey = apiKey.value.trim()

    if (!trimmedKey) {
      error.value = '请输入 API Key'
      return
    }

    // 验证 API Key 格式：长度应在 10-512 之间
    if (trimmedKey.length < 10 || trimmedKey.length > 512) {
      error.value = 'API Key 格式无效：长度应在 10-512 个字符之间'
      return
    }

    loading.value = true
    error.value = ''
    statsData.value = null
    apiId.value = null

    try {
      // 获取 API Key ID
      const idResult = await httpApis.getKeyIdApi(trimmedKey)

      if (idResult.success) {
        apiId.value = idResult.data.id

        // 使用 apiId 查询统计数据
        const statsResult = await httpApis.getUserStatsApi(apiId.value)

        if (statsResult.success) {
          statsData.value = statsResult.data

          // 清除错误信息
          error.value = ''

          // 更新 URL
          updateURL()

          // 保存 API Key 到 localStorage
          saveApiKeyToStorage()
        } else {
          throw new Error(statsResult.message || '查询失败')
        }
      } else {
        throw new Error(idResult.message || '获取 API Key ID 失败')
      }
    } catch (err) {
      console.error('Query stats error:', err)
      error.value = err.message || '查询统计数据失败，请检查您的 API Key 是否正确'
      statsData.value = null
      apiId.value = null
    } finally {
      loading.value = false
    }
  }

  // 使用 apiId 直接加载数据
  async function loadStatsWithApiId() {
    if (!apiId.value) return

    loading.value = true
    error.value = ''
    statsData.value = null

    try {
      const result = await httpApis.getUserStatsApi(apiId.value)

      if (result.success) {
        statsData.value = result.data

        // 清除错误信息
        error.value = ''
      } else {
        throw new Error(result.message || '查询失败')
      }
    } catch (err) {
      console.error('Load stats with apiId error:', err)
      error.value = err.message || '查询统计数据失败'
      statsData.value = null
    } finally {
      loading.value = false
    }
  }

  // 加载 OEM 设置
  async function loadOemSettings() {
    oemLoading.value = true
    try {
      const result = await httpApis.getOemSettingsApi()
      if (result && result.success && result.data) {
        oemSettings.value = { ...oemSettings.value, ...result.data }
      }
    } catch (err) {
      console.error('Error loading OEM settings:', err)
      // 失败时使用默认值
      oemSettings.value = {
        siteName: 'Claude Relay Service',
        siteIcon: '',
        siteIconData: ''
      }
    } finally {
      oemLoading.value = false
    }
  }

  // 更新 URL
  function updateURL() {
    if (apiId.value) {
      const url = new URL(window.location)
      url.searchParams.set('apiId', apiId.value)
      window.history.pushState({}, '', url)
    }
  }

  // 保存 API Key 到 localStorage
  function saveApiKeyToStorage() {
    if (apiKey.value) {
      localStorage.setItem('lastApiKey', apiKey.value)
    }
  }

  // 从 localStorage 加载 API Key
  function loadApiKeyFromStorage() {
    return localStorage.getItem('lastApiKey')
  }

  // 清除数据
  function clearData() {
    statsData.value = null
    error.value = ''
    apiId.value = null
  }

  // 重置
  function reset() {
    apiKey.value = ''
    clearData()
  }

  return {
    // State
    apiKey,
    apiId,
    loading,
    oemLoading,
    error,
    statsData,
    oemSettings,

    // Actions
    queryStats,
    loadStatsWithApiId,
    loadOemSettings,
    loadApiKeyFromStorage,
    clearData,
    reset
  }
})
