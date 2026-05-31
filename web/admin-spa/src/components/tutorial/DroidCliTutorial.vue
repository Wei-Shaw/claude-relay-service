<template>
  <div class="tutorial-section">
    <!-- 第一步：安装 Node.js -->
    <NodeInstallTutorial :platform="platform" :step-number="1" tool-name="Droid CLI" />

    <!-- 第二步：配置 Droid CLI -->
    <div class="mb-4 sm:mb-10 sm:mb-6">
      <h4
        class="mb-3 flex items-center text-lg font-semibold text-gray-800 dark:text-gray-300 sm:mb-4 sm:text-xl"
      >
        <span
          class="mr-2 flex h-6 w-6 items-center justify-center rounded-full bg-blue-500 text-xs font-bold text-white sm:mr-3 sm:h-8 sm:w-8 sm:text-sm"
          >2</span
        >
        {{ t('tutorial.auto.auto080') }}
      </h4>
      <p class="mb-3 text-sm text-gray-700 dark:text-gray-300 sm:mb-4 sm:text-base">
        {{ t('tutorial.auto.auto081') }}
        <code class="rounded bg-gray-100 px-1 dark:bg-gray-800">~/.factory/config.json</code>
        {{ t('tutorial.auto.auto082') }}
        <template v-if="platform === 'windows'">
          {{ t('tutorial.auto.auto083') }}
          <code class="rounded bg-gray-100 px-1 dark:bg-gray-800">{{
            t('tutorial.auto.auto084')
          }}</code
          >。
        </template>
        <template v-else>
          {{ t('tutorial.auto.auto085') }}
          <code class="rounded bg-gray-100 px-1 dark:bg-gray-800">vim ~/.factory/config.json</code>
          {{ t('tutorial.auto.auto086') }}
        </template>
      </p>
      <div
        class="rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-500/40 dark:bg-blue-950/30 sm:p-4"
      >
        <h6 class="mb-2 text-sm font-medium text-blue-800 dark:text-blue-200 sm:text-base">
          {{ t('tutorial.auto.auto087') }}
        </h6>
        <p class="mb-3 text-sm text-blue-700 dark:text-blue-200">
          {{ t('tutorial.auto.auto088') }}
        </p>
        <div
          class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
        >
          <div
            v-for="(line, index) in droidCliConfigLines"
            :key="line + index"
            class="whitespace-pre text-gray-300"
          >
            {{ line }}
          </div>
        </div>
        <p class="mt-3 text-xs text-blue-700 dark:text-blue-200 sm:text-sm">
          {{ t('tutorial.auto.auto089') }}
        </p>
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
defineProps({
  platform: {
    type: String,
    required: true,
    validator: (value) => ['windows', 'macos', 'linux'].includes(value)
  }
})

const { droidClaudeBaseUrl, droidOpenaiBaseUrl } = useTutorialUrls()

const droidCliConfigLines = computed(() => [
  '{',
  '  "custom_models": [',
  '    {',
  '      "model_display_name": "Sonnet 4.5 [crs]",',
  '      "model": "claude-sonnet-4-5-20250929",',
  `      "base_url": "${droidClaudeBaseUrl.value}",`,
  t('tutorial.auto.auto090'),
  '      "provider": "anthropic",',
  '      "max_tokens": 8192',
  '    },',
  '    {',
  '      "model_display_name": "GPT5-Codex [crs]",',
  '      "model": "gpt-5-codex",',
  `      "base_url": "${droidOpenaiBaseUrl.value}",`,
  t('tutorial.auto.auto090'),
  '      "provider": "openai",',
  '      "max_tokens": 16384',
  '    }',
  '  ]',
  '}'
])
</script>
