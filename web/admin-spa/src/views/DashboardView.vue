<template>
  <div>
    <!-- 主要统计 -->
    <div
      class="mb-4 grid grid-cols-1 gap-3 sm:mb-6 sm:grid-cols-2 sm:gap-4 md:mb-8 md:gap-6 lg:grid-cols-4"
    >
      <div class="stat-card">
        <div class="flex items-center justify-between">
          <div>
            <p class="mb-1 text-xs font-semibold text-gray-600 dark:text-gray-400 sm:text-sm">
              {{ t('dashboard.totalApiKeys') }}
            </p>
            <p class="text-2xl font-bold text-gray-900 dark:text-gray-100 sm:text-3xl">
              {{ dashboardData.totalApiKeys }}
            </p>
            <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {{ t('dashboard.active') }} {{ dashboardData.activeApiKeys || 0 }}
            </p>
          </div>
          <div class="stat-icon flex-shrink-0 bg-gradient-to-br from-blue-500 to-blue-600">
            <i class="fas fa-key" />
          </div>
        </div>
      </div>

      <div class="stat-card">
        <div class="flex items-center justify-between">
          <div class="flex-1">
            <p class="mb-1 text-xs font-semibold text-gray-600 dark:text-gray-400 sm:text-sm">
              {{ t('dashboard.serviceAccounts') }}
            </p>
            <div class="flex flex-wrap items-baseline gap-x-2">
              <p class="text-2xl font-bold text-gray-900 dark:text-gray-100 sm:text-3xl">
                {{ dashboardData.totalAccounts }}
              </p>
              <!-- 各平台账户数量展示 -->
              <div v-if="dashboardData.accountsByPlatform" class="flex items-center gap-2">
                <!-- Claude账户 -->
                <div
                  v-if="
                    dashboardData.accountsByPlatform.claude &&
                    dashboardData.accountsByPlatform.claude.total > 0
                  "
                  class="inline-flex items-center gap-0.5"
                  :title="platformTitle('Claude', dashboardData.accountsByPlatform.claude)"
                >
                  <i class="fas fa-brain text-xs text-indigo-600" />
                  <span class="text-xs font-medium text-gray-700 dark:text-gray-300">{{
                    dashboardData.accountsByPlatform.claude.total
                  }}</span>
                </div>
                <!-- Claude Console账户 -->
                <div
                  v-if="
                    dashboardData.accountsByPlatform['claude-console'] &&
                    dashboardData.accountsByPlatform['claude-console'].total > 0
                  "
                  class="inline-flex items-center gap-0.5"
                  :title="
                    platformTitle('Console', dashboardData.accountsByPlatform['claude-console'])
                  "
                >
                  <i class="fas fa-terminal text-xs text-purple-600" />
                  <span class="text-xs font-medium text-gray-700 dark:text-gray-300">{{
                    dashboardData.accountsByPlatform['claude-console'].total
                  }}</span>
                </div>
                <!-- Gemini账户 -->
                <div
                  v-if="
                    dashboardData.accountsByPlatform.gemini &&
                    dashboardData.accountsByPlatform.gemini.total > 0
                  "
                  class="inline-flex items-center gap-0.5"
                  :title="platformTitle('Gemini', dashboardData.accountsByPlatform.gemini)"
                >
                  <i class="fas fa-robot text-xs text-yellow-600" />
                  <span class="text-xs font-medium text-gray-700 dark:text-gray-300">{{
                    dashboardData.accountsByPlatform.gemini.total
                  }}</span>
                </div>
                <!-- Bedrock账户 -->
                <div
                  v-if="
                    dashboardData.accountsByPlatform.bedrock &&
                    dashboardData.accountsByPlatform.bedrock.total > 0
                  "
                  class="inline-flex items-center gap-0.5"
                  :title="platformTitle('Bedrock', dashboardData.accountsByPlatform.bedrock)"
                >
                  <i class="fab fa-aws text-xs text-orange-600" />
                  <span class="text-xs font-medium text-gray-700 dark:text-gray-300">{{
                    dashboardData.accountsByPlatform.bedrock.total
                  }}</span>
                </div>
                <!-- OpenAI账户 -->
                <div
                  v-if="
                    dashboardData.accountsByPlatform.openai &&
                    dashboardData.accountsByPlatform.openai.total > 0
                  "
                  class="inline-flex items-center gap-0.5"
                  :title="platformTitle('OpenAI', dashboardData.accountsByPlatform.openai)"
                >
                  <i class="fas fa-openai text-xs text-gray-100" />
                  <span class="text-xs font-medium text-gray-700 dark:text-gray-300">{{
                    dashboardData.accountsByPlatform.openai.total
                  }}</span>
                </div>
                <!-- Azure OpenAI账户 -->
                <div
                  v-if="
                    dashboardData.accountsByPlatform.azure_openai &&
                    dashboardData.accountsByPlatform.azure_openai.total > 0
                  "
                  class="inline-flex items-center gap-0.5"
                  :title="
                    platformTitle('Azure OpenAI', dashboardData.accountsByPlatform.azure_openai)
                  "
                >
                  <i class="fab fa-microsoft text-xs text-blue-600" />
                  <span class="text-xs font-medium text-gray-700 dark:text-gray-300">{{
                    dashboardData.accountsByPlatform.azure_openai.total
                  }}</span>
                </div>
                <!-- OpenAI-Responses账户 -->
                <div
                  v-if="
                    dashboardData.accountsByPlatform['openai-responses'] &&
                    dashboardData.accountsByPlatform['openai-responses'].total > 0
                  "
                  class="inline-flex items-center gap-0.5"
                  :title="
                    platformTitle(
                      'OpenAI Responses',
                      dashboardData.accountsByPlatform['openai-responses']
                    )
                  "
                >
                  <i class="fas fa-server text-xs text-cyan-600" />
                  <span class="text-xs font-medium text-gray-700 dark:text-gray-300">{{
                    dashboardData.accountsByPlatform['openai-responses'].total
                  }}</span>
                </div>
              </div>
            </div>
            <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {{ t('dashboard.normal') }} {{ dashboardData.normalAccounts || 0 }}
              <span v-if="dashboardData.abnormalAccounts > 0" class="text-red-600">
                | {{ t('dashboard.abnormal') }} {{ dashboardData.abnormalAccounts }}
              </span>
              <span
                v-if="dashboardData.pausedAccounts > 0"
                class="text-gray-600 dark:text-gray-400"
              >
                | {{ t('dashboard.paused') }} {{ dashboardData.pausedAccounts }}
              </span>
              <span v-if="dashboardData.rateLimitedAccounts > 0" class="text-yellow-600">
                | {{ t('dashboard.rateLimited') }} {{ dashboardData.rateLimitedAccounts }}
              </span>
            </p>
          </div>
          <div class="stat-icon ml-2 flex-shrink-0 bg-gradient-to-br from-green-500 to-green-600">
            <i class="fas fa-user-circle" />
          </div>
        </div>
      </div>

      <div class="stat-card">
        <div class="flex items-center justify-between">
          <div>
            <p class="mb-1 text-xs font-semibold text-gray-600 dark:text-gray-400 sm:text-sm">
              {{ t('dashboard.todayRequests') }}
            </p>
            <p class="text-2xl font-bold text-gray-900 dark:text-gray-100 sm:text-3xl">
              {{ dashboardData.todayRequests }}
            </p>
            <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {{ t('dashboard.totalRequests') }}
              {{ formatNumber(dashboardData.totalRequests || 0) }}
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
            <p class="mb-1 text-xs font-semibold text-gray-600 dark:text-gray-400 sm:text-sm">
              {{ t('dashboard.systemStatus') }}
            </p>
            <p class="text-2xl font-bold text-green-600 sm:text-3xl">
              {{ systemStatusLabel }}
            </p>
            <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {{ t('dashboard.uptime') }} {{ formatUptime(dashboardData.uptime) }}
            </p>
          </div>
          <div class="stat-icon flex-shrink-0 bg-gradient-to-br from-yellow-500 to-orange-500">
            <i class="fas fa-heartbeat" />
          </div>
        </div>
      </div>
    </div>

    <!-- 账户余额/配额汇总 -->
    <div class="mb-4 grid grid-cols-1 gap-3 sm:mb-6 sm:grid-cols-2 sm:gap-4 md:mb-8 md:gap-6">
      <div class="stat-card">
        <div class="flex items-center justify-between">
          <div>
            <p class="mb-1 text-xs font-semibold text-gray-600 dark:text-gray-400 sm:text-sm">
              {{ t('dashboard.accountBalanceQuota') }}
            </p>
            <p class="text-2xl font-bold text-gray-900 dark:text-gray-100 sm:text-3xl">
              {{ formatCurrencyUsd(balanceSummary.totalBalance || 0) }}
            </p>
            <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {{ t('dashboard.lowBalance') }} {{ balanceSummary.lowBalanceCount || 0 }} |
              {{ t('dashboard.totalCost') }}
              {{ formatCurrencyUsd(balanceSummary.totalCost || 0) }}
            </p>
          </div>
          <div class="stat-icon flex-shrink-0 bg-gradient-to-br from-emerald-500 to-green-600">
            <i class="fas fa-wallet" />
          </div>
        </div>

        <div class="mt-3 flex items-center justify-between gap-3">
          <p class="text-xs text-gray-500 dark:text-gray-400">
            {{ t('dashboard.updatedAt') }} {{ formatLastUpdate(balanceSummaryUpdatedAt) }}
          </p>
          <button
            class="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition-all duration-200 hover:border-gray-300 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:border-gray-500"
            :disabled="loadingBalanceSummary"
            @click="loadBalanceSummary"
          >
            <i :class="['fas', loadingBalanceSummary ? 'fa-spinner fa-spin' : 'fa-sync-alt']" />
            {{ t('dashboard.refresh') }}
          </button>
        </div>
      </div>

      <div class="card p-4 sm:p-6">
        <div class="mb-3 flex items-center justify-between">
          <h3 class="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {{ t('dashboard.lowBalanceAccounts') }}
          </h3>
          <span class="text-xs text-gray-500 dark:text-gray-400">
            {{ t('dashboard.count', { count: lowBalanceAccounts.length }) }}
          </span>
        </div>

        <div
          v-if="loadingBalanceSummary"
          class="py-6 text-center text-sm text-gray-500 dark:text-gray-400"
        >
          {{ t('dashboard.loading') }}
        </div>
        <div
          v-else-if="lowBalanceAccounts.length === 0"
          class="py-6 text-center text-sm text-green-600 dark:text-green-400"
        >
          {{ t('dashboard.allNormal') }}
        </div>
        <div v-else class="max-h-64 space-y-2 overflow-y-auto">
          <div
            v-for="account in lowBalanceAccounts"
            :key="account.accountId"
            class="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900/60 dark:bg-red-900/20"
          >
            <div class="flex items-center justify-between gap-2">
              <div class="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                {{ account.name || account.accountId }}
              </div>
              <span
                class="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-gray-700 dark:text-gray-300"
              >
                {{ getBalancePlatformLabel(account.platform) }}
              </span>
            </div>
            <div class="mt-1 text-xs text-gray-600 dark:text-gray-400">
              <span v-if="account.balance">
                {{ t('dashboard.balance') }} {{ account.balance.formattedAmount }}
              </span>
              <span v-else
                >{{ t('dashboard.todayCost') }}
                {{ formatCurrencyUsd(account.statistics?.dailyCost || 0) }}</span
              >
            </div>
            <div v-if="account.quota && typeof account.quota.percentage === 'number'" class="mt-2">
              <div
                class="mb-1 flex items-center justify-between text-xs text-gray-600 dark:text-gray-400"
              >
                <span>{{ t('dashboard.quotaUsage') }}</span>
                <span class="text-red-600 dark:text-red-400">
                  {{ account.quota.percentage.toFixed(1) }}%
                </span>
              </div>
              <div class="h-2 w-full rounded-full bg-gray-200 dark:bg-gray-700">
                <div
                  class="h-2 rounded-full bg-red-500"
                  :style="{ width: `${Math.min(100, account.quota.percentage)}%` }"
                ></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Token统计和性能指标 -->
    <div
      class="mb-4 grid grid-cols-1 gap-3 sm:mb-6 sm:grid-cols-2 sm:gap-4 md:mb-8 md:gap-6 lg:grid-cols-4"
    >
      <div class="stat-card">
        <div class="flex items-center justify-between">
          <div class="mr-8 flex-1">
            <p class="mb-1 text-xs font-semibold text-gray-600 dark:text-gray-400 sm:text-sm">
              {{ t('dashboard.todayToken') }}
            </p>
            <div class="mb-2 flex flex-wrap items-baseline gap-2">
              <p class="text-xl font-bold text-blue-600 sm:text-2xl md:text-3xl">
                {{
                  formatNumber(
                    (dashboardData.todayInputTokens || 0) +
                      (dashboardData.todayOutputTokens || 0) +
                      (dashboardData.todayCacheCreateTokens || 0) +
                      (dashboardData.todayCacheReadTokens || 0)
                  )
                }}
              </p>
              <span class="text-sm font-medium text-green-600"
                >/ {{ costsData.todayCosts.formatted.totalCost }}</span
              >
            </div>
            <div class="text-xs text-gray-500 dark:text-gray-400">
              <div class="flex flex-wrap items-center justify-between gap-x-4">
                <span
                  >{{ t('dashboard.input') }}
                  <span class="font-medium">{{
                    formatNumber(dashboardData.todayInputTokens || 0)
                  }}</span></span
                >
                <span
                  >{{ t('dashboard.output') }}
                  <span class="font-medium">{{
                    formatNumber(dashboardData.todayOutputTokens || 0)
                  }}</span></span
                >
                <span v-if="(dashboardData.todayCacheCreateTokens || 0) > 0" class="text-purple-600"
                  >{{ t('dashboard.cacheCreate') }}
                  <span class="font-medium">{{
                    formatNumber(dashboardData.todayCacheCreateTokens || 0)
                  }}</span></span
                >
                <span v-if="(dashboardData.todayCacheReadTokens || 0) > 0" class="text-purple-600"
                  >{{ t('dashboard.cacheRead') }}
                  <span class="font-medium">{{
                    formatNumber(dashboardData.todayCacheReadTokens || 0)
                  }}</span></span
                >
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
          <div class="mr-8 flex-1">
            <p class="mb-1 text-xs font-semibold text-gray-600 dark:text-gray-400 sm:text-sm">
              {{ t('dashboard.totalTokenUsage') }}
            </p>
            <div class="mb-2 flex flex-wrap items-baseline gap-2">
              <p class="text-xl font-bold text-emerald-600 sm:text-2xl md:text-3xl">
                {{
                  formatNumber(
                    (dashboardData.totalInputTokens || 0) +
                      (dashboardData.totalOutputTokens || 0) +
                      (dashboardData.totalCacheCreateTokens || 0) +
                      (dashboardData.totalCacheReadTokens || 0)
                  )
                }}
              </p>
              <span class="text-sm font-medium text-green-600"
                >/ {{ costsData.totalCosts.formatted.totalCost }}</span
              >
            </div>
            <div class="text-xs text-gray-500 dark:text-gray-400">
              <div class="flex flex-wrap items-center justify-between gap-x-4">
                <span
                  >{{ t('dashboard.input') }}
                  <span class="font-medium">{{
                    formatNumber(dashboardData.totalInputTokens || 0)
                  }}</span></span
                >
                <span
                  >{{ t('dashboard.output') }}
                  <span class="font-medium">{{
                    formatNumber(dashboardData.totalOutputTokens || 0)
                  }}</span></span
                >
                <span v-if="(dashboardData.totalCacheCreateTokens || 0) > 0" class="text-purple-600"
                  >{{ t('dashboard.cacheCreate') }}
                  <span class="font-medium">{{
                    formatNumber(dashboardData.totalCacheCreateTokens || 0)
                  }}</span></span
                >
                <span v-if="(dashboardData.totalCacheReadTokens || 0) > 0" class="text-purple-600"
                  >{{ t('dashboard.cacheRead') }}
                  <span class="font-medium">{{
                    formatNumber(dashboardData.totalCacheReadTokens || 0)
                  }}</span></span
                >
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
            <p class="mb-1 text-xs font-semibold text-gray-600 dark:text-gray-400 sm:text-sm">
              {{ t('dashboard.realtimeRpm') }}
              <span class="text-xs text-gray-400">{{
                t('dashboard.minutesShort', { count: dashboardData.metricsWindow })
              }}</span>
            </p>
            <p class="text-2xl font-bold text-orange-600 sm:text-3xl">
              {{ dashboardData.realtimeRPM || 0 }}
            </p>
            <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {{ t('dashboard.requestsPerMinute') }}
              <span v-if="dashboardData.isHistoricalMetrics" class="text-yellow-600">
                <i class="fas fa-exclamation-circle" /> {{ t('dashboard.historicalData') }}
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
            <p class="mb-1 text-xs font-semibold text-gray-600 dark:text-gray-400 sm:text-sm">
              {{ t('dashboard.realtimeTpm') }}
              <span class="text-xs text-gray-400">{{
                t('dashboard.minutesShort', { count: dashboardData.metricsWindow })
              }}</span>
            </p>
            <p class="text-2xl font-bold text-rose-600 sm:text-3xl">
              {{ formatNumber(dashboardData.realtimeTPM || 0) }}
            </p>
            <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {{ t('dashboard.tokensPerMinute') }}
              <span v-if="dashboardData.isHistoricalMetrics" class="text-yellow-600">
                <i class="fas fa-exclamation-circle" /> {{ t('dashboard.historicalData') }}
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
      <div class="mb-4 flex flex-col gap-4 sm:mb-6">
        <h3 class="text-lg font-bold text-gray-900 dark:text-gray-100 sm:text-xl">
          {{ t('dashboard.modelUsageAndTrend') }}
        </h3>
        <div class="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-end">
          <!-- 快捷日期选择 -->
          <div
            class="flex flex-shrink-0 gap-1 overflow-x-auto rounded-lg bg-gray-100 p-1 dark:bg-gray-700"
          >
            <button
              v-for="option in dateFilter.presetOptions"
              :key="option.value"
              :class="[
                'rounded-md px-3 py-1 text-sm font-medium transition-colors',
                dateFilter.preset === option.value && dateFilter.type === 'preset'
                  ? 'bg-white text-blue-600 shadow-sm dark:bg-gray-800'
                  : 'text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-100'
              ]"
              @click="setDateFilterPreset(option.value)"
            >
              {{ presetLabel(option) }}
            </button>
          </div>

          <!-- 粒度切换按钮 -->
          <div class="flex gap-1 rounded-lg bg-gray-100 p-1 dark:bg-gray-700">
            <button
              :class="[
                'rounded-md px-3 py-1 text-sm font-medium transition-colors',
                trendGranularity === 'day'
                  ? 'bg-white text-blue-600 shadow-sm dark:bg-gray-800'
                  : 'text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-100'
              ]"
              @click="setTrendGranularity('day')"
            >
              <i class="fas fa-calendar-day mr-1" />{{ t('dashboard.byDay') }}
            </button>
            <button
              :class="[
                'rounded-md px-3 py-1 text-sm font-medium transition-colors',
                trendGranularity === 'hour'
                  ? 'bg-white text-blue-600 shadow-sm dark:bg-gray-800'
                  : 'text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-100'
              ]"
              @click="setTrendGranularity('hour')"
            >
              <i class="fas fa-clock mr-1" />{{ t('dashboard.byHour') }}
            </button>
          </div>

          <!-- Element Plus 日期范围选择器 -->
          <div class="flex items-center gap-2">
            <el-date-picker
              v-model="dateFilter.customRange"
              class="custom-date-picker w-full lg:w-auto"
              :default-time="defaultTime"
              :disabled-date="disabledDate"
              :end-placeholder="t('dashboard.endDate')"
              format="YYYY-MM-DD HH:mm:ss"
              :range-separator="t('dashboard.rangeSeparator')"
              size="default"
              :start-placeholder="t('dashboard.startDate')"
              style="max-width: 400px"
              type="datetimerange"
              value-format="YYYY-MM-DD HH:mm:ss"
              @change="onCustomDateRangeChange"
            />
            <span v-if="trendGranularity === 'hour'" class="text-xs text-orange-600">
              <i class="fas fa-info-circle" /> {{ t('dashboard.max24Hours') }}
            </span>
          </div>

          <!-- 刷新控制 -->
          <div class="flex items-center gap-2">
            <!-- 自动刷新控制 -->
            <div class="flex items-center rounded-lg bg-gray-100 px-3 py-1 dark:bg-gray-700">
              <label class="relative inline-flex cursor-pointer items-center">
                <input v-model="autoRefreshEnabled" class="peer sr-only" type="checkbox" />
                <!-- 更小的开关 -->
                <div
                  class="peer relative h-5 w-9 rounded-full bg-gray-300 transition-all duration-200 after:absolute after:left-[2px] after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow-sm after:transition-transform after:duration-200 after:content-[''] peer-checked:bg-blue-500 peer-checked:after:translate-x-4 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 dark:bg-gray-600 dark:after:bg-gray-300 dark:peer-focus:ring-blue-600"
                />
                <span
                  class="ml-2.5 flex select-none items-center gap-1 text-sm font-medium text-gray-600 dark:text-gray-300"
                >
                  <i class="fas fa-redo-alt text-xs text-gray-500 dark:text-gray-400" />
                  <span>{{ t('dashboard.autoRefresh') }}</span>
                  <span
                    v-if="autoRefreshEnabled"
                    class="ml-1 font-mono text-xs text-blue-600 transition-opacity"
                    :class="refreshCountdown > 0 ? 'opacity-100' : 'opacity-0'"
                  >
                    {{ refreshCountdown }}s
                  </span>
                </span>
              </label>
            </div>

            <!-- 刷新按钮 -->
            <button
              class="flex items-center gap-1 rounded-md border border-gray-300 bg-white px-3 py-1 text-sm font-medium text-blue-600 shadow-sm transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:hover:bg-gray-700 sm:gap-2"
              :disabled="isRefreshing"
              :title="t('dashboard.refreshNow')"
              @click="refreshAllData()"
            >
              <i :class="['fas fa-sync-alt text-xs', { 'animate-spin': isRefreshing }]" />
              <span class="hidden sm:inline">
                {{ isRefreshing ? t('dashboard.refreshing') : t('dashboard.refresh') }}
              </span>
            </button>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <!-- 饼图 -->
        <div class="card p-4 sm:p-6">
          <h4 class="mb-4 text-base font-semibold text-gray-800 dark:text-gray-200 sm:text-lg">
            {{ t('dashboard.tokenDistribution') }}
          </h4>
          <div class="relative" style="height: 250px">
            <canvas ref="modelUsageChart" />
          </div>
        </div>

        <!-- 详细数据表格 -->
        <div class="card p-4 sm:p-6">
          <h4 class="mb-4 text-base font-semibold text-gray-800 dark:text-gray-200 sm:text-lg">
            {{ t('dashboard.detailedStats') }}
          </h4>
          <div v-if="dashboardModelStats.length === 0" class="py-8 text-center">
            <p class="text-sm text-gray-500 sm:text-base">{{ t('dashboard.noModelUsage') }}</p>
          </div>
          <div v-else class="max-h-[250px] overflow-auto sm:max-h-[300px]">
            <table class="min-w-full">
              <thead class="sticky top-0 bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th
                    class="px-2 py-2 text-left text-xs font-medium text-gray-700 dark:text-gray-300 sm:px-4"
                  >
                    {{ t('dashboard.model') }}
                  </th>
                  <th
                    class="hidden px-2 py-2 text-right text-xs font-medium text-gray-700 dark:text-gray-300 sm:table-cell sm:px-4"
                  >
                    {{ t('dashboard.requests') }}
                  </th>
                  <th
                    class="px-2 py-2 text-right text-xs font-medium text-gray-700 dark:text-gray-300 sm:px-4"
                  >
                    {{ t('dashboard.totalToken') }}
                  </th>
                  <th
                    class="px-2 py-2 text-right text-xs font-medium text-gray-700 dark:text-gray-300 sm:px-4"
                  >
                    {{ t('dashboard.cost') }}
                  </th>
                  <th
                    class="hidden px-2 py-2 text-right text-xs font-medium text-gray-700 dark:text-gray-300 sm:table-cell sm:px-4"
                  >
                    {{ t('dashboard.share') }}
                  </th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-200 dark:divide-gray-600">
                <tr
                  v-for="stat in dashboardModelStats"
                  :key="stat.model"
                  class="hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  <td class="px-2 py-2 text-xs text-gray-900 dark:text-gray-100 sm:px-4 sm:text-sm">
                    <span class="block max-w-[100px] truncate sm:max-w-none" :title="stat.model">
                      {{ stat.model }}
                    </span>
                  </td>
                  <td
                    class="hidden px-2 py-2 text-right text-xs text-gray-600 dark:text-gray-400 sm:table-cell sm:px-4 sm:text-sm"
                  >
                    {{ formatNumber(stat.requests) }}
                  </td>
                  <td
                    class="px-2 py-2 text-right text-xs text-gray-600 dark:text-gray-400 sm:px-4 sm:text-sm"
                  >
                    {{ formatNumber(stat.allTokens) }}
                  </td>
                  <td
                    class="px-2 py-2 text-right text-xs font-medium text-green-600 sm:px-4 sm:text-sm"
                  >
                    {{ stat.formatted ? stat.formatted.total : '$0.000000' }}
                  </td>
                  <td
                    class="hidden px-2 py-2 text-right text-xs font-medium sm:table-cell sm:px-4 sm:text-sm"
                  >
                    <span
                      class="inline-flex items-center rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
                    >
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
        <div class="sm:h-[300px]" style="height: 250px">
          <canvas ref="usageTrendChart" />
        </div>
      </div>
    </div>

    <!-- API Keys 使用趋势图 -->
    <div class="mb-4 sm:mb-6 md:mb-8">
      <div class="card p-4 sm:p-6">
        <div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h3 class="text-base font-semibold text-gray-900 dark:text-gray-100 sm:text-lg">
            {{ t('dashboard.apiKeysTrend') }}
          </h3>
          <!-- 维度切换按钮 -->
          <div class="flex gap-1 rounded-lg bg-gray-100 p-1 dark:bg-gray-700">
            <button
              :class="[
                'rounded-md px-2 py-1 text-xs font-medium transition-colors sm:px-3 sm:text-sm',
                apiKeysTrendMetric === 'requests'
                  ? 'bg-white text-blue-600 shadow-sm dark:bg-gray-800'
                  : 'text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-100'
              ]"
              @click="((apiKeysTrendMetric = 'requests'), updateApiKeysUsageTrendChart())"
            >
              <i class="fas fa-exchange-alt mr-1" /><span class="hidden sm:inline">{{
                t('dashboard.requestCount')
              }}</span
              ><span class="sm:hidden">{{ t('dashboard.requestShort') }}</span>
            </button>
            <button
              :class="[
                'rounded-md px-2 py-1 text-xs font-medium transition-colors sm:px-3 sm:text-sm',
                apiKeysTrendMetric === 'tokens'
                  ? 'bg-white text-blue-600 shadow-sm dark:bg-gray-800'
                  : 'text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-100'
              ]"
              @click="((apiKeysTrendMetric = 'tokens'), updateApiKeysUsageTrendChart())"
            >
              <i class="fas fa-coins mr-1" /><span class="hidden sm:inline">{{
                t('dashboard.tokenCount')
              }}</span
              ><span class="sm:hidden">Token</span>
            </button>
          </div>
        </div>
        <div class="mb-4 text-xs text-gray-600 dark:text-gray-400 sm:text-sm">
          <span v-if="apiKeysTrendData.totalApiKeys > 10">
            {{ t('dashboard.topApiKeyCount', { count: apiKeysTrendData.totalApiKeys }) }}
          </span>
          <span v-else>
            {{ t('dashboard.totalApiKeyCount', { count: apiKeysTrendData.totalApiKeys }) }}
          </span>
        </div>
        <div class="sm:h-[350px]" style="height: 300px">
          <canvas ref="apiKeysUsageTrendChart" />
        </div>
      </div>
    </div>

    <!-- 账号使用趋势图 -->
    <div class="mb-4 sm:mb-6 md:mb-8">
      <div class="card p-4 sm:p-6">
        <div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div class="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
            <h3 class="text-base font-semibold text-gray-900 dark:text-gray-100 sm:text-lg">
              {{ t('dashboard.accountUsageTrend') }}
            </h3>
            <span class="text-xs text-gray-500 dark:text-gray-400 sm:text-sm">
              {{ t('dashboard.currentGroup') }}
              {{ currentAccountGroupLabel }}
            </span>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <div class="flex gap-1 rounded-lg bg-gray-100 p-1 dark:bg-gray-700">
              <button
                v-for="option in accountGroupOptions"
                :key="option.value"
                :class="[
                  'rounded-md px-2 py-1 text-xs font-medium transition-colors sm:px-3 sm:text-sm',
                  accountUsageGroup === option.value
                    ? 'bg-white text-blue-600 shadow-sm dark:bg-gray-800'
                    : 'text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-100'
                ]"
                @click="handleAccountUsageGroupChange(option.value)"
              >
                {{ option.label }}
              </button>
            </div>
          </div>
        </div>
        <div
          class="mb-4 flex flex-wrap items-center gap-2 text-xs text-gray-600 dark:text-gray-400 sm:text-sm"
        >
          <span>
            {{
              t('dashboard.totalAccountCount', { count: accountUsageTrendData.totalAccounts || 0 })
            }}
          </span>
          <span
            v-if="accountUsageTrendData.topAccounts && accountUsageTrendData.topAccounts.length"
          >
            {{
              t('dashboard.topAccountCount', { count: accountUsageTrendData.topAccounts.length })
            }}
          </span>
        </div>
        <div
          v-if="!accountUsageTrendData.data || accountUsageTrendData.data.length === 0"
          class="py-12 text-center text-sm text-gray-500 dark:text-gray-400"
        >
          {{ t('dashboard.noAccountUsage') }}
        </div>
        <div v-else class="sm:h-[350px]" style="height: 300px">
          <canvas ref="accountUsageTrendChart" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, nextTick, computed } from 'vue'
