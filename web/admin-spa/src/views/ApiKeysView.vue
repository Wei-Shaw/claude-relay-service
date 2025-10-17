<template>
  <div class="tab-content">
    <div class="card p-4 sm:p-6">
      <div class="mb-4 flex flex-col gap-4 sm:mb-6">
        <div>
          <h3 class="mb-1 text-lg font-bold text-gray-900 dark:text-gray-100 sm:mb-2 sm:text-xl">
            API Keys 管理
          </h3>
          <p class="text-sm text-gray-600 dark:text-gray-400 sm:text-base">
            管理和监控您的 API 密钥
          </p>
        </div>

        <!-- Tab Navigation -->
        <div class="border-b border-gray-200 dark:border-gray-700">
          <nav aria-label="Tabs" class="-mb-px flex space-x-8">
            <button
              :class="[
                'whitespace-nowrap border-b-2 px-1 py-2 text-sm font-medium',
                activeTab === 'active'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:border-gray-500 dark:hover:text-gray-300'
              ]"
              @click="activeTab = 'active'"
            >
              活跃 API Keys
              <span
                v-if="apiKeys.length > 0"
                class="ml-2 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-900 dark:bg-gray-700 dark:text-gray-100"
              >
                {{ apiKeys.length }}
              </span>
            </button>
            <button
              :class="[
                'whitespace-nowrap border-b-2 px-1 py-2 text-sm font-medium',
                activeTab === 'deleted'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:border-gray-500 dark:hover:text-gray-300'
              ]"
              @click="loadDeletedApiKeys"
            >
              已删除 API Keys
              <span
                v-if="deletedApiKeys.length > 0"
                class="ml-2 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-900 dark:bg-gray-700 dark:text-gray-100"
              >
                {{ deletedApiKeys.length }}
              </span>
            </button>
          </nav>
        </div>

        <!-- Tab Content -->
        <!-- 活跃 API Keys Tab Panel -->
        <div v-if="activeTab === 'active'" class="tab-panel">
          <!-- 工具栏区域 - 添加 mb-4 增加与表格的间距 -->
          <div class="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <!-- 左侧：查询筛选器组 -->
            <div class="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
              <!-- 时间范围筛选 -->
              <div class="group relative min-w-[140px]">
                <div
                  class="absolute -inset-0.5 rounded-lg bg-gradient-to-r from-blue-500 to-purple-500 opacity-0 blur transition duration-300 group-hover:opacity-20"
                ></div>
                <CustomDropdown
                  v-model="globalDateFilter.preset"
                  icon="fa-calendar-alt"
                  icon-color="text-blue-500"
                  :options="timeRangeDropdownOptions"
                  placeholder="选择时间范围"
                  @change="handleTimeRangeChange"
                />
              </div>

              <!-- 自定义日期范围选择器 - 在选择自定义时显示 -->
              <div v-if="globalDateFilter.type === 'custom'" class="flex items-center">
                <el-date-picker
                  class="api-key-date-picker custom-date-range-picker"
                  :clearable="true"
                  :default-time="defaultTime"
                  :disabled-date="disabledDate"
                  end-placeholder="结束日期"
                  format="YYYY-MM-DD HH:mm:ss"
                  :model-value="globalDateFilter.customRange"
                  range-separator="至"
                  size="small"
                  start-placeholder="开始日期"
                  style="width: 320px; height: 38px"
                  type="datetimerange"
                  :unlink-panels="false"
                  value-format="YYYY-MM-DD HH:mm:ss"
                  @update:model-value="onGlobalCustomDateRangeChange"
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

              <!-- 搜索模式与搜索框 -->
              <div class="flex min-w-[240px] flex-col gap-2 sm:flex-row sm:items-center">
                <div class="sm:w-44">
                  <CustomDropdown
                    v-model="searchMode"
                    icon="fa-filter"
                    icon-color="text-cyan-500"
                    :options="searchModeOptions"
                    placeholder="选择搜索类型"
                    @change="currentPage = 1"
                  />
                </div>
                <div class="group relative flex-1">
                  <div
                    class="pointer-events-none absolute -inset-0.5 rounded-lg bg-gradient-to-r from-cyan-500 to-teal-500 opacity-0 blur transition duration-300 group-hover:opacity-20"
                  ></div>
                  <div class="relative flex items-center">
                    <input
                      v-model="searchKeyword"
                      class="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 pl-9 text-sm text-gray-700 placeholder-gray-400 shadow-sm transition-all duration-200 hover:border-gray-300 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:placeholder-gray-500 dark:hover:border-gray-500"
                      :placeholder="
                        searchMode === 'bindingAccount'
                          ? '搜索所属账号...'
                          : isLdapEnabled
                            ? '搜索名称或所有者...'
                            : '搜索名称...'
                      "
                      type="text"
                      @input="currentPage = 1"
                    />
                    <i class="fas fa-search absolute left-3 text-sm text-cyan-500" />
                    <button
                      v-if="searchKeyword"
                      class="absolute right-2 flex h-5 w-5 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                      @click="clearSearch"
                    >
                      <i class="fas fa-times text-xs" />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <!-- 右侧：操作按钮组 -->
            <div class="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
              <!-- 刷新按钮 -->
              <button
                class="group relative flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-all duration-200 hover:border-gray-300 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:border-gray-500 sm:w-auto"
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

              <!-- 选择/取消选择按钮 -->
              <button
                class="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-all duration-200 hover:border-gray-300 hover:bg-gray-50 hover:shadow-md dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                @click="toggleSelectionMode"
              >
                <i :class="showCheckboxes ? 'fas fa-times' : 'fas fa-check-square'"></i>
                <span>{{ showCheckboxes ? '取消选择' : '选择' }}</span>
              </button>

              <!-- 导出数据按钮 -->
              <button
                class="group relative flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-all duration-200 hover:border-gray-300 hover:shadow-md dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:border-gray-500 sm:w-auto"
                @click="exportToExcel"
              >
                <div
                  class="absolute -inset-0.5 rounded-lg bg-gradient-to-r from-emerald-500 to-green-500 opacity-0 blur transition duration-300 group-hover:opacity-20"
                ></div>
                <i class="fas fa-file-excel relative text-emerald-500" />
                <span class="relative">导出数据</span>
              </button>

              <!-- 批量编辑按钮 - 移到刷新按钮旁边 -->
              <button
                v-if="selectedApiKeys.length > 0"
                class="group relative flex items-center justify-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 shadow-sm transition-all duration-200 hover:border-blue-300 hover:bg-blue-100 hover:shadow-md dark:border-blue-700 dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/50 sm:w-auto"
                @click="openBatchEditModal()"
              >
                <div
                  class="absolute -inset-0.5 rounded-lg bg-gradient-to-r from-blue-500 to-indigo-500 opacity-0 blur transition duration-300 group-hover:opacity-20"
                ></div>
                <i class="fas fa-edit relative text-blue-600 dark:text-blue-400" />
                <span class="relative">编辑选中 ({{ selectedApiKeys.length }})</span>
              </button>

              <!-- 批量删除按钮 - 移到刷新按钮旁边 -->
              <button
                v-if="selectedApiKeys.length > 0"
                class="group relative flex items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 shadow-sm transition-all duration-200 hover:border-red-300 hover:bg-red-100 hover:shadow-md dark:border-red-700 dark:bg-red-900/30 dark:text-red-300 dark:hover:bg-red-900/50 sm:w-auto"
                @click="batchDeleteApiKeys()"
              >
                <div
                  class="absolute -inset-0.5 rounded-lg bg-gradient-to-r from-red-500 to-pink-500 opacity-0 blur transition duration-300 group-hover:opacity-20"
                ></div>
                <i class="fas fa-trash relative text-red-600 dark:text-red-400" />
                <span class="relative">删除选中 ({{ selectedApiKeys.length }})</span>
              </button>

              <!-- 创建按钮 -->
              <button
                class="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-blue-500 to-blue-600 px-5 py-2 text-sm font-medium text-white shadow-md transition-all duration-200 hover:from-blue-600 hover:to-blue-700 hover:shadow-lg sm:w-auto"
                @click.stop="openCreateApiKeyModal"
              >
                <i class="fas fa-plus"></i>
                <span>创建新 Key</span>
              </button>
            </div>
          </div>

          <div v-if="apiKeysLoading" class="py-12 text-center">
            <div class="loading-spinner mx-auto mb-4" />
            <p class="text-gray-500 dark:text-gray-400">正在加载 API Keys...</p>
          </div>

          <div v-else-if="apiKeys.length === 0" class="py-12 text-center">
            <div
              class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700"
            >
              <i class="fas fa-key text-xl text-gray-400" />
            </div>
            <p class="text-lg text-gray-500 dark:text-gray-400">暂无 API Keys</p>
            <p class="mt-2 text-sm text-gray-400">点击上方按钮创建您的第一个 API Key</p>
          </div>

          <!-- 桌面端表格视图 -->
          <div v-else class="table-wrapper hidden md:block">
            <div class="table-container">
              <table class="w-full table-fixed">
                <thead
                  class="sticky top-0 z-10 bg-gradient-to-b from-gray-50 to-gray-100/90 backdrop-blur-sm dark:from-gray-700 dark:to-gray-800/90"
                >
                  <tr>
                    <th v-if="shouldShowCheckboxes" class="w-[50px] px-3 py-4 text-left">
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
                      class="w-[14%] min-w-[120px] cursor-pointer px-3 py-4 text-left text-xs font-bold uppercase tracking-wider text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-600"
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
                      class="w-[15%] min-w-[120px] px-3 py-4 text-left text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300"
                    >
                      所属账号
                    </th>
                    <th
                      class="w-[10%] min-w-[80px] px-3 py-4 text-left text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300"
                    >
                      标签
                    </th>
                    <th
                      class="w-[6%] min-w-[60px] cursor-pointer px-3 py-4 text-left text-xs font-bold uppercase tracking-wider text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-600"
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
                      class="w-[4%] min-w-[40px] cursor-pointer px-3 py-4 text-right text-xs font-bold uppercase tracking-wider text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-600"
                      @click="sortApiKeys('periodCost')"
                    >
                      费用
                      <i
                        v-if="apiKeysSortBy === 'periodCost'"
                        :class="[
                          'fas',
                          apiKeysSortOrder === 'asc' ? 'fa-sort-up' : 'fa-sort-down',
                          'ml-1'
                        ]"
                      />
                      <i v-else class="fas fa-sort ml-1 text-gray-400" />
                    </th>
                    <th
                      class="w-[14%] min-w-[120px] px-3 py-4 text-left text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300"
                    >
                      限制
                    </th>
                    <th
                      class="w-[5%] min-w-[45px] cursor-pointer px-3 py-4 text-right text-xs font-bold uppercase tracking-wider text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-600"
                      @click="sortApiKeys('periodTokens')"
                    >
                      Token
                      <i
                        v-if="apiKeysSortBy === 'periodTokens'"
                        :class="[
                          'fas',
                          apiKeysSortOrder === 'asc' ? 'fa-sort-up' : 'fa-sort-down',
                          'ml-1'
                        ]"
                      />
                      <i v-else class="fas fa-sort ml-1 text-gray-400" />
                    </th>
                    <th
                      class="w-[5%] min-w-[45px] cursor-pointer px-3 py-4 text-right text-xs font-bold uppercase tracking-wider text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-600"
                      @click="sortApiKeys('periodRequests')"
                    >
                      请求数
                      <i
                        v-if="apiKeysSortBy === 'periodRequests'"
                        :class="[
                          'fas',
                          apiKeysSortOrder === 'asc' ? 'fa-sort-up' : 'fa-sort-down',
                          'ml-1'
                        ]"
                      />
                      <i v-else class="fas fa-sort ml-1 text-gray-400" />
                    </th>
                    <th
                      class="w-[8%] min-w-[70px] cursor-pointer px-3 py-4 text-left text-xs font-bold uppercase tracking-wider text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-600"
                      @click="sortApiKeys('lastUsedAt')"
                    >
                      最后使用
                      <i
                        v-if="apiKeysSortBy === 'lastUsedAt'"
                        :class="[
                          'fas',
                          apiKeysSortOrder === 'asc' ? 'fa-sort-up' : 'fa-sort-down',
                          'ml-1'
                        ]"
                      />
                      <i v-else class="fas fa-sort ml-1 text-gray-400" />
                    </th>
                    <th
                      class="w-[8%] min-w-[70px] cursor-pointer px-3 py-4 text-left text-xs font-bold uppercase tracking-wider text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-600"
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
                      class="w-[8%] min-w-[70px] cursor-pointer px-3 py-4 text-left text-xs font-bold uppercase tracking-wider text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-600"
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
                      class="operations-column sticky right-0 w-[23%] min-w-[200px] px-3 py-4 text-left text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300"
                    >
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <template v-for="(key, index) in paginatedApiKeys" :key="key.id">
                    <!-- API Key 主行 - 添加斑马条纹和增强分隔 -->
                    <tr
                      :class="[
                        'table-row transition-all duration-150',
                        index % 2 === 0
                          ? 'bg-white dark:bg-gray-800/40'
                          : 'bg-gray-50/70 dark:bg-gray-700/30',
                        'border-b-2 border-gray-200/80 dark:border-gray-700/50',
                        'hover:bg-blue-50/60 hover:shadow-sm dark:hover:bg-blue-900/20'
                      ]"
                    >
                      <td v-if="shouldShowCheckboxes" class="px-3 py-3">
                        <div class="flex items-center">
                          <input
                            v-model="selectedApiKeys"
                            class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            type="checkbox"
                            :value="key.id"
                            @change="updateSelectAllState"
                          />
                        </div>
                      </td>
                      <td class="px-3 py-3">
                        <div class="min-w-0">
                          <!-- 名称 -->
                          <div
                            class="truncate text-sm font-semibold text-gray-900 dark:text-gray-100"
                            :title="key.name"
                          >
                            {{ key.name }}
                          </div>
                          <!-- 显示所有者信息 -->
                          <div
                            v-if="isLdapEnabled && key.ownerDisplayName"
                            class="mt-1 text-xs text-red-600"
                          >
                            <i class="fas fa-user mr-1" />
                            {{ key.ownerDisplayName }}
                          </div>
                        </div>
                      </td>
                      <!-- 所属账号列 -->
                      <td class="px-3 py-3">
                        <div class="space-y-1">
                          <!-- Claude 绑定 -->
                          <div
                            v-if="key.claudeAccountId || key.claudeConsoleAccountId"
                            class="flex items-center gap-1 text-xs"
                          >
                            <span
                              class="inline-flex items-center rounded bg-indigo-100 px-1.5 py-0.5 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300"
                            >
                              <i class="fas fa-brain mr-1 text-[10px]" />
                              Claude
                            </span>
                            <span class="truncate text-gray-600 dark:text-gray-400">
                              {{ getClaudeBindingInfo(key) }}
                            </span>
                          </div>
                          <!-- Gemini 绑定 -->
                          <div v-if="key.geminiAccountId" class="flex items-center gap-1 text-xs">
                            <span
                              class="inline-flex items-center rounded bg-yellow-100 px-1.5 py-0.5 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300"
                            >
                              <i class="fas fa-robot mr-1 text-[10px]" />
                              Gemini
                            </span>
                            <span class="truncate text-gray-600 dark:text-gray-400">
                              {{ getGeminiBindingInfo(key) }}
                            </span>
                          </div>
                          <!-- OpenAI 绑定 -->
                          <div v-if="key.openaiAccountId" class="flex items-center gap-1 text-xs">
                            <span
                              class="inline-flex items-center rounded bg-gray-100 px-1.5 py-0.5 text-gray-700 dark:bg-gray-700 dark:text-gray-300"
                            >
                              <i class="fa-openai mr-1 text-[10px]" />
                              OpenAI
                            </span>
                            <span class="truncate text-gray-600 dark:text-gray-400">
                              {{ getOpenAIBindingInfo(key) }}
                            </span>
                          </div>
                          <!-- Bedrock 绑定 -->
                          <div v-if="key.bedrockAccountId" class="flex items-center gap-1 text-xs">
                            <span
                              class="inline-flex items-center rounded bg-orange-100 px-1.5 py-0.5 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300"
                            >
                              <i class="fas fa-cloud mr-1 text-[10px]" />
                              Bedrock
                            </span>
                            <span class="truncate text-gray-600 dark:text-gray-400">
                              {{ getBedrockBindingInfo(key) }}
                            </span>
                          </div>
                          <!-- Droid 绑定 -->
                          <div v-if="key.droidAccountId" class="flex items-center gap-1 text-xs">
                            <span
                              class="inline-flex items-center rounded bg-cyan-100 px-1.5 py-0.5 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300"
                            >
                              <i class="fas fa-robot mr-1 text-[10px]" />
                              Droid
                            </span>
                            <span class="truncate text-gray-600 dark:text-gray-400">
                              {{ getDroidBindingInfo(key) }}
                            </span>
                          </div>
                          <!-- 共享池 -->
                          <div
                            v-if="
                              !key.claudeAccountId &&
                              !key.claudeConsoleAccountId &&
                              !key.geminiAccountId &&
                              !key.openaiAccountId &&
                              !key.bedrockAccountId &&
                              !key.droidAccountId
                            "
                            class="text-xs text-gray-500 dark:text-gray-400"
                          >
                            <i class="fas fa-share-alt mr-1" />
                            共享池
                          </div>
                        </div>
                      </td>
                      <!-- 标签列 -->
                      <td class="px-3 py-3">
                        <div class="flex flex-wrap gap-1">
                          <span
                            v-for="tag in key.tags || []"
                            :key="tag"
                            class="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
                          >
                            {{ tag }}
                          </span>
                          <span
                            v-if="!key.tags || key.tags.length === 0"
                            class="text-xs text-gray-400"
                            >无标签</span
                          >
                        </div>
                      </td>
                      <td class="whitespace-nowrap px-3 py-3">
                        <span
                          :class="[
                            'inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold',
                            key.isActive
                              ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                              : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
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
                      <!-- 费用 -->
                      <td class="whitespace-nowrap px-3 py-3 text-right" style="font-size: 13px">
                        <span
                          class="font-semibold text-blue-600 dark:text-blue-400"
                          style="font-size: 14px"
                        >
                          ${{ getPeriodCost(key).toFixed(2) }}
                        </span>
                      </td>
                      <!-- 限制 -->
                      <td class="px-2 py-2" style="font-size: 12px">
                        <div class="flex flex-col gap-2">
                          <!-- 每日费用限制进度条 -->
                          <LimitProgressBar
                            v-if="key.dailyCostLimit > 0"
                            :current="key.dailyCost || 0"
                            label="每日限制"
                            :limit="key.dailyCostLimit"
                            type="daily"
                            variant="compact"
                          />

                          <!-- 总费用限制进度条（无每日限制时展示） -->
                          <LimitProgressBar
                            v-else-if="key.totalCostLimit > 0"
                            :current="key.usage?.total?.cost || 0"
                            label="总费用限制"
                            :limit="key.totalCostLimit"
                            type="total"
                            variant="compact"
                          />

                          <!-- 时间窗口费用限制（无每日和总费用限制时展示） -->
                          <div
                            v-else-if="
                              key.rateLimitWindow > 0 &&
                              key.rateLimitCost > 0 &&
                              (!key.dailyCostLimit || key.dailyCostLimit === 0) &&
                              (!key.totalCostLimit || key.totalCostLimit === 0)
                            "
                            class="space-y-1.5"
                          >
                            <!-- 费用进度条 -->
                            <LimitProgressBar
                              :current="key.currentWindowCost || 0"
                              label="窗口费用"
                              :limit="key.rateLimitCost"
                              type="window"
                              variant="compact"
                            />
                            <!-- 重置倒计时 -->
                            <div class="flex items-center justify-between text-[10px]">
                              <div class="flex items-center gap-1 text-sky-600 dark:text-sky-300">
                                <i class="fas fa-clock text-[10px]" />
                                <span class="font-medium">{{ key.rateLimitWindow }}分钟窗口</span>
                              </div>
                              <span
                                class="font-bold"
                                :class="
                                  key.windowRemainingSeconds > 0
                                    ? 'text-sky-700 dark:text-sky-300'
                                    : 'text-gray-400 dark:text-gray-500'
                                "
                              >
                                {{
                                  key.windowRemainingSeconds > 0
                                    ? formatWindowTime(key.windowRemainingSeconds)
                                    : '未激活'
                                }}
                              </span>
                            </div>
                          </div>

                          <!-- 如果没有任何限制 -->
                          <div
                            v-else
                            class="flex items-center justify-center gap-1.5 py-2 text-gray-500 dark:text-gray-400"
                          >
                            <i class="fas fa-infinity text-base" />
                            <span class="text-xs font-medium">无限制</span>
                          </div>
                        </div>
                      </td>
                      <!-- Token数量 -->
                      <td class="whitespace-nowrap px-3 py-3 text-right" style="font-size: 13px">
                        <div class="flex items-center justify-end gap-1">
                          <span
                            class="font-medium text-purple-600 dark:text-purple-400"
                            style="font-size: 13px"
                          >
                            {{ formatTokenCount(getPeriodTokens(key)) }}
                          </span>
                        </div>
                      </td>
                      <!-- 请求数 -->
                      <td class="whitespace-nowrap px-3 py-3 text-right" style="font-size: 13px">
                        <div class="flex items-center justify-end gap-1">
                          <span
                            class="font-medium text-gray-900 dark:text-gray-100"
                            style="font-size: 13px"
                          >
                            {{ formatNumber(getPeriodRequests(key)) }}
                          </span>
                          <span class="text-xs text-gray-500">次</span>
                        </div>
                      </td>
                      <!-- 最后使用 -->
                      <td
                        class="whitespace-nowrap px-3 py-3 text-gray-700 dark:text-gray-300"
                        style="font-size: 13px"
                      >
                        <div class="flex flex-col leading-tight">
                          <span
                            v-if="key.lastUsedAt"
                            class="cursor-help"
                            style="font-size: 13px"
                            :title="new Date(key.lastUsedAt).toLocaleString('zh-CN')"
                          >
                            {{ formatLastUsed(key.lastUsedAt) }}
                          </span>
                          <span v-else class="text-gray-400" style="font-size: 13px">从未使用</span>
                          <span
                            v-if="hasLastUsageAccount(key)"
                            class="mt-1 text-xs text-gray-500 dark:text-gray-400"
                            :title="getLastUsageFullName(key)"
                          >
                            {{ getLastUsageDisplayName(key) }}
                            <span
                              v-if="!isLastUsageDeleted(key)"
                              class="ml-1 text-gray-400 dark:text-gray-500"
                            >
                              ({{ getLastUsageTypeLabel(key) }})
                            </span>
                          </span>
                          <span v-else class="mt-1 text-xs text-gray-400 dark:text-gray-500">
                            暂无使用账号
                          </span>
                        </div>
                      </td>
                      <!-- 创建时间 -->
                      <td
                        class="whitespace-nowrap px-3 py-3 text-gray-700 dark:text-gray-300"
                        style="font-size: 13px"
                      >
                        {{ new Date(key.createdAt).toLocaleDateString() }}
                      </td>
                      <td
                        class="whitespace-nowrap px-3 py-3 text-sm text-gray-700 dark:text-gray-300"
                      >
                        <div class="inline-flex items-center gap-1.5">
                          <!-- 未激活状态 -->
                          <span
                            v-if="key.expirationMode === 'activation' && !key.isActivated"
                            class="inline-flex items-center text-blue-600 dark:text-blue-400"
                            style="font-size: 13px"
                          >
                            <i class="fas fa-pause-circle mr-1 text-xs" />
                            未激活 (
                            {{ key.activationDays || (key.activationUnit === 'hours' ? 24 : 30)
                            }}{{ key.activationUnit === 'hours' ? '小时' : '天' }})
                          </span>
                          <!-- 已设置过期时间 -->
                          <span v-else-if="key.expiresAt">
                            <span
                              v-if="isApiKeyExpired(key.expiresAt)"
                              class="inline-flex cursor-pointer items-center text-red-600 hover:underline"
                              style="font-size: 13px"
                              @click.stop="startEditExpiry(key)"
                            >
                              <i class="fas fa-exclamation-circle mr-1 text-xs" />
                              已过期
                            </span>
                            <span
                              v-else-if="isApiKeyExpiringSoon(key.expiresAt)"
                              class="inline-flex cursor-pointer items-center text-orange-600 hover:underline"
                              style="font-size: 13px"
                              @click.stop="startEditExpiry(key)"
                            >
                              <i class="fas fa-clock mr-1 text-xs" />
                              {{ formatExpireDate(key.expiresAt) }}
                            </span>
                            <span
                              v-else
                              class="cursor-pointer text-gray-600 hover:underline dark:text-gray-400"
                              style="font-size: 13px"
                              @click.stop="startEditExpiry(key)"
                            >
                              {{ formatExpireDate(key.expiresAt) }}
                            </span>
                          </span>
                          <!-- 永不过期 -->
                          <span
                            v-else
                            class="inline-flex cursor-pointer items-center text-gray-400 hover:underline dark:text-gray-500"
                            style="font-size: 13px"
                            @click.stop="startEditExpiry(key)"
                          >
                            <i class="fas fa-infinity mr-1 text-xs" />
                            永不过期
                          </span>
                        </div>
                      </td>
                      <td
                        class="operations-column operations-cell whitespace-nowrap px-3 py-3"
                        style="font-size: 13px"
                      >
                        <div class="flex gap-1">
                          <button
                            class="rounded px-2 py-1 text-xs font-medium text-purple-600 transition-colors hover:bg-purple-50 hover:text-purple-900 dark:hover:bg-purple-900/20"
                            title="查看详细统计"
                            @click="showUsageDetails(key)"
                          >
                            <i class="fas fa-chart-line" />
                            <span class="ml-1 hidden xl:inline">详情</span>
                          </button>
                          <button
                            v-if="key && key.id"
                            class="rounded px-2 py-1 text-xs font-medium text-indigo-600 transition-colors hover:bg-indigo-50 hover:text-indigo-900 dark:hover:bg-indigo-900/20"
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
                            class="rounded px-2 py-1 text-xs font-medium text-blue-600 transition-colors hover:bg-blue-50 hover:text-blue-900 dark:hover:bg-blue-900/20"
                            title="编辑"
                            @click="openEditApiKeyModal(key)"
                          >
                            <i class="fas fa-edit" />
                            <span class="ml-1 hidden xl:inline">编辑</span>
                          </button>
                          <button
                            v-if="
                              key.expiresAt &&
                              (isApiKeyExpired(key.expiresAt) ||
                                isApiKeyExpiringSoon(key.expiresAt))
                            "
                            class="rounded px-2 py-1 text-xs font-medium text-green-600 transition-colors hover:bg-green-50 hover:text-green-900 dark:hover:bg-green-900/20"
                            title="续期"
                            @click="openRenewApiKeyModal(key)"
                          >
                            <i class="fas fa-clock" />
                            <span class="ml-1 hidden xl:inline">续期</span>
                          </button>
                          <button
                            :class="[
                              key.isActive
                                ? 'text-orange-600 hover:bg-orange-50 hover:text-orange-900 dark:hover:bg-orange-900/20'
                                : 'text-green-600 hover:bg-green-50 hover:text-green-900 dark:hover:bg-green-900/20',
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
                            class="rounded px-2 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 hover:text-red-900 dark:hover:bg-red-900/20"
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
                      <td class="bg-gray-50 px-3 py-3 dark:bg-gray-700" colspan="13">
                        <div v-if="!apiKeyModelStats[key.id]" class="py-4 text-center">
                          <div class="loading-spinner mx-auto" />
                          <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">
                            加载模型统计...
                          </p>
                        </div>
                        <div class="space-y-4">
                          <!-- 通用的标题和时间筛选器，无论是否有数据都显示 -->
                          <div class="mb-4 flex items-center justify-between">
                            <h5
                              class="flex items-center text-sm font-semibold text-gray-700 dark:text-gray-300"
                            >
                              <i class="fas fa-chart-pie mr-2 text-indigo-500" />
                              模型使用分布
                            </h5>
                            <div class="flex items-center gap-2">
                              <span
                                v-if="
                                  apiKeyModelStats[key.id] && apiKeyModelStats[key.id].length > 0
                                "
                                class="rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-500 dark:bg-gray-700 dark:text-gray-400"
                              >
                                {{ apiKeyModelStats[key.id].length }} 个模型
                              </span>

                              <!-- API Keys日期筛选器 -->
                              <div class="flex items-center gap-1">
                                <!-- 快捷日期选择 -->
                                <div class="flex gap-1 rounded bg-gray-100 p-1 dark:bg-gray-700">
                                  <button
                                    v-for="option in getApiKeyDateFilter(key.id).presetOptions"
                                    :key="option.value"
                                    :class="[
                                      'rounded px-2 py-1 text-xs font-medium transition-colors',
                                      getApiKeyDateFilter(key.id).preset === option.value &&
                                      getApiKeyDateFilter(key.id).type === 'preset'
                                        ? 'bg-white text-blue-600 shadow-sm dark:bg-gray-800'
                                        : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200'
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
                              <p class="text-sm text-gray-500 dark:text-gray-400">
                                暂无模型使用数据
                              </p>
                              <button
                                class="ml-2 flex items-center gap-1 text-sm text-blue-500 transition-colors hover:text-blue-700"
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
                            v-else-if="
                              apiKeyModelStats[key.id] && apiKeyModelStats[key.id].length > 0
                            "
                            class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3"
                          >
                            <div
                              v-for="stat in apiKeyModelStats[key.id]"
                              :key="stat.model"
                              class="rounded-xl border border-gray-200 bg-gradient-to-br from-white to-gray-50 p-4 transition-all duration-200 hover:border-indigo-300 hover:shadow-lg dark:border-gray-600 dark:from-gray-800 dark:to-gray-700 dark:hover:border-indigo-500"
                            >
                              <div class="mb-3 flex items-start justify-between">
                                <div class="flex-1">
                                  <span
                                    class="mb-1 block text-sm font-semibold text-gray-800 dark:text-gray-200"
                                    >{{ stat.model }}</span
                                  >
                                  <span
                                    class="rounded-full bg-blue-50 px-2 py-1 text-xs text-gray-500 dark:bg-blue-900/30 dark:text-gray-400"
                                    >{{ stat.requests }} 次请求</span
                                  >
                                </div>
                              </div>

                              <div class="mb-3 space-y-2">
                                <div class="flex items-center justify-between text-sm">
                                  <span class="flex items-center text-gray-600 dark:text-gray-400">
                                    <i class="fas fa-coins mr-1 text-xs text-yellow-500" />
                                    总Token:
                                  </span>
                                  <span class="font-semibold text-gray-900 dark:text-gray-100">{{
                                    formatTokenCount(stat.allTokens)
                                  }}</span>
                                </div>
                                <div class="flex items-center justify-between text-sm">
                                  <span class="flex items-center text-gray-600 dark:text-gray-400">
                                    <i class="fas fa-dollar-sign mr-1 text-xs text-green-500" />
                                    费用:
                                  </span>
                                  <span class="font-semibold text-green-600">{{
                                    calculateModelCost(stat)
                                  }}</span>
                                </div>
                                <div
                                  class="mt-2 border-t border-gray-100 pt-2 dark:border-gray-600"
                                >
                                  <div
                                    class="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400"
                                  >
                                    <span class="flex items-center">
                                      <i class="fas fa-arrow-down mr-1 text-green-500" />
                                      输入:
                                    </span>
                                    <span class="font-medium">{{
                                      formatTokenCount(stat.inputTokens)
                                    }}</span>
                                  </div>
                                  <div
                                    class="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400"
                                  >
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
                              <div
                                class="mt-3 h-2 w-full rounded-full bg-gray-200 dark:bg-gray-700"
                              >
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
                            class="mt-4 rounded-lg border border-indigo-100 bg-gradient-to-r from-indigo-50 to-purple-50 p-3 dark:border-indigo-700 dark:from-indigo-900/20 dark:to-purple-900/20"
                          >
                            <div class="flex items-center justify-between text-sm">
                              <span
                                class="flex items-center font-semibold text-gray-700 dark:text-gray-300"
                              >
                                <i class="fas fa-calculator mr-2 text-indigo-500" />
                                总计统计
                              </span>
                              <div class="flex gap-4 text-xs">
                                <span class="text-gray-600 dark:text-gray-400">
                                  总请求:
                                  <span class="font-semibold text-gray-800 dark:text-gray-200">{{
                                    apiKeyModelStats[key.id].reduce(
                                      (sum, stat) => sum + stat.requests,
                                      0
                                    )
                                  }}</span>
                                </span>
                                <span class="text-gray-600 dark:text-gray-400">
                                  总Token:
                                  <span class="font-semibold text-gray-800 dark:text-gray-200">{{
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
                    v-if="shouldShowCheckboxes"
                    v-model="selectedApiKeys"
                    class="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    type="checkbox"
                    :value="key.id"
                    @change="updateSelectAllState"
                  />
                  <div>
                    <h4 class="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {{ key.name }}
                    </h4>
                    <p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                      {{ key.id }}
                    </p>
                  </div>
                </div>
                <span
                  :class="[
                    'inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold',
                    key.isActive
                      ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                      : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
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
                    class="inline-flex items-center rounded bg-indigo-100 px-2 py-0.5 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300"
                  >
                    <i class="fas fa-brain mr-1" />
                    Claude
                  </span>
                  <span class="text-gray-600 dark:text-gray-400">
                    {{ getClaudeBindingInfo(key) }}
                  </span>
                </div>
                <!-- Gemini 绑定 -->
                <div v-if="key.geminiAccountId" class="flex flex-wrap items-center gap-1 text-xs">
                  <span
                    class="inline-flex items-center rounded bg-yellow-100 px-2 py-0.5 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300"
                  >
                    <i class="fas fa-robot mr-1" />
                    Gemini
                  </span>
                  <span class="text-gray-600 dark:text-gray-400">
                    {{ getGeminiBindingInfo(key) }}
                  </span>
                </div>
                <!-- OpenAI 绑定 -->
                <div v-if="key.openaiAccountId" class="flex flex-wrap items-center gap-1 text-xs">
                  <span
                    class="inline-flex items-center rounded bg-gray-100 px-2 py-0.5 text-gray-700 dark:bg-gray-700 dark:text-gray-300"
                  >
                    <i class="fa-openai mr-1" />
                    OpenAI
                  </span>
                  <span class="text-gray-600 dark:text-gray-400">
                    {{ getOpenAIBindingInfo(key) }}
                  </span>
                </div>
                <!-- Bedrock 绑定 -->
                <div v-if="key.bedrockAccountId" class="flex flex-wrap items-center gap-1 text-xs">
                  <span
                    class="inline-flex items-center rounded bg-orange-100 px-2 py-0.5 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300"
                  >
                    <i class="fas fa-cloud mr-1" />
                    Bedrock
                  </span>
                  <span class="text-gray-600 dark:text-gray-400">
                    {{ getBedrockBindingInfo(key) }}
                  </span>
                </div>
                <!-- Droid 绑定 -->
                <div v-if="key.droidAccountId" class="flex flex-wrap items-center gap-1 text-xs">
                  <span
                    class="inline-flex items-center rounded bg-cyan-100 px-2 py-0.5 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300"
                  >
                    <i class="fas fa-robot mr-1" />
                    Droid
                  </span>
                  <span class="text-gray-600 dark:text-gray-400">
                    {{ getDroidBindingInfo(key) }}
                  </span>
                </div>
                <!-- 无绑定时显示共享池 -->
                <div
                  v-if="
                    !key.claudeAccountId &&
                    !key.claudeConsoleAccountId &&
                    !key.geminiAccountId &&
                    !key.openaiAccountId &&
                    !key.bedrockAccountId &&
                    !key.droidAccountId
                  "
                  class="text-xs text-gray-500 dark:text-gray-400"
                >
                  <i class="fas fa-share-alt mr-1" />
                  使用共享池
                </div>
                <!-- 显示所有者信息 -->
                <div v-if="isLdapEnabled && key.ownerDisplayName" class="text-xs text-red-600">
                  <i class="fas fa-user mr-1" />
                  {{ key.ownerDisplayName }}
                </div>
              </div>

              <!-- 统计信息 -->
              <div class="mb-3 space-y-2">
                <!-- 今日使用 -->
                <div class="rounded-lg bg-gray-50 p-3 dark:bg-gray-700">
                  <div class="mb-2 flex items-center justify-between">
                    <span class="text-xs text-gray-600 dark:text-gray-400">{{
                      globalDateFilter.type === 'custom' ? '累计统计' : '今日使用'
                    }}</span>
                    <button
                      class="text-xs text-blue-600 hover:text-blue-800"
                      @click="showUsageDetails(key)"
                    >
                      <i class="fas fa-chart-line mr-1" />详情
                    </button>
                  </div>
                  <div class="grid grid-cols-2 gap-3">
                    <div>
                      <p class="text-sm font-semibold text-gray-900 dark:text-gray-100">
                        {{ formatNumber(key.usage?.daily?.requests || 0) }} 次
                      </p>
                      <p class="text-xs text-gray-500 dark:text-gray-400">请求</p>
                    </div>
                    <div>
                      <p class="text-sm font-semibold text-green-600">
                        ${{ (key.dailyCost || 0).toFixed(2) }}
                      </p>
                      <p class="text-xs text-gray-500 dark:text-gray-400">费用</p>
                    </div>
                  </div>
                  <div class="mt-2 text-xs text-gray-600 dark:text-gray-400">
                    <div class="flex items-center justify-between">
                      <span>最后使用</span>
                      <span class="font-medium text-gray-700 dark:text-gray-300">
                        {{ key.lastUsedAt ? formatLastUsed(key.lastUsedAt) : '从未使用' }}
                      </span>
                    </div>
                    <div class="mt-1 flex items-center justify-between">
                      <span>账号</span>
                      <span
                        v-if="hasLastUsageAccount(key)"
                        class="truncate text-gray-500 dark:text-gray-400"
                        style="max-width: 180px"
                        :title="getLastUsageFullName(key)"
                      >
                        {{ getLastUsageDisplayName(key) }}
                        <span
                          v-if="!isLastUsageDeleted(key)"
                          class="ml-1 text-gray-400 dark:text-gray-500"
                        >
                          ({{ getLastUsageTypeLabel(key) }})
                        </span>
                      </span>
                      <span v-else class="text-gray-400 dark:text-gray-500">暂无使用账号</span>
                    </div>
                  </div>
                </div>

                <!-- 限制进度条 -->
                <div class="space-y-2">
                  <!-- 每日费用限制 -->
                  <LimitProgressBar
                    v-if="key.dailyCostLimit > 0"
                    :current="key.dailyCost || 0"
                    label="每日限制"
                    :limit="key.dailyCostLimit"
                    type="daily"
                    variant="compact"
                  />

                  <!-- 总费用限制（无每日限制时展示） -->
                  <LimitProgressBar
                    v-else-if="key.totalCostLimit > 0"
                    :current="key.usage?.total?.cost || 0"
                    label="总费用限制"
                    :limit="key.totalCostLimit"
                    type="total"
                    variant="compact"
                  />

                  <!-- 时间窗口费用限制（无每日和总费用限制时展示） -->
                  <div
                    v-else-if="
                      key.rateLimitWindow > 0 &&
                      key.rateLimitCost > 0 &&
                      (!key.dailyCostLimit || key.dailyCostLimit === 0) &&
                      (!key.totalCostLimit || key.totalCostLimit === 0)
                    "
                    class="space-y-2"
                  >
                    <!-- 费用进度条 -->
                    <LimitProgressBar
                      :current="key.currentWindowCost || 0"
                      label="窗口费用"
                      :limit="key.rateLimitCost"
                      type="window"
                      variant="compact"
                    />
                    <!-- 重置倒计时 -->
                    <div class="flex items-center justify-between text-xs">
                      <div class="flex items-center gap-1.5 text-sky-600 dark:text-sky-300">
                        <i class="fas fa-clock text-xs" />
                        <span class="font-medium">{{ key.rateLimitWindow }}分钟窗口</span>
                      </div>
                      <span
                        class="font-bold"
                        :class="
                          key.windowRemainingSeconds > 0
                            ? 'text-sky-700 dark:text-sky-300'
                            : 'text-gray-400 dark:text-gray-500'
                        "
                      >
                        {{
                          key.windowRemainingSeconds > 0
                            ? formatWindowTime(key.windowRemainingSeconds)
                            : '未激活'
                        }}
                      </span>
                    </div>
                  </div>

                  <!-- 无限制显示 -->
                  <div
                    v-else
                    class="flex items-center justify-center gap-1.5 py-2 text-gray-500 dark:text-gray-400"
                  >
                    <i class="fas fa-infinity text-base" />
                    <span class="text-xs font-medium">无限制</span>
                  </div>
                </div>
              </div>

              <!-- 时间信息 -->
              <div class="mb-3 text-xs text-gray-500 dark:text-gray-400">
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
                      class="inline-flex h-5 w-5 items-center justify-center rounded text-gray-300 transition-all duration-200 hover:bg-blue-50 hover:text-blue-500 dark:hover:bg-blue-900/20"
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
                  class="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
                >
                  {{ tag }}
                </span>
              </div>

              <!-- 操作按钮 -->
              <div class="mt-3 flex gap-2 border-t border-gray-100 pt-3 dark:border-gray-600">
                <button
                  class="flex flex-1 items-center justify-center gap-1 rounded-lg bg-blue-50 px-3 py-1.5 text-xs text-blue-600 transition-colors hover:bg-blue-100 dark:bg-blue-900/30 dark:hover:bg-blue-900/50"
                  @click="showUsageDetails(key)"
                >
                  <i class="fas fa-chart-line" />
                  查看详情
                </button>
                <button
                  class="flex-1 rounded-lg bg-gray-50 px-3 py-1.5 text-xs text-gray-600 transition-colors hover:bg-gray-100 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
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
                  class="flex-1 rounded-lg bg-orange-50 px-3 py-1.5 text-xs text-orange-600 transition-colors hover:bg-orange-100 dark:bg-orange-900/30 dark:hover:bg-orange-900/50"
                  @click="openRenewApiKeyModal(key)"
                >
                  <i class="fas fa-clock mr-1" />
                  续期
                </button>
                <button
                  :class="[
                    key.isActive
                      ? 'bg-orange-50 text-orange-600 hover:bg-orange-100 dark:bg-orange-900/30 dark:hover:bg-orange-900/50'
                      : 'bg-green-50 text-green-600 hover:bg-green-100 dark:bg-green-900/30 dark:hover:bg-green-900/50',
                    'rounded-lg px-3 py-1.5 text-xs transition-colors'
                  ]"
                  @click="toggleApiKeyStatus(key)"
                >
                  <i :class="['fas', key.isActive ? 'fa-ban' : 'fa-check-circle', 'mr-1']" />
                  {{ key.isActive ? '禁用' : '激活' }}
                </button>
                <button
                  class="rounded-lg bg-red-50 px-3 py-1.5 text-xs text-red-600 transition-colors hover:bg-red-100 dark:bg-red-900/30 dark:hover:bg-red-900/50"
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
              <span class="text-xs text-gray-600 dark:text-gray-400 sm:text-sm">
                共 {{ sortedApiKeys.length }} 条记录
              </span>
              <div class="flex items-center gap-2">
                <span class="text-xs text-gray-600 dark:text-gray-400 sm:text-sm">每页显示</span>
                <select
                  v-model="pageSize"
                  class="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 transition-colors hover:border-gray-300 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:border-gray-500 sm:text-sm"
                  @change="currentPage = 1"
                >
                  <option v-for="size in pageSizeOptions" :key="size" :value="size">
                    {{ size }}
                  </option>
                </select>
                <span class="text-xs text-gray-600 dark:text-gray-400 sm:text-sm">条</span>
              </div>
            </div>

            <div class="flex items-center gap-2">
              <!-- 上一页 -->
              <button
                class="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 sm:py-1 sm:text-sm"
                :disabled="currentPage === 1"
                @click="currentPage--"
              >
                <i class="fas fa-chevron-left" />
              </button>

              <!-- 页码 -->
              <div class="flex items-center gap-1">
                <!-- 第一页 -->
                <button
                  v-if="shouldShowFirstPage"
                  class="hidden rounded-md border border-gray-300 bg-white px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 sm:block"
                  @click="currentPage = 1"
                >
                  1
                </button>
                <span
                  v-if="showLeadingEllipsis"
                  class="hidden px-2 text-gray-500 dark:text-gray-400 sm:inline"
                  >...</span
                >

                <!-- 中间页码 -->
                <button
                  v-for="page in pageNumbers"
                  :key="page"
                  :class="[
                    'rounded-md px-2 py-1 text-xs font-medium sm:px-3 sm:text-sm',
                    page === currentPage
                      ? 'bg-blue-600 text-white'
                      : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
                  ]"
                  @click="currentPage = page"
                >
                  {{ page }}
                </button>

                <!-- 最后一页 -->
                <span
                  v-if="showTrailingEllipsis"
                  class="hidden px-2 text-gray-500 dark:text-gray-400 sm:inline"
                  >...</span
                >
                <button
                  v-if="shouldShowLastPage"
                  class="hidden rounded-md border border-gray-300 bg-white px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 sm:block"
                  @click="currentPage = totalPages"
                >
                  {{ totalPages }}
                </button>
              </div>

              <!-- 下一页 -->
              <button
                class="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 sm:py-1 sm:text-sm"
                :disabled="currentPage === totalPages || totalPages === 0"
                @click="currentPage++"
              >
                <i class="fas fa-chevron-right" />
              </button>
            </div>
          </div>
        </div>

        <!-- 已删除 API Keys Tab Panel -->
        <div v-else-if="activeTab === 'deleted'" class="tab-panel">
          <div v-if="deletedApiKeysLoading" class="py-12 text-center">
            <div class="loading-spinner mx-auto mb-4" />
            <p class="text-gray-500 dark:text-gray-400">正在加载已删除的 API Keys...</p>
          </div>

          <div v-else-if="deletedApiKeys.length === 0" class="py-12 text-center">
            <div
              class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700"
            >
              <i class="fas fa-trash text-xl text-gray-400" />
            </div>
            <p class="text-lg text-gray-500 dark:text-gray-400">暂无已删除的 API Keys</p>
            <p class="mt-2 text-sm text-gray-400">已删除的 API Keys 会出现在这里</p>
          </div>

          <!-- 已删除的 API Keys 表格 -->
          <div v-else>
            <!-- 工具栏 -->
            <div class="mb-4 flex justify-end">
              <button
                v-if="deletedApiKeys.length > 0"
                class="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-700"
                @click="clearAllDeletedApiKeys"
              >
                <i class="fas fa-trash-alt mr-2" />
                清空所有已删除 ({{ deletedApiKeys.length }})
              </button>
            </div>

            <div class="table-wrapper">
              <div class="table-container">
                <table class="w-full table-fixed">
                  <thead class="bg-gray-50/80 backdrop-blur-sm dark:bg-gray-700/80">
                    <tr>
                      <th
                        class="w-[14%] min-w-[120px] px-3 py-4 text-left text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300"
                      >
                        名称
                      </th>
                      <th
                        class="w-[15%] min-w-[120px] px-3 py-4 text-left text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300"
                      >
                        所属账号
                      </th>
                      <th
                        v-if="isLdapEnabled"
                        class="w-[15%] min-w-[120px] px-3 py-4 text-left text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300"
                      >
                        创建者
                      </th>
                      <th
                        class="w-[15%] min-w-[120px] px-3 py-4 text-left text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300"
                      >
                        创建时间
                      </th>
                      <th
                        class="w-[10%] min-w-[90px] px-3 py-4 text-left text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300"
                      >
                        删除者
                      </th>
                      <th
                        class="w-[10%] min-w-[90px] px-3 py-4 text-left text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300"
                      >
                        删除时间
                      </th>
                      <th
                        class="w-[8%] min-w-[60px] px-3 py-4 text-right text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300"
                      >
                        费用
                      </th>
                      <th
                        class="w-[8%] min-w-[60px] px-3 py-4 text-right text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300"
                      >
                        Token
                      </th>
                      <th
                        class="w-[8%] min-w-[60px] px-3 py-4 text-right text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300"
                      >
                        请求数
                      </th>
                      <th
                        class="w-[9%] min-w-[80px] px-3 py-4 text-left text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300"
                      >
                        最后使用
                      </th>
                      <th
                        class="operations-column sticky right-0 w-[15%] min-w-[160px] px-3 py-4 text-left text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300"
                      >
                        操作
                      </th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-gray-200/50 dark:divide-gray-600/50">
                    <tr v-for="key in deletedApiKeys" :key="key.id" class="table-row">
                      <td class="px-3 py-3">
                        <div class="flex items-center">
                          <div
                            class="mr-2 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-red-500 to-red-600"
                          >
                            <i class="fas fa-trash text-[10px] text-white" />
                          </div>
                          <div class="min-w-0">
                            <div
                              class="truncate text-sm font-semibold text-gray-900 dark:text-gray-100"
                              :title="key.name"
                            >
                              {{ key.name }}
                            </div>
                          </div>
                        </div>
                      </td>
                      <!-- 所属账号 -->
                      <td class="px-3 py-3">
                        <div class="space-y-1">
                          <!-- Claude OAuth 绑定 -->
                          <div v-if="key.claudeAccountId" class="flex items-center gap-1 text-xs">
                            <span
                              class="inline-flex items-center rounded bg-blue-100 px-1.5 py-0.5 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                            >
                              <i class="fas fa-robot mr-1 text-[10px]" />
                              Claude OAuth
                            </span>
                          </div>
                          <!-- Claude Console 绑定 -->
                          <div
                            v-else-if="key.claudeConsoleAccountId"
                            class="flex items-center gap-1 text-xs"
                          >
                            <span
                              class="inline-flex items-center rounded bg-green-100 px-1.5 py-0.5 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                            >
                              <i class="fas fa-terminal mr-1 text-[10px]" />
                              Claude Console
                            </span>
                          </div>
                          <!-- Gemini 绑定 -->
                          <div
                            v-else-if="key.geminiAccountId"
                            class="flex items-center gap-1 text-xs"
                          >
                            <span
                              class="inline-flex items-center rounded bg-purple-100 px-1.5 py-0.5 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
                            >
                              <i class="fa-google mr-1 text-[10px]" />
                              Gemini
                            </span>
                          </div>
                          <!-- 共享池 -->
                          <div v-else class="text-xs text-gray-500 dark:text-gray-400">
                            <i class="fas fa-share-alt mr-1" />
                            共享池
                          </div>
                        </div>
                      </td>
                      <!-- 创建者 -->
                      <td v-if="isLdapEnabled" class="px-3 py-3">
                        <div class="text-xs">
                          <span v-if="key.createdBy === 'admin'" class="text-blue-600">
                            <i class="fas fa-user-shield mr-1 text-xs" />
                            管理员
                          </span>
                          <span v-else-if="key.userUsername" class="text-green-600">
                            <i class="fas fa-user mr-1 text-xs" />
                            {{ key.userUsername }}
                          </span>
                          <span v-else class="text-gray-500 dark:text-gray-400">
                            <i class="fas fa-question-circle mr-1 text-xs" />
                            未知
                          </span>
                        </div>
                      </td>
                      <!-- 创建时间 -->
                      <td
                        class="whitespace-nowrap px-3 py-3 text-gray-700 dark:text-gray-300"
                        style="font-size: 13px"
                      >
                        {{ formatDate(key.createdAt) }}
                      </td>
                      <!-- 删除者 -->
                      <td class="px-3 py-3">
                        <div class="text-xs">
                          <span v-if="key.deletedByType === 'admin'" class="text-blue-600">
                            <i class="fas fa-user-shield mr-1 text-xs" />
                            {{ key.deletedBy }}
                          </span>
                          <span v-else-if="key.deletedByType === 'user'" class="text-green-600">
                            <i class="fas fa-user mr-1 text-xs" />
                            {{ key.deletedBy }}
                          </span>
                          <span v-else class="text-gray-500 dark:text-gray-400">
                            <i class="fas fa-cog mr-1 text-xs" />
                            {{ key.deletedBy }}
                          </span>
                        </div>
                      </td>
                      <!-- 删除时间 -->
                      <td
                        class="whitespace-nowrap px-3 py-3 text-gray-700 dark:text-gray-300"
                        style="font-size: 13px"
                      >
                        {{ formatDate(key.deletedAt) }}
                      </td>
                      <!-- 费用 -->
                      <td class="whitespace-nowrap px-3 py-3 text-right" style="font-size: 13px">
                        <span
                          class="font-medium text-blue-600 dark:text-blue-400"
                          style="font-size: 13px"
                        >
                          ${{ (key.usage?.total?.cost || 0).toFixed(2) }}
                        </span>
                      </td>
                      <!-- Token -->
                      <td class="whitespace-nowrap px-3 py-3 text-right" style="font-size: 13px">
                        <span
                          class="font-medium text-purple-600 dark:text-purple-400"
                          style="font-size: 13px"
                        >
                          {{ formatTokenCount(key.usage?.total?.tokens || 0) }}
                        </span>
                      </td>
                      <!-- 请求数 -->
                      <td class="whitespace-nowrap px-3 py-3 text-right" style="font-size: 13px">
                        <div class="flex items-center justify-end gap-1">
                          <span
                            class="font-medium text-gray-900 dark:text-gray-100"
                            style="font-size: 13px"
                          >
                            {{ formatNumber(key.usage?.total?.requests || 0) }}
                          </span>
                          <span class="text-xs text-gray-500">次</span>
                        </div>
                      </td>
                      <!-- 最后使用 -->
                      <td
                        class="whitespace-nowrap px-3 py-3 text-gray-700 dark:text-gray-300"
                        style="font-size: 13px"
                      >
                        <div class="flex flex-col leading-tight">
                          <span
                            v-if="key.lastUsedAt"
                            class="cursor-help"
                            style="font-size: 13px"
                            :title="new Date(key.lastUsedAt).toLocaleString('zh-CN')"
                          >
                            {{ formatLastUsed(key.lastUsedAt) }}
                          </span>
                          <span v-else class="text-gray-400" style="font-size: 13px">从未使用</span>
                          <span
                            v-if="hasLastUsageAccount(key)"
                            class="mt-1 text-xs text-gray-500 dark:text-gray-400"
                            :title="getLastUsageFullName(key)"
                          >
                            {{ getLastUsageDisplayName(key) }}
                            <span
                              v-if="!isLastUsageDeleted(key)"
                              class="ml-1 text-gray-400 dark:text-gray-500"
                            >
                              ({{ getLastUsageTypeLabel(key) }})
                            </span>
                          </span>
                          <span v-else class="mt-1 text-xs text-gray-400 dark:text-gray-500">
                            暂无使用账号
                          </span>
                        </div>
                      </td>
                      <td class="operations-column operations-cell px-3 py-3">
                        <div class="flex items-center gap-2">
                          <button
                            v-if="key.canRestore"
                            class="rounded-lg bg-green-50 px-3 py-1.5 text-xs font-medium text-green-600 transition-colors hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-green-900/50"
                            title="恢复 API Key"
                            @click="restoreApiKey(key.id)"
                          >
                            <i class="fas fa-undo mr-1" />
                            恢复
                          </button>
                          <button
                            class="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-100 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50"
                            title="彻底删除 API Key"
                            @click="permanentDeleteApiKey(key.id)"
                          >
                            <i class="fas fa-times mr-1" />
                            彻底删除
                          </button>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
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
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { showToast } from '@/utils/toast'
import { apiClient } from '@/config/api'
import { useClientsStore } from '@/stores/clients'
import { useAuthStore } from '@/stores/auth'
import * as XLSX from 'xlsx-js-style'
import CreateApiKeyModal from '@/components/apikeys/CreateApiKeyModal.vue'
import EditApiKeyModal from '@/components/apikeys/EditApiKeyModal.vue'
import RenewApiKeyModal from '@/components/apikeys/RenewApiKeyModal.vue'
import NewApiKeyModal from '@/components/apikeys/NewApiKeyModal.vue'
import BatchApiKeyModal from '@/components/apikeys/BatchApiKeyModal.vue'
import BatchEditApiKeyModal from '@/components/apikeys/BatchEditApiKeyModal.vue'
import ExpiryEditModal from '@/components/apikeys/ExpiryEditModal.vue'
import UsageDetailModal from '@/components/apikeys/UsageDetailModal.vue'
import LimitProgressBar from '@/components/apikeys/LimitProgressBar.vue'
import CustomDropdown from '@/components/common/CustomDropdown.vue'

