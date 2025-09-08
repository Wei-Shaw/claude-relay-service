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
        跟著這個教程，你可以輕鬆在自己的電腦上安裝並使用 Claude Code。
      </p>
    </div>

    <!-- 系統選擇標籤 -->
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
          安裝 Node.js 環境
        </h4>
        <p class="mb-4 text-sm text-gray-600 dark:text-gray-400 sm:mb-4 sm:mb-6 sm:text-base">
          Claude Code 需要 Node.js 環境才能運行。
        </p>

        <div
          class="mb-4 rounded-xl border border-blue-100 bg-gradient-to-r from-blue-50 to-indigo-50 p-4 sm:mb-4 sm:mb-6 sm:p-6"
        >
          <h5
            class="mb-2 flex items-center text-base font-semibold text-gray-800 dark:text-gray-600 sm:mb-3 sm:text-lg"
          >
            <i class="fab fa-windows mr-2 text-blue-600" />
            Windows 安裝方法
          </h5>
          <div class="mb-3 sm:mb-4">
            <p class="mb-2 text-sm text-gray-700 dark:text-gray-600 sm:mb-3 sm:text-base">
              方法一：官網下載（推薦）
            </p>
            <ol
              class="ml-2 list-inside list-decimal space-y-1 text-xs text-gray-600 dark:text-gray-600 sm:ml-4 sm:space-y-2 sm:text-sm"
            >
              <li>
                打開瀏覽器訪問
                <code
                  class="rounded bg-gray-100 px-1 py-1 text-xs dark:bg-gray-700 sm:px-2 sm:text-sm"
                  >https://nodejs.org/</code
                >
              </li>
              <li>點擊 "LTS" 版本進行下載（推薦長期支持版本）</li>
              <li>
                下載完成後雙擊
                <code
                  class="rounded bg-gray-100 px-1 py-1 text-xs dark:bg-gray-700 sm:px-2 sm:text-sm"
                  >.msi</code
                >
                檔案
              </li>
              <li>按照安裝嚮導完成安裝，保持預設設定即可</li>
            </ol>
          </div>
          <div class="mb-3 sm:mb-4">
            <p class="mb-2 text-sm text-gray-700 dark:text-gray-600 sm:mb-3 sm:text-base">
              方法二：使用套件管理器
            </p>
            <p class="mb-2 text-xs text-gray-600 dark:text-gray-400 sm:text-sm">
              如果你安裝了 Chocolatey 或 Scoop，可以使用命令行安裝：
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
            <h6 class="mb-2 text-sm font-medium text-blue-800 sm:text-base">Windows 注意事項</h6>
            <ul class="space-y-1 text-xs text-blue-700 sm:text-sm sm:text-xs">
              <li>• 建議使用 PowerShell 而不是 CMD</li>
              <li>• 如果遇到權限問題，嘗試以管理員身份運行</li>
              <li>• 某些防毒軟體可能會誤報，需要新增白名單</li>
            </ul>
          </div>
        </div>

        <!-- 驗證安裝 -->
        <div class="rounded-lg border border-green-200 bg-green-50 p-3 sm:p-4">
          <h6 class="mb-2 text-sm font-medium text-green-800 sm:text-base">驗證安裝是否成功</h6>
          <p class="mb-2 text-xs text-green-700 sm:mb-3 sm:text-sm">
            安裝完成後，打開 PowerShell 或 CMD，輸入以下命令：
          </p>
          <div
            class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
          >
            <div class="whitespace-nowrap text-gray-300">node --version</div>
            <div class="whitespace-nowrap text-gray-300">npm --version</div>
          </div>
          <p class="mt-2 text-xs text-green-700 sm:text-sm">如果顯示版本號，說明安裝成功了！</p>
        </div>
      </div>

      <!-- 第二步：安裝 Claude Code -->
      <div class="mb-4 sm:mb-10 sm:mb-6">
        <h4
          class="mb-3 flex items-center text-lg font-semibold text-gray-800 dark:text-gray-300 sm:mb-4 sm:text-xl"
        >
          <span
            class="mr-2 flex h-6 w-6 items-center justify-center rounded-full bg-green-500 text-xs font-bold text-white sm:mr-3 sm:h-8 sm:w-8 sm:text-sm"
            >2</span
          >
          安裝 Claude Code
        </h4>

        <div
          class="mb-4 rounded-xl border border-green-100 bg-gradient-to-r from-green-50 to-emerald-50 p-4 sm:mb-6 sm:p-6"
        >
          <h5
            class="mb-2 flex items-center text-base font-semibold text-gray-800 dark:text-gray-600 sm:mb-3 sm:text-lg"
          >
            <i class="fas fa-download mr-2 text-green-600" />
            安裝 Claude Code
          </h5>
          <p class="mb-3 text-sm text-gray-700 dark:text-gray-300 sm:mb-4 sm:text-base">
            打開 PowerShell 或 CMD，運行以下命令：
          </p>
          <div
            class="mb-4 overflow-x-auto rounded-lg bg-gray-900 p-3 font-mono text-xs text-green-400 sm:p-4 sm:text-sm"
          >
            <div class="mb-2"># 全局安裝 Claude Code</div>
            <div class="whitespace-nowrap text-gray-300">
              npm install -g @anthropic-ai/claude-code
            </div>
          </div>
          <p class="text-sm text-gray-600 dark:text-gray-400">
            這個命令會從 npm 官方倉庫下載並安裝最新版本的 Claude Code。
          </p>

          <div class="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3 sm:p-4">
            <h6 class="mb-2 text-sm font-medium text-blue-800 sm:text-base">提示</h6>
            <ul class="space-y-1 text-xs text-blue-700 sm:text-sm">
              <li>• 建議使用 PowerShell 而不是 CMD，功能更強大</li>
              <li>• 如果遇到權限問題，以管理員身份運行 PowerShell</li>
            </ul>
          </div>
        </div>

        <!-- 驗證安裝 -->
        <div class="rounded-lg border border-green-200 bg-green-50 p-3 sm:p-4">
          <h6 class="mb-2 font-medium text-green-800 dark:text-green-300">驗證 Claude Code 安裝</h6>
          <p class="mb-3 text-sm text-green-700">安裝完成後，輸入以下命令檢查是否安裝成功：</p>
          <div
            class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
          >
            <div class="whitespace-nowrap text-gray-300">claude --version</div>
          </div>
          <p class="mt-2 text-sm text-green-700">
            如果顯示版本號，恭喜你！Claude Code 已經成功安裝了。
          </p>
        </div>
      </div>

      <!-- 第三步：設定環境變數 -->
      <div class="mb-6 sm:mb-10">
        <h4
          class="mb-3 flex items-center text-lg font-semibold text-gray-800 dark:text-gray-300 sm:mb-4 sm:text-xl"
        >
          <span
            class="mr-2 flex h-6 w-6 items-center justify-center rounded-full bg-purple-500 text-xs font-bold text-white sm:mr-3 sm:h-8 sm:w-8 sm:text-sm"
            >3</span
          >
          設定環境變數
        </h4>

        <div
          class="mb-4 rounded-xl border border-purple-100 bg-gradient-to-r from-purple-50 to-pink-50 p-4 sm:mb-6 sm:p-6"
        >
          <h5
            class="mb-2 flex items-center text-base font-semibold text-gray-800 dark:text-gray-600 sm:mb-3 sm:text-lg"
          >
            <i class="fas fa-cog mr-2 text-purple-600" />
            設定 Claude Code 環境變數
          </h5>
          <p class="mb-3 text-sm text-gray-700 dark:text-gray-300 sm:mb-4 sm:text-base">
            為了讓 Claude Code 連接到你的中轉服務，需要設定兩個環境變數：
          </p>

          <div class="space-y-4">
            <div
              class="rounded-lg border border-purple-200 bg-white p-3 dark:border-purple-700 dark:bg-gray-800 sm:p-4"
            >
              <h6 class="mb-2 text-sm font-medium text-gray-800 dark:text-gray-600 sm:text-base">
                方法一：PowerShell 臨時設定（當前會話）
              </h6>
              <p class="mb-3 text-sm text-gray-600">在 PowerShell 中運行以下命令：</p>
              <div
                class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="whitespace-nowrap text-gray-300">
                  $env:ANTHROPIC_BASE_URL = "{{ currentBaseUrl }}"
                </div>
                <div class="whitespace-nowrap text-gray-300">
                  $env:ANTHROPIC_AUTH_TOKEN = "你的API密鑰"
                </div>
              </div>
              <p class="mt-2 text-xs text-yellow-700">
                💡 記得將 "你的API密鑰" 替換為在上方 "API Keys" 標籤頁中創建的實際密鑰。
              </p>
            </div>

            <div
              class="rounded-lg border border-purple-200 bg-white p-3 dark:border-purple-700 dark:bg-gray-800 sm:p-4"
            >
              <h6 class="mb-2 text-sm font-medium text-gray-800 dark:text-gray-600 sm:text-base">
                方法二：PowerShell 永久設定（用戶級）
              </h6>
              <p class="mb-3 text-sm text-gray-600">
                在 PowerShell 中運行以下命令設定用戶級環境變數：
              </p>
              <div
                class="mb-3 overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="mb-2"># 設定用戶級環境變數（永久生效）</div>
                <div class="whitespace-nowrap text-gray-300">
                  [System.Environment]::SetEnvironmentVariable("ANTHROPIC_BASE_URL", "{{
                    currentBaseUrl
                  }}", [System.EnvironmentVariableTarget]::User)
                </div>
                <div class="whitespace-nowrap text-gray-300">
                  [System.Environment]::SetEnvironmentVariable("ANTHROPIC_AUTH_TOKEN",
                  "你的API密鑰", [System.EnvironmentVariableTarget]::User)
                </div>
              </div>
              <p class="mb-3 text-sm text-gray-600">查看已設定的環境變數：</p>
              <div
                class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="mb-2"># 查看用戶級環境變數</div>
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
                💡 設定後需要重新打開 PowerShell 視窗才能生效。
              </p>
            </div>
          </div>
        </div>

        <!-- 驗證環境變數設定 -->
        <div class="mt-6 rounded-lg border border-blue-200 bg-blue-50 p-3 sm:p-4">
          <h6 class="mb-2 font-medium text-blue-800 dark:text-blue-300">驗證環境變數設定</h6>
          <p class="mb-3 text-sm text-blue-700">
            設定完環境變數後，可以通過以下命令驗證是否設定成功：
          </p>

          <div class="space-y-4">
            <div>
              <h6 class="mb-2 text-sm font-medium text-gray-800 dark:text-gray-600 sm:text-base">
                在 PowerShell 中驗證：
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
                在 CMD 中驗證：
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
              <strong>預期輸出示例：</strong>
            </p>
            <div class="rounded bg-gray-100 p-2 font-mono text-sm dark:bg-gray-700">
              <div>{{ currentBaseUrl }}</div>
              <div>cr_xxxxxxxxxxxxxxxxxx</div>
            </div>
            <p class="text-xs text-blue-700">
              💡 如果輸出為空或顯示變數名本身，說明環境變數設定失敗，請重新設定。
            </p>
          </div>
        </div>

        <!-- Gemini CLI 环境变量设置 -->
        <div class="mt-8">
          <h5
            class="mb-2 flex items-center text-base font-semibold text-gray-800 dark:text-gray-600 sm:mb-3 sm:text-lg"
          >
            <i class="fas fa-robot mr-2 text-green-600" />
            設定 Gemini CLI 環境變數
          </h5>
          <p class="mb-3 text-sm text-gray-700 dark:text-gray-300 sm:mb-4 sm:text-base">
            如果你使用 Gemini CLI，需要設定以下環境變數：
          </p>

          <div class="space-y-4">
            <div class="rounded-lg border border-green-200 bg-white p-3 sm:p-4">
              <h6 class="mb-2 text-sm font-medium text-gray-800 dark:text-gray-600 sm:text-base">
                PowerShell 設定方法
              </h6>
              <p class="mb-3 text-sm text-gray-600">在 PowerShell 中運行以下命令：</p>
              <div
                class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="whitespace-nowrap text-gray-300">
                  $env:CODE_ASSIST_ENDPOINT = "{{ geminiBaseUrl }}"
                </div>
                <div class="whitespace-nowrap text-gray-300">
                  $env:GOOGLE_CLOUD_ACCESS_TOKEN = "你的API密鑰"
                </div>
                <div class="whitespace-nowrap text-gray-300">
                  $env:GOOGLE_GENAI_USE_GCA = "true"
                </div>
              </div>
              <p class="mt-2 text-xs text-yellow-700">
                💡 使用與 Claude Code 相同的 API 密鑰即可。
              </p>
            </div>

            <div class="rounded-lg border border-green-200 bg-white p-3 sm:p-4">
              <h6 class="mb-2 text-sm font-medium text-gray-800 dark:text-gray-600 sm:text-base">
                PowerShell 永久設定（用戶級）
              </h6>
              <p class="mb-3 text-sm text-gray-600">在 PowerShell 中運行以下命令：</p>
              <div
                class="mb-3 overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="mb-2"># 設定用戶級環境變數（永久生效）</div>
                <div class="whitespace-nowrap text-gray-300">
                  [System.Environment]::SetEnvironmentVariable("CODE_ASSIST_ENDPOINT", "{{
                    geminiBaseUrl
                  }}", [System.EnvironmentVariableTarget]::User)
                </div>
                <div class="whitespace-nowrap text-gray-300">
                  [System.Environment]::SetEnvironmentVariable("GOOGLE_CLOUD_ACCESS_TOKEN",
                  "你的API密鑰", [System.EnvironmentVariableTarget]::User)
                </div>
                <div class="whitespace-nowrap text-gray-300">
                  [System.Environment]::SetEnvironmentVariable("GOOGLE_GENAI_USE_GCA", "true",
                  [System.EnvironmentVariableTarget]::User)
                </div>
              </div>
              <p class="mt-2 text-xs text-blue-700">
                💡 設定後需要重新打開 PowerShell 視窗才能生效。
              </p>
            </div>

            <div class="rounded-lg border border-green-200 bg-green-50 p-3 sm:p-4">
              <h6 class="mb-2 font-medium text-green-800 dark:text-green-300">
                驗證 Gemini CLI 環境變數
              </h6>
              <p class="mb-3 text-sm text-green-700">在 PowerShell 中驗證：</p>
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
            設定 Codex 環境變數
          </h5>
          <p class="mb-3 text-sm text-gray-700 dark:text-gray-300 sm:mb-4 sm:text-base">
            如果你使用支援 OpenAI API 的工具（如 Codex），需要設定以下環境變數：
          </p>

          <div class="space-y-4">
            <div class="rounded-lg border border-yellow-200 bg-yellow-50 p-3 sm:p-4">
              <h6 class="mb-2 font-medium text-yellow-800">Codex 設定檔案</h6>
              <p class="mb-3 text-sm text-yellow-700">
                在
                <code class="rounded bg-yellow-100 px-1">~/.codex/config.toml</code>
                檔案中新增以下設定：
              </p>
              <div
                class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="whitespace-nowrap text-gray-300">model_provider = "crs"</div>
                <div class="whitespace-nowrap text-gray-300">model = "gpt-5"</div>
                <div class="whitespace-nowrap text-gray-300">model_reasoning_effort = "high"</div>
                <div class="whitespace-nowrap text-gray-300">disable_response_storage = true</div>
                <div class="whitespace-nowrap text-gray-300">preferred_auth_method = "apikey"</div>
                <div class="mt-2"></div>
                <div class="whitespace-nowrap text-gray-300">[model_providers.crs]</div>
                <div class="whitespace-nowrap text-gray-300">name = "crs"</div>
                <div class="whitespace-nowrap text-gray-300">base_url = "{{ openaiBaseUrl }}"</div>
                <div class="whitespace-nowrap text-gray-300">wire_api = "responses"</div>
              </div>
              <p class="mt-3 text-sm text-yellow-700">
                在
                <code class="rounded bg-yellow-100 px-1">~/.codex/auth.json</code>
                檔案中設定API密鑰：
              </p>
              <div
                class="mt-2 overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="whitespace-nowrap text-gray-300">{</div>
                <div class="whitespace-nowrap text-gray-300">"OPENAI_API_KEY": "你的API密鑰"</div>
                <div class="whitespace-nowrap text-gray-300">}</div>
              </div>
              <p class="mt-2 text-xs text-yellow-700">
                💡 使用與 Claude Code 相同的 API 密鑰即可，格式如 cr_xxxxxxxxxx。
              </p>
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
          開始使用 Claude Code
        </h4>
        <div
          class="rounded-xl border border-orange-100 bg-gradient-to-r from-orange-50 to-yellow-50 p-4 sm:p-6"
        >
          <p class="mb-3 text-sm text-gray-700 dark:text-gray-300 sm:mb-4 sm:text-base">
            現在你可以開始使用 Claude Code 了！
          </p>

          <div class="space-y-4">
            <div>
              <h6 class="mb-2 text-sm font-medium text-gray-800 dark:text-gray-600 sm:text-base">
                啟動 Claude Code
              </h6>
              <div
                class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="whitespace-nowrap text-gray-300">claude</div>
              </div>
            </div>

            <div>
              <h6 class="mb-2 text-sm font-medium text-gray-800 dark:text-gray-600 sm:text-base">
                在特定項目中使用
              </h6>
              <div
                class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="mb-2"># 進入你的項目目錄</div>
                <div class="whitespace-nowrap text-gray-300">cd C:\path\to\your\project</div>
                <div class="mb-2 mt-2"># 啟動 Claude Code</div>
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
          Windows 常見問題解決
        </h4>
        <div class="space-y-4">
          <details class="rounded-lg border border-gray-200 bg-gray-50">
            <summary
              class="cursor-pointer p-3 text-sm font-medium text-gray-800 hover:bg-gray-100 sm:p-4 sm:text-base"
            >
              安裝時提示 "permission denied" 錯誤
            </summary>
            <div class="px-3 pb-3 text-gray-600 sm:px-4 sm:pb-4">
              <p class="mb-2">這通常是權限問題，嘗試以下解決方法：</p>
              <ul class="list-inside list-disc space-y-1 text-sm">
                <li>以管理員身份運行 PowerShell</li>
                <li>
                  或者設定 npm 使用用戶目錄：<code
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
              PowerShell 執行策略錯誤
            </summary>
            <div class="px-3 pb-3 text-gray-600 sm:px-4 sm:pb-4">
              <p class="mb-2">如果遇到執行策略限制，運行：</p>
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
              環境變數設定後不生效
            </summary>
            <div class="px-3 pb-3 text-gray-600 sm:px-4 sm:pb-4">
              <p class="mb-2">設定永久環境變數後需要：</p>
              <ul class="list-inside list-disc space-y-1 text-sm">
                <li>重新啟動 PowerShell 或 CMD</li>
                <li>或者注销并重新登录 Windows</li>
                <li>
                  驗證設定：<code class="rounded bg-gray-200 px-1 text-xs sm:text-sm"
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
          安裝 Node.js 環境
        </h4>
        <p class="mb-4 text-gray-600 sm:mb-6">Claude Code 需要 Node.js 環境才能運行。</p>

        <div
          class="mb-4 rounded-xl border border-gray-200 bg-gradient-to-r from-gray-50 to-slate-50 p-4 sm:mb-6 sm:p-6"
        >
          <h5
            class="mb-2 flex items-center text-base font-semibold text-gray-800 dark:text-gray-600 sm:mb-3 sm:text-lg"
          >
            <i class="fab fa-apple mr-2 text-gray-700" />
            macOS 安裝方法
          </h5>
          <div class="mb-4">
            <p class="mb-3 text-gray-700">方法一：使用 Homebrew（推薦）</p>
            <p class="mb-2 text-xs text-gray-600 dark:text-gray-400 sm:text-sm">
              如果你已經安裝了 Homebrew，使用它安裝 Node.js 會更方便：
            </p>
            <div
              class="overflow-x-auto rounded-lg bg-gray-900 p-3 font-mono text-xs text-green-400 sm:p-4 sm:text-sm"
            >
              <div class="mb-2"># 更新 Homebrew</div>
              <div class="whitespace-nowrap text-gray-300">brew update</div>
              <div class="mb-2 mt-3"># 安裝 Node.js</div>
              <div class="whitespace-nowrap text-gray-300">brew install node</div>
            </div>
          </div>
          <div class="mb-4">
            <p class="mb-3 text-gray-700">方法二：官網下載</p>
            <ol
              class="ml-2 list-inside list-decimal space-y-1 text-xs text-gray-600 dark:text-gray-400 sm:ml-4 sm:space-y-2 sm:text-sm"
            >
              <li>
                訪問
                <code
                  class="rounded bg-gray-100 px-1 py-1 text-xs dark:bg-gray-700 sm:px-2 sm:text-sm"
                  >https://nodejs.org/</code
                >
              </li>
              <li>下載適合 macOS 的 LTS 版本</li>
              <li>
                打開下載的
                <code
                  class="rounded bg-gray-100 px-1 py-1 text-xs dark:bg-gray-700 sm:px-2 sm:text-sm"
                  >.pkg</code
                >
                檔案
              </li>
              <li>按照安裝程序指引完成安裝</li>
            </ol>
          </div>
          <div class="rounded-lg border border-gray-200 bg-gray-50 p-3 sm:p-4">
            <h6 class="mb-2 text-sm font-medium text-gray-800 sm:text-base">macOS 注意事項</h6>
            <ul class="space-y-1 text-xs text-gray-700 sm:text-sm">
              <li>
                • 如果遇到權限問題，可能需要使用
                <code class="rounded bg-gray-200 px-1 text-xs sm:text-sm">sudo</code>
              </li>
              <li>• 首次運行可能需要在系統偏好設定中允許</li>
              <li>• 建議使用 Terminal 或 iTerm2</li>
            </ul>
          </div>
        </div>

        <!-- 驗證安裝 -->
        <div class="rounded-lg border border-green-200 bg-green-50 p-3 sm:p-4">
          <h6 class="mb-2 font-medium text-green-800 dark:text-green-300">驗證安裝是否成功</h6>
          <p class="mb-3 text-sm text-green-700">安裝完成後，打開 Terminal，輸入以下命令：</p>
          <div
            class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
          >
            <div class="whitespace-nowrap text-gray-300">node --version</div>
            <div class="whitespace-nowrap text-gray-300">npm --version</div>
          </div>
          <p class="mt-2 text-sm text-green-700">如果顯示版本號，說明安裝成功了！</p>
        </div>
      </div>

      <!-- 第二步：安裝 Claude Code -->
      <div class="mb-6 sm:mb-10">
        <h4
          class="mb-3 flex items-center text-lg font-semibold text-gray-800 dark:text-gray-300 sm:mb-4 sm:text-xl"
        >
          <span
            class="mr-2 flex h-6 w-6 items-center justify-center rounded-full bg-green-500 text-xs font-bold text-white sm:mr-3 sm:h-8 sm:w-8 sm:text-sm"
            >2</span
          >
          安裝 Claude Code
        </h4>

        <div
          class="mb-4 rounded-xl border border-purple-100 bg-gradient-to-r from-purple-50 to-pink-50 p-4 sm:mb-6 sm:p-6"
        >
          <h5
            class="mb-2 flex items-center text-base font-semibold text-gray-800 dark:text-gray-600 sm:mb-3 sm:text-lg"
          >
            <i class="fas fa-download mr-2 text-purple-600" />
            安裝 Claude Code
          </h5>
          <p class="mb-3 text-sm text-gray-700 dark:text-gray-300 sm:mb-4 sm:text-base">
            打開 Terminal，運行以下命令：
          </p>
          <div
            class="mb-4 overflow-x-auto rounded-lg bg-gray-900 p-3 font-mono text-xs text-green-400 sm:p-4 sm:text-sm"
          >
            <div class="mb-2"># 全局安裝 Claude Code</div>
            <div class="whitespace-nowrap text-gray-300">
              npm install -g @anthropic-ai/claude-code
            </div>
          </div>
          <p class="mb-2 text-sm text-gray-600">如果遇到權限問題，可以使用 sudo：</p>
          <div
            class="overflow-x-auto rounded-lg bg-gray-900 p-3 font-mono text-xs text-green-400 sm:p-4 sm:text-sm"
          >
            <div class="whitespace-nowrap text-gray-300">
              sudo npm install -g @anthropic-ai/claude-code
            </div>
          </div>
        </div>

        <!-- 驗證安裝 -->
        <div class="rounded-lg border border-green-200 bg-green-50 p-3 sm:p-4">
          <h6 class="mb-2 font-medium text-green-800 dark:text-green-300">驗證 Claude Code 安裝</h6>
          <p class="mb-3 text-sm text-green-700">安裝完成後，輸入以下命令檢查是否安裝成功：</p>
          <div
            class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
          >
            <div class="whitespace-nowrap text-gray-300">claude --version</div>
          </div>
          <p class="mt-2 text-sm text-green-700">
            如果顯示版本號，恭喜你！Claude Code 已經成功安裝了。
          </p>
        </div>
      </div>

      <!-- 第三步：設定環境變數 -->
      <div class="mb-6 sm:mb-10">
        <h4
          class="mb-3 flex items-center text-lg font-semibold text-gray-800 dark:text-gray-300 sm:mb-4 sm:text-xl"
        >
          <span
            class="mr-2 flex h-6 w-6 items-center justify-center rounded-full bg-orange-500 text-xs font-bold text-white sm:mr-3 sm:h-8 sm:w-8 sm:text-sm"
            >3</span
          >
          設定環境變數
        </h4>

        <div
          class="mb-4 rounded-xl border border-orange-100 bg-gradient-to-r from-orange-50 to-yellow-50 p-4 sm:mb-6 sm:p-6"
        >
          <h5
            class="mb-2 flex items-center text-base font-semibold text-gray-800 dark:text-gray-600 sm:mb-3 sm:text-lg"
          >
            <i class="fas fa-cog mr-2 text-orange-600" />
            設定 Claude Code 環境變數
          </h5>
          <p class="mb-3 text-sm text-gray-700 dark:text-gray-300 sm:mb-4 sm:text-base">
            為了讓 Claude Code 連接到你的中轉服務，需要設定兩個環境變數：
          </p>

          <div class="space-y-4">
            <div class="rounded-lg border border-orange-200 bg-white p-3 sm:p-4">
              <h6 class="mb-2 text-sm font-medium text-gray-800 dark:text-gray-600 sm:text-base">
                方法一：臨時設定（當前會話）
              </h6>
              <p class="mb-3 text-sm text-gray-600">在 Terminal 中運行以下命令：</p>
              <div
                class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="whitespace-nowrap text-gray-300">
                  export ANTHROPIC_BASE_URL="{{ currentBaseUrl }}"
                </div>
                <div class="whitespace-nowrap text-gray-300">
                  export ANTHROPIC_AUTH_TOKEN="你的API密鑰"
                </div>
              </div>
              <p class="mt-2 text-xs text-yellow-700">
                💡 記得將 "你的API密鑰" 替換為在上方 "API Keys" 標籤頁中創建的實際密鑰。
              </p>
            </div>

            <div class="rounded-lg border border-orange-200 bg-white p-3 sm:p-4">
              <h6 class="mb-2 text-sm font-medium text-gray-800 dark:text-gray-600 sm:text-base">
                方法二：永久設定
              </h6>
              <p class="mb-3 text-sm text-gray-600">
                編輯你的 shell 設定檔案（根據你使用的 shell）：
              </p>
              <div
                class="mb-3 overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="mb-2"># 對於 zsh (預設)</div>
                <div class="whitespace-nowrap text-gray-300">
                  echo 'export ANTHROPIC_BASE_URL="{{ currentBaseUrl }}"' >> ~/.zshrc
                </div>
                <div class="whitespace-nowrap text-gray-300">
                  echo 'export ANTHROPIC_AUTH_TOKEN="你的API密鑰"' >> ~/.zshrc
                </div>
                <div class="whitespace-nowrap text-gray-300">source ~/.zshrc</div>
              </div>
              <div
                class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="mb-2"># 對於 bash</div>
                <div class="whitespace-nowrap text-gray-300">
                  echo 'export ANTHROPIC_BASE_URL="{{ currentBaseUrl }}"' >> ~/.bash_profile
                </div>
                <div class="whitespace-nowrap text-gray-300">
                  echo 'export ANTHROPIC_AUTH_TOKEN="你的API密鑰"' >> ~/.bash_profile
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
            設定 Gemini CLI 環境變數
          </h5>
          <p class="mb-3 text-sm text-gray-700 dark:text-gray-300 sm:mb-4 sm:text-base">
            如果你使用 Gemini CLI，需要設定以下環境變數：
          </p>

          <div class="space-y-4">
            <div class="rounded-lg border border-green-200 bg-white p-3 sm:p-4">
              <h6 class="mb-2 text-sm font-medium text-gray-800 dark:text-gray-600 sm:text-base">
                Terminal 設定方法
              </h6>
              <p class="mb-3 text-sm text-gray-600">在 Terminal 中運行以下命令：</p>
              <div
                class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="whitespace-nowrap text-gray-300">
                  export CODE_ASSIST_ENDPOINT="{{ geminiBaseUrl }}"
                </div>
                <div class="whitespace-nowrap text-gray-300">
                  export GOOGLE_CLOUD_ACCESS_TOKEN="你的API密鑰"
                </div>
                <div class="whitespace-nowrap text-gray-300">
                  export GOOGLE_GENAI_USE_GCA="true"
                </div>
              </div>
              <p class="mt-2 text-xs text-yellow-700">
                💡 使用與 Claude Code 相同的 API 密鑰即可。
              </p>
            </div>

            <div class="rounded-lg border border-green-200 bg-white p-3 sm:p-4">
              <h6 class="mb-2 text-sm font-medium text-gray-800 dark:text-gray-600 sm:text-base">
                永久設定方法
              </h6>
              <p class="mb-3 text-sm text-gray-600">新增到你的 shell 設定檔案：</p>
              <div
                class="mb-3 overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="mb-2"># 對於 zsh (預設)</div>
                <div class="whitespace-nowrap text-gray-300">
                  echo 'export CODE_ASSIST_ENDPOINT="{{ geminiBaseUrl }}"' >> ~/.zshrc
                </div>
                <div class="whitespace-nowrap text-gray-300">
                  echo 'export GOOGLE_CLOUD_ACCESS_TOKEN="你的API密鑰"' >> ~/.zshrc
                </div>
                <div class="whitespace-nowrap text-gray-300">
                  echo 'export GOOGLE_GENAI_USE_GCA="true"' >> ~/.zshrc
                </div>
                <div class="whitespace-nowrap text-gray-300">source ~/.zshrc</div>
              </div>
              <div
                class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="mb-2"># 對於 bash</div>
                <div class="whitespace-nowrap text-gray-300">
                  echo 'export CODE_ASSIST_ENDPOINT="{{ geminiBaseUrl }}"' >> ~/.bash_profile
                </div>
                <div class="whitespace-nowrap text-gray-300">
                  echo 'export GOOGLE_CLOUD_ACCESS_TOKEN="你的API密鑰"' >> ~/.bash_profile
                </div>
                <div class="whitespace-nowrap text-gray-300">
                  echo 'export GOOGLE_GENAI_USE_GCA="true"' >> ~/.bash_profile
                </div>
                <div class="whitespace-nowrap text-gray-300">source ~/.bash_profile</div>
              </div>
            </div>

            <div class="rounded-lg border border-green-200 bg-green-50 p-3 sm:p-4">
              <h6 class="mb-2 font-medium text-green-800 dark:text-green-300">
                驗證 Gemini CLI 環境變數
              </h6>
              <p class="mb-3 text-sm text-green-700">在 Terminal 中驗證：</p>
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
            設定 Codex 環境變數
          </h5>
          <p class="mb-3 text-sm text-gray-700 dark:text-gray-300 sm:mb-4 sm:text-base">
            如果你使用支援 OpenAI API 的工具（如 Codex），需要設定以下環境變數：
          </p>

          <div class="space-y-4">
            <div class="rounded-lg border border-yellow-200 bg-yellow-50 p-3 sm:p-4">
              <h6 class="mb-2 font-medium text-yellow-800">Codex 設定檔案</h6>
              <p class="mb-3 text-sm text-yellow-700">
                在
                <code class="rounded bg-yellow-100 px-1">~/.codex/config.toml</code>
                檔案中新增以下設定：
              </p>
              <div
                class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="whitespace-nowrap text-gray-300">model_provider = "crs"</div>
                <div class="whitespace-nowrap text-gray-300">model = "gpt-5"</div>
                <div class="whitespace-nowrap text-gray-300">model_reasoning_effort = "high"</div>
                <div class="whitespace-nowrap text-gray-300">disable_response_storage = true</div>
                <div class="whitespace-nowrap text-gray-300">preferred_auth_method = "apikey"</div>
                <div class="mt-2"></div>
                <div class="whitespace-nowrap text-gray-300">[model_providers.crs]</div>
                <div class="whitespace-nowrap text-gray-300">name = "crs"</div>
                <div class="whitespace-nowrap text-gray-300">base_url = "{{ openaiBaseUrl }}"</div>
                <div class="whitespace-nowrap text-gray-300">wire_api = "responses"</div>
              </div>
              <p class="mt-3 text-sm text-yellow-700">
                在
                <code class="rounded bg-yellow-100 px-1">~/.codex/auth.json</code>
                檔案中設定API密鑰：
              </p>
              <div
                class="mt-2 overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="whitespace-nowrap text-gray-300">{</div>
                <div class="whitespace-nowrap text-gray-300">"OPENAI_API_KEY": "你的API密鑰"</div>
                <div class="whitespace-nowrap text-gray-300">}</div>
              </div>
              <p class="mt-2 text-xs text-yellow-700">
                💡 使用與 Claude Code 相同的 API 密鑰即可，格式如 cr_xxxxxxxxxx。
              </p>
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
          開始使用 Claude Code
        </h4>
        <div
          class="rounded-xl border border-yellow-100 bg-gradient-to-r from-yellow-50 to-amber-50 p-4 sm:p-6"
        >
          <p class="mb-3 text-sm text-gray-700 dark:text-gray-300 sm:mb-4 sm:text-base">
            現在你可以開始使用 Claude Code 了！
          </p>

          <div class="space-y-4">
            <div>
              <h6 class="mb-2 text-sm font-medium text-gray-800 dark:text-gray-600 sm:text-base">
                啟動 Claude Code
              </h6>
              <div
                class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="whitespace-nowrap text-gray-300">claude</div>
              </div>
            </div>

            <div>
              <h6 class="mb-2 text-sm font-medium text-gray-800 dark:text-gray-600 sm:text-base">
                在特定項目中使用
              </h6>
              <div
                class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="mb-2"># 進入你的項目目錄</div>
                <div class="whitespace-nowrap text-gray-300">cd /path/to/your/project</div>
                <div class="mb-2 mt-2"># 啟動 Claude Code</div>
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
          macOS 常見問題解決
        </h4>
        <div class="space-y-4">
          <details class="rounded-lg border border-gray-200 bg-gray-50">
            <summary
              class="cursor-pointer p-3 text-sm font-medium text-gray-800 hover:bg-gray-100 sm:p-4 sm:text-base"
            >
              安裝時提示權限錯誤
            </summary>
            <div class="px-3 pb-3 text-gray-600 sm:px-4 sm:pb-4">
              <p class="mb-2">嘗試以下解決方法：</p>
              <ul class="list-inside list-disc space-y-1 text-sm">
                <li>
                  使用 sudo 安裝：<code class="rounded bg-gray-200 px-1 text-xs sm:text-sm"
                    >sudo npm install -g @anthropic-ai/claude-code</code
                  >
                </li>
                <li>
                  或者設定 npm 使用用戶目錄：<code
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
              macOS 安全設定阻止運行
            </summary>
            <div class="px-3 pb-3 text-gray-600 sm:px-4 sm:pb-4">
              <p class="mb-2">如果系統阻止運行 Claude Code：</p>
              <ul class="list-inside list-disc space-y-1 text-sm">
                <li>打開"系統偏好設定" → "安全性與隱私"</li>
                <li>點擊"仍要打開"或"允許"</li>
                <li>
                  或者在 Terminal 中運行：<code class="rounded bg-gray-200 px-1 text-xs sm:text-sm"
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
              環境變數不生效
            </summary>
            <div class="px-3 pb-3 text-gray-600 sm:px-4 sm:pb-4">
              <p class="mb-2">檢查以下幾點：</p>
              <ul class="list-inside list-disc space-y-1 text-sm">
                <li>確認修改了正確的設定檔案（.zshrc 或 .bash_profile）</li>
                <li>重新啟動 Terminal</li>
                <li>
                  驗證設定：<code class="rounded bg-gray-200 px-1 text-xs sm:text-sm"
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
          安裝 Node.js 環境
        </h4>
        <p class="mb-4 text-gray-600 sm:mb-6">Claude Code 需要 Node.js 環境才能運行。</p>

        <div
          class="mb-4 rounded-xl border border-orange-100 bg-gradient-to-r from-orange-50 to-red-50 p-4 sm:mb-6 sm:p-6"
        >
          <h5
            class="mb-2 flex items-center text-base font-semibold text-gray-800 dark:text-gray-600 sm:mb-3 sm:text-lg"
          >
            <i class="fab fa-ubuntu mr-2 text-orange-600" />
            Linux 安裝方法
          </h5>
          <div class="mb-4">
            <p class="mb-3 text-gray-700">方法一：使用官方倉庫（推薦）</p>
            <div
              class="overflow-x-auto rounded-lg bg-gray-900 p-3 font-mono text-xs text-green-400 sm:p-4 sm:text-sm"
            >
              <div class="mb-2"># 新增 NodeSource 倉庫</div>
              <div class="whitespace-nowrap text-gray-300">
                curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
              </div>
              <div class="mb-2 mt-3"># 安裝 Node.js</div>
              <div class="whitespace-nowrap text-gray-300">sudo apt-get install -y nodejs</div>
            </div>
          </div>
          <div class="mb-4">
            <p class="mb-3 text-gray-700">方法二：使用系統套件管理器</p>
            <p class="mb-2 text-xs text-gray-600 dark:text-gray-400 sm:text-sm">
              雖然版本可能不是最新的，但對於基本使用已經足夠：
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
            <h6 class="mb-2 text-sm font-medium text-orange-800 sm:text-base">Linux 注意事項</h6>
            <ul class="space-y-1 text-xs text-orange-700 sm:text-sm">
              <li>• 某些發行版可能需要安裝額外的依賴</li>
              <li>• 如果遇到權限問題，使用 <code class="rounded bg-orange-200 px-1">sudo</code></li>
              <li>• 確保你的用戶在 npm 的全局目錄有寫權限</li>
            </ul>
          </div>
        </div>

        <!-- 驗證安裝 -->
        <div class="rounded-lg border border-green-200 bg-green-50 p-3 sm:p-4">
          <h6 class="mb-2 font-medium text-green-800 dark:text-green-300">驗證安裝是否成功</h6>
          <p class="mb-3 text-sm text-green-700">安裝完成後，打開終端，輸入以下命令：</p>
          <div
            class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
          >
            <div class="whitespace-nowrap text-gray-300">node --version</div>
            <div class="whitespace-nowrap text-gray-300">npm --version</div>
          </div>
          <p class="mt-2 text-sm text-green-700">如果顯示版本號，說明安裝成功了！</p>
        </div>
      </div>

      <!-- 第二步：安裝 Claude Code -->
      <div class="mb-6 sm:mb-10">
        <h4
          class="mb-3 flex items-center text-lg font-semibold text-gray-800 dark:text-gray-300 sm:mb-4 sm:text-xl"
        >
          <span
            class="mr-2 flex h-6 w-6 items-center justify-center rounded-full bg-green-500 text-xs font-bold text-white sm:mr-3 sm:h-8 sm:w-8 sm:text-sm"
            >2</span
          >
          安裝 Claude Code
        </h4>

        <div
          class="mb-4 rounded-xl border border-purple-100 bg-gradient-to-r from-purple-50 to-pink-50 p-4 sm:mb-6 sm:p-6"
        >
          <h5
            class="mb-2 flex items-center text-base font-semibold text-gray-800 dark:text-gray-600 sm:mb-3 sm:text-lg"
          >
            <i class="fas fa-download mr-2 text-purple-600" />
            安裝 Claude Code
          </h5>
          <p class="mb-3 text-sm text-gray-700 dark:text-gray-300 sm:mb-4 sm:text-base">
            打開終端，運行以下命令：
          </p>
          <div
            class="mb-4 overflow-x-auto rounded-lg bg-gray-900 p-3 font-mono text-xs text-green-400 sm:p-4 sm:text-sm"
          >
            <div class="mb-2"># 全局安裝 Claude Code</div>
            <div class="whitespace-nowrap text-gray-300">
              npm install -g @anthropic-ai/claude-code
            </div>
          </div>
          <p class="mb-2 text-sm text-gray-600">如果遇到權限問題，可以使用 sudo：</p>
          <div
            class="overflow-x-auto rounded-lg bg-gray-900 p-3 font-mono text-xs text-green-400 sm:p-4 sm:text-sm"
          >
            <div class="whitespace-nowrap text-gray-300">
              sudo npm install -g @anthropic-ai/claude-code
            </div>
          </div>
        </div>

        <!-- 驗證安裝 -->
        <div class="rounded-lg border border-green-200 bg-green-50 p-3 sm:p-4">
          <h6 class="mb-2 font-medium text-green-800 dark:text-green-300">驗證 Claude Code 安裝</h6>
          <p class="mb-3 text-sm text-green-700">安裝完成後，輸入以下命令檢查是否安裝成功：</p>
          <div
            class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
          >
            <div class="whitespace-nowrap text-gray-300">claude --version</div>
          </div>
          <p class="mt-2 text-sm text-green-700">
            如果顯示版本號，恭喜你！Claude Code 已經成功安裝了。
          </p>
        </div>
      </div>

      <!-- 第三步：設定環境變數 -->
      <div class="mb-6 sm:mb-10">
        <h4
          class="mb-3 flex items-center text-lg font-semibold text-gray-800 dark:text-gray-300 sm:mb-4 sm:text-xl"
        >
          <span
            class="mr-2 flex h-6 w-6 items-center justify-center rounded-full bg-orange-500 text-xs font-bold text-white sm:mr-3 sm:h-8 sm:w-8 sm:text-sm"
            >3</span
          >
          設定環境變數
        </h4>

        <div
          class="mb-4 rounded-xl border border-orange-100 bg-gradient-to-r from-orange-50 to-yellow-50 p-4 sm:mb-6 sm:p-6"
        >
          <h5
            class="mb-2 flex items-center text-base font-semibold text-gray-800 dark:text-gray-600 sm:mb-3 sm:text-lg"
          >
            <i class="fas fa-cog mr-2 text-orange-600" />
            設定 Claude Code 環境變數
          </h5>
          <p class="mb-3 text-sm text-gray-700 dark:text-gray-300 sm:mb-4 sm:text-base">
            為了讓 Claude Code 連接到你的中轉服務，需要設定兩個環境變數：
          </p>

          <div class="space-y-4">
            <div class="rounded-lg border border-orange-200 bg-white p-3 sm:p-4">
              <h6 class="mb-2 text-sm font-medium text-gray-800 dark:text-gray-600 sm:text-base">
                方法一：臨時設定（當前會話）
              </h6>
              <p class="mb-3 text-sm text-gray-600">在終端中運行以下命令：</p>
              <div
                class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="whitespace-nowrap text-gray-300">
                  export ANTHROPIC_BASE_URL="{{ currentBaseUrl }}"
                </div>
                <div class="whitespace-nowrap text-gray-300">
                  export ANTHROPIC_AUTH_TOKEN="你的API密鑰"
                </div>
              </div>
              <p class="mt-2 text-xs text-yellow-700">
                💡 記得將 "你的API密鑰" 替換為在上方 "API Keys" 標籤頁中創建的實際密鑰。
              </p>
            </div>

            <div class="rounded-lg border border-orange-200 bg-white p-3 sm:p-4">
              <h6 class="mb-2 text-sm font-medium text-gray-800 dark:text-gray-600 sm:text-base">
                方法二：永久設定
              </h6>
              <p class="mb-3 text-sm text-gray-600">編輯你的 shell 設定檔案：</p>
              <div
                class="mb-3 overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="mb-2"># 對於 bash (預設)</div>
                <div class="whitespace-nowrap text-gray-300">
                  echo 'export ANTHROPIC_BASE_URL="{{ currentBaseUrl }}"' >> ~/.bashrc
                </div>
                <div class="whitespace-nowrap text-gray-300">
                  echo 'export ANTHROPIC_AUTH_TOKEN="你的API密鑰"' >> ~/.bashrc
                </div>
                <div class="whitespace-nowrap text-gray-300">source ~/.bashrc</div>
              </div>
              <div
                class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="mb-2"># 對於 zsh</div>
                <div class="whitespace-nowrap text-gray-300">
                  echo 'export ANTHROPIC_BASE_URL="{{ currentBaseUrl }}"' >> ~/.zshrc
                </div>
                <div class="whitespace-nowrap text-gray-300">
                  echo 'export ANTHROPIC_AUTH_TOKEN="你的API密鑰"' >> ~/.zshrc
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
            設定 Gemini CLI 環境變數
          </h5>
          <p class="mb-3 text-sm text-gray-700 dark:text-gray-300 sm:mb-4 sm:text-base">
            如果你使用 Gemini CLI，需要設定以下環境變數：
          </p>

          <div class="space-y-4">
            <div class="rounded-lg border border-green-200 bg-white p-3 sm:p-4">
              <h6 class="mb-2 text-sm font-medium text-gray-800 dark:text-gray-600 sm:text-base">
                終端設定方法
              </h6>
              <p class="mb-3 text-sm text-gray-600">在終端中運行以下命令：</p>
              <div
                class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="whitespace-nowrap text-gray-300">
                  export CODE_ASSIST_ENDPOINT="{{ geminiBaseUrl }}"
                </div>
                <div class="whitespace-nowrap text-gray-300">
                  export GOOGLE_CLOUD_ACCESS_TOKEN="你的API密鑰"
                </div>
                <div class="whitespace-nowrap text-gray-300">
                  export GOOGLE_GENAI_USE_GCA="true"
                </div>
              </div>
              <p class="mt-2 text-xs text-yellow-700">
                💡 使用與 Claude Code 相同的 API 密鑰即可。
              </p>
            </div>

            <div class="rounded-lg border border-green-200 bg-white p-3 sm:p-4">
              <h6 class="mb-2 text-sm font-medium text-gray-800 dark:text-gray-600 sm:text-base">
                永久設定方法
              </h6>
              <p class="mb-3 text-sm text-gray-600">新增到你的 shell 設定檔案：</p>
              <div
                class="mb-3 overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="mb-2"># 對於 bash (預設)</div>
                <div class="whitespace-nowrap text-gray-300">
                  echo 'export CODE_ASSIST_ENDPOINT="{{ geminiBaseUrl }}"' >> ~/.bashrc
                </div>
                <div class="whitespace-nowrap text-gray-300">
                  echo 'export GOOGLE_CLOUD_ACCESS_TOKEN="你的API密鑰"' >> ~/.bashrc
                </div>
                <div class="whitespace-nowrap text-gray-300">
                  echo 'export GOOGLE_GENAI_USE_GCA="true"' >> ~/.bashrc
                </div>
                <div class="whitespace-nowrap text-gray-300">source ~/.bashrc</div>
              </div>
              <div
                class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="mb-2"># 對於 zsh</div>
                <div class="whitespace-nowrap text-gray-300">
                  echo 'export CODE_ASSIST_ENDPOINT="{{ geminiBaseUrl }}"' >> ~/.zshrc
                </div>
                <div class="whitespace-nowrap text-gray-300">
                  echo 'export GOOGLE_CLOUD_ACCESS_TOKEN="你的API密鑰"' >> ~/.zshrc
                </div>
                <div class="whitespace-nowrap text-gray-300">
                  echo 'export GOOGLE_GENAI_USE_GCA="true"' >> ~/.zshrc
                </div>
                <div class="whitespace-nowrap text-gray-300">source ~/.zshrc</div>
              </div>
            </div>

            <div class="rounded-lg border border-green-200 bg-green-50 p-3 sm:p-4">
              <h6 class="mb-2 font-medium text-green-800 dark:text-green-300">
                驗證 Gemini CLI 環境變數
              </h6>
              <p class="mb-3 text-sm text-green-700">在終端中驗證：</p>
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
            設定 Codex 環境變數
          </h5>
          <p class="mb-3 text-sm text-gray-700 dark:text-gray-300 sm:mb-4 sm:text-base">
            如果你使用支援 OpenAI API 的工具（如 Codex），需要設定以下環境變數：
          </p>

          <div class="space-y-4">
            <div class="rounded-lg border border-yellow-200 bg-yellow-50 p-3 sm:p-4">
              <h6 class="mb-2 font-medium text-yellow-800">Codex 設定檔案</h6>
              <p class="mb-3 text-sm text-yellow-700">
                在
                <code class="rounded bg-yellow-100 px-1">~/.codex/config.toml</code>
                檔案中新增以下設定：
              </p>
              <div
                class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="whitespace-nowrap text-gray-300">model_provider = "crs"</div>
                <div class="whitespace-nowrap text-gray-300">model = "gpt-5"</div>
                <div class="whitespace-nowrap text-gray-300">model_reasoning_effort = "high"</div>
                <div class="whitespace-nowrap text-gray-300">disable_response_storage = true</div>
                <div class="whitespace-nowrap text-gray-300">preferred_auth_method = "apikey"</div>
                <div class="mt-2"></div>
                <div class="whitespace-nowrap text-gray-300">[model_providers.crs]</div>
                <div class="whitespace-nowrap text-gray-300">name = "crs"</div>
                <div class="whitespace-nowrap text-gray-300">base_url = "{{ openaiBaseUrl }}"</div>
                <div class="whitespace-nowrap text-gray-300">wire_api = "responses"</div>
              </div>
              <p class="mt-3 text-sm text-yellow-700">
                在
                <code class="rounded bg-yellow-100 px-1">~/.codex/auth.json</code>
                檔案中設定API密鑰：
              </p>
              <div
                class="mt-2 overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="whitespace-nowrap text-gray-300">{</div>
                <div class="whitespace-nowrap text-gray-300">"OPENAI_API_KEY": "你的API密鑰"</div>
                <div class="whitespace-nowrap text-gray-300">}</div>
              </div>
              <p class="mt-2 text-xs text-yellow-700">
                💡 使用與 Claude Code 相同的 API 密鑰即可，格式如 cr_xxxxxxxxxx。
              </p>
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
          開始使用 Claude Code
        </h4>
        <div
          class="rounded-xl border border-yellow-100 bg-gradient-to-r from-yellow-50 to-amber-50 p-4 sm:p-6"
        >
          <p class="mb-3 text-sm text-gray-700 dark:text-gray-300 sm:mb-4 sm:text-base">
            現在你可以開始使用 Claude Code 了！
          </p>

          <div class="space-y-4">
            <div>
              <h6 class="mb-2 text-sm font-medium text-gray-800 dark:text-gray-600 sm:text-base">
                啟動 Claude Code
              </h6>
              <div
                class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="whitespace-nowrap text-gray-300">claude</div>
              </div>
            </div>

            <div>
              <h6 class="mb-2 text-sm font-medium text-gray-800 dark:text-gray-600 sm:text-base">
                在特定項目中使用
              </h6>
              <div
                class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="mb-2"># 進入你的項目目錄</div>
                <div class="whitespace-nowrap text-gray-300">cd /path/to/your/project</div>
                <div class="mb-2 mt-2"># 啟動 Claude Code</div>
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
          Linux 常見問題解決
        </h4>
        <div class="space-y-4">
          <details class="rounded-lg border border-gray-200 bg-gray-50">
            <summary
              class="cursor-pointer p-3 text-sm font-medium text-gray-800 hover:bg-gray-100 sm:p-4 sm:text-base"
            >
              安裝時提示權限錯誤
            </summary>
            <div class="px-3 pb-3 text-gray-600 sm:px-4 sm:pb-4">
              <p class="mb-2">嘗試以下解決方法：</p>
              <ul class="list-inside list-disc space-y-1 text-sm">
                <li>
                  使用 sudo 安裝：<code class="rounded bg-gray-200 px-1 text-xs sm:text-sm"
                    >sudo npm install -g @anthropic-ai/claude-code</code
                  >
                </li>
                <li>
                  或者設定 npm 使用用戶目錄：<code
                    class="rounded bg-gray-200 px-1 text-xs sm:text-sm"
                    >npm config set prefix ~/.npm-global</code
                  >
                </li>
                <li>
                  然後新增到 PATH：<code class="rounded bg-gray-200 px-1 text-xs sm:text-sm"
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
              缺少依賴庫
            </summary>
            <div class="px-3 pb-3 text-gray-600 sm:px-4 sm:pb-4">
              <p class="mb-2">某些 Linux 發行版需要安裝額外依賴：</p>
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
              環境變數不生效
            </summary>
            <div class="px-3 pb-3 text-gray-600 sm:px-4 sm:pb-4">
              <p class="mb-2">檢查以下幾點：</p>
              <ul class="list-inside list-disc space-y-1 text-sm">
                <li>確認修改了正確的設定檔案（.bashrc 或 .zshrc）</li>
                <li>
                  重新啟動終端或運行
                  <code class="rounded bg-gray-200 px-1 text-xs sm:text-sm">source ~/.bashrc</code>
                </li>
                <li>
                  驗證設定：<code class="rounded bg-gray-200 px-1 text-xs sm:text-sm"
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
        你已經成功安裝並設定了 Claude Code，現在可以開始享受 AI 編程助手帶來的便利了。
      </p>
      <p class="text-xs text-blue-200 sm:text-sm">
        如果在使用過程中遇到任何問題，可以查看官方文檔或社區討論獲取幫助。
      </p>
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

  // 否则使用当前浏览器訪問地址
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

    // 只有在非預設埠號時才新增埠號
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
      // 最後的降級方案，使用相對路徑
      console.warn('無法獲取完整的 origin，將使用相對路徑')
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
