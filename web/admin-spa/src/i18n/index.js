import { createI18n } from 'vue-i18n'
import zhCn from './locales/zh-cn.js'
import zhTw from './locales/zh-tw.js'
import en from './locales/en.js'

// 获取浏览器语言设置
function getBrowserLocale() {
  const navigatorLocale = navigator.languages ? navigator.languages[0] : navigator.language

  if (!navigatorLocale) {
    return 'zh-cn'
  }

  const trimmedLocale = navigatorLocale.trim().split(';')[0].toLowerCase()

  if (trimmedLocale.includes('zh')) {
    if (
      trimmedLocale.includes('tw') ||
      trimmedLocale.includes('hk') ||
      trimmedLocale.includes('mo')
    ) {
      return 'zh-tw'
    }
    return 'zh-cn'
  }

  if (trimmedLocale.includes('en')) {
    return 'en'
  }

  return 'zh-cn' // 默认简体中文
}

// 获取保存的语言设置或浏览器语言
const savedLocale = localStorage.getItem('app-locale')
const defaultLocale = savedLocale || getBrowserLocale()

export const SUPPORTED_LOCALES = {
  'zh-cn': {
    name: '简体中文',
    flag: '简',
    shortName: '简'
  },
  'zh-tw': {
    name: '繁體中文',
    flag: '繁',
    shortName: '繁'
  },
  en: {
    name: 'English',
    flag: 'EN',
    shortName: 'EN'
  }
}

export const i18n = createI18n({
  legacy: false, // 使用 Composition API 模式
  locale: defaultLocale,
  fallbackLocale: 'zh-cn',
  messages: {
    'zh-cn': zhCn,
    'zh-tw': zhTw,
    en: en
  },
  globalInjection: true // 全局注入 $t 函数
})

export default i18n
