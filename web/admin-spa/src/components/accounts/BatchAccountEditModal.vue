<template>
  <el-dialog
    append-to-body
    class="batch-account-edit-dialog"
    :model-value="true"
    width="760px"
    @close="handleClose"
  >
    <template #header>
      <div>
        <h3 class="text-lg font-bold text-gray-900 dark:text-gray-100">批量编辑账户</h3>
        <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
          已选择 {{ accounts.length }} 个账户，未勾选覆写的字段不会提交。
        </p>
      </div>
    </template>

    <div v-if="accounts.length === 0" class="rounded-lg bg-yellow-50 p-4 text-sm text-yellow-700">
      没有可编辑的账户，请重新选择。
    </div>

    <div
      v-else-if="!samePlatform"
      class="rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800 dark:border-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-200"
    >
      批量编辑暂时只支持同平台账户。当前选择里包含多个平台，请先筛选或重新选择。
    </div>

    <div v-else class="space-y-5">
      <div
        class="rounded-xl border border-blue-100 bg-blue-50/70 p-4 dark:border-blue-800 dark:bg-blue-900/20"
      >
        <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p class="text-sm font-semibold text-gray-900 dark:text-gray-100">
              {{ platformLabel }} · {{ accounts.length }} 个账户
            </p>
            <p class="mt-1 text-xs text-gray-600 dark:text-gray-400">
              默认值来自参考账户；勾选覆写后才会更新选中账户。
            </p>
          </div>
          <div class="min-w-[240px]">
            <label class="mb-1 block text-xs font-semibold text-gray-600 dark:text-gray-400">
              参考账户
            </label>
            <select
              v-model="sourceAccountId"
              class="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
            >
              <option v-for="account in accounts" :key="account.id" :value="account.id">
                {{ getAccountName(account) }}
              </option>
            </select>
          </div>
        </div>
      </div>

      <div
        v-for="group in visibleFieldGroups"
        :key="group.title"
        class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800"
      >
        <div class="mb-3 flex items-center gap-2">
          <i :class="['fas text-sm text-blue-500', group.icon]" />
          <h4 class="text-sm font-bold text-gray-900 dark:text-gray-100">{{ group.title }}</h4>
        </div>

        <div class="grid gap-4 md:grid-cols-2">
          <div v-for="field in group.fields" :key="field.key" class="space-y-2">
            <div class="flex items-center justify-between gap-3">
              <label class="text-sm font-semibold text-gray-700 dark:text-gray-200">
                {{ field.label }}
              </label>
              <label class="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                <input
                  v-model="fieldEnabled[field.key]"
                  class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  type="checkbox"
                />
                覆写
              </label>
            </div>

            <input
              v-if="field.type === 'text'"
              v-model="form[field.key]"
              class="batch-input"
              :disabled="!fieldEnabled[field.key]"
              type="text"
            />

            <input
              v-else-if="field.type === 'number'"
              v-model.number="form[field.key]"
              class="batch-input"
              :disabled="!fieldEnabled[field.key]"
              min="0"
              type="number"
            />

            <input
              v-else-if="field.type === 'time'"
              v-model="form[field.key]"
              class="batch-input"
              :disabled="!fieldEnabled[field.key]"
              type="time"
            />

            <select
              v-else-if="field.type === 'select'"
              v-model="form[field.key]"
              class="batch-input"
              :disabled="!fieldEnabled[field.key]"
            >
              <option v-for="option in field.options" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </select>

            <label
              v-else-if="field.type === 'boolean'"
              class="flex h-10 items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
              :class="{ 'opacity-60': !fieldEnabled[field.key] }"
            >
              <input
                v-model="form[field.key]"
                class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                :disabled="!fieldEnabled[field.key]"
                type="checkbox"
              />
              {{ form[field.key] ? '启用' : '关闭' }}
            </label>

            <textarea
              v-else-if="field.type === 'textarea'"
              v-model="form[field.key]"
              class="batch-textarea"
              :disabled="!fieldEnabled[field.key]"
              rows="5"
            />

            <div v-else-if="field.type === 'accountType'" class="space-y-2">
              <select
                v-model="form.accountType"
                class="batch-input"
                :disabled="!fieldEnabled.accountType"
              >
                <option value="shared">共享池</option>
                <option value="dedicated">专属绑定</option>
                <option value="group">分组调度</option>
              </select>
              <el-select
                v-if="form.accountType === 'group'"
                v-model="form.groupIds"
                class="w-full"
                collapse-tags
                collapse-tags-tooltip
                :disabled="!fieldEnabled.accountType"
                multiple
                placeholder="选择分组"
              >
                <el-option
                  v-for="groupOption in filteredGroups"
                  :key="groupOption.id"
                  :label="groupOption.name"
                  :value="groupOption.id"
                />
              </el-select>
            </div>

            <p class="text-xs text-gray-500 dark:text-gray-400">
              <span v-if="isMixedField(field.key)" class="text-amber-600 dark:text-amber-300">
                当前选中账户该字段不完全一致。
              </span>
              <span v-else>{{ field.hint }}</span>
            </p>
          </div>
        </div>
      </div>

      <div
        v-if="selectedFieldLabels.length > 0"
        class="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800 dark:border-green-800 dark:bg-green-900/20 dark:text-green-200"
      >
        将覆写 {{ accounts.length }} 个账户的字段：{{ selectedFieldLabels.join('、') }}
      </div>
      <div
        v-else
        class="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400"
      >
        请选择至少一个字段进行覆写。
      </div>

      <p v-if="errorMessage" class="rounded-lg bg-red-50 p-3 text-sm text-red-600">
        {{ errorMessage }}
      </p>
    </div>

    <template #footer>
      <div class="flex justify-end gap-3">
        <button
          class="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
          :disabled="saving"
          @click="handleClose"
        >
          取消
        </button>
        <button
          class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          :disabled="saving || !samePlatform || selectedFieldLabels.length === 0"
          @click="handleSubmit"
        >
          <i v-if="saving" class="fas fa-spinner fa-spin mr-2" />
          保存批量修改
        </button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'

