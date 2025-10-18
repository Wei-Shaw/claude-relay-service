const axios = require('axios')
const config = require('../../config/config')
const logger = require('./logger')
const ProxyHelper = require('./proxyHelper')

const WORKOS_CONFIG = config.droid || {}

const WORKOS_DEVICE_AUTHORIZE_URL =
  WORKOS_CONFIG.deviceAuthorizeUrl || 'https://api.workos.com/user_management/authorize/device'
const WORKOS_TOKEN_URL =
  WORKOS_CONFIG.tokenUrl || 'https://api.workos.com/user_management/authenticate'
const WORKOS_CLIENT_ID = WORKOS_CONFIG.clientId || 'client_01HNM792M5G5G1A2THWPXKFMXB'

const DEFAULT_POLL_INTERVAL = 5

class WorkOSDeviceAuthError extends Error {
  constructor(message, code, options = {}) {
    super(message)
    this.name = 'WorkOSDeviceAuthError'
    this.code = code || 'unknown_error'
    this.retryAfter = options.retryAfter || null
  }
}

/**
 * 启动设备码授权流程
 * @param {object|null} proxyConfig - 代理配置
 * @returns {Promise<object>} WorkOS 返回的数据
 */
async function startDeviceAuthorization(proxyConfig = null) {
  const form = new URLSearchParams({
    client_id: WORKOS_CLIENT_ID
  })

  const agent = ProxyHelper.createProxyAgent(proxyConfig)

  try {
    logger.info('🔐 请求 WorkOS 设备码授权', {
      url: WORKOS_DEVICE_AUTHORIZE_URL,
      hasProxy: !!agent
    })

    const axiosConfig = {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      timeout: 15000
    }

    if (agent) {
      axiosConfig.httpAgent = agent
      axiosConfig.httpsAgent = agent
      axiosConfig.proxy = false
    }

    const response = await axios.post(WORKOS_DEVICE_AUTHORIZE_URL, form.toString(), axiosConfig)

    const data = response.data || {}

    if (!data.device_code || !data.verification_uri) {
      throw new Error('WorkOS 返回数据缺少必要字段 (device_code / verification_uri)')
    }

    logger.success('✅ 成功获取 WorkOS 设备码授权信息', {
      verificationUri: data.verification_uri,
      userCode: data.user_code
    })

    return {
      deviceCode: data.device_code,
      userCode: data.user_code,
      verificationUri: data.verification_uri,
      verificationUriComplete: data.verification_uri_complete || data.verification_uri,
      expiresIn: data.expires_in || 300,
      interval: data.interval || DEFAULT_POLL_INTERVAL
    }
  } catch (error) {
    if (error.response) {
      logger.error('❌ WorkOS 设备码授权失败', {
        status: error.response.status,
        data: error.response.data
      })
      throw new WorkOSDeviceAuthError(
        error.response.data?.error_description ||
          error.response.data?.error ||
          'WorkOS 设备码授权失败',
        error.response.data?.error
      )
    }

    logger.error('❌ 请求 WorkOS 设备码授权异常', {
      message: error.message
    })
    throw new WorkOSDeviceAuthError(error.message)
  }
}

/**
 * 轮询授权结果
 * @param {string} deviceCode - 设备码
 * @param {object|null} proxyConfig - 代理配置
 * @returns {Promise<object>} WorkOS 返回的 token 数据
 */
async function pollDeviceAuthorization(deviceCode, proxyConfig = null) {
  if (!deviceCode) {
    throw new WorkOSDeviceAuthError('缺少设备码，无法查询授权结果', 'missing_device_code')
  }

  const form = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    device_code: deviceCode,
    client_id: WORKOS_CLIENT_ID
  })

  const agent = ProxyHelper.createProxyAgent(proxyConfig)

  try {
    const axiosConfig = {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      timeout: 15000
    }

    if (agent) {
      axiosConfig.httpAgent = agent
      axiosConfig.httpsAgent = agent
      axiosConfig.proxy = false
    }

    const response = await axios.post(WORKOS_TOKEN_URL, form.toString(), axiosConfig)

    const data = response.data || {}

    if (!data.access_token) {
      throw new WorkOSDeviceAuthError('WorkOS 返回结果缺少 access_token', 'missing_access_token')
    }

    logger.success('🤖 Droid 授权完成，获取到访问令牌', {
      hasRefreshToken: !!data.refresh_token
    })

    return data
  } catch (error) {
    if (error.response) {
      const responseData = error.response.data || {}
      const errorCode = responseData.error || `http_${error.response.status}`
      const errorDescription =
        responseData.error_description || responseData.error || 'WorkOS 授权失败'

      if (errorCode === 'authorization_pending' || errorCode === 'slow_down') {
        const retryAfter =
          Number(responseData.interval) ||
          Number(error.response.headers?.['retry-after']) ||
          DEFAULT_POLL_INTERVAL

        throw new WorkOSDeviceAuthError(errorDescription, errorCode, {
          retryAfter
        })
      }

      if (errorCode === 'expired_token') {
        throw new WorkOSDeviceAuthError(errorDescription, errorCode)
      }

      logger.error('❌ WorkOS 设备授权轮询失败', {
        status: error.response.status,
        data: responseData
      })
      throw new WorkOSDeviceAuthError(errorDescription, errorCode)
    }

    logger.error('❌ WorkOS 设备授权轮询异常', {
      message: error.message
    })
    throw new WorkOSDeviceAuthError(error.message)
  }
}

module.exports = {
  startDeviceAuthorization,
  pollDeviceAuthorization,
  WorkOSDeviceAuthError
}
