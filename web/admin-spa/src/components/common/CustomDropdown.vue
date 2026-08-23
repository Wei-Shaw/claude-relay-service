<template>
  <div class="cute-dropdown" :class="[sizeClass, { 'is-open': isOpen, 'is-disabled': disabled }]">
    <!-- 光晕底衬：仅装饰，不占交互 -->
    <div
      v-if="glow"
      aria-hidden="true"
      class="cute-dropdown__glow"
      :class="[`glow-${accent}`, { 'is-active': isOpen }]"
    />

    <!-- 触发器 -->
    <button
      ref="triggerRef"
      :aria-expanded="isOpen"
      aria-haspopup="listbox"
      class="cute-dropdown__trigger"
      :class="[
        `accent-${accent}`,
        {
          'is-open': isOpen,
          'is-placeholder': !selectedLabel,
          'has-icon': !!icon
        }
      ]"
      :disabled="disabled"
      type="button"
      @click="toggleDropdown"
      @keydown="onTriggerKeydown"
    >
      <span v-if="icon" class="cute-dropdown__icon" :class="resolvedIconColor">
        <i :class="['fas', icon]" />
      </span>

      <span class="cute-dropdown__label">
        {{ selectedLabel || placeholder }}
      </span>

      <!-- 多选数量小圆点 -->
      <span
        v-if="multiple && selectedCount > 0"
        class="cute-dropdown__badge"
        :class="`badge-${accent}`"
      >
        {{ selectedCount }}
      </span>

      <!-- 清除：用 span 避免 button 嵌套 -->
      <span
        v-if="clearable && hasValue && !disabled"
        class="cute-dropdown__clear"
        role="button"
        tabindex="-1"
        title="清除"
        @click.stop="clearValue"
      >
        <i class="fas fa-times" />
      </span>

      <span class="cute-dropdown__chevron" :class="{ 'is-open': isOpen }">
        <i class="fas fa-chevron-down" />
      </span>
    </button>

    <!-- 下拉面板：默认关闭，仅 isOpen 时挂载 -->
    <Teleport to="body">
      <transition
        enter-active-class="cute-dd-enter-active"
        enter-from-class="cute-dd-enter-from"
        enter-to-class="cute-dd-enter-to"
        leave-active-class="cute-dd-leave-active"
        leave-from-class="cute-dd-leave-from"
        leave-to-class="cute-dd-leave-to"
      >
        <div
          v-if="isOpen"
          ref="dropdownRef"
          :aria-multiselectable="multiple"
          class="cute-dropdown__panel"
          :class="[`accent-${accent}`, sizeClass]"
          role="listbox"
          :style="dropdownStyle"
          tabindex="-1"
          @keydown="onPanelKeydown"
        >
          <!-- 搜索 -->
          <div v-if="searchable" class="cute-dropdown__search">
            <i class="fas fa-search cute-dropdown__search-icon" />
            <input
              ref="searchRef"
              v-model="searchQuery"
              class="cute-dropdown__search-input"
              :placeholder="searchPlaceholder"
              type="text"
              @click.stop
              @keydown="onSearchKeydown"
            />
          </div>

          <div ref="listRef" class="cute-dropdown__list">
            <template v-if="filteredOptions.length">
              <div
                v-for="(option, index) in filteredOptions"
                :key="optionKey(option, index)"
                :aria-selected="option.isGroup ? undefined : isSelected(option.value)"
                class="cute-dropdown__option"
                :class="{
                  'is-selected': isSelected(option.value),
                  'is-group': option.isGroup,
                  'is-disabled': option.disabled,
                  'is-highlighted': highlightedIndex === index
                }"
                :role="option.isGroup ? 'presentation' : 'option'"
                :style="optionStyle(option)"
                @click="selectOption(option)"
                @mouseenter="highlightedIndex = index"
              >
                <i v-if="option.icon" class="cute-dropdown__option-icon fas" :class="option.icon" />
                <span class="cute-dropdown__option-label">{{ option.label }}</span>

                <span
                  v-if="!option.isGroup && isSelected(option.value)"
                  aria-hidden="true"
                  class="cute-dropdown__check"
                >
                  <i class="fas fa-check" />
                </span>
              </div>
            </template>

            <div v-else class="cute-dropdown__empty">
              <span aria-hidden="true" class="cute-dropdown__empty-emoji">ヽ(°〇°)ﾉ</span>
              <span>{{ emptyText }}</span>
            </div>
          </div>
        </div>
      </transition>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'

