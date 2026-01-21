<template>
  <div class="tab-content">
    <div class="card p-4 sm:p-6">
      <!-- Header -->
      <div class="mb-4 flex flex-col gap-4 sm:mb-6">
        <div class="flex items-center justify-between">
          <div>
            <h3 class="mb-1 text-lg font-bold text-gray-900 dark:text-gray-100 sm:mb-2 sm:text-xl">
              额度卡管理
            </h3>
            <p class="text-sm text-gray-600 dark:text-gray-400 sm:text-base">
              管理额度卡和时间卡，用户可核销增加额度
            </p>
          </div>
          <button
            class="inline-flex items-center rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            @click="showCreateModal = true"
          >
            <i class="fas fa-plus mr-2" />
            创建卡片
          </button>
        </div>

        <!-- Stats Cards -->
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          <div class="stat-card">
            <div class="flex items-center justify-between">
              <div>
                <p class="mb-1 text-xs font-semibold text-gray-600 dark:text-gray-400 sm:text-sm">
                  总卡片数
                </p>
                <p class="text-xl font-bold text-gray-900 dark:text-gray-100 sm:text-2xl">
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
                <p class="mb-1 text-xs font-semibold text-gray-600 dark:text-gray-400 sm:text-sm">
                  未使用
                </p>
                <p class="text-xl font-bold text-green-600 dark:text-green-400 sm:text-2xl">
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
                <p class="mb-1 text-xs font-semibold text-gray-600 dark:text-gray-400 sm:text-sm">
                  已核销
                </p>
                <p class="text-xl font-bold text-purple-600 dark:text-purple-400 sm:text-2xl">
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
                <p class="mb-1 text-xs font-semibold text-gray-600 dark:text-gray-400 sm:text-sm">
                  已撤销
                </p>
                <p class="text-xl font-bold text-red-600 dark:text-red-400 sm:text-2xl">
                  {{ stats.revoked }}
                </p>
              </div>
              <div class="stat-icon flex-shrink-0 bg-gradient-to-br from-red-500 to-red-600">
                <i class="fas fa-ban" />
              </div>
            </div>
          </div>
        </div>

        <!-- Limits Config Card -->
        <div
          class="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/50"
        >
          <div class="flex flex-wrap items-center gap-4">
            <div class="flex items-center gap-2">
              <span class="text-sm font-medium text-gray-700 dark:text-gray-300">兑换上限保护</span>
              <label class="relative inline-flex cursor-pointer items-center">
                <input
                  v-model="limitsConfig.enabled"
                  class="peer sr-only"
                  type="checkbox"
                  @change="saveLimitsConfig"
                />
                <div
                  class="peer h-5 w-9 rounded-full bg-gray-300 after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:bg-blue-600 peer-checked:after:translate-x-full dark:bg-gray-600"
                />
              </label>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-sm text-gray-600 dark:text-gray-400">最大额度</span>
              <input
                v-model.number="limitsConfig.maxTotalCostLimit"
                class="w-24 rounded border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                :disabled="!limitsConfig.enabled"
                min="0"
                type="number"
                @change="saveLimitsConfig"
              />
              <span class="text-sm text-gray-500 dark:text-gray-400">$</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-sm text-gray-600 dark:text-gray-400">最大有效期</span>
              <input
                v-model.number="limitsConfig.maxExpiryDays"
                class="w-20 rounded border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                :disabled="!limitsConfig.enabled"
                min="0"
                type="number"
                @change="saveLimitsConfig"
              />
              <span class="text-sm text-gray-500 dark:text-gray-400">天</span>
            </div>
          </div>
        </div>

        <!-- Tab Navigation -->
        <div class="border-b border-gray-200 dark:border-gray-700">
          <nav aria-label="Tabs" class="-mb-px flex space-x-8">
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

      <!-- Loading -->
      <div v-if="loading" class="flex items-center justify-center py-12">
        <i class="fas fa-spinner fa-spin mr-2 text-blue-500" />
        <span class="text-gray-500 dark:text-gray-400">加载中...</span>
      </div>

      <!-- Cards Table -->
      <div v-else-if="activeTab === 'cards'" class="overflow-x-auto">
        <!-- Batch Actions -->
        <div
          v-if="selectedCards.length > 0"
          class="mb-3 flex items-center gap-3 rounded-lg bg-blue-50 p-3 dark:bg-blue-900/20"
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

        <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead class="bg-gray-50 dark:bg-gray-700/50">
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
                class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300"
              >
                卡号
              </th>
              <th
                class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300"
              >
                类型
              </th>
              <th
                class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300"
              >
                额度/时间
              </th>
              <th
                class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300"
              >
                状态
              </th>
              <th
                class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300"
              >
                核销用户
              </th>
              <th
                class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300"
              >
                创建时间
              </th>
              <th
                class="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300"
              >
                操作
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
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
                  class="cursor-pointer rounded bg-gray-100 px-2 py-1 font-mono text-xs hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600"
                  title="点击复制"
                  @click="copyText(card.code)"
                >
                  {{ card.code }}
                </code>
              </td>
              <td class="whitespace-nowrap px-4 py-3">
                <span
                  :class="[
                    'inline-flex rounded-full px-2 py-1 text-xs font-medium',
                    card.type === 'quota'
                      ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
                      : card.type === 'time'
                        ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                        : 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300'
                  ]"
                >
                  {{
                    card.type === 'quota' ? '额度卡' : card.type === 'time' ? '时间卡' : '组合卡'
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
                  {{ card.timeUnit === 'hours' ? '小时' : card.timeUnit === 'days' ? '天' : '月' }}
                </span>
              </td>
              <td class="whitespace-nowrap px-4 py-3">
                <span
                  :class="[
                    'inline-flex rounded-full px-2 py-1 text-xs font-medium',
                    card.status === 'unused'
                      ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                      : card.status === 'redeemed'
                        ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300'
                        : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                  ]"
                >
                  {{
                    card.status === 'unused'
                      ? '未使用'
                      : card.status === 'redeemed'
                        ? '已核销'
                        : '已撤销'
                  }}
                </span>
              </td>
              <td class="whitespace-nowrap px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                {{ card.redeemedByUsername || '-' }}
              </td>
              <td class="whitespace-nowrap px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                {{ formatDate(card.createdAt) }}
              </td>
              <td class="whitespace-nowrap px-4 py-3 text-right">
                <button
                  v-if="card.status === 'unused'"
                  class="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                  title="删除"
                  @click="deleteCard(card)"
                >
                  <i class="fas fa-trash" />
                </button>
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
          </tbody>
        </table>

        <!-- 分页 -->
        <div
          v-if="totalCards > 0"
          class="flex flex-col items-center justify-between gap-3 border-t border-gray-200 px-4 py-3 dark:border-gray-700 sm:flex-row"
        >
          <div class="flex items-center gap-4">
            <span class="text-sm text-gray-600 dark:text-gray-400">
              共 {{ totalCards }} 条记录
            </span>
            <div class="flex items-center gap-2">
              <span class="text-sm text-gray-600 dark:text-gray-400">每页</span>
              <select
                v-model="pageSize"
                class="rounded-md border border-gray-200 bg-white px-2 py-1 text-sm text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300"
                @change="changePageSize"
              >
                <option v-for="size in pageSizeOptions" :key="size" :value="size">
                  {{ size }}
                </option>
              </select>
              <span class="text-sm text-gray-600 dark:text-gray-400">条</span>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <button
              class="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
              :disabled="currentPage === 1"
              @click="changePage(currentPage - 1)"
            >
              <i class="fas fa-chevron-left" />
            </button>
            <span class="text-sm text-gray-600 dark:text-gray-400">
              {{ currentPage }} / {{ totalPages }}
            </span>
            <button
              class="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
              :disabled="currentPage >= totalPages"
              @click="changePage(currentPage + 1)"
            >
              <i class="fas fa-chevron-right" />
            </button>
          </div>
        </div>
      </div>

      <!-- Redemptions Table -->
      <div v-else-if="activeTab === 'redemptions'" class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead class="bg-gray-50 dark:bg-gray-700/50">
            <tr>
              <th
                class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300"
              >
                卡号
              </th>
              <th
                class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300"
              >
                用户
              </th>
              <th
                class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300"
              >
                API Key
              </th>
              <th
                class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300"
              >
                增加额度
              </th>
              <th
                class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300"
              >
                状态
              </th>
              <th
                class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300"
              >
                核销时间
              </th>
              <th
                class="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300"
              >
                操作
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
            <tr
              v-for="redemption in redemptions"
              :key="redemption.id"
              class="hover:bg-gray-50 dark:hover:bg-gray-700/50"
            >
              <td class="whitespace-nowrap px-4 py-3">
                <code
                  class="cursor-pointer rounded bg-gray-100 px-2 py-1 font-mono text-xs hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600"
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
                    'inline-flex rounded-full px-2 py-1 text-xs font-medium',
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
          </tbody>
        </table>
      </div>
    </div>

    <!-- Create Card Modal -->
    <Teleport to="body">
      <div
        v-if="showCreateModal"
        class="modal fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        <div class="modal-content mx-auto w-full max-w-lg p-6">
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
              <select
                v-model="newCard.type"
                class="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              >
                <option value="quota">额度卡</option>
                <option value="time">时间卡</option>
                <option value="combo">组合卡</option>
              </select>
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
                <select
                  v-model="newCard.timeUnit"
                  class="block rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                >
                  <option value="hours">小时</option>
                  <option value="days">天</option>
                  <option value="months">月</option>
                </select>
              </div>
            </div>

            <div>
              <label class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
                >批量生成数量</label
              >
              <input
                v-model.number="newCard.count"
                class="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                max="100"
                min="1"
                type="number"
              />
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
    </Teleport>

    <!-- Result Modal -->
    <Teleport to="body">
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
                <span class="text-xs text-gray-400">{{ index + 1 }}.</span>
                <code class="font-mono text-sm text-gray-900 dark:text-white">{{ card.code }}</code>
              </div>
              <span class="text-xs text-gray-500 dark:text-gray-400">
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
    </Teleport>
    <!-- Revoke Modal -->
    <Teleport to="body">
      <div
        v-if="showRevokeModal"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
        @click.self="showRevokeModal = false"
      >
        <div class="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-gray-800">
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
    </Teleport>

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
import { ref, computed, onMounted } from 'vue'
import ConfirmModal from '@/components/common/ConfirmModal.vue'

import * as httpApis from '@/utils/http_apis'
import { showToast, copyText, formatDate } from '@/utils/tools'

const loading = ref(false)
const creating = ref(false)
const showCreateModal = ref(false)
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

// 分页相关
const currentPage = ref(1)
const pageSize = ref(20)
const pageSizeOptions = [10, 20, 50, 100]
const totalCards = ref(0)

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
  note: ''
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

const loadCards = async () => {
  loading.value = true
  const offset = (currentPage.value - 1) * pageSize.value
  const [cardsData, statsData, redemptionsData] = await Promise.all([
    httpApis.getQuotaCardsWithParamsApi({ limit: pageSize.value, offset }),
    httpApis.getQuotaCardsStatsApi(),
    httpApis.getRedemptionsApi()
  ])

  // 单独获取 limits 配置，兼容老后端
  const limitsData = await httpApis.getQuotaCardLimitsApi().catch(() => ({ data: null }))

  cards.value = cardsData.data?.cards || []
  totalCards.value = cardsData.data?.total || 0
  stats.value = statsData.data || stats.value
  redemptions.value = redemptionsData.data?.redemptions || []
  if (limitsData.data) {
    limitsConfig.value = limitsData.data
  }
  loading.value = false
}

const saveLimitsConfig = async () => {
  const result = await httpApis.updateQuotaCardLimitsApi(limitsConfig.value)
  if (result.success) {
    showToast('配置已保存', 'success')
  }
}

// 分页计算
const totalPages = computed(() => Math.ceil(totalCards.value / pageSize.value))

// 页码变化
const changePage = (page) => {
  currentPage.value = page
  selectedCards.value = []
  loadCards()
}

// 每页条数变化
const changePageSize = () => {
  currentPage.value = 1
  selectedCards.value = []
  loadCards()
}

const createCard = async () => {
  creating.value = true
  const result = await httpApis.createQuotaCardApi(newCard.value)
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
    loadCards()
  } else {
    showToast(result.message || '创建卡片失败', 'error')
  }
  creating.value = false
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

const deleteCard = async (card) => {
  const confirmed = await showConfirm(
    '删除卡片',
    `确定删除卡片 ${card.code}？`,
    '确定删除',
    '取消',
    'danger'
  )
  if (!confirmed) return

  await httpApis.deleteQuotaCardApi(card.id)
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

  await Promise.all(selectedCards.value.map((id) => httpApis.deleteQuotaCardApi(id)))
  showToast(`已删除 ${selectedCards.value.length} 张卡片`, 'success')
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
  await httpApis.revokeRedemptionApi(revokingRedemption.value.id, { reason: revokeReason.value })
  showToast('核销已撤销', 'success')
  showRevokeModal.value = false
  revokingRedemption.value = null
  loadCards()
}

onMounted(() => {
  loadCards()
})
</script>
