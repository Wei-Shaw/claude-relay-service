import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'

// 主题模式枚举
export const ThemeMode = {
  LIGHT: 'light',
  DARK: 'dark',
  AUTO: 'auto'
}

// 中国传统色系预设
export const ColorSchemes = {
  purple: {
    name: '默认紫',
    nameEn: 'Purple',
    primary: '#667eea',
    secondary: '#764ba2',
    accent: '#f093fb',
    gradientStart: '#667eea',
    gradientMid: '#764ba2',
    gradientEnd: '#f093fb',
    // 玻璃态背景色（亮色模式）
    glassStrong: 'rgba(255, 255, 255, 0.95)',
    glass: 'rgba(255, 255, 255, 0.1)',
    // 暗黑模式
    darkPrimary: '#818cf8',
    darkSecondary: '#a78bfa',
    darkAccent: '#c084fc',
    darkGradientStart: '#1f2937',
    darkGradientMid: '#374151',
    darkGradientEnd: '#4b5563',
    darkGlassStrong: 'rgba(31, 41, 55, 0.95)',
    darkGlass: 'rgba(0, 0, 0, 0.2)'
  },
  celadon: {
    name: '青瓷',
    nameEn: 'Celadon',
    primary: '#7faaaf',
    secondary: '#5d8a8e',
    accent: '#a8d8dc',
    gradientStart: '#7faaaf',
    gradientMid: '#5d8a8e',
    gradientEnd: '#3d6a6e',
    glassStrong: 'rgba(248, 253, 253, 0.95)',
    glass: 'rgba(168, 216, 220, 0.1)',
    darkPrimary: '#9fcacd',
    darkSecondary: '#7daaae',
    darkAccent: '#c8f8fc',
    darkGradientStart: '#1a2a2b',
    darkGradientMid: '#2a3a3b',
    darkGradientEnd: '#3a4a4b',
    darkGlassStrong: 'rgba(26, 42, 43, 0.95)',
    darkGlass: 'rgba(0, 20, 20, 0.2)'
  },
  cinnabar: {
    name: '朱砂',
    nameEn: 'Cinnabar',
    primary: '#c45a5a',
    secondary: '#8b3a3a',
    accent: '#e8a0a0',
    gradientStart: '#c45a5a',
    gradientMid: '#8b3a3a',
    gradientEnd: '#5c2a2a',
    glassStrong: 'rgba(255, 252, 252, 0.95)',
    glass: 'rgba(232, 160, 160, 0.1)',
    darkPrimary: '#e47a7a',
    darkSecondary: '#ab5a5a',
    darkAccent: '#f8c0c0',
    darkGradientStart: '#2a1a1a',
    darkGradientMid: '#3a2a2a',
    darkGradientEnd: '#4a3a3a',
    darkGlassStrong: 'rgba(42, 26, 26, 0.95)',
    darkGlass: 'rgba(20, 0, 0, 0.2)'
  },
  jade: {
    name: '墨玉',
    nameEn: 'Jade',
    primary: '#4a7c59',
    secondary: '#2d5a3d',
    accent: '#7eb08c',
    gradientStart: '#4a7c59',
    gradientMid: '#2d5a3d',
    gradientEnd: '#1a3d28',
    glassStrong: 'rgba(250, 255, 252, 0.95)',
    glass: 'rgba(126, 176, 140, 0.1)',
    darkPrimary: '#6a9c79',
    darkSecondary: '#4d7a5d',
    darkAccent: '#9ed0ac',
    darkGradientStart: '#1a2a1e',
    darkGradientMid: '#2a3a2e',
    darkGradientEnd: '#3a4a3e',
    darkGlassStrong: 'rgba(26, 42, 30, 0.95)',
    darkGlass: 'rgba(0, 20, 10, 0.2)'
  },
  indigo: {
    name: '藏蓝',
    nameEn: 'Indigo',
    primary: '#3a5a8c',
    secondary: '#2a4066',
    accent: '#6a8ab8',
    gradientStart: '#3a5a8c',
    gradientMid: '#2a4066',
    gradientEnd: '#1a2a44',
    glassStrong: 'rgba(250, 252, 255, 0.95)',
    glass: 'rgba(106, 138, 184, 0.1)',
    darkPrimary: '#5a7aac',
    darkSecondary: '#4a6086',
    darkAccent: '#8aaad8',
    darkGradientStart: '#1a1a2a',
    darkGradientMid: '#2a2a3a',
    darkGradientEnd: '#3a3a4a',
    darkGlassStrong: 'rgba(26, 26, 42, 0.95)',
    darkGlass: 'rgba(0, 0, 20, 0.2)'
  },
  amber: {
    name: '琥珀',
    nameEn: 'Amber',
    primary: '#c49a3a',
    secondary: '#8b6914',
    accent: '#e8c86a',
    gradientStart: '#c49a3a',
    gradientMid: '#8b6914',
    gradientEnd: '#5c4a0a',
    glassStrong: 'rgba(255, 253, 248, 0.95)',
    glass: 'rgba(232, 200, 106, 0.1)',
    darkPrimary: '#e4ba5a',
    darkSecondary: '#ab8934',
    darkAccent: '#f8e88a',
    darkGradientStart: '#2a2a1a',
    darkGradientMid: '#3a3a2a',
    darkGradientEnd: '#4a4a3a',
    darkGlassStrong: 'rgba(42, 42, 26, 0.95)',
    darkGlass: 'rgba(20, 20, 0, 0.2)'
  },
  rouge: {
    name: '胭脂',
    nameEn: 'Rouge',
    primary: '#b85a6a',
    secondary: '#8a3a4a',
    accent: '#e8a0b0',
    gradientStart: '#b85a6a',
    gradientMid: '#8a3a4a',
    gradientEnd: '#5c2a3a',
    glassStrong: 'rgba(255, 250, 252, 0.95)',
    glass: 'rgba(232, 160, 176, 0.1)',
    darkPrimary: '#d87a8a',
    darkSecondary: '#aa5a6a',
    darkAccent: '#f8c0d0',
    darkGradientStart: '#2a1a1e',
    darkGradientMid: '#3a2a2e',
    darkGradientEnd: '#4a3a3e',
    darkGlassStrong: 'rgba(42, 26, 30, 0.95)',
    darkGlass: 'rgba(20, 0, 10, 0.2)'
  }
}

