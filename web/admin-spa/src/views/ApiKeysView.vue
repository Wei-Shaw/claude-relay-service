<template>
  <div class="tab-content">
    <div class="card p-4 sm:p-6">
      <div class="flex flex-col gap-4 mb-4 sm:mb-6">
        <div>
          <h3 class="text-lg sm:text-xl font-bold text-gray-900 mb-1 sm:mb-2">
            API Keys 管理
          </h3>
          <p class="text-sm sm:text-base text-gray-600">
            管理和监控您的 API 密钥
          </p>
        </div>
        <div class="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
          <!-- Token统计时间范围选择 -->
          <div class="flex flex-wrap gap-2 items-center">
            <select 
              v-model="apiKeyStatsTimeRange" 
              class="px-3 py-2 text-sm text-gray-700 bg-white border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent hover:border-gray-300 transition-colors"
              @change="loadApiKeys()"
            >
              <option value="today">
                今日
              </option>
              <option value="7days">
                最近7天
              </option>
              <option value="monthly">
                本月
              </option>
              <option value="all">
                全部时间
              </option>
            </select>
            <!-- 标签筛选器 -->
            <select 
              v-model="selectedTagFilter" 
              class="px-3 py-2 text-sm text-gray-700 bg-white border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent hover:border-gray-300 transition-colors"
              @change="currentPage = 1"
            >
              <option value="">
                所有标签
              </option>
              <option
                v-for="tag in availableTags"
                :key="tag"
                :value="tag"
              >
                {{ tag }}
              </option>
            </select>
          </div>
          <button 
            class="btn btn-primary px-4 py-2 text-sm flex items-center gap-2 w-full sm:w-auto justify-center"
            @click.stop="openCreateApiKeyModal"
          >
            <i class="fas fa-plus" />创建新 Key
          </button>
        </div>
      </div>
      
      <div
        v-if="apiKeysLoading"
        class="text-center py-12"
      >
        <div class="loading-spinner mx-auto mb-4" />
        <p class="text-gray-500">
          正在加载 API Keys...
        </p>
      </div>
      
      <div
        v-else-if="apiKeys.length === 0"
        class="text-center py-12"
      >
        <div class="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
          <i class="fas fa-key text-gray-400 text-xl" />
        </div>
        <p class="text-gray-500 text-lg">
          暂无 API Keys
        </p>
        <p class="text-gray-400 text-sm mt-2">
          点击上方按钮创建您的第一个 API Key
        </p>
      </div>
      
      <!-- 桌面端表格视图 -->
      <div
        v-else
        class="hidden md:block table-container"
      >
        <table class="w-full table-fixed">
          <thead class="bg-gray-50/80 backdrop-blur-sm">
            <tr>
              <th
                class="px-3 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-100 w-[25%] min-w-[200px]"
                @click="sortApiKeys('name')"
              >
                名称
                <i
                  v-if="apiKeysSortBy === 'name'"
                  :class="['fas', apiKeysSortOrder === 'asc' ? 'fa-sort-up' : 'fa-sort-down', 'ml-1']"
                />
                <i
                  v-else
                  class="fas fa-sort ml-1 text-gray-400"
                />
              </th>
              <th class="px-3 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider w-[10%] min-w-[80px]">
                标签
              </th>
              <th
                class="px-3 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-100 w-[8%] min-w-[70px]"
                @click="sortApiKeys('status')"
              >
                状态
                <i
                  v-if="apiKeysSortBy === 'status'"
                  :class="['fas', apiKeysSortOrder === 'asc' ? 'fa-sort-up' : 'fa-sort-down', 'ml-1']"
                />
                <i
                  v-else
                  class="fas fa-sort ml-1 text-gray-400"
                />
              </th>
              <th class="px-3 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider w-[17%] min-w-[140px]">
                使用统计
                <span
                  class="cursor-pointer hover:bg-gray-100 px-2 py-1 rounded"
                  @click="sortApiKeys('cost')"
                >
                  (费用
                  <i
                    v-if="apiKeysSortBy === 'cost'"
                    :class="['fas', apiKeysSortOrder === 'asc' ? 'fa-sort-up' : 'fa-sort-down', 'ml-1']"
                  />
                  <i
                    v-else
                    class="fas fa-sort ml-1 text-gray-400"
                  />)
                </span>
              </th>
              <th
                class="px-3 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-100 w-[10%] min-w-[90px]"
                @click="sortApiKeys('createdAt')"
              >
                创建时间
                <i
                  v-if="apiKeysSortBy === 'createdAt'"
                  :class="['fas', apiKeysSortOrder === 'asc' ? 'fa-sort-up' : 'fa-sort-down', 'ml-1']"
                />
                <i
                  v-else
                  class="fas fa-sort ml-1 text-gray-400"
                />
              </th>
              <th
                class="px-3 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-100 w-[10%] min-w-[90px]"
                @click="sortApiKeys('expiresAt')"
              >
                过期时间
                <i
                  v-if="apiKeysSortBy === 'expiresAt'"
                  :class="['fas', apiKeysSortOrder === 'asc' ? 'fa-sort-up' : 'fa-sort-down', 'ml-1']"
                />
                <i
                  v-else
                  class="fas fa-sort ml-1 text-gray-400"
                />
              </th>
              <th class="px-3 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider w-[20%] min-w-[180px]">
                操作
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200/50">
            <template
              v-for="key in paginatedApiKeys"
              :key="key.id"
            >
              <!-- API Key 主行 -->
              <tr class="table-row">
                <td class="px-3 py-4">
                  <div class="flex items-center">
                    <div class="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center mr-2 flex-shrink-0">
                      <i class="fas fa-key text-white text-xs" />
                    </div>
                    <div class="min-w-0">
                      <div 
                        class="text-sm font-semibold text-gray-900 truncate"
                        :title="key.name"
                      >
                        {{ key.name }}
                      </div>
                      <div 
                        class="text-xs text-gray-500 truncate"
                        :title="key.id"
                      >
                        {{ key.id }}
                      </div>
                      <div class="text-xs text-gray-500 mt-1 truncate">
                        <span 
                          v-if="key.claudeAccountId"
                          :title="`绑定: ${getBoundAccountName(key.claudeAccountId)}`"
                        >
                          <i class="fas fa-link mr-1" />
                          {{ getBoundAccountName(key.claudeAccountId) }}
                        </span>
                        <span v-else>
                          <i class="fas fa-share-alt mr-1" />
                          共享池
                        </span>
                      </div>
                    </div>
                  </div>
                </td>
                <td class="px-3 py-4">
                  <div class="flex flex-wrap gap-1">
                    <span
                      v-for="tag in (key.tags || [])"
                      :key="tag" 
                      class="inline-flex items-center px-2 py-0.5 bg-blue-100 text-blue-800 text-xs rounded-full"
                    >
                      {{ tag }}
                    </span>
                    <span
                      v-if="!key.tags || key.tags.length === 0" 
                      class="text-xs text-gray-400"
                    >无标签</span>
                  </div>
                </td>
                <td class="px-3 py-4 whitespace-nowrap">
                  <span
                    :class="['inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold', 
                             key.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800']"
                  >
                    <div
                      :class="['w-2 h-2 rounded-full mr-2', 
                               key.isActive ? 'bg-green-500' : 'bg-red-500']"
                    />
                    {{ key.isActive ? '活跃' : '禁用' }}
                  </span>
                </td>
                <td class="px-3 py-4">
                  <div class="space-y-2">
                    <!-- 今日使用统计 -->
                    <div class="mb-2">
                      <div class="flex justify-between items-center text-sm mb-1">
                        <span class="text-gray-600">今日请求</span>
                        <span class="font-semibold text-gray-900">{{ formatNumber((key.usage?.daily?.requests) || 0) }}次</span>
                      </div>
                      <div class="flex justify-between items-center text-sm">
                        <span class="text-gray-600">今日费用</span>
                        <span class="font-semibold text-green-600">${{ (key.dailyCost || 0).toFixed(4) }}</span>
                      </div>
                    </div>
                    
                    <!-- 每日费用限制进度条 -->
                    <div 
                      v-if="key.dailyCostLimit > 0" 
                      class="space-y-1"
                    >
                      <div class="flex justify-between items-center text-xs">
                        <span class="text-gray-500">费用限额</span>
                        <span class="text-gray-700">
                          ${{ (key.dailyCost || 0).toFixed(2) }} / ${{ key.dailyCostLimit.toFixed(2) }}
                        </span>
                      </div>
                      <div class="w-full bg-gray-200 rounded-full h-1.5">
                        <div 
                          :class="getDailyCostProgressColor(key)"
                          class="h-1.5 rounded-full transition-all duration-300"
                          :style="{ width: getDailyCostProgress(key) + '%' }"
                        />
                      </div>
                    </div>
                    
                    <!-- 时间窗口限制进度条 -->
                    <div 
                      v-if="key.rateLimitWindow > 0" 
                      class="space-y-1"
                    >
                      <div class="flex justify-between items-center text-xs">
                        <span class="text-gray-500">窗口限制</span>
                        <span class="text-gray-700">
                          {{ key.rateLimitWindow }}分钟
                        </span>
                      </div>
                      
                      <!-- 请求次数限制 -->
                      <div 
                        v-if="key.rateLimitRequests > 0" 
                        class="space-y-0.5"
                      >
                        <div class="flex justify-between items-center text-xs">
                          <span class="text-gray-400">请求</span>
                          <span class="text-gray-600">
                            {{ key.currentWindowRequests || 0 }}/{{ key.rateLimitRequests }}
                          </span>
                        </div>
                        <div class="w-full bg-gray-200 rounded-full h-1">
                          <div 
                            :class="getWindowRequestProgressColor(key)"
                            class="h-1 rounded-full transition-all duration-300"
                            :style="{ width: getWindowRequestProgress(key) + '%' }"
                          />
                        </div>
                      </div>
                      
                      <!-- Token使用量限制 -->
                      <div 
                        v-if="key.tokenLimit > 0" 
                        class="space-y-0.5"
                      >
                        <div class="flex justify-between items-center text-xs">
                          <span class="text-gray-400">Token</span>
                          <span class="text-gray-600">
                            {{ formatTokenCount(key.currentWindowTokens || 0) }}/{{ formatTokenCount(key.tokenLimit) }}
                          </span>
                        </div>
                        <div class="w-full bg-gray-200 rounded-full h-1">
                          <div 
                            :class="getWindowTokenProgressColor(key)"
                            class="h-1 rounded-full transition-all duration-300"
                            :style="{ width: getWindowTokenProgress(key) + '%' }"
                          />
                        </div>
                      </div>
                    </div>
                    
                    <!-- 查看详情按钮 -->
                    <div class="pt-1">
                      <button
                        class="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1 w-full justify-center py-1 hover:bg-blue-50 rounded transition-colors"
                        @click="showUsageDetails(key)"
                      >
                        <i class="fas fa-chart-line" />
                        查看详细统计
                      </button>
                    </div>
                  </div>
                </td>
                <td class="px-3 py-4 whitespace-nowrap text-sm text-gray-500">
                  {{ new Date(key.createdAt).toLocaleDateString() }}
                </td>
                <td class="px-3 py-4 whitespace-nowrap text-sm">
                  <div class="inline-flex items-center gap-1.5">
                    <span v-if="key.expiresAt">
                      <span
                        v-if="isApiKeyExpired(key.expiresAt)"
                        class="text-red-600 inline-flex items-center"
                      >
                        <i class="fas fa-exclamation-circle mr-1" />
                        已过期
                      </span>
                      <span
                        v-else-if="isApiKeyExpiringSoon(key.expiresAt)"
                        class="text-orange-600 inline-flex items-center"
                      >
                        <i class="fas fa-clock mr-1" />
                        {{ formatExpireDate(key.expiresAt) }}
                      </span>
                      <span
                        v-else
                        class="text-gray-600"
                      >
                        {{ formatExpireDate(key.expiresAt) }}
                      </span>
                    </span>
                    <span
                      v-else
                      class="text-gray-400 inline-flex items-center"
                    >
                      <i class="fas fa-infinity mr-1" />
                      永不过期
                    </span>
                    <button
                      class="inline-flex items-center justify-center w-6 h-6 text-gray-300 hover:text-blue-500 hover:bg-blue-50 rounded-md transition-all duration-200"
                      title="编辑过期时间"
                      @click.stop="startEditExpiry(key)"
                    >
                      <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path>
                      </svg>
                    </button>
                  </div>
                </td>
                <td class="px-3 py-4 whitespace-nowrap text-sm">
                  <div class="flex gap-1">
                    <button
                      v-if="key && key.id"
                      class="text-indigo-600 hover:text-indigo-900 font-medium hover:bg-indigo-50 px-2 py-1 rounded transition-colors text-xs"
                      title="模型使用分布"
                      @click="toggleApiKeyModelStats(key.id)"
                    >
                      <i :class="['fas', expandedApiKeys[key.id] ? 'fa-chevron-up' : 'fa-chevron-down']" />
                      <span class="hidden xl:inline ml-1">模型</span>
                    </button>
                    <button 
                      class="text-purple-600 hover:text-purple-900 font-medium hover:bg-purple-50 px-2 py-1 rounded transition-colors text-xs" 
                      title="复制统计页面链接"
                      @click="copyApiStatsLink(key)"
                    >
                      <i class="fas fa-chart-bar" />
                      <span class="hidden xl:inline ml-1">统计</span>
                    </button>
                    <button 
                      class="text-blue-600 hover:text-blue-900 font-medium hover:bg-blue-50 px-2 py-1 rounded transition-colors text-xs" 
                      title="编辑"
                      @click="openEditApiKeyModal(key)"
                    >
                      <i class="fas fa-edit" />
                      <span class="hidden xl:inline ml-1">编辑</span>
                    </button>
                    <button 
                      v-if="key.expiresAt && (isApiKeyExpired(key.expiresAt) || isApiKeyExpiringSoon(key.expiresAt))"
                      class="text-green-600 hover:text-green-900 font-medium hover:bg-green-50 px-2 py-1 rounded transition-colors text-xs" 
                      title="续期"
                      @click="openRenewApiKeyModal(key)"
                    >
                      <i class="fas fa-clock" />
                      <span class="hidden xl:inline ml-1">续期</span>
                    </button>
                    <button 
                      class="text-red-600 hover:text-red-900 font-medium hover:bg-red-50 px-2 py-1 rounded transition-colors text-xs" 
                      title="删除"
                      @click="deleteApiKey(key.id)"
                    >
                      <i class="fas fa-trash" />
                      <span class="hidden xl:inline ml-1">删除</span>
                    </button>
                  </div>
                </td>
              </tr>
              
              <!-- 模型统计展开区域 -->
              <tr v-if="key && key.id && expandedApiKeys[key.id]">
                <td
                  colspan="7"
                  class="px-3 py-4 bg-gray-50"
                >
                  <div
                    v-if="!apiKeyModelStats[key.id]"
                    class="text-center py-4"
                  >
                    <div class="loading-spinner mx-auto" />
                    <p class="text-sm text-gray-500 mt-2">
                      加载模型统计...
                    </p>
                  </div>
                  <div class="space-y-4">
                    <!-- 通用的标题和时间筛选器，无论是否有数据都显示 -->
                    <div class="flex items-center justify-between mb-4">
                      <h5 class="text-sm font-semibold text-gray-700 flex items-center">
                        <i class="fas fa-chart-pie text-indigo-500 mr-2" />
                        模型使用分布
                      </h5>
                      <div class="flex items-center gap-2">
                        <span
                          v-if="apiKeyModelStats[key.id] && apiKeyModelStats[key.id].length > 0"
                          class="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full"
                        >
                          {{ apiKeyModelStats[key.id].length }} 个模型
                        </span>
                        
                        <!-- API Keys日期筛选器 -->
                        <div class="flex gap-1 items-center">
                          <!-- 快捷日期选择 -->
                          <div class="flex gap-1 bg-gray-100 rounded p-1">
                            <button 
                              v-for="option in getApiKeyDateFilter(key.id).presetOptions" 
                              :key="option.value"
                              :class="[
                                'px-2 py-1 rounded text-xs font-medium transition-colors',
                                getApiKeyDateFilter(key.id).preset === option.value && getApiKeyDateFilter(key.id).type === 'preset'
                                  ? 'bg-white text-blue-600 shadow-sm' 
                                  : 'text-gray-600 hover:text-gray-900'
                              ]"
                              @click="setApiKeyDateFilterPreset(option.value, key.id)"
                            >
                              {{ option.label }}
                            </button>
                          </div>
                          
                          <!-- Element Plus 日期范围选择器 -->
                          <el-date-picker
                            :model-value="getApiKeyDateFilter(key.id).customRange"
                            type="datetimerange"
                            range-separator="至"
                            start-placeholder="开始日期"
                            end-placeholder="结束日期"
                            format="YYYY-MM-DD HH:mm:ss"
                            value-format="YYYY-MM-DD HH:mm:ss"
                            :disabled-date="disabledDate"
                            :default-time="defaultTime"
                            size="small"
                            style="width: 280px;"
                            class="api-key-date-picker"
                            :clearable="true"
                            :unlink-panels="false"
                            @update:model-value="(value) => onApiKeyCustomDateRangeChange(key.id, value)"
                          />
                        </div>
                      </div>
                    </div>
                    
                    <!-- 数据展示区域 -->
                    <div
                      v-if="apiKeyModelStats[key.id] && apiKeyModelStats[key.id].length === 0"
                      class="text-center py-8"
                    >
                      <div class="flex items-center justify-center gap-2 mb-3">
                        <i class="fas fa-chart-line text-gray-400 text-lg" />
                        <p class="text-sm text-gray-500">
                          暂无模型使用数据
                        </p>
                        <button 
                          class="text-blue-500 hover:text-blue-700 text-sm ml-2 flex items-center gap-1 transition-colors"
                          title="重置筛选条件并刷新"
                          @click="resetApiKeyDateFilter(key.id)"
                        >
                          <i class="fas fa-sync-alt text-xs" />
                          <span class="text-xs">刷新</span>
                        </button>
                      </div>
                      <p class="text-xs text-gray-400">
                        尝试调整时间范围或点击刷新重新加载数据
                      </p>
                    </div>
                    <div
                      v-else-if="apiKeyModelStats[key.id] && apiKeyModelStats[key.id].length > 0"
                      class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
                    >
                      <div
                        v-for="stat in apiKeyModelStats[key.id]"
                        :key="stat.model" 
                        class="bg-gradient-to-br from-white to-gray-50 rounded-xl p-4 border border-gray-200 hover:border-indigo-300 hover:shadow-lg transition-all duration-200"
                      >
                        <div class="flex justify-between items-start mb-3">
                          <div class="flex-1">
                            <span class="text-sm font-semibold text-gray-800 block mb-1">{{ stat.model }}</span>
                            <span class="text-xs text-gray-500 bg-blue-50 px-2 py-1 rounded-full">{{ stat.requests }} 次请求</span>
                          </div>
                        </div>
                        
                        <div class="space-y-2 mb-3">
                          <div class="flex justify-between items-center text-sm">
                            <span class="text-gray-600 flex items-center">
                              <i class="fas fa-coins text-yellow-500 mr-1 text-xs" />
                              总Token:
                            </span>
                            <span class="font-semibold text-gray-900">{{ formatTokenCount(stat.allTokens) }}</span>
                          </div>
                          <div class="flex justify-between items-center text-sm">
                            <span class="text-gray-600 flex items-center">
                              <i class="fas fa-dollar-sign text-green-500 mr-1 text-xs" />
                              费用:
                            </span>
                            <span class="font-semibold text-green-600">{{ calculateModelCost(stat) }}</span>
                          </div>
                          <div class="pt-2 mt-2 border-t border-gray-100">
                            <div class="flex justify-between items-center text-xs text-gray-500">
                              <span class="flex items-center">
                                <i class="fas fa-arrow-down text-green-500 mr-1" />
                                输入:
                              </span>
                              <span class="font-medium">{{ formatTokenCount(stat.inputTokens) }}</span>
                            </div>
                            <div class="flex justify-between items-center text-xs text-gray-500">
                              <span class="flex items-center">
                                <i class="fas fa-arrow-up text-blue-500 mr-1" />
                                输出:
                              </span>
                              <span class="font-medium">{{ formatTokenCount(stat.outputTokens) }}</span>
                            </div>
                            <div
                              v-if="stat.cacheCreateTokens > 0"
                              class="flex justify-between items-center text-xs text-purple-600"
                            >
                              <span class="flex items-center">
                                <i class="fas fa-save mr-1" />
                                缓存创建:
                              </span>
                              <span class="font-medium">{{ formatTokenCount(stat.cacheCreateTokens) }}</span>
                            </div>
                            <div
                              v-if="stat.cacheReadTokens > 0"
                              class="flex justify-between items-center text-xs text-purple-600"
                            >
                              <span class="flex items-center">
                                <i class="fas fa-download mr-1" />
                                缓存读取:
                              </span>
                              <span class="font-medium">{{ formatTokenCount(stat.cacheReadTokens) }}</span>
                            </div>
                          </div>
                        </div>
                        
                        <!-- 进度条 -->
                        <div class="w-full bg-gray-200 rounded-full h-2 mt-3">
                          <div
                            class="bg-gradient-to-r from-indigo-500 to-purple-600 h-2 rounded-full transition-all duration-500" 
                            :style="{ width: calculateApiKeyModelPercentage(stat.allTokens, apiKeyModelStats[key.id]) + '%' }"
                          />
                        </div>
                        <div class="text-right mt-1">
                          <span class="text-xs font-medium text-indigo-600">
                            {{ calculateApiKeyModelPercentage(stat.allTokens, apiKeyModelStats[key.id]) }}%
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    <!-- 总计统计，仅在有数据时显示 -->
                    <div
                      v-if="apiKeyModelStats[key.id] && apiKeyModelStats[key.id].length > 0"
                      class="mt-4 p-3 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-lg border border-indigo-100"
                    >
                      <div class="flex items-center justify-between text-sm">
                        <span class="font-semibold text-gray-700 flex items-center">
                          <i class="fas fa-calculator text-indigo-500 mr-2" />
                          总计统计
                        </span>
                        <div class="flex gap-4 text-xs">
                          <span class="text-gray-600">
                            总请求: <span class="font-semibold text-gray-800">{{ apiKeyModelStats[key.id].reduce((sum, stat) => sum + stat.requests, 0) }}</span>
                          </span>
                          <span class="text-gray-600">
                            总Token: <span class="font-semibold text-gray-800">{{ formatTokenCount(apiKeyModelStats[key.id].reduce((sum, stat) => sum + stat.allTokens, 0)) }}</span>
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
      
      <!-- 移动端卡片视图 -->
      <div
        v-if="!apiKeysLoading && sortedApiKeys.length > 0"
        class="md:hidden space-y-3"
      >
        <div
          v-for="key in paginatedApiKeys"
          :key="key.id"
          class="card p-4 hover:shadow-lg transition-shadow"
        >
          <!-- 卡片头部 -->
          <div class="flex items-start justify-between mb-3">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
                <i class="fas fa-key text-white text-sm" />
              </div>
              <div>
                <h4 class="text-sm font-semibold text-gray-900">
                  {{ key.name }}
                </h4>
                <p class="text-xs text-gray-500 mt-0.5">
                  {{ key.id }}
                </p>
              </div>
            </div>
            <span
              :class="['inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold', 
                       key.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800']"
            >
              <div
                :class="['w-1.5 h-1.5 rounded-full mr-1.5', 
                         key.isActive ? 'bg-green-500' : 'bg-red-500']"
              />
              {{ key.isActive ? '活跃' : '已停用' }}
            </span>
          </div>
          
          <!-- 绑定信息 -->
          <div class="mb-3 text-xs text-gray-600">
            <span v-if="key.claudeAccountId || key.claudeConsoleAccountId">
              <i class="fas fa-link mr-1" />
              绑定: {{ getBoundAccountName(key.claudeAccountId, key.claudeConsoleAccountId) }}
            </span>
            <span v-else>
              <i class="fas fa-share-alt mr-1" />
              使用共享池
            </span>
          </div>
          
          <!-- 统计信息 -->
          <div class="space-y-2 mb-3">
            <!-- 今日使用 -->
            <div class="bg-gray-50 rounded-lg p-3">
              <div class="flex justify-between items-center mb-2">
                <span class="text-xs text-gray-600">今日使用</span>
                <button
                  class="text-xs text-blue-600 hover:text-blue-800"
                  @click="showUsageDetails(key)"
                >
                  <i class="fas fa-chart-line mr-1" />详情
                </button>
              </div>
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <p class="text-sm font-semibold text-gray-900">
                    {{ formatNumber((key.usage?.daily?.requests) || 0) }} 次
                  </p>
                  <p class="text-xs text-gray-500">
                    请求
                  </p>
                </div>
                <div>
                  <p class="text-sm font-semibold text-green-600">
                    ${{ (key.dailyCost || 0).toFixed(4) }}
                  </p>
                  <p class="text-xs text-gray-500">
                    费用
                  </p>
                </div>
              </div>
            </div>
            
            <!-- 限制进度 -->
            <div
              v-if="key.dailyCostLimit > 0"
              class="space-y-1"
            >
              <div class="flex justify-between items-center text-xs">
                <span class="text-gray-500">每日费用限额</span>
                <span class="text-gray-700">
                  ${{ (key.dailyCost || 0).toFixed(2) }} / ${{ key.dailyCostLimit.toFixed(2) }}
                </span>
              </div>
              <div class="w-full bg-gray-200 rounded-full h-2">
                <div 
                  :class="getDailyCostProgressColor(key)"
                  class="h-2 rounded-full transition-all duration-300"
                  :style="{ width: getDailyCostProgress(key) + '%' }"
                />
              </div>
            </div>
            
            <!-- 移动端时间窗口限制 -->
            <div
              v-if="key.rateLimitWindow > 0 && (key.rateLimitRequests > 0 || key.tokenLimit > 0)"
              class="space-y-1"
            >
              <div class="text-xs text-gray-500 mb-1">
                窗口限制 ({{ key.rateLimitWindow }}分钟)
              </div>
              
              <div 
                v-if="key.rateLimitRequests > 0" 
                class="flex items-center gap-2"
              >
                <span class="text-xs text-gray-500 w-10">请求</span>
                <div class="flex-1">
                  <div class="w-full bg-gray-200 rounded-full h-1.5">
                    <div 
                      :class="getWindowRequestProgressColor(key)"
                      class="h-1.5 rounded-full transition-all duration-300"
                      :style="{ width: getWindowRequestProgress(key) + '%' }"
                    />
                  </div>
                </div>
                <span class="text-xs text-gray-600 w-16 text-right">
                  {{ key.currentWindowRequests || 0 }}/{{ key.rateLimitRequests }}
                </span>
              </div>
              
              <div 
                v-if="key.tokenLimit > 0" 
                class="flex items-center gap-2"
              >
                <span class="text-xs text-gray-500 w-10">Token</span>
                <div class="flex-1">
                  <div class="w-full bg-gray-200 rounded-full h-1.5">
                    <div 
                      :class="getWindowTokenProgressColor(key)"
                      class="h-1.5 rounded-full transition-all duration-300"
                      :style="{ width: getWindowTokenProgress(key) + '%' }"
                    />
                  </div>
                </div>
                <span class="text-xs text-gray-600 w-16 text-right">
                  {{ formatTokenCount(key.currentWindowTokens || 0) }}/{{ formatTokenCount(key.tokenLimit) }}
                </span>
              </div>
            </div>
          </div>
          
          <!-- 时间信息 -->
          <div class="text-xs text-gray-500 mb-3">
            <div class="flex justify-between mb-1">
              <span>创建时间</span>
              <span>{{ formatDate(key.createdAt) }}</span>
            </div>
            <div class="flex justify-between items-center">
              <span>过期时间</span>
              <div class="flex items-center gap-1">
                <span :class="isApiKeyExpiringSoon(key.expiresAt) ? 'text-orange-600 font-semibold' : ''">
                  {{ key.expiresAt ? formatDate(key.expiresAt) : '永不过期' }}
                </span>
                <button
                  class="inline-flex items-center justify-center w-5 h-5 text-gray-300 hover:text-blue-500 hover:bg-blue-50 rounded transition-all duration-200"
                  title="编辑过期时间"
                  @click.stop="startEditExpiry(key)"
                >
                  <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path>
                  </svg>
                </button>
              </div>
            </div>
          </div>
          
          <!-- 标签 -->
          <div
            v-if="key.tags && key.tags.length > 0"
            class="flex flex-wrap gap-1 mb-3"
          >
            <span
              v-for="tag in key.tags"
              :key="tag" 
              class="inline-flex items-center px-2 py-0.5 bg-blue-100 text-blue-800 text-xs rounded-full"
            >
              {{ tag }}
            </span>
          </div>
          
          <!-- 操作按钮 -->
          <div class="flex gap-2 mt-3 pt-3 border-t border-gray-100">
            <button 
              class="flex-1 px-3 py-2 text-xs text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors flex items-center justify-center gap-1"
              @click="showUsageDetails(key)"
            >
              <i class="fas fa-chart-line" />
              查看详情
            </button>
            <button 
              class="flex-1 px-3 py-2 text-xs text-gray-600 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
              @click="openEditApiKeyModal(key)"
            >
              <i class="fas fa-edit mr-1" />
              编辑
            </button>
            <button 
              v-if="key.expiresAt && (isApiKeyExpired(key.expiresAt) || isApiKeyExpiringSoon(key.expiresAt))"
              class="flex-1 px-3 py-2 text-xs text-orange-600 bg-orange-50 rounded-lg hover:bg-orange-100 transition-colors"
              @click="openRenewApiKeyModal(key)"
            >
              <i class="fas fa-clock mr-1" />
              续期
            </button>
            <button 
              class="px-3 py-2 text-xs text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
              @click="deleteApiKey(key.id)"
            >
              <i class="fas fa-trash" />
            </button>
          </div>
        </div>
      </div>
      
      <!-- 分页组件 -->
      <div
        v-if="sortedApiKeys.length > 0"
        class="mt-4 sm:mt-6 flex flex-col sm:flex-row justify-between items-center gap-4"
      >
        <div class="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
          <span class="text-xs sm:text-sm text-gray-600">
            共 {{ sortedApiKeys.length }} 条记录
          </span>
          <div class="flex items-center gap-2">
            <span class="text-xs sm:text-sm text-gray-600">每页显示</span>
            <select 
              v-model="pageSize" 
              class="px-2 py-1 text-xs sm:text-sm text-gray-700 bg-white border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent hover:border-gray-300 transition-colors"
              @change="currentPage = 1"
            >
              <option 
                v-for="size in pageSizeOptions" 
                :key="size" 
                :value="size"
              >
                {{ size }}
              </option>
            </select>
            <span class="text-xs sm:text-sm text-gray-600">条</span>
          </div>
        </div>
        
        <div class="flex items-center gap-2">
          <!-- 上一页 -->
          <button 
            class="px-3 py-1.5 sm:py-1 text-xs sm:text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            :disabled="currentPage === 1"
            @click="currentPage--"
          >
            <i class="fas fa-chevron-left" />
          </button>
          
          <!-- 页码 -->
          <div class="flex items-center gap-1">
            <!-- 第一页 -->
            <button 
              v-if="currentPage > 3"
              class="hidden sm:block px-3 py-1 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              @click="currentPage = 1"
            >
              1
            </button>
            <span
              v-if="currentPage > 4"
              class="hidden sm:inline px-2 text-gray-500"
            >...</span>
            
            <!-- 中间页码 -->
            <button 
              v-for="page in pageNumbers" 
              :key="page"
              :class="[
                'px-2 sm:px-3 py-1 text-xs sm:text-sm font-medium rounded-md',
                page === currentPage 
                  ? 'bg-blue-600 text-white' 
                  : 'text-gray-700 bg-white border border-gray-300 hover:bg-gray-50'
              ]"
              @click="currentPage = page"
            >
              {{ page }}
            </button>
            
            <!-- 最后一页 -->
            <span
              v-if="currentPage < totalPages - 3"
              class="hidden sm:inline px-2 text-gray-500"
            >...</span>
            <button 
              v-if="totalPages > 1 && currentPage < totalPages - 2"
              class="hidden sm:block px-3 py-1 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              @click="currentPage = totalPages"
            >
              {{ totalPages }}
            </button>
          </div>
          
          <!-- 下一页 -->
          <button 
            class="px-3 py-1.5 sm:py-1 text-xs sm:text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            :disabled="currentPage === totalPages || totalPages === 0"
            @click="currentPage++"
          >
            <i class="fas fa-chevron-right" />
          </button>
        </div>
      </div>
    </div>
    
    <!-- 模态框组件 -->
    <CreateApiKeyModal 
      v-if="showCreateApiKeyModal"
      :accounts="accounts"
      @close="showCreateApiKeyModal = false"
      @success="handleCreateSuccess"
      @batch-success="handleBatchCreateSuccess"
    />
    
    <EditApiKeyModal 
      v-if="showEditApiKeyModal"
      :api-key="editingApiKey"
      :accounts="accounts"
      @close="showEditApiKeyModal = false"
      @success="handleEditSuccess"
    />
    
    <RenewApiKeyModal 
      v-if="showRenewApiKeyModal"
      :api-key="renewingApiKey"
      @close="showRenewApiKeyModal = false"
      @success="handleRenewSuccess"
    />
    
    <NewApiKeyModal 
      v-if="showNewApiKeyModal"
      :api-key="newApiKeyData"
      @close="showNewApiKeyModal = false"
    />
    
    <BatchApiKeyModal 
      v-if="showBatchApiKeyModal"
      :api-keys="batchApiKeyData"
      @close="showBatchApiKeyModal = false"
    />
    
    <!-- 过期时间编辑弹窗 -->
    <ExpiryEditModal
      ref="expiryEditModalRef"
      :show="!!editingExpiryKey"
      :api-key="editingExpiryKey || { id: null, expiresAt: null, name: '' }"
      @close="closeExpiryEdit"
      @save="handleSaveExpiry"
    />
    
    <!-- 使用详情弹窗 -->
    <UsageDetailModal
      :show="showUsageDetailModal"
      :api-key="selectedApiKeyForDetail || {}"
      @close="showUsageDetailModal = false"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { showToast } from '@/utils/toast'
