<template>
  <div class="request-details-container">
    <div class="card p-4 sm:p-6">
      <div class="mb-4 flex flex-col gap-4 sm:mb-6">
        <div class="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div class="flex flex-wrap items-center gap-2 sm:gap-3">
              <h3 class="text-lg font-bold text-gray-900 dark:text-gray-100 sm:text-xl">
                请求明细
              </h3>
              <span
                :class="[
                  'inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold',
                  captureEnabled
                    ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                    : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                ]"
              >
                <span
                  :class="[
                    'mr-2 h-2 w-2 rounded-full',
                    captureEnabled ? 'bg-green-500' : 'bg-gray-400'
                  ]"
                />
                {{ captureEnabled ? '采集已开启' : '采集已关闭' }}
              </span>
              <span
                class="inline-flex items-center rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
              >
                <span class="mr-2 h-2 w-2 rounded-full bg-blue-500" />
                {{ formatRetentionHours(retentionHours) }}
              </span>
            </div>
            <p class="mt-1 text-sm text-gray-600 dark:text-gray-400 sm:text-base">
              {{ pageDescription }}
            </p>
          </div>
        </div>

        <div
          v-if="!captureEnabled && !loading && records.length === 0 && !hasActiveFilters"
          class="rounded-2xl border border-dashed border-gray-300 bg-gray-50/80 p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800/50"
        >
          <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 class="text-lg font-bold text-gray-900 dark:text-gray-100">
                请求明细采集尚未开启
              </h3>
              <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">
                到系统设置开启“请求明细采集”后，后台会开始记录新的请求摘要。历史请求不会回填。
              </p>
            </div>
            <div class="flex flex-col gap-2 sm:flex-row">
              <button
                class="group relative inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-all duration-200 hover:border-gray-300 hover:shadow-md dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:border-gray-500"
                @click="goToSettings"
              >
                <span
                  class="absolute -inset-0.5 rounded-lg bg-gradient-to-r from-blue-500 to-indigo-500 opacity-0 blur transition duration-300 group-hover:opacity-20"
                ></span>
                <i class="fas fa-cog relative text-blue-500" />
                <span class="relative">前往系统设置</span>
              </button>
              <el-tooltip placement="top">
                <template #content>
                  <div class="max-w-xs text-xs leading-relaxed">
                    清理所有已保存的历史请求体预览数据；仅影响历史预览，不影响当前请求体预览开关设置
                  </div>
                </template>
                <button
                  class="group relative inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-all duration-200 hover:border-gray-300 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:border-gray-500"
                  :disabled="requestDetailBodyPreviewPurging"
                  @click="handleRequestDetailBodyPreviewPurge"
                >
                  <span
                    class="absolute -inset-0.5 rounded-lg bg-gradient-to-r from-red-500 to-orange-500 opacity-0 blur transition duration-300 group-hover:opacity-20"
                  ></span>
                  <i
                    :class="[
                      'fas relative text-red-500',
                      requestDetailBodyPreviewPurging ? 'fa-spinner fa-spin' : 'fa-trash-alt'
                    ]"
                  />
                  <span class="relative">清理历史预览</span>
                </button>
              </el-tooltip>
            </div>
          </div>
        </div>

        <template v-else>
          <div
            v-if="!captureEnabled"
            class="rounded-xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200"
          >
            请求明细采集已关闭，当前展示的是仍在保留期内的历史记录；不会继续写入新的请求明细。
          </div>

          <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <div class="summary-card">
              <p class="summary-label">总请求</p>
              <p class="summary-value">{{ formatNumber(summary.totalRequests) }}</p>
            </div>
            <div class="summary-card">
              <p class="summary-label">输入 / 输出</p>
              <p class="summary-value">{{ formatNumber(summary.inputTokens) }}</p>
              <p class="summary-sub">输出 {{ formatNumber(summary.outputTokens) }}</p>
            </div>
            <div class="summary-card">
              <p class="summary-label">缓存命中率</p>
              <p class="summary-value text-cyan-600 dark:text-cyan-400">
                {{ formatPercent(summary.cacheHitRate) }}
              </p>
              <p class="summary-sub">
                读 {{ formatNumber(summary.cacheReadTokens) }} / 建
                {{ formatCacheCreate(summary.cacheCreateTokens, summary.cacheCreateNotApplicable) }}
              </p>
            </div>
            <div class="summary-card">
              <p class="summary-label">总费用</p>
              <p class="summary-value text-amber-600 dark:text-amber-400">
                {{ formatCost(summary.totalCost) }}
              </p>
            </div>
            <div class="summary-card">
              <p class="summary-label">平均耗时</p>
              <p class="summary-value">{{ formatDuration(summary.avgDurationMs) }}</p>
            </div>
          </div>

          <div
            class="rounded-2xl border border-gray-200 bg-gray-50/70 p-4 dark:border-gray-700 dark:bg-gray-800/40"
          >
            <div class="request-toolbar">
              <div class="request-filters">
                <div class="request-filter-row request-filter-row-primary">
                  <div class="toolbar-control group">
                    <div
                      class="toolbar-control-glow bg-gradient-to-r from-blue-500 to-purple-500"
                    ></div>
                    <el-date-picker
                      v-model="filters.dateRange"
                      class="toolbar-element w-full"
                      clearable
                      end-placeholder="结束时间"
                      format="YYYY-MM-DD HH:mm:ss"
                      start-placeholder="开始时间"
                      type="datetimerange"
                      unlink-panels
                    />
                  </div>

                  <div class="toolbar-control group">
                    <div
                      class="toolbar-control-glow bg-gradient-to-r from-cyan-500 to-teal-500"
                    ></div>
                    <el-input
                      v-model="filters.keyword"
                      class="toolbar-element w-full"
                      clearable
                      placeholder="搜索 Request ID / API Key / 账户 / 模型 / 接口"
                    >
                      <template #prefix>
                        <i class="fas fa-search text-cyan-500" />
                      </template>
                    </el-input>
                  </div>
                </div>

                <div class="request-filter-row request-filter-row-secondary">
                  <div class="toolbar-control group">
                    <div
                      class="toolbar-control-glow bg-gradient-to-r from-indigo-500 to-blue-500"
                    ></div>
                    <el-select
                      v-model="filters.apiKeyId"
                      class="toolbar-element w-full"
                      clearable
                      filterable
                      placeholder="所有 API Key"
                    >
                      <el-option
                        v-for="item in availableApiKeys"
                        :key="item.id"
                        :label="item.name"
                        :value="item.id"
                      />
                    </el-select>
                  </div>

                  <div class="toolbar-control group">
                    <div
                      class="toolbar-control-glow bg-gradient-to-r from-purple-500 to-pink-500"
                    ></div>
                    <el-select
                      v-model="filters.accountId"
                      class="toolbar-element w-full"
                      clearable
                      filterable
                      placeholder="所有账户"
                    >
                      <el-option
                        v-for="item in availableAccounts"
                        :key="item.id"
                        :label="`${item.name}（${item.accountTypeName}）`"
                        :value="item.id"
                      />
                    </el-select>
                  </div>

                  <div class="toolbar-control group">
                    <div
                      class="toolbar-control-glow bg-gradient-to-r from-emerald-500 to-green-500"
                    ></div>
                    <el-select
                      v-model="filters.model"
                      class="toolbar-element w-full"
                      clearable
                      filterable
                      placeholder="所有模型"
                    >
                      <el-option
                        v-for="item in availableModels"
                        :key="item"
                        :label="item"
                        :value="item"
                      />
                    </el-select>
                  </div>

                  <div class="toolbar-control group">
                    <div
                      class="toolbar-control-glow bg-gradient-to-r from-orange-500 to-amber-500"
                    ></div>
                    <el-select
                      v-model="filters.endpoint"
                      class="toolbar-element w-full"
                      clearable
                      filterable
                      placeholder="所有接口"
                    >
                      <el-option
                        v-for="item in availableEndpoints"
                        :key="item"
                        :label="item"
                        :value="item"
                      />
                    </el-select>
                  </div>

                  <div class="toolbar-control group">
                    <div
                      class="toolbar-control-glow bg-gradient-to-r from-slate-500 to-gray-500"
                    ></div>
                    <el-select
                      v-model="filters.sortOrder"
                      class="toolbar-element w-full"
                      placeholder="时间排序"
                    >
                      <el-option label="时间降序" value="desc" />
                      <el-option label="时间升序" value="asc" />
                    </el-select>
                  </div>
                </div>
              </div>

              <div class="request-toolbar-actions">
                <button
                  class="toolbar-action-button group relative flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-all duration-200 hover:border-gray-300 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:border-gray-500"
                  :disabled="loading"
                  @click="refreshRecords"
                >
                  <span
                    class="absolute -inset-0.5 rounded-lg bg-gradient-to-r from-green-500 to-teal-500 opacity-0 blur transition duration-300 group-hover:opacity-20"
                  ></span>
                  <i
                    :class="[
                      'fas relative text-green-500',
                      loading ? 'fa-spinner fa-spin' : 'fa-sync-alt'
                    ]"
                  />
                  <span class="relative">刷新</span>
                </button>

                <button
                  class="toolbar-action-button group relative flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-all duration-200 hover:border-gray-300 hover:shadow-md dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:border-gray-500"
                  @click="resetFilters"
                >
                  <span
                    class="absolute -inset-0.5 rounded-lg bg-gradient-to-r from-gray-400 to-gray-500 opacity-0 blur transition duration-300 group-hover:opacity-20"
                  ></span>
                  <i class="fas fa-undo relative text-gray-500" />
                  <span class="relative">重置筛选</span>
                </button>

                <button
                  class="toolbar-action-button group relative flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-all duration-200 hover:border-gray-300 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:border-gray-500"
                  :disabled="exporting"
                  @click="exportCsv"
                >
                  <span
                    class="absolute -inset-0.5 rounded-lg bg-gradient-to-r from-blue-500 to-indigo-500 opacity-0 blur transition duration-300 group-hover:opacity-20"
                  ></span>
                  <i
                    :class="[
                      'fas relative text-blue-500',
                      exporting ? 'fa-spinner fa-spin' : 'fa-file-export'
                    ]"
                  />
                  <span class="relative">导出 CSV</span>
                </button>

                <el-tooltip placement="top">
                  <template #content>
                    <div class="max-w-xs text-xs leading-relaxed">
                      清理所有已保存的历史请求体预览数据；仅影响历史预览，不影响当前请求体预览开关设置
                    </div>
                  </template>
                  <button
                    class="toolbar-action-button group relative flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-all duration-200 hover:border-gray-300 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:border-gray-500"
                    :disabled="requestDetailBodyPreviewPurging"
                    @click="handleRequestDetailBodyPreviewPurge"
                  >
                    <span
                      class="absolute -inset-0.5 rounded-lg bg-gradient-to-r from-red-500 to-orange-500 opacity-0 blur transition duration-300 group-hover:opacity-20"
                    ></span>
                    <i
                      :class="[
                        'fas relative text-red-500',
                        requestDetailBodyPreviewPurging ? 'fa-spinner fa-spin' : 'fa-trash-alt'
                      ]"
                    />
                    <span class="relative">清理历史预览</span>
                  </button>
                </el-tooltip>
              </div>
            </div>
          </div>
        </template>
      </div>

      <div class="table-wrapper">
        <div
          v-if="loading"
          class="flex items-center justify-center p-12 text-gray-500 dark:text-gray-400"
        >
          <i class="fas fa-spinner fa-spin mr-2" />加载中...
        </div>

        <div
          v-else-if="records.length === 0"
          class="flex flex-col items-center gap-3 p-12 text-center text-gray-500 dark:text-gray-400"
        >
          <i class="fas fa-inbox text-3xl text-cyan-500" />
          <p class="text-base font-semibold text-gray-700 dark:text-gray-200">暂无请求明细</p>
          <p class="max-w-xl text-sm">
            {{ emptyHint }}
          </p>
        </div>

        <div v-else class="space-y-4">
          <div class="table-container hidden xl:block">
            <table class="request-table w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead
                class="sticky top-0 z-10 bg-gradient-to-b from-gray-50 to-gray-100/90 backdrop-blur-sm dark:from-gray-700 dark:to-gray-800/90"
              >
                <tr>
                  <th
                    class="min-w-[170px] px-3 py-4 text-left text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300"
                  >
                    统计时间
                  </th>
                  <th
                    class="min-w-[170px] px-3 py-4 text-left text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300"
                  >
                    API Key
                  </th>
                  <th
                    class="min-w-[170px] px-3 py-4 text-left text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300"
                  >
                    使用账户
                  </th>
                  <th
                    class="min-w-[140px] px-3 py-4 text-left text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300"
                  >
                    模型
                  </th>
                  <th
                    class="min-w-[110px] px-3 py-4 text-left text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300"
                  >
                    推理
                  </th>
                  <th
                    class="min-w-[180px] px-3 py-4 text-left text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300"
                  >
                    接口
                  </th>
                  <th
                    class="min-w-[96px] px-3 py-4 text-left text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300"
                  >
                    输入
                  </th>
                  <th
                    class="min-w-[96px] px-3 py-4 text-left text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300"
                  >
                    输出
                  </th>
                  <th
                    class="min-w-[110px] px-3 py-4 text-left text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300"
                  >
                    缓存读取
                  </th>
                  <th
                    class="min-w-[110px] px-3 py-4 text-left text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300"
                  >
                    缓存创建
                  </th>
                  <th
                    class="min-w-[110px] px-3 py-4 text-left text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300"
                  >
                    缓存命中率
                  </th>
                  <th
                    class="min-w-[100px] px-3 py-4 text-left text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300"
                  >
                    费用
                  </th>
                  <th
                    class="min-w-[100px] px-3 py-4 text-left text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300"
                  >
                    耗时
                  </th>
                  <th
                    class="min-w-[96px] px-3 py-4 text-right text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300"
                  >
                    操作
                  </th>
                </tr>
              </thead>
              <tbody
                class="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-900"
              >
                <tr
                  v-for="record in records"
                  :key="record.requestId"
                  class="request-row hover:bg-gray-50/90 dark:hover:bg-gray-800/70"
                >
                  <td class="table-cell">
                    <div class="font-medium">{{ formatDate(record.timestamp) }}</div>
                    <div class="text-xs text-gray-500 dark:text-gray-400">
                      {{ record.requestId }}
                    </div>
                  </td>
                  <td class="table-cell">
                    <div class="font-semibold">
                      {{ record.apiKeyName || record.apiKeyId || '-' }}
                    </div>
                    <div class="text-xs text-gray-500 dark:text-gray-400">
                      {{ record.apiKeyId || '-' }}
                    </div>
                  </td>
                  <td class="table-cell">
                    <div class="font-semibold">
                      {{ record.accountName || record.accountId || '-' }}
                    </div>
                    <div class="text-xs text-gray-500 dark:text-gray-400">
                      {{ record.accountTypeName || record.accountType || '-' }}
                    </div>
                  </td>
                  <td class="table-cell">{{ record.model }}</td>
                  <td class="table-cell">{{ formatReasoning(record.reasoningDisplay) }}</td>
                  <td class="table-cell">
                    <div>{{ record.endpoint || '-' }}</div>
                    <div class="text-xs text-gray-500 dark:text-gray-400">
                      {{ record.method || 'POST' }}
                    </div>
                  </td>
                  <td class="table-cell text-blue-600 dark:text-blue-400">
                    {{ formatNumber(record.inputTokens) }}
                  </td>
                  <td class="table-cell text-green-600 dark:text-green-400">
                    {{ formatNumber(record.outputTokens) }}
                  </td>
                  <td class="table-cell text-cyan-600 dark:text-cyan-400">
                    {{ formatNumber(record.cacheReadTokens) }}
                  </td>
                  <td class="table-cell text-purple-600 dark:text-purple-400">
                    {{
                      formatCacheCreate(record.cacheCreateTokens, record.cacheCreateNotApplicable)
                    }}
                  </td>
                  <td class="table-cell">{{ formatPercent(record.cacheHitRate) }}</td>
                  <td class="table-cell text-amber-600 dark:text-amber-400">
                    {{ formatCost(record.cost) }}
                  </td>
                  <td class="table-cell">{{ formatDuration(record.durationMs) }}</td>
                  <td class="table-cell text-right">
                    <button
                      class="inline-flex items-center rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition-all duration-200 hover:border-gray-300 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:border-gray-500 dark:hover:bg-gray-700"
                      @click="openDetail(record.requestId)"
                    >
                      详情
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="space-y-3 xl:hidden">
            <div
              v-for="record in records"
              :key="record.requestId"
              class="card p-4 transition-shadow hover:shadow-lg"
            >
              <div class="flex items-start justify-between gap-3">
                <div>
                  <p class="text-sm font-bold text-gray-900 dark:text-gray-100">
                    {{ record.model }}
                  </p>
                  <p class="text-xs text-gray-500 dark:text-gray-400">
                    {{ formatDate(record.timestamp) }}
                  </p>
                  <p class="text-xs text-gray-500 dark:text-gray-400">
                    {{ record.endpoint || '-' }}
                  </p>
                </div>
                <button
                  class="inline-flex items-center rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition-all duration-200 hover:border-gray-300 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:border-gray-500 dark:hover:bg-gray-700"
                  @click="openDetail(record.requestId)"
                >
                  详情
                </button>
              </div>
              <div class="mt-3 grid grid-cols-2 gap-2 text-sm text-gray-700 dark:text-gray-300">
                <div>API Key：{{ record.apiKeyName || '-' }}</div>
                <div>账户：{{ record.accountName || '-' }}</div>
                <div>推理：{{ formatReasoning(record.reasoningDisplay) }}</div>
                <div>输入：{{ formatNumber(record.inputTokens) }}</div>
                <div>输出：{{ formatNumber(record.outputTokens) }}</div>
                <div>缓存读：{{ formatNumber(record.cacheReadTokens) }}</div>
                <div>
                  缓存建：{{
                    formatCacheCreate(record.cacheCreateTokens, record.cacheCreateNotApplicable)
                  }}
                </div>
                <div>命中率：{{ formatPercent(record.cacheHitRate) }}</div>
                <div>耗时：{{ formatDuration(record.durationMs) }}</div>
                <div class="text-amber-600 dark:text-amber-400">
                  费用：{{ formatCost(record.cost) }}
                </div>
                <div class="text-xs text-gray-500 dark:text-gray-400">{{ record.requestId }}</div>
              </div>
            </div>
          </div>

          <div
            class="flex flex-col gap-3 border-t border-gray-200 px-4 pb-4 pt-4 dark:border-gray-700 sm:flex-row sm:items-center sm:justify-between"
          >
            <div class="text-sm text-gray-500 dark:text-gray-400">
              共 {{ pagination.totalRecords }} 条记录
            </div>
            <el-pagination
              background
              :current-page="pagination.currentPage"
              layout="prev, pager, next, sizes"
              :page-size="pagination.pageSize"
              :page-sizes="[20, 50, 100, 200]"
              :total="pagination.totalRecords"
              @current-change="handlePageChange"
              @size-change="handleSizeChange"
            />
          </div>
        </div>
      </div>

      <RequestDetailModal
        :request-id="activeRequestId"
        :show="detailVisible"
        @close="closeDetail"
      />
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import dayjs from 'dayjs'
import { debounce } from 'lodash-es'
import { useRouter } from 'vue-router'
import {
  getRequestDetailsApi,
  getRequestDetailBodyPreviewStatsApi,
  purgeRequestDetailBodyPreviewApi
} from '@/utils/http_apis'
import { showToast, formatDate, formatNumber } from '@/utils/tools'
import RequestDetailModal from '@/components/admin/RequestDetailModal.vue'

