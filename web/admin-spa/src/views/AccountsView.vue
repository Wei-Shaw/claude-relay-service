<template>
  <div class="accounts-container">
    <div class="card p-4 sm:p-6">
      <div class="flex flex-col gap-4 mb-4 sm:mb-6">
        <div>
          <h3 class="text-lg sm:text-xl font-bold text-gray-900 mb-1 sm:mb-2">
            账户管理
          </h3>
          <p class="text-sm sm:text-base text-gray-600">
            管理您的 Claude 和 Gemini 账户及代理配置
          </p>
        </div>
        <div class="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
          <div class="flex flex-col sm:flex-row gap-2">
            <select
              v-model="accountSortBy"
              class="form-input px-3 py-2 text-sm w-full sm:w-auto"
              @change="sortAccounts()"
            >
              <option value="name">
                按名称排序
              </option>
              <option value="dailyTokens">
                按今日Token排序
              </option>
              <option value="dailyRequests">
                按今日请求数排序
              </option>
              <option value="totalTokens">
                按总Token排序
              </option>
              <option value="lastUsed">
                按最后使用排序
              </option>
            </select>
            <select
              v-model="groupFilter"
              class="form-input px-3 py-2 text-sm w-full sm:w-auto"
              @change="filterByGroup"
            >
              <option value="all">
                所有账户
              </option>
              <option value="ungrouped">
                未分组账户
              </option>
              <option
                v-for="group in accountGroups"
                :key="group.id"
                :value="group.id"
              >
                {{ group.name }} ({{ group.platform === 'claude' ? 'Claude' : 'Gemini' }})
              </option>
            </select>
          </div>
          <button 
            class="btn btn-success px-4 sm:px-6 py-2 sm:py-3 flex items-center gap-2 w-full sm:w-auto justify-center"
            @click.stop="openCreateAccountModal"
          >
            <i class="fas fa-plus" />添加账户
          </button>
        </div>
      </div>
      
      <div
        v-if="accountsLoading"
        class="text-center py-12"
      >
        <div class="loading-spinner mx-auto mb-4" />
        <p class="text-gray-500">
          正在加载账户...
        </p>
      </div>
      
      <div
        v-else-if="sortedAccounts.length === 0"
        class="text-center py-12"
      >
        <div class="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
          <i class="fas fa-user-circle text-gray-400 text-xl" />
        </div>
        <p class="text-gray-500 text-lg">
          暂无账户
        </p>
        <p class="text-gray-400 text-sm mt-2">
          点击上方按钮添加您的第一个账户
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
                class="px-3 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-100 w-[22%] min-w-[180px]"
                @click="sortAccounts('name')"
              >
                名称
                <i
                  v-if="accountsSortBy === 'name'"
                  :class="['fas', accountsSortOrder === 'asc' ? 'fa-sort-up' : 'fa-sort-down', 'ml-1']"
                />
                <i
                  v-else
                  class="fas fa-sort ml-1 text-gray-400"
                />
              </th>
              <th
                class="px-3 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-100 w-[15%] min-w-[120px]"
                @click="sortAccounts('platform')"
              >
                平台/类型
                <i
                  v-if="accountsSortBy === 'platform'"
                  :class="['fas', accountsSortOrder === 'asc' ? 'fa-sort-up' : 'fa-sort-down', 'ml-1']"
                />
                <i
                  v-else
                  class="fas fa-sort ml-1 text-gray-400"
                />
              </th>
              <th
                class="px-3 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-100 w-[12%] min-w-[100px]"
                @click="sortAccounts('status')"
              >
                状态
                <i
                  v-if="accountsSortBy === 'status'"
                  :class="['fas', accountsSortOrder === 'asc' ? 'fa-sort-up' : 'fa-sort-down', 'ml-1']"
                />
                <i
                  v-else
                  class="fas fa-sort ml-1 text-gray-400"
                />
              </th>
              <th
                class="px-3 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-100 w-[8%] min-w-[80px]"
                @click="sortAccounts('priority')"
              >
                优先级
                <i
                  v-if="accountsSortBy === 'priority'"
                  :class="['fas', accountsSortOrder === 'asc' ? 'fa-sort-up' : 'fa-sort-down', 'ml-1']"
                />
                <i
                  v-else
                  class="fas fa-sort ml-1 text-gray-400"
                />
              </th>
              <th class="px-3 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider w-[10%] min-w-[100px]">
                代理
              </th>
              <th class="px-3 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider w-[10%] min-w-[90px]">
                今日使用
              </th>
              <th class="px-3 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider w-[10%] min-w-[100px]">
                会话窗口
              </th>
              <th class="px-3 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider w-[8%] min-w-[80px]">
                最后使用
              </th>
              <th class="px-3 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider w-[15%] min-w-[180px]">
                操作
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200/50">
            <tr
              v-for="account in sortedAccounts"
              :key="account.id"
              class="table-row"
            >
              <td class="px-3 py-4">
                <div class="flex items-center">
                  <div class="w-8 h-8 bg-gradient-to-br from-green-500 to-green-600 rounded-lg flex items-center justify-center mr-2 flex-shrink-0">
                    <i class="fas fa-user-circle text-white text-xs" />
                  </div>
                  <div class="min-w-0">
                    <div class="flex items-center gap-2">
                      <div
                        class="text-sm font-semibold text-gray-900 truncate"
                        :title="account.name"
                      >
                        {{ account.name }}
                      </div>
                      <span
                        v-if="account.accountType === 'dedicated'" 
                        class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800"
                      >
                        <i class="fas fa-lock mr-1" />专属
                      </span>
                      <span
                        v-else-if="account.accountType === 'group'" 
                        class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                      >
                        <i class="fas fa-layer-group mr-1" />分组调度
                      </span>
                      <span
                        v-else 
                        class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800"
                      >
                        <i class="fas fa-share-alt mr-1" />共享
                      </span>
                      <span
                        v-if="account.groupInfo" 
                        class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 ml-1"
                        :title="`所属分组: ${account.groupInfo.name}`"
                      >
                        <i class="fas fa-folder mr-1" />{{ account.groupInfo.name }}
                      </span>
                    </div>
                    <div
                      class="text-xs text-gray-500 truncate"
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
                    class="flex items-center gap-1.5 px-2.5 py-1 bg-gradient-to-r from-yellow-100 to-amber-100 rounded-lg border border-yellow-200"
                  >
                    <i class="fas fa-robot text-yellow-700 text-xs" />
                    <span class="text-xs font-semibold text-yellow-800">Gemini</span>
                    <span class="w-px h-4 bg-yellow-300 mx-1" />
                    <span class="text-xs font-medium text-yellow-700">
                      {{ (account.scopes && account.scopes.length > 0) ? 'OAuth' : '传统' }}
                    </span>
                  </div>
                  <div
                    v-else-if="account.platform === 'claude-console'"
                    class="flex items-center gap-1.5 px-2.5 py-1 bg-gradient-to-r from-purple-100 to-pink-100 rounded-lg border border-purple-200"
                  >
                    <i class="fas fa-terminal text-purple-700 text-xs" />
                    <span class="text-xs font-semibold text-purple-800">Console</span>
                    <span class="w-px h-4 bg-purple-300 mx-1" />
                    <span class="text-xs font-medium text-purple-700">API Key</span>
                  </div>
                  <div
                    v-else
                    class="flex items-center gap-1.5 px-2.5 py-1 bg-gradient-to-r from-indigo-100 to-blue-100 rounded-lg border border-indigo-200"
                  >
                    <i class="fas fa-brain text-indigo-700 text-xs" />
                    <span class="text-xs font-semibold text-indigo-800">Claude</span>
                    <span class="w-px h-4 bg-indigo-300 mx-1" />
                    <span class="text-xs font-medium text-indigo-700">
                      {{ (account.scopes && account.scopes.length > 0) ? 'OAuth' : '传统' }}
                    </span>
                  </div>
                </div>
              </td>
              <td class="px-3 py-4 whitespace-nowrap">
                <div class="flex flex-col gap-1">
                  <span
                    :class="['inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold', 
                             account.status === 'blocked' ? 'bg-orange-100 text-orange-800' :
                             account.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800']"
                  >
                    <div
                      :class="['w-2 h-2 rounded-full mr-2', 
                               account.status === 'blocked' ? 'bg-orange-500' :
                               account.isActive ? 'bg-green-500' : 'bg-red-500']"
                    />
                    {{ account.status === 'blocked' ? '已封锁' : account.isActive ? '正常' : '异常' }}
                  </span>
                  <span
                    v-if="account.rateLimitStatus && account.rateLimitStatus.isRateLimited" 
                    class="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-800"
                  >
                    <i class="fas fa-exclamation-triangle mr-1" />
                    限流中 ({{ account.rateLimitStatus.minutesRemaining }}分钟)
                  </span>
                  <span
                    v-if="account.schedulable === false" 
                    class="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-700"
                  >
                    <i class="fas fa-pause-circle mr-1" />
                    不可调度
                  </span>
                  <span
                    v-if="account.status === 'blocked' && account.errorMessage" 
                    class="text-xs text-gray-500 mt-1 max-w-xs truncate" 
                    :title="account.errorMessage"
                  >
                    {{ account.errorMessage }}
                  </span>
                  <span
                    v-if="account.accountType === 'dedicated'" 
                    class="text-xs text-gray-500"
                  >
                    绑定: {{ account.boundApiKeysCount || 0 }} 个API Key
                  </span>
                </div>
              </td>
              <td class="px-3 py-4 whitespace-nowrap">
                <div
                  v-if="account.platform === 'claude' || account.platform === 'claude-console'"
                  class="flex items-center gap-2"
                >
                  <div class="w-16 bg-gray-200 rounded-full h-2">
                    <div
                      class="bg-gradient-to-r from-green-500 to-blue-600 h-2 rounded-full transition-all duration-300" 
                      :style="{ width: ((101 - (account.priority || 50)) + '%') }"
                    />
                  </div>
                  <span class="text-xs text-gray-700 font-medium min-w-[20px]">
                    {{ account.priority || 50 }}
                  </span>
                </div>
                <div
                  v-else
                  class="text-gray-400 text-sm"
                >
                  <span class="text-xs">N/A</span>
                </div>
              </td>
              <td class="px-3 py-4 text-sm text-gray-600">
                <div
                  v-if="formatProxyDisplay(account.proxy)"
                  class="text-xs bg-blue-50 px-2 py-1 rounded font-mono break-all"
                  :title="formatProxyDisplay(account.proxy)"
                >
                  {{ formatProxyDisplay(account.proxy) }}
                </div>
                <div
                  v-else
                  class="text-gray-400"
                >
                  无代理
                </div>
              </td>
              <td class="px-3 py-4 whitespace-nowrap text-sm">
                <div
                  v-if="account.usage && account.usage.daily"
                  class="space-y-1"
                >
                  <div class="flex items-center gap-2">
                    <div class="w-2 h-2 bg-green-500 rounded-full" />
                    <span class="text-sm font-medium text-gray-900">{{ account.usage.daily.requests || 0 }} 次</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <div class="w-2 h-2 bg-blue-500 rounded-full" />
                    <span class="text-xs text-gray-600">{{ formatNumber(account.usage.daily.allTokens || 0) }} tokens</span>
                  </div>
                  <div
                    v-if="account.usage.averages && account.usage.averages.rpm > 0"
                    class="text-xs text-gray-500"
                  >
                    平均 {{ account.usage.averages.rpm.toFixed(2) }} RPM
                  </div>
                </div>
                <div
                  v-else
                  class="text-gray-400 text-xs"
                >
                  暂无数据
                </div>
              </td>
              <td class="px-3 py-4 whitespace-nowrap">
                <div
                  v-if="account.platform === 'claude' && account.sessionWindow && account.sessionWindow.hasActiveWindow"
                  class="space-y-2"
                >
                  <div class="flex items-center gap-2">
                    <div class="w-24 bg-gray-200 rounded-full h-2">
                      <div
                        class="bg-gradient-to-r from-blue-500 to-indigo-600 h-2 rounded-full transition-all duration-300" 
                        :style="{ width: account.sessionWindow.progress + '%' }"
                      />
                    </div>
                    <span class="text-xs text-gray-700 font-medium min-w-[32px]">
                      {{ account.sessionWindow.progress }}%
                    </span>
                  </div>
                  <div class="text-xs text-gray-600">
                    <div>{{ formatSessionWindow(account.sessionWindow.windowStart, account.sessionWindow.windowEnd) }}</div>
                    <div
                      v-if="account.sessionWindow.remainingTime > 0"
                      class="text-indigo-600 font-medium"
                    >
                      剩余 {{ formatRemainingTime(account.sessionWindow.remainingTime) }}
                    </div>
                  </div>
                </div>
                <div
                  v-else-if="account.platform === 'claude'"
                  class="text-gray-400 text-sm"
                >
                  <i class="fas fa-minus" />
                </div>
                <div
                  v-else
                  class="text-gray-400 text-sm"
                >
                  <span class="text-xs">N/A</span>
                </div>
              </td>
              <td class="px-3 py-4 whitespace-nowrap text-sm text-gray-600">
                {{ formatLastUsed(account.lastUsedAt) }}
              </td>
              <td class="px-3 py-4 whitespace-nowrap text-sm font-medium">
                <div class="flex items-center gap-1 flex-wrap">
                  <button 
                    v-if="account.platform === 'claude' && account.scopes"
                    :disabled="account.isRefreshing"
                    :class="[
                      'px-2.5 py-1 rounded text-xs font-medium transition-colors',
                      account.isRefreshing 
                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                        : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                    ]"
                    :title="account.isRefreshing ? '刷新中...' : '刷新Token'"
                    @click="refreshToken(account)"
                  >
                    <i
                      :class="[
                        'fas fa-sync-alt',
                        account.isRefreshing ? 'animate-spin' : ''
                      ]"
                    />
                    <span class="ml-1">刷新</span>
                  </button>
                  <button 
                    :disabled="account.isTogglingSchedulable"
                    :class="[
                      'px-2.5 py-1 rounded text-xs font-medium transition-colors',
                      account.isTogglingSchedulable
                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        : account.schedulable
                          ? 'bg-green-100 text-green-700 hover:bg-green-200'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    ]"
                    :title="account.schedulable ? '点击禁用调度' : '点击启用调度'"
                    @click="toggleSchedulable(account)"
                  >
                    <i
                      :class="[
                        'fas',
                        account.schedulable ? 'fa-toggle-on' : 'fa-toggle-off'
                      ]"
                    />
                    <span class="ml-1">{{ account.schedulable ? '调度' : '停用' }}</span>
                  </button>
                  <button 
                    class="px-2.5 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium hover:bg-blue-200 transition-colors"
                    :title="'编辑账户'"
                    @click="editAccount(account)"
                  >
                    <i class="fas fa-edit" />
                    <span class="ml-1">编辑</span>
                  </button>
                  <button 
                    class="px-2.5 py-1 bg-red-100 text-red-700 rounded text-xs font-medium hover:bg-red-200 transition-colors"
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
      <div
        v-if="!accountsLoading && sortedAccounts.length > 0"
        class="md:hidden space-y-3"
      >
        <div
          v-for="account in sortedAccounts"
          :key="account.id"
          class="card p-4 hover:shadow-lg transition-shadow"
        >
          <!-- 卡片头部 -->
          <div class="flex items-start justify-between mb-3">
            <div class="flex items-center gap-3">
              <div
                :class="[
                  'w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0',
                  account.platform === 'claude' 
                    ? 'bg-gradient-to-br from-purple-500 to-purple-600' 
                    : 'bg-gradient-to-br from-blue-500 to-blue-600'
                ]"
              >
                <i
                  :class="[
                    'text-white text-sm',
                    account.platform === 'claude' ? 'fas fa-brain' : 'fas fa-robot'
                  ]"
                />
              </div>
              <div>
                <h4 class="text-sm font-semibold text-gray-900">
                  {{ account.name || account.email }}
                </h4>
                <div class="flex items-center gap-2 mt-0.5">
                  <span class="text-xs text-gray-500">{{ account.platform }}</span>
                  <span class="text-xs text-gray-400">|</span>
                  <span class="text-xs text-gray-500">{{ account.type }}</span>
                </div>
              </div>
            </div>
            <span
              :class="[
                'inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold',
                getAccountStatusClass(account)
              ]"
            >
              <div
                :class="[
                  'w-1.5 h-1.5 rounded-full mr-1.5',
                  getAccountStatusDotClass(account)
                ]"
              />
              {{ getAccountStatusText(account) }}
            </span>
          </div>
          
          <!-- 使用统计 -->
          <div class="grid grid-cols-2 gap-3 mb-3">
            <div>
              <p class="text-xs text-gray-500">
                今日使用
              </p>
              <p class="text-sm font-semibold text-gray-900">
                {{ formatNumber(account.usage?.daily?.requests || 0) }} 次
              </p>
              <p class="text-xs text-gray-500 mt-0.5">
                {{ formatNumber(account.usage?.daily?.allTokens || 0) }} tokens
              </p>
            </div>
            <div>
              <p class="text-xs text-gray-500">
                总使用量
              </p>
              <p class="text-sm font-semibold text-gray-900">
                {{ formatNumber(account.usage?.total?.requests || 0) }} 次
              </p>
              <p class="text-xs text-gray-500 mt-0.5">
                {{ formatNumber(account.usage?.total?.allTokens || 0) }} tokens
              </p>
            </div>
          </div>
          
          <!-- 状态信息 -->
          <div class="space-y-2 mb-3">
            <!-- 会话窗口 -->
            <div
              v-if="account.platform === 'claude' && account.sessionWindow && account.sessionWindow.hasActiveWindow"
              class="bg-gray-50 rounded-lg p-2 space-y-1.5"
            >
              <div class="flex items-center justify-between text-xs">
                <span class="text-gray-600 font-medium">会话窗口</span>
                <span class="text-gray-700 font-medium">
                  {{ account.sessionWindow.progress }}%
                </span>
              </div>
              <div class="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                <div 
                  class="h-full bg-gradient-to-r from-blue-500 to-indigo-600 transition-all duration-300"
                  :style="{ width: account.sessionWindow.progress + '%' }"
                />
              </div>
              <div class="flex items-center justify-between text-xs">
                <span class="text-gray-500">
                  {{ formatSessionWindow(account.sessionWindow.windowStart, account.sessionWindow.windowEnd) }}
                </span>
                <span
                  v-if="account.sessionWindow.remainingTime > 0"
                  class="text-indigo-600 font-medium"
                >
                  剩余 {{ formatRemainingTime(account.sessionWindow.remainingTime) }}
                </span>
                <span
                  v-else
                  class="text-gray-500"
                >
                  已结束
                </span>
              </div>
            </div>
            
            <!-- 最后使用时间 -->
            <div class="flex items-center justify-between text-xs">
              <span class="text-gray-500">最后使用</span>
              <span class="text-gray-700">
                {{ account.lastUsedAt ? formatRelativeTime(account.lastUsedAt) : '从未使用' }}
              </span>
            </div>
            
            <!-- 代理配置 -->
            <div
              v-if="account.proxyConfig && account.proxyConfig.type !== 'none'"
              class="flex items-center justify-between text-xs"
            >
              <span class="text-gray-500">代理</span>
              <span class="text-gray-700">
                {{ account.proxyConfig.type.toUpperCase() }}
              </span>
            </div>
            
            <!-- 调度优先级 -->
            <div class="flex items-center justify-between text-xs">
              <span class="text-gray-500">优先级</span>
              <span class="text-gray-700 font-medium">
                {{ account.priority || 0 }}
              </span>
            </div>
          </div>
          
          <!-- 操作按钮 -->
          <div class="flex gap-2 mt-3 pt-3 border-t border-gray-100">
            <button 
              v-if="account.platform === 'claude' && account.type === 'oauth'"
              class="flex-1 px-3 py-2 text-xs text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors flex items-center justify-center gap-1"
              :disabled="refreshingTokens[account.id]"
              @click="refreshAccountToken(account)"
            >
              <i :class="['fas fa-sync-alt', { 'animate-spin': refreshingTokens[account.id] }]" />
              {{ refreshingTokens[account.id] ? '刷新中' : '刷新' }}
            </button>
            
            <button 
              class="flex-1 px-3 py-2 text-xs rounded-lg transition-colors flex items-center justify-center gap-1"
              :class="account.schedulable 
                ? 'text-gray-600 bg-gray-50 hover:bg-gray-100' 
                : 'text-green-600 bg-green-50 hover:bg-green-100'"
              :disabled="account.isTogglingSchedulable"
              @click="toggleSchedulable(account)"
            >
              <i :class="['fas', account.schedulable ? 'fa-pause' : 'fa-play']" />
              {{ account.schedulable ? '暂停' : '启用' }}
            </button>
            
            <button 
              class="flex-1 px-3 py-2 text-xs text-gray-600 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
              @click="editAccount(account)"
            >
              <i class="fas fa-edit mr-1" />
              编辑
            </button>
            
            <button 
              class="px-3 py-2 text-xs text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
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
      :show="showConfirmModal"
      :title="confirmOptions.title"
      :message="confirmOptions.message"
      :confirm-text="confirmOptions.confirmText"
      :cancel-text="confirmOptions.cancelText"
      @confirm="handleConfirm"
      @cancel="handleCancel"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { showToast } from '@/utils/toast'
