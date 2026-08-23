<template>
  <div class="settings-container">
    <!-- 不再套内层 .card：外层 MainLayout 已是卡片，这里只做内容容器，避免卡片套卡片 -->
    <div>
      <!-- 设置分类导航（路由切换） -->
      <div class="mb-6">
        <nav class="flex space-x-8 overflow-x-auto">
          <router-link
            v-for="tab in sectionTabs"
            :key="tab.key"
            :class="[
              'whitespace-nowrap border-b-2 pb-2 text-sm font-medium transition-colors',
              activeSection === tab.key
                ? 'border-blue-500 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
            ]"
            :to="{ name: 'Settings', params: { section: tab.key } }"
          >
            <i :class="['fas', tab.icon, 'mr-2']" />
            {{ tab.label }}
          </router-link>
        </nav>
      </div>

      <!-- 加载状态 -->
      <div v-if="loading" class="py-12 text-center">
        <div class="loading-spinner mx-auto mb-4"></div>
        <p class="text-gray-500 dark:text-gray-400">正在加载设置...</p>
      </div>

      <!-- 内容区域 -->
      <div v-else>
        <!-- 品牌设置部分 -->
        <div v-show="activeSection === 'branding'">
          <!-- 设置项：扁平行布局，hairline 分隔，无嵌套卡片/图标方块 -->
          <div class="divide-y divide-gray-100 dark:divide-gray-700/60">
            <!-- 网站名称 -->
            <div class="flex flex-col gap-2 py-5 sm:flex-row sm:items-start sm:gap-8">
              <div class="sm:w-52 sm:flex-shrink-0">
                <div class="text-sm font-semibold text-gray-900 dark:text-gray-100">网站名称</div>
                <p class="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                  显示在浏览器标题和页面头部
                </p>
              </div>
              <div class="sm:flex-1">
                <textarea
                  v-model="oemSettings.siteName"
                  class="form-input w-full resize-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
                  maxlength="100"
                  placeholder="Claude Relay Service"
                  rows="3"
                ></textarea>
                <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">最多 100 字符</p>
              </div>
            </div>

            <!-- 网站图标 -->
            <div class="flex flex-col gap-2 py-5 sm:flex-row sm:items-start sm:gap-8">
              <div class="sm:w-52 sm:flex-shrink-0">
                <div class="text-sm font-semibold text-gray-900 dark:text-gray-100">网站图标</div>
                <p class="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                  支持 .ico, .png, .jpg, .svg 格式，最大 350KB
                </p>
              </div>
              <div class="space-y-3 sm:flex-1">
                <!-- 图标预览 -->
                <div
                  v-if="oemSettings.siteIconData || oemSettings.siteIcon"
                  class="inline-flex items-center gap-3 rounded-lg bg-gray-50 p-3 dark:bg-gray-700/50"
                >
                  <img
                    alt="图标预览"
                    class="h-8 w-8"
                    :src="oemSettings.siteIconData || oemSettings.siteIcon"
                    @error="handleIconError"
                  />
                  <span class="text-sm text-gray-600 dark:text-gray-400">当前图标</span>
                  <button
                    class="rounded-lg px-3 py-1 font-medium text-red-600 transition-colors hover:bg-red-50 hover:text-red-900 dark:hover:bg-red-900/20"
                    @click="removeIcon"
                  >
                    <i class="fas fa-trash mr-1" />删除
                  </button>
                </div>
                <!-- 上传 -->
                <div>
                  <input
                    ref="iconFileInput"
                    accept=".ico,.png,.jpg,.jpeg,.svg"
                    class="hidden"
                    type="file"
                    @change="handleIconUpload"
                  />
                  <button class="btn btn-success px-4 py-2" @click="$refs.iconFileInput.click()">
                    <i class="fas fa-upload mr-2" />
                    上传图标
                  </button>
                </div>
              </div>
            </div>

            <!-- 管理入口 -->
            <div class="flex flex-col gap-2 py-5 sm:flex-row sm:items-start sm:gap-8">
              <div class="sm:w-52 sm:flex-shrink-0">
                <div class="text-sm font-semibold text-gray-900 dark:text-gray-100">管理入口</div>
                <p class="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                  隐藏后，用户需直接访问 /admin/login 页面登录
                </p>
              </div>
              <div class="sm:flex-1">
                <label class="inline-flex cursor-pointer items-center">
                  <input v-model="hideAdminButton" class="peer sr-only" type="checkbox" />
                  <div
                    class="peer relative h-6 w-11 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-blue-600 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:border-gray-600 dark:bg-gray-700 dark:peer-focus:ring-blue-800"
                  ></div>
                  <span class="ml-3 text-sm font-medium text-gray-900 dark:text-gray-300">{{
                    hideAdminButton ? '隐藏登录按钮' : '显示登录按钮'
                  }}</span>
                </label>
              </div>
            </div>

            <!-- 统计页通知 -->
            <div class="flex flex-col gap-2 py-5 sm:flex-row sm:items-start sm:gap-8">
              <div class="sm:w-52 sm:flex-shrink-0">
                <div class="text-sm font-semibold text-gray-900 dark:text-gray-100">统计页通知</div>
                <p class="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                  在 API Stats 页面顶部展示公告
                </p>
              </div>
              <div class="space-y-3 sm:flex-1">
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
                    oemSettings.apiStatsNotice.enabled ? '已启用' : '已禁用'
                  }}</span>
                </label>
                <div v-if="oemSettings.apiStatsNotice.enabled" class="space-y-3">
                  <div>
                    <label class="mb-1 block text-sm text-gray-500 dark:text-gray-400">标题</label>
                    <input
                      v-model="oemSettings.apiStatsNotice.title"
                      class="form-input w-full max-w-md dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
                      maxlength="100"
                      placeholder="通知标题"
                      type="text"
                    />
                  </div>
                  <div>
                    <label class="mb-1 block text-sm text-gray-500 dark:text-gray-400">内容</label>
                    <textarea
                      v-model="oemSettings.apiStatsNotice.content"
                      class="form-input w-full max-w-md resize-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
                      maxlength="2000"
                      placeholder="通知内容（支持换行）"
                      rows="3"
                    ></textarea>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 操作栏 -->
          <div class="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div class="flex flex-col gap-3 sm:flex-row">
              <button
                class="btn btn-primary px-6 py-3"
                :class="{ 'cursor-not-allowed opacity-50': saving }"
                :disabled="saving"
                @click="saveOemSettings"
              >
                <div v-if="saving" class="loading-spinner mr-2"></div>
                <i v-else class="fas fa-save mr-2" />
                {{ saving ? '保存中...' : '保存设置' }}
              </button>
              <button
                class="btn bg-gray-100 px-6 py-3 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                :disabled="saving"
                @click="resetOemSettings"
              >
                <i class="fas fa-undo mr-2" />
                重置为默认
              </button>
            </div>
            <div v-if="oemSettings.updatedAt" class="text-sm text-gray-500 dark:text-gray-400">
              <i class="fas fa-clock mr-1" />
              最后更新：{{ formatDateTime(oemSettings.updatedAt) }}
            </div>
          </div>
        </div>

        <!-- Webhook 设置部分：与品牌设置同一套扁平行布局 -->
        <div v-show="activeSection === 'webhook'">
          <div class="divide-y divide-gray-100 dark:divide-gray-700/60">
            <!-- 主开关 -->
            <div class="flex flex-col gap-2 py-5 sm:flex-row sm:items-center sm:gap-8">
              <div class="sm:w-52 sm:flex-shrink-0">
                <div class="text-sm font-semibold text-gray-900 dark:text-gray-100">启用通知</div>
                <p class="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                  开启后按下方配置推送到各平台
                </p>
              </div>
              <div class="sm:flex-1">
                <label class="inline-flex cursor-pointer items-center">
                  <input
                    v-model="webhookConfig.enabled"
                    class="peer sr-only"
                    type="checkbox"
                    @change="saveWebhookConfig"
                  />
                  <div
                    class="peer relative h-6 w-11 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-blue-600 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:border-gray-600 dark:bg-gray-700 dark:peer-focus:ring-blue-800"
                  ></div>
                  <span class="ml-3 text-sm font-medium text-gray-900 dark:text-gray-300">{{
                    webhookConfig.enabled ? '已启用' : '已关闭'
                  }}</span>
                </label>
              </div>
            </div>

            <!-- 通知类型 -->
            <div class="flex flex-col gap-2 py-5 sm:flex-row sm:items-start sm:gap-8">
              <div class="sm:w-52 sm:flex-shrink-0">
                <div class="text-sm font-semibold text-gray-900 dark:text-gray-100">通知类型</div>
                <p class="mt-0.5 text-sm text-gray-500 dark:text-gray-400">选择需要推送的事件</p>
              </div>
              <div class="space-y-2 sm:flex-1">
                <div
                  v-for="(enabled, type) in webhookConfig.notificationTypes"
                  :key="type"
                  class="flex items-center justify-between gap-4 rounded-lg bg-gray-50 px-3 py-2.5 dark:bg-gray-700/40"
                >
                  <div class="min-w-0">
                    <div class="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {{ getNotificationTypeName(type) }}
                    </div>
                    <div class="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                      {{ getNotificationTypeDescription(type) }}
                    </div>
                  </div>
                  <label class="relative inline-flex flex-shrink-0 cursor-pointer items-center">
                    <input
                      v-model="webhookConfig.notificationTypes[type]"
                      class="peer sr-only"
                      type="checkbox"
                      @change="saveWebhookConfig"
                    />
                    <div
                      class="peer relative h-6 w-11 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-blue-600 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:border-gray-600 dark:bg-gray-700 dark:peer-focus:ring-blue-800"
                    ></div>
                  </label>
                </div>
              </div>
            </div>

            <!-- 通知平台 -->
            <div class="flex flex-col gap-2 py-5 sm:flex-row sm:items-start sm:gap-8">
              <div class="sm:w-52 sm:flex-shrink-0">
                <div class="text-sm font-semibold text-gray-900 dark:text-gray-100">通知平台</div>
                <p class="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                  企业微信 / 钉钉 / 飞书 / Telegram 等
                </p>
              </div>
              <div class="space-y-3 sm:flex-1">
                <div class="flex justify-end">
                  <button
                    class="inline-flex items-center rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
                    @click="showAddPlatformModal = true"
                  >
                    <i class="fas fa-plus mr-2"></i>
                    添加平台
                  </button>
                </div>

                <div
                  v-if="webhookConfig.platforms && webhookConfig.platforms.length > 0"
                  class="space-y-3"
                >
                  <div
                    v-for="platform in webhookConfig.platforms"
                    :key="platform.id"
                    class="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800/50"
                  >
                    <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div class="min-w-0 flex-1">
                        <div class="flex items-center gap-3">
                          <div
                            class="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-700"
                          >
                            <i class="text-base" :class="getPlatformIcon(platform.type)"></i>
                          </div>
                          <div class="min-w-0">
                            <div
                              class="truncate text-sm font-semibold text-gray-900 dark:text-gray-100"
                            >
                              {{ platform.name || getPlatformName(platform.type) }}
                            </div>
                            <div class="text-sm text-gray-500 dark:text-gray-400">
                              {{ getPlatformName(platform.type) }}
                              <span
                                :class="
                                  platform.enabled
                                    ? 'text-green-600 dark:text-green-400'
                                    : 'text-gray-400'
                                "
                              >
                                · {{ platform.enabled ? '启用中' : '已停用' }}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div
                          class="mt-3 space-y-1 pl-0 text-sm text-gray-600 dark:text-gray-400 sm:pl-12"
                        >
                          <div
                            v-if="platform.type !== 'smtp' && platform.type !== 'telegram'"
                            class="flex items-center gap-2"
                          >
                            <i class="fas fa-link w-4 flex-shrink-0 text-gray-400"></i>
                            <span class="truncate">{{ platform.url }}</span>
                          </div>
                          <div v-if="platform.type === 'telegram'" class="flex items-center gap-2">
                            <i class="fas fa-comments w-4 flex-shrink-0 text-gray-400"></i>
                            <span class="truncate">Chat ID: {{ platform.chatId || '未配置' }}</span>
                          </div>
                          <div
                            v-if="platform.type === 'telegram' && platform.botToken"
                            class="flex items-center gap-2"
                          >
                            <i class="fas fa-key w-4 flex-shrink-0 text-gray-400"></i>
                            <span class="truncate"
                              >Token: {{ formatTelegramToken(platform.botToken) }}</span
                            >
                          </div>
                          <div
                            v-if="platform.type === 'telegram' && platform.apiBaseUrl"
                            class="flex items-center gap-2"
                          >
                            <i class="fas fa-globe w-4 flex-shrink-0 text-gray-400"></i>
                            <span class="truncate">API: {{ platform.apiBaseUrl }}</span>
                          </div>
                          <div
                            v-if="platform.type === 'telegram' && platform.proxyUrl"
                            class="flex items-center gap-2"
                          >
                            <i class="fas fa-route w-4 flex-shrink-0 text-gray-400"></i>
                            <span class="truncate">代理: {{ platform.proxyUrl }}</span>
                          </div>
                          <div
                            v-if="platform.type === 'smtp' && platform.to"
                            class="flex items-center gap-2"
                          >
                            <i class="fas fa-envelope w-4 flex-shrink-0 text-gray-400"></i>
                            <span class="truncate">{{
                              Array.isArray(platform.to) ? platform.to.join(', ') : platform.to
                            }}</span>
                          </div>
                          <div
                            v-if="platform.enableSign"
                            class="flex items-center gap-2 text-gray-500 dark:text-gray-400"
                          >
                            <i class="fas fa-shield-alt w-4 flex-shrink-0 text-gray-400"></i>
                            <span>已启用签名验证</span>
                          </div>
                        </div>
                      </div>

                      <div class="flex flex-wrap items-center gap-2 sm:flex-shrink-0">
                        <label class="relative inline-flex cursor-pointer items-center">
                          <input
                            :checked="platform.enabled"
                            class="peer sr-only"
                            type="checkbox"
                            @change="togglePlatform(platform.id)"
                          />
                          <div
                            class="peer relative h-6 w-11 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-blue-600 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:border-gray-600 dark:bg-gray-700 dark:peer-focus:ring-blue-800"
                          ></div>
                        </label>
                        <button
                          class="inline-flex items-center rounded-md bg-gray-100 px-2.5 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
                          title="测试连接"
                          @click="testPlatform(platform)"
                        >
                          <i class="fas fa-vial mr-1.5"></i>测试
                        </button>
                        <button
                          class="inline-flex items-center rounded-md bg-gray-100 px-2.5 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
                          title="编辑"
                          @click="editPlatform(platform)"
                        >
                          <i class="fas fa-edit mr-1.5"></i>编辑
                        </button>
                        <button
                          class="inline-flex items-center rounded-md bg-red-50 px-2.5 py-1.5 text-sm font-medium text-red-600 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50"
                          title="删除"
                          @click="deletePlatform(platform.id)"
                        >
                          <i class="fas fa-trash mr-1.5"></i>删除
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div
                  v-else
                  class="rounded-lg border border-dashed border-gray-300 px-4 py-8 text-center dark:border-gray-600"
                >
                  <i class="fas fa-bell-slash mb-2 text-2xl text-gray-300 dark:text-gray-600"></i>
                  <p class="text-sm text-gray-500 dark:text-gray-400">暂无通知平台</p>
                  <p class="mt-1 text-sm text-gray-400 dark:text-gray-500">
                    点击右上角「添加平台」配置推送渠道
                  </p>
                </div>
              </div>
            </div>

            <!-- 高级设置 -->
            <div class="flex flex-col gap-2 py-5 sm:flex-row sm:items-start sm:gap-8">
              <div class="sm:w-52 sm:flex-shrink-0">
                <div class="text-sm font-semibold text-gray-900 dark:text-gray-100">高级设置</div>
                <p class="mt-0.5 text-sm text-gray-500 dark:text-gray-400">重试与超时</p>
              </div>
              <div class="grid grid-cols-1 gap-3 sm:flex-1 sm:grid-cols-3">
                <div>
                  <label class="mb-1 block text-sm text-gray-500 dark:text-gray-400"
                    >最大重试次数</label
                  >
                  <input
                    v-model.number="webhookConfig.retrySettings.maxRetries"
                    class="form-input w-full dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
                    max="10"
                    min="0"
                    type="number"
                    @change="saveWebhookConfig"
                  />
                </div>
                <div>
                  <label class="mb-1 block text-sm text-gray-500 dark:text-gray-400"
                    >重试延迟 (ms)</label
                  >
                  <input
                    v-model.number="webhookConfig.retrySettings.retryDelay"
                    class="form-input w-full dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
                    max="10000"
                    min="100"
                    step="100"
                    type="number"
                    @change="saveWebhookConfig"
                  />
                </div>
                <div>
                  <label class="mb-1 block text-sm text-gray-500 dark:text-gray-400"
                    >超时时间 (ms)</label
                  >
                  <input
                    v-model.number="webhookConfig.retrySettings.timeout"
                    class="form-input w-full dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
                    max="30000"
                    min="1000"
                    step="1000"
                    type="number"
                    @change="saveWebhookConfig"
                  />
                </div>
              </div>
            </div>
          </div>

          <!-- 操作栏：与品牌设置对齐 -->
          <div class="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
            <button class="btn btn-primary px-6 py-3" @click="sendTestNotification">
              <i class="fas fa-paper-plane mr-2"></i>
              发送测试通知
            </button>
          </div>
        </div>

        <!-- Claude 转发配置部分 -->
        <div v-show="activeSection === 'claude'">
          <!-- 加载状态 -->
          <div v-if="claudeConfigLoading" class="py-12 text-center">
            <div class="loading-spinner mx-auto mb-4"></div>
            <p class="text-gray-500 dark:text-gray-400">正在加载配置...</p>
          </div>

          <div v-else>
            <!-- Claude Code 客户端限制 -->
            <div
              class="mb-6 border-b border-gray-100 pb-6 last:mb-0 last:border-b-0 dark:border-gray-700/60"
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
                        仅允许 Claude Code 客户端
                      </h2>
                      <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
                        启用后，所有
                        <code class="rounded bg-gray-100 px-1 dark:bg-gray-700"
                          >/api/v1/messages</code
                        >
                        和
                        <code class="rounded bg-gray-100 px-1 dark:bg-gray-700"
                          >/claude/v1/messages</code
                        >
                        端点将强制验证 Claude Code CLI 客户端
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
                      此设置与 API Key 级别的客户端限制是 <strong>OR 逻辑</strong>：全局启用或 API
                      Key 设置中启用，都会执行 Claude Code 验证。
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <!-- 全局会话绑定 -->
            <div
              class="mb-6 border-b border-gray-100 pb-6 last:mb-0 last:border-b-0 dark:border-gray-700/60"
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
                        强制会话绑定
                      </h2>
                      <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
                        启用后，系统会将原始会话 ID 绑定到首次使用的账户，确保上下文的一致性
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
                    <i class="fas fa-clock mr-2 text-gray-400"></i>
                    绑定有效期（天）
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
                  <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    会话绑定到账户后的有效时间，过期后会自动解除绑定
                  </p>
                </div>

                <!-- 错误提示消息 -->
                <div>
                  <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    <i class="fas fa-exclamation-triangle mr-2 text-gray-400"></i>
                    旧会话污染提示
                  </label>
                  <textarea
                    v-model="claudeConfig.sessionBindingErrorMessage"
                    class="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 shadow-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20 dark:border-gray-500 dark:bg-gray-700 dark:text-white sm:text-sm"
                    placeholder="你的本地session已污染，请清理后使用。"
                    rows="2"
                    @change="saveClaudeConfig"
                  ></textarea>
                  <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    当检测到为旧的sessionId且未在系统中有调度记录时提示，返回给客户端的错误消息
                  </p>
                </div>
              </div>

              <div class="mt-4 rounded-lg bg-purple-50 p-4 dark:bg-purple-900/20">
                <div class="flex">
                  <i class="fas fa-lightbulb mt-0.5 text-purple-500"></i>
                  <div class="ml-3">
                    <p class="text-sm text-purple-700 dark:text-purple-300">
                      <strong>工作原理：</strong>系统会提取请求中的原始 session ID （来自
                      <code class="rounded bg-purple-100 px-1 dark:bg-purple-800"
                        >metadata.user_id</code
                      >）， 并将其与首次调度的账户绑定。后续使用相同 session ID
                      的请求将自动路由到同一账户。
                    </p>
                    <p class="mt-2 text-sm text-purple-700 dark:text-purple-300">
                      <strong>新会话识别：</strong>如果绑定会话历史中没有该sessionId但请求中
                      <code class="rounded bg-purple-100 px-1 dark:bg-purple-800"
                        >messages.length > 1</code
                      >， 系统会认为这是一个污染的会话并拒绝请求。
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <!-- 用户消息串行队列 -->
            <div
              class="mb-6 border-b border-gray-100 pb-6 last:mb-0 last:border-b-0 dark:border-gray-700/60"
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
                        用户消息串行队列
                      </h2>
                      <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
                        启用后，同一账户的用户消息请求将串行执行，并在请求之间添加延迟，防止触发上游限流
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
                    请求间隔（毫秒）
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
                  <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    同一账户的用户消息请求之间的最小间隔时间（0-10000毫秒）
                  </p>
                </div>

                <!-- 队列超时 -->
                <div>
                  <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    <i class="fas fa-stopwatch mr-2 text-gray-400"></i>
                    队列超时（毫秒）
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
                  <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    请求在队列中等待的最大时间，超时将返回 503 错误（1000-300000毫秒）
                  </p>
                </div>
              </div>

              <div class="mt-4 rounded-lg bg-teal-50 p-4 dark:bg-teal-900/20">
                <div class="flex">
                  <i class="fas fa-info-circle mt-0.5 text-teal-500"></i>
                  <div class="ml-3">
                    <p class="text-sm text-teal-700 dark:text-teal-300">
                      <strong>工作原理：</strong>系统检测请求中最后一条消息的
                      <code class="rounded bg-teal-100 px-1 dark:bg-teal-800">role</code>
                      是否为
                      <code class="rounded bg-teal-100 px-1 dark:bg-teal-800">user</code
                      >。用户消息请求需要排队串行执行，而工具调用结果、助手消息续传等不受此限制。
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <!-- 并发请求排队 -->
            <div
              class="mb-6 border-b border-gray-100 pb-6 last:mb-0 last:border-b-0 dark:border-gray-700/60"
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
                      并发请求排队
                    </h4>
                    <p class="text-sm text-gray-500 dark:text-gray-400">
                      当 API Key 并发请求超限时进入队列等待，而非直接拒绝
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
                    固定最小排队数
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
                  <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    最大排队数的固定最小值（1-100）
                  </p>
                </div>

                <!-- 排队数倍数 -->
                <div>
                  <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    <i class="fas fa-times mr-2 text-gray-400"></i>
                    排队数倍数
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
                  <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    最大排队数 = MAX(倍数 × 并发限制, 固定值)，设为 0 则仅使用固定值
                  </p>
                </div>

                <!-- 排队超时时间 -->
                <div>
                  <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    <i class="fas fa-stopwatch mr-2 text-gray-400"></i>
                    排队超时时间（毫秒）
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
                  <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    请求在排队中等待的最大时间，超时将返回 429 错误（5秒-5分钟，默认10秒）
                  </p>
                </div>
              </div>

              <div class="mt-4 rounded-lg bg-blue-50 p-4 dark:bg-blue-900/20">
                <div class="flex">
                  <i class="fas fa-info-circle mt-0.5 text-blue-500"></i>
                  <div class="ml-3">
                    <p class="text-sm text-blue-700 dark:text-blue-300">
                      <strong>工作原理：</strong>当 API Key 的并发请求超过
                      <code class="rounded bg-blue-100 px-1 dark:bg-blue-800"
                        >concurrencyLimit</code
                      >
                      时，超限请求会进入队列等待而非直接返回 429。适合 Claude Code Agent
                      并行工具调用场景。
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <!-- 请求明细采集 -->
            <div
              class="mb-6 border-b border-gray-100 pb-6 last:mb-0 last:border-b-0 dark:border-gray-700/60"
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
                      请求明细采集
                    </h4>
                    <p class="text-sm text-gray-500 dark:text-gray-400">
                      采集后台请求摘要，供“请求明细”标签页按时间、API Key、账户、模型和接口检索
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
                    请求明细保留时间
                  </label>
                  <div class="mt-1 flex max-w-md flex-col gap-3 sm:flex-row sm:items-end">
                    <div class="flex-1">
                      <label
                        class="mb-1 block text-sm font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400"
                      >
                        天
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
                        class="mb-1 block text-sm font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400"
                      >
                        小时
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
                    class="mt-2 text-sm text-red-500 dark:text-red-400"
                  >
                    {{ requestDetailRetentionError }}
                  </p>
                  <p
                    v-else-if="requestDetailRetentionWarning"
                    class="mt-2 text-sm text-amber-600 dark:text-amber-400"
                  >
                    <i class="fas fa-exclamation-triangle mr-1"></i>
                    {{ requestDetailRetentionWarning }}
                  </p>
                  <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    新请求明细按小时保留，支持 0-30 天与 0-23 小时组合，总保留时间为 1-720
                    小时；关闭采集不会删除已保留的数据，直到自然过期
                  </p>
                </div>

                <div
                  class="rounded-lg border border-gray-200 bg-gray-50/80 p-4 dark:border-gray-700 dark:bg-gray-900/30"
                >
                  <div class="flex items-start justify-between gap-4">
                    <div class="flex-1">
                      <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        <i class="fas fa-eye mr-2 text-gray-400"></i>
                        请求体预览
                      </label>
                      <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        关闭后，仅影响后续新请求不再保存请求体预览；历史预览可在「请求明细」页面手动清理。
                      </p>
                      <p
                        v-if="claudeConfig.requestDetailBodyPreviewEnabled"
                        class="mt-2 text-sm text-amber-600 dark:text-amber-400"
                      >
                        <i class="fas fa-exclamation-triangle mr-1"></i>
                        开启请求体预览会增加 Redis 存储压力
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
                      <span class="sr-only">切换请求体预览</span>
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
                      <strong>采集内容：</strong>
                      {{
                        claudeConfig.requestDetailBodyPreviewEnabled
                          ? '保存脱敏且截断后的请求体预览，以及 Token、费用、耗时和缓存指标，不保存完整原始提示词正文。'
                          : '仅保存请求摘要字段、Token、费用、耗时和缓存指标，不保存请求体预览与完整原始提示词正文。'
                      }}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <!-- 账号错误收集 -->
            <div
              class="mb-6 border-b border-gray-100 pb-6 last:mb-0 last:border-b-0 dark:border-gray-700/60"
            >
              <div class="flex items-center justify-between">
                <div class="flex items-center">
                  <div
                    class="flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-r from-rose-500 to-orange-500 text-white shadow-lg"
                  >
                    <i class="fas fa-triangle-exclamation text-xl"></i>
                  </div>
                  <div class="ml-4">
                    <h4 class="text-lg font-semibold text-gray-900 dark:text-white">
                      账号错误收集
                    </h4>
                    <p class="text-sm text-gray-500 dark:text-gray-400">
                      记录账号触发的上游错误（状态码、脱敏后的请求/响应），供账号「错误历史」查看；关闭后仅停止采集新错误，已有历史保留至自然过期
                    </p>
                  </div>
                </div>
                <label class="relative inline-flex cursor-pointer items-center">
                  <input
                    v-model="claudeConfig.errorHistoryCollectionEnabled"
                    class="peer sr-only"
                    :disabled="errorHistoryCollectionSaving"
                    type="checkbox"
                    @change="handleErrorHistoryCollectionToggle"
                  />
                  <div
                    class="peer h-6 w-11 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-cyan-500 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-cyan-300 dark:border-gray-600 dark:bg-gray-700 dark:peer-focus:ring-cyan-800"
                  ></div>
                </label>
              </div>
            </div>

            <!-- 配置更新信息 -->
            <div
              v-if="claudeConfig.updatedAt"
              class="rounded-lg bg-gray-50 p-4 text-sm text-gray-500 dark:bg-gray-700/50 dark:text-gray-400"
            >
              <i class="fas fa-history mr-2"></i>
              最后更新：{{ formatDateTime(claudeConfig.updatedAt) }}
              <span v-if="claudeConfig.updatedBy" class="ml-2">
                由 <strong>{{ claudeConfig.updatedBy }}</strong> 修改
              </span>
            </div>
          </div>
        </div>

        <!-- 服务倍率配置部分 -->
        <div v-show="activeSection === 'serviceRates'">
          <!-- 加载状态 -->
          <div v-if="serviceRatesLoading" class="py-12 text-center">
            <div class="loading-spinner mx-auto mb-4"></div>
            <p class="text-gray-500 dark:text-gray-400">正在加载配置...</p>
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
                    服务倍率说明
                  </h3>
                  <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
                    服务倍率用于计算不同服务的计费费用。以
                    <strong>{{ serviceRates.baseService || 'claude' }}</strong>
                    为基准（倍率 1.0），其他服务按倍率换算。例如：Gemini 倍率 0.5 表示消耗 $1 只扣除
                    $0.5 额度。
                  </p>
                </div>
              </div>
            </div>

            <!-- 倍率配置表格 -->
            <div
              class="mb-6 border-b border-gray-100 pb-6 last:mb-0 last:border-b-0 dark:border-gray-700/60"
            >
              <div class="mb-4 flex items-center justify-between">
                <h2 class="text-lg font-semibold text-gray-800 dark:text-gray-200">
                  <i class="fas fa-sliders-h mr-2 text-blue-500"></i>
                  倍率配置
                </h2>
                <button
                  class="rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50"
                  :disabled="serviceRatesSaving"
                  @click="saveServiceRates"
                >
                  <i class="fas fa-save mr-2"></i>
                  {{ serviceRatesSaving ? '保存中...' : '保存配置' }}
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
                      <div class="text-sm text-gray-500 dark:text-gray-400">
                        {{ service }}
                        <span
                          v-if="service === serviceRates.baseService"
                          class="ml-2 rounded bg-blue-100 px-1.5 py-0.5 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300"
                        >
                          基准服务
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
                    <span class="text-sm text-gray-500 dark:text-gray-400">倍</span>
                  </div>
                </div>
              </div>

              <!-- 更新信息 -->
              <div
                v-if="serviceRates.updatedAt"
                class="mt-4 rounded-lg bg-gray-50 p-3 text-sm text-gray-500 dark:bg-gray-700/50 dark:text-gray-400"
              >
                <i class="fas fa-history mr-2"></i>
                最后更新：{{ formatDateTime(serviceRates.updatedAt) }}
                <span v-if="serviceRates.updatedBy" class="ml-2">
                  由 <strong>{{ serviceRates.updatedBy }}</strong> 修改
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- 模型价格部分 -->
        <div v-show="activeSection === 'modelPricing'">
          <ModelPricingSection />
        </div>

        <!-- 测试默认模型部分 -->
        <div v-show="activeSection === 'testModels'">
          <div v-if="testModelConfigLoading" class="py-12 text-center">
            <div class="loading-spinner mx-auto mb-4"></div>
            <p class="text-gray-500 dark:text-gray-400">正在加载配置...</p>
          </div>
          <div v-else>
            <div class="mb-6">
              <h2 class="text-lg font-semibold text-gray-800 dark:text-gray-200">
                连通性测试默认模型
              </h2>
              <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                配置账户连通性测试与 API Key 测试弹窗的默认选中模型，保存后立即生效。
              </p>
            </div>

            <!-- 账户连通性测试 -->
            <h3 class="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
              账户连通性测试
            </h3>
            <div class="divide-y divide-gray-100 dark:divide-gray-700/60">
              <div
                v-for="p in TEST_MODEL_ACCOUNT_PLATFORMS"
                :key="`account-${p.key}`"
                class="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:gap-8"
              >
                <div class="sm:w-52 sm:flex-shrink-0">
                  <span class="text-sm font-medium text-gray-700 dark:text-gray-300">{{
                    p.label
                  }}</span>
                </div>
                <div class="sm:max-w-md sm:flex-1">
                  <ModelPicker
                    v-model="testModelConfig.account[p.key]"
                    :catalog="pricingModelIds"
                    :presets="accountOptions(p.key)"
                  />
                </div>
              </div>
            </div>

            <!-- API Key 测试 -->
            <h3 class="mb-2 mt-6 text-sm font-semibold text-gray-700 dark:text-gray-300">
              API Key 测试
            </h3>
            <div class="divide-y divide-gray-100 dark:divide-gray-700/60">
              <div
                v-for="s in TEST_MODEL_APIKEY_SERVICES"
                :key="`apikey-${s.key}`"
                class="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:gap-8"
              >
                <div class="sm:w-52 sm:flex-shrink-0">
                  <span class="text-sm font-medium text-gray-700 dark:text-gray-300">{{
                    s.label
                  }}</span>
                </div>
                <div class="sm:max-w-md sm:flex-1">
                  <ModelPicker
                    v-model="testModelConfig.apikey[s.key]"
                    :catalog="pricingModelIds"
                    :presets="apikeyOptions(s.key)"
                  />
                </div>
              </div>
            </div>

            <!-- 操作栏 -->
            <div class="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <button
                class="btn btn-primary px-6 py-3"
                :class="{ 'cursor-not-allowed opacity-50': testModelConfigSaving }"
                :disabled="testModelConfigSaving"
                @click="saveTestModelConfig"
              >
                <div v-if="testModelConfigSaving" class="loading-spinner mr-2"></div>
                <i v-else class="fas fa-save mr-2" />
                {{ testModelConfigSaving ? '保存中...' : '保存配置' }}
              </button>
              <div
                v-if="testModelConfig.updatedAt"
                class="text-sm text-gray-500 dark:text-gray-400"
              >
                <i class="fas fa-clock mr-1" />
                最后更新：{{ formatDateTime(testModelConfig.updatedAt) }}
                <span v-if="testModelConfig.updatedBy">· {{ testModelConfig.updatedBy }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- 添加/编辑平台模态框 -->
  <ModalTransition>
    <div
      v-if="showAddPlatformModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm transition-all duration-300 ease-out"
      @click="closePlatformModal"
    >
      <div
        class="modal-panel relative mx-4 w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl transition-all duration-300 ease-out dark:bg-gray-800"
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
                  {{ editingPlatform ? '编辑' : '添加' }}通知平台
                </h3>
                <p class="mt-0.5 text-sm text-gray-600 dark:text-gray-400">
                  配置{{ editingPlatform ? '并更新' : '新的' }}Webhook通知渠道
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
                平台类型
              </label>
              <CustomDropdown
                v-model="platformForm.type"
                accent="blue"
                class="w-full"
                :disabled="editingPlatform"
                icon="fa-layer-group"
                :options="platformTypeOptions"
                placeholder="选择平台类型"
              />
              <p v-if="editingPlatform" class="mt-1 text-sm text-amber-600 dark:text-amber-400">
                <i class="fas fa-info-circle mr-1"></i>
                编辑模式下不能更改平台类型
              </p>
            </div>

            <!-- 平台名称 -->
            <div>
              <label
                class="mb-2 flex items-center text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                <i class="fas fa-tag mr-2 text-gray-400"></i>
                名称
                <span class="ml-2 text-sm text-gray-500">(可选)</span>
              </label>
              <input
                v-model="platformForm.name"
                class="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-900 shadow-sm transition-all placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder:text-gray-500"
                placeholder="例如：运维群通知、开发测试群"
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
                <span class="ml-1 text-sm text-red-500">*</span>
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
                  <span class="ml-1 text-sm text-red-500">*</span>
                </label>
                <input
                  v-model="platformForm.botToken"
                  class="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 font-mono text-sm text-gray-900 shadow-sm transition-all placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder:text-gray-500"
                  placeholder="例如：123456789:ABCDEFghijk-xyz"
                  required
                  type="text"
                />
                <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  在 Telegram 的 @BotFather 中创建机器人后获得的 Token
                </p>
              </div>

              <div>
                <label
                  class="mb-2 flex items-center text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  <i class="fas fa-comments mr-2 text-gray-400"></i>
                  Chat ID
                  <span class="ml-1 text-sm text-red-500">*</span>
                </label>
                <input
                  v-model="platformForm.chatId"
                  class="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 font-mono text-sm text-gray-900 shadow-sm transition-all placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder:text-gray-500"
                  placeholder="例如：123456789 或 -1001234567890"
                  required
                  type="text"
                />
                <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  可使用 @userinfobot、@RawDataBot 或 API 获取聊天/频道的 Chat ID
                </p>
              </div>

              <div>
                <label
                  class="mb-2 flex items-center text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  <i class="fas fa-globe mr-2 text-gray-400"></i>
                  API 基础地址
                  <span class="ml-2 text-sm text-gray-500">(可选)</span>
                </label>
                <input
                  v-model="platformForm.apiBaseUrl"
                  class="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 font-mono text-sm text-gray-900 shadow-sm transition-all placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder:text-gray-500"
                  placeholder="默认: https://api.telegram.org"
                  type="url"
                />
                <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  使用自建 Bot API 时可覆盖默认域名，需以 http 或 https 开头
                </p>
              </div>

              <div>
                <label
                  class="mb-2 flex items-center text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  <i class="fas fa-route mr-2 text-gray-400"></i>
                  代理地址
                  <span class="ml-2 text-sm text-gray-500">(可选)</span>
                </label>
                <input
                  v-model="platformForm.proxyUrl"
                  class="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 font-mono text-sm text-gray-900 shadow-sm transition-all placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder:text-gray-500"
                  placeholder="例如：socks5://user:pass@127.0.0.1:1080"
                  type="text"
                />
                <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  支持 http、https、socks4/4a/5 代理，留空则直接连接 Telegram 官方 API
                </p>
              </div>

              <div
                class="flex items-start rounded-lg bg-blue-50 p-3 text-sm text-blue-700 dark:bg-blue-900/20 dark:text-blue-300"
              >
                <i class="fas fa-info-circle mr-2 mt-0.5"></i>
                <div>机器人需先加入对应群组或频道并授予发送消息权限，通知会以纯文本方式发送。</div>
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
                  设备密钥 (Device Key)
                  <span class="ml-1 text-sm text-red-500">*</span>
                </label>
                <input
                  v-model="platformForm.deviceKey"
                  class="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 font-mono text-sm text-gray-900 shadow-sm transition-all placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder:text-gray-500"
                  placeholder="例如：aBcDeFgHiJkLmNoPqRsTuVwX"
                  required
                  type="text"
                />
                <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  在Bark App中查看您的推送密钥
                </p>
              </div>

              <!-- 服务器URL（可选） -->
              <div>
                <label
                  class="mb-2 flex items-center text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  <i class="fas fa-server mr-2 text-gray-400"></i>
                  服务器地址
                  <span class="ml-2 text-sm text-gray-500">(可选)</span>
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
                  通知级别
                </label>
                <CustomDropdown
                  v-model="platformForm.level"
                  accent="blue"
                  class="w-full"
                  icon="fa-flag"
                  :options="barkLevelOptions"
                  placeholder="选择通知级别"
                />
              </div>

              <!-- 通知声音 -->
              <div>
                <label
                  class="mb-2 flex items-center text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  <i class="fas fa-volume-up mr-2 text-gray-400"></i>
                  通知声音
                </label>
                <CustomDropdown
                  v-model="platformForm.sound"
                  accent="blue"
                  class="w-full"
                  icon="fa-volume-up"
                  :options="barkSoundOptions"
                  placeholder="选择通知声音"
                />
              </div>

              <!-- 分组 -->
              <div>
                <label
                  class="mb-2 flex items-center text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  <i class="fas fa-folder mr-2 text-gray-400"></i>
                  通知分组
                  <span class="ml-2 text-sm text-gray-500">(可选)</span>
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

            <!-- SMTP 平台特有字段 -->
            <div v-if="platformForm.type === 'smtp'" class="space-y-5">
              <!-- SMTP 主机 -->
              <div>
                <label
                  class="mb-2 flex items-center text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  <i class="fas fa-server mr-2 text-gray-400"></i>
                  SMTP 服务器
                  <span class="ml-1 text-sm text-red-500">*</span>
                </label>
                <input
                  v-model="platformForm.host"
                  class="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-900 shadow-sm transition-all placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder:text-gray-500"
                  placeholder="例如: smtp.gmail.com"
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
                    <i class="fas fa-plug mr-2 text-gray-400"></i>
                    端口
                  </label>
                  <input
                    v-model.number="platformForm.port"
                    class="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-900 shadow-sm transition-all focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                    max="65535"
                    min="1"
                    placeholder="587"
                    type="number"
                  />
                  <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    默认: 587 (TLS) 或 465 (SSL)
                  </p>
                </div>

                <div>
                  <label
                    class="mb-2 flex items-center text-sm font-medium text-gray-700 dark:text-gray-300"
                  >
                    <i class="fas fa-shield-alt mr-2 text-gray-400"></i>
                    加密方式
                  </label>
                  <CustomDropdown
                    v-model="platformForm.secure"
                    accent="blue"
                    class="w-full"
                    icon="fa-shield-alt"
                    :options="smtpSecureOptions"
                    placeholder="选择加密方式"
                  />
                </div>
              </div>

              <!-- 用户名 -->
              <div>
                <label
                  class="mb-2 flex items-center text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  <i class="fas fa-user mr-2 text-gray-400"></i>
                  用户名
                  <span class="ml-1 text-sm text-red-500">*</span>
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
                  <i class="fas fa-lock mr-2 text-gray-400"></i>
                  密码 / 应用密码
                  <span class="ml-1 text-sm text-red-500">*</span>
                </label>
                <input
                  v-model="platformForm.pass"
                  class="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-900 shadow-sm transition-all placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder:text-gray-500"
                  placeholder="邮箱密码或应用专用密码"
                  required
                  type="password"
                />
                <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  建议使用应用专用密码，而非邮箱登录密码
                </p>
              </div>

              <!-- 发件人邮箱 -->
              <div>
                <label
                  class="mb-2 flex items-center text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  <i class="fas fa-paper-plane mr-2 text-gray-400"></i>
                  发件人邮箱
                  <span class="ml-2 text-sm text-gray-500">(可选)</span>
                </label>
                <input
                  v-model="platformForm.from"
                  class="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-900 shadow-sm transition-all placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder:text-gray-500"
                  placeholder="默认使用用户名邮箱"
                  type="email"
                />
              </div>

              <!-- 收件人邮箱 -->
              <div>
                <label
                  class="mb-2 flex items-center text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  <i class="fas fa-envelope mr-2 text-gray-400"></i>
                  收件人邮箱
                  <span class="ml-1 text-sm text-red-500">*</span>
                </label>
                <input
                  v-model="platformForm.to"
                  class="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-900 shadow-sm transition-all placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder:text-gray-500"
                  placeholder="admin@example.com"
                  required
                  type="email"
                />
                <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">接收通知的邮箱地址</p>
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
                    class="rounded-full bg-green-100 px-2 py-1 text-sm font-medium text-green-700 dark:bg-green-900/50 dark:text-green-400"
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
            <div class="text-sm text-gray-500 dark:text-gray-400">
              <i class="fas fa-asterisk mr-1 text-red-500"></i>
              必填项
            </div>
            <div class="flex space-x-3">
              <button
                class="group flex items-center rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition-all hover:bg-gray-50 hover:shadow-md dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                @click="closePlatformModal"
              >
                <i class="fas fa-times mr-2 transition-transform group-hover:scale-110"></i>
                取消
              </button>
              <button
                class="group flex items-center rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-medium text-blue-700 shadow-sm transition-all hover:bg-blue-100 hover:shadow-md dark:border-blue-800 dark:bg-blue-900/50 dark:text-blue-300 dark:hover:bg-blue-900/70"
                :disabled="testingConnection"
                @click="testPlatformForm"
              >
                <i
                  class="mr-2 transition-transform"
                  :class="
                    testingConnection
                      ? 'fas fa-spinner fa-spin'
                      : 'fas fa-vial group-hover:scale-110'
                  "
                ></i>
                {{ testingConnection ? '测试中...' : '测试连接' }}
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
                {{ savingPlatform ? '保存中...' : editingPlatform ? '保存修改' : '添加平台' }}
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
  </ModalTransition>
</template>

<script setup>
import { ref, reactive, onMounted, onBeforeUnmount, watch, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { showToast } from '@/utils/tools'
import { useSettingsStore } from '@/stores/settings'
import { useAuthStore } from '@/stores/auth'

import * as httpApis from '@/utils/http_apis'
import ConfirmModal from '@/components/common/ConfirmModal.vue'
import ModalTransition from '@/components/common/ModalTransition.vue'
import ModelPricingSection from '@/components/settings/ModelPricingSection.vue'
import ModelPicker from '@/components/common/ModelPicker.vue'

// 定义组件名称，用于keep-alive排除
defineOptions({
  name: 'SettingsView'
})

const route = useRoute()
const router = useRouter()

// 设置页 tab 路由
const sectionTabs = [
  { key: 'branding', label: '品牌设置', icon: 'fa-palette' },
  { key: 'webhook', label: '通知设置', icon: 'fa-bell' },
  { key: 'claude', label: 'Claude 转发', icon: 'fa-robot' },
  { key: 'serviceRates', label: '服务倍率', icon: 'fa-balance-scale' },
  { key: 'modelPricing', label: '模型价格', icon: 'fa-coins' },
  { key: 'testModels', label: '测试模型', icon: 'fa-vial' }
]
const validSections = sectionTabs.map((tab) => tab.key)

// 通知平台表单下拉选项
const platformTypeOptions = [
  { value: 'wechat_work', label: '🟢 企业微信' },
  { value: 'dingtalk', label: '🔵 钉钉' },
  { value: 'feishu', label: '🟦 飞书' },
  { value: 'slack', label: '🟣 Slack' },
  { value: 'discord', label: '🟪 Discord' },
  { value: 'telegram', label: '✈️ Telegram' },
  { value: 'bark', label: '🔔 Bark' },
  { value: 'smtp', label: '📧 邮件通知' },
  { value: 'custom', label: '⚙️ 自定义' }
]

const barkLevelOptions = [
  { value: '', label: '自动（根据通知类型）' },
  { value: 'passive', label: '被动' },
  { value: 'active', label: '默认' },
  { value: 'timeSensitive', label: '时效性' },
  { value: 'critical', label: '紧急' }
]

const barkSoundOptions = [
  { value: '', label: '自动（根据通知类型）' },
  { value: 'default', label: '默认' },
  { value: 'alarm', label: '警报' },
  { value: 'bell', label: '铃声' },
  { value: 'birdsong', label: '鸟鸣' },
  { value: 'electronic', label: '电子音' },
  { value: 'glass', label: '玻璃' },
  { value: 'horn', label: '喇叭' },
  { value: 'silence', label: '静音' }
]

const smtpSecureOptions = [
  { value: false, label: 'STARTTLS (端口587)' },
  { value: true, label: 'SSL/TLS (端口465)' }
]

// 使用settings store
const settingsStore = useSettingsStore()
const authStore = useAuthStore()
const { loading, saving, oemSettings } = storeToRefs(settingsStore)

// 组件refs
const iconFileInput = ref()

// 当前激活的设置部分（由路由参数驱动）
const activeSection = computed(() => {
  const section = route.params.section
  return validSections.includes(section) ? section : 'branding'
})

// 非法 section 回退到 branding
watch(
  () => route.params.section,
  (section) => {
    if (!validSections.includes(section)) {
      router.replace({ name: 'Settings', params: { section: 'branding' }, query: route.query })
    }
  },
  { immediate: true }
)

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
  sessionBindingErrorMessage: '你的本地session已污染，请清理后使用。',
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
  errorHistoryCollectionEnabled: true,
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
    return '天数必须在 0 到 30 之间'
  }

  if (hours < 0 || hours > 23) {
    return '小时数必须在 0 到 23 之间'
  }

  if (requestDetailRetentionTotalHours.value < 1) {
    return '请求明细保留时间至少需要 1 小时'
  }

  if (requestDetailRetentionTotalHours.value > REQUEST_DETAIL_RETENTION_MAX_HOURS) {
    return '请求明细保留时间不能超过 30 天'
  }

  return ''
})

