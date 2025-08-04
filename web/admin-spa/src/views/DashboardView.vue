<template>
  <div>
    <!-- 主要统计 -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-6 mb-4 sm:mb-6 md:mb-8">
      <div class="stat-card">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-xs sm:text-sm font-semibold text-gray-600 mb-1">
              总API Keys
            </p>
            <p class="text-2xl sm:text-3xl font-bold text-gray-900">
              {{ dashboardData.totalApiKeys }}
            </p>
            <p class="text-xs text-gray-500 mt-1">
              活跃: {{ dashboardData.activeApiKeys || 0 }}
            </p>
          </div>
          <div class="stat-icon flex-shrink-0 bg-gradient-to-br from-blue-500 to-blue-600">
            <i class="fas fa-key" />
          </div>
        </div>
      </div>
      
      <div class="stat-card">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-xs sm:text-sm font-semibold text-gray-600 mb-1">
              服务账户
            </p>
            <p class="text-2xl sm:text-3xl font-bold text-gray-900">
              {{ dashboardData.totalAccounts }}
            </p>
            <p class="text-xs text-gray-500 mt-1">
              活跃: {{ dashboardData.activeAccounts || 0 }}
              <span
                v-if="dashboardData.rateLimitedAccounts > 0"
                class="text-yellow-600"
              >
                | 限流: {{ dashboardData.rateLimitedAccounts }}
              </span>
            </p>
          </div>
          <div class="stat-icon flex-shrink-0 bg-gradient-to-br from-green-500 to-green-600">
            <i class="fas fa-user-circle" />
          </div>
        </div>
      </div>
      
      <div class="stat-card">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-xs sm:text-sm font-semibold text-gray-600 mb-1">
              今日请求
            </p>
            <p class="text-2xl sm:text-3xl font-bold text-gray-900">
              {{ dashboardData.todayRequests }}
            </p>
            <p class="text-xs text-gray-500 mt-1">
              总请求: {{ formatNumber(dashboardData.totalRequests || 0) }}
            </p>
          </div>
          <div class="stat-icon flex-shrink-0 bg-gradient-to-br from-purple-500 to-purple-600">
            <i class="fas fa-chart-line" />
          </div>
        </div>
      </div>
      
      <div class="stat-card">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-xs sm:text-sm font-semibold text-gray-600 mb-1">
              系统状态
            </p>
            <p class="text-2xl sm:text-3xl font-bold text-green-600">
              {{ dashboardData.systemStatus }}
            </p>
            <p class="text-xs text-gray-500 mt-1">
              运行时间: {{ formattedUptime }}
            </p>
          </div>
          <div class="stat-icon flex-shrink-0 bg-gradient-to-br from-yellow-500 to-orange-500">
            <i class="fas fa-heartbeat" />
          </div>
        </div>
      </div>
    </div>

    <!-- Token统计和性能指标 -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-6 mb-4 sm:mb-6 md:mb-8">
      <div class="stat-card">
        <div class="flex items-center justify-between">
          <div class="flex-1 mr-8">
            <p class="text-xs sm:text-sm font-semibold text-gray-600 mb-1">
              今日Token
            </p>
            <div class="flex items-baseline gap-2 mb-2 flex-wrap">
              <p class="text-xl sm:text-2xl md:text-3xl font-bold text-blue-600">
                {{ formatNumber((dashboardData.todayInputTokens || 0) + (dashboardData.todayOutputTokens || 0) + (dashboardData.todayCacheCreateTokens || 0) + (dashboardData.todayCacheReadTokens || 0)) }}
              </p>
              <span class="text-sm text-green-600 font-medium">/ {{ costsData.todayCosts.formatted.totalCost }}</span>
            </div>
            <div class="text-xs text-gray-500">
              <div class="flex justify-between items-center flex-wrap gap-x-4">
                <span>输入: <span class="font-medium">{{ formatNumber(dashboardData.todayInputTokens || 0) }}</span></span>
                <span>输出: <span class="font-medium">{{ formatNumber(dashboardData.todayOutputTokens || 0) }}</span></span>
                <span
                  v-if="(dashboardData.todayCacheCreateTokens || 0) > 0"
                  class="text-purple-600"
                >缓存创建: <span class="font-medium">{{ formatNumber(dashboardData.todayCacheCreateTokens || 0) }}</span></span>
                <span
                  v-if="(dashboardData.todayCacheReadTokens || 0) > 0"
                  class="text-purple-600"
                >缓存读取: <span class="font-medium">{{ formatNumber(dashboardData.todayCacheReadTokens || 0) }}</span></span>
              </div>
            </div>
          </div>
          <div class="stat-icon flex-shrink-0 bg-gradient-to-br from-indigo-500 to-indigo-600">
            <i class="fas fa-coins" />
          </div>
        </div>
      </div>

      <div class="stat-card">
        <div class="flex items-center justify-between">
          <div class="flex-1 mr-8">
            <p class="text-xs sm:text-sm font-semibold text-gray-600 mb-1">
              总Token消耗
            </p>
            <div class="flex items-baseline gap-2 mb-2 flex-wrap">
              <p class="text-xl sm:text-2xl md:text-3xl font-bold text-emerald-600">
                {{ formatNumber((dashboardData.totalInputTokens || 0) + (dashboardData.totalOutputTokens || 0) + (dashboardData.totalCacheCreateTokens || 0) + (dashboardData.totalCacheReadTokens || 0)) }}
              </p>
              <span class="text-sm text-green-600 font-medium">/ {{ costsData.totalCosts.formatted.totalCost }}</span>
            </div>
            <div class="text-xs text-gray-500">
              <div class="flex justify-between items-center flex-wrap gap-x-4">
                <span>输入: <span class="font-medium">{{ formatNumber(dashboardData.totalInputTokens || 0) }}</span></span>
                <span>输出: <span class="font-medium">{{ formatNumber(dashboardData.totalOutputTokens || 0) }}</span></span>
                <span
                  v-if="(dashboardData.totalCacheCreateTokens || 0) > 0"
                  class="text-purple-600"
                >缓存创建: <span class="font-medium">{{ formatNumber(dashboardData.totalCacheCreateTokens || 0) }}</span></span>
                <span
                  v-if="(dashboardData.totalCacheReadTokens || 0) > 0"
                  class="text-purple-600"
                >缓存读取: <span class="font-medium">{{ formatNumber(dashboardData.totalCacheReadTokens || 0) }}</span></span>
              </div>
            </div>
          </div>
          <div class="stat-icon flex-shrink-0 bg-gradient-to-br from-emerald-500 to-emerald-600">
            <i class="fas fa-database" />
          </div>
        </div>
      </div>

      <div class="stat-card">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-xs sm:text-sm font-semibold text-gray-600 mb-1">
              实时RPM 
              <span class="text-xs text-gray-400">({{ dashboardData.metricsWindow }}分钟)</span>
            </p>
            <p class="text-2xl sm:text-3xl font-bold text-orange-600">
              {{ dashboardData.realtimeRPM || 0 }}
            </p>
            <p class="text-xs text-gray-500 mt-1">
              每分钟请求数
              <span
                v-if="dashboardData.isHistoricalMetrics"
                class="text-yellow-600"
              >
                <i class="fas fa-exclamation-circle" /> 历史数据
              </span>
            </p>
          </div>
          <div class="stat-icon flex-shrink-0 bg-gradient-to-br from-orange-500 to-orange-600">
            <i class="fas fa-tachometer-alt" />
          </div>
        </div>
      </div>

      <div class="stat-card">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-xs sm:text-sm font-semibold text-gray-600 mb-1">
              实时TPM 
              <span class="text-xs text-gray-400">({{ dashboardData.metricsWindow }}分钟)</span>
            </p>
            <p class="text-2xl sm:text-3xl font-bold text-rose-600">
              {{ formatNumber(dashboardData.realtimeTPM || 0) }}
            </p>
            <p class="text-xs text-gray-500 mt-1">
              每分钟Token数
              <span
                v-if="dashboardData.isHistoricalMetrics"
                class="text-yellow-600"
              >
                <i class="fas fa-exclamation-circle" /> 历史数据
              </span>
            </p>
          </div>
          <div class="stat-icon flex-shrink-0 bg-gradient-to-br from-rose-500 to-rose-600">
            <i class="fas fa-rocket" />
          </div>
        </div>
      </div>
    </div>

    <!-- 模型消费统计 -->
    <div class="mb-8">
      <div class="flex flex-col gap-4 mb-4 sm:mb-6">
        <h3 class="text-lg sm:text-xl font-bold text-gray-900">
          模型使用分布与Token使用趋势
        </h3>
        <div class="flex flex-col lg:flex-row gap-2 lg:items-center lg:justify-end">
          <!-- 快捷日期选择 -->
          <div class="flex gap-1 bg-gray-100 rounded-lg p-1 overflow-x-auto flex-shrink-0">
            <button 
              v-for="option in dateFilter.presetOptions" 
              :key="option.value"
              :class="[
                'px-3 py-1 rounded-md text-sm font-medium transition-colors',
                dateFilter.preset === option.value && dateFilter.type === 'preset'
                  ? 'bg-white text-blue-600 shadow-sm' 
                  : 'text-gray-600 hover:text-gray-900'
              ]"
              @click="setDateFilterPreset(option.value)"
            >
              {{ option.label }}
            </button>
          </div>
          
          <!-- 粒度切换按钮 -->
          <div class="flex gap-1 bg-gray-100 rounded-lg p-1">
            <button 
              :class="[
                'px-3 py-1 rounded-md text-sm font-medium transition-colors',
                trendGranularity === 'day'
                  ? 'bg-white text-blue-600 shadow-sm' 
                  : 'text-gray-600 hover:text-gray-900'
              ]"
              @click="setTrendGranularity('day')"
            >
              <i class="fas fa-calendar-day mr-1" />按天
            </button>
            <button 
              :class="[
                'px-3 py-1 rounded-md text-sm font-medium transition-colors',
                trendGranularity === 'hour'
                  ? 'bg-white text-blue-600 shadow-sm' 
                  : 'text-gray-600 hover:text-gray-900'
              ]"
              @click="setTrendGranularity('hour')"
            >
              <i class="fas fa-clock mr-1" />按小时
            </button>
          </div>
          
          <!-- Element Plus 日期范围选择器 -->
          <div class="flex items-center gap-2">
            <el-date-picker
              v-model="dateFilter.customRange"
              :default-time="defaultTime"
              type="datetimerange"
              range-separator="至"
              start-placeholder="开始日期"
              end-placeholder="结束日期"
              format="YYYY-MM-DD HH:mm:ss"
              value-format="YYYY-MM-DD HH:mm:ss"
              :disabled-date="disabledDate"
              size="default"
              class="w-full lg:w-auto custom-date-picker"
              style="max-width: 400px;"
              @change="onCustomDateRangeChange"
            />
            <span
              v-if="trendGranularity === 'hour'"
              class="text-xs text-orange-600"
            >
              <i class="fas fa-info-circle" /> 最多24小时
            </span>
          </div>
          
          <!-- 刷新控制 -->
          <div class="flex items-center gap-2">
            <!-- 自动刷新控制 -->
            <div class="flex items-center bg-gray-100 rounded-lg px-3 py-1">
              <label class="relative inline-flex items-center cursor-pointer">
                <input 
                  v-model="autoRefreshEnabled" 
                  type="checkbox"
                  class="sr-only peer"
                >
                <!-- 更小的开关 -->
                <div class="relative w-9 h-5 bg-gray-300 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:bg-blue-500 transition-all duration-200 after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:w-4 after:h-4 after:rounded-full after:shadow-sm after:transition-transform after:duration-200 peer-checked:after:translate-x-4" />
                <span class="ml-2.5 text-sm font-medium text-gray-600 select-none flex items-center gap-1">
                  <i class="fas fa-redo-alt text-xs text-gray-500" />
                  <span>自动刷新</span>
                  <span
                    v-if="autoRefreshEnabled"
                    class="ml-1 text-xs text-blue-600 font-mono transition-opacity"
                    :class="refreshCountdown > 0 ? 'opacity-100' : 'opacity-0'"
                  >
                    {{ refreshCountdown }}s
                  </span>
                </span>
              </label>
            </div>
            
            <!-- 刷新按钮 -->
            <button 
              :disabled="isRefreshing" 
              class="px-3 py-1 rounded-md text-sm font-medium transition-colors bg-white text-blue-600 shadow-sm hover:bg-gray-50 border border-gray-300 flex items-center gap-1 sm:gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              title="立即刷新数据"
              @click="refreshAllData()"
            >
              <i :class="['fas fa-sync-alt text-xs', { 'animate-spin': isRefreshing }]" />
              <span class="hidden sm:inline">{{ isRefreshing ? '刷新中' : '刷新' }}</span>
            </button>
          </div>
        </div>
      </div>
      
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <!-- 饼图 -->
        <div class="card p-4 sm:p-6">
          <h4 class="text-base sm:text-lg font-semibold text-gray-800 mb-4">
            Token使用分布
          </h4>
          <div
            class="relative"
            style="height: 250px;"
          >
            <canvas ref="modelUsageChart" />
          </div>
        </div>
        
        <!-- 详细数据表格 -->
        <div class="card p-4 sm:p-6">
          <h4 class="text-base sm:text-lg font-semibold text-gray-800 mb-4">
            详细统计数据
          </h4>
          <div
            v-if="dashboardModelStats.length === 0"
            class="text-center py-8"
          >
            <p class="text-gray-500 text-sm sm:text-base">
              暂无模型使用数据
            </p>
          </div>
          <div
            v-else
            class="overflow-auto max-h-[250px] sm:max-h-[300px]"
          >
            <table class="min-w-full">
              <thead class="bg-gray-50 sticky top-0">
                <tr>
                  <th class="px-2 sm:px-4 py-2 text-left text-xs font-medium text-gray-700">
                    模型
                  </th>
                  <th class="px-2 sm:px-4 py-2 text-right text-xs font-medium text-gray-700 hidden sm:table-cell">
                    请求数
                  </th>
                  <th class="px-2 sm:px-4 py-2 text-right text-xs font-medium text-gray-700">
                    总Token
                  </th>
                  <th class="px-2 sm:px-4 py-2 text-right text-xs font-medium text-gray-700">
                    费用
                  </th>
                  <th class="px-2 sm:px-4 py-2 text-right text-xs font-medium text-gray-700 hidden sm:table-cell">
                    占比
                  </th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-200">
                <tr
                  v-for="stat in dashboardModelStats"
                  :key="stat.model"
                  class="hover:bg-gray-50"
                >
                  <td class="px-2 sm:px-4 py-2 text-xs sm:text-sm text-gray-900">
                    <span
                      class="block truncate max-w-[100px] sm:max-w-none"
                      :title="stat.model"
                    >
                      {{ stat.model }}
                    </span>
                  </td>
                  <td class="px-2 sm:px-4 py-2 text-xs sm:text-sm text-gray-600 text-right hidden sm:table-cell">
                    {{ formatNumber(stat.requests) }}
                  </td>
                  <td class="px-2 sm:px-4 py-2 text-xs sm:text-sm text-gray-600 text-right">
                    {{ formatNumber(stat.allTokens) }}
                  </td>
                  <td class="px-2 sm:px-4 py-2 text-xs sm:text-sm text-green-600 text-right font-medium">
                    {{ stat.formatted ? stat.formatted.total : '$0.000000' }}
                  </td>
                  <td class="px-2 sm:px-4 py-2 text-xs sm:text-sm font-medium text-right hidden sm:table-cell">
                    <span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      {{ calculatePercentage(stat.allTokens, dashboardModelStats) }}%
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>

    <!-- Token使用趋势图 -->
    <div class="mb-4 sm:mb-6 md:mb-8">
      <div class="card p-4 sm:p-6">
        <div
          style="height: 250px;"
          class="sm:h-[300px]"
        >
          <canvas ref="usageTrendChart" />
        </div>
      </div>
    </div>
    
    <!-- API Keys 使用趋势图 -->
    <div class="mb-4 sm:mb-6 md:mb-8">
      <div class="card p-4 sm:p-6">
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <h3 class="text-base sm:text-lg font-semibold text-gray-900">
            API Keys 使用趋势
          </h3>
          <!-- 维度切换按钮 -->
          <div class="flex gap-1 bg-gray-100 rounded-lg p-1">
            <button 
              :class="[
                'px-2 sm:px-3 py-1 rounded-md text-xs sm:text-sm font-medium transition-colors',
                apiKeysTrendMetric === 'requests'
                  ? 'bg-white text-blue-600 shadow-sm' 
                  : 'text-gray-600 hover:text-gray-900'
              ]"
              @click="apiKeysTrendMetric = 'requests'; updateApiKeysUsageTrendChart()"
            >
              <i class="fas fa-exchange-alt mr-1" /><span class="hidden sm:inline">请求次数</span><span class="sm:hidden">请求</span>
            </button>
            <button 
              :class="[
                'px-2 sm:px-3 py-1 rounded-md text-xs sm:text-sm font-medium transition-colors',
                apiKeysTrendMetric === 'tokens'
                  ? 'bg-white text-blue-600 shadow-sm' 
                  : 'text-gray-600 hover:text-gray-900'
              ]"
              @click="apiKeysTrendMetric = 'tokens'; updateApiKeysUsageTrendChart()"
            >
              <i class="fas fa-coins mr-1" /><span class="hidden sm:inline">Token 数量</span><span class="sm:hidden">Token</span>
            </button>
          </div>
        </div>
        <div class="mb-4 text-xs sm:text-sm text-gray-600">
          <span v-if="apiKeysTrendData.totalApiKeys > 10">
            共 {{ apiKeysTrendData.totalApiKeys }} 个 API Key，显示使用量前 10 个
          </span>
          <span v-else>
            共 {{ apiKeysTrendData.totalApiKeys }} 个 API Key
          </span>
        </div>
        <div
          style="height: 300px;"
          class="sm:h-[350px]"
        >
          <canvas ref="apiKeysUsageTrendChart" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, nextTick, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useDashboardStore } from '@/stores/dashboard'
