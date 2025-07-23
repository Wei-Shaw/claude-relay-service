const redisClient = require('../models/redis');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const config = require('../../config/config');
const logger = require('../utils/logger');
const { OAuth2Client } = require('google-auth-library');
const { maskToken } = require('../utils/tokenMask');
const {
  logRefreshStart,
  logRefreshSuccess,
  logRefreshError,
  logTokenUsage,
  logRefreshSkipped
} = require('../utils/tokenRefreshLogger');
const tokenRefreshService = require('./tokenRefreshService');

// Gemini CLI OAuth 配置 - 这些是公开的 Gemini CLI 凭据
const OAUTH_CLIENT_ID = '681255809395-oo8ft2oprdrnp9e3aqf6av3hmdib135j.apps.googleusercontent.com';
const OAUTH_CLIENT_SECRET = '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';
const OAUTH_SCOPES = ['https://www.googleapis.com/auth/cloud-platform'];

// 加密相关常量
const ALGORITHM = 'aes-256-cbc';
const ENCRYPTION_SALT = 'gemini-account-salt';
const IV_LENGTH = 16;

// 生成加密密钥（使用与 claudeAccountService 相同的方法）
function generateEncryptionKey() {
  return crypto.scryptSync(config.security.encryptionKey, ENCRYPTION_SALT, 32);
}

// Gemini 账户键前缀
const GEMINI_ACCOUNT_KEY_PREFIX = 'gemini_account:';
const SHARED_GEMINI_ACCOUNTS_KEY = 'shared_gemini_accounts';
const ACCOUNT_SESSION_MAPPING_PREFIX = 'gemini_session_account_mapping:';

// 加密函数
function encrypt(text) {
  if (!text) return '';
  const key = generateEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

// 解密函数
function decrypt(text) {
  if (!text) return '';
  try {
    const key = generateEncryptionKey();
    const textParts = text.split(':');
    const iv = Buffer.from(textParts.shift(), 'hex');
    const encryptedText = Buffer.from(textParts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  } catch (error) {
    logger.error('Decryption error:', error);
    return '';
  }
}

// 创建 OAuth2 客户端
function createOAuth2Client(redirectUri = null) {
  // 如果没有提供 redirectUri，使用默认值
  const uri = redirectUri || 'http://localhost:45462';
  return new OAuth2Client(
    OAUTH_CLIENT_ID,
    OAUTH_CLIENT_SECRET,
    uri
  );
}

// 生成授权 URL
async function generateAuthUrl(state = null, redirectUri = null) {
  const oAuth2Client = createOAuth2Client(redirectUri);
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: OAUTH_SCOPES,
    prompt: 'select_account',
    state: state || uuidv4()
  });
  
  return {
    authUrl,
    state: state || authUrl.split('state=')[1].split('&')[0]
  };
}

// 轮询检查 OAuth 授权状态
async function pollAuthorizationStatus(sessionId, maxAttempts = 60, interval = 2000) {
  let attempts = 0;
  const client = redisClient.getClientSafe();
  
  while (attempts < maxAttempts) {
    try {
      const sessionData = await client.get(`oauth_session:${sessionId}`);
      if (!sessionData) {
        throw new Error('OAuth session not found');
      }
      
      const session = JSON.parse(sessionData);
      if (session.code) {
        // 授权码已获取，交换 tokens
        const tokens = await exchangeCodeForTokens(session.code);
        
        // 清理 session
        await client.del(`oauth_session:${sessionId}`);
        
        return {
          success: true,
          tokens
        };
      }
      
      if (session.error) {
        // 授权失败
        await client.del(`oauth_session:${sessionId}`);
        return {
          success: false,
          error: session.error
        };
      }
      
      // 等待下一次轮询
      await new Promise(resolve => setTimeout(resolve, interval));
      attempts++;
    } catch (error) {
      logger.error('Error polling authorization status:', error);
      throw error;
    }
  }
  
  // 超时
  await client.del(`oauth_session:${sessionId}`);
  return {
    success: false,
    error: 'Authorization timeout'
  };
}