const router = useRouter()

let fetchVersion = 0
const loading = ref(false)
const exporting = ref(false)
const requestDetailBodyPreviewPurging = ref(false)
const detailVisible = ref(false)
const activeRequestId = ref('')
const activeSnapshotId = ref(null)
const captureEnabled = ref(false)
const retentionHours = ref(6)
const bodyPreviewEnabled = ref(false)
const records = ref([])
const availableApiKeys = ref([])
const availableAccounts = ref([])
const availableModels = ref([])
const availableEndpoints = ref([])

const pagination = reactive({
  currentPage: 1,
  pageSize: 50,
  totalRecords: 0
})

const filters = reactive({
  dateRange: null,
  keyword: '',
  apiKeyId: '',
  accountId: '',
  model: '',
  endpoint: '',
  sortOrder: 'desc'
})

const hasActiveFilters = computed(() => {
  return !!(
    filters.keyword ||
    filters.apiKeyId ||
    filters.accountId ||
    filters.model ||
    filters.endpoint ||
    (filters.dateRange && filters.dateRange.length === 2)
  )
})

const summary = reactive({
  totalRequests: 0,
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheCreateTokens: 0,
  totalCost: 0,
  avgDurationMs: 0,
  cacheHitRate: 0,
  cacheCreateNotApplicable: false
})