export const useThemeStore = defineStore('theme', () => {
  // 状态 - 支持三种模式：light, dark, auto
  const themeMode = ref(ThemeMode.AUTO)
  const systemPrefersDark = ref(false)
  // 色系状态
  const colorScheme = ref('purple')

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

  // 计算属性 - 当前色系配置
  const currentColorScheme = computed(() => {
    return ColorSchemes[colorScheme.value] || ColorSchemes.purple
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

    // 从 localStorage 读取保存的色系
    const savedColorScheme = localStorage.getItem('colorScheme')
    if (savedColorScheme && ColorSchemes[savedColorScheme]) {
      colorScheme.value = savedColorScheme
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

    // 应用色系 CSS 变量
    applyColorScheme()
  }

  // 应用色系 CSS 变量
  const applyColorScheme = () => {
    const root = document.documentElement
    const scheme = currentColorScheme.value
    const dark = isDarkMode.value

    const primary = dark ? scheme.darkPrimary : scheme.primary
    const secondary = dark ? scheme.darkSecondary : scheme.secondary
    const accent = dark ? scheme.darkAccent : scheme.accent

    // 设置主题色
    root.style.setProperty('--primary-color', primary)
    root.style.setProperty('--secondary-color', secondary)
    root.style.setProperty('--accent-color', accent)

    // 设置背景渐变
    root.style.setProperty(
      '--bg-gradient-start',
      dark ? scheme.darkGradientStart : scheme.gradientStart
    )
    root.style.setProperty('--bg-gradient-mid', dark ? scheme.darkGradientMid : scheme.gradientMid)
    root.style.setProperty('--bg-gradient-end', dark ? scheme.darkGradientEnd : scheme.gradientEnd)

    // 设置玻璃态背景色
    root.style.setProperty(
      '--glass-strong-color',
      dark ? scheme.darkGlassStrong : scheme.glassStrong
    )
    root.style.setProperty('--glass-color', dark ? scheme.darkGlass : scheme.glass)

    // 设置表面颜色（卡片背景等）
    root.style.setProperty('--surface-color', dark ? scheme.darkGlassStrong : scheme.glassStrong)
    root.style.setProperty('--table-bg', dark ? scheme.darkGlassStrong : scheme.glassStrong)
    root.style.setProperty('--input-bg', dark ? scheme.darkGlassStrong : scheme.glassStrong)

    // 解析颜色为 RGB 值用于 rgba()
    const hexToRgb = (hex) => {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
      return result
        ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`
        : '102, 126, 234'
    }

    const primaryRgb = hexToRgb(primary)
    const secondaryRgb = hexToRgb(secondary)
    const accentRgb = hexToRgb(accent)

    // 设置 RGB 变量用于 rgba()
    root.style.setProperty('--primary-rgb', primaryRgb)
    root.style.setProperty('--secondary-rgb', secondaryRgb)
    root.style.setProperty('--accent-rgb', accentRgb)

    // 设置表格 hover 颜色（暗黑模式透明度更高）
    root.style.setProperty('--table-hover', `rgba(${primaryRgb}, ${dark ? 0.1 : 0.05})`)

    // 设置边框颜色（基于主题色）
    root.style.setProperty('--border-color', `rgba(${primaryRgb}, ${dark ? 0.25 : 0.2})`)

    // 设置输入框边框
    root.style.setProperty('--input-border', `rgba(${primaryRgb}, ${dark ? 0.3 : 0.25})`)
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

  // 设置色系
  const setColorScheme = (scheme) => {
    if (ColorSchemes[scheme]) {
      colorScheme.value = scheme
    }
  }

  // 循环切换色系
  const cycleColorScheme = () => {
    const schemes = Object.keys(ColorSchemes)
    const currentIndex = schemes.indexOf(colorScheme.value)
    const nextIndex = (currentIndex + 1) % schemes.length
    colorScheme.value = schemes[nextIndex]
  }

  // 监听主题模式变化，自动保存到 localStorage 并应用
  watch(themeMode, (newMode) => {
    localStorage.setItem('themeMode', newMode)
    applyTheme()
  })

  // 监听色系变化，自动保存到 localStorage 并应用
  watch(colorScheme, (newScheme) => {
    localStorage.setItem('colorScheme', newScheme)
    applyColorScheme()
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
    colorScheme,
    currentColorScheme,

    // Constants
    ThemeMode,
    ColorSchemes,

    // Actions
    initTheme,
    setThemeMode,
    cycleThemeMode,
    watchSystemTheme,
    setColorScheme,
    cycleColorScheme,

    // 兼容旧版 API
    toggleTheme,
    setTheme
  }
})
