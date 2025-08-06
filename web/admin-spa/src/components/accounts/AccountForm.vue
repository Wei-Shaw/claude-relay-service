<template>
  <Teleport to="body">
    <div
      v-if="show"
      class="fixed inset-0 modal z-50 flex items-center justify-center p-3 sm:p-4"
    >
      <div class="modal-content w-full max-w-2xl p-4 sm:p-6 md:p-8 mx-auto max-h-[90vh] overflow-y-auto custom-scrollbar">
        <div class="flex items-center justify-between mb-4 sm:mb-6">
          <div class="flex items-center gap-2 sm:gap-3">
            <div class="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-green-500 to-green-600 rounded-lg sm:rounded-xl flex items-center justify-center">
              <i class="fas fa-user-circle text-white text-sm sm:text-base" />
            </div>
            <h3 class="text-lg sm:text-xl font-bold text-gray-900">
              {{ isEdit ? '编辑账户' : '添加账户' }}
            </h3>
          </div>
          <button 
            class="text-gray-400 hover:text-gray-600 transition-colors p-1"
            @click="$emit('close')"
          >
            <i class="fas fa-times text-lg sm:text-xl" />
          </button>
        </div>
        
        <!-- 步骤指示器 -->
        <div
          v-if="!isEdit && form.addType === 'oauth'"
          class="flex items-center justify-center mb-4 sm:mb-8"
        >
          <div class="flex items-center space-x-2 sm:space-x-4">
            <div class="flex items-center">
              <div
                :class="['w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs sm:text-sm font-semibold', 
                         oauthStep >= 1 ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-500']"
              >
                1
              </div>
              <span class="ml-1.5 sm:ml-2 text-xs sm:text-sm font-medium text-gray-700">基本信息</span>
            </div>
            <div class="w-4 sm:w-8 h-0.5 bg-gray-300" />
            <div class="flex items-center">
              <div
                :class="['w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs sm:text-sm font-semibold', 
                         oauthStep >= 2 ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-500']"
              >
                2
              </div>
              <span class="ml-1.5 sm:ml-2 text-xs sm:text-sm font-medium text-gray-700">授权认证</span>
            </div>
          </div>
        </div>
        
        <!-- 步骤1: 基本信息和代理设置 -->
        <div v-if="oauthStep === 1 && !isEdit">
          <div class="space-y-6">
            <div v-if="!isEdit">
              <label class="block text-sm font-semibold text-gray-700 mb-3">平台</label>
              <div class="flex gap-4">
                <label class="flex items-center cursor-pointer">
                  <input 
                    v-model="form.platform" 
                    type="radio" 
                    value="claude" 
                    class="mr-2"
                  >
                  <span class="text-sm text-gray-700">Claude</span>
                </label>
                <label class="flex items-center cursor-pointer">
                  <input 
                    v-model="form.platform" 
                    type="radio" 
                    value="claude-console" 
                    class="mr-2"
                  >
                  <span class="text-sm text-gray-700">Claude Console</span>
                </label>
                <label class="flex items-center cursor-pointer">
                  <input 
                    v-model="form.platform" 
                    type="radio" 
                    value="gemini" 
                    class="mr-2"
                  >
                  <span class="text-sm text-gray-700">Gemini</span>
                </label>
              </div>
            </div>
            
            <div v-if="!isEdit && form.platform !== 'claude-console'">
              <label class="block text-sm font-semibold text-gray-700 mb-3">添加方式</label>
              <div class="flex gap-4">
                <label class="flex items-center cursor-pointer">
                  <input 
                    v-model="form.addType" 
                    type="radio" 
                    value="oauth" 
                    class="mr-2"
                  >
                  <span class="text-sm text-gray-700">OAuth 授权 (推荐)</span>
                </label>
                <label class="flex items-center cursor-pointer">
                  <input 
                    v-model="form.addType" 
                    type="radio" 
                    value="manual" 
                    class="mr-2"
                  >
                  <span class="text-sm text-gray-700">手动输入 Access Token</span>
                </label>
              </div>
            </div>
            
            <div>
              <label class="block text-sm font-semibold text-gray-700 mb-3">账户名称</label>
              <input 
                v-model="form.name" 
                type="text" 
                required 
                class="form-input w-full"
                :class="{ 'border-red-500': errors.name }"
                placeholder="为账户设置一个易识别的名称"
              >
              <p
                v-if="errors.name"
                class="text-red-500 text-xs mt-1"
              >
                {{ errors.name }}
              </p>
            </div>
            
            <div>
              <label class="block text-sm font-semibold text-gray-700 mb-3">描述 (可选)</label>
              <textarea 
                v-model="form.description" 
                rows="3" 
                class="form-input w-full resize-none"
                placeholder="账户用途说明..."
              />
            </div>
            
            <div>
              <label class="block text-sm font-semibold text-gray-700 mb-3">账户类型</label>
              <div class="flex gap-4">
                <label class="flex items-center cursor-pointer">
                  <input 
                    v-model="form.accountType" 
                    type="radio" 
                    value="shared" 
                    class="mr-2"
                  >
                  <span class="text-sm text-gray-700">共享账户</span>
                </label>
                <label class="flex items-center cursor-pointer">
                  <input 
                    v-model="form.accountType" 
                    type="radio" 
                    value="dedicated" 
                    class="mr-2"
                  >
                  <span class="text-sm text-gray-700">专属账户</span>
                </label>
                <label class="flex items-center cursor-pointer">
                  <input 
                    v-model="form.accountType" 
                    type="radio" 
                    value="group" 
                    class="mr-2"
                  >
                  <span class="text-sm text-gray-700">分组调度</span>
                </label>
              </div>
              <p class="text-xs text-gray-500 mt-2">
                共享账户：供所有API Key使用；专属账户：仅供特定API Key使用；分组调度：加入分组供分组内调度
              </p>
            </div>
            
            <!-- 分组选择器 -->
            <div v-if="form.accountType === 'group'">
              <label class="block text-sm font-semibold text-gray-700 mb-3">选择分组 *</label>
              <div class="flex gap-2">
                <select 
                  v-model="form.groupId" 
                  class="form-input flex-1"
                  required
                >
                  <option value="">
                    请选择分组
                  </option>
                  <option 
                    v-for="group in filteredGroups" 
                    :key="group.id" 
                    :value="group.id"
                  >
                    {{ group.name }} ({{ group.memberCount || 0 }} 个成员)
                  </option>
                  <option value="__new__">
                    + 新建分组
                  </option>
                </select>
                <button
                  type="button"
                  class="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  @click="refreshGroups"
                >
                  <i
                    class="fas fa-sync-alt"
                    :class="{ 'animate-spin': loadingGroups }"
                  />
                </button>
              </div>
            </div>
            
            <!-- Gemini 项目 ID 字段 -->
            <div v-if="form.platform === 'gemini'">
              <label class="block text-sm font-semibold text-gray-700 mb-3">项目 ID (可选)</label>
              <input 
                v-model="form.projectId" 
                type="text" 
                class="form-input w-full"
                placeholder="例如：verdant-wares-464411-k9"
              >
              <div class="mt-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <div class="flex items-start gap-2">
                  <i class="fas fa-info-circle text-yellow-600 mt-0.5" />
                  <div class="text-xs text-yellow-700">
                    <p class="font-medium mb-1">
                      Google Cloud/Workspace 账号需要提供项目 ID
                    </p>
                    <p>某些 Google 账号（特别是绑定了 Google Cloud 的账号）会被识别为 Workspace 账号，需要提供额外的项目 ID。</p>
                    <div class="mt-2 p-2 bg-white rounded border border-yellow-300">
                      <p class="font-medium mb-1">
                        如何获取项目 ID：
                      </p>
                      <ol class="list-decimal list-inside space-y-1 ml-2">
                        <li>
                          访问 <a
                            href="https://console.cloud.google.com/welcome"
                            target="_blank"
                            class="text-blue-600 hover:underline font-medium"
                          >Google Cloud Console</a>
                        </li>
                        <li>复制<span class="font-semibold text-red-600">项目 ID（Project ID）</span>，通常是字符串格式</li>
                        <li class="text-red-600">
                          ⚠️ 注意：要复制项目 ID（Project ID），不要复制项目编号（Project Number）！
                        </li>
                      </ol>
                    </div>
                    <p class="mt-2">
                      <strong>提示：</strong>如果您的账号是普通个人账号（未绑定 Google Cloud），请留空此字段。
                    </p>
                  </div>
                </div>
              </div>
            </div>
            
            <!-- Claude Console 特定字段 -->
            <div
              v-if="form.platform === 'claude-console' && !isEdit"
              class="space-y-4"
            >
              <div>
                <label class="block text-sm font-semibold text-gray-700 mb-3">API URL *</label>
                <input 
                  v-model="form.apiUrl" 
                  type="text" 
                  required
                  class="form-input w-full"
                  :class="{ 'border-red-500': errors.apiUrl }"
                  placeholder="例如：https://api.example.com"
                >
                <p
                  v-if="errors.apiUrl"
                  class="text-red-500 text-xs mt-1"
                >
                  {{ errors.apiUrl }}
                </p>
              </div>
              
              <div>
                <label class="block text-sm font-semibold text-gray-700 mb-3">API Key *</label>
                <input 
                  v-model="form.apiKey" 
                  type="password" 
                  required
                  class="form-input w-full"
                  :class="{ 'border-red-500': errors.apiKey }"
                  placeholder="请输入API Key"
                >
                <p
                  v-if="errors.apiKey"
                  class="text-red-500 text-xs mt-1"
                >
                  {{ errors.apiKey }}
                </p>
              </div>
              
              <div>
                <label class="block text-sm font-semibold text-gray-700 mb-3">支持的模型 (可选)--注意,ClaudeCode必须加上hiku模型！</label>
                <div class="mb-2 flex gap-2">
                  <button
                    type="button"
                    class="px-3 py-1 text-xs bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors"
                    @click="addPresetModel('claude-sonnet-4-20250514')"
                  >
                    + claude-sonnet-4-20250514
                  </button>
                  <button
                    type="button"
                    class="px-3 py-1 text-xs bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 transition-colors"
                    @click="addPresetModel('claude-opus-4-20250514')"
                  >
                    + claude-opus-4-20250514
                  </button>
                  <button
                    type="button"
                    class="px-3 py-1 text-xs bg-green-100 text-green-700 rounded-lg hover:bg-purple-200 transition-colors"
                    @click="addPresetModel('claude-3-5-haiku-20241022')"
                  >
                    + claude-3-5-haiku-20241022
                  </button>
                </div>
                <textarea 
                  v-model="form.supportedModels" 
                  rows="3" 
                  class="form-input w-full resize-none"
                  placeholder="每行一个模型，留空表示支持所有模型。特别注意,ClaudeCode必须加上hiku模型！"
                />
                <p class="text-xs text-gray-500 mt-1">
                  留空表示支持所有模型。如果指定模型，请求中的模型不在列表内将不会调度到此账号
                </p>
              </div>
              
              <div>
                <label class="block text-sm font-semibold text-gray-700 mb-3">自定义 User-Agent (可选)</label>
                <input 
                  v-model="form.userAgent" 
                  type="text" 
                  class="form-input w-full"
                  placeholder="默认：claude-cli/1.0.61 (console, cli)"
                >
              </div>
              
              <div>
                <label class="block text-sm font-semibold text-gray-700 mb-3">限流时间 (分钟)</label>
                <input 
                  v-model.number="form.rateLimitDuration" 
                  type="number" 
                  min="1"
                  class="form-input w-full"
                  placeholder="默认60分钟"
                >
                <p class="text-xs text-gray-500 mt-1">
                  当账号返回429错误时，暂停调度的时间（分钟）
                </p>
              </div>
            </div>
            
            <!-- Claude和Claude Console的优先级设置 -->
            <div v-if="(form.platform === 'claude' || form.platform === 'claude-console')">
              <label class="block text-sm font-semibold text-gray-700 mb-3">调度优先级 (1-100)</label>
              <input 
                v-model.number="form.priority" 
                type="number" 
                min="1"
                max="100"
                class="form-input w-full"
                placeholder="数字越小优先级越高，默认50"
              >
              <p class="text-xs text-gray-500 mt-1">
                数字越小优先级越高，建议范围：1-100
              </p>
            </div>
            
            <!-- 手动输入 Token 字段 -->
            <div
              v-if="form.addType === 'manual' && form.platform !== 'claude-console'"
              class="space-y-4 bg-blue-50 p-4 rounded-lg border border-blue-200"
            >
              <div class="flex items-start gap-3 mb-4">
                <div class="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center flex-shrink-0 mt-1">
                  <i class="fas fa-info text-white text-sm" />
                </div>
                <div>
                  <h5 class="font-semibold text-blue-900 mb-2">
                    手动输入 Token
                  </h5>
                  <p
                    v-if="form.platform === 'claude'"
                    class="text-sm text-blue-800 mb-2"
                  >
                    请输入有效的 Claude Access Token。如果您有 Refresh Token，建议也一并填写以支持自动刷新。
                  </p>
                  <p
                    v-else-if="form.platform === 'gemini'"
                    class="text-sm text-blue-800 mb-2"
                  >
                    请输入有效的 Gemini Access Token。如果您有 Refresh Token，建议也一并填写以支持自动刷新。
                  </p>
                  <div class="bg-white/80 rounded-lg p-3 mt-2 mb-2 border border-blue-300">
                    <p class="text-sm text-blue-900 font-medium mb-1">
                      <i class="fas fa-folder-open mr-1" />
                      获取 Access Token 的方法：
                    </p>
                    <p
                      v-if="form.platform === 'claude'"
                      class="text-xs text-blue-800"
                    >
                      请从已登录 Claude Code 的机器上获取 <code class="bg-blue-100 px-1 py-0.5 rounded font-mono">~/.claude/.credentials.json</code> 文件中的凭证，
                      请勿使用 Claude 官网 API Keys 页面的密钥。
                    </p>
                    <p
                      v-else-if="form.platform === 'gemini'"
                      class="text-xs text-blue-800"
                    >
                      请从已登录 Gemini CLI 的机器上获取 <code class="bg-blue-100 px-1 py-0.5 rounded font-mono">~/.config/gemini/credentials.json</code> 文件中的凭证。
                    </p>
                  </div>
                  <p class="text-xs text-blue-600">
                    💡 如果未填写 Refresh Token，Token 过期后需要手动更新。
                  </p>
                </div>
              </div>
              
              <div>
                <label class="block text-sm font-semibold text-gray-700 mb-3">Access Token *</label>
                <textarea 
                  v-model="form.accessToken" 
                  rows="4" 
                  required
                  class="form-input w-full resize-none font-mono text-xs"
                  :class="{ 'border-red-500': errors.accessToken }"
                  placeholder="请输入 Access Token..."
                />
                <p
                  v-if="errors.accessToken"
                  class="text-red-500 text-xs mt-1"
                >
                  {{ errors.accessToken }}
                </p>
              </div>
              
              <div>
                <label class="block text-sm font-semibold text-gray-700 mb-3">Refresh Token (可选)</label>
                <textarea 
                  v-model="form.refreshToken" 
                  rows="4" 
                  class="form-input w-full resize-none font-mono text-xs"
                  placeholder="请输入 Refresh Token..."
                />
              </div>
            </div>
            
            <!-- 代理设置 -->
            <ProxyConfig v-model="form.proxy" />
            
            <div class="flex gap-3 pt-4">
              <button 
                type="button" 
                class="flex-1 px-6 py-3 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200 transition-colors" 
                @click="$emit('close')"
              >
                取消
              </button>
              <button 
                v-if="form.addType === 'oauth' && form.platform !== 'claude-console'"
                type="button" 
                :disabled="loading"
                class="btn btn-primary flex-1 py-3 px-6 font-semibold"
                @click="nextStep"
              >
                下一步
              </button>
              <button 
                v-else
                type="button" 
                :disabled="loading"
                class="btn btn-primary flex-1 py-3 px-6 font-semibold"
                @click="createAccount"
              >
                <div
                  v-if="loading"
                  class="loading-spinner mr-2"
                />
                {{ loading ? '创建中...' : '创建' }}
              </button>
            </div>
          </div>
        </div>
        
        <!-- 步骤2: OAuth授权 -->
        <OAuthFlow 
          v-if="oauthStep === 2 && form.addType === 'oauth'"
          :platform="form.platform"
          :proxy="form.proxy"
          @success="handleOAuthSuccess"
          @back="oauthStep = 1"
        />
        
        <!-- 编辑模式 -->
        <div
          v-if="isEdit"
          class="space-y-6"
        >
          <!-- 基本信息 -->
          <div>
            <label class="block text-sm font-semibold text-gray-700 mb-3">账户名称</label>
            <input 
              v-model="form.name" 
              type="text" 
              required 
              class="form-input w-full"
              placeholder="为账户设置一个易识别的名称"
            >
          </div>
          
          <div>
            <label class="block text-sm font-semibold text-gray-700 mb-3">描述 (可选)</label>
            <textarea 
              v-model="form.description" 
              rows="3" 
              class="form-input w-full resize-none"
              placeholder="账户用途说明..."
            />
          </div>
          
          <div>
            <label class="block text-sm font-semibold text-gray-700 mb-3">账户类型</label>
            <div class="flex gap-4">
              <label class="flex items-center cursor-pointer">
                <input 
                  v-model="form.accountType" 
                  type="radio" 
                  value="shared" 
                  class="mr-2"
                >
                <span class="text-sm text-gray-700">共享账户</span>
              </label>
              <label class="flex items-center cursor-pointer">
                <input 
                  v-model="form.accountType" 
                  type="radio" 
                  value="dedicated" 
                  class="mr-2"
                >
                <span class="text-sm text-gray-700">专属账户</span>
              </label>
              <label class="flex items-center cursor-pointer">
                <input 
                  v-model="form.accountType" 
                  type="radio" 
                  value="group" 
                  class="mr-2"
                >
                <span class="text-sm text-gray-700">分组调度</span>
              </label>
            </div>
            <p class="text-xs text-gray-500 mt-2">
              共享账户：供所有API Key使用；专属账户：仅供特定API Key使用；分组调度：加入分组供分组内调度
            </p>
          </div>
          
          <!-- 分组选择器 -->
          <div v-if="form.accountType === 'group'">
            <label class="block text-sm font-semibold text-gray-700 mb-3">选择分组 *</label>
            <div class="flex gap-2">
              <select 
                v-model="form.groupId" 
                class="form-input flex-1"
                required
              >
                <option value="">
                  请选择分组
                </option>
                <option 
                  v-for="group in filteredGroups" 
                  :key="group.id" 
                  :value="group.id"
                >
                  {{ group.name }} ({{ group.memberCount || 0 }} 个成员)
                </option>
                <option value="__new__">
                  + 新建分组
                </option>
              </select>
              <button
                type="button"
                class="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                @click="refreshGroups"
              >
                <i
                  class="fas fa-sync-alt"
                  :class="{ 'animate-spin': loadingGroups }"
                />
              </button>
            </div>
          </div>
          
          <!-- Gemini 项目 ID 字段 -->
          <div v-if="form.platform === 'gemini'">
            <label class="block text-sm font-semibold text-gray-700 mb-3">项目 ID (可选)</label>
            <input 
              v-model="form.projectId" 
              type="text" 
              class="form-input w-full"
              placeholder="例如：verdant-wares-464411-k9"
            >
            <p class="text-xs text-gray-500 mt-2">
              Google Cloud/Workspace 账号可能需要提供项目 ID
            </p>
          </div>
          
          <!-- Claude和Claude Console的优先级设置（编辑模式） -->
          <div v-if="(form.platform === 'claude' || form.platform === 'claude-console')">
            <label class="block text-sm font-semibold text-gray-700 mb-3">调度优先级 (1-100)</label>
            <input 
              v-model.number="form.priority" 
              type="number" 
              min="1"
              max="100"
              class="form-input w-full"
              placeholder="数字越小优先级越高"
            >
            <p class="text-xs text-gray-500 mt-1">
              数字越小优先级越高，建议范围：1-100
            </p>
          </div>
          
          <!-- Claude Console 特定字段（编辑模式）-->
          <div
            v-if="form.platform === 'claude-console'"
            class="space-y-4"
          >
            <div>
              <label class="block text-sm font-semibold text-gray-700 mb-3">API URL</label>
              <input 
                v-model="form.apiUrl" 
                type="text" 
                required
                class="form-input w-full"
                placeholder="例如：https://api.example.com"
              >
            </div>
            
            <div>
              <label class="block text-sm font-semibold text-gray-700 mb-3">API Key</label>
              <input 
                v-model="form.apiKey" 
                type="password" 
                class="form-input w-full"
                placeholder="留空表示不更新"
              >
              <p class="text-xs text-gray-500 mt-1">
                留空表示不更新 API Key
              </p>
            </div>
            
            <div>
              <label class="block text-sm font-semibold text-gray-700 mb-3">支持的模型 (可选)</label>
              <div class="mb-2 flex gap-2">
                <button
                  type="button"
                  class="px-3 py-1 text-xs bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors"
                  @click="addPresetModel('claude-sonnet-4-20250514')"
                >
                  + claude-sonnet-4-20250514
                </button>
                <button
                  type="button"
                  class="px-3 py-1 text-xs bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 transition-colors"
                  @click="addPresetModel('claude-opus-4-20250514')"
                >
                  + claude-opus-4-20250514
                </button>
                <button
                  type="button"
                  class="px-3 py-1 text-xs bg-green-100 text-green-700 rounded-lg hover:bg-purple-200 transition-colors"
                  @click="addPresetModel('claude-3-5-haiku-20241022')"
                >
                  + claude-3-5-haiku-20241022
                </button>
              </div>
              <textarea 
                v-model="form.supportedModels" 
                rows="3" 
                class="form-input w-full resize-none"
                placeholder="每行一个模型，留空表示支持所有模型。特别注意,ClaudeCode必须加上hiku模型！"
              />
            </div>
            
            <div>
              <label class="block text-sm font-semibold text-gray-700 mb-3">自定义 User-Agent (可选)</label>
              <input 
                v-model="form.userAgent" 
                type="text" 
                class="form-input w-full"
                placeholder="默认：claude-cli/1.0.61 (console, cli)"
              >
            </div>
            
            <div>
              <label class="block text-sm font-semibold text-gray-700 mb-3">限流时间 (分钟)</label>
              <input 
                v-model.number="form.rateLimitDuration" 
                type="number" 
                min="1"
                class="form-input w-full"
              >
            </div>
          </div>
          
          <!-- Token 更新 -->
          <div
            v-if="form.platform !== 'claude-console'"
            class="bg-amber-50 p-4 rounded-lg border border-amber-200"
          >
            <div class="flex items-start gap-3 mb-4">
              <div class="w-8 h-8 bg-amber-500 rounded-lg flex items-center justify-center flex-shrink-0 mt-1">
                <i class="fas fa-key text-white text-sm" />
              </div>
              <div>
                <h5 class="font-semibold text-amber-900 mb-2">
                  更新 Token
                </h5>
                <p class="text-sm text-amber-800 mb-2">
                  可以更新 Access Token 和 Refresh Token。为了安全起见，不会显示当前的 Token 值。
                </p>
                <p class="text-xs text-amber-600">
                  💡 留空表示不更新该字段。
                </p>
              </div>
            </div>
            
            <div class="space-y-4">
              <div>
                <label class="block text-sm font-semibold text-gray-700 mb-3">新的 Access Token</label>
                <textarea 
                  v-model="form.accessToken" 
                  rows="4" 
                  class="form-input w-full resize-none font-mono text-xs"
                  placeholder="留空表示不更新..."
                />
              </div>
              
              <div>
                <label class="block text-sm font-semibold text-gray-700 mb-3">新的 Refresh Token</label>
                <textarea 
                  v-model="form.refreshToken" 
                  rows="4" 
                  class="form-input w-full resize-none font-mono text-xs"
                  placeholder="留空表示不更新..."
                />
              </div>
            </div>
          </div>
          
          <!-- 代理设置 -->
          <ProxyConfig v-model="form.proxy" />
          
          <div class="flex gap-3 pt-4">
            <button 
              type="button" 
              class="flex-1 px-6 py-3 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200 transition-colors" 
              @click="$emit('close')"
            >
              取消
            </button>
            <button 
              type="button" 
              :disabled="loading"
              class="btn btn-primary flex-1 py-3 px-6 font-semibold"
              @click="updateAccount"
            >
              <div
                v-if="loading"
                class="loading-spinner mr-2"
              />
              {{ loading ? '更新中...' : '更新' }}
            </button>
          </div>
        </div>
      </div>
    </div>
    
    <!-- 确认弹窗 -->
    <ConfirmModal
      :show="showConfirmModal"
      :title="confirmOptions.title"
      :message="confirmOptions.message"
      :confirm-text="confirmOptions.confirmText"
      :cancel-text="confirmOptions.cancelText"
      @confirm="handleConfirm"
      @cancel="handleCancel"
    />
    
    <!-- 分组管理模态框 -->
    <GroupManagementModal
      v-if="showGroupManagement"
      @close="showGroupManagement = false"
      @refresh="handleGroupRefresh"
    />
  </Teleport>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { showToast } from '@/utils/toast'
