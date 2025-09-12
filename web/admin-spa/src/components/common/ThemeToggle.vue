<template>
  <div class="theme-toggle-container">
    <!-- 紧凑模式：仅显示图标按钮 -->
    <button
      v-if="mode === 'compact'"
      class="theme-toggle-button"
      :title="themeTooltip"
      @click="handleCycleTheme"
    >
      <transition mode="out-in" name="fade">
        <i v-if="themeStore.themeMode === 'light'" key="sun" class="fas fa-sun" />
        <i v-else-if="themeStore.themeMode === 'dark'" key="moon" class="fas fa-moon" />
        <i v-else key="auto" class="fas fa-circle-half-stroke" />
      </transition>
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
        <!-- 背景装饰 -->
        <div class="switch-bg">
          <div class="stars">
            <span></span>
            <span></span>
            <span></span>
          </div>
          <div class="clouds">
            <span></span>
            <span></span>
          </div>
        </div>

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

/* 简化的 hover 效果 */
.theme-toggle-button::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: radial-gradient(circle, rgba(59, 130, 246, 0.1), transparent);
  opacity: 0;
  transition: opacity 0.2s ease;
  pointer-events: none;
}

.theme-toggle-button:hover::before {
  opacity: 1;
}

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
  background: linear-gradient(90deg, #60a5fa 0%, #2563eb 100%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}

/* 创意切换开关样式 */
.theme-switch-wrapper {
  @apply inline-flex items-center;
}

.theme-switch {
  @apply relative;
  width: 76px;
  height: 38px;
  border-radius: 50px;
  padding: 4px;
  cursor: pointer;
  transition: all 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55);
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border: 2px solid rgba(255, 255, 255, 0.1);
  box-shadow:
    0 4px 15px rgba(102, 126, 234, 0.3),
    inset 0 1px 2px rgba(0, 0, 0, 0.1);
  overflow: hidden;
  display: flex;
  align-items: center;
}

.theme-switch:hover {
  transform: scale(1.05);
  box-shadow:
    0 6px 20px rgba(102, 126, 234, 0.4),
    inset 0 1px 2px rgba(0, 0, 0, 0.1);
}

.theme-switch:active {
  transform: scale(0.98);
}

