<template>
  <div class="settings-container">
    <div class="card p-4 sm:p-6">
      <!-- 页面标题 -->
      <div class="mb-4 sm:mb-6">
        <h3 class="mb-1 text-lg font-bold text-gray-900 dark:text-gray-100 sm:mb-2 sm:text-xl">
          {{ t('settings.auto.auto001') }}
        </h3>
        <p class="text-sm text-gray-600 dark:text-gray-400 sm:text-base">
          {{ t('settings.auto.auto002') }}
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
            <i class="fas fa-palette mr-2"></i> {{ t('settings.auto.auto003') }}
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
            <i class="fas fa-bell mr-2"></i> {{ t('settings.auto.auto004') }}
          </button>
          <button
            :class="[
              'border-b-2 pb-2 text-sm font-medium transition-colors',
              activeSection === 'claude'
                ? 'border-blue-500 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
            ]"
            @click="activeSection = 'claude'"
          >
            <i class="fas fa-robot mr-2"></i> {{ t('settings.auto.auto005') }}
          </button>
          <button
            :class="[
              'border-b-2 pb-2 text-sm font-medium transition-colors',
              activeSection === 'serviceRates'
                ? 'border-blue-500 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
            ]"
            @click="activeSection = 'serviceRates'"
          >
            <i class="fas fa-balance-scale mr-2"></i> {{ t('settings.auto.auto006') }}
          </button>
          <button
            :class="[
              'border-b-2 pb-2 text-sm font-medium transition-colors',
              activeSection === 'modelPricing'
                ? 'border-blue-500 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
            ]"
            @click="activeSection = 'modelPricing'"
          >
            <i class="fas fa-coins mr-2"></i> {{ t('settings.auto.auto007') }}
          </button>
        </nav>
      </div>

      <!-- 加载状态 -->
      <div v-if="loading" class="py-12 text-center">
        <div class="loading-spinner mx-auto mb-4"></div>
        <p class="text-gray-500 dark:text-gray-400">{{ t('settings.auto.auto008') }}</p>
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
                          {{ t('settings.auto.auto009') }}
                        </div>
                        <div class="text-xs text-gray-500 dark:text-gray-400">
                          {{ t('settings.auto.auto010') }}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td class="px-6 py-4">
                    <input
                      v-model="oemSettings.siteName"
                      class="form-input w-full max-w-md dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
                      maxlength="100"
                      placeholder="Claude Relay Service"
                      type="text"
                    />
                    <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {{ t('settings.auto.auto011') }}
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
                          {{ t('settings.auto.auto012') }}
                        </div>
                        <div class="text-xs text-gray-500 dark:text-gray-400">Favicon</div>
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
                          :alt="t('settings.auto.auto013')"
                          class="h-8 w-8"
                          :src="oemSettings.siteIconData || oemSettings.siteIcon"
                          @error="handleIconError"
                        />
                        <span class="text-sm text-gray-600 dark:text-gray-400">{{
                          t('settings.auto.auto014')
                        }}</span>
                        <button
                          class="rounded-lg px-3 py-1 font-medium text-red-600 transition-colors hover:bg-red-50 hover:text-red-900"
                          @click="removeIcon"
                        >
                          <i class="fas fa-trash mr-1" />{{ t('settings.auto.auto015') }}
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
                          <i class="fas fa-upload mr-2" /> {{ t('settings.auto.auto016') }}
                        </button>
                        <span class="ml-3 text-xs text-gray-500 dark:text-gray-400">{{
                          t('settings.auto.auto017')
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
                          {{ t('settings.auto.auto018') }}
                        </div>
                        <div class="text-xs text-gray-500 dark:text-gray-400">
                          {{ t('settings.auto.auto019') }}
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
                            ? t('settings.manual.hideLoginButton')
                            : t('settings.manual.showLoginButton')
                        }}</span>
                      </label>
                    </div>
                    <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {{ t('settings.auto.auto020') }}
                    </p>
                  </td>
                </tr>

                <!-- API Stats 通知 -->
                <tr class="border-b border-gray-100 dark:border-gray-700">
                  <td class="w-48 whitespace-nowrap px-6 py-4">
                    <div class="flex items-center">
                      <div
                        class="mr-3 flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-orange-600"
                      >
                        <i class="fas fa-bell text-xs text-white" />
                      </div>
                      <div>
                        <div class="text-sm font-semibold text-gray-900 dark:text-gray-100">
                          {{ t('settings.auto.auto021') }}
                        </div>
                        <div class="text-xs text-gray-500 dark:text-gray-400">API Stats</div>
                      </div>
                    </div>
                  </td>
                  <td class="px-6 py-4">
                    <div class="flex items-center">
                      <label class="inline-flex cursor-pointer items-center">
                        <input
                          v-model="oemSettings.apiStatsNotice.enabled"
                          class="peer sr-only"
                          type="checkbox"
                        />
                        <div
                          class="peer relative h-6 w-11 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-blue-600 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:border-gray-600 dark:bg-gray-700 dark:peer-focus:ring-blue-800"
                        ></div>
                        <span class="ml-3 text-sm font-medium text-gray-900 dark:text-gray-300">{{
                          oemSettings.apiStatsNotice.enabled
                            ? t('settings.manual.enabled')
                            : t('settings.manual.disabled')
                        }}</span>
                      </label>
                    </div>
                    <div v-if="oemSettings.apiStatsNotice.enabled" class="mt-3 space-y-3">
                      <div>
                        <label class="mb-1 block text-xs text-gray-500 dark:text-gray-400">
                          {{ t('settings.auto.auto022') }}
                        </label>
                        <input
                          v-model="oemSettings.apiStatsNotice.title"
                          class="form-input w-full max-w-md dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
                          maxlength="100"
                          :placeholder="t('settings.auto.auto023')"
                          type="text"
                        />
                      </div>
                      <div>
                        <label class="mb-1 block text-xs text-gray-500 dark:text-gray-400">
                          {{ t('settings.auto.auto024') }}
                        </label>
                        <textarea
                          v-model="oemSettings.apiStatsNotice.content"
                          class="form-input w-full max-w-md resize-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
                          maxlength="2000"
                          :placeholder="t('settings.auto.auto025')"
                          rows="3"
                        ></textarea>
                      </div>
                    </div>
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
                          {{ saving ? t('common.saving') : t('settings.manual.saveSettings') }}
                        </button>

                        <button
                          class="btn bg-gray-100 px-6 py-3 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                          :disabled="saving"
                          @click="resetOemSettings"
                        >
                          <i class="fas fa-undo mr-2" /> {{ t('settings.auto.auto026') }}
                        </button>
                      </div>

                      <div
                        v-if="oemSettings.updatedAt"
                        class="text-sm text-gray-500 dark:text-gray-400"
                      >
                        <i class="fas fa-clock mr-1" /> {{ t('settings.auto.auto027')
                        }}{{ formatDateTime(oemSettings.updatedAt) }}
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
                    {{ t('settings.auto.auto028') }}
                  </h3>
                  <p class="text-sm text-gray-500 dark:text-gray-400">
                    {{ t('settings.auto.auto029') }}
                  </p>
                </div>
              </div>
              <input
                v-model="oemSettings.siteName"
                class="form-input w-full dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
                maxlength="100"
                placeholder="Claude Relay Service"
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
                    {{ t('settings.auto.auto030') }}
                  </h3>
                  <p class="text-sm text-gray-500 dark:text-gray-400">
                    {{ t('settings.auto.auto031') }}
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
                    :alt="t('settings.auto.auto013')"
                    class="h-8 w-8"
                    :src="oemSettings.siteIconData || oemSettings.siteIcon"
                    @error="handleIconError"
                  />
                  <span class="text-sm text-gray-600 dark:text-gray-400">{{
                    t('settings.auto.auto014')
                  }}</span>
                  <button
                    class="rounded-lg px-3 py-1 font-medium text-red-600 transition-colors hover:bg-red-50 hover:text-red-900"
                    @click="removeIcon"
                  >
                    {{ t('settings.auto.auto015') }}
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
                    <i class="fas fa-upload mr-2" /> {{ t('settings.auto.auto016') }}
                  </button>
                  <p class="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    {{ t('settings.auto.auto017') }}
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
                    {{ t('settings.auto.auto018') }}
                  </h3>
                  <p class="text-sm text-gray-500 dark:text-gray-400">
                    {{ t('settings.auto.auto032') }}
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
                    hideAdminButton
                      ? t('settings.manual.hideLoginButton')
                      : t('settings.manual.showLoginButton')
                  }}</span>
                </label>
                <p class="text-xs text-gray-500 dark:text-gray-400">
                  {{ t('settings.auto.auto020') }}
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
                  {{ saving ? t('common.saving') : t('settings.manual.saveSettings') }}
                </button>

                <button
                  class="btn w-full bg-gray-100 px-6 py-3 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                  :disabled="saving"
                  @click="resetOemSettings"
                >
                  <i class="fas fa-undo mr-2" /> {{ t('settings.auto.auto026') }}
                </button>

                <div
                  v-if="oemSettings.updatedAt"
                  class="text-center text-sm text-gray-500 dark:text-gray-400"
                >
                  <i class="fas fa-clock mr-1" /> {{ t('settings.auto.auto033') }}
                  {{ formatDateTime(oemSettings.updatedAt) }}
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
                  {{ t('settings.auto.auto034') }}
                </h2>
                <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  {{ t('settings.auto.auto035') }}
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
              {{ t('settings.auto.auto036') }}
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
                {{ t('settings.auto.auto037') }}
              </h2>
              <button
                class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
                @click="showAddPlatformModal = true"
              >
                <i class="fas fa-plus mr-2"></i> {{ t('settings.auto.auto038') }}
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
                      <div
                        v-if="platform.type !== 'smtp' && platform.type !== 'telegram'"
                        class="flex items-center text-gray-600 dark:text-gray-400"
                      >
                        <i class="fas fa-link mr-2"></i>
                        <span class="truncate">{{ platform.url }}</span>
                      </div>
                      <div
                        v-if="platform.type === 'telegram'"
                        class="flex items-center text-gray-600 dark:text-gray-400"
                      >
                        <i class="fas fa-comments mr-2"></i>
                        <span class="truncate"
                          >Chat ID:
                          {{ platform.chatId || t('settings.manual.notConfigured') }}</span
                        >
                      </div>
                      <div
                        v-if="platform.type === 'telegram' && platform.botToken"
                        class="flex items-center text-gray-600 dark:text-gray-400"
                      >
                        <i class="fas fa-key mr-2"></i>
                        <span class="truncate"
                          >Token: {{ formatTelegramToken(platform.botToken) }}</span
                        >
                      </div>
                      <div
                        v-if="platform.type === 'telegram' && platform.apiBaseUrl"
                        class="flex items-center text-gray-600 dark:text-gray-400"
                      >
                        <i class="fas fa-globe mr-2"></i>
                        <span class="truncate">API: {{ platform.apiBaseUrl }}</span>
                      </div>
                      <div
                        v-if="platform.type === 'telegram' && platform.proxyUrl"
                        class="flex items-center text-gray-600 dark:text-gray-400"
                      >
                        <i class="fas fa-route mr-2"></i>
                        <span class="truncate"
                          >{{ t('settings.auto.auto039') }} {{ platform.proxyUrl }}</span
                        >
                      </div>
                      <div
                        v-if="platform.type === 'smtp' && platform.to"
                        class="flex items-center text-gray-600 dark:text-gray-400"
                      >
                        <i class="fas fa-envelope mr-2"></i>
                        <span class="truncate">{{
                          Array.isArray(platform.to) ? platform.to.join(', ') : platform.to
                        }}</span>
                      </div>
                      <div
                        v-if="platform.enableSign"
                        class="flex items-center text-gray-600 dark:text-gray-400"
                      >
                        <i class="fas fa-shield-alt mr-2"></i>
                        <span>{{ t('settings.auto.auto040') }}</span>
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
                      :title="t('settings.auto.auto041')"
                      @click="testPlatform(platform)"
                    >
                      <i class="fas fa-vial"></i>
                    </button>
                    <!-- 编辑按钮 -->
                    <button
                      class="rounded-lg bg-gray-100 p-2 text-gray-600 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600"
                      :title="t('settings.auto.auto042')"
                      @click="editPlatform(platform)"
                    >
                      <i class="fas fa-edit"></i>
                    </button>
                    <!-- 删除按钮 -->
                    <button
                      class="rounded-lg bg-red-100 p-2 text-red-600 transition-colors hover:bg-red-200 dark:bg-red-900 dark:text-red-400 dark:hover:bg-red-800"
                      :title="t('settings.auto.auto015')"
                      @click="deletePlatform(platform.id)"
                    >
                      <i class="fas fa-trash"></i>
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <div v-else class="py-8 text-center text-gray-500 dark:text-gray-400">
              {{ t('settings.auto.auto043') }}
            </div>
          </div>

          <!-- 高级设置 -->
          <div class="rounded-lg bg-white/80 p-6 shadow-lg backdrop-blur-sm dark:bg-gray-800/80">
            <h2 class="mb-4 text-lg font-semibold text-gray-800 dark:text-gray-200">
              {{ t('settings.auto.auto044') }}
            </h2>
            <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  {{ t('settings.auto.auto045') }}
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
                  {{ t('settings.auto.auto046') }}
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
                  {{ t('settings.auto.auto047') }}
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
              <i class="fas fa-paper-plane mr-2"></i> {{ t('settings.auto.auto048') }}
            </button>
          </div>
        </div>

        <!-- Claude 转发配置部分 -->
        <div v-show="activeSection === 'claude'">
          <!-- 加载状态 -->
          <div v-if="claudeConfigLoading" class="py-12 text-center">
            <div class="loading-spinner mx-auto mb-4"></div>
            <p class="text-gray-500 dark:text-gray-400">{{ t('settings.auto.auto049') }}</p>
          </div>

          <div v-else>
            <!-- Claude Code 客户端限制 -->
            <div
              class="mb-6 rounded-lg bg-white/80 p-6 shadow-lg backdrop-blur-sm dark:bg-gray-800/80"
            >
              <div class="flex items-center justify-between">
                <div>
                  <div class="flex items-center">
                    <div
                      class="mr-3 flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-amber-600 text-white shadow-lg"
                    >
                      <i class="fas fa-terminal"></i>
                    </div>
                    <div>
                      <h2 class="text-lg font-semibold text-gray-800 dark:text-gray-200">
                        {{ t('settings.auto.auto050') }}
                      </h2>
                      <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
                        {{ t('settings.auto.auto051') }}
                        <code class="rounded bg-gray-100 px-1 dark:bg-gray-700"
                          >/api/v1/messages</code
                        >
                        {{ t('settings.auto.auto052') }}
                        <code class="rounded bg-gray-100 px-1 dark:bg-gray-700"
                          >/claude/v1/messages</code
                        >
                        {{ t('settings.auto.auto053') }}
                      </p>
                    </div>
                  </div>
                </div>
                <label class="relative inline-flex cursor-pointer items-center">
                  <input
                    v-model="claudeConfig.claudeCodeOnlyEnabled"
                    class="peer sr-only"
                    type="checkbox"
                    @change="saveClaudeConfig"
                  />
                  <div
                    class="peer h-6 w-11 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-orange-500 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-orange-300 dark:border-gray-600 dark:bg-gray-700 dark:peer-focus:ring-orange-800"
                  ></div>
                </label>
              </div>
              <div class="mt-4 rounded-lg bg-amber-50 p-4 dark:bg-amber-900/20">
                <div class="flex">
                  <i class="fas fa-info-circle mt-0.5 text-amber-500"></i>
                  <div class="ml-3">
                    <p class="text-sm text-amber-700 dark:text-amber-300">
                      {{ t('settings.auto.auto054') }}
                      <strong>{{ t('settings.auto.auto055') }}</strong
                      >{{ t('settings.auto.auto056') }}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <!-- 全局会话绑定 -->
            <div
              class="mb-6 rounded-lg bg-white/80 p-6 shadow-lg backdrop-blur-sm dark:bg-gray-800/80"
            >
              <div class="flex items-center justify-between">
                <div>
                  <div class="flex items-center">
                    <div
                      class="mr-3 flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 text-white shadow-lg"
                    >
                      <i class="fas fa-link"></i>
                    </div>
                    <div>
                      <h2 class="text-lg font-semibold text-gray-800 dark:text-gray-200">
                        {{ t('settings.auto.auto057') }}
                      </h2>
                      <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
                        {{ t('settings.auto.auto058') }}
                      </p>
                    </div>
                  </div>
                </div>
                <label class="relative inline-flex cursor-pointer items-center">
                  <input
                    v-model="claudeConfig.globalSessionBindingEnabled"
                    class="peer sr-only"
                    type="checkbox"
                    @change="saveClaudeConfig"
                  />
                  <div
                    class="peer h-6 w-11 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-purple-500 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 dark:border-gray-600 dark:bg-gray-700 dark:peer-focus:ring-purple-800"
                  ></div>
                </label>
              </div>

              <!-- 绑定配置详情（仅在启用时显示） -->
              <div v-if="claudeConfig.globalSessionBindingEnabled" class="mt-6 space-y-4">
                <!-- 绑定有效期 -->
                <div>
                  <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    <i class="fas fa-clock mr-2 text-gray-400"></i> {{ t('settings.auto.auto059') }}
                  </label>
                  <input
                    v-model.number="claudeConfig.sessionBindingTtlDays"
                    class="mt-1 block w-full max-w-xs rounded-lg border border-gray-300 bg-white px-3 py-2 shadow-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20 dark:border-gray-500 dark:bg-gray-700 dark:text-white sm:text-sm"
                    max="365"
                    min="1"
                    placeholder="30"
                    type="number"
                    @change="saveClaudeConfig"
                  />
                  <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {{ t('settings.auto.auto060') }}
                  </p>
                </div>

                <!-- 错误提示消息 -->
                <div>
                  <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    <i class="fas fa-exclamation-triangle mr-2 text-gray-400"></i>
                    {{ t('settings.auto.auto061') }}
                  </label>
                  <textarea
                    v-model="claudeConfig.sessionBindingErrorMessage"
                    class="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 shadow-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20 dark:border-gray-500 dark:bg-gray-700 dark:text-white sm:text-sm"
                    :placeholder="t('settings.auto.auto062')"
                    rows="2"
                    @change="saveClaudeConfig"
                  ></textarea>
                  <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {{ t('settings.auto.auto063') }}
                  </p>
                </div>
              </div>

              <div class="mt-4 rounded-lg bg-purple-50 p-4 dark:bg-purple-900/20">
                <div class="flex">
                  <i class="fas fa-lightbulb mt-0.5 text-purple-500"></i>
                  <div class="ml-3">
                    <p class="text-sm text-purple-700 dark:text-purple-300">
                      <strong>{{ t('settings.auto.auto064') }}</strong
                      >{{ t('settings.auto.auto065') }}
                      <code class="rounded bg-purple-100 px-1 dark:bg-purple-800"
                        >metadata.user_id</code
                      >{{ t('settings.auto.auto066') }}
                    </p>
                    <p class="mt-2 text-sm text-purple-700 dark:text-purple-300">
                      <strong>{{ t('settings.auto.auto067') }}</strong
                      >{{ t('settings.auto.auto068') }}
                      <code class="rounded bg-purple-100 px-1 dark:bg-purple-800"
                        >messages.length > 1</code
                      >{{ t('settings.auto.auto069') }}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <!-- 用户消息串行队列 -->
            <div
              class="mb-6 rounded-lg bg-white/80 p-6 shadow-lg backdrop-blur-sm dark:bg-gray-800/80"
            >
              <div class="flex items-center justify-between">
                <div>
                  <div class="flex items-center">
                    <div
                      class="mr-3 flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-teal-600 text-white shadow-lg"
                    >
                      <i class="fas fa-list-ol"></i>
                    </div>
                    <div>
                      <h2 class="text-lg font-semibold text-gray-800 dark:text-gray-200">
                        {{ t('settings.auto.auto070') }}
                      </h2>
                      <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
                        {{ t('settings.auto.auto071') }}
                      </p>
                    </div>
                  </div>
                </div>
                <label class="relative inline-flex cursor-pointer items-center">
                  <input
                    v-model="claudeConfig.userMessageQueueEnabled"
                    class="peer sr-only"
                    type="checkbox"
                    @change="saveClaudeConfig"
                  />
                  <div
                    class="peer h-6 w-11 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-teal-500 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-teal-300 dark:border-gray-600 dark:bg-gray-700 dark:peer-focus:ring-teal-800"
                  ></div>
                </label>
              </div>

              <!-- 队列配置详情（仅在启用时显示） -->
              <div v-if="claudeConfig.userMessageQueueEnabled" class="mt-6 space-y-4">
                <!-- 请求间隔 -->
                <div>
                  <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    <i class="fas fa-hourglass-half mr-2 text-gray-400"></i>
                    {{ t('settings.auto.auto072') }}
                  </label>
                  <input
                    v-model.number="claudeConfig.userMessageQueueDelayMs"
                    class="mt-1 block w-full max-w-xs rounded-lg border border-gray-300 bg-white px-3 py-2 shadow-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 dark:border-gray-500 dark:bg-gray-700 dark:text-white sm:text-sm"
                    max="10000"
                    min="0"
                    placeholder="200"
                    type="number"
                    @change="saveClaudeConfig"
                  />
                  <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {{ t('settings.auto.auto073') }}
                  </p>
                </div>

                <!-- 队列超时 -->
                <div>
                  <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    <i class="fas fa-stopwatch mr-2 text-gray-400"></i>
                    {{ t('settings.auto.auto074') }}
                  </label>
                  <input
                    v-model.number="claudeConfig.userMessageQueueTimeoutMs"
                    class="mt-1 block w-full max-w-xs rounded-lg border border-gray-300 bg-white px-3 py-2 shadow-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 dark:border-gray-500 dark:bg-gray-700 dark:text-white sm:text-sm"
                    max="300000"
                    min="1000"
                    placeholder="30000"
                    type="number"
                    @change="saveClaudeConfig"
                  />
                  <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {{ t('settings.auto.auto075') }}
                  </p>
                </div>
              </div>

              <div class="mt-4 rounded-lg bg-teal-50 p-4 dark:bg-teal-900/20">
                <div class="flex">
                  <i class="fas fa-info-circle mt-0.5 text-teal-500"></i>
                  <div class="ml-3">
                    <p class="text-sm text-teal-700 dark:text-teal-300">
                      <strong>{{ t('settings.auto.auto064') }}</strong
                      >{{ t('settings.auto.auto076') }}
                      <code class="rounded bg-teal-100 px-1 dark:bg-teal-800">role</code>
                      {{ t('settings.auto.auto077') }}
                      <code class="rounded bg-teal-100 px-1 dark:bg-teal-800">user</code
                      >{{ t('settings.auto.auto078') }}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <!-- 并发请求排队 -->
            <div
              class="mb-6 rounded-lg bg-white/80 p-6 shadow-lg backdrop-blur-sm dark:bg-gray-800/80"
            >
              <div class="flex items-center justify-between">
                <div class="flex items-center">
                  <div
                    class="flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-lg"
                  >
                    <i class="fas fa-layer-group text-xl"></i>
                  </div>
                  <div class="ml-4">
                    <h4 class="text-lg font-semibold text-gray-900 dark:text-white">
                      {{ t('settings.auto.auto079') }}
                    </h4>
                    <p class="text-sm text-gray-500 dark:text-gray-400">
                      {{ t('settings.auto.auto080') }}
                    </p>
                  </div>
                </div>
                <label class="relative inline-flex cursor-pointer items-center">
                  <input
                    v-model="claudeConfig.concurrentRequestQueueEnabled"
                    class="peer sr-only"
                    type="checkbox"
                    @change="saveClaudeConfig"
                  />
                  <div
                    class="peer h-6 w-11 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-blue-500 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:border-gray-600 dark:bg-gray-700 dark:peer-focus:ring-blue-800"
                  ></div>
                </label>
              </div>

              <!-- 排队配置详情（仅在启用时显示） -->
              <div v-if="claudeConfig.concurrentRequestQueueEnabled" class="mt-6 space-y-4">
                <!-- 固定最小排队数 -->
                <div>
                  <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    <i class="fas fa-list-ol mr-2 text-gray-400"></i>
                    {{ t('settings.auto.auto081') }}
                  </label>
                  <input
                    v-model.number="claudeConfig.concurrentRequestQueueMaxSize"
                    class="mt-1 block w-full max-w-xs rounded-lg border border-gray-300 bg-white px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-500 dark:bg-gray-700 dark:text-white sm:text-sm"
                    max="100"
                    min="1"
                    placeholder="3"
                    type="number"
                    @change="saveClaudeConfig"
                  />
                  <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {{ t('settings.auto.auto082') }}
                  </p>
                </div>

                <!-- 排队数倍数 -->
                <div>
                  <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    <i class="fas fa-times mr-2 text-gray-400"></i> {{ t('settings.auto.auto083') }}
                  </label>
                  <input
                    v-model.number="claudeConfig.concurrentRequestQueueMaxSizeMultiplier"
                    class="mt-1 block w-full max-w-xs rounded-lg border border-gray-300 bg-white px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-500 dark:bg-gray-700 dark:text-white sm:text-sm"
                    max="10"
                    min="0"
                    placeholder="1"
                    step="0.5"
                    type="number"
                    @change="saveClaudeConfig"
                  />
                  <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {{ t('settings.auto.auto084') }}
                  </p>
                </div>

                <!-- 排队超时时间 -->
                <div>
                  <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    <i class="fas fa-stopwatch mr-2 text-gray-400"></i>
                    {{ t('settings.auto.auto085') }}
                  </label>
                  <input
                    v-model.number="claudeConfig.concurrentRequestQueueTimeoutMs"
                    class="mt-1 block w-full max-w-xs rounded-lg border border-gray-300 bg-white px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-500 dark:bg-gray-700 dark:text-white sm:text-sm"
                    max="300000"
                    min="5000"
                    placeholder="10000"
                    type="number"
                    @change="saveClaudeConfig"
                  />
                  <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {{ t('settings.auto.auto086') }}
                  </p>
                </div>
              </div>

              <div class="mt-4 rounded-lg bg-blue-50 p-4 dark:bg-blue-900/20">
                <div class="flex">
                  <i class="fas fa-info-circle mt-0.5 text-blue-500"></i>
                  <div class="ml-3">
                    <p class="text-sm text-blue-700 dark:text-blue-300">
                      <strong>{{ t('settings.auto.auto064') }}</strong
                      >{{ t('settings.auto.auto087') }}
                      <code class="rounded bg-blue-100 px-1 dark:bg-blue-800"
                        >concurrencyLimit</code
                      >
                      {{ t('settings.auto.auto088') }}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <!-- 请求明细采集 -->
            <div
              class="mb-6 rounded-lg bg-white/80 p-6 shadow-lg backdrop-blur-sm dark:bg-gray-800/80"
            >
              <div class="flex items-center justify-between">
                <div class="flex items-center">
                  <div
                    class="flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow-lg"
                  >
                    <i class="fas fa-table text-xl"></i>
                  </div>
                  <div class="ml-4">
                    <h4 class="text-lg font-semibold text-gray-900 dark:text-white">
                      {{ t('settings.auto.auto089') }}
                    </h4>
                    <p class="text-sm text-gray-500 dark:text-gray-400">
                      {{ t('settings.auto.auto090') }}
                    </p>
                  </div>
                </div>
                <label class="relative inline-flex cursor-pointer items-center">
                  <input
                    v-model="claudeConfig.requestDetailCaptureEnabled"
                    class="peer sr-only"
                    type="checkbox"
                    @change="saveClaudeConfig"
                  />
                  <div
                    class="peer h-6 w-11 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-cyan-500 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-cyan-300 dark:border-gray-600 dark:bg-gray-700 dark:peer-focus:ring-cyan-800"
                  ></div>
                </label>
              </div>

              <div v-if="claudeConfig.requestDetailCaptureEnabled" class="mt-6 space-y-4">
                <div>
                  <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    <i class="fas fa-calendar-day mr-2 text-gray-400"></i>
                    {{ t('settings.auto.auto091') }}
                  </label>
                  <div class="mt-1 flex max-w-md flex-col gap-3 sm:flex-row sm:items-end">
                    <div class="flex-1">
                      <label
                        class="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400"
                      >
                        {{ t('settings.auto.auto092') }}
                      </label>
                      <input
                        v-model.number="requestDetailRetentionInput.days"
                        class="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 shadow-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 dark:border-gray-500 dark:bg-gray-700 dark:text-white sm:text-sm"
                        max="30"
                        min="0"
                        placeholder="0"
                        type="number"
                        @change="handleRequestDetailRetentionChange"
                      />
                    </div>
                    <div class="flex-1">
                      <label
                        class="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400"
                      >
                        {{ t('settings.auto.auto093') }}
                      </label>
                      <input
                        v-model.number="requestDetailRetentionInput.hours"
                        class="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 shadow-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 dark:border-gray-500 dark:bg-gray-700 dark:text-white sm:text-sm"
                        max="23"
                        min="0"
                        placeholder="6"
                        type="number"
                        @change="handleRequestDetailRetentionChange"
                      />
                    </div>
                  </div>
                  <p
                    v-if="requestDetailRetentionError"
                    class="mt-2 text-xs text-red-500 dark:text-red-400"
                  >
                    {{ requestDetailRetentionError }}
                  </p>
                  <p
                    v-else-if="requestDetailRetentionWarning"
                    class="mt-2 text-xs text-amber-600 dark:text-amber-400"
                  >
                    <i class="fas fa-exclamation-triangle mr-1"></i>
                    {{ requestDetailRetentionWarning }}
                  </p>
                  <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {{ t('settings.auto.auto094') }}
                  </p>
                </div>

                <div
                  class="rounded-lg border border-gray-200 bg-gray-50/80 p-4 dark:border-gray-700 dark:bg-gray-900/30"
                >
                  <div class="flex items-start justify-between gap-4">
                    <div class="flex-1">
                      <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        <i class="fas fa-eye mr-2 text-gray-400"></i>
                        {{ t('settings.auto.auto095') }}
                      </label>
                      <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {{ t('settings.auto.auto096') }}
                      </p>
                      <p
                        v-if="claudeConfig.requestDetailBodyPreviewEnabled"
                        class="mt-2 text-xs text-amber-600 dark:text-amber-400"
                      >
                        <i class="fas fa-exclamation-triangle mr-1"></i>
                        {{ t('settings.auto.auto097') }}
                      </p>
                    </div>

                    <button
                      :aria-checked="claudeConfig.requestDetailBodyPreviewEnabled"
                      class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-4 focus:ring-cyan-300 disabled:cursor-not-allowed disabled:opacity-60 dark:focus:ring-cyan-800"
                      :class="
                        claudeConfig.requestDetailBodyPreviewEnabled
                          ? 'bg-cyan-500'
                          : 'bg-gray-200 dark:bg-gray-700'
                      "
                      :disabled="requestDetailBodyPreviewSaving"
                      role="switch"
                      type="button"
                      @click="handleRequestDetailBodyPreviewToggle"
                    >
                      <span class="sr-only">{{ t('settings.auto.auto098') }}</span>
                      <span
                        class="absolute left-[2px] top-[2px] h-5 w-5 rounded-full border bg-white transition-transform"
                        :class="
                          claudeConfig.requestDetailBodyPreviewEnabled
                            ? 'translate-x-full border-white'
                            : 'border-gray-300'
                        "
                      ></span>
                    </button>
                  </div>
                </div>
              </div>

              <div class="mt-4 rounded-lg bg-cyan-50 p-4 dark:bg-cyan-900/20">
                <div class="flex">
                  <i class="fas fa-shield-alt mt-0.5 text-cyan-500"></i>
                  <div class="ml-3">
                    <p class="text-sm text-cyan-700 dark:text-cyan-300">
                      <strong>{{ t('settings.auto.auto099') }}</strong>
                      {{
                        claudeConfig.requestDetailBodyPreviewEnabled
                          ? t('settings.manual.captureWithBodyPreview')
                          : t('settings.manual.captureWithoutBodyPreview')
                      }}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <!-- 配置更新信息 -->
            <div
              v-if="claudeConfig.updatedAt"
              class="rounded-lg bg-gray-50 p-4 text-sm text-gray-500 dark:bg-gray-700/50 dark:text-gray-400"
            >
              <i class="fas fa-history mr-2"></i> {{ t('settings.auto.auto027')
              }}{{ formatDateTime(claudeConfig.updatedAt) }}
              <span v-if="claudeConfig.updatedBy" class="ml-2">
                {{ t('settings.auto.auto100') }} <strong>{{ claudeConfig.updatedBy }}</strong>
                {{ t('settings.auto.auto101') }}
              </span>
            </div>
          </div>
        </div>

        <!-- 服务倍率配置部分 -->
        <div v-show="activeSection === 'serviceRates'">
          <!-- 加载状态 -->
          <div v-if="serviceRatesLoading" class="py-12 text-center">
            <div class="loading-spinner mx-auto mb-4"></div>
            <p class="text-gray-500 dark:text-gray-400">{{ t('settings.auto.auto049') }}</p>
          </div>

          <div v-else>
            <!-- 说明卡片 -->
            <div
              class="mb-6 rounded-lg bg-gradient-to-r from-blue-50 to-indigo-50 p-6 dark:from-blue-900/20 dark:to-indigo-900/20"
            >
              <div class="flex items-start">
                <div
                  class="mr-4 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-blue-500 text-white"
                >
                  <i class="fas fa-info"></i>
                </div>
                <div>
                  <h3 class="text-lg font-semibold text-gray-800 dark:text-gray-200">
                    {{ t('settings.auto.auto102') }}
                  </h3>
                  <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
                    {{ t('settings.auto.auto103') }}
                    <strong>{{ serviceRates.baseService || 'claude' }}</strong>
                    {{ t('settings.auto.auto104') }}
                  </p>
                </div>
              </div>
            </div>

            <!-- 倍率配置表格 -->
            <div class="rounded-lg bg-white/80 p-6 shadow-lg backdrop-blur-sm dark:bg-gray-800/80">
              <div class="mb-4 flex items-center justify-between">
                <h2 class="text-lg font-semibold text-gray-800 dark:text-gray-200">
                  <i class="fas fa-sliders-h mr-2 text-blue-500"></i>
                  {{ t('settings.auto.auto105') }}
                </h2>
                <button
                  class="rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50"
                  :disabled="serviceRatesSaving"
                  @click="saveServiceRates"
                >
                  <i class="fas fa-save mr-2"></i>
                  {{ serviceRatesSaving ? t('common.saving') : t('settings.manual.saveConfig') }}
                </button>
              </div>

              <div class="space-y-4">
                <div
                  v-for="(rate, service) in serviceRates.rates"
                  :key="service"
                  class="flex items-center justify-between rounded-lg border border-gray-200 p-4 dark:border-gray-700"
                >
                  <div class="flex items-center">
                    <div
                      class="mr-3 flex h-10 w-10 items-center justify-center rounded-lg"
                      :class="getServiceIconClass(service)"
                    >
                      <i class="text-white" :class="getServiceIcon(service)"></i>
                    </div>
                    <div>
                      <div class="font-medium text-gray-900 dark:text-gray-100">
                        {{ getServiceName(service) }}
                      </div>
                      <div class="text-xs text-gray-500 dark:text-gray-400">
                        {{ service }}
                        <span
                          v-if="service === serviceRates.baseService"
                          class="ml-2 rounded bg-blue-100 px-1.5 py-0.5 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300"
                        >
                          {{ t('settings.auto.auto106') }}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div class="flex items-center gap-3">
                    <input
                      v-model.number="serviceRates.rates[service]"
                      class="w-24 rounded-lg border border-gray-300 px-3 py-2 text-center text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
                      max="10"
                      min="0.1"
                      step="0.1"
                      type="number"
                    />
                    <span class="text-sm text-gray-500 dark:text-gray-400">{{
                      t('settings.auto.auto107')
                    }}</span>
                  </div>
                </div>
              </div>

              <!-- 更新信息 -->
              <div
                v-if="serviceRates.updatedAt"
                class="mt-4 rounded-lg bg-gray-50 p-3 text-sm text-gray-500 dark:bg-gray-700/50 dark:text-gray-400"
              >
                <i class="fas fa-history mr-2"></i> {{ t('settings.auto.auto027')
                }}{{ formatDateTime(serviceRates.updatedAt) }}
                <span v-if="serviceRates.updatedBy" class="ml-2">
                  {{ t('settings.auto.auto100') }} <strong>{{ serviceRates.updatedBy }}</strong>
                  {{ t('settings.auto.auto101') }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- 模型价格部分 -->
        <div v-show="activeSection === 'modelPricing'">
          <ModelPricingSection />
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
                  t(
                    editingPlatform
                      ? 'settings.manual.editNotificationPlatform'
                      : 'settings.manual.addNotificationPlatform'
                  )
                }}
              </h3>
              <p class="mt-0.5 text-sm text-gray-600 dark:text-gray-400">
                {{
                  t(
                    editingPlatform
                      ? 'settings.manual.editWebhookChannel'
                      : 'settings.manual.addWebhookChannel'
                  )
                }}
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
              <i class="fas fa-layer-group mr-2 text-gray-400"></i> {{ t('settings.auto.auto110') }}
            </label>
            <div class="relative">
              <select
                v-model="platformForm.type"
                class="w-full appearance-none rounded-xl border border-gray-300 bg-white px-4 py-3 pr-10 text-gray-900 shadow-sm transition-all focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                :disabled="editingPlatform"
              >
                <option value="wechat_work">{{ t('settings.auto.auto111') }}</option>
                <option value="dingtalk">{{ t('settings.auto.auto112') }}</option>
                <option value="feishu">{{ t('settings.auto.auto113') }}</option>
                <option value="slack">🟣 Slack</option>
                <option value="discord">🟪 Discord</option>
                <option value="telegram">✈️ Telegram</option>
                <option value="bark">🔔 Bark</option>
                <option value="smtp">{{ t('settings.auto.auto114') }}</option>
                <option value="custom">{{ t('settings.auto.auto115') }}</option>
              </select>
              <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                <i class="fas fa-chevron-down text-gray-400"></i>
              </div>
            </div>
            <p v-if="editingPlatform" class="mt-1 text-xs text-amber-600 dark:text-amber-400">
              <i class="fas fa-info-circle mr-1"></i> {{ t('settings.auto.auto116') }}
            </p>
          </div>

          <!-- 平台名称 -->
          <div>
            <label
              class="mb-2 flex items-center text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              <i class="fas fa-tag mr-2 text-gray-400"></i> {{ t('settings.auto.auto117') }}
              <span class="ml-2 text-xs text-gray-500">{{ t('settings.auto.auto118') }}</span>
            </label>
            <input
              v-model="platformForm.name"
              class="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-900 shadow-sm transition-all placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder:text-gray-500"
              :placeholder="t('settings.auto.auto119')"
              type="text"
            />
          </div>

          <!-- Webhook URL (非Bark和SMTP平台) -->
          <div
            v-if="
              platformForm.type !== 'bark' &&
              platformForm.type !== 'smtp' &&
              platformForm.type !== 'telegram'
            "
          >
            <label
              class="mb-2 flex items-center text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              <i class="fas fa-link mr-2 text-gray-400"></i>
              Webhook URL
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

          <!-- Telegram 平台特有字段 -->
          <div v-if="platformForm.type === 'telegram'" class="space-y-5">
            <div>
              <label
                class="mb-2 flex items-center text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                <i class="fas fa-robot mr-2 text-gray-400"></i>
                Bot Token
                <span class="ml-1 text-xs text-red-500">*</span>
              </label>
              <input
                v-model="platformForm.botToken"
                class="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 font-mono text-sm text-gray-900 shadow-sm transition-all placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder:text-gray-500"
                :placeholder="t('settings.auto.auto120')"
                required
                type="text"
              />
              <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {{ t('settings.auto.auto121') }}
              </p>
            </div>

            <div>
              <label
                class="mb-2 flex items-center text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                <i class="fas fa-comments mr-2 text-gray-400"></i>
                Chat ID
                <span class="ml-1 text-xs text-red-500">*</span>
              </label>
              <input
                v-model="platformForm.chatId"
                class="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 font-mono text-sm text-gray-900 shadow-sm transition-all placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder:text-gray-500"
                :placeholder="t('settings.auto.auto122')"
                required
                type="text"
              />
              <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {{ t('settings.auto.auto123') }}
              </p>
            </div>

            <div>
              <label
                class="mb-2 flex items-center text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                <i class="fas fa-globe mr-2 text-gray-400"></i> {{ t('settings.auto.auto124') }}
                <span class="ml-2 text-xs text-gray-500">{{ t('settings.auto.auto118') }}</span>
              </label>
              <input
                v-model="platformForm.apiBaseUrl"
                class="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 font-mono text-sm text-gray-900 shadow-sm transition-all placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder:text-gray-500"
                :placeholder="t('settings.auto.auto125')"
                type="url"
              />
              <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {{ t('settings.auto.auto126') }}
              </p>
            </div>

            <div>
              <label
                class="mb-2 flex items-center text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                <i class="fas fa-route mr-2 text-gray-400"></i> {{ t('settings.auto.auto127') }}
                <span class="ml-2 text-xs text-gray-500">{{ t('settings.auto.auto118') }}</span>
              </label>
              <input
                v-model="platformForm.proxyUrl"
                class="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 font-mono text-sm text-gray-900 shadow-sm transition-all placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder:text-gray-500"
                :placeholder="t('settings.auto.auto128')"
                type="text"
              />
              <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {{ t('settings.auto.auto129') }}
              </p>
            </div>

            <div
              class="flex items-start rounded-lg bg-blue-50 p-3 text-sm text-blue-700 dark:bg-blue-900/20 dark:text-blue-300"
            >
              <i class="fas fa-info-circle mr-2 mt-0.5"></i>
              <div>{{ t('settings.auto.auto130') }}</div>
            </div>
          </div>

          <!-- Bark 平台特有字段 -->
          <div v-if="platformForm.type === 'bark'" class="space-y-5">
            <!-- 设备密钥 -->
            <div>
              <label
                class="mb-2 flex items-center text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                <i class="fas fa-key mr-2 text-gray-400"></i> {{ t('settings.auto.auto131') }}
                <span class="ml-1 text-xs text-red-500">*</span>
              </label>
              <input
                v-model="platformForm.deviceKey"
                class="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 font-mono text-sm text-gray-900 shadow-sm transition-all placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder:text-gray-500"
                :placeholder="t('settings.auto.auto132')"
                required
                type="text"
              />
              <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {{ t('settings.auto.auto133') }}
              </p>
            </div>

            <!-- 服务器URL（可选） -->
            <div>
              <label
                class="mb-2 flex items-center text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                <i class="fas fa-server mr-2 text-gray-400"></i> {{ t('settings.auto.auto134') }}
                <span class="ml-2 text-xs text-gray-500">{{ t('settings.auto.auto118') }}</span>
              </label>
              <input
                v-model="platformForm.serverUrl"
                class="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 font-mono text-sm text-gray-900 shadow-sm transition-all placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder:text-gray-500"
                :placeholder="t('settings.auto.auto135')"
                type="url"
              />
            </div>

            <!-- 通知级别 -->
            <div>
              <label
                class="mb-2 flex items-center text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                <i class="fas fa-flag mr-2 text-gray-400"></i> {{ t('settings.auto.auto136') }}
              </label>
              <select
                v-model="platformForm.level"
                class="w-full appearance-none rounded-xl border border-gray-300 bg-white px-4 py-3 pr-10 text-gray-900 shadow-sm transition-all focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              >
                <option value="">{{ t('settings.auto.auto137') }}</option>
                <option value="passive">{{ t('settings.auto.auto138') }}</option>
                <option value="active">{{ t('settings.auto.auto139') }}</option>
                <option value="timeSensitive">{{ t('settings.auto.auto140') }}</option>
                <option value="critical">{{ t('settings.auto.auto141') }}</option>
              </select>
            </div>

            <!-- 通知声音 -->
            <div>
              <label
                class="mb-2 flex items-center text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                <i class="fas fa-volume-up mr-2 text-gray-400"></i> {{ t('settings.auto.auto142') }}
              </label>
              <select
                v-model="platformForm.sound"
                class="w-full appearance-none rounded-xl border border-gray-300 bg-white px-4 py-3 pr-10 text-gray-900 shadow-sm transition-all focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              >
                <option value="">{{ t('settings.auto.auto137') }}</option>
                <option value="default">{{ t('settings.auto.auto139') }}</option>
                <option value="alarm">{{ t('settings.auto.auto143') }}</option>
                <option value="bell">{{ t('settings.auto.auto144') }}</option>
                <option value="birdsong">{{ t('settings.auto.auto145') }}</option>
                <option value="electronic">{{ t('settings.auto.auto146') }}</option>
                <option value="glass">{{ t('settings.auto.auto147') }}</option>
                <option value="horn">{{ t('settings.auto.auto148') }}</option>
                <option value="silence">{{ t('settings.auto.auto149') }}</option>
              </select>
            </div>

            <!-- 分组 -->
            <div>
              <label
                class="mb-2 flex items-center text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                <i class="fas fa-folder mr-2 text-gray-400"></i> {{ t('settings.auto.auto150') }}
                <span class="ml-2 text-xs text-gray-500">{{ t('settings.auto.auto118') }}</span>
              </label>
              <input
                v-model="platformForm.group"
                class="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-900 shadow-sm transition-all placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder:text-gray-500"
                :placeholder="t('settings.auto.auto151')"
                type="text"
              />
            </div>

            <!-- 提示信息 -->
            <div class="mt-2 flex items-start rounded-lg bg-blue-50 p-3 dark:bg-blue-900/20">
              <i class="fas fa-info-circle mr-2 mt-0.5 text-blue-600 dark:text-blue-400"></i>
              <div class="text-sm text-blue-700 dark:text-blue-300">
                <p>{{ t('settings.auto.auto152') }}</p>
                <p>{{ t('settings.auto.auto153') }}</p>
                <p>{{ t('settings.auto.auto154') }}</p>
              </div>
            </div>
          </div>

          <!-- SMTP 平台特有字段 -->
          <div v-if="platformForm.type === 'smtp'" class="space-y-5">
            <!-- SMTP 主机 -->
            <div>
              <label
                class="mb-2 flex items-center text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                <i class="fas fa-server mr-2 text-gray-400"></i> {{ t('settings.auto.auto155') }}
                <span class="ml-1 text-xs text-red-500">*</span>
              </label>
              <input
                v-model="platformForm.host"
                class="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-900 shadow-sm transition-all placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder:text-gray-500"
                :placeholder="t('settings.auto.auto156')"
                required
                type="text"
              />
            </div>

            <!-- SMTP 端口和安全设置 -->
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label
                  class="mb-2 flex items-center text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  <i class="fas fa-plug mr-2 text-gray-400"></i> {{ t('settings.auto.auto157') }}
                </label>
                <input
                  v-model.number="platformForm.port"
                  class="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-900 shadow-sm transition-all focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  max="65535"
                  min="1"
                  placeholder="587"
                  type="number"
                />
                <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {{ t('settings.auto.auto158') }}
                </p>
              </div>

              <div>
                <label
                  class="mb-2 flex items-center text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  <i class="fas fa-shield-alt mr-2 text-gray-400"></i>
                  {{ t('settings.auto.auto159') }}
                </label>
                <select
                  v-model="platformForm.secure"
                  class="w-full appearance-none rounded-xl border border-gray-300 bg-white px-4 py-3 pr-10 text-gray-900 shadow-sm transition-all focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                >
                  <option :value="false">{{ t('settings.auto.auto160') }}</option>
                  <option :value="true">{{ t('settings.auto.auto161') }}</option>
                </select>
              </div>
            </div>

            <!-- 用户名 -->
            <div>
              <label
                class="mb-2 flex items-center text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                <i class="fas fa-user mr-2 text-gray-400"></i> {{ t('settings.auto.auto162') }}
                <span class="ml-1 text-xs text-red-500">*</span>
              </label>
              <input
                v-model="platformForm.user"
                class="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-900 shadow-sm transition-all placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder:text-gray-500"
                placeholder="user@example.com"
                required
                type="email"
              />
            </div>

            <!-- 密码 -->
            <div>
              <label
                class="mb-2 flex items-center text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                <i class="fas fa-lock mr-2 text-gray-400"></i> {{ t('settings.auto.auto163') }}
                <span class="ml-1 text-xs text-red-500">*</span>
              </label>
              <input
                v-model="platformForm.pass"
                class="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-900 shadow-sm transition-all placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder:text-gray-500"
                :placeholder="t('settings.auto.auto164')"
                required
                type="password"
              />
              <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {{ t('settings.auto.auto165') }}
              </p>
            </div>

            <!-- 发件人邮箱 -->
            <div>
              <label
                class="mb-2 flex items-center text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                <i class="fas fa-paper-plane mr-2 text-gray-400"></i>
                {{ t('settings.auto.auto166') }}
                <span class="ml-2 text-xs text-gray-500">{{ t('settings.auto.auto118') }}</span>
              </label>
              <input
                v-model="platformForm.from"
                class="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-900 shadow-sm transition-all placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder:text-gray-500"
                :placeholder="t('settings.auto.auto167')"
                type="email"
              />
            </div>

            <!-- 收件人邮箱 -->
            <div>
              <label
                class="mb-2 flex items-center text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                <i class="fas fa-envelope mr-2 text-gray-400"></i> {{ t('settings.auto.auto168') }}
                <span class="ml-1 text-xs text-red-500">*</span>
              </label>
              <input
                v-model="platformForm.to"
                class="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-900 shadow-sm transition-all placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder:text-gray-500"
                placeholder="admin@example.com"
                required
                type="email"
              />
              <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {{ t('settings.auto.auto169') }}
              </p>
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
                    {{ t('settings.auto.auto170') }}
                  </span>
                </label>
                <span
                  v-if="platformForm.enableSign"
                  class="rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-700 dark:bg-green-900/50 dark:text-green-400"
                >
                  {{ t('settings.auto.auto171') }}
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
                    {{ t('settings.auto.auto172') }}
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
            <i class="fas fa-asterisk mr-1 text-red-500"></i> {{ t('settings.auto.auto173') }}
          </div>
          <div class="flex space-x-3">
            <button
              class="group flex items-center rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition-all hover:bg-gray-50 hover:shadow-md dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
              @click="closePlatformModal"
            >
              <i class="fas fa-times mr-2 transition-transform group-hover:scale-110"></i>
              {{ t('settings.auto.auto174') }}
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
              {{ testingConnection ? t('settings.manual.testing') : t('settings.auto.auto041') }}
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
                  ? t('common.saving')
                  : editingPlatform
                    ? t('settings.manual.saveChanges')
                    : t('settings.auto.auto038')
              }}
            </button>
          </div>
        </div>
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
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onBeforeUnmount, watch, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { showToast } from '@/utils/tools'
import { useSettingsStore } from '@/stores/settings'

