<template>
  <div class="input-card">
    <!-- 标题区域 -->
    <div class="card-header">
      <div class="header-content">
        <div class="header-icon">
          <i class="fas fa-key" />
        </div>
        <div>
          <h2 class="header-title">API Key 查询</h2>
          <p class="header-subtitle">查询您的 API Key 使用情况和统计数据</p>
        </div>
      </div>
    </div>

    <!-- 输入区域 -->
    <div class="card-body">
      <!-- 控制栏 -->
      <div class="control-bar">
        <div class="control-label">
          {{ multiKeyMode ? 'API Keys（每行一个或用逗号分隔）' : 'API Key' }}
        </div>
        <!-- 模式切换 -->
        <div class="mode-switcher">
          <button
            :class="['mode-btn', { active: !multiKeyMode }]"
            title="单一模式"
            @click="multiKeyMode = false"
          >
            <i class="fas fa-key" />
            <span>单一</span>
          </button>
          <button
            :class="['mode-btn', { active: multiKeyMode }]"
            title="聚合模式"
            @click="multiKeyMode = true"
          >
            <i class="fas fa-layer-group" />
            <span>聚合</span>
            <span v-if="multiKeyMode && parsedApiKeys.length > 0" class="mode-badge">
              {{ parsedApiKeys.length }}
            </span>
          </button>
        </div>
      </div>

      <!-- 输入表单 -->
      <div class="input-group">
        <!-- API Key 输入 -->
        <div class="input-wrapper">
          <!-- 单 Key 模式 -->
          <input
            v-if="!multiKeyMode"
            v-model="apiKey"
            class="text-input"
            :disabled="loading"
            placeholder="请输入您的 API Key (cr_...)"
            type="password"
            @keyup.enter="queryStats"
          />

          <!-- 多 Key 模式 -->
          <div v-else class="textarea-wrapper">
            <textarea
              v-model="apiKey"
              class="text-area"
              :disabled="loading"
              placeholder="请输入您的 API Keys，每行一个或用逗号分隔&#10;例如：&#10;cr_xxx&#10;cr_yyy"
              rows="4"
              @keyup.ctrl.enter="queryStats"
            />
            <button v-if="apiKey && !loading" class="clear-btn" title="清空" @click="clearInput">
              <i class="fas fa-times" />
            </button>
          </div>
        </div>

        <!-- 查询按钮 -->
        <button class="query-btn" :disabled="loading || !hasValidInput" @click="queryStats">
          <i v-if="loading" class="fas fa-spinner spinner" />
          <i v-else class="fas fa-search" />
          <span>{{ loading ? '查询中...' : '查询' }}</span>
        </button>
      </div>

      <!-- 提示信息 -->
      <div class="hints">
        <div class="hint-item">
          <i class="fas fa-shield-alt" />
          <span>
            {{
              multiKeyMode
                ? 'API Keys 仅用于查询统计数据，不会被存储'
                : 'API Key 仅用于查询统计数据，不会被存储'
            }}
          </span>
        </div>
        <div v-if="multiKeyMode" class="hint-item hint-info">
          <i class="fas fa-info-circle" />
          <span>最多支持 30 个 Keys，按 Ctrl+Enter 快速查询</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useApiStatsStore } from '@/stores/apistats'

const apiStatsStore = useApiStatsStore()
const { apiKey, loading, multiKeyMode } = storeToRefs(apiStatsStore)
const { queryStats, clearInput } = apiStatsStore

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
.input-card {
  background: #fff;
  border: 1px solid #eaeaea;
  border-radius: 8px;
  overflow: hidden;
  transition:
    background-color 0.3s ease,
    border-color 0.3s ease;
}

:global(.dark) .input-card {
  background: #000;
  border-color: #333;
}

/* Card Header */
.card-header {
  padding: 24px;
  border-bottom: 1px solid #eaeaea;
  background: #fff;
  transition:
    background-color 0.3s ease,
    border-color 0.3s ease;
}

:global(.dark) .card-header {
  background: #000 !important;
  border-bottom-color: #333;
}

.header-content {
  display: flex;
  align-items: center;
  gap: 16px;
}

.header-icon {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fafafa;
  border: 1px solid #eaeaea;
  border-radius: 8px;
  font-size: 20px;
  color: #000;
}

:global(.dark) .header-icon {
  background: #0a0a0a;
  border-color: #333;
  color: #fff;
}

.header-title {
  font-size: 20px;
  font-weight: 600;
  color: #000;
  margin: 0;
  line-height: 1.2;
}

:global(.dark) .header-title {
  color: #fff;
}

.header-subtitle {
  font-size: 14px;
  color: #666;
  margin: 4px 0 0;
}

:global(.dark) .header-subtitle {
  color: #999;
}

/* Card Body */
.card-body {
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  background: #fff;
  transition: background-color 0.3s ease;
}

:global(.dark) .card-body {
  background: #000 !important;
}