import Chart from 'chart.js/auto'

const dashboardStore = useDashboardStore()
const {
  dashboardData,
  costsData,
  dashboardModelStats,
  trendData,
  apiKeysTrendData,
  formattedUptime,
  dateFilter,
  trendGranularity,
  apiKeysTrendMetric,
  defaultTime
} = storeToRefs(dashboardStore)

const {
  loadDashboardData,
  loadApiKeysTrend,
  setDateFilterPreset,
  onCustomDateRangeChange,
  setTrendGranularity,
  refreshChartsData,
  disabledDate
} = dashboardStore

// Chart 实例
const modelUsageChart = ref(null)
const usageTrendChart = ref(null)
const apiKeysUsageTrendChart = ref(null)
let modelUsageChartInstance = null
let usageTrendChartInstance = null
let apiKeysUsageTrendChartInstance = null

// 自动刷新相关
const autoRefreshEnabled = ref(false)
const autoRefreshInterval = ref(30) // 秒
const autoRefreshTimer = ref(null)
const refreshCountdown = ref(0)
const countdownTimer = ref(null)
const isRefreshing = ref(false)

// 计算倒计时显示
const refreshCountdownDisplay = computed(() => {
  if (!autoRefreshEnabled.value || refreshCountdown.value <= 0) return ''
  return `${refreshCountdown.value}秒后刷新`
})