import { apiClient } from '@/config/api'
import { useClientsStore } from '@/stores/clients'
import CreateApiKeyModal from '@/components/apikeys/CreateApiKeyModal.vue'
import EditApiKeyModal from '@/components/apikeys/EditApiKeyModal.vue'
import RenewApiKeyModal from '@/components/apikeys/RenewApiKeyModal.vue'
import NewApiKeyModal from '@/components/apikeys/NewApiKeyModal.vue'
import BatchApiKeyModal from '@/components/apikeys/BatchApiKeyModal.vue'
import ExpiryEditModal from '@/components/apikeys/ExpiryEditModal.vue'
import UsageDetailModal from '@/components/apikeys/UsageDetailModal.vue'

// 响应式数据
const clientsStore = useClientsStore()
const apiKeys = ref([])
const apiKeysLoading = ref(false)
const apiKeyStatsTimeRange = ref('today')
const apiKeysSortBy = ref('')
const apiKeysSortOrder = ref('asc')
const expandedApiKeys = ref({})
const apiKeyModelStats = ref({})
const apiKeyDateFilters = ref({})
const defaultTime = ref([new Date(2000, 1, 1, 0, 0, 0), new Date(2000, 2, 1, 23, 59, 59)])
const accounts = ref({ claude: [], gemini: [], claudeGroups: [], geminiGroups: [] })
const editingExpiryKey = ref(null)
const expiryEditModalRef = ref(null)
const showUsageDetailModal = ref(false)
const selectedApiKeyForDetail = ref(null)

