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
const http = require('http');
const url = require('url');

// 使用 Node.js 内置 fetch（Node 18+）或 fallback
const fetch = globalThis.fetch || require('node-fetch');

// Gemini CLI OAuth 配置 - 这些是公开的 Gemini CLI 凭据
const OAUTH_CLIENT_ID = '681255809395-oo8ft2oprdrnp9e3aqf6av3hmdib135j.apps.googleusercontent.com';
const OAUTH_CLIENT_SECRET = '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';
const OAUTH_SCOPES = ['https://www.googleapis.com/auth/cloud-platform'];

// OAuth Personal 扩展作用域（个人Google账户需要）
const OAUTH_PERSONAL_SCOPES = [
  'https://www.googleapis.com/auth/cloud-platform',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile'
];

// 成功/失败页面 URL
const SIGN_IN_SUCCESS_URL = 'https://developers.google.com/gemini-code-assist/auth_success_gemini';
const SIGN_IN_FAILURE_URL = 'https://developers.google.com/gemini-code-assist/auth_failure_gemini';

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
    // IV 是固定长度的 32 个十六进制字符（16 字节）
    const ivHex = text.substring(0, 32);
    const encryptedHex = text.substring(33); // 跳过冒号
    
    const iv = Buffer.from(ivHex, 'hex');
    const encryptedText = Buffer.from(encryptedHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  } catch (error) {
    logger.error('Decryption error:', error);
    return '';
  }
}

// 创建 OAuth2 客户端（支持代理配置）
function createOAuth2Client(redirectUri = null, proxyConfig = null) {
  // 如果没有提供 redirectUri，使用默认值
  const uri = redirectUri || 'http://localhost:45462';
  
  const clientOptions = {
    clientId: OAUTH_CLIENT_ID,
    clientSecret: OAUTH_CLIENT_SECRET,
    redirectUri: uri
  };
  
  // 添加代理配置支持
  if (proxyConfig) {
    try {
      const proxy = typeof proxyConfig === 'string' ? JSON.parse(proxyConfig) : proxyConfig;
      if (proxy.type && proxy.host && proxy.port) {
        const proxyUrl = proxy.username && proxy.password
          ? `${proxy.type}://${proxy.username}:${proxy.password}@${proxy.host}:${proxy.port}`
          : `${proxy.type}://${proxy.host}:${proxy.port}`;
        
        clientOptions.transporterOptions = {
          proxy: proxyUrl
        };
        logger.debug('OAuth2Client configured with proxy:', proxyUrl.replace(/\/\/[^:]+:[^@]+@/, '//***:***@'));
      }
    } catch (error) {
      logger.error('Error configuring OAuth2Client proxy:', error);
    }
  }
  
  return new OAuth2Client(clientOptions);
}

