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
      <div class="flex flex-wrap gap-1 rounded-xl bg-gray-100 p-1 dark:bg-gray-800 sm:gap-2 sm:p-2">
        <button
          v-for="system in tutorialSystems"
          :key="system.key"
          :class="[
            'flex flex-1 items-center justify-center gap-1 rounded-lg px-3 py-2 text-xs font-semibold transition-all duration-300 sm:gap-2 sm:px-6 sm:py-3 sm:text-sm',
            activeTutorialSystem === system.key
              ? 'bg-white text-blue-600 shadow-sm dark:bg-blue-600 dark:text-white dark:shadow-blue-500/40'
              : 'text-gray-600 hover:bg-white/50 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-white'
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
          class="mb-4 rounded-xl border border-blue-100 bg-gradient-to-r from-blue-50 to-indigo-50 p-4 dark:border-blue-500/40 dark:from-blue-950/30 dark:to-indigo-950/30 sm:mb-4 sm:mb-6 sm:p-6"
        >
          <h5
            class="mb-2 flex items-center text-base font-semibold text-gray-800 dark:text-gray-200 sm:mb-3 sm:text-lg"
          >
            <i class="fab fa-windows mr-2 text-blue-600" />
            Windows 安装方法
          </h5>
          <div class="mb-3 sm:mb-4">
            <p class="mb-2 text-sm text-gray-700 dark:text-gray-300 sm:mb-3 sm:text-base">
              方法一：官网下载（推荐）
            </p>
            <ol
              class="ml-2 list-inside list-decimal space-y-1 text-xs text-gray-600 dark:text-gray-400 sm:ml-4 sm:space-y-2 sm:text-sm"
            >
              <li>
                打开浏览器访问
                <code
                  class="rounded bg-gray-100 px-1 py-1 text-xs dark:bg-gray-800 dark:text-yellow-400 sm:px-2 sm:text-sm"
                  >https://nodejs.org/</code
                >
              </li>
              <li>点击 "LTS" 版本进行下载（推荐长期支持版本）</li>
              <li>
                下载完成后双击
                <code
                  class="rounded bg-gray-100 px-1 py-1 text-xs dark:bg-gray-800 dark:text-yellow-400 sm:px-2 sm:text-sm"
                  >.msi</code
                >
                文件
              </li>
              <li>按照安装向导完成安装，保持默认设置即可</li>
            </ol>
          </div>
          <div class="mb-3 sm:mb-4">
            <p class="mb-2 text-sm text-gray-700 dark:text-gray-300 sm:mb-3 sm:text-base">
              方法二：使用包管理器
            </p>
            <p class="mb-2 text-xs text-gray-600 dark:text-gray-400 sm:text-sm">
              如果你安装了 Chocolatey 或 Scoop，可以使用命令行安装：
            </p>
            <div
              class="overflow-x-auto rounded-lg bg-gray-900 p-3 font-mono text-xs text-green-400 dark:border dark:border-slate-700 dark:bg-slate-900 sm:p-4 sm:text-sm"
            >
              <div class="mb-2"># 使用 Chocolatey</div>
              <div class="whitespace-nowrap text-gray-300">choco install nodejs</div>
              <div class="mb-2 mt-3"># 或使用 Scoop</div>
              <div class="whitespace-nowrap text-gray-300">scoop install nodejs</div>
            </div>
          </div>
          <div
            class="rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-500/40 dark:bg-blue-950/30 sm:p-4"
          >
            <h6 class="mb-2 text-sm font-medium text-blue-800 dark:text-blue-300 sm:text-base">
              Windows 注意事项
            </h6>
            <ul class="space-y-1 text-xs text-blue-700 dark:text-blue-300 sm:text-sm sm:text-xs">
              <li>• 建议使用 PowerShell 而不是 CMD</li>
              <li>• 如果遇到权限问题，尝试以管理员身份运行</li>
              <li>• 某些杀毒软件可能会误报，需要添加白名单</li>
            </ul>
          </div>
        </div>

        <!-- 验证安装 -->
        <div
          class="rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-500/40 dark:bg-green-950/30 sm:p-4"
        >
          <h6 class="mb-2 text-sm font-medium text-green-800 dark:text-green-300 sm:text-base">
            验证安装是否成功
          </h6>
          <p class="mb-2 text-xs text-green-700 dark:text-green-300 sm:mb-3 sm:text-sm">
            安装完成后，打开 PowerShell 或 CMD，输入以下命令：
          </p>
          <div
            class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
          >
            <div class="whitespace-nowrap text-gray-300">node --version</div>
            <div class="whitespace-nowrap text-gray-300">npm --version</div>
          </div>
          <p class="mt-2 text-xs text-green-700 dark:text-green-300 sm:text-sm">
            如果显示版本号，说明安装成功了！
          </p>
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
          class="mb-4 rounded-xl border border-green-100 bg-gradient-to-r from-green-50 to-emerald-50 p-4 dark:border-green-500/40 dark:from-green-950/30 dark:to-emerald-950/30 sm:mb-6 sm:p-6"
        >
          <h5
            class="mb-2 flex items-center text-base font-semibold text-gray-800 dark:text-gray-200 sm:mb-3 sm:text-lg"
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

          <div
            class="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-500/40 dark:bg-blue-950/30 sm:p-4"
          >
            <h6 class="mb-2 text-sm font-medium text-blue-800 dark:text-blue-300 sm:text-base">
              提示
            </h6>
            <ul class="space-y-1 text-xs text-blue-700 dark:text-blue-300 sm:text-sm">
              <li>• 建议使用 PowerShell 而不是 CMD，功能更强大</li>
              <li>• 如果遇到权限问题，以管理员身份运行 PowerShell</li>
            </ul>
          </div>
        </div>

        <!-- 验证安装 -->
        <div
          class="rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-500/40 dark:bg-green-950/30 sm:p-4"
        >
          <h6 class="mb-2 font-medium text-green-800 dark:text-green-300">验证 Claude Code 安装</h6>
          <p class="mb-3 text-sm text-green-700 dark:text-green-300">
            安装完成后，输入以下命令检查是否安装成功：
          </p>
          <div
            class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
          >
            <div class="whitespace-nowrap text-gray-300">claude --version</div>
          </div>
          <p class="mt-2 text-sm text-green-700 dark:text-green-300">
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
          class="mb-4 rounded-xl border border-purple-100 bg-gradient-to-r from-purple-50 to-pink-50 p-4 dark:border-purple-500/40 dark:from-purple-950/30 dark:to-pink-950/30 sm:mb-6 sm:p-6"
        >
          <h5
            class="mb-2 flex items-center text-base font-semibold text-gray-800 dark:text-gray-200 sm:mb-3 sm:text-lg"
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
              <h6 class="mb-2 text-sm font-medium text-gray-800 dark:text-gray-300 sm:text-base">
                方法一：PowerShell 临时设置（当前会话）
              </h6>
              <p class="mb-3 text-sm text-gray-600 dark:text-gray-400">
                在 PowerShell 中运行以下命令：
              </p>
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
              <p class="mt-2 text-xs text-yellow-700 dark:text-yellow-400">
                💡 记得将 "你的API密钥" 替换为在上方 "API Keys" 标签页中创建的实际密钥。
              </p>
            </div>

            <div
              class="rounded-lg border border-purple-200 bg-white p-3 dark:border-purple-700 dark:bg-gray-800 sm:p-4"
            >
              <h6 class="mb-2 text-sm font-medium text-gray-800 dark:text-gray-300 sm:text-base">
                方法二：PowerShell 永久设置（用户级）
              </h6>
              <p class="mb-3 text-sm text-gray-600 dark:text-gray-400">
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
              <p class="mb-3 text-sm text-gray-600 dark:text-gray-400">查看已设置的环境变量：</p>
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
              <p class="mt-2 text-xs text-blue-700 dark:text-blue-300">
                💡 设置后需要重新打开 PowerShell 窗口才能生效。
              </p>
            </div>
          </div>
        </div>

        <!-- VSCode 插件配置 -->
        <div
          class="mt-6 rounded-lg border border-indigo-200 bg-indigo-50 p-3 dark:border-indigo-500/40 dark:bg-indigo-950/30 sm:p-4"
        >
          <h6 class="mb-2 font-medium text-indigo-800 dark:text-indigo-300">
            VSCode Claude 插件配置
          </h6>
          <p class="mb-3 text-sm text-indigo-700 dark:text-indigo-300">
            如果使用 VSCode 的 Claude 插件，需要在配置文件中进行设置：
          </p>
          <div class="mb-3 space-y-2">
            <p class="text-sm text-indigo-700 dark:text-indigo-300">
              <strong>配置文件位置：</strong>
              <code class="rounded bg-indigo-100 px-1 dark:bg-indigo-900"
                >C:\Users\你的用户名\.claude\config.json</code
              >
            </p>
            <p class="text-xs text-indigo-600 dark:text-indigo-400">
              💡 如果该文件不存在，请手动创建。
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
          <h6 class="mb-2 font-medium text-blue-800 dark:text-blue-300">验证环境变量设置</h6>
          <p class="mb-3 text-sm text-blue-700 dark:text-blue-300">
            设置完环境变量后，可以通过以下命令验证是否设置成功：
          </p>

          <div class="space-y-4">
            <div>
              <h6 class="mb-2 text-sm font-medium text-gray-800 dark:text-gray-300 sm:text-base">
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
              <h6 class="mb-2 text-sm font-medium text-gray-800 dark:text-gray-300 sm:text-base">
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
            <p class="text-sm text-blue-700 dark:text-blue-300">
              <strong>预期输出示例：</strong>
            </p>
            <div class="rounded bg-gray-100 p-2 font-mono text-sm dark:bg-gray-700">
              <div>{{ currentBaseUrl }}</div>
              <div>cr_xxxxxxxxxxxxxxxxxx</div>
            </div>
            <p class="text-xs text-blue-700 dark:text-blue-300">
              💡 如果输出为空或显示变量名本身，说明环境变量设置失败，请重新设置。
            </p>
          </div>
        </div>

        <!-- Gemini CLI 环境变量设置 -->
        <div class="mt-8">
          <h5
            class="mb-2 flex items-center text-base font-semibold text-gray-800 dark:text-gray-200 sm:mb-3 sm:text-lg"
          >
            <i class="fas fa-robot mr-2 text-green-600" />
            配置 Gemini CLI 环境变量
          </h5>
          <p class="mb-3 text-sm text-gray-700 dark:text-gray-300 sm:mb-4 sm:text-base">
            如果你使用 Gemini CLI，需要设置以下环境变量：
          </p>

          <div class="space-y-4">
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
                <div class="whitespace-nowrap text-gray-300">
                  $env:GEMINI_API_KEY = "你的API密钥"
                </div>
                <div class="whitespace-nowrap text-gray-300">
                  $env:GEMINI_MODEL = "gemini-2.5-pro"
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
                  [System.Environment]::SetEnvironmentVariable("GEMINI_MODEL", "gemini-2.5-pro",
                  [System.EnvironmentVariableTarget]::User)
                </div>
              </div>
              <p class="mt-2 text-xs text-blue-700 dark:text-blue-300">
                💡 设置后需要重新打开 PowerShell 窗口才能生效。
              </p>
            </div>

            <div
              class="rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-500/40 dark:bg-green-950/30 sm:p-4"
            >
              <h6 class="mb-2 font-medium text-green-800 dark:text-green-300">
                验证 Gemini CLI 环境变量
              </h6>
              <p class="mb-3 text-sm text-green-700 dark:text-green-300">在 PowerShell 中验证：</p>
              <div
                class="space-y-1 overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="whitespace-nowrap text-gray-300">echo $env:GOOGLE_GEMINI_BASE_URL</div>
                <div class="whitespace-nowrap text-gray-300">echo $env:GEMINI_API_KEY</div>
                <div class="whitespace-nowrap text-gray-300">echo $env:GEMINI_MODEL</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Codex 环境变量设置 -->
        <div class="mt-8">
          <h5
            class="mb-2 flex items-center text-base font-semibold text-gray-800 dark:text-gray-200 sm:mb-3 sm:text-lg"
          >
            <i class="fas fa-code mr-2 text-indigo-600" />
            配置 Codex 环境变量
          </h5>
          <p class="mb-3 text-sm text-gray-700 dark:text-gray-300 sm:mb-4 sm:text-base">
            如果你使用支持 OpenAI API 的工具（如 Codex），需要设置以下环境变量：
          </p>

          <div class="space-y-4">
            <div
              class="rounded-lg border border-yellow-200 bg-yellow-50 p-3 dark:border-yellow-500/40 dark:bg-yellow-950/30 sm:p-4"
            >
              <h6 class="mb-2 font-medium text-yellow-800 dark:text-yellow-300">Codex 配置文件</h6>
              <p class="mb-3 text-sm text-yellow-700 dark:text-yellow-300">
                在
                <code class="rounded bg-yellow-100 px-1 dark:bg-yellow-900"
                  >~/.codex/config.toml</code
                >
                文件开头添加以下配置：
              </p>
              <div
                class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div
                  v-for="line in codexConfigContent.configToml"
                  :key="line"
                  class="whitespace-nowrap text-gray-300"
                  :class="{ 'mt-2': line === '' }"
                >
                  {{ line }}
                </div>
              </div>
              <p class="mt-3 text-sm text-yellow-700 dark:text-yellow-300">
                在
                <code class="rounded bg-yellow-100 px-1 dark:bg-yellow-900"
                  >~/.codex/auth.json</code
                >
                文件中配置API密钥：
              </p>
              <div
                class="mt-2 overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div
                  v-for="line in codexConfigContent.authJson"
                  :key="line"
                  class="whitespace-nowrap text-gray-300"
                >
                  {{ line }}
                </div>
              </div>
              <div class="mt-3 space-y-3 text-xs text-yellow-700 dark:text-yellow-300">
                <!-- 描述文字 -->
                <p>{{ codexConfigContent.authInstructions.description }}</p>

                <!-- 标题 -->
                <h6 class="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                  {{ codexConfigContent.authInstructions.title }}
                </h6>

                <!-- 当前平台对应的环境变量设置 -->
                <div class="space-y-2">
                  <p class="font-medium">
                    {{ codexConfigContent.authInstructions.platform.title }}:
                  </p>
                  <div
                    class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
                  >
                    <div class="whitespace-nowrap text-gray-300">
                      {{ codexConfigContent.authInstructions.platform.command }}
                    </div>
                  </div>
                </div>

                <!-- Shell 配置文件（仅对于 macOS/Linux 显示） -->
                <div v-if="codexConfigContent.authInstructions.persistent" class="space-y-2">
                  <p class="font-medium">
                    {{ codexConfigContent.authInstructions.persistent.title }}:
                  </p>
                  <p class="text-xs">
                    {{ codexConfigContent.authInstructions.persistent.description }}
                  </p>
                  <div
                    class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
                  >
                    <div
                      v-for="command in codexConfigContent.authInstructions.persistent.commands"
                      :key="command"
                      class="whitespace-nowrap text-gray-300"
                      :class="{ 'mt-2': command === '' }"
                    >
                      {{ command }}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Droid CLI 配置 -->
      <div class="mt-8">
        <h5
          class="mb-2 flex items-center text-base font-semibold text-gray-800 dark:text-gray-200 sm:mb-3 sm:text-lg"
        >
          <i class="fas fa-terminal mr-2 text-blue-600" />
          配置 Droid CLI
        </h5>
        <p class="mb-3 text-sm text-gray-700 dark:text-gray-300 sm:mb-4 sm:text-base">
          Droid CLI 使用
          <code class="rounded bg-gray-100 px-1 dark:bg-gray-800">~/.factory/config.json</code>
          保存自定义模型；在 Windows 中可直接编辑
          <code class="rounded bg-gray-100 px-1 dark:bg-gray-800"
            >C:\Users\你的用户名\.factory\config.json</code
          >。
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
          class="rounded-xl border border-orange-100 bg-gradient-to-r from-orange-50 to-yellow-50 p-4 dark:border-orange-500/40 dark:from-orange-950/30 dark:to-yellow-950/30 sm:p-6"
        >
          <p class="mb-3 text-sm text-gray-700 dark:text-gray-300 sm:mb-4 sm:text-base">
            现在你可以开始使用 Claude Code 了！
          </p>

          <div class="space-y-4">
            <div>
              <h6 class="mb-2 text-sm font-medium text-gray-800 dark:text-gray-300 sm:text-base">
                启动 Claude Code
              </h6>
              <div
                class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="whitespace-nowrap text-gray-300">claude</div>
              </div>
            </div>

            <div>
              <h6 class="mb-2 text-sm font-medium text-gray-800 dark:text-gray-300 sm:text-base">
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
          <details
            class="rounded-lg border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800"
          >
            <summary
              class="cursor-pointer p-3 text-sm font-medium text-gray-800 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700 sm:p-4 sm:text-base"
            >
              安装时提示 "permission denied" 错误
            </summary>
            <div class="px-3 pb-3 text-gray-600 dark:text-gray-400 sm:px-4 sm:pb-4">
              <p class="mb-2">这通常是权限问题，尝试以下解决方法：</p>
              <ul class="list-inside list-disc space-y-1 text-sm">
                <li>以管理员身份运行 PowerShell</li>
                <li>
                  或者配置 npm 使用用户目录：<code
                    class="rounded bg-gray-200 px-1 text-xs dark:bg-gray-700 sm:text-sm"
                    >npm config set prefix %APPDATA%\npm</code
                  >
                </li>
              </ul>
            </div>
          </details>

          <details
            class="rounded-lg border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800"
          >
            <summary
              class="cursor-pointer p-3 text-sm font-medium text-gray-800 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700 sm:p-4 sm:text-base"
            >
              PowerShell 执行策略错误
            </summary>
            <div class="px-3 pb-3 text-gray-600 dark:text-gray-400 sm:px-4 sm:pb-4">
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

          <details
            class="rounded-lg border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800"
          >
            <summary
              class="cursor-pointer p-3 text-sm font-medium text-gray-800 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700 sm:p-4 sm:text-base"
            >
              环境变量设置后不生效
            </summary>
            <div class="px-3 pb-3 text-gray-600 dark:text-gray-400 sm:px-4 sm:pb-4">
              <p class="mb-2">设置永久环境变量后需要：</p>
              <ul class="list-inside list-disc space-y-1 text-sm">
                <li>重新启动 PowerShell 或 CMD</li>
                <li>或者注销并重新登录 Windows</li>
                <li>
                  验证设置：<code
                    class="rounded bg-gray-200 px-1 text-xs dark:bg-gray-700 sm:text-sm"
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
        <p class="mb-4 text-gray-600 dark:text-gray-400 sm:mb-6">
          Claude Code 需要 Node.js 环境才能运行。
        </p>

        <div
          class="mb-4 rounded-xl border border-gray-200 bg-gradient-to-r from-gray-50 to-slate-50 p-4 dark:border-gray-700 dark:from-gray-800 dark:to-slate-800 sm:mb-6 sm:p-6"
        >
          <h5
            class="mb-2 flex items-center text-base font-semibold text-gray-800 dark:text-gray-200 sm:mb-3 sm:text-lg"
          >
            <i class="fab fa-apple mr-2 text-gray-700 dark:text-gray-400" />
            macOS 安装方法
          </h5>
          <div class="mb-4">
            <p class="mb-3 text-gray-700 dark:text-gray-300">方法一：使用 Homebrew（推荐）</p>
            <p class="mb-2 text-xs text-gray-600 dark:text-gray-400 sm:text-sm">
              如果你已经安装了 Homebrew，使用它安装 Node.js 会更方便：
            </p>
            <div
              class="overflow-x-auto rounded-lg bg-gray-900 p-3 font-mono text-xs text-green-400 dark:border dark:border-slate-700 dark:bg-slate-900 sm:p-4 sm:text-sm"
            >
              <div class="mb-2"># 更新 Homebrew</div>
              <div class="whitespace-nowrap text-gray-300">brew update</div>
              <div class="mb-2 mt-3"># 安装 Node.js</div>
              <div class="whitespace-nowrap text-gray-300">brew install node</div>
            </div>
          </div>
          <div class="mb-4">
            <p class="mb-3 text-gray-700 dark:text-gray-300">方法二：官网下载</p>
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
          <div
            class="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-600 dark:bg-gray-800 sm:p-4"
          >
            <h6 class="mb-2 text-sm font-medium text-gray-800 dark:text-gray-300 sm:text-base">
              macOS 注意事项
            </h6>
            <ul class="space-y-1 text-xs text-gray-700 dark:text-gray-300 sm:text-sm">
              <li>
                • 如果遇到权限问题，可能需要使用
                <code class="rounded bg-gray-200 px-1 text-xs dark:bg-gray-700 sm:text-sm"
                  >sudo</code
                >
              </li>
              <li>• 首次运行可能需要在系统偏好设置中允许</li>
              <li>• 建议使用 Terminal 或 iTerm2</li>
            </ul>
          </div>
        </div>

        <!-- 验证安装 -->
        <div
          class="rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-500/40 dark:bg-green-950/30 sm:p-4"
        >
          <h6 class="mb-2 font-medium text-green-800 dark:text-green-300">验证安装是否成功</h6>
          <p class="mb-3 text-sm text-green-700 dark:text-green-300">
            安装完成后，打开 Terminal，输入以下命令：
          </p>
          <div
            class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
          >
            <div class="whitespace-nowrap text-gray-300">node --version</div>
            <div class="whitespace-nowrap text-gray-300">npm --version</div>
          </div>
          <p class="mt-2 text-sm text-green-700 dark:text-green-300">
            如果显示版本号，说明安装成功了！
          </p>
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
          class="mb-4 rounded-xl border border-purple-100 bg-gradient-to-r from-purple-50 to-pink-50 p-4 dark:border-purple-500/40 dark:from-purple-950/30 dark:to-pink-950/30 sm:mb-6 sm:p-6"
        >
          <h5
            class="mb-2 flex items-center text-base font-semibold text-gray-800 dark:text-gray-200 sm:mb-3 sm:text-lg"
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
          <p class="mb-2 text-sm text-gray-600 dark:text-gray-400">
            如果遇到权限问题，可以使用 sudo：
          </p>
          <div
            class="overflow-x-auto rounded-lg bg-gray-900 p-3 font-mono text-xs text-green-400 sm:p-4 sm:text-sm"
          >
            <div class="whitespace-nowrap text-gray-300">
              sudo npm install -g @anthropic-ai/claude-code
            </div>
          </div>
        </div>

        <!-- 验证安装 -->
        <div
          class="rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-500/40 dark:bg-green-950/30 sm:p-4"
        >
          <h6 class="mb-2 font-medium text-green-800 dark:text-green-300">验证 Claude Code 安装</h6>
          <p class="mb-3 text-sm text-green-700 dark:text-green-300">
            安装完成后，输入以下命令检查是否安装成功：
          </p>
          <div
            class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
          >
            <div class="whitespace-nowrap text-gray-300">claude --version</div>
          </div>
          <p class="mt-2 text-sm text-green-700 dark:text-green-300">
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
          class="mb-4 rounded-xl border border-orange-100 bg-gradient-to-r from-orange-50 to-yellow-50 p-4 dark:border-orange-500/40 dark:from-orange-950/30 dark:to-yellow-950/30 sm:mb-6 sm:p-6"
        >
          <h5
            class="mb-2 flex items-center text-base font-semibold text-gray-800 dark:text-gray-200 sm:mb-3 sm:text-lg"
          >
            <i class="fas fa-cog mr-2 text-orange-600" />
            配置 Claude Code 环境变量
          </h5>
          <p class="mb-3 text-sm text-gray-700 dark:text-gray-300 sm:mb-4 sm:text-base">
            为了让 Claude Code 连接到你的中转服务，需要设置两个环境变量：
          </p>

          <div class="space-y-4">
            <div
              class="rounded-lg border border-orange-200 bg-white p-3 dark:border-orange-700 dark:bg-gray-800 sm:p-4"
            >
              <h6 class="mb-2 text-sm font-medium text-gray-800 dark:text-gray-300 sm:text-base">
                方法一：临时设置（当前会话）
              </h6>
              <p class="mb-3 text-sm text-gray-600 dark:text-gray-400">
                在 Terminal 中运行以下命令：
              </p>
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
              <p class="mt-2 text-xs text-yellow-700 dark:text-yellow-400">
                💡 记得将 "你的API密钥" 替换为在上方 "API Keys" 标签页中创建的实际密钥。
              </p>
            </div>

            <div
              class="rounded-lg border border-orange-200 bg-white p-3 dark:border-orange-700 dark:bg-gray-800 sm:p-4"
            >
              <h6 class="mb-2 text-sm font-medium text-gray-800 dark:text-gray-300 sm:text-base">
                方法二：永久设置
              </h6>
              <p class="mb-3 text-sm text-gray-600 dark:text-gray-400">
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

        <!-- VSCode 插件配置 (macOS) -->
        <div
          class="mt-6 rounded-lg border border-indigo-200 bg-indigo-50 p-3 dark:border-indigo-500/40 dark:bg-indigo-950/30 sm:p-4"
        >
          <h6 class="mb-2 font-medium text-indigo-800 dark:text-indigo-300">
            VSCode Claude 插件配置
          </h6>
          <p class="mb-3 text-sm text-indigo-700 dark:text-indigo-300">
            如果使用 VSCode 的 Claude 插件，需要在配置文件中进行设置：
          </p>
          <div class="mb-3 space-y-2">
            <p class="text-sm text-indigo-700 dark:text-indigo-300">
              <strong>配置文件位置：</strong>
              <code class="rounded bg-indigo-100 px-1 dark:bg-indigo-900"
                >~/.claude/config.json</code
              >
            </p>
            <p class="text-xs text-indigo-600 dark:text-indigo-400">
              💡 如果该文件不存在，请手动创建。
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

        <!-- Gemini CLI 环境变量设置 -->
        <div class="mt-8">
          <h5
            class="mb-2 flex items-center text-base font-semibold text-gray-800 dark:text-gray-200 sm:mb-3 sm:text-lg"
          >
            <i class="fas fa-robot mr-2 text-green-600" />
            配置 Gemini CLI 环境变量
          </h5>
          <p class="mb-3 text-sm text-gray-700 dark:text-gray-300 sm:mb-4 sm:text-base">
            如果你使用 Gemini CLI，需要设置以下环境变量：
          </p>

          <div class="space-y-4">
            <div
              class="rounded-lg border border-green-200 bg-white p-3 dark:border-green-700 dark:bg-gray-800 sm:p-4"
            >
              <h6 class="mb-2 text-sm font-medium text-gray-800 dark:text-gray-300 sm:text-base">
                Terminal 设置方法
              </h6>
              <p class="mb-3 text-sm text-gray-600 dark:text-gray-400">
                在 Terminal 中运行以下命令：
              </p>
              <div
                class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="whitespace-nowrap text-gray-300">
                  export GOOGLE_GEMINI_BASE_URL="{{ geminiBaseUrl }}"
                </div>
                <div class="whitespace-nowrap text-gray-300">
                  export GEMINI_API_KEY="你的API密钥"
                </div>
                <div class="whitespace-nowrap text-gray-300">
                  export GEMINI_MODEL="gemini-2.5-pro"
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
                永久设置方法
              </h6>
              <p class="mb-3 text-sm text-gray-600 dark:text-gray-400">
                添加到你的 shell 配置文件：
              </p>
              <div
                class="mb-3 overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="mb-2"># 对于 zsh (默认)</div>
                <div class="whitespace-nowrap text-gray-300">
                  echo 'export GOOGLE_GEMINI_BASE_URL="{{ geminiBaseUrl }}"' >> ~/.zshrc
                </div>
                <div class="whitespace-nowrap text-gray-300">
                  echo 'export GEMINI_API_KEY="你的API密钥"' >> ~/.zshrc
                </div>
                <div class="whitespace-nowrap text-gray-300">
                  echo 'export GEMINI_MODEL="gemini-2.5-pro"' >> ~/.zshrc
                </div>
                <div class="whitespace-nowrap text-gray-300">source ~/.zshrc</div>
              </div>
              <div
                class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="mb-2"># 对于 bash</div>
                <div class="whitespace-nowrap text-gray-300">
                  echo 'export GOOGLE_GEMINI_BASE_URL="{{ geminiBaseUrl }}"' >> ~/.bash_profile
                </div>
                <div class="whitespace-nowrap text-gray-300">
                  echo 'export GEMINI_API_KEY="你的API密钥"' >> ~/.bash_profile
                </div>
                <div class="whitespace-nowrap text-gray-300">
                  echo 'export GEMINI_MODEL="gemini-2.5-pro"' >> ~/.bash_profile
                </div>
                <div class="whitespace-nowrap text-gray-300">source ~/.bash_profile</div>
              </div>
            </div>

            <div
              class="rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-500/40 dark:bg-green-950/30 sm:p-4"
            >
              <h6 class="mb-2 font-medium text-green-800 dark:text-green-300">
                验证 Gemini CLI 环境变量
              </h6>
              <p class="mb-3 text-sm text-green-700 dark:text-green-300">在 Terminal 中验证：</p>
              <div
                class="space-y-1 overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="whitespace-nowrap text-gray-300">echo $GOOGLE_GEMINI_BASE_URL</div>
                <div class="whitespace-nowrap text-gray-300">echo $GEMINI_API_KEY</div>
                <div class="whitespace-nowrap text-gray-300">echo $GEMINI_MODEL</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Codex 环境变量设置 -->
        <div class="mt-8">
          <h5
            class="mb-2 flex items-center text-base font-semibold text-gray-800 dark:text-gray-200 sm:mb-3 sm:text-lg"
          >
            <i class="fas fa-code mr-2 text-indigo-600" />
            配置 Codex 环境变量
          </h5>
          <p class="mb-3 text-sm text-gray-700 dark:text-gray-300 sm:mb-4 sm:text-base">
            如果你使用支持 OpenAI API 的工具（如 Codex），需要设置以下环境变量：
          </p>

          <div class="space-y-4">
            <div
              class="rounded-lg border border-yellow-200 bg-yellow-50 p-3 dark:border-yellow-500/40 dark:bg-yellow-950/30 sm:p-4"
            >
              <h6 class="mb-2 font-medium text-yellow-800 dark:text-yellow-300">Codex 配置文件</h6>
              <p class="mb-3 text-sm text-yellow-700 dark:text-yellow-300">
                在
                <code class="rounded bg-yellow-100 px-1 dark:bg-yellow-900"
                  >~/.codex/config.toml</code
                >
                文件开头添加以下配置：
              </p>
              <div
                class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div
                  v-for="line in codexConfigContent.configToml"
                  :key="line"
                  class="whitespace-nowrap text-gray-300"
                  :class="{ 'mt-2': line === '' }"
                >
                  {{ line }}
                </div>
              </div>
              <p class="mt-3 text-sm text-yellow-700 dark:text-yellow-300">
                在
                <code class="rounded bg-yellow-100 px-1 dark:bg-yellow-900"
                  >~/.codex/auth.json</code
                >
                文件中配置API密钥：
              </p>
              <div
                class="mt-2 overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div
                  v-for="line in codexConfigContent.authJson"
                  :key="line"
                  class="whitespace-nowrap text-gray-300"
                >
                  {{ line }}
                </div>
              </div>
              <div class="mt-3 space-y-3 text-xs text-yellow-700 dark:text-yellow-300">
                <!-- 描述文字 -->
                <p>{{ codexConfigContent.authInstructions.description }}</p>

                <!-- 标题 -->
                <h6 class="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                  {{ codexConfigContent.authInstructions.title }}
                </h6>

                <!-- 当前平台对应的环境变量设置 -->
                <div class="space-y-2">
                  <p class="font-medium">
                    {{ codexConfigContent.authInstructions.platform.title }}:
                  </p>
                  <div
                    class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
                  >
                    <div class="whitespace-nowrap text-gray-300">
                      {{ codexConfigContent.authInstructions.platform.command }}
                    </div>
                  </div>
                </div>

                <!-- Shell 配置文件（仅对于 macOS/Linux 显示） -->
                <div v-if="codexConfigContent.authInstructions.persistent" class="space-y-2">
                  <p class="font-medium">
                    {{ codexConfigContent.authInstructions.persistent.title }}:
                  </p>
                  <p class="text-xs">
                    {{ codexConfigContent.authInstructions.persistent.description }}
                  </p>
                  <div
                    class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
                  >
                    <div
                      v-for="command in codexConfigContent.authInstructions.persistent.commands"
                      :key="command"
                      class="whitespace-nowrap text-gray-300"
                      :class="{ 'mt-2': command === '' }"
                    >
                      {{ command }}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Droid CLI 配置 -->
      <div class="mt-8">
        <h5
          class="mb-2 flex items-center text-base font-semibold text-gray-800 dark:text-gray-200 sm:mb-3 sm:text-lg"
        >
          <i class="fas fa-terminal mr-2 text-blue-600" />
          配置 Droid CLI
        </h5>
        <p class="mb-3 text-sm text-gray-700 dark:text-gray-300 sm:mb-4 sm:text-base">
          Droid CLI 使用
          <code class="rounded bg-gray-100 px-1 dark:bg-gray-800">~/.factory/config.json</code>
          保存自定义模型；你可以在 Finder 中按
          <code class="rounded bg-gray-100 px-1 dark:bg-gray-800">⌘ + Shift + G</code>
          并输入路径，或运行
          <code class="rounded bg-gray-100 px-1 dark:bg-gray-800">open ~/.factory</code>
          快速打开配置目录。
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
          class="rounded-xl border border-yellow-100 bg-gradient-to-r from-yellow-50 to-amber-50 p-4 dark:border-yellow-500/40 dark:from-yellow-950/30 dark:to-amber-950/30 sm:p-6"
        >
          <p class="mb-3 text-sm text-gray-700 dark:text-gray-300 sm:mb-4 sm:text-base">
            现在你可以开始使用 Claude Code 了！
          </p>

          <div class="space-y-4">
            <div>
              <h6 class="mb-2 text-sm font-medium text-gray-800 dark:text-gray-300 sm:text-base">
                启动 Claude Code
              </h6>
              <div
                class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="whitespace-nowrap text-gray-300">claude</div>
              </div>
            </div>

            <div>
              <h6 class="mb-2 text-sm font-medium text-gray-800 dark:text-gray-300 sm:text-base">
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
          <details
            class="rounded-lg border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800"
          >
            <summary
              class="cursor-pointer p-3 text-sm font-medium text-gray-800 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700 sm:p-4 sm:text-base"
            >
              安装时提示权限错误
            </summary>
            <div class="px-3 pb-3 text-gray-600 dark:text-gray-400 sm:px-4 sm:pb-4">
              <p class="mb-2">尝试以下解决方法：</p>
              <ul class="list-inside list-disc space-y-1 text-sm">
                <li>
                  使用 sudo 安装：<code
                    class="rounded bg-gray-200 px-1 text-xs dark:bg-gray-700 sm:text-sm"
                    >sudo npm install -g @anthropic-ai/claude-code</code
                  >
                </li>
                <li>
                  或者配置 npm 使用用户目录：<code
                    class="rounded bg-gray-200 px-1 text-xs dark:bg-gray-700 sm:text-sm"
                    >npm config set prefix ~/.npm-global</code
                  >
                </li>
              </ul>
            </div>
          </details>

          <details
            class="rounded-lg border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800"
          >
            <summary
              class="cursor-pointer p-3 text-sm font-medium text-gray-800 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700 sm:p-4 sm:text-base"
            >
              macOS 安全设置阻止运行
            </summary>
            <div class="px-3 pb-3 text-gray-600 dark:text-gray-400 sm:px-4 sm:pb-4">
              <p class="mb-2">如果系统阻止运行 Claude Code：</p>
              <ul class="list-inside list-disc space-y-1 text-sm">
                <li>打开"系统偏好设置" → "安全性与隐私"</li>
                <li>点击"仍要打开"或"允许"</li>
                <li>
                  或者在 Terminal 中运行：<code
                    class="rounded bg-gray-200 px-1 text-xs dark:bg-gray-700 sm:text-sm"
                    >sudo spctl --master-disable</code
                  >
                </li>
              </ul>
            </div>
          </details>

          <details
            class="rounded-lg border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800"
          >
            <summary
              class="cursor-pointer p-3 text-sm font-medium text-gray-800 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700 sm:p-4 sm:text-base"
            >
              环境变量不生效
            </summary>
            <div class="px-3 pb-3 text-gray-600 dark:text-gray-400 sm:px-4 sm:pb-4">
              <p class="mb-2">检查以下几点：</p>
              <ul class="list-inside list-disc space-y-1 text-sm">
                <li>确认修改了正确的配置文件（.zshrc 或 .bash_profile）</li>
                <li>重新启动 Terminal</li>
                <li>
                  验证设置：<code
                    class="rounded bg-gray-200 px-1 text-xs dark:bg-gray-700 sm:text-sm"
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
        <p class="mb-4 text-gray-600 dark:text-gray-400 sm:mb-6">
          Claude Code 需要 Node.js 环境才能运行。
        </p>

        <div
          class="mb-4 rounded-xl border border-orange-100 bg-gradient-to-r from-orange-50 to-red-50 p-4 dark:border-orange-500/40 dark:from-orange-950/30 dark:to-red-950/30 sm:mb-6 sm:p-6"
        >
          <h5
            class="mb-2 flex items-center text-base font-semibold text-gray-800 dark:text-gray-200 sm:mb-3 sm:text-lg"
          >
            <i class="fab fa-ubuntu mr-2 text-orange-600" />
            Linux 安装方法
          </h5>
          <div class="mb-4">
            <p class="mb-3 text-gray-700 dark:text-gray-300">方法一：使用官方仓库（推荐）</p>
            <div
              class="overflow-x-auto rounded-lg bg-gray-900 p-3 font-mono text-xs text-green-400 dark:border dark:border-slate-700 dark:bg-slate-900 sm:p-4 sm:text-sm"
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
            <p class="mb-3 text-gray-700 dark:text-gray-300">方法二：使用系统包管理器</p>
            <p class="mb-2 text-xs text-gray-600 dark:text-gray-400 sm:text-sm">
              虽然版本可能不是最新的，但对于基本使用已经足够：
            </p>
            <div
              class="overflow-x-auto rounded-lg bg-gray-900 p-3 font-mono text-xs text-green-400 dark:border dark:border-slate-700 dark:bg-slate-900 sm:p-4 sm:text-sm"
            >
              <div class="mb-2"># Ubuntu/Debian</div>
              <div class="whitespace-nowrap text-gray-300">sudo apt update</div>
              <div class="whitespace-nowrap text-gray-300">sudo apt install nodejs npm</div>
              <div class="mb-2 mt-3"># CentOS/RHEL/Fedora</div>
              <div class="whitespace-nowrap text-gray-300">sudo dnf install nodejs npm</div>
            </div>
          </div>
          <div
            class="rounded-lg border border-orange-200 bg-orange-50 p-3 dark:border-orange-500/40 dark:bg-orange-950/30 sm:p-4"
          >
            <h6 class="mb-2 text-sm font-medium text-orange-800 dark:text-orange-300 sm:text-base">
              Linux 注意事项
            </h6>
            <ul class="space-y-1 text-xs text-orange-700 dark:text-orange-300 sm:text-sm">
              <li>• 某些发行版可能需要安装额外的依赖</li>
              <li>
                • 如果遇到权限问题，使用
                <code class="rounded bg-orange-200 px-1 dark:bg-orange-900">sudo</code>
              </li>
              <li>• 确保你的用户在 npm 的全局目录有写权限</li>
            </ul>
          </div>
        </div>

        <!-- 验证安装 -->
        <div
          class="rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-500/40 dark:bg-green-950/30 sm:p-4"
        >
          <h6 class="mb-2 font-medium text-green-800 dark:text-green-300">验证安装是否成功</h6>
          <p class="mb-3 text-sm text-green-700 dark:text-green-300">
            安装完成后，打开终端，输入以下命令：
          </p>
          <div
            class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
          >
            <div class="whitespace-nowrap text-gray-300">node --version</div>
            <div class="whitespace-nowrap text-gray-300">npm --version</div>
          </div>
          <p class="mt-2 text-sm text-green-700 dark:text-green-300">
            如果显示版本号，说明安装成功了！
          </p>
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
          class="mb-4 rounded-xl border border-purple-100 bg-gradient-to-r from-purple-50 to-pink-50 p-4 dark:border-purple-500/40 dark:from-purple-950/30 dark:to-pink-950/30 sm:mb-6 sm:p-6"
        >
          <h5
            class="mb-2 flex items-center text-base font-semibold text-gray-800 dark:text-gray-200 sm:mb-3 sm:text-lg"
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
          <p class="mb-2 text-sm text-gray-600 dark:text-gray-400">
            如果遇到权限问题，可以使用 sudo：
          </p>
          <div
            class="overflow-x-auto rounded-lg bg-gray-900 p-3 font-mono text-xs text-green-400 sm:p-4 sm:text-sm"
          >
            <div class="whitespace-nowrap text-gray-300">
              sudo npm install -g @anthropic-ai/claude-code
            </div>
          </div>
        </div>

        <!-- 验证安装 -->
        <div
          class="rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-500/40 dark:bg-green-950/30 sm:p-4"
        >
          <h6 class="mb-2 font-medium text-green-800 dark:text-green-300">验证 Claude Code 安装</h6>
          <p class="mb-3 text-sm text-green-700 dark:text-green-300">
            安装完成后，输入以下命令检查是否安装成功：
          </p>
          <div
            class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
          >
            <div class="whitespace-nowrap text-gray-300">claude --version</div>
          </div>
          <p class="mt-2 text-sm text-green-700 dark:text-green-300">
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
          class="mb-4 rounded-xl border border-orange-100 bg-gradient-to-r from-orange-50 to-yellow-50 p-4 dark:border-orange-500/40 dark:from-orange-950/30 dark:to-yellow-950/30 sm:mb-6 sm:p-6"
        >
          <h5
            class="mb-2 flex items-center text-base font-semibold text-gray-800 dark:text-gray-200 sm:mb-3 sm:text-lg"
          >
            <i class="fas fa-cog mr-2 text-orange-600" />
            配置 Claude Code 环境变量
          </h5>
          <p class="mb-3 text-sm text-gray-700 dark:text-gray-300 sm:mb-4 sm:text-base">
            为了让 Claude Code 连接到你的中转服务，需要设置两个环境变量：
          </p>

          <div class="space-y-4">
            <div
              class="rounded-lg border border-orange-200 bg-white p-3 dark:border-orange-700 dark:bg-gray-800 sm:p-4"
            >
              <h6 class="mb-2 text-sm font-medium text-gray-800 dark:text-gray-300 sm:text-base">
                方法一：临时设置（当前会话）
              </h6>
              <p class="mb-3 text-sm text-gray-600 dark:text-gray-400">在终端中运行以下命令：</p>
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
              <p class="mt-2 text-xs text-yellow-700 dark:text-yellow-400">
                💡 记得将 "你的API密钥" 替换为在上方 "API Keys" 标签页中创建的实际密钥。
              </p>
            </div>

            <div
              class="rounded-lg border border-orange-200 bg-white p-3 dark:border-orange-700 dark:bg-gray-800 sm:p-4"
            >
              <h6 class="mb-2 text-sm font-medium text-gray-800 dark:text-gray-300 sm:text-base">
                方法二：永久设置
              </h6>
              <p class="mb-3 text-sm text-gray-600 dark:text-gray-400">编辑你的 shell 配置文件：</p>
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
            class="mb-2 flex items-center text-base font-semibold text-gray-800 dark:text-gray-200 sm:mb-3 sm:text-lg"
          >
            <i class="fas fa-robot mr-2 text-green-600" />
            配置 Gemini CLI 环境变量
          </h5>
          <p class="mb-3 text-sm text-gray-700 dark:text-gray-300 sm:mb-4 sm:text-base">
            如果你使用 Gemini CLI，需要设置以下环境变量：
          </p>

          <div class="space-y-4">
            <div
              class="rounded-lg border border-green-200 bg-white p-3 dark:border-green-700 dark:bg-gray-800 sm:p-4"
            >
              <h6 class="mb-2 text-sm font-medium text-gray-800 dark:text-gray-300 sm:text-base">
                终端设置方法
              </h6>
              <p class="mb-3 text-sm text-gray-600 dark:text-gray-400">在终端中运行以下命令：</p>
              <div
                class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="whitespace-nowrap text-gray-300">
                  export GOOGLE_GEMINI_BASE_URL="{{ geminiBaseUrl }}"
                </div>
                <div class="whitespace-nowrap text-gray-300">
                  export GEMINI_API_KEY="你的API密钥"
                </div>
                <div class="whitespace-nowrap text-gray-300">
                  export GEMINI_MODEL="gemini-2.5-pro"
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
                永久设置方法
              </h6>
              <p class="mb-3 text-sm text-gray-600 dark:text-gray-400">
                添加到你的 shell 配置文件：
              </p>
              <div
                class="mb-3 overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="mb-2"># 对于 bash (默认)</div>
                <div class="whitespace-nowrap text-gray-300">
                  echo 'export GOOGLE_GEMINI_BASE_URL="{{ geminiBaseUrl }}"' >> ~/.bashrc
                </div>
                <div class="whitespace-nowrap text-gray-300">
                  echo 'export GEMINI_API_KEY="你的API密钥"' >> ~/.bashrc
                </div>
                <div class="whitespace-nowrap text-gray-300">
                  echo 'export GEMINI_MODEL="gemini-2.5-pro"' >> ~/.bashrc
                </div>
                <div class="whitespace-nowrap text-gray-300">source ~/.bashrc</div>
              </div>
              <div
                class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="mb-2"># 对于 zsh</div>
                <div class="whitespace-nowrap text-gray-300">
                  echo 'export GOOGLE_GEMINI_BASE_URL="{{ geminiBaseUrl }}"' >> ~/.zshrc
                </div>
                <div class="whitespace-nowrap text-gray-300">
                  echo 'export GEMINI_API_KEY="你的API密钥"' >> ~/.zshrc
                </div>
                <div class="whitespace-nowrap text-gray-300">
                  echo 'export GEMINI_MODEL="gemini-2.5-pro"' >> ~/.zshrc
                </div>
                <div class="whitespace-nowrap text-gray-300">source ~/.zshrc</div>
              </div>
            </div>

            <div
              class="rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-500/40 dark:bg-green-950/30 sm:p-4"
            >
              <h6 class="mb-2 font-medium text-green-800 dark:text-green-300">
                验证 Gemini CLI 环境变量
              </h6>
              <p class="mb-3 text-sm text-green-700 dark:text-green-300">在终端中验证：</p>
              <div
                class="space-y-1 overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="whitespace-nowrap text-gray-300">echo $GOOGLE_GEMINI_BASE_URL</div>
                <div class="whitespace-nowrap text-gray-300">echo $GEMINI_API_KEY</div>
                <div class="whitespace-nowrap text-gray-300">echo $GEMINI_MODEL</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Codex 环境变量设置 -->
        <div class="mt-8">
          <h5
            class="mb-2 flex items-center text-base font-semibold text-gray-800 dark:text-gray-200 sm:mb-3 sm:text-lg"
          >
            <i class="fas fa-code mr-2 text-indigo-600" />
            配置 Codex 环境变量
          </h5>
          <p class="mb-3 text-sm text-gray-700 dark:text-gray-300 sm:mb-4 sm:text-base">
            如果你使用支持 OpenAI API 的工具（如 Codex），需要设置以下环境变量：
          </p>

          <div class="space-y-4">
            <div
              class="rounded-lg border border-yellow-200 bg-yellow-50 p-3 dark:border-yellow-500/40 dark:bg-yellow-950/30 sm:p-4"
            >
              <h6 class="mb-2 font-medium text-yellow-800 dark:text-yellow-300">Codex 配置文件</h6>
              <p class="mb-3 text-sm text-yellow-700 dark:text-yellow-300">
                在
                <code class="rounded bg-yellow-100 px-1 dark:bg-yellow-900"
                  >~/.codex/config.toml</code
                >
                文件开头添加以下配置：
              </p>
              <div
                class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div
                  v-for="line in codexConfigContent.configToml"
                  :key="line"
                  class="whitespace-nowrap text-gray-300"
                  :class="{ 'mt-2': line === '' }"
                >
                  {{ line }}
                </div>
              </div>
              <p class="mt-3 text-sm text-yellow-700 dark:text-yellow-300">
                在
                <code class="rounded bg-yellow-100 px-1 dark:bg-yellow-900"
                  >~/.codex/auth.json</code
                >
                文件中配置API密钥：
              </p>
              <div
                class="mt-2 overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div
                  v-for="line in codexConfigContent.authJson"
                  :key="line"
                  class="whitespace-nowrap text-gray-300"
                >
                  {{ line }}
                </div>
              </div>
              <div class="mt-3 space-y-3 text-xs text-yellow-700 dark:text-yellow-300">
                <!-- 描述文字 -->
                <p>{{ codexConfigContent.authInstructions.description }}</p>

                <!-- 标题 -->
                <h6 class="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                  {{ codexConfigContent.authInstructions.title }}
                </h6>

                <!-- 当前平台对应的环境变量设置 -->
                <div class="space-y-2">
                  <p class="font-medium">
                    {{ codexConfigContent.authInstructions.platform.title }}:
                  </p>
                  <div
                    class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
                  >
                    <div class="whitespace-nowrap text-gray-300">
                      {{ codexConfigContent.authInstructions.platform.command }}
                    </div>
                  </div>
                </div>

                <!-- Shell 配置文件（仅对于 macOS/Linux 显示） -->
                <div v-if="codexConfigContent.authInstructions.persistent" class="space-y-2">
                  <p class="font-medium">
                    {{ codexConfigContent.authInstructions.persistent.title }}:
                  </p>
                  <p class="text-xs">
                    {{ codexConfigContent.authInstructions.persistent.description }}
                  </p>
                  <div
                    class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
                  >
                    <div
                      v-for="command in codexConfigContent.authInstructions.persistent.commands"
                      :key="command"
                      class="whitespace-nowrap text-gray-300"
                      :class="{ 'mt-2': command === '' }"
                    >
                      {{ command }}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <!-- VSCode 插件配置 (Linux) -->
        <div
          class="mt-6 rounded-lg border border-indigo-200 bg-indigo-50 p-3 dark:border-indigo-500/40 dark:bg-indigo-950/30 sm:p-4"
        >
          <h6 class="mb-2 font-medium text-indigo-800 dark:text-indigo-300">
            VSCode Claude 插件配置
          </h6>
          <p class="mb-3 text-sm text-indigo-700 dark:text-indigo-300">
            如果使用 VSCode 的 Claude 插件，需要在配置文件中进行设置：
          </p>
          <div class="mb-3 space-y-2">
            <p class="text-sm text-indigo-700 dark:text-indigo-300">
              <strong>配置文件位置：</strong>
              <code class="rounded bg-indigo-100 px-1 dark:bg-indigo-900"
                >~/.claude/config.json</code
              >
            </p>
            <p class="text-xs text-indigo-600 dark:text-indigo-400">
              💡 如果该文件不存在，请手动创建。
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

        <!-- Droid CLI 配置 -->
        <div class="mt-8">
          <h5
            class="mb-2 flex items-center text-base font-semibold text-gray-800 dark:text-gray-200 sm:mb-3 sm:text-lg"
          >
            <i class="fas fa-terminal mr-2 text-blue-600" />
            配置 Droid CLI
          </h5>
          <p class="mb-3 text-sm text-gray-700 dark:text-gray-300 sm:mb-4 sm:text-base">
            Droid CLI 使用
            <code class="rounded bg-gray-100 px-1 dark:bg-gray-800">~/.factory/config.json</code>
            保存自定义模型；在 Linux 或 WSL2 中，可直接编辑
            <code class="rounded bg-gray-100 px-1 dark:bg-gray-800"
              >/home/你的用户名/.factory/config.json</code
            >
            或在终端运行
            <code class="rounded bg-gray-100 px-1 dark:bg-gray-800">xdg-open ~/.factory</code>
            打开目录。
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
            class="rounded-xl border border-yellow-100 bg-gradient-to-r from-yellow-50 to-amber-50 p-4 dark:border-yellow-500/40 dark:from-yellow-950/30 dark:to-amber-950/30 sm:p-6"
          >
            <p class="mb-3 text-sm text-gray-700 dark:text-gray-300 sm:mb-4 sm:text-base">
              现在你可以开始使用 Claude Code 了！
            </p>

            <div class="space-y-4">
              <div>
                <h6 class="mb-2 text-sm font-medium text-gray-800 dark:text-gray-300 sm:text-base">
                  启动 Claude Code
                </h6>
                <div
                  class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
                >
                  <div class="whitespace-nowrap text-gray-300">claude</div>
                </div>
              </div>

              <div>
                <h6 class="mb-2 text-sm font-medium text-gray-800 dark:text-gray-300 sm:text-base">
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
            <details
              class="rounded-lg border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800"
            >
              <summary
                class="cursor-pointer p-3 text-sm font-medium text-gray-800 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700 sm:p-4 sm:text-base"
              >
                安装时提示权限错误
              </summary>
              <div class="px-3 pb-3 text-gray-600 dark:text-gray-400 sm:px-4 sm:pb-4">
                <p class="mb-2">尝试以下解决方法：</p>
                <ul class="list-inside list-disc space-y-1 text-sm">
                  <li>
                    使用 sudo 安装：<code
                      class="rounded bg-gray-200 px-1 text-xs dark:bg-gray-700 sm:text-sm"
                      >sudo npm install -g @anthropic-ai/claude-code</code
                    >
                  </li>
                  <li>
                    或者配置 npm 使用用户目录：<code
                      class="rounded bg-gray-200 px-1 text-xs dark:bg-gray-700 sm:text-sm"
                      >npm config set prefix ~/.npm-global</code
                    >
                  </li>
                  <li>
                    然后添加到 PATH：<code
                      class="rounded bg-gray-200 px-1 text-xs dark:bg-gray-700 sm:text-sm"
                      >export PATH=~/.npm-global/bin:$PATH</code
                    >
                  </li>
                </ul>
              </div>
            </details>

            <details
              class="rounded-lg border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800"
            >
              <summary
                class="cursor-pointer p-3 text-sm font-medium text-gray-800 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700 sm:p-4 sm:text-base"
              >
                缺少依赖库
              </summary>
              <div class="px-3 pb-3 text-gray-600 dark:text-gray-400 sm:px-4 sm:pb-4">
                <p class="mb-2">某些 Linux 发行版需要安装额外依赖：</p>
                <div
                  class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
                >
                  <div class="mb-2"># Ubuntu/Debian</div>
                  <div class="whitespace-nowrap text-gray-300">
                    sudo apt install build-essential
                  </div>
                  <div class="mb-2 mt-2"># CentOS/RHEL</div>
                  <div class="whitespace-nowrap text-gray-300">
                    sudo dnf groupinstall "Development Tools"
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
                环境变量不生效
              </summary>
              <div class="px-3 pb-3 text-gray-600 dark:text-gray-400 sm:px-4 sm:pb-4">
                <p class="mb-2">检查以下几点：</p>
                <ul class="list-inside list-disc space-y-1 text-sm">
                  <li>确认修改了正确的配置文件（.bashrc 或 .zshrc）</li>
                  <li>
                    重新启动终端或运行
                    <code class="rounded bg-gray-200 px-1 text-xs dark:bg-gray-700 sm:text-sm"
                      >source ~/.bashrc</code
                    >
                  </li>
                  <li>
                    验证设置：<code
                      class="rounded bg-gray-200 px-1 text-xs dark:bg-gray-700 sm:text-sm"
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
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'

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
  // 优先使用环境变量配置的自定义前缀
  const customPrefix = import.meta.env.VITE_API_BASE_PREFIX
  if (customPrefix) {
    // 去除末尾的斜杠
    return customPrefix.replace(/\/$/, '')
  }

  // 否则使用当前浏览器访问地址
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