// 标签相关
const selectedTagFilter = ref('')
const availableTags = ref([])


// 分页相关
const currentPage = ref(1)
const pageSize = ref(10)
const pageSizeOptions = [10, 20, 50, 100]

// 模态框状态
const showCreateApiKeyModal = ref(false)
const showEditApiKeyModal = ref(false)
const showRenewApiKeyModal = ref(false)
const showNewApiKeyModal = ref(false)
const showBatchApiKeyModal = ref(false)
const editingApiKey = ref(null)
const renewingApiKey = ref(null)
const newApiKeyData = ref(null)
const batchApiKeyData = ref([])

// 计算排序后的API Keys
const sortedApiKeys = computed(() => {
  // 先进行标签筛选
  let filteredKeys = apiKeys.value
  if (selectedTagFilter.value) {
    filteredKeys = apiKeys.value.filter(key => 
      key.tags && key.tags.includes(selectedTagFilter.value)
    )
  }
  
  // 如果没有排序字段，返回筛选后的结果
  if (!apiKeysSortBy.value) return filteredKeys
  
  // 排序
  const sorted = [...filteredKeys].sort((a, b) => {
    let aVal = a[apiKeysSortBy.value]
    let bVal = b[apiKeysSortBy.value]
    
    // 处理特殊排序字段
    if (apiKeysSortBy.value === 'status') {
      aVal = a.isActive ? 1 : 0
      bVal = b.isActive ? 1 : 0
    } else if (apiKeysSortBy.value === 'cost') {
      aVal = parseFloat(calculateApiKeyCost(a.usage).replace('$', ''))
      bVal = parseFloat(calculateApiKeyCost(b.usage).replace('$', ''))
    } else if (apiKeysSortBy.value === 'createdAt' || apiKeysSortBy.value === 'expiresAt') {
      aVal = aVal ? new Date(aVal).getTime() : 0
      bVal = bVal ? new Date(bVal).getTime() : 0
    }
    
    if (aVal < bVal) return apiKeysSortOrder.value === 'asc' ? -1 : 1
    if (aVal > bVal) return apiKeysSortOrder.value === 'asc' ? 1 : -1
    return 0
  })
  
  return sorted
})

