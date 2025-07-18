/**
 * 认证中间件 - Vercel 适配版本
 */

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const apiKeyService = require('../services/apiKeyService');
const kv = require('../database/kv');
const logger = require('../utils/logger');
const config = require('../config');

/**
 * API Key 认证中间件
 */
async function authenticateApiKey(req) {
  try {
    // 从请求头获取 API Key
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // 检查 x-api-key 头
      const apiKey = req.headers['x-api-key'];
      if (!apiKey) {
        return { success: false, error: 'Missing API key' };
      }
      
      // 验证 API Key
      const result = await apiKeyService.validateApiKey(apiKey);
      if (!result.valid) {
        return { success: false, error: result.error };
      }
      
      return { success: true, apiKey: result.keyData };
    }
    
    // 从 Bearer token 中提取 API Key
    const token = authHeader.substring(7);
    const result = await apiKeyService.validateApiKey(token);
    
    if (!result.valid) {
      return { success: false, error: result.error };
    }
    
    return { success: true, apiKey: result.keyData };
    
  } catch (error) {
    logger.error('❌ API key authentication failed:', error);
    return { success: false, error: 'Authentication failed' };
  }
}

/**
 * 管理员认证中间件
 */
async function authenticateAdmin(req) {
  try {
    // 从请求头获取 JWT token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return { success: false, error: 'Missing authorization token' };
    }
    
    const token = authHeader.substring(7);
    
    try {
      // 验证 JWT token
      const decoded = jwt.verify(token, config.security.jwtSecret);
      
      // 检查 token 是否在有效会话中
      const sessionData = await kv.getSession(decoded.sessionId);
      if (!sessionData) {
        return { success: false, error: 'Invalid or expired session' };
      }
      
      // 检查会话是否过期
      if (new Date() > new Date(sessionData.expiresAt)) {
        await kv.deleteSession(decoded.sessionId);
        return { success: false, error: 'Session expired' };
      }
      
      return { success: true, admin: decoded };
      
    } catch (jwtError) {
      if (jwtError.name === 'TokenExpiredError') {
        return { success: false, error: 'Token expired' };
      } else if (jwtError.name === 'JsonWebTokenError') {
        return { success: false, error: 'Invalid token' };
      }
      throw jwtError;
    }
    
  } catch (error) {
    logger.error('❌ Admin authentication failed:', error);
    return { success: false, error: 'Authentication failed' };
  }
}

/**
 * 管理员登录
 */
async function adminLogin(username, password) {
  try {
    // 获取管理员凭据
    const adminCredentials = await kv.getSession('admin_credentials');
    if (!adminCredentials) {
      return { success: false, error: 'Admin credentials not found' };
    }
    
    // 验证用户名
    if (adminCredentials.username !== username) {
      return { success: false, error: 'Invalid username or password' };
    }
    
    // 验证密码
    const isPasswordValid = await bcrypt.compare(password, adminCredentials.passwordHash);
    if (!isPasswordValid) {
      return { success: false, error: 'Invalid username or password' };
    }
    
    // 生成会话
    const sessionId = require('crypto').randomUUID();
    const expiresAt = new Date(Date.now() + config.security.adminSessionTimeout);
    
    const sessionData = {
      sessionId,
      username,
      loginTime: new Date().toISOString(),
      expiresAt: expiresAt.toISOString(),
      lastActivity: new Date().toISOString()
    };
    
    await kv.setSession(sessionId, sessionData, config.security.adminSessionTimeout / 1000);
    
    // 生成 JWT token
    const token = jwt.sign(
      { 
        sessionId, 
        username, 
        type: 'admin' 
      },
      config.security.jwtSecret,
      { 
        expiresIn: config.security.adminSessionTimeout / 1000 
      }
    );
    
    // 更新最后登录时间
    adminCredentials.lastLogin = new Date().toISOString();
    await kv.setSession('admin_credentials', adminCredentials);
    
    logger.success(`🔑 Admin login successful: ${username}`);
    
    return {
      success: true,
      token,
      sessionId,
      expiresAt: expiresAt.toISOString(),
      username
    };
    
  } catch (error) {
    logger.error('❌ Admin login failed:', error);
    return { success: false, error: 'Login failed' };
  }
}

/**
 * 管理员登出
 */
async function adminLogout(sessionId) {
  try {
    await kv.deleteSession(sessionId);
    logger.success(`🔓 Admin logout successful: ${sessionId}`);
    return { success: true };
  } catch (error) {
    logger.error('❌ Admin logout failed:', error);
    return { success: false, error: 'Logout failed' };
  }
}

/**
 * 速率限制中间件
 */
async function rateLimit(req, identifier, windowMs = 60000, maxRequests = 100) {
  try {
    const now = Date.now();
    const windowStart = now - windowMs;
    const key = `rate_limit:${identifier}:${Math.floor(now / windowMs)}`;
    
    const currentCount = await kv.getClient().get(key);
    const requestCount = parseInt(currentCount || 0);
    
    if (requestCount >= maxRequests) {
      return { success: false, error: 'Rate limit exceeded', retryAfter: Math.ceil(windowMs / 1000) };
    }
    
    await kv.getClient().incr(key);
    await kv.getClient().expire(key, Math.ceil(windowMs / 1000));
    
    return { success: true, remaining: maxRequests - requestCount - 1 };
    
  } catch (error) {
    logger.error('❌ Rate limit check failed:', error);
    return { success: true }; // 失败时允许通过
  }
}

/**
 * CORS 中间件
 */
function corsMiddleware(req, res, next) {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-API-Key');
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  
  if (next) next();
}

module.exports = {
  authenticateApiKey,
  authenticateAdmin,
  adminLogin,
  adminLogout,
  rateLimit,
  corsMiddleware
};