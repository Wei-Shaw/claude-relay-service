<template>
  <div class="accounts-container">
    <div class="card p-4 sm:p-6">
      <div class="mb-4 flex flex-col gap-4 sm:mb-6">
        <div>
          <h3 class="mb-1 text-lg font-bold text-gray-900 dark:text-gray-100 sm:mb-2 sm:text-xl">
            账户管理
          </h3>
          <p class="text-sm text-gray-600 dark:text-gray-400 sm:text-base">
            管理 Claude、Gemini、OpenAI 等账户与代理配置
          </p>
        </div>
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <!-- 筛选器组 -->
          <div class="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
            <!-- 排序选择器 -->
            <div class="group relative min-w-[160px]">
              <div
                class="absolute -inset-0.5 rounded-lg bg-gradient-to-r from-indigo-500 to-blue-500 opacity-0 blur transition duration-300 group-hover:opacity-20"
              ></div>
              <CustomDropdown
                v-model="accountSortBy"
                icon="fa-sort-amount-down"
                icon-color="text-indigo-500"
                :options="sortOptions"
                placeholder="选择排序"
                @change="sortAccounts()"
              />
            </div>

            <!-- 平台筛选器 -->
            <div class="group relative min-w-[140px]">
              <div
                class="absolute -inset-0.5 rounded-lg bg-gradient-to-r from-blue-500 to-indigo-500 opacity-0 blur transition duration-300 group-hover:opacity-20"
              ></div>
              <CustomDropdown
                v-model="platformFilter"
                icon="fa-server"
                icon-color="text-blue-500"
                :options="platformOptions"
                placeholder="选择平台"
                @change="filterByPlatform"
              />
            </div>

            <!-- 分组筛选器 -->
            <div class="group relative min-w-[160px]">
              <div
                class="absolute -inset-0.5 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 opacity-0 blur transition duration-300 group-hover:opacity-20"
              ></div>
              <CustomDropdown
                v-model="groupFilter"
                icon="fa-layer-group"
                icon-color="text-purple-500"
                :options="groupOptions"
                placeholder="选择分组"
                @change="filterByGroup"
              />
            </div>

            <!-- 搜索框 -->
            <div class="group relative min-w-[200px]">
              <div
                class="absolute -inset-0.5 rounded-lg bg-gradient-to-r from-cyan-500 to-teal-500 opacity-0 blur transition duration-300 group-hover:opacity-20"
              ></div>
              <div class="relative flex items-center">
                <input
                  v-model="searchKeyword"
                  class="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 pl-9 text-sm text-gray-700 placeholder-gray-400 shadow-sm transition-all duration-200 hover:border-gray-300 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:placeholder-gray-500 dark:hover:border-gray-500"
                  placeholder="搜索账户名称..."
                  type="text"
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

          <div class="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center sm:gap-3">
            <!-- 刷新按钮 -->
            <div class="relative">
              <el-tooltip
                content="刷新数据 (Ctrl/⌘+点击强制刷新所有缓存)"
                effect="dark"
                placement="bottom"
              >
                <button
                  class="group relative flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-all duration-200 hover:border-gray-300 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:border-gray-500 sm:w-auto"
                  :disabled="accountsLoading"
                  @click.ctrl.exact="loadAccounts(true)"
                  @click.exact="loadAccounts(false)"
                  @click.meta.exact="loadAccounts(true)"
                >
                  <div
                    class="absolute -inset-0.5 rounded-lg bg-gradient-to-r from-green-500 to-teal-500 opacity-0 blur transition duration-300 group-hover:opacity-20"
                  ></div>
                  <i
                    :class="[
                      'fas relative text-green-500',
                      accountsLoading ? 'fa-spinner fa-spin' : 'fa-sync-alt'
                    ]"
                  />
                  <span class="relative">刷新</span>
                </button>
              </el-tooltip>
            </div>

            <!-- 选择/取消选择按钮 -->
            <button
              class="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-all duration-200 hover:border-gray-300 hover:bg-gray-50 hover:shadow-md dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
              @click="toggleSelectionMode"
            >
              <i :class="showCheckboxes ? 'fas fa-times' : 'fas fa-check-square'"></i>
              <span>{{ showCheckboxes ? '取消选择' : '选择' }}</span>
            </button>

            <!-- 批量删除按钮 -->
            <button
              v-if="selectedAccounts.length > 0"
              class="group relative flex items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 shadow-sm transition-all duration-200 hover:border-red-300 hover:bg-red-100 hover:shadow-md dark:border-red-700 dark:bg-red-900/30 dark:text-red-300 dark:hover:bg-red-900/50 sm:w-auto"
              @click="batchDeleteAccounts"
            >
              <div
                class="absolute -inset-0.5 rounded-lg bg-gradient-to-r from-red-500 to-pink-500 opacity-0 blur transition duration-300 group-hover:opacity-20"
              ></div>
              <i class="fas fa-trash relative text-red-600 dark:text-red-400" />
              <span class="relative">删除选中 ({{ selectedAccounts.length }})</span>
            </button>

            <!-- 添加账户按钮 -->
            <button
              class="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-green-500 to-green-600 px-5 py-2.5 text-sm font-medium text-white shadow-md transition-all duration-200 hover:from-green-600 hover:to-green-700 hover:shadow-lg sm:w-auto"
              @click.stop="openCreateAccountModal"
            >
              <i class="fas fa-plus"></i>
              <span>添加账户</span>
            </button>
          </div>
        </div>
      </div>

      <div v-if="accountsLoading" class="py-12 text-center">
        <div class="loading-spinner mx-auto mb-4" />
        <p class="text-gray-500 dark:text-gray-400">正在加载账户...</p>
      </div>

      <div v-else-if="sortedAccounts.length === 0" class="py-12 text-center">
        <div
          class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700"
        >
          <i class="fas fa-user-circle text-xl text-gray-400" />
        </div>
        <p class="text-lg text-gray-500 dark:text-gray-400">暂无账户</p>
        <p class="mt-2 text-sm text-gray-400 dark:text-gray-500">点击上方按钮添加您的第一个账户</p>
      </div>

      <!-- 桌面端表格视图 -->
      <div v-else class="table-container hidden md:block">
        <table class="w-full table-fixed">
          <thead class="bg-gray-50/80 backdrop-blur-sm dark:bg-gray-700/80">
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
                class="w-[22%] min-w-[180px] cursor-pointer px-3 py-4 text-left text-xs font-bold uppercase tracking-wider text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-600"
                @click="sortAccounts('name')"
              >
                名称
                <i
                  v-if="accountsSortBy === 'name'"
                  :class="[
                    'fas',
                    accountsSortOrder === 'asc' ? 'fa-sort-up' : 'fa-sort-down',
                    'ml-1'
                  ]"
                />
                <i v-else class="fas fa-sort ml-1 text-gray-400" />
              </th>
              <th
                class="w-[15%] min-w-[120px] cursor-pointer px-3 py-4 text-left text-xs font-bold uppercase tracking-wider text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-600"
                @click="sortAccounts('platform')"
              >
                平台/类型
                <i
                  v-if="accountsSortBy === 'platform'"
                  :class="[
                    'fas',
                    accountsSortOrder === 'asc' ? 'fa-sort-up' : 'fa-sort-down',
                    'ml-1'
                  ]"
                />
                <i v-else class="fas fa-sort ml-1 text-gray-400" />
              </th>
              <th
                class="w-[12%] min-w-[110px] cursor-pointer px-3 py-4 text-left text-xs font-bold uppercase tracking-wider text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-600"
                @click="sortAccounts('expiresAt')"
              >
                到期时间
                <i
                  v-if="accountsSortBy === 'expiresAt'"
                  :class="[
                    'fas',
                    accountsSortOrder === 'asc' ? 'fa-sort-up' : 'fa-sort-down',
                    'ml-1'
                  ]"
                />
                <i v-else class="fas fa-sort ml-1 text-gray-400" />
              </th>
              <th
                class="w-[12%] min-w-[100px] cursor-pointer px-3 py-4 text-left text-xs font-bold uppercase tracking-wider text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-600"
                @click="sortAccounts('status')"
              >
                状态
                <i
                  v-if="accountsSortBy === 'status'"
                  :class="[
                    'fas',
                    accountsSortOrder === 'asc' ? 'fa-sort-up' : 'fa-sort-down',
                    'ml-1'
                  ]"
                />
                <i v-else class="fas fa-sort ml-1 text-gray-400" />
              </th>
              <th
                class="w-[8%] min-w-[80px] cursor-pointer px-3 py-4 text-left text-xs font-bold uppercase tracking-wider text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-600"
                @click="sortAccounts('priority')"
              >
                优先级
                <i
                  v-if="accountsSortBy === 'priority'"
                  :class="[
                    'fas',
                    accountsSortOrder === 'asc' ? 'fa-sort-up' : 'fa-sort-down',
                    'ml-1'
                  ]"
                />
                <i v-else class="fas fa-sort ml-1 text-gray-400" />
              </th>
              <th
                class="w-[10%] min-w-[100px] px-3 py-4 text-left text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300"
              >
                代理
              </th>
              <th
                class="w-[10%] min-w-[90px] px-3 py-4 text-left text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300"
              >
                今日使用
              </th>
              <th
                class="w-[10%] min-w-[100px] px-3 py-4 text-left text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300"
              >
                <div class="flex items-center gap-2">
                  <span>会话窗口</span>
                  <el-tooltip placement="top">
                    <template #content>
                      <div
                        class="w-[260px] space-y-3 text-xs leading-relaxed text-white dark:text-gray-800"
                      >
                        <div class="space-y-2">
                          <div class="text-sm font-semibold text-white dark:text-gray-900">
                            Claude 系列
                          </div>
                          <div class="text-gray-200 dark:text-gray-600">
                            会话窗口进度表示 5 小时窗口的时间推移，颜色提示当前调度状态。
                          </div>
                          <div class="space-y-1 pt-1 text-gray-200 dark:text-gray-600">
                            <div class="flex items-center gap-2">
                              <div
                                class="h-2 w-16 rounded bg-gradient-to-r from-blue-500 to-indigo-600"
                              ></div>
                              <span class="font-medium text-white dark:text-gray-900"
                                >正常：请求正常处理</span
                              >
                            </div>
                            <div class="flex items-center gap-2">
                              <div
                                class="h-2 w-16 rounded bg-gradient-to-r from-yellow-500 to-orange-500"
                              ></div>
                              <span class="font-medium text-white dark:text-gray-900"
                                >警告：接近限制</span
                              >
                            </div>
                            <div class="flex items-center gap-2">
                              <div
                                class="h-2 w-16 rounded bg-gradient-to-r from-red-500 to-red-600"
                              ></div>
                              <span class="font-medium text-white dark:text-gray-900"
                                >拒绝：达到速率限制</span
                              >
                            </div>
                          </div>
                        </div>
                        <div class="h-px bg-gray-200 dark:bg-gray-600/50"></div>
                        <div class="space-y-2">
                          <div class="text-sm font-semibold text-white dark:text-gray-900">
                            OpenAI
                          </div>
                          <div class="text-gray-200 dark:text-gray-600">
                            进度条分别展示 5h 与周限窗口的额度使用比例，颜色含义与上方保持一致。
                          </div>
                          <div class="space-y-1 text-gray-200 dark:text-gray-600">
                            <div class="flex items-start gap-2">
                              <i class="fas fa-clock mt-[2px] text-[10px] text-blue-500"></i>
                              <span class="font-medium text-white dark:text-gray-900"
                                >5h 窗口：5小时使用量进度，到达重置时间后会自动归零。</span
                              >
                            </div>
                            <div class="flex items-start gap-2">
                              <i class="fas fa-history mt-[2px] text-[10px] text-emerald-500"></i>
                              <span class="font-medium text-white dark:text-gray-900"
                                >周限窗口：7天使用量进度，重置时同样回到 0%。</span
                              >
                            </div>
                            <div class="flex items-start gap-2">
                              <i
                                class="fas fa-info-circle mt-[2px] text-[10px] text-indigo-500"
                              ></i>
                              <span class="font-medium text-white dark:text-gray-900"
                                >当“重置剩余”为 0 时，进度条与百分比会同步清零。</span
                              >
                            </div>
                          </div>
                        </div>
                        <div class="h-px bg-gray-200 dark:bg-gray-600/50"></div>
                        <div class="space-y-2">
                          <div class="text-sm font-semibold text-white dark:text-gray-900">
                            Claude OAuth 账户
                          </div>
                          <div class="text-gray-200 dark:text-gray-600">
                            展示三个窗口的使用率（utilization百分比），颜色含义同上。
                          </div>
                          <div class="space-y-1 text-gray-200 dark:text-gray-600">
                            <div class="flex items-start gap-2">
                              <i class="fas fa-clock mt-[2px] text-[10px] text-indigo-500"></i>
                              <span class="font-medium text-white dark:text-gray-900"
                                >5h 窗口：5小时滑动窗口的使用率。</span
                              >
                            </div>
                            <div class="flex items-start gap-2">
                              <i
                                class="fas fa-calendar-alt mt-[2px] text-[10px] text-emerald-500"
                              ></i>
                              <span class="font-medium text-white dark:text-gray-900"
                                >7d 窗口：7天总限额的使用率。</span
                              >
                            </div>
                            <div class="flex items-start gap-2">
                              <i class="fas fa-gem mt-[2px] text-[10px] text-purple-500"></i>
                              <span class="font-medium text-white dark:text-gray-900"
                                >Opus 窗口：7天Opus模型专用限额。</span
                              >
                            </div>
                            <div class="flex items-start gap-2">
                              <i class="fas fa-sync-alt mt-[2px] text-[10px] text-blue-500"></i>
                              <span class="font-medium text-white dark:text-gray-900"
                                >到达重置时间后自动归零。</span
                              >
                            </div>
                          </div>
                        </div>
                      </div>
                    </template>
                    <i
                      class="fas fa-question-circle cursor-help text-xs text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-400"
                    />
                  </el-tooltip>
                </div>
              </th>
              <th
                class="w-[8%] min-w-[80px] px-3 py-4 text-left text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300"
              >
                最后使用
              </th>
              <th
                class="w-[15%] min-w-[180px] px-3 py-4 text-left text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300"
              >
                操作
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200/50 dark:divide-gray-600/50">
            <tr v-for="account in paginatedAccounts" :key="account.id" class="table-row">
              <td v-if="shouldShowCheckboxes" class="px-3 py-3">
                <div class="flex items-center">
                  <input
                    v-model="selectedAccounts"
                    class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    type="checkbox"
                    :value="account.id"
                    @change="updateSelectAllState"
                  />
                </div>
              </td>
              <td class="px-3 py-4">
                <div class="flex items-center">
                  <div
                    class="mr-2 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-green-500 to-green-600"
                  >
                    <i class="fas fa-user-circle text-xs text-white" />
                  </div>
                  <div class="min-w-0">
                    <div class="flex items-center gap-2">
                      <div
                        class="truncate text-sm font-semibold text-gray-900 dark:text-gray-100"
                        :title="account.name"
                      >
                        {{ account.name }}
                      </div>
                      <span
                        v-if="account.accountType === 'dedicated'"
                        class="inline-flex items-center rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-800"
                      >
                        <i class="fas fa-lock mr-1" />专属
                      </span>
                      <span
                        v-else-if="account.accountType === 'group'"
                        class="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800"
                      >
                        <i class="fas fa-layer-group mr-1" />分组调度
                      </span>
                      <span
                        v-else
                        class="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800"
                      >
                        <i class="fas fa-share-alt mr-1" />共享
                      </span>
                    </div>
                    <!-- 显示所有分组 - 换行显示 -->
                    <div
                      v-if="account.groupInfos && account.groupInfos.length > 0"
                      class="my-2 flex flex-wrap items-center gap-2"
                    >
                      <span
                        v-for="group in account.groupInfos"
                        :key="group.id"
                        class="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-400"
                        :title="`所属分组: ${group.name}`"
                      >
                        <i class="fas fa-folder mr-1" />{{ group.name }}
                      </span>
                    </div>
                    <div
                      class="truncate text-xs text-gray-500 dark:text-gray-400"
                      :title="account.id"
                    >
                      {{ account.id }}
                    </div>
                  </div>
                </div>
              </td>
              <td class="px-3 py-4">
                <div class="flex items-center gap-1">
                  <!-- 平台图标和名称 -->
                  <div
                    v-if="account.platform === 'gemini'"
                    class="flex items-center gap-1.5 rounded-lg border border-yellow-200 bg-gradient-to-r from-yellow-100 to-amber-100 px-2.5 py-1"
                  >
                    <i class="fas fa-robot text-xs text-yellow-700" />
                    <span class="text-xs font-semibold text-yellow-800">Gemini</span>
                    <span class="mx-1 h-4 w-px bg-yellow-300" />
                    <span class="text-xs font-medium text-yellow-700">
                      {{ getGeminiAuthType() }}
                    </span>
                  </div>
                  <div
                    v-else-if="account.platform === 'claude-console'"
                    class="flex items-center gap-1.5 rounded-lg border border-purple-200 bg-gradient-to-r from-purple-100 to-pink-100 px-2.5 py-1"
                  >
                    <i class="fas fa-terminal text-xs text-purple-700" />
                    <span class="text-xs font-semibold text-purple-800">Console</span>
                    <span class="mx-1 h-4 w-px bg-purple-300" />
                    <span class="text-xs font-medium text-purple-700">API Key</span>
                  </div>
                  <div
                    v-else-if="account.platform === 'bedrock'"
                    class="flex items-center gap-1.5 rounded-lg border border-orange-200 bg-gradient-to-r from-orange-100 to-red-100 px-2.5 py-1"
                  >
                    <i class="fab fa-aws text-xs text-orange-700" />
                    <span class="text-xs font-semibold text-orange-800">Bedrock</span>
                    <span class="mx-1 h-4 w-px bg-orange-300" />
                    <span class="text-xs font-medium text-orange-700">AWS</span>
                  </div>
                  <div
                    v-else-if="account.platform === 'openai'"
                    class="flex items-center gap-1.5 rounded-lg border border-gray-700 bg-gray-100 bg-gradient-to-r from-gray-100 to-gray-100 px-2.5 py-1"
                  >
                    <div class="fa-openai" />
                    <span class="text-xs font-semibold text-gray-950">OpenAi</span>
                    <span class="mx-1 h-4 w-px bg-gray-400" />
                    <span class="text-xs font-medium text-gray-950">{{ getOpenAIAuthType() }}</span>
                  </div>
                  <div
                    v-else-if="account.platform === 'azure_openai'"
                    class="flex items-center gap-1.5 rounded-lg border border-blue-200 bg-gradient-to-r from-blue-100 to-cyan-100 px-2.5 py-1 dark:border-blue-700 dark:from-blue-900/20 dark:to-cyan-900/20"
                  >
                    <i class="fab fa-microsoft text-xs text-blue-700 dark:text-blue-400" />
                    <span class="text-xs font-semibold text-blue-800 dark:text-blue-300"
                      >Azure OpenAI</span
                    >
                    <span class="mx-1 h-4 w-px bg-blue-300 dark:bg-blue-600" />
                    <span class="text-xs font-medium text-blue-700 dark:text-blue-400"
                      >API Key</span
                    >
                  </div>
                  <div
                    v-else-if="account.platform === 'openai-responses'"
                    class="flex items-center gap-1.5 rounded-lg border border-teal-200 bg-gradient-to-r from-teal-100 to-green-100 px-2.5 py-1 dark:border-teal-700 dark:from-teal-900/20 dark:to-green-900/20"
                  >
                    <i class="fas fa-server text-xs text-teal-700 dark:text-teal-400" />
                    <span class="text-xs font-semibold text-teal-800 dark:text-teal-300"
                      >OpenAI-Responses</span
                    >
                    <span class="mx-1 h-4 w-px bg-teal-300 dark:bg-teal-600" />
                    <span class="text-xs font-medium text-teal-700 dark:text-teal-400"
                      >API Key</span
                    >
                  </div>
                  <div
                    v-else-if="account.platform === 'claude' || account.platform === 'claude-oauth'"
                    class="flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-gradient-to-r from-indigo-100 to-blue-100 px-2.5 py-1"
                  >
                    <i class="fas fa-brain text-xs text-indigo-700" />
                    <span class="text-xs font-semibold text-indigo-800">{{
                      getClaudeAccountType(account)
                    }}</span>
                    <span class="mx-1 h-4 w-px bg-indigo-300" />
                    <span class="text-xs font-medium text-indigo-700">
                      {{ getClaudeAuthType(account) }}
                    </span>
                  </div>
                  <div
                    v-else-if="account.platform === 'ccr'"
                    class="flex items-center gap-1.5 rounded-lg border border-teal-200 bg-gradient-to-r from-teal-100 to-emerald-100 px-2.5 py-1 dark:border-teal-700 dark:from-teal-900/20 dark:to-emerald-900/20"
                  >
                    <i class="fas fa-code-branch text-xs text-teal-700 dark:text-teal-400" />
                    <span class="text-xs font-semibold text-teal-800 dark:text-teal-300">CCR</span>
                    <span class="mx-1 h-4 w-px bg-teal-300 dark:bg-teal-600" />
                    <span class="text-xs font-medium text-teal-700 dark:text-teal-300">Relay</span>
                  </div>
                  <div
                    v-else-if="account.platform === 'droid'"
                    class="flex items-center gap-1.5 rounded-lg border border-cyan-200 bg-gradient-to-r from-cyan-100 to-sky-100 px-2.5 py-1 dark:border-cyan-700 dark:from-cyan-900/20 dark:to-sky-900/20"
                  >
                    <i class="fas fa-robot text-xs text-cyan-700 dark:text-cyan-400" />
                    <span class="text-xs font-semibold text-cyan-800 dark:text-cyan-300"
                      >Droid</span
                    >
                    <span class="mx-1 h-4 w-px bg-cyan-300 dark:bg-cyan-600" />
                    <span class="text-xs font-medium text-cyan-700 dark:text-cyan-300">
                      {{ getDroidAuthType(account) }}
                    </span>
                    <span
                      v-if="isDroidApiKeyMode(account)"
                      :class="getDroidApiKeyBadgeClasses(account)"
                    >
                      <i class="fas fa-key text-[9px]" />
                      <span>x{{ getDroidApiKeyCount(account) }}</span>
                    </span>
                  </div>
                  <div
                    v-else-if="account.platform === 'gemini-api'"
                    class="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-gradient-to-r from-amber-100 to-yellow-100 px-2.5 py-1 dark:border-amber-700 dark:from-amber-900/20 dark:to-yellow-900/20"
                  >
                    <i class="fas fa-robot text-xs text-amber-700 dark:text-amber-400" />
                    <span class="text-xs font-semibold text-amber-800 dark:text-amber-300"
                      >Gemini-API</span
                    >
                    <span class="mx-1 h-4 w-px bg-amber-300 dark:bg-amber-600" />
                    <span class="text-xs font-medium text-amber-700 dark:text-amber-400"
                      >API Key</span
                    >
                  </div>
                  <div
                    v-else
                    class="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gradient-to-r from-gray-100 to-gray-200 px-2.5 py-1"
                  >
                    <i class="fas fa-question text-xs text-gray-700" />
                    <span class="text-xs font-semibold text-gray-800">未知</span>
                  </div>
                </div>
              </td>
              <td class="whitespace-nowrap px-3 py-4">
                <div class="flex flex-col gap-1">
                  <!-- 已设置过期时间 -->
                  <span v-if="account.expiresAt">
                    <span
                      v-if="isExpired(account.expiresAt)"
                      class="inline-flex cursor-pointer items-center text-red-600 hover:underline"
                      style="font-size: 13px"
                      @click.stop="startEditAccountExpiry(account)"
                    >
                      <i class="fas fa-exclamation-circle mr-1 text-xs" />
                      已过期
                    </span>
                    <span
                      v-else-if="isExpiringSoon(account.expiresAt)"
                      class="inline-flex cursor-pointer items-center text-orange-600 hover:underline"
                      style="font-size: 13px"
                      @click.stop="startEditAccountExpiry(account)"
                    >
                      <i class="fas fa-clock mr-1 text-xs" />
                      {{ formatExpireDate(account.expiresAt) }}
                    </span>
                    <span
                      v-else
                      class="cursor-pointer text-gray-600 hover:underline dark:text-gray-400"
                      style="font-size: 13px"
                      @click.stop="startEditAccountExpiry(account)"
                    >
                      {{ formatExpireDate(account.expiresAt) }}
                    </span>
                  </span>
                  <!-- 永不过期 -->
                  <span
                    v-else
                    class="inline-flex cursor-pointer items-center text-gray-400 hover:underline dark:text-gray-500"
                    style="font-size: 13px"
                    @click.stop="startEditAccountExpiry(account)"
                  >
                    <i class="fas fa-infinity mr-1 text-xs" />
                    永不过期
                  </span>
                </div>
              </td>
              <td class="whitespace-nowrap px-3 py-4">
                <div class="flex flex-col gap-1">
                  <span
                    :class="[
                      'inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold',
                      account.status === 'blocked'
                        ? 'bg-orange-100 text-orange-800'
                        : account.status === 'unauthorized'
                          ? 'bg-red-100 text-red-800'
                          : account.status === 'temp_error'
                            ? 'bg-orange-100 text-orange-800'
                            : account.isActive
                              ? 'bg-green-100 text-green-800'
                              : 'bg-red-100 text-red-800'
                    ]"
                  >
                    <div
                      :class="[
                        'mr-2 h-2 w-2 rounded-full',
                        account.status === 'blocked'
                          ? 'bg-orange-500'
                          : account.status === 'unauthorized'
                            ? 'bg-red-500'
                            : account.status === 'temp_error'
                              ? 'bg-orange-500'
                              : account.isActive
                                ? 'bg-green-500'
                                : 'bg-red-500'
                      ]"
                    />
                    {{
                      account.status === 'blocked'
                        ? '已封锁'
                        : account.status === 'unauthorized'
                          ? '异常'
                          : account.status === 'temp_error'
                            ? '临时异常'
                            : account.isActive
                              ? '正常'
                              : '异常'
                    }}
                  </span>
                  <span
                    v-if="
                      (account.rateLimitStatus && account.rateLimitStatus.isRateLimited) ||
                      account.rateLimitStatus === 'limited'
                    "
                    class="inline-flex items-center rounded-full bg-yellow-100 px-3 py-1 text-xs font-semibold text-yellow-800"
                  >
                    <i class="fas fa-exclamation-triangle mr-1" />
                    限流中
                    <span
                      v-if="
                        account.rateLimitStatus &&
                        typeof account.rateLimitStatus === 'object' &&
                        account.rateLimitStatus.minutesRemaining > 0
                      "
                      >({{ formatRateLimitTime(account.rateLimitStatus.minutesRemaining) }})</span
                    >
                  </span>
                  <span
                    v-if="account.schedulable === false"
                    class="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700"
                  >
                    <i class="fas fa-pause-circle mr-1" />
                    不可调度
                    <el-tooltip
                      v-if="getSchedulableReason(account)"
                      :content="getSchedulableReason(account)"
                      effect="dark"
                      placement="top"
                    >
                      <i class="fas fa-question-circle ml-1 cursor-help text-gray-500" />
                    </el-tooltip>
                  </span>
                  <span
                    v-if="account.status === 'blocked' && account.errorMessage"
                    class="mt-1 max-w-xs truncate text-xs text-gray-500 dark:text-gray-400"
                    :title="account.errorMessage"
                  >
                    {{ account.errorMessage }}
                  </span>
                  <span
                    v-if="account.accountType === 'dedicated'"
                    class="text-xs text-gray-500 dark:text-gray-400"
                  >
                    绑定: {{ account.boundApiKeysCount || 0 }} 个API Key
                  </span>
                </div>
              </td>
              <td class="whitespace-nowrap px-3 py-4">
                <div
                  v-if="
                    account.platform === 'claude' ||
                    account.platform === 'claude-console' ||
                    account.platform === 'bedrock' ||
                    account.platform === 'gemini' ||
                    account.platform === 'openai' ||
                    account.platform === 'openai-responses' ||
                    account.platform === 'azure_openai' ||
                    account.platform === 'ccr' ||
                    account.platform === 'droid' ||
                    account.platform === 'gemini-api'
                  "
                  class="flex items-center gap-2"
                >
                  <div class="h-2 w-16 rounded-full bg-gray-200">
                    <div
                      class="h-2 rounded-full bg-gradient-to-r from-green-500 to-blue-600 transition-all duration-300"
                      :style="{ width: 101 - (account.priority || 50) + '%' }"
                    />
                  </div>
                  <span class="min-w-[20px] text-xs font-medium text-gray-700 dark:text-gray-200">
                    {{ account.priority || 50 }}
                  </span>
                </div>
                <div v-else class="text-sm text-gray-400">
                  <span class="text-xs">N/A</span>
                </div>
              </td>
              <td class="px-3 py-4 text-sm text-gray-600">
                <div
                  v-if="formatProxyDisplay(account.proxy)"
                  class="break-all rounded bg-blue-50 px-2 py-1 font-mono text-xs"
                  :title="formatProxyDisplay(account.proxy)"
                >
                  {{ formatProxyDisplay(account.proxy) }}
                </div>
                <div v-else class="text-gray-400">无代理</div>
              </td>
              <td class="whitespace-nowrap px-3 py-4 text-sm">
                <div v-if="account.usage && account.usage.daily" class="space-y-1">
                  <div class="flex items-center gap-2">
                    <div class="h-2 w-2 rounded-full bg-blue-500" />
                    <span class="text-sm font-medium text-gray-900 dark:text-gray-100"
                      >{{ account.usage.daily.requests || 0 }} 次</span
                    >
                  </div>
                  <div class="flex items-center gap-2">
                    <div class="h-2 w-2 rounded-full bg-purple-500" />
                    <span class="text-xs text-gray-600 dark:text-gray-300"
                      >{{ formatNumber(account.usage.daily.allTokens || 0) }}M</span
                    >
                  </div>
                  <div class="flex items-center gap-2">
                    <div class="h-2 w-2 rounded-full bg-green-500" />
                    <span class="text-xs text-gray-600 dark:text-gray-300"
                      >${{ calculateDailyCost(account) }}</span
                    >
                  </div>
                  <div
                    v-if="account.usage.averages && account.usage.averages.rpm > 0"
                    class="text-xs text-gray-500 dark:text-gray-400"
                  >
                    平均 {{ account.usage.averages.rpm.toFixed(2) }} RPM
                  </div>
                </div>
                <div v-else class="text-xs text-gray-400">暂无数据</div>
              </td>
              <td class="whitespace-nowrap px-3 py-4">
                <div v-if="account.platform === 'claude'" class="space-y-2">
                  <!-- OAuth 账户：显示三窗口 OAuth usage -->
                  <div v-if="isClaudeOAuth(account) && account.claudeUsage" class="space-y-2">
                    <!-- 5小时窗口 -->
                    <div class="rounded-lg bg-gray-50 p-2 dark:bg-gray-700/70">
                      <div class="flex items-center gap-2">
                        <span
                          class="inline-flex min-w-[32px] justify-center rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-medium text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-300"
                        >
                          5h
                        </span>
                        <div class="flex-1">
                          <div class="flex items-center gap-2">
                            <div class="h-2 flex-1 rounded-full bg-gray-200 dark:bg-gray-600">
                              <div
                                :class="[
                                  'h-2 rounded-full transition-all duration-300',
                                  getClaudeUsageBarClass(account.claudeUsage.fiveHour)
                                ]"
                                :style="{
                                  width: getClaudeUsageWidth(account.claudeUsage.fiveHour)
                                }"
                              />
                            </div>
                            <span
                              class="w-12 text-right text-xs font-semibold text-gray-800 dark:text-gray-100"
                            >
                              {{ formatClaudeUsagePercent(account.claudeUsage.fiveHour) }}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div class="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                        重置剩余 {{ formatClaudeRemaining(account.claudeUsage.fiveHour) }}
                      </div>
                    </div>
                    <!-- 7天窗口 -->
                    <div class="rounded-lg bg-gray-50 p-2 dark:bg-gray-700/70">
                      <div class="flex items-center gap-2">
                        <span
                          class="inline-flex min-w-[32px] justify-center rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-300"
                        >
                          7d
                        </span>
                        <div class="flex-1">
                          <div class="flex items-center gap-2">
                            <div class="h-2 flex-1 rounded-full bg-gray-200 dark:bg-gray-600">
                              <div
                                :class="[
                                  'h-2 rounded-full transition-all duration-300',
                                  getClaudeUsageBarClass(account.claudeUsage.sevenDay)
                                ]"
                                :style="{
                                  width: getClaudeUsageWidth(account.claudeUsage.sevenDay)
                                }"
                              />
                            </div>
                            <span
                              class="w-12 text-right text-xs font-semibold text-gray-800 dark:text-gray-100"
                            >
                              {{ formatClaudeUsagePercent(account.claudeUsage.sevenDay) }}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div class="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                        重置剩余 {{ formatClaudeRemaining(account.claudeUsage.sevenDay) }}
                      </div>
                    </div>
                    <!-- 7天Opus窗口 -->
                    <div class="rounded-lg bg-gray-50 p-2 dark:bg-gray-700/70">
                      <div class="flex items-center gap-2">
                        <span
                          class="inline-flex min-w-[32px] justify-center rounded-full bg-purple-100 px-2 py-0.5 text-[11px] font-medium text-purple-600 dark:bg-purple-500/20 dark:text-purple-300"
                        >
                          sonnet
                        </span>
                        <div class="flex-1">
                          <div class="flex items-center gap-2">
                            <div class="h-2 flex-1 rounded-full bg-gray-200 dark:bg-gray-600">
                              <div
                                :class="[
                                  'h-2 rounded-full transition-all duration-300',
                                  getClaudeUsageBarClass(account.claudeUsage.sevenDayOpus)
                                ]"
                                :style="{
                                  width: getClaudeUsageWidth(account.claudeUsage.sevenDayOpus)
                                }"
                              />
                            </div>
                            <span
                              class="w-12 text-right text-xs font-semibold text-gray-800 dark:text-gray-100"
                            >
                              {{ formatClaudeUsagePercent(account.claudeUsage.sevenDayOpus) }}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div class="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                        重置剩余 {{ formatClaudeRemaining(account.claudeUsage.sevenDayOpus) }}
                      </div>
                    </div>
                  </div>
                  <!-- Setup Token 账户：显示原有的会话窗口时间进度 -->
                  <div
                    v-else-if="
                      !isClaudeOAuth(account) &&
                      account.sessionWindow &&
                      account.sessionWindow.hasActiveWindow
                    "
                    class="space-y-2"
                  >
                    <!-- 使用统计在顶部 -->
                    <div
                      v-if="account.usage && account.usage.sessionWindow"
                      class="flex items-center gap-3 text-xs"
                    >
                      <div class="flex items-center gap-1">
                        <div class="h-1.5 w-1.5 rounded-full bg-purple-500" />
                        <span class="font-medium text-gray-900 dark:text-gray-100">
                          {{ formatNumber(account.usage.sessionWindow.totalTokens) }}M
                        </span>
                      </div>
                      <div class="flex items-center gap-1">
                        <div class="h-1.5 w-1.5 rounded-full bg-green-500" />
                        <span class="font-medium text-gray-900 dark:text-gray-100">
                          ${{ formatCost(account.usage.sessionWindow.totalCost) }}
                        </span>
                      </div>
                    </div>

                    <!-- 进度条 -->
                    <div class="flex items-center gap-2">
                      <div class="h-2 w-24 rounded-full bg-gray-200 dark:bg-gray-700">
                        <div
                          :class="[
                            'h-2 rounded-full transition-all duration-300',
                            getSessionProgressBarClass(
                              account.sessionWindow.sessionWindowStatus,
                              account
                            )
                          ]"
                          :style="{ width: account.sessionWindow.progress + '%' }"
                        />
                      </div>
                      <span
                        class="min-w-[32px] text-xs font-medium text-gray-700 dark:text-gray-200"
                      >
                        {{ account.sessionWindow.progress }}%
                      </span>
                    </div>

                    <!-- 时间信息 -->
                    <div class="text-xs text-gray-600 dark:text-gray-400">
                      <div>
                        {{
                          formatSessionWindow(
                            account.sessionWindow.windowStart,
                            account.sessionWindow.windowEnd
                          )
                        }}
                      </div>
                      <div
                        v-if="account.sessionWindow.remainingTime > 0"
                        class="font-medium text-indigo-600 dark:text-indigo-400"
                      >
                        剩余 {{ formatRemainingTime(account.sessionWindow.remainingTime) }}
                      </div>
                    </div>
                  </div>
                  <div v-else class="text-xs text-gray-400">暂无统计</div>
                </div>
                <!-- Claude Console: 显示每日额度和并发状态 -->
                <div v-else-if="account.platform === 'claude-console'" class="space-y-3">
                  <div>
                    <template v-if="Number(account.dailyQuota) > 0">
                      <div class="flex items-center justify-between text-xs">
                        <span class="text-gray-600 dark:text-gray-300">额度进度</span>
                        <span class="font-medium text-gray-700 dark:text-gray-200">
                          {{ getQuotaUsagePercent(account).toFixed(1) }}%
                        </span>
                      </div>
                      <div class="flex items-center gap-2">
                        <div class="h-2 w-24 rounded-full bg-gray-200 dark:bg-gray-700">
                          <div
                            :class="[
                              'h-2 rounded-full transition-all duration-300',
                              getQuotaBarClass(getQuotaUsagePercent(account))
                            ]"
                            :style="{ width: Math.min(100, getQuotaUsagePercent(account)) + '%' }"
                          />
                        </div>
                        <span
                          class="min-w-[32px] text-xs font-medium text-gray-700 dark:text-gray-200"
                        >
                          ${{ formatCost(account.usage?.daily?.cost || 0) }} / ${{
                            Number(account.dailyQuota).toFixed(2)
                          }}
                        </span>
                      </div>
                      <div class="text-xs text-gray-600 dark:text-gray-400">
                        剩余 ${{ formatRemainingQuota(account) }}
                        <span class="ml-2 text-gray-400"
                          >重置 {{ account.quotaResetTime || '00:00' }}</span
                        >
                      </div>
                    </template>
                    <template v-else>
                      <div class="text-sm text-gray-400">
                        <i class="fas fa-minus" />
                      </div>
                    </template>
                  </div>

                  <div class="space-y-1">
                    <div class="flex items-center justify-between text-xs">
                      <span class="text-gray-600 dark:text-gray-300">并发状态</span>
                      <span
                        v-if="Number(account.maxConcurrentTasks || 0) > 0"
                        class="font-medium text-gray-700 dark:text-gray-200"
                      >
                        {{ getConsoleConcurrencyPercent(account).toFixed(0) }}%
                      </span>
                    </div>
                    <div
                      v-if="Number(account.maxConcurrentTasks || 0) > 0"
                      class="flex items-center gap-2"
                    >
                      <div class="h-2 w-24 rounded-full bg-gray-200 dark:bg-gray-700">
                        <div
                          :class="[
                            'h-2 rounded-full transition-all duration-300',
                            getConcurrencyBarClass(getConsoleConcurrencyPercent(account))
                          ]"
                          :style="{
                            width: Math.min(100, getConsoleConcurrencyPercent(account)) + '%'
                          }"
                        />
                      </div>
                      <span
                        :class="[
                          'min-w-[48px] text-xs font-medium',
                          getConcurrencyLabelClass(account)
                        ]"
                      >
                        {{ Number(account.activeTaskCount || 0) }} /
                        {{ Number(account.maxConcurrentTasks || 0) }}
                      </span>
                    </div>
                    <div
                      v-else
                      class="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500 dark:bg-gray-700 dark:text-gray-300"
                    >
                      <i class="fas fa-infinity mr-1" />并发无限制
                    </div>
                  </div>
                </div>
                <div v-else-if="account.platform === 'openai'" class="space-y-2">
                  <div v-if="account.codexUsage" class="space-y-2">
                    <div class="rounded-lg bg-gray-50 p-2 dark:bg-gray-700/70">
                      <div class="flex items-center gap-2">
                        <span
                          class="inline-flex min-w-[32px] justify-center rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-medium text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-300"
                        >
                          {{ getCodexWindowLabel('primary') }}
                        </span>
                        <div class="flex-1">
                          <div class="flex items-center gap-2">
                            <div class="h-2 flex-1 rounded-full bg-gray-200 dark:bg-gray-600">
                              <div
                                :class="[
                                  'h-2 rounded-full transition-all duration-300',
                                  getCodexUsageBarClass(account.codexUsage.primary)
                                ]"
                                :style="{
                                  width: getCodexUsageWidth(account.codexUsage.primary)
                                }"
                              />
                            </div>
                            <span
                              class="w-12 text-right text-xs font-semibold text-gray-800 dark:text-gray-100"
                            >
                              {{ formatCodexUsagePercent(account.codexUsage.primary) }}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div class="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                        重置剩余 {{ formatCodexRemaining(account.codexUsage.primary) }}
                      </div>
                    </div>
                    <div class="rounded-lg bg-gray-50 p-2 dark:bg-gray-700/70">
                      <div class="flex items-center gap-2">
                        <span
                          class="inline-flex min-w-[32px] justify-center rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-600 dark:bg-blue-500/20 dark:text-blue-300"
                        >
                          {{ getCodexWindowLabel('secondary') }}
                        </span>
                        <div class="flex-1">
                          <div class="flex items-center gap-2">
                            <div class="h-2 flex-1 rounded-full bg-gray-200 dark:bg-gray-600">
                              <div
                                :class="[
                                  'h-2 rounded-full transition-all duration-300',
                                  getCodexUsageBarClass(account.codexUsage.secondary)
                                ]"
                                :style="{
                                  width: getCodexUsageWidth(account.codexUsage.secondary)
                                }"
                              />
                            </div>
                            <span
                              class="w-12 text-right text-xs font-semibold text-gray-800 dark:text-gray-100"
                            >
                              {{ formatCodexUsagePercent(account.codexUsage.secondary) }}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div class="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                        重置剩余 {{ formatCodexRemaining(account.codexUsage.secondary) }}
                      </div>
                    </div>
                  </div>
                  <div v-else class="text-sm text-gray-400">
                    <span class="text-xs">N/A</span>
                  </div>
                </div>
                <div v-else class="text-sm text-gray-400">
                  <span class="text-xs">N/A</span>
                </div>
              </td>
              <td class="whitespace-nowrap px-3 py-4 text-sm text-gray-600 dark:text-gray-300">
                {{ formatLastUsed(account.lastUsedAt) }}
              </td>
              <td class="whitespace-nowrap px-3 py-4 text-sm font-medium">
                <div class="flex flex-wrap items-center gap-1">
                  <button
                    v-if="
                      (account.platform === 'claude' ||
                        account.platform === 'claude-console' ||
                        account.platform === 'openai' ||
                        account.platform === 'openai-responses' ||
                        account.platform === 'gemini' ||
                        account.platform === 'gemini-api' ||
                        account.platform === 'ccr') &&
                      (account.status === 'unauthorized' ||
                        account.status !== 'active' ||
                        account.rateLimitStatus?.isRateLimited ||
                        account.rateLimitStatus === 'limited' ||
                        !account.isActive)
                    "
                    :class="[
                      'rounded px-2.5 py-1 text-xs font-medium transition-colors',
                      account.isResetting
                        ? 'cursor-not-allowed bg-gray-100 text-gray-400'
                        : 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
                    ]"
                    :disabled="account.isResetting"
                    :title="account.isResetting ? '重置中...' : '重置所有异常状态'"
                    @click="resetAccountStatus(account)"
                  >
                    <i :class="['fas fa-redo', account.isResetting ? 'animate-spin' : '']" />
                    <span class="ml-1">重置状态</span>
                  </button>
                  <button
                    :class="[
                      'rounded px-2.5 py-1 text-xs font-medium transition-colors',
                      account.isTogglingSchedulable
                        ? 'cursor-not-allowed bg-gray-100 text-gray-400'
                        : account.schedulable
                          ? 'bg-green-100 text-green-700 hover:bg-green-200'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    ]"
                    :disabled="account.isTogglingSchedulable"
                    :title="account.schedulable ? '点击禁用调度' : '点击启用调度'"
                    @click="toggleSchedulable(account)"
                  >
                    <i :class="['fas', account.schedulable ? 'fa-toggle-on' : 'fa-toggle-off']" />
                    <span class="ml-1">{{ account.schedulable ? '调度' : '停用' }}</span>
                  </button>
                  <button
                    v-if="canViewUsage(account)"
                    class="rounded bg-indigo-100 px-2.5 py-1 text-xs font-medium text-indigo-700 transition-colors hover:bg-indigo-200"
                    :title="'查看使用详情'"
                    @click="openAccountUsageModal(account)"
                  >
                    <i class="fas fa-chart-line" />
                    <span class="ml-1">详情</span>
                  </button>
                  <button
                    class="rounded bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-200"
                    :title="'编辑账户'"
                    @click="editAccount(account)"
                  >
                    <i class="fas fa-edit" />
                    <span class="ml-1">编辑</span>
                  </button>
                  <button
                    class="rounded bg-red-100 px-2.5 py-1 text-xs font-medium text-red-700 transition-colors hover:bg-red-200"
                    :title="'删除账户'"
                    @click="deleteAccount(account)"
                  >
                    <i class="fas fa-trash" />
                    <span class="ml-1">删除</span>
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 移动端卡片视图 -->
      <div v-if="!accountsLoading && sortedAccounts.length > 0" class="space-y-3 md:hidden">
        <div
          v-for="account in paginatedAccounts"
          :key="account.id"
          class="card p-4 transition-shadow hover:shadow-lg"
        >
          <!-- 卡片头部 -->
          <div class="mb-3 flex items-start justify-between">
            <div class="flex items-center gap-3">
              <input
                v-if="shouldShowCheckboxes"
                v-model="selectedAccounts"
                class="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                type="checkbox"
                :value="account.id"
                @change="updateSelectAllState"
              />
              <div
                :class="[
                  'flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg',
                  account.platform === 'claude'
                    ? 'bg-gradient-to-br from-purple-500 to-purple-600'
                    : account.platform === 'bedrock'
                      ? 'bg-gradient-to-br from-orange-500 to-red-600'
                      : account.platform === 'azure_openai'
                        ? 'bg-gradient-to-br from-blue-500 to-cyan-600'
                        : account.platform === 'openai'
                          ? 'bg-gradient-to-br from-gray-600 to-gray-700'
                          : account.platform === 'ccr'
                            ? 'bg-gradient-to-br from-teal-500 to-emerald-600'
                            : account.platform === 'droid'
                              ? 'bg-gradient-to-br from-cyan-500 to-sky-600'
                              : 'bg-gradient-to-br from-blue-500 to-blue-600'
                ]"
              >
                <i
                  :class="[
                    'text-sm text-white',
                    account.platform === 'claude'
                      ? 'fas fa-brain'
                      : account.platform === 'bedrock'
                        ? 'fab fa-aws'
                        : account.platform === 'azure_openai'
                          ? 'fab fa-microsoft'
                          : account.platform === 'openai'
                            ? 'fas fa-openai'
                            : account.platform === 'ccr'
                              ? 'fas fa-code-branch'
                              : account.platform === 'droid'
                                ? 'fas fa-robot'
                                : 'fas fa-robot'
                  ]"
                />
              </div>
              <div>
                <h4 class="text-sm font-semibold text-gray-900">
                  {{ account.name || account.email }}
                </h4>
                <div class="mt-0.5 flex items-center gap-2">
                  <span class="text-xs text-gray-500 dark:text-gray-400">{{
                    account.platform
                  }}</span>
                  <span class="text-xs text-gray-400">|</span>
                  <span class="text-xs text-gray-500 dark:text-gray-400">{{ account.type }}</span>
                </div>
              </div>
            </div>
            <span
              :class="[
                'inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold',
                getAccountStatusClass(account)
              ]"
            >
              <div
                :class="['mr-1.5 h-1.5 w-1.5 rounded-full', getAccountStatusDotClass(account)]"
              />
              {{ getAccountStatusText(account) }}
            </span>
          </div>

          <!-- 使用统计 -->
          <div class="mb-3 grid grid-cols-2 gap-3">
            <div>
              <p class="text-xs text-gray-500 dark:text-gray-400">今日使用</p>
              <div class="space-y-1">
                <div class="flex items-center gap-1.5">
                  <div class="h-1.5 w-1.5 rounded-full bg-blue-500" />
                  <p class="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {{ account.usage?.daily?.requests || 0 }} 次
                  </p>
                </div>
                <div class="flex items-center gap-1.5">
                  <div class="h-1.5 w-1.5 rounded-full bg-purple-500" />
                  <p class="text-xs text-gray-600 dark:text-gray-400">
                    {{ formatNumber(account.usage?.daily?.allTokens || 0) }}M
                  </p>
                </div>
                <div class="flex items-center gap-1.5">
                  <div class="h-1.5 w-1.5 rounded-full bg-green-500" />
                  <p class="text-xs text-gray-600 dark:text-gray-400">
                    ${{ calculateDailyCost(account) }}
                  </p>
                </div>
              </div>
            </div>
            <div>
              <p class="text-xs text-gray-500 dark:text-gray-400">会话窗口</p>
              <div v-if="account.usage && account.usage.sessionWindow" class="space-y-1">
                <div class="flex items-center gap-1.5">
                  <div class="h-1.5 w-1.5 rounded-full bg-purple-500" />
                  <p class="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {{ formatNumber(account.usage.sessionWindow.totalTokens) }}M
                  </p>
                </div>
                <div class="flex items-center gap-1.5">
                  <div class="h-1.5 w-1.5 rounded-full bg-green-500" />
                  <p class="text-xs text-gray-600 dark:text-gray-400">
                    ${{ formatCost(account.usage.sessionWindow.totalCost) }}
                  </p>
                </div>
              </div>
              <div v-else class="text-sm font-semibold text-gray-400">-</div>
            </div>
          </div>

          <!-- 状态信息 -->
          <div class="mb-3 space-y-2">
            <!-- 会话窗口 -->
            <div v-if="account.platform === 'claude'" class="space-y-2">
              <!-- OAuth 账户：显示三窗口 OAuth usage -->
              <div v-if="isClaudeOAuth(account) && account.claudeUsage" class="space-y-2">
                <!-- 5小时窗口 -->
                <div class="rounded-lg bg-gray-50 p-2 dark:bg-gray-700/70">
                  <div class="flex items-center gap-2">
                    <span
                      class="inline-flex min-w-[32px] justify-center rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-medium text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-300"
                    >
                      5h
                    </span>
                    <div class="flex-1">
                      <div class="flex items-center gap-2">
                        <div class="h-2 flex-1 rounded-full bg-gray-200 dark:bg-gray-600">
                          <div
                            :class="[
                              'h-2 rounded-full transition-all duration-300',
                              getClaudeUsageBarClass(account.claudeUsage.fiveHour)
                            ]"
                            :style="{
                              width: getClaudeUsageWidth(account.claudeUsage.fiveHour)
                            }"
                          />
                        </div>
                        <span
                          class="w-12 text-right text-xs font-semibold text-gray-800 dark:text-gray-100"
                        >
                          {{ formatClaudeUsagePercent(account.claudeUsage.fiveHour) }}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div class="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                    重置剩余 {{ formatClaudeRemaining(account.claudeUsage.fiveHour) }}
                  </div>
                </div>
                <!-- 7天窗口 -->
                <div class="rounded-lg bg-gray-50 p-2 dark:bg-gray-700/70">
                  <div class="flex items-center gap-2">
                    <span
                      class="inline-flex min-w-[32px] justify-center rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-300"
                    >
                      7d
                    </span>
                    <div class="flex-1">
                      <div class="flex items-center gap-2">
                        <div class="h-2 flex-1 rounded-full bg-gray-200 dark:bg-gray-600">
                          <div
                            :class="[
                              'h-2 rounded-full transition-all duration-300',
                              getClaudeUsageBarClass(account.claudeUsage.sevenDay)
                            ]"
                            :style="{
                              width: getClaudeUsageWidth(account.claudeUsage.sevenDay)
                            }"
                          />
                        </div>
                        <span
                          class="w-12 text-right text-xs font-semibold text-gray-800 dark:text-gray-100"
                        >
                          {{ formatClaudeUsagePercent(account.claudeUsage.sevenDay) }}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div class="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                    重置剩余 {{ formatClaudeRemaining(account.claudeUsage.sevenDay) }}
                  </div>
                </div>
                <!-- 7天Opus窗口 -->
                <div class="rounded-lg bg-gray-50 p-2 dark:bg-gray-700/70">
                  <div class="flex items-center gap-2">
                    <span
                      class="inline-flex min-w-[32px] justify-center rounded-full bg-purple-100 px-2 py-0.5 text-[11px] font-medium text-purple-600 dark:bg-purple-500/20 dark:text-purple-300"
                    >
                      Opus
                    </span>
                    <div class="flex-1">
                      <div class="flex items-center gap-2">
                        <div class="h-2 flex-1 rounded-full bg-gray-200 dark:bg-gray-600">
                          <div
                            :class="[
                              'h-2 rounded-full transition-all duration-300',
                              getClaudeUsageBarClass(account.claudeUsage.sevenDayOpus)
                            ]"
                            :style="{
                              width: getClaudeUsageWidth(account.claudeUsage.sevenDayOpus)
                            }"
                          />
                        </div>
                        <span
                          class="w-12 text-right text-xs font-semibold text-gray-800 dark:text-gray-100"
                        >
                          {{ formatClaudeUsagePercent(account.claudeUsage.sevenDayOpus) }}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div class="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                    重置剩余 {{ formatClaudeRemaining(account.claudeUsage.sevenDayOpus) }}
                  </div>
                </div>
              </div>
              <!-- Setup Token 账户：显示原有的会话窗口时间进度 -->
              <div
                v-else-if="
                  !isClaudeOAuth(account) &&
                  account.sessionWindow &&
                  account.sessionWindow.hasActiveWindow
                "
                class="space-y-1.5 rounded-lg bg-gray-50 p-2 dark:bg-gray-700"
              >
                <div class="flex items-center justify-between text-xs">
                  <div class="flex items-center gap-1">
                    <span class="font-medium text-gray-600 dark:text-gray-300">会话窗口</span>
                    <el-tooltip
                      content="会话窗口进度不代表使用量，仅表示距离下一个5小时窗口的剩余时间"
                      placement="top"
                    >
                      <i
                        class="fas fa-question-circle cursor-help text-xs text-gray-400 hover:text-gray-600"
                      />
                    </el-tooltip>
                  </div>
                  <span class="font-medium text-gray-700 dark:text-gray-200">
                    {{ account.sessionWindow.progress }}%
                  </span>
                </div>
                <div class="h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-600">
                  <div
                    :class="[
                      'h-full transition-all duration-300',
                      getSessionProgressBarClass(account.sessionWindow.sessionWindowStatus, account)
                    ]"
                    :style="{ width: account.sessionWindow.progress + '%' }"
                  />
                </div>
                <div class="flex items-center justify-between text-xs">
                  <span class="text-gray-500 dark:text-gray-400">
                    {{
                      formatSessionWindow(
                        account.sessionWindow.windowStart,
                        account.sessionWindow.windowEnd
                      )
                    }}
                  </span>
                  <span
                    v-if="account.sessionWindow.remainingTime > 0"
                    class="font-medium text-indigo-600"
                  >
                    剩余 {{ formatRemainingTime(account.sessionWindow.remainingTime) }}
                  </span>
                  <span v-else class="text-gray-500"> 已结束 </span>
                </div>
              </div>
              <div v-else class="text-xs text-gray-400">暂无统计</div>
            </div>
            <div v-else-if="account.platform === 'openai'" class="space-y-2">
              <div v-if="account.codexUsage" class="space-y-2">
                <div class="rounded-lg bg-gray-50 p-2 dark:bg-gray-700">
                  <div class="flex items-center gap-2">
                    <span
                      class="inline-flex min-w-[32px] justify-center rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-medium text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-300"
                    >
                      {{ getCodexWindowLabel('primary') }}
                    </span>
                    <div class="flex-1">
                      <div class="flex items-center gap-2">
                        <div class="h-2 flex-1 rounded-full bg-gray-200 dark:bg-gray-600">
                          <div
                            :class="[
                              'h-2 rounded-full transition-all duration-300',
                              getCodexUsageBarClass(account.codexUsage.primary)
                            ]"
                            :style="{
                              width: getCodexUsageWidth(account.codexUsage.primary)
                            }"
                          />
                        </div>
                        <span
                          class="w-12 text-right text-xs font-semibold text-gray-800 dark:text-gray-100"
                        >
                          {{ formatCodexUsagePercent(account.codexUsage.primary) }}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div class="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                    重置剩余 {{ formatCodexRemaining(account.codexUsage.primary) }}
                  </div>
                </div>
                <div class="rounded-lg bg-gray-50 p-2 dark:bg-gray-700">
                  <div class="flex items-center gap-2">
                    <span
                      class="inline-flex min-w-[32px] justify-center rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-600 dark:bg-blue-500/20 dark:text-blue-300"
                    >
                      {{ getCodexWindowLabel('secondary') }}
                    </span>
                    <div class="flex-1">
                      <div class="flex items-center gap-2">
                        <div class="h-2 flex-1 rounded-full bg-gray-200 dark:bg-gray-600">
                          <div
                            :class="[
                              'h-2 rounded-full transition-all duration-300',
                              getCodexUsageBarClass(account.codexUsage.secondary)
                            ]"
                            :style="{
                              width: getCodexUsageWidth(account.codexUsage.secondary)
                            }"
                          />
                        </div>
                        <span
                          class="w-12 text-right text-xs font-semibold text-gray-800 dark:text-gray-100"
                        >
                          {{ formatCodexUsagePercent(account.codexUsage.secondary) }}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div class="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                    重置剩余 {{ formatCodexRemaining(account.codexUsage.secondary) }}
                  </div>
                </div>
              </div>
              <div v-if="!account.codexUsage" class="text-xs text-gray-400">暂无统计</div>
            </div>

            <!-- 最后使用时间 -->
            <div class="flex items-center justify-between text-xs">
              <span class="text-gray-500 dark:text-gray-400">最后使用</span>
              <span class="text-gray-700 dark:text-gray-200">
                {{ account.lastUsedAt ? formatRelativeTime(account.lastUsedAt) : '从未使用' }}
              </span>
            </div>

            <!-- 代理配置 -->
            <div
              v-if="account.proxyConfig && account.proxyConfig.type !== 'none'"
              class="flex items-center justify-between text-xs"
            >
              <span class="text-gray-500 dark:text-gray-400">代理</span>
              <span class="text-gray-700 dark:text-gray-200">
                {{ account.proxyConfig.type.toUpperCase() }}
              </span>
            </div>

            <!-- 调度优先级 -->
            <div class="flex items-center justify-between text-xs">
              <span class="text-gray-500 dark:text-gray-400">优先级</span>
              <span class="font-medium text-gray-700 dark:text-gray-200">
                {{ account.priority || 50 }}
              </span>
            </div>
          </div>

          <!-- 操作按钮 -->
          <div class="mt-3 flex gap-2 border-t border-gray-100 pt-3">
            <button
              class="flex flex-1 items-center justify-center gap-1 rounded-lg px-3 py-2 text-xs transition-colors"
              :class="
                account.schedulable
                  ? 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                  : 'bg-green-50 text-green-600 hover:bg-green-100'
              "
              :disabled="account.isTogglingSchedulable"
              @click="toggleSchedulable(account)"
            >
              <i :class="['fas', account.schedulable ? 'fa-pause' : 'fa-play']" />
              {{ account.schedulable ? '暂停' : '启用' }}
            </button>

            <button
              v-if="canViewUsage(account)"
              class="flex flex-1 items-center justify-center gap-1 rounded-lg bg-indigo-50 px-3 py-2 text-xs text-indigo-600 transition-colors hover:bg-indigo-100"
              @click="openAccountUsageModal(account)"
            >
              <i class="fas fa-chart-line" />
              详情
            </button>

            <button
              class="flex-1 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600 transition-colors hover:bg-gray-100"
              @click="editAccount(account)"
            >
              <i class="fas fa-edit mr-1" />
              编辑
            </button>

            <button
              class="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 transition-colors hover:bg-red-100"
              @click="deleteAccount(account)"
            >
              <i class="fas fa-trash" />
            </button>
          </div>
        </div>
      </div>
    </div>

    <div
      v-if="!accountsLoading && sortedAccounts.length > 0"
      class="mt-4 flex flex-col items-center justify-between gap-4 sm:mt-6 sm:flex-row"
    >
      <div class="flex w-full flex-col items-center gap-3 sm:w-auto sm:flex-row">
        <span class="text-xs text-gray-600 dark:text-gray-400 sm:text-sm">
          共 {{ sortedAccounts.length }} 条记录
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
        <button
          class="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 sm:py-1 sm:text-sm"
          :disabled="currentPage === 1"
          @click="currentPage--"
        >
          <i class="fas fa-chevron-left" />
        </button>

        <div class="flex items-center gap-1">
          <button
            v-if="shouldShowFirstPage"
            class="hidden rounded-md border border-gray-300 bg-white px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 sm:block"
            @click="currentPage = 1"
          >
            1
          </button>

          <span
            v-if="showLeadingEllipsis"
            class="hidden px-2 text-sm text-gray-500 dark:text-gray-400 sm:block"
          >
            ...
          </span>

          <button
            v-for="page in pageNumbers"
            :key="page"
            :class="[
              'rounded-md border px-3 py-1 text-xs font-medium transition-colors sm:text-sm',
              page === currentPage
                ? 'border-blue-500 bg-blue-50 text-blue-600 dark:border-blue-400 dark:bg-blue-500/10 dark:text-blue-300'
                : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
            ]"
            @click="currentPage = page"
          >
            {{ page }}
          </button>

          <span
            v-if="showTrailingEllipsis"
            class="hidden px-2 text-sm text-gray-500 dark:text-gray-400 sm:block"
          >
            ...
          </span>

          <button
            v-if="shouldShowLastPage"
            class="hidden rounded-md border border-gray-300 bg-white px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 sm:block"
            @click="currentPage = totalPages"
          >
            {{ totalPages }}
          </button>
        </div>

        <button
          class="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 sm:py-1 sm:text-sm"
          :disabled="currentPage === totalPages || totalPages === 0"
          @click="currentPage++"
        >
          <i class="fas fa-chevron-right" />
        </button>
      </div>
    </div>

    <!-- 添加账户模态框 -->
    <AccountForm
      v-if="showCreateAccountModal && (!newAccountPlatform || newAccountPlatform !== 'ccr')"
      @close="closeCreateAccountModal"
      @platform-changed="newAccountPlatform = $event"
      @success="handleCreateSuccess"
    />
    <CcrAccountForm
      v-else-if="showCreateAccountModal && newAccountPlatform === 'ccr'"
      @close="closeCreateAccountModal"
      @success="handleCreateSuccess"
    />

    <!-- 编辑账户模态框 -->
    <CcrAccountForm
      v-if="showEditAccountModal && editingAccount && editingAccount.platform === 'ccr'"
      :account="editingAccount"
      @close="showEditAccountModal = false"
      @success="handleEditSuccess"
    />
    <AccountForm
      v-else-if="showEditAccountModal"
      :account="editingAccount"
      @close="showEditAccountModal = false"
      @success="handleEditSuccess"
    />

    <!-- 确认弹窗 -->
    <ConfirmModal
      :cancel-text="confirmOptions.cancelText"
      :confirm-text="confirmOptions.confirmText"
      :message="confirmOptions.message"
      :show="showConfirmModal"
      :title="confirmOptions.title"
      @cancel="handleCancel"
      @confirm="handleConfirm"
    />

    <AccountUsageDetailModal
      v-if="showAccountUsageModal"
      :account="selectedAccountForUsage || {}"
      :generated-at="accountUsageGeneratedAt"
      :history="accountUsageHistory"
      :loading="accountUsageLoading"
      :overview="accountUsageOverview"
      :show="showAccountUsageModal"
      :summary="accountUsageSummary"
      @close="closeAccountUsageModal"
    />

    <!-- 账户过期时间编辑弹窗 -->
    <AccountExpiryEditModal
      ref="expiryEditModalRef"
      :account="editingExpiryAccount || { id: null, expiresAt: null, name: '' }"
      :show="!!editingExpiryAccount"
      @close="closeAccountExpiryEdit"
      @save="handleSaveAccountExpiry"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { showToast } from '@/utils/toast'
