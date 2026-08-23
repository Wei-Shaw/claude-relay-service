<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <!-- 页面标题与主 Tab「支付管理」重复，已移除 -->
    <!-- Tab 切换 + 全局配置入口 -->
    <div
      class="mb-4 flex flex-wrap items-center gap-1 border-b border-gray-200 dark:border-gray-700"
    >
      <button
        v-for="tab in tabs"
        :key="tab.key"
        :class="[
          '-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors',
          activeTab === tab.key
            ? 'border-blue-500 text-blue-600 dark:text-blue-400'
            : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
        ]"
        @click="switchTab(tab.key)"
      >
        <i :class="['fas', tab.icon, 'mr-1']" />{{ tab.name }}
      </button>
      <button
        class="-mb-px ml-auto px-4 py-2 text-sm font-medium text-gray-500 transition-colors hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400"
        @click="openConfigModal"
      >
        <i class="fas fa-cog mr-1" />全局配置
      </button>
    </div>

    <!-- 全局配置弹窗 -->
    <ModalTransition>
      <div v-if="configModal" class="modal fixed inset-0 z-50 flex items-center justify-center p-4">
        <div class="modal-content mx-auto max-h-[90vh] w-full max-w-2xl overflow-y-auto p-6">
          <div class="mb-4 flex items-center justify-between">
            <h3 class="text-lg font-bold text-gray-900 dark:text-gray-100">全局配置</h3>
            <button
              class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              @click="configModal = false"
            >
              <i class="fas fa-times text-xl" />
            </button>
          </div>

          <!-- 加载中 -->
          <div v-if="configLoading" class="py-12 text-center text-gray-500 dark:text-gray-400">
            <i class="fas fa-spinner fa-spin mr-2" />加载配置中...
          </div>

          <!-- 加载失败：禁止编辑/保存，提供重试，避免用默认值覆盖生产配置 -->
          <div v-else-if="configLoadFailed" class="py-12 text-center">
            <i class="fas fa-triangle-exclamation mb-3 text-4xl text-amber-500" />
            <p class="mb-4 text-sm text-gray-600 dark:text-gray-300">
              配置加载失败，为避免覆盖现有配置，已禁止保存。
            </p>
            <button :class="BTN_PRIMARY" @click="loadConfig">
              <i class="fas fa-rotate-right mr-1" />重新加载
            </button>
          </div>

          <div v-else class="space-y-4">
            <div class="flex items-center justify-between">
              <span class="text-sm font-medium text-gray-700 dark:text-gray-300">启用支付功能</span>
              <label class="relative inline-flex cursor-pointer items-center">
                <input v-model="config.enabled" class="peer sr-only" type="checkbox" />
                <div :class="TOGGLE" />
              </label>
            </div>
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label :class="LABEL">订单超时（分钟）</label>
                <input
                  v-model.number="config.orderTimeoutMinutes"
                  :class="INPUT"
                  min="1"
                  type="number"
                />
              </div>
              <div>
                <label :class="LABEL">每用户最大待支付数</label>
                <input
                  v-model.number="config.maxPendingOrders"
                  :class="INPUT"
                  min="1"
                  type="number"
                />
              </div>
              <div>
                <label :class="LABEL">每日充值金额上限（元，0=不限）</label>
                <input v-model.number="config.dailyLimit" :class="INPUT" min="0" type="number" />
              </div>
              <div>
                <label :class="LABEL">手续费率</label>
                <input
                  v-model.number="config.feeRate"
                  :class="INPUT"
                  min="0"
                  step="0.01"
                  type="number"
                />
              </div>
              <div>
                <label :class="LABEL">负载均衡策略</label>
                <CustomDropdown
                  v-model="config.lbStrategy"
                  accent="blue"
                  icon="fa-balance-scale"
                  :options="lbStrategyOptions"
                  placeholder="选择策略"
                />
              </div>
              <div>
                <label :class="LABEL">自定义金额倍率（额度→人民币）</label>
                <input
                  v-model.number="config.customRatio"
                  :class="INPUT"
                  min="0"
                  step="0.01"
                  type="number"
                />
              </div>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-sm font-medium text-gray-700 dark:text-gray-300"
                >允许自定义金额</span
              >
              <label class="relative inline-flex cursor-pointer items-center">
                <input v-model="config.allowCustomAmount" class="peer sr-only" type="checkbox" />
                <div :class="TOGGLE" />
              </label>
            </div>
            <div>
              <label :class="LABEL">启用的支付方式</label>
              <div class="flex flex-wrap gap-3">
                <label
                  v-for="t in ALL_PAYMENT_TYPES"
                  :key="t"
                  class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300"
                >
                  <input
                    v-model="config.enabledPaymentTypes"
                    :class="CHECKBOX"
                    type="checkbox"
                    :value="t"
                  />
                  {{ paymentTypeLabel(t) }}
                </label>
              </div>
            </div>
          </div>
          <div class="mt-6 flex gap-3">
            <button :class="[BTN_SECONDARY, 'flex-1']" @click="configModal = false">
              {{ configLoadFailed ? '关闭' : '取消' }}
            </button>
            <button
              v-if="!configLoading && !configLoadFailed"
              :class="[BTN_PRIMARY, 'flex-1']"
              :disabled="savingConfig"
              @click="saveConfig"
            >
              <i v-if="savingConfig" class="fas fa-spinner fa-spin mr-2" />保存配置
            </button>
          </div>
        </div>
      </div>
    </ModalTransition>

    <!-- ② 充值商品 -->
    <div v-show="activeTab === 'plans'" class="space-y-3">
      <div class="flex justify-end">
        <button :class="BTN_PRIMARY" @click="openPlanModal()">
          <i class="fas fa-plus mr-1" />新建商品
        </button>
      </div>
      <div class="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
        <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead class="bg-gray-100 dark:bg-gray-700">
            <tr>
              <th :class="TH">名称</th>
              <th :class="TH">额度</th>
              <th :class="TH">价格</th>
              <th :class="TH">排序</th>
              <th :class="TH">状态</th>
              <th :class="[TH, 'text-right']">操作</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
            <tr v-if="!plans.length">
              <td :class="TD_EMPTY" colspan="6">暂无商品</td>
            </tr>
            <tr v-for="p in plans" :key="p.id" class="hover:bg-gray-50 dark:hover:bg-gray-700/50">
              <td :class="TD">{{ p.name }}</td>
              <td :class="[TD, 'text-green-600 dark:text-green-400']">${{ p.quotaAmount }}</td>
              <td :class="TD">{{ p.price }} {{ p.currency }}</td>
              <td :class="TD">{{ p.sortOrder }}</td>
              <td :class="TD">
                <span
                  :class="[
                    'inline-flex rounded-full px-2 py-0.5 text-sm',
                    p.enabled ? BADGE_ON : BADGE_OFF
                  ]"
                >
                  {{ p.enabled ? '上架' : '下架' }}
                </span>
              </td>
              <td :class="[TD, 'text-right']">
                <button :class="LINK" @click="openPlanModal(p)">编辑</button>
                <button :class="[LINK, 'text-red-500']" @click="confirmDelete('plan', p)">
                  删除
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- ③ 支付渠道 -->
    <div v-show="activeTab === 'providers'" class="space-y-3">
      <div class="flex justify-end">
        <button :class="BTN_PRIMARY" @click="openProviderModal()">
          <i class="fas fa-plus mr-1" />新建渠道
        </button>
      </div>
      <div class="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
        <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead class="bg-gray-100 dark:bg-gray-700">
            <tr>
              <th :class="TH">名称</th>
              <th :class="TH">渠道</th>
              <th :class="TH">支付方式</th>
              <th :class="TH">状态</th>
              <th :class="[TH, 'text-right']">操作</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
            <tr v-if="!providers.length">
              <td :class="TD_EMPTY" colspan="5">暂无渠道</td>
            </tr>
            <tr
              v-for="p in providers"
              :key="p.id"
              class="hover:bg-gray-50 dark:hover:bg-gray-700/50"
            >
              <td :class="TD">{{ p.name }}</td>
              <td :class="TD">{{ providerLabel(p.providerKey) }}</td>
              <td :class="TD">
                <span
                  v-for="t in p.supportedTypes"
                  :key="t"
                  class="mr-1 inline-flex rounded bg-blue-100 px-1.5 py-0.5 text-sm text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                  >{{ paymentTypeLabel(t) }}</span
                >
              </td>
              <td :class="TD">
                <span
                  :class="[
                    'inline-flex rounded-full px-2 py-0.5 text-sm',
                    p.enabled ? BADGE_ON : BADGE_OFF
                  ]"
                >
                  {{ p.enabled ? '启用' : '停用' }}
                </span>
              </td>
              <td :class="[TD, 'text-right']">
                <button :class="LINK" @click="openProviderModal(p)">编辑</button>
                <button :class="[LINK, 'text-red-500']" @click="confirmDelete('provider', p)">
                  删除
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- ④ 订单 -->
    <div v-show="activeTab === 'orders'" class="space-y-3">
      <div class="flex items-center gap-2">
        <div class="w-40">
          <CustomDropdown
            v-model="orderStatus"
            accent="blue"
            icon="fa-filter"
            :options="orderStatusOptions"
            placeholder="全部状态"
            size="sm"
            @change="reloadOrders"
          />
        </div>
        <button :class="BTN_SECONDARY" @click="reloadOrders">
          <i class="fas fa-sync mr-1" />刷新
        </button>
      </div>
      <div class="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
        <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead class="bg-gray-100 dark:bg-gray-700">
            <tr>
              <th :class="TH">订单号</th>
              <th :class="TH">Key</th>
              <th :class="TH">应付</th>
              <th :class="TH">额度</th>
              <th :class="TH">方式</th>
              <th :class="TH">状态</th>
              <th :class="TH">时间</th>
              <th :class="[TH, 'text-right']">操作</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
            <tr v-if="!orders.length">
              <td :class="TD_EMPTY" colspan="8">暂无订单</td>
            </tr>
            <tr v-for="o in orders" :key="o.id" class="hover:bg-gray-50 dark:hover:bg-gray-700/50">
              <td :class="[TD, 'font-mono']">{{ o.outTradeNo }}</td>
              <td :class="TD">{{ o.apiKeyName || o.apiKeyId }}</td>
              <td :class="TD">{{ o.payAmount }}</td>
              <td :class="[TD, 'text-green-600 dark:text-green-400']">${{ o.quotaAmount }}</td>
              <td :class="TD">{{ paymentTypeLabel(o.paymentType) }}</td>
              <td :class="TD">
                <span
                  :class="[
                    'inline-flex rounded-full px-2 py-0.5 text-sm',
                    orderStatusClass(o.status)
                  ]"
                >
                  {{ orderStatusLabel(o.status) }}
                </span>
              </td>
              <td :class="[TD, 'text-gray-400']">{{ formatDateTime(o.createdAt) }}</td>
              <td :class="[TD, 'text-right']">
                <button :class="LINK" @click="openAudit(o.id)">审计</button>
                <button
                  v-if="canVerifyOrder(o.status)"
                  :class="[LINK, 'text-blue-600']"
                  @click="doVerify(o)"
                >
                  查单补单
                </button>
                <button
                  v-if="canManualComplete(o.status)"
                  :class="[LINK, 'text-purple-600']"
                  @click="openManualComplete(o)"
                >
                  手工入账
                </button>
                <button
                  v-if="o.status === 'completed' && canRefundProvider(o.providerKey)"
                  :class="[LINK, 'text-orange-500']"
                  @click="confirmRefund(o)"
                >
                  退款
                </button>
                <span
                  v-else-if="o.status === 'completed' && !canRefundProvider(o.providerKey)"
                  class="ml-3 text-sm text-gray-400 dark:text-gray-500"
                  title="该渠道无在线退款能力，请线下退款"
                >
                  仅线下退
                </span>
                <template
                  v-if="
                    o.status === 'refunding' && (o.channelRefundAttemptAt || o.channelRefundedAt)
                  "
                >
                  <button :class="[LINK, 'text-green-600']" @click="confirmResolve(o, 'refunded')">
                    判已退
                  </button>
                  <button
                    v-if="!o.channelRefundedAt"
                    :class="[LINK, 'text-orange-500']"
                    @click="confirmResolve(o, 'not_refunded')"
                  >
                    判未退
                  </button>
                </template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="flex items-center justify-end gap-2 text-sm text-gray-500">
        <button :class="BTN_SECONDARY" :disabled="orderOffset === 0" @click="changePage(-1)">
          上一页
        </button>
        <span>{{ orderOffset + 1 }} - {{ orderOffset + orders.length }} / {{ orderTotal }}</span>
        <button
          :class="BTN_SECONDARY"
          :disabled="orderOffset + orders.length >= orderTotal"
          @click="changePage(1)"
        >
          下一页
        </button>
      </div>
    </div>

    <!-- ⑤ 看板 -->
    <div v-show="activeTab === 'dashboard'" class="space-y-4">
      <div class="flex items-center justify-end">
        <button :class="BTN_SECONDARY" :disabled="dashboardLoading" @click="loadDashboard">
          <i :class="['fas fa-rotate-right mr-1', dashboardLoading && 'fa-spin']" />刷新
        </button>
      </div>
      <div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div :class="STAT_CARD">
          <p :class="STAT_LABEL">今日金额</p>
          <p :class="STAT_VALUE">{{ dashboard.todayAmount }}</p>
        </div>
        <div :class="STAT_CARD">
          <p :class="STAT_LABEL">累计金额</p>
          <p :class="STAT_VALUE">{{ dashboard.totalAmount }}</p>
        </div>
        <div :class="STAT_CARD">
          <p :class="STAT_LABEL">今日笔数</p>
          <p :class="STAT_VALUE">{{ dashboard.todayCount }}</p>
        </div>
        <div :class="STAT_CARD">
          <p :class="STAT_LABEL">累计笔数</p>
          <p :class="STAT_VALUE">{{ dashboard.totalCount }}</p>
        </div>
      </div>
      <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div class="rounded-xl border border-gray-200 p-4 dark:border-gray-700">
          <p class="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-200">渠道分布</p>
          <div
            v-for="(amt, ch) in dashboard.byChannel"
            :key="ch"
            class="flex justify-between py-1 text-sm"
          >
            <span class="text-gray-600 dark:text-gray-300">{{ providerLabel(ch) }}</span>
            <span class="font-medium text-gray-800 dark:text-gray-100">{{ amt }}</span>
          </div>
          <p
            v-if="!dashboard.byChannel || !Object.keys(dashboard.byChannel).length"
            class="text-sm text-gray-400"
          >
            暂无数据
          </p>
        </div>
        <div class="rounded-xl border border-gray-200 p-4 dark:border-gray-700">
          <p class="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-200">
            充值 Top API Key
          </p>
          <div
            v-for="u in dashboard.topKeys"
            :key="u.apiKeyId"
            class="flex justify-between py-1 text-sm"
          >
            <span class="font-mono text-gray-600 dark:text-gray-300">{{ u.apiKeyName }}</span>
            <span class="font-medium text-gray-800 dark:text-gray-100">{{ u.amount }}</span>
          </div>
          <p v-if="!dashboard.topKeys || !dashboard.topKeys.length" class="text-sm text-gray-400">
            暂无数据
          </p>
        </div>
      </div>
    </div>

    <!-- 商品弹窗 -->
    <ModalTransition>
      <div v-if="planModal" class="modal fixed inset-0 z-50 flex items-center justify-center p-4">
        <div class="modal-content mx-auto max-h-[90vh] w-full max-w-md overflow-y-auto p-6">
          <h3 class="mb-4 text-lg font-bold text-gray-900 dark:text-gray-100">
            {{ planForm.id ? '编辑商品' : '新建商品' }}
          </h3>
          <div class="space-y-3">
            <div>
              <label :class="LABEL">名称</label
              ><input v-model="planForm.name" :class="INPUT" type="text" />
            </div>
            <div>
              <label :class="LABEL">额度（$）</label>
              <input v-model.number="planForm.quotaAmount" :class="INPUT" min="0" type="number" />
            </div>
            <div>
              <label :class="LABEL">价格</label>
              <input
                v-model.number="planForm.price"
                :class="INPUT"
                min="0"
                step="0.01"
                type="number"
              />
            </div>
            <div>
              <label :class="LABEL">货币</label
              ><input v-model="planForm.currency" :class="INPUT" type="text" />
            </div>
            <div>
              <label :class="LABEL">排序</label>
              <input v-model.number="planForm.sortOrder" :class="INPUT" type="number" />
            </div>
            <div>
              <label :class="LABEL">描述</label>
              <input v-model="planForm.description" :class="INPUT" type="text" />
            </div>
            <label class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
              <input v-model="planForm.enabled" :class="CHECKBOX" type="checkbox" />上架
            </label>
          </div>
          <div class="mt-6 flex gap-3">
            <button :class="[BTN_SECONDARY, 'flex-1']" @click="planModal = false">取消</button>
            <button :class="[BTN_PRIMARY, 'flex-1']" @click="savePlan">保存</button>
          </div>
        </div>
      </div>
    </ModalTransition>

    <!-- 渠道弹窗 -->
    <ModalTransition>
      <div
        v-if="providerModal"
        class="modal fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        <div class="modal-content mx-auto max-h-[90vh] w-full max-w-lg overflow-y-auto p-6">
          <h3 class="mb-4 text-lg font-bold text-gray-900 dark:text-gray-100">
            {{ providerForm.id ? '编辑渠道' : '新建渠道' }}
          </h3>
          <div class="space-y-3">
            <div>
              <label :class="LABEL">渠道类型</label>
              <CustomDropdown
                v-model="providerForm.providerKey"
                accent="blue"
                :disabled="!!providerForm.id"
                icon="fa-plug"
                :options="providerKeyOptions"
                placeholder="选择渠道类型"
              />
            </div>
            <div>
              <label :class="LABEL">实例名称</label>
              <input v-model="providerForm.name" :class="INPUT" type="text" />
            </div>
            <div>
              <div class="mb-1 flex items-center justify-between">
                <label class="text-sm font-medium text-gray-700 dark:text-gray-300"
                  >配置 {{ providerForm.id ? '（留空则不修改）' : '' }}</label
                >
                <div
                  class="inline-flex overflow-hidden rounded-lg border border-gray-300 dark:border-gray-600"
                >
                  <button
                    :class="[
                      'px-3 py-1 text-sm transition-colors',
                      configMode === 'fields'
                        ? 'bg-blue-500 text-white'
                        : 'bg-white text-gray-600 hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
                    ]"
                    type="button"
                    @click="switchConfigMode('fields')"
                  >
                    字段
                  </button>
                  <button
                    :class="[
                      'px-3 py-1 text-sm transition-colors',
                      configMode === 'json'
                        ? 'bg-blue-500 text-white'
                        : 'bg-white text-gray-600 hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
                    ]"
                    type="button"
                    @click="switchConfigMode('json')"
                  >
                    JSON
                  </button>
                </div>
              </div>
              <div v-if="configMode === 'fields'" class="space-y-2">
                <div v-for="f in configFields" :key="f.key">
                  <label class="mb-0.5 block text-sm text-gray-500 dark:text-gray-400">{{
                    f.label
                  }}</label>
                  <textarea
                    v-if="f.type === 'textarea'"
                    v-model="configForm[f.key]"
                    :class="[INPUT, 'font-mono']"
                    rows="3"
                  />
                  <input
                    v-else
                    v-model="configForm[f.key]"
                    autocomplete="off"
                    :class="INPUT"
                    :type="f.type === 'password' ? 'password' : 'text'"
                  />
                </div>
                <p v-if="!configFields.length" class="text-sm text-gray-400">
                  该渠道类型暂无字段模板，请切换到 JSON 模式
                </p>
              </div>
              <textarea
                v-else
                v-model="providerForm.configText"
                :class="[INPUT, 'font-mono']"
                :placeholder="configHint(providerForm.providerKey)"
                rows="6"
              />
            </div>
            <div>
              <label :class="LABEL">支持的支付方式</label>
              <div class="flex flex-wrap gap-3">
                <label
                  v-for="t in SUPPORTED_TYPES"
                  :key="t"
                  class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300"
                >
                  <input
                    v-model="providerForm.supportedTypes"
                    :class="CHECKBOX"
                    type="checkbox"
                    :value="t"
                  />{{ paymentTypeLabel(t) }}
                </label>
              </div>
            </div>
            <div class="grid grid-cols-3 gap-2">
              <div>
                <label :class="LABEL">排序</label>
                <input v-model.number="providerForm.sortOrder" :class="INPUT" type="number" />
              </div>
              <div>
                <label :class="LABEL">单笔下限</label>
                <input v-model.number="providerForm.singleMin" :class="INPUT" type="number" />
              </div>
              <div>
                <label :class="LABEL">单笔上限</label>
                <input v-model.number="providerForm.singleMax" :class="INPUT" type="number" />
              </div>
            </div>
            <div class="flex gap-6">
              <label class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                <input v-model="providerForm.enabled" :class="CHECKBOX" type="checkbox" />启用
              </label>
              <label class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                <input
                  v-model="providerForm.refundEnabled"
                  :class="CHECKBOX"
                  :disabled="!refundSupported"
                  type="checkbox"
                />支持退款
                <span v-if="!refundSupported" class="text-sm text-gray-400 dark:text-gray-500"
                  >（该渠道未实现退款）</span
                >
              </label>
            </div>
          </div>
          <div class="mt-6 flex gap-3">
            <button :class="[BTN_SECONDARY, 'flex-1']" @click="providerModal = false">取消</button>
            <button
              :class="[BTN_PRIMARY, 'flex-1']"
              :disabled="loadingProviderDetail"
              @click="saveProvider"
            >
              保存
            </button>
          </div>
        </div>
      </div>
    </ModalTransition>

    <!-- 审计弹窗 -->
    <ModalTransition>
      <div v-if="auditModal" class="modal fixed inset-0 z-50 flex items-center justify-center p-4">
        <div class="modal-content mx-auto max-h-[90vh] w-full max-w-lg overflow-y-auto p-6">
          <div class="mb-4 flex items-center justify-between">
            <h3 class="text-lg font-bold text-gray-900 dark:text-gray-100">订单审计</h3>
            <button class="text-gray-400 hover:text-gray-600" @click="auditModal = false">
              <i class="fas fa-times text-xl" />
            </button>
          </div>
          <div v-if="!auditLogs.length" class="py-6 text-center text-sm text-gray-400">
            暂无审计记录
          </div>
          <ul v-else class="space-y-2">
            <li
              v-for="(log, i) in auditLogs"
              :key="i"
              class="rounded-lg border border-gray-200 p-3 text-sm dark:border-gray-700"
            >
              <div class="flex justify-between">
                <span class="font-semibold text-gray-700 dark:text-gray-200">{{ log.action }}</span>
                <span class="text-gray-400">{{ formatDateTime(log.at) }}</span>
              </div>
              <p class="mt-1 text-gray-500 dark:text-gray-400">操作者: {{ log.operator }}</p>
              <pre
                v-if="log.detail"
                class="mt-1 overflow-x-auto text-sm text-gray-500 dark:text-gray-400"
                >{{ JSON.stringify(log.detail) }}</pre
              >
            </li>
          </ul>
        </div>
      </div>
    </ModalTransition>

    <!-- 手工入账弹窗 -->
    <ModalTransition>
      <div
        v-if="manualModal.show"
        class="modal fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        <div class="modal-content mx-auto w-full max-w-md p-6">
          <h3 class="mb-2 text-lg font-bold text-gray-900 dark:text-gray-100">手工入账</h3>
          <p class="mb-4 text-sm text-gray-500 dark:text-gray-400">
            订单 {{ manualModal.outTradeNo }} · 仅在渠道侧已确认收款且
            webhook/查单不可用时使用。必须填写核对原因。
          </p>
          <label :class="LABEL">补单原因（必填）</label>
          <textarea
            v-model="manualModal.reason"
            :class="[INPUT, 'min-h-[80px]']"
            placeholder="渠道流水号 / 核对截图说明 / 客服工单号"
          />
          <label :class="[LABEL, 'mt-3']">渠道交易号（可选）</label>
          <input v-model="manualModal.tradeNo" :class="INPUT" placeholder="trade_no" type="text" />
          <div class="mt-6 flex gap-3">
            <button :class="[BTN_SECONDARY, 'flex-1']" @click="manualModal.show = false">
              取消
            </button>
            <button
              :class="[BTN_PRIMARY, 'flex-1']"
              :disabled="manualModal.saving"
              @click="submitManualComplete"
            >
              确认入账
            </button>
          </div>
        </div>
      </div>
    </ModalTransition>

    <!-- 通用确认 -->
    <ModalTransition>
      <div
        v-if="confirmState.show"
        class="modal fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        <div class="modal-content mx-auto w-full max-w-sm p-6">
          <p class="text-base text-gray-700 dark:text-gray-200">{{ confirmState.message }}</p>
          <div class="mt-6 flex gap-3">
            <button :class="[BTN_SECONDARY, 'flex-1']" @click="confirmState.show = false">
              取消
            </button>
            <button :class="[BTN_PRIMARY, 'flex-1']" @click="runConfirm">确定</button>
          </div>
        </div>
      </div>
    </ModalTransition>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue'

