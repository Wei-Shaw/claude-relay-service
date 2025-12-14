<template>
  <div class="theme-toggle-container">
    <!-- 紧凑模式：仅显示图标按钮 -->
    <button
      v-if="mode === 'compact'"
      class="theme-toggle-button"
      :title="themeTooltip"
      @click="handleCycleTheme"
    >
      <i v-if="themeStore.themeMode === 'light'" key="sun" class="fas fa-sun" />
      <i v-else-if="themeStore.themeMode === 'dark'" key="moon" class="fas fa-moon" />
      <i v-else key="auto" class="fas fa-circle-half-stroke" />
    </button>

    <!-- 下拉菜单模式 - 改为创意切换开关 -->
    <div v-else-if="mode === 'dropdown'" class="theme-switch-wrapper">
      <button
        class="theme-switch"
        :class="{
          'is-dark': themeStore.themeMode === 'dark',
          'is-auto': themeStore.themeMode === 'auto'
        }"
        :title="themeTooltip"
        @click="handleCycleTheme"
      >
        <!-- 切换滑块 -->
        <div class="switch-handle">
          <div class="handle-icon">
            <i v-if="themeStore.themeMode === 'light'" class="fas fa-sun" />
            <i v-else-if="themeStore.themeMode === 'dark'" class="fas fa-moon" />
            <i v-else class="fas fa-circle-half-stroke" />
          </div>
        </div>
      </button>
    </div>

    <!-- 分段按钮模式 -->
    <div v-else-if="mode === 'segmented'" class="theme-segmented">
      <button
        v-for="option in themeOptions"
        :key="option.value"
        class="theme-segment"
        :class="{ active: themeStore.themeMode === option.value }"
        :title="option.label"
        @click="selectTheme(option.value)"
      >
        <i :class="option.icon" />
        <span v-if="showLabel" class="ml-1 hidden sm:inline">{{ option.shortLabel }}</span>
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useThemeStore } from '@/stores/theme'

// Props
defineProps({
  // 显示模式：compact（紧凑）、dropdown（下拉）、segmented（分段）
  mode: {
    type: String,
    default: 'compact',
    validator: (value) => ['compact', 'dropdown', 'segmented'].includes(value)
  },
  // 是否显示文字标签
  showLabel: {
    type: Boolean,
    default: false
  }
})

// Store
const themeStore = useThemeStore()

// 主题选项配置
const themeOptions = [
  {
    value: 'light',
    label: '浅色模式',
    shortLabel: '浅色',
    icon: 'fas fa-sun'
  },
  {
    value: 'dark',
    label: '深色模式',
    shortLabel: '深色',
    icon: 'fas fa-moon'
  },
  {
    value: 'auto',
    label: '跟随系统',
    shortLabel: '自动',
    icon: 'fas fa-circle-half-stroke'
  }
]

// 计算属性
const themeTooltip = computed(() => {
  const current = themeOptions.find((opt) => opt.value === themeStore.themeMode)
  return current ? `点击切换主题 - ${current.label}` : '切换主题'
})

// 方法
const handleCycleTheme = () => {
  themeStore.cycleThemeMode()
}

const selectTheme = (mode) => {
  themeStore.setThemeMode(mode)
}
</script>

<style scoped>
/* 容器样式 */
.theme-toggle-container {
  position: relative;
  display: inline-flex;
  align-items: center;
}

/* 基础按钮样式 - 更简洁优雅 */
.theme-toggle-button {
  @apply flex items-center justify-center;
  @apply h-9 w-9 rounded-full;
  @apply bg-white/90 dark:bg-gray-800/90;
  @apply hover:bg-white dark:hover:bg-gray-700;
  @apply text-gray-600 dark:text-gray-300;
  @apply border border-gray-200/50 dark:border-gray-600/50;
  @apply transition-all duration-200 ease-out;
  /* 移除 backdrop-blur 减少 GPU 负担 */
  @apply shadow-md hover:shadow-lg;
  @apply hover:scale-110 active:scale-95;
  position: relative;
  overflow: hidden;
}

/* Removed hover effect for clean design */

/* 图标样式优化 - 简洁高效 */
.theme-toggle-button i {
  @apply text-base;
  transition: transform 0.2s ease;
}

.theme-toggle-button:hover i {
  transform: scale(1.1);
}

/* 不同主题的图标颜色 */
.theme-toggle-button i.fa-sun {
  @apply text-amber-500;
}

.theme-toggle-button i.fa-moon {
  @apply text-indigo-500;
}

.theme-toggle-button i.fa-circle-half-stroke {
  @apply text-gray-600 dark:text-gray-400;
}

/* ============================================
   VERCEL THEME SWITCH - FULL DARK MODE SUPPORT
   ============================================ */