import { apiClient } from '@/config/api'
import { useConfirm } from '@/composables/useConfirm'
import AccountForm from '@/components/accounts/AccountForm.vue'
import CcrAccountForm from '@/components/accounts/CcrAccountForm.vue'
import AccountUsageDetailModal from '@/components/accounts/AccountUsageDetailModal.vue'
import AccountExpiryEditModal from '@/components/accounts/AccountExpiryEditModal.vue'
import ConfirmModal from '@/components/common/ConfirmModal.vue'
import CustomDropdown from '@/components/common/CustomDropdown.vue'

// 使用确认弹窗
const { showConfirmModal, confirmOptions, showConfirm, handleConfirm, handleCancel } = useConfirm()

// 数据状态
const accounts = ref([])
const accountsLoading = ref(false)
const accountSortBy = ref('name')
const accountsSortBy = ref('')
const accountsSortOrder = ref('asc')
const apiKeys = ref([])
const accountGroups = ref([])
const groupFilter = ref('all')
const platformFilter = ref('all')
const searchKeyword = ref('')
const PAGE_SIZE_STORAGE_KEY = 'accountsPageSize'
const getInitialPageSize = () => {
  const saved = localStorage.getItem(PAGE_SIZE_STORAGE_KEY)
  if (saved) {
    const parsedSize = parseInt(saved, 10)
    if ([10, 20, 50, 100].includes(parsedSize)) {
      return parsedSize
    }
  }
  return 10
}
const pageSizeOptions = [10, 20, 50, 100]
const pageSize = ref(getInitialPageSize())
const currentPage = ref(1)