// 计算总页数
const totalPages = computed(() => {
  const total = sortedApiKeys.value.length
  return Math.ceil(total / pageSize.value) || 0
})

// 计算显示的页码数组
const pageNumbers = computed(() => {
  const pages = []
  const current = currentPage.value
  const total = totalPages.value
  
  if (total <= 7) {
    // 如果总页数小于等于7，显示所有页码
    for (let i = 1; i <= total; i++) {
      pages.push(i)
    }
  } else {
    // 如果总页数大于7，显示部分页码
    let start = Math.max(1, current - 2)
    let end = Math.min(total, current + 2)
    
    // 调整起始和结束页码
    if (current <= 3) {
      end = 5
    } else if (current >= total - 2) {
      start = total - 4
    }
    
    for (let i = start; i <= end; i++) {
      pages.push(i)
    }
  }
  
  return pages
})

// 获取分页后的数据
const paginatedApiKeys = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  const end = start + pageSize.value
  return sortedApiKeys.value.slice(start, end)
})

// 加载账户列表
const loadAccounts = async () => {
  try {
    const [claudeData, claudeConsoleData, geminiData, groupsData] = await Promise.all([
      apiClient.get('/admin/claude-accounts'),
      apiClient.get('/admin/claude-console-accounts'),
      apiClient.get('/admin/gemini-accounts'),
      apiClient.get('/admin/account-groups')
    ])
    
    if (claudeData.success) {
      accounts.value.claude = claudeData.data || []
    }
    
    if (claudeConsoleData.success) {
      // 将 Claude Console 账号合并到 claude 数组中
      const consoleAccounts = (claudeConsoleData.data || []).map(acc => ({
        ...acc,
        platform: 'claude-console'
      }))
      accounts.value.claude = [...accounts.value.claude, ...consoleAccounts]
    }
    
    if (geminiData.success) {
      accounts.value.gemini = geminiData.data || []
    }
    
    if (groupsData.success) {
      // 处理分组数据
      const allGroups = groupsData.data || []
      accounts.value.claudeGroups = allGroups.filter(g => g.platform === 'claude')
      accounts.value.geminiGroups = allGroups.filter(g => g.platform === 'gemini')
    }
  } catch (error) {
    console.error('加载账户列表失败:', error)
  }
}

