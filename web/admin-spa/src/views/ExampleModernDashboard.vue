<template>
  <div class="animate-fade-in-up space-y-6 p-6">
    <!-- 页面标题 -->
    <div class="mb-8">
      <h1 class="mb-2 bg-gradient-to-r from-primary-600 to-secondary-600 bg-clip-text text-3xl font-bold text-transparent">
        系统概览
      </h1>
      <p class="text-gray-600 dark:text-gray-400">
        实时监控系统状态和性能指标
      </p>
    </div>

    <!-- 统计卡片网格 - 使用新的 AnimatedStatCard -->
    <div class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
      <AnimatedStatCard
        title="总 API Keys"
        :value="stats.totalApiKeys"
        subtitle="活跃: 25 个"
        icon="fas fa-key"
        variant="primary"
        trend="+12%"
        trend-direction="up"
        trend-text="比上周"
      />

      <AnimatedStatCard
        title="服务账户"
        :value="stats.totalAccounts"
        subtitle="正常: 18 个"
        icon="fas fa-user-circle"
        variant="success"
        trend="+5"
        trend-direction="up"
        trend-text="新增账户"
      />

      <AnimatedStatCard
        title="今日请求"
        :value="formatNumber(stats.todayRequests)"
        :subtitle="`总请求: ${formatNumber(stats.totalRequests)}`"
        icon="fas fa-chart-line"
        variant="info"
        trend="+35%"
        trend-direction="up"
        trend-text="比昨天"
      />

      <AnimatedStatCard
        title="系统状态"
        value="运行中"
        subtitle="正常运行"
        icon="fas fa-heartbeat"
        variant="warning"
      />
    </div>

    <!-- Token 统计和费用 - 使用 GlassCard -->
    <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <GlassCard hover variant="primary">
        <div class="flex items-center justify-between">
          <div>
            <p class="mb-1 text-sm font-semibold text-gray-600 dark:text-gray-400">
              今日 Token 消耗
            </p>
            <p class="mb-2 text-3xl font-bold text-primary-600 dark:text-primary-400">
              {{ formatNumber(stats.todayTokens) }}
            </p>
            <div class="flex gap-4 text-xs text-gray-600 dark:text-gray-400">
              <span>输入: {{ formatNumber(stats.todayInputTokens) }}</span>
              <span>输出: {{ formatNumber(stats.todayOutputTokens) }}</span>
            </div>
          </div>
          <div class="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-500 to-primary-600 text-3xl text-white shadow-lg">
            <i class="fas fa-coins"></i>
          </div>
        </div>

        <!-- 进度条 -->
        <div class="mt-4">
          <div class="mb-1 flex justify-between text-xs">
            <span class="text-gray-600 dark:text-gray-400">使用进度</span>
            <span class="font-medium text-primary-600 dark:text-primary-400">75%</span>
          </div>
          <div class="h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
            <div
              class="h-full rounded-full bg-gradient-to-r from-primary-500 to-primary-600 transition-all duration-500"
              style="width: 75%"
            ></div>
          </div>
        </div>
      </GlassCard>

      <GlassCard hover variant="secondary">
        <div class="flex items-center justify-between">
          <div>
            <p class="mb-1 text-sm font-semibold text-gray-600 dark:text-gray-400">
              今日费用
            </p>
            <p class="mb-2 text-3xl font-bold text-green-600 dark:text-green-400">
              $12.50
            </p>
            <div class="flex gap-2">
              <GradientBadge variant="success" size="sm" dot>
                正常
              </GradientBadge>
              <GradientBadge variant="info" size="sm">
                预算内
              </GradientBadge>
            </div>
          </div>
          <div class="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-green-500 to-emerald-600 text-3xl text-white shadow-lg">
            <i class="fas fa-dollar-sign"></i>
          </div>
        </div>
      </GlassCard>
    </div>

    <!-- 操作按钮组 -->
    <GlassCard>
      <h3 class="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
        快速操作
      </h3>
      <div class="flex flex-wrap gap-3">
        <ModernButton variant="primary" size="md" @click="handleAction">
          <template #icon-left>
            <i class="fas fa-plus"></i>
          </template>
          添加账户
        </ModernButton>

        <ModernButton variant="secondary" size="md">
          <template #icon-left>
            <i class="fas fa-key"></i>
          </template>
          创建 API Key
        </ModernButton>

        <ModernButton variant="success" size="md">
          <template #icon-left>
            <i class="fas fa-download"></i>
          </template>
          导出数据
        </ModernButton>

        <ModernButton variant="outline" size="md">
          <template #icon-left>
            <i class="fas fa-cog"></i>
          </template>
          设置
        </ModernButton>

        <ModernButton variant="ghost" size="md">
          <template #icon-left>
            <i class="fas fa-question-circle"></i>
          </template>
          帮助
        </ModernButton>
      </div>
    </GlassCard>

    <!-- 加载状态示例 -->
    <GlassCard v-if="isLoading">
      <div class="py-12">
        <LoadingSpinner type="dots" size="lg" variant="primary" text="加载数据中..." />
      </div>
    </GlassCard>

    <!-- 数据表格 -->
    <GlassCard v-else>
      <div class="mb-4 flex items-center justify-between">
        <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100">
          最近活动
        </h3>
        <ModernButton variant="ghost" size="sm">
          查看全部
        </ModernButton>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full">
          <thead class="border-b border-gray-200 dark:border-gray-700">
            <tr>
              <th class="pb-3 text-left text-sm font-semibold text-gray-600 dark:text-gray-400">
                时间
              </th>
              <th class="pb-3 text-left text-sm font-semibold text-gray-600 dark:text-gray-400">
                操作
              </th>
              <th class="pb-3 text-left text-sm font-semibold text-gray-600 dark:text-gray-400">
                状态
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
            <tr
              v-for="activity in recentActivities"
              :key="activity.id"
              class="transition-colors duration-200 hover:bg-gray-50/50 dark:hover:bg-gray-800/50"
            >
              <td class="py-3 text-sm text-gray-600 dark:text-gray-400">
                {{ activity.time }}
              </td>
              <td class="py-3 text-sm text-gray-900 dark:text-gray-100">
                {{ activity.action }}
              </td>
              <td class="py-3">
                <GradientBadge
                  :variant="activity.status === 'success' ? 'success' : 'warning'"
                  size="sm"
                  dot
                >
                  {{ activity.statusText }}
                </GradientBadge>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </GlassCard>

    <!-- 不同尺寸的按钮示例 -->
    <GlassCard>
      <h3 class="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
        按钮尺寸示例
      </h3>
      <div class="flex flex-wrap items-center gap-3">
        <ModernButton variant="primary" size="xs">Extra Small</ModernButton>
        <ModernButton variant="primary" size="sm">Small</ModernButton>
        <ModernButton variant="primary" size="md">Medium</ModernButton>
        <ModernButton variant="primary" size="lg">Large</ModernButton>
        <ModernButton variant="primary" size="xl">Extra Large</ModernButton>
      </div>
    </GlassCard>

    <!-- 不同变体的徽章示例 -->
    <GlassCard>
      <h3 class="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
        徽章样式示例
      </h3>
      <div class="flex flex-wrap gap-3">
        <GradientBadge variant="default">Default</GradientBadge>
        <GradientBadge variant="primary">Primary</GradientBadge>
        <GradientBadge variant="secondary">Secondary</GradientBadge>
        <GradientBadge variant="success" dot>Success</GradientBadge>
        <GradientBadge variant="warning" dot>Warning</GradientBadge>
        <GradientBadge variant="danger" dot>Danger</GradientBadge>
        <GradientBadge variant="info">Info</GradientBadge>
        <GradientBadge variant="gradient-primary">Gradient Primary</GradientBadge>
        <GradientBadge variant="gradient-secondary">Gradient Secondary</GradientBadge>
      </div>
    </GlassCard>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import GlassCard from '@/components/ui/GlassCard.vue'
