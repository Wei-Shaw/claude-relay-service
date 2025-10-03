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
                >选择平台</label
              >
              <!-- 平台分组选择器 -->
              <div class="space-y-3">
                <!-- 分组选择器 -->
                <div class="grid grid-cols-3 gap-2">
                  <!-- Claude 分组 -->
                  <div
                    class="group relative cursor-pointer overflow-hidden rounded-lg border-2 transition-all duration-200"
                    :class="[
                      platformGroup === 'claude'
                        ? 'border-indigo-500 bg-gradient-to-br from-indigo-50 to-purple-50 shadow-md dark:from-indigo-900/20 dark:to-purple-900/20'
                        : 'border-gray-200 bg-white hover:border-indigo-300 hover:shadow dark:border-gray-700 dark:bg-gray-800 dark:hover:border-indigo-600'
                    ]"
                    @click="selectPlatformGroup('claude')"
                  >
                    <div class="p-3">
                      <div class="flex items-center justify-between">
                        <div
                          class="flex h-8 w-8 items-center justify-center rounded-md bg-gradient-to-br from-indigo-500 to-purple-600"
                        >
                          <i class="fas fa-brain text-sm text-white"></i>
                        </div>
                        <div
                          v-if="platformGroup === 'claude'"
                          class="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-500"
                        >
                          <i class="fas fa-check text-xs text-white"></i>
                        </div>
                      </div>
                      <h4 class="mt-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
                        Claude
                      </h4>
                      <p class="text-xs text-gray-600 dark:text-gray-400">Anthropic</p>
                    </div>
                  </div>

                  <!-- OpenAI 分组 -->
                  <div
                    class="group relative cursor-pointer overflow-hidden rounded-lg border-2 transition-all duration-200"
                    :class="[
                      platformGroup === 'openai'
                        ? 'border-emerald-500 bg-gradient-to-br from-emerald-50 to-teal-50 shadow-md dark:from-emerald-900/20 dark:to-teal-900/20'
                        : 'border-gray-200 bg-white hover:border-emerald-300 hover:shadow dark:border-gray-700 dark:bg-gray-800 dark:hover:border-emerald-600'
                    ]"
                    @click="selectPlatformGroup('openai')"
                  >
                    <div class="p-3">
                      <div class="flex items-center justify-between">
                        <div
                          class="flex h-8 w-8 items-center justify-center rounded-md bg-gradient-to-br from-emerald-500 to-teal-600"
                        >
                          <svg
                            class="h-5 w-5 text-white"
                            fill="currentColor"
                            viewBox="0 0 24 24"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <path
                              d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.8956zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.4069-.6813zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z"
                            />
                          </svg>
                        </div>
                        <div
                          v-if="platformGroup === 'openai'"
                          class="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500"
                        >
                          <i class="fas fa-check text-xs text-white"></i>
                        </div>
                      </div>
                      <h4 class="mt-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
                        OpenAI
                      </h4>
                      <p class="text-xs text-gray-600 dark:text-gray-400">GPT 系列</p>
                    </div>
                  </div>

                  <!-- Gemini 分组 -->
                  <div
                    class="group relative cursor-pointer overflow-hidden rounded-lg border-2 transition-all duration-200"
                    :class="[
                      platformGroup === 'gemini'
                        ? 'border-blue-500 bg-gradient-to-br from-blue-50 to-indigo-50 shadow-md dark:from-blue-900/20 dark:to-indigo-900/20'
                        : 'border-gray-200 bg-white hover:border-blue-300 hover:shadow dark:border-gray-700 dark:bg-gray-800 dark:hover:border-blue-600'
                    ]"
                    @click="selectPlatformGroup('gemini')"
                  >
                    <div class="p-3">
                      <div class="flex items-center justify-between">
                        <div
                          class="flex h-8 w-8 items-center justify-center rounded-md bg-gradient-to-br from-blue-500 to-indigo-600"
                        >
                          <i class="fab fa-google text-sm text-white"></i>
                        </div>
                        <div
                          v-if="platformGroup === 'gemini'"
                          class="flex h-5 w-5 items-center justify-center rounded-full bg-blue-500"
                        >
                          <i class="fas fa-check text-xs text-white"></i>
                        </div>
                      </div>
                      <h4 class="mt-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
                        Gemini
                      </h4>
                      <p class="text-xs text-gray-600 dark:text-gray-400">Google AI</p>
                    </div>
                  </div>
                </div>

                <!-- 子平台选择器 -->
                <div
                  v-if="platformGroup"
                  class="animate-fadeIn rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/50"
                >
                  <p class="mb-2 text-xs font-medium text-gray-700 dark:text-gray-300">
                    选择具体平台类型：
                  </p>
                  <div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    <!-- Claude 子选项 -->
                    <template v-if="platformGroup === 'claude'">
                      <label
                        class="group relative flex cursor-pointer items-center rounded-md border p-2 transition-all"
                        :class="[
                          form.platform === 'claude'
                            ? 'border-indigo-500 bg-indigo-50 dark:border-indigo-400 dark:bg-indigo-900/30'
                            : 'border-gray-300 bg-white hover:border-indigo-400 hover:bg-indigo-50/50 dark:border-gray-600 dark:bg-gray-700 dark:hover:border-indigo-500 dark:hover:bg-indigo-900/20'
                        ]"
                      >
                        <input
                          v-model="form.platform"
                          class="sr-only"
                          type="radio"
                          value="claude"
                        />
                        <div class="flex items-center gap-2">
                          <i class="fas fa-brain text-sm text-indigo-600 dark:text-indigo-400"></i>
                          <div>
                            <span class="block text-xs font-medium text-gray-900 dark:text-gray-100"
                              >Claude Code</span
                            >
                            <span class="text-xs text-gray-500 dark:text-gray-400">官方</span>
                          </div>
                        </div>
                        <div
                          v-if="form.platform === 'claude'"
                          class="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-indigo-500"
                        >
                          <i class="fas fa-check text-xs text-white"></i>
                        </div>
                      </label>

                      <label
                        class="group relative flex cursor-pointer items-center rounded-md border p-2 transition-all"
                        :class="[
                          form.platform === 'claude-console'
                            ? 'border-purple-500 bg-purple-50 dark:border-purple-400 dark:bg-purple-900/30'
                            : 'border-gray-300 bg-white hover:border-purple-400 hover:bg-purple-50/50 dark:border-gray-600 dark:bg-gray-700 dark:hover:border-purple-500 dark:hover:bg-purple-900/20'
                        ]"
                      >
                        <input
                          v-model="form.platform"
                          class="sr-only"
                          type="radio"
                          value="claude-console"
                        />
                        <div class="flex items-center gap-2">
                          <i
                            class="fas fa-terminal text-sm text-purple-600 dark:text-purple-400"
                          ></i>
                          <div>
                            <span class="block text-xs font-medium text-gray-900 dark:text-gray-100"
                              >Claude Console</span
                            >
                            <span class="text-xs text-gray-500 dark:text-gray-400">标准API</span>
                          </div>
                        </div>
                        <div
                          v-if="form.platform === 'claude-console'"
                          class="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-purple-500"
                        >
                          <i class="fas fa-check text-xs text-white"></i>
                        </div>
                      </label>

                      <label
                        class="group relative flex cursor-pointer items-center rounded-md border p-2 transition-all"
                        :class="[
                          form.platform === 'bedrock'
                            ? 'border-orange-500 bg-orange-50 dark:border-orange-400 dark:bg-orange-900/30'
                            : 'border-gray-300 bg-white hover:border-orange-400 hover:bg-orange-50/50 dark:border-gray-600 dark:bg-gray-700 dark:hover:border-orange-500 dark:hover:bg-orange-900/20'
                        ]"
                      >
                        <input
                          v-model="form.platform"
                          class="sr-only"
                          type="radio"
                          value="bedrock"
                        />
                        <div class="flex items-center gap-2">
                          <i class="fab fa-aws text-sm text-orange-600 dark:text-orange-400"></i>
                          <div>
                            <span class="block text-xs font-medium text-gray-900 dark:text-gray-100"
                              >Bedrock</span
                            >
                            <span class="text-xs text-gray-500 dark:text-gray-400">AWS</span>
                          </div>
                        </div>
                        <div
                          v-if="form.platform === 'bedrock'"
                          class="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-orange-500"
                        >
                          <i class="fas fa-check text-xs text-white"></i>
                        </div>
                      </label>

                      <label
                        class="group relative flex cursor-pointer items-center rounded-md border p-2 transition-all"
                        :class="[
                          form.platform === 'ccr'
                            ? 'border-cyan-500 bg-cyan-50 dark:border-cyan-400 dark:bg-cyan-900/30'
                            : 'border-gray-300 bg-white hover:border-cyan-400 hover:bg-cyan-50/50 dark:border-gray-600 dark:bg-gray-700 dark:hover:border-cyan-500 dark:hover:bg-cyan-900/20'
                        ]"
                      >
                        <input v-model="form.platform" class="sr-only" type="radio" value="ccr" />
                        <div class="flex items-center gap-2">
                          <i
                            class="fas fa-code-branch text-sm text-cyan-600 dark:text-cyan-400"
                          ></i>
                          <div>
                            <span class="block text-xs font-medium text-gray-900 dark:text-gray-100"
                              >CCR</span
                            >
                            <span class="text-xs text-gray-500 dark:text-gray-400"
                              >Claude Code Router</span
                            >
                          </div>
                        </div>
                        <div
                          v-if="form.platform === 'ccr'"
                          class="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-cyan-500"
                        >
                          <i class="fas fa-check text-xs text-white"></i>
                        </div>
                      </label>
                    </template>

                    <!-- OpenAI 子选项 -->
                    <template v-if="platformGroup === 'openai'">
                      <label
                        class="group relative flex cursor-pointer items-center rounded-md border p-2 transition-all"
                        :class="[
                          form.platform === 'openai'
                            ? 'border-emerald-500 bg-emerald-50 dark:border-emerald-400 dark:bg-emerald-900/30'
                            : 'border-gray-300 bg-white hover:border-emerald-400 hover:bg-emerald-50/50 dark:border-gray-600 dark:bg-gray-700 dark:hover:border-emerald-500 dark:hover:bg-emerald-900/20'
                        ]"
                      >
                        <input
                          v-model="form.platform"
                          class="sr-only"
                          type="radio"
                          value="openai"
                        />
                        <div class="flex items-center gap-2">
                          <i
                            class="fas fa-robot text-sm text-emerald-600 dark:text-emerald-400"
                          ></i>
                          <div>
                            <span class="block text-xs font-medium text-gray-900 dark:text-gray-100"
                              >Codex Cli</span
                            >
                            <span class="text-xs text-gray-500 dark:text-gray-400">官方</span>
                          </div>
                        </div>
                        <div
                          v-if="form.platform === 'openai'"
                          class="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500"
                        >
                          <i class="fas fa-check text-xs text-white"></i>
                        </div>
                      </label>

                      <label
                        class="group relative flex cursor-pointer items-center rounded-md border p-2 transition-all"
                        :class="[
                          form.platform === 'openai-responses'
                            ? 'border-teal-500 bg-teal-50 dark:border-teal-400 dark:bg-teal-900/30'
                            : 'border-gray-300 bg-white hover:border-teal-400 hover:bg-teal-50/50 dark:border-gray-600 dark:bg-gray-700 dark:hover:border-teal-500 dark:hover:bg-teal-900/20'
                        ]"
                      >
                        <input
                          v-model="form.platform"
                          class="sr-only"
                          type="radio"
                          value="openai-responses"
                        />
                        <div class="flex items-center gap-2">
                          <i class="fas fa-server text-sm text-teal-600 dark:text-teal-400"></i>
                          <div>
                            <span class="block text-xs font-medium text-gray-900 dark:text-gray-100"
                              >Responses</span
                            >
                            <span class="text-xs text-gray-500 dark:text-gray-400"
                              >Openai-Responses</span
                            >
                          </div>
                        </div>
                        <div
                          v-if="form.platform === 'openai-responses'"
                          class="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-teal-500"
                        >
                          <i class="fas fa-check text-xs text-white"></i>
                        </div>
                      </label>

                      <label
                        class="group relative flex cursor-pointer items-center rounded-md border p-2 transition-all"
                        :class="[
                          form.platform === 'azure_openai'
                            ? 'border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-900/30'
                            : 'border-gray-300 bg-white hover:border-blue-400 hover:bg-blue-50/50 dark:border-gray-600 dark:bg-gray-700 dark:hover:border-blue-500 dark:hover:bg-blue-900/20'
                        ]"
                      >
                        <input
                          v-model="form.platform"
                          class="sr-only"
                          type="radio"
                          value="azure_openai"
                        />
                        <div class="flex items-center gap-2">
                          <i class="fab fa-microsoft text-sm text-blue-600 dark:text-blue-400"></i>
                          <div>
                            <span class="block text-xs font-medium text-gray-900 dark:text-gray-100"
                              >Azure</span
                            >
                            <span class="text-xs text-gray-500 dark:text-gray-400"
                              >Azure Openai</span
                            >
                          </div>
                        </div>
                        <div
                          v-if="form.platform === 'azure_openai'"
                          class="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-blue-500"
                        >
                          <i class="fas fa-check text-xs text-white"></i>
                        </div>
                      </label>
                    </template>

                    <!-- Gemini 子选项 -->
                    <template v-if="platformGroup === 'gemini'">
                      <label
                        class="group relative flex cursor-pointer items-center rounded-md border p-2 transition-all"
                        :class="[
                          form.platform === 'gemini'
                            ? 'border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-900/30'
                            : 'border-gray-300 bg-white hover:border-blue-400 hover:bg-blue-50/50 dark:border-gray-600 dark:bg-gray-700 dark:hover:border-blue-500 dark:hover:bg-blue-900/20'
                        ]"
                      >
                        <input
                          v-model="form.platform"
                          class="sr-only"
                          type="radio"
                          value="gemini"
                        />
                        <div class="flex items-center gap-2">
                          <i class="fab fa-google text-sm text-blue-600 dark:text-blue-400"></i>
                          <div>
                            <span class="block text-xs font-medium text-gray-900 dark:text-gray-100"
                              >Gemini Cli</span
                            >
                            <span class="text-xs text-gray-500 dark:text-gray-400">官方</span>
                          </div>
                        </div>
                        <div
                          v-if="form.platform === 'gemini'"
                          class="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-blue-500"
                        >
                          <i class="fas fa-check text-xs text-white"></i>
                        </div>
                      </label>
                    </template>
                  </div>
                </div>
              </div>
            </div>

            <div
              v-if="
                !isEdit &&
                form.platform !== 'claude-console' &&
                form.platform !== 'ccr' &&
                form.platform !== 'bedrock' &&
                form.platform !== 'azure_openai' &&
                form.platform !== 'openai-responses'
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
                class="form-input w-full border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
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
                class="form-input w-full resize-none border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
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
                <div class="flex-1">
                  <!-- 多选分组界面 -->
                  <div
                    class="max-h-48 space-y-2 overflow-y-auto rounded-md border p-3 dark:border-gray-600 dark:bg-gray-700"
                  >
                    <div
                      v-if="filteredGroups.length === 0"
                      class="text-sm text-gray-500 dark:text-gray-400"
                    >
                      暂无可用分组
                    </div>
                    <label
                      v-for="group in filteredGroups"
                      :key="group.id"
                      class="flex cursor-pointer items-center gap-2 rounded-md p-2 hover:bg-gray-50 dark:hover:bg-gray-600"
                    >
                      <input
                        v-model="form.groupIds"
                        class="rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700"
                        type="checkbox"
                        :value="group.id"
                      />
                      <span class="text-sm text-gray-700 dark:text-gray-200">
                        {{ group.name }} ({{ group.memberCount || 0 }} 个成员)
                      </span>
                    </label>
                    <!-- 新建分组选项 -->
                    <div class="border-t pt-2 dark:border-gray-600">
                      <button
                        class="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                        type="button"
                        @click="handleNewGroup"
                      >
                        <i class="fas fa-plus" />
                        新建分组
                      </button>
                    </div>
                  </div>
                </div>
                <button
                  class="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
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
                class="form-input w-full border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
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
                  class="form-input w-full border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
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
                  class="form-input w-full border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
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
                  class="form-input w-full border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
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
                  class="form-input w-full border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
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
                  class="form-input w-full border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
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
                  class="form-input w-full border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
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
                  class="form-input w-full border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
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
                  class="form-input w-full border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
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
                  class="form-input w-full border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
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
                  class="form-input w-full border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
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
                    v-for="model in [
                      'gpt-4',
                      'gpt-4-turbo',
                      'gpt-4o',
                      'gpt-4o-mini',
                      'gpt-5',
                      'gpt-5-mini',
                      'gpt-35-turbo',
                      'gpt-35-turbo-16k',
                      'codex-mini'
                    ]"
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
                    class="form-input w-full border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
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

            <!-- Claude Console 和 CCR 特定字段 -->
            <div
              v-if="(form.platform === 'claude-console' || form.platform === 'ccr') && !isEdit"
              class="space-y-4"
            >
              <div>
                <label class="mb-3 block text-sm font-semibold text-gray-700 dark:text-gray-300"
                  >API URL *</label
                >
                <input
                  v-model="form.apiUrl"
                  class="form-input w-full border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
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
                  class="form-input w-full border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
                  :class="{ 'border-red-500': errors.apiKey }"
                  placeholder="请输入API Key"
                  required
                  type="password"
                />
                <p v-if="errors.apiKey" class="mt-1 text-xs text-red-500">
                  {{ errors.apiKey }}
                </p>
              </div>

              <!-- 额度管理字段 -->
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="mb-3 block text-sm font-semibold text-gray-700 dark:text-gray-300">
                    每日额度限制 ($)
                  </label>
                  <input
                    v-model.number="form.dailyQuota"
                    class="form-input w-full border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
                    min="0"
                    placeholder="0 表示不限制"
                    step="0.01"
                    type="number"
                  />
                  <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    设置每日使用额度，0 表示不限制
                  </p>
                </div>

                <div>
                  <label class="mb-3 block text-sm font-semibold text-gray-700 dark:text-gray-300">
                    额度重置时间
                  </label>
                  <input
                    v-model="form.quotaResetTime"
                    class="form-input w-full border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
                    placeholder="00:00"
                    type="time"
                  />
                  <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    每日自动重置额度的时间
                  </p>
                </div>
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
                      class="form-input flex-1 border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
                      placeholder="原始模型名称"
                      type="text"
                    />
                    <i class="fas fa-arrow-right text-gray-400 dark:text-gray-500" />
                    <input
                      v-model="mapping.to"
                      class="form-input flex-1 border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
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
                  class="form-input w-full border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
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
                    class="form-input w-full border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
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

            <!-- OpenAI-Responses 特定字段 -->
            <div v-if="form.platform === 'openai-responses' && !isEdit" class="space-y-4">
              <div>
                <label class="mb-3 block text-sm font-semibold text-gray-700 dark:text-gray-300"
                  >API 基础地址 *</label
                >
                <input
                  v-model="form.baseApi"
                  class="form-input w-full border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
                  placeholder="https://api.example.com/v1"
                  required
                  type="url"
                />
                <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  第三方 OpenAI 兼容 API 的基础地址，不要包含具体路径
                </p>
              </div>

              <div>
                <label class="mb-3 block text-sm font-semibold text-gray-700 dark:text-gray-300"
                  >API 密钥 *</label
                >
                <div class="relative">
                  <input
                    v-model="form.apiKey"
                    class="form-input w-full border-gray-300 pr-10 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
                    placeholder="sk-xxxxxxxxxxxx"
                    required
                    :type="showApiKey ? 'text' : 'password'"
                  />
                  <button
                    class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-400"
                    type="button"
                    @click="showApiKey = !showApiKey"
                  >
                    <i :class="showApiKey ? 'fas fa-eye-slash' : 'fas fa-eye'" />
                  </button>
                </div>
                <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  第三方服务提供的 API 密钥
                </p>
              </div>

              <div>
                <label class="mb-3 block text-sm font-semibold text-gray-700 dark:text-gray-300"
                  >自定义 User-Agent (可选)</label
                >
                <input
                  v-model="form.userAgent"
                  class="form-input w-full border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
                  placeholder="留空则透传原始请求的 User-Agent"
                  type="text"
                />
                <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  可选项。如果设置，所有请求将使用此 User-Agent；否则透传客户端的 User-Agent
                </p>
              </div>

              <!-- 限流时长字段 - 隐藏不显示，使用默认值60 -->
              <input v-model.number="form.rateLimitDuration" type="hidden" value="60" />
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

            <!-- Claude 5小时限制自动停止调度选项 -->
            <div v-if="form.platform === 'claude'" class="mt-4">
              <label class="flex items-start">
                <input
                  v-model="form.autoStopOnWarning"
                  class="mt-1 text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700"
                  type="checkbox"
                />
                <div class="ml-3">
                  <span class="text-sm font-medium text-gray-700 dark:text-gray-300">
                    5小时使用量接近限制时自动停止调度
                  </span>
                  <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    当系统检测到账户接近5小时使用限制时，自动暂停调度该账户。进入新的时间窗口后会自动恢复调度。
                  </p>
                </div>
              </label>
            </div>

            <!-- Claude User-Agent 版本配置 -->
            <div v-if="form.platform === 'claude'" class="mt-4">
              <label class="flex items-start">
                <input
                  v-model="form.useUnifiedUserAgent"
                  class="mt-1 text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700"
                  type="checkbox"
                />
                <div class="ml-3">
                  <span class="text-sm font-medium text-gray-700 dark:text-gray-300">
                    使用统一 Claude Code 版本
                  </span>
                  <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    开启后将使用从真实 Claude Code 客户端捕获的统一 User-Agent，提高兼容性
                  </p>
                  <div v-if="unifiedUserAgent" class="mt-1">
                    <div class="flex items-center justify-between">
                      <p class="text-xs text-green-600 dark:text-green-400">
                        💡 当前统一版本：{{ unifiedUserAgent }}
                      </p>
                      <button
                        class="ml-2 text-xs text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                        :disabled="clearingCache"
                        type="button"
                        @click="clearUnifiedCache"
                      >
                        <i v-if="!clearingCache" class="fas fa-trash-alt mr-1"></i>
                        <div v-else class="loading-spinner mr-1"></div>
                        {{ clearingCache ? '清除中...' : '清除缓存' }}
                      </button>
                    </div>
                  </div>
                  <div v-else class="mt-1">
                    <p class="text-xs text-gray-500 dark:text-gray-400">
                      ⏳ 等待从 Claude Code 客户端捕获 User-Agent
                    </p>
                    <p class="mt-1 text-xs text-gray-400 dark:text-gray-500">
                      💡 提示：如果长时间未能捕获，请确认有 Claude Code 客户端正在使用此账户，
                      或联系开发者检查 User-Agent 格式是否发生变化
                    </p>
                  </div>
                </div>
              </label>
            </div>

            <!-- Claude 统一客户端标识配置 -->
            <div v-if="form.platform === 'claude'" class="mt-4">
              <label class="flex items-start">
                <input
                  v-model="form.useUnifiedClientId"
                  class="mt-1 text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700"
                  type="checkbox"
                  @change="handleUnifiedClientIdChange"
                />
                <div class="ml-3 flex-1">
                  <span class="text-sm font-medium text-gray-700 dark:text-gray-300">
                    使用统一的客户端标识
                  </span>
                  <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    开启后将使用固定的客户端标识，使所有请求看起来来自同一个客户端，减少特征
                  </p>
                  <div v-if="form.useUnifiedClientId" class="mt-3">
                    <div
                      class="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/50"
                    >
                      <div class="mb-2 flex items-center justify-between">
                        <span class="text-xs font-medium text-gray-600 dark:text-gray-400"
                          >客户端标识 ID</span
                        >
                        <button
                          class="rounded-md bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50"
                          type="button"
                          @click="regenerateClientId"
                        >
                          <i class="fas fa-sync-alt mr-1" />
                          重新生成
                        </button>
                      </div>
                      <div class="flex items-center gap-2">
                        <code
                          class="block w-full select-all break-all rounded bg-gray-100 px-3 py-2 font-mono text-xs text-gray-700 dark:bg-gray-900 dark:text-gray-300"
                        >
                          <span class="text-blue-600 dark:text-blue-400">{{
                            form.unifiedClientId.substring(0, 8)
                          }}</span
                          ><span class="text-gray-500 dark:text-gray-500">{{
                            form.unifiedClientId.substring(8, 56)
                          }}</span
                          ><span class="text-blue-600 dark:text-blue-400">{{
                            form.unifiedClientId.substring(56)
                          }}</span>
                        </code>
                      </div>
                      <p class="mt-2 text-xs text-gray-500 dark:text-gray-400">
                        <i class="fas fa-info-circle mr-1 text-blue-500" />
                        此ID将替换请求中的user_id客户端部分，保留session部分用于粘性会话
                      </p>
                    </div>
                  </div>
                </div>
              </label>
            </div>

            <!-- 所有平台的优先级设置 -->
            <div>
              <label class="mb-3 block text-sm font-semibold text-gray-700 dark:text-gray-300"
                >调度优先级 (1-100)</label
              >
              <input
                v-model.number="form.priority"
                class="form-input w-full border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
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
                form.platform !== 'ccr' &&
                form.platform !== 'bedrock' &&
                form.platform !== 'azure_openai' &&
                form.platform !== 'openai-responses'
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

              <div v-if="form.platform === 'openai'">
                <label class="mb-3 block text-sm font-semibold text-gray-700 dark:text-gray-300"
                  >Access Token (可选)</label
                >
                <textarea
                  v-model="form.accessToken"
                  class="form-input w-full resize-none border-gray-300 font-mono text-xs dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
                  placeholder="可选：如果不填写，系统会自动通过 Refresh Token 获取..."
                  rows="4"
                />
                <p class="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  <i class="fas fa-info-circle mr-1" />
                  Access Token 可选填。如果不提供，系统会通过 Refresh Token 自动获取。
                </p>
              </div>

              <div v-else>
                <label class="mb-3 block text-sm font-semibold text-gray-700 dark:text-gray-300"
                  >Access Token *</label
                >
                <textarea
                  v-model="form.accessToken"
                  class="form-input w-full resize-none border-gray-300 font-mono text-xs dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
                  :class="{ 'border-red-500': errors.accessToken }"
                  placeholder="请输入 Access Token..."
                  required
                  rows="4"
                />
                <p v-if="errors.accessToken" class="mt-1 text-xs text-red-500">
                  {{ errors.accessToken }}
                </p>
              </div>

              <div v-if="form.platform === 'openai'">
                <label class="mb-3 block text-sm font-semibold text-gray-700 dark:text-gray-300"
                  >Refresh Token *</label
                >
                <textarea
                  v-model="form.refreshToken"
                  class="form-input w-full resize-none border-gray-300 font-mono text-xs dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
                  :class="{ 'border-red-500': errors.refreshToken }"
                  placeholder="请输入 Refresh Token（必填）..."
                  required
                  rows="4"
                />
                <p v-if="errors.refreshToken" class="mt-1 text-xs text-red-500">
                  {{ errors.refreshToken }}
                </p>
                <p class="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  <i class="fas fa-info-circle mr-1" />
                  系统将使用 Refresh Token 自动获取 Access Token 和用户信息
                </p>
              </div>

              <div v-else>
                <label class="mb-3 block text-sm font-semibold text-gray-700 dark:text-gray-300"
                  >Refresh Token (可选)</label
                >
                <textarea
                  v-model="form.refreshToken"
                  class="form-input w-full resize-none border-gray-300 font-mono text-xs dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
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
                  form.platform !== 'ccr' &&
                  form.platform !== 'bedrock' &&
                  form.platform !== 'azure_openai' &&
                  form.platform !== 'openai-responses'
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
                                class="form-input w-full resize-none border-gray-300 font-mono text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
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
              class="form-input w-full border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
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
              class="form-input w-full resize-none border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
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
              <div class="flex-1">
                <!-- 多选分组界面 -->
                <div
                  class="max-h-48 space-y-2 overflow-y-auto rounded-md border p-3 dark:border-gray-600 dark:bg-gray-700"
                >
                  <div
                    v-if="filteredGroups.length === 0"
                    class="text-sm text-gray-500 dark:text-gray-400"
                  >
                    暂无可用分组
                  </div>
                  <label
                    v-for="group in filteredGroups"
                    :key="group.id"
                    class="flex cursor-pointer items-center gap-2 rounded-md p-2 hover:bg-gray-50 dark:hover:bg-gray-600"
                  >
                    <input
                      v-model="form.groupIds"
                      class="rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700"
                      type="checkbox"
                      :value="group.id"
                    />
                    <span class="text-sm text-gray-700 dark:text-gray-200">
                      {{ group.name }} ({{ group.memberCount || 0 }} 个成员)
                    </span>
                  </label>
                  <!-- 新建分组选项 -->
                  <div class="border-t pt-2 dark:border-gray-600">
                    <button
                      class="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                      type="button"
                      @click="handleNewGroup"
                    >
                      <i class="fas fa-plus" />
                      新建分组
                    </button>
                  </div>
                </div>
              </div>
              <button
                class="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
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
              class="form-input w-full border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
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

          <!-- Claude 5小时限制自动停止调度选项（编辑模式） -->
          <div v-if="form.platform === 'claude'" class="mt-4">
            <label class="flex items-start">
              <input
                v-model="form.autoStopOnWarning"
                class="mt-1 text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700"
                type="checkbox"
              />
              <div class="ml-3">
                <span class="text-sm font-medium text-gray-700 dark:text-gray-300">
                  5小时使用量接近限制时自动停止调度
                </span>
                <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  当系统检测到账户接近5小时使用限制时，自动暂停调度该账户。进入新的时间窗口后会自动恢复调度。
                </p>
              </div>
            </label>
          </div>

          <!-- Claude User-Agent 版本配置（编辑模式） -->
          <div v-if="form.platform === 'claude'" class="mt-4">
            <label class="flex items-start">
              <input
                v-model="form.useUnifiedUserAgent"
                class="mt-1 text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700"
                type="checkbox"
              />
              <div class="ml-3">
                <span class="text-sm font-medium text-gray-700 dark:text-gray-300">
                  使用统一 Claude Code 版本
                </span>
                <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  开启后将使用从真实 Claude Code 客户端捕获的统一 User-Agent，提高兼容性
                </p>
                <div v-if="unifiedUserAgent" class="mt-1">
                  <div class="flex items-center justify-between">
                    <p class="text-xs text-green-600 dark:text-green-400">
                      💡 当前统一版本：{{ unifiedUserAgent }}
                    </p>
                    <button
                      class="ml-2 text-xs text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                      :disabled="clearingCache"
                      type="button"
                      @click="clearUnifiedCache"
                    >
                      <i v-if="!clearingCache" class="fas fa-trash-alt mr-1"></i>
                      <div v-else class="loading-spinner mr-1"></div>
                      {{ clearingCache ? '清除中...' : '清除缓存' }}
                    </button>
                  </div>
                </div>
                <div v-else class="mt-1">
                  <p class="text-xs text-gray-500 dark:text-gray-400">
                    ⏳ 等待从 Claude Code 客户端捕获 User-Agent
                  </p>
                  <p class="mt-1 text-xs text-gray-400 dark:text-gray-500">
                    💡 提示：如果长时间未能捕获，请确认有 Claude Code 客户端正在使用此账户，
                    或联系开发者检查 User-Agent 格式是否发生变化
                  </p>
                </div>
              </div>
            </label>
          </div>

          <!-- Claude 统一客户端标识配置（编辑模式） -->
          <div v-if="form.platform === 'claude'" class="mt-4">
            <label class="flex items-start">
              <input
                v-model="form.useUnifiedClientId"
                class="mt-1 text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700"
                type="checkbox"
                @change="handleUnifiedClientIdChange"
              />
              <div class="ml-3 flex-1">
                <span class="text-sm font-medium text-gray-700 dark:text-gray-300">
                  使用统一的客户端标识
                </span>
                <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  开启后将使用固定的客户端标识，使所有请求看起来来自同一个客户端，减少特征
                </p>
                <div v-if="form.useUnifiedClientId" class="mt-3">
                  <div
                    class="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/50"
                  >
                    <div class="mb-2 flex items-center justify-between">
                      <span class="text-xs font-medium text-gray-600 dark:text-gray-400"
                        >客户端标识 ID</span
                      >
                      <button
                        class="rounded-md bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50"
                        type="button"
                        @click="regenerateClientId"
                      >
                        <i class="fas fa-sync-alt mr-1" />
                        重新生成
                      </button>
                    </div>
                    <div class="flex items-center gap-2">
                      <code
                        class="block w-full select-all break-all rounded bg-gray-100 px-3 py-2 font-mono text-xs text-gray-700 dark:bg-gray-900 dark:text-gray-300"
                      >
                        <span class="text-blue-600 dark:text-blue-400">{{
                          form.unifiedClientId.substring(0, 8)
                        }}</span
                        ><span class="text-gray-500 dark:text-gray-500">{{
                          form.unifiedClientId.substring(8, 56)
                        }}</span
                        ><span class="text-blue-600 dark:text-blue-400">{{
                          form.unifiedClientId.substring(56)
                        }}</span>
                      </code>
                    </div>
                    <p class="mt-2 text-xs text-gray-500 dark:text-gray-400">
                      <i class="fas fa-info-circle mr-1 text-blue-500" />
                      此ID将替换请求中的user_id客户端部分，保留session部分用于粘性会话
                    </p>
                  </div>
                </div>
              </div>
            </label>
          </div>

          <!-- 所有平台的优先级设置（编辑模式） -->
          <div>
            <label class="mb-3 block text-sm font-semibold text-gray-700 dark:text-gray-300"
              >调度优先级 (1-100)</label
            >
            <input
              v-model.number="form.priority"
              class="form-input w-full border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
              max="100"
              min="1"
              placeholder="数字越小优先级越高"
              type="number"
            />
            <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
              数字越小优先级越高，建议范围：1-100
            </p>
          </div>

          <!-- Claude Console 和 CCR 特定字段（编辑模式）-->
          <div
            v-if="form.platform === 'claude-console' || form.platform === 'ccr'"
            class="space-y-4"
          >
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

            <!-- 额度管理字段 -->
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="mb-3 block text-sm font-semibold text-gray-700 dark:text-gray-300">
                  每日额度限制 ($)
                </label>
                <input
                  v-model.number="form.dailyQuota"
                  class="form-input w-full border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
                  min="0"
                  placeholder="0 表示不限制"
                  step="0.01"
                  type="number"
                />
                <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  设置每日使用额度，0 表示不限制
                </p>
              </div>

              <div>
                <label class="mb-3 block text-sm font-semibold text-gray-700 dark:text-gray-300">
                  额度重置时间
                </label>
                <input
                  v-model="form.quotaResetTime"
                  class="form-input w-full border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
                  placeholder="00:00"
                  type="time"
                />
                <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">每日自动重置额度的时间</p>
              </div>
            </div>

            <!-- 当前使用情况（仅编辑模式显示） -->
            <div
              v-if="isEdit && form.dailyQuota > 0"
              class="rounded-lg bg-gray-50 p-4 dark:bg-gray-800"
            >
              <div class="mb-2 flex items-center justify-between">
                <span class="text-sm font-semibold text-gray-700 dark:text-gray-300">
                  今日使用情况
                </span>
                <span class="text-sm text-gray-500 dark:text-gray-400">
                  ${{ calculateCurrentUsage().toFixed(4) }} / ${{ form.dailyQuota.toFixed(2) }}
                </span>
              </div>
              <div class="relative h-2 w-full rounded-full bg-gray-200 dark:bg-gray-700">
                <div
                  class="absolute left-0 top-0 h-full rounded-full transition-all"
                  :class="
                    usagePercentage >= 90
                      ? 'bg-red-500'
                      : usagePercentage >= 70
                        ? 'bg-yellow-500'
                        : 'bg-green-500'
                  "
                  :style="{ width: `${Math.min(usagePercentage, 100)}%` }"
                />
              </div>
              <div class="mt-2 flex items-center justify-between text-xs">
                <span class="text-gray-500 dark:text-gray-400">
                  剩余: ${{ Math.max(0, form.dailyQuota - calculateCurrentUsage()).toFixed(2) }}
                </span>
                <span class="text-gray-500 dark:text-gray-400">
                  {{ usagePercentage.toFixed(1) }}% 已使用
                </span>
              </div>
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

          <!-- OpenAI-Responses 特定字段（编辑模式）-->
          <div v-if="form.platform === 'openai-responses'" class="space-y-4">
            <div>
              <label class="mb-3 block text-sm font-semibold text-gray-700">API 基础地址</label>
              <input
                v-model="form.baseApi"
                class="form-input w-full"
                placeholder="https://api.example.com/v1"
                type="url"
              />
            </div>

            <div>
              <label class="mb-3 block text-sm font-semibold text-gray-700">API 密钥</label>
              <div class="relative">
                <input
                  v-model="form.apiKey"
                  class="form-input w-full pr-10"
                  placeholder="留空表示不更新"
                  :type="showApiKey ? 'text' : 'password'"
                />
                <button
                  class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  type="button"
                  @click="showApiKey = !showApiKey"
                >
                  <i :class="showApiKey ? 'fas fa-eye-slash' : 'fas fa-eye'" />
                </button>
              </div>
              <p class="mt-1 text-xs text-gray-500">留空表示不更新 API Key</p>
            </div>

            <div>
              <label class="mb-3 block text-sm font-semibold text-gray-700"
                >自定义 User-Agent</label
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

            <!-- 限流时长字段 - 隐藏不显示，保持原值 -->
            <input v-model.number="form.rateLimitDuration" type="hidden" />

            <!-- 额度管理字段 -->
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="mb-3 block text-sm font-semibold text-gray-700 dark:text-gray-300">
                  每日额度限制 ($)
                </label>
                <input
                  v-model.number="form.dailyQuota"
                  class="form-input w-full border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
                  min="0"
                  placeholder="0 表示不限制"
                  step="0.01"
                  type="number"
                />
              </div>
              <div>
                <label class="mb-3 block text-sm font-semibold text-gray-700 dark:text-gray-300">
                  额度重置时间
                </label>
                <input
                  v-model="form.quotaResetTime"
                  class="form-input w-full border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
                  type="time"
                />
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

          <!-- Azure OpenAI 特定字段（编辑模式）-->
          <div v-if="form.platform === 'azure_openai'" class="space-y-4">
            <div>
              <label class="mb-3 block text-sm font-semibold text-gray-700 dark:text-gray-300"
                >Azure Endpoint</label
              >
              <input
                v-model="form.azureEndpoint"
                class="form-input w-full border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
                :class="{ 'border-red-500': errors.azureEndpoint }"
                placeholder="https://your-resource.openai.azure.com"
                type="url"
              />
              <p v-if="errors.azureEndpoint" class="mt-1 text-xs text-red-500">
                {{ errors.azureEndpoint }}
              </p>
            </div>

            <div>
              <label class="mb-3 block text-sm font-semibold text-gray-700 dark:text-gray-300"
                >API 版本</label
              >
              <input
                v-model="form.apiVersion"
                class="form-input w-full border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
                placeholder="2024-02-01"
                type="text"
              />
              <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Azure OpenAI API 版本，默认使用最新稳定版本 2024-02-01
              </p>
            </div>

            <div>
              <label class="mb-3 block text-sm font-semibold text-gray-700 dark:text-gray-300"
                >部署名称</label
              >
              <input
                v-model="form.deploymentName"
                class="form-input w-full border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
                :class="{ 'border-red-500': errors.deploymentName }"
                placeholder="gpt-4"
                type="text"
              />
              <p v-if="errors.deploymentName" class="mt-1 text-xs text-red-500">
                {{ errors.deploymentName }}
              </p>
            </div>

            <div>
              <label class="mb-3 block text-sm font-semibold text-gray-700 dark:text-gray-300"
                >API Key</label
              >
              <input
                v-model="form.apiKey"
                class="form-input w-full border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
                :class="{ 'border-red-500': errors.apiKey }"
                placeholder="留空表示不更新"
                type="password"
              />
              <p v-if="errors.apiKey" class="mt-1 text-xs text-red-500">
                {{ errors.apiKey }}
              </p>
              <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">留空表示不更新 API Key</p>
            </div>

            <div>
              <label class="mb-3 block text-sm font-semibold text-gray-700 dark:text-gray-300"
                >支持的模型</label
              >
              <div class="flex flex-wrap gap-2">
                <label
                  v-for="model in [
                    'gpt-4',
                    'gpt-4-turbo',
                    'gpt-4o',
                    'gpt-4o-mini',
                    'gpt-5',
                    'gpt-5-mini',
                    'gpt-35-turbo',
                    'gpt-35-turbo-16k',
                    'codex-mini'
                  ]"
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
              <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">选择此部署支持的模型类型</p>
            </div>
          </div>

          <!-- Token 更新 -->
          <div
            v-if="
              form.platform !== 'claude-console' &&
              form.platform !== 'ccr' &&
              form.platform !== 'bedrock' &&
              form.platform !== 'azure_openai' &&
              form.platform !== 'openai-responses'
            "
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
                  class="form-input w-full resize-none border-gray-300 font-mono text-xs dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
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
                  class="form-input w-full resize-none border-gray-300 font-mono text-xs dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
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
import { ref, computed, watch, onMounted } from 'vue'
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

