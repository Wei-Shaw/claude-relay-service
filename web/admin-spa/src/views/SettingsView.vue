<template>
  <div class="settings-container">
    <!-- Page Header -->
    <div class="mb-6">
      <h3 class="mb-2 text-2xl font-bold text-gray-900 dark:text-gray-100">系统设置</h3>
      <p class="text-base text-gray-600 dark:text-gray-400">网站定制和通知配置</p>
    </div>

    <!-- Loading State -->
    <div v-if="loading" class="flex items-center justify-center py-20">
      <Spinner size="lg" />
      <span class="ml-3 text-gray-500 dark:text-gray-400">正在加载设置...</span>
    </div>

    <!-- Settings Content -->
    <div v-else>
      <!-- Settings Tabs -->
      <Tabs
        v-model="activeSection"
        class="mb-6"
        :tabs="[
          { value: 'branding', label: '品牌设置' },
          { value: 'webhook', label: '通知设置' },
          { value: 'claude', label: 'Claude 转发' }
        ]"
      />

      <!-- Branding Settings -->
      <div v-show="activeSection === 'branding'" class="space-y-6">
        <!-- Site Name -->
        <Card>
          <template #header>
            <div class="flex items-center">
              <div
                class="mr-3 flex h-10 w-10 items-center justify-center rounded-lg bg-gray-900 dark:bg-gray-100"
              >
                <i class="fas fa-font text-white dark:text-gray-900"></i>
              </div>
              <div>
                <h4 class="text-lg font-semibold text-gray-900 dark:text-gray-100">网站名称</h4>
                <p class="text-sm text-gray-600 dark:text-gray-400">
                  品牌标识，显示在浏览器标题和页面头部
                </p>
              </div>
            </div>
          </template>
          <Input
            v-model="oemSettings.siteName"
            maxlength="100"
            placeholder="Claude Relay Service"
          />
        </Card>

        <!-- Site Icon -->
        <Card>
          <template #header>
            <div class="flex items-center">
              <div
                class="mr-3 flex h-10 w-10 items-center justify-center rounded-lg bg-gray-900 dark:bg-gray-100"
              >
                <i class="fas fa-image text-white dark:text-gray-900"></i>
              </div>
              <div>
                <h4 class="text-lg font-semibold text-gray-900 dark:text-gray-100">网站图标</h4>
                <p class="text-sm text-gray-600 dark:text-gray-400">Favicon，显示在浏览器标签页</p>
              </div>
            </div>
          </template>

          <div class="space-y-4">
            <!-- Icon Preview -->
            <div
              v-if="oemSettings.siteIconData || oemSettings.siteIcon"
              class="inline-flex items-center gap-3 rounded-lg bg-gray-50 p-4 dark:bg-gray-800"
            >
              <img
                alt="图标预览"
                class="h-10 w-10"
                :src="oemSettings.siteIconData || oemSettings.siteIcon"
                @error="handleIconError"
              />
              <span class="text-sm text-gray-600 dark:text-gray-400">当前图标</span>
              <Button size="sm" variant="danger-outline" @click="removeIcon">
                <i class="fas fa-trash mr-1"></i>
                删除
              </Button>
            </div>

            <!-- Upload Button -->
            <div>
              <input
                ref="iconFileInput"
                accept=".ico,.png,.jpg,.jpeg,.svg"
                class="hidden"
                type="file"
                @change="handleIconUpload"
              />
              <Button variant="secondary" @click="$refs.iconFileInput.click()">
                <i class="fas fa-upload mr-2"></i>
                上传图标
              </Button>
              <p class="mt-2 text-xs text-gray-500 dark:text-gray-400">
                支持 .ico, .png, .jpg, .svg 格式，最大 350KB
              </p>
            </div>
          </div>
        </Card>

        <!-- Admin Button Visibility -->
        <Card>
          <template #header>
            <div class="flex items-center">
              <div
                class="mr-3 flex h-10 w-10 items-center justify-center rounded-lg bg-gray-900 dark:bg-gray-100"
              >
                <i class="fas fa-eye-slash text-white dark:text-gray-900"></i>
              </div>
              <div>
                <h4 class="text-lg font-semibold text-gray-900 dark:text-gray-100">管理入口</h4>
                <p class="text-sm text-gray-600 dark:text-gray-400">控制登录按钮在首页的显示</p>
              </div>
            </div>
          </template>

          <div class="space-y-2">
            <Toggle v-model="hideAdminButton" label="" />
            <div
              class="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-gray-100"
            >
              <span>{{ hideAdminButton ? '隐藏登录按钮' : '显示登录按钮' }}</span>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400">
              隐藏后，用户需要直接访问 /admin/login 页面登录
            </p>
          </div>
        </Card>

        <!-- Action Buttons -->
        <Card>
          <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div class="flex flex-col gap-3 sm:flex-row">
              <Button
                :disabled="saving"
                :loading="saving"
                variant="primary"
                @click="saveOemSettings"
              >
                <i v-if="!saving" class="fas fa-save mr-2"></i>
                {{ saving ? '保存中...' : '保存设置' }}
              </Button>
              <Button :disabled="saving" variant="secondary" @click="resetOemSettings">
                <i class="fas fa-undo mr-2"></i>
                重置为默认
              </Button>
            </div>
            <div
              v-if="oemSettings.updatedAt"
              class="text-sm text-gray-500 dark:text-gray-400 md:text-right"
            >
              <i class="fas fa-clock mr-1"></i>
              最后更新：{{ formatDateTime(oemSettings.updatedAt) }}
            </div>
          </div>
        </Card>
      </div>

      <!-- Webhook Settings -->
      <div v-show="activeSection === 'webhook'" class="space-y-6">
        <!-- Enable Notifications -->
        <Card>
          <div class="flex items-center justify-between">
            <div>
              <h4 class="text-lg font-semibold text-gray-900 dark:text-gray-100">启用通知</h4>
              <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
                开启后，系统将按配置发送通知到指定平台
              </p>
            </div>
            <Toggle v-model="webhookConfig.enabled" @update:model-value="saveWebhookConfig" />
          </div>
        </Card>

        <!-- Notification Types -->
        <Card>
          <template #header>
            <h4 class="text-lg font-semibold text-gray-900 dark:text-gray-100">通知类型</h4>
          </template>

          <div class="space-y-4">
            <div
              v-for="(enabled, type) in webhookConfig.notificationTypes"
              :key="type"
              class="flex items-center justify-between rounded-lg border border-gray-200 p-4 dark:border-gray-700"
            >
              <div>
                <span class="font-medium text-gray-900 dark:text-gray-100">
                  {{ getNotificationTypeName(type) }}
                </span>
                <p class="text-sm text-gray-500 dark:text-gray-400">
                  {{ getNotificationTypeDescription(type) }}
                </p>
              </div>
              <Toggle
                v-model="webhookConfig.notificationTypes[type]"
                @update:model-value="saveWebhookConfig"
              />
            </div>
          </div>
        </Card>

        <!-- Platforms -->
        <Card>
          <template #header>
            <div class="flex items-center justify-between">
              <h4 class="text-lg font-semibold text-gray-900 dark:text-gray-100">通知平台</h4>
              <Button size="sm" variant="primary" @click="showAddPlatformModal = true">
                <i class="fas fa-plus mr-2"></i>
                添加平台
              </Button>
            </div>
          </template>

          <!-- Platform List -->
          <div
            v-if="webhookConfig.platforms && webhookConfig.platforms.length > 0"
            class="space-y-4"
          >
            <div
              v-for="platform in webhookConfig.platforms"
              :key="platform.id"
              class="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
            >
              <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div class="min-w-0 flex-1">
                  <div class="mb-3 flex items-center">
                    <i
                      class="mr-3 flex-shrink-0 text-2xl"
                      :class="getPlatformIcon(platform.type)"
                    ></i>
                    <div class="min-w-0">
                      <h5 class="truncate font-semibold text-gray-900 dark:text-gray-100">
                        {{ platform.name || getPlatformName(platform.type) }}
                      </h5>
                      <p class="text-sm text-gray-500 dark:text-gray-400">
                        {{ getPlatformName(platform.type) }}
                      </p>
                    </div>
                  </div>
                  <div class="space-y-2 text-sm">
                    <div
                      v-if="platform.type !== 'smtp' && platform.type !== 'telegram'"
                      class="flex items-center text-gray-600 dark:text-gray-400"
                    >
                      <i class="fas fa-link mr-2 w-4 flex-shrink-0"></i>
                      <span class="truncate">{{ platform.url }}</span>
                    </div>
                    <div
                      v-if="platform.type === 'telegram'"
                      class="flex items-center text-gray-600 dark:text-gray-400"
                    >
                      <i class="fas fa-comments mr-2 w-4 flex-shrink-0"></i>
                      <span class="truncate">Chat ID: {{ platform.chatId || '未配置' }}</span>
                    </div>
                    <div
                      v-if="platform.type === 'smtp' && platform.to"
                      class="flex items-center text-gray-600 dark:text-gray-400"
                    >
                      <i class="fas fa-envelope mr-2 w-4 flex-shrink-0"></i>
                      <span class="truncate">{{
                        Array.isArray(platform.to) ? platform.to.join(', ') : platform.to
                      }}</span>
                    </div>
                    <div
                      v-if="platform.enableSign"
                      class="flex items-center text-gray-600 dark:text-gray-400"
                    >
                      <i class="fas fa-shield-alt mr-2 w-4 flex-shrink-0"></i>
                      <span>已启用签名验证</span>
                    </div>
                  </div>
                </div>
                <div class="flex flex-shrink-0 items-center gap-2 sm:ml-4">
                  <Toggle
                    :model-value="platform.enabled"
                    @update:model-value="togglePlatform(platform.id)"
                  />
                  <Button
                    size="sm"
                    title="测试连接"
                    variant="ghost"
                    @click="testPlatform(platform)"
                  >
                    <i class="fas fa-vial"></i>
                  </Button>
                  <Button size="sm" title="编辑" variant="ghost" @click="editPlatform(platform)">
                    <i class="fas fa-edit"></i>
                  </Button>
                  <Button
                    size="sm"
                    title="删除"
                    variant="danger-ghost"
                    @click="deletePlatform(platform.id)"
                  >
                    <i class="fas fa-trash"></i>
                  </Button>
                </div>
              </div>
            </div>
          </div>
          <div v-else class="py-12 text-center text-gray-500 dark:text-gray-400">
            暂无配置的通知平台，请点击"添加平台"按钮添加
          </div>
        </Card>

        <!-- Advanced Settings -->
        <Card>
          <template #header>
            <h4 class="text-lg font-semibold text-gray-900 dark:text-gray-100">高级设置</h4>
          </template>

          <div class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                最大重试次数
              </label>
              <Input
                v-model.number="webhookConfig.retrySettings.maxRetries"
                max="10"
                min="0"
                type="number"
                @change="saveWebhookConfig"
              />
            </div>
            <div>
              <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                重试延迟 (毫秒)
              </label>
              <Input
                v-model.number="webhookConfig.retrySettings.retryDelay"
                max="10000"
                min="100"
                step="100"
                type="number"
                @change="saveWebhookConfig"
              />
            </div>
            <div class="sm:col-span-2 lg:col-span-1">
              <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                超时时间 (毫秒)
              </label>
              <Input
                v-model.number="webhookConfig.retrySettings.timeout"
                max="30000"
                min="1000"
                step="1000"
                type="number"
                @change="saveWebhookConfig"
              />
            </div>
          </div>
        </Card>

        <!-- Test Notification -->
        <div class="text-center">
          <Button variant="primary" @click="sendTestNotification">
            <i class="fas fa-paper-plane mr-2"></i>
            发送测试通知
          </Button>
        </div>
      </div>

      <!-- Claude Settings -->
      <div v-show="activeSection === 'claude'" class="space-y-6">
        <!-- Loading State -->
        <div v-if="claudeConfigLoading" class="flex items-center justify-center py-20">
          <Spinner size="lg" />
          <span class="ml-3 text-gray-500 dark:text-gray-400">正在加载配置...</span>
        </div>

        <template v-else>
          <!-- Claude Code Only -->
          <Card>
            <div class="flex items-center justify-between">
              <div class="flex items-center">
                <div
                  class="mr-4 flex h-12 w-12 items-center justify-center rounded-lg bg-gray-900 dark:bg-gray-100"
                >
                  <i class="fas fa-terminal text-xl text-white dark:text-gray-900"></i>
                </div>
                <div>
                  <h4 class="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    仅允许 Claude Code 客户端
                  </h4>
                  <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
                    启用后，所有
                    <code class="rounded bg-gray-100 px-1 dark:bg-gray-800">/api/v1/messages</code>
                    和
                    <code class="rounded bg-gray-100 px-1 dark:bg-gray-800"
                      >/claude/v1/messages</code
                    >
                    端点将强制验证 Claude Code CLI 客户端
                  </p>
                </div>
              </div>
              <Toggle
                v-model="claudeConfig.claudeCodeOnlyEnabled"
                @update:model-value="saveClaudeConfig"
              />
            </div>
            <Alert class="mt-4" variant="warning">
              <i class="fas fa-info-circle mr-2"></i>
              此设置与 API Key 级别的客户端限制是 <strong>OR 逻辑</strong>：全局启用或 API Key
              设置中启用，都会执行 Claude Code 验证。
            </Alert>
          </Card>

          <!-- Session Binding -->
          <Card>
            <div class="flex items-center justify-between">
              <div class="flex items-center">
                <div
                  class="mr-4 flex h-12 w-12 items-center justify-center rounded-lg bg-gray-900 dark:bg-gray-100"
                >
                  <i class="fas fa-link text-xl text-white dark:text-gray-900"></i>
                </div>
                <div>
                  <h4 class="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    强制会话绑定
                  </h4>
                  <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
                    启用后，系统会将原始会话 ID 绑定到首次使用的账户，确保上下文的一致性
                  </p>
                </div>
              </div>
              <Toggle
                v-model="claudeConfig.globalSessionBindingEnabled"
                @update:model-value="saveClaudeConfig"
              />
            </div>

            <!-- Session Binding Details -->
            <div v-if="claudeConfig.globalSessionBindingEnabled" class="mt-6 space-y-4">
              <div>
                <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  <i class="fas fa-clock mr-2 text-gray-400"></i>
                  绑定有效期（天）
                </label>
                <Input
                  v-model.number="claudeConfig.sessionBindingTtlDays"
                  max="365"
                  min="1"
                  placeholder="30"
                  type="number"
                  @change="saveClaudeConfig"
                />
                <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  会话绑定到账户后的有效时间，过期后会自动解除绑定
                </p>
              </div>

              <div>
                <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  <i class="fas fa-exclamation-triangle mr-2 text-gray-400"></i>
                  旧会话污染提示
                </label>
                <Textarea
                  v-model="claudeConfig.sessionBindingErrorMessage"
                  placeholder="你的本地session已污染，请清理后使用。"
                  rows="2"
                  @change="saveClaudeConfig"
                />
                <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  当检测到为旧的sessionId且未在系统中有调度记录时提示，返回给客户端的错误消息
                </p>
              </div>
            </div>

            <Alert class="mt-4" variant="info">
              <i class="fas fa-lightbulb mr-2"></i>
              <div>
                <p class="mb-2">
                  <strong>工作原理：</strong>系统会提取请求中的原始 session ID（来自
                  <code class="rounded bg-blue-100 px-1 dark:bg-blue-900">metadata.user_id</code
                  >）， 并将其与首次调度的账户绑定。后续使用相同 session ID
                  的请求将自动路由到同一账户。
                </p>
                <p>
                  <strong>新会话识别：</strong>如果绑定会话历史中没有该sessionId但请求中
                  <code class="rounded bg-blue-100 px-1 dark:bg-blue-900">messages.length > 1</code
                  >， 系统会认为这是一个污染的会话并拒绝请求。
                </p>
              </div>
            </Alert>
          </Card>

          <!-- User Message Queue -->
          <Card>
            <div class="flex items-center justify-between">
              <div class="flex items-center">
                <div
                  class="mr-4 flex h-12 w-12 items-center justify-center rounded-lg bg-teal-500 dark:bg-teal-600"
                >
                  <i class="fas fa-list-ol text-xl text-white"></i>
                </div>
                <div>
                  <h4 class="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    用户消息串行队列
                  </h4>
                  <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
                    启用后，同一账户的用户消息请求将串行执行，并在请求之间添加延迟，防止触发上游限流
                  </p>
                </div>
              </div>
              <Toggle
                v-model="claudeConfig.userMessageQueueEnabled"
                @update:model-value="saveClaudeConfig"
              />
            </div>

            <!-- Queue Details -->
            <div v-if="claudeConfig.userMessageQueueEnabled" class="mt-6 space-y-4">
              <div>
                <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  <i class="fas fa-hourglass-half mr-2 text-gray-400"></i>
                  请求间隔（毫秒）
                </label>
                <Input
                  v-model.number="claudeConfig.userMessageQueueDelayMs"
                  max="10000"
                  min="0"
                  placeholder="200"
                  type="number"
                  @change="saveClaudeConfig"
                />
                <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  同一账户的用户消息请求之间的最小间隔时间（0-10000毫秒）
                </p>
              </div>

              <div>
                <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  <i class="fas fa-stopwatch mr-2 text-gray-400"></i>
                  队列超时（毫秒）
                </label>
                <Input
                  v-model.number="claudeConfig.userMessageQueueTimeoutMs"
                  max="300000"
                  min="1000"
                  placeholder="30000"
                  type="number"
                  @change="saveClaudeConfig"
                />
                <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  请求在队列中等待的最大时间，超时将返回 503 错误（1000-300000毫秒）
                </p>
              </div>
            </div>

            <Alert class="mt-4" variant="info">
              <i class="fas fa-info-circle mr-2"></i>
              <strong>工作原理：</strong>系统检测请求中最后一条消息的
              <code class="rounded bg-blue-100 px-1 dark:bg-blue-900">role</code>
              是否为
              <code class="rounded bg-blue-100 px-1 dark:bg-blue-900">user</code
              >。用户消息请求需要排队串行执行，而工具调用结果、助手消息续传等不受此限制。
            </Alert>
          </Card>

          <!-- Concurrent Request Queue -->
          <Card>
            <div class="flex items-center justify-between">
              <div class="flex items-center">
                <div
                  class="mr-4 flex h-12 w-12 items-center justify-center rounded-lg bg-gray-900 dark:bg-gray-100"
                >
                  <i class="fas fa-layer-group text-xl text-white dark:text-gray-900"></i>
                </div>
                <div>
                  <h4 class="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    并发请求排队
                  </h4>
                  <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
                    当 API Key 并发请求超限时进入队列等待，而非直接拒绝
                  </p>
                </div>
              </div>
              <Toggle
                v-model="claudeConfig.concurrentRequestQueueEnabled"
                @update:model-value="saveClaudeConfig"
              />
            </div>

            <!-- Queue Config Details -->
            <div v-if="claudeConfig.concurrentRequestQueueEnabled" class="mt-6 space-y-4">
              <div>
                <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  <i class="fas fa-list-ol mr-2 text-gray-400"></i>
                  固定最小排队数
                </label>
                <Input
                  v-model.number="claudeConfig.concurrentRequestQueueMaxSize"
                  max="100"
                  min="1"
                  placeholder="3"
                  type="number"
                  @change="saveClaudeConfig"
                />
                <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  最大排队数的固定最小值（1-100）
                </p>
              </div>

              <div>
                <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  <i class="fas fa-times mr-2 text-gray-400"></i>
                  排队数倍数
                </label>
                <Input
                  v-model.number="claudeConfig.concurrentRequestQueueMaxSizeMultiplier"
                  max="10"
                  min="0"
                  placeholder="1"
                  step="0.5"
                  type="number"
                  @change="saveClaudeConfig"
                />
                <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  最大排队数 = MAX(倍数 × 并发限制, 固定值)，设为 0 则仅使用固定值
                </p>
              </div>

              <div>
                <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  <i class="fas fa-stopwatch mr-2 text-gray-400"></i>
                  排队超时时间（毫秒）
                </label>
                <Input
                  v-model.number="claudeConfig.concurrentRequestQueueTimeoutMs"
                  max="300000"
                  min="5000"
                  placeholder="10000"
                  type="number"
                  @change="saveClaudeConfig"
                />
                <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  请求在排队中等待的最大时间，超时将返回 429 错误（5秒-5分钟，默认10秒）
                </p>
              </div>
            </div>

            <Alert class="mt-4" variant="info">
              <i class="fas fa-info-circle mr-2"></i>
              <strong>工作原理：</strong>当 API Key 的并发请求超过
              <code class="rounded bg-gray-100 px-1 dark:bg-gray-800">concurrencyLimit</code>
              时，超限请求会进入队列等待而非直接返回 429。适合 Claude Code Agent 并行工具调用场景。
            </Alert>
          </Card>

          <!-- Update Info -->
          <Card v-if="claudeConfig.updatedAt">
            <div
              class="flex flex-col gap-2 text-sm text-gray-500 dark:text-gray-400 sm:flex-row sm:items-center"
            >
              <div>
                <i class="fas fa-history mr-2"></i>
                最后更新：{{ formatDateTime(claudeConfig.updatedAt) }}
              </div>
              <span v-if="claudeConfig.updatedBy" class="sm:ml-2">
                由
                <strong class="text-gray-700 dark:text-gray-300">{{
                  claudeConfig.updatedBy
                }}</strong>
                修改
              </span>
            </div>
          </Card>
        </template>
      </div>
    </div>
  </div>

  <!-- Add/Edit Platform Modal -->
  <div
    v-if="showAddPlatformModal"
    class="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-4"
    @click="closePlatformModal"
  >
    <div
      class="relative my-8 w-full max-w-2xl overflow-hidden rounded-lg bg-white shadow-xl dark:bg-gray-800"
      @click.stop
    >
      <!-- Modal Header -->
      <div
        class="border-b border-gray-200 bg-gray-50 px-4 py-4 dark:border-gray-700 dark:bg-gray-900 sm:px-6 sm:py-5"
      >
        <div class="flex items-start justify-between gap-4">
          <div class="flex min-w-0 flex-1 items-start gap-3">
            <div
              class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-gray-900 dark:bg-gray-100"
            >
              <i class="fas fa-bell text-white dark:text-gray-900"></i>
            </div>
            <div class="min-w-0 flex-1">
              <h3 class="text-lg font-semibold text-gray-900 dark:text-white sm:text-xl">
                {{ editingPlatform ? '编辑' : '添加' }}通知平台
              </h3>
              <p class="text-sm text-gray-600 dark:text-gray-400">
                配置{{ editingPlatform ? '并更新' : '新的' }}Webhook通知渠道
              </p>
            </div>
          </div>
          <Button class="flex-shrink-0" size="sm" variant="ghost" @click="closePlatformModal">
            <i class="fas fa-times text-lg"></i>
          </Button>
        </div>
      </div>

      <!-- Modal Body -->
      <div class="max-h-[calc(100vh-16rem)] overflow-y-auto p-4 sm:p-6">
        <div class="space-y-5">
          <!-- Platform Type -->
          <div>
            <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
              <i class="fas fa-layer-group mr-2 text-gray-400"></i>
              平台类型
            </label>
            <Select v-model="platformForm.type" :disabled="editingPlatform">
              <option value="wechat_work">🟢 企业微信</option>
              <option value="dingtalk">🔵 钉钉</option>
              <option value="feishu">🟦 飞书</option>
              <option value="slack">🟣 Slack</option>
              <option value="discord">🟪 Discord</option>
              <option value="telegram">✈️ Telegram</option>
              <option value="bark">🔔 Bark</option>
              <option value="smtp">📧 邮件通知</option>
              <option value="custom">⚙️ 自定义</option>
            </Select>
            <p v-if="editingPlatform" class="mt-1 text-xs text-amber-600 dark:text-amber-400">
              <i class="fas fa-info-circle mr-1"></i>
              编辑模式下不能更改平台类型
            </p>
          </div>

          <!-- Platform Name -->
          <div>
            <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
              <i class="fas fa-tag mr-2 text-gray-400"></i>
              名称
              <span class="ml-2 text-xs text-gray-500 dark:text-gray-400">(可选)</span>
            </label>
            <Input v-model="platformForm.name" placeholder="例如：运维群通知、开发测试群" />
          </div>

          <!-- Webhook URL (for most platforms) -->
          <div
            v-if="
              platformForm.type !== 'bark' &&
              platformForm.type !== 'smtp' &&
              platformForm.type !== 'telegram'
            "
          >
            <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
              <i class="fas fa-link mr-2 text-gray-400"></i>
              Webhook URL
              <span class="ml-1 text-xs text-red-500 dark:text-red-400">*</span>
            </label>
            <Input
              v-model="platformForm.url"
              :class="{
                'border-red-500': urlError,
                'border-green-500': urlValid
              }"
              placeholder="https://..."
              required
              type="url"
              @input="validateUrl"
            />
            <Alert v-if="getWebhookHint(platformForm.type)" class="mt-2" variant="info">
              <i class="fas fa-info-circle mr-2"></i>
              {{ getWebhookHint(platformForm.type) }}
            </Alert>
          </div>

          <!-- Telegram Fields -->
          <div v-if="platformForm.type === 'telegram'" class="space-y-5">
            <div>
              <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                <i class="fas fa-robot mr-2 text-gray-400"></i>
                Bot Token
                <span class="ml-1 text-xs text-red-500 dark:text-red-400">*</span>
              </label>
              <Input
                v-model="platformForm.botToken"
                placeholder="例如：123456789:ABCDEFghijk-xyz"
                required
              />
              <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                在 Telegram 的 @BotFather 中创建机器人后获得的 Token
              </p>
            </div>

            <div>
              <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                <i class="fas fa-comments mr-2 text-gray-400"></i>
                Chat ID
                <span class="ml-1 text-xs text-red-500 dark:text-red-400">*</span>
              </label>
              <Input
                v-model="platformForm.chatId"
                placeholder="例如：123456789 或 -1001234567890"
                required
              />
              <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                可使用 @userinfobot、@RawDataBot 或 API 获取聊天/频道的 Chat ID
              </p>
            </div>

            <div>
              <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                <i class="fas fa-globe mr-2 text-gray-400"></i>
                API 基础地址
                <span class="ml-2 text-xs text-gray-500 dark:text-gray-400">(可选)</span>
              </label>
              <Input
                v-model="platformForm.apiBaseUrl"
                placeholder="默认: https://api.telegram.org"
                type="url"
              />
              <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                使用自建 Bot API 时可覆盖默认域名，需以 http 或 https 开头
              </p>
            </div>

            <div>
              <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                <i class="fas fa-route mr-2 text-gray-400"></i>
                代理地址
                <span class="ml-2 text-xs text-gray-500 dark:text-gray-400">(可选)</span>
              </label>
              <Input
                v-model="platformForm.proxyUrl"
                placeholder="例如：socks5://user:pass@127.0.0.1:1080"
              />
              <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                支持 http、https、socks4/4a/5 代理，留空则直接连接 Telegram 官方 API
              </p>
            </div>

            <Alert variant="info">
              <i class="fas fa-info-circle mr-2"></i>
              机器人需先加入对应群组或频道并授予发送消息权限，通知会以纯文本方式发送。
            </Alert>
          </div>

          <!-- Bark Fields -->
          <div v-if="platformForm.type === 'bark'" class="space-y-5">
            <div>
              <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                <i class="fas fa-key mr-2 text-gray-400"></i>
                设备密钥 (Device Key)
                <span class="ml-1 text-xs text-red-500 dark:text-red-400">*</span>
              </label>
              <Input
                v-model="platformForm.deviceKey"
                placeholder="例如：aBcDeFgHiJkLmNoPqRsTuVwX"
                required
              />
              <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                在Bark App中查看您的推送密钥
              </p>
            </div>

            <div>
              <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                <i class="fas fa-server mr-2 text-gray-400"></i>
                服务器地址
                <span class="ml-2 text-xs text-gray-500 dark:text-gray-400">(可选)</span>
              </label>
              <Input
                v-model="platformForm.serverUrl"
                placeholder="默认: https://api.day.app/push"
                type="url"
              />
            </div>

            <div>
              <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                <i class="fas fa-flag mr-2 text-gray-400"></i>
                通知级别
              </label>
              <Select v-model="platformForm.level">
                <option value="">自动（根据通知类型）</option>
                <option value="passive">被动</option>
                <option value="active">默认</option>
                <option value="timeSensitive">时效性</option>
                <option value="critical">紧急</option>
              </Select>
            </div>

            <div>
              <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                <i class="fas fa-volume-up mr-2 text-gray-400"></i>
                通知声音
              </label>
              <Select v-model="platformForm.sound">
                <option value="">自动（根据通知类型）</option>
                <option value="default">默认</option>
                <option value="alarm">警报</option>
                <option value="bell">铃声</option>
                <option value="birdsong">鸟鸣</option>
                <option value="electronic">电子音</option>
                <option value="glass">玻璃</option>
                <option value="horn">喇叭</option>
                <option value="silence">静音</option>
              </Select>
            </div>

            <div>
              <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                <i class="fas fa-folder mr-2 text-gray-400"></i>
                通知分组
                <span class="ml-2 text-xs text-gray-500 dark:text-gray-400">(可选)</span>
              </label>
              <Input v-model="platformForm.group" placeholder="默认: claude-relay" />
            </div>

            <Alert variant="info">
              <i class="fas fa-info-circle mr-2"></i>
              <div>
                <p>1. 在iPhone上安装Bark App</p>
                <p>2. 打开App获取您的设备密钥</p>
                <p>3. 将密钥粘贴到上方输入框</p>
              </div>
            </Alert>
          </div>

          <!-- SMTP Fields -->
          <div v-if="platformForm.type === 'smtp'" class="space-y-5">
            <div>
              <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                <i class="fas fa-server mr-2 text-gray-400"></i>
                SMTP 服务器
                <span class="ml-1 text-xs text-red-500 dark:text-red-400">*</span>
              </label>
              <Input v-model="platformForm.host" placeholder="例如: smtp.gmail.com" required />
            </div>

            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  <i class="fas fa-plug mr-2 text-gray-400"></i>
                  端口
                </label>
                <Input
                  v-model.number="platformForm.port"
                  max="65535"
                  min="1"
                  placeholder="587"
                  type="number"
                />
                <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  默认: 587 (TLS) 或 465 (SSL)
                </p>
              </div>

              <div>
                <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  <i class="fas fa-shield-alt mr-2 text-gray-400"></i>
                  加密方式
                </label>
                <Select v-model="platformForm.secure">
                  <option :value="false">STARTTLS (端口587)</option>
                  <option :value="true">SSL/TLS (端口465)</option>
                </Select>
              </div>
            </div>

            <div>
              <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                <i class="fas fa-user mr-2 text-gray-400"></i>
                用户名
                <span class="ml-1 text-xs text-red-500 dark:text-red-400">*</span>
              </label>
              <Input
                v-model="platformForm.user"
                placeholder="user@example.com"
                required
                type="email"
              />
            </div>

            <div>
              <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                <i class="fas fa-lock mr-2 text-gray-400"></i>
                密码 / 应用密码
                <span class="ml-1 text-xs text-red-500 dark:text-red-400">*</span>
              </label>
              <Input
                v-model="platformForm.pass"
                placeholder="邮箱密码或应用专用密码"
                required
                type="password"
              />
              <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                建议使用应用专用密码，而非邮箱登录密码
              </p>
            </div>

            <div>
              <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                <i class="fas fa-paper-plane mr-2 text-gray-400"></i>
                发件人邮箱
                <span class="ml-2 text-xs text-gray-500 dark:text-gray-400">(可选)</span>
              </label>
              <Input v-model="platformForm.from" placeholder="默认使用用户名邮箱" type="email" />
            </div>

            <div>
              <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                <i class="fas fa-envelope mr-2 text-gray-400"></i>
                收件人邮箱
                <span class="ml-1 text-xs text-red-500 dark:text-red-400">*</span>
              </label>
              <Input
                v-model="platformForm.to"
                placeholder="admin@example.com"
                required
                type="email"
              />
              <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">接收通知的邮箱地址</p>
            </div>
          </div>

          <!-- Sign Settings (DingTalk/Feishu) -->
          <div
            v-if="platformForm.type === 'dingtalk' || platformForm.type === 'feishu'"
            class="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900"
          >
            <div class="mb-4 flex items-center justify-between">
              <label class="flex items-center">
                <Checkbox v-model="platformForm.enableSign" />
                <span class="ml-3 text-sm font-medium text-gray-700 dark:text-gray-300">
                  <i class="fas fa-shield-alt mr-2 text-gray-400"></i>
                  启用签名验证
                </span>
              </label>
              <Badge v-if="platformForm.enableSign" size="sm" variant="success">已启用</Badge>
            </div>
            <div v-if="platformForm.enableSign">
              <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                签名密钥
              </label>
              <Input v-model="platformForm.secret" placeholder="SEC..." />
            </div>
          </div>
        </div>
      </div>

      <!-- Modal Footer -->
      <div
        class="border-t border-gray-200 bg-gray-50 px-4 py-4 dark:border-gray-700 dark:bg-gray-900 sm:px-6"
      >
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div class="order-2 text-xs text-gray-500 dark:text-gray-400 sm:order-1">
            <i class="fas fa-asterisk mr-1 text-red-500 dark:text-red-400"></i>
            必填项
          </div>
          <div class="order-1 flex flex-col gap-2 sm:order-2 sm:flex-row sm:gap-3">
            <Button class="w-full sm:w-auto" variant="ghost" @click="closePlatformModal">
              <i class="fas fa-times mr-2"></i>
              取消
            </Button>
            <Button
              class="w-full sm:w-auto"
              :disabled="testingConnection"
              variant="secondary"
              @click="testPlatformForm"
            >
              <i
                class="mr-2"
                :class="testingConnection ? 'fas fa-spinner fa-spin' : 'fas fa-vial'"
              ></i>
              {{ testingConnection ? '测试中...' : '测试连接' }}
            </Button>
            <Button
              class="w-full sm:w-auto"
              :disabled="!isPlatformFormValid || savingPlatform"
              variant="primary"
              @click="savePlatform"
            >
              <i
                class="mr-2"
                :class="savingPlatform ? 'fas fa-spinner fa-spin' : 'fas fa-save'"
              ></i>
              {{ savingPlatform ? '保存中...' : editingPlatform ? '保存修改' : '添加平台' }}
            </Button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, watch, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { showToast } from '@/utils/toast'