// 交换授权码获取 tokens
async function exchangeCodeForTokens(code, redirectUri = null) {
  const oAuth2Client = createOAuth2Client(redirectUri);
  
  try {
    const { tokens } = await oAuth2Client.getToken(code);
    
    // 转换为兼容格式
    return {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      scope: tokens.scope || OAUTH_SCOPES.join(' '),
      token_type: tokens.token_type || 'Bearer',
      expiry_date: tokens.expiry_date || Date.now() + (tokens.expires_in * 1000)
    };
  } catch (error) {
    logger.error('Error exchanging code for tokens:', error);
    throw new Error('Failed to exchange authorization code');
  }
}

// 刷新访问令牌
async function refreshAccessToken(refreshToken) {
  const oAuth2Client = createOAuth2Client();
  
  try {
    oAuth2Client.setCredentials({
      refresh_token: refreshToken
    });
    
    const { credentials } = await oAuth2Client.refreshAccessToken();
    
    return {
      access_token: credentials.access_token,
      refresh_token: credentials.refresh_token || refreshToken,
      scope: credentials.scope || OAUTH_SCOPES.join(' '),
      token_type: credentials.token_type || 'Bearer',
      expiry_date: credentials.expiry_date
    };
  } catch (error) {
    logger.error('Error refreshing access token:', error);
    throw new Error('Failed to refresh access token');
  }
}

// 创建 Gemini 账户
async function createAccount(accountData) {
  const id = uuidv4();
  const now = new Date().toISOString();
  
  // 处理凭证数据
  let geminiOauth = null;
  let accessToken = '';
  let refreshToken = '';
  let expiresAt = '';
  
  if (accountData.geminiOauth || accountData.accessToken) {
    // 如果提供了完整的 OAuth 数据
    if (accountData.geminiOauth) {
      geminiOauth = typeof accountData.geminiOauth === 'string' 
        ? accountData.geminiOauth 
        : JSON.stringify(accountData.geminiOauth);
      
      const oauthData = typeof accountData.geminiOauth === 'string' 
        ? JSON.parse(accountData.geminiOauth)
        : accountData.geminiOauth;
      
      accessToken = oauthData.access_token || '';
      refreshToken = oauthData.refresh_token || '';
      expiresAt = oauthData.expiry_date 
        ? new Date(oauthData.expiry_date).toISOString()
        : '';
    } else {
      // 如果只提供了 access token
      accessToken = accountData.accessToken;
      refreshToken = accountData.refreshToken || '';
      
      // 构造完整的 OAuth 数据
      geminiOauth = JSON.stringify({
        access_token: accessToken,
        refresh_token: refreshToken,
        scope: accountData.scope || OAUTH_SCOPES.join(' '),
        token_type: accountData.tokenType || 'Bearer',
        expiry_date: accountData.expiryDate || Date.now() + 3600000 // 默认1小时
      });
      
      expiresAt = new Date(accountData.expiryDate || Date.now() + 3600000).toISOString();
    }
  }
  
  const account = {
    id,
    platform: 'gemini', // 标识为 Gemini 账户
    name: accountData.name || 'Gemini Account',
    description: accountData.description || '',
    accountType: accountData.accountType || 'shared',
    isActive: 'true',
    status: 'active',
    
    // OAuth 相关字段（加密存储）
    geminiOauth: geminiOauth ? encrypt(geminiOauth) : '',
    accessToken: accessToken ? encrypt(accessToken) : '',
    refreshToken: refreshToken ? encrypt(refreshToken) : '',
    expiresAt,
    scopes: accountData.scopes || OAUTH_SCOPES.join(' '),
    
    // 代理设置
    proxy: accountData.proxy ? JSON.stringify(accountData.proxy) : '',
    
    // 项目编号（Google Cloud/Workspace 账号需要）
    projectId: accountData.projectId || '',
    
    // 时间戳
    createdAt: now,
    updatedAt: now,
    lastUsedAt: '',
    lastRefreshAt: ''
  };
  
  // 保存到 Redis
  const client = redisClient.getClientSafe();
  await client.hset(
    `${GEMINI_ACCOUNT_KEY_PREFIX}${id}`,
    account
  );
  
  // 如果是共享账户，添加到共享账户集合
  if (account.accountType === 'shared') {
    await client.sadd(SHARED_GEMINI_ACCOUNTS_KEY, id);
  }
  
  logger.info(`Created Gemini account: ${id}`);
  return account;
}