// 多选状态
const selectedAccounts = ref([])
const selectAllChecked = ref(false)
const isIndeterminate = ref(false)
const showCheckboxes = ref(false)

// 账号使用详情弹窗状态
const showAccountUsageModal = ref(false)
const accountUsageLoading = ref(false)
const selectedAccountForUsage = ref(null)
const accountUsageHistory = ref([])
const accountUsageSummary = ref({})
const accountUsageOverview = ref({})
const accountUsageGeneratedAt = ref('')

const supportedUsagePlatforms = [
  'claude',
  'claude-console',
  'openai',
  'openai-responses',
  'gemini',
  'droid',
  'gemini-api'
]

// 过期时间编辑弹窗状态
const editingExpiryAccount = ref(null)
const expiryEditModalRef = ref(null)

// 缓存状态标志
const apiKeysLoaded = ref(false)
const groupsLoaded = ref(false)
const groupMembersLoaded = ref(false)
const accountGroupMap = ref(new Map()) // Map<accountId, Array<groupInfo>>

// 下拉选项数据
const sortOptions = ref([
  { value: 'name', label: '按名称排序', icon: 'fa-font' },
  { value: 'dailyTokens', label: '按今日Token排序', icon: 'fa-coins' },
  { value: 'dailyRequests', label: '按今日请求数排序', icon: 'fa-chart-line' },
  { value: 'totalTokens', label: '按总Token排序', icon: 'fa-database' },
  { value: 'lastUsed', label: '按最后使用排序', icon: 'fa-clock' }
])

