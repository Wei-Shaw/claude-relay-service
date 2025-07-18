/**
 * 生成 OAuth 授权 URL - Vercel Function
 */

const crypto = require('crypto');
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

    const { proxy } = req.body || {};
    
    // 生成 OAuth 参数
    const oauthParams = oauthHelper.generateOAuthParams();
    
    // 生成会话 ID
    const sessionId = crypto.randomUUID();
    
    // 将参数存储到 Vercel KV
    await kv.setOAuthSession(sessionId, {
      codeVerifier: oauthParams.codeVerifier,
      state: oauthParams.state,
      codeChallenge: oauthParams.codeChallenge,
      proxy: proxy || null,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString() // 10分钟过期
    });
    
    logger.success('🔗 Generated OAuth authorization URL with proxy support');
    
    res.json({ 
      success: true, 
      data: {
        authUrl: oauthParams.authUrl,
        sessionId: sessionId,
        instructions: [
          '1. 复制上面的链接到浏览器中打开',
          '2. 登录您的 Anthropic 账户',
          '3. 同意应用权限',
          '4. 复制浏览器地址栏中的完整 URL',
          '5. 在添加账户表单中粘贴完整的回调 URL 和授权码'
        ]
      }
    });
    
  } catch (error) {
    logger.error('❌ Failed to generate OAuth URL:', error);
    
    res.status(500).json({
      error: 'Failed to generate OAuth URL',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
}