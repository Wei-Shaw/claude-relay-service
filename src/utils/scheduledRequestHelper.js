const claudeAccountService = require('../services/claudeAccountService')
const claudeConsoleAccountService = require('../services/claudeConsoleAccountService')
const geminiAccountService = require('../services/geminiAccountService')
const bedrockAccountService = require('../services/bedrockAccountService')
const ccrAccountService = require('../services/ccrAccountService')
const openaiResponsesAccountService = require('../services/openaiResponsesAccountService')
const azureOpenaiAccountService = require('../services/azureOpenaiAccountService')
const droidAccountService = require('../services/droidAccountService')

/**
 * 根据账户类型获取默认模型
 * @param {string} accountType - 账户类型
 * @returns {string} 默认模型ID
 */
function getDefaultModelForAccountType(accountType) {
  // 标准化 accountType：'claude' -> 'claude-official'
  const normalizedType = accountType === 'claude' ? 'claude-official' : accountType

  const modelMap = {
    'claude-official': 'claude-sonnet-4-5-20250929',
    'claude-console': 'claude-sonnet-4-5-20250929',
    bedrock: 'us.anthropic.claude-sonnet-4-20250514-v1:0',
    ccr: 'claude-3-5-sonnet-20241022',
    gemini: 'models/gemini-2.0-flash-exp',
    'openai-responses': 'chatgpt-4o-latest',
    'azure-openai': 'gpt-4o',
    droid: 'claude-3-5-sonnet-20241022'
  }
  return modelMap[normalizedType] || 'claude-sonnet-4-5-20250929'
}

/**
 * 根据账户类型获取对应的账户服务
 * @param {string} accountType - 账户类型
 * @returns {Object} 账户服务实例
 */
function getAccountService(accountType) {
  // 标准化 accountType：'claude' -> 'claude-official'
  const normalizedType = accountType === 'claude' ? 'claude-official' : accountType

  const serviceMap = {
    'claude-official': claudeAccountService,
    'claude-console': claudeConsoleAccountService,
    gemini: geminiAccountService,
    bedrock: bedrockAccountService,
    ccr: ccrAccountService,
    'openai-responses': openaiResponsesAccountService,
    'azure-openai': azureOpenaiAccountService,
    droid: droidAccountService
  }
  return serviceMap[normalizedType]
}

/**
 * 获取所有账户服务
 * @returns {Array} 账户服务列表 [{ type, service }]
 */
function getAllAccountServices() {
  return [
    { type: 'claude-official', service: claudeAccountService },
    { type: 'claude-console', service: claudeConsoleAccountService },
    { type: 'gemini', service: geminiAccountService },
    { type: 'bedrock', service: bedrockAccountService },
    { type: 'ccr', service: ccrAccountService },
    { type: 'openai-responses', service: openaiResponsesAccountService },
    { type: 'azure-openai', service: azureOpenaiAccountService },
    { type: 'droid', service: droidAccountService }
  ]
}

/**
 * 获取账户类型的显示名称
 * @param {string} accountType - 账户类型
 * @returns {string} 显示名称
 */
function getAccountTypeName(accountType) {
  const nameMap = {
    'claude-official': 'Claude Official',
    'claude-console': 'Claude Console',
    gemini: 'Gemini',
    bedrock: 'AWS Bedrock',
    ccr: 'CCR',
    'openai-responses': 'OpenAI Responses',
    'azure-openai': 'Azure OpenAI',
    droid: 'Droid (Factory.ai)'
  }
  return nameMap[accountType] || accountType
}

module.exports = {
  getDefaultModelForAccountType,
  getAccountService,
  getAllAccountServices,
  getAccountTypeName
}