// 格式化数字
function formatNumber(num) {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(2) + 'M'
  } else if (num >= 1000) {
    return (num / 1000).toFixed(2) + 'K'
  }
  return num.toString()
}

// 计算百分比
function calculatePercentage(value, stats) {
  if (!stats || stats.length === 0) return 0
  const total = stats.reduce((sum, stat) => sum + stat.allTokens, 0)
  if (total === 0) return 0
  return ((value / total) * 100).toFixed(1)
}

// 创建模型使用饼图
function createModelUsageChart() {
  if (!modelUsageChart.value) return
  
  if (modelUsageChartInstance) {
    modelUsageChartInstance.destroy()
  }
  
  const data = dashboardModelStats.value || []
  const chartData = {
    labels: data.map(d => d.model),
    datasets: [{
      data: data.map(d => d.allTokens),
      backgroundColor: [
        '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
        '#EC4899', '#14B8A6', '#F97316', '#6366F1', '#84CC16'
      ],
      borderWidth: 0
    }]
  }
  
  modelUsageChartInstance = new Chart(modelUsageChart.value, {
    type: 'doughnut',
    data: chartData,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            padding: 15,
            usePointStyle: true,
            font: {
              size: 12
            }
          }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const label = context.label || ''
              const value = formatNumber(context.parsed)
              const percentage = calculatePercentage(context.parsed, data)
              return `${label}: ${value} (${percentage}%)`
            }
          }
        }
      }
    }
  })
}

