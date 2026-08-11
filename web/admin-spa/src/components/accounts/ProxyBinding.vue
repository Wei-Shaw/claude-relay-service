<template>
  <div class="space-y-2">
    <!-- 不使用 -->
    <label class="proxy-mode-row">
      <input v-model="mode" type="radio" value="none" />
      <span>不使用代理</span>
    </label>

    <!-- 自定义代理（账户静态 proxy） -->
    <label class="proxy-mode-row">
      <input v-model="mode" type="radio" value="custom" />
      <span>自定义代理</span>
    </label>
    <div v-if="mode === 'custom'" class="pl-6">
      <ProxyConfig
        :model-value="modelValue"
        @update:model-value="(v) => emit('update:modelValue', v)"
      />
    </div>

    <!-- 代理池·分组 -->
    <label class="proxy-mode-row" :class="{ 'opacity-50': !canBindPool }">
      <input v-model="mode" :disabled="!canBindPool" type="radio" value="group" />
      <span>代理池 · 分组</span>
      <span class="text-sm text-gray-400">负载均衡 + 故障转移 + 健康检查</span>
    </label>
    <div v-if="mode === 'group'" class="pl-6">
      <CustomDropdown
        accent="blue"
        icon="fa-layer-group"
        :model-value="proxyGroupId"
        :options="groupOptions"
        placeholder="— 选择分组 —"
        @update:model-value="onGroupChange"
      />
    </div>

    <!-- 代理池·指定代理 -->
    <label class="proxy-mode-row" :class="{ 'opacity-50': !canBindPool }">
      <input v-model="mode" :disabled="!canBindPool" type="radio" value="proxy" />
      <span>代理池 · 指定代理</span>
      <span class="text-sm text-gray-400">固定单个，享受健康检查</span>
    </label>
    <div v-if="mode === 'proxy'" class="pl-6">
      <CustomDropdown
        accent="blue"
        icon="fa-server"
        :model-value="proxyId"
        :options="proxyOptions"
        placeholder="— 选择代理 —"
        @update:model-value="onProxyChange"
      />
    </div>

    <p v-if="poolSupported && !accountId" class="pl-1 text-sm text-amber-500">
      代理池绑定需先保存账户，再在编辑中设置（创建前的授权流程仅支持自定义代理）
    </p>
    <p v-else-if="!poolSupported" class="pl-1 text-sm text-gray-400">该平台暂不支持代理池绑定</p>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'

import ProxyConfig from './ProxyConfig.vue'
import * as httpApis from '@/utils/http_apis'

// 仅这些平台的 relay 已接入代理池解析，绑定才会真正生效
const POOL_SUPPORTED_PLATFORMS = [
  'claude',
  'claude-console',
  'ccr',
  'droid',
  'openai-responses',
  'azure_openai',
  'openai',
  'gemini',
  'gemini-antigravity',
  'gemini-api',
  'bedrock'
]

// 完全受控组件：mode 与三个绑定值都由父表单持有（props），本组件不保存任何模式/绑定状态。
// 切换模式时 emit update:mode + 更新对应绑定值并清空互斥项，全部随父表单一起保存。
const props = defineProps({
  modelValue: { type: Object, default: null },
  platform: { type: String, default: '' },
  accountId: { type: String, default: '' },
  proxyGroupId: { type: String, default: '' },
  proxyId: { type: String, default: '' },
  mode: { type: String, default: 'none' }
})
const emit = defineEmits([
  'update:modelValue',
  'update:proxyGroupId',
  'update:proxyId',
  'update:mode'
])

const groups = ref([])
const proxies = ref([])
const groupOptions = computed(() => [
  { value: '', label: '— 选择分组 —' },
  ...groups.value.map((group) => ({
    value: String(group.id),
    label: `${group.name} (${group.memberCount})`
  }))
])
const proxyOptions = computed(() => [
  { value: '', label: '— 选择代理 —' },
  ...proxies.value.map((proxy) => ({
    value: String(proxy.id),
    label: `${proxy.name} — ${proxy.url}`
  }))
])

const poolSupported = computed(() => POOL_SUPPORTED_PLATFORMS.includes(props.platform))
// 创建态（无 accountId）禁用代理池：池绑定 relay 时才解析，而创建前的授权流程（OAuth/SetupToken/Cookie/设备码）
// 在账户落库前发起、只能用静态 proxy；先存账户、再在编辑里绑池
const canBindPool = computed(() => poolSupported.value && !!props.accountId)

// 空静态 proxy（切到池子/不使用时清空表单静态代理）
const emptyProxy = () => ({
  enabled: false,
  type: 'socks5',
  host: '',
  port: '',
  username: '',
  password: ''
})

// mode 完全由父持有：get 直接返回 props.mode（无任何本地状态），set 更新模式并清互斥项
const mode = computed({
  get: () => props.mode,
  set: (next) => {
    emit('update:mode', next)
    if (next === 'none') {
      emit('update:proxyGroupId', '')
      emit('update:proxyId', '')
      emit('update:modelValue', emptyProxy())
    } else if (next === 'custom') {
      emit('update:proxyGroupId', '')
      emit('update:proxyId', '')
    } else if (next === 'group') {
      emit('update:proxyId', '')
      emit('update:modelValue', emptyProxy())
    } else if (next === 'proxy') {
      emit('update:proxyGroupId', '')
      emit('update:modelValue', emptyProxy())
    }
  }
})

const onGroupChange = (value) => {
  emit('update:proxyGroupId', value)
}

const onProxyChange = (value) => {
  emit('update:proxyId', value)
}

const loadPoolData = async () => {
  if (!poolSupported.value) {
    return
  }
  const [groupRes, proxyRes] = await Promise.all([
    httpApis.getProxyGroupsApi(),
    httpApis.getProxiesApi()
  ])
  if (groupRes.success) {
    groups.value = groupRes.data || []
  }
  if (proxyRes.success) {
    proxies.value = proxyRes.data || []
  }
}

onMounted(loadPoolData)
</script>

<style scoped>
.proxy-mode-row {
  @apply flex cursor-pointer items-center gap-2 text-sm text-gray-700 dark:text-gray-200;
}
</style>