import ModernButton from '@/components/ui/ModernButton.vue'
import AnimatedStatCard from '@/components/ui/AnimatedStatCard.vue'
import GradientBadge from '@/components/ui/GradientBadge.vue'
import LoadingSpinner from '@/components/ui/LoadingSpinner.vue'

// 模拟数据
const stats = ref({
  totalApiKeys: 32,
  totalAccounts: 18,
  todayRequests: 15420,
  totalRequests: 1254300,
  todayTokens: 2450000,
  todayInputTokens: 1650000,
  todayOutputTokens: 800000
})

const isLoading = ref(false)

const recentActivities = ref([
  { id: 1, time: '10:25 AM', action: '创建 API Key', status: 'success', statusText: '成功' },
  { id: 2, time: '10:20 AM', action: '添加账户', status: 'success', statusText: '成功' },
  { id: 3, time: '10:15 AM', action: '更新配置', status: 'warning', statusText: '警告' },
  { id: 4, time: '10:10 AM', action: 'Token 刷新', status: 'success', statusText: '成功' },
  { id: 5, time: '10:05 AM', action: '系统备份', status: 'success', statusText: '成功' }
])

// 格式化数字
const formatNumber = (num) => {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(2) + 'M'
  } else if (num >= 1000) {
    return (num / 1000).toFixed(2) + 'K'
  }
  return num.toString()
}

const handleAction = () => {
  console.log('Action clicked')
}
</script>

<style scoped>
/* 可以在这里添加额外的样式 */
</style>