const emit = defineEmits(['close', 'success', 'platform-changed'])

const accountsStore = useAccountsStore()
const { showConfirmModal, confirmOptions, showConfirm, handleConfirm, handleCancel } = useConfirm()

// 是否为编辑模式
const isEdit = computed(() => !!props.account)
const show = ref(true)

// OAuth步骤
const oauthStep = ref(1)
const loading = ref(false)
const showApiKey = ref(false)

// Setup Token 相关状态
const setupTokenLoading = ref(false)
const setupTokenExchanging = ref(false)
const setupTokenAuthUrl = ref('')
const setupTokenAuthCode = ref('')
const setupTokenCopied = ref(false)
const setupTokenSessionId = ref('')

// Claude Code 统一 User-Agent 信息
const unifiedUserAgent = ref('')
const clearingCache = ref(false)
// 客户端标识编辑状态（已废弃，不再需要编辑功能）
// const editingClientId = ref(false)

// 平台分组状态
const platformGroup = ref('')

// 根据现有平台确定分组
const determinePlatformGroup = (platform) => {
  if (['claude', 'claude-console', 'ccr', 'bedrock'].includes(platform)) {
    return 'claude'
  } else if (['openai', 'openai-responses', 'azure_openai'].includes(platform)) {
    return 'openai'
  } else if (platform === 'gemini') {
    return 'gemini'
  }
  return ''
}

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
  autoStopOnWarning: props.account?.autoStopOnWarning || false, // 5小时限制自动停止调度
  useUnifiedUserAgent: props.account?.useUnifiedUserAgent || false, // 使用统一Claude Code版本
  useUnifiedClientId: props.account?.useUnifiedClientId || false, // 使用统一的客户端标识
  unifiedClientId: props.account?.unifiedClientId || '', // 统一的客户端标识
  groupId: '',
  groupIds: [],
  projectId: props.account?.projectId || '',
  accessToken: '',
  refreshToken: '',
  proxy: initProxyConfig(),
  // Claude Console 特定字段
  apiUrl: props.account?.apiUrl || '',
  apiKey: props.account?.apiKey || '',
  priority: props.account?.priority || 50,
  // OpenAI-Responses 特定字段
  baseApi: props.account?.baseApi || '',
  rateLimitDuration: props.account?.rateLimitDuration || 60,
  supportedModels: (() => {
    const models = props.account?.supportedModels
    if (!models) return []
    // 处理对象格式（Claude Console 的新格式）
    if (typeof models === 'object' && !Array.isArray(models)) {
      return Object.keys(models)
    }
    // 处理数组格式（向后兼容）
    if (Array.isArray(models)) {
      return models
    }
    return []
  })(),
  userAgent: props.account?.userAgent || '',
  enableRateLimit: props.account ? props.account.rateLimitDuration > 0 : true,
  // 额度管理字段
  dailyQuota: props.account?.dailyQuota || 0,
  dailyUsage: props.account?.dailyUsage || 0,
  quotaResetTime: props.account?.quotaResetTime || '00:00',
  // Bedrock 特定字段
  accessKeyId: props.account?.accessKeyId || '',
  secretAccessKey: props.account?.secretAccessKey || '',
  region: props.account?.region || '',
  sessionToken: props.account?.sessionToken || '',
  defaultModel: props.account?.defaultModel || '',
  smallFastModel: props.account?.smallFastModel || '',
  // Azure OpenAI 特定字段
  azureEndpoint: props.account?.azureEndpoint || '',
  apiVersion: props.account?.apiVersion || '',
  deploymentName: props.account?.deploymentName || ''
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
  refreshToken: '',
  accessToken: '',
  apiUrl: '',
  apiKey: '',
  accessKeyId: '',
  secretAccessKey: '',
  region: '',
  azureEndpoint: '',
  deploymentName: ''
})