// 响应式数据
const clientsStore = useClientsStore()
const authStore = useAuthStore()
const apiKeys = ref([])

// 获取 LDAP 启用状态
const isLdapEnabled = computed(() => authStore.oemSettings?.ldapEnabled || false)

// 多选相关状态
const selectedApiKeys = ref([])
const selectAllChecked = ref(false)
const isIndeterminate = ref(false)
const showCheckboxes = ref(false)
const apiKeysLoading = ref(false)
const apiKeyStatsTimeRange = ref('today')

// 全局日期筛选器
const globalDateFilter = reactive({
  type: 'preset',
  preset: 'today',
  customStart: '',
  customEnd: '',
  customRange: null
})

// 是否应该显示多选框
const shouldShowCheckboxes = computed(() => {
  return showCheckboxes.value
})

// 切换选择模式
const toggleSelectionMode = () => {
  showCheckboxes.value = !showCheckboxes.value
  // 关闭选择模式时清空已选项
  if (!showCheckboxes.value) {
    selectedApiKeys.value = []
    selectAllChecked.value = false
    isIndeterminate.value = false
  }
}

// 时间范围下拉选项
const timeRangeDropdownOptions = computed(() => [
  { value: 'today', label: '今日', icon: 'fa-calendar-day' },
  { value: '7days', label: '最近7天', icon: 'fa-calendar-week' },
  { value: '30days', label: '最近30天', icon: 'fa-calendar-alt' },
  { value: 'all', label: '全部时间', icon: 'fa-infinity' },
  { value: 'custom', label: '自定义范围', icon: 'fa-calendar-check' }
])

