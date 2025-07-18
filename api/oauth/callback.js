/**
 * OAuth 回调端点 - Vercel Function
 * 处理 OAuth 回调重定向
 */

const logger = require('../../lib/utils/logger');

export default async function handler(req, res) {
  // 只允许 GET 请求
  if (req.method !== 'GET') {
    return res.status(405).json({
      error: 'Method not allowed',
      message: 'Only GET requests are allowed'
    });
  }

  try {
    const { code, state, error, error_description } = req.query;
    
    if (error) {
      logger.error('❌ OAuth callback error:', { error, error_description });
      
      // 重定向到错误页面
      const errorUrl = `/web/oauth/error?error=${encodeURIComponent(error)}&description=${encodeURIComponent(error_description || 'Unknown error')}`;
      return res.redirect(errorUrl);
    }
    
    if (!code || !state) {
      logger.error('❌ OAuth callback missing parameters:', { code: !!code, state: !!state });
      
      const errorUrl = `/web/oauth/error?error=invalid_request&description=${encodeURIComponent('Missing authorization code or state parameter')}`;
      return res.redirect(errorUrl);
    }
    
    logger.info('✅ OAuth callback received', {
      hasCode: !!code,
      hasState: !!state,
      codeLength: code.length,
      state: state.substring(0, 8) + '...'
    });
    
    // 重定向到成功页面，传递参数
    const successUrl = `/web/oauth/success?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`;
    res.redirect(successUrl);
    
  } catch (error) {
    logger.error('❌ OAuth callback processing failed:', error);
    
    const errorUrl = `/web/oauth/error?error=server_error&description=${encodeURIComponent('Internal server error')}`;
    res.redirect(errorUrl);
  }
}