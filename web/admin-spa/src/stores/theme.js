import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'

// 主题模式枚举
export const ThemeMode = {
  LIGHT: 'light',
  DARK: 'dark',
  AUTO: 'auto'
}

export const useThemeStore = defineStore('theme', () => {
  // 状态 - 支持三种模式：light, dark, auto
  const themeMode = ref(ThemeMode.AUTO)
  const systemPrefersDark = ref(false)

  // 计算属性 - 实际的暗黑模式状态
  const isDarkMode = computed(() => {
    if (themeMode.value === ThemeMode.DARK) {
      return true
    } else if (themeMode.value === ThemeMode.LIGHT) {
      return false
    } else {
      // auto 模式，跟随系统
      return systemPrefersDark.value
    }
  })

  // 计算属性 - 当前实际使用的主题
  const currentTheme = computed(() => {
    return isDarkMode.value ? ThemeMode.DARK : ThemeMode.LIGHT
  })

  // 初始化主题
  const initTheme = () => {
    // 检测系统主题偏好
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    systemPrefersDark.value = mediaQuery.matches

    // 从 localStorage 读取保存的主题模式
    const savedMode = localStorage.getItem('themeMode')

    if (savedMode && Object.values(ThemeMode).includes(savedMode)) {
      themeMode.value = savedMode
    } else {
      // 默认使用 auto 模式
      themeMode.value = ThemeMode.AUTO
    }

    // 应用主题
    applyTheme()

    // 开始监听系统主题变化
    watchSystemTheme()
  }

  // 应用主题到 DOM
  const applyTheme = () => {
    const root = document.documentElement

    if (isDarkMode.value) {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
  }

  // 设置主题模式
  const setThemeMode = (mode) => {
    if (Object.values(ThemeMode).includes(mode)) {
      themeMode.value = mode
    }
  }

  // 循环切换主题模式
  const cycleThemeMode = () => {
    const modes = [ThemeMode.LIGHT, ThemeMode.DARK, ThemeMode.AUTO]
    const currentIndex = modes.indexOf(themeMode.value)
    const nextIndex = (currentIndex + 1) % modes.length
    themeMode.value = modes[nextIndex]
  }

  // 监听主题模式变化，自动保存到 localStorage 并应用
  watch(themeMode, (newMode) => {
    localStorage.setItem('themeMode', newMode)
    applyTheme()
  })

  // 监听系统主题偏好变化
  watch(systemPrefersDark, () => {
    // 只有在 auto 模式下才需要重新应用主题
    if (themeMode.value === ThemeMode.AUTO) {
      applyTheme()
    }
  })

  // 监听系统主题变化
  const watchSystemTheme = () => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

    const handleChange = (e) => {
      systemPrefersDark.value = e.matches
    }

    // 初始检测
    systemPrefersDark.value = mediaQuery.matches

    // 添加监听器
    mediaQuery.addEventListener('change', handleChange)

    // 返回清理函数
    return () => {
      mediaQuery.removeEventListener('change', handleChange)
    }
  }

  // 兼容旧版 API
  const toggleTheme = () => {
    cycleThemeMode()
  }

  const setTheme = (theme) => {
    if (theme === 'dark') {
      setThemeMode(ThemeMode.DARK)
    } else if (theme === 'light') {
      setThemeMode(ThemeMode.LIGHT)
    }
  }

  return {
    // State
    themeMode,
    isDarkMode,
    currentTheme,
    systemPrefersDark,

    // Constants
    ThemeMode,

    // Actions
    initTheme,
    setThemeMode,
    cycleThemeMode,
    watchSystemTheme,

    // 兼容旧版 API
    toggleTheme,
    setTheme
  }
})
