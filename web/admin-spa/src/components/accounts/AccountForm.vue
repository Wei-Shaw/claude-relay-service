<template>
  <Teleport to="body">
    <div v-if="show" class="modal fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <div
        class="modal-content custom-scrollbar mx-auto max-h-[90vh] w-full max-w-2xl overflow-y-auto p-4 sm:p-6 md:p-8"
      >
        <div class="mb-4 flex items-center justify-between sm:mb-6">
          <div class="flex items-center gap-2 sm:gap-3">
            <div
              class="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-green-500 to-green-600 sm:h-10 sm:w-10 sm:rounded-xl"
            >
              <i class="fas fa-user-circle text-sm text-white sm:text-base" />
            </div>
            <h3 class="text-lg font-bold text-gray-900 dark:text-gray-100 sm:text-xl">
              {{ isEdit ? '编辑账户' : '添加账户' }}
            </h3>
          </div>
          <button
            class="p-1 text-gray-400 transition-colors hover:text-gray-600"
            @click="$emit('close')"
          >
            <i class="fas fa-times text-lg sm:text-xl" />
          </button>
        </div>

        <!-- 步骤指示器 -->
        <div
          v-if="!isEdit && (form.addType === 'oauth' || form.addType === 'setup-token')"
          class="mb-4 flex items-center justify-center sm:mb-8"
        >
          <div class="flex items-center space-x-2 sm:space-x-4">
            <div class="flex items-center">
              <div
                :class="[
                  'flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold sm:h-8 sm:w-8 sm:text-sm',
                  oauthStep >= 1 ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-500'
                ]"
              >
                1
              </div>
              <span
                class="ml-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 sm:ml-2 sm:text-sm"
                >基本信息</span
              >
            </div>
            <div class="h-0.5 w-4 bg-gray-300 sm:w-8" />
            <div class="flex items-center">
              <div
                :class="[
                  'flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold sm:h-8 sm:w-8 sm:text-sm',
                  oauthStep >= 2 ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-500'
                ]"
              >
                2
              </div>
              <span
                class="ml-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 sm:ml-2 sm:text-sm"
                >授权认证</span
              >
            </div>
          </div>
        </div>

        <!-- 步骤1: 基本信息和代理设置 -->
        <div v-if="oauthStep === 1 && !isEdit">
          <div class="space-y-6">
            <div v-if="!isEdit">
              <label class="mb-3 block text-sm font-semibold text-gray-700 dark:text-gray-300"
                >平台</label
              >
              <div class="flex gap-4">
                <label class="flex cursor-pointer items-center">
                  <input
                    v-model="form.platform"
                    class="mr-2 text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700"
                    type="radio"
                    value="claude"
                  />
                  <span class="text-sm text-gray-700 dark:text-gray-300">Claude</span>
                </label>
                <label class="flex cursor-pointer items-center">
                  <input
                    v-model="form.platform"
                    class="mr-2 text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700"
                    type="radio"
                    value="claude-console"
                  />
                  <span class="text-sm text-gray-700 dark:text-gray-300">Claude Console</span>
                </label>
                <label class="flex cursor-pointer items-center">
                  <input
                    v-model="form.platform"
                    class="mr-2 text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700"
                    type="radio"
                    value="gemini"
                  />
                  <span class="text-sm text-gray-700 dark:text-gray-300">Gemini</span>
                </label>
                <label class="flex cursor-pointer items-center">
                  <input
                    v-model="form.platform"
                    class="mr-2 text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700"
                    type="radio"
                    value="openai"
                  />
                  <span class="text-sm text-gray-700 dark:text-gray-300">OpenAI</span>
                </label>
                <label class="flex cursor-pointer items-center">
                  <input
                    v-model="form.platform"
                    class="mr-2 text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700"
                    type="radio"
                    value="azure_openai"
                  />
                  <span class="text-sm text-gray-700 dark:text-gray-300">Azure OpenAI</span>
                </label>
                <label class="flex cursor-pointer items-center">
                  <input
                    v-model="form.platform"
                    class="mr-2 text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700"
                    type="radio"
                    value="bedrock"
                  />
                  <span class="text-sm text-gray-700 dark:text-gray-300">Bedrock</span>
                </label>
              </div>
            </div>

            <div
              v-if="
                !isEdit &&
                form.platform !== 'claude-console' &&
                form.platform !== 'bedrock' &&
                form.platform !== 'azure_openai'
              "
            >
              <label class="mb-3 block text-sm font-semibold text-gray-700 dark:text-gray-300"
                >添加方式</label
              >
              <div class="flex flex-wrap gap-4">
                <label v-if="form.platform === 'claude'" class="flex cursor-pointer items-center">
                  <input
                    v-model="form.addType"
                    class="mr-2 text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700"
                    type="radio"
                    value="setup-token"
                  />
                  <span class="text-sm text-gray-700 dark:text-gray-300">Setup Token (推荐)</span>
                </label>
                <label class="flex cursor-pointer items-center">
                  <input
                    v-model="form.addType"
                    class="mr-2 text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700"
                    type="radio"
                    value="oauth"
                  />
                  <span class="text-sm text-gray-700 dark:text-gray-300">OAuth 授权</span>
                </label>
                <label class="flex cursor-pointer items-center">
                  <input
                    v-model="form.addType"
                    class="mr-2 text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700"
                    type="radio"
                    value="manual"
                  />
                  <span class="text-sm text-gray-700 dark:text-gray-300"
                    >手动输入 Access Token</span
                  >
                </label>
              </div>
            </div>

            <div>
              <label class="mb-3 block text-sm font-semibold text-gray-700 dark:text-gray-300"
                >账户名称</label
              >
              <input
                v-model="form.name"
                class="form-input w-full dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
                :class="{ 'border-red-500': errors.name }"
                placeholder="为账户设置一个易识别的名称"
                required
                type="text"
              />
              <p v-if="errors.name" class="mt-1 text-xs text-red-500">
                {{ errors.name }}
              </p>
            </div>

            <div>
              <label class="mb-3 block text-sm font-semibold text-gray-700 dark:text-gray-300"
                >描述 (可选)</label
              >
              <textarea
                v-model="form.description"
                class="form-input w-full resize-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
                placeholder="账户用途说明..."
                rows="3"
              />
            </div>

            <div>
              <label class="mb-3 block text-sm font-semibold text-gray-700 dark:text-gray-300"
                >账户类型</label
              >
              <div class="flex gap-4">
                <label class="flex cursor-pointer items-center">
                  <input
                    v-model="form.accountType"
                    class="mr-2 text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700"
                    type="radio"
                    value="shared"
                  />
                  <span class="text-sm text-gray-700 dark:text-gray-300">共享账户</span>
                </label>
                <label class="flex cursor-pointer items-center">
                  <input
                    v-model="form.accountType"
                    class="mr-2 text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700"
                    type="radio"
                    value="dedicated"
                  />
                  <span class="text-sm text-gray-700 dark:text-gray-300">专属账户</span>
                </label>
                <label class="flex cursor-pointer items-center">
                  <input
                    v-model="form.accountType"
                    class="mr-2 text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700"
                    type="radio"
                    value="group"
                  />
                  <span class="text-sm text-gray-700 dark:text-gray-300">分组调度</span>
                </label>
              </div>
              <p class="mt-2 text-xs text-gray-500 dark:text-gray-400">
                共享账户：供所有API Key使用；专属账户：仅供特定API
                Key使用；分组调度：加入分组供分组内调度
              </p>
            </div>

            <!-- 分组选择器 -->
            <div v-if="form.accountType === 'group'">
              <label class="mb-3 block text-sm font-semibold text-gray-700 dark:text-gray-300"
                >选择分组 *</label
              >
              <div class="flex gap-2">
                <select
                  v-model="form.groupId"
                  class="form-input flex-1 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
                  required
                >
                  <option value="">请选择分组</option>
                  <option v-for="group in filteredGroups" :key="group.id" :value="group.id">
                    {{ group.name }} ({{ group.memberCount || 0 }} 个成员)
                  </option>
                  <option value="__new__">+ 新建分组</option>
                </select>
                <button
                  class="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                  type="button"
                  @click="refreshGroups"
                >
                  <i class="fas fa-sync-alt" :class="{ 'animate-spin': loadingGroups }" />
                </button>
              </div>
            </div>

            <!-- Gemini 项目 ID 字段 -->
            <div v-if="form.platform === 'gemini'">
              <label class="mb-3 block text-sm font-semibold text-gray-700 dark:text-gray-300"
                >项目 ID (可选)</label
              >
              <input
                v-model="form.projectId"
                class="form-input w-full dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
                placeholder="例如：verdant-wares-464411-k9"
                type="text"
              />
              <div class="mt-2 rounded-lg border border-yellow-200 bg-yellow-50 p-3">
                <div class="flex items-start gap-2">
                  <i class="fas fa-info-circle mt-0.5 text-yellow-600" />
                  <div class="text-xs text-yellow-700">
                    <p class="mb-1 font-medium">Google Cloud/Workspace 账号需要提供项目 ID</p>
                    <p>
                      某些 Google 账号（特别是绑定了 Google Cloud 的账号）会被识别为 Workspace
                      账号，需要提供额外的项目 ID。
                    </p>
                    <div class="mt-2 rounded border border-yellow-300 bg-white p-2">
                      <p class="mb-1 font-medium">如何获取项目 ID：</p>
                      <ol class="ml-2 list-inside list-decimal space-y-1">
                        <li>
                          访问
                          <a
                            class="font-medium text-blue-600 hover:underline"
                            href="https://console.cloud.google.com/welcome"
                            target="_blank"
                            >Google Cloud Console</a
                          >
                        </li>
                        <li>
                          复制<span class="font-semibold text-red-600">项目 ID（Project ID）</span
                          >，通常是字符串格式
                        </li>
                        <li class="text-red-600">
                          ⚠️ 注意：要复制项目 ID（Project ID），不要复制项目编号（Project Number）！
                        </li>
                      </ol>
                    </div>
                    <p class="mt-2">
                      <strong>提示：</strong>如果您的账号是普通个人账号（未绑定 Google
                      Cloud），请留空此字段。
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <!-- Bedrock 特定字段 -->
            <div v-if="form.platform === 'bedrock' && !isEdit" class="space-y-4">
              <div>
                <label class="mb-3 block text-sm font-semibold text-gray-700 dark:text-gray-300"
                  >AWS 访问密钥 ID *</label
                >
                <input
                  v-model="form.accessKeyId"
                  class="form-input w-full dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
                  :class="{ 'border-red-500': errors.accessKeyId }"
                  placeholder="请输入 AWS Access Key ID"
                  required
                  type="text"
                />
                <p v-if="errors.accessKeyId" class="mt-1 text-xs text-red-500">
                  {{ errors.accessKeyId }}
                </p>
              </div>

              <div>
                <label class="mb-3 block text-sm font-semibold text-gray-700 dark:text-gray-300"
                  >AWS 秘密访问密钥 *</label
                >
                <input
                  v-model="form.secretAccessKey"
                  class="form-input w-full dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
                  :class="{ 'border-red-500': errors.secretAccessKey }"
                  placeholder="请输入 AWS Secret Access Key"
                  required
                  type="password"
                />
                <p v-if="errors.secretAccessKey" class="mt-1 text-xs text-red-500">
                  {{ errors.secretAccessKey }}
                </p>
              </div>

              <div>
                <label class="mb-3 block text-sm font-semibold text-gray-700 dark:text-gray-300"
                  >AWS 区域 *</label
                >
                <input
                  v-model="form.region"
                  class="form-input w-full dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
                  :class="{ 'border-red-500': errors.region }"
                  placeholder="例如：us-east-1"
                  required
                  type="text"
                />
                <p v-if="errors.region" class="mt-1 text-xs text-red-500">
                  {{ errors.region }}
                </p>
                <div class="mt-2 rounded-lg border border-blue-200 bg-blue-50 p-3">
                  <div class="flex items-start gap-2">
                    <i class="fas fa-info-circle mt-0.5 text-blue-600" />
                    <div class="text-xs text-blue-700">
                      <p class="mb-1 font-medium">常用 AWS 区域参考：</p>
                      <div class="grid grid-cols-2 gap-1 text-xs">
                        <span>• us-east-1 (美国东部)</span>
                        <span>• us-west-2 (美国西部)</span>
                        <span>• eu-west-1 (欧洲爱尔兰)</span>
                        <span>• ap-southeast-1 (新加坡)</span>
                        <span>• ap-northeast-1 (东京)</span>
                        <span>• eu-central-1 (法兰克福)</span>
                      </div>
                      <p class="mt-2 text-blue-600">💡 请输入完整的区域代码，如 us-east-1</p>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <label class="mb-3 block text-sm font-semibold text-gray-700 dark:text-gray-300"
                  >会话令牌 (可选)</label
                >
                <input
                  v-model="form.sessionToken"
                  class="form-input w-full dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
                  placeholder="如果使用临时凭证，请输入会话令牌"
                  type="password"
                />
                <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  仅在使用临时 AWS 凭证时需要填写
                </p>
              </div>

              <div>
                <label class="mb-3 block text-sm font-semibold text-gray-700 dark:text-gray-300"
                  >默认主模型 (可选)</label
                >
                <input
                  v-model="form.defaultModel"
                  class="form-input w-full dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
                  placeholder="例如：us.anthropic.claude-sonnet-4-20250514-v1:0"
                  type="text"
                />
                <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  留空将使用系统默认模型。支持 inference profile ID 或 ARN
                </p>
                <div class="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <div class="flex items-start gap-2">
                    <i class="fas fa-info-circle mt-0.5 text-amber-600" />
                    <div class="text-xs text-amber-700">
                      <p class="mb-1 font-medium">Bedrock 模型配置说明：</p>
                      <ul class="list-inside list-disc space-y-1 text-xs">
                        <li>支持 Inference Profile ID（推荐）</li>
                        <li>支持 Application Inference Profile ARN</li>
                        <li>常用模型：us.anthropic.claude-sonnet-4-20250514-v1:0</li>
                        <li>留空将使用系统配置的默认模型</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <label class="mb-3 block text-sm font-semibold text-gray-700 dark:text-gray-300"
                  >小快速模型 (可选)</label
                >
                <input
                  v-model="form.smallFastModel"
                  class="form-input w-full dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
                  placeholder="例如：us.anthropic.claude-3-5-haiku-20241022-v1:0"
                  type="text"
                />
                <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  用于快速响应的轻量级模型，留空将使用系统默认
                </p>
              </div>
            </div>

            <!-- Azure OpenAI 特定字段 -->
            <div v-if="form.platform === 'azure_openai' && !isEdit" class="space-y-4">
              <div>
                <label class="mb-3 block text-sm font-semibold text-gray-700 dark:text-gray-300"
                  >Azure Endpoint *</label
                >
                <input
                  v-model="form.azureEndpoint"
                  class="form-input w-full dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
                  :class="{ 'border-red-500': errors.azureEndpoint }"
                  placeholder="https://your-resource.openai.azure.com"
                  required
                  type="url"
                />
                <p v-if="errors.azureEndpoint" class="mt-1 text-xs text-red-500">
                  {{ errors.azureEndpoint }}
                </p>
                <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Azure OpenAI 资源的终结点 URL，格式：https://your-resource.openai.azure.com
                </p>
              </div>

              <div>
                <label class="mb-3 block text-sm font-semibold text-gray-700 dark:text-gray-300"
                  >API 版本</label
                >
                <input
                  v-model="form.apiVersion"
                  class="form-input w-full dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
                  placeholder="2024-02-01"
                  type="text"
                />
                <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Azure OpenAI API 版本，默认使用最新稳定版本 2024-02-01
                </p>
              </div>

              <div>
                <label class="mb-3 block text-sm font-semibold text-gray-700 dark:text-gray-300"
                  >部署名称 *</label
                >
                <input
                  v-model="form.deploymentName"
                  class="form-input w-full dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
                  :class="{ 'border-red-500': errors.deploymentName }"
                  placeholder="gpt-4"
                  required
                  type="text"
                />
                <p v-if="errors.deploymentName" class="mt-1 text-xs text-red-500">
                  {{ errors.deploymentName }}
                </p>
                <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  在 Azure OpenAI Studio 中创建的部署名称
                </p>
              </div>

              <div>
                <label class="mb-3 block text-sm font-semibold text-gray-700 dark:text-gray-300"
                  >API Key *</label
                >
                <input
                  v-model="form.apiKey"
                  class="form-input w-full dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
                  :class="{ 'border-red-500': errors.apiKey }"
                  placeholder="请输入 Azure OpenAI API Key"
                  required
                  type="password"
                />
                <p v-if="errors.apiKey" class="mt-1 text-xs text-red-500">
                  {{ errors.apiKey }}
                </p>
                <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  从 Azure 门户获取的 API 密钥
                </p>
              </div>

              <div>
                <label class="mb-3 block text-sm font-semibold text-gray-700 dark:text-gray-300"
                  >支持的模型</label
                >
                <div class="flex flex-wrap gap-2">
                  <label
                    v-for="model in ['gpt-4', 'gpt-4-turbo', 'gpt-35-turbo', 'gpt-35-turbo-16k']"
                    :key="model"
                    class="flex cursor-pointer items-center"
                  >
                    <input
                      v-model="form.supportedModels"
                      class="mr-2 text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700"
                      type="checkbox"
                      :value="model"
                    />
                    <span class="text-sm text-gray-700 dark:text-gray-300">{{ model }}</span>
                  </label>
                </div>
                <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  选择此部署支持的模型类型
                </p>
              </div>
            </div>

            <div v-if="form.platform === 'bedrock' && !isEdit">
              <div>
                <label class="mb-3 block text-sm font-semibold text-gray-700 dark:text-gray-300"
                  >限流机制</label
                >
                <div class="mb-3">
                  <label class="inline-flex cursor-pointer items-center">
                    <input
                      v-model="form.enableRateLimit"
                      class="mr-2 rounded border-gray-300 text-blue-600 focus:border-blue-500 focus:ring focus:ring-blue-200 dark:border-gray-600 dark:bg-gray-700"
                      type="checkbox"
                    />
                    <span class="text-sm text-gray-700 dark:text-gray-300">启用限流机制</span>
                  </label>
                  <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    启用后，当账号返回429错误时将暂停调度一段时间
                  </p>
                </div>

                <div v-if="form.enableRateLimit">
                  <label class="mb-3 block text-sm font-semibold text-gray-700 dark:text-gray-300"
                    >限流时间 (分钟)</label
                  >
                  <input
                    v-model.number="form.rateLimitDuration"
                    class="form-input w-full dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
                    min="1"
                    placeholder="默认60分钟"
                    type="number"
                  />
                  <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    账号被限流后暂停调度的时间（分钟）
                  </p>
                </div>
              </div>
            </div>

            <!-- Claude Console 特定字段 -->
            <div v-if="form.platform === 'claude-console' && !isEdit" class="space-y-4">
              <div>
                <label class="mb-3 block text-sm font-semibold text-gray-700 dark:text-gray-300"
                  >API URL *</label
                >
                <input
                  v-model="form.apiUrl"
                  class="form-input w-full dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
                  :class="{ 'border-red-500': errors.apiUrl }"
                  placeholder="例如：https://api.example.com"
                  required
                  type="text"
                />
                <p v-if="errors.apiUrl" class="mt-1 text-xs text-red-500">
                  {{ errors.apiUrl }}
                </p>
              </div>

              <div>
                <label class="mb-3 block text-sm font-semibold text-gray-700 dark:text-gray-300"
                  >API Key *</label
                >
                <input
                  v-model="form.apiKey"
                  class="form-input w-full dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
                  :class="{ 'border-red-500': errors.apiKey }"
                  placeholder="请输入API Key"
                  required
                  type="password"
                />
                <p v-if="errors.apiKey" class="mt-1 text-xs text-red-500">
                  {{ errors.apiKey }}
                </p>
              </div>

              <div>
                <label class="mb-3 block text-sm font-semibold text-gray-700 dark:text-gray-300"
                  >模型映射表 (可选)</label
                >
                <div class="mb-3 rounded-lg bg-blue-50 p-3 dark:bg-blue-900/30">
                  <p class="text-xs text-blue-700 dark:text-blue-400">
                    <i class="fas fa-info-circle mr-1" />
                    留空表示支持所有模型且不修改请求。配置映射后，左侧模型会被识别为支持的模型，右侧是实际发送的模型。
                  </p>
                </div>

                <!-- 模型映射表 -->
                <div class="mb-3 space-y-2">
                  <div
                    v-for="(mapping, index) in modelMappings"
                    :key="index"
                    class="flex items-center gap-2"
                  >
                    <input
                      v-model="mapping.from"
                      class="form-input flex-1 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
                      placeholder="原始模型名称"
                      type="text"
                    />
                    <i class="fas fa-arrow-right text-gray-400 dark:text-gray-500" />
                    <input
                      v-model="mapping.to"
                      class="form-input flex-1 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
                      placeholder="映射后的模型名称"
                      type="text"
                    />
                    <button
                      class="rounded-lg p-2 text-red-500 transition-colors hover:bg-red-50 dark:hover:bg-red-900/20"
                      type="button"
                      @click="removeModelMapping(index)"
                    >
                      <i class="fas fa-trash" />
                    </button>
                  </div>
                </div>

                <!-- 添加映射按钮 -->
                <button
                  class="w-full rounded-lg border-2 border-dashed border-gray-300 px-4 py-2 text-gray-600 transition-colors hover:border-gray-400 hover:text-gray-700 dark:border-gray-600 dark:text-gray-400 dark:hover:border-gray-500 dark:hover:text-gray-300"
                  type="button"
                  @click="addModelMapping"
                >
                  <i class="fas fa-plus mr-2" />
                  添加模型映射
                </button>

                <!-- 快捷添加按钮 -->
                <div class="mt-3 flex flex-wrap gap-2">
                  <button
                    class="rounded-lg bg-blue-100 px-3 py-1 text-xs text-blue-700 transition-colors hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50"
                    type="button"
                    @click="
                      addPresetMapping('claude-sonnet-4-20250514', 'claude-sonnet-4-20250514')
                    "
                  >
                    + Sonnet 4
                  </button>
                  <button
                    class="rounded-lg bg-purple-100 px-3 py-1 text-xs text-purple-700 transition-colors hover:bg-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:hover:bg-purple-900/50"
                    type="button"
                    @click="
                      addPresetMapping('claude-opus-4-1-20250805', 'claude-opus-4-1-20250805')
                    "
                  >
                    + Opus 4.1
                  </button>
                  <button
                    class="rounded-lg bg-green-100 px-3 py-1 text-xs text-green-700 transition-colors hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-green-900/50"
                    type="button"
                    @click="
                      addPresetMapping('claude-3-5-haiku-20241022', 'claude-3-5-haiku-20241022')
                    "
                  >
                    + Haiku 3.5
                  </button>
                  <button
                    class="rounded-lg bg-orange-100 px-3 py-1 text-xs text-orange-700 transition-colors hover:bg-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:hover:bg-orange-900/50"
                    type="button"
                    @click="
                      addPresetMapping('claude-opus-4-1-20250805', 'claude-sonnet-4-20250514')
                    "
                  >
                    + Opus 4.1 → Sonnet 4
                  </button>
                </div>
                <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  留空表示支持所有模型。如果指定模型，请求中的模型不在列表内将不会调度到此账号
                </p>
              </div>

              <div>
                <label class="mb-3 block text-sm font-semibold text-gray-700 dark:text-gray-300"
                  >自定义 User-Agent (可选)</label
                >
                <input
                  v-model="form.userAgent"
                  class="form-input w-full dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
                  placeholder="留空则透传客户端 User-Agent"
                  type="text"
                />
                <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  留空时将自动使用客户端的 User-Agent，仅在需要固定特定 UA 时填写
                </p>
              </div>

              <div>
                <label class="mb-3 block text-sm font-semibold text-gray-700 dark:text-gray-300"
                  >限流机制</label
                >
                <div class="mb-3">
                  <label class="inline-flex cursor-pointer items-center">
                    <input
                      v-model="form.enableRateLimit"
                      class="mr-2 rounded border-gray-300 text-blue-600 focus:border-blue-500 focus:ring focus:ring-blue-200 dark:border-gray-600 dark:bg-gray-700"
                      type="checkbox"
                    />
                    <span class="text-sm text-gray-700 dark:text-gray-300">启用限流机制</span>
                  </label>
                  <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    启用后，当账号返回429错误时将暂停调度一段时间
                  </p>
                </div>

                <div v-if="form.enableRateLimit">
                  <label class="mb-3 block text-sm font-semibold text-gray-700 dark:text-gray-300"
                    >限流时间 (分钟)</label
                  >
                  <input
                    v-model.number="form.rateLimitDuration"
                    class="form-input w-full dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
                    min="1"
                    placeholder="默认60分钟"
                    type="number"
                  />
                  <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    账号被限流后暂停调度的时间（分钟）
                  </p>
                </div>
              </div>
            </div>

            <!-- Claude 订阅类型选择 -->
            <div v-if="form.platform === 'claude'">
              <label class="mb-3 block text-sm font-semibold text-gray-700 dark:text-gray-300"
                >订阅类型</label
              >
              <div class="flex gap-4">
                <label class="flex cursor-pointer items-center">
                  <input
                    v-model="form.subscriptionType"
                    class="mr-2 text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700"
                    type="radio"
                    value="claude_max"
                  />
                  <span class="text-sm text-gray-700 dark:text-gray-300">Claude Max</span>
                </label>
                <label class="flex cursor-pointer items-center">
                  <input
                    v-model="form.subscriptionType"
                    class="mr-2 text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700"
                    type="radio"
                    value="claude_pro"
                  />
                  <span class="text-sm text-gray-700 dark:text-gray-300">Claude Pro</span>
                </label>
              </div>
              <p class="mt-2 text-xs text-gray-500 dark:text-gray-400">
                <i class="fas fa-info-circle mr-1" />
                Pro 账号不支持 Claude Opus 4 模型
              </p>
            </div>

            <!-- 所有平台的优先级设置 -->
            <div>
              <label class="mb-3 block text-sm font-semibold text-gray-700 dark:text-gray-300"
                >调度优先级 (1-100)</label
              >
              <input
                v-model.number="form.priority"
                class="form-input w-full dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
                max="100"
                min="1"
                placeholder="数字越小优先级越高，默认50"
                type="number"
              />
              <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                数字越小优先级越高，建议范围：1-100
              </p>
            </div>

            <!-- 手动输入 Token 字段 -->
            <div
              v-if="
                form.addType === 'manual' &&
                form.platform !== 'claude-console' &&
                form.platform !== 'bedrock'
              "
              class="space-y-4 rounded-lg border border-blue-200 bg-blue-50 p-4"
            >
              <div class="mb-4 flex items-start gap-3">
                <div
                  class="mt-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-blue-500"
                >
                  <i class="fas fa-info text-sm text-white" />
                </div>
                <div>
                  <h5 class="mb-2 font-semibold text-blue-900 dark:text-blue-300">
                    手动输入 Token
                  </h5>
                  <p
                    v-if="form.platform === 'claude'"
                    class="mb-2 text-sm text-blue-800 dark:text-blue-300"
                  >
                    请输入有效的 Claude Access Token。如果您有 Refresh
                    Token，建议也一并填写以支持自动刷新。
                  </p>
                  <p
                    v-else-if="form.platform === 'gemini'"
                    class="mb-2 text-sm text-blue-800 dark:text-blue-300"
                  >
                    请输入有效的 Gemini Access Token。如果您有 Refresh
                    Token，建议也一并填写以支持自动刷新。
                  </p>
                  <p
                    v-else-if="form.platform === 'openai'"
                    class="mb-2 text-sm text-blue-800 dark:text-blue-300"
                  >
                    请输入有效的 OpenAI Access Token。如果您有 Refresh
                    Token，建议也一并填写以支持自动刷新。
                  </p>
                  <div
                    class="mb-2 mt-2 rounded-lg border border-blue-300 bg-white/80 p-3 dark:border-blue-600 dark:bg-gray-800/80"
                  >
                    <p class="mb-1 text-sm font-medium text-blue-900 dark:text-blue-300">
                      <i class="fas fa-folder-open mr-1" />
                      获取 Access Token 的方法：
                    </p>
                    <p
                      v-if="form.platform === 'claude'"
                      class="text-xs text-blue-800 dark:text-blue-300"
                    >
                      请从已登录 Claude Code 的机器上获取
                      <code class="rounded bg-blue-100 px-1 py-0.5 font-mono dark:bg-blue-900/50"
                        >~/.claude/.credentials.json</code
                      >
                      文件中的凭证， 请勿使用 Claude 官网 API Keys 页面的密钥。
                    </p>
                    <p
                      v-else-if="form.platform === 'gemini'"
                      class="text-xs text-blue-800 dark:text-blue-300"
                    >
                      请从已登录 Gemini CLI 的机器上获取
                      <code class="rounded bg-blue-100 px-1 py-0.5 font-mono dark:bg-blue-900/50"
                        >~/.config/gemini/credentials.json</code
                      >
                      文件中的凭证。
                    </p>
                    <p
                      v-else-if="form.platform === 'openai'"
                      class="text-xs text-blue-800 dark:text-blue-300"
                    >
                      请从已登录 OpenAI 账户的机器上获取认证凭证， 或通过 OAuth 授权流程获取 Access
                      Token。
                    </p>
                  </div>
                  <p class="text-xs text-blue-600 dark:text-blue-400">
                    💡 如果未填写 Refresh Token，Token 过期后需要手动更新。
                  </p>
                </div>
              </div>

              <!-- OpenAI 平台需要 ID Token -->
              <div v-if="form.platform === 'openai'">
                <label class="mb-3 block text-sm font-semibold text-gray-700 dark:text-gray-300"
                  >ID Token *</label
                >
                <textarea
                  v-model="form.idToken"
                  class="form-input w-full resize-none font-mono text-xs dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
                  :class="{ 'border-red-500': errors.idToken }"
                  placeholder="请输入 ID Token (JWT 格式)..."
                  required
                  rows="4"
                />
                <p v-if="errors.idToken" class="mt-1 text-xs text-red-500">
                  {{ errors.idToken }}
                </p>
                <p class="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  ID Token 是 OpenAI OAuth 认证返回的 JWT token，包含用户信息和组织信息
                </p>
              </div>

              <div>
                <label class="mb-3 block text-sm font-semibold text-gray-700 dark:text-gray-300"
                  >Access Token *</label
                >
                <textarea
                  v-model="form.accessToken"
                  class="form-input w-full resize-none font-mono text-xs dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
                  :class="{ 'border-red-500': errors.accessToken }"
                  placeholder="请输入 Access Token..."
                  required
                  rows="4"
                />
                <p v-if="errors.accessToken" class="mt-1 text-xs text-red-500">
                  {{ errors.accessToken }}
                </p>
              </div>

              <div>
                <label class="mb-3 block text-sm font-semibold text-gray-700 dark:text-gray-300"
                  >Refresh Token (可选)</label
                >
                <textarea
                  v-model="form.refreshToken"
                  class="form-input w-full resize-none font-mono text-xs dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
                  placeholder="请输入 Refresh Token..."
                  rows="4"
                />
              </div>
            </div>

            <!-- 代理设置 -->
            <ProxyConfig v-model="form.proxy" />

            <div class="flex gap-3 pt-4">
              <button
                class="flex-1 rounded-xl bg-gray-100 px-6 py-3 font-semibold text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                type="button"
                @click="$emit('close')"
              >
                取消
              </button>
              <button
                v-if="
                  (form.addType === 'oauth' || form.addType === 'setup-token') &&
                  form.platform !== 'claude-console' &&
                  form.platform !== 'bedrock' &&
                  form.platform !== 'azure_openai'
                "
                class="btn btn-primary flex-1 px-6 py-3 font-semibold"
                :disabled="loading"
                type="button"
                @click="nextStep"
              >
                下一步
              </button>
              <button
                v-else
                class="btn btn-primary flex-1 px-6 py-3 font-semibold"
                :disabled="loading"
                type="button"
                @click="createAccount"
              >
                <div v-if="loading" class="loading-spinner mr-2" />
                {{ loading ? '创建中...' : '创建' }}
              </button>
            </div>
          </div>
        </div>

        <!-- 步骤2: OAuth授权 -->
        <OAuthFlow
          v-if="oauthStep === 2 && form.addType === 'oauth'"
          :platform="form.platform"
          :proxy="form.proxy"
          @back="oauthStep = 1"
          @success="handleOAuthSuccess"
        />

        <!-- 步骤2: Setup Token授权 -->
        <div v-if="oauthStep === 2 && form.addType === 'setup-token'" class="space-y-6">
          <!-- Claude Setup Token流程 -->
          <div v-if="form.platform === 'claude'">
            <div
              class="rounded-lg border border-blue-200 bg-blue-50 p-6 dark:border-blue-700 dark:bg-blue-900/30"
            >
              <div class="flex items-start gap-4">
                <div
                  class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-blue-500"
                >
                  <i class="fas fa-key text-white" />
                </div>
                <div class="flex-1">
                  <h4 class="mb-3 font-semibold text-blue-900 dark:text-blue-200">
                    Claude Setup Token 授权
                  </h4>
                  <p class="mb-4 text-sm text-blue-800 dark:text-blue-300">
                    请按照以下步骤通过 Setup Token 完成 Claude 账户的授权：
                  </p>

                  <div class="space-y-4">
                    <!-- 步骤1: 生成授权链接 -->
                    <div
                      class="rounded-lg border border-blue-300 bg-white/80 p-4 dark:border-blue-600 dark:bg-gray-800/80"
                    >
                      <div class="flex items-start gap-3">
                        <div
                          class="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white"
                        >
                          1
                        </div>
                        <div class="flex-1">
                          <p class="mb-2 font-medium text-blue-900 dark:text-blue-200">
                            点击下方按钮生成授权链接
                          </p>
                          <button
                            v-if="!setupTokenAuthUrl"
                            class="btn btn-primary px-4 py-2 text-sm"
                            :disabled="setupTokenLoading"
                            @click="generateSetupTokenAuthUrl"
                          >
                            <i v-if="!setupTokenLoading" class="fas fa-link mr-2" />
                            <div v-else class="loading-spinner mr-2" />
                            {{ setupTokenLoading ? '生成中...' : '生成 Setup Token 授权链接' }}
                          </button>
                          <div v-else class="space-y-3">
                            <div class="flex items-center gap-2">
                              <input
                                class="form-input flex-1 bg-gray-50 font-mono text-xs dark:bg-gray-700"
                                readonly
                                type="text"
                                :value="setupTokenAuthUrl"
                              />
                              <button
                                class="rounded-lg bg-gray-100 px-3 py-2 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600"
                                title="复制链接"
                                @click="copySetupTokenAuthUrl"
                              >
                                <i
                                  :class="
                                    setupTokenCopied ? 'fas fa-check text-green-500' : 'fas fa-copy'
                                  "
                                />
                              </button>
                            </div>
                            <button
                              class="text-xs text-blue-600 hover:text-blue-700"
                              @click="regenerateSetupTokenAuthUrl"
                            >
                              <i class="fas fa-sync-alt mr-1" />重新生成
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    <!-- 步骤2: 访问链接并授权 -->
                    <div
                      class="rounded-lg border border-blue-300 bg-white/80 p-4 dark:border-blue-600 dark:bg-gray-800/80"
                    >
                      <div class="flex items-start gap-3">
                        <div
                          class="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white"
                        >
                          2
                        </div>
                        <div class="flex-1">
                          <p class="mb-2 font-medium text-blue-900 dark:text-blue-200">
                            在浏览器中打开链接并完成授权
                          </p>
                          <p class="mb-2 text-sm text-blue-700 dark:text-blue-300">
                            请在新标签页中打开授权链接，登录您的 Claude 账户并授权 Claude Code。
                          </p>
                          <div
                            class="rounded border border-yellow-300 bg-yellow-50 p-3 dark:border-yellow-700 dark:bg-yellow-900/30"
                          >
                            <p class="text-xs text-yellow-800 dark:text-yellow-300">
                              <i class="fas fa-exclamation-triangle mr-1" />
                              <strong>注意：</strong
                              >如果您设置了代理，请确保浏览器也使用相同的代理访问授权页面。
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <!-- 步骤3: 输入授权码 -->
                    <div
                      class="rounded-lg border border-blue-300 bg-white/80 p-4 dark:border-blue-600 dark:bg-gray-800/80"
                    >
                      <div class="flex items-start gap-3">
                        <div
                          class="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white"
                        >
                          3
                        </div>
                        <div class="flex-1">
                          <p class="mb-2 font-medium text-blue-900 dark:text-blue-200">
                            输入 Authorization Code
                          </p>
                          <p class="mb-3 text-sm text-blue-700 dark:text-blue-300">
                            授权完成后，从返回页面复制 Authorization Code，并粘贴到下方输入框：
                          </p>
                          <div class="space-y-3">
                            <div>
                              <label
                                class="mb-2 block text-sm font-semibold text-gray-700 dark:text-gray-300"
                              >
                                <i class="fas fa-key mr-2 text-blue-500" />Authorization Code
                              </label>
                              <textarea
                                v-model="setupTokenAuthCode"
                                class="form-input w-full resize-none font-mono text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
                                placeholder="粘贴从Claude Code授权页面获取的Authorization Code..."
                                rows="3"
                              />
                            </div>
                            <p class="mt-2 text-xs text-gray-500 dark:text-gray-400">
                              <i class="fas fa-info-circle mr-1" />
                              请粘贴从Claude Code授权页面复制的Authorization Code
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="flex gap-3 pt-4">
            <button
              class="flex-1 rounded-xl bg-gray-100 px-6 py-3 font-semibold text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
              type="button"
              @click="oauthStep = 1"
            >
              上一步
            </button>
            <button
              class="btn btn-primary flex-1 px-6 py-3 font-semibold"
              :disabled="!canExchangeSetupToken || setupTokenExchanging"
              type="button"
              @click="exchangeSetupTokenCode"
            >
              <div v-if="setupTokenExchanging" class="loading-spinner mr-2" />
              {{ setupTokenExchanging ? '验证中...' : '完成授权' }}
            </button>
          </div>
        </div>

        <!-- 编辑模式 -->
        <div v-if="isEdit" class="space-y-6">
          <!-- 基本信息 -->
          <div>
            <label class="mb-3 block text-sm font-semibold text-gray-700 dark:text-gray-300"
              >账户名称</label
            >
            <input
              v-model="form.name"
              class="form-input w-full dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
              placeholder="为账户设置一个易识别的名称"
              required
              type="text"
            />
          </div>

          <div>
            <label class="mb-3 block text-sm font-semibold text-gray-700 dark:text-gray-300"
              >描述 (可选)</label
            >
            <textarea
              v-model="form.description"
              class="form-input w-full resize-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
              placeholder="账户用途说明..."
              rows="3"
            />
          </div>

          <div>
            <label class="mb-3 block text-sm font-semibold text-gray-700 dark:text-gray-300"
              >账户类型</label
            >
            <div class="flex gap-4">
              <label class="flex cursor-pointer items-center">
                <input
                  v-model="form.accountType"
                  class="mr-2 text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700"
                  type="radio"
                  value="shared"
                />
                <span class="text-sm text-gray-700 dark:text-gray-300">共享账户</span>
              </label>
              <label class="flex cursor-pointer items-center">
                <input
                  v-model="form.accountType"
                  class="mr-2 text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700"
                  type="radio"
                  value="dedicated"
                />
                <span class="text-sm text-gray-700 dark:text-gray-300">专属账户</span>
              </label>
              <label class="flex cursor-pointer items-center">
                <input
                  v-model="form.accountType"
                  class="mr-2 text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700"
                  type="radio"
                  value="group"
                />
                <span class="text-sm text-gray-700 dark:text-gray-300">分组调度</span>
              </label>
            </div>
            <p class="mt-2 text-xs text-gray-500 dark:text-gray-400">
              共享账户：供所有API Key使用；专属账户：仅供特定API
              Key使用；分组调度：加入分组供分组内调度
            </p>
          </div>

          <!-- 分组选择器 -->
          <div v-if="form.accountType === 'group'">
            <label class="mb-3 block text-sm font-semibold text-gray-700 dark:text-gray-300"
              >选择分组 *</label
            >
            <div class="flex gap-2">
              <select
                v-model="form.groupId"
                class="form-input flex-1 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
                required
              >
                <option value="">请选择分组</option>
                <option v-for="group in filteredGroups" :key="group.id" :value="group.id">
                  {{ group.name }} ({{ group.memberCount || 0 }} 个成员)
                </option>
                <option value="__new__">+ 新建分组</option>
              </select>
              <button
                class="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                type="button"
                @click="refreshGroups"
              >
                <i class="fas fa-sync-alt" :class="{ 'animate-spin': loadingGroups }" />
              </button>
            </div>
          </div>

          <!-- Gemini 项目 ID 字段 -->
          <div v-if="form.platform === 'gemini'">
            <label class="mb-3 block text-sm font-semibold text-gray-700 dark:text-gray-300"
              >项目 ID (可选)</label
            >
            <input
              v-model="form.projectId"
              class="form-input w-full dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
              placeholder="例如：verdant-wares-464411-k9"
              type="text"
            />
            <p class="mt-2 text-xs text-gray-500 dark:text-gray-400">
              Google Cloud/Workspace 账号可能需要提供项目 ID
            </p>
          </div>

          <!-- Claude 订阅类型选择（编辑模式） -->
          <div v-if="form.platform === 'claude'">
            <label class="mb-3 block text-sm font-semibold text-gray-700 dark:text-gray-300"
              >订阅类型</label
            >
            <div class="flex gap-4">
              <label class="flex cursor-pointer items-center">
                <input
                  v-model="form.subscriptionType"
                  class="mr-2 text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700"
                  type="radio"
                  value="claude_max"
                />
                <span class="text-sm text-gray-700 dark:text-gray-300">Claude Max</span>
              </label>
              <label class="flex cursor-pointer items-center">
                <input
                  v-model="form.subscriptionType"
                  class="mr-2 text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700"
                  type="radio"
                  value="claude_pro"
                />
                <span class="text-sm text-gray-700 dark:text-gray-300">Claude Pro</span>
              </label>
            </div>
            <p class="mt-2 text-xs text-gray-500 dark:text-gray-400">
              <i class="fas fa-info-circle mr-1" />
              Pro 账号不支持 Claude Opus 4 模型
            </p>
          </div>

          <!-- 所有平台的优先级设置（编辑模式） -->
          <div>
            <label class="mb-3 block text-sm font-semibold text-gray-700 dark:text-gray-300"
              >调度优先级 (1-100)</label
            >
            <input
              v-model.number="form.priority"
              class="form-input w-full dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
              max="100"
              min="1"
              placeholder="数字越小优先级越高"
              type="number"
            />
            <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
              数字越小优先级越高，建议范围：1-100
            </p>
          </div>

          <!-- Claude Console 特定字段（编辑模式）-->
          <div v-if="form.platform === 'claude-console'" class="space-y-4">
            <div>
              <label class="mb-3 block text-sm font-semibold text-gray-700">API URL</label>
              <input
                v-model="form.apiUrl"
                class="form-input w-full"
                placeholder="例如：https://api.example.com"
                required
                type="text"
              />
            </div>

            <div>
              <label class="mb-3 block text-sm font-semibold text-gray-700">API Key</label>
              <input
                v-model="form.apiKey"
                class="form-input w-full"
                placeholder="留空表示不更新"
                type="password"
              />
              <p class="mt-1 text-xs text-gray-500">留空表示不更新 API Key</p>
            </div>

            <div>
              <label class="mb-3 block text-sm font-semibold text-gray-700"
                >模型映射表 (可选)</label
              >
              <div class="mb-3 rounded-lg bg-blue-50 p-3">
                <p class="text-xs text-blue-700">
                  <i class="fas fa-info-circle mr-1" />
                  留空表示支持所有模型且不修改请求。配置映射后，左侧模型会被识别为支持的模型，右侧是实际发送的模型。
                </p>
              </div>

              <!-- 模型映射表 -->
              <div class="mb-3 space-y-2">
                <div
                  v-for="(mapping, index) in modelMappings"
                  :key="index"
                  class="flex items-center gap-2"
                >
                  <input
                    v-model="mapping.from"
                    class="form-input flex-1"
                    placeholder="原始模型名称"
                    type="text"
                  />
                  <i class="fas fa-arrow-right text-gray-400" />
                  <input
                    v-model="mapping.to"
                    class="form-input flex-1"
                    placeholder="映射后的模型名称"
                    type="text"
                  />
                  <button
                    class="rounded-lg p-2 text-red-500 transition-colors hover:bg-red-50"
                    type="button"
                    @click="removeModelMapping(index)"
                  >
                    <i class="fas fa-trash" />
                  </button>
                </div>
              </div>

              <!-- 添加映射按钮 -->
              <button
                class="w-full rounded-lg border-2 border-dashed border-gray-300 px-4 py-2 text-gray-600 transition-colors hover:border-gray-400 hover:text-gray-700"
                type="button"
                @click="addModelMapping"
              >
                <i class="fas fa-plus mr-2" />
                添加模型映射
              </button>

              <!-- 快捷添加按钮 -->
              <div class="mt-3 flex flex-wrap gap-2">
                <button
                  class="rounded-lg bg-blue-100 px-3 py-1 text-xs text-blue-700 transition-colors hover:bg-blue-200"
                  type="button"
                  @click="addPresetMapping('claude-sonnet-4-20250514', 'claude-sonnet-4-20250514')"
                >
                  + Sonnet 4
                </button>
                <button
                  class="rounded-lg bg-purple-100 px-3 py-1 text-xs text-purple-700 transition-colors hover:bg-purple-200"
                  type="button"
                  @click="addPresetMapping('claude-opus-4-1-20250805', 'claude-opus-4-1-20250805')"
                >
                  + Opus 4.1
                </button>
                <button
                  class="rounded-lg bg-green-100 px-3 py-1 text-xs text-green-700 transition-colors hover:bg-green-200"
                  type="button"
                  @click="
                    addPresetMapping('claude-3-5-haiku-20241022', 'claude-3-5-haiku-20241022')
                  "
                >
                  + Haiku 3.5
                </button>
                <button
                  class="rounded-lg bg-orange-100 px-3 py-1 text-xs text-orange-700 transition-colors hover:bg-orange-200"
                  type="button"
                  @click="addPresetMapping('claude-opus-4-1-20250805', 'claude-sonnet-4-20250514')"
                >
                  + Opus 4.1 → Sonnet 4
                </button>
              </div>
              <p class="mt-1 text-xs text-gray-500">
                留空表示支持所有模型。如果指定模型，请求中的模型不在列表内将不会调度到此账号
              </p>
            </div>

            <div>
              <label class="mb-3 block text-sm font-semibold text-gray-700"
                >自定义 User-Agent (可选)</label
              >
              <input
                v-model="form.userAgent"
                class="form-input w-full"
                placeholder="留空则透传客户端 User-Agent"
                type="text"
              />
              <p class="mt-1 text-xs text-gray-500">
                留空时将自动使用客户端的 User-Agent，仅在需要固定特定 UA 时填写
              </p>
            </div>

            <div>
              <label class="mb-3 block text-sm font-semibold text-gray-700">限流机制</label>
              <div class="mb-3">
                <label class="inline-flex cursor-pointer items-center">
                  <input
                    v-model="form.enableRateLimit"
                    class="mr-2 rounded border-gray-300 text-blue-600 focus:border-blue-500 focus:ring focus:ring-blue-200"
                    type="checkbox"
                  />
                  <span class="text-sm text-gray-700">启用限流机制</span>
                </label>
                <p class="mt-1 text-xs text-gray-500">
                  启用后，当账号返回429错误时将暂停调度一段时间
                </p>
              </div>

              <div v-if="form.enableRateLimit">
                <label class="mb-3 block text-sm font-semibold text-gray-700"
                  >限流时间 (分钟)</label
                >
                <input
                  v-model.number="form.rateLimitDuration"
                  class="form-input w-full"
                  min="1"
                  type="number"
                />
                <p class="mt-1 text-xs text-gray-500">账号被限流后暂停调度的时间（分钟）</p>
              </div>
            </div>
          </div>

          <!-- Bedrock 特定字段（编辑模式）-->
          <div v-if="form.platform === 'bedrock'" class="space-y-4">
            <div>
              <label class="mb-3 block text-sm font-semibold text-gray-700">AWS 访问密钥 ID</label>
              <input
                v-model="form.accessKeyId"
                class="form-input w-full"
                placeholder="留空表示不更新"
                type="text"
              />
              <p class="mt-1 text-xs text-gray-500">留空表示不更新 AWS Access Key ID</p>
            </div>

            <div>
              <label class="mb-3 block text-sm font-semibold text-gray-700">AWS 秘密访问密钥</label>
              <input
                v-model="form.secretAccessKey"
                class="form-input w-full"
                placeholder="留空表示不更新"
                type="password"
              />
              <p class="mt-1 text-xs text-gray-500">留空表示不更新 AWS Secret Access Key</p>
            </div>

            <div>
              <label class="mb-3 block text-sm font-semibold text-gray-700">AWS 区域</label>
              <input
                v-model="form.region"
                class="form-input w-full"
                placeholder="例如：us-east-1"
                type="text"
              />
              <div class="mt-2 rounded-lg border border-blue-200 bg-blue-50 p-3">
                <div class="flex items-start gap-2">
                  <i class="fas fa-info-circle mt-0.5 text-blue-600" />
                  <div class="text-xs text-blue-700">
                    <p class="mb-1 font-medium">常用 AWS 区域参考：</p>
                    <div class="grid grid-cols-2 gap-1 text-xs">
                      <span>• us-east-1 (美国东部)</span>
                      <span>• us-west-2 (美国西部)</span>
                      <span>• eu-west-1 (欧洲爱尔兰)</span>
                      <span>• ap-southeast-1 (新加坡)</span>
                      <span>• ap-northeast-1 (东京)</span>
                      <span>• eu-central-1 (法兰克福)</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <label class="mb-3 block text-sm font-semibold text-gray-700">会话令牌 (可选)</label>
              <input
                v-model="form.sessionToken"
                class="form-input w-full"
                placeholder="留空表示不更新"
                type="password"
              />
            </div>

            <div>
              <label class="mb-3 block text-sm font-semibold text-gray-700"
                >默认主模型 (可选)</label
              >
              <input
                v-model="form.defaultModel"
                class="form-input w-full"
                placeholder="例如：us.anthropic.claude-sonnet-4-20250514-v1:0"
                type="text"
              />
              <p class="mt-1 text-xs text-gray-500">
                留空将使用系统默认模型。支持 inference profile ID 或 ARN
              </p>
            </div>

            <div>
              <label class="mb-3 block text-sm font-semibold text-gray-700 dark:text-gray-300"
                >小快速模型 (可选)</label
              >
              <input
                v-model="form.smallFastModel"
                class="form-input w-full"
                placeholder="例如：us.anthropic.claude-3-5-haiku-20241022-v1:0"
                type="text"
              />
              <p class="mt-1 text-xs text-gray-500">用于快速响应的轻量级模型，留空将使用系统默认</p>
            </div>

            <div>
              <label class="mb-3 block text-sm font-semibold text-gray-700">限流机制</label>
              <div class="mb-3">
                <label class="inline-flex cursor-pointer items-center">
                  <input
                    v-model="form.enableRateLimit"
                    class="mr-2 rounded border-gray-300 text-blue-600 focus:border-blue-500 focus:ring focus:ring-blue-200"
                    type="checkbox"
                  />
                  <span class="text-sm text-gray-700">启用限流机制</span>
                </label>
                <p class="mt-1 text-xs text-gray-500">
                  启用后，当账号返回429错误时将暂停调度一段时间
                </p>
              </div>

              <div v-if="form.enableRateLimit">
                <label class="mb-3 block text-sm font-semibold text-gray-700"
                  >限流时间 (分钟)</label
                >
                <input
                  v-model.number="form.rateLimitDuration"
                  class="form-input w-full"
                  min="1"
                  type="number"
                />
                <p class="mt-1 text-xs text-gray-500">账号被限流后暂停调度的时间（分钟）</p>
              </div>
            </div>
          </div>

          <!-- Token 更新 -->
          <div
            v-if="form.platform !== 'claude-console' && form.platform !== 'bedrock'"
            class="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-900/30"
          >
            <div class="mb-4 flex items-start gap-3">
              <div
                class="mt-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-amber-500"
              >
                <i class="fas fa-key text-sm text-white" />
              </div>
              <div>
                <h5 class="mb-2 font-semibold text-amber-900 dark:text-amber-300">更新 Token</h5>
                <p class="mb-2 text-sm text-amber-800 dark:text-amber-300">
                  可以更新 Access Token 和 Refresh Token。为了安全起见，不会显示当前的 Token 值。
                </p>
                <p class="text-xs text-amber-600 dark:text-amber-400">💡 留空表示不更新该字段。</p>
              </div>
            </div>

            <div class="space-y-4">
              <div>
                <label class="mb-3 block text-sm font-semibold text-gray-700 dark:text-gray-300"
                  >新的 Access Token</label
                >
                <textarea
                  v-model="form.accessToken"
                  class="form-input w-full resize-none font-mono text-xs dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
                  placeholder="留空表示不更新..."
                  rows="4"
                />
              </div>

              <div>
                <label class="mb-3 block text-sm font-semibold text-gray-700 dark:text-gray-300"
                  >新的 Refresh Token</label
                >
                <textarea
                  v-model="form.refreshToken"
                  class="form-input w-full resize-none font-mono text-xs dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
                  placeholder="留空表示不更新..."
                  rows="4"
                />
              </div>
            </div>
          </div>

          <!-- 代理设置 -->
          <ProxyConfig v-model="form.proxy" />

          <div class="flex gap-3 pt-4">
            <button
              class="flex-1 rounded-xl bg-gray-100 px-6 py-3 font-semibold text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
              type="button"
              @click="$emit('close')"
            >
              取消
            </button>
            <button
              class="btn btn-primary flex-1 px-6 py-3 font-semibold"
              :disabled="loading"
              type="button"
              @click="updateAccount"
            >
              <div v-if="loading" class="loading-spinner mr-2" />
              {{ loading ? '更新中...' : '更新' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 确认弹窗 -->
    <ConfirmModal
      :cancel-text="confirmOptions.cancelText"
      :confirm-text="confirmOptions.confirmText"
      :message="confirmOptions.message"
      :show="showConfirmModal"
      :title="confirmOptions.title"
      @cancel="handleCancel"
      @confirm="handleConfirm"
    />

    <!-- 分组管理模态框 -->
    <GroupManagementModal
      v-if="showGroupManagement"
      @close="showGroupManagement = false"
      @refresh="handleGroupRefresh"
    />
  </Teleport>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { showToast } from '@/utils/toast'
import { apiClient } from '@/config/api'
import { useAccountsStore } from '@/stores/accounts'
import { useConfirm } from '@/composables/useConfirm'
import ProxyConfig from './ProxyConfig.vue'
import OAuthFlow from './OAuthFlow.vue'
import ConfirmModal from '@/components/common/ConfirmModal.vue'
import GroupManagementModal from './GroupManagementModal.vue'

const props = defineProps({
  account: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['close', 'success'])

const accountsStore = useAccountsStore()
const { showConfirmModal, confirmOptions, showConfirm, handleConfirm, handleCancel } = useConfirm()

// 是否为编辑模式
const isEdit = computed(() => !!props.account)
const show = ref(true)

// OAuth步骤
const oauthStep = ref(1)
const loading = ref(false)

// Setup Token 相关状态
const setupTokenLoading = ref(false)
const setupTokenExchanging = ref(false)
const setupTokenAuthUrl = ref('')
const setupTokenAuthCode = ref('')
const setupTokenCopied = ref(false)
const setupTokenSessionId = ref('')

// 初始化代理配置
const initProxyConfig = () => {
  if (props.account?.proxy && props.account.proxy.host && props.account.proxy.port) {
    return {
      enabled: true,
      type: props.account.proxy.type || 'socks5',
      host: props.account.proxy.host,
      port: props.account.proxy.port,
      username: props.account.proxy.username || '',
      password: props.account.proxy.password || ''
    }
  }
  return {
    enabled: false,
    type: 'socks5',
    host: '',
    port: '',
    username: '',
    password: ''
  }
}

// 表单数据
const form = ref({
  platform: props.account?.platform || 'claude',
  addType: (() => {
    const platform = props.account?.platform || 'claude'
    if (platform === 'gemini' || platform === 'openai') return 'oauth'
    if (platform === 'claude') return 'setup-token'
    return 'manual'
  })(),
  name: props.account?.name || '',
  description: props.account?.description || '',
  accountType: props.account?.accountType || 'shared',
  subscriptionType: 'claude_max', // 默认为 Claude Max，兼容旧数据
  groupId: '',
  projectId: props.account?.projectId || '',
  idToken: '',
  accessToken: '',
  refreshToken: '',
  proxy: initProxyConfig(),
  // Claude Console 特定字段
  apiUrl: props.account?.apiUrl || '',
  apiKey: props.account?.apiKey || '',
  priority: props.account?.priority || 50,
  supportedModels: (() => {
    const models = props.account?.supportedModels
    if (!models) return ''
    // 处理对象格式（Claude Console 的新格式）
    if (typeof models === 'object' && !Array.isArray(models)) {
      return Object.keys(models).join('\n')
    }
    // 处理数组格式（向后兼容）
    if (Array.isArray(models)) {
      return models.join('\n')
    }
    return ''
  })(),
  userAgent: props.account?.userAgent || '',
  enableRateLimit: props.account ? props.account.rateLimitDuration > 0 : true,
  rateLimitDuration: props.account?.rateLimitDuration || 60,
  // Bedrock 特定字段
  accessKeyId: props.account?.accessKeyId || '',
  secretAccessKey: props.account?.secretAccessKey || '',
  region: props.account?.region || '',
  sessionToken: props.account?.sessionToken || '',
  defaultModel: props.account?.defaultModel || '',
  smallFastModel: props.account?.smallFastModel || ''
})

// 模型映射表数据
const modelMappings = ref([])

// 初始化模型映射表
const initModelMappings = () => {
  if (props.account?.supportedModels) {
    // 如果是对象格式（新的映射表）
    if (
      typeof props.account.supportedModels === 'object' &&
      !Array.isArray(props.account.supportedModels)
    ) {
      modelMappings.value = Object.entries(props.account.supportedModels).map(([from, to]) => ({
        from,
        to
      }))
    } else if (Array.isArray(props.account.supportedModels)) {
      // 如果是数组格式（旧格式），转换为映射表
      modelMappings.value = props.account.supportedModels.map((model) => ({
        from: model,
        to: model
      }))
    }
  }
}

// 表单验证错误
const errors = ref({
  name: '',
  idToken: '',
  accessToken: '',
  apiUrl: '',
  apiKey: '',
  accessKeyId: '',
  secretAccessKey: '',
  region: ''
})

// 计算是否可以进入下一步
const canProceed = computed(() => {
  return form.value.name?.trim() && form.value.platform
})

// 计算是否可以交换Setup Token code
const canExchangeSetupToken = computed(() => {
  return setupTokenAuthUrl.value && setupTokenAuthCode.value.trim()
})

// // 计算是否可以创建
// const canCreate = computed(() => {
//   if (form.value.addType === 'manual') {
//     return form.value.name?.trim() && form.value.accessToken?.trim()
//   }
//   return form.value.name?.trim()
// })

// 下一步
const nextStep = async () => {
  // 清除之前的错误
  errors.value.name = ''

  if (!canProceed.value) {
    if (!form.value.name || form.value.name.trim() === '') {
      errors.value.name = '请填写账户名称'
    }
    return
  }

  // 分组类型验证
  if (
    form.value.accountType === 'group' &&
    (!form.value.groupId || form.value.groupId.trim() === '')
  ) {
    showToast('请选择一个分组', 'error')
    return
  }

  // 对于Gemini账户，检查项目 ID
  if (form.value.platform === 'gemini' && oauthStep.value === 1 && form.value.addType === 'oauth') {
    if (!form.value.projectId || form.value.projectId.trim() === '') {
      // 使用自定义确认弹窗
      const confirmed = await showConfirm(
        '项目 ID 未填写',
        '您尚未填写项目 ID。\n\n如果您的Google账号绑定了Google Cloud或被识别为Workspace账号，需要提供项目 ID。\n如果您使用的是普通个人账号，可以继续不填写。',
        '继续',
        '返回填写'
      )
      if (!confirmed) {
        return
      }
    }
  }

  oauthStep.value = 2
}

// Setup Token 相关方法
// 生成Setup Token授权URL
const generateSetupTokenAuthUrl = async () => {
  setupTokenLoading.value = true
  try {
    const proxyConfig = form.value.proxy?.enabled
      ? {
          proxy: {
            type: form.value.proxy.type,
            host: form.value.proxy.host,
            port: parseInt(form.value.proxy.port),
            username: form.value.proxy.username || null,
            password: form.value.proxy.password || null
          }
        }
      : {}

    const result = await accountsStore.generateClaudeSetupTokenUrl(proxyConfig)
    setupTokenAuthUrl.value = result.authUrl
    setupTokenSessionId.value = result.sessionId
  } catch (error) {
    showToast(error.message || '生成Setup Token授权链接失败', 'error')
  } finally {
    setupTokenLoading.value = false
  }
}

// 重新生成Setup Token授权URL
const regenerateSetupTokenAuthUrl = () => {
  setupTokenAuthUrl.value = ''
  setupTokenAuthCode.value = ''
  generateSetupTokenAuthUrl()
}

// 复制Setup Token授权URL
const copySetupTokenAuthUrl = async () => {
  try {
    await navigator.clipboard.writeText(setupTokenAuthUrl.value)
    setupTokenCopied.value = true
    showToast('链接已复制', 'success')
    setTimeout(() => {
      setupTokenCopied.value = false
    }, 2000)
  } catch (error) {
    // 降级方案 - 使用 textarea 替代 input，禁用 ESLint 警告
    const textarea = document.createElement('textarea')
    textarea.value = setupTokenAuthUrl.value
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()

    try {
      // eslint-disable-next-line
      const successful = document.execCommand('copy')
      if (successful) {
        setupTokenCopied.value = true
        showToast('链接已复制', 'success')
      } else {
        showToast('复制失败，请手动复制', 'error')
      }
    } catch (err) {
      showToast('复制失败，请手动复制', 'error')
    }

    document.body.removeChild(textarea)
    setTimeout(() => {
      setupTokenCopied.value = false
    }, 2000)
  }
}

// 交换Setup Token授权码
const exchangeSetupTokenCode = async () => {
  if (!canExchangeSetupToken.value) return

  setupTokenExchanging.value = true
  try {
    const data = {
      sessionId: setupTokenSessionId.value,
      callbackUrl: setupTokenAuthCode.value.trim()
    }

    // 添加代理配置（如果启用）
    if (form.value.proxy?.enabled) {
      data.proxy = {
        type: form.value.proxy.type,
        host: form.value.proxy.host,
        port: parseInt(form.value.proxy.port),
        username: form.value.proxy.username || null,
        password: form.value.proxy.password || null
      }
    }

    const tokenInfo = await accountsStore.exchangeClaudeSetupTokenCode(data)

    // 调用相同的成功处理函数
    await handleOAuthSuccess(tokenInfo)
  } catch (error) {
    showToast(error.message || 'Setup Token授权失败，请检查授权码是否正确', 'error')
  } finally {
    setupTokenExchanging.value = false
  }
}

// 处理OAuth成功
const handleOAuthSuccess = async (tokenInfo) => {
  loading.value = true
  try {
    const data = {
      name: form.value.name,
      description: form.value.description,
      accountType: form.value.accountType,
      groupId: form.value.accountType === 'group' ? form.value.groupId : undefined,
      proxy: form.value.proxy.enabled
        ? {
            type: form.value.proxy.type,
            host: form.value.proxy.host,
            port: parseInt(form.value.proxy.port),
            username: form.value.proxy.username || null,
            password: form.value.proxy.password || null
          }
        : null
    }

    if (form.value.platform === 'claude') {
      // Claude使用claudeAiOauth字段
      data.claudeAiOauth = tokenInfo.claudeAiOauth || tokenInfo
      data.priority = form.value.priority || 50
      // 添加订阅类型信息
      data.subscriptionInfo = {
        accountType: form.value.subscriptionType || 'claude_max',
        hasClaudeMax: form.value.subscriptionType === 'claude_max',
        hasClaudePro: form.value.subscriptionType === 'claude_pro',
        manuallySet: true // 标记为手动设置
      }
    } else if (form.value.platform === 'gemini') {
      // Gemini使用geminiOauth字段
      data.geminiOauth = tokenInfo.tokens || tokenInfo
      if (form.value.projectId) {
        data.projectId = form.value.projectId
      }
      // 添加 Gemini 优先级
      data.priority = form.value.priority || 50
    } else if (form.value.platform === 'openai') {
      data.openaiOauth = tokenInfo.tokens || tokenInfo
      data.accountInfo = tokenInfo.accountInfo
      data.priority = form.value.priority || 50
    }

    let result
    if (form.value.platform === 'claude') {
      result = await accountsStore.createClaudeAccount(data)
    } else if (form.value.platform === 'openai') {
      result = await accountsStore.createOpenAIAccount(data)
    } else {
      result = await accountsStore.createGeminiAccount(data)
    }

    emit('success', result)
  } catch (error) {
    showToast(error.message || '账户创建失败', 'error')
  } finally {
    loading.value = false
  }
}

// 创建账户（手动模式）
const createAccount = async () => {
  // 清除之前的错误
  errors.value.name = ''
  errors.value.accessToken = ''
  errors.value.apiUrl = ''
  errors.value.apiKey = ''

  let hasError = false

  if (!form.value.name || form.value.name.trim() === '') {
    errors.value.name = '请填写账户名称'
    hasError = true
  }

  // Claude Console 验证
  if (form.value.platform === 'claude-console') {
    if (!form.value.apiUrl || form.value.apiUrl.trim() === '') {
      errors.value.apiUrl = '请填写 API URL'
      hasError = true
    }
    if (!form.value.apiKey || form.value.apiKey.trim() === '') {
      errors.value.apiKey = '请填写 API Key'
      hasError = true
    }
  } else if (form.value.platform === 'bedrock') {
    // Bedrock 验证
    if (!form.value.accessKeyId || form.value.accessKeyId.trim() === '') {
      errors.value.accessKeyId = '请填写 AWS 访问密钥 ID'
      hasError = true
    }
    if (!form.value.secretAccessKey || form.value.secretAccessKey.trim() === '') {
      errors.value.secretAccessKey = '请填写 AWS 秘密访问密钥'
      hasError = true
    }
    if (!form.value.region || form.value.region.trim() === '') {
      errors.value.region = '请选择 AWS 区域'
      hasError = true
    }
  } else if (form.value.addType === 'manual') {
    // 手动模式验证
    if (!form.value.accessToken || form.value.accessToken.trim() === '') {
      errors.value.accessToken = '请填写 Access Token'
      hasError = true
    }
    // OpenAI 平台需要验证 ID Token
    if (
      form.value.platform === 'openai' &&
      (!form.value.idToken || form.value.idToken.trim() === '')
    ) {
      errors.value.idToken = '请填写 ID Token'
      hasError = true
    }
  }

  // 分组类型验证
  if (
    form.value.accountType === 'group' &&
    (!form.value.groupId || form.value.groupId.trim() === '')
  ) {
    showToast('请选择一个分组', 'error')
    hasError = true
  }

  if (hasError) {
    return
  }

  loading.value = true
  try {
    const data = {
      name: form.value.name,
      description: form.value.description,
      accountType: form.value.accountType,
      groupId: form.value.accountType === 'group' ? form.value.groupId : undefined,
      proxy: form.value.proxy.enabled
        ? {
            type: form.value.proxy.type,
            host: form.value.proxy.host,
            port: parseInt(form.value.proxy.port),
            username: form.value.proxy.username || null,
            password: form.value.proxy.password || null
          }
        : null
    }

    if (form.value.platform === 'claude') {
      // Claude手动模式需要构建claudeAiOauth对象
      const expiresInMs = form.value.refreshToken
        ? 10 * 60 * 1000 // 10分钟
        : 365 * 24 * 60 * 60 * 1000 // 1年

      data.claudeAiOauth = {
        accessToken: form.value.accessToken,
        refreshToken: form.value.refreshToken || '',
        expiresAt: Date.now() + expiresInMs,
        scopes: [] // 手动添加没有 scopes
      }
      data.priority = form.value.priority || 50
      // 添加订阅类型信息
      data.subscriptionInfo = {
        accountType: form.value.subscriptionType || 'claude_max',
        hasClaudeMax: form.value.subscriptionType === 'claude_max',
        hasClaudePro: form.value.subscriptionType === 'claude_pro',
        manuallySet: true // 标记为手动设置
      }
    } else if (form.value.platform === 'gemini') {
      // Gemini手动模式需要构建geminiOauth对象
      const expiresInMs = form.value.refreshToken
        ? 10 * 60 * 1000 // 10分钟
        : 365 * 24 * 60 * 60 * 1000 // 1年

      data.geminiOauth = {
        access_token: form.value.accessToken,
        refresh_token: form.value.refreshToken || '',
        scope: 'https://www.googleapis.com/auth/cloud-platform',
        token_type: 'Bearer',
        expiry_date: Date.now() + expiresInMs
      }

      if (form.value.projectId) {
        data.projectId = form.value.projectId
      }

      // 添加 Gemini 优先级
      data.priority = form.value.priority || 50
    } else if (form.value.platform === 'openai') {
      // OpenAI手动模式需要构建openaiOauth对象
      const expiresInMs = form.value.refreshToken
        ? 10 * 60 * 1000 // 10分钟
        : 365 * 24 * 60 * 60 * 1000 // 1年

      data.openaiOauth = {
        idToken: form.value.idToken, // 使用用户输入的 ID Token
        accessToken: form.value.accessToken,
        refreshToken: form.value.refreshToken || '',
        expires_in: Math.floor(expiresInMs / 1000) // 转换为秒
      }

      // 手动模式下，尝试从 ID Token 解析用户信息
      let accountInfo = {
        accountId: '',
        chatgptUserId: '',
        organizationId: '',
        organizationRole: '',
        organizationTitle: '',
        planType: '',
        email: '',
        emailVerified: false
      }

      // 尝试解析 ID Token (JWT)
      if (form.value.idToken) {
        try {
          const idTokenParts = form.value.idToken.split('.')
          if (idTokenParts.length === 3) {
            const payload = JSON.parse(atob(idTokenParts[1]))
            const authClaims = payload['https://api.openai.com/auth'] || {}

            accountInfo = {
              accountId: authClaims.accountId || '',
              chatgptUserId: authClaims.chatgptUserId || '',
              organizationId: authClaims.organizationId || '',
              organizationRole: authClaims.organizationRole || '',
              organizationTitle: authClaims.organizationTitle || '',
              planType: authClaims.planType || '',
              email: payload.email || '',
              emailVerified: payload.email_verified || false
            }
          }
        } catch (e) {
          console.warn('Failed to parse ID Token:', e)
        }
      }

      data.accountInfo = accountInfo
      data.priority = form.value.priority || 50
    } else if (form.value.platform === 'claude-console') {
      // Claude Console 账户特定数据
      data.apiUrl = form.value.apiUrl
      data.apiKey = form.value.apiKey
      data.priority = form.value.priority || 50
      data.supportedModels = convertMappingsToObject() || {}
      data.userAgent = form.value.userAgent || null
      // 如果不启用限流，传递 0 表示不限流
      data.rateLimitDuration = form.value.enableRateLimit ? form.value.rateLimitDuration || 60 : 0
    } else if (form.value.platform === 'bedrock') {
      // Bedrock 账户特定数据 - 构造 awsCredentials 对象
      data.awsCredentials = {
        accessKeyId: form.value.accessKeyId,
        secretAccessKey: form.value.secretAccessKey,
        sessionToken: form.value.sessionToken || null
      }
      data.region = form.value.region
      data.defaultModel = form.value.defaultModel || null
      data.smallFastModel = form.value.smallFastModel || null
      data.priority = form.value.priority || 50
      // 如果不启用限流，传递 0 表示不限流
      data.rateLimitDuration = form.value.enableRateLimit ? form.value.rateLimitDuration || 60 : 0
    }

    let result
    if (form.value.platform === 'claude') {
      result = await accountsStore.createClaudeAccount(data)
    } else if (form.value.platform === 'claude-console') {
      result = await accountsStore.createClaudeConsoleAccount(data)
    } else if (form.value.platform === 'bedrock') {
      result = await accountsStore.createBedrockAccount(data)
    } else if (form.value.platform === 'openai') {
      result = await accountsStore.createOpenAIAccount(data)
    } else {
      result = await accountsStore.createGeminiAccount(data)
    }

    emit('success', result)
  } catch (error) {
    showToast(error.message || '账户创建失败', 'error')
  } finally {
    loading.value = false
  }
}

// 更新账户
const updateAccount = async () => {
  // 清除之前的错误
  errors.value.name = ''

  // 验证账户名称
  if (!form.value.name || form.value.name.trim() === '') {
    errors.value.name = '请填写账户名称'
    return
  }

  // 分组类型验证
  if (
    form.value.accountType === 'group' &&
    (!form.value.groupId || form.value.groupId.trim() === '')
  ) {
    showToast('请选择一个分组', 'error')
    return
  }

  // 对于Gemini账户，检查项目 ID
  if (form.value.platform === 'gemini') {
    if (!form.value.projectId || form.value.projectId.trim() === '') {
      // 使用自定义确认弹窗
      const confirmed = await showConfirm(
        '项目 ID 未填写',
        '您尚未填写项目 ID。\n\n如果您的Google账号绑定了Google Cloud或被识别为Workspace账号，需要提供项目 ID。\n如果您使用的是普通个人账号，可以继续不填写。',
        '继续保存',
        '返回填写'
      )
      if (!confirmed) {
        return
      }
    }
  }

  loading.value = true
  try {
    const data = {
      name: form.value.name,
      description: form.value.description,
      accountType: form.value.accountType,
      groupId: form.value.accountType === 'group' ? form.value.groupId : undefined,
      proxy: form.value.proxy.enabled
        ? {
            type: form.value.proxy.type,
            host: form.value.proxy.host,
            port: parseInt(form.value.proxy.port),
            username: form.value.proxy.username || null,
            password: form.value.proxy.password || null
          }
        : null
    }

    // 只有非空时才更新token
    if (form.value.accessToken || form.value.refreshToken) {
      if (props.account.platform === 'claude') {
        // Claude需要构建claudeAiOauth对象
        const expiresInMs = form.value.refreshToken
          ? 10 * 60 * 1000 // 10分钟
          : 365 * 24 * 60 * 60 * 1000 // 1年

        data.claudeAiOauth = {
          accessToken: form.value.accessToken || '',
          refreshToken: form.value.refreshToken || '',
          expiresAt: Date.now() + expiresInMs,
          scopes: props.account.scopes || [] // 保持原有的 scopes，如果没有则为空数组
        }
      } else if (props.account.platform === 'gemini') {
        // Gemini需要构建geminiOauth对象
        const expiresInMs = form.value.refreshToken
          ? 10 * 60 * 1000 // 10分钟
          : 365 * 24 * 60 * 60 * 1000 // 1年

        data.geminiOauth = {
          access_token: form.value.accessToken || '',
          refresh_token: form.value.refreshToken || '',
          scope: 'https://www.googleapis.com/auth/cloud-platform',
          token_type: 'Bearer',
          expiry_date: Date.now() + expiresInMs
        }
      } else if (props.account.platform === 'openai') {
        // OpenAI需要构建openaiOauth对象
        const expiresInMs = form.value.refreshToken
          ? 10 * 60 * 1000 // 10分钟
          : 365 * 24 * 60 * 60 * 1000 // 1年

        data.openaiOauth = {
          idToken: form.value.idToken || '', // 更新时使用用户输入的 ID Token
          accessToken: form.value.accessToken || '',
          refreshToken: form.value.refreshToken || '',
          expires_in: Math.floor(expiresInMs / 1000) // 转换为秒
        }
      }
    }

    if (props.account.platform === 'gemini') {
      data.projectId = form.value.projectId || ''
    }

    // Claude 官方账号优先级和订阅类型更新
    if (props.account.platform === 'claude') {
      data.priority = form.value.priority || 50
      // 更新订阅类型信息
      data.subscriptionInfo = {
        accountType: form.value.subscriptionType || 'claude_max',
        hasClaudeMax: form.value.subscriptionType === 'claude_max',
        hasClaudePro: form.value.subscriptionType === 'claude_pro',
        manuallySet: true // 标记为手动设置
      }
    }

    // OpenAI 账号优先级更新
    if (props.account.platform === 'openai') {
      data.priority = form.value.priority || 50
    }

    // Gemini 账号优先级更新
    if (props.account.platform === 'gemini') {
      data.priority = form.value.priority || 50
    }

    // Claude Console 特定更新
    if (props.account.platform === 'claude-console') {
      data.apiUrl = form.value.apiUrl
      if (form.value.apiKey) {
        data.apiKey = form.value.apiKey
      }
      data.priority = form.value.priority || 50
      data.supportedModels = convertMappingsToObject() || {}
      data.userAgent = form.value.userAgent || null
      // 如果不启用限流，传递 0 表示不限流
      data.rateLimitDuration = form.value.enableRateLimit ? form.value.rateLimitDuration || 60 : 0
    }

    // Bedrock 特定更新
    if (props.account.platform === 'bedrock') {
      // 只有当有凭证变更时才构造 awsCredentials 对象
      if (form.value.accessKeyId || form.value.secretAccessKey || form.value.sessionToken) {
        data.awsCredentials = {}
        if (form.value.accessKeyId) {
          data.awsCredentials.accessKeyId = form.value.accessKeyId
        }
        if (form.value.secretAccessKey) {
          data.awsCredentials.secretAccessKey = form.value.secretAccessKey
        }
        if (form.value.sessionToken !== undefined) {
          data.awsCredentials.sessionToken = form.value.sessionToken || null
        }
      }
      if (form.value.region) {
        data.region = form.value.region
      }
      // 模型配置（支持设置为空来使用系统默认）
      data.defaultModel = form.value.defaultModel || null
      data.smallFastModel = form.value.smallFastModel || null
      data.priority = form.value.priority || 50
      // 如果不启用限流，传递 0 表示不限流
      data.rateLimitDuration = form.value.enableRateLimit ? form.value.rateLimitDuration || 60 : 0
    }

    if (props.account.platform === 'claude') {
      await accountsStore.updateClaudeAccount(props.account.id, data)
    } else if (props.account.platform === 'claude-console') {
      await accountsStore.updateClaudeConsoleAccount(props.account.id, data)
    } else if (props.account.platform === 'bedrock') {
      await accountsStore.updateBedrockAccount(props.account.id, data)
    } else if (props.account.platform === 'openai') {
      await accountsStore.updateOpenAIAccount(props.account.id, data)
    } else {
      await accountsStore.updateGeminiAccount(props.account.id, data)
    }

    emit('success')
  } catch (error) {
    showToast(error.message || '账户更新失败', 'error')
  } finally {
    loading.value = false
  }
}

// 监听表单名称变化，清除错误
watch(
  () => form.value.name,
  () => {
    if (errors.value.name && form.value.name?.trim()) {
      errors.value.name = ''
    }
  }
)

// 监听Access Token变化，清除错误
watch(
  () => form.value.accessToken,
  () => {
    if (errors.value.accessToken && form.value.accessToken?.trim()) {
      errors.value.accessToken = ''
    }
  }
)

// 监听API URL变化，清除错误
watch(
  () => form.value.apiUrl,
  () => {
    if (errors.value.apiUrl && form.value.apiUrl?.trim()) {
      errors.value.apiUrl = ''
    }
  }
)

// 监听API Key变化，清除错误
watch(
  () => form.value.apiKey,
  () => {
    if (errors.value.apiKey && form.value.apiKey?.trim()) {
      errors.value.apiKey = ''
    }
  }
)

// 分组相关数据
const groups = ref([])
const loadingGroups = ref(false)
const showGroupManagement = ref(false)

// 根据平台筛选分组
const filteredGroups = computed(() => {
  const platformFilter = form.value.platform === 'claude-console' ? 'claude' : form.value.platform
  return groups.value.filter((g) => g.platform === platformFilter)
})

// 加载分组列表
const loadGroups = async () => {
  loadingGroups.value = true
  try {
    const response = await apiClient.get('/admin/account-groups')
    groups.value = response.data || []
  } catch (error) {
    showToast('加载分组列表失败', 'error')
    groups.value = []
  } finally {
    loadingGroups.value = false
  }
}

// 刷新分组列表
const refreshGroups = async () => {
  await loadGroups()
  showToast('分组列表已刷新', 'success')
}

// 处理分组管理模态框刷新
const handleGroupRefresh = async () => {
  await loadGroups()
}

// 监听平台变化，重置表单
watch(
  () => form.value.platform,
  (newPlatform) => {
    // 处理添加方式的自动切换
    if (newPlatform === 'claude-console' || newPlatform === 'bedrock') {
      form.value.addType = 'manual' // Claude Console 和 Bedrock 只支持手动模式
    } else if (newPlatform === 'claude') {
      // 切换到 Claude 时，使用 Setup Token 作为默认方式
      form.value.addType = 'setup-token'
    } else if (newPlatform === 'gemini') {
      // 切换到 Gemini 时，使用 OAuth 作为默认方式
      form.value.addType = 'oauth'
    } else if (newPlatform === 'openai') {
      // 切换到 OpenAI 时，使用 OAuth 作为默认方式
      form.value.addType = 'oauth'
    }

    // 平台变化时，清空分组选择
    if (form.value.accountType === 'group') {
      form.value.groupId = ''
    }
  }
)

// 监听Setup Token授权码输入，自动提取URL中的code参数
watch(setupTokenAuthCode, (newValue) => {
  if (!newValue || typeof newValue !== 'string') return

  const trimmedValue = newValue.trim()

  // 如果内容为空，不处理
  if (!trimmedValue) return

  // 检查是否是 URL 格式（包含 http:// 或 https://）
  const isUrl = trimmedValue.startsWith('http://') || trimmedValue.startsWith('https://')

  // 如果是 URL 格式
  if (isUrl) {
    // 检查是否是正确的 localhost:45462 开头的 URL
    if (trimmedValue.startsWith('http://localhost:45462')) {
      try {
        const url = new URL(trimmedValue)
        const code = url.searchParams.get('code')

        if (code) {
          // 成功提取授权码
          setupTokenAuthCode.value = code
          showToast('成功提取授权码！', 'success')
          console.log('Successfully extracted authorization code from URL')
        } else {
          // URL 中没有 code 参数
          showToast('URL 中未找到授权码参数，请检查链接是否正确', 'error')
        }
      } catch (error) {
        // URL 解析失败
        console.error('Failed to parse URL:', error)
        showToast('链接格式错误，请检查是否为完整的 URL', 'error')
      }
    } else {
      // 错误的 URL（不是 localhost:45462 开头）
      showToast('请粘贴以 http://localhost:45462 开头的链接', 'error')
    }
  }
  // 如果不是 URL，保持原值（兼容直接输入授权码）
})

// 监听账户类型变化
watch(
  () => form.value.accountType,
  (newType) => {
    if (newType === 'group') {
      // 如果选择分组类型，加载分组列表
      if (groups.value.length === 0) {
        loadGroups()
      }
    }
  }
)

// 监听分组选择
watch(
  () => form.value.groupId,
  (newGroupId) => {
    if (newGroupId === '__new__') {
      // 触发创建新分组
      form.value.groupId = ''
      showGroupManagement.value = true
    }
  }
)

// 添加模型映射
const addModelMapping = () => {
  modelMappings.value.push({ from: '', to: '' })
}

// 移除模型映射
const removeModelMapping = (index) => {
  modelMappings.value.splice(index, 1)
}

// 添加预设映射
const addPresetMapping = (from, to) => {
  // 检查是否已存在相同的映射
  const exists = modelMappings.value.some((mapping) => mapping.from === from)
  if (exists) {
    showToast(`模型 ${from} 的映射已存在`, 'info')
    return
  }

  modelMappings.value.push({ from, to })
  showToast(`已添加映射: ${from} → ${to}`, 'success')
}

// 将模型映射表转换为对象格式
const convertMappingsToObject = () => {
  const mapping = {}
  modelMappings.value.forEach((item) => {
    if (item.from && item.to) {
      mapping[item.from] = item.to
    }
  })
  return Object.keys(mapping).length > 0 ? mapping : null
}

// 监听账户变化，更新表单
watch(
  () => props.account,
  (newAccount) => {
    if (newAccount) {
      initModelMappings()
      // 重新初始化代理配置
      const proxyConfig =
        newAccount.proxy && newAccount.proxy.host && newAccount.proxy.port
          ? {
              enabled: true,
              type: newAccount.proxy.type || 'socks5',
              host: newAccount.proxy.host,
              port: newAccount.proxy.port,
              username: newAccount.proxy.username || '',
              password: newAccount.proxy.password || ''
            }
          : {
              enabled: false,
              type: 'socks5',
              host: '',
              port: '',
              username: '',
              password: ''
            }

      // 获取分组ID - 可能来自 groupId 字段或 groupInfo 对象
      let groupId = ''
      if (newAccount.accountType === 'group') {
        groupId = newAccount.groupId || (newAccount.groupInfo && newAccount.groupInfo.id) || ''
      }

      // 初始化订阅类型（从 subscriptionInfo 中提取，兼容旧数据默认为 claude_max）
      let subscriptionType = 'claude_max'
      if (newAccount.subscriptionInfo) {
        const info =
          typeof newAccount.subscriptionInfo === 'string'
            ? JSON.parse(newAccount.subscriptionInfo)
            : newAccount.subscriptionInfo

        if (info.accountType) {
          subscriptionType = info.accountType
        } else if (info.hasClaudeMax) {
          subscriptionType = 'claude_max'
        } else if (info.hasClaudePro) {
          subscriptionType = 'claude_pro'
        } else {
          subscriptionType = 'claude_free'
        }
      }

      form.value = {
        platform: newAccount.platform,
        addType: 'oauth',
        name: newAccount.name,
        description: newAccount.description || '',
        accountType: newAccount.accountType || 'shared',
        subscriptionType: subscriptionType,
        groupId: groupId,
        projectId: newAccount.projectId || '',
        accessToken: '',
        refreshToken: '',
        proxy: proxyConfig,
        // Claude Console 特定字段
        apiUrl: newAccount.apiUrl || '',
        apiKey: '', // 编辑模式不显示现有的 API Key
        priority: newAccount.priority || 50,
        supportedModels: (() => {
          const models = newAccount.supportedModels
          if (!models) return ''
          // 处理对象格式（Claude Console 的新格式）
          if (typeof models === 'object' && !Array.isArray(models)) {
            return Object.keys(models).join('\n')
          }
          // 处理数组格式（向后兼容）
          if (Array.isArray(models)) {
            return models.join('\n')
          }
          return ''
        })(),
        userAgent: newAccount.userAgent || '',
        enableRateLimit:
          newAccount.rateLimitDuration && newAccount.rateLimitDuration > 0 ? true : false,
        rateLimitDuration: newAccount.rateLimitDuration || 60,
        // Bedrock 特定字段
        accessKeyId: '', // 编辑模式不显示现有的访问密钥
        secretAccessKey: '', // 编辑模式不显示现有的秘密密钥
        region: newAccount.region || '',
        sessionToken: '', // 编辑模式不显示现有的会话令牌
        defaultModel: newAccount.defaultModel || '',
        smallFastModel: newAccount.smallFastModel || ''
      }

      // 如果是分组类型，加载分组ID
      if (newAccount.accountType === 'group') {
        // 先加载分组列表
        loadGroups().then(() => {
          // 如果账户有 groupInfo，直接使用它的 groupId
          if (newAccount.groupInfo && newAccount.groupInfo.id) {
            form.value.groupId = newAccount.groupInfo.id
          } else {
            // 否则查找账户所属的分组
            groups.value.forEach((group) => {
              apiClient
                .get(`/admin/account-groups/${group.id}/members`)
                .then((response) => {
                  const members = response.data || []
                  if (members.some((m) => m.id === newAccount.id)) {
                    form.value.groupId = group.id
                  }
                })
                .catch(() => {})
            })
          }
        })
      }
    }
  },
  { immediate: true }
)
</script>
