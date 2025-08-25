<template>
  <div class="accounts-container">
    <div class="card p-4 sm:p-6">
      <div class="mb-4 flex flex-col gap-4 sm:mb-6">
        <div>
          <h3 class="mb-1 text-lg font-bold text-gray-900 dark:text-gray-100 sm:mb-2 sm:text-xl">
            账户管理
          </h3>
          <p class="text-sm text-gray-600 dark:text-gray-400 sm:text-base">
            管理您的 Claude、Gemini、OpenAI 和 Azure OpenAI 账户及代理配置
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
          </div>

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
                会话窗口
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
            <tr v-for="account in sortedAccounts" :key="account.id" class="table-row">
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
                      <span
                        v-if="account.groupInfo"
                        class="ml-1 inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-400"
                        :title="`所属分组: ${account.groupInfo.name}`"
                      >
                        <i class="fas fa-folder mr-1" />{{ account.groupInfo.name }}
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
                  <span
                    :class="[
                      'inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold',
                      account.status === 'blocked'
                        ? 'bg-orange-100 text-orange-800'
                        : account.status === 'unauthorized'
                          ? 'bg-red-100 text-red-800'
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
                      >({{ account.rateLimitStatus.minutesRemaining }}分钟)</span
                    >
                  </span>
                  <span
                    v-if="account.schedulable === false"
                    class="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700"
                  >
                    <i class="fas fa-pause-circle mr-1" />
                    不可调度
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
                    account.platform === 'openai'
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
                    <div class="h-2 w-2 rounded-full bg-green-500" />
                    <span class="text-sm font-medium text-gray-900 dark:text-gray-100"
                      >{{ account.usage.daily.requests || 0 }} 次</span
                    >
                  </div>
                  <div class="flex items-center gap-2">
                    <div class="h-2 w-2 rounded-full bg-blue-500" />
                    <span class="text-xs text-gray-600 dark:text-gray-300"
                      >{{ formatNumber(account.usage.daily.allTokens || 0) }} tokens</span
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
                <div
                  v-if="
                    account.platform === 'claude' &&
                    account.sessionWindow &&
                    account.sessionWindow.hasActiveWindow
                  "
                  class="space-y-2"
                >
                  <div class="flex items-center gap-2">
                    <div class="h-2 w-24 rounded-full bg-gray-200">
                      <div
                        class="h-2 rounded-full bg-gradient-to-r from-blue-500 to-indigo-600 transition-all duration-300"
                        :style="{ width: account.sessionWindow.progress + '%' }"
                      />
                    </div>
                    <span class="min-w-[32px] text-xs font-medium text-gray-700 dark:text-gray-200">
                      {{ account.sessionWindow.progress }}%
                    </span>
                  </div>
                  <div class="text-xs text-gray-600 dark:text-gray-300">
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
                      class="font-medium text-indigo-600"
                    >
                      剩余 {{ formatRemainingTime(account.sessionWindow.remainingTime) }}
                    </div>
                  </div>
                </div>
                <div v-else-if="account.platform === 'claude'" class="text-sm text-gray-400">
                  <i class="fas fa-minus" />
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
                      account.platform === 'claude' &&
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
          v-for="account in sortedAccounts"
          :key="account.id"
          class="card p-4 transition-shadow hover:shadow-lg"
        >
          <!-- 卡片头部 -->
          <div class="mb-3 flex items-start justify-between">
            <div class="flex items-center gap-3">
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
              <p class="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {{ formatNumber(account.usage?.daily?.requests || 0) }} 次
              </p>
              <p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                {{ formatNumber(account.usage?.daily?.allTokens || 0) }} tokens
              </p>
            </div>
            <div>
              <p class="text-xs text-gray-500 dark:text-gray-400">总使用量</p>
              <p class="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {{ formatNumber(account.usage?.total?.requests || 0) }} 次
              </p>
              <p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                {{ formatNumber(account.usage?.total?.allTokens || 0) }} tokens
              </p>
            </div>
          </div>

          <!-- 状态信息 -->
          <div class="mb-3 space-y-2">
            <!-- 会话窗口 -->
            <div
              v-if="
                account.platform === 'claude' &&
                account.sessionWindow &&
                account.sessionWindow.hasActiveWindow
              "
              class="space-y-1.5 rounded-lg bg-gray-50 p-2 dark:bg-gray-700"
            >
              <div class="flex items-center justify-between text-xs">
                <span class="font-medium text-gray-600 dark:text-gray-300">会话窗口</span>
                <span class="font-medium text-gray-700 dark:text-gray-200">
                  {{ account.sessionWindow.progress }}%
                </span>
              </div>
              <div class="h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-600">
                <div
                  class="h-full bg-gradient-to-r from-blue-500 to-indigo-600 transition-all duration-300"
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

    <!-- 添加账户模态框 -->
    <AccountForm
      v-if="showCreateAccountModal"
      @close="showCreateAccountModal = false"
      @success="handleCreateSuccess"
    />

    <!-- 编辑账户模态框 -->
    <AccountForm
      v-if="showEditAccountModal"
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
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { showToast } from '@/utils/toast'
import { apiClient } from '@/config/api'
import { useConfirm } from '@/composables/useConfirm'
import AccountForm from '@/components/accounts/AccountForm.vue'
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

