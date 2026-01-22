<template>
  <Teleport to="body">
    <div class="modal fixed inset-0 z-50 flex items-center justify-center p-4">
      <div class="modal-content mx-auto flex max-h-[90vh] w-full max-w-md flex-col p-8">
        <div class="mb-6 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div
              class="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-green-500 to-green-600"
            >
              <i class="fas fa-clock text-white" />
            </div>
            <h3 class="text-xl font-bold text-gray-900">续期 API Key</h3>
          </div>
          <button
            class="text-gray-400 transition-colors hover:text-gray-600"
            @click="$emit('close')"
          >
            <i class="fas fa-times text-xl" />
          </button>
        </div>

        <div class="modal-scroll-content custom-scrollbar flex-1 space-y-6">
          <div class="rounded-lg border border-blue-200 bg-blue-50 p-4">
            <div class="flex items-start gap-3">
              <div
                class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-blue-500"
              >
                <i class="fas fa-info text-sm text-white" />
              </div>
              <div>
                <h4 class="mb-1 font-semibold text-gray-800">API Key 信息</h4>
                <p class="text-sm text-gray-700">
                  {{ apiKey.name }}
                </p>
                <p class="mt-1 text-xs text-gray-600">
                  当前过期时间：{{
                    apiKey.expiresAt ? formatExpireDate(apiKey.expiresAt) : '永不过期'
                  }}
                </p>
              </div>
            </div>
          </div>

          <div>
            <label class="mb-3 block text-sm font-semibold text-gray-700">续期时长</label>
            <select
              v-model="form.renewDuration"
              class="form-input w-full"
              @change="updateRenewExpireAt"
            >
              <option value="7d">延长 7 天</option>
              <option value="30d">延长 30 天</option>
              <option value="90d">延长 90 天</option>
              <option value="180d">延长 180 天</option>
              <option value="365d">延长 365 天</option>
              <option value="custom">自定义日期</option>
              <option value="permanent">设为永不过期</option>
            </select>
            <div v-if="form.renewDuration === 'custom'" class="mt-3">
              <input
                v-model="form.customExpireDate"
                class="form-input w-full"
                :min="minDateTime"
                type="datetime-local"
                @change="updateCustomRenewExpireAt"
              />
            </div>
            <p v-if="form.newExpiresAt" class="mt-2 text-xs text-gray-500">
              新的过期时间：{{ formatExpireDate(form.newExpiresAt) }}
            </p>
          </div>
        </div>

        <div class="flex gap-3 pt-4">
          <button
            class="flex-1 rounded-xl bg-gray-100 px-6 py-3 font-semibold text-gray-700 transition-colors hover:bg-gray-200"
            type="button"
            @click="$emit('close')"
          >
            取消
          </button>
          <button
            class="btn btn-primary flex-1 px-6 py-3 font-semibold"
            :disabled="loading || !form.renewDuration"
            type="button"
            @click="renewApiKey"
          >
            <div v-if="loading" class="loading-spinner mr-2" />
            <i v-else class="fas fa-clock mr-2" />
            {{ loading ? '续期中...' : '确认续期' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, reactive, computed } from 'vue'
import { showToast } from '@/utils/tools'
import * as httpApis from '@/utils/http_apis'

const props = defineProps({
  apiKey: {
    type: Object,
    required: true
  }
})

const emit = defineEmits(['close', 'success'])

const loading = ref(false)

// 表单数据
const form = reactive({
  renewDuration: '30d',
  customExpireDate: '',
  newExpiresAt: null
})

// 计算最小日期时间
const minDateTime = computed(() => {
  const now = new Date()
  // 如果有当前过期时间且未过期，从当前过期时间开始
  if (props.apiKey.expiresAt && new Date(props.apiKey.expiresAt) > now) {
    return new Date(props.apiKey.expiresAt).toISOString().slice(0, 16)
  }
  // 否则从现在开始
  now.setMinutes(now.getMinutes() + 1)
  return now.toISOString().slice(0, 16)
})

// 格式化过期日期
const formatExpireDate = (dateString) => {
  const date = new Date(dateString)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

// 更新续期后的过期时间
const updateRenewExpireAt = () => {
  if (!form.renewDuration) {
    form.newExpiresAt = null
    return
  }

  if (form.renewDuration === 'permanent') {
    form.newExpiresAt = null
    return
  }

  if (form.renewDuration === 'custom') {
    return
  }

  // 计算新的过期时间
  const baseDate =
    props.apiKey.expiresAt && new Date(props.apiKey.expiresAt) > new Date()
      ? new Date(props.apiKey.expiresAt)
      : new Date()

  const duration = form.renewDuration
  const match = duration.match(/(\d+)([dhmy])/)

  if (match) {
    const [, value, unit] = match
    const num = parseInt(value)

    switch (unit) {
      case 'd':
        baseDate.setDate(baseDate.getDate() + num)
        break
      case 'h':
        baseDate.setHours(baseDate.getHours() + num)
        break
      case 'm':
        baseDate.setMonth(baseDate.getMonth() + num)
        break
      case 'y':
        baseDate.setFullYear(baseDate.getFullYear() + num)
        break
    }

    form.newExpiresAt = baseDate.toISOString()
  }
}

// 更新自定义续期时间
const updateCustomRenewExpireAt = () => {
  if (form.customExpireDate) {
    form.newExpiresAt = new Date(form.customExpireDate).toISOString()
  }
}

// 续期 API Key
const renewApiKey = async () => {
  loading.value = true

  try {
    const data = {
      expiresAt: form.renewDuration === 'permanent' ? null : form.newExpiresAt
    }

    const result = await httpApis.updateApiKeyApi(props.apiKey.id, data)

    if (result.success) {
      showToast('API Key 续期成功', 'success')
      emit('success')
      emit('close')
    } else {
      showToast(result.message || '续期失败', 'error')
    }
  } catch (error) {
    showToast('续期失败', 'error')
  } finally {
    loading.value = false
  }
}

// 初始化
updateRenewExpireAt()
</script>