// Droid 类型账号基础URL
const droidClaudeBaseUrl = computed(() => {
  return getBaseUrlPrefix() + '/droid/claude'
})

const droidOpenaiBaseUrl = computed(() => {
  return getBaseUrlPrefix() + '/droid/openai'
})

// Codex 配置内容
const codexConfigContent = computed(() => {
  // 根据当前激活的教程系统获取对应的环境变量设置说明
  const getCurrentPlatformAuthInstructions = () => {
    const baseInstructions = {
      title: '环境变量设置方法',
      description:
        '💡 将 OPENAI_API_KEY 设置为 null，然后设置环境变量 CRS_OAI_KEY 为您的 API 密钥（格式如 cr_xxxxxxxxxx）。'
    }

    switch (activeTutorialSystem.value) {
      case 'windows':
        return {
          ...baseInstructions,
          platform: {
            title: 'Windows',
            command: 'set CRS_OAI_KEY=cr_xxxxxxxxxx'
          }
        }
      case 'macos':
        return {
          ...baseInstructions,
          platform: {
            title: 'macOS',
            command: 'export CRS_OAI_KEY=cr_xxxxxxxxxx'
          },
          persistent: {
            title: 'Shell 配置文件（持久保存）',
            description: '添加到您的 shell 配置文件中：',
            commands: [
              '# 对于 zsh (默认)',
              'echo "export CRS_OAI_KEY=cr_xxxxxxxxxx" >> ~/.zshrc',
              'source ~/.zshrc',
              '',
              '# 对于 bash',
              'echo "export CRS_OAI_KEY=cr_xxxxxxxxxx" >> ~/.bash_profile',
              'source ~/.bash_profile'
            ]
          }
        }
      case 'linux':
        return {
          ...baseInstructions,
          platform: {
            title: 'Linux',
            command: 'export CRS_OAI_KEY=cr_xxxxxxxxxx'
          },
          persistent: {
            title: 'Shell 配置文件（持久保存）',
            description: '添加到您的 shell 配置文件中：',
            commands: [
              '# 对于 bash (默认)',
              'echo "export CRS_OAI_KEY=cr_xxxxxxxxxx" >> ~/.bashrc',
              'source ~/.bashrc',
              '',
              '# 对于 zsh',
              'echo "export CRS_OAI_KEY=cr_xxxxxxxxxx" >> ~/.zshrc',
              'source ~/.zshrc'
            ]
          }
        }
      default:
        return baseInstructions
    }
  }

  return {
    configToml: [
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
      'requires_openai_auth = true',
      'env_key = "CRS_OAI_KEY"'
    ],
    authJson: ['{', '  "OPENAI_API_KEY": null', '}'],
    authInstructions: getCurrentPlatformAuthInstructions()
  }
})