// 缓存状态标志
const apiKeysLoaded = ref(false)
const groupsLoaded = ref(false)
const groupMembersLoaded = ref(false)
const accountGroupMap = ref(new Map())

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
  { value: 'gemini', label: 'Gemini', icon: 'fa-google' },
  { value: 'openai', label: 'OpenAi', icon: 'fa-openai' },
  { value: 'azure_openai', label: 'Azure OpenAI', icon: 'fab fa-microsoft' },
  { value: 'bedrock', label: 'Bedrock', icon: 'fab fa-aws' }
])

const groupOptions = computed(() => {
  const options = [
    { value: 'all', label: '所有账户', icon: 'fa-globe' },
    { value: 'ungrouped', label: '未分组账户', icon: 'fa-user' }
  ]
  accountGroups.value.forEach((group) => {
    options.push({
      value: group.id,
      label: `${group.name} (${group.platform === 'claude' ? 'Claude' : group.platform === 'gemini' ? 'Gemini' : 'OpenAI'})`,
      icon:
        group.platform === 'claude'
          ? 'fa-brain'
          : group.platform === 'gemini'
            ? 'fa-robot'
            : 'fa-openai'
    })
  })
  return options
})

// 模态框状态
const showCreateAccountModal = ref(false)
const showEditAccountModal = ref(false)
const editingAccount = ref(null)

