export const APP_CONFIG = {
  basePath: import.meta.env.VITE_APP_BASE_URL || (import.meta.env.DEV ? '/admin/' : '/web/admin/'),
  apiPrefix: import.meta.env.DEV ? '/webapi' : ''
}

export function getAppUrl(path = '') {
  if (path && !path.startsWith('/')) path = '/' + path
  return APP_CONFIG.basePath + (path.startsWith('#') ? path : '#' + path)
}

export function getLoginUrl() {
  return getAppUrl('/login')
}