// 获取账户
async function getAccount(accountId) {
  const client = redisClient.getClientSafe();
  const accountData = await client.hgetall(`${GEMINI_ACCOUNT_KEY_PREFIX}${accountId}`);
  
  if (!accountData || Object.keys(accountData).length === 0) {
    return null;
  }
  
  // 解密敏感字段
  if (accountData.geminiOauth) {
    accountData.geminiOauth = decrypt(accountData.geminiOauth);
  }
  if (accountData.accessToken) {
    accountData.accessToken = decrypt(accountData.accessToken);
  }
  if (accountData.refreshToken) {
    accountData.refreshToken = decrypt(accountData.refreshToken);
  }
  
  return accountData;
}

// 更新账户
async function updateAccount(accountId, updates) {
  const existingAccount = await getAccount(accountId);
  if (!existingAccount) {
    throw new Error('Account not found');
  }
  
  const now = new Date().toISOString();
  updates.updatedAt = now;
  
  // 检查是否新增了 refresh token
  const oldRefreshToken = existingAccount.refreshToken ? decrypt(existingAccount.refreshToken) : '';
  let needUpdateExpiry = false;
  
  // 加密敏感字段
  if (updates.geminiOauth) {
    updates.geminiOauth = encrypt(
      typeof updates.geminiOauth === 'string' 
        ? updates.geminiOauth 
        : JSON.stringify(updates.geminiOauth)
    );
  }
  if (updates.accessToken) {
    updates.accessToken = encrypt(updates.accessToken);
  }
  if (updates.refreshToken) {
    updates.refreshToken = encrypt(updates.refreshToken);
    // 如果之前没有 refresh token，现在有了，标记需要更新过期时间
    if (!oldRefreshToken && updates.refreshToken) {
      needUpdateExpiry = true;
    }
  }
  
  // 更新账户类型时处理共享账户集合
  const client = redisClient.getClientSafe();
  if (updates.accountType && updates.accountType !== existingAccount.accountType) {
    if (updates.accountType === 'shared') {
      await client.sadd(SHARED_GEMINI_ACCOUNTS_KEY, accountId);
    } else {
      await client.srem(SHARED_GEMINI_ACCOUNTS_KEY, accountId);
    }
  }
  
  // 如果新增了 refresh token，更新过期时间为10分钟
  if (needUpdateExpiry) {
    const newExpiry = new Date(Date.now() + (10 * 60 * 1000)).toISOString();
    updates.expiresAt = newExpiry;
    logger.info(`🔄 New refresh token added for Gemini account ${accountId}, setting expiry to 10 minutes`);
  }
  
  // 如果通过 geminiOauth 更新，也要检查是否新增了 refresh token
  if (updates.geminiOauth && !oldRefreshToken) {
    const oauthData = typeof updates.geminiOauth === 'string' 
      ? JSON.parse(decrypt(updates.geminiOauth))
      : updates.geminiOauth;
      
    if (oauthData.refresh_token) {
      // 如果 expiry_date 设置的时间过长（超过1小时），调整为10分钟
      const providedExpiry = oauthData.expiry_date || 0;
      const now = Date.now();
      const oneHour = 60 * 60 * 1000;
      
      if (providedExpiry - now > oneHour) {
        const newExpiry = new Date(now + (10 * 60 * 1000)).toISOString();
        updates.expiresAt = newExpiry;
        logger.info(`🔄 Adjusted expiry time to 10 minutes for Gemini account ${accountId} with refresh token`);
      }
    }
  }
  
  await client.hset(
    `${GEMINI_ACCOUNT_KEY_PREFIX}${accountId}`,
    updates
  );
  
  logger.info(`Updated Gemini account: ${accountId}`);
  return { ...existingAccount, ...updates };
}

// 删除账户
async function deleteAccount(accountId) {
  const account = await getAccount(accountId);
  if (!account) {
    throw new Error('Account not found');
  }
  
  // 从 Redis 删除
  const client = redisClient.getClientSafe();
  await client.del(`${GEMINI_ACCOUNT_KEY_PREFIX}${accountId}`);
  
  // 从共享账户集合中移除
  if (account.accountType === 'shared') {
    await client.srem(SHARED_GEMINI_ACCOUNTS_KEY, accountId);
  }
  
  // 清理会话映射
  const sessionMappings = await client.keys(`${ACCOUNT_SESSION_MAPPING_PREFIX}*`);
  for (const key of sessionMappings) {
    const mappedAccountId = await client.get(key);
    if (mappedAccountId === accountId) {
      await client.del(key);
    }
  }
  
  logger.info(`Deleted Gemini account: ${accountId}`);
  return true;
}

