import { createHttp } from '@/utils/http'
import { APP_CONFIG, getLoginUrl } from '@/utils/tools'

// 401 处理: 清除 token 并跳转登录（公开页面除外）
const handleUnauthorized = () => {
  const path = window.location.pathname + window.location.hash
  // api-stats 和 user-login 是公开页面，401 是业务错误不是认证错误
  const isPublicPage = path.includes('/api-stats') || path.includes('/user-login')
  if (!path.includes('/login') && !path.endsWith('/') && !isPublicPage) {
    localStorage.removeItem('authToken')
    window.location.href = getLoginUrl()
  }
}

const statusMessages = {
  401: '未授权，请重新登录',
  403: '无权限访问',
  404: '请求的资源不存在',
  500: '服务器内部错误'
}

const service = createHttp({
  baseURL: APP_CONFIG.apiPrefix,
  timeout: 30000,
  onRequest: (_config, init) => {
    const token = localStorage.getItem('authToken')
    if (token) init.headers['Authorization'] = `Bearer ${token}`
  },
  // 统一响应处理: 只会 resolve，调用方无需 try-catch
  onResponse: (res, json, config) => {
    // 网络异常 / 超时 / 取消（用户主动取消不记错误日志）
    if (!res) {
      if (json.error && !json.aborted) {
        console.error('Request failed:', config?.method, config?.url, json.error)
      }
      return { success: false, message: json.message || '请求失败' }
    }
    if (res.status === 401) handleUnauthorized()
    // 2xx 直接返回响应体（等价于 axios 的 response.data）
    if (res.ok) return json
    // 非 2xx: 透传后端数据并补上 httpStatus，便于调用方区分业务拒绝（404/409）与服务故障（5xx）
    if (res.status >= 500) {
      console.error('Request failed:', config?.method, config?.url, res.status)
    }
    if (json) {
      if (typeof json.success !== 'undefined') return { ...json, httpStatus: res.status }
      if (json.error || json.message) {
        return { success: false, message: json.message || json.error, httpStatus: res.status }
      }
    }
    return {
      success: false,
      message: statusMessages[res.status] || '请求失败',
      httpStatus: res.status
    }
  }
})

const request = (config) => service(config)

export default request
