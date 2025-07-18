/**
 * Claude 账户管理端点 - Vercel Function
 */

const claudeAccountService = require('../../lib/services/claudeAccountService');
const { authenticateAdmin } = require('../../lib/middleware/auth');
const logger = require('../../lib/utils/logger');

export default async function handler(req, res) {
  try {
    // 管理员认证
    const authResult = await authenticateAdmin(req);
    if (!authResult.success) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: authResult.error
      });
    }

    switch (req.method) {
      case 'GET':
        return await handleGetClaudeAccounts(req, res);
      case 'POST':
        return await handleCreateClaudeAccount(req, res);
      case 'PUT':
        return await handleUpdateClaudeAccount(req, res);
      case 'DELETE':
        return await handleDeleteClaudeAccount(req, res);
      default:
        return res.status(405).json({
          error: 'Method not allowed',
          message: `Method ${req.method} not allowed`
        });
    }
  } catch (error) {
    logger.error('❌ Claude accounts endpoint error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
}

// 获取所有Claude账户
async function handleGetClaudeAccounts(req, res) {
  try {
    const accounts = await claudeAccountService.getAllAccounts();
    res.json({ success: true, data: accounts });
  } catch (error) {
    logger.error('❌ Failed to get Claude accounts:', error);
    res.status(500).json({ error: 'Failed to get Claude accounts', message: error.message });
  }
}

// 创建新的Claude账户
async function handleCreateClaudeAccount(req, res) {
  try {
    const {
      name,
      description,
      email,
      password,
      refreshToken,
      claudeAiOauth,
      proxy,
      isActive,
      accountType
    } = req.body;

    // 输入验证
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'Name is required and must be a non-empty string' });
    }

    if (name.length > 100) {
      return res.status(400).json({ error: 'Name must be less than 100 characters' });
    }

    if (description && (typeof description !== 'string' || description.length > 500)) {
      return res.status(400).json({ error: 'Description must be a string with less than 500 characters' });
    }

    // 验证账户类型
    if (accountType && !['shared', 'dedicated'].includes(accountType)) {
      return res.status(400).json({ error: 'Account type must be either "shared" or "dedicated"' });
    }

    // 验证代理配置
    if (proxy && proxy.type && !['socks5', 'http', 'https'].includes(proxy.type)) {
      return res.status(400).json({ error: 'Proxy type must be socks5, http, or https' });
    }

    const newAccount = await claudeAccountService.createAccount({
      name,
      description,
      email,
      password,
      refreshToken,
      claudeAiOauth,
      proxy,
      isActive: isActive !== false,
      accountType: accountType || 'shared'
    });

    logger.success(`🏢 Admin created new Claude account: ${name}`);
    res.json({ success: true, data: newAccount });
  } catch (error) {
    logger.error('❌ Failed to create Claude account:', error);
    res.status(500).json({ error: 'Failed to create Claude account', message: error.message });
  }
}

// 更新Claude账户
async function handleUpdateClaudeAccount(req, res) {
  try {
    const { accountId } = req.query;
    const updates = req.body;

    if (!accountId) {
      return res.status(400).json({ error: 'Account ID is required' });
    }

    // 输入验证
    if (updates.name && (typeof updates.name !== 'string' || updates.name.trim().length === 0)) {
      return res.status(400).json({ error: 'Name must be a non-empty string' });
    }

    if (updates.accountType && !['shared', 'dedicated'].includes(updates.accountType)) {
      return res.status(400).json({ error: 'Account type must be either "shared" or "dedicated"' });
    }

    if (updates.proxy && updates.proxy.type && !['socks5', 'http', 'https'].includes(updates.proxy.type)) {
      return res.status(400).json({ error: 'Proxy type must be socks5, http, or https' });
    }

    await claudeAccountService.updateAccount(accountId, updates);
    
    logger.success(`📝 Admin updated Claude account: ${accountId}`);
    res.json({ success: true, message: 'Claude account updated successfully' });
  } catch (error) {
    logger.error('❌ Failed to update Claude account:', error);
    res.status(500).json({ error: 'Failed to update Claude account', message: error.message });
  }
}

// 删除Claude账户
async function handleDeleteClaudeAccount(req, res) {
  try {
    const { accountId } = req.query;
    
    if (!accountId) {
      return res.status(400).json({ error: 'Account ID is required' });
    }
    
    await claudeAccountService.deleteAccount(accountId);
    
    logger.success(`🗑️ Admin deleted Claude account: ${accountId}`);
    res.json({ success: true, message: 'Claude account deleted successfully' });
  } catch (error) {
    logger.error('❌ Failed to delete Claude account:', error);
    res.status(500).json({ error: 'Failed to delete Claude account', message: error.message });
  }
}