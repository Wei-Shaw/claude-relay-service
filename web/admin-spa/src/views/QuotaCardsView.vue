<template>
  <!-- 不挂 tab-content：MainLayout 已包一层进场动画，重复挂会双重 translateY 致高度连跳 -->
  <div class="quota-cards-view">
    <!-- 去掉内层 .card：外层 MainLayout 已是卡片，避免卡片套卡片 -->
    <!-- transition-none：盖掉全局 div{transition:all}，否则 height 像素校正会被做成 0.3s 动画（看起来像抖动） -->
    <div
      ref="cardRef"
      class="relative flex flex-col overflow-y-auto transition-none"
      :style="cardStyle"
    >
      <!-- Header（紧凑，固定不滚动） -->
      <div class="mb-3 flex flex-none flex-col gap-3 sm:mb-4">
        <!-- 页面标题「额度卡管理」与主 Tab 重复，已移除；按钮组左对齐 -->
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div class="flex flex-wrap items-center gap-2">
            <button
              class="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
              @click="openLimitsModal"
            >
              <i class="fas fa-shield-alt text-gray-400" />
              上限保护
              <span
                v-if="limitsStatus === 'loaded'"
                :class="[
                  'rounded-full px-1.5 py-0.5 text-sm font-medium',
                  limitsConfig.enabled
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400'
                    : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                ]"
              >
                {{ limitsConfig.enabled ? '已开启' : '已关闭' }}
              </span>
              <span v-else-if="limitsStatus === 'loading'" class="text-sm text-gray-400">
                加载中
              </span>
              <span v-else class="text-sm text-red-500">加载失败</span>
            </button>
            <button
              class="inline-flex items-center rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              @click="showCreateModal = true"
            >
              <i class="fas fa-plus mr-2" />
              创建卡片
            </button>
          </div>
        </div>

        <!-- Stats Cards -->
        <div class="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-6">
          <div class="stat-card">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm font-semibold text-gray-600 dark:text-gray-400">总卡片数</p>
                <p class="text-lg font-bold text-gray-900 dark:text-gray-100 sm:text-xl">
                  {{ stats.total }}
                </p>
              </div>
              <div class="stat-icon flex-shrink-0 bg-gradient-to-br from-blue-500 to-blue-600">
                <i class="fas fa-ticket-alt" />
              </div>
            </div>
          </div>

          <div class="stat-card">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm font-semibold text-gray-600 dark:text-gray-400">未使用</p>
                <p class="text-lg font-bold text-green-600 dark:text-green-400 sm:text-xl">
                  {{ stats.unused }}
                </p>
              </div>
              <div class="stat-icon flex-shrink-0 bg-gradient-to-br from-green-500 to-green-600">
                <i class="fas fa-check-circle" />
              </div>
            </div>
          </div>

          <div class="stat-card">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm font-semibold text-gray-600 dark:text-gray-400">已核销</p>
                <p class="text-lg font-bold text-purple-600 dark:text-purple-400 sm:text-xl">
                  {{ stats.redeemed }}
                </p>
              </div>
              <div class="stat-icon flex-shrink-0 bg-gradient-to-br from-purple-500 to-purple-600">
                <i class="fas fa-exchange-alt" />
              </div>
            </div>
          </div>

          <div class="stat-card">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm font-semibold text-gray-600 dark:text-gray-400">已撤销</p>
                <p class="text-lg font-bold text-red-600 dark:text-red-400 sm:text-xl">
                  {{ stats.revoked }}
                </p>
              </div>
              <div class="stat-icon flex-shrink-0 bg-gradient-to-br from-red-500 to-red-600">
                <i class="fas fa-ban" />
              </div>
            </div>
          </div>

          <div class="stat-card">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm font-semibold text-gray-600 dark:text-gray-400">已过期</p>
                <p class="text-lg font-bold text-amber-600 dark:text-amber-400 sm:text-xl">
                  {{ stats.expired || 0 }}
                </p>
              </div>
              <div class="stat-icon flex-shrink-0 bg-gradient-to-br from-amber-500 to-amber-600">
                <i class="fas fa-hourglass-end" />
              </div>
            </div>
          </div>

          <div class="stat-card">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm font-semibold text-gray-600 dark:text-gray-400">已禁用</p>
                <p class="text-lg font-bold text-gray-600 dark:text-gray-400 sm:text-xl">
                  {{ stats.disabled || 0 }}
                </p>
              </div>
              <div class="stat-icon flex-shrink-0 bg-gradient-to-br from-gray-400 to-gray-500">
                <i class="fas fa-pause-circle" />
              </div>
            </div>
          </div>
        </div>

        <!-- Tab Navigation -->
        <div class="border-b border-gray-200 dark:border-gray-700">
          <nav aria-label="Tabs" class="-mb-px flex space-x-8 overflow-x-auto">
            <button
              v-for="tab in tabs"
              :key="tab.id"
              :class="[
                'whitespace-nowrap border-b-2 px-1 py-2 text-sm font-medium',
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:border-gray-500 dark:hover:text-gray-300'
              ]"
              @click="activeTab = tab.id"
            >
              {{ tab.name }}
            </button>
          </nav>
        </div>
      </div>

      <!-- Cards Tab -->
      <div v-if="activeTab === 'cards'" class="flex flex-col md:min-h-0 md:flex-1">
        <!-- 查询栏 -->
        <div class="mb-3 flex flex-none flex-wrap items-center gap-2">
          <div class="relative min-w-[180px] flex-1">
            <i
              class="fas fa-search pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400"
            />
            <input
              v-model="cardSearch"
              class="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              placeholder="搜索卡号 / 备注 / 核销用户"
              type="text"
              @keyup.enter="applyCardFilters"
            />
          </div>
          <div class="min-w-[140px]">
            <CustomDropdown
              v-model="cardTypeFilter"
              accent="blue"
              icon="fa-ticket-alt"
              :options="cardTypeFilterOptions"
              placeholder="全部类型"
              @change="applyCardFilters"
            />
          </div>
          <div class="min-w-[140px]">
            <CustomDropdown
              v-model="cardStatusFilter"
              accent="indigo"
              icon="fa-filter"
              :options="cardStatusFilterOptions"
              placeholder="全部状态"
              @change="applyCardFilters"
            />
          </div>
          <button
            class="inline-flex items-center rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
            @click="applyCardFilters"
          >
            <i class="fas fa-search mr-1.5" />查询
          </button>
          <button
            v-if="cardSearch || cardTypeFilter || cardStatusFilter"
            class="inline-flex items-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
            @click="resetCardFilters"
          >
            重置
          </button>
        </div>

        <!-- Batch Actions -->
        <div
          v-if="selectedCards.length > 0"
          class="mb-3 flex flex-none items-center gap-3 rounded-lg bg-blue-50 p-3 dark:bg-blue-900/20"
        >
          <span class="text-sm text-blue-700 dark:text-blue-300">
            已选择 {{ selectedCards.length }} 张卡片
          </span>
          <button
            class="rounded-lg bg-red-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-600"
            @click="deleteSelectedCards"
          >
            <i class="fas fa-trash mr-1" />
            批量删除
          </button>
          <button
            class="rounded-lg bg-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
            @click="selectedCards = []"
          >
            取消选择
          </button>
        </div>

        <!-- Table（内部滚动，表头吸顶） -->
        <div
          class="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700 md:min-h-0 md:flex-1 md:overflow-auto"
        >
          <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead class="sticky top-0 z-10 bg-gray-100 dark:bg-gray-700">
              <tr>
                <th class="w-10 px-4 py-3">
                  <input
                    :checked="isAllSelected"
                    class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700"
                    :indeterminate="isIndeterminate"
                    type="checkbox"
                    @change="toggleSelectAll"
                  />
                </th>
                <th
                  class="px-4 py-3 text-left text-sm font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300"
                >
                  卡号
                </th>
                <th
                  class="px-4 py-3 text-left text-sm font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300"
                >
                  类型
                </th>
                <th
                  class="px-4 py-3 text-left text-sm font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300"
                >
                  额度/时间
                </th>
                <th
                  class="px-4 py-3 text-left text-sm font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300"
                >
                  状态
                </th>
                <th
                  class="px-4 py-3 text-left text-sm font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300"
                >
                  核销用户
                </th>
                <th
                  class="px-4 py-3 text-left text-sm font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300"
                >
                  创建时间
                </th>
                <th
                  class="px-4 py-3 text-right text-sm font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300"
                >
                  操作
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
              <tr v-if="loading">
                <td
                  class="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400"
                  colspan="8"
                >
                  <i class="fas fa-spinner fa-spin mr-2 text-blue-500" />加载中...
                </td>
              </tr>
              <template v-else>
                <tr
                  v-for="card in cards"
                  :key="card.id"
                  :class="[
                    'hover:bg-gray-50 dark:hover:bg-gray-700/50',
                    selectedCards.includes(card.id) ? 'bg-blue-50 dark:bg-blue-900/10' : ''
                  ]"
                >
                  <td class="whitespace-nowrap px-4 py-3">
                    <input
                      v-if="card.status === 'unused'"
                      :checked="selectedCards.includes(card.id)"
                      class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700"
                      type="checkbox"
                      @change="toggleSelectCard(card.id)"
                    />
                  </td>
                  <td class="whitespace-nowrap px-4 py-3">
                    <code
                      class="cursor-pointer rounded bg-gray-100 px-2 py-1 font-mono text-sm hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600"
                      title="点击复制"
                      @click="copyText(card.code)"
                    >
                      {{ card.code }}
                    </code>
                  </td>
                  <td class="whitespace-nowrap px-4 py-3">
                    <span
                      :class="[
                        'inline-flex rounded-full px-2 py-1 text-sm font-medium',
                        card.type === 'quota'
                          ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
                          : card.type === 'time'
                            ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                            : 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300'
                      ]"
                    >
                      {{
                        card.type === 'quota'
                          ? '额度卡'
                          : card.type === 'time'
                            ? '时间卡'
                            : '组合卡'
                      }}
                    </span>
                  </td>
                  <td class="whitespace-nowrap px-4 py-3 text-sm text-gray-900 dark:text-white">
                    <span v-if="card.type === 'quota' || card.type === 'combo'"
                      >${{ card.quotaAmount }}</span
                    >
                    <span v-if="card.type === 'combo'"> + </span>
                    <span v-if="card.type === 'time' || card.type === 'combo'">
                      {{ card.timeAmount }}
                      {{
                        card.timeUnit === 'hours' ? '小时' : card.timeUnit === 'days' ? '天' : '月'
                      }}
                    </span>
                  </td>
                  <td class="whitespace-nowrap px-4 py-3">
                    <span
                      :class="[
                        'inline-flex rounded-full px-2 py-1 text-sm font-medium',
                        card.status === 'unused'
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                          : card.status === 'redeemed'
                            ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300'
                            : card.status === 'disabled'
                              ? 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                              : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                      ]"
                    >
                      {{ cardStatusLabel(card.status) }}
                    </span>
                  </td>
                  <td class="whitespace-nowrap px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                    {{ card.redeemedByUsername || '-' }}
                  </td>
                  <td class="whitespace-nowrap px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                    {{ formatDate(card.createdAt) }}
                  </td>
                  <td class="whitespace-nowrap px-4 py-3 text-right">
                    <div class="flex flex-wrap items-center justify-end gap-1">
                      <button
                        v-if="card.status === 'unused'"
                        class="rounded px-2 py-1 text-sm font-medium text-orange-600 transition-colors hover:bg-orange-50 hover:text-orange-900 dark:text-orange-400 dark:hover:bg-orange-900/20"
                        title="禁用"
                        @click="toggleCardStatus(card)"
                      >
                        <i class="fas fa-ban" />
                        <span class="ml-1">禁用</span>
                      </button>
                      <button
                        v-if="card.status === 'disabled'"
                        class="rounded px-2 py-1 text-sm font-medium text-green-600 transition-colors hover:bg-green-50 hover:text-green-900 dark:text-green-400 dark:hover:bg-green-900/20"
                        title="启用"
                        @click="toggleCardStatus(card)"
                      >
                        <i class="fas fa-check-circle" />
                        <span class="ml-1">启用</span>
                      </button>
                      <button
                        v-if="card.status === 'unused' || card.status === 'disabled'"
                        class="rounded px-2 py-1 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 hover:text-red-900 dark:text-red-400 dark:hover:bg-red-900/20"
                        title="删除"
                        @click="deleteCard(card)"
                      >
                        <i class="fas fa-trash" />
                        <span class="ml-1">删除</span>
                      </button>
                    </div>
                  </td>
                </tr>
                <tr v-if="cards.length === 0">
                  <td
                    class="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400"
                    colspan="8"
                  >
                    暂无卡片数据
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>

        <!-- 分页 -->
        <div
          v-if="totalCards > 0"
          class="flex flex-none flex-col items-center justify-between gap-3 border-t border-gray-200 px-1 pt-3 dark:border-gray-700 sm:flex-row"
        >
          <div class="flex items-center gap-4">
            <span class="text-sm text-gray-600 dark:text-gray-400">
              共 {{ totalCards }} 条记录
            </span>
            <div class="flex items-center gap-2">
              <span class="text-sm text-gray-600 dark:text-gray-400">每页</span>
              <div class="w-[90px]">
                <CustomDropdown
                  v-model="cardPageSize"
                  accent="gray"
                  :options="pageSizeDropdownOptions"
                  placeholder="每页"
                  size="sm"
                  @change="changeCardPageSize"
                />
              </div>
              <span class="text-sm text-gray-600 dark:text-gray-400">条</span>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <button
              class="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
              :disabled="cardCurrentPage === 1"
              @click="changeCardPage(cardCurrentPage - 1)"
            >
              <i class="fas fa-chevron-left" />
            </button>
            <span class="text-sm text-gray-600 dark:text-gray-400">
              {{ cardCurrentPage }} / {{ cardTotalPages }}
            </span>
            <button
              class="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
              :disabled="cardCurrentPage >= cardTotalPages"
              @click="changeCardPage(cardCurrentPage + 1)"
            >
              <i class="fas fa-chevron-right" />
            </button>
          </div>
        </div>
      </div>

      <!-- Redemptions Tab -->
      <div v-else-if="activeTab === 'redemptions'" class="flex flex-col md:min-h-0 md:flex-1">
        <!-- 查询栏 -->
        <div class="mb-3 flex flex-none flex-wrap items-center gap-2">
          <div class="relative min-w-[180px] flex-1">
            <i
              class="fas fa-search pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400"
            />
            <input
              v-model="redemptionSearch"
              class="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              placeholder="搜索卡号 / 用户 / API Key"
              type="text"
              @keyup.enter="applyRedemptionFilters"
            />
          </div>
          <button
            class="inline-flex items-center rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
            @click="applyRedemptionFilters"
          >
            <i class="fas fa-search mr-1.5" />查询
          </button>
          <button
            v-if="redemptionSearch"
            class="inline-flex items-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
            @click="resetRedemptionFilters"
          >
            重置
          </button>
        </div>

        <!-- Table（内部滚动，表头吸顶） -->
        <div
          class="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700 md:min-h-0 md:flex-1 md:overflow-auto"
        >
          <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead class="sticky top-0 z-10 bg-gray-100 dark:bg-gray-700">
              <tr>
                <th
                  class="px-4 py-3 text-left text-sm font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300"
                >
                  卡号
                </th>
                <th
                  class="px-4 py-3 text-left text-sm font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300"
                >
                  用户
                </th>
                <th
                  class="px-4 py-3 text-left text-sm font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300"
                >
                  API Key
                </th>
                <th
                  class="px-4 py-3 text-left text-sm font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300"
                >
                  增加额度
                </th>
                <th
                  class="px-4 py-3 text-left text-sm font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300"
                >
                  状态
                </th>
                <th
                  class="px-4 py-3 text-left text-sm font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300"
                >
                  核销时间
                </th>
                <th
                  class="px-4 py-3 text-right text-sm font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300"
                >
                  操作
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
              <tr v-if="redemptionLoading">
                <td
                  class="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400"
                  colspan="7"
                >
                  <i class="fas fa-spinner fa-spin mr-2 text-blue-500" />加载中...
                </td>
              </tr>
              <template v-else>
                <tr
                  v-for="redemption in redemptions"
                  :key="redemption.id"
                  class="hover:bg-gray-50 dark:hover:bg-gray-700/50"
                >
                  <td class="whitespace-nowrap px-4 py-3">
                    <code
                      class="cursor-pointer rounded bg-gray-100 px-2 py-1 font-mono text-sm hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600"
                      title="点击复制"
                      @click="copyText(redemption.cardCode)"
                    >
                      {{ redemption.cardCode }}
                    </code>
                  </td>
                  <td class="whitespace-nowrap px-4 py-3">
                    <span
                      class="cursor-pointer text-sm text-gray-900 hover:text-blue-600 dark:text-white dark:hover:text-blue-400"
                      title="点击复制"
                      @click="copyText(redemption.username || redemption.userId)"
                    >
                      {{ redemption.username || redemption.userId }}
                    </span>
                  </td>
                  <td class="whitespace-nowrap px-4 py-3">
                    <span
                      class="cursor-pointer text-sm text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400"
                      title="点击复制"
                      @click="copyText(redemption.apiKeyName || redemption.apiKeyId)"
                    >
                      {{ redemption.apiKeyName || redemption.apiKeyId }}
                    </span>
                  </td>
                  <td class="whitespace-nowrap px-4 py-3 text-sm text-gray-900 dark:text-white">
                    <span v-if="redemption.quotaAdded > 0">${{ redemption.quotaAdded }}</span>
                    <span v-if="redemption.quotaAdded > 0 && redemption.timeAdded > 0"> + </span>
                    <span v-if="redemption.timeAdded > 0">
                      {{ redemption.timeAdded }}
                      {{
                        redemption.timeUnit === 'hours'
                          ? '小时'
                          : redemption.timeUnit === 'days'
                            ? '天'
                            : '月'
                      }}
                    </span>
                  </td>
                  <td class="whitespace-nowrap px-4 py-3">
                    <span
                      :class="[
                        'inline-flex rounded-full px-2 py-1 text-sm font-medium',
                        redemption.status === 'active'
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                          : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                      ]"
                    >
                      {{ redemption.status === 'active' ? '有效' : '已撤销' }}
                    </span>
                  </td>
                  <td class="whitespace-nowrap px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                    {{ formatDate(redemption.timestamp) }}
                  </td>
                  <td class="whitespace-nowrap px-4 py-3 text-right">
                    <button
                      v-if="redemption.status === 'active'"
                      class="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                      title="撤销核销"
                      @click="revokeRedemption(redemption)"
                    >
                      <i class="fas fa-undo" />
                    </button>
                  </td>
                </tr>
                <tr v-if="redemptions.length === 0">
                  <td
                    class="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400"
                    colspan="7"
                  >
                    暂无核销记录
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>

        <!-- 分页 -->
        <div
          v-if="totalRedemptions > 0"
          class="flex flex-none flex-col items-center justify-between gap-3 border-t border-gray-200 px-1 pt-3 dark:border-gray-700 sm:flex-row"
        >
          <div class="flex items-center gap-4">
            <span class="text-sm text-gray-600 dark:text-gray-400">
              共 {{ totalRedemptions }} 条记录
            </span>
            <div class="flex items-center gap-2">
              <span class="text-sm text-gray-600 dark:text-gray-400">每页</span>
              <div class="w-[90px]">
                <CustomDropdown
                  v-model="redemptionPageSize"
                  accent="gray"
                  :options="pageSizeDropdownOptions"
                  placeholder="每页"
                  size="sm"
                  @change="changeRedemptionPageSize"
                />
              </div>
              <span class="text-sm text-gray-600 dark:text-gray-400">条</span>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <button
              class="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
              :disabled="redemptionCurrentPage === 1"
              @click="changeRedemptionPage(redemptionCurrentPage - 1)"
            >
              <i class="fas fa-chevron-left" />
            </button>
            <span class="text-sm text-gray-600 dark:text-gray-400">
              {{ redemptionCurrentPage }} / {{ redemptionTotalPages }}
            </span>
            <button
              class="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
              :disabled="redemptionCurrentPage >= redemptionTotalPages"
              @click="changeRedemptionPage(redemptionCurrentPage + 1)"
            >
              <i class="fas fa-chevron-right" />
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Create Card Modal -->
    <ModalTransition>
      <div
        v-if="showCreateModal"
        class="modal fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        <div class="modal-content mx-auto max-h-[90vh] w-full max-w-lg overflow-y-auto p-6">
          <!-- Header -->
          <div class="mb-6 flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div
                class="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-600"
              >
                <i class="fas fa-ticket-alt text-white" />
              </div>
              <h3 class="text-lg font-bold text-gray-900 dark:text-gray-100">创建额度卡</h3>
            </div>
            <button
              class="p-1 text-gray-400 transition-colors hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
              @click="showCreateModal = false"
            >
              <i class="fas fa-times text-xl" />
            </button>
          </div>

          <!-- Form -->
          <div class="space-y-4">
            <div>
              <label class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
                >卡片类型</label
              >
              <CustomDropdown
                v-model="newCard.type"
                accent="blue"
                icon="fa-ticket-alt"
                :options="cardTypeOptions"
                placeholder="选择卡片类型"
              />
            </div>

            <div v-if="newCard.type === 'quota' || newCard.type === 'combo'">
              <label class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
                >额度数量 (美元)</label
              >
              <input
                v-model.number="newCard.quotaAmount"
                class="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                min="0"
                step="0.1"
                type="number"
              />
            </div>

            <div v-if="newCard.type === 'time' || newCard.type === 'combo'">
              <label class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
                >时间数量</label
              >
              <div class="flex gap-2">
                <input
                  v-model.number="newCard.timeAmount"
                  class="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  min="1"
                  type="number"
                />
                <div class="w-[110px]">
                  <CustomDropdown
                    v-model="newCard.timeUnit"
                    accent="blue"
                    :options="timeUnitOptions"
                    placeholder="单位"
                  />
                </div>
              </div>
            </div>

            <div>
              <label class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
                >批量生成数量</label
              >
              <input
                v-model.number="newCard.count"
                class="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                min="1"
                type="number"
              />
            </div>

            <!-- 卡号前缀 -->
            <div>
              <div class="mb-1 flex items-center justify-between">
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300"
                  >卡号前缀</label
                >
                <label
                  class="flex cursor-pointer items-center gap-2 text-sm text-gray-600 dark:text-gray-400"
                >
                  <input
                    v-model="newCard.usePrefix"
                    class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700"
                    type="checkbox"
                  />
                  使用前缀
                </label>
              </div>
              <input
                v-model="newCard.codePrefix"
                class="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                :disabled="!newCard.usePrefix"
                maxlength="16"
                placeholder="如 CC、VIP（仅字母数字，自动转大写）"
                type="text"
              />
              <p class="mt-1 text-sm text-gray-400">卡号示例：{{ cardCodeExample }}</p>
            </div>

            <div>
              <label class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
                >备注（可选）</label
              >
              <input
                v-model="newCard.note"
                class="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                placeholder="例如：新年促销卡"
                type="text"
              />
            </div>
          </div>

          <!-- Footer -->
          <div class="mt-6 flex gap-3">
            <button
              class="flex-1 rounded-xl bg-gray-100 px-4 py-2.5 font-medium text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
              type="button"
              @click="showCreateModal = false"
            >
              取消
            </button>
            <button
              class="flex-1 rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 px-4 py-2.5 font-medium text-white shadow-sm transition-colors hover:from-blue-600 hover:to-blue-700 disabled:opacity-50"
              :disabled="creating"
              type="button"
              @click="createCard"
            >
              <i v-if="creating" class="fas fa-spinner fa-spin mr-2" />
              {{ creating ? '创建中...' : '创建' }}
            </button>
          </div>
        </div>
      </div>
    </ModalTransition>

    <!-- Limits Config Modal -->
    <ModalTransition>
      <div
        v-if="showLimitsModal"
        class="modal fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        <div class="modal-content mx-auto max-h-[90vh] w-full max-w-md overflow-y-auto p-6">
          <!-- Header -->
          <div class="mb-6 flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div
                class="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-600"
              >
                <i class="fas fa-shield-alt text-white" />
              </div>
              <h3 class="text-lg font-bold text-gray-900 dark:text-gray-100">兑换上限保护</h3>
            </div>
            <button
              class="p-1 text-gray-400 transition-colors hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
              @click="showLimitsModal = false"
            >
              <i class="fas fa-times text-xl" />
            </button>
          </div>

          <p class="mb-4 text-sm text-gray-500 dark:text-gray-400">
            开启后，创建额度卡时的额度与有效期不能超过以下上限，防止误操作生成超大额度卡。
          </p>

          <!-- 加载状态 -->
          <p v-if="limitsStatus === 'loading'" class="text-sm text-gray-400">上限配置加载中...</p>
          <p v-else-if="limitsStatus === 'error'" class="text-sm text-red-500">
            上限配置加载失败，已禁用编辑以防覆盖服务器配置，请刷新页面重试
          </p>

          <!-- Form -->
          <div v-else class="space-y-4">
            <!-- 启用开关 -->
            <div class="flex items-center justify-between">
              <span class="text-sm font-medium text-gray-700 dark:text-gray-300">启用上限保护</span>
              <label class="relative inline-flex cursor-pointer items-center">
                <input v-model="limitsForm.enabled" class="peer sr-only" type="checkbox" />
                <div
                  class="peer h-5 w-9 rounded-full bg-gray-300 after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:bg-blue-600 peer-checked:after:translate-x-full dark:bg-gray-600"
                />
              </label>
            </div>

            <div>
              <label class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
                >最大额度 (美元)</label
              >
              <input
                v-model.number="limitsForm.maxTotalCostLimit"
                class="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                :disabled="!limitsForm.enabled"
                min="0"
                type="number"
              />
            </div>

            <div>
              <label class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
                >最大有效期 (天)</label
              >
              <input
                v-model.number="limitsForm.maxExpiryDays"
                class="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                :disabled="!limitsForm.enabled"
                min="0"
                type="number"
              />
            </div>
          </div>

          <!-- Footer -->
          <div class="mt-6 flex gap-3">
            <button
              class="flex-1 rounded-xl bg-gray-100 px-4 py-2.5 font-medium text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
              type="button"
              @click="showLimitsModal = false"
            >
              取消
            </button>
            <button
              class="flex-1 rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 px-4 py-2.5 font-medium text-white shadow-sm transition-colors hover:from-blue-600 hover:to-blue-700 disabled:opacity-50"
              :disabled="savingLimits || limitsStatus !== 'loaded'"
              type="button"
              @click="saveLimits"
            >
              <i v-if="savingLimits" class="fas fa-spinner fa-spin mr-2" />
              {{ savingLimits ? '保存中...' : '保存' }}
            </button>
          </div>
        </div>
      </div>
    </ModalTransition>

    <!-- Result Modal -->
    <ModalTransition>
      <div
        v-if="showResultModal"
        class="modal fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        <div class="modal-content mx-auto w-full max-w-lg p-6">
          <!-- Header -->
          <div class="mb-6 flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div
                class="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-green-500 to-green-600"
              >
                <i class="fas fa-check text-white" />
              </div>
              <div>
                <h3 class="text-lg font-bold text-gray-900 dark:text-gray-100">创建成功</h3>
                <p class="text-sm text-gray-500 dark:text-gray-400">
                  已创建 {{ createdCards.length }} 张卡片
                </p>
              </div>
            </div>
            <button
              class="p-1 text-gray-400 transition-colors hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
              @click="showResultModal = false"
            >
              <i class="fas fa-times text-xl" />
            </button>
          </div>

          <!-- Card List -->
          <div class="mb-4 max-h-60 overflow-y-auto rounded-lg bg-gray-50 p-3 dark:bg-gray-700/50">
            <div
              v-for="(card, index) in createdCards"
              :key="card.id"
              class="flex items-center justify-between border-b border-gray-200 py-2 last:border-0 dark:border-gray-600"
            >
              <div class="flex items-center gap-2">
                <span class="text-sm text-gray-400">{{ index + 1 }}.</span>
                <code class="font-mono text-sm text-gray-900 dark:text-white">{{ card.code }}</code>
              </div>
              <span class="text-sm text-gray-500 dark:text-gray-400">
                <template v-if="card.type === 'quota' || card.type === 'combo'">
                  ${{ card.quotaAmount }}
                </template>
                <template v-if="card.type === 'combo'"> + </template>
                <template v-if="card.type === 'time' || card.type === 'combo'">
                  {{ card.timeAmount }}
                  {{ card.timeUnit === 'hours' ? '小时' : card.timeUnit === 'days' ? '天' : '月' }}
                </template>
              </span>
            </div>
          </div>

          <!-- Warning -->
          <div
            class="mb-4 rounded-lg border border-yellow-200 bg-yellow-50 p-3 dark:border-yellow-700 dark:bg-yellow-900/20"
          >
            <div class="flex items-start gap-2">
              <i class="fas fa-exclamation-triangle mt-0.5 text-yellow-500" />
              <p class="text-sm text-yellow-700 dark:text-yellow-300">
                请立即下载或复制卡号，关闭后将无法再次查看完整卡号列表。
              </p>
            </div>
          </div>

          <!-- Actions -->
          <div class="flex gap-3">
            <button
              class="flex-1 rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 px-4 py-2.5 font-medium text-white shadow-sm transition-colors hover:from-blue-600 hover:to-blue-700"
              type="button"
              @click="downloadCards"
            >
              <i class="fas fa-download mr-2" />
              下载 TXT
            </button>
            <button
              class="flex-1 rounded-xl bg-gray-100 px-4 py-2.5 font-medium text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
              type="button"
              @click="copyAllCards"
            >
              <i class="fas fa-copy mr-2" />
              复制全部
            </button>
          </div>
        </div>
      </div>
    </ModalTransition>
    <!-- Revoke Modal -->
    <ModalTransition>
      <div
        v-if="showRevokeModal"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
        @click.self="showRevokeModal = false"
      >
        <div
          class="modal-panel w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-gray-800"
        >
          <h3 class="mb-4 text-lg font-semibold text-gray-900 dark:text-white">撤销核销</h3>
          <div class="mb-4">
            <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
              撤销原因（可选）
            </label>
            <input
              v-model="revokeReason"
              class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              placeholder="请输入撤销原因"
              type="text"
            />
          </div>
          <div class="flex justify-end gap-3">
            <button
              class="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
              @click="showRevokeModal = false"
            >
              取消
            </button>
            <button
              class="rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-600"
              @click="executeRevoke"
            >
              确认撤销
            </button>
          </div>
        </div>
      </div>
    </ModalTransition>

    <!-- Confirm Modal -->
    <ConfirmModal
      :cancel-text="confirmModalConfig.cancelText"
      :confirm-text="confirmModalConfig.confirmText"
      :message="confirmModalConfig.message"
      :show="showConfirmModal"
      :title="confirmModalConfig.title"
      :type="confirmModalConfig.type"
      @cancel="handleCancelModal"
      @confirm="handleConfirmModal"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import ConfirmModal from '@/components/common/ConfirmModal.vue'
