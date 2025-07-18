/**
 * API Keys 管理端点 - Vercel Function
 */

const apiKeyService = require('../../lib/services/apiKeyService');
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
        return await handleGetApiKeys(req, res);
      case 'POST':
        return await handleCreateApiKey(req, res);
      case 'PUT':
        return await handleUpdateApiKey(req, res);
      case 'DELETE':
        return await handleDeleteApiKey(req, res);
      default:
        return res.status(405).json({
          error: 'Method not allowed',
          message: `Method ${req.method} not allowed`
        });
    }
  } catch (error) {
    logger.error('❌ API Keys endpoint error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
}

// 获取所有API Keys
async function handleGetApiKeys(req, res) {
  try {
    const apiKeys = await apiKeyService.getAllApiKeys();
    res.json({ success: true, data: apiKeys });
  } catch (error) {
    logger.error('❌ Failed to get API keys:', error);
    res.status(500).json({ error: 'Failed to get API keys', message: error.message });
  }
}

// 创建新的API Key
async function handleCreateApiKey(req, res) {
  try {
    const {
      name,
      description,
      tokenLimit,
      expiresAt,
      claudeAccountId,
      concurrencyLimit
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

    if (tokenLimit && (!Number.isInteger(Number(tokenLimit)) || Number(tokenLimit) < 0)) {
      return res.status(400).json({ error: 'Token limit must be a non-negative integer' });
    }

    if (concurrencyLimit !== undefined && concurrencyLimit !== null && concurrencyLimit !== '' && 
        (!Number.isInteger(Number(concurrencyLimit)) || Number(concurrencyLimit) < 0)) {
      return res.status(400).json({ error: 'Concurrency limit must be a non-negative integer' });
    }

    const newKey = await apiKeyService.generateApiKey({
      name,
      description,
      tokenLimit,
      expiresAt,
      claudeAccountId,
      concurrencyLimit
    });

    logger.success(`🔑 Admin created new API key: ${name}`);
    res.json({ success: true, data: newKey });
  } catch (error) {
    logger.error('❌ Failed to create API key:', error);
    res.status(500).json({ error: 'Failed to create API key', message: error.message });
  }
}

// 更新API Key
async function handleUpdateApiKey(req, res) {
  try {
    const { keyId } = req.query;
    const { tokenLimit, concurrencyLimit, claudeAccountId } = req.body;

    if (!keyId) {
      return res.status(400).json({ error: 'Key ID is required' });
    }

    // 只允许更新特定字段
    const updates = {};
    
    if (tokenLimit !== undefined && tokenLimit !== null && tokenLimit !== '') {
      if (!Number.isInteger(Number(tokenLimit)) || Number(tokenLimit) < 0) {
        return res.status(400).json({ error: 'Token limit must be a non-negative integer' });
      }
      updates.tokenLimit = Number(tokenLimit);
    }

    if (concurrencyLimit !== undefined && concurrencyLimit !== null && concurrencyLimit !== '') {
      if (!Number.isInteger(Number(concurrencyLimit)) || Number(concurrencyLimit) < 0) {
        return res.status(400).json({ error: 'Concurrency limit must be a non-negative integer' });
      }
      updates.concurrencyLimit = Number(concurrencyLimit);
    }

    if (claudeAccountId !== undefined) {
      updates.claudeAccountId = claudeAccountId || '';
    }

    await apiKeyService.updateApiKey(keyId, updates);
    
    logger.success(`📝 Admin updated API key: ${keyId}`);
    res.json({ success: true, message: 'API key updated successfully' });
  } catch (error) {
    logger.error('❌ Failed to update API key:', error);
    res.status(500).json({ error: 'Failed to update API key', message: error.message });
  }
}

// 删除API Key
async function handleDeleteApiKey(req, res) {
  try {
    const { keyId } = req.query;
    
    if (!keyId) {
      return res.status(400).json({ error: 'Key ID is required' });
    }
    
    await apiKeyService.deleteApiKey(keyId);
    
    logger.success(`🗑️ Admin deleted API key: ${keyId}`);
    res.json({ success: true, message: 'API key deleted successfully' });
  } catch (error) {
    logger.error('❌ Failed to delete API key:', error);
    res.status(500).json({ error: 'Failed to delete API key', message: error.message });
  }
}