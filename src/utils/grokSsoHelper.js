/**
 * Grok Web SSO cookie → OAuth device flow 转换
 * 对齐 sub2api internal/pkg/xai/sso_device.go
 */

const axios = require('axios')
const { URL, URLSearchParams } = require('url')
const ProxyHelper = require('./proxyHelper')
const xaiHelper = require('./xaiHelper')

const SSO_BUILD_SCOPE =
  'openid profile email offline_access grok-cli:access api:access conversations:read conversations:write'
const SSO_ACCOUNTS_URL = 'https://accounts.x.ai/'
const SSO_DEVICE_URL = 'https://auth.x.ai/oauth2/device/code'
const SSO_VERIFY_URL = 'https://auth.x.ai/oauth2/device/verify'
const SSO_APPROVE_URL = 'https://auth.x.ai/oauth2/device/approve'
const SSO_TOKEN_URL = 'https://auth.x.ai/oauth2/token'
const SSO_CONVERSION_TIMEOUT_MS = 90 * 1000
const SSO_DEFAULT_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const SSO_DEFAULT_TOKEN_TTL_SEC = 6 * 60 * 60

const ErrSSOUnauthorized = Object.assign(new Error('xai sso unauthorized'), {
  code: 'GROK_SSO_UNAUTHORIZED'
})
const ErrSSOAuthorizationDenied = Object.assign(new Error('xai device authorization denied'), {
  code: 'GROK_SSO_AUTHORIZATION_DENIED'
})

const normalizeSSOToken = (value) => {
  let raw = String(value || '').trim()
  if (!raw) {
    return ''
  }
  // 支持完整 Cookie 头 / 多段 sso=...
  if (raw.includes('sso=')) {
    const match = raw.match(/(?:^|;\s*)sso=([^;]+)/i)
    if (match) {
      raw = match[1].trim()
    }
  }
  if (raw.toLowerCase().startsWith('sso=')) {
    raw = raw.slice(4).trim()
  }
  // 去掉引号
  if (
    (raw.startsWith('"') && raw.endsWith('"')) ||
    (raw.startsWith("'") && raw.endsWith("'"))
  ) {
    raw = raw.slice(1, -1).trim()
  }
  return raw
}

const isTrustedXaiAuthUrl = (raw) => {
  try {
    const parsed = new URL(String(raw || '').trim())
    if (parsed.protocol !== 'https:') {
      return false
    }
    const host = parsed.hostname.toLowerCase()
    return host === 'auth.x.ai' || host === 'accounts.x.ai' || host.endsWith('.x.ai')
  } catch {
    return false
  }
}

const sleep = (ms, signal) =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('aborted'))
      return
    }
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener?.(
      'abort',
      () => {
        clearTimeout(timer)
        reject(new Error('aborted'))
      },
      { once: true }
    )
  })

const buildAxiosConfig = (proxy) => {
  const config = {
    timeout: SSO_CONVERSION_TIMEOUT_MS,
    maxRedirects: 0,
    validateStatus: () => true,
    responseType: 'arraybuffer',
    headers: {}
  }
  if (proxy) {
    const agent = ProxyHelper.createProxyAgent(proxy)
    if (agent) {
      config.httpAgent = agent
      config.httpsAgent = agent
      config.proxy = false
    }
  }
  return config
}

class SsoDeviceFlow {
  constructor({ proxy = null, userAgent = SSO_DEFAULT_UA, ssoToken }) {
    this.userAgent = userAgent
    this.cookies = {
      sso: ssoToken,
      'sso-rw': ssoToken
    }
    this.axiosConfig = buildAxiosConfig(proxy)
  }

  cookieHeader() {
    return Object.entries(this.cookies)
      .map(([key, value]) => `${key}=${value}`)
      .join('; ')
  }

  captureCookies(response) {
    const setCookies = response.headers?.['set-cookie']
    if (!setCookies) {
      return
    }
    const list = Array.isArray(setCookies) ? setCookies : [setCookies]
    for (const item of list) {
      const part = String(item).split(';')[0]
      const eq = part.indexOf('=')
      if (eq <= 0) {
        continue
      }
      const name = part.slice(0, eq).trim()
      const value = part.slice(eq + 1).trim()
      if (name) {
        this.cookies[name] = value
      }
    }
  }

  async do(method, endpoint, form = null) {
    if (!isTrustedXaiAuthUrl(endpoint)) {
      throw new Error('xAI OAuth URL is not trusted')
    }
    let currentUrl = endpoint
    let currentMethod = method
    let currentForm = form

    for (let redirects = 0; redirects <= 8; redirects++) {
      const headers = {
        'User-Agent': this.userAgent,
        Cookie: this.cookieHeader(),
        Accept: 'text/html,application/json,*/*'
      }
      let data
      if (currentForm) {
        headers['Content-Type'] = 'application/x-www-form-urlencoded'
        data =
          currentForm instanceof URLSearchParams
            ? currentForm.toString()
            : new URLSearchParams(currentForm).toString()
      }

      const response = await axios({
        ...this.axiosConfig,
        method: currentMethod,
        url: currentUrl,
        headers,
        data
      })
      this.captureCookies(response)

      const status = response.status
      const bodyBuf = Buffer.from(response.data || [])
      if (bodyBuf.length > 2 * 1024 * 1024) {
        throw new Error('xAI OAuth response exceeds 2 MiB')
      }
      const body = bodyBuf

      // 3xx 跟随 Location（不自动跳转，便于读 cookie）
      if (status >= 300 && status < 400) {
        const location = response.headers.location
        if (!location) {
          throw new Error('xAI OAuth redirect missing Location')
        }
        const nextUrl = new URL(location, currentUrl).toString()
        if (!isTrustedXaiAuthUrl(nextUrl)) {
          throw new Error('xAI OAuth redirected to untrusted host')
        }
        currentUrl = nextUrl
        currentMethod = 'GET'
        currentForm = null
        continue
      }

      return { status, finalUrl: currentUrl, body }
    }
    throw new Error('xAI OAuth redirected too many times')
  }

