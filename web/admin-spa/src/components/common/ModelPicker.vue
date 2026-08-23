<template>
  <div class="relative w-full">
    <div class="relative">
      <input
        ref="inputRef"
        class="w-full appearance-none rounded-xl border border-gray-300 bg-white px-4 py-2.5 pr-10 font-mono text-sm text-gray-900 shadow-sm transition-all focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
        :disabled="disabled"
        :placeholder="placeholder"
        type="text"
        :value="text"
        @blur="onBlur"
        @focus="open = true"
        @input="onInput"
      />
      <button
        class="absolute inset-y-0 right-0 flex items-center px-3 text-gray-400"
        :disabled="disabled"
        tabindex="-1"
        type="button"
        @mousedown.prevent="toggle"
      >
        <i class="fas fa-chevron-down text-sm" />
      </button>
    </div>

    <!-- 候选浮层：预设置顶 + 价格表全量，按输入过滤 -->
    <div
      v-if="open"
      class="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-800"
    >
      <button
        v-for="it in visible"
        :key="it.value"
        class="flex w-full flex-col items-start gap-0.5 px-4 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-700/60"
        :class="{ 'bg-blue-50 dark:bg-blue-500/10': it.value === text }"
        type="button"
        @mousedown.prevent="select(it.value)"
      >
        <span class="text-sm font-medium text-gray-800 dark:text-gray-200">
          {{ it.label }}
          <span
            v-if="it.preset"
            class="ml-1 rounded bg-gray-100 px-1.5 py-0.5 text-sm text-gray-500 dark:bg-gray-700 dark:text-gray-400"
            >预设</span
          >
        </span>
        <span
          v-if="it.label !== it.value"
          class="font-mono text-sm text-gray-500 dark:text-gray-400"
        >
          {{ it.value }}
        </span>
      </button>
      <div v-if="!visible.length" class="px-4 py-2 text-sm text-gray-500 dark:text-gray-400">
        无匹配，当前输入将作为自定义模型 ID
      </div>
      <div
        v-if="truncated"
        class="border-t border-gray-100 px-4 py-2 text-sm text-gray-400 dark:border-gray-700 dark:text-gray-500"
      >
        共 {{ matched.length }} 项，继续输入以缩小范围
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'

const props = defineProps({
  modelValue: { type: String, default: '' },
  presets: { type: Array, default: () => [] }, // [{ value, label }] 平台预设模型
  catalog: { type: Array, default: () => [] }, // [modelId] 模型价格表全量 id
  disabled: { type: Boolean, default: false },
  placeholder: { type: String, default: '选择或输入模型 ID...' }
})

const emit = defineEmits(['update:modelValue'])

const text = ref(props.modelValue)
const open = ref(false)
const inputRef = ref(null)

watch(
  () => props.modelValue,
  (v) => {
    if (v !== text.value) text.value = v
  }
)

// 预设置顶 + 价格表，按 value 去重
const allItems = computed(() => {
  const map = new Map()
  for (const p of props.presets) {
    if (p && p.value) {
      map.set(p.value, { value: p.value, label: p.label || p.value, preset: true })
    }
  }
  for (const id of props.catalog) {
    if (id && !map.has(id)) {
      map.set(id, { value: id, label: id, preset: false })
    }
  }
  return [...map.values()]
})

const matched = computed(() => {
  const q = text.value.trim().toLowerCase()
  if (!q) return allItems.value
  return allItems.value.filter(
    (it) => it.value.toLowerCase().includes(q) || it.label.toLowerCase().includes(q)
  )
})

const visible = computed(() => matched.value.slice(0, 50))
const truncated = computed(() => matched.value.length > 50)

const onInput = (e) => {
  text.value = e.target.value
  emit('update:modelValue', e.target.value)
  open.value = true
}

// 延迟关闭，确保候选项的 mousedown 先触发
const onBlur = () => {
  window.setTimeout(() => {
    open.value = false
  }, 120)
}

const select = (value) => {
  text.value = value
  emit('update:modelValue', value)
  open.value = false
}

const toggle = () => {
  if (props.disabled) return
  open.value = !open.value
  // 展开时聚焦输入框，保证点击别处能 blur 关闭浮层
  if (open.value) inputRef.value?.focus()
}
</script>
