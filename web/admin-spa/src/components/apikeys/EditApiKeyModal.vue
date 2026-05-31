<template>
  <Teleport to="body">
    <div class="modal fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <div
        class="modal-content mx-auto flex max-h-[90vh] w-full max-w-4xl flex-col p-4 sm:p-6 md:p-8"
      >
        <div class="mb-4 flex items-center justify-between sm:mb-6">
          <div class="flex items-center gap-2 sm:gap-3">
            <div
              class="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 sm:h-10 sm:w-10 sm:rounded-xl"
            >
              <i class="fas fa-edit text-sm text-white sm:text-base" />
            </div>
            <h3 class="text-lg font-bold text-gray-900 dark:text-gray-100 sm:text-xl">
              {{ t('apiKeyForm.editTitle') }}
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
          class="modal-scroll-content custom-scrollbar flex-1 space-y-4 sm:space-y-6"
          @submit.prevent="updateApiKey"
        >
          <div>
            <label
              class="mb-1.5 block text-xs font-semibold text-gray-700 dark:text-gray-300 sm:mb-3 sm:text-sm"
              >{{ t('apiKeyForm.name') }}</label
            >
            <div>
              <input
                v-model="form.name"
                class="form-input flex-1 border-gray-300 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
                maxlength="100"
                :placeholder="t('apiKeyForm.nameRequiredPlaceholder')"
                required
                type="text"
              />
            </div>
            <p class="mt-1 text-xs text-gray-500 dark:text-gray-400 sm:mt-2">
              {{ t('apiKeyForm.nameHelp') }}
            </p>
          </div>

          <!-- 服务倍率设置 -->
          <div
            class="rounded-lg border border-purple-200 bg-gradient-to-r from-purple-50 to-indigo-50 p-3 dark:border-purple-700 dark:from-purple-900/20 dark:to-indigo-900/20 sm:p-4"
          >
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <input
                  id="editEnableServiceRates"
                  v-model="enableServiceRates"
                  class="h-4 w-4 rounded border-gray-300 bg-gray-100 text-purple-600 focus:ring-purple-500"
                  type="checkbox"
                />
                <label
                  class="cursor-pointer text-sm font-semibold text-gray-700 dark:text-gray-300"
                  for="editEnableServiceRates"
                >
                  {{ t('apiKeyForm.customServiceRates') }}
                </label>
              </div>
              <span class="text-xs text-gray-500 dark:text-gray-400">
                {{ t('apiKeyForm.serviceRatesHint') }}
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
                <span class="text-xs text-gray-400">{{ t('apiKeyForm.defaultRate') }}</span>
              </div>
            </div>
          </div>

          <!-- 所有者选择 -->
          <div>
            <label
              class="mb-1.5 block text-xs font-semibold text-gray-700 dark:text-gray-300 sm:mb-3 sm:text-sm"
              >{{ t('apiKeyForm.owner') }}</label
            >
            <select
              v-model="form.ownerId"
              class="form-input w-full border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
            >
              <option v-for="user in availableUsers" :key="user.id" :value="user.id">
                {{ user.displayName }} ({{ user.username }})
                <span v-if="user.role === 'admin'" class="text-gray-500"
                  >- {{ t('apiKeys.admin') }}</span
                >
              </option>
            </select>
            <p class="mt-1 text-xs text-gray-500 dark:text-gray-400 sm:mt-2">
              {{ t('apiKeyForm.ownerHint') }}
            </p>
          </div>

          <!-- 标签 -->
          <div>
            <label
              class="mb-1.5 block text-xs font-semibold text-gray-700 dark:text-gray-300 sm:mb-3 sm:text-sm"
              >{{ t('apiKeyForm.tags') }}</label
            >
            <div class="space-y-4">
              <!-- 已选择的标签 -->
              <div v-if="form.tags.length > 0">
                <div class="mb-2 text-xs font-medium text-gray-600 dark:text-gray-400">
                  {{ t('apiKeyForm.selectedTags') }}
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
                  {{ t('apiKeyForm.selectExistingTags') }}
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
                  {{ t('apiKeyForm.createNewTag') }}
                </div>
                <div class="flex gap-2">
                  <input
                    v-model="newTag"
                    class="form-input flex-1 border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
                    :placeholder="t('apiKeyForm.newTagPlaceholder')"
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
                {{ t('apiKeyForm.tagsHint') }}
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
                {{ t('apiKeyForm.rateLimitSettings') }}
              </h4>
            </div>

            <div class="space-y-2">
              <div class="grid grid-cols-1 gap-2 lg:grid-cols-3">
                <div>
                  <label class="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">{{
                    t('apiKeyForm.timeWindowMinutes')
                  }}</label>
                  <input
                    v-model="form.rateLimitWindow"
                    class="form-input w-full border-gray-300 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
                    min="1"
                    :placeholder="t('apiKeys.unlimited')"
                    type="number"
                  />
                  <p class="ml-2 mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    {{ t('apiKeyForm.timeWindowHelp') }}
                  </p>
                </div>

                <div>
                  <label class="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">{{
                    t('apiKeyForm.requestLimit')
                  }}</label>
                  <input
                    v-model="form.rateLimitRequests"
                    class="form-input w-full border-gray-300 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
                    min="1"
                    :placeholder="t('apiKeys.unlimited')"
                    type="number"
                  />
                  <p class="ml-2 mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    {{ t('apiKeyForm.maxRequestsInWindow') }}
                  </p>
                </div>

                <div>
                  <label class="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">{{
                    t('apiKeyForm.costLimitUsd')
                  }}</label>
                  <input
                    v-model="form.rateLimitCost"
                    class="form-input w-full border-gray-300 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
                    min="0"
                    :placeholder="t('apiKeys.unlimited')"
                    step="0.01"
                    type="number"
                  />
                  <p class="ml-2 mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    {{ t('apiKeyForm.maxCostInWindow') }}
                  </p>
                </div>
              </div>

              <!-- 示例说明 -->
              <div class="rounded-lg bg-blue-100 p-2 dark:bg-blue-900/30">
                <h5 class="mb-1 text-xs font-semibold text-blue-800 dark:text-blue-400">
                  {{ t('apiKeyForm.examplesTitle') }}
                </h5>
                <div class="space-y-0.5 text-xs text-blue-700 dark:text-blue-300">
                  <div>
                    <strong>{{ t('apiKeyForm.example1Label') }}</strong>
                    {{ t('apiKeyForm.example1') }}
                  </div>
                  <div>
                    <strong>{{ t('apiKeyForm.example2Label') }}</strong>
                    {{ t('apiKeyForm.example2') }}
                  </div>
                  <div>
                    <strong>{{ t('apiKeyForm.example3Label') }}</strong>
                    {{ t('apiKeyForm.example3') }}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div>
            <label class="mb-3 block text-sm font-semibold text-gray-700 dark:text-gray-300">{{
              t('apiKeyForm.dailyCostLimitUsd')
            }}</label>
            <div class="space-y-3">
              <div class="flex gap-2">
                <button
                  class="rounded-lg bg-gray-100 px-3 py-1 text-sm font-medium hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                  type="button"
                  @click="form.dailyCostLimit = '50'"
                >
                  $50
                </button>
                <button
                  class="rounded-lg bg-gray-100 px-3 py-1 text-sm font-medium hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                  type="button"
                  @click="form.dailyCostLimit = '100'"
                >
                  $100
                </button>
                <button
                  class="rounded-lg bg-gray-100 px-3 py-1 text-sm font-medium hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                  type="button"
                  @click="form.dailyCostLimit = '200'"
                >
                  $200
                </button>
                <button
                  class="rounded-lg bg-gray-100 px-3 py-1 text-sm font-medium hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                  type="button"
                  @click="form.dailyCostLimit = ''"
                >
                  {{ t('apiKeyForm.custom') }}
                </button>
              </div>
              <input
                v-model="form.dailyCostLimit"
                class="form-input w-full border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
                min="0"
                :placeholder="t('apiKeyForm.zeroMeansUnlimited')"
                step="0.01"
                type="number"
              />
              <p class="text-xs text-gray-500 dark:text-gray-400">
                {{ t('apiKeyForm.dailyCostHelp') }}
              </p>
            </div>
          </div>

          <div>
            <label class="mb-3 block text-sm font-semibold text-gray-700 dark:text-gray-300">{{
              t('apiKeyForm.totalCostLimitUsd')
            }}</label>
            <div class="space-y-3">
              <div class="flex gap-2">
                <button
                  class="rounded-lg bg-gray-100 px-3 py-1 text-sm font-medium hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                  type="button"
                  @click="form.totalCostLimit = '100'"
                >
                  $100
                </button>
                <button
                  class="rounded-lg bg-gray-100 px-3 py-1 text-sm font-medium hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                  type="button"
                  @click="form.totalCostLimit = '500'"
                >
                  $500
                </button>
                <button
                  class="rounded-lg bg-gray-100 px-3 py-1 text-sm font-medium hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                  type="button"
                  @click="form.totalCostLimit = '1000'"
                >
                  $1000
                </button>
                <button
                  class="rounded-lg bg-gray-100 px-3 py-1 text-sm font-medium hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                  type="button"
                  @click="form.totalCostLimit = ''"
                >
                  {{ t('apiKeyForm.custom') }}
                </button>
              </div>
              <input
                v-model="form.totalCostLimit"
                class="form-input w-full border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
                min="0"
                :placeholder="t('apiKeyForm.zeroMeansUnlimited')"
                step="0.01"
                type="number"
              />
              <p class="text-xs text-gray-500 dark:text-gray-400">
                {{ t('apiKeyForm.totalCostHelp') }}
              </p>
            </div>
          </div>

          <div>
            <label class="mb-3 block text-sm font-semibold text-gray-700 dark:text-gray-300">{{
              t('apiKeyForm.weeklyClaudeCostLimitUsd')
            }}</label>
            <div class="space-y-3">
              <div class="flex gap-2">
                <button
                  class="rounded-lg bg-gray-100 px-3 py-1 text-sm font-medium hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                  type="button"
                  @click="form.weeklyOpusCostLimit = '100'"
                >
                  $100
                </button>
                <button
                  class="rounded-lg bg-gray-100 px-3 py-1 text-sm font-medium hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                  type="button"
                  @click="form.weeklyOpusCostLimit = '500'"
                >
                  $500
                </button>
                <button
                  class="rounded-lg bg-gray-100 px-3 py-1 text-sm font-medium hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                  type="button"
                  @click="form.weeklyOpusCostLimit = '1000'"
                >
                  $1000
                </button>
                <button
                  class="rounded-lg bg-gray-100 px-3 py-1 text-sm font-medium hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                  type="button"
                  @click="form.weeklyOpusCostLimit = ''"
                >
                  {{ t('apiKeyForm.custom') }}
                </button>
              </div>
              <input
                v-model="form.weeklyOpusCostLimit"
                class="form-input w-full border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
                min="0"
                :placeholder="t('apiKeyForm.zeroMeansUnlimited')"
                step="0.01"
                type="number"
              />
              <p class="text-xs text-gray-500 dark:text-gray-400">
                {{ t('apiKeyForm.weeklyClaudeCostHelp') }}
              </p>
              <div
                v-if="form.weeklyOpusCostLimit && Number(form.weeklyOpusCostLimit) > 0"
                class="mt-3 flex gap-3"
              >
                <div class="flex-1">
                  <label class="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">{{
                    t('apiKeyForm.resetDay')
                  }}</label>
                  <select
                    v-model="form.weeklyResetDay"
                    class="form-input w-full border-gray-300 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
                  >
                    <option :value="1">{{ t('apiKeyForm.weekdays.mon') }}</option>
                    <option :value="2">{{ t('apiKeyForm.weekdays.tue') }}</option>
                    <option :value="3">{{ t('apiKeyForm.weekdays.wed') }}</option>
                    <option :value="4">{{ t('apiKeyForm.weekdays.thu') }}</option>
                    <option :value="5">{{ t('apiKeyForm.weekdays.fri') }}</option>
                    <option :value="6">{{ t('apiKeyForm.weekdays.sat') }}</option>
                    <option :value="7">{{ t('apiKeyForm.weekdays.sun') }}</option>
                  </select>
                </div>
                <div class="flex-1">
                  <label class="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">{{
                    t('apiKeyForm.resetTimeUtc8')
                  }}</label>
                  <select
                    v-model="form.weeklyResetHour"
                    class="form-input w-full border-gray-300 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
                  >
                    <option v-for="h in 24" :key="h - 1" :value="h - 1">
                      {{ String(h - 1).padStart(2, '0') }}:00
                    </option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          <div>
            <label class="mb-3 block text-sm font-semibold text-gray-700 dark:text-gray-300">{{
              t('apiKeyForm.concurrencyLimitShort')
            }}</label>
            <input
              v-model="form.concurrencyLimit"
              class="form-input w-full border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
              min="0"
              :placeholder="t('apiKeyForm.zeroMeansUnlimited')"
              type="number"
            />
            <p class="mt-2 text-xs text-gray-500 dark:text-gray-400">
              {{ t('apiKeyForm.concurrencyHelpShort') }}
            </p>
          </div>

          <!-- 激活账号 -->
          <div>
            <div class="mb-3 flex items-center">
              <input
                id="editIsActive"
                v-model="form.isActive"
                class="h-4 w-4 rounded border-gray-300 bg-gray-100 text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700"
                type="checkbox"
              />
              <label
                class="ml-2 cursor-pointer text-sm font-semibold text-gray-700 dark:text-gray-300"
                for="editIsActive"
              >
                {{ t('apiKeyForm.activeAccount') }}
              </label>
            </div>
            <p class="mb-4 text-xs text-gray-500 dark:text-gray-400">
              {{ t('apiKeyForm.activeAccountHint') }}
            </p>
          </div>

          <div>
            <label class="mb-3 block text-sm font-semibold text-gray-700 dark:text-gray-300">{{
              t('apiKeyForm.servicePermissions')
            }}</label>
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
              {{ t('apiKeyForm.servicePermissionsHint') }}
            </p>
          </div>

          <div
            class="rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-700 dark:bg-emerald-900/20"
          >
            <div class="mb-3 flex items-center gap-2">
              <div
                class="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded bg-emerald-500"
              >
                <i class="fas fa-sliders-h text-xs text-white" />
              </div>
              <h4 class="text-sm font-semibold text-gray-800 dark:text-gray-200">
                {{ t('apiKeyForm.openaiResponsesHandling') }}
              </h4>
            </div>

            <div class="space-y-3">
              <label class="flex cursor-pointer items-start gap-3">
                <input
                  v-model="form.enableOpenAIResponsesCodexAdaptation"
                  class="mt-0.5 h-4 w-4 rounded border-gray-300 bg-gray-100 text-emerald-600 focus:ring-emerald-500"
                  type="checkbox"
                />
                <span class="flex-1">
                  <span class="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    <span class="inline-flex items-center gap-1">
                      <span>{{ t('apiKeyForm.codexAdaptation') }}</span>
                      <el-tooltip placement="top">
                        <template #content>
                          <div class="w-[250px] space-y-2 text-xs leading-relaxed">
                            <div>{{ t('apiKeyForm.codexAdaptationTip1') }}</div>
                            <div>
                              {{ t('apiKeyForm.codexAdaptationTip2') }}
                            </div>
                            <div>
                              {{ t('apiKeyForm.codexAdaptationTip3') }}
                            </div>
                          </div>
                        </template>
                        <span class="inline-flex" @click.stop.prevent>
                          <i
                            class="fas fa-question-circle cursor-help text-xs text-gray-400 hover:text-gray-600"
                          />
                        </span>
                      </el-tooltip>
                    </span>
                  </span>
                </span>
              </label>

              <label class="flex cursor-pointer items-start gap-3">
                <input
                  v-model="form.enableOpenAIResponsesPayloadRules"
                  class="mt-0.5 h-4 w-4 rounded border-gray-300 bg-gray-100 text-emerald-600 focus:ring-emerald-500"
                  type="checkbox"
                />
                <span class="flex-1">
                  <span class="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    <span class="inline-flex items-center gap-1">
                      <span>{{ t('apiKeyForm.enablePayloadRules') }}</span>
                      <el-tooltip placement="top">
                        <template #content>
                          <div class="w-[240px] space-y-2 text-xs leading-relaxed">
                            <div>{{ t('apiKeyForm.payloadRulesTip1') }}</div>
                            <div>{{ t('apiKeyForm.payloadRulesTip2') }}</div>
                          </div>
                        </template>
                        <span class="inline-flex" @click.stop.prevent>
                          <i
                            class="fas fa-question-circle cursor-help text-xs text-gray-400 hover:text-gray-600"
                          />
                        </span>
                      </el-tooltip>
                    </span>
                  </span>
                </span>
              </label>

              <div
                v-if="form.enableOpenAIResponsesPayloadRules"
                class="rounded-lg border border-emerald-100 bg-white/70 p-3 dark:border-emerald-800 dark:bg-gray-800/40"
              >
                <div class="mb-3 flex items-center justify-between">
                  <div
                    class="flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300"
                  >
                    <span>{{ t('apiKeyForm.payloadRules') }}</span>
                    <el-tooltip placement="top">
                      <template #content>
                        <div class="w-[240px] space-y-2 text-xs leading-relaxed">
                          <div>{{ t('apiKeyForm.payloadRulesOrderTip') }}</div>
                          <div>{{ t('apiKeyForm.payloadRulesCombinedTip') }}</div>
                        </div>
                      </template>
                      <span class="inline-flex" @click.stop.prevent>
                        <i
                          class="fas fa-question-circle cursor-help text-xs text-gray-400 hover:text-gray-600"
                        />
                      </span>
                    </el-tooltip>
                  </div>
                  <button
                    class="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-600"
                    type="button"
                    @click="addPayloadRule"
                  >
                    <i class="fas fa-plus mr-1" />
                    {{ t('apiKeyForm.addRule') }}
                  </button>
                </div>

                <div class="space-y-3">
                  <div
                    v-for="(rule, index) in form.openaiResponsesPayloadRules"
                    :key="`payload-rule-${index}`"
                    class="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/70"
                  >
                    <div class="mb-3 flex items-center justify-between">
                      <span class="text-xs font-medium uppercase tracking-wide text-gray-500">
                        {{ t('apiKeyForm.ruleNumber', { count: index + 1 }) }}
                      </span>
                      <button
                        class="text-sm text-red-500 transition-colors hover:text-red-600"
                        type="button"
                        @click="removePayloadRule(index)"
                      >
                        <i class="fas fa-trash-alt" />
                      </button>
                    </div>

                    <div class="grid grid-cols-1 gap-3 lg:grid-cols-2">
                      <div>
                        <label
                          class="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400"
                        >
                          {{ t('apiKeyForm.fieldPath') }}
                        </label>
                        <input
                          v-model="rule.path"
                          class="form-input w-full border-gray-300 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
                          :placeholder="t('apiKeyForm.fieldPathPlaceholder')"
                          type="text"
                        />
                      </div>

                      <div>
                        <label
                          class="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400"
                        >
                          {{ t('apiKeyForm.valueType') }}
                        </label>
                        <select
                          v-model="rule.valueType"
                          class="form-input w-full border-gray-300 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
                        >
                          <option
                            v-for="option in payloadRuleValueTypeOptions"
                            :key="option.value"
                            :value="option.value"
                          >
                            {{ option.label }}
                          </option>
                        </select>
                      </div>
                    </div>

                    <div class="mt-3">
                      <label
                        class="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400"
                      >
                        {{ t('apiKeyForm.value') }}
                      </label>
                      <textarea
                        v-if="rule.valueType === 'json'"
                        v-model="rule.value"
                        class="form-input w-full resize-y border-gray-300 font-mono text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
                        :placeholder="t('apiKeyForm.jsonValuePlaceholder')"
                        rows="4"
                      />
                      <input
                        v-else
                        v-model="rule.value"
                        class="form-input w-full border-gray-300 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
                        :placeholder="
                          rule.valueType === 'boolean'
                            ? t('apiKeyForm.booleanValuePlaceholder')
                            : rule.valueType === 'number'
                              ? t('apiKeyForm.numberValuePlaceholder')
                              : t('apiKeyForm.emptyStringPlaceholder')
                        "
                        type="text"
                      />
                    </div>
                  </div>

                  <div
                    v-if="form.openaiResponsesPayloadRules.length === 0"
                    class="rounded-lg border border-dashed border-emerald-200 px-4 py-6 text-center text-sm text-gray-500 dark:border-emerald-800 dark:text-gray-400"
                  >
                    {{ t('apiKeyForm.noPayloadRules') }}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div>
            <div class="mb-3 flex items-center justify-between">
              <label class="text-sm font-semibold text-gray-700 dark:text-gray-300">{{
                t('apiKeyForm.dedicatedAccountBindingShort')
              }}</label>
              <button
                class="flex items-center gap-1 text-sm text-blue-600 transition-colors hover:text-blue-800 disabled:cursor-not-allowed disabled:opacity-50 dark:text-blue-400 dark:hover:text-blue-300"
                :disabled="accountsLoading"
                :title="t('apiKeyForm.refreshAccounts')"
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
                    ? t('apiKeyForm.refreshingAccounts')
                    : t('apiKeyForm.refreshAccounts')
                }}</span>
              </button>
            </div>
            <div class="grid grid-cols-1 gap-3">
              <div>
                <label class="mb-1 block text-sm font-medium text-gray-600 dark:text-gray-400">{{
                  t('apiKeyForm.claudeDedicatedAccount')
                }}</label>
                <AccountSelector
                  v-model="form.claudeAccountId"
                  :accounts="localAccounts.claude"
                  :default-option-text="t('apiKeys.useSharedPool')"
                  :disabled="form.permissions.length > 0 && !form.permissions.includes('claude')"
                  :groups="localAccounts.claudeGroups"
                  :placeholder="t('apiKeyForm.selectClaudeAccount')"
                  platform="claude"
                />
              </div>
              <div>
                <label class="mb-1 block text-sm font-medium text-gray-600 dark:text-gray-400">{{
                  t('apiKeyForm.geminiDedicatedAccount')
                }}</label>
                <AccountSelector
                  v-model="form.geminiAccountId"
                  :accounts="localAccounts.gemini"
                  :default-option-text="t('apiKeys.useSharedPool')"
                  :disabled="form.permissions.length > 0 && !form.permissions.includes('gemini')"
                  :groups="localAccounts.geminiGroups"
                  :placeholder="t('apiKeyForm.selectGeminiAccount')"
                  platform="gemini"
                />
              </div>
              <div>
                <label class="mb-1 block text-sm font-medium text-gray-600 dark:text-gray-400">{{
                  t('apiKeyForm.openaiDedicatedAccount')
                }}</label>
                <AccountSelector
                  v-model="form.openaiAccountId"
                  :accounts="localAccounts.openai"
                  :default-option-text="t('apiKeys.useSharedPool')"
                  :disabled="form.permissions.length > 0 && !form.permissions.includes('openai')"
                  :groups="localAccounts.openaiGroups"
                  :placeholder="t('apiKeyForm.selectOpenAIAccount')"
                  platform="openai"
                />
              </div>
              <div>
                <label class="mb-1 block text-sm font-medium text-gray-600 dark:text-gray-400">{{
                  t('apiKeyForm.bedrockDedicatedAccount')
                }}</label>
                <AccountSelector
                  v-model="form.bedrockAccountId"
                  :accounts="localAccounts.bedrock"
                  :default-option-text="t('apiKeys.useSharedPool')"
                  :disabled="form.permissions.length > 0 && !form.permissions.includes('claude')"
                  :groups="[]"
                  :placeholder="t('apiKeyForm.selectBedrockAccount')"
                  platform="bedrock"
                />
              </div>
              <div>
                <label class="mb-1 block text-sm font-medium text-gray-600 dark:text-gray-400">{{
                  t('apiKeyForm.droidDedicatedAccount')
                }}</label>
                <AccountSelector
                  v-model="form.droidAccountId"
                  :accounts="localAccounts.droid"
                  :default-option-text="t('apiKeys.useSharedPool')"
                  :disabled="form.permissions.length > 0 && !form.permissions.includes('droid')"
                  :groups="localAccounts.droidGroups"
                  :placeholder="t('apiKeyForm.selectDroidAccount')"
                  platform="droid"
                />
              </div>
            </div>
            <p class="mt-2 text-xs text-gray-500 dark:text-gray-400">
              {{ t('apiKeyForm.bindingRouteHint') }}
            </p>
          </div>

          <div>
            <div class="mb-3 flex items-center">
              <input
                id="editEnableModelRestriction"
                v-model="form.enableModelRestriction"
                class="h-4 w-4 rounded border-gray-300 bg-gray-100 text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700"
                type="checkbox"
              />
              <label
                class="ml-2 cursor-pointer text-sm font-semibold text-gray-700 dark:text-gray-300"
                for="editEnableModelRestriction"
              >
                {{ t('apiKeyForm.enableModelRestriction') }}
              </label>
            </div>

            <div v-if="form.enableModelRestriction" class="space-y-3">
              <div>
                <label class="mb-2 block text-sm font-medium text-gray-600 dark:text-gray-400">{{
                  t('apiKeyForm.restrictedModels')
                }}</label>
                <div
                  class="mb-3 flex min-h-[32px] flex-wrap gap-2 rounded-lg border border-gray-200 bg-gray-50 p-2 dark:border-gray-600 dark:bg-gray-700"
                >
                  <span
                    v-for="(model, index) in form.restrictedModels"
                    :key="index"
                    class="inline-flex items-center rounded-full bg-red-100 px-3 py-1 text-sm text-red-800 dark:bg-red-900/30 dark:text-red-400"
                  >
                    {{ model }}
                    <button
                      class="ml-2 text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                      type="button"
                      @click="removeRestrictedModel(index)"
                    >
                      <i class="fas fa-times text-xs" />
                    </button>
                  </span>
                  <span
                    v-if="form.restrictedModels.length === 0"
                    class="text-sm text-gray-400 dark:text-gray-500"
                  >
                    {{ t('apiKeyForm.noRestrictedModels') }}
                  </span>
                </div>
                <div class="space-y-3">
                  <!-- 快速添加按钮 -->
                  <div class="flex flex-wrap gap-2">
                    <button
                      v-for="model in availableQuickModels"
                      :key="model"
                      class="flex-shrink-0 rounded-lg bg-gray-100 px-3 py-1 text-xs text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 sm:text-sm"
                      type="button"
                      @click="quickAddRestrictedModel(model)"
                    >
                      {{ model }}
                    </button>
                    <span
                      v-if="availableQuickModels.length === 0"
                      class="text-sm italic text-gray-400 dark:text-gray-500"
                    >
                      {{ t('apiKeyForm.allCommonModelsRestricted') }}
                    </span>
                  </div>

                  <!-- 手动输入 -->
                  <div class="flex gap-2">
                    <input
                      v-model="form.modelInput"
                      class="form-input flex-1 border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
                      :placeholder="t('apiKeyForm.modelInputPlaceholder')"
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
                <p class="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  {{ t('apiKeyForm.modelRestrictionHint') }}
                </p>
              </div>
            </div>
          </div>

          <!-- 客户端限制 -->
          <div>
            <div class="mb-3 flex items-center">
              <input
                id="editEnableClientRestriction"
                v-model="form.enableClientRestriction"
                class="h-4 w-4 rounded border-gray-300 bg-gray-100 text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700"
                type="checkbox"
              />
              <label
                class="ml-2 cursor-pointer text-sm font-semibold text-gray-700 dark:text-gray-300"
                for="editEnableClientRestriction"
              >
                {{ t('apiKeyForm.enableClientRestriction') }}
              </label>
            </div>

            <div v-if="form.enableClientRestriction" class="space-y-3">
              <div>
                <label class="mb-2 block text-sm font-medium text-gray-600 dark:text-gray-400">{{
                  t('apiKeyForm.allowedClients')
                }}</label>
                <p class="mb-3 text-xs text-gray-500 dark:text-gray-400">
                  {{ t('apiKeyForm.allowedClientsHint') }}
                </p>
                <div class="space-y-2">
                  <div v-for="client in supportedClients" :key="client.id" class="flex items-start">
                    <input
                      :id="`edit_client_${client.id}`"
                      v-model="form.allowedClients"
                      class="mt-0.5 h-4 w-4 rounded border-gray-300 bg-gray-100 text-blue-600 focus:ring-blue-500"
                      type="checkbox"
                      :value="client.id"
                    />
                    <label class="ml-2 flex-1 cursor-pointer" :for="`edit_client_${client.id}`">
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

          <div class="flex gap-3 pt-4">
            <button
              class="flex-1 rounded-xl bg-gray-100 px-6 py-3 font-semibold text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
              type="button"
              @click="$emit('close')"
            >
              {{ t('common.cancel') }}
            </button>
            <button
              class="btn btn-primary flex-1 px-6 py-3 font-semibold"
              :disabled="loading"
              type="submit"
            >
              <div v-if="loading" class="loading-spinner mr-2" />
              <i v-else class="fas fa-save mr-2" />
              {{ loading ? t('common.saving') : t('apiKeyForm.saveChanges') }}
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
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { showToast } from '@/utils/tools'
import { useClientsStore } from '@/stores/clients'
import { useApiKeysStore } from '@/stores/apiKeys'
import * as httpApis from '@/utils/http_apis'
import AccountSelector from '@/components/common/AccountSelector.vue'
import ConfirmModal from '@/components/common/ConfirmModal.vue'