import * as httpApis from '@/utils/http_apis'
import ConfirmModal from '@/components/common/ConfirmModal.vue'
import ModelPricingSection from '@/components/settings/ModelPricingSection.vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
// 定义组件名称，用于keep-alive排除
defineOptions({
  name: 'SettingsView'
})

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

// ConfirmModal 状态
const showConfirmModal = ref(false)
const confirmModalConfig = ref({
  title: '',
  message: '',
  type: 'primary',
  confirmText: t('settings.auto.auto175'),
  cancelText: t('settings.auto.auto174')
})
const confirmResolve = ref(null)

const showConfirm = (
  title,
  message,
  confirmText = t('settings.auto.auto175'),
  cancelText = t('settings.auto.auto174'),
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
  const resolve = confirmResolve.value
  confirmResolve.value = null
  resolve?.(true)
}

const handleCancelModal = () => {
  showConfirmModal.value = false
  const resolve = confirmResolve.value
  confirmResolve.value = null
  resolve?.(false)
}

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
const DEFAULT_WEBHOOK_NOTIFICATION_TYPES = {
  accountAnomaly: true,
  quotaWarning: true,
  systemError: true,
  securityAlert: true,
  rateLimitRecovery: true
}

const webhookConfig = ref({
  enabled: false,
  platforms: [],
  notificationTypes: { ...DEFAULT_WEBHOOK_NOTIFICATION_TYPES },
  retrySettings: {
    maxRetries: 3,
    retryDelay: 1000,
    timeout: 10000
  }
})