// 创建使用趋势图
function createUsageTrendChart() {
  if (!usageTrendChart.value) return
  
  if (usageTrendChartInstance) {
    usageTrendChartInstance.destroy()
  }
  
  const data = trendData.value || []
  
  // 准备多维度数据
  const inputData = data.map(d => d.inputTokens || 0)
  const outputData = data.map(d => d.outputTokens || 0)
  const cacheCreateData = data.map(d => d.cacheCreateTokens || 0)
  const cacheReadData = data.map(d => d.cacheReadTokens || 0)
  const requestsData = data.map(d => d.requests || 0)
  const costData = data.map(d => d.cost || 0)
  
  // 根据数据类型确定标签字段和格式
  const labelField = data[0]?.date ? 'date' : 'hour'
  const labels = data.map(d => {
    // 优先使用后端提供的label字段
    if (d.label) {
      return d.label
    }
    
    if (labelField === 'hour') {
      // 格式化小时显示
      const date = new Date(d.hour)
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      const hour = String(date.getHours()).padStart(2, '0')
      return `${month}/${day} ${hour}:00`
    }
    // 按天显示时，只显示月/日，不显示年份
    const dateStr = d.date
    if (dateStr && dateStr.includes('-')) {
      const parts = dateStr.split('-')
      if (parts.length >= 3) {
        return `${parts[1]}/${parts[2]}`
      }
    }
    return d.date
  })
  
  const chartData = {
    labels: labels,
    datasets: [
      {
        label: '输入Token',
        data: inputData,
        borderColor: 'rgb(102, 126, 234)',
        backgroundColor: 'rgba(102, 126, 234, 0.1)',
        tension: 0.3
      },
      {
        label: '输出Token',
        data: outputData,
        borderColor: 'rgb(240, 147, 251)',
        backgroundColor: 'rgba(240, 147, 251, 0.1)',
        tension: 0.3
      },
      {
        label: '缓存创建Token',
        data: cacheCreateData,
        borderColor: 'rgb(59, 130, 246)',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        tension: 0.3
      },
      {
        label: '缓存读取Token',
        data: cacheReadData,
        borderColor: 'rgb(147, 51, 234)',
        backgroundColor: 'rgba(147, 51, 234, 0.1)',
        tension: 0.3
      },
      {
        label: '费用 (USD)',
        data: costData,
        borderColor: 'rgb(34, 197, 94)',
        backgroundColor: 'rgba(34, 197, 94, 0.1)',
        tension: 0.3,
        yAxisID: 'y2'
      },
      {
        label: '请求数',
        data: requestsData,
        borderColor: 'rgb(16, 185, 129)',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        tension: 0.3,
        yAxisID: 'y1'
      }
    ]
  }
  
  usageTrendChartInstance = new Chart(usageTrendChart.value, {
    type: 'line',
    data: chartData,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false,
      },
      plugins: {
        title: {
          display: true,
          text: 'Token使用趋势',
          font: {
            size: 16,
            weight: 'bold'
          }
        },
        legend: {
          position: 'top',
        },
        tooltip: {
          mode: 'index',
          intersect: false,
          itemSort: function(a, b) {
            // 按值倒序排列，费用和请求数特殊处理
            const aLabel = a.dataset.label || ''
            const bLabel = b.dataset.label || ''
            
            // 费用和请求数使用不同的轴，单独处理
            if (aLabel === '费用 (USD)' || bLabel === '费用 (USD)') {
              return aLabel === '费用 (USD)' ? -1 : 1
            }
            if (aLabel === '请求数' || bLabel === '请求数') {
              return aLabel === '请求数' ? 1 : -1
            }
            
            // 其他按token值倒序
            return b.parsed.y - a.parsed.y
          },
          callbacks: {
            label: function(context) {
              const label = context.dataset.label || ''
              let value = context.parsed.y
              
              if (label === '费用 (USD)') {
                // 格式化费用显示
                if (value < 0.01) {
                  return label + ': $' + value.toFixed(6)
                } else {
                  return label + ': $' + value.toFixed(4)
                }
              } else if (label === '请求数') {
                return label + ': ' + value.toLocaleString() + ' 次'
              } else {
                // 格式化token数显示
                if (value >= 1000000) {
                  return label + ': ' + (value / 1000000).toFixed(2) + 'M tokens'
                } else if (value >= 1000) {
                  return label + ': ' + (value / 1000).toFixed(2) + 'K tokens'
                } else {
                  return label + ': ' + value.toLocaleString() + ' tokens'
                }
              }
            }
          }
        }
      },
      scales: {
        x: {
          type: 'category',
          display: true,
          title: {
            display: true,
            text: trendGranularity.value === 'hour' ? '时间' : '日期'
          }
        },
        y: {
          type: 'linear',
          display: true,
          position: 'left',
          title: {
            display: true,
            text: 'Token数量'
          },
          ticks: {
            callback: function(value) {
              return formatNumber(value)
            }
          }
        },
        y1: {
          type: 'linear',
          display: true,
          position: 'right',
          title: {
            display: true,
            text: '请求数'
          },
          grid: {
            drawOnChartArea: false,
          },
          ticks: {
            callback: function(value) {
              return value.toLocaleString()
            }
          }
        },
        y2: {
          type: 'linear',
          display: false, // 隐藏费用轴，在tooltip中显示
          position: 'right'
        }
      }
    }
  })
}

