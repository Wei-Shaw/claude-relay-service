import { defineStore } from 'pinia'
import { apiClient } from '@/config/api'

export const useClientsStore = defineStore('clients', {
  state: () => ({
    supportedClients: [],
    loading: false,
    error: null
  }),

  actions: {
    async loadSupportedClients() {
      if (this.supportedClients.length > 0) {
        // 如果已经加载过，不重复加载
        return this.supportedClients
      }

      this.loading = true
      this.error = null

      try {
        const response = await apiClient.get('/admin/supported-clients')

        if (response.success) {
          this.supportedClients = response.data || []
        } else {
          this.error = response.message || '加载支持的客户端失败'
          console.error('Failed to load supported clients:', this.error)
        }

        return this.supportedClients
      } catch (error) {
        this.error = error.message || '加载支持的客户端失败'
        console.error('Error loading supported clients:', error)
        return []
      } finally {
        this.loading = false
      }
    }
  }
})