import { storeToRefs } from 'pinia'
import Chart from 'chart.js/auto'
import { useI18n } from 'vue-i18n'

import { useDashboardStore } from '@/stores/dashboard'
import { useThemeStore } from '@/stores/theme'
import { formatNumber, showToast } from '@/utils/tools'

import { getBalanceSummaryApi } from '@/utils/http_apis'

const dashboardStore = useDashboardStore()
const themeStore = useThemeStore()
const { t, locale } = useI18n()
const { isDarkMode } = storeToRefs(themeStore)

const {
  dashboardData,
  costsData,
  dashboardModelStats,
  trendData,
  apiKeysTrendData,
  accountUsageTrendData,
  accountUsageGroup,
  dateFilter,
  trendGranularity,
  apiKeysTrendMetric
} = storeToRefs(dashboardStore)

const {
  loadDashboardData,
  loadApiKeysTrend,
  setDateFilterPreset,
  onCustomDateRangeChange,
  setTrendGranularity,
  refreshChartsData,
  setAccountUsageGroup,
  disabledDate
} = dashboardStore

// 日期选择器默认时间
const defaultTime = [new Date(2000, 1, 1, 0, 0, 0), new Date(2000, 2, 1, 23, 59, 59)]

// Chart 实例
const modelUsageChart = ref(null)
const usageTrendChart = ref(null)
const apiKeysUsageTrendChart = ref(null)
const accountUsageTrendChart = ref(null)
let modelUsageChartInstance = null
let usageTrendChartInstance = null
let apiKeysUsageTrendChartInstance = null
let accountUsageTrendChartInstance = null