import ModalTransition from '@/components/common/ModalTransition.vue'

import * as httpApis from '@/utils/http_apis'
import { showToast, copyText, formatDate, calcViewportBottomReserve } from '@/utils/tools'

const loading = ref(false)
const redemptionLoading = ref(false)
const creating = ref(false)
const showCreateModal = ref(false)
const showLimitsModal = ref(false)
const savingLimits = ref(false)
const showResultModal = ref(false)
const showConfirmModal = ref(false)
const confirmModalConfig = ref({
  title: '',
  message: '',
  type: 'primary',
  confirmText: '确认',
  cancelText: '取消'
})
const confirmResolve = ref(null)
const createdCards = ref([])
const showRevokeModal = ref(false)
const revokeReason = ref('')
const revokingRedemption = ref(null)
const activeTab = ref('cards')
const selectedCards = ref([])

const pageSizeDropdownOptions = [
  { value: 20, label: '20' },
  { value: 50, label: '50' },
  { value: 100, label: '100' },
  { value: 200, label: '200' }
]

const cardTypeFilterOptions = [
  { value: '', label: '全部类型' },
  { value: 'quota', label: '额度卡' },
  { value: 'time', label: '时间卡' },
  { value: 'combo', label: '组合卡' }
]

const cardStatusFilterOptions = [
  { value: '', label: '全部状态' },
  { value: 'unused', label: '未使用' },
  { value: 'redeemed', label: '已核销' },
  { value: 'revoked', label: '已撤销' },
  { value: 'expired', label: '已过期' },
  { value: 'disabled', label: '已禁用' }
]

