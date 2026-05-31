<template>
  <div class="space-y-6">
    <!-- Claude OAuth流程 -->
    <div v-if="platform === 'claude'">
      <div
        class="rounded-lg border border-blue-200 bg-blue-50 p-6 dark:border-blue-700 dark:bg-blue-900/30"
      >
        <div class="flex items-start gap-4">
          <div
            class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-blue-500"
          >
            <i class="fas fa-link text-white" />
          </div>
          <div class="flex-1">
            <h4 class="mb-3 font-semibold text-blue-900 dark:text-blue-200">
              {{ t('accountModals.oauth.title', { platform: 'Claude' }) }}
            </h4>

            <!-- 授权方式选择 -->
            <div class="mb-4">
              <label class="mb-2 block text-sm font-medium text-blue-800 dark:text-blue-300">
                {{ t('accountModals.oauth.selectAuthMethod') }}
              </label>
              <div class="flex gap-4">
                <label class="flex cursor-pointer items-center gap-2">
                  <input
                    v-model="authMethod"
                    class="text-blue-600 focus:ring-blue-500"
                    name="claude-auth-method"
                    type="radio"
                    value="manual"
                    @change="onAuthMethodChange"
                  />
                  <span class="text-sm text-blue-900 dark:text-blue-200">{{
                    t('accountModals.oauth.manualAuth')
                  }}</span>
                </label>
                <label class="flex cursor-pointer items-center gap-2">
                  <input
                    v-model="authMethod"
                    class="text-blue-600 focus:ring-blue-500"
                    name="claude-auth-method"
                    type="radio"
                    value="cookie"
                    @change="onAuthMethodChange"
                  />
                  <span class="text-sm text-blue-900 dark:text-blue-200">{{
                    t('accountModals.oauth.cookieAutoAuth')
                  }}</span>
                </label>
              </div>
            </div>

            <!-- Cookie自动授权表单 -->
            <div v-if="authMethod === 'cookie'" class="space-y-4">
              <div
                class="rounded-lg border border-blue-300 bg-white/80 p-4 dark:border-blue-600 dark:bg-gray-800/80"
              >
                <p class="mb-3 text-sm text-blue-700 dark:text-blue-300">
                  {{ t('accountModals.oauth.cookieDescription') }}
                </p>

                <!-- sessionKey输入 -->
                <div class="mb-4">
                  <label
                    class="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-300"
                  >
                    <i class="fas fa-cookie text-blue-500" />
                    sessionKey
                    <span
                      v-if="parsedSessionKeyCount > 1"
                      class="rounded-full bg-blue-500 px-2 py-0.5 text-xs text-white"
                    >
                      {{
                        t('accountModals.oauth.sessionKeyCount', { count: parsedSessionKeyCount })
                      }}
                    </span>
                    <button
                      class="text-blue-500 hover:text-blue-600"
                      type="button"
                      @click="showSessionKeyHelp = !showSessionKeyHelp"
                    >
                      <i class="fas fa-question-circle" />
                    </button>
                  </label>
                  <textarea
                    v-model="sessionKey"
                    class="form-input w-full resize-y font-mono text-sm"
                    :placeholder="t('accountModals.oauth.sessionKeyPlaceholder')"
                    rows="3"
                  />
                  <p
                    v-if="parsedSessionKeyCount > 1"
                    class="mt-1 text-xs text-blue-600 dark:text-blue-400"
                  >
                    <i class="fas fa-info-circle mr-1" />
                    {{
                      t('accountModals.oauth.batchCreateCount', { count: parsedSessionKeyCount })
                    }}
                  </p>
                </div>

                <!-- 帮助说明 -->
                <div
                  v-if="showSessionKeyHelp"
                  class="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-700 dark:bg-amber-900/30"
                >
                  <h5 class="mb-2 font-semibold text-amber-800 dark:text-amber-200">
                    <i class="fas fa-lightbulb mr-1" />{{
                      t('accountModals.oauth.howToGetSessionKey')
                    }}
                  </h5>
                  <ol
                    class="list-inside list-decimal space-y-1 text-xs text-amber-700 dark:text-amber-300"
                  >
                    <li v-html="t('accountModals.oauth.sessionKeyHelp.login')"></li>
                    <li>
                      {{ t('accountModals.oauth.sessionKeyHelp.press') }}
                      <kbd class="rounded bg-gray-200 px-1 dark:bg-gray-700">F12</kbd>
                      {{ t('accountModals.oauth.sessionKeyHelp.openDevTools') }}
                    </li>
                    <li v-html="t('accountModals.oauth.sessionKeyHelp.applicationTab')"></li>
                    <li>
                      <span v-html="t('accountModals.oauth.sessionKeyHelp.cookies')" />
                    </li>
                    <li v-html="t('accountModals.oauth.sessionKeyHelp.findSessionKey')"></li>
                    <li v-html="t('accountModals.oauth.sessionKeyHelp.copyValue')"></li>
                  </ol>
                  <p class="mt-2 text-xs text-amber-600 dark:text-amber-400">
                    <i class="fas fa-info-circle mr-1" />
                    {{ t('accountModals.oauth.sessionKeyUsuallyStarts') }}
                    <code class="rounded bg-gray-200 px-1 dark:bg-gray-700">sk-ant-sid01-</code>
                    {{ t('accountModals.oauth.startsWithSuffix') }}
                  </p>
                </div>

                <!-- 错误信息 -->
                <div
                  v-if="cookieAuthError"
                  class="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-700 dark:bg-red-900/30"
                >
                  <p class="text-sm text-red-600 dark:text-red-400">
                    <i class="fas fa-exclamation-circle mr-1" />
                    {{ cookieAuthError }}
                  </p>
                </div>

                <!-- 授权按钮 -->
                <button
                  class="btn btn-primary w-full px-4 py-3 text-base font-semibold"
                  :disabled="cookieAuthLoading || !sessionKey.trim()"
                  type="button"
                  @click="handleCookieAuth"
                >
                  <div v-if="cookieAuthLoading" class="loading-spinner mr-2" />
                  <i v-else class="fas fa-magic mr-2" />
                  <template v-if="cookieAuthLoading && batchProgress.total > 1">
                    {{
                      t('accountModals.oauth.authorizingProgress', {
                        current: batchProgress.current,
                        total: batchProgress.total
                      })
                    }}
                  </template>
                  <template v-else-if="cookieAuthLoading">
                    {{ t('accountModals.oauth.authorizing') }}
                  </template>
                  <template v-else> {{ t('accountModals.oauth.startAutoAuth') }} </template>
                </button>
              </div>
            </div>

            <!-- 手动授权流程 -->
            <div v-else>
              <p class="mb-4 text-sm text-blue-800 dark:text-blue-300">
                {{ t('accountModals.oauth.instructions', { platform: 'Claude' }) }}
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
                        {{ t('accountModals.oauth.generateLinkStep') }}
                      </p>
                      <button
                        v-if="!authUrl"
                        class="btn btn-primary px-4 py-2 text-sm"
                        :disabled="loading"
                        @click="generateAuthUrl"
                      >
                        <i v-if="!loading" class="fas fa-link mr-2" />
                        <div v-else class="loading-spinner mr-2" />
                        {{
                          loading
                            ? t('accountModals.oauth.generating')
                            : t('accountModals.oauth.generateAuthLink')
                        }}
                      </button>
                      <div v-else class="space-y-3">
                        <div class="flex items-center gap-2">
                          <input
                            class="form-input flex-1 bg-gray-50 font-mono text-xs dark:bg-gray-700"
                            readonly
                            type="text"
                            :value="authUrl"
                          />
                          <button
                            class="rounded-lg bg-gray-100 px-3 py-2 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600"
                            :title="t('accountModals.oauth.copyLink')"
                            @click="copyAuthUrl"
                          >
                            <i :class="copied ? 'fas fa-check text-green-500' : 'fas fa-copy'" />
                          </button>
                        </div>
                        <button
                          class="text-xs text-blue-600 hover:text-blue-700"
                          @click="regenerateAuthUrl"
                        >
                          <i class="fas fa-sync-alt mr-1" />{{
                            t('accountModals.oauth.regenerate')
                          }}
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
                        {{ t('accountModals.oauth.openLinkStep') }}
                      </p>
                      <p class="mb-2 text-sm text-blue-700 dark:text-blue-300">
                        {{ t('accountModals.oauth.openLinkDescription', { platform: 'Claude' }) }}
                      </p>
                      <div
                        class="rounded border border-yellow-300 bg-yellow-50 p-3 dark:border-yellow-700 dark:bg-yellow-900/30"
                      >
                        <p class="text-xs text-yellow-800 dark:text-yellow-300">
                          <i class="fas fa-exclamation-triangle mr-1" />
                          <strong>{{ t('accountModals.oauth.note') }}</strong
                          >{{ t('accountModals.oauth.proxyNote') }}
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
                        {{ t('accountModals.oauth.enterAuthorizationCode') }}
                      </p>
                      <p class="mb-3 text-sm text-blue-700 dark:text-blue-300">
                        {{ t('accountModals.oauth.codeDescriptionPrefix') }}
                        <strong>Authorization Code</strong
                        >{{ t('accountModals.oauth.codeDescriptionSuffix') }}
                      </p>
                      <div class="space-y-3">
                        <div>
                          <label
                            class="mb-2 block text-sm font-semibold text-gray-700 dark:text-gray-300"
                          >
                            <i class="fas fa-key mr-2 text-blue-500" />Authorization Code
                          </label>
                          <textarea
                            v-model="authCode"
                            class="form-input w-full resize-none font-mono text-sm"
                            :placeholder="
                              t('accountModals.oauth.codePlaceholder', { platform: 'Claude' })
                            "
                            rows="3"
                          />
                        </div>
                        <p class="mt-2 text-xs text-gray-500 dark:text-gray-400">
                          <i class="fas fa-info-circle mr-1" />
                          {{ t('accountModals.oauth.pasteCodeHelp', { platform: 'Claude' }) }}
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
    </div>

    <!-- Gemini OAuth流程 -->
    <div v-else-if="platform === 'gemini' || platform === 'gemini-antigravity'">
      <div
        class="rounded-lg border border-green-200 bg-green-50 p-6 dark:border-green-700 dark:bg-green-900/30"
      >
        <div class="flex items-start gap-4">
          <div
            class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-green-500"
          >
            <i class="fas fa-robot text-white" />
          </div>
          <div class="flex-1">
            <h4 class="mb-3 font-semibold text-green-900 dark:text-green-200">
              {{ t('accountModals.oauth.title', { platform: 'Gemini' }) }}
            </h4>
            <p class="mb-4 text-sm text-green-800 dark:text-green-300">
              {{ t('accountModals.oauth.instructions', { platform: 'Gemini' }) }}
            </p>

            <!-- 授权来源显示（由平台类型决定） -->
            <div class="mb-4">
              <p class="text-sm text-green-800 dark:text-green-300">
                <i class="fas fa-info-circle mr-1"></i>
                {{ t('accountModals.oauth.authType')
                }}<span class="font-semibold">{{
                  platform === 'gemini-antigravity' ? 'Antigravity OAuth' : 'Gemini CLI OAuth'
                }}</span>
              </p>
            </div>

            <div class="space-y-4">
              <!-- 步骤1: 生成授权链接 -->
              <div
                class="rounded-lg border border-green-300 bg-white/80 p-4 dark:border-green-600 dark:bg-gray-800/80"
              >
                <div class="flex items-start gap-3">
                  <div
                    class="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-green-600 text-xs font-bold text-white"
                  >
                    1
                  </div>
                  <div class="flex-1">
                    <p class="mb-2 font-medium text-green-900 dark:text-green-200">
                      {{ t('accountModals.oauth.generateLinkStep') }}
                    </p>
                    <button
                      v-if="!authUrl"
                      class="btn btn-primary px-4 py-2 text-sm"
                      :disabled="loading"
                      @click="generateAuthUrl"
                    >
                      <i v-if="!loading" class="fas fa-link mr-2" />
                      <div v-else class="loading-spinner mr-2" />
                      {{
                        loading
                          ? t('accountModals.oauth.generating')
                          : t('accountModals.oauth.generateAuthLink')
                      }}
                    </button>
                    <div v-else class="space-y-3">
                      <div class="flex items-center gap-2">
                        <input
                          class="form-input flex-1 bg-gray-50 font-mono text-xs dark:bg-gray-700"
                          readonly
                          type="text"
                          :value="authUrl"
                        />
                        <button
                          class="rounded-lg bg-gray-100 px-3 py-2 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600"
                          :title="t('accountModals.oauth.copyLink')"
                          @click="copyAuthUrl"
                        >
                          <i :class="copied ? 'fas fa-check text-green-500' : 'fas fa-copy'" />
                        </button>
                      </div>
                      <button
                        class="text-xs text-green-600 hover:text-green-700"
                        @click="regenerateAuthUrl"
                      >
                        <i class="fas fa-sync-alt mr-1" />{{ t('accountModals.oauth.regenerate') }}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <!-- 步骤2: 操作说明 -->
              <div
                class="rounded-lg border border-green-300 bg-white/80 p-4 dark:border-green-600 dark:bg-gray-800/80"
              >
                <div class="flex items-start gap-3">
                  <div
                    class="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-green-600 text-xs font-bold text-white"
                  >
                    2
                  </div>
                  <div class="flex-1">
                    <p class="mb-2 font-medium text-green-900 dark:text-green-200">
                      {{ t('accountModals.oauth.openLinkStep') }}
                    </p>
                    <p class="mb-2 text-sm text-green-700 dark:text-green-300">
                      {{ t('accountModals.oauth.openLinkDescription', { platform: 'Gemini' }) }}
                    </p>
                    <div
                      class="rounded border border-yellow-300 bg-yellow-50 p-3 dark:border-yellow-700 dark:bg-yellow-900/30"
                    >
                      <p class="text-xs text-yellow-800 dark:text-yellow-300">
                        <i class="fas fa-exclamation-triangle mr-1" />
                        <strong>{{ t('accountModals.oauth.note') }}</strong
                        >{{ t('accountModals.oauth.proxyNote') }}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <!-- 步骤3: 输入授权码 -->
              <div
                class="rounded-lg border border-green-300 bg-white/80 p-4 dark:border-green-600 dark:bg-gray-800/80"
              >
                <div class="flex items-start gap-3">
                  <div
                    class="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-green-600 text-xs font-bold text-white"
                  >
                    3
                  </div>
                  <div class="flex-1">
                    <p class="mb-2 font-medium text-green-900 dark:text-green-200">
                      {{ t('accountModals.oauth.enterAuthorizationCode') }}
                    </p>
                    <p class="mb-3 text-sm text-green-700 dark:text-green-300">
                      {{ t('accountModals.oauth.codeDescriptionPlain') }}
                    </p>
                    <div class="space-y-3">
                      <div>
                        <label
                          class="mb-2 block text-sm font-semibold text-gray-700 dark:text-gray-300"
                        >
                          <i class="fas fa-key mr-2 text-green-500" />Authorization Code
                        </label>
                        <textarea
                          v-model="authCode"
                          class="form-input w-full resize-none font-mono text-sm"
                          :placeholder="
                            t('accountModals.oauth.codePlaceholder', { platform: 'Gemini' })
                          "
                          rows="3"
                        />
                      </div>
                      <div class="mt-2 space-y-1">
                        <p class="text-xs text-gray-600 dark:text-gray-400">
                          <i class="fas fa-check-circle mr-1 text-green-500" />
                          {{ t('accountModals.oauth.pasteCodeHelp', { platform: 'Gemini' }) }}
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
    </div>

    <!-- OpenAI OAuth流程 -->
    <div v-else-if="platform === 'openai'">
      <div
        class="rounded-lg border border-orange-200 bg-orange-50 p-6 dark:border-orange-700 dark:bg-orange-900/30"
      >
        <div class="flex items-start gap-4">
          <div
            class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-orange-500"
          >
            <i class="fas fa-brain text-white" />
          </div>
          <div class="flex-1">
            <h4 class="mb-3 font-semibold text-orange-900 dark:text-orange-200">
              {{ t('accountModals.oauth.title', { platform: 'OpenAI' }) }}
            </h4>
            <p class="mb-4 text-sm text-orange-800 dark:text-orange-300">
              {{ t('accountModals.oauth.instructions', { platform: 'OpenAI' }) }}
            </p>

            <div class="space-y-4">
              <!-- 步骤1: 生成授权链接 -->
              <div
                class="rounded-lg border border-orange-300 bg-white/80 p-4 dark:border-orange-600 dark:bg-gray-800/80"
              >
                <div class="flex items-start gap-3">
                  <div
                    class="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-orange-600 text-xs font-bold text-white"
                  >
                    1
                  </div>
                  <div class="flex-1">
                    <p class="mb-2 font-medium text-orange-900 dark:text-orange-200">
                      {{ t('accountModals.oauth.generateLinkStep') }}
                    </p>
                    <button
                      v-if="!authUrl"
                      class="btn btn-primary px-4 py-2 text-sm"
                      :disabled="loading"
                      @click="generateAuthUrl"
                    >
                      <i v-if="!loading" class="fas fa-link mr-2" />
                      <div v-else class="loading-spinner mr-2" />
                      {{
                        loading
                          ? t('accountModals.oauth.generating')
                          : t('accountModals.oauth.generateAuthLink')
                      }}
                    </button>
                    <div v-else class="space-y-3">
                      <div class="flex items-center gap-2">
                        <input
                          class="form-input flex-1 bg-gray-50 font-mono text-xs dark:bg-gray-700"
                          readonly
                          type="text"
                          :value="authUrl"
                        />
                        <button
                          class="rounded-lg bg-gray-100 px-3 py-2 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600"
                          :title="t('accountModals.oauth.copyLink')"
                          @click="copyAuthUrl"
                        >
                          <i :class="copied ? 'fas fa-check text-green-500' : 'fas fa-copy'" />
                        </button>
                      </div>
                      <button
                        class="text-xs text-orange-600 hover:text-orange-700"
                        @click="regenerateAuthUrl"
                      >
                        <i class="fas fa-sync-alt mr-1" />{{ t('accountModals.oauth.regenerate') }}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <!-- 步骤2: 访问链接并授权 -->
              <div
                class="rounded-lg border border-orange-300 bg-white/80 p-4 dark:border-orange-600 dark:bg-gray-800/80"
              >
                <div class="flex items-start gap-3">
                  <div
                    class="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-orange-600 text-xs font-bold text-white"
                  >
                    2
                  </div>
                  <div class="flex-1">
                    <p class="mb-2 font-medium text-orange-900 dark:text-orange-200">
                      {{ t('accountModals.oauth.openLinkStep') }}
                    </p>
                    <p class="mb-2 text-sm text-orange-700 dark:text-orange-300">
                      {{ t('accountModals.oauth.openLinkDescription', { platform: 'OpenAI' }) }}
                    </p>
                    <div
                      class="mb-3 rounded border border-amber-300 bg-amber-50 p-3 dark:border-amber-700 dark:bg-amber-900/30"
                    >
                      <p class="text-xs text-amber-800 dark:text-amber-300">
                        <i class="fas fa-clock mr-1" />
                        <strong>{{ t('accountModals.oauth.importantTip') }}</strong
                        >{{ t('accountModals.oauth.openaiWaitTip') }}
                      </p>
                      <p class="mt-2 text-xs text-amber-700 dark:text-amber-400">
                        {{ t('accountModals.oauth.openaiAddressBefore') }}
                        <strong class="font-mono">http://localhost:1455/...</strong>
                        {{ t('accountModals.oauth.openaiAddressAfter') }}
                      </p>
                    </div>
                    <div
                      class="rounded border border-yellow-300 bg-yellow-50 p-3 dark:border-yellow-700 dark:bg-yellow-900/30"
                    >
                      <p class="text-xs text-yellow-800 dark:text-yellow-300">
                        <i class="fas fa-exclamation-triangle mr-1" />
                        <strong>{{ t('accountModals.oauth.note') }}</strong
                        >{{ t('accountModals.oauth.proxyNote') }}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <!-- 步骤3: 输入授权码 -->
              <div
                class="rounded-lg border border-orange-300 bg-white/80 p-4 dark:border-orange-600 dark:bg-gray-800/80"
              >
                <div class="flex items-start gap-3">
                  <div
                    class="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-orange-600 text-xs font-bold text-white"
                  >
                    3
                  </div>
                  <div class="flex-1">
                    <p class="mb-2 font-medium text-orange-900 dark:text-orange-200">
                      {{ t('accountModals.oauth.enterAuthLinkOrCode') }}
                    </p>
                    <p class="mb-3 text-sm text-orange-700 dark:text-orange-300">
                      {{ t('accountModals.oauth.openaiCodeInstructionBefore') }}
                      <strong class="font-mono">http://localhost:1455/...</strong
                      >{{ t('accountModals.oauth.openaiCodeInstructionAfter') }}
                    </p>
                    <div class="space-y-3">
                      <div>
                        <label
                          class="mb-2 block text-sm font-semibold text-gray-700 dark:text-gray-300"
                        >
                          <i class="fas fa-link mr-2 text-orange-500" />{{
                            t('accountModals.oauth.authLinkOrCode')
                          }}
                        </label>
                        <textarea
                          v-model="authCode"
                          class="form-input w-full resize-none font-mono text-sm"
                          :placeholder="t('accountModals.oauth.openaiCodePlaceholder')"
                          rows="3"
                        />
                      </div>
                      <div
                        class="rounded border border-blue-300 bg-blue-50 p-2 dark:border-blue-700 dark:bg-blue-900/30"
                      >
                        <p class="text-xs text-blue-700 dark:text-blue-300">
                          <i class="fas fa-lightbulb mr-1" />
                          <strong>{{ t('accountModals.oauth.tip') }}</strong
                          >{{ t('accountModals.oauth.openaiCodeTip') }}
                        </p>
                        <p class="mt-1 text-xs text-blue-600 dark:text-blue-400">
                          {{ t('accountModals.oauth.fullLinkExample')
                          }}<span class="font-mono"
                            >http://localhost:1455/auth/callback?code=ac_4hm8...</span
                          >
                        </p>
                        <p class="text-xs text-blue-600">
                          {{ t('accountModals.oauth.codeOnlyExample')
                          }}<span class="font-mono">ac_4hm8iqmx9A2fzMy_cwye7U3W7...</span>
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
    </div>

    <!-- Droid OAuth流程 -->
    <div v-else-if="platform === 'droid'">
      <div
        class="rounded-lg border border-cyan-200 bg-cyan-50 p-6 dark:border-cyan-700 dark:bg-cyan-900/30"
      >
        <div class="flex items-start gap-4">
          <div
            class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-cyan-500"
          >
            <i class="fas fa-robot text-white" />
          </div>
          <div class="flex-1">
            <h4 class="mb-3 font-semibold text-cyan-900 dark:text-cyan-200">
              {{ t('accountModals.oauth.title', { platform: 'Droid' }) }}
            </h4>
            <p class="mb-4 text-sm text-cyan-800 dark:text-cyan-300">
              {{ t('accountModals.oauth.instructions', { platform: 'Factory (Droid)' }) }}
            </p>

            <div class="space-y-4">
              <!-- 步骤1: 生成授权链接 -->
              <div
                class="rounded-lg border border-cyan-300 bg-white/80 p-4 dark:border-cyan-600 dark:bg-gray-800/80"
              >
                <div class="flex items-start gap-3">
                  <div
                    class="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-cyan-600 text-xs font-bold text-white"
                  >
                    1
                  </div>
                  <div class="flex-1">
                    <p class="mb-2 font-medium text-cyan-900 dark:text-cyan-200">
                      {{ t('accountModals.oauth.generateLinkStep') }}
                    </p>
                    <button
                      v-if="!authUrl"
                      class="btn btn-primary px-4 py-2 text-sm"
                      :disabled="loading"
                      @click="generateAuthUrl"
                    >
                      <i v-if="!loading" class="fas fa-link mr-2" />
                      <div v-else class="loading-spinner mr-2" />
                      {{
                        loading
                          ? t('accountModals.oauth.generating')
                          : t('accountModals.oauth.generateAuthLink')
                      }}
                    </button>
                    <div v-else class="space-y-4">
                      <div class="space-y-2">
                        <label class="text-xs font-semibold text-gray-600 dark:text-gray-300">{{
                          t('accountModals.oauth.authLink')
                        }}</label>
                        <div
                          class="flex flex-col gap-2 rounded-md border border-cyan-200 bg-white p-3 dark:border-cyan-700 dark:bg-gray-800"
                        >
                          <div class="flex items-center gap-2">
                            <input
                              class="form-input flex-1 bg-gray-50 font-mono text-xs dark:bg-gray-700"
                              readonly
                              type="text"
                              :value="authUrl"
                            />
                            <button
                              class="rounded-lg bg-gray-100 px-3 py-2 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600"
                              :title="t('accountModals.oauth.copyLink')"
                              @click="copyAuthUrl"
                            >
                              <i :class="copied ? 'fas fa-check text-green-500' : 'fas fa-copy'" />
                            </button>
                          </div>
                          <div class="flex flex-wrap items-center gap-2">
                            <button
                              class="inline-flex items-center gap-1 rounded-md border border-cyan-200 bg-white px-3 py-1.5 text-xs font-medium text-cyan-600 shadow-sm transition-colors hover:border-cyan-300 hover:bg-cyan-50 dark:border-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-200 dark:hover:border-cyan-500 dark:hover:bg-cyan-900/60"
                              @click="openVerificationPage"
                            >
                              <i class="fas fa-external-link-alt text-xs" />
                              {{ t('accountModals.oauth.openInNewTab') }}
                            </button>
                            <button
                              class="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium text-cyan-600 transition-colors hover:text-cyan-700 dark:text-cyan-300 dark:hover:text-cyan-200"
                              @click="regenerateAuthUrl"
                            >
                              <i class="fas fa-sync-alt text-xs" />{{
                                t('accountModals.oauth.regenerate')
                              }}
                            </button>
                          </div>
                        </div>
                      </div>
                      <div class="space-y-2">
                        <label class="text-xs font-semibold text-gray-600 dark:text-gray-300">{{
                          t('accountModals.oauth.userCode')
                        }}</label>
                        <div
                          class="flex items-center justify-between rounded-md border border-cyan-200 bg-cyan-50 px-4 py-3 dark:border-cyan-700 dark:bg-cyan-900/30"
                        >
                          <span
                            class="font-mono text-xl font-semibold text-cyan-700 dark:text-cyan-200"
                          >
                            {{ userCode || '------' }}
                          </span>
                          <button
                            class="rounded-lg bg-white px-3 py-1 text-sm text-cyan-600 transition-colors hover:bg-cyan-100 dark:bg-cyan-800 dark:text-cyan-200 dark:hover:bg-cyan-700"
                            @click="copyUserCode"
                          >
                            <i class="fas fa-copy mr-1" />{{ t('accountModals.oauth.copy') }}
                          </button>
                        </div>
                      </div>
                      <div
                        class="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400"
                      >
                        <span>
                          <i class="fas fa-hourglass-half mr-1 text-cyan-500" />
                          {{ t('accountModals.oauth.remainingValidity') }}: {{ formattedCountdown }}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- 步骤2: 访问链接并授权 -->
              <div
                class="rounded-lg border border-cyan-300 bg-white/80 p-4 dark:border-cyan-600 dark:bg-gray-800/80"
              >
                <div class="flex items-start gap-3">
                  <div
                    class="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-cyan-600 text-xs font-bold text-white"
                  >
                    2
                  </div>
                  <div class="flex-1">
                    <p class="mb-2 font-medium text-cyan-900 dark:text-cyan-200">
                      {{ t('accountModals.oauth.openLinkStep') }}
                    </p>
                    <div class="space-y-2 text-sm text-cyan-700 dark:text-cyan-300">
                      <p>
                        {{ t('accountModals.oauth.droidOpenDescription') }}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <!-- 步骤3: 输入授权结果 -->
              <div
                class="rounded-lg border border-cyan-300 bg-white/80 p-4 dark:border-cyan-600 dark:bg-gray-800/80"
              >
                <div class="flex items-start gap-3">
                  <div
                    class="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-cyan-600 text-xs font-bold text-white"
                  >
                    3
                  </div>
                  <div class="flex-1">
                    <p class="mb-2 font-medium text-cyan-900 dark:text-cyan-200">
                      {{ t('accountModals.oauth.droidFinishDescription') }}
                    </p>
                    <p class="text-xs text-gray-500 dark:text-gray-400">
                      {{ t('accountModals.oauth.droidPendingHelp') }}
                    </p>
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
        @click="$emit('back')"
      >
        {{ t('accountForm.modal.previous') }}
      </button>
      <!-- Cookie自动授权模式不显示此按钮（Claude平台） -->
      <button
        v-if="!(platform === 'claude' && authMethod === 'cookie')"
        class="btn btn-primary flex-1 px-6 py-3 font-semibold"
        :disabled="!canExchange || exchanging"
        type="button"
        @click="exchangeCode"
      >
        <div v-if="exchanging" class="loading-spinner mr-2" />
        {{
          exchanging ? t('accountModals.oauth.verifying') : t('accountModals.oauth.completeAuth')
        }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { showToast } from '@/utils/tools'
import { useAccountsStore } from '@/stores/accounts'

const props = defineProps({
  platform: {
    type: String,
    required: true
  },
  proxy: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['success', 'back'])

const accountsStore = useAccountsStore()
const { t } = useI18n()

// 状态
const loading = ref(false)
const exchanging = ref(false)
const authUrl = ref('')
const authCode = ref('')
const copied = ref(false)
// oauthProvider is now derived from platform prop
const geminiOauthProvider = computed(() => {
  if (props.platform === 'gemini-antigravity') {
    return 'antigravity'
  }
  return 'gemini-cli'
})
const sessionId = ref('') // 保存sessionId用于后续交换
const userCode = ref('')
const verificationUri = ref('')
const verificationUriComplete = ref('')
const remainingSeconds = ref(0)
let countdownTimer = null

// Cookie自动授权相关状态
const authMethod = ref('manual') // 'manual' | 'cookie'
const sessionKey = ref('')
const cookieAuthLoading = ref(false)
const cookieAuthError = ref('')
const showSessionKeyHelp = ref(false)
const batchProgress = ref({ current: 0, total: 0 }) // 批量进度

// 解析后的 sessionKey 数量
const parsedSessionKeyCount = computed(() => {
  return sessionKey.value
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.length > 0).length
})

// 计算是否可以交换code
const canExchange = computed(() => {
  if (props.platform === 'droid') {
    return !!sessionId.value
  }
  return authUrl.value && authCode.value.trim()
})

const formattedCountdown = computed(() => {
  if (!remainingSeconds.value || remainingSeconds.value <= 0) {
    return '00:00'
  }
  const minutes = Math.floor(remainingSeconds.value / 60)
  const seconds = remainingSeconds.value % 60
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
})

const startCountdown = (seconds) => {
  stopCountdown()
  if (!seconds || seconds <= 0) {
    remainingSeconds.value = 0
    return
  }

  remainingSeconds.value = Math.floor(seconds)
  countdownTimer = setInterval(() => {
    if (remainingSeconds.value <= 1) {
      remainingSeconds.value = 0
      stopCountdown()
    } else {
      remainingSeconds.value -= 1
    }
  }, 1000)
}

const stopCountdown = () => {
  if (countdownTimer) {
    clearInterval(countdownTimer)
    countdownTimer = null
  }
}

// 监听授权码输入，自动提取URL中的code参数
watch(authCode, (newValue) => {
  if (props.platform === 'droid') return
  if (!newValue || typeof newValue !== 'string') return

  const trimmedValue = newValue.trim()

  // 如果内容为空，不处理
  if (!trimmedValue) return

  // 检查是否是 URL 格式（包含 http:// 或 https://）
  const isUrl = trimmedValue.startsWith('http://') || trimmedValue.startsWith('https://')

  // 如果是 URL 格式
  if (isUrl) {
    // 检查是否是正确的 localhost 回调 URL
    if (
      trimmedValue.startsWith('http://localhost:45462') ||
      trimmedValue.startsWith('http://localhost:1455')
    ) {
      try {
        const url = new URL(trimmedValue)
        const code = url.searchParams.get('code')

        if (code) {
          // 成功提取授权码
          authCode.value = code
          showToast(t('accountModals.oauth.extractCodeSuccess'), 'success')
          console.log('Successfully extracted authorization code from URL')
        } else {
          // URL 中没有 code 参数
          showToast(t('accountModals.oauth.codeParamNotFound'), 'error')
        }
      } catch (error) {
        // URL 解析失败
        console.error('Failed to parse URL:', error)
        showToast(t('accountModals.oauth.invalidLinkFormat'), 'error')
      }
    } else if (
      props.platform === 'gemini' ||
      props.platform === 'gemini-antigravity' ||
      props.platform === 'openai'
    ) {
      // Gemini 和 OpenAI 平台可能使用不同的回调URL
      // 尝试从任何URL中提取code参数
      try {
        const url = new URL(trimmedValue)
        const code = url.searchParams.get('code')

        if (code) {
          authCode.value = code
          showToast(t('accountModals.oauth.extractCodeSuccess'), 'success')
        }
      } catch (error) {
        // 不是有效的URL，保持原值
      }
    } else {
      // 错误的 URL（不是正确的 localhost 回调地址）
      showToast(t('accountModals.oauth.invalidCallbackUrl'), 'error')
    }
  }
  // 如果不是 URL，保持原值（兼容直接输入授权码）
})

// 生成授权URL
const generateAuthUrl = async () => {
  stopCountdown()
  authUrl.value = ''
  authCode.value = ''
  userCode.value = ''
  verificationUri.value = ''
  verificationUriComplete.value = ''
  remainingSeconds.value = 0
  sessionId.value = ''
  copied.value = false
  loading.value = true
  try {
    const proxyConfig = props.proxy?.enabled
      ? {
          proxy: {
            type: props.proxy.type,
            host: props.proxy.host,
            port: parseInt(props.proxy.port),
            username: props.proxy.username || null,
            password: props.proxy.password || null
          }
        }
      : {}

    if (props.platform === 'claude') {
      const result = await accountsStore.generateClaudeAuthUrl(proxyConfig)
      authUrl.value = result.authUrl
      sessionId.value = result.sessionId
    } else if (props.platform === 'gemini' || props.platform === 'gemini-antigravity') {
      const result = await accountsStore.generateGeminiAuthUrl({
        ...proxyConfig,
        oauthProvider: geminiOauthProvider.value
      })
      authUrl.value = result.authUrl
      sessionId.value = result.sessionId
    } else if (props.platform === 'openai') {
      const result = await accountsStore.generateOpenAIAuthUrl(proxyConfig)
      authUrl.value = result.authUrl
      sessionId.value = result.sessionId
    } else if (props.platform === 'droid') {
      const result = await accountsStore.generateDroidAuthUrl(proxyConfig)
      authUrl.value = result.verificationUriComplete || result.verificationUri
      verificationUri.value = result.verificationUri
      verificationUriComplete.value = result.verificationUriComplete || result.verificationUri
      userCode.value = result.userCode
      startCountdown(result.expiresIn || 300)
      sessionId.value = result.sessionId
    }
  } catch (error) {
    showToast(error.message || t('accountModals.oauth.generateAuthLinkFailed'), 'error')
  } finally {
    loading.value = false
  }
}

// onGeminiOauthProviderChange removed - oauthProvider is now computed from platform

// 重新生成授权URL
const regenerateAuthUrl = () => {
  stopCountdown()
  authUrl.value = ''
  authCode.value = ''
  userCode.value = ''
  verificationUri.value = ''
  verificationUriComplete.value = ''
  remainingSeconds.value = 0
  sessionId.value = ''
  generateAuthUrl()
}

// 复制授权URL
const copyAuthUrl = async () => {
  if (!authUrl.value) {
    showToast(t('accountModals.oauth.generateLinkFirst'), 'warning')
    return
  }
  try {
    await navigator.clipboard.writeText(authUrl.value)
    copied.value = true
    showToast(t('accountModals.oauth.linkCopied'), 'success')
    setTimeout(() => {
      copied.value = false
    }, 2000)
  } catch (error) {
    // 降级方案
    const input = document.createElement('input')
    input.value = authUrl.value
    document.body.appendChild(input)
    input.select()
    document.execCommand('copy')
    document.body.removeChild(input)
    copied.value = true
    showToast(t('accountModals.oauth.linkCopied'), 'success')
    setTimeout(() => {
      copied.value = false
    }, 2000)
  }
}

const copyUserCode = async () => {
  if (!userCode.value) {
    showToast(t('accountModals.oauth.generateUserCodeFirst'), 'warning')
    return
  }
  try {
    await navigator.clipboard.writeText(userCode.value)
    showToast(t('accountModals.oauth.userCodeCopied'), 'success')
  } catch (error) {
    const input = document.createElement('input')
    input.value = userCode.value
    document.body.appendChild(input)
    input.select()
    document.execCommand('copy')
    document.body.removeChild(input)
    showToast(t('accountModals.oauth.userCodeCopied'), 'success')
  }
}

const openVerificationPage = () => {
  if (verificationUriComplete.value) {
    window.open(verificationUriComplete.value, '_blank', 'noopener')
  } else if (verificationUri.value) {
    window.open(verificationUri.value, '_blank', 'noopener')
  }
}

// 交换授权码
const exchangeCode = async () => {
  if (!canExchange.value) return

  exchanging.value = true
  try {
    let data = {}

    if (props.platform === 'claude') {
      // Claude使用sessionId和callbackUrl（即授权码）
      data = {
        sessionId: sessionId.value,
        callbackUrl: authCode.value.trim()
      }
    } else if (props.platform === 'gemini' || props.platform === 'gemini-antigravity') {
      // Gemini/Antigravity使用code和sessionId
      data = {
        code: authCode.value.trim(),
        sessionId: sessionId.value,
        oauthProvider: geminiOauthProvider.value
      }
    } else if (props.platform === 'openai') {
      // OpenAI使用code和sessionId
      data = {
        code: authCode.value.trim(),
        sessionId: sessionId.value
      }
    } else if (props.platform === 'droid') {
      data = {
        sessionId: sessionId.value
      }
    }

    // 添加代理配置（如果启用）
    if (props.proxy?.enabled) {
      data.proxy = {
        type: props.proxy.type,
        host: props.proxy.host,
        port: parseInt(props.proxy.port),
        username: props.proxy.username || null,
        password: props.proxy.password || null
      }
    }

    let tokenInfo
    if (props.platform === 'claude') {
      tokenInfo = await accountsStore.exchangeClaudeCode(data)
    } else if (props.platform === 'gemini' || props.platform === 'gemini-antigravity') {
      tokenInfo = await accountsStore.exchangeGeminiCode(data)
      // 附加 oauthProvider 信息到 tokenInfo
      if (tokenInfo) {
        tokenInfo.oauthProvider = geminiOauthProvider.value
      }
    } else if (props.platform === 'openai') {
      tokenInfo = await accountsStore.exchangeOpenAICode(data)
    } else if (props.platform === 'droid') {
      const response = await accountsStore.exchangeDroidCode(data)
      if (!response.success) {
        if (response.pending) {
          const message = response.message || t('accountModals.oauth.pendingMessage')
          showToast(message, 'info')
          if (typeof response.expiresIn === 'number' && response.expiresIn >= 0) {
            startCountdown(response.expiresIn)
          }
          return
        }
        throw new Error(response.message || t('accountModals.oauth.authFailedRetry'))
      }
      tokenInfo = response.data
      stopCountdown()
    }

    emit('success', tokenInfo)
  } catch (error) {
    showToast(error.message || t('accountModals.oauth.authFailedCheckCode'), 'error')
  } finally {
    exchanging.value = false
  }
}

onBeforeUnmount(() => {
  stopCountdown()
})

// Cookie自动授权处理（支持批量）
const handleCookieAuth = async () => {
  // 解析多行输入
  const sessionKeys = sessionKey.value
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)

  if (sessionKeys.length === 0) {
    cookieAuthError.value = t('accountModals.oauth.enterAtLeastOneSessionKey')
    return
  }

  cookieAuthLoading.value = true
  cookieAuthError.value = ''
  batchProgress.value = { current: 0, total: sessionKeys.length }

  // 构建代理配置
  const proxyConfig = props.proxy?.enabled
    ? {
        type: props.proxy.type,
        host: props.proxy.host,
        port: parseInt(props.proxy.port),
        username: props.proxy.username || null,
        password: props.proxy.password || null
      }
    : null

  const results = []
  const errors = []

  for (let i = 0; i < sessionKeys.length; i++) {
    batchProgress.value.current = i + 1
    try {
      const result = await accountsStore.oauthWithCookie({
        sessionKey: sessionKeys[i],
        proxy: proxyConfig
      })
      results.push(result)
    } catch (error) {
      errors.push({
        index: i + 1,
        key: sessionKeys[i].substring(0, 20) + '...',
        error: error.message
      })
    }
  }

  batchProgress.value = { current: 0, total: 0 }

  if (results.length > 0) {
    // emit 后父组件会调用 handleOAuthSuccess 创建账号
    // cookieAuthLoading 保持 true，成功后表单会关闭，失败时父组件会处理
    emit('success', results) // 返回数组（单个时也是数组）
    // 注意：不在这里设置 cookieAuthLoading = false
    // 父组件创建账号完成后表单会关闭/重置
  } else {
    // 全部授权失败时才恢复按钮状态
    cookieAuthLoading.value = false
  }

  if (errors.length > 0 && results.length === 0) {
    cookieAuthError.value = t('accountModals.oauth.allAuthFailed')
  } else if (errors.length > 0) {
    cookieAuthError.value = t('accountModals.oauth.partialAuthFailed', { count: errors.length })
  }
}

// 重置Cookie授权状态
const resetCookieAuth = () => {
  sessionKey.value = ''
  cookieAuthError.value = ''
  cookieAuthLoading.value = false
  batchProgress.value = { current: 0, total: 0 }
}

// 切换授权方式时重置状态
const onAuthMethodChange = () => {
  resetCookieAuth()
  authUrl.value = ''
  authCode.value = ''
  sessionId.value = ''
}

// 暴露方法供父组件调用
defineExpose({
  resetCookieAuth
})
</script>
