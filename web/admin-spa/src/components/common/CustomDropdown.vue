<template>
  <div class="relative">
    <!-- 触发器 -->
    <div
      ref="triggerRef"
      class="relative flex cursor-pointer items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-sm transition-all duration-200 hover:shadow-md dark:border-gray-600 dark:bg-gray-800"
      :class="[isOpen && 'border-blue-400 shadow-md']"
      @click="toggleDropdown"
    >
      <i v-if="icon" :class="['fas', icon, 'text-sm', iconColor]"></i>
      <span
        class="select-none whitespace-nowrap text-sm font-medium text-gray-700 dark:text-gray-200"
      >
        {{ selectedLabel || placeholder }}
      </span>
      <i
        :class="[
          'fas fa-chevron-down ml-auto text-xs text-gray-400 transition-transform duration-200 dark:text-gray-500',
          isOpen && 'rotate-180'
        ]"
      ></i>
    </div>

    <!-- 下拉选项 - 使用 Teleport 将其移动到 body -->
    <Teleport to="body">
      <transition
        enter-active-class="transition duration-200 ease-out"
        enter-from-class="transform scale-95 opacity-0"
        enter-to-class="transform scale-100 opacity-100"
        leave-active-class="transition duration-150 ease-in"
        leave-from-class="transform scale-100 opacity-100"
        leave-to-class="transform scale-95 opacity-0"
      >
        <div
          v-if="isOpen"
          ref="dropdownRef"
          class="fixed z-[9999] min-w-max overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-600 dark:bg-gray-800"
          :style="dropdownStyle"
        >
          <div class="max-h-60 overflow-y-auto py-1">
            <div
              v-for="option in options"
              :key="option.value"
              class="flex cursor-pointer items-center gap-2 whitespace-nowrap px-3 py-2 text-sm transition-colors duration-150"
              :class="[
                option.value === modelValue
                  ? 'bg-blue-50 font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                  : 'text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700'
              ]"
              @click="selectOption(option)"
            >
              <i v-if="option.icon" :class="['fas', option.icon, 'text-xs']"></i>
              <span>{{ option.label }}</span>
              <i
                v-if="option.value === modelValue"
                class="fas fa-check ml-auto pl-3 text-xs text-blue-600"
              ></i>
            </div>
          </div>
        </div>
      </transition>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'

const props = defineProps({
  modelValue: {
    type: [String, Number],
    default: ''
  },
  options: {
    type: Array,
    required: true
  },
  placeholder: {
    type: String,
    default: '请选择'
  },
  icon: {
    type: String,
    default: ''
  },
  iconColor: {
    type: String,
    default: 'text-gray-500'
  }
})

const emit = defineEmits(['update:modelValue', 'change'])

const isOpen = ref(false)
const triggerRef = ref(null)
const dropdownRef = ref(null)
const dropdownStyle = ref({})

const selectedLabel = computed(() => {
  const selected = props.options.find((opt) => opt.value === props.modelValue)
  return selected ? selected.label : ''
})

const toggleDropdown = async () => {
  isOpen.value = !isOpen.value
  if (isOpen.value) {
    await nextTick()
    updateDropdownPosition()
  }
}

const closeDropdown = () => {
  isOpen.value = false
}

const selectOption = (option) => {
  emit('update:modelValue', option.value)
  emit('change', option.value)
  closeDropdown()
}

const updateDropdownPosition = () => {
  if (!triggerRef.value || !isOpen.value) return

  const trigger = triggerRef.value.getBoundingClientRect()
  const dropdownHeight = 250 // 预估高度
  const spaceBelow = window.innerHeight - trigger.bottom
  const spaceAbove = trigger.top

  let top, left

  // 计算垂直位置
  if (spaceBelow >= dropdownHeight || spaceBelow >= spaceAbove) {
    // 显示在下方
    top = trigger.bottom + 8
  } else {
    // 显示在上方
    top = trigger.top - dropdownHeight - 8
  }

  // 计算水平位置
  left = trigger.left

  // 确保不超出右边界
  const dropdownWidth = 200 // 预估宽度
  if (left + dropdownWidth > window.innerWidth) {
    left = window.innerWidth - dropdownWidth - 10
  }

  // 确保不超出左边界
  if (left < 10) {
    left = 10
  }

  dropdownStyle.value = {
    top: `${top}px`,
    left: `${left}px`,
    minWidth: `${trigger.width}px`
  }
}

// 监听窗口大小变化和滚动
const handleScroll = () => {
  if (isOpen.value) {
    updateDropdownPosition()
  }
}

const handleResize = () => {
  if (isOpen.value) {
    closeDropdown()
  }
}

// 处理点击外部关闭
const handleClickOutside = (event) => {
  if (!triggerRef.value || !isOpen.value) return

  // 如果点击不在触发器内，且下拉框存在时也不在下拉框内，则关闭
  if (!triggerRef.value.contains(event.target)) {
    if (dropdownRef.value && !dropdownRef.value.contains(event.target)) {
      closeDropdown()
    } else if (!dropdownRef.value) {
      closeDropdown()
    }
  }
}

onMounted(() => {
  window.addEventListener('scroll', handleScroll, true)
  window.addEventListener('resize', handleResize)
  document.addEventListener('click', handleClickOutside)
})

onBeforeUnmount(() => {
  window.removeEventListener('scroll', handleScroll, true)
  window.removeEventListener('resize', handleResize)
  document.removeEventListener('click', handleClickOutside)
})
</script>

<style scoped>
/* 自定义滚动条 */
.max-h-60::-webkit-scrollbar {
  width: 6px;
}

.max-h-60::-webkit-scrollbar-track {
  background: #f3f4f6;
  border-radius: 3px;
}

.max-h-60::-webkit-scrollbar-thumb {
  background: #d1d5db;
  border-radius: 3px;
}

.max-h-60::-webkit-scrollbar-thumb:hover {
  background: #9ca3af;
}
</style>