const cardTypeOptions = [
  { value: 'quota', label: '额度卡' },
  { value: 'time', label: '时间卡' },
  { value: 'combo', label: '组合卡' }
]

const timeUnitOptions = [
  { value: 'hours', label: '小时' },
  { value: 'days', label: '天' },
  { value: 'months', label: '月' }
]

// 卡片查询/分页
const cardSearch = ref('')
const cardTypeFilter = ref('')
const cardStatusFilter = ref('')
const cardCurrentPage = ref(1)
const cardPageSize = ref(100)
const totalCards = ref(0)

// 核销查询/分页
const redemptionSearch = ref('')
const redemptionCurrentPage = ref(1)
const redemptionPageSize = ref(100)
const totalRedemptions = ref(0)

const tabs = [
  { id: 'cards', name: '卡片列表' },
  { id: 'redemptions', name: '核销记录' }
]

const stats = ref({
  total: 0,
  unused: 0,
  redeemed: 0,
  revoked: 0,
  expired: 0
})

const limitsConfig = ref({
  enabled: true,
  maxExpiryDays: 90,
  maxTotalCostLimit: 1000
})
// 上限配置加载状态：loading（加载中）| loaded（成功）| error（失败）
// 仅 loaded 时允许编辑/保存，避免用默认值覆盖真实配置；区分 loading 与 error 防止首屏误报失败
const limitsStatus = ref('loading')
// dialog 内编辑的工作副本，打开时从 limitsConfig 拷贝，保存成功后回写，取消则丢弃
const limitsForm = ref({
  enabled: true,
  maxExpiryDays: 90,
  maxTotalCostLimit: 1000
})

