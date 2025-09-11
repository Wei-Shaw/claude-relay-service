<template>
  <div class="settings-container">
    <div class="card p-4 sm:p-6">
      <!-- 页面标题 -->
      <div class="mb-4 sm:mb-6">
        <h3 class="mb-1 text-lg font-bold text-gray-900 dark:text-gray-100 sm:mb-2 sm:text-xl">
          {{ t('settings.title') }}
        </h3>
        <p class="text-sm text-gray-600 dark:text-gray-400 sm:text-base">
          {{ t('settings.description') }}
        </p>
      </div>

      <!-- 设置分类导航 -->
      <div class="mb-6">
        <nav class="flex space-x-8">
          <button
            :class="[
              'border-b-2 pb-2 text-sm font-medium transition-colors',
              activeSection === 'branding'
                ? 'border-blue-500 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
            ]"
            @click="activeSection = 'branding'"
          >
            <i class="fas fa-palette mr-2"></i>
            {{ t('settings.branding') }}
          </button>
          <button
            :class="[
              'border-b-2 pb-2 text-sm font-medium transition-colors',
              activeSection === 'webhook'
                ? 'border-blue-500 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
            ]"
            @click="activeSection = 'webhook'"
          >
            <i class="fas fa-bell mr-2"></i>
            {{ t('settings.webhook') }}
          </button>
        </nav>
      </div>

      <!-- 加载状态 -->
      <div v-if="loading" class="py-12 text-center">
        <div class="loading-spinner mx-auto mb-4"></div>
        <p class="text-gray-500 dark:text-gray-400">{{ t('settings.loading') }}</p>
      </div>

      <!-- 内容区域 -->
      <div v-else>
        <!-- 品牌设置部分 -->
        <div v-show="activeSection === 'branding'">
          <!-- 桌面端表格视图 -->
          <div class="table-container hidden sm:block">
            <table class="min-w-full">
              <tbody class="divide-y divide-gray-200/50 dark:divide-gray-600/50">
                <!-- 网站名称 -->
                <tr class="table-row">
                  <td class="w-48 whitespace-nowrap px-6 py-4">
                    <div class="flex items-center">
                      <div
                        class="mr-3 flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-blue-600"
                      >
                        <i class="fas fa-font text-xs text-white" />
                      </div>
                      <div>
                        <div class="text-sm font-semibold text-gray-900 dark:text-gray-100">
                          {{ t('settings.siteName') }}
                        </div>
                        <div class="text-xs text-gray-500 dark:text-gray-400">
                          {{ t('settings.siteNameDescription') }}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td class="px-6 py-4">
                    <input
                      v-model="oemSettings.siteName"
                      class="form-input w-full max-w-md dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
                      maxlength="100"
                      :placeholder="t('settings.siteNamePlaceholder')"
                      type="text"
                    />
                    <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {{ t('settings.siteNameHint') }}
                    </p>
                  </td>
                </tr>

                <!-- 网站图标 -->
                <tr class="table-row">
                  <td class="w-48 whitespace-nowrap px-6 py-4">
                    <div class="flex items-center">
                      <div
                        class="mr-3 flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-purple-500 to-purple-600"
                      >
                        <i class="fas fa-image text-xs text-white" />
                      </div>
                      <div>
                        <div class="text-sm font-semibold text-gray-900 dark:text-gray-100">
                          {{ t('settings.siteIcon') }}
                        </div>
                        <div class="text-xs text-gray-500 dark:text-gray-400">
                          {{ t('settings.siteIconDescription') }}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td class="px-6 py-4">
                    <div class="space-y-3">
                      <!-- 图标预览 -->
                      <div
                        v-if="oemSettings.siteIconData || oemSettings.siteIcon"
                        class="inline-flex items-center gap-3 rounded-lg bg-gray-50 p-3 dark:bg-gray-700"
                      >
                        <img
                          :alt="t('settings.iconPreview')"
                          class="h-8 w-8"
                          :src="oemSettings.siteIconData || oemSettings.siteIcon"
                          @error="handleIconError"
                        />
                        <span class="text-sm text-gray-600 dark:text-gray-400">{{
                          t('settings.currentIcon')
                        }}</span>
                        <button
                          class="rounded-lg px-3 py-1 font-medium text-red-600 transition-colors hover:bg-red-50 hover:text-red-900"
                          @click="removeIcon"
                        >
                          <i class="fas fa-trash mr-1" />{{ t('settings.removeIcon') }}
                        </button>
                      </div>

                      <!-- 文件上传 -->
                      <div>
                        <input
                          ref="iconFileInput"
                          accept=".ico,.png,.jpg,.jpeg,.svg"
                          class="hidden"
                          type="file"
                          @change="handleIconUpload"
                        />
                        <button
                          class="btn btn-success px-4 py-2"
                          @click="$refs.iconFileInput.click()"
                        >
                          <i class="fas fa-upload mr-2" />
                          {{ t('settings.uploadIcon') }}
                        </button>
                        <span class="ml-3 text-xs text-gray-500 dark:text-gray-400">{{
                          t('settings.iconFormats')
                        }}</span>
                      </div>
                    </div>
                  </td>
                </tr>

                <!-- 管理后台按钮显示控制 -->
                <tr class="table-row">
                  <td class="w-48 whitespace-nowrap px-6 py-4">
                    <div class="flex items-center">
                      <div
                        class="mr-3 flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600"
                      >
                        <i class="fas fa-eye-slash text-xs text-white" />
                      </div>
                      <div>
                        <div class="text-sm font-semibold text-gray-900 dark:text-gray-100">
                          {{ t('settings.adminEntry') }}
                        </div>
                        <div class="text-xs text-gray-500 dark:text-gray-400">
                          {{ t('settings.adminEntryDescription') }}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td class="px-6 py-4">
                    <div class="flex items-center">
                      <label class="inline-flex cursor-pointer items-center">
                        <input v-model="hideAdminButton" class="peer sr-only" type="checkbox" />
                        <div
                          class="peer relative h-6 w-11 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-blue-600 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:border-gray-600 dark:bg-gray-700 dark:peer-focus:ring-blue-800"
                        ></div>
                        <span class="ml-3 text-sm font-medium text-gray-900 dark:text-gray-300">{{
                          hideAdminButton
                            ? t('settings.hideLoginButton')
                            : t('settings.showLoginButton')
                        }}</span>
                      </label>
                    </div>
                    <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {{ t('settings.adminEntryHint') }}
                    </p>
                  </td>
                </tr>

                <!-- 操作按钮 -->
                <tr>
                  <td class="px-6 py-6" colspan="2">
                    <div class="flex items-center justify-between">
                      <div class="flex gap-3">
                        <button
                          class="btn btn-primary px-6 py-3"
                          :class="{ 'cursor-not-allowed opacity-50': saving }"
                          :disabled="saving"
                          @click="saveOemSettings"
                        >
                          <div v-if="saving" class="loading-spinner mr-2"></div>
                          <i v-else class="fas fa-save mr-2" />
                          {{ saving ? t('settings.saving') : t('settings.save') }}
                        </button>

                        <button
                          class="btn bg-gray-100 px-6 py-3 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                          :disabled="saving"
                          @click="resetOemSettings"
                        >
                          <i class="fas fa-undo mr-2" />
                          {{ t('settings.reset') }}
                        </button>
                      </div>

                      <div
                        v-if="oemSettings.updatedAt"
                        class="text-sm text-gray-500 dark:text-gray-400"
                      >
                        <i class="fas fa-clock mr-1" />
                        {{
                          t('settings.lastUpdated', { time: formatDateTime(oemSettings.updatedAt) })
                        }}
                      </div>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- 移动端卡片视图 -->
          <div class="space-y-4 sm:hidden">
            <!-- 站点名称卡片 -->
            <div class="glass-card p-4">
              <div class="mb-3 flex items-center gap-3">
                <div
                  class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-cyan-600 text-white shadow-md"
                >
                  <i class="fas fa-tag"></i>
                </div>
                <div>
                  <h3 class="text-base font-semibold text-gray-900 dark:text-gray-100">
                    {{ t('settings.siteNameCard') }}
                  </h3>
                  <p class="text-sm text-gray-500 dark:text-gray-400">
                    {{ t('settings.siteNameCardDesc') }}
                  </p>
                </div>
              </div>
              <input
                v-model="oemSettings.siteName"
                class="form-input w-full dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
                maxlength="100"
                :placeholder="t('settings.siteNamePlaceholder')"
                type="text"
              />
            </div>

            <!-- 站点图标卡片 -->
            <div class="glass-card p-4">
              <div class="mb-3 flex items-center gap-3">
                <div
                  class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 to-pink-600 text-white shadow-md"
                >
                  <i class="fas fa-image"></i>
                </div>
                <div>
                  <h3 class="text-base font-semibold text-gray-900 dark:text-gray-100">
                    {{ t('settings.siteIconCard') }}
                  </h3>
                  <p class="text-sm text-gray-500 dark:text-gray-400">
                    {{ t('settings.siteIconCardDesc') }}
                  </p>
                </div>
              </div>
              <div class="space-y-3">
                <!-- 图标预览 -->
                <div
                  v-if="oemSettings.siteIconData || oemSettings.siteIcon"
                  class="inline-flex items-center gap-3 rounded-lg bg-gray-50 p-3 dark:bg-gray-700"
                >
                  <img
                    :alt="t('settings.iconPreview')"
                    class="h-8 w-8"
                    :src="oemSettings.siteIconData || oemSettings.siteIcon"
                    @error="handleIconError"
                  />
                  <span class="text-sm text-gray-600 dark:text-gray-400">{{
                    t('settings.currentIcon')
                  }}</span>
                  <button
                    class="rounded-lg px-3 py-1 font-medium text-red-600 transition-colors hover:bg-red-50 hover:text-red-900"
                    @click="removeIcon"
                  >
                    {{ t('settings.removeIcon') }}
                  </button>
                </div>

                <!-- 上传按钮 -->
                <div>
                  <input
                    ref="iconFileInputMobile"
                    accept=".ico,.png,.jpg,.jpeg,.svg"
                    class="hidden"
                    type="file"
                    @change="handleIconUpload"
                  />
                  <button
                    class="btn btn-success px-4 py-2"
                    @click="$refs.iconFileInputMobile.click()"
                  >
                    <i class="fas fa-upload mr-2" />
                    {{ t('settings.uploadIcon') }}
                  </button>
                  <p class="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    {{ t('settings.iconFormats') }}
                  </p>
                </div>
              </div>
            </div>

            <!-- 管理后台按钮显示控制卡片 -->
            <div class="glass-card p-4">
              <div class="mb-3 flex items-center gap-3">
                <div
                  class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-md"
                >
                  <i class="fas fa-eye-slash"></i>
                </div>
                <div>
                  <h3 class="text-base font-semibold text-gray-900 dark:text-gray-100">
                    {{ t('settings.adminEntryCard') }}
                  </h3>
                  <p class="text-sm text-gray-500 dark:text-gray-400">
                    {{ t('settings.adminEntryCardDesc') }}
                  </p>
                </div>
              </div>
              <div class="space-y-2">
                <label class="inline-flex cursor-pointer items-center">
                  <input v-model="hideAdminButton" class="peer sr-only" type="checkbox" />
                  <div
                    class="peer relative h-6 w-11 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-blue-600 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:border-gray-600 dark:bg-gray-700 dark:peer-focus:ring-blue-800"
                  ></div>
                  <span class="ml-3 text-sm font-medium text-gray-900 dark:text-gray-300">{{
                    hideAdminButton ? t('settings.hideLoginButton') : t('settings.showLoginButton')
                  }}</span>
                </label>
                <p class="text-xs text-gray-500 dark:text-gray-400">
                  {{ t('settings.adminEntryHint') }}
                </p>
              </div>
            </div>

            <!-- 操作按钮卡片 -->
            <div class="glass-card p-4">
              <div class="flex flex-col gap-3">
                <button
                  class="btn btn-primary w-full px-6 py-3"
                  :class="{ 'cursor-not-allowed opacity-50': saving }"
                  :disabled="saving"
                  @click="saveOemSettings"
                >
                  <div v-if="saving" class="loading-spinner mr-2"></div>
                  <i v-else class="fas fa-save mr-2" />
                  {{ saving ? t('settings.saving') : t('settings.save') }}
                </button>

                <button
                  class="btn w-full bg-gray-100 px-6 py-3 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                  :disabled="saving"
                  @click="resetOemSettings"
                >
                  <i class="fas fa-undo mr-2" />
                  {{ t('settings.reset') }}
                </button>

                <div
                  v-if="oemSettings.updatedAt"
                  class="text-center text-sm text-gray-500 dark:text-gray-400"
                >
                  <i class="fas fa-clock mr-1" />
                  {{
                    t('settings.lastUpdatedMobile', { time: formatDateTime(oemSettings.updatedAt) })
                  }}
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Webhook 设置部分 -->
        <div v-show="activeSection === 'webhook'">
          <!-- 主开关 -->
          <div
            class="mb-6 rounded-lg bg-white/80 p-6 shadow-lg backdrop-blur-sm dark:bg-gray-800/80"
          >
            <div class="flex items-center justify-between">
              <div>
                <h2 class="text-lg font-semibold text-gray-800 dark:text-gray-200">
                  {{ t('settings.enableWebhook') }}
                </h2>
                <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  {{ t('settings.webhookDescription') }}
                </p>
              </div>
              <label class="relative inline-flex cursor-pointer items-center">
                <input
                  v-model="webhookConfig.enabled"
                  class="peer sr-only"
                  type="checkbox"
                  @change="saveWebhookConfig"
                />
                <div
                  class="peer h-6 w-11 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-blue-600 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:border-gray-600 dark:bg-gray-700 dark:peer-focus:ring-blue-800"
                ></div>
              </label>
            </div>
          </div>

          <!-- 通知类型设置 -->
          <div
            class="mb-6 rounded-lg bg-white/80 p-6 shadow-lg backdrop-blur-sm dark:bg-gray-800/80"
          >
            <h2 class="mb-4 text-lg font-semibold text-gray-800 dark:text-gray-200">
              {{ t('settings.notificationTypes') }}
            </h2>
            <div class="space-y-3">
              <div
                v-for="(enabled, type) in webhookConfig.notificationTypes"
                :key="type"
                class="flex items-center justify-between"
              >
                <div>
                  <span class="font-medium text-gray-700 dark:text-gray-300">
                    {{ getNotificationTypeName(type) }}
                  </span>
                  <span class="ml-2 text-sm text-gray-500 dark:text-gray-400">
                    {{ getNotificationTypeDescription(type) }}
                  </span>
                </div>
                <label class="relative inline-flex cursor-pointer items-center">
                  <input
                    v-model="webhookConfig.notificationTypes[type]"
                    class="peer sr-only"
                    type="checkbox"
                    @change="saveWebhookConfig"
                  />
                  <div
                    class="peer h-5 w-9 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-green-600 peer-checked:after:translate-x-full peer-checked:after:border-white dark:border-gray-600 dark:bg-gray-700"
                  ></div>
                </label>
              </div>
            </div>
          </div>

          <!-- 平台列表 -->
          <div
            class="mb-6 rounded-lg bg-white/80 p-6 shadow-lg backdrop-blur-sm dark:bg-gray-800/80"
          >
            <div class="mb-4 flex items-center justify-between">
              <h2 class="text-lg font-semibold text-gray-800 dark:text-gray-200">
                {{ t('settings.notificationPlatforms') }}
              </h2>
              <button
                class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
                @click="showAddPlatformModal = true"
              >
                <i class="fas fa-plus mr-2"></i>
                {{ t('settings.addPlatform') }}
              </button>
            </div>

            <!-- 平台卡片列表 -->
            <div
              v-if="webhookConfig.platforms && webhookConfig.platforms.length > 0"
              class="space-y-4"
            >
              <div
                v-for="platform in webhookConfig.platforms"
                :key="platform.id"
                class="rounded-lg border border-gray-200 p-4 dark:border-gray-700"
              >
                <div class="flex items-start justify-between">
                  <div class="flex-1">
                    <div class="flex items-center">
                      <i class="mr-3 text-xl" :class="getPlatformIcon(platform.type)"></i>
                      <div>
                        <h3 class="font-semibold text-gray-800 dark:text-gray-200">
                          {{ platform.name || getPlatformName(platform.type) }}
                        </h3>
                        <p class="text-sm text-gray-500 dark:text-gray-400">
                          {{ getPlatformName(platform.type) }}
                        </p>
                      </div>
                    </div>
                    <div class="mt-3 space-y-1 text-sm">
                      <div class="flex items-center text-gray-600 dark:text-gray-400">
                        <i class="fas fa-link mr-2"></i>
                        <span class="truncate">{{ platform.url }}</span>
                      </div>
                      <div
                        v-if="platform.enableSign"
                        class="flex items-center text-gray-600 dark:text-gray-400"
                      >
                        <i class="fas fa-shield-alt mr-2"></i>
                        <span>{{ t('settings.enableSignature') }}</span>
                      </div>
                    </div>
                  </div>
                  <div class="ml-4 flex items-center space-x-2">
                    <!-- 启用/禁用开关 -->
                    <label class="relative inline-flex cursor-pointer items-center">
                      <input
                        :checked="platform.enabled"
                        class="peer sr-only"
                        type="checkbox"
                        @change="togglePlatform(platform.id)"
                      />
                      <div
                        class="peer h-5 w-9 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-green-600 peer-checked:after:translate-x-full peer-checked:after:border-white dark:border-gray-600 dark:bg-gray-700"
                      ></div>
                    </label>
                    <!-- 测试按钮 -->
                    <button
                      class="rounded-lg bg-blue-100 p-2 text-blue-600 transition-colors hover:bg-blue-200 dark:bg-blue-900 dark:text-blue-400 dark:hover:bg-blue-800"
                      title="测试连接"
                      @click="testPlatform(platform)"
                    >
                      <i class="fas fa-vial"></i>
                    </button>
                    <!-- 编辑按钮 -->
                    <button
                      class="rounded-lg bg-gray-100 p-2 text-gray-600 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600"
                      title="编辑"
                      @click="editPlatform(platform)"
                    >
                      <i class="fas fa-edit"></i>
                    </button>
                    <!-- 删除按钮 -->
                    <button
                      class="rounded-lg bg-red-100 p-2 text-red-600 transition-colors hover:bg-red-200 dark:bg-red-900 dark:text-red-400 dark:hover:bg-red-800"
                      title="删除"
                      @click="deletePlatform(platform.id)"
                    >
                      <i class="fas fa-trash"></i>
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <div v-else class="py-8 text-center text-gray-500 dark:text-gray-400">
              {{ t('settings.noPlatforms') }}
            </div>
          </div>

          <!-- 高级设置 -->
          <div class="rounded-lg bg-white/80 p-6 shadow-lg backdrop-blur-sm dark:bg-gray-800/80">
            <h2 class="mb-4 text-lg font-semibold text-gray-800 dark:text-gray-200">
              {{ t('settings.advancedSettings') }}
            </h2>
            <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  {{ t('settings.maxRetries') }}
                </label>
                <input
                  v-model.number="webhookConfig.retrySettings.maxRetries"
                  class="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white sm:text-sm"
                  max="10"
                  min="0"
                  type="number"
                  @change="saveWebhookConfig"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  {{ t('settings.retryDelay') }}
                </label>
                <input
                  v-model.number="webhookConfig.retrySettings.retryDelay"
                  class="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white sm:text-sm"
                  max="10000"
                  min="100"
                  step="100"
                  type="number"
                  @change="saveWebhookConfig"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  {{ t('settings.timeout') }}
                </label>
                <input
                  v-model.number="webhookConfig.retrySettings.timeout"
                  class="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white sm:text-sm"
                  max="30000"
                  min="1000"
                  step="1000"
                  type="number"
                  @change="saveWebhookConfig"
                />
              </div>
            </div>
          </div>

          <!-- 测试通知按钮 -->
          <div class="mt-6 text-center">
            <button
              class="rounded-lg bg-green-600 px-6 py-3 text-white shadow-lg transition-all hover:bg-green-700 hover:shadow-xl"
              @click="sendTestNotification"
            >
              <i class="fas fa-paper-plane mr-2"></i>
              {{ t('settings.sendTestNotification') }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- 添加/编辑平台模态框 -->
  <div
    v-if="showAddPlatformModal"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm transition-all duration-300 ease-out"
    @click="closePlatformModal"
  >
    <div
      class="relative mx-4 w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl transition-all duration-300 ease-out dark:bg-gray-800"
      @click.stop
    >
      <!-- 头部 -->
      <div
        class="dark:to-gray-750 relative border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50 px-6 py-5 dark:border-gray-700 dark:from-gray-800"
      >
        <div class="flex items-center justify-between">
          <div class="flex items-center space-x-3">
            <div
              class="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg"
            >
              <i class="fas fa-bell"></i>
            </div>
            <div>
              <h3 class="text-xl font-semibold text-gray-900 dark:text-white">
                {{
                  editingPlatform ? t('settings.editPlatformModal') : t('settings.addPlatformModal')
                }}
              </h3>
              <p class="mt-0.5 text-sm text-gray-600 dark:text-gray-400">
                {{ t('settings.configurePlatform') }}
              </p>
            </div>
          </div>
          <button
            class="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
            @click="closePlatformModal"
          >
            <i class="fas fa-times text-lg"></i>
          </button>
        </div>
      </div>

      <!-- 内容区域 -->
      <div class="p-6">
        <div class="space-y-5">
          <!-- 平台类型选择 -->
          <div>
            <label
              class="mb-2 flex items-center text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              <i class="fas fa-layer-group mr-2 text-gray-400"></i>
              {{ t('settings.platformType') }}
            </label>
            <div class="relative">
              <select
                v-model="platformForm.type"
                class="w-full appearance-none rounded-xl border border-gray-300 bg-white px-4 py-3 pr-10 text-gray-900 shadow-sm transition-all focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                :disabled="editingPlatform"
              >
                <option value="wechat_work">🟢 {{ t('settings.platforms.wechatWork') }}</option>
                <option value="dingtalk">🔵 {{ t('settings.platforms.dingtalk') }}</option>
                <option value="feishu">🟦 {{ t('settings.platforms.feishu') }}</option>
                <option value="slack">🟣 {{ t('settings.platforms.slack') }}</option>
                <option value="discord">🟪 {{ t('settings.platforms.discord') }}</option>
                <option value="bark">🔔 {{ t('settings.platforms.bark') }}</option>
                <option value="custom">⚙️ {{ t('settings.platforms.custom') }}</option>
              </select>
              <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                <i class="fas fa-chevron-down text-gray-400"></i>
              </div>
            </div>
            <p v-if="editingPlatform" class="mt-1 text-xs text-amber-600 dark:text-amber-400">
              <i class="fas fa-info-circle mr-1"></i>
              {{ t('settings.cannotChangePlatformType') }}
            </p>
          </div>

          <!-- 平台名称 -->
          <div>
            <label
              class="mb-2 flex items-center text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              <i class="fas fa-tag mr-2 text-gray-400"></i>
              {{ t('settings.platformName') }}
              <span class="ml-2 text-xs text-gray-500">{{ t('settings.optional') }}</span>
            </label>
            <input
              v-model="platformForm.name"
              class="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-900 shadow-sm transition-all placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder:text-gray-500"
              :placeholder="t('settings.platformNamePlaceholder')"
              type="text"
            />
          </div>

          <!-- Webhook URL (非Bark平台) -->
          <div v-if="platformForm.type !== 'bark'">
            <label
              class="mb-2 flex items-center text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              <i class="fas fa-link mr-2 text-gray-400"></i>
              {{ t('settings.webhookUrl') }}
              <span class="ml-1 text-xs text-red-500">*</span>
            </label>
            <div class="relative">
              <input
                v-model="platformForm.url"
                class="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 pr-10 font-mono text-sm text-gray-900 shadow-sm transition-all placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder:text-gray-500"
                :class="{
                  'border-red-500 focus:border-red-500 focus:ring-red-500/20': urlError,
                  'border-green-500 focus:border-green-500 focus:ring-green-500/20': urlValid
                }"
                placeholder="https://..."
                required
                type="url"
                @input="validateUrl"
              />
              <div v-if="urlValid" class="absolute inset-y-0 right-0 flex items-center pr-3">
                <i class="fas fa-check-circle text-green-500"></i>
              </div>
              <div v-if="urlError" class="absolute inset-y-0 right-0 flex items-center pr-3">
                <i class="fas fa-exclamation-circle text-red-500"></i>
              </div>
            </div>
            <div
              v-if="getWebhookHint(platformForm.type)"
              class="mt-2 flex items-start rounded-lg bg-blue-50 p-3 dark:bg-blue-900/20"
            >
              <i class="fas fa-info-circle mr-2 mt-0.5 text-blue-600 dark:text-blue-400"></i>
              <p class="text-sm text-blue-700 dark:text-blue-300">
                {{ getWebhookHint(platformForm.type) }}
              </p>
            </div>
          </div>

          <!-- Bark 平台特有字段 -->
          <div v-if="platformForm.type === 'bark'" class="space-y-5">
            <!-- 设备密钥 -->
            <div>
              <label
                class="mb-2 flex items-center text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                <i class="fas fa-key mr-2 text-gray-400"></i>
                {{ t('settings.deviceKey') }}
                <span class="ml-1 text-xs text-red-500">*</span>
              </label>
              <input
                v-model="platformForm.deviceKey"
                class="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 font-mono text-sm text-gray-900 shadow-sm transition-all placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder:text-gray-500"
                placeholder="例如：aBcDeFgHiJkLmNoPqRsTuVwX"
                required
                type="text"
              />
              <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                在Bark App中查看您的推送密钥
              </p>
            </div>

            <!-- 服务器URL（可选） -->
            <div>
              <label
                class="mb-2 flex items-center text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                <i class="fas fa-server mr-2 text-gray-400"></i>
                {{ t('settings.serverUrl') }}
                <span class="ml-2 text-xs text-gray-500">{{ t('settings.optional') }}</span>
              </label>
              <input
                v-model="platformForm.serverUrl"
                class="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 font-mono text-sm text-gray-900 shadow-sm transition-all placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder:text-gray-500"
                placeholder="默认: https://api.day.app/push"
                type="url"
              />
            </div>

            <!-- 通知级别 -->
            <div>
              <label
                class="mb-2 flex items-center text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                <i class="fas fa-flag mr-2 text-gray-400"></i>
                {{ t('settings.notificationLevel') }}
              </label>
              <select
                v-model="platformForm.level"
                class="w-full appearance-none rounded-xl border border-gray-300 bg-white px-4 py-3 pr-10 text-gray-900 shadow-sm transition-all focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              >
                <option value="">自动（根据通知类型）</option>
                <option value="passive">被动</option>
                <option value="active">默认</option>
                <option value="timeSensitive">时效性</option>
                <option value="critical">紧急</option>
              </select>
            </div>

            <!-- 通知声音 -->
            <div>
              <label
                class="mb-2 flex items-center text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                <i class="fas fa-volume-up mr-2 text-gray-400"></i>
                {{ t('settings.notificationSound') }}
              </label>
              <select
                v-model="platformForm.sound"
                class="w-full appearance-none rounded-xl border border-gray-300 bg-white px-4 py-3 pr-10 text-gray-900 shadow-sm transition-all focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              >
                <option value="">自动（根据通知类型）</option>
                <option value="default">默认</option>
                <option value="alarm">警报</option>
                <option value="bell">铃声</option>
                <option value="birdsong">鸟鸣</option>
                <option value="electronic">电子音</option>
                <option value="glass">玻璃</option>
                <option value="horn">喇叭</option>
                <option value="silence">静音</option>
              </select>
            </div>

            <!-- 分组 -->
            <div>
              <label
                class="mb-2 flex items-center text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                <i class="fas fa-folder mr-2 text-gray-400"></i>
                通知分组
                <span class="ml-2 text-xs text-gray-500">(可选)</span>
              </label>
              <input
                v-model="platformForm.group"
                class="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-900 shadow-sm transition-all placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder:text-gray-500"
                placeholder="默认: claude-relay"
                type="text"
              />
            </div>

            <!-- 提示信息 -->
            <div class="mt-2 flex items-start rounded-lg bg-blue-50 p-3 dark:bg-blue-900/20">
              <i class="fas fa-info-circle mr-2 mt-0.5 text-blue-600 dark:text-blue-400"></i>
              <div class="text-sm text-blue-700 dark:text-blue-300">
                <p>1. 在iPhone上安装Bark App</p>
                <p>2. 打开App获取您的设备密钥</p>
                <p>3. 将密钥粘贴到上方输入框</p>
              </div>
            </div>
          </div>

          <!-- 签名设置（钉钉/飞书） -->
          <div
            v-if="platformForm.type === 'dingtalk' || platformForm.type === 'feishu'"
            class="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/50"
          >
            <div class="space-y-4">
              <div class="flex items-center justify-between">
                <label class="flex cursor-pointer items-center" for="enableSign">
                  <input
                    id="enableSign"
                    v-model="platformForm.enableSign"
                    class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-0"
                    type="checkbox"
                  />
                  <span
                    class="ml-3 flex items-center text-sm font-medium text-gray-700 dark:text-gray-300"
                  >
                    <i class="fas fa-shield-alt mr-2 text-gray-400"></i>
                    启用签名验证
                  </span>
                </label>
                <span
                  v-if="platformForm.enableSign"
                  class="rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-700 dark:bg-green-900/50 dark:text-green-400"
                >
                  已启用
                </span>
              </div>
              <transition
                enter-active-class="transition-all duration-200 ease-out"
                enter-from-class="opacity-0 -translate-y-2"
                enter-to-class="opacity-100 translate-y-0"
                leave-active-class="transition-all duration-150 ease-in"
                leave-from-class="opacity-100 translate-y-0"
                leave-to-class="opacity-0 -translate-y-2"
              >
                <div v-if="platformForm.enableSign">
                  <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    签名密钥
                  </label>
                  <input
                    v-model="platformForm.secret"
                    class="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 font-mono text-sm text-gray-900 shadow-sm transition-all placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:placeholder:text-gray-500"
                    placeholder="SEC..."
                    type="text"
                  />
                </div>
              </transition>
            </div>
          </div>
        </div>
      </div>

      <!-- 底部按钮 -->
      <div
        class="border-t border-gray-200 bg-gray-50 px-6 py-4 dark:border-gray-700 dark:bg-gray-900/50"
      >
        <div class="flex items-center justify-between">
          <div class="text-xs text-gray-500 dark:text-gray-400">
            <i class="fas fa-asterisk mr-1 text-red-500"></i>
            {{ t('settings.requiredField') }}
          </div>
          <div class="flex space-x-3">
            <button
              class="group flex items-center rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition-all hover:bg-gray-50 hover:shadow-md dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
              @click="closePlatformModal"
            >
              <i class="fas fa-times mr-2 transition-transform group-hover:scale-110"></i>
              {{ t('common.cancel') }}
            </button>
            <button
              class="group flex items-center rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-medium text-blue-700 shadow-sm transition-all hover:bg-blue-100 hover:shadow-md dark:border-blue-800 dark:bg-blue-900/50 dark:text-blue-300 dark:hover:bg-blue-900/70"
              :disabled="testingConnection"
              @click="testPlatformForm"
            >
              <i
                class="mr-2 transition-transform"
                :class="
                  testingConnection ? 'fas fa-spinner fa-spin' : 'fas fa-vial group-hover:scale-110'
                "
              ></i>
              {{ testingConnection ? t('settings.testing') : t('settings.testConnection') }}
            </button>
            <button
              class="group flex items-center rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-2.5 text-sm font-medium text-white shadow-md transition-all hover:from-blue-700 hover:to-indigo-700 hover:shadow-lg disabled:cursor-not-allowed disabled:from-gray-400 disabled:to-gray-500"
              :disabled="!isPlatformFormValid || savingPlatform"
              @click="savePlatform"
            >
              <i
                class="mr-2 transition-transform"
                :class="
                  savingPlatform ? 'fas fa-spinner fa-spin' : 'fas fa-save group-hover:scale-110'
                "
              ></i>
              {{
                savingPlatform
                  ? t('settings.saving')
                  : editingPlatform
                    ? t('settings.saveChanges')
                    : t('settings.addPlatform')
              }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, watch, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { showToast } from '@/utils/toast'
import { useSettingsStore } from '@/stores/settings'
import { apiClient } from '@/config/api'

// 定义组件名称，用于keep-alive排除
defineOptions({
  name: 'SettingsView'
})

// 使用vue-i18n
const { t } = useI18n()

// 使用settings store
const settingsStore = useSettingsStore()
const { loading, saving, oemSettings } = storeToRefs(settingsStore)

// 组件refs
const iconFileInput = ref()

// 当前激活的设置部分
const activeSection = ref('branding')

// 组件挂载状态
const isMounted = ref(true)

// API请求取消控制器
const abortController = ref(new AbortController())

// 计算属性：隐藏管理后台按钮（反转 showAdminButton 的值）
const hideAdminButton = computed({
  get() {
    return !oemSettings.value.showAdminButton
  },
  set(value) {
    oemSettings.value.showAdminButton = !value
  }
})

// URL 验证状态
const urlError = ref(false)
const urlValid = ref(false)
const testingConnection = ref(false)
const savingPlatform = ref(false)

// Webhook 配置
const webhookConfig = ref({
  enabled: false,
  platforms: [],
  notificationTypes: {
    accountAnomaly: true,
    quotaWarning: true,
    systemError: true,
    securityAlert: true
  },
  retrySettings: {
    maxRetries: 3,
    retryDelay: 1000,
    timeout: 10000
  }
})

// 平台表单相关
const showAddPlatformModal = ref(false)
const editingPlatform = ref(null)
const platformForm = ref({
  type: 'wechat_work',
  name: '',
  url: '',
  enableSign: false,
  secret: ''
})

// 监听activeSection变化，加载对应配置
const sectionWatcher = watch(activeSection, async (newSection) => {
  if (!isMounted.value) return
  if (newSection === 'webhook') {
    await loadWebhookConfig()
  }
})

// 监听平台类型变化，重置验证状态
const platformTypeWatcher = watch(
  () => platformForm.value.type,
  (newType) => {
    // 切换平台类型时重置验证状态
    urlError.value = false
    urlValid.value = false

    // 如果不是编辑模式，清空相关字段
    if (!editingPlatform.value) {
      if (newType === 'bark') {
        // 切换到Bark时，清空URL相关字段
        platformForm.value.url = ''
        platformForm.value.enableSign = false
        platformForm.value.secret = ''
      } else {
        // 切换到其他平台时，清空Bark相关字段
        platformForm.value.deviceKey = ''
        platformForm.value.serverUrl = ''
        platformForm.value.level = ''
        platformForm.value.sound = ''
        platformForm.value.group = ''
      }
    }
  }
)

// 计算属性：判断平台表单是否有效
const isPlatformFormValid = computed(() => {
  if (platformForm.value.type === 'bark') {
    // Bark平台需要deviceKey
    return !!platformForm.value.deviceKey
  } else {
    // 其他平台需要URL且URL格式正确
    return !!platformForm.value.url && !urlError.value
  }
})

// 页面加载时获取设置
onMounted(async () => {
  try {
    await settingsStore.loadOemSettings()
    if (activeSection.value === 'webhook') {
      await loadWebhookConfig()
    }
  } catch (error) {
    showToast(t('settings.loadSettingsFailed'), 'error')
  }
})

// 组件卸载前清理
onBeforeUnmount(() => {
  // 设置组件未挂载状态
  isMounted.value = false

  // 取消所有API请求
  if (abortController.value) {
    abortController.value.abort()
  }

  // 停止watch监听器
  if (sectionWatcher) {
    sectionWatcher()
  }
  if (platformTypeWatcher) {
    platformTypeWatcher()
  }

  // 安全关闭模态框
  if (showAddPlatformModal.value) {
    showAddPlatformModal.value = false
    editingPlatform.value = null
  }
})

// Webhook 相关函数

// 获取webhook配置
const loadWebhookConfig = async () => {
  if (!isMounted.value) return
  try {
    const response = await apiClient.get('/admin/webhook/config', {
      signal: abortController.value.signal
    })
    if (response.success && isMounted.value) {
      webhookConfig.value = response.config
    }
  } catch (error) {
    if (error.name === 'AbortError') return
    if (!isMounted.value) return
    showToast(t('settings.getWebhookConfigFailed'), 'error')
    console.error(error)
  }
}

// 保存webhook配置
const saveWebhookConfig = async () => {
  if (!isMounted.value) return
  try {
    const response = await apiClient.post('/admin/webhook/config', webhookConfig.value, {
      signal: abortController.value.signal
    })
    if (response.success && isMounted.value) {
      showToast(t('settings.webhookConfigSaved'), 'success')
    }
  } catch (error) {
    if (error.name === 'AbortError') return
    if (!isMounted.value) return
    showToast(t('settings.webhookConfigSaveFailed'), 'error')
    console.error(error)
  }
}

// 验证 URL
const validateUrl = () => {
  // Bark平台不需要验证URL
  if (platformForm.value.type === 'bark') {
    urlError.value = false
    urlValid.value = false
    return
  }

  const url = platformForm.value.url
  if (!url) {
    urlError.value = false
    urlValid.value = false
    return
  }

  try {
    new URL(url)
    if (url.startsWith('http://') || url.startsWith('https://')) {
      urlError.value = false
      urlValid.value = true
    } else {
      urlError.value = true
      urlValid.value = false
    }
  } catch {
    urlError.value = true
    urlValid.value = false
  }
}

// 添加/更新平台
const savePlatform = async () => {
  if (!isMounted.value) return

  // Bark平台只需要deviceKey，其他平台需要URL
  if (platformForm.value.type === 'bark') {
    if (!platformForm.value.deviceKey) {
      showToast(t('settings.enterBarkDeviceKey'), 'error')
      return
    }
  } else {
    if (!platformForm.value.url) {
      showToast(t('settings.enterWebhookUrl'), 'error')
      return
    }

    if (urlError.value) {
      showToast('请输入有效的Webhook URL', 'error')
      return
    }
  }

  savingPlatform.value = true
  try {
    let response
    if (editingPlatform.value) {
      // 更新平台
      response = await apiClient.put(
        `/admin/webhook/platforms/${editingPlatform.value.id}`,
        platformForm.value,
        { signal: abortController.value.signal }
      )
    } else {
      // 添加平台
      response = await apiClient.post('/admin/webhook/platforms', platformForm.value, {
        signal: abortController.value.signal
      })
    }

    if (response.success && isMounted.value) {
      showToast(
        editingPlatform.value ? t('settings.platformUpdated') : t('settings.platformAdded'),
        'success'
      )
      await loadWebhookConfig()
      closePlatformModal()
    }
  } catch (error) {
    if (error.name === 'AbortError') return
    if (!isMounted.value) return
    showToast(error.message || t('settings.operationFailed'), 'error')
    console.error(error)
  } finally {
    if (isMounted.value) {
      savingPlatform.value = false
    }
  }
}

// 编辑平台
const editPlatform = (platform) => {
  editingPlatform.value = platform
  platformForm.value = { ...platform }
  showAddPlatformModal.value = true
}

// 删除平台
const deletePlatform = async (id) => {
  if (!isMounted.value) return

  if (!confirm(t('settings.confirmDeletePlatform'))) {
    return
  }

  try {
    const response = await apiClient.delete(`/admin/webhook/platforms/${id}`, {
      signal: abortController.value.signal
    })
    if (response.success && isMounted.value) {
      showToast(t('settings.platformDeleted'), 'success')
      await loadWebhookConfig()
    }
  } catch (error) {
    if (error.name === 'AbortError') return
    if (!isMounted.value) return
    showToast(t('settings.platformDeleteFailed'), 'error')
    console.error(error)
  }
}

// 切换平台状态
const togglePlatform = async (id) => {
  if (!isMounted.value) return

  try {
    const response = await apiClient.post(
      `/admin/webhook/platforms/${id}/toggle`,
      {},
      {
        signal: abortController.value.signal
      }
    )
    if (response.success && isMounted.value) {
      showToast(response.message, 'success')
      await loadWebhookConfig()
    }
  } catch (error) {
    if (error.name === 'AbortError') return
    if (!isMounted.value) return
    showToast('操作失败', 'error')
    console.error(error)
  }
}

// 测试平台
const testPlatform = async (platform) => {
  if (!isMounted.value) return

  try {
    const testData = {
      type: platform.type,
      secret: platform.secret,
      enableSign: platform.enableSign
    }

    // 根据平台类型添加不同字段
    if (platform.type === 'bark') {
      testData.deviceKey = platform.deviceKey
      testData.serverUrl = platform.serverUrl
      testData.level = platform.level
      testData.sound = platform.sound
      testData.group = platform.group
    } else {
      testData.url = platform.url
    }

    const response = await apiClient.post('/admin/webhook/test', testData, {
      signal: abortController.value.signal
    })
    if (response.success && isMounted.value) {
      showToast(t('settings.testSuccess'), 'success')
    }
  } catch (error) {
    if (error.name === 'AbortError') return
    if (!isMounted.value) return
    showToast(error.error || error.message || '测试失败', 'error')
    console.error(error)
  }
}

// 测试表单中的平台
const testPlatformForm = async () => {
  if (!isMounted.value) return

  // Bark平台验证
  if (platformForm.value.type === 'bark') {
    if (!platformForm.value.deviceKey) {
      showToast(t('settings.enterBarkDeviceKeyFirst'), 'error')
      return
    }
  } else {
    // 其他平台验证URL
    if (!platformForm.value.url) {
      showToast(t('settings.enterWebhookUrlFirst'), 'error')
      return
    }

    if (urlError.value) {
      showToast('请输入有效的Webhook URL', 'error')
      return
    }
  }

  testingConnection.value = true
  try {
    const response = await apiClient.post('/admin/webhook/test', platformForm.value, {
      signal: abortController.value.signal
    })
    if (response.success && isMounted.value) {
      showToast(t('settings.testSuccess'), 'success')
    }
  } catch (error) {
    if (error.name === 'AbortError') return
    if (!isMounted.value) return
    showToast(error.error || error.message || '测试失败', 'error')
    console.error(error)
  } finally {
    if (isMounted.value) {
      testingConnection.value = false
    }
  }
}

// 发送测试通知
const sendTestNotification = async () => {
  if (!isMounted.value) return

  try {
    const response = await apiClient.post(
      '/admin/webhook/test-notification',
      {},
      {
        signal: abortController.value.signal
      }
    )
    if (response.success && isMounted.value) {
      showToast(t('settings.testNotificationSent'), 'success')
    }
  } catch (error) {
    if (error.name === 'AbortError') return
    if (!isMounted.value) return
    showToast(t('settings.testNotificationFailed'), 'error')
    console.error(error)
  }
}

// 关闭模态框
const closePlatformModal = () => {
  if (!isMounted.value) return

  showAddPlatformModal.value = false

  // 使用 setTimeout 确保 DOM 更新完成后再重置状态
  setTimeout(() => {
    if (!isMounted.value) return
    editingPlatform.value = null
    platformForm.value = {
      type: 'wechat_work',
      name: '',
      url: '',
      enableSign: false,
      secret: '',
      // Bark特有字段
      deviceKey: '',
      serverUrl: '',
      level: '',
      sound: '',
      group: ''
    }
    urlError.value = false
    urlValid.value = false
    testingConnection.value = false
    savingPlatform.value = false
  }, 0)
}

// 辅助函数 - 转换为计算属性以支持响应式翻译
const getPlatformName = (type) => {
  const names = {
    wechat_work: t('settings.platforms.wechatWork'),
    dingtalk: t('settings.platforms.dingtalk'),
    feishu: t('settings.platforms.feishu'),
    slack: t('settings.platforms.slack'),
    discord: t('settings.platforms.discord'),
    bark: t('settings.platforms.bark'),
    custom: t('settings.platforms.custom')
  }
  return names[type] || type
}

const getPlatformIcon = (type) => {
  const icons = {
    wechat_work: 'fab fa-weixin text-green-600',
    dingtalk: 'fas fa-comment-dots text-blue-500',
    feishu: 'fas fa-dove text-blue-600',
    slack: 'fab fa-slack text-purple-600',
    discord: 'fab fa-discord text-indigo-600',
    bark: 'fas fa-bell text-orange-500',
    custom: 'fas fa-webhook text-gray-600'
  }
  return icons[type] || 'fas fa-bell'
}

const getWebhookHint = (type) => {
  const hints = {
    wechat_work: t('settings.wechatWorkHint'),
    dingtalk: t('settings.dingtalkHint'),
    feishu: t('settings.feishuHint'),
    slack: t('settings.slackHint'),
    discord: t('settings.discordHint'),
    bark: t('settings.barkHint'),
    custom: t('settings.customHint')
  }
  return hints[type] || ''
}

const getNotificationTypeName = (type) => {
  const names = {
    accountAnomaly: t('settings.accountAnomaly'),
    quotaWarning: t('settings.quotaWarning'),
    systemError: t('settings.systemError'),
    securityAlert: t('settings.securityAlert')
  }
  return names[type] || type
}

const getNotificationTypeDescription = (type) => {
  const descriptions = {
    accountAnomaly: t('settings.accountAnomalyDesc'),
    quotaWarning: t('settings.quotaWarningDesc'),
    systemError: t('settings.systemErrorDesc'),
    securityAlert: t('settings.securityAlertDesc')
  }
  return descriptions[type] || ''
}

// 保存OEM设置
const saveOemSettings = async () => {
  try {
    const settings = {
      siteName: oemSettings.value.siteName,
      siteIcon: oemSettings.value.siteIcon,
      siteIconData: oemSettings.value.siteIconData,
      showAdminButton: oemSettings.value.showAdminButton
    }
    const result = await settingsStore.saveOemSettings(settings)
    if (result && result.success) {
      showToast(t('settings.oemSettingsSaved'), 'success')
    } else {
      showToast(result?.message || t('settings.saveSettingsFailed'), 'error')
    }
  } catch (error) {
    showToast(t('settings.oemSettingsSaveFailed'), 'error')
  }
}

// 重置OEM设置
const resetOemSettings = async () => {
  if (!confirm(t('settings.confirmReset'))) return

  try {
    const result = await settingsStore.resetOemSettings()
    if (result && result.success) {
      showToast(t('settings.resetToDefault'), 'success')
    } else {
      showToast(t('settings.resetFailed'), 'error')
    }
  } catch (error) {
    showToast(t('settings.resetFailed'), 'error')
  }
}

// 处理图标上传
const handleIconUpload = async (event) => {
  const file = event.target.files[0]
  if (!file) return

  // 验证文件
  const validation = settingsStore.validateIconFile(file)
  if (!validation.isValid) {
    validation.errors.forEach((error) => showToast(error, 'error'))
    return
  }

  try {
    // 转换为Base64
    const base64Data = await settingsStore.fileToBase64(file)
    oemSettings.value.siteIconData = base64Data
  } catch (error) {
    showToast(t('settings.fileReadFailed'), 'error')
  }

  // 清除input的值，允许重复选择同一文件
  event.target.value = ''
}

// 删除图标
const removeIcon = () => {
  oemSettings.value.siteIcon = ''
  oemSettings.value.siteIconData = ''
}

// 处理图标加载错误
const handleIconError = () => {
  console.warn(t('settings.iconLoadFailed'))
}

// 格式化日期时间
const formatDateTime = settingsStore.formatDateTime
</script>

<style scoped>
.settings-container {
  min-height: calc(100vh - 300px);
}

.card {
  background: white;
  border-radius: 12px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
  border: 1px solid #e5e7eb;
}

:root.dark .card {
  background: #1f2937;
  border: 1px solid #374151;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.3);
}

.table-container {
  overflow: hidden;
  border-radius: 8px;
  border: 1px solid #f3f4f6;
}

:root.dark .table-container {
  border: 1px solid #4b5563;
}

.table-row {
  transition: background-color 0.2s ease;
}

.table-row:hover {
  background-color: #f9fafb;
}

:root.dark .table-row:hover {
  background-color: #374151;
}

.form-input {
  @apply w-full rounded-lg border border-gray-300 px-4 py-2 transition-all duration-200 focus:border-transparent focus:ring-2 focus:ring-blue-500;
}

.btn {
  @apply inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2;
}

.btn-primary {
  @apply bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500;
}

.btn-success {
  @apply bg-green-600 text-white hover:bg-green-700 focus:ring-green-500;
}

.loading-spinner {
  @apply h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600;
}
</style>