// 全局互斥：同一时刻只开一个下拉
const OPEN_EVENT = 'cute-dropdown-open'
const instanceId = Symbol('cute-dropdown')

// defineProps 不能引用本地变量，色板键写死在 validator 内
const ACCENT_ICON = {
  blue: 'text-blue-500',
  indigo: 'text-indigo-500',
  purple: 'text-purple-500',
  pink: 'text-pink-500',
  amber: 'text-amber-500',
  orange: 'text-orange-500',
  green: 'text-green-500',
  cyan: 'text-cyan-500',
  teal: 'text-teal-500',
  red: 'text-red-500',
  gray: 'text-gray-500'
}

const props = defineProps({
  modelValue: {
    type: [String, Number, Boolean, Array],
    default: ''
  },
  options: {
    type: Array,
    required: true
    // [{ value, label, icon?, isGroup?, indent?, disabled? }]
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
    default: ''
  },
  // 主题色：控制光晕 + 选中态
  accent: {
    type: String,
    default: 'blue',
    validator: (value) =>
      [
        'blue',
        'indigo',
        'purple',
        'pink',
        'amber',
        'orange',
        'green',
        'cyan',
        'teal',
        'red',
        'gray'
      ].includes(value)
  },
  multiple: {
    type: Boolean,
    default: false
  },
  // 是否显示悬停/展开光晕
  glow: {
    type: Boolean,
    default: true
  },
  disabled: {
    type: Boolean,
    default: false
  },
  clearable: {
    type: Boolean,
    default: false
  },
  searchable: {
    type: Boolean,
    default: false
  },
  searchPlaceholder: {
    type: String,
    default: '搜索...'
  },
  emptyText: {
    type: String,
    default: '没有匹配项'
  },
  size: {
    type: String,
    default: 'md',
    validator: (value) => ['sm', 'md'].includes(value)
  },
  // 面板最小宽度，默认跟触发器等宽
  minWidth: {
    type: [Number, String],
    default: null
  }
})

const emit = defineEmits(['update:modelValue', 'change', 'open', 'close'])

const isOpen = ref(false)
const triggerRef = ref(null)
const dropdownRef = ref(null)
const listRef = ref(null)
const searchRef = ref(null)
const dropdownStyle = ref({})
const searchQuery = ref('')
const highlightedIndex = ref(-1)

const sizeClass = computed(() => `size-${props.size}`)

const resolvedIconColor = computed(() => {
  if (props.iconColor) return props.iconColor
  return ACCENT_ICON[props.accent] || ACCENT_ICON.blue
})

const selectedCount = computed(() => {
  if (!props.multiple) return 0
  return Array.isArray(props.modelValue) ? props.modelValue.length : 0
})

const hasValue = computed(() => {
  if (props.multiple) return selectedCount.value > 0
  return props.modelValue !== '' && props.modelValue !== null && props.modelValue !== undefined
})

const isSelected = (value) => {
  if (props.multiple) {
    return Array.isArray(props.modelValue) && props.modelValue.includes(value)
  }
  return props.modelValue === value
}

const selectedLabel = computed(() => {
  if (props.multiple) {
    if (selectedCount.value === 0) return ''
    if (selectedCount.value === 1) {
      const only = props.options.find((opt) => !opt.isGroup && opt.value === props.modelValue[0])
      return only ? only.label : `已选 1 个`
    }
    return `已选 ${selectedCount.value} 个`
  }
  const selected = props.options.find((opt) => !opt.isGroup && opt.value === props.modelValue)
  return selected ? selected.label : ''
})