const pageDescription = computed(() =>
  bodyPreviewEnabled.value
    ? '搜索每次请求的 API Key、使用账户、模型、接口、Token、费用、耗时与脱敏后的请求快照'
    : '搜索每次请求的 API Key、使用账户、模型、接口、Token、费用、耗时与请求摘要'
)

const emptyHint = computed(() => {
  if (
    filters.keyword ||
    filters.apiKeyId ||
    filters.accountId ||
    filters.model ||
    filters.endpoint
  ) {
    return '当前筛选条件下没有结果，请尝试放宽搜索条件。'
  }
  return '这里只展示开启请求明细采集之后的新请求记录。'
})

const toPickerDate = (value) => {
  const parsed = dayjs(value)
  return parsed.isValid() ? parsed.toDate() : null
}

const getDateRangeTimestamp = (value) => {
  const parsed = dayjs(value)
  return parsed.isValid() ? parsed.valueOf() : null
}

const areDateRangesEqual = (currentRange = [], nextRange = []) => {
  if (!Array.isArray(currentRange) || !Array.isArray(nextRange)) {
    return false
  }

  if (currentRange.length !== nextRange.length) {
    return false
  }

  return currentRange.every(
    (value, index) => getDateRangeTimestamp(value) === getDateRangeTimestamp(nextRange[index])
  )
}