// 计算是否可以进入下一步
const canProceed = computed(() => {
  return form.value.name?.trim() && form.value.platform
})

// 计算是否可以交换Setup Token code
const canExchangeSetupToken = computed(() => {
  return setupTokenAuthUrl.value && setupTokenAuthCode.value.trim()
})

// 获取当前使用量（实时）
const calculateCurrentUsage = () => {
  // 如果不是编辑模式或没有账户ID，返回0
  if (!isEdit.value || !props.account?.id) {
    return 0
  }

  // 如果已经加载了今日使用数据，直接使用
  if (typeof form.value.dailyUsage === 'number') {
    return form.value.dailyUsage
  }

  return 0
}

// 计算额度使用百分比
const usagePercentage = computed(() => {
  if (!form.value.dailyQuota || form.value.dailyQuota <= 0) {
    return 0
  }
  const currentUsage = calculateCurrentUsage()
  return (currentUsage / form.value.dailyQuota) * 100
})

// 加载账户今日使用情况
const loadAccountUsage = async () => {
  if (!isEdit.value || !props.account?.id) return

  try {
    const response = await apiClient.get(`/admin/claude-console-accounts/${props.account.id}/usage`)
    if (response) {
      // 更新表单中的使用量数据
      form.value.dailyUsage = response.dailyUsage || 0
    }
  } catch (error) {
    // 静默处理使用量加载失败
  }
}

