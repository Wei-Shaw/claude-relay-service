<template>
  <div class="api-input-wide-card mb-8 rounded-3xl p-6 shadow-xl">
    <!-- 标题区域 -->
    <div class="wide-card-title mb-6">
      <h2 class="mb-2 text-2xl font-bold text-gray-900 dark:text-gray-200">
        <i class="fas fa-chart-line mr-3" />
        使用统计查询
      </h2>
      <p class="text-base text-gray-600 dark:text-gray-400">查询您的 API Key 使用情况和统计数据</p>
    </div>

    <!-- 输入区域 -->
    <div class="mx-auto max-w-4xl">
      <!-- 控制栏 -->
      <div class="control-bar mb-4 flex flex-wrap items-center justify-between gap-3">
        <!-- API Key 标签 -->
        <label class="text-sm font-medium text-gray-700 dark:text-gray-300">
          <i class="fas fa-key mr-2" />
          {{ multiKeyMode ? '输入您的 API Keys（每行一个或用逗号分隔）' : '输入您的 API Key' }}
        </label>

        <!-- 模式切换和查询按钮组 -->
        <div class="button-group flex items-center gap-2">
          <!-- 模式切换 -->
          <div
            class="mode-switch-group flex items-center rounded-lg bg-gray-100 p-1 dark:bg-gray-800"
          >
            <button
              class="mode-switch-btn"
              :class="{ active: !multiKeyMode }"
              title="单一模式"
              @click="multiKeyMode = false"
            >
              <i class="fas fa-key" />
              <span class="ml-2 hidden sm:inline">单一</span>
            </button>
            <button
              class="mode-switch-btn"
              :class="{ active: multiKeyMode }"
              title="聚合模式"
              @click="multiKeyMode = true"
            >
              <i class="fas fa-layer-group" />
              <span class="ml-2 hidden sm:inline">聚合</span>
              <span
                v-if="multiKeyMode && parsedApiKeys.length > 0"
                class="ml-1 rounded-full bg-white/20 px-1.5 py-0.5 text-xs font-semibold"
              >
                {{ parsedApiKeys.length }}
              </span>
            </button>
          </div>
        </div>
      </div>

      <div class="api-input-grid grid grid-cols-1 gap-4 lg:grid-cols-4">
        <!-- API Key 输入 -->
        <div class="lg:col-span-3">
          <!-- 单 Key 模式输入框 -->
          <div v-if="!multiKeyMode" class="relative">
            <input
              v-model="apiKey"
              class="wide-card-input w-full pr-10"
              :disabled="loading"
              placeholder="请输入您的 API Key (cr_...)"
              :type="showPassword ? 'text' : 'password'"
              @keyup.enter="queryStats"
            />
            <button
              class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
              type="button"
              @click="showPassword = !showPassword"
            >
              <i :class="showPassword ? 'fas fa-eye-slash' : 'fas fa-eye'" />
            </button>
          </div>

          <!-- 多 Key 模式输入框 -->
          <div v-else class="relative">
            <textarea
              v-model="apiKey"
              class="wide-card-input w-full resize-y"
              :disabled="loading"
              placeholder="请输入您的 API Keys，支持以下格式：&#10;cr_xxx&#10;cr_yyy&#10;或&#10;cr_xxx, cr_yyy"
              rows="4"
              @keyup.ctrl.enter="queryStats"
            />
            <button
              v-if="apiKey && !loading"
              class="absolute right-2 top-2 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
              title="清空输入"
              @click="clearInput"
            >
              <i class="fas fa-times-circle" />
            </button>
          </div>
        </div>

        <!-- 查询按钮 -->
        <div class="lg:col-span-1">
          <button
            class="btn btn-primary btn-query flex h-full w-full items-center justify-center gap-2"
            :disabled="loading || !hasValidInput"
            @click="queryStats"
          >
            <i v-if="loading" class="fas fa-spinner loading-spinner" />
            <i v-else class="fas fa-search" />
            {{ loading ? '查询中...' : '查询统计' }}
          </button>
        </div>
      </div>

      <!-- 安全提示 -->
      <div class="security-notice mt-4">
        <i class="fas fa-shield-alt mr-2" />
        {{
          multiKeyMode
            ? '您的 API Keys 仅用于查询统计数据，不会被存储。聚合模式下部分个体化信息将不显示。'
            : '您的 API Key 仅用于查询自己的统计数据，不会被存储或用于其他用途'
        }}
      </div>

      <!-- 多 Key 模式额外提示 -->
      <div
        v-if="multiKeyMode"
        class="mt-2 rounded-lg bg-blue-50 p-3 text-sm text-blue-700 dark:bg-blue-900/20 dark:text-blue-400"
      >
        <i class="fas fa-lightbulb mr-2" />
        <span>提示：最多支持同时查询 30 个 API Keys。使用 Ctrl+Enter 快速查询。</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useApiStatsStore } from '@/stores/apistats'

