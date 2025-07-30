const claudeAccountService = require('./claudeAccountService');
const claudeConsoleAccountService = require('./claudeConsoleAccountService');
const redis = require('../models/redis');
const logger = require('../utils/logger');

class UnifiedClaudeScheduler {
  constructor() {
    this.SESSION_MAPPING_PREFIX = 'unified_claude_session_mapping:';
  }

  // 🎯 统一调度Claude账号（官方和Console）
  async selectAccountForApiKey(apiKeyData, sessionHash = null, requestedModel = null) {
    try {
      // 如果API Key绑定了专属账户，优先使用
      // 1. 检查Claude OAuth账户绑定
      if (apiKeyData.claudeAccountId) {
        const boundAccount = await redis.getClaudeAccount(apiKeyData.claudeAccountId);
        if (boundAccount && boundAccount.isActive === 'true' && boundAccount.status !== 'error') {
          logger.info(`🎯 Using bound dedicated Claude OAuth account: ${boundAccount.name} (${apiKeyData.claudeAccountId}) for API key ${apiKeyData.name}`);
          return {
            accountId: apiKeyData.claudeAccountId,
            accountType: 'claude-official'
          };
        } else {
          logger.warn(`⚠️ Bound Claude OAuth account ${apiKeyData.claudeAccountId} is not available, falling back to pool`);
        }
      }
      
      // 2. 检查Claude Console账户绑定
      if (apiKeyData.claudeConsoleAccountId) {
        const boundConsoleAccount = await claudeConsoleAccountService.getAccount(apiKeyData.claudeConsoleAccountId);
        if (boundConsoleAccount && boundConsoleAccount.isActive === true && boundConsoleAccount.status === 'active') {
          logger.info(`🎯 Using bound dedicated Claude Console account: ${boundConsoleAccount.name} (${apiKeyData.claudeConsoleAccountId}) for API key ${apiKeyData.name}`);
          return {
            accountId: apiKeyData.claudeConsoleAccountId,
            accountType: 'claude-console'
          };
        } else {
          logger.warn(`⚠️ Bound Claude Console account ${apiKeyData.claudeConsoleAccountId} is not available, falling back to pool`);
        }
      }

      // 如果有会话哈希，检查是否有已映射的账户
      if (sessionHash) {
        const mappedAccount = await this._getSessionMapping(sessionHash);
        if (mappedAccount) {
          // 验证映射的账户是否仍然可用
          const isAvailable = await this._isAccountAvailable(mappedAccount.accountId, mappedAccount.accountType);
          if (isAvailable) {
            logger.info(`🎯 Using sticky session account: ${mappedAccount.accountId} (${mappedAccount.accountType}) for session ${sessionHash}`);
            return mappedAccount;
          } else {
            logger.warn(`⚠️ Mapped account ${mappedAccount.accountId} is no longer available, selecting new account`);
            await this._deleteSessionMapping(sessionHash);
          }
        }
      }

      // 获取所有可用账户（传递请求的模型进行过滤）
      const availableAccounts = await this._getAllAvailableAccounts(apiKeyData, requestedModel);
      
      if (availableAccounts.length === 0) {
        // 提供更详细的错误信息
        if (requestedModel) {
          throw new Error(`No available Claude accounts support the requested model: ${requestedModel}`);
        } else {
          throw new Error('No available Claude accounts (neither official nor console)');
        }
      }

      // 按优先级和最后使用时间排序
      const sortedAccounts = this._sortAccountsByPriority(availableAccounts);

      // 选择第一个账户
      const selectedAccount = sortedAccounts[0];
      
      // 如果有会话哈希，建立新的映射
      if (sessionHash) {
        await this._setSessionMapping(sessionHash, selectedAccount.accountId, selectedAccount.accountType);
        logger.info(`🎯 Created new sticky session mapping: ${selectedAccount.name} (${selectedAccount.accountId}, ${selectedAccount.accountType}) for session ${sessionHash}`);
      }

      logger.info(`🎯 Selected account: ${selectedAccount.name} (${selectedAccount.accountId}, ${selectedAccount.accountType}) with priority ${selectedAccount.priority} for API key ${apiKeyData.name}`);
      
      return {
        accountId: selectedAccount.accountId,
        accountType: selectedAccount.accountType
      };
    } catch (error) {
      logger.error('❌ Failed to select account for API key:', error);
      throw error;
    }
  }

