<template>
  <Teleport to="body">
    <div
      v-if="show"
      class="fixed inset-0 z-[1050] flex items-center justify-center bg-gray-900/40 p-4 backdrop-blur-sm"
    >
      <div class="absolute inset-0" @click="handleClose" />
      <div
        class="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-gray-200/70 bg-white shadow-2xl ring-1 ring-black/5 dark:border-gray-700/60 dark:bg-gray-900 dark:ring-white/10"
        @click.stop
      >
        <div
          class="flex items-start justify-between border-b border-gray-100 px-5 py-4 dark:border-gray-800"
        >
          <div class="flex items-center gap-3">
            <div
              class="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 text-white shadow-lg"
            >
              <i class="fas fa-check-circle" />
            </div>
            <div>
              <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100">激活 API Key</h3>
              <p class="max-w-[260px] truncate text-xs text-gray-500 dark:text-gray-400">
                {{ apiKey?.name || '未命名 API Key' }}
              </p>
            </div>
          </div>
          <button
            class="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-gray-500 transition hover:bg-gray-200 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
            :disabled="loading"
            title="关闭"
            @click="handleClose"
          >
            <i class="fas fa-times text-sm" />
          </button>
        </div>

        <div class="space-y-5 px-5 py-5">
          <div
            v-if="hasScheduledActivation"
            class="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-500/30 dark:bg-amber-500/10"
          >
            <div class="flex items-start gap-2.5">
              <i class="fas fa-clock mt-0.5 text-amber-500" />
              <div class="min-w-0 flex-1">
                <p class="font-medium text-amber-900 dark:text-amber-200">已安排定时激活</p>
                <p class="mt-0.5 text-xs text-amber-800/80 dark:text-amber-200/70">
                  {{ formatDateTime(apiKey.scheduledActivationAt) }}
                </p>
              </div>
              <button
                class="text-xs font-medium text-amber-700 transition hover:text-amber-900 disabled:cursor-not-allowed disabled:opacity-50 dark:text-amber-300 dark:hover:text-amber-100"
                :disabled="loading"
                @click="cancelSchedule"
              >
                取消计划
              </button>
            </div>
          </div>

          <div>
            <p class="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">选择激活方式</p>
            <div class="grid grid-cols-2 gap-3">
              <button
                :class="[
                  'rounded-xl border p-3 text-left transition',
                  mode === 'immediate'
                    ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-500/20 dark:bg-emerald-500/10'
                    : 'border-gray-200 bg-white hover:border-emerald-300 hover:bg-emerald-50/50 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-emerald-700 dark:hover:bg-emerald-500/10'
                ]"
                :disabled="loading"
                @click="mode = 'immediate'"
              >
                <i
                  :class="[
                    'fas fa-bolt mb-2 block text-lg',
                    mode === 'immediate'
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-gray-400'
                  ]"
                />
                <span class="block text-sm font-semibold text-gray-900 dark:text-gray-100"
                  >立即激活</span
                >
                <span class="mt-0.5 block text-xs text-gray-500 dark:text-gray-400"
                  >现在即可使用</span
                >
              </button>
              <button
                :class="[
                  'rounded-xl border p-3 text-left transition',
                  mode === 'scheduled'
                    ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-500/20 dark:bg-blue-500/10'
                    : 'border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50/50 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-blue-700 dark:hover:bg-blue-500/10'
                ]"
                :disabled="loading"
                @click="mode = 'scheduled'"
              >
                <i
                  :class="[
                    'fas fa-clock mb-2 block text-lg',
                    mode === 'scheduled' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400'
                  ]"
                />
                <span class="block text-sm font-semibold text-gray-900 dark:text-gray-100"
                  >定时激活</span
                >
                <span class="mt-0.5 block text-xs text-gray-500 dark:text-gray-400"
                  >到指定时间生效</span
                >
              </button>
            </div>
          </div>

          <div v-if="mode === 'scheduled'">
            <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
              激活时间
            </label>
            <input
              v-model="scheduledAt"
              class="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
              :disabled="loading"
              :min="minimumDateTime"
              type="datetime-local"
              @input="validationError = ''"
            />
            <p v-if="validationError" class="mt-1.5 text-xs text-red-600 dark:text-red-400">
              {{ validationError }}
            </p>
            <p v-else class="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
              到达该时间后，服务端会自动激活此 Key。
            </p>
          </div>
        </div>

        <div
          class="flex items-center justify-end gap-3 border-t border-gray-100 bg-gray-50/80 px-5 py-3 dark:border-gray-800 dark:bg-gray-900/60"
        >
          <button
            class="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
            :disabled="loading"
            @click="handleClose"
          >
            取消
          </button>
          <button
            class="flex items-center gap-2 rounded-lg bg-gradient-to-r from-emerald-500 to-green-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:from-emerald-600 hover:to-green-700 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="loading"
            @click="submit"
          >
            <i
              :class="[
                'fas',
                loading ? 'fa-spinner fa-spin' : mode === 'scheduled' ? 'fa-clock' : 'fa-bolt'
              ]"
            />
            {{ loading ? '保存中...' : mode === 'scheduled' ? '保存定时激活' : '立即激活' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch } from 'vue'

const props = defineProps({
  show: {
    type: Boolean,
    default: false
  },
  apiKey: {
    type: Object,
    default: null
  },
  loading: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['close', 'submit'])

const mode = ref('immediate')
const scheduledAt = ref('')
const minimumDateTime = ref('')
const validationError = ref('')

const hasScheduledActivation = computed(() => Boolean(props.apiKey?.scheduledActivationAt))

const toDateTimeLocal = (value) => {
  const date = new Date(value)
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset())
  return date.toISOString().slice(0, 16)
}

const formatDateTime = (value) =>
  new Date(value).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })

const resetForm = () => {
  const minimumTime = new Date()
  minimumTime.setSeconds(0, 0)
  minimumTime.setMinutes(minimumTime.getMinutes() + 1)
  minimumDateTime.value = toDateTimeLocal(minimumTime)
  validationError.value = ''

  if (props.apiKey?.scheduledActivationAt) {
    mode.value = 'scheduled'
    scheduledAt.value = toDateTimeLocal(props.apiKey.scheduledActivationAt)
  } else {
    mode.value = 'immediate'
    scheduledAt.value = ''
  }
}

watch(
  () => [props.show, props.apiKey?.id],
  ([show]) => {
    if (show) resetForm()
  },
  { immediate: true }
)

const handleClose = () => {
  if (!props.loading) emit('close')
}

const cancelSchedule = () => {
  if (!props.loading) emit('submit', { mode: 'cancel' })
}

const submit = () => {
  if (mode.value === 'immediate') {
    emit('submit', { mode: 'immediate' })
    return
  }

  const activationTime = new Date(scheduledAt.value)
  if (
    !scheduledAt.value ||
    Number.isNaN(activationTime.getTime()) ||
    activationTime <= new Date()
  ) {
    validationError.value = '请选择未来的激活时间。'
    return
  }

  emit('submit', {
    mode: 'scheduled',
    scheduledAt: activationTime.toISOString()
  })
}
</script>