// 加载API Keys
const loadApiKeys = async () => {
  apiKeysLoading.value = true
  try {
    const data = await apiClient.get(`/admin/api-keys?timeRange=${apiKeyStatsTimeRange.value}`)
    if (data.success) {
      apiKeys.value = data.data || []
      
      // 更新可用标签列表
      const tagsSet = new Set()
      apiKeys.value.forEach(key => {
        if (key.tags && Array.isArray(key.tags)) {
          key.tags.forEach(tag => tagsSet.add(tag))
        }
      })
      availableTags.value = Array.from(tagsSet).sort()
    }
  } catch (error) {
    showToast('加载 API Keys 失败', 'error')
  } finally {
    apiKeysLoading.value = false
  }
}

// 排序API Keys
const sortApiKeys = (field) => {
  if (apiKeysSortBy.value === field) {
    apiKeysSortOrder.value = apiKeysSortOrder.value === 'asc' ? 'desc' : 'asc'
  } else {
    apiKeysSortBy.value = field
    apiKeysSortOrder.value = 'asc'
  }
}

// 格式化数字
const formatNumber = (num) => {
  if (!num && num !== 0) return '0'
  return num.toLocaleString('zh-CN')
}

// 计算API Key费用
const calculateApiKeyCost = (usage) => {
  if (!usage || !usage.total) return '$0.0000'
  const cost = usage.total.cost || 0
  return `$${cost.toFixed(4)}`
}

