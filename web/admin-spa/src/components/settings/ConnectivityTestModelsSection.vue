<template>
  <section class="space-y-5">
    <div
      class="overflow-hidden rounded-xl border border-blue-100 bg-gradient-to-r from-blue-50 via-white to-cyan-50 dark:border-blue-900/50 dark:from-blue-950/30 dark:via-gray-800 dark:to-cyan-950/20"
    >
      <div class="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div class="flex items-start gap-3">
          <div
            class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm"
          >
            <i class="fas fa-vial" />
          </div>
          <div>
            <h2 class="font-semibold text-gray-900 dark:text-gray-100">连通性测试模型</h2>
            <p class="mt-1 max-w-2xl text-sm leading-6 text-gray-600 dark:text-gray-400">
              维护账户和 API Key
              测试弹窗中的候选模型。配置仅影响测试入口，不会改变模型价格、限制或请求调度。
            </p>
          </div>
        </div>
        <div class="flex flex-shrink-0 items-center gap-2 text-xs">
          <span
            :class="[
              'rounded-full px-2.5 py-1 font-medium',
              config.source === 'custom'
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
            ]"
          >
            {{ config.source === 'custom' ? '自定义配置' : '内置默认' }}
          </span>
        </div>
      </div>
    </div>

    <div
      v-if="loading"
      class="rounded-xl border border-gray-200 py-16 text-center dark:border-gray-700"
    >
      <div class="loading-spinner mx-auto mb-3" />
      <p class="text-sm text-gray-500 dark:text-gray-400">正在加载测试模型...</p>
    </div>

    <template v-else>
      <div class="overflow-x-auto border-b border-gray-200 dark:border-gray-700">
        <nav aria-label="模型家族" class="flex min-w-max gap-1">
          <button
            v-for="family in familyOptions"
            :key="family.key"
            :class="[
              'relative flex items-center gap-2 rounded-t-lg px-4 py-3 text-sm font-medium transition-colors',
              activeFamily === family.key
                ? 'bg-gray-50 text-blue-600 dark:bg-gray-800 dark:text-blue-400'
                : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-800/60 dark:hover:text-gray-200'
            ]"
            type="button"
            @click="activeFamily = family.key"
          >
            <i :class="family.icon" />
            {{ family.label }}
            <span
              class="rounded-full bg-gray-200/80 px-1.5 py-0.5 text-[11px] text-gray-600 dark:bg-gray-700 dark:text-gray-300"
            >
              {{ config.families[family.key].models.length }}
            </span>
            <span
              v-if="activeFamily === family.key"
              class="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-blue-500"
            />
          </button>
        </nav>
      </div>

      <div
        class="rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800/70"
      >
        <div
          class="flex flex-col gap-3 border-b border-gray-200 px-4 py-4 dark:border-gray-700 sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <h3 class="font-semibold text-gray-900 dark:text-gray-100">
              {{ activeFamilyMeta.label }} 模型
            </h3>
            <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
              默认模型会在测试窗口打开时自动选中，模型顺序与下拉框一致。
            </p>
          </div>
          <button
            class="inline-flex items-center justify-center rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 transition hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-900/50"
            type="button"
            @click="addModel"
          >
            <i class="fas fa-plus mr-2 text-xs" />
            添加模型
          </button>
        </div>

        <div
          class="hidden grid-cols-[44px_minmax(220px,1.3fr)_minmax(180px,1fr)_116px] gap-3 border-b border-gray-100 bg-gray-50/80 px-4 py-2 text-xs font-medium uppercase tracking-wide text-gray-500 dark:border-gray-700 dark:bg-gray-900/30 dark:text-gray-400 md:grid"
        >
          <span class="text-center">默认</span>
          <span>模型 ID</span>
          <span>显示名称</span>
          <span class="text-center">排序 / 删除</span>
        </div>

        <div class="divide-y divide-gray-100 dark:divide-gray-700">
          <div
            v-for="(model, index) in currentFamily.models"
            :key="`${activeFamily}-${index}`"
            class="grid gap-3 px-4 py-4 md:grid-cols-[44px_minmax(220px,1.3fr)_minmax(180px,1fr)_116px] md:items-center"
          >
            <label
              class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 md:justify-center"
            >
              <input
                v-model="currentFamily.defaultModel"
                class="h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500"
                name="connectivity-test-default-model"
                type="radio"
                :value="model.value"
              />
              <span class="md:hidden">设为默认</span>
            </label>

            <div>
              <label
                class="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400 md:hidden"
              >
                模型 ID
              </label>
              <input
                class="form-input w-full font-mono text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                maxlength="256"
                placeholder="输入上游模型 ID"
                type="text"
                :value="model.value"
                @input="updateModelValue(index, $event.target.value)"
              />
            </div>

            <div>
              <label
                class="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400 md:hidden"
              >
                显示名称
              </label>
              <input
                v-model="model.label"
                class="form-input w-full text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                maxlength="120"
                placeholder="留空时使用模型 ID"
                type="text"
              />
            </div>

            <div class="flex items-center gap-1 md:justify-center">
              <button
                class="flex h-8 w-8 items-center justify-center rounded-md text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                :disabled="index === 0"
                title="上移"
                type="button"
                @click="moveModel(index, -1)"
              >
                <i class="fas fa-arrow-up text-xs" />
              </button>
              <button
                class="flex h-8 w-8 items-center justify-center rounded-md text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                :disabled="index === currentFamily.models.length - 1"
                title="下移"
                type="button"
                @click="moveModel(index, 1)"
              >
                <i class="fas fa-arrow-down text-xs" />
              </button>
              <button
                class="flex h-8 w-8 items-center justify-center rounded-md text-gray-400 transition hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-red-950/30 dark:hover:text-red-400"
                :disabled="currentFamily.models.length === 1"
                title="删除"
                type="button"
                @click="removeModel(index)"
              >
                <i class="fas fa-trash-alt text-xs" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div
        v-if="resetArmed"
        class="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/60 dark:bg-amber-950/20 sm:flex-row sm:items-center sm:justify-between"
      >
        <div class="flex items-start gap-3">
          <i class="fas fa-exclamation-triangle mt-0.5 text-amber-500" />
          <div>
            <p class="text-sm font-medium text-amber-900 dark:text-amber-200">恢复全部内置模型？</p>
            <p class="mt-1 text-xs text-amber-700 dark:text-amber-400">
              当前四个家族的自定义配置都会被清除。
            </p>
          </div>
        </div>
        <div class="flex gap-2">
          <button
            class="rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-white/70 dark:text-gray-300 dark:hover:bg-gray-800"
            type="button"
            @click="resetArmed = false"
          >
            取消
          </button>
          <button
            class="rounded-lg bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
            :disabled="resetting"
            type="button"
            @click="resetConfig"
          >
            {{ resetting ? '恢复中...' : '确认恢复' }}
          </button>
        </div>
      </div>

      <div class="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div class="text-xs text-gray-500 dark:text-gray-400">
          <template v-if="config.updatedAt">
            最后更新：{{ formatDateTime(config.updatedAt) }}
            <span v-if="config.updatedBy"> · {{ config.updatedBy }}</span>
          </template>
          <template v-else>尚未保存自定义配置</template>
        </div>
        <div class="flex gap-2">
          <button
            class="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            :disabled="saving || resetting"
            type="button"
            @click="resetArmed = true"
          >
            <i class="fas fa-undo mr-2 text-xs" />
            恢复默认
          </button>
          <button
            class="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="saving || resetting"
            type="button"
            @click="saveConfig"
          >
            <i :class="['fas mr-2 text-xs', saving ? 'fa-spinner fa-spin' : 'fa-save']" />
            {{ saving ? '保存中...' : '保存配置' }}
          </button>
        </div>
      </div>
    </template>
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import {
  getConnectivityTestModelConfigApi,
  resetConnectivityTestModelConfigApi,
  updateConnectivityTestModelConfigApi
} from '@/utils/http_apis'
import { showToast } from '@/utils/tools'

