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
              {{ $t('apiKeys.createApiKeyModal.title') }}
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
                >{{ $t('apiKeys.createApiKeyModal.createType') }}</label
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
                    {{ $t('apiKeys.createApiKeyModal.singleCreate') }}
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
                    {{ $t('apiKeys.createApiKeyModal.batchCreate') }}
                  </span>
                </label>
              </div>
            </div>

            <!-- 批量创建数量输入 -->
            <div v-if="form.createType === 'batch'" class="mt-3">
              <div class="flex items-center gap-4">
                <div class="flex-1">
                  <label class="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">{{
                    $t('apiKeys.createApiKeyModal.batchCount')
                  }}</label>
                  <div class="flex items-center gap-2">
                    <input
                      v-model.number="form.batchCount"
                      class="form-input w-full border-gray-300 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
                      max="500"
                      min="2"
                      :placeholder="$t('apiKeys.createApiKeyModal.batchCountPlaceholder')"
                      required
                      type="number"
                    />
                    <div class="whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">
                      {{ $t('apiKeys.createApiKeyModal.maxSupported') }}
                    </div>
                  </div>
                </div>
              </div>
              <p class="mt-2 flex items-start text-xs text-amber-600 dark:text-amber-400">
                <i class="fas fa-info-circle mr-1 mt-0.5 flex-shrink-0" />
                <span>{{
                  $t('apiKeys.createApiKeyModal.batchHint', { name: form.name || 'MyKey' })
                }}</span>
              </p>
            </div>
          </div>

          <div>
            <label
              class="mb-1.5 block text-xs font-semibold text-gray-700 dark:text-gray-300 sm:mb-2 sm:text-sm"
              >{{ $t('apiKeys.createApiKeyModal.name') }}
              <span class="text-red-500">{{
                $t('apiKeys.createApiKeyModal.nameRequired')
              }}</span></label
            >
            <input
              v-model="form.name"
              class="form-input w-full border-gray-300 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
              :class="{ 'border-red-500': errors.name }"
              :placeholder="
                form.createType === 'batch'
                  ? $t('apiKeys.createApiKeyModal.batchNamePlaceholder')
                  : $t('apiKeys.createApiKeyModal.singleNamePlaceholder')
              "
              required
              type="text"
              @input="errors.name = ''"
            />
            <p v-if="errors.name" class="mt-1 text-xs text-red-500 dark:text-red-400">
              {{ errors.name }}
            </p>
          </div>

          <!-- 标签 -->
          <div>
            <label class="mb-2 block text-sm font-semibold text-gray-700 dark:text-gray-300">{{
              $t('apiKeys.createApiKeyModal.tags')
            }}</label>
            <div class="space-y-4">
              <!-- 已选择的标签 -->
              <div v-if="form.tags.length > 0">
                <div class="mb-2 text-xs font-medium text-gray-600 dark:text-gray-400">
                  {{ $t('apiKeys.createApiKeyModal.selectedTags') }}
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
                  {{ $t('apiKeys.createApiKeyModal.clickToSelectTags') }}
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
                  {{ $t('apiKeys.createApiKeyModal.createNewTag') }}
                </div>
                <div class="flex gap-2">
                  <input
                    v-model="newTag"
                    class="form-input flex-1 border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
                    :placeholder="$t('apiKeys.createApiKeyModal.newTagPlaceholder')"
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
                {{ $t('apiKeys.createApiKeyModal.tagHint') }}
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
                {{ $t('apiKeys.createApiKeyModal.rateLimitTitle') }}
              </h4>
            </div>

            <div class="space-y-2">
              <div class="grid grid-cols-1 gap-2 lg:grid-cols-3">
                <div>
                  <label class="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">{{
                    $t('apiKeys.createApiKeyModal.rateLimitWindow')
                  }}</label>
                  <input
                    v-model="form.rateLimitWindow"
                    class="form-input w-full border-gray-300 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
                    min="1"
                    :placeholder="$t('apiKeys.createApiKeyModal.rateLimitWindowPlaceholder')"
                    type="number"
                  />
                  <p class="ml-2 mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    {{ $t('apiKeys.createApiKeyModal.rateLimitWindowHint') }}
                  </p>
                </div>

                <div>
                  <label class="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">{{
                    $t('apiKeys.createApiKeyModal.rateLimitRequests')
                  }}</label>
                  <input
                    v-model="form.rateLimitRequests"
                    class="form-input w-full border-gray-300 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
                    min="1"
                    :placeholder="$t('apiKeys.createApiKeyModal.rateLimitRequestsPlaceholder')"
                    type="number"
                  />
                  <p class="ml-2 mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    {{ $t('apiKeys.createApiKeyModal.rateLimitRequestsHint') }}
                  </p>
                </div>

                <div>
                  <label class="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">{{
                    $t('apiKeys.createApiKeyModal.rateLimitCost')
                  }}</label>
                  <input
                    v-model="form.rateLimitCost"
                    class="form-input w-full border-gray-300 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
                    min="0"
                    :placeholder="$t('apiKeys.createApiKeyModal.rateLimitCostPlaceholder')"
                    step="0.01"
                    type="number"
                  />
                  <p class="ml-2 mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    {{ $t('apiKeys.createApiKeyModal.rateLimitCostHint') }}
                  </p>
                </div>
              </div>

              <!-- 示例说明 -->
              <div class="rounded-lg bg-blue-100 p-2 dark:bg-blue-900/30">
                <h5 class="mb-1 text-xs font-semibold text-blue-800 dark:text-blue-400">
                  {{ $t('apiKeys.createApiKeyModal.exampleTitle') }}
                </h5>
                <div class="space-y-0.5 text-xs text-blue-700 dark:text-blue-300">
                  <div>
                    <strong>{{ $t('apiKeys.createApiKeyModal.example1') }}</strong>
                  </div>
                  <div>
                    <strong>{{ $t('apiKeys.createApiKeyModal.example2') }}</strong>
                  </div>
                  <div>
                    <strong>{{ $t('apiKeys.createApiKeyModal.example3') }}</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div>
            <label class="mb-2 block text-sm font-semibold text-gray-700 dark:text-gray-300">{{
              $t('apiKeys.createApiKeyModal.dailyCostLimit')
            }}</label>
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
                  {{ $t('apiKeys.createApiKeyModal.custom') }}
                </button>
              </div>
              <input
                v-model="form.dailyCostLimit"
                class="form-input w-full border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
                min="0"
                :placeholder="$t('apiKeys.createApiKeyModal.dailyCostLimitPlaceholder')"
                step="0.01"
                type="number"
              />
              <p class="text-xs text-gray-500 dark:text-gray-400">
                {{ $t('apiKeys.createApiKeyModal.dailyCostHint') }}
              </p>
            </div>
          </div>

          <div>
            <label class="mb-2 block text-sm font-semibold text-gray-700 dark:text-gray-300">{{
              $t('apiKeys.createApiKeyModal.weeklyOpusCostLimit')
            }}</label>
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
                  {{ $t('apiKeys.createApiKeyModal.custom') }}
                </button>
              </div>
              <input
                v-model="form.weeklyOpusCostLimit"
                class="form-input w-full border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
                min="0"
                :placeholder="$t('apiKeys.createApiKeyModal.weeklyOpusCostLimitPlaceholder')"
                step="0.01"
                type="number"
              />
              <p class="text-xs text-gray-500 dark:text-gray-400">
                {{ $t('apiKeys.createApiKeyModal.weeklyOpusHint') }}
              </p>
            </div>
          </div>

          <div>
            <label class="mb-2 block text-sm font-semibold text-gray-700 dark:text-gray-300">{{
              $t('apiKeys.createApiKeyModal.concurrencyLimit')
            }}</label>
            <input
              v-model="form.concurrencyLimit"
              class="form-input w-full border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
              min="0"
              :placeholder="$t('apiKeys.createApiKeyModal.concurrencyLimitPlaceholder')"
              type="number"
            />
            <p class="mt-2 text-xs text-gray-500 dark:text-gray-400">
              {{ $t('apiKeys.createApiKeyModal.concurrencyHint') }}
            </p>
          </div>

          <div>
            <label class="mb-2 block text-sm font-semibold text-gray-700 dark:text-gray-300">{{
              $t('apiKeys.createApiKeyModal.description')
            }}</label>
            <textarea
              v-model="form.description"
              class="form-input w-full resize-none border-gray-300 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
              :placeholder="$t('apiKeys.createApiKeyModal.descriptionPlaceholder')"
              rows="2"
            />
          </div>

          <div>
            <label class="mb-2 block text-sm font-semibold text-gray-700 dark:text-gray-300">{{
              $t('apiKeys.createApiKeyModal.expirationSettings')
            }}</label>
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
                  <span class="text-sm text-gray-700 dark:text-gray-300">{{
                    $t('apiKeys.createApiKeyModal.fixedTimeExpiry')
                  }}</span>
                </label>
                <label class="flex cursor-pointer items-center">
                  <input
                    v-model="form.expirationMode"
                    class="mr-2 text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700"
                    type="radio"
                    value="activation"
                  />
                  <span class="text-sm text-gray-700 dark:text-gray-300">{{
                    $t('apiKeys.createApiKeyModal.activationExpiry')
                  }}</span>
                </label>
              </div>
              <p class="mt-2 text-xs text-gray-500 dark:text-gray-400">
                <span v-if="form.expirationMode === 'fixed'">
                  <i class="fas fa-info-circle mr-1" />
                  {{ $t('apiKeys.createApiKeyModal.fixedModeHint') }}
                </span>
                <span v-else>
                  <i class="fas fa-info-circle mr-1" />
                  {{ $t('apiKeys.createApiKeyModal.activationModeHint') }}
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
                <option value="">{{ $t('apiKeys.createApiKeyModal.neverExpire') }}</option>
                <option value="1d">{{ $t('apiKeys.createApiKeyModal.1d') }}</option>
                <option value="7d">{{ $t('apiKeys.createApiKeyModal.7d') }}</option>
                <option value="30d">{{ $t('apiKeys.createApiKeyModal.30d') }}</option>
                <option value="90d">{{ $t('apiKeys.createApiKeyModal.90d') }}</option>
                <option value="180d">{{ $t('apiKeys.createApiKeyModal.180d') }}</option>
                <option value="365d">{{ $t('apiKeys.createApiKeyModal.365d') }}</option>
                <option value="custom">{{ $t('apiKeys.createApiKeyModal.customDate') }}</option>
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
                {{
                  $t('apiKeys.createApiKeyModal.willExpireOn', {
                    date: formatExpireDate(form.expiresAt)
                  })
                }}
              </p>
            </div>

            <!-- 激活模式 -->
            <div v-else>
              <div class="flex items-center gap-2">
                <input
                  v-model.number="form.activationDays"
                  class="form-input flex-1 border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
                  max="3650"
                  min="1"
                  :placeholder="$t('apiKeys.createApiKeyModal.activationDays')"
                  type="number"
                />
                <span class="text-sm text-gray-600 dark:text-gray-400">{{
                  $t('apiKeys.createApiKeyModal.daysUnit')
                }}</span>
              </div>
              <div class="mt-2 flex flex-wrap gap-2">
                <button
                  v-for="days in [30, 90, 180, 365]"
                  :key="days"
                  class="rounded-md border border-gray-300 px-3 py-1 text-xs hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-700"
                  type="button"
                  @click="form.activationDays = days"
                >
                  {{ days }}{{ $t('apiKeys.createApiKeyModal.daysUnit') }}
                </button>
              </div>
              <p class="mt-2 text-xs text-gray-500 dark:text-gray-400">
                <i class="fas fa-clock mr-1" />
                {{
                  $t('apiKeys.createApiKeyModal.activationHint', {
                    days: form.activationDays || 30
                  })
                }}
              </p>
            </div>
          </div>

          <div>
            <label class="mb-2 block text-sm font-semibold text-gray-700 dark:text-gray-300">{{
              $t('apiKeys.createApiKeyModal.servicePermissions')
            }}</label>
            <div class="flex gap-4">
              <label class="flex cursor-pointer items-center">
                <input
                  v-model="form.permissions"
                  class="mr-2 text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700"
                  type="radio"
                  value="all"
                />
                <span class="text-sm text-gray-700 dark:text-gray-300">{{
                  $t('apiKeys.createApiKeyModal.allServices')
                }}</span>
              </label>
              <label class="flex cursor-pointer items-center">
                <input
                  v-model="form.permissions"
                  class="mr-2 text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700"
                  type="radio"
                  value="claude"
                />
                <span class="text-sm text-gray-700 dark:text-gray-300">{{
                  $t('apiKeys.createApiKeyModal.claudeOnly')
                }}</span>
              </label>
              <label class="flex cursor-pointer items-center">
                <input
                  v-model="form.permissions"
                  class="mr-2 text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700"
                  type="radio"
                  value="gemini"
                />
                <span class="text-sm text-gray-700 dark:text-gray-300">{{
                  $t('apiKeys.createApiKeyModal.geminiOnly')
                }}</span>
              </label>
              <label class="flex cursor-pointer items-center">
                <input
                  v-model="form.permissions"
                  class="mr-2 text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700"
                  type="radio"
                  value="openai"
                />
                <span class="text-sm text-gray-700 dark:text-gray-300">{{
                  $t('apiKeys.createApiKeyModal.openaiOnly')
                }}</span>
              </label>
            </div>
            <p class="mt-2 text-xs text-gray-500 dark:text-gray-400">
              {{ $t('apiKeys.createApiKeyModal.permissionHint') }}
            </p>
          </div>

          <div>
            <div class="mb-2 flex items-center justify-between">
              <label class="text-sm font-semibold text-gray-700 dark:text-gray-300">{{
                $t('apiKeys.createApiKeyModal.dedicatedAccountBinding')
              }}</label>
              <button
                class="flex items-center gap-1 text-sm text-blue-600 transition-colors hover:text-blue-800 disabled:cursor-not-allowed disabled:opacity-50 dark:text-blue-400 dark:hover:text-blue-300"
                :disabled="accountsLoading"
                title="{{ $t('apiKeys.createApiKeyModal.refreshAccounts') }}"
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
                <span>{{
                  accountsLoading
                    ? $t('apiKeys.createApiKeyModal.refreshing')
                    : $t('apiKeys.createApiKeyModal.refreshAccounts')
                }}</span>
              </button>
            </div>
            <div class="grid grid-cols-1 gap-3">
              <div>
                <label class="mb-1 block text-sm font-medium text-gray-600 dark:text-gray-400">{{
                  $t('apiKeys.createApiKeyModal.claudeDedicatedAccount')
                }}</label>
                <AccountSelector
                  v-model="form.claudeAccountId"
                  :accounts="localAccounts.claude"
                  :default-option-text="$t('apiKeys.createApiKeyModal.useSharedPool')"
                  :disabled="form.permissions === 'gemini' || form.permissions === 'openai'"
                  :groups="localAccounts.claudeGroups"
                  :placeholder="$t('apiKeys.createApiKeyModal.selectClaudeAccount')"
                  platform="claude"
                />
              </div>
              <div>
                <label class="mb-1 block text-sm font-medium text-gray-600 dark:text-gray-400">{{
                  $t('apiKeys.createApiKeyModal.geminiDedicatedAccount')
                }}</label>
                <AccountSelector
                  v-model="form.geminiAccountId"
                  :accounts="localAccounts.gemini"
                  :default-option-text="$t('apiKeys.createApiKeyModal.useSharedPool')"
                  :disabled="form.permissions === 'claude' || form.permissions === 'openai'"
                  :groups="localAccounts.geminiGroups"
                  :placeholder="$t('apiKeys.createApiKeyModal.selectGeminiAccount')"
                  platform="gemini"
                />
              </div>
              <div>
                <label class="mb-1 block text-sm font-medium text-gray-600 dark:text-gray-400">{{
                  $t('apiKeys.createApiKeyModal.openaiDedicatedAccount')
                }}</label>
                <AccountSelector
                  v-model="form.openaiAccountId"
                  :accounts="localAccounts.openai"
                  :default-option-text="$t('apiKeys.createApiKeyModal.useSharedPool')"
                  :disabled="form.permissions === 'claude' || form.permissions === 'gemini'"
                  :groups="localAccounts.openaiGroups"
                  :placeholder="$t('apiKeys.createApiKeyModal.selectOpenaiAccount')"
                  platform="openai"
                />
              </div>
              <div>
                <label class="mb-1 block text-sm font-medium text-gray-600 dark:text-gray-400">{{
                  $t('apiKeys.createApiKeyModal.bedrockDedicatedAccount')
                }}</label>
                <AccountSelector
                  v-model="form.bedrockAccountId"
                  :accounts="localAccounts.bedrock"
                  :default-option-text="$t('apiKeys.createApiKeyModal.useSharedPool')"
                  :disabled="form.permissions === 'gemini' || form.permissions === 'openai'"
                  :groups="[]"
                  :placeholder="$t('apiKeys.createApiKeyModal.selectBedrockAccount')"
                  platform="bedrock"
                />
              </div>
            </div>
            <p class="mt-2 text-xs text-gray-500 dark:text-gray-400">
              {{ $t('apiKeys.createApiKeyModal.accountBindingHint') }}
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
                {{ $t('apiKeys.createApiKeyModal.enableModelRestriction') }}
              </label>
            </div>

            <div v-if="form.enableModelRestriction" class="space-y-3">
              <div>
                <label class="mb-2 block text-sm font-medium text-gray-600">{{
                  $t('apiKeys.createApiKeyModal.restrictedModelsList')
                }}</label>
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
                    {{ $t('apiKeys.createApiKeyModal.noRestrictedModels') }}
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
                      {{ $t('apiKeys.createApiKeyModal.allCommonModelsRestricted') }}
                    </span>
                  </div>

                  <!-- 手动输入 -->
                  <div class="flex gap-2">
                    <input
                      v-model="form.modelInput"
                      class="form-input flex-1"
                      :placeholder="$t('apiKeys.createApiKeyModal.addRestrictedModelPlaceholder')"
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
                  {{ $t('apiKeys.createApiKeyModal.modelRestrictionHint') }}
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
                {{ $t('apiKeys.createApiKeyModal.enableClientRestriction') }}
              </label>
            </div>

            <div
              v-if="form.enableClientRestriction"
              class="rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-700 dark:bg-green-900/20"
            >
              <div>
                <label class="mb-2 block text-xs font-medium text-gray-700 dark:text-gray-300">{{
                  $t('apiKeys.createApiKeyModal.allowedClients')
                }}</label>
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
              {{ $t('apiKeys.createApiKeyModal.cancel') }}
            </button>
            <button
              class="btn btn-primary flex-1 px-4 py-2.5 text-sm font-semibold"
              :disabled="loading"
              type="submit"
            >
              <div v-if="loading" class="loading-spinner mr-2" />
              <i v-else class="fas fa-plus mr-2" />
              {{
                loading
                  ? $t('apiKeys.createApiKeyModal.creating')
                  : $t('apiKeys.createApiKeyModal.create')
              }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { showToast } from '@/utils/toast'
import { useClientsStore } from '@/stores/clients'
import { useApiKeysStore } from '@/stores/apiKeys'
import { apiClient } from '@/config/api'
import AccountSelector from '@/components/common/AccountSelector.vue'

const { t } = useI18n()

const props = defineProps({
  accounts: {
    type: Object,
    default: () => ({ claude: [], gemini: [] })
  }
})

const emit = defineEmits(['close', 'success', 'batch-success'])

const clientsStore = useClientsStore()
const apiKeysStore = useApiKeysStore()
const loading = ref(false)
const accountsLoading = ref(false)
const localAccounts = ref({
  claude: [],
  gemini: [],
  openai: [],
  bedrock: [], // 添加 Bedrock 账号列表
  claudeGroups: [],
  geminiGroups: [],
  openaiGroups: []
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

// 表单数据
const form = reactive({
  createType: 'single',
  batchCount: 10,
  name: '',
  description: '',
  rateLimitWindow: '',
  rateLimitRequests: '',
  rateLimitCost: '', // 新增：费用限制
  concurrencyLimit: '',
  dailyCostLimit: '',
  weeklyOpusCostLimit: '',
  expireDuration: '',
  customExpireDate: '',
  expiresAt: null,
  expirationMode: 'fixed', // 过期模式：fixed(固定) 或 activation(激活)
  activationDays: 30, // 激活后有效天数
  permissions: 'all',
  claudeAccountId: '',
  geminiAccountId: '',
  openaiAccountId: '',
  bedrockAccountId: '', // 添加 Bedrock 账号ID
  enableModelRestriction: false,
  restrictedModels: [],
  modelInput: '',
  enableClientRestriction: false,
  allowedClients: [],
  tags: []
})

// 加载支持的客户端和已存在的标签
onMounted(async () => {
  supportedClients.value = await clientsStore.loadSupportedClients()
  availableTags.value = await apiKeysStore.fetchTags()
  // 初始化账号数据
  if (props.accounts) {
    localAccounts.value = {
      claude: props.accounts.claude || [],
      gemini: props.accounts.gemini || [],
      openai: props.accounts.openai || [],
      bedrock: props.accounts.bedrock || [], // 添加 Bedrock 账号
      claudeGroups: props.accounts.claudeGroups || [],
      geminiGroups: props.accounts.geminiGroups || [],
      openaiGroups: props.accounts.openaiGroups || []
    }
  }
})

// 刷新账号列表
const refreshAccounts = async () => {
  accountsLoading.value = true
  try {
    const [claudeData, claudeConsoleData, geminiData, openaiData, bedrockData, groupsData] =
      await Promise.all([
        apiClient.get('/admin/claude-accounts'),
        apiClient.get('/admin/claude-console-accounts'),
        apiClient.get('/admin/gemini-accounts'),
        apiClient.get('/admin/openai-accounts'),
        apiClient.get('/admin/bedrock-accounts'), // 添加 Bedrock 账号获取
        apiClient.get('/admin/account-groups')
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

    if (geminiData.success) {
      localAccounts.value.gemini = (geminiData.data || []).map((account) => ({
        ...account,
        isDedicated: account.accountType === 'dedicated' // 保留以便向后兼容
      }))
    }

    if (openaiData.success) {
      localAccounts.value.openai = (openaiData.data || []).map((account) => ({
        ...account,
        isDedicated: account.accountType === 'dedicated' // 保留以便向后兼容
      }))
    }

    if (bedrockData.success) {
      localAccounts.value.bedrock = (bedrockData.data || []).map((account) => ({
        ...account,
        isDedicated: account.accountType === 'dedicated' // 保留以便向后兼容
      }))
    }

    // 处理分组数据
    if (groupsData.success) {
      const allGroups = groupsData.data || []
      localAccounts.value.claudeGroups = allGroups.filter((g) => g.platform === 'claude')
      localAccounts.value.geminiGroups = allGroups.filter((g) => g.platform === 'gemini')
      localAccounts.value.openaiGroups = allGroups.filter((g) => g.platform === 'openai')
    }

    showToast(t('apiKeys.createApiKeyModal.refreshAccountsSuccess'), 'success')
  } catch (error) {
    showToast(t('apiKeys.createApiKeyModal.refreshAccountsFailed'), 'error')
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
  const { locale } = useI18n()
  return date.toLocaleString(
    locale.value === 'zh-cn' ? 'zh-CN' : locale.value === 'zh-tw' ? 'zh-TW' : 'en-US',
    {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }
  )
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

// 创建 API Key
const createApiKey = async () => {
  // 验证表单
  errors.value.name = ''

  if (!form.name || !form.name.trim()) {
    errors.value.name = t('apiKeys.createApiKeyModal.nameError')
    return
  }

  // 批量创建时验证数量
  if (form.createType === 'batch') {
    if (!form.batchCount || form.batchCount < 2 || form.batchCount > 500) {
      showToast(t('apiKeys.createApiKeyModal.batchCountError'), 'error')
      return
    }
  }

  // 检查是否设置了时间窗口但费用限制为0
  if (form.rateLimitWindow && (!form.rateLimitCost || parseFloat(form.rateLimitCost) === 0)) {
    let confirmed = false
    if (window.showConfirm) {
      confirmed = await window.showConfirm(
        t('apiKeys.createApiKeyModal.costLimitConfirmTitle'),
        t('apiKeys.createApiKeyModal.costLimitConfirmMessage'),
        t('apiKeys.createApiKeyModal.costLimitConfirmContinue'),
        t('apiKeys.createApiKeyModal.costLimitConfirmBack')
      )
    } else {
      // 降级方案
      confirmed = confirm(t('apiKeys.createApiKeyModal.costLimitFallbackMessage'))
    }
    if (!confirmed) {
      return
    }
  }

  loading.value = true

  try {
    // 准备提交的数据
    const baseData = {
      description: form.description || undefined,
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
      weeklyOpusCostLimit:
        form.weeklyOpusCostLimit !== '' && form.weeklyOpusCostLimit !== null
          ? parseFloat(form.weeklyOpusCostLimit)
          : 0,
      expiresAt: form.expirationMode === 'fixed' ? form.expiresAt || undefined : undefined,
      expirationMode: form.expirationMode,
      activationDays: form.expirationMode === 'activation' ? form.activationDays : undefined,
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

    if (form.createType === 'single') {
      // 单个创建
      const data = {
        ...baseData,
        name: form.name
      }

      const result = await apiClient.post('/admin/api-keys', data)

      if (result.success) {
        showToast(t('apiKeys.createApiKeyModal.createSuccess'), 'success')
        emit('success', result.data)
        emit('close')
      } else {
        showToast(result.message || t('apiKeys.createApiKeyModal.createFailed'), 'error')
      }
    } else {
      // 批量创建
      const data = {
        ...baseData,
        createType: 'batch',
        baseName: form.name,
        count: form.batchCount
      }

      const result = await apiClient.post('/admin/api-keys/batch', data)

      if (result.success) {
        showToast(
          t('apiKeys.createApiKeyModal.batchCreateSuccess', { count: result.data.length }),
          'success'
        )
        emit('batch-success', result.data)
        emit('close')
      } else {
        showToast(result.message || t('apiKeys.createApiKeyModal.batchCreateFailed'), 'error')
      }
    }
  } catch (error) {
    showToast(t('apiKeys.createApiKeyModal.createFailed'), 'error')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
/* 表单样式由全局样式提供 */
</style>