// Droid CLI 配置示例
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
  '      "model_display_name": "GPT5-Codex [crs]",',
  '      "model": "gpt-5-codex",',
  `      "base_url": "${droidOpenaiBaseUrl.value}",`,
  '      "api_key": "你的API密钥",',
  '      "provider": "openai",',
  '      "max_tokens": 16384',
  '    }',
  '  ]',
  '}'
])
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

/* 暗色主题优化 */
/* 顶部标签栏背景 - 增加深度感 */
html.dark :deep(.bg-gray-100) {
  background-color: #1f2937 !important;
  border: 1px solid rgba(75, 85, 99, 0.5);
}

html.dark :deep(.bg-gray-700) {
  background-color: #1a202c !important;
  border: 1px solid rgba(75, 85, 99, 0.6);
}

/* 活动标签页 - 更明显的对比和高亮 */
html.dark :deep(button.bg-gray-800) {
  background-color: #3b82f6 !important;
  border: 1px solid rgba(59, 130, 246, 0.8);
  box-shadow: 0 2px 8px rgba(59, 130, 246, 0.4);
  color: #ffffff !important;
}

/* 非活动标签页文字颜色优化 */
html.dark :deep(button:not(.bg-gray-800).text-gray-600) {
  color: #9ca3af !important;
}