// // 计算是否可以创建
// const canCreate = computed(() => {
//   if (form.value.addType === 'manual') {
//     return form.value.name?.trim() && form.value.accessToken?.trim()
//   }
//   return form.value.name?.trim()
// })

// 选择平台分组
const selectPlatformGroup = (group) => {
  platformGroup.value = group
  // 根据分组自动选择默认平台
  if (group === 'claude') {
    form.value.platform = 'claude'
  } else if (group === 'openai') {
    form.value.platform = 'openai'
  } else if (group === 'gemini') {
    form.value.platform = 'gemini'
  }
}

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

  // 分组类型验证 - OAuth流程修复
  if (
    form.value.accountType === 'group' &&
    (!form.value.groupIds || form.value.groupIds.length === 0)
  ) {
    showToast('请选择一个分组', 'error')
    return
  }

  // 数据同步：确保 groupId 和 groupIds 保持一致 - OAuth流程
  if (form.value.accountType === 'group') {
    if (form.value.groupIds && form.value.groupIds.length > 0) {
      form.value.groupId = form.value.groupIds[0]
    } else {
      form.value.groupId = ''
    }
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

    // Setup Token模式也需要确保生成客户端ID
    if (form.value.useUnifiedClientId && !form.value.unifiedClientId) {
      form.value.unifiedClientId = generateClientId()
    }

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
    // OAuth模式也需要确保生成客户端ID
    if (
      form.value.platform === 'claude' &&
      form.value.useUnifiedClientId &&
      !form.value.unifiedClientId
    ) {
      form.value.unifiedClientId = generateClientId()
    }

    const data = {
      name: form.value.name,
      description: form.value.description,
      accountType: form.value.accountType,
      groupId: form.value.accountType === 'group' ? form.value.groupId : undefined,
      groupIds: form.value.accountType === 'group' ? form.value.groupIds : undefined,
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
      data.autoStopOnWarning = form.value.autoStopOnWarning || false
      data.useUnifiedUserAgent = form.value.useUnifiedUserAgent || false
      data.useUnifiedClientId = form.value.useUnifiedClientId || false
      data.unifiedClientId = form.value.unifiedClientId || ''
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
    // 显示详细的错误信息
    const errorMessage = error.response?.data?.error || error.message || '账户创建失败'
    const suggestion = error.response?.data?.suggestion || ''
    const errorDetails = error.response?.data?.errorDetails || null

    // 构建完整的错误提示
    let fullMessage = errorMessage
    if (suggestion) {
      fullMessage += `\n${suggestion}`
    }

    // 如果有详细的 OAuth 错误信息，也显示出来
    if (errorDetails && errorDetails.error_description) {
      fullMessage += `\n详细信息: ${errorDetails.error_description}`
    } else if (errorDetails && errorDetails.error && errorDetails.error.message) {
      // 处理 OpenAI 格式的错误
      fullMessage += `\n详细信息: ${errorDetails.error.message}`
    }

    showToast(fullMessage, 'error', '', 8000)

    // 错误已通过 toast 显示给用户
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
  }

  // CCR (Claude Code Router) 验证 - 使用与 Claude Console 相同的字段
  if (form.value.platform === 'ccr') {
    if (!form.value.apiUrl || form.value.apiUrl.trim() === '') {
      errors.value.apiUrl = '请填写 API URL'
      hasError = true
    }
    if (!form.value.apiKey || form.value.apiKey.trim() === '') {
      errors.value.apiKey = '请填写 API Key'
      hasError = true
    }
  }

  // OpenAI-Responses 验证
  if (form.value.platform === 'openai-responses') {
    if (!form.value.baseApi || form.value.baseApi.trim() === '') {
      errors.value.baseApi = '请填写 API 基础地址'
      hasError = true
    }
    if (!form.value.apiKey || form.value.apiKey.trim() === '') {
      errors.value.apiKey = '请填写 API 密钥'
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
  } else if (form.value.platform === 'azure_openai') {
    // Azure OpenAI 验证
    if (!form.value.azureEndpoint || form.value.azureEndpoint.trim() === '') {
      errors.value.azureEndpoint = '请填写 Azure Endpoint'
      hasError = true
    }
    if (!form.value.deploymentName || form.value.deploymentName.trim() === '') {
      errors.value.deploymentName = '请填写部署名称'
      hasError = true
    }
    if (!form.value.apiKey || form.value.apiKey.trim() === '') {
      errors.value.apiKey = '请填写 API Key'
      hasError = true
    }
  } else if (form.value.addType === 'manual') {
    // 手动模式验证 - 只有部分平台需要验证 Token
    if (form.value.platform === 'openai') {
      // OpenAI 平台必须有 Refresh Token
      if (!form.value.refreshToken || form.value.refreshToken.trim() === '') {
        errors.value.refreshToken = '请填写 Refresh Token'
        hasError = true
      }
      // Access Token 可选，如果没有会通过 Refresh Token 获取
    } else if (form.value.platform === 'gemini') {
      // Gemini 平台需要 Access Token
      if (!form.value.accessToken || form.value.accessToken.trim() === '') {
        errors.value.accessToken = '请填写 Access Token'
        hasError = true
      }
    } else if (form.value.platform === 'claude') {
      // Claude 平台需要 Access Token
      if (!form.value.accessToken || form.value.accessToken.trim() === '') {
        errors.value.accessToken = '请填写 Access Token'
        hasError = true
      }
    }
    // Claude Console、CCR、OpenAI-Responses 等其他平台不需要 Token 验证
  }

  // 分组类型验证 - 创建账户流程修复
  if (
    form.value.accountType === 'group' &&
    (!form.value.groupIds || form.value.groupIds.length === 0)
  ) {
    showToast('请选择一个分组', 'error')
    hasError = true
  }

  // 数据同步：确保 groupId 和 groupIds 保持一致 - 创建流程
  if (form.value.accountType === 'group') {
    if (form.value.groupIds && form.value.groupIds.length > 0) {
      form.value.groupId = form.value.groupIds[0]
    } else {
      form.value.groupId = ''
    }
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
      groupIds: form.value.accountType === 'group' ? form.value.groupIds : undefined,
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

      // 手动模式也需要确保生成客户端ID
      if (form.value.useUnifiedClientId && !form.value.unifiedClientId) {
        form.value.unifiedClientId = generateClientId()
      }

      data.claudeAiOauth = {
        accessToken: form.value.accessToken,
        refreshToken: form.value.refreshToken || '',
        expiresAt: Date.now() + expiresInMs,
        scopes: [] // 手动添加没有 scopes
      }
      data.priority = form.value.priority || 50
      data.autoStopOnWarning = form.value.autoStopOnWarning || false
      data.useUnifiedUserAgent = form.value.useUnifiedUserAgent || false
      data.useUnifiedClientId = form.value.useUnifiedClientId || false
      data.unifiedClientId = form.value.unifiedClientId || ''
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
        idToken: '', // 不再需要用户输入，系统会自动获取
        accessToken: form.value.accessToken || '', // Access Token 可选
        refreshToken: form.value.refreshToken, // Refresh Token 必填
        expires_in: Math.floor(expiresInMs / 1000) // 转换为秒
      }

      // 账户信息将在首次刷新时自动获取
      data.accountInfo = {
        accountId: '',
        chatgptUserId: '',
        organizationId: '',
        organizationRole: '',
        organizationTitle: '',
        planType: '',
        email: '',
        emailVerified: false
      }

      // OpenAI 手动模式必须刷新以获取完整信息（包括 ID Token）
      data.needsImmediateRefresh = true
      data.requireRefreshSuccess = true // 必须刷新成功才能创建账户
      data.priority = form.value.priority || 50
    } else if (form.value.platform === 'claude-console' || form.value.platform === 'ccr') {
      // Claude Console 和 CCR 账户特定数据（CCR 使用 Claude Console 的后端逻辑）
      data.apiUrl = form.value.apiUrl
      data.apiKey = form.value.apiKey
      data.priority = form.value.priority || 50
      data.supportedModels = convertMappingsToObject() || {}
      data.userAgent = form.value.userAgent || null
      // 如果不启用限流，传递 0 表示不限流
      data.rateLimitDuration = form.value.enableRateLimit ? form.value.rateLimitDuration || 60 : 0
      // 额度管理字段
      data.dailyQuota = form.value.dailyQuota || 0
      data.quotaResetTime = form.value.quotaResetTime || '00:00'
    } else if (form.value.platform === 'openai-responses') {
      // OpenAI-Responses 账户特定数据
      data.baseApi = form.value.baseApi
      data.apiKey = form.value.apiKey
      data.userAgent = form.value.userAgent || ''
      data.priority = form.value.priority || 50
      data.rateLimitDuration = 60 // 默认值60，不从用户输入获取
      data.dailyQuota = form.value.dailyQuota || 0
      data.quotaResetTime = form.value.quotaResetTime || '00:00'
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
    } else if (form.value.platform === 'azure_openai') {
      // Azure OpenAI 账户特定数据
      data.azureEndpoint = form.value.azureEndpoint
      data.apiKey = form.value.apiKey
      data.apiVersion = form.value.apiVersion || '2024-02-01'
      data.deploymentName = form.value.deploymentName
      data.supportedModels = Array.isArray(form.value.supportedModels)
        ? form.value.supportedModels
        : []
      data.priority = form.value.priority || 50
      data.isActive = form.value.isActive !== false
      data.schedulable = form.value.schedulable !== false
    }

    let result
    if (form.value.platform === 'claude') {
      result = await accountsStore.createClaudeAccount(data)
    } else if (form.value.platform === 'claude-console' || form.value.platform === 'ccr') {
      // CCR 使用 Claude Console 的后端 API
      result = await accountsStore.createClaudeConsoleAccount(data)
    } else if (form.value.platform === 'openai-responses') {
      result = await accountsStore.createOpenAIResponsesAccount(data)
    } else if (form.value.platform === 'bedrock') {
      result = await accountsStore.createBedrockAccount(data)
    } else if (form.value.platform === 'openai') {
      result = await accountsStore.createOpenAIAccount(data)
    } else if (form.value.platform === 'azure_openai') {
      result = await accountsStore.createAzureOpenAIAccount(data)
    } else if (form.value.platform === 'gemini') {
      result = await accountsStore.createGeminiAccount(data)
    } else {
      throw new Error(`不支持的平台: ${form.value.platform}`)
    }

    emit('success', result)
  } catch (error) {
    // 显示详细的错误信息
    const errorMessage = error.response?.data?.error || error.message || '账户创建失败'
    const suggestion = error.response?.data?.suggestion || ''
    const errorDetails = error.response?.data?.errorDetails || null

    // 构建完整的错误提示
    let fullMessage = errorMessage
    if (suggestion) {
      fullMessage += `\n${suggestion}`
    }

    // 如果有详细的 OAuth 错误信息，也显示出来
    if (errorDetails && errorDetails.error_description) {
      fullMessage += `\n详细信息: ${errorDetails.error_description}`
    } else if (errorDetails && errorDetails.error && errorDetails.error.message) {
      // 处理 OpenAI 格式的错误
      fullMessage += `\n详细信息: ${errorDetails.error.message}`
    }

    showToast(fullMessage, 'error', '', 8000)

    // 错误已通过 toast 显示给用户
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

  // 分组类型验证 - 更新账户流程修复
  if (
    form.value.accountType === 'group' &&
    (!form.value.groupIds || form.value.groupIds.length === 0)
  ) {
    showToast('请选择一个分组', 'error')
    return
  }

  // 数据同步：确保 groupId 和 groupIds 保持一致 - 更新流程
  if (form.value.accountType === 'group') {
    if (form.value.groupIds && form.value.groupIds.length > 0) {
      form.value.groupId = form.value.groupIds[0]
    } else {
      form.value.groupId = ''
    }
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
      groupIds: form.value.accountType === 'group' ? form.value.groupIds : undefined,
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
          idToken: '', // 不需要用户输入
          accessToken: form.value.accessToken || '',
          refreshToken: form.value.refreshToken || '',
          expires_in: Math.floor(expiresInMs / 1000) // 转换为秒
        }

        // 编辑 OpenAI 账户时，如果更新了 Refresh Token，也需要验证
        if (form.value.refreshToken && form.value.refreshToken !== props.account.refreshToken) {
          data.needsImmediateRefresh = true
          data.requireRefreshSuccess = true
        }
      }
    }

    if (props.account.platform === 'gemini') {
      data.projectId = form.value.projectId || ''
    }

    // Claude 官方账号优先级和订阅类型更新
    if (props.account.platform === 'claude') {
      // 更新模式也需要确保生成客户端ID
      if (form.value.useUnifiedClientId && !form.value.unifiedClientId) {
        form.value.unifiedClientId = generateClientId()
      }

      data.priority = form.value.priority || 50
      data.autoStopOnWarning = form.value.autoStopOnWarning || false
      data.useUnifiedUserAgent = form.value.useUnifiedUserAgent || false
      data.useUnifiedClientId = form.value.useUnifiedClientId || false
      data.unifiedClientId = form.value.unifiedClientId || ''
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
      // 额度管理字段
      data.dailyQuota = form.value.dailyQuota || 0
      data.quotaResetTime = form.value.quotaResetTime || '00:00'
    }

    // OpenAI-Responses 特定更新
    if (props.account.platform === 'openai-responses') {
      data.baseApi = form.value.baseApi
      if (form.value.apiKey) {
        data.apiKey = form.value.apiKey
      }
      data.userAgent = form.value.userAgent || ''
      data.priority = form.value.priority || 50
      // 编辑时不上传 rateLimitDuration，保持原值
      data.dailyQuota = form.value.dailyQuota || 0
      data.quotaResetTime = form.value.quotaResetTime || '00:00'
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

    // Azure OpenAI 特定更新
    if (props.account.platform === 'azure_openai') {
      data.azureEndpoint = form.value.azureEndpoint
      data.apiVersion = form.value.apiVersion || '2024-02-01'
      data.deploymentName = form.value.deploymentName
      data.supportedModels = Array.isArray(form.value.supportedModels)
        ? form.value.supportedModels
        : []
      data.priority = form.value.priority || 50
      // 只有当有新的 API Key 时才更新
      if (form.value.apiKey && form.value.apiKey.trim()) {
        data.apiKey = form.value.apiKey
      }
    }

    if (props.account.platform === 'claude') {
      await accountsStore.updateClaudeAccount(props.account.id, data)
    } else if (props.account.platform === 'claude-console') {
      await accountsStore.updateClaudeConsoleAccount(props.account.id, data)
    } else if (props.account.platform === 'openai-responses') {
      await accountsStore.updateOpenAIResponsesAccount(props.account.id, data)
    } else if (props.account.platform === 'bedrock') {
      await accountsStore.updateBedrockAccount(props.account.id, data)
    } else if (props.account.platform === 'openai') {
      await accountsStore.updateOpenAIAccount(props.account.id, data)
    } else if (props.account.platform === 'azure_openai') {
      await accountsStore.updateAzureOpenAIAccount(props.account.id, data)
    } else if (props.account.platform === 'gemini') {
      await accountsStore.updateGeminiAccount(props.account.id, data)
    } else {
      throw new Error(`不支持的平台: ${props.account.platform}`)
    }

    emit('success')
  } catch (error) {
    // 显示详细的错误信息
    const errorMessage = error.response?.data?.error || error.message || '账户更新失败'
    const suggestion = error.response?.data?.suggestion || ''
    const errorDetails = error.response?.data?.errorDetails || null

    // 构建完整的错误提示
    let fullMessage = errorMessage
    if (suggestion) {
      fullMessage += `\n${suggestion}`
    }

    // 如果有详细的 OAuth 错误信息，也显示出来
    if (errorDetails && errorDetails.error_description) {
      fullMessage += `\n详细信息: ${errorDetails.error_description}`
    } else if (errorDetails && errorDetails.error && errorDetails.error.message) {
      // 处理 OpenAI 格式的错误
      fullMessage += `\n详细信息: ${errorDetails.error.message}`
    }

    showToast(fullMessage, 'error', '', 8000)

    // 错误已通过 toast 显示给用户
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

// 监听Azure Endpoint变化，清除错误
watch(
  () => form.value.azureEndpoint,
  () => {
    if (errors.value.azureEndpoint && form.value.azureEndpoint?.trim()) {
      errors.value.azureEndpoint = ''
    }
  }
)

// 监听Deployment Name变化，清除错误
watch(
  () => form.value.deploymentName,
  () => {
    if (errors.value.deploymentName && form.value.deploymentName?.trim()) {
      errors.value.deploymentName = ''
    }
  }
)

// 分组相关数据
const groups = ref([])
const loadingGroups = ref(false)
const showGroupManagement = ref(false)

// 根据平台筛选分组
const filteredGroups = computed(() => {
  let platformFilter = form.value.platform
  // Claude Console 和 CCR 使用 Claude 分组
  if (form.value.platform === 'claude-console' || form.value.platform === 'ccr') {
    platformFilter = 'claude'
  }
  // OpenAI-Responses 使用 OpenAI 分组
  else if (form.value.platform === 'openai-responses') {
    platformFilter = 'openai'
  }
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

// 处理新建分组
const handleNewGroup = () => {
  showGroupManagement.value = true
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
    if (
      newPlatform === 'claude-console' ||
      newPlatform === 'ccr' ||
      newPlatform === 'bedrock' ||
      newPlatform === 'openai-responses'
    ) {
      form.value.addType = 'manual' // Claude Console、CCR、Bedrock 和 OpenAI-Responses 只支持手动模式
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
      form.value.groupIds = []
    }
  }
)

// 监听分组选择变化，保持 groupId 和 groupIds 同步
watch(
  () => form.value.groupIds,
  (newGroupIds) => {
    if (form.value.accountType === 'group') {
      if (newGroupIds && newGroupIds.length > 0) {
        // 如果有选中的分组，使用第一个作为主分组
        form.value.groupId = newGroupIds[0]
      } else {
        // 如果没有选中分组，清空主分组
        form.value.groupId = ''
      }
    }
  },
  { deep: true }
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
          // Successfully extracted authorization code from URL
        } else {
          // URL 中没有 code 参数
          showToast('URL 中未找到授权码参数，请检查链接是否正确', 'error')
        }
      } catch (error) {
        // URL 解析失败
        // Failed to parse URL
        showToast('链接格式错误，请检查是否为完整的 URL', 'error')
      }
    } else {
      // 错误的 URL（不是 localhost:45462 开头）
      showToast('请粘贴以 http://localhost:45462 开头的链接', 'error')
    }
  }
  // 如果不是 URL，保持原值（兼容直接输入授权码）
})