// 创建API Keys使用趋势图
function createApiKeysUsageTrendChart() {
  if (!apiKeysUsageTrendChart.value) return
  
  if (apiKeysUsageTrendChartInstance) {
    apiKeysUsageTrendChartInstance.destroy()
  }
  
  const data = apiKeysTrendData.value.data || []
  const metric = apiKeysTrendMetric.value
  
  // 颜色数组
  const colors = [
    '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
    '#EC4899', '#14B8A6', '#F97316', '#6366F1', '#84CC16'
  ]
  
  // 准备数据集
  const datasets = apiKeysTrendData.value.topApiKeys?.map((apiKeyId, index) => {
    const data = apiKeysTrendData.value.data.map(item => {
      if (!item.apiKeys || !item.apiKeys[apiKeyId]) return 0
      return metric === 'tokens' 
        ? item.apiKeys[apiKeyId].tokens 
        : item.apiKeys[apiKeyId].requests || 0
    })
    
    // 获取API Key名称
    const apiKeyName = apiKeysTrendData.value.data.find(item => 
      item.apiKeys && item.apiKeys[apiKeyId]
    )?.apiKeys[apiKeyId]?.name || `API Key ${apiKeyId}`
    
    return {
      label: apiKeyName,
      data: data,
      borderColor: colors[index % colors.length],
      backgroundColor: colors[index % colors.length] + '20',
      tension: 0.4,
      fill: false
    }
  }) || []
  
  // 根据数据类型确定标签字段
  const labelField = data[0]?.date ? 'date' : 'hour'
  
  const chartData = {
    labels: data.map(d => {
      // 优先使用后端提供的label字段
      if (d.label) {
        return d.label
      }
      
      if (labelField === 'hour') {
        // 格式化小时显示
        const date = new Date(d.hour)
        const month = String(date.getMonth() + 1).padStart(2, '0')
        const day = String(date.getDate()).padStart(2, '0')
        const hour = String(date.getHours()).padStart(2, '0')
        return `${month}/${day} ${hour}:00`
      }
      // 按天显示时，只显示月/日，不显示年份
      const dateStr = d.date
      if (dateStr && dateStr.includes('-')) {
        const parts = dateStr.split('-')
        if (parts.length >= 3) {
          return `${parts[1]}/${parts[2]}`
        }
      }
      return d.date
    }),
    datasets: datasets
  }
  
  apiKeysUsageTrendChartInstance = new Chart(apiKeysUsageTrendChart.value, {
    type: 'line',
    data: chartData,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            padding: 20,
            usePointStyle: true,
            font: {
              size: 12
            }
          }
        },
        tooltip: {
          mode: 'index',
          intersect: false,
          itemSort: function(a, b) {
            // 按值倒序排列
            return b.parsed.y - a.parsed.y
          },
          callbacks: {
            label: function(context) {
              const label = context.dataset.label || ''
              const value = context.parsed.y
              const dataIndex = context.dataIndex
              const dataPoint = apiKeysTrendData.value.data[dataIndex]
              
              // 获取所有数据集在这个时间点的值，用于排名
              const allValues = context.chart.data.datasets.map((dataset, idx) => ({
                value: dataset.data[dataIndex] || 0,
                index: idx
              })).sort((a, b) => b.value - a.value)
              
              // 找出当前数据集的排名
              const rank = allValues.findIndex(item => item.index === context.datasetIndex) + 1
              
              // 准备排名标识
              let rankIcon = ''
              if (rank === 1) rankIcon = '🥇 '
              else if (rank === 2) rankIcon = '🥈 '
              else if (rank === 3) rankIcon = '🥉 '
              
              if (apiKeysTrendMetric.value === 'tokens') {
                // 格式化token显示
                let formattedValue = ''
                if (value >= 1000000) {
                  formattedValue = (value / 1000000).toFixed(2) + 'M'
                } else if (value >= 1000) {
                  formattedValue = (value / 1000).toFixed(2) + 'K'
                } else {
                  formattedValue = value.toLocaleString()
                }
                
                // 获取对应API Key的费用信息
                const apiKeyId = apiKeysTrendData.value.topApiKeys[context.datasetIndex]
                const apiKeyData = dataPoint?.apiKeys?.[apiKeyId]
                const cost = apiKeyData?.formattedCost || '$0.00'
                
                return `${rankIcon}${label}: ${formattedValue} tokens (${cost})`
              } else {
                return `${rankIcon}${label}: ${value.toLocaleString()} 次`
              }
            }
          }
        }
      },
      scales: {
        x: {
          type: 'category',
          display: true,
          title: {
            display: true,
            text: trendGranularity.value === 'hour' ? '时间' : '日期'
          }
        },
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: apiKeysTrendMetric.value === 'tokens' ? 'Token 数量' : '请求次数'
          },
          ticks: {
            callback: function(value) {
              return formatNumber(value)
            }
          }
        }
      }
    }
  })
}