const platformOptions = ref([
  { value: 'all', label: '所有平台', icon: 'fa-globe' },
  { value: 'claude', label: 'Claude', icon: 'fa-brain' },
  { value: 'claude-console', label: 'Claude Console', icon: 'fa-terminal' },
  { value: 'gemini', label: 'Gemini', icon: 'fab fa-google' },
  { value: 'gemini-api', label: 'Gemini API', icon: 'fa-key' },
  { value: 'openai', label: 'OpenAi', icon: 'fa-openai' },
  { value: 'azure_openai', label: 'Azure OpenAI', icon: 'fab fa-microsoft' },
  { value: 'bedrock', label: 'Bedrock', icon: 'fab fa-aws' },
  { value: 'openai-responses', label: 'OpenAI-Responses', icon: 'fa-server' },
  { value: 'ccr', label: 'CCR', icon: 'fa-code-branch' },
  { value: 'droid', label: 'Droid', icon: 'fa-robot' }
])

const groupOptions = computed(() => {
  const options = [
    { value: 'all', label: '所有账户', icon: 'fa-globe' },
    { value: 'ungrouped', label: '未分组账户', icon: 'fa-user' }
  ]
  accountGroups.value.forEach((group) => {
    options.push({
      value: group.id,
      label: `${group.name} (${group.platform === 'claude' ? 'Claude' : group.platform === 'gemini' ? 'Gemini' : group.platform === 'openai' ? 'OpenAI' : 'Droid'})`,
      icon:
        group.platform === 'claude'
          ? 'fa-brain'
          : group.platform === 'gemini'
            ? 'fa-robot'
            : group.platform === 'openai'
              ? 'fa-openai'
              : 'fa-robot'
    })
  })
  return options
})

