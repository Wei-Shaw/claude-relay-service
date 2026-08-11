<template>
  <div class="flex items-center gap-2">
    <!-- 下拉选择模式 -->
    <CustomDropdown
      v-if="!customMode"
      accent="blue"
      class="flex-1"
      :disabled="disabled"
      icon="fa-cube"
      :model-value="modelValue"
      :options="dropdownOptions"
      placeholder="选择模型"
      size="sm"
      @update:model-value="handleSelectChange"
    />

    <!-- 自定义输入模式 -->
    <template v-else>
      <input
        class="flex-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm text-gray-700 placeholder-gray-400 transition focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:placeholder-gray-500"
        :disabled="disabled"
        :placeholder="placeholder"
        type="text"
        :value="modelValue"
        @input="$emit('update:modelValue', $event.target.value)"
      />
      <button
        class="flex-shrink-0 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1 text-sm text-gray-500 transition hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600"
        :disabled="disabled"
        title="返回列表"
        type="button"
        @click="exitCustomMode"
      >
        <i class="fas fa-list text-sm" />
      </button>
    </template>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  modelValue: { type: String, default: '' },
  models: { type: Array, default: () => [] },
  disabled: { type: Boolean, default: false },
  placeholder: { type: String, default: '输入模型 ID...' }
})

const emit = defineEmits(['update:modelValue'])

const customMode = ref(false)

const dropdownOptions = computed(() => [
  ...props.models.map((model) => ({
    value: model.value,
    label: model.label
  })),
  { value: '__custom__', label: '自定义模型...', icon: 'fa-pen' }
])

const handleSelectChange = (value) => {
  if (value === '__custom__') {
    customMode.value = true
    emit('update:modelValue', '')
    return
  }
  emit('update:modelValue', value)
}

const exitCustomMode = () => {
  customMode.value = false
  // 切回列表时选中第一个预设模型
  if (props.models.length > 0) {
    emit('update:modelValue', props.models[0].value)
  }
}
</script>
