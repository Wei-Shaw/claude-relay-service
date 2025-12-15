// 应用配置
export const APP_CONFIG = {
  // 应用基础路径
  basePath: import.meta.env.VITE_APP_BASE_URL || (import.meta.env.DEV ? '/admin/' : '/admin-next/'),

  // 应用标题
  title: import.meta.env.VITE_APP_TITLE || 'Claude Relay Service - 管理后台',

  // 是否为开发环境
  isDev: import.meta.env.DEV,

  // API 前缀
  apiPrefix: import.meta.env.DEV ? '/webapi' : ''
}

// 获取完整的应用URL
export function getAppUrl(path = '') {
  // 确保路径以 / 开头
  if (path && !path.startsWith('/')) {
    path = '/' + path
  }
  return APP_CONFIG.basePath + (path.startsWith('#') ? path : '#' + path)
}

// 获取登录页面URL
export function getLoginUrl() {
  return getAppUrl('/login')
}
