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
    normalAccounts: 0,
    abnormalAccounts: 0,
    pausedAccounts: 0,
    activeAccounts: 0, // 保留兼容
    rateLimitedAccounts: 0,
    accountsByPlatform: {
      claude: { total: 0, normal: 0, abnormal: 0, paused: 0, rateLimited: 0 },
      'claude-console': { total: 0, normal: 0, abnormal: 0, paused: 0, rateLimited: 0 },
      gemini: { total: 0, normal: 0, abnormal: 0, paused: 0, rateLimited: 0 },
      openai: { total: 0, normal: 0, abnormal: 0, paused: 0, rateLimited: 0 },
      azure_openai: { total: 0, normal: 0, abnormal: 0, paused: 0, rateLimited: 0 },
      bedrock: { total: 0, normal: 0, abnormal: 0, paused: 0, rateLimited: 0 }
    },
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
    realtimeRPM: 0,
    realtimeTPM: 0,
    metricsWindow: 5,
    isHistoricalMetrics: false,
    systemStatus: '正常',
    uptime: 0,
    systemTimezone: 8 // 默认 UTC+8
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
  const accountUsageTrendData = ref({
    data: [],
    topAccounts: [],
    totalAccounts: 0,
    group: 'claude',
    groupLabel: 'Claude账户'
  })

  // 本地偏好
  const STORAGE_KEYS = {
    preset: 'dashboard:date:preset',
    granularity: 'dashboard:trend:granularity'
  }
  const defaultPreset = 'today'
  const defaultGranularity = 'day'

  const getPresetOptions = (granularity) =>
    granularity === 'hour'
      ? [
          { value: 'last24h', label: '近24小时', hours: 24 },
          { value: 'yesterday', label: '昨天', hours: 24 },
          { value: 'dayBefore', label: '前天', hours: 24 }
        ]
      : [
          { value: 'today', label: '今日', days: 1 },
          { value: '7days', label: '7天', days: 7 },
          { value: '30days', label: '30天', days: 30 }
        ]

  const readFromStorage = (key, fallback) => {
    try {
      const value = localStorage.getItem(key)
      return value || fallback
    } catch (error) {
      return fallback
    }
  }

  const saveToStorage = (key, value) => {
    try {
      localStorage.setItem(key, value)
    } catch (error) {
      // 忽略存储错误，避免影响渲染
    }
  }

  const normalizePresetForGranularity = (preset, granularity) => {
    const options = getPresetOptions(granularity)
    const hasPreset = options.some((opt) => opt.value === preset)
    if (hasPreset) return preset
    return granularity === 'hour' ? 'last24h' : defaultPreset
  }

  const storedGranularity = readFromStorage(STORAGE_KEYS.granularity, defaultGranularity)
  const initialGranularity = ['day', 'hour'].includes(storedGranularity)
    ? storedGranularity
    : defaultGranularity
  const initialPreset = normalizePresetForGranularity(
    readFromStorage(STORAGE_KEYS.preset, defaultPreset),
    initialGranularity
  )

  // 日期筛选
  const dateFilter = ref({
    type: 'preset', // preset 或 custom
    preset: initialPreset, // today, 7days, 30days
    customStart: '',
    customEnd: '',
    customRange: null,
    presetOptions: getPresetOptions(initialGranularity)
  })

  // 趋势图粒度
  const trendGranularity = ref(initialGranularity) // 'day' 或 'hour'
  const apiKeysTrendMetric = ref('requests') // 'requests' 或 'tokens'
  const accountUsageGroup = ref('claude') // claude | openai | gemini

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

  // 辅助函数：基于系统时区计算时间
  // function getDateInSystemTimezone(date = new Date()) {
  //   const offset = dashboardData.value.systemTimezone || 8
  //   // 将本地时间转换为UTC时间，然后加上系统时区偏移
  //   const utcTime = date.getTime() + date.getTimezoneOffset() * 60000
  //   return new Date(utcTime + offset * 3600000)
  // }

  // 辅助函数：获取系统时区某一天的起止UTC时间
  // 输入：一个本地时间的日期对象（如用户选择的日期）
  // 输出：该日期在系统时区的0点/23:59对应的UTC时间
  function getSystemTimezoneDay(localDate, startOfDay = true) {
    // 固定使用UTC+8，因为后端系统时区是UTC+8
    // const systemTz = 8

    // 获取本地日期的年月日（这是用户想要查看的日期）
    const year = localDate.getFullYear()
    const month = localDate.getMonth()
    const day = localDate.getDate()

    if (startOfDay) {
      // 系统时区（UTC+8）的 YYYY-MM-DD 00:00:00
      // 对应的UTC时间是前一天的16:00
      // 例如：UTC+8的2025-07-29 00:00:00 = UTC的2025-07-28 16:00:00
      return new Date(Date.UTC(year, month, day - 1, 16, 0, 0, 0))
    } else {
      // 系统时区（UTC+8）的 YYYY-MM-DD 23:59:59
      // 对应的UTC时间是当天的15:59:59
      // 例如：UTC+8的2025-07-29 23:59:59 = UTC的2025-07-29 15:59:59
      return new Date(Date.UTC(year, month, day, 15, 59, 59, 999))
    }
  }

  const persistDatePreferences = (
    preset = dateFilter.value.preset,
    granularity = trendGranularity.value
  ) => {
    saveToStorage(STORAGE_KEYS.preset, preset)
    saveToStorage(STORAGE_KEYS.granularity, granularity)
  }

  const getEffectiveGranularity = () =>
    dateFilter.value.type === 'preset' &&
    dateFilter.value.preset === 'today' &&
    trendGranularity.value === 'day'
      ? 'hour'
      : trendGranularity.value

  // 方法
  async function loadDashboardData(timeRange = null) {
    loading.value = true
    try {
      // 根据timeRange动态设置costs查询参数
      let costsParams = { today: 'today', all: 'all' }

      if (timeRange) {
        const periodMapping = {
          today: { today: 'today', all: 'today' },
          '7days': { today: '7days', all: '7days' },
          monthly: { today: 'monthly', all: 'monthly' },
          all: { today: 'today', all: 'all' }
        }
        costsParams = periodMapping[timeRange] || costsParams
      }

      const [dashboardResponse, todayCostsResponse, totalCostsResponse] = await Promise.all([
        apiClient.get('/admin/dashboard'),
        apiClient.get(`/admin/usage-costs?period=${costsParams.today}`),
        apiClient.get(`/admin/usage-costs?period=${costsParams.all}`)
      ])

      if (dashboardResponse.success) {
        const overview = dashboardResponse.data.overview || {}
        const recentActivity = dashboardResponse.data.recentActivity || {}
        const systemAverages = dashboardResponse.data.systemAverages || {}
        const realtimeMetrics = dashboardResponse.data.realtimeMetrics || {}
        const systemHealth = dashboardResponse.data.systemHealth || {}

        dashboardData.value = {
          totalApiKeys: overview.totalApiKeys || 0,
          activeApiKeys: overview.activeApiKeys || 0,
          // 使用新的统一统计字段
          totalAccounts: overview.totalAccounts || overview.totalClaudeAccounts || 0,
          normalAccounts: overview.normalAccounts || 0,
          abnormalAccounts: overview.abnormalAccounts || 0,
          pausedAccounts: overview.pausedAccounts || 0,
          activeAccounts: overview.activeAccounts || overview.activeClaudeAccounts || 0, // 兼容
          rateLimitedAccounts:
            overview.rateLimitedAccounts || overview.rateLimitedClaudeAccounts || 0,
          // 各平台详细统计
          accountsByPlatform: overview.accountsByPlatform || {
            claude: { total: 0, normal: 0, abnormal: 0, paused: 0, rateLimited: 0 },
            'claude-console': { total: 0, normal: 0, abnormal: 0, paused: 0, rateLimited: 0 },
            gemini: { total: 0, normal: 0, abnormal: 0, paused: 0, rateLimited: 0 },
            openai: { total: 0, normal: 0, abnormal: 0, paused: 0, rateLimited: 0 },
            azure_openai: { total: 0, normal: 0, abnormal: 0, paused: 0, rateLimited: 0 },
            bedrock: { total: 0, normal: 0, abnormal: 0, paused: 0, rateLimited: 0 }
          },
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
          realtimeRPM: realtimeMetrics.rpm || 0,
          realtimeTPM: realtimeMetrics.tpm || 0,
          metricsWindow: realtimeMetrics.windowMinutes || 5,
          isHistoricalMetrics: realtimeMetrics.isHistorical || false,
          systemStatus: systemHealth.redisConnected ? '正常' : '异常',
          uptime: systemHealth.uptime || 0,
          systemTimezone: dashboardResponse.data.systemTimezone || 8
        }
      }

      // 更新费用数据
      if (todayCostsResponse.success && totalCostsResponse.success) {
        costsData.value = {
          todayCosts: todayCostsResponse.data.totalCosts || {
            totalCost: 0,
            formatted: { totalCost: '$0.000000' }
          },
          totalCosts: totalCostsResponse.data.totalCosts || {
            totalCost: 0,
            formatted: { totalCost: '$0.000000' }
          }
        }
      }
    } catch (error) {
      console.error('加载仪表板数据失败:', error)
    } finally {
      loading.value = false
    }
  }

  async function loadUsageTrend(days = 7, granularity = getEffectiveGranularity()) {
    try {
      let url = '/admin/usage-trend?'

      if (granularity === 'hour') {
        // 小时粒度，计算时间范围
        url += `granularity=hour`

        if (dateFilter.value.customRange && dateFilter.value.customRange.length === 2) {
          // 使用自定义时间范围 - 直接按系统时区字符串传递，避免额外时区偏移导致窗口错位
          url += `&startDate=${encodeURIComponent(dateFilter.value.customRange[0])}`
          url += `&endDate=${encodeURIComponent(dateFilter.value.customRange[1])}`
        } else {
          // 使用预设计算时间范围，与loadApiKeysTrend保持一致
          const now = new Date()
          let startTime, endTime

          if (dateFilter.value.type === 'preset') {
            switch (dateFilter.value.preset) {
              case 'today': {
                // 今日：使用系统时区的当日0点-23:59
                startTime = getSystemTimezoneDay(now, true)
                endTime = getSystemTimezoneDay(now, false)
                break
              }
              case 'last24h': {
                // 近24小时：从当前时间往前推24小时
                endTime = new Date(now)
                startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000)
                break
              }
              case 'yesterday': {
                const yesterday = new Date()
                yesterday.setDate(yesterday.getDate() - 1)
                startTime = getSystemTimezoneDay(yesterday, true)
                endTime = getSystemTimezoneDay(yesterday, false)
                break
              }
              case 'dayBefore': {
                // 前天：基于系统时区的前天
                const dayBefore = new Date()
                dayBefore.setDate(dayBefore.getDate() - 2)
                startTime = getSystemTimezoneDay(dayBefore, true)
                endTime = getSystemTimezoneDay(dayBefore, false)
                break
              }
              default: {
                // 默认近24小时
                startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000)
                endTime = now
              }
            }
          } else {
            // 默认使用days参数计算
            startTime = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
            endTime = now
          }

          url += `&startDate=${encodeURIComponent(startTime.toISOString())}`
          url += `&endDate=${encodeURIComponent(endTime.toISOString())}`
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

  async function loadModelStats(period = 'daily', granularity = null) {
    const currentGranularity = granularity || getEffectiveGranularity()
    try {
      let url = `/admin/model-stats?period=${period}`

      // 如果是自定义时间范围或小时粒度，传递具体的时间参数
      if (dateFilter.value.type === 'custom' || currentGranularity === 'hour') {
        if (dateFilter.value.customRange && dateFilter.value.customRange.length === 2) {
          // 按系统时区字符串直传，避免额外时区转换
          url += `&startDate=${encodeURIComponent(dateFilter.value.customRange[0])}`
          url += `&endDate=${encodeURIComponent(dateFilter.value.customRange[1])}`
        } else if (currentGranularity === 'hour' && dateFilter.value.type === 'preset') {
          // 小时粒度的预设时间范围
          const now = new Date()
          let startTime, endTime

          switch (dateFilter.value.preset) {
            case 'today': {
              startTime = getSystemTimezoneDay(now, true)
              endTime = getSystemTimezoneDay(now, false)
              break
            }
            case 'last24h': {
              endTime = new Date(now)
              startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000)
              break
            }
            case 'yesterday': {
              const yesterday = new Date()
              yesterday.setDate(yesterday.getDate() - 1)
              startTime = getSystemTimezoneDay(yesterday, true)
              endTime = getSystemTimezoneDay(yesterday, false)
              break
            }
            case 'dayBefore': {
              const dayBefore = new Date()
              dayBefore.setDate(dayBefore.getDate() - 2)
              startTime = getSystemTimezoneDay(dayBefore, true)
              endTime = getSystemTimezoneDay(dayBefore, false)
              break
            }
            default: {
              startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000)
              endTime = now
            }
          }

          url += `&startDate=${encodeURIComponent(startTime.toISOString())}`
          url += `&endDate=${encodeURIComponent(endTime.toISOString())}`
        }
      } else if (dateFilter.value.type === 'preset' && currentGranularity === 'day') {
        // 天粒度的预设时间范围，需要传递startDate和endDate参数
        const now = new Date()
        let startDate, endDate

        const option = dateFilter.value.presetOptions.find(
          (opt) => opt.value === dateFilter.value.preset
        )
        if (option) {
          if (dateFilter.value.preset === 'today') {
            // 今日：从系统时区的今天0点到23:59
            startDate = getSystemTimezoneDay(now, true)
            endDate = getSystemTimezoneDay(now, false)
          } else {
            // 7天或30天：从N天前的0点到今天的23:59
            const daysAgo = new Date()
            daysAgo.setDate(daysAgo.getDate() - (option.days - 1))
            startDate = getSystemTimezoneDay(daysAgo, true)
            endDate = getSystemTimezoneDay(now, false)
          }

          url += `&startDate=${encodeURIComponent(startDate.toISOString())}`
          url += `&endDate=${encodeURIComponent(endDate.toISOString())}`
        }
      }

      const response = await apiClient.get(url)
      if (response.success) {
        dashboardModelStats.value = response.data
      }
    } catch (error) {
      console.error('加载模型统计失败:', error)
    }
  }

  async function loadApiKeysTrend(metric = 'requests', granularity = null) {
    const currentGranularity = granularity || getEffectiveGranularity()
    try {
      let url = '/admin/api-keys-usage-trend?'
      let days = 7

      if (currentGranularity === 'hour') {
        // 小时粒度，计算时间范围
        url += `granularity=hour`

        if (dateFilter.value.customRange && dateFilter.value.customRange.length === 2) {
          // 使用自定义时间范围 - 按系统时区字符串直传
          url += `&startDate=${encodeURIComponent(dateFilter.value.customRange[0])}`
          url += `&endDate=${encodeURIComponent(dateFilter.value.customRange[1])}`
        } else {
          // 使用预设计算时间范围，与setDateFilterPreset保持一致
          const now = new Date()
          let startTime, endTime

          if (dateFilter.value.type === 'preset') {
            switch (dateFilter.value.preset) {
              case 'today': {
                startTime = getSystemTimezoneDay(now, true)
                endTime = getSystemTimezoneDay(now, false)
                break
              }
              case 'last24h': {
                // 近24小时：从当前时间往前推24小时
                endTime = new Date(now)
                startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000)
                break
              }
              case 'yesterday': {
                // 昨天：基于系统时区的昨天
                const yesterday = new Date()
                yesterday.setDate(yesterday.getDate() - 1)
                startTime = getSystemTimezoneDay(yesterday, true)
                endTime = getSystemTimezoneDay(yesterday, false)
                break
              }
              case 'dayBefore': {
                // 前天：基于系统时区的前天
                const dayBefore = new Date()
                dayBefore.setDate(dayBefore.getDate() - 2)
                startTime = getSystemTimezoneDay(dayBefore, true)
                endTime = getSystemTimezoneDay(dayBefore, false)
                break
              }
              default: {
                // 默认近24小时
                startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000)
                endTime = now
              }
            }
          } else {
            // 默认近24小时
            startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000)
            endTime = now
          }

          url += `&startDate=${encodeURIComponent(startTime.toISOString())}`
          url += `&endDate=${encodeURIComponent(endTime.toISOString())}`
        }
      } else {
        // 天粒度，传递天数
        days =
          dateFilter.value.type === 'preset'
            ? dateFilter.value.preset === 'today'
              ? 1
              : dateFilter.value.preset === '7days'
                ? 7
                : 30
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

  async function loadAccountUsageTrend(group = accountUsageGroup.value, granularity = null) {
    const currentGranularity = granularity || getEffectiveGranularity()
    try {
      let url = '/admin/account-usage-trend?'
      let days = 7

      if (currentGranularity === 'hour') {
        url += `granularity=hour`

        if (dateFilter.value.customRange && dateFilter.value.customRange.length === 2) {
          url += `&startDate=${encodeURIComponent(dateFilter.value.customRange[0])}`
          url += `&endDate=${encodeURIComponent(dateFilter.value.customRange[1])}`
        } else {
          const now = new Date()
          let startTime
          let endTime

          if (dateFilter.value.type === 'preset') {
            switch (dateFilter.value.preset) {
              case 'today': {
                startTime = getSystemTimezoneDay(now, true)
                endTime = getSystemTimezoneDay(now, false)
                break
              }
              case 'last24h': {
                endTime = new Date(now)
                startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000)
                break
              }
              case 'yesterday': {
                const yesterday = new Date()
                yesterday.setDate(yesterday.getDate() - 1)
                startTime = getSystemTimezoneDay(yesterday, true)
                endTime = getSystemTimezoneDay(yesterday, false)
                break
              }
              case 'dayBefore': {
                const dayBefore = new Date()
                dayBefore.setDate(dayBefore.getDate() - 2)
                startTime = getSystemTimezoneDay(dayBefore, true)
                endTime = getSystemTimezoneDay(dayBefore, false)
                break
              }
              default: {
                startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000)
                endTime = now
              }
            }
          } else {
            startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000)
            endTime = now
          }

          url += `&startDate=${encodeURIComponent(startTime.toISOString())}`
          url += `&endDate=${encodeURIComponent(endTime.toISOString())}`
        }
      } else {
        days =
          dateFilter.value.type === 'preset'
            ? dateFilter.value.preset === 'today'
              ? 1
              : dateFilter.value.preset === '7days'
                ? 7
                : 30
            : calculateDaysBetween(dateFilter.value.customStart, dateFilter.value.customEnd)
        url += `granularity=day&days=${days}`
      }

      url += `&group=${group}`

      const response = await apiClient.get(url)
      if (response.success) {
        accountUsageTrendData.value = {
          data: response.data || [],
          topAccounts: response.topAccounts || [],
          totalAccounts: response.totalAccounts || 0,
          group: response.group || group,
          groupLabel: response.groupLabel || ''
        }
      }
    } catch (error) {
      console.error('加载账号使用趋势失败:', error)
    }
  }

  // 日期筛选相关方法
  function setDateFilterPreset(preset, options = {}) {
    const { silent = false, skipSave = false } = options
    const normalizedPreset = normalizePresetForGranularity(preset, trendGranularity.value)

    dateFilter.value.type = 'preset'
    dateFilter.value.preset = normalizedPreset

    const option = dateFilter.value.presetOptions.find((opt) => opt.value === normalizedPreset)
    const now = new Date()
    let startDate
    let endDate

    if (trendGranularity.value === 'hour') {
      switch (normalizedPreset) {
        case 'today': {
          startDate = getSystemTimezoneDay(now, true)
          endDate = getSystemTimezoneDay(now, false)
          break
        }
        case 'last24h': {
          endDate = new Date(now)
          startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000)
          break
        }
        case 'yesterday': {
          const yesterday = new Date()
          yesterday.setDate(yesterday.getDate() - 1)
          startDate = getSystemTimezoneDay(yesterday, true)
          endDate = getSystemTimezoneDay(yesterday, false)
          break
        }
        case 'dayBefore': {
          const dayBefore = new Date()
          dayBefore.setDate(dayBefore.getDate() - 2)
          startDate = getSystemTimezoneDay(dayBefore, true)
          endDate = getSystemTimezoneDay(dayBefore, false)
          break
        }
        default: {
          endDate = new Date(now)
          startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000)
        }
      }
    } else {
      startDate = new Date(now)
      endDate = new Date(now)

      if (normalizedPreset === 'today') {
        startDate.setHours(0, 0, 0, 0)
        endDate.setHours(23, 59, 59, 999)
      } else if (option?.days) {
        startDate.setDate(now.getDate() - (option.days - 1))
        startDate.setHours(0, 0, 0, 0)
        endDate.setHours(23, 59, 59, 999)
      }
    }

    const formatDateForDisplay = (date) => {
      // 使用本地时间直接格式化，避免多余的时区偏移导致日期错位
      const localTime = new Date(date)
      const year = localTime.getFullYear()
      const month = String(localTime.getMonth() + 1).padStart(2, '0')
      const day = String(localTime.getDate()).padStart(2, '0')
      const hours = String(localTime.getHours()).padStart(2, '0')
      const minutes = String(localTime.getMinutes()).padStart(2, '0')
      const seconds = String(localTime.getSeconds()).padStart(2, '0')
      return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
    }

    dateFilter.value.customStart = startDate ? startDate.toISOString().split('T')[0] : ''
    dateFilter.value.customEnd = endDate ? endDate.toISOString().split('T')[0] : ''
    dateFilter.value.customRange =
      startDate && endDate ? [formatDateForDisplay(startDate), formatDateForDisplay(endDate)] : null

    if (!skipSave) {
      persistDatePreferences(dateFilter.value.preset, trendGranularity.value)
    }

    if (!silent) {
      refreshChartsData()
    }
  }

  function onCustomDateRangeChange(value) {
    if (value && value.length === 2) {
      dateFilter.value.type = 'custom'
      dateFilter.value.preset = '' // 清除预设选择
      dateFilter.value.customRange = value
      dateFilter.value.customStart = value[0].split(' ')[0]
      dateFilter.value.customEnd = value[1].split(' ')[0]

      // 检查日期范围限制 - value中的时间已经是系统时区时间
      // const systemTz = dashboardData.value.systemTimezone || 8

      // 解析系统时区时间
      const parseSystemTime = (timeStr) => {
        const [datePart, timePart] = timeStr.split(' ')
        const [year, month, day] = datePart.split('-').map(Number)
        const [hours, minutes, seconds] = timePart.split(':').map(Number)
        return new Date(year, month - 1, day, hours, minutes, seconds)
      }

      const start = parseSystemTime(value[0])
      const end = parseSystemTime(value[1])

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
      setDateFilterPreset(trendGranularity.value === 'hour' ? 'last24h' : defaultPreset)
    }
  }

  function setTrendGranularity(granularity, options = {}) {
    const { silent = false, skipSave = false, presetOverride } = options
    trendGranularity.value = granularity

    // 根据粒度更新预设选项
    if (granularity === 'hour') {
      dateFilter.value.presetOptions = getPresetOptions('hour')

      // 检查当前自定义日期范围是否超过24小时
      if (
        dateFilter.value.type === 'custom' &&
        dateFilter.value.customRange &&
        dateFilter.value.customRange.length === 2
      ) {
        const start = new Date(dateFilter.value.customRange[0])
        const end = new Date(dateFilter.value.customRange[1])
        const hoursDiff = (end - start) / (1000 * 60 * 60)
        if (hoursDiff > 24) {
          showToast('小时粒度下日期范围不能超过24小时，已切换到近24小时', 'warning')
          setDateFilterPreset('last24h', { silent, skipSave })
          return
        }
      }
    } else {
      // 天粒度
      dateFilter.value.presetOptions = getPresetOptions('day')
    }

    if (dateFilter.value.type === 'custom') {
      if (!skipSave) {
        persistDatePreferences(dateFilter.value.preset || defaultPreset, trendGranularity.value)
      }

      if (!silent) {
        refreshChartsData()
      }
      return
    }

    const nextPreset =
      presetOverride ||
      normalizePresetForGranularity(dateFilter.value.preset, trendGranularity.value)

    setDateFilterPreset(nextPreset, { silent: true, skipSave: true })

    if (!skipSave) {
      persistDatePreferences(dateFilter.value.preset, trendGranularity.value)
    }

    if (!silent) {
      refreshChartsData()
    }
  }

  async function refreshChartsData() {
    // 根据当前筛选条件刷新数据
    let days
    let modelPeriod = 'monthly'
    const effectiveGranularity = getEffectiveGranularity()

    if (dateFilter.value.type === 'preset') {
      const option = dateFilter.value.presetOptions.find(
        (opt) => opt.value === dateFilter.value.preset
      )

      if (effectiveGranularity === 'hour') {
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
      if (effectiveGranularity === 'hour') {
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
      loadUsageTrend(days, effectiveGranularity),
      loadModelStats(modelPeriod, effectiveGranularity),
      loadApiKeysTrend(apiKeysTrendMetric.value, effectiveGranularity),
      loadAccountUsageTrend(accountUsageGroup.value, effectiveGranularity)
    ])
  }

  function setAccountUsageGroup(group) {
    accountUsageGroup.value = group
    return loadAccountUsageTrend(group, getEffectiveGranularity())
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

  // 初始化日期筛选：同步本地偏好并填充范围
  setDateFilterPreset(dateFilter.value.preset, { silent: true, skipSave: true })
  persistDatePreferences(dateFilter.value.preset, trendGranularity.value)

  return {
    // 状态
    loading,
    dashboardData,
    costsData,
    modelStats,
    trendData,
    dashboardModelStats,
    apiKeysTrendData,
    accountUsageTrendData,
    dateFilter,
    trendGranularity,
    apiKeysTrendMetric,
    accountUsageGroup,
    defaultTime,

    // 计算属性
    formattedUptime,

    // 方法
    loadDashboardData,
    loadUsageTrend,
    loadModelStats,
    loadApiKeysTrend,
    loadAccountUsageTrend,
    setDateFilterPreset,
    onCustomDateRangeChange,
    setTrendGranularity,
    refreshChartsData,
    setAccountUsageGroup,
    disabledDate
  }
})
