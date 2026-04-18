const logger = require('../utils/logger')

/**
 * 模型服务
 * 管理系统支持的 AI 模型列表
 * 与 pricingService 独立，专注于"支持哪些模型"而不是"如何计费"
 */
class ModelService {
  constructor() {
    this.supportedModels = this.getDefaultModels()
  }

  /**
   * 初始化模型服务
   */
  async initialize() {
    const totalModels = Object.values(this.supportedModels).reduce(
      (sum, config) => sum + config.models.length,
      0
    )
    logger.success(`Model service initialized with ${totalModels} models`)
  }

  /**
   * 获取支持的模型配置
   */
  getDefaultModels() {
    return {
      claude: {
        provider: 'anthropic',
        description: 'Claude models from Anthropic',
        models: [
          'claude-opus-4-7',
          'claude-opus-4-5-20251101',
          'claude-haiku-4-5-20251001',
          'claude-sonnet-4-5-20250929',
          'claude-opus-4-1-20250805',
          'claude-sonnet-4-20250514',
          'claude-opus-4-20250514',
          'claude-3-7-sonnet-20250219',
          'claude-3-5-sonnet-20241022',
          'claude-3-5-haiku-20241022',
          'claude-3-opus-20240229',
          'claude-3-haiku-20240307'
        ]
      },
      openai: {
        provider: 'openai',
        description: 'OpenAI GPT models',
        models: [
          'gpt-5.1-2025-11-13',
          'gpt-5.1-codex-mini',
          'gpt-5.1-codex',
          'gpt-5.1-codex-max',
          'gpt-5-2025-08-07',
          'gpt-5-codex',
          'gpt-5.3-codex',
          'gpt-5.3-codex-spark',
          'gpt-5.4',
          'gpt-5.4-pro'
        ]
      },
      gemini: {
        provider: 'google',
        description: 'Google Gemini models',
        models: [
          'gemini-2.5-pro',
          'gemini-3-pro-preview',
          'gemini-3.1-pro-preview',
          'gemini-2.5-flash'
        ]
      }
    }
  }

  /**
   * 获取所有支持的模型（OpenAI API 格式）
   */
  getAllModels() {
    const models = []
    const now = Math.floor(Date.now() / 1000)

    for (const [_service, config] of Object.entries(this.supportedModels)) {
      for (const modelId of config.models) {
        models.push({
          id: modelId,
          object: 'model',
          created: now,
          owned_by: config.provider
        })
      }
    }

    return models.sort((a, b) => {
      // 先按 provider 排序，再按 model id 排序
      if (a.owned_by !== b.owned_by) {
        return a.owned_by.localeCompare(b.owned_by)
      }
      return a.id.localeCompare(b.id)
    })
  }

  /**
   * 按 provider 获取模型
   * @param {string} provider - 'anthropic', 'openai', 'google' 等
   */
  getModelsByProvider(provider) {
    return this.getAllModels().filter((m) => m.owned_by === provider)
  }

  /**
   * 检查模型是否被支持
   * @param {string} modelId - 模型 ID
   */
  isModelSupported(modelId) {
    if (!modelId) {
      return false
    }
    return this.getAllModels().some((m) => m.id === modelId)
  }

  /**
   * 获取模型的 provider
   * @param {string} modelId - 模型 ID
   */
  getModelProvider(modelId) {
    const model = this.getAllModels().find((m) => m.id === modelId)
    return model ? model.owned_by : null
  }

  /**
   * 获取服务状态
   */
  getStatus() {
    const totalModels = Object.values(this.supportedModels).reduce(
      (sum, config) => sum + config.models.length,
      0
    )

    return {
      initialized: true,
      totalModels,
      providers: Object.keys(this.supportedModels)
    }
  }

  /**
   * 清理资源（保留接口兼容性）
   */
  cleanup() {
    logger.debug('📋 Model service cleanup (no-op)')
  }
}

module.exports = new ModelService()