html.dark :deep(button:not(.bg-gray-800).hover\:text-gray-900:hover) {
  color: #d1d5db !important;
}

/* 代码块 - 减少纯黑，增加层次感 */
html.dark :deep(.bg-gray-900) {
  background-color: #1e293b !important;
  border: 1px solid rgba(71, 85, 105, 0.6);
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.2);
}

/* 优化链接颜色 - 更亮更突出 */
html.dark :deep(a) {
  color: #60a5fa !important;
  text-decoration: underline;
}

html.dark :deep(a:hover) {
  color: #93c5fd !important;
}

/* 行内代码样式优化 */
html.dark :deep(code.rounded) {
  background-color: #334155 !important;
  border: 1px solid rgba(100, 116, 139, 0.6);
  color: #fbbf24 !important;
  padding: 0.125rem 0.375rem;
}

/* 注意事项框 - 蓝色系列 */
html.dark :deep(.border-blue-200) {
  border-color: rgba(59, 130, 246, 0.5) !important;
}

html.dark :deep(.bg-blue-50) {
  background-color: rgba(37, 99, 235, 0.15) !important;
  border: 1px solid rgba(59, 130, 246, 0.3);
}

/* 成功提示框 - 绿色系列 */
html.dark :deep(.border-green-200) {
  border-color: rgba(34, 197, 94, 0.5) !important;
}