// 获取绑定账户名称
const getBoundAccountName = (accountId) => {
  if (!accountId) return '未知账户'
  
  // 检查是否是分组
  if (accountId.startsWith('group:')) {
    const groupId = accountId.substring(6) // 移除 'group:' 前缀
    
    // 从Claude分组中查找
    const claudeGroup = accounts.value.claudeGroups.find(g => g.id === groupId)
    if (claudeGroup) {
      return `分组-${claudeGroup.name}`
    }
    
    // 从Gemini分组中查找
    const geminiGroup = accounts.value.geminiGroups.find(g => g.id === groupId)
    if (geminiGroup) {
      return `分组-${geminiGroup.name}`
    }
    
    // 如果找不到分组，返回分组ID的前8位
    return `分组-${groupId.substring(0, 8)}`
  }
  
  // 从Claude账户列表中查找
  const claudeAccount = accounts.value.claude.find(acc => acc.id === accountId)
  if (claudeAccount) {
    return `账户-${claudeAccount.name}`
  }
  
  // 从Gemini账户列表中查找
  const geminiAccount = accounts.value.gemini.find(acc => acc.id === accountId)
  if (geminiAccount) {
    return `账户-${geminiAccount.name}`
  }
  
  // 如果找不到，返回账户ID的前8位
  return `账户-${accountId.substring(0, 8)}`
}