import { useSettingsStore } from '@/stores/settings'
import { apiClient } from '@/config/api'
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Input,
  Select,
  Spinner,
  Tabs,
  Textarea,
  Toggle
} from '@/ui'

// Define component name for keep-alive exclusion
defineOptions({
  name: 'SettingsView'
})

// Use settings store
const settingsStore = useSettingsStore()
const { loading, saving, oemSettings } = storeToRefs(settingsStore)

// Component refs
const iconFileInput = ref()

// Current active settings section
const activeSection = ref('branding')

// Component mount state
const isMounted = ref(true)

// API request abort controller
const abortController = ref(new AbortController())

// Computed property: Hide admin button (inverts showAdminButton value)
const hideAdminButton = computed({
  get() {
    return !oemSettings.value.showAdminButton
  },
  set(value) {
    oemSettings.value.showAdminButton = !value
  }
})

// URL validation state
const urlError = ref(false)
const urlValid = ref(false)
const testingConnection = ref(false)
const savingPlatform = ref(false)

// Webhook configuration
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

// Claude relay configuration
const claudeConfigLoading = ref(false)
const claudeConfig = ref({
  claudeCodeOnlyEnabled: false,
  globalSessionBindingEnabled: false,
  sessionBindingErrorMessage: '你的本地session已污染，请清理后使用。',
  sessionBindingTtlDays: 30,
  userMessageQueueEnabled: false,
  userMessageQueueDelayMs: 200,
  userMessageQueueTimeoutMs: 5000,
  concurrentRequestQueueEnabled: false,
  concurrentRequestQueueMaxSize: 3,
  concurrentRequestQueueMaxSizeMultiplier: 0,
  concurrentRequestQueueTimeoutMs: 10000,
  updatedAt: null,
  updatedBy: null
})