const filteredOptions = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  if (!query) return props.options

  // 分组标题：若组内有匹配项则保留
  const result = []
  let pendingGroup = null
  for (const option of props.options) {
    if (option.isGroup) {
      pendingGroup = option
      continue
    }
    const hit =
      String(option.label ?? '')
        .toLowerCase()
        .includes(query) ||
      String(option.value ?? '')
        .toLowerCase()
        .includes(query)
    if (hit) {
      if (pendingGroup) {
        result.push(pendingGroup)
        pendingGroup = null
      }
      result.push(option)
    }
  }
  return result
})

const optionKey = (option, index) => {
  if (option.isGroup) return `group-${option.label}-${index}`
  return `${String(option.value)}-${index}`
}

const optionStyle = (option) => {
  if (!option.indent) return undefined
  return { paddingLeft: `${12 + option.indent * 16}px` }
}

const selectableIndexes = computed(() => {
  const indexes = []
  filteredOptions.value.forEach((option, index) => {
    if (!option.isGroup && !option.disabled) indexes.push(index)
  })
  return indexes
})

const toggleDropdown = async () => {
  if (props.disabled) return
  if (isOpen.value) {
    closeDropdown()
  } else {
    await openDropdown()
  }
}

const openDropdown = async () => {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: { id: instanceId } }))
  isOpen.value = true
  searchQuery.value = ''
  // 默认高亮当前选中项
  const currentIdx = filteredOptions.value.findIndex((opt) => !opt.isGroup && isSelected(opt.value))
  highlightedIndex.value = currentIdx >= 0 ? currentIdx : (selectableIndexes.value[0] ?? -1)
  emit('open')
  await nextTick()
  updateDropdownPosition()
  if (props.searchable) {
    searchRef.value?.focus()
  } else {
    dropdownRef.value?.focus?.()
  }
  // 二次测量：等内容渲染后用真实高度修正上下翻转
  requestAnimationFrame(() => updateDropdownPosition())
}

const closeDropdown = () => {
  if (!isOpen.value) return
  isOpen.value = false
  searchQuery.value = ''
  highlightedIndex.value = -1
  emit('close')
}

const selectOption = (option) => {
  if (option.isGroup || option.disabled) return

  if (props.multiple) {
    const current = Array.isArray(props.modelValue) ? [...props.modelValue] : []
    const idx = current.indexOf(option.value)
    if (idx >= 0) {
      current.splice(idx, 1)
    } else {
      current.push(option.value)
    }
    emit('update:modelValue', current)
    emit('change', current)
  } else {
    emit('update:modelValue', option.value)
    emit('change', option.value)
    closeDropdown()
  }
}

const clearValue = () => {
  const next = props.multiple ? [] : ''
  emit('update:modelValue', next)
  emit('change', next)
}

const updateDropdownPosition = () => {
  if (!triggerRef.value || !isOpen.value) return

  const trigger = triggerRef.value.getBoundingClientRect()
  const panel = dropdownRef.value
  const panelHeight = panel?.offsetHeight || 240
  const panelWidth = panel?.offsetWidth || Math.max(trigger.width, 160)
  const gap = 8
  const margin = 10

  const spaceBelow = window.innerHeight - trigger.bottom - margin
  const spaceAbove = trigger.top - margin
  const placeBelow = spaceBelow >= panelHeight || spaceBelow >= spaceAbove

  let top = placeBelow ? trigger.bottom + gap : trigger.top - panelHeight - gap
  let left = trigger.left

  // 右边界
  if (left + panelWidth > window.innerWidth - margin) {
    left = window.innerWidth - panelWidth - margin
  }
  // 左边界
  if (left < margin) left = margin
  // 上边界
  if (top < margin) top = margin

  const minW =
    props.minWidth != null
      ? typeof props.minWidth === 'number'
        ? `${props.minWidth}px`
        : props.minWidth
      : `${trigger.width}px`

  dropdownStyle.value = {
    top: `${top}px`,
    left: `${left}px`,
    minWidth: minW,
    maxWidth: `${Math.min(window.innerWidth - margin * 2, 360)}px`
  }
}