import ModalTransition from '@/components/common/ModalTransition.vue'
import { showToast, formatDateTime } from '@/utils/tools'
import {
  getPaymentConfigApi,
  updatePaymentConfigApi,
  getPaymentPlansAdminApi,
  createPaymentPlanApi,
  updatePaymentPlanApi,
  deletePaymentPlanApi,
  getPaymentProvidersApi,
  getPaymentProviderApi,
  createPaymentProviderApi,
  updatePaymentProviderApi,
  deletePaymentProviderApi,
  getPaymentOrdersAdminApi,
  verifyPaymentOrderAdminApi,
  manualCompletePaymentOrderApi,
  refundPaymentOrderApi,
  resolvePaymentRefundApi,
  getPaymentDashboardApi,
  getPaymentOrderAuditApi
} from '@/utils/http_apis'

// 复用的 Tailwind class 串（对齐 QuotaCardsView 风格，纯 Tailwind 玻璃态）
const TH =
  'px-4 py-3 text-left text-sm font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300'
const TD = 'whitespace-nowrap px-4 py-3 text-sm text-gray-700 dark:text-gray-200'
const TD_EMPTY = 'px-4 py-8 text-center text-sm text-gray-400'
const INPUT =
  'block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700 dark:text-white'
const LABEL = 'mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300'
const CHECKBOX =
  'h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700'
