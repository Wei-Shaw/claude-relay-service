<template>
  <div class="card p-3 sm:p-6">
    <div class="mb-4 sm:mb-8">
      <h3
        class="mb-3 flex items-center text-xl font-bold text-gray-900 dark:text-gray-100 sm:mb-4 sm:text-2xl"
      >
        <i class="fas fa-graduation-cap mr-2 text-blue-600 sm:mr-3" />
        Claude Code Tutorial
      </h3>
      <p class="text-sm text-gray-600 dark:text-gray-400 sm:text-lg">
        Follow this tutorial to easily install and use Claude Code on your computer.
      </p>
    </div>

    <!-- System Selection -->
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

    <!-- Windows Tutorial -->
    <div v-if="activeTutorialSystem === 'windows'" class="tutorial-content">
      <!-- Step 1: Install Node.js -->
      <div class="mb-4 sm:mb-10 sm:mb-6">
        <h4
          class="mb-3 flex items-center text-lg font-semibold text-gray-800 dark:text-gray-300 sm:mb-4 sm:text-xl"
        >
          <span
            class="mr-2 flex h-6 w-6 items-center justify-center rounded-full bg-blue-500 text-xs font-bold text-white sm:mr-3 sm:h-8 sm:w-8 sm:text-sm"
            >1</span
          >
          Install Node.js Environment
        </h4>
        <p class="mb-4 text-sm text-gray-600 dark:text-gray-400 sm:mb-4 sm:mb-6 sm:text-base">
          Claude Code requires Node.js environment to run.
        </p>

        <div
          class="mb-4 rounded-xl border border-blue-100 bg-gradient-to-r from-blue-50 to-indigo-50 p-4 sm:mb-4 sm:mb-6 sm:p-6"
        >
          <h5
            class="mb-2 flex items-center text-base font-semibold text-gray-800 dark:text-gray-600 sm:mb-3 sm:text-lg"
          >
            <i class="fab fa-windows mr-2 text-blue-600" />
            Windows Installation Methods
          </h5>
          <div class="mb-3 sm:mb-4">
            <p class="mb-2 text-sm text-gray-700 dark:text-gray-600 sm:mb-3 sm:text-base">
              Method 1: Download from Official Website (Recommended)
            </p>
            <ol
              class="ml-2 list-inside list-decimal space-y-1 text-xs text-gray-600 dark:text-gray-600 sm:ml-4 sm:space-y-2 sm:text-sm"
            >
              <li>
                Open your browser and visit
                <code
                  class="rounded bg-gray-100 px-1 py-1 text-xs dark:bg-gray-700 sm:px-2 sm:text-sm"
                  >https://nodejs.org/</code
                >
              </li>
              <li>Click "LTS" version to download (recommended long-term support version)</li>
              <li>
                After download completes, double-click the
                <code
                  class="rounded bg-gray-100 px-1 py-1 text-xs dark:bg-gray-700 sm:px-2 sm:text-sm"
                  >.msi</code
                >
                file
              </li>
              <li>
                Follow the installation wizard to complete installation, keep default settings
              </li>
            </ol>
          </div>
          <div class="mb-3 sm:mb-4">
            <p class="mb-2 text-sm text-gray-700 dark:text-gray-600 sm:mb-3 sm:text-base">
              Method 2: Using Package Managers
            </p>
            <p class="mb-2 text-xs text-gray-600 dark:text-gray-400 sm:text-sm">
              If you have Chocolatey or Scoop installed, you can use the command line to install:
            </p>
            <div
              class="overflow-x-auto rounded-lg bg-gray-900 p-3 font-mono text-xs text-green-400 sm:p-4 sm:text-sm"
            >
              <div class="mb-2"># Using Chocolatey</div>
              <div class="whitespace-nowrap text-gray-300">choco install nodejs</div>
              <div class="mb-2 mt-3"># Or using Scoop</div>
              <div class="whitespace-nowrap text-gray-300">scoop install nodejs</div>
            </div>
          </div>
          <div class="rounded-lg border border-blue-200 bg-blue-50 p-3 sm:p-4">
            <h6 class="mb-2 text-sm font-medium text-blue-800 sm:text-base">Windows Notes</h6>
            <ul class="space-y-1 text-xs text-blue-700 sm:text-sm sm:text-xs">
              <li>• Recommend using PowerShell instead of CMD</li>
              <li>• If you encounter permission issues, try running as administrator</li>
              <li>
                • Some antivirus software may flag as false positive, need to add to whitelist
              </li>
            </ul>
          </div>
        </div>

        <!-- Verify Installation -->
        <div class="rounded-lg border border-green-200 bg-green-50 p-3 sm:p-4">
          <h6 class="mb-2 text-sm font-medium text-green-800 sm:text-base">
            Verify Installation Success
          </h6>
          <p class="mb-2 text-xs text-green-700 sm:mb-3 sm:text-sm">
            After installation completes, open PowerShell or CMD and enter the following commands:
          </p>
          <div
            class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
          >
            <div class="whitespace-nowrap text-gray-300">node --version</div>
            <div class="whitespace-nowrap text-gray-300">npm --version</div>
          </div>
          <p class="mt-2 text-xs text-green-700 sm:text-sm">
            If version numbers are displayed, installation was successful!
          </p>
        </div>
      </div>

      <!-- Step 2: Install Claude Code -->
      <div class="mb-4 sm:mb-10 sm:mb-6">
        <h4
          class="mb-3 flex items-center text-lg font-semibold text-gray-800 dark:text-gray-300 sm:mb-4 sm:text-xl"
        >
          <span
            class="mr-2 flex h-6 w-6 items-center justify-center rounded-full bg-green-500 text-xs font-bold text-white sm:mr-3 sm:h-8 sm:w-8 sm:text-sm"
            >2</span
          >
          Install Claude Code
        </h4>

        <div
          class="mb-4 rounded-xl border border-green-100 bg-gradient-to-r from-green-50 to-emerald-50 p-4 sm:mb-6 sm:p-6"
        >
          <h5
            class="mb-2 flex items-center text-base font-semibold text-gray-800 dark:text-gray-600 sm:mb-3 sm:text-lg"
          >
            <i class="fas fa-download mr-2 text-green-600" />
            Install Claude Code
          </h5>
          <p class="mb-3 text-sm text-gray-700 dark:text-gray-300 sm:mb-4 sm:text-base">
            Open PowerShell or CMD and run the following command:
          </p>
          <div
            class="mb-4 overflow-x-auto rounded-lg bg-gray-900 p-3 font-mono text-xs text-green-400 sm:p-4 sm:text-sm"
          >
            <div class="mb-2"># Install Claude Code globally</div>
            <div class="whitespace-nowrap text-gray-300">
              npm install -g @anthropic-ai/claude-code
            </div>
          </div>
          <p class="text-sm text-gray-600 dark:text-gray-400">
            This command will download and install the latest version of Claude Code from the
            official npm repository.
          </p>

          <div class="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3 sm:p-4">
            <h6 class="mb-2 text-sm font-medium text-blue-800 sm:text-base">Tips</h6>
            <ul class="space-y-1 text-xs text-blue-700 sm:text-sm">
              <li>• Recommend using PowerShell instead of CMD for more powerful features</li>
              <li>• If you encounter permission issues, run PowerShell as administrator</li>
            </ul>
          </div>
        </div>

        <!-- Verify Installation -->
        <div class="rounded-lg border border-green-200 bg-green-50 p-3 sm:p-4">
          <h6 class="mb-2 font-medium text-green-800 dark:text-green-300">
            Verify Claude Code Installation
          </h6>
          <p class="mb-3 text-sm text-green-700">
            After installation completes, enter the following command to check if installation was
            successful:
          </p>
          <div
            class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
          >
            <div class="whitespace-nowrap text-gray-300">claude --version</div>
          </div>
          <p class="mt-2 text-sm text-green-700">
            If version number is displayed, congratulations! Claude Code has been successfully
            installed.
          </p>
        </div>
      </div>

      <!-- Step 3: Set Environment Variables -->
      <div class="mb-6 sm:mb-10">
        <h4
          class="mb-3 flex items-center text-lg font-semibold text-gray-800 dark:text-gray-300 sm:mb-4 sm:text-xl"
        >
          <span
            class="mr-2 flex h-6 w-6 items-center justify-center rounded-full bg-purple-500 text-xs font-bold text-white sm:mr-3 sm:h-8 sm:w-8 sm:text-sm"
            >3</span
          >
          Set Environment Variables
        </h4>

        <div
          class="mb-4 rounded-xl border border-purple-100 bg-gradient-to-r from-purple-50 to-pink-50 p-4 sm:mb-6 sm:p-6"
        >
          <h5
            class="mb-2 flex items-center text-base font-semibold text-gray-800 dark:text-gray-600 sm:mb-3 sm:text-lg"
          >
            <i class="fas fa-cog mr-2 text-purple-600" />
            Configure Claude Code Environment Variables
          </h5>
          <p class="mb-3 text-sm text-gray-700 dark:text-gray-300 sm:mb-4 sm:text-base">
            To connect Claude Code to your relay service, you need to set two environment variables:
          </p>

          <div class="space-y-4">
            <div
              class="rounded-lg border border-purple-200 bg-white p-3 dark:border-purple-700 dark:bg-gray-800 sm:p-4"
            >
              <h6 class="mb-2 text-sm font-medium text-gray-800 dark:text-gray-600 sm:text-base">
                Method 1: PowerShell Temporary Setup (Current Session)
              </h6>
              <p class="mb-3 text-sm text-gray-600">Run the following commands in PowerShell:</p>
              <div
                class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="whitespace-nowrap text-gray-300">
                  $env:ANTHROPIC_BASE_URL = "{{ currentBaseUrl }}"
                </div>
                <div class="whitespace-nowrap text-gray-300">
                  $env:ANTHROPIC_AUTH_TOKEN = "your-api-key"
                </div>
              </div>
              <p class="mt-2 text-xs text-yellow-700">
                💡 Remember to replace "your-api-key" with the actual key created in the "API Keys"
                tab above.
              </p>
            </div>

            <div
              class="rounded-lg border border-purple-200 bg-white p-3 dark:border-purple-700 dark:bg-gray-800 sm:p-4"
            >
              <h6 class="mb-2 text-sm font-medium text-gray-800 dark:text-gray-600 sm:text-base">
                Method 2: PowerShell Permanent Setup (User Level)
              </h6>
              <p class="mb-3 text-sm text-gray-600">
                Run the following commands in PowerShell to set user-level environment variables:
              </p>
              <div
                class="mb-3 overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="mb-2"># Set user-level environment variables (permanent)</div>
                <div class="whitespace-nowrap text-gray-300">
                  [System.Environment]::SetEnvironmentVariable("ANTHROPIC_BASE_URL", "{{
                    currentBaseUrl
                  }}", [System.EnvironmentVariableTarget]::User)
                </div>
                <div class="whitespace-nowrap text-gray-300">
                  [System.Environment]::SetEnvironmentVariable("ANTHROPIC_AUTH_TOKEN",
                  "your-api-key", [System.EnvironmentVariableTarget]::User)
                </div>
              </div>
              <p class="mb-3 text-sm text-gray-600">View configured environment variables:</p>
              <div
                class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="mb-2"># View user-level environment variables</div>
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
                💡 After setting, you need to reopen PowerShell window for changes to take effect.
              </p>
            </div>
          </div>
        </div>

        <!-- Verify Environment Variable Setup -->
        <div class="mt-6 rounded-lg border border-blue-200 bg-blue-50 p-3 sm:p-4">
          <h6 class="mb-2 font-medium text-blue-800 dark:text-blue-300">
            Verify Environment Variable Setup
          </h6>
          <p class="mb-3 text-sm text-blue-700">
            After setting environment variables, you can verify if they were set successfully with
            the following commands:
          </p>

          <div class="space-y-4">
            <div>
              <h6 class="mb-2 text-sm font-medium text-gray-800 dark:text-gray-600 sm:text-base">
                Verify in PowerShell:
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
                Verify in CMD:
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
              <strong>Expected Output Example:</strong>
            </p>
            <div class="rounded bg-gray-100 p-2 font-mono text-sm dark:bg-gray-700">
              <div>{{ currentBaseUrl }}</div>
              <div>cr_xxxxxxxxxxxxxxxxxx</div>
            </div>
            <p class="text-xs text-blue-700">
              💡 If output is empty or shows variable name itself, environment variable setup
              failed, please reconfigure.
            </p>
          </div>
        </div>

        <!-- Gemini CLI Environment Variable Setup -->
        <div class="mt-8">
          <h5
            class="mb-2 flex items-center text-base font-semibold text-gray-800 dark:text-gray-600 sm:mb-3 sm:text-lg"
          >
            <i class="fas fa-robot mr-2 text-green-600" />
            Configure Gemini CLI Environment Variables
          </h5>
          <p class="mb-3 text-sm text-gray-700 dark:text-gray-300 sm:mb-4 sm:text-base">
            If you use Gemini CLI, you need to set the following environment variables:
          </p>

          <div class="space-y-4">
            <div class="rounded-lg border border-green-200 bg-white p-3 sm:p-4">
              <h6 class="mb-2 text-sm font-medium text-gray-800 dark:text-gray-600 sm:text-base">
                PowerShell Setup Method
              </h6>
              <p class="mb-3 text-sm text-gray-600">Run the following commands in PowerShell:</p>
              <div
                class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="whitespace-nowrap text-gray-300">
                  $env:CODE_ASSIST_ENDPOINT = "{{ geminiBaseUrl }}"
                </div>
                <div class="whitespace-nowrap text-gray-300">
                  $env:GOOGLE_CLOUD_ACCESS_TOKEN = "your-api-key"
                </div>
                <div class="whitespace-nowrap text-gray-300">
                  $env:GOOGLE_GENAI_USE_GCA = "true"
                </div>
              </div>
              <p class="mt-2 text-xs text-yellow-700">
                💡 You can use the same API key as Claude Code.
              </p>
            </div>

            <div class="rounded-lg border border-green-200 bg-white p-3 sm:p-4">
              <h6 class="mb-2 text-sm font-medium text-gray-800 dark:text-gray-600 sm:text-base">
                PowerShell Permanent Setup (User Level)
              </h6>
              <p class="mb-3 text-sm text-gray-600">Run the following commands in PowerShell:</p>
              <div
                class="mb-3 overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="mb-2"># Set user-level environment variables (permanent)</div>
                <div class="whitespace-nowrap text-gray-300">
                  [System.Environment]::SetEnvironmentVariable("CODE_ASSIST_ENDPOINT", "{{
                    geminiBaseUrl
                  }}", [System.EnvironmentVariableTarget]::User)
                </div>
                <div class="whitespace-nowrap text-gray-300">
                  [System.Environment]::SetEnvironmentVariable("GOOGLE_CLOUD_ACCESS_TOKEN",
                  "your-api-key", [System.EnvironmentVariableTarget]::User)
                </div>
                <div class="whitespace-nowrap text-gray-300">
                  [System.Environment]::SetEnvironmentVariable("GOOGLE_GENAI_USE_GCA", "true",
                  [System.EnvironmentVariableTarget]::User)
                </div>
              </div>
              <p class="mt-2 text-xs text-blue-700">
                💡 After setting, you need to reopen PowerShell window for changes to take effect.
              </p>
            </div>

            <div class="rounded-lg border border-green-200 bg-green-50 p-3 sm:p-4">
              <h6 class="mb-2 font-medium text-green-800 dark:text-green-300">
                Verify Gemini CLI Environment Variables
              </h6>
              <p class="mb-3 text-sm text-green-700">Verify in PowerShell:</p>
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

        <!-- Codex Environment Variables Setup -->
        <div class="mt-8">
          <h5
            class="mb-2 flex items-center text-base font-semibold text-gray-800 dark:text-gray-600 sm:mb-3 sm:text-lg"
          >
            <i class="fas fa-code mr-2 text-indigo-600" />
            Configure Codex Environment Variables
          </h5>
          <p class="mb-3 text-sm text-gray-700 dark:text-gray-300 sm:mb-4 sm:text-base">
            If you use tools that support OpenAI API (such as Codex), you need to set the following
            environment variables:
          </p>

          <div class="space-y-4">
            <div class="rounded-lg border border-yellow-200 bg-yellow-50 p-3 sm:p-4">
              <h6 class="mb-2 font-medium text-yellow-800">Codex Configuration File</h6>
              <p class="mb-3 text-sm text-yellow-700">
                In your
                <code class="rounded bg-yellow-100 px-1">~/.codex/config.toml</code>
                file, add the following configuration:
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
                In your
                <code class="rounded bg-yellow-100 px-1">~/.codex/auth.json</code>
                file, configure the API key:
              </p>
              <div
                class="mt-2 overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="whitespace-nowrap text-gray-300">{</div>
                <div class="whitespace-nowrap text-gray-300">"OPENAI_API_KEY": "your-api-key"</div>
                <div class="whitespace-nowrap text-gray-300">}</div>
              </div>
              <p class="mt-2 text-xs text-yellow-700">
                💡 You can use the same API key as Claude Code, in the format cr_xxxxxxxxxx.
              </p>
            </div>
          </div>
        </div>
      </div>

      <!-- Step 4: Start Using -->
      <div class="mb-6 sm:mb-8">
        <h4
          class="mb-3 flex items-center text-lg font-semibold text-gray-800 dark:text-gray-300 sm:mb-4 sm:text-xl"
        >
          <span
            class="mr-2 flex h-6 w-6 items-center justify-center rounded-full bg-orange-500 text-xs font-bold text-white sm:mr-3 sm:h-8 sm:w-8 sm:text-sm"
            >4</span
          >
          Start Using Claude Code
        </h4>
        <div
          class="rounded-xl border border-orange-100 bg-gradient-to-r from-orange-50 to-yellow-50 p-4 sm:p-6"
        >
          <p class="mb-3 text-sm text-gray-700 dark:text-gray-300 sm:mb-4 sm:text-base">
            Now you can start using Claude Code!
          </p>

          <div class="space-y-4">
            <div>
              <h6 class="mb-2 text-sm font-medium text-gray-800 dark:text-gray-600 sm:text-base">
                Launch Claude Code
              </h6>
              <div
                class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="whitespace-nowrap text-gray-300">claude</div>
              </div>
            </div>

            <div>
              <h6 class="mb-2 text-sm font-medium text-gray-800 dark:text-gray-600 sm:text-base">
                Using in Specific Projects
              </h6>
              <div
                class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="mb-2"># Navigate to your project directory</div>
                <div class="whitespace-nowrap text-gray-300">cd C:\path\to\your\project</div>
                <div class="mb-2 mt-2"># Launch Claude Code</div>
                <div class="whitespace-nowrap text-gray-300">claude</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Windows Troubleshooting -->
      <div class="mb-8">
        <h4
          class="mb-3 flex items-center text-lg font-semibold text-gray-800 dark:text-gray-300 sm:mb-4 sm:text-xl"
        >
          <i class="fas fa-wrench mr-2 text-red-600 sm:mr-3" />
          Windows Common Issues Resolution
        </h4>
        <div class="space-y-4">
          <details class="rounded-lg border border-gray-200 bg-gray-50">
            <summary
              class="cursor-pointer p-3 text-sm font-medium text-gray-800 hover:bg-gray-100 sm:p-4 sm:text-base"
            >
              "permission denied" error during installation
            </summary>
            <div class="px-3 pb-3 text-gray-600 sm:px-4 sm:pb-4">
              <p class="mb-2">This is usually a permission issue. Try the following solutions:</p>
              <ul class="list-inside list-disc space-y-1 text-sm">
                <li>Run PowerShell as Administrator</li>
                <li>
                  Or configure npm to use user directory:
                  <code class="rounded bg-gray-200 px-1 text-xs sm:text-sm"
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
              PowerShell Execution Policy Error
            </summary>
            <div class="px-3 pb-3 text-gray-600 sm:px-4 sm:pb-4">
              <p class="mb-2">If you encounter execution policy restrictions, run:</p>
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
              Environment variables not taking effect
            </summary>
            <div class="px-3 pb-3 text-gray-600 sm:px-4 sm:pb-4">
              <p class="mb-2">After setting permanent environment variables, you need to:</p>
              <ul class="list-inside list-disc space-y-1 text-sm">
                <li>Restart PowerShell or CMD</li>
                <li>Or log out and log back into Windows</li>
                <li>
                  Verify settings:
                  <code class="rounded bg-gray-200 px-1 text-xs sm:text-sm"
                    >echo $env:ANTHROPIC_BASE_URL</code
                  >
                </li>
              </ul>
            </div>
          </details>
        </div>
      </div>
    </div>

    <!-- macOS Tutorial -->
    <div v-else-if="activeTutorialSystem === 'macos'" class="tutorial-content">
      <!-- Step 1: Install Node.js -->
      <div class="mb-6 sm:mb-10">
        <h4
          class="mb-3 flex items-center text-lg font-semibold text-gray-800 dark:text-gray-300 sm:mb-4 sm:text-xl"
        >
          <span
            class="mr-2 flex h-6 w-6 items-center justify-center rounded-full bg-blue-500 text-xs font-bold text-white sm:mr-3 sm:h-8 sm:w-8 sm:text-sm"
            >1</span
          >
          Install Node.js Environment
        </h4>
        <p class="mb-4 text-gray-600 sm:mb-6">Claude Code requires Node.js environment to run.</p>

        <div
          class="mb-4 rounded-xl border border-gray-200 bg-gradient-to-r from-gray-50 to-slate-50 p-4 sm:mb-6 sm:p-6"
        >
          <h5
            class="mb-2 flex items-center text-base font-semibold text-gray-800 dark:text-gray-600 sm:mb-3 sm:text-lg"
          >
            <i class="fab fa-apple mr-2 text-gray-700" />
            macOS Installation Methods
          </h5>
          <div class="mb-4">
            <p class="mb-3 text-gray-700">Method 1: Using Homebrew (Recommended)</p>
            <p class="mb-2 text-xs text-gray-600 dark:text-gray-400 sm:text-sm">
              If you already have Homebrew installed, using it to install Node.js will be more
              convenient:
            </p>
            <div
              class="overflow-x-auto rounded-lg bg-gray-900 p-3 font-mono text-xs text-green-400 sm:p-4 sm:text-sm"
            >
              <div class="mb-2"># Update Homebrew</div>
              <div class="whitespace-nowrap text-gray-300">brew update</div>
              <div class="mb-2 mt-3"># Install Node.js</div>
              <div class="whitespace-nowrap text-gray-300">brew install node</div>
            </div>
          </div>
          <div class="mb-4">
            <p class="mb-3 text-gray-700">Method 2: Download from Official Website</p>
            <ol
              class="ml-2 list-inside list-decimal space-y-1 text-xs text-gray-600 dark:text-gray-400 sm:ml-4 sm:space-y-2 sm:text-sm"
            >
              <li>
                Visit
                <code
                  class="rounded bg-gray-100 px-1 py-1 text-xs dark:bg-gray-700 sm:px-2 sm:text-sm"
                  >https://nodejs.org/</code
                >
              </li>
              <li>Download the LTS version suitable for macOS</li>
              <li>
                Open the downloaded
                <code
                  class="rounded bg-gray-100 px-1 py-1 text-xs dark:bg-gray-700 sm:px-2 sm:text-sm"
                  >.pkg</code
                >
                file
              </li>
              <li>Follow the installer instructions to complete installation</li>
            </ol>
          </div>
          <div class="rounded-lg border border-gray-200 bg-gray-50 p-3 sm:p-4">
            <h6 class="mb-2 text-sm font-medium text-gray-800 sm:text-base">macOS Notes</h6>
            <ul class="space-y-1 text-xs text-gray-700 sm:text-sm">
              <li>
                • If you encounter permission issues, you may need to use
                <code class="rounded bg-gray-200 px-1 text-xs sm:text-sm">sudo</code>
              </li>
              <li>• First run may require permission in System Preferences</li>
              <li>• Recommend using Terminal or iTerm2</li>
            </ul>
          </div>
        </div>

        <!-- Verify Installation -->
        <div class="rounded-lg border border-green-200 bg-green-50 p-3 sm:p-4">
          <h6 class="mb-2 font-medium text-green-800 dark:text-green-300">
            Verify Installation Success
          </h6>
          <p class="mb-3 text-sm text-green-700">
            After installation, open Terminal and enter the following commands:
          </p>
          <div
            class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
          >
            <div class="whitespace-nowrap text-gray-300">node --version</div>
            <div class="whitespace-nowrap text-gray-300">npm --version</div>
          </div>
          <p class="mt-2 text-sm text-green-700">
            If version numbers are displayed, the installation was successful!
          </p>
        </div>
      </div>

      <!-- Step 2: Install Claude Code -->
      <div class="mb-6 sm:mb-10">
        <h4
          class="mb-3 flex items-center text-lg font-semibold text-gray-800 dark:text-gray-300 sm:mb-4 sm:text-xl"
        >
          <span
            class="mr-2 flex h-6 w-6 items-center justify-center rounded-full bg-green-500 text-xs font-bold text-white sm:mr-3 sm:h-8 sm:w-8 sm:text-sm"
            >2</span
          >
          Install Claude Code
        </h4>

        <div
          class="mb-4 rounded-xl border border-purple-100 bg-gradient-to-r from-purple-50 to-pink-50 p-4 sm:mb-6 sm:p-6"
        >
          <h5
            class="mb-2 flex items-center text-base font-semibold text-gray-800 dark:text-gray-600 sm:mb-3 sm:text-lg"
          >
            <i class="fas fa-download mr-2 text-purple-600" />
            Install Claude Code
          </h5>
          <p class="mb-3 text-sm text-gray-700 dark:text-gray-300 sm:mb-4 sm:text-base">
            Open Terminal and run the following command:
          </p>
          <div
            class="mb-4 overflow-x-auto rounded-lg bg-gray-900 p-3 font-mono text-xs text-green-400 sm:p-4 sm:text-sm"
          >
            <div class="mb-2"># Install Claude Code globally</div>
            <div class="whitespace-nowrap text-gray-300">
              npm install -g @anthropic-ai/claude-code
            </div>
          </div>
          <p class="mb-2 text-sm text-gray-600">
            If you encounter permission issues, you can use sudo:
          </p>
          <div
            class="overflow-x-auto rounded-lg bg-gray-900 p-3 font-mono text-xs text-green-400 sm:p-4 sm:text-sm"
          >
            <div class="whitespace-nowrap text-gray-300">
              sudo npm install -g @anthropic-ai/claude-code
            </div>
          </div>
        </div>

        <!-- Verify Installation -->
        <div class="rounded-lg border border-green-200 bg-green-50 p-3 sm:p-4">
          <h6 class="mb-2 font-medium text-green-800 dark:text-green-300">
            Verify Claude Code Installation
          </h6>
          <p class="mb-3 text-sm text-green-700">
            After installation completes, enter the following command to check if installation was
            successful:
          </p>
          <div
            class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
          >
            <div class="whitespace-nowrap text-gray-300">claude --version</div>
          </div>
          <p class="mt-2 text-sm text-green-700">
            If version number is displayed, congratulations! Claude Code has been successfully
            installed.
          </p>
        </div>
      </div>

      <!-- Step 3: Set Environment Variables -->
      <div class="mb-6 sm:mb-10">
        <h4
          class="mb-3 flex items-center text-lg font-semibold text-gray-800 dark:text-gray-300 sm:mb-4 sm:text-xl"
        >
          <span
            class="mr-2 flex h-6 w-6 items-center justify-center rounded-full bg-orange-500 text-xs font-bold text-white sm:mr-3 sm:h-8 sm:w-8 sm:text-sm"
            >3</span
          >
          Set Environment Variables
        </h4>

        <div
          class="mb-4 rounded-xl border border-orange-100 bg-gradient-to-r from-orange-50 to-yellow-50 p-4 sm:mb-6 sm:p-6"
        >
          <h5
            class="mb-2 flex items-center text-base font-semibold text-gray-800 dark:text-gray-600 sm:mb-3 sm:text-lg"
          >
            <i class="fas fa-cog mr-2 text-orange-600" />
            Configure Claude Code Environment Variables
          </h5>
          <p class="mb-3 text-sm text-gray-700 dark:text-gray-300 sm:mb-4 sm:text-base">
            To connect Claude Code to your relay service, you need to set two environment variables:
          </p>

          <div class="space-y-4">
            <div class="rounded-lg border border-orange-200 bg-white p-3 sm:p-4">
              <h6 class="mb-2 text-sm font-medium text-gray-800 dark:text-gray-600 sm:text-base">
                Method 1: Temporary Setup (Current Session)
              </h6>
              <p class="mb-3 text-sm text-gray-600">Run the following commands in Terminal:</p>
              <div
                class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="whitespace-nowrap text-gray-300">
                  export ANTHROPIC_BASE_URL="{{ currentBaseUrl }}"
                </div>
                <div class="whitespace-nowrap text-gray-300">
                  export ANTHROPIC_AUTH_TOKEN="your-api-key"
                </div>
              </div>
              <p class="mt-2 text-xs text-yellow-700">
                💡 Remember to replace "your-api-key" with the actual key created in the "API Keys"
                tab above.
              </p>
            </div>

            <div class="rounded-lg border border-orange-200 bg-white p-3 sm:p-4">
              <h6 class="mb-2 text-sm font-medium text-gray-800 dark:text-gray-600 sm:text-base">
                Method 2: Permanent Setup
              </h6>
              <p class="mb-3 text-sm text-gray-600">
                Edit your shell configuration file (depending on your shell):
              </p>
              <div
                class="mb-3 overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="mb-2"># For zsh (default)</div>
                <div class="whitespace-nowrap text-gray-300">
                  echo 'export ANTHROPIC_BASE_URL="{{ currentBaseUrl }}"' >> ~/.zshrc
                </div>
                <div class="whitespace-nowrap text-gray-300">
                  echo 'export ANTHROPIC_AUTH_TOKEN="your-api-key"' >> ~/.zshrc
                </div>
                <div class="whitespace-nowrap text-gray-300">source ~/.zshrc</div>
              </div>
              <div
                class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="mb-2"># For bash</div>
                <div class="whitespace-nowrap text-gray-300">
                  echo 'export ANTHROPIC_BASE_URL="{{ currentBaseUrl }}"' >> ~/.bash_profile
                </div>
                <div class="whitespace-nowrap text-gray-300">
                  echo 'export ANTHROPIC_AUTH_TOKEN="your-api-key"' >> ~/.bash_profile
                </div>
                <div class="whitespace-nowrap text-gray-300">source ~/.bash_profile</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Gemini CLI Environment Variable Setup -->
        <div class="mt-8">
          <h5
            class="mb-2 flex items-center text-base font-semibold text-gray-800 dark:text-gray-600 sm:mb-3 sm:text-lg"
          >
            <i class="fas fa-robot mr-2 text-green-600" />
            Configure Gemini CLI Environment Variables
          </h5>
          <p class="mb-3 text-sm text-gray-700 dark:text-gray-300 sm:mb-4 sm:text-base">
            If you use Gemini CLI, you need to set the following environment variables:
          </p>

          <div class="space-y-4">
            <div class="rounded-lg border border-green-200 bg-white p-3 sm:p-4">
              <h6 class="mb-2 text-sm font-medium text-gray-800 dark:text-gray-600 sm:text-base">
                Terminal Setup Method
              </h6>
              <p class="mb-3 text-sm text-gray-600">Run the following commands in Terminal:</p>
              <div
                class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="whitespace-nowrap text-gray-300">
                  export CODE_ASSIST_ENDPOINT="{{ geminiBaseUrl }}"
                </div>
                <div class="whitespace-nowrap text-gray-300">
                  export GOOGLE_CLOUD_ACCESS_TOKEN="your-api-key"
                </div>
                <div class="whitespace-nowrap text-gray-300">
                  export GOOGLE_GENAI_USE_GCA="true"
                </div>
              </div>
              <p class="mt-2 text-xs text-yellow-700">
                💡 You can use the same API key as Claude Code.
              </p>
            </div>

            <div class="rounded-lg border border-green-200 bg-white p-3 sm:p-4">
              <h6 class="mb-2 text-sm font-medium text-gray-800 dark:text-gray-600 sm:text-base">
                Permanent Setup Method
              </h6>
              <p class="mb-3 text-sm text-gray-600">Add to your shell configuration file:</p>
              <div
                class="mb-3 overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="mb-2"># For zsh (default)</div>
                <div class="whitespace-nowrap text-gray-300">
                  echo 'export CODE_ASSIST_ENDPOINT="{{ geminiBaseUrl }}"' >> ~/.zshrc
                </div>
                <div class="whitespace-nowrap text-gray-300">
                  echo 'export GOOGLE_CLOUD_ACCESS_TOKEN="your-api-key"' >> ~/.zshrc
                </div>
                <div class="whitespace-nowrap text-gray-300">
                  echo 'export GOOGLE_GENAI_USE_GCA="true"' >> ~/.zshrc
                </div>
                <div class="whitespace-nowrap text-gray-300">source ~/.zshrc</div>
              </div>
              <div
                class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="mb-2"># For bash</div>
                <div class="whitespace-nowrap text-gray-300">
                  echo 'export CODE_ASSIST_ENDPOINT="{{ geminiBaseUrl }}"' >> ~/.bash_profile
                </div>
                <div class="whitespace-nowrap text-gray-300">
                  echo 'export GOOGLE_CLOUD_ACCESS_TOKEN="your-api-key"' >> ~/.bash_profile
                </div>
                <div class="whitespace-nowrap text-gray-300">
                  echo 'export GOOGLE_GENAI_USE_GCA="true"' >> ~/.bash_profile
                </div>
                <div class="whitespace-nowrap text-gray-300">source ~/.bash_profile</div>
              </div>
            </div>

            <div class="rounded-lg border border-green-200 bg-green-50 p-3 sm:p-4">
              <h6 class="mb-2 font-medium text-green-800 dark:text-green-300">
                Verify Gemini CLI Environment Variables
              </h6>
              <p class="mb-3 text-sm text-green-700">Verify in Terminal:</p>
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

        <!-- Codex Environment Variables Setup -->
        <div class="mt-8">
          <h5
            class="mb-2 flex items-center text-base font-semibold text-gray-800 dark:text-gray-600 sm:mb-3 sm:text-lg"
          >
            <i class="fas fa-code mr-2 text-indigo-600" />
            Configure Codex Environment Variables
          </h5>
          <p class="mb-3 text-sm text-gray-700 dark:text-gray-300 sm:mb-4 sm:text-base">
            If you use tools that support OpenAI API (such as Codex), you need to set the following
            environment variables:
          </p>

          <div class="space-y-4">
            <div class="rounded-lg border border-yellow-200 bg-yellow-50 p-3 sm:p-4">
              <h6 class="mb-2 font-medium text-yellow-800">Codex Configuration File</h6>
              <p class="mb-3 text-sm text-yellow-700">
                In your
                <code class="rounded bg-yellow-100 px-1">~/.codex/config.toml</code>
                file, add the following configuration:
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
                In your
                <code class="rounded bg-yellow-100 px-1">~/.codex/auth.json</code>
                file, configure the API key:
              </p>
              <div
                class="mt-2 overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="whitespace-nowrap text-gray-300">{</div>
                <div class="whitespace-nowrap text-gray-300">"OPENAI_API_KEY": "your-api-key"</div>
                <div class="whitespace-nowrap text-gray-300">}</div>
              </div>
              <p class="mt-2 text-xs text-yellow-700">
                💡 You can use the same API key as Claude Code, in the format cr_xxxxxxxxxx.
              </p>
            </div>
          </div>
        </div>
      </div>

      <!-- Step 4: Start Using -->
      <div class="mb-8">
        <h4
          class="mb-3 flex items-center text-lg font-semibold text-gray-800 dark:text-gray-300 sm:mb-4 sm:text-xl"
        >
          <span
            class="mr-2 flex h-6 w-6 items-center justify-center rounded-full bg-yellow-500 text-xs font-bold text-white sm:mr-3 sm:h-8 sm:w-8 sm:text-sm"
            >4</span
          >
          Start Using Claude Code
        </h4>
        <div
          class="rounded-xl border border-yellow-100 bg-gradient-to-r from-yellow-50 to-amber-50 p-4 sm:p-6"
        >
          <p class="mb-3 text-sm text-gray-700 dark:text-gray-300 sm:mb-4 sm:text-base">
            Now you can start using Claude Code!
          </p>

          <div class="space-y-4">
            <div>
              <h6 class="mb-2 text-sm font-medium text-gray-800 dark:text-gray-600 sm:text-base">
                Launch Claude Code
              </h6>
              <div
                class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="whitespace-nowrap text-gray-300">claude</div>
              </div>
            </div>

            <div>
              <h6 class="mb-2 text-sm font-medium text-gray-800 dark:text-gray-600 sm:text-base">
                Using in Specific Projects
              </h6>
              <div
                class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="mb-2"># Navigate to your project directory</div>
                <div class="whitespace-nowrap text-gray-300">cd /path/to/your/project</div>
                <div class="mb-2 mt-2"># Launch Claude Code</div>
                <div class="whitespace-nowrap text-gray-300">claude</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- macOS Troubleshooting -->
      <div class="mb-8">
        <h4
          class="mb-3 flex items-center text-lg font-semibold text-gray-800 dark:text-gray-300 sm:mb-4 sm:text-xl"
        >
          <i class="fas fa-wrench mr-2 text-red-600 sm:mr-3" />
          macOS Common Issues Resolution
        </h4>
        <div class="space-y-4">
          <details class="rounded-lg border border-gray-200 bg-gray-50">
            <summary
              class="cursor-pointer p-3 text-sm font-medium text-gray-800 hover:bg-gray-100 sm:p-4 sm:text-base"
            >
              Permission error during installation
            </summary>
            <div class="px-3 pb-3 text-gray-600 sm:px-4 sm:pb-4">
              <p class="mb-2">Try the following solutions:</p>
              <ul class="list-inside list-disc space-y-1 text-sm">
                <li>
                  Install with sudo:
                  <code class="rounded bg-gray-200 px-1 text-xs sm:text-sm"
                    >sudo npm install -g @anthropic-ai/claude-code</code
                  >
                </li>
                <li>
                  Or configure npm to use user directory:
                  <code class="rounded bg-gray-200 px-1 text-xs sm:text-sm"
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
              macOS security settings blocking execution
            </summary>
            <div class="px-3 pb-3 text-gray-600 sm:px-4 sm:pb-4">
              <p class="mb-2">If the system blocks Claude Code from running:</p>
              <ul class="list-inside list-disc space-y-1 text-sm">
                <li>Open "System Preferences" → "Security & Privacy"</li>
                <li>Click "Allow Anyway" or "Open Anyway"</li>
                <li>
                  Or run in Terminal:
                  <code class="rounded bg-gray-200 px-1 text-xs sm:text-sm"
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
              Environment variables not taking effect
            </summary>
            <div class="px-3 pb-3 text-gray-600 sm:px-4 sm:pb-4">
              <p class="mb-2">Check the following points:</p>
              <ul class="list-inside list-disc space-y-1 text-sm">
                <li>
                  Confirm you modified the correct configuration file (.zshrc or .bash_profile)
                </li>
                <li>Restart Terminal</li>
                <li>
                  Verify settings:
                  <code class="rounded bg-gray-200 px-1 text-xs sm:text-sm"
                    >echo $ANTHROPIC_BASE_URL</code
                  >
                </li>
              </ul>
            </div>
          </details>
        </div>
      </div>
    </div>

    <!-- Linux Tutorial -->
    <div v-else-if="activeTutorialSystem === 'linux'" class="tutorial-content">
      <!-- Step 1: Install Node.js -->
      <div class="mb-6 sm:mb-10">
        <h4
          class="mb-3 flex items-center text-lg font-semibold text-gray-800 dark:text-gray-300 sm:mb-4 sm:text-xl"
        >
          <span
            class="mr-2 flex h-6 w-6 items-center justify-center rounded-full bg-blue-500 text-xs font-bold text-white sm:mr-3 sm:h-8 sm:w-8 sm:text-sm"
            >1</span
          >
          Install Node.js Environment
        </h4>
        <p class="mb-4 text-gray-600 sm:mb-6">Claude Code requires Node.js environment to run.</p>

        <div
          class="mb-4 rounded-xl border border-orange-100 bg-gradient-to-r from-orange-50 to-red-50 p-4 sm:mb-6 sm:p-6"
        >
          <h5
            class="mb-2 flex items-center text-base font-semibold text-gray-800 dark:text-gray-600 sm:mb-3 sm:text-lg"
          >
            <i class="fab fa-ubuntu mr-2 text-orange-600" />
            Linux Installation Methods
          </h5>
          <div class="mb-4">
            <p class="mb-3 text-gray-700">Method 1: Using Official Repository (Recommended)</p>
            <div
              class="overflow-x-auto rounded-lg bg-gray-900 p-3 font-mono text-xs text-green-400 sm:p-4 sm:text-sm"
            >
              <div class="mb-2"># Add NodeSource repository</div>
              <div class="whitespace-nowrap text-gray-300">
                curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
              </div>
              <div class="mb-2 mt-3"># Install Node.js</div>
              <div class="whitespace-nowrap text-gray-300">sudo apt-get install -y nodejs</div>
            </div>
          </div>
          <div class="mb-4">
            <p class="mb-3 text-gray-700">Method 2: Using System Package Manager</p>
            <p class="mb-2 text-xs text-gray-600 dark:text-gray-400 sm:text-sm">
              Although the version may not be the latest, it's sufficient for basic use:
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
            <h6 class="mb-2 text-sm font-medium text-orange-800 sm:text-base">Linux Notes</h6>
            <ul class="space-y-1 text-xs text-orange-700 sm:text-sm">
              <li>• Some distributions may require additional dependencies</li>
              <li>
                • If you encounter permission issues, use
                <code class="rounded bg-orange-200 px-1">sudo</code>
              </li>
              <li>• Ensure your user has write permissions to npm's global directory</li>
            </ul>
          </div>
        </div>

        <!-- Verify Installation -->
        <div class="rounded-lg border border-green-200 bg-green-50 p-3 sm:p-4">
          <h6 class="mb-2 font-medium text-green-800 dark:text-green-300">
            Verify Installation Success
          </h6>
          <p class="mb-3 text-sm text-green-700">
            After installation, open terminal and enter the following commands:
          </p>
          <div
            class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
          >
            <div class="whitespace-nowrap text-gray-300">node --version</div>
            <div class="whitespace-nowrap text-gray-300">npm --version</div>
          </div>
          <p class="mt-2 text-sm text-green-700">
            If version numbers are displayed, the installation was successful!
          </p>
        </div>
      </div>

      <!-- Step 2: Install Claude Code -->
      <div class="mb-6 sm:mb-10">
        <h4
          class="mb-3 flex items-center text-lg font-semibold text-gray-800 dark:text-gray-300 sm:mb-4 sm:text-xl"
        >
          <span
            class="mr-2 flex h-6 w-6 items-center justify-center rounded-full bg-green-500 text-xs font-bold text-white sm:mr-3 sm:h-8 sm:w-8 sm:text-sm"
            >2</span
          >
          Install Claude Code
        </h4>

        <div
          class="mb-4 rounded-xl border border-purple-100 bg-gradient-to-r from-purple-50 to-pink-50 p-4 sm:mb-6 sm:p-6"
        >
          <h5
            class="mb-2 flex items-center text-base font-semibold text-gray-800 dark:text-gray-600 sm:mb-3 sm:text-lg"
          >
            <i class="fas fa-download mr-2 text-purple-600" />
            Install Claude Code
          </h5>
          <p class="mb-3 text-sm text-gray-700 dark:text-gray-300 sm:mb-4 sm:text-base">
            Open terminal and run the following command:
          </p>
          <div
            class="mb-4 overflow-x-auto rounded-lg bg-gray-900 p-3 font-mono text-xs text-green-400 sm:p-4 sm:text-sm"
          >
            <div class="mb-2"># Install Claude Code globally</div>
            <div class="whitespace-nowrap text-gray-300">
              npm install -g @anthropic-ai/claude-code
            </div>
          </div>
          <p class="mb-2 text-sm text-gray-600">
            If you encounter permission issues, you can use sudo:
          </p>
          <div
            class="overflow-x-auto rounded-lg bg-gray-900 p-3 font-mono text-xs text-green-400 sm:p-4 sm:text-sm"
          >
            <div class="whitespace-nowrap text-gray-300">
              sudo npm install -g @anthropic-ai/claude-code
            </div>
          </div>
        </div>

        <!-- Verify Installation -->
        <div class="rounded-lg border border-green-200 bg-green-50 p-3 sm:p-4">
          <h6 class="mb-2 font-medium text-green-800 dark:text-green-300">
            Verify Claude Code Installation
          </h6>
          <p class="mb-3 text-sm text-green-700">
            After installation completes, enter the following command to check if installation was
            successful:
          </p>
          <div
            class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
          >
            <div class="whitespace-nowrap text-gray-300">claude --version</div>
          </div>
          <p class="mt-2 text-sm text-green-700">
            If version number is displayed, congratulations! Claude Code has been successfully
            installed.
          </p>
        </div>
      </div>

      <!-- Step 3: Set Environment Variables -->
      <div class="mb-6 sm:mb-10">
        <h4
          class="mb-3 flex items-center text-lg font-semibold text-gray-800 dark:text-gray-300 sm:mb-4 sm:text-xl"
        >
          <span
            class="mr-2 flex h-6 w-6 items-center justify-center rounded-full bg-orange-500 text-xs font-bold text-white sm:mr-3 sm:h-8 sm:w-8 sm:text-sm"
            >3</span
          >
          Set Environment Variables
        </h4>

        <div
          class="mb-4 rounded-xl border border-orange-100 bg-gradient-to-r from-orange-50 to-yellow-50 p-4 sm:mb-6 sm:p-6"
        >
          <h5
            class="mb-2 flex items-center text-base font-semibold text-gray-800 dark:text-gray-600 sm:mb-3 sm:text-lg"
          >
            <i class="fas fa-cog mr-2 text-orange-600" />
            Configure Claude Code Environment Variables
          </h5>
          <p class="mb-3 text-sm text-gray-700 dark:text-gray-300 sm:mb-4 sm:text-base">
            To connect Claude Code to your relay service, you need to set two environment variables:
          </p>

          <div class="space-y-4">
            <div class="rounded-lg border border-orange-200 bg-white p-3 sm:p-4">
              <h6 class="mb-2 text-sm font-medium text-gray-800 dark:text-gray-600 sm:text-base">
                Method 1: Temporary Setup (Current Session)
              </h6>
              <p class="mb-3 text-sm text-gray-600">Run the following commands in terminal:</p>
              <div
                class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="whitespace-nowrap text-gray-300">
                  export ANTHROPIC_BASE_URL="{{ currentBaseUrl }}"
                </div>
                <div class="whitespace-nowrap text-gray-300">
                  export ANTHROPIC_AUTH_TOKEN="your-api-key"
                </div>
              </div>
              <p class="mt-2 text-xs text-yellow-700">
                💡 Remember to replace "your-api-key" with the actual key created in the "API Keys"
                tab above.
              </p>
            </div>

            <div class="rounded-lg border border-orange-200 bg-white p-3 sm:p-4">
              <h6 class="mb-2 text-sm font-medium text-gray-800 dark:text-gray-600 sm:text-base">
                Method 2: Permanent Setup
              </h6>
              <p class="mb-3 text-sm text-gray-600">Edit your shell configuration file:</p>
              <div
                class="mb-3 overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="mb-2"># For bash (default)</div>
                <div class="whitespace-nowrap text-gray-300">
                  echo 'export ANTHROPIC_BASE_URL="{{ currentBaseUrl }}"' >> ~/.bashrc
                </div>
                <div class="whitespace-nowrap text-gray-300">
                  echo 'export ANTHROPIC_AUTH_TOKEN="your-api-key"' >> ~/.bashrc
                </div>
                <div class="whitespace-nowrap text-gray-300">source ~/.bashrc</div>
              </div>
              <div
                class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="mb-2"># For zsh</div>
                <div class="whitespace-nowrap text-gray-300">
                  echo 'export ANTHROPIC_BASE_URL="{{ currentBaseUrl }}"' >> ~/.zshrc
                </div>
                <div class="whitespace-nowrap text-gray-300">
                  echo 'export ANTHROPIC_AUTH_TOKEN="your-api-key"' >> ~/.zshrc
                </div>
                <div class="whitespace-nowrap text-gray-300">source ~/.zshrc</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Gemini CLI Environment Variable Setup -->
        <div class="mt-8">
          <h5
            class="mb-2 flex items-center text-base font-semibold text-gray-800 dark:text-gray-600 sm:mb-3 sm:text-lg"
          >
            <i class="fas fa-robot mr-2 text-green-600" />
            Configure Gemini CLI Environment Variables
          </h5>
          <p class="mb-3 text-sm text-gray-700 dark:text-gray-300 sm:mb-4 sm:text-base">
            If you use Gemini CLI, you need to set the following environment variables:
          </p>

          <div class="space-y-4">
            <div class="rounded-lg border border-green-200 bg-white p-3 sm:p-4">
              <h6 class="mb-2 text-sm font-medium text-gray-800 dark:text-gray-600 sm:text-base">
                Terminal Setup Method
              </h6>
              <p class="mb-3 text-sm text-gray-600">Run the following commands in terminal:</p>
              <div
                class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="whitespace-nowrap text-gray-300">
                  export CODE_ASSIST_ENDPOINT="{{ geminiBaseUrl }}"
                </div>
                <div class="whitespace-nowrap text-gray-300">
                  export GOOGLE_CLOUD_ACCESS_TOKEN="your-api-key"
                </div>
                <div class="whitespace-nowrap text-gray-300">
                  export GOOGLE_GENAI_USE_GCA="true"
                </div>
              </div>
              <p class="mt-2 text-xs text-yellow-700">
                💡 You can use the same API key as Claude Code.
              </p>
            </div>

            <div class="rounded-lg border border-green-200 bg-white p-3 sm:p-4">
              <h6 class="mb-2 text-sm font-medium text-gray-800 dark:text-gray-600 sm:text-base">
                Permanent Setup Method
              </h6>
              <p class="mb-3 text-sm text-gray-600">Add to your shell configuration file:</p>
              <div
                class="mb-3 overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="mb-2"># For bash (default)</div>
                <div class="whitespace-nowrap text-gray-300">
                  echo 'export CODE_ASSIST_ENDPOINT="{{ geminiBaseUrl }}"' >> ~/.bashrc
                </div>
                <div class="whitespace-nowrap text-gray-300">
                  echo 'export GOOGLE_CLOUD_ACCESS_TOKEN="your-api-key"' >> ~/.bashrc
                </div>
                <div class="whitespace-nowrap text-gray-300">
                  echo 'export GOOGLE_GENAI_USE_GCA="true"' >> ~/.bashrc
                </div>
                <div class="whitespace-nowrap text-gray-300">source ~/.bashrc</div>
              </div>
              <div
                class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="mb-2"># For zsh</div>
                <div class="whitespace-nowrap text-gray-300">
                  echo 'export CODE_ASSIST_ENDPOINT="{{ geminiBaseUrl }}"' >> ~/.zshrc
                </div>
                <div class="whitespace-nowrap text-gray-300">
                  echo 'export GOOGLE_CLOUD_ACCESS_TOKEN="your-api-key"' >> ~/.zshrc
                </div>
                <div class="whitespace-nowrap text-gray-300">
                  echo 'export GOOGLE_GENAI_USE_GCA="true"' >> ~/.zshrc
                </div>
                <div class="whitespace-nowrap text-gray-300">source ~/.zshrc</div>
              </div>
            </div>

            <div class="rounded-lg border border-green-200 bg-green-50 p-3 sm:p-4">
              <h6 class="mb-2 font-medium text-green-800 dark:text-green-300">
                Verify Gemini CLI Environment Variables
              </h6>
              <p class="mb-3 text-sm text-green-700">Verify in terminal:</p>
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

        <!-- Codex Environment Variables Setup -->
        <div class="mt-8">
          <h5
            class="mb-2 flex items-center text-base font-semibold text-gray-800 dark:text-gray-600 sm:mb-3 sm:text-lg"
          >
            <i class="fas fa-code mr-2 text-indigo-600" />
            Configure Codex Environment Variables
          </h5>
          <p class="mb-3 text-sm text-gray-700 dark:text-gray-300 sm:mb-4 sm:text-base">
            If you use tools that support OpenAI API (such as Codex), you need to set the following
            environment variables:
          </p>

          <div class="space-y-4">
            <div class="rounded-lg border border-yellow-200 bg-yellow-50 p-3 sm:p-4">
              <h6 class="mb-2 font-medium text-yellow-800">Codex Configuration File</h6>
              <p class="mb-3 text-sm text-yellow-700">
                In your
                <code class="rounded bg-yellow-100 px-1">~/.codex/config.toml</code>
                file, add the following configuration:
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
                In your
                <code class="rounded bg-yellow-100 px-1">~/.codex/auth.json</code>
                file, configure the API key:
              </p>
              <div
                class="mt-2 overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="whitespace-nowrap text-gray-300">{</div>
                <div class="whitespace-nowrap text-gray-300">"OPENAI_API_KEY": "your-api-key"</div>
                <div class="whitespace-nowrap text-gray-300">}</div>
              </div>
              <p class="mt-2 text-xs text-yellow-700">
                💡 You can use the same API key as Claude Code, in the format cr_xxxxxxxxxx.
              </p>
            </div>
          </div>
        </div>
      </div>

      <!-- Step 4: Start Using -->
      <div class="mb-8">
        <h4
          class="mb-3 flex items-center text-lg font-semibold text-gray-800 dark:text-gray-300 sm:mb-4 sm:text-xl"
        >
          <span
            class="mr-2 flex h-6 w-6 items-center justify-center rounded-full bg-yellow-500 text-xs font-bold text-white sm:mr-3 sm:h-8 sm:w-8 sm:text-sm"
            >4</span
          >
          Start Using Claude Code
        </h4>
        <div
          class="rounded-xl border border-yellow-100 bg-gradient-to-r from-yellow-50 to-amber-50 p-4 sm:p-6"
        >
          <p class="mb-3 text-sm text-gray-700 dark:text-gray-300 sm:mb-4 sm:text-base">
            Now you can start using Claude Code!
          </p>

          <div class="space-y-4">
            <div>
              <h6 class="mb-2 text-sm font-medium text-gray-800 dark:text-gray-600 sm:text-base">
                Launch Claude Code
              </h6>
              <div
                class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="whitespace-nowrap text-gray-300">claude</div>
              </div>
            </div>

            <div>
              <h6 class="mb-2 text-sm font-medium text-gray-800 dark:text-gray-600 sm:text-base">
                Using in Specific Projects
              </h6>
              <div
                class="overflow-x-auto rounded bg-gray-900 p-2 font-mono text-xs text-green-400 sm:p-3 sm:text-sm"
              >
                <div class="mb-2"># Navigate to your project directory</div>
                <div class="whitespace-nowrap text-gray-300">cd /path/to/your/project</div>
                <div class="mb-2 mt-2"># Launch Claude Code</div>
                <div class="whitespace-nowrap text-gray-300">claude</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Linux Troubleshooting -->
      <div class="mb-8">
        <h4
          class="mb-3 flex items-center text-lg font-semibold text-gray-800 dark:text-gray-300 sm:mb-4 sm:text-xl"
        >
          <i class="fas fa-wrench mr-2 text-red-600 sm:mr-3" />
          Linux Common Issues Resolution
        </h4>
        <div class="space-y-4">
          <details class="rounded-lg border border-gray-200 bg-gray-50">
            <summary
              class="cursor-pointer p-3 text-sm font-medium text-gray-800 hover:bg-gray-100 sm:p-4 sm:text-base"
            >
              Permission error during installation
            </summary>
            <div class="px-3 pb-3 text-gray-600 sm:px-4 sm:pb-4">
              <p class="mb-2">Try the following solutions:</p>
              <ul class="list-inside list-disc space-y-1 text-sm">
                <li>
                  Install with sudo:
                  <code class="rounded bg-gray-200 px-1 text-xs sm:text-sm"
                    >sudo npm install -g @anthropic-ai/claude-code</code
                  >
                </li>
                <li>
                  Or configure npm to use user directory:
                  <code class="rounded bg-gray-200 px-1 text-xs sm:text-sm"
                    >npm config set prefix ~/.npm-global</code
                  >
                </li>
                <li>
                  Then add to PATH:
                  <code class="rounded bg-gray-200 px-1 text-xs sm:text-sm"
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
              Missing dependencies
            </summary>
            <div class="px-3 pb-3 text-gray-600 sm:px-4 sm:pb-4">
              <p class="mb-2">Some Linux distributions need additional dependencies:</p>
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
              Environment variables not taking effect
            </summary>
            <div class="px-3 pb-3 text-gray-600 sm:px-4 sm:pb-4">
              <p class="mb-2">Check the following points:</p>
              <ul class="list-inside list-disc space-y-1 text-sm">
                <li>Confirm you modified the correct configuration file (.bashrc or .zshrc)</li>
                <li>
                  Restart terminal or run
                  <code class="rounded bg-gray-200 px-1 text-xs sm:text-sm">source ~/.bashrc</code>
                </li>
                <li>
                  Verify settings:
                  <code class="rounded bg-gray-200 px-1 text-xs sm:text-sm"
                    >echo $ANTHROPIC_BASE_URL</code
                  >
                </li>
              </ul>
            </div>
          </details>
        </div>
      </div>
    </div>

    <!-- Conclusion -->
    <div
      class="rounded-xl bg-gradient-to-r from-blue-500 to-purple-600 p-4 text-center text-white sm:p-6"
    >
      <h5 class="mb-2 text-lg font-semibold sm:text-xl">🎉 Congratulations!</h5>
      <p class="mb-3 text-sm text-blue-100 sm:mb-4 sm:text-base">
        You have successfully installed and configured Claude Code. Now you can start enjoying the
        convenience brought by AI programming assistant.
      </p>
      <p class="text-xs text-blue-200 sm:text-sm">
        If you encounter any issues during use, you can check the official documentation or
        community discussions for help.
      </p>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'

