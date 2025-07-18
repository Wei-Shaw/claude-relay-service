/**
 * Vercel 环境配置
 * 适配 Vercel 的环境变量和无服务器架构
 */

const config = {
  // 安全配置
  security: {
    jwtSecret: process.env.JWT_SECRET || 'CHANGE-THIS-JWT-SECRET-IN-PRODUCTION',
    adminSessionTimeout: parseInt(process.env.ADMIN_SESSION_TIMEOUT) || 86400000, // 24小时
    apiKeyPrefix: process.env.API_KEY_PREFIX || 'cr_',
    encryptionKey: process.env.ENCRYPTION_KEY || 'CHANGE-THIS-32-CHARACTER-KEY-NOW'
  },

  // Claude API配置
  claude: {
    apiUrl: process.env.CLAUDE_API_URL || 'https://api.anthropic.com/v1/messages',
    apiVersion: process.env.CLAUDE_API_VERSION || '2023-06-01',
    betaHeader: process.env.CLAUDE_BETA_HEADER || 'claude-code-20250219,oauth-2025-04-20,interleaved-thinking-2025-05-14,fine-grained-tool-streaming-2025-05-14',
    oauthClientId: process.env.CLAUDE_OAUTH_CLIENT_ID || '9d1c250a-e61b-44d9-88ed-5944d1962f5e',
    oauthClientSecret: process.env.CLAUDE_OAUTH_CLIENT_SECRET || ''
  },

  // 代理配置
  proxy: {
    timeout: parseInt(process.env.DEFAULT_PROXY_TIMEOUT) || 30000,
    maxRetries: parseInt(process.env.MAX_PROXY_RETRIES) || 3
  },

  // 使用限制
  limits: {
    defaultTokenLimit: parseInt(process.env.DEFAULT_TOKEN_LIMIT) || 1000000
  },

  // 系统配置
  system: {
    cleanupInterval: parseInt(process.env.CLEANUP_INTERVAL) || 3600000, // 1小时
    tokenUsageRetention: parseInt(process.env.TOKEN_USAGE_RETENTION) || 2592000000, // 30天
    healthCheckInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL) || 60000 // 1分钟
  },

  // Web界面配置
  web: {
    title: process.env.WEB_TITLE || 'Claude Relay Service',
    description: process.env.WEB_DESCRIPTION || 'Multi-account Claude API relay service with beautiful management interface',
    logoUrl: process.env.WEB_LOGO_URL || '/assets/logo.png',
    enableCors: process.env.ENABLE_CORS === 'true'
  },

  // OAuth 配置
  oauth: {
    authorizeUrl: 'https://claude.ai/oauth/authorize',
    tokenUrl: 'https://console.anthropic.com/v1/oauth/token',
    clientId: process.env.CLAUDE_OAUTH_CLIENT_ID || '9d1c250a-e61b-44d9-88ed-5944d1962f5e',
    clientSecret: process.env.CLAUDE_OAUTH_CLIENT_SECRET || '',
    redirectUri: 'https://console.anthropic.com/oauth/code/callback',
    scopes: 'org:create_api_key user:profile user:inference'
  },

  // 环境信息
  env: {
    isProduction: process.env.NODE_ENV === 'production',
    isVercel: process.env.VERCEL === '1',
    vercelUrl: process.env.VERCEL_URL || '',
    vercelEnv: process.env.VERCEL_ENV || 'development'
  }
};

module.exports = config;