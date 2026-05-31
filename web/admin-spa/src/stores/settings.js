import { defineStore } from 'pinia'
import { ref } from 'vue'

import { getOemSettingsApi, updateOemSettingsApi } from '@/utils/http_apis'
import i18n from '@/i18n'

export const useSettingsStore = defineStore('settings', () => {
  const t = (...args) => i18n.global.t(...args)
  // 状态
  const oemSettings = ref({
    siteName: 'Claude Relay Service',
    siteIcon: '',
    siteIconData: '',
    showAdminButton: true,
    apiStatsNotice: { enabled: false, title: '', content: '' },
    updatedAt: null
  })

  const loading = ref(false)
  const saving = ref(false)

  // Actions
  const loadOemSettings = async () => {
    loading.value = true
    const res = await getOemSettingsApi()
    if (res.success) {
      oemSettings.value = { ...oemSettings.value, ...res.data }
      applyOemSettings()
    }
    loading.value = false
    return res
  }

  const saveOemSettings = async (settings) => {
    saving.value = true
    const res = await updateOemSettingsApi(settings)
    if (res.success) {
      oemSettings.value = { ...oemSettings.value, ...res.data }
      applyOemSettings()
    }
    saving.value = false
    return res
  }

  const resetOemSettings = async () => {
    const defaultSettings = {
      siteName: 'Claude Relay Service',
      siteIcon: '',
      siteIconData: '',
      showAdminButton: true,
      apiStatsNotice: { enabled: false, title: '', content: '' },
      updatedAt: null
    }

    oemSettings.value = { ...defaultSettings }
    return await saveOemSettings(defaultSettings)
  }

  // 应用OEM设置到页面
  const applyOemSettings = () => {
    // 更新页面标题
    if (oemSettings.value.siteName) {
      document.title = `${oemSettings.value.siteName} - ${t('adminUtility.storeMessages.adminConsole')}`
    }

    // 更新favicon
    if (oemSettings.value.siteIconData || oemSettings.value.siteIcon) {
      const favicon = document.querySelector('link[rel="icon"]') || document.createElement('link')
      favicon.rel = 'icon'
      favicon.href = oemSettings.value.siteIconData || oemSettings.value.siteIcon
      if (!document.querySelector('link[rel="icon"]')) {
        document.head.appendChild(favicon)
      }
    }
  }

  // 格式化日期时间
  const formatDateTime = (dateString) => {
    if (!dateString) return ''
    return new Date(dateString).toLocaleString(
      i18n.global.locale.value === 'zh-CN' ? 'zh-CN' : 'en-US',
      {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      }
    )
  }

  // 验证文件上传
  const validateIconFile = (file) => {
    const errors = []

    // 检查文件大小 (350KB)
    if (file.size > 350 * 1024) {
      errors.push(t('adminUtility.storeMessages.iconTooLarge'))
    }

    // 检查文件类型
    const allowedTypes = ['image/x-icon', 'image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml']
    if (!allowedTypes.includes(file.type)) {
      errors.push(t('adminUtility.storeMessages.unsupportedIconType'))
    }

    return {
      isValid: errors.length === 0,
      errors
    }
  }

  // 将文件转换为Base64
  const fileToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => resolve(e.target.result)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  return {
    // State
    oemSettings,
    loading,
    saving,

    // Actions
    loadOemSettings,
    saveOemSettings,
    resetOemSettings,
    applyOemSettings,
    formatDateTime,
    validateIconFile,
    fileToBase64
  }
})
