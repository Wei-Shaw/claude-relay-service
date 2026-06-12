<template>
  <div class="glass-strong rounded-2xl p-4 shadow-xl sm:rounded-3xl sm:p-6 md:p-8">
    <div class="mb-5 flex flex-col gap-3 md:mb-6 md:flex-row md:items-end md:justify-between">
      <div>
        <h2 class="text-xl font-bold text-gray-900 dark:text-gray-100 md:text-2xl">
          <i class="fas fa-layer-group mr-2 text-blue-500" />
          可用模型
        </h2>
        <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
          查看当前服务可用模型；输入 API Key 后可直接发起端点测试。
        </p>
      </div>
      <button
        class="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
        :disabled="loading"
        @click="loadModels"
      >
        <i :class="['fas', loading ? 'fa-spinner fa-spin' : 'fa-rotate-right']" />
        刷新列表
      </button>
    </div>

    <div
      v-if="error"
      class="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
    >
      <i class="fas fa-exclamation-triangle mr-2" />
      {{ error }}
    </div>

    <div
      class="mb-5 flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white/80 p-4 dark:border-gray-700 dark:bg-gray-900/70 md:flex-row md:items-center md:justify-between"
    >
      <div>
        <div class="text-sm font-medium text-gray-700 dark:text-gray-300">
          <i class="fas fa-key mr-2 text-blue-500" />
          当前测试 Key
        </div>
        <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
          与「统计查询」共用同一份输入和本地缓存；切回统计页修改后这里会同步更新。
        </p>
      </div>
      <div
        class="rounded-xl bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300"
      >
        {{ maskedApiKey || '未输入 API Key' }}
      </div>
    </div>

    <div
      v-if="!hasSingleApiKey"
      class="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"
    >
      <i class="fas fa-key mr-2" />
      测试按钮需要单个 API Key。请在「统计查询」中输入并查询，或保持当前输入框为单 Key 模式。
    </div>

    <div class="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div
        v-for="service in serviceCards"
        :key="service.key"
        class="flex min-h-[320px] flex-col rounded-2xl border border-gray-200 bg-white/85 p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg dark:border-gray-700 dark:bg-gray-900/70"
      >
        <div class="mb-4 flex items-start justify-between gap-3">
          <div class="flex items-center gap-3">
            <div
              :class="[
                'flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl text-white shadow-md',
                service.iconBg
              ]"
            >
              <i :class="['fas', service.icon]" />
            </div>
            <div>
              <h3 class="font-semibold text-gray-900 dark:text-gray-100">{{ service.name }}</h3>
              <p class="text-xs text-gray-500 dark:text-gray-400">{{ service.endpoint }}</p>
            </div>
          </div>
          <span
            :class="[
              'rounded-full px-2.5 py-1 text-xs font-medium',
              service.canUse
                ? 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300'
                : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
            ]"
          >
            {{ service.canUse ? '可测试' : '未授权' }}
          </span>
        </div>

        <div class="mb-4 grid grid-cols-2 gap-2 text-xs">
          <div class="rounded-xl bg-gray-50 p-3 dark:bg-gray-800/80">
            <div class="text-gray-500 dark:text-gray-400">模型数量</div>
            <div class="mt-1 text-lg font-semibold text-gray-900 dark:text-gray-100">
              {{ service.models.length }}
            </div>
          </div>
          <div class="rounded-xl bg-gray-50 p-3 dark:bg-gray-800/80">
            <div class="text-gray-500 dark:text-gray-400">列表来源</div>
            <div class="mt-1 truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
              {{ service.source }}
            </div>
          </div>
        </div>

        <div
          class="min-h-0 flex-1 overflow-hidden rounded-xl border border-gray-100 bg-gray-50/70 dark:border-gray-800 dark:bg-gray-800/40"
        >
          <div v-if="service.models.length > 0" class="max-h-44 overflow-y-auto p-2">
            <div
              v-for="model in service.models"
              :key="model.value"
              class="mb-1 flex items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 text-xs text-gray-700 shadow-sm last:mb-0 dark:bg-gray-900 dark:text-gray-300"
            >
              <span class="min-w-0 flex-1 truncate" :title="model.value">{{ model.label }}</span>
              <i class="fas fa-check-circle flex-shrink-0 text-green-500" />
            </div>
          </div>
          <div
            v-else
            class="flex h-44 items-center justify-center px-4 text-center text-sm text-gray-500 dark:text-gray-400"
          >
            暂无模型配置
          </div>
        </div>

        <button
          :class="[
            'mt-4 inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold shadow-sm transition',
            service.testDisabled
              ? 'cursor-not-allowed bg-gray-200 text-gray-400 dark:bg-gray-700 dark:text-gray-500'
              : 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white hover:from-blue-600 hover:to-cyan-600 hover:shadow-md'
          ]"
          :disabled="service.testDisabled"
          :title="service.testTitle"
          @click="$emit('test', service.key)"
        >
          <i class="fas fa-vial" />
          测试 {{ service.name }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'

import { getModelsApi } from '@/utils/http_apis'
import { useApiStatsStore } from '@/stores/apistats'

defineEmits(['test'])

const apiStatsStore = useApiStatsStore()
const { apiKey, statsData, multiKeyMode } = storeToRefs(apiStatsStore)

const loading = ref(false)
const error = ref('')
const modelData = ref({ claude: [], gemini: [], openai: [] })

const serviceMeta = [
  {
    key: 'claude',
    name: 'Claude',
    endpoint: '/api/v1/messages',
    icon: 'fa-robot',
    iconBg: 'bg-gradient-to-br from-orange-500 to-amber-500'
  },
  {
    key: 'gemini',
    name: 'Gemini',
    endpoint: '/gemini/v1/models',
    icon: 'fa-gem',
    iconBg: 'bg-gradient-to-br from-blue-500 to-sky-500'
  },
  {
    key: 'openai',
    name: 'Codex',
    endpoint: '/openai/responses',
    icon: 'fa-code',
    iconBg: 'bg-gradient-to-br from-green-500 to-emerald-500'
  }
]

const normalizeModels = (models) => {
  if (!Array.isArray(models)) return []

  return models
    .map((model) => {
      if (typeof model === 'string') {
        const value = model.trim()
        return value ? { value, label: value } : null
      }

      if (model && typeof model === 'object') {
        const value = String(model.value || model.id || model.model || '').trim()
        if (!value) return null
        const label = String(model.label || model.name || value).trim() || value
        return { value, label }
      }

      return null
    })
    .filter(Boolean)
}

const parsePermissions = (permissions) => {
  if (!permissions) return []
  if (Array.isArray(permissions)) return permissions
  if (typeof permissions === 'string') {
    if (permissions === 'all') return []
    try {
      const parsed = JSON.parse(permissions)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

const parseRestrictedModels = (restrictions) => {
  const list = restrictions?.restrictedModels
  return Array.isArray(list) ? list : []
}

const hasSingleApiKey = computed(() => !multiKeyMode.value && apiKey.value.trim().length >= 10)

const maskedApiKey = computed(() => {
  const key = apiKey.value.trim()
  if (!key) return ''
  if (key.length <= 10) return '****'
  return `${key.slice(0, 6)}****${key.slice(-4)}`
})

const serviceCards = computed(() => {
  const permissions = parsePermissions(statsData.value?.permissions)
  const restrictedModels = parseRestrictedModels(statsData.value?.restrictions)
  const isRestricted = statsData.value?.restrictions?.enableModelRestriction === true

  return serviceMeta.map((service) => {
    const keyOptions = normalizeModels(statsData.value?.testModelOptions?.[service.key] || [])
    const globalOptions = normalizeModels(modelData.value?.[service.key] || [])
    const sourceModels = keyOptions.length > 0 ? keyOptions : globalOptions
    const models = isRestricted
      ? sourceModels.filter((model) => !restrictedModels.includes(model.value))
      : sourceModels
    const canUse = permissions.length === 0 || permissions.includes(service.key)
    const testDisabled = !hasSingleApiKey.value || !canUse

    return {
      ...service,
      models,
      canUse,
      source: keyOptions.length > 0 ? '当前 Key' : '全局配置',
      testDisabled,
      testTitle: !hasSingleApiKey.value
        ? '请输入单个 API Key 后测试'
        : canUse
          ? `测试 ${service.name}`
          : '当前 API Key 未授权此服务'
    }
  })
})

const loadModels = async () => {
  loading.value = true
  error.value = ''
  const result = await getModelsApi()
  loading.value = false

  if (result.success) {
    modelData.value = result.data || {}
  } else {
    error.value = result.message || '模型列表加载失败'
  }
}

onMounted(loadModels)
</script>