const apiStatsStore = useApiStatsStore()
const { apiKey, loading, multiKeyMode } = storeToRefs(apiStatsStore)
const { queryStats, clearInput } = apiStatsStore

const showPassword = ref(false)

// 解析输入的 API Keys
const parsedApiKeys = computed(() => {
  if (!multiKeyMode.value || !apiKey.value) return []

  // 支持逗号和换行符分隔
  const keys = apiKey.value
    .split(/[,\n]+/)
    .map((key) => key.trim())
    .filter((key) => key.length > 0)

  // 去重并限制最多30个
  const uniqueKeys = [...new Set(keys)]
  return uniqueKeys.slice(0, 30)
})

// 判断是否有有效输入
const hasValidInput = computed(() => {
  if (multiKeyMode.value) {
    return parsedApiKeys.value.length > 0
  }
  return apiKey.value && apiKey.value.trim().length > 0
})
</script>

<style scoped>
/* 宽卡片样式 - 使用CSS变量 */
.api-input-wide-card {
  background: var(--surface-color);
  backdrop-filter: blur(25px);
  border: 1px solid var(--border-color);
  box-shadow:
    0 25px 50px -12px rgba(0, 0, 0, 0.25),
    0 0 0 1px rgba(255, 255, 255, 0.05),
    inset 0 1px 0 rgba(255, 255, 255, 0.1);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

/* 暗夜模式宽卡片样式 */
:global(.dark) .api-input-wide-card {
  box-shadow:
    0 25px 50px -12px rgba(0, 0, 0, 0.6),
    0 0 0 1px rgba(75, 85, 99, 0.2),
    inset 0 1px 0 rgba(107, 114, 128, 0.15);
}

.api-input-wide-card:hover {
  box-shadow:
    0 32px 64px -12px rgba(0, 0, 0, 0.35),
    0 0 0 1px rgba(255, 255, 255, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.15);
  transform: translateY(-1px);
}

:global(.dark) .api-input-wide-card:hover {
  box-shadow:
    0 32px 64px -12px rgba(0, 0, 0, 0.7),
    0 0 0 1px rgba(75, 85, 99, 0.25),
    inset 0 1px 0 rgba(107, 114, 128, 0.3) !important;
}

/* 标题样式 */
.wide-card-title h2 {
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
  font-weight: 700;
}

:global(.dark) .wide-card-title h2 {
  color: #f9fafb;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
}

.wide-card-title p {
  color: #6b7280;
  text-shadow: 0 1px 1px rgba(0, 0, 0, 0.05);
}

:global(.dark) .wide-card-title p {
  color: #9ca3af;
  text-shadow: 0 1px 1px rgba(0, 0, 0, 0.2);
}

.wide-card-title .fas.fa-chart-line {
  color: #3b82f6;
  text-shadow: 0 1px 2px rgba(59, 130, 246, 0.2);
}

/* 网格布局 */
.api-input-grid {
  align-items: end;
  gap: 1rem;
}

/* 输入框样式 - 使用CSS变量 */
.wide-card-input {
  background: var(--input-bg);
  border: 2px solid var(--input-border);
  border-radius: 12px;
  padding: 14px 16px;
  font-size: 16px;
  transition: all 0.3s ease;
  backdrop-filter: blur(10px);
  color: var(--text-primary);
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
}

:global(.dark) .wide-card-input {
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.4);
  color: #e5e7eb;
}

.wide-card-input::placeholder {
  color: #9ca3af;
}

:global(.dark) .wide-card-input::placeholder {
  color: #64748b;
}

.wide-card-input:focus {
  outline: none;
  border-color: #60a5fa;
  box-shadow:
    0 0 0 3px rgba(96, 165, 250, 0.2),
    0 10px 15px -3px rgba(0, 0, 0, 0.1);
  background: white;
  color: #1f2937;
}

:global(.dark) .wide-card-input:focus {
  border-color: var(--primary-color);
  box-shadow:
    0 0 0 3px rgba(var(--primary-rgb), 0.15),
    0 10px 15px -3px rgba(0, 0, 0, 0.4);
  background: var(--glass-strong-color);
  color: #f3f4f6;
}

/* 按钮样式 */
.btn {
  font-weight: 500;
  border-radius: 12px;
  border: none;
  cursor: pointer;
  transition: all 0.3s ease;
  position: relative;
  overflow: hidden;
  letter-spacing: 0.025em;
}

/* 查询按钮特定样式 */
.btn-query {
  padding: 14px 24px;
  font-size: 16px;
}

.btn-primary {
  background: linear-gradient(135deg, var(--primary-color) 0%, var(--secondary-color) 100%);
  color: white;
  box-shadow:
    0 10px 15px -3px rgba(var(--primary-rgb), 0.3),
    0 4px 6px -2px rgba(var(--primary-rgb), 0.05);
}

