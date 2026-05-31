<template>
  <div class="tutorial-content">
    <!-- 第一步：安装 Node.js -->
    <NodeInstallTutorial :platform="platform" :step-number="1" tool-name="Claude Code" />

    <!-- 第二步：安装 Claude Code -->
    <div class="mb-4 sm:mb-10 sm:mb-6">
      <h4
        class="mb-3 flex items-center text-lg font-semibold text-gray-800 dark:text-gray-300 sm:mb-4 sm:text-xl"
      >
        <span
          class="mr-2 flex h-6 w-6 items-center justify-center rounded-full bg-green-500 text-xs font-bold text-white sm:mr-3 sm:h-8 sm:w-8 sm:text-sm"
          >2</span
        >
        {{ t('tutorial.auto.auto004') }}
      </h4>

      <div
        class="mb-4 rounded-xl border border-green-100 bg-gradient-to-r from-green-50 to-emerald-50 p-4 dark:border-green-500/40 dark:from-green-950/30 dark:to-emerald-950/30 sm:mb-6 sm:p-6"
      >
        <h5
          class="mb-2 flex items-center text-base font-semibold text-gray-800 dark:text-gray-200 sm:mb-3 sm:text-lg"
        >
          <i class="fas fa-download mr-2 text-green-600" /> {{ t('tutorial.auto.auto004') }}
        </h5>
        <p class="mb-3 text-sm text-gray-700 dark:text-gray-300 sm:mb-4 sm:text-base">
          {{
            t(
              platform === 'windows'
                ? 'tutorial.manual.openPowerShellOrCmd'
                : 'tutorial.manual.openTerminal'
            )
          }}{{ t('tutorial.auto.auto005') }}
        </p>
        <div
          class="mb-4 overflow-x-auto rounded-lg bg-gray-900 p-3 font-mono text-xs text-green-400 sm:p-4 sm:text-sm"
        >
          <div class="mb-2">{{ t('tutorial.auto.auto006') }}</div>
          <div class="whitespace-nowrap text-gray-300">
            {{
              platform === 'windows'
                ? 'npm install -g @anthropic-ai/claude-code'
                : 'sudo npm install -g @anthropic-ai/claude-code'
            }}
          </div>
        </div>
        <p class="text-sm text-gray-600 dark:text-gray-400">{{ t('tutorial.auto.auto007') }}</p>

        <div
          class="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-500/40 dark:bg-blue-950/30 sm:p-4"
        >
          <h6 class="mb-2 text-sm font-medium text-blue-800 dark:text-blue-300 sm:text-base">
            {{ t('tutorial.auto.auto008') }}
          </h6>
          <ul class="space-y-1 text-xs text-blue-700 dark:text-blue-300 sm:text-sm">
            <template v-if="platform === 'windows'">
              <li>{{ t('tutorial.auto.auto009') }}</li>
              <li>{{ t('tutorial.auto.auto010') }}</li>
            </template>
            <template v-else-if="platform === 'macos'">
              <li>{{ t('tutorial.auto.auto011') }}</li>
              <li>{{ t('tutorial.auto.auto012') }}</li>
            </template>
            <template v-else>
              <li>{{ t('tutorial.auto.auto013') }}</li>
              <li>{{ t('tutorial.auto.auto014') }}</li>
            </template>
          </ul>
        </div>
      </div>

      <!-- 验证安装 -->
      <div
        class="rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-500/40 dark:bg-green-950/30 sm:p-4"
      >
        <h6 class="mb-2 font-medium text-green-800 dark:text-green-300">
          {{ t('tutorial.auto.auto015') }}
        </h6>
        <p class="mb-3 text-sm text-green-700 dark:text-green-300">
          {{ t('tutorial.auto.auto016') }}
        </p>
        <div
          class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
        >
          <div class="whitespace-nowrap text-gray-300">claude --version</div>
        </div>
        <p class="mt-2 text-sm text-green-700 dark:text-green-300">
          {{ t('tutorial.auto.auto017') }}
        </p>
      </div>
    </div>

    <!-- 第三步：设置环境变量 -->
    <div class="mb-6 sm:mb-10">
      <h4
        class="mb-3 flex items-center text-lg font-semibold text-gray-800 dark:text-gray-300 sm:mb-4 sm:text-xl"
      >
        <span
          class="mr-2 flex h-6 w-6 items-center justify-center rounded-full bg-purple-500 text-xs font-bold text-white sm:mr-3 sm:h-8 sm:w-8 sm:text-sm"
          >3</span
        >
        {{ t('tutorial.auto.auto018') }}
      </h4>

      <div
        class="mb-4 rounded-xl border border-purple-100 bg-gradient-to-r from-purple-50 to-pink-50 p-4 dark:border-purple-500/40 dark:from-purple-950/30 dark:to-pink-950/30 sm:mb-6 sm:p-6"
      >
        <h5
          class="mb-2 flex items-center text-base font-semibold text-gray-800 dark:text-gray-200 sm:mb-3 sm:text-lg"
        >
          <i class="fas fa-cog mr-2 text-purple-600" /> {{ t('tutorial.auto.auto019') }}
        </h5>
        <p class="mb-3 text-sm text-gray-700 dark:text-gray-300 sm:mb-4 sm:text-base">
          {{ t('tutorial.auto.auto020') }}
        </p>

        <div class="space-y-4">
          <!-- Windows 环境变量设置 -->
          <template v-if="platform === 'windows'">
            <div
              class="rounded-lg border border-purple-200 bg-white p-3 dark:border-purple-700 dark:bg-gray-800 sm:p-4"
            >
              <h6 class="mb-2 text-sm font-medium text-gray-800 dark:text-gray-300 sm:text-base">
                {{ t('tutorial.auto.auto021') }}
              </h6>
              <p class="mb-3 text-sm text-gray-600 dark:text-gray-400">
                {{ t('tutorial.auto.auto022') }}
              </p>
              <div
                class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="whitespace-nowrap text-gray-300">
                  $env:ANTHROPIC_BASE_URL = "{{ currentBaseUrl }}"
                </div>
                <div class="whitespace-nowrap text-gray-300">{{ t('tutorial.auto.auto023') }}</div>
              </div>
              <p class="mt-2 text-xs text-yellow-700 dark:text-yellow-400">
                {{ t('tutorial.auto.auto024') }}
              </p>
            </div>

            <div
              class="rounded-lg border border-purple-200 bg-white p-3 dark:border-purple-700 dark:bg-gray-800 sm:p-4"
            >
              <h6 class="mb-2 text-sm font-medium text-gray-800 dark:text-gray-300 sm:text-base">
                {{ t('tutorial.auto.auto025') }}
              </h6>
              <p class="mb-3 text-sm text-gray-600 dark:text-gray-400">
                {{ t('tutorial.auto.auto026') }}
              </p>
              <div
                class="mb-3 overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="mb-2">{{ t('tutorial.auto.auto027') }}</div>
                <div class="whitespace-nowrap text-gray-300">
                  [System.Environment]::SetEnvironmentVariable("ANTHROPIC_BASE_URL", "{{
                    currentBaseUrl
                  }}", [System.EnvironmentVariableTarget]::User)
                </div>
                <div class="whitespace-nowrap text-gray-300">{{ t('tutorial.auto.auto028') }}</div>
              </div>
              <p class="mt-2 text-xs text-blue-700 dark:text-blue-300">
                {{ t('tutorial.auto.auto029') }}
              </p>
            </div>
          </template>

          <!-- macOS / Linux 环境变量设置 -->
          <template v-else>
            <div
              class="rounded-lg border border-purple-200 bg-white p-3 dark:border-purple-700 dark:bg-gray-800 sm:p-4"
            >
              <h6 class="mb-2 text-sm font-medium text-gray-800 dark:text-gray-300 sm:text-base">
                {{ t('tutorial.auto.auto030') }}
              </h6>
              <p class="mb-3 text-sm text-gray-600 dark:text-gray-400">
                {{ t('tutorial.auto.auto031') }}
              </p>
              <div
                class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="whitespace-nowrap text-gray-300">
                  export ANTHROPIC_BASE_URL="{{ currentBaseUrl }}"
                </div>
                <div class="whitespace-nowrap text-gray-300">{{ t('tutorial.auto.auto032') }}</div>
              </div>
              <p class="mt-2 text-xs text-yellow-700 dark:text-yellow-400">
                {{ t('tutorial.auto.auto024') }}
              </p>
            </div>

            <div
              class="rounded-lg border border-purple-200 bg-white p-3 dark:border-purple-700 dark:bg-gray-800 sm:p-4"
            >
              <h6 class="mb-2 text-sm font-medium text-gray-800 dark:text-gray-300 sm:text-base">
                {{ t('tutorial.auto.auto033') }}
              </h6>
              <p class="mb-3 text-sm text-gray-600 dark:text-gray-400">
                {{ t('tutorial.auto.auto034')
                }}{{ platform === 'macos' ? '~/.zshrc' : '~/.bashrc' }}）：
              </p>
              <div
                class="mb-3 overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="whitespace-nowrap text-gray-300">
                  export ANTHROPIC_BASE_URL="{{ currentBaseUrl }}"
                </div>
                <div class="whitespace-nowrap text-gray-300">{{ t('tutorial.auto.auto032') }}</div>
              </div>
              <p class="mb-3 text-sm text-gray-600 dark:text-gray-400">
                {{ t('tutorial.auto.auto035') }}
              </p>
              <div
                class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="whitespace-nowrap text-gray-300">
                  source {{ platform === 'macos' ? '~/.zshrc' : '~/.bashrc' }}
                </div>
              </div>
            </div>
          </template>
        </div>
      </div>

      <!-- VSCode 插件配置 -->
      <div
        class="mt-6 rounded-lg border border-indigo-200 bg-indigo-50 p-3 dark:border-indigo-500/40 dark:bg-indigo-950/30 sm:p-4"
      >
        <h6 class="mb-2 font-medium text-indigo-800 dark:text-indigo-300">
          {{ t('tutorial.auto.auto036') }}
        </h6>
        <p class="mb-3 text-sm text-indigo-700 dark:text-indigo-300">
          {{ t('tutorial.auto.auto037') }}
        </p>
        <div class="mb-3 space-y-2">
          <p class="text-sm text-indigo-700 dark:text-indigo-300">
            <strong>{{ t('tutorial.auto.auto038') }}</strong>
            <code class="rounded bg-indigo-100 px-1 dark:bg-indigo-900">{{
              platform === 'windows'
                ? `C:\\Users\\${t('tutorial.manual.yourUsername')}\\.claude\\config.json`
                : '~/.claude/config.json'
            }}</code>
          </p>
          <p class="text-xs text-indigo-600 dark:text-indigo-400">
            {{ t('tutorial.auto.auto039') }}
          </p>
        </div>
        <div
          class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
        >
          <div class="whitespace-nowrap text-gray-300">{</div>
          <div class="whitespace-nowrap text-gray-300">"primaryApiKey": "crs"</div>
          <div class="whitespace-nowrap text-gray-300">}</div>
        </div>
      </div>

      <!-- 验证环境变量设置 -->
      <div
        class="mt-6 rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-500/40 dark:bg-blue-950/30 sm:p-4"
      >
        <h6 class="mb-2 font-medium text-blue-800 dark:text-blue-300">
          {{ t('tutorial.auto.auto040') }}
        </h6>
        <p class="mb-3 text-sm text-blue-700 dark:text-blue-300">
          {{ t('tutorial.auto.auto041') }}
        </p>

        <div class="space-y-4">
          <div>
            <h6 class="mb-2 text-sm font-medium text-gray-800 dark:text-gray-300 sm:text-base">
              {{
                t(
                  platform === 'windows'
                    ? 'tutorial.manual.verifyInPowerShell'
                    : 'tutorial.manual.verifyInTerminal'
                )
              }}
            </h6>
            <div
              class="space-y-1 overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
            >
              <template v-if="platform === 'windows'">
                <div class="whitespace-nowrap text-gray-300">echo $env:ANTHROPIC_BASE_URL</div>
                <div class="whitespace-nowrap text-gray-300">echo $env:ANTHROPIC_AUTH_TOKEN</div>
              </template>
              <template v-else>
                <div class="whitespace-nowrap text-gray-300">echo $ANTHROPIC_BASE_URL</div>
                <div class="whitespace-nowrap text-gray-300">echo $ANTHROPIC_AUTH_TOKEN</div>
              </template>
            </div>
          </div>
        </div>

        <div class="mt-3 space-y-2">
          <p class="text-sm text-blue-700 dark:text-blue-300">
            <strong>{{ t('tutorial.auto.auto042') }}</strong>
          </p>
          <div class="rounded bg-gray-100 p-2 font-mono text-sm dark:bg-gray-700">
            <div>{{ currentBaseUrl }}</div>
            <div>cr_xxxxxxxxxxxxxxxxxx</div>
          </div>
          <p class="text-xs text-blue-700 dark:text-blue-300">{{ t('tutorial.auto.auto043') }}</p>
        </div>
      </div>
    </div>

    <!-- 第四步：开始使用 -->
    <div class="mb-6 sm:mb-8">
      <h4
        class="mb-3 flex items-center text-lg font-semibold text-gray-800 dark:text-gray-300 sm:mb-4 sm:text-xl"
      >
        <span
          class="mr-2 flex h-6 w-6 items-center justify-center rounded-full bg-orange-500 text-xs font-bold text-white sm:mr-3 sm:h-8 sm:w-8 sm:text-sm"
          >4</span
        >
        {{ t('tutorial.auto.auto044') }}
      </h4>
      <div
        class="rounded-xl border border-orange-100 bg-gradient-to-r from-orange-50 to-yellow-50 p-4 dark:border-orange-500/40 dark:from-orange-950/30 dark:to-yellow-950/30 sm:p-6"
      >
        <p class="mb-3 text-sm text-gray-700 dark:text-gray-300 sm:mb-4 sm:text-base">
          {{ t('tutorial.auto.auto045') }}
        </p>

        <div class="space-y-4">
          <div>
            <h6 class="mb-2 text-sm font-medium text-gray-800 dark:text-gray-300 sm:text-base">
              {{ t('tutorial.auto.auto046') }}
            </h6>
            <div
              class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
            >
              <div class="whitespace-nowrap text-gray-300">claude</div>
            </div>
          </div>

          <div>
            <h6 class="mb-2 text-sm font-medium text-gray-800 dark:text-gray-300 sm:text-base">
              {{ t('tutorial.auto.auto047') }}
            </h6>
            <div
              class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
            >
              <div class="mb-2">{{ t('tutorial.auto.auto048') }}</div>
              <div class="whitespace-nowrap text-gray-300">
                cd
                {{
                  platform === 'windows' ? 'C:\\path\\to\\your\\project' : '/path/to/your/project'
                }}
              </div>
              <div class="mb-2 mt-2">{{ t('tutorial.auto.auto049') }}</div>
              <div class="whitespace-nowrap text-gray-300">claude</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 故障排除 -->
    <div class="mb-8">
      <h4
        class="mb-3 flex items-center text-lg font-semibold text-gray-800 dark:text-gray-300 sm:mb-4 sm:text-xl"
      >
        <i class="fas fa-wrench mr-2 text-red-600 sm:mr-3" />
        {{ platformName }} {{ t('tutorial.auto.auto050') }}
      </h4>
      <div class="space-y-4">
        <details
          class="rounded-lg border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800"
        >
          <summary
            class="cursor-pointer p-3 text-sm font-medium text-gray-800 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700 sm:p-4 sm:text-base"
          >
            {{ t('tutorial.auto.auto051') }}
          </summary>
          <div class="px-3 pb-3 text-gray-600 dark:text-gray-400 sm:px-4 sm:pb-4">
            <p class="mb-2">{{ t('tutorial.auto.auto052') }}</p>
            <ul class="list-inside list-disc space-y-1 text-sm">
              <template v-if="platform === 'windows'">
                <li>{{ t('tutorial.auto.auto053') }}</li>
                <li>
                  {{ t('tutorial.auto.auto054')
                  }}<code class="rounded bg-gray-200 px-1 text-xs dark:bg-gray-700 sm:text-sm"
                    >npm config set prefix %APPDATA%\npm</code
                  >
                </li>
              </template>
              <template v-else>
                <li>{{ t('tutorial.auto.auto055') }}</li>
                <li>{{ t('tutorial.auto.auto056') }}</li>
              </template>
            </ul>
          </div>
        </details>

        <details
          v-if="platform === 'windows'"
          class="rounded-lg border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800"
        >
          <summary
            class="cursor-pointer p-3 text-sm font-medium text-gray-800 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700 sm:p-4 sm:text-base"
          >
            {{ t('tutorial.auto.auto057') }}
          </summary>
          <div class="px-3 pb-3 text-gray-600 dark:text-gray-400 sm:px-4 sm:pb-4">
            <p class="mb-2">{{ t('tutorial.auto.auto058') }}</p>
            <div
              class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
            >
              <div class="whitespace-nowrap text-gray-300">
                Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
              </div>
            </div>
          </div>
        </details>

        <details
          class="rounded-lg border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800"
        >
          <summary
            class="cursor-pointer p-3 text-sm font-medium text-gray-800 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700 sm:p-4 sm:text-base"
          >
            {{ t('tutorial.auto.auto059') }}
          </summary>
          <div class="px-3 pb-3 text-gray-600 dark:text-gray-400 sm:px-4 sm:pb-4">
            <p class="mb-2">{{ t('tutorial.auto.auto060') }}</p>
            <ul class="list-inside list-disc space-y-1 text-sm">
              <template v-if="platform === 'windows'">
                <li>{{ t('tutorial.auto.auto061') }}</li>
                <li>{{ t('tutorial.auto.auto062') }}</li>
                <li>
                  {{ t('tutorial.auto.auto063')
                  }}<code class="rounded bg-gray-200 px-1 text-xs dark:bg-gray-700 sm:text-sm"
                    >echo $env:ANTHROPIC_BASE_URL</code
                  >
                </li>
              </template>
              <template v-else>
                <li>{{ t('tutorial.auto.auto064') }}</li>
                <li>
                  {{ t('tutorial.auto.auto065') }}
                  <code class="rounded bg-gray-200 px-1 text-xs dark:bg-gray-700 sm:text-sm"
                    >source {{ platform === 'macos' ? '~/.zshrc' : '~/.bashrc' }}</code
                  >
                </li>
                <li>
                  {{ t('tutorial.auto.auto063')
                  }}<code class="rounded bg-gray-200 px-1 text-xs dark:bg-gray-700 sm:text-sm"
                    >echo $ANTHROPIC_BASE_URL</code
                  >
                </li>
              </template>
            </ul>
          </div>
        </details>

        <details
          v-if="platform === 'linux'"
          class="rounded-lg border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800"
        >
          <summary
            class="cursor-pointer p-3 text-sm font-medium text-gray-800 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700 sm:p-4 sm:text-base"
          >
            {{ t('tutorial.auto.auto066') }}
          </summary>
          <div class="px-3 pb-3 text-gray-600 dark:text-gray-400 sm:px-4 sm:pb-4">
            <p class="mb-2">{{ t('tutorial.auto.auto067') }}</p>
            <div
              class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
            >
              <div class="whitespace-nowrap text-gray-300">{{ t('tutorial.auto.auto068') }}</div>
            </div>
          </div>
        </details>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useTutorialUrls } from '@/utils/useTutorialUrls'
import NodeInstallTutorial from './NodeInstallTutorial.vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const props = defineProps({
  platform: {
    type: String,
    required: true,
    validator: (value) => ['windows', 'macos', 'linux'].includes(value)
  }
})

const { currentBaseUrl } = useTutorialUrls()

const platformName = computed(() => {
  const names = { windows: 'Windows', macos: 'macOS', linux: 'Linux / WSL2' }
  return names[props.platform]
})
</script>
