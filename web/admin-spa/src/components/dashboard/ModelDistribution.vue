<template>
  <div class="glass-strong rounded-3xl p-6">
    <div class="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
      <h2 class="text-xl font-bold text-gray-800 flex items-center">
        <i class="fas fa-robot mr-2 text-purple-500"></i>
        模型使用分布
      </h2>
      
      <el-radio-group v-model="modelPeriod" size="small" @change="handlePeriodChange">
        <el-radio-button label="daily">今日</el-radio-button>
        <el-radio-button label="total">累计</el-radio-button>
      </el-radio-group>
    </div>
    
    <div v-if="dashboardStore.dashboardModelStats.length === 0" class="text-center py-12 text-gray-500">
      <i class="fas fa-chart-pie text-4xl mb-3 opacity-30"></i>
      <p>暂无模型使用数据</p>
    </div>
    
    <div v-else class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- 饼图 -->
      <div class="relative" style="height: 300px;">
        <canvas ref="chartCanvas"></canvas>
      </div>
      
      <!-- 数据列表 -->
      <div class="space-y-3">
        <div v-for="(stat, index) in sortedStats" :key="stat.model" 
             class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
          <div class="flex items-center gap-3">
            <div class="w-4 h-4 rounded" :style="`background-color: ${getColor(index)}`"></div>
            <span class="font-medium text-gray-700">{{ stat.model }}</span>
          </div>
          <div class="text-right">
            <p class="font-semibold text-gray-800">{{ formatNumber(stat.requests) }} 请求</p>
            <p class="text-sm text-gray-500">{{ formatNumber(stat.totalTokens) }} tokens</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { Chart } from 'chart.js/auto'
import { useDashboardStore } from '@/stores/dashboard'
import { useChartConfig } from '@/composables/useChartConfig'
import { formatNumber } from '@/utils/format'

const dashboardStore = useDashboardStore()
const chartCanvas = ref(null)
let chart = null

const modelPeriod = ref('daily')

const sortedStats = computed(() => {
  return [...dashboardStore.dashboardModelStats].sort((a, b) => b.requests - a.requests)
})

const getColor = (index) => {
  const { colorSchemes } = useChartConfig()
  const colors = colorSchemes.primary
  return colors[index % colors.length]
}

const createChart = () => {
  if (!chartCanvas.value || !dashboardStore.dashboardModelStats.length) return
  
  if (chart) {
    chart.destroy()
  }
  
  const { colorSchemes } = useChartConfig()
  const colors = colorSchemes.primary
  
  chart = new Chart(chartCanvas.value, {
    type: 'doughnut',
    data: {
      labels: sortedStats.value.map(stat => stat.model),
      datasets: [{
        data: sortedStats.value.map(stat => stat.requests),
        backgroundColor: sortedStats.value.map((_, index) => colors[index % colors.length]),
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const stat = sortedStats.value[context.dataIndex]
              const percentage = ((stat.requests / dashboardStore.dashboardModelStats.reduce((sum, s) => sum + s.requests, 0)) * 100).toFixed(1)
              return [
                `${stat.model}: ${percentage}%`,
                `请求: ${formatNumber(stat.requests)}`,
                `Tokens: ${formatNumber(stat.totalTokens)}`
              ]
            }
          }
        }
      }
    }
  })
}

const handlePeriodChange = async () => {
  await dashboardStore.loadModelStats(modelPeriod.value)
  createChart()
}

watch(() => dashboardStore.dashboardModelStats, () => {
  createChart()
}, { deep: true })

onMounted(() => {
  createChart()
})

onUnmounted(() => {
  if (chart) {
    chart.destroy()
  }
})
</script>

<style scoped>
/* 组件特定样式 */
</style>