.btn-primary:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow:
    0 20px 25px -5px rgba(var(--primary-rgb), 0.3),
    0 10px 10px -5px rgba(var(--primary-rgb), 0.1);
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}

/* 安全提示样式 */
.security-notice {
  background: rgba(255, 255, 255, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.4);
  backdrop-filter: blur(10px);
  border-radius: 8px;
  padding: 12px 16px;
  color: #374151;
  font-size: 0.875rem;
  transition: all 0.3s ease;
}

:global(.dark) .security-notice {
  background: var(--glass-strong-color) !important;
  border: 1px solid var(--border-color) !important;
  color: #d1d5db !important;
}

.security-notice:hover {
  background: rgba(255, 255, 255, 0.6);
  border-color: rgba(255, 255, 255, 0.5);
  color: #1f2937;
}

:global(.dark) .security-notice:hover {
  background: var(--glass-strong-color) !important;
  border-color: var(--border-color) !important;
  color: #e5e7eb !important;
}

.security-notice .fas.fa-shield-alt {
  color: #10b981;
  text-shadow: 0 1px 2px rgba(16, 185, 129, 0.2);
}

/* 控制栏 */
.control-bar {
  padding-bottom: 0.5rem;
  border-bottom: 1px solid rgba(229, 231, 235, 0.3);
}

:global(.dark) .control-bar {
  border-bottom-color: rgba(75, 85, 99, 0.3);
}

/* 按钮组 */
.button-group {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

/* 模式切换组 */
.mode-switch-group {
  display: inline-flex;
  padding: 4px;
  background: #f3f4f6;
  border-radius: 0.5rem;
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.05);
}

:global(.dark) .mode-switch-group {
  background: var(--bg-gradient-start);
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.3);
}

/* 模式切换按钮 */
.mode-switch-btn {
  display: inline-flex;
  align-items: center;
  padding: 6px 12px;
  font-size: 0.875rem;
  font-weight: 500;
  color: #6b7280;
  background: transparent;
  border: none;
  border-radius: 0.375rem;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
}

:global(.dark) .mode-switch-btn {
  color: var(--text-secondary);
}

.mode-switch-btn:hover:not(.active) {
  color: #374151;
  background: rgba(0, 0, 0, 0.05);
}

:global(.dark) .mode-switch-btn:hover:not(.active) {
  color: #d1d5db;
  background: rgba(255, 255, 255, 0.05);
}

.mode-switch-btn.active {
  color: white;
  background: linear-gradient(135deg, var(--primary-color) 0%, var(--secondary-color) 100%);
  box-shadow: 0 2px 4px rgba(var(--primary-rgb), 0.2);
}

.mode-switch-btn.active:hover {
  box-shadow: 0 4px 6px rgba(var(--primary-rgb), 0.3);
}

.mode-switch-btn i {
  font-size: 0.875rem;
}

/* 淡入淡出动画 */
.fade-enter-active,
.fade-leave-active {
  transition: all 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateX(-10px);
}

/* 加载动画 */
.loading-spinner {
  animation: spin 1s linear infinite;
  filter: drop-shadow(0 0 4px rgba(255, 255, 255, 0.5));
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

/* 响应式优化 */
@media (max-width: 768px) {
  .control-bar {
    flex-direction: column;
    align-items: stretch;
    gap: 1rem;
  }

  .button-group {
    justify-content: center;
  }
}

@media (max-width: 768px) {
  .api-input-wide-card {
    padding: 1.25rem;
  }

  .wide-card-title {
    margin-bottom: 1.25rem;
  }

  .wide-card-title h2 {
    font-size: 1.5rem;
  }

  .wide-card-title p {
    font-size: 0.875rem;
  }

  .api-input-grid {
    gap: 1rem;
  }

  .wide-card-input {
    padding: 12px 14px;
    font-size: 15px;
  }

  .btn-query {
    padding: 12px 20px;
    font-size: 15px;
  }

  .security-notice {
    padding: 10px 14px;
    font-size: 0.8rem;
  }
}

@media (max-width: 480px) {
  .mode-toggle-btn {
    padding: 5px 8px;
  }

  .toggle-icon {
    width: 18px;
    height: 18px;
  }

  .hint-text {
    font-size: 0.7rem;
    padding: 4px 8px;
  }
}

@media (max-width: 480px) {
  .api-input-wide-card {
    padding: 1rem;
  }

  .wide-card-title h2 {
    font-size: 1.25rem;
  }

  .wide-card-title p {
    font-size: 0.8rem;
  }

  .wide-card-input {
    padding: 10px 12px;
    font-size: 14px;
  }

  .btn-query {
    padding: 10px 16px;
    font-size: 14px;
  }
}
</style>