  // 📋 获取所有可用账户（合并官方和Console）
  async _getAllAvailableAccounts(apiKeyData, requestedModel = null) {
    const availableAccounts = [];

    // 如果API Key绑定了专属账户，优先返回
    // 1. 检查Claude OAuth账户绑定
    if (apiKeyData.claudeAccountId) {
      const boundAccount = await redis.getClaudeAccount(apiKeyData.claudeAccountId);
      if (boundAccount && boundAccount.isActive === 'true' && boundAccount.status !== 'error' && boundAccount.status !== 'blocked') {
        const isRateLimited = await claudeAccountService.isAccountRateLimited(boundAccount.id);
        if (!isRateLimited) {
          logger.info(`🎯 Using bound dedicated Claude OAuth account: ${boundAccount.name} (${apiKeyData.claudeAccountId})`);
          return [{
            ...boundAccount,
            accountId: boundAccount.id,
            accountType: 'claude-official',
            priority: parseInt(boundAccount.priority) || 50,
            lastUsedAt: boundAccount.lastUsedAt || '0'
          }];
        }
      } else {
        logger.warn(`⚠️ Bound Claude OAuth account ${apiKeyData.claudeAccountId} is not available`);
      }
    }
    
    // 2. 检查Claude Console账户绑定
    if (apiKeyData.claudeConsoleAccountId) {
      const boundConsoleAccount = await claudeConsoleAccountService.getAccount(apiKeyData.claudeConsoleAccountId);
      if (boundConsoleAccount && boundConsoleAccount.isActive === true && boundConsoleAccount.status === 'active') {
        const isRateLimited = await claudeConsoleAccountService.isAccountRateLimited(boundConsoleAccount.id);
        if (!isRateLimited) {
          logger.info(`🎯 Using bound dedicated Claude Console account: ${boundConsoleAccount.name} (${apiKeyData.claudeConsoleAccountId})`);
          return [{
            ...boundConsoleAccount,
            accountId: boundConsoleAccount.id,
            accountType: 'claude-console',
            priority: parseInt(boundConsoleAccount.priority) || 50,
            lastUsedAt: boundConsoleAccount.lastUsedAt || '0'
          }];
        }
      } else {
        logger.warn(`⚠️ Bound Claude Console account ${apiKeyData.claudeConsoleAccountId} is not available`);
      }
    }

    // 获取官方Claude账户（共享池）
    const claudeAccounts = await redis.getAllClaudeAccounts();
    for (const account of claudeAccounts) {
      if (account.isActive === 'true' && 
          account.status !== 'error' &&
          account.status !== 'blocked' &&
          (account.accountType === 'shared' || !account.accountType) && // 兼容旧数据
          account.schedulable !== 'false') { // 检查是否可调度
        
        // 检查是否被限流
        const isRateLimited = await claudeAccountService.isAccountRateLimited(account.id);
        if (!isRateLimited) {
          availableAccounts.push({
            ...account,
            accountId: account.id,
            accountType: 'claude-official',
            priority: parseInt(account.priority) || 50, // 默认优先级50
            lastUsedAt: account.lastUsedAt || '0'
          });
        }
      }
    }

    // 获取Claude Console账户
    const consoleAccounts = await claudeConsoleAccountService.getAllAccounts();
    logger.info(`📋 Found ${consoleAccounts.length} total Claude Console accounts`);
    
    for (const account of consoleAccounts) {
      logger.info(`🔍 Checking Claude Console account: ${account.name} - isActive: ${account.isActive}, status: ${account.status}, accountType: ${account.accountType}, schedulable: ${account.schedulable}`);
      
      // 注意：getAllAccounts返回的isActive是布尔值
      if (account.isActive === true && 
          account.status === 'active' &&
          account.accountType === 'shared' &&
          account.schedulable !== false) { // 检查是否可调度
        
        // 检查模型支持（如果有请求的模型）
        if (requestedModel && account.supportedModels) {
          // 兼容旧格式（数组）和新格式（对象）
          if (Array.isArray(account.supportedModels)) {
            // 旧格式：数组
            if (account.supportedModels.length > 0 && !account.supportedModels.includes(requestedModel)) {
              logger.info(`🚫 Claude Console account ${account.name} does not support model ${requestedModel}`);
              continue;
            }
          } else if (typeof account.supportedModels === 'object') {
            // 新格式：映射表
            if (Object.keys(account.supportedModels).length > 0 && !claudeConsoleAccountService.isModelSupported(account.supportedModels, requestedModel)) {
              logger.info(`🚫 Claude Console account ${account.name} does not support model ${requestedModel}`);
              continue;
            }
          }
        }
        
        // 检查是否被限流
        const isRateLimited = await claudeConsoleAccountService.isAccountRateLimited(account.id);
        if (!isRateLimited) {
          availableAccounts.push({
            ...account,
            accountId: account.id,
            accountType: 'claude-console',
            priority: parseInt(account.priority) || 50,
            lastUsedAt: account.lastUsedAt || '0'
          });
          logger.info(`✅ Added Claude Console account to available pool: ${account.name} (priority: ${account.priority})`);
        } else {
          logger.warn(`⚠️ Claude Console account ${account.name} is rate limited`);
        }
      } else {
        logger.info(`❌ Claude Console account ${account.name} not eligible - isActive: ${account.isActive}, status: ${account.status}, accountType: ${account.accountType}, schedulable: ${account.schedulable}`);
      }
    }
    
    logger.info(`📊 Total available accounts: ${availableAccounts.length} (Claude: ${availableAccounts.filter(a => a.accountType === 'claude-official').length}, Console: ${availableAccounts.filter(a => a.accountType === 'claude-console').length})`);
    return availableAccounts;
  }

