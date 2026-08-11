<template>
  <div class="tutorial-section">
    <!-- 第一步：安装 Grok Build -->
    <div class="mb-4 sm:mb-10 sm:mb-6">
      <h4
        class="mb-3 flex items-center text-lg font-semibold text-gray-800 dark:text-gray-300 sm:mb-4 sm:text-xl"
      >
        <span
          class="mr-2 flex h-6 w-6 items-center justify-center rounded-full bg-violet-500 text-sm font-bold text-white sm:mr-3 sm:h-8 sm:w-8 sm:text-sm"
          >1</span
        >
        安装 Grok Build（官方 CLI）
      </h4>
      <p class="mb-3 text-sm text-gray-700 dark:text-gray-300 sm:mb-4 sm:text-base">
        Grok Build 是 xAI 官方终端 Agent（命令
        <code class="rounded bg-gray-100 px-1 dark:bg-gray-800">grok</code>
        ）。也可通过本中转用 Codex 调 Grok 模型（见第 3 步）。
      </p>
      <div
        class="rounded-lg border border-violet-200 bg-violet-50 p-3 dark:border-violet-500/40 dark:bg-violet-950/30 sm:p-4"
      >
        <h6 class="mb-2 text-sm font-medium text-violet-800 dark:text-violet-200 sm:text-base">
          安装命令
        </h6>
        <div
          class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-sm text-green-400 sm:p-3 sm:text-sm"
        >
          <div class="whitespace-pre text-gray-300">{{ installCmd }}</div>
        </div>
        <p class="mt-3 text-sm text-violet-700 dark:text-violet-200">
          安装后执行
          <code class="rounded bg-violet-100 px-1 dark:bg-violet-900">grok --version</code>
          确认。
        </p>
      </div>
    </div>

    <!-- 第二步：配置 Grok Build 走中转 -->
    <div class="mb-4 sm:mb-10 sm:mb-6">
      <h4
        class="mb-3 flex items-center text-lg font-semibold text-gray-800 dark:text-gray-300 sm:mb-4 sm:text-xl"
      >
        <span
          class="mr-2 flex h-6 w-6 items-center justify-center rounded-full bg-violet-500 text-sm font-bold text-white sm:mr-3 sm:h-8 sm:w-8 sm:text-sm"
          >2</span
        >
        配置 Grok Build 连接到本中转
      </h4>
      <p class="mb-3 text-sm text-gray-700 dark:text-gray-300 sm:mb-4 sm:text-base">
        编辑
        <code class="rounded bg-gray-100 px-1 dark:bg-gray-800">{{ grokConfigPath }}</code>
        ，把上游指到本服务的
        <code class="rounded bg-gray-100 px-1 dark:bg-gray-800">/grok/v1</code>
        ，并填入后台创建的
        <code class="rounded bg-gray-100 px-1 dark:bg-gray-800">cr_</code>
        前缀 API Key（需开启 Grok 权限）。
      </p>

      <div
        class="rounded-lg border border-yellow-200 bg-yellow-50 p-3 dark:border-yellow-500/40 dark:bg-yellow-950/30 sm:p-4"
      >
        <h6 class="mb-2 font-medium text-yellow-800 dark:text-yellow-300">config.toml</h6>
        <div
          class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-sm text-green-400 sm:p-3 sm:text-sm"
        >
          <div
            v-for="(line, index) in grokConfigLines"
            :key="'g' + index"
            class="whitespace-pre text-gray-300"
            :class="{ 'mt-2': line === '' }"
          >
            {{ line || '&nbsp;' }}
          </div>
        </div>
        <p class="mt-3 text-sm text-yellow-600 dark:text-yellow-400">一键写入：</p>
        <div
          class="mt-2 overflow-x-auto rounded bg-gray-900 p-2 font-mono text-sm text-green-400 sm:p-3 sm:text-sm"
        >
          <div class="whitespace-nowrap text-gray-300">{{ grokConfigWriteCmd }}</div>
        </div>
        <p class="mt-3 text-sm text-yellow-700 dark:text-yellow-300">
          保存后运行
          <code class="rounded bg-yellow-100 px-1 dark:bg-yellow-900">grok inspect</code>
          检查配置，启动后在
          <code class="rounded bg-yellow-100 px-1 dark:bg-yellow-900">/model</code>
          选择 grok。
        </p>
      </div>
    </div>

    <!-- 第三步：用 Codex 调 Grok -->
    <div class="mb-4 sm:mb-10 sm:mb-6">
      <h4
        class="mb-3 flex items-center text-lg font-semibold text-gray-800 dark:text-gray-300 sm:mb-4 sm:text-xl"
      >
        <span
          class="mr-2 flex h-6 w-6 items-center justify-center rounded-full bg-indigo-500 text-sm font-bold text-white sm:mr-3 sm:h-8 sm:w-8 sm:text-sm"
          >3</span
        >
        用 Codex 调用 Grok（可选）
      </h4>
      <p class="mb-3 text-sm text-gray-700 dark:text-gray-300 sm:mb-4 sm:text-base">
        当前 Codex 只支持
        <code class="rounded bg-gray-100 px-1 dark:bg-gray-800">wire_api = "responses"</code>
        （chat 协议已移除）。把 provider 指到本服务
        <code class="rounded bg-gray-100 px-1 dark:bg-gray-800">/grok/v1</code>
        即可用 Codex UI 跑 Grok 文本模型。
      </p>

      <div class="space-y-4">
        <div
          class="rounded-lg border border-indigo-200 bg-indigo-50 p-3 dark:border-indigo-500/40 dark:bg-indigo-950/30 sm:p-4"
        >
          <h6 class="mb-2 font-medium text-indigo-800 dark:text-indigo-300">
            1. {{ codexConfigPath }}
          </h6>
          <div
            class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-sm text-green-400 sm:p-3 sm:text-sm"
          >
            <div
              v-for="(line, index) in codexConfigLines"
              :key="'c' + index"
              class="whitespace-pre text-gray-300"
              :class="{ 'mt-2': line === '' }"
            >
              {{ line || '&nbsp;' }}
            </div>
          </div>
          <p class="mt-3 text-sm text-indigo-600 dark:text-indigo-400">一键写入：</p>
          <div
            class="mt-2 overflow-x-auto rounded bg-gray-900 p-2 font-mono text-sm text-green-400 sm:p-3 sm:text-sm"
          >
            <div class="whitespace-nowrap text-gray-300">{{ codexConfigWriteCmd }}</div>
          </div>
        </div>

        <div
          class="rounded-lg border border-orange-200 bg-orange-50 p-3 dark:border-orange-500/40 dark:bg-orange-950/30 sm:p-4"
        >
          <h6 class="mb-2 font-medium text-orange-800 dark:text-orange-300">
            2. 设置 API Key 环境变量
          </h6>
          <div
            class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-sm text-green-400 sm:p-3 sm:text-sm"
          >
            <div class="whitespace-pre text-gray-300">{{ envCmd }}</div>
          </div>
          <p class="mt-3 text-sm text-orange-700 dark:text-orange-300">
            也可在
            <code class="rounded bg-orange-100 px-1 dark:bg-orange-900">{{ authPath }}</code>
            写入
            <code class="rounded bg-orange-100 px-1 dark:bg-orange-900"
              >{"OPENAI_API_KEY":"cr_xxx"}</code
            >
            （若 provider 使用
            <code class="rounded bg-orange-100 px-1 dark:bg-orange-900"
              >requires_openai_auth = true</code
            >
            ）。上方示例用
            <code class="rounded bg-orange-100 px-1 dark:bg-orange-900">env_key</code>
            更安全。
          </p>
        </div>

        <div
          class="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-500/40 dark:bg-red-950/30 sm:p-4"
        >
          <p class="text-sm text-red-700 dark:text-red-300">
            注意：Codex 走 Responses 协议，只覆盖 Grok
            <strong>文本</strong>
            能力。图/视频请用 OpenAI 兼容客户端直接请求
            <code class="rounded bg-red-100 px-1 dark:bg-red-900">/grok/v1/images/*</code>
            或
            <code class="rounded bg-red-100 px-1 dark:bg-red-900">/grok/v1/videos/*</code>
            。
          </p>
        </div>
      </div>
    </div>

    <!-- 第四步：权限与模型 -->
    <div class="mb-4 sm:mb-6">
      <h4
        class="mb-3 flex items-center text-lg font-semibold text-gray-800 dark:text-gray-300 sm:mb-4 sm:text-xl"
      >
        <span
          class="mr-2 flex h-6 w-6 items-center justify-center rounded-full bg-green-500 text-sm font-bold text-white sm:mr-3 sm:h-8 sm:w-8 sm:text-sm"
          >4</span
        >
        后台前置条件
      </h4>
      <ul class="list-inside list-disc space-y-2 text-sm text-gray-700 dark:text-gray-300">
        <li>管理后台已添加至少一个 Grok 账户（OAuth 或 API Key + base URL）</li>
        <li>API Key 勾选了 <strong>Grok</strong> 服务权限</li>
        <li>
          常用模型：
          <code class="rounded bg-gray-100 px-1 dark:bg-gray-800">grok-4.5</code>
          、
          <code class="rounded bg-gray-100 px-1 dark:bg-gray-800">grok-composer-2.5-fast</code>
          、
          <code class="rounded bg-gray-100 px-1 dark:bg-gray-800">grok-imagine-image</code>
        </li>
        <li>
          直连测试：
          <code class="rounded bg-gray-100 px-1 dark:bg-gray-800"
            >POST {{ grokBaseUrl }}/chat/completions</code
          >
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useTutorialUrls } from '@/utils/useTutorialUrls'

const props = defineProps({
  platform: {
    type: String,
    required: true,
    validator: (value) => ['windows', 'macos', 'linux'].includes(value)
  }
})

const { grokBaseUrl } = useTutorialUrls()

const installCmd = computed(() =>
  props.platform === 'windows'
    ? 'irm https://x.ai/cli/install.ps1 | iex'
    : 'curl -fsSL https://x.ai/cli/install.sh | bash'
)

const grokConfigPath = computed(() =>
  props.platform === 'windows' ? '%USERPROFILE%\\.grok\\config.toml' : '~/.grok/config.toml'
)

const codexConfigPath = computed(() =>
  props.platform === 'windows' ? '%USERPROFILE%\\.codex\\config.toml' : '~/.codex/config.toml'
)

const authPath = computed(() =>
  props.platform === 'windows' ? '%USERPROFILE%\\.codex\\auth.json' : '~/.codex/auth.json'
)

const grokConfigLines = computed(() => [
  '[models]',
  'default = "grok"',
  'web_search = "grok"',
  '',
  '[model."grok"]',
  'model = "grok-4.5"',
  `base_url = "${grokBaseUrl.value}"`,
  'name = "Grok 4.5"',
  'api_key = "cr_xxxxxxxxxx"',
  'api_backend = "responses"',
  'context_window = 1000000',
  'supports_backend_search = true'
])

const grokConfigContent = computed(() => grokConfigLines.value.join('\n'))

const grokConfigWriteCmd = computed(() => {
  if (props.platform === 'windows') {
    const escaped = grokConfigContent.value.replace(/"/g, '`"').replace(/\n/g, '`n')
    return `New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\\.grok" | Out-Null; "${escaped}" | Set-Content -Path "$env:USERPROFILE\\.grok\\config.toml" -Force`
  }
  const escaped = grokConfigContent.value.replace(/\n/g, '\\n')
  return `mkdir -p ~/.grok && printf '${escaped}\\n' > ~/.grok/config.toml`
})

const codexConfigLines = computed(() => [
  'model_provider = "crs_grok"',
  'model = "grok-4.5"',
  'review_model = "grok-4.5"',
  'model_reasoning_effort = "high"',
  'preferred_auth_method = "apikey"',
  '',
  '[model_providers.crs_grok]',
  'name = "CRS Grok"',
  `base_url = "${grokBaseUrl.value}"`,
  'env_key = "CRS_GROK_API_KEY"',
  'wire_api = "responses"',
  'requires_openai_auth = false'
])

const codexConfigContent = computed(() => codexConfigLines.value.join('\n'))

const codexConfigWriteCmd = computed(() => {
  if (props.platform === 'windows') {
    const escaped = codexConfigContent.value.replace(/"/g, '`"').replace(/\n/g, '`n')
    return `New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\\.codex" | Out-Null; "${escaped}" | Set-Content -Path "$env:USERPROFILE\\.codex\\config.toml" -Force`
  }
  const escaped = codexConfigContent.value.replace(/\n/g, '\\n')
  return `mkdir -p ~/.codex && printf '${escaped}\\n' > ~/.codex/config.toml`
})

const envCmd = computed(() =>
  props.platform === 'windows'
    ? '$env:CRS_GROK_API_KEY="cr_xxxxxxxxxx"'
    : 'export CRS_GROK_API_KEY="cr_xxxxxxxxxx"'
)
</script>
