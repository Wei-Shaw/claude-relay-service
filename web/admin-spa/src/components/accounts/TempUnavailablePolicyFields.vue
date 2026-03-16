<template>
  <div :class="resolvedContainerClass">
    <label class="mb-3 block text-sm font-semibold text-gray-700 dark:text-gray-300">
      账号级临时冷却覆盖
    </label>
    <label class="inline-flex cursor-pointer items-center">
      <input
        :checked="disableTempUnavailable"
        class="mr-2 rounded border-gray-300 text-blue-600 focus:border-blue-500 focus:ring focus:ring-blue-200 dark:border-gray-600 dark:bg-gray-700"
        type="checkbox"
        @change="handleDisableChange"
      />
      <span class="text-sm text-gray-700 dark:text-gray-300">
        禁用该账号临时冷却（不再因 503/5xx 自动进入 TTL）
      </span>
    </label>
    <div class="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
      <div>
        <label class="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
          503 冷却秒数（留空=全局，0=关闭）
        </label>
        <input
          class="form-input w-full border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
          min="0"
          placeholder="例如 30"
          type="number"
          :value="tempUnavailable503TtlSeconds"
          @input="handle503Input"
        />
      </div>
      <div>
        <label class="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
          5xx 冷却秒数（留空=全局，0=关闭）
        </label>
        <input
          class="form-input w-full border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
          min="0"
          placeholder="例如 120"
          type="number"
          :value="tempUnavailable5xxTtlSeconds"
          @input="handle5xxInput"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  disableTempUnavailable: {
    type: Boolean,
    default: false
  },
  tempUnavailable503TtlSeconds: {
    type: [Number, String],
    default: ''
  },
  tempUnavailable5xxTtlSeconds: {
    type: [Number, String],
    default: ''
  },
  containerClass: {
    type: String,
    default: ''
  }
})

const emit = defineEmits([
  'update:disableTempUnavailable',
  'update:tempUnavailable503TtlSeconds',
  'update:tempUnavailable5xxTtlSeconds'
])

const resolvedContainerClass = computed(() => {
  const baseClass = 'rounded-lg border border-amber-200/60 p-3 dark:border-amber-700/40'
  return props.containerClass ? `${baseClass} ${props.containerClass}` : baseClass
})

const normalizeNumericInput = (value) => {
  if (value === '') {
    return ''
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : ''
}

const handleDisableChange = (event) => {
  emit('update:disableTempUnavailable', event.target.checked)
}

const handle503Input = (event) => {
  emit('update:tempUnavailable503TtlSeconds', normalizeNumericInput(event.target.value))
}

const handle5xxInput = (event) => {
  emit('update:tempUnavailable5xxTtlSeconds', normalizeNumericInput(event.target.value))
}
</script>