// 生成授权 URL
async function generateAuthUrl(state = null, redirectUri = null, proxyConfig = null) {
  const oAuth2Client = createOAuth2Client(redirectUri, proxyConfig);
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
async function exchangeCodeForTokens(code, redirectUri = null, proxyConfig = null) {
  const oAuth2Client = createOAuth2Client(redirectUri, proxyConfig);
  
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
async function refreshAccessToken(refreshToken, proxyConfig = null) {
  const oAuth2Client = createOAuth2Client(null, proxyConfig);
  
  try {
    // 设置 refresh_token
    oAuth2Client.setCredentials({
      refresh_token: refreshToken
    });
    
    // 调用 refreshAccessToken 获取新的 tokens
    const response = await oAuth2Client.refreshAccessToken();
    const credentials = response.credentials;
    
    // 检查是否成功获取了新的 access_token
    if (!credentials || !credentials.access_token) {
      throw new Error('No access token returned from refresh');
    }
    
    logger.info(`🔄 Successfully refreshed Gemini token. New expiry: ${new Date(credentials.expiry_date).toISOString()}`);
    
    return {
      access_token: credentials.access_token,
      refresh_token: credentials.refresh_token || refreshToken, // 保留原 refresh_token 如果没有返回新的
      scope: credentials.scope || OAUTH_SCOPES.join(' '),
      token_type: credentials.token_type || 'Bearer',
      expiry_date: credentials.expiry_date || Date.now() + 3600000 // 默认1小时过期
    };
  } catch (error) {
    logger.error('Error refreshing access token:', {
      message: error.message,
      code: error.code,
      response: error.response?.data
    });
    throw new Error(`Failed to refresh access token: ${error.message}`);
  }
}

// 创建 Gemini 账户（支持多种认证类型）
async function createAccount(accountData) {
  const id = uuidv4();
  const now = new Date().toISOString();
  
  // 确定认证类型
  const authType = accountData.authType || 'code-assist'; // 默认为 code-assist (原有方式)
  
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
    authType, // 认证类型: 'code-assist' | 'oauth-personal'
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
    
    // oauth-personal 特有字段
    userInfo: accountData.userInfo ? JSON.stringify(accountData.userInfo) : '',
    
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
  
  logger.info(`Created Gemini account (${authType}): ${id}`);
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
  // existingAccount.refreshToken 已经是解密后的值了（从 getAccount 返回）
  const oldRefreshToken = existingAccount.refreshToken || '';
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
      if (account && account.isActive === 'true' && !(await isTokenExpired(account))) {
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
      
      // 对于 oauth-personal 账户，检查是否需要设置
      if (account.authType === 'oauth-personal' && !account.userTier) {
        logger.info(`OAuth Personal account ${account.id} needs setup - initializing...`);
        try {
          await setupOAuthPersonalAccount(account.id);
          // 重新获取更新后的账户信息
          const updatedAccount = await getAccount(account.id);
          if (updatedAccount) {
            logger.info(`OAuth Personal account ${account.id} setup completed successfully`);
            return updatedAccount;
          } else {
            logger.error(`Failed to retrieve updated account ${account.id} after setup`);
          }
        } catch (error) {
          logger.error(`Failed to setup OAuth Personal account ${account.id}:`, error);
          // 标记账户为错误状态
          await updateAccount(account.id, {
            status: 'error',
            errorMessage: `Setup failed: ${error.message}`
          });
          // 继续尝试其他账户
        }
      } else if (account.authType === 'oauth-personal' && account.userTier) {
        logger.debug(`OAuth Personal account ${account.id} already set up with tier: ${account.userTier}`);
      }
      
      // 检查 token 是否过期
      const isExpired = await isTokenExpired(account);
      
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
  const isExpired = await isTokenExpired(selectedAccount);
  
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

// 检查 token 是否过期并验证有效性
async function isTokenExpired(account) {
  if (!account.expiresAt) return true;
  
  const expiryTime = new Date(account.expiresAt).getTime();
  const now = Date.now();
  const buffer = 10 * 1000; // 10秒缓冲
  
  // 首先检查时间过期
  if (now >= (expiryTime - buffer)) {
    return true;
  }
  
  // 对于 OAuth Personal 类型，进行额外的 token 验证
  if (account.authType === 'oauth-personal' && account.accessToken) {
    try {
      const oAuth2Client = createOAuth2Client(null, account.proxy);
      
      // accessToken 已经在 getAccount 中解密过了，直接使用
      const accessToken = account.accessToken;
      const refreshToken = account.refreshToken;
      
      // 设置凭证
      oAuth2Client.setCredentials({
        access_token: accessToken,
        refresh_token: refreshToken
      });
      
      // 获取有效的 access token (这会验证并刷新如需要)
      const { token } = await oAuth2Client.getAccessToken();
      if (!token) {
        logger.debug(`OAuth Personal token validation failed for account ${account.id}: no token returned`);
        return true;
      }
      
      // 如果 token 被刷新了，更新账户信息
      const credentials = oAuth2Client.credentials;
      if (credentials.access_token !== accessToken) {
        logger.info(`OAuth Personal token refreshed for account ${account.id}`);
        
        // 更新账户的 token 信息
        await updateAccount(account.id, {
          accessToken: credentials.access_token,
          refreshToken: credentials.refresh_token || refreshToken,
          expiresAt: credentials.expiry_date ? new Date(credentials.expiry_date).toISOString() : account.expiresAt
        });
      }
      
      logger.debug(`OAuth Personal token validation successful for account ${account.id}`);
      return false;
    } catch (error) {
      logger.debug(`OAuth Personal token validation failed for account ${account.id}:`, error.message);
      return true;
    }
  }
  
  // 对于 code-assist 类型，只检查时间过期
  return false;
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

// 刷新账户 token（支持不同认证类型）
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
    
    // account.refreshToken 已经是解密后的值（从 getAccount 返回）
    let newTokens = await refreshAccessToken(account.refreshToken);
    
    // 根据认证类型选择刷新方式
    if (account.authType === 'oauth-personal') {
      // 使用 oauth-personal 刷新方式
      newTokens = await refreshOAuthPersonalToken(
        accountId,
        account.refreshToken, // 已经在 getAccount 中解密过了，不需要再次解密
        account.proxy ? JSON.parse(account.proxy) : null
      );
    } else {
      // 使用默认的 code-assist 方式刷新
      newTokens = await refreshAccessToken(account.refreshToken, account.proxy); // 已经在 getAccount 中解密过了
    }
    
    // 更新账户信息
    const updates = {
      accessToken: newTokens.access_token,
      refreshToken: newTokens.refresh_token || account.refreshToken,
      expiresAt: new Date(newTokens.expiry_date).toISOString(),
      lastRefreshAt: new Date().toISOString(),
      geminiOauth: JSON.stringify(newTokens),
      status: 'active',  // 刷新成功后，将状态更新为 active
      errorMessage: ''   // 清空错误信息
    };
    
    await updateAccount(accountId, updates);
    
    // 记录刷新成功
    logRefreshSuccess(accountId, account.name, 'gemini', {
      accessToken: newTokens.access_token,
      refreshToken: newTokens.refresh_token,
      expiresAt: newTokens.expiry_date,
      scopes: newTokens.scope
    });
    
    logger.info(`Refreshed token for Gemini account (${account.authType || 'code-assist'}): ${accountId} - Access Token: ${maskToken(newTokens.access_token)}`);
    
    return newTokens;
  } catch (error) {
    // 记录刷新失败
    logRefreshError(accountId, account ? account.name : 'Unknown', 'gemini', error);
    
    logger.error(`Failed to refresh token for account ${accountId}:`, error);
    
    // 标记账户为错误状态（只有在账户存在时）
    if (account) {
      try {
        await updateAccount(accountId, {
          status: 'error',
          errorMessage: error.message
        });
      } catch (updateError) {
        logger.error('Failed to update account status after refresh error:', updateError);
      }
    }
    
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

// ===== OAuth Personal 功能 =====

// OAuth 会话存储
const oauthSessions = new Map();

// 获取可用端口
async function getAvailablePort() {
  return new Promise((resolve, reject) => {
    const net = require('net');
    const server = net.createServer();
    
    server.listen(0, () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
    
    server.on('error', reject);
  });
}

// 生成 OAuth Personal User Code 授权 URL
async function generateOAuthPersonalUserCodeAuth(accountId, proxyConfig = null) {
  const oAuth2Client = createOAuth2Client(null, proxyConfig);
  
  // 生成 PKCE 参数
  const codeVerifier = await oAuth2Client.generateCodeVerifierAsync();
  const state = crypto.randomBytes(32).toString('hex');
  
  const authUrl = oAuth2Client.generateAuthUrl({
    redirect_uri: 'https://codeassist.google.com/authcode',
    access_type: 'offline',
    scope: OAUTH_PERSONAL_SCOPES,
    code_challenge_method: 'S256',
    code_challenge: codeVerifier.codeChallenge,
    state,
    prompt: 'select_account'
  });

  // 存储会话信息
  const sessionData = {
    accountId,
    codeVerifier: codeVerifier.codeVerifier,
    state,
    proxyConfig,
    type: 'oauth_personal_user_code',
    createdAt: Date.now()
  };
  
  oauthSessions.set(state, sessionData);
  
  // 30分钟后清理
  setTimeout(() => {
    oauthSessions.delete(state);
  }, 30 * 60 * 1000);

  logger.info(`Generated oauth-personal user code auth URL for account: ${accountId}`);
  
  return {
    authUrl,
    state,
    instructions: {
      step1: 'Copy the URL and open it in your browser',
      step2: 'Sign in with your personal Google account',  
      step3: 'Copy the authorization code from the result page',
      step4: 'Return the code to complete authentication'
    }
  };
}

// 交换 OAuth Personal User Code
async function exchangeOAuthPersonalUserCode(code, state) {
  const sessionData = oauthSessions.get(state);
  if (!sessionData || sessionData.type !== 'oauth_personal_user_code') {
    throw new Error('Invalid or expired OAuth session');
  }

  const oAuth2Client = createOAuth2Client(null, sessionData.proxyConfig);
  
  try {
    const { tokens } = await oAuth2Client.getToken({
      code,
      codeVerifier: sessionData.codeVerifier,
      redirect_uri: 'https://codeassist.google.com/authcode'
    });

    // 获取用户信息
    oAuth2Client.setCredentials(tokens);
    const userInfo = await fetchUserInfo(oAuth2Client);
    
    // 清理会话
    oauthSessions.delete(state);
    
    logger.success(`OAuth-personal user code authentication successful for account: ${sessionData.accountId}`);
    
    return {
      tokens,
      userInfo,
      accountId: sessionData.accountId
    };
    
  } catch (error) {
    oauthSessions.delete(state);
    logger.error(`Failed to exchange oauth-personal user code for account ${sessionData.accountId}:`, error);
    throw new Error('Failed to exchange authorization code');
  }
}

// 交换 OAuth Personal User Code (通过 accountId)
async function exchangeOAuthPersonalUserCodeByAccountId(code, accountId) {
  // 查找所有未过期的会话，找到匹配的 accountId
  let targetSessionData = null;
  let targetState = null;
  
  for (const [state, sessionData] of oauthSessions) {
    if (sessionData.type === 'oauth_personal_user_code' && 
        sessionData.accountId === accountId &&
        (Date.now() - sessionData.createdAt) < 30 * 60 * 1000) { // 30分钟内
      targetSessionData = sessionData;
      targetState = state;
      break;
    }
  }
  
  if (!targetSessionData) {
    throw new Error('No valid OAuth session found for this account. Please generate a new authorization URL.');
  }

  const oAuth2Client = createOAuth2Client(null, targetSessionData.proxyConfig);
  
  try {
    const { tokens } = await oAuth2Client.getToken({
      code,
      codeVerifier: targetSessionData.codeVerifier,
      redirect_uri: 'https://codeassist.google.com/authcode'
    });

    // 获取用户信息
    oAuth2Client.setCredentials(tokens);
    const userInfo = await fetchUserInfo(oAuth2Client);
    
    // 清理会话
    oauthSessions.delete(targetState);
    
    logger.success(`OAuth-personal user code authentication successful for account: ${accountId} (via accountId)`);
    
    return {
      tokens,
      userInfo,
      accountId: accountId
    };
    
  } catch (error) {
    oauthSessions.delete(targetState);
    logger.error(`Failed to exchange oauth-personal user code for account ${accountId}:`, error);
    throw new Error('Failed to exchange authorization code');
  }
}

// 交换 OAuth Personal User Code (自动查找会话)
async function exchangeOAuthPersonalUserCodeAuto(code) {
  // 查找所有未过期的 oauth-personal 会话
  let targetSessionData = null;
  let targetState = null;
  
  // 遍历所有会话，找到最新的未过期会话
  for (const [state, sessionData] of oauthSessions) {
    if (sessionData.type === 'oauth_personal_user_code' && 
        (Date.now() - sessionData.createdAt) < 30 * 60 * 1000) { // 30分钟内
      // 如果找到多个，使用最新的一个
      if (!targetSessionData || sessionData.createdAt > targetSessionData.createdAt) {
        targetSessionData = sessionData;
        targetState = state;
      }
    }
  }
  
  if (!targetSessionData) {
    throw new Error('No valid OAuth session found. Please generate a new authorization URL.');
  }

  const oAuth2Client = createOAuth2Client(null, targetSessionData.proxyConfig);
  
  try {
    const { tokens } = await oAuth2Client.getToken({
      code,
      codeVerifier: targetSessionData.codeVerifier,
      redirect_uri: 'https://codeassist.google.com/authcode'
    });

    // 获取用户信息
    oAuth2Client.setCredentials(tokens);
    const userInfo = await fetchUserInfo(oAuth2Client);
    
    // 清理会话
    oauthSessions.delete(targetState);
    
    logger.success(`OAuth-personal user code authentication successful for account: ${targetSessionData.accountId} (auto-found)`);
    
    return {
      tokens,
      userInfo,
      accountId: targetSessionData.accountId
    };
    
  } catch (error) {
    oauthSessions.delete(targetState);
    logger.error(`Failed to exchange oauth-personal user code for account ${targetSessionData.accountId}:`, error);
    throw new Error('Failed to exchange authorization code');
  }
}

// 生成 OAuth Personal Web 授权流程
async function generateOAuthPersonalWebAuth(accountId, proxyConfig = null) {
  const port = await getAvailablePort();
  const redirectUri = `http://localhost:${port}/oauth2callback`;
  const state = crypto.randomBytes(32).toString('hex');
  
  const oAuth2Client = createOAuth2Client(null, proxyConfig);
  
  const authUrl = oAuth2Client.generateAuthUrl({
    redirect_uri: redirectUri,
    access_type: 'offline',
    scope: OAUTH_PERSONAL_SCOPES,
    state,
    prompt: 'select_account'
  });

  const loginCompletePromise = new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        if (req.url.indexOf('/oauth2callback') === -1) {
          res.writeHead(302, { Location: SIGN_IN_FAILURE_URL });
          res.end();
          reject(new Error('Unexpected request: ' + req.url));
          return;
        }

        const qs = new url.URL(req.url, 'http://localhost:3000').searchParams;
        
        if (qs.get('error')) {
          res.writeHead(302, { Location: SIGN_IN_FAILURE_URL });
          res.end();
          reject(new Error(`OAuth error: ${qs.get('error')}`));
          return;
        }

        if (qs.get('state') !== state) {
          res.end('State mismatch. Possible CSRF attack');
          reject(new Error('State mismatch. Possible CSRF attack'));
          return;
        }

        if (qs.get('code')) {
          const { tokens } = await oAuth2Client.getToken({
            code: qs.get('code'),
            redirect_uri: redirectUri
          });

          // 获取用户信息
          oAuth2Client.setCredentials(tokens);
          const userInfo = await fetchUserInfo(oAuth2Client);

          res.writeHead(302, { Location: SIGN_IN_SUCCESS_URL });
          res.end();
          
          server.close();
          resolve({
            tokens,
            userInfo,
            accountId
          });
        } else {
          res.end('Missing code parameter');
          reject(new Error('Missing code parameter'));
        }
      } catch (error) {
        res.writeHead(500);
        res.end('Server error: ' + error.message);
        server.close();
        reject(error);
      }
    });

    server.listen(port, () => {
      logger.info(`OAuth Personal web server listening on http://localhost:${port}`);
    });

    // 10分钟超时
    setTimeout(() => {
      server.close();
      reject(new Error('OAuth flow timeout'));
    }, 10 * 60 * 1000);
  });

  return {
    authUrl,
    port,
    loginCompletePromise,
    instructions: [
      '1. Click the authorization URL to open it in your browser',
      '2. Sign in with your personal Google account',
      '3. Grant the requested permissions',
      '4. The browser will automatically return to complete the process',
      '5. Close the browser tab when you see the success message'
    ]
  };
}

// 获取用户信息
async function fetchUserInfo(oAuth2Client) {
  try {
    const { token } = await oAuth2Client.getAccessToken();
    if (!token) return null;

    const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!response.ok) {
      logger.error('Failed to fetch user info:', response.status, response.statusText);
      return null;
    }

    return await response.json();
  } catch (error) {
    logger.error('Error retrieving user info:', error);
    return null;
  }
}