const props = defineProps({
  accounts: {
    type: Array,
    default: () => []
  },
  accountGroups: {
    type: Array,
    default: () => []
  },
  saving: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['close', 'submit'])

const PLATFORM_LABELS = {
  claude: 'Claude 官方/OAuth',
  'claude-console': 'Claude Console',
  ccr: 'CCR Relay',
  bedrock: 'Bedrock',
  openai: 'OpenAI 官方',
  'openai-responses': 'OpenAI Responses',
  azure_openai: 'Azure OpenAI',
  'gemini-api': 'Gemini API',
  gemini: 'Gemini OAuth',
  droid: 'Droid'
}

const GROUP_PLATFORM_MAP = {
  'claude-console': 'claude',
  ccr: 'claude',
  'openai-responses': 'openai',
  'gemini-api': 'gemini'
}

const URL_FIELD_BY_PLATFORM = {
  'claude-console': {
    key: 'apiUrl',
    label: 'API URL',
    hint: '上游 Claude Console 兼容地址。'
  },
  ccr: {
    key: 'apiUrl',
    label: 'API URL',
    hint: 'CCR Relay 上游地址。'
  },
  'gemini-api': {
    key: 'baseUrl',
    label: 'Base URL',
    hint: 'Gemini API 基础地址，保存时会去掉末尾斜杠。'
  },
  'openai-responses': {
    key: 'baseApi',
    label: 'Base API',
    hint: 'OpenAI Responses 兼容基础地址。'
  },
  azure_openai: {
    key: 'azureEndpoint',
    label: 'Azure Endpoint',
    hint: 'Azure OpenAI 资源地址。'
  }
}

const MODEL_MODE_BY_PLATFORM = {
  'claude-console': 'mapping',
  ccr: 'mapping',
  'gemini-api': 'list',
  azure_openai: 'list'
}

const sourceAccountId = ref('')
const errorMessage = ref('')
const fieldEnabled = reactive({})
const form = reactive({
  priority: 50,
  maxConcurrentTasks: 0,
  rateLimitDuration: 60,
  dailyQuota: 0,
  quotaResetTime: '00:00',
  accountType: 'shared',
  groupIds: [],
  apiUrl: '',
  baseUrl: '',
  baseApi: '',
  azureEndpoint: '',
  apiVersion: '',
  deploymentName: '',
  providerEndpoint: 'responses',
  userAgent: '',
  disableAutoProtection: false,
  interceptWarmup: false,
  supportedModelsText: '',
  proxyText: ''
})

const selectedPlatform = computed(() => props.accounts[0]?.platform || '')
const platformLabel = computed(
  () => PLATFORM_LABELS[selectedPlatform.value] || selectedPlatform.value
)

const samePlatform = computed(() => {
  if (props.accounts.length === 0) {
    return true
  }
  return props.accounts.every((account) => account.platform === selectedPlatform.value)
})

const modelMode = computed(() => MODEL_MODE_BY_PLATFORM[selectedPlatform.value] || '')

const filteredGroups = computed(() => {
  const groupPlatform = GROUP_PLATFORM_MAP[selectedPlatform.value] || selectedPlatform.value
  return props.accountGroups.filter((group) => group.platform === groupPlatform)
})

const visibleFieldGroups = computed(() => {
  const groups = [
    {
      title: '调度',
      icon: 'fa-sliders-h',
      fields: [
        {
          key: 'priority',
          label: '优先级',
          type: 'number',
          hint: '数值越大越优先，范围 1-100。'
        }
      ]
    }
  ]

  if (supportsAccountType(selectedPlatform.value)) {
    groups[0].fields.push({
      key: 'accountType',
      label: '账户类型 / 分组',
      type: 'accountType',
      hint: '共享池、专属绑定或分组调度。'
    })
  }

  if (selectedPlatform.value === 'claude-console') {
    groups[0].fields.push({
      key: 'maxConcurrentTasks',
      label: '最大并发',
      type: 'number',
      hint: '0 表示不限制。'
    })
  }

  if (supportsRateLimitDuration(selectedPlatform.value)) {
    groups[0].fields.push({
      key: 'rateLimitDuration',
      label: '限流恢复时间',
      type: 'number',
      hint: '单位分钟，0 表示不启用限流。'
    })
  }

  if (supportsDisableAutoProtection(selectedPlatform.value)) {
    groups[0].fields.push({
      key: 'disableAutoProtection',
      label: '关闭自动保护',
      type: 'boolean',
      hint: '关闭后不再自动标记上游错误保护。'
    })
  }

  if (selectedPlatform.value === 'claude-console') {
    groups[0].fields.push({
      key: 'interceptWarmup',
      label: '拦截预热请求',
      type: 'boolean',
      hint: '用于 Claude Console 账户预热请求控制。'
    })
  }

  const upstreamFields = []
  const urlField = URL_FIELD_BY_PLATFORM[selectedPlatform.value]
  if (urlField) {
    upstreamFields.push({ ...urlField, type: 'text' })
  }
  if (selectedPlatform.value === 'azure_openai') {
    upstreamFields.push(
      {
        key: 'apiVersion',
        label: 'API Version',
        type: 'text',
        hint: 'Azure OpenAI API 版本。'
      },
      {
        key: 'deploymentName',
        label: 'Deployment Name',
        type: 'text',
        hint: 'Azure 部署名称。'
      }
    )
  }
  if (selectedPlatform.value === 'openai-responses') {
    upstreamFields.push({
      key: 'providerEndpoint',
      label: 'Provider Endpoint',
      type: 'select',
      options: [
        { value: 'responses', label: 'Responses' },
        { value: 'auto', label: 'Auto' }
      ],
      hint: '控制上游请求入口。'
    })
  }
  if (upstreamFields.length > 0) {
    groups.push({ title: '上游', icon: 'fa-plug', fields: upstreamFields })
  }

  const modelFields = []
  if (modelMode.value) {
    modelFields.push({
      key: 'supportedModelsText',
      label: modelMode.value === 'mapping' ? '模型映射' : '模型白名单',
      type: 'textarea',
      hint:
        modelMode.value === 'mapping'
          ? '每行一个映射：from => to；单独写模型名表示映射到自身。'
          : '每行一个模型名；留空表示不限制。'
    })
  }
  if (modelFields.length > 0) {
    groups.push({ title: '模型', icon: 'fa-list', fields: modelFields })
  }

  const quotaFields = []
  if (supportsQuota(selectedPlatform.value)) {
    quotaFields.push(
      {
        key: 'dailyQuota',
        label: '每日限额',
        type: 'number',
        hint: '0 表示不限制。'
      },
      {
        key: 'quotaResetTime',
        label: '重置时间',
        type: 'time',
        hint: '按服务端本地时间重置。'
      }
    )
  }
  if (quotaFields.length > 0) {
    groups.push({ title: '额度', icon: 'fa-wallet', fields: quotaFields })
  }

  const networkFields = []
  if (supportsUserAgent(selectedPlatform.value)) {
    networkFields.push({
      key: 'userAgent',
      label: 'User-Agent',
      type: 'text',
      hint: '留空表示使用默认。'
    })
  }
  if (supportsProxy(selectedPlatform.value)) {
    networkFields.push({
      key: 'proxyText',
      label: '代理配置',
      type: 'textarea',
      hint: 'JSON 对象；留空并覆写表示清空代理。'
    })
  }
  if (networkFields.length > 0) {
    groups.push({ title: '网络', icon: 'fa-network-wired', fields: networkFields })
  }

  return groups
})

const visibleFieldKeys = computed(() =>
  visibleFieldGroups.value.flatMap((group) => group.fields.map((field) => field.key))
)

const selectedFieldLabels = computed(() =>
  visibleFieldGroups.value
    .flatMap((group) => group.fields)
    .filter((field) => fieldEnabled[field.key])
    .map((field) => field.label)
)

watch(
  () => props.accounts,
  (accounts) => {
    const firstAccount = accounts[0]
    sourceAccountId.value = firstAccount?.id || ''
    seedFormFromAccount(firstAccount)
    resetFieldEnabled()
  },
  { immediate: true }
)

watch(sourceAccountId, (accountId) => {
  const source = props.accounts.find((account) => account.id === accountId)
  seedFormFromAccount(source)
})

function supportsAccountType(platform) {
  return [
    'claude',
    'claude-console',
    'ccr',
    'gemini',
    'gemini-api',
    'openai',
    'openai-responses',
    'droid'
  ].includes(platform)
}

function supportsRateLimitDuration(platform) {
  return ['claude-console', 'ccr', 'gemini-api', 'bedrock'].includes(platform)
}

function supportsDisableAutoProtection(platform) {
  return ['claude-console', 'ccr', 'gemini-api', 'openai-responses'].includes(platform)
}

function supportsQuota(platform) {
  return ['claude-console', 'ccr', 'openai-responses'].includes(platform)
}

function supportsUserAgent(platform) {
  return ['claude-console', 'ccr', 'openai-responses'].includes(platform)
}

function supportsProxy(platform) {
  return ['claude-console', 'ccr', 'gemini-api', 'openai-responses', 'bedrock'].includes(platform)
}

function resetFieldEnabled() {
  for (const key of Object.keys(fieldEnabled)) {
    delete fieldEnabled[key]
  }
  for (const key of visibleFieldKeys.value) {
    fieldEnabled[key] = false
  }
}

function getAccountName(account) {
  return account?.name || account?.email || account?.accountName || account?.id || '未命名账户'
}

function toNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === '') {
    return fallback
  }
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
}