const buildParams = (page, snapshotId = activeSnapshotId.value) => {
  const params = {
    page,
    pageSize: pagination.pageSize,
    sortOrder: filters.sortOrder
  }

  if (filters.keyword) params.keyword = filters.keyword
  if (filters.apiKeyId) params.apiKeyId = filters.apiKeyId
  if (filters.accountId) params.accountId = filters.accountId
  if (filters.model) params.model = filters.model
  if (filters.endpoint) params.endpoint = filters.endpoint
  if (filters.dateRange && filters.dateRange.length === 2) {
    const [startDate, endDate] = filters.dateRange
    const parsedStart = dayjs(startDate)
    const parsedEnd = dayjs(endDate)

    if (parsedStart.isValid() && parsedEnd.isValid()) {
      params.startDate = parsedStart.toISOString()
      params.endDate = parsedEnd.toISOString()
    }
  }

  if (snapshotId) params.snapshotId = snapshotId

  return params
}

const syncResponseState = (data) => {
  captureEnabled.value = data.captureEnabled === true
  retentionHours.value = data.retentionHours || 6
  bodyPreviewEnabled.value = data.bodyPreviewEnabled === true
  activeSnapshotId.value = data.snapshotId || null
  records.value = data.records || []

  const pageInfo = data.pagination || {}
  pagination.currentPage = pageInfo.currentPage || 1
  pagination.pageSize = pageInfo.pageSize || pagination.pageSize
  pagination.totalRecords = pageInfo.totalRecords || 0

  const filterEcho = data.filters || {}
  // keyword 不回写：用户可能正在输入，回写会覆盖用户当前的输入
  filters.apiKeyId = filterEcho.apiKeyId || ''
  filters.accountId = filterEcho.accountId || ''
  filters.model = filterEcho.model || ''
  filters.endpoint = filterEcho.endpoint || ''
  filters.sortOrder = filterEcho.sortOrder || 'desc'
  if (filterEcho.startDate && filterEcho.endDate) {
    const nextRange = [toPickerDate(filterEcho.startDate), toPickerDate(filterEcho.endDate)]
    if (
      filterEcho.hasCustomDateRange &&
      nextRange.every(Boolean) &&
      !areDateRangesEqual(filters.dateRange || [], nextRange)
    ) {
      suppressDateRangeWatch = true
      filters.dateRange = nextRange
    }
  }

  availableApiKeys.value = data.availableFilters?.apiKeys || []
  availableAccounts.value = data.availableFilters?.accounts || []
  availableModels.value = data.availableFilters?.models || []
  availableEndpoints.value = data.availableFilters?.endpoints || []

  const summaryData = data.summary || {}
  summary.totalRequests = summaryData.totalRequests || 0
  summary.inputTokens = summaryData.inputTokens || 0
  summary.outputTokens = summaryData.outputTokens || 0
  summary.cacheReadTokens = summaryData.cacheReadTokens || 0
  summary.cacheCreateTokens = summaryData.cacheCreateTokens || 0
  summary.totalCost = summaryData.totalCost || 0
  summary.avgDurationMs = summaryData.avgDurationMs || 0
  summary.cacheHitRate = summaryData.cacheHitRate || 0
  summary.cacheCreateNotApplicable = summaryData.cacheCreateNotApplicable === true
}