const TOGGLE =
  "peer h-5 w-9 rounded-full bg-gray-300 after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:bg-blue-600 peer-checked:after:translate-x-full dark:bg-gray-600"
const BTN_PRIMARY =
  'rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 px-4 py-2.5 font-medium text-white shadow-sm transition-colors hover:from-blue-600 hover:to-blue-700 disabled:opacity-50'
const BTN_SECONDARY =
  'rounded-xl bg-gray-100 px-4 py-2.5 font-medium text-gray-700 transition-colors hover:bg-gray-200 disabled:opacity-50 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'
const LINK = 'ml-3 text-sm text-blue-500 hover:text-blue-600'
const BADGE_ON = 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
const BADGE_OFF = 'bg-gray-100 text-gray-500 dark:bg-gray-700'
const STAT_CARD =
  'rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800'
const STAT_LABEL = 'text-sm text-gray-500 dark:text-gray-400'
const STAT_VALUE = 'mt-1 text-xl font-bold text-gray-800 dark:text-gray-100'

const tabs = [
  { key: 'dashboard', name: '数据看板', icon: 'fa-chart-pie' },
  { key: 'plans', name: '充值商品', icon: 'fa-box' },
  { key: 'providers', name: '支付渠道', icon: 'fa-plug' },
  { key: 'orders', name: '订单管理', icon: 'fa-list' }
]
const ALL_PAYMENT_TYPES = ['alipay', 'wxpay', 'stripe', 'mock']
const PROVIDER_KEYS = ['epay', 'xunhupay', 'stripe', 'alipay', 'wxpay']
const SUPPORTED_TYPES = ['alipay', 'wxpay', 'stripe', 'card']
const lbStrategyOptions = [
  { value: 'least_amount', label: '最少金额' },
  { value: 'round_robin', label: '轮询' }
]
const orderStatusOptions = [
  { value: '', label: '全部状态' },
  { value: 'pending', label: '待支付' },
  { value: 'completed', label: '已完成' },
  { value: 'refunded', label: '已退款' },
  { value: 'expired', label: '已过期' }
]
// 各渠道配置字段表（字段模式按此渲染表单；JSON 模式占位提示也由它派生，单一事实源）
// type 省略=普通文本，'password'=密钥框，'textarea'=多行（私钥/公钥）
const CONFIG_FIELDS = {
  epay: [
    { key: 'apiUrl', label: 'API 地址' },
    { key: 'pid', label: '商户 PID' },
    { key: 'key', label: '商户密钥', type: 'password' },
    { key: 'notifyUrl', label: '异步通知地址' },
    { key: 'returnUrl', label: '同步跳转地址' }
  ],
  xunhupay: [
    { key: 'appid', label: 'AppID' },
    { key: 'appSecret', label: 'AppSecret', type: 'password' },
    { key: 'gateway', label: '支付网关' },
    { key: 'notifyUrl', label: '异步通知地址' },
    { key: 'returnUrl', label: '同步跳转地址' },
    { key: 'callbackUrl', label: '回调地址' }
  ],
  stripe: [
    { key: 'secretKey', label: 'Secret Key', type: 'password' },
    { key: 'webhookSecret', label: 'Webhook Secret', type: 'password' },
    { key: 'successUrl', label: '成功跳转地址' },
    { key: 'cancelUrl', label: '取消跳转地址' }
  ],
  alipay: [
    { key: 'appId', label: '应用 ID' },
    { key: 'privateKey', label: '商户私钥', type: 'textarea' },
    { key: 'alipayPublicKey', label: '支付宝公钥', type: 'textarea' },
    { key: 'notifyUrl', label: '异步通知地址' }
  ],
  wxpay: [
    { key: 'appId', label: '应用 ID' },
    { key: 'mchId', label: '商户号' },
    { key: 'serialNo', label: '证书序列号' },
    { key: 'privateKey', label: '商户私钥', type: 'textarea' },
    { key: 'apiV3Key', label: 'APIv3 密钥', type: 'password' },
    { key: 'notifyUrl', label: '异步通知地址' }
  ]
}
const TYPE_LABELS = {
  alipay: '支付宝',
  wxpay: '微信支付',
  stripe: 'Stripe/卡',
  card: '银行卡',
  mock: '测试通道'
}
const paymentTypeLabel = (t) => TYPE_LABELS[t] || t
// 渠道类型（providerKey）中文名
const PROVIDER_LABELS = {
  epay: '易支付',
  xunhupay: '虎皮椒',
  stripe: 'Stripe',
  alipay: '支付宝官方',
  wxpay: '微信支付官方'
}
const providerLabel = (k) => PROVIDER_LABELS[k] || k
const providerKeyOptions = PROVIDER_KEYS.map((k) => ({
  value: k,
  label: PROVIDER_LABELS[k] || k
}))
// JSON 模式占位：由字段表派生空对象，避免与字段表脱节
const configHint = (k) => {
  const fields = CONFIG_FIELDS[k]
  if (!fields) return '{}'
  return JSON.stringify(Object.fromEntries(fields.map((f) => [f.key, ''])))
}