// Claude 转发配置
const claudeConfigLoading = ref(false)
const claudeConfig = ref({
  claudeCodeOnlyEnabled: false,
  globalSessionBindingEnabled: false,
  sessionBindingErrorMessage: t('settings.auto.auto062'),
  sessionBindingTtlDays: 1,
  userMessageQueueEnabled: false, // 与后端默认值保持一致
  userMessageQueueDelayMs: 200,
  userMessageQueueTimeoutMs: 5000, // 与后端默认值保持一致（优化后锁持有时间短无需长等待）
  concurrentRequestQueueEnabled: false,
  concurrentRequestQueueMaxSize: 3,
  concurrentRequestQueueMaxSizeMultiplier: 0,
  concurrentRequestQueueTimeoutMs: 10000,
  requestDetailCaptureEnabled: false,
  requestDetailRetentionHours: 6,
  requestDetailBodyPreviewEnabled: false,
  updatedAt: null,
  updatedBy: null
})

const REQUEST_DETAIL_RETENTION_DEFAULT_HOURS = 6
const REQUEST_DETAIL_RETENTION_WARNING_HOURS = 72
const REQUEST_DETAIL_RETENTION_MAX_HOURS = 720

const requestDetailRetentionInput = reactive({
  days: 0,
  hours: REQUEST_DETAIL_RETENTION_DEFAULT_HOURS
})
const requestDetailBodyPreviewSaving = ref(false)