const cards = ref([])
const redemptions = ref([])

// 可选择的卡片（只有未使用的才能选择）
const selectableCards = computed(() => cards.value.filter((c) => c.status === 'unused'))

// 是否全选
const isAllSelected = computed(
  () =>
    selectableCards.value.length > 0 && selectedCards.value.length === selectableCards.value.length
)

// 是否部分选中
const isIndeterminate = computed(
  () => selectedCards.value.length > 0 && selectedCards.value.length < selectableCards.value.length
)

// 切换全选
const toggleSelectAll = () => {
  if (isAllSelected.value) {
    selectedCards.value = []
  } else {
    selectedCards.value = selectableCards.value.map((c) => c.id)
  }
}

// 切换单个选择
const toggleSelectCard = (cardId) => {
  const index = selectedCards.value.indexOf(cardId)
  if (index === -1) {
    selectedCards.value.push(cardId)
  } else {
    selectedCards.value.splice(index, 1)
  }
}

const newCard = ref({
  type: 'quota',
  quotaAmount: 10,
  timeAmount: 30,
  timeUnit: 'days',
  count: 1,
  note: '',
  usePrefix: true,
  codePrefix: 'CC'
})

// 卡号示例（与后端清洗规则一致）
const cardCodeExample = computed(() => {
  const prefix = newCard.value.usePrefix
    ? newCard.value.codePrefix
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, 16)
    : ''
  return prefix ? `${prefix}_A2B3_C4D5_E6F7` : 'A2B3_C4D5_E6F7'
})