  async convert() {
    // 1) 校验 SSO
    const accounts = await this.do('GET', SSO_ACCOUNTS_URL, null)
    if (
      accounts.status === 401 ||
      accounts.finalUrl.includes('sign-in') ||
      accounts.finalUrl.includes('sign-up')
    ) {
      throw ErrSSOUnauthorized
    }
    if (accounts.status < 200 || accounts.status >= 400) {
      const err = new Error(`validate Grok Web SSO: HTTP ${accounts.status}`)
      err.status = accounts.status
      throw err
    }

    // 2) 启动 device flow
    const deviceRes = await this.do('POST', SSO_DEVICE_URL, {
      client_id: xaiHelper.effectiveClientId(),
      scope: SSO_BUILD_SCOPE
    })
    if (deviceRes.status < 200 || deviceRes.status >= 300) {
      throw new Error(`start xAI device flow: HTTP ${deviceRes.status}`)
    }
    let device
    try {
      device = JSON.parse(deviceRes.body.toString('utf8'))
    } catch (error) {
      throw new Error(`parse xAI device flow response: ${error.message}`)
    }
    if (!device.device_code || !device.user_code || !isTrustedXaiAuthUrl(device.verification_uri_complete)) {
      throw new Error('xAI device flow response is incomplete')
    }
    const intervalSec = device.interval > 0 ? device.interval : 5
    const expiresInSec = device.expires_in > 0 ? device.expires_in : 1800

    // 3) 打开验证页
    const verifyPage = await this.do('GET', device.verification_uri_complete, null)
    if (verifyPage.status < 200 || verifyPage.status >= 400) {
      throw new Error(`open xAI device verification page: HTTP ${verifyPage.status}`)
    }

    // 4) verify user_code
    const verify = await this.do('POST', SSO_VERIFY_URL, { user_code: device.user_code })
    if (verify.status < 200 || verify.status >= 400) {
      throw new Error(`verify xAI device code: HTTP ${verify.status}`)
    }
    if (!verify.finalUrl.includes('consent')) {
      throw new Error('xAI device verification did not reach consent page')
    }

    // 5) approve
    const approve = await this.do('POST', SSO_APPROVE_URL, {
      user_code: device.user_code,
      action: 'allow',
      principal_type: 'User',
      principal_id: ''
    })
    if (approve.status < 200 || approve.status >= 400) {
      throw new Error(`approve xAI device code: HTTP ${approve.status}`)
    }
    if (!approve.finalUrl.includes('done')) {
      throw new Error('xAI device approval did not reach done page')
    }

    // 6) poll token
    return this.pollToken(device.device_code, intervalSec * 1000, Math.min(expiresInSec, 75) * 1000)
  }

  async pollToken(deviceCode, intervalMs, maxWaitMs) {
    let interval = Math.max(intervalMs, 1000)
    const deadline = Date.now() + maxWaitMs
    while (Date.now() < deadline) {
      await sleep(interval)
      const tokenRes = await this.do('POST', SSO_TOKEN_URL, {
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        client_id: xaiHelper.effectiveClientId(),
        device_code: deviceCode
      })
      let payload
      try {
        payload = JSON.parse(tokenRes.body.toString('utf8'))
      } catch (error) {
        throw new Error(`parse xAI token response: ${error.message}`)
      }
      if (tokenRes.status >= 200 && tokenRes.status < 300 && payload.access_token) {
        return {
          access_token: payload.access_token,
          refresh_token: payload.refresh_token || '',
          id_token: payload.id_token || '',
          token_type: payload.token_type || 'Bearer',
          expires_in: payload.expires_in > 0 ? payload.expires_in : SSO_DEFAULT_TOKEN_TTL_SEC,
          scope: payload.scope || ''
        }
      }
      switch (payload.error) {
        case 'authorization_pending':
          continue
        case 'slow_down':
          interval += 5000
          continue
        case 'access_denied':
        case 'expired_token':
          throw ErrSSOAuthorizationDenied
        default:
          throw new Error(
            `xAI token polling failed: ${payload.error_description || payload.error || tokenRes.status}`
          )
      }
    }
    throw new Error('xAI device flow token polling timed out')
  }
}

/**
 * 将 Grok Web SSO cookie 转为 Build OAuth token
 * @param {string} ssoToken
 * @param {{ proxy?: object }} [options]
 */
const convertSSOToBuild = async (ssoToken, options = {}) => {
  const token = normalizeSSOToken(ssoToken)
  if (!token) {
    throw ErrSSOUnauthorized
  }
  const flow = new SsoDeviceFlow({
    proxy: options.proxy || null,
    ssoToken: token
  })
  return flow.convert()
}

module.exports = {
  convertSSOToBuild,
  normalizeSSOToken,
  ErrSSOUnauthorized,
  ErrSSOAuthorizationDenied,
  SSO_CONVERSION_TIMEOUT_MS
}
