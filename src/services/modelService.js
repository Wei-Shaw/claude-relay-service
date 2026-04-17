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
   * 获取有活跃账户支持的模型（OpenAI API 格式）
   * 遍历所有账户类型，收集活跃账户模型映射中定义的模型
   */
  async getAvailableModels() {
    const now = Math.floor(Date.now() / 1000)
    const modelSet = new Set()

    // 所有账户类型服务：[懒加载函数, 平台名]
    const accountServices = [
      [() => require('./account/claudeAccountService'), 'anthropic'],
      [() => require('./account/claudeConsoleAccountService'), 'anthropic'],
      [() => require('./account/openaiAccountService'), 'openai'],
      [() => require('./account/openaiResponsesAccountService'), 'openai'],
      [() => require('./account/geminiAccountService'), 'google'],
      [() => require('./account/geminiApiAccountService'), 'google'],
      [() => require('./account/bedrockAccountService'), 'anthropic'],
      [() => require('./account/azureOpenaiAccountService'), 'openai'],
      [() => require('./account/ccrAccountService'), 'anthropic'],
      [() => require('./account/droidAccountService'), 'anthropic']
    ]

    const providerModels = {}

    for (const [getService, provider] of accountServices) {
      try {
        const service = getService()
        const accounts = await service.getAllAccounts()
        const activeAccounts = Array.isArray(accounts)
          ? accounts.filter((a) => a.isActive)
          : (accounts?.data || []).filter((a) => a.isActive)

        for (const account of activeAccounts) {
          // 有 supportedModels/model_mapping 的账户（如 claude-console, ccr）
          const raw = account.supportedModels || account.model_mapping
          if (raw) {
            const mapping = typeof raw === 'string' ? JSON.parse(raw) : raw
            const keys = Array.isArray(mapping) ? mapping : Object.keys(mapping || {})
            for (const modelId of keys) {
              modelSet.add(modelId)
              if (!providerModels[modelId]) {
                providerModels[modelId] = provider
              }
            }
          } else {
            // 没有 model mapping 的标准账户，记录 provider 有活跃账户
            if (!providerModels._activeProviders) {
              providerModels._activeProviders = new Set()
            }
            providerModels._activeProviders.add(provider)
          }
        }
      } catch (err) {
        // 服务可能不存在，忽略
      }
    }

    // 构建结果：来自模型映射的模型 + 静态列表中有活跃 provider 的模型
    const result = []
    const addedIds = new Set()

    // 先添加模型映射中的模型
    for (const modelId of modelSet) {
      result.push({
        id: modelId,
        object: 'model',
        created: now,
        owned_by: providerModels[modelId] || 'unknown'
      })
      addedIds.add(modelId)
    }

    // 再添加静态列表中，有活跃标准账户（无 model mapping）的 provider 的模型
    const activeProviders = providerModels._activeProviders
    if (activeProviders && activeProviders.size > 0) {
      for (const model of this.getAllModels()) {
        if (activeProviders.has(model.owned_by) && !addedIds.has(model.id)) {
          result.push(model)
          addedIds.add(model.id)
        }
      }
    }

    // 如果结果为空（无任何活跃账户），回退到全部静态模型
    if (result.length === 0) {
      return this.getAllModels()
    }

    return result.sort((a, b) => {
      if (a.owned_by !== b.owned_by) return a.owned_by.localeCompare(b.owned_by)
      return a.id.localeCompare(b.id)
    })
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