const activeTab = ref('dashboard')
const loaded = reactive({})
const switchTab = (key) => {
  activeTab.value = key
  // 数据看板用自身 loaded 状态：首次或上次失败（未成功加载）时都重试，不受通用 loaded 门控卡死
  if (key === 'dashboard') {
    if (!dashboardLoaded.value && !dashboardLoading.value) loadDashboard()
    return
  }
  if (loaded[key]) return
  loaded[key] = true
  if (key === 'plans') loadPlans()
  else if (key === 'providers') loadProviders()
  else if (key === 'orders') loadOrders()
}

// 全局配置改为 dialog 弹出（不再占用 tab）
const configModal = ref(false)
// 配置加载状态：loading 期间与失败后禁止保存，防止用本地默认值覆盖生产配置
const configLoading = ref(false)
const configLoadFailed = ref(false)
const openConfigModal = async () => {
  configModal.value = true
  await loadConfig()
}

// ========== 配置 ==========
const config = ref({
  enabled: false,
  orderTimeoutMinutes: 30,
  maxPendingOrders: 3,
  dailyLimit: 0,
  allowCustomAmount: false,
  customRatio: 0,
  feeRate: 0,
  lbStrategy: 'least_amount',
  enabledPaymentTypes: []
})
const savingConfig = ref(false)
const loadConfig = async () => {
  configLoading.value = true
  configLoadFailed.value = false
  const res = await getPaymentConfigApi()
  configLoading.value = false
  if (res.success && res.data) {
    config.value = { ...config.value, ...res.data }
  } else {
    // 加载失败：标记失败态，禁止保存，避免用本地默认值覆盖生产配置
    configLoadFailed.value = true
    showToast(res.message || '配置加载失败，请重试', 'error')
  }
}
const saveConfig = async () => {
  // 配置未成功加载时禁止保存（否则会把生产配置覆盖成本地默认值）
  if (configLoading.value || configLoadFailed.value) {
    return showToast('配置尚未加载成功，无法保存', 'error')
  }
  savingConfig.value = true
  const res = await updatePaymentConfigApi(config.value)
  savingConfig.value = false
  showToast(
    res.success ? '配置已保存' : res.message || '保存失败',
    res.success ? 'success' : 'error'
  )
  if (res.success) configModal.value = false
}