const accountGroupOptions = [
  { value: 'claude', label: 'Claude' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'gemini', label: 'Gemini' },
  { value: 'droid', label: 'Droid' }
]

const accountTrendUpdating = ref(false)

// 余额/配额汇总
const balanceSummary = ref({
  totalBalance: 0,
  totalCost: 0,
  lowBalanceCount: 0,
  platforms: {}
})
const loadingBalanceSummary = ref(false)
const balanceSummaryUpdatedAt = ref(null)

const getBalancePlatformLabel = (platform) => {
  const map = {
    claude: 'Claude',
    'claude-console': 'Claude Console',
    gemini: 'Gemini',
    'gemini-api': 'Gemini API',
    openai: 'OpenAI',
    'openai-responses': 'OpenAI Responses',
    azure_openai: 'Azure OpenAI',
    bedrock: 'Bedrock',
    droid: 'Droid',
    ccr: 'CCR'
  }
  return map[platform] || platform
}

const platformTitle = (platform, data = {}) =>
  t('dashboard.platformTitle', {
    platform,
    total: data.total || 0,
    normal: data.normal || 0
  })

const systemStatusLabel = computed(() => {
  const status = dashboardData.value.systemStatus
  if (status === 'normal') {
    return t('dashboard.statusNormal')
  }
  return t('dashboard.statusAbnormal')
})

