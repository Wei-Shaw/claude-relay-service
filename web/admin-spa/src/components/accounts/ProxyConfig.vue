<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <h4 class="text-sm font-semibold text-gray-700">
        代理设置 (可选)
      </h4>
      <label class="flex items-center cursor-pointer">
        <input 
          v-model="proxy.enabled" 
          type="checkbox"
          class="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
        >
        <span class="ml-2 text-sm text-gray-700">启用代理</span>
      </label>
    </div>
    
    <div
      v-if="proxy.enabled"
      class="bg-gray-50 p-4 rounded-lg border border-gray-200 space-y-4"
    >
      <div class="flex items-start gap-3 mb-3">
        <div class="w-8 h-8 bg-gray-500 rounded-lg flex items-center justify-center flex-shrink-0">
          <i class="fas fa-server text-white text-sm" />
        </div>
        <div class="flex-1">
          <p class="text-sm text-gray-700">
            配置代理以访问受限的网络资源。支持 SOCKS5 和 HTTP 代理。
          </p>
          <p class="text-xs text-gray-500 mt-1">
            请确保代理服务器稳定可用，否则会影响账户的正常使用。
          </p>
        </div>
      </div>
      
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-2">代理类型</label>
        <select 
          v-model="proxy.type" 
          class="form-input w-full"
        >
          <option value="socks5">
            SOCKS5
          </option>
          <option value="http">
            HTTP
          </option>
          <option value="https">
            HTTPS
          </option>
        </select>
      </div>
      
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">主机地址</label>
          <input 
            v-model="proxy.host" 
            type="text" 
            placeholder="例如: 192.168.1.100" 
            class="form-input w-full"
          >
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">端口</label>
          <input 
            v-model="proxy.port" 
            type="number" 
            placeholder="例如: 1080" 
            class="form-input w-full"
          >
        </div>
      </div>
      
      <div class="space-y-4">
        <div class="flex items-center">
          <input 
            id="proxyAuth" 
            v-model="showAuth"
            type="checkbox"
            class="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
          >
          <label
            for="proxyAuth"
            class="ml-2 text-sm text-gray-700 cursor-pointer"
          >
            需要身份验证
          </label>
        </div>
        
        <div
          v-if="showAuth"
          class="grid grid-cols-2 gap-4"
        >
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">用户名</label>
            <input 
              v-model="proxy.username" 
              type="text" 
              placeholder="代理用户名" 
              class="form-input w-full"
            >
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">密码</label>
            <div class="relative">
              <input 
                v-model="proxy.password" 
                :type="showPassword ? 'text' : 'password'"
                placeholder="代理密码" 
                class="form-input w-full pr-10"
              >
              <button 
                type="button"
                class="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                @click="showPassword = !showPassword"
              >
                <i :class="showPassword ? 'fas fa-eye-slash' : 'fas fa-eye'" />
              </button>
            </div>
          </div>
        </div>
      </div>
      
      <div class="bg-blue-50 p-3 rounded-lg border border-blue-200">
        <p class="text-xs text-blue-700">
          <i class="fas fa-info-circle mr-1" />
          <strong>提示：</strong>代理设置将用于所有与此账户相关的API请求。请确保代理服务器支持HTTPS流量转发。
        </p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onUnmounted } from 'vue'

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
watch(() => props.modelValue, (newVal) => {
  // 只有当值真正不同时才更新，避免循环
  if (JSON.stringify(newVal) !== JSON.stringify(proxy.value)) {
    proxy.value = { ...newVal }
    showAuth.value = !!(newVal.username || newVal.password)
  }
}, { deep: true })

// 监听各个字段单独变化，而不是整个对象
watch(() => proxy.value.enabled, (newVal) => {
  emitUpdate()
})

watch(() => proxy.value.type, (newVal) => {
  emitUpdate()
})

watch(() => proxy.value.host, (newVal) => {
  emitUpdate()
})

watch(() => proxy.value.port, (newVal) => {
  emitUpdate()
})

watch(() => proxy.value.username, (newVal) => {
  emitUpdate()
})

watch(() => proxy.value.password, (newVal) => {
  emitUpdate()
})

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