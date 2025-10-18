/**
 * OAuth助手工具
 * 基于claude-code-login.js中的OAuth流程实现
 */

const crypto = require('crypto')
const ProxyHelper = require('./proxyHelper')
const axios = require('axios')
const logger = require('./logger')

// OAuth 配置常量 - 从claude-code-login.js提取
const OAUTH_CONFIG = {
  AUTHORIZE_URL: 'https://claude.ai/oauth/authorize',
  TOKEN_URL: 'https://console.anthropic.com/v1/oauth/token',
  CLIENT_ID: '9d1c250a-e61b-44d9-88ed-5944d1962f5e',
  REDIRECT_URI: 'https://console.anthropic.com/oauth/code/callback',
  SCOPES: 'org:create_api_key user:profile user:inference',
  SCOPES_SETUP: 'user:inference' // Setup Token 只需要推理权限
}

/**
 * 生成随机的 state 参数
 * @returns {string} 随机生成的 state (base64url编码)
 */
function generateState() {
  return crypto.randomBytes(32).toString('base64url')
}

/**
 * 生成随机的 code verifier（PKCE）
 * @returns {string} base64url 编码的随机字符串
 */
function generateCodeVerifier() {
  return crypto.randomBytes(32).toString('base64url')
}

/**
 * 生成 code challenge（PKCE）
 * @param {string} codeVerifier - code verifier 字符串
 * @returns {string} SHA256 哈希后的 base64url 编码字符串
 */
function generateCodeChallenge(codeVerifier) {
  return crypto.createHash('sha256').update(codeVerifier).digest('base64url')
}

/**
 * 生成授权 URL
 * @param {string} codeChallenge - PKCE code challenge
 * @param {string} state - state 参数
 * @returns {string} 完整的授权 URL
 */
function generateAuthUrl(codeChallenge, state) {
  const params = new URLSearchParams({
    code: 'true',
    client_id: OAUTH_CONFIG.CLIENT_ID,
    response_type: 'code',
    redirect_uri: OAUTH_CONFIG.REDIRECT_URI,
    scope: OAUTH_CONFIG.SCOPES,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state
  })

  return `${OAUTH_CONFIG.AUTHORIZE_URL}?${params.toString()}`
}

/**
 * 生成OAuth授权URL和相关参数
 * @returns {{authUrl: string, codeVerifier: string, state: string, codeChallenge: string}}
 */
function generateOAuthParams() {
  const state = generateState()
  const codeVerifier = generateCodeVerifier()
  const codeChallenge = generateCodeChallenge(codeVerifier)

  const authUrl = generateAuthUrl(codeChallenge, state)

  return {
    authUrl,
    codeVerifier,
    state,
    codeChallenge
  }
}

/**
 * 生成 Setup Token 授权 URL
 * @param {string} codeChallenge - PKCE code challenge
 * @param {string} state - state 参数
 * @returns {string} 完整的授权 URL
 */
function generateSetupTokenAuthUrl(codeChallenge, state) {
  const params = new URLSearchParams({
    code: 'true',
    client_id: OAUTH_CONFIG.CLIENT_ID,
    response_type: 'code',
    redirect_uri: OAUTH_CONFIG.REDIRECT_URI,
    scope: OAUTH_CONFIG.SCOPES_SETUP,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state
  })

  return `${OAUTH_CONFIG.AUTHORIZE_URL}?${params.toString()}`
}

/**
 * 生成Setup Token授权URL和相关参数
 * @returns {{authUrl: string, codeVerifier: string, state: string, codeChallenge: string}}
 */
function generateSetupTokenParams() {
  const state = generateState()
  const codeVerifier = generateCodeVerifier()
  const codeChallenge = generateCodeChallenge(codeVerifier)

  const authUrl = generateSetupTokenAuthUrl(codeChallenge, state)

  return {
    authUrl,
    codeVerifier,
    state,
    codeChallenge
  }
}

/**
 * 创建代理agent（使用统一的代理工具）
 * @param {object|null} proxyConfig - 代理配置对象
 * @returns {object|null} 代理agent或null
 */
function createProxyAgent(proxyConfig) {
  return ProxyHelper.createProxyAgent(proxyConfig)
}

