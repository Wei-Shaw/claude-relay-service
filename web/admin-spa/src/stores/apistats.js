import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { apiStatsClient } from '@/config/apiStats'

export const useApiStatsStore = defineStore('apistats', () => {
  // 状态
  const apiKey = ref('')
  const apiId = ref(null)
  const loading = ref(false)
  const modelStatsLoading = ref(false)
  const oemLoading = ref(true)
  const error = ref('')
  const statsPeriod = ref('daily')
  const statsData = ref(null)
  const modelStats = ref([])
  const dailyStats = ref(null)
  const monthlyStats = ref(null)
  const oemSettings = ref({
    siteName: '',
    siteIcon: '',
    siteIconData: ''
  })

  // 多 Key 模式相关状态
  const multiKeyMode = ref(false)
  const apiKeys = ref([]) // 多个 API Key 数组
  const apiIds = ref([]) // 对应的 ID 数组
  const aggregatedStats = ref(null) // 聚合后的统计数据
  const individualStats = ref([]) // 各个 Key 的独立数据
  const invalidKeys = ref([]) // 无效的 Keys 列表

  // 计算属性
  const currentPeriodData = computed(() => {
    const defaultData = {
      requests: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheCreateTokens: 0,
      cacheReadTokens: 0,
      allTokens: 0,
      cost: 0,
      formattedCost: '$0.000000'
    }

    // 聚合模式下使用聚合数据
    if (multiKeyMode.value && aggregatedStats.value) {
      if (statsPeriod.value === 'daily') {
        return aggregatedStats.value.dailyUsage || defaultData
      } else {
        return aggregatedStats.value.monthlyUsage || defaultData
      }
    }

    // 单个 Key 模式下使用原有逻辑
    if (statsPeriod.value === 'daily') {
      return dailyStats.value || defaultData
    } else {
      return monthlyStats.value || defaultData
    }
  })

  const usagePercentages = computed(() => {
    if (!statsData.value || !currentPeriodData.value) {
      return {
        tokenUsage: 0,
        costUsage: 0,
        requestUsage: 0
      }
    }

    const current = currentPeriodData.value
    const limits = statsData.value.limits

    return {
      tokenUsage:
        limits.tokenLimit > 0 ? Math.min((current.allTokens / limits.tokenLimit) * 100, 100) : 0,
      costUsage:
        limits.dailyCostLimit > 0 ? Math.min((current.cost / limits.dailyCostLimit) * 100, 100) : 0,
      requestUsage:
        limits.rateLimitRequests > 0
          ? Math.min((current.requests / limits.rateLimitRequests) * 100, 100)
          : 0
    }
  })

  // Actions

  // 查询统计数据
  async function queryStats() {
    // 多 Key 模式处理
    if (multiKeyMode.value) {
      return queryBatchStats()
    }

    if (!apiKey.value.trim()) {
      error.value = '请输入 API Key'
      return
    }

    loading.value = true
    error.value = ''
    statsData.value = null
    modelStats.value = []
    apiId.value = null

    try {
      // 获取 API Key ID
      const idResult = await apiStatsClient.getKeyId(apiKey.value)

      if (idResult.success) {
        apiId.value = idResult.data.id

        // 使用 apiId 查询统计数据
        const statsResult = await apiStatsClient.getUserStats(apiId.value)

        if (statsResult.success) {
          statsData.value = statsResult.data

          // 同时加载今日和本月的统计数据
          await loadAllPeriodStats()

          // 清除错误信息
          error.value = ''

          // 更新 URL
          updateURL()
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
      modelStats.value = []
      apiId.value = null
    } finally {
      loading.value = false
    }
  }

  // 加载所有时间段的统计数据
  async function loadAllPeriodStats() {
    if (!apiId.value) return

    // 并行加载今日和本月的数据
    await Promise.all([loadPeriodStats('daily'), loadPeriodStats('monthly')])

    // 加载当前选择时间段的模型统计
    await loadModelStats(statsPeriod.value)
  }

  // 加载指定时间段的统计数据
  async function loadPeriodStats(period) {
    try {
      const result = await apiStatsClient.getUserModelStats(apiId.value, period)

      if (result.success) {
        // 计算汇总数据
        const modelData = result.data || []
        const summary = {
          requests: 0,
          inputTokens: 0,
          outputTokens: 0,
          cacheCreateTokens: 0,
          cacheReadTokens: 0,
          allTokens: 0,
          cost: 0,
          formattedCost: '$0.000000'
        }

        modelData.forEach((model) => {
          summary.requests += model.requests || 0
          summary.inputTokens += model.inputTokens || 0
          summary.outputTokens += model.outputTokens || 0
          summary.cacheCreateTokens += model.cacheCreateTokens || 0
          summary.cacheReadTokens += model.cacheReadTokens || 0
          summary.allTokens += model.allTokens || 0
          summary.cost += model.costs?.total || 0
        })

        summary.formattedCost = formatCost(summary.cost)

        // 存储到对应的时间段数据
        if (period === 'daily') {
          dailyStats.value = summary
        } else {
          monthlyStats.value = summary
        }
      } else {
        console.warn(`Failed to load ${period} stats:`, result.message)
      }
    } catch (err) {
      console.error(`Load ${period} stats error:`, err)
    }
  }

  // 加载模型统计数据
  async function loadModelStats(period = 'daily') {
    if (!apiId.value) return

    modelStatsLoading.value = true

    try {
      const result = await apiStatsClient.getUserModelStats(apiId.value, period)

      if (result.success) {
        modelStats.value = result.data || []
      } else {
        throw new Error(result.message || '加载模型统计失败')
      }
    } catch (err) {
      console.error('Load model stats error:', err)
      modelStats.value = []
    } finally {
      modelStatsLoading.value = false
    }
  }

  // 切换时间范围
  async function switchPeriod(period) {
    if (statsPeriod.value === period || modelStatsLoading.value) {
      return
    }

    statsPeriod.value = period

    // 多 Key 模式下加载批量模型统计
    if (multiKeyMode.value && apiIds.value.length > 0) {
      await loadBatchModelStats(period)
      return
    }

    // 如果对应时间段的数据还没有加载，则加载它
    if (
      (period === 'daily' && !dailyStats.value) ||
      (period === 'monthly' && !monthlyStats.value)
    ) {
      await loadPeriodStats(period)
    }

    // 加载对应的模型统计
    await loadModelStats(period)
  }

  // 使用 apiId 直接加载数据
  async function loadStatsWithApiId() {
    if (!apiId.value) return

    loading.value = true
    error.value = ''
    statsData.value = null
    modelStats.value = []

    try {
      const result = await apiStatsClient.getUserStats(apiId.value)

      if (result.success) {
        statsData.value = result.data

        // 调试：打印返回的限制数据
        console.log('API Stats - Full response:', result.data)
        console.log('API Stats - limits data:', result.data.limits)
        console.log('API Stats - weeklyOpusCostLimit:', result.data.limits?.weeklyOpusCostLimit)
        console.log('API Stats - weeklyOpusCost:', result.data.limits?.weeklyOpusCost)

        // 同时加载今日和本月的统计数据
        await loadAllPeriodStats()

        // 清除错误信息
        error.value = ''
      } else {
        throw new Error(result.message || '查询失败')
      }
    } catch (err) {
      console.error('Load stats with apiId error:', err)
      error.value = err.message || '查询统计数据失败'
      statsData.value = null
      modelStats.value = []
    } finally {
      loading.value = false
    }
  }

  // 加载 OEM 设置
  async function loadOemSettings() {
    oemLoading.value = true
    try {
      const result = await apiStatsClient.getOemSettings()
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

  // 工具函数

  // 格式化费用
  function formatCost(cost) {
    if (typeof cost !== 'number' || cost === 0) {
      return '$0.000000'
    }

    // 根据数值大小选择精度
    if (cost >= 1) {
      return '$' + cost.toFixed(2)
    } else if (cost >= 0.01) {
      return '$' + cost.toFixed(4)
    } else {
      return '$' + cost.toFixed(6)
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

  // 批量查询统计数据
  async function queryBatchStats() {
    const keys = parseApiKeys()
    if (keys.length === 0) {
      error.value = '请输入至少一个有效的 API Key'
      return
    }

    loading.value = true
    error.value = ''
    aggregatedStats.value = null
    individualStats.value = []
    invalidKeys.value = []
    modelStats.value = []
    apiKeys.value = keys
    apiIds.value = []

    try {
      // 批量获取 API Key IDs
      const idResults = await Promise.allSettled(keys.map((key) => apiStatsClient.getKeyId(key)))

      const validIds = []
      const validKeys = []

      idResults.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value.success) {
          validIds.push(result.value.data.id)
          validKeys.push(keys[index])
        } else {
          invalidKeys.value.push(keys[index])
        }
      })

      if (validIds.length === 0) {
        throw new Error('所有 API Key 都无效')
      }

      apiIds.value = validIds
      apiKeys.value = validKeys

      // 批量查询统计数据
      const batchResult = await apiStatsClient.getBatchStats(validIds)

      if (batchResult.success) {
        aggregatedStats.value = batchResult.data.aggregated
        individualStats.value = batchResult.data.individual
        statsData.value = batchResult.data.aggregated // 兼容现有组件

        // 设置聚合模式下的日期统计数据，以保证现有组件的兼容性
        dailyStats.value = batchResult.data.aggregated.dailyUsage || null
        monthlyStats.value = batchResult.data.aggregated.monthlyUsage || null

        // 加载聚合的模型统计
        await loadBatchModelStats(statsPeriod.value)

        // 更新 URL
        updateBatchURL()
      } else {
        throw new Error(batchResult.message || '批量查询失败')
      }
    } catch (err) {
      console.error('Batch query error:', err)
      error.value = err.message || '批量查询统计数据失败'
      aggregatedStats.value = null
      individualStats.value = []
    } finally {
      loading.value = false
    }
  }

  // 加载批量模型统计
  async function loadBatchModelStats(period = 'daily') {
    if (apiIds.value.length === 0) return

    modelStatsLoading.value = true

    try {
      const result = await apiStatsClient.getBatchModelStats(apiIds.value, period)

      if (result.success) {
        modelStats.value = result.data || []
      } else {
        throw new Error(result.message || '加载批量模型统计失败')
      }
    } catch (err) {
      console.error('Load batch model stats error:', err)
      modelStats.value = []
    } finally {
      modelStatsLoading.value = false
    }
  }

  // 解析 API Keys
  function parseApiKeys() {
    if (!apiKey.value) return []

    const keys = apiKey.value
      .split(/[,\n]+/)
      .map((key) => key.trim())
      .filter((key) => key.length > 0)

    // 去重并限制最多30个
    const uniqueKeys = [...new Set(keys)]
    return uniqueKeys.slice(0, 30)
  }

  // 更新批量查询 URL
  function updateBatchURL() {
    if (apiIds.value.length > 0) {
      const url = new URL(window.location)
      url.searchParams.set('apiIds', apiIds.value.join(','))
      url.searchParams.set('batch', 'true')
      window.history.pushState({}, '', url)
    }
  }

  // 清空输入
  function clearInput() {
    apiKey.value = ''
  }

  // 清除数据
  function clearData() {
    statsData.value = null
    modelStats.value = []
    dailyStats.value = null
    monthlyStats.value = null
    error.value = ''
    statsPeriod.value = 'daily'
    apiId.value = null
    // 清除多 Key 模式数据
    apiKeys.value = []
    apiIds.value = []
    aggregatedStats.value = null
    individualStats.value = []
    invalidKeys.value = []
  }

  // 重置
  function reset() {
    apiKey.value = ''
    multiKeyMode.value = false
    clearData()
  }

  return {
    // State
    apiKey,
    apiId,
    loading,
    modelStatsLoading,
    oemLoading,
    error,
    statsPeriod,
    statsData,
    modelStats,
    dailyStats,
    monthlyStats,
    oemSettings,
    // 多 Key 模式状态
    multiKeyMode,
    apiKeys,
    apiIds,
    aggregatedStats,
    individualStats,
    invalidKeys,

    // Computed
    currentPeriodData,
    usagePercentages,

    // Actions
    queryStats,
    queryBatchStats,
    loadAllPeriodStats,
    loadPeriodStats,
    loadModelStats,
    loadBatchModelStats,
    switchPeriod,
    loadStatsWithApiId,
    loadOemSettings,
    clearData,
    clearInput,
    reset
  }
})
