import { defineStore } from 'pinia'
import { ref } from 'vue'
import { i18n, SUPPORTED_LOCALES } from '@/i18n'

export const useLocaleStore = defineStore('locale', () => {
  const currentLocale = ref(i18n.global.locale.value)

  // 切换语言
  const setLocale = (locale) => {
    if (!SUPPORTED_LOCALES[locale]) {
      console.warn(`Unsupported locale: ${locale}`)
      return
    }

    currentLocale.value = locale
    i18n.global.locale.value = locale
    localStorage.setItem('app-locale', locale)

    // 更新HTML lang属性
    document.documentElement.setAttribute('lang', locale)
  }

  // 获取当前语言信息
  const getCurrentLocaleInfo = () => {
    return SUPPORTED_LOCALES[currentLocale.value] || SUPPORTED_LOCALES['zh-cn']
  }

  // 获取所有支持的语言
  const getSupportedLocales = () => {
    return Object.entries(SUPPORTED_LOCALES).map(([key, value]) => ({
      code: key,
      ...value
    }))
  }

  return {
    currentLocale,
    setLocale,
    getCurrentLocaleInfo,
    getSupportedLocales
  }
})