// 更新API Keys使用趋势图
async function updateApiKeysUsageTrendChart() {
  await loadApiKeysTrend(apiKeysTrendMetric.value)
  await nextTick()
  createApiKeysUsageTrendChart()
}

// 监听数据变化更新图表
watch(dashboardModelStats, () => {
  nextTick(() => createModelUsageChart())
})

watch(trendData, () => {
  nextTick(() => createUsageTrendChart())
})

watch(apiKeysTrendData, () => {
  nextTick(() => createApiKeysUsageTrendChart())
})

// 刷新所有数据
async function refreshAllData() {
  if (isRefreshing.value) return
  
  isRefreshing.value = true
  try {
    await Promise.all([
      loadDashboardData(),
      refreshChartsData()
    ])
  } finally {
    isRefreshing.value = false
  }
}

// 启动自动刷新
function startAutoRefresh() {
  if (!autoRefreshEnabled.value) return
  
  // 重置倒计时
  refreshCountdown.value = autoRefreshInterval.value
  
  // 清除现有定时器
  if (countdownTimer.value) {
    clearInterval(countdownTimer.value)
  }
  if (autoRefreshTimer.value) {
    clearTimeout(autoRefreshTimer.value)
  }
  
  // 启动倒计时
  countdownTimer.value = setInterval(() => {
    refreshCountdown.value--
    if (refreshCountdown.value <= 0) {
      clearInterval(countdownTimer.value)
    }
  }, 1000)
  
  // 设置刷新定时器
  autoRefreshTimer.value = setTimeout(async () => {
    await refreshAllData()
    // 递归调用以继续自动刷新
    if (autoRefreshEnabled.value) {
      startAutoRefresh()
    }
  }, autoRefreshInterval.value * 1000)
}