// 刷新 OAuth Personal 访问令牌
async function refreshOAuthPersonalToken(accountId, refreshToken, proxyConfig = null) {
  const oAuth2Client = createOAuth2Client(null, proxyConfig);
  
  try {
    oAuth2Client.setCredentials({
      refresh_token: refreshToken
    });

    const { credentials } = await oAuth2Client.refreshAccessToken();
    
    logger.info(`OAuth-personal access token refreshed for account: ${accountId}`);
    
    return {
      access_token: credentials.access_token,
      refresh_token: credentials.refresh_token || refreshToken,
      scope: credentials.scope || OAUTH_PERSONAL_SCOPES.join(' '),
      token_type: credentials.token_type || 'Bearer',
      expiry_date: credentials.expiry_date
    };
  } catch (error) {
    logger.error(`Failed to refresh oauth-personal access token for account ${accountId}:`, error);
    throw new Error('Failed to refresh access token');
  }
}

// 获取有效的 OAuth Personal 访问令牌
async function getOAuthPersonalValidToken(accountId, proxyConfig = null) {
  try {
    const account = await getAccount(accountId);
    if (!account || account.authType !== 'oauth-personal') {
      logger.debug(`Account ${accountId} not found or not oauth-personal type`);
      return null;
    }

    // 检查是否过期 (给10秒缓冲)
    const now = Date.now();
    const expiryTime = account.expiresAt ? new Date(account.expiresAt).getTime() : 0;
    const buffer = 10 * 1000;

    if (now < (expiryTime - buffer)) {
      logger.debug(`Valid oauth-personal access token found for account: ${accountId}`);
      return decrypt(account.accessToken);
    }

    // 如果过期，尝试刷新
    if (account.refreshToken) {
      try {
        const newCredentials = await refreshOAuthPersonalToken(
          accountId, 
          decrypt(account.refreshToken), 
          account.proxy ? JSON.parse(account.proxy) : proxyConfig
        );
        
        // 更新账户
        await updateAccount(accountId, {
          accessToken: newCredentials.access_token,
          refreshToken: newCredentials.refresh_token,
          expiresAt: new Date(newCredentials.expiry_date).toISOString(),
          lastRefreshAt: new Date().toISOString(),
          geminiOauth: JSON.stringify(newCredentials)
        });
        
        return newCredentials.access_token;
      } catch (error) {
        logger.error(`Failed to refresh oauth-personal token for account ${accountId}:`, error);
        return null;
      }
    }

    logger.debug(`No refresh token available for oauth-personal account: ${accountId}`);
    return null;
  } catch (error) {
    logger.error(`Error getting oauth-personal valid token for account ${accountId}:`, error);
    return null;
  }
}