const showConfirm = (
  title,
  message,
  confirmText = '确认',
  cancelText = '取消',
  type = 'primary'
) => {
  return new Promise((resolve) => {
    confirmModalConfig.value = { title, message, confirmText, cancelText, type }
    confirmResolve.value = resolve
    showConfirmModal.value = true
  })
}
const handleConfirmModal = () => {
  showConfirmModal.value = false
  confirmResolve.value?.(true)
}
const handleCancelModal = () => {
  showConfirmModal.value = false
  confirmResolve.value?.(false)
}

// 加载卡片列表 + 统计
const loadCards = async () => {
  loading.value = true
  try {
    const offset = (cardCurrentPage.value - 1) * cardPageSize.value
    const [cardsData, statsData] = await Promise.all([
      httpApis.getQuotaCardsWithParamsApi({
        limit: cardPageSize.value,
        offset,
        search: cardSearch.value || undefined,
        type: cardTypeFilter.value || undefined,
        status: cardStatusFilter.value || undefined
      }),
      httpApis.getQuotaCardsStatsApi()
    ])
    if (!cardsData.success) {
      showToast(cardsData.message || '加载卡片列表失败', 'error')
    } else {
      cards.value = cardsData.data?.cards || []
      totalCards.value = cardsData.data?.total || 0
    }
    if (statsData.success) {
      stats.value = statsData.data || stats.value
    } else {
      showToast(statsData.message || '加载统计失败', 'error')
    }
  } catch (error) {
    console.error('加载卡片列表异常:', error)
    showToast('加载卡片列表失败', 'error')
  } finally {
    loading.value = false
  }
}