function toBoolean(value) {
  return value === true || value === 'true' || value === 1 || value === '1'
}

function getAccountGroupIds(account) {
  if (!account) {
    return []
  }
  if (Array.isArray(account.groupInfos)) {
    return account.groupInfos.map((group) => group.id).filter(Boolean)
  }
  if (Array.isArray(account.groups)) {
    return account.groups.map((group) => group.id || group).filter(Boolean)
  }
  if (Array.isArray(account.groupIds)) {
    return account.groupIds.filter(Boolean)
  }
  if (account.groupId) {
    return [account.groupId]
  }
  return []
}

function normalizeComparable(value) {
  if (value === null || value === undefined) {
    return ''
  }
  if (typeof value === 'object') {
    return JSON.stringify(value)
  }
  return String(value)
}

function getComparableFieldValue(account, key) {
  if (key === 'accountType') {
    return {
      accountType: account?.accountType || 'shared',
      groupIds: getAccountGroupIds(account).sort()
    }
  }
  if (key === 'supportedModelsText') {
    return account?.supportedModels || []
  }
  if (key === 'proxyText') {
    return account?.proxy || null
  }
  return account?.[key]
}

function isMixedField(key) {
  if (props.accounts.length <= 1) {
    return false
  }
  const firstValue = normalizeComparable(getComparableFieldValue(props.accounts[0], key))
  return props.accounts
    .slice(1)
    .some((account) => normalizeComparable(getComparableFieldValue(account, key)) !== firstValue)
}

