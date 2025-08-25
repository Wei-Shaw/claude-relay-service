<template>
  <div class="card p-3 sm:p-6">
    <div class="mb-4 sm:mb-8">
      <h3
        class="mb-3 flex items-center text-xl font-bold text-gray-900 dark:text-gray-100 sm:mb-4 sm:text-2xl"
      >
        <i class="fas fa-graduation-cap mr-2 text-blue-600 sm:mr-3" />
        Claude Code 使用教程
      </h3>
      <p class="text-sm text-gray-600 dark:text-gray-400 sm:text-lg">
        跟着这个教程，你可以轻松在自己的电脑上安装并使用 Claude Code。
      </p>
    </div>

    <!-- 系统选择标签 -->
    <div class="mb-4 sm:mb-8">
      <div class="flex flex-wrap gap-1 rounded-xl bg-gray-100 p-1 dark:bg-gray-700 sm:gap-2 sm:p-2">
        <button
          v-for="system in tutorialSystems"
          :key="system.key"
          :class="[
            'flex flex-1 items-center justify-center gap-1 rounded-lg px-3 py-2 text-xs font-semibold transition-all duration-300 sm:gap-2 sm:px-6 sm:py-3 sm:text-sm',
            activeTutorialSystem === system.key
              ? 'bg-white text-blue-600 shadow-sm dark:bg-gray-800'
              : 'text-gray-600 hover:bg-white/50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200'
          ]"
          @click="activeTutorialSystem = system.key"
        >
          <i :class="system.icon" />
          {{ system.name }}
        </button>
      </div>
    </div>

    <!-- Windows 教程 -->
    <div v-if="activeTutorialSystem === 'windows'" class="tutorial-content">
      <!-- 第一步：安装 Node.js -->
      <div class="mb-4 sm:mb-10 sm:mb-6">
        <h4
          class="mb-3 flex items-center text-lg font-semibold text-gray-800 dark:text-gray-300 sm:mb-4 sm:text-xl"
        >
          <span
            class="mr-2 flex h-6 w-6 items-center justify-center rounded-full bg-blue-500 text-xs font-bold text-white sm:mr-3 sm:h-8 sm:w-8 sm:text-sm"
            >1</span
          >
          安装 Node.js 环境
        </h4>
        <p class="mb-4 text-sm text-gray-600 dark:text-gray-400 sm:mb-4 sm:mb-6 sm:text-base">
          Claude Code 需要 Node.js 环境才能运行。
        </p>

        <div
          class="mb-4 rounded-xl border border-blue-100 bg-gradient-to-r from-blue-50 to-indigo-50 p-4 sm:mb-4 sm:mb-6 sm:p-6"
        >
          <h5
            class="mb-2 flex items-center text-base font-semibold text-gray-800 dark:text-gray-600 sm:mb-3 sm:text-lg"
          >
            <i class="fab fa-windows mr-2 text-blue-600" />
            Windows 安装方法
          </h5>
          <div class="mb-3 sm:mb-4">
            <p class="mb-2 text-sm text-gray-700 dark:text-gray-600 sm:mb-3 sm:text-base">
              方法一：官网下载（推荐）
            </p>
            <ol
              class="ml-2 list-inside list-decimal space-y-1 text-xs text-gray-600 dark:text-gray-600 sm:ml-4 sm:space-y-2 sm:text-sm"
            >
              <li>
                打开浏览器访问
                <code
                  class="rounded bg-gray-100 px-1 py-1 text-xs dark:bg-gray-700 sm:px-2 sm:text-sm"
                  >https://nodejs.org/</code
                >
              </li>
              <li>点击 "LTS" 版本进行下载（推荐长期支持版本）</li>
              <li>
                下载完成后双击
                <code
                  class="rounded bg-gray-100 px-1 py-1 text-xs dark:bg-gray-700 sm:px-2 sm:text-sm"
                  >.msi</code
                >
                文件
              </li>
              <li>按照安装向导完成安装，保持默认设置即可</li>
            </ol>
          </div>
          <div class="mb-3 sm:mb-4">
            <p class="mb-2 text-sm text-gray-700 dark:text-gray-600 sm:mb-3 sm:text-base">
              方法二：使用包管理器
            </p>
            <p class="mb-2 text-xs text-gray-600 dark:text-gray-400 sm:text-sm">
              如果你安装了 Chocolatey 或 Scoop，可以使用命令行安装：
            </p>
            <div
              class="overflow-x-auto rounded-lg bg-gray-900 p-3 font-mono text-xs text-green-400 sm:p-4 sm:text-sm"
            >
              <div class="mb-2"># 使用 Chocolatey</div>
              <div class="whitespace-nowrap text-gray-300">choco install nodejs</div>
              <div class="mb-2 mt-3"># 或使用 Scoop</div>
              <div class="whitespace-nowrap text-gray-300">scoop install nodejs</div>
            </div>
          </div>
          <div class="rounded-lg border border-blue-200 bg-blue-50 p-3 sm:p-4">
            <h6 class="mb-2 text-sm font-medium text-blue-800 sm:text-base">Windows 注意事项</h6>
            <ul class="space-y-1 text-xs text-blue-700 sm:text-sm sm:text-xs">
              <li>• 建议使用 PowerShell 而不是 CMD</li>
              <li>• 如果遇到权限问题，尝试以管理员身份运行</li>
              <li>• 某些杀毒软件可能会误报，需要添加白名单</li>
            </ul>
          </div>
        </div>

        <!-- 验证安装 -->
        <div class="rounded-lg border border-green-200 bg-green-50 p-3 sm:p-4">
          <h6 class="mb-2 text-sm font-medium text-green-800 sm:text-base">验证安装是否成功</h6>
          <p class="mb-2 text-xs text-green-700 sm:mb-3 sm:text-sm">
            安装完成后，打开 PowerShell 或 CMD，输入以下命令：
          </p>
          <div
            class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
          >
            <div class="whitespace-nowrap text-gray-300">node --version</div>
            <div class="whitespace-nowrap text-gray-300">npm --version</div>
          </div>
          <p class="mt-2 text-xs text-green-700 sm:text-sm">如果显示版本号，说明安装成功了！</p>
        </div>
      </div>

      <!-- 第二步：安装 Claude Code -->
      <div class="mb-4 sm:mb-10 sm:mb-6">
        <h4
          class="mb-3 flex items-center text-lg font-semibold text-gray-800 dark:text-gray-300 sm:mb-4 sm:text-xl"
        >
          <span
            class="mr-2 flex h-6 w-6 items-center justify-center rounded-full bg-green-500 text-xs font-bold text-white sm:mr-3 sm:h-8 sm:w-8 sm:text-sm"
            >2</span
          >
          安装 Claude Code
        </h4>

        <div
          class="mb-4 rounded-xl border border-green-100 bg-gradient-to-r from-green-50 to-emerald-50 p-4 sm:mb-6 sm:p-6"
        >
          <h5
            class="mb-2 flex items-center text-base font-semibold text-gray-800 dark:text-gray-600 sm:mb-3 sm:text-lg"
          >
            <i class="fas fa-download mr-2 text-green-600" />
            安装 Claude Code
          </h5>
          <p class="mb-3 text-sm text-gray-700 dark:text-gray-300 sm:mb-4 sm:text-base">
            打开 PowerShell 或 CMD，运行以下命令：
          </p>
          <div
            class="mb-4 overflow-x-auto rounded-lg bg-gray-900 p-3 font-mono text-xs text-green-400 sm:p-4 sm:text-sm"
          >
            <div class="mb-2"># 全局安装 Claude Code</div>
            <div class="whitespace-nowrap text-gray-300">
              npm install -g @anthropic-ai/claude-code
            </div>
          </div>
          <p class="text-sm text-gray-600 dark:text-gray-400">
            这个命令会从 npm 官方仓库下载并安装最新版本的 Claude Code。
          </p>

          <div class="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3 sm:p-4">
            <h6 class="mb-2 text-sm font-medium text-blue-800 sm:text-base">提示</h6>
            <ul class="space-y-1 text-xs text-blue-700 sm:text-sm">
              <li>• 建议使用 PowerShell 而不是 CMD，功能更强大</li>
              <li>• 如果遇到权限问题，以管理员身份运行 PowerShell</li>
            </ul>
          </div>
        </div>

        <!-- 验证安装 -->
        <div class="rounded-lg border border-green-200 bg-green-50 p-3 sm:p-4">
          <h6 class="mb-2 font-medium text-green-800 dark:text-green-300">验证 Claude Code 安装</h6>
          <p class="mb-3 text-sm text-green-700">安装完成后，输入以下命令检查是否安装成功：</p>
          <div
            class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
          >
            <div class="whitespace-nowrap text-gray-300">claude --version</div>
          </div>
          <p class="mt-2 text-sm text-green-700">
            如果显示版本号，恭喜你！Claude Code 已经成功安装了。
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
          设置环境变量
        </h4>

        <div
          class="mb-4 rounded-xl border border-purple-100 bg-gradient-to-r from-purple-50 to-pink-50 p-4 sm:mb-6 sm:p-6"
        >
          <h5
            class="mb-2 flex items-center text-base font-semibold text-gray-800 dark:text-gray-600 sm:mb-3 sm:text-lg"
          >
            <i class="fas fa-cog mr-2 text-purple-600" />
            配置 Claude Code 环境变量
          </h5>
          <p class="mb-3 text-sm text-gray-700 dark:text-gray-300 sm:mb-4 sm:text-base">
            为了让 Claude Code 连接到你的中转服务，需要设置两个环境变量：
          </p>

          <div class="space-y-4">
            <div
              class="rounded-lg border border-purple-200 bg-white p-3 dark:border-purple-700 dark:bg-gray-800 sm:p-4"
            >
              <h6 class="mb-2 text-sm font-medium text-gray-800 dark:text-gray-600 sm:text-base">
                方法一：PowerShell 临时设置（当前会话）
              </h6>
              <p class="mb-3 text-sm text-gray-600">在 PowerShell 中运行以下命令：</p>
              <div
                class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="whitespace-nowrap text-gray-300">
                  $env:ANTHROPIC_BASE_URL = "{{ currentBaseUrl }}"
                </div>
                <div class="whitespace-nowrap text-gray-300">
                  $env:ANTHROPIC_AUTH_TOKEN = "你的API密钥"
                </div>
              </div>
              <p class="mt-2 text-xs text-yellow-700">
                💡 记得将 "你的API密钥" 替换为在上方 "API Keys" 标签页中创建的实际密钥。
              </p>
            </div>

            <div
              class="rounded-lg border border-purple-200 bg-white p-3 dark:border-purple-700 dark:bg-gray-800 sm:p-4"
            >
              <h6 class="mb-2 text-sm font-medium text-gray-800 dark:text-gray-600 sm:text-base">
                方法二：PowerShell 永久设置（用户级）
              </h6>
              <p class="mb-3 text-sm text-gray-600">
                在 PowerShell 中运行以下命令设置用户级环境变量：
              </p>
              <div
                class="mb-3 overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="mb-2"># 设置用户级环境变量（永久生效）</div>
                <div class="whitespace-nowrap text-gray-300">
                  [System.Environment]::SetEnvironmentVariable("ANTHROPIC_BASE_URL", "{{
                    currentBaseUrl
                  }}", [System.EnvironmentVariableTarget]::User)
                </div>
                <div class="whitespace-nowrap text-gray-300">
                  [System.Environment]::SetEnvironmentVariable("ANTHROPIC_AUTH_TOKEN",
                  "你的API密钥", [System.EnvironmentVariableTarget]::User)
                </div>
              </div>
              <p class="mb-3 text-sm text-gray-600">查看已设置的环境变量：</p>
              <div
                class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="mb-2"># 查看用户级环境变量</div>
                <div class="whitespace-nowrap text-gray-300">
                  [System.Environment]::GetEnvironmentVariable("ANTHROPIC_BASE_URL",
                  [System.EnvironmentVariableTarget]::User)
                </div>
                <div class="whitespace-nowrap text-gray-300">
                  [System.Environment]::GetEnvironmentVariable("ANTHROPIC_AUTH_TOKEN",
                  [System.EnvironmentVariableTarget]::User)
                </div>
              </div>
              <p class="mt-2 text-xs text-blue-700">
                💡 设置后需要重新打开 PowerShell 窗口才能生效。
              </p>
            </div>
          </div>
        </div>

        <!-- 验证环境变量设置 -->
        <div class="mt-6 rounded-lg border border-blue-200 bg-blue-50 p-3 sm:p-4">
          <h6 class="mb-2 font-medium text-blue-800 dark:text-blue-300">验证环境变量设置</h6>
          <p class="mb-3 text-sm text-blue-700">
            设置完环境变量后，可以通过以下命令验证是否设置成功：
          </p>

          <div class="space-y-4">
            <div>
              <h6 class="mb-2 text-sm font-medium text-gray-800 dark:text-gray-600 sm:text-base">
                在 PowerShell 中验证：
              </h6>
              <div
                class="space-y-1 overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="whitespace-nowrap text-gray-300">echo $env:ANTHROPIC_BASE_URL</div>
                <div class="whitespace-nowrap text-gray-300">echo $env:ANTHROPIC_AUTH_TOKEN</div>
              </div>
            </div>

            <div>
              <h6 class="mb-2 text-sm font-medium text-gray-800 dark:text-gray-600 sm:text-base">
                在 CMD 中验证：
              </h6>
              <div
                class="space-y-1 overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="whitespace-nowrap text-gray-300">echo %ANTHROPIC_BASE_URL%</div>
                <div class="whitespace-nowrap text-gray-300">echo %ANTHROPIC_AUTH_TOKEN%</div>
              </div>
            </div>
          </div>

          <div class="mt-3 space-y-2">
            <p class="text-sm text-blue-700">
              <strong>预期输出示例：</strong>
            </p>
            <div class="rounded bg-gray-100 p-2 font-mono text-sm dark:bg-gray-700">
              <div>{{ currentBaseUrl }}</div>
              <div>cr_xxxxxxxxxxxxxxxxxx</div>
            </div>
            <p class="text-xs text-blue-700">
              💡 如果输出为空或显示变量名本身，说明环境变量设置失败，请重新设置。
            </p>
          </div>
        </div>

        <!-- Gemini CLI 环境变量设置 -->
        <div class="mt-8">
          <h5
            class="mb-2 flex items-center text-base font-semibold text-gray-800 dark:text-gray-600 sm:mb-3 sm:text-lg"
          >
            <i class="fas fa-robot mr-2 text-green-600" />
            配置 Gemini CLI 环境变量
          </h5>
          <p class="mb-3 text-sm text-gray-700 dark:text-gray-300 sm:mb-4 sm:text-base">
            如果你使用 Gemini CLI，需要设置以下环境变量：
          </p>

          <div class="space-y-4">
            <div class="rounded-lg border border-green-200 bg-white p-3 sm:p-4">
              <h6 class="mb-2 text-sm font-medium text-gray-800 dark:text-gray-600 sm:text-base">
                PowerShell 设置方法
              </h6>
              <p class="mb-3 text-sm text-gray-600">在 PowerShell 中运行以下命令：</p>
              <div
                class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="whitespace-nowrap text-gray-300">
                  $env:CODE_ASSIST_ENDPOINT = "{{ geminiBaseUrl }}"
                </div>
                <div class="whitespace-nowrap text-gray-300">
                  $env:GOOGLE_CLOUD_ACCESS_TOKEN = "你的API密钥"
                </div>
                <div class="whitespace-nowrap text-gray-300">
                  $env:GOOGLE_GENAI_USE_GCA = "true"
                </div>
              </div>
              <p class="mt-2 text-xs text-yellow-700">
                💡 使用与 Claude Code 相同的 API 密钥即可。
              </p>
            </div>

            <div class="rounded-lg border border-green-200 bg-white p-3 sm:p-4">
              <h6 class="mb-2 text-sm font-medium text-gray-800 dark:text-gray-600 sm:text-base">
                PowerShell 永久设置（用户级）
              </h6>
              <p class="mb-3 text-sm text-gray-600">在 PowerShell 中运行以下命令：</p>
              <div
                class="mb-3 overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="mb-2"># 设置用户级环境变量（永久生效）</div>
                <div class="whitespace-nowrap text-gray-300">
                  [System.Environment]::SetEnvironmentVariable("CODE_ASSIST_ENDPOINT", "{{
                    geminiBaseUrl
                  }}", [System.EnvironmentVariableTarget]::User)
                </div>
                <div class="whitespace-nowrap text-gray-300">
                  [System.Environment]::SetEnvironmentVariable("GOOGLE_CLOUD_ACCESS_TOKEN",
                  "你的API密钥", [System.EnvironmentVariableTarget]::User)
                </div>
                <div class="whitespace-nowrap text-gray-300">
                  [System.Environment]::SetEnvironmentVariable("GOOGLE_GENAI_USE_GCA", "true",
                  [System.EnvironmentVariableTarget]::User)
                </div>
              </div>
              <p class="mt-2 text-xs text-blue-700">
                💡 设置后需要重新打开 PowerShell 窗口才能生效。
              </p>
            </div>

            <div class="rounded-lg border border-green-200 bg-green-50 p-3 sm:p-4">
              <h6 class="mb-2 font-medium text-green-800 dark:text-green-300">
                验证 Gemini CLI 环境变量
              </h6>
              <p class="mb-3 text-sm text-green-700">在 PowerShell 中验证：</p>
              <div
                class="space-y-1 overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="whitespace-nowrap text-gray-300">echo $env:CODE_ASSIST_ENDPOINT</div>
                <div class="whitespace-nowrap text-gray-300">
                  echo $env:GOOGLE_CLOUD_ACCESS_TOKEN
                </div>
                <div class="whitespace-nowrap text-gray-300">echo $env:GOOGLE_GENAI_USE_GCA</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Codex 环境变量设置 -->
        <div class="mt-8">
          <h5
            class="mb-2 flex items-center text-base font-semibold text-gray-800 dark:text-gray-600 sm:mb-3 sm:text-lg"
          >
            <i class="fas fa-code mr-2 text-indigo-600" />
            配置 Codex 环境变量
          </h5>
          <p class="mb-3 text-sm text-gray-700 dark:text-gray-300 sm:mb-4 sm:text-base">
            如果你使用支持 OpenAI API 的工具（如 Codex），需要设置以下环境变量：
          </p>

          <div class="space-y-4">
            <div class="rounded-lg border border-indigo-200 bg-white p-3 sm:p-4">
              <h6 class="mb-2 text-sm font-medium text-gray-800 dark:text-gray-600 sm:text-base">
                PowerShell 设置方法
              </h6>
              <p class="mb-3 text-sm text-gray-600">在 PowerShell 中运行以下命令：</p>
              <div
                class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="whitespace-nowrap text-gray-300">
                  $env:OPENAI_BASE_URL = "{{ openaiBaseUrl }}"
                </div>
                <div class="whitespace-nowrap text-gray-300">
                  $env:OPENAI_API_KEY = "你的API密钥"
                </div>
              </div>
              <p class="mt-2 text-xs text-yellow-700">
                💡 使用与 Claude Code 相同的 API 密钥即可，格式如 cr_xxxxxxxxxx。
              </p>
            </div>

            <div class="rounded-lg border border-indigo-200 bg-white p-3 sm:p-4">
              <h6 class="mb-2 text-sm font-medium text-gray-800 dark:text-gray-600 sm:text-base">
                PowerShell 永久设置（用户级）
              </h6>
              <p class="mb-3 text-sm text-gray-600">在 PowerShell 中运行以下命令：</p>
              <div
                class="mb-3 overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="mb-2"># 设置用户级环境变量（永久生效）</div>
                <div class="whitespace-nowrap text-gray-300">
                  [System.Environment]::SetEnvironmentVariable("OPENAI_BASE_URL", "{{
                    openaiBaseUrl
                  }}", [System.EnvironmentVariableTarget]::User)
                </div>
                <div class="whitespace-nowrap text-gray-300">
                  [System.Environment]::SetEnvironmentVariable("OPENAI_API_KEY", "你的API密钥",
                  [System.EnvironmentVariableTarget]::User)
                </div>
              </div>
              <p class="mt-2 text-xs text-blue-700">
                💡 设置后需要重新打开 PowerShell 窗口才能生效。
              </p>
            </div>

            <div class="rounded-lg border border-indigo-200 bg-indigo-50 p-3 sm:p-4">
              <h6 class="mb-2 font-medium text-indigo-800">验证 Codex 环境变量</h6>
              <p class="mb-3 text-sm text-indigo-700">在 PowerShell 中验证：</p>
              <div
                class="space-y-1 overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="whitespace-nowrap text-gray-300">echo $env:OPENAI_BASE_URL</div>
                <div class="whitespace-nowrap text-gray-300">echo $env:OPENAI_API_KEY</div>
              </div>
            </div>
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
          开始使用 Claude Code
        </h4>
        <div
          class="rounded-xl border border-orange-100 bg-gradient-to-r from-orange-50 to-yellow-50 p-4 sm:p-6"
        >
          <p class="mb-3 text-sm text-gray-700 dark:text-gray-300 sm:mb-4 sm:text-base">
            现在你可以开始使用 Claude Code 了！
          </p>

          <div class="space-y-4">
            <div>
              <h6 class="mb-2 text-sm font-medium text-gray-800 dark:text-gray-600 sm:text-base">
                启动 Claude Code
              </h6>
              <div
                class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="whitespace-nowrap text-gray-300">claude</div>
              </div>
            </div>

            <div>
              <h6 class="mb-2 text-sm font-medium text-gray-800 dark:text-gray-600 sm:text-base">
                在特定项目中使用
              </h6>
              <div
                class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="mb-2"># 进入你的项目目录</div>
                <div class="whitespace-nowrap text-gray-300">cd C:\path\to\your\project</div>
                <div class="mb-2 mt-2"># 启动 Claude Code</div>
                <div class="whitespace-nowrap text-gray-300">claude</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Windows 故障排除 -->
      <div class="mb-8">
        <h4
          class="mb-3 flex items-center text-lg font-semibold text-gray-800 dark:text-gray-300 sm:mb-4 sm:text-xl"
        >
          <i class="fas fa-wrench mr-2 text-red-600 sm:mr-3" />
          Windows 常见问题解决
        </h4>
        <div class="space-y-4">
          <details class="rounded-lg border border-gray-200 bg-gray-50">
            <summary
              class="cursor-pointer p-3 text-sm font-medium text-gray-800 hover:bg-gray-100 sm:p-4 sm:text-base"
            >
              安装时提示 "permission denied" 错误
            </summary>
            <div class="px-3 pb-3 text-gray-600 sm:px-4 sm:pb-4">
              <p class="mb-2">这通常是权限问题，尝试以下解决方法：</p>
              <ul class="list-inside list-disc space-y-1 text-sm">
                <li>以管理员身份运行 PowerShell</li>
                <li>
                  或者配置 npm 使用用户目录：<code
                    class="rounded bg-gray-200 px-1 text-xs sm:text-sm"
                    >npm config set prefix %APPDATA%\npm</code
                  >
                </li>
              </ul>
            </div>
          </details>

          <details class="rounded-lg border border-gray-200 bg-gray-50">
            <summary
              class="cursor-pointer p-3 text-sm font-medium text-gray-800 hover:bg-gray-100 sm:p-4 sm:text-base"
            >
              PowerShell 执行策略错误
            </summary>
            <div class="px-3 pb-3 text-gray-600 sm:px-4 sm:pb-4">
              <p class="mb-2">如果遇到执行策略限制，运行：</p>
              <div
                class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="whitespace-nowrap text-gray-300">
                  Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
                </div>
              </div>
            </div>
          </details>

          <details class="rounded-lg border border-gray-200 bg-gray-50">
            <summary
              class="cursor-pointer p-3 text-sm font-medium text-gray-800 hover:bg-gray-100 sm:p-4 sm:text-base"
            >
              环境变量设置后不生效
            </summary>
            <div class="px-3 pb-3 text-gray-600 sm:px-4 sm:pb-4">
              <p class="mb-2">设置永久环境变量后需要：</p>
              <ul class="list-inside list-disc space-y-1 text-sm">
                <li>重新启动 PowerShell 或 CMD</li>
                <li>或者注销并重新登录 Windows</li>
                <li>
                  验证设置：<code class="rounded bg-gray-200 px-1 text-xs sm:text-sm"
                    >echo $env:ANTHROPIC_BASE_URL</code
                  >
                </li>
              </ul>
            </div>
          </details>
        </div>
      </div>
    </div>

    <!-- macOS 教程 -->
    <div v-else-if="activeTutorialSystem === 'macos'" class="tutorial-content">
      <!-- 第一步：安装 Node.js -->
      <div class="mb-6 sm:mb-10">
        <h4
          class="mb-3 flex items-center text-lg font-semibold text-gray-800 dark:text-gray-300 sm:mb-4 sm:text-xl"
        >
          <span
            class="mr-2 flex h-6 w-6 items-center justify-center rounded-full bg-blue-500 text-xs font-bold text-white sm:mr-3 sm:h-8 sm:w-8 sm:text-sm"
            >1</span
          >
          安装 Node.js 环境
        </h4>
        <p class="mb-4 text-gray-600 sm:mb-6">Claude Code 需要 Node.js 环境才能运行。</p>

        <div
          class="mb-4 rounded-xl border border-gray-200 bg-gradient-to-r from-gray-50 to-slate-50 p-4 sm:mb-6 sm:p-6"
        >
          <h5
            class="mb-2 flex items-center text-base font-semibold text-gray-800 dark:text-gray-600 sm:mb-3 sm:text-lg"
          >
            <i class="fab fa-apple mr-2 text-gray-700" />
            macOS 安装方法
          </h5>
          <div class="mb-4">
            <p class="mb-3 text-gray-700">方法一：使用 Homebrew（推荐）</p>
            <p class="mb-2 text-xs text-gray-600 dark:text-gray-400 sm:text-sm">
              如果你已经安装了 Homebrew，使用它安装 Node.js 会更方便：
            </p>
            <div
              class="overflow-x-auto rounded-lg bg-gray-900 p-3 font-mono text-xs text-green-400 sm:p-4 sm:text-sm"
            >
              <div class="mb-2"># 更新 Homebrew</div>
              <div class="whitespace-nowrap text-gray-300">brew update</div>
              <div class="mb-2 mt-3"># 安装 Node.js</div>
              <div class="whitespace-nowrap text-gray-300">brew install node</div>
            </div>
          </div>
          <div class="mb-4">
            <p class="mb-3 text-gray-700">方法二：官网下载</p>
            <ol
              class="ml-2 list-inside list-decimal space-y-1 text-xs text-gray-600 dark:text-gray-400 sm:ml-4 sm:space-y-2 sm:text-sm"
            >
              <li>
                访问
                <code
                  class="rounded bg-gray-100 px-1 py-1 text-xs dark:bg-gray-700 sm:px-2 sm:text-sm"
                  >https://nodejs.org/</code
                >
              </li>
              <li>下载适合 macOS 的 LTS 版本</li>
              <li>
                打开下载的
                <code
                  class="rounded bg-gray-100 px-1 py-1 text-xs dark:bg-gray-700 sm:px-2 sm:text-sm"
                  >.pkg</code
                >
                文件
              </li>
              <li>按照安装程序指引完成安装</li>
            </ol>
          </div>
          <div class="rounded-lg border border-gray-200 bg-gray-50 p-3 sm:p-4">
            <h6 class="mb-2 text-sm font-medium text-gray-800 sm:text-base">macOS 注意事项</h6>
            <ul class="space-y-1 text-xs text-gray-700 sm:text-sm">
              <li>
                • 如果遇到权限问题，可能需要使用
                <code class="rounded bg-gray-200 px-1 text-xs sm:text-sm">sudo</code>
              </li>
              <li>• 首次运行可能需要在系统偏好设置中允许</li>
              <li>• 建议使用 Terminal 或 iTerm2</li>
            </ul>
          </div>
        </div>

        <!-- 验证安装 -->
        <div class="rounded-lg border border-green-200 bg-green-50 p-3 sm:p-4">
          <h6 class="mb-2 font-medium text-green-800 dark:text-green-300">验证安装是否成功</h6>
          <p class="mb-3 text-sm text-green-700">安装完成后，打开 Terminal，输入以下命令：</p>
          <div
            class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
          >
            <div class="whitespace-nowrap text-gray-300">node --version</div>
            <div class="whitespace-nowrap text-gray-300">npm --version</div>
          </div>
          <p class="mt-2 text-sm text-green-700">如果显示版本号，说明安装成功了！</p>
        </div>
      </div>

      <!-- 第二步：安装 Claude Code -->
      <div class="mb-6 sm:mb-10">
        <h4
          class="mb-3 flex items-center text-lg font-semibold text-gray-800 dark:text-gray-300 sm:mb-4 sm:text-xl"
        >
          <span
            class="mr-2 flex h-6 w-6 items-center justify-center rounded-full bg-green-500 text-xs font-bold text-white sm:mr-3 sm:h-8 sm:w-8 sm:text-sm"
            >2</span
          >
          安装 Claude Code
        </h4>

        <div
          class="mb-4 rounded-xl border border-purple-100 bg-gradient-to-r from-purple-50 to-pink-50 p-4 sm:mb-6 sm:p-6"
        >
          <h5
            class="mb-2 flex items-center text-base font-semibold text-gray-800 dark:text-gray-600 sm:mb-3 sm:text-lg"
          >
            <i class="fas fa-download mr-2 text-purple-600" />
            安装 Claude Code
          </h5>
          <p class="mb-3 text-sm text-gray-700 dark:text-gray-300 sm:mb-4 sm:text-base">
            打开 Terminal，运行以下命令：
          </p>
          <div
            class="mb-4 overflow-x-auto rounded-lg bg-gray-900 p-3 font-mono text-xs text-green-400 sm:p-4 sm:text-sm"
          >
            <div class="mb-2"># 全局安装 Claude Code</div>
            <div class="whitespace-nowrap text-gray-300">
              npm install -g @anthropic-ai/claude-code
            </div>
          </div>
          <p class="mb-2 text-sm text-gray-600">如果遇到权限问题，可以使用 sudo：</p>
          <div
            class="overflow-x-auto rounded-lg bg-gray-900 p-3 font-mono text-xs text-green-400 sm:p-4 sm:text-sm"
          >
            <div class="whitespace-nowrap text-gray-300">
              sudo npm install -g @anthropic-ai/claude-code
            </div>
          </div>
        </div>

        <!-- 验证安装 -->
        <div class="rounded-lg border border-green-200 bg-green-50 p-3 sm:p-4">
          <h6 class="mb-2 font-medium text-green-800 dark:text-green-300">验证 Claude Code 安装</h6>
          <p class="mb-3 text-sm text-green-700">安装完成后，输入以下命令检查是否安装成功：</p>
          <div
            class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
          >
            <div class="whitespace-nowrap text-gray-300">claude --version</div>
          </div>
          <p class="mt-2 text-sm text-green-700">
            如果显示版本号，恭喜你！Claude Code 已经成功安装了。
          </p>
        </div>
      </div>

      <!-- 第三步：设置环境变量 -->
      <div class="mb-6 sm:mb-10">
        <h4
          class="mb-3 flex items-center text-lg font-semibold text-gray-800 dark:text-gray-300 sm:mb-4 sm:text-xl"
        >
          <span
            class="mr-2 flex h-6 w-6 items-center justify-center rounded-full bg-orange-500 text-xs font-bold text-white sm:mr-3 sm:h-8 sm:w-8 sm:text-sm"
            >3</span
          >
          设置环境变量
        </h4>

        <div
          class="mb-4 rounded-xl border border-orange-100 bg-gradient-to-r from-orange-50 to-yellow-50 p-4 sm:mb-6 sm:p-6"
        >
          <h5
            class="mb-2 flex items-center text-base font-semibold text-gray-800 dark:text-gray-600 sm:mb-3 sm:text-lg"
          >
            <i class="fas fa-cog mr-2 text-orange-600" />
            配置 Claude Code 环境变量
          </h5>
          <p class="mb-3 text-sm text-gray-700 dark:text-gray-300 sm:mb-4 sm:text-base">
            为了让 Claude Code 连接到你的中转服务，需要设置两个环境变量：
          </p>

          <div class="space-y-4">
            <div class="rounded-lg border border-orange-200 bg-white p-3 sm:p-4">
              <h6 class="mb-2 text-sm font-medium text-gray-800 dark:text-gray-600 sm:text-base">
                方法一：临时设置（当前会话）
              </h6>
              <p class="mb-3 text-sm text-gray-600">在 Terminal 中运行以下命令：</p>
              <div
                class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="whitespace-nowrap text-gray-300">
                  export ANTHROPIC_BASE_URL="{{ currentBaseUrl }}"
                </div>
                <div class="whitespace-nowrap text-gray-300">
                  export ANTHROPIC_AUTH_TOKEN="你的API密钥"
                </div>
              </div>
              <p class="mt-2 text-xs text-yellow-700">
                💡 记得将 "你的API密钥" 替换为在上方 "API Keys" 标签页中创建的实际密钥。
              </p>
            </div>

            <div class="rounded-lg border border-orange-200 bg-white p-3 sm:p-4">
              <h6 class="mb-2 text-sm font-medium text-gray-800 dark:text-gray-600 sm:text-base">
                方法二：永久设置
              </h6>
              <p class="mb-3 text-sm text-gray-600">
                编辑你的 shell 配置文件（根据你使用的 shell）：
              </p>
              <div
                class="mb-3 overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="mb-2"># 对于 zsh (默认)</div>
                <div class="whitespace-nowrap text-gray-300">
                  echo 'export ANTHROPIC_BASE_URL="{{ currentBaseUrl }}"' >> ~/.zshrc
                </div>
                <div class="whitespace-nowrap text-gray-300">
                  echo 'export ANTHROPIC_AUTH_TOKEN="你的API密钥"' >> ~/.zshrc
                </div>
                <div class="whitespace-nowrap text-gray-300">source ~/.zshrc</div>
              </div>
              <div
                class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="mb-2"># 对于 bash</div>
                <div class="whitespace-nowrap text-gray-300">
                  echo 'export ANTHROPIC_BASE_URL="{{ currentBaseUrl }}"' >> ~/.bash_profile
                </div>
                <div class="whitespace-nowrap text-gray-300">
                  echo 'export ANTHROPIC_AUTH_TOKEN="你的API密钥"' >> ~/.bash_profile
                </div>
                <div class="whitespace-nowrap text-gray-300">source ~/.bash_profile</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Gemini CLI 环境变量设置 -->
        <div class="mt-8">
          <h5
            class="mb-2 flex items-center text-base font-semibold text-gray-800 dark:text-gray-600 sm:mb-3 sm:text-lg"
          >
            <i class="fas fa-robot mr-2 text-green-600" />
            配置 Gemini CLI 环境变量
          </h5>
          <p class="mb-3 text-sm text-gray-700 dark:text-gray-300 sm:mb-4 sm:text-base">
            如果你使用 Gemini CLI，需要设置以下环境变量：
          </p>

          <div class="space-y-4">
            <div class="rounded-lg border border-green-200 bg-white p-3 sm:p-4">
              <h6 class="mb-2 text-sm font-medium text-gray-800 dark:text-gray-600 sm:text-base">
                Terminal 设置方法
              </h6>
              <p class="mb-3 text-sm text-gray-600">在 Terminal 中运行以下命令：</p>
              <div
                class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="whitespace-nowrap text-gray-300">
                  export CODE_ASSIST_ENDPOINT="{{ geminiBaseUrl }}"
                </div>
                <div class="whitespace-nowrap text-gray-300">
                  export GOOGLE_CLOUD_ACCESS_TOKEN="你的API密钥"
                </div>
                <div class="whitespace-nowrap text-gray-300">
                  export GOOGLE_GENAI_USE_GCA="true"
                </div>
              </div>
              <p class="mt-2 text-xs text-yellow-700">
                💡 使用与 Claude Code 相同的 API 密钥即可。
              </p>
            </div>

            <div class="rounded-lg border border-green-200 bg-white p-3 sm:p-4">
              <h6 class="mb-2 text-sm font-medium text-gray-800 dark:text-gray-600 sm:text-base">
                永久设置方法
              </h6>
              <p class="mb-3 text-sm text-gray-600">添加到你的 shell 配置文件：</p>
              <div
                class="mb-3 overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="mb-2"># 对于 zsh (默认)</div>
                <div class="whitespace-nowrap text-gray-300">
                  echo 'export CODE_ASSIST_ENDPOINT="{{ geminiBaseUrl }}"' >> ~/.zshrc
                </div>
                <div class="whitespace-nowrap text-gray-300">
                  echo 'export GOOGLE_CLOUD_ACCESS_TOKEN="你的API密钥"' >> ~/.zshrc
                </div>
                <div class="whitespace-nowrap text-gray-300">
                  echo 'export GOOGLE_GENAI_USE_GCA="true"' >> ~/.zshrc
                </div>
                <div class="whitespace-nowrap text-gray-300">source ~/.zshrc</div>
              </div>
              <div
                class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="mb-2"># 对于 bash</div>
                <div class="whitespace-nowrap text-gray-300">
                  echo 'export CODE_ASSIST_ENDPOINT="{{ geminiBaseUrl }}"' >> ~/.bash_profile
                </div>
                <div class="whitespace-nowrap text-gray-300">
                  echo 'export GOOGLE_CLOUD_ACCESS_TOKEN="你的API密钥"' >> ~/.bash_profile
                </div>
                <div class="whitespace-nowrap text-gray-300">
                  echo 'export GOOGLE_GENAI_USE_GCA="true"' >> ~/.bash_profile
                </div>
                <div class="whitespace-nowrap text-gray-300">source ~/.bash_profile</div>
              </div>
            </div>

            <div class="rounded-lg border border-green-200 bg-green-50 p-3 sm:p-4">
              <h6 class="mb-2 font-medium text-green-800 dark:text-green-300">
                验证 Gemini CLI 环境变量
              </h6>
              <p class="mb-3 text-sm text-green-700">在 Terminal 中验证：</p>
              <div
                class="space-y-1 overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="whitespace-nowrap text-gray-300">echo $CODE_ASSIST_ENDPOINT</div>
                <div class="whitespace-nowrap text-gray-300">echo $GOOGLE_CLOUD_ACCESS_TOKEN</div>
                <div class="whitespace-nowrap text-gray-300">echo $GOOGLE_GENAI_USE_GCA</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Codex 环境变量设置 -->
        <div class="mt-8">
          <h5
            class="mb-2 flex items-center text-base font-semibold text-gray-800 dark:text-gray-600 sm:mb-3 sm:text-lg"
          >
            <i class="fas fa-code mr-2 text-indigo-600" />
            配置 Codex 环境变量
          </h5>
          <p class="mb-3 text-sm text-gray-700 dark:text-gray-300 sm:mb-4 sm:text-base">
            如果你使用支持 OpenAI API 的工具（如 Codex），需要设置以下环境变量：
          </p>

          <div class="space-y-4">
            <div class="rounded-lg border border-indigo-200 bg-white p-3 sm:p-4">
              <h6 class="mb-2 text-sm font-medium text-gray-800 dark:text-gray-600 sm:text-base">
                Terminal 设置方法
              </h6>
              <p class="mb-3 text-sm text-gray-600">在 Terminal 中运行以下命令：</p>
              <div
                class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="whitespace-nowrap text-gray-300">
                  export OPENAI_BASE_URL="{{ openaiBaseUrl }}"
                </div>
                <div class="whitespace-nowrap text-gray-300">
                  export OPENAI_API_KEY="你的API密钥"
                </div>
              </div>
              <p class="mt-2 text-xs text-yellow-700">
                💡 使用与 Claude Code 相同的 API 密钥即可，格式如 cr_xxxxxxxxxx。
              </p>
            </div>

            <div class="rounded-lg border border-indigo-200 bg-white p-3 sm:p-4">
              <h6 class="mb-2 text-sm font-medium text-gray-800 dark:text-gray-600 sm:text-base">
                永久设置方法
              </h6>
              <p class="mb-3 text-sm text-gray-600">添加到你的 shell 配置文件：</p>
              <div
                class="mb-3 overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="mb-2"># 对于 zsh (默认)</div>
                <div class="whitespace-nowrap text-gray-300">
                  echo 'export OPENAI_BASE_URL="{{ openaiBaseUrl }}"' >> ~/.zshrc
                </div>
                <div class="whitespace-nowrap text-gray-300">
                  echo 'export OPENAI_API_KEY="你的API密钥"' >> ~/.zshrc
                </div>
                <div class="whitespace-nowrap text-gray-300">source ~/.zshrc</div>
              </div>
              <div
                class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="mb-2"># 对于 bash</div>
                <div class="whitespace-nowrap text-gray-300">
                  echo 'export OPENAI_BASE_URL="{{ openaiBaseUrl }}"' >> ~/.bash_profile
                </div>
                <div class="whitespace-nowrap text-gray-300">
                  echo 'export OPENAI_API_KEY="你的API密钥"' >> ~/.bash_profile
                </div>
                <div class="whitespace-nowrap text-gray-300">source ~/.bash_profile</div>
              </div>
            </div>

            <div class="rounded-lg border border-indigo-200 bg-indigo-50 p-3 sm:p-4">
              <h6 class="mb-2 font-medium text-indigo-800">验证 Codex 环境变量</h6>
              <p class="mb-3 text-sm text-indigo-700">在 Terminal 中验证：</p>
              <div
                class="space-y-1 overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="whitespace-nowrap text-gray-300">echo $OPENAI_BASE_URL</div>
                <div class="whitespace-nowrap text-gray-300">echo $OPENAI_API_KEY</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 第四步：开始使用 -->
      <div class="mb-8">
        <h4
          class="mb-3 flex items-center text-lg font-semibold text-gray-800 dark:text-gray-300 sm:mb-4 sm:text-xl"
        >
          <span
            class="mr-2 flex h-6 w-6 items-center justify-center rounded-full bg-yellow-500 text-xs font-bold text-white sm:mr-3 sm:h-8 sm:w-8 sm:text-sm"
            >4</span
          >
          开始使用 Claude Code
        </h4>
        <div
          class="rounded-xl border border-yellow-100 bg-gradient-to-r from-yellow-50 to-amber-50 p-4 sm:p-6"
        >
          <p class="mb-3 text-sm text-gray-700 dark:text-gray-300 sm:mb-4 sm:text-base">
            现在你可以开始使用 Claude Code 了！
          </p>

          <div class="space-y-4">
            <div>
              <h6 class="mb-2 text-sm font-medium text-gray-800 dark:text-gray-600 sm:text-base">
                启动 Claude Code
              </h6>
              <div
                class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="whitespace-nowrap text-gray-300">claude</div>
              </div>
            </div>

            <div>
              <h6 class="mb-2 text-sm font-medium text-gray-800 dark:text-gray-600 sm:text-base">
                在特定项目中使用
              </h6>
              <div
                class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="mb-2"># 进入你的项目目录</div>
                <div class="whitespace-nowrap text-gray-300">cd /path/to/your/project</div>
                <div class="mb-2 mt-2"># 启动 Claude Code</div>
                <div class="whitespace-nowrap text-gray-300">claude</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- macOS 故障排除 -->
      <div class="mb-8">
        <h4
          class="mb-3 flex items-center text-lg font-semibold text-gray-800 dark:text-gray-300 sm:mb-4 sm:text-xl"
        >
          <i class="fas fa-wrench mr-2 text-red-600 sm:mr-3" />
          macOS 常见问题解决
        </h4>
        <div class="space-y-4">
          <details class="rounded-lg border border-gray-200 bg-gray-50">
            <summary
              class="cursor-pointer p-3 text-sm font-medium text-gray-800 hover:bg-gray-100 sm:p-4 sm:text-base"
            >
              安装时提示权限错误
            </summary>
            <div class="px-3 pb-3 text-gray-600 sm:px-4 sm:pb-4">
              <p class="mb-2">尝试以下解决方法：</p>
              <ul class="list-inside list-disc space-y-1 text-sm">
                <li>
                  使用 sudo 安装：<code class="rounded bg-gray-200 px-1 text-xs sm:text-sm"
                    >sudo npm install -g @anthropic-ai/claude-code</code
                  >
                </li>
                <li>
                  或者配置 npm 使用用户目录：<code
                    class="rounded bg-gray-200 px-1 text-xs sm:text-sm"
                    >npm config set prefix ~/.npm-global</code
                  >
                </li>
              </ul>
            </div>
          </details>

          <details class="rounded-lg border border-gray-200 bg-gray-50">
            <summary
              class="cursor-pointer p-3 text-sm font-medium text-gray-800 hover:bg-gray-100 sm:p-4 sm:text-base"
            >
              macOS 安全设置阻止运行
            </summary>
            <div class="px-3 pb-3 text-gray-600 sm:px-4 sm:pb-4">
              <p class="mb-2">如果系统阻止运行 Claude Code：</p>
              <ul class="list-inside list-disc space-y-1 text-sm">
                <li>打开"系统偏好设置" → "安全性与隐私"</li>
                <li>点击"仍要打开"或"允许"</li>
                <li>
                  或者在 Terminal 中运行：<code class="rounded bg-gray-200 px-1 text-xs sm:text-sm"
                    >sudo spctl --master-disable</code
                  >
                </li>
              </ul>
            </div>
          </details>

          <details class="rounded-lg border border-gray-200 bg-gray-50">
            <summary
              class="cursor-pointer p-3 text-sm font-medium text-gray-800 hover:bg-gray-100 sm:p-4 sm:text-base"
            >
              环境变量不生效
            </summary>
            <div class="px-3 pb-3 text-gray-600 sm:px-4 sm:pb-4">
              <p class="mb-2">检查以下几点：</p>
              <ul class="list-inside list-disc space-y-1 text-sm">
                <li>确认修改了正确的配置文件（.zshrc 或 .bash_profile）</li>
                <li>重新启动 Terminal</li>
                <li>
                  验证设置：<code class="rounded bg-gray-200 px-1 text-xs sm:text-sm"
                    >echo $ANTHROPIC_BASE_URL</code
                  >
                </li>
              </ul>
            </div>
          </details>
        </div>
      </div>
    </div>

    <!-- Linux 教程 -->
    <div v-else-if="activeTutorialSystem === 'linux'" class="tutorial-content">
      <!-- 第一步：安装 Node.js -->
      <div class="mb-6 sm:mb-10">
        <h4
          class="mb-3 flex items-center text-lg font-semibold text-gray-800 dark:text-gray-300 sm:mb-4 sm:text-xl"
        >
          <span
            class="mr-2 flex h-6 w-6 items-center justify-center rounded-full bg-blue-500 text-xs font-bold text-white sm:mr-3 sm:h-8 sm:w-8 sm:text-sm"
            >1</span
          >
          安装 Node.js 环境
        </h4>
        <p class="mb-4 text-gray-600 sm:mb-6">Claude Code 需要 Node.js 环境才能运行。</p>

        <div
          class="mb-4 rounded-xl border border-orange-100 bg-gradient-to-r from-orange-50 to-red-50 p-4 sm:mb-6 sm:p-6"
        >
          <h5
            class="mb-2 flex items-center text-base font-semibold text-gray-800 dark:text-gray-600 sm:mb-3 sm:text-lg"
          >
            <i class="fab fa-ubuntu mr-2 text-orange-600" />
            Linux 安装方法
          </h5>
          <div class="mb-4">
            <p class="mb-3 text-gray-700">方法一：使用官方仓库（推荐）</p>
            <div
              class="overflow-x-auto rounded-lg bg-gray-900 p-3 font-mono text-xs text-green-400 sm:p-4 sm:text-sm"
            >
              <div class="mb-2"># 添加 NodeSource 仓库</div>
              <div class="whitespace-nowrap text-gray-300">
                curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
              </div>
              <div class="mb-2 mt-3"># 安装 Node.js</div>
              <div class="whitespace-nowrap text-gray-300">sudo apt-get install -y nodejs</div>
            </div>
          </div>
          <div class="mb-4">
            <p class="mb-3 text-gray-700">方法二：使用系统包管理器</p>
            <p class="mb-2 text-xs text-gray-600 dark:text-gray-400 sm:text-sm">
              虽然版本可能不是最新的，但对于基本使用已经足够：
            </p>
            <div
              class="overflow-x-auto rounded-lg bg-gray-900 p-3 font-mono text-xs text-green-400 sm:p-4 sm:text-sm"
            >
              <div class="mb-2"># Ubuntu/Debian</div>
              <div class="whitespace-nowrap text-gray-300">sudo apt update</div>
              <div class="whitespace-nowrap text-gray-300">sudo apt install nodejs npm</div>
              <div class="mb-2 mt-3"># CentOS/RHEL/Fedora</div>
              <div class="whitespace-nowrap text-gray-300">sudo dnf install nodejs npm</div>
            </div>
          </div>
          <div class="rounded-lg border border-orange-200 bg-orange-50 p-3 sm:p-4">
            <h6 class="mb-2 text-sm font-medium text-orange-800 sm:text-base">Linux 注意事项</h6>
            <ul class="space-y-1 text-xs text-orange-700 sm:text-sm">
              <li>• 某些发行版可能需要安装额外的依赖</li>
              <li>• 如果遇到权限问题，使用 <code class="rounded bg-orange-200 px-1">sudo</code></li>
              <li>• 确保你的用户在 npm 的全局目录有写权限</li>
            </ul>
          </div>
        </div>

        <!-- 验证安装 -->
        <div class="rounded-lg border border-green-200 bg-green-50 p-3 sm:p-4">
          <h6 class="mb-2 font-medium text-green-800 dark:text-green-300">验证安装是否成功</h6>
          <p class="mb-3 text-sm text-green-700">安装完成后，打开终端，输入以下命令：</p>
          <div
            class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
          >
            <div class="whitespace-nowrap text-gray-300">node --version</div>
            <div class="whitespace-nowrap text-gray-300">npm --version</div>
          </div>
          <p class="mt-2 text-sm text-green-700">如果显示版本号，说明安装成功了！</p>
        </div>
      </div>

      <!-- 第二步：安装 Claude Code -->
      <div class="mb-6 sm:mb-10">
        <h4
          class="mb-3 flex items-center text-lg font-semibold text-gray-800 dark:text-gray-300 sm:mb-4 sm:text-xl"
        >
          <span
            class="mr-2 flex h-6 w-6 items-center justify-center rounded-full bg-green-500 text-xs font-bold text-white sm:mr-3 sm:h-8 sm:w-8 sm:text-sm"
            >2</span
          >
          安装 Claude Code
        </h4>

        <div
          class="mb-4 rounded-xl border border-purple-100 bg-gradient-to-r from-purple-50 to-pink-50 p-4 sm:mb-6 sm:p-6"
        >
          <h5
            class="mb-2 flex items-center text-base font-semibold text-gray-800 dark:text-gray-600 sm:mb-3 sm:text-lg"
          >
            <i class="fas fa-download mr-2 text-purple-600" />
            安装 Claude Code
          </h5>
          <p class="mb-3 text-sm text-gray-700 dark:text-gray-300 sm:mb-4 sm:text-base">
            打开终端，运行以下命令：
          </p>
          <div
            class="mb-4 overflow-x-auto rounded-lg bg-gray-900 p-3 font-mono text-xs text-green-400 sm:p-4 sm:text-sm"
          >
            <div class="mb-2"># 全局安装 Claude Code</div>
            <div class="whitespace-nowrap text-gray-300">
              npm install -g @anthropic-ai/claude-code
            </div>
          </div>
          <p class="mb-2 text-sm text-gray-600">如果遇到权限问题，可以使用 sudo：</p>
          <div
            class="overflow-x-auto rounded-lg bg-gray-900 p-3 font-mono text-xs text-green-400 sm:p-4 sm:text-sm"
          >
            <div class="whitespace-nowrap text-gray-300">
              sudo npm install -g @anthropic-ai/claude-code
            </div>
          </div>
        </div>

        <!-- 验证安装 -->
        <div class="rounded-lg border border-green-200 bg-green-50 p-3 sm:p-4">
          <h6 class="mb-2 font-medium text-green-800 dark:text-green-300">验证 Claude Code 安装</h6>
          <p class="mb-3 text-sm text-green-700">安装完成后，输入以下命令检查是否安装成功：</p>
          <div
            class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
          >
            <div class="whitespace-nowrap text-gray-300">claude --version</div>
          </div>
          <p class="mt-2 text-sm text-green-700">
            如果显示版本号，恭喜你！Claude Code 已经成功安装了。
          </p>
        </div>
      </div>

      <!-- 第三步：设置环境变量 -->
      <div class="mb-6 sm:mb-10">
        <h4
          class="mb-3 flex items-center text-lg font-semibold text-gray-800 dark:text-gray-300 sm:mb-4 sm:text-xl"
        >
          <span
            class="mr-2 flex h-6 w-6 items-center justify-center rounded-full bg-orange-500 text-xs font-bold text-white sm:mr-3 sm:h-8 sm:w-8 sm:text-sm"
            >3</span
          >
          设置环境变量
        </h4>

        <div
          class="mb-4 rounded-xl border border-orange-100 bg-gradient-to-r from-orange-50 to-yellow-50 p-4 sm:mb-6 sm:p-6"
        >
          <h5
            class="mb-2 flex items-center text-base font-semibold text-gray-800 dark:text-gray-600 sm:mb-3 sm:text-lg"
          >
            <i class="fas fa-cog mr-2 text-orange-600" />
            配置 Claude Code 环境变量
          </h5>
          <p class="mb-3 text-sm text-gray-700 dark:text-gray-300 sm:mb-4 sm:text-base">
            为了让 Claude Code 连接到你的中转服务，需要设置两个环境变量：
          </p>

          <div class="space-y-4">
            <div class="rounded-lg border border-orange-200 bg-white p-3 sm:p-4">
              <h6 class="mb-2 text-sm font-medium text-gray-800 dark:text-gray-600 sm:text-base">
                方法一：临时设置（当前会话）
              </h6>
              <p class="mb-3 text-sm text-gray-600">在终端中运行以下命令：</p>
              <div
                class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="whitespace-nowrap text-gray-300">
                  export ANTHROPIC_BASE_URL="{{ currentBaseUrl }}"
                </div>
                <div class="whitespace-nowrap text-gray-300">
                  export ANTHROPIC_AUTH_TOKEN="你的API密钥"
                </div>
              </div>
              <p class="mt-2 text-xs text-yellow-700">
                💡 记得将 "你的API密钥" 替换为在上方 "API Keys" 标签页中创建的实际密钥。
              </p>
            </div>

            <div class="rounded-lg border border-orange-200 bg-white p-3 sm:p-4">
              <h6 class="mb-2 text-sm font-medium text-gray-800 dark:text-gray-600 sm:text-base">
                方法二：永久设置
              </h6>
              <p class="mb-3 text-sm text-gray-600">编辑你的 shell 配置文件：</p>
              <div
                class="mb-3 overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="mb-2"># 对于 bash (默认)</div>
                <div class="whitespace-nowrap text-gray-300">
                  echo 'export ANTHROPIC_BASE_URL="{{ currentBaseUrl }}"' >> ~/.bashrc
                </div>
                <div class="whitespace-nowrap text-gray-300">
                  echo 'export ANTHROPIC_AUTH_TOKEN="你的API密钥"' >> ~/.bashrc
                </div>
                <div class="whitespace-nowrap text-gray-300">source ~/.bashrc</div>
              </div>
              <div
                class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="mb-2"># 对于 zsh</div>
                <div class="whitespace-nowrap text-gray-300">
                  echo 'export ANTHROPIC_BASE_URL="{{ currentBaseUrl }}"' >> ~/.zshrc
                </div>
                <div class="whitespace-nowrap text-gray-300">
                  echo 'export ANTHROPIC_AUTH_TOKEN="你的API密钥"' >> ~/.zshrc
                </div>
                <div class="whitespace-nowrap text-gray-300">source ~/.zshrc</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Gemini CLI 环境变量设置 -->
        <div class="mt-8">
          <h5
            class="mb-2 flex items-center text-base font-semibold text-gray-800 dark:text-gray-600 sm:mb-3 sm:text-lg"
          >
            <i class="fas fa-robot mr-2 text-green-600" />
            配置 Gemini CLI 环境变量
          </h5>
          <p class="mb-3 text-sm text-gray-700 dark:text-gray-300 sm:mb-4 sm:text-base">
            如果你使用 Gemini CLI，需要设置以下环境变量：
          </p>

          <div class="space-y-4">
            <div class="rounded-lg border border-green-200 bg-white p-3 sm:p-4">
              <h6 class="mb-2 text-sm font-medium text-gray-800 dark:text-gray-600 sm:text-base">
                终端设置方法
              </h6>
              <p class="mb-3 text-sm text-gray-600">在终端中运行以下命令：</p>
              <div
                class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="whitespace-nowrap text-gray-300">
                  export CODE_ASSIST_ENDPOINT="{{ geminiBaseUrl }}"
                </div>
                <div class="whitespace-nowrap text-gray-300">
                  export GOOGLE_CLOUD_ACCESS_TOKEN="你的API密钥"
                </div>
                <div class="whitespace-nowrap text-gray-300">
                  export GOOGLE_GENAI_USE_GCA="true"
                </div>
              </div>
              <p class="mt-2 text-xs text-yellow-700">
                💡 使用与 Claude Code 相同的 API 密钥即可。
              </p>
            </div>

            <div class="rounded-lg border border-green-200 bg-white p-3 sm:p-4">
              <h6 class="mb-2 text-sm font-medium text-gray-800 dark:text-gray-600 sm:text-base">
                永久设置方法
              </h6>
              <p class="mb-3 text-sm text-gray-600">添加到你的 shell 配置文件：</p>
              <div
                class="mb-3 overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="mb-2"># 对于 bash (默认)</div>
                <div class="whitespace-nowrap text-gray-300">
                  echo 'export CODE_ASSIST_ENDPOINT="{{ geminiBaseUrl }}"' >> ~/.bashrc
                </div>
                <div class="whitespace-nowrap text-gray-300">
                  echo 'export GOOGLE_CLOUD_ACCESS_TOKEN="你的API密钥"' >> ~/.bashrc
                </div>
                <div class="whitespace-nowrap text-gray-300">
                  echo 'export GOOGLE_GENAI_USE_GCA="true"' >> ~/.bashrc
                </div>
                <div class="whitespace-nowrap text-gray-300">source ~/.bashrc</div>
              </div>
              <div
                class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="mb-2"># 对于 zsh</div>
                <div class="whitespace-nowrap text-gray-300">
                  echo 'export CODE_ASSIST_ENDPOINT="{{ geminiBaseUrl }}"' >> ~/.zshrc
                </div>
                <div class="whitespace-nowrap text-gray-300">
                  echo 'export GOOGLE_CLOUD_ACCESS_TOKEN="你的API密钥"' >> ~/.zshrc
                </div>
                <div class="whitespace-nowrap text-gray-300">
                  echo 'export GOOGLE_GENAI_USE_GCA="true"' >> ~/.zshrc
                </div>
                <div class="whitespace-nowrap text-gray-300">source ~/.zshrc</div>
              </div>
            </div>

            <div class="rounded-lg border border-green-200 bg-green-50 p-3 sm:p-4">
              <h6 class="mb-2 font-medium text-green-800 dark:text-green-300">
                验证 Gemini CLI 环境变量
              </h6>
              <p class="mb-3 text-sm text-green-700">在终端中验证：</p>
              <div
                class="space-y-1 overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="whitespace-nowrap text-gray-300">echo $CODE_ASSIST_ENDPOINT</div>
                <div class="whitespace-nowrap text-gray-300">echo $GOOGLE_CLOUD_ACCESS_TOKEN</div>
                <div class="whitespace-nowrap text-gray-300">echo $GOOGLE_GENAI_USE_GCA</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Codex 环境变量设置 -->
        <div class="mt-8">
          <h5
            class="mb-2 flex items-center text-base font-semibold text-gray-800 dark:text-gray-600 sm:mb-3 sm:text-lg"
          >
            <i class="fas fa-code mr-2 text-indigo-600" />
            配置 Codex 环境变量
          </h5>
          <p class="mb-3 text-sm text-gray-700 dark:text-gray-300 sm:mb-4 sm:text-base">
            如果你使用支持 OpenAI API 的工具（如 Codex），需要设置以下环境变量：
          </p>

          <div class="space-y-4">
            <div class="rounded-lg border border-indigo-200 bg-white p-3 sm:p-4">
              <h6 class="mb-2 text-sm font-medium text-gray-800 dark:text-gray-600 sm:text-base">
                终端设置方法
              </h6>
              <p class="mb-3 text-sm text-gray-600">在终端中运行以下命令：</p>
              <div
                class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="whitespace-nowrap text-gray-300">
                  export OPENAI_BASE_URL="{{ openaiBaseUrl }}"
                </div>
                <div class="whitespace-nowrap text-gray-300">
                  export OPENAI_API_KEY="你的API密钥"
                </div>
              </div>
              <p class="mt-2 text-xs text-yellow-700">
                💡 使用与 Claude Code 相同的 API 密钥即可，格式如 cr_xxxxxxxxxx。
              </p>
            </div>

            <div class="rounded-lg border border-indigo-200 bg-white p-3 sm:p-4">
              <h6 class="mb-2 text-sm font-medium text-gray-800 dark:text-gray-600 sm:text-base">
                永久设置方法
              </h6>
              <p class="mb-3 text-sm text-gray-600">添加到你的 shell 配置文件：</p>
              <div
                class="mb-3 overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="mb-2"># 对于 bash (默认)</div>
                <div class="whitespace-nowrap text-gray-300">
                  echo 'export OPENAI_BASE_URL="{{ openaiBaseUrl }}"' >> ~/.bashrc
                </div>
                <div class="whitespace-nowrap text-gray-300">
                  echo 'export OPENAI_API_KEY="你的API密钥"' >> ~/.bashrc
                </div>
                <div class="whitespace-nowrap text-gray-300">source ~/.bashrc</div>
              </div>
              <div
                class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="mb-2"># 对于 zsh</div>
                <div class="whitespace-nowrap text-gray-300">
                  echo 'export OPENAI_BASE_URL="{{ openaiBaseUrl }}"' >> ~/.zshrc
                </div>
                <div class="whitespace-nowrap text-gray-300">
                  echo 'export OPENAI_API_KEY="你的API密钥"' >> ~/.zshrc
                </div>
                <div class="whitespace-nowrap text-gray-300">source ~/.zshrc</div>
              </div>
            </div>

            <div class="rounded-lg border border-indigo-200 bg-indigo-50 p-3 sm:p-4">
              <h6 class="mb-2 font-medium text-indigo-800">验证 Codex 环境变量</h6>
              <p class="mb-3 text-sm text-indigo-700">在终端中验证：</p>
              <div
                class="space-y-1 overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="whitespace-nowrap text-gray-300">echo $OPENAI_BASE_URL</div>
                <div class="whitespace-nowrap text-gray-300">echo $OPENAI_API_KEY</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 第四步：开始使用 -->
      <div class="mb-8">
        <h4
          class="mb-3 flex items-center text-lg font-semibold text-gray-800 dark:text-gray-300 sm:mb-4 sm:text-xl"
        >
          <span
            class="mr-2 flex h-6 w-6 items-center justify-center rounded-full bg-yellow-500 text-xs font-bold text-white sm:mr-3 sm:h-8 sm:w-8 sm:text-sm"
            >4</span
          >
          开始使用 Claude Code
        </h4>
        <div
          class="rounded-xl border border-yellow-100 bg-gradient-to-r from-yellow-50 to-amber-50 p-4 sm:p-6"
        >
          <p class="mb-3 text-sm text-gray-700 dark:text-gray-300 sm:mb-4 sm:text-base">
            现在你可以开始使用 Claude Code 了！
          </p>

          <div class="space-y-4">
            <div>
              <h6 class="mb-2 text-sm font-medium text-gray-800 dark:text-gray-600 sm:text-base">
                启动 Claude Code
              </h6>
              <div
                class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="whitespace-nowrap text-gray-300">claude</div>
              </div>
            </div>

            <div>
              <h6 class="mb-2 text-sm font-medium text-gray-800 dark:text-gray-600 sm:text-base">
                在特定项目中使用
              </h6>
              <div
                class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="mb-2"># 进入你的项目目录</div>
                <div class="whitespace-nowrap text-gray-300">cd /path/to/your/project</div>
                <div class="mb-2 mt-2"># 启动 Claude Code</div>
                <div class="whitespace-nowrap text-gray-300">claude</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Linux 故障排除 -->
      <div class="mb-8">
        <h4
          class="mb-3 flex items-center text-lg font-semibold text-gray-800 dark:text-gray-300 sm:mb-4 sm:text-xl"
        >
          <i class="fas fa-wrench mr-2 text-red-600 sm:mr-3" />
          Linux 常见问题解决
        </h4>
        <div class="space-y-4">
          <details class="rounded-lg border border-gray-200 bg-gray-50">
            <summary
              class="cursor-pointer p-3 text-sm font-medium text-gray-800 hover:bg-gray-100 sm:p-4 sm:text-base"
            >
              安装时提示权限错误
            </summary>
            <div class="px-3 pb-3 text-gray-600 sm:px-4 sm:pb-4">
              <p class="mb-2">尝试以下解决方法：</p>
              <ul class="list-inside list-disc space-y-1 text-sm">
                <li>
                  使用 sudo 安装：<code class="rounded bg-gray-200 px-1 text-xs sm:text-sm"
                    >sudo npm install -g @anthropic-ai/claude-code</code
                  >
                </li>
                <li>
                  或者配置 npm 使用用户目录：<code
                    class="rounded bg-gray-200 px-1 text-xs sm:text-sm"
                    >npm config set prefix ~/.npm-global</code
                  >
                </li>
                <li>
                  然后添加到 PATH：<code class="rounded bg-gray-200 px-1 text-xs sm:text-sm"
                    >export PATH=~/.npm-global/bin:$PATH</code
                  >
                </li>
              </ul>
            </div>
          </details>

          <details class="rounded-lg border border-gray-200 bg-gray-50">
            <summary
              class="cursor-pointer p-3 text-sm font-medium text-gray-800 hover:bg-gray-100 sm:p-4 sm:text-base"
            >
              缺少依赖库
            </summary>
            <div class="px-3 pb-3 text-gray-600 sm:px-4 sm:pb-4">
              <p class="mb-2">某些 Linux 发行版需要安装额外依赖：</p>
              <div
                class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="mb-2"># Ubuntu/Debian</div>
                <div class="whitespace-nowrap text-gray-300">sudo apt install build-essential</div>
                <div class="mb-2 mt-2"># CentOS/RHEL</div>
                <div class="whitespace-nowrap text-gray-300">
                  sudo dnf groupinstall "Development Tools"
                </div>
              </div>
            </div>
          </details>

          <details class="rounded-lg border border-gray-200 bg-gray-50">
            <summary
              class="cursor-pointer p-3 text-sm font-medium text-gray-800 hover:bg-gray-100 sm:p-4 sm:text-base"
            >
              环境变量不生效
            </summary>
            <div class="px-3 pb-3 text-gray-600 sm:px-4 sm:pb-4">
              <p class="mb-2">检查以下几点：</p>
              <ul class="list-inside list-disc space-y-1 text-sm">
                <li>确认修改了正确的配置文件（.bashrc 或 .zshrc）</li>
                <li>
                  重新启动终端或运行
                  <code class="rounded bg-gray-200 px-1 text-xs sm:text-sm">source ~/.bashrc</code>
                </li>
                <li>
                  验证设置：<code class="rounded bg-gray-200 px-1 text-xs sm:text-sm"
                    >echo $ANTHROPIC_BASE_URL</code
                  >
                </li>
              </ul>
            </div>
          </details>
        </div>
      </div>
    </div>

    <!-- 结尾 -->
    <div
      class="rounded-xl bg-gradient-to-r from-blue-500 to-purple-600 p-4 text-center text-white sm:p-6"
    >
      <h5 class="mb-2 text-lg font-semibold sm:text-xl">🎉 恭喜你！</h5>
      <p class="mb-3 text-sm text-blue-100 sm:mb-4 sm:text-base">
        你已经成功安装并配置了 Claude Code，现在可以开始享受 AI 编程助手带来的便利了。
      </p>
      <p class="text-xs text-blue-200 sm:text-sm">
        如果在使用过程中遇到任何问题，可以查看官方文档或社区讨论获取帮助。
      </p>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