const props = defineProps({
  apiKey: {
    type: Object,
    required: true
  },
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
      droidGroups: [],
      openaiResponses: []
    })
  }
})

const emit = defineEmits(['close', 'success'])

const { t } = useI18n()
// const authStore = useAuthStore()
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
  confirmText: t('common.confirm'),
  cancelText: t('common.cancel')
})
const confirmResolve = ref(null)

const showConfirm = (
  title,
  message,
  confirmText = t('common.confirm'),
  cancelText = t('common.cancel'),
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

// 支持的客户端列表
const supportedClients = ref([])

// 可用用户列表
const availableUsers = ref([])

// 标签相关
const newTag = ref('')
const availableTags = ref([])

// 计算未选择的标签
const unselectedTags = computed(() => {
  return availableTags.value.filter((tag) => !form.tags.includes(tag))
})

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

const payloadRuleValueTypeOptions = [
  { value: 'string', label: t('apiKeyForm.valueTypes.string') },
  { value: 'number', label: t('apiKeyForm.valueTypes.number') },
  { value: 'boolean', label: t('apiKeyForm.valueTypes.boolean') },
  { value: 'json', label: 'JSON' }
]

const createEmptyPayloadRule = () => ({
  path: '',
  valueType: 'string',
  value: ''
})

// 表单数据
const form = reactive({
  name: '',
  serviceRates: {}, // API Key 级别服务倍率
  tokenLimit: '', // 保留用于检测历史数据
  rateLimitWindow: '',
  rateLimitRequests: '',
  rateLimitCost: '', // 新增：费用限制
  concurrencyLimit: '',
  dailyCostLimit: '',
  totalCostLimit: '',
  weeklyOpusCostLimit: '',
  weeklyResetDay: 1,
  weeklyResetHour: 0,
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
  enableOpenAIResponsesCodexAdaptation: true,
  enableOpenAIResponsesPayloadRules: false,
  openaiResponsesPayloadRules: [],
  tags: [],
  isActive: true,
  ownerId: '' // 新增：所有者ID
})

// 更新权限（数组格式，空数组=全部服务）
const updatePermissions = () => {
  // form.permissions 已经是数组，由 v-model 自动管理
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

const addPayloadRule = () => {
  form.openaiResponsesPayloadRules.push(createEmptyPayloadRule())
}

const removePayloadRule = (index) => {
  form.openaiResponsesPayloadRules.splice(index, 1)
}

const normalizePayloadRule = (rule = {}) => ({
  path: typeof rule.path === 'string' ? rule.path.trim() : '',
  valueType:
    typeof rule.valueType === 'string' &&
    payloadRuleValueTypeOptions.some((option) => option.value === rule.valueType)
      ? rule.valueType
      : 'string',
  value: rule.value === undefined || rule.value === null ? '' : String(rule.value)
})

const buildPayloadRulesForSubmit = () => {
  const normalizedRules = form.openaiResponsesPayloadRules
    .map((rule) => normalizePayloadRule(rule))
    .filter((rule) => rule.path)

  for (const rule of normalizedRules) {
    if (rule.value === '') {
      continue
    }

    if (rule.valueType === 'number') {
      if (!Number.isFinite(Number(rule.value))) {
        showToast(t('apiKeyForm.errors.invalidNumber', { path: rule.path }), 'error')
        return null
      }
      continue
    }

    if (rule.valueType === 'boolean') {
      const normalized = rule.value.trim().toLowerCase()
      if (normalized !== 'true' && normalized !== 'false') {
        showToast(t('apiKeyForm.errors.invalidBoolean', { path: rule.path }), 'error')
        return null
      }
      continue
    }

    if (rule.valueType === 'json') {
      try {
        JSON.parse(rule.value)
      } catch (error) {
        showToast(t('apiKeyForm.errors.invalidJson', { path: rule.path }), 'error')
        return null
      }
    }
  }

  return normalizedRules
}

watch(
  () => form.enableOpenAIResponsesPayloadRules,
  (enabled) => {
    if (enabled && form.openaiResponsesPayloadRules.length === 0) {
      addPayloadRule()
    }
  }
)

// 更新 API Key
const updateApiKey = async () => {
  // 检查是否设置了时间窗口但费用限制为0
  if (form.rateLimitWindow && (!form.rateLimitCost || parseFloat(form.rateLimitCost) === 0)) {
    const confirmed = await showConfirm(
      t('apiKeyForm.confirm.costLimitTitle'),
      t('apiKeyForm.confirm.costLimitMessage'),
      t('apiKeyForm.confirm.continueSave'),
      t('apiKeyForm.confirm.backToEdit'),
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

    const payloadRules = buildPayloadRulesForSubmit()
    if (payloadRules === null) {
      loading.value = false
      return
    }

    const data = {
      name: form.name, // 添加名称字段
      serviceRates: filteredServiceRates,
      tokenLimit: 0, // 清除历史token限制
      rateLimitWindow:
        form.rateLimitWindow !== '' && form.rateLimitWindow !== null
          ? parseInt(form.rateLimitWindow)
          : 0,
      rateLimitRequests:
        form.rateLimitRequests !== '' && form.rateLimitRequests !== null
          ? parseInt(form.rateLimitRequests)
          : 0,
      rateLimitCost:
        form.rateLimitCost !== '' && form.rateLimitCost !== null
          ? parseFloat(form.rateLimitCost)
          : 0,
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
      weeklyResetDay: form.weeklyResetDay,
      weeklyResetHour: form.weeklyResetHour,
      enableOpenAIResponsesCodexAdaptation: form.enableOpenAIResponsesCodexAdaptation,
      enableOpenAIResponsesPayloadRules: form.enableOpenAIResponsesPayloadRules,
      // 规则内容独立持久化，关闭开关时也要保留已保存的休眠规则。
      openaiResponsesPayloadRules: payloadRules,
      permissions: form.permissions,
      tags: form.tags
    }

    // 处理Claude账户绑定（区分OAuth和Console）
    if (form.claudeAccountId) {
      if (form.claudeAccountId.startsWith('console:')) {
        // Claude Console账户
        data.claudeConsoleAccountId = form.claudeAccountId.substring(8)
        data.claudeAccountId = null // 清空OAuth账号
      } else if (!form.claudeAccountId.startsWith('group:')) {
        // Claude OAuth账户（非分组）
        data.claudeAccountId = form.claudeAccountId
        data.claudeConsoleAccountId = null // 清空Console账号
      } else {
        // 分组
        data.claudeAccountId = form.claudeAccountId
        data.claudeConsoleAccountId = null // 清空Console账号
      }
    } else {
      // 使用共享池，清空所有绑定
      data.claudeAccountId = null
      data.claudeConsoleAccountId = null
    }

    // Gemini账户绑定
    if (form.geminiAccountId) {
      data.geminiAccountId = form.geminiAccountId
    } else {
      data.geminiAccountId = null
    }

    // OpenAI账户绑定
    if (form.openaiAccountId) {
      data.openaiAccountId = form.openaiAccountId
    } else {
      data.openaiAccountId = null
    }

    // Bedrock账户绑定
    if (form.bedrockAccountId) {
      data.bedrockAccountId = form.bedrockAccountId
    } else {
      data.bedrockAccountId = null
    }

    if (form.droidAccountId) {
      data.droidAccountId = form.droidAccountId
    } else {
      data.droidAccountId = null
    }

    // 模型限制 - 始终提交这些字段
    data.enableModelRestriction = form.enableModelRestriction
    data.restrictedModels = form.restrictedModels

    // 客户端限制 - 始终提交这些字段
    data.enableClientRestriction = form.enableClientRestriction
    data.allowedClients = form.allowedClients

    // 活跃状态
    data.isActive = form.isActive

    // 所有者
    if (form.ownerId !== undefined) {
      data.ownerId = form.ownerId
    }

    const result = await httpApis.updateApiKeyApi(props.apiKey.id, data)

    if (result.success) {
      emit('success')
      emit('close')
    } else {
      showToast(result.message || t('apiKeyForm.toast.updateFailed'), 'error')
    }
  } catch (error) {
    showToast(t('apiKeyForm.toast.updateFailed'), 'error')
  } finally {
    loading.value = false
  }
}

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
      httpApis.getGeminiApiAccountsApi(),
      httpApis.getOpenAIAccountsApi(),
      httpApis.getOpenAIResponsesAccountsApi(),
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
          isDedicated: account.accountType === 'dedicated'
        })
      })
    }

    if (openaiResponsesData.success) {
      ;(openaiResponsesData.data || []).forEach((account) => {
        openaiAccounts.push({
          ...account,
          platform: 'openai-responses',
          isDedicated: account.accountType === 'dedicated'
        })
      })
    }

    localAccounts.value.openai = openaiAccounts

    if (bedrockData.success) {
      localAccounts.value.bedrock = (bedrockData.data || []).map((account) => ({
        ...account,
        isDedicated: account.accountType === 'dedicated'
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

    showToast(t('apiKeyForm.toast.accountsRefreshed'), 'success')
  } catch (error) {
    showToast(t('apiKeyForm.toast.refreshAccountsFailed'), 'error')
  } finally {
    accountsLoading.value = false
  }
}

// 加载用户列表
const loadUsers = async () => {
  try {
    const response = await httpApis.getUsersApi()
    if (response.success) {
      availableUsers.value = response.data || []
    }
  } catch (error) {
    // console.error('Failed to load users:', error)
    availableUsers.value = [
      {
        id: 'admin',
        username: 'admin',
        displayName: 'Admin',
        email: '',
        role: 'admin'
      }
    ]
  }
}

// 初始化表单数据
onMounted(async () => {
  try {
    // 并行加载所有需要的数据
    const [clients, tags] = await Promise.all([
      clientsStore.loadSupportedClients(),
      apiKeysStore.fetchTags(),
      loadUsers()
    ])

    supportedClients.value = clients || []
    availableTags.value = tags || []
  } catch (error) {
    // console.error('Error loading initial data:', error)
    // Fallback to empty arrays if loading fails
    supportedClients.value = []
    availableTags.value = []
  }

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

  form.name = props.apiKey.name
  form.serviceRates = props.apiKey.serviceRates || {}
  enableServiceRates.value = Object.keys(form.serviceRates).length > 0

  // 处理速率限制迁移：如果有tokenLimit且没有rateLimitCost，提示用户
  form.tokenLimit = props.apiKey.tokenLimit || ''
  form.rateLimitCost = props.apiKey.rateLimitCost || ''

  // 如果有历史tokenLimit但没有rateLimitCost，提示用户需要重新设置
  if (props.apiKey.tokenLimit > 0 && !props.apiKey.rateLimitCost) {
    // 可以根据需要添加提示，或者自动迁移（这里选择让用户手动设置）
    // console.log('检测到历史Token限制，请考虑设置费用限制')
  }

  form.rateLimitWindow = props.apiKey.rateLimitWindow || ''
  form.rateLimitRequests = props.apiKey.rateLimitRequests || ''
  form.concurrencyLimit = props.apiKey.concurrencyLimit || ''
  form.dailyCostLimit = props.apiKey.dailyCostLimit || ''
  form.totalCostLimit = props.apiKey.totalCostLimit || ''
  form.weeklyOpusCostLimit = props.apiKey.weeklyOpusCostLimit || ''
  form.weeklyResetDay = props.apiKey.weeklyResetDay || 1
  form.weeklyResetHour = props.apiKey.weeklyResetHour || 0
  // 处理权限数据，兼容旧格式（字符串）和新格式（数组）
  // 有效的权限值
  const VALID_PERMS = ['claude', 'gemini', 'openai', 'droid']
  let perms = props.apiKey.permissions
  // 如果是字符串，尝试 JSON.parse（Redis 可能返回 "[]" 或 "[\"gemini\"]"）
  if (typeof perms === 'string') {
    if (perms === 'all' || perms === '') {
      perms = []
    } else if (perms.startsWith('[')) {
      try {
        perms = JSON.parse(perms)
      } catch {
        perms = VALID_PERMS.includes(perms) ? [perms] : []
      }
    } else if (perms.includes(',')) {
      // 兼容逗号分隔格式（如 "claude,openai"）
      perms = perms
        .split(',')
        .map((p) => p.trim())
        .filter((p) => VALID_PERMS.includes(p))
    } else if (VALID_PERMS.includes(perms)) {
      perms = [perms]
    } else {
      perms = []
    }
  }
  if (Array.isArray(perms)) {
    // 过滤掉无效值（如 "[]"）
    form.permissions = perms.filter((p) => VALID_PERMS.includes(p))
  } else {
    form.permissions = []
  }
  // 处理 Claude 账号（区分 OAuth 和 Console）
  if (props.apiKey.claudeConsoleAccountId) {
    form.claudeAccountId = `console:${props.apiKey.claudeConsoleAccountId}`
  } else {
    form.claudeAccountId = props.apiKey.claudeAccountId || ''
  }
  form.geminiAccountId = props.apiKey.geminiAccountId || ''

  // 处理 OpenAI 账号 - 直接使用后端传来的值（已包含 responses: 前缀）
  form.openaiAccountId = props.apiKey.openaiAccountId || ''

  form.bedrockAccountId = props.apiKey.bedrockAccountId || ''
  form.droidAccountId = props.apiKey.droidAccountId || ''
  form.restrictedModels = props.apiKey.restrictedModels || []
  form.allowedClients = props.apiKey.allowedClients || []
  form.tags = props.apiKey.tags || []
  // 从后端数据中获取实际的启用状态，强制转换为布尔值（Redis返回的是字符串）
  form.enableModelRestriction =
    props.apiKey.enableModelRestriction === true || props.apiKey.enableModelRestriction === 'true'
  form.enableClientRestriction =
    props.apiKey.enableClientRestriction === true || props.apiKey.enableClientRestriction === 'true'
  form.enableOpenAIResponsesCodexAdaptation =
    props.apiKey.enableOpenAIResponsesCodexAdaptation === undefined ||
    props.apiKey.enableOpenAIResponsesCodexAdaptation === true ||
    props.apiKey.enableOpenAIResponsesCodexAdaptation === 'true'
  form.enableOpenAIResponsesPayloadRules =
    props.apiKey.enableOpenAIResponsesPayloadRules === true ||
    props.apiKey.enableOpenAIResponsesPayloadRules === 'true'
  form.openaiResponsesPayloadRules = Array.isArray(props.apiKey.openaiResponsesPayloadRules)
    ? props.apiKey.openaiResponsesPayloadRules.map((rule) => normalizePayloadRule(rule))
    : []
  if (form.enableOpenAIResponsesPayloadRules && form.openaiResponsesPayloadRules.length === 0) {
    addPayloadRule()
  }
  // 初始化活跃状态，默认为 true（强制转换为布尔值，因为Redis返回字符串）
  form.isActive =
    props.apiKey.isActive === undefined ||
    props.apiKey.isActive === true ||
    props.apiKey.isActive === 'true'

  // 初始化所有者
  form.ownerId = props.apiKey.userId || 'admin'
})
</script>
