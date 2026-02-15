/**
 * 客户端定义配置
 * 定义所有支持的客户端类型和它们的属性
 *
 * allowedPathPrefixes: 允许访问的路径前缀白名单
 * - 当启用客户端限制时，只有匹配白名单的路径才允许访问
 * - 防止通过其他兼容端点（如 /v1/chat/completions）绕过客户端限制
 */

const CLIENT_DEFINITIONS = {
  CLAUDE_CODE: {
    id: 'claude_code',
    name: 'Claude Code',
    displayName: 'Claude Code CLI',
    description: 'Claude Code command-line interface',
    icon: '🤖',
    // Claude Code 仅允许访问 Claude 原生端点，禁止访问 OpenAI 兼容端点
    allowedPathPrefixes: [
      '/api/v1/messages',
      '/api/v1/models',
      '/api/v1/me',
      '/api/v1/usage',
      '/api/v1/key-info',
      '/api/v1/organizations',
      '/claude/v1/messages',
      '/claude/v1/models',
      '/antigravity/api/',
      '/gemini-cli/api/',
      '/api/event_logging',
      '/v1/messages',
      '/v1/models',
      '/v1/me',
      '/v1/usage',
      '/v1/key-info',
      '/v1/organizations'
    ]
  },

  GEMINI_CLI: {
    id: 'gemini_cli',
    name: 'Gemini CLI',
    displayName: 'Gemini Command Line Tool',
    description: 'Google Gemini API command-line interface',
    icon: '💎',
    // Gemini CLI 仅允许访问 Gemini 端点
    allowedPathPrefixes: ['/gemini/']
  },

  CODEX_CLI: {
    id: 'codex_cli',
    name: 'Codex CLI',
    displayName: 'Codex Command Line Tool',
    description: 'Cursor/Codex command-line interface',
    icon: '🔷',
    // Codex CLI 仅允许访问 OpenAI Responses 和 Azure 端点
    allowedPathPrefixes: ['/openai/responses', '/openai/v1/responses', '/azure/']
  },

  DROID_CLI: {
    id: 'droid_cli',
    name: 'Droid CLI',
    displayName: 'Factory Droid CLI',
    description: 'Factory Droid platform command-line interface',
    icon: '🤖',
    // Droid CLI 仅允许访问 Droid 端点
    allowedPathPrefixes: ['/droid/']
  }
}

// 导出客户端ID枚举
const CLIENT_IDS = {
  CLAUDE_CODE: 'claude_code',
  GEMINI_CLI: 'gemini_cli',
  CODEX_CLI: 'codex_cli',
  DROID_CLI: 'droid_cli'
}

// 获取所有客户端定义
function getAllClientDefinitions() {
  return Object.values(CLIENT_DEFINITIONS)
}

// 根据ID获取客户端定义
function getClientDefinitionById(clientId) {
  return Object.values(CLIENT_DEFINITIONS).find((client) => client.id === clientId)
}

// 检查客户端ID是否有效
function isValidClientId(clientId) {
  return Object.values(CLIENT_IDS).includes(clientId)
}

/**
 * 检查路径是否允许指定客户端访问
 * @param {string} clientId - 客户端ID
 * @param {string} path - 请求路径 (originalUrl 或 path)
 * @returns {boolean} 是否允许
 */
function isPathAllowedForClient(clientId, path) {
  const definition = getClientDefinitionById(clientId)
  if (!definition) {
    return false
  }

  // 如果没有定义 allowedPathPrefixes，则不限制路径（向后兼容）
  if (!definition.allowedPathPrefixes || definition.allowedPathPrefixes.length === 0) {
    return true
  }

  const normalizedPath = (path || '').toLowerCase()
  return definition.allowedPathPrefixes.some((prefix) =>
    normalizedPath.startsWith(prefix.toLowerCase())
  )
}

module.exports = {
  CLIENT_DEFINITIONS,
  CLIENT_IDS,
  getAllClientDefinitions,
  getClientDefinitionById,
  isValidClientId,
  isPathAllowedForClient
}