const familyOptions = [
  { key: 'claude', label: 'Claude', icon: 'fas fa-brain' },
  { key: 'gemini', label: 'Gemini', icon: 'fas fa-gem' },
  { key: 'openai', label: 'OpenAI', icon: 'fas fa-code' },
  { key: 'bedrock', label: 'Bedrock', icon: 'fab fa-aws' }
]

const emptyConfig = () => ({
  version: 1,
  families: Object.fromEntries(
    familyOptions.map(({ key }) => [key, { defaultModel: '', models: [] }])
  ),
  source: 'default',
  updatedAt: null,
  updatedBy: null
})

const activeFamily = ref('claude')
const config = ref(emptyConfig())
const loading = ref(true)
const saving = ref(false)
const resetting = ref(false)
const resetArmed = ref(false)

const currentFamily = computed(() => config.value.families[activeFamily.value])
const activeFamilyMeta = computed(() =>
  familyOptions.find((family) => family.key === activeFamily.value)
)

const applyConfig = (data) => {
  config.value = JSON.parse(JSON.stringify(data))
}

const loadConfig = async () => {
  loading.value = true
  const result = await getConnectivityTestModelConfigApi()
  if (result.success && result.data) {
    applyConfig(result.data)
  } else {
    showToast(result.message || '加载测试模型配置失败', 'error')
  }
  loading.value = false
}