// 停止自动刷新
function stopAutoRefresh() {
  if (countdownTimer.value) {
    clearInterval(countdownTimer.value)
    countdownTimer.value = null
  }
  if (autoRefreshTimer.value) {
    clearTimeout(autoRefreshTimer.value)
    autoRefreshTimer.value = null
  }
  refreshCountdown.value = 0
}

// 切换自动刷新
function toggleAutoRefresh() {
  autoRefreshEnabled.value = !autoRefreshEnabled.value
  if (autoRefreshEnabled.value) {
    startAutoRefresh()
  } else {
    stopAutoRefresh()
  }
}

// 监听自动刷新状态变化
watch(autoRefreshEnabled, (newVal) => {
  if (newVal) {
    startAutoRefresh()
  } else {
    stopAutoRefresh()
  }
})

// 初始化
onMounted(async () => {
  // 加载所有数据
  await refreshAllData()
  
  // 创建图表
  await nextTick()
  createModelUsageChart()
  createUsageTrendChart()
  createApiKeysUsageTrendChart()
})

// 清理
onUnmounted(() => {
  stopAutoRefresh()
  // 销毁图表实例
  if (modelUsageChartInstance) {
    modelUsageChartInstance.destroy()
  }
  if (usageTrendChartInstance) {
    usageTrendChartInstance.destroy()
  }
  if (apiKeysUsageTrendChartInstance) {
    apiKeysUsageTrendChartInstance.destroy()
  }
})
</script>

<style scoped>
/* 自定义日期选择器样式 */
.custom-date-picker :deep(.el-input__inner) {
  @apply bg-white border-gray-300 focus:border-blue-500 focus:ring-blue-500;
  font-size: 13px;
  padding: 0 10px;
}

.custom-date-picker :deep(.el-range-separator) {
  @apply text-gray-500;
  padding: 0 2px;
}

.custom-date-picker :deep(.el-range-input) {
  font-size: 13px;
}

/* 旋转动画 */
@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.animate-spin {
  animation: spin 1s linear infinite;
}
</style>