html.dark :deep(.bg-green-50) {
  background-color: rgba(34, 197, 94, 0.15) !important;
  border: 1px solid rgba(34, 197, 94, 0.3);
}

/* 警告提示框 - 黄色系列 */
html.dark :deep(.border-yellow-200) {
  border-color: rgba(250, 204, 21, 0.5) !important;
}

html.dark :deep(.bg-yellow-50) {
  background-color: rgba(250, 204, 21, 0.15) !important;
  border: 1px solid rgba(250, 204, 21, 0.3);
}

/* Indigo 提示框 */
html.dark :deep(.border-indigo-200) {
  border-color: rgba(99, 102, 241, 0.5) !important;
}

html.dark :deep(.bg-indigo-50) {
  background-color: rgba(99, 102, 241, 0.15) !important;
  border: 1px solid rgba(99, 102, 241, 0.3);
}

/* Purple 提示框 */
html.dark :deep(.border-purple-200) {
  border-color: rgba(168, 85, 247, 0.5) !important;
}

/* 渐变背景优化 */
html.dark :deep(.from-purple-50) {
  background: linear-gradient(
    to right,
    rgba(168, 85, 247, 0.15),
    rgba(236, 72, 153, 0.15)
  ) !important;
  border: 1px solid rgba(168, 85, 247, 0.3);
}