import { apiClient } from '@/config/api'
import { useAccountsStore } from '@/stores/accounts'
import { useConfirm } from '@/composables/useConfirm'
import ProxyConfig from './ProxyConfig.vue'
import OAuthFlow from './OAuthFlow.vue'
import ConfirmModal from '@/components/common/ConfirmModal.vue'
import GroupManagementModal from './GroupManagementModal.vue'

const props = defineProps({
  account: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['close', 'success'])

const accountsStore = useAccountsStore()
const { showConfirmModal, confirmOptions, showConfirm, handleConfirm, handleCancel } = useConfirm()

// 是否为编辑模式
const isEdit = computed(() => !!props.account)
const show = ref(true)

// OAuth步骤
const oauthStep = ref(1)
const loading = ref(false)

// 初始化代理配置
const initProxyConfig = () => {
  if (props.account?.proxy && props.account.proxy.host && props.account.proxy.port) {
    return {
      enabled: true,
      type: props.account.proxy.type || 'socks5',
      host: props.account.proxy.host,
      port: props.account.proxy.port,
      username: props.account.proxy.username || '',
      password: props.account.proxy.password || ''
    }
  }
  return {
    enabled: false,
    type: 'socks5',
    host: '',
    port: '',
    username: '',
    password: ''
  }
}

// 表单数据
const form = ref({
  platform: props.account?.platform || 'claude',
  addType: 'oauth',
  name: props.account?.name || '',
  description: props.account?.description || '',
  accountType: props.account?.accountType || 'shared',
  groupId: '',
  projectId: props.account?.projectId || '',
  accessToken: '',
  refreshToken: '',
  proxy: initProxyConfig(),
  // Claude Console 特定字段
  apiUrl: props.account?.apiUrl || '',
  apiKey: props.account?.apiKey || '',
  priority: props.account?.priority || 50,
  supportedModels: (() => {
    const models = props.account?.supportedModels;
    if (!models) return '';
    // 处理对象格式（Claude Console 的新格式）
    if (typeof models === 'object' && !Array.isArray(models)) {
      return Object.keys(models).join('\n');
    }
    // 处理数组格式（向后兼容）
    if (Array.isArray(models)) {
      return models.join('\n');
    }
    return '';
  })(),
  userAgent: props.account?.userAgent || '',
  rateLimitDuration: props.account?.rateLimitDuration || 60
})

// 表单验证错误
const errors = ref({
  name: '',
  accessToken: '',
  apiUrl: '',
  apiKey: ''
})

// 计算是否可以进入下一步
const canProceed = computed(() => {
  return form.value.name?.trim() && form.value.platform
})

// 计算是否可以创建
const canCreate = computed(() => {
  if (form.value.addType === 'manual') {
    return form.value.name?.trim() && form.value.accessToken?.trim()
  }
  return form.value.name?.trim()
})

// 下一步
const nextStep = async () => {
  // 清除之前的错误
  errors.value.name = ''
  
  if (!canProceed.value) {
    if (!form.value.name || form.value.name.trim() === '') {
      errors.value.name = '请填写账户名称'
    }
    return
  }
  
  // 分组类型验证
  if (form.value.accountType === 'group' && (!form.value.groupId || form.value.groupId.trim() === '')) {
    showToast('请选择一个分组', 'error')
    return
  }
  
  // 对于Gemini账户，检查项目 ID
  if (form.value.platform === 'gemini' && oauthStep.value === 1 && form.value.addType === 'oauth') {
    if (!form.value.projectId || form.value.projectId.trim() === '') {
      // 使用自定义确认弹窗
      const confirmed = await showConfirm(
        '项目 ID 未填写',
        '您尚未填写项目 ID。\n\n如果您的Google账号绑定了Google Cloud或被识别为Workspace账号，需要提供项目 ID。\n如果您使用的是普通个人账号，可以继续不填写。',
        '继续',
        '返回填写'
      )
      if (!confirmed) {
        return
      }
    }
  }
  
  oauthStep.value = 2
}

// 处理OAuth成功
const handleOAuthSuccess = async (tokenInfo) => {
  loading.value = true
  try {
    const data = {
      name: form.value.name,
      description: form.value.description,
      accountType: form.value.accountType,
      groupId: form.value.accountType === 'group' ? form.value.groupId : undefined,
      proxy: form.value.proxy.enabled ? {
        type: form.value.proxy.type,
        host: form.value.proxy.host,
        port: parseInt(form.value.proxy.port),
        username: form.value.proxy.username || null,
        password: form.value.proxy.password || null
      } : null
    }
    
    if (form.value.platform === 'claude') {
      // Claude使用claudeAiOauth字段
      data.claudeAiOauth = tokenInfo.claudeAiOauth || tokenInfo
      data.priority = form.value.priority || 50
    } else if (form.value.platform === 'gemini') {
      // Gemini使用geminiOauth字段
      data.geminiOauth = tokenInfo.tokens || tokenInfo
      if (form.value.projectId) {
        data.projectId = form.value.projectId
      }
    }
    
    let result
    if (form.value.platform === 'claude') {
      result = await accountsStore.createClaudeAccount(data)
    } else {
      result = await accountsStore.createGeminiAccount(data)
    }
    
    emit('success', result)
  } catch (error) {
    showToast(error.message || '账户创建失败', 'error')
  } finally {
    loading.value = false
  }
}

// 创建账户（手动模式）
const createAccount = async () => {
  // 清除之前的错误
  errors.value.name = ''
  errors.value.accessToken = ''
  errors.value.apiUrl = ''
  errors.value.apiKey = ''
  
  let hasError = false
  
  if (!form.value.name || form.value.name.trim() === '') {
    errors.value.name = '请填写账户名称'
    hasError = true
  }
  
  // Claude Console 验证
  if (form.value.platform === 'claude-console') {
    if (!form.value.apiUrl || form.value.apiUrl.trim() === '') {
      errors.value.apiUrl = '请填写 API URL'
      hasError = true
    }
    if (!form.value.apiKey || form.value.apiKey.trim() === '') {
      errors.value.apiKey = '请填写 API Key'
      hasError = true
    }
  } else if (form.value.addType === 'manual' && (!form.value.accessToken || form.value.accessToken.trim() === '')) {
    errors.value.accessToken = '请填写 Access Token'
    hasError = true
  }
  
  // 分组类型验证
  if (form.value.accountType === 'group' && (!form.value.groupId || form.value.groupId.trim() === '')) {
    showToast('请选择一个分组', 'error')
    hasError = true
  }
  
  if (hasError) {
    return
  }
  
  loading.value = true
  try {
    const data = {
      name: form.value.name,
      description: form.value.description,
      accountType: form.value.accountType,
      groupId: form.value.accountType === 'group' ? form.value.groupId : undefined,
      proxy: form.value.proxy.enabled ? {
        type: form.value.proxy.type,
        host: form.value.proxy.host,
        port: parseInt(form.value.proxy.port),
        username: form.value.proxy.username || null,
        password: form.value.proxy.password || null
      } : null
    }
    
    if (form.value.platform === 'claude') {
      // Claude手动模式需要构建claudeAiOauth对象
      const expiresInMs = form.value.refreshToken 
        ? (10 * 60 * 1000) // 10分钟
        : (365 * 24 * 60 * 60 * 1000) // 1年
      
      data.claudeAiOauth = {
        accessToken: form.value.accessToken,
        refreshToken: form.value.refreshToken || '',
        expiresAt: Date.now() + expiresInMs,
        scopes: ['user:inference']
      }
      data.priority = form.value.priority || 50
    } else if (form.value.platform === 'gemini') {
      // Gemini手动模式需要构建geminiOauth对象
      const expiresInMs = form.value.refreshToken 
        ? (10 * 60 * 1000) // 10分钟
        : (365 * 24 * 60 * 60 * 1000) // 1年
      
      data.geminiOauth = {
        access_token: form.value.accessToken,
        refresh_token: form.value.refreshToken || '',
        scope: 'https://www.googleapis.com/auth/cloud-platform',
        token_type: 'Bearer',
        expiry_date: Date.now() + expiresInMs
      }
      
      if (form.value.projectId) {
        data.projectId = form.value.projectId
      }
    } else if (form.value.platform === 'claude-console') {
      // Claude Console 账户特定数据
      data.apiUrl = form.value.apiUrl
      data.apiKey = form.value.apiKey
      data.priority = form.value.priority || 50
      data.supportedModels = form.value.supportedModels
        ? form.value.supportedModels.split('\n').filter(m => m.trim())
        : []
      data.userAgent = form.value.userAgent || null
      data.rateLimitDuration = form.value.rateLimitDuration || 60
    }
    
    let result
    if (form.value.platform === 'claude') {
      result = await accountsStore.createClaudeAccount(data)
    } else if (form.value.platform === 'claude-console') {
      result = await accountsStore.createClaudeConsoleAccount(data)
    } else {
      result = await accountsStore.createGeminiAccount(data)
    }
    
    emit('success', result)
  } catch (error) {
    showToast(error.message || '账户创建失败', 'error')
  } finally {
    loading.value = false
  }
}

// 更新账户
const updateAccount = async () => {
  // 清除之前的错误
  errors.value.name = ''
  
  // 验证账户名称
  if (!form.value.name || form.value.name.trim() === '') {
    errors.value.name = '请填写账户名称'
    return
  }
  
  // 分组类型验证
  if (form.value.accountType === 'group' && (!form.value.groupId || form.value.groupId.trim() === '')) {
    showToast('请选择一个分组', 'error')
    return
  }
  
  // 对于Gemini账户，检查项目 ID
  if (form.value.platform === 'gemini') {
    if (!form.value.projectId || form.value.projectId.trim() === '') {
      // 使用自定义确认弹窗
      const confirmed = await showConfirm(
        '项目 ID 未填写',
        '您尚未填写项目 ID。\n\n如果您的Google账号绑定了Google Cloud或被识别为Workspace账号，需要提供项目 ID。\n如果您使用的是普通个人账号，可以继续不填写。',
        '继续保存',
        '返回填写'
      )
      if (!confirmed) {
        return
      }
    }
  }
  
  loading.value = true
  try {
    const data = {
      name: form.value.name,
      description: form.value.description,
      accountType: form.value.accountType,
      groupId: form.value.accountType === 'group' ? form.value.groupId : undefined,
      proxy: form.value.proxy.enabled ? {
        type: form.value.proxy.type,
        host: form.value.proxy.host,
        port: parseInt(form.value.proxy.port),
        username: form.value.proxy.username || null,
        password: form.value.proxy.password || null
      } : null
    }
    
    // 只有非空时才更新token
    if (form.value.accessToken || form.value.refreshToken) {
      if (props.account.platform === 'claude') {
        // Claude需要构建claudeAiOauth对象
        const expiresInMs = form.value.refreshToken 
          ? (10 * 60 * 1000) // 10分钟
          : (365 * 24 * 60 * 60 * 1000) // 1年
        
        data.claudeAiOauth = {
          accessToken: form.value.accessToken || '',
          refreshToken: form.value.refreshToken || '',
          expiresAt: Date.now() + expiresInMs,
          scopes: ['user:inference']
        }
      } else if (props.account.platform === 'gemini') {
        // Gemini需要构建geminiOauth对象
        const expiresInMs = form.value.refreshToken 
          ? (10 * 60 * 1000) // 10分钟
          : (365 * 24 * 60 * 60 * 1000) // 1年
        
        data.geminiOauth = {
          access_token: form.value.accessToken || '',
          refresh_token: form.value.refreshToken || '',
          scope: 'https://www.googleapis.com/auth/cloud-platform',
          token_type: 'Bearer',
          expiry_date: Date.now() + expiresInMs
        }
      }
    }
    
    if (props.account.platform === 'gemini' && form.value.projectId) {
      data.projectId = form.value.projectId
    }
    
    // Claude 官方账号优先级更新
    if (props.account.platform === 'claude') {
      data.priority = form.value.priority || 50
    }
    
    // Claude Console 特定更新
    if (props.account.platform === 'claude-console') {
      data.apiUrl = form.value.apiUrl
      if (form.value.apiKey) {
        data.apiKey = form.value.apiKey
      }
      data.priority = form.value.priority || 50
      data.supportedModels = form.value.supportedModels
        ? form.value.supportedModels.split('\n').filter(m => m.trim())
        : []
      data.userAgent = form.value.userAgent || null
      data.rateLimitDuration = form.value.rateLimitDuration || 60
    }
    
    if (props.account.platform === 'claude') {
      await accountsStore.updateClaudeAccount(props.account.id, data)
    } else if (props.account.platform === 'claude-console') {
      await accountsStore.updateClaudeConsoleAccount(props.account.id, data)
    } else {
      await accountsStore.updateGeminiAccount(props.account.id, data)
    }
    
    emit('success')
  } catch (error) {
    showToast(error.message || '账户更新失败', 'error')
  } finally {
    loading.value = false
  }
}

// 监听表单名称变化，清除错误
watch(() => form.value.name, () => {
  if (errors.value.name && form.value.name?.trim()) {
    errors.value.name = ''
  }
})

// 监听Access Token变化，清除错误
watch(() => form.value.accessToken, () => {
  if (errors.value.accessToken && form.value.accessToken?.trim()) {
    errors.value.accessToken = ''
  }
})

// 监听API URL变化，清除错误
watch(() => form.value.apiUrl, () => {
  if (errors.value.apiUrl && form.value.apiUrl?.trim()) {
    errors.value.apiUrl = ''
  }
})

// 监听API Key变化，清除错误
watch(() => form.value.apiKey, () => {
  if (errors.value.apiKey && form.value.apiKey?.trim()) {
    errors.value.apiKey = ''
  }
})

// 分组相关数据
const groups = ref([])
const loadingGroups = ref(false)
const showGroupManagement = ref(false)

// 根据平台筛选分组
const filteredGroups = computed(() => {
  const platformFilter = form.value.platform === 'claude-console' ? 'claude' : form.value.platform
  return groups.value.filter(g => g.platform === platformFilter)
})

// 加载分组列表
const loadGroups = async () => {
  loadingGroups.value = true
  try {
    const response = await apiClient.get('/admin/account-groups')
    groups.value = response.data || []
  } catch (error) {
    showToast('加载分组列表失败', 'error')
    groups.value = []
  } finally {
    loadingGroups.value = false
  }
}

// 刷新分组列表
const refreshGroups = async () => {
  await loadGroups()
  showToast('分组列表已刷新', 'success')
}

// 处理分组管理模态框刷新
const handleGroupRefresh = async () => {
  await loadGroups()
}

// 监听平台变化，重置表单
watch(() => form.value.platform, (newPlatform, oldPlatform) => {
  // 处理添加方式的自动切换
  if (newPlatform === 'claude-console') {
    form.value.addType = 'manual' // Claude Console 只支持手动模式
  } else if (oldPlatform === 'claude-console' && (newPlatform === 'claude' || newPlatform === 'gemini')) {
    // 从 Claude Console 切换到其他平台时，恢复为 OAuth
    form.value.addType = 'oauth'
  }
  
  // 平台变化时，清空分组选择
  if (form.value.accountType === 'group') {
    form.value.groupId = ''
  }
})

// 监听账户类型变化
watch(() => form.value.accountType, (newType) => {
  if (newType === 'group') {
    // 如果选择分组类型，加载分组列表
    if (groups.value.length === 0) {
      loadGroups()
    }
  }
})

// 监听分组选择
watch(() => form.value.groupId, (newGroupId) => {
  if (newGroupId === '__new__') {
    // 触发创建新分组
    form.value.groupId = ''
    showGroupManagement.value = true
  }
})

// 添加预设模型
const addPresetModel = (modelName) => {
  // 获取当前模型列表
  const currentModels = form.value.supportedModels
    ? form.value.supportedModels.split('\n').filter(m => m.trim())
    : []
  
  // 检查是否已存在
  if (currentModels.includes(modelName)) {
    showToast(`模型 ${modelName} 已存在`, 'info')
    return
  }
  
  // 添加到列表
  currentModels.push(modelName)
  form.value.supportedModels = currentModels.join('\n')
  showToast(`已添加模型 ${modelName}`, 'success')
}

// 监听账户变化，更新表单
watch(() => props.account, (newAccount) => {
  if (newAccount) {
    // 重新初始化代理配置
    const proxyConfig = newAccount.proxy && newAccount.proxy.host && newAccount.proxy.port
      ? {
          enabled: true,
          type: newAccount.proxy.type || 'socks5',
          host: newAccount.proxy.host,
          port: newAccount.proxy.port,
          username: newAccount.proxy.username || '',
          password: newAccount.proxy.password || ''
        }
      : {
          enabled: false,
          type: 'socks5',
          host: '',
          port: '',
          username: '',
          password: ''
        }
    
    form.value = {
      platform: newAccount.platform,
      addType: 'oauth',
      name: newAccount.name,
      description: newAccount.description || '',
      accountType: newAccount.accountType || 'shared',
      groupId: '',
      projectId: newAccount.projectId || '',
      accessToken: '',
      refreshToken: '',
      proxy: proxyConfig,
      // Claude Console 特定字段
      apiUrl: newAccount.apiUrl || '',
      apiKey: '',  // 编辑模式不显示现有的 API Key
      priority: newAccount.priority || 50,
      supportedModels: (() => {
        const models = newAccount.supportedModels;
        if (!models) return '';
        // 处理对象格式（Claude Console 的新格式）
        if (typeof models === 'object' && !Array.isArray(models)) {
          return Object.keys(models).join('\n');
        }
        // 处理数组格式（向后兼容）
        if (Array.isArray(models)) {
          return models.join('\n');
        }
        return '';
      })(),
      userAgent: newAccount.userAgent || '',
      rateLimitDuration: newAccount.rateLimitDuration || 60
    }
    
    // 如果是分组类型，加载分组ID
    if (newAccount.accountType === 'group') {
      // 先加载分组列表
      loadGroups().then(() => {
        // 如果账户有 groupInfo，直接使用它的 groupId
        if (newAccount.groupInfo && newAccount.groupInfo.id) {
          form.value.groupId = newAccount.groupInfo.id
        } else {
          // 否则查找账户所属的分组
          groups.value.forEach(group => {
            apiClient.get(`/admin/account-groups/${group.id}/members`).then(response => {
              const members = response.data || []
              if (members.some(m => m.id === newAccount.id)) {
                form.value.groupId = group.id
              }
            }).catch(() => {})
          })
        }
      })
    }
  }
}, { immediate: true })
</script>