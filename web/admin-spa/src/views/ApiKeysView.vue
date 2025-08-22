<template>
  <div class="tab-content">
    <div class="card p-4 sm:p-6">
      <div class="mb-4 flex flex-col gap-4 sm:mb-6">
        <div>
          <h3 class="mb-1 text-lg font-bold text-gray-900 sm:mb-2 sm:text-xl">API Keys 管理</h3>
          <p class="text-sm text-gray-600 sm:text-base">管理和监控您的 API 密钥</p>
        </div>
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <!-- 筛选器组 -->
          <div class="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
            <!-- 时间范围筛选 -->
            <div class="group relative min-w-[140px]">
              <div
                class="absolute -inset-0.5 rounded-lg bg-gradient-to-r from-blue-500 to-purple-500 opacity-0 blur transition duration-300 group-hover:opacity-20"
              ></div>
              <CustomDropdown
                v-model="apiKeyStatsTimeRange"
                icon="fa-calendar-alt"
                icon-color="text-blue-500"
                :options="timeRangeOptions"
                placeholder="选择时间范围"
                @change="loadApiKeys()"
              />
            </div>

            <!-- 标签筛选器 -->
            <div class="group relative min-w-[140px]">
              <div
                class="absolute -inset-0.5 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 opacity-0 blur transition duration-300 group-hover:opacity-20"
              ></div>
              <div class="relative">
                <CustomDropdown
                  v-model="selectedTagFilter"
                  icon="fa-tags"
                  icon-color="text-purple-500"
                  :options="tagOptions"
                  placeholder="所有标签"
                  @change="currentPage = 1"
                />
                <span
                  v-if="selectedTagFilter"
                  class="absolute -right-2 -top-2 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-purple-500 text-xs text-white shadow-sm"
                >
                  {{ selectedTagCount }}
                </span>
              </div>
            </div>

            <!-- 搜索框 -->
            <div class="group relative min-w-[200px]">
              <div
                class="absolute -inset-0.5 rounded-lg bg-gradient-to-r from-cyan-500 to-teal-500 opacity-0 blur transition duration-300 group-hover:opacity-20"
              ></div>
              <div class="relative flex items-center">
                <input
                  v-model="searchKeyword"
                  class="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 pl-9 text-sm text-gray-700 placeholder-gray-400 shadow-sm transition-all duration-200 hover:border-gray-300 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
                  placeholder="搜索名称..."
                  type="text"
                  @input="currentPage = 1"
                />
                <i class="fas fa-search absolute left-3 text-sm text-cyan-500" />
                <button
                  v-if="searchKeyword"
                  class="absolute right-2 flex h-5 w-5 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                  @click="clearSearch"
                >
                  <i class="fas fa-times text-xs" />
                </button>
              </div>
            </div>

            <!-- 刷新按钮 -->
            <button
              class="group relative flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-all duration-200 hover:border-gray-300 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
              :disabled="apiKeysLoading"
              @click="loadApiKeys()"
            >
              <div
                class="absolute -inset-0.5 rounded-lg bg-gradient-to-r from-green-500 to-teal-500 opacity-0 blur transition duration-300 group-hover:opacity-20"
              ></div>
              <i
                :class="[
                  'fas relative text-green-500',
                  apiKeysLoading ? 'fa-spinner fa-spin' : 'fa-sync-alt'
                ]"
              />
              <span class="relative">刷新</span>
            </button>

            <!-- 批量编辑按钮 -->
            <button
              v-if="selectedApiKeys.length > 0"
              class="group relative flex items-center justify-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 shadow-sm transition-all duration-200 hover:border-blue-300 hover:bg-blue-100 hover:shadow-md sm:w-auto"
              @click="openBatchEditModal()"
            >
              <div
                class="absolute -inset-0.5 rounded-lg bg-gradient-to-r from-blue-500 to-indigo-500 opacity-0 blur transition duration-300 group-hover:opacity-20"
              ></div>
              <i class="fas fa-edit relative text-blue-600" />
              <span class="relative">编辑选中 ({{ selectedApiKeys.length }})</span>
            </button>

            <!-- 批量删除按钮 -->
            <button
              v-if="selectedApiKeys.length > 0"
              class="group relative flex items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 shadow-sm transition-all duration-200 hover:border-red-300 hover:bg-red-100 hover:shadow-md sm:w-auto"
              @click="batchDeleteApiKeys()"
            >
              <div
                class="absolute -inset-0.5 rounded-lg bg-gradient-to-r from-red-500 to-pink-500 opacity-0 blur transition duration-300 group-hover:opacity-20"
              ></div>
              <i class="fas fa-trash relative text-red-600" />
              <span class="relative">删除选中 ({{ selectedApiKeys.length }})</span>
            </button>
          </div>
          <!-- 创建按钮 -->
          <button
            class="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-blue-500 to-blue-600 px-5 py-2.5 text-sm font-medium text-white shadow-md transition-all duration-200 hover:from-blue-600 hover:to-blue-700 hover:shadow-lg sm:w-auto"
            @click.stop="openCreateApiKeyModal"
          >
            <i class="fas fa-plus"></i>
            <span>创建新 Key</span>
          </button>
        </div>
      </div>

      <div v-if="apiKeysLoading" class="py-12 text-center">
        <div class="loading-spinner mx-auto mb-4" />
        <p class="text-gray-500">正在加载 API Keys...</p>
      </div>

      <div v-else-if="apiKeys.length === 0" class="py-12 text-center">
        <div
          class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100"
        >
          <i class="fas fa-key text-xl text-gray-400" />
        </div>
        <p class="text-lg text-gray-500">暂无 API Keys</p>
        <p class="mt-2 text-sm text-gray-400">点击上方按钮创建您的第一个 API Key</p>
      </div>

      <!-- 桌面端表格视图 -->
      <div v-else class="table-container hidden md:block">
        <table class="w-full table-fixed">
          <thead class="bg-gray-50/80 backdrop-blur-sm">
            <tr>
              <th class="w-[50px] px-3 py-4 text-left">
                <div class="flex items-center">
                  <input
                    v-model="selectAllChecked"
                    class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    :indeterminate="isIndeterminate"
                    type="checkbox"
                    @change="handleSelectAll"
                  />
                </div>
              </th>
              <th
                class="w-[25%] min-w-[200px] cursor-pointer px-3 py-4 text-left text-xs font-bold uppercase tracking-wider text-gray-700 hover:bg-gray-100"
                @click="sortApiKeys('name')"
              >
                名称
                <i
                  v-if="apiKeysSortBy === 'name'"
                  :class="[
                    'fas',
                    apiKeysSortOrder === 'asc' ? 'fa-sort-up' : 'fa-sort-down',
                    'ml-1'
                  ]"
                />
                <i v-else class="fas fa-sort ml-1 text-gray-400" />
              </th>
              <th
                class="w-[10%] min-w-[80px] px-3 py-4 text-left text-xs font-bold uppercase tracking-wider text-gray-700"
              >
                标签
              </th>
              <th
                class="w-[8%] min-w-[70px] cursor-pointer px-3 py-4 text-left text-xs font-bold uppercase tracking-wider text-gray-700 hover:bg-gray-100"
                @click="sortApiKeys('status')"
              >
                状态
                <i
                  v-if="apiKeysSortBy === 'status'"
                  :class="[
                    'fas',
                    apiKeysSortOrder === 'asc' ? 'fa-sort-up' : 'fa-sort-down',
                    'ml-1'
                  ]"
                />
                <i v-else class="fas fa-sort ml-1 text-gray-400" />
              </th>
              <th
                class="w-[17%] min-w-[140px] px-3 py-4 text-left text-xs font-bold uppercase tracking-wider text-gray-700"
              >
                使用统计
                <span
                  class="cursor-pointer rounded px-2 py-1 hover:bg-gray-100"
                  @click="sortApiKeys('cost')"
                >
                  (费用
                  <i
                    v-if="apiKeysSortBy === 'cost'"
                    :class="[
                      'fas',
                      apiKeysSortOrder === 'asc' ? 'fa-sort-up' : 'fa-sort-down',
                      'ml-1'
                    ]"
                  />
                  <i v-else class="fas fa-sort ml-1 text-gray-400" />)
                </span>
              </th>
              <th
                class="w-[10%] min-w-[90px] cursor-pointer px-3 py-4 text-left text-xs font-bold uppercase tracking-wider text-gray-700 hover:bg-gray-100"
                @click="sortApiKeys('createdAt')"
              >
                创建时间
                <i
                  v-if="apiKeysSortBy === 'createdAt'"
                  :class="[
                    'fas',
                    apiKeysSortOrder === 'asc' ? 'fa-sort-up' : 'fa-sort-down',
                    'ml-1'
                  ]"
                />
                <i v-else class="fas fa-sort ml-1 text-gray-400" />
              </th>
              <th
                class="w-[10%] min-w-[90px] cursor-pointer px-3 py-4 text-left text-xs font-bold uppercase tracking-wider text-gray-700 hover:bg-gray-100"
                @click="sortApiKeys('expiresAt')"
              >
                过期时间
                <i
                  v-if="apiKeysSortBy === 'expiresAt'"
                  :class="[
                    'fas',
                    apiKeysSortOrder === 'asc' ? 'fa-sort-up' : 'fa-sort-down',
                    'ml-1'
                  ]"
                />
                <i v-else class="fas fa-sort ml-1 text-gray-400" />
              </th>
              <th
                class="w-[20%] min-w-[180px] px-3 py-4 text-left text-xs font-bold uppercase tracking-wider text-gray-700"
              >
                操作
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200/50">
            <template v-for="key in paginatedApiKeys" :key="key.id">
              <!-- API Key 主行 -->
              <tr class="table-row">
                <td class="px-3 py-4">
                  <div class="flex items-center">
                    <input
                      v-model="selectedApiKeys"
                      class="mr-3 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      type="checkbox"
                      :value="key.id"
                      @change="updateSelectAllState"
                    />
                  </div>
                </td>
                <td class="px-3 py-4">
                  <div class="flex items-center">
                    <div
                      class="mr-2 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-blue-600"
                    >
                      <i class="fas fa-key text-xs text-white" />
                    </div>
                    <div class="min-w-0">
                      <div class="truncate text-sm font-semibold text-gray-900" :title="key.name">
                        {{ key.name }}
                      </div>
                      <div class="truncate text-xs text-gray-500" :title="key.id">
                        {{ key.id }}
                      </div>
                      <!-- 账户绑定信息 -->
                      <div class="mt-1.5 space-y-1">
                        <!-- Claude 绑定 -->
                        <div
                          v-if="key.claudeAccountId || key.claudeConsoleAccountId"
                          class="flex items-center gap-1 text-xs"
                        >
                          <span
                            class="inline-flex items-center rounded bg-indigo-100 px-1.5 py-0.5 text-indigo-700"
                          >
                            <i class="fas fa-brain mr-1 text-[10px]" />
                            Claude
                          </span>
                          <span class="truncate text-gray-600">
                            {{ getClaudeBindingInfo(key) }}
                          </span>
                        </div>
                        <!-- Gemini 绑定 -->
                        <div v-if="key.geminiAccountId" class="flex items-center gap-1 text-xs">
                          <span
                            class="inline-flex items-center rounded bg-yellow-100 px-1.5 py-0.5 text-yellow-700"
                          >
                            <i class="fas fa-robot mr-1 text-[10px]" />
                            Gemini
                          </span>
                          <span class="truncate text-gray-600">
                            {{ getGeminiBindingInfo(key) }}
                          </span>
                        </div>
                        <!-- OpenAI 绑定 -->
                        <div v-if="key.openaiAccountId" class="flex items-center gap-1 text-xs">
                          <span
                            class="inline-flex items-center rounded bg-gray-100 px-1.5 py-0.5 text-gray-700"
                          >
                            <i class="fa-openai mr-1 text-[10px]" />
                            OpenAI
                          </span>
                          <span class="truncate text-gray-600">
                            {{ getOpenAIBindingInfo(key) }}
                          </span>
                        </div>
                        <!-- Bedrock 绑定 -->
                        <div v-if="key.bedrockAccountId" class="flex items-center gap-1 text-xs">
                          <span
                            class="inline-flex items-center rounded bg-orange-100 px-1.5 py-0.5 text-orange-700"
                          >
                            <i class="fas fa-cloud mr-1 text-[10px]" />
                            Bedrock
                          </span>
                          <span class="truncate text-gray-600">
                            {{ getBedrockBindingInfo(key) }}
                          </span>
                        </div>
                        <!-- 无绑定时显示共享池 -->
                        <div
                          v-if="
                            !key.claudeAccountId &&
                            !key.claudeConsoleAccountId &&
                            !key.geminiAccountId &&
                            !key.openaiAccountId &&
                            !key.bedrockAccountId
                          "
                          class="text-xs text-gray-500"
                        >
                          <i class="fas fa-share-alt mr-1" />
                          使用共享池
                        </div>
                      </div>
                    </div>
                  </div>
                </td>
                <td class="px-3 py-4">
                  <div class="flex flex-wrap gap-1">
                    <span
                      v-for="tag in key.tags || []"
                      :key="tag"
                      class="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-800"
                    >
                      {{ tag }}
                    </span>
                    <span v-if="!key.tags || key.tags.length === 0" class="text-xs text-gray-400"
                      >无标签</span
                    >
                  </div>
                </td>
                <td class="whitespace-nowrap px-3 py-4">
                  <span
                    :class="[
                      'inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold',
                      key.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                    ]"
                  >
                    <div
                      :class="[
                        'mr-2 h-2 w-2 rounded-full',
                        key.isActive ? 'bg-green-500' : 'bg-red-500'
                      ]"
                    />
                    {{ key.isActive ? '活跃' : '禁用' }}
                  </span>
                </td>
                <td class="px-3 py-4">
                  <div class="space-y-2">
                    <!-- 今日使用统计 -->
                    <div class="mb-2">
                      <div class="mb-1 flex items-center justify-between text-sm">
                        <span class="text-gray-600">今日请求</span>
                        <span class="font-semibold text-gray-900"
                          >{{ formatNumber(key.usage?.daily?.requests || 0) }}次</span
                        >
                      </div>
                      <div class="flex items-center justify-between text-sm">
                        <span class="text-gray-600">今日费用</span>
                        <span class="font-semibold text-green-600"
                          >${{ (key.dailyCost || 0).toFixed(4) }}</span
                        >
                      </div>
                      <div class="flex items-center justify-between text-sm">
                        <span class="text-gray-600">最后使用</span>
                        <span class="font-medium text-gray-700">{{
                          formatLastUsed(key.lastUsedAt)
                        }}</span>
                      </div>
                    </div>

                    <!-- 每日费用限制进度条 -->
                    <div v-if="key.dailyCostLimit > 0" class="space-y-1">
                      <div class="flex items-center justify-between text-xs">
                        <span class="text-gray-500">费用限额</span>
                        <span class="text-gray-700">
                          ${{ (key.dailyCost || 0).toFixed(2) }} / ${{
                            key.dailyCostLimit.toFixed(2)
                          }}
                        </span>
                      </div>
                      <div class="h-1.5 w-full rounded-full bg-gray-200">
                        <div
                          class="h-1.5 rounded-full transition-all duration-300"
                          :class="getDailyCostProgressColor(key)"
                          :style="{ width: getDailyCostProgress(key) + '%' }"
                        />
                      </div>
                    </div>

                    <!-- 时间窗口限制进度条 -->
                    <WindowCountdown
                      v-if="key.rateLimitWindow > 0"
                      :current-requests="key.currentWindowRequests"
                      :current-tokens="key.currentWindowTokens"
                      :rate-limit-window="key.rateLimitWindow"
                      :request-limit="key.rateLimitRequests"
                      :show-progress="true"
                      :show-tooltip="false"
                      :token-limit="key.tokenLimit"
                      :window-end-time="key.windowEndTime"
                      :window-remaining-seconds="key.windowRemainingSeconds"
                      :window-start-time="key.windowStartTime"
                    />

                    <!-- 查看详情按钮 -->
                    <div class="pt-1">
                      <button
                        class="flex w-full items-center justify-center gap-1 rounded py-1 text-xs font-medium text-blue-600 transition-colors hover:bg-blue-50 hover:text-blue-800"
                        @click="showUsageDetails(key)"
                      >
                        <i class="fas fa-chart-line" />
                        查看详细统计
                      </button>
                    </div>
                  </div>
                </td>
                <td class="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                  {{ new Date(key.createdAt).toLocaleDateString() }}
                </td>
                <td class="whitespace-nowrap px-3 py-4 text-sm">
                  <div class="inline-flex items-center gap-1.5">
                    <span v-if="key.expiresAt">
                      <span
                        v-if="isApiKeyExpired(key.expiresAt)"
                        class="inline-flex items-center text-red-600"
                      >
                        <i class="fas fa-exclamation-circle mr-1" />
                        已过期
                      </span>
                      <span
                        v-else-if="isApiKeyExpiringSoon(key.expiresAt)"
                        class="inline-flex items-center text-orange-600"
                      >
                        <i class="fas fa-clock mr-1" />
                        {{ formatExpireDate(key.expiresAt) }}
                      </span>
                      <span v-else class="text-gray-600">
                        {{ formatExpireDate(key.expiresAt) }}
                      </span>
                    </span>
                    <span v-else class="inline-flex items-center text-gray-400">
                      <i class="fas fa-infinity mr-1" />
                      永不过期
                    </span>
                    <button
                      class="inline-flex h-6 w-6 items-center justify-center rounded-md text-gray-300 transition-all duration-200 hover:bg-blue-50 hover:text-blue-500"
                      title="编辑过期时间"
                      @click.stop="startEditExpiry(key)"
                    >
                      <svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                        ></path>
                      </svg>
                    </button>
                  </div>
                </td>
                <td class="whitespace-nowrap px-3 py-4 text-sm">
                  <div class="flex gap-1">
                    <button
                      v-if="key && key.id"
                      class="rounded px-2 py-1 text-xs font-medium text-indigo-600 transition-colors hover:bg-indigo-50 hover:text-indigo-900"
                      title="模型使用分布"
                      @click="toggleApiKeyModelStats(key.id)"
                    >
                      <i
                        :class="[
                          'fas',
                          expandedApiKeys[key.id] ? 'fa-chevron-up' : 'fa-chevron-down'
                        ]"
                      />
                      <span class="ml-1 hidden xl:inline">模型</span>
                    </button>
                    <button
                      class="rounded px-2 py-1 text-xs font-medium text-purple-600 transition-colors hover:bg-purple-50 hover:text-purple-900"
                      title="复制统计页面链接"
                      @click="copyApiStatsLink(key)"
                    >
                      <i class="fas fa-chart-bar" />
                      <span class="ml-1 hidden xl:inline">统计</span>
                    </button>
                    <button
                      class="rounded px-2 py-1 text-xs font-medium text-blue-600 transition-colors hover:bg-blue-50 hover:text-blue-900"
                      title="编辑"
                      @click="openEditApiKeyModal(key)"
                    >
                      <i class="fas fa-edit" />
                      <span class="ml-1 hidden xl:inline">编辑</span>
                    </button>
                    <button
                      v-if="
                        key.expiresAt &&
                        (isApiKeyExpired(key.expiresAt) || isApiKeyExpiringSoon(key.expiresAt))
                      "
                      class="rounded px-2 py-1 text-xs font-medium text-green-600 transition-colors hover:bg-green-50 hover:text-green-900"
                      title="续期"
                      @click="openRenewApiKeyModal(key)"
                    >
                      <i class="fas fa-clock" />
                      <span class="ml-1 hidden xl:inline">续期</span>
                    </button>
                    <button
                      :class="[
                        key.isActive
                          ? 'text-orange-600 hover:bg-orange-50 hover:text-orange-900'
                          : 'text-green-600 hover:bg-green-50 hover:text-green-900',
                        'rounded px-2 py-1 text-xs font-medium transition-colors'
                      ]"
                      :title="key.isActive ? '禁用' : '激活'"
                      @click="toggleApiKeyStatus(key)"
                    >
                      <i :class="['fas', key.isActive ? 'fa-ban' : 'fa-check-circle']" />
                      <span class="ml-1 hidden xl:inline">{{
                        key.isActive ? '禁用' : '激活'
                      }}</span>
                    </button>
                    <button
                      class="rounded px-2 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 hover:text-red-900"
                      title="删除"
                      @click="deleteApiKey(key.id)"
                    >
                      <i class="fas fa-trash" />
                      <span class="ml-1 hidden xl:inline">删除</span>
                    </button>
                  </div>
                </td>
              </tr>

              <!-- 模型统计展开区域 -->
              <tr v-if="key && key.id && expandedApiKeys[key.id]">
                <td class="bg-gray-50 px-3 py-4" colspan="8">
                  <div v-if="!apiKeyModelStats[key.id]" class="py-4 text-center">
                    <div class="loading-spinner mx-auto" />
                    <p class="mt-2 text-sm text-gray-500">加载模型统计...</p>
                  </div>
                  <div class="space-y-4">
                    <!-- 通用的标题和时间筛选器，无论是否有数据都显示 -->
                    <div class="mb-4 flex items-center justify-between">
                      <h5 class="flex items-center text-sm font-semibold text-gray-700">
                        <i class="fas fa-chart-pie mr-2 text-indigo-500" />
                        模型使用分布
                      </h5>
                      <div class="flex items-center gap-2">
                        <span
                          v-if="apiKeyModelStats[key.id] && apiKeyModelStats[key.id].length > 0"
                          class="rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-500"
                        >
                          {{ apiKeyModelStats[key.id].length }} 个模型
                        </span>

                        <!-- API Keys日期筛选器 -->
                        <div class="flex items-center gap-1">
                          <!-- 快捷日期选择 -->
                          <div class="flex gap-1 rounded bg-gray-100 p-1">
                            <button
                              v-for="option in getApiKeyDateFilter(key.id).presetOptions"
                              :key="option.value"
                              :class="[
                                'rounded px-2 py-1 text-xs font-medium transition-colors',
                                getApiKeyDateFilter(key.id).preset === option.value &&
                                getApiKeyDateFilter(key.id).type === 'preset'
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
                            class="api-key-date-picker"
                            :clearable="true"
                            :default-time="defaultTime"
                            :disabled-date="disabledDate"
                            end-placeholder="结束日期"
                            format="YYYY-MM-DD HH:mm:ss"
                            :model-value="getApiKeyDateFilter(key.id).customRange"
                            range-separator="至"
                            size="small"
                            start-placeholder="开始日期"
                            style="width: 280px"
                            type="datetimerange"
                            :unlink-panels="false"
                            value-format="YYYY-MM-DD HH:mm:ss"
                            @update:model-value="
                              (value) => onApiKeyCustomDateRangeChange(key.id, value)
                            "
                          />
                        </div>
                      </div>
                    </div>

                    <!-- 数据展示区域 -->
                    <div
                      v-if="apiKeyModelStats[key.id] && apiKeyModelStats[key.id].length === 0"
                      class="py-8 text-center"
                    >
                      <div class="mb-3 flex items-center justify-center gap-2">
                        <i class="fas fa-chart-line text-lg text-gray-400" />
                        <p class="text-sm text-gray-500">暂无模型使用数据</p>
                        <button
                          class="ml-2 flex items-center gap-1 text-sm text-blue-500 transition-colors hover:text-blue-700"
                          title="重置筛选条件并刷新"
                          @click="resetApiKeyDateFilter(key.id)"
                        >
                          <i class="fas fa-sync-alt text-xs" />
                          <span class="text-xs">刷新</span>
                        </button>
                      </div>
                      <p class="text-xs text-gray-400">尝试调整时间范围或点击刷新重新加载数据</p>
                    </div>
                    <div
                      v-else-if="apiKeyModelStats[key.id] && apiKeyModelStats[key.id].length > 0"
                      class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3"
                    >
                      <div
                        v-for="stat in apiKeyModelStats[key.id]"
                        :key="stat.model"
                        class="rounded-xl border border-gray-200 bg-gradient-to-br from-white to-gray-50 p-4 transition-all duration-200 hover:border-indigo-300 hover:shadow-lg"
                      >
                        <div class="mb-3 flex items-start justify-between">
                          <div class="flex-1">
                            <span class="mb-1 block text-sm font-semibold text-gray-800">{{
                              stat.model
                            }}</span>
                            <span class="rounded-full bg-blue-50 px-2 py-1 text-xs text-gray-500"
                              >{{ stat.requests }} 次请求</span
                            >
                          </div>
                        </div>

                        <div class="mb-3 space-y-2">
                          <div class="flex items-center justify-between text-sm">
                            <span class="flex items-center text-gray-600">
                              <i class="fas fa-coins mr-1 text-xs text-yellow-500" />
                              总Token:
                            </span>
                            <span class="font-semibold text-gray-900">{{
                              formatTokenCount(stat.allTokens)
                            }}</span>
                          </div>
                          <div class="flex items-center justify-between text-sm">
                            <span class="flex items-center text-gray-600">
                              <i class="fas fa-dollar-sign mr-1 text-xs text-green-500" />
                              费用:
                            </span>
                            <span class="font-semibold text-green-600">{{
                              calculateModelCost(stat)
                            }}</span>
                          </div>
                          <div class="mt-2 border-t border-gray-100 pt-2">
                            <div class="flex items-center justify-between text-xs text-gray-500">
                              <span class="flex items-center">
                                <i class="fas fa-arrow-down mr-1 text-green-500" />
                                输入:
                              </span>
                              <span class="font-medium">{{
                                formatTokenCount(stat.inputTokens)
                              }}</span>
                            </div>
                            <div class="flex items-center justify-between text-xs text-gray-500">
                              <span class="flex items-center">
                                <i class="fas fa-arrow-up mr-1 text-blue-500" />
                                输出:
                              </span>
                              <span class="font-medium">{{
                                formatTokenCount(stat.outputTokens)
                              }}</span>
                            </div>
                            <div
                              v-if="stat.cacheCreateTokens > 0"
                              class="flex items-center justify-between text-xs text-purple-600"
                            >
                              <span class="flex items-center">
                                <i class="fas fa-save mr-1" />
                                缓存创建:
                              </span>
                              <span class="font-medium">{{
                                formatTokenCount(stat.cacheCreateTokens)
                              }}</span>
                            </div>
                            <div
                              v-if="stat.cacheReadTokens > 0"
                              class="flex items-center justify-between text-xs text-purple-600"
                            >
                              <span class="flex items-center">
                                <i class="fas fa-download mr-1" />
                                缓存读取:
                              </span>
                              <span class="font-medium">{{
                                formatTokenCount(stat.cacheReadTokens)
                              }}</span>
                            </div>
                          </div>
                        </div>

                        <!-- 进度条 -->
                        <div class="mt-3 h-2 w-full rounded-full bg-gray-200">
                          <div
                            class="h-2 rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 transition-all duration-500"
                            :style="{
                              width:
                                calculateApiKeyModelPercentage(
                                  stat.allTokens,
                                  apiKeyModelStats[key.id]
                                ) + '%'
                            }"
                          />
                        </div>
                        <div class="mt-1 text-right">
                          <span class="text-xs font-medium text-indigo-600">
                            {{
                              calculateApiKeyModelPercentage(
                                stat.allTokens,
                                apiKeyModelStats[key.id]
                              )
                            }}%
                          </span>
                        </div>
                      </div>
                    </div>

                    <!-- 总计统计，仅在有数据时显示 -->
                    <div
                      v-if="apiKeyModelStats[key.id] && apiKeyModelStats[key.id].length > 0"
                      class="mt-4 rounded-lg border border-indigo-100 bg-gradient-to-r from-indigo-50 to-purple-50 p-3"
                    >
                      <div class="flex items-center justify-between text-sm">
                        <span class="flex items-center font-semibold text-gray-700">
                          <i class="fas fa-calculator mr-2 text-indigo-500" />
                          总计统计
                        </span>
                        <div class="flex gap-4 text-xs">
                          <span class="text-gray-600">
                            总请求:
                            <span class="font-semibold text-gray-800">{{
                              apiKeyModelStats[key.id].reduce((sum, stat) => sum + stat.requests, 0)
                            }}</span>
                          </span>
                          <span class="text-gray-600">
                            总Token:
                            <span class="font-semibold text-gray-800">{{
                              formatTokenCount(
                                apiKeyModelStats[key.id].reduce(
                                  (sum, stat) => sum + stat.allTokens,
                                  0
                                )
                              )
                            }}</span>
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
      <div v-if="!apiKeysLoading && sortedApiKeys.length > 0" class="space-y-3 md:hidden">
        <div
          v-for="key in paginatedApiKeys"
          :key="key.id"
          class="card p-4 transition-shadow hover:shadow-lg"
        >
          <!-- 卡片头部 -->
          <div class="mb-3 flex items-start justify-between">
            <div class="flex items-center gap-3">
              <input
                v-model="selectedApiKeys"
                class="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                type="checkbox"
                :value="key.id"
                @change="updateSelectAllState"
              />
              <div
                class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-blue-600"
              >
                <i class="fas fa-key text-sm text-white" />
              </div>
              <div>
                <h4 class="text-sm font-semibold text-gray-900">
                  {{ key.name }}
                </h4>
                <p class="mt-0.5 text-xs text-gray-500">
                  {{ key.id }}
                </p>
              </div>
            </div>
            <span
              :class="[
                'inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold',
                key.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
              ]"
            >
              <div
                :class="[
                  'mr-1.5 h-1.5 w-1.5 rounded-full',
                  key.isActive ? 'bg-green-500' : 'bg-red-500'
                ]"
              />
              {{ key.isActive ? '活跃' : '已停用' }}
            </span>
          </div>

          <!-- 账户绑定信息 -->
          <div class="mb-3 space-y-1.5">
            <!-- Claude 绑定 -->
            <div
              v-if="key.claudeAccountId || key.claudeConsoleAccountId"
              class="flex flex-wrap items-center gap-1 text-xs"
            >
              <span
                class="inline-flex items-center rounded bg-indigo-100 px-2 py-0.5 text-indigo-700"
              >
                <i class="fas fa-brain mr-1" />
                Claude
              </span>
              <span class="text-gray-600">
                {{ getClaudeBindingInfo(key) }}
              </span>
            </div>
            <!-- Gemini 绑定 -->
            <div v-if="key.geminiAccountId" class="flex flex-wrap items-center gap-1 text-xs">
              <span
                class="inline-flex items-center rounded bg-yellow-100 px-2 py-0.5 text-yellow-700"
              >
                <i class="fas fa-robot mr-1" />
                Gemini
              </span>
              <span class="text-gray-600">
                {{ getGeminiBindingInfo(key) }}
              </span>
            </div>
            <!-- OpenAI 绑定 -->
            <div v-if="key.openaiAccountId" class="flex flex-wrap items-center gap-1 text-xs">
              <span class="inline-flex items-center rounded bg-gray-100 px-2 py-0.5 text-gray-700">
                <i class="fa-openai mr-1" />
                OpenAI
              </span>
              <span class="text-gray-600">
                {{ getOpenAIBindingInfo(key) }}
              </span>
            </div>
            <!-- Bedrock 绑定 -->
            <div v-if="key.bedrockAccountId" class="flex flex-wrap items-center gap-1 text-xs">
              <span
                class="inline-flex items-center rounded bg-orange-100 px-2 py-0.5 text-orange-700"
              >
                <i class="fas fa-cloud mr-1" />
                Bedrock
              </span>
              <span class="text-gray-600">
                {{ getBedrockBindingInfo(key) }}
              </span>
            </div>
            <!-- 无绑定时显示共享池 -->
            <div
              v-if="
                !key.claudeAccountId &&
                !key.claudeConsoleAccountId &&
                !key.geminiAccountId &&
                !key.openaiAccountId &&
                !key.bedrockAccountId
              "
              class="text-xs text-gray-500"
            >
              <i class="fas fa-share-alt mr-1" />
              使用共享池
            </div>
          </div>

          <!-- 统计信息 -->
          <div class="mb-3 space-y-2">
            <!-- 今日使用 -->
            <div class="rounded-lg bg-gray-50 p-3">
              <div class="mb-2 flex items-center justify-between">
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
                    {{ formatNumber(key.usage?.daily?.requests || 0) }} 次
                  </p>
                  <p class="text-xs text-gray-500">请求</p>
                </div>
                <div>
                  <p class="text-sm font-semibold text-green-600">
                    ${{ (key.dailyCost || 0).toFixed(4) }}
                  </p>
                  <p class="text-xs text-gray-500">费用</p>
                </div>
              </div>
              <div class="mt-2 flex items-center justify-between">
                <span class="text-xs text-gray-600">最后使用</span>
                <span class="text-xs font-medium text-gray-700">{{
                  formatLastUsed(key.lastUsedAt)
                }}</span>
              </div>
            </div>

            <!-- 限制进度 -->
            <div v-if="key.dailyCostLimit > 0" class="space-y-1">
              <div class="flex items-center justify-between text-xs">
                <span class="text-gray-500">每日费用限额</span>
                <span class="text-gray-700">
                  ${{ (key.dailyCost || 0).toFixed(2) }} / ${{ key.dailyCostLimit.toFixed(2) }}
                </span>
              </div>
              <div class="h-2 w-full rounded-full bg-gray-200">
                <div
                  class="h-2 rounded-full transition-all duration-300"
                  :class="getDailyCostProgressColor(key)"
                  :style="{ width: getDailyCostProgress(key) + '%' }"
                />
              </div>
            </div>

            <!-- 移动端时间窗口限制 -->
            <WindowCountdown
              v-if="key.rateLimitWindow > 0 && (key.rateLimitRequests > 0 || key.tokenLimit > 0)"
              :current-requests="key.currentWindowRequests"
              :current-tokens="key.currentWindowTokens"
              :rate-limit-window="key.rateLimitWindow"
              :request-limit="key.rateLimitRequests"
              :show-progress="true"
              :show-tooltip="false"
              :token-limit="key.tokenLimit"
              :window-end-time="key.windowEndTime"
              :window-remaining-seconds="key.windowRemainingSeconds"
              :window-start-time="key.windowStartTime"
            />
          </div>

          <!-- 时间信息 -->
          <div class="mb-3 text-xs text-gray-500">
            <div class="mb-1 flex justify-between">
              <span>创建时间</span>
              <span>{{ formatDate(key.createdAt) }}</span>
            </div>
            <div class="flex items-center justify-between">
              <span>过期时间</span>
              <div class="flex items-center gap-1">
                <span
                  :class="
                    isApiKeyExpiringSoon(key.expiresAt) ? 'font-semibold text-orange-600' : ''
                  "
                >
                  {{ key.expiresAt ? formatDate(key.expiresAt) : '永不过期' }}
                </span>
                <button
                  class="inline-flex h-5 w-5 items-center justify-center rounded text-gray-300 transition-all duration-200 hover:bg-blue-50 hover:text-blue-500"
                  title="编辑过期时间"
                  @click.stop="startEditExpiry(key)"
                >
                  <svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                    ></path>
                  </svg>
                </button>
              </div>
            </div>
          </div>

          <!-- 标签 -->
          <div v-if="key.tags && key.tags.length > 0" class="mb-3 flex flex-wrap gap-1">
            <span
              v-for="tag in key.tags"
              :key="tag"
              class="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-800"
            >
              {{ tag }}
            </span>
          </div>

          <!-- 操作按钮 -->
          <div class="mt-3 flex gap-2 border-t border-gray-100 pt-3">
            <button
              class="flex flex-1 items-center justify-center gap-1 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-600 transition-colors hover:bg-blue-100"
              @click="showUsageDetails(key)"
            >
              <i class="fas fa-chart-line" />
              查看详情
            </button>
            <button
              class="flex-1 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600 transition-colors hover:bg-gray-100"
              @click="openEditApiKeyModal(key)"
            >
              <i class="fas fa-edit mr-1" />
              编辑
            </button>
            <button
              v-if="
                key.expiresAt &&
                (isApiKeyExpired(key.expiresAt) || isApiKeyExpiringSoon(key.expiresAt))
              "
              class="flex-1 rounded-lg bg-orange-50 px-3 py-2 text-xs text-orange-600 transition-colors hover:bg-orange-100"
              @click="openRenewApiKeyModal(key)"
            >
              <i class="fas fa-clock mr-1" />
              续期
            </button>
            <button
              :class="[
                key.isActive
                  ? 'bg-orange-50 text-orange-600 hover:bg-orange-100'
                  : 'bg-green-50 text-green-600 hover:bg-green-100',
                'rounded-lg px-3 py-2 text-xs transition-colors'
              ]"
              @click="toggleApiKeyStatus(key)"
            >
              <i :class="['fas', key.isActive ? 'fa-ban' : 'fa-check-circle', 'mr-1']" />
              {{ key.isActive ? '禁用' : '激活' }}
            </button>
            <button
              class="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 transition-colors hover:bg-red-100"
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
        class="mt-4 flex flex-col items-center justify-between gap-4 sm:mt-6 sm:flex-row"
      >
        <div class="flex w-full flex-col items-center gap-3 sm:w-auto sm:flex-row">
          <span class="text-xs text-gray-600 sm:text-sm">
            共 {{ sortedApiKeys.length }} 条记录
          </span>
          <div class="flex items-center gap-2">
            <span class="text-xs text-gray-600 sm:text-sm">每页显示</span>
            <select
              v-model="pageSize"
              class="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 transition-colors hover:border-gray-300 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 sm:text-sm"
              @change="currentPage = 1"
            >
              <option v-for="size in pageSizeOptions" :key="size" :value="size">
                {{ size }}
              </option>
            </select>
            <span class="text-xs text-gray-600 sm:text-sm">条</span>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <!-- 上一页 -->
          <button
            class="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 sm:py-1 sm:text-sm"
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
              class="hidden rounded-md border border-gray-300 bg-white px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-50 sm:block"
              @click="currentPage = 1"
            >
              1
            </button>
            <span v-if="currentPage > 4" class="hidden px-2 text-gray-500 sm:inline">...</span>

            <!-- 中间页码 -->
            <button
              v-for="page in pageNumbers"
              :key="page"
              :class="[
                'rounded-md px-2 py-1 text-xs font-medium sm:px-3 sm:text-sm',
                page === currentPage
                  ? 'bg-blue-600 text-white'
                  : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
              ]"
              @click="currentPage = page"
            >
              {{ page }}
            </button>

            <!-- 最后一页 -->
            <span v-if="currentPage < totalPages - 3" class="hidden px-2 text-gray-500 sm:inline"
              >...</span
            >
            <button
              v-if="totalPages > 1 && currentPage < totalPages - 2"
              class="hidden rounded-md border border-gray-300 bg-white px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-50 sm:block"
              @click="currentPage = totalPages"
            >
              {{ totalPages }}
            </button>
          </div>

          <!-- 下一页 -->
          <button
            class="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 sm:py-1 sm:text-sm"
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
      @batch-success="handleBatchCreateSuccess"
      @close="showCreateApiKeyModal = false"
      @success="handleCreateSuccess"
    />

    <EditApiKeyModal
      v-if="showEditApiKeyModal"
      :accounts="accounts"
      :api-key="editingApiKey"
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

    <BatchEditApiKeyModal
      v-if="showBatchEditModal"
      :accounts="accounts"
      :selected-keys="selectedApiKeys"
      @close="showBatchEditModal = false"
      @success="handleBatchEditSuccess"
    />

    <!-- 过期时间编辑弹窗 -->
    <ExpiryEditModal
      ref="expiryEditModalRef"
      :api-key="editingExpiryKey || { id: null, expiresAt: null, name: '' }"
      :show="!!editingExpiryKey"
      @close="closeExpiryEdit"
      @save="handleSaveExpiry"
    />

    <!-- 使用详情弹窗 -->
    <UsageDetailModal
      :api-key="selectedApiKeyForDetail || {}"
      :show="showUsageDetailModal"
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
import BatchEditApiKeyModal from '@/components/apikeys/BatchEditApiKeyModal.vue'
import ExpiryEditModal from '@/components/apikeys/ExpiryEditModal.vue'
import UsageDetailModal from '@/components/apikeys/UsageDetailModal.vue'
import WindowCountdown from '@/components/apikeys/WindowCountdown.vue'
import CustomDropdown from '@/components/common/CustomDropdown.vue'