/* 深色模式样式 */
.theme-switch.is-dark {
  background: linear-gradient(135deg, #1e293b 0%, #334155 100%);
  border-color: rgba(148, 163, 184, 0.2);
  box-shadow:
    0 4px 15px rgba(0, 0, 0, 0.5),
    inset 0 1px 2px rgba(255, 255, 255, 0.05);
}

.theme-switch.is-dark:hover {
  box-shadow:
    0 6px 20px rgba(0, 0, 0, 0.6),
    inset 0 1px 2px rgba(255, 255, 255, 0.05);
}

/* 自动模式样式 - 静态蓝紫渐变设计（优化版） */
.theme-switch.is-auto {
  background: linear-gradient(
    135deg,
    #c4b5fd 0%,
    /* 更柔和的起始：淡紫 */ #a78bfa 15%,
    /* 浅紫 */ #818cf8 40%,
    /* 紫蓝 */ #6366f1 60%,
    /* 靛蓝 */ #4f46e5 85%,
    /* 深蓝紫 */ #4338ca 100% /* 更深的结束：深紫 */
  );
  border-color: rgba(255, 255, 255, 0.2);
  position: relative;
  overflow: hidden;
  background-size: 120% 120%;
  background-position: center;
  box-shadow:
    0 4px 15px rgba(139, 92, 246, 0.25),
    inset 0 1px 3px rgba(0, 0, 0, 0.1),
    inset 0 -1px 3px rgba(0, 0, 0, 0.1);
}

/* 自动模式的分割线效果 */
.theme-switch.is-auto::before {
  content: '';
  position: absolute;
  left: 50%;
  top: 10%;
  bottom: 10%;
  width: 1px;
  background: linear-gradient(to bottom, transparent, rgba(255, 255, 255, 0.3), transparent);
  transform: translateX(-50%);
  pointer-events: none;
}

/* 背景装饰 */
.switch-bg {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  overflow: hidden;
  pointer-events: none;
}

/* 星星装饰（深色模式） - 优化版 */
.stars {
  position: absolute;
  width: 100%;
  height: 100%;
  opacity: 0;
  transition: opacity 0.3s ease;
}

.theme-switch.is-dark .stars {
  opacity: 1;
}

.stars span {
  position: absolute;
  display: block;
  width: 2px;
  height: 2px;
  background: white;
  border-radius: 50%;
  opacity: 0.6;
}

.stars span:nth-child(1) {
  top: 25%;
  left: 20%;
}

.stars span:nth-child(2) {
  top: 40%;
  left: 40%;
  width: 1.5px;
  height: 1.5px;
}

.stars span:nth-child(3) {
  top: 60%;
  left: 25%;
}

/* 云朵装饰（浅色模式） - 优化版 */
.clouds {
  position: absolute;
  width: 100%;
  height: 100%;
  opacity: 0;
  transition: opacity 0.3s ease;
}

.theme-switch:not(.is-dark):not(.is-auto) .clouds {
  opacity: 0.7;
}

.clouds span {
  position: absolute;
  background: rgba(255, 255, 255, 0.3);
  border-radius: 100px;
}

.clouds span:nth-child(1) {
  width: 20px;
  height: 8px;
  top: 40%;
  left: 15%;
}

.clouds span:nth-child(2) {
  width: 15px;
  height: 6px;
  top: 60%;
  left: 35%;
}

/* 切换滑块 */
.switch-handle {
  position: absolute;
  width: 30px;
  height: 30px;
  background: white;
  border-radius: 50%;
  transition: all 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55);
  box-shadow:
    0 2px 8px rgba(0, 0, 0, 0.2),
    0 0 0 1px rgba(0, 0, 0, 0.05);
  display: flex;
  align-items: center;
  justify-content: center;
  top: 50%;
  transform: translateY(-50%) translateX(0);
  left: 4px;
}

/* 深色模式滑块位置 */
.theme-switch.is-dark .switch-handle {
  transform: translateY(-50%) translateX(38px);
  background: linear-gradient(135deg, #1e293b 0%, #475569 100%);
  box-shadow:
    0 2px 8px rgba(0, 0, 0, 0.4),
    0 0 0 1px rgba(255, 255, 255, 0.1);
}

/* 自动模式滑块位置 - 优化后的半透明设计 */
.theme-switch.is-auto .switch-handle {
  transform: translateY(-50%) translateX(19px);
  background: rgba(255, 255, 255, 0.25);
  /* 降低 blur 强度，减少 GPU 负担 */
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  border: 1px solid rgba(255, 255, 255, 0.35);
  box-shadow:
    0 4px 12px rgba(0, 0, 0, 0.1),
    inset 0 0 8px rgba(255, 255, 255, 0.25);
}

/* 滑块图标 */
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
  transition: all 0.3s ease;
}

.handle-icon .fa-sun {
  color: #f59e0b;
  filter: drop-shadow(0 0 3px rgba(245, 158, 11, 0.5));
}

.handle-icon .fa-moon {
  color: #fbbf24;
  filter: drop-shadow(0 0 3px rgba(251, 191, 36, 0.5));
}

.handle-icon .fa-circle-half-stroke {
  color: rgba(255, 255, 255, 0.9);
  filter: drop-shadow(0 0 4px rgba(167, 139, 250, 0.5));
  font-size: 15px;
}

/* 移除弹跳动画，保持简洁 */

/* 分段按钮样式 - 更现代 */
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

/* 过渡动画 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.dropdown-enter-active {
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.dropdown-leave-active {
  transition: all 0.2s cubic-bezier(0.4, 0, 1, 1);
}

.dropdown-enter-from {
  opacity: 0;
  transform: translateY(-10px) scale(0.95);
}

.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-5px) scale(0.98);
}

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
