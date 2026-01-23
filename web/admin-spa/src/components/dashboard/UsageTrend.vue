<template>
  <div class="glass-strong mb-8 rounded-3xl p-6">
    <div class="mb-6 flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
      <h2 class="flex items-center text-xl font-bold text-gray-800">
        <i class="fas fa-chart-area mr-2 text-blue-500" />
        使用趋势
      </h2>

      <div class="flex items-center gap-3">
        <el-radio-group v-model="granularity" size="small" @change="handleGranularityChange">
          <el-radio-button label="day"> 按天 </el-radio-button>
          <el-radio-button label="hour"> 按小时 </el-radio-button>
        </el-radio-group>

        <el-select
          v-model="trendPeriod"
          size="small"
          style="width: 120px"
          @change="handlePeriodChange"
        >
          <el-option
            v-for="period in periodOptions"
            :key="period.days"
            :label="`最近${period.days}天`"
            :value="period.days"
          />
        </el-select>
      </div>
    </div>

    <div class="relative" style="height: 300px">
      <canvas ref="chartCanvas" />
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { Chart } from 'chart.js/auto'
import { useDashboardStore } from '@/stores/dashboard'
import { useChartConfig } from '@/utils/useChartConfig'
import { useThemeStore } from '@/stores/theme'

const dashboardStore = useDashboardStore()
const themeStore = useThemeStore()
const chartCanvas = ref(null)
let chart = null

const trendPeriod = ref(7)
const granularity = ref('day')

const periodOptions = [
  { days: 1, label: '24小时' },
  { days: 7, label: '7天' },
  { days: 30, label: '30天' }
]

const createChart = () => {
  if (!chartCanvas.value || !dashboardStore.trendData.length) return

  if (chart) {
    chart.destroy()
  }

  const { getGradient } = useChartConfig()
  const ctx = chartCanvas.value.getContext('2d')

  const labels = dashboardStore.trendData.map((item) => {
    if (granularity.value === 'hour') {
      // 小时粒度使用hour字段
      const date = new Date(item.hour)
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      const hour = String(date.getHours()).padStart(2, '0')
      return `${month}/${day} ${hour}:00`
    }
    return item.date
  })

  chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: '请求次数',
          data: dashboardStore.trendData.map((item) => item.requests),
          borderColor: themeStore.currentColorScheme.primary,
          backgroundColor: getGradient(ctx, themeStore.currentColorScheme.primary, 0.1),
          yAxisID: 'y',
          tension: 0.4
        },
        {
          label: 'Token使用量',
          data: dashboardStore.trendData.map((item) => item.tokens),
          borderColor: themeStore.currentColorScheme.accent,
          backgroundColor: getGradient(ctx, themeStore.currentColorScheme.accent, 0.1),
          yAxisID: 'y1',
          tension: 0.4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: {
          position: 'top'
        },
        tooltip: {
          mode: 'index',
          intersect: false
        }
      },
      scales: {
        x: {
          display: true,
          grid: {
            display: false
          }
        },
        y: {
          type: 'linear',
          display: true,
          position: 'left',
          title: {
            display: true,
            text: '请求次数'
          }
        },
        y1: {
          type: 'linear',
          display: true,
          position: 'right',
          title: {
            display: true,
            text: 'Token使用量'
          },
          grid: {
            drawOnChartArea: false
          }
        }
      }
    }
  })
}

const handlePeriodChange = async () => {
  await dashboardStore.loadUsageTrend(trendPeriod.value, granularity.value)
  createChart()
}

const handleGranularityChange = async () => {
  // 根据粒度调整时间范围
  if (granularity.value === 'hour' && trendPeriod.value > 7) {
    trendPeriod.value = 1
  }
  await dashboardStore.loadUsageTrend(trendPeriod.value, granularity.value)
  createChart()
}

watch(
  () => dashboardStore.trendData,
  () => {
    createChart()
  },
  { deep: true }
)

// 监听色系变化，重新创建图表
watch(
  () => themeStore.colorScheme,
  () => {
    createChart()
  }
)

onMounted(() => {
  createChart()
})

onUnmounted(() => {
  if (chart) {
    chart.destroy()
  }
})
</script>
