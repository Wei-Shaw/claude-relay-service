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

      <!-- 快速配置输入框 -->
      <div>
        <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
          快速配置
          <span class="ml-1 text-xs font-normal text-gray-500 dark:text-gray-400">
            (粘贴完整代理URL自动填充)
          </span>
        </label>
        <div class="relative">
          <input
            v-model="proxyUrl"
            class="form-input w-full border-gray-300 pr-10 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
            placeholder="例如: socks5://username:password@host:port 或 http://host:port"
            type="text"
            @input="handleInput"
            @keyup.enter="parseProxyUrl"
            @paste="handlePaste"
          />
          <button
            v-if="proxyUrl"
            class="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-400"
            type="button"
            @click="clearProxyUrl"
          >
            <i class="fas fa-times" />
          </button>
        </div>
        <p v-if="parseError" class="mt-1 text-xs text-red-500">
          <i class="fas fa-exclamation-circle mr-1" />
          {{ parseError }}
        </p>
        <p v-else-if="parseSuccess" class="mt-1 text-xs text-green-500">
          <i class="fas fa-check-circle mr-1" />
          代理配置已自动填充
        </p>
      </div>

      <div class="my-3 border-t border-gray-200 dark:border-gray-600"></div>

      <div>
        <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
          >代理类型</label
        >
        <select
          v-model="proxy.type"
          class="form-input w-full border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
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
            class="form-input w-full border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
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
            class="form-input w-full border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
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
              class="form-input w-full border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
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
                class="form-input w-full border-gray-300 pr-10 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
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

// 快速配置相关
const proxyUrl = ref('')
const parseError = ref('')
const parseSuccess = ref(false)

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

// 解析代理URL
function parseProxyUrl() {
  parseError.value = ''
  parseSuccess.value = false

  if (!proxyUrl.value) {
    return
  }

  try {
    // 移除 # 后面的别名部分
    const urlWithoutAlias = proxyUrl.value.split('#')[0].trim()

    if (!urlWithoutAlias) {
      return
    }

    // 正则表达式匹配代理URL格式
    // 支持格式：protocol://[username:password@]host:port
    const proxyPattern = /^(socks5|https?):\/\/(?:([^:@]+):([^@]+)@)?([^:]+):(\d+)$/i
    const match = urlWithoutAlias.match(proxyPattern)

    if (!match) {
      // 尝试简单格式：host:port（默认为socks5）
      const simplePattern = /^([^:]+):(\d+)$/
      const simpleMatch = urlWithoutAlias.match(simplePattern)

      if (simpleMatch) {
        proxy.value.type = 'socks5'
        proxy.value.host = simpleMatch[1]
        proxy.value.port = simpleMatch[2]
        proxy.value.username = ''
        proxy.value.password = ''
        showAuth.value = false
        parseSuccess.value = true
        emitUpdate()

        // 3秒后清除成功提示
        setTimeout(() => {
          parseSuccess.value = false
        }, 3000)
        return
      }

      parseError.value = '无效的代理URL格式，请检查输入'
      return
    }

    // 解析匹配结果
    const [, protocol, username, password, host, port] = match

    // 填充表单
    proxy.value.type = protocol.toLowerCase()
    proxy.value.host = host
    proxy.value.port = port

    // 处理认证信息
    if (username && password) {
      proxy.value.username = decodeURIComponent(username)
      proxy.value.password = decodeURIComponent(password)
      showAuth.value = true
    } else {
      proxy.value.username = ''
      proxy.value.password = ''
      showAuth.value = false
    }

    parseSuccess.value = true
    emitUpdate()

    // 3秒后清除成功提示
    setTimeout(() => {
      parseSuccess.value = false
    }, 3000)
  } catch (error) {
    // 解析代理URL失败
    parseError.value = '解析失败，请检查URL格式'
  }
}

// 清空快速配置输入
function clearProxyUrl() {
  proxyUrl.value = ''
  parseError.value = ''
  parseSuccess.value = false
}

// 处理粘贴事件
function handlePaste() {
  // 延迟一下以确保v-model已经更新
  setTimeout(() => {
    parseProxyUrl()
  }, 0)
}

// 处理输入事件
function handleInput() {
  // 检测是否输入了代理URL格式
  const value = proxyUrl.value.trim()

  // 如果输入包含://，说明可能是完整的代理URL
  if (value.includes('://')) {
    // 检查是否看起来像完整的URL（有协议、主机和端口）
    if (
      /^(socks5|https?):\/\/[^:]+:\d+/i.test(value) ||
      /^(socks5|https?):\/\/[^:@]+:[^@]+@[^:]+:\d+/i.test(value)
    ) {
      parseProxyUrl()
    }
  }
  // 如果是简单的 host:port 格式，并且端口号输入完整
  else if (/^[^:]+:\d{2,5}$/.test(value)) {
    parseProxyUrl()
  }
}

// 组件销毁时清理定时器
onUnmounted(() => {
  if (updateTimer) {
    clearTimeout(updateTimer)
  }
})
</script>