// 监听平台变化
watch(
  () => form.value.platform,
  (newPlatform) => {
    // 当选择 CCR 平台时，通知父组件
    if (!isEdit.value) {
      emit('platform-changed', newPlatform)
    }
  }
)

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
        autoStopOnWarning: newAccount.autoStopOnWarning || false,
        useUnifiedUserAgent: newAccount.useUnifiedUserAgent || false,
        useUnifiedClientId: newAccount.useUnifiedClientId || false,
        unifiedClientId: newAccount.unifiedClientId || '',
        groupId: groupId,
        groupIds: [],
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
          if (!models) return []
          // 处理对象格式（Claude Console 的新格式）
          if (typeof models === 'object' && !Array.isArray(models)) {
            return Object.keys(models)
          }
          // 处理数组格式（向后兼容）
          if (Array.isArray(models)) {
            return models
          }
          return []
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
        smallFastModel: newAccount.smallFastModel || '',
        // Azure OpenAI 特定字段
        azureEndpoint: newAccount.azureEndpoint || '',
        apiVersion: newAccount.apiVersion || '',
        deploymentName: newAccount.deploymentName || '',
        // OpenAI-Responses 特定字段
        baseApi: newAccount.baseApi || '',
        // 额度管理字段
        dailyQuota: newAccount.dailyQuota || 0,
        dailyUsage: newAccount.dailyUsage || 0,
        quotaResetTime: newAccount.quotaResetTime || '00:00'
      }

      // 如果是Claude Console账户，加载实时使用情况
      if (newAccount.platform === 'claude-console') {
        loadAccountUsage()
      }

      // 如果是分组类型，加载分组ID
      if (newAccount.accountType === 'group') {
        // 先加载分组列表
        loadGroups().then(async () => {
          const foundGroupIds = []

          // 如果账户有 groupInfo，直接使用它的 groupId
          if (newAccount.groupInfo && newAccount.groupInfo.id) {
            form.value.groupId = newAccount.groupInfo.id
            foundGroupIds.push(newAccount.groupInfo.id)
          } else if (newAccount.groupId) {
            // 如果账户有 groupId 字段，直接使用（OpenAI-Responses 等账户）
            form.value.groupId = newAccount.groupId
            foundGroupIds.push(newAccount.groupId)
          } else if (
            newAccount.groupIds &&
            Array.isArray(newAccount.groupIds) &&
            newAccount.groupIds.length > 0
          ) {
            // 如果账户有 groupIds 数组，使用它
            form.value.groupId = newAccount.groupIds[0]
            foundGroupIds.push(...newAccount.groupIds)
          } else {
            // 否则查找账户所属的分组
            const checkPromises = groups.value.map(async (group) => {
              try {
                const response = await apiClient.get(`/admin/account-groups/${group.id}/members`)
                const members = response.data || []
                if (members.some((m) => m.id === newAccount.id)) {
                  foundGroupIds.push(group.id)
                  if (!form.value.groupId) {
                    form.value.groupId = group.id // 设置第一个找到的分组作为主分组
                  }
                }
              } catch (error) {
                // 忽略错误
              }
            })

            await Promise.all(checkPromises)
          }

          // 设置多选分组
          form.value.groupIds = foundGroupIds
        })
      }
    }
  },
  { immediate: true }
)