// 获取所有账户
async function getAllAccounts() {
  const client = redisClient.getClientSafe();
  const keys = await client.keys(`${GEMINI_ACCOUNT_KEY_PREFIX}*`);
  const accounts = [];
  
  for (const key of keys) {
    const accountData = await client.hgetall(key);
    if (accountData && Object.keys(accountData).length > 0) {
      // 不解密敏感字段，只返回基本信息
      accounts.push({
        ...accountData,
        geminiOauth: accountData.geminiOauth ? '[ENCRYPTED]' : '',
        accessToken: accountData.accessToken ? '[ENCRYPTED]' : '',
        refreshToken: accountData.refreshToken ? '[ENCRYPTED]' : ''
      });
    }
  }
  
  return accounts;
}

// 选择可用账户（支持专属和共享账户）
async function selectAvailableAccount(apiKeyId, sessionHash = null) {
  // 首先检查是否有粘性会话
  const client = redisClient.getClientSafe();
  if (sessionHash) {
    const mappedAccountId = await client.get(
      `${ACCOUNT_SESSION_MAPPING_PREFIX}${sessionHash}`
    );
    
    if (mappedAccountId) {
      const account = await getAccount(mappedAccountId);
      if (account && account.isActive === 'true' && !isTokenExpired(account)) {
        logger.debug(`Using sticky session account: ${mappedAccountId}`);
        return account;
      }
    }
  }
  
  // 获取 API Key 信息
  const apiKeyData = await client.hgetall(`api_key:${apiKeyId}`);
  
  // 检查是否绑定了 Gemini 账户
  if (apiKeyData.geminiAccountId) {
    const account = await getAccount(apiKeyData.geminiAccountId);
    if (account && account.isActive === 'true') {
      // 检查 token 是否过期
      const isExpired = isTokenExpired(account);
      
      // 记录token使用情况
      logTokenUsage(account.id, account.name, 'gemini', account.expiresAt, isExpired);
      
      if (isExpired) {
        await refreshAccountToken(account.id);
        return await getAccount(account.id);
      }
      
      // 创建粘性会话映射
      if (sessionHash) {
        await client.setex(
          `${ACCOUNT_SESSION_MAPPING_PREFIX}${sessionHash}`,
          3600, // 1小时过期
          account.id
        );
      }
      
      return account;
    }
  }
  
  // 从共享账户池选择
  const sharedAccountIds = await client.smembers(SHARED_GEMINI_ACCOUNTS_KEY);
  const availableAccounts = [];
  
  for (const accountId of sharedAccountIds) {
    const account = await getAccount(accountId);
    if (account && account.isActive === 'true' && !isRateLimited(account)) {
      availableAccounts.push(account);
    }
  }
  
  if (availableAccounts.length === 0) {
    throw new Error('No available Gemini accounts');
  }
  
  // 选择最少使用的账户
  availableAccounts.sort((a, b) => {
    const aLastUsed = a.lastUsedAt ? new Date(a.lastUsedAt).getTime() : 0;
    const bLastUsed = b.lastUsedAt ? new Date(b.lastUsedAt).getTime() : 0;
    return aLastUsed - bLastUsed;
  });
  
  const selectedAccount = availableAccounts[0];
  
  // 检查并刷新 token
  const isExpired = isTokenExpired(selectedAccount);
  
  // 记录token使用情况
  logTokenUsage(selectedAccount.id, selectedAccount.name, 'gemini', selectedAccount.expiresAt, isExpired);
  
  if (isExpired) {
    await refreshAccountToken(selectedAccount.id);
    return await getAccount(selectedAccount.id);
  }
  
  // 创建粘性会话映射
  if (sessionHash) {
    await client.setex(
      `${ACCOUNT_SESSION_MAPPING_PREFIX}${sessionHash}`,
      3600,
      selectedAccount.id
    );
  }
  
  return selectedAccount;
}

// 检查 token 是否过期
function isTokenExpired(account) {
  if (!account.expiresAt) return true;
  
  const expiryTime = new Date(account.expiresAt).getTime();
  const now = Date.now();
  const buffer = 10 * 1000; // 10秒缓冲
  
  return now >= (expiryTime - buffer);
}