const formatUptime = (seconds = 0) => {
  const totalSeconds = Number(seconds || 0)
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)

  if (days > 0) return t('apiStatsComponents.common.daysHours', { days, hours })
  if (hours > 0) return t('apiStatsComponents.common.hoursMinutes', { hours, minutes })
  return t('apiStatsComponents.common.minutes', { count: minutes })
}

const presetLabel = (option) => t(`dashboard.preset.${option.value}`)

const accountGroupLabel = (group) => {
  const knownGroups = ['claude', 'openai', 'gemini', 'droid']
  if (knownGroups.includes(group)) {
    return t(`dashboard.accountGroups.${group}`)
  }
  return group || t('dashboard.noneSelected')
}

const currentAccountGroupLabel = computed(() =>
  accountGroupLabel(accountUsageTrendData.value.group)
)

const lowBalanceAccounts = computed(() => {
  const result = []
  const platforms = balanceSummary.value?.platforms || {}

  Object.entries(platforms).forEach(([platform, data]) => {
    const list = Array.isArray(data?.accounts) ? data.accounts : []
    list.forEach((entry) => {
      const accountData = entry?.data
      if (!accountData) return

      const amount = accountData.balance?.amount
      const percentage = accountData.quota?.percentage

      const isLowBalance = typeof amount === 'number' && amount < 10
      const isHighUsage = typeof percentage === 'number' && percentage > 90

      if (isLowBalance || isHighUsage) {
        result.push({
          ...accountData,
          name: entry?.name || accountData.accountId,
          platform: accountData.platform || platform
        })
      }
    })
  })

  return result
})