// 响应式数据
const clientsStore = useClientsStore()
const apiKeys = ref([])

// 多选相关状态
const selectedApiKeys = ref([])
const selectAllChecked = ref(false)
const isIndeterminate = ref(false)
const apiKeysLoading = ref(false)
const apiKeyStatsTimeRange = ref('today')
const apiKeysSortBy = ref('')
const apiKeysSortOrder = ref('asc')
const expandedApiKeys = ref({})
const apiKeyModelStats = ref({})
const apiKeyDateFilters = ref({})
const defaultTime = ref([new Date(2000, 1, 1, 0, 0, 0), new Date(2000, 2, 1, 23, 59, 59)])
const accounts = ref({
  claude: [],
  gemini: [],
  openai: [],
  bedrock: [],
  claudeGroups: [],
  geminiGroups: [],
  openaiGroups: []
})
const editingExpiryKey = ref(null)
const expiryEditModalRef = ref(null)
const showUsageDetailModal = ref(false)
const selectedApiKeyForDetail = ref(null)

// 标签相关
const selectedTagFilter = ref('')
const availableTags = ref([])

// 搜索相关
const searchKeyword = ref('')

// 下拉选项数据
const timeRangeOptions = ref([
  { value: 'today', label: '今日', icon: 'fa-clock' },
  { value: '7days', label: '最近7天', icon: 'fa-calendar-week' },
  { value: 'monthly', label: '本月', icon: 'fa-calendar' },
  { value: 'all', label: '全部时间', icon: 'fa-infinity' }
])

