const logger = require('../utils/logger')
const redis = require('../models/redis')
const { RedisKeys, LIMITS } = require('../constants/redisKeys')

// litellm_provider -> OpenAI /v1/models 的 owned_by。
// 纯函数:输入 litellm 的 provider 字符串,输出归一名;未识别的原样返回
const normalizeProvider = (litellmProvider) => {
  // 类型防御：定价源是管理端可配的任意远端 JSON（系统边界），
  // litellm_provider 可能是数字/数组/对象。直接调 .startsWith() 会抛 TypeError，
  // 让「可导入模型」接口 500、管理页整块加载失败。
  if (typeof litellmProvider !== 'string' || !litellmProvider) {
    return 'imported'
  }
  // vertex_ai-language-models / vertex_ai-embedding-models 等一律归 google
  if (litellmProvider.startsWith('vertex_ai')) {
    return 'google'
  }
  const alias = {
    gemini: 'google',
    'text-completion-openai': 'openai'
  }
  return alias[litellmProvider] || litellmProvider
}

// 只导入对话类模型:embedding/audio/image 走不同的请求形态,放进 /v1/models 会误导客户端
const IMPORTABLE_MODES = new Set(['chat', 'responses', 'completion'])

/**
 * 模型服务
 * 管理系统支持的 AI 模型列表
 * 与 pricingService 独立，专注于"支持哪些模型"而不是"如何计费"
 */
class ModelService {
  constructor() {
    this.supportedModels = this.getDefaultModels()
    // 管理端从定价源导入的模型(modelId -> { provider })。
    // L1 内存快照,权威源在 Redis system:imported_models;条目有 LIMITS.importedModels 上界。
    this.importedModels = new Map()
  }

  /**
   * 初始化模型服务
   */
  async initialize() {
    await this.loadImportedModels()

    const totalModels = Object.values(this.supportedModels).reduce(
      (sum, config) => sum + config.models.length,
      0
    )
    logger.success(
      `Model service initialized with ${totalModels} built-in + ${this.importedModels.size} imported models`
    )
  }