/* Control Bar */
.control-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.control-label {
  font-size: 14px;
  font-weight: 500;
  color: #000;
}

:global(.dark) .control-label {
  color: #fff;
}

/* Mode Switcher */
.mode-switcher {
  display: flex;
  gap: 4px;
  background: #fafafa;
  border: 1px solid #eaeaea;
  border-radius: 6px;
  padding: 4px;
}

:global(.dark) .mode-switcher {
  background: #0a0a0a;
  border-color: #333;
}

.mode-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  font-size: 14px;
  font-weight: 500;
  color: #666;
  background: transparent;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.mode-btn i {
  font-size: 14px;
}

.mode-btn:hover:not(.active) {
  color: #000;
  background: #fff;
}

:global(.dark) .mode-btn {
  color: #999;
}

:global(.dark) .mode-btn:hover:not(.active) {
  color: #fff;
  background: #1a1a1a;
}

.mode-btn.active {
  color: #fff;
  background: #000;
}

:global(.dark) .mode-btn.active {
  color: #000;
  background: #fff;
}

.mode-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  font-size: 12px;
  font-weight: 600;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 10px;
}

/* Input Group */
.input-group {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 12px;
  align-items: start;
}

.input-wrapper {
  flex: 1;
}

/* Text Input */
.text-input,
.text-area {
  width: 100%;
  padding: 0 16px;
  height: 48px;
  font-size: 14px;
  color: #000;
  background: #fafafa;
  border: 1px solid #eaeaea;
  border-radius: 6px;
  outline: none;
  transition: all 0.15s ease;
  font-family: inherit;
}

.text-area {
  height: auto;
  padding: 12px 16px;
  resize: vertical;
  line-height: 1.5;
}

.text-input::placeholder,
.text-area::placeholder {
  color: #999;
}

.text-input:hover,
.text-area:hover {
  border-color: #000;
}

.text-input:focus,
.text-area:focus {
  border-color: #000;
  box-shadow: 0 0 0 1px #000;
}

.text-input:disabled,
.text-area:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

:global(.dark) .text-input,
:global(.dark) .text-area {
  color: #fff;
  background: #0a0a0a !important;
  border-color: #333;
}

:global(.dark) .text-input::placeholder,
:global(.dark) .text-area::placeholder {
  color: #666;
}

:global(.dark) .text-input:hover,
:global(.dark) .text-area:hover {
  border-color: #fff;
}

:global(.dark) .text-input:focus,
:global(.dark) .text-area:focus {
  border-color: #fff;
  box-shadow: 0 0 0 1px #fff;
}

/* Textarea Wrapper */
.textarea-wrapper {
  position: relative;
}

.clear-btn {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: #999;
  cursor: pointer;
  transition: all 0.15s ease;
  border-radius: 4px;
}

.clear-btn:hover {
  color: #000;
  background: #fafafa;
}

:global(.dark) .clear-btn:hover {
  color: #fff;
  background: #1a1a1a;
}

/* Query Button */
.query-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 0 24px;
  height: 48px;
  font-size: 14px;
  font-weight: 500;
  color: #fff;
  background: #000;
  border: 1px solid #000;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
}

.query-btn i {
  font-size: 14px;
}

.query-btn:hover:not(:disabled) {
  background: #1a1a1a;
  border-color: #1a1a1a;
}

.query-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

:global(.dark) .query-btn {
  color: #000;
  background: #fff;
  border-color: #fff;
}

:global(.dark) .query-btn:hover:not(:disabled) {
  background: #e5e5e5;
  border-color: #e5e5e5;
}

/* Spinner */
.spinner {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

/* Hints */
.hints {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.hint-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  font-size: 13px;
  color: #666;
  background: #fafafa;
  border: 1px solid #eaeaea;
  border-radius: 6px;
}

.hint-item i {
  font-size: 14px;
  color: #10b981;
}

:global(.dark) .hint-item {
  color: #999;
  background: #0a0a0a;
  border-color: #333;
}

.hint-info {
  background: #f0f9ff;
  border-color: #bae6fd;
  color: #0369a1;
}

.hint-info i {
  color: #0284c7;
}

:global(.dark) .hint-info {
  background: #082f49;
  border-color: #0c4a6e;
  color: #7dd3fc;
}

:global(.dark) .hint-info i {
  color: #38bdf8;
}

/* Responsive */
@media (max-width: 768px) {
  .card-header,
  .card-body {
    padding: 20px;
  }

  .header-icon {
    width: 40px;
    height: 40px;
    font-size: 18px;
  }

  .header-title {
    font-size: 18px;
  }

  .input-group {
    grid-template-columns: 1fr;
  }

  .query-btn {
    width: 100%;
  }

  .control-bar {
    flex-direction: column;
    align-items: flex-start;
  }

  .mode-switcher {
    width: 100%;
  }

  .mode-btn {
    flex: 1;
    justify-content: center;
  }
}
</style>