const formatCurrencyUsd = (amount) => {
  const value = Number(amount)
  if (!Number.isFinite(value)) return '$0.00'
  if (value >= 1) return `$${value.toFixed(2)}`
  if (value >= 0.01) return `$${value.toFixed(3)}`
  return `$${value.toFixed(6)}`
}

const formatLastUpdate = (isoString) => {
  if (!isoString) return t('dashboard.unknown')
  const date = new Date(isoString)
  if (Number.isNaN(date.getTime())) return t('dashboard.unknown')
  return date.toLocaleTimeString(locale.value, { hour: '2-digit', minute: '2-digit' })
}

const loadBalanceSummary = async () => {
  loadingBalanceSummary.value = true
  const response = await getBalanceSummaryApi()
  if (response?.success) {
    balanceSummary.value = response.data || {
      totalBalance: 0,
      totalCost: 0,
      lowBalanceCount: 0,
      platforms: {}
    }
    balanceSummaryUpdatedAt.value = new Date().toISOString()
  } else if (response?.message) {
    console.debug('Failed to load balance summary:', response.message)
    showToast(t('dashboard.loadBalanceFailed'), 'error')
  }
  loadingBalanceSummary.value = false
}

// 自动刷新相关
const autoRefreshEnabled = ref(false)
const autoRefreshInterval = ref(30) // 秒
const autoRefreshTimer = ref(null)
const refreshCountdown = ref(0)
const countdownTimer = ref(null)
const isRefreshing = ref(false)