/**
 * 使用授权码交换访问令牌
 * @param {string} authorizationCode - 授权码
 * @param {string} codeVerifier - PKCE code verifier
 * @param {string} state - state 参数
 * @param {object|null} proxyConfig - 代理配置（可选）
 * @returns {Promise<object>} Claude格式的token响应
 */
async function exchangeCodeForTokens(authorizationCode, codeVerifier, state, proxyConfig = null) {
  // 清理授权码，移除URL片段
  const cleanedCode = authorizationCode.split('#')[0]?.split('&')[0] ?? authorizationCode

  const params = {
    grant_type: 'authorization_code',
    client_id: OAUTH_CONFIG.CLIENT_ID,
    code: cleanedCode,
    redirect_uri: OAUTH_CONFIG.REDIRECT_URI,
    code_verifier: codeVerifier,
    state
  }

  // 创建代理agent
  const agent = createProxyAgent(proxyConfig)

  try {
    if (agent) {
      logger.info(
        `🌐 Using proxy for OAuth token exchange: ${ProxyHelper.maskProxyInfo(proxyConfig)}`
      )
    } else {
      logger.debug('🌐 No proxy configured for OAuth token exchange')
    }

    logger.debug('🔄 Attempting OAuth token exchange', {
      url: OAUTH_CONFIG.TOKEN_URL,
      codeLength: cleanedCode.length,
      codePrefix: `${cleanedCode.substring(0, 10)}...`,
      hasProxy: !!proxyConfig,
      proxyType: proxyConfig?.type || 'none'
    })

    const axiosConfig = {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'claude-cli/1.0.56 (external, cli)',
        Accept: 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        Referer: 'https://claude.ai/',
        Origin: 'https://claude.ai'
      },
      timeout: 30000
    }

    if (agent) {
      axiosConfig.httpAgent = agent
      axiosConfig.httpsAgent = agent
      axiosConfig.proxy = false
    }

    const response = await axios.post(OAUTH_CONFIG.TOKEN_URL, params, axiosConfig)

    // 记录完整的响应数据到专门的认证详细日志
    logger.authDetail('OAuth token exchange response', response.data)

    // 记录简化版本到主日志
    logger.info('📊 OAuth token exchange response (analyzing for subscription info):', {
      status: response.status,
      hasData: !!response.data,
      dataKeys: response.data ? Object.keys(response.data) : []
    })

    logger.success('✅ OAuth token exchange successful', {
      status: response.status,
      hasAccessToken: !!response.data?.access_token,
      hasRefreshToken: !!response.data?.refresh_token,
      scopes: response.data?.scope,
      // 尝试提取可能的套餐信息字段
      subscription: response.data?.subscription,
      plan: response.data?.plan,
      tier: response.data?.tier,
      accountType: response.data?.account_type,
      features: response.data?.features,
      limits: response.data?.limits
    })

    const { data } = response

    // 返回Claude格式的token数据，包含可能的套餐信息
    const result = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: (Math.floor(Date.now() / 1000) + data.expires_in) * 1000,
      scopes: data.scope ? data.scope.split(' ') : ['user:inference', 'user:profile'],
      isMax: true
    }

    // 如果响应中包含套餐信息，添加到返回结果中
    if (data.subscription || data.plan || data.tier || data.account_type) {
      result.subscriptionInfo = {
        subscription: data.subscription,
        plan: data.plan,
        tier: data.tier,
        accountType: data.account_type,
        features: data.features,
        limits: data.limits
      }
      logger.info('🎯 Found subscription info in OAuth response:', result.subscriptionInfo)
    }

    return result
  } catch (error) {
    // 处理axios错误响应
    if (error.response) {
      // 服务器返回了错误状态码
      const { status } = error.response
      const errorData = error.response.data

      logger.error('❌ OAuth token exchange failed with server error', {
        status,
        statusText: error.response.statusText,
        headers: error.response.headers,
        data: errorData,
        codeLength: cleanedCode.length,
        codePrefix: `${cleanedCode.substring(0, 10)}...`
      })

      // 尝试从错误响应中提取有用信息
      let errorMessage = `HTTP ${status}`

      if (errorData) {
        if (typeof errorData === 'string') {
          errorMessage += `: ${errorData}`
        } else if (errorData.error) {
          errorMessage += `: ${errorData.error}`
          if (errorData.error_description) {
            errorMessage += ` - ${errorData.error_description}`
          }
        } else {
          errorMessage += `: ${JSON.stringify(errorData)}`
        }
      }

      throw new Error(`Token exchange failed: ${errorMessage}`)
    } else if (error.request) {
      // 请求被发送但没有收到响应
      logger.error('❌ OAuth token exchange failed with network error', {
        message: error.message,
        code: error.code,
        hasProxy: !!proxyConfig
      })
      throw new Error('Token exchange failed: No response from server (network error or timeout)')
    } else {
      // 其他错误
      logger.error('❌ OAuth token exchange failed with unknown error', {
        message: error.message,
        stack: error.stack
      })
      throw new Error(`Token exchange failed: ${error.message}`)
    }
  }
}

