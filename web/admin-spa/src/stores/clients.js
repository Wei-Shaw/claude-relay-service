import { defineStore } from 'pinia'
import { getSupportedClientsApi } from '@/utils/http_apis'

export const useClientsStore = defineStore('clients', {
  state: () => ({
    supportedClients: [],
    loading: false,
    error: null
  }),

  actions: {
    async loadSupportedClients() {
      if (this.supportedClients.length > 0) return this.supportedClients

      this.loading = true
      const res = await getSupportedClientsApi()
      if (res.success) this.supportedClients = res.data || []
      else this.error = res.message
      this.loading = false
      return this.supportedClients
    }
  }
})