// 计算排序后的账户列表
const sortedAccounts = computed(() => {
  const sourceAccounts = accounts.value
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

// 加载账户列表
const loadAccounts = async (forceReload = false) => {
  accountsLoading.value = true
  try {
    // 构建查询参数
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
        apiClient.get('/admin/azure-openai-accounts', { params })
      )
    } else {
      // 只请求指定平台，其他平台设为null占位
      switch (platformFilter.value) {
        case 'claude':
          requests.push(
            apiClient.get('/admin/claude-accounts', { params }),
            Promise.resolve({ success: true, data: [] }), // claude-console 占位
            Promise.resolve({ success: true, data: [] }), // bedrock 占位
            Promise.resolve({ success: true, data: [] }) // gemini 占位
          )
          break
        case 'claude-console':
          requests.push(
            Promise.resolve({ success: true, data: [] }), // claude 占位
            apiClient.get('/admin/claude-console-accounts', { params }),
            Promise.resolve({ success: true, data: [] }), // bedrock 占位
            Promise.resolve({ success: true, data: [] }) // gemini 占位
          )
          break
        case 'bedrock':
          requests.push(
            Promise.resolve({ success: true, data: [] }), // claude 占位
            Promise.resolve({ success: true, data: [] }), // claude-console 占位
            apiClient.get('/admin/bedrock-accounts', { params }),
            Promise.resolve({ success: true, data: [] }) // gemini 占位
          )
          break
        case 'gemini':
          requests.push(
            Promise.resolve({ success: true, data: [] }), // claude 占位
            Promise.resolve({ success: true, data: [] }), // claude-console 占位
            Promise.resolve({ success: true, data: [] }), // bedrock 占位
            apiClient.get('/admin/gemini-accounts', { params })
          )
          break
      }
    }

    // 使用缓存机制加载 API Keys 和分组数据
    await Promise.all([loadApiKeys(forceReload), loadAccountGroups(forceReload)])

    // 加载分组成员关系（需要在分组数据加载完成后）
    await loadGroupMembers(forceReload)

    const [claudeData, claudeConsoleData, bedrockData, geminiData, openaiData, azureOpenaiData] =
      await Promise.all(requests)

    const allAccounts = []

    if (claudeData.success) {
      const claudeAccounts = (claudeData.data || []).map((acc) => {
        // 计算每个Claude账户绑定的API Key数量
        const boundApiKeysCount = apiKeys.value.filter(
          (key) => key.claudeAccountId === acc.id
        ).length
        // 检查是否属于某个分组
        const groupInfo = accountGroupMap.value.get(acc.id) || null
        return { ...acc, platform: 'claude', boundApiKeysCount, groupInfo }
      })
      allAccounts.push(...claudeAccounts)
    }

    if (claudeConsoleData.success) {
      const claudeConsoleAccounts = (claudeConsoleData.data || []).map((acc) => {
        // Claude Console账户暂时不支持直接绑定
        const groupInfo = accountGroupMap.value.get(acc.id) || null
        return { ...acc, platform: 'claude-console', boundApiKeysCount: 0, groupInfo }
      })
      allAccounts.push(...claudeConsoleAccounts)
    }

    if (bedrockData.success) {
      const bedrockAccounts = (bedrockData.data || []).map((acc) => {
        // Bedrock账户暂时不支持直接绑定
        const groupInfo = accountGroupMap.value.get(acc.id) || null
        return { ...acc, platform: 'bedrock', boundApiKeysCount: 0, groupInfo }
      })
      allAccounts.push(...bedrockAccounts)
    }

    if (geminiData.success) {
      const geminiAccounts = (geminiData.data || []).map((acc) => {
        // 计算每个Gemini账户绑定的API Key数量
        const boundApiKeysCount = apiKeys.value.filter(
          (key) => key.geminiAccountId === acc.id
        ).length
        const groupInfo = accountGroupMap.value.get(acc.id) || null
        return { ...acc, platform: 'gemini', boundApiKeysCount, groupInfo }
      })
      allAccounts.push(...geminiAccounts)
    }
    if (openaiData.success) {
      const openaiAccounts = (openaiData.data || []).map((acc) => {
        // 计算每个OpenAI账户绑定的API Key数量
        const boundApiKeysCount = apiKeys.value.filter(
          (key) => key.openaiAccountId === acc.id
        ).length
        const groupInfo = accountGroupMap.value.get(acc.id) || null
        return { ...acc, platform: 'openai', boundApiKeysCount, groupInfo }
      })
      allAccounts.push(...openaiAccounts)
    }
    if (azureOpenaiData && azureOpenaiData.success) {
      const azureOpenaiAccounts = (azureOpenaiData.data || []).map((acc) => {
        // 计算每个Azure OpenAI账户绑定的API Key数量
        const boundApiKeysCount = apiKeys.value.filter(
          (key) => key.azureOpenaiAccountId === acc.id
        ).length
        const groupInfo = accountGroupMap.value.get(acc.id) || null
        return { ...acc, platform: 'azure_openai', boundApiKeysCount, groupInfo }
      })
      allAccounts.push(...azureOpenaiAccounts)
    }

    accounts.value = allAccounts
  } catch (error) {
    showToast('加载账户失败', 'error')
  } finally {
    accountsLoading.value = false
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
    return Math.floor(number / 1000000).toLocaleString() + 'M'
  }
  return number.toLocaleString()
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
    console.error('Failed to load API keys:', error)
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
    console.error('Failed to load account groups:', error)
  }
}