const shouldShowCheckboxes = computed(() => showCheckboxes.value)

// 模态框状态
const showCreateAccountModal = ref(false)
const newAccountPlatform = ref(null) // 跟踪新建账户选择的平台
const showEditAccountModal = ref(false)
const editingAccount = ref(null)

const collectAccountSearchableStrings = (account) => {
  const values = new Set()

  const baseFields = [
    account?.name,
    account?.email,
    account?.accountName,
    account?.owner,
    account?.ownerName,
    account?.ownerDisplayName,
    account?.displayName,
    account?.username,
    account?.identifier,
    account?.alias,
    account?.title,
    account?.label
  ]

  baseFields.forEach((field) => {
    if (typeof field === 'string') {
      const trimmed = field.trim()
      if (trimmed) {
        values.add(trimmed)
      }
    }
  })

  if (Array.isArray(account?.groupInfos)) {
    account.groupInfos.forEach((group) => {
      if (group && typeof group.name === 'string') {
        const trimmed = group.name.trim()
        if (trimmed) {
          values.add(trimmed)
        }
      }
    })
  }

  Object.entries(account || {}).forEach(([key, value]) => {
    if (typeof value === 'string') {
      const lowerKey = key.toLowerCase()
      if (lowerKey.includes('name') || lowerKey.includes('email')) {
        const trimmed = value.trim()
        if (trimmed) {
          values.add(trimmed)
        }
      }
    }
  })

  return Array.from(values)
}

const accountMatchesKeyword = (account, normalizedKeyword) => {
  if (!normalizedKeyword) return true
  return collectAccountSearchableStrings(account).some((value) =>
    value.toLowerCase().includes(normalizedKeyword)
  )
}

const canViewUsage = (account) => !!account && supportedUsagePlatforms.includes(account.platform)

const openAccountUsageModal = async (account) => {
  if (!canViewUsage(account)) {
    showToast('该账户类型暂不支持查看详情', 'warning')
    return
  }

  selectedAccountForUsage.value = account
  showAccountUsageModal.value = true
  accountUsageLoading.value = true
  accountUsageHistory.value = []
  accountUsageSummary.value = {}
  accountUsageOverview.value = {}
  accountUsageGeneratedAt.value = ''

  try {
    const response = await apiClient.get(
      `/admin/accounts/${account.id}/usage-history?platform=${account.platform}&days=30`
    )

    if (response.success) {
      const data = response.data || {}
      accountUsageHistory.value = data.history || []
      accountUsageSummary.value = data.summary || {}
      accountUsageOverview.value = data.overview || {}
      accountUsageGeneratedAt.value = data.generatedAt || ''
    } else {
      showToast(response.error || '加载账号使用详情失败', 'error')
    }
  } catch (error) {
    showToast('加载账号使用详情失败', 'error')
  } finally {
    accountUsageLoading.value = false
  }
}

const closeAccountUsageModal = () => {
  showAccountUsageModal.value = false
  accountUsageLoading.value = false
  selectedAccountForUsage.value = null
}

// 计算排序后的账户列表
const sortedAccounts = computed(() => {
  let sourceAccounts = accounts.value

  const keyword = searchKeyword.value.trim()
  if (keyword) {
    const normalizedKeyword = keyword.toLowerCase()
    sourceAccounts = sourceAccounts.filter((account) =>
      accountMatchesKeyword(account, normalizedKeyword)
    )
  }

  if (!accountsSortBy.value) return sourceAccounts

  const sorted = [...sourceAccounts].sort((a, b) => {
    let aVal = a[accountsSortBy.value]
    let bVal = b[accountsSortBy.value]

    // 处理统计数据
    if (accountsSortBy.value === 'dailyTokens') {
      aVal = a.usage?.daily?.allTokens || 0
      bVal = b.usage?.daily?.allTokens || 0
    } else if (accountsSortBy.value === 'dailyRequests') {
      aVal = a.usage?.daily?.requests || 0
      bVal = b.usage?.daily?.requests || 0
    } else if (accountsSortBy.value === 'totalTokens') {
      aVal = a.usage?.total?.allTokens || 0
      bVal = b.usage?.total?.allTokens || 0
    }

    // 处理最后使用时间
    if (accountsSortBy.value === 'lastUsed') {
      aVal = a.lastUsedAt ? new Date(a.lastUsedAt).getTime() : 0
      bVal = b.lastUsedAt ? new Date(b.lastUsedAt).getTime() : 0
    }

    // 处理状态
    if (accountsSortBy.value === 'status') {
      aVal = a.isActive ? 1 : 0
      bVal = b.isActive ? 1 : 0
    }

    if (aVal < bVal) return accountsSortOrder.value === 'asc' ? -1 : 1
    if (aVal > bVal) return accountsSortOrder.value === 'asc' ? 1 : -1
    return 0
  })

  return sorted
})

const totalPages = computed(() => {
  const total = sortedAccounts.value.length
  return Math.ceil(total / pageSize.value) || 0
})

