<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <h4 class="text-sm font-semibold text-gray-700 dark:text-gray-300">代理设置 (可选)</h4>
      <label class="flex cursor-pointer items-center">
        <input
          v-model="proxy.enabled"
          class="h-4 w-4 rounded border-gray-300 bg-gray-100 text-blue-600 focus:ring-blue-500"
          type="checkbox"
        />
        <span class="ml-2 text-sm text-gray-700 dark:text-gray-300">启用代理</span>
      </label>
    </div>

    <div
      v-if="proxy.enabled"
      class="space-y-4 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-600 dark:bg-gray-800"
    >
      <div class="mb-3 flex items-start gap-3">
        <div class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-gray-500">
          <i class="fas fa-server text-sm text-white" />
        </div>
        <div class="flex-1">
          <p class="text-sm text-gray-700 dark:text-gray-300">
            配置代理以访问受限的网络资源。支持 SOCKS5 和 HTTP 代理。
          </p>
          <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
            请确保代理服务器稳定可用，否则会影响账户的正常使用。
          </p>
        </div>
      </div>

      <div>
        <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
          >代理类型</label
        >
        <select
          v-model="proxy.type"
          class="form-input w-full dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
        >
          <option value="socks5">SOCKS5</option>
          <option value="http">HTTP</option>
          <option value="https">HTTPS</option>
        </select>
      </div>

      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
            >主机地址</label
          >
          <input
            v-model="proxy.host"
            class="form-input w-full dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
            placeholder="例如: 192.168.1.100"
            type="text"
          />
        </div>
        <div>
          <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
            >端口</label
          >
          <input
            v-model="proxy.port"
            class="form-input w-full dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
            placeholder="例如: 1080"
            type="number"
          />
        </div>
      </div>

      <div class="space-y-4">
        <div class="flex items-center">
          <input
            id="proxyAuth"
            v-model="showAuth"
            class="h-4 w-4 rounded border-gray-300 bg-gray-100 text-blue-600 focus:ring-blue-500"
            type="checkbox"
          />
          <label
            class="ml-2 cursor-pointer text-sm text-gray-700 dark:text-gray-300"
            for="proxyAuth"
          >
            需要身份验证
          </label>
        </div>

        <div v-if="showAuth" class="grid grid-cols-2 gap-4">
          <div>
            <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
              >用户名</label
            >
            <input
              v-model="proxy.username"
              class="form-input w-full dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
              placeholder="代理用户名"
              type="text"
            />
          </div>
          <div>
            <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
              >密码</label
            >
            <div class="relative">
              <input
                v-model="proxy.password"
                class="form-input w-full pr-10 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
                placeholder="代理密码"
                :type="showPassword ? 'text' : 'password'"
              />
              <button
                class="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-400"
                type="button"
                @click="showPassword = !showPassword"
              >
                <i :class="showPassword ? 'fas fa-eye-slash' : 'fas fa-eye'" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div
        class="rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-700 dark:bg-blue-900/30"
      >
        <p class="text-xs text-blue-700 dark:text-blue-300">
          <i class="fas fa-info-circle mr-1" />
          <strong>提示：</strong
          >代理设置将用于所有与此账户相关的API请求。请确保代理服务器支持HTTPS流量转发。
        </p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onUnmounted } from 'vue'

const props = defineProps({
  modelValue: {
    type: Object,
    default: () => ({
      enabled: false,
      type: 'socks5',
      host: '',
      port: '',
      username: '',
      password: ''
    })
  }
})

const emit = defineEmits(['update:modelValue'])

// 内部代理数据
const proxy = ref({ ...props.modelValue })

// UI状态
const showAuth = ref(!!(proxy.value.username || proxy.value.password))
const showPassword = ref(false)

// 监听modelValue变化，只在真正需要更新时才更新
watch(
  () => props.modelValue,
  (newVal) => {
    // 只有当值真正不同时才更新，避免循环
    if (JSON.stringify(newVal) !== JSON.stringify(proxy.value)) {
      proxy.value = { ...newVal }
      showAuth.value = !!(newVal.username || newVal.password)
    }
  },
  { deep: true }
)

// 监听各个字段单独变化，而不是整个对象
watch(
  () => proxy.value.enabled,
  () => {
    emitUpdate()
  }
)

watch(
  () => proxy.value.type,
  () => {
    emitUpdate()
  }
)

watch(
  () => proxy.value.host,
  () => {
    emitUpdate()
  }
)

watch(
  () => proxy.value.port,
  () => {
    emitUpdate()
  }
)

watch(
  () => proxy.value.username,
  () => {
    emitUpdate()
  }
)

watch(
  () => proxy.value.password,
  () => {
    emitUpdate()
  }
)

// 监听认证开关
watch(showAuth, (newVal) => {
  if (!newVal) {
    proxy.value.username = ''
    proxy.value.password = ''
    emitUpdate()
  }
})

// 防抖的更新函数
let updateTimer = null
function emitUpdate() {
  // 清除之前的定时器
  if (updateTimer) {
    clearTimeout(updateTimer)
  }

  // 设置新的定时器，延迟发送更新
  updateTimer = setTimeout(() => {
    const data = { ...proxy.value }

    // 如果不需要认证，清空用户名密码
    if (!showAuth.value) {
      data.username = ''
      data.password = ''
    }

    emit('update:modelValue', data)
  }, 100) // 100ms 延迟
}

// 组件销毁时清理定时器
onUnmounted(() => {
  if (updateTimer) {
    clearTimeout(updateTimer)
  }
})
</script>