// 获取统一 User-Agent 信息
const fetchUnifiedUserAgent = async () => {
  try {
    const response = await apiClient.get('/admin/claude-code-version')
    if (response.success && response.userAgent) {
      unifiedUserAgent.value = response.userAgent
    } else {
      unifiedUserAgent.value = ''
    }
  } catch (error) {
    // Failed to fetch unified User-Agent
    unifiedUserAgent.value = ''
  }
}

// 清除统一 User-Agent 缓存
const clearUnifiedCache = async () => {
  clearingCache.value = true
  try {
    const response = await apiClient.post('/admin/claude-code-version/clear')
    if (response.success) {
      unifiedUserAgent.value = ''
      showToast('统一User-Agent缓存已清除', 'success')
    } else {
      showToast('清除缓存失败', 'error')
    }
  } catch (error) {
    // Failed to clear unified User-Agent cache
    showToast('清除缓存失败：' + (error.message || '未知错误'), 'error')
  } finally {
    clearingCache.value = false
  }
}

// 生成客户端标识
const generateClientId = () => {
  // 生成64位十六进制字符串（32字节）
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

// 重新生成客户端标识
const regenerateClientId = () => {
  form.value.unifiedClientId = generateClientId()
  showToast('已生成新的客户端标识', 'success')
}

// 处理统一客户端标识复选框变化
const handleUnifiedClientIdChange = () => {
  if (form.value.useUnifiedClientId) {
    // 如果启用了统一客户端标识，自动启用统一User-Agent
    form.value.useUnifiedUserAgent = true
    // 如果没有客户端标识，自动生成一个
    if (!form.value.unifiedClientId) {
      form.value.unifiedClientId = generateClientId()
    }
  }
}

// 组件挂载时获取统一 User-Agent 信息
onMounted(() => {
  // 初始化平台分组
  platformGroup.value = determinePlatformGroup(form.value.platform)

  // 获取Claude Code统一User-Agent信息
  fetchUnifiedUserAgent()
  // 如果是编辑模式且是Claude Console账户，加载使用情况
  if (isEdit.value && props.account?.platform === 'claude-console') {
    loadAccountUsage()
  }
})

// 监听平台变化，当切换到Claude平台时获取统一User-Agent信息
watch(
  () => form.value.platform,
  (newPlatform) => {
    if (newPlatform === 'claude') {
      fetchUnifiedUserAgent()
    }
  }
)
</script>

<style scoped>
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-fadeIn {
  animation: fadeIn 0.3s ease-out;
}
</style>