const tagOptions = computed(() => {
  const options = [{ value: '', label: '所有标签', icon: 'fa-asterisk' }]
  availableTags.value.forEach((tag) => {
    options.push({ value: tag, label: tag, icon: 'fa-tag' })
  })
  return options
})

const selectedTagCount = computed(() => {
  if (!selectedTagFilter.value) return 0
  return apiKeys.value.filter((key) => key.tags && key.tags.includes(selectedTagFilter.value))
    .length
})

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
const showBatchEditModal = ref(false)
const editingApiKey = ref(null)
const renewingApiKey = ref(null)
const newApiKeyData = ref(null)
const batchApiKeyData = ref([])

// 计算排序后的API Keys
const sortedApiKeys = computed(() => {
  // 先进行标签筛选
  let filteredKeys = apiKeys.value
  if (selectedTagFilter.value) {
    filteredKeys = apiKeys.value.filter(
      (key) => key.tags && key.tags.includes(selectedTagFilter.value)
    )
  }

  // 然后进行名称搜索
  if (searchKeyword.value) {
    const keyword = searchKeyword.value.toLowerCase().trim()
    filteredKeys = filteredKeys.filter(
      (key) => key.name && key.name.toLowerCase().includes(keyword)
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
    const [claudeData, claudeConsoleData, geminiData, openaiData, bedrockData, groupsData] =
      await Promise.all([
        apiClient.get('/admin/claude-accounts'),
        apiClient.get('/admin/claude-console-accounts'),
        apiClient.get('/admin/gemini-accounts'),
        apiClient.get('/admin/openai-accounts'),
        apiClient.get('/admin/bedrock-accounts'),
        apiClient.get('/admin/account-groups')
      ])

    // 合并Claude OAuth账户和Claude Console账户
    const claudeAccounts = []

    if (claudeData.success) {
      claudeData.data?.forEach((account) => {
        claudeAccounts.push({
          ...account,
          platform: 'claude-oauth',
          isDedicated: account.accountType === 'dedicated'
        })
      })
    }

    if (claudeConsoleData.success) {
      claudeConsoleData.data?.forEach((account) => {
        claudeAccounts.push({
          ...account,
          platform: 'claude-console',
          isDedicated: account.accountType === 'dedicated'
        })
      })
    }

    accounts.value.claude = claudeAccounts

    if (geminiData.success) {
      accounts.value.gemini = (geminiData.data || []).map((account) => ({
        ...account,
        isDedicated: account.accountType === 'dedicated'
      }))
    }

    if (openaiData.success) {
      accounts.value.openai = (openaiData.data || []).map((account) => ({
        ...account,
        isDedicated: account.accountType === 'dedicated'
      }))
    }

    if (bedrockData.success) {
      accounts.value.bedrock = (bedrockData.data || []).map((account) => ({
        ...account,
        isDedicated: account.accountType === 'dedicated'
      }))
    }

    if (groupsData.success) {
      // 处理分组数据
      const allGroups = groupsData.data || []
      accounts.value.claudeGroups = allGroups.filter((g) => g.platform === 'claude')
      accounts.value.geminiGroups = allGroups.filter((g) => g.platform === 'gemini')
      accounts.value.openaiGroups = allGroups.filter((g) => g.platform === 'openai')
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
      apiKeys.value.forEach((key) => {
        if (key.tags && Array.isArray(key.tags)) {
          key.tags.forEach((tag) => tagsSet.add(tag))
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
    const claudeGroup = accounts.value.claudeGroups.find((g) => g.id === groupId)
    if (claudeGroup) {
      return `分组-${claudeGroup.name}`
    }

    // 从Gemini分组中查找
    const geminiGroup = accounts.value.geminiGroups.find((g) => g.id === groupId)
    if (geminiGroup) {
      return `分组-${geminiGroup.name}`
    }

    // 从OpenAI分组中查找
    const openaiGroup = accounts.value.openaiGroups.find((g) => g.id === groupId)
    if (openaiGroup) {
      return `分组-${openaiGroup.name}`
    }

    // 如果找不到分组，返回分组ID的前8位
    return `分组-${groupId.substring(0, 8)}`
  }

  // 从Claude账户列表中查找
  const claudeAccount = accounts.value.claude.find((acc) => acc.id === accountId)
  if (claudeAccount) {
    return `${claudeAccount.name}`
  }

  // 从Gemini账户列表中查找
  const geminiAccount = accounts.value.gemini.find((acc) => acc.id === accountId)
  if (geminiAccount) {
    return `${geminiAccount.name}`
  }

  // 从OpenAI账户列表中查找
  const openaiAccount = accounts.value.openai.find((acc) => acc.id === accountId)
  if (openaiAccount) {
    return `${openaiAccount.name}`
  }

  // 从Bedrock账户列表中查找
  const bedrockAccount = accounts.value.bedrock.find((acc) => acc.id === accountId)
  if (bedrockAccount) {
    return `${bedrockAccount.name}`
  }

  // 如果找不到，返回账户ID的前8位
  return `${accountId.substring(0, 8)}`
}

// 获取Claude绑定信息
const getClaudeBindingInfo = (key) => {
  if (key.claudeAccountId) {
    const info = getBoundAccountName(key.claudeAccountId)
    if (key.claudeAccountId.startsWith('group:')) {
      return info
    }
    // 检查账户是否存在
    const account = accounts.value.claude.find((acc) => acc.id === key.claudeAccountId)
    if (!account) {
      return `⚠️ ${info} (账户不存在)`
    }
    if (account.accountType === 'dedicated') {
      return `🔒 专属-${info}`
    }
    return info
  }
  if (key.claudeConsoleAccountId) {
    const account = accounts.value.claude.find(
      (acc) => acc.id === key.claudeConsoleAccountId && acc.platform === 'claude-console'
    )
    if (!account) {
      return `⚠️ Console账户不存在`
    }
    return `Console-${account.name}`
  }
  return ''
}

// 获取Gemini绑定信息
const getGeminiBindingInfo = (key) => {
  if (key.geminiAccountId) {
    const info = getBoundAccountName(key.geminiAccountId)
    if (key.geminiAccountId.startsWith('group:')) {
      return info
    }
    // 检查账户是否存在
    const account = accounts.value.gemini.find((acc) => acc.id === key.geminiAccountId)
    if (!account) {
      return `⚠️ ${info} (账户不存在)`
    }
    if (account.accountType === 'dedicated') {
      return `🔒 专属-${info}`
    }
    return info
  }
  return ''
}

// 获取OpenAI绑定信息
const getOpenAIBindingInfo = (key) => {
  if (key.openaiAccountId) {
    const info = getBoundAccountName(key.openaiAccountId)
    if (key.openaiAccountId.startsWith('group:')) {
      return info
    }
    // 检查账户是否存在
    const account = accounts.value.openai.find((acc) => acc.id === key.openaiAccountId)
    if (!account) {
      return `⚠️ ${info} (账户不存在)`
    }
    if (account.accountType === 'dedicated') {
      return `🔒 专属-${info}`
    }
    return info
  }
  return ''
}

// 获取Bedrock绑定信息
const getBedrockBindingInfo = (key) => {
  if (key.bedrockAccountId) {
    const info = getBoundAccountName(key.bedrockAccountId)
    if (key.bedrockAccountId.startsWith('group:')) {
      return info
    }
    // 检查账户是否存在
    const account = accounts.value.bedrock.find((acc) => acc.id === key.bedrockAccountId)
    if (!account) {
      return `⚠️ ${info} (账户不存在)`
    }
    if (account.accountType === 'dedicated') {
      return `🔒 专属-${info}`
    }
    return info
  }
  return ''
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
      const period =
        filter.preset === 'today' ? 'daily' : filter.preset === '7days' ? 'daily' : 'monthly'
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

  const option = filter.presetOptions.find((opt) => opt.value === preset)
  if (option) {
    const today = new Date()
    const startDate = new Date(today)
    startDate.setDate(today.getDate() - (option.days - 1))

    filter.customStart = startDate.toISOString().split('T')[0]
    filter.customEnd = today.toISOString().split('T')[0]

    const formatDate = (date) => {
      return (
        date.getFullYear() +
        '-' +
        String(date.getMonth() + 1).padStart(2, '0') +
        '-' +
        String(date.getDate()).padStart(2, '0') +
        ' 00:00:00'
      )
    }

    filter.customRange = [formatDate(startDate), formatDate(today)]
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

// 打开批量编辑模态框
const openBatchEditModal = async () => {
  if (selectedApiKeys.value.length === 0) {
    showToast('请先选择要编辑的 API Keys', 'warning')
    return
  }

  // 重新加载账号数据，确保显示最新的专属账号
  await loadAccounts()
  showBatchEditModal.value = true
}

// 处理批量编辑成功
const handleBatchEditSuccess = () => {
  showBatchEditModal.value = false
  // 清空选中状态
  selectedApiKeys.value = []
  updateSelectAllState()
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

// 切换API Key状态（激活/禁用）
const toggleApiKeyStatus = async (key) => {
  let confirmed = true

  // 禁用时需要二次确认
  if (key.isActive) {
    if (window.showConfirm) {
      confirmed = await window.showConfirm(
        '禁用 API Key',
        `确定要禁用 API Key "${key.name}" 吗？禁用后所有使用此 Key 的请求将返回 401 错误。`,
        '确定禁用',
        '取消'
      )
    } else {
      // 降级方案
      confirmed = confirm(
        `确定要禁用 API Key "${key.name}" 吗？禁用后所有使用此 Key 的请求将返回 401 错误。`
      )
    }
  }

  if (!confirmed) return

  try {
    const data = await apiClient.put(`/admin/api-keys/${key.id}`, {
      isActive: !key.isActive
    })

    if (data.success) {
      showToast(`API Key 已${key.isActive ? '禁用' : '激活'}`, 'success')
      // 更新本地数据
      const localKey = apiKeys.value.find((k) => k.id === key.id)
      if (localKey) {
        localKey.isActive = !key.isActive
      }
    } else {
      showToast(data.message || '操作失败', 'error')
    }
  } catch (error) {
    showToast('操作失败', 'error')
  }
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
      // 从选中列表中移除
      const index = selectedApiKeys.value.indexOf(keyId)
      if (index > -1) {
        selectedApiKeys.value.splice(index, 1)
      }
      updateSelectAllState()
      loadApiKeys()
    } else {
      showToast(data.message || '删除失败', 'error')
    }
  } catch (error) {
    showToast('删除失败', 'error')
  }
}

// 批量删除API Keys
const batchDeleteApiKeys = async () => {
  const selectedCount = selectedApiKeys.value.length
  if (selectedCount === 0) {
    showToast('请先选择要删除的 API Keys', 'warning')
    return
  }

  let confirmed = false
  const message = `确定要删除选中的 ${selectedCount} 个 API Key 吗？此操作不可恢复。`

  if (window.showConfirm) {
    confirmed = await window.showConfirm('批量删除 API Keys', message, '确定删除', '取消')
  } else {
    confirmed = confirm(message)
  }

  if (!confirmed) return

  const keyIds = [...selectedApiKeys.value]

  try {
    const data = await apiClient.delete('/admin/api-keys/batch', {
      data: { keyIds }
    })

    if (data.success) {
      const { successCount, failedCount, errors } = data.data

      if (successCount > 0) {
        showToast(`成功删除 ${successCount} 个 API Keys`, 'success')

        // 如果有失败的，显示详细信息
        if (failedCount > 0) {
          const errorMessages = errors.map((e) => `${e.keyId}: ${e.error}`).join('\n')
          showToast(`${failedCount} 个删除失败:\n${errorMessages}`, 'warning')
        }
      } else {
        showToast('所有 API Keys 删除失败', 'error')
      }

      // 清空选中状态
      selectedApiKeys.value = []
      updateSelectAllState()
      loadApiKeys()
    } else {
      showToast(data.message || '批量删除失败', 'error')
    }
  } catch (error) {
    showToast('批量删除失败', 'error')
    console.error('批量删除 API Keys 失败:', error)
  }
}

// 处理全选/取消全选
const handleSelectAll = () => {
  if (selectAllChecked.value) {
    // 全选当前页的所有API Keys
    paginatedApiKeys.value.forEach((key) => {
      if (!selectedApiKeys.value.includes(key.id)) {
        selectedApiKeys.value.push(key.id)
      }
    })
  } else {
    // 取消全选：只移除当前页的选中项，保留其他页面的选中项
    const currentPageIds = new Set(paginatedApiKeys.value.map((key) => key.id))
    selectedApiKeys.value = selectedApiKeys.value.filter((id) => !currentPageIds.has(id))
  }
  updateSelectAllState()
}

// 更新全选状态
const updateSelectAllState = () => {
  const totalInCurrentPage = paginatedApiKeys.value.length
  const selectedInCurrentPage = paginatedApiKeys.value.filter((key) =>
    selectedApiKeys.value.includes(key.id)
  ).length

  if (selectedInCurrentPage === 0) {
    selectAllChecked.value = false
    isIndeterminate.value = false
  } else if (selectedInCurrentPage === totalInCurrentPage) {
    selectAllChecked.value = true
    isIndeterminate.value = false
  } else {
    selectAllChecked.value = false
    isIndeterminate.value = true
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
      const key = apiKeys.value.find((k) => k.id === keyId)
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
  return date
    .toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
    .replace(/\//g, '-')
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

// 格式化最后使用时间
const formatLastUsed = (dateString) => {
  if (!dateString) return '从未使用'
  const date = new Date(dateString)
  const now = new Date()
  const diff = now - date
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`
  if (diff < 604800000) return `${Math.floor(diff / 86400000)} 天前`
  return date.toLocaleDateString('zh-CN')
}

// 清除搜索
const clearSearch = () => {
  searchKeyword.value = ''
  currentPage.value = 1
}

// 监听筛选条件变化，重置页码和选中状态
// 监听筛选条件变化（不包括搜索），清空选中状态
watch([selectedTagFilter, apiKeyStatsTimeRange], () => {
  currentPage.value = 1
  // 清空选中状态
  selectedApiKeys.value = []
  updateSelectAllState()
})

// 监听搜索关键词变化，只重置分页，保持选中状态
watch(searchKeyword, () => {
  currentPage.value = 1
  // 不清空选中状态，允许跨搜索保持勾选
  updateSelectAllState()
})

// 监听分页变化，更新全选状态
watch([currentPage, pageSize], () => {
  updateSelectAllState()
})

// 监听API Keys数据变化，清理无效的选中状态
watch(apiKeys, () => {
  const validIds = new Set(apiKeys.value.map((key) => key.id))

  // 过滤出仍然有效的选中项
  selectedApiKeys.value = selectedApiKeys.value.filter((id) => validIds.has(id))

  updateSelectAllState()
})

onMounted(async () => {
  // 并行加载所有需要的数据
  await Promise.all([clientsStore.loadSupportedClients(), loadAccounts(), loadApiKeys()])

  // 初始化全选状态
  updateSelectAllState()
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
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

.api-key-date-picker :deep(.el-input__inner) {
  @apply border-gray-300 bg-white focus:border-blue-500 focus:ring-blue-500;
}

.api-key-date-picker :deep(.el-range-separator) {
  @apply text-gray-500;
}
</style>