const normalizeRetentionPart = (value) => {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : 0
}

const splitRequestDetailRetentionHours = (totalHours = REQUEST_DETAIL_RETENTION_DEFAULT_HOURS) => {
  const normalized = Math.max(
    1,
    Math.min(REQUEST_DETAIL_RETENTION_MAX_HOURS, normalizeRetentionPart(totalHours))
  )
  return {
    days: Math.floor(normalized / 24),
    hours: normalized % 24
  }
}

const syncRequestDetailRetentionInput = (totalHours = REQUEST_DETAIL_RETENTION_DEFAULT_HOURS) => {
  const { days, hours } = splitRequestDetailRetentionHours(totalHours)
  requestDetailRetentionInput.days = days
  requestDetailRetentionInput.hours = hours
}

const requestDetailRetentionTotalHours = computed(() => {
  const days = normalizeRetentionPart(requestDetailRetentionInput.days)
  const hours = normalizeRetentionPart(requestDetailRetentionInput.hours)
  return days * 24 + hours
})

const requestDetailRetentionError = computed(() => {
  const days = normalizeRetentionPart(requestDetailRetentionInput.days)
  const hours = normalizeRetentionPart(requestDetailRetentionInput.hours)

  if (days < 0 || days > 30) {
    return t('settings.auto.auto176')
  }

  if (hours < 0 || hours > 23) {
    return t('settings.auto.auto177')
  }

  if (requestDetailRetentionTotalHours.value < 1) {
    return t('settings.auto.auto178')
  }

  if (requestDetailRetentionTotalHours.value > REQUEST_DETAIL_RETENTION_MAX_HOURS) {
    return t('settings.auto.auto179')
  }

  return ''
})

