import { defineStore } from 'pinia'
import { ref } from 'vue'
import { i18n, SUPPORTED_LOCALES, getSupportedLocalesWithI18n } from '@/i18n'

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

  // 获取当前语言信息（兼容i18n）
  const getCurrentLocaleInfo = (t = null) => {
    if (t) {
      const supportedLocales = getSupportedLocalesWithI18n(t)
      return supportedLocales[currentLocale.value] || supportedLocales['zh-cn']
    }
    return SUPPORTED_LOCALES[currentLocale.value] || SUPPORTED_LOCALES['zh-cn']
  }

  // 获取所有支持的语言（兼容i18n）
  const getSupportedLocales = (t = null) => {
    const supportedLocales = t ? getSupportedLocalesWithI18n(t) : SUPPORTED_LOCALES
    return Object.entries(supportedLocales).map(([key, value]) => ({
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