html.dark :deep(.from-blue-50) {
  background: linear-gradient(
    to right,
    rgba(59, 130, 246, 0.15),
    rgba(99, 102, 241, 0.15)
  ) !important;
  border: 1px solid rgba(59, 130, 246, 0.3);
}

html.dark :deep(.from-green-50) {
  background: linear-gradient(
    to right,
    rgba(34, 197, 94, 0.15),
    rgba(16, 185, 129, 0.15)
  ) !important;
  border: 1px solid rgba(34, 197, 94, 0.3);
}

/* 文字对比度优化 - 提高可读性 */
html.dark :deep(.text-gray-400) {
  color: #9ca3af !important;
}

html.dark :deep(.text-gray-600) {
  color: #d1d5db !important;
}

html.dark :deep(.text-gray-700) {
  color: #e5e7eb !important;
}

html.dark :deep(.text-gray-800) {
  color: #f3f4f6 !important;
}

/* 彩色文字优化 - 提高亮度 */
html.dark :deep(.text-blue-600) {
  color: #60a5fa !important;
}

html.dark :deep(.text-blue-700) {
  color: #60a5fa !important;
}

html.dark :deep(.text-blue-800) {
  color: #93c5fd !important;
}

html.dark :deep(.text-green-700) {
  color: #4ade80 !important;
}