// 加载核销记录
const loadRedemptions = async () => {
  redemptionLoading.value = true
  try {
    const offset = (redemptionCurrentPage.value - 1) * redemptionPageSize.value
    const data = await httpApis.getRedemptionsApi({
      limit: redemptionPageSize.value,
      offset,
      search: redemptionSearch.value || undefined
    })
    if (!data.success) {
      showToast(data.message || '加载核销记录失败', 'error')
      return
    }
    redemptions.value = data.data?.redemptions || []
    totalRedemptions.value = data.data?.total || 0
  } catch (error) {
    console.error('加载核销记录异常:', error)
    showToast('加载核销记录失败', 'error')
  } finally {
    redemptionLoading.value = false
  }
}

// 加载上限配置
const loadLimits = async () => {
  limitsStatus.value = 'loading'
  try {
    const result = await httpApis.getQuotaCardLimitsApi()
    if (result.success) {
      if (result.data) {
        limitsConfig.value = result.data
      }
      limitsStatus.value = 'loaded'
    } else {
      limitsStatus.value = 'error'
      showToast(result.message || '加载上限配置失败', 'error')
    }
  } catch (error) {
    limitsStatus.value = 'error'
    console.error('加载上限配置异常:', error)
    showToast('加载上限配置失败', 'error')
  }
}

const openLimitsModal = () => {
  limitsForm.value = { ...limitsConfig.value }
  showLimitsModal.value = true
}

const saveLimits = async () => {
  if (limitsStatus.value !== 'loaded') {
    showToast('上限配置尚未加载成功，无法保存', 'error')
    return
  }
  savingLimits.value = true
  try {
    const result = await httpApis.updateQuotaCardLimitsApi(limitsForm.value)
    if (result.success) {
      limitsConfig.value = { ...limitsForm.value }
      showLimitsModal.value = false
      showToast('配置已保存', 'success')
    } else {
      showToast(result.message || '配置保存失败', 'error')
    }
  } catch (error) {
    console.error('保存上限配置异常:', error)
    showToast('配置保存失败', 'error')
  } finally {
    savingLimits.value = false
  }
}