const pageNumbers = computed(() => {
  const total = totalPages.value
  const current = currentPage.value
  const pages = []

  if (total <= 7) {
    for (let i = 1; i <= total; i++) {
      pages.push(i)
    }
  } else {
    let start = Math.max(1, current - 2)
    let end = Math.min(total, current + 2)

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

const paginatedAccounts = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  const end = start + pageSize.value
  return sortedAccounts.value.slice(start, end)
})

const updateSelectAllState = () => {
  const currentIds = paginatedAccounts.value.map((account) => account.id)
  const selectedInCurrentPage = currentIds.filter((id) =>
    selectedAccounts.value.includes(id)
  ).length
  const totalInCurrentPage = currentIds.length

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

const handleSelectAll = () => {
  if (selectAllChecked.value) {
    paginatedAccounts.value.forEach((account) => {
      if (!selectedAccounts.value.includes(account.id)) {
        selectedAccounts.value.push(account.id)
      }
    })
  } else {
    const currentIds = new Set(paginatedAccounts.value.map((account) => account.id))
    selectedAccounts.value = selectedAccounts.value.filter((id) => !currentIds.has(id))
  }
  updateSelectAllState()
}

const toggleSelectionMode = () => {
  showCheckboxes.value = !showCheckboxes.value
  if (!showCheckboxes.value) {
    selectedAccounts.value = []
    selectAllChecked.value = false
    isIndeterminate.value = false
  } else {
    updateSelectAllState()
  }
}

const cleanupSelectedAccounts = () => {
  const validIds = new Set(accounts.value.map((account) => account.id))
  selectedAccounts.value = selectedAccounts.value.filter((id) => validIds.has(id))
  updateSelectAllState()
}

// 加载账户列表
const loadAccounts = async (forceReload = false) => {
  accountsLoading.value = true
  try {
    // 构建查询参数（用于其他筛选情况）
    const params = {}
    if (platformFilter.value !== 'all') {
      params.platform = platformFilter.value
    }
    if (groupFilter.value !== 'all') {
      params.groupId = groupFilter.value
    }

    // 根据平台筛选决定需要请求哪些接口
    const requests = []

    if (platformFilter.value === 'all') {
      // 请求所有平台
      requests.push(
        apiClient.get('/admin/claude-accounts', { params }),
        apiClient.get('/admin/claude-console-accounts', { params }),
        apiClient.get('/admin/bedrock-accounts', { params }),
        apiClient.get('/admin/gemini-accounts', { params }),
        apiClient.get('/admin/openai-accounts', { params }),
        apiClient.get('/admin/azure-openai-accounts', { params }),
        apiClient.get('/admin/openai-responses-accounts', { params }),
        apiClient.get('/admin/ccr-accounts', { params }),
        apiClient.get('/admin/droid-accounts', { params }),
        apiClient.get('/admin/gemini-api-accounts', { params })
      )
    } else {
      // 只请求指定平台，其他平台设为null占位
      switch (platformFilter.value) {
        case 'claude':
          requests.push(
            apiClient.get('/admin/claude-accounts', { params }),
            Promise.resolve({ success: true, data: [] }), // claude-console 占位
            Promise.resolve({ success: true, data: [] }), // bedrock 占位
            Promise.resolve({ success: true, data: [] }), // gemini 占位
            Promise.resolve({ success: true, data: [] }), // openai 占位
            Promise.resolve({ success: true, data: [] }), // azure-openai 占位
            Promise.resolve({ success: true, data: [] }), // openai-responses 占位
            Promise.resolve({ success: true, data: [] }), // ccr 占位
            Promise.resolve({ success: true, data: [] }), // droid 占位
            Promise.resolve({ success: true, data: [] }) // gemini-api 占位
          )
          break
        case 'claude-console':
          requests.push(
            Promise.resolve({ success: true, data: [] }), // claude 占位
            apiClient.get('/admin/claude-console-accounts', { params }),
            Promise.resolve({ success: true, data: [] }), // bedrock 占位
            Promise.resolve({ success: true, data: [] }), // gemini 占位
            Promise.resolve({ success: true, data: [] }), // openai 占位
            Promise.resolve({ success: true, data: [] }), // azure-openai 占位
            Promise.resolve({ success: true, data: [] }), // openai-responses 占位
            Promise.resolve({ success: true, data: [] }), // ccr 占位
            Promise.resolve({ success: true, data: [] }), // droid 占位
            Promise.resolve({ success: true, data: [] }) // gemini-api 占位
          )
          break
        case 'bedrock':
          requests.push(
            Promise.resolve({ success: true, data: [] }), // claude 占位
            Promise.resolve({ success: true, data: [] }), // claude-console 占位
            apiClient.get('/admin/bedrock-accounts', { params }),
            Promise.resolve({ success: true, data: [] }), // gemini 占位
            Promise.resolve({ success: true, data: [] }), // openai 占位
            Promise.resolve({ success: true, data: [] }), // azure-openai 占位
            Promise.resolve({ success: true, data: [] }), // openai-responses 占位
            Promise.resolve({ success: true, data: [] }), // ccr 占位
            Promise.resolve({ success: true, data: [] }), // droid 占位
            Promise.resolve({ success: true, data: [] }) // gemini-api 占位
          )
          break
        case 'gemini':
          requests.push(
            Promise.resolve({ success: true, data: [] }), // claude 占位
            Promise.resolve({ success: true, data: [] }), // claude-console 占位
            Promise.resolve({ success: true, data: [] }), // bedrock 占位
            apiClient.get('/admin/gemini-accounts', { params }),
            Promise.resolve({ success: true, data: [] }), // openai 占位
            Promise.resolve({ success: true, data: [] }), // azure-openai 占位
            Promise.resolve({ success: true, data: [] }), // openai-responses 占位
            Promise.resolve({ success: true, data: [] }), // ccr 占位
            Promise.resolve({ success: true, data: [] }), // droid 占位
            Promise.resolve({ success: true, data: [] }) // gemini-api 占位
          )
          break
        case 'openai':
          requests.push(
            Promise.resolve({ success: true, data: [] }), // claude 占位
            Promise.resolve({ success: true, data: [] }), // claude-console 占位
            Promise.resolve({ success: true, data: [] }), // bedrock 占位
            Promise.resolve({ success: true, data: [] }), // gemini 占位
            apiClient.get('/admin/openai-accounts', { params }),
            Promise.resolve({ success: true, data: [] }), // azure-openai 占位
            Promise.resolve({ success: true, data: [] }), // openai-responses 占位
            Promise.resolve({ success: true, data: [] }), // ccr 占位
            Promise.resolve({ success: true, data: [] }), // droid 占位
            Promise.resolve({ success: true, data: [] }) // gemini-api 占位
          )
          break
        case 'azure_openai':
          requests.push(
            Promise.resolve({ success: true, data: [] }), // claude 占位
            Promise.resolve({ success: true, data: [] }), // claude-console 占位
            Promise.resolve({ success: true, data: [] }), // bedrock 占位
            Promise.resolve({ success: true, data: [] }), // gemini 占位
            Promise.resolve({ success: true, data: [] }), // openai 占位
            apiClient.get('/admin/azure-openai-accounts', { params }),
            Promise.resolve({ success: true, data: [] }), // openai-responses 占位
            Promise.resolve({ success: true, data: [] }), // ccr 占位
            Promise.resolve({ success: true, data: [] }), // droid 占位
            Promise.resolve({ success: true, data: [] }) // gemini-api 占位
          )
          break
        case 'openai-responses':
          requests.push(
            Promise.resolve({ success: true, data: [] }), // claude 占位
            Promise.resolve({ success: true, data: [] }), // claude-console 占位
            Promise.resolve({ success: true, data: [] }), // bedrock 占位
            Promise.resolve({ success: true, data: [] }), // gemini 占位
            Promise.resolve({ success: true, data: [] }), // openai 占位
            Promise.resolve({ success: true, data: [] }), // azure-openai 占位
            apiClient.get('/admin/openai-responses-accounts', { params }),
            Promise.resolve({ success: true, data: [] }), // ccr 占位
            Promise.resolve({ success: true, data: [] }), // droid 占位
            Promise.resolve({ success: true, data: [] }) // gemini-api 占位
          )
          break
        case 'ccr':
          requests.push(
            Promise.resolve({ success: true, data: [] }), // claude 占位
            Promise.resolve({ success: true, data: [] }), // claude-console 占位
            Promise.resolve({ success: true, data: [] }), // bedrock 占位
            Promise.resolve({ success: true, data: [] }), // gemini 占位
            Promise.resolve({ success: true, data: [] }), // openai 占位
            Promise.resolve({ success: true, data: [] }), // azure 占位
            Promise.resolve({ success: true, data: [] }), // openai-responses 占位
            apiClient.get('/admin/ccr-accounts', { params }),
            Promise.resolve({ success: true, data: [] }), // droid 占位
            Promise.resolve({ success: true, data: [] }) // gemini-api 占位
          )
          break
        case 'droid':
          requests.push(
            Promise.resolve({ success: true, data: [] }), // claude 占位
            Promise.resolve({ success: true, data: [] }), // claude-console 占位
            Promise.resolve({ success: true, data: [] }), // bedrock 占位
            Promise.resolve({ success: true, data: [] }), // gemini 占位
            Promise.resolve({ success: true, data: [] }), // openai 占位
            Promise.resolve({ success: true, data: [] }), // azure 占位
            Promise.resolve({ success: true, data: [] }), // openai-responses 占位
            Promise.resolve({ success: true, data: [] }), // ccr 占位
            apiClient.get('/admin/droid-accounts', { params }),
            Promise.resolve({ success: true, data: [] }) // gemini-api 占位
          )
          break
        case 'gemini-api':
          requests.push(
            Promise.resolve({ success: true, data: [] }), // claude 占位
            Promise.resolve({ success: true, data: [] }), // claude-console 占位
            Promise.resolve({ success: true, data: [] }), // bedrock 占位
            Promise.resolve({ success: true, data: [] }), // gemini 占位
            Promise.resolve({ success: true, data: [] }), // openai 占位
            Promise.resolve({ success: true, data: [] }), // azure-openai 占位
            Promise.resolve({ success: true, data: [] }), // openai-responses 占位
            Promise.resolve({ success: true, data: [] }), // ccr 占位
            Promise.resolve({ success: true, data: [] }), // droid 占位
            apiClient.get('/admin/gemini-api-accounts', { params })
          )
          break
        default:
          // 默认情况下返回空数组
          requests.push(
            Promise.resolve({ success: true, data: [] }),
            Promise.resolve({ success: true, data: [] }),
            Promise.resolve({ success: true, data: [] }),
            Promise.resolve({ success: true, data: [] }),
            Promise.resolve({ success: true, data: [] }),
            Promise.resolve({ success: true, data: [] }),
            Promise.resolve({ success: true, data: [] }),
            Promise.resolve({ success: true, data: [] }),
            Promise.resolve({ success: true, data: [] }),
            Promise.resolve({ success: true, data: [] })
          )
          break
      }
    }

    // 使用缓存机制加载 API Keys 和分组数据
    await Promise.all([loadApiKeys(forceReload), loadAccountGroups(forceReload)])

    // 后端账户API已经包含分组信息，不需要单独加载分组成员关系
    // await loadGroupMembers(forceReload)

    const [
      claudeData,
      claudeConsoleData,
      bedrockData,
      geminiData,
      openaiData,
      azureOpenaiData,
      openaiResponsesData,
      ccrData,
      droidData,
      geminiApiData
    ] = await Promise.all(requests)

    const allAccounts = []

    if (claudeData.success) {
      const claudeAccounts = (claudeData.data || []).map((acc) => {
        // 计算每个Claude账户绑定的API Key数量
        const boundApiKeysCount = apiKeys.value.filter(
          (key) => key.claudeAccountId === acc.id
        ).length
        // 后端已经包含了groupInfos，直接使用
        return { ...acc, platform: 'claude', boundApiKeysCount }
      })
      allAccounts.push(...claudeAccounts)
    }

    if (claudeConsoleData.success) {
      const claudeConsoleAccounts = (claudeConsoleData.data || []).map((acc) => {
        // 计算每个Claude Console账户绑定的API Key数量
        const boundApiKeysCount = apiKeys.value.filter(
          (key) => key.claudeConsoleAccountId === acc.id
        ).length
        // 后端已经包含了groupInfos，直接使用
        return { ...acc, platform: 'claude-console', boundApiKeysCount }
      })
      allAccounts.push(...claudeConsoleAccounts)
    }

    if (bedrockData.success) {
      const bedrockAccounts = (bedrockData.data || []).map((acc) => {
        // Bedrock账户暂时不支持直接绑定
        // 后端已经包含了groupInfos，直接使用
        return { ...acc, platform: 'bedrock', boundApiKeysCount: 0 }
      })
      allAccounts.push(...bedrockAccounts)
    }

    if (geminiData.success) {
      const geminiAccounts = (geminiData.data || []).map((acc) => {
        // 计算每个Gemini账户绑定的API Key数量
        const boundApiKeysCount = apiKeys.value.filter(
          (key) => key.geminiAccountId === acc.id
        ).length
        // 后端已经包含了groupInfos，直接使用
        return { ...acc, platform: 'gemini', boundApiKeysCount }
      })
      allAccounts.push(...geminiAccounts)
    }
    if (openaiData.success) {
      const openaiAccounts = (openaiData.data || []).map((acc) => {
        // 计算每个OpenAI账户绑定的API Key数量
        const boundApiKeysCount = apiKeys.value.filter(
          (key) => key.openaiAccountId === acc.id
        ).length
        // 后端已经包含了groupInfos，直接使用
        return { ...acc, platform: 'openai', boundApiKeysCount }
      })
      allAccounts.push(...openaiAccounts)
    }
    if (azureOpenaiData && azureOpenaiData.success) {
      const azureOpenaiAccounts = (azureOpenaiData.data || []).map((acc) => {
        // 计算每个Azure OpenAI账户绑定的API Key数量
        const boundApiKeysCount = apiKeys.value.filter(
          (key) => key.azureOpenaiAccountId === acc.id
        ).length
        // 后端已经包含了groupInfos，直接使用
        return { ...acc, platform: 'azure_openai', boundApiKeysCount }
      })
      allAccounts.push(...azureOpenaiAccounts)
    }

    if (openaiResponsesData && openaiResponsesData.success) {
      const openaiResponsesAccounts = (openaiResponsesData.data || []).map((acc) => {
        // 计算每个OpenAI-Responses账户绑定的API Key数量
        // OpenAI-Responses账户使用 responses: 前缀
        const boundApiKeysCount = apiKeys.value.filter(
          (key) => key.openaiAccountId === `responses:${acc.id}`
        ).length
        // 后端已经包含了groupInfos，直接使用
        return { ...acc, platform: 'openai-responses', boundApiKeysCount }
      })
      allAccounts.push(...openaiResponsesAccounts)
    }

    // CCR 账户
    if (ccrData && ccrData.success) {
      const ccrAccounts = (ccrData.data || []).map((acc) => {
        // CCR 不支持 API Key 绑定，固定为 0
        return { ...acc, platform: 'ccr', boundApiKeysCount: 0 }
      })
      allAccounts.push(...ccrAccounts)
    }

    // Droid 账户
    if (droidData && droidData.success) {
      const droidAccounts = (droidData.data || []).map((acc) => {
        return {
          ...acc,
          platform: 'droid',
          boundApiKeysCount: acc.boundApiKeysCount ?? 0
        }
      })
      allAccounts.push(...droidAccounts)
    }

    // Gemini API 账户
    if (geminiApiData && geminiApiData.success) {
      const geminiApiAccounts = (geminiApiData.data || []).map((acc) => {
        // 计算每个Gemini-API账户绑定的API Key数量
        // Gemini-API账户使用 api: 前缀
        const boundApiKeysCount = apiKeys.value.filter(
          (key) => key.geminiAccountId === `api:${acc.id}`
        ).length
        // 后端已经包含了groupInfos，直接使用
        return { ...acc, platform: 'gemini-api', boundApiKeysCount }
      })
      allAccounts.push(...geminiApiAccounts)
    }

    // 根据分组筛选器过滤账户
    let filteredAccounts = allAccounts
    if (groupFilter.value !== 'all') {
      if (groupFilter.value === 'ungrouped') {
        // 筛选未分组的账户（没有 groupInfos 或 groupInfos 为空数组）
        filteredAccounts = allAccounts.filter((account) => {
          return !account.groupInfos || account.groupInfos.length === 0
        })
      } else {
        // 筛选属于特定分组的账户
        filteredAccounts = allAccounts.filter((account) => {
          if (!account.groupInfos || account.groupInfos.length === 0) {
            return false
          }
          // 检查账户是否属于选中的分组
          return account.groupInfos.some((group) => group.id === groupFilter.value)
        })
      }
    }

    filteredAccounts = filteredAccounts.map((account) => {
      const proxyConfig = normalizeProxyData(account.proxyConfig || account.proxy)
      return {
        ...account,
        proxyConfig: proxyConfig || null
      }
    })

    accounts.value = filteredAccounts
    cleanupSelectedAccounts()

    // 异步加载 Claude OAuth 账户的 usage 数据
    if (filteredAccounts.some((acc) => acc.platform === 'claude')) {
      loadClaudeUsage().catch((err) => {
        console.debug('Claude usage loading failed:', err)
      })
    }
  } catch (error) {
    showToast('加载账户失败', 'error')
  } finally {
    accountsLoading.value = false
  }
}

// 异步加载 Claude 账户的 Usage 数据
const loadClaudeUsage = async () => {
  try {
    const response = await apiClient.get('/admin/claude-accounts/usage')
    if (response.success && response.data) {
      const usageMap = response.data

      // 更新账户列表中的 claudeUsage 数据
      accounts.value = accounts.value.map((account) => {
        if (account.platform === 'claude' && usageMap[account.id]) {
          return {
            ...account,
            claudeUsage: usageMap[account.id]
          }
        }
        return account
      })
    }
  } catch (error) {
    console.debug('Failed to load Claude usage data:', error)
  }
}

// 排序账户
const sortAccounts = (field) => {
  if (field) {
    if (accountsSortBy.value === field) {
      accountsSortOrder.value = accountsSortOrder.value === 'asc' ? 'desc' : 'asc'
    } else {
      accountsSortBy.value = field
      accountsSortOrder.value = 'asc'
    }
  }
}

// 格式化数字（与原版保持一致）
const formatNumber = (num) => {
  if (num === null || num === undefined) return '0'
  const number = Number(num)
  if (number >= 1000000) {
    return (number / 1000000).toFixed(2)
  } else if (number >= 1000) {
    return (number / 1000000).toFixed(4)
  }
  return (number / 1000000).toFixed(6)
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

const clearSearch = () => {
  searchKeyword.value = ''
  currentPage.value = 1
}

// 加载API Keys列表（缓存版本）
const loadApiKeys = async (forceReload = false) => {
  if (!forceReload && apiKeysLoaded.value) {
    return // 使用缓存数据
  }

  try {
    const response = await apiClient.get('/admin/api-keys')
    if (response.success) {
      apiKeys.value = response.data || []
      apiKeysLoaded.value = true
    }
  } catch (error) {
    // 静默处理错误
  }
}

// 加载账户分组列表（缓存版本）
const loadAccountGroups = async (forceReload = false) => {
  if (!forceReload && groupsLoaded.value) {
    return // 使用缓存数据
  }

  try {
    const response = await apiClient.get('/admin/account-groups')
    if (response.success) {
      accountGroups.value = response.data || []
      groupsLoaded.value = true
    }
  } catch (error) {
    // 静默处理错误
  }
}

// 清空缓存的函数
const clearCache = () => {
  apiKeysLoaded.value = false
  groupsLoaded.value = false
  groupMembersLoaded.value = false
  accountGroupMap.value.clear()
}

// 按平台筛选账户
const filterByPlatform = () => {
  currentPage.value = 1
  loadAccounts()
}

// 按分组筛选账户
const filterByGroup = () => {
  currentPage.value = 1
  loadAccounts()
}

// 规范化代理配置，支持字符串与对象
function normalizeProxyData(proxy) {
  if (!proxy) {
    return null
  }

  let proxyObject = proxy
  if (typeof proxy === 'string') {
    try {
      proxyObject = JSON.parse(proxy)
    } catch (error) {
      return null
    }
  }

  if (!proxyObject || typeof proxyObject !== 'object') {
    return null
  }

  const candidate =
    proxyObject.proxy && typeof proxyObject.proxy === 'object' ? proxyObject.proxy : proxyObject

  const host =
    typeof candidate.host === 'string'
      ? candidate.host.trim()
      : candidate.host !== undefined && candidate.host !== null
        ? String(candidate.host).trim()
        : ''

  const port =
    candidate.port !== undefined && candidate.port !== null ? String(candidate.port).trim() : ''

  if (!host || !port) {
    return null
  }

  const type =
    typeof candidate.type === 'string' && candidate.type.trim() ? candidate.type.trim() : 'socks5'

  const username =
    typeof candidate.username === 'string'
      ? candidate.username
      : candidate.username !== undefined && candidate.username !== null
        ? String(candidate.username)
        : ''

  const password =
    typeof candidate.password === 'string'
      ? candidate.password
      : candidate.password !== undefined && candidate.password !== null
        ? String(candidate.password)
        : ''

  return {
    type,
    host,
    port,
    username,
    password
  }
}

// 格式化代理信息显示
const formatProxyDisplay = (proxy) => {
  const parsed = normalizeProxyData(proxy)
  if (!parsed) {
    return null
  }

  const typeShort = parsed.type.toLowerCase() === 'socks5' ? 'S5' : parsed.type.toUpperCase()

  let host = parsed.host
  if (host.length > 15) {
    host = host.substring(0, 12) + '...'
  }

  let display = `${typeShort}://${host}:${parsed.port}`

  if (parsed.username) {
    display = `${typeShort}://***@${host}:${parsed.port}`
  }

  return display
}

// 格式化会话窗口时间
const formatSessionWindow = (windowStart, windowEnd) => {
  if (!windowStart || !windowEnd) return '--'

  const start = new Date(windowStart)
  const end = new Date(windowEnd)

  const startHour = start.getHours().toString().padStart(2, '0')
  const startMin = start.getMinutes().toString().padStart(2, '0')
  const endHour = end.getHours().toString().padStart(2, '0')
  const endMin = end.getMinutes().toString().padStart(2, '0')

  return `${startHour}:${startMin} - ${endHour}:${endMin}`
}

// 格式化剩余时间
const formatRemainingTime = (minutes) => {
  if (!minutes || minutes <= 0) return '已结束'

  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60

  if (hours > 0) {
    return `${hours}小时${mins}分钟`
  }
  return `${mins}分钟`
}

// 格式化限流时间（支持显示天数）
const formatRateLimitTime = (minutes) => {
  if (!minutes || minutes <= 0) return ''

  // 转换为整数，避免小数
  minutes = Math.floor(minutes)

  // 计算天数、小时和分钟
  const days = Math.floor(minutes / 1440) // 1天 = 1440分钟
  const remainingAfterDays = minutes % 1440
  const hours = Math.floor(remainingAfterDays / 60)
  const mins = remainingAfterDays % 60

  // 根据时间长度返回不同格式
  if (days > 0) {
    // 超过1天，显示天数和小时
    if (hours > 0) {
      return `${days}天${hours}小时`
    }
    return `${days}天`
  } else if (hours > 0) {
    // 超过1小时但不到1天，显示小时和分钟
    if (mins > 0) {
      return `${hours}小时${mins}分钟`
    }
    return `${hours}小时`
  } else {
    // 不到1小时，只显示分钟
    return `${mins}分钟`
  }
}

// 打开创建账户模态框
const openCreateAccountModal = () => {
  newAccountPlatform.value = null // 重置选择的平台
  showCreateAccountModal.value = true
}

// 关闭创建账户模态框
const closeCreateAccountModal = () => {
  showCreateAccountModal.value = false
  newAccountPlatform.value = null
}

// 编辑账户
const editAccount = (account) => {
  editingAccount.value = account
  showEditAccountModal.value = true
}

const getBoundApiKeysForAccount = (account) => {
  if (!account || !account.id) return []
  return apiKeys.value.filter((key) => {
    const accountId = account.id
    return (
      key.claudeAccountId === accountId ||
      key.claudeConsoleAccountId === accountId ||
      key.geminiAccountId === accountId ||
      key.openaiAccountId === accountId ||
      key.azureOpenaiAccountId === accountId ||
      key.openaiAccountId === `responses:${accountId}` ||
      key.geminiAccountId === `api:${accountId}`
    )
  })
}

const resolveAccountDeleteEndpoint = (account) => {
  switch (account.platform) {
    case 'claude':
      return `/admin/claude-accounts/${account.id}`
    case 'claude-console':
      return `/admin/claude-console-accounts/${account.id}`
    case 'bedrock':
      return `/admin/bedrock-accounts/${account.id}`
    case 'openai':
      return `/admin/openai-accounts/${account.id}`
    case 'azure_openai':
      return `/admin/azure-openai-accounts/${account.id}`
    case 'openai-responses':
      return `/admin/openai-responses-accounts/${account.id}`
    case 'ccr':
      return `/admin/ccr-accounts/${account.id}`
    case 'gemini':
      return `/admin/gemini-accounts/${account.id}`
    case 'droid':
      return `/admin/droid-accounts/${account.id}`
    case 'gemini-api':
      return `/admin/gemini-api-accounts/${account.id}`
    default:
      return null
  }
}

const performAccountDeletion = async (account) => {
  const endpoint = resolveAccountDeleteEndpoint(account)
  if (!endpoint) {
    return { success: false, message: '不支持的账户类型' }
  }

  try {
    const data = await apiClient.delete(endpoint)
    if (data.success) {
      return { success: true, data }
    }
    return { success: false, message: data.message || '删除失败' }
  } catch (error) {
    const message = error.response?.data?.message || error.message || '删除失败'
    return { success: false, message }
  }
}

// 删除账户
const deleteAccount = async (account) => {
  const boundKeys = getBoundApiKeysForAccount(account)
  const boundKeysCount = boundKeys.length

  let confirmMessage = `确定要删除账户 "${account.name}" 吗？`
  if (boundKeysCount > 0) {
    confirmMessage += `\n\n⚠️ 注意：此账号有 ${boundKeysCount} 个 API Key 绑定。`
    confirmMessage += `\n删除后，这些 API Key 将自动切换为共享池模式。`
  }
  confirmMessage += '\n\n此操作不可恢复。'

  const confirmed = await showConfirm('删除账户', confirmMessage, '删除', '取消')

  if (!confirmed) return

  const result = await performAccountDeletion(account)

  if (result.success) {
    const data = result.data
    let toastMessage = '账户已成功删除'
    if (data?.unboundKeys > 0) {
      toastMessage += `，${data.unboundKeys} 个 API Key 已切换为共享池模式`
    }
    showToast(toastMessage, 'success')

    selectedAccounts.value = selectedAccounts.value.filter((id) => id !== account.id)
    updateSelectAllState()

    groupMembersLoaded.value = false
    apiKeysLoaded.value = false
    loadAccounts()
    loadApiKeys(true)
  } else {
    showToast(result.message || '删除失败', 'error')
  }
}

// 批量删除账户
const batchDeleteAccounts = async () => {
  if (selectedAccounts.value.length === 0) {
    showToast('请先选择要删除的账户', 'warning')
    return
  }

  const accountsMap = new Map(accounts.value.map((item) => [item.id, item]))
  const targets = selectedAccounts.value
    .map((id) => accountsMap.get(id))
    .filter((account) => !!account)

  if (targets.length === 0) {
    showToast('选中的账户已不存在', 'warning')
    selectedAccounts.value = []
    updateSelectAllState()
    return
  }

  let confirmMessage = `确定要删除选中的 ${targets.length} 个账户吗？此操作不可恢复。`
  const boundInfo = targets
    .map((account) => ({ account, boundKeys: getBoundApiKeysForAccount(account) }))
    .filter((item) => item.boundKeys.length > 0)

  if (boundInfo.length > 0) {
    confirmMessage += '\n\n⚠️ 以下账户存在绑定的 API Key，将自动解绑：'
    boundInfo.forEach(({ account, boundKeys }) => {
      const displayName = account.name || account.email || account.accountName || account.id
      confirmMessage += `\n- ${displayName}: ${boundKeys.length} 个`
    })
    confirmMessage += '\n删除后，这些 API Key 将切换为共享池模式。'
  }

  confirmMessage += '\n\n请再次确认是否继续。'

  const confirmed = await showConfirm('批量删除账户', confirmMessage, '删除', '取消')
  if (!confirmed) return

  let successCount = 0
  let failedCount = 0
  let totalUnboundKeys = 0
  const failedDetails = []

  for (const account of targets) {
    const result = await performAccountDeletion(account)
    if (result.success) {
      successCount += 1
      totalUnboundKeys += result.data?.unboundKeys || 0
    } else {
      failedCount += 1
      failedDetails.push({
        name: account.name || account.email || account.accountName || account.id,
        message: result.message || '删除失败'
      })
    }
  }

  if (successCount > 0) {
    let toastMessage = `成功删除 ${successCount} 个账户`
    if (totalUnboundKeys > 0) {
      toastMessage += `，${totalUnboundKeys} 个 API Key 已切换为共享池模式`
    }
    showToast(toastMessage, failedCount > 0 ? 'warning' : 'success')

    selectedAccounts.value = []
    selectAllChecked.value = false
    isIndeterminate.value = false

    groupMembersLoaded.value = false
    apiKeysLoaded.value = false
    await loadAccounts(true)
  }

  if (failedCount > 0) {
    const detailMessage = failedDetails.map((item) => `${item.name}: ${item.message}`).join('\n')
    showToast(
      `有 ${failedCount} 个账户删除失败:\n${detailMessage}`,
      successCount > 0 ? 'warning' : 'error'
    )
  }

  updateSelectAllState()
}

// 重置账户状态
const resetAccountStatus = async (account) => {
  if (account.isResetting) return

  let confirmed = false
  if (window.showConfirm) {
    confirmed = await window.showConfirm(
      '重置账户状态',
      '确定要重置此账户的所有异常状态吗？这将清除限流状态、401错误计数等所有异常标记。',
      '确定重置',
      '取消'
    )
  } else {
    confirmed = confirm('确定要重置此账户的所有异常状态吗？')
  }

  if (!confirmed) return

  try {
    account.isResetting = true

    // 根据账户平台选择不同的 API 端点
    let endpoint = ''
    if (account.platform === 'openai') {
      endpoint = `/admin/openai-accounts/${account.id}/reset-status`
    } else if (account.platform === 'openai-responses') {
      endpoint = `/admin/openai-responses-accounts/${account.id}/reset-status`
    } else if (account.platform === 'claude') {
      endpoint = `/admin/claude-accounts/${account.id}/reset-status`
    } else if (account.platform === 'claude-console') {
      endpoint = `/admin/claude-console-accounts/${account.id}/reset-status`
    } else if (account.platform === 'ccr') {
      endpoint = `/admin/ccr-accounts/${account.id}/reset-status`
    } else if (account.platform === 'droid') {
      endpoint = `/admin/droid-accounts/${account.id}/reset-status`
    } else if (account.platform === 'gemini-api') {
      endpoint = `/admin/gemini-api-accounts/${account.id}/reset-status`
    } else if (account.platform === 'gemini') {
      endpoint = `/admin/gemini-accounts/${account.id}/reset-status`
    } else {
      showToast('不支持的账户类型', 'error')
      account.isResetting = false
      return
    }

    const data = await apiClient.post(endpoint)

    if (data.success) {
      showToast('账户状态已重置', 'success')
      // 强制刷新，绕过前端缓存，确保最终一致性
      loadAccounts(true)
    } else {
      showToast(data.message || '状态重置失败', 'error')
    }
  } catch (error) {
    showToast('状态重置失败', 'error')
  } finally {
    account.isResetting = false
  }
}

// 切换调度状态
const toggleSchedulable = async (account) => {
  if (account.isTogglingSchedulable) return

  try {
    account.isTogglingSchedulable = true

    let endpoint
    if (account.platform === 'claude') {
      endpoint = `/admin/claude-accounts/${account.id}/toggle-schedulable`
    } else if (account.platform === 'claude-console') {
      endpoint = `/admin/claude-console-accounts/${account.id}/toggle-schedulable`
    } else if (account.platform === 'bedrock') {
      endpoint = `/admin/bedrock-accounts/${account.id}/toggle-schedulable`
    } else if (account.platform === 'gemini') {
      endpoint = `/admin/gemini-accounts/${account.id}/toggle-schedulable`
    } else if (account.platform === 'openai') {
      endpoint = `/admin/openai-accounts/${account.id}/toggle-schedulable`
    } else if (account.platform === 'azure_openai') {
      endpoint = `/admin/azure-openai-accounts/${account.id}/toggle-schedulable`
    } else if (account.platform === 'openai-responses') {
      endpoint = `/admin/openai-responses-accounts/${account.id}/toggle-schedulable`
    } else if (account.platform === 'ccr') {
      endpoint = `/admin/ccr-accounts/${account.id}/toggle-schedulable`
    } else if (account.platform === 'droid') {
      endpoint = `/admin/droid-accounts/${account.id}/toggle-schedulable`
    } else if (account.platform === 'gemini-api') {
      endpoint = `/admin/gemini-api-accounts/${account.id}/toggle-schedulable`
    } else {
      showToast('该账户类型暂不支持调度控制', 'warning')
      return
    }

    const data = await apiClient.put(endpoint)

    if (data.success) {
      account.schedulable = data.schedulable
      showToast(data.schedulable ? '已启用调度' : '已禁用调度', 'success')
    } else {
      showToast(data.message || '操作失败', 'error')
    }
  } catch (error) {
    showToast('切换调度状态失败', 'error')
  } finally {
    account.isTogglingSchedulable = false
  }
}

// 处理创建成功
const handleCreateSuccess = () => {
  showCreateAccountModal.value = false
  showToast('账户创建成功', 'success')
  // 清空缓存，因为可能涉及分组关系变化
  clearCache()
  loadAccounts()
}

// 处理编辑成功
const handleEditSuccess = () => {
  showEditAccountModal.value = false
  showToast('账户更新成功', 'success')
  // 清空分组成员缓存，因为账户类型和分组可能发生变化
  groupMembersLoaded.value = false
  loadAccounts()
}

// 获取 Claude 账号的添加方式
const getClaudeAuthType = (account) => {
  // 基于 lastRefreshAt 判断：如果为空说明是 Setup Token（不能刷新），否则是 OAuth
  if (!account.lastRefreshAt || account.lastRefreshAt === '') {
    return 'Setup' // 缩短显示文本
  }
  return 'OAuth'
}

// 获取 Gemini 账号的添加方式
const getGeminiAuthType = () => {
  // Gemini 统一显示 OAuth
  return 'OAuth'
}

// 获取 OpenAI 账号的添加方式
const getOpenAIAuthType = () => {
  // OpenAI 统一显示 OAuth
  return 'OAuth'
}

// 获取 Droid 账号的认证方式
const getDroidAuthType = (account) => {
  if (!account || typeof account !== 'object') {
    return 'OAuth'
  }

  const apiKeyModeFlag =
    account.isApiKeyMode ?? account.is_api_key_mode ?? account.apiKeyMode ?? account.api_key_mode

  if (
    apiKeyModeFlag === true ||
    apiKeyModeFlag === 'true' ||
    apiKeyModeFlag === 1 ||
    apiKeyModeFlag === '1'
  ) {
    return 'API Key'
  }

  const methodCandidate =
    account.authenticationMethod ||
    account.authMethod ||
    account.authentication_mode ||
    account.authenticationMode ||
    account.authentication_method ||
    account.auth_type ||
    account.authType ||
    account.authentication_type ||
    account.authenticationType ||
    account.droidAuthType ||
    account.droidAuthenticationMethod ||
    account.method ||
    account.auth ||
    ''

  if (typeof methodCandidate === 'string') {
    const normalized = methodCandidate.trim().toLowerCase()
    const compacted = normalized.replace(/[\s_-]/g, '')

    if (compacted === 'apikey') {
      return 'API Key'
    }
  }

  return 'OAuth'
}

// 判断是否为 API Key 模式的 Droid 账号
const isDroidApiKeyMode = (account) => getDroidAuthType(account) === 'API Key'

// 获取 Droid 账号的 API Key 数量
const getDroidApiKeyCount = (account) => {
  if (!account || typeof account !== 'object') {
    return 0
  }

  // 优先使用 apiKeys 数组来计算正常状态的 API Keys
  if (Array.isArray(account.apiKeys)) {
    // 只计算状态不是 'error' 的 API Keys
    return account.apiKeys.filter((apiKey) => apiKey.status !== 'error').length
  }

  // 如果是字符串格式的 apiKeys，尝试解析
  if (typeof account.apiKeys === 'string' && account.apiKeys.trim()) {
    try {
      const parsed = JSON.parse(account.apiKeys)
      if (Array.isArray(parsed)) {
        // 只计算状态不是 'error' 的 API Keys
        return parsed.filter((apiKey) => apiKey.status !== 'error').length
      }
    } catch (error) {
      // 忽略解析错误，继续使用其他字段
    }
  }

  const candidates = [
    account.apiKeyCount,
    account.api_key_count,
    account.apiKeysCount,
    account.api_keys_count
  ]

  for (const candidate of candidates) {
    const value = Number(candidate)
    if (Number.isFinite(value) && value >= 0) {
      return value
    }
  }

  return 0
}

// 根据数量返回徽标样式
const getDroidApiKeyBadgeClasses = (account) => {
  const count = getDroidApiKeyCount(account)
  const baseClass =
    'ml-1 inline-flex items-center gap-1 rounded-md border px-1.5 py-[1px] text-[10px] font-medium shadow-sm backdrop-blur-sm'

  if (count > 0) {
    return [
      baseClass,
      'border-cyan-200 bg-cyan-50/90 text-cyan-700 dark:border-cyan-500/40 dark:bg-cyan-900/40 dark:text-cyan-200'
    ]
  }

  return [
    baseClass,
    'border-rose-200 bg-rose-50/90 text-rose-600 dark:border-rose-500/40 dark:bg-rose-900/40 dark:text-rose-200'
  ]
}

// 获取 Claude 账号类型显示
const getClaudeAccountType = (account) => {
  // 如果有订阅信息
  if (account.subscriptionInfo) {
    try {
      // 如果 subscriptionInfo 是字符串，尝试解析
      const info =
        typeof account.subscriptionInfo === 'string'
          ? JSON.parse(account.subscriptionInfo)
          : account.subscriptionInfo

      // 订阅信息已解析

      // 根据 has_claude_max 和 has_claude_pro 判断
      if (info.hasClaudeMax === true) {
        return 'Claude Max'
      } else if (info.hasClaudePro === true) {
        return 'Claude Pro'
      } else {
        return 'Claude Free'
      }
    } catch (e) {
      // 解析失败，返回默认值
      return 'Claude'
    }
  }

  // 没有订阅信息，保持原有显示
  return 'Claude'
}

// 获取停止调度的原因
const getSchedulableReason = (account) => {
  if (account.schedulable !== false) return null

  // Claude Console 账户的错误状态
  if (account.platform === 'claude-console') {
    if (account.status === 'unauthorized') {
      return 'API Key无效或已过期（401错误）'
    }
    if (account.overloadStatus === 'overloaded') {
      return '服务过载（529错误）'
    }
    if (account.rateLimitStatus === 'limited') {
      return '触发限流（429错误）'
    }
    if (account.status === 'blocked' && account.errorMessage) {
      return account.errorMessage
    }
  }

  // Claude 官方账户的错误状态
  if (account.platform === 'claude') {
    if (account.status === 'unauthorized') {
      return '认证失败（401错误）'
    }
    if (account.status === 'temp_error' && account.errorMessage) {
      return account.errorMessage
    }
    if (account.status === 'error' && account.errorMessage) {
      return account.errorMessage
    }
    if (account.isRateLimited) {
      return '触发限流（429错误）'
    }
    // 自动停止调度的原因
    if (account.stoppedReason) {
      return account.stoppedReason
    }
    // 检查5小时限制自动停止标志（备用方案）
    if (account.fiveHourAutoStopped === 'true' || account.fiveHourAutoStopped === true) {
      return '5小时使用量接近限制，已自动停止调度'
    }
  }

  // OpenAI 账户的错误状态
  if (account.platform === 'openai') {
    if (account.status === 'unauthorized') {
      return '认证失败（401错误）'
    }
    // 检查限流状态 - 兼容嵌套的 rateLimitStatus 对象
    if (
      (account.rateLimitStatus && account.rateLimitStatus.isRateLimited) ||
      account.isRateLimited
    ) {
      return '触发限流（429错误）'
    }
    if (account.status === 'error' && account.errorMessage) {
      return account.errorMessage
    }
  }

  // OpenAI-Responses 账户的错误状态
  if (account.platform === 'openai-responses') {
    if (account.status === 'unauthorized') {
      return '认证失败（401错误）'
    }
    // 检查限流状态 - 兼容嵌套的 rateLimitStatus 对象
    if (
      (account.rateLimitStatus && account.rateLimitStatus.isRateLimited) ||
      account.isRateLimited
    ) {
      return '触发限流（429错误）'
    }
    if (account.status === 'error' && account.errorMessage) {
      return account.errorMessage
    }
    if (account.status === 'rateLimited') {
      return '触发限流（429错误）'
    }
  }

  // 通用原因
  if (account.stoppedReason) {
    return account.stoppedReason
  }
  if (account.errorMessage) {
    return account.errorMessage
  }

  // 默认为手动停止
  return '手动停止调度'
}

// 获取账户状态文本
const getAccountStatusText = (account) => {
  // 检查是否被封锁
  if (account.status === 'blocked') return '已封锁'
  // 检查是否未授权（401错误）
  if (account.status === 'unauthorized') return '异常'
  // 检查是否限流
  if (
    account.isRateLimited ||
    account.status === 'rate_limited' ||
    (account.rateLimitStatus && account.rateLimitStatus.isRateLimited) ||
    account.rateLimitStatus === 'limited'
  )
    return '限流中'
  // 检查是否临时错误
  if (account.status === 'temp_error') return '临时异常'
  // 检查是否错误
  if (account.status === 'error' || !account.isActive) return '错误'
  // 检查是否可调度
  if (account.schedulable === false) return '已暂停'
  // 否则正常
  return '正常'
}

// 获取账户状态样式类
const getAccountStatusClass = (account) => {
  if (account.status === 'blocked') {
    return 'bg-red-100 text-red-800'
  }
  if (account.status === 'unauthorized') {
    return 'bg-red-100 text-red-800'
  }
  if (
    account.isRateLimited ||
    account.status === 'rate_limited' ||
    (account.rateLimitStatus && account.rateLimitStatus.isRateLimited) ||
    account.rateLimitStatus === 'limited'
  ) {
    return 'bg-orange-100 text-orange-800'
  }
  if (account.status === 'temp_error') {
    return 'bg-orange-100 text-orange-800'
  }
  if (account.status === 'error' || !account.isActive) {
    return 'bg-red-100 text-red-800'
  }
  if (account.schedulable === false) {
    return 'bg-gray-100 text-gray-800'
  }
  return 'bg-green-100 text-green-800'
}

// 获取账户状态点样式类
const getAccountStatusDotClass = (account) => {
  if (account.status === 'blocked') {
    return 'bg-red-500'
  }
  if (account.status === 'unauthorized') {
    return 'bg-red-500'
  }
  if (
    account.isRateLimited ||
    account.status === 'rate_limited' ||
    (account.rateLimitStatus && account.rateLimitStatus.isRateLimited) ||
    account.rateLimitStatus === 'limited'
  ) {
    return 'bg-orange-500'
  }
  if (account.status === 'temp_error') {
    return 'bg-orange-500'
  }
  if (account.status === 'error' || !account.isActive) {
    return 'bg-red-500'
  }
  if (account.schedulable === false) {
    return 'bg-gray-500'
  }
  return 'bg-green-500'
}

// 获取会话窗口百分比
// const getSessionWindowPercentage = (account) => {
//   if (!account.sessionWindow) return 100
//   const { remaining, total } = account.sessionWindow
//   if (!total || total === 0) return 100
//   return Math.round((remaining / total) * 100)
// }

// 格式化相对时间
const formatRelativeTime = (dateString) => {
  return formatLastUsed(dateString)
}

// 获取会话窗口进度条的样式类
const getSessionProgressBarClass = (status, account = null) => {
  // 根据状态返回不同的颜色类，包含防御性检查
  if (!status) {
    // 无状态信息时默认为蓝色
    return 'bg-gradient-to-r from-blue-500 to-indigo-600'
  }

  // 检查账号是否处于限流状态
  const isRateLimited =
    account &&
    (account.isRateLimited ||
      account.status === 'rate_limited' ||
      (account.rateLimitStatus && account.rateLimitStatus.isRateLimited) ||
      account.rateLimitStatus === 'limited')

  // 如果账号处于限流状态，显示红色
  if (isRateLimited) {
    return 'bg-gradient-to-r from-red-500 to-red-600'
  }

  // 转换为小写进行比较，避免大小写问题
  const normalizedStatus = String(status).toLowerCase()

  if (normalizedStatus === 'rejected') {
    // 被拒绝 - 红色
    return 'bg-gradient-to-r from-red-500 to-red-600'
  } else if (normalizedStatus === 'allowed_warning') {
    // 警告状态 - 橙色/黄色
    return 'bg-gradient-to-r from-yellow-500 to-orange-500'
  } else {
    // 正常状态（allowed 或其他） - 蓝色
    return 'bg-gradient-to-r from-blue-500 to-indigo-600'
  }
}

// ====== Claude OAuth Usage 相关函数 ======

// 判断 Claude 账户是否为 OAuth 授权
const isClaudeOAuth = (account) => {
  return account.authType === 'oauth'
}

// 格式化 Claude 使用率百分比
const formatClaudeUsagePercent = (window) => {
  if (!window || window.utilization === null || window.utilization === undefined) {
    return '-'
  }
  return `${window.utilization}%`
}

// 获取 Claude 使用率宽度
const getClaudeUsageWidth = (window) => {
  if (!window || window.utilization === null || window.utilization === undefined) {
    return '0%'
  }
  return `${window.utilization}%`
}

// 获取 Claude 使用率进度条颜色
const getClaudeUsageBarClass = (window) => {
  const util = window?.utilization || 0
  if (util < 60) {
    return 'bg-gradient-to-r from-blue-500 to-indigo-600'
  }
  if (util < 90) {
    return 'bg-gradient-to-r from-yellow-500 to-orange-500'
  }
  return 'bg-gradient-to-r from-red-500 to-red-600'
}

// 格式化 Claude 剩余时间
const formatClaudeRemaining = (window) => {
  if (!window || !window.remainingSeconds) {
    return '-'
  }

  const seconds = window.remainingSeconds
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)

  if (days > 0) {
    if (hours > 0) {
      return `${days}天${hours}小时`
    }
    return `${days}天`
  }
  if (hours > 0) {
    if (minutes > 0) {
      return `${hours}小时${minutes}分钟`
    }
    return `${hours}小时`
  }
  if (minutes > 0) {
    return `${minutes}分钟`
  }
  return `${Math.floor(seconds % 60)}秒`
}

// 归一化 OpenAI 会话窗口使用率
const normalizeCodexUsagePercent = (usageItem) => {
  if (!usageItem) {
    return null
  }

  const basePercent =
    typeof usageItem.usedPercent === 'number' && !Number.isNaN(usageItem.usedPercent)
      ? usageItem.usedPercent
      : null

  const resetAfterSeconds =
    typeof usageItem.resetAfterSeconds === 'number' && !Number.isNaN(usageItem.resetAfterSeconds)
      ? usageItem.resetAfterSeconds
      : null

  const remainingSeconds =
    typeof usageItem.remainingSeconds === 'number' ? usageItem.remainingSeconds : null

  const resetAtMs = usageItem.resetAt ? Date.parse(usageItem.resetAt) : null

  const resetElapsed =
    resetAfterSeconds !== null &&
    ((remainingSeconds !== null && remainingSeconds <= 0) ||
      (resetAtMs !== null && !Number.isNaN(resetAtMs) && Date.now() >= resetAtMs))

  if (resetElapsed) {
    return 0
  }

  if (basePercent === null) {
    return null
  }

  return Math.max(0, Math.min(100, basePercent))
}

// OpenAI 限额进度条颜色
const getCodexUsageBarClass = (usageItem) => {
  const percent = normalizeCodexUsagePercent(usageItem)
  if (percent === null) {
    return 'bg-gradient-to-r from-gray-300 to-gray-400'
  }
  if (percent >= 90) {
    return 'bg-gradient-to-r from-red-500 to-red-600'
  }
  if (percent >= 75) {
    return 'bg-gradient-to-r from-yellow-500 to-orange-500'
  }
  return 'bg-gradient-to-r from-emerald-500 to-teal-500'
}

// 百分比显示
const formatCodexUsagePercent = (usageItem) => {
  const percent = normalizeCodexUsagePercent(usageItem)
  if (percent === null) {
    return '--'
  }
  return `${percent.toFixed(1)}%`
}

// 进度条宽度
const getCodexUsageWidth = (usageItem) => {
  const percent = normalizeCodexUsagePercent(usageItem)
  if (percent === null) {
    return '0%'
  }
  return `${percent}%`
}

// 时间窗口标签
const getCodexWindowLabel = (type) => {
  if (type === 'secondary') {
    return '周限'
  }
  return '5h'
}

// 格式化剩余时间
const formatCodexRemaining = (usageItem) => {
  if (!usageItem) {
    return '--'
  }

  let seconds = usageItem.remainingSeconds
  if (seconds === null || seconds === undefined) {
    seconds = usageItem.resetAfterSeconds
  }

  if (seconds === null || seconds === undefined || Number.isNaN(Number(seconds))) {
    return '--'
  }

  seconds = Math.max(0, Math.floor(Number(seconds)))

  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60

  if (days > 0) {
    if (hours > 0) {
      return `${days}天${hours}小时`
    }
    return `${days}天`
  }
  if (hours > 0) {
    if (minutes > 0) {
      return `${hours}小时${minutes}分钟`
    }
    return `${hours}小时`
  }
  if (minutes > 0) {
    return `${minutes}分钟`
  }
  return `${secs}秒`
}

// 格式化费用显示
const formatCost = (cost) => {
  if (!cost || cost === 0) return '0.0000'
  if (cost < 0.0001) return cost.toExponential(2)
  if (cost < 0.01) return cost.toFixed(6)
  if (cost < 1) return cost.toFixed(4)
  return cost.toFixed(2)
}

// 额度使用百分比（Claude Console）
const getQuotaUsagePercent = (account) => {
  const used = Number(account?.usage?.daily?.cost || 0)
  const quota = Number(account?.dailyQuota || 0)
  if (!quota || quota <= 0) return 0
  return (used / quota) * 100
}

// 额度进度条颜色（Claude Console）
const getQuotaBarClass = (percent) => {
  if (percent >= 90) return 'bg-red-500'
  if (percent >= 70) return 'bg-yellow-500'
  return 'bg-green-500'
}

// 并发使用百分比（Claude Console）
const getConsoleConcurrencyPercent = (account) => {
  const max = Number(account?.maxConcurrentTasks || 0)
  if (!max || max <= 0) return 0
  const active = Number(account?.activeTaskCount || 0)
  return Math.min(100, (active / max) * 100)
}

// 并发进度条颜色（Claude Console）
const getConcurrencyBarClass = (percent) => {
  if (percent >= 100) return 'bg-red-500'
  if (percent >= 80) return 'bg-yellow-500'
  return 'bg-green-500'
}

// 并发标签颜色（Claude Console）
const getConcurrencyLabelClass = (account) => {
  const max = Number(account?.maxConcurrentTasks || 0)
  if (!max || max <= 0) return 'text-gray-500 dark:text-gray-400'
  const active = Number(account?.activeTaskCount || 0)
  if (active >= max) {
    return 'text-red-600 dark:text-red-400'
  }
  if (active >= max * 0.8) {
    return 'text-yellow-600 dark:text-yellow-400'
  }
  return 'text-gray-700 dark:text-gray-200'
}

// 剩余额度（Claude Console）
const formatRemainingQuota = (account) => {
  const used = Number(account?.usage?.daily?.cost || 0)
  const quota = Number(account?.dailyQuota || 0)
  if (!quota || quota <= 0) return '0.00'
  return Math.max(0, quota - used).toFixed(2)
}

// 计算每日费用（使用后端返回的精确费用数据）
const calculateDailyCost = (account) => {
  if (!account.usage || !account.usage.daily) return '0.0000'

  // 如果后端已经返回了计算好的费用，直接使用
  if (account.usage.daily.cost !== undefined) {
    return formatCost(account.usage.daily.cost)
  }

  // 如果后端没有返回费用（旧版本），返回0
  return '0.0000'
}

// 切换调度状态
// const toggleDispatch = async (account) => {
//   await toggleSchedulable(account)
// }

watch(searchKeyword, () => {
  currentPage.value = 1
  updateSelectAllState()
})

watch(pageSize, (newSize) => {
  localStorage.setItem(PAGE_SIZE_STORAGE_KEY, newSize.toString())
  updateSelectAllState()
})

watch(
  () => sortedAccounts.value.length,
  () => {
    if (currentPage.value > totalPages.value) {
      currentPage.value = totalPages.value || 1
    }
    updateSelectAllState()
  }
)

// 监听排序选择变化
watch(accountSortBy, (newVal) => {
  const fieldMap = {
    name: 'name',
    dailyTokens: 'dailyTokens',
    dailyRequests: 'dailyRequests',
    totalTokens: 'totalTokens',
    lastUsed: 'lastUsed'
  }

  if (fieldMap[newVal]) {
    sortAccounts(fieldMap[newVal])
  }
})

watch(currentPage, () => {
  updateSelectAllState()
})

watch(paginatedAccounts, () => {
  updateSelectAllState()
})

watch(accounts, () => {
  cleanupSelectedAccounts()
})
// 到期时间相关方法
const formatExpireDate = (dateString) => {
  if (!dateString) return ''
  const date = new Date(dateString)
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  })
}