  /**
   * 从 Redis 载入导入的模型目录。
   * Redis 不可用时留空即可——内置列表照常可用,不为此中断启动
   */
  async loadImportedModels() {
    try {
      const client = redis.getClient()
      if (!client) {
        logger.warn('⚠️ Redis 未连接，跳过导入模型目录加载')
        return
      }
      const stored = await client.hgetall(RedisKeys.importedModels)
      this.importedModels = new Map()
      for (const [modelId, raw] of Object.entries(stored || {})) {
        try {
          this.importedModels.set(modelId, JSON.parse(raw))
        } catch (error) {
          logger.warn(`⚠️ 导入模型条目解析失败，跳过 modelId=${modelId}`)
          console.error(error)
        }
      }
      logger.info(`📋 已载入 ${this.importedModels.size} 个导入模型`)
    } catch (error) {
      logger.error('❌ 载入导入模型目录失败:', error)
      console.error(error)
    }
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
          'gpt-5.3-codex',
          'gpt-5.3-codex-spark',
          'gpt-5.4',
          'gpt-5.4-pro',
          'gpt-5.6-sol',
          'gpt-5.6-terra',
          'gpt-5.6-luna'
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
    const seen = new Set()

    for (const [_service, config] of Object.entries(this.supportedModels)) {
      for (const modelId of config.models) {
        seen.add(modelId)
        models.push({
          id: modelId,
          object: 'model',
          created: now,
          owned_by: config.provider
        })
      }
    }

    // 叠加导入模型:内置项优先,同名不重复(内置的 provider 归类更准)
    for (const [modelId, meta] of this.importedModels) {
      if (seen.has(modelId)) {
        continue
      }
      seen.add(modelId)
      models.push({
        id: modelId,
        object: 'model',
        created: now,
        owned_by: meta.provider || 'imported'
      })
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
   * 列出定价源里「可导入」的模型:定价数据有、但当前目录还没有的对话类模型。
   * 管理端据此挑选后调 importModels —— 对应 llysc 的「远端导入模型」流程。
   */
  listImportableModels(pricingData) {
    const existing = new Set(this.getAllModels().map((m) => m.id))
    const candidates = []

    for (const [modelId, meta] of Object.entries(pricingData || {})) {
      if (!meta || typeof meta !== 'object') {
        continue
      }
      if (!IMPORTABLE_MODES.has(meta.mode)) {
        continue
      }
      if (existing.has(modelId)) {
        continue
      }
      candidates.push({
        id: modelId,
        provider: normalizeProvider(meta.litellm_provider),
        mode: meta.mode,
        maxTokens: meta.max_tokens || null,
        inputCostPerToken: meta.input_cost_per_token ?? null,
        outputCostPerToken: meta.output_cost_per_token ?? null
      })
    }

    return candidates.sort((a, b) => {
      if (a.provider !== b.provider) {
        return a.provider.localeCompare(b.provider)
      }
      return a.id.localeCompare(b.id)
    })
  }

  /**
   * 导入指定模型到目录(写 Redis + 刷内存)。
   * 幂等:已存在的跳过;内置已有的不导入(内置优先)
   */
  async importModels(modelIds, pricingData) {
    if (!Array.isArray(modelIds) || modelIds.length === 0) {
      throw new Error('请至少选择一个模型')
    }

    const builtIn = new Set()
    for (const config of Object.values(this.supportedModels)) {
      for (const modelId of config.models) {
        builtIn.add(modelId)
      }
    }

    const toWrite = {}
    const skipped = []
    // 非对话类模型被服务端拒收,与"已存在跳过"区分开,便于管理端看清原因
    const rejected = []
    const now = new Date().toISOString()

    for (const modelId of new Set(modelIds)) {
      const trimmed = String(modelId || '').trim()
      if (!trimmed) {
        continue
      }
      if (builtIn.has(trimmed) || this.importedModels.has(trimmed)) {
        skipped.push(trimmed)
        continue
      }
      const meta = pricingData?.[trimmed]
      if (!meta) {
        skipped.push(trimmed)
        continue
      }
      // 服务端复验 mode：listImportableModels 的过滤是给界面用的，
      // 接口可被直接调用，不能只信入参——否则 embedding/audio/image 会被写进目录并暴露给客户端
      if (!IMPORTABLE_MODES.has(meta.mode)) {
        rejected.push(trimmed)
        continue
      }
      toWrite[trimmed] = JSON.stringify({
        provider: normalizeProvider(meta.litellm_provider),
        mode: meta.mode || 'chat',
        importedAt: now
      })
    }

    const writeCount = Object.keys(toWrite).length
    if (writeCount === 0) {
      const reason = rejected.length > 0 ? `（${rejected.length} 个非对话类模型被拒绝）` : ''
      return {
        imported: 0,
        skipped: skipped.length,
        rejected: rejected.length,
        message: `没有可导入的新模型${reason}`
      }
    }

    // 确认真有要写的再取连接:纯参数问题不该表现为"Redis 未连接"
    const client = redis.getClientSafe()

    if (this.importedModels.size + writeCount > LIMITS.importedModels) {
      throw new Error(
        `导入后将超过模型目录上限 ${LIMITS.importedModels}（当前 ${this.importedModels.size}）`
      )
    }

    // 单次 hset 批量写入,不在循环里逐条往返
    await client.hset(RedisKeys.importedModels, toWrite)
    await this.loadImportedModels()

    logger.info(
      `📋 导入模型 ${writeCount} 个，跳过 ${skipped.length} 个，拒收 ${rejected.length} 个非对话类`
    )
    const rejectedNote = rejected.length > 0 ? `，拒收 ${rejected.length} 个非对话类模型` : ''
    return {
      imported: writeCount,
      skipped: skipped.length,
      rejected: rejected.length,
      message: `导入 ${writeCount} 个，跳过 ${skipped.length} 个${rejectedNote}`
    }
  }

  /**
   * 移除导入的模型(只能删导入项,内置列表不可删)
   */
  async removeImportedModels(modelIds) {
    if (!Array.isArray(modelIds) || modelIds.length === 0) {
      throw new Error('请至少选择一个模型')
    }

    const targets = [...new Set(modelIds.map((id) => String(id || '').trim()))].filter(
      (id) => id && this.importedModels.has(id)
    )

    if (targets.length === 0) {
      return { removed: 0, message: '没有可移除的导入模型' }
    }

    const client = redis.getClientSafe()

    // 一条 hdel 删完,不逐条往返
    await client.hdel(RedisKeys.importedModels, ...targets)
    await this.loadImportedModels()

    logger.info(`📋 移除导入模型 ${targets.length} 个`)
    return { removed: targets.length, message: `已移除 ${targets.length} 个模型` }
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
      builtInModels: totalModels,
      importedModels: this.importedModels.size,
      totalModels: this.getAllModels().length,
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
