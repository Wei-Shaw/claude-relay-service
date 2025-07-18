/**
 * 交换授权码获取 Token - Vercel Function
 */

const oauthHelper = require('../../lib/utils/oauthHelper');
const kv = require('../../lib/database/kv');
const logger = require('../../lib/utils/logger');
const { authenticateAdmin } = require('../../lib/middleware/auth');

export default async function handler(req, res) {
  // 只允许 POST 请求
  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Method not allowed',
      message: 'Only POST requests are allowed'
    });
  }

  try {
    // 管理员认证
    const authResult = await authenticateAdmin(req);
    if (!authResult.success) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: authResult.error
      });
    }

    const { sessionId, authorizationCode, callbackUrl } = req.body;
    
    // 验证必需参数
    if (!sessionId || (!authorizationCode && !callbackUrl)) {
      return res.status(400).json({
        error: 'Missing required parameters',
        message: 'Session ID and authorization code (or callback URL) are required'
      });
    }
    
    // 从 KV 获取 OAuth 会话信息
    const oauthSession = await kv.getOAuthSession(sessionId);
    if (!oauthSession) {
      return res.status(400).json({
        error: 'Invalid session',
        message: 'Invalid or expired OAuth session'
      });
    }
    
    // 检查会话是否过期
    if (new Date() > new Date(oauthSession.expiresAt)) {
      await kv.deleteOAuthSession(sessionId);
      return res.status(400).json({
        error: 'Session expired',
        message: 'OAuth session has expired, please generate a new authorization URL'
      });
    }
    
    // 统一处理授权码输入
    let finalAuthCode;
    const inputValue = callbackUrl || authorizationCode;
    
    try {
      finalAuthCode = oauthHelper.parseCallbackUrl(inputValue);
    } catch (parseError) {
      return res.status(400).json({
        error: 'Invalid authorization input',
        message: parseError.message
      });
    }
    
    // 交换授权码获取 Token
    try {
      const tokenData = await oauthHelper.exchangeCodeForTokens(
        finalAuthCode,
        oauthSession.codeVerifier,
        oauthSession.state,
        oauthSession.proxy
      );
      
      // 清理会话
      await kv.deleteOAuthSession(sessionId);
      
      logger.success('✅ OAuth token exchange successful', {
        hasAccessToken: !!tokenData.accessToken,
        hasRefreshToken: !!tokenData.refreshToken,
        expiresAt: tokenData.expiresAt,
        scopes: tokenData.scopes
      });
      
      // 返回 Claude 格式的凭据
      const claudeCredentials = oauthHelper.formatClaudeCredentials(tokenData);
      
      res.json({
        success: true,
        data: {
          ...claudeCredentials,
          tokenData: {
            accessToken: tokenData.accessToken,
            refreshToken: tokenData.refreshToken,
            expiresAt: tokenData.expiresAt,
            scopes: tokenData.scopes
          }
        }
      });
      
    } catch (exchangeError) {
      logger.error('❌ OAuth token exchange failed:', exchangeError);
      
      res.status(400).json({
        error: 'Token exchange failed',
        message: exchangeError.message,
        timestamp: new Date().toISOString()
      });
    }
    
  } catch (error) {
    logger.error('❌ OAuth code exchange failed:', error);
    
    res.status(500).json({
      error: 'OAuth exchange failed',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
}