const requestDetailRetentionWarning = computed(() => {
  if (
    !requestDetailRetentionError.value &&
    requestDetailRetentionTotalHours.value > REQUEST_DETAIL_RETENTION_WARNING_HOURS
  ) {
    return t('settings.auto.auto180')
  }
  return ''
})

const handleRequestDetailRetentionChange = () => {
  if (requestDetailRetentionError.value) {
    showToast(requestDetailRetentionError.value, 'error')
    return
  }

  claudeConfig.value.requestDetailRetentionHours = requestDetailRetentionTotalHours.value
  saveClaudeConfig()
}

const handleRequestDetailBodyPreviewToggle = async () => {
  if (requestDetailBodyPreviewSaving.value) return

  const nextValue = !claudeConfig.value.requestDetailBodyPreviewEnabled

  requestDetailBodyPreviewSaving.value = true
  try {
    await saveClaudeConfig({ requestDetailBodyPreviewEnabled: nextValue })
  } catch (error) {
    if (error?.name === 'AbortError') return
    showToast(t('settings.auto.auto181'), 'error')
    console.error(error)
  } finally {
    requestDetailBodyPreviewSaving.value = false
  }
}

// 服务倍率配置
const serviceRatesLoading = ref(false)
const serviceRatesSaving = ref(false)
const serviceRates = ref({
  baseService: 'claude',
  rates: {
    claude: 1.0,
    codex: 1.0,
    gemini: 1.0,
    droid: 1.0,
    bedrock: 1.0,
    azure: 1.0,
    ccr: 1.0
  },
  updatedAt: null,
  updatedBy: null
})

