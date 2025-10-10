<template>
  <Teleport to="body">
    <div v-if="show" class="modal fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <div
        class="modal-content custom-scrollbar mx-auto max-h-[90vh] w-full max-w-2xl overflow-y-auto p-4 sm:p-6 md:p-8"
      >
        <div class="mb-4 flex items-center justify-between sm:mb-6">
          <div class="flex items-center gap-2 sm:gap-3">
            <div
              class="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 sm:h-10 sm:w-10 sm:rounded-xl"
            >
              <i class="fas fa-server text-sm text-white sm:text-base" />
            </div>
            <h3 class="text-lg font-bold text-gray-900 dark:text-gray-100 sm:text-xl">
              批量设置代理
            </h3>
          </div>
          <button
            class="p-1 text-gray-400 transition-colors hover:text-gray-600 dark:hover:text-gray-300"
            @click="$emit('close')"
          >
            <i class="fas fa-times text-lg sm:text-xl" />
          </button>
        </div>

        <!-- 选中账户提示 -->
        <div
          class="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-700 dark:bg-blue-900/30"
        >
          <p class="text-sm text-blue-700 dark:text-blue-300">
            <i class="fas fa-info-circle mr-1" />
            将为 <strong>{{ selectedCount }}</strong> 个账户设置代理配置
          </p>
        </div>

        <!-- 代理配置组件 -->
        <ProxyConfig v-model="proxyConfig" />

        <!-- 操作按钮 -->
        <div class="mt-6 flex gap-3">
          <button
            class="flex-1 rounded-xl bg-gray-100 px-6 py-3 font-semibold text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
            type="button"
            @click="$emit('close')"
          >
            取消
          </button>
          <button
            class="flex-1 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-3 font-semibold text-white transition-all hover:from-blue-700 hover:to-indigo-700 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="isSubmitting"
            type="button"
            @click="handleSubmit"
          >
            <span v-if="isSubmitting">
              <i class="fas fa-spinner fa-spin mr-2" />
              处理中...
            </span>
            <span v-else>
              <i class="fas fa-check mr-2" />
              确定
            </span>
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref } from 'vue'
import ProxyConfig from './ProxyConfig.vue'

defineProps({
  show: {
    type: Boolean,
    default: false
  },
  selectedCount: {
    type: Number,
    default: 0
  }
})

const emit = defineEmits(['close', 'submit'])

// 代理配置数据
const proxyConfig = ref({
  enabled: false,
  type: 'socks5',
  host: '',
  port: '',
  username: '',
  password: ''
})

// 提交状态
const isSubmitting = ref(false)

// 提交处理
const handleSubmit = () => {
  isSubmitting.value = true
  try {
    emit('submit', proxyConfig.value)
  } finally {
    isSubmitting.value = false
  }
}
</script>
