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
        配置 Droid CLI
      </h4>
      <p class="mb-3 text-sm text-gray-700 dark:text-gray-300 sm:mb-4 sm:text-base">
        Droid CLI 使用
        <code class="rounded bg-gray-100 px-1 dark:bg-gray-800">~/.factory/config.json</code>
        保存自定义模型；
        <template v-if="platform === 'windows'">
          在 Windows 中可直接编辑
          <code class="rounded bg-gray-100 px-1 dark:bg-gray-800"
            >C:\Users\你的用户名\.factory\config.json</code
          >。
        </template>
        <template v-else>
          在终端中可使用
          <code class="rounded bg-gray-100 px-1 dark:bg-gray-800">vim ~/.factory/config.json</code>
          编辑。
        </template>
      </p>
      <div
        class="rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-500/40 dark:bg-blue-950/30 sm:p-4"
      >
        <h6 class="mb-2 text-sm font-medium text-blue-800 dark:text-blue-200 sm:text-base">
          配置文件示例
        </h6>
        <p class="mb-3 text-sm text-blue-700 dark:text-blue-200">
          将以下内容追加到配置文件中，并替换示例中的域名和 API 密钥：
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
          💡 在 Droid CLI 中选择自定义模型即可使用新的 Droid 账号池；确保服务地址可被本地访问。
        </p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useTutorialUrls } from '@/utils/useTutorialUrls'
import NodeInstallTutorial from './NodeInstallTutorial.vue'

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
  '      "api_key": "你的API密钥",',
  '      "provider": "anthropic",',
  '      "max_tokens": 8192',
  '    },',
  '    {',
  '      "model_display_name": "GPT5.5 [crs]",',
  '      "model": "gpt-5.5",',
  `      "base_url": "${droidOpenaiBaseUrl.value}",`,
  '      "api_key": "你的API密钥",',
  '      "provider": "openai",',
  '      "max_tokens": 16384',
  '    }',
  '  ]',
  '}'
])
</script>