// 平台表单相关
const showAddPlatformModal = ref(false)
const editingPlatform = ref(null)
const platformForm = ref({
  type: 'wechat_work',
  name: '',
  url: '',
  enableSign: false,
  secret: '',
  // Telegram特有字段
  botToken: '',
  chatId: '',
  apiBaseUrl: '',
  proxyUrl: '',
  // Bark特有字段
  deviceKey: '',
  serverUrl: '',
  level: '',
  sound: '',
  group: '',
  // SMTP特有字段
  host: '',
  port: null,
  secure: false,
  user: '',
  pass: '',
  from: '',
  to: '',
  timeout: null,
  ignoreTLS: false
})

// 监听activeSection变化，加载对应配置
const sectionWatcher = watch(activeSection, async (newSection) => {
  if (!isMounted.value) return
  if (newSection === 'webhook') {
    await loadWebhookConfig()
  } else if (newSection === 'claude') {
    await loadClaudeConfig()
  } else if (newSection === 'serviceRates') {
    await loadServiceRates()
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
        // 切换到Bark时，清空URL和SMTP相关字段
        platformForm.value.url = ''
        platformForm.value.enableSign = false
        platformForm.value.secret = ''
        // 清空Telegram字段
        platformForm.value.botToken = ''
        platformForm.value.chatId = ''
        platformForm.value.apiBaseUrl = ''
        platformForm.value.proxyUrl = ''
        // 清空SMTP字段
        platformForm.value.host = ''
        platformForm.value.port = null
        platformForm.value.secure = false
        platformForm.value.user = ''
        platformForm.value.pass = ''
        platformForm.value.from = ''
        platformForm.value.to = ''
        platformForm.value.timeout = null
        platformForm.value.ignoreTLS = false
      } else if (newType === 'smtp') {
        // 切换到SMTP时，清空URL和Bark相关字段
        platformForm.value.url = ''
        platformForm.value.enableSign = false
        platformForm.value.secret = ''
        // 清空Bark字段
        platformForm.value.deviceKey = ''
        platformForm.value.serverUrl = ''
        platformForm.value.level = ''
        platformForm.value.sound = ''
        platformForm.value.group = ''
        // 清空Telegram字段
        platformForm.value.botToken = ''
        platformForm.value.chatId = ''
        platformForm.value.apiBaseUrl = ''
        platformForm.value.proxyUrl = ''
      } else if (newType === 'telegram') {
        platformForm.value.url = ''
        platformForm.value.enableSign = false
        platformForm.value.secret = ''
        platformForm.value.deviceKey = ''
        platformForm.value.serverUrl = ''
        platformForm.value.level = ''
        platformForm.value.sound = ''
        platformForm.value.group = ''
        platformForm.value.host = ''
        platformForm.value.port = null
        platformForm.value.secure = false
        platformForm.value.user = ''
        platformForm.value.pass = ''
        platformForm.value.from = ''
        platformForm.value.to = ''
        platformForm.value.timeout = null
        platformForm.value.ignoreTLS = false
        platformForm.value.botToken = ''
        platformForm.value.chatId = ''
        platformForm.value.apiBaseUrl = ''
        platformForm.value.proxyUrl = ''
      } else {
        // 切换到其他平台时，清空Bark和SMTP相关字段
        platformForm.value.deviceKey = ''
        platformForm.value.serverUrl = ''
        platformForm.value.level = ''
        platformForm.value.sound = ''
        platformForm.value.group = ''
        // SMTP 字段
        platformForm.value.host = ''
        platformForm.value.port = null
        platformForm.value.secure = false
        platformForm.value.user = ''
        platformForm.value.pass = ''
        platformForm.value.from = ''
        platformForm.value.to = ''
        platformForm.value.timeout = null
        platformForm.value.ignoreTLS = false
        // Telegram 字段
        platformForm.value.botToken = ''
        platformForm.value.chatId = ''
        platformForm.value.apiBaseUrl = ''
        platformForm.value.proxyUrl = ''
      }
    }
  }
)