// 当前系统选择
const activeTutorialSystem = ref('windows')

// 系统列表
const tutorialSystems = [
  { key: 'windows', name: 'Windows', icon: 'fab fa-windows' },
  { key: 'macos', name: 'macOS', icon: 'fab fa-apple' },
  { key: 'linux', name: 'Linux / WSL2', icon: 'fab fa-linux' }
]

// 获取基础URL前缀
const getBaseUrlPrefix = () => {
  // 更健壮的获取 origin 的方法，兼容旧版浏览器和特殊环境
  let origin = ''

  if (window.location.origin) {
    // 现代浏览器直接支持 origin
    origin = window.location.origin
  } else {
    // 旧版浏览器或特殊环境的兼容处理
    const protocol = window.location.protocol
    const hostname = window.location.hostname
    const port = window.location.port

    origin = protocol + '//' + hostname

    // 只有在非默认端口时才添加端口号
    if (
      port &&
      ((protocol === 'http:' && port !== '80') || (protocol === 'https:' && port !== '443'))
    ) {
      origin += ':' + port
    }
  }

  // 如果还是获取不到，使用当前页面的 URL 推导
  if (!origin) {
    const currentUrl = window.location.href
    const pathStart = currentUrl.indexOf('/', 8) // 跳过 http:// 或 https://
    if (pathStart !== -1) {
      origin = currentUrl.substring(0, pathStart)
    } else {
      // 最后的降级方案，使用相对路径
      console.warn('无法获取完整的 origin，将使用相对路径')
      return ''
    }
  }

  return origin
}

// 当前基础URL - Claude Code
const currentBaseUrl = computed(() => {
  return getBaseUrlPrefix() + '/api'
})

// Gemini CLI 基础URL
const geminiBaseUrl = computed(() => {
  return getBaseUrlPrefix() + '/gemini'
})

// OpenAI/Codex 基础URL
const openaiBaseUrl = computed(() => {
  return getBaseUrlPrefix() + '/openai'
})
</script>

<style scoped>
.tutorial-container {
  min-height: calc(100vh - 300px);
}

.tutorial-content {
  animation: fadeIn 0.3s ease-in-out;
}

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

code {
  font-family: 'Fira Code', 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
}

.tutorial-content h4 {
  scroll-margin-top: 100px;
}

.tutorial-content .bg-gradient-to-r {
  transition: all 0.2s ease;
}

.tutorial-content .bg-gradient-to-r:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}
</style>