const requestDetailRetentionWarning = computed(() => {
  if (
    !requestDetailRetentionError.value &&
    requestDetailRetentionTotalHours.value > REQUEST_DETAIL_RETENTION_WARNING_HOURS
  ) {
    return '保留时间超过 72 小时会增加 Redis 存储压力'
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
    showToast('更新请求体预览配置失败', 'error')
    console.error(error)
  } finally {
    requestDetailBodyPreviewSaving.value = false
  }
}

// 账号错误收集开关：v-model 已乐观翻转，保存失败时回滚为翻转前的值，避免界面状态与运行时配置不一致
// saving 守卫 + :disabled：阻止保存在途时再次切换（v-model 在 @change 前已翻转，否则回滚目标会错乱）
const errorHistoryCollectionSaving = ref(false)
const handleErrorHistoryCollectionToggle = async () => {
  errorHistoryCollectionSaving.value = true
  try {
    // saveClaudeConfig 自身不会 reject：成功返回 { success: true }，失败/非2xx/中止返回假值或 { success: false }
    const response = await saveClaudeConfig()
    if (!response || response.success !== true) {
      claudeConfig.value.errorHistoryCollectionEnabled =
        !claudeConfig.value.errorHistoryCollectionEnabled
    }
  } finally {
    errorHistoryCollectionSaving.value = false
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

// 监听路由 section 变化，加载对应配置
const sectionWatcher = watch(
  activeSection,
  async (newSection) => {
    if (!isMounted.value) return
    if (newSection === 'webhook') {
      await loadWebhookConfig()
    } else if (newSection === 'claude') {
      await loadClaudeConfig()
    } else if (newSection === 'serviceRates') {
      await loadServiceRates()
    } else if (newSection === 'testModels') {
      await loadTestModelConfig()
    }
  },
  { immediate: true }
)

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
  } catch (error) {
    showToast('加载设置失败', 'error')
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
    showToast('获取webhook配置失败', 'error')
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
      showToast('配置已保存', 'success')
    }
  } catch (error) {
    if (error.name === 'AbortError') return
    if (!isMounted.value) return
    showToast('保存配置失败', 'error')
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
          response.config?.sessionBindingErrorMessage || '你的本地session已污染，请清理后使用。',
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
        errorHistoryCollectionEnabled: response.config?.errorHistoryCollectionEnabled ?? true,
        updatedAt: response.config?.updatedAt || null,
        updatedBy: response.config?.updatedBy || null
      }
      syncRequestDetailRetentionInput(claudeConfig.value.requestDetailRetentionHours)
    }
  } catch (error) {
    if (error.name === 'AbortError') return
    if (!isMounted.value) return
    showToast('获取 Claude 转发配置失败', 'error')
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
      requestDetailBodyPreviewEnabled,
      errorHistoryCollectionEnabled: claudeConfig.value.errorHistoryCollectionEnabled
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
        response.warning || response.message || 'Claude 转发配置已保存',
        response.warning ? 'warning' : 'success'
      )
      return response
    }

    if (isMounted.value) {
      showToast(response.message || '保存 Claude 转发配置失败', 'error')
    }
    return response
  } catch (error) {
    if (error.name === 'AbortError') return
    if (!isMounted.value) return
    showToast('保存 Claude 转发配置失败', 'error')
    console.error(error)
    return { success: false, message: error.message || '保存 Claude 转发配置失败' }
  }
}