// 计算属性：判断平台表单是否有效
const isPlatformFormValid = computed(() => {
  if (platformForm.value.type === 'bark') {
    // Bark平台需要deviceKey
    return !!platformForm.value.deviceKey
  } else if (platformForm.value.type === 'telegram') {
    // Telegram需要机器人Token和Chat ID
    return !!(platformForm.value.botToken && platformForm.value.chatId)
  } else if (platformForm.value.type === 'smtp') {
    // SMTP平台需要必要的配置
    return !!(
      platformForm.value.host &&
      platformForm.value.user &&
      platformForm.value.pass &&
      platformForm.value.to
    )
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
    if (activeSection.value === 'serviceRates') {
      await loadServiceRates()
    }
  } catch (error) {
    showToast(t('settings.auto.auto182'), 'error')
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
    const response = await httpApis.getWebhookConfigApi({
      signal: abortController.value.signal
    })
    if (response.success && isMounted.value) {
      const config = response.config || {}
      webhookConfig.value = {
        ...config,
        notificationTypes: {
          ...DEFAULT_WEBHOOK_NOTIFICATION_TYPES,
          ...(config.notificationTypes || {})
        }
      }
    }
  } catch (error) {
    if (error.name === 'AbortError') return
    if (!isMounted.value) return
    showToast(t('settings.auto.auto183'), 'error')
    console.error(error)
  }
}

// 保存webhook配置
const saveWebhookConfig = async () => {
  if (!isMounted.value) return
  try {
    const payload = {
      ...webhookConfig.value,
      notificationTypes: {
        ...DEFAULT_WEBHOOK_NOTIFICATION_TYPES,
        ...(webhookConfig.value.notificationTypes || {})
      }
    }

    const response = await httpApis.updateWebhookConfigApi(payload, {
      signal: abortController.value.signal
    })
    if (response.success && isMounted.value) {
      webhookConfig.value = payload
      showToast(t('settings.auto.auto184'), 'success')
    }
  } catch (error) {
    if (error.name === 'AbortError') return
    if (!isMounted.value) return
    showToast(t('settings.auto.auto185'), 'error')
    console.error(error)
  }
}

// 加载 Claude 转发配置
const loadClaudeConfig = async () => {
  if (!isMounted.value) return
  claudeConfigLoading.value = true
  try {
    const response = await httpApis.getClaudeRelayConfigApi({
      signal: abortController.value.signal
    })
    if (response.success && isMounted.value) {
      claudeConfig.value = {
        claudeCodeOnlyEnabled: response.config?.claudeCodeOnlyEnabled ?? false,
        globalSessionBindingEnabled: response.config?.globalSessionBindingEnabled ?? false,
        sessionBindingErrorMessage:
          response.config?.sessionBindingErrorMessage || t('settings.auto.auto062'),
        sessionBindingTtlDays: response.config?.sessionBindingTtlDays ?? 1,
        userMessageQueueEnabled: response.config?.userMessageQueueEnabled ?? false, // 与后端默认值保持一致
        userMessageQueueDelayMs: response.config?.userMessageQueueDelayMs ?? 200,
        userMessageQueueTimeoutMs: response.config?.userMessageQueueTimeoutMs ?? 5000, // 与后端默认值保持一致
        concurrentRequestQueueEnabled: response.config?.concurrentRequestQueueEnabled ?? false,
        concurrentRequestQueueMaxSize: response.config?.concurrentRequestQueueMaxSize ?? 3,
        concurrentRequestQueueMaxSizeMultiplier:
          response.config?.concurrentRequestQueueMaxSizeMultiplier ?? 0,
        concurrentRequestQueueTimeoutMs: response.config?.concurrentRequestQueueTimeoutMs ?? 10000,
        requestDetailCaptureEnabled: response.config?.requestDetailCaptureEnabled ?? false,
        requestDetailRetentionHours:
          response.config?.requestDetailRetentionHours ?? REQUEST_DETAIL_RETENTION_DEFAULT_HOURS,
        requestDetailBodyPreviewEnabled: response.config?.requestDetailBodyPreviewEnabled ?? false,
        updatedAt: response.config?.updatedAt || null,
        updatedBy: response.config?.updatedBy || null
      }
      syncRequestDetailRetentionInput(claudeConfig.value.requestDetailRetentionHours)
    }
  } catch (error) {
    if (error.name === 'AbortError') return
    if (!isMounted.value) return
    showToast(t('settings.auto.auto186'), 'error')
    console.error(error)
  } finally {
    if (isMounted.value) {
      claudeConfigLoading.value = false
    }
  }
}

// 保存 Claude 转发配置
const saveClaudeConfig = async (options = {}) => {
  if (!isMounted.value) return
  try {
    const requestDetailBodyPreviewEnabled = Object.prototype.hasOwnProperty.call(
      options,
      'requestDetailBodyPreviewEnabled'
    )
      ? options.requestDetailBodyPreviewEnabled === true
      : claudeConfig.value.requestDetailBodyPreviewEnabled

    const payload = {
      claudeCodeOnlyEnabled: claudeConfig.value.claudeCodeOnlyEnabled,
      globalSessionBindingEnabled: claudeConfig.value.globalSessionBindingEnabled,
      sessionBindingErrorMessage: claudeConfig.value.sessionBindingErrorMessage,
      sessionBindingTtlDays: claudeConfig.value.sessionBindingTtlDays,
      userMessageQueueEnabled: claudeConfig.value.userMessageQueueEnabled,
      userMessageQueueDelayMs: claudeConfig.value.userMessageQueueDelayMs,
      userMessageQueueTimeoutMs: claudeConfig.value.userMessageQueueTimeoutMs,
      concurrentRequestQueueEnabled: claudeConfig.value.concurrentRequestQueueEnabled,
      concurrentRequestQueueMaxSize: claudeConfig.value.concurrentRequestQueueMaxSize,
      concurrentRequestQueueMaxSizeMultiplier:
        claudeConfig.value.concurrentRequestQueueMaxSizeMultiplier,
      concurrentRequestQueueTimeoutMs: claudeConfig.value.concurrentRequestQueueTimeoutMs,
      requestDetailCaptureEnabled: claudeConfig.value.requestDetailCaptureEnabled,
      requestDetailRetentionHours: claudeConfig.value.requestDetailRetentionHours,
      requestDetailBodyPreviewEnabled
    }

    if (options.purgeRequestDetailBodySnapshots === true) {
      payload.purgeRequestDetailBodySnapshots = true
    }

    const response = await httpApis.updateClaudeRelayConfigApi(payload, {
      signal: abortController.value.signal
    })
    if (response.success && isMounted.value) {
      claudeConfig.value = {
        ...claudeConfig.value,
        requestDetailRetentionHours:
          response.config?.requestDetailRetentionHours ??
          claudeConfig.value.requestDetailRetentionHours,
        requestDetailBodyPreviewEnabled:
          response.config?.requestDetailBodyPreviewEnabled ??
          claudeConfig.value.requestDetailBodyPreviewEnabled,
        updatedAt: response.config?.updatedAt || new Date().toISOString(),
        updatedBy: response.config?.updatedBy || null
      }
      syncRequestDetailRetentionInput(claudeConfig.value.requestDetailRetentionHours)
      showToast(
        response.warning || response.message || t('settings.auto.auto187'),
        response.warning ? 'warning' : 'success'
      )
      return response
    }

    if (isMounted.value) {
      showToast(response.message || t('settings.auto.auto188'), 'error')
    }
    return response
  } catch (error) {
    if (error.name === 'AbortError') return
    if (!isMounted.value) return
    showToast(t('settings.auto.auto188'), 'error')
    console.error(error)
    return { success: false, message: error.message || t('settings.auto.auto188') }
  }
}

// 加载服务倍率配置
const loadServiceRates = async () => {
  if (!isMounted.value) return
  serviceRatesLoading.value = true
  try {
    const response = await httpApis.getAdminServiceRatesApi({
      signal: abortController.value.signal
    })
    if (response.success && isMounted.value) {
      serviceRates.value = {
        baseService: response.data?.baseService || 'claude',
        rates: response.data?.rates || serviceRates.value.rates,
        updatedAt: response.data?.updatedAt,
        updatedBy: response.data?.updatedBy
      }
    }
  } catch (error) {
    if (error.name === 'AbortError') return
    if (!isMounted.value) return
    console.error(t('settings.auto.auto189'), error)
  } finally {
    if (isMounted.value) {
      serviceRatesLoading.value = false
    }
  }
}

// 保存服务倍率配置
const saveServiceRates = async () => {
  if (!isMounted.value) return
  serviceRatesSaving.value = true
  try {
    const response = await httpApis.updateAdminServiceRatesApi(
      {
        rates: serviceRates.value.rates,
        baseService: serviceRates.value.baseService
      },
      { signal: abortController.value.signal }
    )
    if (response.success && isMounted.value) {
      serviceRates.value.updatedAt = response.data?.updatedAt || new Date().toISOString()
      serviceRates.value.updatedBy = response.data?.updatedBy
      showToast(t('settings.auto.auto190'), 'success')
    }
  } catch (error) {
    if (error.name === 'AbortError') return
    if (!isMounted.value) return
    showToast(t('settings.auto.auto191'), 'error')
    console.error(error)
  } finally {
    if (isMounted.value) {
      serviceRatesSaving.value = false
    }
  }
}

// 服务图标和名称映射
const getServiceIcon = (service) => {
  const icons = {
    claude: 'fas fa-robot',
    codex: 'fas fa-code',
    gemini: 'fas fa-gem',
    droid: 'fas fa-android',
    bedrock: 'fab fa-aws',
    azure: 'fab fa-microsoft',
    ccr: 'fas fa-server'
  }
  return icons[service] || 'fas fa-cog'
}

const getServiceIconClass = (service) => {
  const classes = {
    claude: 'bg-gradient-to-br from-orange-500 to-amber-600',
    codex: 'bg-gradient-to-br from-green-500 to-emerald-600',
    gemini: 'bg-gradient-to-br from-blue-500 to-indigo-600',
    droid: 'bg-gradient-to-br from-green-600 to-lime-600',
    bedrock: 'bg-gradient-to-br from-yellow-500 to-orange-600',
    azure: 'bg-gradient-to-br from-blue-600 to-cyan-600',
    ccr: 'bg-gradient-to-br from-purple-500 to-pink-600'
  }
  return classes[service] || 'bg-gradient-to-br from-gray-500 to-gray-600'
}

const getServiceName = (service) => {
  const names = {
    claude: 'Claude',
    codex: 'Codex (OpenAI)',
    gemini: 'Gemini',
    droid: 'Droid',
    bedrock: 'AWS Bedrock',
    azure: 'Azure OpenAI',
    ccr: 'CCR'
  }
  return names[service] || service
}

// 验证 URL
const validateUrl = () => {
  // Bark和SMTP平台不需要验证URL
  if (['bark', 'smtp', 'telegram'].includes(platformForm.value.type)) {
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

// 验证平台配置
const validatePlatformForm = () => {
  if (platformForm.value.type === 'bark') {
    if (!platformForm.value.deviceKey) {
      showToast(t('settings.auto.auto192'), 'error')
      return false
    }
  } else if (platformForm.value.type === 'telegram') {
    if (!platformForm.value.botToken) {
      showToast(t('settings.auto.auto193'), 'error')
      return false
    }
    if (!platformForm.value.chatId) {
      showToast(t('settings.auto.auto194'), 'error')
      return false
    }
    if (platformForm.value.apiBaseUrl) {
      try {
        const parsed = new URL(platformForm.value.apiBaseUrl)
        if (!['http:', 'https:'].includes(parsed.protocol)) {
          showToast(t('settings.auto.auto195'), 'error')
          return false
        }
      } catch (error) {
        showToast(t('settings.auto.auto196'), 'error')
        return false
      }
    }
    if (platformForm.value.proxyUrl) {
      try {
        const parsed = new URL(platformForm.value.proxyUrl)
        const supportedProtocols = ['http:', 'https:', 'socks4:', 'socks4a:', 'socks5:']
        if (!supportedProtocols.includes(parsed.protocol)) {
          showToast(t('settings.auto.auto197'), 'error')
          return false
        }
      } catch (error) {
        showToast(t('settings.auto.auto198'), 'error')
        return false
      }
    }
  } else if (platformForm.value.type === 'smtp') {
    const requiredFields = [
      { field: 'host', message: t('settings.auto.auto199') },
      { field: 'user', message: t('settings.auto.auto162') },
      { field: 'pass', message: t('settings.auto.auto200') },
      { field: 'to', message: t('settings.auto.auto168') }
    ]

    for (const { field, message } of requiredFields) {
      if (!platformForm.value[field]) {
        showToast(`${t('settings.auto.auto201')}${message}`, 'error')
        return false
      }
    }
  } else {
    if (!platformForm.value.url) {
      showToast(t('settings.auto.auto202'), 'error')
      return false
    }
    if (urlError.value) {
      showToast(t('settings.auto.auto203'), 'error')
      return false
    }
  }
  return true
}

// 添加/更新平台
const savePlatform = async () => {
  if (!isMounted.value) return

  // 验证表单
  if (!validatePlatformForm()) return

  savingPlatform.value = true
  try {
    let response
    if (editingPlatform.value) {
      // 更新平台
      response = await httpApis.updateWebhookPlatformApi(
        editingPlatform.value.id,
        platformForm.value,
        {
          signal: abortController.value.signal
        }
      )
    } else {
      // 添加平台
      response = await httpApis.createWebhookPlatformApi(platformForm.value, {
        signal: abortController.value.signal
      })
    }

    if (response.success && isMounted.value) {
      showToast(
        editingPlatform.value ? t('settings.auto.auto204') : t('settings.auto.auto205'),
        'success'
      )
      await loadWebhookConfig()
      closePlatformModal()
    }
  } catch (error) {
    if (error.name === 'AbortError') return
    if (!isMounted.value) return
    showToast(error.message || t('settings.auto.auto206'), 'error')
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
  platformForm.value = {
    type: platform.type || 'wechat_work',
    name: platform.name || '',
    url: platform.url || '',
    enableSign: platform.enableSign || false,
    secret: platform.secret || '',
    // Telegram特有字段
    botToken: platform.botToken || '',
    chatId: platform.chatId || '',
    apiBaseUrl: platform.apiBaseUrl || '',
    proxyUrl: platform.proxyUrl || '',
    // Bark特有字段
    deviceKey: platform.deviceKey || '',
    serverUrl: platform.serverUrl || '',
    level: platform.level || '',
    sound: platform.sound || '',
    group: platform.group || '',
    // SMTP特有字段
    host: platform.host || '',
    port: platform.port ?? null,
    secure: platform.secure || false,
    user: platform.user || '',
    pass: platform.pass || '',
    from: platform.from || '',
    to: Array.isArray(platform.to) ? platform.to.join(', ') : platform.to || '',
    timeout: platform.timeout ?? null,
    ignoreTLS: platform.ignoreTLS || false
  }
  showAddPlatformModal.value = true
}

// 删除平台
const deletePlatform = async (id) => {
  if (!isMounted.value) return

  if (
    !(await showConfirm(
      t('settings.auto.auto207'),
      t('settings.auto.auto208'),
      t('settings.auto.auto015'),
      t('settings.auto.auto174'),
      'danger'
    ))
  ) {
    return
  }

  try {
    const response = await httpApis.deleteWebhookPlatformApi(id, {
      signal: abortController.value.signal
    })
    if (response.success && isMounted.value) {
      showToast(t('settings.auto.auto209'), 'success')
      await loadWebhookConfig()
    }
  } catch (error) {
    if (error.name === 'AbortError') return
    if (!isMounted.value) return
    showToast(t('settings.auto.auto210'), 'error')
    console.error(error)
  }
}

// 切换平台状态
const togglePlatform = async (id) => {
  if (!isMounted.value) return

  try {
    const response = await httpApis.toggleWebhookPlatformApi(id, {
      signal: abortController.value.signal
    })
    if (response.success && isMounted.value) {
      showToast(response.message, 'success')
      await loadWebhookConfig()
    }
  } catch (error) {
    if (error.name === 'AbortError') return
    if (!isMounted.value) return
    showToast(t('settings.auto.auto206'), 'error')
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
    } else if (platform.type === 'smtp') {
      testData.host = platform.host
      testData.port = platform.port
      testData.secure = platform.secure
      testData.user = platform.user
      testData.pass = platform.pass
      testData.from = platform.from
      testData.to = platform.to
      testData.ignoreTLS = platform.ignoreTLS
    } else if (platform.type === 'telegram') {
      testData.botToken = platform.botToken
      testData.chatId = platform.chatId
      testData.apiBaseUrl = platform.apiBaseUrl
      testData.proxyUrl = platform.proxyUrl
    } else {
      testData.url = platform.url
    }

    const response = await httpApis.testWebhookApi(testData, {
      signal: abortController.value.signal
    })
    if (response.success && isMounted.value) {
      showToast(t('settings.auto.auto211'), 'success')
    }
  } catch (error) {
    if (error.name === 'AbortError') return
    if (!isMounted.value) return
    showToast(error.error || error.message || t('settings.auto.auto212'), 'error')
    console.error(error)
  }
}

// 测试表单中的平台
const testPlatformForm = async () => {
  if (!isMounted.value) return

  // 验证表单
  if (!validatePlatformForm()) return

  testingConnection.value = true
  try {
    const response = await httpApis.testWebhookApi(platformForm.value, {
      signal: abortController.value.signal
    })
    if (response.success && isMounted.value) {
      showToast(t('settings.auto.auto211'), 'success')
    }
  } catch (error) {
    if (error.name === 'AbortError') return
    if (!isMounted.value) return
    showToast(error.error || error.message || t('settings.auto.auto212'), 'error')
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
    const response = await httpApis.testWebhookNotificationApi({
      signal: abortController.value.signal
    })
    if (response.success && isMounted.value) {
      showToast(t('settings.auto.auto213'), 'success')
    }
  } catch (error) {
    if (error.name === 'AbortError') return
    if (!isMounted.value) return
    const errorMessage =
      error?.response?.data?.message ||
      error?.response?.data?.error ||
      error?.message ||
      t('settings.auto.auto214')
    showToast(errorMessage, 'error')
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
      // Telegram特有字段
      botToken: '',
      chatId: '',
      apiBaseUrl: '',
      proxyUrl: '',
      // Bark特有字段
      deviceKey: '',
      serverUrl: '',
      level: '',
      sound: '',
      group: '',
      // SMTP特有字段
      host: '',
      port: null,
      secure: false,
      user: '',
      pass: '',
      from: '',
      to: '',
      timeout: null,
      ignoreTLS: false
    }
    urlError.value = false
    urlValid.value = false
    testingConnection.value = false
    savingPlatform.value = false
  }, 0)
}

// 辅助函数
const getPlatformName = (type) => {
  const names = {
    wechat_work: t('settings.auto.auto215'),
    dingtalk: t('settings.auto.auto216'),
    feishu: t('settings.auto.auto217'),
    slack: 'Slack',
    discord: 'Discord',
    telegram: 'Telegram',
    bark: 'Bark',
    smtp: t('settings.auto.auto218'),
    custom: t('settings.auto.auto219')
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
    telegram: 'fab fa-telegram-plane text-sky-500',
    bark: 'fas fa-bell text-orange-500',
    smtp: 'fas fa-envelope text-blue-600',
    custom: 'fas fa-webhook text-gray-600'
  }
  return icons[type] || 'fas fa-bell'
}

const getWebhookHint = (type) => {
  const hints = {
    wechat_work: t('settings.auto.auto220'),
    dingtalk: t('settings.auto.auto221'),
    feishu: t('settings.auto.auto222'),
    slack: t('settings.auto.auto223'),
    discord: t('settings.auto.auto224'),
    telegram: t('settings.auto.auto225'),
    bark: t('settings.auto.auto226'),
    smtp: t('settings.auto.auto227'),
    custom: t('settings.auto.auto228')
  }
  return hints[type] || ''
}

const formatTelegramToken = (token) => {
  if (!token) return ''
  if (token.length <= 12) return token
  return `${token.slice(0, 6)}...${token.slice(-4)}`
}

const getNotificationTypeName = (type) => {
  const names = {
    accountAnomaly: t('settings.auto.auto229'),
    quotaWarning: t('settings.auto.auto230'),
    systemError: t('settings.auto.auto231'),
    securityAlert: t('settings.auto.auto232'),
    rateLimitRecovery: t('settings.auto.auto233'),
    test: t('settings.auto.auto234')
  }
  return names[type] || type
}

const getNotificationTypeDescription = (type) => {
  const descriptions = {
    accountAnomaly: t('settings.auto.auto235'),
    quotaWarning: t('settings.auto.auto236'),
    systemError: t('settings.auto.auto237'),
    securityAlert: t('settings.auto.auto238'),
    rateLimitRecovery: t('settings.auto.auto239'),
    test: t('settings.auto.auto240')
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
      showAdminButton: oemSettings.value.showAdminButton,
      apiStatsNotice: oemSettings.value.apiStatsNotice
    }
    const result = await settingsStore.saveOemSettings(settings)
    if (result && result.success) {
      showToast(t('settings.auto.auto241'), 'success')
    } else {
      showToast(result?.message || t('settings.auto.auto242'), 'error')
    }
  } catch (error) {
    showToast(t('settings.auto.auto243'), 'error')
  }
}

// 重置OEM设置
const resetOemSettings = async () => {
  if (
    !(await showConfirm(
      t('settings.auto.auto244'),
      t('settings.auto.auto245'),
      t('settings.auto.auto246'),
      t('settings.auto.auto174'),
      'warning'
    ))
  )
    return

  try {
    const result = await settingsStore.resetOemSettings()
    if (result && result.success) {
      showToast(t('settings.auto.auto247'), 'success')
    } else {
      showToast(t('settings.auto.auto248'), 'error')
    }
  } catch (error) {
    showToast(t('settings.auto.auto248'), 'error')
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
    showToast(t('settings.auto.auto249'), 'error')
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
  console.warn('Icon failed to load')
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
  background: var(--bg-gradient-start);
  border: 1px solid var(--border-color);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.3);
}

.table-container {
  overflow: hidden;
  border-radius: 8px;
  border: 1px solid #f3f4f6;
}

:root.dark .table-container {
  border: 1px solid var(--border-color);
}

.table-row {
  transition: background-color 0.2s ease;
}

.table-row:hover {
  background-color: #f9fafb;
}

:root.dark .table-row:hover {
  background-color: var(--bg-gradient-mid);
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