let suppressDateRangeWatch = false

const invalidateSnapshot = () => {
  activeSnapshotId.value = null
}

const fetchRecords = async (page = pagination.currentPage) => {
  debouncedKeywordFetch.cancel()
  const version = ++fetchVersion
  loading.value = true
  try {
    const response = await getRequestDetailsApi(buildParams(page))
    if (version !== fetchVersion) return
    if (response?.success === false) {
      showToast(response.message || '加载请求明细失败', 'error')
      return
    }
    syncResponseState(response.data || {})
  } catch (error) {
    if (version !== fetchVersion) return
    showToast(`加载请求明细失败：${error.message || '未知错误'}`, 'error')
  } finally {
    if (version === fetchVersion) {
      loading.value = false
    }
  }
}

const handlePageChange = (page) => {
  pagination.currentPage = page
  fetchRecords(page)
}

const handleSizeChange = (size) => {
  pagination.pageSize = size
  pagination.currentPage = 1
  fetchRecords(1)
}

const refreshRecords = () => {
  invalidateSnapshot()
  fetchRecords(pagination.currentPage)
}

const resetFilters = () => {
  invalidateSnapshot()
  filters.dateRange = null
  filters.keyword = ''
  filters.apiKeyId = ''
  filters.accountId = ''
  filters.model = ''
  filters.endpoint = ''
  filters.sortOrder = 'desc'
  pagination.currentPage = 1
  fetchRecords(1)
  // resetFilters 同步写 filters.keyword = '' 会触发 keyword watcher 排一个新 debounce，
  // 需要在 watcher 执行后（nextTick）取消它，避免多余请求和 loading 闪烁
  nextTick(() => debouncedKeywordFetch.cancel())
}