// 计算倒计时显示
// const refreshCountdownDisplay = computed(() => {
//   if (!autoRefreshEnabled.value || refreshCountdown.value <= 0) return ''
//   return `${refreshCountdown.value}秒后刷新`
// })

// 图表颜色配置（根据主题动态调整）
const chartColors = computed(() => ({
  text: isDarkMode.value ? '#e5e7eb' : '#374151',
  grid: isDarkMode.value ? 'rgba(75, 85, 99, 0.3)' : 'rgba(0, 0, 0, 0.1)',
  legend: isDarkMode.value ? '#e5e7eb' : '#374151'
}))

function formatCostValue(cost) {
  if (!Number.isFinite(cost)) {
    return '$0.000000'
  }
  if (cost >= 1) {
    return `$${cost.toFixed(2)}`
  }
  if (cost >= 0.01) {
    return `$${cost.toFixed(3)}`
  }
  return `$${cost.toFixed(6)}`
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
    labels: data.map((d) => d.model),
    datasets: [
      {
        data: data.map((d) => d.allTokens),
        backgroundColor: [
          '#3B82F6',
          '#10B981',
          '#F59E0B',
          '#EF4444',
          '#8B5CF6',
          '#EC4899',
          '#14B8A6',
          '#F97316',
          '#6366F1',
          '#84CC16'
        ],
        borderWidth: 0
      }
    ]
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
            },
            color: chartColors.value.legend
          }
        },
        tooltip: {
          callbacks: {
            label: function (context) {
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
  const inputData = data.map((d) => d.inputTokens || 0)
  const outputData = data.map((d) => d.outputTokens || 0)
  const cacheCreateData = data.map((d) => d.cacheCreateTokens || 0)
  const cacheReadData = data.map((d) => d.cacheReadTokens || 0)
  const requestsData = data.map((d) => d.requests || 0)
  const costData = data.map((d) => d.cost || 0)
  const costLabel = t('dashboard.costUsd')
  const requestsLabel = t('dashboard.requests')

  // 根据数据类型确定标签字段和格式
  const labelField = data[0]?.date ? 'date' : 'hour'
  const labels = data.map((d) => {
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
        label: t('dashboard.inputToken'),
        data: inputData,
        borderColor: themeStore.currentColorScheme.primary,
        backgroundColor: `${themeStore.currentColorScheme.primary}1a`,
        tension: 0.3
      },
      {
        label: t('dashboard.outputToken'),
        data: outputData,
        borderColor: themeStore.currentColorScheme.accent,
        backgroundColor: `${themeStore.currentColorScheme.accent}1a`,
        tension: 0.3
      },
      {
        label: t('dashboard.cacheCreateToken'),
        data: cacheCreateData,
        borderColor: 'rgb(59, 130, 246)',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        tension: 0.3
      },
      {
        label: t('dashboard.cacheReadToken'),
        data: cacheReadData,
        borderColor: themeStore.currentColorScheme.secondary,
        backgroundColor: `${themeStore.currentColorScheme.secondary}1a`,
        tension: 0.3
      },
      {
        label: costLabel,
        data: costData,
        borderColor: 'rgb(34, 197, 94)',
        backgroundColor: 'rgba(34, 197, 94, 0.1)',
        tension: 0.3,
        yAxisID: 'y2'
      },
      {
        label: requestsLabel,
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
        intersect: false
      },
      plugins: {
        title: {
          display: true,
          text: t('dashboard.tokenTrend'),
          font: {
            size: 16,
            weight: 'bold'
          },
          color: chartColors.value.text
        },
        legend: {
          position: 'top',
          labels: {
            color: chartColors.value.legend
          }
        },
        tooltip: {
          mode: 'index',
          intersect: false,
          itemSort: function (a, b) {
            // 按值倒序排列，费用和请求数特殊处理
            const aLabel = a.dataset.label || ''
            const bLabel = b.dataset.label || ''

            // 费用和请求数使用不同的轴，单独处理
            if (aLabel === costLabel || bLabel === costLabel) {
              return aLabel === costLabel ? -1 : 1
            }
            if (aLabel === requestsLabel || bLabel === requestsLabel) {
              return aLabel === requestsLabel ? 1 : -1
            }

            // 其他按token值倒序
            return b.parsed.y - a.parsed.y
          },
          callbacks: {
            label: function (context) {
              const label = context.dataset.label || ''
              let value = context.parsed.y

              if (label === costLabel) {
                // 格式化费用显示
                if (value < 0.01) {
                  return label + ': $' + value.toFixed(6)
                } else {
                  return label + ': $' + value.toFixed(4)
                }
              } else if (label === requestsLabel) {
                return label + ': ' + value.toLocaleString() + ` ${t('dashboard.times')}`
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
            text:
              trendGranularity.value === 'hour' ? t('dashboard.timeAxis') : t('dashboard.dateAxis'),
            color: chartColors.value.text
          },
          ticks: {
            color: chartColors.value.text
          },
          grid: {
            color: chartColors.value.grid
          }
        },
        y: {
          type: 'linear',
          display: true,
          position: 'left',
          min: 0,
          title: {
            display: true,
            text: t('dashboard.tokenAmount'),
            color: chartColors.value.text
          },
          ticks: {
            callback: function (value) {
              return formatNumber(value)
            },
            color: chartColors.value.text
          },
          grid: {
            color: chartColors.value.grid
          }
        },
        y1: {
          type: 'linear',
          display: true,
          position: 'right',
          min: 0,
          title: {
            display: true,
            text: t('dashboard.requests'),
            color: chartColors.value.text
          },
          grid: {
            drawOnChartArea: false
          },
          ticks: {
            callback: function (value) {
              return value.toLocaleString()
            },
            color: chartColors.value.text
          }
        },
        y2: {
          type: 'linear',
          display: false, // 隐藏费用轴，在tooltip中显示
          position: 'right',
          min: 0
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
    '#3B82F6',
    '#10B981',
    '#F59E0B',
    '#EF4444',
    '#8B5CF6',
    '#EC4899',
    '#14B8A6',
    '#F97316',
    '#6366F1',
    '#84CC16'
  ]

  // 准备数据集
  const datasets =
    apiKeysTrendData.value.topApiKeys?.map((apiKeyId, index) => {
      const data = apiKeysTrendData.value.data.map((item) => {
        if (!item.apiKeys || !item.apiKeys[apiKeyId]) return 0
        return metric === 'tokens'
          ? item.apiKeys[apiKeyId].tokens
          : item.apiKeys[apiKeyId].requests || 0
      })

      // 获取API Key名称
      const apiKeyName =
        apiKeysTrendData.value.data.find((item) => item.apiKeys && item.apiKeys[apiKeyId])?.apiKeys[
          apiKeyId
        ]?.name || `API Key ${apiKeyId}`

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
    labels: data.map((d) => {
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
            },
            color: chartColors.value.legend
          }
        },
        tooltip: {
          mode: 'index',
          intersect: false,
          itemSort: function (a, b) {
            // 按值倒序排列
            return b.parsed.y - a.parsed.y
          },
          callbacks: {
            label: function (context) {
              const label = context.dataset.label || ''
              const value = context.parsed.y
              const dataIndex = context.dataIndex
              const dataPoint = apiKeysTrendData.value.data[dataIndex]

              // 获取所有数据集在这个时间点的值，用于排名
              const allValues = context.chart.data.datasets
                .map((dataset, idx) => ({
                  value: dataset.data[dataIndex] || 0,
                  index: idx
                }))
                .sort((a, b) => b.value - a.value)

              // 找出当前数据集的排名
              const rank = allValues.findIndex((item) => item.index === context.datasetIndex) + 1

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
                return `${rankIcon}${label}: ${value.toLocaleString()} ${t('dashboard.times')}`
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
            text:
              trendGranularity.value === 'hour' ? t('dashboard.timeAxis') : t('dashboard.dateAxis'),
            color: chartColors.value.text
          },
          ticks: {
            color: chartColors.value.text
          },
          grid: {
            color: chartColors.value.grid
          }
        },
        y: {
          beginAtZero: true,
          min: 0,
          title: {
            display: true,
            text:
              apiKeysTrendMetric.value === 'tokens'
                ? t('dashboard.tokenCount')
                : t('dashboard.requestCount'),
            color: chartColors.value.text
          },
          ticks: {
            callback: function (value) {
              return formatNumber(value)
            },
            color: chartColors.value.text
          },
          grid: {
            color: chartColors.value.grid
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

function createAccountUsageTrendChart() {
  if (!accountUsageTrendChart.value) return

  if (accountUsageTrendChartInstance) {
    accountUsageTrendChartInstance.destroy()
  }

  const trend = accountUsageTrendData.value?.data || []
  const topAccounts = accountUsageTrendData.value?.topAccounts || []

  const colors = [
    '#2563EB',
    '#059669',
    '#D97706',
    '#DC2626',
    '#7C3AED',
    '#F472B6',
    '#0EA5E9',
    '#F97316',
    '#6366F1',
    '#22C55E'
  ]

  const datasets = topAccounts.map((accountId, index) => {
    const dataPoints = trend.map((item) => {
      if (!item.accounts || !item.accounts[accountId]) return 0
      return item.accounts[accountId].cost || 0
    })

    const accountName =
      trend.find((item) => item.accounts && item.accounts[accountId])?.accounts[accountId]?.name ||
      t('dashboard.accountFallback', { id: String(accountId).slice(0, 6) })

    return {
      label: accountName,
      data: dataPoints,
      borderColor: colors[index % colors.length],
      backgroundColor: colors[index % colors.length] + '20',
      tension: 0.4,
      fill: false
    }
  })

  const labelField = trend[0]?.date ? 'date' : 'hour'

  const chartData = {
    labels: trend.map((item) => {
      if (item.label) {
        return item.label
      }

      if (labelField === 'hour') {
        const date = new Date(item.hour)
        const month = String(date.getMonth() + 1).padStart(2, '0')
        const day = String(date.getDate()).padStart(2, '0')
        const hour = String(date.getHours()).padStart(2, '0')
        return `${month}/${day} ${hour}:00`
      }

      if (item.date && item.date.includes('-')) {
        const parts = item.date.split('-')
        if (parts.length >= 3) {
          return `${parts[1]}/${parts[2]}`
        }
      }

      return item.date
    }),
    datasets
  }

  const topAccountIds = topAccounts

  accountUsageTrendChartInstance = new Chart(accountUsageTrendChart.value, {
    type: 'line',
    data: chartData,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            padding: 20,
            usePointStyle: true,
            font: {
              size: 12
            },
            color: chartColors.value.legend
          }
        },
        tooltip: {
          mode: 'index',
          intersect: false,
          itemSort: (a, b) => b.parsed.y - a.parsed.y,
          callbacks: {
            label: function (context) {
              const label = context.dataset.label || ''
              const value = context.parsed.y || 0
              const dataIndex = context.dataIndex
              const datasetIndex = context.datasetIndex
              const accountId = topAccountIds[datasetIndex]
              const dataPoint = accountUsageTrendData.value.data[dataIndex]
              const accountDetail = dataPoint?.accounts?.[accountId]

              const allValues = context.chart.data.datasets
                .map((dataset, idx) => ({
                  value: dataset.data[dataIndex] || 0,
                  index: idx
                }))
                .sort((a, b) => b.value - a.value)

              const rank = allValues.findIndex((item) => item.index === datasetIndex) + 1
              let rankIcon = ''
              if (rank === 1) rankIcon = '🥇 '
              else if (rank === 2) rankIcon = '🥈 '
              else if (rank === 3) rankIcon = '🥉 '

              const formattedCost = accountDetail?.formattedCost || formatCostValue(value)
              const requests = accountDetail?.requests || 0

              return `${rankIcon}${label}: ${formattedCost} / ${requests.toLocaleString()} ${t(
                'dashboard.times'
              )}`
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
            text:
              trendGranularity.value === 'hour' ? t('dashboard.timeAxis') : t('dashboard.dateAxis'),
            color: chartColors.value.text
          },
          ticks: {
            color: chartColors.value.text
          },
          grid: {
            color: chartColors.value.grid
          }
        },
        y: {
          beginAtZero: true,
          min: 0,
          title: {
            display: true,
            text: t('dashboard.amountUsd'),
            color: chartColors.value.text
          },
          ticks: {
            callback: (value) => formatCostValue(Number(value)),
            color: chartColors.value.text
          },
          grid: {
            color: chartColors.value.grid
          }
        }
      }
    }
  })
}

async function handleAccountUsageGroupChange(group) {
  if (accountUsageGroup.value === group || accountTrendUpdating.value) {
    return
  }
  accountTrendUpdating.value = true
  try {
    await setAccountUsageGroup(group)
    await nextTick()
    createAccountUsageTrendChart()
  } finally {
    accountTrendUpdating.value = false
  }
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

watch(accountUsageTrendData, () => {
  nextTick(() => createAccountUsageTrendChart())
})

// 刷新所有数据
async function refreshAllData() {
  if (isRefreshing.value) return

  isRefreshing.value = true
  try {
    await Promise.all([loadDashboardData(), refreshChartsData(), loadBalanceSummary()])
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
// function toggleAutoRefresh() {
//   autoRefreshEnabled.value = !autoRefreshEnabled.value
//   if (autoRefreshEnabled.value) {
//     startAutoRefresh()
//   } else {
//     stopAutoRefresh()
//   }
// }

// 监听自动刷新状态变化
watch(autoRefreshEnabled, (newVal) => {
  if (newVal) {
    startAutoRefresh()
  } else {
    stopAutoRefresh()
  }
})

// 监听主题变化，重新创建图表
watch(isDarkMode, () => {
  nextTick(() => {
    createModelUsageChart()
    createUsageTrendChart()
    createApiKeysUsageTrendChart()
    createAccountUsageTrendChart()
  })
})

// 监听色系变化，重新创建图表
watch(
  () => themeStore.colorScheme,
  () => {
    nextTick(() => {
      createModelUsageChart()
      createUsageTrendChart()
      createApiKeysUsageTrendChart()
      createAccountUsageTrendChart()
    })
  }
)

watch(locale, () => {
  nextTick(() => {
    createModelUsageChart()
    createUsageTrendChart()
    createApiKeysUsageTrendChart()
    createAccountUsageTrendChart()
  })
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
  createAccountUsageTrendChart()
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
  if (accountUsageTrendChartInstance) {
    accountUsageTrendChartInstance.destroy()
  }
})
</script>

<style scoped>
/* 日期选择器基本样式调整 - 让Element Plus官方暗黑模式生效 */
.custom-date-picker {
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