function formatProxy(proxy) {
  if (!proxy) {
    return ''
  }
  if (typeof proxy === 'string') {
    try {
      return JSON.stringify(JSON.parse(proxy), null, 2)
    } catch {
      return proxy
    }
  }
  return JSON.stringify(proxy, null, 2)
}

function formatSupportedModels(models) {
  if (!models) {
    return ''
  }
  if (modelMode.value === 'mapping') {
    if (Array.isArray(models)) {
      return models.map((model) => `${model} => ${model}`).join('\n')
    }
    if (typeof models === 'object') {
      return Object.entries(models)
        .map(([from, to]) => `${from} => ${to}`)
        .join('\n')
    }
    return ''
  }
  if (Array.isArray(models)) {
    return models.join('\n')
  }
  if (typeof models === 'object') {
    return Object.keys(models).join('\n')
  }
  return ''
}

function seedFormFromAccount(account) {
  if (!account) {
    return
  }
  form.priority = toNumber(account.priority, 50)
  form.maxConcurrentTasks = toNumber(account.maxConcurrentTasks, 0)
  form.rateLimitDuration = toNumber(account.rateLimitDuration, 60)
  form.dailyQuota = toNumber(account.dailyQuota, 0)
  form.quotaResetTime = account.quotaResetTime || '00:00'
  form.accountType = account.accountType || 'shared'
  form.groupIds = getAccountGroupIds(account)
  form.apiUrl = account.apiUrl || ''
  form.baseUrl = account.baseUrl || ''
  form.baseApi = account.baseApi || ''
  form.azureEndpoint = account.azureEndpoint || ''
  form.apiVersion = account.apiVersion || ''
  form.deploymentName = account.deploymentName || ''
  form.providerEndpoint = account.providerEndpoint || 'responses'
  form.userAgent = account.userAgent || ''
  form.disableAutoProtection = toBoolean(account.disableAutoProtection)
  form.interceptWarmup = toBoolean(account.interceptWarmup)
  form.supportedModelsText = formatSupportedModels(account.supportedModels)
  form.proxyText = formatProxy(account.proxy)
}