/**
 * 解析回调 URL 或授权码
 * @param {string} input - 完整的回调 URL 或直接的授权码
 * @returns {string} 授权码
 */
function parseCallbackUrl(input) {
  if (!input || typeof input !== 'string') {
    throw new Error('请提供有效的授权码或回调 URL')
  }

  const trimmedInput = input.trim()

  // 情况1: 尝试作为完整URL解析
  if (trimmedInput.startsWith('http://') || trimmedInput.startsWith('https://')) {
    try {
      const urlObj = new URL(trimmedInput)
      const authorizationCode = urlObj.searchParams.get('code')

      if (!authorizationCode) {
        throw new Error('回调 URL 中未找到授权码 (code 参数)')
      }

      return authorizationCode
    } catch (error) {
      if (error.message.includes('回调 URL 中未找到授权码')) {
        throw error
      }
      throw new Error('无效的 URL 格式，请检查回调 URL 是否正确')
    }
  }

  // 情况2: 直接的授权码（可能包含URL fragments）
  // 参考claude-code-login.js的处理方式：移除URL fragments和参数
  const cleanedCode = trimmedInput.split('#')[0]?.split('&')[0] ?? trimmedInput

  // 验证授权码格式（Claude的授权码通常是base64url格式）
  if (!cleanedCode || cleanedCode.length < 10) {
    throw new Error('授权码格式无效，请确保复制了完整的 Authorization Code')
  }

  // 基本格式验证：授权码应该只包含字母、数字、下划线、连字符
  const validCodePattern = /^[A-Za-z0-9_-]+$/
  if (!validCodePattern.test(cleanedCode)) {
    throw new Error('授权码包含无效字符，请检查是否复制了正确的 Authorization Code')
  }

  return cleanedCode
}

/**
 * 使用授权码交换Setup Token
 * @param {string} authorizationCode - 授权码
 * @param {string} codeVerifier - PKCE code verifier
 * @param {string} state - state 参数
 * @param {object|null} proxyConfig - 代理配置（可选）
 * @returns {Promise<object>} Claude格式的token响应
 */
