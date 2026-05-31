import { createI18n } from 'vue-i18n'
import en from './locales/en'
import zhCN from './locales/zh-CN'

const enModules = import.meta.glob('./locales/en/*.js', { eager: true, import: 'default' })
const zhCNModules = import.meta.glob('./locales/zh-CN/*.js', { eager: true, import: 'default' })

const isPlainObject = (value) => value && typeof value === 'object' && !Array.isArray(value)

const mergeMessages = (...messages) =>
  messages.reduce((merged, message) => {
    Object.entries(message || {}).forEach(([key, value]) => {
      if (isPlainObject(value) && isPlainObject(merged[key])) {
        merged[key] = mergeMessages(merged[key], value)
      } else if (isPlainObject(value)) {
        merged[key] = mergeMessages({}, value)
      } else {
        merged[key] = value
      }
    })
    return merged
  }, {})

const enMessages = mergeMessages(en, ...Object.values(enModules))
const zhCNMessages = mergeMessages(zhCN, ...Object.values(zhCNModules))

export const LOCALE_STORAGE_KEY = 'mighty-locale'
export const LOCALE_EXPLICIT_STORAGE_KEY = 'mighty-locale-explicit'
export const DEFAULT_LOCALE = 'en'

export const supportedLocales = [
  { value: 'en', labelKey: 'locale.english', htmlLang: 'en' },
  { value: 'zh-CN', labelKey: 'locale.chinese', htmlLang: 'zh-CN' }
]

export const normalizeLocale = (locale) => {
  if (!locale) return DEFAULT_LOCALE
  const normalized = locale.toLowerCase()
  if (normalized.startsWith('zh')) return 'zh-CN'
  if (normalized.startsWith('en')) return 'en'
  return DEFAULT_LOCALE
}

export const getInitialLocale = () => {
  const stored = localStorage.getItem(LOCALE_STORAGE_KEY)
  const hasExplicitLocale = localStorage.getItem(LOCALE_EXPLICIT_STORAGE_KEY) === 'true'
  return hasExplicitLocale ? normalizeLocale(stored) : DEFAULT_LOCALE
}

export const getCurrentLocale = () => normalizeLocale(localStorage.getItem(LOCALE_STORAGE_KEY))

export const i18n = createI18n({
  legacy: false,
  globalInjection: true,
  locale: getInitialLocale(),
  fallbackLocale: DEFAULT_LOCALE,
  messages: {
    en: enMessages,
    'zh-CN': zhCNMessages
  }
})

const applyAppLocale = (locale) => {
  const nextLocale = normalizeLocale(locale)
  i18n.global.locale.value = nextLocale
  document.documentElement.lang =
    supportedLocales.find((item) => item.value === nextLocale)?.htmlLang || DEFAULT_LOCALE
  return nextLocale
}

export const setAppLocale = (locale) => {
  const nextLocale = applyAppLocale(locale)
  localStorage.setItem(LOCALE_STORAGE_KEY, nextLocale)
  localStorage.setItem(LOCALE_EXPLICIT_STORAGE_KEY, 'true')
  return nextLocale
}

applyAppLocale(i18n.global.locale.value)

export default i18n
