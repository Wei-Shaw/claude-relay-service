<template>
  <Teleport to="body">
    <div class="modal fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <div class="modal-content mx-auto flex max-h-[90vh] w-full max-w-4xl flex-col p-4 sm:p-6">
        <div class="mb-4 flex items-center justify-between">
          <div class="flex items-center gap-2 sm:gap-3">
            <div
              class="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 sm:h-10 sm:w-10 sm:rounded-xl"
            >
              <i class="fas fa-key text-sm text-white sm:text-base" />
            </div>
            <h3 class="text-lg font-bold text-gray-900 dark:text-gray-100 sm:text-xl">
              创建新的 API Key
            </h3>
          </div>
          <button
            class="p-1 text-gray-400 transition-colors hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
            @click="$emit('close')"
          >
            <i class="fas fa-times text-lg sm:text-xl" />
          </button>
        </div>

        <form
          class="modal-scroll-content custom-scrollbar flex-1 space-y-4"
          @submit.prevent="createApiKey"
        >
          <!-- 创建类型选择 -->
          <div
            class="rounded-lg border border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 p-3 dark:border-blue-700 dark:from-blue-900/20 dark:to-indigo-900/20 sm:p-4"
          >
            <div
              :class="[
                'flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between',
                form.createType === 'batch' ? 'mb-3' : ''
              ]"
            >
              <label
                class="flex h-full items-center text-xs font-semibold text-gray-700 dark:text-gray-300 sm:text-sm"
                >创建类型</label
              >
              <div class="flex items-center gap-3 sm:gap-4">
                <label class="flex cursor-pointer items-center">
                  <input
                    v-model="form.createType"
                    class="mr-1.5 text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 sm:mr-2"
                    type="radio"
                    value="single"
                  />
                  <span
                    class="flex items-center text-xs text-gray-700 dark:text-gray-300 sm:text-sm"
                  >
                    <i class="fas fa-key mr-1 text-xs" />
                    单个创建
                  </span>
                </label>
                <label class="flex cursor-pointer items-center">
                  <input
                    v-model="form.createType"
                    class="mr-1.5 text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 sm:mr-2"
                    type="radio"
                    value="batch"
                  />
                  <span
                    class="flex items-center text-xs text-gray-700 dark:text-gray-300 sm:text-sm"
                  >
                    <i class="fas fa-layer-group mr-1 text-xs" />
                    批量创建
                  </span>
                </label>
              </div>
            </div>

            <!-- 批量创建数量输入 -->
            <div v-if="form.createType === 'batch'" class="mt-3">
              <div class="flex items-center gap-4">
                <div class="flex-1">
                  <label class="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400"
                    >创建数量</label
                  >
                  <div class="flex items-center gap-2">
                    <input
                      v-model.number="form.batchCount"
                      class="form-input w-full border-gray-300 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
                      max="500"
                      min="2"
                      placeholder="输入数量 (2-500)"
                      required
                      type="number"
                    />
                    <div class="whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">
                      最大支持 500 个
                    </div>
                  </div>
                </div>
              </div>
              <p class="mt-2 flex items-start text-xs text-amber-600 dark:text-amber-400">
                <i class="fas fa-info-circle mr-1 mt-0.5 flex-shrink-0" />
                <span
                  >批量创建时，每个 Key 的名称会自动添加序号后缀，例如：{{
                    form.name || 'MyKey'
                  }}_1, {{ form.name || 'MyKey' }}_2 ...</span
                >
              </p>
            </div>
          </div>

          <div>
            <label
              class="mb-1.5 block text-xs font-semibold text-gray-700 dark:text-gray-300 sm:mb-2 sm:text-sm"
              >名称 <span class="text-red-500">*</span></label
            >
            <div>
              <input
                v-model="form.name"
                class="form-input flex-1 border-gray-300 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
                :class="{ 'border-red-500': errors.name }"
                :placeholder="
                  form.createType === 'batch'
                    ? '输入基础名称（将自动添加序号）'
                    : '为您的 API Key 取一个名称'
                "
                required
                type="text"
                @input="errors.name = ''"
              />
            </div>
            <p v-if="errors.name" class="mt-1 text-xs text-red-500 dark:text-red-400">
              {{ errors.name }}
            </p>
          </div>

          <!-- 标签 -->
          <div>
            <label class="mb-2 block text-sm font-semibold text-gray-700 dark:text-gray-300"
              >标签</label
            >
            <div class="space-y-4">
              <!-- 已选择的标签 -->
              <div v-if="form.tags.length > 0">
                <div class="mb-2 text-xs font-medium text-gray-600 dark:text-gray-400">
                  已选择的标签:
                </div>
                <div class="flex flex-wrap gap-2">
                  <span
                    v-for="(tag, index) in form.tags"
                    :key="'selected-' + index"
                    class="inline-flex items-center gap-1 rounded-full bg-blue-100 px-3 py-1 text-sm text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
                  >
                    {{ tag }}
                    <button
                      class="ml-1 hover:text-blue-900 dark:hover:text-blue-300"
                      type="button"
                      @click="removeTag(index)"
                    >
                      <i class="fas fa-times text-xs" />
                    </button>
                  </span>
                </div>
              </div>

              <!-- 可选择的已有标签 -->
              <div v-if="unselectedTags.length > 0">
                <div class="mb-2 text-xs font-medium text-gray-600 dark:text-gray-400">
                  点击选择已有标签:
                </div>
                <div class="flex flex-wrap gap-2">
                  <button
                    v-for="tag in unselectedTags"
                    :key="'available-' + tag"
                    class="inline-flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700 transition-colors hover:bg-blue-100 hover:text-blue-700 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-blue-900/30 dark:hover:text-blue-400"
                    type="button"
                    @click="selectTag(tag)"
                  >
                    <i class="fas fa-tag text-xs text-gray-500 dark:text-gray-400" />
                    {{ tag }}
                  </button>
                </div>
              </div>

              <!-- 创建新标签 -->
              <div>
                <div class="mb-2 text-xs font-medium text-gray-600 dark:text-gray-400">
                  创建新标签:
                </div>
                <div class="flex gap-2">
                  <input
                    v-model="newTag"
                    class="form-input flex-1 border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
                    placeholder="输入新标签名称"
                    type="text"
                    @keypress.enter.prevent="addTag"
                  />
                  <button
                    class="rounded-lg bg-green-500 px-4 py-2 text-white transition-colors hover:bg-green-600"
                    type="button"
                    @click="addTag"
                  >
                    <i class="fas fa-plus" />
                  </button>
                </div>
              </div>

              <p class="text-xs text-gray-500 dark:text-gray-400">
                用于标记不同团队或用途，方便筛选管理
              </p>
            </div>
          </div>

          <!-- 速率限制设置 -->
          <div
            class="rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-700 dark:bg-blue-900/20"
          >
            <div class="mb-2 flex items-center gap-2">
              <div
                class="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded bg-blue-500"
              >
                <i class="fas fa-tachometer-alt text-xs text-white" />
              </div>
              <h4 class="text-sm font-semibold text-gray-800 dark:text-gray-200">
                速率限制设置 (可选)
              </h4>
            </div>

            <div class="space-y-2">
              <div class="grid grid-cols-1 gap-2 lg:grid-cols-3">
                <div>
                  <label class="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300"
                    >时间窗口 (分钟)</label
                  >
                  <input
                    v-model="form.rateLimitWindow"
                    class="form-input w-full border-gray-300 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
                    min="1"
                    placeholder="无限制"
                    type="number"
                  />
                  <p class="ml-2 mt-0.5 text-xs text-gray-500 dark:text-gray-400">时间段单位</p>
                </div>

                <div>
                  <label class="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300"
                    >请求次数限制</label
                  >
                  <input
                    v-model="form.rateLimitRequests"
                    class="form-input w-full border-gray-300 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
                    min="1"
                    placeholder="无限制"
                    type="number"
                  />
                  <p class="ml-2 mt-0.5 text-xs text-gray-500 dark:text-gray-400">窗口内最大请求</p>
                </div>

                <div>
                  <label class="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300"
                    >费用限制 (美元)</label
                  >
                  <input
                    v-model="form.rateLimitCost"
                    class="form-input w-full border-gray-300 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
                    min="0"
                    placeholder="无限制"
                    step="0.01"
                    type="number"
                  />
                  <p class="ml-2 mt-0.5 text-xs text-gray-500 dark:text-gray-400">窗口内最大费用</p>
                </div>
              </div>

              <!-- 示例说明 -->
              <div class="rounded-lg bg-blue-100 p-2 dark:bg-blue-900/30">
                <h5 class="mb-1 text-xs font-semibold text-blue-800 dark:text-blue-400">
                  💡 使用示例
                </h5>
                <div class="space-y-0.5 text-xs text-blue-700 dark:text-blue-300">
                  <div>
                    <strong>示例1:</strong> 时间窗口=60，请求次数=1000 → 每60分钟最多1000次请求
                  </div>
                  <div><strong>示例2:</strong> 时间窗口=1，费用=0.1 → 每分钟最多$0.1费用</div>
                  <div>
                    <strong>示例3:</strong> 窗口=30，请求=50，费用=5 → 每30分钟50次请求且不超$5费用
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div>
            <label class="mb-2 block text-sm font-semibold text-gray-700 dark:text-gray-300"
              >每日费用限制 (美元)</label
            >
            <div class="space-y-2">
              <div class="flex gap-2">
                <button
                  class="rounded bg-gray-100 px-2 py-1 text-xs font-medium hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                  type="button"
                  @click="form.dailyCostLimit = '50'"
                >
                  $50
                </button>
                <button
                  class="rounded bg-gray-100 px-2 py-1 text-xs font-medium hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                  type="button"
                  @click="form.dailyCostLimit = '100'"
                >
                  $100
                </button>
                <button
                  class="rounded bg-gray-100 px-2 py-1 text-xs font-medium hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                  type="button"
                  @click="form.dailyCostLimit = '200'"
                >
                  $200
                </button>
                <button
                  class="rounded bg-gray-100 px-2 py-1 text-xs font-medium hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                  type="button"
                  @click="form.dailyCostLimit = ''"
                >
                  自定义
                </button>
              </div>
              <input
                v-model="form.dailyCostLimit"
                class="form-input w-full border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
                min="0"
                placeholder="0 表示无限制"
                step="0.01"
                type="number"
              />
              <p class="dark:text灰-400 text-xs text-gray-500">
                设置此 API Key 每日的费用限制，超过限制将拒绝请求，0 或留空表示无限制
              </p>
            </div>
          </div>

          <div>
            <label class="mb-2 block text-sm font-semibold text-gray-700 dark:text-gray-300"
              >总费用限制 (美元)</label
            >
            <div class="space-y-2">
              <div class="flex gap-2">
                <button
                  class="rounded bg-gray-100 px-2 py-1 text-xs font-medium hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                  type="button"
                  @click="form.totalCostLimit = '100'"
                >
                  $100
                </button>
                <button
                  class="rounded bg-gray-100 px-2 py-1 text-xs font-medium hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                  type="button"
                  @click="form.totalCostLimit = '500'"
                >
                  $500
                </button>
                <button
                  class="rounded bg-gray-100 px-2 py-1 text-xs font-medium hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                  type="button"
                  @click="form.totalCostLimit = '1000'"
                >
                  $1000
                </button>
                <button
                  class="rounded bg-gray-100 px-2 py-1 text-xs font-medium hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                  type="button"
                  @click="form.totalCostLimit = ''"
                >
                  自定义
                </button>
              </div>
              <input
                v-model="form.totalCostLimit"
                class="form-input w-full border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
                min="0"
                placeholder="0 表示无限制"
                step="0.01"
                type="number"
              />
              <p class="text-xs text-gray-500 dark:text-gray-400">
                设置此 API Key 的累计总费用限制，达到限制后将拒绝所有后续请求，0 或留空表示无限制
              </p>
            </div>
          </div>

          <div>
            <label class="mb-2 block text-sm font-semibold text-gray-700 dark:text-gray-300"
              >Claude 模型周费用限制 (美元)</label
            >
            <div class="space-y-2">
              <div class="flex gap-2">
                <button
                  class="rounded bg-gray-100 px-2 py-1 text-xs font-medium hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                  type="button"
                  @click="form.weeklyOpusCostLimit = '100'"
                >
                  $100
                </button>
                <button
                  class="rounded bg-gray-100 px-2 py-1 text-xs font-medium hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                  type="button"
                  @click="form.weeklyOpusCostLimit = '500'"
                >
                  $500
                </button>
                <button
                  class="rounded bg-gray-100 px-2 py-1 text-xs font-medium hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                  type="button"
                  @click="form.weeklyOpusCostLimit = '1000'"
                >
                  $1000
                </button>
                <button
                  class="rounded bg-gray-100 px-2 py-1 text-xs font-medium hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                  type="button"
                  @click="form.weeklyOpusCostLimit = ''"
                >
                  自定义
                </button>
              </div>
              <input
                v-model="form.weeklyOpusCostLimit"
                class="form-input w-full border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
                min="0"
                placeholder="0 表示无限制"
                step="0.01"
                type="number"
              />
              <p class="text-xs text-gray-500 dark:text-gray-400">
                设置 Claude 模型的周费用限制（周一到周日），仅对 Claude 模型请求生效，0
                或留空表示无限制
              </p>
            </div>
          </div>

          <div>
            <label class="mb-2 block text-sm font-semibold text-gray-700 dark:text-gray-300"
              >并发限制 (可选)</label
            >
            <input
              v-model="form.concurrencyLimit"
              class="form-input w-full border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
              min="0"
              placeholder="0 表示无限制"
              type="number"
            />
            <p class="mt-2 text-xs text-gray-500 dark:text-gray-400">
              设置此 API Key 可同时处理的最大请求数，0 或留空表示无限制
            </p>
          </div>

          <div>
            <label class="mb-2 block text-sm font-semibold text-gray-700 dark:text-gray-300"
              >备注 (可选)</label
            >
            <textarea
              v-model="form.description"
              class="form-input w-full resize-none border-gray-300 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
              placeholder="描述此 API Key 的用途..."
              rows="2"
            />
          </div>

          <!-- 服务倍率设置 -->
          <div
            class="rounded-lg border border-purple-200 bg-gradient-to-r from-purple-50 to-indigo-50 p-3 dark:border-purple-700 dark:from-purple-900/20 dark:to-indigo-900/20 sm:p-4"
          >
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <input
                  id="enableServiceRates"
                  v-model="enableServiceRates"
                  class="h-4 w-4 rounded border-gray-300 bg-gray-100 text-purple-600 focus:ring-purple-500"
                  type="checkbox"
                />
                <label
                  class="cursor-pointer text-sm font-semibold text-gray-700 dark:text-gray-300"
                  for="enableServiceRates"
                >
                  自定义服务倍率
                </label>
              </div>
              <span class="text-xs text-gray-500 dark:text-gray-400">
                与全局倍率相乘，用于 VIP 折扣等（如全局1.5 × Key倍率0.8 = 1.2）
              </span>
            </div>
            <div v-if="enableServiceRates" class="mt-3 space-y-2">
              <div
                v-for="service in availableServices"
                :key="service.key"
                class="flex items-center gap-2"
              >
                <span class="w-20 text-xs text-gray-600 dark:text-gray-400">{{
                  service.label
                }}</span>
                <input
                  v-model.number="form.serviceRates[service.key]"
                  class="form-input w-24 border-gray-300 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
                  min="0"
                  placeholder="1.0"
                  step="0.1"
                  type="number"
                />
                <span class="text-xs text-gray-400">默认 1.0</span>
              </div>
            </div>
          </div>

          <div>
            <label class="mb-2 block text-sm font-semibold text-gray-700 dark:text-gray-300"
              >过期设置</label
            >
            <!-- 过期模式选择 -->
            <div
              class="mb-3 rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800"
            >
              <div class="flex items-center gap-4">
                <label class="flex cursor-pointer items-center">
                  <input
                    v-model="form.expirationMode"
                    class="mr-2 text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700"
                    type="radio"
                    value="fixed"
                  />
                  <span class="text-sm text-gray-700 dark:text-gray-300">固定时间过期</span>
                </label>
                <label class="flex cursor-pointer items-center">
                  <input
                    v-model="form.expirationMode"
                    class="mr-2 text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700"
                    type="radio"
                    value="activation"
                  />
                  <span class="text-sm text-gray-700 dark:text-gray-300">首次使用后激活</span>
                </label>
              </div>
              <p class="mt-2 text-xs text-gray-500 dark:text-gray-400">
                <span v-if="form.expirationMode === 'fixed'">
                  <i class="fas fa-info-circle mr-1" />
                  固定时间模式：Key 创建后立即生效，按设定时间过期（支持小时和天数）
                </span>
                <span v-else>
                  <i class="fas fa-info-circle mr-1" />
                  激活模式：Key 首次使用时激活，激活后按设定时间过期（支持小时和天数，适合批量销售）
                </span>
              </p>
            </div>

            <!-- 固定时间模式 -->
            <div v-if="form.expirationMode === 'fixed'">
              <select
                v-model="form.expireDuration"
                class="form-input w-full border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
                @change="updateExpireAt"
              >
                <option value="">永不过期</option>
                <option value="1h">1 小时</option>
                <option value="3h">3 小时</option>
                <option value="6h">6 小时</option>
                <option value="12h">12 小时</option>
                <option value="1d">1 天</option>
                <option value="7d">7 天</option>
                <option value="30d">30 天</option>
                <option value="90d">90 天</option>
                <option value="180d">180 天</option>
                <option value="365d">365 天</option>
                <option value="custom">自定义日期</option>
              </select>
              <div v-if="form.expireDuration === 'custom'" class="mt-3">
                <input
                  v-model="form.customExpireDate"
                  class="form-input w-full border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
                  :min="minDateTime"
                  type="datetime-local"
                  @change="updateCustomExpireAt"
                />
              </div>
              <p v-if="form.expiresAt" class="mt-2 text-xs text-gray-500 dark:text-gray-400">
                将于 {{ formatExpireDate(form.expiresAt) }} 过期
              </p>
            </div>

            <!-- 激活模式 -->
            <div v-else>
              <div class="flex items-center gap-2">
                <input
                  v-model.number="form.activationDays"
                  class="form-input flex-1 border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
                  :max="form.activationUnit === 'hours' ? 8760 : 3650"
                  min="1"
                  :placeholder="form.activationUnit === 'hours' ? '输入小时数' : '输入天数'"
                  type="number"
                />
                <select
                  v-model="form.activationUnit"
                  class="form-input w-20 border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
                  @change="updateActivationValue"
                >
                  <option value="hours">小时</option>
                  <option value="days">天</option>
                </select>
              </div>
              <div class="mt-2 flex flex-wrap gap-2">
                <button
                  v-for="value in getQuickTimeOptions()"
                  :key="value.value"
                  class="rounded-md border border-gray-300 px-3 py-1 text-xs hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-700"
                  type="button"
                  @click="form.activationDays = value.value"
                >
                  {{ value.label }}
                </button>
              </div>
              <p class="mt-2 text-xs text-gray-500 dark:text-gray-400">
                <i class="fas fa-clock mr-1" />
                Key 将在首次使用后激活，激活后
                {{ form.activationDays || (form.activationUnit === 'hours' ? 24 : 30) }}
                {{ form.activationUnit === 'hours' ? '小时' : '天' }}过期
              </p>
            </div>
          </div>

          <div>
            <label class="mb-2 block text-sm font-semibold text-gray-700 dark:text-gray-300"
              >服务权限</label
            >
            <div class="flex flex-wrap gap-4">
              <label class="flex cursor-pointer items-center">
                <input
                  v-model="form.permissions"
                  class="mr-2 rounded text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700"
                  type="checkbox"
                  value="claude"
                  @change="updatePermissions"
                />
                <span class="text-sm text-gray-700 dark:text-gray-300">Claude</span>
              </label>
              <label class="flex cursor-pointer items-center">
                <input
                  v-model="form.permissions"
                  class="mr-2 rounded text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700"
                  type="checkbox"
                  value="gemini"
                  @change="updatePermissions"
                />
                <span class="text-sm text-gray-700 dark:text-gray-300">Gemini</span>
              </label>
              <label class="flex cursor-pointer items-center">
                <input
                  v-model="form.permissions"
                  class="mr-2 rounded text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700"
                  type="checkbox"
                  value="openai"
                  @change="updatePermissions"
                />
                <span class="text-sm text-gray-700 dark:text-gray-300">OpenAI</span>
              </label>
              <label class="flex cursor-pointer items-center">
                <input
                  v-model="form.permissions"
                  class="mr-2 rounded text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700"
                  type="checkbox"
                  value="droid"
                  @change="updatePermissions"
                />
                <span class="text-sm text-gray-700 dark:text-gray-300">Droid</span>
              </label>
            </div>
            <p class="mt-2 text-xs text-gray-500 dark:text-gray-400">
              不选择任何服务表示允许访问全部服务
            </p>
          </div>

          <div>
            <div class="mb-2 flex items-center justify-between">
              <label class="text-sm font-semibold text-gray-700 dark:text-gray-300"
                >专属账号绑定 (可选)</label
              >
              <button
                class="flex items-center gap-1 text-sm text-blue-600 transition-colors hover:text-blue-800 disabled:cursor-not-allowed disabled:opacity-50 dark:text-blue-400 dark:hover:text-blue-300"
                :disabled="accountsLoading"
                title="刷新账号列表"
                type="button"
                @click="refreshAccounts"
              >
                <i
                  :class="[
                    'fas',
                    accountsLoading ? 'fa-spinner fa-spin' : 'fa-sync-alt',
                    'text-xs'
                  ]"
                />
                <span>{{ accountsLoading ? '刷新中...' : '刷新账号' }}</span>
              </button>
            </div>
            <div class="grid grid-cols-1 gap-3">
              <div>
                <label class="mb-1 block text-sm font-medium text-gray-600 dark:text-gray-400"
                  >Claude 专属账号</label
                >
                <AccountSelector
                  v-model="form.claudeAccountId"
                  :accounts="localAccounts.claude"
                  default-option-text="使用共享账号池"
                  :disabled="form.permissions.length > 0 && !form.permissions.includes('claude')"
                  :groups="localAccounts.claudeGroups"
                  placeholder="请选择Claude账号"
                  platform="claude"
                />
              </div>
              <div>
                <label class="mb-1 block text-sm font-medium text-gray-600 dark:text-gray-400"
                  >Gemini 专属账号</label
                >
                <AccountSelector
                  v-model="form.geminiAccountId"
                  :accounts="localAccounts.gemini"
                  default-option-text="使用共享账号池"
                  :disabled="form.permissions.length > 0 && !form.permissions.includes('gemini')"
                  :groups="localAccounts.geminiGroups"
                  placeholder="请选择Gemini账号"
                  platform="gemini"
                />
              </div>
              <div>
                <label class="mb-1 block text-sm font-medium text-gray-600 dark:text-gray-400"
                  >OpenAI 专属账号</label
                >
                <AccountSelector
                  v-model="form.openaiAccountId"
                  :accounts="localAccounts.openai"
                  default-option-text="使用共享账号池"
                  :disabled="form.permissions.length > 0 && !form.permissions.includes('openai')"
                  :groups="localAccounts.openaiGroups"
                  placeholder="请选择OpenAI账号"
                  platform="openai"
                />
              </div>
              <div>
                <label class="mb-1 block text-sm font-medium text-gray-600 dark:text-gray-400"
                  >Bedrock 专属账号</label
                >
                <AccountSelector
                  v-model="form.bedrockAccountId"
                  :accounts="localAccounts.bedrock"
                  default-option-text="使用共享账号池"
                  :disabled="form.permissions.length > 0 && !form.permissions.includes('claude')"
                  :groups="[]"
                  placeholder="请选择Bedrock账号"
                  platform="bedrock"
                />
              </div>
              <div>
                <label class="mb-1 block text-sm font-medium text-gray-600 dark:text-gray-400"
                  >Droid 专属账号</label
                >
                <AccountSelector
                  v-model="form.droidAccountId"
                  :accounts="localAccounts.droid"
                  default-option-text="使用共享账号池"
                  :disabled="form.permissions.length > 0 && !form.permissions.includes('droid')"
                  :groups="localAccounts.droidGroups"
                  placeholder="请选择Droid账号"
                  platform="droid"
                />
              </div>
            </div>
            <p class="mt-2 text-xs text-gray-500 dark:text-gray-400">
              选择专属账号后，此API Key将只使用该账号，不选择则使用共享账号池
            </p>
          </div>

          <div>
            <div class="mb-2 flex items-center">
              <input
                id="enableModelRestriction"
                v-model="form.enableModelRestriction"
                class="h-4 w-4 rounded border-gray-300 bg-gray-100 text-blue-600 focus:ring-blue-500"
                type="checkbox"
              />
              <label
                class="ml-2 cursor-pointer text-sm font-semibold text-gray-700 dark:text-gray-300"
                for="enableModelRestriction"
              >
                启用模型限制
              </label>
            </div>

            <div v-if="form.enableModelRestriction" class="space-y-3">
              <div>
                <label class="mb-2 block text-sm font-medium text-gray-600">限制的模型列表</label>
                <div
                  class="mb-3 flex min-h-[32px] flex-wrap gap-2 rounded-lg border border-gray-200 bg-gray-50 p-2"
                >
                  <span
                    v-for="(model, index) in form.restrictedModels"
                    :key="index"
                    class="inline-flex items-center rounded-full bg-red-100 px-3 py-1 text-sm text-red-800"
                  >
                    {{ model }}
                    <button
                      class="ml-2 text-red-600 hover:text-red-800"
                      type="button"
                      @click="removeRestrictedModel(index)"
                    >
                      <i class="fas fa-times text-xs" />
                    </button>
                  </span>
                  <span v-if="form.restrictedModels.length === 0" class="text-sm text-gray-400">
                    暂无限制的模型
                  </span>
                </div>
                <div class="space-y-3">
                  <!-- 快速添加按钮 -->
                  <div class="flex flex-wrap gap-2">
                    <button
                      v-for="model in availableQuickModels"
                      :key="model"
                      class="flex-shrink-0 rounded-lg bg-gray-100 px-3 py-1 text-xs text-gray-700 transition-colors hover:bg-gray-200 sm:text-sm"
                      type="button"
                      @click="quickAddRestrictedModel(model)"
                    >
                      {{ model }}
                    </button>
                    <span
                      v-if="availableQuickModels.length === 0"
                      class="text-sm italic text-gray-400"
                    >
                      所有常用模型已在限制列表中
                    </span>
                  </div>

                  <!-- 手动输入 -->
                  <div class="flex gap-2">
                    <input
                      v-model="form.modelInput"
                      class="form-input flex-1"
                      placeholder="输入模型名称，按回车添加"
                      type="text"
                      @keydown.enter.prevent="addRestrictedModel"
                    />
                    <button
                      class="rounded-lg bg-red-500 px-4 py-2 text-white transition-colors hover:bg-red-600"
                      type="button"
                      @click="addRestrictedModel"
                    >
                      <i class="fas fa-plus" />
                    </button>
                  </div>
                </div>
                <p class="mt-2 text-xs text-gray-500">
                  设置此API Key无法访问的模型，例如：claude-opus-4-20250514
                </p>
              </div>
            </div>
          </div>

          <!-- 客户端限制 -->
          <div>
            <div class="mb-2 flex items-center">
              <input
                id="enableClientRestriction"
                v-model="form.enableClientRestriction"
                class="h-4 w-4 rounded border-gray-300 bg-gray-100 text-blue-600 focus:ring-blue-500"
                type="checkbox"
              />
              <label
                class="ml-2 cursor-pointer text-sm font-semibold text-gray-700 dark:text-gray-300"
                for="enableClientRestriction"
              >
                启用客户端限制
              </label>
            </div>

            <div
              v-if="form.enableClientRestriction"
              class="rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-700 dark:bg-green-900/20"
            >
              <div>
                <label class="mb-2 block text-xs font-medium text-gray-700 dark:text-gray-300"
                  >允许的客户端</label
                >
                <div class="space-y-1">
                  <div v-for="client in supportedClients" :key="client.id" class="flex items-start">
                    <input
                      :id="`client_${client.id}`"
                      v-model="form.allowedClients"
                      class="mt-0.5 h-4 w-4 rounded border-gray-300 bg-gray-100 text-blue-600 focus:ring-blue-500"
                      type="checkbox"
                      :value="client.id"
                    />
                    <label class="ml-2 flex-1 cursor-pointer" :for="`client_${client.id}`">
                      <span class="text-sm font-medium text-gray-700 dark:text-gray-300">{{
                        client.name
                      }}</span>
                      <span class="block text-xs text-gray-500 dark:text-gray-400">{{
                        client.description
                      }}</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="flex gap-3 pt-2">
            <button
              class="flex-1 rounded-lg bg-gray-100 px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
              type="button"
              @click="$emit('close')"
            >
              取消
            </button>
            <button
              class="btn btn-primary flex-1 px-4 py-2.5 text-sm font-semibold"
              :disabled="loading"
              type="submit"
            >
              <div v-if="loading" class="loading-spinner mr-2" />
              <i v-else class="fas fa-plus mr-2" />
              {{ loading ? '创建中...' : '创建' }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- ConfirmModal -->
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
  </Teleport>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { showToast } from '@/utils/tools'
import { useClientsStore } from '@/stores/clients'
import { useApiKeysStore } from '@/stores/apiKeys'
import * as httpApis from '@/utils/http_apis'
import AccountSelector from '@/components/common/AccountSelector.vue'
import ConfirmModal from '@/components/common/ConfirmModal.vue'

const props = defineProps({
  accounts: {
    type: Object,
    default: () => ({
      claude: [],
      gemini: [],
      openai: [],
      bedrock: [],
      droid: [],
      claudeGroups: [],
      geminiGroups: [],
      openaiGroups: [],
      droidGroups: []
    })
  }
})

const emit = defineEmits(['close', 'success', 'batch-success'])

const clientsStore = useClientsStore()
const apiKeysStore = useApiKeysStore()
const loading = ref(false)
const accountsLoading = ref(false)

// ConfirmModal 状态
const showConfirmModal = ref(false)
const confirmModalConfig = ref({
  title: '',
  message: '',
  type: 'primary',
  confirmText: '确认',
  cancelText: '取消'
})
const confirmResolve = ref(null)

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

const localAccounts = ref({
  claude: [],
  gemini: [],
  openai: [],
  bedrock: [],
  droid: [],
  claudeGroups: [],
  geminiGroups: [],
  openaiGroups: [],
  droidGroups: []
})

// 表单验证状态
const errors = ref({
  name: ''
})

// 标签相关
const newTag = ref('')
const availableTags = ref([])

// 计算未选择的标签
const unselectedTags = computed(() => {
  return availableTags.value.filter((tag) => !form.tags.includes(tag))
})

// 支持的客户端列表
const supportedClients = ref([])

// 服务倍率相关
const enableServiceRates = ref(false)
const availableServices = [
  { key: 'claude', label: 'Claude' },
  { key: 'gemini', label: 'Gemini' },
  { key: 'codex', label: 'Codex' },
  { key: 'droid', label: 'Droid' },
  { key: 'bedrock', label: 'Bedrock' },
  { key: 'azure', label: 'Azure' },
  { key: 'ccr', label: 'CCR' }
]

// 表单数据
const form = reactive({
  createType: 'single',
  batchCount: 10,
  name: '',
  description: '',
  serviceRates: {}, // API Key 级别服务倍率
  rateLimitWindow: '',
  rateLimitRequests: '',
  rateLimitCost: '', // 新增：费用限制
  concurrencyLimit: '',
  dailyCostLimit: '',
  totalCostLimit: '',
  weeklyOpusCostLimit: '',
  expireDuration: '',
  customExpireDate: '',
  expiresAt: null,
  expirationMode: 'fixed', // 过期模式：fixed(固定) 或 activation(激活)
  activationDays: 30, // 激活后有效天数
  activationUnit: 'days', // 激活时间单位：hours 或 days
  permissions: [], // 数组格式，空数组表示全部服务
  claudeAccountId: '',
  geminiAccountId: '',
  openaiAccountId: '',
  bedrockAccountId: '',
  droidAccountId: '',
  enableModelRestriction: false,
  restrictedModels: [],
  modelInput: '',
  enableClientRestriction: false,
  allowedClients: [],
  tags: []
})

// 更新权限（数组格式，空数组=全部服务）
const updatePermissions = () => {
  // form.permissions 已经是数组，由 v-model 自动管理
}

// 加载支持的客户端和已存在的标签
onMounted(async () => {
  supportedClients.value = await clientsStore.loadSupportedClients()
  availableTags.value = await apiKeysStore.fetchTags()
  // 初始化账号数据
  if (props.accounts) {
    // props.accounts.gemini 已经包含了 OAuth 和 API 两种类型的账号（父组件已合并）
    // 保留原有的 platform 属性，不要覆盖
    const geminiAccounts = (props.accounts.gemini || []).map((account) => ({
      ...account,
      platform: account.platform || 'gemini' // 保留原有 platform，只在没有时设默认值
    }))

    // props.accounts.openai 只包含 openai 类型，openaiResponses 需要单独处理
    const openaiAccounts = []
    if (props.accounts.openai) {
      props.accounts.openai.forEach((account) => {
        openaiAccounts.push({
          ...account,
          platform: account.platform || 'openai'
        })
      })
    }
    if (props.accounts.openaiResponses) {
      props.accounts.openaiResponses.forEach((account) => {
        openaiAccounts.push({
          ...account,
          platform: account.platform || 'openai-responses'
        })
      })
    }

    localAccounts.value = {
      claude: props.accounts.claude || [],
      gemini: geminiAccounts,
      openai: openaiAccounts,
      bedrock: props.accounts.bedrock || [],
      droid: (props.accounts.droid || []).map((account) => ({
        ...account,
        platform: account.platform || 'droid'
      })),
      claudeGroups: props.accounts.claudeGroups || [],
      geminiGroups: props.accounts.geminiGroups || [],
      openaiGroups: props.accounts.openaiGroups || [],
      droidGroups: props.accounts.droidGroups || []
    }
  }

  // 使用缓存的账号数据，不自动刷新（用户可点击"刷新账号"按钮手动刷新）
})

// 刷新账号列表
const refreshAccounts = async () => {
  accountsLoading.value = true
  try {
    const [
      claudeData,
      claudeConsoleData,
      geminiData,
      geminiApiData,
      openaiData,
      openaiResponsesData,
      bedrockData,
      droidData,
      groupsData
    ] = await Promise.all([
      httpApis.getClaudeAccountsApi(),
      httpApis.getClaudeConsoleAccountsApi(),
      httpApis.getGeminiAccountsApi(),
      httpApis.getGeminiApiAccountsApi(), // 获取 Gemini-API 账号
      httpApis.getOpenAIAccountsApi(),
      httpApis.getOpenAIResponsesAccountsApi(), // 获取 OpenAI-Responses 账号
      httpApis.getBedrockAccountsApi(),
      httpApis.getDroidAccountsApi(),
      httpApis.getAccountGroupsApi()
    ])

    // 合并Claude OAuth账户和Claude Console账户
    const claudeAccounts = []

    if (claudeData.success) {
      claudeData.data?.forEach((account) => {
        claudeAccounts.push({
          ...account,
          platform: 'claude-oauth',
          isDedicated: account.accountType === 'dedicated' // 保留以便向后兼容
        })
      })
    }

    if (claudeConsoleData.success) {
      claudeConsoleData.data?.forEach((account) => {
        claudeAccounts.push({
          ...account,
          platform: 'claude-console',
          isDedicated: account.accountType === 'dedicated' // 保留以便向后兼容
        })
      })
    }

    localAccounts.value.claude = claudeAccounts

    // 合并 Gemini OAuth 和 Gemini API 账号
    const geminiAccounts = []

    if (geminiData.success) {
      ;(geminiData.data || []).forEach((account) => {
        geminiAccounts.push({
          ...account,
          platform: 'gemini',
          isDedicated: account.accountType === 'dedicated'
        })
      })
    }

    if (geminiApiData.success) {
      ;(geminiApiData.data || []).forEach((account) => {
        geminiAccounts.push({
          ...account,
          platform: 'gemini-api',
          isDedicated: account.accountType === 'dedicated'
        })
      })
    }

    localAccounts.value.gemini = geminiAccounts

    // 合并 OpenAI 和 OpenAI-Responses 账号
    const openaiAccounts = []

    if (openaiData.success) {
      ;(openaiData.data || []).forEach((account) => {
        openaiAccounts.push({
          ...account,
          platform: 'openai',
          isDedicated: account.accountType === 'dedicated' // 保留以便向后兼容
        })
      })
    }

    if (openaiResponsesData.success) {
      ;(openaiResponsesData.data || []).forEach((account) => {
        openaiAccounts.push({
          ...account,
          platform: 'openai-responses',
          isDedicated: account.accountType === 'dedicated' // 保留以便向后兼容
        })
      })
    }

    localAccounts.value.openai = openaiAccounts

    if (bedrockData.success) {
      localAccounts.value.bedrock = (bedrockData.data || []).map((account) => ({
        ...account,
        isDedicated: account.accountType === 'dedicated' // 保留以便向后兼容
      }))
    }

    if (droidData.success) {
      localAccounts.value.droid = (droidData.data || []).map((account) => ({
        ...account,
        platform: 'droid',
        isDedicated: account.accountType === 'dedicated'
      }))
    }

    // 处理分组数据
    if (groupsData.success) {
      const allGroups = groupsData.data || []
      localAccounts.value.claudeGroups = allGroups.filter((g) => g.platform === 'claude')
      localAccounts.value.geminiGroups = allGroups.filter((g) => g.platform === 'gemini')
      localAccounts.value.openaiGroups = allGroups.filter((g) => g.platform === 'openai')
      localAccounts.value.droidGroups = allGroups.filter((g) => g.platform === 'droid')
    }

    showToast('账号列表已刷新', 'success')
  } catch (error) {
    showToast('刷新账号列表失败', 'error')
  } finally {
    accountsLoading.value = false
  }
}

// 计算最小日期时间
const minDateTime = computed(() => {
  const now = new Date()
  now.setMinutes(now.getMinutes() + 1)
  return now.toISOString().slice(0, 16)
})

// 更新过期时间
const updateExpireAt = () => {
  if (!form.expireDuration) {
    form.expiresAt = null
    return
  }

  if (form.expireDuration === 'custom') {
    return
  }

  const now = new Date()
  const duration = form.expireDuration
  const match = duration.match(/(\d+)([dhmy])/)

  if (match) {
    const [, value, unit] = match
    const num = parseInt(value)

    switch (unit) {
      case 'd':
        now.setDate(now.getDate() + num)
        break
      case 'h':
        now.setHours(now.getHours() + num)
        break
      case 'm':
        now.setMonth(now.getMonth() + num)
        break
      case 'y':
        now.setFullYear(now.getFullYear() + num)
        break
    }

    form.expiresAt = now.toISOString()
  }
}

// 更新自定义过期时间
const updateCustomExpireAt = () => {
  if (form.customExpireDate) {
    form.expiresAt = new Date(form.customExpireDate).toISOString()
  }
}

// 格式化过期日期
const formatExpireDate = (dateString) => {
  const date = new Date(dateString)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

// 添加限制的模型
const addRestrictedModel = () => {
  if (form.modelInput && !form.restrictedModels.includes(form.modelInput)) {
    form.restrictedModels.push(form.modelInput)
    form.modelInput = ''
  }
}

// 移除限制的模型
const removeRestrictedModel = (index) => {
  form.restrictedModels.splice(index, 1)
}

// 常用模型列表
const commonModels = ref(['claude-opus-4-20250514', 'claude-opus-4-1-20250805'])

// 可用的快捷模型（过滤掉已在限制列表中的）
const availableQuickModels = computed(() => {
  return commonModels.value.filter((model) => !form.restrictedModels.includes(model))
})

// 快速添加限制的模型
const quickAddRestrictedModel = (model) => {
  if (!form.restrictedModels.includes(model)) {
    form.restrictedModels.push(model)
  }
}

// 标签管理方法
const addTag = () => {
  if (newTag.value && newTag.value.trim()) {
    const tag = newTag.value.trim()
    if (!form.tags.includes(tag)) {
      form.tags.push(tag)
    }
    newTag.value = ''
  }
}

const selectTag = (tag) => {
  if (!form.tags.includes(tag)) {
    form.tags.push(tag)
  }
}

const removeTag = (index) => {
  form.tags.splice(index, 1)
}

// 获取快捷时间选项
const getQuickTimeOptions = () => {
  if (form.activationUnit === 'hours') {
    return [
      { value: 1, label: '1小时' },
      { value: 3, label: '3小时' },
      { value: 6, label: '6小时' },
      { value: 12, label: '12小时' }
    ]
  } else {
    return [
      { value: 30, label: '30天' },
      { value: 90, label: '90天' },
      { value: 180, label: '180天' },
      { value: 365, label: '365天' }
    ]
  }
}

// 单位变化时更新数值
const updateActivationValue = () => {
  if (form.activationUnit === 'hours') {
    // 从天切换到小时，设置一个合理的默认值
    if (form.activationDays > 24) {
      form.activationDays = 24
    }
  } else {
    // 从小时切换到天，设置一个合理的默认值
    if (form.activationDays < 1) {
      form.activationDays = 1
    }
  }
}

// 创建 API Key
const createApiKey = async () => {
  // 验证表单
  errors.value.name = ''

  if (!form.name || !form.name.trim()) {
    errors.value.name = '请输入API Key名称'
    return
  }

  // 批量创建时验证数量
  if (form.createType === 'batch') {
    if (!form.batchCount || form.batchCount < 2 || form.batchCount > 500) {
      showToast('批量创建数量必须在 2-500 之间', 'error')
      return
    }
  }

  // 检查是否设置了时间窗口但费用限制为0
  if (form.rateLimitWindow && (!form.rateLimitCost || parseFloat(form.rateLimitCost) === 0)) {
    const confirmed = await showConfirm(
      '费用限制提醒',
      '您设置了时间窗口但费用限制为0，这意味着不会有费用限制。\n\n是否继续？',
      '继续创建',
      '返回修改',
      'warning'
    )
    if (!confirmed) {
      return
    }
  }

  loading.value = true

  try {
    // 准备提交的数据
    // 过滤掉空值的服务倍率
    const filteredServiceRates = {}
    if (enableServiceRates.value) {
      for (const [key, value] of Object.entries(form.serviceRates)) {
        if (value !== null && value !== undefined && value !== '') {
          filteredServiceRates[key] = value
        }
      }
    }

    const baseData = {
      description: form.description || undefined,
      serviceRates: filteredServiceRates,
      tokenLimit: 0, // 设置为0，清除历史token限制
      rateLimitWindow:
        form.rateLimitWindow !== '' && form.rateLimitWindow !== null
          ? parseInt(form.rateLimitWindow)
          : null,
      rateLimitRequests:
        form.rateLimitRequests !== '' && form.rateLimitRequests !== null
          ? parseInt(form.rateLimitRequests)
          : null,
      rateLimitCost:
        form.rateLimitCost !== '' && form.rateLimitCost !== null
          ? parseFloat(form.rateLimitCost)
          : null,
      concurrencyLimit:
        form.concurrencyLimit !== '' && form.concurrencyLimit !== null
          ? parseInt(form.concurrencyLimit)
          : 0,
      dailyCostLimit:
        form.dailyCostLimit !== '' && form.dailyCostLimit !== null
          ? parseFloat(form.dailyCostLimit)
          : 0,
      totalCostLimit:
        form.totalCostLimit !== '' && form.totalCostLimit !== null
          ? parseFloat(form.totalCostLimit)
          : 0,
      weeklyOpusCostLimit:
        form.weeklyOpusCostLimit !== '' && form.weeklyOpusCostLimit !== null
          ? parseFloat(form.weeklyOpusCostLimit)
          : 0,
      expiresAt: form.expirationMode === 'fixed' ? form.expiresAt || undefined : undefined,
      expirationMode: form.expirationMode,
      activationDays: form.expirationMode === 'activation' ? form.activationDays : undefined,
      activationUnit: form.expirationMode === 'activation' ? form.activationUnit : undefined,
      permissions: form.permissions,
      tags: form.tags.length > 0 ? form.tags : undefined,
      enableModelRestriction: form.enableModelRestriction,
      restrictedModels: form.restrictedModels,
      enableClientRestriction: form.enableClientRestriction,
      allowedClients: form.allowedClients
    }

    // 处理Claude账户绑定（区分OAuth和Console）
    if (form.claudeAccountId) {
      if (form.claudeAccountId.startsWith('console:')) {
        // Claude Console账户
        baseData.claudeConsoleAccountId = form.claudeAccountId.substring(8)
        // 确保不会同时设置OAuth账号
        delete baseData.claudeAccountId
      } else {
        // Claude OAuth账户或分组
        baseData.claudeAccountId = form.claudeAccountId
        // 确保不会同时设置Console账号
        delete baseData.claudeConsoleAccountId
      }
    }

    // Gemini账户绑定
    if (form.geminiAccountId) {
      baseData.geminiAccountId = form.geminiAccountId
    }

    // OpenAI账户绑定
    if (form.openaiAccountId) {
      baseData.openaiAccountId = form.openaiAccountId
    }

    // Bedrock账户绑定
    if (form.bedrockAccountId) {
      baseData.bedrockAccountId = form.bedrockAccountId
    }
    if (form.droidAccountId) {
      baseData.droidAccountId = form.droidAccountId
    }

    if (form.createType === 'single') {
      // 单个创建
      const data = {
        ...baseData,
        name: form.name
      }

      const result = await httpApis.createApiKeyApi(data)

      if (result.success) {
        showToast('API Key 创建成功', 'success')
        emit('success', result.data)
        emit('close')
      } else {
        showToast(result.message || '创建失败', 'error')
      }
    } else {
      // 批量创建
      const data = {
        ...baseData,
        createType: 'batch',
        baseName: form.name,
        count: form.batchCount
      }

      const result = await httpApis.batchCreateApiKeysApi(data)

      if (result.success) {
        showToast(`成功创建 ${result.data.length} 个 API Key`, 'success')
        emit('batch-success', result.data)
        emit('close')
      } else {
        showToast(result.message || '批量创建失败', 'error')
      }
    }
  } catch (error) {
    showToast('创建失败', 'error')
  } finally {
    loading.value = false
  }
}
</script>