// ========== 商品 ==========
const plans = ref([])
const planModal = ref(false)
const planForm = ref({})
const loadPlans = async () => {
  const res = await getPaymentPlansAdminApi()
  if (res.success) plans.value = res.data || []
}
const openPlanModal = (p) => {
  planForm.value = p
    ? { ...p }
    : {
        name: '',
        quotaAmount: 0,
        price: 0,
        currency: 'CNY',
        sortOrder: 0,
        description: '',
        enabled: true
      }
  planModal.value = true
}
const savePlan = async () => {
  const { id, ...data } = planForm.value
  const res = id ? await updatePaymentPlanApi(id, data) : await createPaymentPlanApi(data)
  if (!res.success) return showToast(res.message || '保存失败', 'error')
  showToast('已保存', 'success')
  planModal.value = false
  loadPlans()
}

// ========== 渠道 ==========
const providers = ref([])
const providerModal = ref(false)
const providerForm = ref({})
const loadingProviderDetail = ref(false)
// 配置输入双模式：'fields' 字段表单 / 'json' 文本框。configForm 存字段模式的值，configText 存 JSON 文本
const configMode = ref('fields')
const configForm = ref({})
const configFields = computed(() => CONFIG_FIELDS[providerForm.value.providerKey] || [])
// 已实现退款的渠道（与后端 provider.supportsRefund 逐项同步；后端配置保存/退款入口是权威硬门，
// 此处仅预禁用提示。mock 无实例、不在 PROVIDER_KEYS 下拉中，列入仅为与后端机械同步）
// 与后端 supportsRefund 对齐：epay 无标准退款 API，仅线下
const REFUND_SUPPORTED = new Set(['alipay', 'wxpay', 'stripe', 'xunhupay', 'mock'])
const canRefundProvider = (providerKey) => REFUND_SUPPORTED.has(providerKey)
// expired/cancelled 可查单/手工复活（误关单恢复）
const canVerifyOrder = (status) => ['pending', 'paid', 'expired', 'cancelled'].includes(status)
const canManualComplete = (status) => ['pending', 'paid', 'expired', 'cancelled'].includes(status)
const refundSupported = computed(() => REFUND_SUPPORTED.has(providerForm.value.providerKey))
// 切到未实现退款的渠道类型时强制关掉开关（disabled 只挡交互、挡不住已勾选残留）
watch(
  () => providerForm.value.providerKey,
  (key) => {
    if (key && !REFUND_SUPPORTED.has(key)) providerForm.value.refundEnabled = false
  }
)
const loadProviders = async () => {
  const res = await getPaymentProvidersApi()
  if (res.success) providers.value = res.data || []
}
const openProviderModal = async (p) => {
  configMode.value = 'fields'
  configForm.value = {}
  if (!p) {
    providerForm.value = {
      providerKey: 'epay',
      name: '',
      configText: '',
      supportedTypes: [],
      sortOrder: 0,
      singleMin: 0,
      singleMax: 0,
      enabled: true,
      refundEnabled: false
    }
    providerModal.value = true
    return
  }
  loadingProviderDetail.value = true
  const res = await getPaymentProviderApi(p.id)
  loadingProviderDetail.value = false
  if (!res.success || !res.data) {
    return showToast(res.message || '加载渠道配置失败', 'error')
  }
  providerForm.value = {
    ...res.data,
    configText: res.data.config ? JSON.stringify(res.data.config, null, 2) : '',
    supportedTypes: [...(res.data.supportedTypes || [])]
  }
  configForm.value = { ...(res.data.config || {}) }
  providerModal.value = true
}
// 字段 → JSON 文本（merge：保留 JSON 里字段表未列出的键，空值则删除）
const fieldsToJson = () => {
  let base = {}
  try {
    base = providerForm.value.configText ? JSON.parse(providerForm.value.configText) : {}
  } catch (e) {
    base = {}
  }
  for (const f of configFields.value) {
    const v = configForm.value[f.key]
    if (v !== undefined && v !== '') base[f.key] = v
    else delete base[f.key]
  }
  providerForm.value.configText = Object.keys(base).length ? JSON.stringify(base, null, 2) : ''
}
const switchConfigMode = (mode) => {
  if (mode === configMode.value) return
  if (mode === 'json') {
    fieldsToJson()
  } else {
    // JSON → 字段：解析失败则不切换，避免丢失用户已输入的 JSON
    let obj = {}
    try {
      obj = providerForm.value.configText ? JSON.parse(providerForm.value.configText) : {}
    } catch (e) {
      return showToast('配置 JSON 格式错误，无法切换到字段模式', 'error')
    }
    configForm.value = { ...obj }
  }
  configMode.value = mode
}
const saveProvider = async () => {
  // 字段模式先并回 JSON 文本，统一从 configText 出口
  if (configMode.value === 'fields') fieldsToJson()
  const { id, configText, ...rest } = providerForm.value
  const data = { ...rest }
  if (configText && configText.trim()) {
    try {
      data.config = JSON.parse(configText)
    } catch (e) {
      return showToast('配置 JSON 格式错误', 'error')
    }
  }
  const res = id ? await updatePaymentProviderApi(id, data) : await createPaymentProviderApi(data)
  if (!res.success) return showToast(res.message || '保存失败', 'error')
  showToast('已保存', 'success')
  providerModal.value = false
  loadProviders()
}

