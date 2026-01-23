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
  REDIRECT_URI: 'https://platform.claude.com/oauth/code/callback',
  SCOPES: 'org:create_api_key user:profile user:inference user:sessions:claude_code',
  SCOPES_SETUP: 'user:inference' // Setup Token 只需要推理权限
}

// Cookie自动授权配置常量
const COOKIE_OAUTH_CONFIG = {
  CLAUDE_AI_URL: 'https://claude.ai',
  ORGANIZATIONS_URL: 'https://claude.ai/api/organizations',
  AUTHORIZE_URL_TEMPLATE: 'https://claude.ai/v1/oauth/{organization_uuid}/authorize'
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
 * 符合 RFC 7636 标准：32字节随机数 → base64url编码 → 43字符
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

    logger.success('OAuth token exchange successful', {
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

    // 解析组织与账户信息
    const organizationInfo = data.organization || null
    const accountInfo = data.account || null
    const extInfo = extractExtInfo(data)

    // 返回Claude格式的token数据，包含可能的套餐信息
    const result = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: (Math.floor(Date.now() / 1000) + data.expires_in) * 1000,
      scopes: data.scope ? data.scope.split(' ') : ['user:inference', 'user:profile'],
      isMax: true,
      organization: organizationInfo,
      account: accountInfo,
      extInfo
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

    logger.success('Setup Token exchange successful', {
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

    // 解析组织与账户信息
    const organizationInfo = data.organization || null
    const accountInfo = data.account || null
    const extInfo = extractExtInfo(data)

    // 返回Claude格式的token数据，包含可能的套餐信息
    const result = {
      accessToken: data.access_token,
      refreshToken: '',
      expiresAt: (Math.floor(Date.now() / 1000) + data.expires_in) * 1000,
      scopes: data.scope ? data.scope.split(' ') : ['user:inference', 'user:profile'],
      isMax: true,
      organization: organizationInfo,
      account: accountInfo,
      extInfo
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
      isMax: tokenData.isMax,
      organization: tokenData.organization || null,
      account: tokenData.account || null,
      extInfo: tokenData.extInfo || null
    }
  }
}

/**
 * 从令牌响应中提取扩展信息
 * @param {object} data - 令牌响应
 * @returns {object|null} 包含组织与账户UUID的扩展信息
 */
function extractExtInfo(data) {
  if (!data || typeof data !== 'object') {
    return null
  }

  const organization = data.organization || null
  const account = data.account || null

  const ext = {}

  const orgUuid =
    organization?.uuid ||
    organization?.id ||
    organization?.organization_uuid ||
    organization?.organization_id
  const accountUuid = account?.uuid || account?.id || account?.account_uuid || account?.account_id

  if (orgUuid) {
    ext.org_uuid = orgUuid
  }

  if (accountUuid) {
    ext.account_uuid = accountUuid
  }

  return Object.keys(ext).length > 0 ? ext : null
}

// =============================================================================
// Cookie自动授权相关方法 (基于Clove项目实现)
// =============================================================================

/**
 * 构建带Cookie的请求头
 * @param {string} sessionKey - sessionKey值
 * @returns {object} 请求头对象
 */
function buildCookieHeaders(sessionKey) {
  return {
    Accept: 'application/json',
    'Accept-Language': 'en-US,en;q=0.9',
    'Cache-Control': 'no-cache',
    Cookie: `sessionKey=${sessionKey}`,
    Origin: COOKIE_OAUTH_CONFIG.CLAUDE_AI_URL,
    Referer: `${COOKIE_OAUTH_CONFIG.CLAUDE_AI_URL}/new`,
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  }
}

/**
 * 使用Cookie获取组织UUID和能力列表
 * @param {string} sessionKey - sessionKey值
 * @param {object|null} proxyConfig - 代理配置（可选）
 * @returns {Promise<{organizationUuid: string, capabilities: string[]}>}
 */
async function getOrganizationInfo(sessionKey, proxyConfig = null) {
  const headers = buildCookieHeaders(sessionKey)
  const agent = createProxyAgent(proxyConfig)

  try {
    if (agent) {
      logger.info(`🌐 Using proxy for organization info: ${ProxyHelper.maskProxyInfo(proxyConfig)}`)
    }

    logger.debug('🔄 Fetching organization info with Cookie', {
      url: COOKIE_OAUTH_CONFIG.ORGANIZATIONS_URL,
      hasProxy: !!proxyConfig
    })

    const axiosConfig = {
      headers,
      timeout: 30000,
      maxRedirects: 0 // 禁止自动重定向，以便检测Cloudflare拦截(302)
    }

    if (agent) {
      axiosConfig.httpAgent = agent
      axiosConfig.httpsAgent = agent
      axiosConfig.proxy = false
    }

    const response = await axios.get(COOKIE_OAUTH_CONFIG.ORGANIZATIONS_URL, axiosConfig)

    if (!response.data || !Array.isArray(response.data)) {
      throw new Error('获取组织信息失败：响应格式无效')
    }

    // 找到具有chat能力且能力最多的组织
    let bestOrg = null
    let maxCapabilities = []

    for (const org of response.data) {
      const capabilities = org.capabilities || []

      // 必须有chat能力
      if (!capabilities.includes('chat')) {
        continue
      }

      // 选择能力最多的组织
      if (capabilities.length > maxCapabilities.length) {
        bestOrg = org
        maxCapabilities = capabilities
      }
    }

    if (!bestOrg || !bestOrg.uuid) {
      throw new Error('未找到具有chat能力的组织')
    }

    logger.success('Found organization', {
      uuid: bestOrg.uuid,
      capabilities: maxCapabilities
    })

    return {
      organizationUuid: bestOrg.uuid,
      capabilities: maxCapabilities
    }
  } catch (error) {
    if (error.response) {
      const { status } = error.response

      if (status === 403 || status === 401) {
        throw new Error('Cookie授权失败：无效的sessionKey或已过期')
      }

      if (status === 302) {
        throw new Error('请求被Cloudflare拦截，请稍后重试')
      }

      throw new Error(`获取组织信息失败：HTTP ${status}`)
    } else if (error.request) {
      throw new Error('获取组织信息失败：网络错误或超时')
    }

    throw error
  }
}

/**
 * 使用Cookie自动获取授权code
 * @param {string} sessionKey - sessionKey值
 * @param {string} organizationUuid - 组织UUID
 * @param {string} scope - 授权scope
 * @param {object|null} proxyConfig - 代理配置（可选）
 * @returns {Promise<{authorizationCode: string, codeVerifier: string, state: string}>}
 */
async function authorizeWithCookie(sessionKey, organizationUuid, scope, proxyConfig = null) {
  // 生成PKCE参数
  const codeVerifier = generateCodeVerifier()
  const codeChallenge = generateCodeChallenge(codeVerifier)
  const state = generateState()

  // 构建授权URL
  const authorizeUrl = COOKIE_OAUTH_CONFIG.AUTHORIZE_URL_TEMPLATE.replace(
    '{organization_uuid}',
    organizationUuid
  )

  // 构建请求payload
  const payload = {
    response_type: 'code',
    client_id: OAUTH_CONFIG.CLIENT_ID,
    organization_uuid: organizationUuid,
    redirect_uri: OAUTH_CONFIG.REDIRECT_URI,
    scope,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256'
  }

  const headers = {
    ...buildCookieHeaders(sessionKey),
    'Content-Type': 'application/json'
  }

  const agent = createProxyAgent(proxyConfig)

  try {
    if (agent) {
      logger.info(
        `🌐 Using proxy for Cookie authorization: ${ProxyHelper.maskProxyInfo(proxyConfig)}`
      )
    }

    logger.debug('🔄 Requesting authorization with Cookie', {
      url: authorizeUrl,
      scope,
      hasProxy: !!proxyConfig
    })

    const axiosConfig = {
      headers,
      timeout: 30000,
      maxRedirects: 0 // 禁止自动重定向，以便检测Cloudflare拦截(302)
    }

    if (agent) {
      axiosConfig.httpAgent = agent
      axiosConfig.httpsAgent = agent
      axiosConfig.proxy = false
    }

    const response = await axios.post(authorizeUrl, payload, axiosConfig)

    // 从响应中获取redirect_uri
    const redirectUri = response.data?.redirect_uri

    if (!redirectUri) {
      throw new Error('授权响应中未找到redirect_uri')
    }

    logger.debug('📎 Got redirect URI', { redirectUri: `${redirectUri.substring(0, 80)}...` })

    // 解析redirect_uri获取authorization code
    const url = new URL(redirectUri)
    const authorizationCode = url.searchParams.get('code')
    const responseState = url.searchParams.get('state')

    if (!authorizationCode) {
      throw new Error('redirect_uri中未找到授权码')
    }

    // 构建完整的授权码（包含state，如果有的话）
    const fullCode = responseState ? `${authorizationCode}#${responseState}` : authorizationCode

    logger.success('Got authorization code via Cookie', {
      codeLength: authorizationCode.length,
      codePrefix: `${authorizationCode.substring(0, 10)}...`
    })

    return {
      authorizationCode: fullCode,
      codeVerifier,
      state
    }
  } catch (error) {
    if (error.response) {
      const { status } = error.response

      if (status === 403 || status === 401) {
        throw new Error('Cookie授权失败：无效的sessionKey或已过期')
      }

      if (status === 302) {
        throw new Error('请求被Cloudflare拦截，请稍后重试')
      }

      const errorData = error.response.data
      let errorMessage = `HTTP ${status}`

      if (errorData) {
        if (typeof errorData === 'string') {
          errorMessage += `: ${errorData}`
        } else if (errorData.error) {
          errorMessage += `: ${errorData.error}`
        }
      }

      throw new Error(`授权请求失败：${errorMessage}`)
    } else if (error.request) {
      throw new Error('授权请求失败：网络错误或超时')
    }

    throw error
  }
}

/**
 * 完整的Cookie自动授权流程
 * @param {string} sessionKey - sessionKey值
 * @param {object|null} proxyConfig - 代理配置（可选）
 * @param {boolean} isSetupToken - 是否为Setup Token模式
 * @returns {Promise<{claudeAiOauth: object, organizationUuid: string, capabilities: string[]}>}
 */
async function oauthWithCookie(sessionKey, proxyConfig = null, isSetupToken = false) {
  logger.info('🍪 Starting Cookie-based OAuth flow', {
    isSetupToken,
    hasProxy: !!proxyConfig
  })

  // 步骤1：获取组织信息
  logger.debug('Step 1/3: Fetching organization info...')
  const { organizationUuid, capabilities } = await getOrganizationInfo(sessionKey, proxyConfig)

  // 步骤2：确定scope并获取授权code
  const scope = isSetupToken ? OAUTH_CONFIG.SCOPES_SETUP : 'user:profile user:inference'

  logger.debug('Step 2/3: Getting authorization code...', { scope })
  const { authorizationCode, codeVerifier, state } = await authorizeWithCookie(
    sessionKey,
    organizationUuid,
    scope,
    proxyConfig
  )

  // 步骤3：交换token
  logger.debug('Step 3/3: Exchanging token...')
  const tokenData = isSetupToken
    ? await exchangeSetupTokenCode(authorizationCode, codeVerifier, state, proxyConfig)
    : await exchangeCodeForTokens(authorizationCode, codeVerifier, state, proxyConfig)

  logger.success('Cookie-based OAuth flow completed', {
    isSetupToken,
    organizationUuid,
    hasAccessToken: !!tokenData.accessToken,
    hasRefreshToken: !!tokenData.refreshToken
  })

  return {
    claudeAiOauth: tokenData,
    organizationUuid,
    capabilities
  }
}

module.exports = {
  OAUTH_CONFIG,
  COOKIE_OAUTH_CONFIG,
  generateOAuthParams,
  generateSetupTokenParams,
  exchangeCodeForTokens,
  exchangeSetupTokenCode,
  parseCallbackUrl,
  formatClaudeCredentials,
  extractExtInfo,
  generateState,
  generateCodeVerifier,
  generateCodeChallenge,
  generateAuthUrl,
  generateSetupTokenAuthUrl,
  createProxyAgent,
  // Cookie自动授权相关方法
  buildCookieHeaders,
  getOrganizationInfo,
  authorizeWithCookie,
  oauthWithCookie
}