// 弹窗在配置加载完成前被打开时，limitsForm 是默认值快照；待 loadLimits 完成（limitsConfig 已更新、
// 状态转 loaded）后用真实配置刷新表单，避免把默认值当成真实值保存而覆盖服务器配置。
// 加载中表单字段不渲染（仅 loaded 分支显示）、保存按钮禁用，故此刷新不会覆盖用户编辑
watch(limitsStatus, (status) => {
  if (status === 'loaded' && showLimitsModal.value) {
    limitsForm.value = { ...limitsConfig.value }
  }
})

// 卡片分页
const cardTotalPages = computed(() => Math.max(1, Math.ceil(totalCards.value / cardPageSize.value)))

const applyCardFilters = () => {
  cardCurrentPage.value = 1
  selectedCards.value = []
  loadCards()
}

const resetCardFilters = () => {
  cardSearch.value = ''
  cardTypeFilter.value = ''
  cardStatusFilter.value = ''
  applyCardFilters()
}

const changeCardPage = (page) => {
  if (page < 1 || page > cardTotalPages.value) {
    return
  }
  cardCurrentPage.value = page
  selectedCards.value = []
  loadCards()
}

const changeCardPageSize = () => {
  cardCurrentPage.value = 1
  selectedCards.value = []
  loadCards()
}

// 核销分页
const redemptionTotalPages = computed(() =>
  Math.max(1, Math.ceil(totalRedemptions.value / redemptionPageSize.value))
)

const applyRedemptionFilters = () => {
  redemptionCurrentPage.value = 1
  loadRedemptions()
}

const resetRedemptionFilters = () => {
  redemptionSearch.value = ''
  applyRedemptionFilters()
}

const changeRedemptionPage = (page) => {
  if (page < 1 || page > redemptionTotalPages.value) {
    return
  }
  redemptionCurrentPage.value = page
  loadRedemptions()
}

const changeRedemptionPageSize = () => {
  redemptionCurrentPage.value = 1
  loadRedemptions()
}

const createCard = async () => {
  if (newCard.value.usePrefix && !newCard.value.codePrefix.trim()) {
    showToast('请输入卡号前缀，或关闭"使用前缀"', 'error')
    return
  }
  creating.value = true
  try {
    const payload = {
      ...newCard.value,
      codePrefix: newCard.value.usePrefix ? newCard.value.codePrefix.trim() : ''
    }
    const result = await httpApis.createQuotaCardApi(payload)
    if (result.success) {
      showCreateModal.value = false

      // 处理返回的卡片数据
      const data = result.data
      if (Array.isArray(data)) {
        createdCards.value = data
      } else if (data) {
        createdCards.value = [data]
      } else {
        createdCards.value = []
      }

      // 显示结果弹窗
      if (createdCards.value.length > 0) {
        showResultModal.value = true
      }

      showToast(`成功创建 ${createdCards.value.length} 张卡片`, 'success')
      applyCardFilters()
    } else {
      showToast(result.message || '创建卡片失败', 'error')
    }
  } catch (error) {
    console.error('创建卡片异常:', error)
    showToast('创建卡片失败', 'error')
  } finally {
    creating.value = false
  }
}

// 下载卡片
const downloadCards = () => {
  if (createdCards.value.length === 0) return

  const content = createdCards.value
    .map((card) => {
      let label = ''
      if (card.type === 'quota' || card.type === 'combo') {
        label += `$${card.quotaAmount}`
      }
      if (card.type === 'combo') {
        label += '_'
      }
      if (card.type === 'time' || card.type === 'combo') {
        const unitMap = { hours: 'h', days: 'd', months: 'm' }
        label += `${card.timeAmount}${unitMap[card.timeUnit] || card.timeUnit}`
      }
      return `${label} ${card.code}`
    })
    .join('\n')

  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)
  link.download = `quota-cards-${timestamp}.txt`

  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)

  showToast('卡片文件已下载', 'success')
}

// 复制所有卡号
const copyAllCards = async () => {
  if (createdCards.value.length === 0) return

  const content = createdCards.value.map((card) => card.code).join('\n')

  try {
    await navigator.clipboard.writeText(content)
    showToast('已复制所有卡号', 'success')
  } catch (error) {
    console.error('Failed to copy:', error)
    showToast('复制失败', 'error')
  }
}

const cardStatusLabel = (status) => {
  const map = {
    unused: '未使用',
    redeemed: '已核销',
    expired: '已过期',
    revoked: '已撤销',
    disabled: '已禁用'
  }
  return map[status] || status
}

const toggleCardStatus = async (card) => {
  const enabled = card.status === 'disabled'
  const result = await httpApis.toggleQuotaCardApi(card.id, enabled)
  if (!result.success) {
    // 404 卡已不存在 / 409 状态已变更：均说明本地列表已过时，提示后刷新与服务端对齐
    if (result.httpStatus === 404) {
      showToast('卡片不存在，可能已被删除', 'error')
      loadCards()
    } else if (result.httpStatus === 409) {
      showToast(result.message || result.error || '卡片状态已变更，无法执行该操作', 'warning')
      loadCards()
    } else {
      showToast(result.message || result.error || '操作失败', 'error')
    }
    return
  }
  showToast(enabled ? '卡片已启用' : '卡片已禁用', 'success')
  loadCards()
}

const deleteCard = async (card) => {
  const confirmed = await showConfirm(
    '删除卡片',
    `确定删除卡片 ${card.code}？`,
    '确定删除',
    '取消',
    'danger'
  )
  if (!confirmed) return

  const result = await httpApis.deleteQuotaCardApi(card.id)
  if (!result.success) {
    // 404 卡已不存在：等价于删除目的已达成，提示并刷新与服务端对齐；409 状态冲突单独提示
    if (result.httpStatus === 404) {
      showToast('卡片不存在，可能已被删除', 'warning')
      loadCards()
      return
    }
    if (result.httpStatus === 409) {
      showToast(result.message || result.error || '该状态的卡片无法删除', 'warning')
      loadCards()
      return
    }
    showToast(result.message || '删除卡片失败', 'error')
    return
  }
  showToast('卡片已删除', 'success')
  loadCards()
}

