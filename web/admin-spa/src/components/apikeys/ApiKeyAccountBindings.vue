<template>
  <div>
    <div class="mb-3 flex items-center justify-between">
      <label class="text-sm font-semibold text-gray-700 dark:text-gray-300">{{ title }}</label>
      <button
        class="flex items-center gap-1 text-sm text-blue-600 transition-colors hover:text-blue-800 disabled:cursor-not-allowed disabled:opacity-50 dark:text-blue-400 dark:hover:text-blue-300"
        :disabled="accountsLoading"
        title="刷新账号列表"
        type="button"
        @click="$emit('refresh')"
      >
        <i :class="['fas', accountsLoading ? 'fa-spinner fa-spin' : 'fa-sync-alt', 'text-xs']" />
        <span>{{ accountsLoading ? '刷新中...' : '刷新账号' }}</span>
      </button>
    </div>

    <div class="grid grid-cols-1 gap-3">
      <div v-for="item in bindingItems" :key="item.key">
        <label class="mb-1 block text-sm font-medium text-gray-600 dark:text-gray-400">
          {{ item.label }} 专属账号
        </label>
        <AccountSelector
          :accounts="accounts[item.accountsKey] || []"
          :default-option-text="getDefaultOptionText(item)"
          :disabled="!isServiceSelectable(item.requiredService)"
          :groups="item.groupsKey ? accounts[item.groupsKey] || [] : []"
          :model-value="modelValues[item.modelKey]"
          :placeholder="`请选择${item.label}账号`"
          :platform="item.platform"
          :special-options="specialOptions"
          @update:model-value="emitModelValue(item.modelKey, $event)"
        />
      </div>
    </div>

    <p v-if="description" class="mt-2 text-xs text-gray-500 dark:text-gray-400">
      {{ description }}
    </p>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import AccountSelector from '@/components/common/AccountSelector.vue'

const props = defineProps({
  accounts: {
    type: Object,
    required: true
  },
  permissions: {
    type: [Array, String],
    default: () => []
  },
  accountsLoading: {
    type: Boolean,
    default: false
  },
  title: {
    type: String,
    default: '专属账号绑定'
  },
  description: {
    type: String,
    default: ''
  },
  defaultOptionText: {
    type: String,
    default: ''
  },
  specialOptions: {
    type: Array,
    default: () => []
  },
  claudeAccountId: {
    type: String,
    default: ''
  },
  geminiAccountId: {
    type: String,
    default: ''
  },
  openaiAccountId: {
    type: String,
    default: ''
  },
  bedrockAccountId: {
    type: String,
    default: ''
  },
  droidAccountId: {
    type: String,
    default: ''
  }
})

const emit = defineEmits([
  'refresh',
  'update:claudeAccountId',
  'update:geminiAccountId',
  'update:openaiAccountId',
  'update:bedrockAccountId',
  'update:droidAccountId'
])

const bindingItems = [
  {
    key: 'claude',
    label: 'Claude',
    platform: 'claude',
    modelKey: 'claudeAccountId',
    accountsKey: 'claude',
    groupsKey: 'claudeGroups',
    requiredService: 'claude'
  },
  {
    key: 'gemini',
    label: 'Gemini',
    platform: 'gemini',
    modelKey: 'geminiAccountId',
    accountsKey: 'gemini',
    groupsKey: 'geminiGroups',
    requiredService: 'gemini'
  },
  {
    key: 'openai',
    label: 'OpenAI',
    platform: 'openai',
    modelKey: 'openaiAccountId',
    accountsKey: 'openai',
    groupsKey: 'openaiGroups',
    requiredService: 'openai'
  },
  {
    key: 'bedrock',
    label: 'Bedrock',
    platform: 'bedrock',
    modelKey: 'bedrockAccountId',
    accountsKey: 'bedrock',
    groupsKey: '',
    requiredService: 'claude'
  },
  {
    key: 'droid',
    label: 'Droid',
    platform: 'droid',
    modelKey: 'droidAccountId',
    accountsKey: 'droid',
    groupsKey: 'droidGroups',
    requiredService: 'droid'
  }
]

const modelValues = computed(() => ({
  claudeAccountId: props.claudeAccountId,
  geminiAccountId: props.geminiAccountId,
  openaiAccountId: props.openaiAccountId,
  bedrockAccountId: props.bedrockAccountId,
  droidAccountId: props.droidAccountId
}))

const isServiceSelectable = (service) => {
  if (!props.permissions) return true
  if (props.permissions === 'all') return true
  if (Array.isArray(props.permissions)) {
    return props.permissions.length === 0 || props.permissions.includes(service)
  }
  return props.permissions === service
}

const getDefaultOptionText = (item) => props.defaultOptionText || `请选择${item.label}账号`

const emitModelValue = (modelKey, value) => {
  emit(`update:${modelKey}`, value)
}
</script>
