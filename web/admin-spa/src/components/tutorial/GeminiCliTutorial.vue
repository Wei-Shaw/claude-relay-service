<template>
  <div class="tutorial-section">
    <!-- 第一步：安装 Node.js -->
    <NodeInstallTutorial :platform="platform" :step-number="1" tool-name="Gemini CLI" />

    <!-- 第二步：配置环境变量 -->
    <div class="mb-4 sm:mb-10 sm:mb-6">
      <h4
        class="mb-3 flex items-center text-lg font-semibold text-gray-800 dark:text-gray-300 sm:mb-4 sm:text-xl"
      >
        <span
          class="mr-2 flex h-6 w-6 items-center justify-center rounded-full bg-green-500 text-xs font-bold text-white sm:mr-3 sm:h-8 sm:w-8 sm:text-sm"
          >2</span
        >
        配置 Gemini CLI 环境变量
      </h4>
      <p class="mb-3 text-sm text-gray-700 dark:text-gray-300 sm:mb-4 sm:text-base">
        设置以下环境变量以连接到中转服务：
      </p>

      <div class="space-y-4">
        <!-- Windows -->
        <template v-if="platform === 'windows'">
          <div
            class="rounded-lg border border-green-200 bg-white p-3 dark:border-green-700 dark:bg-gray-800 sm:p-4"
          >
            <h6 class="mb-2 text-sm font-medium text-gray-800 dark:text-gray-300 sm:text-base">
              PowerShell 设置方法
            </h6>
            <p class="mb-3 text-sm text-gray-600 dark:text-gray-400">
              在 PowerShell 中运行以下命令：
            </p>
            <div
              class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
            >
              <div class="whitespace-nowrap text-gray-300">
                $env:GOOGLE_GEMINI_BASE_URL = "{{ geminiBaseUrl }}"
              </div>
              <div class="whitespace-nowrap text-gray-300">$env:GEMINI_API_KEY = "你的API密钥"</div>
              <div class="whitespace-nowrap text-gray-300">
                $env:GEMINI_MODEL = "gemini-3.1-pro-preview"
              </div>
            </div>
            <p class="mt-2 text-xs text-yellow-700 dark:text-yellow-400">
              💡 使用与 Claude Code 相同的 API 密钥即可。
            </p>
          </div>

          <div
            class="rounded-lg border border-green-200 bg-white p-3 dark:border-green-700 dark:bg-gray-800 sm:p-4"
          >
            <h6 class="mb-2 text-sm font-medium text-gray-800 dark:text-gray-300 sm:text-base">
              PowerShell 永久设置（用户级）
            </h6>
            <p class="mb-3 text-sm text-gray-600 dark:text-gray-400">
              在 PowerShell 中运行以下命令：
            </p>
            <div
              class="mb-3 overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
            >
              <div class="mb-2"># 设置用户级环境变量（永久生效）</div>
              <div class="whitespace-nowrap text-gray-300">
                [System.Environment]::SetEnvironmentVariable("GOOGLE_GEMINI_BASE_URL", "{{
                  geminiBaseUrl
                }}", [System.EnvironmentVariableTarget]::User)
              </div>
              <div class="whitespace-nowrap text-gray-300">
                [System.Environment]::SetEnvironmentVariable("GEMINI_API_KEY", "你的API密钥",
                [System.EnvironmentVariableTarget]::User)
              </div>
              <div class="whitespace-nowrap text-gray-300">
                [System.Environment]::SetEnvironmentVariable("GEMINI_MODEL",
                "gemini-3.1-pro-preview", [System.EnvironmentVariableTarget]::User)
              </div>
            </div>
            <p class="mt-2 text-xs text-blue-700 dark:text-blue-300">
              💡 设置后需要重新打开 PowerShell 窗口才能生效。
            </p>
          </div>
        </template>

        <!-- macOS / Linux -->
        <template v-else>
          <div
            class="rounded-lg border border-green-200 bg-white p-3 dark:border-green-700 dark:bg-gray-800 sm:p-4"
          >
            <h6 class="mb-2 text-sm font-medium text-gray-800 dark:text-gray-300 sm:text-base">
              临时设置（当前会话）
            </h6>
            <p class="mb-3 text-sm text-gray-600 dark:text-gray-400">在终端中运行以下命令：</p>
            <div
              class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
            >
              <div class="whitespace-nowrap text-gray-300">
                export GOOGLE_GEMINI_BASE_URL="{{ geminiBaseUrl }}"
              </div>
              <div class="whitespace-nowrap text-gray-300">export GEMINI_API_KEY="你的API密钥"</div>
              <div class="whitespace-nowrap text-gray-300">
                export GEMINI_MODEL="gemini-3.1-pro-preview"
              </div>
            </div>
            <p class="mt-2 text-xs text-yellow-700 dark:text-yellow-400">
              💡 使用与 Claude Code 相同的 API 密钥即可。
            </p>
          </div>

          <div
            class="rounded-lg border border-green-200 bg-white p-3 dark:border-green-700 dark:bg-gray-800 sm:p-4"
          >
            <h6 class="mb-2 text-sm font-medium text-gray-800 dark:text-gray-300 sm:text-base">
              永久设置（Shell 配置文件）
            </h6>
            <p class="mb-3 text-sm text-gray-600 dark:text-gray-400">
              将以下内容添加到你的 shell 配置文件中（{{
                platform === 'macos' ? '~/.zshrc' : '~/.bashrc'
              }}）：
            </p>
            <div
              class="mb-3 overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
            >
              <div class="whitespace-nowrap text-gray-300">
                export GOOGLE_GEMINI_BASE_URL="{{ geminiBaseUrl }}"
              </div>
              <div class="whitespace-nowrap text-gray-300">export GEMINI_API_KEY="你的API密钥"</div>
              <div class="whitespace-nowrap text-gray-300">
                export GEMINI_MODEL="gemini-3.1-pro-preview"
              </div>
            </div>
            <p class="mb-3 text-sm text-gray-600 dark:text-gray-400">然后执行：</p>
            <div
              class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
            >
              <div class="whitespace-nowrap text-gray-300">
                source {{ platform === 'macos' ? '~/.zshrc' : '~/.bashrc' }}
              </div>
            </div>
          </div>
        </template>

        <!-- 验证 -->
        <div
          class="rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-500/40 dark:bg-green-950/30 sm:p-4"
        >
          <h6 class="mb-2 font-medium text-green-800 dark:text-green-300">
            验证 Gemini CLI 环境变量
          </h6>
          <p class="mb-3 text-sm text-green-700 dark:text-green-300">
            {{ platform === 'windows' ? '在 PowerShell 中验证：' : '在终端中验证：' }}
          </p>
          <div
            class="space-y-1 overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
          >
            <template v-if="platform === 'windows'">
              <div class="whitespace-nowrap text-gray-300">echo $env:GOOGLE_GEMINI_BASE_URL</div>
              <div class="whitespace-nowrap text-gray-300">echo $env:GEMINI_API_KEY</div>
              <div class="whitespace-nowrap text-gray-300">echo $env:GEMINI_MODEL</div>
            </template>
            <template v-else>
              <div class="whitespace-nowrap text-gray-300">echo $GOOGLE_GEMINI_BASE_URL</div>
              <div class="whitespace-nowrap text-gray-300">echo $GEMINI_API_KEY</div>
              <div class="whitespace-nowrap text-gray-300">echo $GEMINI_MODEL</div>
            </template>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useTutorialUrls } from '@/utils/useTutorialUrls'
import NodeInstallTutorial from './NodeInstallTutorial.vue'

defineProps({
  platform: {
    type: String,
    required: true,
    validator: (value) => ['windows', 'macos', 'linux'].includes(value)
  }
})

const { geminiBaseUrl } = useTutorialUrls()
</script>