// ========== 连通性测试默认模型配置 ==========
const TEST_MODEL_ACCOUNT_PLATFORMS = [
  { key: 'claude', label: 'Claude OAuth' },
  { key: 'claude-console', label: 'Claude Console' },
  { key: 'bedrock', label: 'AWS Bedrock' },
  { key: 'gemini', label: 'Gemini' },
  { key: 'gemini-api', label: 'Gemini API' },
  { key: 'openai-responses', label: 'OpenAI Responses' },
  { key: 'droid', label: 'Droid' },
  { key: 'ccr', label: 'CCR' }
]
const TEST_MODEL_APIKEY_SERVICES = [
  { key: 'claude', label: 'Claude' },
  { key: 'gemini', label: 'Gemini' },
  { key: 'openai', label: 'OpenAI (Codex)' }
]

const testModelConfigLoading = ref(false)
const testModelConfigSaving = ref(false)
const testModelOptions = ref({ claude: [], gemini: [], openai: [], platforms: {} })
const testModelConfig = ref({ account: {}, apikey: {}, updatedAt: null, updatedBy: null })
// 模型价格表全量 id（供 ModelPicker 搜索选择）
const pricingModelIds = ref([])

const accountOptions = (platform) => testModelOptions.value.platforms?.[platform] || []
const apikeyOptions = (service) => testModelOptions.value[service] || []