// 检查API Key是否过期
const isApiKeyExpired = (expiresAt) => {
  if (!expiresAt) return false
  return new Date(expiresAt) < new Date()
}

// 检查API Key是否即将过期
const isApiKeyExpiringSoon = (expiresAt) => {
  if (!expiresAt || isApiKeyExpired(expiresAt)) return false
  const daysUntilExpiry = (new Date(expiresAt) - new Date()) / (1000 * 60 * 60 * 24)
  return daysUntilExpiry <= 7
}

// 格式化过期日期
const formatExpireDate = (dateString) => {
  if (!dateString) return ''
  return new Date(dateString).toLocaleDateString('zh-CN')
}

// 切换模型统计展开状态
const toggleApiKeyModelStats = async (keyId) => {
  if (!expandedApiKeys.value[keyId]) {
    expandedApiKeys.value[keyId] = true
    // 初始化日期筛选器
    if (!apiKeyDateFilters.value[keyId]) {
      initApiKeyDateFilter(keyId)
    }
    // 加载模型统计数据
    await loadApiKeyModelStats(keyId, true)
  } else {
    expandedApiKeys.value[keyId] = false
  }
}

// 加载 API Key 的模型统计
const loadApiKeyModelStats = async (keyId, forceReload = false) => {
  if (!forceReload && apiKeyModelStats.value[keyId] && apiKeyModelStats.value[keyId].length > 0) {
    return
  }
  
  const filter = getApiKeyDateFilter(keyId)
  
  try {
    let url = `/admin/api-keys/${keyId}/model-stats`
    const params = new URLSearchParams()
    
    if (filter.customStart && filter.customEnd) {
      params.append('startDate', filter.customStart)
      params.append('endDate', filter.customEnd)
      params.append('period', 'custom')
    } else {
      const period = filter.preset === 'today' ? 'daily' : filter.preset === '7days' ? 'daily' : 'monthly'
      params.append('period', period)
    }
    
    url += '?' + params.toString()
    
    const data = await apiClient.get(url)
    if (data.success) {
      apiKeyModelStats.value[keyId] = data.data || []
    }
  } catch (error) {
    showToast('加载模型统计失败', 'error')
    apiKeyModelStats.value[keyId] = []
  }
}

// 计算API Key模型使用百分比
const calculateApiKeyModelPercentage = (value, stats) => {
  const total = stats.reduce((sum, stat) => sum + (stat.allTokens || 0), 0)
  if (total === 0) return 0
  return Math.round((value / total) * 100)
}

// 计算单个模型费用
const calculateModelCost = (stat) => {
  // 优先使用后端返回的费用数据
  if (stat.formatted && stat.formatted.total) {
    return stat.formatted.total
  }
  
  // 如果没有 formatted 数据，尝试使用 cost 字段
  if (stat.cost !== undefined) {
    return `$${stat.cost.toFixed(6)}`
  }
  
  // 默认返回
  return '$0.000000'
}

// 初始化API Key的日期筛选器
const initApiKeyDateFilter = (keyId) => {
  const today = new Date()
  const startDate = new Date(today)
  startDate.setDate(today.getDate() - 6) // 7天前
  
  apiKeyDateFilters.value[keyId] = {
    type: 'preset',
    preset: '7days',
    customStart: startDate.toISOString().split('T')[0],
    customEnd: today.toISOString().split('T')[0],
    customRange: null,
    presetOptions: [
      { value: 'today', label: '今日', days: 1 },
      { value: '7days', label: '7天', days: 7 },
      { value: '30days', label: '30天', days: 30 }
    ]
  }
}

// 获取API Key的日期筛选器状态
const getApiKeyDateFilter = (keyId) => {
  if (!apiKeyDateFilters.value[keyId]) {
    initApiKeyDateFilter(keyId)
  }
  return apiKeyDateFilters.value[keyId]
}

// 设置 API Key 日期预设
const setApiKeyDateFilterPreset = (preset, keyId) => {
  const filter = getApiKeyDateFilter(keyId)
  filter.type = 'preset'
  filter.preset = preset
  
  const option = filter.presetOptions.find(opt => opt.value === preset)
  if (option) {
    const today = new Date()
    const startDate = new Date(today)
    startDate.setDate(today.getDate() - (option.days - 1))
    
    filter.customStart = startDate.toISOString().split('T')[0]
    filter.customEnd = today.toISOString().split('T')[0]
    
    const formatDate = (date) => {
      return date.getFullYear() + '-' + 
             String(date.getMonth() + 1).padStart(2, '0') + '-' + 
             String(date.getDate()).padStart(2, '0') + ' 00:00:00'
    }
    
    filter.customRange = [
      formatDate(startDate),
      formatDate(today)
    ]
  }
  
  loadApiKeyModelStats(keyId, true)
}

// API Key 自定义日期范围变化
const onApiKeyCustomDateRangeChange = (keyId, value) => {
  const filter = getApiKeyDateFilter(keyId)
  
  if (value && value.length === 2) {
    filter.type = 'custom'
    filter.preset = ''
    filter.customRange = value
    filter.customStart = value[0].split(' ')[0]
    filter.customEnd = value[1].split(' ')[0]
    
    loadApiKeyModelStats(keyId, true)
  } else if (value === null) {
    // 清空时恢复默认7天
    setApiKeyDateFilterPreset('7days', keyId)
  }
}

// 禁用未来日期
const disabledDate = (date) => {
  return date > new Date()
}

// 重置API Key日期筛选器
const resetApiKeyDateFilter = (keyId) => {
  const filter = getApiKeyDateFilter(keyId)
  
  // 重置为默认的7天
  filter.type = 'preset'
  filter.preset = '7days'
  
  const today = new Date()
  const startDate = new Date(today)
  startDate.setDate(today.getDate() - 6)
  
  filter.customStart = startDate.toISOString().split('T')[0]
  filter.customEnd = today.toISOString().split('T')[0]
  filter.customRange = null
  
  // 重新加载数据
  loadApiKeyModelStats(keyId, true)
  showToast('已重置筛选条件并刷新数据', 'info')
}

// 打开创建模态框
const openCreateApiKeyModal = async () => {
  // 重新加载账号数据，确保显示最新的专属账号
  await loadAccounts()
  showCreateApiKeyModal.value = true
}

// 打开编辑模态框
const openEditApiKeyModal = async (apiKey) => {
  // 重新加载账号数据，确保显示最新的专属账号
  await loadAccounts()
  editingApiKey.value = apiKey
  showEditApiKeyModal.value = true
}

// 打开续期模态框
const openRenewApiKeyModal = (apiKey) => {
  renewingApiKey.value = apiKey
  showRenewApiKeyModal.value = true
}