const moveHighlight = (direction) => {
  const indexes = selectableIndexes.value
  if (!indexes.length) {
    highlightedIndex.value = -1
    return
  }
  const currentPos = indexes.indexOf(highlightedIndex.value)
  let nextPos
  if (currentPos < 0) {
    nextPos = direction > 0 ? 0 : indexes.length - 1
  } else {
    nextPos = (currentPos + direction + indexes.length) % indexes.length
  }
  highlightedIndex.value = indexes[nextPos]
  scrollHighlightedIntoView()
}

const scrollHighlightedIntoView = () => {
  nextTick(() => {
    const list = listRef.value
    if (!list) return
    const item = list.querySelector('.cute-dropdown__option.is-highlighted')
    if (item) {
      item.scrollIntoView({ block: 'nearest' })
    }
  })
}

const selectHighlighted = () => {
  if (highlightedIndex.value < 0) return
  const option = filteredOptions.value[highlightedIndex.value]
  if (option) selectOption(option)
}

const onTriggerKeydown = (event) => {
  if (props.disabled) return
  switch (event.key) {
    case 'ArrowDown':
    case 'ArrowUp':
    case 'Enter':
    case ' ':
      event.preventDefault()
      if (!isOpen.value) openDropdown()
      break
    case 'Escape':
      if (isOpen.value) {
        event.preventDefault()
        closeDropdown()
      }
      break
  }
}

const onPanelKeydown = (event) => {
  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault()
      moveHighlight(1)
      break
    case 'ArrowUp':
      event.preventDefault()
      moveHighlight(-1)
      break
    case 'Enter':
      event.preventDefault()
      selectHighlighted()
      break
    case 'Escape':
      event.preventDefault()
      closeDropdown()
      triggerRef.value?.focus()
      break
    case 'Tab':
      closeDropdown()
      break
  }
}

// 搜索框内同样支持方向键/回车/Esc
const onSearchKeydown = (event) => {
  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault()
      moveHighlight(1)
      break
    case 'ArrowUp':
      event.preventDefault()
      moveHighlight(-1)
      break
    case 'Enter':
      event.preventDefault()
      selectHighlighted()
      break
    case 'Escape':
      event.preventDefault()
      event.stopPropagation()
      closeDropdown()
      triggerRef.value?.focus()
      break
  }
}

const handleScroll = () => {
  if (isOpen.value) updateDropdownPosition()
}

const handleResize = () => {
  if (isOpen.value) closeDropdown()
}

const handleClickOutside = (event) => {
  if (!isOpen.value) return
  const inTrigger = triggerRef.value?.contains(event.target)
  const inPanel = dropdownRef.value?.contains(event.target)
  if (!inTrigger && !inPanel) closeDropdown()
}

const handleGlobalOpen = (event) => {
  if (event?.detail?.id !== instanceId && isOpen.value) {
    closeDropdown()
  }
}

watch(searchQuery, () => {
  // 搜索后重置高亮到第一项
  highlightedIndex.value = selectableIndexes.value[0] ?? -1
  nextTick(() => updateDropdownPosition())
})

onMounted(() => {
  window.addEventListener('scroll', handleScroll, true)
  window.addEventListener('resize', handleResize)
  document.addEventListener('mousedown', handleClickOutside)
  window.addEventListener(OPEN_EVENT, handleGlobalOpen)
})

onBeforeUnmount(() => {
  window.removeEventListener('scroll', handleScroll, true)
  window.removeEventListener('resize', handleResize)
  document.removeEventListener('mousedown', handleClickOutside)
  window.removeEventListener(OPEN_EVENT, handleGlobalOpen)
})
</script>

<style scoped>
.cute-dropdown {
  position: relative;
  display: inline-flex;
  width: 100%;
  vertical-align: middle;
}

.cute-dropdown.is-disabled {
  opacity: 0.55;
  pointer-events: none;
}

/* ---- 光晕 ---- */
.cute-dropdown__glow {
  position: absolute;
  inset: -2px;
  border-radius: 0.75rem;
  opacity: 0;
  filter: blur(8px);
  transition: opacity 0.3s ease;
  pointer-events: none;
  z-index: 0;
}

