<template>
  <div class="glass-strong mb-8 rounded-3xl p-6">
    <div class="mb-6 flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
      <h2 class="flex items-center text-xl font-bold text-gray-800">
        <i class="fas fa-chart-area mr-2 text-blue-500" />
        {{ t('dashboardComponents.usageTrend.title') }}
      </h2>

      <div class="flex items-center gap-3">
        <el-radio-group v-model="granularity" size="small" @change="handleGranularityChange">
          <el-radio-button label="day">
            {{ t('dashboardComponents.usageTrend.byDay') }}
          </el-radio-button>
          <el-radio-button label="hour">
            {{ t('dashboardComponents.usageTrend.byHour') }}
          </el-radio-button>
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
            :label="period.label"
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
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Chart } from 'chart.js/auto'
import { useDashboardStore } from '@/stores/dashboard'
import { useChartConfig } from '@/utils/useChartConfig'
import { useThemeStore } from '@/stores/theme'

const dashboardStore = useDashboardStore()
const themeStore = useThemeStore()
const { t } = useI18n()
const chartCanvas = ref(null)
let chart = null

const trendPeriod = ref(7)
const granularity = ref('day')

const periodOptions = computed(() => [
  { days: 1, label: t('dashboardComponents.usageTrend.twentyFourHours') },
  { days: 7, label: t('dashboardComponents.usageTrend.recentDays', { count: 7 }) },
  { days: 30, label: t('dashboardComponents.usageTrend.recentDays', { count: 30 }) }
])

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
          label: t('dashboardComponents.usageTrend.requestCount'),
          data: dashboardStore.trendData.map((item) => item.requests),
          borderColor: themeStore.currentColorScheme.primary,
          backgroundColor: getGradient(ctx, themeStore.currentColorScheme.primary, 0.1),
          yAxisID: 'y',
          tension: 0.4
        },
        {
          label: t('dashboardComponents.usageTrend.tokenUsage'),
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
            text: t('dashboardComponents.usageTrend.requestCount')
          }
        },
        y1: {
          type: 'linear',
          display: true,
          position: 'right',
          title: {
            display: true,
            text: t('dashboardComponents.usageTrend.tokenUsage')
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
