const axios = require('axios')

function getErrorMessage(response, fallback) {
  if (!response) {
    return fallback
  }

  if (response.data && typeof response.data === 'object') {
    return response.data.message || response.data.error || fallback
  }

  return fallback
}

async function loginWithPassword(server, username, password) {
  const response = await axios.post(
    `${server}/web/auth/login`,
    { username, password },
    {
      timeout: 15000,
      validateStatus: () => true
    }
  )

  if (response.status < 200 || response.status >= 300 || !response.data?.token) {
    throw new Error(getErrorMessage(response, '登录失败'))
  }

  return response.data
}

async function refreshAdminToken(server, token) {
  const response = await axios.post(
    `${server}/web/auth/refresh`,
    {},
    {
      headers: {
        Authorization: `Bearer ${token}`
      },
      timeout: 15000,
      validateStatus: () => true
    }
  )

  if (response.status < 200 || response.status >= 300 || !response.data?.token) {
    throw new Error(getErrorMessage(response, '刷新 token 失败'))
  }

  return response.data
}

async function getCurrentAdmin(server, token, options = {}) {
  const { tryRefresh = false } = options
  const response = await axios.get(`${server}/web/auth/user`, {
    headers: {
      Authorization: `Bearer ${token}`
    },
    timeout: 15000,
    validateStatus: () => true
  })

  if (response.status >= 200 && response.status < 300) {
    return {
      user: response.data?.user || null,
      refreshedToken: ''
    }
  }

  if (response.status === 401 && tryRefresh) {
    const refreshed = await refreshAdminToken(server, token)
    const retry = await axios.get(`${server}/web/auth/user`, {
      headers: {
        Authorization: `Bearer ${refreshed.token}`
      },
      timeout: 15000,
      validateStatus: () => true
    })

    if (retry.status >= 200 && retry.status < 300) {
      return {
        user: retry.data?.user || null,
        refreshedToken: refreshed.token
      }
    }

    throw new Error(getErrorMessage(retry, '获取当前登录用户失败'))
  }

  throw new Error(getErrorMessage(response, '获取当前登录用户失败'))
}

async function logoutAdmin(server, token) {
  const response = await axios.post(
    `${server}/web/auth/logout`,
    {},
    {
      headers: {
        Authorization: `Bearer ${token}`
      },
      timeout: 15000,
      validateStatus: () => true
    }
  )

  if (response.status >= 200 && response.status < 300) {
    return
  }

  throw new Error(getErrorMessage(response, '登出失败'))
}

async function requestWithAdminAuth(server, token, method, path, options = {}) {
  const { query = null, body = null, tryRefresh = true } = options

  const request = async (authToken) =>
    axios({
      method,
      url: `${server}${path}`,
      params: query || undefined,
      data: body || undefined,
      headers: {
        Authorization: `Bearer ${authToken}`
      },
      timeout: 20000,
      validateStatus: () => true
    })

  const response = await request(token)
  if (response.status >= 200 && response.status < 300) {
    return {
      data: response.data,
      refreshedToken: ''
    }
  }

  if (response.status === 401 && tryRefresh) {
    const refreshed = await refreshAdminToken(server, token)
    const retry = await request(refreshed.token)
    if (retry.status >= 200 && retry.status < 300) {
      return {
        data: retry.data,
        refreshedToken: refreshed.token
      }
    }
    throw new Error(getErrorMessage(retry, `请求失败: ${method.toUpperCase()} ${path}`))
  }

  throw new Error(getErrorMessage(response, `请求失败: ${method.toUpperCase()} ${path}`))
}

async function getWithAdminAuth(server, token, path, query = null, options = {}) {
  return requestWithAdminAuth(server, token, 'get', path, {
    query,
    tryRefresh: options.tryRefresh !== false
  })
}

module.exports = {
  loginWithPassword,
  refreshAdminToken,
  getCurrentAdmin,
  logoutAdmin,
  requestWithAdminAuth,
  getWithAdminAuth
}