// 检查账户是否被限流
function isRateLimited(account) {
  if (account.rateLimitStatus === 'limited' && account.rateLimitedAt) {
    const limitedAt = new Date(account.rateLimitedAt).getTime();
    const now = Date.now();
    const limitDuration = 60 * 60 * 1000; // 1小时
    
    return now < (limitedAt + limitDuration);
  }
  return false;
}

// 刷新账户 token
async function refreshAccountToken(accountId) {
  let lockAcquired = false;
  let account = null;
  
  try {
    account = await getAccount(accountId);
    if (!account) {
      throw new Error('Account not found');
    }
    
    if (!account.refreshToken) {
      throw new Error('No refresh token available');
    }
    
    // 尝试获取分布式锁
    lockAcquired = await tokenRefreshService.acquireRefreshLock(accountId, 'gemini');
    
    if (!lockAcquired) {
      // 如果无法获取锁，说明另一个进程正在刷新
      logger.info(`🔒 Token refresh already in progress for Gemini account: ${account.name} (${accountId})`);
      logRefreshSkipped(accountId, account.name, 'gemini', 'already_locked');
      
      // 等待一段时间后返回，期望其他进程已完成刷新
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // 重新获取账户数据（可能已被其他进程刷新）
      const updatedAccount = await getAccount(accountId);
      if (updatedAccount && updatedAccount.accessToken) {
        const accessToken = decrypt(updatedAccount.accessToken);
        return {
          access_token: accessToken,
          refresh_token: updatedAccount.refreshToken ? decrypt(updatedAccount.refreshToken) : '',
          expiry_date: updatedAccount.expiresAt ? new Date(updatedAccount.expiresAt).getTime() : 0,
          scope: updatedAccount.scope || OAUTH_SCOPES.join(' '),
          token_type: 'Bearer'
        };
      }
      
      throw new Error('Token refresh in progress by another process');
    }
    
    // 记录开始刷新
    logRefreshStart(accountId, account.name, 'gemini', 'manual_refresh');
    logger.info(`🔄 Starting token refresh for Gemini account: ${account.name} (${accountId})`);
    
    const newTokens = await refreshAccessToken(decrypt(account.refreshToken));
    
    // 更新账户信息
    const updates = {
      accessToken: newTokens.access_token,
      refreshToken: newTokens.refresh_token || account.refreshToken,
      expiresAt: new Date(newTokens.expiry_date).toISOString(),
      lastRefreshAt: new Date().toISOString(),
      geminiOauth: JSON.stringify(newTokens)
    };
    
    await updateAccount(accountId, updates);
    
    // 记录刷新成功
    logRefreshSuccess(accountId, account.name, 'gemini', {
      accessToken: newTokens.access_token,
      refreshToken: newTokens.refresh_token,
      expiresAt: newTokens.expiry_date,
      scopes: newTokens.scope
    });
    
    logger.info(`Refreshed token for Gemini account: ${accountId} - Access Token: ${maskToken(newTokens.access_token)}`);
    
    return newTokens;
  } catch (error) {
    // 记录刷新失败
    logRefreshError(accountId, account ? account.name : 'Unknown', 'gemini', error);
    
    logger.error(`Failed to refresh token for account ${accountId}:`, error);
    
    // 标记账户为错误状态
    await updateAccount(accountId, {
      status: 'error',
      errorMessage: error.message
    });
    
    throw error;
  } finally {
    // 释放锁
    if (lockAcquired) {
      await tokenRefreshService.releaseRefreshLock(accountId, 'gemini');
    }
  }
}

// 标记账户被使用
async function markAccountUsed(accountId) {
  await updateAccount(accountId, {
    lastUsedAt: new Date().toISOString()
  });
}

// 设置账户限流状态
async function setAccountRateLimited(accountId, isLimited = true) {
  const updates = isLimited ? {
    rateLimitStatus: 'limited',
    rateLimitedAt: new Date().toISOString()
  } : {
    rateLimitStatus: '',
    rateLimitedAt: ''
  };
  
  await updateAccount(accountId, updates);
}

module.exports = {
  generateAuthUrl,
  pollAuthorizationStatus,
  exchangeCodeForTokens,
  refreshAccessToken,
  createAccount,
  getAccount,
  updateAccount,
  deleteAccount,
  getAllAccounts,
  selectAvailableAccount,
  refreshAccountToken,
  markAccountUsed,
  setAccountRateLimited,
  isTokenExpired,
  OAUTH_CLIENT_ID,
  OAUTH_SCOPES
};