html.dark :deep(.text-green-800) {
  color: #86efac !important;
}

html.dark :deep(.text-yellow-700) {
  color: #facc15 !important;
}

html.dark :deep(.text-yellow-800) {
  color: #fde047 !important;
}

html.dark :deep(.text-indigo-700) {
  color: #818cf8 !important;
}

html.dark :deep(.text-indigo-800) {
  color: #a5b4fc !important;
}

/* 标题对比度优化 */
html.dark :deep(h3),
html.dark :deep(h4),
html.dark :deep(h5),
html.dark :deep(h6) {
  color: #f9fafb !important;
}

/* 内嵌背景色优化 */
html.dark :deep(.bg-yellow-100) {
  background-color: rgba(250, 204, 21, 0.2) !important;
}

html.dark :deep(.bg-indigo-100) {
  background-color: rgba(99, 102, 241, 0.2) !important;
}

/* 白色背景框体优化 - 选中的标签页 */
html.dark :deep(.bg-white) {
  background-color: #374151 !important;
  border: 1px solid rgba(107, 114, 128, 0.5);
}

/* 边框颜色统一优化 */
html.dark :deep(.border-purple-700) {
  border-color: rgba(168, 85, 247, 0.6) !important;
}

html.dark :deep(.border-blue-100) {
  border-color: rgba(59, 130, 246, 0.4) !important;
}

html.dark :deep(.border-green-100) {
  border-color: rgba(34, 197, 94, 0.4) !important;
}

html.dark :deep(.border-purple-100) {
  border-color: rgba(168, 85, 247, 0.4) !important;
}

/* 代码块内文字颜色优化 */
html.dark :deep(.text-green-400) {
  color: #4ade80 !important;
}

html.dark :deep(.text-gray-300) {
  color: #d1d5db !important;
}
</style>