function parseProxyText(value) {
  const text = String(value || '').trim()
  if (!text) {
    return null
  }
  try {
    const parsed = JSON.parse(text)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('代理配置必须是 JSON 对象')
    }
    return parsed
  } catch (error) {
    throw new Error(error.message || '代理配置不是合法 JSON')
  }
}

function parseModelMappingText(value) {
  const mapping = {}
  const lines = String(value || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  for (const line of lines) {
    const parts = line.includes('=>') ? line.split('=>') : line.split('|')
    const from = String(parts[0] || '').trim()
    const to = String(parts[1] || parts[0] || '').trim()
    if (from && to) {
      mapping[from] = to
    }
  }
  return mapping
}

function parseModelListText(value) {
  return Array.from(
    new Set(
      String(value || '')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
    )
  )
}

function validateNumberRange(key, label, min, max = null) {
  const value = Number(form[key])
  if (!Number.isFinite(value) || value < min || (max !== null && value > max)) {
    throw new Error(`${label} 必须是 ${min}${max === null ? ' 以上' : `-${max}`} 的数字`)
  }
  return value
}

function buildPatch() {
  const patch = {}

  if (fieldEnabled.priority) {
    patch.priority = validateNumberRange('priority', '优先级', 1, 100)
  }
  if (fieldEnabled.maxConcurrentTasks) {
    patch.maxConcurrentTasks = validateNumberRange('maxConcurrentTasks', '最大并发', 0)
  }
  if (fieldEnabled.rateLimitDuration) {
    patch.rateLimitDuration = validateNumberRange('rateLimitDuration', '限流恢复时间', 0)
  }
  if (fieldEnabled.dailyQuota) {
    patch.dailyQuota = validateNumberRange('dailyQuota', '每日限额', 0)
  }
  if (fieldEnabled.quotaResetTime) {
    patch.quotaResetTime = form.quotaResetTime || '00:00'
  }
  if (fieldEnabled.accountType) {
    patch.accountType = form.accountType
    if (form.accountType === 'group') {
      if (!Array.isArray(form.groupIds) || form.groupIds.length === 0) {
        throw new Error('分组调度需要至少选择一个分组')
      }
      patch.groupIds = [...form.groupIds]
      patch.groupId = form.groupIds[0]
    } else {
      patch.groupIds = []
      patch.groupId = ''
    }
  }
  for (const key of [
    'apiUrl',
    'baseUrl',
    'baseApi',
    'azureEndpoint',
    'apiVersion',
    'deploymentName'
  ]) {
    if (fieldEnabled[key]) {
      patch[key] = String(form[key] || '').trim()
    }
  }
  if (fieldEnabled.providerEndpoint) {
    patch.providerEndpoint = form.providerEndpoint || 'responses'
  }
  if (fieldEnabled.userAgent) {
    patch.userAgent = String(form.userAgent || '').trim()
  }
  if (fieldEnabled.disableAutoProtection) {
    patch.disableAutoProtection = !!form.disableAutoProtection
  }
  if (fieldEnabled.interceptWarmup) {
    patch.interceptWarmup = !!form.interceptWarmup
  }
  if (fieldEnabled.supportedModelsText) {
    patch.supportedModels =
      modelMode.value === 'mapping'
        ? parseModelMappingText(form.supportedModelsText)
        : parseModelListText(form.supportedModelsText)
  }
  if (fieldEnabled.proxyText) {
    patch.proxy = parseProxyText(form.proxyText)
  }

  return patch
}

function handleSubmit() {
  errorMessage.value = ''
  try {
    const patch = buildPatch()
    if (Object.keys(patch).length === 0) {
      errorMessage.value = '请选择至少一个字段进行覆写'
      return
    }
    emit('submit', {
      platform: selectedPlatform.value,
      fields: Object.keys(patch),
      patch
    })
  } catch (error) {
    errorMessage.value = error.message || '批量编辑参数不合法'
  }
}

function handleClose() {
  if (!props.saving) {
    emit('close')
  }
}
</script>

<style scoped>
.batch-input {
  @apply h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-800 shadow-sm transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:disabled:bg-gray-800 dark:disabled:text-gray-500;
}

.batch-textarea {
  @apply w-full resize-y rounded-lg border border-gray-200 bg-white px-3 py-2 font-mono text-sm text-gray-800 shadow-sm transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:disabled:bg-gray-800 dark:disabled:text-gray-500;
}
</style>