const handleRequestDetailBodyPreviewPurge = async () => {
  if (requestDetailBodyPreviewPurging.value) return

  try {
    const statsResponse = await getRequestDetailBodyPreviewStatsApi()

    if (statsResponse?.success === false) {
      showToast(statsResponse.message || '检查历史请求体预览失败', 'error')
      return
    }

    const snapshotCount = Number(statsResponse?.data?.snapshotCount || 0)
    if (snapshotCount <= 0) {
      showToast('暂无历史请求体预览需要清理', 'success')
      return
    }

    const confirmed = window.confirm(
      `检测到当前仍有 ${snapshotCount} 条请求明细保存了请求体预览。\n清理后将仅移除历史请求体预览，保留请求明细摘要字段。\n\n是否继续？`
    )
    if (!confirmed) return

    requestDetailBodyPreviewPurging.value = true
    const purgeResponse = await purgeRequestDetailBodyPreviewApi()

    if (purgeResponse?.success === false) {
      showToast(purgeResponse.message || '清理历史请求体预览失败', 'error')
      return
    }

    showToast(purgeResponse?.message || '清理完毕', 'success')
  } catch (error) {
    showToast('清理历史请求体预览失败', 'error')
    console.error(error)
  } finally {
    requestDetailBodyPreviewPurging.value = false
  }
}

