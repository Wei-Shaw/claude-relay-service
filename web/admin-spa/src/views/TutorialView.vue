<template>
  <div class="card p-6">
    <div class="mb-8">
      <h3 class="text-2xl font-bold text-gray-900 mb-4 flex items-center">
        <i class="fas fa-graduation-cap text-blue-600 mr-3" />
        Claude Code 使用教程
      </h3>
      <p class="text-gray-600 text-lg">
        跟着这个教程，你可以轻松在自己的电脑上安装并使用 Claude Code。
      </p>
    </div>
      
    <!-- 系统选择标签 -->
    <div class="mb-8">
      <div class="flex flex-wrap gap-2 p-2 bg-gray-100 rounded-xl">
        <button 
          v-for="system in tutorialSystems" 
          :key="system.key"
          :class="['flex-1 py-3 px-6 text-sm font-semibold rounded-lg transition-all duration-300 flex items-center justify-center gap-2', 
                   activeTutorialSystem === system.key 
                     ? 'bg-white text-blue-600 shadow-sm' 
                     : 'text-gray-600 hover:bg-white/50 hover:text-gray-900']"
          @click="activeTutorialSystem = system.key"
        >
          <i :class="system.icon" />
          {{ system.name }}
        </button>
      </div>
    </div>
      
    <!-- Windows 教程 -->
    <div
      v-if="activeTutorialSystem === 'windows'"
      class="tutorial-content"
    >
      <!-- 第一步：安装 Node.js -->
      <div class="mb-10">
        <h4 class="text-xl font-semibold text-gray-800 mb-4 flex items-center">
          <span class="w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm font-bold mr-3">1</span>
          安装 Node.js 环境
        </h4>
        <p class="text-gray-600 mb-6">
          Claude Code 需要 Node.js 环境才能运行。
        </p>
              
        <div class="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-6 border border-blue-100 mb-6">
          <h5 class="text-lg font-semibold text-gray-800 mb-3 flex items-center">
            <i class="fab fa-windows text-blue-600 mr-2" />
            Windows 安装方法
          </h5>
          <div class="mb-4">
            <p class="text-gray-700 mb-3">
              方法一：官网下载（推荐）
            </p>
            <ol class="list-decimal list-inside text-gray-600 space-y-2 ml-4">
              <li>打开浏览器访问 <code class="bg-gray-100 px-2 py-1 rounded text-sm">https://nodejs.org/</code></li>
              <li>点击 "LTS" 版本进行下载（推荐长期支持版本）</li>
              <li>下载完成后双击 <code class="bg-gray-100 px-2 py-1 rounded text-sm">.msi</code> 文件</li>
              <li>按照安装向导完成安装，保持默认设置即可</li>
            </ol>
          </div>
          <div class="mb-4">
            <p class="text-gray-700 mb-3">
              方法二：使用包管理器
            </p>
            <p class="text-gray-600 mb-2">
              如果你安装了 Chocolatey 或 Scoop，可以使用命令行安装：
            </p>
            <div class="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm">
              <div class="mb-2">
                # 使用 Chocolatey
              </div>
              <div class="text-gray-300">
                choco install nodejs
              </div>
              <div class="mt-3 mb-2">
                # 或使用 Scoop
              </div>
              <div class="text-gray-300">
                scoop install nodejs
              </div>
            </div>
          </div>
          <div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h6 class="font-medium text-blue-800 mb-2">
              Windows 注意事项
            </h6>
            <ul class="text-blue-700 text-sm space-y-1">
              <li>• 建议使用 PowerShell 而不是 CMD</li>
              <li>• 如果遇到权限问题，尝试以管理员身份运行</li>
              <li>• 某些杀毒软件可能会误报，需要添加白名单</li>
            </ul>
          </div>
        </div>

        <!-- 验证安装 -->
        <div class="bg-green-50 border border-green-200 rounded-lg p-4">
          <h6 class="font-medium text-green-800 mb-2">
            验证安装是否成功
          </h6>
          <p class="text-green-700 text-sm mb-3">
            安装完成后，打开 PowerShell 或 CMD，输入以下命令：
          </p>
          <div class="bg-gray-900 text-green-400 p-3 rounded font-mono text-sm">
            <div class="text-gray-300">
              node --version
            </div>
            <div class="text-gray-300">
              npm --version
            </div>
          </div>
          <p class="text-green-700 text-sm mt-2">
            如果显示版本号，说明安装成功了！
          </p>
        </div>
      </div>

      <!-- 第二步：安装 Git Bash -->
      <div class="mb-10">
        <h4 class="text-xl font-semibold text-gray-800 mb-4 flex items-center">
          <span class="w-8 h-8 bg-green-500 text-white rounded-full flex items-center justify-center text-sm font-bold mr-3">2</span>
          安装 Git Bash
        </h4>
        <p class="text-gray-600 mb-6">
          Windows 环境下需要使用 Git Bash 安装Claude code。安装完成后，环境变量设置和使用 Claude Code 仍然在普通的 PowerShell 或 CMD 中进行。
        </p>
              
        <div class="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl p-6 border border-green-100 mb-6">
          <h5 class="text-lg font-semibold text-gray-800 mb-3 flex items-center">
            <i class="fab fa-git-alt text-green-600 mr-2" />
            下载并安装 Git for Windows
          </h5>
          <ol class="list-decimal list-inside text-gray-600 space-y-2 ml-4 mb-4">
            <li>访问 <code class="bg-gray-100 px-2 py-1 rounded text-sm">https://git-scm.com/downloads/win</code></li>
            <li>点击 "Download for Windows" 下载安装包</li>
            <li>运行下载的 <code class="bg-gray-100 px-2 py-1 rounded text-sm">.exe</code> 安装文件</li>
            <li>在安装过程中保持默认设置，直接点击 "Next" 完成安装</li>
          </ol>
          <div class="bg-green-50 border border-green-200 rounded-lg p-4">
            <h6 class="font-medium text-green-800 mb-2">
              安装完成后
            </h6>
            <ul class="text-green-700 text-sm space-y-1">
              <li>• 在任意文件夹右键可以看到 "Git Bash Here" 选项</li>
              <li>• 也可以从开始菜单启动 "Git Bash"</li>
              <li>• 只需要在 Git Bash 中运行 npm install 命令</li>
              <li>• 后续的环境变量设置和使用都在 PowerShell/CMD 中</li>
            </ul>
          </div>
        </div>

        <!-- 验证安装 -->
        <div class="bg-green-50 border border-green-200 rounded-lg p-4">
          <h6 class="font-medium text-green-800 mb-2">
            验证 Git Bash 安装
          </h6>
          <p class="text-green-700 text-sm mb-3">
            打开 Git Bash，输入以下命令验证：
          </p>
          <div class="bg-gray-900 text-green-400 p-3 rounded font-mono text-sm">
            <div class="text-gray-300">
              git --version
            </div>
          </div>
          <p class="text-green-700 text-sm mt-2">
            如果显示 Git 版本号，说明安装成功！
          </p>
        </div>
      </div>

      <!-- 第三步：安装 Claude Code -->
      <div class="mb-10">
        <h4 class="text-xl font-semibold text-gray-800 mb-4 flex items-center">
          <span class="w-8 h-8 bg-purple-500 text-white rounded-full flex items-center justify-center text-sm font-bold mr-3">3</span>
          安装 Claude Code
        </h4>
              
        <div class="bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl p-6 border border-purple-100 mb-6">
          <h5 class="text-lg font-semibold text-gray-800 mb-3 flex items-center">
            <i class="fas fa-download text-purple-600 mr-2" />
            安装 Claude Code
          </h5>
          <p class="text-gray-700 mb-4">
            打开 Git Bash（重要：不要使用 PowerShell），运行以下命令：
          </p>
          <div class="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm mb-4">
            <div class="mb-2">
              # 在 Git Bash 中全局安装 Claude Code
            </div>
            <div class="text-gray-300">
              npm install -g @anthropic-ai/claude-code
            </div>
          </div>
          <p class="text-gray-600 text-sm">
            这个命令会从 npm 官方仓库下载并安装最新版本的 Claude Code。
          </p>
                  
          <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mt-4">
            <h6 class="font-medium text-yellow-800 mb-2">
              重要提醒
            </h6>
            <ul class="text-yellow-700 text-sm space-y-1">
              <li>• 必须在 Git Bash 中运行，不要在 PowerShell 中运行</li>
              <li>• 如果遇到权限问题，可以尝试在 Git Bash 中使用 sudo 命令</li>
            </ul>
          </div>
        </div>

        <!-- 验证安装 -->
        <div class="bg-green-50 border border-green-200 rounded-lg p-4">
          <h6 class="font-medium text-green-800 mb-2">
            验证 Claude Code 安装
          </h6>
          <p class="text-green-700 text-sm mb-3">
            安装完成后，输入以下命令检查是否安装成功：
          </p>
          <div class="bg-gray-900 text-green-400 p-3 rounded font-mono text-sm">
            <div class="text-gray-300">
              claude --version
            </div>
          </div>
          <p class="text-green-700 text-sm mt-2">
            如果显示版本号，恭喜你！Claude Code 已经成功安装了。
          </p>
        </div>
      </div>

      <!-- 第四步：设置环境变量 -->
      <div class="mb-10">
        <h4 class="text-xl font-semibold text-gray-800 mb-4 flex items-center">
          <span class="w-8 h-8 bg-orange-500 text-white rounded-full flex items-center justify-center text-sm font-bold mr-3">4</span>
          设置环境变量
        </h4>
              
        <div class="bg-gradient-to-r from-orange-50 to-yellow-50 rounded-xl p-6 border border-orange-100 mb-6">
          <h5 class="text-lg font-semibold text-gray-800 mb-3 flex items-center">
            <i class="fas fa-cog text-orange-600 mr-2" />
            配置 Claude Code 环境变量
          </h5>
          <p class="text-gray-700 mb-4">
            为了让 Claude Code 连接到你的中转服务，需要设置两个环境变量：
          </p>
                  
          <div class="space-y-4">
            <div class="bg-white rounded-lg p-4 border border-orange-200">
              <h6 class="font-medium text-gray-800 mb-2">
                方法一：PowerShell 临时设置（推荐）
              </h6>
              <p class="text-gray-600 text-sm mb-3">
                在 PowerShell 中运行以下命令：
              </p>
              <div class="bg-gray-900 text-green-400 p-3 rounded font-mono text-sm">
                <div class="text-gray-300">
                  $env:ANTHROPIC_BASE_URL = "{{ currentBaseUrl }}"
                </div>
                <div class="text-gray-300">
                  $env:ANTHROPIC_AUTH_TOKEN = "你的API密钥"
                </div>
              </div>
              <p class="text-yellow-700 text-xs mt-2">
                💡 记得将 "你的API密钥" 替换为在上方 "API Keys" 标签页中创建的实际密钥。
              </p>
            </div>
                      
            <div class="bg-white rounded-lg p-4 border border-orange-200">
              <h6 class="font-medium text-gray-800 mb-2">
                方法二：系统环境变量（永久设置）
              </h6>
              <ol class="text-gray-600 text-sm space-y-1 list-decimal list-inside">
                <li>右键"此电脑" → "属性" → "高级系统设置"</li>
                <li>点击"环境变量"按钮</li>
                <li>在"用户变量"或"系统变量"中点击"新建"</li>
                <li>添加以下两个变量：</li>
              </ol>
              <div class="mt-3 space-y-2">
                <div class="bg-gray-100 p-2 rounded text-sm">
                  <strong>变量名：</strong> ANTHROPIC_BASE_URL<br>
                  <strong>变量值：</strong> <span class="font-mono">{{ currentBaseUrl }}</span>
                </div>
                <div class="bg-gray-100 p-2 rounded text-sm">
                  <strong>变量名：</strong> ANTHROPIC_AUTH_TOKEN<br>
                  <strong>变量值：</strong> <span class="font-mono">你的API密钥</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 验证环境变量设置 -->
        <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-6">
          <h6 class="font-medium text-blue-800 mb-2">
            验证环境变量设置
          </h6>
          <p class="text-blue-700 text-sm mb-3">
            设置完环境变量后，可以通过以下命令验证是否设置成功：
          </p>
                  
          <div class="space-y-4">
            <div>
              <h6 class="font-medium text-gray-800 mb-2">
                在 PowerShell 中验证：
              </h6>
              <div class="bg-gray-900 text-green-400 p-3 rounded font-mono text-sm space-y-1">
                <div class="text-gray-300">
                  echo $env:ANTHROPIC_BASE_URL
                </div>
                <div class="text-gray-300">
                  echo $env:ANTHROPIC_AUTH_TOKEN
                </div>
              </div>
            </div>
                      
            <div>
              <h6 class="font-medium text-gray-800 mb-2">
                在 CMD 中验证：
              </h6>
              <div class="bg-gray-900 text-green-400 p-3 rounded font-mono text-sm space-y-1">
                <div class="text-gray-300">
                  echo %ANTHROPIC_BASE_URL%
                </div>
                <div class="text-gray-300">
                  echo %ANTHROPIC_AUTH_TOKEN%
                </div>
              </div>
            </div>
          </div>
                  
          <div class="mt-3 space-y-2">
            <p class="text-blue-700 text-sm">
              <strong>预期输出示例：</strong>
            </p>
            <div class="bg-gray-100 p-2 rounded text-sm font-mono">
              <div>{{ currentBaseUrl }}</div>
              <div>cr_xxxxxxxxxxxxxxxxxx</div>
            </div>
            <p class="text-blue-700 text-xs">
              💡 如果输出为空或显示变量名本身，说明环境变量设置失败，请重新设置。
            </p>
          </div>
        </div>
      </div>

      <!-- 第五步：开始使用 -->
      <div class="mb-8">
        <h4 class="text-xl font-semibold text-gray-800 mb-4 flex items-center">
          <span class="w-8 h-8 bg-yellow-500 text-white rounded-full flex items-center justify-center text-sm font-bold mr-3">5</span>
          开始使用 Claude Code
        </h4>
        <div class="bg-gradient-to-r from-yellow-50 to-amber-50 rounded-xl p-6 border border-yellow-100">
          <p class="text-gray-700 mb-4">
            现在你可以开始使用 Claude Code 了！
          </p>
                  
          <div class="space-y-4">
            <div>
              <h6 class="font-medium text-gray-800 mb-2">
                启动 Claude Code
              </h6>
              <div class="bg-gray-900 text-green-400 p-3 rounded font-mono text-sm">
                <div class="text-gray-300">
                  claude
                </div>
              </div>
            </div>
                      
            <div>
              <h6 class="font-medium text-gray-800 mb-2">
                在特定项目中使用
              </h6>
              <div class="bg-gray-900 text-green-400 p-3 rounded font-mono text-sm">
                <div class="mb-2">
                  # 进入你的项目目录
                </div>
                <div class="text-gray-300">
                  cd C:\path\to\your\project
                </div>
                <div class="mt-2 mb-2">
                  # 启动 Claude Code
                </div>
                <div class="text-gray-300">
                  claude
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Windows 故障排除 -->
      <div class="mb-8">
        <h4 class="text-xl font-semibold text-gray-800 mb-4 flex items-center">
          <i class="fas fa-wrench text-red-600 mr-3" />
          Windows 常见问题解决
        </h4>
        <div class="space-y-4">
          <details class="bg-gray-50 rounded-lg border border-gray-200">
            <summary class="p-4 cursor-pointer font-medium text-gray-800 hover:bg-gray-100">
              安装时提示 "permission denied" 错误
            </summary>
            <div class="px-4 pb-4 text-gray-600">
              <p class="mb-2">
                这通常是权限问题，尝试以下解决方法：
              </p>
              <ul class="list-disc list-inside space-y-1 text-sm">
                <li>以管理员身份运行 PowerShell</li>
                <li>或者配置 npm 使用用户目录：<code class="bg-gray-200 px-1 rounded">npm config set prefix %APPDATA%\npm</code></li>
              </ul>
            </div>
          </details>
                  
          <details class="bg-gray-50 rounded-lg border border-gray-200">
            <summary class="p-4 cursor-pointer font-medium text-gray-800 hover:bg-gray-100">
              PowerShell 执行策略错误
            </summary>
            <div class="px-4 pb-4 text-gray-600">
              <p class="mb-2">
                如果遇到执行策略限制，运行：
              </p>
              <div class="bg-gray-900 text-green-400 p-3 rounded font-mono text-sm">
                <div class="text-gray-300">
                  Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
                </div>
              </div>
            </div>
          </details>

          <details class="bg-gray-50 rounded-lg border border-gray-200">
            <summary class="p-4 cursor-pointer font-medium text-gray-800 hover:bg-gray-100">
              环境变量设置后不生效
            </summary>
            <div class="px-4 pb-4 text-gray-600">
              <p class="mb-2">
                设置永久环境变量后需要：
              </p>
              <ul class="list-disc list-inside space-y-1 text-sm">
                <li>重新启动 PowerShell 或 CMD</li>
                <li>或者注销并重新登录 Windows</li>
                <li>验证设置：<code class="bg-gray-200 px-1 rounded">echo $env:ANTHROPIC_BASE_URL</code></li>
              </ul>
            </div>
          </details>
        </div>
      </div>
    </div>
      
    <!-- macOS 教程 -->
    <div
      v-else-if="activeTutorialSystem === 'macos'"
      class="tutorial-content"
    >
      <!-- 第一步：安装 Node.js -->
      <div class="mb-10">
        <h4 class="text-xl font-semibold text-gray-800 mb-4 flex items-center">
          <span class="w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm font-bold mr-3">1</span>
          安装 Node.js 环境
        </h4>
        <p class="text-gray-600 mb-6">
          Claude Code 需要 Node.js 环境才能运行。
        </p>
            
        <div class="bg-gradient-to-r from-gray-50 to-slate-50 rounded-xl p-6 border border-gray-200 mb-6">
          <h5 class="text-lg font-semibold text-gray-800 mb-3 flex items-center">
            <i class="fab fa-apple text-gray-700 mr-2" />
            macOS 安装方法
          </h5>
          <div class="mb-4">
            <p class="text-gray-700 mb-3">
              方法一：使用 Homebrew（推荐）
            </p>
            <p class="text-gray-600 mb-2">
              如果你已经安装了 Homebrew，使用它安装 Node.js 会更方便：
            </p>
            <div class="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm">
              <div class="mb-2">
                # 更新 Homebrew
              </div>
              <div class="text-gray-300">
                brew update
              </div>
              <div class="mt-3 mb-2">
                # 安装 Node.js
              </div>
              <div class="text-gray-300">
                brew install node
              </div>
            </div>
          </div>
          <div class="mb-4">
            <p class="text-gray-700 mb-3">
              方法二：官网下载
            </p>
            <ol class="list-decimal list-inside text-gray-600 space-y-2 ml-4">
              <li>访问 <code class="bg-gray-100 px-2 py-1 rounded text-sm">https://nodejs.org/</code></li>
              <li>下载适合 macOS 的 LTS 版本</li>
              <li>打开下载的 <code class="bg-gray-100 px-2 py-1 rounded text-sm">.pkg</code> 文件</li>
              <li>按照安装程序指引完成安装</li>
            </ol>
          </div>
          <div class="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <h6 class="font-medium text-gray-800 mb-2">
              macOS 注意事项
            </h6>
            <ul class="text-gray-700 text-sm space-y-1">
              <li>• 如果遇到权限问题，可能需要使用 <code class="bg-gray-200 px-1 rounded">sudo</code></li>
              <li>• 首次运行可能需要在系统偏好设置中允许</li>
              <li>• 建议使用 Terminal 或 iTerm2</li>
            </ul>
          </div>
        </div>

        <!-- 验证安装 -->
        <div class="bg-green-50 border border-green-200 rounded-lg p-4">
          <h6 class="font-medium text-green-800 mb-2">
            验证安装是否成功
          </h6>
          <p class="text-green-700 text-sm mb-3">
            安装完成后，打开 Terminal，输入以下命令：
          </p>
          <div class="bg-gray-900 text-green-400 p-3 rounded font-mono text-sm">
            <div class="text-gray-300">
              node --version
            </div>
            <div class="text-gray-300">
              npm --version
            </div>
          </div>
          <p class="text-green-700 text-sm mt-2">
            如果显示版本号，说明安装成功了！
          </p>
        </div>
      </div>

      <!-- 第二步：安装 Claude Code -->
      <div class="mb-10">
        <h4 class="text-xl font-semibold text-gray-800 mb-4 flex items-center">
          <span class="w-8 h-8 bg-green-500 text-white rounded-full flex items-center justify-center text-sm font-bold mr-3">2</span>
          安装 Claude Code
        </h4>
            
        <div class="bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl p-6 border border-purple-100 mb-6">
          <h5 class="text-lg font-semibold text-gray-800 mb-3 flex items-center">
            <i class="fas fa-download text-purple-600 mr-2" />
            安装 Claude Code
          </h5>
          <p class="text-gray-700 mb-4">
            打开 Terminal，运行以下命令：
          </p>
          <div class="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm mb-4">
            <div class="mb-2">
              # 全局安装 Claude Code
            </div>
            <div class="text-gray-300">
              npm install -g @anthropic-ai/claude-code
            </div>
          </div>
          <p class="text-gray-600 text-sm mb-2">
            如果遇到权限问题，可以使用 sudo：
          </p>
          <div class="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm">
            <div class="text-gray-300">
              sudo npm install -g @anthropic-ai/claude-code
            </div>
          </div>
        </div>

        <!-- 验证安装 -->
        <div class="bg-green-50 border border-green-200 rounded-lg p-4">
          <h6 class="font-medium text-green-800 mb-2">
            验证 Claude Code 安装
          </h6>
          <p class="text-green-700 text-sm mb-3">
            安装完成后，输入以下命令检查是否安装成功：
          </p>
          <div class="bg-gray-900 text-green-400 p-3 rounded font-mono text-sm">
            <div class="text-gray-300">
              claude --version
            </div>
          </div>
          <p class="text-green-700 text-sm mt-2">
            如果显示版本号，恭喜你！Claude Code 已经成功安装了。
          </p>
        </div>
      </div>

      <!-- 第三步：设置环境变量 -->
      <div class="mb-10">
        <h4 class="text-xl font-semibold text-gray-800 mb-4 flex items-center">
          <span class="w-8 h-8 bg-orange-500 text-white rounded-full flex items-center justify-center text-sm font-bold mr-3">3</span>
          设置环境变量
        </h4>
            
        <div class="bg-gradient-to-r from-orange-50 to-yellow-50 rounded-xl p-6 border border-orange-100 mb-6">
          <h5 class="text-lg font-semibold text-gray-800 mb-3 flex items-center">
            <i class="fas fa-cog text-orange-600 mr-2" />
            配置 Claude Code 环境变量
          </h5>
          <p class="text-gray-700 mb-4">
            为了让 Claude Code 连接到你的中转服务，需要设置两个环境变量：
          </p>
                
          <div class="space-y-4">
            <div class="bg-white rounded-lg p-4 border border-orange-200">
              <h6 class="font-medium text-gray-800 mb-2">
                方法一：临时设置（当前会话）
              </h6>
              <p class="text-gray-600 text-sm mb-3">
                在 Terminal 中运行以下命令：
              </p>
              <div class="bg-gray-900 text-green-400 p-3 rounded font-mono text-sm">
                <div class="text-gray-300">
                  export ANTHROPIC_BASE_URL="{{ currentBaseUrl }}"
                </div>
                <div class="text-gray-300">
                  export ANTHROPIC_AUTH_TOKEN="你的API密钥"
                </div>
              </div>
              <p class="text-yellow-700 text-xs mt-2">
                💡 记得将 "你的API密钥" 替换为在上方 "API Keys" 标签页中创建的实际密钥。
              </p>
            </div>
                    
            <div class="bg-white rounded-lg p-4 border border-orange-200">
              <h6 class="font-medium text-gray-800 mb-2">
                方法二：永久设置
              </h6>
              <p class="text-gray-600 text-sm mb-3">
                编辑你的 shell 配置文件（根据你使用的 shell）：
              </p>
              <div class="bg-gray-900 text-green-400 p-3 rounded font-mono text-sm mb-3">
                <div class="mb-2">
                  # 对于 zsh (默认)
                </div>
                <div class="text-gray-300">
                  echo 'export ANTHROPIC_BASE_URL="{{ currentBaseUrl }}"' >> ~/.zshrc
                </div>
                <div class="text-gray-300">
                  echo 'export ANTHROPIC_AUTH_TOKEN="你的API密钥"' >> ~/.zshrc
                </div>
                <div class="text-gray-300">
                  source ~/.zshrc
                </div>
              </div>
              <div class="bg-gray-900 text-green-400 p-3 rounded font-mono text-sm">
                <div class="mb-2">
                  # 对于 bash
                </div>
                <div class="text-gray-300">
                  echo 'export ANTHROPIC_BASE_URL="{{ currentBaseUrl }}"' >> ~/.bash_profile
                </div>
                <div class="text-gray-300">
                  echo 'export ANTHROPIC_AUTH_TOKEN="你的API密钥"' >> ~/.bash_profile
                </div>
                <div class="text-gray-300">
                  source ~/.bash_profile
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 第四步：开始使用 -->
      <div class="mb-8">
        <h4 class="text-xl font-semibold text-gray-800 mb-4 flex items-center">
          <span class="w-8 h-8 bg-yellow-500 text-white rounded-full flex items-center justify-center text-sm font-bold mr-3">4</span>
          开始使用 Claude Code
        </h4>
        <div class="bg-gradient-to-r from-yellow-50 to-amber-50 rounded-xl p-6 border border-yellow-100">
          <p class="text-gray-700 mb-4">
            现在你可以开始使用 Claude Code 了！
          </p>
                
          <div class="space-y-4">
            <div>
              <h6 class="font-medium text-gray-800 mb-2">
                启动 Claude Code
              </h6>
              <div class="bg-gray-900 text-green-400 p-3 rounded font-mono text-sm">
                <div class="text-gray-300">
                  claude
                </div>
              </div>
            </div>
                    
            <div>
              <h6 class="font-medium text-gray-800 mb-2">
                在特定项目中使用
              </h6>
              <div class="bg-gray-900 text-green-400 p-3 rounded font-mono text-sm">
                <div class="mb-2">
                  # 进入你的项目目录
                </div>
                <div class="text-gray-300">
                  cd /path/to/your/project
                </div>
                <div class="mt-2 mb-2">
                  # 启动 Claude Code
                </div>
                <div class="text-gray-300">
                  claude
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- macOS 故障排除 -->
      <div class="mb-8">
        <h4 class="text-xl font-semibold text-gray-800 mb-4 flex items-center">
          <i class="fas fa-wrench text-red-600 mr-3" />
          macOS 常见问题解决
        </h4>
        <div class="space-y-4">
          <details class="bg-gray-50 rounded-lg border border-gray-200">
            <summary class="p-4 cursor-pointer font-medium text-gray-800 hover:bg-gray-100">
              安装时提示权限错误
            </summary>
            <div class="px-4 pb-4 text-gray-600">
              <p class="mb-2">
                尝试以下解决方法：
              </p>
              <ul class="list-disc list-inside space-y-1 text-sm">
                <li>使用 sudo 安装：<code class="bg-gray-200 px-1 rounded">sudo npm install -g @anthropic-ai/claude-code</code></li>
                <li>或者配置 npm 使用用户目录：<code class="bg-gray-200 px-1 rounded">npm config set prefix ~/.npm-global</code></li>
              </ul>
            </div>
          </details>
                
          <details class="bg-gray-50 rounded-lg border border-gray-200">
            <summary class="p-4 cursor-pointer font-medium text-gray-800 hover:bg-gray-100">
              macOS 安全设置阻止运行
            </summary>
            <div class="px-4 pb-4 text-gray-600">
              <p class="mb-2">
                如果系统阻止运行 Claude Code：
              </p>
              <ul class="list-disc list-inside space-y-1 text-sm">
                <li>打开"系统偏好设置" → "安全性与隐私"</li>
                <li>点击"仍要打开"或"允许"</li>
                <li>或者在 Terminal 中运行：<code class="bg-gray-200 px-1 rounded">sudo spctl --master-disable</code></li>
              </ul>
            </div>
          </details>

          <details class="bg-gray-50 rounded-lg border border-gray-200">
            <summary class="p-4 cursor-pointer font-medium text-gray-800 hover:bg-gray-100">
              环境变量不生效
            </summary>
            <div class="px-4 pb-4 text-gray-600">
              <p class="mb-2">
                检查以下几点：
              </p>
              <ul class="list-disc list-inside space-y-1 text-sm">
                <li>确认修改了正确的配置文件（.zshrc 或 .bash_profile）</li>
                <li>重新启动 Terminal</li>
                <li>验证设置：<code class="bg-gray-200 px-1 rounded">echo $ANTHROPIC_BASE_URL</code></li>
              </ul>
            </div>
          </details>
        </div>
      </div>
    </div>
      
    <!-- Linux 教程 -->
    <div
      v-else-if="activeTutorialSystem === 'linux'"
      class="tutorial-content"
    >
      <!-- 第一步：安装 Node.js -->
      <div class="mb-10">
        <h4 class="text-xl font-semibold text-gray-800 mb-4 flex items-center">
          <span class="w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm font-bold mr-3">1</span>
          安装 Node.js 环境
        </h4>
        <p class="text-gray-600 mb-6">
          Claude Code 需要 Node.js 环境才能运行。
        </p>
            
        <div class="bg-gradient-to-r from-orange-50 to-red-50 rounded-xl p-6 border border-orange-100 mb-6">
          <h5 class="text-lg font-semibold text-gray-800 mb-3 flex items-center">
            <i class="fab fa-ubuntu text-orange-600 mr-2" />
            Linux 安装方法
          </h5>
          <div class="mb-4">
            <p class="text-gray-700 mb-3">
              方法一：使用官方仓库（推荐）
            </p>
            <div class="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm">
              <div class="mb-2">
                # 添加 NodeSource 仓库
              </div>
              <div class="text-gray-300">
                curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
              </div>
              <div class="mt-3 mb-2">
                # 安装 Node.js
              </div>
              <div class="text-gray-300">
                sudo apt-get install -y nodejs
              </div>
            </div>
          </div>
          <div class="mb-4">
            <p class="text-gray-700 mb-3">
              方法二：使用系统包管理器
            </p>
            <p class="text-gray-600 mb-2">
              虽然版本可能不是最新的，但对于基本使用已经足够：
            </p>
            <div class="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm">
              <div class="mb-2">
                # Ubuntu/Debian
              </div>
              <div class="text-gray-300">
                sudo apt update
              </div>
              <div class="text-gray-300">
                sudo apt install nodejs npm
              </div>
              <div class="mt-3 mb-2">
                # CentOS/RHEL/Fedora
              </div>
              <div class="text-gray-300">
                sudo dnf install nodejs npm
              </div>
            </div>
          </div>
          <div class="bg-orange-50 border border-orange-200 rounded-lg p-4">
            <h6 class="font-medium text-orange-800 mb-2">
              Linux 注意事项
            </h6>
            <ul class="text-orange-700 text-sm space-y-1">
              <li>• 某些发行版可能需要安装额外的依赖</li>
              <li>• 如果遇到权限问题，使用 <code class="bg-orange-200 px-1 rounded">sudo</code></li>
              <li>• 确保你的用户在 npm 的全局目录有写权限</li>
            </ul>
          </div>
        </div>

        <!-- 验证安装 -->
        <div class="bg-green-50 border border-green-200 rounded-lg p-4">
          <h6 class="font-medium text-green-800 mb-2">
            验证安装是否成功
          </h6>
          <p class="text-green-700 text-sm mb-3">
            安装完成后，打开终端，输入以下命令：
          </p>
          <div class="bg-gray-900 text-green-400 p-3 rounded font-mono text-sm">
            <div class="text-gray-300">
              node --version
            </div>
            <div class="text-gray-300">
              npm --version
            </div>
          </div>
          <p class="text-green-700 text-sm mt-2">
            如果显示版本号，说明安装成功了！
          </p>
        </div>
      </div>

      <!-- 第二步：安装 Claude Code -->
      <div class="mb-10">
        <h4 class="text-xl font-semibold text-gray-800 mb-4 flex items-center">
          <span class="w-8 h-8 bg-green-500 text-white rounded-full flex items-center justify-center text-sm font-bold mr-3">2</span>
          安装 Claude Code
        </h4>
            
        <div class="bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl p-6 border border-purple-100 mb-6">
          <h5 class="text-lg font-semibold text-gray-800 mb-3 flex items-center">
            <i class="fas fa-download text-purple-600 mr-2" />
            安装 Claude Code
          </h5>
          <p class="text-gray-700 mb-4">
            打开终端，运行以下命令：
          </p>
          <div class="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm mb-4">
            <div class="mb-2">
              # 全局安装 Claude Code
            </div>
            <div class="text-gray-300">
              npm install -g @anthropic-ai/claude-code
            </div>
          </div>
          <p class="text-gray-600 text-sm mb-2">
            如果遇到权限问题，可以使用 sudo：
          </p>
          <div class="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm">
            <div class="text-gray-300">
              sudo npm install -g @anthropic-ai/claude-code
            </div>
          </div>
        </div>

        <!-- 验证安装 -->
        <div class="bg-green-50 border border-green-200 rounded-lg p-4">
          <h6 class="font-medium text-green-800 mb-2">
            验证 Claude Code 安装
          </h6>
          <p class="text-green-700 text-sm mb-3">
            安装完成后，输入以下命令检查是否安装成功：
          </p>
          <div class="bg-gray-900 text-green-400 p-3 rounded font-mono text-sm">
            <div class="text-gray-300">
              claude --version
            </div>
          </div>
          <p class="text-green-700 text-sm mt-2">
            如果显示版本号，恭喜你！Claude Code 已经成功安装了。
          </p>
        </div>
      </div>

      <!-- 第三步：设置环境变量 -->
      <div class="mb-10">
        <h4 class="text-xl font-semibold text-gray-800 mb-4 flex items-center">
          <span class="w-8 h-8 bg-orange-500 text-white rounded-full flex items-center justify-center text-sm font-bold mr-3">3</span>
          设置环境变量
        </h4>
            
        <div class="bg-gradient-to-r from-orange-50 to-yellow-50 rounded-xl p-6 border border-orange-100 mb-6">
          <h5 class="text-lg font-semibold text-gray-800 mb-3 flex items-center">
            <i class="fas fa-cog text-orange-600 mr-2" />
            配置 Claude Code 环境变量
          </h5>
          <p class="text-gray-700 mb-4">
            为了让 Claude Code 连接到你的中转服务，需要设置两个环境变量：
          </p>
                
          <div class="space-y-4">
            <div class="bg-white rounded-lg p-4 border border-orange-200">
              <h6 class="font-medium text-gray-800 mb-2">
                方法一：临时设置（当前会话）
              </h6>
              <p class="text-gray-600 text-sm mb-3">
                在终端中运行以下命令：
              </p>
              <div class="bg-gray-900 text-green-400 p-3 rounded font-mono text-sm">
                <div class="text-gray-300">
                  export ANTHROPIC_BASE_URL="{{ currentBaseUrl }}"
                </div>
                <div class="text-gray-300">
                  export ANTHROPIC_AUTH_TOKEN="你的API密钥"
                </div>
              </div>
              <p class="text-yellow-700 text-xs mt-2">
                💡 记得将 "你的API密钥" 替换为在上方 "API Keys" 标签页中创建的实际密钥。
              </p>
            </div>
                    
            <div class="bg-white rounded-lg p-4 border border-orange-200">
              <h6 class="font-medium text-gray-800 mb-2">
                方法二：永久设置
              </h6>
              <p class="text-gray-600 text-sm mb-3">
                编辑你的 shell 配置文件：
              </p>
              <div class="bg-gray-900 text-green-400 p-3 rounded font-mono text-sm mb-3">
                <div class="mb-2">
                  # 对于 bash (默认)
                </div>
                <div class="text-gray-300">
                  echo 'export ANTHROPIC_BASE_URL="{{ currentBaseUrl }}"' >> ~/.bashrc
                </div>
                <div class="text-gray-300">
                  echo 'export ANTHROPIC_AUTH_TOKEN="你的API密钥"' >> ~/.bashrc
                </div>
                <div class="text-gray-300">
                  source ~/.bashrc
                </div>
              </div>
              <div class="bg-gray-900 text-green-400 p-3 rounded font-mono text-sm">
                <div class="mb-2">
                  # 对于 zsh
                </div>
                <div class="text-gray-300">
                  echo 'export ANTHROPIC_BASE_URL="{{ currentBaseUrl }}"' >> ~/.zshrc
                </div>
                <div class="text-gray-300">
                  echo 'export ANTHROPIC_AUTH_TOKEN="你的API密钥"' >> ~/.zshrc
                </div>
                <div class="text-gray-300">
                  source ~/.zshrc
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 第四步：开始使用 -->
      <div class="mb-8">
        <h4 class="text-xl font-semibold text-gray-800 mb-4 flex items-center">
          <span class="w-8 h-8 bg-yellow-500 text-white rounded-full flex items-center justify-center text-sm font-bold mr-3">4</span>
          开始使用 Claude Code
        </h4>
        <div class="bg-gradient-to-r from-yellow-50 to-amber-50 rounded-xl p-6 border border-yellow-100">
          <p class="text-gray-700 mb-4">
            现在你可以开始使用 Claude Code 了！
          </p>
                
          <div class="space-y-4">
            <div>
              <h6 class="font-medium text-gray-800 mb-2">
                启动 Claude Code
              </h6>
              <div class="bg-gray-900 text-green-400 p-3 rounded font-mono text-sm">
                <div class="text-gray-300">
                  claude
                </div>
              </div>
            </div>
                    
            <div>
              <h6 class="font-medium text-gray-800 mb-2">
                在特定项目中使用
              </h6>
              <div class="bg-gray-900 text-green-400 p-3 rounded font-mono text-sm">
                <div class="mb-2">
                  # 进入你的项目目录
                </div>
                <div class="text-gray-300">
                  cd /path/to/your/project
                </div>
                <div class="mt-2 mb-2">
                  # 启动 Claude Code
                </div>
                <div class="text-gray-300">
                  claude
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Linux 故障排除 -->
      <div class="mb-8">
        <h4 class="text-xl font-semibold text-gray-800 mb-4 flex items-center">
          <i class="fas fa-wrench text-red-600 mr-3" />
          Linux 常见问题解决
        </h4>
        <div class="space-y-4">
          <details class="bg-gray-50 rounded-lg border border-gray-200">
            <summary class="p-4 cursor-pointer font-medium text-gray-800 hover:bg-gray-100">
              安装时提示权限错误
            </summary>
            <div class="px-4 pb-4 text-gray-600">
              <p class="mb-2">
                尝试以下解决方法：
              </p>
              <ul class="list-disc list-inside space-y-1 text-sm">
                <li>使用 sudo 安装：<code class="bg-gray-200 px-1 rounded">sudo npm install -g @anthropic-ai/claude-code</code></li>
                <li>或者配置 npm 使用用户目录：<code class="bg-gray-200 px-1 rounded">npm config set prefix ~/.npm-global</code></li>
                <li>然后添加到 PATH：<code class="bg-gray-200 px-1 rounded">export PATH=~/.npm-global/bin:$PATH</code></li>
              </ul>
            </div>
          </details>
                
          <details class="bg-gray-50 rounded-lg border border-gray-200">
            <summary class="p-4 cursor-pointer font-medium text-gray-800 hover:bg-gray-100">
              缺少依赖库
            </summary>
            <div class="px-4 pb-4 text-gray-600">
              <p class="mb-2">
                某些 Linux 发行版需要安装额外依赖：
              </p>
              <div class="bg-gray-900 text-green-400 p-3 rounded font-mono text-sm">
                <div class="mb-2">
                  # Ubuntu/Debian
                </div>
                <div class="text-gray-300">
                  sudo apt install build-essential
                </div>
                <div class="mt-2 mb-2">
                  # CentOS/RHEL
                </div>
                <div class="text-gray-300">
                  sudo dnf groupinstall "Development Tools"
                </div>
              </div>
            </div>
          </details>

          <details class="bg-gray-50 rounded-lg border border-gray-200">
            <summary class="p-4 cursor-pointer font-medium text-gray-800 hover:bg-gray-100">
              环境变量不生效
            </summary>
            <div class="px-4 pb-4 text-gray-600">
              <p class="mb-2">
                检查以下几点：
              </p>
              <ul class="list-disc list-inside space-y-1 text-sm">
                <li>确认修改了正确的配置文件（.bashrc 或 .zshrc）</li>
                <li>重新启动终端或运行 <code class="bg-gray-200 px-1 rounded">source ~/.bashrc</code></li>
                <li>验证设置：<code class="bg-gray-200 px-1 rounded">echo $ANTHROPIC_BASE_URL</code></li>
              </ul>
            </div>
          </details>
        </div>
      </div>
    </div>

    <!-- 结尾 -->
    <div class="bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-xl p-6 text-center">
      <h5 class="text-xl font-semibold mb-2">
        🎉 恭喜你！
      </h5>
      <p class="text-blue-100 mb-4">
        你已经成功安装并配置了 Claude Code，现在可以开始享受 AI 编程助手带来的便利了。
      </p>
      <p class="text-sm text-blue-200">
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
  { key: 'linux', name: 'Linux / WSL2', icon: 'fab fa-linux' },
]

// 当前域名
const currentDomain = computed(() => {
  return window.location.origin
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