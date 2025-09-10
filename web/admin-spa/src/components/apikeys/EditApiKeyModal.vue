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
              {{ t('apiKeys.editApiKeyModal.title') }}
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
              >{{ t('apiKeys.editApiKeyModal.name') }}</label
            >
            <input
              v-model="form.name"
              class="form-input w-full border-gray-300 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
              maxlength="100"
              :placeholder="t('apiKeys.editApiKeyModal.namePlaceholder')"
              required
              type="text"
            />
            <p class="mt-1 text-xs text-gray-500 dark:text-gray-400 sm:mt-2">
              {{ t('apiKeys.editApiKeyModal.nameHint') }}
            </p>
          </div>

          <!-- 所有者选择 -->
          <div>
            <label
              class="mb-1.5 block text-xs font-semibold text-gray-700 dark:text-gray-300 sm:mb-3 sm:text-sm"
              >{{ t('apiKeys.editApiKeyModal.owner') }}</label
            >
            <select
              v-model="form.ownerId"
              class="form-input w-full border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
            >
              <option v-for="user in availableUsers" :key="user.id" :value="user.id">
                {{ user.displayName }} ({{ user.username }})
                <span v-if="user.role === 'admin'" class="text-gray-500">{{
                  t('apiKeys.editApiKeyModal.adminLabel')
                }}</span>
              </option>
            </select>
            <p class="mt-1 text-xs text-gray-500 dark:text-gray-400 sm:mt-2">
              {{ t('apiKeys.editApiKeyModal.ownerHint') }}
            </p>
          </div>

          <!-- 标签 -->
          <div>
            <label
              class="mb-1.5 block text-xs font-semibold text-gray-700 dark:text-gray-300 sm:mb-3 sm:text-sm"
              >{{ t('apiKeys.editApiKeyModal.tags') }}</label
            >
            <div class="space-y-4">
              <!-- 已选择的标签 -->
              <div v-if="form.tags.length > 0">
                <div class="mb-2 text-xs font-medium text-gray-600 dark:text-gray-400">
                  {{ t('apiKeys.editApiKeyModal.selectedTags') }}
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
                  {{ t('apiKeys.editApiKeyModal.clickToSelectTags') }}
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
                  {{ t('apiKeys.editApiKeyModal.createNewTag') }}
                </div>
                <div class="flex gap-2">
                  <input
                    v-model="newTag"
                    class="form-input flex-1 border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
                    :placeholder="t('apiKeys.editApiKeyModal.newTagPlaceholder')"
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
                {{ t('apiKeys.editApiKeyModal.tagsHint') }}
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
                {{ t('apiKeys.editApiKeyModal.rateLimitTitle') }}
              </h4>
            </div>

            <div class="space-y-2">
              <div class="grid grid-cols-1 gap-2 lg:grid-cols-3">
                <div>
                  <label class="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">{{
                    t('apiKeys.editApiKeyModal.rateLimitWindow')
                  }}</label>
                  <input
                    v-model="form.rateLimitWindow"
                    class="form-input w-full border-gray-300 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
                    min="1"
                    :placeholder="t('apiKeys.editApiKeyModal.noLimit')"
                    type="number"
                  />
                  <p class="ml-2 mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    {{ t('apiKeys.editApiKeyModal.rateLimitWindowHint') }}
                  </p>
                </div>

                <div>
                  <label class="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">{{
                    t('apiKeys.editApiKeyModal.rateLimitRequests')
                  }}</label>
                  <input
                    v-model="form.rateLimitRequests"
                    class="form-input w-full border-gray-300 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
                    min="1"
                    :placeholder="t('apiKeys.editApiKeyModal.noLimit')"
                    type="number"
                  />
                  <p class="ml-2 mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    {{ t('apiKeys.editApiKeyModal.rateLimitRequestsHint') }}
                  </p>
                </div>

                <div>
                  <label class="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">{{
                    t('apiKeys.editApiKeyModal.rateLimitCost')
                  }}</label>
                  <input
                    v-model="form.rateLimitCost"
                    class="form-input w-full border-gray-300 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
                    min="0"
                    :placeholder="t('apiKeys.editApiKeyModal.noLimit')"
                    step="0.01"
                    type="number"
                  />
                  <p class="ml-2 mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    {{ t('apiKeys.editApiKeyModal.rateLimitCostHint') }}
                  </p>
                </div>
              </div>

              <!-- 示例说明 -->
              <div class="rounded-lg bg-blue-100 p-2 dark:bg-blue-900/30">
                <h5 class="mb-1 text-xs font-semibold text-blue-800 dark:text-blue-400">
                  {{ t('apiKeys.editApiKeyModal.usageExamples') }}
                </h5>
                <div class="space-y-0.5 text-xs text-blue-700 dark:text-blue-300">
                  <div>
                    <strong>{{ t('apiKeys.editApiKeyModal.example1') }}</strong>
                  </div>
                  <div>
                    <strong>{{ t('apiKeys.editApiKeyModal.example2') }}</strong>
                  </div>
                  <div>
                    <strong>{{ t('apiKeys.editApiKeyModal.example3') }}</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div>
            <label class="mb-3 block text-sm font-semibold text-gray-700 dark:text-gray-300">{{
              t('apiKeys.editApiKeyModal.dailyCostLimit')
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
                  {{ t('apiKeys.editApiKeyModal.custom') }}
                </button>
              </div>
              <input
                v-model="form.dailyCostLimit"
                class="form-input w-full border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
                min="0"
                :placeholder="t('apiKeys.editApiKeyModal.dailyCostLimitPlaceholder')"
                step="0.01"
                type="number"
              />
              <p class="text-xs text-gray-500 dark:text-gray-400">
                {{ t('apiKeys.editApiKeyModal.dailyCostHint') }}
              </p>
            </div>
          </div>

          <div>
            <label class="mb-3 block text-sm font-semibold text-gray-700 dark:text-gray-300">{{
              t('apiKeys.editApiKeyModal.weeklyOpusCostLimit')
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
                  {{ t('apiKeys.editApiKeyModal.custom') }}
                </button>
              </div>
              <input
                v-model="form.weeklyOpusCostLimit"
                class="form-input w-full border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
                min="0"
                :placeholder="t('apiKeys.editApiKeyModal.weeklyOpusCostLimitPlaceholder')"
                step="0.01"
                type="number"
              />
              <p class="text-xs text-gray-500 dark:text-gray-400">
                {{ t('apiKeys.editApiKeyModal.weeklyOpusHint') }}
              </p>
            </div>
          </div>

          <div>
            <label class="mb-3 block text-sm font-semibold text-gray-700 dark:text-gray-300">{{
              t('apiKeys.editApiKeyModal.concurrencyLimit')
            }}</label>
            <input
              v-model="form.concurrencyLimit"
              class="form-input w-full border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
              min="0"
              :placeholder="t('apiKeys.editApiKeyModal.concurrencyLimitPlaceholder')"
              type="number"
            />
            <p class="mt-2 text-xs text-gray-500 dark:text-gray-400">
              {{ t('apiKeys.editApiKeyModal.concurrencyHint') }}
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
                {{ t('apiKeys.editApiKeyModal.activeStatus') }}
              </label>
            </div>
            <p class="mb-4 text-xs text-gray-500 dark:text-gray-400">
              {{ t('apiKeys.editApiKeyModal.activeStatusHint') }}
            </p>
          </div>

          <div>
            <label class="mb-3 block text-sm font-semibold text-gray-700 dark:text-gray-300">{{
              t('apiKeys.editApiKeyModal.servicePermissions')
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
                  t('apiKeys.editApiKeyModal.allServices')
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
                  t('apiKeys.editApiKeyModal.claudeOnly')
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
                  t('apiKeys.editApiKeyModal.geminiOnly')
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
                  t('apiKeys.editApiKeyModal.openaiOnly')
                }}</span>
              </label>
            </div>
            <p class="mt-2 text-xs text-gray-500 dark:text-gray-400">
              {{ t('apiKeys.editApiKeyModal.permissionsHint') }}
            </p>
          </div>

          <div>
            <div class="mb-3 flex items-center justify-between">
              <label class="text-sm font-semibold text-gray-700 dark:text-gray-300">{{
                t('apiKeys.editApiKeyModal.accountBinding')
              }}</label>
              <button
                class="flex items-center gap-1 text-sm text-blue-600 transition-colors hover:text-blue-800 disabled:cursor-not-allowed disabled:opacity-50 dark:text-blue-400 dark:hover:text-blue-300"
                :disabled="accountsLoading"
                :title="t('apiKeys.editApiKeyModal.refreshAccounts')"
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
                    ? t('apiKeys.editApiKeyModal.refreshing')
                    : t('apiKeys.editApiKeyModal.refreshAccounts')
                }}</span>
              </button>
            </div>
            <div class="grid grid-cols-1 gap-3">
              <div>
                <label class="mb-1 block text-sm font-medium text-gray-600 dark:text-gray-400">{{
                  t('apiKeys.editApiKeyModal.claudeAccount')
                }}</label>
                <AccountSelector
                  v-model="form.claudeAccountId"
                  :accounts="localAccounts.claude"
                  :default-option-text="t('apiKeys.editApiKeyModal.useSharedPool')"
                  :disabled="form.permissions === 'gemini' || form.permissions === 'openai'"
                  :groups="localAccounts.claudeGroups"
                  :placeholder="t('apiKeys.editApiKeyModal.selectClaudeAccount')"
                  platform="claude"
                />
              </div>
              <div>
                <label class="mb-1 block text-sm font-medium text-gray-600 dark:text-gray-400">{{
                  t('apiKeys.editApiKeyModal.geminiAccount')
                }}</label>
                <AccountSelector
                  v-model="form.geminiAccountId"
                  :accounts="localAccounts.gemini"
                  :default-option-text="t('apiKeys.editApiKeyModal.useSharedPool')"
                  :disabled="form.permissions === 'claude' || form.permissions === 'openai'"
                  :groups="localAccounts.geminiGroups"
                  :placeholder="t('apiKeys.editApiKeyModal.selectGeminiAccount')"
                  platform="gemini"
                />
              </div>
              <div>
                <label class="mb-1 block text-sm font-medium text-gray-600 dark:text-gray-400">{{
                  t('apiKeys.editApiKeyModal.openaiAccount')
                }}</label>
                <AccountSelector
                  v-model="form.openaiAccountId"
                  :accounts="localAccounts.openai"
                  :default-option-text="t('apiKeys.editApiKeyModal.useSharedPool')"
                  :disabled="form.permissions === 'claude' || form.permissions === 'gemini'"
                  :groups="localAccounts.openaiGroups"
                  :placeholder="t('apiKeys.editApiKeyModal.selectOpenaiAccount')"
                  platform="openai"
                />
              </div>
              <div>
                <label class="mb-1 block text-sm font-medium text-gray-600 dark:text-gray-400">{{
                  t('apiKeys.editApiKeyModal.bedrockAccount')
                }}</label>
                <AccountSelector
                  v-model="form.bedrockAccountId"
                  :accounts="localAccounts.bedrock"
                  :default-option-text="t('apiKeys.editApiKeyModal.useSharedPool')"
                  :disabled="form.permissions === 'gemini' || form.permissions === 'openai'"
                  :groups="[]"
                  :placeholder="t('apiKeys.editApiKeyModal.selectBedrockAccount')"
                  platform="bedrock"
                />
              </div>
            </div>
            <p class="mt-2 text-xs text-gray-500 dark:text-gray-400">
              {{ t('apiKeys.editApiKeyModal.accountBindingHint') }}
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
                {{ t('apiKeys.editApiKeyModal.enableModelRestriction') }}
              </label>
            </div>

            <div v-if="form.enableModelRestriction" class="space-y-3">
              <div>
                <label class="mb-2 block text-sm font-medium text-gray-600 dark:text-gray-400">{{
                  t('apiKeys.editApiKeyModal.restrictedModels')
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
                    {{ t('apiKeys.editApiKeyModal.noRestrictedModels') }}
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
                      {{ t('apiKeys.editApiKeyModal.allCommonModelsRestricted') }}
                    </span>
                  </div>

                  <!-- 手动输入 -->
                  <div class="flex gap-2">
                    <input
                      v-model="form.modelInput"
                      class="form-input flex-1 border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
                      :placeholder="t('apiKeys.editApiKeyModal.addRestrictedModelPlaceholder')"
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
                  {{ t('apiKeys.editApiKeyModal.modelRestrictionHint') }}
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
                {{ t('apiKeys.editApiKeyModal.enableClientRestriction') }}
              </label>
            </div>

            <div v-if="form.enableClientRestriction" class="space-y-3">
              <div>
                <label class="mb-2 block text-sm font-medium text-gray-600 dark:text-gray-400">{{
                  t('apiKeys.editApiKeyModal.allowedClients')
                }}</label>
                <p class="mb-3 text-xs text-gray-500 dark:text-gray-400">
                  {{ t('apiKeys.editApiKeyModal.clientRestrictionHint') }}
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
              {{ t('apiKeys.editApiKeyModal.cancel') }}
            </button>
            <button
              class="btn btn-primary flex-1 px-6 py-3 font-semibold"
              :disabled="loading"
              type="submit"
            >
              <div v-if="loading" class="loading-spinner mr-2" />
              <i v-else class="fas fa-save mr-2" />
              {{
                loading ? t('apiKeys.editApiKeyModal.saving') : t('apiKeys.editApiKeyModal.save')
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

const props = defineProps({
  apiKey: {
    type: Object,
    required: true
  },
  accounts: {
    type: Object,
    default: () => ({ claude: [], gemini: [] })
  }
})

const emit = defineEmits(['close', 'success'])

// 国际化
const { t } = useI18n()

// const authStore = useAuthStore()
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

// 表单数据
const form = reactive({
  name: '',
  tokenLimit: '', // 保留用于检测历史数据
  rateLimitWindow: '',
  rateLimitRequests: '',
  rateLimitCost: '', // 新增：费用限制
  concurrencyLimit: '',
  dailyCostLimit: '',
  weeklyOpusCostLimit: '',
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
  tags: [],
  isActive: true,
  ownerId: '' // 新增：所有者ID
})

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

// 更新 API Key
const updateApiKey = async () => {
  // 检查是否设置了时间窗口但费用限制为0
  if (form.rateLimitWindow && (!form.rateLimitCost || parseFloat(form.rateLimitCost) === 0)) {
    let confirmed = false
    if (window.showConfirm) {
      confirmed = await window.showConfirm(
        t('apiKeys.editApiKeyModal.costLimitConfirmTitle'),
        t('apiKeys.editApiKeyModal.costLimitConfirmMessage'),
        t('apiKeys.editApiKeyModal.costLimitConfirmContinue'),
        t('apiKeys.editApiKeyModal.costLimitConfirmBack')
      )
    } else {
      // 降级方案
      confirmed = confirm(t('apiKeys.editApiKeyModal.costLimitConfirmMessage'))
    }
    if (!confirmed) {
      return
    }
  }

  loading.value = true

  try {
    // 准备提交的数据
    const data = {
      name: form.name, // 添加名称字段
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
      weeklyOpusCostLimit:
        form.weeklyOpusCostLimit !== '' && form.weeklyOpusCostLimit !== null
          ? parseFloat(form.weeklyOpusCostLimit)
          : 0,
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

    const result = await apiClient.put(`/admin/api-keys/${props.apiKey.id}`, data)

    if (result.success) {
      emit('success')
      emit('close')
    } else {
      showToast(result.message || t('apiKeys.editApiKeyModal.updateFailed'), 'error')
    }
  } catch (error) {
    showToast(t('apiKeys.editApiKeyModal.updateFailed'), 'error')
  } finally {
    loading.value = false
  }
}

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
        isDedicated: account.accountType === 'dedicated'
      }))
    }

    if (openaiData.success) {
      localAccounts.value.openai = (openaiData.data || []).map((account) => ({
        ...account,
        isDedicated: account.accountType === 'dedicated'
      }))
    }

    if (bedrockData.success) {
      localAccounts.value.bedrock = (bedrockData.data || []).map((account) => ({
        ...account,
        isDedicated: account.accountType === 'dedicated'
      }))
    }

    // 处理分组数据
    if (groupsData.success) {
      const allGroups = groupsData.data || []
      localAccounts.value.claudeGroups = allGroups.filter((g) => g.platform === 'claude')
      localAccounts.value.geminiGroups = allGroups.filter((g) => g.platform === 'gemini')
      localAccounts.value.openaiGroups = allGroups.filter((g) => g.platform === 'openai')
    }

    showToast(t('apiKeys.editApiKeyModal.refreshAccountsSuccess'), 'success')
  } catch (error) {
    showToast(t('apiKeys.editApiKeyModal.refreshAccountsFailed'), 'error')
  } finally {
    accountsLoading.value = false
  }
}

// 加载用户列表
const loadUsers = async () => {
  try {
    const response = await apiClient.get('/admin/users')
    if (response.success) {
      availableUsers.value = response.data || []
    }
  } catch (error) {
    console.error('Failed to load users:', error)
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
    console.error('Error loading initial data:', error)
    // Fallback to empty arrays if loading fails
    supportedClients.value = []
    availableTags.value = []
  }

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

  form.name = props.apiKey.name

  // 处理速率限制迁移：如果有tokenLimit且没有rateLimitCost，提示用户
  form.tokenLimit = props.apiKey.tokenLimit || ''
  form.rateLimitCost = props.apiKey.rateLimitCost || ''

  // 如果有历史tokenLimit但没有rateLimitCost，提示用户需要重新设置
  if (props.apiKey.tokenLimit > 0 && !props.apiKey.rateLimitCost) {
    // 可以根据需要添加提示，或者自动迁移（这里选择让用户手动设置）
    console.log('Token limit migration detected, consider setting cost limit')
  }

  form.rateLimitWindow = props.apiKey.rateLimitWindow || ''
  form.rateLimitRequests = props.apiKey.rateLimitRequests || ''
  form.concurrencyLimit = props.apiKey.concurrencyLimit || ''
  form.dailyCostLimit = props.apiKey.dailyCostLimit || ''
  form.weeklyOpusCostLimit = props.apiKey.weeklyOpusCostLimit || ''
  form.permissions = props.apiKey.permissions || 'all'
  // 处理 Claude 账号（区分 OAuth 和 Console）
  if (props.apiKey.claudeConsoleAccountId) {
    form.claudeAccountId = `console:${props.apiKey.claudeConsoleAccountId}`
  } else {
    form.claudeAccountId = props.apiKey.claudeAccountId || ''
  }
  form.geminiAccountId = props.apiKey.geminiAccountId || ''
  form.openaiAccountId = props.apiKey.openaiAccountId || ''
  form.bedrockAccountId = props.apiKey.bedrockAccountId || '' // 添加 Bedrock 账号ID初始化
  form.restrictedModels = props.apiKey.restrictedModels || []
  form.allowedClients = props.apiKey.allowedClients || []
  form.tags = props.apiKey.tags || []
  // 从后端数据中获取实际的启用状态，而不是根据数组长度推断
  form.enableModelRestriction = props.apiKey.enableModelRestriction || false
  form.enableClientRestriction = props.apiKey.enableClientRestriction || false
  // 初始化活跃状态，默认为 true
  form.isActive = props.apiKey.isActive !== undefined ? props.apiKey.isActive : true

  // 初始化所有者
  form.ownerId = props.apiKey.userId || 'admin'
})
</script>

<style scoped>
/* 表单样式由全局样式提供 */
</style>