// 加载测试默认模型配置
const loadTestModelConfig = async () => {
  if (!isMounted.value) return
  testModelConfigLoading.value = true
  try {
    const [optsRes, cfgRes, pricingRes] = await Promise.all([
      httpApis.getModelsApi(),
      httpApis.getTestModelConfigApi({ signal: abortController.value.signal }),
      httpApis.getModelPricingApi()
    ])
    if (!isMounted.value) return
    if (optsRes.success && optsRes.data) {
      testModelOptions.value = optsRes.data
    }
    if (cfgRes.success && cfgRes.config) {
      testModelConfig.value = {
        account: { ...cfgRes.config.account },
        apikey: { ...cfgRes.config.apikey },
        updatedAt: cfgRes.config.updatedAt || null,
        updatedBy: cfgRes.config.updatedBy || null
      }
    }
    if (pricingRes.success && pricingRes.data) {
      pricingModelIds.value = Object.keys(pricingRes.data).sort()
    }
  } catch (error) {
    if (error.name === 'AbortError') return
    if (!isMounted.value) return
    showToast('获取测试默认模型配置失败', 'error')
    console.error(error)
  } finally {
    if (isMounted.value) {
      testModelConfigLoading.value = false
    }
  }
}

// 保存测试默认模型配置
const saveTestModelConfig = async () => {
  if (!isMounted.value) return
  testModelConfigSaving.value = true
  try {
    const payload = {
      account: { ...testModelConfig.value.account },
      apikey: { ...testModelConfig.value.apikey }
    }
    const response = await httpApis.updateTestModelConfigApi(payload, {
      signal: abortController.value.signal
    })
    if (response.success && response.config && isMounted.value) {
      testModelConfig.value = {
        account: { ...response.config.account },
        apikey: { ...response.config.apikey },
        updatedAt: response.config.updatedAt || new Date().toISOString(),
        updatedBy: response.config.updatedBy || null
      }
      showToast(response.message || '测试默认模型配置已保存', 'success')
    } else if (isMounted.value) {
      showToast(response.message || '保存测试默认模型配置失败', 'error')
    }
  } catch (error) {
    if (error.name === 'AbortError') return
    if (!isMounted.value) return
    showToast('保存测试默认模型配置失败', 'error')
    console.error(error)
  } finally {
    if (isMounted.value) {
      testModelConfigSaving.value = false
    }
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
    console.error('加载服务倍率配置失败:', error)
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
      showToast('服务倍率配置已保存', 'success')
    }
  } catch (error) {
    if (error.name === 'AbortError') return
    if (!isMounted.value) return
    showToast('保存服务倍率配置失败', 'error')
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
      showToast('请输入Bark设备密钥', 'error')
      return false
    }
  } else if (platformForm.value.type === 'telegram') {
    if (!platformForm.value.botToken) {
      showToast('请输入 Telegram 机器人 Token', 'error')
      return false
    }
    if (!platformForm.value.chatId) {
      showToast('请输入 Telegram Chat ID', 'error')
      return false
    }
    if (platformForm.value.apiBaseUrl) {
      try {
        const parsed = new URL(platformForm.value.apiBaseUrl)
        if (!['http:', 'https:'].includes(parsed.protocol)) {
          showToast('Telegram API 基础地址仅支持 http 或 https', 'error')
          return false
        }
      } catch (error) {
        showToast('请输入有效的 Telegram API 基础地址', 'error')
        return false
      }
    }
    if (platformForm.value.proxyUrl) {
      try {
        const parsed = new URL(platformForm.value.proxyUrl)
        const supportedProtocols = ['http:', 'https:', 'socks4:', 'socks4a:', 'socks5:']
        if (!supportedProtocols.includes(parsed.protocol)) {
          showToast('Telegram 代理仅支持 http/https/socks 协议', 'error')
          return false
        }
      } catch (error) {
        showToast('请输入有效的 Telegram 代理地址', 'error')
        return false
      }
    }
  } else if (platformForm.value.type === 'smtp') {
    const requiredFields = [
      { field: 'host', message: 'SMTP服务器' },
      { field: 'user', message: '用户名' },
      { field: 'pass', message: '密码' },
      { field: 'to', message: '收件人邮箱' }
    ]

    for (const { field, message } of requiredFields) {
      if (!platformForm.value[field]) {
        showToast(`请输入${message}`, 'error')
        return false
      }
    }
  } else {
    if (!platformForm.value.url) {
      showToast('请输入Webhook URL', 'error')
      return false
    }
    if (urlError.value) {
      showToast('请输入有效的Webhook URL', 'error')
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
      showToast(editingPlatform.value ? '平台已更新' : '平台已添加', 'success')
      await loadWebhookConfig()
      closePlatformModal()
    }
  } catch (error) {
    if (error.name === 'AbortError') return
    if (!isMounted.value) return
    showToast(error.message || '操作失败', 'error')
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

  if (!(await showConfirm('删除平台', '确定要删除这个平台吗？', '删除', '取消', 'danger'))) {
    return
  }

  try {
    const response = await httpApis.deleteWebhookPlatformApi(id, {
      signal: abortController.value.signal
    })
    if (response.success && isMounted.value) {
      showToast('平台已删除', 'success')
      await loadWebhookConfig()
    }
  } catch (error) {
    if (error.name === 'AbortError') return
    if (!isMounted.value) return
    showToast('删除失败', 'error')
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
      showToast('测试成功', 'success')
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

  // 验证表单
  if (!validatePlatformForm()) return

  testingConnection.value = true
  try {
    const response = await httpApis.testWebhookApi(platformForm.value, {
      signal: abortController.value.signal
    })
    if (response.success && isMounted.value) {
      showToast('测试成功', 'success')
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
    const response = await httpApis.testWebhookNotificationApi({
      signal: abortController.value.signal
    })
    if (response.success && isMounted.value) {
      showToast('测试通知已发送', 'success')
    }
  } catch (error) {
    if (error.name === 'AbortError') return
    if (!isMounted.value) return
    const errorMessage =
      error?.response?.data?.message || error?.response?.data?.error || error?.message || '发送失败'
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
    wechat_work: '企业微信',
    dingtalk: '钉钉',
    feishu: '飞书',
    slack: 'Slack',
    discord: 'Discord',
    telegram: 'Telegram',
    bark: 'Bark',
    smtp: '邮件通知',
    custom: '自定义'
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
    wechat_work: '请在企业微信群机器人设置中获取Webhook地址',
    dingtalk: '请在钉钉群机器人设置中获取Webhook地址',
    feishu: '请在飞书群机器人设置中获取Webhook地址',
    slack: '请在Slack应用的Incoming Webhooks中获取地址',
    discord: '请在Discord服务器的集成设置中创建Webhook',
    telegram: '使用 @BotFather 创建机器人并复制 Token，Chat ID 可通过 @userinfobot 或相关工具获取',
    bark: '请在Bark App中查看您的设备密钥',
    smtp: '请配置SMTP服务器信息，支持Gmail、QQ邮箱等',
    custom: '请输入完整的Webhook接收地址'
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
    accountAnomaly: '账号异常',
    quotaWarning: '配额警告',
    systemError: '系统错误',
    securityAlert: '安全警报',
    rateLimitRecovery: '限流恢复',
    test: '测试通知'
  }
  return names[type] || type
}

const getNotificationTypeDescription = (type) => {
  const descriptions = {
    accountAnomaly: '账号状态异常、认证失败等',
    quotaWarning: 'API调用配额不足警告',
    systemError: '系统运行错误和故障',
    securityAlert: '安全相关的警报通知',
    rateLimitRecovery: '限流状态恢复时发送提醒',
    test: '用于测试Webhook连接是否正常'
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
      // 用 PUT 返回的归一化数据直接同步 authStore（页头/登录页/document.title 读它），无需二次 GET，避免 GET 失败却提示成功
      authStore.applyOemSettings(result.data)
      showToast('OEM设置保存成功', 'success')
    } else {
      showToast(result?.message || '保存失败', 'error')
    }
  } catch (error) {
    showToast('保存OEM设置失败', 'error')
  }
}

// 重置OEM设置
const resetOemSettings = async () => {
  if (
    !(await showConfirm(
      '重置设置',
      '确定要重置为默认设置吗？\n\n这将清除所有自定义的网站名称和图标设置。',
      '重置',
      '取消',
      'warning'
    ))
  )
    return

  try {
    const result = await settingsStore.resetOemSettings()
    if (result && result.success) {
      // 用返回数据直接同步 authStore，让页头/登录页/document.title 立即回到默认站点名
      authStore.applyOemSettings(result.data)
      showToast('已重置为默认设置', 'success')
    } else {
      showToast('重置失败', 'error')
    }
  } catch (error) {
    showToast('重置失败', 'error')
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
    showToast('文件读取失败', 'error')
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
/* 不再给 .settings-container 设 min-height: calc(100vh - Npx)：
   N 低估顶栏/Tab/padding 时会把页面撑出默认滚动条；
   外层 MainLayout glass-strong 已是 flex-1 铺满剩余视口，本页按内容自然高度即可 */

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