  // 🔢 按优先级和最后使用时间排序账户
  _sortAccountsByPriority(accounts) {
    return accounts.sort((a, b) => {
      // 首先按优先级排序（数字越小优先级越高）
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      
      // 优先级相同时，按最后使用时间排序（最久未使用的优先）
      const aLastUsed = new Date(a.lastUsedAt || 0).getTime();
      const bLastUsed = new Date(b.lastUsedAt || 0).getTime();
      return aLastUsed - bLastUsed;
    });
  }

  // 🔍 检查账户是否可用
  async _isAccountAvailable(accountId, accountType) {
    try {
      if (accountType === 'claude-official') {
        const account = await redis.getClaudeAccount(accountId);
        if (!account || account.isActive !== 'true' || account.status === 'error') {
          return false;
        }
        // 检查是否可调度
        if (account.schedulable === 'false') {
          logger.info(`🚫 Account ${accountId} is not schedulable`);
          return false;
        }
        return !(await claudeAccountService.isAccountRateLimited(accountId));
      } else if (accountType === 'claude-console') {
        const account = await claudeConsoleAccountService.getAccount(accountId);
        if (!account || !account.isActive || account.status !== 'active') {
          return false;
        }
        // 检查是否可调度
        if (account.schedulable === false) {
          logger.info(`🚫 Claude Console account ${accountId} is not schedulable`);
          return false;
        }
        return !(await claudeConsoleAccountService.isAccountRateLimited(accountId));
      }
      return false;
    } catch (error) {
      logger.warn(`⚠️ Failed to check account availability: ${accountId}`, error);
      return false;
    }
  }

  // 🔗 获取会话映射
  async _getSessionMapping(sessionHash) {
    const client = redis.getClientSafe();
    const mappingData = await client.get(`${this.SESSION_MAPPING_PREFIX}${sessionHash}`);
    
    if (mappingData) {
      try {
        return JSON.parse(mappingData);
      } catch (error) {
        logger.warn('⚠️ Failed to parse session mapping:', error);
        return null;
      }
    }
    
    return null;
  }

  // 💾 设置会话映射
  async _setSessionMapping(sessionHash, accountId, accountType) {
    const client = redis.getClientSafe();
    const mappingData = JSON.stringify({ accountId, accountType });
    
    // 设置1小时过期
    await client.setex(
      `${this.SESSION_MAPPING_PREFIX}${sessionHash}`,
      3600,
      mappingData
    );
  }

  // 🗑️ 删除会话映射
  async _deleteSessionMapping(sessionHash) {
    const client = redis.getClientSafe();
    await client.del(`${this.SESSION_MAPPING_PREFIX}${sessionHash}`);
  }

  // 🚫 标记账户为限流状态
  async markAccountRateLimited(accountId, accountType, sessionHash = null) {
    try {
      if (accountType === 'claude-official') {
        await claudeAccountService.markAccountRateLimited(accountId, sessionHash);
      } else if (accountType === 'claude-console') {
        await claudeConsoleAccountService.markAccountRateLimited(accountId);
      }

      // 删除会话映射
      if (sessionHash) {
        await this._deleteSessionMapping(sessionHash);
      }

      return { success: true };
    } catch (error) {
      logger.error(`❌ Failed to mark account as rate limited: ${accountId} (${accountType})`, error);
      throw error;
    }
  }

  // ✅ 移除账户的限流状态
  async removeAccountRateLimit(accountId, accountType) {
    try {
      if (accountType === 'claude-official') {
        await claudeAccountService.removeAccountRateLimit(accountId);
      } else if (accountType === 'claude-console') {
        await claudeConsoleAccountService.removeAccountRateLimit(accountId);
      }

      return { success: true };
    } catch (error) {
      logger.error(`❌ Failed to remove rate limit for account: ${accountId} (${accountType})`, error);
      throw error;
    }
  }

  // 🔍 检查账户是否处于限流状态
  async isAccountRateLimited(accountId, accountType) {
    try {
      if (accountType === 'claude-official') {
        return await claudeAccountService.isAccountRateLimited(accountId);
      } else if (accountType === 'claude-console') {
        return await claudeConsoleAccountService.isAccountRateLimited(accountId);
      }
      return false;
    } catch (error) {
      logger.error(`❌ Failed to check rate limit status: ${accountId} (${accountType})`, error);
      return false;
    }
  }

  // 🚫 标记Claude Console账户为封锁状态（模型不支持）
  async blockConsoleAccount(accountId, reason) {
    try {
      await claudeConsoleAccountService.blockAccount(accountId, reason);
      return { success: true };
    } catch (error) {
      logger.error(`❌ Failed to block console account: ${accountId}`, error);
      throw error;
    }
  }
}

module.exports = new UnifiedClaudeScheduler();