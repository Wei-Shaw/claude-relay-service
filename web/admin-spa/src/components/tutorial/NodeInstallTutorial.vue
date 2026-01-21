<template>
  <div class="mb-4 sm:mb-10 sm:mb-6">
    <h4
      class="mb-3 flex items-center text-lg font-semibold text-gray-800 dark:text-gray-300 sm:mb-4 sm:text-xl"
    >
      <span
        class="mr-2 flex h-6 w-6 items-center justify-center rounded-full bg-blue-500 text-xs font-bold text-white sm:mr-3 sm:h-8 sm:w-8 sm:text-sm"
        >{{ stepNumber }}</span
      >
      安装 Node.js 环境
    </h4>
    <p class="mb-4 text-sm text-gray-600 dark:text-gray-400 sm:mb-4 sm:mb-6 sm:text-base">
      {{ toolName }} 需要 Node.js 环境才能运行。
    </p>

    <!-- Windows -->
    <div v-if="platform === 'windows'" class="node-install-section">
      <div
        class="mb-4 rounded-xl border border-blue-100 bg-gradient-to-r from-blue-50 to-indigo-50 p-4 dark:border-blue-500/40 dark:from-blue-950/30 dark:to-indigo-950/30 sm:mb-6 sm:p-6"
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
            class="overflow-x-auto rounded-lg bg-gray-900 p-3 font-mono text-xs text-green-400 dark:border dark:border-gray-700 dark:bg-gray-900 sm:p-4 sm:text-sm"
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
          <ul class="space-y-1 text-xs text-blue-700 dark:text-blue-300 sm:text-sm">
            <li>• 建议使用 PowerShell 而不是 CMD</li>
            <li>• 如果遇到权限问题，尝试以管理员身份运行</li>
            <li>• 某些杀毒软件可能会误报，需要添加白名单</li>
          </ul>
        </div>
      </div>
      <VerifyInstall terminal="PowerShell 或 CMD" />
    </div>

    <!-- macOS -->
    <div v-else-if="platform === 'macos'" class="node-install-section">
      <div
        class="mb-4 rounded-xl border border-gray-200 bg-gradient-to-r from-gray-50 to-gray-50 p-4 dark:border-gray-700 dark:from-gray-800 dark:to-gray-800 sm:mb-6 sm:p-6"
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
            class="overflow-x-auto rounded-lg bg-gray-900 p-3 font-mono text-xs text-green-400 dark:border dark:border-gray-700 dark:bg-gray-900 sm:p-4 sm:text-sm"
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
              <code class="rounded bg-gray-200 px-1 text-xs dark:bg-gray-700 sm:text-sm">sudo</code>
            </li>
            <li>• 首次运行可能需要在系统偏好设置中允许</li>
            <li>• 建议使用 Terminal 或 iTerm2</li>
          </ul>
        </div>
      </div>
      <VerifyInstall terminal="Terminal" />
    </div>

    <!-- Linux -->
    <div v-else class="node-install-section">
      <div
        class="mb-4 rounded-xl border border-orange-100 bg-gradient-to-r from-orange-50 to-amber-50 p-4 dark:border-orange-500/40 dark:from-orange-950/30 dark:to-amber-950/30 sm:mb-6 sm:p-6"
      >
        <h5
          class="mb-2 flex items-center text-base font-semibold text-gray-800 dark:text-gray-200 sm:mb-3 sm:text-lg"
        >
          <i class="fab fa-linux mr-2 text-orange-600" />
          Linux / WSL2 安装方法
        </h5>
        <div class="mb-4">
          <p class="mb-3 text-gray-700 dark:text-gray-300">方法一：使用 nvm（推荐）</p>
          <p class="mb-2 text-xs text-gray-600 dark:text-gray-400 sm:text-sm">
            nvm 可以方便地管理多个 Node.js 版本：
          </p>
          <div
            class="overflow-x-auto rounded-lg bg-gray-900 p-3 font-mono text-xs text-green-400 dark:border dark:border-gray-700 dark:bg-gray-900 sm:p-4 sm:text-sm"
          >
            <div class="mb-2"># 安装 nvm</div>
            <div class="whitespace-nowrap text-gray-300">
              curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
            </div>
            <div class="mb-2 mt-3"># 重新加载 shell 配置</div>
            <div class="whitespace-nowrap text-gray-300">source ~/.bashrc</div>
            <div class="mb-2 mt-3"># 安装最新 LTS 版本</div>
            <div class="whitespace-nowrap text-gray-300">nvm install --lts</div>
          </div>
        </div>
        <div class="mb-4">
          <p class="mb-3 text-gray-700 dark:text-gray-300">方法二：使用包管理器</p>
          <div
            class="overflow-x-auto rounded-lg bg-gray-900 p-3 font-mono text-xs text-green-400 dark:border dark:border-gray-700 dark:bg-gray-900 sm:p-4 sm:text-sm"
          >
            <div class="mb-2"># Ubuntu/Debian</div>
            <div class="whitespace-nowrap text-gray-300">
              curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
            </div>
            <div class="whitespace-nowrap text-gray-300">sudo apt-get install -y nodejs</div>
            <div class="mb-2 mt-3"># Fedora</div>
            <div class="whitespace-nowrap text-gray-300">sudo dnf install nodejs</div>
            <div class="mb-2 mt-3"># Arch Linux</div>
            <div class="whitespace-nowrap text-gray-300">sudo pacman -S nodejs npm</div>
          </div>
        </div>
        <div
          class="rounded-lg border border-orange-200 bg-orange-50 p-3 dark:border-orange-500/40 dark:bg-orange-950/30 sm:p-4"
        >
          <h6 class="mb-2 text-sm font-medium text-orange-800 dark:text-orange-300 sm:text-base">
            Linux / WSL2 注意事项
          </h6>
          <ul class="space-y-1 text-xs text-orange-700 dark:text-orange-300 sm:text-sm">
            <li>• WSL2 用户建议在 Linux 子系统中安装，而不是 Windows</li>
            <li>• 使用 nvm 可以避免权限问题</li>
            <li>• 确保 shell 配置文件正确加载了 nvm</li>
          </ul>
        </div>
      </div>
      <VerifyInstall terminal="终端" />
    </div>
  </div>
</template>

<script setup>
import VerifyInstall from './VerifyInstall.vue'

defineProps({
  platform: {
    type: String,
    required: true,
    validator: (value) => ['windows', 'macos', 'linux'].includes(value)
  },
  stepNumber: {
    type: [Number, String],
    default: 1
  },
  toolName: {
    type: String,
    default: 'CLI 工具'
  }
})
</script>
