// API 配置
import { APP_CONFIG, getLoginUrl } from './app'

// 开发环境使用 /webapi 前缀，生产环境不使用前缀
export const API_PREFIX = APP_CONFIG.apiPrefix

// 创建完整的 API URL
export function createApiUrl(path) {
  // 确保路径以 / 开头
  if (!path.startsWith('/')) {
    path = '/' + path
  }
  return API_PREFIX + path
}

// API 请求的基础配置
export function getRequestConfig(token) {
  const config = {
    headers: {
      'Content-Type': 'application/json'
    }
  }

  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`
  }

  return config
}

// 统一的 API 请求类
class ApiClient {
  constructor() {
    this.baseURL = API_PREFIX
  }

  // 获取认证 token
  getAuthToken() {
    const authToken = localStorage.getItem('authToken')
    return authToken || null
  }

  // 构建请求配置
  buildConfig(options = {}) {
    const config = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      ...options
    }

    // 添加认证 token
    const token = this.getAuthToken()
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`
    }

    return config
  }

  // 处理响应
  async handleResponse(response) {
    // 401 未授权，需要重新登录
    if (response.status === 401) {
      // 如果当前已经在登录页面，不要再次跳转
      const currentPath = window.location.pathname + window.location.hash
      const isLoginPage = currentPath.includes('/login') || currentPath.endsWith('/')

      // 检查当前页面是否需要认证（不需要认证的页面不重定向）
      const isPublicPage = currentPath.includes('/api-stats') || currentPath.includes('/tutorial')

      if (!isLoginPage && !isPublicPage) {
        localStorage.removeItem('authToken')
        // 使用统一的登录URL
        window.location.href = getLoginUrl()
      }
      throw new Error('Unauthorized')
    }

    // 尝试解析 JSON
    const contentType = response.headers.get('content-type')
    if (contentType && contentType.includes('application/json')) {
      const data = await response.json()

      // 如果响应不成功，抛出错误
      if (!response.ok) {
        // 创建一个包含完整错误信息的错误对象
        const error = new Error(data.message || `HTTP ${response.status}`)
        // 保留完整的响应数据，以便错误处理时可以访问详细信息
        error.response = {
          status: response.status,
          data: data
        }
        // 为了向后兼容，也保留原始的 message
        error.message = data.message || error.message
        throw error
      }

      return data
    }

    // 非 JSON 响应
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    return response
  }

  // GET 请求
  async get(url, options = {}) {
    // 处理查询参数
    let fullUrl = createApiUrl(url)
    if (options.params) {
      const params = new URLSearchParams(options.params)
      fullUrl += '?' + params.toString()
    }

    // 移除 params 避免传递给 fetch
    // eslint-disable-next-line no-unused-vars
    const { params, ...configOptions } = options
    const config = this.buildConfig({
      ...configOptions,
      method: 'GET'
    })

    try {
      const response = await fetch(fullUrl, config)
      return await this.handleResponse(response)
    } catch (error) {
      console.error('API GET Error:', error)
      throw error
    }
  }

  // POST 请求
  async post(url, data = null, options = {}) {
    const fullUrl = createApiUrl(url)
    const config = this.buildConfig({
      ...options,
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined
    })

    try {
      const response = await fetch(fullUrl, config)
      return await this.handleResponse(response)
    } catch (error) {
      console.error('API POST Error:', error)
      throw error
    }
  }

  // PUT 请求
  async put(url, data = null, options = {}) {
    const fullUrl = createApiUrl(url)
    const config = this.buildConfig({
      ...options,
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined
    })

    try {
      const response = await fetch(fullUrl, config)
      return await this.handleResponse(response)
    } catch (error) {
      console.error('API PUT Error:', error)
      throw error
    }
  }

  // PATCH 请求
  async patch(url, data = null, options = {}) {
    const fullUrl = createApiUrl(url)
    const config = this.buildConfig({
      ...options,
      method: 'PATCH',
      body: data ? JSON.stringify(data) : undefined
    })

    try {
      const response = await fetch(fullUrl, config)
      return await this.handleResponse(response)
    } catch (error) {
      console.error('API PATCH Error:', error)
      throw error
    }
  }

  // DELETE 请求
  async delete(url, options = {}) {
    const fullUrl = createApiUrl(url)
    const { data, ...restOptions } = options

    const config = this.buildConfig({
      ...restOptions,
      method: 'DELETE',
      body: data ? JSON.stringify(data) : undefined
    })

    try {
      const response = await fetch(fullUrl, config)
      return await this.handleResponse(response)
    } catch (error) {
      console.error('API DELETE Error:', error)
      throw error
    }
  }
}

// 导出单例实例
export const apiClient = new ApiClient()