async function exchangeSetupTokenCode(authorizationCode, codeVerifier, state, proxyConfig = null) {
  // 清理授权码，移除URL片段
  const cleanedCode = authorizationCode.split('#')[0]?.split('&')[0] ?? authorizationCode

  const params = {
    grant_type: 'authorization_code',
    client_id: OAUTH_CONFIG.CLIENT_ID,
    code: cleanedCode,
    redirect_uri: OAUTH_CONFIG.REDIRECT_URI,
    code_verifier: codeVerifier,
    state,
    expires_in: 31536000 // Setup Token 可以设置较长的过期时间
  }

  // 创建代理agent
  const agent = createProxyAgent(proxyConfig)

  try {
    if (agent) {
      logger.info(
        `🌐 Using proxy for Setup Token exchange: ${ProxyHelper.maskProxyInfo(proxyConfig)}`
      )
    } else {
      logger.debug('🌐 No proxy configured for Setup Token exchange')
    }

    logger.debug('🔄 Attempting Setup Token exchange', {
      url: OAUTH_CONFIG.TOKEN_URL,
      codeLength: cleanedCode.length,
      codePrefix: `${cleanedCode.substring(0, 10)}...`,
      hasProxy: !!proxyConfig,
      proxyType: proxyConfig?.type || 'none'
    })

    const axiosConfig = {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'claude-cli/1.0.56 (external, cli)',
        Accept: 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        Referer: 'https://claude.ai/',
        Origin: 'https://claude.ai'
      },
      timeout: 30000
    }

    if (agent) {
      axiosConfig.httpAgent = agent
      axiosConfig.httpsAgent = agent
      axiosConfig.proxy = false
    }

    const response = await axios.post(OAUTH_CONFIG.TOKEN_URL, params, axiosConfig)

    // 记录完整的响应数据到专门的认证详细日志
    logger.authDetail('Setup Token exchange response', response.data)

    // 记录简化版本到主日志
    logger.info('📊 Setup Token exchange response (analyzing for subscription info):', {
      status: response.status,
      hasData: !!response.data,
      dataKeys: response.data ? Object.keys(response.data) : []
    })

    logger.success('✅ Setup Token exchange successful', {
      status: response.status,
      hasAccessToken: !!response.data?.access_token,
      scopes: response.data?.scope,
      // 尝试提取可能的套餐信息字段
      subscription: response.data?.subscription,
      plan: response.data?.plan,
      tier: response.data?.tier,
      accountType: response.data?.account_type,
      features: response.data?.features,
      limits: response.data?.limits
    })

    const { data } = response

    // 返回Claude格式的token数据，包含可能的套餐信息
    const result = {
      accessToken: data.access_token,
      refreshToken: '',
      expiresAt: (Math.floor(Date.now() / 1000) + data.expires_in) * 1000,
      scopes: data.scope ? data.scope.split(' ') : ['user:inference', 'user:profile'],
      isMax: true
    }

    // 如果响应中包含套餐信息，添加到返回结果中
    if (data.subscription || data.plan || data.tier || data.account_type) {
      result.subscriptionInfo = {
        subscription: data.subscription,
        plan: data.plan,
        tier: data.tier,
        accountType: data.account_type,
        features: data.features,
        limits: data.limits
      }
      logger.info('🎯 Found subscription info in Setup Token response:', result.subscriptionInfo)
    }

    return result
  } catch (error) {
    // 使用与标准OAuth相同的错误处理逻辑
    if (error.response) {
      const { status } = error.response
      const errorData = error.response.data

      logger.error('❌ Setup Token exchange failed with server error', {
        status,
        statusText: error.response.statusText,
        data: errorData,
        codeLength: cleanedCode.length,
        codePrefix: `${cleanedCode.substring(0, 10)}...`
      })

      let errorMessage = `HTTP ${status}`
      if (errorData) {
        if (typeof errorData === 'string') {
          errorMessage += `: ${errorData}`
        } else if (errorData.error) {
          errorMessage += `: ${errorData.error}`
          if (errorData.error_description) {
            errorMessage += ` - ${errorData.error_description}`
          }
        } else {
          errorMessage += `: ${JSON.stringify(errorData)}`
        }
      }

      throw new Error(`Setup Token exchange failed: ${errorMessage}`)
    } else if (error.request) {
      logger.error('❌ Setup Token exchange failed with network error', {
        message: error.message,
        code: error.code,
        hasProxy: !!proxyConfig
      })
      throw new Error(
        'Setup Token exchange failed: No response from server (network error or timeout)'
      )
    } else {
      logger.error('❌ Setup Token exchange failed with unknown error', {
        message: error.message,
        stack: error.stack
      })
      throw new Error(`Setup Token exchange failed: ${error.message}`)
    }
  }
}

/**
 * 格式化为Claude标准格式
 * @param {object} tokenData - token数据
 * @returns {object} claudeAiOauth格式的数据
 */
function formatClaudeCredentials(tokenData) {
  return {
    claudeAiOauth: {
      accessToken: tokenData.accessToken,
      refreshToken: tokenData.refreshToken,
      expiresAt: tokenData.expiresAt,
      scopes: tokenData.scopes,
      isMax: tokenData.isMax
    }
  }
}

module.exports = {
  OAUTH_CONFIG,
  generateOAuthParams,
  generateSetupTokenParams,
  exchangeCodeForTokens,
  exchangeSetupTokenCode,
  parseCallbackUrl,
  formatClaudeCredentials,
  generateState,
  generateCodeVerifier,
  generateCodeChallenge,
  generateAuthUrl,
  generateSetupTokenAuthUrl,
  createProxyAgent
}