import { apiClient } from '@/config/api'
import { useConfirm } from '@/composables/useConfirm'
import { useAccountsStore } from '@/stores/accounts'
import AccountForm from '@/components/accounts/AccountForm.vue'
import ConfirmModal from '@/components/common/ConfirmModal.vue'

// 使用确认弹窗
const { showConfirmModal, confirmOptions, showConfirm, handleConfirm, handleCancel } = useConfirm()

// 数据状态
const accounts = ref([])
const accountsLoading = ref(false)
const accountSortBy = ref('name')
const accountsSortBy = ref('')
const accountsSortOrder = ref('asc')
const apiKeys = ref([])
const refreshingTokens = ref({})
const accountGroups = ref([])
const groupFilter = ref('all')
const filteredAccounts = ref([])

// 模态框状态
const showCreateAccountModal = ref(false)
const showEditAccountModal = ref(false)
const editingAccount = ref(null)

// 计算排序后的账户列表
const sortedAccounts = computed(() => {
  const sourceAccounts = filteredAccounts.value.length > 0 ? filteredAccounts.value : accounts.value
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
const loadAccounts = async () => {
  accountsLoading.value = true
  try {
    const [claudeData, claudeConsoleData, geminiData, apiKeysData, groupsData] = await Promise.all([
      apiClient.get('/admin/claude-accounts'),
      apiClient.get('/admin/claude-console-accounts'),
      apiClient.get('/admin/gemini-accounts'),
      apiClient.get('/admin/api-keys'),
      apiClient.get('/admin/account-groups')
    ])
    
    // 更新API Keys列表
    if (apiKeysData.success) {
      apiKeys.value = apiKeysData.data || []
    }
    
    // 更新分组列表
    if (groupsData.success) {
      accountGroups.value = groupsData.data || []
    }
    
    // 创建分组ID到分组信息的映射
    const groupMap = new Map()
    const accountGroupMap = new Map()
    
    // 获取所有分组的成员信息
    for (const group of accountGroups.value) {
      groupMap.set(group.id, group)
      try {
        const membersResponse = await apiClient.get(`/admin/account-groups/${group.id}/members`)
        if (membersResponse.success) {
          const members = membersResponse.data || []
          members.forEach(member => {
            accountGroupMap.set(member.id, group)
          })
        }
      } catch (error) {
        console.error(`Failed to load members for group ${group.id}:`, error)
      }
    }
    
    const allAccounts = []
    
    if (claudeData.success) {
      const claudeAccounts = (claudeData.data || []).map(acc => {
        // 计算每个Claude账户绑定的API Key数量
        const boundApiKeysCount = apiKeys.value.filter(key => key.claudeAccountId === acc.id).length
        // 检查是否属于某个分组
        const groupInfo = accountGroupMap.get(acc.id) || null
        return { ...acc, platform: 'claude', boundApiKeysCount, groupInfo }
      })
      allAccounts.push(...claudeAccounts)
    }
    
    if (claudeConsoleData.success) {
      const claudeConsoleAccounts = (claudeConsoleData.data || []).map(acc => {
        // Claude Console账户暂时不支持直接绑定
        const groupInfo = accountGroupMap.get(acc.id) || null
        return { ...acc, platform: 'claude-console', boundApiKeysCount: 0, groupInfo }
      })
      allAccounts.push(...claudeConsoleAccounts)
    }
    
    if (geminiData.success) {
      const geminiAccounts = (geminiData.data || []).map(acc => {
        // 计算每个Gemini账户绑定的API Key数量
        const boundApiKeysCount = apiKeys.value.filter(key => key.geminiAccountId === acc.id).length
        const groupInfo = accountGroupMap.get(acc.id) || null
        return { ...acc, platform: 'gemini', boundApiKeysCount, groupInfo }
      })
      allAccounts.push(...geminiAccounts)
    }
    
    accounts.value = allAccounts
    // 初始化过滤后的账户列表
    filterByGroup()
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

// 加载API Keys列表
const loadApiKeys = async () => {
  try {
    const response = await apiClient.get('/admin/api-keys')
    if (response.success) {
      apiKeys.value = response.data
    }
  } catch (error) {
    console.error('Failed to load API keys:', error)
  }
}

// 按分组筛选账户
const filterByGroup = () => {
  if (groupFilter.value === 'all') {
    filteredAccounts.value = accounts.value
  } else if (groupFilter.value === 'ungrouped') {
    filteredAccounts.value = accounts.value.filter(acc => !acc.groupInfo)
  } else {
    // 按特定分组筛选
    filteredAccounts.value = accounts.value.filter(acc => 
      acc.groupInfo && acc.groupInfo.id === groupFilter.value
    )
  }
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
  const boundKeysCount = apiKeys.value.filter(key => 
    key.claudeAccountId === account.id || key.geminiAccountId === account.id
  ).length
  
  if (boundKeysCount > 0) {
    showToast(`无法删除此账号，有 ${boundKeysCount} 个API Key绑定到此账号，请先解绑所有API Key`, 'error')
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
    } else {
      endpoint = `/admin/gemini-accounts/${account.id}`
    }
      
    const data = await apiClient.delete(endpoint)
    
    if (data.success) {
      showToast('账户已删除', 'success')
      loadAccounts()
    } else {
      showToast(data.message || '删除失败', 'error')
    }
  } catch (error) {
    showToast('删除失败', 'error')
  }
}

// 刷新Token
const refreshToken = async (account) => {
  if (account.isRefreshing) return
  
  try {
    account.isRefreshing = true
    const data = await apiClient.post(`/admin/claude-accounts/${account.id}/refresh`)
    
    if (data.success) {
      showToast('Token刷新成功', 'success')
      loadAccounts()
    } else {
      showToast(data.message || 'Token刷新失败', 'error')
    }
  } catch (error) {
    showToast('Token刷新失败', 'error')
  } finally {
    account.isRefreshing = false
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
    } else if (account.platform === 'gemini') {
      endpoint = `/admin/gemini-accounts/${account.id}/toggle-schedulable`
    } else {
      showToast('该账户类型暂不支持调度控制', 'warning')
      return
    }
    
    const data = await apiClient.put(endpoint)
    
    if (data.success) {
      account.schedulable = data.schedulable
      showToast(
        data.schedulable ? '已启用调度' : '已禁用调度', 
        'success'
      )
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
  loadAccounts()
}

// 处理编辑成功
const handleEditSuccess = () => {
  showEditAccountModal.value = false
  showToast('账户更新成功', 'success')
  loadAccounts()
}

// 获取账户状态文本
const getAccountStatusText = (account) => {
  // 检查是否被封锁
  if (account.status === 'blocked') return '已封锁'
  // 检查是否限流
  if (account.isRateLimited || account.status === 'rate_limited' || 
      (account.rateLimitStatus && account.rateLimitStatus.isRateLimited)) return '限流中'
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
  if (account.isRateLimited || account.status === 'rate_limited' || 
      (account.rateLimitStatus && account.rateLimitStatus.isRateLimited)) {
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
  if (account.isRateLimited || account.status === 'rate_limited' || 
      (account.rateLimitStatus && account.rateLimitStatus.isRateLimited)) {
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
const getSessionWindowPercentage = (account) => {
  if (!account.sessionWindow) return 100
  const { remaining, total } = account.sessionWindow
  if (!total || total === 0) return 100
  return Math.round((remaining / total) * 100)
}

// 格式化相对时间
const formatRelativeTime = (dateString) => {
  return formatLastUsed(dateString)
}

// 刷新账户Token
const refreshAccountToken = async (account) => {
  if (refreshingTokens.value[account.id]) return
  
  try {
    refreshingTokens.value[account.id] = true
    const data = await apiClient.post(`/admin/claude-accounts/${account.id}/refresh`)
    
    if (data.success) {
      showToast('Token刷新成功', 'success')
      loadAccounts()
    } else {
      showToast(data.message || 'Token刷新失败', 'error')
    }
  } catch (error) {
    showToast('Token刷新失败', 'error')
  } finally {
    refreshingTokens.value[account.id] = false
  }
}

// 切换调度状态
const toggleDispatch = async (account) => {
  await toggleSchedulable(account)
}

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
  loadAccounts()
  loadApiKeys()
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
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
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