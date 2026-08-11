import { defineStore } from 'pinia'
import { ref } from 'vue'

import * as httpApis from '@/utils/http_apis'

export const useProxyPoolStore = defineStore('proxyPool', () => {
  // ========== 概览 ==========
  const overview = ref(null)

  const fetchOverview = async () => {
    const res = await httpApis.getProxyPoolOverviewApi()
    if (res.success) {
      overview.value = res.data
    }
    return res
  }

  // ========== 代理 ==========
  const proxies = ref([])
  const loadingProxies = ref(false)

  const fetchProxies = async () => {
    loadingProxies.value = true
    const res = await httpApis.getProxiesApi()
    if (res.success) {
      proxies.value = res.data || []
    }
    loadingProxies.value = false
    return res
  }

  const createProxy = (data) => httpApis.createProxyApi(data)
  const updateProxy = (id, data) => httpApis.updateProxyApi(id, data)
  const deleteProxy = (id) => httpApis.deleteProxyApi(id)
  const healthCheckProxy = (id) => httpApis.healthCheckProxyApi(id)
  const qualityCheckProxy = (id) => httpApis.qualityCheckProxyApi(id)

  // ========== 分组 ==========
  const groups = ref([])
  const loadingGroups = ref(false)

  const fetchGroups = async () => {
    loadingGroups.value = true
    const res = await httpApis.getProxyGroupsApi()
    if (res.success) {
      groups.value = res.data || []
    }
    loadingGroups.value = false
    return res
  }

  const createGroup = (data) => httpApis.createProxyGroupApi(data)
  const updateGroup = (id, data) => httpApis.updateProxyGroupApi(id, data)
  const deleteGroup = (id) => httpApis.deleteProxyGroupApi(id)

  // ========== 全局设置 ==========
  const settings = ref(null)

  const fetchSettings = async () => {
    const res = await httpApis.getProxyPoolSettingsApi()
    if (res.success) {
      settings.value = res.data
    }
    return res
  }

  const updateSettings = (data) => httpApis.updateProxyPoolSettingsApi(data)

  return {
    // 概览
    overview,
    fetchOverview,
    // 代理
    proxies,
    loadingProxies,
    fetchProxies,
    createProxy,
    updateProxy,
    deleteProxy,
    healthCheckProxy,
    qualityCheckProxy,
    // 分组
    groups,
    loadingGroups,
    fetchGroups,
    createGroup,
    updateGroup,
    deleteGroup,
    // 设置
    settings,
    fetchSettings,
    updateSettings
  }
})