// Tab management
const activeTab = ref('active')
const deletedApiKeys = ref([])
const deletedApiKeysLoading = ref(false)
const apiKeysSortBy = ref('periodCost')
const apiKeysSortOrder = ref('desc')
const expandedApiKeys = ref({})
const apiKeyModelStats = ref({})
const apiKeyDateFilters = ref({})
const defaultTime = ref([new Date(2000, 1, 1, 0, 0, 0), new Date(2000, 2, 1, 23, 59, 59)])
const accounts = ref({
  claude: [],
  gemini: [],
  openai: [],
  openaiResponses: [], // 添加 OpenAI-Responses 账号列表
  bedrock: [],
  droid: [],
  claudeGroups: [],
  geminiGroups: [],
  openaiGroups: [],
  droidGroups: []
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
const searchMode = ref('apiKey')
const searchModeOptions = computed(() => [
  { value: 'apiKey', label: '按Key名称', icon: 'fa-key' },
  { value: 'bindingAccount', label: '按所属账号', icon: 'fa-id-badge' }
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
// 从 localStorage 读取保存的每页显示条数，默认为 10
const getInitialPageSize = () => {
  const saved = localStorage.getItem('apiKeysPageSize')
  if (saved) {
    const parsedSize = parseInt(saved, 10)
    // 验证保存的值是否在允许的选项中
    if ([10, 20, 50, 100].includes(parsedSize)) {
      return parsedSize
    }
  }
  return 10
}
const pageSize = ref(getInitialPageSize())
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

// 提取“所属账号”列直接展示的文本
const getBindingDisplayStrings = (key) => {
  const values = new Set()

  const collect = (...items) => {
    items.forEach((item) => {
      if (typeof item !== 'string') return
      const trimmed = item.trim()
      if (trimmed) {
        values.add(trimmed)
      }
    })
  }

  const sanitize = (text) => {
    if (typeof text !== 'string') return ''
    return text
      .replace(/^⚠️\s*/, '')
      .replace(/^🔒\s*/, '')
      .trim()
  }

  const appendBindingRow = (label, info) => {
    const infoSanitized = sanitize(info)
    collect(label, info, infoSanitized)
    if (infoSanitized) {
      collect(`${label} ${infoSanitized}`)
    }
  }

  if (key.claudeAccountId || key.claudeConsoleAccountId) {
    appendBindingRow('Claude', getClaudeBindingInfo(key))
  }

  if (key.geminiAccountId) {
    appendBindingRow('Gemini', getGeminiBindingInfo(key))
  }

  if (key.openaiAccountId) {
    appendBindingRow('OpenAI', getOpenAIBindingInfo(key))
  }

  if (key.bedrockAccountId) {
    appendBindingRow('Bedrock', getBedrockBindingInfo(key))
  }

  if (key.droidAccountId) {
    appendBindingRow('Droid', getDroidBindingInfo(key))
  }

  if (
    !key.claudeAccountId &&
    !key.claudeConsoleAccountId &&
    !key.geminiAccountId &&
    !key.openaiAccountId &&
    !key.bedrockAccountId &&
    !key.droidAccountId
  ) {
    collect('共享池')
  }

  return Array.from(values)
}

// 计算排序后的API Keys
const sortedApiKeys = computed(() => {
  // 先进行标签筛选
  let filteredKeys = apiKeys.value
  if (selectedTagFilter.value) {
    filteredKeys = apiKeys.value.filter(
      (key) => key.tags && key.tags.includes(selectedTagFilter.value)
    )
  }

  // 然后进行搜索过滤
  if (searchKeyword.value) {
    const keyword = searchKeyword.value.toLowerCase().trim()
    filteredKeys = filteredKeys.filter((key) => {
      if (searchMode.value === 'bindingAccount') {
        const bindings = getBindingDisplayStrings(key)
        if (bindings.length === 0) return false
        return bindings.some((text) => text.toLowerCase().includes(keyword))
      }

      const nameMatch = key.name && key.name.toLowerCase().includes(keyword)
      if (isLdapEnabled.value) {
        const ownerMatch =
          key.ownerDisplayName && key.ownerDisplayName.toLowerCase().includes(keyword)
        return nameMatch || ownerMatch
      }
      return nameMatch
    })
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
    } else if (apiKeysSortBy.value === 'periodRequests') {
      aVal = getPeriodRequests(a)
      bVal = getPeriodRequests(b)
    } else if (apiKeysSortBy.value === 'periodCost') {
      aVal = calculatePeriodCost(a)
      bVal = calculatePeriodCost(b)
    } else if (apiKeysSortBy.value === 'periodTokens') {
      aVal = getPeriodTokens(a)
      bVal = getPeriodTokens(b)
    } else if (apiKeysSortBy.value === 'dailyCost') {
      aVal = a.dailyCost || 0
      bVal = b.dailyCost || 0
    } else if (apiKeysSortBy.value === 'totalCost') {
      aVal = a.totalCost || 0
      bVal = b.totalCost || 0
    } else if (
      apiKeysSortBy.value === 'createdAt' ||
      apiKeysSortBy.value === 'expiresAt' ||
      apiKeysSortBy.value === 'lastUsedAt'
    ) {
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

const shouldShowFirstPage = computed(() => {
  const pages = pageNumbers.value
  if (pages.length === 0) return false
  return pages[0] > 1
})

const shouldShowLastPage = computed(() => {
  const pages = pageNumbers.value
  if (pages.length === 0) return false
  return pages[pages.length - 1] < totalPages.value
})

const showLeadingEllipsis = computed(() => {
  const pages = pageNumbers.value
  if (pages.length === 0) return false
  return shouldShowFirstPage.value && pages[0] > 2
})

const showTrailingEllipsis = computed(() => {
  const pages = pageNumbers.value
  if (pages.length === 0) return false
  return shouldShowLastPage.value && pages[pages.length - 1] < totalPages.value - 1
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
    const [
      claudeData,
      claudeConsoleData,
      geminiData,
      openaiData,
      openaiResponsesData,
      bedrockData,
      droidData,
      groupsData
    ] = await Promise.all([
      apiClient.get('/admin/claude-accounts'),
      apiClient.get('/admin/claude-console-accounts'),
      apiClient.get('/admin/gemini-accounts'),
      apiClient.get('/admin/openai-accounts'),
      apiClient.get('/admin/openai-responses-accounts'), // 加载 OpenAI-Responses 账号
      apiClient.get('/admin/bedrock-accounts'),
      apiClient.get('/admin/droid-accounts'),
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

    if (openaiResponsesData.success) {
      accounts.value.openaiResponses = (openaiResponsesData.data || []).map((account) => ({
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

    if (droidData.success) {
      accounts.value.droid = (droidData.data || []).map((account) => ({
        ...account,
        platform: 'droid',
        isDedicated: account.accountType === 'dedicated'
      }))
    }

    if (groupsData.success) {
      // 处理分组数据
      const allGroups = groupsData.data || []
      accounts.value.claudeGroups = allGroups.filter((g) => g.platform === 'claude')
      accounts.value.geminiGroups = allGroups.filter((g) => g.platform === 'gemini')
      accounts.value.openaiGroups = allGroups.filter((g) => g.platform === 'openai')
      accounts.value.droidGroups = allGroups.filter((g) => g.platform === 'droid')
    }
  } catch (error) {
    // console.error('加载账户列表失败:', error)
  }
}

// 加载API Keys
const loadApiKeys = async () => {
  apiKeysLoading.value = true
  try {
    // 构建请求参数
    let params = {}
    if (
      globalDateFilter.type === 'custom' &&
      globalDateFilter.customStart &&
      globalDateFilter.customEnd
    ) {
      params.startDate = globalDateFilter.customStart
      params.endDate = globalDateFilter.customEnd
      params.timeRange = 'custom'
    } else if (globalDateFilter.preset === 'all') {
      params.timeRange = 'all'
    } else {
      params.timeRange = globalDateFilter.preset
    }

    const queryString = new URLSearchParams(params).toString()
    const data = await apiClient.get(`/admin/api-keys?${queryString}`)
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

// 加载已删除的API Keys
const loadDeletedApiKeys = async () => {
  activeTab.value = 'deleted'
  deletedApiKeysLoading.value = true
  try {
    const data = await apiClient.get('/admin/api-keys/deleted')
    if (data.success) {
      deletedApiKeys.value = data.apiKeys || []
    }
  } catch (error) {
    showToast('加载已删除的 API Keys 失败', 'error')
  } finally {
    deletedApiKeysLoading.value = false
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

// 格式化Token数量
const formatTokenCount = (count) => {
  if (!count && count !== 0) return '0'
  if (count >= 1000000) {
    return (count / 1000000).toFixed(1) + 'M'
  } else if (count >= 1000) {
    return (count / 1000).toFixed(1) + 'K'
  }
  return count.toString()
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

    const droidGroup = accounts.value.droidGroups.find((g) => g.id === groupId)
    if (droidGroup) {
      return `分组-${droidGroup.name}`
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

  // 处理 responses: 前缀的 OpenAI-Responses 账户
  if (accountId.startsWith('responses:')) {
    const realAccountId = accountId.replace('responses:', '')
    const openaiResponsesAccount = accounts.value.openaiResponses.find(
      (acc) => acc.id === realAccountId
    )
    if (openaiResponsesAccount) {
      return `${openaiResponsesAccount.name}`
    }
    // 如果找不到，返回ID的前8位
    return `${realAccountId.substring(0, 8)}`
  }

  // 从OpenAI账户列表中查找
  const openaiAccount = accounts.value.openai.find((acc) => acc.id === accountId)
  if (openaiAccount) {
    return `${openaiAccount.name}`
  }

  // 从 OpenAI-Responses 账户列表中查找（兼容没有前缀的情况）
  const openaiResponsesAccount = accounts.value.openaiResponses.find((acc) => acc.id === accountId)
  if (openaiResponsesAccount) {
    return `${openaiResponsesAccount.name}`
  }

  // 从Bedrock账户列表中查找
  const bedrockAccount = accounts.value.bedrock.find((acc) => acc.id === accountId)
  if (bedrockAccount) {
    return `${bedrockAccount.name}`
  }

  const droidAccount = accounts.value.droid.find((acc) => acc.id === accountId)
  if (droidAccount) {
    return `${droidAccount.name}`
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

    // 处理 responses: 前缀的 OpenAI-Responses 账户
    let account = null
    if (key.openaiAccountId.startsWith('responses:')) {
      const realAccountId = key.openaiAccountId.replace('responses:', '')
      account = accounts.value.openaiResponses.find((acc) => acc.id === realAccountId)
    } else {
      // 查找普通 OpenAI 账户
      account = accounts.value.openai.find((acc) => acc.id === key.openaiAccountId)
    }

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

const getDroidBindingInfo = (key) => {
  if (key.droidAccountId) {
    const info = getBoundAccountName(key.droidAccountId)
    if (key.droidAccountId.startsWith('group:')) {
      return info
    }
    const account = accounts.value.droid.find((acc) => acc.id === key.droidAccountId)
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

// 获取日期范围内的请求数
const getPeriodRequests = (key) => {
  // 根据全局日期筛选器返回对应的请求数
  if (globalDateFilter.type === 'custom') {
    // 自定义日期范围
    if (key.usage) {
      if (key.usage['custom'] && key.usage['custom'].requests !== undefined) {
        return key.usage['custom'].requests
      }
      if (key.usage.total && key.usage.total.requests !== undefined) {
        return key.usage.total.requests
      }
    }
    return 0
  } else if (globalDateFilter.preset === 'today') {
    return key.usage?.daily?.requests || 0
  } else if (globalDateFilter.preset === '7days') {
    // 使用 usage['7days'].requests
    if (key.usage && key.usage['7days'] && key.usage['7days'].requests !== undefined) {
      return key.usage['7days'].requests
    }
    return 0
  } else if (globalDateFilter.preset === '30days') {
    // 使用 usage['30days'].requests
    if (key.usage) {
      if (key.usage['30days'] && key.usage['30days'].requests !== undefined) {
        return key.usage['30days'].requests
      }
      if (key.usage.monthly && key.usage.monthly.requests !== undefined) {
        return key.usage.monthly.requests
      }
    }
    return 0
  } else if (globalDateFilter.preset === 'all') {
    // 全部时间
    if (key.usage && key.usage['all'] && key.usage['all'].requests !== undefined) {
      return key.usage['all'].requests
    }
    return key.usage?.total?.requests || 0
  } else {
    // 默认返回
    return key.usage?.total?.requests || 0
  }
}

// 获取日期范围内的费用
const getPeriodCost = (key) => {
  // 根据全局日期筛选器返回对应的费用
  if (globalDateFilter.type === 'custom') {
    // 自定义日期范围，使用服务器返回的 usage['custom'].cost
    if (key.usage) {
      if (key.usage['custom'] && key.usage['custom'].cost !== undefined) {
        return key.usage['custom'].cost
      }
      if (key.usage.total && key.usage.total.cost !== undefined) {
        return key.usage.total.cost
      }
    }
    return 0
  } else if (globalDateFilter.preset === 'today') {
    return key.dailyCost || 0
  } else if (globalDateFilter.preset === '7days') {
    // 使用 usage['7days'].cost
    if (key.usage && key.usage['7days'] && key.usage['7days'].cost !== undefined) {
      return key.usage['7days'].cost
    }
    return key.weeklyCost || key.periodCost || 0
  } else if (globalDateFilter.preset === '30days') {
    // 使用 usage['30days'].cost 或 usage.monthly.cost
    if (key.usage) {
      if (key.usage['30days'] && key.usage['30days'].cost !== undefined) {
        return key.usage['30days'].cost
      }
      if (key.usage.monthly && key.usage.monthly.cost !== undefined) {
        return key.usage.monthly.cost
      }
      if (key.usage.total && key.usage.total.cost !== undefined) {
        return key.usage.total.cost
      }
    }
    return key.monthlyCost || key.periodCost || 0
  } else if (globalDateFilter.preset === 'all') {
    // 全部时间，返回 usage['all'].cost 或 totalCost
    if (key.usage && key.usage['all'] && key.usage['all'].cost !== undefined) {
      return key.usage['all'].cost
    }
    return key.totalCost || 0
  } else {
    // 默认返回 usage.total.cost
    return key.periodCost || key.totalCost || 0
  }
}

// 获取日期范围内的token数量
const getPeriodTokens = (key) => {
  // 根据全局日期筛选器返回对应的token数量
  if (globalDateFilter.type === 'custom') {
    // 自定义日期范围
    if (key.usage) {
      if (key.usage['custom'] && key.usage['custom'].tokens !== undefined) {
        return key.usage['custom'].tokens
      }
      if (key.usage.total && key.usage.total.tokens !== undefined) {
        return key.usage.total.tokens
      }
    }
    return 0
  } else if (globalDateFilter.preset === 'today') {
    return key.usage?.daily?.tokens || 0
  } else if (globalDateFilter.preset === '7days') {
    // 使用 usage['7days'].tokens
    if (key.usage && key.usage['7days'] && key.usage['7days'].tokens !== undefined) {
      return key.usage['7days'].tokens
    }
    return 0
  } else if (globalDateFilter.preset === '30days') {
    // 使用 usage['30days'].tokens 或 usage.monthly.tokens
    if (key.usage) {
      if (key.usage['30days'] && key.usage['30days'].tokens !== undefined) {
        return key.usage['30days'].tokens
      }
      if (key.usage.monthly && key.usage.monthly.tokens !== undefined) {
        return key.usage.monthly.tokens
      }
      if (key.usage.total && key.usage.total.tokens !== undefined) {
        return key.usage.total.tokens
      }
    }
    return 0
  } else if (globalDateFilter.preset === 'all') {
    // 全部时间
    if (key.usage && key.usage['all'] && key.usage['all'].tokens !== undefined) {
      return key.usage['all'].tokens
    }
    return key.usage?.total?.tokens || 0
  } else {
    // 默认返回
    return key.usage?.total?.tokens || 0
  }
}

// 获取日期范围内的输入token数量
const getPeriodInputTokens = (key) => {
  // 根据全局日期筛选器返回对应的输入token数量
  if (globalDateFilter.type === 'custom') {
    // 自定义日期范围
    if (key.usage) {
      if (key.usage['custom'] && key.usage['custom'].inputTokens !== undefined) {
        return key.usage['custom'].inputTokens
      }
      if (key.usage.total && key.usage.total.inputTokens !== undefined) {
        return key.usage.total.inputTokens
      }
    }
    return 0
  } else if (globalDateFilter.preset === 'today') {
    return key.usage?.daily?.inputTokens || 0
  } else if (globalDateFilter.preset === '7days') {
    // 使用 usage['7days'].inputTokens
    if (key.usage && key.usage['7days'] && key.usage['7days'].inputTokens !== undefined) {
      return key.usage['7days'].inputTokens
    }
    return 0
  } else if (globalDateFilter.preset === '30days') {
    // 使用 usage['30days'].inputTokens 或 usage.monthly.inputTokens
    if (key.usage) {
      if (key.usage['30days'] && key.usage['30days'].inputTokens !== undefined) {
        return key.usage['30days'].inputTokens
      }
      if (key.usage.monthly && key.usage.monthly.inputTokens !== undefined) {
        return key.usage.monthly.inputTokens
      }
      if (key.usage.total && key.usage.total.inputTokens !== undefined) {
        return key.usage.total.inputTokens
      }
    }
    return 0
  } else if (globalDateFilter.preset === 'all') {
    // 全部时间
    if (key.usage && key.usage['all'] && key.usage['all'].inputTokens !== undefined) {
      return key.usage['all'].inputTokens
    }
    return key.usage?.total?.inputTokens || 0
  } else {
    // 默认返回
    return key.usage?.total?.inputTokens || 0
  }
}

// 获取日期范围内的输出token数量
const getPeriodOutputTokens = (key) => {
  // 根据全局日期筛选器返回对应的输出token数量
  if (globalDateFilter.type === 'custom') {
    // 自定义日期范围
    if (key.usage) {
      if (key.usage['custom'] && key.usage['custom'].outputTokens !== undefined) {
        return key.usage['custom'].outputTokens
      }
      if (key.usage.total && key.usage.total.outputTokens !== undefined) {
        return key.usage.total.outputTokens
      }
    }
    return 0
  } else if (globalDateFilter.preset === 'today') {
    return key.usage?.daily?.outputTokens || 0
  } else if (globalDateFilter.preset === '7days') {
    // 使用 usage['7days'].outputTokens
    if (key.usage && key.usage['7days'] && key.usage['7days'].outputTokens !== undefined) {
      return key.usage['7days'].outputTokens
    }
    return 0
  } else if (globalDateFilter.preset === '30days') {
    // 使用 usage['30days'].outputTokens 或 usage.monthly.outputTokens
    if (key.usage) {
      if (key.usage['30days'] && key.usage['30days'].outputTokens !== undefined) {
        return key.usage['30days'].outputTokens
      }
      if (key.usage.monthly && key.usage.monthly.outputTokens !== undefined) {
        return key.usage.monthly.outputTokens
      }
      if (key.usage.total && key.usage.total.outputTokens !== undefined) {
        return key.usage.total.outputTokens
      }
    }
    return 0
  } else if (globalDateFilter.preset === 'all') {
    // 全部时间
    if (key.usage && key.usage['all'] && key.usage['all'].outputTokens !== undefined) {
      return key.usage['all'].outputTokens
    }
    return key.usage?.total?.outputTokens || 0
  } else {
    // 默认返回
    return key.usage?.total?.outputTokens || 0
  }
}

// 计算日期范围内的总费用（用于展开的详细统计）
const calculatePeriodCost = (key) => {
  // 如果没有展开，使用缓存的费用数据
  if (!apiKeyModelStats.value[key.id]) {
    return getPeriodCost(key)
  }

  // 计算所有模型的费用总和
  const stats = apiKeyModelStats.value[key.id] || []
  let totalCost = 0

  stats.forEach((stat) => {
    if (stat.cost !== undefined) {
      totalCost += stat.cost
    } else if (stat.formatted && stat.formatted.total) {
      // 尝试从格式化的字符串中提取数字
      const costStr = stat.formatted.total.replace('$', '').replace(',', '')
      const cost = parseFloat(costStr)
      if (!isNaN(cost)) {
        totalCost += cost
      }
    }
  })

  return totalCost
}

// 处理时间范围下拉框变化
const handleTimeRangeChange = (value) => {
  setGlobalDateFilterPreset(value)
}

// 设置全局日期预设
const setGlobalDateFilterPreset = (preset) => {
  globalDateFilter.preset = preset

  if (preset === 'custom') {
    // 自定义选项，不自动设置日期，等待用户选择
    globalDateFilter.type = 'custom'
    // 如果没有自定义范围，设置默认为最近7天
    if (!globalDateFilter.customRange) {
      const today = new Date()
      const startDate = new Date(today)
      startDate.setDate(today.getDate() - 6)

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

      globalDateFilter.customRange = [formatDate(startDate), formatDate(today)]
      globalDateFilter.customStart = startDate.toISOString().split('T')[0]
      globalDateFilter.customEnd = today.toISOString().split('T')[0]
    }
  } else if (preset === 'all') {
    // 全部时间选项
    globalDateFilter.type = 'preset'
    globalDateFilter.customStart = null
    globalDateFilter.customEnd = null
  } else {
    // 预设选项（今日、7天或30天）
    globalDateFilter.type = 'preset'
    const today = new Date()
    const startDate = new Date(today)

    if (preset === 'today') {
      // 今日：从今天开始到今天结束
      startDate.setHours(0, 0, 0, 0)
    } else if (preset === '7days') {
      startDate.setDate(today.getDate() - 6)
    } else if (preset === '30days') {
      startDate.setDate(today.getDate() - 29)
    }

    globalDateFilter.customStart = startDate.toISOString().split('T')[0]
    globalDateFilter.customEnd = today.toISOString().split('T')[0]
  }

  loadApiKeys()
}

// 全局自定义日期范围变化
const onGlobalCustomDateRangeChange = (value) => {
  if (value && value.length === 2) {
    globalDateFilter.type = 'custom'
    globalDateFilter.preset = 'custom'
    globalDateFilter.customRange = value
    globalDateFilter.customStart = value[0].split(' ')[0]
    globalDateFilter.customEnd = value[1].split(' ')[0]
    loadApiKeys()
  } else if (value === null) {
    // 清空时恢复默认今日
    setGlobalDateFilterPreset('today')
  }
}

// 初始化API Key的日期筛选器
const initApiKeyDateFilter = (keyId) => {
  const today = new Date()
  const startDate = new Date(today)
  startDate.setHours(0, 0, 0, 0) // 今日从0点开始

  apiKeyDateFilters.value[keyId] = {
    type: 'preset',
    preset: 'today',
    customStart: today.toISOString().split('T')[0],
    customEnd: today.toISOString().split('T')[0],
    customRange: null,
    presetOptions: [
      { value: 'today', label: '今日', days: 1 },
      { value: '7days', label: '7天', days: 7 },
      { value: '30days', label: '30天', days: 30 },
      { value: 'custom', label: '自定义', days: -1 }
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
    if (preset === 'custom') {
      // 自定义选项，不自动设置日期，等待用户选择
      filter.type = 'custom'
      // 如果没有自定义范围，设置默认为最近7天
      if (!filter.customRange) {
        const today = new Date()
        const startDate = new Date(today)
        startDate.setDate(today.getDate() - 6)

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
        filter.customStart = startDate.toISOString().split('T')[0]
        filter.customEnd = today.toISOString().split('T')[0]
      }
    } else {
      // 预设选项
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
  }

  loadApiKeyModelStats(keyId, true)
}

// API Key 自定义日期范围变化
const onApiKeyCustomDateRangeChange = (keyId, value) => {
  const filter = getApiKeyDateFilter(keyId)

  if (value && value.length === 2) {
    filter.type = 'custom'
    filter.preset = 'custom'
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

  // 重置为默认的今日
  filter.type = 'preset'
  filter.preset = 'today'

  const today = new Date()
  const startDate = new Date(today)
  startDate.setHours(0, 0, 0, 0) // 今日从0点开始

  filter.customStart = today.toISOString().split('T')[0]
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

// 更新API Key图标
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

// 恢复API Key
const restoreApiKey = async (keyId) => {
  let confirmed = false

  if (window.showConfirm) {
    confirmed = await window.showConfirm(
      '恢复 API Key',
      '确定要恢复这个 API Key 吗？恢复后可以重新使用。',
      '确定恢复',
      '取消'
    )
  } else {
    // 降级方案
    confirmed = confirm('确定要恢复这个 API Key 吗？恢复后可以重新使用。')
  }

  if (!confirmed) return

  try {
    const data = await apiClient.post(`/admin/api-keys/${keyId}/restore`)
    if (data.success) {
      showToast('API Key 已成功恢复', 'success')
      // 刷新已删除列表
      await loadDeletedApiKeys()
      // 同时刷新活跃列表
      await loadApiKeys()
    } else {
      showToast(data.error || '恢复失败', 'error')
    }
  } catch (error) {
    showToast(error.response?.data?.error || '恢复失败', 'error')
  }
}

// 彻底删除API Key
const permanentDeleteApiKey = async (keyId) => {
  let confirmed = false

  if (window.showConfirm) {
    confirmed = await window.showConfirm(
      '彻底删除 API Key',
      '确定要彻底删除这个 API Key 吗？此操作不可恢复，所有相关数据将被永久删除。',
      '确定彻底删除',
      '取消'
    )
  } else {
    // 降级方案
    confirmed = confirm('确定要彻底删除这个 API Key 吗？此操作不可恢复，所有相关数据将被永久删除。')
  }

  if (!confirmed) return

  try {
    const data = await apiClient.delete(`/admin/api-keys/${keyId}/permanent`)
    if (data.success) {
      showToast('API Key 已彻底删除', 'success')
      // 刷新已删除列表
      loadDeletedApiKeys()
    } else {
      showToast(data.error || '彻底删除失败', 'error')
    }
  } catch (error) {
    showToast(error.response?.data?.error || '彻底删除失败', 'error')
  }
}

// 清空所有已删除的API Keys
const clearAllDeletedApiKeys = async () => {
  const count = deletedApiKeys.value.length
  if (count === 0) {
    showToast('没有需要清空的 API Keys', 'info')
    return
  }

  let confirmed = false

  if (window.showConfirm) {
    confirmed = await window.showConfirm(
      '清空所有已删除的 API Keys',
      `确定要彻底删除全部 ${count} 个已删除的 API Keys 吗？此操作不可恢复，所有相关数据将被永久删除。`,
      '确定清空全部',
      '取消'
    )
  } else {
    // 降级方案
    confirmed = confirm(`确定要彻底删除全部 ${count} 个已删除的 API Keys 吗？此操作不可恢复。`)
  }

  if (!confirmed) return

  try {
    const data = await apiClient.delete('/admin/api-keys/deleted/clear-all')
    if (data.success) {
      showToast(data.message || '已清空所有已删除的 API Keys', 'success')

      // 如果有失败的，显示详细信息
      if (data.details && data.details.failedCount > 0) {
        // const errors = data.details.errors
        // console.error('部分API Keys清空失败:', errors)
        showToast(`${data.details.failedCount} 个清空失败`, 'warning')
      }

      // 刷新已删除列表
      loadDeletedApiKeys()
    } else {
      showToast(data.error || '清空失败', 'error')
    }
  } catch (error) {
    showToast(error.response?.data?.error || '清空失败', 'error')
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
    // console.error('批量删除 API Keys 失败:', error)
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

// 开始编辑过期时间
const startEditExpiry = (apiKey) => {
  editingExpiryKey.value = apiKey
}

// 关闭过期时间编辑
const closeExpiryEdit = () => {
  editingExpiryKey.value = null
}

// 保存过期时间
const handleSaveExpiry = async ({ keyId, expiresAt, activateNow }) => {
  try {
    // 使用新的PATCH端点来修改过期时间
    const data = await apiClient.patch(`/admin/api-keys/${keyId}/expiration`, {
      expiresAt: expiresAt || null,
      activateNow: activateNow || false
    })

    if (data.success) {
      showToast(activateNow ? 'API Key已激活' : '过期时间已更新', 'success')
      // 更新本地数据
      const key = apiKeys.value.find((k) => k.id === keyId)
      if (key) {
        if (activateNow && data.updates) {
          key.isActivated = true
          key.activatedAt = data.updates.activatedAt
          key.expiresAt = data.updates.expiresAt
        } else {
          key.expiresAt = expiresAt || null
          if (expiresAt && !key.isActivated) {
            key.isActivated = true
          }
        }
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

// 格式化时间窗口倒计时
const formatWindowTime = (seconds) => {
  if (seconds === null || seconds === undefined) return '--:--'

  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60

  if (hours > 0) {
    return `${hours}h${minutes}m`
  } else if (minutes > 0) {
    return `${minutes}m${secs}s`
  } else {
    return `${secs}s`
  }
}

// 获取每日费用进度 - 已移到 LimitProgressBar 组件中
// const getDailyCostProgress = (key) => {
//   if (!key.dailyCostLimit || key.dailyCostLimit === 0) return 0
//   const percentage = ((key.dailyCost || 0) / key.dailyCostLimit) * 100
//   return Math.min(percentage, 100)
// }

// 获取每日费用进度条颜色 - 已移到 LimitProgressBar 组件中
// const getDailyCostProgressColor = (key) => {
//   const progress = getDailyCostProgress(key)
//   if (progress >= 100) return 'bg-red-500'
//   if (progress >= 80) return 'bg-yellow-500'
//   return 'bg-green-500'
// }

// 获取 Opus 周费用进度 - 已移到 LimitBadge 组件中
// const getWeeklyOpusCostProgress = (key) => {
//   if (!key.weeklyOpusCostLimit || key.weeklyOpusCostLimit === 0) return 0
//   const percentage = ((key.weeklyOpusCost || 0) / key.weeklyOpusCostLimit) * 100
//   return Math.min(percentage, 100)
// }

// 获取 Opus 周费用进度条颜色 - 已移到 LimitBadge 组件中
// const getWeeklyOpusCostProgressColor = (key) => {
//   const progress = getWeeklyOpusCostProgress(key)
//   if (progress >= 100) return 'bg-red-500'
//   if (progress >= 80) return 'bg-yellow-500'
//   return 'bg-green-500'
// }

// 获取总费用进度 - 暂时不用
// const getTotalCostProgress = (key) => {
//   if (!key.totalCostLimit || key.totalCostLimit === 0) return 0
//   const percentage = ((key.totalCost || 0) / key.totalCostLimit) * 100
//   return Math.min(percentage, 100)
// }

// 显示使用详情
const showUsageDetails = (apiKey) => {
  selectedApiKeyForDetail.value = apiKey
  showUsageDetailModal.value = true
}

// 格式化时间（秒转换为可读格式） - 已移到 WindowLimitBar 组件中
// const formatTime = (seconds) => {
//   if (seconds === null || seconds === undefined) return '--:--'
//
//   const hours = Math.floor(seconds / 3600)
//   const minutes = Math.floor((seconds % 3600) / 60)
//   const secs = seconds % 60
//
//   if (hours > 0) {
//     return `${hours}h ${minutes}m`
//   } else if (minutes > 0) {
//     return `${minutes}m ${secs}s`
//   } else {
//     return `${secs}s`
//   }
// }

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

const ACCOUNT_TYPE_LABELS = {
  claude: 'Claude',
  openai: 'OpenAI',
  gemini: 'Gemini',
  droid: 'Droid',
  deleted: '已删除',
  other: '其他'
}

const MAX_LAST_USAGE_NAME_LENGTH = 16

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const normalizeFrontendAccountCategory = (type) => {
  if (!type) return 'other'
  const lower = String(type).toLowerCase()
  if (lower === 'claude-console' || lower === 'claude_console' || lower === 'claude') {
    return 'claude'
  }
  if (
    lower === 'openai' ||
    lower === 'openai-responses' ||
    lower === 'openai_responses' ||
    lower === 'azure-openai' ||
    lower === 'azure_openai'
  ) {
    return 'openai'
  }
  if (lower === 'gemini') {
    return 'gemini'
  }
  if (lower === 'droid') {
    return 'droid'
  }
  return 'other'
}

const getLastUsageInfo = (apiKey) => apiKey?.lastUsage || null

const hasLastUsageAccount = (apiKey) => {
  const info = getLastUsageInfo(apiKey)
  return !!(info && (info.accountName || info.accountId || info.rawAccountId))
}

const isLikelyDeletedUsage = (info) => {
  if (!info) return false
  if (info.accountCategory === 'deleted') return true

  const rawId = typeof info.rawAccountId === 'string' ? info.rawAccountId.trim() : ''
  const accountName = typeof info.accountName === 'string' ? info.accountName.trim() : ''
  const accountType =
    typeof info.accountType === 'string' ? info.accountType.trim().toLowerCase() : ''

  if (!rawId) return false

  const looksLikeUuid = UUID_PATTERN.test(rawId)
  const nameMissingOrSame = !accountName || accountName === rawId
  const typeUnknown =
    !accountType || accountType === 'unknown' || ACCOUNT_TYPE_LABELS[accountType] === undefined

  return looksLikeUuid && nameMissingOrSame && typeUnknown
}

const getLastUsageBaseName = (info) => {
  if (!info) return '未知账号'
  if (isLikelyDeletedUsage(info)) {
    return '已删除'
  }
  return info.accountName || info.accountId || info.rawAccountId || '未知账号'
}

const getLastUsageFullName = (apiKey) => getLastUsageBaseName(getLastUsageInfo(apiKey))

const getLastUsageDisplayName = (apiKey) => {
  const full = getLastUsageFullName(apiKey)
  return full.length > MAX_LAST_USAGE_NAME_LENGTH
    ? `${full.slice(0, MAX_LAST_USAGE_NAME_LENGTH)}...`
    : full
}

const getLastUsageTypeLabel = (apiKey) => {
  const info = getLastUsageInfo(apiKey)
  if (isLikelyDeletedUsage(info)) {
    return ACCOUNT_TYPE_LABELS.deleted
  }
  const category = info?.accountCategory || normalizeFrontendAccountCategory(info?.accountType)
  return ACCOUNT_TYPE_LABELS[category] || ACCOUNT_TYPE_LABELS.other
}

const isLastUsageDeleted = (apiKey) => {
  const info = getLastUsageInfo(apiKey)
  return isLikelyDeletedUsage(info)
}

// 清除搜索
const clearSearch = () => {
  searchKeyword.value = ''
  currentPage.value = 1
}

// 导出数据到Excel
const exportToExcel = () => {
  try {
    // 准备导出的数据 - 简化版本
    const exportData = sortedApiKeys.value.map((key) => {
      // 获取当前时间段的数据
      const periodRequests = getPeriodRequests(key)
      const periodCost = calculatePeriodCost(key)
      const periodTokens = getPeriodTokens(key)
      const periodInputTokens = getPeriodInputTokens(key)
      const periodOutputTokens = getPeriodOutputTokens(key)

      // 基础数据
      const baseData = {
        ID: key.id || '',
        名称: key.name || '',
        描述: key.description || '',
        状态: key.isActive ? '启用' : '禁用',
        API密钥: key.apiKey || '',

        // 过期配置
        过期模式:
          key.expirationMode === 'activation'
            ? '首次使用后激活'
            : key.expirationMode === 'fixed'
              ? '固定时间'
              : '无',
        激活期限: key.activationDays || '',
        激活单位:
          key.activationUnit === 'hours' ? '小时' : key.activationUnit === 'days' ? '天' : '',
        已激活: key.isActivated ? '是' : '否',
        激活时间: key.activatedAt ? formatDate(key.activatedAt) : '',
        过期时间: key.expiresAt ? formatDate(key.expiresAt) : '',

        // 权限配置
        服务权限:
          key.permissions === 'all'
            ? '全部服务'
            : key.permissions === 'claude'
              ? '仅Claude'
              : key.permissions === 'gemini'
                ? '仅Gemini'
                : key.permissions === 'openai'
                  ? '仅OpenAI'
                  : key.permissions === 'droid'
                    ? '仅Droid'
                    : key.permissions || '',

        // 限制配置
        令牌限制: key.tokenLimit === '0' || key.tokenLimit === 0 ? '无限制' : key.tokenLimit || '',
        并发限制:
          key.concurrencyLimit === '0' || key.concurrencyLimit === 0
            ? '无限制'
            : key.concurrencyLimit || '',
        '速率窗口(分钟)':
          key.rateLimitWindow === '0' || key.rateLimitWindow === 0
            ? '无限制'
            : key.rateLimitWindow || '',
        速率请求限制:
          key.rateLimitRequests === '0' || key.rateLimitRequests === 0
            ? '无限制'
            : key.rateLimitRequests || '',
        '日费用限制($)':
          key.dailyCostLimit === '0' || key.dailyCostLimit === 0
            ? '无限制'
            : `$${key.dailyCostLimit}` || '',
        '总费用限制($)':
          key.totalCostLimit === '0' || key.totalCostLimit === 0
            ? '无限制'
            : `$${key.totalCostLimit}` || '',

        // 账户绑定
        Claude专属账户: key.claudeAccountId || '',
        Claude控制台账户: key.claudeConsoleAccountId || '',
        Gemini专属账户: key.geminiAccountId || '',
        OpenAI专属账户: key.openaiAccountId || '',
        'Azure OpenAI专属账户': key.azureOpenaiAccountId || '',
        Bedrock专属账户: key.bedrockAccountId || '',
        Droid专属账户: key.droidAccountId || '',

        // 模型和客户端限制
        启用模型限制: key.enableModelRestriction ? '是' : '否',
        限制的模型:
          key.restrictedModels && key.restrictedModels.length > 0
            ? key.restrictedModels.join('; ')
            : '',
        启用客户端限制: key.enableClientRestriction ? '是' : '否',
        允许的客户端:
          key.allowedClients && key.allowedClients.length > 0 ? key.allowedClients.join('; ') : '',

        // 创建信息
        创建时间: key.createdAt ? formatDate(key.createdAt) : '',
        创建者: key.createdBy || '',
        用户ID: key.userId || '',
        用户名: key.userUsername || '',

        // 使用统计
        标签: key.tags && key.tags.length > 0 ? key.tags.join(', ') : '无',
        请求总数: periodRequests,
        '总费用($)': periodCost.toFixed(2),
        Token数: formatTokenCount(periodTokens),
        输入Token: formatTokenCount(periodInputTokens),
        输出Token: formatTokenCount(periodOutputTokens),
        最后使用时间: key.lastUsedAt ? formatDate(key.lastUsedAt) : '从未使用',
        最后使用账号: getLastUsageFullName(key),
        最后使用类型: getLastUsageTypeLabel(key)
      }

      // 添加分模型统计
      const modelStats = {}

      // 根据当前时间筛选条件获取对应的模型统计
      let modelsData = null

      if (globalDateFilter.preset === 'today') {
        modelsData = key.usage?.daily?.models
      } else if (globalDateFilter.preset === '7days') {
        modelsData = key.usage?.weekly?.models
      } else if (globalDateFilter.preset === '30days') {
        modelsData = key.usage?.monthly?.models
      } else if (globalDateFilter.preset === 'all') {
        modelsData = key.usage?.total?.models
      }

      // 处理模型统计
      if (modelsData) {
        Object.entries(modelsData).forEach(([model, stats]) => {
          // 简化模型名称，去掉前缀
          let modelName = model
          if (model.includes(':')) {
            modelName = model.split(':').pop() // 取最后一部分
          }
          modelName = modelName.replace(/[:/]/g, '_')

          modelStats[`${modelName}_请求数`] = stats.requests || 0
          modelStats[`${modelName}_费用($)`] = (stats.cost || 0).toFixed(2)
          modelStats[`${modelName}_Token`] = formatTokenCount(stats.totalTokens || 0)
          modelStats[`${modelName}_输入Token`] = formatTokenCount(stats.inputTokens || 0)
          modelStats[`${modelName}_输出Token`] = formatTokenCount(stats.outputTokens || 0)
        })
      }

      return { ...baseData, ...modelStats }
    })

    // 创建工作簿
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(exportData)

    // 获取工作表范围
    const range = XLSX.utils.decode_range(ws['!ref'])

    // 设置列宽
    const headers = Object.keys(exportData[0] || {})
    const columnWidths = headers.map((header) => {
      // 基本信息字段
      if (header === 'ID') return { wch: 40 }
      if (header === '名称') return { wch: 25 }
      if (header === '描述') return { wch: 30 }
      if (header === 'API密钥') return { wch: 45 }
      if (header === '标签') return { wch: 20 }

      // 时间字段
      if (header.includes('时间')) return { wch: 20 }

      // 限制字段
      if (header.includes('限制')) return { wch: 15 }
      if (header.includes('费用')) return { wch: 15 }
      if (header.includes('Token')) return { wch: 15 }
      if (header.includes('请求')) return { wch: 12 }

      // 账户绑定字段
      if (header.includes('账户')) return { wch: 30 }

      // 权限配置字段
      if (header.includes('权限') || header.includes('模型') || header.includes('客户端'))
        return { wch: 20 }

      // 激活配置字段
      if (header.includes('激活') || header.includes('过期')) return { wch: 18 }

      // 默认宽度
      return { wch: 15 }
    })
    ws['!cols'] = columnWidths

    // 应用样式到标题行
    for (let C = range.s.c; C <= range.e.c; ++C) {
      const cellAddress = XLSX.utils.encode_cell({ r: 0, c: C })
      if (!ws[cellAddress]) continue

      const header = headers[C]
      const isModelColumn = header && header.includes('_')

      ws[cellAddress].s = {
        fill: {
          fgColor: { rgb: isModelColumn ? '70AD47' : '4472C4' }
        },
        font: {
          color: { rgb: 'FFFFFF' },
          bold: true,
          sz: 12
        },
        alignment: {
          horizontal: 'center',
          vertical: 'center'
        },
        border: {
          top: { style: 'thin', color: { rgb: '2F5597' } },
          bottom: { style: 'thin', color: { rgb: '2F5597' } },
          left: { style: 'thin', color: { rgb: '2F5597' } },
          right: { style: 'thin', color: { rgb: '2F5597' } }
        }
      }
    }

    // 应用样式到数据行
    for (let R = 1; R <= range.e.r; ++R) {
      for (let C = range.s.c; C <= range.e.c; ++C) {
        const cellAddress = XLSX.utils.encode_cell({ r: R, c: C })
        if (!ws[cellAddress]) continue

        const header = headers[C]
        const value = ws[cellAddress].v

        // 基础样式
        const cellStyle = {
          font: { sz: 11 },
          border: {
            top: { style: 'thin', color: { rgb: 'D3D3D3' } },
            bottom: { style: 'thin', color: { rgb: 'D3D3D3' } },
            left: { style: 'thin', color: { rgb: 'D3D3D3' } },
            right: { style: 'thin', color: { rgb: 'D3D3D3' } }
          }
        }

        // 偶数行背景色
        if (R % 2 === 0) {
          cellStyle.fill = { fgColor: { rgb: 'F2F2F2' } }
        }

        // 根据列类型设置对齐和特殊样式
        if (header === '名称') {
          cellStyle.alignment = { horizontal: 'left', vertical: 'center' }
        } else if (header === '标签') {
          cellStyle.alignment = { horizontal: 'left', vertical: 'center' }
          if (value === '无') {
            cellStyle.font = { ...cellStyle.font, color: { rgb: '999999' }, italic: true }
          }
        } else if (header === '最后使用时间') {
          cellStyle.alignment = { horizontal: 'right', vertical: 'center' }
          if (value === '从未使用') {
            cellStyle.font = { ...cellStyle.font, color: { rgb: '999999' }, italic: true }
          }
        } else if (header && header.includes('费用')) {
          cellStyle.alignment = { horizontal: 'right', vertical: 'center' }
          cellStyle.font = { ...cellStyle.font, color: { rgb: '0066CC' }, bold: true }
        } else if (header && (header.includes('Token') || header.includes('请求'))) {
          cellStyle.alignment = { horizontal: 'right', vertical: 'center' }
        }

        ws[cellAddress].s = cellStyle
      }
    }

    XLSX.utils.book_append_sheet(wb, ws, '用量统计')

    // 生成文件名（包含时间戳和筛选条件）
    const now = new Date()
    const timestamp =
      now.getFullYear() +
      String(now.getMonth() + 1).padStart(2, '0') +
      String(now.getDate()).padStart(2, '0') +
      '_' +
      String(now.getHours()).padStart(2, '0') +
      String(now.getMinutes()).padStart(2, '0') +
      String(now.getSeconds()).padStart(2, '0')

    let timeRangeLabel = ''
    if (globalDateFilter.type === 'preset') {
      const presetLabels = {
        today: '今日',
        '7days': '最近7天',
        '30days': '最近30天',
        all: '全部时间'
      }
      timeRangeLabel = presetLabels[globalDateFilter.preset] || globalDateFilter.preset
    } else {
      timeRangeLabel = '自定义时间'
    }

    const filename = `API_Keys_用量统计_${timeRangeLabel}_${timestamp}.xlsx`

    // 导出文件
    XLSX.writeFile(wb, filename)

    showToast(`成功导出 ${exportData.length} 条API Key用量数据`, 'success')
  } catch (error) {
    // console.error('导出失败:', error)
    showToast('导出失败，请重试', 'error')
  }
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

// 监听搜索模式变化，重置分页并更新选中状态
watch(searchMode, () => {
  currentPage.value = 1
  updateSelectAllState()
})

// 监听分页变化，更新全选状态
watch([currentPage, pageSize], () => {
  updateSelectAllState()
})

// 监听每页显示条数变化，保存到 localStorage
watch(pageSize, (newSize) => {
  localStorage.setItem('apiKeysPageSize', newSize.toString())
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

.table-wrapper {
  overflow: hidden;
  border-radius: 12px;
  border: 1px solid rgba(0, 0, 0, 0.05);
  width: 100%;
  position: relative;
}

.table-container {
  overflow-x: auto;
  overflow-y: hidden;
  margin: 0;
  padding: 0;
  max-width: 100%;
  position: relative;
}

/* 防止表格内容溢出，保证横向滚动 */
.table-container table {
  min-width: 1200px;
  border-collapse: collapse;
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

.table-row {
  transition: background-color 0.2s ease;
}

.table-row:hover {
  background-color: rgba(0, 0, 0, 0.02);
}

.dark .table-row:hover {
  background-color: rgba(255, 255, 255, 0.02);
}

/* 固定操作列在右侧，兼容浅色和深色模式 */
.operations-column {
  position: sticky;
  right: 0;
  background: inherit;
  background-color: inherit;
  z-index: 12;
}

.table-container thead .operations-column {
  z-index: 30;
}

.table-container tbody .operations-column {
  box-shadow: -8px 0 12px -8px rgba(15, 23, 42, 0.16);
}

.dark .table-container tbody .operations-column {
  box-shadow: -8px 0 12px -8px rgba(30, 41, 59, 0.45);
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

/* 自定义日期范围选择器高度对齐 */
.custom-date-range-picker :deep(.el-input__wrapper) {
  @apply h-[38px] rounded-lg border border-gray-200 bg-white shadow-sm transition-all duration-200 hover:border-gray-300 hover:shadow-md dark:border-gray-600 dark:bg-gray-800;
}
.custom-date-range-picker :deep(.el-input__inner) {
  @apply h-full py-2 text-sm font-medium text-gray-700 dark:text-gray-200;
}
.custom-date-range-picker :deep(.el-input__prefix),
.custom-date-range-picker :deep(.el-input__suffix) {
  @apply flex items-center;
}
.custom-date-range-picker :deep(.el-range-separator) {
  @apply mx-2 text-gray-500;
}
</style>