// Current system selection
const activeTutorialSystem = ref('windows')

// System list
const tutorialSystems = [
  { key: 'windows', name: 'Windows', icon: 'fab fa-windows' },
  { key: 'macos', name: 'macOS', icon: 'fab fa-apple' },
  { key: 'linux', name: 'Linux / WSL2', icon: 'fab fa-linux' }
]

// Get base URL prefix
const getBaseUrlPrefix = () => {
  // Prioritize custom prefix configured by environment variables
  const customPrefix = import.meta.env.VITE_API_BASE_PREFIX
  if (customPrefix) {
    // Remove trailing slash
    return customPrefix.replace(/\/$/, '')
  }

  // Otherwise use current browser access address
  // More robust method to get origin, compatible with older browsers and special environments
  let origin = ''

  if (window.location.origin) {
    // Modern browsers directly support origin
    origin = window.location.origin
  } else {
    // Compatibility handling for older browsers or special environments
    const protocol = window.location.protocol
    const hostname = window.location.hostname
    const port = window.location.port

    origin = protocol + '//' + hostname

    // Only add port number when it's not the default port
    if (
      port &&
      ((protocol === 'http:' && port !== '80') || (protocol === 'https:' && port !== '443'))
    ) {
      origin += ':' + port
    }
  }

  // If still can't get it, deduce from current page URL
  if (!origin) {
    const currentUrl = window.location.href
    const pathStart = currentUrl.indexOf('/', 8) // Skip http:// or https://
    if (pathStart !== -1) {
      origin = currentUrl.substring(0, pathStart)
    } else {
      // Final fallback solution, use relative path
      console.warn('Unable to get complete origin, will use relative path')
      return ''
    }
  }

  return origin
}

// Current base URL - Claude Code
const currentBaseUrl = computed(() => {
  return getBaseUrlPrefix() + '/api'
})

// Gemini CLI base URL
const geminiBaseUrl = computed(() => {
  return getBaseUrlPrefix() + '/gemini'
})

// OpenAI/Codex base URL
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