// 处理创建成功
const handleCreateSuccess = (data) => {
  showCreateApiKeyModal.value = false
  newApiKeyData.value = data
  showNewApiKeyModal.value = true
  loadApiKeys()
}

// 处理批量创建成功
const handleBatchCreateSuccess = (data) => {
  showCreateApiKeyModal.value = false
  batchApiKeyData.value = data
  showBatchApiKeyModal.value = true
  loadApiKeys()
}

// 处理编辑成功
const handleEditSuccess = () => {
  showEditApiKeyModal.value = false
  showToast('API Key 更新成功', 'success')
  loadApiKeys()
}

// 处理续期成功
const handleRenewSuccess = () => {
  showRenewApiKeyModal.value = false
  showToast('API Key 续期成功', 'success')
  loadApiKeys()
}

// 删除API Key
const deleteApiKey = async (keyId) => {
  let confirmed = false
  
  if (window.showConfirm) {
    confirmed = await window.showConfirm(
      '删除 API Key',
      '确定要删除这个 API Key 吗？此操作不可恢复。',
      '确定删除',
      '取消'
    )
  } else {
    // 降级方案
    confirmed = confirm('确定要删除这个 API Key 吗？此操作不可恢复。')
  }
  
  if (!confirmed) return
  
  try {
    const data = await apiClient.delete(`/admin/api-keys/${keyId}`)
    if (data.success) {
      showToast('API Key 已删除', 'success')
      loadApiKeys()
    } else {
      showToast(data.message || '删除失败', 'error')
    }
  } catch (error) {
    showToast('删除失败', 'error')
  }
}

// 复制API统计页面链接
const copyApiStatsLink = (apiKey) => {
  // 构建统计页面的完整URL
  const baseUrl = window.location.origin
  const statsUrl = `${baseUrl}/admin-next/api-stats?apiId=${apiKey.id}`
  
  // 使用传统的textarea方法复制到剪贴板
  const textarea = document.createElement('textarea')
  textarea.value = statsUrl
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  textarea.style.left = '-9999px'
  document.body.appendChild(textarea)
  
  textarea.select()
  textarea.setSelectionRange(0, 99999) // 兼容移动端
  
  try {
    const successful = document.execCommand('copy')
    if (successful) {
      showToast(`已复制统计页面链接`, 'success')
    } else {
      showToast('复制失败，请手动复制', 'error')
      console.log('统计页面链接:', statsUrl)
    }
  } catch (err) {
    showToast('复制失败，请手动复制', 'error')
    console.error('复制错误:', err)
    console.log('统计页面链接:', statsUrl)
  } finally {
    document.body.removeChild(textarea)
  }
}

// 开始编辑过期时间
const startEditExpiry = (apiKey) => {
  editingExpiryKey.value = apiKey
}

// 关闭过期时间编辑
const closeExpiryEdit = () => {
  editingExpiryKey.value = null
}

// 保存过期时间
const handleSaveExpiry = async ({ keyId, expiresAt }) => {
  try {
    const data = await apiClient.put(`/admin/api-keys/${keyId}`, {
      expiresAt: expiresAt || null
    })
    
    if (data.success) {
      showToast('过期时间已更新', 'success')
      // 更新本地数据
      const key = apiKeys.value.find(k => k.id === keyId)
      if (key) {
        key.expiresAt = expiresAt || null
      }
      closeExpiryEdit()
    } else {
      showToast(data.message || '更新失败', 'error')
      // 重置保存状态
      if (expiryEditModalRef.value) {
        expiryEditModalRef.value.resetSaving()
      }
    }
  } catch (error) {
    showToast('更新失败', 'error')
    // 重置保存状态
    if (expiryEditModalRef.value) {
      expiryEditModalRef.value.resetSaving()
    }
  }
}


// 格式化日期时间
const formatDate = (dateString) => {
  if (!dateString) return ''
  const date = new Date(dateString)
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).replace(/\//g, '-')
}

// 获取每日费用进度
const getDailyCostProgress = (key) => {
  if (!key.dailyCostLimit || key.dailyCostLimit === 0) return 0
  const percentage = ((key.dailyCost || 0) / key.dailyCostLimit) * 100
  return Math.min(percentage, 100)
}

// 获取每日费用进度条颜色
const getDailyCostProgressColor = (key) => {
  const progress = getDailyCostProgress(key)
  if (progress >= 100) return 'bg-red-500'
  if (progress >= 80) return 'bg-yellow-500'
  return 'bg-green-500'
}

// 显示使用详情
const showUsageDetails = (apiKey) => {
  selectedApiKeyForDetail.value = apiKey
  showUsageDetailModal.value = true
}

// 格式化Token数量（使用K/M单位）
const formatTokenCount = (count) => {
  if (count >= 1000000) {
    return (count / 1000000).toFixed(1) + 'M'
  } else if (count >= 1000) {
    return (count / 1000).toFixed(1) + 'K'
  }
  return count.toString()
}

// 获取窗口请求进度
const getWindowRequestProgress = (key) => {
  if (!key.rateLimitRequests || key.rateLimitRequests === 0) return 0
  const percentage = ((key.currentWindowRequests || 0) / key.rateLimitRequests) * 100
  return Math.min(percentage, 100)
}

// 获取窗口请求进度条颜色
const getWindowRequestProgressColor = (key) => {
  const progress = getWindowRequestProgress(key)
  if (progress >= 100) return 'bg-red-500'
  if (progress >= 80) return 'bg-yellow-500'
  return 'bg-blue-500'
}

// 获取窗口Token进度
const getWindowTokenProgress = (key) => {
  if (!key.tokenLimit || key.tokenLimit === 0) return 0
  const percentage = ((key.currentWindowTokens || 0) / key.tokenLimit) * 100
  return Math.min(percentage, 100)
}

// 获取窗口Token进度条颜色
const getWindowTokenProgressColor = (key) => {
  const progress = getWindowTokenProgress(key)
  if (progress >= 100) return 'bg-red-500'
  if (progress >= 80) return 'bg-yellow-500'
  return 'bg-purple-500'
}


// 监听筛选条件变化，重置页码
watch([selectedTagFilter, apiKeyStatsTimeRange], () => {
  currentPage.value = 1
})

onMounted(async () => {
  // 并行加载所有需要的数据
  await Promise.all([
    clientsStore.loadSupportedClients(),
    loadAccounts(),
    loadApiKeys()
  ])
})
</script>

<style scoped>
.tab-content {
  min-height: calc(100vh - 300px);
}

.table-container {
  overflow-x: auto;
  border-radius: 12px;
  border: 1px solid rgba(0, 0, 0, 0.05);
}

.table-row {
  transition: all 0.2s ease;
}

.table-row:hover {
  background-color: rgba(0, 0, 0, 0.02);
}

.loading-spinner {
  width: 24px;
  height: 24px;
  border: 2px solid #e5e7eb;
  border-top: 2px solid #3b82f6;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.api-key-date-picker :deep(.el-input__inner) {
  @apply bg-white border-gray-300 focus:border-blue-500 focus:ring-blue-500;
}

.api-key-date-picker :deep(.el-range-separator) {
  @apply text-gray-500;
}
</style>