.cute-dropdown:hover .cute-dropdown__glow,
.cute-dropdown__glow.is-active {
  opacity: 0.35;
}

.glow-blue {
  background: linear-gradient(135deg, #3b82f6, #6366f1);
}
.glow-indigo {
  background: linear-gradient(135deg, #6366f1, #3b82f6);
}
.glow-purple {
  background: linear-gradient(135deg, #a855f7, #ec4899);
}
.glow-pink {
  background: linear-gradient(135deg, #ec4899, #f472b6);
}
.glow-amber {
  background: linear-gradient(135deg, #f59e0b, #f97316);
}
.glow-orange {
  background: linear-gradient(135deg, #f97316, #f59e0b);
}
.glow-green {
  background: linear-gradient(135deg, #10b981, #34d399);
}
.glow-cyan {
  background: linear-gradient(135deg, #06b6d4, #14b8a6);
}
.glow-teal {
  background: linear-gradient(135deg, #14b8a6, #06b6d4);
}
.glow-red {
  background: linear-gradient(135deg, #ef4444, #f87171);
}
.glow-gray {
  background: linear-gradient(135deg, #9ca3af, #6b7280);
}

/* ---- 触发器 ---- */
.cute-dropdown__trigger {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  border: 1px solid rgb(229 231 235);
  border-radius: 0.75rem;
  background: rgba(255, 255, 255, 0.95);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
  color: rgb(55 65 81);
  font-size: 0.875rem;
  font-weight: 500;
  line-height: 1.25;
  cursor: pointer;
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease,
    background-color 0.2s ease,
    transform 0.15s ease;
  outline: none;
}

.size-md .cute-dropdown__trigger {
  min-height: 2.5rem;
  padding: 0.5rem 0.75rem;
}

.size-sm .cute-dropdown__trigger {
  min-height: 2rem;
  padding: 0.25rem 0.625rem;
  border-radius: 0.625rem;
}

.cute-dropdown__trigger:hover {
  border-color: rgb(209 213 219);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.cute-dropdown__trigger:active {
  transform: scale(0.985);
}

.cute-dropdown__trigger.is-open {
  border-color: var(--cute-accent, #3b82f6);
  box-shadow:
    0 0 0 3px color-mix(in srgb, var(--cute-accent, #3b82f6) 18%, transparent),
    0 4px 12px rgba(0, 0, 0, 0.06);
}

.cute-dropdown__trigger.is-placeholder .cute-dropdown__label {
  color: rgb(156 163 175);
  font-weight: 400;
}

.accent-blue {
  --cute-accent: #3b82f6;
}
.accent-indigo {
  --cute-accent: #6366f1;
}
.accent-purple {
  --cute-accent: #a855f7;
}
.accent-pink {
  --cute-accent: #ec4899;
}
.accent-amber {
  --cute-accent: #f59e0b;
}
.accent-orange {
  --cute-accent: #f97316;
}
.accent-green {
  --cute-accent: #10b981;
}
.accent-cyan {
  --cute-accent: #06b6d4;
}
.accent-teal {
  --cute-accent: #14b8a6;
}
.accent-red {
  --cute-accent: #ef4444;
}
.accent-gray {
  --cute-accent: #6b7280;
}

.cute-dropdown__icon {
  flex-shrink: 0;
  font-size: 0.875rem;
  width: 1rem;
  text-align: center;
}

.cute-dropdown__label {
  flex: 1;
  min-width: 0;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  user-select: none;
}

.cute-dropdown__badge {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.375rem;
  height: 1.375rem;
  padding: 0 0.35rem;
  border-radius: 9999px;
  font-size: 0.875rem;
  font-weight: 600;
  color: #fff;
  line-height: 1;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
}

.badge-blue {
  background: #3b82f6;
}
.badge-indigo {
  background: #6366f1;
}
.badge-purple {
  background: #a855f7;
}
.badge-pink {
  background: #ec4899;
}
.badge-amber {
  background: #f59e0b;
}
.badge-orange {
  background: #f97316;
}
.badge-green {
  background: #10b981;
}
.badge-cyan {
  background: #06b6d4;
}
.badge-teal {
  background: #14b8a6;
}
.badge-red {
  background: #ef4444;
}
.badge-gray {
  background: #6b7280;
}

.cute-dropdown__clear {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.375rem;
  height: 1.375rem;
  border: none;
  border-radius: 9999px;
  background: rgb(243 244 246);
  color: rgb(156 163 175);
  font-size: 0.875rem;
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    color 0.15s ease,
    transform 0.15s ease;
}

.cute-dropdown__clear:hover {
  background: rgb(229 231 235);
  color: rgb(107 114 128);
  transform: scale(1.08);
}

.cute-dropdown__chevron {
  flex-shrink: 0;
  display: inline-flex;
  color: rgb(156 163 175);
  font-size: 0.875rem;
  transition:
    transform 0.25s cubic-bezier(0.34, 1.4, 0.64, 1),
    color 0.2s ease;
}

.cute-dropdown__chevron.is-open {
  transform: rotate(180deg);
  color: var(--cute-accent, #3b82f6);
}

/* ---- 面板（Teleport 到 body，scoped 靠 data 属性仍生效） ---- */
.cute-dropdown__panel {
  position: fixed;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid rgb(229 231 235 / 0.9);
  border-radius: 0.875rem;
  background: rgba(255, 255, 255, 0.98);
  box-shadow:
    0 10px 28px -6px rgba(15, 23, 42, 0.14),
    0 4px 10px -4px rgba(15, 23, 42, 0.08),
    0 0 0 1px rgba(255, 255, 255, 0.6) inset;
  backdrop-filter: blur(12px);
  outline: none;
  transform-origin: top center;
}

.cute-dropdown__search {
  position: relative;
  flex-shrink: 0;
  padding: 0.5rem 0.5rem 0.25rem;
}

.cute-dropdown__search-icon {
  position: absolute;
  left: 1rem;
  top: 50%;
  transform: translateY(calc(-50% + 1px));
  color: rgb(156 163 175);
  font-size: 0.875rem;
  pointer-events: none;
}

.cute-dropdown__search-input {
  width: 100%;
  height: 2rem;
  padding: 0 0.75rem 0 2rem;
  border: 1px solid rgb(229 231 235);
  border-radius: 0.625rem;
  background: rgb(249 250 251);
  color: rgb(55 65 81);
  font-size: 0.875rem;
  outline: none;
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease,
    background-color 0.15s ease;
}

.cute-dropdown__search-input:focus {
  border-color: var(--cute-accent, #3b82f6);
  background: #fff;
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--cute-accent, #3b82f6) 15%, transparent);
}

.cute-dropdown__list {
  max-height: 15rem;
  overflow-y: auto;
  padding: 0.35rem;
  overscroll-behavior: contain;
}

.cute-dropdown__list::-webkit-scrollbar {
  width: 6px;
}
.cute-dropdown__list::-webkit-scrollbar-track {
  background: transparent;
}
.cute-dropdown__list::-webkit-scrollbar-thumb {
  background: rgb(209 213 219);
  border-radius: 9999px;
}
.cute-dropdown__list::-webkit-scrollbar-thumb:hover {
  background: rgb(156 163 175);
}

.cute-dropdown__option {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  border-radius: 0.625rem;
  color: rgb(55 65 81);
  font-size: 0.875rem;
  cursor: pointer;
  user-select: none;
  transition:
    background-color 0.12s ease,
    color 0.12s ease,
    transform 0.12s ease;
}

.cute-dropdown__option:not(.is-group):hover,
.cute-dropdown__option.is-highlighted:not(.is-group) {
  background: color-mix(in srgb, var(--cute-accent, #3b82f6) 8%, transparent);
}

.cute-dropdown__option.is-selected {
  background: color-mix(in srgb, var(--cute-accent, #3b82f6) 12%, transparent);
  color: var(--cute-accent, #3b82f6);
  font-weight: 600;
}

.cute-dropdown__option.is-selected.is-highlighted,
.cute-dropdown__option.is-selected:hover {
  background: color-mix(in srgb, var(--cute-accent, #3b82f6) 18%, transparent);
}

.cute-dropdown__option.is-group {
  margin-top: 0.25rem;
  background: rgb(249 250 251);
  color: rgb(31 41 55);
  font-weight: 600;
  font-size: 0.875rem;
  letter-spacing: 0.01em;
  cursor: default;
}

.cute-dropdown__option.is-group:first-child {
  margin-top: 0;
}

.cute-dropdown__option.is-disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.cute-dropdown__option-icon {
  flex-shrink: 0;
  width: 1rem;
  text-align: center;
  font-size: 0.875rem;
  opacity: 0.85;
}

.cute-dropdown__option-label {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cute-dropdown__check {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.25rem;
  height: 1.25rem;
  border-radius: 9999px;
  background: color-mix(in srgb, var(--cute-accent, #3b82f6) 16%, transparent);
  color: var(--cute-accent, #3b82f6);
  font-size: 0.875rem;
  animation: cute-check-pop 0.28s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.cute-dropdown__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.35rem;
  padding: 1.25rem 0.75rem;
  color: rgb(156 163 175);
  font-size: 0.875rem;
}

.cute-dropdown__empty-emoji {
  font-size: 1rem;
  opacity: 0.8;
}

/* ---- 动画 ---- */
@keyframes cute-check-pop {
  0% {
    transform: scale(0.4);
    opacity: 0;
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}
</style>

<!-- 过渡类挂在 Teleport 节点上，需要非 scoped -->
<style>
.cute-dd-enter-active {
  transition:
    opacity 0.18s ease,
    transform 0.22s cubic-bezier(0.34, 1.4, 0.64, 1);
}
.cute-dd-leave-active {
  transition:
    opacity 0.12s ease,
    transform 0.12s ease;
}
.cute-dd-enter-from {
  opacity: 0;
  transform: translateY(-6px) scale(0.96);
}
.cute-dd-enter-to {
  opacity: 1;
  transform: translateY(0) scale(1);
}
.cute-dd-leave-from {
  opacity: 1;
  transform: translateY(0) scale(1);
}
.cute-dd-leave-to {
  opacity: 0;
  transform: translateY(-4px) scale(0.97);
}

/* ---- 暗黑模式 ---- */
.dark .cute-dropdown__trigger {
  border-color: rgb(75 85 99 / 0.6);
  background: rgba(31, 41, 55, 0.95);
  color: rgb(229 231 235);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
}

.dark .cute-dropdown__trigger:hover {
  border-color: rgb(107 114 128 / 0.7);
}

.dark .cute-dropdown__trigger.is-placeholder .cute-dropdown__label {
  color: rgb(156 163 175);
}

.dark .cute-dropdown__clear {
  background: rgb(55 65 81);
  color: rgb(156 163 175);
}

.dark .cute-dropdown__clear:hover {
  background: rgb(75 85 99);
  color: rgb(209 213 219);
}

.dark .cute-dropdown__panel {
  border-color: rgb(75 85 99 / 0.55);
  background: rgba(31, 41, 55, 0.98);
  box-shadow:
    0 12px 32px -6px rgba(0, 0, 0, 0.45),
    0 4px 12px -4px rgba(0, 0, 0, 0.3),
    0 0 0 1px rgba(255, 255, 255, 0.04) inset;
}

.dark .cute-dropdown__search-input {
  border-color: rgb(75 85 99 / 0.6);
  background: rgb(17 24 39 / 0.6);
  color: rgb(229 231 235);
}

.dark .cute-dropdown__search-input:focus {
  background: rgb(17 24 39 / 0.85);
}

.dark .cute-dropdown__option {
  color: rgb(209 213 219);
}

.dark .cute-dropdown__option.is-group {
  background: rgb(55 65 81 / 0.45);
  color: rgb(243 244 246);
}

.dark .cute-dropdown__list::-webkit-scrollbar-thumb {
  background: rgb(75 85 99);
}

.dark .cute-dropdown__list::-webkit-scrollbar-thumb:hover {
  background: rgb(107 114 128);
}
</style>