const isExpired = (expiresAt) => {
  if (!expiresAt) return false
  return new Date(expiresAt) < new Date()
}

const isExpiringSoon = (expiresAt) => {
  if (!expiresAt) return false
  const now = new Date()
  const expireDate = new Date(expiresAt)
  const daysUntilExpire = (expireDate - now) / (1000 * 60 * 60 * 24)
  return daysUntilExpire > 0 && daysUntilExpire <= 7
}

// 开始编辑账户过期时间
const startEditAccountExpiry = (account) => {
  editingExpiryAccount.value = account
}

// 关闭账户过期时间编辑
const closeAccountExpiryEdit = () => {
  editingExpiryAccount.value = null
}

// 保存账户过期时间
const handleSaveAccountExpiry = async ({ accountId, expiresAt }) => {
  try {
    // 根据账号平台选择正确的 API 端点
    const account = accounts.value.find((acc) => acc.id === accountId)

    if (!account) {
      showToast('未找到账户', 'error')
      return
    }

    // 定义每个平台的端点和参数名
    // 注意：部分平台使用 :accountId，部分使用 :id
    let endpoint = ''
    switch (account.platform) {
      case 'claude':
      case 'claude-oauth':
        endpoint = `/admin/claude-accounts/${accountId}`
        break
      case 'gemini':
        endpoint = `/admin/gemini-accounts/${accountId}`
        break
      case 'claude-console':
        endpoint = `/admin/claude-console-accounts/${accountId}`
        break
      case 'bedrock':
        endpoint = `/admin/bedrock-accounts/${accountId}`
        break
      case 'ccr':
        endpoint = `/admin/ccr-accounts/${accountId}`
        break
      case 'openai':
        endpoint = `/admin/openai-accounts/${accountId}` // 使用 :id
        break
      case 'droid':
        endpoint = `/admin/droid-accounts/${accountId}` // 使用 :id
        break
      case 'azure_openai':
        endpoint = `/admin/azure-openai-accounts/${accountId}` // 使用 :id
        break
      case 'openai-responses':
        endpoint = `/admin/openai-responses-accounts/${accountId}` // 使用 :id
        break
      default:
        showToast(`不支持的平台类型: ${account.platform}`, 'error')
        return
    }

    const data = await apiClient.put(endpoint, {
      expiresAt: expiresAt || null
    })

    if (data.success) {
      showToast('账户到期时间已更新', 'success')
      // 更新本地数据
      account.expiresAt = expiresAt || null
      closeAccountExpiryEdit()
    } else {
      showToast(data.message || '更新失败', 'error')
      // 重置保存状态
      if (expiryEditModalRef.value) {
        expiryEditModalRef.value.resetSaving()
      }
    }
  } catch (error) {
    console.error('更新账户过期时间失败:', error)
    showToast('更新失败', 'error')
    // 重置保存状态
    if (expiryEditModalRef.value) {
      expiryEditModalRef.value.resetSaving()
    }
  }
}

onMounted(() => {
  // 首次加载时强制刷新所有数据
  loadAccounts(true)
})
</script>

<style scoped>
.table-container {
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
.accounts-container {
  min-height: calc(100vh - 300px);
}

.table-row {
  transition: all 0.2s ease;
}

.table-row:hover {
  background-color: rgba(0, 0, 0, 0.02);
}
</style>