// Platform form related
const showAddPlatformModal = ref(false)
const editingPlatform = ref(null)
const platformForm = ref({
  type: 'wechat_work',
  name: '',
  url: '',
  enableSign: false,
  secret: '',
  // Telegram specific fields
  botToken: '',
  chatId: '',
  apiBaseUrl: '',
  proxyUrl: '',
  // Bark specific fields
  deviceKey: '',
  serverUrl: '',
  level: '',
  sound: '',
  group: '',
  // SMTP specific fields
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

// Watch activeSection changes to load corresponding configuration
const sectionWatcher = watch(activeSection, async (newSection) => {
  if (!isMounted.value) return
  if (newSection === 'webhook') {
    await loadWebhookConfig()
  } else if (newSection === 'claude') {
    await loadClaudeConfig()
  }
})

// Watch platform type changes to reset validation state
const platformTypeWatcher = watch(
  () => platformForm.value.type,
  (newType) => {
    urlError.value = false
    urlValid.value = false

    if (!editingPlatform.value) {
      if (newType === 'bark') {
        platformForm.value.url = ''
        platformForm.value.enableSign = false
        platformForm.value.secret = ''
        platformForm.value.botToken = ''
        platformForm.value.chatId = ''
        platformForm.value.apiBaseUrl = ''
        platformForm.value.proxyUrl = ''
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
        platformForm.value.url = ''
        platformForm.value.enableSign = false
        platformForm.value.secret = ''
        platformForm.value.deviceKey = ''
        platformForm.value.serverUrl = ''
        platformForm.value.level = ''
        platformForm.value.sound = ''
        platformForm.value.group = ''
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
      } else {
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
      }
    }
  }
)

// Computed property: Check if platform form is valid
const isPlatformFormValid = computed(() => {
  if (platformForm.value.type === 'bark') {
    return !!platformForm.value.deviceKey
  } else if (platformForm.value.type === 'telegram') {
    return !!(platformForm.value.botToken && platformForm.value.chatId)
  } else if (platformForm.value.type === 'smtp') {
    return !!(
      platformForm.value.host &&
      platformForm.value.user &&
      platformForm.value.pass &&
      platformForm.value.to
    )
  } else {
    return !!platformForm.value.url && !urlError.value
  }
})

// Load settings on mount
onMounted(async () => {
  try {
    await settingsStore.loadOemSettings()
    if (activeSection.value === 'webhook') {
      await loadWebhookConfig()
    }
  } catch (error) {
    showToast('加载设置失败', 'error')
  }
})

// Cleanup before unmount
onBeforeUnmount(() => {
  isMounted.value = false
  if (abortController.value) {
    abortController.value.abort()
  }
  if (sectionWatcher) sectionWatcher()
  if (platformTypeWatcher) platformTypeWatcher()
})

// Load webhook config
const loadWebhookConfig = async () => {
  if (!isMounted.value) return
  try {
    const response = await apiClient.get('/admin/webhook', {
      signal: abortController.value.signal
    })
    if (response.config && isMounted.value) {
      webhookConfig.value = {
        ...webhookConfig.value,
        ...response.config,
        notificationTypes: {
          ...DEFAULT_WEBHOOK_NOTIFICATION_TYPES,
          ...(response.config.notificationTypes || {})
        }
      }
    }
  } catch (error) {
    if (error.name === 'AbortError') return
    if (!isMounted.value) return
    console.error('Failed to load webhook config:', error)
  }
}

// Load Claude config
const loadClaudeConfig = async () => {
  if (!isMounted.value) return
  claudeConfigLoading.value = true
  try {
    const response = await apiClient.get('/admin/settings/claude', {
      signal: abortController.value.signal
    })
    if (response.config && isMounted.value) {
      claudeConfig.value = { ...claudeConfig.value, ...response.config }
    }
  } catch (error) {
    if (error.name === 'AbortError') return
    if (!isMounted.value) return
    showToast(error.error || error.message || '加载Claude配置失败', 'error')
  } finally {
    if (isMounted.value) {
      claudeConfigLoading.value = false
    }
  }
}

// Save webhook config
const saveWebhookConfig = async () => {
  if (!isMounted.value) return
  try {
    const response = await apiClient.put('/admin/webhook', webhookConfig.value, {
      signal: abortController.value.signal
    })
    if (response.success && isMounted.value) {
      showToast('保存成功', 'success')
    }
  } catch (error) {
    if (error.name === 'AbortError') return
    if (!isMounted.value) return
    showToast(error.error || error.message || '保存失败', 'error')
  }
}

// Save Claude config
const saveClaudeConfig = async () => {
  if (!isMounted.value) return
  try {
    const response = await apiClient.put('/admin/settings/claude', claudeConfig.value, {
      signal: abortController.value.signal
    })
    if (response.success && isMounted.value) {
      showToast('保存成功', 'success')
      if (response.config) {
        claudeConfig.value = { ...claudeConfig.value, ...response.config }
      }
    }
  } catch (error) {
    if (error.name === 'AbortError') return
    if (!isMounted.value) return
    showToast(error.error || error.message || '保存失败', 'error')
  }
}

// Validate URL
const validateUrl = () => {
  const url = platformForm.value.url
  if (!url) {
    urlError.value = false
    urlValid.value = false
    return
  }
  try {
    new URL(url)
    urlError.value = false
    urlValid.value = true
  } catch {
    urlError.value = true
    urlValid.value = false
  }
}

// Validate platform form
const validatePlatformForm = () => {
  if (!isPlatformFormValid.value) {
    showToast('请填写必填项', 'error')
    return false
  }
  return true
}

// Toggle platform
const togglePlatform = async (platformId) => {
  if (!isMounted.value) return
  try {
    const response = await apiClient.patch(
      `/admin/webhook/platforms/${platformId}/toggle`,
      {},
      {
        signal: abortController.value.signal
      }
    )
    if (response.success && isMounted.value) {
      await loadWebhookConfig()
      showToast('状态已更新', 'success')
    }
  } catch (error) {
    if (error.name === 'AbortError') return
    if (!isMounted.value) return
    showToast(error.error || error.message || '操作失败', 'error')
  }
}

// Edit platform
const editPlatform = (platform) => {
  if (!isMounted.value) return
  editingPlatform.value = platform
  platformForm.value = { ...platform }
  showAddPlatformModal.value = true
}

// Delete platform
const deletePlatform = async (platformId) => {
  if (!isMounted.value) return
  if (!confirm('确定要删除此平台吗？')) return

  try {
    const response = await apiClient.delete(`/admin/webhook/platforms/${platformId}`, {
      signal: abortController.value.signal
    })
    if (response.success && isMounted.value) {
      await loadWebhookConfig()
      showToast('删除成功', 'success')
    }
  } catch (error) {
    if (error.name === 'AbortError') return
    if (!isMounted.value) return
    showToast(error.error || error.message || '删除失败', 'error')
  }
}

// Save platform
const savePlatform = async () => {
  if (!isMounted.value) return
  if (!validatePlatformForm()) return

  savingPlatform.value = true
  try {
    const endpoint = editingPlatform.value
      ? `/admin/webhook/platforms/${editingPlatform.value.id}`
      : '/admin/webhook/platforms'
    const method = editingPlatform.value ? 'put' : 'post'

    const response = await apiClient[method](endpoint, platformForm.value, {
      signal: abortController.value.signal
    })

    if (response.success && isMounted.value) {
      showToast(editingPlatform.value ? '更新成功' : '添加成功', 'success')
      await loadWebhookConfig()
      closePlatformModal()
    }
  } catch (error) {
    if (error.name === 'AbortError') return
    if (!isMounted.value) return
    showToast(error.error || error.message || '保存失败', 'error')
  } finally {
    if (isMounted.value) {
      savingPlatform.value = false
    }
  }
}

// Test platform
const testPlatform = async (platform) => {
  if (!isMounted.value) return
  try {
    const testData = {
      type: platform.type,
      enableSign: platform.enableSign,
      secret: platform.secret
    }

    if (platform.type === 'bark') {
      testData.deviceKey = platform.deviceKey
      testData.serverUrl = platform.serverUrl
    } else if (platform.type === 'smtp') {
      testData.host = platform.host
      testData.port = platform.port
      testData.secure = platform.secure
      testData.user = platform.user
      testData.pass = platform.pass
      testData.from = platform.from
      testData.to = platform.to
    } else if (platform.type === 'telegram') {
      testData.botToken = platform.botToken
      testData.chatId = platform.chatId
      testData.apiBaseUrl = platform.apiBaseUrl
      testData.proxyUrl = platform.proxyUrl
    } else {
      testData.url = platform.url
    }

    const response = await apiClient.post('/admin/webhook/test', testData, {
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

// Test platform form
const testPlatformForm = async () => {
  if (!isMounted.value) return
  if (!validatePlatformForm()) return

  testingConnection.value = true
  try {
    const response = await apiClient.post('/admin/webhook/test', platformForm.value, {
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

// Send test notification
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

// Close platform modal
const closePlatformModal = () => {
  if (!isMounted.value) return
  showAddPlatformModal.value = false
  setTimeout(() => {
    if (!isMounted.value) return
    editingPlatform.value = null
    platformForm.value = {
      type: 'wechat_work',
      name: '',
      url: '',
      enableSign: false,
      secret: '',
      botToken: '',
      chatId: '',
      apiBaseUrl: '',
      proxyUrl: '',
      deviceKey: '',
      serverUrl: '',
      level: '',
      sound: '',
      group: '',
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

// Helper functions
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
    dingtalk: 'fas fa-comment-dots text-gray-600',
    feishu: 'fas fa-dove text-gray-600',
    slack: 'fab fa-slack text-purple-600',
    discord: 'fab fa-discord text-indigo-600',
    telegram: 'fab fa-telegram-plane text-sky-500',
    bark: 'fas fa-bell text-orange-500',
    smtp: 'fas fa-envelope text-gray-600',
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

// Save OEM settings
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
      showToast('OEM设置保存成功', 'success')
    } else {
      showToast(result?.message || '保存失败', 'error')
    }
  } catch (error) {
    showToast('保存OEM设置失败', 'error')
  }
}

// Reset OEM settings
const resetOemSettings = async () => {
  if (!confirm('确定要重置为默认设置吗？\n\n这将清除所有自定义的网站名称和图标设置。')) return

  try {
    const result = await settingsStore.resetOemSettings()
    if (result && result.success) {
      showToast('已重置为默认设置', 'success')
    } else {
      showToast('重置失败', 'error')
    }
  } catch (error) {
    showToast('重置失败', 'error')
  }
}

// Handle icon upload
const handleIconUpload = async (event) => {
  const file = event.target.files[0]
  if (!file) return

  const validation = settingsStore.validateIconFile(file)
  if (!validation.isValid) {
    validation.errors.forEach((error) => showToast(error, 'error'))
    return
  }

  try {
    const base64Data = await settingsStore.fileToBase64(file)
    oemSettings.value.siteIconData = base64Data
  } catch (error) {
    showToast('文件读取失败', 'error')
  }

  event.target.value = ''
}

// Remove icon
const removeIcon = () => {
  oemSettings.value.siteIcon = ''
  oemSettings.value.siteIconData = ''
}

// Handle icon error
const handleIconError = () => {
  console.warn('Icon failed to load')
}

// Format date time
const formatDateTime = settingsStore.formatDateTime
</script>

<style scoped>
.settings-container {
  min-height: calc(100vh - 300px);
}
</style>