const addModel = () => {
  currentFamily.value.models.push({ value: '', label: '' })
}

const updateModelValue = (index, value) => {
  const model = currentFamily.value.models[index]
  if (currentFamily.value.defaultModel === model.value) {
    currentFamily.value.defaultModel = value
  }
  model.value = value
}

const removeModel = (index) => {
  const [removed] = currentFamily.value.models.splice(index, 1)
  if (removed.value === currentFamily.value.defaultModel) {
    currentFamily.value.defaultModel = currentFamily.value.models[0]?.value || ''
  }
}

const moveModel = (index, offset) => {
  const target = index + offset
  if (target < 0 || target >= currentFamily.value.models.length) return
  const [model] = currentFamily.value.models.splice(index, 1)
  currentFamily.value.models.splice(target, 0, model)
}

const buildPayload = () => {
  const families = {}

  for (const family of familyOptions) {
    const familyConfig = config.value.families[family.key]
    const models = familyConfig.models.map((model) => ({
      value: model.value.trim(),
      label: model.label.trim() || model.value.trim()
    }))
    const values = models.map((model) => model.value)

    if (values.some((value) => !value)) {
      throw new Error(`${family.label} 存在空的模型 ID`)
    }
    if (new Set(values).size !== values.length) {
      throw new Error(`${family.label} 存在重复的模型 ID`)
    }
    if (!values.includes(familyConfig.defaultModel.trim())) {
      throw new Error(`${family.label} 需要选择一个有效的默认模型`)
    }

    families[family.key] = {
      defaultModel: familyConfig.defaultModel.trim(),
      models
    }
  }

  return { families }
}

const saveConfig = async () => {
  let payload
  try {
    payload = buildPayload()
  } catch (error) {
    showToast(error.message, 'error')
    return
  }

  saving.value = true
  const result = await updateConnectivityTestModelConfigApi(payload)
  if (result.success && result.data) {
    applyConfig(result.data)
    showToast('连通性测试模型已保存', 'success')
  } else {
    showToast(result.message || '保存测试模型配置失败', 'error')
  }
  saving.value = false
}

const resetConfig = async () => {
  resetting.value = true
  const result = await resetConnectivityTestModelConfigApi()
  if (result.success && result.data) {
    applyConfig(result.data)
    resetArmed.value = false
    showToast('已恢复内置测试模型', 'success')
  } else {
    showToast(result.message || '恢复默认配置失败', 'error')
  }
  resetting.value = false
}

const formatDateTime = (value) => (value ? new Date(value).toLocaleString('zh-CN') : '')

onMounted(loadConfig)
</script>
