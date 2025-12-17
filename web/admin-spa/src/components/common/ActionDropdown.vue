<template>
  <div class="relative">
    <!-- 触发器按钮 -->
    <button
      ref="triggerRef"
      class="flex h-8 w-8 items-center justify-center border border-gray-200 bg-white text-gray-600 transition-all duration-200 hover:border-gray-300 hover:bg-gray-50 hover:text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-400 dark:hover:border-gray-500 dark:hover:bg-gray-700 dark:hover:text-gray-200"
      :class="[
        isOpen &&
          'border-gray-900 bg-gray-100 text-gray-900 dark:border-white dark:bg-gray-700 dark:text-white'
      ]"
      style="border-radius: 5px"
      title="更多操作"
      @click.stop="toggleDropdown"
    >
      <i class="fas fa-ellipsis-v text-sm"></i>
    </button>

    <!-- 下拉菜单 - 使用 Teleport 避免被父容器裁剪 -->
    <Teleport to="body">
      <div
        v-if="isOpen"
        ref="dropdownRef"
        class="fixed z-[9999] min-w-[140px] overflow-hidden border border-gray-200 bg-white py-1 dark:border-gray-600 dark:bg-gray-800"
        :style="{
          ...dropdownStyle,
          borderRadius: '5px',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)'
        }"
      >
        <button
          v-for="action in actions"
          :key="action.key"
          class="flex w-full items-center gap-2 whitespace-nowrap px-3 py-2 text-left text-sm transition-colors duration-150"
          :class="getActionClass(action)"
          @click.stop="handleAction(action)"
        >
          <i :class="['fas', action.icon, 'w-4 text-center text-xs']"></i>
          <span>{{ action.label }}</span>
        </button>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue'

defineProps({
  actions: {
    type: Array,
    required: true
    // 格式: [{ key: 'edit', label: '编辑', icon: 'fa-edit', color: 'blue', handler: () => {} }]
  }
})

const emit = defineEmits(['action'])

const isOpen = ref(false)
const triggerRef = ref(null)
const dropdownRef = ref(null)
const dropdownStyle = ref({})

const getActionClass = (action) => {
  const colorMap = {
    purple: 'text-purple-600 hover:bg-purple-50 dark:text-purple-400 dark:hover:bg-purple-900/20',
    indigo: 'text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-900/20',
    blue: 'text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700',
    green: 'text-green-600 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-900/20',
    orange: 'text-orange-600 hover:bg-orange-50 dark:text-orange-400 dark:hover:bg-orange-900/20',
    red: 'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20',
    gray: 'text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-700'
  }
  return colorMap[action.color] || colorMap.gray
}

const instanceId = Symbol('action-dropdown')
const handleGlobalOpen = (event) => {
  if (event?.detail?.id !== instanceId) {
    closeDropdown()
  }
}

const toggleDropdown = async () => {
  if (!isOpen.value) {
    window.dispatchEvent(
      new CustomEvent('action-dropdown-open', {
        detail: { id: instanceId }
      })
    )
  }
  isOpen.value = !isOpen.value
  if (isOpen.value) {
    await nextTick()
    updateDropdownPosition()
  }
}

const closeDropdown = () => {
  isOpen.value = false
}

const handleAction = (action) => {
  closeDropdown()
  if (action.handler) {
    action.handler()
  }
  emit('action', action.key)
}

const updateDropdownPosition = () => {
  if (!triggerRef.value || !isOpen.value) return

  const trigger = triggerRef.value.getBoundingClientRect()
  const dropdownHeight = 200 // 预估高度
  const dropdownWidth = 180 // 预估宽度，略大以减少遮挡
  const gap = 8
  const spaceBelow = window.innerHeight - trigger.bottom
  const spaceAbove = trigger.top
  const spaceRight = window.innerWidth - trigger.right
  const spaceLeft = trigger.left

  let top, left

  // 计算垂直位置
  if (spaceBelow >= dropdownHeight || spaceBelow >= spaceAbove) {
    top = trigger.bottom + gap
  } else {
    top = trigger.top - dropdownHeight - gap
  }

  // 计算水平位置 - 优先向右展开，避免遮挡左侧内容
  if (spaceRight >= dropdownWidth + gap) {
    left = trigger.right + gap
  } else if (spaceLeft >= dropdownWidth + gap) {
    left = trigger.left - dropdownWidth - gap + trigger.width
  } else {
    left = window.innerWidth - dropdownWidth - 10
  }

  // 确保不超出边界
  if (left < 10) left = 10
  if (top < 10) top = 10

  dropdownStyle.value = {
    top: `${top}px`,
    left: `${left}px`
  }
}

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

const handleClickOutside = (event) => {
  if (!triggerRef.value || !isOpen.value) return

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
  window.addEventListener('action-dropdown-open', handleGlobalOpen)
})

onBeforeUnmount(() => {
  window.removeEventListener('scroll', handleScroll, true)
  window.removeEventListener('resize', handleResize)
  document.removeEventListener('click', handleClickOutside)
  window.removeEventListener('action-dropdown-open', handleGlobalOpen)
})
</script>
