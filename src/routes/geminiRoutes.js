/**
 * Gemini API 路由模块（精简版）
 *
 * 该模块只包含 geminiRoutes 独有的路由：
 * - /messages - OpenAI 兼容格式消息处理
 * - /models - 模型列表
 * - /usage - 使用统计
 * - /key-info - API Key 信息
 * - /v1internal:listExperiments - 实验列表
 * - /v1beta/models/:modelName:listExperiments - 带模型参数的实验列表
 *
 * 其他标准 Gemini API 路由由 standardGeminiRoutes.js 处理。
 * 所有处理函数都从 geminiHandlers.js 导入，以避免代码重复。
 */

const express = require('express')
const router = express.Router()
const { authenticateApiKey } = require('../middleware/auth')

// 从 handlers/geminiHandlers.js 导入所有处理函数
const {
  handleMessages,
  handleModels,
  handleUsage,
  handleKeyInfo,
  handleSimpleEndpoint,
  // 以下函数需要导出供其他模块使用（如 unified.js）
  handleGenerateContent,
  handleStreamGenerateContent,
  handleLoadCodeAssist,
  handleOnboardUser,
  handleCountTokens,
  handleStandardGenerateContent,
  handleStandardStreamGenerateContent,
  ensureGeminiPermissionMiddleware
} = require('../handlers/geminiHandlers')

// ============================================================================
// OpenAI 兼容格式路由
// ============================================================================

/**
 * POST /messages
 * OpenAI 兼容格式的消息处理端点
 */
router.post('/messages', authenticateApiKey, handleMessages)

// ============================================================================
// 模型和信息路由
// ============================================================================

/**
 * GET /models
 * 获取可用模型列表
 */
router.get('/models', authenticateApiKey, handleModels)

/**
 * GET /usage
 * 获取使用情况统计
 */
router.get('/usage', authenticateApiKey, handleUsage)

/**
 * GET /key-info
 * 获取 API Key 信息
 */
router.get('/key-info', authenticateApiKey, handleKeyInfo)

// ============================================================================
// v1internal 独有路由（listExperiments）
// ============================================================================

/**
 * POST /v1internal:listExperiments
 * 列出实验（只有 geminiRoutes 定义此路由）
 */
router.post(
  '/v1internal\\:listExperiments',
  authenticateApiKey,
  handleSimpleEndpoint('listExperiments')
)

/**
 * POST /v1beta/models/:modelName:listExperiments
 * 带模型参数的实验列表（只有 geminiRoutes 定义此路由）
 */
router.post(
  '/v1beta/models/:modelName\\:listExperiments',
  authenticateApiKey,
  handleSimpleEndpoint('listExperiments')
)

// ============================================================================
// 导出
// ============================================================================

module.exports = router

// 导出处理函数供其他模块使用（如 unified.js、standardGeminiRoutes.js）
module.exports.handleLoadCodeAssist = handleLoadCodeAssist
module.exports.handleOnboardUser = handleOnboardUser
module.exports.handleCountTokens = handleCountTokens
module.exports.handleGenerateContent = handleGenerateContent
module.exports.handleStreamGenerateContent = handleStreamGenerateContent
module.exports.handleStandardGenerateContent = handleStandardGenerateContent
module.exports.handleStandardStreamGenerateContent = handleStandardStreamGenerateContent
module.exports.ensureGeminiPermissionMiddleware = ensureGeminiPermissionMiddleware
