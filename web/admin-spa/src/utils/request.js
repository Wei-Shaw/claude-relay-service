import axios from 'axios'

import { APP_CONFIG, getLoginUrl } from '@/utils/tools'

const axiosInstance = axios.create({
  baseURL: APP_CONFIG.apiPrefix,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' }
})

axiosInstance.interceptors.request.use((config) => {
  const token = localStorage.getItem('authToken')
  if (token) config.headers['Authorization'] = `Bearer ${token}`
  return config
})

axiosInstance.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (error.response?.status === 401) {
      const path = window.location.pathname + window.location.hash
      // api-stats 和 user-login 是公开页面，401 是业务错误不是认证错误
      const isPublicPage = path.includes('/api-stats') || path.includes('/user-login')
      if (!path.includes('/login') && !path.endsWith('/') && !isPublicPage) {
        localStorage.removeItem('authToken')
        window.location.href = getLoginUrl()
      }
    }
    return Promise.reject(error)
  }
)

// 通用请求函数 - 只会 resolve，调用方无需 try-catch
const request = async (config) => {
  try {
    return await axiosInstance(config)
  } catch (error) {
    console.error('Request failed:', error)
    const data = error.response?.data
    // 如果后端返回了数据，直接返回（可能是 { success, message } 或 { error, message } 格式）
    if (data) {
      if (typeof data.success !== 'undefined') return data
      // 处理 { error, message } 格式的响应
      if (data.error || data.message) return { success: false, message: data.message || data.error }
    }
    const status = error.response?.status
    const messages = {
      401: '未授权，请重新登录',
      403: '无权限访问',
      404: '请求的资源不存在',
      500: '服务器内部错误'
    }
    return { success: false, message: messages[status] || error.message || '请求失败' }
  }
}

export default request