.theme-switch-wrapper {
  display: inline-flex;
  align-items: center;
}

.theme-switch {
  position: relative;
  width: 76px;
  height: 38px;
  border-radius: 6px;
  padding: 4px;
  cursor: pointer;
  transition: all 0.15s ease;
  background: #eaeaea;
  border: 1px solid #eaeaea;
  overflow: hidden;
  display: flex;
  align-items: center;
}

.theme-switch:hover {
  background: #ddd;
  border-color: #ddd;
}

.theme-switch:active {
  transform: scale(0.98);
}

/* Dark Mode Styles */
.theme-switch.is-dark {
  background: #333;
  border-color: #333;
}

.theme-switch.is-dark:hover {
  background: #444;
  border-color: #444;
}

/* Dark mode switch in dark theme context */
:global(.dark) .theme-switch {
  background: #1a1a1a;
  border-color: #333;
}

:global(.dark) .theme-switch:hover {
  background: #222;
  border-color: #444;
}

:global(.dark) .theme-switch.is-dark {
  background: #fff;
  border-color: #fff;
}

:global(.dark) .theme-switch.is-dark:hover {
  background: #e5e5e5;
  border-color: #e5e5e5;
}

/* Auto Mode Styles */
.theme-switch.is-auto {
  background: #9e9e9e;
  border-color: #9e9e9e;
}

.theme-switch.is-auto:hover {
  background: #888;
  border-color: #888;
}

:global(.dark) .theme-switch.is-auto {
  background: #666;
  border-color: #666;
}

:global(.dark) .theme-switch.is-auto:hover {
  background: #777;
  border-color: #777;
}

/* Switch Handle - Clean Vercel Style */
.switch-handle {
  position: absolute;
  width: 30px;
  height: 30px;
  background: #fff;
  border-radius: 5px;
  transition: all 0.2s ease;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  top: 50%;
  transform: translateY(-50%) translateX(0);
  left: 4px;
}

/* Light Mode Handle */
.theme-switch .switch-handle {
  background: #fff;
}

/* Dark Mode Handle Position */
.theme-switch.is-dark .switch-handle {
  transform: translateY(-50%) translateX(38px);
  background: #000;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.15);
}

/* Auto Mode Handle Position */
.theme-switch.is-auto .switch-handle {
  transform: translateY(-50%) translateX(19px);
  background: #fff;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

/* Dark Theme Context - Inverted Colors */
:global(.dark) .theme-switch .switch-handle {
  background: #000;
}

:global(.dark) .theme-switch.is-dark .switch-handle {
  background: #fff;
}

:global(.dark) .theme-switch.is-auto .switch-handle {
  background: #fff;
}

/* Handle Icon - Full Dark Mode Support */
.handle-icon {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.handle-icon i {
  font-size: 14px;
  transition: all 0.2s ease;
}

/* Light Mode Icons */
.handle-icon .fa-sun {
  color: #f59e0b;
}

.handle-icon .fa-moon {
  color: #fff;
}

.handle-icon .fa-circle-half-stroke {
  color: #666;
  font-size: 15px;
}

/* Dark Theme Context Icons */
:global(.dark) .handle-icon .fa-sun {
  color: #f59e0b;
}

:global(.dark) .theme-switch.is-dark .handle-icon .fa-moon {
  color: #000;
}

:global(.dark) .handle-icon .fa-circle-half-stroke {
  color: #000;
}

/* ============================================
   SEGMENTED BUTTON MODE
   ============================================ */
.theme-segmented {
  @apply inline-flex;
  @apply bg-gray-100 dark:bg-gray-800;
  @apply rounded-full p-1;
  @apply border border-gray-200 dark:border-gray-700;
  @apply shadow-sm;
}

.theme-segment {
  @apply px-3 py-1.5;
  @apply text-xs font-medium;
  @apply text-gray-500 dark:text-gray-400;
  @apply transition-all duration-200;
  @apply rounded-full;
  @apply flex items-center gap-1;
  @apply cursor-pointer;
  position: relative;
}

.theme-segment:hover {
  @apply text-gray-700 dark:text-gray-300;
  @apply bg-white/30 dark:bg-gray-600/30;
  transform: scale(1.02);
}

.theme-segment.active {
  @apply bg-white dark:bg-gray-700;
  @apply text-gray-900 dark:text-white;
  @apply shadow-sm;
}

.theme-segment i {
  @apply text-xs;
  transition: transform 0.2s ease;
}

/* 过渡动画 - removed for immediate display */

/* 响应式调整 */
@media (max-width: 640px) {
  .theme-dropdown {
    @apply left-0 right-auto;
  }

  .theme-segment span {
    @apply hidden;
  }
}
</style>
