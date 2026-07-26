<template>
  <section class="api-query-panel">
    <div class="query-intro">
      <p>API KEY SELF-SERVICE</p>
      <h1>查询你的用量</h1>
      <span>输入 API Key，即可查看消费、Token 和每笔请求的计费明细。</span>
    </div>

    <div class="query-form">
      <div class="query-form-head">
        <label for="api-stats-key">
          {{ multiKeyMode ? 'API Keys' : 'API Key' }}
          <small>{{ multiKeyMode ? '每行一个，最多 30 个' : '仅用于本次安全查询' }}</small>
        </label>
        <div aria-label="查询模式" class="mode-switch-group">
          <button :class="{ active: !multiKeyMode }" type="button" @click="multiKeyMode = false">
            单 Key
          </button>
          <button :class="{ active: multiKeyMode }" type="button" @click="multiKeyMode = true">
            聚合
            <b v-if="multiKeyMode && parsedApiKeys.length">{{ parsedApiKeys.length }}</b>
          </button>
        </div>
      </div>

      <div class="query-entry" :class="{ multiline: multiKeyMode }">
        <div class="query-field">
          <input
            v-if="!multiKeyMode"
            id="api-stats-key"
            v-model="apiKey"
            :disabled="loading"
            placeholder="cr_..."
            :type="showPassword ? 'text' : 'password'"
            @keyup.enter="queryStats"
          />
          <textarea
            v-else
            id="api-stats-key"
            v-model="apiKey"
            :disabled="loading"
            placeholder="cr_xxx&#10;cr_yyy"
            rows="4"
            @keyup.ctrl.enter="queryStats"
          />
          <button
            v-if="!multiKeyMode"
            class="field-action"
            :title="showPassword ? '隐藏 Key' : '显示 Key'"
            type="button"
            @click="showPassword = !showPassword"
          >
            <i :class="showPassword ? 'fas fa-eye-slash' : 'fas fa-eye'" />
          </button>
          <button
            v-else-if="apiKey && !loading"
            class="field-action top"
            title="清空输入"
            type="button"
            @click="clearInput"
          >
            <i class="fas fa-times" />
          </button>
        </div>

        <button
          class="query-submit"
          :disabled="loading || !hasValidInput"
          type="button"
          @click="queryStats"
        >
          <i v-if="loading" class="fas fa-spinner fa-spin" />
          <span>{{ loading ? '正在查询' : '查看用量' }}</span>
          <i v-if="!loading" class="fas fa-arrow-right" />
        </button>
      </div>

      <p class="security-notice">
        <i class="fas fa-shield-halved" />
        {{
          multiKeyMode
            ? 'Key 仅用于汇总统计，不会存储；聚合模式不展示单笔请求。'
            : 'Key 仅用于验证并读取你自己的用量，不会存储。'
        }}
      </p>
    </div>
  </section>
</template>

<script setup>
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useApiStatsStore } from '@/stores/apistats'

const apiStatsStore = useApiStatsStore()
const { apiKey, loading, multiKeyMode } = storeToRefs(apiStatsStore)
const { queryStats, clearInput } = apiStatsStore

const showPassword = ref(false)

const parsedApiKeys = computed(() => {
  if (!multiKeyMode.value || !apiKey.value) return []
  const keys = apiKey.value
    .split(/[,\n]+/)
    .map((key) => key.trim())
    .filter((key) => key.length > 0)
  return [...new Set(keys)].slice(0, 30)
})

const hasValidInput = computed(() => {
  if (multiKeyMode.value) return parsedApiKeys.value.length > 0
  return apiKey.value && apiKey.value.trim().length > 0
})
</script>