const goToSettings = () => router.push('/settings')
const openDetail = (requestId) => {
  activeRequestId.value = requestId
  detailVisible.value = true
}
const closeDetail = () => {
  detailVisible.value = false
  activeRequestId.value = ''
}

const exportCsv = async () => {
  if (exporting.value) return
  exporting.value = true
  try {
    const aggregated = []
    let page = 1
    let totalPages = 1
    let totalRecords = 0
    let snapshotId = activeSnapshotId.value
    const maxPages = 100

    while (page <= totalPages && page <= maxPages) {
      const response = await getRequestDetailsApi({
        ...buildParams(page, snapshotId),
        pageSize: 200
      })
      const payload = response.data || {}
      snapshotId = payload.snapshotId || null
      aggregated.push(...(payload.records || []))
      totalPages = payload.pagination?.totalPages || 1
      if (page === 1) {
        totalRecords = payload.pagination?.totalRecords || 0
      }
      page += 1
    }

    if (totalPages > maxPages) {
      showToast(
        `数据量超过导出上限（已导出 ${aggregated.length} 条，共 ${totalRecords} 条），建议缩小筛选范围后重试`,
        'warning'
      )
    }

    if (aggregated.length === 0) {
      showToast('没有可导出的记录', 'info')
      return
    }

    const headers = [
      '统计时间',
      'Request ID',
      'API Key',
      '使用账户',
      '消费类型',
      '模型',
      '推理',
      '接口',
      '输入',
      '输出',
      '缓存读取',
      '缓存创建',
      '缓存命中率',
      '费用',
      '耗时(ms)'
    ]

    const rows = [headers.join(',')]
    aggregated.forEach((record) => {
      const row = [
        formatDate(record.timestamp),
        record.requestId || '',
        record.apiKeyName || record.apiKeyId || '',
        record.accountName || record.accountId || '',
        record.accountTypeName || record.accountType || '',
        record.model || '',
        formatReasoning(record.reasoningDisplay),
        record.endpoint || '',
        record.inputTokens || 0,
        record.outputTokens || 0,
        record.cacheReadTokens || 0,
        formatCacheCreate(record.cacheCreateTokens, record.cacheCreateNotApplicable),
        formatPercent(record.cacheHitRate),
        formatCost(record.cost),
        record.durationMs || 0
      ]
      rows.push(row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    })

    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'request-details.csv'
    link.click()
    URL.revokeObjectURL(url)
    showToast('导出 CSV 成功', 'success')
  } catch (error) {
    showToast(`导出失败：${error.message || '未知错误'}`, 'error')
  } finally {
    exporting.value = false
  }
}

const formatCost = (value) => {
  const num = Number(value || 0)
  if (num >= 1) return `$${num.toFixed(2)}`
  if (num >= 0.001) return `$${num.toFixed(4)}`
  return `$${num.toFixed(6)}`
}
const formatCacheCreate = (value, notApplicable = false) =>
  notApplicable ? '-' : formatNumber(value)
const formatRetentionHours = (value) => {
  const totalHours = Number(value || 0)
  if (totalHours <= 0) return '保留 6 小时'

  const days = Math.floor(totalHours / 24)
  const hours = totalHours % 24

  if (days > 0 && hours > 0) {
    return `保留 ${days} 天 ${hours} 小时`
  }

  if (days > 0) {
    return `保留 ${days} 天`
  }

  return `保留 ${hours} 小时`
}
const formatDuration = (value) => `${Number(value || 0)}ms`
const formatPercent = (value) => `${Number(value || 0).toFixed(2)}%`
const formatReasoning = (value) => value || '-'

const debouncedKeywordFetch = debounce(() => {
  pagination.currentPage = 1
  invalidateSnapshot()
  fetchRecords(1)
}, 300)

watch(
  () => filters.keyword,
  () => {
    debouncedKeywordFetch()
  }
)

watch(
  () => [filters.apiKeyId, filters.accountId, filters.model, filters.endpoint, filters.sortOrder],
  () => {
    debouncedKeywordFetch.cancel()
    pagination.currentPage = 1
    invalidateSnapshot()
    fetchRecords(1)
  }
)

watch(
  () => filters.dateRange,
  () => {
    if (suppressDateRangeWatch) {
      suppressDateRangeWatch = false
      return
    }
    pagination.currentPage = 1
    invalidateSnapshot()
    fetchRecords(1)
  },
  { deep: true }
)

onMounted(() => {
  fetchRecords()
})
</script>

<style scoped>
.request-details-container {
  min-height: calc(100vh - 300px);
}

.summary-card {
  border: 1px solid rgba(226, 232, 240, 0.95);
  border-radius: 16px;
  padding: 18px;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.98), rgba(248, 250, 252, 0.96));
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.04);
}