// 清除 OAuth Personal 凭证缓存
async function clearOAuthPersonalCredentials(accountId) {
  try {
    const account = await getAccount(accountId);
    if (account && account.authType === 'oauth-personal') {
      await updateAccount(accountId, {
        accessToken: '',
        refreshToken: '',
        geminiOauth: '',
        expiresAt: '',
        status: 'inactive'
      });
      
      logger.info(`Cleared oauth-personal credentials for account: ${accountId}`);
      return true;
    }
    return false;
  } catch (error) {
    logger.error(`Failed to clear oauth-personal credentials for account ${accountId}:`, error);
    throw error;
  }
}

// 设置 OAuth Personal 账户 - 实现 Code Assist 初始化流程
async function setupOAuthPersonalAccount(accountId) {
  try {
    const account = await getAccount(accountId);
    if (!account || account.authType !== 'oauth-personal') {
      throw new Error(`Account ${accountId} is not an oauth-personal account`);
    }

    // 获取有效的访问令牌
    const accessToken = await getOAuthPersonalValidToken(accountId);
    
    // 创建 OAuth2 客户端进行 Code Assist API 调用
    const oAuth2Client = createOAuth2Client(null, account.proxy);
    oAuth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: account.refreshToken
    });

    logger.info(`Setting up OAuth Personal account: ${accountId}`);

    // 步骤1: 调用 loadCodeAssist 获取用户信息
    const loadCodeAssistUrl = 'https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist';
    const loadCodeAssistData = {
      cloudaicompanionProject: account.projectId || undefined,
      metadata: {
        ideType: 'IDE_UNSPECIFIED',
        platform: 'PLATFORM_UNSPECIFIED', 
        pluginType: 'GEMINI',
        duetProject: account.projectId || undefined
      }
    };

    const loadResponse = await fetch(loadCodeAssistUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(loadCodeAssistData)
    });

    if (!loadResponse.ok) {
      const errorData = await loadResponse.text();
      logger.error(`loadCodeAssist failed for account ${accountId}:`, errorData);
      throw new Error(`loadCodeAssist failed: ${loadResponse.status} ${errorData}`);
    }

    const loadResult = await loadResponse.json();
    logger.debug(`loadCodeAssist result for account ${accountId}:`, JSON.stringify(loadResult, null, 2));

    // 如果服务器返回了项目ID，更新账户信息
    let projectId = account.projectId;
    if (!projectId && loadResult.cloudaicompanionProject) {
      projectId = loadResult.cloudaicompanionProject;
      logger.info(`Auto-discovered project ID for account ${accountId}: ${projectId}`);
    }

    // 获取用户层级信息
    const tier = getOnboardTier(loadResult);
    logger.debug(`User tier for account ${accountId}:`, tier);

    // 步骤2: 调用 onboardUser 完成用户入驻
    const onboardUserUrl = 'https://cloudcode-pa.googleapis.com/v1internal:onboardUser';
    const onboardUserData = {
      tierId: tier.id,
      cloudaicompanionProject: projectId,
      metadata: {
        ideType: 'IDE_UNSPECIFIED',
        platform: 'PLATFORM_UNSPECIFIED',
        pluginType: 'GEMINI',
        duetProject: projectId
      }
    };

    const onboardResponse = await fetch(onboardUserUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(onboardUserData)
    });

    if (!onboardResponse.ok) {
      const errorData = await onboardResponse.text();
      logger.error(`onboardUser failed for account ${accountId}:`, errorData);
      throw new Error(`onboardUser failed: ${onboardResponse.status} ${errorData}`);
    }

    let onboardResult = await onboardResponse.json();
    logger.debug(`onboardUser initial result for account ${accountId}:`, JSON.stringify(onboardResult, null, 2));

    // 轮询直到 onboardUser 操作完成
    while (!onboardResult.done) {
      logger.debug(`Waiting for onboardUser completion for account ${accountId}...`);
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      const pollResponse = await fetch(onboardUserUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(onboardUserData)
      });

      if (!pollResponse.ok) {
        const errorData = await pollResponse.text();
        logger.error(`onboardUser polling failed for account ${accountId}:`, errorData);
        break;
      }

      onboardResult = await pollResponse.json();
      logger.debug(`onboardUser polling result for account ${accountId}:`, JSON.stringify(onboardResult, null, 2));
    }

    // 更新账户信息，使用最终的项目ID
    const finalProjectId = onboardResult.response?.cloudaicompanionProject?.id || projectId || '';
    const updateData = {
      status: 'active',
      errorMessage: '',
      userTier: tier.id
    };

    if (finalProjectId && finalProjectId !== account.projectId) {
      updateData.projectId = finalProjectId;
      logger.info(`Updated project ID for account ${accountId}: ${finalProjectId}`);
    }

    await updateAccount(accountId, updateData);

    logger.info(`OAuth Personal account setup completed for ${accountId}, project: ${finalProjectId}, tier: ${tier.id}`);
    
    return {
      projectId: finalProjectId,
      userTier: tier.id,
      setupComplete: true
    };

  } catch (error) {
    logger.error(`Failed to setup OAuth Personal account ${accountId}:`, error);
    
    // 标记账户为错误状态
    await updateAccount(accountId, {
      status: 'error',
      errorMessage: error.message
    });
    
    throw error;
  }
}

// 辅助函数：获取入驻层级
function getOnboardTier(loadResponse) {
  if (loadResponse.currentTier) {
    return loadResponse.currentTier;
  }
  
  // 查找默认层级
  for (const tier of loadResponse.allowedTiers || []) {
    if (tier.isDefault) {
      return tier;
    }
  }
  
  // 如果没有找到，使用 LEGACY 层级
  return {
    name: '',
    description: '',
    id: 'LEGACY',
    userDefinedCloudaicompanionProject: true
  };
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
  OAUTH_SCOPES,
  
  // OAuth Personal 功能
  generateOAuthPersonalUserCodeAuth,
  exchangeOAuthPersonalUserCode,
  exchangeOAuthPersonalUserCodeByAccountId, // 通过 accountId 交换
  exchangeOAuthPersonalUserCodeAuto, // 自动查找会话并交换
  generateOAuthPersonalWebAuth,
  refreshOAuthPersonalToken,
  getOAuthPersonalValidToken,
  clearOAuthPersonalCredentials,
  fetchUserInfo,
  setupOAuthPersonalAccount
};