const deleteSelectedCards = async () => {
  const confirmed = await showConfirm(
    '批量删除',
    `确定删除选中的 ${selectedCards.value.length} 张卡片？`,
    '确定删除',
    '取消',
    'danger'
  )
  if (!confirmed) return

  const results = await Promise.all(
    selectedCards.value.map((id) => httpApis.deleteQuotaCardApi(id))
  )
  // 按 httpStatus 分类汇总，与单条删除语义对齐：404（卡已不存在）视作删除目的已达成
  let ok = 0
  let conflict = 0
  let failed = 0
  for (const r of results) {
    if (r.success || r.httpStatus === 404) ok += 1
    else if (r.httpStatus === 409) conflict += 1
    else failed += 1
  }
  if (failed > 0 || conflict > 0) {
    const parts = [`成功 ${ok} 张`]
    if (conflict > 0) parts.push(`状态不允许 ${conflict} 张`)
    if (failed > 0) parts.push(`失败 ${failed} 张`)
    showToast(parts.join('，'), ok > 0 ? 'warning' : 'error')
  } else {
    showToast(`已删除 ${ok} 张卡片`, 'success')
  }
  selectedCards.value = []
  loadCards()
}

const revokeRedemption = (redemption) => {
  revokingRedemption.value = redemption
  revokeReason.value = ''
  showRevokeModal.value = true
}

const executeRevoke = async () => {
  if (!revokingRedemption.value) return
  const result = await httpApis.revokeRedemptionApi(revokingRedemption.value.id, {
    reason: revokeReason.value
  })
  if (!result.success) {
    showToast(result.message || '撤销失败', 'error')
    return
  }
  showToast('核销已撤销', 'success')
  showRevokeModal.value = false
  revokingRedemption.value = null
  // 撤销会同时影响卡片状态、核销记录与统计
  loadRedemptions()
  loadCards()
}

// 让卡片填满 AppHeader 以下的剩余视口空间（动态测量，避免魔数与双滚动）
// 两个分支统一用 height（保留卡片铺满视口的设计）；极矮视口下头部 flex-none 撑破 N 时，
// 由容器自身的 overflow-y-auto 内部滚动兜底，页面始终不溢出
const cardRef = ref(null)
const cardHeight = ref(null)
// 移动端（< md 768px）不锁高度：让容器自然撑开、整页滚动，避免 header 占满后剩余空间被压到接近 0
// 桌面端保留动态测量铺满视口 + 内部滚动
const MOBILE_BREAKPOINT = 768
const isMobile = ref(typeof window !== 'undefined' && window.innerWidth < MOBILE_BREAKPOINT)

// 扣除 .tab-content 进场动画的 translateY：getBoundingClientRect 含 transform，
// 动画期间 raw top 会偏大 → 算出的 height 偏小，动画结束后再校正就会「高度抖动」
const getStableTop = (el) => {
  let top = el.getBoundingClientRect().top
  let node = el.parentElement
  while (node && node !== document.documentElement) {
    if (node.classList?.contains('tab-content')) {
      const transform = getComputedStyle(node).transform
      if (transform && transform !== 'none') {
        try {
          top -= new DOMMatrixReadOnly(transform).m42
        } catch {
          // DOMMatrixReadOnly 不可用时忽略，退回 raw top
        }
      }
    }
    node = node.parentElement
  }
  return top
}

const cardStyle = computed(() => {
  if (isMobile.value) {
    return {}
  }
  // 统一走像素高度，避免 calc(100dvh-220px) 与实测两套算法切换时跳变
  if (cardHeight.value != null) {
    return { height: `${cardHeight.value}px` }
  }
  if (typeof window === 'undefined') {
    return {}
  }
  return { height: `${Math.max(0, window.innerHeight - 220)}px` }
})

const updateCardHeight = () => {
  const el = cardRef.value
  if (!el) {
    return
  }
  isMobile.value = window.innerWidth < MOBILE_BREAKPOINT
  // 移动端不测量、不锁高度，交给自然流 + 整页滚动
  if (isMobile.value) {
    cardHeight.value = null
    return
  }
  const top = getStableTop(el)
  // 系统化扣除 card 底边到视口底的固定占用（外层 glass/页面的 padding/border 等），不写死魔数；
  // 不设固定下限——下限会在剩余空间小于它时把卡片强行撑高反而溢出（旧的 360 即此 bug）
  const next = Math.max(0, Math.floor(window.innerHeight - top - calcViewportBottomReserve(el)))
  // 忽略 1px 级抖动（亚像素/滚动条），避免无意义回写触发布局
  if (cardHeight.value == null || Math.abs(next - cardHeight.value) > 1) {
    cardHeight.value = next
  }
}

// 用 rAF 合并同一帧内的多次触发
let cardHeightRaf = 0
const scheduleUpdateCardHeight = () => {
  if (cardHeightRaf) {
    return
  }
  cardHeightRaf = window.requestAnimationFrame(() => {
    cardHeightRaf = 0
    updateCardHeight()
  })
}

let cardResizeObserver = null
let cardAnimationTarget = null

// 观察会推动 card 位置的元素：祖先链 + 各祖先的前置兄弟（含 AppHeader、TabBar）
// 不 observe card 自身——自身 height 写入会触发 ResizeObserver，徒增一轮空转
const observeLayoutTargets = () => {
  if (!cardResizeObserver || !cardRef.value) {
    return
  }
  let node = cardRef.value.parentElement
  while (node && node !== document.documentElement) {
    cardResizeObserver.observe(node)
    let sibling = node.previousElementSibling
    while (sibling) {
      cardResizeObserver.observe(sibling)
      sibling = sibling.previousElementSibling
    }
    node = node.parentElement
  }
}

onMounted(() => {
  loadLimits()
  loadCards()
  loadRedemptions()
  window.addEventListener('resize', scheduleUpdateCardHeight)
  if (typeof ResizeObserver !== 'undefined') {
    cardResizeObserver = new ResizeObserver(scheduleUpdateCardHeight)
  }
  // 同步首测（含 transform 补偿），尽量在首帧就落到最终高度
  updateCardHeight()
  // 仍监听 animationend 作兜底（补偿失效或浏览器差异时校正一次）
  cardAnimationTarget = cardRef.value?.closest('.tab-content') || null
  if (cardAnimationTarget) {
    cardAnimationTarget.addEventListener('animationend', scheduleUpdateCardHeight)
  }
  nextTick(() => {
    updateCardHeight()
    observeLayoutTargets()
  })
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', scheduleUpdateCardHeight)
  if (cardAnimationTarget) {
    cardAnimationTarget.removeEventListener('animationend', scheduleUpdateCardHeight)
    cardAnimationTarget = null
  }
  if (cardResizeObserver) {
    cardResizeObserver.disconnect()
    cardResizeObserver = null
  }
  if (cardHeightRaf) {
    window.cancelAnimationFrame(cardHeightRaf)
    cardHeightRaf = 0
  }
})
</script>

<style scoped>
/* 顶部统计卡片紧凑化 */
.stat-card {
  padding: 12px 16px;
  border-radius: 14px;
}

.stat-icon {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  font-size: 18px;
}

/* 盖掉 main.css 全局 div{transition:all}，高度锁定容器禁止参与过渡 */
.transition-none {
  transition: none !important;
}
</style>
