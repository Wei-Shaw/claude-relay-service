// API Stats 专用 API 客户端
// 与管理员 API 隔离，不需要认证

class ApiStatsClient {
  constructor() {
    this.baseURL = window.location.origin
    // 开发环境需要为 admin 路径添加 /webapi 前缀
    this.isDev = import.meta.env.DEV
  }

  async request(url, options = {}) {
    try {
      // 在开发环境中，为 /admin 路径添加 /webapi 前缀
      if (this.isDev && url.startsWith('/admin')) {
        url = '/webapi' + url
      }

      const response = await fetch(`${this.baseURL}${url}`, {
        headers: {
          'Content-Type': 'application/json',
          ...options.headers
        },
        ...options
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.message || `请求失败: ${response.status}`)
      }

      return data
    } catch (error) {
      console.error('API Stats request error:', error)
      throw error
    }
  }

  // 获取 API Key ID
  async getKeyId(apiKey) {
    return this.request('/apiStats/api/get-key-id', {
      method: 'POST',
      body: JSON.stringify({ apiKey })
    })
  }

  // 获取用户统计数据
  async getUserStats(apiId) {
    return this.request('/apiStats/api/user-stats', {
      method: 'POST',
      body: JSON.stringify({ apiId })
    })
  }

  // 获取模型使用统计
  async getUserModelStats(apiId, period = 'daily') {
    return this.request('/apiStats/api/user-model-stats', {
      method: 'POST',
      body: JSON.stringify({ apiId, period })
    })
  }

  // 获取 OEM 设置（用于网站名称和图标）
  async getOemSettings() {
    try {
      return await this.request('/admin/oem-settings')
    } catch (error) {
      console.error('Failed to load OEM settings:', error)
      return {
        success: true,
        data: {
          siteName: 'Claude Relay Service',
          siteIcon: '',
          siteIconData: ''
        }
      }
    }
  }

  // 批量查询统计数据
  async getBatchStats(apiIds) {
    return this.request('/apiStats/api/batch-stats', {
      method: 'POST',
      body: JSON.stringify({ apiIds })
    })
  }

  // 批量查询模型统计
  async getBatchModelStats(apiIds, period = 'daily') {
    return this.request('/apiStats/api/batch-model-stats', {
      method: 'POST',
      body: JSON.stringify({ apiIds, period })
    })
  }
}

export const apiStatsClient = new ApiStatsClient()