// 加载分组成员关系（缓存版本）
const loadGroupMembers = async (forceReload = false) => {
  if (!forceReload && groupMembersLoaded.value) {
    return // 使用缓存数据
  }

  try {
    // 重置映射
    accountGroupMap.value.clear()

    // 获取所有分组的成员信息
    for (const group of accountGroups.value) {
      try {
        const membersResponse = await apiClient.get(`/admin/account-groups/${group.id}/members`)
        if (membersResponse.success) {
          const members = membersResponse.data || []
          members.forEach((member) => {
            accountGroupMap.value.set(member.id, group)
          })
        }
      } catch (error) {
        console.error(`Failed to load members for group ${group.id}:`, error)
      }
    }
    groupMembersLoaded.value = true
  } catch (error) {
    console.error('Failed to load group members:', error)
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
  loadAccounts()
}

// 按分组筛选账户
const filterByGroup = () => {
  loadAccounts()
}

// 格式化代理信息显示
const formatProxyDisplay = (proxy) => {
  if (!proxy || !proxy.host || !proxy.port) return null

  // 缩短类型名称
  const typeShort = proxy.type === 'socks5' ? 'S5' : proxy.type.toUpperCase()

  // 缩短主机名（如果太长）
  let host = proxy.host
  if (host.length > 15) {
    host = host.substring(0, 12) + '...'
  }

  let display = `${typeShort}://${host}:${proxy.port}`

  // 如果有用户名密码，添加认证信息（部分隐藏）
  if (proxy.username) {
    display = `${typeShort}://***@${host}:${proxy.port}`
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

// 打开创建账户模态框
const openCreateAccountModal = () => {
  showCreateAccountModal.value = true
}

// 编辑账户
const editAccount = (account) => {
  editingAccount.value = account
  showEditAccountModal.value = true
}

// 删除账户
const deleteAccount = async (account) => {
  // 检查是否有API Key绑定到此账号
  const boundKeysCount = apiKeys.value.filter(
    (key) =>
      key.claudeAccountId === account.id ||
      key.geminiAccountId === account.id ||
      key.openaiAccountId === account.id
  ).length

  if (boundKeysCount > 0) {
    showToast(
      `无法删除此账号，有 ${boundKeysCount} 个API Key绑定到此账号，请先解绑所有API Key`,
      'error'
    )
    return
  }

  const confirmed = await showConfirm(
    '删除账户',
    `确定要删除账户 "${account.name}" 吗？\n\n此操作不可恢复。`,
    '删除',
    '取消'
  )

  if (!confirmed) return

  try {
    let endpoint
    if (account.platform === 'claude') {
      endpoint = `/admin/claude-accounts/${account.id}`
    } else if (account.platform === 'claude-console') {
      endpoint = `/admin/claude-console-accounts/${account.id}`
    } else if (account.platform === 'bedrock') {
      endpoint = `/admin/bedrock-accounts/${account.id}`
    } else if (account.platform === 'openai') {
      endpoint = `/admin/openai-accounts/${account.id}`
    } else if (account.platform === 'azure_openai') {
      endpoint = `/admin/azure-openai-accounts/${account.id}`
    } else {
      endpoint = `/admin/gemini-accounts/${account.id}`
    }

    const data = await apiClient.delete(endpoint)

    if (data.success) {
      showToast('账户已删除', 'success')
      // 清空分组成员缓存，因为账户可能从分组中移除
      groupMembersLoaded.value = false
      loadAccounts()
    } else {
      showToast(data.message || '删除失败', 'error')
    }
  } catch (error) {
    showToast('删除失败', 'error')
  }
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
    const data = await apiClient.post(`/admin/claude-accounts/${account.id}/reset-status`)

    if (data.success) {
      showToast('账户状态已重置', 'success')
      loadAccounts()
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

      // 添加调试日志
      console.log('Account subscription info:', {
        accountName: account.name,
        subscriptionInfo: info,
        hasClaudeMax: info.hasClaudeMax,
        hasClaudePro: info.hasClaudePro
      })

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
      console.error('Failed to parse subscription info:', e)
      return 'Claude'
    }
  }

  // 没有订阅信息，保持原有显示
  console.log('No subscription info for account:', account.name)
  return 'Claude'
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

// 切换调度状态
// const toggleDispatch = async (account) => {
//   await toggleSchedulable(account)
// }

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

onMounted(() => {
  // 首次加载时强制刷新所有数据
  loadAccounts(true)
})
</script>

<style scoped>
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
.accounts-container {
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
</style>