<style scoped>
.api-query-panel {
  display: grid;
  grid-template-columns: minmax(15rem, 0.78fr) minmax(26rem, 1.42fr);
  gap: clamp(2rem, 6vw, 5rem);
  align-items: end;
  padding: clamp(2.5rem, 7vw, 5.25rem) 0 2.3rem;
  border-bottom: 1px solid var(--page-line, #d8dad3);
}

.query-intro p {
  margin: 0 0 0.75rem;
  color: var(--page-green, #55a782);
  font:
    600 0.62rem ui-monospace,
    monospace;
  letter-spacing: 0.13em;
}

.query-intro h1 {
  margin: 0;
  color: var(--page-ink, #18201d);
  font-size: clamp(2.1rem, 5vw, 3.5rem);
  line-height: 0.98;
  letter-spacing: -0.065em;
  font-weight: 700;
}

.query-intro span {
  display: block;
  max-width: 28rem;
  margin-top: 1rem;
  color: var(--page-muted, #727a74);
  font-size: 0.78rem;
  line-height: 1.7;
}

.query-form {
  border: 1px solid var(--page-line, #d8dad3);
  border-radius: 0.75rem;
  padding: 1.1rem;
  background: color-mix(in srgb, var(--page-card, #fafaf7) 92%, transparent);
}

.query-form-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  margin-bottom: 0.75rem;
}

.query-form-head label {
  color: var(--page-ink, #18201d);
  font:
    600 0.7rem ui-monospace,
    monospace;
}

.query-form-head label small {
  margin-left: 0.45rem;
  color: var(--page-muted, #727a74);
  font-family: 'Avenir Next', 'PingFang SC', sans-serif;
  font-weight: 400;
}

.mode-switch-group {
  display: flex;
  gap: 0.15rem;
  padding: 0.18rem;
  border: 1px solid var(--page-line, #d8dad3);
  border-radius: 0.42rem;
}

.mode-switch-group button {
  border: 0;
  border-radius: 0.28rem;
  padding: 0.38rem 0.55rem;
  color: var(--page-muted, #727a74);
  background: transparent;
  font-size: 0.62rem;
  cursor: pointer;
}

.mode-switch-group button.active {
  color: var(--page-ink, #18201d);
  background: var(--page-card, #fafaf7);
  box-shadow: 0 1px 3px rgba(23, 31, 27, 0.08);
  font-weight: 700;
}

.mode-switch-group b {
  margin-left: 0.25rem;
  color: var(--page-green, #55a782);
}

.query-entry {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.55rem;
}

.query-entry.multiline {
  align-items: stretch;
}

.query-field {
  position: relative;
}

.query-field input,
.query-field textarea {
  width: 100%;
  border: 1px solid var(--page-line, #d8dad3);
  border-radius: 0.48rem;
  padding: 0.8rem 2.8rem 0.8rem 0.85rem;
  color: var(--page-ink, #18201d);
  background: var(--page-card, #fafaf7);
  font:
    0.76rem ui-monospace,
    'SFMono-Regular',
    Consolas,
    monospace;
  transition:
    border-color 0.18s ease,
    box-shadow 0.18s ease;
}

.query-field textarea {
  min-height: 6.5rem;
  resize: vertical;
}

.query-field input:focus,
.query-field textarea:focus {
  outline: none;
  border-color: var(--page-green, #55a782);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--page-green, #55a782) 14%, transparent);
}

.query-field input::placeholder,
.query-field textarea::placeholder {
  color: color-mix(in srgb, var(--page-muted, #727a74) 70%, transparent);
}

.field-action {
  position: absolute;
  top: 50%;
  right: 0.75rem;
  transform: translateY(-50%);
  border: 0;
  color: var(--page-muted, #727a74);
  background: transparent;
  cursor: pointer;
}

.field-action.top {
  top: 0.75rem;
  transform: none;
}

.query-submit {
  min-width: 8.5rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.55rem;
  border: 1px solid var(--page-forest, #1d3b33);
  border-radius: 0.48rem;
  padding: 0.72rem 0.9rem;
  color: #f2f5f1;
  background: var(--page-forest, #1d3b33);
  font-size: 0.72rem;
  font-weight: 700;
  cursor: pointer;
  transition:
    transform 0.18s ease,
    background 0.18s ease;
}

.query-submit:hover:not(:disabled) {
  transform: translateY(-1px);
  background: color-mix(in srgb, var(--page-forest, #1d3b33) 90%, white);
}

.query-submit:disabled {
  opacity: 0.42;
  cursor: not-allowed;
}

.security-notice {
  display: flex;
  align-items: flex-start;
  gap: 0.45rem;
  margin: 0.75rem 0 0;
  color: var(--page-muted, #727a74);
  font-size: 0.62rem;
  line-height: 1.55;
}

.security-notice i {
  margin-top: 0.15rem;
  color: var(--page-green, #55a782);
}

@media (max-width: 860px) {
  .api-query-panel {
    grid-template-columns: 1fr;
    align-items: stretch;
    gap: 1.7rem;
  }
}

@media (max-width: 560px) {
  .query-form {
    padding: 0.85rem;
  }

  .query-form-head {
    align-items: flex-start;
  }

  .query-form-head label small {
    display: block;
    margin: 0.25rem 0 0;
  }

  .query-entry {
    grid-template-columns: 1fr;
  }

  .query-submit {
    min-height: 2.8rem;
  }
}
</style>
