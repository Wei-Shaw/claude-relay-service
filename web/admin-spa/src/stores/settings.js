import { defineStore } from 'pinia'
import { ref } from 'vue'

import { getOemSettingsApi, updateOemSettingsApi } from '@/utils/http_apis'
import { formatLocalDateTime } from '@/utils/time'

export const useSettingsStore = defineStore('settings', () => {
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

  // Actions —— 本 store 只管表单状态与读写；favicon/document.title 等全站显示副作用统一由 authStore 负责，这里不碰 DOM（曾因两套 favicon 逻辑用不同选择器/rel 产生重复 link 与清空残留）
  const loadOemSettings = async () => {
    loading.value = true
    const res = await getOemSettingsApi()
    if (res.success) {
      oemSettings.value = { ...oemSettings.value, ...res.data }
    }
    loading.value = false
    return res
  }

  const saveOemSettings = async (settings) => {
    saving.value = true
    const res = await updateOemSettingsApi(settings)
    if (res.success) {
      oemSettings.value = { ...oemSettings.value, ...res.data }
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

  // 格式化日期时间
  const formatDateTime = (dateString) => {
    if (!dateString) return ''
    return formatLocalDateTime(dateString)
  }

  // 验证文件上传
  const validateIconFile = (file) => {
    const errors = []

    // 检查文件大小 (350KB)
    if (file.size > 350 * 1024) {
      errors.push('图标文件大小不能超过 350KB')
    }

    // 检查文件类型
    const allowedTypes = ['image/x-icon', 'image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml']
    if (!allowedTypes.includes(file.type)) {
      errors.push('不支持的文件类型，请选择 .ico, .png, .jpg 或 .svg 文件')
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
    formatDateTime,
    validateIconFile,
    fileToBase64
  }
})
