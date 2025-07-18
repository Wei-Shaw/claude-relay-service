/**
 * 管理员登录端点 - Vercel Function
 */

const { adminLogin } = require('../../lib/middleware/auth');
const logger = require('../../lib/utils/logger');

export default async function handler(req, res) {
  // 只允许 POST 请求
  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Method not allowed',
      message: 'Only POST requests are allowed'
    });
  }

  try {
    const { username, password } = req.body;

    // 输入验证
    if (!username || !password) {
      return res.status(400).json({
        error: 'Missing credentials',
        message: 'Username and password are required'
      });
    }

    if (typeof username !== 'string' || typeof password !== 'string') {
      return res.status(400).json({
        error: 'Invalid credentials',
        message: 'Username and password must be strings'
      });
    }

    // 尝试登录
    const result = await adminLogin(username, password);

    if (!result.success) {
      return res.status(401).json({
        error: 'Login failed',
        message: result.error
      });
    }

    // 登录成功
    res.json({
      success: true,
      data: {
        token: result.token,
        sessionId: result.sessionId,
        expiresAt: result.expiresAt,
        username: result.username
      }
    });

  } catch (error) {
    logger.error('❌ Admin login endpoint error:', error);
    
    res.status(500).json({
      error: 'Internal server error',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
}