// ========== 订单 ==========
const orders = ref([])
const orderStatus = ref('')
const orderOffset = ref(0)
const orderTotal = ref(0)
const PAGE = 20
const loadOrders = async () => {
  const res = await getPaymentOrdersAdminApi({
    offset: orderOffset.value,
    limit: PAGE,
    status: orderStatus.value
  })
  if (res.success) {
    orders.value = res.data?.orders || res.data || []
    orderTotal.value = res.data?.total ?? orders.value.length
  }
}
const reloadOrders = () => {
  orderOffset.value = 0
  loadOrders()
}
const changePage = (dir) => {
  orderOffset.value = Math.max(0, orderOffset.value + dir * PAGE)
  loadOrders()
}
const ORDER_STATUS = {
  pending: ['待支付', 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300'],
  paid: ['已支付', 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'],
  completed: ['已完成', 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'],
  refunding: ['退款中', 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300'],
  refunded: ['已退款', 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'],
  expired: ['已过期', 'bg-gray-100 text-gray-500 dark:bg-gray-700'],
  cancelled: ['已取消', 'bg-gray-100 text-gray-500 dark:bg-gray-700'],
  failed: ['失败', 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300']
}
const orderStatusLabel = (s) => (ORDER_STATUS[s] ? ORDER_STATUS[s][0] : s)
const orderStatusClass = (s) =>
  ORDER_STATUS[s] ? ORDER_STATUS[s][1] : 'bg-gray-100 text-gray-600 dark:bg-gray-700'

// ========== 审计 ==========
const auditModal = ref(false)
const auditLogs = ref([])
const openAudit = async (id) => {
  auditLogs.value = []
  auditModal.value = true
  const res = await getPaymentOrderAuditApi(id)
  if (res.success) auditLogs.value = res.data || []
}

// ========== 看板 ==========
const dashboard = ref({
  todayAmount: 0,
  totalAmount: 0,
  todayCount: 0,
  totalCount: 0,
  byChannel: {},
  topKeys: []
})
const dashboardLoading = ref(false)
const dashboardLoaded = ref(false)
const loadDashboard = async () => {
  dashboardLoading.value = true
  const res = await getPaymentDashboardApi()
  dashboardLoading.value = false
  if (res.success && res.data) {
    dashboard.value = res.data
    dashboardLoaded.value = true
  } else {
    showToast(res.message || '数据看板加载失败，请重试', 'error')
  }
}

// ========== 通用确认（删除/退款） ==========
const confirmState = reactive({ show: false, message: '', action: null })
const confirmDelete = (kind, item) => {
  confirmState.message = `确定删除「${item.name}」?`
  confirmState.action = async () => {
    const res =
      kind === 'plan'
        ? await deletePaymentPlanApi(item.id)
        : await deletePaymentProviderApi(item.id)
    if (!res.success) return showToast(res.message || '删除失败', 'error')
    showToast('已删除', 'success')
    if (kind === 'plan') loadPlans()
    else loadProviders()
  }
  confirmState.show = true
}
const confirmRefund = (o) => {
  if (!canRefundProvider(o.providerKey)) {
    return showToast('该渠道不支持在线退款，请线下处理', 'error')
  }
  confirmState.message = `确定为订单 ${o.outTradeNo} 退款?（按未消费余额对称退还）`
  confirmState.action = async () => {
    const res = await refundPaymentOrderApi(o.id)
    if (!res.success) return showToast(res.message || '退款失败', 'error')
    showToast(`已退款 ${res.data?.refundAmount ?? ''}`, 'success')
    loadOrders()
  }
  confirmState.show = true
}
// 管理端查单补单
const doVerify = async (o) => {
  const res = await verifyPaymentOrderAdminApi(o.id)
  if (!res.success) return showToast(res.message || res.error || '查单失败', 'error')
  const st = res.data?.status
  showToast(
    st === 'completed' ? '已补单入账' : `查单完成，状态：${orderStatusLabel(st)}`,
    'success'
  )
  loadOrders()
}
// 手工入账
const manualModal = reactive({
  show: false,
  id: '',
  outTradeNo: '',
  reason: '',
  tradeNo: '',
  saving: false
})
const openManualComplete = (o) => {
  manualModal.id = o.id
  manualModal.outTradeNo = o.outTradeNo
  manualModal.reason = ''
  manualModal.tradeNo = o.tradeNo || ''
  manualModal.saving = false
  manualModal.show = true
}
const submitManualComplete = async () => {
  if (!String(manualModal.reason || '').trim()) {
    return showToast('必须填写补单原因', 'error')
  }
  manualModal.saving = true
  const res = await manualCompletePaymentOrderApi(manualModal.id, {
    reason: manualModal.reason,
    tradeNo: manualModal.tradeNo
  })
  manualModal.saving = false
  if (!res.success) return showToast(res.message || res.error || '入账失败', 'error')
  showToast(res.data?.alreadyDone ? '订单已完成' : '手工入账成功', 'success')
  manualModal.show = false
  loadOrders()
}
// in-doubt 卡单人工裁决：先在渠道后台核对流水，再二选一
const confirmResolve = (o, outcome) => {
  confirmState.message =
    outcome === 'refunded'
      ? `确认渠道侧【已退款】订单 ${o.outTradeNo}?（将补退款终态，不再调渠道）`
      : `确认渠道侧【未退款】订单 ${o.outTradeNo}?（将回滚已扣额度并解锁，需退款请重新发起）`
  confirmState.action = async () => {
    const res = await resolvePaymentRefundApi(o.id, outcome)
    if (!res.success) return showToast(res.message || '裁决失败', 'error')
    showToast('裁决完成', 'success')
    loadOrders()
  }
  confirmState.show = true
}
const runConfirm = async () => {
  const fn = confirmState.action
  confirmState.show = false
  if (fn) await fn()
}

onMounted(() => {
  // 默认 tab 为数据看板，首屏加载；失败后可通过看板内「重新加载」或切 tab 重试
  loadDashboard()
})
</script>
