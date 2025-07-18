/**
 * OAuth助手工具 - Vercel 适配版本
 */

const crypto = require('crypto');
const { SocksProxyAgent } = require('socks-proxy-agent');
const { HttpsProxyAgent } = require('https-proxy-agent');
const axios = require('axios');
const logger = require('./logger');
const config = require('../config');

// OAuth 配置常量
const OAUTH_CONFIG = {
  AUTHORIZE_URL: config.oauth.authorizeUrl,
  TOKEN_URL: config.oauth.tokenUrl,
  CLIENT_ID: config.oauth.clientId,
  REDIRECT_URI: config.oauth.redirectUri,
  SCOPES: config.oauth.scopes
};

/**
 * 生成随机的 state 参数
 */
function generateState() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * 生成随机的 code verifier（PKCE）
 */
function generateCodeVerifier() {
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * 生成 code challenge（PKCE）
 */
function generateCodeChallenge(codeVerifier) {
  return crypto.createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');
}

/**
 * 生成授权 URL
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
    state: state
  });

  return `${OAUTH_CONFIG.AUTHORIZE_URL}?${params.toString()}`;
}

/**
 * 生成OAuth授权URL和相关参数
 */
function generateOAuthParams() {
  const state = generateState();
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  
  const authUrl = generateAuthUrl(codeChallenge, state);
  
  return {
    authUrl,
    codeVerifier,
    state,
    codeChallenge
  };
}

/**
 * 创建代理agent
 */
function createProxyAgent(proxyConfig) {
  if (!proxyConfig) {
    return null;
  }

  try {
    if (proxyConfig.type === 'socks5') {
      const auth = proxyConfig.username && proxyConfig.password ? `${proxyConfig.username}:${proxyConfig.password}@` : '';
      const socksUrl = `socks5://${auth}${proxyConfig.host}:${proxyConfig.port}`;
      return new SocksProxyAgent(socksUrl);
    } else if (proxyConfig.type === 'http' || proxyConfig.type === 'https') {
      const auth = proxyConfig.username && proxyConfig.password ? `${proxyConfig.username}:${proxyConfig.password}@` : '';
      const httpUrl = `${proxyConfig.type}://${auth}${proxyConfig.host}:${proxyConfig.port}`;
      return new HttpsProxyAgent(httpUrl);
    }
  } catch (error) {
    logger.warn('⚠️ Invalid proxy configuration:', error);
  }

  return null;
}

/**
 * 使用授权码交换访问令牌
 */
async function exchangeCodeForTokens(authorizationCode, codeVerifier, state, proxyConfig = null) {
  // 清理授权码
  const cleanedCode = authorizationCode.split('#')[0]?.split('&')[0] ?? authorizationCode;
  
  const params = {
    grant_type: 'authorization_code',
    client_id: OAUTH_CONFIG.CLIENT_ID,
    code: cleanedCode,
    redirect_uri: OAUTH_CONFIG.REDIRECT_URI,
    code_verifier: codeVerifier,
    state: state
  };

  // 创建代理agent
  const agent = createProxyAgent(proxyConfig);

  try {
    logger.debug('🔄 Attempting OAuth token exchange', {
      url: OAUTH_CONFIG.TOKEN_URL,
      codeLength: cleanedCode.length,
      hasProxy: !!proxyConfig
    });

    const response = await axios.post(OAUTH_CONFIG.TOKEN_URL, params, {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://claude.ai/',
        'Origin': 'https://claude.ai'
      },
      httpsAgent: agent,
      timeout: 30000
    });

    if (response.status === 200) {
      const { access_token, refresh_token, expires_in } = response.data;
      
      logger.success('✅ OAuth token exchange successful', {
        hasAccessToken: !!access_token,
        hasRefreshToken: !!refresh_token,
        scopes: response.data?.scope
      });

      const data = response.data;
      
      // 返回Claude格式的token数据
      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: (Math.floor(Date.now() / 1000) + data.expires_in) * 1000,
        scopes: data.scope ? data.scope.split(' ') : ['user:inference', 'user:profile'],
        isMax: true
      };
    } else {
      throw new Error(`Token exchange failed with status: ${response.status}`);
    }
  } catch (error) {
    if (error.response) {
      const status = error.response.status;
      const errorData = error.response.data;
      
      logger.error('❌ OAuth token exchange failed with server error', {
        status: status,
        data: errorData
      });
      
      let errorMessage = `HTTP ${status}`;
      
      if (errorData) {
        if (typeof errorData === 'string') {
          errorMessage += `: ${errorData}`;
        } else if (errorData.error) {
          errorMessage += `: ${errorData.error}`;
          if (errorData.error_description) {
            errorMessage += ` - ${errorData.error_description}`;
          }
        }
      }
      
      throw new Error(`Token exchange failed: ${errorMessage}`);
    } else if (error.request) {
      logger.error('❌ OAuth token exchange failed with network error', {
        message: error.message,
        code: error.code
      });
      throw new Error('Token exchange failed: No response from server (network error or timeout)');
    } else {
      logger.error('❌ OAuth token exchange failed with unknown error', {
        message: error.message
      });
      throw new Error(`Token exchange failed: ${error.message}`);
    }
  }
}

/**
 * 解析回调 URL 或授权码
 */
function parseCallbackUrl(input) {
  if (!input || typeof input !== 'string') {
    throw new Error('请提供有效的授权码或回调 URL');
  }

  const trimmedInput = input.trim();
  
  // 尝试作为完整URL解析
  if (trimmedInput.startsWith('http://') || trimmedInput.startsWith('https://')) {
    try {
      const urlObj = new URL(trimmedInput);
      const authorizationCode = urlObj.searchParams.get('code');

      if (!authorizationCode) {
        throw new Error('回调 URL 中未找到授权码 (code 参数)');
      }

      return authorizationCode;
    } catch (error) {
      if (error.message.includes('回调 URL 中未找到授权码')) {
        throw error;
      }
      throw new Error('无效的 URL 格式，请检查回调 URL 是否正确');
    }
  }
  
  // 直接的授权码
  const cleanedCode = trimmedInput.split('#')[0]?.split('&')[0] ?? trimmedInput;
  
  // 验证授权码格式
  if (!cleanedCode || cleanedCode.length < 10) {
    throw new Error('授权码格式无效，请确保复制了完整的 Authorization Code');
  }
  
  const validCodePattern = /^[A-Za-z0-9_-]+$/;
  if (!validCodePattern.test(cleanedCode)) {
    throw new Error('授权码包含无效字符，请检查是否复制了正确的 Authorization Code');
  }
  
  return cleanedCode;
}

/**
 * 格式化为Claude标准格式
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
  };
}

module.exports = {
  OAUTH_CONFIG,
  generateOAuthParams,
  exchangeCodeForTokens,
  parseCallbackUrl,
  formatClaudeCredentials,
  generateState,
  generateCodeVerifier,
  generateCodeChallenge,
  generateAuthUrl,
  createProxyAgent
};