.dark .summary-card {
  background: linear-gradient(135deg, rgba(31, 41, 55, 0.96), rgba(17, 24, 39, 0.94));
  border-color: rgba(75, 85, 99, 0.55);
}

.summary-label {
  font-size: 13px;
  font-weight: 600;
  color: rgb(107 114 128);
}

.summary-value {
  margin-top: 8px;
  font-size: 24px;
  font-weight: 800;
  color: rgb(15 23 42);
}

.dark .summary-value {
  color: rgb(241 245 249);
}

.summary-sub {
  margin-top: 6px;
  font-size: 12px;
  color: rgb(100 116 139);
}

.request-toolbar {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.request-filters {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.request-filter-row {
  display: grid;
  gap: 12px;
  min-width: 0;
}

.request-filter-row-primary,
.request-filter-row-secondary {
  grid-template-columns: minmax(0, 1fr);
}

.toolbar-control {
  position: relative;
  min-width: 0;
}

.toolbar-control-glow {
  position: absolute;
  inset: -2px;
  border-radius: 12px;
  opacity: 0;
  filter: blur(10px);
  transition: opacity 0.3s ease;
}

.toolbar-control:hover .toolbar-control-glow {
  opacity: 0.16;
}

.toolbar-control :deep(.el-input__wrapper),
.toolbar-control :deep(.el-select__wrapper) {
  min-height: 40px;
  border-radius: 10px;
  border: 1px solid rgb(229 231 235);
  background: rgb(255 255 255);
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.05);
}

.toolbar-control :deep(.el-input__wrapper:hover),
.toolbar-control :deep(.el-select__wrapper:hover) {
  border-color: rgb(209 213 219);
}

.toolbar-control :deep(.el-input__wrapper.is-focus),
.toolbar-control :deep(.el-select__wrapper.is-focused) {
  border-color: rgb(6 182 212);
  box-shadow: 0 0 0 1px rgba(6, 182, 212, 0.15);
}

.dark .toolbar-control :deep(.el-input__wrapper),
.dark .toolbar-control :deep(.el-select__wrapper) {
  border-color: rgb(75 85 99);
  background: rgb(31 41 55);
}

.toolbar-control :deep(.el-date-editor) {
  width: 100%;
}

.request-toolbar-actions {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.toolbar-action-button {
  min-width: 112px;
  white-space: nowrap;
}

.table-cell {
  padding: 14px 16px;
  font-size: 13px;
  color: rgb(31 41 55);
  vertical-align: top;
}

.dark .table-cell {
  color: rgb(226 232 240);
}

.table-wrapper {
  overflow: hidden;
  border-radius: 12px;
  border: 1px solid rgba(0, 0, 0, 0.05);
  width: 100%;
  position: relative;
}

.dark .table-wrapper {
  border-color: rgba(255, 255, 255, 0.1);
}

.table-container {
  overflow-x: auto;
  overflow-y: hidden;
  margin: 0;
  padding: 0;
  max-width: 100%;
  position: relative;
  -webkit-overflow-scrolling: touch;
}

.table-container table {
  min-width: 1500px;
  border-collapse: collapse;
  table-layout: auto;
}

.request-table {
  width: max(100%, 1500px);
}

.table-container::-webkit-scrollbar {
  height: 8px;
}

.table-container::-webkit-scrollbar-track {
  background: #f3f4f6;
  border-radius: 4px;
}

.table-container::-webkit-scrollbar-thumb {
  background: #d1d5db;
  border-radius: 4px;
}

.table-container::-webkit-scrollbar-thumb:hover {
  background: #9ca3af;
}

.dark .table-container::-webkit-scrollbar-track {
  background: rgba(31, 41, 55, 0.9);
}

.dark .table-container::-webkit-scrollbar-thumb {
  background: rgba(107, 114, 128, 0.9);
}

.request-table tbody tr:nth-child(even) {
  background: rgba(249, 250, 251, 0.65);
}

.dark .request-table tbody tr:nth-child(even) {
  background: rgba(31, 41, 55, 0.55);
}

@media (min-width: 768px) {
  .request-filter-row-primary {
    grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr);
  }

  .request-filter-row-secondary {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .request-toolbar-actions {
    flex-direction: row;
    flex-wrap: wrap;
  }
}

@media (min-width: 1280px) {
  .request-toolbar {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: start;
    gap: 16px;
  }

  .request-filter-row-primary {
    grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr);
  }

  .request-filter-row-secondary {
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }

  .request-toolbar-actions {
    align-self: stretch;
    justify-content: flex-end;
    flex-wrap: nowrap;
  }
}
</style>
