<template>
  <div class="tutorial-section">
    <!-- 第一步：安装 Node.js -->
    <NodeInstallTutorial :platform="platform" :step-number="1" tool-name="Codex" />

    <!-- 第二步：配置 Codex -->
    <div class="mb-4 sm:mb-10 sm:mb-6">
      <h4
        class="mb-3 flex items-center text-lg font-semibold text-gray-800 dark:text-gray-300 sm:mb-4 sm:text-xl"
      >
        <span
          class="mr-2 flex h-6 w-6 items-center justify-center rounded-full bg-indigo-500 text-xs font-bold text-white sm:mr-3 sm:h-8 sm:w-8 sm:text-sm"
          >2</span
        >
        {{ t('tutorial.auto.auto069') }}
      </h4>
      <p class="mb-3 text-sm text-gray-700 dark:text-gray-300 sm:mb-4 sm:text-base">
        {{ t('tutorial.auto.auto070') }}
      </p>

      <div class="space-y-4">
        <!-- config.toml 配置 -->
        <div
          class="rounded-lg border border-yellow-200 bg-yellow-50 p-3 dark:border-yellow-500/40 dark:bg-yellow-950/30 sm:p-4"
        >
          <h6 class="mb-2 font-medium text-yellow-800 dark:text-yellow-300">
            {{ t('tutorial.auto.auto071') }}
          </h6>
          <p class="mb-3 text-sm text-yellow-700 dark:text-yellow-300">
            {{ t('tutorial.auto.auto072') }}
            <code class="rounded bg-yellow-100 px-1 dark:bg-yellow-900">{{ configPath }}</code>
            {{ t('tutorial.auto.auto073') }}
          </p>
          <div
            class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
          >
            <div
              v-for="line in configTomlLines"
              :key="line"
              class="whitespace-nowrap text-gray-300"
              :class="{ 'mt-2': line === '' }"
            >
              {{ line || '&nbsp;' }}
            </div>
          </div>
          <p class="mt-3 text-sm text-yellow-600 dark:text-yellow-400">
            {{ t('tutorial.auto.auto074') }}
          </p>
          <div
            class="mt-2 overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
          >
            <div class="whitespace-nowrap text-gray-300">{{ configTomlWriteCmd }}</div>
          </div>
        </div>

        <!-- auth.json 配置 -->
        <div
          class="rounded-lg border border-orange-200 bg-orange-50 p-3 dark:border-orange-500/40 dark:bg-orange-950/30 sm:p-4"
        >
          <h6 class="mb-2 font-medium text-orange-800 dark:text-orange-300">
            {{ t('tutorial.auto.auto075') }}
          </h6>
          <p class="mb-3 text-sm text-orange-700 dark:text-orange-300">
            {{ t('tutorial.auto.auto072') }}
            <code class="rounded bg-orange-100 px-1 dark:bg-orange-900">{{ authPath }}</code>
            {{ t('tutorial.auto.auto076') }}
          </p>
          <div
            class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
          >
            <div class="whitespace-nowrap text-gray-300">{</div>
            <div class="whitespace-nowrap text-gray-300">
              &nbsp;&nbsp;{{ t('tutorial.auto.auto077') }}
            </div>
            <div class="whitespace-nowrap text-gray-300">}</div>
          </div>
          <div
            class="mt-3 rounded border border-red-200 bg-red-50 p-2 dark:border-red-500/40 dark:bg-red-950/30"
          ></div>
          <p class="mt-3 text-sm text-orange-600 dark:text-orange-400">
            {{ t('tutorial.auto.auto074') }}
          </p>
          <div
            class="mt-2 overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
          >
            <div class="whitespace-nowrap text-gray-300">{{ authJsonWriteCmd }}</div>
          </div>
        </div>

        <!-- 提示 -->
        <div
          class="rounded-lg border border-yellow-200 bg-yellow-50 p-3 dark:border-yellow-500/40 dark:bg-yellow-950/30 sm:p-4"
        >
          <p class="text-sm text-yellow-700 dark:text-yellow-300">
            {{ t('tutorial.auto.auto078') }}
            <code class="rounded bg-yellow-100 px-1 dark:bg-yellow-900">cr_xxxxxxxxxx</code>
            {{ t('tutorial.auto.auto079') }}
          </p>
        </div>
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

const { openaiBaseUrl } = useTutorialUrls()

const configPath = computed(() =>
  props.platform === 'windows' ? '%USERPROFILE%\\.codex\\config.toml' : '~/.codex/config.toml'
)

const authPath = computed(() =>
  props.platform === 'windows' ? '%USERPROFILE%\\.codex\\auth.json' : '~/.codex/auth.json'
)

const configTomlLines = computed(() => [
  'model_provider = "crs"',
  'model = "gpt-5-codex"',
  'model_reasoning_effort = "high"',
  'disable_response_storage = true',
  'preferred_auth_method = "apikey"',
  '',
  '[model_providers.crs]',
  'name = "crs"',
  `base_url = "${openaiBaseUrl.value}"`,
  'wire_api = "responses"',
  'requires_openai_auth = true'
])

const configTomlContent = computed(() => configTomlLines.value.join('\n'))

const configTomlWriteCmd = computed(() => {
  if (props.platform === 'windows') {
    const escaped = configTomlContent.value.replace(/"/g, '`"').replace(/\n/g, '`n')
    return `New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\\.codex" | Out-Null; "${escaped}" | Set-Content -Path "$env:USERPROFILE\\.codex\\config.toml" -Force`
  }
  const escaped = configTomlContent.value.replace(/\n/g, '\\n')
  return `mkdir -p ~/.codex && printf '${escaped}\\n' > ~/.codex/config.toml`
})

const authJsonWriteCmd = computed(() => {
  if (props.platform === 'windows') {
    return `New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\\.codex" | Out-Null; '{"OPENAI_API_KEY": null}' | Set-Content -Path "$env:USERPROFILE\\.codex\\auth.json" -Force`
  }
  return `mkdir -p ~/.codex && echo '{"OPENAI_API_KEY": null}' > ~/.codex/auth.json`
})
</script>
