import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { apiClient } from '@/config/api'
import { showToast } from '@/utils/toast'

export const useDashboardStore = defineStore('dashboard', () => {
  // 状态
  const loading = ref(false)
  const dashboardData = ref({
    totalApiKeys: 0,
    activeApiKeys: 0,
    totalAccounts: 0,
    activeAccounts: 0,
    rateLimitedAccounts: 0,
    todayRequests: 0,
    totalRequests: 0,
    todayTokens: 0,
    todayInputTokens: 0,
    todayOutputTokens: 0,
    totalTokens: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCacheCreateTokens: 0,
    totalCacheReadTokens: 0,
    todayCacheCreateTokens: 0,
    todayCacheReadTokens: 0,
    systemRPM: 0,
    systemTPM: 0,
    systemStatus: '正常',
    uptime: 0
  })
  
  const costsData = ref({
    todayCosts: { totalCost: 0, formatted: { totalCost: '$0.000000' } },
    totalCosts: { totalCost: 0, formatted: { totalCost: '$0.000000' } }
  })
  
  const modelStats = ref([])
  const trendData = ref([])
  const dashboardModelStats = ref([])
  const apiKeysTrendData = ref({
    data: [],
    topApiKeys: [],
    totalApiKeys: 0
  })
  
  // 日期筛选
  const dateFilter = ref({
    type: 'preset', // preset 或 custom
    preset: '7days', // today, 7days, 30days
    customStart: '',
    customEnd: '',
    customRange: null,
    presetOptions: [
      { value: 'today', label: '今日', days: 1 },
      { value: '7days', label: '7天', days: 7 },
      { value: '30days', label: '30天', days: 30 }
    ]
  })
  
  // 趋势图粒度
  const trendGranularity = ref('day') // 'day' 或 'hour'
  const apiKeysTrendMetric = ref('requests') // 'requests' 或 'tokens'
  
  // 默认时间
  const defaultTime = ref([new Date(2000, 1, 1, 0, 0, 0), new Date(2000, 2, 1, 23, 59, 59)])
  
  // 计算属性
  const formattedUptime = computed(() => {
    const seconds = dashboardData.value.uptime
    const days = Math.floor(seconds / 86400)
    const hours = Math.floor((seconds % 86400) / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    
    if (days > 0) {
      return `${days}天 ${hours}小时`
    } else if (hours > 0) {
      return `${hours}小时 ${minutes}分钟`
    } else {
      return `${minutes}分钟`
    }
  })
  
  // 方法
  async function loadDashboardData() {
    loading.value = true
    try {
      const [dashboardResponse, todayCostsResponse, totalCostsResponse] = await Promise.all([
        apiClient.get('/admin/dashboard'),
        apiClient.get('/admin/usage-costs?period=today'),
        apiClient.get('/admin/usage-costs?period=all')
      ])
      
      if (dashboardResponse.success) {
        const overview = dashboardResponse.data.overview || {}
        const recentActivity = dashboardResponse.data.recentActivity || {}
        const systemAverages = dashboardResponse.data.systemAverages || {}
        const systemHealth = dashboardResponse.data.systemHealth || {}
        
        dashboardData.value = {
          totalApiKeys: overview.totalApiKeys || 0,
          activeApiKeys: overview.activeApiKeys || 0,
          totalAccounts: overview.totalClaudeAccounts || 0,
          activeAccounts: overview.activeClaudeAccounts || 0,
          rateLimitedAccounts: overview.rateLimitedClaudeAccounts || 0,
          todayRequests: recentActivity.requestsToday || 0,
          totalRequests: overview.totalRequestsUsed || 0,
          todayTokens: recentActivity.tokensToday || 0,
          todayInputTokens: recentActivity.inputTokensToday || 0,
          todayOutputTokens: recentActivity.outputTokensToday || 0,
          totalTokens: overview.totalTokensUsed || 0,
          totalInputTokens: overview.totalInputTokensUsed || 0,
          totalOutputTokens: overview.totalOutputTokensUsed || 0,
          totalCacheCreateTokens: overview.totalCacheCreateTokensUsed || 0,
          totalCacheReadTokens: overview.totalCacheReadTokensUsed || 0,
          todayCacheCreateTokens: recentActivity.cacheCreateTokensToday || 0,
          todayCacheReadTokens: recentActivity.cacheReadTokensToday || 0,
          systemRPM: systemAverages.rpm || 0,
          systemTPM: systemAverages.tpm || 0,
          systemStatus: systemHealth.redisConnected ? '正常' : '异常',
          uptime: systemHealth.uptime || 0
        }
      }
      
      // 更新费用数据
      if (todayCostsResponse.success && totalCostsResponse.success) {
        costsData.value = {
          todayCosts: todayCostsResponse.data.totalCosts || { totalCost: 0, formatted: { totalCost: '$0.000000' } },
          totalCosts: totalCostsResponse.data.totalCosts || { totalCost: 0, formatted: { totalCost: '$0.000000' } }
        }
      }
    } catch (error) {
      console.error('加载仪表板数据失败:', error)
    } finally {
      loading.value = false
    }
  }
  
  async function loadUsageTrend(days = 7, granularity = 'day') {
    try {
      let url = '/admin/usage-trend?'
      
      if (granularity === 'hour') {
        // 小时粒度，传递开始和结束时间
        url += `granularity=hour`
        if (dateFilter.value.customRange && dateFilter.value.customRange.length === 2) {
          url += `&startDate=${encodeURIComponent(dateFilter.value.customRange[0])}`
          url += `&endDate=${encodeURIComponent(dateFilter.value.customRange[1])}`
        }
      } else {
        // 天粒度，传递天数
        url += `granularity=day&days=${days}`
      }
      
      const response = await apiClient.get(url)
      if (response.success) {
        trendData.value = response.data
      }
    } catch (error) {
      console.error('加载使用趋势失败:', error)
    }
  }
  
  async function loadModelStats(period = 'daily') {
    try {
      const response = await apiClient.get(`/admin/model-stats?period=${period}`)
      if (response.success) {
        dashboardModelStats.value = response.data
      }
    } catch (error) {
      console.error('加载模型统计失败:', error)
    }
  }
  
  async function loadApiKeysTrend(metric = 'requests') {
    try {
      let url = '/admin/api-keys-usage-trend?'
      
      if (trendGranularity.value === 'hour') {
        // 小时粒度，传递开始和结束时间
        url += `granularity=hour`
        if (dateFilter.value.customRange && dateFilter.value.customRange.length === 2) {
          url += `&startDate=${encodeURIComponent(dateFilter.value.customRange[0])}`
          url += `&endDate=${encodeURIComponent(dateFilter.value.customRange[1])}`
        }
      } else {
        // 天粒度，传递天数
        const days = dateFilter.value.type === 'preset' 
          ? (dateFilter.value.preset === 'today' ? 1 : dateFilter.value.preset === '7days' ? 7 : 30)
          : calculateDaysBetween(dateFilter.value.customStart, dateFilter.value.customEnd)
        url += `granularity=day&days=${days}`
      }
      
      url += `&metric=${metric}`
      
      const response = await apiClient.get(url)
      if (response.success) {
        apiKeysTrendData.value = {
          data: response.data || [],
          topApiKeys: response.topApiKeys || [],
          totalApiKeys: response.totalApiKeys || 0
        }
      }
    } catch (error) {
      console.error('加载API Keys趋势失败:', error)
    }
  }
  
  // 日期筛选相关方法
  function setDateFilterPreset(preset) {
    dateFilter.value.type = 'preset'
    dateFilter.value.preset = preset
    
    // 根据预设计算并设置具体的日期范围
    const option = dateFilter.value.presetOptions.find(opt => opt.value === preset)
    if (option) {
      const now = new Date()
      let startDate, endDate
      
      if (trendGranularity.value === 'hour') {
        // 小时粒度的预设
        switch (preset) {
          case 'last24h':
            startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000)
            endDate = now
            break
          case 'yesterday':
            startDate = new Date(now)
            startDate.setDate(now.getDate() - 1)
            startDate.setHours(0, 0, 0, 0)
            endDate = new Date(startDate)
            endDate.setHours(23, 59, 59, 999)
            break
          case 'dayBefore':
            startDate = new Date(now)
            startDate.setDate(now.getDate() - 2)
            startDate.setHours(0, 0, 0, 0)
            endDate = new Date(startDate)
            endDate.setHours(23, 59, 59, 999)
            break
        }
      } else {
        // 天粒度的预设
        startDate = new Date(now)
        endDate = new Date(now)
        
        if (preset === 'today') {
          // 今日：从凌晨开始
          startDate.setHours(0, 0, 0, 0)
          endDate.setHours(23, 59, 59, 999)
        } else {
          // 其他预设：按天数计算
          startDate.setDate(now.getDate() - (option.days - 1))
          startDate.setHours(0, 0, 0, 0)
          endDate.setHours(23, 59, 59, 999)
        }
      }
      
      dateFilter.value.customStart = startDate.toISOString().split('T')[0]
      dateFilter.value.customEnd = endDate.toISOString().split('T')[0]
      
      // 设置 customRange 为 Element Plus 需要的格式
      const formatDate = (date) => {
        const year = date.getFullYear()
        const month = String(date.getMonth() + 1).padStart(2, '0')
        const day = String(date.getDate()).padStart(2, '0')
        const hours = String(date.getHours()).padStart(2, '0')
        const minutes = String(date.getMinutes()).padStart(2, '0')
        const seconds = String(date.getSeconds()).padStart(2, '0')
        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
      }
      
      dateFilter.value.customRange = [
        formatDate(startDate),
        formatDate(endDate)
      ]
    }
    
    // 触发数据刷新
    refreshChartsData()
  }
  
  function onCustomDateRangeChange(value) {
    if (value && value.length === 2) {
      dateFilter.value.type = 'custom'
      dateFilter.value.preset = '' // 清除预设选择
      dateFilter.value.customRange = value
      dateFilter.value.customStart = value[0].split(' ')[0]
      dateFilter.value.customEnd = value[1].split(' ')[0]
      
      // 检查日期范围限制
      const start = new Date(value[0])
      const end = new Date(value[1])
      
      if (trendGranularity.value === 'hour') {
        // 小时粒度：限制 24 小时
        const hoursDiff = (end - start) / (1000 * 60 * 60)
        if (hoursDiff > 24) {
          showToast('小时粒度下日期范围不能超过24小时', 'warning')
          return
        }
      } else {
        // 天粒度：限制 31 天
        const daysDiff = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1
        if (daysDiff > 31) {
          showToast('日期范围不能超过 31 天', 'warning')
          return
        }
      }
      
      // 触发数据刷新
      refreshChartsData()
    } else if (value === null) {
      // 清空时恢复默认
      setDateFilterPreset(trendGranularity.value === 'hour' ? '7days' : '7days')
    }
  }
  
  function setTrendGranularity(granularity) {
    trendGranularity.value = granularity
    
    // 根据粒度更新预设选项
    if (granularity === 'hour') {
      dateFilter.value.presetOptions = [
        { value: 'last24h', label: '近24小时', hours: 24 },
        { value: 'yesterday', label: '昨天', hours: 24 },
        { value: 'dayBefore', label: '前天', hours: 24 }
      ]
      
      // 检查当前自定义日期范围是否超过24小时
      if (dateFilter.value.type === 'custom' && dateFilter.value.customRange && dateFilter.value.customRange.length === 2) {
        const start = new Date(dateFilter.value.customRange[0])
        const end = new Date(dateFilter.value.customRange[1])
        const hoursDiff = (end - start) / (1000 * 60 * 60)
        if (hoursDiff > 24) {
          showToast('小时粒度下日期范围不能超过24小时，已切换到近24小时', 'warning')
          setDateFilterPreset('last24h')
          return
        }
      }
      
      // 如果当前是天粒度的预设，切换到小时粒度的默认预设
      if (['today', '7days', '30days'].includes(dateFilter.value.preset)) {
        setDateFilterPreset('last24h')
        return
      }
    } else {
      // 天粒度
      dateFilter.value.presetOptions = [
        { value: 'today', label: '今日', days: 1 },
        { value: '7days', label: '7天', days: 7 },
        { value: '30days', label: '30天', days: 30 }
      ]
      
      // 如果当前是小时粒度的预设，切换到天粒度的默认预设
      if (['last24h', 'yesterday', 'dayBefore'].includes(dateFilter.value.preset)) {
        setDateFilterPreset('7days')
        return
      }
    }
    
    // 触发数据刷新
    refreshChartsData()
  }
  
  async function refreshChartsData() {
    // 根据当前筛选条件刷新数据
    let days
    let modelPeriod = 'monthly'
    
    if (dateFilter.value.type === 'preset') {
      const option = dateFilter.value.presetOptions.find(opt => opt.value === dateFilter.value.preset)
      
      if (trendGranularity.value === 'hour') {
        // 小时粒度
        days = 1 // 小时粒度默认查看1天的数据
        modelPeriod = 'daily' // 小时粒度使用日统计
      } else {
        // 天粒度
        days = option ? option.days : 7
        // 设置模型统计期间
        if (dateFilter.value.preset === 'today') {
          modelPeriod = 'daily'
        } else {
          modelPeriod = 'monthly'
        }
      }
    } else {
      // 自定义日期范围
      if (trendGranularity.value === 'hour') {
        // 小时粒度下的自定义范围，计算小时数
        const start = new Date(dateFilter.value.customRange[0])
        const end = new Date(dateFilter.value.customRange[1])
        const hoursDiff = Math.ceil((end - start) / (1000 * 60 * 60))
        days = Math.ceil(hoursDiff / 24) || 1
      } else {
        days = calculateDaysBetween(dateFilter.value.customStart, dateFilter.value.customEnd)
      }
      modelPeriod = 'daily' // 自定义范围使用日统计
    }
    
    await Promise.all([
      loadUsageTrend(days, trendGranularity.value),
      loadModelStats(modelPeriod),
      loadApiKeysTrend(apiKeysTrendMetric.value)
    ])
  }
  
  function calculateDaysBetween(start, end) {
    if (!start || !end) return 7
    const startDate = new Date(start)
    const endDate = new Date(end)
    const diffTime = Math.abs(endDate - startDate)
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    return diffDays || 7
  }
  
  function disabledDate(date) {
    return date > new Date()
  }
  
  return {
    // 状态
    loading,
    dashboardData,
    costsData,
    modelStats,
    trendData,
    dashboardModelStats,
    apiKeysTrendData,
    dateFilter,
    trendGranularity,
    apiKeysTrendMetric,
    defaultTime,
    
    // 计算属性
    formattedUptime,
    
    // 方法
    loadDashboardData,
    loadUsageTrend,
    loadModelStats,
    loadApiKeysTrend,
    setDateFilterPreset,
    onCustomDateRangeChange,
    setTrendGranularity,
    refreshChartsData,
    disabledDate
  }
})